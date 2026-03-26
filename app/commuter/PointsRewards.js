// screens/commuter/PointsRewards.js
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
  SectionList,
  Dimensions,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";

const { width } = Dimensions.get("window");
const CARD_WIDTH = (width - 48) / 2;

// System setting keys based on your database schema
const SETTING_KEYS = {
  POINTS_PER_RIDE: 'points_per_peso',
  POINTS_PER_REFERRAL: 'referral_points',
  POINTS_VALUE_RATIO: 'points_to_peso_conversion',
  POINTS_EXPIRY_DAYS: 'points_expiry_days',
  MIN_POINTS_REDEEM: 'min_points_redeem',
  WELCOME_POINTS: 'welcome_points',
  POINTS_EARNING_RATE_CASH: 'points_earning_rate_cash',
  POINTS_EARNING_RATE_WALLET: 'points_earning_rate_wallet',
  MIN_FARE_FOR_POINTS: 'min_fare_for_points',
  POINTS_ROUNDING: 'points_rounding',
  POINTS_EARNING_ENABLED: 'points_earning_enabled',
};

export default function PointsRewardsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const scrollY = useRef(new Animated.Value(0)).current;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [commuterId, setCommuterId] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [pointsHistory, setPointsHistory] = useState([]);
  const [promos, setPromos] = useState([]);
  const [activeTab, setActiveTab] = useState("rewards");
  const [settings, setSettings] = useState({});
  const [earningMethods, setEarningMethods] = useState([]);

  // Animations
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [1, 0.9],
    extrapolate: "clamp",
  });

  const tabTranslateY = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [0, -10],
    extrapolate: "clamp",
  });

  // ============ HELPER FUNCTIONS ============

  const parseSettingValue = useCallback((setting) => {
    if (!setting) return null;
    
    switch (setting.data_type) {
      case 'integer':
        return parseInt(setting.value, 10);
      case 'float':
        return parseFloat(setting.value);
      case 'boolean':
        return setting.value === 'true' || setting.value === 'TRUE';
      case 'json':
      case 'array':
        try {
          return JSON.parse(setting.value);
        } catch (e) {
          console.error(`Error parsing ${setting.key}:`, e);
          return null;
        }
      default:
        return setting.value;
    }
  }, []);

  const formatDateGroup = useCallback((dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    
    if (date.toDateString() === now.toDateString()) return "Today";
    
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    
    return date.toLocaleDateString("en-US", { 
      month: "long", 
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  }, []);

  const formatDate = useCallback((dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.ceil(Math.abs(now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return `Today, ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    if (diffDays === 1) return `Yesterday, ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    if (diffDays < 7) return `${date.toLocaleDateString("en-US", { weekday: "long" })}, ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  }, []);

  const getHistoryIcon = useCallback((item) => {
    if (item.type === "earned") {
      switch(item.source) {
        case "trip": return "car-outline";
        case "referral": return "people-outline";
        case "promo": return "pricetag-outline";
        case "bonus": return "gift-outline";
        default: return "arrow-down-outline";
      }
    }
    return item.type === "redeemed" ? "arrow-up-outline" : "time-outline";
  }, []);

  const getHistoryColors = useCallback((item) => {
    switch(item.type) {
      case "earned": return { bg: "#E8F5E9", text: "#2E7D32", icon: "#2E7D32" };
      case "redeemed": return { bg: "#FFEBEE", text: "#C62828", icon: "#C62828" };
      case "expired": return { bg: "#FFF3E0", text: "#EF6C00", icon: "#EF6C00" };
      default: return { bg: "#F5F5F5", text: "#616161", icon: "#616161" };
    }
  }, []);

  // ============ DATA FETCHING ============

  const getCommuterId = useCallback(async () => {
    try {
      const id = await AsyncStorage.getItem("user_id");
      if (!id) {
        Alert.alert("Session Expired", "Please login again to continue.");
        navigation.replace("Login");
        return null;
      }
      return id;
    } catch (error) {
      console.error("Error getting user ID:", error);
      return null;
    }
  }, [navigation]);

  const fetchSystemSettings = useCallback(async () => {
    try {
      const pointsKeys = Object.values(SETTING_KEYS);
      
      const { data, error } = await supabase
        .from("system_settings")
        .select("*")
        .in("key", pointsKeys)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const settingsMap = {};
      data?.forEach(item => {
        settingsMap[item.key] = parseSettingValue(item);
      });

      setSettings(settingsMap);

      // Build earning methods from settings
      const methods = [];

      if (settingsMap[SETTING_KEYS.POINTS_EARNING_ENABLED] !== false) {
        const pointsPerPeso = settingsMap[SETTING_KEYS.POINTS_PER_RIDE] || 10;
        const minFare = settingsMap[SETTING_KEYS.MIN_FARE_FOR_POINTS] || 15;
        
        methods.push({ 
          icon: "car", 
          text: `Earn ${pointsPerPeso} points per ₱1 spent on rides (min. ₱${minFare})`, 
          color: "#3B82F6" 
        });

        const referralPoints = settingsMap[SETTING_KEYS.POINTS_PER_REFERRAL] || 100;
        methods.push({ 
          icon: "people", 
          text: `${referralPoints} points per successful referral`, 
          color: "#8B5CF6" 
        });

        const welcomePoints = settingsMap[SETTING_KEYS.WELCOME_POINTS] || 50;
        methods.push({ 
          icon: "gift", 
          text: `${welcomePoints} welcome points for new users`, 
          color: "#10B981" 
        });

        const cashRate = settingsMap[SETTING_KEYS.POINTS_EARNING_RATE_CASH] || 0.05;
        const walletRate = settingsMap[SETTING_KEYS.POINTS_EARNING_RATE_WALLET] || 0.5;
        
        methods.push({ 
          icon: "cash-outline", 
          text: `Cash payments: ${Math.round(cashRate * 100)} points per ₱100`, 
          color: "#F59E0B" 
        });
        
        methods.push({ 
          icon: "wallet-outline", 
          text: `Wallet payments: ${Math.round(walletRate * 100)} points per ₱100`, 
          color: "#6366F1" 
        });
      }

      setEarningMethods(methods);

    } catch (error) {
      console.error("Error fetching system settings:", error);
      setEarningMethods([
        { icon: "car", text: "Earn 10 points per ₱1 spent on rides", color: "#3B82F6" },
        { icon: "people", text: "100 points per referral", color: "#8B5CF6" },
        { icon: "gift", text: "50 welcome points for new users", color: "#10B981" },
        { icon: "wallet-outline", text: "Bonus points for wallet payments", color: "#6366F1" },
      ]);
    }
  }, [parseSettingValue]);

  const fetchWalletData = useCallback(async (id) => {
    try {
      const { data, error } = await supabase
        .from("commuter_wallets")
        .select("points, created_at, updated_at")
        .eq("commuter_id", id)
        .maybeSingle();

      if (error) throw error;
      
      if (!data) {
        const { data: newWallet, error: createError } = await supabase
          .from("commuter_wallets")
          .insert([{ commuter_id: id, points: 0 }])
          .select()
          .single();

        if (createError) throw createError;
        return newWallet;
      }

      return data;
    } catch (error) {
      console.error("Error fetching wallet:", error);
      throw error;
    }
  }, []);

  const fetchPointsHistory = useCallback(async (id) => {
    try {
      const { data, error } = await supabase
        .from("commuter_points_history")
        .select(`
          id,
          points,
          type,
          source,
          source_id,
          description,
          created_at
        `)
        .eq("commuter_id", id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const enhancedData = await Promise.all(
        (data || []).map(async (item) => {
          if (item.source === "trip" && item.source_id) {
            const { data: booking } = await supabase
              .from("bookings")
              .select("pickup_location, dropoff_location")
              .eq("id", item.source_id)
              .maybeSingle();
            
            return { ...item, booking };
          }
          return item;
        })
      );

      return enhancedData;
    } catch (error) {
      console.error("Error fetching history:", error);
      return [];
    }
  }, []);

  const fetchPromos = useCallback(async () => {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("promos")
        .select(`
          id,
          promo_code,
          title,
          description,
          discount_type,
          discount_value,
          points_required,
          start_date,
          end_date,
          usage_limit,
          is_active
        `)
        .eq("is_active", true)
        .lte("start_date", now)
        .gte("end_date", now)
        .not("points_required", "is", null)
        .order("points_required", { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Error fetching promos:", error);
      return [];
    }
  }, []);

  const loadData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const id = await getCommuterId();
      if (!id) return;
      
      setCommuterId(id);

      const [walletData, historyData, promosData] = await Promise.all([
        fetchWalletData(id),
        fetchPointsHistory(id),
        fetchPromos(),
        fetchSystemSettings()
      ]);

      setWallet(walletData);
      setPointsHistory(historyData);
      setPromos(promosData);
    } catch (err) {
      console.error("Error loading points data:", err);
      Alert.alert(
        "Oops!",
        "We couldn't load your points data. Please try again.",
        [{ text: "OK" }]
      );
    } finally {
      if (showLoading) setLoading(false);
      setRefreshing(false);
    }
  }, [getCommuterId, fetchWalletData, fetchPointsHistory, fetchPromos, fetchSystemSettings]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(false);
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // ============ COMPUTED VALUES ============

  const pointsValue = useMemo(() => {
    const points = wallet?.points || 0;
    const ratio = settings[SETTING_KEYS.POINTS_VALUE_RATIO] || 0.1;
    return `≈ ₱${(points * ratio).toFixed(0)} value`;
  }, [wallet?.points, settings]);

  const groupedHistory = useMemo(() => {
    const groups = {};
    
    pointsHistory.forEach(item => {
      const date = new Date(item.created_at).toDateString();
      if (!groups[date]) {
        groups[date] = {
          title: formatDateGroup(item.created_at),
          data: []
        };
      }
      groups[date].data.push(item);
    });
    
    return Object.values(groups).sort((a, b) => {
      const dateA = new Date(a.data[0].created_at);
      const dateB = new Date(b.data[0].created_at);
      return dateB - dateA;
    });
  }, [pointsHistory, formatDateGroup]);

  const stats = useMemo(() => {
    const earned = pointsHistory
      .filter(item => item.type === "earned")
      .reduce((sum, item) => sum + item.points, 0);
    
    const redeemed = pointsHistory
      .filter(item => item.type === "redeemed")
      .reduce((sum, item) => sum + item.points, 0);

    return { earned, redeemed };
  }, [pointsHistory]);

  // ============ ACTIONS ============

  const handleRedeem = useCallback(async (promo) => {
    const currentPoints = wallet?.points || 0;
    const pointsRequired = promo.points_required || 0;
    const minPointsRedeem = settings[SETTING_KEYS.MIN_POINTS_REDEEM] || 100;
    
    if (pointsRequired < minPointsRedeem) {
      Alert.alert(
        "Minimum Points Required",
        `You need at least ${minPointsRedeem} points to redeem rewards.`,
        [{ text: "Got it" }]
      );
      return;
    }
    
    if (currentPoints < pointsRequired) {
      Alert.alert(
        "Insufficient Points",
        `You need ${pointsRequired - currentPoints} more points to redeem ${promo.title}.`,
        [{ text: "Got it" }]
      );
      return;
    }

    Alert.alert(
      "Redeem Reward",
      `Are you sure you want to redeem ${promo.title} for ${pointsRequired} points?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, Redeem",
          style: "default",
          onPress: async () => {
            try {
              setLoading(true);
              
              // Update wallet points
              const { error: walletError } = await supabase
                .from("commuter_wallets")
                .update({ 
                  points: currentPoints - pointsRequired,
                  updated_at: new Date().toISOString()
                })
                .eq("commuter_id", commuterId);

              if (walletError) throw walletError;

              // Add to points history
              const { error: historyError } = await supabase
                .from("commuter_points_history")
                .insert([{
                  commuter_id: commuterId,
                  points: pointsRequired,
                  type: "redeemed",
                  source: "promo",
                  source_id: promo.id,
                  description: `Redeemed ${promo.title}`,
                  created_at: new Date().toISOString()
                }]);

              if (historyError) throw historyError;

              // Record promo usage in commuter_promos table
              const { error: promoError } = await supabase
                .from("commuter_promos")
                .insert([{
                  commuter_id: commuterId,
                  promo_id: promo.id,
                  used_at: new Date().toISOString(),
                  discount_amount: promo.discount_value
                }]);

              if (promoError) throw promoError;

              await loadData(false);
              
              Alert.alert(
                "🎉 Success!",
                `You've successfully redeemed ${promo.title}. Check your email for the voucher.`,
                [{ text: "Awesome!" }]
              );
            } catch (error) {
              console.error("Redemption error:", error);
              Alert.alert(
                "Redemption Failed",
                "We couldn't process your redemption. Please try again.",
                [{ text: "OK" }]
              );
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  }, [wallet?.points, commuterId, loadData, settings]);

  // ============ RENDER FUNCTIONS ============

  const renderHeader = () => (
    <Animated.View style={[styles.header, { opacity: headerOpacity }]}>
      <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
        <Ionicons name="arrow-back" size={24} color="#1E293B" />
      </Pressable>
      <Text style={styles.headerTitle}>Points & Rewards</Text>
      <Pressable style={styles.headerRight}>
        <Ionicons name="help-circle-outline" size={24} color="#1E293B" />
      </Pressable>
    </Animated.View>
  );

  const renderPointsCard = () => {
    const pointsEnabled = settings[SETTING_KEYS.POINTS_EARNING_ENABLED] !== false;
    
    return (
      <LinearGradient
        colors={pointsEnabled ? ["#0F2B3D", "#1A4B6D"] : ["#64748B", "#475569"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.pointsCard}
      >
        <BlurView intensity={20} tint="dark" style={styles.pointsGlow}>
          <View style={styles.pointsHeader}>
            <View>
              <Text style={styles.pointsLabel}>Available Points</Text>
              <Text style={styles.pointsValue}>{wallet?.points?.toLocaleString() || 0}</Text>
            </View>
            <View style={styles.pointsBadge}>
              <Ionicons name="star" size={20} color="#FFD700" />
            </View>
          </View>
          
          <View style={styles.pointsFooter}>
            <Text style={styles.pointsSubtext}>{pointsValue}</Text>
            <View style={styles.pointsTrend}>
              <Ionicons name="trending-up" size={16} color="#4ADE80" />
              <Text style={styles.trendText}>+{stats.earned} total earned</Text>
            </View>
          </View>
        </BlurView>
      </LinearGradient>
    );
  };

  const renderTabs = () => (
    <Animated.View style={[styles.tabContainer, { transform: [{ translateY: tabTranslateY }] }]}>
      <Pressable
        style={[styles.tab, activeTab === "rewards" && styles.tabActive]}
        onPress={() => setActiveTab("rewards")}
      >
        <Ionicons 
          name="gift" 
          size={20} 
          color={activeTab === "rewards" ? "#0F2B3D" : "#94A3B8"} 
        />
        <Text style={[styles.tabText, activeTab === "rewards" && styles.tabTextActive]}>
          Rewards
        </Text>
      </Pressable>
      <Pressable
        style={[styles.tab, activeTab === "history" && styles.tabActive]}
        onPress={() => setActiveTab("history")}
      >
        <Ionicons 
          name="time" 
          size={20} 
          color={activeTab === "history" ? "#0F2B3D" : "#94A3B8"} 
        />
        <Text style={[styles.tabText, activeTab === "history" && styles.tabTextActive]}>
          History
        </Text>
      </Pressable>
    </Animated.View>
  );

  const renderRewardCard = (promo) => {
    const hasEnoughPoints = (wallet?.points || 0) >= (promo.points_required || 0);
    const minPointsRedeem = settings[SETTING_KEYS.MIN_POINTS_REDEEM] || 100;
    const meetsMinRequirement = (promo.points_required || 0) >= minPointsRedeem;
    
    const gradientColors = promo.discount_type === 'percentage' 
      ? ["#8B5CF6", "#7C3AED"] 
      : promo.discount_type === 'fixed'
      ? ["#3B82F6", "#2563EB"]
      : ["#10B981", "#059669"];
    
    return (
      <Pressable
        key={promo.id}
        style={({ pressed }) => [
          styles.rewardCard,
          pressed && styles.rewardCardPressed,
          (!hasEnoughPoints || !meetsMinRequirement) && styles.rewardCardDisabled
        ]}
        onPress={() => handleRedeem(promo)}
      >
        <LinearGradient
          colors={gradientColors}
          style={styles.rewardIconContainer}
        >
          <Ionicons 
            name={promo.discount_type === 'percentage' ? "percent" : "pricetag"} 
            size={28} 
            color="#FFF" 
          />
        </LinearGradient>
        
        <Text style={styles.rewardTitle}>{promo.title}</Text>
        <Text style={styles.rewardDescription} numberOfLines={2}>
          {promo.description || `${promo.discount_value}${promo.discount_type === 'percentage' ? '%' : '₱'} off`}
        </Text>
        
        <View style={styles.rewardFooter}>
          <View style={styles.pointsRequired}>
            <Ionicons name="star" size={14} color="#FFD700" />
            <Text style={styles.pointsRequiredText}>{promo.points_required || 0}</Text>
          </View>
          
          {hasEnoughPoints && meetsMinRequirement ? (
            <View style={styles.redeemBadge}>
              <Text style={styles.redeemBadgeText}>Redeem</Text>
            </View>
          ) : (
            <Text style={styles.needPoints}>
              Need {(promo.points_required || 0) - (wallet?.points || 0)} more
            </Text>
          )}
        </View>
      </Pressable>
    );
  };

  const renderHistoryItem = ({ item }) => {
    const colors = getHistoryColors(item);
    
    return (
      <View style={[styles.historyItem, { backgroundColor: colors.bg }]}>
        <View style={[styles.historyIcon, { backgroundColor: colors.icon + "20" }]}>
          <Ionicons name={getHistoryIcon(item)} size={20} color={colors.icon} />
        </View>

        <View style={styles.historyContent}>
          <View style={styles.historyHeader}>
            <Text style={[styles.historyDescription, { color: colors.text }]}>
              {item.description || `${item.source} ${item.type}`}
            </Text>
            <Text style={[styles.historyPoints, { color: colors.text }]}>
              {item.type === "earned" ? "+" : "-"}{item.points}
            </Text>
          </View>
          
          {item.booking && (
            <Text style={styles.historyRoute} numberOfLines={1}>
              {item.booking.pickup_location} → {item.booking.dropoff_location}
            </Text>
          )}
          
          <Text style={styles.historyDate}>{formatDate(item.created_at)}</Text>
        </View>
      </View>
    );
  };

  const renderSectionHeader = ({ section }) => (
    <Text style={styles.sectionTitle}>{section.title}</Text>
  );

  const renderEmptyHistory = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyStateIcon}>
        <Ionicons name="time-outline" size={48} color="#94A3B8" />
      </View>
      <Text style={styles.emptyStateTitle}>No History Yet</Text>
      <Text style={styles.emptyStateText}>
        Complete your first ride to start earning points!
      </Text>
      <Pressable 
        style={styles.emptyStateButton}
        onPress={() => navigation.navigate("Home")}
      >
        <Text style={styles.emptyStateButtonText}>Book a Ride</Text>
      </Pressable>
    </View>
  );

  const renderEarningMethods = () => (
    <View style={styles.infoSection}>
      <Text style={styles.infoTitle}>🎯 How to Earn Points</Text>
      {earningMethods.map((method, index) => (
        <View key={index} style={styles.methodCard}>
          <View style={[styles.methodIcon, { backgroundColor: method.color + "15" }]}>
            <Ionicons name={method.icon} size={20} color={method.color} />
          </View>
          <Text style={styles.methodText}>{method.text}</Text>
        </View>
      ))}
      
      {settings[SETTING_KEYS.POINTS_EXPIRY_DAYS] && (
        <View style={styles.expiryNote}>
          <Ionicons name="time-outline" size={16} color="#64748B" />
          <Text style={styles.expiryText}>
            Points expire after {settings[SETTING_KEYS.POINTS_EXPIRY_DAYS]} days
          </Text>
        </View>
      )}
      
      {settings[SETTING_KEYS.POINTS_ROUNDING] && (
        <View style={styles.expiryNote}>
          <Ionicons name="calculator-outline" size={16} color="#64748B" />
          <Text style={styles.expiryText}>
            Points are {settings[SETTING_KEYS.POINTS_ROUNDING]}ed to nearest whole number
          </Text>
        </View>
      )}
    </View>
  );

  const renderRewardsTab = () => (
    <>
      <View style={styles.rewardsGrid}>
        {promos.length > 0 ? (
          promos.map(renderRewardCard)
        ) : (
          <View style={styles.noPromosContainer}>
            <Text style={styles.noPromosText}>No rewards available at the moment</Text>
          </View>
        )}
      </View>
      {renderEarningMethods()}
    </>
  );

  const renderHistoryTab = () => (
    pointsHistory.length === 0 ? renderEmptyHistory() : (
      <SectionList
        sections={groupedHistory}
        keyExtractor={(item) => item.id}
        renderItem={renderHistoryItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.historyList}
        ListFooterComponent={
          <View style={styles.historySummary}>
            <Text style={styles.summaryTitle}>Summary</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Earned</Text>
              <Text style={styles.summaryEarned}>+{stats.earned} pts</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Redeemed</Text>
              <Text style={styles.summaryRedeemed}>-{stats.redeemed} pts</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Current Balance</Text>
              <Text style={styles.summaryBalance}>{wallet?.points || 0} pts</Text>
            </View>
          </View>
        }
        scrollEnabled={false}
      />
    )
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0F2B3D" />
        <Text style={styles.loadingText}>Loading your points...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {renderHeader()}
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor="#0F2B3D"
          />
        }
      >
        {renderPointsCard()}
        {renderTabs()}
        {activeTab === "rewards" ? renderRewardsTab() : renderHistoryTab()}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#64748B",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F2B3D",
  },
  headerRight: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
  },
  pointsCard: {
    margin: 20,
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#0F2B3D",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  pointsGlow: {
    padding: 20,
  },
  pointsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  pointsLabel: {
    fontSize: 14,
    color: "#94A3B8",
    marginBottom: 4,
  },
  pointsValue: {
    fontSize: 40,
    fontWeight: "800",
    color: "#FFF",
  },
  pointsBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  pointsFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pointsSubtext: {
    fontSize: 14,
    color: "#94A3B8",
  },
  pointsTrend: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(74,222,128,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 4,
  },
  trendText: {
    fontSize: 12,
    color: "#4ADE80",
    fontWeight: "600",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 16,
    padding: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    zIndex: 10,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  tabActive: {
    backgroundColor: "#F1F5F9",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#94A3B8",
  },
  tabTextActive: {
    color: "#0F2B3D",
  },
  rewardsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 12,
  },
  rewardCard: {
    width: CARD_WIDTH,
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  rewardCardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  rewardCardDisabled: {
    opacity: 0.7,
  },
  rewardIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  rewardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 4,
  },
  rewardDescription: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 12,
    lineHeight: 16,
    minHeight: 32,
  },
  rewardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pointsRequired: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF9C3",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pointsRequiredText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#854D0E",
  },
  redeemBadge: {
    backgroundColor: "#0F2B3D",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  redeemBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#FFF",
  },
  needPoints: {
    fontSize: 11,
    color: "#EF4444",
    fontWeight: "500",
  },
  noPromosContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    width: "100%",
  },
  noPromosText: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
  },
  historyList: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingVertical: 12,
    paddingHorizontal: 4,
    backgroundColor: "#F8FAFC",
  },
  historyItem: {
    flexDirection: "row",
    padding: 16,
    borderRadius: 16,
    marginBottom: 8,
  },
  historyIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  historyContent: {
    flex: 1,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  historyDescription: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  historyPoints: {
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 8,
  },
  historyRoute: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 4,
  },
  historyDate: {
    fontSize: 11,
    color: "#94A3B8",
  },
  historySummary: {
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 16,
    marginTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 13,
    color: "#64748B",
  },
  summaryEarned: {
    color: "#2E7D32",
    fontWeight: "600",
  },
  summaryRedeemed: {
    color: "#C62828",
    fontWeight: "600",
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 8,
  },
  summaryBalance: {
    color: "#0F2B3D",
    fontWeight: "700",
    fontSize: 16,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyStateIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 20,
  },
  emptyStateButton: {
    backgroundColor: "#0F2B3D",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 30,
  },
  emptyStateButtonText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
  },
  infoSection: {
    margin: 20,
    padding: 20,
    backgroundColor: "#FFF",
    borderRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 16,
  },
  methodCard: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 12,
  },
  methodIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  methodText: {
    fontSize: 14,
    color: "#475569",
    flex: 1,
  },
  expiryNote: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    gap: 8,
  },
  expiryText: {
    fontSize: 12,
    color: "#64748B",
    fontStyle: "italic",
  },
});