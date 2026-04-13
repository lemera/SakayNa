import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle } from "react-native-svg";

const { width } = Dimensions.get("window");

const RideMissionsScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mission, setMission] = useState(null);
  const [credits, setCredits] = useState(null);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({
    totalMissions: 0,
    completedMissions: 0,
    totalBonusEarned: 0,
    averageRides: 0,
  });
  const [selectedTab, setSelectedTab] = useState("current"); // 'current' or 'history'
  const [driverId, setDriverId] = useState(null);

  useEffect(() => {
    fetchDriverId();
  }, []);

  useEffect(() => {
    if (driverId) {
      fetchAllData();
    }
  }, [driverId]);

  const fetchDriverId = async () => {
    try {
      const userId = await AsyncStorage.getItem("user_id");
      if (userId) {
        setDriverId(userId);
      }
    } catch (error) {
      console.error("Error fetching driver ID:", error);
    }
  };

  const fetchAllData = async () => {
    try {
      await Promise.all([
        fetchCurrentMission(),
        fetchCredits(),
        fetchMissionHistory(),
      ]);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchCurrentMission = async () => {
    try {
      const currentDate = new Date();
      const weekStart = new Date(currentDate);
      weekStart.setDate(currentDate.getDate() - currentDate.getDay() + 1);
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from("ride_missions")
        .select("*")
        .eq("driver_id", driverId)
        .eq("week_start", weekStart.toISOString().split("T")[0])
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching mission:", error);
        return;
      }

      if (!data) {
        // Create mission if doesn't exist
        await createWeeklyMission(weekStart, weekEnd);
      } else {
        setMission(data);
      }
    } catch (error) {
      console.error("Error in fetchCurrentMission:", error);
    }
  };

  const createWeeklyMission = async (weekStart, weekEnd) => {
    try {
      // Get default settings
      const { data: settings } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "mission_default_target")
        .single();

      const targetRides = settings?.value || 50;
      const bonusAmount = 100;

      const { data, error } = await supabase
        .from("ride_missions")
        .insert({
          driver_id: driverId,
          week_start: weekStart.toISOString().split("T")[0],
          week_end: weekEnd.toISOString().split("T")[0],
          target_rides: targetRides,
          actual_rides: 0,
          bonus_amount: bonusAmount,
          reward_type: "credit",
          reward_value: bonusAmount,
          status: "active",
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating mission:", error);
      } else {
        setMission(data);
      }
    } catch (error) {
      console.error("Error in createWeeklyMission:", error);
    }
  };

  const fetchCredits = async () => {
    try {
      const { data, error } = await supabase
        .from("driver_subscription_credits")
        .select("*")
        .eq("driver_id", driverId)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching credits:", error);
        return;
      }

      setCredits(data || { credit_balance: 0, total_earned: 0, total_used: 0 });

      // Fetch recent transactions
      const { data: transactions } = await supabase
        .from("driver_subscription_credit_transactions")
        .select("*")
        .eq("driver_id", driverId)
        .order("created_at", { ascending: false })
        .limit(10);

      setCredits((prev) => ({
        ...prev,
        recent_transactions: transactions || [],
      }));
    } catch (error) {
      console.error("Error in fetchCredits:", error);
    }
  };

  const fetchMissionHistory = async () => {
    try {
      const { data, error } = await supabase
        .from("ride_missions")
        .select("*")
        .eq("driver_id", driverId)
        .order("week_start", { ascending: false })
        .limit(20);

      if (error) {
        console.error("Error fetching history:", error);
        return;
      }

      setHistory(data || []);

      // Calculate stats
      const completed = data?.filter((m) => m.status === "achieved") || [];
      const totalBonus =
        completed.reduce((sum, m) => sum + (m.bonus_amount || 0), 0) || 0;
      const avgRides =
        data?.length > 0
          ? data.reduce((sum, m) => sum + (m.actual_rides || 0), 0) /
            data.length
          : 0;

      setStats({
        totalMissions: data?.length || 0,
        completedMissions: completed.length,
        totalBonusEarned: totalBonus,
        averageRides: Math.round(avgRides * 10) / 10,
      });
    } catch (error) {
      console.error("Error in fetchMissionHistory:", error);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAllData();
  }, [driverId]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const formatCurrency = (amount) => {
    return `₱${parseFloat(amount || 0).toFixed(2)}`;
  };

  const getDaysRemaining = () => {
    if (!mission) return 0;
    const endDate = new Date(mission.week_end);
    const today = new Date();
    const diffTime = endDate - today;
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "active":
        return "#FF9800";
      case "achieved":
        return "#4CAF50";
      case "paid":
        return "#2196F3";
      case "failed":
        return "#F44336";
      default:
        return "#999";
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case "active":
        return "In Progress";
      case "achieved":
        return "Completed!";
      case "paid":
        return "Paid";
      case "failed":
        return "Not Achieved";
      default:
        return status;
    }
  };

  const CircularProgress = ({ progress, size = 150, strokeWidth = 12 }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E0E0E0"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#4CAF50"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
    );
  };

  const renderCurrentMission = () => {
    if (!mission) return null;

    const progress =
      mission.target_rides > 0
        ? (mission.actual_rides / mission.target_rides) * 100
        : 0;
    const daysRemaining = getDaysRemaining();
    const ridesRemaining = Math.max(0, mission.target_rides - mission.actual_rides);

    return (
      <View style={styles.missionCard}>
        <LinearGradient
          colors={["#183B5C", "#1E4D6F"]}
          style={styles.missionHeader}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Text style={styles.missionTitle}>Weekly Challenge</Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(mission.status) + "20" },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                { color: getStatusColor(mission.status) },
              ]}
            >
              {getStatusText(mission.status)}
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.progressContainer}>
          <CircularProgress progress={progress} size={160} strokeWidth={14} />
          <View style={styles.progressTextContainer}>
            <Text style={styles.progressRides}>
              {mission.actual_rides}/{mission.target_rides}
            </Text>
            <Text style={styles.progressLabel}>Rides Completed</Text>
          </View>
        </View>

        <View style={styles.missionDetails}>
          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Ionicons name="calendar-outline" size={20} color="#666" />
              <Text style={styles.detailLabel}>Period</Text>
            </View>
            <Text style={styles.detailValue}>
              {formatDate(mission.week_start)} - {formatDate(mission.week_end)}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Ionicons name="time-outline" size={20} color="#666" />
              <Text style={styles.detailLabel}>Days Remaining</Text>
            </View>
            <Text style={styles.detailValue}>{daysRemaining} days</Text>
          </View>

          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Ionicons name="car-outline" size={20} color="#666" />
              <Text style={styles.detailLabel}>Rides Needed</Text>
            </View>
            <Text style={styles.detailValue}>{ridesRemaining} rides</Text>
          </View>

          <View style={[styles.detailRow, styles.rewardRow]}>
            <View style={styles.detailItem}>
              <Ionicons name="gift-outline" size={20} color="#4CAF50" />
              <Text style={[styles.detailLabel, { color: "#4CAF50" }]}>
                Reward
              </Text>
            </View>
            <Text style={styles.rewardValue}>
              {formatCurrency(mission.reward_value)} {mission.reward_type}
            </Text>
          </View>
        </View>

        {mission.status === "achieved" && !mission.reward_granted_at && (
          <View style={styles.achievedMessage}>
            <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
            <Text style={styles.achievedText}>
              Congratulations! Your reward is being processed.
            </Text>
          </View>
        )}

        {mission.status === "achieved" && mission.reward_granted_at && (
          <View style={styles.rewardGrantedMessage}>
            <Ionicons name="checkmark-done-circle" size={24} color="#2196F3" />
            <Text style={styles.rewardGrantedText}>
              Reward credited on {formatDate(mission.reward_granted_at)}
            </Text>
          </View>
        )}

        {mission.status === "active" && (
          <TouchableOpacity style={styles.tipButton}>
            <Ionicons name="bulb-outline" size={20} color="#FF9800" />
            <Text style={styles.tipText}>
              Tip: Complete {ridesRemaining} more rides to earn{" "}
              {formatCurrency(mission.reward_value)}!
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderCreditsCard = () => {
    if (!credits) return null;

    return (
      <View style={styles.creditsCard}>
        <LinearGradient
          colors={["#2196F3", "#1976D2"]}
          style={styles.creditsGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={styles.creditsTitle}>Subscription Credits</Text>
          <Text style={styles.creditsBalance}>
            {formatCurrency(credits.credit_balance || 0)}
          </Text>
          <View style={styles.creditsStats}>
            <View style={styles.creditStat}>
              <Text style={styles.creditStatLabel}>Total Earned</Text>
              <Text style={styles.creditStatValue}>
                {formatCurrency(credits.total_earned || 0)}
              </Text>
            </View>
            <View style={styles.creditStatDivider} />
            <View style={styles.creditStat}>
              <Text style={styles.creditStatLabel}>Total Used</Text>
              <Text style={styles.creditStatValue}>
                {formatCurrency(credits.total_used || 0)}
              </Text>
            </View>
          </View>
        </LinearGradient>

        {credits.recent_transactions?.length > 0 && (
          <View style={styles.transactionsSection}>
            <Text style={styles.transactionsTitle}>Recent Transactions</Text>
            {credits.recent_transactions.slice(0, 3).map((tx) => (
              <View key={tx.id} style={styles.transactionItem}>
                <View style={styles.transactionInfo}>
                  <View
                    style={[
                      styles.transactionIcon,
                      {
                        backgroundColor:
                          tx.transaction_type === "earned"
                            ? "#4CAF5020"
                            : "#FF980020",
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        tx.transaction_type === "earned"
                          ? "arrow-down"
                          : "arrow-up"
                      }
                      size={16}
                      color={
                        tx.transaction_type === "earned" ? "#4CAF50" : "#FF9800"
                      }
                    />
                  </View>
                  <View style={styles.transactionDetails}>
                    <Text style={styles.transactionDesc}>
                      {tx.description}
                    </Text>
                    <Text style={styles.transactionDate}>
                      {formatDate(tx.created_at)}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[
                    styles.transactionAmount,
                    {
                      color:
                        tx.transaction_type === "earned" ? "#4CAF50" : "#FF9800",
                    },
                  ]}
                >
                  {tx.transaction_type === "earned" ? "+" : "-"}
                  {formatCurrency(tx.amount)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderStats = () => {
    return (
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.totalMissions}</Text>
          <Text style={styles.statLabel}>Total Missions</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: "#4CAF50" }]}>
            {stats.completedMissions}
          </Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: "#2196F3" }]}>
            {formatCurrency(stats.totalBonusEarned)}
          </Text>
          <Text style={styles.statLabel}>Total Earned</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: "#FF9800" }]}>
            {stats.averageRides}
          </Text>
          <Text style={styles.statLabel}>Avg Rides/Week</Text>
        </View>
      </View>
    );
  };

  const renderHistoryItem = (item) => {
    const isAchieved = item.actual_rides >= item.target_rides;
    const progress = (item.actual_rides / item.target_rides) * 100;

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.historyItem}
        onPress={() => {
          Alert.alert(
            "Mission Details",
            `Period: ${formatDate(item.week_start)} - ${formatDate(
              item.week_end
            )}\n` +
              `Target: ${item.target_rides} rides\n` +
              `Completed: ${item.actual_rides} rides\n` +
              `Status: ${getStatusText(item.status)}\n` +
              `Reward: ${formatCurrency(item.reward_value)} ${
                item.reward_type
              }`,
          );
        }}
      >
        <View style={styles.historyHeader}>
          <View>
            <Text style={styles.historyPeriod}>
              {formatDate(item.week_start)} - {formatDate(item.week_end)}
            </Text>
            <Text style={styles.historyRides}>
              {item.actual_rides} / {item.target_rides} rides
            </Text>
          </View>
          <View
            style={[
              styles.historyStatus,
              {
                backgroundColor: isAchieved ? "#4CAF5020" : "#F4433620",
              },
            ]}
          >
            <Text
              style={[
                styles.historyStatusText,
                { color: isAchieved ? "#4CAF50" : "#F44336" },
              ]}
            >
              {isAchieved ? "✓" : "✗"}
            </Text>
          </View>
        </View>

        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.min(progress, 100)}%`,
                backgroundColor: isAchieved ? "#4CAF50" : "#2196F3",
              },
            ]}
          />
        </View>

        <View style={styles.historyFooter}>
          <Text style={styles.historyReward}>
            {isAchieved ? formatCurrency(item.reward_value) : "—"}
          </Text>
          <Text style={styles.historyStatusLabel}>
            {getStatusText(item.status)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
        <Text style={styles.loadingText}>Loading missions...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ride Missions</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {renderCreditsCard()}

        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, selectedTab === "current" && styles.activeTab]}
            onPress={() => setSelectedTab("current")}
          >
            <Text
              style={[
                styles.tabText,
                selectedTab === "current" && styles.activeTabText,
              ]}
            >
              Current Mission
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, selectedTab === "history" && styles.activeTab]}
            onPress={() => setSelectedTab("history")}
          >
            <Text
              style={[
                styles.tabText,
                selectedTab === "history" && styles.activeTabText,
              ]}
            >
              History
            </Text>
          </TouchableOpacity>
        </View>

        {selectedTab === "current" ? (
          <>
            {renderCurrentMission()}
            {renderStats()}
          </>
        ) : (
          <View style={styles.historyContainer}>
            {history.length > 0 ? (
              history.map(renderHistoryItem)
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={48} color="#CCC" />
                <Text style={styles.emptyStateText}>
                  No mission history yet
                </Text>
                <Text style={styles.emptyStateSubtext}>
                  Complete rides to see your mission history
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F7FA",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#666",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  scrollContent: {
    paddingBottom: 20,
  },
  creditsCard: {
    margin: 16,
    borderRadius: 16,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  creditsGradient: {
    padding: 20,
  },
  creditsTitle: {
    fontSize: 14,
    color: "#FFF",
    opacity: 0.9,
    marginBottom: 8,
  },
  creditsBalance: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#FFF",
    marginBottom: 16,
  },
  creditsStats: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.2)",
  },
  creditStat: {
    flex: 1,
  },
  creditStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginHorizontal: 16,
  },
  creditStatLabel: {
    fontSize: 12,
    color: "#FFF",
    opacity: 0.8,
    marginBottom: 4,
  },
  creditStatValue: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFF",
  },
  transactionsSection: {
    backgroundColor: "#FFF",
    padding: 16,
  },
  transactionsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  transactionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  transactionInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  transactionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionDesc: {
    fontSize: 14,
    color: "#333",
    marginBottom: 2,
  },
  transactionDate: {
    fontSize: 12,
    color: "#999",
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: "600",
  },
  tabContainer: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 4,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: "#183B5C",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666",
  },
  activeTabText: {
    color: "#FFF",
  },
  missionCard: {
    backgroundColor: "#FFF",
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  missionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  missionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFF",
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  progressContainer: {
    alignItems: "center",
    paddingVertical: 20,
    backgroundColor: "#FFF",
  },
  progressTextContainer: {
    position: "absolute",
    alignItems: "center",
  },
  progressRides: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#333",
  },
  progressLabel: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  missionDetails: {
    padding: 16,
    backgroundColor: "#F8F9FA",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  detailLabel: {
    fontSize: 14,
    color: "#666",
    marginLeft: 8,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
  },
  rewardRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    marginBottom: 0,
  },
  rewardValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#4CAF50",
  },
  achievedMessage: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#4CAF5020",
  },
  achievedText: {
    fontSize: 14,
    color: "#4CAF50",
    marginLeft: 12,
    flex: 1,
  },
  rewardGrantedMessage: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#2196F320",
  },
  rewardGrantedText: {
    fontSize: 14,
    color: "#2196F3",
    marginLeft: 12,
    flex: 1,
  },
  tipButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#FF980010",
  },
  tipText: {
    fontSize: 13,
    color: "#FF9800",
    marginLeft: 12,
    flex: 1,
  },
  statsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: 16,
    marginBottom: 16,
    gap: 8,
  },
  statCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
  },
  historyContainer: {
    paddingHorizontal: 16,
  },
  historyItem: {
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  historyPeriod: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  historyRides: {
    fontSize: 13,
    color: "#666",
  },
  historyStatus: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  historyStatusText: {
    fontSize: 18,
    fontWeight: "bold",
  },
  progressBar: {
    height: 6,
    backgroundColor: "#E0E0E0",
    borderRadius: 3,
    marginBottom: 12,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  historyFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  historyReward: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4CAF50",
  },
  historyStatusLabel: {
    fontSize: 12,
    color: "#999",
  },
  emptyState: {
    alignItems: "center",
    padding: 40,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#666",
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: "#999",
    marginTop: 8,
    textAlign: "center",
  },
});

export default RideMissionsScreen;