// screens/commuter/TrackRide.js
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Image,
  ScrollView,
  Dimensions,
  Modal,
  Animated,
  PanResponder,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import Constants from "expo-constants";
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

const { width, height } = Dimensions.get('window');

// ─── Bottom Sheet Snap Points ────────────────────────────────────────────────
// translateY values (higher = more collapsed)
const SNAP_COLLAPSED  = height * 0.62;   // only handle + 1 card visible
const SNAP_DEFAULT    = height * 0.42;   // default ~58% visible
const SNAP_EXPANDED   = height * 0.08;   // nearly full screen

export default function TrackRide({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const mapRef = useRef(null);
  const scanTimeoutRef = useRef(null);
  const pointsAwardedRef = useRef(false);
  const subscriptionRetryRef = useRef(null);
  const statusCheckIntervalRef = useRef(null);
  const completionAlertShownRef = useRef(false);
  const pointsAlertShownRef = useRef(false);

  // ─── Bottom Sheet Drag State ───────────────────────────────────────────────
  const bottomSheetY = useRef(new Animated.Value(SNAP_DEFAULT)).current;
  const lastY = useRef(SNAP_DEFAULT);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dy) > 5,
      onPanResponderGrant: () => {
        // Capture current animated value before dragging starts
        bottomSheetY.stopAnimation((val) => {
          lastY.current = val;
          bottomSheetY.setOffset(val);
          bottomSheetY.setValue(0);
        });
      },
      onPanResponderMove: (_, gestureState) => {
        const next = lastY.current + gestureState.dy;
        // Clamp between expanded and collapsed
        if (next >= SNAP_EXPANDED && next <= SNAP_COLLAPSED) {
          bottomSheetY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        bottomSheetY.flattenOffset();

        // Determine current position + velocity to pick the best snap
        const currentY = lastY.current + gestureState.dy;
        const velocity = gestureState.vy;

        let snapTo = SNAP_DEFAULT;

        if (velocity < -0.5) {
          // Fast swipe up → expand
          snapTo = SNAP_EXPANDED;
        } else if (velocity > 0.5) {
          // Fast swipe down → collapse
          snapTo = SNAP_COLLAPSED;
        } else {
          // Snap to nearest
          const diffs = [
            Math.abs(currentY - SNAP_COLLAPSED),
            Math.abs(currentY - SNAP_DEFAULT),
            Math.abs(currentY - SNAP_EXPANDED),
          ];
          const minIndex = diffs.indexOf(Math.min(...diffs));
          snapTo = [SNAP_COLLAPSED, SNAP_DEFAULT, SNAP_EXPANDED][minIndex];
        }

        lastY.current = snapTo;
        Animated.spring(bottomSheetY, {
          toValue: snapTo,
          useNativeDriver: true,
          tension: 68,
          friction: 12,
        }).start();
      },
    })
  ).current;

  // Animate bottom sheet in on first load
  const slideInOnLoad = () => {
    bottomSheetY.setValue(height); // start off-screen
    lastY.current = SNAP_DEFAULT;
    Animated.spring(bottomSheetY, {
      toValue: SNAP_DEFAULT,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  // Get params with fallback
  const [bookingId, setBookingId] = useState(route.params?.bookingId || null);
  const [driverId, setDriverId] = useState(route.params?.driverId || null);

  const [loading, setLoading] = useState(true);
  const [commuterId, setCommuterId] = useState(null);
  const [noRideAvailable, setNoRideAvailable] = useState(false);
  const [showCompletedUI, setShowCompletedUI] = useState(false);

  // Booking and driver data
  const [booking, setBooking] = useState(null);
  const [driver, setDriver] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [driverETA, setDriverETA] = useState(null);
  const [driverLocationLoaded, setDriverLocationLoaded] = useState(false);

  // Route data
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [tripRouteCoordinates, setTripRouteCoordinates] = useState([]);
  const [tripDistance, setTripDistance] = useState(null);
  const [tripDuration, setTripDuration] = useState(null);

  // Trip status
  const [status, setStatus] = useState("accepted");
  const [driverArrived, setDriverArrived] = useState(false);
  const [rideStarted, setRideStarted] = useState(false);
  const [hasRated, setHasRated] = useState(false);

  // Location tracking
  const [locationSubscription, setLocationSubscription] = useState(null);

  // QR Code Scanning
  const [permission, requestPermission] = useCameraPermissions();
  const [showScanner, setShowScanner] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // Points related states
  const [pointsBalance, setPointsBalance] = useState(0);
  const [pointsEarned, setPointsEarned] = useState(null);
  const [pointsEarningRate, setPointsEarningRate] = useState(null);
  const [potentialPoints, setPotentialPoints] = useState(0);
  const [pointsConfig, setPointsConfig] = useState({
    cashRate: 0.05,
    walletRate: 0.5,
    minFare: 20,
    rounding: 'floor'
  });

  const googleApiKey = Constants.expoConfig?.extra?.GOOGLE_API_KEY;

  // Slide in when content is ready
  useEffect(() => {
    if (!loading && !noRideAvailable && !showCompletedUI) {
      slideInOnLoad();
    }
  }, [loading, noRideAvailable, showCompletedUI]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
      if (subscriptionRetryRef.current) clearTimeout(subscriptionRetryRef.current);
      if (statusCheckIntervalRef.current) clearInterval(statusCheckIntervalRef.current);
    };
  }, []);

  // Reset refs when screen focuses
  useFocusEffect(
    React.useCallback(() => {
      pointsAwardedRef.current = false;
      completionAlertShownRef.current = false;
      pointsAlertShownRef.current = false;

      return () => {
        pointsAwardedRef.current = false;
        completionAlertShownRef.current = false;
        pointsAlertShownRef.current = false;
      };
    }, [])
  );

  // Fetch points configuration
  const fetchPointsConfig = async () => {
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", [
          'points_earning_rate_cash',
          'points_earning_rate_wallet',
          'min_fare_for_points',
          'points_rounding'
        ])
        .eq("category", "points");

      if (error) throw error;

      const config = { ...pointsConfig };
      data?.forEach(item => {
        switch (item.key) {
          case 'points_earning_rate_cash':    config.cashRate  = parseFloat(item.value); break;
          case 'points_earning_rate_wallet':  config.walletRate = parseFloat(item.value); break;
          case 'min_fare_for_points':         config.minFare   = parseInt(item.value);   break;
          case 'points_rounding':             config.rounding  = item.value;             break;
        }
      });
      setPointsConfig(config);
    } catch (err) {
      console.log("❌ Error fetching points config:", err);
    }
  };

  // Calculate potential points for current ride
  const calculatePotentialPoints = () => {
    if (!booking?.fare) return 0;
    const rate = booking.payment_type === 'wallet' ? pointsConfig.walletRate : pointsConfig.cashRate;
    let points = booking.fare * rate;
    switch (pointsConfig.rounding) {
      case 'ceil':  points = Math.ceil(points);  break;
      case 'round': points = Math.round(points); break;
      default:      points = Math.floor(points);
    }
    return points;
  };

  // Award points for completed ride
  const awardPointsForCompletedRide = async (completedBooking) => {
    console.log("🎯 awardPointsForCompletedRide called with:", {
      bookingId: completedBooking?.id,
      commuterId,
      fare: completedBooking?.fare,
      paymentType: completedBooking?.payment_type
    });

    let currentCommuterId = commuterId;

    if (!currentCommuterId) {
      try {
        const userId = await AsyncStorage.getItem("user_id");
        if (userId) { currentCommuterId = userId; setCommuterId(userId); }
        else return false;
      } catch (err) { return false; }
    }

    if (!completedBooking || !completedBooking.id || !currentCommuterId) return false;
    if (pointsAwardedRef.current) return false;

    try {
      pointsAwardedRef.current = true;

      const { data: existingPoints, error: checkError } = await supabase
        .from("commuter_points_history")
        .select("id, points")
        .eq("source_id", completedBooking.id)
        .eq("commuter_id", currentCommuterId)
        .eq("type", "earned")
        .maybeSingle();

      if (checkError) { pointsAwardedRef.current = false; return false; }

      if (existingPoints) {
        setPointsEarned(existingPoints.points);
        const { data: wallet } = await supabase
          .from("commuter_wallets")
          .select("points")
          .eq("commuter_id", currentCommuterId)
          .single();
        if (wallet) setPointsBalance(wallet.points);
        pointsAwardedRef.current = false;
        return true;
      }

      const fare = completedBooking.fare || 0;
      if (fare < pointsConfig.minFare) {
        setPointsEarned(0);
        pointsAwardedRef.current = false;
        return false;
      }

      const rate = completedBooking.payment_type === 'wallet' ? pointsConfig.walletRate : pointsConfig.cashRate;
      let pointsToAward;
      switch (pointsConfig.rounding) {
        case 'ceil':  pointsToAward = Math.ceil(fare * rate);  break;
        case 'round': pointsToAward = Math.round(fare * rate); break;
        default:      pointsToAward = Math.floor(fare * rate);
      }

      if (pointsToAward <= 0) {
        setPointsEarned(0);
        pointsAwardedRef.current = false;
        return false;
      }

      let { data: wallet, error: walletError } = await supabase
        .from("commuter_wallets")
        .select("*")
        .eq("commuter_id", currentCommuterId)
        .maybeSingle();

      if (walletError) { pointsAwardedRef.current = false; return false; }

      let newPointsBalance;

      if (!wallet) {
        const { data: newWallet, error: createError } = await supabase
          .from("commuter_wallets")
          .insert({ commuter_id: currentCommuterId, points: pointsToAward, balance: 0, created_at: new Date(), updated_at: new Date() })
          .select()
          .single();
        if (createError) { pointsAwardedRef.current = false; return false; }
        newPointsBalance = pointsToAward;
      } else {
        newPointsBalance = (wallet.points || 0) + pointsToAward;
        const { error: updateError } = await supabase
          .from("commuter_wallets")
          .update({ points: newPointsBalance, updated_at: new Date() })
          .eq("commuter_id", currentCommuterId);
        if (updateError) { pointsAwardedRef.current = false; return false; }
      }

      const sourceType = completedBooking.payment_type === 'wallet' ? 'trip_wallet' : 'trip_cash';
      await supabase.from("commuter_points_history").insert({
        commuter_id: currentCommuterId,
        points: pointsToAward,
        type: 'earned',
        source: sourceType,
        source_id: completedBooking.id,
        description: `Earned ${pointsToAward} points from trip`,
        created_at: new Date()
      });

      if (completedBooking.payment_type !== 'wallet') {
        await supabase.from("points_conversion_logs").insert({
          commuter_id: currentCommuterId,
          booking_id: completedBooking.id,
          points_converted: pointsToAward,
          amount_credited: pointsToAward * 0.1,
          conversion_rate: rate,
          created_at: new Date()
        });
      }

      setPointsBalance(newPointsBalance);
      setPointsEarned(pointsToAward);

      if (!pointsAlertShownRef.current && pointsToAward > 0) {
        pointsAlertShownRef.current = true;
        Alert.alert("⭐ Points Earned!", `You earned ${pointsToAward} points for this ride!`, [{ text: "Awesome!" }]);
      }

      pointsAwardedRef.current = false;
      return true;
    } catch (err) {
      pointsAwardedRef.current = false;
      return false;
    }
  };

  const fetchPointsEarnedForBooking = async (retryCount = 0) => {
    let currentBookingId  = bookingId  || route.params?.bookingId;
    let currentCommuterId = commuterId;

    if (!currentBookingId) return;

    if (!currentCommuterId) {
      try {
        const userId = await AsyncStorage.getItem("user_id");
        if (userId) { currentCommuterId = userId; setCommuterId(userId); }
        else return;
      } catch (err) { return; }
    }

    try {
      const { data: historyData, error: historyError } = await supabase
        .from("commuter_points_history")
        .select("points, description, source, created_at")
        .eq("source_id", currentBookingId)
        .eq("commuter_id", currentCommuterId)
        .eq("type", "earned")
        .in("source", ["trip_cash", "trip_wallet", "trip"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!historyError && historyData) {
        setPointsEarned(historyData.points);
        setPointsEarningRate(historyData.source === 'trip_wallet' ? 0.10 : 0.05);
        return;
      }

      const { data: conversionData, error: conversionError } = await supabase
        .from("points_conversion_logs")
        .select("points_converted, conversion_rate")
        .eq("booking_id", currentBookingId)
        .eq("commuter_id", currentCommuterId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!conversionError && conversionData) {
        setPointsEarned(conversionData.points_converted);
        setPointsEarningRate(conversionData.conversion_rate);
        return;
      }

      setPointsEarned(0);
    } catch (err) {
      if (retryCount < 3) {
        setTimeout(() => fetchPointsEarnedForBooking(retryCount + 1), 1000 * (retryCount + 1));
      } else {
        setPointsEarned(0);
      }
    }
  };

  // Reset state when screen focuses
  useFocusEffect(
    React.useCallback(() => {
      setBooking(null);
      setDriver(null);
      setDriverLocation(null);
      setShowCompletedUI(false);
      setNoRideAvailable(false);
      setDriverArrived(false);
      setRideStarted(false);
      setRouteCoordinates([]);
      setTripRouteCoordinates([]);
      setDriverETA(null);
      setShowScanner(false);
      setScanned(false);
      setPaymentSuccess(false);
      setPointsEarned(null);

      fetchPointsConfig();
      checkForActiveBooking();

      return () => {
        if (locationSubscription) locationSubscription.remove();
        setShowScanner(false);
        if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
        if (subscriptionRetryRef.current) clearTimeout(subscriptionRetryRef.current);
        if (statusCheckIntervalRef.current) clearInterval(statusCheckIntervalRef.current);
      };
    }, [])
  );

  useEffect(() => {
    if (booking?.fare) setPotentialPoints(calculatePotentialPoints());
  }, [booking, pointsConfig]);

  // Periodic status check
  useEffect(() => {
    if (!bookingId || !commuterId || showCompletedUI) return;
    if (statusCheckIntervalRef.current) clearInterval(statusCheckIntervalRef.current);

    statusCheckIntervalRef.current = setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from("bookings")
          .select(`status, driver_arrived_at, ride_started_at, fare, payment_type, dropoff_location, payment_status, points_used, ride_completed_at`)
          .eq("id", bookingId)
          .single();

        if (error) throw error;

        if (data.driver_arrived_at && !driverArrived) setDriverArrived(true);
        if (data.ride_started_at && !rideStarted) { setRideStarted(true); setDriverArrived(false); }
        if (data.fare && booking?.fare !== data.fare) {
          setBooking(prev => ({ ...prev, fare: data.fare, payment_type: data.payment_type, payment_status: data.payment_status, points_used: data.points_used }));
        }

        if (data.status === "completed" && status !== "completed") {
          setShowScanner(false); setScanned(false); setProcessingPayment(false);
          setStatus(data.status); setShowCompletedUI(true); setRideStarted(false); setDriverArrived(false);
          if (locationSubscription) locationSubscription.remove();

          if (!pointsAwardedRef.current) {
            const { data: existingPoints } = await supabase
              .from("commuter_points_history").select("id")
              .eq("source_id", bookingId).eq("commuter_id", commuterId).eq("type", "earned").maybeSingle();
            if (!existingPoints && data.fare >= pointsConfig.minFare) {
              await awardPointsForCompletedRide({ id: bookingId, fare: data.fare, payment_type: data.payment_type, dropoff_location: data.dropoff_location });
            } else {
              fetchPointsEarnedForBooking();
            }
          }

          if (!completionAlertShownRef.current) {
            completionAlertShownRef.current = true;
            Alert.alert("🎉 Trip Completed!", "You have reached your destination. Thank you for riding with us!", [
              { text: "Rate Driver", onPress: () => navigation.replace("RateRide", { bookingId, driverId }) },
              { text: "Later", style: "cancel", onPress: () => navigation.navigate("HomePage", { screen: "Home" }) }
            ]);
          }
        }
      } catch (err) {
        console.log("❌ Error in status check interval:", err);
      }
    }, 2000);

    return () => { if (statusCheckIntervalRef.current) clearInterval(statusCheckIntervalRef.current); };
  }, [bookingId, commuterId, status, showCompletedUI, driverArrived, rideStarted, pointsConfig.minFare, booking?.fare]);

  const checkForActiveBooking = async () => {
    try {
      setLoading(true);
      const id = await AsyncStorage.getItem("user_id");
      if (!id) { setNoRideAvailable(true); setLoading(false); return; }
      setCommuterId(id);
      await fetchPointsBalance(id);

      if (route.params?.bookingId) {
        setBookingId(route.params.bookingId);
        setDriverId(route.params.driverId);
        await fetchBookingDetails(route.params.bookingId);
        setTimeout(() => fetchPointsEarnedForBooking(), 1000);
        setLoading(false);
        return;
      }

      const { data: activeData, error: activeError } = await supabase
        .from("bookings")
        .select(`id, driver_id, status, driver_arrived_at, ride_started_at, commuter_rating, pickup_location, dropoff_location, pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude, fare, distance_km, duration_minutes, passenger_count, pickup_details, dropoff_details, payment_type, payment_status, points_used`)
        .eq("commuter_id", id).eq("status", "accepted")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      if (activeError) throw activeError;

      if (activeData) {
        setBookingId(activeData.id); setDriverId(activeData.driver_id);
        setBooking(activeData); setStatus(activeData.status);
        if (activeData.driver_arrived_at) setDriverArrived(true);
        if (activeData.ride_started_at) { setRideStarted(true); setDriverArrived(false); }
        if (activeData.driver_id) fetchDriverDetails(activeData.driver_id);
        if (activeData.pickup_latitude && activeData.pickup_longitude && activeData.dropoff_latitude && activeData.dropoff_longitude) {
          calculateTripRoute({ latitude: activeData.pickup_latitude, longitude: activeData.pickup_longitude }, { latitude: activeData.dropoff_latitude, longitude: activeData.dropoff_longitude });
        }
        setNoRideAvailable(false); setShowCompletedUI(false);
      } else {
        const { data: completedData, error: completedError } = await supabase
          .from("bookings")
          .select(`id, driver_id, status, commuter_rating, pickup_location, dropoff_location, fare, pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude, distance_km, duration_minutes, passenger_count, payment_type, payment_status, points_used`)
          .eq("commuter_id", id).eq("status", "completed")
          .order("created_at", { ascending: false }).limit(1).maybeSingle();

        if (completedError) throw completedError;

        if (completedData) {
          setBookingId(completedData.id); setDriverId(completedData.driver_id);
          setBooking(completedData); setStatus(completedData.status);
          setHasRated(!!completedData.commuter_rating); setShowCompletedUI(true);
          if (completedData.driver_id) fetchDriverDetails(completedData.driver_id);

          setTimeout(async () => {
            const { data: existingPoints } = await supabase
              .from("commuter_points_history").select("points")
              .eq("source_id", completedData.id).eq("commuter_id", id).eq("type", "earned").maybeSingle();
            if (!existingPoints && completedData.fare >= pointsConfig.minFare) {
              await awardPointsForCompletedRide(completedData);
            } else if (existingPoints) {
              setPointsEarned(existingPoints.points);
            } else {
              fetchPointsEarnedForBooking();
            }
          }, 500);

          if (completedData.pickup_latitude && completedData.pickup_longitude && completedData.dropoff_latitude && completedData.dropoff_longitude) {
            calculateTripRoute({ latitude: completedData.pickup_latitude, longitude: completedData.pickup_longitude }, { latitude: completedData.dropoff_latitude, longitude: completedData.dropoff_longitude });
          }
        } else {
          setNoRideAvailable(true);
        }
      }
    } catch (err) {
      setNoRideAvailable(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchPointsBalance = async (userId) => {
    try {
      const { data, error } = await supabase.from("commuter_wallets").select("points").eq("commuter_id", userId).maybeSingle();
      if (error) throw error;
      if (!data) {
        const { data: newWallet, error: createError } = await supabase
          .from("commuter_wallets")
          .insert({ commuter_id: userId, points: 0, balance: 0, updated_at: new Date() })
          .select().single();
        if (createError) throw createError;
        setPointsBalance(newWallet?.points || 0);
      } else {
        setPointsBalance(data?.points || 0);
      }
    } catch (err) {
      console.log("❌ Error fetching points balance:", err);
    }
  };

  const fetchBookingDetails = async (id) => {
    try {
      const { data, error } = await supabase.from("bookings").select("*").eq("id", id).single();
      if (error) throw error;
      setBooking(data); setStatus(data.status); setHasRated(!!data.commuter_rating);
      if (data.driver_arrived_at) setDriverArrived(true);
      if (data.ride_started_at) { setRideStarted(true); setDriverArrived(false); }
      if (data.status === "accepted") {
        setShowCompletedUI(false);
      } else if (data.status === "completed" || data.status === "cancelled") {
        setShowCompletedUI(true);
        let currentCommuterId = commuterId;
        if (!currentCommuterId) {
          try {
            const userId = await AsyncStorage.getItem("user_id");
            if (userId) { currentCommuterId = userId; setCommuterId(userId); }
          } catch (err) {}
        }
        if (data.status === "completed" && currentCommuterId) {
          setTimeout(async () => {
            const { data: existingPoints } = await supabase
              .from("commuter_points_history").select("id")
              .eq("source_id", data.id).eq("commuter_id", currentCommuterId).eq("type", "earned").maybeSingle();
            if (!existingPoints && data.fare >= pointsConfig.minFare) {
              await awardPointsForCompletedRide(data);
            } else {
              fetchPointsEarnedForBooking();
            }
          }, 1000);
        } else {
          fetchPointsEarnedForBooking();
        }
      }
      if (data.driver_id) { setDriverId(data.driver_id); fetchDriverDetails(data.driver_id); }
      if (data.pickup_latitude && data.pickup_longitude && data.dropoff_latitude && data.dropoff_longitude) {
        calculateTripRoute({ latitude: data.pickup_latitude, longitude: data.pickup_longitude }, { latitude: data.dropoff_latitude, longitude: data.dropoff_longitude });
      }
    } catch (err) {
      Alert.alert("Error", "Failed to load booking details");
    }
  };

  const fetchDriverDetails = async (id) => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from("drivers")
        .select(`id, first_name, last_name, phone, profile_picture, driver_vehicles (vehicle_type, vehicle_color, plate_number)`)
        .eq("id", id).single();
      if (error) throw error;
      setDriver(data);
    } catch (err) {}
  };

  // Subscribe to real-time updates
  useEffect(() => {
    if (!bookingId) return;

    const bookingSubscription = supabase
      .channel(`booking-${bookingId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `id=eq.${bookingId}` },
        async (payload) => {
          if (payload.new) {
            const oldStatus = status;
            const newStatus = payload.new.status;
            setBooking(payload.new); setStatus(newStatus);
            if (payload.new.driver_arrived_at && !driverArrived) setDriverArrived(true);
            if (payload.new.ride_started_at && !rideStarted) { setRideStarted(true); setDriverArrived(false); }

            if (newStatus === "completed" && oldStatus !== "completed") {
              setShowScanner(false); setScanned(false); setProcessingPayment(false);
              setShowCompletedUI(true); setRideStarted(false); setDriverArrived(false);
              if (locationSubscription) locationSubscription.remove();

              let currentCommuterId = commuterId;
              if (!currentCommuterId) {
                try {
                  const userId = await AsyncStorage.getItem("user_id");
                  if (userId) { currentCommuterId = userId; setCommuterId(userId); }
                } catch (err) {}
              }

              setTimeout(async () => {
                const { data: existingPoints } = await supabase
                  .from("commuter_points_history").select("id")
                  .eq("source_id", payload.new.id).eq("commuter_id", currentCommuterId).eq("type", "earned").maybeSingle();
                if (!existingPoints && payload.new.fare >= pointsConfig.minFare) {
                  await awardPointsForCompletedRide(payload.new);
                } else {
                  fetchPointsEarnedForBooking();
                }
              }, 1000);

              if (!completionAlertShownRef.current) {
                completionAlertShownRef.current = true;
                Alert.alert("🎉 Trip Completed!", "You have reached your destination. Thank you for riding with us!", [
                  { text: "Rate Driver", onPress: () => navigation.replace("RateRide", { bookingId: payload.new.id, driverId: payload.new.driver_id }) },
                  { text: "Later", style: "cancel", onPress: () => navigation.goBack() }
                ]);
              }
            } else if (newStatus === "cancelled") {
              setShowCompletedUI(true); setShowScanner(false);
              Alert.alert("❌ Trip Cancelled", payload.new.cancellation_reason || "The trip has been cancelled.", [{ text: "OK", onPress: () => navigation.goBack() }]);
            }
          }
        })
      .subscribe();

    return () => {
      bookingSubscription.unsubscribe();
      if (subscriptionRetryRef.current) clearTimeout(subscriptionRetryRef.current);
    };
  }, [bookingId, commuterId, pointsConfig.minFare, driverArrived, rideStarted]);

  // Subscribe to driver location updates
  useEffect(() => {
    if (!driverId || status !== "accepted" || showCompletedUI || rideStarted) return;

    const driverLocationSubscription = supabase
      .channel(`driver-location-${driverId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations', filter: `driver_id=eq.${driverId}` },
        (payload) => {
          if (payload.new) {
            const newLocation = { latitude: payload.new.latitude, longitude: payload.new.longitude };
            setDriverLocation(newLocation); setDriverLocationLoaded(true);
            if (booking && !driverArrived && !rideStarted) {
              calculateDriverETA(newLocation, { latitude: booking.pickup_latitude, longitude: booking.pickup_longitude });
              const distanceToPickup = calculateDistance(newLocation.latitude, newLocation.longitude, booking.pickup_latitude, booking.pickup_longitude);
              if (distanceToPickup < 0.05 && !driverArrived && !rideStarted) setDriverArrived(true);
            }
          }
        })
      .subscribe();

    fetchDriverLocation();

    return () => { driverLocationSubscription.unsubscribe(); };
  }, [driverId, status, booking, driverArrived, rideStarted, showCompletedUI]);

  const fetchDriverLocation = async () => {
    if (!driverId) return;
    try {
      const { data, error } = await supabase.from("driver_locations").select("latitude, longitude").eq("driver_id", driverId).maybeSingle();
      if (error) return;
      if (data) {
        const newLocation = { latitude: data.latitude, longitude: data.longitude };
        setDriverLocation(newLocation); setDriverLocationLoaded(true);
        if (booking && !driverArrived && !rideStarted) {
          const distanceToPickup = calculateDistance(newLocation.latitude, newLocation.longitude, booking.pickup_latitude, booking.pickup_longitude);
          if (distanceToPickup < 0.05) setDriverArrived(true);
        }
      }
    } catch (err) {}
  };

  const startUserLocationTracking = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const subscription = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 }, () => {});
      setLocationSubscription(subscription);
    } catch (err) {}
  };

  const calculateDriverETA = async (driverLoc, pickupLoc) => {
    if (!driverLoc || !pickupLoc) return;
    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${driverLoc.latitude},${driverLoc.longitude}&destination=${pickupLoc.latitude},${pickupLoc.longitude}&key=${googleApiKey}&mode=driving`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.status === "OK" && data.routes[0]) {
        const leg = data.routes[0].legs[0];
        setDriverETA(Math.round(leg.duration.value / 60));
        const points = decodePolyline(data.routes[0].overview_polyline.points);
        setRouteCoordinates(points);
        if (mapRef.current && points.length > 0) {
          mapRef.current.fitToCoordinates(points, { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: true });
        }
      }
    } catch (err) {}
  };

  const calculateTripRoute = async (startCoords, endCoords) => {
    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${startCoords.latitude},${startCoords.longitude}&destination=${endCoords.latitude},${endCoords.longitude}&key=${googleApiKey}&mode=driving`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.status === "OK" && data.routes[0]) {
        const leg = data.routes[0].legs[0];
        setTripDistance((leg.distance.value / 1000).toFixed(1));
        setTripDuration(Math.round(leg.duration.value / 60));
        setTripRouteCoordinates(decodePolyline(data.routes[0].overview_polyline.points));
      }
    } catch (err) {}
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const decodePolyline = (encoded) => {
    const points = [];
    let index = 0, lat = 0, lng = 0;
    while (index < encoded.length) {
      let b, shift = 0, result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lat += ((result & 1) ? ~(result >> 1) : (result >> 1));
      shift = 0; result = 0;
      do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lng += ((result & 1) ? ~(result >> 1) : (result >> 1));
      points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
    }
    return points;
  };

  const fitMapToMarkers = () => {
    if (mapRef.current && !showCompletedUI) {
      const markers = [];
      if (driverLocation && !rideStarted) markers.push(driverLocation);
      if (booking?.pickup_latitude && booking?.pickup_longitude) markers.push({ latitude: booking.pickup_latitude, longitude: booking.pickup_longitude });
      if (booking?.dropoff_latitude && booking?.dropoff_longitude) markers.push({ latitude: booking.dropoff_latitude, longitude: booking.dropoff_longitude });
      if (markers.length > 0) mapRef.current.fitToCoordinates(markers, { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: true });
    }
  };

  const handlePayWithPoints = () => {
    if (showCompletedUI || status === "completed") return;
    Alert.alert("Pay with Points", `Your points balance: ${pointsBalance}\n\nScan driver's QR code to pay with points. (10 points = ₱1)`, [
      { text: "Cancel", style: "cancel" },
      { text: "Continue", onPress: openScanner }
    ]);
  };

  const openScanner = async () => {
    if (showCompletedUI || status === "completed") { Alert.alert("Trip Completed", "This trip has already been completed."); return; }
    try {
      if (!permission?.granted) {
        const { granted } = await requestPermission();
        if (!granted) { Alert.alert("Camera Permission Required", "We need camera access to scan the driver's QR code.", [{ text: "OK" }]); return; }
      }
      setScanned(false);
      setShowScanner(true);
    } catch (err) {}
  };

  const handleBarCodeScanned = async ({ type, data }) => {
    if (showCompletedUI || status === "completed") { setShowScanner(false); Alert.alert("Trip Completed", "This trip has already been completed."); return; }
    if (scanned || processingPayment) return;
    setScanned(true);
    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    try {
      const qrData = JSON.parse(data);
      if (qrData.type !== 'points_payment') {
        Alert.alert("Invalid QR Code", "This is not a valid payment QR code.", [{ text: "OK", onPress: () => { scanTimeoutRef.current = setTimeout(() => { setScanned(false); scanTimeoutRef.current = null; }, 2000); } }]);
        return;
      }
      if (qrData.booking_id !== bookingId) {
        Alert.alert("Invalid QR Code", "This QR code is for a different booking.", [{ text: "OK", onPress: () => { scanTimeoutRef.current = setTimeout(() => { setScanned(false); scanTimeoutRef.current = null; }, 2000); } }]);
        return;
      }
      if (new Date(qrData.expires_at) < new Date()) {
        Alert.alert("QR Code Expired", "This payment QR code has expired. Please ask the driver to generate a new one.", [{ text: "OK", onPress: () => setShowScanner(false) }]);
        return;
      }
      await processPointsPayment(qrData);
    } catch (err) {
      Alert.alert("Invalid QR Code", "Could not read the QR code. Please try again.", [{ text: "OK", onPress: () => { scanTimeoutRef.current = setTimeout(() => { setScanned(false); scanTimeoutRef.current = null; }, 2000); } }]);
    }
  };

  const processPointsPayment = async (qrData) => {
    if (showCompletedUI || status === "completed") { setShowScanner(false); Alert.alert("Trip Completed", "This trip has already been completed."); return; }
    try {
      setProcessingPayment(true);
      const userId = await AsyncStorage.getItem("user_id");
      if (!userId) throw new Error("Not authenticated");
      if (userId !== commuterId) setCommuterId(userId);

      const { data: wallet, error: walletError } = await supabase.from("commuter_wallets").select("points").eq("commuter_id", userId).maybeSingle();
      if (walletError) throw walletError;

      let currentWallet = wallet;
      if (!currentWallet) {
        const { data: newWallet, error: createError } = await supabase.from("commuter_wallets").insert({ commuter_id: userId, points: 0, balance: 0, updated_at: new Date() }).select().single();
        if (createError) throw createError;
        currentWallet = newWallet;
      }

      if (currentWallet.points < qrData.points) {
        Alert.alert("Insufficient Points", `You need ${qrData.points} points to pay ₱${qrData.amount}. Your balance: ${currentWallet.points || 0} points.\n\nWould you like to inform the driver to switch to cash payment?`, [
          { text: "Cancel", style: "cancel", onPress: () => { setShowScanner(false); setProcessingPayment(false); scanTimeoutRef.current = setTimeout(() => { setScanned(false); scanTimeoutRef.current = null; }, 1000); } },
          { text: "Notify Driver", onPress: () => { setShowScanner(false); setProcessingPayment(false); Alert.alert("Please inform the driver that you'll pay with cash instead."); scanTimeoutRef.current = setTimeout(() => { setScanned(false); scanTimeoutRef.current = null; }, 1000); } }
        ]);
        return;
      }

      const newPoints = currentWallet.points - qrData.points;
      const { error: updateError } = await supabase.from("commuter_wallets").update({ points: newPoints, updated_at: new Date() }).eq("commuter_id", userId);
      if (updateError) throw updateError;

      await supabase.from("commuter_points_history").insert({ commuter_id: userId, points: qrData.points, type: 'redeemed', source: 'trip', source_id: bookingId, description: `Points payment for trip`, created_at: new Date() });
      await supabase.from("bookings").update({ payment_status: "paid", payment_type: "wallet", actual_fare: qrData.amount, points_used: qrData.points, updated_at: new Date() }).eq("id", bookingId);

      setPointsBalance(newPoints); setPaymentSuccess(true); setShowScanner(false);

      const { data: updatedBooking } = await supabase.from("bookings").select("*").eq("id", bookingId).single();
      if (updatedBooking) setBooking(updatedBooking);

      Alert.alert("✅ Payment Successful!", `You paid ₱${qrData.amount.toFixed(2)} using ${qrData.points} points.\n\nRemaining points: ${newPoints}`, [{ text: "Great!" }]);
    } catch (err) {
      let errorMessage = "There was an error processing your payment. Please try again or pay with cash.";
      if (err.message === "Not authenticated") errorMessage = "Your session has expired. Please log in again and try the payment.";
      Alert.alert("Payment Failed", errorMessage, [{ text: "OK", onPress: () => {
        setShowScanner(false);
        scanTimeoutRef.current = setTimeout(() => { setScanned(false); scanTimeoutRef.current = null; }, 1000);
        if (err.message === "Not authenticated") navigation.replace("Login");
      }}]);
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleCancelScanning = () => {
    setShowScanner(false); setScanned(false); setProcessingPayment(false);
    if (scanTimeoutRef.current) { clearTimeout(scanTimeoutRef.current); scanTimeoutRef.current = null; }
  };

  const handleCancelRide = () => {
    Alert.alert("Cancel Ride", "Are you sure you want to cancel this ride? You may be charged a cancellation fee.", [
      { text: "No", style: "cancel" },
      { text: "Yes, Cancel", style: "destructive", onPress: async () => {
        try {
          const { error } = await supabase.from("bookings").update({ status: "cancelled", cancellation_reason: "Cancelled by commuter", cancelled_by: "commuter", cancelled_at: new Date(), updated_at: new Date() }).eq("id", bookingId);
          if (error) throw error;
          Alert.alert("Ride Cancelled", "Your ride has been cancelled.", [{ text: "OK", onPress: () => navigation.goBack() }]);
        } catch (err) {
          Alert.alert("Error", "Failed to cancel ride");
        }
      }}
    ]);
  };

  const handleContactDriver = () => {
    if (!driver?.phone) { Alert.alert("Error", "Driver phone number not available"); return; }
    Alert.alert("Contact Driver", "How would you like to contact the driver?", [
      { text: "Cancel", style: "cancel" },
      { text: "📞 Call", onPress: () => Linking.openURL(`tel:${driver.phone}`) },
      { text: "💬 Message", onPress: () => Linking.openURL(`sms:${driver.phone}`) }
    ]);
  };

  const handleBookRide = () => navigation.navigate("Home");
  const handleBackToHome = () => navigation.navigate("Home");

  const getStatusMessage = () => {
    if (status === "cancelled") return "Trip cancelled";
    if (status === "completed") return hasRated ? "Trip completed - Thank you!" : "Trip completed";
    if (!driverId) return "Looking for driver...";
    if (rideStarted) return "On the way";
    if (driverArrived) return "Driver has arrived";
    if (!driverLocationLoaded) return "Driver is online";
    if (!driverLocation) return "Location not available";
    return driverETA ? `${driverETA} min away` : "Driver is on the way";
  };

  const getStatusIcon = () => {
    if (rideStarted) return "navigate-circle";
    if (driverArrived) return "location";
    if (status === "accepted") return "car";
    if (status === "completed") return "checkmark-circle";
    if (status === "cancelled") return "close-circle";
    return "navigate";
  };

  const getStatusColor = () => {
    if (rideStarted) return "#F59E0B";
    if (driverArrived) return "#10B981";
    if (status === "accepted") return "#3B82F6";
    if (status === "completed") return "#10B981";
    if (status === "cancelled") return "#EF4444";
    return "#6B7280";
  };

  const canCancel = status === "accepted" && !driverArrived && !rideStarted;
  const showDriverLocation = driverLocation !== null && status === "accepted" && !rideStarted && !showCompletedUI;
  const showRouteToDriver = status === "accepted" && !driverArrived && !rideStarted && routeCoordinates.length > 0 && !showCompletedUI;
  const showTripRoute = (rideStarted || driverArrived || status === "completed") && tripRouteCoordinates.length > 0 && !showCompletedUI;
  const showPointsPayment = status === "accepted" && rideStarted && booking?.payment_type === 'wallet' && booking?.payment_status === 'pending' && !paymentSuccess && !showCompletedUI;

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  // ─── QR Scanner ─────────────────────────────────────────────────────────────
  if (showScanner && !showCompletedUI && status !== "completed") {
    return (
      <View style={styles.container}>
        <View style={styles.scannerHeader}>
          <Pressable onPress={handleCancelScanning} style={styles.scannerBackButton}>
            <Ionicons name="close" size={28} color="#FFF" />
          </Pressable>
          <Text style={styles.scannerTitle}>Scan Driver's QR Code</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.scannerContainer}>
          <CameraView style={styles.scanner} facing="back" onBarcodeScanned={scanned ? undefined : handleBarCodeScanned} barcodeScannerSettings={{ barcodeTypes: ['qr'] }}>
            <View style={styles.scannerOverlay}>
              <View style={styles.scanArea}>
                <View style={styles.scanCorner} />
                <View style={[styles.scanCorner, styles.scanCornerTopRight]} />
                <View style={[styles.scanCorner, styles.scanCornerBottomLeft]} />
                <View style={[styles.scanCorner, styles.scanCornerBottomRight]} />
              </View>
              <Text style={styles.scannerInstruction}>Position QR code within the frame</Text>
              {processingPayment && (
                <View style={styles.processingContainer}>
                  <ActivityIndicator size="large" color="#FFF" />
                  <Text style={styles.processingText}>Processing payment...</Text>
                </View>
              )}
            </View>
          </CameraView>
        </View>
        <View style={styles.scannerFooter}>
          <Text style={styles.scannerFooterText}>Make sure the QR code is clearly visible</Text>
        </View>
      </View>
    );
  }

  // ─── No Ride ────────────────────────────────────────────────────────────────
  if (noRideAvailable) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#183B5C', '#183B5C']} style={styles.headerGradient}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Track Your Ride</Text>
            <Text style={styles.headerSubtitle}>No Active Ride</Text>
          </View>
        </LinearGradient>
        <View style={styles.noRideContainer}>
          <View style={styles.noRideIconContainer}>
            <Ionicons name="car-outline" size={80} color="#CBD5E0" />
          </View>
          <Text style={styles.noRideTitle}>No Active Ride</Text>
          <Text style={styles.noRideMessage}>You don't have any active rides at the moment.{'\n'}Book a ride to get started!</Text>
          <Pressable style={styles.bookRideButton} onPress={handleBookRide}>
            <Ionicons name="search" size={20} color="#FFF" />
            <Text style={styles.bookRideButtonText}>Find a Ride</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ─── Completed / Cancelled ───────────────────────────────────────────────────
  if (showCompletedUI) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#183B5C', '#183B5C']} style={styles.headerGradient}>
          <Pressable onPress={handleBackToHome} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>{status === "completed" ? "Trip Completed" : "Trip Cancelled"}</Text>
          </View>
        </LinearGradient>

        <ScrollView style={styles.completedContainer} showsVerticalScrollIndicator={false}>
          <View style={styles.completedIconContainer}>
            <Ionicons name={status === "completed" ? "checkmark-circle" : "close-circle"} size={80} color={status === "completed" ? "#10B981" : "#EF4444"} />
          </View>
          <Text style={styles.completedTitle}>{status === "completed" ? "Thank You!" : "Ride Cancelled"}</Text>
          <Text style={styles.completedMessage}>
            {status === "completed"
              ? hasRated ? "Thank you for rating your driver!" : "How was your ride? Rate your driver to help improve our service."
              : "This ride has been cancelled."}
          </Text>

          {status === "completed" && booking?.payment_type && (
            <View style={styles.completedPaymentCard}>
              <Text style={styles.completedPaymentTitle}>Payment Details</Text>
              <View style={styles.completedPaymentRow}>
                <Text style={styles.completedPaymentLabel}>Method</Text>
                <Text style={styles.completedPaymentValue}>{booking.payment_type === 'wallet' ? '⭐ Points' : '💰 Cash'}</Text>
              </View>
              <View style={styles.completedPaymentRow}>
                <Text style={styles.completedPaymentLabel}>Amount</Text>
                <Text style={styles.completedPaymentValue}>₱{booking.fare?.toFixed(2) || "0.00"}</Text>
              </View>
              {booking.points_used > 0 && (
                <View style={styles.completedPaymentRow}>
                  <Text style={styles.completedPaymentLabel}>Points Used</Text>
                  <Text style={styles.completedPaymentValue}>{booking.points_used}</Text>
                </View>
              )}
              {pointsEarned !== null && pointsEarned > 0 && (
                <View style={styles.pointsEarnedContainer}>
                  <View style={styles.pointsEarnedDivider} />
                  <View style={styles.completedPaymentRow}>
                    <Text style={styles.completedPaymentLabel}>⭐ Points Earned</Text>
                    <Text style={[styles.completedPaymentValue, styles.pointsEarnedValue]}>+{pointsEarned}</Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {driver && (
            <View style={styles.completedDriverCard}>
              <View style={styles.completedDriverAvatar}>
                {driver.profile_picture ? (
                  <Image source={{ uri: driver.profile_picture }} style={styles.completedDriverImage} />
                ) : (
                  <View style={styles.completedDriverAvatarPlaceholder}><Ionicons name="person" size={30} color="#FFF" /></View>
                )}
              </View>
              <View style={styles.completedDriverInfo}>
                <Text style={styles.completedDriverName}>{driver.first_name} {driver.last_name}</Text>
                {driver.driver_vehicles?.[0] && <Text style={styles.completedVehicleInfo}>{driver.driver_vehicles[0].vehicle_color} {driver.driver_vehicles[0].vehicle_type}</Text>}
              </View>
            </View>
          )}

          {booking && (
            <View style={styles.completedTripDetails}>
              <View style={styles.completedLocationRow}>
                <Ionicons name="location" size={16} color="#10B981" />
                <Text style={styles.completedLocationText} numberOfLines={2}>{booking.pickup_location}</Text>
              </View>
              <View style={styles.completedLocationRow}>
                <Ionicons name="flag" size={16} color="#EF4444" />
                <Text style={styles.completedLocationText} numberOfLines={2}>{booking.dropoff_location}</Text>
              </View>
            </View>
          )}

          {status === "completed" && !hasRated && (
            <Pressable style={styles.completedRateButton} onPress={() => navigation.replace("RateRide", { bookingId, driverId })}>
              <Ionicons name="star" size={20} color="#FFF" />
              <Text style={styles.completedRateButtonText}>Rate Your Driver</Text>
            </Pressable>
          )}

          <Pressable style={styles.completedHomeButton} onPress={handleBackToHome}>
            <Ionicons name="home" size={20} color="#183B5C" />
            <Text style={styles.completedHomeButtonText}>Back to Home</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // ─── Active Ride ─────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient colors={['#183B5C', '#183B5C']} style={styles.headerGradient}>
        <Pressable onPress={() => navigation.navigate("HomePage", { screen: "Home" })} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.headerSubtitle}>Live Tracking</Text>
          <Text style={styles.headerTitle}>
            {rideStarted ? "En Route" : driverArrived ? "Driver Arrived" : "Finding Driver"}
          </Text>
        </View>
        {canCancel && (
          <Pressable style={styles.cancelHeaderButton} onPress={handleCancelRide}>
            <Ionicons name="close-circle" size={24} color="#FFB37A" />
          </Pressable>
        )}
      </LinearGradient>

      {/* Map */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={{ latitude: booking?.pickup_latitude || 14.5995, longitude: booking?.pickup_longitude || 120.9842, latitudeDelta: 0.0922, longitudeDelta: 0.0421 }}
          onMapReady={fitMapToMarkers}
          showsUserLocation={true}
          showsMyLocationButton={true}
          showsCompass={true}
        >
          {showDriverLocation && driverLocation && (
            <Marker coordinate={driverLocation} title="Your Driver">
              <View style={styles.driverMarker}><Ionicons name="car" size={20} color="#FFF" /></View>
            </Marker>
          )}
          {booking?.pickup_latitude && (
            <Marker coordinate={{ latitude: booking.pickup_latitude, longitude: booking.pickup_longitude }} title="Pickup Location">
              <View style={styles.pickupMarker}><Ionicons name="location" size={16} color="#FFF" /></View>
            </Marker>
          )}
          {booking?.dropoff_latitude && (
            <Marker coordinate={{ latitude: booking.dropoff_latitude, longitude: booking.dropoff_longitude }} title="Dropoff Location">
              <View style={styles.dropoffMarker}><Ionicons name="flag" size={16} color="#FFF" /></View>
            </Marker>
          )}
          {showRouteToDriver && <Polyline coordinates={routeCoordinates} strokeColor="#3B82F6" strokeWidth={4} lineDashPattern={[1]} />}
          {showTripRoute && <Polyline coordinates={tripRouteCoordinates} strokeColor="#10B981" strokeWidth={4} />}
        </MapView>

        <Pressable style={styles.locateButton} onPress={fitMapToMarkers}>
          <Ionicons name="locate" size={24} color="#183B5C" />
        </Pressable>
      </View>

      {/* ─── Draggable Bottom Sheet ───────────────────────────────────────────── */}
      <Animated.View
        style={[
          styles.bottomSheet,
          { transform: [{ translateY: bottomSheetY }] },
        ]}
      >
        {/* Handle — the only drag target */}
        <View style={styles.bottomSheetHandle} {...panResponder.panHandlers}>
          <View style={styles.handleBar} />
          <Text style={styles.handleHint}>Swipe to resize</Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.bottomSheetContent}
          // Prevent ScrollView from eating the pan gesture when sheet is not fully expanded
          scrollEnabled={lastY.current <= SNAP_EXPANDED + 10}
        >
          {/* Status Card */}
          <View style={[styles.statusCard, { borderLeftColor: getStatusColor() }]}>
            <View style={[styles.statusIcon, { backgroundColor: getStatusColor() + "15" }]}>
              <Ionicons name={getStatusIcon()} size={28} color={getStatusColor()} />
            </View>
            <View style={styles.statusInfo}>
              <Text style={styles.statusMessage}>{getStatusMessage()}</Text>
              <Text style={styles.statusDetail}>
                {rideStarted ? "Heading to your destination" :
                 driverArrived ? "Please go to pickup point" :
                 driverETA ? `Estimated arrival in ${driverETA} minutes` :
                 "Preparing your ride"}
              </Text>
            </View>
          </View>

          {/* Driver Card */}
          {driver && (
            <View style={styles.driverCard}>
              <View style={styles.driverAvatar}>
                {driver.profile_picture ? (
                  <Image source={{ uri: driver.profile_picture }} style={styles.driverImage} />
                ) : (
                  <View style={styles.driverAvatarPlaceholder}><Ionicons name="person" size={24} color="#FFF" /></View>
                )}
              </View>
              <View style={styles.driverInfo}>
                <Text style={styles.driverName}>{driver.first_name} {driver.last_name}</Text>
                {driver.driver_vehicles?.[0] && <Text style={styles.vehicleInfo}>{driver.driver_vehicles[0].vehicle_color} {driver.driver_vehicles[0].vehicle_type}</Text>}
              </View>
              <Pressable style={styles.contactButton} onPress={handleContactDriver}>
                <Ionicons name="chatbubble-ellipses" size={24} color="#183B5C" />
              </Pressable>
            </View>
          )}

          {/* Trip Details */}
          <View style={styles.tripDetails}>
            <View style={styles.locationRow}>
              <View style={styles.locationIcon}><Ionicons name="location" size={16} color="#10B981" /></View>
              <Text style={styles.locationText} numberOfLines={1}>{booking?.pickup_location}</Text>
            </View>
            <View style={styles.locationDivider} />
            <View style={styles.locationRow}>
              <View style={styles.locationIcon}><Ionicons name="flag" size={16} color="#EF4444" /></View>
              <Text style={styles.locationText} numberOfLines={1}>{booking?.dropoff_location}</Text>
            </View>
          </View>

          {/* Stats */}
          {(tripDistance || booking?.distance_km) && (
            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                <Ionicons name="map-outline" size={20} color="#666" />
                <Text style={styles.statValue}>{tripDistance || booking?.distance_km || "?"} km</Text>
                <Text style={styles.statLabel}>Distance</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Ionicons name="time-outline" size={20} color="#666" />
                <Text style={styles.statValue}>{tripDuration || booking?.duration_minutes || "?"} min</Text>
                <Text style={styles.statLabel}>Duration</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Ionicons name="cash-outline" size={20} color="#666" />
                <Text style={styles.statValue}>₱{booking?.fare?.toFixed(2) || "0.00"}</Text>
                <Text style={styles.statLabel}>Fare</Text>
              </View>
            </View>
          )}

          {/* Points Preview */}
          {rideStarted && booking?.fare > 0 && booking.fare >= pointsConfig.minFare && (
            <View style={styles.pointsPreviewContainer}>
              <Ionicons name="star" size={20} color="#F59E0B" />
              <Text style={styles.pointsPreviewText}>
                Earn <Text style={styles.pointsPreviewHighlight}>{potentialPoints} points</Text> for this trip
              </Text>
            </View>
          )}

          {/* Points Payment Button */}
          {showPointsPayment && (
            <Pressable style={styles.pointsPaymentButton} onPress={handlePayWithPoints}>
              <LinearGradient colors={['#F59E0B', '#F97316']} style={styles.pointsPaymentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Ionicons name="qr-code" size={24} color="#FFF" />
                <View style={styles.pointsPaymentTextContainer}>
                  <Text style={styles.pointsPaymentTitle}>Pay with Points</Text>
                  <Text style={styles.pointsPaymentSubtitle}>Balance: {pointsBalance} points</Text>
                </View>
                <Ionicons name="chevron-forward" size={24} color="#FFF" />
              </LinearGradient>
            </Pressable>
          )}

          {/* Cancel Button */}
          {canCancel && (
            <Pressable style={styles.cancelButton} onPress={handleCancelRide}>
              <Ionicons name="close-circle" size={20} color="#EF4444" />
              <Text style={styles.cancelButtonText}>Cancel Ride</Text>
            </Pressable>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FA" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F5F7FA" },
  headerGradient: { paddingTop: 20, paddingBottom: 20, paddingHorizontal: 20, flexDirection: "row", alignItems: "center" },
  backButton: { marginRight: 15 },
  headerContent: { flex: 1 },
  headerSubtitle: { fontSize: 14, color: "rgba(255,255,255,0.8)", fontWeight: "500" },
  headerTitle: { fontSize: 20, fontWeight: "bold", color: "#FFF", marginTop: 2 },
  cancelHeaderButton: { padding: 8 },
  mapContainer: { flex: 1, position: "relative" },
  map: { flex: 1 },
  driverMarker: { backgroundColor: "#3B82F6", padding: 8, borderRadius: 20, borderWidth: 2, borderColor: "#FFF", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  pickupMarker: { backgroundColor: "#10B981", padding: 6, borderRadius: 16, borderWidth: 2, borderColor: "#FFF", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  dropoffMarker: { backgroundColor: "#EF4444", padding: 6, borderRadius: 16, borderWidth: 2, borderColor: "#FFF", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  locateButton: { position: "absolute", bottom: 20, right: 20, backgroundColor: "#FFF", width: 48, height: 48, borderRadius: 24, justifyContent: "center", alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 },

  // ─── Bottom Sheet ────────────────────────────────────────────────────────────
  bottomSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    // Height is generously large; translateY controls visibility
    height: height,
    top: 0,
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
  bottomSheetHandle: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 6,
    // Extend touch area vertically for easier grab
    paddingHorizontal: 20,
  },
  handleBar: { width: 44, height: 5, backgroundColor: "#D1D5DB", borderRadius: 3 },
  handleHint: { fontSize: 10, color: "#9CA3AF", marginTop: 4, letterSpacing: 0.5 },
  bottomSheetContent: { paddingHorizontal: 20, paddingBottom: 20 },

  statusCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 12, borderLeftWidth: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  statusIcon: { width: 52, height: 52, borderRadius: 26, justifyContent: "center", alignItems: "center", marginRight: 12 },
  statusInfo: { flex: 1 },
  statusMessage: { fontSize: 18, fontWeight: "600", color: "#1F2937", marginBottom: 4 },
  statusDetail: { fontSize: 13, color: "#6B7280" },
  driverCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  driverAvatar: { width: 52, height: 52, borderRadius: 26, marginRight: 12, overflow: "hidden" },
  driverAvatarPlaceholder: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#183B5C", justifyContent: "center", alignItems: "center" },
  driverImage: { width: 52, height: 52, borderRadius: 26 },
  driverInfo: { flex: 1 },
  driverName: { fontSize: 16, fontWeight: "600", color: "#1F2937", marginBottom: 2 },
  vehicleInfo: { fontSize: 12, color: "#6B7280" },
  contactButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#F3F4F6", justifyContent: "center", alignItems: "center" },
  tripDetails: { backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  locationRow: { flexDirection: "row", alignItems: "center" },
  locationIcon: { width: 28, alignItems: "center" },
  locationText: { fontSize: 14, color: "#374151", flex: 1, marginLeft: 8 },
  locationDivider: { height: 1, backgroundColor: "#E5E7EB", marginVertical: 12, marginLeft: 28 },
  statsContainer: { flexDirection: "row", backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 12, justifyContent: "space-between", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  statItem: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 16, fontWeight: "bold", color: "#1F2937", marginTop: 6 },
  statLabel: { fontSize: 11, color: "#6B7280", marginTop: 2 },
  statDivider: { width: 1, backgroundColor: "#E5E7EB" },
  pointsPreviewContainer: { flexDirection: "row", alignItems: "center", backgroundColor: "#FEF3C7", padding: 12, borderRadius: 12, marginBottom: 12, gap: 8 },
  pointsPreviewText: { fontSize: 13, color: "#92400E", flex: 1 },
  pointsPreviewHighlight: { fontWeight: "bold", color: "#F59E0B" },
  pointsPaymentButton: { marginBottom: 12, borderRadius: 12, overflow: "hidden" },
  pointsPaymentGradient: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  pointsPaymentTextContainer: { flex: 1 },
  pointsPaymentTitle: { color: "#FFF", fontSize: 16, fontWeight: "bold" },
  pointsPaymentSubtitle: { color: "#FFF", fontSize: 12, opacity: 0.9, marginTop: 2 },
  cancelButton: { backgroundColor: "#FEF2F2", padding: 14, borderRadius: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 10 },
  cancelButtonText: { color: "#EF4444", fontWeight: "600", fontSize: 16 },

  // ─── No Ride ─────────────────────────────────────────────────────────────────
  noRideContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 30, backgroundColor: "#F5F7FA" },
  noRideIconContainer: { width: 120, height: 120, borderRadius: 60, backgroundColor: "#F3F4F6", justifyContent: "center", alignItems: "center", marginBottom: 24 },
  noRideTitle: { fontSize: 24, fontWeight: "bold", color: "#1F2937", marginBottom: 8, textAlign: "center" },
  noRideMessage: { fontSize: 16, color: "#6B7280", textAlign: "center", lineHeight: 22, marginBottom: 32 },
  bookRideButton: { backgroundColor: "#183B5C", flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 16, paddingHorizontal: 32, borderRadius: 12, gap: 8 },
  bookRideButtonText: { color: "#FFF", fontSize: 16, fontWeight: "600" },

  // ─── Completed ────────────────────────────────────────────────────────────────
  completedContainer: { flex: 1, paddingHorizontal: 20, backgroundColor: "#F5F7FA" },
  completedIconContainer: { alignItems: "center", marginVertical: 24 },
  completedTitle: { fontSize: 24, fontWeight: "bold", color: "#1F2937", marginBottom: 8, textAlign: "center" },
  completedMessage: { fontSize: 16, color: "#6B7280", textAlign: "center", marginBottom: 24, lineHeight: 22 },
  completedPaymentCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  completedPaymentTitle: { fontSize: 16, fontWeight: "bold", color: "#1F2937", marginBottom: 12 },
  completedPaymentRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  completedPaymentLabel: { fontSize: 14, color: "#6B7280" },
  completedPaymentValue: { fontSize: 14, fontWeight: "600", color: "#1F2937" },
  pointsEarnedContainer: { marginTop: 8 },
  pointsEarnedDivider: { height: 1, backgroundColor: "#E5E7EB", marginVertical: 12 },
  pointsEarnedValue: { color: "#F59E0B" },
  completedDriverCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  completedDriverAvatar: { width: 60, height: 60, borderRadius: 30, marginRight: 16, overflow: "hidden" },
  completedDriverAvatarPlaceholder: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#183B5C", justifyContent: "center", alignItems: "center" },
  completedDriverImage: { width: 60, height: 60, borderRadius: 30 },
  completedDriverInfo: { flex: 1 },
  completedDriverName: { fontSize: 18, fontWeight: "bold", color: "#1F2937", marginBottom: 4 },
  completedVehicleInfo: { fontSize: 14, color: "#6B7280" },
  completedTripDetails: { backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  completedLocationRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 12 },
  completedLocationText: { fontSize: 14, color: "#374151", flex: 1, marginLeft: 8 },
  completedRateButton: { backgroundColor: "#183B5C", flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 16, borderRadius: 12, marginBottom: 12, gap: 8 },
  completedRateButtonText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  completedHomeButton: { backgroundColor: "#FFF", flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: "#183B5C", gap: 8 },
  completedHomeButtonText: { color: "#183B5C", fontSize: 16, fontWeight: "600" },

  // ─── Scanner ─────────────────────────────────────────────────────────────────
  scannerHeader: { backgroundColor: "#1F2937", paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  scannerBackButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)", justifyContent: "center", alignItems: "center" },
  scannerTitle: { fontSize: 18, fontWeight: "bold", color: "#FFF" },
  scannerContainer: { flex: 1, backgroundColor: "#000" },
  scanner: { flex: 1 },
  scannerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  scanArea: { width: 250, height: 250, position: "relative" },
  scanCorner: { position: "absolute", width: 40, height: 40, borderColor: "#FFF", borderTopWidth: 4, borderLeftWidth: 4, top: 0, left: 0 },
  scanCornerTopRight: { right: 0, left: "auto", borderLeftWidth: 0, borderRightWidth: 4 },
  scanCornerBottomLeft: { bottom: 0, top: "auto", borderTopWidth: 0, borderBottomWidth: 4 },
  scanCornerBottomRight: { bottom: 0, top: "auto", right: 0, left: "auto", borderTopWidth: 0, borderLeftWidth: 0, borderRightWidth: 4, borderBottomWidth: 4 },
  scannerInstruction: { color: "#FFF", fontSize: 16, marginTop: 30, textAlign: "center" },
  processingContainer: { marginTop: 30, alignItems: "center" },
  processingText: { color: "#FFF", fontSize: 16, marginTop: 10 },
  scannerFooter: { backgroundColor: "#1F2937", padding: 20, alignItems: "center" },
  scannerFooterText: { color: "#FFF", fontSize: 14, textAlign: "center" },
});