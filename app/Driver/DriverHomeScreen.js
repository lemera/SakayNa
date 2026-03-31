// screens/driver/DriverHomeScreen.js
import React, { useState, useCallback, useRef, useEffect, memo } from "react";
import * as RN from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { LineChart } from "react-native-chart-kit";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { BlurView } from "expo-blur";

const {
  View,
  Text,
  Image,
  ScrollView,
  FlatList,
  Pressable,
  Dimensions,
  Animated,
  Easing,
  AppState,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TouchableOpacity,
  PixelRatio,
  StatusBar,
} = RN;

// ─────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────
const COLORS = {
  // Brand
  navy: "#183B5C", // primary dark
  navyLight: "#1E4A73", // hover / pressed navy
  navyDim: "#EBF2FA", // navy tint bg
  orange: "#E97A3E", // primary accent
  orangeLight: "#FDF1EA", // orange tint bg
  orangeDim: "#FBDECF", // orange progress fill bg

  // Neutrals
  ink: "#0F1923", // near-black text
  inkMid: "#3D4D5C", // secondary text
  gray500: "#6B7A8A", // muted text
  gray300: "#BEC8D2", // borders / dividers
  gray100: "#EEF1F4", // subtle bg
  gray50: "#F6F8FA", // page bg
  white: "#FFFFFF",

  // Semantic
  green: "#16A34A",
  greenLight: "#DCFCE7",
  red: "#DC2626",
  redLight: "#FEE2E2",
  yellow: "#D97706",
  yellowLight: "#FEF9C3",
};

// ─────────────────────────────────────────────
// RESPONSIVE HELPERS
// ─────────────────────────────────────────────
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const BASE_WIDTH = 390;
const scale = SCREEN_WIDTH / BASE_WIDTH;
const normalize = (size) => {
  const s = size * Math.min(Math.max(scale, 0.85), 1.2);
  return Math.round(PixelRatio.roundToNearestPixel(s));
};
const rs = (size) => Math.round(size * Math.min(Math.max(scale, 0.8), 1.15));
const isSmallScreen = SCREEN_WIDTH < 375;
const isLargeScreen = SCREEN_WIDTH >= 768;
const HP = isLargeScreen ? rs(40) : rs(20); // horizontal padding
const BR = rs(16); // base border radius
const RECENT_TRIPS_DISPLAY_LIMIT = 3;
// ─────────────────────────────────────────────
// MODERN ALERT
// ─────────────────────────────────────────────
const ModernAlert = memo(
  ({
    visible,
    title,
    message,
    type,
    onClose,
    onConfirm,
    confirmText,
    cancelText,
  }) => {
    const slideAnim = useRef(new Animated.Value(60)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.94)).current;

    useEffect(() => {
      if (visible) {
        Animated.parallel([
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            damping: 18,
            stiffness: 200,
          }),
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
            damping: 18,
            stiffness: 200,
          }),
        ]).start();
      } else {
        slideAnim.setValue(60);
        opacityAnim.setValue(0);
        scaleAnim.setValue(0.94);
      }
    }, [visible]);

    const typeMap = {
      success: {
        icon: "checkmark-circle-outline",
        bg: COLORS.greenLight,
        fg: COLORS.green,
      },
      error: {
        icon: "close-circle-outline",
        bg: COLORS.redLight,
        fg: COLORS.red,
      },
      warning: {
        icon: "warning-outline",
        bg: COLORS.orangeLight,
        fg: COLORS.orange,
      },
      info: {
        icon: "information-circle-outline",
        bg: COLORS.navyDim,
        fg: COLORS.navy,
      },
    };
    const t = typeMap[type] || typeMap.info;
    const w = isLargeScreen ? 400 : Math.min(SCREEN_WIDTH * 0.88, 360);

    return (
      <Modal
        transparent
        visible={visible}
        animationType="none"
        onRequestClose={onClose}
      >
        <BlurView
          intensity={15}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }}
        >
          <Animated.View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              opacity: opacityAnim,
            }}
          >
            <Animated.View
              style={{
                backgroundColor: COLORS.white,
                borderRadius: rs(24),
                width: w,
                padding: rs(28),
                transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
                shadowColor: COLORS.navy,
                shadowOffset: { width: 0, height: 16 },
                shadowOpacity: 0.12,
                shadowRadius: 32,
                elevation: 12,
              }}
            >
              {/* Icon badge */}
              <View style={{ alignItems: "center", marginBottom: rs(20) }}>
                <View
                  style={{
                    width: rs(56),
                    height: rs(56),
                    borderRadius: rs(28),
                    backgroundColor: t.bg,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Ionicons name={t.icon} size={rs(32)} color={t.fg} />
                </View>
              </View>

              <Text
                style={{
                  fontSize: normalize(18),
                  fontWeight: "700",
                  color: COLORS.navy,
                  textAlign: "center",
                  marginBottom: rs(8),
                  letterSpacing: -0.3,
                }}
              >
                {title}
              </Text>
              <Text
                style={{
                  fontSize: normalize(14),
                  color: COLORS.gray500,
                  textAlign: "center",
                  marginBottom: rs(28),
                  lineHeight: normalize(22),
                }}
              >
                {message}
              </Text>

              {/* Buttons */}
              <View style={{ flexDirection: "row", gap: rs(10) }}>
                {cancelText && (
                  <TouchableOpacity
                    onPress={onClose}
                    style={{
                      flex: 1,
                      paddingVertical: rs(14),
                      borderRadius: rs(12),
                      backgroundColor: COLORS.gray100,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: normalize(15),
                        fontWeight: "600",
                        color: COLORS.inkMid,
                      }}
                    >
                      {cancelText}
                    </Text>
                  </TouchableOpacity>
                )}
                {confirmText && (
                  <TouchableOpacity
                    onPress={onConfirm}
                    style={{
                      flex: 1,
                      paddingVertical: rs(14),
                      borderRadius: rs(12),
                      backgroundColor: COLORS.navy,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: normalize(15),
                        fontWeight: "600",
                        color: COLORS.white,
                      }}
                    >
                      {confirmText}
                    </Text>
                  </TouchableOpacity>
                )}
                {!cancelText && !confirmText && (
                  <TouchableOpacity
                    onPress={onClose}
                    style={{
                      flex: 1,
                      paddingVertical: rs(14),
                      borderRadius: rs(12),
                      backgroundColor: COLORS.navy,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: normalize(15),
                        fontWeight: "600",
                        color: COLORS.white,
                      }}
                    >
                      OK
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </Animated.View>
          </Animated.View>
        </BlurView>
      </Modal>
    );
  },
);

// ─────────────────────────────────────────────
// PILL BADGE
// ─────────────────────────────────────────────
const Pill = ({ label, color, bg }) => (
  <View
    style={{
      paddingHorizontal: rs(8),
      paddingVertical: rs(3),
      borderRadius: rs(20),
      backgroundColor: bg,
    }}
  >
    <Text
      style={{
        fontSize: normalize(10),
        fontWeight: "700",
        color,
        letterSpacing: 0.5,
      }}
    >
      {label}
    </Text>
  </View>
);

// ─────────────────────────────────────────────
// WARNING BANNER  (minimal card style)
// ─────────────────────────────────────────────
const WarningBanner = ({
  icon,
  title,
  body,
  buttonLabel,
  onPress,
  accentColor,
  bgColor,
}) => (
  <View
    style={{
      marginHorizontal: HP,
      marginTop: rs(12),
      padding: rs(16),
      borderRadius: BR,
      backgroundColor: bgColor,
      borderWidth: 1,
      borderColor: accentColor + "30",
    }}
  >
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        marginBottom: rs(8),
      }}
    >
      <View
        style={{
          width: rs(32),
          height: rs(32),
          borderRadius: rs(8),
          backgroundColor: accentColor + "15",
          justifyContent: "center",
          alignItems: "center",
          marginRight: rs(10),
          marginTop: rs(1),
        }}
      >
        <Ionicons name={icon} size={rs(17)} color={accentColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: normalize(13),
            fontWeight: "700",
            color: COLORS.navy,
            marginBottom: rs(3),
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            fontSize: normalize(12),
            color: COLORS.gray500,
            lineHeight: normalize(18),
          }}
        >
          {body}
        </Text>
      </View>
    </View>
    {buttonLabel && (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          marginTop: rs(4),
          paddingVertical: rs(10),
          borderRadius: rs(10),
          backgroundColor: pressed ? COLORS.navyLight : COLORS.navy,
          alignItems: "center",
        })}
      >
        <Text
          style={{
            fontSize: normalize(13),
            fontWeight: "600",
            color: COLORS.white,
            letterSpacing: 0.2,
          }}
        >
          {buttonLabel}
        </Text>
      </Pressable>
    )}
  </View>
);

