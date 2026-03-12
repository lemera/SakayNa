// screens/driver/DriverWalletScreen.js
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { LineChart } from "react-native-chart-kit";

export default function DriverWalletScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get("window").width - 40;
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [driverId, setDriverId] = useState(null);
  const [driverName, setDriverName] = useState("");
  
  // Wallet data
  const [walletData, setWalletData] = useState({
    balance: 0,
    total_deposits: 0,
    total_withdrawals: 0,
    cash_earnings: 0,
    gcash_earnings: 0,
    wallet_earnings: 0,
  });
  
  // Points data
  const [pointsData, setPointsData] = useState({
    total_points_earned: 0,
    points_from_rides: 0,
    points_from_referrals: 0,
    points_from_bonuses: 0,
    points_value: 0,
  });
  
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [weeklyEarnings, setWeeklyEarnings] = useState([0, 0, 0, 0, 0, 0, 0]);
  const [monthlyEarnings, setMonthlyEarnings] = useState(0);
  const [totalTrips, setTotalTrips] = useState(0);
  
  // Withdrawal modal
  const [withdrawModal, setWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawMethod, setWithdrawMethod] = useState("gcash");
  const [gcashNumber, setGcashNumber] = useState("");

  // Fetch driver ID
  useFocusEffect(
    useCallback(() => {
      const getDriverId = async () => {
        try {
          const id = await AsyncStorage.getItem("user_id");
          setDriverId(id);
          if (id) await fetchDriverName(id);
        } catch (error) {
          console.log("Error getting driver ID:", error);
        }
      };
      getDriverId();
    }, [])
  );

  // Fetch all data when driverId changes
  useEffect(() => {
    if (driverId) loadWalletData();
  }, [driverId]);

  const fetchDriverName = async (id) => {
    try {
      const { data, error } = await supabase
        .from("drivers")
        .select("first_name, last_name")
        .eq("id", id)
        .single();

      if (error) throw error;
      if (data) setDriverName(`${data.first_name} ${data.last_name}`);
    } catch (err) {
      console.log("Error fetching driver name:", err.message);
    }
  };

  const loadWalletData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchWalletBalance(),
        fetchPointsData(),
        fetchTransactions(),
        fetchWeeklyEarnings(),
        fetchStatistics(),
      ]);
    } catch (err) {
      console.log("Error loading wallet data:", err);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadWalletData();
    setRefreshing(false);
  };

  const fetchWalletBalance = async () => {
    try {
      const { data, error } = await supabase
        .from("driver_wallets")
        .select("*")
        .eq("driver_id", driverId)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setWalletData({
          balance: Number(data.balance) || 0,
          total_deposits: Number(data.total_deposits) || 0,
          total_withdrawals: Number(data.total_withdrawals) || 0,
          cash_earnings: Number(data.cash_earnings) || 0,
          gcash_earnings: Number(data.gcash_earnings) || 0,
          wallet_earnings: Number(data.wallet_earnings) || 0,
        });
      } else {
        // Create wallet if it doesn't exist
        await supabase.from("driver_wallets").insert({
          driver_id: driverId,
          balance: 0,
          total_deposits: 0,
          total_withdrawals: 0,
          cash_earnings: 0,
          gcash_earnings: 0,
          wallet_earnings: 0,
          created_at: new Date(),
          updated_at: new Date()
        });
        
        setWalletData({
          balance: 0,
          total_deposits: 0,
          total_withdrawals: 0,
          cash_earnings: 0,
          gcash_earnings: 0,
          wallet_earnings: 0,
        });
      }
    } catch (err) {
      console.log("Error fetching wallet:", err.message);
    }
  };

  const fetchPointsData = async () => {
    try {
      const { data: walletPayments, error: paymentsError } = await supabase
        .from("bookings")
        .select("points_used")
        .eq("driver_id", driverId)
        .eq("status", "completed")
        .eq("payment_type", "wallet");

      if (paymentsError) throw paymentsError;
      
      const pointsFromRides = walletPayments?.reduce((sum, b) => sum + (Number(b.points_used) || 0), 0) || 0;
      const pointsValue = pointsFromRides * 0.1;
      
      setPointsData({
        total_points_earned: pointsFromRides,
        points_from_rides: pointsFromRides,
        points_from_referrals: 0,
        points_from_bonuses: 0,
        points_value: pointsValue,
      });
      
    } catch (err) {
      console.log("Error fetching points data:", err.message);
    }
  };

  const fetchTransactions = async () => {
    try {
      // Get completed bookings
      const { data: bookings, error: bookingsError } = await supabase
        .from("bookings")
        .select(`
          id,
          actual_fare,
          created_at,
          pickup_location,
          dropoff_location,
          payment_type,
          points_used
        `)
        .eq("driver_id", driverId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(50);

      if (bookingsError) throw bookingsError;

      // Format booking transactions
      const bookingTransactions = (bookings || []).map(b => {
        const paymentMethod = b.payment_type || "cash";
        const pointsUsed = Number(b.points_used) || 0;
        
        let description = `${(b.pickup_location || "Pickup").split(",")[0]} → ${(b.dropoff_location || "Dropoff").split(",")[0]}`;
        if (paymentMethod === "wallet" && pointsUsed > 0) {
          description += ` (${pointsUsed} pts)`;
        }
        
        return {
          id: `booking-${b.id}`,
          type: "earning",
          amount: Number(b.actual_fare) || 0,
          description,
          date: b.created_at,
          paymentMethod,
          points: pointsUsed,
        };
      });

      // Get other transactions
      const { data: transactions, error: transError } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", driverId)
        .eq("user_type", "driver")
        .order("created_at", { ascending: false })
        .limit(50);

      if (transError) throw transError;

      // Format transaction records
      const transactionItems = (transactions || []).map(t => {
        const metadata = t.metadata || {};
        const pointsInvolved = metadata.points_used || 0;
        
        let description = t.type === "topup" ? "Added via GCash" :
                         t.type === "withdrawal" ? `Withdrawn to ${metadata.method || "GCash"}` :
                         t.type === "mission_bonus" ? "🏆 Weekly Mission Bonus" : 
                         t.type === "points_earning" ? `⭐ Earned ${pointsInvolved} points` :
                         t.description || t.type;
        
        return {
          id: `trans-${t.id}`,
          type: t.type,
          amount: t.type === "withdrawal" ? -Number(t.amount) : Number(t.amount),
          description,
          date: t.created_at,
          paymentMethod: metadata.method || "gcash",
          points: pointsInvolved,
        };
      });

      // Combine and sort all transactions
      const allTransactions = [
        ...bookingTransactions, 
        ...transactionItems
      ].sort((a, b) => new Date(b.date) - new Date(a.date));

      setRecentTransactions(allTransactions);
    } catch (err) {
      console.log("Error fetching transactions:", err.message);
    }
  };

  const fetchWeeklyEarnings = async () => {
    try {
      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay() + 1);
      startOfWeek.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("bookings")
        .select("actual_fare, ride_completed_at")
        .eq("driver_id", driverId)
        .eq("status", "completed")
        .gte("ride_completed_at", startOfWeek.toISOString())
        .order("ride_completed_at", { ascending: true });

      if (error) throw error;

      const dailyEarnings = [0, 0, 0, 0, 0, 0, 0];

      data?.forEach(booking => {
        if (booking.ride_completed_at) {
          const date = new Date(booking.ride_completed_at);
          let dayIndex = date.getDay();
          dayIndex = dayIndex === 0 ? 6 : dayIndex - 1;
          dailyEarnings[dayIndex] += Number(booking.actual_fare) || 0;
        }
      });

      setWeeklyEarnings(dailyEarnings);
    } catch (err) {
      console.log("Error fetching weekly earnings:", err.message);
    }
  };

  const fetchStatistics = async () => {
    try {
      // Get monthly earnings
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      
      const { data: monthlyData, error: monthlyError } = await supabase
        .from("bookings")
        .select("actual_fare")
        .eq("driver_id", driverId)
        .eq("status", "completed")
        .gte("ride_completed_at", startOfMonth.toISOString());

      if (monthlyError) throw monthlyError;

      const monthlyTotal = monthlyData?.reduce((sum, b) => sum + (Number(b.actual_fare) || 0), 0) || 0;
      setMonthlyEarnings(monthlyTotal);

      // Get total trips
      const { data: tripsData, error: tripsError } = await supabase
        .from("bookings")
        .select("id")
        .eq("driver_id", driverId)
        .eq("status", "completed");

      if (tripsError) throw tripsError;
      setTotalTrips(tripsData?.length || 0);

    } catch (err) {
      console.log("Error fetching statistics:", err.message);
    }
  };

  const handleWithdraw = () => {
    const amount = parseFloat(withdrawAmount);
    
    if (!withdrawAmount || isNaN(amount) || amount < 100) {
      Alert.alert("Error", "Minimum withdrawal is ₱100");
      return;
    }

    if (amount > walletData.balance) {
      Alert.alert("Error", `Insufficient balance. Available: ₱${walletData.balance.toFixed(2)}`);
      return;
    }

    if (withdrawMethod === "gcash" && !/^09\d{9}$/.test(gcashNumber)) {
      Alert.alert("Error", "Please enter a valid GCash number (11 digits starting with 09)");
      return;
    }

    Alert.alert(
      "Confirm Withdrawal",
      `Withdraw ₱${amount.toFixed(2)} to ${withdrawMethod === "gcash" ? `GCash (${gcashNumber})` : "Cash (Pick up at branch)"}?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", onPress: () => processWithdrawal(amount) },
      ]
    );
  };

  const processWithdrawal = async (amount) => {
    try {
      // Update wallet
      await supabase
        .from("driver_wallets")
        .update({
          balance: walletData.balance - amount,
          total_withdrawals: (walletData.total_withdrawals || 0) + amount,
          updated_at: new Date()
        })
        .eq("driver_id", driverId);

      // Create transaction
      await supabase
        .from("transactions")
        .insert({
          user_id: driverId,
          user_type: "driver",
          type: "withdrawal",
          amount: amount,
          status: "pending",
          created_at: new Date(),
          metadata: {
            method: withdrawMethod,
            gcash_number: withdrawMethod === "gcash" ? gcashNumber : null,
          },
        });

      Alert.alert("✅ Withdrawal Request Submitted", `Amount: ₱${amount.toFixed(2)} will be processed.`);
      
      setWithdrawModal(false);
      setWithdrawAmount("");
      setGcashNumber("");
      await loadWalletData();
    } catch (err) {
      console.log("Withdrawal error:", err.message);
      Alert.alert("Error", "Failed to process withdrawal. Please try again.");
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  };

  const getTransactionIcon = (type, paymentMethod) => {
    if (type === "earning") {
      switch (paymentMethod) {
        case "gcash": return { name: "phone-portrait", color: "#00579F", bg: "#E6F0FF" };
        case "cash": return { name: "cash", color: "#10B981", bg: "#D1FAE5" };
        case "wallet": return { name: "star", color: "#F59E0B", bg: "#FEF3C7" };
        default: return { name: "wallet", color: "#183B5C", bg: "#E6E9F0" };
      }
    } else if (type === "topup") {
      return { name: "arrow-up-outline", color: "#10B981", bg: "#D1FAE5" };
    } else if (type === "withdrawal") {
      return { name: "arrow-down-outline", color: "#EF4444", bg: "#FEE2E2" };
    } else if (type === "mission_bonus") {
      return { name: "trophy", color: "#F59E0B", bg: "#FEF3C7" };
    } else {
      return { name: "star", color: "#F59E0B", bg: "#FEF3C7" };
    }
  };

  const totalEarnings = walletData.cash_earnings + walletData.wallet_earnings;

  if (loading && !refreshing) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F5F7FA" }}>
        <ActivityIndicator size="large" color="#183B5C" />
        <Text style={{ marginTop: 10, color: "#666" }}>Loading your wallet...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F5F7FA" }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={{
        backgroundColor: "#183B5C",
        paddingTop: insets.top + 20,
        paddingBottom: 30,
        paddingHorizontal: 20,
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
      }}>
        <Pressable onPress={() => navigation.goBack()} style={{ position: "absolute", top: insets.top + 10, left: 20 }}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </Pressable>
        <Text style={{ fontSize: 24, fontWeight: "bold", color: "#FFF", marginTop: 20 }}>My Wallet</Text>
        <Text style={{ fontSize: 14, color: "#FFB37A", marginTop: 5 }}>{driverName || "Driver"}</Text>
      </View>



      {/* Main Balance Card */}
      <View style={{
        marginHorizontal: 20,
        backgroundColor: "#FFF",
        borderRadius: 24,
        padding: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 5,
      }}>
        {/* Balance */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={{ fontSize: 14, color: "#666" }}>Points Earned</Text>
            <Text style={{ fontSize: 36, fontWeight: "bold", color: "#183B5C" }}>
                <Ionicons name="star" size={30} color="#F59E0B" />

              {(pointsData.total_points_earned || 0).toFixed(2)}
            </Text>
          </View>
          <View style={{ backgroundColor: "#E6F7E6", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
            <Text style={{ fontSize: 12, color: "#2E7D32", fontWeight: "600" }}>Can Withdraw</Text>
          </View>
        </View>

        {/* Quick Stats Row */}
        <View style={{ flexDirection: "row", marginTop: 20, paddingTop: 15, borderTopWidth: 1, borderTopColor: "#F3F4F6" }}>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: "#666" }}>Total Trips</Text>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#333" }}>{totalTrips}</Text>
          </View>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: "#666" }}>This Month</Text>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#333" }}>₱{(monthlyEarnings || 0).toFixed(0)}</Text>
          </View>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: "#666" }}>Total Earnings</Text>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#333" }}>₱{(totalEarnings || 0).toFixed(0)}</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={{ flexDirection: "row", marginTop: 20, gap: 10 }}>
          <Pressable
            style={{ flex: 1, backgroundColor: "#183B5C", padding: 12, borderRadius: 12, alignItems: "center", flexDirection: "row", justifyContent: "center" }}
            onPress={() => setWithdrawModal(true)}
          >
            <Ionicons name="arrow-down-outline" size={18} color="#FFF" />
            <Text style={{ color: "#FFF", fontWeight: "600", marginLeft: 5 }}>Withdraw</Text>
          </Pressable>
          
          <Pressable
            style={{ flex: 1, backgroundColor: "#FFB37A", padding: 12, borderRadius: 12, alignItems: "center", flexDirection: "row", justifyContent: "center" }}
            onPress={() => Alert.alert("Top-up", "Please visit our office to add funds.")}
          >
            <Ionicons name="arrow-up-outline" size={18} color="#183B5C" />
            <Text style={{ color: "#183B5C", fontWeight: "600", marginLeft: 5 }}>Subscribe</Text>
          </Pressable>
        </View>
      </View>

      {/* Earnings Chart */}
      <View style={{ marginHorizontal: 20, marginTop: 20, backgroundColor: "#FFF", borderRadius: 24, padding: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: "bold", color: "#333", marginBottom: 15 }}>Weekly Earnings</Text>
        {weeklyEarnings.some(day => day > 0) ? (
          <LineChart
            data={{
              labels: ["M", "T", "W", "T", "F", "S", "S"],
              datasets: [{ data: weeklyEarnings }],
            }}
            width={screenWidth}
            height={160}
            yAxisLabel="₱"
            chartConfig={{
              backgroundColor: "#FFF",
              backgroundGradientFrom: "#FFF",
              backgroundGradientTo: "#FFF",
              decimalPlaces: 0,
              color: () => `#183B5C`,
              style: { borderRadius: 16 },
            }}
            bezier
            style={{ borderRadius: 16 }}
          />
        ) : (
          <View style={{ height: 160, justifyContent: "center", alignItems: "center" }}>
            <Text style={{ color: "#9CA3AF" }}>No earnings this week</Text>
          </View>
        )}
      </View>

