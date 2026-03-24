// screens/driver/DriverHomeScreen.js
import React, { useState, useCallback, useRef, useEffect, memo } from "react";
import {
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "../styles/Driver/DriverHomeScreenStyles";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { LineChart } from "react-native-chart-kit";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { BlurView } from "expo-blur";

// ================= RESPONSIVE HELPERS =================
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Base width reference (iPhone 14 Pro = 390)
const BASE_WIDTH = 390;
const scale = SCREEN_WIDTH / BASE_WIDTH;

// Normalize font sizes – clamps between 0.85x and 1.2x of original
const normalize = (size) => {
  const newSize = size * Math.min(Math.max(scale, 0.85), 1.2);
  return Math.round(PixelRatio.roundToNearestPixel(newSize));
};

// Responsive spacing – clamps between 0.8x and 1.15x
const rs = (size) => Math.round(size * Math.min(Math.max(scale, 0.8), 1.15));

const isSmallScreen = SCREEN_WIDTH < 375;   // iPhone SE, older Android
const isLargeScreen = SCREEN_WIDTH >= 768;  // Tablets

const HORIZONTAL_PADDING = isLargeScreen ? rs(40) : rs(16);
const CARD_BORDER_RADIUS  = rs(20);

// ================= MODERN ALERT COMPONENT =================
const ModernAlert = ({
  visible, title, message, type,
  onClose, onConfirm, confirmText, cancelText,
}) => {
  const slideAnim   = useRef(new Animated.Value(300)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim,   { toValue: 0, duration: 300, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    } else {
      slideAnim.setValue(300);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  const getIconByType = () => {
    switch (type) {
      case "success": return { name: "checkmark-circle",    color: "#10B981" };
      case "error":   return { name: "close-circle",        color: "#EF4444" };
      case "warning": return { name: "alert-circle",        color: "#F59E0B" };
      default:        return { name: "information-circle",  color: "#3B82F6" };
    }
  };

  const icon      = getIconByType();
  const modalW    = isLargeScreen ? 400 : Math.min(SCREEN_WIDTH * 0.88, 360);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <BlurView intensity={20} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}>
        <Animated.View style={{ flex: 1, justifyContent: "center", alignItems: "center", opacity: opacityAnim }}>
          <Animated.View style={{
            backgroundColor: "#FFF",
            borderRadius: rs(28),
            width: modalW,
            padding: rs(24),
            transform: [{ translateY: slideAnim }],
            shadowColor: "#000", shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.2, shadowRadius: 20, elevation: 10,
          }}>
            {/* Icon */}
            <View style={{ alignItems: "center", marginBottom: rs(16) }}>
              <View style={{
                width: rs(64), height: rs(64), borderRadius: rs(32),
                backgroundColor: icon.color + "15",
                justifyContent: "center", alignItems: "center",
              }}>
                <Ionicons name={icon.name} size={rs(40)} color={icon.color} />
              </View>
            </View>

            <Text style={{ fontSize: normalize(20), fontWeight: "700", color: "#1F2937", textAlign: "center", marginBottom: rs(8) }}>
              {title}
            </Text>
            <Text style={{ fontSize: normalize(15), color: "#6B7280", textAlign: "center", marginBottom: rs(24), lineHeight: normalize(22) }}>
              {message}
            </Text>

            {/* Buttons */}
            <View style={{ flexDirection: "row", gap: rs(12) }}>
              {cancelText && (
                <TouchableOpacity onPress={onClose} style={{ flex: 1, paddingVertical: rs(14), borderRadius: rs(16), backgroundColor: "#F3F4F6", alignItems: "center" }}>
                  <Text style={{ fontSize: normalize(16), fontWeight: "600", color: "#4B5563" }}>{cancelText}</Text>
                </TouchableOpacity>
              )}
              {confirmText && (
                <TouchableOpacity onPress={onConfirm} style={{ flex: 1, paddingVertical: rs(14), borderRadius: rs(16), backgroundColor: "#183B5C", alignItems: "center" }}>
                  <Text style={{ fontSize: normalize(16), fontWeight: "600", color: "#FFF" }}>{confirmText}</Text>
                </TouchableOpacity>
              )}
              {!cancelText && !confirmText && (
                <TouchableOpacity onPress={onClose} style={{ flex: 1, paddingVertical: rs(14), borderRadius: rs(16), backgroundColor: "#183B5C", alignItems: "center" }}>
                  <Text style={{ fontSize: normalize(16), fontWeight: "600", color: "#FFF" }}>OK</Text>
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>
        </Animated.View>
      </BlurView>
    </Modal>
  );
};

// ================= MISSION PROGRESS =================
const MissionProgress = memo(({ missionProgress }) => {
  if (!missionProgress) return null;
  const progress = (missionProgress.actual_rides / missionProgress.target_rides) * 100;

  return (
    <View style={{
      marginHorizontal: HORIZONTAL_PADDING, marginTop: rs(10),
      padding: rs(15), backgroundColor: "#F0F9FF",
      borderRadius: CARD_BORDER_RADIUS, borderWidth: 1, borderColor: "#B2D9FF",
    }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontWeight: "bold", fontSize: normalize(16) }}>🎯 Weekly Mission</Text>
        <Text style={{ color: "#183B5C", fontWeight: "bold", fontSize: normalize(14) }}>
          {missionProgress.actual_rides}/{missionProgress.target_rides} rides
        </Text>
      </View>
      <View style={{ height: rs(8), backgroundColor: "#E5E7EB", borderRadius: rs(4), marginTop: rs(10), overflow: "hidden" }}>
        <View style={{ width: `${Math.min(progress, 100)}%`, height: "100%", backgroundColor: progress >= 100 ? "#10B981" : "#3B82F6" }} />
      </View>
      <Text style={{ marginTop: rs(8), color: progress >= 100 ? "#10B981" : "#6B7280", fontWeight: "600", fontSize: normalize(13) }}>
        {progress >= 100
          ? `🎉 Congrats! You've hit the target! ₱${missionProgress.bonus_amount} bonus coming soon!`
          : `${missionProgress.target_rides - missionProgress.actual_rides} more rides to earn ₱${missionProgress.bonus_amount} bonus!`}
      </Text>
    </View>
  );
});

// ================= TRIP ITEM =================
const TripItem = memo(({ item, navigation }) => (
  <Pressable
    style={({ pressed }) => ({
      backgroundColor: pressed ? "#F3F4F6" : "#F9FAFB",
      borderRadius: rs(16), padding: rs(14), marginBottom: rs(10),
      flexDirection: "row", alignItems: "center",
      borderWidth: 1, borderColor: "#E5E7EB",
    })}
    onPress={() => navigation.navigate("TripDetailsScreen", { tripId: item.id })}
  >
    <View style={{
      width: rs(42), height: rs(42), borderRadius: rs(12),
      backgroundColor: item.paymentColor || "#183B5C",
      justifyContent: "center", alignItems: "center", marginRight: rs(12),
    }}>
      <Ionicons
        name={item.paymentMethod === "gcash" ? "phone-portrait" : item.paymentMethod === "cash" ? "cash" : "wallet"}
        size={rs(22)} color="#FFF"
      />
    </View>

    <View style={{ flex: 1, marginRight: rs(8) }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: rs(4) }}>
        <Ionicons name="location" size={rs(12)} color="#10B981" />
        <Text style={{ fontSize: normalize(13), color: "#333", marginLeft: rs(2), flex: 1 }} numberOfLines={1}>{item.from}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Ionicons name="flag" size={rs(12)} color="#EF4444" />
        <Text style={{ fontSize: normalize(13), color: "#333", marginLeft: rs(2), flex: 1 }} numberOfLines={1}>{item.to}</Text>
      </View>
    </View>

    <View style={{ alignItems: "flex-end" }}>
      <Text style={{ fontSize: normalize(15), fontWeight: "bold", color: "#183B5C" }}>{item.earnings}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: rs(2) }}>
        <Ionicons name="time-outline" size={rs(10)} color="#9CA3AF" />
        <Text style={{ fontSize: normalize(10), color: "#9CA3AF", marginLeft: rs(2) }}>{item.distance} • {item.time}</Text>
      </View>
    </View>
  </Pressable>
));

