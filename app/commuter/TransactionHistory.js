// screens/commuter/TransactionHistory.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function TransactionHistoryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [commuterId, setCommuterId] = useState(null);
  const [filterType, setFilterType] = useState("all"); // all, cash_in, payment
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState({
    totalCashIn: 0,
    totalPayments: 0,
    count: 0,
  });

  useEffect(() => {
    loadTransactions();
  }, []);

  useEffect(() => {
    filterTransactions();
  }, [transactions, filterType, searchQuery]);

  const loadTransactions = async () => {
    try {
      const id = await AsyncStorage.getItem("user_id");
      setCommuterId(id);

      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", id)
        .eq("user_type", "commuter")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setTransactions(data || []);

      // Calculate stats
      const cashIn = data?.filter(t => t.type === "cash_in").reduce((sum, t) => sum + t.amount, 0) || 0;
      const payments = data?.filter(t => t.type === "payment").reduce((sum, t) => sum + t.amount, 0) || 0;

      setStats({
        totalCashIn: cashIn,
        totalPayments: payments,
        count: data?.length || 0,
      });

    } catch (err) {
      console.log("Error loading transactions:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filterTransactions = () => {
    let filtered = [...transactions];

    // Filter by type
    if (filterType !== "all") {
      filtered = filtered.filter(t => t.type === filterType);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        t.type.toLowerCase().includes(query) ||
        t.status?.toLowerCase().includes(query) ||
        t.metadata?.reference?.toLowerCase().includes(query)
      );
    }

    setFilteredTransactions(filtered);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadTransactions();
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatCurrency = (amount) => {
    return `₱${amount?.toFixed(2) || "0.00"}`;
  };

  const getTransactionIcon = (type) => {
    switch (type) {
      case "cash_in":
        return { name: "arrow-down-circle", color: "#10B981", bg: "#D1FAE5" };
      case "payment":
        return { name: "arrow-up-circle", color: "#EF4444", bg: "#FEE2E2" };
      case "refund":
        return { name: "repeat", color: "#F59E0B", bg: "#FEF3C7" };
      case "bonus":
        return { name: "gift", color: "#8B5CF6", bg: "#EDE9FE" };
      default:
        return { name: "swap-horizontal", color: "#6B7280", bg: "#F3F4F6" };
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "completed":
        return { bg: "#D1FAE5", text: "#10B981" };
      case "pending":
        return { bg: "#FEF3C7", text: "#F59E0B" };
      case "failed":
        return { bg: "#FEE2E2", text: "#EF4444" };
      default:
        return { bg: "#F3F4F6", text: "#6B7280" };
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#183B5C" />
        </Pressable>
        <Text style={styles.headerTitle}>Transaction History</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Stats Summary */}
      <View style={styles.statsContainer}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Total Cash In</Text>
          <Text style={[styles.statValue, { color: "#10B981" }]}>
            {formatCurrency(stats.totalCashIn)}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Total Payments</Text>
          <Text style={[styles.statValue, { color: "#EF4444" }]}>
            {formatCurrency(stats.totalPayments)}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Transactions</Text>
          <Text style={[styles.statValue, { color: "#183B5C" }]}>
            {stats.count}
          </Text>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color="#999" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search transactions..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#999"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={20} color="#999" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Pressable
            style={[styles.filterChip, filterType === "all" && styles.filterChipActive]}
            onPress={() => setFilterType("all")}
          >
            <Text style={[styles.filterText, filterType === "all" && styles.filterTextActive]}>
              All
            </Text>
          </Pressable>
          <Pressable
            style={[styles.filterChip, filterType === "cash_in" && styles.filterChipActive]}
            onPress={() => setFilterType("cash_in")}
          >
            <Ionicons 
              name="arrow-down-circle" 
              size={16} 
              color={filterType === "cash_in" ? "#FFF" : "#10B981"} 
            />
            <Text style={[styles.filterText, filterType === "cash_in" && styles.filterTextActive]}>
              Cash In
            </Text>
          </Pressable>
          <Pressable
            style={[styles.filterChip, filterType === "payment" && styles.filterChipActive]}
            onPress={() => setFilterType("payment")}
          >
            <Ionicons 
              name="arrow-up-circle" 
              size={16} 
              color={filterType === "payment" ? "#FFF" : "#EF4444"} 
            />
            <Text style={[styles.filterText, filterType === "payment" && styles.filterTextActive]}>
              Payments
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      {/* Transactions List */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {filteredTransactions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyStateTitle}>No Transactions Found</Text>
            <Text style={styles.emptyStateText}>
              {searchQuery 
                ? "No matches for your search" 
                : "Your transactions will appear here"}
            </Text>
          </View>
        ) : (
          filteredTransactions.map((transaction) => {
            const icon = getTransactionIcon(transaction.type);
            const status = getStatusColor(transaction.status);
            return (
              <Pressable
                key={transaction.id}
                style={styles.transactionCard}
                onPress={() => navigation.navigate("TransactionDetails", { transaction })}
              >
                <View style={[styles.transactionIcon, { backgroundColor: icon.bg }]}>
                  <Ionicons name={icon.name} size={24} color={icon.color} />
                </View>
                
                <View style={styles.transactionInfo}>
                  <View style={styles.transactionHeader}>
                    <Text style={styles.transactionType}>
                      {transaction.type === "cash_in" ? "Cash In" :
                       transaction.type === "payment" ? "Trip Payment" :
                       transaction.type}
                    </Text>
                    <Text style={styles.transactionAmount}>
                      {transaction.type === "cash_in" ? "+" : "-"}
                      {formatCurrency(transaction.amount)}
                    </Text>
                  </View>
                  
                  <Text style={styles.transactionDate}>
                    {formatDate(transaction.created_at)}
                  </Text>
                  
                  {transaction.metadata?.reference && (
                    <Text style={styles.transactionReference}>
                      Ref: {transaction.metadata.reference}
                    </Text>
                  )}
                  
                  <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                    <Text style={[styles.statusText, { color: status.text }]}>
                      {transaction.status}
                    </Text>
                  </View>
                </View>

                <Ionicons name="chevron-forward" size={20} color="#999" />
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#183B5C",
  },
  statsContainer: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    padding: 20,
    margin: 20,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statBox: {
    flex: 1,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "bold",
  },
  statDivider: {
    width: 1,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 10,
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: "#333",
    padding: 0,
  },
  filterContainer: {
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10,
    gap: 6,
  },
  filterChipActive: {
    backgroundColor: "#183B5C",
  },
  filterText: {
    fontSize: 14,
    color: "#666",
  },
  filterTextActive: {
    color: "#FFF",
  },
  transactionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 15,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  transactionIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  transactionType: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  transactionDate: {
    fontSize: 12,
    color: "#999",
    marginBottom: 4,
  },
  transactionReference: {
    fontSize: 11,
    color: "#666",
    marginBottom: 4,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  emptyState: {
    alignItems: "center",
    padding: 40,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginTop: 20,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#666",
    marginTop: 8,
    textAlign: "center",
  },
});