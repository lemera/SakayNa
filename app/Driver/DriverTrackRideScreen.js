import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Animated,
  Platform,
  Linking,
  Alert,
  ScrollView,
  useWindowDimensions,
  PanResponder,
  TextInput,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import {
  useFocusEffect,
  useRoute,
  useNavigation,
} from "@react-navigation/native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";

const COLORS = {
  navy: "#0F2744",
  navyLight: "#183B5C",
  navyMid: "#1E4976",
  orange: "#F97316",
  orangeDark: "#EA580C",
  green: "#10B981",
  greenDark: "#059669",
  red: "#EF4444",
  redDark: "#DC2626",
  white: "#FFFFFF",
  pageBg: "#EEF2F7",
  cardBg: "#FFFFFF",
  gray100: "#F1F5F9",
  gray200: "#E2E8F0",
  gray300: "#CBD5E1",
  gray400: "#94A3B8",
  gray500: "#64748B",
  gray700: "#334155",
  gray800: "#1E293B",
};

const DEFAULT_REGION = {
  latitude: 14.5995,
  longitude: 120.9842,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const DRIVER_CANCEL_REASONS = [
  "Passenger no-show",
  "Vehicle issue / mechanical problem",
  "Emergency / personal reason",
  "Other / Iba pa",
];

function log(label, data = null) {
  if (data !== null && data !== undefined) {
    console.log("[DriverTrackRideScreen]", label, data);
  } else {
    console.log("[DriverTrackRideScreen]", label);
  }
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function formatAmount(value) {
  return `₱${Number(value || 0).toFixed(2)}`;
}

function clamp(num, min, max) {
  return Math.min(Math.max(num, min), max);
}

function getMetrics(screenWidth) {
  const scale = clamp(screenWidth / 390, 0.88, 1.12);

  const FONT = {
    xs: Math.round(11 * scale),
    sm: Math.round(13 * scale),
    md: Math.round(15 * scale),
    lg: Math.round(17 * scale),
    xl: Math.round(20 * scale),
    xxl: Math.round(24 * scale),
  };

  const SPACING = {
    xs: Math.round(4 * scale),
    sm: Math.round(8 * scale),
    md: Math.round(12 * scale),
    lg: Math.round(16 * scale),
    xl: Math.round(20 * scale),
  };

  const BR = {
    md: Math.round(12 * scale),
    lg: Math.round(16 * scale),
    xl: Math.round(24 * scale),
    full: 999,
  };

  return { FONT, SPACING, BR, scale };
}

function getRidePhase(booking) {
  if (!booking) return "assigned";

  const status = normalize(booking.status);
  const serviceStatus = normalize(booking.service_status);

  if (status === "completed" || serviceStatus === "completed") {
    return "completed";
  }
  if (status === "cancelled" || serviceStatus === "cancelled") {
    return "cancelled";
  }
  if (serviceStatus === "in_transit") {
    return "in_transit";
  }
  if (serviceStatus === "picked_up" || booking.ride_started_at) {
    return "picked_up";
  }
  if (serviceStatus === "driver_assigned" || status === "accepted") {
    return "assigned";
  }

  return "assigned";
}

const PHASE_META = {
  assigned: {
    subtitle: "Ride Accepted",
    title: "Heading to pickup",
    color: COLORS.orange,
    polylineColor: COLORS.orange,
    chipLabel: "To pickup",
  },
  picked_up: {
    subtitle: "Passenger Picked Up",
    title: "Ready to drop off",
    color: COLORS.navyLight,
    polylineColor: COLORS.navyLight,
    chipLabel: "Dropoff",
  },
  in_transit: {
    subtitle: "On the Way",
    title: "Heading to destination",
    color: COLORS.navyLight,
    polylineColor: COLORS.navyLight,
    chipLabel: "In transit",
  },
  completed: {
    subtitle: "Completed",
    title: "Ride completed",
    color: COLORS.greenDark,
    polylineColor: COLORS.greenDark,
    chipLabel: "Done",
  },
  cancelled: {
    subtitle: "Cancelled",
    title: "Ride cancelled",
    color: COLORS.redDark,
    polylineColor: COLORS.redDark,
    chipLabel: "Cancelled",
  },
};

function Header({
  insets,
  navigation,
  subtitle,
  title,
  statusColor,
  styles,
}) {
  return (
    <LinearGradient
      colors={[COLORS.navy, COLORS.navyMid]}
      style={[
        styles.header,
        { paddingTop: insets.top + styles._metrics.SPACING.sm },
      ]}
    >
      <Pressable
        style={styles.headerIconBtn}
        onPress={() =>
          navigation.navigate("DriverHomePage", {
            screen: "TrackRides",
          })
        }
      >
        <Ionicons name="arrow-back" size={22} color={COLORS.white} />
      </Pressable>

      <View style={styles.headerCenter}>
        <View style={styles.headerSubRow}>
          <View
            style={[styles.headerStatusDot, { backgroundColor: statusColor }]}
          />
          <Text style={styles.headerSub}>{subtitle}</Text>
        </View>
        <Text numberOfLines={1} style={styles.headerTitle}>
          {title}
        </Text>
      </View>
    </LinearGradient>
  );
}

function DriverMapMarker({ styles }) {
  return (
    <View style={styles.driverMarker}>
      <Ionicons name="car-outline" size={18} color={COLORS.white} />
    </View>
  );
}

function LocationPin({ type = "pickup", styles }) {
  const bg = type === "pickup" ? COLORS.orange : COLORS.greenDark;
  const icon = type === "pickup" ? "location-outline" : "flag-outline";
  return (
    <View style={[styles.pinWrap, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={15} color={COLORS.white} />
    </View>
  );
}

function SummaryBar({
  timeText,
  distanceText,
  totalText,
  compact = false,
  styles,
  isSmallDevice,
}) {
  if (isSmallDevice) {
    return (
      <View
        style={[
          styles.summaryBar,
          compact && styles.summaryBarCompact,
          styles.summaryBarStack,
        ]}
      >
        <View style={styles.summaryStackRow}>
          <View style={styles.summaryItem}>
            <Ionicons name="time-outline" size={16} color={COLORS.navyLight} />
            <Text numberOfLines={1} style={styles.summaryText}>
              {timeText}
            </Text>
          </View>

          <View style={styles.summaryItem}>
            <Ionicons name="map-outline" size={16} color={COLORS.navyLight} />
            <Text numberOfLines={1} style={styles.summaryText}>
              {distanceText}
            </Text>
          </View>
        </View>

        <View style={[styles.summaryItem, styles.summaryItemTotal]}>
          <Ionicons name="cash-outline" size={16} color={COLORS.greenDark} />
          <Text
            numberOfLines={1}
            style={[styles.summaryText, styles.summaryTotalText]}
          >
            {totalText}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.summaryBar, compact && styles.summaryBarCompact]}>
      <View style={styles.summaryItem}>
        <Ionicons name="time-outline" size={16} color={COLORS.navyLight} />
        <Text numberOfLines={1} style={styles.summaryText}>
          {timeText}
        </Text>
      </View>

      <View style={styles.summaryDivider} />

      <View style={styles.summaryItem}>
        <Ionicons name="map-outline" size={16} color={COLORS.navyLight} />
        <Text numberOfLines={1} style={styles.summaryText}>
          {distanceText}
        </Text>
      </View>

      <View style={styles.summaryDivider} />

      <View style={styles.summaryItem}>
        <Ionicons name="cash-outline" size={16} color={COLORS.greenDark} />
        <Text
          numberOfLines={1}
          style={[styles.summaryText, styles.summaryTotalText]}
        >
          {totalText}
        </Text>
      </View>
    </View>
  );
}

function StepBar({ phase, styles }) {
  const steps = [
    { key: "assigned", label: "Pickup", icon: "location-outline" },
    { key: "picked_up", label: "Picked Up", icon: "person-outline" },
    { key: "in_transit", label: "Dropoff", icon: "navigate-outline" },
    { key: "completed", label: "Done", icon: "checkmark-circle-outline" },
  ];

  const order = ["assigned", "picked_up", "in_transit", "completed"];
  const currentIndex = Math.max(0, order.indexOf(phase));

  return (
    <View style={styles.stepBar}>
      {steps.map((step, index) => {
        const stepIndex = order.indexOf(step.key);
        const done = stepIndex <= currentIndex && phase !== "cancelled";
        const active = stepIndex === currentIndex && phase !== "cancelled";

        return (
          <View key={step.key} style={styles.stepItem}>
            <View
              style={[
                styles.stepCircle,
                done && styles.stepCircleDone,
                active && styles.stepCircleActive,
              ]}
            >
              <Ionicons
                name={step.icon}
                size={14}
                color={done ? COLORS.white : COLORS.gray400}
              />
            </View>

            <Text
              style={[styles.stepLabel, done && styles.stepLabelDone]}
              numberOfLines={2}
            >
              {step.label}
            </Text>

            {index < steps.length - 1 ? (
              <View
                style={[styles.stepConnector, done && styles.stepConnectorDone]}
              />
            ) : null}
          </View>
        );
      })}
    </View>
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
  styles,
}) {
  const slide = useRef(new Animated.Value(40)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slide, {
          toValue: 0,
          useNativeDriver: true,
          damping: 18,
          stiffness: 220,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      slide.setValue(40);
      opacity.setValue(0);
    }
  }, [visible, opacity, slide]);

  const cfg = {
    success: { icon: "checkmark-circle", color: COLORS.green, bg: "#ECFDF5" },
    error: { icon: "close-circle", color: COLORS.red, bg: "#FEF2F2" },
    warning: { icon: "alert-circle", color: COLORS.orange, bg: "#FFF7ED" },
    info: {
      icon: "information-circle",
      color: COLORS.navyLight,
      bg: "#EFF6FF",
    },
  }[type] || {
    icon: "information-circle",
    color: COLORS.navyLight,
    bg: "#EFF6FF",
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
    >
      <BlurView intensity={20} style={styles.alertOverlay}>
        <Animated.View style={[styles.alertWrap, { opacity }]}>
          <Animated.View
            style={[styles.alertCard, { transform: [{ translateY: slide }] }]}
          >
            <View style={[styles.alertIconBox, { backgroundColor: cfg.bg }]}>
              <Ionicons name={cfg.icon} size={38} color={cfg.color} />
            </View>

            <Text style={styles.alertTitle}>{title}</Text>
            <Text style={styles.alertMessage}>{message}</Text>

            <View style={styles.alertBtns}>
              {cancelText ? (
                <Pressable style={styles.alertSecondaryBtn} onPress={onClose}>
                  <Text style={styles.alertSecondaryText}>{cancelText}</Text>
                </Pressable>
              ) : null}

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

function ActionButton({
  label,
  icon,
  onPress,
  color,
  outline = false,
  disabled = false,
  styles,
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionBtn,
        outline
          ? {
              backgroundColor: "transparent",
              borderWidth: 1.5,
              borderColor: color,
            }
          : { backgroundColor: color },
        pressed && !disabled && { opacity: 0.88, transform: [{ scale: 0.99 }] },
        disabled && { opacity: 0.45 },
      ]}
    >
      <Ionicons name={icon} size={18} color={outline ? color : COLORS.white} />
      <Text
        style={[
          styles.actionBtnText,
          { color: outline ? color : COLORS.white },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function DriverTrackRideScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const navigation = useNavigation();
  const googleApiKey = Constants.expoConfig?.extra?.GOOGLE_API_KEY;
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const metrics = useMemo(() => getMetrics(screenWidth), [screenWidth]);
  const styles = useMemo(
    () => createStyles(metrics, screenWidth),
    [metrics, screenWidth]
  );

  const isSmallDevice = screenWidth < 360;
  const bookingId = route.params?.bookingId;

  const SHEET_MIN_HEIGHT = Math.max(screenHeight * 0.31, 145);
  const SHEET_PARTIAL_HEIGHT = clamp(screenHeight * 0.42, 300, 440);
  const SHEET_EXPANDED_HEIGHT = clamp(
    screenHeight * 0.84,
    500,
    screenHeight - 10
  );

  const mapRef = useRef(null);
 const mapRegionRef = useRef(DEFAULT_REGION);
const hasAutoFittedRef = useRef(false);
const skipNextAutoFitRef = useRef(false);
const userInteractingMapRef = useRef(false);
  const locationSubscriptionRef = useRef(null);
  const bookingSubscriptionRef = useRef(null);
  const bookingRef = useRef(null);
  const scrollOffsetRef = useRef(0);

  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [estimatedTime, setEstimatedTime] = useState(null);
  const [estimatedDistance, setEstimatedDistance] = useState(null);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    title: "",
    message: "",
    type: "info",
    confirmText: "OK",
    cancelText: null,
    onConfirm: null,
  });

  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [selectedCancelReason, setSelectedCancelReason] = useState("");
  const [customCancelReason, setCustomCancelReason] = useState("");
  const [submittingCancel, setSubmittingCancel] = useState(false);

  const [sheetMode, setSheetMode] = useState("partial");
  const [isDraggingSheet, setIsDraggingSheet] = useState(false);

  const sheetHeightAnim = useRef(new Animated.Value(SHEET_PARTIAL_HEIGHT)).current;
  const lastSheetHeightRef = useRef(SHEET_PARTIAL_HEIGHT);

  useEffect(() => {
    bookingRef.current = booking;
  }, [booking]);

  const getHeightByMode = useCallback(
    (mode) => {
      if (mode === "min") return SHEET_MIN_HEIGHT;
      if (mode === "expanded") return SHEET_EXPANDED_HEIGHT;
      return SHEET_PARTIAL_HEIGHT;
    },
    [SHEET_EXPANDED_HEIGHT, SHEET_MIN_HEIGHT, SHEET_PARTIAL_HEIGHT]
  );

  const snapToSheet = useCallback(
    (mode) => {
      const nextHeight = getHeightByMode(mode);
      setSheetMode(mode);
      lastSheetHeightRef.current = nextHeight;

      Animated.spring(sheetHeightAnim, {
        toValue: nextHeight,
        useNativeDriver: false,
        damping: 22,
        stiffness: 220,
        mass: 0.9,
      }).start();
    },
    [getHeightByMode, sheetHeightAnim]
  );

  useEffect(() => {
    const resizedHeight = getHeightByMode(sheetMode);
    lastSheetHeightRef.current = resizedHeight;
    sheetHeightAnim.setValue(resizedHeight);
  }, [getHeightByMode, screenHeight, sheetMode, sheetHeightAnim]);

  const showAlert = useCallback(
    (title, message, type = "info", options = {}) => {
      setAlertConfig({
        title,
        message,
        type,
        confirmText: options.confirmText || "OK",
        cancelText: options.cancelText || null,
        onConfirm: options.onConfirm || (() => setAlertVisible(false)),
      });
      setAlertVisible(true);
    },
    []
  );

  const openMaps = useCallback((lat, lng, label) => {
    if (!lat || !lng) return;

    const url = Platform.select({
      ios: `maps://0?q=${label}&ll=${lat},${lng}`,
      android: `geo:${lat},${lng}?q=${lat},${lng}(${label})`,
      default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    });

    Linking.openURL(url);
  }, []);

  const callCommuter = useCallback(() => {
    const phone =
      booking?.receiver_phone ||
      booking?.buyer_phone ||
      booking?.sender_phone ||
      booking?.phone;

    if (phone) {
      Linking.openURL(`tel:${phone}`);
    }
  }, [booking]);

  const phase = useMemo(() => getRidePhase(booking), [booking]);
  const phaseMeta = PHASE_META[phase] || PHASE_META.assigned;

  const decodePolyline = useCallback((encoded) => {
    const points = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
      let b;
      let shift = 0;
      let result = 0;

      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      lat += result & 1 ? ~(result >> 1) : result >> 1;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      lng += result & 1 ? ~(result >> 1) : result >> 1;

      points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
    }

    return points;
  }, []);

  const calculateDirections = useCallback(
    async (origin, destination) => {
      if (!googleApiKey || !origin || !destination) return null;

      try {
        const url =
          `https://maps.googleapis.com/maps/api/directions/json` +
          `?origin=${origin.latitude},${origin.longitude}` +
          `&destination=${destination.latitude},${destination.longitude}` +
          `&mode=driving&alternatives=false&key=${googleApiKey}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.status !== "OK" || !data.routes?.[0]) return null;

        const mapRoute = data.routes[0];
        const leg = mapRoute.legs?.[0];

        return {
          points: decodePolyline(mapRoute.overview_polyline.points),
          distanceKm: leg?.distance?.value
            ? (leg.distance.value / 1000).toFixed(1)
            : null,
          durationMin: leg?.duration?.value
            ? Math.round(leg.duration.value / 60)
            : null,
        };
      } catch (error) {
        log("calculateDirections error", error?.message || error);
        return null;
      }
    },
    [decodePolyline, googleApiKey]
  );

const fitMapToRoute = useCallback(
  (extraCoordinates = [], options = {}) => {
    if (!mapRef.current) return;

    const {
      force = false,
      rememberAutoFit = true,
    } = options;

    if (!force && (skipNextAutoFitRef.current || userInteractingMapRef.current)) {
      return;
    }

    const points = [];

    if (driverLocation?.latitude && driverLocation?.longitude) {
      points.push({
        latitude: Number(driverLocation.latitude),
        longitude: Number(driverLocation.longitude),
      });
    }

    if (
      bookingRef.current?.pickup_latitude &&
      bookingRef.current?.pickup_longitude
    ) {
      points.push({
        latitude: Number(bookingRef.current.pickup_latitude),
        longitude: Number(bookingRef.current.pickup_longitude),
      });
    }

    if (
      bookingRef.current?.dropoff_latitude &&
      bookingRef.current?.dropoff_longitude
    ) {
      points.push({
        latitude: Number(bookingRef.current.dropoff_latitude),
        longitude: Number(bookingRef.current.dropoff_longitude),
      });
    }

    if (Array.isArray(routeCoordinates) && routeCoordinates.length) {
      points.push(...routeCoordinates);
    }

    if (Array.isArray(extraCoordinates) && extraCoordinates.length) {
      points.push(...extraCoordinates);
    }

    const validPoints = points.filter(
      (p) =>
        p &&
        typeof p.latitude === "number" &&
        typeof p.longitude === "number" &&
        !Number.isNaN(p.latitude) &&
        !Number.isNaN(p.longitude)
    );

    if (!validPoints.length) return;

    const currentHeight = lastSheetHeightRef.current || SHEET_PARTIAL_HEIGHT;

    const bottomPadding =
      sheetMode === "min"
        ? currentHeight + 14
        : sheetMode === "partial"
        ? currentHeight + 26
        : currentHeight + 42;

    mapRef.current.fitToCoordinates(validPoints, {
      edgePadding: {
        top: insets.top + 92,
        right: 44,
        bottom: bottomPadding,
        left: 44,
      },
      animated: true,
    });

    if (rememberAutoFit) {
      hasAutoFittedRef.current = true;
    }

    skipNextAutoFitRef.current = false;
  },
  [driverLocation, insets.top, routeCoordinates, SHEET_PARTIAL_HEIGHT, sheetMode]
);

const zoomMap = useCallback(
  (direction = "in") => {
    if (!mapRef.current) return;

    skipNextAutoFitRef.current = true;
    userInteractingMapRef.current = true;

    const currentCenter = mapRegionRef.current || DEFAULT_REGION;

    const currentLatDelta =
      mapRegionRef.current?.latitudeDelta || DEFAULT_REGION.latitudeDelta;

    const currentLngDelta =
      mapRegionRef.current?.longitudeDelta || DEFAULT_REGION.longitudeDelta;

    const factor = direction === "in" ? 0.5 : 2;

    const nextRegion = {
      latitude: Number(currentCenter.latitude),
      longitude: Number(currentCenter.longitude),
      latitudeDelta: clamp(currentLatDelta * factor, 0.0025, 0.2),
      longitudeDelta: clamp(currentLngDelta * factor, 0.0025, 0.2),
    };

    mapRegionRef.current = nextRegion;
    mapRef.current.animateToRegion(nextRegion, 220);

    setTimeout(() => {
      userInteractingMapRef.current = false;
    }, 900);
  },
  []
);

  const fetchBooking = useCallback(async () => {
    if (!bookingId) return;

    try {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", bookingId)
        .single();

      if (error) throw error;

      log("Fetched booking", data);
      setBooking(data);
    } catch (error) {
      log("fetchBooking error", error?.message || error);
      Alert.alert(
        "Load error",
        error?.message || "Unable to load ride booking."
      );
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  const updateDriverLocation = useCallback(async (coords) => {
    const driverId = await AsyncStorage.getItem("user_id");
    if (!driverId || !coords) return;

    try {
      const { data: existing, error: existingError } = await supabase
        .from("driver_locations")
        .select("id")
        .eq("driver_id", driverId)
        .maybeSingle();

      if (existingError) throw existingError;

      const payload = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        is_online: true,
        last_updated: new Date().toISOString(),
        last_heartbeat: new Date().toISOString(),
      };

      if (existing?.id) {
        const { error: updateError } = await supabase
          .from("driver_locations")
          .update(payload)
          .eq("driver_id", driverId);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("driver_locations")
          .insert({ driver_id: driverId, ...payload });

        if (insertError) throw insertError;
      }
    } catch (error) {
      log("updateDriverLocation error", error?.message || error);
    }
  }, []);

  const startLocationTracking = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        showAlert(
          "Location required",
          "Please allow location access.",
          "warning"
        );
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const latest = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      };

      setDriverLocation(latest);
      mapRegionRef.current = {
        latitude: latest.latitude,
        longitude: latest.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };

      await updateDriverLocation(latest);

      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 3000,
          distanceInterval: 5,
        },
        async (location) => {
          const next = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };

          setDriverLocation(next);
          await updateDriverLocation(next);
        }
      );

      locationSubscriptionRef.current = sub;
    } catch (error) {
      log("startLocationTracking error", error?.message || error);
    }
  }, [showAlert, updateDriverLocation]);
const recalculateRoute = useCallback(async () => {
  const currentBooking = bookingRef.current;
  if (!driverLocation || !currentBooking) return;

  const goToDropoff =
    phase === "picked_up" || phase === "in_transit" || phase === "completed";

  const target = goToDropoff
    ? {
        latitude: Number(currentBooking.dropoff_latitude),
        longitude: Number(currentBooking.dropoff_longitude),
      }
    : {
        latitude: Number(currentBooking.pickup_latitude),
        longitude: Number(currentBooking.pickup_longitude),
      };

  if (!target.latitude || !target.longitude) return;

  const result = await calculateDirections(driverLocation, target);

  if (!result) {
    if (!hasAutoFittedRef.current) {
      fitMapToRoute([driverLocation, target], { force: true });
    }
    return;
  }

  setRouteCoordinates(result.points || []);
  setEstimatedDistance(result.distanceKm);
  setEstimatedTime(result.durationMin);

  if (!hasAutoFittedRef.current) {
    fitMapToRoute([driverLocation, target, ...(result.points || [])], {
      force: true,
    });
  }
}, [calculateDirections, driverLocation, fitMapToRoute, phase]);
  const updateBookingFields = useCallback(
    async (values) => {
      if (!bookingRef.current?.id) return;

      const { error } = await supabase
        .from("bookings")
        .update({
          ...values,
          updated_at: new Date().toISOString(),
        })
        .eq("id", bookingRef.current.id);

      if (error) throw error;
      await fetchBooking();
    },
    [fetchBooking]
  );

  const handleMarkPickedUp = useCallback(() => {
    showAlert(
      "Start ride",
      "Confirm that the passenger is already picked up?",
      "info",
      {
        confirmText: "Start Ride",
        cancelText: "Cancel",
        onConfirm: async () => {
          try {
            setAlertVisible(false);
            await updateBookingFields({
              ride_started_at: new Date().toISOString(),
              service_status: "picked_up",
              status: "accepted",
            });
            await Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success
            );
          } catch (error) {
            log("handleMarkPickedUp error", error?.message || error);
            showAlert(
              "Update failed",
              error?.message || "Unable to start the ride.",
              "error"
            );
          }
        },
      }
    );
  }, [showAlert, updateBookingFields]);

  const handleStartTransit = useCallback(() => {
    showAlert(
      "Proceed to dropoff",
      "Update ride status to on the way to destination?",
      "info",
      {
        confirmText: "Proceed",
        cancelText: "Cancel",
        onConfirm: async () => {
          try {
            setAlertVisible(false);
            await updateBookingFields({
              service_status: "in_transit",
              status: "accepted",
            });
            await Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success
            );
          } catch (error) {
            log("handleStartTransit error", error?.message || error);
            showAlert(
              "Update failed",
              error?.message || "Unable to update ride status.",
              "error"
            );
          }
        },
      }
    );
  }, [showAlert, updateBookingFields]);

  const handleCompleteRide = useCallback(() => {
    showAlert(
      "Complete ride",
      "Confirm that the passenger has arrived at the destination?",
      "success",
      {
        confirmText: "Complete",
        cancelText: "Cancel",
        onConfirm: async () => {
          try {
            setAlertVisible(false);
            await updateBookingFields({
              ride_completed_at: new Date().toISOString(),
              service_status: "completed",
              status: "completed",
            });
            await Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success
            );

            navigation.navigate("DriverHomePage", {
              screen: "TrackRides",
            });
          } catch (error) {
            log("handleCompleteRide error", error?.message || error);
            showAlert(
              "Complete failed",
              error?.message || "Unable to complete the ride.",
              "error"
            );
          }
        },
      }
    );
  }, [navigation, showAlert, updateBookingFields]);

  const openCancelReasonModal = useCallback(() => {
    const paymentStatus = normalize(booking?.payment_status);

    if (paymentStatus === "paid" || booking?.ride_started_at) {
      showAlert(
        "Cannot cancel",
        "Hindi na puwedeng i-cancel ng driver kapag paid na o nagsimula na ang ride.",
        "warning"
      );
      return;
    }

    setSelectedCancelReason("");
    setCustomCancelReason("");
    setCancelModalVisible(true);
  }, [booking?.payment_status, booking?.ride_started_at, showAlert]);

  const confirmCancelRide = useCallback(async () => {
    const finalReason =
      selectedCancelReason === "Other / Iba pa"
        ? customCancelReason.trim()
        : selectedCancelReason.trim();

    if (!selectedCancelReason) {
      showAlert(
        "Reason required",
        "Please select a cancellation reason first.",
        "warning"
      );
      return;
    }

    if (selectedCancelReason === "Other / Iba pa" && !customCancelReason.trim()) {
      showAlert(
        "Reason required",
        "Please enter your cancellation reason.",
        "warning"
      );
      return;
    }

    try {
      setSubmittingCancel(true);

      await updateBookingFields({
        driver_id: null,
        status: "cancelled",
        service_status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: finalReason,
        cancelled_by: "driver",
      });

      const { error: requestError } = await supabase
        .from("booking_requests")
        .update({
          status: "cancelled",
          responded_at: new Date().toISOString(),
          cancellation_reason: finalReason,
          cancelled_by: "driver",
        })
        .eq("booking_id", bookingRef.current?.id)
        .in("status", ["pending", "accepted"]);

      if (requestError) {
        log("booking_requests cancel error", requestError);
      }

      setCancelModalVisible(false);
      setSelectedCancelReason("");
      setCustomCancelReason("");

      navigation.navigate("DriverHomePage", {
        screen: "TrackRides",
      });
    } catch (error) {
      log("confirmCancelRide error", error?.message || error);
      showAlert(
        "Cancel failed",
        error?.message || "Unable to cancel the ride.",
        "error"
      );
    } finally {
      setSubmittingCancel(false);
    }
  }, [
    customCancelReason,
    navigation,
    selectedCancelReason,
    showAlert,
    updateBookingFields,
  ]);

  const handleCancelRide = useCallback(() => {
    openCancelReasonModal();
  }, [openCancelReasonModal]);

  const primaryAction = useMemo(() => {
    switch (phase) {
      case "assigned":
        return {
          label: "Passenger Picked Up",
          icon: "person",
          color: COLORS.orange,
          onPress: handleMarkPickedUp,
        };
      case "picked_up":
        return {
          label: "Start Trip to Dropoff",
          icon: "navigate-outline",
          color: COLORS.navyLight,
          onPress: handleStartTransit,
        };
      case "in_transit":
        return {
          label: "Complete Ride",
          icon: "checkmark-circle",
          color: COLORS.greenDark,
          onPress: handleCompleteRide,
        };
      default:
        return null;
    }
  }, [handleCompleteRide, handleMarkPickedUp, handleStartTransit, phase]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const init = async () => {
        try {
          setLoading(true);
          await Promise.all([fetchBooking(), startLocationTracking()]);
        } finally {
          if (active) setLoading(false);
        }
      };

      init();

      return () => {
        active = false;
      };
    }, [fetchBooking, startLocationTracking])
  );

  useEffect(() => {
    if (booking && driverLocation) {
      recalculateRoute();
    }
  }, [booking, driverLocation, phase, recalculateRoute]);

useEffect(() => {
  const timer = setTimeout(() => {
    if (!skipNextAutoFitRef.current && !userInteractingMapRef.current) {
      fitMapToRoute([], { force: false, rememberAutoFit: false });
    }
  }, 180);

  return () => clearTimeout(timer);
}, [sheetMode, fitMapToRoute]);

  useEffect(() => {
    if (!bookingId) return;

    bookingSubscriptionRef.current?.unsubscribe?.();

    bookingSubscriptionRef.current = supabase
      .channel(`driver-track-ride-${bookingId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `id=eq.${bookingId}`,
        },
        async (payload) => {
          log("Realtime booking update", payload?.new);

          const updated = payload.new;
          if (!updated) return;

          setBooking((prev) => ({ ...(prev || {}), ...updated }));

          if (normalize(updated.status) === "cancelled") {
            showAlert(
              "Ride cancelled",
              updated.cancellation_reason || "This ride was cancelled.",
              "error",
              {
                confirmText: "Go Back",
                onConfirm: () => {
                  setAlertVisible(false);
                  navigation.navigate("DriverHomePage", {
                    screen: "TrackRides",
                  });
                },
              }
            );
          }

          if (normalize(updated.status) === "completed") {
            navigation.navigate("DriverHomePage", {
              screen: "TrackRides",
            });
          }
        }
      )
      .subscribe();

    return () => {
      bookingSubscriptionRef.current?.unsubscribe?.();
    };
  }, [bookingId, navigation, showAlert]);

  useEffect(() => {
    return () => {
      locationSubscriptionRef.current?.remove?.();
      bookingSubscriptionRef.current?.unsubscribe?.();
    };
  }, []);

  const toggleSheetMode = useCallback(() => {
    if (sheetMode === "min") {
      snapToSheet("partial");
      return;
    }
    if (sheetMode === "partial") {
      snapToSheet("expanded");
      return;
    }
    snapToSheet("min");
  }, [sheetMode, snapToSheet]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
          const isVertical = Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2;
          if (!isVertical) return false;

          if (sheetMode === "expanded") {
            if (scrollOffsetRef.current > 0 && gesture.dy < 0) return false;
            if (scrollOffsetRef.current > 0 && Math.abs(gesture.dy) < 12) return false;
            return Math.abs(gesture.dy) > 8;
          }

          return Math.abs(gesture.dy) > 6;
        },
        onPanResponderGrant: () => {
          setIsDraggingSheet(true);
        },
        onPanResponderMove: (_, gesture) => {
          const nextHeight = clamp(
            lastSheetHeightRef.current - gesture.dy,
            SHEET_MIN_HEIGHT,
            SHEET_EXPANDED_HEIGHT
          );
          sheetHeightAnim.setValue(nextHeight);
        },
        onPanResponderRelease: (_, gesture) => {
          setIsDraggingSheet(false);

          const draggedHeight = clamp(
            lastSheetHeightRef.current - gesture.dy,
            SHEET_MIN_HEIGHT,
            SHEET_EXPANDED_HEIGHT
          );

          const velocity = gesture.vy;
          const movingDownFast = velocity > 0.75;
          const movingUpFast = velocity < -0.75;

          const midMinPartial = (SHEET_MIN_HEIGHT + SHEET_PARTIAL_HEIGHT) / 2;
          const midPartialExpanded =
            (SHEET_PARTIAL_HEIGHT + SHEET_EXPANDED_HEIGHT) / 2;

          let targetMode = "partial";

          if (movingDownFast) {
            if (draggedHeight <= SHEET_PARTIAL_HEIGHT + 30) {
              targetMode = "min";
            } else {
              targetMode = "partial";
            }
          } else if (movingUpFast) {
            if (draggedHeight >= SHEET_PARTIAL_HEIGHT - 30) {
              targetMode = "expanded";
            } else {
              targetMode = "partial";
            }
          } else {
            if (draggedHeight < midMinPartial) {
              targetMode = "min";
            } else if (draggedHeight < midPartialExpanded) {
              targetMode = "partial";
            } else {
              targetMode = "expanded";
            }
          }

          snapToSheet(targetMode);
        },
        onPanResponderTerminate: () => {
          setIsDraggingSheet(false);
          snapToSheet(sheetMode);
        },
      }),
    [
      SHEET_EXPANDED_HEIGHT,
      SHEET_MIN_HEIGHT,
      SHEET_PARTIAL_HEIGHT,
      sheetHeightAnim,
      snapToSheet,
      sheetMode,
    ]
  );

  if (loading && !booking) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.orange} />
          <Text style={styles.loadingText}>Loading active ride...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const targetLabel = phase === "assigned" ? "Pickup" : "Dropoff";
  const targetCoords =
    phase === "assigned"
      ? {
          latitude: Number(booking?.pickup_latitude),
          longitude: Number(booking?.pickup_longitude),
        }
      : {
          latitude: Number(booking?.dropoff_latitude),
          longitude: Number(booking?.dropoff_longitude),
        };

  const showFullContent = sheetMode !== "min";

  return (
    <SafeAreaView style={styles.safeArea}>
      <ModernAlert
        visible={alertVisible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
        onClose={() => setAlertVisible(false)}
        onConfirm={alertConfig.onConfirm}
        styles={styles}
      />

      <Modal
        transparent
        visible={cancelModalVisible}
        animationType="fade"
        onRequestClose={() => {
          if (!submittingCancel) setCancelModalVisible(false);
        }}
      >
        <BlurView intensity={20} style={styles.alertOverlay}>
          <View style={styles.cancelModalWrap}>
            <View style={styles.cancelModalCard}>
              <View style={styles.cancelModalIconBox}>
                <Ionicons name="alert-circle" size={36} color={COLORS.red} />
              </View>

              <Text style={styles.cancelModalTitle}>Cancel Ride</Text>
              <Text style={styles.cancelModalMessage}>
                Please select the reason why you want to cancel this ride.
              </Text>

              <View style={styles.cancelReasonList}>
                {DRIVER_CANCEL_REASONS.map((reason) => {
                  const selected = selectedCancelReason === reason;
                  return (
                    <Pressable
                      key={reason}
                      onPress={() => setSelectedCancelReason(reason)}
                      style={[
                        styles.cancelReasonOption,
                        selected && styles.cancelReasonOptionSelected,
                      ]}
                    >
                      <View
                        style={[
                          styles.cancelReasonRadio,
                          selected && styles.cancelReasonRadioSelected,
                        ]}
                      >
                        {selected ? (
                          <View style={styles.cancelReasonRadioInner} />
                        ) : null}
                      </View>

                      <Text
                        style={[
                          styles.cancelReasonText,
                          selected && styles.cancelReasonTextSelected,
                        ]}
                      >
                        {reason}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {selectedCancelReason === "Other / Iba pa" ? (
                <TextInput
                  value={customCancelReason}
                  onChangeText={setCustomCancelReason}
                  placeholder="Type your reason here..."
                  placeholderTextColor={COLORS.gray400}
                  multiline
                  editable={!submittingCancel}
                  style={styles.cancelReasonInput}
                />
              ) : null}

              <View style={styles.alertBtns}>
                <Pressable
                  style={styles.alertSecondaryBtn}
                  disabled={submittingCancel}
                  onPress={() => setCancelModalVisible(false)}
                >
                  <Text style={styles.alertSecondaryText}>Back</Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.alertPrimaryBtn,
                    { backgroundColor: COLORS.red },
                    submittingCancel && { opacity: 0.7 },
                  ]}
                  disabled={submittingCancel}
                  onPress={confirmCancelRide}
                >
                  {submittingCancel ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <Text style={styles.alertPrimaryText}>Confirm Cancel</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </BlurView>
      </Modal>

      <Header
        insets={insets}
        navigation={navigation}
        subtitle={phaseMeta.subtitle}
        title={phaseMeta.title}
        statusColor={phaseMeta.color}
        styles={styles}
      />

      <View style={styles.mapWrap}>
        <MapView
  ref={mapRef}
  provider={PROVIDER_GOOGLE}
  style={styles.map}
  initialRegion={DEFAULT_REGION}
  showsUserLocation={false}
  zoomEnabled
  zoomTapEnabled
  zoomControlEnabled={Platform.OS === "android"}
  scrollEnabled
  rotateEnabled
  pitchEnabled
  toolbarEnabled={Platform.OS === "android"}
  showsCompass
  loadingEnabled
  onPanDrag={() => {
    skipNextAutoFitRef.current = true;
    userInteractingMapRef.current = true;
  }}
  onRegionChangeComplete={(region) => {
    mapRegionRef.current = region;

    setTimeout(() => {
      userInteractingMapRef.current = false;
    }, 700);
  }}
>
          {driverLocation ? (
            <Marker coordinate={driverLocation}>
              <DriverMapMarker styles={styles} />
            </Marker>
          ) : null}

          {booking?.pickup_latitude && booking?.pickup_longitude ? (
            <Marker
              coordinate={{
                latitude: Number(booking.pickup_latitude),
                longitude: Number(booking.pickup_longitude),
              }}
            >
              <LocationPin type="pickup" styles={styles} />
            </Marker>
          ) : null}

          {booking?.dropoff_latitude && booking?.dropoff_longitude ? (
            <Marker
              coordinate={{
                latitude: Number(booking.dropoff_latitude),
                longitude: Number(booking.dropoff_longitude),
              }}
            >
              <LocationPin type="dropoff" styles={styles} />
            </Marker>
          ) : null}

          {routeCoordinates?.length ? (
            <Polyline
              coordinates={routeCoordinates}
              strokeWidth={5}
              strokeColor={phaseMeta.polylineColor}
            />
          ) : null}
        </MapView>

        <View
          style={[
            styles.floatingTopRight,
            {
              top: insets.top + 10,
              right: 14,
            },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.mapControlsStack}>
            <Pressable
              style={styles.floatingIconBtn}
              onPress={() => zoomMap("in")}
            >
              <Ionicons name="add" size={22} color={COLORS.gray800} />
            </Pressable>

            <Pressable
              style={styles.floatingIconBtn}
              onPress={() => zoomMap("out")}
            >
              <Ionicons name="remove" size={22} color={COLORS.gray800} />
            </Pressable>

            <Pressable
  style={styles.floatingIconBtn}
  onPress={() => {
    skipNextAutoFitRef.current = false;
    userInteractingMapRef.current = false;
    hasAutoFittedRef.current = true;
    fitMapToRoute([], { force: true });
  }}
>
  <Ionicons name="locate-outline" size={21} color={COLORS.gray800} />
</Pressable>
          </View>
        </View>
      </View>

      <Animated.View
        style={[
          styles.bottomSheet,
          {
            height: sheetHeightAnim,
            paddingBottom:
              sheetMode === "min"
                ? Math.max(insets.bottom, 14) + metrics.SPACING.sm
                : Math.max(insets.bottom, 12) + metrics.SPACING.md,
            opacity: isDraggingSheet ? 0.985 : 1,
          },
        ]}
      >
        <View {...panResponder.panHandlers}>
          <Pressable style={styles.sheetTopPressable} onPress={toggleSheetMode}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderLeft}>
                <View
                  style={[
                    styles.sheetChip,
                    { backgroundColor: `${phaseMeta.color}18` },
                  ]}
                >
                  <Text style={[styles.sheetChipText, { color: phaseMeta.color }]}>
                    {phaseMeta.chipLabel}
                  </Text>
                </View>

                <Text numberOfLines={1} style={styles.sheetMiniHint}>
                  {sheetMode === "min"
                    ? "Tap or drag up for more details"
                    : "Drag up for more details"}
                </Text>
              </View>

              <Text style={styles.sheetFare}>{formatAmount(booking?.fare)}</Text>
            </View>
          </Pressable>

          <SummaryBar
            timeText={estimatedTime ? `${estimatedTime} min` : "-"}
            distanceText={estimatedDistance ? `${estimatedDistance} km` : "-"}
            totalText={formatAmount(booking?.fare)}
            compact={sheetMode === "min"}
            styles={styles}
            isSmallDevice={isSmallDevice}
          />
        </View>

        {showFullContent ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sheetScrollContent}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={!isDraggingSheet}
            onScroll={(e) => {
              scrollOffsetRef.current = e.nativeEvent.contentOffset.y || 0;
            }}
            scrollEventThrottle={16}
          >
            <StepBar phase={phase} styles={styles} />

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Route Details</Text>

              <View style={styles.routeRow}>
                <View
                  style={[styles.routeDot, { backgroundColor: COLORS.orange }]}
                />
                <View style={styles.routeTextWrap}>
                  <Text style={styles.routeLabel}>Pickup</Text>
                  <Text style={styles.routeValue}>
                    {booking?.pickup_location || "-"}
                  </Text>
                </View>
              </View>

              <View style={styles.routeLine} />

              <View style={styles.routeRow}>
                <View
                  style={[
                    styles.routeDot,
                    { backgroundColor: COLORS.greenDark },
                  ]}
                />
                <View style={styles.routeTextWrap}>
                  <Text style={styles.routeLabel}>Dropoff</Text>
                  <Text style={styles.routeValue}>
                    {booking?.dropoff_location || "-"}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.quickActions}>
              <ActionButton
                label={`Open ${targetLabel}`}
                icon="navigate-outline"
                color={COLORS.navyLight}
                outline
                onPress={() =>
                  openMaps(
                    targetCoords?.latitude,
                    targetCoords?.longitude,
                    targetLabel
                  )
                }
                styles={styles}
              />
              <ActionButton
                label="Call Rider"
                icon="call-outline"
                color={COLORS.greenDark}
                outline
                onPress={callCommuter}
                styles={styles}
              />
            </View>

            {primaryAction ? (
              <View style={styles.primaryActionWrap}>
                <ActionButton
                  label={primaryAction.label}
                  icon={primaryAction.icon}
                  color={primaryAction.color}
                  onPress={primaryAction.onPress}
                  styles={styles}
                />
              </View>
            ) : null}

            {phase !== "completed" && phase !== "cancelled" ? (
              <Pressable style={styles.cancelBtn} onPress={handleCancelRide}>
                <Ionicons
                  name="close-circle-outline"
                  size={18}
                  color={COLORS.red}
                />
                <Text style={styles.cancelBtnText}>Cancel Ride</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        ) : (
          <View {...panResponder.panHandlers} style={styles.minimizedFooter}>
            <View style={styles.minimizedTopRow}>
              <View style={styles.minimizedRouteWrap}>
                <Text style={styles.minimizedLabel}>Active Ride</Text>
                <Text style={styles.minimizedText} numberOfLines={2}>
                  {booking?.pickup_location || "-"} → {booking?.dropoff_location || "-"}
                </Text>
              </View>

              <Pressable
                style={styles.minimizedExpandBtn}
                onPress={() => snapToSheet("partial")}
              >
                <Ionicons name="chevron-up" size={18} color={COLORS.gray700} />
              </Pressable>
            </View>

            {primaryAction ? (
              <Pressable
                style={[
                  styles.minPrimaryBtn,
                  { backgroundColor: primaryAction.color },
                ]}
                onPress={primaryAction.onPress}
              >
                <Ionicons
                  name={primaryAction.icon}
                  size={18}
                  color={COLORS.white}
                />
                <Text style={styles.minPrimaryBtnText} numberOfLines={1}>
                  {primaryAction.label}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.minPrimaryBtn, { backgroundColor: COLORS.navyLight }]}
                onPress={() => snapToSheet("partial")}
              >
                <Ionicons
                  name="reorder-three-outline"
                  size={18}
                  color={COLORS.white}
                />
                <Text style={styles.minPrimaryBtnText} numberOfLines={1}>
                  View Ride Details
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

function createStyles(metrics, screenWidth) {
  const { FONT, SPACING, BR } = metrics;
  const isSmall = screenWidth < 360;

  const styles = StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: COLORS.pageBg,
    },

    header: {
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.md,
      flexDirection: "row",
      alignItems: "center",
    },
    headerIconBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: "rgba(255,255,255,0.12)",
      alignItems: "center",
      justifyContent: "center",
    },
    headerCenter: {
      flex: 1,
      marginLeft: SPACING.md,
    },
    headerSubRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    headerStatusDot: {
      width: 8,
      height: 8,
      borderRadius: 999,
      marginRight: 8,
    },
    headerSub: {
      color: "rgba(255,255,255,0.85)",
      fontSize: FONT.sm,
      fontWeight: "700",
    },
    headerTitle: {
      color: COLORS.white,
      fontSize: FONT.xl,
      fontWeight: "900",
      marginTop: 3,
    },

    mapWrap: {
      flex: 1,
      position: "relative",
    },
    map: {
      flex: 1,
    },

    floatingTopRight: {
      position: "absolute",
      zIndex: 20,
    },
    mapControlsStack: {
      gap: 10,
    },
    floatingIconBtn: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: COLORS.white,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOpacity: 0.14,
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 12,
      elevation: 7,
    },

    driverMarker: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: COLORS.navyLight,
      borderWidth: 3,
      borderColor: COLORS.white,
      alignItems: "center",
      justifyContent: "center",
    },
    pinWrap: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 3,
      borderColor: COLORS.white,
      alignItems: "center",
      justifyContent: "center",
    },

    bottomSheet: {
      backgroundColor: COLORS.cardBg,
      borderTopLeftRadius: BR.xl,
      borderTopRightRadius: BR.xl,
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.sm,
      marginTop: -22,
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowOffset: { width: 0, height: -6 },
      shadowRadius: 16,
      elevation: 16,
      overflow: "hidden",
    },
    sheetTopPressable: {
      paddingBottom: SPACING.xs,
    },
    sheetHandle: {
      width: 60,
      height: 6,
      borderRadius: 999,
      backgroundColor: "#D1D5DB",
      alignSelf: "center",
      marginBottom: 10,
    },
    sheetHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: SPACING.md,
    },
    sheetHeaderLeft: {
      flex: 1,
      minWidth: 0,
    },
    sheetChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: BR.full,
      alignSelf: "flex-start",
      maxWidth: "55%",
    },
    sheetChipText: {
      fontSize: FONT.sm,
      fontWeight: "800",
    },
    sheetMiniHint: {
      marginTop: 4,
      fontSize: FONT.xs,
      color: COLORS.gray500,
      fontWeight: "700",
    },
    sheetFare: {
      fontSize: FONT.lg,
      fontWeight: "900",
      color: COLORS.greenDark,
      marginLeft: 10,
    },

    summaryBar: {
      marginTop: SPACING.sm,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: COLORS.gray100,
      borderRadius: BR.lg,
      paddingVertical: 12,
      paddingHorizontal: 10,
      gap: 6,
    },
    summaryBarCompact: {
      marginTop: SPACING.sm,
    },
    summaryBarStack: {
      flexDirection: "column",
      alignItems: "stretch",
      paddingVertical: 10,
    },
    summaryStackRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    summaryItem: {
      flex: 1,
      minWidth: 0,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 6,
    },
    summaryItemTotal: {
      marginTop: 6,
      backgroundColor: "#ECFDF5",
      borderRadius: BR.md,
      paddingVertical: 8,
      paddingHorizontal: 10,
    },
    summaryDivider: {
      width: 1,
      height: 20,
      backgroundColor: COLORS.gray300,
    },
    summaryText: {
      flexShrink: 1,
      fontSize: FONT.sm,
      color: COLORS.gray700,
      fontWeight: "700",
    },
    summaryTotalText: {
      color: COLORS.greenDark,
      fontWeight: "800",
    },

    sheetScrollContent: {
      paddingTop: SPACING.md,
      paddingBottom: SPACING.md,
    },

    stepBar: {
      marginTop: SPACING.xs,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    stepItem: {
      flex: 1,
      alignItems: "center",
      position: "relative",
      minWidth: 0,
    },
    stepCircle: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: COLORS.gray100,
      borderWidth: 1,
      borderColor: COLORS.gray300,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2,
    },
    stepCircleDone: {
      backgroundColor: COLORS.navyLight,
      borderColor: COLORS.navyLight,
    },
    stepCircleActive: {
      backgroundColor: COLORS.orange,
      borderColor: COLORS.orange,
    },
    stepLabel: {
      marginTop: 6,
      fontSize: 11,
      color: COLORS.gray500,
      fontWeight: "700",
      textAlign: "center",
      maxWidth: "90%",
      lineHeight: 14,
    },
    stepLabelDone: {
      color: COLORS.gray800,
    },
    stepConnector: {
      position: "absolute",
      top: 14,
      right: "-50%",
      width: "100%",
      height: 2,
      backgroundColor: COLORS.gray300,
      zIndex: 1,
    },
    stepConnectorDone: {
      backgroundColor: COLORS.navyLight,
    },

    card: {
      marginTop: SPACING.md,
      backgroundColor: COLORS.white,
      borderRadius: BR.lg,
      padding: SPACING.md,
      borderWidth: 1,
      borderColor: COLORS.gray200,
    },
    cardTitle: {
      fontSize: FONT.md,
      fontWeight: "900",
      color: COLORS.gray800,
      marginBottom: SPACING.md,
    },
    routeRow: {
      flexDirection: "row",
      alignItems: "flex-start",
    },
    routeDot: {
      width: 10,
      height: 10,
      borderRadius: 999,
      marginTop: 5,
      marginRight: 10,
    },
    routeLine: {
      width: 2,
      height: 20,
      backgroundColor: COLORS.gray300,
      marginLeft: 4,
      marginVertical: 6,
    },
    routeTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    routeLabel: {
      fontSize: FONT.sm,
      color: COLORS.gray500,
      fontWeight: "700",
    },
    routeValue: {
      marginTop: 2,
      fontSize: FONT.md,
      color: COLORS.gray800,
      lineHeight: 22,
      fontWeight: "700",
    },

    quickActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginTop: SPACING.md,
    },
    actionBtn: {
      flexGrow: 1,
      flexBasis: isSmall ? "100%" : "48%",
      minHeight: 48,
      borderRadius: BR.lg,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 10,
    },
    actionBtnText: {
      flexShrink: 1,
      fontWeight: "800",
      fontSize: FONT.sm,
    },

    primaryActionWrap: {
      marginTop: SPACING.md,
    },

    cancelBtn: {
      marginTop: SPACING.md,
      minHeight: 48,
      borderRadius: BR.lg,
      borderWidth: 1,
      borderColor: "#FECACA",
      backgroundColor: "#FEF2F2",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 10,
    },
    cancelBtnText: {
      color: COLORS.red,
      fontSize: FONT.md,
      fontWeight: "800",
    },

    minimizedFooter: {
      flex: 1,
      justifyContent: "space-between",
      paddingTop: SPACING.sm,
      paddingBottom: Math.max(SPACING.sm, 6),
      gap: SPACING.sm,
    },
    minimizedTopRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      marginBottom: 2,
    },
    minimizedRouteWrap: {
      flex: 1,
      minWidth: 0,
    },
    minimizedLabel: {
      fontSize: FONT.xs,
      color: COLORS.gray500,
      fontWeight: "800",
      marginBottom: 4,
      textTransform: "uppercase",
    },
    minimizedText: {
      fontSize: FONT.sm,
      color: COLORS.gray700,
      fontWeight: "700",
      lineHeight: 19,
    },
    minimizedExpandBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: COLORS.gray100,
      alignItems: "center",
      justifyContent: "center",
    },
    minPrimaryBtn: {
      minHeight: 50,
      borderRadius: BR.lg,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 14,
      marginBottom: 2,
    },
    minPrimaryBtnText: {
      color: COLORS.white,
      fontSize: FONT.sm,
      fontWeight: "900",
      flexShrink: 1,
    },

    loadingWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    loadingText: {
      marginTop: 12,
      color: COLORS.gray500,
      fontSize: FONT.md,
    },

    alertOverlay: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    alertWrap: {
      width: "100%",
    },
    alertCard: {
      backgroundColor: COLORS.white,
      borderRadius: BR.xl,
      padding: 20,
      alignItems: "center",
    },
    alertIconBox: {
      width: 74,
      height: 74,
      borderRadius: 37,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    alertTitle: {
      fontSize: FONT.lg,
      fontWeight: "900",
      color: COLORS.gray800,
      textAlign: "center",
    },
    alertMessage: {
      marginTop: 8,
      fontSize: FONT.md,
      lineHeight: 22,
      color: COLORS.gray500,
      textAlign: "center",
    },
    alertBtns: {
      marginTop: 18,
      width: "100%",
      flexDirection: "row",
      gap: 10,
    },
    alertSecondaryBtn: {
      flex: 1,
      minHeight: 46,
      borderRadius: BR.lg,
      borderWidth: 1,
      borderColor: COLORS.gray300,
      alignItems: "center",
      justifyContent: "center",
    },
    alertSecondaryText: {
      color: COLORS.gray700,
      fontWeight: "800",
    },
    alertPrimaryBtn: {
      flex: 1,
      minHeight: 46,
      borderRadius: BR.lg,
      alignItems: "center",
      justifyContent: "center",
    },
    alertPrimaryText: {
      color: COLORS.white,
      fontWeight: "800",
    },

    cancelModalWrap: {
      width: "100%",
      maxWidth: 460,
    },
    cancelModalCard: {
      backgroundColor: COLORS.white,
      borderRadius: BR.xl,
      padding: 20,
    },
    cancelModalIconBox: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: "#FEF2F2",
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "center",
      marginBottom: 12,
    },
    cancelModalTitle: {
      fontSize: FONT.lg,
      fontWeight: "900",
      color: COLORS.gray800,
      textAlign: "center",
    },
    cancelModalMessage: {
      marginTop: 8,
      fontSize: FONT.md,
      lineHeight: 22,
      color: COLORS.gray500,
      textAlign: "center",
    },
    cancelReasonList: {
      marginTop: 18,
      gap: 10,
    },
    cancelReasonOption: {
      minHeight: 52,
      borderRadius: BR.lg,
      borderWidth: 1.5,
      borderColor: COLORS.gray200,
      backgroundColor: COLORS.white,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
    },
    cancelReasonOptionSelected: {
      borderColor: COLORS.red,
      backgroundColor: "#FEF2F2",
    },
    cancelReasonRadio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: COLORS.gray400,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    cancelReasonRadioSelected: {
      borderColor: COLORS.red,
    },
    cancelReasonRadioInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: COLORS.red,
    },
    cancelReasonText: {
      flex: 1,
      fontSize: FONT.md,
      color: COLORS.gray700,
      fontWeight: "700",
    },
    cancelReasonTextSelected: {
      color: COLORS.redDark,
      fontWeight: "800",
    },
    cancelReasonInput: {
      marginTop: 14,
      minHeight: 96,
      borderRadius: BR.lg,
      borderWidth: 1.5,
      borderColor: COLORS.gray300,
      backgroundColor: COLORS.gray100,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: FONT.md,
      color: COLORS.gray800,
      textAlignVertical: "top",
    },
  });

  styles._metrics = metrics;
  return styles;
}