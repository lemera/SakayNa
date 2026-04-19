// screens/commuter/CommuterTrackRidesScreen.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Image,
  ScrollView,
  Pressable,
  Linking,
  Alert,
  Dimensions,
  Animated,
  PanResponder,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import Constants from "expo-constants";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
const isTablet = screenWidth >= 768;
const isSmallDevice = screenWidth <= 375;

const DEFAULT_REGION = {
  latitude: 14.5995,
  longitude: 120.9842,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const COLORS = {
  navy: "#183B5C",
  navy2: "#27527A",
  orange: "#F97316",
  orange2: "#FB923C",
  green: "#10B981",
  red: "#EF4444",
  yellow: "#F59E0B",
  blue: "#2563EB",
  gray50: "#F8FAFC",
  gray100: "#F1F5F9",
  gray150: "#EDF2F7",
  gray200: "#E2E8F0",
  gray300: "#CBD5E1",
  gray400: "#94A3B8",
  gray500: "#64748B",
  gray600: "#475569",
  gray700: "#334155",
  gray800: "#1E293B",
  white: "#FFFFFF",
  black: "#000000",
};

const formatAmount = (value) => `₱${Number(value || 0).toFixed(2)}`;

function logStep(label, data = null) {
  if (__DEV__) {
    if (data !== null && data !== undefined) {
      console.log("[CommuterTrackRidesScreen]", label, data);
    } else {
      console.log("[CommuterTrackRidesScreen]", label);
    }
  }
}

function decodePolyline(encoded) {
  if (!encoded || typeof encoded !== "string") return [];

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

    points.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    });
  }

  return points;
}

function isValidNumber(value) {
  const num = Number(value);
  return Number.isFinite(num);
}

function toCoordinate(lat, lng) {
  if (!isValidNumber(lat) || !isValidNumber(lng)) return null;
  return {
    latitude: Number(lat),
    longitude: Number(lng),
  };
}

function isActiveBooking(row) {
  if (!row) return false;

  const status = String(row.status || "").toLowerCase().trim();
  const serviceStatus = String(row.service_status || "").toLowerCase().trim();
  const paymentStatus = String(row.payment_status || "").toLowerCase().trim();

  const isAccepted = status === "accepted";
  const isPaid = ["paid", "success", "succeeded", "completed"].includes(paymentStatus);
  const isCancelled = status === "cancelled" || serviceStatus === "cancelled";
  const isCompleted = status === "completed" || serviceStatus === "completed";

  if (isAccepted && !isCancelled && !isCompleted) return true;
  if (isPaid && !isCancelled && !isCompleted) return true;

  return false;
}

function getRideStage(booking) {
  if (!booking) return "waiting";

  const bookingStatus = String(booking.status || "").toLowerCase().trim();
  const paymentStatus = String(booking.payment_status || "").toLowerCase().trim();

  if (bookingStatus === "completed") return "completed";
  if (bookingStatus === "cancelled") return "cancelled";
  if (booking.ride_started_at) return "in_trip";
  if (booking.driver_arrived_at) return "arrived";
  if (paymentStatus === "paid") return "paid";
  if (bookingStatus === "accepted") return "accepted";
  if (booking.driver_id) return "driver_assigned";

  return "waiting";
}

function getPabiliStage(booking) {
  if (!booking) return "waiting";

  const bookingStatus = String(booking.status || "").toLowerCase().trim();
  const serviceStatus = String(booking.service_status || "").toLowerCase().trim();
  const paymentStatus = String(booking.payment_status || "").toLowerCase().trim();

  if (bookingStatus === "completed" || serviceStatus === "completed") return "completed";
  if (bookingStatus === "cancelled" || serviceStatus === "cancelled") return "cancelled";
  if (booking.delivered_at || serviceStatus === "delivered") return "delivered";
  if (serviceStatus === "in_transit") return "delivering";
  if (serviceStatus === "purchased") return "purchased";
  if (booking.purchased_at && serviceStatus !== "picked_up") return "purchased";
  if (serviceStatus === "purchasing") return "purchasing";
  if (serviceStatus === "picked_up") return "arrived_at_store";
  if (booking.driver_id) return "driver_assigned";
  if (paymentStatus === "paid") return "paid";

  return "waiting";
}

