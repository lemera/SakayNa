// screens/commuter/PointsRewards.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";

export default function PointsRewardsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [loading, setLoading] = useState(true);
  const [commuterId, setCommuterId] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [pointsHistory, setPointsHistory] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [activeTab, setActiveTab] = useState("rewards"); // rewards, history

  // Sample rewards data
  const sampleRewards = [
    {
      id: 1,
      title: "₱20 Discount",
      points: 200,
      description: "Get ₱20 off on your next ride",
      icon: "ticket",
      color: "#10B981",
    },
    {
      id: 2,
      title: "Free Ride",
      points: 500,
      description: "Free ride up to ₱100",
      icon: "car",
      color: "#3B82F6",
    },
    {
      id: 3,
      title: "GCash Credits",
      points: 1000,
      description: "Redeem ₱100 GCash credits",
      icon: "phone-portrait",
      color: "#8B5CF6",
    },
    {
      id: 4,
      title: "Movie Ticket",
      points: 800,
      description: "1 movie ticket at partner cinemas",
      icon: "film",
      color: "#EC4899",
    },
    {
      id: 5,
      title: "Coffee Voucher",
      points: 150,
      description: "Free coffee at partner cafes",
      icon: "cafe",
      color: "#F59E0B",
    },
  ];

  // Sample points history
  const sampleHistory = [
    {
      id: 1,
      description: "Trip completed",
      points: 10,
      date: "2024-03-15T10:30:00",
      type: "earned",
    },
    {
      id: 2,
      description: "First ride bonus",
      points: 50,
      date: "2024-03-10T14:20:00",
      type: "earned",
    },
    {
      id: 3,
      description: "Referred a friend",
      points: 100,
      date: "2024-03-05T09:15:00",
      type: "earned",
    },
    {
      id: 4,
      description: "Redeemed ₱20 discount",
      points: 200,
      date: "2024-02-28T16:45:00",
      type: "redeemed",
    },
    {
      id: 5,
      description: "Weekend bonus",
      points: 25,
      date: "2024-02-25T11:00:00",
      type: "earned",
    },
  ];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const id = await AsyncStorage.getItem("user_id");
      setCommuterId(id);

      // Fetch wallet
      const { data: walletData, error: walletError } = await supabase
        .from("commuter_wallets")
        .select("points")
        .eq("commuter_id", id)
        .single();

      if (walletError && walletError.code !== "PGRST116") throw walletError;
      setWallet(walletData || { points: 1250 }); // Sample points

      // In production, fetch from database
      // const { data: historyData, error: historyError } = await supabase
      //   .from("points_history")
      //   .select("*")
      //   .eq("commuter_id", id)
      //   .order("created_at", { ascending: false });

      // if (historyError) throw historyError;
      // setPointsHistory(historyData || []);

      // Using sample data
      setPointsHistory(sampleHistory);
      setRewards(sampleRewards);

    } catch (err) {
      console.log("Error loading data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRedeem = (reward) => {
    if ((wallet?.points || 0) < reward.points) {
      Alert.alert("Insufficient Points", "You don't have enough points to redeem this reward.");
      return;
    }

    Alert.alert(
      "Redeem Reward",
      `Are you sure you want to redeem ${reward.title} for ${reward.points} points?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Redeem",
          onPress: () => {
            Alert.alert(
              "Success!",
              `You have successfully redeemed ${reward.title}. Check your email for the voucher.`,
              [{ text: "OK" }]
            );
          },
        },
      ]
    );
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
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
        <Text style={styles.headerTitle}>Points & Rewards</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Points Card */}
      <LinearGradient
        colors={["#183B5C", "#2C5A7A"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.pointsCard}
      >
        <View style={styles.pointsHeader}>
          <Text style={styles.pointsLabel}>Your Points</Text>
          <Ionicons name="star" size={24} color="#FFB37A" />
        </View>
        <Text style={styles.pointsValue}>{wallet?.points || 0}</Text>
        <Text style={styles.pointsSubtext}>
          Earn points on every ride. 100 points = ₱10 value.
        </Text>
      </LinearGradient>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <Pressable
          style={[styles.tab, activeTab === "rewards" && styles.tabActive]}
          onPress={() => setActiveTab("rewards")}
        >
          <Text style={[styles.tabText, activeTab === "rewards" && styles.tabTextActive]}>
            Rewards
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "history" && styles.tabActive]}
          onPress={() => setActiveTab("history")}
        >
          <Text style={[styles.tabText, activeTab === "history" && styles.tabTextActive]}>
            History
          </Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {activeTab === "rewards" ? (
          // Rewards Grid
          <View style={styles.rewardsGrid}>
            {rewards.map((reward) => (
              <Pressable
                key={reward.id}
                style={styles.rewardCard}
                onPress={() => handleRedeem(reward)}
              >
                <View style={[styles.rewardIcon, { backgroundColor: reward.color + "20" }]}>
                  <Ionicons name={reward.icon} size={32} color={reward.color} />
                </View>
                <Text style={styles.rewardTitle}>{reward.title}</Text>
                <Text style={styles.rewardDescription}>{reward.description}</Text>
                <View style={styles.pointsRequired}>
                  <Ionicons name="star" size={14} color="#FFB37A" />
                  <Text style={styles.pointsRequiredText}>{reward.points} pts</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          // Points History
          <View style={styles.historyList}>
            {pointsHistory.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="time-outline" size={64} color="#D1D5DB" />
                <Text style={styles.emptyStateTitle}>No History Yet</Text>
                <Text style={styles.emptyStateText}>
                  Your points history will appear here
                </Text>
              </View>
            ) : (
              pointsHistory.map((item) => (
                <View key={item.id} style={styles.historyItem}>
                  <View style={styles.historyLeft}>
                    <View
                      style={[
                        styles.historyIcon,
                        {
                          backgroundColor:
                            item.type === "earned" ? "#D1FAE5" : "#FEE2E2",
                        },
                      ]}
                    >
                      <Ionicons
                        name={item.type === "earned" ? "arrow-down" : "arrow-up"}
                        size={20}
                        color={item.type === "earned" ? "#10B981" : "#EF4444"}
                      />
                    </View>
                  </View>

                  <View style={styles.historyMiddle}>
                    <Text style={styles.historyDescription}>{item.description}</Text>
                    <Text style={styles.historyDate}>{formatDate(item.date)}</Text>
                  </View>

                  <View style={styles.historyRight}>
                    <Text
                      style={[
                        styles.historyPoints,
                        {
                          color: item.type === "earned" ? "#10B981" : "#EF4444",
                        },
                      ]}
                    >
                      {item.type === "earned" ? "+" : "-"}
                      {item.points}
                    </Text>
                    <Ionicons name="star" size={12} color="#FFB37A" />
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* How to Earn Points */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>How to Earn Points</Text>
          <View style={styles.infoItem}>
            <Ionicons name="car" size={20} color="#183B5C" />
            <Text style={styles.infoItemText}>10 points per ride</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="people" size={20} color="#183B5C" />
            <Text style={styles.infoItemText}>100 points per referral</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="calendar" size={20} color="#183B5C" />
            <Text style={styles.infoItemText}>Double points on weekends</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="gift" size={20} color="#183B5C" />
            <Text style={styles.infoItemText}>Bonus points on your birthday</Text>
          </View>
        </View>
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
  pointsCard: {
    margin: 20,
    padding: 20,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  pointsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  pointsLabel: {
    fontSize: 16,
    color: "#FFB37A",
  },
  pointsValue: {
    fontSize: 48,
    fontWeight: "bold",
    color: "#FFF",
    marginBottom: 10,
  },
  pointsSubtext: {
    fontSize: 12,
    color: "#FFF",
    opacity: 0.8,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: "#183B5C",
  },
  tabText: {
    fontSize: 14,
    color: "#666",
  },
  tabTextActive: {
    color: "#FFF",
    fontWeight: "500",
  },
  rewardsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    gap: 15,
  },
  rewardCard: {
    width: "47%",
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
  rewardIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  rewardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
    textAlign: "center",
  },
  rewardDescription: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
    marginBottom: 12,
  },
  pointsRequired: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pointsRequiredText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  historyList: {
    paddingHorizontal: 20,
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 15,
    borderRadius: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  historyLeft: {
    marginRight: 15,
  },
  historyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  historyMiddle: {
    flex: 1,
  },
  historyDescription: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    marginBottom: 4,
  },
  historyDate: {
    fontSize: 11,
    color: "#999",
  },
  historyRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  historyPoints: {
    fontSize: 16,
    fontWeight: "600",
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
  infoSection: {
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginBottom: 30,
    padding: 20,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 15,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 12,
  },
  infoItemText: {
    fontSize: 14,
    color: "#666",
  },
});