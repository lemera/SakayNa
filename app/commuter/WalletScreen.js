// screens/commuter/WalletScreen.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";

export default function CommuterWalletScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [commuterId, setCommuterId] = useState(null);
  const [commuter, setCommuter] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [recentBookings, setRecentBookings] = useState([]);
  
  // Cash-in modal
  const [showCashInModal, setShowCashInModal] = useState(false);
  const [cashInAmount, setCashInAmount] = useState("");
  const [cashInMethod, setCashInMethod] = useState("gcash");
  const [processingCashIn, setProcessingCashIn] = useState(false);

  // Stats
  const [totalSpent, setTotalSpent] = useState(0);
  const [totalTrips, setTotalTrips] = useState(0);
  const [points, setPoints] = useState(0);

  useFocusEffect(
    React.useCallback(() => {
      loadCommuterData();
    }, [])
  );

  const loadCommuterData = async () => {
    try {
      const id = await AsyncStorage.getItem("user_id");
      setCommuterId(id);
      
      if (id) {
        await Promise.all([
          fetchCommuterProfile(id),
          fetchWallet(id),
          fetchTransactions(id),
          fetchRecentBookings(id),
          fetchStats(id)
        ]);
      }
    } catch (err) {
      console.log("Error loading commuter data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchCommuterProfile = async (id) => {
    try {
      const { data, error } = await supabase
        .from("commuters")
        .select("first_name, last_name, phone, email, profile_picture")
        .eq("id", id)
        .single();

      if (error) throw error;
      setCommuter(data);
    } catch (err) {
      console.log("Error fetching commuter profile:", err);
    }
  };

  const fetchWallet = async (id) => {
    try {
      const { data, error } = await supabase
        .from("commuter_wallets")
        select("*")
        .eq("commuter_id", id)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        setWallet(data);
        setPoints(data.points || 0);
      } else {
        // Create wallet if doesn't exist
        const { data: newWallet, error: createError } = await supabase
          .from("commuter_wallets")
          .insert([
            {
              commuter_id: id,
              balance: 0,
              points: 0,
            },
          ])
          .select()
          .single();

        if (createError) throw createError;
        setWallet(newWallet);
      }
    } catch (err) {
      console.log("Error fetching wallet:", err);
    }
  };

  const fetchTransactions = async (id) => {
    try {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", id)
        .eq("user_type", "commuter")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setTransactions(data || []);
    } catch (err) {
      console.log("Error fetching transactions:", err);
    }
  };

  const fetchRecentBookings = async (id) => {
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id,
          booking_reference,
          fare,
          payment_type,
          payment_status,
          created_at,
          pickup_location,
          dropoff_location
        `)
        .eq("commuter_id", id)
        .eq("payment_type", "wallet")
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      setRecentBookings(data || []);
    } catch (err) {
      console.log("Error fetching recent bookings:", err);
    }
  };

  const fetchStats = async (id) => {
    try {
      // Get total spent from wallet transactions
      const { data: spentData, error: spentError } = await supabase
        .from("transactions")
        .select("amount")
        .eq("user_id", id)
        .eq("user_type", "commuter")
        .eq("type", "payment");

      if (spentError) throw spentError;
      
      const total = spentData?.reduce((sum, t) => sum + t.amount, 0) || 0;
      setTotalSpent(total);

      // Get total trips
      const { count, error: tripsError } = await supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("commuter_id", id)
        .eq("status", "completed");

      if (tripsError) throw tripsError;
      setTotalTrips(count || 0);

    } catch (err) {
      console.log("Error fetching stats:", err);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadCommuterData();
  };

  const handleCashIn = async () => {
    if (!cashInAmount || parseFloat(cashInAmount) < 20) {
      Alert.alert("Invalid Amount", "Minimum cash-in amount is ₱20");
      return;
    }

    setProcessingCashIn(true);

    try {
      // Generate reference number
      const reference = `CASH-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // Create transaction record
      const { data: transaction, error: transactionError } = await supabase
        .from("transactions")
        .insert([
          {
            user_id: commuterId,
            user_type: "commuter",
            type: "cash_in",
            amount: parseFloat(cashInAmount),
            status: "pending",
            metadata: {
              method: cashInMethod,
              reference: reference,
            },
            created_at: new Date(),
          },
        ])
        .select()
        .single();

      if (transactionError) throw transactionError;

      // Show instructions based on payment method
      if (cashInMethod === "gcash") {
        Alert.alert(
          "GCash Payment",
          `Please send ₱${cashInAmount} to GCash number 09123456789\n\nReference: ${reference}\n\nYour wallet will be updated once payment is confirmed.`,
          [
            {
              text: "I've Sent Payment",
              onPress: () => checkPaymentStatus(transaction.id)
            },
            { text: "Cancel", style: "cancel" }
          ]
        );
      } else if (cashInMethod === "cash") {
        Alert.alert(
          "Cash Payment",
          `Please pay ₱${cashInAmount} at any partner outlet.\n\nReference: ${reference}`,
          [{ text: "OK", onPress: () => setShowCashInModal(false) }]
        );
      }

      setCashInAmount("");
      setShowCashInModal(false);

    } catch (err) {
      console.log("Error processing cash in:", err);
      Alert.alert("Error", "Failed to process cash-in request");
    } finally {
      setProcessingCashIn(false);
    }
  };

  const checkPaymentStatus = async (transactionId) => {
    // In production, this would check with payment gateway
    // For demo, we'll simulate payment confirmation
    Alert.alert(
      "Payment Verification",
      "Has your payment been sent?",
      [
        { text: "Not Yet", style: "cancel" },
        {
          text: "Yes, Confirm",
          onPress: async () => {
            try {
              // Update transaction status
              await supabase
                .from("transactions")
                .update({ status: "completed" })
                .eq("id", transactionId);

              // Update wallet balance
              const newBalance = (wallet?.balance || 0) + parseFloat(cashInAmount);
              
              await supabase
                .from("commuter_wallets")
                .update({ 
                  balance: newBalance,
                  updated_at: new Date()
                })
                .eq("commuter_id", commuterId);

              // Refresh wallet data
              await fetchWallet(commuterId);
              await fetchTransactions(commuterId);

              Alert.alert("Success", "Wallet has been updated!");
            } catch (err) {
              console.log("Error confirming payment:", err);
              Alert.alert("Error", "Failed to confirm payment");
            }
          }
        }
      ]
    );
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatCurrency = (amount) => {
    return `₱${amount?.toFixed(2) || "0.00"}`;
  };

  const getTransactionIcon = (type) => {
    switch (type) {
      case "cash_in":
        return { name: "arrow-down-circle", color: "#10B981" };
      case "payment":
        return { name: "arrow-up-circle", color: "#EF4444" };
      case "refund":
        return { name: "repeat", color: "#F59E0B" };
      case "bonus":
        return { name: "gift", color: "#8B5CF6" };
      default:
        return { name: "swap-horizontal", color: "#6B7280" };
    }
  };

  // Cash-in Modal
  const CashInModal = () => (
    <Modal
      visible={showCashInModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowCashInModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Cash In</Text>
            <Pressable onPress={() => setShowCashInModal(false)}>
              <Ionicons name="close" size={24} color="#666" />
            </Pressable>
          </View>

          <Text style={styles.modalLabel}>Amount</Text>
          <View style={styles.amountInputContainer}>
            <Text style={styles.currencySymbol}>₱</Text>
            <TextInput
              style={styles.amountInput}
              placeholder="0.00"
              keyboardType="numeric"
              value={cashInAmount}
              onChangeText={setCashInAmount}
              editable={!processingCashIn}
            />
          </View>

          <Text style={styles.modalLabel}>Payment Method</Text>
          <View style={styles.paymentMethods}>
            <Pressable
              style={[
                styles.paymentMethod,
                cashInMethod === "gcash" && styles.paymentMethodSelected,
              ]}
              onPress={() => setCashInMethod("gcash")}
            >
              <Ionicons 
                name="phone-portrait" 
                size={24} 
                color={cashInMethod === "gcash" ? "#FFF" : "#666"} 
              />
              <Text
                style={[
                  styles.paymentMethodText,
                  cashInMethod === "gcash" && styles.paymentMethodTextSelected,
                ]}
              >
                GCash
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.paymentMethod,
                cashInMethod === "cash" && styles.paymentMethodSelected,
              ]}
              onPress={() => setCashInMethod("cash")}
            >
              <Ionicons 
                name="cash" 
                size={24} 
                color={cashInMethod === "cash" ? "#FFF" : "#666"} 
              />
              <Text
                style={[
                  styles.paymentMethodText,
                  cashInMethod === "cash" && styles.paymentMethodTextSelected,
                ]}
              >
                Cash
              </Text>
            </Pressable>
          </View>

          <Pressable
            style={[
              styles.confirmButton,
              processingCashIn && styles.confirmButtonDisabled,
            ]}
            onPress={handleCashIn}
            disabled={processingCashIn}
          >
            {processingCashIn ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.confirmButtonText}>Proceed</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Wallet</Text>
          <Pressable 
            style={styles.historyButton}
            onPress={() => navigation.navigate("TransactionHistory")}
          >
            <Ionicons name="time-outline" size={24} color="#183B5C" />
          </Pressable>
        </View>

        {/* Balance Card */}
        <LinearGradient
          colors={["#183B5C", "#2C5A7A"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.balanceCard}
        >
          <View style={styles.balanceHeader}>
            <Text style={styles.balanceLabel}>Total Balance</Text>
            <View style={styles.pointsBadge}>
              <Ionicons name="star" size={14} color="#FFB37A" />
              <Text style={styles.pointsText}>{points} pts</Text>
            </View>
          </View>
          
          <Text style={styles.balanceAmount}>
            {formatCurrency(wallet?.balance)}
          </Text>

          <View style={styles.balanceFooter}>
            <View style={styles.balanceItem}>
              <Text style={styles.balanceItemLabel}>Total Spent</Text>
              <Text style={styles.balanceItemValue}>{formatCurrency(totalSpent)}</Text>
            </View>
            <View style={styles.balanceDivider} />
            <View style={styles.balanceItem}>
              <Text style={styles.balanceItemLabel}>Total Trips</Text>
              <Text style={styles.balanceItemValue}>{totalTrips}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Action Buttons */}
        <View style={styles.actionGrid}>
          <Pressable 
            style={styles.actionButton}
            onPress={() => setShowCashInModal(true)}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#E3F2FD" }]}>
              <Ionicons name="add-circle" size={24} color="#183B5C" />
            </View>
            <Text style={styles.actionText}>Cash In</Text>
          </Pressable>

          <Pressable 
            style={styles.actionButton}
            onPress={() => navigation.navigate("PaymentMethods")}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#E8F5E9" }]}>
              <Ionicons name="card" size={24} color="#10B981" />
            </View>
            <Text style={styles.actionText}>Payment Methods</Text>
          </Pressable>

          <Pressable 
            style={styles.actionButton}
            onPress={() => navigation.navigate("Promos")}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#FFF3E0" }]}>
              <Ionicons name="pricetag" size={24} color="#FFB37A" />
            </View>
            <Text style={styles.actionText}>Promos</Text>
          </Pressable>

          <Pressable 
            style={styles.actionButton}
            onPress={() => navigation.navigate("PointsRewards")}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#F3E5F5" }]}>
              <Ionicons name="gift" size={24} color="#8B5CF6" />
            </View>
            <Text style={styles.actionText}>Points</Text>
          </Pressable>
        </View>

        {/* Recent Transactions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Transactions</Text>
            <Pressable onPress={() => navigation.navigate("TransactionHistory")}>
              <Text style={styles.seeAllText}>See All</Text>
            </Pressable>
          </View>

          {transactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="swap-horizontal" size={48} color="#D1D5DB" />
              <Text style={styles.emptyStateTitle}>No Transactions Yet</Text>
              <Text style={styles.emptyStateText}>
                Your transactions will appear here
              </Text>
            </View>
          ) : (
            transactions.slice(0, 5).map((transaction) => {
              const icon = getTransactionIcon(transaction.type);
              return (
                <View key={transaction.id} style={styles.transactionItem}>
                  <View style={[styles.transactionIcon, { backgroundColor: icon.color + "20" }]}>
                    <Ionicons name={icon.name} size={20} color={icon.color} />
                  </View>
                  <View style={styles.transactionInfo}>
                    <Text style={styles.transactionType}>
                      {transaction.type === "cash_in" ? "Cash In" : 
                       transaction.type === "payment" ? "Trip Payment" : 
                       transaction.type}
                    </Text>
                    <Text style={styles.transactionDate}>
                      {formatDate(transaction.created_at)}
                    </Text>
                  </View>
                  <View style={styles.transactionAmount}>
                    <Text
                      style={[
                        styles.transactionAmountText,
                        transaction.type === "cash_in" && styles.positiveAmount,
                        transaction.type === "payment" && styles.negativeAmount,
                      ]}
                    >
                      {transaction.type === "cash_in" ? "+" : "-"}
                      {formatCurrency(transaction.amount)}
                    </Text>
                    <Text style={styles.transactionStatus}>
                      {transaction.status}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Recent Bookings (Wallet Payments) */}
        {recentBookings.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Wallet Payments</Text>
            </View>

            {recentBookings.map((booking) => (
              <Pressable
                key={booking.id}
                style={styles.bookingItem}
                onPress={() => navigation.navigate("BookingDetails", { id: booking.id })}
              >
                <View style={styles.bookingIcon}>
                  <Ionicons name="car" size={20} color="#183B5C" />
                </View>
                <View style={styles.bookingInfo}>
                  <Text style={styles.bookingReference} numberOfLines={1}>
                    {booking.booking_reference || "Trip"}
                  </Text>
                  <Text style={styles.bookingRoute} numberOfLines={1}>
                    {booking.pickup_location?.split(",")[0]} → {booking.dropoff_location?.split(",")[0]}
                  </Text>
                  <Text style={styles.bookingDate}>{formatDate(booking.created_at)}</Text>
                </View>
                <View style={styles.bookingAmount}>
                  <Text style={styles.bookingAmountText}>
                    {formatCurrency(booking.fare)}
                  </Text>
                  <View style={[
                    styles.paymentStatusBadge,
                    booking.payment_status === "paid" ? styles.statusPaid : styles.statusPending
                  ]}>
                    <Text style={styles.paymentStatusText}>
                      {booking.payment_status}
                    </Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* Quick Stats */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Ionicons name="wallet-outline" size={24} color="#183B5C" />
            <Text style={styles.statValue}>{formatCurrency(wallet?.balance)}</Text>
            <Text style={styles.statLabel}>Current Balance</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="card-outline" size={24} color="#10B981" />
            <Text style={styles.statValue}>{formatCurrency(totalSpent)}</Text>
            <Text style={styles.statLabel}>Total Spent</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="star-outline" size={24} color="#FFB37A" />
            <Text style={styles.statValue}>{points}</Text>
            <Text style={styles.statLabel}>Points</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="car-outline" size={24} color="#EF4444" />
            <Text style={styles.statValue}>{totalTrips}</Text>
            <Text style={styles.statLabel}>Trips</Text>
          </View>
        </View>

        {/* Help Section */}
        <View style={styles.helpSection}>
          <Ionicons name="help-circle-outline" size={20} color="#666" />
          <Text style={styles.helpText}>
            Having trouble with your wallet?{" "}
            <Text 
              style={styles.helpLink}
              onPress={() => navigation.navigate("Support")}
            >
              Contact Support
            </Text>
          </Text>
        </View>
      </ScrollView>

      {/* Cash-in Modal */}
      <CashInModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: -50,
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#183B5C",
  },
  historyButton: {
    padding: 8,
  },
  balanceCard: {
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  balanceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  balanceLabel: {
    fontSize: 14,
    color: "#FFB37A",
    opacity: 0.9,
  },
  pointsBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
  },
  pointsText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 4,
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#FFF",
    marginBottom: 20,
  },
  balanceFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.2)",
    paddingTop: 15,
  },
  balanceItem: {
    flex: 1,
    alignItems: "center",
  },
  balanceItemLabel: {
    fontSize: 12,
    color: "#FFB37A",
    opacity: 0.9,
    marginBottom: 4,
  },
  balanceItemValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFF",
  },
  balanceDivider: {
    width: 1,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 20,
    gap: 12,
  },
  actionButton: {
    width: "22%",
    alignItems: "center",
  },
  actionIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  actionText: {
    fontSize: 11,
    color: "#333",
    textAlign: "center",
  },
  section: {
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 15,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  seeAllText: {
    fontSize: 14,
    color: "#183B5C",
    fontWeight: "500",
  },
  emptyState: {
    alignItems: "center",
    padding: 30,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginTop: 10,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#666",
    marginTop: 5,
  },
  transactionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionType: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    marginBottom: 2,
  },
  transactionDate: {
    fontSize: 12,
    color: "#999",
  },
  transactionAmount: {
    alignItems: "flex-end",
  },
  transactionAmountText: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  positiveAmount: {
    color: "#10B981",
  },
  negativeAmount: {
    color: "#EF4444",
  },
  transactionStatus: {
    fontSize: 11,
    color: "#999",
    textTransform: "capitalize",
  },
  bookingItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  bookingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  bookingInfo: {
    flex: 1,
  },
  bookingReference: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    marginBottom: 2,
  },
  bookingRoute: {
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
  },
  bookingDate: {
    fontSize: 11,
    color: "#999",
  },
  bookingAmount: {
    alignItems: "flex-end",
  },
  bookingAmountText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  paymentStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusPaid: {
    backgroundColor: "#D1FAE5",
  },
  statusPending: {
    backgroundColor: "#FEF3C7",
  },
  paymentStatusText: {
    fontSize: 10,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: 20,
    marginBottom: 20,
    gap: 10,
  },
  statCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#FFF",
    padding: 15,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginTop: 8,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
  },
  helpSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    marginBottom: 20,
  },
  helpText: {
    fontSize: 12,
    color: "#666",
    marginLeft: 8,
  },
  helpLink: {
    color: "#183B5C",
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
    minHeight: 400,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#183B5C",
  },
  modalLabel: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  amountInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    paddingHorizontal: 15,
    marginBottom: 20,
  },
  currencySymbol: {
    fontSize: 20,
    color: "#666",
    marginRight: 5,
  },
  amountInput: {
    flex: 1,
    paddingVertical: 15,
    fontSize: 20,
    color: "#333",
  },
  paymentMethods: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 30,
  },
  paymentMethod: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
    padding: 15,
    borderRadius: 12,
    gap: 8,
  },
  paymentMethodSelected: {
    backgroundColor: "#183B5C",
  },
  paymentMethodText: {
    fontSize: 14,
    color: "#666",
  },
  paymentMethodTextSelected: {
    color: "#FFF",
  },
  confirmButton: {
    backgroundColor: "#183B5C",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  confirmButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  confirmButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
});