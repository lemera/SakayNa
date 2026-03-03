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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { LineChart } from "react-native-chart-kit";
import { Dimensions } from "react-native";

export default function DriverWalletScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get("window").width - 40;
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [driverId, setDriverId] = useState(null);
  const [walletData, setWalletData] = useState({
    balance: 0,
    total_deposits: 0,
    total_withdrawals: 0,
  });
  
  // New state for payment tracking
  const [cashEarnings, setCashEarnings] = useState(0);
  const [gcashEarnings, setGcashEarnings] = useState(0);
  const [walletEarnings, setWalletEarnings] = useState(0);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [weeklyEarnings, setWeeklyEarnings] = useState([]);
  const [paymentBreakdown, setPaymentBreakdown] = useState({
    cash: 0,
    gcash: 0,
    wallet: 0,
  });
  
  // Withdrawal modal state
  const [withdrawModal, setWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawMethod, setWithdrawMethod] = useState("gcash"); // gcash or cash
  const [gcashNumber, setGcashNumber] = useState("");

  // Fetch driver ID
  useFocusEffect(
    useCallback(() => {
      const getDriverId = async () => {
        const id = await AsyncStorage.getItem("user_id");
        setDriverId(id);
      };
      getDriverId();
    }, [])
  );

  // Fetch wallet data
  useEffect(() => {
    if (driverId) {
      loadWalletData();
    }
  }, [driverId]);

  const loadWalletData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchWalletBalance(),
        fetchPaymentBreakdown(),
        fetchTransactions(),
        fetchWeeklyEarnings(),
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
        .select("balance, total_deposits, total_withdrawals")
        .eq("driver_id", driverId)
        .single();

      if (error) throw error;
      if (data) setWalletData(data);
    } catch (err) {
      console.log("Error fetching wallet:", err.message);
    }
  };

  // New function to fetch payment breakdown
  const fetchPaymentBreakdown = async () => {
    try {
      // Get all completed bookings
      const { data, error } = await supabase
        .from("bookings")
        .select("actual_fare, payment_method, payment_type")
        .eq("driver_id", driverId)
        .eq("status", "completed");

      if (error) throw error;

      let cash = 0;
      let gcash = 0;
      let wallet = 0;

      data?.forEach(booking => {
        const paymentMethod = booking.payment_method || booking.payment_type;
        const amount = booking.actual_fare || 0;
        
        if (paymentMethod === "cash") {
          cash += amount;
        } else if (paymentMethod === "gcash") {
          gcash += amount;
        } else if (paymentMethod === "wallet") {
          wallet += amount;
        }
      });

      setCashEarnings(cash);
      setGcashEarnings(gcash);
      setWalletEarnings(wallet);
      setPaymentBreakdown({ cash, gcash, wallet });
    } catch (err) {
      console.log("Error fetching payment breakdown:", err.message);
    }
  };

  const fetchTransactions = async () => {
    try {
      // Get recent bookings with payment info
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
          payment_type
        `)
        .eq("driver_id", driverId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(20);

      if (bookingsError) throw bookingsError;

      // Get subscription payments
      const { data: subscriptions, error: subError } = await supabase
        .from("driver_subscriptions")
        .select(`
          id,
          amount_paid,
          created_at,
          payment_method,
          subscription_plans (plan_name)
        `)
        .eq("driver_id", driverId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (subError) throw subError;

      // Format booking transactions
      const bookingTransactions = (bookings || []).map(b => {
        const paymentMethod = b.payment_method || b.payment_type || "cash";
        return {
          id: `booking-${b.id}`,
          type: "earning",
          amount: b.actual_fare || 0,
          description: `Trip: ${b.pickup_location?.split(",")[0] || "Pickup"} → ${b.dropoff_location?.split(",")[0] || "Dropoff"}`,
          date: b.created_at,
          status: "completed",
          paymentMethod: paymentMethod,
          paymentIcon: paymentMethod === "gcash" ? "phone-portrait" : paymentMethod === "cash" ? "cash" : "wallet",
          paymentColor: paymentMethod === "gcash" ? "#00579F" : paymentMethod === "cash" ? "#10B981" : "#183B5C",
        };
      });

      // Format subscription transactions
      const subscriptionTransactions = (subscriptions || []).map(s => ({
        id: `sub-${s.id}`,
        type: "payment",
        amount: -s.amount_paid,
        description: `Subscription: ${s.subscription_plans?.plan_name || "Plan"}`,
        date: s.created_at,
        status: "completed",
        paymentMethod: s.payment_method || "wallet",
        paymentIcon: s.payment_method === "gcash" ? "phone-portrait" : "card",
        paymentColor: s.payment_method === "gcash" ? "#00579F" : "#EF4444",
      }));

      // Sort by date (newest first)
      const allTransactions = [...bookingTransactions, ...subscriptionTransactions]
        .sort((a, b) => new Date(b.date) - new Date(a.date));

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
        .select("actual_fare, ride_completed_at, payment_method, payment_type")
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
          dailyEarnings[dayIndex] += booking.actual_fare || 0;
        }
      });

      setWeeklyEarnings(dailyEarnings);
    } catch (err) {
      console.log("Error fetching weekly earnings:", err.message);
    }
  };

  const handleWithdraw = () => {
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      Alert.alert("Error", "Please enter a valid amount");
      return;
    }

    const amount = parseFloat(withdrawAmount);
    if (amount > walletData.balance) {
      Alert.alert("Error", "Insufficient balance");
      return;
    }

    if (withdrawMethod === "gcash" && !gcashNumber) {
      Alert.alert("Error", "Please enter your GCash number");
      return;
    }

    Alert.alert(
      "Confirm Withdrawal",
      `Withdraw ₱${amount} to ${withdrawMethod === "gcash" ? `GCash (${gcashNumber})` : "Cash"}?`,
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
      const { error } = await supabase
        .from("driver_wallets")
        .update({
          balance: walletData.balance - amount,
          total_withdrawals: (walletData.total_withdrawals || 0) + amount,
          updated_at: new Date(),
        })
        .eq("driver_id", driverId);

      if (error) throw error;

      // Create transaction record
      await supabase.from("transactions").insert([{
        user_id: driverId,
        user_type: "driver",
        type: "withdrawal",
        amount: amount,
        status: "completed",
        metadata: {
          method: withdrawMethod,
          gcash_number: withdrawMethod === "gcash" ? gcashNumber : null,
        },
      }]);

      // Create notification
      await supabase.from("notifications").insert([{
        user_id: driverId,
        user_type: "driver",
        type: "payment",
        title: "Withdrawal Successful",
        message: `₱${amount} has been withdrawn from your wallet`,
        data: { amount, method: withdrawMethod },
      }]);

      Alert.alert("Success", "Withdrawal request submitted!");
      setWithdrawModal(false);
      setWithdrawAmount("");
      setGcashNumber("");
      
      // Refresh data
      loadWalletData();
    } catch (err) {
      console.log("Withdrawal error:", err.message);
      Alert.alert("Error", "Failed to process withdrawal");
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return date.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
    });
  };

  const getTransactionIcon = (type, paymentMethod) => {
    if (type === "earning") {
      switch (paymentMethod) {
        case "gcash":
          return { name: "phone-portrait", color: "#00579F", bg: "#E6F0FF" };
        case "cash":
          return { name: "cash", color: "#10B981", bg: "#D1FAE5" };
        default:
          return { name: "wallet", color: "#183B5C", bg: "#E6E9F0" };
      }
    } else {
      return { name: "card", color: "#EF4444", bg: "#FEE2E2" };
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F5F7FA" }}>
        <ActivityIndicator size="large" color="#183B5C" />
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
          Track your earnings and withdrawals
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
        <Text style={{ fontSize: 14, color: "#666", marginBottom: 5 }}>Available Balance</Text>
        <Text style={{ fontSize: 36, fontWeight: "bold", color: "#183B5C" }}>
          ₱{walletData.balance.toFixed(2)}
        </Text>
        
        <View style={{ flexDirection: "row", marginTop: 20 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: "#666" }}>Total Deposits</Text>
            <Text style={{ fontSize: 16, fontWeight: "600", color: "#10B981" }}>
              ₱{walletData.total_deposits.toFixed(2)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: "#666" }}>Total Withdrawals</Text>
            <Text style={{ fontSize: 16, fontWeight: "600", color: "#EF4444" }}>
              ₱{walletData.total_withdrawals.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Payment Method Breakdown */}
        <View style={{
          marginTop: 20,
          paddingTop: 20,
          borderTopWidth: 1,
          borderTopColor: "#F3F4F6",
        }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 12 }}>
            Earnings by Payment Method
          </Text>
          
          <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
            {/* Cash */}
            <View style={{ alignItems: "center" }}>
              <View style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: "#D1FAE5",
                justifyContent: "center",
                alignItems: "center",
                marginBottom: 5,
              }}>
                <Ionicons name="cash" size={20} color="#10B981" />
              </View>
              <Text style={{ fontSize: 16, fontWeight: "bold", color: "#10B981" }}>
                ₱{cashEarnings.toFixed(0)}
              </Text>
              <Text style={{ fontSize: 11, color: "#666" }}>Cash</Text>
            </View>

            {/* GCash */}
            <View style={{ alignItems: "center" }}>
              <View style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: "#E6F0FF",
                justifyContent: "center",
                alignItems: "center",
                marginBottom: 5,
              }}>
                <Ionicons name="phone-portrait" size={20} color="#00579F" />
              </View>
              <Text style={{ fontSize: 16, fontWeight: "bold", color: "#00579F" }}>
                ₱{gcashEarnings.toFixed(0)}
              </Text>
              <Text style={{ fontSize: 11, color: "#666" }}>GCash</Text>
            </View>

            {/* Wallet */}
            <View style={{ alignItems: "center" }}>
              <View style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: "#E6E9F0",
                justifyContent: "center",
                alignItems: "center",
                marginBottom: 5,
              }}>
                <Ionicons name="wallet" size={20} color="#183B5C" />
              </View>
              <Text style={{ fontSize: 16, fontWeight: "bold", color: "#183B5C" }}>
                ₱{walletEarnings.toFixed(0)}
              </Text>
              <Text style={{ fontSize: 11, color: "#666" }}>Wallet</Text>
            </View>
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
            onPress={() => navigation.navigate("SubscriptionScreen")} 
          >
            <Ionicons name="arrow-up-outline" size={18} color="#183B5C" />
            <Text style={{ color: "#183B5C", fontWeight: "600", marginLeft: 5 }}>Top Up</Text>
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
            Recent Transactions
          </Text>
          <Pressable onPress={() => {}}>
            <Text style={{ fontSize: 12, color: "#183B5C" }}>See All</Text>
          </Pressable>
        </View>

        {recentTransactions.length === 0 ? (
          <View style={{ padding: 30, alignItems: "center" }}>
            <Ionicons name="receipt-outline" size={40} color="#D1D5DB" />
            <Text style={{ marginTop: 10, color: "#9CA3AF", textAlign: "center" }}>
              No transactions yet
            </Text>
          </View>
        ) : (
          recentTransactions.slice(0, 10).map((transaction, index) => {
            const icon = getTransactionIcon(transaction.type, transaction.paymentMethod);
            return (
              <View
                key={transaction.id}
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
                    {transaction.description}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                    <Text style={{ fontSize: 11, color: "#9CA3AF" }}>
                      {formatDate(transaction.date)}
                    </Text>
                    {transaction.paymentMethod && (
                      <>
                        <Text style={{ fontSize: 11, color: "#9CA3AF", marginHorizontal: 4 }}>•</Text>
                        <Text style={{ 
                          fontSize: 11, 
                          color: transaction.paymentMethod === "gcash" ? "#00579F" : 
                                 transaction.paymentMethod === "cash" ? "#10B981" : "#183B5C",
                          textTransform: "capitalize"
                        }}>
                          {transaction.paymentMethod}
                        </Text>
                      </>
                    )}
                  </View>
                </View>

                <Text style={{
                  fontSize: 16,
                  fontWeight: "bold",
                  color: transaction.type === "earning" ? "#10B981" : "#EF4444",
                }}>
                  {transaction.type === "earning" ? "+" : ""}
                  ₱{Math.abs(transaction.amount).toFixed(2)}
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
            <Text style={{ fontSize: 24, fontWeight: "bold", color: "#183B5C", marginBottom: 20 }}>
              ₱{walletData.balance.toFixed(2)}
            </Text>

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

            {/* GCash Number (if selected) */}
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
                />
              </View>
            )}

            {/* Amount */}
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 8 }}>
              Amount
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
              }}
              onPress={handleWithdraw}
            >
              <Text style={{ color: "#FFF", fontWeight: "600", fontSize: 16 }}>
                Withdraw
              </Text>
            </Pressable>
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
            Wallet Info
          </Text>
        </View>
        <Text style={{ fontSize: 12, color: "#4B5563", marginBottom: 5 }}>
          • Cash payments: Collect directly from passengers
        </Text>
        <Text style={{ fontSize: 12, color: "#4B5563", marginBottom: 5 }}>
          • GCash payments: Automatically added to your wallet
        </Text>
        <Text style={{ fontSize: 12, color: "#4B5563", marginBottom: 5 }}>
          • Minimum withdrawal: ₱100
        </Text>
        <Text style={{ fontSize: 12, color: "#4B5563" }}>
          • Withdrawals to GCash are processed within 24 hours
        </Text>
      </View>
    </ScrollView>
  );
}