// ================= STATUS INDICATOR =================
const StatusIndicator = ({ isOnline, lastRefreshTime }) => (
  <View style={{
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: rs(8), paddingVertical: rs(4),
    borderRadius: rs(20), marginLeft: rs(6),
  }}>
    <View style={{ width: rs(7), height: rs(7), borderRadius: rs(4), backgroundColor: isOnline ? "#10B981" : "#EF4444", marginRight: rs(4) }} />
    <Text style={{ fontSize: normalize(11), color: "#FFF", marginRight: rs(4) }}>{isOnline ? "Online" : "Offline"}</Text>
    {!isSmallScreen && (
      <Text style={{ fontSize: normalize(9), color: "rgba(255,255,255,0.7)" }}>{new Date(lastRefreshTime).toLocaleTimeString()}</Text>
    )}
  </View>
);

// ================= WARNING BANNER =================
const WarningBanner = ({ icon, title, body, buttonLabel, onPress, bgColor, borderColor, titleColor }) => (
  <View style={{
    marginHorizontal: HORIZONTAL_PADDING, marginTop: rs(15), marginBottom: rs(5),
    padding: rs(15), borderRadius: CARD_BORDER_RADIUS,
    backgroundColor: bgColor, borderWidth: 1, borderColor,
    borderLeftWidth: rs(5), borderLeftColor: titleColor,
  }}>
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: rs(8) }}>
      <Ionicons name={icon} size={rs(22)} color={titleColor} />
      <Text style={{ fontWeight: "bold", fontSize: normalize(15), color: titleColor, marginLeft: rs(8), flex: 1 }} numberOfLines={2}>{title}</Text>
    </View>
    <Text style={{ color: "#333", marginBottom: rs(12), fontSize: normalize(13), lineHeight: normalize(20) }}>{body}</Text>
    {buttonLabel && (
      <Pressable onPress={onPress} style={{ backgroundColor: "#183B5C", paddingVertical: rs(12), borderRadius: rs(10), alignItems: "center" }}>
        <Text style={{ color: "#FFF", fontWeight: "600", fontSize: normalize(15) }}>{buttonLabel}</Text>
      </Pressable>
    )}
  </View>
);

