// screens/driver/DriverTrackRideScreen.js
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Linking,
  Platform,
  Image,
  StyleSheet,
  Modal,
  Animated,
  Vibration,
  TouchableOpacity,
  Dimensions,
  AppState,
  Easing,
  RefreshControl,
  StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase} from "../../lib/supabase";
import {
  playBookingSound,
  showBookingNotification,
  showRideNotification,
  addNotificationReceivedListener,
  addNotificationResponseListener,
  CHANNEL,
} from "../../lib/notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";

const { width, height } = Dimensions.get("window");

// ─── Design Tokens ────────────────────────────────────────────────────────────
const COLORS = {
  navy:        "#0F2744",
  navyLight:   "#183B5C",
  navyMid:     "#1E4976",
  amber:       "#F59E0B",
  amberLight:  "#FFB347",
  green:       "#10B981",
  greenDark:   "#059669",
  red:         "#EF4444",
  redDark:     "#DC2626",
  blue:        "#3B82F6",
  blueDark:    "#2563EB",
  purple:      "#8B5CF6",
  gray50:      "#F8FAFC",
  gray100:     "#F1F5F9",
  gray200:     "#E2E8F0",
  gray300:     "#CBD5E1",
  gray400:     "#94A3B8",
  gray500:     "#64748B",
  gray600:     "#475569",
  gray700:     "#334155",
  gray800:     "#1E293B",
  white:       "#FFFFFF",
  cardBg:      "#FFFFFF",
  pageBg:      "#F0F4F8",
};

const FONT = {
  xs:   Math.round(11 * (width / 390)),
  sm:   Math.round(13 * (width / 390)),
  md:   Math.round(15 * (width / 390)),
  lg:   Math.round(17 * (width / 390)),
  xl:   Math.round(20 * (width / 390)),
  xxl:  Math.round(24 * (width / 390)),
};

const SPACING = {
  xs:  Math.round(4  * (width / 390)),
  sm:  Math.round(8  * (width / 390)),
  md:  Math.round(12 * (width / 390)),
  lg:  Math.round(16 * (width / 390)),
  xl:  Math.round(20 * (width / 390)),
  xxl: Math.round(28 * (width / 390)),
};

const RADIUS = {
  sm:   Math.round(8  * (width / 390)),
  md:   Math.round(12 * (width / 390)),
  lg:   Math.round(16 * (width / 390)),
  xl:   Math.round(24 * (width / 390)),
  full: Math.round(999 * (width / 390)),
};

const ICON = (v) => Math.round(v * (width / 390));
const MAP_H  = Math.round(Math.min(height * 0.38, 300));
const AVATAR  = Math.round(52 * (width / 390));
const TOUCH   = Math.round(44 * (width / 390));

// ─── RequestCard ───────────────────────────────────────────────────────────────
const RequestCard = ({ req, isSelected, totalSeconds, formatRequestTime, onSelect, onAccept, onDecline }) => {
  const [remaining, setRemaining] = useState(() => {
    const elapsed = Math.floor((Date.now() - new Date(req.request_created_at)) / 1000);
    return Math.max(0, totalSeconds - elapsed);
  });

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) { clearInterval(id); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []); // intentionally empty — runs once per card mount

  if (remaining <= 0) return null;

  const isUrgent = remaining <= 10;
  const pct      = (remaining / totalSeconds) * 100;

  return (
    <Pressable
      style={[
        styles.reqCard,
        isSelected && styles.reqCardSelected,
        isUrgent   && styles.reqCardUrgent,
      ]}
      onPress={onSelect}
    >
      <View style={styles.timerTrack}>
        <View style={[styles.timerFill, {
          width: `${pct}%`,
          backgroundColor: isUrgent ? COLORS.red : COLORS.green,
        }]} />
      </View>

      <View style={styles.reqCardHeader}>
        <View style={[styles.reqTimerBadge, { backgroundColor: isUrgent ? COLORS.red : COLORS.navy }]}>
          <Ionicons name="timer-outline" size={ICON(12)} color={COLORS.white} />
          <Text style={styles.reqTimerText}>
            {isUrgent ? `${remaining}s left!` : `${remaining}s`}
          </Text>
        </View>
        <Text style={styles.reqTimestamp}>{formatRequestTime(req.request_created_at)}</Text>
      </View>

      <View style={styles.reqCommuterRow}>
        <View style={styles.reqAvatar}>
          {req.commuter?.profile_picture
            ? <Image source={{ uri: req.commuter.profile_picture }} style={styles.reqAvatarImg} />
            : <Ionicons name="person-circle" size={ICON(40)} color={COLORS.gray300} />}
        </View>
        <View style={{ flex: 1, marginLeft: SPACING.md }}>
          <Text style={styles.reqName}>{req.commuter?.first_name} {req.commuter?.last_name}</Text>
          <Text style={styles.reqPhone}>{req.commuter?.phone || "No phone number"}</Text>
        </View>
        <View style={[styles.farePill, { backgroundColor: COLORS.green + "18" }]}>
          <Text style={[styles.farePillText, { color: COLORS.greenDark }]}>
            ₱{req.fare?.toFixed(2) || "0.00"}
          </Text>
        </View>
      </View>

      <View style={styles.reqRouteBox}>
        <View style={styles.routeLine}>
          <View style={[styles.routeDot, { backgroundColor: COLORS.green }]} />
          <Text style={styles.routeText} numberOfLines={1}>{req.pickup_location}</Text>
        </View>
        <View style={styles.routeDivider} />
        <View style={styles.routeLine}>
          <View style={[styles.routeDot, { backgroundColor: COLORS.red }]} />
          <Text style={styles.routeText} numberOfLines={1}>{req.dropoff_location}</Text>
        </View>
      </View>

      <View style={styles.reqActions}>
        <Pressable
          style={[styles.reqBtn, { backgroundColor: COLORS.red + "15", borderColor: COLORS.red, flex: 1 }]}
          onPress={onDecline}
        >
          <Ionicons name="close" size={ICON(18)} color={COLORS.red} />
          <Text style={[styles.reqBtnText, { color: COLORS.red }]}>Decline</Text>
        </Pressable>
        <Pressable
          style={[styles.reqBtn, { backgroundColor: isUrgent ? COLORS.red : COLORS.green, flex: 2, marginLeft: SPACING.sm }]}
          onPress={onAccept}
        >
          <Ionicons name="checkmark" size={ICON(18)} color={COLORS.white} />
          <Text style={[styles.reqBtnText, { color: COLORS.white }]}>
            {isUrgent ? "Accept Now!" : "Accept"}
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
};

