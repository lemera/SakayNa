// screens/driver/DriverTrackRideScreen.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Linking,
  Platform,
  Image,
  StyleSheet,
  Modal,
  Animated,
  Vibration,
  Dimensions,
  AppState,
  RefreshControl,
  StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import {
  playBookingSound,
  showBookingNotification,
  showRideNotification,
  addNotificationReceivedListener,
  addNotificationResponseListener,
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
  navy:       "#0F2744",
  navyLight:  "#183B5C",
  navyMid:    "#1E4976",
  amber:      "#F59E0B",
  amberDark:  "#D97706",
  green:      "#10B981",
  greenDark:  "#059669",
  red:        "#EF4444",
  redDark:    "#DC2626",
  blue:       "#183B5C",
  blueDark:   "#183B5C",
  white:      "#FFFFFF",
  pageBg:     "#EEF2F7",
  cardBg:     "#FFFFFF",
  gray50:     "#F8FAFC",
  gray100:    "#F1F5F9",
  gray200:    "#E2E8F0",
  gray300:    "#CBD5E1",
  gray400:    "#94A3B8",
  gray500:    "#64748B",
  gray600:    "#475569",
  gray700:    "#334155",
  gray800:    "#1E293B",
  overlay:    "rgba(0,0,0,0.45)",
};

const FONT = {
  xs:  Math.round(11 * (width / 390)),
  sm:  Math.round(13 * (width / 390)),
  md:  Math.round(15 * (width / 390)),
  lg:  Math.round(17 * (width / 390)),
  xl:  Math.round(20 * (width / 390)),
  xxl: Math.round(24 * (width / 390)),
};

const SPACING = {
  xs:  Math.round(4  * (width / 390)),
  sm:  Math.round(8  * (width / 390)),
  md:  Math.round(12 * (width / 390)),
  lg:  Math.round(16 * (width / 390)),
  xl:  Math.round(20 * (width / 390)),
  xxl: Math.round(28 * (width / 390)),
};

const BR = {
  sm:   Math.round(8  * (width / 390)),
  md:   Math.round(12 * (width / 390)),
  lg:   Math.round(16 * (width / 390)),
  xl:   Math.round(24 * (width / 390)),
  xxl:  Math.round(30 * (width / 390)),
  full: 999,
};

const TOUCH    = Math.round(44 * (width / 390));
const ICON     = (size) => Math.round(size * (width / 390));
const AVATAR   = Math.round(52 * (width / 390));

const DEFAULT_REGION = {
  latitude:      14.5995,
  longitude:     120.9842,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const REQUEST_EXPIRY_SECONDS = 30;

// ─── Trip phase helper ────────────────────────────────────────────────────────
function resolveTripPhase(hasArrivedAtPickup, rideStarted, paymentSuccess) {
  if (paymentSuccess)       return "payment_received";
  if (rideStarted)          return "trip_in_progress";
  if (hasArrivedAtPickup)   return "at_pickup";
  return "heading_to_pickup";
}

const PHASE_META = {
  heading_to_pickup: {
    subtitle:   "Accepted Ride",
    title:      "Heading to pickup",
    color:      COLORS.navyLight,
    chipLabel:  "To pickup",
    chipColor:  COLORS.green,
    polylineColor: COLORS.green,
    dashed:     true,
  },
  at_pickup: {
    subtitle:   "At Pickup Point",
    title:      "Waiting for passenger",
    color:      COLORS.amber,
    chipLabel:  "At pickup",
    chipColor:  COLORS.amber,
    polylineColor: COLORS.amber,
    dashed:     false,
  },
  trip_in_progress: {
    subtitle:   "Trip In Progress",
    title:      "Heading to destination",
    color:      COLORS.navyLight,
    chipLabel:  "To destination",
    chipColor:  COLORS.navyLight,
    polylineColor: COLORS.navyLight,
    dashed:     false,
  },
  payment_received: {
    subtitle:   "Payment Received",
    title:      "Ready to complete trip",
    color:      COLORS.green,
    chipLabel:  "Complete trip",
    chipColor:  COLORS.green,
    polylineColor: COLORS.green,
    dashed:     false,
  },
};

// ─── Small UI atoms ───────────────────────────────────────────────────────────

function Header({ insets, navigation, title, subtitle, unreadCount, onOpenNotifications, statusColor }) {
  return (
    <LinearGradient
      colors={[COLORS.navy, COLORS.navyMid]}
      style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}
    >
      <Pressable style={styles.headerIconBtn} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={ICON(22)} color={COLORS.white} />
      </Pressable>

      <View style={styles.headerCenter}>
        <View style={styles.headerSubRow}>
          {!!statusColor && <View style={[styles.headerStatusDot, { backgroundColor: statusColor }]} />}
          <Text style={styles.headerSub}>{subtitle}</Text>
        </View>
        <Text numberOfLines={1} style={styles.headerTitle}>{title}</Text>
      </View>
    </LinearGradient>
  );
}

function DriverMapMarker() {
  return (
    <Image
      source={require("../../assets/driver-icon.png")}
      style={styles.markerImage}
      resizeMode="contain"
    />
  );
}

function LocationPin({ type = "pickup" }) {
  const iconSource = type === "pickup"
    ? require("../../assets/pick-up-icon.png")
    : require("../../assets/drop-off-icon.png");
  return <Image source={iconSource} style={styles.pinImage} resizeMode="contain" />;
}

function ToastItem({ item, onRemove }) {
  const translateY = useRef(new Animated.Value(-30)).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 15, stiffness: 180 }),
      Animated.timing(opacity,    { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateY]);

  const colorsByType = {
    success: [COLORS.green,   COLORS.greenDark],
    error:   [COLORS.red,     COLORS.redDark],
    warning: [COLORS.amber,   COLORS.amberDark],
    booking: [COLORS.navyLight, COLORS.navy],
    info:    [COLORS.gray600, COLORS.gray700],
  };
  const iconByType = {
    success: "checkmark-circle",
    error:   "alert-circle",
    warning: "warning",
    booking: "car",
    info:    "information-circle",
  };

  return (
    <Animated.View style={[styles.toastCard, { opacity, transform: [{ translateY }] }]}>
      <LinearGradient colors={colorsByType[item.type] || colorsByType.info} style={styles.toastGradient}>
        <Ionicons
          name={iconByType[item.type] || iconByType.info}
          size={ICON(18)}
          color={COLORS.white}
          style={{ marginRight: SPACING.sm }}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.toastTitle}   numberOfLines={1}>{item.title}</Text>
          <Text style={styles.toastMessage} numberOfLines={2}>{item.message}</Text>
        </View>
        {!!item.actionable && (
          <Pressable
            style={styles.toastActionBtn}
            onPress={() => { item.onAction?.(); onRemove(item.id); }}
          >
            <Text style={styles.toastActionText}>{item.actionText || "View"}</Text>
          </Pressable>
        )}
        <Pressable onPress={() => onRemove(item.id)} style={styles.toastCloseBtn}>
          <Ionicons name="close" size={ICON(16)} color={COLORS.white} />
        </Pressable>
      </LinearGradient>
    </Animated.View>
  );
}

function ModernAlert({
  visible,
  title,
  message,
  type = "info",
  confirmText = "OK",
  cancelText,
  onClose,
  onConfirm,
}) {
  const slide   = useRef(new Animated.Value(40)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slide, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 200 }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      slide.setValue(40);
      opacity.setValue(0);
    }
  }, [visible, opacity, slide]);

  const cfg = {
    success: { icon: "checkmark-circle", color: COLORS.green,    bg: "#ECFDF5" },
    error:   { icon: "close-circle",     color: COLORS.red,      bg: "#FEF2F2" },
    warning: { icon: "alert-circle",     color: COLORS.amber,    bg: "#FFFBEB" },
    info:    { icon: "information-circle", color: COLORS.navyLight, bg: "#EFF6FF" },
  }[type] || { icon: "information-circle", color: COLORS.navyLight, bg: "#EFF6FF" };

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <BlurView intensity={20} style={styles.alertOverlay}>
        <Animated.View style={[styles.alertWrap, { opacity }]}>
          <Animated.View style={[styles.alertCard, { transform: [{ translateY: slide }] }]}>
            <View style={[styles.alertIconBox, { backgroundColor: cfg.bg }]}>
              <Ionicons name={cfg.icon} size={ICON(38)} color={cfg.color} />
            </View>
            <Text style={styles.alertTitle}>{title}</Text>
            <Text style={styles.alertMessage}>{message}</Text>
            <View style={styles.alertBtns}>
              {!!cancelText && (
                <Pressable style={styles.alertSecondaryBtn} onPress={onClose}>
                  <Text style={styles.alertSecondaryText}>{cancelText}</Text>
                </Pressable>
              )}
              <Pressable
                style={[styles.alertPrimaryBtn, { backgroundColor: cfg.color }]}
                onPress={onConfirm || onClose}
              >
                <Text style={styles.alertPrimaryText}>{confirmText}</Text>
              </Pressable>
            </View>
          </Animated.View>
        </Animated.View>
      </BlurView>
    </Modal>
  );
}

