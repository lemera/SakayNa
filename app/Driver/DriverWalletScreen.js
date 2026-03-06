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
  
  // Wallet data - initialize with default values
  const [walletData, setWalletData] = useState({
    balance: 0,
    total_deposits: 0,
    total_withdrawals: 0,
    cash_earnings: 0,
    gcash_earnings: 0,
    wallet_earnings: 0,
  });
  
  // Computed values
  const [totalEarnings, setTotalEarnings] = useState(0);
  
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [weeklyEarnings, setWeeklyEarnings] = useState([0, 0, 0, 0, 0, 0, 0]);
  const [monthlyEarnings, setMonthlyEarnings] = useState(0);
  
  // Withdrawal modal
  const [withdrawModal, setWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawMethod, setWithdrawMethod] = useState("gcash");
  const [gcashNumber, setGcashNumber] = useState("");
  
  // Statistics
  const [totalTrips, setTotalTrips] = useState(0);
  const [averageFare, setAverageFare] = useState(0);
  const [peakDay, setPeakDay] = useState("");
  const [peakEarnings, setPeakEarnings] = useState(0);

  // Fetch driver ID
  useFocusEffect(
    useCallback(() => {
      const getDriverId = async () => {
        try {
          const id = await AsyncStorage.getItem("user_id");
          console.log("Driver ID from storage:", id);
          setDriverId(id);
          if (id) {
            await fetchDriverName(id);
          }
        } catch (error) {
          console.log("Error getting driver ID:", error);
        }
      };
      getDriverId();
    }, [])
  );

  // Fetch all data when driverId changes
  useEffect(() => {
    if (driverId) {
      console.log("Loading wallet data for driver:", driverId);
      loadWalletData();
    }
  }, [driverId]);

  const fetchDriverName = async (id) => {
    try {
      const { data, error } = await supabase
        .from("drivers")
        .select("first_name, last_name")
        .eq("id", id)
        .single();

      if (error) throw error;
      if (data) {
        setDriverName(`${data.first_name} ${data.last_name}`);
      }
    } catch (err) {
      console.log("Error fetching driver name:", err.message);
    }
  };

  const loadWalletData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchWalletBalance(),
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
      console.log("Fetching wallet for driver:", driverId);
      
      const { data, error } = await supabase
        .from("driver_wallets")
        .select("*")
        .eq("driver_id", driverId)
        .maybeSingle();

      if (error) throw error;
      
      console.log("Wallet data received:", data);
      
      if (data) {
        // Ensure all numeric values are properly parsed
        const wallet = {
          balance: Number(data.balance) || 0,
          total_deposits: Number(data.total_deposits) || 0,
          total_withdrawals: Number(data.total_withdrawals) || 0,
          cash_earnings: Number(data.cash_earnings) || 0,
          gcash_earnings: Number(data.gcash_earnings) || 0,
          wallet_earnings: Number(data.wallet_earnings) || 0,
        };
        
        setWalletData(wallet);
        
        // Calculate total earnings
        const total = wallet.cash_earnings + wallet.gcash_earnings + wallet.wallet_earnings;
        setTotalEarnings(total);
        
        console.log("Wallet state updated:", wallet);
        console.log("Total earnings:", total);
      } else {
        console.log("No wallet found, creating new wallet");
        // Create wallet if it doesn't exist
        const { error: insertError } = await supabase
          .from("driver_wallets")
          .insert({
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

        if (insertError) throw insertError;
        
        // Set default values
        setWalletData({
          balance: 0,
          total_deposits: 0,
          total_withdrawals: 0,
          cash_earnings: 0,
          gcash_earnings: 0,
          wallet_earnings: 0,
        });
        setTotalEarnings(0);
      }
    } catch (err) {
      console.log("Error fetching wallet:", err.message);
    }
  };

  const fetchTransactions = async () => {
    try {
      console.log("Fetching transactions for driver:", driverId);
      
      // Get completed bookings (earnings)
      const { data: bookings, error: bookingsError } = await supabase
        .from("bookings")
        .select(`
          id,
          actual_fare,
          created_at,
          pickup_location,
          dropoff_location,
          status,
          payment_method,
          payment_type,
          distance_km
        `)
        .eq("driver_id", driverId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(50);

      if (bookingsError) throw bookingsError;
      console.log("Bookings found:", bookings?.length || 0);

      // Format booking transactions
      const bookingTransactions = (bookings || []).map(b => {
        const paymentMethod = b.payment_type || b.payment_method || "cash";
        return {
          id: `booking-${b.id}`,
          type: "earning",
          category: "trip",
          amount: Number(b.actual_fare) || 0,
          description: `${(b.pickup_location || "Pickup").split(",")[0]} → ${(b.dropoff_location || "Dropoff").split(",")[0]}`,
          date: b.created_at,
          status: "completed",
          paymentMethod: paymentMethod,
          paymentIcon: paymentMethod === "gcash" ? "phone-portrait" : paymentMethod === "cash" ? "cash" : "wallet",
          paymentColor: paymentMethod === "gcash" ? "#00579F" : paymentMethod === "cash" ? "#10B981" : "#183B5C",
          distance: b.distance_km,
        };
      });

      // Get transactions from transactions table
      const { data: transactions, error: transError } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", driverId)
        .eq("user_type", "driver")
        .order("created_at", { ascending: false })
        .limit(50);

      if (transError) throw transError;
      console.log("Transactions found:", transactions?.length || 0);

      // Format transaction records
      const transactionItems = (transactions || []).map(t => {
        const metadata = t.metadata || {};
        return {
          id: `trans-${t.id}`,
          type: t.type,
          category: t.type === "topup" ? "balance" : t.type === "withdrawal" ? "balance" : "other",
          amount: t.type === "withdrawal" ? -Number(t.amount) : Number(t.amount),
          description: t.type === "topup" ? `Added via ${metadata.method || "GCash"}` :
                       t.type === "withdrawal" ? `Withdrawn to ${metadata.method || "GCash"}` :
                       t.type === "mission_bonus" ? "🏆 Weekly Mission Bonus" : t.description || t.type,
          date: t.created_at,
          status: t.status || "completed",
          paymentMethod: metadata.method || "gcash",
          paymentIcon: t.type === "topup" ? "arrow-up-outline" : 
                       t.type === "withdrawal" ? "arrow-down-outline" :
                       t.type === "mission_bonus" ? "trophy" : "card",
          paymentColor: t.type === "topup" ? "#10B981" : 
                        t.type === "withdrawal" ? "#EF4444" :
                        t.type === "mission_bonus" ? "#F59E0B" : "#666",
        };
      });

      // Combine and sort all transactions
      const allTransactions = [
        ...bookingTransactions, 
        ...transactionItems
      ].sort((a, b) => new Date(b.date) - new Date(a.date));

      console.log("Total transactions:", allTransactions.length);
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

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);

      const { data, error } = await supabase
        .from("bookings")
        .select("actual_fare, ride_completed_at")
        .eq("driver_id", driverId)
        .eq("status", "completed")
        .gte("ride_completed_at", startOfWeek.toISOString())
        .lt("ride_completed_at", endOfWeek.toISOString())
        .order("ride_completed_at", { ascending: true });

      if (error) throw error;

      const dailyEarnings = [0, 0, 0, 0, 0, 0, 0];
      let total = 0;

      data?.forEach(booking => {
        if (booking.ride_completed_at) {
          const date = new Date(booking.ride_completed_at);
          let dayIndex = date.getDay();
          dayIndex = dayIndex === 0 ? 6 : dayIndex - 1;
          const amount = Number(booking.actual_fare) || 0;
          dailyEarnings[dayIndex] += amount;
          total += amount;
        }
      });

      console.log("Weekly earnings:", dailyEarnings);
      setWeeklyEarnings(dailyEarnings);
      
      // Find peak day
      const maxEarnings = Math.max(...dailyEarnings);
      const maxIndex = dailyEarnings.indexOf(maxEarnings);
      const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
      setPeakDay(days[maxIndex] || "");
      setPeakEarnings(maxEarnings);
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

      // Get total trips and average fare
      const { data: tripsData, error: tripsError } = await supabase
        .from("bookings")
        .select("actual_fare")
        .eq("driver_id", driverId)
        .eq("status", "completed");

      if (tripsError) throw tripsError;

      const tripCount = tripsData?.length || 0;
      const totalFare = tripsData?.reduce((sum, b) => sum + (Number(b.actual_fare) || 0), 0) || 0;
      
      setTotalTrips(tripCount);
      setAverageFare(tripCount > 0 ? totalFare / tripCount : 0);

    } catch (err) {
      console.log("Error fetching statistics:", err.message);
    }
  };

  const handleWithdraw = () => {
    const amount = parseFloat(withdrawAmount);
    
    if (!withdrawAmount || isNaN(amount) || amount <= 0) {
      Alert.alert("Error", "Please enter a valid amount");
      return;
    }

    if (amount < 100) {
      Alert.alert("Error", "Minimum withdrawal is ₱100");
      return;
    }

    if (amount > walletData.balance) {
      Alert.alert("Error", `Insufficient balance. Available: ₱${walletData.balance.toFixed(2)}`);
      return;
    }

    if (withdrawMethod === "gcash") {
      if (!gcashNumber) {
        Alert.alert("Error", "Please enter your GCash number");
        return;
      }
      if (!/^09\d{9}$/.test(gcashNumber)) {
        Alert.alert("Error", "Please enter a valid GCash number (11 digits starting with 09)");
        return;
      }
    }

    Alert.alert(
      "Confirm Withdrawal",
      `Withdraw ₱${amount.toFixed(2)} from your balance to ${withdrawMethod === "gcash" ? `GCash (${gcashNumber})` : "Cash (Pick up at branch)"}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: () => processWithdrawal(amount),
        },
      ]
    );
  };

  const processWithdrawal = async (amount) => {
    try {
      // Update wallet balance
      const { error: updateError } = await supabase
        .from("driver_wallets")
        .update({
          balance: walletData.balance - amount,
          total_withdrawals: (walletData.total_withdrawals || 0) + amount,
          updated_at: new Date()
        })
        .eq("driver_id", driverId);

      if (updateError) throw updateError;

      // Create transaction record
      const { error: transactionError } = await supabase
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
            status: "pending"
          },
        });

      if (transactionError) throw transactionError;

      // Create notification
      const { error: notifError } = await supabase
        .from("notifications")
        .insert({
          user_id: driverId,
          user_type: "driver",
          type: "payment",
          title: "Withdrawal Request Submitted",
          message: `Your withdrawal request of ₱${amount.toFixed(2)} to ${withdrawMethod === "gcash" ? "GCash" : "Cash"} is being processed.`,
          data: { 
            amount, 
            method: withdrawMethod,
            gcash_number: withdrawMethod === "gcash" ? gcashNumber : null
          },
          created_at: new Date()
        });

      if (notifError) throw notifError;

      // Update local state
      const newBalance = walletData.balance - amount;
      
      Alert.alert(
        "✅ Withdrawal Request Submitted", 
        `Amount: ₱${amount.toFixed(2)}\nMethod: ${withdrawMethod === "gcash" ? "GCash" : "Cash"}\n\n` +
        `Your request is being processed.`
      );
      
      setWithdrawModal(false);
      setWithdrawAmount("");
      setGcashNumber("");
      
      // Refresh data
      await loadWalletData();
    } catch (err) {
      console.log("Withdrawal error:", err.message);
      Alert.alert("Error", "Failed to process withdrawal. Please try again.");
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "";
    
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) return "Today";
      if (diffDays === 1) return "Yesterday";
      if (diffDays < 7) return `${diffDays} days ago`;
      return date.toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
        year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      });
    } catch (e) {
      return "";
    }
  };

  const getTransactionIcon = (type, paymentMethod, category) => {
    if (type === "earning" || category === "trip") {
      switch (paymentMethod) {
        case "gcash":
          return { name: "phone-portrait", color: "#00579F", bg: "#E6F0FF" };
        case "cash":
          return { name: "cash", color: "#10B981", bg: "#D1FAE5" };
        default:
          return { name: "wallet", color: "#183B5C", bg: "#E6E9F0" };
      }
    } else if (type === "topup") {
      return { name: "arrow-up-outline", color: "#10B981", bg: "#D1FAE5" };
    } else if (type === "withdrawal") {
      return { name: "arrow-down-outline", color: "#EF4444", bg: "#FEE2E2" };
    } else if (type === "mission_bonus") {
      return { name: "trophy", color: "#F59E0B", bg: "#FEF3C7" };
    } else {
      return { name: "card", color: "#EF4444", bg: "#FEE2E2" };
    }
  };

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
      contentContainerStyle={{ paddingBottom: 30 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View
        style={{
          backgroundColor: "#183B5C",
          paddingTop: insets.top + 20,
          paddingBottom: 30,
          paddingHorizontal: 20,
          borderBottomLeftRadius: 30,
          borderBottomRightRadius: 30,
        }}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          style={{ position: "absolute", top: insets.top + 10, left: 20, zIndex: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </Pressable>

        <Text style={{ fontSize: 24, fontWeight: "bold", color: "#FFF", marginTop: 20 }}>
          My Wallet
        </Text>
        <Text style={{ fontSize: 14, color: "#FFB37A", marginTop: 5 }}>
          {driverName || "Driver"}
        </Text>
      </View>

      {/* Balance Card */}
      <View style={{
        marginHorizontal: 20,
        marginTop: -20,
        backgroundColor: "#FFF",
        borderRadius: 24,
        padding: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 5,
      }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={{ fontSize: 14, color: "#666", marginBottom: 5 }}>
              Available Balance
            </Text>
            <Text style={{ fontSize: 36, fontWeight: "bold", color: "#183B5C" }}>
              ₱{(walletData.balance || 0).toFixed(2)}
            </Text>
          </View>
          <View style={{
            backgroundColor: "#E6F7E6",
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 20,
          }}>
            <Text style={{ fontSize: 12, color: "#2E7D32", fontWeight: "600" }}>
              Can Withdraw
            </Text>
          </View>
        </View>
        
        {/* Balance Breakdown */}
        <View style={{
          marginTop: 10,
          flexDirection: "row",
          justifyContent: "space-between",
        }}>
          <View>
            <Text style={{ fontSize: 11, color: "#666" }}>Total Top-ups</Text>
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#10B981" }}>
              ₱{(walletData.total_deposits || 0).toFixed(2)}
            </Text>
          </View>
          <View>
            <Text style={{ fontSize: 11, color: "#666" }}>Total Withdrawn</Text>
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#EF4444" }}>
              ₱{(walletData.total_withdrawals || 0).toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Earnings Section */}
        <View style={{
          marginTop: 20,
          padding: 15,
          backgroundColor: "#F9FAFB",
          borderRadius: 16,
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
            <Ionicons name="stats-chart" size={20} color="#183B5C" />
            <Text style={{ fontSize: 16, fontWeight: "bold", color: "#333", marginLeft: 8 }}>
              Total Earnings from Trips
            </Text>
          </View>
          
          <Text style={{ fontSize: 28, fontWeight: "bold", color: "#183B5C", marginBottom: 15 }}>
            ₱{(totalEarnings || 0).toFixed(2)}
          </Text>
          
          <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
            <View style={{ alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#10B981", marginRight: 4 }} />
                <Text style={{ fontSize: 11, color: "#666" }}>Cash</Text>
              </View>
              <Text style={{ fontSize: 16, fontWeight: "600", color: "#10B981" }}>
                ₱{(walletData.cash_earnings || 0).toFixed(0)}
              </Text>
            </View>

            {/* <View style={{ alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#00579F", marginRight: 4 }} />
                <Text style={{ fontSize: 11, color: "#666" }}>GCash</Text>
              </View>
              <Text style={{ fontSize: 16, fontWeight: "600", color: "#00579F" }}>
                ₱{(walletData.gcash_earnings || 0).toFixed(0)}
              </Text>
            </View> */}

            <View style={{ alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#183B5C", marginRight: 4 }} />
                <Text style={{ fontSize: 11, color: "#666" }}>Wallet</Text>
              </View>
              <Text style={{ fontSize: 16, fontWeight: "600", color: "#183B5C" }}>
                ₱{(walletData.wallet_earnings || 0).toFixed(0)}
              </Text>
            </View>
          </View>
        </View>

        {/* Quick Stats */}
        <View style={{
          flexDirection: "row",
          marginTop: 15,
          paddingTop: 15,
          borderTopWidth: 1,
          borderTopColor: "#F3F4F6",
        }}>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: "#666" }}>Total Trips</Text>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#333" }}>{totalTrips || 0}</Text>
          </View>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: "#666" }}>Avg. Fare</Text>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#333" }}>
              ₱{(averageFare || 0).toFixed(0)}
            </Text>
          </View>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: "#666" }}>This Month</Text>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#333" }}>
              ₱{(monthlyEarnings || 0).toFixed(0)}
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={{ flexDirection: "row", marginTop: 20, gap: 10 }}>
          <Pressable
            style={{
              flex: 1,
              backgroundColor: "#183B5C",
              padding: 12,
              borderRadius: 12,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
            }}
            onPress={() => setWithdrawModal(true)}
          >
            <Ionicons name="arrow-down-outline" size={18} color="#FFF" />
            <Text style={{ color: "#FFF", fontWeight: "600", marginLeft: 5 }}>Withdraw</Text>
          </Pressable>
          
          <Pressable
            style={{
              flex: 1,
              backgroundColor: "#FFB37A",
              padding: 12,
              borderRadius: 12,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
            }}
            onPress={() => Alert.alert(
              "Top-up Feature",
              "To add funds to your wallet, please visit our office or contact support.",
              [{ text: "OK" }]
            )}
          >
            <Ionicons name="arrow-up-outline" size={18} color="#183B5C" />
            <Text style={{ color: "#183B5C", fontWeight: "600", marginLeft: 5 }}>Top Up</Text>
          </Pressable>
        </View>
      </View>

      {/* Earnings Chart */}
      <View style={{
        marginHorizontal: 20,
        marginTop: 20,
        backgroundColor: "#FFF",
        borderRadius: 24,
        padding: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
      }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}>
          <Text style={{ fontSize: 16, fontWeight: "bold", color: "#333" }}>
            Weekly Trip Earnings
          </Text>
          {peakEarnings > 0 && (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="trending-up" size={16} color="#10B981" />
              <Text style={{ fontSize: 12, color: "#666", marginLeft: 4 }}>
                Peak: {peakDay || ""} (₱{(peakEarnings || 0).toFixed(0)})
              </Text>
            </View>
          )}
        </View>

        {weeklyEarnings.some(day => day > 0) ? (
          <LineChart
            data={{
              labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
              datasets: [{
                data: weeklyEarnings,
                color: (opacity = 1) => `rgba(24, 59, 92, ${opacity})`,
                strokeWidth: 2,
              }],
            }}
            width={screenWidth}
            height={180}
            yAxisLabel="₱"
            chartConfig={{
              backgroundColor: "#FFF",
              backgroundGradientFrom: "#FFF",
              backgroundGradientTo: "#FFF",
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(24, 59, 92, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(0,0,0,${opacity})`,
              style: { borderRadius: 16 },
              propsForDots: { r: "4", strokeWidth: "2", stroke: "#FFB37A" },
            }}
            bezier
            style={{ marginVertical: 8, borderRadius: 16 }}
          />
        ) : (
          <View style={{ height: 180, justifyContent: "center", alignItems: "center" }}>
            <Ionicons name="bar-chart-outline" size={40} color="#D1D5DB" />
            <Text style={{ marginTop: 10, color: "#9CA3AF" }}>No trip earnings this week</Text>
          </View>
        )}
      </View>

      {/* Payment Method Breakdown */}
      <View style={{
        marginHorizontal: 20,
        marginTop: 20,
        backgroundColor: "#FFF",
        borderRadius: 24,
        padding: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
      }}>
        <Text style={{ fontSize: 16, fontWeight: "bold", color: "#333", marginBottom: 15 }}>
          Payment Method Breakdown
        </Text>
        
        <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
          {/* Cash */}
          <Pressable 
            style={{ alignItems: "center", flex: 1 }}
            onPress={() => Alert.alert(
              "Cash Earnings", 
              `Total Cash from Trips: ₱${(walletData.cash_earnings || 0).toFixed(2)}\n\nThis includes all cash payments collected directly from passengers.`
            )}
          >
            <View style={{
              width: 50,
              height: 50,
              borderRadius: 25,
              backgroundColor: "#D1FAE5",
              justifyContent: "center",
              alignItems: "center",
              marginBottom: 8,
            }}>
              <Ionicons name="cash" size={24} color="#10B981" />
            </View>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#10B981" }}>
              ₱{(walletData.cash_earnings || 0).toFixed(0)}
            </Text>
            <Text style={{ fontSize: 12, color: "#666" }}>Cash</Text>
          </Pressable>

          {/* GCash
          <Pressable 
            style={{ alignItems: "center", flex: 1 }}
            onPress={() => Alert.alert(
              "GCash Earnings", 
              `Total GCash from Trips: ₱${(walletData.gcash_earnings || 0).toFixed(2)}\n\nThis includes all GCash payments from passengers.`
            )}
          >
            <View style={{
              width: 50,
              height: 50,
              borderRadius: 25,
              backgroundColor: "#E6F0FF",
              justifyContent: "center",
              alignItems: "center",
              marginBottom: 8,
            }}>
              <Ionicons name="phone-portrait" size={24} color="#00579F" />
            </View>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#00579F" }}>
              ₱{(walletData.gcash_earnings || 0).toFixed(0)}
            </Text>
            <Text style={{ fontSize: 12, color: "#666" }}>GCash</Text>
          </Pressable> */}

          {/* Wallet */}
          <Pressable 
            style={{ alignItems: "center", flex: 1 }}
            onPress={() => Alert.alert(
              "Wallet Payments", 
              `Total Wallet from Trips: ₱${(walletData.wallet_earnings || 0).toFixed(2)}\n\nThis includes payments made from commuter's wallet balance.`
            )}
          >
            <View style={{
              width: 50,
              height: 50,
              borderRadius: 25,
              backgroundColor: "#E6E9F0",
              justifyContent: "center",
              alignItems: "center",
              marginBottom: 8,
            }}>
              <Ionicons name="wallet" size={24} color="#183B5C" />
            </View>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#183B5C" }}>
              ₱{(walletData.wallet_earnings || 0).toFixed(0)}
            </Text>
            <Text style={{ fontSize: 12, color: "#666" }}>Wallet</Text>
          </Pressable>
        </View>
      </View>

      {/* Recent Transactions */}
      <View style={{
        marginHorizontal: 20,
        marginTop: 20,
        backgroundColor: "#FFF",
        borderRadius: 24,
        padding: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
      }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}>
          <Text style={{ fontSize: 16, fontWeight: "bold", color: "#333" }}>
            Recent Activity
          </Text>
          <Pressable onPress={() => {}}>
            <Text style={{ fontSize: 12, color: "#183B5C" }}>See All</Text>
          </Pressable>
        </View>

        {!recentTransactions || recentTransactions.length === 0 ? (
          <View style={{ padding: 30, alignItems: "center" }}>
            <Ionicons name="receipt-outline" size={40} color="#D1D5DB" />
            <Text style={{ marginTop: 10, color: "#9CA3AF", textAlign: "center" }}>
              No transactions yet
            </Text>
            <Text style={{ fontSize: 12, color: "#D1D5DB", marginTop: 4 }}>
              Complete a booking to see your earnings
            </Text>
          </View>
        ) : (
          recentTransactions.slice(0, 10).map((transaction, index) => {
            const icon = getTransactionIcon(transaction.type, transaction.paymentMethod, transaction.category);
            return (
              <View
                key={transaction.id || index}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 12,
                  borderBottomWidth: index === recentTransactions.slice(0, 10).length - 1 ? 0 : 1,
                  borderBottomColor: "#F3F4F6",
                }}
              >
                <View style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: icon.bg,
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: 12,
                }}>
                  <Ionicons name={icon.name} size={20} color={icon.color} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#333" }} numberOfLines={1}>
                    {transaction.description || "Transaction"}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2, flexWrap: "wrap" }}>
                    <Text style={{ fontSize: 11, color: "#9CA3AF" }}>
                      {formatDate(transaction.date)}
                    </Text>
                    {transaction.category && (
                      <>
                        <Text style={{ fontSize: 11, color: "#9CA3AF", marginHorizontal: 4 }}>•</Text>
                        <Text style={{ 
                          fontSize: 11, 
                          color: transaction.category === "balance" ? "#10B981" : 
                                 transaction.category === "trip" ? "#183B5C" : "#F59E0B",
                          textTransform: "capitalize"
                        }}>
                          {transaction.category}
                        </Text>
                      </>
                    )}
                  </View>
                </View>

                <Text style={{
                  fontSize: 16,
                  fontWeight: "bold",
                  color: (transaction.amount || 0) > 0 ? "#10B981" : "#EF4444",
                }}>
                  {(transaction.amount || 0) > 0 ? "+" : ""}
                  ₱{Math.abs(transaction.amount || 0).toFixed(2)}
                </Text>
              </View>
            );
          })
        )}
      </View>

      {/* Withdrawal Modal */}
      <Modal
        visible={withdrawModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setWithdrawModal(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "flex-end",
        }}>
          <View style={{
            backgroundColor: "#FFF",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 20,
          }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: "bold", color: "#333" }}>Withdraw Funds</Text>
              <Pressable onPress={() => setWithdrawModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </Pressable>
            </View>

            <Text style={{ fontSize: 14, color: "#666", marginBottom: 5 }}>Available Balance</Text>
            <Text style={{ fontSize: 32, fontWeight: "bold", color: "#183B5C", marginBottom: 20 }}>
              ₱{(walletData.balance || 0).toFixed(2)}
            </Text>

            {/* Note about earnings */}
            <View style={{
              backgroundColor: "#F0F9FF",
              borderRadius: 12,
              padding: 12,
              marginBottom: 20,
              borderWidth: 1,
              borderColor: "#B2D9FF",
            }}>
              <Text style={{ fontSize: 12, color: "#3B82F6", fontWeight: "600" }}>
                ℹ️ Note: You can only withdraw from your balance (top-ups).
              </Text>
            </View>

            {/* Withdrawal Method */}
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 10 }}>
              Select Method
            </Text>
            <View style={{ flexDirection: "row", marginBottom: 20, gap: 10 }}>
              <Pressable
                style={[
                  {
                    flex: 1,
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 2,
                    alignItems: "center",
                  },
                  withdrawMethod === "gcash" 
                    ? { borderColor: "#00579F", backgroundColor: "#E6F0FF" }
                    : { borderColor: "#E5E7EB" }
                ]}
                onPress={() => setWithdrawMethod("gcash")}
              >
                <Ionicons name="phone-portrait" size={24} color={withdrawMethod === "gcash" ? "#00579F" : "#9CA3AF"} />
                <Text style={{ 
                  fontSize: 12, 
                  marginTop: 4,
                  color: withdrawMethod === "gcash" ? "#00579F" : "#666"
                }}>GCash</Text>
              </Pressable>

              <Pressable
                style={[
                  {
                    flex: 1,
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 2,
                    alignItems: "center",
                  },
                  withdrawMethod === "cash" 
                    ? { borderColor: "#10B981", backgroundColor: "#D1FAE5" }
                    : { borderColor: "#E5E7EB" }
                ]}
                onPress={() => setWithdrawMethod("cash")}
              >
                <Ionicons name="cash" size={24} color={withdrawMethod === "cash" ? "#10B981" : "#9CA3AF"} />
                <Text style={{ 
                  fontSize: 12, 
                  marginTop: 4,
                  color: withdrawMethod === "cash" ? "#10B981" : "#666"
                }}>Cash</Text>
              </Pressable>
            </View>

            {/* GCash Number */}
            {withdrawMethod === "gcash" && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 8 }}>
                  GCash Number
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    borderRadius: 12,
                    padding: 12,
                    fontSize: 16,
                  }}
                  placeholder="0917XXXXXXX"
                  keyboardType="phone-pad"
                  value={gcashNumber}
                  onChangeText={setGcashNumber}
                  maxLength={11}
                />
                <Text style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4 }}>
                  Enter 11-digit GCash number starting with 09
                </Text>
              </View>
            )}

            {/* Amount */}
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 8 }}>
              Amount (Min. ₱100)
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}>
              <Text style={{ fontSize: 24, fontWeight: "bold", color: "#333", marginRight: 8 }}>₱</Text>
              <TextInput
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 16,
                }}
                placeholder="0.00"
                keyboardType="numeric"
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
              />
            </View>

            {/* Quick Amounts */}
            <View style={{ flexDirection: "row", marginBottom: 20, gap: 8 }}>
              {[100, 500, 1000, 2000].map((amount) => (
                <Pressable
                  key={amount}
                  style={{
                    flex: 1,
                    padding: 8,
                    borderRadius: 8,
                    backgroundColor: "#F3F4F6",
                    alignItems: "center",
                  }}
                  onPress={() => setWithdrawAmount(amount.toString())}
                >
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
                opacity: !withdrawAmount || parseFloat(withdrawAmount) < 100 || parseFloat(withdrawAmount) > (walletData.balance || 0) ? 0.5 : 1,
              }}
              onPress={handleWithdraw}
              disabled={!withdrawAmount || parseFloat(withdrawAmount) < 100 || parseFloat(withdrawAmount) > (walletData.balance || 0)}
            >
              <Text style={{ color: "#FFF", fontWeight: "600", fontSize: 16 }}>
                Withdraw ₱{withdrawAmount ? parseFloat(withdrawAmount).toFixed(2) : "0.00"}
              </Text>
            </Pressable>

            {/* Terms */}
            <Text style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center", marginTop: 15 }}>
              Withdrawals to GCash are processed within 24 hours.
              {"\n"}Cash withdrawals are available for pick up at our office.
            </Text>
          </View>
        </View>
      </Modal>

      {/* Info Card */}
      <View style={{
        marginHorizontal: 20,
        marginTop: 20,
        padding: 15,
        backgroundColor: "#F0F9FF",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#B2D9FF",
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
          <Ionicons name="information-circle" size={20} color="#3B82F6" />
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#183B5C", marginLeft: 8 }}>
            Understanding Your Wallet
          </Text>
        </View>
        <Text style={{ fontSize: 12, color: "#4B5563", marginBottom: 5 }}>
          • 💰 **Balance** comes from your top-ups/cash in
        </Text>
        <Text style={{ fontSize: 12, color: "#4B5563", marginBottom: 5 }}>
          • 💵 **Cash Earnings** from trips - collect directly
        </Text>
        <Text style={{ fontSize: 12, color: "#4B5563", marginBottom: 5 }}>
          • 📱 **GCash Earnings** from trips - auto-added
        </Text>
        <Text style={{ fontSize: 12, color: "#4B5563", marginBottom: 5 }}>
          • 💳 **Wallet Earnings** from commuter wallet payments
        </Text>
        <Text style={{ fontSize: 12, color: "#4B5563" }}>
          • 💰 You can only withdraw from your Balance (top-ups)
        </Text>
      </View>

      {/* Footer Space */}
      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

// Gcash