function getStageMeta({ isRide, isPabili, rideStage, pabiliStage }) {
  if (isRide) {
    switch (rideStage) {
      case "driver_assigned":
        return {
          title: "Driver assigned",
          message: "A driver has been assigned to your ride.",
          color: COLORS.blue,
          icon: "car-outline",
        };
      case "arrived":
        return {
          title: "Driver arrived",
          message: "Your driver has arrived at the pickup point.",
          color: COLORS.green,
          icon: "location-outline",
        };
      case "in_trip":
        return {
          title: "In trip",
          message: "You are currently on the trip.",
          color: COLORS.orange,
          icon: "navigate-outline",
        };
      case "paid":
        return {
          title: "Payment confirmed",
          message: "Payment confirmed. Waiting for the next update.",
          color: COLORS.green,
          icon: "card-outline",
        };
      case "accepted":
        return {
          title: "Booking accepted",
          message: "Your booking has been accepted.",
          color: COLORS.blue,
          icon: "checkmark-circle-outline",
        };
      case "completed":
        return {
          title: "Ride completed",
          message: "Your ride is completed.",
          color: COLORS.green,
          icon: "checkmark-circle",
        };
      case "cancelled":
        return {
          title: "Ride cancelled",
          message: "This ride booking was cancelled.",
          color: COLORS.red,
          icon: "close-circle",
        };
      default:
        return {
          title: "Looking for updates",
          message: "We are waiting for updates on your ride.",
          color: COLORS.yellow,
          icon: "time-outline",
        };
    }
  }

  if (isPabili) {
    switch (pabiliStage) {
      case "driver_assigned":
        return {
          title: "Driver assigned",
          message: "A driver has been assigned to your pabili request.",
          color: COLORS.blue,
          icon: "person-outline",
        };
      case "paid":
        return {
          title: "Payment confirmed",
          message: "Payment confirmed. Waiting for driver assignment or next update.",
          color: COLORS.green,
          icon: "card-outline",
        };
      case "arrived_at_store":
        return {
          title: "Driver arrived at store",
          message: "Your driver has arrived at the store.",
          color: COLORS.orange,
          icon: "storefront-outline",
        };
      case "purchasing":
        return {
          title: "Buying your items",
          message: "Your driver is currently buying your requested items.",
          color: COLORS.orange,
          icon: "basket-outline",
        };
      case "purchased":
        return {
          title: "Items purchased",
          message: "Your items have been purchased and are ready for delivery.",
          color: COLORS.blue,
          icon: "bag-handle-outline",
        };
      case "delivering":
        return {
          title: "Delivering to you",
          message: "Your driver is now on the way to deliver your items.",
          color: COLORS.green,
          icon: "bicycle-outline",
        };
      case "delivered":
        return {
          title: "Delivered",
          message: "Your items were delivered.",
          color: COLORS.green,
          icon: "checkmark-done-outline",
        };
      case "completed":
        return {
          title: "Pabili completed",
          message: "Your pabili request is complete.",
          color: COLORS.green,
          icon: "checkmark-circle",
        };
      case "cancelled":
        return {
          title: "Pabili cancelled",
          message: "This pabili booking was cancelled.",
          color: COLORS.red,
          icon: "close-circle",
        };
      default:
        return {
          title: "Looking for updates",
          message: "We are waiting for updates on your pabili request.",
          color: COLORS.yellow,
          icon: "time-outline",
        };
    }
  }

  return {
    title: "Tracking booking",
    message: "Tracking active booking.",
    color: COLORS.navy,
    icon: "information-circle-outline",
  };
}

function getBookingSnapshot(booking) {
  if (!booking) return "";
  return JSON.stringify({
    id: booking.id,
    status: booking.status,
    service_status: booking.service_status,
    payment_status: booking.payment_status,
    driver_id: booking.driver_id,
    ride_started_at: booking.ride_started_at,
    driver_arrived_at: booking.driver_arrived_at,
    delivered_at: booking.delivered_at,
    purchased_at: booking.purchased_at,
    pickup_location: booking.pickup_location,
    dropoff_location: booking.dropoff_location,
    store_name: booking.store_name,
    item_name: booking.item_name,
    item_description: booking.item_description,
    buyer_name: booking.buyer_name,
    fare: booking.fare,
    updated_at: booking.updated_at,
    driver_first_name: booking.drivers?.first_name,
    driver_last_name: booking.drivers?.last_name,
    driver_phone: booking.drivers?.phone,
    driver_profile_picture: booking.drivers?.profile_picture,
    commuter_rating: booking.commuter_rating,
  });
}

function getLocationSnapshot(location) {
  if (!location) return "";
  return `${location.latitude}|${location.longitude}`;
}

function StatusChip({ color, text }) {
  return (
    <View
      style={[
        styles.statusChip,
        {
          backgroundColor: `${color}18`,
          borderColor: `${color}40`,
        },
      ]}
    >
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={[styles.statusChipText, { color }]}>{String(text || "-")}</Text>
    </View>
  );
}

function InfoRow({ label, value }) {
  if (value === undefined || value === null || value === "") return null;

  return (
    <View style={styles.infoRowCard}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{String(value)}</Text>
    </View>
  );
}

function QuickActionButton({
  icon,
  label,
  onPress,
  color = COLORS.navy,
  disabled = false,
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.quickActionBtn,
        disabled && { opacity: 0.45 },
        pressed && !disabled && { transform: [{ scale: 0.98 }] },
      ]}
    >
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.quickActionBtnText, { color }]}>{label}</Text>
    </Pressable>
  );
}