function NotificationCenterModal({
  visible,
  notifications,
  unreadCount,
  onClose,
  onMarkAllRead,
  getNotificationColor,
  getNotificationIcon,
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <BlurView intensity={60} style={styles.ncOverlay}>
        <View style={styles.ncSheet}>
          <View style={styles.ncHandle} />
          <View style={styles.ncHeader}>
            <View>
              <Text style={styles.ncTitle}>Notifications</Text>
              {unreadCount > 0 && <Text style={styles.ncSubtitle}>{unreadCount} unread</Text>}
            </View>
            <View style={styles.ncHeaderRight}>
              {unreadCount > 0 && (
                <Pressable onPress={onMarkAllRead}>
                  <Text style={styles.ncMarkRead}>Mark all read</Text>
                </Pressable>
              )}
              <Pressable style={styles.ncCloseBtn} onPress={onClose}>
                <Ionicons name="close" size={ICON(20)} color={COLORS.gray600} />
              </Pressable>
            </View>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: SPACING.xl, paddingBottom: SPACING.xxl }}
          >
            {notifications.length === 0 ? (
              <View style={styles.ncEmpty}>
                <Ionicons name="notifications-off-outline" size={ICON(44)} color={COLORS.gray300} />
                <Text style={styles.ncEmptyTitle}>All caught up</Text>
                <Text style={styles.ncEmptySub}>No new notifications right now.</Text>
              </View>
            ) : (
              notifications.map((item) => (
                <View key={item.id} style={[styles.ncItem, !item.read && styles.ncItemUnread]}>
                  <View style={[styles.ncItemIconWrap, { backgroundColor: `${getNotificationColor(item.type)}18` }]}>
                    <Ionicons name={getNotificationIcon(item.type)} size={ICON(18)} color={getNotificationColor(item.type)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ncItemTitle}>{item.title}</Text>
                    <Text style={styles.ncItemMessage}>{item.message}</Text>
                    <Text style={styles.ncItemTime}>
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  </View>
                  {!item.read && <View style={styles.ncUnreadDot} />}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </BlurView>
    </Modal>
  );
}

function StepBar({ phase }) {
  const steps = [
    { label: "Accepted",    icon: "checkmark-circle-outline", phase: "heading_to_pickup" },
    { label: "At Pickup",   icon: "location-outline",          phase: "at_pickup" },
    { label: "In Trip",     icon: "navigate-outline",          phase: "trip_in_progress" },
    { label: "Paid",        icon: "cash-outline",              phase: "payment_received" },
  ];

  const order = ["heading_to_pickup", "at_pickup", "trip_in_progress", "payment_received"];
  const currentIndex = order.indexOf(phase);

  return (
    <View style={styles.stepBar}>
      {steps.map((step, index) => {
        const stepIndex = order.indexOf(step.phase);
        const done      = stepIndex <= currentIndex;
        const active    = stepIndex === currentIndex;
        return (
          <View key={index} style={styles.stepItem}>
            <View style={[
              styles.stepCircle,
              done   && { backgroundColor: COLORS.green,     borderColor: COLORS.green },
              active && { borderColor: COLORS.navyLight },
            ]}>
              <Ionicons name={step.icon} size={ICON(14)} color={done ? COLORS.white : COLORS.gray400} />
            </View>
            <Text style={[styles.stepLabel, done && styles.stepLabelDone]}>{step.label}</Text>
            {index < steps.length - 1 && (
              <View style={[styles.stepConnector, done && styles.stepConnectorDone]} />
            )}
          </View>
        );
      })}
    </View>
  );
}

function SummaryBar({ timeText, distanceText, fareText }) {
  return (
    <View style={styles.summaryBar}>
      <View style={styles.summaryItem}>
        <Ionicons name="time-outline" size={ICON(16)} color={COLORS.navyLight} />
        <Text style={styles.summaryText}>{timeText}</Text>
      </View>
      <View style={styles.summaryDivider} />
      <View style={styles.summaryItem}>
        <Ionicons name="map-outline" size={ICON(16)} color={COLORS.navyLight} />
        <Text style={styles.summaryText}>{distanceText}</Text>
      </View>
      <View style={styles.summaryDivider} />
      <View style={styles.summaryItem}>
        <Ionicons name="cash-outline" size={ICON(16)} color={COLORS.greenDark} />
        <Text style={[styles.summaryText, { color: COLORS.greenDark, fontWeight: "800" }]}>{fareText}</Text>
      </View>
    </View>
  );
}

function ActionButton({ label, icon, onPress, color, outline = false, disabled = false, large = false }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionBtn,
        large && styles.actionBtnLarge,
        outline
          ? { backgroundColor: "transparent", borderWidth: 1.5, borderColor: color }
          : { backgroundColor: color },
        pressed && !disabled && { opacity: 0.88, transform: [{ scale: 0.99 }] },
        disabled && { opacity: 0.45 },
      ]}
    >
      <Ionicons name={icon} size={ICON(large ? 20 : 18)} color={outline ? color : COLORS.white} />
      <Text style={[
        styles.actionBtnText,
        large && styles.actionBtnTextLarge,
        { color: outline ? color : COLORS.white },
      ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function RequestCard({ req, isSelected, totalSeconds, onSelect, onAccept, onDecline, formatRequestTime }) {
  const [remaining, setRemaining] = useState(() => {
    const elapsed = Math.floor((Date.now() - new Date(req.request_created_at)) / 1000);
    return Math.max(0, totalSeconds - elapsed);
  });

  useEffect(() => {
    if (remaining <= 0) return undefined;
    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [remaining]);

  if (remaining <= 0) return null;

  const urgent = remaining <= 10;

  return (
    <Pressable style={[styles.reqCard, isSelected && styles.reqCardSelected]} onPress={onSelect}>
      <View style={styles.reqTop}>
        <View style={styles.reqAvatarWrap}>
          {req.commuter?.profile_picture ? (
            <Image source={{ uri: req.commuter.profile_picture }} style={styles.reqAvatar} />
          ) : (
            <View style={styles.reqAvatarFallback}>
              <Ionicons name="person" size={ICON(20)} color={COLORS.gray400} />
            </View>
          )}
        </View>
        <View style={{ flex: 1, marginLeft: SPACING.md }}>
          <Text style={styles.reqName}>
            {req.commuter?.first_name || "Passenger"} {req.commuter?.last_name || ""}
          </Text>
          <Text style={styles.reqSub}>
            {req.passenger_count || 1} passenger • {formatRequestTime(req.request_created_at)}
          </Text>
        </View>
        <View style={styles.reqFareWrap}>
          <Text style={styles.reqFareLabel}>Fare</Text>
          <Text style={styles.reqFareValue}>₱{Number(req.fare || 0).toFixed(2)}</Text>
        </View>
      </View>

      <View style={styles.reqRouteCard}>
        <View style={styles.routeRow}>
          <View style={[styles.routeDot, { backgroundColor: COLORS.green }]} />
          <Text style={styles.routeText} numberOfLines={1}>{req.pickup_location}</Text>
        </View>
        <View style={styles.reqRouteDivider} />
        <View style={styles.routeRow}>
          <View style={[styles.routeDot, { backgroundColor: COLORS.red }]} />
          <Text style={styles.routeText} numberOfLines={1}>{req.dropoff_location}</Text>
        </View>
      </View>

      <View style={styles.reqBottom}>
        <View style={[styles.reqTimePill, urgent && styles.reqTimePillUrgent]}>
          <Ionicons name={urgent ? "alert-circle" : "time-outline"} size={ICON(14)} color={urgent ? COLORS.white : COLORS.gray600} />
          <Text style={[styles.reqTimeText, urgent && { color: COLORS.white }]}>{remaining}s left</Text>
        </View>
        <View style={styles.reqActions}>
          <Pressable style={styles.reqDeclineBtn} onPress={onDecline}>
            <Text style={styles.reqDeclineText}>Decline</Text>
          </Pressable>
          <Pressable style={[styles.reqAcceptBtn, urgent && { backgroundColor: COLORS.red }]} onPress={onAccept}>
            <Text style={styles.reqAcceptText}>Accept</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function DriverTrackRideScreen({ navigation }) {
  const insets       = useSafeAreaInsets();
  const googleApiKey = Constants.expoConfig?.extra?.GOOGLE_API_KEY;

  const mapRef                    = useRef(null);
  const isMounted                 = useRef(true);
  const appStateRef               = useRef(AppState.currentState);
  const locationSubscriptionRef   = useRef(null);
  const requestSubscriptionRef    = useRef(null);
  const bookingSubscriptionRef    = useRef(null);
  const pollingIntervalRef        = useRef(null);
  const fetchDebounceRef          = useRef(null);
  const requestExpiryTimersRef    = useRef({});
  const driverIdRef               = useRef(null);
  const activeBookingRef          = useRef(null);
  const pendingRequestsRef        = useRef([]);
  const notificationReceivedSub   = useRef(null);
  const notificationResponseSub   = useRef(null);
  const lastBookingFeedbackRef    = useRef({ requestId: null, ts: 0 });

    const routeFetchLockRef         = useRef(false);
  const lastRouteFetchAtRef       = useRef(0);
  const lastRouteSignatureRef     = useRef("");

  // FIX: Use refs for payment processing state to avoid stale closures in callbacks
  const isProcessingPaymentRef    = useRef(false);
  const paymentSuccessRef         = useRef(false);
  const hasArrivedAtPickupRef     = useRef(false);
  const rideStartedRef            = useRef(false);

  const SHEET_EXPANDED  = Math.round(height * 0.52);
  const SHEET_COLLAPSED = Math.round(128 * (height / 844));
  const sheetAnim       = useRef(new Animated.Value(SHEET_EXPANDED)).current;

  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [driverId,       setDriverId]       = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);

  const [activeBooking,       setActiveBooking]       = useState(null);
  const [bookingStatus,       setBookingStatus]       = useState("pending");
  const [commuter,            setCommuter]            = useState(null);

  const [hasArrivedAtPickup,    setHasArrivedAtPickup]    = useState(false);
  const [rideStarted,           setRideStarted]           = useState(false);
  const [waitingForPayment,     setWaitingForPayment]     = useState(false);
  const [isProcessingPayment,   setIsProcessingPayment]   = useState(false);
  const [paymentSuccess,        setPaymentSuccess]        = useState(false);
  const [paymentMethod,         setPaymentMethod]         = useState(null);
  const [showPaymentSuccessBanner, setShowPaymentSuccessBanner] = useState(false);

  const [routeCoordinates,  setRouteCoordinates]  = useState([]);
  const [estimatedTime,     setEstimatedTime]     = useState(null);
  const [estimatedDistance, setEstimatedDistance] = useState(null);

  const [pendingRequests,         setPendingRequests]         = useState([]);
  const [selectedRequest,         setSelectedRequest]         = useState(null);
  const [requestRouteCoordinates, setRequestRouteCoordinates] = useState([]);
  const [requestDistance,         setRequestDistance]         = useState(null);
  const [requestDuration,         setRequestDuration]         = useState(null);

  const [sheetMinimized,        setSheetMinimized]        = useState(false);
  const [navigationInitialized, setNavigationInitialized] = useState(false);

  const [notifications,         setNotifications]         = useState([]);
  const [unreadCount,           setUnreadCount]           = useState(0);
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig,  setAlertConfig]  = useState({
    title: "", message: "", type: "info", confirmText: "OK", cancelText: null, onConfirm: null,
  });

  // ── Sync refs ───────────────────────────────────────────────────────────────
  useEffect(() => { driverIdRef.current      = driverId;        }, [driverId]);
  useEffect(() => { activeBookingRef.current = activeBooking;   }, [activeBooking]);
  useEffect(() => { pendingRequestsRef.current = pendingRequests; }, [pendingRequests]);

  // FIX: Keep refs in sync with state for use in async callbacks / closures
  useEffect(() => { isProcessingPaymentRef.current = isProcessingPayment; }, [isProcessingPayment]);
  useEffect(() => { paymentSuccessRef.current = paymentSuccess;           }, [paymentSuccess]);
  useEffect(() => { hasArrivedAtPickupRef.current = hasArrivedAtPickup;   }, [hasArrivedAtPickup]);
  useEffect(() => { rideStartedRef.current = rideStarted;                 }, [rideStarted]);

  // ── Sheet ───────────────────────────────────────────────────────────────────
  const toggleSheet = useCallback(() => {
    const nextMin = !sheetMinimized;
    Animated.spring(sheetAnim, {
      toValue: nextMin ? SHEET_COLLAPSED : SHEET_EXPANDED,
      useNativeDriver: false,
      damping: 22,
      stiffness: 220,
    }).start();
    setSheetMinimized(nextMin);
  }, [SHEET_COLLAPSED, SHEET_EXPANDED, sheetAnim, sheetMinimized]);

  // ── Alert ───────────────────────────────────────────────────────────────────
  const showAlert = useCallback((title, message, type = "info", options = {}) => {
    setAlertConfig({
      title,
      message,
      type,
      confirmText: options.confirmText || "OK",
      cancelText:  options.cancelText  || null,
      onConfirm:   options.onConfirm   || (() => setAlertVisible(false)),
    });
    setAlertVisible(true);
  }, []);

  // ── Toast notifications ─────────────────────────────────────────────────────
  const addNotification = useCallback(async ({
    type = "info", title, message, duration = 3500,
    actionable = false, actionText, onAction,
  }) => {
    const id   = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const item = {
      id, type, title, message, actionable, actionText, onAction,
      timestamp: new Date().toISOString(), read: false,
    };

    setNotifications((prev) => [item, ...prev].slice(0, 10));
    setUnreadCount((prev) => prev + 1);

    if (Platform.OS === "ios") {
      if      (type === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      else if (type === "error")   Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      else if (type === "warning") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      else                         Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const timer = setTimeout(() => {
      if (!isMounted.current) return;
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, duration);

    return () => clearTimeout(timer);
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }, []);

  const getNotificationIcon = useCallback((type) => ({
    success: "checkmark-circle",
    error:   "alert-circle",
    warning: "warning",
    booking: "car",
    info:    "information-circle",
  }[type] || "information-circle"), []);

  const getNotificationColor = useCallback((type) => ({
    success: COLORS.green,
    error:   COLORS.red,
    warning: COLORS.amber,
    booking: COLORS.navyLight,
    info:    COLORS.gray500,
  }[type] || COLORS.gray500), []);

  const formatRequestTime = useCallback((dateString) => {
    const diff = Math.floor((Date.now() - new Date(dateString)) / 1000);
    if (diff < 60)   return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }, []);

  const shouldPlayBookingFeedback = useCallback((requestId) => {
    const now  = Date.now();
    const last = lastBookingFeedbackRef.current;
    if (last.requestId === requestId && now - last.ts < 4000) return false;
    lastBookingFeedbackRef.current = { requestId, ts: now };
    return true;
  }, []);

  // ── Navigation helpers ──────────────────────────────────────────────────────
  const openMaps = useCallback((lat, lng, label) => {
    if (!lat || !lng) return;
    const url = Platform.select({
      ios:     `maps://0?q=${label}&ll=${lat},${lng}`,
      android: `geo:${lat},${lng}?q=${lat},${lng}(${label})`,
      default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    });
    Linking.openURL(url);
  }, []);

  const callCommuter = useCallback(() => {
    if (commuter?.phone) {
      Linking.openURL(`tel:${commuter.phone}`);
    } else {
      addNotification({ type: "warning", title: "Phone unavailable", message: "This passenger has no phone number saved." });
    }
  }, [addNotification, commuter?.phone]);

  const messageCommuter = useCallback(() => {
    if (commuter?.phone) {
      Linking.openURL(`sms:${commuter.phone}`);
    } else {
      addNotification({ type: "warning", title: "Phone unavailable", message: "This passenger has no phone number saved." });
    }
  }, [addNotification, commuter?.phone]);

  // ── Map helpers ─────────────────────────────────────────────────────────────
  const fitMap = useCallback((coordinates) => {
    if (!mapRef.current || !coordinates?.length) return;
    mapRef.current.fitToCoordinates(coordinates, {
      edgePadding: { top: 70, right: 70, bottom: 70, left: 70 },
      animated: true,
    });
  }, []);

  const fitMapToActiveMarkers = useCallback(() => {
    if (!activeBookingRef.current) return;
    const coords = [];
    if (driverLocation) coords.push(driverLocation);
    if (activeBookingRef.current.pickup_latitude  && activeBookingRef.current.pickup_longitude)
      coords.push({ latitude: Number(activeBookingRef.current.pickup_latitude),  longitude: Number(activeBookingRef.current.pickup_longitude) });
    if (activeBookingRef.current.dropoff_latitude && activeBookingRef.current.dropoff_longitude)
      coords.push({ latitude: Number(activeBookingRef.current.dropoff_latitude), longitude: Number(activeBookingRef.current.dropoff_longitude) });
    fitMap(coords);
  }, [driverLocation, fitMap]);

  const fitMapToRequestMarkers = useCallback(() => {
    if (!selectedRequest) return;
    const coords = [];
    if (driverLocation) coords.push(driverLocation);
    if (selectedRequest.pickup_latitude  && selectedRequest.pickup_longitude)
      coords.push({ latitude: Number(selectedRequest.pickup_latitude),  longitude: Number(selectedRequest.pickup_longitude) });
    if (selectedRequest.dropoff_latitude && selectedRequest.dropoff_longitude)
      coords.push({ latitude: Number(selectedRequest.dropoff_latitude), longitude: Number(selectedRequest.dropoff_longitude) });
    fitMap(coords);
  }, [driverLocation, fitMap, selectedRequest]);

  // ── Directions ──────────────────────────────────────────────────────────────
  const decodePolyline = useCallback((encoded) => {
    const points = [];
    let index = 0, lat = 0, lng = 0;
    while (index < encoded.length) {
      let b, shift = 0, result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lat += result & 1 ? ~(result >> 1) : result >> 1;
      shift = 0; result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lng += result & 1 ? ~(result >> 1) : result >> 1;
      points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
    }
    return points;
  }, []);

const calculateDirections = useCallback(async (origin, destination, options = {}) => {
  if (!googleApiKey || !origin || !destination) return null;

  const now = Date.now();
  const phase = options.phase || "unknown";

  const signature = [
    phase,
    origin.latitude?.toFixed(5),
    origin.longitude?.toFixed(5),
    destination.latitude?.toFixed(5),
    destination.longitude?.toFixed(5),
  ].join("|");

  // iwas duplicate fetch kung halos same lang
  if (signature === lastRouteSignatureRef.current && now - lastRouteFetchAtRef.current < 2500) {
    return null;
  }

  // iwas sabay-sabay na fetch
  if (routeFetchLockRef.current) return null;

  routeFetchLockRef.current = true;
  lastRouteFetchAtRef.current = now;
  lastRouteSignatureRef.current = signature;

  try {
    const url =
      `https://maps.googleapis.com/maps/api/directions/json` +
      `?origin=${origin.latitude},${origin.longitude}` +
      `&destination=${destination.latitude},${destination.longitude}` +
      `&mode=driving` +
      `&alternatives=false` +
      `&key=${googleApiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== "OK" || !data.routes?.[0]) {
      return null;
    }

    const route = data.routes[0];
    const leg = route.legs?.[0];

    return {
      points: decodePolyline(route.overview_polyline.points),
      distanceKm: leg?.distance?.value ? (leg.distance.value / 1000).toFixed(1) : null,
      durationMin: leg?.duration?.value ? Math.round(leg.duration.value / 60) : null,
    };
  } catch (error) {
    console.log("calculateDirections error:", error?.message || error);
    return null;
  } finally {
    setTimeout(() => {
      routeFetchLockRef.current = false;
    }, 800);
  }
}, [decodePolyline, googleApiKey]);

const calculateRouteToPickup = useCallback(async (origin, pickup) => {
  const result = await calculateDirections(origin, pickup, { phase: "pickup" });
  if (!result) return;

  setRouteCoordinates(result.points);
  setEstimatedDistance(result.distanceKm);
  setEstimatedTime(result.durationMin);
}, [calculateDirections]);

const calculateRouteToDropoff = useCallback(async (origin, dropoff) => {
  const result = await calculateDirections(origin, dropoff, { phase: "dropoff" });
  if (!result) return;

  setRouteCoordinates(result.points);
  setEstimatedDistance(result.distanceKm);
  setEstimatedTime(result.durationMin);
}, [calculateDirections]);

  const calculateRequestRoute = useCallback(async (request) => {
    if (!request?.pickup_latitude || !request?.dropoff_latitude) return;
    const result = await calculateDirections(
      { latitude: Number(request.pickup_latitude),  longitude: Number(request.pickup_longitude) },
      { latitude: Number(request.dropoff_latitude), longitude: Number(request.dropoff_longitude) },
    );
    if (!result) return;
    setRequestRouteCoordinates(result.points);
    setRequestDistance(result.distanceKm);
    setRequestDuration(result.durationMin);
  }, [calculateDirections]);

  // ── Driver location ─────────────────────────────────────────────────────────
  const updateDriverLocation = useCallback(async (coords) => {
    const currentDriverId = driverIdRef.current;
    if (!currentDriverId || !coords) return;
    try {
      const { data: existing } = await supabase
        .from("driver_locations").select("id").eq("driver_id", currentDriverId).maybeSingle();
      const payload = {
        latitude:       coords.latitude,
        longitude:      coords.longitude,
        is_online:      true,
        last_updated:   new Date().toISOString(),
        last_heartbeat: new Date().toISOString(),
      };
      if (existing?.id) {
        await supabase.from("driver_locations").update(payload).eq("driver_id", currentDriverId);
      } else {
        await supabase.from("driver_locations").insert({ driver_id: currentDriverId, ...payload });
      }
    } catch (error) {
      console.log("updateDriverLocation error:", error?.message || error);
    }
  }, []);

  const startLocationTracking = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        showAlert("Location required", "Please allow location so you can receive and track rides properly.", "warning");
        return;
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const next    = { latitude: current.coords.latitude, longitude: current.coords.longitude };
      setDriverLocation(next);
      await updateDriverLocation(next);

      const sub = await Location.watchPositionAsync(
  {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 2000,
    distanceInterval: 3,
  },
        async (location) => {
          const latest = { latitude: location.coords.latitude, longitude: location.coords.longitude };
          setDriverLocation(latest);
          await updateDriverLocation(latest);
          const currentActiveBooking = activeBookingRef.current;
          if (!currentActiveBooking) return;
          // FIX: Use refs instead of stale state values from closure
          if (!hasArrivedAtPickupRef.current && !rideStartedRef.current) {
            await calculateRouteToPickup(latest, {
              latitude:  Number(currentActiveBooking.pickup_latitude),
              longitude: Number(currentActiveBooking.pickup_longitude),
            });
          } else if (rideStartedRef.current) {
            await calculateRouteToDropoff(latest, {
              latitude:  Number(currentActiveBooking.dropoff_latitude),
              longitude: Number(currentActiveBooking.dropoff_longitude),
            });
          }
        },
      );
      locationSubscriptionRef.current = sub;
    } catch (error) {
      console.log("startLocationTracking error:", error?.message || error);
    }
  }, [calculateRouteToDropoff, calculateRouteToPickup, showAlert, updateDriverLocation]);

  // ── Data fetching ───────────────────────────────────────────────────────────
  const clearActiveTripState = useCallback(() => {
    setActiveBooking(null);
    setCommuter(null);
    setBookingStatus("pending");
    setHasArrivedAtPickup(false);
    setRideStarted(false);
    setWaitingForPayment(false);
    setPaymentSuccess(false);
    setPaymentMethod(null);
    setShowPaymentSuccessBanner(false);
    setRouteCoordinates([]);
    setEstimatedTime(null);
    setEstimatedDistance(null);
    setNavigationInitialized(false);
    // FIX: Also clear refs immediately so async callbacks see correct state
    activeBookingRef.current = null;
    isProcessingPaymentRef.current = false;
    paymentSuccessRef.current = false;
    hasArrivedAtPickupRef.current = false;
    rideStartedRef.current = false;
  }, []);

  const fetchActiveBooking = useCallback(async (currentDriverId) => {
    if (!currentDriverId) return;
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select(`*, commuter:commuters(id, first_name, last_name, phone, email, profile_picture)`)
        .eq("driver_id", currentDriverId)
        .in("status", ["accepted", "ongoing"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;

      if (!data) {
        clearActiveTripState();
        return;
      }

      setActiveBooking(data);
      setCommuter(data.commuter || null);
      setBookingStatus(data.status || "accepted");
      setHasArrivedAtPickup(!!data.driver_arrived_at);
      setRideStarted(!!data.ride_started_at);
      setWaitingForPayment(data.status === "ongoing");
      setPaymentSuccess(data.payment_status === "paid");
      setPaymentMethod(data.payment_type || null);
      setShowPaymentSuccessBanner(data.payment_status === "paid");
    } catch (error) {
      console.log("fetchActiveBooking error:", error?.message || error);
    }
  }, [clearActiveTripState]);

  const startExpiryTimer = useCallback((requestId) => {
    if (requestExpiryTimersRef.current[requestId]) return;
    const timer = setTimeout(async () => {
      if (!isMounted.current) return;
      try {
        const { data } = await supabase.from("booking_requests").select("status").eq("id", requestId).single();
        if (data?.status === "pending") {
          await supabase.from("booking_requests").update({ status: "expired", responded_at: new Date().toISOString() }).eq("id", requestId);
          addNotification({ type: "warning", title: "Request expired", message: "A ride request timed out." });
          if (driverIdRef.current && !activeBookingRef.current) fetchPendingRequests(driverIdRef.current);
        }
      } catch (error) {
        console.log("startExpiryTimer error:", error?.message || error);
      } finally {
        delete requestExpiryTimersRef.current[requestId];
      }
    }, REQUEST_EXPIRY_SECONDS * 1000);
    requestExpiryTimersRef.current[requestId] = timer;
  }, [addNotification]);

  const clearExpiryTimer     = useCallback((requestId) => {
    if (requestExpiryTimersRef.current[requestId]) { clearTimeout(requestExpiryTimersRef.current[requestId]); delete requestExpiryTimersRef.current[requestId]; }
  }, []);

  const clearAllExpiryTimers = useCallback(() => {
    Object.keys(requestExpiryTimersRef.current).forEach((id) => clearTimeout(requestExpiryTimersRef.current[id]));
    requestExpiryTimersRef.current = {};
  }, []);

  const fetchPendingRequests = useCallback(async (currentDriverId) => {
    if (!currentDriverId || activeBookingRef.current) return;

    try {
      const { data, error } = await supabase
        .from("booking_requests")
        .select(`
          id, status, distance_km, created_at,
          booking:bookings!inner(
            id, commuter_id, pickup_location, pickup_latitude, pickup_longitude, pickup_details,
            dropoff_location, dropoff_latitude, dropoff_longitude, dropoff_details,
            passenger_count, fare, distance_km, duration_minutes, status,
            commuter:commuters(first_name, last_name, phone, profile_picture)
          )
        `)
        .eq("driver_id", currentDriverId)
        .in("status", ["pending"])
        .order("created_at", { ascending: false });

      if (error) throw error;

      const requests = (data || [])
        .filter((row) => row.booking?.status === "pending")
        .map((row) => ({
          request_id:          row.id,
          request_status:      row.status,
          request_distance:    row.distance_km,
          request_created_at:  row.created_at,
          ...row.booking,
        }));

      setPendingRequests(requests);
      requests.forEach((request) => startExpiryTimer(request.request_id));

      if (!activeBookingRef.current) {
        setSelectedRequest((prev) => {
          if (prev && requests.some((r) => r.request_id === prev.request_id)) return prev;
          return requests[0] || null;
        });
      }
    } catch (error) {
      console.log("fetchPendingRequests error:", error?.message || error);
    }
  }, [startExpiryTimer]);

  const debouncedFetchRequests = useCallback((currentDriverId) => {
    if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
    fetchDebounceRef.current = setTimeout(() => {
      if (!isMounted.current) return;
      fetchPendingRequests(currentDriverId);
    }, 250);
  }, [fetchPendingRequests]);

  // ── Payment & trip completion ───────────────────────────────────────────────
  // FIX: completeTrip now uses a snapshot of the booking passed in (or reads from ref)
  // so it never fails due to cleared state.
const completeTrip = useCallback(async (bookingSnapshot) => {
  const bookingToComplete = bookingSnapshot || activeBookingRef.current;

  if (!bookingToComplete?.id) {
    console.log("completeTrip: no booking to complete");
    addNotification({
      type: "error",
      title: "No active booking",
      message: "Trip could not be completed because booking was missing.",
    });
    return;
  }

  try {
    setLoading(true);

    const { data, error } = await supabase
      .from("bookings")
      .update({
        status: "completed",
        ride_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingToComplete.id)
      .select()
      .single();

    if (error) {
      console.log("completeTrip update error:", error);
      throw error;
    }

    if (!data) {
      throw new Error("No row was updated when completing trip.");
    }

    clearActiveTripState();

    await addNotification({
      type: "success",
      title: "Trip completed",
      message: "You're ready for your next ride.",
    });

    if (driverIdRef.current) {
      await fetchPendingRequests(driverIdRef.current);
    }
  } catch (error) {
    console.log("completeTrip error:", error?.message || error);

    addNotification({
      type: "error",
      title: "Could not complete trip",
      message: error?.message || "Please try again.",
    });
  } finally {
    setLoading(false);
  }
}, [addNotification, clearActiveTripState, fetchPendingRequests]);

  // FIX: handlePaymentSuccess uses refs to check processing state and captures
  // the current booking as a snapshot so completeTrip always gets the right data.
  const handlePaymentSuccess = useCallback(async (bookingData) => {
    // Use ref for immediate check — avoids stale closure bug
    if (isProcessingPaymentRef.current) return;
    isProcessingPaymentRef.current = true;
    setIsProcessingPayment(true);
    setPaymentSuccess(true);
    paymentSuccessRef.current = true;
    setPaymentMethod(bookingData?.payment_type || "wallet");
    setShowPaymentSuccessBanner(true);
    setWaitingForPayment(false);

    // Capture current booking snapshot before any state changes
    const currentBooking = activeBookingRef.current || bookingData;

    await addNotification({
      type: "success",
      title: "Payment received",
      message: `₱${Number(currentBooking?.fare || 0).toFixed(2)} received successfully.`,
      actionable: true,
      actionText: "Complete",
      onAction: () => completeTrip(currentBooking),
    });

    setTimeout(() => {
      if (isMounted.current) completeTrip(currentBooking);
    }, 2500);
  }, [addNotification, completeTrip]);

  const checkPaymentStatus = useCallback(async () => {
    const currentBooking = activeBookingRef.current;
    if (!currentBooking?.id) return;
    try {
      const { data } = await supabase
        .from("bookings")
        .select("payment_status, payment_type")
        .eq("id", currentBooking.id)
        .single();
      // FIX: Use refs instead of stale state values
      if (data?.payment_status === "paid" && !paymentSuccessRef.current && !isProcessingPaymentRef.current) {
        handlePaymentSuccess({ ...currentBooking, ...data });
      }
    } catch (error) {
      console.log("checkPaymentStatus error:", error?.message || error);
    }
  }, [handlePaymentSuccess]);

const processCashPayment = useCallback(async () => {
  try {
    const currentBooking = activeBookingRef.current;
    const currentDriverId = driverIdRef.current;

    if (!currentBooking?.id || !currentDriverId) {
      addNotification({
        type: "error",
        title: "Missing booking",
        message: "No active booking found.",
      });
      return;
    }

    setLoading(true);

    const fare = Number(currentBooking.fare || 0);

    const { error: bookingError } = await supabase
      .from("bookings")
      .update({
        payment_status: "paid",
        payment_type: "cash",
        updated_at: new Date().toISOString(),
      })
      .eq("id", currentBooking.id);

    if (bookingError) {
      console.log("processCashPayment bookingError:", bookingError);
      throw bookingError;
    }

    const { data: wallet, error: walletReadError } = await supabase
      .from("driver_wallets")
      .select("cash_earnings")
      .eq("driver_id", currentDriverId)
      .maybeSingle();

    if (walletReadError) {
      console.log("processCashPayment walletReadError:", walletReadError);
      throw walletReadError;
    }

    const { error: walletUpsertError } = await supabase
      .from("driver_wallets")
      .upsert(
        {
          driver_id: currentDriverId,
          cash_earnings: Number(wallet?.cash_earnings || 0) + fare,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "driver_id" }
      );

    if (walletUpsertError) {
      console.log("processCashPayment walletUpsertError:", walletUpsertError);
      throw walletUpsertError;
    }

    setPaymentSuccess(true);
    paymentSuccessRef.current = true;
    setPaymentMethod("cash");
    setShowPaymentSuccessBanner(true);
    setWaitingForPayment(false);

    await addNotification({
      type: "success",
      title: "Cash received",
      message: `₱${fare.toFixed(2)} recorded successfully.`,
    });

    await completeTrip(currentBooking);
  } catch (error) {
    console.log("processCashPayment error:", error?.message || error);

    addNotification({
      type: "error",
      title: "Payment failed",
      message: error?.message || "Could not record the cash payment.",
    });
  } finally {
    setLoading(false);
  }
}, [addNotification, completeTrip]);

  const handleActiveTripCancelled = useCallback(async (booking) => {
    clearActiveTripState();
    await addNotification({
      type: "error",
      title: "Trip cancelled",
      message: `Cancelled by ${booking.cancelled_by || "passenger"}: ${booking.cancellation_reason || "No reason given"}`,
      duration: 5000,
    });
    if (driverIdRef.current) fetchPendingRequests(driverIdRef.current);
  }, [addNotification, clearActiveTripState, fetchPendingRequests]);

  // ── Realtime subscriptions ──────────────────────────────────────────────────
  const setupRealtimeSubscriptions = useCallback((currentDriverId) => {
    if (!currentDriverId || !isMounted.current) return;
    requestSubscriptionRef.current?.unsubscribe();
    bookingSubscriptionRef.current?.unsubscribe();
    if (pollingIntervalRef.current) { clearInterval(pollingIntervalRef.current); pollingIntervalRef.current = null; }

    requestSubscriptionRef.current = supabase
      .channel(`driver-requests-${currentDriverId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "booking_requests", filter: `driver_id=eq.${currentDriverId}` },
        async (payload) => {
          if (!isMounted.current || activeBookingRef.current) return;

          const requestId = payload.new.id;
          const bookingId = payload.new.booking_id;
          startExpiryTimer(requestId);

          const fetchBookingDetails = async (retries = 5, delay = 250) => {
            for (let attempt = 0; attempt < retries; attempt += 1) {
              try {
                const { data, error } = await supabase
                  .from("bookings")
                  .select(`id, commuter_id, pickup_location, pickup_latitude, pickup_longitude, pickup_details, dropoff_location, dropoff_latitude, dropoff_longitude, dropoff_details, passenger_count, fare, distance_km, duration_minutes, status, commuter:commuters(first_name, last_name, phone, profile_picture)`)
                  .eq("id", bookingId).single();
                if (!error && data) return data;
              } catch (err) {
                console.log("fetch booking details retry error:", err?.message || err);
              }
              if (attempt < retries - 1) await new Promise((resolve) => setTimeout(resolve, delay));
            }
            return null;
          };

          const booking = await fetchBookingDetails();
          if (!booking) {
            addNotification({ type: "warning", title: "New request received", message: "Ride details are still loading. Pull to refresh if needed." });
            fetchPendingRequests(currentDriverId);
            return;
          }

          const newRequest = {
            request_id:         requestId,
            request_status:     payload.new.status,
            request_distance:   payload.new.distance_km,
            request_created_at: payload.new.created_at,
            ...booking,
          };

          setPendingRequests((prev) => {
            const exists = prev.some((r) => r.request_id === requestId);
            if (exists) return prev;
            return [newRequest, ...prev];
          });
          setSelectedRequest((prev) => prev || newRequest);
          fetchPendingRequests(currentDriverId);

          const isForeground = AppState.currentState === "active";
          if (shouldPlayBookingFeedback(requestId)) {
            if (isForeground) {
              await playBookingSound();
              Vibration.vibrate(180);
              addNotification({
                type: "booking",
                title: "New booking request",
                message: `${booking.commuter?.first_name || "Passenger"} is requesting a ride.`,
                duration: 7000,
                actionable: true,
                actionText: "View",
                onAction: () => setSelectedRequest(newRequest),
              });
            } else {
              try {
                await showBookingNotification({
                  title: "New Booking Request! 🚗",
                  body:  `${booking.commuter?.first_name || "Passenger"} wants a ride`,
                  data:  { type: "booking_request", bookingId, requestId },
                });
              } catch (err) { console.log("showBookingNotification error:", err?.message || err); }
            }
          }
        },
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "booking_requests", filter: `driver_id=eq.${currentDriverId}` },
        async (payload) => {
          if (!isMounted.current) return;
          const nextStatus = payload.new.status;
          if (nextStatus === "expired" || nextStatus === "accepted" || nextStatus === "rejected") {
            clearExpiryTimer(payload.new.id);
            debouncedFetchRequests(currentDriverId);
          }
        },
      )
      .subscribe((status) => { console.log("request channel:", status); });

    bookingSubscriptionRef.current = supabase
      .channel(`driver-bookings-${currentDriverId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `driver_id=eq.${currentDriverId}` },
        async (payload) => {
          if (!isMounted.current) return;
          if (!["INSERT", "UPDATE"].includes(payload.eventType)) return;
          const booking = payload.new;

          if (booking.status === "accepted" && !activeBookingRef.current) {
            await addNotification({ type: "success", title: "Booking accepted!", message: "Head to the pickup point to get your passenger." });
            fetchActiveBooking(currentDriverId);
            return;
          }

          if (activeBookingRef.current && booking.id === activeBookingRef.current.id) {
            setActiveBooking((prev) => ({ ...prev, ...booking }));
            // Update the ref immediately so subsequent checks in this handler are correct
            activeBookingRef.current = { ...activeBookingRef.current, ...booking };

            if (booking.driver_arrived_at && !hasArrivedAtPickupRef.current) {
              setHasArrivedAtPickup(true);
              hasArrivedAtPickupRef.current = true;
              addNotification({ type: "success", title: "Arrival confirmed", message: "The passenger has been notified you're here." });
            }

            if (booking.ride_started_at && !rideStartedRef.current) {
              setRideStarted(true);
              rideStartedRef.current = true;
              addNotification({ type: "info", title: "Ride started", message: "Proceed to the destination." });
              try {
                await showRideNotification({ title: "Ride In Progress", body: "Trip has started — head to destination" });
              } catch (err) { console.log("showRideNotification error:", err?.message || err); }
            }

            if (booking.status === "cancelled") handleActiveTripCancelled(booking);

            // FIX: Use refs to avoid stale closure bug
            if (booking.payment_status === "paid" && !paymentSuccessRef.current && !isProcessingPaymentRef.current) {
              handlePaymentSuccess({ ...activeBookingRef.current, ...booking });
            }
          }
        },
      )
      .subscribe((status) => { console.log("booking channel:", status); });

    pollingIntervalRef.current = setInterval(async () => {
      if (!isMounted.current || !driverIdRef.current) return;
      if (!activeBookingRef.current) {
        fetchPendingRequests(driverIdRef.current);
      }
      fetchActiveBooking(driverIdRef.current);
    }, 15000);
  }, [
    addNotification, clearExpiryTimer, debouncedFetchRequests, fetchActiveBooking, fetchPendingRequests,
    handleActiveTripCancelled, handlePaymentSuccess,
    shouldPlayBookingFeedback, startExpiryTimer,
  ]);

  // ── Action handlers ─────────────────────────────────────────────────────────
  const handleAcceptRequest = useCallback((bookingId, requestId) => {
    showAlert("Accept this booking?", "You will start navigation to the pickup point.", "info", {
      confirmText: "Accept",
      cancelText:  "Cancel",
      onConfirm: async () => {
        try {
          setAlertVisible(false);
          setLoading(true);
          clearAllExpiryTimers();

          const { data: currentBooking } = await supabase.from("bookings").select("status").eq("id", bookingId).single();
          if (currentBooking?.status !== "pending") {
            addNotification({ type: "warning", title: "Booking unavailable", message: "This ride has already been taken." });
            fetchPendingRequests(driverIdRef.current);
            return;
          }

          await supabase.from("bookings").update({ status: "accepted", driver_id: driverIdRef.current, accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", bookingId);
          await supabase.from("booking_requests").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", requestId);
          await supabase.from("booking_requests").update({ status: "rejected", responded_at: new Date().toISOString() }).eq("booking_id", bookingId).neq("id", requestId);

          setPendingRequests([]);
          setSelectedRequest(null);
          await fetchActiveBooking(driverIdRef.current);

          addNotification({
            type: "success",
            title: "Ride accepted!",
            message: "Head to the passenger pickup point.",
            actionable: true,
            actionText: "Navigate",
            onAction: () => {
              const selected = pendingRequestsRef.current.find((x) => x.request_id === requestId);
              if (selected?.pickup_latitude && selected?.pickup_longitude)
                openMaps(selected.pickup_latitude, selected.pickup_longitude, "Pickup");
            },
          });
        } catch (error) {
          console.log("handleAcceptRequest error:", error?.message || error);
          addNotification({ type: "error", title: "Could not accept ride", message: "Please try again." });
        } finally {
          setLoading(false);
        }
      },
    });
  }, [addNotification, clearAllExpiryTimers, fetchActiveBooking, fetchPendingRequests, openMaps, showAlert]);

  const handleDeclineRequest = useCallback((bookingId, requestId) => {
    showAlert("Decline this booking?", "This request will be removed from your queue.", "warning", {
      confirmText: "Decline",
      cancelText:  "Keep",
      onConfirm: async () => {
        try {
          setAlertVisible(false);
          clearExpiryTimer(requestId);
          await supabase.from("booking_requests").update({ status: "rejected", responded_at: new Date().toISOString() }).eq("id", requestId);
          addNotification({ type: "info", title: "Request declined", message: "Looking for the next request." });
          fetchPendingRequests(driverIdRef.current);
        } catch (error) {
          console.log("handleDeclineRequest error:", error?.message || error);
          addNotification({ type: "error", title: "Could not decline request", message: "Please try again." });
        }
      },
    });
  }, [addNotification, clearExpiryTimer, fetchPendingRequests, showAlert]);

  const handleArrivedAtPickup = useCallback(() => {
    if (!activeBookingRef.current?.id) return;
    showAlert(
      "Confirm arrival at pickup?",
      "The passenger will be notified that you have arrived and are waiting.",
      "info",
      {
        confirmText: "Yes, I'm here",
        cancelText:  "Not yet",
        onConfirm: async () => {
          try {
            setAlertVisible(false);
            setLoading(true);
            await supabase.from("bookings").update({ driver_arrived_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", activeBookingRef.current.id);
            setHasArrivedAtPickup(true);
            hasArrivedAtPickupRef.current = true;
            addNotification({ type: "success", title: "Arrival confirmed", message: "The passenger knows you're here. Please wait for them to board." });
          } catch (error) {
            console.log("handleArrivedAtPickup error:", error?.message || error);
            addNotification({ type: "error", title: "Could not update status", message: "Please try again." });
          } finally {
            setLoading(false);
          }
        },
      },
    );
  }, [addNotification, showAlert]);

  const handleStartRide = useCallback(() => {
    if (!activeBookingRef.current?.id) return;
    showAlert(
      "Start this trip?",
      "Confirm the passenger has boarded and you're ready to go.",
      "info",
      {
        confirmText: "Start ride",
        cancelText:  "Wait",
        onConfirm: async () => {
          try {
            setAlertVisible(false);
            setLoading(true);
            await supabase
  .from("bookings")
  .update({
    ride_started_at: new Date().toISOString(),
    status: "ongoing",
    updated_at: new Date().toISOString(),
  })
  .eq("id", activeBookingRef.current.id);

setRideStarted(true);
rideStartedRef.current = true;
setWaitingForPayment(true);

// agad i-clear ang lumang pickup route para hindi mukhang stale
setRouteCoordinates([]);
setNavigationInitialized(false);

// agad i-calculate ang route to dropoff, hindi na hihintay sa next gps tick
if (
  driverLocation &&
  activeBookingRef.current?.dropoff_latitude &&
  activeBookingRef.current?.dropoff_longitude
) {
  await calculateRouteToDropoff(driverLocation, {
    latitude: Number(activeBookingRef.current.dropoff_latitude),
    longitude: Number(activeBookingRef.current.dropoff_longitude),
  });

  fitMap([
    driverLocation,
    {
      latitude: Number(activeBookingRef.current.dropoff_latitude),
      longitude: Number(activeBookingRef.current.dropoff_longitude),
    },
  ]);
}

addNotification({
  type: "success",
  title: "Ride started!",
  message: "Proceed to the destination.",
});
          } catch (error) {
            console.log("handleStartRide error:", error?.message || error);
            addNotification({ type: "error", title: "Could not start ride", message: "Please try again." });
          } finally {
            setLoading(false);
          }
        },
      },
    );
  }, [addNotification, showAlert]);

  const handleCancelTrip = useCallback(() => {
    if (!activeBookingRef.current?.id) return;
    showAlert(
      "Cancel this trip?",
      "The passenger will be notified. This action cannot be undone.",
      "warning",
      {
        confirmText: "Cancel trip",
        cancelText:  "Keep trip",
        onConfirm: async () => {
          try {
            setAlertVisible(false);
            setLoading(true);
            await supabase.from("bookings").update({
              status: "cancelled", cancelled_at: new Date().toISOString(),
              cancellation_reason: "Cancelled by driver", cancelled_by: "driver",
              updated_at: new Date().toISOString(),
            }).eq("id", activeBookingRef.current.id);

            clearActiveTripState();
            addNotification({ type: "warning", title: "Trip cancelled", message: "The ride has been cancelled." });
            if (driverIdRef.current) fetchPendingRequests(driverIdRef.current);
          } catch (error) {
            console.log("handleCancelTrip error:", error?.message || error);
            addNotification({ type: "error", title: "Could not cancel trip", message: "Please try again." });
          } finally {
            setLoading(false);
          }
        },
      },
    );
  }, [addNotification, clearActiveTripState, fetchPendingRequests, showAlert]);

const handleCompleteTrip = useCallback(() => {
  const currentBooking = activeBookingRef.current;
  if (!currentBooking?.id) return;

  if (currentBooking.payment_type === "cash") {
    showAlert(
      "Collect payment",
      "Confirm that you received the cash payment.",
      "info",
      {
        confirmText: "Cash received",
        cancelText: "Cancel",
        onConfirm: async () => {
          setAlertVisible(false);
          await processCashPayment();
        },
      }
    );
    return;
  }

  if (currentBooking.payment_status === "paid") {
    showAlert(
      "Complete trip",
      "Digital payment is already marked as paid. Complete this trip now?",
      "success",
      {
        confirmText: "Complete",
        cancelText: "Cancel",
        onConfirm: async () => {
          setAlertVisible(false);
          await completeTrip(currentBooking);
        },
      }
    );
    return;
  }

  showAlert(
    "Waiting for payment",
    "This trip cannot be completed yet because payment is still pending.",
    "warning"
  );
}, [completeTrip, processCashPayment, showAlert]);

  // ── Derived state ───────────────────────────────────────────────────────────
  const tripPhase = useMemo(
    () => resolveTripPhase(hasArrivedAtPickup, rideStarted, paymentSuccess),
    [hasArrivedAtPickup, paymentSuccess, rideStarted],
  );

  const phaseMeta = PHASE_META[tripPhase];

  const primaryAction = useMemo(() => {
    switch (tripPhase) {
      case "heading_to_pickup":
        return { label: "I've Arrived at Pickup", icon: "location", color: COLORS.navyLight, onPress: handleArrivedAtPickup };
      case "at_pickup":
        return { label: "Start Ride", icon: "play-circle", color: COLORS.amber, onPress: handleStartRide };
      case "trip_in_progress":
        return { label: "Collect Payment", icon: "cash", color: COLORS.green, onPress: handleCompleteTrip };
      case "payment_received":
        return { label: "Complete Trip", icon: "checkmark-circle", color: COLORS.green, onPress: () => completeTrip() };
      default:
        return { label: "Update Status", icon: "refresh", color: COLORS.gray500, onPress: () => {} };
    }
  }, [completeTrip, handleArrivedAtPickup, handleCompleteTrip, handleStartRide, tripPhase]);

  // ── Pull-to-refresh ─────────────────────────────────────────────────────────
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (driverIdRef.current) {
      await Promise.all([fetchActiveBooking(driverIdRef.current), fetchPendingRequests(driverIdRef.current)]);
    }
    setRefreshing(false);
  }, [fetchActiveBooking, fetchPendingRequests]);

  // ── Effects ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    notificationReceivedSub.current = addNotificationReceivedListener((notification) => {
      const data = notification?.request?.content?.data;
      if (!data?.requestId || activeBookingRef.current) return;
      if (AppState.currentState !== "active" && shouldPlayBookingFeedback(data.requestId)) playBookingSound();
    });
    notificationResponseSub.current = addNotificationResponseListener((response) => {
      const data = response?.notification?.request?.content?.data;
      if (data?.type === "booking_request" && driverIdRef.current) fetchPendingRequests(driverIdRef.current);
    });
    return () => { notificationReceivedSub.current?.remove?.(); notificationResponseSub.current?.remove?.(); };
  }, [fetchPendingRequests, shouldPlayBookingFeedback]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      locationSubscriptionRef.current?.remove?.();
      requestSubscriptionRef.current?.unsubscribe?.();
      bookingSubscriptionRef.current?.unsubscribe?.();
      notificationReceivedSub.current?.remove?.();
      notificationResponseSub.current?.remove?.();
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      if (fetchDebounceRef.current)   clearTimeout(fetchDebounceRef.current);
      Object.values(requestExpiryTimersRef.current).forEach(clearTimeout);
      requestExpiryTimersRef.current = {};
    };
  }, []);

  useFocusEffect(useCallback(() => {
    let alive = true;
    const init = async () => {
      try {
        const id = await AsyncStorage.getItem("user_id");
        if (!alive || !id) { setLoading(false); return; }
        setDriverId(id);
        await Promise.all([fetchActiveBooking(id), startLocationTracking()]);

        if (!activeBookingRef.current) {
          await fetchPendingRequests(id);
        } else {
          setPendingRequests([]);
          setSelectedRequest(null);
        }

        setupRealtimeSubscriptions(id);
      } catch (error) {
        console.log("focus init error:", error?.message || error);
      } finally {
        if (alive) setLoading(false);
      }
    };
    init();
    return () => { alive = false; };
  }, [fetchActiveBooking, fetchPendingRequests, setupRealtimeSubscriptions, startLocationTracking]));

  useEffect(() => {
    if (selectedRequest && !activeBooking) calculateRequestRoute(selectedRequest);
  }, [activeBooking, calculateRequestRoute, selectedRequest]);

  useEffect(() => {
  const currentBooking = activeBooking;
  if (!currentBooking || !driverLocation || navigationInitialized) return;

  setNavigationInitialized(true);

  const run = async () => {
    if (currentBooking.ride_started_at) {
      await calculateRouteToDropoff(driverLocation, {
        latitude: Number(currentBooking.dropoff_latitude),
        longitude: Number(currentBooking.dropoff_longitude),
      });

      fitMap([
        driverLocation,
        {
          latitude: Number(currentBooking.dropoff_latitude),
          longitude: Number(currentBooking.dropoff_longitude),
        },
      ]);
    } else {
      await calculateRouteToPickup(driverLocation, {
        latitude: Number(currentBooking.pickup_latitude),
        longitude: Number(currentBooking.pickup_longitude),
      });

      fitMap([
        driverLocation,
        {
          latitude: Number(currentBooking.pickup_latitude),
          longitude: Number(currentBooking.pickup_longitude),
        },
      ]);
    }
  };

  run();
}, [
  activeBooking,
  calculateRouteToDropoff,
  calculateRouteToPickup,
  driverLocation,
  fitMap,
  navigationInitialized,
]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === "active") {
        if (waitingForPayment && activeBookingRef.current && !paymentSuccessRef.current) checkPaymentStatus();
        if (driverIdRef.current) {
          fetchActiveBooking(driverIdRef.current);
          if (!activeBookingRef.current) {
            fetchPendingRequests(driverIdRef.current);
          }
          setupRealtimeSubscriptions(driverIdRef.current);
        }
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [checkPaymentStatus, fetchActiveBooking, fetchPendingRequests, setupRealtimeSubscriptions, waitingForPayment]);

  useEffect(() => {
    if (!showPaymentSuccessBanner) return undefined;
    const timer = setTimeout(() => setShowPaymentSuccessBanner(false), 5000);
    return () => clearTimeout(timer);
  }, [showPaymentSuccessBanner]);

  // ── Shared overlays ─────────────────────────────────────────────────────────
  const renderSharedOverlays = () => (
    <>
      <View style={[styles.toastStack, { top: insets.top + 66 }]}>
        {notifications.map((item) => (
          <ToastItem key={item.id} item={item} onRemove={removeNotification} />
        ))}
      </View>
      <NotificationCenterModal
        visible={showNotificationCenter}
        notifications={notifications}
        unreadCount={unreadCount}
        onClose={() => setShowNotificationCenter(false)}
        onMarkAllRead={markAllAsRead}
        getNotificationColor={getNotificationColor}
        getNotificationIcon={getNotificationIcon}
      />
      <ModernAlert
        visible={alertVisible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
        onClose={() => setAlertVisible(false)}
        onConfirm={alertConfig.onConfirm}
      />
    </>
  );

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <LinearGradient colors={[COLORS.navy, COLORS.navyMid, "#2A5F8F"]} style={styles.loadingRoot}>
        <StatusBar barStyle="light-content" />
        <View style={styles.loadingBox}>
          <View style={styles.loadingIconWrap}>
            <Ionicons name="car" size={ICON(36)} color={COLORS.white} />
          </View>
          <Text style={styles.loadingTitle}>Preparing your dashboard</Text>
          <Text style={styles.loadingSub}>Loading rides and live status…</Text>
        </View>
      </LinearGradient>
    );
  }

  // ── View 1: Active trip ──────────────────────────────────────────────────────
  if (activeBooking) {
    const headingToPickup = tripPhase === "heading_to_pickup";
    const targetLat   = headingToPickup ? Number(activeBooking.pickup_latitude)  : Number(activeBooking.dropoff_latitude);
    const targetLng   = headingToPickup ? Number(activeBooking.pickup_longitude) : Number(activeBooking.dropoff_longitude);
    const targetLabel = headingToPickup ? "Pickup" : "Destination";

    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />
        <Header
          insets={insets}
          navigation={navigation}
          title={phaseMeta.title}
          subtitle={phaseMeta.subtitle}
          statusColor={phaseMeta.color}
          unreadCount={unreadCount}
          onOpenNotifications={() => setShowNotificationCenter(true)}
        />

        <View style={{ flex: 1 }}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFillObject}
            provider={PROVIDER_GOOGLE}
            showsUserLocation
            showsMyLocationButton={false}
            showsCompass
            initialRegion={
              activeBooking.pickup_latitude && activeBooking.pickup_longitude
                ? { latitude: Number(activeBooking.pickup_latitude), longitude: Number(activeBooking.pickup_longitude), latitudeDelta: 0.05, longitudeDelta: 0.05 }
                : DEFAULT_REGION
            }
            onMapReady={fitMapToActiveMarkers}
          >
            {!!activeBooking.pickup_latitude && !!activeBooking.pickup_longitude && (
              <Marker coordinate={{ latitude: Number(activeBooking.pickup_latitude), longitude: Number(activeBooking.pickup_longitude) }} title="Pickup">
                <LocationPin type="pickup" />
              </Marker>
            )}
            {!!activeBooking.dropoff_latitude && !!activeBooking.dropoff_longitude && (
              <Marker coordinate={{ latitude: Number(activeBooking.dropoff_latitude), longitude: Number(activeBooking.dropoff_longitude) }} title="Drop-off">
                <LocationPin type="dropoff" />
              </Marker>
            )}
            {routeCoordinates.length > 0 && (
              <Polyline
                coordinates={routeCoordinates}
                strokeColor={phaseMeta.polylineColor}
                strokeWidth={5}
                lineDashPattern={phaseMeta.dashed ? [10, 5] : undefined}
              />
            )}
          </MapView>

          <View style={styles.mapTopChip}>
            <View style={[styles.mapTopChipDot, { backgroundColor: phaseMeta.chipColor }]} />
            <Text style={styles.mapTopChipText}>
              {phaseMeta.chipLabel} • {estimatedDistance || "—"} km • {estimatedTime || "—"} min
            </Text>
          </View>

          <View style={styles.mapFabColumn}>
            <Pressable style={styles.mapFab} onPress={fitMapToActiveMarkers}>
              <Ionicons name="locate" size={ICON(20)} color={COLORS.navyLight} />
            </Pressable>
            <Pressable style={styles.mapFab} onPress={() => openMaps(targetLat, targetLng, targetLabel)}>
              <Ionicons name="navigate" size={ICON(20)} color={COLORS.navyLight} />
            </Pressable>
          </View>
        </View>

        {/* Bottom sheet */}
        <Animated.View style={[styles.sheet, { height: sheetAnim }]}>
          <Pressable style={styles.sheetHandleArea} onPress={toggleSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetToggleRow}>
              <Text style={styles.sheetToggleText}>{sheetMinimized ? "Show details" : "Hide details"}</Text>
              <Ionicons name={sheetMinimized ? "chevron-up" : "chevron-down"} size={ICON(16)} color={COLORS.gray500} />
            </View>
          </Pressable>

          {sheetMinimized ? (
            <View style={styles.miniBar}>
              <View style={styles.miniBarLeft}>
                <View style={styles.miniAvatar}>
                  {commuter?.profile_picture
                    ? <Image source={{ uri: commuter.profile_picture }} style={styles.miniAvatarImg} />
                    : <Ionicons name="person" size={ICON(18)} color={COLORS.gray400} />}
                </View>
                <View style={{ marginLeft: SPACING.sm, flex: 1 }}>
                  <Text style={styles.miniName} numberOfLines={1}>
                    {commuter?.first_name || "Passenger"} {commuter?.last_name || ""}
                  </Text>
                  <Text style={styles.miniFare}>₱{Number(activeBooking.fare || 0).toFixed(2)}</Text>
                </View>
              </View>
              <Pressable style={styles.miniCallBtn} onPress={callCommuter}>
                <Ionicons name="call" size={ICON(16)} color={COLORS.navyLight} />
              </Pressable>
              <Pressable style={[styles.miniPrimaryBtn, { backgroundColor: primaryAction.color }]} onPress={primaryAction.onPress}>
                <Ionicons name={primaryAction.icon} size={ICON(16)} color={COLORS.white} />
                <Text style={styles.miniPrimaryText}>{primaryAction.label}</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: SPACING.xl, paddingBottom: insets.bottom + SPACING.xxl }}
            >
              <StepBar phase={tripPhase} />

              {showPaymentSuccessBanner && (
                <View style={styles.paymentBanner}>
                  <LinearGradient colors={[COLORS.green, COLORS.greenDark]} style={styles.paymentBannerIcon}>
                    <Ionicons name="checkmark" size={ICON(16)} color={COLORS.white} />
                  </LinearGradient>
                  <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                    <Text style={styles.paymentBannerTitle}>Payment received</Text>
                    <Text style={styles.paymentBannerSub}>
                      ₱{Number(activeBooking.fare || 0).toFixed(2)} via {paymentMethod === "cash" ? "Cash" : paymentMethod || "Wallet"}
                    </Text>
                  </View>
                  <Pressable onPress={() => setShowPaymentSuccessBanner(false)}>
                    <Ionicons name="close" size={ICON(18)} color={COLORS.gray500} />
                  </Pressable>
                </View>
              )}

              <View style={styles.passengerCard}>
                <View style={styles.avatarWrap}>
                  {commuter?.profile_picture
                    ? <Image source={{ uri: commuter.profile_picture }} style={styles.avatarImg} />
                    : (
                      <View style={styles.avatarFallback}>
                        <Ionicons name="person" size={ICON(24)} color={COLORS.gray400} />
                      </View>
                    )}
                </View>
                <View style={{ flex: 1, marginLeft: SPACING.md }}>
                  <Text style={styles.passengerName}>
                    {commuter?.first_name || "Passenger"} {commuter?.last_name || ""}
                  </Text>
                  <Text style={styles.passengerMeta}>
                    {activeBooking.passenger_count || 1} passenger{Number(activeBooking.passenger_count || 1) > 1 ? "s" : ""}
                  </Text>
                </View>
                <View style={styles.passengerActions}>
                  <Pressable style={[styles.circleBtn, { backgroundColor: COLORS.navyLight }]} onPress={callCommuter}>
                    <Ionicons name="call" size={ICON(16)} color={COLORS.white} />
                  </Pressable>
                  <Pressable style={[styles.circleBtn, { backgroundColor: `${COLORS.amber}22` }]} onPress={messageCommuter}>
                    <Ionicons name="chatbubble" size={ICON(16)} color={COLORS.amberDark} />
                  </Pressable>
                </View>
              </View>

              <View style={styles.routeCard}>
                <View style={styles.routeRow}>
                  <View style={[styles.routeDot, { backgroundColor: COLORS.green }]} />
                  <Text style={styles.routeText} numberOfLines={2}>
                    {activeBooking.pickup_location}
                    {activeBooking.pickup_details ? ` • ${activeBooking.pickup_details}` : ""}
                  </Text>
                </View>
                <View style={styles.reqRouteDivider} />
                <View style={styles.routeRow}>
                  <View style={[styles.routeDot, { backgroundColor: COLORS.red }]} />
                  <Text style={styles.routeText} numberOfLines={2}>
                    {activeBooking.dropoff_location}
                    {activeBooking.dropoff_details ? ` • ${activeBooking.dropoff_details}` : ""}
                  </Text>
                </View>
              </View>

              <SummaryBar
                timeText={`${estimatedTime || activeBooking.duration_minutes || "—"} min`}
                distanceText={`${estimatedDistance || activeBooking.distance_km || "—"} km`}
                fareText={`₱${Number(activeBooking.fare || 0).toFixed(2)}`}
              />

              <View style={styles.actionsCol}>
                <ActionButton
                  label={primaryAction.label}
                  icon={primaryAction.icon}
                  color={primaryAction.color}
                  onPress={primaryAction.onPress}
                  large
                />
                <ActionButton
                  label={headingToPickup ? "Open Maps to Pickup" : "Open Maps to Destination"}
                  icon="navigate-outline"
                  color={COLORS.navyLight}
                  onPress={() => openMaps(targetLat, targetLng, targetLabel)}
                />
              </View>
            </ScrollView>
          )}
        </Animated.View>

        {renderSharedOverlays()}
      </View>
    );
  }

  // ── View 2: Pending requests ─────────────────────────────────────────────────
  if (pendingRequests.length > 0) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />
        <Header
          insets={insets}
          navigation={navigation}
          title="Booking Requests"
          subtitle={`${pendingRequests.length} new request${pendingRequests.length > 1 ? "s" : ""}`}
          statusColor={COLORS.amber}
          unreadCount={unreadCount}
          onOpenNotifications={() => setShowNotificationCenter(true)}
        />

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + SPACING.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.navyLight} />}
        >
          <View style={styles.requestsMapWrap}>
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFillObject}
              provider={PROVIDER_GOOGLE}
              showsUserLocation
              showsMyLocationButton={false}
              initialRegion={
                selectedRequest?.pickup_latitude && selectedRequest?.pickup_longitude
                  ? { latitude: Number(selectedRequest.pickup_latitude), longitude: Number(selectedRequest.pickup_longitude), latitudeDelta: 0.05, longitudeDelta: 0.05 }
                  : DEFAULT_REGION
              }
              onMapReady={fitMapToRequestMarkers}
            >
              {!!selectedRequest?.pickup_latitude && !!selectedRequest?.pickup_longitude && (
                <Marker coordinate={{ latitude: Number(selectedRequest.pickup_latitude), longitude: Number(selectedRequest.pickup_longitude) }}>
                  <LocationPin type="pickup" />
                </Marker>
              )}
              {!!selectedRequest?.dropoff_latitude && !!selectedRequest?.dropoff_longitude && (
                <Marker coordinate={{ latitude: Number(selectedRequest.dropoff_latitude), longitude: Number(selectedRequest.dropoff_longitude) }}>
                  <LocationPin type="dropoff" />
                </Marker>
              )}
              {requestRouteCoordinates.length > 0 && (
                <Polyline coordinates={requestRouteCoordinates} strokeColor={COLORS.navyLight} strokeWidth={4} />
              )}
            </MapView>
            <Pressable style={styles.locateFab} onPress={fitMapToRequestMarkers}>
              <Ionicons name="locate" size={ICON(20)} color={COLORS.navyLight} />
            </Pressable>
          </View>

          {selectedRequest && (
            <View style={styles.requestSummaryWrap}>
              <SummaryBar
                timeText={`${requestDuration || "—"} min`}
                distanceText={`${requestDistance || "—"} km`}
                fareText={`₱${Number(selectedRequest.fare || 0).toFixed(2)}`}
              />
            </View>
          )}

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Pending Requests</Text>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>{pendingRequests.length}</Text>
            </View>
          </View>

          <View style={{ paddingHorizontal: SPACING.xl }}>
            {pendingRequests.map((req) => (
              <RequestCard
                key={req.request_id}
                req={req}
                isSelected={selectedRequest?.request_id === req.request_id}
                totalSeconds={REQUEST_EXPIRY_SECONDS}
                onSelect={() => setSelectedRequest(req)}
                onAccept={() => handleAcceptRequest(req.id, req.request_id)}
                onDecline={() => handleDeclineRequest(req.id, req.request_id)}
                formatRequestTime={formatRequestTime}
              />
            ))}
          </View>
        </ScrollView>

        {renderSharedOverlays()}
      </View>
    );
  }

  // ── View 3: Empty / waiting ──────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <Header
        insets={insets}
        navigation={navigation}
        title="Waiting for Requests"
        subtitle="Online & Ready"
        statusColor={COLORS.green}
        unreadCount={unreadCount}
        onOpenNotifications={() => setShowNotificationCenter(true)}
      />

      <ScrollView
        contentContainerStyle={[styles.emptyScroll, { paddingBottom: insets.bottom + SPACING.xxl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.navyLight} />}
      >
        <LinearGradient colors={[COLORS.navyLight, COLORS.navy]} style={styles.emptyHero}>
          <View style={styles.emptyHeroIcon}>
            <Ionicons name="location" size={ICON(38)} color={COLORS.white} />
          </View>
          <Text style={styles.emptyHeroTitle}>You're online</Text>
          <Text style={styles.emptyHeroSub}>
            New booking requests will appear here. Stay connected for the fastest alerts.
          </Text>
        </LinearGradient>

        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>Quick reminders</Text>
          {[
            { icon: "wifi",          text: "Keep your internet stable for faster request alerts." },
            { icon: "location",      text: "Stay visible by keeping location enabled." },
            { icon: "notifications", text: "Allow notifications so you don't miss a ride." },
          ].map((tip, index) => (
            <View key={index} style={styles.tipRow}>
              <View style={styles.tipIconWrap}>
                <Ionicons name={tip.icon} size={ICON(15)} color={COLORS.navyLight} />
              </View>
              <Text style={styles.tipText}>{tip.text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.emptyActions}>
          <Pressable
            style={styles.onlineBtn}
            onPress={async () => {
              if (driverLocation) {
                await updateDriverLocation(driverLocation);
                addNotification({ type: "success", title: "Online status confirmed", message: "You are ready to receive ride requests." });
              }
            }}
          >
            <View style={styles.onlinePulseDot} />
            <Text style={styles.onlineBtnText}>Confirm Online Status</Text>
          </Pressable>

          <Pressable style={styles.refreshBtn} onPress={onRefresh}>
            <Ionicons name="refresh-outline" size={ICON(16)} color={COLORS.navyLight} />
            <Text style={styles.refreshBtnText}>Refresh</Text>
          </Pressable>
        </View>
      </ScrollView>

      {renderSharedOverlays()}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: COLORS.pageBg },
  loadingRoot: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingBox:  { alignItems: "center", paddingHorizontal: SPACING.xl },
  loadingIconWrap: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: "rgba(255,255,255,0.14)",
    justifyContent: "center", alignItems: "center", marginBottom: SPACING.lg,
  },
  loadingTitle: { color: COLORS.white, fontSize: FONT.xl, fontWeight: "800" },
  loadingSub:   { marginTop: SPACING.xs, color: "rgba(255,255,255,0.72)", fontSize: FONT.sm, textAlign: "center" },

  header:       { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.md, paddingBottom: SPACING.md },
  headerIconBtn: { width: TOUCH, height: TOUCH, justifyContent: "center", alignItems: "center" },
  headerCenter:  { flex: 1, alignItems: "center" },
  headerSubRow:  { flexDirection: "row", alignItems: "center" },
  headerStatusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  headerSub:    { color: "#FFD28D", fontSize: FONT.xs, fontWeight: "700", letterSpacing: 0.7, textTransform: "uppercase" },
  headerTitle:  { marginTop: 2, color: COLORS.white, fontSize: FONT.lg, fontWeight: "800", textAlign: "center" },
  badge:        {
    position: "absolute", top: 5, right: 5, minWidth: 18, height: 18,
    borderRadius: 9, backgroundColor: COLORS.red, justifyContent: "center",
    alignItems: "center", paddingHorizontal: 3, borderWidth: 1.5, borderColor: COLORS.navyMid,
  },
  badgeText:    { color: COLORS.white, fontSize: 9, fontWeight: "800" },

  toastStack:   { position: "absolute", left: SPACING.xl, right: SPACING.xl, zIndex: 999 },
  toastCard:    {
    borderRadius: BR.md, overflow: "hidden", marginBottom: SPACING.sm,
    shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 7,
  },
  toastGradient:   { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.md, paddingVertical: SPACING.md },
  toastTitle:      { color: COLORS.white, fontSize: FONT.sm, fontWeight: "700" },
  toastMessage:    { marginTop: 1, color: "rgba(255,255,255,0.88)", fontSize: FONT.xs },
  toastActionBtn:  { marginLeft: SPACING.sm, backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, borderRadius: BR.full },
  toastActionText: { color: COLORS.white, fontSize: FONT.xs, fontWeight: "700" },
  toastCloseBtn:   { marginLeft: SPACING.xs, padding: SPACING.xs },

  alertOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: "center", alignItems: "center" },
  alertWrap:    { width: "100%", paddingHorizontal: SPACING.xxl },
  alertCard:    {
    backgroundColor: COLORS.white, borderRadius: BR.xxl, padding: SPACING.xxl,
    shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 16,
  },
  alertIconBox:      { width: 68, height: 68, borderRadius: 34, justifyContent: "center", alignItems: "center", alignSelf: "center", marginBottom: SPACING.lg },
  alertTitle:        { textAlign: "center", fontSize: FONT.xl, fontWeight: "800", color: COLORS.gray800, marginBottom: SPACING.sm },
  alertMessage:      { textAlign: "center", fontSize: FONT.md, color: COLORS.gray500, lineHeight: 22, marginBottom: SPACING.lg },
  alertBtns:         { flexDirection: "row", justifyContent: "center", gap: SPACING.sm },
  alertPrimaryBtn:   { minWidth: 110, paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg, borderRadius: BR.full, alignItems: "center" },
  alertPrimaryText:  { color: COLORS.white, fontSize: FONT.md, fontWeight: "800" },
  alertSecondaryBtn: { minWidth: 95, paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg, borderRadius: BR.full, backgroundColor: COLORS.gray100, alignItems: "center" },
  alertSecondaryText:{ color: COLORS.gray700, fontSize: FONT.md, fontWeight: "700" },

  ncOverlay:    { flex: 1, justifyContent: "flex-end" },
  ncSheet:      { backgroundColor: COLORS.white, borderTopLeftRadius: BR.xl, borderTopRightRadius: BR.xl, maxHeight: height * 0.78 },
  ncHandle:     { alignSelf: "center", width: 42, height: 4, borderRadius: 2, backgroundColor: COLORS.gray200, marginTop: SPACING.sm },
  ncHeader:     { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", padding: SPACING.xl, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  ncHeaderRight:{ flexDirection: "row", alignItems: "center", gap: SPACING.md },
  ncTitle:      { fontSize: FONT.xl, fontWeight: "800", color: COLORS.gray800 },
  ncSubtitle:   { fontSize: FONT.sm, color: COLORS.gray500, marginTop: 2 },
  ncMarkRead:   { fontSize: FONT.sm, color: COLORS.navyLight, fontWeight: "700" },
  ncCloseBtn:   { width: TOUCH, height: TOUCH, justifyContent: "center", alignItems: "center" },
  ncEmpty:      { alignItems: "center", paddingVertical: SPACING.xxl },
  ncEmptyTitle: { marginTop: SPACING.md, fontSize: FONT.lg, fontWeight: "800", color: COLORS.gray700 },
  ncEmptySub:   { marginTop: SPACING.xs, fontSize: FONT.sm, color: COLORS.gray500 },
  ncItem:       { flexDirection: "row", alignItems: "flex-start", backgroundColor: COLORS.gray50, borderRadius: BR.md, padding: SPACING.md, marginBottom: SPACING.sm },
  ncItemUnread: { backgroundColor: "#EFF6FF" },
  ncItemIconWrap:{ width: 38, height: 38, borderRadius: 19, justifyContent: "center", alignItems: "center", marginRight: SPACING.md },
  ncItemTitle:  { fontSize: FONT.sm, color: COLORS.gray800, fontWeight: "800" },
  ncItemMessage:{ marginTop: 2, fontSize: FONT.xs, color: COLORS.gray500 },
  ncItemTime:   { marginTop: 4, fontSize: FONT.xs - 1, color: COLORS.gray400 },
  ncUnreadDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.navyLight, marginTop: 5, marginLeft: SPACING.sm },

  pinImage:    { width: 40, height: 40 },
  markerImage: { width: 42, height: 42, borderRadius: 15, borderWidth: 2, borderColor: COLORS.white },

  mapTopChip:     {
    position: "absolute", top: SPACING.md, left: SPACING.xl, right: SPACING.xl,
    backgroundColor: "rgba(15,39,68,0.9)", paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm, borderRadius: BR.full, flexDirection: "row",
    alignItems: "center", justifyContent: "center",
  },
  mapTopChipDot:  { width: 8, height: 8, borderRadius: 4, marginRight: SPACING.xs },
  mapTopChipText: { color: COLORS.white, fontSize: FONT.sm, fontWeight: "700" },
  mapFabColumn:   { position: "absolute", right: SPACING.md, bottom: Math.round(height * 0.2), gap: SPACING.sm },
  mapFab:         {
    width: TOUCH + 4, height: TOUCH + 4, borderRadius: (TOUCH + 4) / 2,
    backgroundColor: COLORS.white, justifyContent: "center", alignItems: "center",
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  locateFab: {
    position: "absolute", right: SPACING.md, bottom: SPACING.md,
    width: TOUCH + 4, height: TOUCH + 4, borderRadius: (TOUCH + 4) / 2,
    backgroundColor: COLORS.white, justifyContent: "center", alignItems: "center",
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },

  sheet:          { backgroundColor: COLORS.white, borderTopLeftRadius: BR.xl, borderTopRightRadius: BR.xl, marginTop: -BR.xl, overflow: "hidden" },
  sheetHandleArea:{ paddingTop: SPACING.sm, paddingBottom: SPACING.md, alignItems: "center" },
  sheetHandle:    { width: 42, height: 4, borderRadius: 2, backgroundColor: COLORS.gray200, marginBottom: SPACING.sm },
  sheetToggleRow: { flexDirection: "row", alignItems: "center", gap: SPACING.xs },
  sheetToggleText:{ color: COLORS.gray500, fontSize: FONT.xs, fontWeight: "700" },

  miniBar:        { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg, gap: SPACING.sm },
  miniBarLeft:    { flex: 1, flexDirection: "row", alignItems: "center" },
  miniAvatar:     { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.gray100, justifyContent: "center", alignItems: "center", overflow: "hidden" },
  miniAvatarImg:  { width: 38, height: 38, borderRadius: 19 },
  miniName:       { fontSize: FONT.sm, fontWeight: "800", color: COLORS.gray800 },
  miniFare:       { marginTop: 2, fontSize: FONT.xs, fontWeight: "700", color: COLORS.greenDark },
  miniCallBtn:    { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.gray100, justifyContent: "center", alignItems: "center" },
  miniPrimaryBtn: { flexDirection: "row", alignItems: "center", gap: SPACING.xs, paddingVertical: SPACING.sm + 2, paddingHorizontal: SPACING.md, borderRadius: BR.full },
  miniPrimaryText:{ color: COLORS.white, fontSize: FONT.sm, fontWeight: "800" },

  stepBar:    {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    backgroundColor: COLORS.gray50, borderRadius: BR.lg,
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.sm, marginBottom: SPACING.lg,
  },
  stepItem:          { flex: 1, alignItems: "center", position: "relative" },
  stepCircle:        { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: COLORS.gray300, backgroundColor: COLORS.white, justifyContent: "center", alignItems: "center" },
  stepLabel:         { marginTop: SPACING.xs, fontSize: FONT.xs - 1, color: COLORS.gray400, textAlign: "center" },
  stepLabelDone:     { color: COLORS.greenDark, fontWeight: "800" },
  stepConnector:     { position: "absolute", top: 16, left: "60%", right: "-60%", height: 2, backgroundColor: COLORS.gray200, zIndex: -1 },
  stepConnectorDone: { backgroundColor: COLORS.green },

  paymentBanner:     { flexDirection: "row", alignItems: "center", backgroundColor: `${COLORS.green}12`, borderWidth: 1, borderColor: `${COLORS.green}35`, borderRadius: BR.md, padding: SPACING.md, marginBottom: SPACING.md },
  paymentBannerIcon: { width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  paymentBannerTitle:{ fontSize: FONT.sm, fontWeight: "800", color: COLORS.gray800 },
  paymentBannerSub:  { marginTop: 1, fontSize: FONT.xs, color: COLORS.gray500 },

  passengerCard:   { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.gray50, borderRadius: BR.lg, padding: SPACING.lg, marginBottom: SPACING.md },
  avatarWrap:      { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, overflow: "hidden" },
  avatarImg:       { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
  avatarFallback:  { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: COLORS.gray200, justifyContent: "center", alignItems: "center" },
  passengerName:   { fontSize: FONT.lg, fontWeight: "800", color: COLORS.gray800 },
  passengerMeta:   { marginTop: 3, fontSize: FONT.xs, color: COLORS.gray500, fontWeight: "600" },
  passengerActions:{ alignItems: "center", gap: SPACING.xs },
  circleBtn:       { width: 38, height: 38, borderRadius: 19, justifyContent: "center", alignItems: "center" },

  routeCard:     { backgroundColor: COLORS.gray50, borderRadius: BR.lg, padding: SPACING.md, marginBottom: SPACING.md },
  routeRow:      { flexDirection: "row", alignItems: "center" },
  routeDot:      { width: 10, height: 10, borderRadius: 5, marginRight: SPACING.sm, flexShrink: 0 },
  routeText:     { flex: 1, fontSize: FONT.sm, color: COLORS.gray700, lineHeight: 20 },
  reqRouteDivider:{ height: 12, marginLeft: 4, borderLeftWidth: 1.5, borderLeftColor: COLORS.gray300, marginVertical: 4 },

  summaryBar:     {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: COLORS.gray50, borderRadius: BR.lg, paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg,
  },
  summaryItem:    { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center" },
  summaryDivider: { width: 1, height: 18, backgroundColor: COLORS.gray200 },
  summaryText:    { marginLeft: 6, fontSize: FONT.sm, color: COLORS.gray700, fontWeight: "700" },

  actionsCol:         { gap: SPACING.sm },
  actionBtn:          { minHeight: TOUCH, borderRadius: BR.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm, paddingVertical: SPACING.md },
  actionBtnLarge:     { minHeight: TOUCH + 8, borderRadius: BR.lg, paddingVertical: SPACING.lg },
  actionBtnText:      { fontSize: FONT.md, fontWeight: "800" },
  actionBtnTextLarge: { fontSize: FONT.lg },

  requestsMapWrap:   { height: Math.round(height * 0.27), marginTop: SPACING.xl, marginHorizontal: SPACING.xl, borderRadius: BR.xl, overflow: "hidden", backgroundColor: COLORS.gray200 },
  requestSummaryWrap:{ marginHorizontal: SPACING.xl, marginTop: SPACING.md },
  sectionHead:       { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginTop: SPACING.md, marginBottom: SPACING.md, marginHorizontal: SPACING.xl },
  sectionTitle:      { fontSize: FONT.xs, color: COLORS.gray500, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
  sectionBadge:      { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: BR.full, backgroundColor: COLORS.amber },
  sectionBadgeText:  { color: COLORS.white, fontSize: FONT.xs, fontWeight: "800" },

  reqCard:         {
    backgroundColor: COLORS.white, borderRadius: BR.xl, padding: SPACING.lg, marginBottom: SPACING.md,
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  reqCardSelected: { borderWidth: 1.5, borderColor: COLORS.navyLight },
  reqTop:          { flexDirection: "row", alignItems: "center", marginBottom: SPACING.md },
  reqAvatarWrap:   {},
  reqAvatar:       { width: 46, height: 46, borderRadius: 23 },
  reqAvatarFallback:{ width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.gray100, justifyContent: "center", alignItems: "center" },
  reqName:         { fontSize: FONT.md, fontWeight: "800", color: COLORS.gray800 },
  reqSub:          { marginTop: 2, fontSize: FONT.xs, color: COLORS.gray500 },
  reqFareWrap:     { alignItems: "flex-end" },
  reqFareLabel:    { fontSize: FONT.xs, color: COLORS.gray400, fontWeight: "700" },
  reqFareValue:    { marginTop: 2, fontSize: FONT.lg, color: COLORS.greenDark, fontWeight: "800" },
  reqRouteCard:    { backgroundColor: COLORS.gray50, borderRadius: BR.lg, padding: SPACING.md, marginBottom: SPACING.md },
  reqBottom:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.sm },
  reqTimePill:     { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: COLORS.gray100, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, borderRadius: BR.full },
  reqTimePillUrgent:{ backgroundColor: COLORS.red },
  reqTimeText:     { fontSize: FONT.sm, color: COLORS.gray600, fontWeight: "700" },
  reqActions:      { flexDirection: "row", gap: SPACING.sm },
  reqDeclineBtn:   { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm + 2, borderRadius: BR.full, backgroundColor: COLORS.gray100 },
  reqDeclineText:  { color: COLORS.gray700, fontWeight: "800", fontSize: FONT.sm },
  reqAcceptBtn:    { paddingHorizontal: SPACING.xl, paddingVertical: SPACING.sm + 2, borderRadius: BR.full, backgroundColor: COLORS.green },
  reqAcceptText:   { color: COLORS.white, fontWeight: "800", fontSize: FONT.sm },

  emptyScroll:     { padding: SPACING.xl },
  emptyHero:       { borderRadius: BR.xl, padding: SPACING.xxl, alignItems: "center" },
  emptyHeroIcon:   { width: 74, height: 74, borderRadius: 37, backgroundColor: "rgba(255,255,255,0.14)", justifyContent: "center", alignItems: "center", marginBottom: SPACING.lg },
  emptyHeroTitle:  { color: COLORS.white, fontSize: FONT.xl, fontWeight: "800" },
  emptyHeroSub:    { marginTop: SPACING.sm, color: "rgba(255,255,255,0.82)", fontSize: FONT.sm, textAlign: "center", lineHeight: 20 },
  tipsCard:        { marginTop: SPACING.lg, backgroundColor: COLORS.white, borderRadius: BR.xl, padding: SPACING.xl },
  tipsTitle:       { fontSize: FONT.lg, fontWeight: "800", color: COLORS.gray800, marginBottom: SPACING.md },
  tipRow:          { flexDirection: "row", alignItems: "center", marginBottom: SPACING.md },
  tipIconWrap:     { width: 30, height: 30, borderRadius: 15, backgroundColor: `${COLORS.navyLight}12`, justifyContent: "center", alignItems: "center", marginRight: SPACING.md },
  tipText:         { flex: 1, fontSize: FONT.sm, color: COLORS.gray600, lineHeight: 19 },
  emptyActions:    { marginTop: SPACING.lg, gap: SPACING.sm },
  onlineBtn:       { minHeight: TOUCH + 6, borderRadius: BR.full, backgroundColor: COLORS.green, justifyContent: "center", alignItems: "center", flexDirection: "row", gap: SPACING.sm },
  onlinePulseDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.white },
  onlineBtnText:   { color: COLORS.white, fontSize: FONT.md, fontWeight: "800" },
  refreshBtn:      { minHeight: TOUCH, borderRadius: BR.full, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.gray200, justifyContent: "center", alignItems: "center", flexDirection: "row", gap: SPACING.xs },
  refreshBtnText:  { color: COLORS.navyLight, fontSize: FONT.md, fontWeight: "800" },
});