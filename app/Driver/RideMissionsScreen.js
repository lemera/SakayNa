import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle } from "react-native-svg";

const COLORS = {
  primary: "#183B5C",
  primaryDark: "#10293F",
  accent: "#E97A3E",
  accentSoft: "rgba(233, 122, 62, 0.14)",
  success: "#22C55E",
  successSoft: "rgba(34, 197, 94, 0.12)",
  info: "#3B82F6",
  infoSoft: "rgba(59, 130, 246, 0.12)",
  danger: "#EF4444",
  dangerSoft: "rgba(239, 68, 68, 0.12)",
  warning: "#F59E0B",
  warningSoft: "rgba(245, 158, 11, 0.12)",
  text: "#183B5C",
  textMuted: "#64748B",
  textLight: "#94A3B8",
  white: "#FFFFFF",
  background: "#F4F7FB",
  card: "#FFFFFF",
  border: "rgba(24, 59, 92, 0.08)",
  borderStrong: "rgba(24, 59, 92, 0.14)",
  shadow: "#0F172A",
  track: "#E8EEF5",
};

const shadow = Platform.select({
  ios: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  android: {
    elevation: 4,
  },
});

const RideMissionsScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mission, setMission] = useState(null);
  const [credits, setCredits] = useState({
    credit_balance: 0,
    total_earned: 0,
    total_used: 0,
    recent_transactions: [],
  });
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({
    totalMissions: 0,
    completedMissions: 0,
    totalBonusEarned: 0,
    averageRides: 0,
  });
  const [selectedTab, setSelectedTab] = useState("current");
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
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error("Error fetching driver ID:", error);
      setLoading(false);
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
      console.error("Error fetching all data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchCurrentMission = async () => {
    try {
      const nowIso = new Date().toISOString();

      const { data, error } = await supabase
        .from("ride_missions")
        .select("*")
        .eq("driver_id", driverId)
        .eq("status", "active")
        .lte("start_at", nowIso)
        .gte("end_at", nowIso)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Error fetching current mission:", error);
        return;
      }

      setMission(data || null);
    } catch (error) {
      console.error("Error in fetchCurrentMission:", error);
    }
  };

  const fetchCredits = async () => {
    try {
      const { data, error } = await supabase
        .from("driver_subscription_credits")
        .select("*")
        .eq("driver_id", driverId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching credits:", error);
      }

      const baseCredits = data || {
        credit_balance: 0,
        total_earned: 0,
        total_used: 0,
      };

      const { data: transactions, error: txError } = await supabase
        .from("driver_subscription_credit_transactions")
        .select("*")
        .eq("driver_id", driverId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (txError) {
        console.error("Error fetching transactions:", txError);
      }

      setCredits({
        ...baseCredits,
        recent_transactions: transactions || [],
      });
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
        .order("start_at", { ascending: false })
        .limit(20);

      if (error) {
        console.error("Error fetching history:", error);
        return;
      }

      const historyData = data || [];
      setHistory(historyData);

      const completed = historyData.filter(
        (m) => m.status === "achieved" || m.status === "paid"
      );

      const totalBonus = completed.reduce(
        (sum, m) => sum + Number(m.reward_value || 0),
        0
      );

      const avgRides =
        historyData.length > 0
          ? historyData.reduce((sum, m) => sum + Number(m.actual_rides || 0), 0) /
            historyData.length
          : 0;

      setStats({
        totalMissions: historyData.length,
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
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatCurrency = (amount) => {
    return `₱${Number(amount || 0).toFixed(2)}`;
  };

  const getTimeRemaining = () => {
    if (!mission?.end_at) return "0h";
    const now = new Date();
    const end = new Date(mission.end_at);
    const diff = end.getTime() - now.getTime();

    if (diff <= 0) return "Ended";

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return `${days} day(s) left`;
    }

    return `${hours}h ${minutes}m left`;
  };

  const getStatusMeta = (status) => {
    switch (status) {
      case "active":
        return {
          label: "In Progress",
          color: COLORS.accent,
          bg: COLORS.accentSoft,
          icon: "time-outline",
        };
      case "achieved":
        return {
          label: "Completed",
          color: COLORS.success,
          bg: COLORS.successSoft,
          icon: "checkmark-circle",
        };
      case "paid":
        return {
          label: "Reward Paid",
          color: COLORS.info,
          bg: COLORS.infoSoft,
          icon: "wallet-outline",
        };
      case "failed":
        return {
          label: "Not Achieved",
          color: COLORS.danger,
          bg: COLORS.dangerSoft,
          icon: "close-circle",
        };
      case "cancelled":
        return {
          label: "Cancelled",
          color: COLORS.textMuted,
          bg: "#EEF2F7",
          icon: "ban-outline",
        };
      default:
        return {
          label: status || "Unknown",
          color: COLORS.textMuted,
          bg: "#EEF2F7",
          icon: "help-circle-outline",
        };
    }
  };

  const missionProgress = useMemo(() => {
    if (!mission?.target_rides) return 0;
    return Math.min(
      100,
      Math.max(
        0,
        (Number(mission.actual_rides || 0) / Number(mission.target_rides || 1)) * 100
      )
    );
  }, [mission]);

  const CircularProgress = ({ progress, size = 180, strokeWidth = 14 }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const safeProgress = Math.min(100, Math.max(0, progress));
    const strokeDashoffset =
      circumference - (safeProgress / 100) * circumference;

    return (
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={COLORS.track}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={COLORS.accent}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
      </View>
    );
  };

  const renderHeader = () => {
    return (
      <View style={styles.headerWrap}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.iconButton}
            activeOpacity={0.85}
          >
            <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Ride Missions</Text>

          <TouchableOpacity
            onPress={onRefresh}
            style={styles.iconButton}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh-outline" size={20} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        <LinearGradient
          colors={[COLORS.primary, "#224D77"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroEyebrow}>SakayNa Driver Rewards</Text>
              <Text style={styles.heroHeadline}>Admin-assigned missions only</Text>
            </View>
            <View style={styles.heroBadge}>
              <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.accent} />
              <Text style={styles.heroBadgeText}>Admin Controlled</Text>
            </View>
          </View>

          <View style={styles.heroBottom}>
            <View style={styles.heroMetricCard}>
              <Text style={styles.heroMetricValue}>
                {mission ? mission.actual_rides : 0}
              </Text>
              <Text style={styles.heroMetricLabel}>Completed rides</Text>
            </View>

            <View style={styles.heroDivider} />

            <View style={styles.heroMetricCard}>
              <Text style={styles.heroMetricValue}>
                {mission ? formatCurrency(mission.reward_value) : "₱0.00"}
              </Text>
              <Text style={styles.heroMetricLabel}>Mission reward</Text>
            </View>
          </View>
        </LinearGradient>
      </View>
    );
  };

  const renderCreditsCard = () => {
    return (
      <View style={styles.card}>
        <LinearGradient
          colors={[COLORS.primary, "#254F79"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.creditsCard}
        >
          <View style={styles.creditsHeaderRow}>
            <View>
              <Text style={styles.creditsTitle}>Subscription Credits</Text>
              <Text style={styles.creditsBalance}>
                {formatCurrency(credits.credit_balance || 0)}
              </Text>
            </View>

            <View style={styles.creditsIconWrap}>
              <Ionicons name="wallet-outline" size={26} color={COLORS.white} />
            </View>
          </View>

          <View style={styles.creditsStatsRow}>
            <View style={styles.creditsMiniStat}>
              <Text style={styles.creditsMiniLabel}>Total Earned</Text>
              <Text style={styles.creditsMiniValue}>
                {formatCurrency(credits.total_earned || 0)}
              </Text>
            </View>
            <View style={styles.creditsMiniDivider} />
            <View style={styles.creditsMiniStat}>
              <Text style={styles.creditsMiniLabel}>Total Used</Text>
              <Text style={styles.creditsMiniValue}>
                {formatCurrency(credits.total_used || 0)}
              </Text>
            </View>
          </View>
        </LinearGradient>

        {credits.recent_transactions?.length > 0 && (
          <View style={styles.transactionsWrap}>
            <Text style={styles.sectionLabel}>Recent Transactions</Text>

            {credits.recent_transactions.slice(0, 3).map((tx) => {
              const earned = tx.transaction_type === "earned";
              return (
                <View key={tx.id} style={styles.transactionRow}>
                  <View style={styles.transactionLeft}>
                    <View
                      style={[
                        styles.transactionIconWrap,
                        { backgroundColor: earned ? COLORS.successSoft : COLORS.accentSoft },
                      ]}
                    >
                      <Ionicons
                        name={earned ? "arrow-down-outline" : "arrow-up-outline"}
                        size={16}
                        color={earned ? COLORS.success : COLORS.accent}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.transactionTitle}>
                        {tx.description || (earned ? "Credit earned" : "Credit used")}
                      </Text>
                      <Text style={styles.transactionDate}>
                        {formatDate(tx.created_at)}
                      </Text>
                    </View>
                  </View>

                  <Text
                    style={[
                      styles.transactionAmount,
                      { color: earned ? COLORS.success : COLORS.accent },
                    ]}
                  >
                    {earned ? "+" : "-"}
                    {formatCurrency(tx.amount)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  const renderTabs = () => {
    return (
      <View style={styles.segmentWrap}>
        <TouchableOpacity
          activeOpacity={0.9}
          style={[
            styles.segmentButton,
            selectedTab === "current" && styles.segmentButtonActive,
          ]}
          onPress={() => setSelectedTab("current")}
        >
          <Ionicons
            name="rocket-outline"
            size={16}
            color={selectedTab === "current" ? COLORS.white : COLORS.textMuted}
          />
          <Text
            style={[
              styles.segmentText,
              selectedTab === "current" && styles.segmentTextActive,
            ]}
          >
            Current
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.9}
          style={[
            styles.segmentButton,
            selectedTab === "history" && styles.segmentButtonActive,
          ]}
          onPress={() => setSelectedTab("history")}
        >
          <Ionicons
            name="time-outline"
            size={16}
            color={selectedTab === "history" ? COLORS.white : COLORS.textMuted}
          />
          <Text
            style={[
              styles.segmentText,
              selectedTab === "history" && styles.segmentTextActive,
            ]}
          >
            History
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderCurrentMission = () => {
    if (!mission) {
      return (
        <View style={styles.emptyCard}>
          <Ionicons name="flag-outline" size={34} color={COLORS.accent} />
          <Text style={styles.emptyTitle}>No active mission assigned</Text>
          <Text style={styles.emptySubtitle}>
            Your admin has not assigned any active mission yet.
          </Text>
        </View>
      );
    }

    const status = getStatusMeta(mission.status);
    const ridesRemaining = Math.max(
      0,
      Number(mission.target_rides || 0) - Number(mission.actual_rides || 0)
    );
    const timeRemaining = getTimeRemaining();

    return (
      <View style={styles.card}>
        <View style={styles.missionHeader}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.cardTitle}>{mission.title}</Text>
            <Text style={styles.cardSubtitle}>
              {formatDateTime(mission.start_at)} - {formatDateTime(mission.end_at)}
            </Text>
          </View>

          <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
            <Ionicons name={status.icon} size={14} color={status.color} />
            <Text style={[styles.statusPillText, { color: status.color }]}>
              {status.label}
            </Text>
          </View>
        </View>

        {!!mission.description && (
          <View style={styles.descriptionWrap}>
            <Text style={styles.descriptionText}>{mission.description}</Text>
          </View>
        )}

        <View style={styles.progressSection}>
          <View style={styles.progressRingWrap}>
            <CircularProgress progress={missionProgress} />
            <View style={styles.progressCenter}>
              <Text style={styles.progressPercent}>{Math.round(missionProgress)}%</Text>
              <Text style={styles.progressCenterLabel}>Progress</Text>
            </View>
          </View>

          <View style={styles.progressMetaCard}>
            <View style={styles.progressStatRow}>
              <Text style={styles.progressStatLabel}>Completed</Text>
              <Text style={styles.progressStatValue}>
                {mission.actual_rides}/{mission.target_rides} rides
              </Text>
            </View>

            <View style={styles.progressStatRow}>
              <Text style={styles.progressStatLabel}>Remaining</Text>
              <Text style={styles.progressStatValue}>{ridesRemaining} rides</Text>
            </View>

            <View style={styles.progressStatRow}>
              <Text style={styles.progressStatLabel}>Time left</Text>
              <Text style={styles.progressStatValue}>{timeRemaining}</Text>
            </View>

            <View style={[styles.progressStatRow, { marginBottom: 0 }]}>
              <Text style={[styles.progressStatLabel, { color: COLORS.success }]}>
                Reward
              </Text>
              <Text style={[styles.progressStatValue, { color: COLORS.success }]}>
                {formatCurrency(mission.reward_value)} {mission.reward_type}
              </Text>
            </View>
          </View>
        </View>

        {mission.status === "active" && (
          <View style={styles.tipBanner}>
            <View style={styles.tipIconWrap}>
              <Ionicons name="bulb-outline" size={18} color={COLORS.accent} />
            </View>
            <Text style={styles.tipBannerText}>
              Complete <Text style={styles.tipHighlight}>{ridesRemaining}</Text> more rides to earn{" "}
              <Text style={styles.tipHighlight}>{formatCurrency(mission.reward_value)}</Text>.
            </Text>
          </View>
        )}

        {mission.status === "achieved" && !mission.reward_granted_at && (
          <View style={[styles.infoBanner, { backgroundColor: COLORS.successSoft }]}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
            <Text style={[styles.infoBannerText, { color: COLORS.success }]}>
              Mission completed. Reward is waiting for admin/system processing.
            </Text>
          </View>
        )}

        {mission.status === "paid" && (
          <View style={[styles.infoBanner, { backgroundColor: COLORS.infoSoft }]}>
            <Ionicons name="wallet-outline" size={20} color={COLORS.info} />
            <Text style={[styles.infoBannerText, { color: COLORS.info }]}>
              Reward credited on {formatDate(mission.reward_granted_at || mission.paid_at)}.
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderStats = () => {
    return (
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <View style={[styles.statIconWrap, { backgroundColor: "rgba(24,59,92,0.08)" }]}>
            <Ionicons name="flag-outline" size={18} color={COLORS.primary} />
          </View>
          <Text style={styles.statValue}>{stats.totalMissions}</Text>
          <Text style={styles.statLabel}>Total Missions</Text>
        </View>

        <View style={styles.statCard}>
          <View style={[styles.statIconWrap, { backgroundColor: COLORS.successSoft }]}>
            <Ionicons name="checkmark-done-outline" size={18} color={COLORS.success} />
          </View>
          <Text style={[styles.statValue, { color: COLORS.success }]}>
            {stats.completedMissions}
          </Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>

        <View style={styles.statCard}>
          <View style={[styles.statIconWrap, { backgroundColor: COLORS.infoSoft }]}>
            <Ionicons name="cash-outline" size={18} color={COLORS.info} />
          </View>
          <Text style={[styles.statValue, { color: COLORS.info }]}>
            {formatCurrency(stats.totalBonusEarned)}
          </Text>
          <Text style={styles.statLabel}>Total Earned</Text>
        </View>

        <View style={styles.statCard}>
          <View style={[styles.statIconWrap, { backgroundColor: COLORS.accentSoft }]}>
            <Ionicons name="car-outline" size={18} color={COLORS.accent} />
          </View>
          <Text style={[styles.statValue, { color: COLORS.accent }]}>
            {stats.averageRides}
          </Text>
          <Text style={styles.statLabel}>Avg / Mission</Text>
        </View>
      </View>
    );
  };

  const renderHistoryItem = (item) => {
    const isAchieved =
      item.status === "achieved" ||
      item.status === "paid" ||
      Number(item.actual_rides || 0) >= Number(item.target_rides || 0);

    const progress =
      Number(item.target_rides || 0) > 0
        ? Math.min(
            100,
            (Number(item.actual_rides || 0) / Number(item.target_rides || 1)) * 100
          )
        : 0;

    const status = getStatusMeta(item.status);

    return (
      <TouchableOpacity
        key={item.id}
        activeOpacity={0.92}
        style={styles.historyCard}
        onPress={() => {
          Alert.alert(
            "Mission Details",
            `Title: ${item.title}\n` +
              `Period: ${formatDateTime(item.start_at)} - ${formatDateTime(item.end_at)}\n` +
              `Target: ${item.target_rides} rides\n` +
              `Completed: ${item.actual_rides} rides\n` +
              `Status: ${status.label}\n` +
              `Reward: ${formatCurrency(item.reward_value)} ${item.reward_type}`
          );
        }}
      >
        <View style={styles.historyTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.historyPeriod}>{item.title}</Text>
            <Text style={styles.historySub}>
              {item.actual_rides} / {item.target_rides} rides
            </Text>
          </View>

          <View
            style={[
              styles.historyResultBadge,
              {
                backgroundColor: isAchieved ? COLORS.successSoft : COLORS.dangerSoft,
              },
            ]}
          >
            <Ionicons
              name={isAchieved ? "checkmark" : "close"}
              size={14}
              color={isAchieved ? COLORS.success : COLORS.danger}
            />
          </View>
        </View>

        <View style={styles.historyBarTrack}>
          <View
            style={[
              styles.historyBarFill,
              {
                width: `${progress}%`,
                backgroundColor: isAchieved ? COLORS.success : COLORS.accent,
              },
            ]}
          />
        </View>

        <View style={styles.historyBottom}>
          <Text style={styles.historyReward}>
            {isAchieved ? formatCurrency(item.reward_value) : "No reward"}
          </Text>
          <Text style={[styles.historyStatusText, { color: status.color }]}>
            {status.label}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderHistory = () => {
    if (history.length === 0) {
      return (
        <View style={styles.emptyCard}>
          <Ionicons name="time-outline" size={34} color={COLORS.accent} />
          <Text style={styles.emptyTitle}>No mission history yet</Text>
          <Text style={styles.emptySubtitle}>
            Complete admin-assigned missions to build your history.
          </Text>
        </View>
      );
    }

    return <View style={{ gap: 12 }}>{history.map(renderHistoryItem)}</View>;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading missions...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        {renderHeader()}
        {renderCreditsCard()}
        {renderTabs()}

        {selectedTab === "current" ? (
          <>
            {renderCurrentMission()}
            {renderStats()}
          </>
        ) : (
          renderHistory()
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  loadingWrap: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: COLORS.textMuted,
    fontWeight: "500",
  },

  scrollContent: {
    paddingBottom: 28,
  },

  headerWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    marginBottom: 14,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    ...shadow,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.text,
  },

  heroCard: {
    borderRadius: 24,
    padding: 18,
    ...shadow,
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 18,
  },
  heroEyebrow: {
    fontSize: 12,
    color: "rgba(255,255,255,0.78)",
    marginBottom: 6,
    fontWeight: "600",
  },
  heroHeadline: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    color: COLORS.white,
    maxWidth: "78%",
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    right: 50,
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 5,
    paddingVertical: 5,
    borderRadius: 999,
  },
  heroBadgeText: {
    fontSize: 12,
    color: COLORS.white,
    fontWeight: "700",
  },
  heroBottom: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 20,
    padding: 14,
  },
  heroMetricCard: {
    flex: 1,
  },
  heroMetricValue: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.white,
    marginBottom: 4,
  },
  heroMetricLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.74)",
  },
  heroDivider: {
    width: 1,
    height: 34,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginHorizontal: 14,
  },

  card: {
    backgroundColor: COLORS.card,
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...shadow,
    overflow: "hidden",
  },

  creditsCard: {
    padding: 18,
  },
  creditsHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  creditsTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.8)",
    marginBottom: 8,
  },
  creditsBalance: {
    fontSize: 30,
    fontWeight: "800",
    color: COLORS.white,
  },
  creditsIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  creditsStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.14)",
  },
  creditsMiniStat: {
    flex: 1,
  },
  creditsMiniLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.72)",
    marginBottom: 4,
  },
  creditsMiniValue: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.white,
  },
  creditsMiniDivider: {
    width: 1,
    height: 30,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginHorizontal: 14,
  },

  transactionsWrap: {
    padding: 16,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 12,
  },
  transactionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  transactionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 10,
  },
  transactionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  transactionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 2,
  },
  transactionDate: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: "800",
  },

  segmentWrap: {
    flexDirection: "row",
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 5,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...shadow,
  },
  segmentButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  segmentButtonActive: {
    backgroundColor: COLORS.primary,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textMuted,
  },
  segmentTextActive: {
    color: COLORS.white,
  },

  missionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 18,
    paddingBottom: 14,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  descriptionWrap: {
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  descriptionText: {
    fontSize: 14,
    color: COLORS.textMuted,
    lineHeight: 20,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "800",
  },

  progressSection: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    alignItems: "center",
  },
  progressRingWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  progressCenter: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  progressPercent: {
    fontSize: 30,
    fontWeight: "800",
    color: COLORS.text,
  },
  progressCenterLabel: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 3,
  },
  progressMetaCard: {
    width: "100%",
    backgroundColor: "#F8FAFD",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
  },
  progressStatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  progressStatLabel: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: "600",
  },
  progressStatValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: "800",
  },

  tipBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 18,
    marginBottom: 18,
    backgroundColor: COLORS.accentSoft,
    borderRadius: 16,
    padding: 14,
  },
  tipIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.65)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  tipBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.text,
    fontWeight: "600",
  },
  tipHighlight: {
    color: COLORS.accent,
    fontWeight: "800",
  },

  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 18,
    marginBottom: 18,
    borderRadius: 16,
    padding: 14,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
  },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 16,
  },
  statCard: {
    width: "48%",
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...shadow,
  },
  statIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: "600",
  },

  historyCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...shadow,
  },
  historyTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  historyPeriod: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 4,
  },
  historySub: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  historyResultBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
  },
  historyBarTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: COLORS.track,
    overflow: "hidden",
    marginBottom: 12,
  },
  historyBarFill: {
    height: "100%",
    borderRadius: 999,
  },
  historyBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  historyReward: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.success,
  },
  historyStatusText: {
    fontSize: 12,
    fontWeight: "800",
  },

  emptyCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    borderRadius: 22,
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    ...shadow,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: COLORS.text,
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 8,
  },
});

export default RideMissionsScreen;