function DraggableBottomSheet({
  stageMeta,
  booking,
  driver,
  canCallDriver,
  handleCallDriver,
  handleRefresh,
  estimatedTime,
  estimatedDistance,
  isPabili,
  lastUpdatedLabel,
  isRefreshing,
  children,
  bottomOffset = 0,
}) {
  const COLLAPSED_HEIGHT = isSmallDevice ? 250 : 270;
  const EXPANDED_TOP = isSmallDevice ? 96 : 112;
  const AVAILABLE_HEIGHT = screenHeight - bottomOffset;

  const collapsedY = Math.max(
    AVAILABLE_HEIGHT - COLLAPSED_HEIGHT,
    EXPANDED_TOP + 120
  );
  const expandedY = EXPANDED_TOP;

  const translateY = useRef(new Animated.Value(collapsedY)).current;
  const lastValueRef = useRef(collapsedY);
  const scrollEnabledRef = useRef(false);

  const [expanded, setExpanded] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(false);

  useEffect(() => {
    translateY.setValue(collapsedY);
    lastValueRef.current = collapsedY;
    setExpanded(false);
    setScrollEnabled(false);
    scrollEnabledRef.current = false;
  }, [collapsedY, translateY]);

  useEffect(() => {
    const id = translateY.addListener(({ value }) => {
      lastValueRef.current = value;
    });
    return () => translateY.removeListener(id);
  }, [translateY]);

  const snapTo = useCallback(
    (toValue) => {
      Animated.spring(translateY, {
        toValue,
        useNativeDriver: true,
        damping: 22,
        stiffness: 220,
        mass: 0.9,
      }).start(() => {
        const isExpandedNow = toValue === expandedY;
        setExpanded(isExpandedNow);
        setScrollEnabled(isExpandedNow);
        scrollEnabledRef.current = isExpandedNow;
      });
    },
    [expandedY, translateY]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
          if (scrollEnabledRef.current) {
            if (gesture.dy > 8) return true;
            return false;
          }
          return Math.abs(gesture.dy) > 6;
        },
        onPanResponderGrant: () => {
          translateY.stopAnimation((value) => {
            lastValueRef.current = value;
          });
        },
        onPanResponderMove: (_, gesture) => {
          let next = lastValueRef.current + gesture.dy;
          if (next < expandedY) next = expandedY;
          if (next > collapsedY) next = collapsedY;
          translateY.setValue(next);
        },
        onPanResponderRelease: (_, gesture) => {
          const currentY = lastValueRef.current + gesture.dy;
          const midpoint = (collapsedY + expandedY) / 2;

          if (gesture.vy > 0.9) {
            snapTo(collapsedY);
            return;
          }

          if (gesture.vy < -0.9) {
            snapTo(expandedY);
            return;
          }

          if (currentY < midpoint) snapTo(expandedY);
          else snapTo(collapsedY);
        },
        onPanResponderTerminate: () => {
          const midpoint = (collapsedY + expandedY) / 2;
          snapTo(lastValueRef.current < midpoint ? expandedY : collapsedY);
        },
      }),
    [collapsedY, expandedY, snapTo, translateY]
  );

  return (
    <Animated.View
      style={[
        styles.bottomSheet,
        {
          bottom: bottomOffset,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={styles.sheetTopArea} {...panResponder.panHandlers}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetHeaderTitle}>{stageMeta.title}</Text>
            <Text style={styles.sheetHeaderSub}>
              {expanded ? "Drag down to minimize" : "Drag up for more details"}
            </Text>
          </View>
          <StatusChip
            color={stageMeta.color}
            text={booking?.payment_status || booking?.status || "pending"}
          />
        </View>
      </View>

      <View style={styles.sheetStickyArea}>
        <View style={styles.statusCardCompact}>
          <View
            style={[
              styles.statusIconWrap,
              { backgroundColor: `${stageMeta.color}18` },
            ]}
          >
            <Ionicons name={stageMeta.icon} size={20} color={stageMeta.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>{stageMeta.title}</Text>
            <Text style={styles.statusDescription} numberOfLines={2}>
              {stageMeta.message}
            </Text>
          </View>
        </View>

        <View style={styles.floatingSummaryInline}>
          <View style={styles.floatingPillInline}>
            <Ionicons name="time-outline" size={14} color={COLORS.navy} />
            <Text style={styles.floatingPillText}>
              {estimatedTime ? `${estimatedTime} min` : "--"}
            </Text>
          </View>

          <View style={styles.floatingPillInline}>
            <Ionicons name="map-outline" size={14} color={COLORS.navy} />
            <Text style={styles.floatingPillText}>
              {estimatedDistance ? `${estimatedDistance} km` : "--"}
            </Text>
          </View>

          <View style={styles.floatingPillInline}>
            <Ionicons name="cash-outline" size={14} color={COLORS.green} />
            <Text style={[styles.floatingPillText, { color: COLORS.green }]}>
              {formatAmount(booking?.fare || 0)}
            </Text>
          </View>
        </View>

        <View style={styles.driverCompactRow}>
          {driver?.profile_picture ? (
            <Image source={{ uri: driver.profile_picture }} style={styles.avatarSmall} />
          ) : (
            <View style={styles.avatarFallbackSmall}>
              <Ionicons name="person" size={18} color={COLORS.gray400} />
            </View>
          )}

          <View style={{ flex: 1 }}>
            <Text style={styles.driverNameSmall}>
              {driver?.first_name || "Driver"} {driver?.last_name || ""}
            </Text>
            <Text style={styles.driverSubSmall}>
              {isPabili ? "Assigned pabili driver" : "Assigned ride driver"}
            </Text>
            <Text style={styles.updatedText}>
              {isRefreshing ? "Checking updates..." : lastUpdatedLabel || "Waiting for updates"}
            </Text>
          </View>

          <Pressable
            style={[styles.callBtn, !canCallDriver && styles.callBtnDisabled]}
            onPress={handleCallDriver}
            disabled={!canCallDriver}
          >
            <Ionicons name="call-outline" size={18} color={COLORS.white} />
            <Text style={styles.callBtnText}>Call</Text>
          </Pressable>
        </View>

        <View style={styles.quickActionRow}>
          <QuickActionButton
            icon={isRefreshing ? "sync-outline" : "refresh-outline"}
            label={isRefreshing ? "Checking..." : "Check Updates"}
            onPress={handleRefresh}
            disabled={isRefreshing}
          />
          <QuickActionButton
            icon="navigate-outline"
            label={isPabili ? "Store" : "Pickup"}
            onPress={async () => {
              const lat = Number(booking?.pickup_latitude);
              const lng = Number(booking?.pickup_longitude);
              if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

              const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
              try {
                await Linking.openURL(url);
              } catch {}
            }}
          />
        </View>
      </View>

      <ScrollView
        style={styles.sheetScroll}
        contentContainerStyle={styles.sheetScrollContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={scrollEnabled}
      >
        {children}
      </ScrollView>
    </Animated.View>
  );
}

export default function CommuterTrackRidesScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);

  const bookingChannelRef = useRef(null);
  const driverLocationChannelRef = useRef(null);
  const pollingRef = useRef(null);
  const realtimeFetchDebounceRef = useRef(null);

  const mountedRef = useRef(true);
  const fetchingRef = useRef(false);
  const resolvingRef = useRef(false);
  const screenFocusedRef = useRef(false);
  const lastFitKeyRef = useRef(null);
  const lastFetchAtRef = useRef(0);
  const lastBookingSnapshotRef = useRef("");
  const lastLocationSnapshotRef = useRef("");
  const hasOpenedRatingRef = useRef(false);

  const googleApiKey = Constants.expoConfig?.extra?.GOOGLE_API_KEY;
  const routeBookingId = route.params?.bookingId ?? null;

  const [trackedBookingId, setTrackedBookingId] = useState(routeBookingId);
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);

  const [booking, setBooking] = useState(null);
  const [driver, setDriver] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [estimatedTime, setEstimatedTime] = useState(null);
  const [estimatedDistance, setEstimatedDistance] = useState(null);
  const [errorText, setErrorText] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  const bottomSheetBottomOffset = Math.max(insets.bottom + 50, 60);
  const floatingTop = insets.top + 10;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (routeBookingId && routeBookingId !== trackedBookingId) {
      setTrackedBookingId(routeBookingId);
    }
  }, [routeBookingId, trackedBookingId]);

  const isRide = booking?.booking_type === "ride";
  const isPabili = booking?.booking_type === "pabili";

  const rideStage = useMemo(() => getRideStage(booking), [booking]);
  const pabiliStage = useMemo(() => getPabiliStage(booking), [booking]);

  const stageMeta = useMemo(
    () => getStageMeta({ isRide, isPabili, rideStage, pabiliStage }),
    [isRide, isPabili, rideStage, pabiliStage]
  );

  const isCompletedRide =
    booking?.booking_type === "ride" &&
    String(booking?.status || "").toLowerCase().trim() === "completed";

  const alreadyRated = !!booking?.commuter_rating;

  const shouldShowRateDriver =
    isCompletedRide &&
    !!booking?.id &&
    !!booking?.driver_id &&
    !alreadyRated;

  const pickupCoordinate = useMemo(
    () => toCoordinate(booking?.pickup_latitude, booking?.pickup_longitude),
    [booking?.pickup_latitude, booking?.pickup_longitude]
  );

  const dropoffCoordinate = useMemo(
    () => toCoordinate(booking?.dropoff_latitude, booking?.dropoff_longitude),
    [booking?.dropoff_latitude, booking?.dropoff_longitude]
  );

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdatedAt) return "";
    const seconds = Math.max(0, Math.round((Date.now() - lastUpdatedAt) / 1000));
    if (seconds < 10) return "Updated just now";
    if (seconds < 60) return `Updated ${seconds}s ago`;
    const mins = Math.floor(seconds / 60);
    return `Updated ${mins}m ago`;
  }, [lastUpdatedAt]);

  const safeSetState = useCallback((setter, value) => {
    if (mountedRef.current) setter(value);
  }, []);

  const applyBookingState = useCallback(
    (data) => {
      const nextBooking = data || null;
      const nextSnapshot = getBookingSnapshot(nextBooking);

      if (lastBookingSnapshotRef.current !== nextSnapshot) {
        lastBookingSnapshotRef.current = nextSnapshot;
        safeSetState(setBooking, nextBooking);
        safeSetState(setDriver, nextBooking?.drivers || null);
        safeSetState(setLastUpdatedAt, Date.now());
      }
    },
    [safeSetState]
  );

  const applyDriverLocationState = useCallback(
    (location) => {
      const nextLocation = location || null;
      const nextSnapshot = getLocationSnapshot(nextLocation);

      if (lastLocationSnapshotRef.current !== nextSnapshot) {
        lastLocationSnapshotRef.current = nextSnapshot;
        safeSetState(setDriverLocation, nextLocation);
      }
    },
    [safeSetState]
  );

  const resetMapState = useCallback(() => {
    applyDriverLocationState(null);
    safeSetState(setRouteCoordinates, []);
    safeSetState(setEstimatedDistance, null);
    safeSetState(setEstimatedTime, null);
    lastFitKeyRef.current = null;
  }, [safeSetState, applyDriverLocationState]);

  const getCurrentUserId = useCallback(async () => {
    try {
      let userId = await AsyncStorage.getItem("user_id");
      if (userId) return userId;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user?.id) return session.user.id;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) return user.id;

      return null;
    } catch (error) {
      logStep("Error getting user ID", error);
      return null;
    }
  }, []);

  const fetchDriverLocation = useCallback(
    async (driverId) => {
      if (!driverId) {
        applyDriverLocationState(null);
        return;
      }

      const { data, error } = await supabase
        .from("driver_locations")
        .select("latitude, longitude, last_updated")
        .eq("driver_id", driverId)
        .maybeSingle();

      if (error) {
        applyDriverLocationState(null);
        return;
      }

      const location = toCoordinate(data?.latitude, data?.longitude);
      applyDriverLocationState(location);
    },
    [applyDriverLocationState]
  );

  const fetchBookingById = useCallback(async (bookingId) => {
    if (!bookingId) return null;

    const { data, error } = await supabase
      .from("bookings")
      .select(`
        *,
        drivers (
          id,
          first_name,
          last_name,
          phone,
          profile_picture
        )
      `)
      .eq("id", bookingId)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }, []);

  const debugBookings = useCallback(async () => {
    try {
      const userId = await getCurrentUserId();
      if (!userId) return [];

      const { data, error } = await supabase
        .from("bookings")
        .select("id, status, service_status, payment_status, booking_type, created_at, commuter_rating")
        .eq("commuter_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      logStep("debugBookings", data);
      return data;
    } catch (error) {
      console.error("Debug error:", error);
      return [];
    }
  }, [getCurrentUserId]);

  const resolveLatestActiveBooking = useCallback(async () => {
    if (resolvingRef.current) return null;
    resolvingRef.current = true;

    try {
      const userId = await getCurrentUserId();
      if (!userId) return null;

      const { data, error } = await supabase
        .from("bookings")
        .select(`
          *,
          drivers (
            id,
            first_name,
            last_name,
            phone,
            profile_picture
          )
        `)
        .eq("commuter_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) return null;
      if (!data?.length) return null;

      const latestActive = data.find((row) => isActiveBooking(row));
      return latestActive || null;
    } catch {
      return null;
    } finally {
      resolvingRef.current = false;
    }
  }, [getCurrentUserId]);

  const syncLatestActiveBooking = useCallback(async () => {
    const latest = await resolveLatestActiveBooking();

    if (!latest) {
      applyBookingState(null);
      resetMapState();
      return null;
    }

    if (latest.id !== trackedBookingId) {
      safeSetState(setTrackedBookingId, latest.id);
      applyBookingState(latest);
      await fetchDriverLocation(latest.driver_id);
      return latest;
    }

    return latest;
  }, [
    trackedBookingId,
    resolveLatestActiveBooking,
    safeSetState,
    applyBookingState,
    fetchDriverLocation,
    resetMapState,
  ]);

  const fetchBooking = useCallback(
    async (options = {}) => {
      const silent = options.silent === true;
      const forceRefresh = options.forceRefresh === true;
      const manual = options.manual === true;

      const now = Date.now();
      if (!forceRefresh && now - lastFetchAtRef.current < 2500) {
        return;
      }

      if (fetchingRef.current) return;
      fetchingRef.current = true;
      lastFetchAtRef.current = now;

      try {
        if (!silent) {
          safeSetState(setIsRefreshing, true);
        }

        safeSetState(setErrorText, "");

        let bookingToUse = null;

        if (routeBookingId) {
          const routeBooking = await fetchBookingById(routeBookingId);

          const canUseRouteBooking =
            routeBooking &&
            (isActiveBooking(routeBooking) ||
              (
                routeBooking?.booking_type === "ride" &&
                String(routeBooking?.status || "").toLowerCase().trim() === "completed" &&
                !routeBooking?.commuter_rating &&
                !!routeBooking?.driver_id
              ));

          if (canUseRouteBooking) {
            bookingToUse = routeBooking;
            safeSetState(setTrackedBookingId, routeBooking.id);
          }
        }

        if (!bookingToUse) {
          const latest = await syncLatestActiveBooking();
          if (latest) bookingToUse = latest;
        }

        if (!bookingToUse && trackedBookingId) {
          const tracked = await fetchBookingById(trackedBookingId);
          const isCompletedRideWaitingForRating =
            tracked?.booking_type === "ride" &&
            String(tracked?.status || "").toLowerCase().trim() === "completed" &&
            !tracked?.commuter_rating &&
            !!tracked?.driver_id;

          if (isCompletedRideWaitingForRating) {
            bookingToUse = tracked;
          }
        }

        if (!bookingToUse) {
          applyBookingState(null);
          resetMapState();
          return;
        }

        const bookingIdToUse = bookingToUse.id || trackedBookingId;

        if (!bookingIdToUse) {
          applyBookingState(null);
          resetMapState();
          return;
        }

        const freshBooking = await fetchBookingById(bookingIdToUse);

        if (!freshBooking) {
          applyBookingState(null);
          resetMapState();
          return;
        }

        if (!isActiveBooking(freshBooking)) {
          const isFreshCompletedRideWaitingForRating =
            freshBooking?.booking_type === "ride" &&
            String(freshBooking?.status || "").toLowerCase().trim() === "completed" &&
            !freshBooking?.commuter_rating &&
            !!freshBooking?.driver_id;

          if (isFreshCompletedRideWaitingForRating) {
            applyBookingState(freshBooking);
            resetMapState();
            return;
          }

          const latestAgain = await resolveLatestActiveBooking();

          if (latestAgain && latestAgain.id !== freshBooking.id) {
            safeSetState(setTrackedBookingId, latestAgain.id);
            applyBookingState(latestAgain);
            await fetchDriverLocation(latestAgain.driver_id);
            return;
          }

          applyBookingState(null);
          resetMapState();
          return;
        }

        applyBookingState(freshBooking);
        await fetchDriverLocation(freshBooking.driver_id);

        if (manual) {
          safeSetState(setLastUpdatedAt, Date.now());
        }
      } catch (error) {
        const message = error?.message || "Failed to load booking.";
        safeSetState(setErrorText, message);
      } finally {
        fetchingRef.current = false;
        safeSetState(setLoading, false);
        safeSetState(setIsRefreshing, false);
      }
    },
    [
      trackedBookingId,
      routeBookingId,
      safeSetState,
      syncLatestActiveBooking,
      fetchBookingById,
      applyBookingState,
      fetchDriverLocation,
      resetMapState,
      resolveLatestActiveBooking,
    ]
  );

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

        if (data.status !== "OK" || !data.routes?.[0]) {
          logStep("Directions failed", data);
          return null;
        }

        const routeData = data.routes[0];
        const leg = routeData.legs?.[0];

        return {
          points: decodePolyline(routeData?.overview_polyline?.points),
          distanceKm: leg?.distance?.value
            ? (leg.distance.value / 1000).toFixed(1)
            : null,
          durationMin: leg?.duration?.value
            ? Math.round(leg.duration.value / 60)
            : null,
        };
      } catch (error) {
        logStep("calculateDirections error", error);
        return null;
      }
    },
    [googleApiKey]
  );

  const fitMapToRoute = useCallback(
    (pointsArg = null) => {
      if (!mapRef.current || !mapReady) return;

      const coords = [];
      const pointsToUse = Array.isArray(pointsArg) ? pointsArg : [];

      if (pointsToUse.length > 0) {
        coords.push(...pointsToUse);
      } else {
        if (driverLocation) coords.push(driverLocation);
        if (pickupCoordinate) coords.push(pickupCoordinate);
        if (dropoffCoordinate) coords.push(dropoffCoordinate);
      }

      const filtered = coords.filter(
        (c) =>
          c &&
          Number.isFinite(Number(c.latitude)) &&
          Number.isFinite(Number(c.longitude))
      );

      if (!filtered.length) return;

      mapRef.current.fitToCoordinates(filtered, {
        edgePadding: {
          top: isTablet ? 110 : 90,
          right: isTablet ? 90 : 65,
          left: isTablet ? 90 : 65,
          bottom: (isTablet ? 470 : 380) + Math.max(bottomSheetBottomOffset, 0) + insets.bottom,
        },
        animated: true,
      });
    },
    [
      mapReady,
      driverLocation,
      pickupCoordinate,
      dropoffCoordinate,
      bottomSheetBottomOffset,
      insets.bottom,
    ]
  );

  useFocusEffect(
    useCallback(() => {
      screenFocusedRef.current = true;

      const shouldFetchNow =
        !lastFetchAtRef.current || Date.now() - lastFetchAtRef.current > 8000;

      if (shouldFetchNow) {
        fetchBooking({ forceRefresh: true });
      }

      pollingRef.current && clearInterval(pollingRef.current);
      pollingRef.current = setInterval(() => {
        if (screenFocusedRef.current && !fetchingRef.current) {
          fetchBooking({ silent: true });
        }
      }, 30000);

      return () => {
        screenFocusedRef.current = false;
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      };
    }, [fetchBooking])
  );

  useEffect(() => {
    if (!trackedBookingId) return;

    bookingChannelRef.current?.unsubscribe?.();

    bookingChannelRef.current = supabase
      .channel(`commuter-booking-${trackedBookingId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `id=eq.${trackedBookingId}`,
        },
        async () => {
          if (realtimeFetchDebounceRef.current) {
            clearTimeout(realtimeFetchDebounceRef.current);
          }

          realtimeFetchDebounceRef.current = setTimeout(() => {
            fetchBooking({ silent: true, forceRefresh: true });
          }, 700);
        }
      )
      .subscribe();

    return () => {
      bookingChannelRef.current?.unsubscribe?.();
      bookingChannelRef.current = null;
      if (realtimeFetchDebounceRef.current) {
        clearTimeout(realtimeFetchDebounceRef.current);
        realtimeFetchDebounceRef.current = null;
      }
    };
  }, [trackedBookingId, fetchBooking]);

  useEffect(() => {
    driverLocationChannelRef.current?.unsubscribe?.();

    if (!booking?.driver_id) return;

    driverLocationChannelRef.current = supabase
      .channel(`commuter-driver-location-${booking.driver_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "driver_locations",
          filter: `driver_id=eq.${booking.driver_id}`,
        },
        async (payload) => {
          const location = toCoordinate(payload?.new?.latitude, payload?.new?.longitude);
          if (location) {
            applyDriverLocationState(location);
          } else {
            await fetchDriverLocation(booking.driver_id);
          }
        }
      )
      .subscribe();

    return () => {
      driverLocationChannelRef.current?.unsubscribe?.();
      driverLocationChannelRef.current = null;
    };
  }, [booking?.driver_id, fetchDriverLocation, applyDriverLocationState]);

  useEffect(() => {
    const recalc = async () => {
      if (!booking || !driverLocation) {
        safeSetState(setRouteCoordinates, []);
        safeSetState(setEstimatedDistance, null);
        safeSetState(setEstimatedTime, null);
        return;
      }

      let target = null;

      if (booking.booking_type === "ride") {
        target = !booking.ride_started_at
          ? toCoordinate(booking.pickup_latitude, booking.pickup_longitude)
          : toCoordinate(booking.dropoff_latitude, booking.dropoff_longitude);
      } else if (booking.booking_type === "pabili") {
        const stage = getPabiliStage(booking);
        const goingToCustomer = ["purchased", "delivering", "delivered", "completed"].includes(stage);

        target = goingToCustomer
          ? toCoordinate(booking.dropoff_latitude, booking.dropoff_longitude)
          : toCoordinate(booking.pickup_latitude, booking.pickup_longitude);
      }

      if (!target) {
        safeSetState(setRouteCoordinates, []);
        safeSetState(setEstimatedDistance, null);
        safeSetState(setEstimatedTime, null);
        return;
      }

      const result = await calculateDirections(driverLocation, target);

      if (!result) {
        safeSetState(setRouteCoordinates, []);
        safeSetState(setEstimatedDistance, null);
        safeSetState(setEstimatedTime, null);
        return;
      }

      const nextPoints = result.points || [];

      safeSetState(setRouteCoordinates, nextPoints);
      safeSetState(setEstimatedDistance, result.distanceKm);
      safeSetState(setEstimatedTime, result.durationMin);

      const fitKey = `${booking.id}-${driverLocation.latitude}-${driverLocation.longitude}-${target.latitude}-${target.longitude}-${nextPoints.length}`;

      if (lastFitKeyRef.current !== fitKey) {
        lastFitKeyRef.current = fitKey;
        requestAnimationFrame(() => {
          setTimeout(() => {
            fitMapToRoute(nextPoints);
          }, 180);
        });
      }
    };

    recalc();
  }, [booking, driverLocation, calculateDirections, safeSetState, fitMapToRoute]);

  const canCallDriver = !!driver?.phone;

  const handleCallDriver = useCallback(async () => {
    if (!driver?.phone) {
      Alert.alert("Driver phone unavailable", "No phone number found for this driver.");
      return;
    }

    try {
      await Linking.openURL(`tel:${driver.phone}`);
    } catch {
      Alert.alert("Unable to call", "Could not open the dialer right now.");
    }
  }, [driver?.phone]);

  const handleRefresh = useCallback(() => {
    fetchBooking({ forceRefresh: true, manual: true });
    debugBookings();
  }, [fetchBooking, debugBookings]);

  const handleOpenRateDriver = useCallback(() => {
    if (!booking?.id || !booking?.driver_id) {
      Alert.alert("Unable to rate", "Missing booking or driver information.");
      return;
    }

    navigation.navigate("RateRide", {
      bookingId: booking.id,
      driverId: booking.driver_id,
    });
  }, [navigation, booking?.id, booking?.driver_id]);

  useEffect(() => {
    if (!shouldShowRateDriver) {
      hasOpenedRatingRef.current = false;
      return;
    }

    if (hasOpenedRatingRef.current) return;

    hasOpenedRatingRef.current = true;

    Alert.alert(
      "Trip Completed",
      "Your trip is complete. Would you like to rate your driver now?",
      [
        { text: "Later", style: "cancel" },
        { text: "Rate Now", onPress: handleOpenRateDriver },
      ]
    );
  }, [shouldShowRateDriver, handleOpenRateDriver]);

  if (loading && !booking) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.centerState}>
          <View style={styles.loadingBadge}>
            <ActivityIndicator size="large" color={COLORS.navy} />
          </View>
          <Text style={styles.centerTitle}>Loading booking...</Text>
          <Text style={styles.centerSubtitle}>
            Please wait while we fetch your latest booking details.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!booking) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.centerState}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="receipt-outline" size={36} color={COLORS.gray500} />
          </View>
          <Text style={styles.centerTitle}>No active booking found</Text>
          <Text style={styles.centerSubtitle}>
            Lalabas lang dito ang booking kapag accepted na o paid na.
          </Text>

          <Pressable style={styles.primaryButton} onPress={handleRefresh}>
            <Ionicons name="refresh-outline" size={18} color={COLORS.white} />
            <Text style={styles.primaryButtonText}>Check Updates</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.gray50 }}>
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.mapFullWrap}>
            <MapView
              ref={mapRef}
              provider={PROVIDER_GOOGLE}
              style={StyleSheet.absoluteFillObject}
              initialRegion={DEFAULT_REGION}
              onMapReady={() => {
                setMapReady(true);
                setTimeout(() => fitMapToRoute(routeCoordinates), 250);
              }}
              showsCompass
              rotateEnabled
              pitchEnabled
            >
              {!!driverLocation && (
                <Marker coordinate={driverLocation}>
                  <View
                    style={[
                      styles.driverMarker,
                      { backgroundColor: isPabili ? COLORS.orange : COLORS.navy },
                    ]}
                  >
                    <Ionicons
                      name={isPabili ? "bicycle-outline" : "car"}
                      size={18}
                      color={COLORS.white}
                    />
                  </View>
                </Marker>
              )}

              {!!pickupCoordinate && (
                <Marker coordinate={pickupCoordinate}>
                  <View
                    style={[
                      styles.pinMarker,
                      { backgroundColor: isPabili ? COLORS.orange : COLORS.green },
                    ]}
                  >
                    <Ionicons
                      name={isPabili ? "storefront-outline" : "location-outline"}
                      size={16}
                      color={COLORS.white}
                    />
                  </View>
                </Marker>
              )}

              {!!dropoffCoordinate && (
                <Marker coordinate={dropoffCoordinate}>
                  <View style={[styles.pinMarker, { backgroundColor: COLORS.red }]}>
                    <Ionicons name="home-outline" size={16} color={COLORS.white} />
                  </View>
                </Marker>
              )}

              {routeCoordinates.length > 0 && (
                <Polyline
                  coordinates={routeCoordinates}
                  strokeWidth={5}
                  strokeColor={isPabili ? COLORS.orange : COLORS.navy}
                  lineCap="round"
                  lineJoin="round"
                />
              )}
            </MapView>

            <View style={[styles.floatingTopRight, { top: floatingTop }]}>
              <Pressable
                style={styles.floatingIconBtn}
                onPress={() => fitMapToRoute(routeCoordinates)}
              >
                <Ionicons name="scan-outline" size={21} color={COLORS.gray800} />
              </Pressable>
            </View>
          </View>

          <DraggableBottomSheet
            stageMeta={stageMeta}
            booking={booking}
            driver={driver}
            canCallDriver={canCallDriver}
            handleCallDriver={handleCallDriver}
            handleRefresh={handleRefresh}
            estimatedTime={estimatedTime}
            estimatedDistance={estimatedDistance}
            isPabili={isPabili}
            lastUpdatedLabel={lastUpdatedLabel}
            isRefreshing={isRefreshing}
            bottomOffset={bottomSheetBottomOffset}
          >
            {!!errorText && (
              <View style={styles.errorCard}>
                <Ionicons name="alert-circle-outline" size={18} color={COLORS.red} />
                <Text style={styles.errorText}>{errorText}</Text>
              </View>
            )}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Trip details</Text>

              <View style={styles.infoGrid}>
                <InfoRow
                  label={isPabili ? "Store" : "Pickup"}
                  value={booking?.pickup_location || "-"}
                />
                <InfoRow
                  label={isPabili ? "Delivery Address" : "Drop-off"}
                  value={booking?.dropoff_location || "-"}
                />
                <InfoRow label="Booking Ref" value={booking?.booking_reference || booking?.id} />
                <InfoRow label="Payment" value={booking?.payment_status || "-"} />
                <InfoRow label="Status" value={booking?.status || "-"} />
                {isPabili && <InfoRow label="Store Name" value={booking?.store_name} />}
                {isPabili && <InfoRow label="Item" value={booking?.item_name} />}
                {isPabili && (
                  <InfoRow label="Item Description" value={booking?.item_description} />
                )}
                {isPabili && <InfoRow label="Buyer" value={booking?.buyer_name} />}
              </View>
            </View>

            {shouldShowRateDriver && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Trip completed</Text>
                <Text style={styles.completeHelperText}>
                  Your trip is complete. Please rate your driver.
                </Text>

                <Pressable style={styles.rateDriverBtn} onPress={handleOpenRateDriver}>
                  <Ionicons name="star" size={18} color={COLORS.white} />
                  <Text style={styles.rateDriverBtnText}>Rate Driver</Text>
                </Pressable>
              </View>
            )}

            {isCompletedRide && alreadyRated && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Thank you</Text>
                <View style={styles.ratedBox}>
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.green} />
                  <Text style={styles.ratedText}>You already rated this driver.</Text>
                </View>
              </View>
            )}

            <View style={styles.bottomSpacer} />
          </DraggableBottomSheet>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    marginTop: -50,
    flex: 1,
    backgroundColor: COLORS.gray50,
  },

  container: {
    flex: 1,
    backgroundColor: COLORS.gray50,
  },

  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },

  loadingBadge: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.white,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },

  emptyIconWrap: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.white,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },

  centerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.gray800,
    textAlign: "center",
  },

  centerSubtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.gray600,
    textAlign: "center",
    marginBottom: 20,
  },

  primaryButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: COLORS.navy,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  primaryButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "800",
  },

  mapFullWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.gray100,
  },

  floatingTopRight: {
    position: "absolute",
    right: 16,
    zIndex: 30,
  },

  floatingIconBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.96)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.black,
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },

  bottomSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    justifyContent: "flex-end",
  },

  sheetTopArea: {
    backgroundColor: COLORS.white,
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
    elevation: 12,
  },

  sheetHandle: {
    alignSelf: "center",
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: COLORS.gray300,
    marginBottom: 12,
  },

  sheetHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  sheetHeaderTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: COLORS.gray800,
  },

  sheetHeaderSub: {
    marginTop: 2,
    fontSize: 13,
    color: COLORS.gray500,
    fontWeight: "600",
  },

  sheetStickyArea: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },

  sheetScroll: {
    flex: 1,
    backgroundColor: COLORS.gray50,
    maxHeight: screenHeight * 0.74,
  },

  sheetScrollContent: {
    paddingTop: 14,
    paddingBottom: 26,
  },

  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },

  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },

  statusChipText: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "capitalize",
  },

  statusCardCompact: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    marginBottom: 10,
  },

  statusIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  statusTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.gray800,
    marginBottom: 3,
  },

  statusDescription: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.gray600,
  },

  floatingSummaryInline: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },

  floatingPillInline: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: COLORS.gray50,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },

  floatingPillText: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.gray800,
  },

  driverCompactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },

  avatarSmall: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.gray200,
  },

  avatarFallbackSmall: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.gray100,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },

  driverNameSmall: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.gray800,
  },

  driverSubSmall: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: 2,
  },

  updatedText: {
    marginTop: 3,
    fontSize: 11,
    color: COLORS.gray500,
    fontWeight: "700",
  },

  callBtn: {
    minWidth: 74,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.green,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    flexDirection: "row",
    gap: 6,
  },

  callBtnDisabled: {
    backgroundColor: COLORS.gray400,
  },

  callBtnText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "800",
  },

  quickActionRow: {
    flexDirection: "row",
    gap: 8,
  },

  quickActionBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: COLORS.gray50,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 8,
  },

  quickActionBtnText: {
    fontSize: 13,
    fontWeight: "800",
  },

  driverMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: COLORS.white,
  },

  pinMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.white,
  },

  errorCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 16,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  errorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.red,
    fontWeight: "600",
  },

  card: {
    marginHorizontal: 16,
    marginBottom: 70,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },

  cardTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.gray800,
    marginBottom: 12,
  },

  infoGrid: {
    gap: 10,
  },

  infoRowCard: {
    borderRadius: 14,
    backgroundColor: COLORS.gray50,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },

  infoLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.gray500,
    textTransform: "uppercase",
    marginBottom: 4,
    letterSpacing: 0.3,
  },

  infoValue: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.gray800,
    fontWeight: "600",
  },

  completeHelperText: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.gray600,
    marginTop: 2,
    marginBottom: 14,
  },

  rateDriverBtn: {
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: COLORS.orange,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  rateDriverBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.white,
  },

  ratedBox: {
    borderRadius: 14,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  ratedText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.green,
    fontWeight: "700",
  },

  bottomSpacer: {
    height: 40,
  },
});