// ─── Modern Alert ─────────────────────────────────────────────────────────────
const ModernAlert = ({
  visible, title, message, type, onClose, onConfirm, confirmText, cancelText,
}) => {
  const slideAnim    = useRef(new Animated.Value(height * 0.15)).current;
  const opacityAnim  = useRef(new Animated.Value(0)).current;
  const hasShown = useRef(false);

  useEffect(() => {
    if (visible) {
      hasShown.current = true;
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0, useNativeDriver: true,
          damping: 18, stiffness: 200,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1, duration: 220, useNativeDriver: true,
        }),
      ]).start();
    } else if (hasShown.current) {
      Animated.parallel([
        Animated.timing(slideAnim,   { toValue: height * 0.15, duration: 180, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0,             duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const CONFIG = {
    success: { icon: "checkmark-circle", color: COLORS.green,  bg: "#ECFDF5" },
    error:   { icon: "close-circle",     color: COLORS.red,    bg: "#FEF2F2" },
    warning: { icon: "alert-circle",     color: COLORS.amber,  bg: "#FFFBEB" },
    info:    { icon: "information-circle", color: COLORS.blue, bg: "#EFF6FF" },
  };
  const cfg = CONFIG[type] || CONFIG.info;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <BlurView intensity={25} style={styles.alertOverlay}>
        <Animated.View style={[styles.alertWrapper, { opacity: opacityAnim }]}>
          <Animated.View style={[styles.alertCard, { transform: [{ translateY: slideAnim }] }]}>
            <View style={[styles.alertIconPill, { backgroundColor: cfg.bg }]}>
              <Ionicons name={cfg.icon} size={ICON(36)} color={cfg.color} />
            </View>
            <Text style={styles.alertTitle}>{title}</Text>
            <Text style={styles.alertMessage}>{message}</Text>

            <View style={styles.alertRow}>
              {cancelText && (
                <Pressable
                  onPress={onClose}
                  style={({ pressed }) => [styles.alertBtnSecondary, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.alertBtnSecondaryText}>{cancelText}</Text>
                </Pressable>
              )}
              <Pressable
                onPress={onConfirm || onClose}
                style={({ pressed }) => [
                  styles.alertBtnPrimary,
                  { backgroundColor: cfg.color },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.alertBtnPrimaryText}>{confirmText || "OK"}</Text>
              </Pressable>
            </View>
          </Animated.View>
        </Animated.View>
      </BlurView>
    </Modal>
  );
};

// ─── Toast Notification ───────────────────────────────────────────────────────
const ToastItem = ({ notification, onRemove }) => {
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  const GRAD = {
    success: [COLORS.green,  COLORS.greenDark],
    error:   [COLORS.red,    COLORS.redDark],
    warning: [COLORS.amber,  "#D97706"],
    booking: [COLORS.blue,   COLORS.blueDark],
    urgent:  [COLORS.purple, "#7C3AED"],
    info:    [COLORS.gray500, COLORS.gray600],
  };
  const ICONS = {
    success: "checkmark-circle", error: "alert-circle",
    warning: "warning",          booking: "car",
    urgent:  "alert",            info: "information-circle",
  };
  const grad  = GRAD[notification.type]  || GRAD.info;
  const icon  = ICONS[notification.type] || ICONS.info;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 16, stiffness: 180 }),
      Animated.timing(opacity,    { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.toastCard, { opacity, transform: [{ translateY }] }]}>
      <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.toastGradient}>
        <Ionicons name={icon} size={ICON(22)} color={COLORS.white} style={{ marginRight: SPACING.sm }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.toastTitle} numberOfLines={1}>{notification.title}</Text>
          <Text style={styles.toastMsg}   numberOfLines={2}>{notification.message}</Text>
        </View>
        {notification.actionable && (
          <Pressable
            style={styles.toastAction}
            onPress={() => { notification.onAction?.(); onRemove(notification.id); }}
          >
            <Text style={styles.toastActionText}>{notification.actionText || "View"}</Text>
          </Pressable>
        )}
        <Pressable style={styles.toastClose} onPress={() => onRemove(notification.id)}>
          <Ionicons name="close" size={ICON(16)} color={COLORS.white} />
        </Pressable>
      </LinearGradient>
    </Animated.View>
  );
};

// ─── Notification Centre Modal ─────────────────────────────────────────────────
const NotificationCenterModal = ({
  visible, onClose, notifications, unreadCount, markAllAsRead,
  getNotificationIcon, getNotificationColor,
}) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <BlurView intensity={80} style={{ flex: 1, justifyContent: "flex-end" }}>
      <View style={styles.ncSheet}>
        <View style={styles.ncHandle} />

        <View style={styles.ncHeader}>
          <View>
            <Text style={styles.ncTitle}>Notifications</Text>
            {unreadCount > 0 && (
              <Text style={styles.ncSub}>{unreadCount} unread</Text>
            )}
          </View>
          <View style={styles.ncHeaderRight}>
            {unreadCount > 0 && (
              <Pressable onPress={markAllAsRead} style={styles.ncMarkBtn}>
                <Text style={styles.ncMarkText}>Mark all read</Text>
              </Pressable>
            )}
            <Pressable onPress={onClose} style={styles.ncCloseBtn}>
              <Ionicons name="close" size={ICON(20)} color={COLORS.gray600} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={{ maxHeight: height * 0.55 }}
          contentContainerStyle={{ padding: SPACING.xl }}
          showsVerticalScrollIndicator={false}
        >
          {notifications.length === 0 ? (
            <View style={styles.ncEmpty}>
              <Ionicons name="notifications-off-outline" size={ICON(48)} color={COLORS.gray300} />
              <Text style={styles.ncEmptyText}>All caught up!</Text>
              <Text style={styles.ncEmptySub}>No new notifications</Text>
            </View>
          ) : (
            notifications.map((n) => (
              <View
                key={n.id}
                style={[styles.ncItem, !n.read && { backgroundColor: "#EFF6FF" }]}
              >
                <View style={[styles.ncItemIcon, { backgroundColor: getNotificationColor(n.type) + "18" }]}>
                  <Ionicons name={getNotificationIcon(n.type)} size={ICON(22)} color={getNotificationColor(n.type)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ncItemTitle}>{n.title}</Text>
                  <Text style={styles.ncItemMsg}>{n.message}</Text>
                  <Text style={styles.ncItemTime}>
                    {new Date(n.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
                {!n.read && <View style={styles.ncDot} />}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </BlurView>
  </Modal>
);

// ─── Section Label ─────────────────────────────────────────────────────────────
const SectionLabel = ({ label }) => (
  <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>
);

// ─── Stat Pill ─────────────────────────────────────────────────────────────────
const StatPill = ({ icon, label, value, color = COLORS.navyLight }) => (
  <View style={styles.statPill}>
    <View style={[styles.statPillIcon, { backgroundColor: color + "18" }]}>
      <Ionicons name={icon} size={ICON(18)} color={color} />
    </View>
    <Text style={styles.statPillLabel}>{label}</Text>
    <Text style={styles.statPillValue}>{value}</Text>
  </View>
);

// ─── Action Button ─────────────────────────────────────────────────────────────
const ActionBtn = ({ icon, label, onPress, color, textColor = COLORS.white, outline = false, disabled = false }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [
      styles.actionBtn,
      outline
        ? { borderWidth: 1.5, borderColor: color, backgroundColor: "transparent" }
        : { backgroundColor: color },
      pressed && !disabled && { opacity: 0.82, transform: [{ scale: 0.98 }] },
      disabled && { opacity: 0.45 },
    ]}
  >
    <Ionicons name={icon} size={ICON(20)} color={outline ? color : textColor} />
    <Text style={[styles.actionBtnText, { color: outline ? color : textColor }]}>{label}</Text>
  </Pressable>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
export default function DriverTrackRideScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const mapRef  = useRef(null);
  const appState             = useRef(AppState.currentState);
  const reconnectAttempts    = useRef(0);
  const isMounted            = useRef(true);
  const requestExpiryTimers  = useRef({});
  const requestSubscriptionRef = useRef(null);
  const bookingSubscriptionRef = useRef(null);
  const notificationReceivedSub = useRef(null);
  const notificationResponseSub = useRef(null);


  // ── FIX 1: debounce ref — collapses rapid INSERT bursts into one fetch ──────
  const fetchDebounceRef = useRef(null);

  // ── Refs that mirror state so subscription callbacks never close over stale values
  const activeBookingRef      = useRef(null);
  const hasArrivedRef         = useRef(false);
  const rideStartedRef        = useRef(false);
  const paymentSuccessRef     = useRef(false);
  const isProcessingPayRef    = useRef(false);
  const driverIdRef           = useRef(null);
  const pollingIntervalRef    = useRef(null);
  // ── FIX 3: ref so accept handler can read latest pending list via closure ───
  const pendingRequestsRef    = useRef([]);

  // Alert
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig,  setAlertConfig]  = useState({
    title: "", message: "", type: "info", onConfirm: null, confirmText: null, cancelText: null,
  });

  // Core
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [driverId,   setDriverId]   = useState(null);
  const [activeBooking,  setActiveBooking]  = useState(null);
  const [commuter,       setCommuter]       = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [estimatedTime,    setEstimatedTime]    = useState(null);
  const [estimatedDistance, setEstimatedDistance] = useState(null);
  const [bookingStatus, setBookingStatus] = useState("pending");
  const [locationSubscription, setLocationSubscription] = useState(null);

  // Notifications
  const [notifications,         setNotifications]         = useState([]);
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);
  const [unreadCount,            setUnreadCount]            = useState(0);

  // Requests
  const [pendingRequests,       setPendingRequests]       = useState([]);
  const [selectedRequest,       setSelectedRequest]       = useState(null);
  const [requestRouteCoordinates, setRequestRouteCoordinates] = useState([]);
  const [requestDistance,  setRequestDistance]  = useState(null);
  const [requestDuration,  setRequestDuration]  = useState(null);
  const [expiringRequestId, setExpiringRequestId] = useState(null);

  // Navigation state
  const [isNavigating,        setIsNavigating]        = useState(false);
  const [hasArrivedAtPickup,  setHasArrivedAtPickup]  = useState(false);
  const [rideStarted,         setRideStarted]         = useState(false);
  const [navigationInitialized, setNavigationInitialized] = useState(false);

  // Payment
  const [waitingForPayment,    setWaitingForPayment]    = useState(false);
  const [isProcessingPayment,  setIsProcessingPayment]  = useState(false);
  const [paymentSuccess,       setPaymentSuccess]       = useState(false);
  const [paymentMethod,        setPaymentMethod]        = useState(null);
  const [showPaymentSuccessBanner, setShowPaymentSuccessBanner] = useState(false);

  const googleApiKey = Constants.expoConfig?.extra?.GOOGLE_API_KEY;
  const REQUEST_EXPIRY_SECONDS = 30;
  const spinAnim = useRef(new Animated.Value(0)).current;

useEffect(() => {
  if (loading) {
    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
      })
    ).start();
  }
}, [loading]);

const spinStyle = {
  transform: [
    {
      rotate: spinAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ["0deg", "360deg"],
      }),
    },
  ],
};
  // ── Keep refs in sync with state ────────────────────────────────────────────
  useEffect(() => { activeBookingRef.current   = activeBooking;      }, [activeBooking]);
  useEffect(() => { hasArrivedRef.current      = hasArrivedAtPickup; }, [hasArrivedAtPickup]);
  useEffect(() => { rideStartedRef.current     = rideStarted;        }, [rideStarted]);
  useEffect(() => { paymentSuccessRef.current  = paymentSuccess;     }, [paymentSuccess]);
  useEffect(() => { isProcessingPayRef.current = isProcessingPayment; }, [isProcessingPayment]);
  useEffect(() => { driverIdRef.current        = driverId;           }, [driverId]);
  // ── FIX 3: keep pendingRequestsRef in sync so accept closure reads fresh list
  useEffect(() => { pendingRequestsRef.current = pendingRequests;    }, [pendingRequests]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const showAlert = (title, message, type = "info", options = {}) => {
    setAlertConfig({
      title, message, type,
      onConfirm:   options.onConfirm   || (() => setAlertVisible(false)),
      confirmText: options.confirmText || null,
      cancelText:  options.cancelText  || null,
    });
    setAlertVisible(true);
  };

const addNotification = async ({
  type,
  title,
  message,
  duration = 4000,
  actionable = false,
  actionText,
  onAction,
}) => {
  const id = Date.now().toString();
  const n = {
    id,
    type,
    title,
    message,
    duration,
    actionable,
    actionText,
    onAction,
    timestamp: new Date(),
    read: false,
  };

  setNotifications((prev) => [n, ...prev].slice(0, 8));
  setUnreadCount((prev) => prev + 1);

  // Haptics
  if (Platform.OS === "ios") {
    const map = { success: "Success", error: "Error", warning: "Warning" };
    if (map[type]) {
      Haptics.notificationAsync(
        Haptics.NotificationFeedbackType[map[type]]
      );
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }

  // Sound + vibration
  if (type === "booking" || type === "urgent") {
    Vibration.vibrate([0, 400, 150, 400, 150, 400]);
    await playBookingSound();
  } else {
    Vibration.vibrate(180);
  }

  setTimeout(() => {
    if (isMounted.current) {
      setNotifications((prev) => prev.filter((x) => x.id !== id));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
  }, duration);
};

  const removeNotification = (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const getNotificationIcon = (type) => {
    const m = { success: "checkmark-circle", error: "alert-circle", warning: "warning",
      booking: "car", urgent: "alert" };
    return m[type] || "information-circle";
  };
  const getNotificationColor = (type) => {
    const m = { success: COLORS.green, error: COLORS.red, warning: COLORS.amber,
      booking: COLORS.blue, urgent: COLORS.purple };
    return m[type] || COLORS.gray500;
  };

  // ── FIX 1: debounced fetch — collapses rapid INSERT bursts into one call ────
  const debouncedFetchRequests = useCallback((id) => {
    if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
    fetchDebounceRef.current = setTimeout(() => {
      if (isMounted.current) fetchPendingRequests(id);
    }, 300);
  }, []);

  // ── Expiry Timers ────────────────────────────────────────────────────────────
  const startExpiryTimer = (requestId, bookingId) => {
    // ── FIX 4: guard — don't restart a timer that's already running ───────────
    if (requestExpiryTimers.current[requestId]) return;

    setExpiringRequestId(requestId);

    const timer = setTimeout(async () => {
      if (!isMounted.current) return;
      const { data: req } = await supabase.from("booking_requests").select("status").eq("id", requestId).single();
      if (req?.status === "pending") {
        await supabase.from("booking_requests").update({ status: "expired", responded_at: new Date() }).eq("id", requestId);
        addNotification({ type: "warning", title: "Request Expired", message: "A booking request timed out", duration: 4000 });
        const currentId = driverIdRef.current;
        if (currentId) await fetchPendingRequests(currentId);
      }
      setExpiringRequestId(null);
      delete requestExpiryTimers.current[requestId];
    }, REQUEST_EXPIRY_SECONDS * 1000);

    requestExpiryTimers.current[requestId] = timer;
  };

  const clearExpiryTimer = (requestId) => {
    if (requestExpiryTimers.current[requestId]) {
      clearTimeout(requestExpiryTimers.current[requestId]);
      delete requestExpiryTimers.current[requestId];
    }
    setExpiringRequestId(null);
  };

  // ── FIX 2: clear ALL pending timers at once (used on accept) ────────────────
  const clearAllExpiryTimers = () => {
    Object.keys(requestExpiryTimers.current).forEach((id) => {
      clearTimeout(requestExpiryTimers.current[id]);
    });
    requestExpiryTimers.current = {};
    setExpiringRequestId(null);
  };

  const getTimeRemaining = (createdAt) => {
    const elapsed = Math.floor((Date.now() - new Date(createdAt)) / 1000);
    return Math.max(0, REQUEST_EXPIRY_SECONDS - elapsed);
  };

  // ── Real-time Subscriptions ──────────────────────────────────────────────────
  const setupRealtimeSubscriptions = useCallback((id) => {
    if (!id || !isMounted.current) return;

    if (requestSubscriptionRef.current) { requestSubscriptionRef.current.unsubscribe(); requestSubscriptionRef.current = null; }
    if (bookingSubscriptionRef.current) { bookingSubscriptionRef.current.unsubscribe(); bookingSubscriptionRef.current = null; }
    if (pollingIntervalRef.current)     { clearInterval(pollingIntervalRef.current);    pollingIntervalRef.current = null; }

    console.log("📡 Setting up realtime subscriptions for driver:", id);

    // ── booking_requests channel ─────────────────────────────────────────────
    const setupRequestSub = () => {
      const sub = supabase
        .channel(`driver-requests-v2-${id}`)
.on(
  "postgres_changes",
  { event: "INSERT", schema: "public", table: "booking_requests", filter: `driver_id=eq.${id}` },
  async (payload) => {
    console.log("🔔 New booking_request INSERT", payload.new.id);

    if (!isMounted.current || activeBookingRef.current) return;

    const requestId = payload.new.id;
    const bookingId = payload.new.booking_id;

    // start timer agad
    startExpiryTimer(requestId, bookingId);

    const fetchBookingDetails = async (retries = 5, delay = 250) => {
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          const { data: booking, error } = await supabase
            .from("bookings")
            .select(`
              id,
              commuter_id,
              pickup_location,
              pickup_latitude,
              pickup_longitude,
              pickup_details,
              dropoff_location,
              dropoff_latitude,
              dropoff_longitude,
              dropoff_details,
              passenger_count,
              fare,
              distance_km,
              duration_minutes,
              status,
              commuter:commuters(first_name, last_name, phone, profile_picture)
            `)
            .eq("id", bookingId)
            .single();

          if (!error && booking) return booking;
        } catch (err) {
          console.log("fetchBookingDetails retry error:", err?.message);
        }

        if (attempt < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      return null;
    };

    const booking = await fetchBookingDetails();

    if (!booking) {
      console.log("❌ Booking details not found after retries");
      addNotification({
        type: "warning",
        title: "New request received",
        message: "Tap refresh if booking details are delayed.",
        duration: 4000,
      });

      // fallback fetch
      fetchPendingRequests(id);
      return;
    }

    const newRequest = {
      request_id: requestId,
      request_status: payload.new.status,
      request_distance: payload.new.distance_km,
      request_created_at: payload.new.created_at,
      ...booking,
    };

    // ✅ IMPORTANT: update UI agad, huwag hintayin ang notifications
    setPendingRequests((prev) => {
      const exists = prev.some((r) => r.request_id === requestId);
      if (exists) return prev;
      return [newRequest, ...prev];
    });

    setSelectedRequest((prev) => prev || newRequest);

    // background refresh lang para siguradong synced
    fetchPendingRequests(id);

    // notifications / sounds - wag i-block ang UI
    Promise.resolve().then(async () => {
      try {
        await showBookingNotification({
          title: "New Booking Request! 🚗",
          body: `${booking.commuter?.first_name || "Someone"} wants a ride`,
          data: {
            type: "booking_request",
            bookingId,
            requestId,
          },
        });
      } catch (err) {
        console.log("showBookingNotification error:", err);
      }
    });

    addNotification({
      type: "booking",
      title: "New Booking Request!",
      message: `${booking.commuter?.first_name || "Someone"} wants a ride — ${REQUEST_EXPIRY_SECONDS}s to accept`,
      duration: 10000,
      actionable: true,
      actionText: "View",
      onAction: () => setSelectedRequest(newRequest),
    });
  }
)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "booking_requests", filter: `driver_id=eq.${id}` },
          async (payload) => {
            console.log("📝 booking_request UPDATE", payload.new.id, payload.new.status);
            if (!isMounted.current) return;
            if (payload.new.status === "expired") {
              clearExpiryTimer(payload.new.id);
              addNotification({ type: "warning", title: "Request Expired", message: "A booking request has expired", duration: 4000 });
              // ── FIX 1: debounced here too ────────────────────────────────────
              debouncedFetchRequests(id);
            }
            if (payload.new.status === "accepted" || payload.new.status === "rejected") {
              clearExpiryTimer(payload.new.id);
              debouncedFetchRequests(id);
            }
          }
        )
        .subscribe((status) => {
          console.log("📡 booking_requests channel:", status);
          if (status === "SUBSCRIBED") {
            reconnectAttempts.current = 0;
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            if (reconnectAttempts.current < 5) {
              reconnectAttempts.current++;
              const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
              setTimeout(() => { if (isMounted.current) requestSubscriptionRef.current = setupRequestSub(); }, delay);
            }
          }
        });
      return sub;
    };

    // ── bookings channel ─────────────────────────────────────────────────────
    const setupBookingSub = () => {
      const sub = supabase
        .channel(`driver-bookings-v2-${id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "bookings", filter: `driver_id=eq.${id}` },
          async (payload) => {
            console.log("📅 bookings change:", payload.eventType, payload.new?.status);
            if (!isMounted.current) return;

            if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
              const booking = payload.new;
              if (booking.status === "accepted" && !activeBookingRef.current) {
                addNotification({ type: "success", title: "Booking Accepted!", message: "Head to pickup location", duration: 5000 });
                await fetchActiveBooking(id);
                return;
              }
              if (activeBookingRef.current && booking.id === activeBookingRef.current.id) {
                setActiveBooking((prev) => ({ ...prev, ...booking }));
                if (booking.driver_arrived_at && !hasArrivedRef.current) {
                  setHasArrivedAtPickup(true);
                  addNotification({ type: "success", title: "Arrival Confirmed", message: "Passenger has been notified", duration: 4000 });
                }
                if (booking.ride_started_at && !rideStartedRef.current) {
  setRideStarted(true);
  await addNotification({
    type: "info",
    title: "Ride In Progress",
    message: "Trip has started — head to destination",
    duration: 4000,
  });

  await showRideNotification({
    title: "Ride In Progress",
    body: "Trip has started — head to destination",
  });
}
                if (booking.status === "cancelled") handleActiveTripCancelled(booking);
                if (booking.payment_status === "paid" && !paymentSuccessRef.current && !isProcessingPayRef.current)
                  handlePaymentSuccess(booking);
              }
            }
          }
        )
        .subscribe((status) => { console.log("📡 bookings channel:", status); });
      return sub;
    };

    requestSubscriptionRef.current = setupRequestSub();
    bookingSubscriptionRef.current = setupBookingSub();

    // ── Polling fallback every 15s ───────────────────────────────────────────
    pollingIntervalRef.current = setInterval(async () => {
      if (!isMounted.current) return;
      const currentId = driverIdRef.current;
      if (!currentId) return;
      console.log("🔄 Polling fallback");
      if (!activeBookingRef.current) await fetchPendingRequests(currentId);
      await fetchActiveBooking(currentId);
    }, 15000);

  }, [debouncedFetchRequests]);

  // ── Payment ──────────────────────────────────────────────────────────────────
  const checkPaymentStatus = async () => {
    if (!activeBooking || !isMounted.current) return;
    try {
      const { data } = await supabase.from("bookings").select("payment_status, payment_type").eq("id", activeBooking.id).single();
      if (data?.payment_status === "paid" && !paymentSuccess && !isProcessingPayment)
        handlePaymentSuccess(data);
    } catch (err) { console.log("❌ checkPaymentStatus:", err); }
  };

  const handlePaymentSuccess = (bookingData) => {
    if (isProcessingPayment) return;
    setIsProcessingPayment(true);
    setPaymentSuccess(true);
    setPaymentMethod(bookingData.payment_type || "wallet");
    setShowPaymentSuccessBanner(true);
    setWaitingForPayment(false);
    addNotification({
      type: "success", title: "Payment Received!",
      message: `₱${activeBooking?.fare?.toFixed(2)} received`,
      duration: 5000, actionable: true, actionText: "Complete",
      onAction: () => completeTrip(),
    });
    setTimeout(() => { if (isMounted.current && !isProcessingPayment) completeTrip(); }, 3000);
  };

  // ── Location Tracking ────────────────────────────────────────────────────────
  const updateDriverLocation = async (coords) => {
    if (!driverId || !isMounted.current) return;
    try {
      const { data: existing } = await supabase.from("driver_locations").select("id").eq("driver_id", driverId).maybeSingle();
      const payload = { latitude: coords.latitude, longitude: coords.longitude, is_online: true, last_updated: new Date(), last_heartbeat: new Date() };
      if (existing) await supabase.from("driver_locations").update(payload).eq("driver_id", driverId);
      else           await supabase.from("driver_locations").insert({ driver_id: driverId, ...payload });
    } catch (err) { console.log("❌ updateDriverLocation:", err); }
  };

  const startLocationTracking = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        showAlert("Permission Required", "Location access is needed to track rides", "warning");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const pos = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setDriverLocation(pos);
      await updateDriverLocation(pos);

      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
        async (newLoc) => {
          const upd = { latitude: newLoc.coords.latitude, longitude: newLoc.coords.longitude };
          setDriverLocation(upd);
          await updateDriverLocation(upd);
          if (isNavigating && activeBooking) {
            if (!hasArrivedAtPickup && !activeBooking.driver_arrived_at)
              calculateRouteToPickup(upd, { latitude: activeBooking.pickup_latitude, longitude: activeBooking.pickup_longitude });
            else if (hasArrivedAtPickup && rideStarted)
              calculateRouteToDropoff(
                { latitude: activeBooking.pickup_latitude, longitude: activeBooking.pickup_longitude },
                { latitude: activeBooking.dropoff_latitude, longitude: activeBooking.dropoff_longitude },
              );
          }
        },
      );
      setLocationSubscription(sub);
    } catch (err) { console.log("❌ startLocationTracking:", err); }
  };

  // ── Route Calculation ────────────────────────────────────────────────────────
  const fitMap = (coords) => {
    if (!mapRef.current || coords.length === 0) return;
    mapRef.current.fitToCoordinates(coords, {
      edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: true,
    });
  };

  const calcRoute = async (origin, dest, setter) => {
    if (!origin || !dest || !googleApiKey) return;
    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${dest.latitude},${dest.longitude}&key=${googleApiKey}&mode=driving`;
      const res  = await fetch(url);
      const data = await res.json();
      if (data.status === "OK" && data.routes[0]) {
        const pts = decodePolyline(data.routes[0].overview_polyline.points);
        setter(pts);
        const leg = data.routes[0].legs[0];
        setEstimatedDistance((leg.distance.value / 1000).toFixed(1));
        setEstimatedTime(Math.round(leg.duration.value / 60));
        fitMap(pts);
      }
    } catch (err) { console.log("❌ calcRoute:", err); }
  };

  const calculateRouteToPickup  = (d, p) => calcRoute(d, p, setRouteCoordinates);
  const calculateRouteToDropoff = (p, q) => calcRoute(p, q, setRouteCoordinates);

  const calculateRequestRoute = async (req) => {
    if (!req?.pickup_latitude || !req?.dropoff_latitude || !googleApiKey) return;
    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${req.pickup_latitude},${req.pickup_longitude}&destination=${req.dropoff_latitude},${req.dropoff_longitude}&key=${googleApiKey}&mode=driving`;
      const res  = await fetch(url);
      const data = await res.json();
      if (data.status === "OK" && data.routes[0]) {
        const pts = decodePolyline(data.routes[0].overview_polyline.points);
        setRequestRouteCoordinates(pts);
        const leg = data.routes[0].legs[0];
        setRequestDistance((leg.distance.value / 1000).toFixed(1));
        setRequestDuration(Math.round(leg.duration.value / 60));
      }
    } catch (err) { console.log("❌ calculateRequestRoute:", err); }
  };

  const decodePolyline = (encoded) => {
    const pts = []; let index = 0, lat = 0, lng = 0;
    while (index < encoded.length) {
      let b, shift = 0, result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lat += (result & 1) ? ~(result >> 1) : result >> 1;
      shift = 0; result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lng += (result & 1) ? ~(result >> 1) : result >> 1;
      pts.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
    }
    return pts;
  };

  // ── Fetch Functions ──────────────────────────────────────────────────────────
  const fetchActiveBooking = async (id) => {
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, commuter:commuters(id, first_name, last_name, phone, email, profile_picture)")
        .eq("driver_id", id)
        .in("status", ["accepted", "ongoing"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        setActiveBooking(data);
        setCommuter(data.commuter);
        setBookingStatus(data.status);
        setNavigationInitialized(false);
        if (data.driver_arrived_at) setHasArrivedAtPickup(true);
        if (data.ride_started_at)   setRideStarted(true);
        if (data.payment_status === "paid") {
          setPaymentSuccess(true);
          setPaymentMethod(data.payment_type);
          setShowPaymentSuccessBanner(true);
        }
      } else {
        setActiveBooking(null); setCommuter(null);
        setHasArrivedAtPickup(false); setRideStarted(false); setPaymentSuccess(false);
      }
    } catch (err) { console.log("❌ fetchActiveBooking:", err); }
  };

  const fetchPendingRequests = async (id) => {
    try {
      const { data, error } = await supabase
        .from("booking_requests")
        .select(`id, status, distance_km, created_at,
          booking:bookings!inner(id, commuter_id, pickup_location, pickup_latitude, pickup_longitude,
            pickup_details, dropoff_location, dropoff_latitude, dropoff_longitude, dropoff_details,
            passenger_count, fare, distance_km, duration_minutes, status,
            commuter:commuters(first_name, last_name, phone, profile_picture))`)
        .eq("driver_id", id)
        .in("status", ["pending"])
        .order("created_at", { ascending: false });

      if (error) throw error;

      const requests = data
        .filter((x) => x.booking?.status === "pending")
        .map((x) => ({
          request_id: x.id, ...x.booking,
          request_status: x.status, request_distance: x.distance_km, request_created_at: x.created_at,
        }));

      setPendingRequests(requests || []);

      // ── FIX 4: only start a timer if one isn't already running for this id ──
      requests.forEach((r) => {
        if (!requestExpiryTimers.current[r.request_id]) {
          startExpiryTimer(r.request_id, r.id);
        }
      });

      if (requests.length > 0 && !selectedRequest && !activeBooking) {
        setSelectedRequest(requests[0]);
      }
    } catch (err) { console.log("❌ fetchPendingRequests:", err); }
  };

  // ── Booking Actions ──────────────────────────────────────────────────────────
  const handleAcceptRequest = (bookingId, requestId) => {
    showAlert("Accept Booking?", "You'll be navigated to the pickup location.", "info", {
      confirmText: "Accept", cancelText: "Cancel",
      onConfirm: async () => {
        try {
          setLoading(true); setAlertVisible(false);

          // ── FIX 2: clear ALL timers before any async work ──────────────────
          clearAllExpiryTimers();

          const { data: check } = await supabase.from("bookings").select("status").eq("id", bookingId).single();
          if (check?.status !== "pending") {
            addNotification({ type: "warning", title: "No Longer Available", message: "This booking has already been taken", duration: 4000 });
            await fetchPendingRequests(driverId);
            return;
          }

          // Accept the chosen booking
          await supabase.from("bookings")
            .update({ status: "accepted", driver_id: driverId, accepted_at: new Date(), updated_at: new Date() })
            .eq("id", bookingId);

          // Mark this request accepted
          await supabase.from("booking_requests")
            .update({ status: "accepted", responded_at: new Date() })
            .eq("id", requestId);

          // Reject all other requests for the SAME booking (other drivers)
          await supabase.from("booking_requests")
            .update({ status: "rejected", responded_at: new Date() })
            .eq("booking_id", bookingId)
            .neq("id", requestId);

          // ── FIX 3: reject ALL other pending requests THIS driver received
          //    (for different booking_ids) so other commuters aren't left hanging
          const snapshot = pendingRequestsRef.current;
          const otherRequests = snapshot.filter((r) => r.request_id !== requestId);
          if (otherRequests.length > 0) {
            const otherRequestIds = otherRequests.map((r) => r.request_id);
            await supabase.from("booking_requests")
              .update({ status: "rejected", responded_at: new Date() })
              .in("id", otherRequestIds);
            console.log(`🚫 Auto-declined ${otherRequestIds.length} other pending request(s)`);
          }

          // ── FIX 3: clear local list immediately so UI doesn't flash stale cards
          setPendingRequests([]);
          setSelectedRequest(null);

          await fetchActiveBooking(driverId);

          addNotification({
            type: "success", title: "Booking Accepted!", message: "Head to the pickup location",
            duration: 5000, actionable: true, actionText: "Navigate",
            onAction: () => openMaps(selectedRequest?.pickup_latitude, selectedRequest?.pickup_longitude, "Pickup"),
          });
        } catch (err) {
          console.log("❌ accept:", err);
          addNotification({ type: "error", title: "Error", message: "Could not accept booking. Try again.", duration: 4000 });
        } finally { setLoading(false); }
      },
    });
  };

  const handleDeclineRequest = (bookingId, requestId) => {
    showAlert("Decline Booking?", "This request will be removed from your list.", "warning", {
      confirmText: "Decline", cancelText: "Keep",
      onConfirm: async () => {
        try {
          setAlertVisible(false);
          clearExpiryTimer(requestId);
          await supabase.from("booking_requests")
            .update({ status: "rejected", responded_at: new Date() })
            .eq("id", requestId);
          addNotification({ type: "info", title: "Booking Declined", message: "Looking for your next request…", duration: 3000 });
          await fetchPendingRequests(driverId);
        } catch (err) {
          addNotification({ type: "error", title: "Error", message: "Failed to decline. Try again.", duration: 4000 });
        }
      },
    });
  };

  const handleArrivedAtPickup = () => {
    showAlert("Arrived at Pickup?", "Confirm you have reached the pickup location so the passenger is notified.", "info", {
      confirmText: "I'm Here", cancelText: "Not Yet",
      onConfirm: async () => {
        try {
          setAlertVisible(false); setLoading(true);
          await supabase.from("bookings").update({ driver_arrived_at: new Date(), updated_at: new Date() }).eq("id", activeBooking.id);
          setHasArrivedAtPickup(true);
          addNotification({ type: "success", title: "Arrival Confirmed!", message: "Passenger has been notified. Awaiting pickup.", duration: 4000 });
        } catch (err) {
          addNotification({ type: "error", title: "Error", message: "Failed to update status", duration: 4000 });
        } finally { setLoading(false); }
      },
    });
  };

  const handleStartRide = () => {
    showAlert("Start Ride?", "Confirm the passenger is on board and you're ready to go.", "info", {
      confirmText: "Start Ride", cancelText: "Wait",
      onConfirm: async () => {
        try {
          setAlertVisible(false); setLoading(true);
          await supabase.from("bookings").update({ ride_started_at: new Date(), status: "ongoing", updated_at: new Date() }).eq("id", activeBooking.id);
          setRideStarted(true);
          addNotification({ type: "success", title: "Ride Started!", message: "Head to the destination", duration: 4000 });
        } catch (err) {
          addNotification({ type: "error", title: "Error", message: "Failed to start ride", duration: 4000 });
        } finally { setLoading(false); }
      },
    });
  };

  const processCashPayment = async () => {
    try {
      setLoading(true);
      const fare = activeBooking.fare || 0;
      await supabase.from("bookings").update({ payment_status: "paid", payment_type: "cash", updated_at: new Date() }).eq("id", activeBooking.id);
      const { data: wallet } = await supabase.from("driver_wallets").select("cash_earnings").eq("driver_id", driverId).maybeSingle();
      await supabase.from("driver_wallets").upsert(
        { driver_id: driverId, cash_earnings: (wallet?.cash_earnings || 0) + fare, updated_at: new Date() },
        { onConflict: "driver_id" },
      );
      setPaymentSuccess(true); setPaymentMethod("cash"); setShowPaymentSuccessBanner(true);
      addNotification({ type: "success", title: "Cash Received", message: `₱${fare.toFixed(2)} cash payment recorded`, duration: 4000 });
      await completeTrip();
    } catch (err) {
      addNotification({ type: "error", title: "Payment Failed", message: err.message, duration: 5000 });
    } finally { setLoading(false); }
  };

  const completeTrip = async () => {
    try {
      await supabase.from("bookings").update({ status: "completed", ride_completed_at: new Date(), updated_at: new Date() }).eq("id", activeBooking.id);
      setActiveBooking(null); setCommuter(null); setBookingStatus("pending");
      setIsNavigating(false); setHasArrivedAtPickup(false); setRideStarted(false);
      setRouteCoordinates([]); setWaitingForPayment(false); setIsProcessingPayment(false);
      setPaymentSuccess(false); setShowPaymentSuccessBanner(false); setNavigationInitialized(false);
      addNotification({ type: "success", title: "Trip Completed! 🎉", message: "Great job — ready for your next ride.", duration: 6000 });
      await fetchPendingRequests(driverId);
    } catch (err) { console.log("❌ completeTrip:", err); throw err; }
  };

  const handleCancelTrip = () => {
    if (bookingStatus !== "accepted" && bookingStatus !== "ongoing") {
      addNotification({ type: "warning", title: "Cannot Cancel", message: "Trip cannot be cancelled at this stage", duration: 3000 });
      return;
    }
    showAlert("Cancel Trip?", "The passenger will be notified. This action cannot be undone.", "warning", {
      confirmText: "Cancel Trip", cancelText: "Keep Going",
      onConfirm: async () => {
        try {
          setAlertVisible(false); setLoading(true);
          await supabase.from("bookings").update({
            status: "cancelled", cancelled_at: new Date(),
            cancellation_reason: "Cancelled by driver", cancelled_by: "driver", updated_at: new Date(),
          }).eq("id", activeBooking.id);
          setActiveBooking(null); setCommuter(null); setBookingStatus("pending");
          setIsNavigating(false); setWaitingForPayment(false); setPaymentSuccess(false); setNavigationInitialized(false);
          addNotification({ type: "warning", title: "Trip Cancelled", message: "The trip has been cancelled", duration: 4000 });
          await fetchPendingRequests(driverId);
        } catch (err) {
          addNotification({ type: "error", title: "Error", message: "Failed to cancel trip", duration: 4000 });
        } finally { setLoading(false); }
      },
    });
  };

  const handleActiveTripCancelled = (b) => {
    addNotification({
      type: "error", title: "Trip Cancelled",
      message: `Cancelled by ${b.cancelled_by || "commuter"}: ${b.cancellation_reason || "No reason given"}`,
      duration: 7000,
    });
    setActiveBooking(null); setCommuter(null); setBookingStatus("pending");
    setIsNavigating(false); setHasArrivedAtPickup(false); setRideStarted(false);
    setRouteCoordinates([]); setWaitingForPayment(false); setPaymentSuccess(false); setNavigationInitialized(false);
    fetchPendingRequests(driverId);
  };

  const handleCompleteTrip = () => {
    if (isProcessingPayment) {
      addNotification({ type: "warning", title: "Processing…", message: "Payment is being processed, please wait.", duration: 3000 });
      return;
    }
    showAlert("Complete Trip", "Select the payment method used by the passenger.", "info", {
      confirmText: "💵 Cash Payment", cancelText: "Cancel",
      onConfirm: () => { setAlertVisible(false); processCashPayment(); },
    });
  };

  // ── Utilities ────────────────────────────────────────────────────────────────
  const formatRequestTime = (dateString) => {
    const diff = Math.floor((Date.now() - new Date(dateString)) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  const fitMapToActiveMarkers = () => {
    if (!mapRef.current || !activeBooking) return;
    const pts = [];
    if (activeBooking.pickup_latitude)  pts.push({ latitude: activeBooking.pickup_latitude,  longitude: activeBooking.pickup_longitude });
    if (activeBooking.dropoff_latitude) pts.push({ latitude: activeBooking.dropoff_latitude, longitude: activeBooking.dropoff_longitude });
    if (driverLocation) pts.push(driverLocation);
    fitMap(pts);
  };

  const fitMapToRequestMarkers = () => {
    if (!mapRef.current || !selectedRequest) return;
    const pts = [];
    if (selectedRequest.pickup_latitude)  pts.push({ latitude: selectedRequest.pickup_latitude,  longitude: selectedRequest.pickup_longitude });
    if (selectedRequest.dropoff_latitude) pts.push({ latitude: selectedRequest.dropoff_latitude, longitude: selectedRequest.dropoff_longitude });
    if (driverLocation) pts.push(driverLocation);
    fitMap(pts);
  };

  const openMaps = (lat, lng, label) =>
    Linking.openURL(Platform.select({
      ios:     `maps://0?q=${label}&ll=${lat},${lng}`,
      android: `geo:${lat},${lng}?q=${lat},${lng}(${label})`,
    }));

  const callCommuter    = () => commuter?.phone ? Linking.openURL(`tel:${commuter.phone}`) :
    addNotification({ type: "warning", title: "No Phone", message: "Phone number unavailable", duration: 3000 });
  const messageCommuter = () => commuter?.phone ? Linking.openURL(`sms:${commuter.phone}`) :
    addNotification({ type: "warning", title: "No Phone", message: "Phone number unavailable", duration: 3000 });

  const getTripStatusLabel = () => {
    if (rideStarted)        return { text: "En Route to Destination", color: COLORS.blue,  icon: "navigate" };
    if (hasArrivedAtPickup) return { text: "Waiting for Passenger",    color: COLORS.amber, icon: "time" };
    return                         { text: "Heading to Pickup",         color: COLORS.green, icon: "car" };
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (driverId) await Promise.all([fetchActiveBooking(driverId), fetchPendingRequests(driverId)]);
    setRefreshing(false);
  };

  // ── Effects ──────────────────────────────────────────────────────────────────
  useEffect(() => {
  notificationReceivedSub.current = addNotificationReceivedListener((notification) => {
    const data = notification?.request?.content?.data;

    if (data?.type === "booking_request" && !activeBookingRef.current) {
      playBookingSound();
    }
  });

  notificationResponseSub.current = addNotificationResponseListener((response) => {
    const data = response?.notification?.request?.content?.data;

    if (data?.type === "booking_request") {
      const id = driverIdRef.current;
      if (id) fetchPendingRequests(id);
    }
  });

  return () => {
    notificationReceivedSub.current?.remove();
    notificationResponseSub.current?.remove();
  };
}, []);

useEffect(() => {
  isMounted.current = true;
  return () => {
    isMounted.current = false;
    locationSubscription?.remove();
    requestSubscriptionRef.current?.unsubscribe();
    bookingSubscriptionRef.current?.unsubscribe();
    notificationReceivedSub.current?.remove();
    notificationResponseSub.current?.remove();
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
    Object.values(requestExpiryTimers.current).forEach(clearTimeout);
    requestExpiryTimers.current = {};
  };
}, []);

  useEffect(() => {
    if (driverId && !requestSubscriptionRef.current) {
      setupRealtimeSubscriptions(driverId);
    }
  }, [driverId, setupRealtimeSubscriptions]);

  useEffect(() => {
    if (pendingRequests.length > 0 && !selectedRequest && !activeBooking) {
      setSelectedRequest(pendingRequests[0]);
    }
  }, [pendingRequests, activeBooking]);

  useEffect(() => {
    if (selectedRequest && !activeBooking) calculateRequestRoute(selectedRequest);
  }, [selectedRequest, activeBooking]);

  useEffect(() => {
    if (activeBooking && driverLocation && !navigationInitialized) {
      setIsNavigating(true); setNavigationInitialized(true);
      if (activeBooking.driver_arrived_at) {
        setHasArrivedAtPickup(true);
        if (activeBooking.ride_started_at) setRideStarted(true);
        calculateRouteToDropoff(
          { latitude: activeBooking.pickup_latitude,  longitude: activeBooking.pickup_longitude },
          { latitude: activeBooking.dropoff_latitude, longitude: activeBooking.dropoff_longitude },
        );
      } else {
        calculateRouteToPickup(driverLocation, { latitude: activeBooking.pickup_latitude, longitude: activeBooking.pickup_longitude });
      }
    }
  }, [activeBooking, driverLocation, navigationInitialized]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (appState.current.match(/inactive|background/) && next === "active") {
        console.log("📱 App foregrounded — refreshing data");
        if (waitingForPayment && activeBooking && !paymentSuccess) checkPaymentStatus();
        const currentId = driverIdRef.current;
        if (currentId) {
          fetchActiveBooking(currentId);
          fetchPendingRequests(currentId);
          setupRealtimeSubscriptions(currentId);
        }
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [waitingForPayment, activeBooking, paymentSuccess, setupRealtimeSubscriptions]);

  useEffect(() => {
    if (showPaymentSuccessBanner) {
      const t = setTimeout(() => setShowPaymentSuccessBanner(false), 5500);
      return () => clearTimeout(t);
    }
  }, [showPaymentSuccessBanner]);

  useFocusEffect(
    useCallback(() => {
      const init = async () => {
        const id = await AsyncStorage.getItem("user_id");
        setDriverId(id);
        if (id && isMounted.current) {
          await Promise.all([fetchActiveBooking(id), fetchPendingRequests(id), startLocationTracking()]);
          setLoading(false);
        }
      };
      init();
      return () => {
        locationSubscription?.remove();
        setLocationSubscription(null);
        setNavigationInitialized(false);
      };
    }, []),
  );

  // ── Loading ──────────────────────────────────────────────────────────────────
if (loading) {
  return (
    <View style={styles.loadingScreen}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.spinnerContainer}>
        <Animated.View style={[styles.spinnerCircle, spinStyle]}>
          <View style={styles.spinnerInner} />
        </Animated.View>

        <Text style={styles.loadingTitle}>Loading</Text>
        <Text style={styles.loadingSubtitle}>Preparing your dashboard</Text>
      </View>
    </View>
  );
}

  // ── Shared Header ─────────────────────────────────────────────────────────────
  const Header = ({ subtitle, title }) => (
    <LinearGradient
      colors={[COLORS.navy, COLORS.navyMid]}
      style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}
    >
      <Pressable onPress={() => navigation.goBack()} style={styles.headerIconBtn} hitSlop={10}>
        <Ionicons name="arrow-back" size={ICON(22)} color={COLORS.white} />
      </Pressable>

      <View style={styles.headerCenter}>
        <Text style={styles.headerSub}>{subtitle}</Text>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>

      <Pressable style={styles.headerIconBtn} onPress={() => setShowNotificationCenter(true)} hitSlop={10}>
        <Ionicons name="notifications-outline" size={ICON(22)} color={COLORS.white} />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
          </View>
        )}
      </Pressable>
    </LinearGradient>
  );

  // ── Toast Stack ───────────────────────────────────────────────────────────────
  const ToastStack = ({ topOffset = 0 }) => (
    <View style={[styles.toastStack, { top: insets.top + topOffset }]} pointerEvents="box-none">
      {notifications.map((n) => (
        <ToastItem key={n.id} notification={n} onRemove={removeNotification} />
      ))}
    </View>
  );

  // ── Shared Modals ─────────────────────────────────────────────────────────────
  const SharedModals = () => (
    <>
      <NotificationCenterModal
        visible={showNotificationCenter}
        onClose={() => setShowNotificationCenter(false)}
        notifications={notifications}
        unreadCount={unreadCount}
        markAllAsRead={markAllAsRead}
        getNotificationIcon={getNotificationIcon}
        getNotificationColor={getNotificationColor}
      />
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
    </>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW 1: ACTIVE BOOKING
  // ═══════════════════════════════════════════════════════════════════════════
  if (activeBooking) {
    const tripStatus = getTripStatusLabel();

    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />
        <Header subtitle="Active Ride" title={tripStatus.text} />
        <ToastStack topOffset={64} />

        {showPaymentSuccessBanner && (
          <View style={styles.payBanner}>
            <View style={[styles.payBannerIcon, { backgroundColor: COLORS.green }]}>
              <Ionicons name="checkmark" size={ICON(16)} color={COLORS.white} />
            </View>
            <View style={{ flex: 1, marginLeft: SPACING.sm }}>
              <Text style={styles.payBannerTitle}>Payment Received</Text>
              <Text style={styles.payBannerSub}>
                ₱{activeBooking.fare?.toFixed(2)} via {paymentMethod === "cash" ? "Cash" : paymentMethod}
              </Text>
            </View>
            <Pressable onPress={() => setShowPaymentSuccessBanner(false)} hitSlop={8}>
              <Ionicons name="close" size={ICON(18)} color={COLORS.gray500} />
            </Pressable>
          </View>
        )}

        <View style={[styles.mapWrap, { height: MAP_H }]}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFillObject}
            provider={PROVIDER_GOOGLE}
            showsUserLocation showsMyLocationButton={false} showsCompass
            initialRegion={{
              latitude:  activeBooking.pickup_latitude  || 14.5995,
              longitude: activeBooking.pickup_longitude || 120.9842,
              latitudeDelta: 0.0922, longitudeDelta: 0.0421,
            }}
            onMapReady={fitMapToActiveMarkers}
          >
            {activeBooking.pickup_latitude && (
              <Marker coordinate={{ latitude: activeBooking.pickup_latitude, longitude: activeBooking.pickup_longitude }} title="Pickup">
                <View style={[styles.mapPin, { backgroundColor: COLORS.green }]}><Ionicons name="location" size={ICON(14)} color="#FFF" /></View>
              </Marker>
            )}
            {activeBooking.dropoff_latitude && (
              <Marker coordinate={{ latitude: activeBooking.dropoff_latitude, longitude: activeBooking.dropoff_longitude }} title="Drop-off">
                <View style={[styles.mapPin, { backgroundColor: COLORS.red }]}><Ionicons name="flag" size={ICON(14)} color="#FFF" /></View>
              </Marker>
            )}
            {driverLocation && (
              <Marker coordinate={driverLocation} flat>
                <View style={[styles.mapPin, { backgroundColor: COLORS.blue }]}><Ionicons name="car" size={ICON(14)} color="#FFF" /></View>
              </Marker>
            )}
            {routeCoordinates.length > 0 && <Polyline coordinates={routeCoordinates} strokeColor={COLORS.blue} strokeWidth={4} />}
          </MapView>

          {isNavigating && (
            <View style={styles.etaChip}>
              <Ionicons name="navigate" size={ICON(14)} color={COLORS.white} />
              <Text style={styles.etaText}>
                {estimatedDistance || "–"} km · {estimatedTime || "–"} min
              </Text>
            </View>
          )}

          <Pressable style={styles.locateFab} onPress={fitMapToActiveMarkers}>
            <Ionicons name="locate" size={ICON(22)} color={COLORS.navyLight} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.sheet}
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.passengerRow}>
            <View style={styles.avatar}>
              {commuter?.profile_picture
                ? <Image source={{ uri: commuter.profile_picture }} style={styles.avatarImg} />
                : <Ionicons name="person-circle" size={ICON(48)} color={COLORS.gray300} />}
            </View>
            <View style={{ flex: 1, marginLeft: SPACING.md }}>
              <Text style={styles.passengerName}>{commuter?.first_name} {commuter?.last_name}</Text>
              <Text style={styles.passengerSub}>{activeBooking.passenger_count || 1} passenger{activeBooking.passenger_count > 1 ? "s" : ""}</Text>
            </View>
            <Pressable style={[styles.contactBtn, { backgroundColor: COLORS.navyLight }]} onPress={callCommuter}>
              <Ionicons name="call" size={ICON(18)} color={COLORS.white} />
            </Pressable>
            <Pressable style={[styles.contactBtn, { backgroundColor: COLORS.amberLight, marginLeft: SPACING.sm }]} onPress={messageCommuter}>
              <Ionicons name="chatbubble" size={ICON(18)} color={COLORS.navy} />
            </Pressable>
          </View>

          <View style={styles.routeCard}>
            <View style={styles.routeLine}>
              <View style={[styles.routeDot, { backgroundColor: COLORS.green }]} />
              <Text style={styles.routeText} numberOfLines={1}>
                {activeBooking.pickup_location}{activeBooking.pickup_details ? `  ·  ${activeBooking.pickup_details}` : ""}
              </Text>
            </View>
            <View style={styles.routeDivider} />
            <View style={styles.routeLine}>
              <View style={[styles.routeDot, { backgroundColor: COLORS.red }]} />
              <Text style={styles.routeText} numberOfLines={1}>
                {activeBooking.dropoff_location}{activeBooking.dropoff_details ? `  ·  ${activeBooking.dropoff_details}` : ""}
              </Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <StatPill icon="map-outline"  label="Distance" value={`${estimatedDistance || activeBooking.distance_km || "–"} km`} />
            <StatPill icon="time-outline" label="Est. Time" value={`${estimatedTime || activeBooking.duration_minutes || "–"} min`} />
            <StatPill icon="cash-outline" label="Fare"      value={`₱${activeBooking.fare?.toFixed(2) || "0.00"}`} color={COLORS.green} />
          </View>

          <View style={styles.actionsCol}>
            {!hasArrivedAtPickup && !rideStarted && !paymentSuccess && (
              <ActionBtn icon="location" label="I've Arrived at Pickup" onPress={handleArrivedAtPickup} color={COLORS.blue} />
            )}
            {hasArrivedAtPickup && !rideStarted && !paymentSuccess && (
              <ActionBtn icon="play-circle" label="Start Ride" onPress={handleStartRide} color={COLORS.amber} />
            )}
            {(rideStarted || paymentSuccess) && (
              <ActionBtn
                icon="checkmark-circle"
                label={paymentSuccess ? "Complete Trip" : "Complete & Collect Payment"}
                onPress={paymentSuccess ? completeTrip : handleCompleteTrip}
                color={COLORS.green}
              />
            )}

            <ActionBtn
              icon="navigate-outline"
              label={!hasArrivedAtPickup ? "Open Maps → Pickup" : "Open Maps → Destination"}
              onPress={() => openMaps(
                !hasArrivedAtPickup ? activeBooking.pickup_latitude  : activeBooking.dropoff_latitude,
                !hasArrivedAtPickup ? activeBooking.pickup_longitude : activeBooking.dropoff_longitude,
                !hasArrivedAtPickup ? "Pickup Location" : "Drop-off Location",
              )}
              color={COLORS.navyLight}
            />

            <ActionBtn icon="close-circle-outline" label="Cancel Trip" onPress={handleCancelTrip} color={COLORS.red} outline />
          </View>
        </ScrollView>

        <SharedModals />
      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW 2: PENDING REQUESTS
  // ═══════════════════════════════════════════════════════════════════════════
  if (pendingRequests.length > 0) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />
        <Header
          subtitle={`${pendingRequests.length} new request${pendingRequests.length > 1 ? "s" : ""}`}
          title="Booking Requests"
        />
        <ToastStack topOffset={64} />

        <ScrollView
          style={{ flex: 1 }}
          // contentContainerStyle={{ paddingBottom: SPACING.xxl + (insets.bottom || 0) }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.navyLight} />}
        >
          {/* Map preview */}
          <View style={[
            styles.mapWrap,
            {
              height: Math.round(height * 0.3),
              marginHorizontal: SPACING.xl,
              marginTop: SPACING.xl,
              borderRadius: RADIUS.lg,
              overflow: "hidden",
            },
          ]}>
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFillObject}
              provider={PROVIDER_GOOGLE}
              showsUserLocation showsMyLocationButton={false}
              initialRegion={{
                latitude:  selectedRequest?.pickup_latitude  || 14.5995,
                longitude: selectedRequest?.pickup_longitude || 120.9842,
                latitudeDelta: 0.0922, longitudeDelta: 0.0421,
              }}
              onMapReady={fitMapToRequestMarkers}
            >
              {selectedRequest?.pickup_latitude && (
                <Marker coordinate={{ latitude: selectedRequest.pickup_latitude, longitude: selectedRequest.pickup_longitude }}>
                  <View style={[styles.mapPin, { backgroundColor: COLORS.green }]}><Ionicons name="location" size={ICON(14)} color="#FFF" /></View>
                </Marker>
              )}
              {selectedRequest?.dropoff_latitude && (
                <Marker coordinate={{ latitude: selectedRequest.dropoff_latitude, longitude: selectedRequest.dropoff_longitude }}>
                  <View style={[styles.mapPin, { backgroundColor: COLORS.red }]}><Ionicons name="flag" size={ICON(14)} color="#FFF" /></View>
                </Marker>
              )}
              {driverLocation && (
                <Marker coordinate={driverLocation} flat>
                  <View style={[styles.mapPin, { backgroundColor: COLORS.blue }]}><Ionicons name="car" size={ICON(14)} color="#FFF" /></View>
                </Marker>
              )}
              {requestRouteCoordinates.length > 0 && (
                <Polyline coordinates={requestRouteCoordinates} strokeColor={COLORS.blue} strokeWidth={4} />
              )}
            </MapView>

            <Pressable style={styles.locateFab} onPress={fitMapToRequestMarkers}>
              <Ionicons name="locate" size={ICON(22)} color={COLORS.navyLight} />
            </Pressable>
          </View>

          {/* Trip quick-stats for selected request */}
          {selectedRequest && requestDistance && (
            <View style={[styles.quickStats, { marginHorizontal: SPACING.xl, marginTop: SPACING.md }]}>
              <StatPill icon="map-outline"    label="Route"      value={`${requestDistance} km`} />
              <StatPill icon="time-outline"   label="Est. Time"  value={`${requestDuration} min`} />
              <StatPill icon="people-outline" label="Passengers" value={`${selectedRequest.passenger_count || 1}`} color={COLORS.purple} />
            </View>
          )}

          {/* Request cards */}
          <View style={{ paddingHorizontal: SPACING.xl, marginTop: SPACING.lg }}>
            <SectionLabel label="Pending Requests" />

            {pendingRequests.map((req) => {
              const initialRemaining = getTimeRemaining(req.request_created_at);
              if (initialRemaining <= 0) return null;

              const isSelected = selectedRequest?.id === req.id;

              return (
                <RequestCard
                  key={req.request_id}
                  req={req}
                  isSelected={isSelected}
                  totalSeconds={REQUEST_EXPIRY_SECONDS}
                  formatRequestTime={formatRequestTime}
                  onSelect={() => setSelectedRequest(req)}
                  onAccept={() => handleAcceptRequest(req.id, req.request_id)}
                  onDecline={() => handleDeclineRequest(req.id, req.request_id)}
                />
              );
            })}
          </View>
        </ScrollView>

        <SharedModals />
      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW 3: EMPTY STATE
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <Header subtitle="Ready to Drive" title="Waiting for Requests" />
      <ToastStack topOffset={64} />

      <ScrollView
        contentContainerStyle={styles.emptyScroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.navyLight} />}
      >
        <LinearGradient colors={[COLORS.gray50, COLORS.white]} style={styles.emptyCard}>
          <View style={[styles.emptyIconWrap, { backgroundColor: COLORS.navyLight + "10" }]}>
            <Ionicons name="car-outline" size={ICON(60)} color={COLORS.navyLight} />
          </View>
          <Text style={styles.emptyTitle}>No Requests Yet</Text>
          <Text style={styles.emptySub}>
            You're online and ready.{"\n"}Booking requests will appear here automatically.
          </Text>

          <Pressable
            style={({ pressed }) => [styles.onlineBtn, pressed && { opacity: 0.85 }]}
            onPress={async () => {
              if (driverLocation) {
                await updateDriverLocation(driverLocation);
                addNotification({ type: "success", title: "You're Online", message: "Ready to receive bookings!", duration: 3000 });
              }
            }}
          >
            <View style={styles.onlineDot} />
            <Text style={styles.onlineBtnText}>Confirm I'm Online</Text>
          </Pressable>

          <Pressable style={styles.refreshLink} onPress={onRefresh}>
            <Ionicons name="refresh" size={ICON(16)} color={COLORS.blue} />
            <Text style={[styles.refreshLinkText, { color: COLORS.blue }]}>Refresh</Text>
          </Pressable>
        </LinearGradient>
      </ScrollView>

      <SharedModals />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: COLORS.pageBg },
  loadingScreen: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.pageBg },
  loadingCard:   { alignItems: "center", padding: SPACING.xxl, backgroundColor: COLORS.white, borderRadius: RADIUS.xl, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  loadingText:   { marginTop: SPACING.md, color: COLORS.gray500, fontSize: FONT.md },

  // Header
  header:        { flexDirection: "row", alignItems: "center", paddingBottom: SPACING.md, paddingHorizontal: SPACING.md },
  headerCenter:  { flex: 1, alignItems: "center" },
  headerSub:     { color: COLORS.amberLight, fontSize: FONT.xs, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase" },
  headerTitle:   { color: COLORS.white, fontSize: FONT.lg, fontWeight: "700", marginTop: 2 },
  headerIconBtn: { width: TOUCH, height: TOUCH, justifyContent: "center", alignItems: "center" },
  badge:         { position: "absolute", top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.red, justifyContent: "center", alignItems: "center", paddingHorizontal: 3, borderWidth: 1.5, borderColor: COLORS.navyMid },
  badgeText:     { color: COLORS.white, fontSize: FONT.xs - 2, fontWeight: "700" },

  // Toasts
  toastStack:    { position: "absolute", left: SPACING.xl, right: SPACING.xl, zIndex: 999 },
  toastCard:     { borderRadius: RADIUS.md, marginBottom: SPACING.sm, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  toastGradient: { flexDirection: "row", alignItems: "center", paddingVertical: SPACING.md, paddingHorizontal: SPACING.md },
  toastTitle:    { color: COLORS.white, fontWeight: "700", fontSize: FONT.sm },
  toastMsg:      { color: COLORS.white, opacity: 0.9, fontSize: FONT.xs, marginTop: 2 },
  toastAction:   { backgroundColor: "rgba(255,255,255,0.25)", paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, borderRadius: RADIUS.full, marginLeft: SPACING.sm },
  toastActionText: { color: COLORS.white, fontWeight: "600", fontSize: FONT.xs },
  toastClose:    { padding: SPACING.xs, marginLeft: SPACING.xs },

  // Notification centre
  ncSheet:       { backgroundColor: COLORS.white, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl },
  ncHandle:      { width: 40, height: 4, backgroundColor: COLORS.gray200, borderRadius: 2, alignSelf: "center", marginTop: SPACING.sm },
  ncHeader:      { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", padding: SPACING.xl, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  ncTitle:       { fontSize: FONT.xl, fontWeight: "700", color: COLORS.gray800 },
  ncSub:         { fontSize: FONT.sm, color: COLORS.gray400, marginTop: 2 },
  ncHeaderRight: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  ncMarkBtn:     { paddingVertical: SPACING.xs, paddingHorizontal: SPACING.sm },
  ncMarkText:    { color: COLORS.blue, fontSize: FONT.sm, fontWeight: "600" },
  ncCloseBtn:    { width: TOUCH, height: TOUCH, justifyContent: "center", alignItems: "center" },
  ncItem:        { flexDirection: "row", alignItems: "flex-start", backgroundColor: COLORS.gray50, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
  ncItemIcon:    { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center", marginRight: SPACING.md, flexShrink: 0 },
  ncItemTitle:   { fontSize: FONT.sm, fontWeight: "700", color: COLORS.gray800 },
  ncItemMsg:     { fontSize: FONT.xs, color: COLORS.gray500, marginTop: 2 },
  ncItemTime:    { fontSize: FONT.xs - 1, color: COLORS.gray400, marginTop: 4 },
  ncDot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.blue, marginTop: 4, flexShrink: 0 },
  ncEmpty:       { alignItems: "center", paddingVertical: SPACING.xxl },
  ncEmptyText:   { fontSize: FONT.lg, fontWeight: "700", color: COLORS.gray600, marginTop: SPACING.md },
  ncEmptySub:    { fontSize: FONT.sm, color: COLORS.gray400, marginTop: SPACING.xs },

  // Map
  mapWrap:       { position: "relative", backgroundColor: COLORS.gray200 },
  mapPin:        { padding: SPACING.sm, borderRadius: 20, borderWidth: 2, borderColor: COLORS.white },
  etaChip:       { position: "absolute", top: SPACING.md, left: SPACING.md, right: SPACING.md, backgroundColor: COLORS.navy + "E8", flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: RADIUS.full, gap: SPACING.xs },
  etaText:       { color: COLORS.white, fontWeight: "600", fontSize: FONT.sm },
  locateFab:     { position: "absolute", bottom: SPACING.md, right: SPACING.md, width: TOUCH + 6, height: TOUCH + 6, borderRadius: (TOUCH + 6) / 2, backgroundColor: COLORS.white, justifyContent: "center", alignItems: "center", shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, elevation: 5 },

  // Active ride sheet
  sheet:         { flex: 1, backgroundColor: COLORS.white, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, marginTop: -RADIUS.xl },
  sheetContent:  { padding: SPACING.xl, paddingBottom: SPACING.xxl },

  passengerRow:  { flexDirection: "row", alignItems: "center", marginBottom: SPACING.lg },
  avatar:        { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: COLORS.gray100, justifyContent: "center", alignItems: "center", overflow: "hidden" },
  avatarImg:     { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
  passengerName: { fontSize: FONT.lg, fontWeight: "700", color: COLORS.gray800 },
  passengerSub:  { fontSize: FONT.sm, color: COLORS.gray400, marginTop: 2 },
  contactBtn:    { width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, justifyContent: "center", alignItems: "center" },

  routeCard:     { backgroundColor: COLORS.gray50, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.lg },
  routeLine:     { flexDirection: "row", alignItems: "center" },
  routeDot:      { width: 10, height: 10, borderRadius: 5, marginRight: SPACING.sm, flexShrink: 0 },
  routeDivider:  { height: 14, width: 1.5, backgroundColor: COLORS.gray200, marginLeft: 4.25, marginVertical: 2 },
  routeText:     { flex: 1, fontSize: FONT.sm, color: COLORS.gray700, lineHeight: 20 },

  statsRow:      { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.lg },
  statPill:      { flex: 1, backgroundColor: COLORS.gray50, borderRadius: RADIUS.md, padding: SPACING.md, alignItems: "center" },
  statPillIcon:  { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center", marginBottom: SPACING.xs },
  statPillLabel: { fontSize: FONT.xs, color: COLORS.gray400, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3 },
  statPillValue: { fontSize: FONT.md, color: COLORS.gray800, fontWeight: "700", marginTop: 2 },

  actionsCol:    { gap: SPACING.sm },
  actionBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: RADIUS.md, minHeight: TOUCH },
  actionBtnText: { fontSize: FONT.md, fontWeight: "700" },

  payBanner:     { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.white, marginHorizontal: SPACING.xl, marginTop: SPACING.sm, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.green + "40", shadowColor: COLORS.green, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3 },
  payBannerIcon: { width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  payBannerTitle: { fontSize: FONT.sm, fontWeight: "700", color: COLORS.gray800 },
  payBannerSub:  { fontSize: FONT.xs, color: COLORS.gray500, marginTop: 1 },

  quickStats:    { flexDirection: "row", gap: SPACING.sm },

  // Request cards
  reqCard:       { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, marginBottom: SPACING.lg, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 10, elevation: 3, overflow: "hidden" },
  reqCardSelected: { borderWidth: 2, borderColor: COLORS.navyLight },
  reqCardUrgent: { borderWidth: 2, borderColor: COLORS.red },
  timerTrack:    { height: 4, backgroundColor: COLORS.gray100 },
  timerFill:     { height: 4, borderRadius: 2 },
  reqCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  reqTimerBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: RADIUS.full },
  reqTimerText:  { color: COLORS.white, fontSize: FONT.xs, fontWeight: "700" },
  reqTimestamp:  { fontSize: FONT.xs, color: COLORS.gray400 },
  reqCommuterRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.lg, marginBottom: SPACING.md },
  reqAvatar:     { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.gray100, justifyContent: "center", alignItems: "center", overflow: "hidden" },
  reqAvatarImg:  { width: 44, height: 44, borderRadius: 22 },
  reqName:       { fontSize: FONT.md, fontWeight: "700", color: COLORS.gray800 },
  reqPhone:      { fontSize: FONT.xs, color: COLORS.gray400, marginTop: 2 },
  farePill:      { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: RADIUS.full },
  farePillText:  { fontSize: FONT.md, fontWeight: "800" },
  reqRouteBox:   { marginHorizontal: SPACING.lg, backgroundColor: COLORS.gray50, borderRadius: RADIUS.sm, padding: SPACING.md, marginBottom: SPACING.md },
  reqActions:    { flexDirection: "row", padding: SPACING.lg, paddingTop: 0, gap: SPACING.sm },
  reqBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.xs, paddingVertical: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: "transparent", minHeight: TOUCH },
  reqBtnText:    { fontSize: FONT.md, fontWeight: "700" },

  sectionLabel:  { fontSize: FONT.xs, fontWeight: "700", color: COLORS.gray400, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: SPACING.md },

  // Empty state
  emptyScroll:   { flexGrow: 1, justifyContent: "center", padding: SPACING.xl },
  emptyCard:     { borderRadius: RADIUS.xl, padding: SPACING.xxl, alignItems: "center", shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  emptyIconWrap: { width: 100, height: 100, borderRadius: 50, justifyContent: "center", alignItems: "center", marginBottom: SPACING.xl },
  emptyTitle:    { fontSize: FONT.xxl, fontWeight: "800", color: COLORS.gray800, marginBottom: SPACING.sm, textAlign: "center" },
  emptySub:      { fontSize: FONT.md, color: COLORS.gray400, textAlign: "center", lineHeight: 22, marginBottom: SPACING.xxl },
  onlineBtn:     { flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.navyLight, paddingHorizontal: SPACING.xxl, paddingVertical: SPACING.md + 2, borderRadius: RADIUS.full },
  onlineDot:     { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.green },
  onlineBtnText: { color: COLORS.white, fontWeight: "700", fontSize: FONT.md },
  refreshLink:   { flexDirection: "row", alignItems: "center", gap: SPACING.xs, marginTop: SPACING.lg },
  refreshLinkText: { fontSize: FONT.sm, fontWeight: "600" },

  // Alert
  alertOverlay:  { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.45)" },
  alertWrapper:  { width: "100%", justifyContent: "center", alignItems: "center", paddingHorizontal: SPACING.xxl },
  alertCard:     { backgroundColor: COLORS.white, borderRadius: RADIUS.xl, width: "100%", padding: SPACING.xxl, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  alertIconPill: { width: 64, height: 64, borderRadius: 32, justifyContent: "center", alignItems: "center", alignSelf: "center", marginBottom: SPACING.lg },
  alertTitle:    { fontSize: FONT.xl, fontWeight: "800", color: COLORS.gray800, textAlign: "center", marginBottom: SPACING.sm },
  alertMessage:  { fontSize: FONT.md, color: COLORS.gray500, textAlign: "center", lineHeight: 22, marginBottom: SPACING.xl },
  alertRow:      { flexDirection: "row", gap: SPACING.sm },
  alertBtnSecondary: { flex: 1, paddingVertical: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.gray100, alignItems: "center" },
  alertBtnSecondaryText: { fontSize: FONT.md, fontWeight: "700", color: COLORS.gray600 },
  alertBtnPrimary:   { flex: 1, paddingVertical: SPACING.md, borderRadius: RADIUS.md, alignItems: "center" },
  alertBtnPrimaryText:   { fontSize: FONT.md, fontWeight: "700", color: COLORS.white },

  spinnerContainer: {
  alignItems: "center",
  justifyContent: "center",
},

spinnerCircle: {
  width: 56,
  height: 56,
  borderRadius: 28,
  borderWidth: 3,
  borderColor: COLORS.gray200,
  borderTopColor: COLORS.navyLight, // accent color
  marginBottom: SPACING.lg,
},

spinnerInner: {
  flex: 1,
  borderRadius: 28,
  backgroundColor: "transparent",
},

loadingTitle: {
  fontSize: FONT.lg,
  fontWeight: "700",
  color: COLORS.gray800,
},

loadingSubtitle: {
  fontSize: FONT.sm,
  color: COLORS.gray400,
  marginTop: 4,
},
});