// ─────────────────────────────────────────────
// TRIP ITEM
// ─────────────────────────────────────────────
const TripItem = memo(({ item, navigation }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const onPressIn = () =>
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
      damping: 20,
    }).start();
  const onPressOut = () =>
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 20,
    }).start();

  const pmColor =
    item.paymentMethod === "gcash"
      ? COLORS.navy
      : item.paymentMethod === "cash"
        ? COLORS.green
        : COLORS.inkMid;
  const pmBg =
    item.paymentMethod === "gcash"
      ? COLORS.navyDim
      : item.paymentMethod === "cash"
        ? COLORS.greenLight
        : COLORS.gray100;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        onPress={() =>
          navigation.navigate("TripDetailsScreen", { tripId: item.id })
        }
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={{
          backgroundColor: COLORS.white,
          borderRadius: BR,
          padding: rs(14),
          marginBottom: rs(8),
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 1,
          borderColor: COLORS.gray100,
        }}
      >
        {/* Payment icon */}
        <View
          style={{
            width: rs(38),
            height: rs(38),
            borderRadius: rs(10),
            backgroundColor: pmBg,
            justifyContent: "center",
            alignItems: "center",
            marginRight: rs(12),
          }}
        >
          <Ionicons
            name={
              item.paymentMethod === "gcash"
                ? "logo-paypal"
                : item.paymentMethod === "cash"
                  ? "cash-outline"
                  : "wallet-outline"
            }
            size={rs(18)}
            color={pmColor}
          />
        </View>

        {/* Route */}
        <View style={{ flex: 1, marginRight: rs(12) }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: rs(3),
            }}
          >
            <View
              style={{
                width: rs(6),
                height: rs(6),
                borderRadius: rs(3),
                backgroundColor: COLORS.green,
                marginRight: rs(6),
              }}
            />
            <Text
              style={{ fontSize: normalize(12), color: COLORS.inkMid, flex: 1 }}
              numberOfLines={1}
            >
              {item.from}
            </Text>
          </View>
          <View
            style={{
              width: 1,
              height: rs(8),
              backgroundColor: COLORS.gray300,
              marginLeft: rs(2.5),
              marginBottom: rs(3),
            }}
          />
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View
              style={{
                width: rs(6),
                height: rs(6),
                borderRadius: rs(3),
                backgroundColor: COLORS.red,
                marginRight: rs(6),
              }}
            />
            <Text
              style={{ fontSize: normalize(12), color: COLORS.inkMid, flex: 1 }}
              numberOfLines={1}
            >
              {item.to}
            </Text>
          </View>
        </View>

        {/* Meta */}
        <View style={{ alignItems: "flex-end" }}>
          <Text
            style={{
              fontSize: normalize(15),
              fontWeight: "700",
              color: COLORS.navy,
              letterSpacing: -0.3,
            }}
          >
            {item.earnings}
          </Text>
          <Text
            style={{
              fontSize: normalize(10),
              color: COLORS.gray500,
              marginTop: rs(2),
            }}
          >
            {item.distance}
          </Text>
          <Text
            style={{
              fontSize: normalize(10),
              color: COLORS.gray300,
              marginTop: rs(1),
            }}
          >
            {item.time}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
});

// ─────────────────────────────────────────────
// STAT CHIP
// ─────────────────────────────────────────────
const StatChip = ({ label, value, sub, accentColor }) => (
  <View
    style={{
      flex: 1,
      backgroundColor: COLORS.gray50,
      padding: rs(14),
      borderRadius: BR,
      borderWidth: 1,
      borderColor: COLORS.gray100,
    }}
  >
    <Text
      style={{
        fontSize: normalize(11),
        color: accentColor,
        fontWeight: "600",
        marginBottom: rs(4),
        letterSpacing: 0.3,
      }}
    >
      {label.toUpperCase()}
    </Text>
    <Text
      style={{
        fontSize: normalize(22),
        fontWeight: "800",
        color: COLORS.navy,
        letterSpacing: -0.5,
      }}
    >
      {value}
    </Text>
    {sub ? (
      <Text
        style={{
          fontSize: normalize(10),
          color: COLORS.gray500,
          marginTop: rs(2),
        }}
      >
        {sub}
      </Text>
    ) : null}
  </View>
);

