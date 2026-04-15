// screens/commuter/CommuterTrackRideScreen.js
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator,
  Alert, Linking, Platform, Image, ScrollView,
  Dimensions, Animated, PanResponder, StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import Constants from "expo-constants";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";

const { width, height } = Dimensions.get("window");

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  navy:      "#183B5C",
  navyLight: "#1E4A72",
  navyDark:  "#0F2740",
  amber:     "#FF8F00",
  amberDark: "#E07800",
  white:     "#FFFFFF",
  offWhite:  "#F6F8FA",
  surface:   "#FFFFFF",
  border:    "#E8ECF0",
  text:      "#0F2740",
  textSub:   "#5A6B7A",
  textHint:  "#9AAABB",
  green:     "#00B67A",
  red:       "#E53935",
  overlay:   "rgba(15,39,64,0.5)",
};

const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };
const R = { sm: 6, md: 10, lg: 14, xl: 20, xxl: 24, full: 999 };
const F = {
  xs:  Math.round(11 * (width / 390)),
  sm:  Math.round(13 * (width / 390)),
  md:  Math.round(15 * (width / 390)),
  lg:  Math.round(17 * (width / 390)),
  xl:  Math.round(20 * (width / 390)),
  xxl: Math.round(24 * (width / 390)),
};
const TOUCH = Math.round(44 * (width / 390));
const IC    = (n) => Math.round(n * (width / 390));

// Sheet snap points
const SNAP_TOP      = 0;
const SNAP_EXPANDED = height * 0.10;
const SNAP_DEFAULT  = height * 0.45;
const SNAP_BOTTOM   = height * 0.65;

// Animation constants for smoother drag
const SNAP_TENSION = 120;
const SNAP_FRICTION = 10;

// ─── Shared atoms ────────────────────────────────────────────────────────────
function Avatar({ uri, size = 52, initials = "?" }) {
  return uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View style={[at.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[at.avatarInitial, { fontSize: Math.round(size * 0.36) }]}>{initials}</Text>
    </View>
  );
}

function StatChip({ icon, label, value }) {
  return (
    <View style={at.chip}>
      <Ionicons name={icon} size={IC(16)} color={C.navy} />
      <Text style={at.chipVal}>{value}</Text>
      <Text style={at.chipLabel}>{label}</Text>
    </View>
  );
}

const at = StyleSheet.create({
  avatarFallback: { backgroundColor: C.navy + "18", justifyContent: "center", alignItems: "center" },
  avatarInitial:  { color: C.navy, fontWeight: "700" },
  chip:           { flex: 1, alignItems: "center", paddingVertical: S.sm },
  chipVal:        { fontSize: F.lg, fontWeight: "700", color: C.text, marginTop: 3 },
  chipLabel:      { fontSize: F.xs, color: C.textSub, marginTop: 1 },
});