{/* Earnings Breakdown */}
<View style={{ marginHorizontal: 20, marginTop: 20, backgroundColor: "#FFF", borderRadius: 24, padding: 20 }}>
  <Text style={{ fontSize: 16, fontWeight: "bold", color: "#333", marginBottom: 15 }}>Earnings Breakdown</Text>
  <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
    
    {/* Cash Earnings */}
    <View style={{ alignItems: "center" }}>
      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#D1FAE5", justifyContent: "center", alignItems: "center" }}>
        <Ionicons name="cash" size={24} color="#10B981" />
      </View>
      <Text style={{ fontSize: 18, fontWeight: "bold", color: "#10B981", marginTop: 8 }}>
        ₱{(walletData.cash_earnings || 0).toFixed(0)}
      </Text>
      <Text style={{ fontSize: 12, color: "#666" }}>Cash Payments</Text>
    </View>

    {/* Wallet Payments (Cash Value) */}

    {/* Points Earned (if may points) */}
    {pointsData.points_from_rides > 0 && (
      <View style={{ alignItems: "center" }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#FEF3C7", justifyContent: "center", alignItems: "center" }}>
          <Ionicons name="star" size={24} color="#F59E0B" />
        </View>
        <Text style={{ fontSize: 18, fontWeight: "bold", color: "#F59E0B", marginTop: 8 }}>
          {pointsData.points_from_rides}
        </Text>
        <Text style={{ fontSize: 12, color: "#666" }}>Points Earned</Text>
        <Text style={{ fontSize: 10, color: "#F59E0B" }}>(₱{(pointsData.points_value || 0).toFixed(0)} value)</Text>
      </View>
    )}
  </View>

  {/* Explanation */}
  <View style={{ marginTop: 15, padding: 10, backgroundColor: "#F9FAFB", borderRadius: 12 }}>
    <Text style={{ fontSize: 12, color: "#4B5563" }}>
      <Text style={{ fontWeight: "bold" }}>• Cash Payments:</Text> Direct cash from passengers{'\n'}
      <Text style={{ fontWeight: "bold" }}>• Wallet Payments:</Text> Passengers paid using their wallet balance{'\n'}
      {pointsData.points_from_rides > 0 && (
        <><Text style={{ fontWeight: "bold" }}>• Points Earned:</Text> Bonus points from wallet payments (redeemable for rewards)</>
      )}
    </Text>
  </View>
</View>

      {/* Recent Transactions */}
      <View style={{ marginHorizontal: 20, marginTop: 20, backgroundColor: "#FFF", borderRadius: 24, padding: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: "bold", color: "#333", marginBottom: 15 }}>Recent Activity</Text>
        {recentTransactions.length === 0 ? (
          <View style={{ padding: 30, alignItems: "center" }}>
            <Ionicons name="receipt-outline" size={40} color="#D1D5DB" />
            <Text style={{ marginTop: 10, color: "#9CA3AF" }}>No transactions yet</Text>
          </View>
        ) : (
          recentTransactions.slice(0, 5).map((transaction, index) => {
            const icon = getTransactionIcon(transaction.type, transaction.paymentMethod);
            return (
              <View key={transaction.id || index} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: index === 4 ? 0 : 1, borderBottomColor: "#F3F4F6" }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: icon.bg, justifyContent: "center", alignItems: "center", marginRight: 12 }}>
                  <Ionicons name={icon.name} size={20} color={icon.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "500", color: "#333" }} numberOfLines={1}>
                    {transaction.description}
                  </Text>
                  <Text style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
                    {formatDate(transaction.date)}
                    {transaction.points > 0 && ` • ${transaction.points} pts`}
                  </Text>
                </View>
                <Text style={{ fontSize: 16, fontWeight: "bold", color: transaction.amount > 0 ? "#10B981" : "#EF4444" }}>
                  {transaction.amount > 0 ? "+" : ""}₱{Math.abs(transaction.amount).toFixed(2)}
                </Text>
              </View>
            );
          })
        )}
      </View>

      {/* Info Card */}
      <View style={{ marginHorizontal: 20, marginTop: 20, padding: 15, backgroundColor: "#F0F9FF", borderRadius: 16 }}>
        <Text style={{ fontSize: 12, color: "#4B5563" }}>
          • 💰 Balance: withdrawable funds from top-ups{'\n'}
          • 💵 Cash earnings: collect directly from passengers{'\n'}
          • ⭐ Points: 1 point = ₱0.10 value for rewards
        </Text>
      </View>
      <View style={{ height: 30 }} />

      {/* Withdrawal Modal */}
      <Modal visible={withdrawModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: "bold", color: "#333" }}>Withdraw Funds</Text>
              <Pressable onPress={() => setWithdrawModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </Pressable>
            </View>

            <Text style={{ fontSize: 14, color: "#666" }}>Available Balance</Text>
            <Text style={{ fontSize: 32, fontWeight: "bold", color: "#183B5C", marginBottom: 20 }}>
              ₱{(walletData.balance || 0).toFixed(2)}
            </Text>

            {/* Method Selection */}
            <View style={{ flexDirection: "row", marginBottom: 20, gap: 10 }}>
              <Pressable
                style={[{
                  flex: 1, padding: 12, borderRadius: 12, borderWidth: 2, alignItems: "center"
                }, withdrawMethod === "gcash" ? { borderColor: "#00579F", backgroundColor: "#E6F0FF" } : { borderColor: "#E5E7EB" }]}
                onPress={() => setWithdrawMethod("gcash")}
              >
                <Ionicons name="phone-portrait" size={24} color={withdrawMethod === "gcash" ? "#00579F" : "#9CA3AF"} />
                <Text style={{ fontSize: 12, color: withdrawMethod === "gcash" ? "#00579F" : "#666" }}>GCash</Text>
              </Pressable>
              <Pressable
                style={[{
                  flex: 1, padding: 12, borderRadius: 12, borderWidth: 2, alignItems: "center"
                }, withdrawMethod === "cash" ? { borderColor: "#10B981", backgroundColor: "#D1FAE5" } : { borderColor: "#E5E7EB" }]}
                onPress={() => setWithdrawMethod("cash")}
              >
                <Ionicons name="cash" size={24} color={withdrawMethod === "cash" ? "#10B981" : "#9CA3AF"} />
                <Text style={{ fontSize: 12, color: withdrawMethod === "cash" ? "#10B981" : "#666" }}>Cash</Text>
              </Pressable>
            </View>

            {/* GCash Number */}
            {withdrawMethod === "gcash" && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 8 }}>GCash Number</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 12 }}
                  placeholder="0917XXXXXXX"
                  keyboardType="phone-pad"
                  value={gcashNumber}
                  onChangeText={setGcashNumber}
                  maxLength={11}
                />
              </View>
            )}

            {/* Amount */}
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 8 }}>Amount (Min. ₱100)</Text>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}>
              <Text style={{ fontSize: 24, fontWeight: "bold", color: "#333", marginRight: 8 }}>₱</Text>
              <TextInput
                style={{ flex: 1, borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 12 }}
                placeholder="0.00"
                keyboardType="numeric"
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
              />
            </View>

            {/* Quick Amounts */}
            <View style={{ flexDirection: "row", marginBottom: 20, gap: 8 }}>
              {[100, 500, 1000, 2000].map(amount => (
                <Pressable key={amount} style={{ flex: 1, padding: 8, backgroundColor: "#F3F4F6", borderRadius: 8, alignItems: "center" }}
                  onPress={() => setWithdrawAmount(amount.toString())}>
                  <Text style={{ fontSize: 12, color: "#333" }}>₱{amount}</Text>
                </Pressable>
              ))}
            </View>

            {/* Withdraw Button */}
            <Pressable
              style={{
                backgroundColor: "#183B5C",
                padding: 16,
                borderRadius: 12,
                alignItems: "center",
                opacity: !withdrawAmount || parseFloat(withdrawAmount) < 100 || parseFloat(withdrawAmount) > walletData.balance ? 0.5 : 1,
              }}
              onPress={handleWithdraw}
              disabled={!withdrawAmount || parseFloat(withdrawAmount) < 100 || parseFloat(withdrawAmount) > walletData.balance}
            >
              <Text style={{ color: "#FFF", fontWeight: "600", fontSize: 16 }}>
                Withdraw ₱{withdrawAmount ? parseFloat(withdrawAmount).toFixed(2) : "0.00"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// Points