// ─────────────────────────────────────────────
// SECTION HEADER
// ─────────────────────────────────────────────
const SectionHeader = ({ icon, title, subtitle }) => (
  <View
    style={{ flexDirection: "row", alignItems: "center", marginBottom: rs(18) }}
  >
    <View
      style={{
        width: rs(36),
        height: rs(36),
        borderRadius: rs(10),
        backgroundColor: COLORS.navy,
        justifyContent: "center",
        alignItems: "center",
        marginRight: rs(12),
      }}
    >
      <Ionicons name={icon} size={rs(18)} color={COLORS.orange} />
    </View>
    <View style={{ flex: 1 }}>
      <Text
        style={{
          fontSize: normalize(16),
          fontWeight: "700",
          color: COLORS.navy,
          letterSpacing: -0.3,
        }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={{
            fontSize: normalize(11),
            color: COLORS.gray500,
            marginTop: rs(1),
          }}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  </View>
);

// ─────────────────────────────────────────────
// MISSION PROGRESS
// ─────────────────────────────────────────────
const MissionProgress = memo(({ missionProgress }) => {
  if (!missionProgress) return null;
  const pct = Math.min(
    (missionProgress.actual_rides / missionProgress.target_rides) * 100,
    100,
  );
  const done = pct >= 100;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: done ? COLORS.greenLight : COLORS.gray50,
        padding: rs(12),
        borderRadius: BR,
        borderWidth: 1,
        borderColor: done ? COLORS.green + "30" : COLORS.gray100,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: rs(8),
        }}
      >
        <Text
          style={{
            fontSize: normalize(12),
            fontWeight: "700",
            color: COLORS.navy,
          }}
        >
          🎯 Mission
        </Text>
        <Text
          style={{
            fontSize: normalize(11),
            fontWeight: "700",
            color: done ? COLORS.green : COLORS.gray500,
          }}
        >
          {missionProgress.actual_rides}/{missionProgress.target_rides}
        </Text>
      </View>
      {/* Progress bar */}
      <View
        style={{
          height: rs(4),
          backgroundColor: COLORS.gray100,
          borderRadius: rs(2),
          overflow: "hidden",
          marginBottom: rs(8),
        }}
      >
        <View
          style={{
            width: `${pct}%`,
            height: "100%",
            backgroundColor: done ? COLORS.green : COLORS.orange,
            borderRadius: rs(2),
          }}
        />
      </View>
      <Text
        style={{
          fontSize: normalize(11),
          color: done ? COLORS.green : COLORS.gray500,
        }}
      >
        {done
          ? `₱${missionProgress.bonus_amount} bonus earned!`
          : `${missionProgress.target_rides - missionProgress.actual_rides} rides → ₱${missionProgress.bonus_amount}`}
      </Text>
    </View>
  );
});

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export default function DriverHomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [activeTab, setActiveTab] = useState("earnings");
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [locationSubscription, setLocationSubscription] = useState(null);
  const [locationPermission, setLocationPermission] = useState(false);

  const appState = useRef(AppState.currentState);

  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [subscriptionCheckInProgress, setSubscriptionCheckInProgress] =
    useState(false);
  const [heartbeatInterval, setHeartbeatInterval] = useState(null);
  const [subscriptionExpiryCheckInterval, setSubscriptionExpiryCheckInterval] =
    useState(null);
  const [isToggling, setIsToggling] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(Date.now());

  const autoRefreshInterval = useRef(null);
  const isScreenFocused = useRef(true);
  const initialLoadComplete = useRef(false);
  const isFetching = useRef(false);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    title: "",
    message: "",
    type: "info",
    onConfirm: null,
    confirmText: null,
    cancelText: null,
  });

  const dataCache = useRef({
    today: null,
    recent: null,
    weekly: null,
    subscription: null,
    mission: null,
    notifications: null,
    rank: null,
    timestamp: null,
  });

  const [todayEarnings, setTodayEarnings] = useState(0);
  const [todayTrips, setTodayTrips] = useState(0);
  const [recentTrips, setRecentTrips] = useState([]);
  const [weeklyData, setWeeklyData] = useState({
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    earnings: [0, 0, 0, 0, 0, 0, 0],
    trips: [0, 0, 0, 0, 0, 0, 0],
  });
  const [activeSubscription, setActiveSubscription] = useState(null);
  const [missionProgress, setMissionProgress] = useState(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [driverRank, setDriverRank] = useState({
    currentRank: 1,
    level: "Bronze",
    points: 0,
  });

  const [dimensions, setDimensions] = useState(Dimensions.get("window"));

  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => {
      setDimensions(window);
    });

    return () => sub?.remove?.();
  }, []);

  const chartCardPadding = rs(18); // Performance card padding
  const chartBoxPadding = rs(8); // inner chart box padding
  const safeChartInset = rs(10); // extra allowance para hindi sumobra

  const chartWidth = Math.max(
    220,
    dimensions.width -
      HP * 2 -
      chartCardPadding * 2 -
      chartBoxPadding * 2 -
      safeChartInset,
  );

  // Toggle animation
  const toggleAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(toggleAnim, {
      toValue: isOnline ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [isOnline]);
  const thumbX = toggleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [rs(2), rs(34)],
  });

  // ── HELPERS ──────────────────────────────
  const showAlert = (title, message, type = "info", options = {}) => {
    setAlertConfig({
      title,
      message,
      type,
      onConfirm: options.onConfirm || (() => setAlertVisible(false)),
      confirmText: options.confirmText || null,
      cancelText: options.cancelText || null,
    });
    setAlertVisible(true);
  };

  // ── FOCUS TRACKING ───────────────────────
  useFocusEffect(
    useCallback(() => {
      isScreenFocused.current = true;
      return () => {
        isScreenFocused.current = false;
      };
    }, []),
  );

  // ── HEARTBEAT ────────────────────────────
  const sendHeartbeat = useCallback(async () => {
    if (!driver?.id || !isOnline) return;
    try {
      const now = new Date().toISOString();
      await supabase
        .from("driver_locations")
        .update({ last_heartbeat: now, is_online: true, last_updated: now })
        .eq("driver_id", driver.id);
    } catch (err) {
      console.log("Heartbeat error:", err);
    }
  }, [driver?.id, isOnline]);

  useEffect(() => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      setHeartbeatInterval(null);
    }
    if (driver?.id && isOnline) {
      let isActive = true,
        timeoutId = null;
      const scheduleHeartbeat = () => {
        if (!isActive || !isOnline) return;
        sendHeartbeat();
        timeoutId = setTimeout(scheduleHeartbeat, 15000);
      };
      scheduleHeartbeat();
      setHeartbeatInterval(timeoutId);
      return () => {
        isActive = false;
        if (timeoutId) clearTimeout(timeoutId);
      };
    }
  }, [driver?.id, isOnline, sendHeartbeat]);

  // ── AUTO REFRESH ─────────────────────────
  const checkAndRefresh = useCallback(async () => {
    if (!driver?.id || !isScreenFocused.current) return;
    try {
      const { data, error } = await supabase
        .from("drivers")
        .select("is_active, online_status")
        .eq("id", driver.id)
        .single();
      if (error) throw error;
      const dbOnline =
        data.is_active === true || data.online_status === "online";
      if (dbOnline !== isOnline) {
        setIsOnline(dbOnline);
        showAlert(
          "Status Synced",
          dbOnline ? "You are now online" : "You are now offline",
          "info",
          { confirmText: "OK" },
        );
        if (dbOnline && !locationSubscription)
          await startLocationUpdates(driver.id);
        else if (!dbOnline && locationSubscription)
          await stopLocationUpdates(driver.id);
      }
      setLastRefreshTime(Date.now());
    } catch (err) {
      console.log("Auto-refresh error:", err);
    }
  }, [driver?.id, isOnline, locationSubscription]);

  useEffect(() => {
    if (autoRefreshInterval.current) clearInterval(autoRefreshInterval.current);
    if (driver?.id)
      autoRefreshInterval.current = setInterval(checkAndRefresh, 30000);
    return () => {
      if (autoRefreshInterval.current)
        clearInterval(autoRefreshInterval.current);
    };
  }, [driver?.id, checkAndRefresh]);

  // ── SUBSCRIPTION ─────────────────────────
  const fetchActiveSubscription = useCallback(
    async (driverId, useCache = true) => {
      if (!driverId) return null;
      if (
        useCache &&
        dataCache.current.subscription &&
        dataCache.current.timestamp &&
        Date.now() - dataCache.current.timestamp < 30000
      )
        return dataCache.current.subscription;
      try {
        const { data, error } = await supabase
          .from("driver_subscriptions")
          .select(
            "id, plan_id, start_date, end_date, status, subscription_plans (plan_name, plan_type, price)",
          )
          .eq("driver_id", driverId)
          .in("status", ["active", "expired"])
          .order("end_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) {
          console.log("Subscription fetch error:", error.message);
          dataCache.current.subscription = null;
          return null;
        }
        dataCache.current.subscription = data;
        return data;
      } catch (err) {
        console.log("Exception fetching subscription:", err.message);
        return null;
      }
    },
    [],
  );

  const checkAndHandleSubscription = useCallback(
    async (driverId, currentOnlineStatus) => {
      if (!isScreenFocused.current || !driverId || subscriptionCheckInProgress)
        return currentOnlineStatus;
      try {
        setSubscriptionCheckInProgress(true);
        const subscription = await fetchActiveSubscription(driverId, false);
        setActiveSubscription(subscription);
        let hasValidSubscription = !!(
          subscription &&
          subscription.status === "active" &&
          new Date(subscription.end_date) > new Date()
        );
        setHasActiveSubscription(hasValidSubscription);
        if (subscription && !hasValidSubscription && currentOnlineStatus) {
          setIsOnline(false);
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            setHeartbeatInterval(null);
          }
          const now = new Date().toISOString();
          await supabase
            .from("drivers")
            .update({
              is_active: false,
              online_status: "offline",
              updated_at: now,
            })
            .eq("id", driverId);
          await stopLocationUpdates(driverId);
          if (
            subscription.status === "expired" ||
            new Date(subscription.end_date) <= new Date()
          ) {
            showAlert(
              "Subscription Expired",
              "Your subscription has expired. You've been set offline.",
              "warning",
              {
                confirmText: "Renew Now",
                onConfirm: () => {
                  setAlertVisible(false);
                  navigation.navigate("SubscriptionScreen");
                },
                cancelText: "Later",
              },
            );
          } else {
            showAlert(
              "Subscription Inactive",
              `Your subscription is ${subscription.status}. Please contact support.`,
              "warning",
              {
                confirmText: "Contact Support",
                onConfirm: () => {
                  setAlertVisible(false);
                  navigation.navigate("SupportScreen");
                },
                cancelText: "OK",
              },
            );
          }
          return false;
        }
        return currentOnlineStatus;
      } catch (err) {
        console.log("Error checking subscription:", err);
        return currentOnlineStatus;
      } finally {
        setSubscriptionCheckInProgress(false);
      }
    },
    [heartbeatInterval, navigation, fetchActiveSubscription],
  );

  useEffect(() => {
    if (!driver?.id) return;
    if (subscriptionExpiryCheckInterval)
      clearInterval(subscriptionExpiryCheckInterval);
    const interval = setInterval(async () => {
      if (isOnline && isScreenFocused.current)
        await checkAndHandleSubscription(driver.id, isOnline);
    }, 60000);
    setSubscriptionExpiryCheckInterval(interval);
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [driver?.id, isOnline, checkAndHandleSubscription]);

  // ── LOCATION ─────────────────────────────
  const setupLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        showAlert(
          "Permission Denied",
          "Location access is required to go online.",
          "error",
          { confirmText: "OK" },
        );
        setLocationPermission(false);
        return false;
      }
      setLocationPermission(true);
      return true;
    } catch (err) {
      console.log("Location permission error:", err);
      return false;
    }
  };

  const startLocationUpdates = async (driverId) => {
    try {
      if (locationSubscription) locationSubscription.remove();
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const now = new Date().toISOString();
      const { data: existing } = await supabase
        .from("driver_locations")
        .select("id")
        .eq("driver_id", driverId)
        .maybeSingle();
      const locationData = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        is_online: true,
        last_updated: now,
        last_heartbeat: now,
        accuracy: location.coords.accuracy,
        speed: location.coords.speed,
        heading: location.coords.heading,
      };
      if (existing)
        await supabase
          .from("driver_locations")
          .update(locationData)
          .eq("driver_id", driverId);
      else
        await supabase
          .from("driver_locations")
          .insert({ driver_id: driverId, ...locationData });
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 10000,
          distanceInterval: 20,
        },
        async (newLocation) => {
          try {
            const updateNow = new Date().toISOString();
            await supabase
              .from("driver_locations")
              .update({
                latitude: newLocation.coords.latitude,
                longitude: newLocation.coords.longitude,
                is_online: true,
                last_updated: updateNow,
                last_heartbeat: updateNow,
                accuracy: newLocation.coords.accuracy,
                speed: newLocation.coords.speed,
                heading: newLocation.coords.heading,
              })
              .eq("driver_id", driverId);
          } catch (err) {
            console.log("Location update error:", err);
          }
        },
      );
      setLocationSubscription(subscription);
    } catch (err) {
      console.log("Start location updates error:", err);
    }
  };

  const stopLocationUpdates = async (driverId) => {
    try {
      if (locationSubscription) {
        locationSubscription.remove();
        setLocationSubscription(null);
      }
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        setHeartbeatInterval(null);
      }
      const now = new Date().toISOString();
      await supabase
        .from("driver_locations")
        .update({ is_online: false, last_updated: now, last_heartbeat: now })
        .eq("driver_id", driverId);
    } catch (err) {
      console.log("Stop location updates error:", err);
    }
  };

  // ── DATA FETCHING ─────────────────────────
  const fetchTodayEarnings = useCallback(async (driverId, useCache = true) => {
    if (!driverId) return null;
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const { data, error } = await supabase
        .from("bookings")
        .select("fare, actual_fare, payment_method, payment_type")
        .eq("driver_id", driverId)
        .eq("status", "completed")
        .gte("ride_completed_at", today.toISOString())
        .lt("ride_completed_at", tomorrow.toISOString());
      if (error) throw error;
      let total = 0;
      if (data?.length) {
        for (const b of data) {
          const e =
            b.actual_fare !== null && b.actual_fare !== undefined
              ? b.actual_fare
              : b.fare || 0;
          total += e;
        }
      }
      const result = { total, tripsCount: data?.length || 0 };
      dataCache.current.today = result;
      return result;
    } catch (err) {
      console.log("Fetch today earnings error:", err.message);
      return null;
    }
  }, []);

  const fetchRecentTrips = useCallback(async (driverId, useCache = true) => {
    if (!driverId) return [];
    if (
      useCache &&
      dataCache.current.recent &&
      dataCache.current.timestamp &&
      Date.now() - dataCache.current.timestamp < 60000
    )
      return dataCache.current.recent;
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, pickup_location, dropoff_location, fare, distance_km, ride_completed_at, status, payment_method, payment_type",
        )
        .eq("driver_id", driverId)
        .eq("status", "completed")
        .order("ride_completed_at", { ascending: false })
        .limit(10);
      if (error) {
        console.log("Recent trips error:", error.message);
        return [];
      }
      const formattedTrips =
        data?.map((trip) => {
          const paymentMethod =
            trip.payment_method || trip.payment_type || "cash";
          return {
            id: trip.id,
            from: trip.pickup_location?.split(",")[0] || "Pickup",
            to: trip.dropoff_location?.split(",")[0] || "Dropoff",
            distance: trip.distance_km
              ? `${trip.distance_km.toFixed(1)} km`
              : "—",
            earnings: `₱${Number(trip.fare || 0).toFixed(2)}`,
            time: trip.ride_completed_at
              ? new Date(trip.ride_completed_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—",
            paymentMethod,
          };
        }) || [];
      dataCache.current.recent = formattedTrips;
      return formattedTrips;
    } catch (err) {
      console.log("Fetch recent trips error:", err.message);
      return [];
    }
  }, []);

  const fetchWeeklyData = useCallback(async (driverId, useCache = true) => {
    if (!driverId) return null;
    if (
      useCache &&
      dataCache.current.weekly &&
      dataCache.current.timestamp &&
      Date.now() - dataCache.current.timestamp < 60000
    )
      return dataCache.current.weekly;
    try {
      const today = new Date(),
        dayOfWeek = today.getDay();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(
        today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1),
      );
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);
      const { data, error } = await supabase
        .from("bookings")
        .select("fare, ride_completed_at")
        .eq("driver_id", driverId)
        .eq("status", "completed")
        .gte("ride_completed_at", startOfWeek.toISOString())
        .lt("ride_completed_at", endOfWeek.toISOString())
        .order("ride_completed_at", { ascending: true });
      if (error) {
        console.log("Weekly data error:", error.message);
        return null;
      }
      const earnings = [0, 0, 0, 0, 0, 0, 0],
        trips = [0, 0, 0, 0, 0, 0, 0];
      data?.forEach((b) => {
        if (b.ride_completed_at) {
          const date = new Date(b.ride_completed_at);
          let di = date.getDay();
          di = di === 0 ? 6 : di - 1;
          earnings[di] += Number(b.fare || 0);
          trips[di] += 1;
        }
      });
      const result = {
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        earnings,
        trips,
      };
      dataCache.current.weekly = result;
      return result;
    } catch (err) {
      console.log("Fetch weekly data error:", err.message);
      return null;
    }
  }, []);

  const fetchMissionProgress = useCallback(
    async (driverId, useCache = true) => {
      if (!driverId) return null;
      if (
        useCache &&
        dataCache.current.mission &&
        dataCache.current.timestamp &&
        Date.now() - dataCache.current.timestamp < 30000
      )
        return dataCache.current.mission;
      try {
        const today = new Date(),
          startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay() + 1);
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);
        const { data, error } = await supabase
          .from("ride_missions")
          .select("*")
          .eq("driver_id", driverId)
          .gte("week_start", startOfWeek.toISOString().split("T")[0])
          .lte("week_end", endOfWeek.toISOString().split("T")[0])
          .maybeSingle();
        if (error && error.code !== "PGRST116") {
          console.log("Mission error:", error.message);
          return null;
        }
        dataCache.current.mission = data;
        return data;
      } catch (err) {
        console.log("Fetch mission error:", err.message);
        return null;
      }
    },
    [],
  );

  const fetchUnreadNotifications = useCallback(
    async (userId, useCache = true) => {
      if (!userId) return 0;
      if (
        useCache &&
        dataCache.current.notifications !== undefined &&
        dataCache.current.timestamp &&
        Date.now() - dataCache.current.timestamp < 30000
      )
        return dataCache.current.notifications;
      try {
        const { count, error } = await supabase
          .from("notifications")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("is_read", false);
        if (error) throw error;
        dataCache.current.notifications = count || 0;
        return count || 0;
      } catch (err) {
        console.log("Error fetching notifications:", err);
        return 0;
      }
    },
    [],
  );

  const fetchDriverRank = useCallback(async (driverId, useCache = true) => {
    if (!driverId) return null;
    if (
      useCache &&
      dataCache.current.rank &&
      dataCache.current.timestamp &&
      Date.now() - dataCache.current.timestamp < 60000
    )
      return dataCache.current.rank;
    try {
      const { data: drivers, error } = await supabase
        .from("drivers")
        .select("id, first_name, last_name")
        .eq("status", "approved");
      if (error) throw error;
      const driverStats = await Promise.all(
        drivers.map(async (d) => {
          const { count, error: countError } = await supabase
            .from("bookings")
            .select("*", { count: "exact", head: true })
            .eq("driver_id", d.id)
            .eq("status", "completed");
          if (countError) throw countError;
          return { ...d, trips: count || 0, points: (count || 0) * 10 };
        }),
      );
      const sorted = driverStats.sort((a, b) => b.points - a.points);
      const idx = sorted.findIndex((d) => d.id === driverId);
      const pts = sorted[idx]?.points || 0;
      let level = "Bronze";
      if (pts >= 2000) level = "Diamond";
      else if (pts >= 1000) level = "Gold";
      else if (pts >= 500) level = "Silver";
      const result = { currentRank: idx + 1, level, points: pts };
      dataCache.current.rank = result;
      return result;
    } catch (err) {
      console.log("Error fetching rank:", err.message);
      return null;
    }
  }, []);

  // ── MAIN LOAD ─────────────────────────────
  const loadDriverData = useCallback(
    async (forceRefresh = false) => {
      if (!driver?.id || isFetching.current) return;
      try {
        isFetching.current = true;
        if (forceRefresh) dataCache.current.timestamp = null;
        if (
          !forceRefresh &&
          dataCache.current.timestamp &&
          Date.now() - dataCache.current.timestamp < 30000
        ) {
          if (dataCache.current.today) {
            setTodayEarnings(dataCache.current.today.total);
            setTodayTrips(dataCache.current.today.tripsCount);
          }
          if (dataCache.current.recent)
            setRecentTrips(dataCache.current.recent);
          if (dataCache.current.weekly) setWeeklyData(dataCache.current.weekly);
          setActiveSubscription(dataCache.current.subscription);
          setMissionProgress(dataCache.current.mission);
          setUnreadNotifications(dataCache.current.notifications || 0);
          if (dataCache.current.rank) setDriverRank(dataCache.current.rank);
          return;
        }
        const [
          todayResult,
          recentResult,
          weeklyResult,
          subscriptionResult,
          missionResult,
          notificationsResult,
          rankResult,
        ] = await Promise.all([
          fetchTodayEarnings(driver.id, false),
          fetchRecentTrips(driver.id, false),
          fetchWeeklyData(driver.id, false),
          fetchActiveSubscription(driver.id, false),
          fetchMissionProgress(driver.id, false),
          fetchUnreadNotifications(driver.id, false),
          fetchDriverRank(driver.id, false),
        ]);
        if (todayResult) {
          setTodayEarnings(todayResult.total);
          setTodayTrips(todayResult.tripsCount);
        }
        if (recentResult) setRecentTrips(recentResult);
        if (weeklyResult) setWeeklyData(weeklyResult);
        setActiveSubscription(subscriptionResult);
        if (subscriptionResult)
          setHasActiveSubscription(
            subscriptionResult.status === "active" &&
              new Date(subscriptionResult.end_date) > new Date(),
          );
        else setHasActiveSubscription(false);
        setMissionProgress(missionResult);
        setUnreadNotifications(notificationsResult);
        if (rankResult) setDriverRank(rankResult);
        dataCache.current.timestamp = Date.now();
      } catch (err) {
        console.log("Error loading driver data:", err);
      } finally {
        isFetching.current = false;
      }
    },
    [
      driver?.id,
      fetchTodayEarnings,
      fetchRecentTrips,
      fetchWeeklyData,
      fetchActiveSubscription,
      fetchMissionProgress,
      fetchUnreadNotifications,
      fetchDriverRank,
    ],
  );

  // ── INITIAL LOAD ──────────────────────────
  useEffect(() => {
    const getDriver = async () => {
      try {
        setLoading(true);
        const storedUserId = await AsyncStorage.getItem("user_id");
        if (!storedUserId) {
          setLoading(false);
          return;
        }
        const { data, error } = await supabase
          .from("drivers")
          .select(
            "id, first_name, middle_name, last_name, status, is_active, online_status, email, phone, profile_picture",
          )
          .eq("id", storedUserId)
          .single();
        if (error) {
          console.log(error.message);
          setLoading(false);
          return;
        }
        setDriver(data);
        const subscription = await fetchActiveSubscription(data.id, false);
        let hasValidSubscription = !!(
          subscription &&
          subscription.status === "active" &&
          new Date(subscription.end_date) > new Date()
        );
        setActiveSubscription(subscription);
        setHasActiveSubscription(hasValidSubscription);
        const wasOnline =
          data?.is_active === true || data?.online_status === "online";
        const shouldBeOnline =
          data?.status === "approved" && hasValidSubscription && wasOnline;
        setIsOnline(shouldBeOnline);
        await setupLocationPermission();
        if (wasOnline && !hasValidSubscription) {
          await supabase
            .from("drivers")
            .update({
              is_active: false,
              online_status: "offline",
              updated_at: new Date().toISOString(),
            })
            .eq("id", data.id);
        } else if (shouldBeOnline) {
          await startLocationUpdates(data.id);
        }
        await loadDriverData(true);
        initialLoadComplete.current = true;
      } catch (err) {
        console.log(err.message);
      } finally {
        setLoading(false);
      }
    };
    getDriver();
  }, []);

  // ── PULL-TO-REFRESH ───────────────────────
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await checkAndRefresh();
    await loadDriverData(true);
    if (driver?.id && isScreenFocused.current)
      await checkAndHandleSubscription(driver.id, isOnline);
    setRefreshing(false);
    showAlert("Updated", "Your dashboard is up to date.", "success", {
      confirmText: "OK",
    });
  }, [
    loadDriverData,
    driver?.id,
    isOnline,
    checkAndHandleSubscription,
    checkAndRefresh,
  ]);

  // ── FOCUS EFFECT ──────────────────────────
  useFocusEffect(
    useCallback(() => {
      if (initialLoadComplete.current && driver?.id) {
        const cacheAge = dataCache.current.timestamp
          ? Date.now() - dataCache.current.timestamp
          : Infinity;
        if (cacheAge > 30000) loadDriverData(false);
        if (isOnline) checkAndHandleSubscription(driver.id, isOnline);
      }
    }, [driver?.id, loadDriverData, isOnline, checkAndHandleSubscription]),
  );

  // ── CLEANUP ───────────────────────────────
  useEffect(() => {
    return () => {
      if (locationSubscription) locationSubscription.remove();
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (subscriptionExpiryCheckInterval)
        clearInterval(subscriptionExpiryCheckInterval);
    };
  }, [
    locationSubscription,
    heartbeatInterval,
    subscriptionExpiryCheckInterval,
  ]);

  // ── APP STATE ─────────────────────────────
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      async (nextAppState) => {
        const prev = appState.current;
        appState.current = nextAppState;
        if (prev.match(/inactive|background/) && nextAppState === "active") {
          if (driver?.id) {
            await loadDriverData(false);
            await checkAndRefresh();
            if (isScreenFocused.current) {
              const newStatus = await checkAndHandleSubscription(
                driver.id,
                isOnline,
              );
              if (newStatus && isOnline && !locationSubscription)
                await startLocationUpdates(driver.id);
              else if (newStatus && isOnline) {
                await sendHeartbeat();
                try {
                  const location = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.High,
                  });
                  await supabase
                    .from("driver_locations")
                    .update({
                      latitude: location.coords.latitude,
                      longitude: location.coords.longitude,
                      last_updated: new Date().toISOString(),
                      last_heartbeat: new Date().toISOString(),
                    })
                    .eq("driver_id", driver.id);
                } catch (err) {
                  console.log("Error refreshing location:", err);
                }
              }
            }
          }
        } else if (nextAppState === "background") {
          if (isOnline && driver?.id) {
            try {
              const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High,
              });
              const now = new Date().toISOString();
              await supabase
                .from("driver_locations")
                .update({
                  latitude: location.coords.latitude,
                  longitude: location.coords.longitude,
                  last_updated: now,
                  last_heartbeat: now,
                  is_online: true,
                })
                .eq("driver_id", driver.id);
              await supabase
                .from("drivers")
                .update({ last_online: now, updated_at: now })
                .eq("id", driver.id);
            } catch (err) {
              console.log("Error updating location before background:", err);
            }
            if (isScreenFocused.current)
              showAlert(
                "App Backgrounded",
                "Keep the app open to receive bookings.",
                "info",
                { confirmText: "OK" },
              );
          }
        }
      },
    );
    return () => subscription.remove();
  }, [
    isOnline,
    driver?.id,
    loadDriverData,
    locationSubscription,
    checkAndHandleSubscription,
    sendHeartbeat,
    checkAndRefresh,
  ]);

  // ── TOGGLE AVAILABILITY ───────────────────
  const toggleAvailability = async () => {
    if (isToggling) return;
    if (!driver || driver.status !== "approved") {
      showAlert(
        "Not Approved",
        "Your account is pending approval.",
        "warning",
        { confirmText: "OK" },
      );
      return;
    }
    setIsToggling(true);
    const newOnlineStatus = !isOnline;
    setIsOnline(newOnlineStatus);
    try {
      if (newOnlineStatus) {
        const subscription = await fetchActiveSubscription(driver.id, false);
        const hasValid = !!(
          subscription &&
          subscription.status === "active" &&
          new Date(subscription.end_date) > new Date()
        );
        setActiveSubscription(subscription);
        setHasActiveSubscription(hasValid);
        if (!hasValid) {
          setIsOnline(false);
          let message = "You need an active subscription to go online.";
          if (subscription?.status === "expired")
            message = "Your subscription has expired. Renew to go online.";
          else if (subscription && subscription.status !== "active")
            message = `Your subscription is ${subscription.status}. Contact support.`;
          showAlert("Subscription Required", message, "warning", {
            confirmText:
              subscription?.status === "expired" ? "Renew Now" : "Subscribe",
            onConfirm: () => {
              setAlertVisible(false);
              navigation.navigate("SubscriptionScreen");
            },
            cancelText: "Cancel",
          });
          setIsToggling(false);
          return;
        }
      }
      if (newOnlineStatus && !locationPermission) {
        const granted = await setupLocationPermission();
        if (!granted) {
          setIsOnline(false);
          setIsToggling(false);
          return;
        }
      }
      const now = new Date().toISOString();
      await Promise.all([
        supabase
          .from("drivers")
          .update({
            is_active: newOnlineStatus,
            online_status: newOnlineStatus ? "online" : "offline",
            updated_at: now,
          })
          .eq("id", driver.id),
        newOnlineStatus
          ? startLocationUpdates(driver.id)
          : stopLocationUpdates(driver.id),
      ]);
      showAlert(
        newOnlineStatus ? "You're Online" : "You're Offline",
        newOnlineStatus ? "Ready to accept bookings." : "Bookings are paused.",
        newOnlineStatus ? "success" : "info",
        { confirmText: "OK" },
      );
    } catch (err) {
      console.log(err.message);
      setIsOnline(!newOnlineStatus);
      showAlert("Error", "Failed to update status. Try again.", "error", {
        confirmText: "OK",
      });
    } finally {
      setIsToggling(false);
      setLastRefreshTime(Date.now());
    }
  };

  const renderTrip = useCallback(
    ({ item }) => <TripItem item={item} navigation={navigation} />,
    [navigation],
  );
  const limitedRecentTrips = recentTrips.slice(0, RECENT_TRIPS_DISPLAY_LIMIT);
  const hasMoreTrips = recentTrips.length > RECENT_TRIPS_DISPLAY_LIMIT;
  // Rank helpers
  const levelMap = {
    Diamond: { icon: "diamond-outline", color: "#06B6D4", label: "Diamond" },
    Gold: { icon: "trophy-outline", color: COLORS.orange, label: "Gold" },
    Silver: { icon: "medal-outline", color: "#8B9EB7", label: "Silver" },
    Bronze: { icon: "ribbon-outline", color: "#A0663C", label: "Bronze" },
  };
  const rankInfo = levelMap[driverRank?.level] || levelMap.Bronze;

  const subExpired =
    activeSubscription &&
    (activeSubscription.status === "expired" ||
      new Date(activeSubscription.end_date) <= new Date());
  const subInactive =
    activeSubscription &&
    activeSubscription.status !== "active" &&
    activeSubscription.status !== "expired";

  const driverName = driver
    ? `${driver.first_name}${driver.middle_name ? " " + driver.middle_name : ""} ${driver.last_name}`
    : "Driver";
  const isApproved = driver?.status === "approved";
  const canToggle = isApproved && hasActiveSubscription;

  // ── STATUS TEXT ───────────────────────────
  const statusText = () => {
    if (!isApproved) return "Pending approval";
    if (!hasActiveSubscription)
      return activeSubscription?.status === "expired"
        ? "Subscription expired"
        : "Subscription required";
    return isOnline ? "Accepting bookings" : "Not accepting bookings";
  };

  // ── LOADING ───────────────────────────────
  if (loading && !refreshing) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.white,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
        <ActivityIndicator size="large" color={COLORS.navy} />
        <Text
          style={{
            marginTop: rs(12),
            color: COLORS.gray500,
            fontSize: normalize(13),
            letterSpacing: 0.2,
          }}
        >
          Loading…
        </Text>
      </View>
    );
  }

  // ══════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.gray50 }}>
      <StatusBar barStyle="light-content" />
        {/* ═══════════ HEADER ═══════════ */}
        <View
          style={{
            backgroundColor: COLORS.navy,
            paddingTop: insets.top + rs(12),
            paddingBottom: rs(24),
            paddingHorizontal: HP,
          }}
        >
          {/* Top row */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: rs(20),
            }}
          >
            {/* Logo */}
            <Pressable onPress={() => navigation.navigate("account")}>
              <RN.Image
                source={
                  driver?.profile_picture
                    ? { uri: driver.profile_picture }
                    : require("../../assets/logo-sakayna.png")
                }
                resizeMode="cover"
                style={{
                  width: rs(40),
                  height: rs(40),
                  borderRadius: rs(20),
                  borderWidth: 2,
                  borderColor: COLORS.white,
                  backgroundColor: "rgba(255,255,255,0.12)",
                }}
              />
            </Pressable>

            {/* Right: notifications + rank */}
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: rs(8) }}
            >
              {/* Notifications bell */}
              <Pressable
                onPress={() => navigation.navigate("inbox")}
                style={{
                  width: rs(38),
                  height: rs(38),
                  borderRadius: rs(10),
                  backgroundColor: "rgba(255,255,255,0.1)",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons
                  name="notifications-outline"
                  size={rs(20)}
                  color={COLORS.white}
                />
                {unreadNotifications > 0 && (
                  <View
                    style={{
                      position: "absolute",
                      top: rs(6),
                      right: rs(6),
                      width: rs(8),
                      height: rs(8),
                      borderRadius: rs(4),
                      backgroundColor: COLORS.orange,
                      borderWidth: 1.5,
                      borderColor: COLORS.navy,
                    }}
                  />
                )}
              </Pressable>

              {/* Rank badge */}
              <Pressable
                onPress={() => navigation.navigate("RankingPage")}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: rs(10),
                  paddingVertical: rs(6),
                  backgroundColor: "rgba(255,255,255,0.1)",
                  borderRadius: rs(10),
                  gap: rs(5),
                }}
              >
                <Ionicons
                  name={rankInfo.icon}
                  size={rs(16)}
                  color={rankInfo.color}
                />
                <Text
                  style={{
                    fontSize: normalize(12),
                    fontWeight: "700",
                    color: COLORS.white,
                  }}
                >
                  #{driverRank?.currentRank || "—"}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Driver info row */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: normalize(13),
                  color: "rgba(255,255,255,0.5)",
                  marginBottom: rs(2),
                  letterSpacing: 0.3,
                }}
              >
                {new Date().toLocaleDateString("en-PH", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </Text>
              <Text
                style={{
                  fontSize: normalize(20),
                  fontWeight: "800",
                  color: COLORS.white,
                  letterSpacing: -0.5,
                }}
                numberOfLines={1}
              >
                {driverName}
              </Text>
            </View>

            {/* Status pills */}
            <View style={{ alignItems: "flex-end", gap: rs(5) }}>
              <Pill
                label={
                  driver?.status === "approved"
                    ? "VERIFIED"
                    : driver?.status?.replace("_", " ").toUpperCase() ||
                      "INACTIVE"
                }
                color={isApproved ? COLORS.green : COLORS.orange}
                bg={
                  isApproved ? "rgba(22,163,74,0.15)" : "rgba(233,122,62,0.2)"
                }
              />
              <Pill
                label={isOnline ? "● ONLINE" : "○ OFFLINE"}
                color={isOnline ? COLORS.green : "rgba(255,255,255,0.5)"}
                bg={
                  isOnline ? "rgba(22,163,74,0.15)" : "rgba(255,255,255,0.07)"
                }
              />
            </View>
          </View>
        </View>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.navy}
            colors={[COLORS.navy]}
          />
        }
        removeClippedSubviews
        maxToRenderPerBatch={5}
        windowSize={5}
        contentContainerStyle={{
    paddingTop: rs(10), // adjust mo depende sa design
    paddingBottom: insets.bottom + rs(90),
  }}
      >
        

        {/* ═══════════ WARNING BANNERS ═══════════ */}
        {driver && !isApproved && (
          <WarningBanner
            icon={
              ["rejected", "suspended"].includes(driver.status)
                ? "alert-circle-outline"
                : "time-outline"
            }
            title={
              driver.status === "pending"
                ? "Verification Pending"
                : driver.status === "under_review"
                  ? "Under Review"
                  : driver.status === "rejected"
                    ? "Documents Rejected"
                    : "Account Suspended"
            }
            body={
              driver.status === "pending"
                ? "Complete verification to start accepting bookings."
                : driver.status === "under_review"
                  ? "Your documents are being reviewed. Check back soon."
                  : driver.status === "rejected"
                    ? "Your documents did not pass. Please resubmit."
                    : "Your account is suspended. Contact support."
            }
            accentColor={
              ["rejected", "suspended"].includes(driver.status)
                ? COLORS.red
                : COLORS.orange
            }
            bgColor={
              ["rejected", "suspended"].includes(driver.status)
                ? COLORS.redLight
                : COLORS.orangeLight
            }
            buttonLabel={
              driver.status === "pending" || driver.status === "rejected"
                ? driver.status === "pending"
                  ? "Complete Verification"
                  : "Resubmit Documents"
                : null
            }
            onPress={() => navigation.navigate("DriverVerificationScreen")}
          />
        )}

        {isApproved &&
          !hasActiveSubscription &&
          activeSubscription === null && (
            <WarningBanner
              icon="card-outline"
              title="No Active Subscription"
              body="Subscribe to go online and accept bookings."
              accentColor={COLORS.red}
              bgColor={COLORS.redLight}
              buttonLabel="Subscribe Now"
              onPress={() => navigation.navigate("SubscriptionScreen")}
            />
          )}
        {isApproved && subExpired && (
          <WarningBanner
            icon="time-outline"
            title="Subscription Expired"
            body={`Expired on ${new Date(activeSubscription.end_date).toLocaleDateString()}. Renew to continue.`}
            accentColor={COLORS.orange}
            bgColor={COLORS.orangeLight}
            buttonLabel="Renew Now"
            onPress={() => navigation.navigate("SubscriptionScreen")}
          />
        )}
        {isApproved && subInactive && (
          <WarningBanner
            icon="alert-circle-outline"
            title={`Subscription ${activeSubscription.status}`}
            body="Your subscription is inactive. Contact support for help."
            accentColor={COLORS.red}
            bgColor={COLORS.redLight}
            buttonLabel="Contact Support"
            onPress={() => navigation.navigate("SupportScreen")}
          />
        )}

        {/* ═══════════ EARNINGS + TOGGLE CARD ═══════════ */}
        <View
          style={{
            marginHorizontal: HP,
            marginTop: rs(16),
            backgroundColor: COLORS.white,
            borderRadius: rs(20),
            overflow: "hidden",
            borderWidth: 1,
            borderColor: COLORS.gray100,
            shadowColor: COLORS.navy,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08,
            shadowRadius: 8,
            elevation: 3,
          }}
        >
          {/* Orange accent bar */}
          <View style={{ height: rs(3), backgroundColor: COLORS.orange }} />

          <View style={{ padding: rs(18) }}>
            {/* Row: stats + toggle */}
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {/* Today earnings */}
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: normalize(11),
                    color: COLORS.gray500,
                    letterSpacing: 0.5,
                    marginBottom: rs(2),
                  }}
                >
                  TODAY'S EARNINGS
                </Text>
                <Text
                  style={{
                    fontSize: normalize(32),
                    fontWeight: "800",
                    color: COLORS.navy,
                    letterSpacing: -1,
                  }}
                >
                  ₱{todayEarnings.toFixed(0)}
                </Text>
                <Text
                  style={{
                    fontSize: normalize(12),
                    color: COLORS.gray500,
                    marginTop: rs(2),
                  }}
                >
                  {todayTrips} {todayTrips === 1 ? "trip" : "trips"} completed
                </Text>
              </View>

              {/* Divider */}
              <View
                style={{
                  width: 1,
                  height: rs(56),
                  backgroundColor: COLORS.gray100,
                  marginHorizontal: rs(16),
                }}
              />

              {/* Toggle */}
              <View style={{ alignItems: "center" }}>
                <Pressable
                  onPress={toggleAvailability}
                  disabled={!canToggle || isToggling}
                  style={{
                    width: rs(66),
                    height: rs(34),
                    borderRadius: rs(17),
                    backgroundColor: !canToggle
                      ? COLORS.gray300
                      : isOnline
                        ? COLORS.navy
                        : COLORS.gray100,
                    justifyContent: "center",
                    paddingHorizontal: rs(2),
                    borderWidth: 1,
                    borderColor: !canToggle
                      ? COLORS.gray300
                      : isOnline
                        ? COLORS.navy
                        : COLORS.gray300,
                  }}
                >
                  {isToggling ? (
                    <View style={{ alignItems: "center" }}>
                      <ActivityIndicator
                        size="small"
                        color={isOnline ? COLORS.white : COLORS.gray500}
                      />
                    </View>
                  ) : (
                    <Animated.View
                      style={{
                        width: rs(28),
                        height: rs(28),
                        borderRadius: rs(14),
                        backgroundColor: COLORS.white,
                        transform: [{ translateX: thumbX }],
                        shadowColor: COLORS.navy,
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.15,
                        shadowRadius: 3,
                        elevation: 2,
                      }}
                    />
                  )}
                </Pressable>
                <Text
                  style={{
                    marginTop: rs(6),
                    fontSize: normalize(10),
                    fontWeight: "700",
                    letterSpacing: 0.5,
                    color: isOnline ? COLORS.navy : COLORS.gray300,
                  }}
                >
                  {isOnline ? "ONLINE" : "OFFLINE"}
                </Text>
              </View>
            </View>

            {/* Status caption */}
            <View
              style={{
                marginTop: rs(14),
                paddingTop: rs(12),
                borderTopWidth: 1,
                borderTopColor: COLORS.gray100,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: rs(6),
                  height: rs(6),
                  borderRadius: rs(3),
                  backgroundColor: !canToggle
                    ? COLORS.gray300
                    : isOnline
                      ? COLORS.green
                      : COLORS.gray300,
                  marginRight: rs(7),
                }}
              />
              <Text
                style={{
                  fontSize: normalize(12),
                  color: !canToggle
                    ? COLORS.gray300
                    : isOnline
                      ? COLORS.navy
                      : COLORS.gray500,
                }}
              >
                {statusText()}
              </Text>
            </View>
          </View>
        </View>

        {/* ═══════════ SUBSCRIPTION + MISSION ROW ═══════════ */}
        {(hasActiveSubscription || missionProgress) && (
          <View
            style={{
              marginHorizontal: HP,
              marginTop: rs(10),
              flexDirection: "row",
              gap: rs(8),
            }}
          >
            {hasActiveSubscription && (
              <Pressable
                onPress={() => navigation.navigate("SubscriptionScreen")}
                style={{
                  flex: 1,
                  backgroundColor: COLORS.white,
                  padding: rs(14),
                  borderRadius: BR,
                  borderWidth: 1,
                  borderColor: COLORS.gray100,
                  shadowColor: COLORS.navy,
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 4,
                  elevation: 2,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: rs(8),
                  }}
                >
                  <View
                    style={{
                      width: rs(28),
                      height: rs(28),
                      borderRadius: rs(8),
                      backgroundColor: COLORS.greenLight,
                      justifyContent: "center",
                      alignItems: "center",
                      marginRight: rs(8),
                    }}
                  >
                    <Ionicons
                      name="card-outline"
                      size={rs(15)}
                      color={COLORS.green}
                    />
                  </View>
                  <Text
                    style={{
                      fontSize: normalize(12),
                      fontWeight: "700",
                      color: COLORS.navy,
                    }}
                    numberOfLines={1}
                  >
                    {activeSubscription?.subscription_plans?.plan_name ||
                      "Plan"}
                  </Text>
                </View>
                <Text
                  style={{ fontSize: normalize(11), color: COLORS.gray500 }}
                >
                  Exp{" "}
                  {new Date(activeSubscription?.end_date).toLocaleDateString(
                    "en-PH",
                    { month: "short", day: "numeric" },
                  )}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginTop: rs(6),
                  }}
                >
                  <Text
                    style={{
                      fontSize: normalize(11),
                      fontWeight: "600",
                      color: COLORS.orange,
                      marginRight: rs(3),
                    }}
                  >
                    Manage
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={rs(12)}
                    color={COLORS.orange}
                  />
                </View>
              </Pressable>
            )}
            {missionProgress && (
              <MissionProgress missionProgress={missionProgress} />
            )}
          </View>
        )}

        {/* ═══════════ PERFORMANCE CARD ═══════════ */}
        <View
          style={{
            marginHorizontal: HP,
            marginTop: rs(10),
            marginBottom: rs(10),
            backgroundColor: COLORS.white,
            borderRadius: rs(20),
            padding: rs(18),
            borderWidth: 1,
            borderColor: COLORS.gray100,
            shadowColor: COLORS.navy,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08,
            shadowRadius: 8,
            elevation: 3,
          }}
        >
          <SectionHeader
            icon="stats-chart-outline"
            title="Performance"
            subtitle="This week's summary"
          />

          {/* Quick stats */}
          <View
            style={{ flexDirection: "row", gap: rs(8), marginBottom: rs(18) }}
          >
            <StatChip
              label="Week Total"
              value={`₱${weeklyData.earnings.reduce((a, b) => a + b, 0).toFixed(0)}`}
              sub={`${weeklyData.trips.reduce((a, b) => a + b, 0)} trips`}
              accentColor={COLORS.navy}
            />
            <StatChip
              label="Today"
              value={`₱${todayEarnings.toFixed(0)}`}
              sub={`${todayTrips} ${todayTrips === 1 ? "trip" : "trips"}`}
              accentColor={COLORS.orange}
            />
          </View>

          {/* Tabs */}
          <View
            style={{
              flexDirection: "row",
              backgroundColor: COLORS.gray50,
              borderRadius: rs(10),
              padding: rs(3),
              marginBottom: rs(18),
              borderWidth: 1,
              borderColor: COLORS.gray100,
            }}
          >
            {["earnings", "trips"].map((tab) => (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  paddingVertical: rs(8),
                  borderRadius: rs(8),
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: rs(5),
                  backgroundColor:
                    activeTab === tab ? COLORS.navy : "transparent",
                }}
              >
                <Ionicons
                  name={tab === "earnings" ? "cash-outline" : "bicycle-outline"}
                  size={rs(15)}
                  color={activeTab === tab ? COLORS.orange : COLORS.gray500}
                />
                <Text
                  style={{
                    fontSize: normalize(12),
                    fontWeight: "600",
                    color: activeTab === tab ? COLORS.white : COLORS.gray500,
                  }}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* ─ EARNINGS TAB ─ */}
          {activeTab === "earnings" ? (
            <View>
              {!weeklyData.earnings.some((d) => d > 0) && (
                <View
                  style={{
                    backgroundColor: COLORS.gray50,
                    borderRadius: rs(12),
                    padding: rs(32),
                    marginBottom: rs(16),
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: COLORS.gray100,
                  }}
                >
                  <Ionicons
                    name="bar-chart-outline"
                    size={rs(36)}
                    color={COLORS.gray300}
                  />
                  <Text
                    style={{
                      marginTop: rs(10),
                      color: COLORS.gray300,
                      fontSize: normalize(13),
                    }}
                  >
                    No earnings this week
                  </Text>
                </View>
              )}

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  backgroundColor: COLORS.gray50,
                  borderRadius: rs(12),
                  paddingVertical: rs(12),
                  paddingHorizontal: rs(8),
                  borderWidth: 1,
                  borderColor: COLORS.gray100,
                }}
              >
                {weeklyData.labels.map((day, index) => {
                  const todayIndex =
                    new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
                  const isToday = index === todayIndex;

                  return (
                    <View
                      key={day}
                      style={{
                        alignItems: "center",
                        flex: 1,
                        minWidth: rs(32),
                      }}
                    >
                      <Text
                        style={{
                          fontSize: normalize(10),
                          color: isToday ? COLORS.orange : COLORS.gray500,
                          fontWeight: isToday ? "700" : "400",
                          marginBottom: rs(4),
                        }}
                      >
                        {isSmallScreen ? day.charAt(0) : day.slice(0, 3)}
                      </Text>
                      <Text
                        style={{
                          fontSize: normalize(11),
                          fontWeight: "700",
                          color: isToday ? COLORS.navy : COLORS.gray500,
                        }}
                      >
                        {weeklyData.earnings[index] > 0
                          ? `₱${weeklyData.earnings[index]}`
                          : "—"}
                      </Text>
                      <Text
                        style={{
                          fontSize: normalize(9),
                          color: COLORS.gray300,
                          marginTop: rs(1),
                        }}
                      >
                        {weeklyData.trips[index] > 0
                          ? `${weeklyData.trips[index]}t`
                          : ""}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : (
            /* ─ TRIPS TAB ─ */
            <View>
              {/* Trip summary */}
              <View
                style={{
                  flexDirection: "row",
                  gap: rs(8),
                  marginBottom: rs(16),
                }}
              >
                <StatChip
                  label="Week Trips"
                  value={weeklyData.trips.reduce((a, b) => a + b, 0).toString()}
                  accentColor={COLORS.navy}
                />
                <StatChip
                  label="Today Trips"
                  value={todayTrips.toString()}
                  accentColor={COLORS.orange}
                />
              </View>

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: rs(12),
                }}
              >
                <Text
                  style={{
                    fontSize: normalize(13),
                    fontWeight: "700",
                    color: COLORS.navy,
                    letterSpacing: -0.2,
                  }}
                >
                  Recent Trips
                </Text>

                {recentTrips.length > RECENT_TRIPS_DISPLAY_LIMIT && (
                  <Text
                    style={{
                      fontSize: normalize(11),
                      color: COLORS.gray500,
                      fontWeight: "600",
                    }}
                  >
                    Showing {RECENT_TRIPS_DISPLAY_LIMIT} of {recentTrips.length}
                  </Text>
                )}
              </View>

              <FlatList
                data={limitedRecentTrips}
                renderItem={renderTrip}
                keyExtractor={(item) => item.id.toString()}
                scrollEnabled={false}
                removeClippedSubviews
                maxToRenderPerBatch={3}
                initialNumToRender={3}
                ItemSeparatorComponent={() => (
                  <View style={{ height: rs(2) }} />
                )}
                ListEmptyComponent={
                  <View
                    style={{
                      paddingVertical: rs(32),
                      alignItems: "center",
                      backgroundColor: COLORS.gray50,
                      borderRadius: rs(12),
                      borderWidth: 1,
                      borderColor: COLORS.gray100,
                    }}
                  >
                    <Ionicons
                      name="bicycle-outline"
                      size={rs(36)}
                      color={COLORS.gray300}
                    />
                    <Text
                      style={{
                        marginTop: rs(10),
                        color: COLORS.gray300,
                        fontSize: normalize(13),
                      }}
                    >
                      No trips yet
                    </Text>
                  </View>
                }
              />

              {recentTrips.length > 0 && (
                <Pressable
                  onPress={() => navigation.navigate("AllTripsScreen")}
                  style={({ pressed }) => ({
                    marginTop: rs(12),
                    paddingVertical: rs(12),
                    borderRadius: rs(12),
                    borderWidth: 1,
                    borderColor: COLORS.gray100,
                    backgroundColor: pressed ? COLORS.gray100 : COLORS.gray50,
                    flexDirection: "row",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: rs(6),
                  })}
                >
                  <Text
                    style={{
                      fontSize: normalize(13),
                      fontWeight: "700",
                      color: COLORS.navy,
                    }}
                  >
                    View All Trips
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={rs(14)}
                    color={COLORS.navy}
                  />
                </Pressable>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ═══════════ ALERT MODAL ═══════════ */}
      <ModernAlert
        visible={alertVisible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={() => setAlertVisible(false)}
        onConfirm={alertConfig.onConfirm}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
      />
    </View>
  );
}
