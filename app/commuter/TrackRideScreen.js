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

export default function TrackRide({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const mapRef = useRef(null);
  const scanTimeoutRef = useRef(null);
  const pointsAwardedRef = useRef(false);
  const subscriptionRetryRef = useRef(null);
  const statusCheckIntervalRef = useRef(null);
  const completionAlertShownRef = useRef(false); // NEW: Prevent duplicate completion alerts
  const pointsAlertShownRef = useRef(false); // NEW: Prevent duplicate points alerts
  
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
      if (subscriptionRetryRef.current) {
        clearTimeout(subscriptionRetryRef.current);
      }
      if (statusCheckIntervalRef.current) {
        clearInterval(statusCheckIntervalRef.current);
      }
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
        switch(item.key) {
          case 'points_earning_rate_cash':
            config.cashRate = parseFloat(item.value);
            break;
          case 'points_earning_rate_wallet':
            config.walletRate = parseFloat(item.value);
            break;
          case 'min_fare_for_points':
            config.minFare = parseInt(item.value);
            break;
          case 'points_rounding':
            config.rounding = item.value;
            break;
        }
      });
      setPointsConfig(config);
      console.log("✅ Points config loaded:", config);
    } catch (err) {
      console.log("❌ Error fetching points config:", err);
    }
  };

  // Calculate potential points for current ride
  const calculatePotentialPoints = () => {
    if (!booking?.fare) return 0;
    
    const rate = booking.payment_type === 'wallet' 
      ? pointsConfig.walletRate 
      : pointsConfig.cashRate;
    
    let points = booking.fare * rate;
    
    switch(pointsConfig.rounding) {
      case 'ceil':
        points = Math.ceil(points);
        break;
      case 'round':
        points = Math.round(points);
        break;
      default:
        points = Math.floor(points);
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
    
    // Get current commuter ID from state or AsyncStorage
    let currentCommuterId = commuterId;
    
    if (!currentCommuterId) {
      try {
        const userId = await AsyncStorage.getItem("user_id");
        if (userId) {
          currentCommuterId = userId;
          setCommuterId(userId);
          console.log("✅ Got commuterId from AsyncStorage:", userId);
        } else {
          console.log("❌ No commuter ID found in AsyncStorage");
          return false;
        }
      } catch (err) {
        console.log("❌ Error getting commuter ID:", err);
        return false;
      }
    }
    
    if (!completedBooking || !completedBooking.id || !currentCommuterId) {
      console.log("❌ Missing required data for awarding points", { 
        hasBooking: !!completedBooking, 
        hasId: completedBooking?.id, 
        hasCommuterId: !!currentCommuterId 
      });
      return false;
    }

    // Prevent duplicate awards
    if (pointsAwardedRef.current) {
      console.log("⚠️ Points already being awarded, skipping duplicate call");
      return false;
    }

    try {
      pointsAwardedRef.current = true;

      // Check if points were already awarded
      const { data: existingPoints, error: checkError } = await supabase
        .from("commuter_points_history")
        .select("id, points")
        .eq("source_id", completedBooking.id)
        .eq("commuter_id", currentCommuterId)
        .eq("type", "earned")
        .maybeSingle();

      if (checkError) {
        console.log("❌ Error checking existing points:", checkError);
        pointsAwardedRef.current = false;
        return false;
      }

      if (existingPoints) {
        console.log("✅ Points already awarded for this booking:", existingPoints);
        setPointsEarned(existingPoints.points);
        
        // Also fetch the current balance
        const { data: wallet } = await supabase
          .from("commuter_wallets")
          .select("points")
          .eq("commuter_id", currentCommuterId)
          .single();
        
        if (wallet) {
          setPointsBalance(wallet.points);
        }
        
        pointsAwardedRef.current = false;
        return true;
      }

      // Calculate points
      const fare = completedBooking.fare || 0;
      console.log(`💰 Fare: ₱${fare}, Min Fare: ₱${pointsConfig.minFare}`);
      
      if (fare < pointsConfig.minFare) {
        console.log(`ℹ️ Fare ₱${fare} below minimum ₱${pointsConfig.minFare} - no points awarded`);
        setPointsEarned(0);
        pointsAwardedRef.current = false;
        return false;
      }

      const rate = completedBooking.payment_type === 'wallet' ? pointsConfig.walletRate : pointsConfig.cashRate;
      
      // Use the configured rounding method
      let pointsToAward;
      switch(pointsConfig.rounding) {
        case 'ceil':
          pointsToAward = Math.ceil(fare * rate);
          break;
        case 'round':
          pointsToAward = Math.round(fare * rate);
          break;
        default: // floor
          pointsToAward = Math.floor(fare * rate);
      }

      console.log(`⭐ Points calculation: ${fare} × ${rate} = ${pointsToAward} points`);

      if (pointsToAward <= 0) {
        console.log("ℹ️ No points to award (calculated to 0)");
        setPointsEarned(0);
        pointsAwardedRef.current = false;
        return false;
      }

      // Get or create wallet
      let { data: wallet, error: walletError } = await supabase
        .from("commuter_wallets")
        .select("*")
        .eq("commuter_id", currentCommuterId)
        .maybeSingle();

      if (walletError) {
        console.log("❌ Error fetching wallet:", walletError);
        pointsAwardedRef.current = false;
        return false;
      }

      let newPointsBalance;

      if (!wallet) {
        // Create new wallet
        console.log("📝 Creating new wallet for commuter:", currentCommuterId);
        const { data: newWallet, error: createError } = await supabase
          .from("commuter_wallets")
          .insert({
            commuter_id: currentCommuterId,
            points: pointsToAward,
            balance: 0,
            created_at: new Date(),
            updated_at: new Date()
          })
          .select()
          .single();

        if (createError) {
          console.log("❌ Error creating wallet:", createError);
          pointsAwardedRef.current = false;
          return false;
        }

        newPointsBalance = pointsToAward;
        console.log("✅ Created new wallet with points:", newPointsBalance);
      } else {
        // Update existing wallet
        newPointsBalance = (wallet.points || 0) + pointsToAward;
        console.log(`💰 Wallet before: ${wallet.points}, after: ${newPointsBalance}`);
        
        const { error: updateError } = await supabase
          .from("commuter_wallets")
          .update({
            points: newPointsBalance,
            updated_at: new Date()
          })
          .eq("commuter_id", currentCommuterId);

        if (updateError) {
          console.log("❌ Error updating wallet:", updateError);
          pointsAwardedRef.current = false;
          return false;
        }

        console.log("✅ Wallet updated successfully");
      }

      // Record in points history
      const sourceType = completedBooking.payment_type === 'wallet' ? 'trip_wallet' : 'trip_cash';
      
      const { error: historyError } = await supabase
        .from("commuter_points_history")
        .insert({
          commuter_id: currentCommuterId,
          points: pointsToAward,
          type: 'earned',
          source: sourceType,
          source_id: completedBooking.id,
          description: `Earned ${pointsToAward} points from trip to ${completedBooking.dropoff_location?.split(',')[0] || 'destination'}`,
          created_at: new Date()
        });

      if (historyError) {
        console.log("❌ Error recording history:", historyError);
      } else {
        console.log("✅ Points history recorded");
      }

      // Record conversion log for non-wallet payments
      if (completedBooking.payment_type !== 'wallet') {
        const { error: conversionError } = await supabase
          .from("points_conversion_logs")
          .insert({
            commuter_id: currentCommuterId,
            booking_id: completedBooking.id,
            points_converted: pointsToAward,
            amount_credited: pointsToAward * 0.1,
            conversion_rate: rate,
            created_at: new Date()
          });

        if (conversionError) {
          console.log("❌ Error recording points conversion:", conversionError);
        } else {
          console.log("✅ Points conversion logged");
        }
      }

      // Update local state
      setPointsBalance(newPointsBalance);
      setPointsEarned(pointsToAward);

      console.log(`✅ SUCCESS: Awarded ${pointsToAward} points. New balance: ${newPointsBalance}`);
      
      // Show success message only once
      if (!pointsAlertShownRef.current && pointsToAward > 0) {
        pointsAlertShownRef.current = true;
        Alert.alert(
          "⭐ Points Earned!",
          `You earned ${pointsToAward} points for this ride!\n\nTotal points: ${newPointsBalance}`,
          [{ text: "Awesome!" }]
        );
      }

      pointsAwardedRef.current = false;
      return true;

    } catch (err) {
      console.log("❌ Error in awardPointsForCompletedRide:", err);
      pointsAwardedRef.current = false;
      return false;
    }
  };

  // Fetch points earned for completed booking
  const fetchPointsEarnedForBooking = async (retryCount = 0) => {
    // Check if we have both IDs
    let currentBookingId = bookingId;
    let currentCommuterId = commuterId;
    
    if (!currentBookingId) {
      console.log("⚠️ No bookingId available for fetchPointsEarnedForBooking");
      if (route.params?.bookingId) {
        currentBookingId = route.params.bookingId;
        console.log("✅ Using bookingId from route params:", currentBookingId);
      } else {
        console.log("❌ No bookingId found anywhere");
        return;
      }
    }
    
    if (!currentCommuterId) {
      console.log("⚠️ No commuterId available for fetchPointsEarnedForBooking");
      try {
        const userId = await AsyncStorage.getItem("user_id");
        if (userId) {
          currentCommuterId = userId;
          setCommuterId(userId);
          console.log("✅ Using commuterId from AsyncStorage:", userId);
        } else {
          console.log("❌ No commuterId found in AsyncStorage");
          return;
        }
      } catch (err) {
        console.log("❌ Error getting commuterId from AsyncStorage:", err);
        return;
      }
    }
    
    console.log("🔍 Fetching points earned for booking:", { 
      bookingId: currentBookingId, 
      commuterId: currentCommuterId 
    });
    
    try {
      // First try commuter_points_history
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
        console.log("✅ Found points in history:", historyData);
        setPointsEarned(historyData.points);
        
        if (historyData.source === 'trip_wallet') {
          setPointsEarningRate(0.10);
        } else {
          setPointsEarningRate(0.05);
        }
        return;
      }
      
      // Try points_conversion_logs as backup
      const { data: conversionData, error: conversionError } = await supabase
        .from("points_conversion_logs")
        .select("points_converted, conversion_rate")
        .eq("booking_id", currentBookingId)
        .eq("commuter_id", currentCommuterId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!conversionError && conversionData) {
        console.log("✅ Found points in conversion logs:", conversionData);
        setPointsEarned(conversionData.points_converted);
        setPointsEarningRate(conversionData.conversion_rate);
        return;
      }
      
      console.log("ℹ️ No points record found in database");
      setPointsEarned(0);
    } catch (err) {
      console.log("❌ Error fetching points earned:", err);
      
      if (retryCount < 3) {
        console.log(`🔄 Retrying fetchPointsEarnedForBooking (attempt ${retryCount + 1}/3)`);
        setTimeout(() => {
          fetchPointsEarnedForBooking(retryCount + 1);
        }, 1000 * (retryCount + 1));
      } else {
        setPointsEarned(0);
      }
    }
  };

  // Reset state when screen focuses
  useFocusEffect(
    React.useCallback(() => {
      console.log("🎯 TrackRide focused - resetting state");
      
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
      setShowScanner(false); // IMPORTANT: Ensure scanner is hidden
      setScanned(false);
      setPaymentSuccess(false);
      setPointsEarned(null);
      
      fetchPointsConfig();
      checkForActiveBooking();
      
      return () => {
        console.log("🧹 Cleaning up TrackRide");
        if (locationSubscription) {
          locationSubscription.remove();
        }
        setShowScanner(false);
        if (scanTimeoutRef.current) {
          clearTimeout(scanTimeoutRef.current);
        }
        if (subscriptionRetryRef.current) {
          clearTimeout(subscriptionRetryRef.current);
        }
        if (statusCheckIntervalRef.current) {
          clearInterval(statusCheckIntervalRef.current);
        }
      };
    }, [])
  );

  // Update potential points when booking or points config changes
  useEffect(() => {
    if (booking?.fare) {
      setPotentialPoints(calculatePotentialPoints());
    }
  }, [booking, pointsConfig]);

  // FIXED: Periodic status check for real-time updates (every 2 seconds)
  useEffect(() => {
    if (!bookingId || !commuterId || showCompletedUI) return;

    // Clear existing interval
    if (statusCheckIntervalRef.current) {
      clearInterval(statusCheckIntervalRef.current);
    }

    // Set up interval to check booking status
    statusCheckIntervalRef.current = setInterval(async () => {
      try {
        console.log("⏰ Checking booking status for real-time updates:", bookingId);
        const { data, error } = await supabase
          .from("bookings")
          .select(`
            status, 
            driver_arrived_at, 
            ride_started_at, 
            fare, 
            payment_type, 
            dropoff_location,
            payment_status,
            points_used,
            ride_completed_at
          `)
          .eq("id", bookingId)
          .single();

        if (error) throw error;

        // Update driver arrived status
        if (data.driver_arrived_at && !driverArrived) {
          console.log("📍 Driver has arrived at pickup! (periodic check)");
          setDriverArrived(true);
        }

        // Update ride started status
        if (data.ride_started_at && !rideStarted) {
          console.log("🚗 Ride has started! (periodic check)");
          setRideStarted(true);
          setDriverArrived(false);
        }

        // Update booking with latest fare from database
        if (data.fare && booking?.fare !== data.fare) {
          console.log(`💰 Fare updated from database: ₱${data.fare}`);
          setBooking(prev => ({
            ...prev,
            fare: data.fare,
            payment_type: data.payment_type,
            payment_status: data.payment_status,
            points_used: data.points_used
          }));
        }

        // Check if completed
        if (data.status === "completed" && status !== "completed") {
          console.log("🎉 Detected completed status via periodic check!");
          
          // IMPORTANT: Hide scanner immediately when trip completes
          setShowScanner(false);
          setScanned(false);
          setProcessingPayment(false);
          
          setStatus(data.status);
          setShowCompletedUI(true);
          setRideStarted(false);
          setDriverArrived(false);
          
          if (locationSubscription) {
            locationSubscription.remove();
          }
          
          // Award points if not already awarded
          if (!pointsAwardedRef.current) {
            const { data: existingPoints } = await supabase
              .from("commuter_points_history")
              .select("id")
              .eq("source_id", bookingId)
              .eq("commuter_id", commuterId)
              .eq("type", "earned")
              .maybeSingle();

            if (!existingPoints && data.fare >= pointsConfig.minFare) {
              await awardPointsForCompletedRide({
                id: bookingId,
                fare: data.fare,
                payment_type: data.payment_type,
                dropoff_location: data.dropoff_location
              });
            } else {
              fetchPointsEarnedForBooking();
            }
          }
          
          // Show completion alert only once
          if (!completionAlertShownRef.current) {
            completionAlertShownRef.current = true;
            Alert.alert(
              "🎉 Trip Completed!",
              "You have reached your destination. Thank you for riding with us!",
              [
                { 
                  text: "Rate Driver", 
                  onPress: () => navigation.replace("RateRide", { 
                    bookingId, 
                    driverId 
                  })
                },
                {
                  text: "Later",
                  style: "cancel",
                  onPress: () => navigation.goBack()
                }
              ]
            );
          }
        }
      } catch (err) {
        console.log("❌ Error in status check interval:", err);
      }
    }, 2000);

    return () => {
      if (statusCheckIntervalRef.current) {
        clearInterval(statusCheckIntervalRef.current);
      }
    };
  }, [bookingId, commuterId, status, showCompletedUI, driverArrived, rideStarted, pointsConfig.minFare, booking?.fare]);

  const checkForActiveBooking = async () => {
    try {
      setLoading(true);
      
      const id = await AsyncStorage.getItem("user_id");
      
      if (!id) {
        console.log("❌ No user ID found in AsyncStorage");
        setNoRideAvailable(true);
        setLoading(false);
        return;
      }

      console.log("✅ User ID from AsyncStorage:", id);
      setCommuterId(id);

      await fetchPointsBalance(id);

      if (route.params?.bookingId) {
        console.log("📦 Using booking from params:", route.params.bookingId);
        setBookingId(route.params.bookingId);
        setDriverId(route.params.driverId);
        await fetchBookingDetails(route.params.bookingId);
        
        setTimeout(() => {
          fetchPointsEarnedForBooking();
        }, 1000);
        
        setLoading(false);
        return;
      }

      // First check for active booking
      const { data: activeData, error: activeError } = await supabase
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
          points_used
        `)
        .eq("commuter_id", id)
        .eq("status", "accepted")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeError) throw activeError;

      if (activeData) {
        console.log("✅ Found active booking:", activeData);
        setBookingId(activeData.id);
        setDriverId(activeData.driver_id);
        setBooking(activeData);
        setStatus(activeData.status);
        
        if (activeData.driver_arrived_at) {
          setDriverArrived(true);
        }
        
        if (activeData.ride_started_at) {
          setRideStarted(true);
          setDriverArrived(false);
        }
        
        if (activeData.driver_id) {
          fetchDriverDetails(activeData.driver_id);
        }
        
        if (activeData.pickup_latitude && activeData.pickup_longitude && 
            activeData.dropoff_latitude && activeData.dropoff_longitude) {
          calculateTripRoute(
            { latitude: activeData.pickup_latitude, longitude: activeData.pickup_longitude },
            { latitude: activeData.dropoff_latitude, longitude: activeData.dropoff_longitude }
          );
        }
        
        setNoRideAvailable(false);
        setShowCompletedUI(false);
      } else {
        // Check for completed booking
        const { data: completedData, error: completedError } = await supabase
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
            points_used
          `)
          .eq("commuter_id", id)
          .eq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (completedError) throw completedError;

        if (completedData) {
          console.log("📊 Found completed booking:", completedData);
          setBookingId(completedData.id);
          setDriverId(completedData.driver_id);
          setBooking(completedData);
          setStatus(completedData.status);
          setHasRated(!!completedData.commuter_rating);
          setShowCompletedUI(true);
          
          if (completedData.driver_id) {
            fetchDriverDetails(completedData.driver_id);
          }
          
          // Check and award points if needed
          setTimeout(async () => {
            const { data: existingPoints } = await supabase
              .from("commuter_points_history")
              .select("points")
              .eq("source_id", completedData.id)
              .eq("commuter_id", id)
              .eq("type", "earned")
              .maybeSingle();
            
            if (!existingPoints && completedData.fare >= pointsConfig.minFare) {
              console.log("🔄 Awarding points for completed booking found in check");
              await awardPointsForCompletedRide(completedData);
            } else if (existingPoints) {
              console.log("✅ Points already awarded:", existingPoints);
              setPointsEarned(existingPoints.points);
            } else {
              fetchPointsEarnedForBooking();
            }
          }, 500);
          
          if (completedData.pickup_latitude && completedData.pickup_longitude && 
              completedData.dropoff_latitude && completedData.dropoff_longitude) {
            calculateTripRoute(
              { latitude: completedData.pickup_latitude, longitude: completedData.pickup_longitude },
              { latitude: completedData.dropoff_latitude, longitude: completedData.dropoff_longitude }
            );
          }
        } else {
          console.log("ℹ️ No bookings found");
          setNoRideAvailable(true);
        }
      }
    } catch (err) {
      console.log("❌ Error checking for active booking:", err);
      setNoRideAvailable(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchPointsBalance = async (userId) => {
    try {
      const { data, error } = await supabase
        .from("commuter_wallets")
        .select("points")
        .eq("commuter_id", userId)
        .maybeSingle();

      if (error) throw error;
      
      if (!data) {
        console.log("📝 Creating wallet for user:", userId);
        const { data: newWallet, error: createError } = await supabase
          .from("commuter_wallets")
          .insert({
            commuter_id: userId,
            points: 0,
            balance: 0,
            updated_at: new Date()
          })
          .select()
          .single();

        if (createError) throw createError;
        setPointsBalance(newWallet?.points || 0);
      } else {
        setPointsBalance(data?.points || 0);
      }
    } catch (err) {
      console.log("❌ Error fetching points balance:", err);
    }
  };

  // Fetch booking details
  const fetchBookingDetails = async (id) => {
    try {
      console.log("🔍 Fetching booking details for:", id);
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      
      console.log("✅ Booking details found:", data);
      setBooking(data);
      setStatus(data.status);
      setHasRated(!!data.commuter_rating);
      
      if (data.driver_arrived_at) {
        setDriverArrived(true);
      }
      
      if (data.ride_started_at) {
        setRideStarted(true);
        setDriverArrived(false);
      }
      
      if (data.status === "accepted") {
        setShowCompletedUI(false);
      } else if (data.status === "completed" || data.status === "cancelled") {
        setShowCompletedUI(true);
        
        let currentCommuterId = commuterId;
        if (!currentCommuterId) {
          try {
            const userId = await AsyncStorage.getItem("user_id");
            if (userId) {
              currentCommuterId = userId;
              setCommuterId(userId);
            }
          } catch (err) {
            console.log("❌ Error getting commuter ID:", err);
          }
        }
        
        if (data.status === "completed" && currentCommuterId) {
          setTimeout(async () => {
            const { data: existingPoints } = await supabase
              .from("commuter_points_history")
              .select("id")
              .eq("source_id", data.id)
              .eq("commuter_id", currentCommuterId)
              .eq("type", "earned")
              .maybeSingle();
            
            if (!existingPoints && data.fare >= pointsConfig.minFare) {
              console.log("🔄 Awarding points from fetchBookingDetails");
              await awardPointsForCompletedRide(data);
            } else if (existingPoints) {
              console.log("✅ Points already exist for this booking");
              fetchPointsEarnedForBooking();
            } else {
              fetchPointsEarnedForBooking();
            }
          }, 1000);
        } else {
          fetchPointsEarnedForBooking();
        }
      }
      
      if (data.driver_id) {
        setDriverId(data.driver_id);
        fetchDriverDetails(data.driver_id);
      }
      
      if (data.pickup_latitude && data.pickup_longitude && 
          data.dropoff_latitude && data.dropoff_longitude) {
        calculateTripRoute(
          { latitude: data.pickup_latitude, longitude: data.pickup_longitude },
          { latitude: data.dropoff_latitude, longitude: data.dropoff_longitude }
        );
      }
    } catch (err) {
      console.log("❌ Error fetching booking:", err);
      Alert.alert("Error", "Failed to load booking details");
    }
  };

  const fetchDriverDetails = async (id) => {
    if (!id) return;

    try {
      console.log("🔍 Fetching driver details for:", id);
      const { data, error } = await supabase
        .from("drivers")
        .select(`
          id,
          first_name,
          last_name,
          phone,
          profile_picture,
          driver_vehicles (
            vehicle_type,
            vehicle_color,
            plate_number
          )
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      
      console.log("✅ Driver details found:", data);
      setDriver(data);
    } catch (err) {
      console.log("❌ Error fetching driver:", err);
    }
  };

  // Subscribe to real-time updates
  useEffect(() => {
    if (!bookingId) return;

    console.log("📡 Setting up real-time subscription for booking:", bookingId);

    const bookingSubscription = supabase
      .channel(`booking-${bookingId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookings',
          filter: `id=eq.${bookingId}`,
        },
        async (payload) => {
          console.log("📅 Booking updated - new status:", payload.new.status);
          
          if (payload.new) {
            const oldStatus = status;
            const newStatus = payload.new.status;
            
            // Update booking with latest data from database
            setBooking(payload.new);
            setStatus(newStatus);
            
            // Update driver arrived status
            if (payload.new.driver_arrived_at && !driverArrived) {
              console.log("✅ Driver has arrived at pickup!");
              setDriverArrived(true);
            }
            
            // Update ride started status
            if (payload.new.ride_started_at && !rideStarted) {
              console.log("✅ Ride has started!");
              setRideStarted(true);
              setDriverArrived(false);
            }
            
            // Check if status changed to completed
            if (newStatus === "completed" && oldStatus !== "completed") {
              console.log("🎉 RIDE COMPLETED via real-time update!");
              
              // IMPORTANT: Hide scanner immediately when trip completes
              setShowScanner(false);
              setScanned(false);
              setProcessingPayment(false);
              
              setShowCompletedUI(true);
              setRideStarted(false);
              setDriverArrived(false);
              
              if (locationSubscription) {
                locationSubscription.remove();
              }
              
              // Get current commuter ID
              let currentCommuterId = commuterId;
              if (!currentCommuterId) {
                try {
                  const userId = await AsyncStorage.getItem("user_id");
                  if (userId) {
                    currentCommuterId = userId;
                    setCommuterId(userId);
                  }
                } catch (err) {
                  console.log("❌ Error getting commuter ID:", err);
                }
              }
              
              // Award points
              setTimeout(async () => {
                const { data: existingPoints } = await supabase
                  .from("commuter_points_history")
                  .select("id")
                  .eq("source_id", payload.new.id)
                  .eq("commuter_id", currentCommuterId)
                  .eq("type", "earned")
                  .maybeSingle();
                
                if (!existingPoints && payload.new.fare >= pointsConfig.minFare) {
                  console.log("🔄 Awarding points from real-time update");
                  const pointsAwarded = await awardPointsForCompletedRide(payload.new);
                  console.log("Points awarded:", pointsAwarded);
                } else if (existingPoints) {
                  console.log("Points already exist for this booking");
                  fetchPointsEarnedForBooking();
                } else {
                  fetchPointsEarnedForBooking();
                }
              }, 1000);
              
              // Show completion alert only once
              if (!completionAlertShownRef.current) {
                completionAlertShownRef.current = true;
                Alert.alert(
                  "🎉 Trip Completed!",
                  "You have reached your destination. Thank you for riding with us!",
                  [
                    { 
                      text: "Rate Driver", 
                      onPress: () => navigation.replace("RateRide", { 
                        bookingId: payload.new.id, 
                        driverId: payload.new.driver_id 
                      })
                    },
                    {
                      text: "Later",
                      style: "cancel",
                      onPress: () => navigation.goBack()
                    }
                  ]
                );
              }
            } else if (newStatus === "cancelled") {
              setShowCompletedUI(true);
              // Hide scanner if open
              setShowScanner(false);
              Alert.alert(
                "❌ Trip Cancelled",
                payload.new.cancellation_reason || "The trip has been cancelled.",
                [{ text: "OK", onPress: () => navigation.goBack() }]
              );
            }
          }
        }
      )
      .subscribe((status) => {
        console.log("📡 Subscription status:", status);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.log("⚠️ Subscription error, will retry...");
          if (subscriptionRetryRef.current) {
            clearTimeout(subscriptionRetryRef.current);
          }
          subscriptionRetryRef.current = setTimeout(() => {
            console.log("🔄 Retrying subscription...");
            checkForActiveBooking();
          }, 5000);
        }
      });

    return () => {
      console.log("🧹 Cleaning up subscription for booking:", bookingId);
      bookingSubscription.unsubscribe();
      if (subscriptionRetryRef.current) {
        clearTimeout(subscriptionRetryRef.current);
      }
    };
  }, [bookingId, commuterId, pointsConfig.minFare, driverArrived, rideStarted]);

  // Subscribe to driver location updates
  useEffect(() => {
    if (!driverId || status !== "accepted" || showCompletedUI || rideStarted) return;

    console.log("📍 Setting up driver location listener for:", driverId);

    const driverLocationSubscription = supabase
      .channel(`driver-location-${driverId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_locations',
          filter: `driver_id=eq.${driverId}`,
        },
        (payload) => {
          if (payload.new) {
            const newLocation = {
              latitude: payload.new.latitude,
              longitude: payload.new.longitude,
            };
            setDriverLocation(newLocation);
            setDriverLocationLoaded(true);
            
            if (booking && !driverArrived && !rideStarted) {
              calculateDriverETA(newLocation, {
                latitude: booking.pickup_latitude,
                longitude: booking.pickup_longitude
              });
              
              const distanceToPickup = calculateDistance(
                newLocation.latitude,
                newLocation.longitude,
                booking.pickup_latitude,
                booking.pickup_longitude
              );
              
              if (distanceToPickup < 0.05 && !driverArrived && !rideStarted) {
                console.log("📍 Driver is within 50 meters - arrived!");
                setDriverArrived(true);
              }
            }
          }
        }
      )
      .subscribe();

    fetchDriverLocation();

    return () => {
      driverLocationSubscription.unsubscribe();
    };
  }, [driverId, status, booking, driverArrived, rideStarted, showCompletedUI]);

  const fetchDriverLocation = async () => {
    if (!driverId) return;
    
    try {
      const { data, error } = await supabase
        .from("driver_locations")
        .select("latitude, longitude")
        .eq("driver_id", driverId)
        .maybeSingle();

      if (error) {
        console.log("❌ Error fetching driver location:", error);
        return;
      }

      if (data) {
        const newLocation = {
          latitude: data.latitude,
          longitude: data.longitude,
        };
        setDriverLocation(newLocation);
        setDriverLocationLoaded(true);
        
        if (booking && !driverArrived && !rideStarted) {
          const distanceToPickup = calculateDistance(
            newLocation.latitude,
            newLocation.longitude,
            booking.pickup_latitude,
            booking.pickup_longitude
          );
          
          if (distanceToPickup < 0.05) {
            console.log("📍 Driver is already near pickup!");
            setDriverArrived(true);
          }
        }
      }
    } catch (err) {
      console.log("❌ Error in fetchDriverLocation:", err);
    }
  };

  const startUserLocationTracking = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        return;
      }

      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        (newLocation) => {}
      );

      setLocationSubscription(subscription);
    } catch (err) {
      console.log("❌ Error tracking location:", err);
    }
  };

  const calculateDriverETA = async (driverLoc, pickupLoc) => {
    if (!driverLoc || !pickupLoc) return;
    
    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${driverLoc.latitude},${driverLoc.longitude}&destination=${pickupLoc.latitude},${pickupLoc.longitude}&key=${googleApiKey}&mode=driving`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === "OK" && data.routes[0]) {
        const leg = data.routes[0].legs[0];
        const minutes = Math.round(leg.duration.value / 60);
        setDriverETA(minutes);
        
        const points = decodePolyline(data.routes[0].overview_polyline.points);
        setRouteCoordinates(points);
        
        if (mapRef.current && points.length > 0) {
          mapRef.current.fitToCoordinates(points, {
            edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
            animated: true,
          });
        }
      }
    } catch (err) {
      console.log("❌ Error calculating ETA:", err);
    }
  };

  const calculateTripRoute = async (startCoords, endCoords) => {
    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${startCoords.latitude},${startCoords.longitude}&destination=${endCoords.latitude},${endCoords.longitude}&key=${googleApiKey}&mode=driving`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === "OK" && data.routes[0]) {
        const leg = data.routes[0].legs[0];
        const distanceKm = (leg.distance.value / 1000).toFixed(1);
        const timeMins = Math.round(leg.duration.value / 60);
        
        setTripDistance(distanceKm);
        setTripDuration(timeMins);
        
        const points = decodePolyline(data.routes[0].overview_polyline.points);
        setTripRouteCoordinates(points);
      }
    } catch (err) {
      console.log("❌ Error calculating trip route:", err);
    }
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const decodePolyline = (encoded) => {
    const points = [];
    let index = 0, lat = 0, lng = 0;

    while (index < encoded.length) {
      let b, shift = 0, result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lng += dlng;

      points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
    }
    return points;
  };

  const fitMapToMarkers = () => {
    if (mapRef.current && !showCompletedUI) {
      const markers = [];
      
      if (driverLocation && !rideStarted) markers.push(driverLocation);
      if (booking?.pickup_latitude && booking?.pickup_longitude) {
        markers.push({
          latitude: booking.pickup_latitude,
          longitude: booking.pickup_longitude,
        });
      }
      if (booking?.dropoff_latitude && booking?.dropoff_longitude) {
        markers.push({
          latitude: booking.dropoff_latitude,
          longitude: booking.dropoff_longitude,
        });
      }

      if (markers.length > 0) {
        mapRef.current.fitToCoordinates(markers, {
          edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
          animated: true,
        });
      }
    }
  };

  // QR Code Scanning Functions
  const handlePayWithPoints = () => {
    // Don't show payment option if trip is already completed
    if (showCompletedUI || status === "completed") {
      return;
    }
    
    Alert.alert(
      "Pay with Points",
      `Your current points balance: ${pointsBalance}\n\nScan the driver's QR code to pay with your points. (10 points = ₱1)`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Continue", onPress: openScanner }
      ]
    );
  };

  const openScanner = async () => {
    // Don't open scanner if trip is already completed
    if (showCompletedUI || status === "completed") {
      Alert.alert("Trip Completed", "This trip has already been completed.");
      return;
    }
    
    try {
      if (!permission?.granted) {
        const { granted } = await requestPermission();
        if (!granted) {
          Alert.alert(
            "Camera Permission Required",
            "We need camera access to scan the driver's QR code.",
            [{ text: "OK" }]
          );
          return;
        }
      }
      
      setScanned(false);
      setShowScanner(true);
    } catch (err) {
      console.log("❌ Error opening scanner:", err);
    }
  };

  const handleBarCodeScanned = async ({ type, data }) => {
    // Don't process if trip is already completed
    if (showCompletedUI || status === "completed") {
      setShowScanner(false);
      Alert.alert("Trip Completed", "This trip has already been completed.");
      return;
    }
    
    if (scanned || processingPayment) return;
    
    setScanned(true);
    
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
    }
    
    try {
      const qrData = JSON.parse(data);
      console.log("📱 QR Code scanned:", qrData);
      
      if (qrData.type !== 'points_payment') {
        Alert.alert(
          "Invalid QR Code",
          "This is not a valid payment QR code.",
          [{ text: "OK", onPress: () => {
            scanTimeoutRef.current = setTimeout(() => {
              setScanned(false);
              scanTimeoutRef.current = null;
            }, 2000);
          }}]
        );
        return;
      }
      
      if (qrData.booking_id !== bookingId) {
        Alert.alert(
          "Invalid QR Code",
          "This QR code is for a different booking.",
          [{ text: "OK", onPress: () => {
            scanTimeoutRef.current = setTimeout(() => {
              setScanned(false);
              scanTimeoutRef.current = null;
            }, 2000);
          }}]
        );
        return;
      }
      
      const expiresAt = new Date(qrData.expires_at);
      if (expiresAt < new Date()) {
        Alert.alert(
          "QR Code Expired",
          "This payment QR code has expired. Please ask the driver to generate a new one.",
          [{ text: "OK", onPress: () => {
            setShowScanner(false);
          }}]
        );
        return;
      }
      
      await processPointsPayment(qrData);
      
    } catch (err) {
      console.log("❌ Error processing QR code:", err);
      Alert.alert(
        "Invalid QR Code",
        "Could not read the QR code. Please try again.",
        [{ text: "OK", onPress: () => {
          scanTimeoutRef.current = setTimeout(() => {
            setScanned(false);
            scanTimeoutRef.current = null;
          }, 2000);
        }}]
      );
    }
  };

  // FIXED: Process points payment and ensure points are awarded later
  const processPointsPayment = async (qrData) => {
    // Don't process if trip is already completed
    if (showCompletedUI || status === "completed") {
      setShowScanner(false);
      Alert.alert("Trip Completed", "This trip has already been completed.");
      return;
    }
    
    try {
      setProcessingPayment(true);
      
      const userId = await AsyncStorage.getItem("user_id");
      
      if (!userId) {
        console.log("❌ No user ID found in AsyncStorage");
        throw new Error("Not authenticated");
      }

      if (userId !== commuterId) {
        console.log("⚠️ User ID mismatch - updating commuterId");
        setCommuterId(userId);
      }

      const { data: wallet, error: walletError } = await supabase
        .from("commuter_wallets")
        .select("points")
        .eq("commuter_id", userId)
        .maybeSingle();

      if (walletError) throw walletError;

      let currentWallet = wallet;

      if (!currentWallet) {
        console.log("📝 Creating wallet for user:", userId);
        const { data: newWallet, error: createError } = await supabase
          .from("commuter_wallets")
          .insert({
            commuter_id: userId,
            points: 0,
            balance: 0,
            updated_at: new Date()
          })
          .select()
          .single();

        if (createError) throw createError;
        currentWallet = newWallet;
      }

      if (currentWallet.points < qrData.points) {
        Alert.alert(
          "Insufficient Points",
          `You need ${qrData.points} points to pay ₱${qrData.amount}. Your current balance: ${currentWallet.points || 0} points.\n\nWould you like to inform the driver to switch to cash payment?`,
          [
            { text: "Cancel", style: "cancel", onPress: () => {
              setShowScanner(false);
              setProcessingPayment(false);
              scanTimeoutRef.current = setTimeout(() => {
                setScanned(false);
                scanTimeoutRef.current = null;
              }, 1000);
            }},
            { 
              text: "Notify Driver", 
              onPress: () => {
                setShowScanner(false);
                setProcessingPayment(false);
                Alert.alert("Please inform the driver that you'll pay with cash instead.");
                scanTimeoutRef.current = setTimeout(() => {
                  setScanned(false);
                  scanTimeoutRef.current = null;
                }, 1000);
              }
            }
          ]
        );
        return;
      }

      const newPoints = currentWallet.points - qrData.points;
      
      const { error: updateError } = await supabase
        .from("commuter_wallets")
        .update({ 
          points: newPoints,
          updated_at: new Date()
        })
        .eq("commuter_id", userId);

      if (updateError) throw updateError;

      const { error: historyError } = await supabase
        .from("commuter_points_history")
        .insert({
          commuter_id: userId,
          points: qrData.points,
          type: 'redeemed',
          source: 'trip',
          source_id: bookingId,
          description: `Points payment for trip to ${booking?.dropoff_location || 'destination'}`,
          created_at: new Date()
        });

      if (historyError) {
        console.log("❌ Error recording points history:", historyError);
      }

      const { error: bookingError } = await supabase
        .from("bookings")
        .update({
          payment_status: "paid",
          payment_type: "wallet",
          actual_fare: qrData.amount,
          points_used: qrData.points,
          updated_at: new Date()
        })
        .eq("id", bookingId);

      if (bookingError) throw bookingError;

      setPointsBalance(newPoints);
      setPaymentSuccess(true);
      setShowScanner(false);
      
      // Fetch the latest booking data to confirm payment
      const { data: updatedBooking } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", bookingId)
        .single();
      
      if (updatedBooking) {
        setBooking(updatedBooking);
      }
      
      Alert.alert(
        "✅ Payment Successful!",
        `You have successfully paid ₱${qrData.amount.toFixed(2)} using ${qrData.points} points.\n\nRemaining points: ${newPoints}`,
        [{ text: "Great!" }]
      );

    } catch (err) {
      console.log("❌ Error processing payment:", err);
      
      let errorMessage = "There was an error processing your payment. Please try again or pay with cash.";
      
      if (err.message === "Not authenticated") {
        errorMessage = "Your session has expired. Please log in again and try the payment.";
      }
      
      Alert.alert(
        "Payment Failed",
        errorMessage,
        [{ text: "OK", onPress: () => {
          setShowScanner(false);
          scanTimeoutRef.current = setTimeout(() => {
            setScanned(false);
            scanTimeoutRef.current = null;
          }, 1000);
          if (err.message === "Not authenticated") {
            navigation.replace("Login");
          }
        }}]
      );
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleCancelScanning = () => {
    setShowScanner(false);
    setScanned(false);
    setProcessingPayment(false);
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
  };

  const handleCancelRide = () => {
    Alert.alert(
      "Cancel Ride",
      "Are you sure you want to cancel this ride? You may be charged a cancellation fee.",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("bookings")
                .update({
                  status: "cancelled",
                  cancellation_reason: "Cancelled by commuter",
                  cancelled_by: "commuter",
                  cancelled_at: new Date(),
                  updated_at: new Date(),
                })
                .eq("id", bookingId);

              if (error) throw error;
              
              Alert.alert(
                "Ride Cancelled",
                "Your ride has been cancelled.",
                [{ text: "OK", onPress: () => navigation.goBack() }]
              );
            } catch (err) {
              console.log("❌ Error cancelling ride:", err);
              Alert.alert("Error", "Failed to cancel ride");
            }
          }
        }
      ]
    );
  };

  const handleContactDriver = () => {
    if (!driver?.phone) {
      Alert.alert("Error", "Driver phone number not available");
      return;
    }

    Alert.alert(
      "Contact Driver",
      "How would you like to contact the driver?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "📞 Call",
          onPress: () => Linking.openURL(`tel:${driver.phone}`)
        },
        {
          text: "💬 Message",
          onPress: () => Linking.openURL(`sms:${driver.phone}`)
        }
      ]
    );
  };

  const handleBookRide = () => {
    navigation.navigate("Home");
  };

  const handleBackToHome = () => {
    navigation.navigate("Home");
  };

  const getStatusMessage = () => {
    if (status === "cancelled") {
      return "Trip cancelled";
    }
    
    if (status === "completed") {
      return hasRated ? "Trip completed - Thank you for rating!" : "Trip completed";
    }
    
    if (!driverId) {
      return "Looking for driver...";
    }
    
    if (rideStarted) {
      return "On the way to destination";
    }
    
    if (driverArrived) {
      return "Driver has arrived at pickup";
    }
    
    if (!driverLocationLoaded) {
      return "Driver is online - waiting for location...";
    }
    
    if (!driverLocation) {
      return "Driver location not available yet";
    }
    
    return driverETA ? `Driver arriving in ${driverETA} min` : "Driver is on the way";
  };

  const getStatusIcon = () => {
    if (rideStarted) return "navigate";
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

  const showPointsPayment = status === "accepted" && 
                           rideStarted && 
                           booking?.payment_type === 'wallet' && 
                           booking?.payment_status === 'pending' &&
                           !paymentSuccess &&
                           !showCompletedUI; // Don't show if completed

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
      </View>
    );
  }

  // QR Code Scanner Modal - Only show if not completed
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
          <CameraView
            style={styles.scanner}
            facing="back"
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
          >
            <View style={styles.scannerOverlay}>
              <View style={styles.scanArea}>
                <View style={styles.scanCorner} />
                <View style={[styles.scanCorner, styles.scanCornerTopRight]} />
                <View style={[styles.scanCorner, styles.scanCornerBottomLeft]} />
                <View style={[styles.scanCorner, styles.scanCornerBottomRight]} />
              </View>
              
              <Text style={styles.scannerInstruction}>
                Position the QR code within the frame
              </Text>
              
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
          <Text style={styles.scannerFooterText}>
            Make sure the QR code is clearly visible and well-lit
          </Text>
        </View>
      </View>
    );
  }

  // Show "No Ride Available" screen
  if (noRideAvailable) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.headerSubtitle}>Track Your Ride</Text>
            <Text style={styles.headerTitle}>No Active Ride</Text>
          </View>
        </View>

        <View style={styles.noRideContainer}>
          <View style={styles.noRideIconContainer}>
            <Ionicons name="car-outline" size={80} color="#D1D5DB" />
          </View>
          
          <Text style={styles.noRideTitle}>No Active Ride Found</Text>
          
          <Text style={styles.noRideMessage}>
            You don't have any active rides at the moment.{'\n'}
            Book a ride to get started!
          </Text>

          <View style={styles.noRideFeatures}>
            <View style={styles.featureItem}>
              <View style={styles.featureIcon}>
                <Ionicons name="location" size={24} color="#183B5C" />
              </View>
              <Text style={styles.featureText}>Track your ride in real-time</Text>
            </View>

            <View style={styles.featureItem}>
              <View style={styles.featureIcon}>
                <Ionicons name="chatbubble" size={24} color="#183B5C" />
              </View>
              <Text style={styles.featureText}>Contact your driver easily</Text>
            </View>

            <View style={styles.featureItem}>
              <View style={styles.featureIcon}>
                <Ionicons name="star" size={24} color="#183B5C" />
              </View>
              <Text style={styles.featureText}>Rate your ride experience</Text>
            </View>
          </View>

          <Pressable style={styles.bookRideButton} onPress={handleBookRide}>
            <Ionicons name="bicycle" size={24} color="#FFF" />
            <Text style={styles.bookRideButtonText}>Book a Ride Now</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Show completed/cancelled ride summary
  if (showCompletedUI) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={handleBackToHome} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.headerSubtitle}>Ride Summary</Text>
            <Text style={styles.headerTitle}>
              {status === "completed" ? "Trip Completed" : "Trip Cancelled"}
            </Text>
          </View>
        </View>

        <ScrollView style={styles.completedContainer} showsVerticalScrollIndicator={false}>
          <View style={styles.completedIconContainer}>
            <Ionicons 
              name={status === "completed" ? "checkmark-circle" : "close-circle"} 
              size={50} 
              color={status === "completed" ? "#10B981" : "#EF4444"} 
            />
          </View>
          
          <Text style={styles.completedTitle}>
            {status === "completed" ? "Thank You for Riding!" : "Ride Cancelled"}
          </Text>
          
          <Text style={styles.completedMessage}>
            {status === "completed" 
              ? hasRated 
                ? "You've already rated this ride. Thank you for your feedback!"
                : "How was your ride? Rate your driver to help improve our service."
              : "This ride has been cancelled."}
          </Text>

          {/* Payment Info for Completed Rides */}
          {status === "completed" && booking?.payment_type && (
            <View style={styles.completedPaymentCard}>
              <Text style={styles.completedPaymentTitle}>Payment Details</Text>
              <View style={styles.completedPaymentRow}>
                <Text style={styles.completedPaymentLabel}>Method:</Text>
                <Text style={styles.completedPaymentValue}>
                  {booking.payment_type === 'wallet' ? '⭐ Points' : '💵 Cash'}
                </Text>
              </View>
              <View style={styles.completedPaymentRow}>
                <Text style={styles.completedPaymentLabel}>Amount:</Text>
                <Text style={styles.completedPaymentValue}>₱{booking.fare?.toFixed(2) || "0.00"}</Text>
              </View>
              {booking.points_used > 0 && (
                <View style={styles.completedPaymentRow}>
                  <Text style={styles.completedPaymentLabel}>Points Used:</Text>
                  <Text style={styles.completedPaymentValue}>{booking.points_used}</Text>
                </View>
              )}
              
              {/* Points Earned Section */}
              {pointsEarned !== null && pointsEarned > 0 && (
                <View style={styles.pointsEarnedContainer}>
                  <View style={styles.pointsEarnedDivider} />
                  <View style={styles.completedPaymentRow}>
                    <Text style={styles.completedPaymentLabel}>⭐ Points Earned:</Text>
                    <Text style={[styles.completedPaymentValue, styles.pointsEarnedValue]}>
                      +{pointsEarned}
                    </Text>
                  </View>
                  <Text style={styles.pointsEarnedNote}>
                    {booking?.payment_type === 'wallet' 
                      ? `Earned ${(pointsConfig.walletRate * 100).toFixed(0)}% of fare as points (Wallet bonus!)` 
                      : `Earned ${(pointsConfig.cashRate * 100).toFixed(0)}% of fare as points`}
                  </Text>
                </View>
              )}
              
              {pointsEarned === 0 && booking?.fare >= pointsConfig.minFare && (
                <View style={styles.pointsEarnedContainer}>
                  <View style={styles.pointsEarnedDivider} />
                  <Text style={styles.noPointsText}>
                    No points earned for this ride
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Driver Info */}
          {driver && (
            <View style={styles.completedDriverCard}>
              <View style={styles.completedDriverAvatar}>
                {driver.profile_picture ? (
                  <Image source={{ uri: driver.profile_picture }} style={styles.completedDriverImage} />
                ) : (
                  <Ionicons name="person-circle" size={60} color="#9CA3AF" />
                )}
              </View>
              <View style={styles.completedDriverInfo}>
                <Text style={styles.completedDriverName}>
                  {driver.first_name} {driver.last_name}
                </Text>
                {driver.driver_vehicles?.[0] && (
                  <Text style={styles.completedVehicleInfo}>
                    {driver.driver_vehicles[0].vehicle_color || ''} {driver.driver_vehicles[0].vehicle_type || ''}
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* Trip Details */}
          {booking && (
            <View style={styles.completedTripDetails}>
              <View style={styles.completedLocationRow}>
                <Ionicons name="location" size={16} color="#10B981" />
                <Text style={styles.completedLocationText} numberOfLines={2}>
                  {booking.pickup_location}
                </Text>
              </View>
              <View style={styles.completedLocationRow}>
                <Ionicons name="flag" size={16} color="#EF4444" />
                <Text style={styles.completedLocationText} numberOfLines={2}>
                  {booking.dropoff_location}
                </Text>
              </View>
            </View>
          )}

          {/* Action Buttons */}
          {status === "completed" && !hasRated && (
            <Pressable 
              style={styles.completedRateButton}
              onPress={() => navigation.replace("RateRide", { bookingId, driverId })}
            >
              <Ionicons name="star" size={20} color="#FFF" />
              <Text style={styles.completedRateButtonText}>Rate Your Driver</Text>
            </Pressable>
          )}

          <Pressable style={styles.completedHomeButton} onPress={handleBackToHome}>
            <Ionicons name="home" size={20} color="#183B5C" />
            <Text style={styles.completedHomeButtonText}>Back to Home</Text>
          </Pressable>

          <Pressable style={styles.completedHistoryButton} onPress={() => navigation.navigate("RideHistoryScreen")}>
            <Text style={styles.completedHistoryButtonText}>View Ride History</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // Show active ride screen
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.headerSubtitle}>Track Your Ride</Text>
          <Text style={styles.headerTitle}>
            {rideStarted ? "En Route to Destination" : driverArrived ? "Driver Arrived" : "Heading to Pickup"}
          </Text>
        </View>
        {canCancel && (
          <Pressable style={styles.cancelHeaderButton} onPress={handleCancelRide}>
            <Ionicons name="close-circle" size={24} color="#FFB37A" />
          </Pressable>
        )}
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={{
            latitude: booking?.pickup_latitude || 14.5995,
            longitude: booking?.pickup_longitude || 120.9842,
            latitudeDelta: 0.0922,
            longitudeDelta: 0.0421,
          }}
          onMapReady={fitMapToMarkers}
          showsUserLocation={true}
          showsMyLocationButton={true}
          showsCompass={true}
        >
          {showDriverLocation && driverLocation && (
            <Marker coordinate={driverLocation} title="Your Driver" flat>
              <View style={styles.driverMarker}>
                <Ionicons name="car" size={20} color="#FFF" />
              </View>
            </Marker>
          )}

          {booking?.pickup_latitude && (
            <Marker
              coordinate={{
                latitude: booking.pickup_latitude,
                longitude: booking.pickup_longitude,
              }}
              title="Pickup Location"
            >
              <View style={styles.pickupMarker}>
                <Ionicons name="location" size={16} color="#FFF" />
              </View>
            </Marker>
          )}

          {booking?.dropoff_latitude && (
            <Marker
              coordinate={{
                latitude: booking.dropoff_latitude,
                longitude: booking.dropoff_longitude,
              }}
              title="Dropoff Location"
            >
              <View style={styles.dropoffMarker}>
                <Ionicons name="flag" size={16} color="#FFF" />
              </View>
            </Marker>
          )}

          {showRouteToDriver && (
            <Polyline
              coordinates={routeCoordinates}
              strokeColor="#3B82F6"
              strokeWidth={4}
              lineDashPattern={[1]}
            />
          )}

          {showTripRoute && (
            <Polyline
              coordinates={tripRouteCoordinates}
              strokeColor="#10B981"
              strokeWidth={4}
            />
          )}
        </MapView>

        <Pressable style={styles.locateButton} onPress={fitMapToMarkers}>
          <Ionicons name="locate" size={24} color="#183B5C" />
        </Pressable>
      </View>

      {/* Bottom Sheet */}
      <ScrollView style={styles.bottomSheet} showsVerticalScrollIndicator={false}>
        <View style={styles.statusCard}>
          <View style={[styles.statusIcon, { backgroundColor: getStatusColor() + "20" }]}>
            <Ionicons name={getStatusIcon()} size={24} color={getStatusColor()} />
          </View>
          <View style={styles.statusInfo}>
            <Text style={styles.statusMessage}>{getStatusMessage()}</Text>
            {rideStarted && (
              <Text style={styles.statusDetail}>Heading to your destination</Text>
            )}
            {driverArrived && !rideStarted && (
              <Text style={styles.statusDetail}>Please go to the pickup point</Text>
            )}
            {driverETA && !driverArrived && !rideStarted && (
              <Text style={styles.statusDetail}>Driver is on the way</Text>
            )}
            {!driverLocation && driverId && !rideStarted && (
              <Text style={styles.statusDetail}>Driver will share location soon</Text>
            )}
          </View>
        </View>

        {driver && (
          <View style={styles.driverCard}>
            <View style={styles.driverAvatar}>
              {driver.profile_picture ? (
                <Image source={{ uri: driver.profile_picture }} style={styles.driverImage} />
              ) : (
                <Ionicons name="person-circle" size={50} color="#9CA3AF" />
              )}
            </View>
            <View style={styles.driverInfo}>
              <Text style={styles.driverName}>
                {driver.first_name} {driver.last_name}
              </Text>
              {driver.driver_vehicles?.[0] && (
                <Text style={styles.vehicleInfo}>
                  {driver.driver_vehicles[0].vehicle_color || ''} {driver.driver_vehicles[0].vehicle_type || ''} • 
                  {driver.driver_vehicles[0].plate_number || ''}
                </Text>
              )}
            </View>
            <Pressable style={styles.contactButton} onPress={handleContactDriver}>
              <Ionicons name="chatbubble" size={24} color="#183B5C" />
            </Pressable>
          </View>
        )}

        <View style={styles.tripDetails}>
          <View style={styles.locationRow}>
            <Ionicons name="location" size={16} color="#10B981" />
            <Text style={styles.locationText} numberOfLines={1}>
              {booking?.pickup_location}
              {booking?.pickup_details ? ` (${booking.pickup_details})` : ''}
            </Text>
          </View>
          <View style={styles.locationRow}>
            <Ionicons name="flag" size={16} color="#EF4444" />
            <Text style={styles.locationText} numberOfLines={1}>
              {booking?.dropoff_location}
              {booking?.dropoff_details ? ` (${booking.dropoff_details})` : ''}
            </Text>
          </View>
        </View>

        {(tripDistance || booking?.distance_km) && (
          <View style={styles.statsContainer}>
            <View style={styles.statBox}>
              <Ionicons name="map-outline" size={20} color="#666" />
              <Text style={styles.statLabel}>Distance</Text>
              <Text style={styles.statValue}>
                {tripDistance || booking?.distance_km || "?"} km
              </Text>
            </View>
            <View style={styles.statBox}>
              <Ionicons name="time-outline" size={20} color="#666" />
              <Text style={styles.statLabel}>Duration</Text>
              <Text style={styles.statValue}>
                {tripDuration || booking?.duration_minutes || "?"} min
              </Text>
            </View>
            <View style={styles.statBox}>
              <Ionicons name="cash-outline" size={20} color="#666" />
              <Text style={styles.statLabel}>Fare</Text>
              <Text style={styles.statValue}>
                ₱{booking?.fare?.toFixed(2) || "0.00"}
              </Text>
            </View>
          </View>
        )}

        {pointsBalance > 0 && (
          <View style={styles.pointsBalanceContainer}>
            <Ionicons name="star" size={20} color="#F59E0B" />
            <Text style={styles.pointsBalanceText}>
              Your points balance: {pointsBalance} (10 points = ₱1)
            </Text>
          </View>
        )}

        {rideStarted && booking?.fare > 0 && booking.fare >= pointsConfig.minFare && (
          <View style={styles.pointsPreviewContainer}>
            <Ionicons name="star-outline" size={20} color="#F59E0B" />
            <Text style={styles.pointsPreviewText}>
              You'll earn{' '}
              <Text style={styles.pointsPreviewHighlight}>
                {potentialPoints} points
              </Text>{' '}
              for this trip
              {booking.payment_type === 'wallet' && ' (Wallet bonus! 2x points)'}
            </Text>
          </View>
        )}

        {showPointsPayment && (
          <Pressable style={styles.pointsPaymentButton} onPress={handlePayWithPoints}>
            <Ionicons name="qr-code" size={24} color="#FFF" />
            <View style={styles.pointsPaymentTextContainer}>
              <Text style={styles.pointsPaymentTitle}>Pay with Points</Text>
              <Text style={styles.pointsPaymentSubtitle}>Scan driver's QR code</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#FFF" />
          </Pressable>
        )}

        {canCancel && (
          <Pressable style={styles.cancelButton} onPress={handleCancelRide}>
            <Ionicons name="close-circle" size={20} color="#EF4444" />
            <Text style={styles.cancelButtonText}>Cancel Ride</Text>
          </Pressable>
        )}

        {driverArrived && !rideStarted && (
          <View style={styles.arrivedMessage}>
            <Ionicons name="car" size={24} color="#10B981" />
            <Text style={styles.arrivedText}>Your driver has arrived. Please go to the pickup point.</Text>
          </View>
        )}

        {rideStarted && (
          <View style={styles.rideStartedMessage}>
            <Ionicons name="navigate" size={24} color="#F59E0B" />
            <Text style={styles.rideStartedText}>On the way to your destination</Text>
          </View>
        )}

        {(status === "accepted" || driverArrived || rideStarted) && (
          <Pressable style={styles.shareButton}>
            <Ionicons name="share-social" size={20} color="#183B5C" />
            <Text style={styles.shareButtonText}>Share Trip</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: -50,
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F7FA",
  },
  header: {
    backgroundColor: "#183B5C",
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    marginRight: 15,
  },
  headerContent: {
    flex: 1,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#FFB37A",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFF",
  },
  cancelHeaderButton: {
    padding: 8,
  },
  mapContainer: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  driverMarker: {
    backgroundColor: "#3B82F6",
    padding: 10,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: "#FFF",
  },
  pickupMarker: {
    backgroundColor: "#10B981",
    padding: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#FFF",
  },
  dropoffMarker: {
    backgroundColor: "#EF4444",
    padding: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#FFF",
  },
  locateButton: {
    position: "absolute",
    bottom: 20,
    right: 20,
    backgroundColor: "#FFF",
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  bottomSheet: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
    maxHeight: "50%",
  },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 15,
    marginBottom: 15,
  },
  statusIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  statusInfo: {
    flex: 1,
  },
  statusMessage: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  statusDetail: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  driverCard: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
    padding: 15,
    backgroundColor: "#FFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  driverAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  driverImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  vehicleInfo: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  contactButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  tripDetails: {
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 15,
    marginBottom: 15,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  locationText: {
    fontSize: 14,
    color: "#333",
    flex: 1,
    marginLeft: 8,
  },
  statsContainer: {
    flexDirection: "row",
    marginBottom: 15,
    gap: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 11,
    color: "#666",
    marginTop: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginTop: 2,
  },
  pointsBalanceContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    padding: 12,
    borderRadius: 12,
    marginBottom: 15,
    gap: 8,
  },
  pointsBalanceText: {
    fontSize: 14,
    color: "#F59E0B",
    fontWeight: "600",
  },
  pointsPreviewContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    padding: 12,
    borderRadius: 12,
    marginBottom: 15,
    gap: 8,
  },
  pointsPreviewText: {
    fontSize: 14,
    color: "#333",
    flex: 1,
  },
  pointsPreviewHighlight: {
    fontWeight: "bold",
    color: "#F59E0B",
  },
  pointsPaymentButton: {
    backgroundColor: "#F59E0B",
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginBottom: 15,
    gap: 12,
  },
  pointsPaymentTextContainer: {
    flex: 1,
  },
  pointsPaymentTitle: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  pointsPaymentSubtitle: {
    color: "#FFF",
    fontSize: 12,
    opacity: 0.9,
  },
  scanQRButton: {
    backgroundColor: "#3B82F6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    marginBottom: 15,
    gap: 8,
  },
  scanQRButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  cancelButton: {
    backgroundColor: "#FEE2E2",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 10,
  },
  cancelButtonText: {
    color: "#EF4444",
    fontWeight: "600",
    fontSize: 16,
  },
  arrivedMessage: {
    backgroundColor: "#E8F5E9",
    padding: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  arrivedText: {
    flex: 1,
    fontSize: 14,
    color: "#2E7D32",
  },
  rideStartedMessage: {
    backgroundColor: "#FEF3C7",
    padding: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  rideStartedText: {
    flex: 1,
    fontSize: 14,
    color: "#F59E0B",
    fontWeight: "500",
  },
  shareButton: {
    backgroundColor: "#F3F4F6",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  shareButtonText: {
    color: "#183B5C",
    fontWeight: "600",
    fontSize: 14,
  },
  noRideContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
    backgroundColor: "#F5F7FA",
  },
  noRideIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  noRideTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 10,
    textAlign: "center",
  },
  noRideMessage: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 30,
  },
  noRideFeatures: {
    width: "100%",
    marginBottom: 30,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F0F9FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  featureText: {
    fontSize: 15,
    color: "#333",
    flex: 1,
  },
  bookRideButton: {
    backgroundColor: "#183B5C",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 30,
    borderRadius: 12,
    width: "100%",
    marginBottom: 12,
    gap: 8,
  },
  bookRideButtonText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "600",
  },
  historyButton: {
    paddingVertical: 12,
  },
  historyButtonText: {
    color: "#183B5C",
    fontSize: 16,
    fontWeight: "500",
    textDecorationLine: "underline",
  },
  completedContainer: {
    flex: 1,
    paddingHorizontal: 20,
    backgroundColor: "#F5F7FA",
    marginTop: 20,
  },
  completedIconContainer: {
    alignItems: "center",
    marginBottom: 10,
  },
  completedTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 10,
    textAlign: "center",
  },
  completedMessage: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 30,
    lineHeight: 22,
  },
  completedPaymentCard: {
    backgroundColor: "#F0F9FF",
    borderRadius: 16,
    padding: 15,
    width: "100%",
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  completedPaymentTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#183B5C",
    marginBottom: 8,
  },
  completedPaymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  completedPaymentLabel: {
    fontSize: 14,
    color: "#666",
  },
  completedPaymentValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  pointsEarnedContainer: {
    marginTop: 8,
  },
  pointsEarnedDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 8,
  },
  pointsEarnedValue: {
    color: "#F59E0B",
    fontWeight: "bold",
  },
  pointsEarnedNote: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 2,
    fontStyle: "italic",
  },
  noPointsText: {
    fontSize: 12,
    color: "#9CA3AF",
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 8,
  },
  completedDriverCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 15,
    width: "100%",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  completedDriverAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 15,
  },
  completedDriverImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  completedDriverInfo: {
    flex: 1,
  },
  completedDriverName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  completedVehicleInfo: {
    fontSize: 14,
    color: "#666",
  },
  completedTripDetails: {
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 15,
    width: "100%",
    marginBottom: 20,
  },
  completedLocationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  completedLocationText: {
    fontSize: 14,
    color: "#333",
    flex: 1,
    marginLeft: 8,
  },
  completedRateButton: {
    backgroundColor: "#183B5C",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 30,
    borderRadius: 12,
    width: "100%",
    marginBottom: 12,
    gap: 8,
  },
  completedRateButtonText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "600",
  },
  completedHomeButton: {
    backgroundColor: "#FFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 12,
    width: "100%",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#183B5C",
    gap: 8,
  },
  completedHomeButtonText: {
    color: "#183B5C",
    fontSize: 16,
    fontWeight: "600",
  },
  completedHistoryButton: {
    paddingVertical: 12,
    marginBottom: 20,
  },
  completedHistoryButtonText: {
    color: "#183B5C",
    fontSize: 14,
    fontWeight: "500",
    textDecorationLine: "underline",
    textAlign: "center",
  },
  scannerHeader: {
    backgroundColor: "#183B5C",
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  scannerBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  scannerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFF",
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  scanner: {
    flex: 1,
  },
  scannerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  scanArea: {
    width: 250,
    height: 250,
    position: "relative",
  },
  scanCorner: {
    position: "absolute",
    width: 40,
    height: 40,
    borderColor: "#FFF",
    borderTopWidth: 4,
    borderLeftWidth: 4,
    top: 0,
    left: 0,
  },
  scanCornerTopRight: {
    right: 0,
    left: "auto",
    borderLeftWidth: 0,
    borderRightWidth: 4,
  },
  scanCornerBottomLeft: {
    bottom: 0,
    top: "auto",
    borderTopWidth: 0,
    borderBottomWidth: 4,
  },
  scanCornerBottomRight: {
    bottom: 0,
    top: "auto",
    right: 0,
    left: "auto",
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 4,
    borderBottomWidth: 4,
  },
  scannerInstruction: {
    color: "#FFF",
    fontSize: 16,
    marginTop: 30,
    textAlign: "center",
  },
  processingContainer: {
    marginTop: 30,
    alignItems: "center",
  },
  processingText: {
    color: "#FFF",
    fontSize: 16,
    marginTop: 10,
  },
  scannerFooter: {
    backgroundColor: "#183B5C",
    padding: 20,
    alignItems: "center",
  },
  scannerFooterText: {
    color: "#FFF",
    fontSize: 14,
    textAlign: "center",
  },
});