export default function TrackRide({ navigation, route }) {
  const insets         = useSafeAreaInsets();
  const mapRef         = useRef(null);
  const scanTimeoutRef = useRef(null);
  const pointsAwardedRef          = useRef(false);
  const subscriptionRetryRef      = useRef(null);
  const statusCheckIntervalRef    = useRef(null);
  const completionAlertShownRef   = useRef(false);
  const pointsAlertShownRef       = useRef(false);

  // Animations
  const pulseAnim          = useRef(new Animated.Value(1)).current;
  const sheetY             = useRef(new Animated.Value(SNAP_DEFAULT)).current;
  const lastY              = useRef(SNAP_DEFAULT);
  const velocityRef        = useRef({ x: 0, y: 0 });

  const [bookingId,  setBookingId]  = useState(route.params?.bookingId || null);
  const [driverId,   setDriverId]   = useState(route.params?.driverId  || null);
  const [loading,    setLoading]    = useState(true);
  const [commuterId, setCommuterId] = useState(null);

  const [noRide,          setNoRide]          = useState(false);
  const [showCompleted,   setShowCompleted]   = useState(false);
  const [booking,         setBooking]         = useState(null);
  const [driver,          setDriver]          = useState(null);
  const [driverLocation,  setDriverLocation]  = useState(null);
  const [driverETA,       setDriverETA]       = useState(null);
  const [driverLocLoaded, setDriverLocLoaded] = useState(false);

  const [routeCoords,     setRouteCoords]     = useState([]);
  const [tripCoords,      setTripCoords]      = useState([]);
  const [tripDistance,    setTripDistance]    = useState(null);
  const [tripDuration,    setTripDuration]    = useState(null);

  const [status,         setStatus]         = useState("accepted");
  const [driverArrived,  setDriverArrived]  = useState(false);
  const [rideStarted,    setRideStarted]    = useState(false);
  const [hasRated,       setHasRated]       = useState(false);

  const [permission, requestPermission] = useCameraPermissions();
  const [showScanner,        setShowScanner]        = useState(false);
  const [scanned,            setScanned]            = useState(false);
  const [processingPayment,  setProcessingPayment]  = useState(false);
  const [paymentSuccess,     setPaymentSuccess]     = useState(false);

  const [pointsBalance,   setPointsBalance]   = useState(0);
  const [pointsEarned,    setPointsEarned]    = useState(null);
  const [potentialPoints, setPotentialPoints] = useState(0);
  const [pointsConfig,    setPointsConfig]    = useState({ cashRate: 0.05, walletRate: 0.5, minFare: 20, rounding: "floor" });

  const googleApiKey = Constants.expoConfig?.extra?.GOOGLE_API_KEY;

  // ── Optimized Sheet pan responder for smoother drag ────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to vertical drags
        return Math.abs(gestureState.dy) > 5 && Math.abs(gestureState.dx) < 10;
      },
      onPanResponderGrant: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        // Reset velocity tracking
        velocityRef.current = { x: 0, y: 0 };
        // Stop current animation and record position
        sheetY.stopAnimation((value) => {
          lastY.current = value;
          sheetY.setOffset(value);
          sheetY.setValue(0);
        });
      },
      onPanResponderMove: (_, gestureState) => {
        // Update velocity
        velocityRef.current = {
          x: gestureState.vx,
          y: gestureState.vy,
        };
        
        // Calculate new position with resistance
        let newY = gestureState.dy;
        const currentPos = lastY.current + newY;
        
        // Smooth resistance at edges for better feel
        if (currentPos < SNAP_TOP - 30) {
          const overscroll = SNAP_TOP - 30 - currentPos;
          newY = gestureState.dy - overscroll * 0.2;
        } else if (currentPos > SNAP_BOTTOM + 50) {
          const overscroll = currentPos - (SNAP_BOTTOM + 50);
          newY = gestureState.dy - overscroll * 0.2;
        }
        
        sheetY.setValue(newY);
      },
      onPanResponderRelease: (_, gestureState) => {
        sheetY.flattenOffset();
        const currentY = lastY.current + gestureState.dy;
        const velocity = velocityRef.current.y || gestureState.vy;
        const snapPoints = [SNAP_TOP, SNAP_EXPANDED, SNAP_DEFAULT, SNAP_BOTTOM];
        
        let targetSnap = SNAP_DEFAULT;
        
        // Enhanced velocity-based snapping for smoother feel
        if (Math.abs(velocity) > 0.5) {
          // Fast swipe - snap in direction of swipe
          const isFlickUp = velocity < -0.5;
          const isFlickDown = velocity > 0.5;
          
          if (isFlickUp) {
            // Swiping up - go to top or expanded based on current position
            targetSnap = currentY < SNAP_EXPANDED + 100 ? SNAP_TOP : SNAP_EXPANDED;
          } else if (isFlickDown) {
            // Swiping down - go to bottom
            targetSnap = SNAP_BOTTOM;
          }
        } else {
          // Slow drag - snap to nearest point with weighted distance
          let bestScore = Infinity;
          snapPoints.forEach(point => {
            const distance = Math.abs(currentY - point);
            // Weight based on velocity direction for more intuitive behavior
            let score = distance;
            if ((velocity < 0 && point < currentY) || (velocity > 0 && point > currentY)) {
              score *= 0.7; // Prefer snaps in the direction of movement
            }
            if (score < bestScore) {
              bestScore = score;
              targetSnap = point;
            }
          });
        }
        
        // Ensure target is within bounds
        targetSnap = Math.max(SNAP_TOP, Math.min(SNAP_BOTTOM, targetSnap));
        lastY.current = targetSnap;
        
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        
        // Use spring with velocity for more natural feel
        Animated.spring(sheetY, {
          toValue: targetSnap,
          velocity: Math.min(Math.abs(velocity) * 0.5, 2), // Cap velocity for stability
          useNativeDriver: true,
          tension: SNAP_TENSION,
          friction: SNAP_FRICTION,
          restSpeedThreshold: 0.5,
          restDisplacementThreshold: 0.5,
        }).start();
      },
    })
  ).current;

  // ── Pulse animation ────────────────────────────────────────────────────────
  useEffect(() => {
    if (driverLocation && !rideStarted && !driverArrived) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.35, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ])).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [driverLocation, rideStarted, driverArrived]);

  // Improved slide-in animation on load
  useEffect(() => {
    if (!loading && !noRide && !showCompleted) {
      sheetY.setValue(height);
      lastY.current = SNAP_DEFAULT;
      // Use spring for smoother entry
      Animated.spring(sheetY, {
        toValue: SNAP_DEFAULT,
        useNativeDriver: true,
        tension: 100,
        friction: 12,
      }).start();
    }
  }, [loading, noRide, showCompleted]);

  // Cleanup
  useEffect(() => () => {
    if (scanTimeoutRef.current)           clearTimeout(scanTimeoutRef.current);
    if (subscriptionRetryRef.current)     clearTimeout(subscriptionRetryRef.current);
    if (statusCheckIntervalRef.current)   clearInterval(statusCheckIntervalRef.current);
  }, []);

  useFocusEffect(React.useCallback(() => {
    pointsAwardedRef.current        = false;
    completionAlertShownRef.current = false;
    pointsAlertShownRef.current     = false;
    return () => { pointsAwardedRef.current = false; completionAlertShownRef.current = false; pointsAlertShownRef.current = false; };
  }, []));

  // ── Points helpers ─────────────────────────────────────────────────────────
  const fetchPointsConfig = async () => {
    try {
      const { data, error } = await supabase.from("system_settings").select("key,value").in("key", ["points_earning_rate_cash","points_earning_rate_wallet","min_fare_for_points","points_rounding"]).eq("category", "points");
      if (error) throw error;
      const cfg = { ...pointsConfig };
      data?.forEach(({ key, value }) => {
        if (key === "points_earning_rate_cash")   cfg.cashRate   = parseFloat(value);
        if (key === "points_earning_rate_wallet") cfg.walletRate = parseFloat(value);
        if (key === "min_fare_for_points")        cfg.minFare    = parseInt(value);
        if (key === "points_rounding")            cfg.rounding   = value;
      });
      setPointsConfig(cfg);
    } catch {}
  };

  const calcPoints = (fare, type, cfg) => {
    const rate = type === "wallet" ? cfg.walletRate : cfg.cashRate;
    const raw  = fare * rate;
    if (cfg.rounding === "ceil")  return Math.ceil(raw);
    if (cfg.rounding === "round") return Math.round(raw);
    return Math.floor(raw);
  };

  useEffect(() => { if (booking?.fare) setPotentialPoints(calcPoints(booking.fare, booking.payment_type, pointsConfig)); }, [booking, pointsConfig]);

  const awardPoints = async (completedBk) => {
    let uid = commuterId;
    if (!uid) { try { uid = await AsyncStorage.getItem("user_id"); if (uid) setCommuterId(uid); else return false; } catch { return false; } }
    if (!completedBk?.id || !uid || pointsAwardedRef.current) return false;
    try {
      pointsAwardedRef.current = true;
      const { data: existing } = await supabase.from("commuter_points_history").select("id,points").eq("source_id", completedBk.id).eq("commuter_id", uid).eq("type", "earned").maybeSingle();
      if (existing) { setPointsEarned(existing.points); pointsAwardedRef.current = false; return true; }
      const fare = completedBk.fare || 0;
      if (fare < pointsConfig.minFare) { setPointsEarned(0); pointsAwardedRef.current = false; return false; }
      const pts = calcPoints(fare, completedBk.payment_type, pointsConfig);
      if (pts <= 0) { setPointsEarned(0); pointsAwardedRef.current = false; return false; }
      const { data: wallet } = await supabase.from("commuter_wallets").select("*").eq("commuter_id", uid).maybeSingle();
      let newBal;
      if (!wallet) {
        await supabase.from("commuter_wallets").insert({ commuter_id: uid, points: pts, balance: 0, created_at: new Date(), updated_at: new Date() });
        newBal = pts;
      } else {
        newBal = (wallet.points || 0) + pts;
        await supabase.from("commuter_wallets").update({ points: newBal, updated_at: new Date() }).eq("commuter_id", uid);
      }
      await supabase.from("commuter_points_history").insert({ commuter_id: uid, points: pts, type: "earned", source: completedBk.payment_type === "wallet" ? "trip_wallet" : "trip_cash", source_id: completedBk.id, description: `Earned ${pts} points from trip`, created_at: new Date() });
      setPointsBalance(newBal); setPointsEarned(pts);
      if (!pointsAlertShownRef.current && pts > 0) { pointsAlertShownRef.current = true; Alert.alert("⭐ Points Earned!", `You earned ${pts} points for this ride!`, [{ text: "Awesome!" }]); }
      pointsAwardedRef.current = false;
      return true;
    } catch { pointsAwardedRef.current = false; return false; }
  };

  const fetchPointsForBooking = async (retries = 0) => {
    const bid = bookingId || route.params?.bookingId;
    let uid   = commuterId;
    if (!bid) return;
    if (!uid) { try { uid = await AsyncStorage.getItem("user_id"); if (uid) setCommuterId(uid); else return; } catch { return; } }
    try {
      const { data: h } = await supabase.from("commuter_points_history").select("points").eq("source_id", bid).eq("commuter_id", uid).eq("type", "earned").in("source", ["trip_cash","trip_wallet","trip"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (h) { setPointsEarned(h.points); return; }
      const { data: c } = await supabase.from("points_conversion_logs").select("points_converted").eq("booking_id", bid).eq("commuter_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (c) { setPointsEarned(c.points_converted); return; }
      setPointsEarned(0);
    } catch {
      if (retries < 3) setTimeout(() => fetchPointsForBooking(retries + 1), 1000 * (retries + 1));
      else setPointsEarned(0);
    }
  };

  // ── Directions & map ───────────────────────────────────────────────────────
  const decodePolyline = (encoded) => {
    const pts = []; let i = 0, lat = 0, lng = 0;
    while (i < encoded.length) {
      let b, sh = 0, res = 0;
      do { b = encoded.charCodeAt(i++) - 63; res |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20);
      lat += res & 1 ? ~(res >> 1) : res >> 1; sh = 0; res = 0;
      do { b = encoded.charCodeAt(i++) - 63; res |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20);
      lng += res & 1 ? ~(res >> 1) : res >> 1;
      pts.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
    }
    return pts;
  };

  const getDirections = async (origin, dest) => {
    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${dest.latitude},${dest.longitude}&key=${googleApiKey}&mode=driving`;
      const r   = await fetch(url);
      const d   = await r.json();
      if (d.status !== "OK" || !d.routes?.[0]) return null;
      const leg = d.routes[0].legs[0];
      return { points: decodePolyline(d.routes[0].overview_polyline.points), distKm: (leg.distance.value / 1000).toFixed(1), durMin: Math.round(leg.duration.value / 60) };
    } catch { return null; }
  };

  const calcDriverETA = async (dLoc, pickupLoc) => {
    const r = await getDirections(dLoc, pickupLoc);
    if (!r) return;
    setDriverETA(r.durMin);
    setRouteCoords(r.points);
    if (mapRef.current && r.points.length > 0) {
      mapRef.current.fitToCoordinates(r.points, { edgePadding: { top: 100, right: 50, bottom: 340, left: 50 }, animated: true });
    }
  };

  const calcTripRoute = async (start, end) => {
    const r = await getDirections(start, end);
    if (!r) return;
    setTripDistance(r.distKm); setTripDuration(r.durMin); setTripCoords(r.points);
  };

  const calcDist = (la1, lo1, la2, lo2) => {
    const R = 6371, dL = (la2 - la1) * Math.PI / 180, dO = (lo2 - lo1) * Math.PI / 180;
    const a = Math.sin(dL / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dO / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const fitMap = () => {
    if (!mapRef.current || showCompleted) return;
    const ms = [];
    if (driverLocation && !rideStarted) ms.push(driverLocation);
    if (booking?.pickup_latitude)  ms.push({ latitude: booking.pickup_latitude,  longitude: booking.pickup_longitude });
    if (booking?.dropoff_latitude) ms.push({ latitude: booking.dropoff_latitude, longitude: booking.dropoff_longitude });
    if (ms.length > 0) mapRef.current.fitToCoordinates(ms, { edgePadding: { top: 100, right: 50, bottom: 340, left: 50 }, animated: true });
  };

  // ── Data fetching ──────────────────────────────────────────────────────────
  useFocusEffect(React.useCallback(() => {
    setBooking(null); setDriver(null); setDriverLocation(null);
    setShowCompleted(false); setNoRide(false); setDriverArrived(false);
    setRideStarted(false); setRouteCoords([]); setTripCoords([]);
    setDriverETA(null); setShowScanner(false); setScanned(false);
    setPaymentSuccess(false); setPointsEarned(null);
    fetchPointsConfig();
    checkForActiveBooking();
    return () => {
      setShowScanner(false);
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
      if (subscriptionRetryRef.current) clearTimeout(subscriptionRetryRef.current);
      if (statusCheckIntervalRef.current) clearInterval(statusCheckIntervalRef.current);
    };
  }, []));

const checkForActiveBooking = async () => {
  try {
    setLoading(true);

    const id = await AsyncStorage.getItem("user_id");
    if (!id) {
      setNoRide(true);
      return;
    }

    setCommuterId(id);
    await fetchPointsBalance(id);

    // 1) Always find the newest ACTIVE booking first
    //    Do not let old completed/unrated trip override the current trip
    const { data: activeBookings, error: activeError } = await supabase
      .from("bookings")
      .select(`
        id,
        driver_id,
        status,
        driver_arrived_at,
        ride_started_at,
        commuter_rating,
        pickup_location,
        dropoff_location,
        pickup_latitude,
        pickup_longitude,
        dropoff_latitude,
        dropoff_longitude,
        fare,
        distance_km,
        duration_minutes,
        passenger_count,
        pickup_details,
        dropoff_details,
        payment_type,
        payment_status,
        points_used,
        created_at
      `)
      .eq("commuter_id", id)
      .in("status", [ "accepted"])
      .order("created_at", { ascending: false })
      .limit(5);

    if (activeError) throw activeError;

    // Pick the newest still-active booking
    const active =
      activeBookings?.find(
        (b) => b.status === "pending" || b.status === "accepted"
      ) || null;

    if (active) {
      setBookingId(active.id);
      setDriverId(active.driver_id || null);
      setBooking(active);
      setStatus(active.status);
      setHasRated(false);
      setShowCompleted(false);
      setNoRide(false);

      if (active.driver_arrived_at) {
        setDriverArrived(true);
      } else {
        setDriverArrived(false);
      }

      if (active.ride_started_at) {
        setRideStarted(true);
        setDriverArrived(false);
      } else {
        setRideStarted(false);
      }

      if (active.driver_id) {
        fetchDriverDetails(active.driver_id);
      }

      if (active.pickup_latitude && active.dropoff_latitude) {
        calcTripRoute(
          {
            latitude: active.pickup_latitude,
            longitude: active.pickup_longitude,
          },
          {
            latitude: active.dropoff_latitude,
            longitude: active.dropoff_longitude,
          }
        );
      }

      setTimeout(() => fetchPointsForBooking(), 1000);
      return;
    }

    // 2) If route param exists but booking is already completed/cancelled,
    //    only show it when there is no active booking
    if (route.params?.bookingId) {
      await fetchBookingDetails(route.params.bookingId);
      setTimeout(() => fetchPointsForBooking(), 1000);
      return;
    }

    // 3) Only now fall back to the latest completed booking
    const { data: completed, error: completedError } = await supabase
      .from("bookings")
      .select(`
        id,
        driver_id,
        status,
        commuter_rating,
        pickup_location,
        dropoff_location,
        fare,
        pickup_latitude,
        pickup_longitude,
        dropoff_latitude,
        dropoff_longitude,
        distance_km,
        duration_minutes,
        passenger_count,
        payment_type,
        payment_status,
        points_used,
        created_at
      `)
      .eq("commuter_id", id)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (completedError) throw completedError;

    if (completed) {
      setBookingId(completed.id);
      setDriverId(completed.driver_id);
      setBooking(completed);
      setStatus(completed.status);
      setHasRated(!!completed.commuter_rating);
      setShowCompleted(true);
      setNoRide(false);

      if (completed.driver_id) {
        fetchDriverDetails(completed.driver_id);
      }

      if (completed.pickup_latitude && completed.dropoff_latitude) {
        calcTripRoute(
          {
            latitude: completed.pickup_latitude,
            longitude: completed.pickup_longitude,
          },
          {
            latitude: completed.dropoff_latitude,
            longitude: completed.dropoff_longitude,
          }
        );
      }

      setTimeout(async () => {
        const { data: ep } = await supabase
          .from("commuter_points_history")
          .select("points")
          .eq("source_id", completed.id)
          .eq("commuter_id", id)
          .eq("type", "earned")
          .maybeSingle();

        if (!ep && completed.fare >= pointsConfig.minFare) {
          await awardPoints(completed);
        } else if (ep) {
          setPointsEarned(ep.points);
        } else {
          fetchPointsForBooking();
        }
      }, 500);

      return;
    }

    setNoRide(true);
  } catch (error) {
    console.log("checkForActiveBooking error:", error);
    setNoRide(true);
  } finally {
    setLoading(false);
  }
};

  const fetchPointsBalance = async (uid) => {
    try {
      const { data } = await supabase.from("commuter_wallets").select("points").eq("commuter_id", uid).maybeSingle();
      if (!data) {
        const { data: nw } = await supabase.from("commuter_wallets").insert({ commuter_id: uid, points: 0, balance: 0, updated_at: new Date() }).select().single();
        setPointsBalance(nw?.points || 0);
      } else setPointsBalance(data?.points || 0);
    } catch {}
  };

const fetchBookingDetails = async (id) => {
  try {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    setBooking(data);
    setStatus(data.status);
    setHasRated(!!data.commuter_rating);

    if (data.driver_arrived_at) {
      setDriverArrived(true);
    } else {
      setDriverArrived(false);
    }

    if (data.ride_started_at) {
      setRideStarted(true);
      setDriverArrived(false);
    } else {
      setRideStarted(false);
    }

    setShowCompleted(data.status === "completed" || data.status === "cancelled");
    setNoRide(false);

    if (data.driver_id) {
      setDriverId(data.driver_id);
      fetchDriverDetails(data.driver_id);
    }

    if (data.pickup_latitude && data.dropoff_latitude) {
      calcTripRoute(
        {
          latitude: data.pickup_latitude,
          longitude: data.pickup_longitude,
        },
        {
          latitude: data.dropoff_latitude,
          longitude: data.dropoff_longitude,
        }
      );
    }
  } catch {
    Alert.alert("Error", "Failed to load booking details");
  }
};

  const fetchDriverDetails = async (id) => {
    if (!id) return;
    try {
      const { data } = await supabase.from("drivers").select(`id,first_name,last_name,phone,profile_picture,rating,driver_vehicles(vehicle_type,vehicle_color,plate_number)`).eq("id", id).single();
      setDriver(data);
    } catch {}
  };

  // ── Realtime subscriptions ─────────────────────────────────────────────────
  useEffect(() => {
    if (!bookingId) return;
    const sub = supabase.channel(`booking-${bookingId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bookings", filter: `id=eq.${bookingId}` },
        async (payload) => {
          if (!payload.new) return;
          const { new: bk } = payload;
          setBooking(bk); setStatus(bk.status);
          if (bk.driver_arrived_at && !driverArrived)  { setDriverArrived(true);  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
          if (bk.ride_started_at   && !rideStarted)    { setRideStarted(true); setDriverArrived(false); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
          if (bk.status === "completed") {
            setShowScanner(false); setScanned(false); setProcessingPayment(false);
            setShowCompleted(true); setRideStarted(false); setDriverArrived(false);
            let uid = commuterId;
            if (!uid) { try { uid = await AsyncStorage.getItem("user_id"); if (uid) setCommuterId(uid); } catch {} }
            setTimeout(async () => {
              const { data: ep } = await supabase.from("commuter_points_history").select("id").eq("source_id", bk.id).eq("commuter_id", uid).eq("type", "earned").maybeSingle();
              if (!ep && bk.fare >= pointsConfig.minFare) await awardPoints(bk);
              else fetchPointsForBooking();
            }, 1000);
            if (!completionAlertShownRef.current) {
              completionAlertShownRef.current = true;
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert("🎉 Trip Completed!", "You've reached your destination. Thank you for riding!", [
                { text: "Rate Driver", onPress: () => navigation.replace("RateRide", { bookingId: bk.id, driverId: bk.driver_id }) },
                { text: "Later", style: "cancel", onPress: () => navigation.goBack() },
              ]);
            }
          } else if (bk.status === "cancelled") {
            setShowCompleted(true); setShowScanner(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            Alert.alert("Trip Cancelled", bk.cancellation_reason || "The trip has been cancelled.", [{ text: "OK", onPress: () => navigation.goBack() }]);
          }
        },
      ).subscribe();
    return () => sub.unsubscribe();
  }, [bookingId, commuterId, pointsConfig.minFare, driverArrived, rideStarted]);

  useEffect(() => {
    if (!driverId || status !== "accepted" || showCompleted || rideStarted) return;
    const sub = supabase.channel(`driver-loc-${driverId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_locations", filter: `driver_id=eq.${driverId}` },
        (payload) => {
          if (!payload.new) return;
          const loc = { latitude: payload.new.latitude, longitude: payload.new.longitude };
          setDriverLocation(loc); setDriverLocLoaded(true);
          if (booking && !driverArrived && !rideStarted) {
            calcDriverETA(loc, { latitude: booking.pickup_latitude, longitude: booking.pickup_longitude });
            if (calcDist(loc.latitude, loc.longitude, booking.pickup_latitude, booking.pickup_longitude) < 0.05) setDriverArrived(true);
          }
        },
      ).subscribe();
    fetchDriverLocation();
    return () => sub.unsubscribe();
  }, [driverId, status, booking, driverArrived, rideStarted, showCompleted]);

  const fetchDriverLocation = async () => {
    if (!driverId) return;
    try {
      const { data } = await supabase.from("driver_locations").select("latitude,longitude").eq("driver_id", driverId).maybeSingle();
      if (data) {
        const loc = { latitude: data.latitude, longitude: data.longitude };
        setDriverLocation(loc); setDriverLocLoaded(true);
        if (booking && !driverArrived && !rideStarted && calcDist(loc.latitude, loc.longitude, booking.pickup_latitude, booking.pickup_longitude) < 0.05) setDriverArrived(true);
      }
    } catch {}
  };

  // Periodic status check
  useEffect(() => {
    if (!bookingId || !commuterId || showCompleted) return;
    if (statusCheckIntervalRef.current) clearInterval(statusCheckIntervalRef.current);
    statusCheckIntervalRef.current = setInterval(async () => {
      try {
        const { data } = await supabase.from("bookings").select("status,driver_arrived_at,ride_started_at,fare,payment_type,dropoff_location,payment_status,points_used,ride_completed_at").eq("id", bookingId).single();
        if (!data) return;
        if (data.driver_arrived_at && !driverArrived)  { setDriverArrived(true); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
        if (data.ride_started_at   && !rideStarted)    { setRideStarted(true); setDriverArrived(false); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
        if (data.status === "completed" && status !== "completed") {
          setShowScanner(false); setScanned(false); setProcessingPayment(false);
          setStatus(data.status); setShowCompleted(true); setRideStarted(false); setDriverArrived(false);
          if (!pointsAwardedRef.current) {
            const { data: ep } = await supabase.from("commuter_points_history").select("id").eq("source_id", bookingId).eq("commuter_id", commuterId).eq("type", "earned").maybeSingle();
            if (!ep && data.fare >= pointsConfig.minFare) await awardPoints({ id: bookingId, fare: data.fare, payment_type: data.payment_type, dropoff_location: data.dropoff_location });
            else fetchPointsForBooking();
          }
          if (!completionAlertShownRef.current) {
            completionAlertShownRef.current = true;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert("🎉 Trip Completed!", "You've reached your destination!", [
              { text: "Rate Driver", onPress: () => navigation.replace("RateRide", { bookingId, driverId }) },
              { text: "Later", style: "cancel", onPress: () => navigation.navigate("HomePage", { screen: "Home" }) },
            ]);
          }
        }
      } catch {}
    }, 2000);
    return () => { if (statusCheckIntervalRef.current) clearInterval(statusCheckIntervalRef.current); };
  }, [bookingId, commuterId, status, showCompleted, driverArrived, rideStarted, pointsConfig.minFare, booking?.fare]);

  // ── Scanner & payment ──────────────────────────────────────────────────────
  const openScanner = async () => {
    if (showCompleted || status === "completed") { Alert.alert("Trip Completed", "This trip has already been completed."); return; }
    if (!permission?.granted) { const { granted } = await requestPermission(); if (!granted) { Alert.alert("Camera Required", "We need camera access to scan the payment QR code."); return; } }
    setScanned(false); setShowScanner(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleBarCodeScanned = async ({ data }) => {
    if (showCompleted || status === "completed") { setShowScanner(false); return; }
    if (scanned || processingPayment) return;
    setScanned(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const qr = JSON.parse(data);
      if (qr.type !== "points_payment")       { Alert.alert("Invalid QR", "This is not a valid payment QR code.",  [{ text: "OK", onPress: () => { scanTimeoutRef.current = setTimeout(() => setScanned(false), 2000); } }]); return; }
      if (qr.booking_id !== bookingId)         { Alert.alert("Invalid QR", "This QR is for a different booking.",  [{ text: "OK", onPress: () => { scanTimeoutRef.current = setTimeout(() => setScanned(false), 2000); } }]); return; }
      if (new Date(qr.expires_at) < new Date()) { Alert.alert("Expired QR", "QR has expired. Ask driver for a new one.", [{ text: "OK", onPress: () => setShowScanner(false) }]); return; }
      await processPointsPayment(qr);
    } catch { Alert.alert("Invalid QR", "Could not read QR. Please try again.", [{ text: "OK", onPress: () => { scanTimeoutRef.current = setTimeout(() => setScanned(false), 2000); } }]); }
  };

  const processPointsPayment = async (qr) => {
    if (showCompleted || status === "completed") { setShowScanner(false); return; }
    try {
      setProcessingPayment(true);
      const uid = await AsyncStorage.getItem("user_id");
      if (!uid) throw new Error("Not authenticated");
      const { data: wallet } = await supabase.from("commuter_wallets").select("points").eq("commuter_id", uid).maybeSingle();
      let cw = wallet;
      if (!cw) { const { data: nw } = await supabase.from("commuter_wallets").insert({ commuter_id: uid, points: 0, balance: 0, updated_at: new Date() }).select().single(); cw = nw; }
      if (cw.points < qr.points) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Insufficient Points", `You need ${qr.points} points. Your balance: ${cw.points || 0}.`, [
          { text: "Cancel", style: "cancel", onPress: () => { setShowScanner(false); setProcessingPayment(false); scanTimeoutRef.current = setTimeout(() => setScanned(false), 1000); } },
          { text: "Pay Cash", onPress: () => { setShowScanner(false); setProcessingPayment(false); Alert.alert("Please inform the driver to switch to cash."); scanTimeoutRef.current = setTimeout(() => setScanned(false), 1000); } },
        ]);
        return;
      }
      const newPts = cw.points - qr.points;
      await supabase.from("commuter_wallets").update({ points: newPts, updated_at: new Date() }).eq("commuter_id", uid);
      await supabase.from("commuter_points_history").insert({ commuter_id: uid, points: qr.points, type: "redeemed", source: "trip", source_id: bookingId, description: "Points payment for trip", created_at: new Date() });
      await supabase.from("bookings").update({ payment_status: "paid", payment_type: "wallet", actual_fare: qr.amount, points_used: qr.points, updated_at: new Date() }).eq("id", bookingId);
      setPointsBalance(newPts); setPaymentSuccess(true); setShowScanner(false);
      const { data: ub } = await supabase.from("bookings").select("*").eq("id", bookingId).single();
      if (ub) setBooking(ub);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("✅ Payment Successful!", `Paid ₱${qr.amount.toFixed(2)} with ${qr.points} points.\n\nRemaining: ${newPts} points`, [{ text: "Great!" }]);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Payment Failed", err.message === "Not authenticated" ? "Session expired. Please log in again." : "An error occurred. Please try again or pay cash.", [{
        text: "OK", onPress: () => { setShowScanner(false); scanTimeoutRef.current = setTimeout(() => setScanned(false), 1000); if (err.message === "Not authenticated") navigation.replace("Login"); }
      }]);
    } finally { setProcessingPayment(false); }
  };

  // ── Derived display state ──────────────────────────────────────────────────
  const statusMsg = () => {
    if (status === "cancelled")  return "Trip cancelled";
    if (status === "completed")  return hasRated ? "Thanks for riding!" : "Trip completed";
    if (!driverId)               return "Finding your driver…";
    if (rideStarted)             return "On the way to destination";
    if (driverArrived)           return "Your driver has arrived!";
    if (!driverLocLoaded)        return "Driver is connecting…";
    return driverETA ? `Arriving in ${driverETA} min` : "Driver is on the way";
  };

  const statusColor = () => {
    if (rideStarted)            return C.amber;
    if (driverArrived)          return C.green;
    if (status === "completed") return C.green;
    if (status === "cancelled") return C.red;
    return C.navy;
  };

  const statusIcon = () => {
    if (rideStarted)            return "car-sport";
    if (driverArrived)          return "location";
    if (status === "completed") return "checkmark-circle";
    if (status === "cancelled") return "close-circle";
    return "car";
  };

  const showDriverMarker  = !!driverLocation && status === "accepted" && !rideStarted && !showCompleted;
  const showRouteToDriver = status === "accepted" && !driverArrived && !rideStarted && routeCoords.length > 0 && !showCompleted;
  const showTripRoute     = (rideStarted || driverArrived || status === "completed") && tripCoords.length > 0 && !showCompleted;
  const showPointsPay     = status === "accepted" && rideStarted && booking?.payment_type === "wallet" && booking?.payment_status === "pending" && !paymentSuccess && !showCompleted;
  const canCancel         = status === "accepted" && !driverArrived && !rideStarted;

  const driverInitials = `${driver?.first_name?.[0] || ""}${driver?.last_name?.[0] || ""}` || "?";

  // ──────────────────────────────────────────────────────────────────────────
  // LOADING
  // ──────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.loadingRoot}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color={C.navy} />
        <Text style={styles.loadingText}>Loading your ride…</Text>
      </View>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // QR SCANNER
  // ──────────────────────────────────────────────────────────────────────────
  if (showScanner && !showCompleted && status !== "completed") {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />
        <View style={[styles.scanHeader, { paddingTop: insets.top }]}>
          <Pressable style={styles.scanBack} onPress={() => { setShowScanner(false); setScanned(false); setProcessingPayment(false); }}>
            <Ionicons name="close" size={IC(22)} color={C.white} />
          </Pressable>
          <Text style={styles.scanTitle}>Scan Payment QR</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.scanContainer}>
          <CameraView style={StyleSheet.absoluteFillObject} facing="back"
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}>
            <View style={styles.scanOverlay}>
              <View style={styles.scanFrame}>
                <View style={[styles.scanCorner]}                              />
                <View style={[styles.scanCorner, styles.scTR]}                />
                <View style={[styles.scanCorner, styles.scBL]}                />
                <View style={[styles.scanCorner, styles.scBR]}                />
                <View style={styles.scanLine} />
              </View>
              <Text style={styles.scanHint}>
                {processingPayment ? "Processing…" : "Align the driver's QR within the frame"}
              </Text>
              {processingPayment && <ActivityIndicator color={C.white} style={{ marginTop: S.lg }} />}
            </View>
          </CameraView>
        </View>
      </View>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // NO RIDE
  // ──────────────────────────────────────────────────────────────────────────
  if (noRide) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />
        <View style={[styles.scanHeader, { paddingTop: insets.top }]}>
          <Text style={styles.navTitle}>Track Ride</Text>
        </View>
        <View style={styles.noRideRoot}>
          <View style={styles.noRideCircle}>
            <Ionicons name="car-outline" size={IC(52)} color={C.navy} />
          </View>
          <Text style={styles.noRideTitle}>Ready to ride?</Text>
          <Text style={styles.noRideSub}>You don't have an active ride.{"\n"}Book one to get started.</Text>
          <Pressable style={styles.findBtn} onPress={() => navigation.navigate("Home")}>
            <Ionicons name="search-outline" size={IC(18)} color={C.white} />
            <Text style={styles.findBtnText}>Find a Ride</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // COMPLETED / CANCELLED
  // ──────────────────────────────────────────────────────────────────────────
  if (showCompleted) {
    const isCompleted = status === "completed";
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />
        {/* Header removed */}
        <ScrollView style={{ flex: 1, backgroundColor: C.offWhite }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: S.xl, paddingBottom: 60 }}>
          {/* Hero icon */}
          <View style={styles.completedHero}>
            <View style={[styles.completedCircle, { backgroundColor: isCompleted ? C.navy : C.red }]}>
              <Ionicons name={isCompleted ? "checkmark" : "close"} size={IC(44)} color={C.white} />
            </View>
            <Text style={styles.completedTitle}>{isCompleted ? "Thank You!" : "Ride Cancelled"}</Text>
            <Text style={styles.completedSub}>{isCompleted ? (hasRated ? "Thanks for rating your driver!" : "Rate your driver to help others.") : "This ride has been cancelled."}</Text>
          </View>

          {/* Payment summary */}
          {isCompleted && booking?.payment_type && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Payment Summary</Text>
              <View style={styles.cardRow}>
                <Text style={styles.cardLabel}>Method</Text>
                <Text style={styles.cardValue}>{booking.payment_type === "wallet" ? "⭐ Points" : "💰 Cash"}</Text>
              </View>
              <View style={styles.cardRow}>
                <Text style={styles.cardLabel}>Total Fare</Text>
                <Text style={styles.cardValue}>₱{booking.fare?.toFixed(2) || "0.00"}</Text>
              </View>
              {booking.points_used > 0 && (
                <View style={styles.cardRow}>
                  <Text style={styles.cardLabel}>Points Used</Text>
                  <Text style={styles.cardValue}>{booking.points_used}</Text>
                </View>
              )}
              {pointsEarned > 0 && (
                <>
                  <View style={styles.cardDivider} />
                  <View style={styles.cardRow}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      <Ionicons name="star" size={IC(14)} color={C.amber} />
                      <Text style={[styles.cardLabel, { color: C.amber }]}>Points Earned</Text>
                    </View>
                    <Text style={[styles.cardValue, { color: C.amber }]}>+{pointsEarned}</Text>
                  </View>
                </>
              )}
            </View>
          )}

          {/* Driver */}
          {driver && (
            <View style={[styles.card, styles.driverCard]}>
              <Avatar uri={driver.profile_picture} size={56} initials={driverInitials} />
              <View style={{ flex: 1, marginLeft: S.md }}>
                <Text style={styles.driverName}>{driver.first_name} {driver.last_name}</Text>
                {driver.driver_vehicles?.[0] && (
                  <Text style={styles.driverSub}>{driver.driver_vehicles[0].vehicle_color} {driver.driver_vehicles[0].vehicle_type}</Text>
                )}
                {driver.rating && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
                    <Ionicons name="star" size={IC(12)} color={C.amber} />
                    <Text style={styles.driverRating}>{driver.rating.toFixed(1)}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Route */}
          {booking && (
            <View style={styles.card}>
              <View style={styles.routeRow}>
                <View style={[styles.routeDot, { backgroundColor: C.green }]} />
                <Text style={styles.routeText} numberOfLines={2}>{booking.pickup_location}</Text>
              </View>
              <View style={styles.routeLineWrap}><View style={styles.routeLine} /></View>
              <View style={styles.routeRow}>
                <View style={[styles.routeDot, { backgroundColor: C.amber }]} />
                <Text style={styles.routeText} numberOfLines={2}>{booking.dropoff_location}</Text>
              </View>
            </View>
          )}

          {isCompleted && !hasRated && (
            <Pressable style={styles.rateBtn} onPress={() => navigation.replace("RateRide", { bookingId, driverId })}>
              <Ionicons name="star-outline" size={IC(18)} color={C.white} />
              <Text style={styles.rateBtnText}>Rate Your Driver</Text>
            </Pressable>
          )}

          
        </ScrollView>
      </View>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ACTIVE RIDE
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      {/*  */}

      {/* Map */}
      <View style={{ flex: 1 }}>
        <MapView ref={mapRef} style={StyleSheet.absoluteFillObject} provider={PROVIDER_GOOGLE}
          showsUserLocation showsMyLocationButton={false} showsCompass={false}
          customMapStyle={mapStyle}
          initialRegion={{ latitude: booking?.pickup_latitude || 14.5995, longitude: booking?.pickup_longitude || 120.9842, latitudeDelta: 0.012, longitudeDelta: 0.012 }}
          onMapReady={fitMap}>
          {showDriverMarker && (
            <Marker coordinate={driverLocation} title="Your Driver">
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <Image 
                  source={require("../../assets/driver-icon.png")} 
                  style={styles.driverMarkerImage}
                  resizeMode="contain"
                />
              </Animated.View>
            </Marker>
          )}
          {booking?.pickup_latitude && (
            <Marker coordinate={{ latitude: booking.pickup_latitude, longitude: booking.pickup_longitude }} title="Pickup">
              <Image 
                source={require("../../assets/pick-up-icon.png")} 
                style={styles.pickupPinImage}
                resizeMode="contain"
              />
            </Marker>
          )}
          {booking?.dropoff_latitude && (
            <Marker coordinate={{ latitude: booking.dropoff_latitude, longitude: booking.dropoff_longitude }} title="Drop-off">
              <Image 
                source={require("../../assets/drop-off-icon.png")} 
                style={styles.dropoffPinImage}
                resizeMode="contain"
              />
            </Marker>
          )}
          {showRouteToDriver && <Polyline coordinates={routeCoords} strokeColor={C.navy} strokeWidth={4} lineDashPattern={[8, 4]} />}
          {showTripRoute     && <Polyline coordinates={tripCoords}  strokeColor={C.amber} strokeWidth={5} />}
        </MapView>

        {/* FAB locate */}
        <Pressable style={[styles.locateFab, { top: insets.top + 60 }]} onPress={fitMap}>
          <Ionicons name="locate" size={IC(20)} color={C.navy} />
        </Pressable>
      </View>

      {/* Bottom Sheet - Optimized for smooth drag */}
      <Animated.View 
        style={[
          styles.sheet, 
          { 
            transform: [{ translateY: sheetY }],
            // Performance optimizations
            willChange: 'transform',
            backfaceVisibility: 'hidden',
          }
        ]}
      >
        {/* Handle with extended touch area */}
        <View style={styles.sheetHandleArea} {...panResponder.panHandlers}>
          <View style={styles.handleBar} />
          <View style={styles.handleTouchExtender} />
        </View>

        <ScrollView 
          showsVerticalScrollIndicator={false} 
          scrollEnabled 
          bounces={false}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingHorizontal: S.xl, paddingBottom: insets.bottom + 40 }}
        >
          {/* Status card */}
          <View style={[styles.statusCard, { borderLeftColor: statusColor() }]}>
            <View style={[styles.statusIconWrap, { backgroundColor: statusColor() }]}>
              <Ionicons name={statusIcon()} size={IC(22)} color={C.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.statusMsg}>{statusMsg()}</Text>
              <Text style={styles.statusDetail}>
                {rideStarted ? "Heading to destination" :
                 driverArrived ? "Meet your driver at pickup" :
                 driverETA ? `Est. pickup in ${driverETA} min` : "Driver is preparing"}
              </Text>
            </View>
          </View>

          {/* Driver row */}
          {driver && (
            <View style={[styles.card, styles.driverCard]}>
              <Avatar uri={driver.profile_picture} size={50} initials={driverInitials} />
              <View style={{ flex: 1, marginLeft: S.md }}>
                <Text style={styles.driverName}>{driver.first_name} {driver.last_name}</Text>
                {driver.driver_vehicles?.[0] && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                    <Ionicons name="car-outline" size={IC(13)} color={C.textSub} />
                    <Text style={styles.driverSub}>{driver.driver_vehicles[0].vehicle_color} {driver.driver_vehicles[0].vehicle_type}</Text>
                  </View>
                )}
                {driver.driver_vehicles?.[0]?.plate_number && (
                  <View style={styles.platePill}>
                    <Text style={styles.plateText}>{driver.driver_vehicles[0].plate_number}</Text>
                  </View>
                )}
              </View>
              <Pressable style={styles.callBtn} onPress={() => {
                if (!driver?.phone) { Alert.alert("Error", "Driver phone not available"); return; }
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                Alert.alert("Contact Driver", "How would you like to contact the driver?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "📞 Call",    onPress: () => Linking.openURL(`tel:${driver.phone}`) },
                  { text: "💬 Message", onPress: () => Linking.openURL(`sms:${driver.phone}`) },
                ]);
              }}>
                <Ionicons name="chatbubble-ellipses-outline" size={IC(19)} color={C.navy} />
              </Pressable>
            </View>
          )}

          {/* Route */}
          <View style={styles.card}>
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: C.green }]} />
              <Text style={styles.routeText} numberOfLines={2}>{booking?.pickup_location}</Text>
            </View>
            <View style={styles.routeLineWrap}><View style={styles.routeLine} /></View>
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: C.amber }]} />
              <Text style={styles.routeText} numberOfLines={2}>{booking?.dropoff_location}</Text>
            </View>
          </View>

          {/* Stats chips */}
          {(tripDistance || booking?.distance_km) && (
            <View style={[styles.card, styles.statsChips]}>
              <StatChip icon="map-outline"  label="Distance" value={`${tripDistance || booking?.distance_km || "?"} km`} />
              <View style={styles.chipDiv} />
              <StatChip icon="time-outline" label="Duration" value={`${tripDuration || booking?.duration_minutes || "?"} min`} />
              <View style={styles.chipDiv} />
              <StatChip icon="cash-outline" label="Fare"     value={`₱${booking?.fare?.toFixed(2) || "0.00"}`} />
            </View>
          )}

          {/* Points preview */}
          {rideStarted && booking?.fare > 0 && booking.fare >= pointsConfig.minFare && (
            <View style={styles.pointsPreview}>
              <Ionicons name="star" size={IC(17)} color={C.amber} />
              <Text style={styles.pointsPreviewText}>
                Earn <Text style={{ fontWeight: "700", color: C.amberDark }}>{potentialPoints} points</Text> after this trip
              </Text>
            </View>
          )}

          {/* Points pay button */}
          {showPointsPay && (
            <Pressable style={styles.pointsPayBtn} onPress={openScanner}>
              <View style={styles.pointsPayIcon}>
                <Ionicons name="qr-code-outline" size={IC(22)} color={C.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pointsPayTitle}>Pay with Points</Text>
                <Text style={styles.pointsPaySub}>Balance: {pointsBalance} pts</Text>
              </View>
              <Ionicons name="chevron-forward" size={IC(20)} color={C.white} />
            </Pressable>
          )}

          {/* Cancel */}
          {canCancel && (
            <Pressable style={styles.cancelBtn} onPress={() => Alert.alert("Cancel Ride", "Are you sure you want to cancel this ride?", [
              { text: "No, Keep", style: "cancel" },
              { text: "Yes, Cancel", style: "destructive", onPress: async () => {
                try {
                  await supabase.from("bookings").update({ status: "cancelled", cancellation_reason: "Cancelled by commuter", cancelled_by: "commuter", cancelled_at: new Date(), updated_at: new Date() }).eq("id", bookingId);
                  navigation.goBack();
                } catch { Alert.alert("Error", "Failed to cancel."); }
              }},
            ])}>
              <Text style={styles.cancelBtnText}>Cancel Ride</Text>
            </Pressable>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// Custom minimal map style
const mapStyle = [
  { featureType: "poi",     elementType: "labels",   stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels",   stylers: [{ visibility: "off" }] },
  { featureType: "road",    elementType: "labels.icon", stylers: [{ visibility: "off" }] },
];

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.offWhite },
  loadingRoot: { flex: 1, backgroundColor: C.offWhite, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: S.md, fontSize: F.md, color: C.textSub },

  // Nav bar
navBar: {
  backgroundColor: C.navy,
  flexDirection: "row",
  alignItems: "center",
  paddingTop: 0,
  minHeight: 60,
},

scanHeader: {
  backgroundColor: C.navy,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingHorizontal: S.lg,
  paddingBottom: 10,
},
  navBack:   { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  navCenter: { flex: 1, alignItems: "center" },
  navSub:    { fontSize: F.xs, color: "rgba(255,255,255,0.7)", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  navTitle:  { fontSize: F.lg, fontWeight: "700", color: C.white, marginTop: 1 },

  // No ride
  noRideRoot:   { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: S.xxl },
  noRideCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: C.navy + "12", justifyContent: "center", alignItems: "center", marginBottom: S.xl },
  noRideTitle:  { fontSize: F.xxl, fontWeight: "700", color: C.text, marginBottom: S.sm, textAlign: "center" },
  noRideSub:    { fontSize: F.md, color: C.textSub, textAlign: "center", lineHeight: 22, marginBottom: S.xxl },
  findBtn:      { backgroundColor: C.navy, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.sm, paddingVertical: S.md, paddingHorizontal: S.xxl, borderRadius: R.full },
  findBtnText:  { color: C.white, fontSize: F.md, fontWeight: "700" },

  // Scanner
  scanHeader:   { backgroundColor: C.navy, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingBottom: S.lg },
  scanBack:     { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.12)", justifyContent: "center", alignItems: "center" },
  scanTitle:    { fontSize: F.lg, fontWeight: "700", color: C.white },
  scanContainer:{ flex: 1, backgroundColor: "#000" },
  scanOverlay:  { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center" },
  scanFrame:    { width: 240, height: 240, position: "relative", justifyContent: "center", alignItems: "center" },
  scanCorner:   { position: "absolute", width: 36, height: 36, borderColor: C.amber, borderTopWidth: 3, borderLeftWidth: 3, top: 0, left: 0, borderRadius: R.sm },
  scTR:         { right: 0, left: "auto", borderLeftWidth: 0, borderRightWidth: 3 },
  scBL:         { bottom: 0, top: "auto", borderTopWidth: 0, borderBottomWidth: 3 },
  scBR:         { bottom: 0, top: "auto", right: 0, left: "auto", borderTopWidth: 0, borderLeftWidth: 0, borderRightWidth: 3, borderBottomWidth: 3 },
  scanLine:     { width: "70%", height: 2, backgroundColor: C.amber, opacity: 0.8 },
  scanHint:     { color: C.white, fontSize: F.md, marginTop: S.xxl, textAlign: "center", fontWeight: "500" },

  // Completed
  completedHero:   { alignItems: "center", paddingVertical: S.xxl, backgroundColor: C.white, borderRadius: R.xxl, marginBottom: S.md, borderWidth: 1, borderColor: C.border },
  completedCircle: { width: 84, height: 84, borderRadius: 42, justifyContent: "center", alignItems: "center", marginBottom: S.lg },
  completedTitle:  { fontSize: F.xxl, fontWeight: "700", color: C.text, marginBottom: S.sm },
  completedSub:    { fontSize: F.sm, color: C.textSub, textAlign: "center", lineHeight: 20, paddingHorizontal: S.xl },

  // Cards
  card:       { backgroundColor: C.white, borderRadius: R.xl, padding: S.lg, marginBottom: S.md, borderWidth: 1, borderColor: C.border },
  cardTitle:  { fontSize: F.md, fontWeight: "700", color: C.text, marginBottom: S.md },
  cardRow:    { flexDirection: "row", justifyContent: "space-between", marginBottom: S.sm },
  cardLabel:  { fontSize: F.sm, color: C.textSub },
  cardValue:  { fontSize: F.sm, fontWeight: "700", color: C.text },
  cardDivider:{ height: 1, backgroundColor: C.border, marginVertical: S.sm },

  // Driver card
  driverCard:   { flexDirection: "row", alignItems: "center" },
  driverName:   { fontSize: F.md, fontWeight: "700", color: C.text },
  driverSub:    { fontSize: F.sm, color: C.textSub },
  driverRating: { fontSize: F.sm, color: C.textSub, fontWeight: "600" },
  platePill:    { marginTop: 4, alignSelf: "flex-start", backgroundColor: C.navy + "12", paddingHorizontal: S.sm, paddingVertical: 2, borderRadius: R.sm },
  plateText:    { fontSize: F.xs, color: C.navy, fontWeight: "700", letterSpacing: 0.5 },

  // Route
  routeRow:     { flexDirection: "row", alignItems: "flex-start" },
  routeDot:     { width: 10, height: 10, borderRadius: 5, marginRight: S.sm, marginTop: 4, flexShrink: 0 },
  routeText:    { flex: 1, fontSize: F.sm, color: C.text, lineHeight: 20 },
  routeLineWrap:{ paddingLeft: 4, paddingVertical: 5 },
  routeLine:    { width: 1.5, height: 18, backgroundColor: C.border, marginLeft: 3 },

  // Action buttons
  rateBtn:     { backgroundColor: C.navy, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.sm, paddingVertical: S.md, borderRadius: R.lg, marginBottom: S.sm },
  rateBtnText: { color: C.white, fontSize: F.md, fontWeight: "700" },
  homeBtn:     { backgroundColor: C.white, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.sm, paddingVertical: S.md, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, marginBottom: S.lg },
  homeBtnText: { color: C.navy, fontSize: F.md, fontWeight: "700" },

  // Map marker images
  driverMarkerImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderColor: C.white,
  },
  pickupPinImage: {
    width: 42,
    height: 42,
  },
  dropoffPinImage: {
    width: 42,
    height: 42,
  },

  // Keep old marker styles for fallback
  driverMarkerRing: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.navy + "20", justifyContent: "center", alignItems: "center" },
  driverMarker:     { width: 38, height: 38, borderRadius: 19, backgroundColor: C.navy, justifyContent: "center", alignItems: "center", borderWidth: 2.5, borderColor: C.white },
  pickupPin:        { width: 18, height: 18, borderRadius: 9, backgroundColor: C.green, borderWidth: 3, borderColor: C.white },
  dropoffPin:       { width: 28, height: 28, borderRadius: 14, backgroundColor: C.amber, justifyContent: "center", alignItems: "center", borderWidth: 2.5, borderColor: C.white },

  locateFab: { position: "absolute", right: S.md, width: 46, height: 46, borderRadius: 23, backgroundColor: C.white, justifyContent: "center", alignItems: "center", shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 5 },

  // Bottom sheet - Optimized for smooth drag
  sheet: { 
    position: "absolute", 
    left: 0, 
    right: 0, 
    top: 0, 
    height, 
    backgroundColor: C.white, 
    borderTopLeftRadius: R.xxl, 
    borderTopRightRadius: R.xxl, 
    shadowColor: "#000", 
    shadowOpacity: 0.08, 
    shadowRadius: 16, 
    shadowOffset: { width: 0, height: -4 }, 
    elevation: 12,
    // Performance optimizations
    backfaceVisibility: 'hidden',
  },
  
  sheetHandleArea: {
    alignItems: "center", 
    paddingTop: S.md, 
    paddingBottom: S.md,
    // Increase touch area for better drag response
    paddingHorizontal: 20,
    width: '100%',
  },
  
  handleBar: { 
    width: 38, 
    height: 4, 
    borderRadius: 2, 
    backgroundColor: C.border,
  },
  
  handleTouchExtender: {
    position: 'absolute',
    top: -10,
    left: -20,
    right: -20,
    bottom: -10,
    backgroundColor: 'transparent',
  },

  // Status card
  statusCard:    { flexDirection: "row", alignItems: "center", backgroundColor: C.offWhite, borderRadius: R.lg, padding: S.lg, marginBottom: S.md, borderLeftWidth: 4 },
  statusIconWrap:{ width: 46, height: 46, borderRadius: 23, justifyContent: "center", alignItems: "center", marginRight: S.md },
  statusMsg:     { fontSize: F.md, fontWeight: "700", color: C.text, marginBottom: 2 },
  statusDetail:  { fontSize: F.sm, color: C.textSub },

  // Stats chips
  statsChips:{ flexDirection: "row" },
  chipDiv:   { width: 1, backgroundColor: C.border },

  // Call button
  callBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.navy + "10", justifyContent: "center", alignItems: "center" },

  // Points preview
  pointsPreview:    { flexDirection: "row", alignItems: "center", gap: S.sm, backgroundColor: C.amber + "10", borderRadius: R.lg, padding: S.md, marginBottom: S.md },
  pointsPreviewText:{ fontSize: F.sm, color: C.amberDark, flex: 1 },

  // Points pay button
  pointsPayBtn:  { flexDirection: "row", alignItems: "center", backgroundColor: C.amber, borderRadius: R.lg, padding: S.md, marginBottom: S.md, gap: S.md },
  pointsPayIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.22)", justifyContent: "center", alignItems: "center" },
  pointsPayTitle:{ color: C.white, fontSize: F.md, fontWeight: "700" },
  pointsPaySub:  { color: "rgba(255,255,255,0.85)", fontSize: F.xs, marginTop: 1 },

  // Cancel
  cancelBtn:    { backgroundColor: "#FEF2F2", padding: S.lg, borderRadius: R.lg, alignItems: "center", marginBottom: S.md },
  cancelBtnText:{ color: C.red, fontWeight: "700", fontSize: F.md },
});