// ================= FLOATING SHOP BUTTON (COMING SOON) =================
const FloatingShopButton = ({ onPress }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  
  useEffect(() => {
    // Auto-hide tooltip after 3 seconds
    if (showTooltip) {
      const timer = setTimeout(() => setShowTooltip(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showTooltip]);

  return (
    <>
      <TouchableOpacity
        onPress={() => {
          setShowTooltip(true);
          onPress();
        }}
        style={{
          position: "absolute",
          bottom: rs(20),
          right: rs(20),
          backgroundColor: "#FF6B35",
          width: rs(56),
          height: rs(56),
          borderRadius: rs(28),
          justifyContent: "center",
          alignItems: "center",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 6,
          elevation: 8,
          zIndex: 999,
        }}
      >
        <Ionicons name="restaurant-outline" size={rs(28)} color="#FFF" />
        
        {/* Badge for coming soon */}
        <View style={{
          position: "absolute",
          top: -rs(5),
          right: -rs(5),
          backgroundColor: "#FF0000",
          borderRadius: rs(12),
          paddingHorizontal: rs(6),
          paddingVertical: rs(2),
          minWidth: rs(28),
          alignItems: "center",
        }}>
          {/* <Text style={{ color: "#FFF", fontSize: normalize(9), fontWeight: "bold" }}>
            Order Food
          </Text> */}
        </View>
      </TouchableOpacity>
      
      {/* Tooltip */}
      {showTooltip && (
        <Animated.View
          style={{
            position: "absolute",
            bottom: rs(80),
            right: rs(20),
            backgroundColor: "#1F2937",
            borderRadius: rs(12),
            paddingHorizontal: rs(12),
            paddingVertical: rs(8),
            maxWidth: rs(200),
            zIndex: 1000,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.2,
            shadowRadius: 4,
            elevation: 5,
          }}
        >
          <Text style={{ color: "#FFF", fontSize: normalize(12) }}>
            🍔 Food ordering coming soon!
          </Text>
          <View style={{
            position: "absolute",
            bottom: -rs(6),
            right: rs(20),
            width: 0,
            height: 0,
            borderLeftWidth: rs(6),
            borderRightWidth: rs(6),
            borderTopWidth: rs(6),
            borderLeftColor: "transparent",
            borderRightColor: "transparent",
            borderTopColor: "#1F2937",
          }} />
        </Animated.View>
      )}
    </>
  );
};

// ================= MAIN COMPONENT =================
export default function DriverHomeScreen() {
  const insets     = useSafeAreaInsets();
  const navigation = useNavigation();

  const [activeTab,    setActiveTab]    = useState("earnings");
  const [driver,       setDriver]       = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [isOnline,     setIsOnline]     = useState(false);
  const [locationSubscription, setLocationSubscription] = useState(null);
  const [locationPermission,   setLocationPermission]   = useState(false);

  const appState = useRef(AppState.currentState);

  const [hasActiveSubscription,        setHasActiveSubscription]        = useState(false);
  const [subscriptionCheckInProgress,  setSubscriptionCheckInProgress]  = useState(false);
  const [heartbeatInterval,            setHeartbeatInterval]            = useState(null);
  const [subscriptionExpiryCheckInterval, setSubscriptionExpiryCheckInterval] = useState(null);
  const [isToggling,   setIsToggling]   = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(Date.now());

  const autoRefreshInterval = useRef(null);
  const isScreenFocused     = useRef(true);
  const initialLoadComplete = useRef(false);
  const isFetching          = useRef(false);

  // Alert state
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig,  setAlertConfig]  = useState({ title: "", message: "", type: "info", onConfirm: null, confirmText: null, cancelText: null });

  // Data cache
  const dataCache = useRef({ today: null, recent: null, weekly: null, subscription: null, mission: null, notifications: null, rank: null, timestamp: null });

  // Earnings state
  const [todayEarnings,    setTodayEarnings]    = useState(0);
  const [todayTrips,       setTodayTrips]       = useState(0);
  const [recentTrips,      setRecentTrips]      = useState([]);
  const [weeklyData,       setWeeklyData]       = useState({ labels: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"], earnings: [0,0,0,0,0,0,0], trips: [0,0,0,0,0,0,0] });
  const [activeSubscription, setActiveSubscription] = useState(null);
  const [missionProgress,  setMissionProgress]  = useState(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [driverRank,       setDriverRank]       = useState({ currentRank: 1, level: "Bronze", points: 0 });

  // Responsive chart width – recalc on orientation change
  const [dimensions, setDimensions] = useState({ width: SCREEN_WIDTH });
  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => setDimensions({ width: window.width }));
    return () => sub?.remove();
  }, []);
  const chartWidth = dimensions.width - HORIZONTAL_PADDING * 2 - rs(40);

  // * ========= HELPERS =========
  const showAlert = (title, message, type = "info", options = {}) => {
    setAlertConfig({ title, message, type, onConfirm: options.onConfirm || (() => setAlertVisible(false)), confirmText: options.confirmText || null, cancelText: options.cancelText || null });
    setAlertVisible(true);
  };
  
  // * ========= SHOP BUTTON HANDLER =========
  const handleShopPress = () => {
    showAlert(
      "🍔 Food Ordering",
      "This feature is coming soon! Stay tuned for exciting food delivery options for drivers.",
      "info",
      { confirmText: "OK" }
    );
  };

  // * ========= FOCUS TRACKING =========
  useFocusEffect(useCallback(() => {
    isScreenFocused.current = true;
    return () => { isScreenFocused.current = false; };
  }, []));

  // * ========= HEARTBEAT =========
  const sendHeartbeat = useCallback(async () => {
    if (!driver?.id || !isOnline) return;
    try {
      const now = new Date().toISOString();
      await supabase.from("driver_locations").update({ last_heartbeat: now, is_online: true, last_updated: now }).eq("driver_id", driver.id);
    } catch (err) { console.log("Heartbeat error:", err); }
  }, [driver?.id, isOnline]);

  useEffect(() => {
    if (heartbeatInterval) { clearInterval(heartbeatInterval); setHeartbeatInterval(null); }
    if (driver?.id && isOnline) {
      let isActive = true, timeoutId = null;
      const scheduleHeartbeat = () => {
        if (!isActive || !isOnline) return;
        sendHeartbeat();
        timeoutId = setTimeout(scheduleHeartbeat, 15000);
      };
      scheduleHeartbeat();
      setHeartbeatInterval(timeoutId);
      return () => { isActive = false; if (timeoutId) clearTimeout(timeoutId); };
    }
  }, [driver?.id, isOnline, sendHeartbeat]);

  // * ========= AUTO REFRESH =========
  const checkAndRefresh = useCallback(async () => {
    if (!driver?.id || !isScreenFocused.current) return;
    try {
      const { data, error } = await supabase.from("drivers").select("is_active, online_status").eq("id", driver.id).single();
      if (error) throw error;
      const dbOnline = data.is_active === true || data.online_status === "online";
      if (dbOnline !== isOnline) {
        setIsOnline(dbOnline);
        showAlert("Status Synced", dbOnline ? "You are now online" : "You are now offline", "info", { confirmText: "OK" });
        if (dbOnline && !locationSubscription) await startLocationUpdates(driver.id);
        else if (!dbOnline && locationSubscription) await stopLocationUpdates(driver.id);
      }
      setLastRefreshTime(Date.now());
    } catch (err) { console.log("Auto-refresh error:", err); }
  }, [driver?.id, isOnline, locationSubscription]);

  useEffect(() => {
    if (autoRefreshInterval.current) clearInterval(autoRefreshInterval.current);
    if (driver?.id) autoRefreshInterval.current = setInterval(checkAndRefresh, 30000);
    return () => { if (autoRefreshInterval.current) clearInterval(autoRefreshInterval.current); };
  }, [driver?.id, checkAndRefresh]);

  // * ========= SUBSCRIPTION CHECK =========
  const fetchActiveSubscription = useCallback(async (driverId, useCache = true) => {
    if (!driverId) return null;
    if (useCache && dataCache.current.subscription && dataCache.current.timestamp && (Date.now() - dataCache.current.timestamp) < 30000) return dataCache.current.subscription;
    try {
      const { data, error } = await supabase.from("driver_subscriptions").select("id, plan_id, start_date, end_date, status, subscription_plans (plan_name, plan_type, price)").eq("driver_id", driverId).in("status", ["active","expired"]).order("end_date", { ascending: false }).limit(1).maybeSingle();
      if (error) { console.log("Subscription fetch error:", error.message); dataCache.current.subscription = null; return null; }
      dataCache.current.subscription = data;
      return data;
    } catch (err) { console.log("Exception fetching subscription:", err.message); return null; }
  }, []);

  const checkAndHandleSubscription = useCallback(async (driverId, currentOnlineStatus) => {
    if (!isScreenFocused.current || !driverId || subscriptionCheckInProgress) return currentOnlineStatus;
    try {
      setSubscriptionCheckInProgress(true);
      const subscription = await fetchActiveSubscription(driverId, false);
      setActiveSubscription(subscription);
      let hasValidSubscription = !!(subscription && subscription.status === "active" && new Date(subscription.end_date) > new Date());
      setHasActiveSubscription(hasValidSubscription);
      if (subscription && !hasValidSubscription && currentOnlineStatus) {
        setIsOnline(false);
        if (heartbeatInterval) { clearInterval(heartbeatInterval); setHeartbeatInterval(null); }
        const now = new Date().toISOString();
        await supabase.from("drivers").update({ is_active: false, online_status: "offline", updated_at: now }).eq("id", driverId);
        await stopLocationUpdates(driverId);
        if (subscription.status === "expired" || new Date(subscription.end_date) <= new Date()) {
          showAlert("Subscription Expired", "Your subscription has expired. You have been set to offline mode.", "warning", { confirmText: "Renew Now", onConfirm: () => { setAlertVisible(false); navigation.navigate("SubscriptionScreen"); }, cancelText: "OK" });
        } else {
          showAlert("Subscription Not Active", `Your subscription is ${subscription.status}. You have been set to offline mode.`, "warning", { confirmText: "Contact Support", onConfirm: () => { setAlertVisible(false); navigation.navigate("SupportScreen"); }, cancelText: "OK" });
        }
        return false;
      }
      return currentOnlineStatus;
    } catch (err) { console.log("Error checking subscription:", err); return currentOnlineStatus; }
    finally { setSubscriptionCheckInProgress(false); }
  }, [heartbeatInterval, navigation, fetchActiveSubscription]);

  useEffect(() => {
    if (!driver?.id) return;
    if (subscriptionExpiryCheckInterval) clearInterval(subscriptionExpiryCheckInterval);
    const interval = setInterval(async () => {
      if (isOnline && isScreenFocused.current) await checkAndHandleSubscription(driver.id, isOnline);
    }, 60000);
    setSubscriptionExpiryCheckInterval(interval);
    return () => { if (interval) clearInterval(interval); };
  }, [driver?.id, isOnline, checkAndHandleSubscription]);

  // * ========= LOCATION =========
  const setupLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { showAlert("Permission Denied", "Location permission is needed to go online", "error", { confirmText: "OK" }); setLocationPermission(false); return false; }
      setLocationPermission(true);
      return true;
    } catch (err) { console.log("Location permission error:", err); return false; }
  };

  const startLocationUpdates = async (driverId) => {
    try {
      if (locationSubscription) locationSubscription.remove();
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const now = new Date().toISOString();
      const { data: existing } = await supabase.from("driver_locations").select("id").eq("driver_id", driverId).maybeSingle();
      const locationData = { latitude: location.coords.latitude, longitude: location.coords.longitude, is_online: true, last_updated: now, last_heartbeat: now, accuracy: location.coords.accuracy, speed: location.coords.speed, heading: location.coords.heading };
      if (existing) await supabase.from("driver_locations").update(locationData).eq("driver_id", driverId);
      else await supabase.from("driver_locations").insert({ driver_id: driverId, ...locationData });
      const subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 20 },
        async (newLocation) => {
          try {
            const updateNow = new Date().toISOString();
            await supabase.from("driver_locations").update({ latitude: newLocation.coords.latitude, longitude: newLocation.coords.longitude, is_online: true, last_updated: updateNow, last_heartbeat: updateNow, accuracy: newLocation.coords.accuracy, speed: newLocation.coords.speed, heading: newLocation.coords.heading }).eq("driver_id", driverId);
          } catch (err) { console.log("Location update error:", err); }
        }
      );
      setLocationSubscription(subscription);
    } catch (err) { console.log("Start location updates error:", err); }
  };

  const stopLocationUpdates = async (driverId) => {
    try {
      if (locationSubscription) { locationSubscription.remove(); setLocationSubscription(null); }
      if (heartbeatInterval) { clearInterval(heartbeatInterval); setHeartbeatInterval(null); }
      const now = new Date().toISOString();
      await supabase.from("driver_locations").update({ is_online: false, last_updated: now, last_heartbeat: now }).eq("driver_id", driverId);
    } catch (err) { console.log("Stop location updates error:", err); }
  };

  // * ========= DATA FETCHING =========
  const fetchTodayEarnings = useCallback(async (driverId, useCache = true) => {
    if (!driverId) return null;
    if (useCache && dataCache.current.today && dataCache.current.timestamp && (Date.now() - dataCache.current.timestamp) < 30000) return dataCache.current.today;
    try {
      const today = new Date(); today.setHours(0,0,0,0);
      const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
      const { data, error } = await supabase.from("bookings").select("actual_fare, payment_method, payment_type").eq("driver_id", driverId).eq("status","completed").gte("ride_completed_at", today.toISOString()).lt("ride_completed_at", tomorrow.toISOString());
      if (error) { console.log("Today earnings error:", error.message); return null; }
      const result = { total: data?.reduce((s, b) => s + (b.actual_fare || 0), 0) || 0, tripsCount: data?.length || 0 };
      dataCache.current.today = result;
      return result;
    } catch (err) { console.log("Fetch today earnings error:", err.message); return null; }
  }, []);

  const fetchRecentTrips = useCallback(async (driverId, useCache = true) => {
    if (!driverId) return [];
    if (useCache && dataCache.current.recent && dataCache.current.timestamp && (Date.now() - dataCache.current.timestamp) < 60000) return dataCache.current.recent;
    try {
      const { data, error } = await supabase.from("bookings").select("id, pickup_location, dropoff_location, actual_fare, distance_km, ride_completed_at, status, payment_method, payment_type").eq("driver_id", driverId).eq("status","completed").order("ride_completed_at", { ascending: false }).limit(10);
      if (error) { console.log("Recent trips error:", error.message); return []; }
      const formattedTrips = data?.map((trip) => {
        const paymentMethod = trip.payment_method || trip.payment_type || "cash";
        const paymentColor  = paymentMethod === "gcash" ? "#00579F" : paymentMethod === "cash" ? "#10B981" : "#183B5C";
        return { id: trip.id, from: trip.pickup_location?.split(",")[0] || "Pickup", to: trip.dropoff_location?.split(",")[0] || "Dropoff", distance: trip.distance_km ? `${trip.distance_km.toFixed(1)} km` : "? km", earnings: `₱${trip.actual_fare?.toFixed(2) || "0.00"}`, time: trip.ride_completed_at ? new Date(trip.ride_completed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Unknown", paymentMethod, paymentColor };
      }) || [];
      dataCache.current.recent = formattedTrips;
      return formattedTrips;
    } catch (err) { console.log("Fetch recent trips error:", err.message); return []; }
  }, []);

  const fetchWeeklyData = useCallback(async (driverId, useCache = true) => {
    if (!driverId) return null;
    if (useCache && dataCache.current.weekly && dataCache.current.timestamp && (Date.now() - dataCache.current.timestamp) < 60000) return dataCache.current.weekly;
    try {
      const today = new Date(), dayOfWeek = today.getDay();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      startOfWeek.setHours(0,0,0,0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);
      const { data, error } = await supabase.from("bookings").select("actual_fare, ride_completed_at").eq("driver_id", driverId).eq("status","completed").gte("ride_completed_at", startOfWeek.toISOString()).lt("ride_completed_at", endOfWeek.toISOString()).order("ride_completed_at", { ascending: true });
      if (error) { console.log("Weekly data error:", error.message); return null; }
      const earnings = [0,0,0,0,0,0,0], trips = [0,0,0,0,0,0,0];
      data?.forEach((booking) => {
        if (booking.ride_completed_at) {
          const date = new Date(booking.ride_completed_at);
          let dayIndex = date.getDay();
          dayIndex = dayIndex === 0 ? 6 : dayIndex - 1;
          earnings[dayIndex] += booking.actual_fare || 0;
          trips[dayIndex] += 1;
        }
      });
      const result = { labels: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"], earnings, trips };
      dataCache.current.weekly = result;
      return result;
    } catch (err) { console.log("Fetch weekly data error:", err.message); return null; }
  }, []);

  const fetchMissionProgress = useCallback(async (driverId, useCache = true) => {
    if (!driverId) return null;
    if (useCache && dataCache.current.mission && dataCache.current.timestamp && (Date.now() - dataCache.current.timestamp) < 30000) return dataCache.current.mission;
    try {
      const today = new Date(), startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay() + 1);
      startOfWeek.setHours(0,0,0,0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23,59,59,999);
      const { data, error } = await supabase.from("ride_missions").select("*").eq("driver_id", driverId).gte("week_start", startOfWeek.toISOString().split("T")[0]).lte("week_end", endOfWeek.toISOString().split("T")[0]).maybeSingle();
      if (error && error.code !== "PGRST116") { console.log("Mission error:", error.message); return null; }
      dataCache.current.mission = data;
      return data;
    } catch (err) { console.log("Fetch mission error:", err.message); return null; }
  }, []);

  const fetchUnreadNotifications = useCallback(async (userId, useCache = true) => {
    if (!userId) return 0;
    if (useCache && dataCache.current.notifications !== undefined && dataCache.current.timestamp && (Date.now() - dataCache.current.timestamp) < 30000) return dataCache.current.notifications;
    try {
      const { count, error } = await supabase.from("notifications").select("*", { count: "exact", head: true }).eq("user_id", userId).eq("is_read", false);
      if (error) throw error;
      dataCache.current.notifications = count || 0;
      return count || 0;
    } catch (err) { console.log("Error fetching notifications:", err); return 0; }
  }, []);

  const fetchDriverRank = useCallback(async (driverId, useCache = true) => {
    if (!driverId) return null;
    if (useCache && dataCache.current.rank && dataCache.current.timestamp && (Date.now() - dataCache.current.timestamp) < 60000) return dataCache.current.rank;
    try {
      const { data: drivers, error } = await supabase.from("drivers").select("id, first_name, last_name").eq("status","approved");
      if (error) throw error;
      const driverStats = await Promise.all(drivers.map(async (d) => {
        const { count, error: countError } = await supabase.from("bookings").select("*", { count: "exact", head: true }).eq("driver_id", d.id).eq("status","completed");
        if (countError) throw countError;
        return { ...d, trips: count || 0, points: (count || 0) * 10 };
      }));
      const sortedDrivers       = driverStats.sort((a, b) => b.points - a.points);
      const currentDriverIndex  = sortedDrivers.findIndex((d) => d.id === driverId);
      const currentRank         = currentDriverIndex + 1;
      const currentDriverPoints = sortedDrivers[currentDriverIndex]?.points || 0;
      let level = "Bronze";
      if (currentDriverPoints >= 2000) level = "Diamond";
      else if (currentDriverPoints >= 1000) level = "Gold";
      else if (currentDriverPoints >= 500) level = "Silver";
      const result = { currentRank, level, points: currentDriverPoints };
      dataCache.current.rank = result;
      return result;
    } catch (err) { console.log("Error fetching rank:", err.message); return null; }
  }, []);

  // * ========= MAIN LOAD =========
  const loadDriverData = useCallback(async (forceRefresh = false) => {
    if (!driver?.id || isFetching.current) return;
    try {
      isFetching.current = true;
      if (forceRefresh) dataCache.current.timestamp = null;
      if (!forceRefresh && dataCache.current.timestamp && (Date.now() - dataCache.current.timestamp) < 30000) {
        if (dataCache.current.today)  { setTodayEarnings(dataCache.current.today.total); setTodayTrips(dataCache.current.today.tripsCount); }
        if (dataCache.current.recent) setRecentTrips(dataCache.current.recent);
        if (dataCache.current.weekly) setWeeklyData(dataCache.current.weekly);
        setActiveSubscription(dataCache.current.subscription);
        setMissionProgress(dataCache.current.mission);
        setUnreadNotifications(dataCache.current.notifications || 0);
        if (dataCache.current.rank) setDriverRank(dataCache.current.rank);
        return;
      }
      const [todayResult, recentResult, weeklyResult, subscriptionResult, missionResult, notificationsResult, rankResult] = await Promise.all([
        fetchTodayEarnings(driver.id, false), fetchRecentTrips(driver.id, false), fetchWeeklyData(driver.id, false),
        fetchActiveSubscription(driver.id, false), fetchMissionProgress(driver.id, false),
        fetchUnreadNotifications(driver.id, false), fetchDriverRank(driver.id, false),
      ]);
      if (todayResult)  { setTodayEarnings(todayResult.total); setTodayTrips(todayResult.tripsCount); }
      if (recentResult) setRecentTrips(recentResult);
      if (weeklyResult) setWeeklyData(weeklyResult);
      setActiveSubscription(subscriptionResult);
      if (subscriptionResult) setHasActiveSubscription(subscriptionResult.status === "active" && new Date(subscriptionResult.end_date) > new Date());
      else setHasActiveSubscription(false);
      setMissionProgress(missionResult);
      setUnreadNotifications(notificationsResult);
      if (rankResult) setDriverRank(rankResult);
      dataCache.current.timestamp = Date.now();
    } catch (err) { console.log("Error loading driver data:", err); }
    finally { isFetching.current = false; }
  }, [driver?.id, fetchTodayEarnings, fetchRecentTrips, fetchWeeklyData, fetchActiveSubscription, fetchMissionProgress, fetchUnreadNotifications, fetchDriverRank]);

  // * ========= INITIAL LOAD =========
  useEffect(() => {
    const getDriver = async () => {
      try {
        setLoading(true);
        const storedUserId = await AsyncStorage.getItem("user_id");
        if (!storedUserId) { setLoading(false); return; }
        const { data, error } = await supabase.from("drivers").select("id, first_name, middle_name, last_name, status, is_active, online_status, email, phone, profile_picture").eq("id", storedUserId).single();
        if (error) { console.log(error.message); setLoading(false); return; }
        setDriver(data);
        const subscription = await fetchActiveSubscription(data.id, false);
        let hasValidSubscription = !!(subscription && subscription.status === "active" && new Date(subscription.end_date) > new Date());
        setActiveSubscription(subscription);
        setHasActiveSubscription(hasValidSubscription);
        const wasOnline     = data?.is_active === true || data?.online_status === "online";
        const shouldBeOnline = data?.status === "approved" && hasValidSubscription && wasOnline;
        setIsOnline(shouldBeOnline);
        await setupLocationPermission();
        if (wasOnline && !hasValidSubscription) {
          await supabase.from("drivers").update({ is_active: false, online_status: "offline", updated_at: new Date().toISOString() }).eq("id", data.id);
        } else if (shouldBeOnline) {
          await startLocationUpdates(data.id);
        }
        await loadDriverData(true);
        initialLoadComplete.current = true;
      } catch (err) { console.log(err.message); }
      finally { setLoading(false); }
    };
    getDriver();
  }, []);

  // * ========= REFRESH (PULL-TO-REFRESH) =========
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await checkAndRefresh();
    await loadDriverData(true);
    if (driver?.id && isScreenFocused.current) await checkAndHandleSubscription(driver.id, isOnline);
    setRefreshing(false);
    showAlert("Refreshed", "Your dashboard has been updated", "success", { confirmText: "OK" });
  }, [loadDriverData, driver?.id, isOnline, checkAndHandleSubscription, checkAndRefresh]);

  // * ========= FOCUS EFFECT =========
  useFocusEffect(useCallback(() => {
    if (initialLoadComplete.current && driver?.id) {
      const cacheAge = dataCache.current.timestamp ? Date.now() - dataCache.current.timestamp : Infinity;
      if (cacheAge > 30000) loadDriverData(false);
      if (isOnline) checkAndHandleSubscription(driver.id, isOnline);
    }
  }, [driver?.id, loadDriverData, isOnline, checkAndHandleSubscription]));

  // * ========= CLEANUP =========
  useEffect(() => {
    return () => {
      if (locationSubscription) locationSubscription.remove();
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (subscriptionExpiryCheckInterval) clearInterval(subscriptionExpiryCheckInterval);
    };
  }, [locationSubscription, heartbeatInterval, subscriptionExpiryCheckInterval]);

  // * ========= APP STATE =========
  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (nextAppState) => {
      const previousAppState = appState.current;
      appState.current = nextAppState;
      if (previousAppState.match(/inactive|background/) && nextAppState === "active") {
        if (driver?.id) {
          await loadDriverData(false);
          await checkAndRefresh();
          if (isScreenFocused.current) {
            const newOnlineStatus = await checkAndHandleSubscription(driver.id, isOnline);
            if (newOnlineStatus && isOnline && !locationSubscription) await startLocationUpdates(driver.id);
            else if (newOnlineStatus && isOnline) {
              await sendHeartbeat();
              try {
                const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
                await supabase.from("driver_locations").update({ latitude: location.coords.latitude, longitude: location.coords.longitude, last_updated: new Date().toISOString(), last_heartbeat: new Date().toISOString() }).eq("driver_id", driver.id);
              } catch (err) { console.log("Error refreshing location:", err); }
            }
          }
        }
      } else if (nextAppState === "background") {
        if (isOnline && driver?.id) {
          try {
            const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            const now = new Date().toISOString();
            await supabase.from("driver_locations").update({ latitude: location.coords.latitude, longitude: location.coords.longitude, last_updated: now, last_heartbeat: now, is_online: true }).eq("driver_id", driver.id);
            await supabase.from("drivers").update({ last_online: now, updated_at: now }).eq("id", driver.id);
          } catch (err) { console.log("Error updating location before background:", err); }
          if (isScreenFocused.current) showAlert("App in Background", "Location updates will pause when the app is in background. Please keep the app open to receive bookings.", "info", { confirmText: "OK" });
        }
      }
    });
    return () => subscription.remove();
  }, [isOnline, driver?.id, loadDriverData, locationSubscription, checkAndHandleSubscription, sendHeartbeat, checkAndRefresh]);

  // * ========= TOGGLE AVAILABILITY =========
  const toggleAvailability = async () => {
    if (isToggling) return;
    if (!driver || driver.status !== "approved") { showAlert("Not Approved", "Your account is not yet approved to go online.", "warning", { confirmText: "OK" }); return; }
    setIsToggling(true);
    const newOnlineStatus = !isOnline;
    setIsOnline(newOnlineStatus);
    try {
      if (newOnlineStatus) {
        const subscription = await fetchActiveSubscription(driver.id, false);
        const hasValid = !!(subscription && subscription.status === "active" && new Date(subscription.end_date) > new Date());
        setActiveSubscription(subscription);
        setHasActiveSubscription(hasValid);
        if (!hasValid) {
          setIsOnline(false);
          let message = "You need an active subscription to go online.";
          if (subscription?.status === "expired") message = "Your subscription has expired. Please renew to go online.";
          else if (subscription && subscription.status !== "active") message = `Your subscription is ${subscription.status}. Please contact support.`;
          showAlert("No Active Subscription", message, "warning", { confirmText: subscription?.status === "expired" ? "Renew Now" : "Subscribe", onConfirm: () => { setAlertVisible(false); navigation.navigate("SubscriptionScreen"); }, cancelText: "Cancel" });
          setIsToggling(false);
          return;
        }
      }
      if (newOnlineStatus && !locationPermission) {
        const granted = await setupLocationPermission();
        if (!granted) { setIsOnline(false); setIsToggling(false); return; }
      }
      const now = new Date().toISOString();
      await Promise.all([
        supabase.from("drivers").update({ is_active: newOnlineStatus, online_status: newOnlineStatus ? "online" : "offline", updated_at: now }).eq("id", driver.id),
        newOnlineStatus ? startLocationUpdates(driver.id) : stopLocationUpdates(driver.id),
      ]);
      showAlert(newOnlineStatus ? "You're Online! 🟢" : "You're Offline 🔴", newOnlineStatus ? "Ready to accept bookings" : "Not accepting bookings", newOnlineStatus ? "success" : "info", { confirmText: "OK" });
    } catch (err) {
      console.log(err.message);
      setIsOnline(!newOnlineStatus);
      showAlert("Error", "Failed to update status. Please try again.", "error", { confirmText: "OK" });
    } finally { setIsToggling(false); setLastRefreshTime(Date.now()); }
  };

  // * ========= TOGGLE ANIMATION =========
  const toggleAnim = useRef(new Animated.Value(0)).current;
  const translateX = toggleAnim.interpolate({ inputRange: [0, 1], outputRange: [rs(2), rs(38)] });
  useEffect(() => {
    Animated.timing(toggleAnim, { toValue: isOnline ? 1 : 0, duration: 250, easing: Easing.out(Easing.ease), useNativeDriver: false }).start();
  }, [isOnline]);

  const renderTrip = useCallback(({ item }) => <TripItem item={item} navigation={navigation} />, [navigation]);

  // Rank helpers
  const getRankInfo = (level) => {
    if (level === "Diamond") return { icon: "diamond", color: "#B9F2FF" };
    if (level === "Gold")    return { icon: "trophy",  color: "#FFD700" };
    if (level === "Silver")  return { icon: "medal",   color: "#C0C0C0" };
    return                          { icon: "ribbon",  color: "#CD7F32" };
  };
  const rankInfo = getRankInfo(driverRank?.level);

  // Subscription display helpers
  const subExpired  = activeSubscription && (activeSubscription.status === "expired" || new Date(activeSubscription.end_date) <= new Date());
  const subInactive = activeSubscription && activeSubscription.status !== "active" && activeSubscription.status !== "expired";

  // ================= LOADING STATE =================
  if (loading && !refreshing) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F9FAFB", justifyContent: "center", alignItems: "center", paddingTop: insets.top }}>
        <ActivityIndicator size="large" color="#183B5C" />
        <Text style={{ marginTop: rs(10), color: "#666", fontSize: normalize(14) }}>Loading your dashboard...</Text>
      </View>
    );
  }

  // ================= RENDER =================
  return (
    <View style={{ flex: 1, backgroundColor: "#F9FAFB" }}>
      <ScrollView
        style={{ flex: 1, paddingTop: insets.top }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#183B5C"]} tintColor="#183B5C" />}
        removeClippedSubviews
        maxToRenderPerBatch={5}
        windowSize={5}
        contentContainerStyle={{ paddingBottom: insets.bottom + rs(80) }}
      >

        {/* ==================== HEADER ==================== */}
        <LinearGradient
          colors={["#FFB37A", "#183B5C"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ paddingHorizontal: HORIZONTAL_PADDING, paddingTop: rs(16), paddingBottom: rs(20) }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>

            {/* Logo */}
            <Image
              source={require("../../assets/logo-sakayna.png")}
              style={{ width: rs(isSmallScreen ? 75 : 95), height: rs(38) }}
              resizeMode="contain"
            />

            {/* Center: Name + Status badges */}
            <View style={{ flex: 1, marginHorizontal: rs(10) }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: rs(4), marginBottom: rs(4) }}>
                {/* Verified badge */}
                <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: rs(8), paddingVertical: rs(3), borderRadius: rs(20) }}>
                  <View style={{ width: rs(7), height: rs(7), borderRadius: rs(4), backgroundColor: driver?.status === "approved" ? "#00FF00" : "#FF0000", marginRight: rs(4) }} />
                  <Text style={{ color: "#FFF", fontSize: normalize(11), fontWeight: "600" }}>
                    {driver?.status === "approved" ? "Verified" : driver?.status === "under_review" ? "Under Review" : driver?.status === "pending" ? "Not Verified" : driver?.status === "rejected" ? "Rejected" : driver?.status === "suspended" ? "Suspended" : "Inactive"}
                  </Text>
                </View>
                {/* Online/Offline indicator */}
                <StatusIndicator isOnline={isOnline} lastRefreshTime={lastRefreshTime} />
              </View>

              <Text style={{ color: "#FFF", fontWeight: "700", fontSize: normalize(isSmallScreen ? 13 : 15) }} numberOfLines={1}>
                {driver ? `${driver.first_name}${driver.middle_name ? " " + driver.middle_name : ""} ${driver.last_name}` : "Driver"}
              </Text>
            </View>

            {/* Rank badge */}
            <Pressable
              onPress={() => navigation.navigate("RankingPage")}
              style={{ width: rs(54), height: rs(54), alignItems: "center", justifyContent: "center" }}
            >
              <View style={{ position: "absolute", width: rs(52), height: rs(52), borderRadius: rs(26), borderWidth: 2, borderColor: rankInfo.color, opacity: 0.5 }} />
              <View style={{ width: rs(44), height: rs(44), borderRadius: rs(22), backgroundColor: "#FFF", justifyContent: "center", alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5 }}>
                <Ionicons name={rankInfo.icon} size={rs(24)} color={rankInfo.color} />
              </View>
              <View style={{ position: "absolute", bottom: 0, right: 0, backgroundColor: "#183B5C", borderRadius: rs(10), width: rs(20), height: rs(20), justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFF" }}>
                <Text style={{ color: "#FFF", fontSize: normalize(9), fontWeight: "bold" }}>#{driverRank?.currentRank || "?"}</Text>
              </View>
              {unreadNotifications > 0 && (
                <View style={{ position: "absolute", top: -rs(2), right: -rs(2), backgroundColor: "#FF3B30", borderRadius: rs(12), minWidth: rs(20), height: rs(20), justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFF", paddingHorizontal: rs(3) }}>
                  <Text style={{ color: "#FFF", fontSize: normalize(9), fontWeight: "bold" }}>{unreadNotifications > 9 ? "9+" : unreadNotifications}</Text>
                </View>
              )}
            </Pressable>
          </View>
        </LinearGradient>

        {/* ==================== WARNING BANNERS ==================== */}

        {/* Driver not approved */}
        {driver && driver.status !== "approved" && (
          <WarningBanner
            icon={driver.status === "rejected" || driver.status === "suspended" ? "alert-circle" : "time-outline"}
            title={driver.status === "pending" ? "⏳ Not yet verified!" : driver.status === "under_review" ? "🔍 Under review" : driver.status === "rejected" ? "❌ Documents rejected" : "⛔ Account suspended"}
            body={driver.status === "pending" ? "Complete verification to start accepting bookings." : driver.status === "under_review" ? "Your documents are being reviewed. Please check back later." : driver.status === "rejected" ? "Your documents did not pass. Please resubmit." : "Your account is suspended. Contact support for assistance."}
            bgColor={driver.status === "rejected" || driver.status === "suspended" ? "#FFD6D6" : "#FFF4CC"}
            borderColor={driver.status === "rejected" || driver.status === "suspended" ? "#FF6B6B" : "#FF8C00"}
            titleColor={driver.status === "rejected" || driver.status === "suspended" ? "#B00020" : "#FF8C00"}
            buttonLabel={(driver.status === "pending" || driver.status === "rejected") ? (driver.status === "pending" ? "✅ Complete Verification" : "🔄 Resubmit Documents") : null}
            onPress={() => navigation.navigate("DriverVerificationScreen")}
          />
        )}

        {/* No subscription */}
        {driver?.status === "approved" && !hasActiveSubscription && activeSubscription === null && (
          <WarningBanner
            icon="alert-circle" title="No Active Subscription"
            body="You need an active subscription to go online and accept bookings."
            bgColor="#FFE5E5" borderColor="#FF6B6B" titleColor="#FF0000"
            buttonLabel="Subscribe Now" onPress={() => navigation.navigate("SubscriptionScreen")}
          />
        )}

        {/* Subscription expired */}
        {driver?.status === "approved" && subExpired && (
          <WarningBanner
            icon="time-outline" title="Subscription Expired"
            body={`Your subscription expired on ${new Date(activeSubscription.end_date).toLocaleDateString()}. Renew to continue accepting bookings.`}
            bgColor="#FFF3CD" borderColor="#FFC107" titleColor="#FF8C00"
            buttonLabel="Renew Subscription" onPress={() => navigation.navigate("SubscriptionScreen")}
          />
        )}

        {/* Subscription inactive (other status) */}
        {driver?.status === "approved" && subInactive && (
          <WarningBanner
            icon="alert-circle" title={`Subscription ${activeSubscription.status}`}
            body={`Your subscription is ${activeSubscription.status}. Please contact support for assistance.`}
            bgColor="#FFE5E5" borderColor="#FF6B6B" titleColor="#FF0000"
            buttonLabel="Contact Support" onPress={() => navigation.navigate("SupportScreen")}
          />
        )}

        {/* ==================== SUBSCRIPTION + MISSION CARDS ==================== */}

        {/* Both present */}
        {hasActiveSubscription && missionProgress && (
          <View style={{ marginHorizontal: HORIZONTAL_PADDING, marginTop: rs(16), flexDirection: isSmallScreen ? "column" : "row", gap: rs(10) }}>
            {/* Subscription */}
            <Pressable
              onPress={() => navigation.navigate("SubscriptionScreen")}
              style={{ flex: isSmallScreen ? undefined : 1, padding: rs(14), borderRadius: CARD_BORDER_RADIUS, backgroundColor: "#E6F7E6", borderWidth: 1, borderColor: "#A0D9A0", elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 }}
            >
              <View style={{ width: rs(32), height: rs(32), borderRadius: rs(16), backgroundColor: "#4CAF50", justifyContent: "center", alignItems: "center", marginBottom: rs(8) }}>
                <Ionicons name="card" size={rs(16)} color="#FFF" />
              </View>
              <Text style={{ fontWeight: "bold", color: "#2E7D32", fontSize: normalize(14), marginBottom: rs(2) }} numberOfLines={1}>{activeSubscription?.subscription_plans?.plan_name}</Text>
              <Text style={{ fontSize: normalize(11), color: "#4CAF50", marginBottom: rs(8) }}>Exp: {new Date(activeSubscription?.end_date).toLocaleDateString()}</Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ color: "#183B5C", fontWeight: "600", fontSize: normalize(11), marginRight: rs(2) }}>Manage</Text>
                <Ionicons name="arrow-forward" size={rs(11)} color="#183B5C" />
              </View>
            </Pressable>

            {/* Mission */}
            <View style={{ flex: isSmallScreen ? undefined : 1, padding: rs(12), borderRadius: CARD_BORDER_RADIUS, backgroundColor: "#F0F9FF", borderWidth: 1, borderColor: "#B2D9FF", elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: rs(8) }}>
                <Text style={{ fontWeight: "bold", fontSize: normalize(13) }}>🎯 Mission</Text>
                <Text style={{ color: "#183B5C", fontWeight: "bold", fontSize: normalize(12) }}>{missionProgress.actual_rides}/{missionProgress.target_rides}</Text>
              </View>
              <View style={{ height: rs(6), backgroundColor: "#E5E7EB", borderRadius: rs(3), overflow: "hidden", marginBottom: rs(6) }}>
                <View style={{ width: `${Math.min((missionProgress.actual_rides / missionProgress.target_rides) * 100, 100)}%`, height: "100%", backgroundColor: missionProgress.actual_rides >= missionProgress.target_rides ? "#10B981" : "#3B82F6" }} />
              </View>
              <Text style={{ fontSize: normalize(11), color: "#6B7280" }} numberOfLines={2}>
                {missionProgress.actual_rides >= missionProgress.target_rides ? `🎉 ₱${missionProgress.bonus_amount} bonus!` : `${missionProgress.target_rides - missionProgress.actual_rides} more rides = ₱${missionProgress.bonus_amount}`}
              </Text>
            </View>
          </View>
        )}

        {/* Subscription only */}
        {hasActiveSubscription && !missionProgress && (
          <Pressable
            onPress={() => navigation.navigate("SubscriptionScreen")}
            style={{ marginHorizontal: HORIZONTAL_PADDING, marginTop: rs(16), padding: rs(15), borderRadius: CARD_BORDER_RADIUS, backgroundColor: "#E6F7E6", flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: "#A0D9A0" }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
              <View style={{ width: rs(40), height: rs(40), borderRadius: rs(20), backgroundColor: "#4CAF50", justifyContent: "center", alignItems: "center", marginRight: rs(12) }}>
                <Ionicons name="card" size={rs(20)} color="#FFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "bold", color: "#2E7D32", fontSize: normalize(15) }} numberOfLines={1}>{activeSubscription?.subscription_plans?.plan_name}</Text>
                <Text style={{ fontSize: normalize(12), color: "#4CAF50" }}>Expires: {new Date(activeSubscription?.end_date).toLocaleDateString()}</Text>
              </View>
            </View>
            <View style={{ backgroundColor: "#183B5C", paddingHorizontal: rs(12), paddingVertical: rs(6), borderRadius: rs(20), flexDirection: "row", alignItems: "center" }}>
              <Text style={{ color: "#FFF", fontWeight: "600", fontSize: normalize(12), marginRight: rs(4) }}>Manage</Text>
              <Ionicons name="arrow-forward" size={rs(12)} color="#FFF" />
            </View>
          </Pressable>
        )}

        {/* Mission only */}
        {!hasActiveSubscription && missionProgress && <MissionProgress missionProgress={missionProgress} />}

        {/* TODAY'S EARNINGS CARD WITH HORIZONTAL TOGGLE */}
        <View style={[styles.earningsCard, { 
          marginHorizontal: rs(20), 
          marginTop: rs(20),
          backgroundColor: "#FFF",
          borderRadius: rs(24),
          padding: rs(20),
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 12,
          elevation: 5,
        }]}>
          
          {/* Header with icon */}
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: rs(20) }}>
            <View style={{ backgroundColor: "#183B5C", width: rs(40), height: rs(40), borderRadius: rs(12), justifyContent: "center", alignItems: "center", marginRight: rs(12) }}>
              <Ionicons name="cash-outline" size={rs(22)} color="#FFB37A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: normalize(17), fontWeight: "bold", color: "#333" }}>Today's Earnings</Text>
              <Text style={{ fontSize: normalize(12), color: "#666" }}>Your earnings and trips today</Text>
            </View>
          </View>

          {/* Stats and Toggle in a single row */}
          <View style={{ 
            flexDirection: "row", 
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "#F9FAFB",
            borderRadius: rs(16),
            padding: rs(12),
            gap: rs(12),
          }}>
            {/* Stats */}
            <View style={{ flexDirection: "row", flex: 2, gap: rs(12) }}>
              <View style={{ alignItems: "center", flex: 1 }}>
                <Text style={{ fontSize: normalize(11), color: "#3B82F6", marginBottom: rs(2) }}>Earnings</Text>
                <Text style={{ fontSize: normalize(24), fontWeight: "bold", color: "#183B5C" }}>
                  ₱{todayEarnings.toFixed(0)}
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: "#E5E7EB" }} />
              <View style={{ alignItems: "center", flex: 1 }}>
                <Text style={{ fontSize: normalize(11), color: "#F59E0B", marginBottom: rs(2) }}>Trips</Text>
                <Text style={{ fontSize: normalize(24), fontWeight: "bold", color: "#183B5C" }}>
                  {todayTrips}
                </Text>
              </View>
            </View>

            {/* Divider */}
            <View style={{ width: 1, height: rs(40), backgroundColor: "#E5E7EB" }} />

            {/* Toggle Section */}
            <View style={{ flex: 1, alignItems: "center" }}>
              <Pressable
                onPress={toggleAvailability}
                disabled={driver?.status !== "approved" || !hasActiveSubscription || isToggling}
                style={{
                  width: rs(70),
                  height: rs(32),
                  borderRadius: rs(32),
                  padding: rs(2),
                  justifyContent: "center",
                  backgroundColor: !hasActiveSubscription || driver?.status !== "approved"
                    ? "#D0D5DD"
                    : isOnline
                      ? "#12B76A"
                      : "#F2F4F7",
                }}
              >
                <Animated.View
                  style={{
                    width: rs(28),
                    height: rs(28),
                    borderRadius: rs(14),
                    backgroundColor: "#FFF",
                    transform: [{
                      translateX: isOnline ? rs(38) : rs(0)
                    }],
                  }}
                />
              </Pressable>
              <Text
                style={{
                  marginTop: rs(4),
                  fontSize: normalize(10),
                  fontWeight: "600",
                  color: isOnline ? "#12B76A" : "#667085",
                }}
              >
                {isOnline ? "ONLINE" : "OFFLINE"}
              </Text>
            </View>
          </View>

          {/* Status Message Below */}
          <View style={{ marginTop: rs(12), alignItems: "center" }}>
            <Text
              style={{
                fontSize: normalize(11),
                textAlign: "center",
                color: !hasActiveSubscription || driver?.status !== "approved"
                  ? "#98A2B3"
                  : isOnline
                    ? "#12B76A"
                    : "#667085",
              }}
            >
              {driver?.status !== "approved"
                ? "⏳ Waiting for approval"
                : !hasActiveSubscription
                  ? activeSubscription?.status === 'expired' 
                    ? "⚠️ Subscription expired - Renew to go online"
                    : "📱 Subscribe to go online"
                  : isOnline
                    ? "🟢 Ready to accept bookings"
                    : "⚪ Not accepting bookings"}
            </Text>
            {isToggling && (
              <ActivityIndicator size="small" color="#183B5C" style={{ marginTop: rs(4) }} />
            )}
          </View>
        </View>

        {/* ==================== PERFORMANCE CARD ==================== */}
        <View style={{ marginHorizontal: HORIZONTAL_PADDING, marginTop: rs(24), marginBottom: rs(20), backgroundColor: "#FFF", borderRadius: CARD_BORDER_RADIUS, padding: rs(20), shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5 }}>

          {/* Card header */}
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: rs(20) }}>
            <View style={{ backgroundColor: "#183B5C", width: rs(40), height: rs(40), borderRadius: rs(12), justifyContent: "center", alignItems: "center", marginRight: rs(12) }}>
              <Ionicons name="stats-chart" size={rs(22)} color="#FFB37A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: normalize(17), fontWeight: "bold", color: "#333" }}>Performance</Text>
              <Text style={{ fontSize: normalize(12), color: "#666" }}>Your earnings and trips this week</Text>
            </View>
          </View>

          {/* Quick stat cards */}
          <View style={{ flexDirection: "row", marginBottom: rs(20) }}>
            <View style={{ flex: 1, backgroundColor: "#F0F9FF", padding: rs(12), borderRadius: rs(14), marginRight: rs(8), borderWidth: 1, borderColor: "#B2D9FF" }}>
              <Text style={{ fontSize: normalize(12), color: "#3B82F6", marginBottom: rs(4) }}>Week Total</Text>
              <Text style={{ fontSize: normalize(isSmallScreen ? 16 : 20), fontWeight: "bold", color: "#183B5C" }}>₱{weeklyData.earnings.reduce((a, b) => a + b, 0).toFixed(0)}</Text>
              <Text style={{ fontSize: normalize(10), color: "#666" }}>earnings</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: "#FEF9E7", padding: rs(12), borderRadius: rs(14), marginLeft: rs(8), borderWidth: 1, borderColor: "#FFE5A3" }}>
              <Text style={{ fontSize: normalize(12), color: "#F59E0B", marginBottom: rs(4) }}>Today</Text>
              <Text style={{ fontSize: normalize(isSmallScreen ? 16 : 20), fontWeight: "bold", color: "#183B5C" }}>₱{todayEarnings.toFixed(0)}</Text>
              <Text style={{ fontSize: normalize(10), color: "#666" }}>{todayTrips} trips</Text>
            </View>
          </View>

          {/* Tabs */}
          <View style={{ flexDirection: "row", backgroundColor: "#F3F4F6", padding: rs(4), borderRadius: rs(12), marginBottom: rs(20) }}>
            {["earnings", "trips"].map((tab) => (
              <Pressable
                key={tab}
                style={[{
                  flex: 1, paddingVertical: rs(10), paddingHorizontal: rs(12),
                  borderRadius: rs(10), flexDirection: "row", alignItems: "center", justifyContent: "center",
                }, activeTab === tab && { backgroundColor: "#FFF", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }]}
                onPress={() => setActiveTab(tab)}
              >
                <Ionicons name={tab === "earnings" ? "cash-outline" : "bicycle-outline"} size={rs(17)} color={activeTab === tab ? "#183B5C" : "#9CA3AF"} style={{ marginRight: rs(5) }} />
                <Text style={{ fontSize: normalize(13), fontWeight: "600", color: activeTab === tab ? "#183B5C" : "#9CA3AF" }}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Tab: Earnings */}
          {activeTab === "earnings" ? (
            <View>
              {/* Legend */}
              <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: rs(8) }}>
                {[{ color: "#FFB37A", label: "Earnings (₱)" }, { color: "#183B5C", label: "Trips (x50)" }].map(({ color, label }) => (
                  <View key={label} style={{ flexDirection: "row", alignItems: "center", marginLeft: rs(12) }}>
                    <View style={{ width: rs(10), height: rs(10), borderRadius: rs(5), backgroundColor: color, marginRight: rs(4) }} />
                    <Text style={{ fontSize: normalize(10), color: "#666" }}>{label}</Text>
                  </View>
                ))}
              </View>

              {/* Chart */}
              {weeklyData.earnings.some((d) => d > 0) ? (
                <View style={{ backgroundColor: "#F9FAFB", borderRadius: rs(14), padding: rs(10), marginBottom: rs(10) }}>
                  <LineChart
                    data={{
                      labels: isSmallScreen ? ["M","T","W","T","F","S","S"] : weeklyData.labels,
                      datasets: [
                        { data: weeklyData.earnings, color: () => "#FFB37A", strokeWidth: 2 },
                        { data: weeklyData.trips.map((t) => t * 50), color: () => "#183B5C", strokeWidth: 2 },
                      ],
                    }}
                    width={chartWidth}
                    height={rs(170)}
                    yAxisLabel="₱"
                    chartConfig={{
                      backgroundGradientFrom: "#F9FAFB",
                      backgroundGradientTo: "#F9FAFB",
                      decimalPlaces: 0,
                      color: (opacity = 1) => `rgba(24,59,92,${opacity})`,
                      labelColor: (opacity = 1) => `rgba(0,0,0,${opacity})`,
                      style: { borderRadius: rs(14) },
                      propsForDots: { r: rs(4).toString(), strokeWidth: "2", stroke: "#FFA500" },
                      propsForLabels: { fontSize: normalize(9) },
                    }}
                    style={{ marginVertical: rs(8), borderRadius: rs(14) }}
                    fromZero bezier={false} withInnerLines={false} withOuterLines
                  />
                </View>
              ) : (
                <View style={{ backgroundColor: "#F9FAFB", borderRadius: rs(14), padding: rs(30), marginBottom: rs(10), alignItems: "center" }}>
                  <Ionicons name="bar-chart-outline" size={rs(38)} color="#D1D5DB" />
                  <Text style={{ marginTop: rs(10), color: "#9CA3AF", fontSize: normalize(13) }}>No earnings data this week</Text>
                </View>
              )}

              {/* Daily breakdown */}
              <View style={{ marginTop: rs(10) }}>
                <Text style={{ fontSize: normalize(12), fontWeight: "600", color: "#333", marginBottom: rs(8) }}>Daily Breakdown</Text>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  {weeklyData.labels.map((day, index) => {
                    const isToday = index === (new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);
                    return (
                      <View key={day} style={{ alignItems: "center" }}>
                        <Text style={{ fontSize: normalize(isSmallScreen ? 9 : 11), color: "#666", marginBottom: rs(2) }}>
                          {isSmallScreen ? day.charAt(0) : day}
                        </Text>
                        <Text style={{ fontSize: normalize(isSmallScreen ? 11 : 13), fontWeight: "bold", color: isToday ? "#183B5C" : "#333" }}>
                          ₱{weeklyData.earnings[index]}
                        </Text>
                        <Text style={{ fontSize: normalize(9), color: "#999" }}>{weeklyData.trips[index]}t</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          ) : (
            /* Tab: Trips */
            <View>
              <View style={{ backgroundColor: "#F9FAFB", borderRadius: rs(14), padding: rs(15), marginBottom: rs(15), flexDirection: "row", justifyContent: "space-between" }}>
                <View>
                  <Text style={{ fontSize: normalize(12), color: "#666" }}>Total Trips (Week)</Text>
                  <Text style={{ fontSize: normalize(isSmallScreen ? 20 : 24), fontWeight: "bold", color: "#183B5C" }}>{weeklyData.trips.reduce((a, b) => a + b, 0)}</Text>
                </View>
                <View>
                  <Text style={{ fontSize: normalize(12), color: "#666" }}>Today's Trips</Text>
                  <Text style={{ fontSize: normalize(isSmallScreen ? 20 : 24), fontWeight: "bold", color: "#183B5C" }}>{todayTrips}</Text>
                </View>
              </View>

              <Text style={{ fontSize: normalize(14), fontWeight: "600", color: "#333", marginBottom: rs(10) }}>Recent Trips</Text>
              <FlatList
                data={recentTrips}
                renderItem={renderTrip}
                keyExtractor={(item) => item.id.toString()}
                scrollEnabled={false}
                removeClippedSubviews
                maxToRenderPerBatch={5}
                initialNumToRender={5}
                ListEmptyComponent={
                  <View style={{ padding: rs(30), alignItems: "center", backgroundColor: "#F9FAFB", borderRadius: rs(14) }}>
                    <Ionicons name="bicycle-outline" size={rs(38)} color="#D1D5DB" />
                    <Text style={{ marginTop: rs(10), color: "#9CA3AF", textAlign: "center", fontSize: normalize(13) }}>No trips yet</Text>
                    <Text style={{ fontSize: normalize(12), color: "#D1D5DB", marginTop: rs(4) }}>Complete a booking to see it here</Text>
                  </View>
                }
              />
            </View>
          )}
        </View>
      </ScrollView>

      {/* ==================== FLOATING SHOP BUTTON (COMING SOON) ==================== */}
      <FloatingShopButton onPress={handleShopPress} />

      {/* ==================== ALERT MODAL ==================== */}
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