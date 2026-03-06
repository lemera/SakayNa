// screens/driver/DriverTrackRideScreen.js
import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Image,
  StyleSheet,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import QRCode from 'react-native-qrcode-svg';
import Constants from "expo-constants";

export default function DriverTrackRideScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [driverId, setDriverId] = useState(null);
  
  // For active ride
  const [activeBooking, setActiveBooking] = useState(null);
  const [commuter, setCommuter] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [estimatedTime, setEstimatedTime] = useState(null);
  const [estimatedDistance, setEstimatedDistance] = useState(null);
  const [bookingStatus, setBookingStatus] = useState("pending");
  const [locationSubscription, setLocationSubscription] = useState(null);
  
  // For pending requests
  const [pendingRequests, setPendingRequests] = useState([]);
  const [cancelledRequest, setCancelledRequest] = useState(null);
  
  // For request map
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [requestRouteCoordinates, setRequestRouteCoordinates] = useState([]);
  const [requestDistance, setRequestDistance] = useState(null);
  const [requestDuration, setRequestDuration] = useState(null);

  // Navigation state
  const [isNavigating, setIsNavigating] = useState(false);
  const [navigationDestination, setNavigationDestination] = useState('pickup');
  const [hasArrivedAtPickup, setHasArrivedAtPickup] = useState(false);
  const [rideStarted, setRideStarted] = useState(false);
  
  // UI state
  const [showPendingRequests, setShowPendingRequests] = useState(true);
  const [cancelledBookingAlert, setCancelledBookingAlert] = useState(null);

  // QR Code related state - Use refs to prevent re-renders
  const showQRModalRef = useRef(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrPoints, setQrPoints] = useState(0);
  const [qrFare, setQrFare] = useState(0);
  const [qrValue, setQrValue] = useState('');
  const [waitingForPayment, setWaitingForPayment] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  
  // Timer refs
  const timerRef = useRef(null);
  const [timeLeft, setTimeLeft] = useState(300);

  const googleApiKey = Constants.expoConfig?.extra?.GOOGLE_API_KEY;

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Timer effect - separated to prevent re-renders
  useEffect(() => {
    if (showQRModal && timeLeft > 0 && !isProcessingPayment) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            if (!isProcessingPayment) {
              setShowQRModal(false);
              setWaitingForPayment(false);
              Alert.alert(
                "QR Code Expired",
                "The QR code has expired. Please try again.",
                [{ text: "OK" }]
              );
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }
  }, [showQRModal, isProcessingPayment]); // Removed timeLeft from dependencies

  // Update showQRModalRef whenever showQRModal changes
  useEffect(() => {
    showQRModalRef.current = showQRModal;
  }, [showQRModal]);

  // Listen for payment confirmation from commuter via real-time subscription
  useEffect(() => {
    if (!activeBooking || !waitingForPayment || isProcessingPayment) return;

    const paymentSubscription = supabase
      .channel(`payment-${activeBooking.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookings',
          filter: `id=eq.${activeBooking.id}`,
        },
        (payload) => {
          console.log("💳 Payment update received:", payload);
          
          // Check if payment status changed to paid
          if (payload.new.payment_status === 'paid' && waitingForPayment && !isProcessingPayment) {
            setIsProcessingPayment(true);
            
            // Complete the trip
            completeTripWithPayment(
              payload.new.actual_fare || activeBooking.fare,
              "points",
              qrPoints
            ).finally(() => {
              setIsProcessingPayment(false);
            });
          }
        }
      )
      .subscribe();

    return () => {
      paymentSubscription.unsubscribe();
    };
  }, [activeBooking, waitingForPayment, qrPoints, isProcessingPayment]);

  useEffect(() => {
    if (pendingRequests.length > 0 && !selectedRequest && !activeBooking) {
      setSelectedRequest(pendingRequests[0]);
    }
  }, [pendingRequests, activeBooking]);

  useEffect(() => {
    if (selectedRequest && !activeBooking) {
      calculateRequestRoute(selectedRequest);
    }
  }, [selectedRequest, activeBooking]);

  useFocusEffect(
    React.useCallback(() => {
      const initialize = async () => {
        const id = await AsyncStorage.getItem("user_id");
        setDriverId(id);
        if (id) {
          await Promise.all([
            fetchActiveBooking(id),
            fetchPendingRequests(id),
            startLocationTracking()
          ]);
          setLoading(false);
        }
      };
      initialize();

      return () => {
        if (locationSubscription) {
          locationSubscription.remove();
        }
      };
    }, [])
  );

  // Periodic check for bookings (every 10 seconds)
  useEffect(() => {
    if (!driverId) return;

    const interval = setInterval(() => {
      console.log("⏰ Periodic check for bookings");
      checkForBookings();
    }, 10000);

    return () => clearInterval(interval);
  }, [driverId, activeBooking, hasArrivedAtPickup, rideStarted]);

  const checkForBookings = async () => {
    try {
      if (!driverId) return;
      
      const { data, error } = await supabase
        .from("bookings")
        .select("id, status, driver_arrived_at, ride_started_at, payment_status")
        .eq("driver_id", driverId)
        .in("status", ["accepted", "pending"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.log("❌ Error in periodic check:", error);
        return;
      }

      if (data) {
        console.log("📊 Found booking in periodic check:", data);
        if (data.status === "accepted" && !activeBooking) {
          await fetchActiveBooking(driverId);
        } else if (data.status === "accepted" && activeBooking) {
          if (data.driver_arrived_at && !hasArrivedAtPickup) {
            setHasArrivedAtPickup(true);
            setNavigationDestination('dropoff');
          }
          if (data.ride_started_at && !rideStarted) {
            setRideStarted(true);
          }
          // Check if payment was completed while waiting
          if (data.payment_status === 'paid' && waitingForPayment && !isProcessingPayment) {
            setIsProcessingPayment(true);
            completeTripWithPayment(
              activeBooking.fare,
              "points",
              qrPoints
            ).finally(() => {
              setIsProcessingPayment(false);
            });
          }
        } else if (data.status === "pending") {
          await fetchPendingRequests(driverId);
        }
      }
    } catch (err) {
      console.log("❌ Error in checkForBookings:", err);
    }
  };

  // ================= REAL-TIME SUBSCRIPTIONS =================
  useEffect(() => {
    if (!driverId) return;

    const bookingRequestsSubscription = supabase
      .channel('driver-booking-requests')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'booking_requests',
          filter: `driver_id=eq.${driverId}`,
        },
        (payload) => {
          console.log("🔔 New booking request:", payload);
          fetchPendingRequests(driverId);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'booking_requests',
          filter: `driver_id=eq.${driverId}`,
        },
        (payload) => {
          console.log("📝 Booking request updated:", payload);
          
          if (payload.new.status === 'rejected' || payload.new.status === 'cancelled') {
            fetchBookingDetails(payload.new.booking_id).then(booking => {
              if (booking) {
                const cancelledBy = booking.cancelled_by || 'commuter';
                const reason = booking.cancellation_reason || 'No reason provided';
                
                Alert.alert(
                  "❌ Booking Request Cancelled",
                  `The booking request has been cancelled by the ${cancelledBy}.\n\nReason: ${reason}`,
                  [{ text: "OK" }]
                );
                
                setCancelledRequest({
                  id: payload.new.booking_id,
                  reason: reason,
                  cancelled_by: cancelledBy,
                  timestamp: new Date()
                });
                
                setTimeout(() => {
                  setCancelledRequest(null);
                }, 5000);
              }
            });
          }
          
          fetchPendingRequests(driverId);
        }
      )
      .subscribe();

    const bookingsSubscription = supabase
      .channel('driver-bookings')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookings',
          filter: `driver_id=eq.${driverId}`,
        },
        (payload) => {
          console.log("📅 Booking updated:", payload);
          
          if (activeBooking && payload.new.id === activeBooking.id) {
            if (payload.new.status === 'cancelled') {
              handleActiveTripCancelled(payload.new);
            } else {
              setActiveBooking(prev => ({
                ...prev,
                ...payload.new
              }));
              
              if (payload.new.driver_arrived_at && !hasArrivedAtPickup) {
                setHasArrivedAtPickup(true);
                setNavigationDestination('dropoff');
              }
              
              if (payload.new.ride_started_at && !rideStarted) {
                setRideStarted(true);
              }

              // If payment was completed while waiting
              if (payload.new.payment_status === 'paid' && waitingForPayment && !isProcessingPayment) {
                setIsProcessingPayment(true);
                setShowQRModal(false);
                Alert.alert(
                  "✅ Payment Received",
                  "The passenger has successfully paid with points.",
                  [{ text: "OK" }]
                );
                completeTripWithPayment(
                  activeBooking.fare,
                  "points",
                  qrPoints
                ).finally(() => {
                  setIsProcessingPayment(false);
                });
              }
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
        },
        (payload) => {
          if (payload.eventType === 'UPDATE' && payload.new.status === 'cancelled') {
            const isInPending = pendingRequests.some(req => req.id === payload.new.id);
            if (isInPending) {
              fetchBookingDetails(payload.new.id).then(booking => {
                if (booking) {
                  const cancelledBy = booking.cancelled_by || 'commuter';
                  const reason = booking.cancellation_reason || 'No reason provided';
                  
                  Alert.alert(
                    "❌ Booking Cancelled",
                    `A booking request has been cancelled by the ${cancelledBy}.`,
                    [{ text: "OK" }]
                  );
                  
                  fetchPendingRequests(driverId);
                }
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      bookingRequestsSubscription.unsubscribe();
      bookingsSubscription.unsubscribe();
    };
  }, [driverId, activeBooking, pendingRequests, hasArrivedAtPickup, rideStarted, waitingForPayment, isProcessingPayment]);

  // ================= HELPER FUNCTIONS =================
  const fetchBookingDetails = async (bookingId) => {
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select("cancelled_by, cancellation_reason, status")
        .eq("id", bookingId)
        .single();
      
      if (error) throw error;
      return data;
    } catch (err) {
      console.log("❌ Error fetching booking details:", err);
      return null;
    }
  };

  const handleActiveTripCancelled = (cancelledBooking) => {
    console.log("🚫 Active trip cancelled:", cancelledBooking);
    
    const cancelledBy = cancelledBooking.cancelled_by || 'commuter';
    const reason = cancelledBooking.cancellation_reason || 'No reason provided';
    
    Alert.alert(
      "❌ Trip Cancelled",
      `Your active trip has been cancelled by the ${cancelledBy}.\n\nReason: ${reason}`,
      [{ text: "OK" }]
    );
    
    setCancelledBookingAlert({
      reason: reason,
      cancelled_by: cancelledBy,
      timestamp: new Date()
    });
    
    setActiveBooking(null);
    setCommuter(null);
    setBookingStatus("pending");
    setIsNavigating(false);
    setShowPendingRequests(true);
    setHasArrivedAtPickup(false);
    setRideStarted(false);
    setRouteCoordinates([]);
    setEstimatedDistance(null);
    setEstimatedTime(null);
    setWaitingForPayment(false);
    setShowQRModal(false);
    setIsProcessingPayment(false);
    
    setTimeout(() => {
      setCancelledBookingAlert(null);
    }, 8000);
  };

  const fetchPendingRequests = async (id) => {
    try {
      console.log("🔍 Fetching pending requests for driver:", id);
      
      const { data, error } = await supabase
        .from("booking_requests")
        .select(`
          id,
          status,
          distance_km,
          created_at,
          booking:bookings (
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
            created_at,
            status,
            commuter:commuters (
              first_name,
              last_name,
              phone,
              profile_picture
            )
          )
        `)
        .eq("driver_id", id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const requests = data
        .filter(item => item.booking && item.booking.status === 'pending')
        .map(item => ({
          request_id: item.id,
          ...item.booking,
          request_status: item.status,
          request_distance: item.distance_km,
          request_created_at: item.created_at
        }));

      console.log(`📊 Found ${requests.length} pending requests`);
      setPendingRequests(requests || []);
    } catch (err) {
      console.log("❌ Error fetching pending requests:", err);
    }
  };

  const fetchActiveBooking = async (id) => {
    try {
      console.log("🔍 Fetching active booking for driver:", id);
      
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          *,
          commuter:commuters (
            id,
            first_name,
            last_name,
            phone,
            email,
            profile_picture
          )
        `)
        .eq("driver_id", id)
        .in("status", ["accepted"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;

      console.log("📊 Fetched active booking:", data);

      if (data) {
        console.log("✅ Active booking found:", data.id);
        
        setActiveBooking(data);
        setCommuter(data.commuter);
        setBookingStatus(data.status);
        setShowPendingRequests(false);
        
        if (data.status === "accepted") {
          if (data.driver_arrived_at) {
            setHasArrivedAtPickup(true);
            setNavigationDestination('dropoff');
            setIsNavigating(true);
            
            if (data.ride_started_at) {
              setRideStarted(true);
            }
            
            if (driverLocation) {
              calculateRouteToDropoff(
                { latitude: data.pickup_latitude, longitude: data.pickup_longitude },
                { latitude: data.dropoff_latitude, longitude: data.dropoff_longitude }
              );
            }
          } else {
            setNavigationDestination('pickup');
            setIsNavigating(true);
            setHasArrivedAtPickup(false);
            setRideStarted(false);
            
            if (driverLocation) {
              calculateRouteToPickup(driverLocation, {
                latitude: data.pickup_latitude,
                longitude: data.pickup_longitude
              });
            }
          }
        }
      } else {
        console.log("❌ No active booking found");
        setActiveBooking(null);
        setCommuter(null);
        setIsNavigating(false);
        setShowPendingRequests(true);
      }
    } catch (err) {
      console.log("❌ Error fetching booking:", err);
    }
  };

  const calculateRouteToPickup = async (driverLoc, pickupLoc) => {
    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${driverLoc.latitude},${driverLoc.longitude}&destination=${pickupLoc.latitude},${pickupLoc.longitude}&key=${googleApiKey}&mode=driving`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === "OK" && data.routes[0]) {
        const route = data.routes[0];
        const points = decodePolyline(route.overview_polyline.points);
        setRouteCoordinates(points);
        
        const leg = route.legs[0];
        const distanceKm = leg.distance.value / 1000;
        const timeMins = Math.round(leg.duration.value / 60);
        
        setEstimatedDistance(distanceKm.toFixed(1));
        setEstimatedTime(timeMins);
        
        if (mapRef.current) {
          mapRef.current.fitToCoordinates(points, {
            edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
            animated: true,
          });
        }
      }
    } catch (err) {
      console.log("❌ Error calculating route to pickup:", err);
    }
  };

  const calculateRouteToDropoff = async (pickupLoc, dropoffLoc) => {
    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${pickupLoc.latitude},${pickupLoc.longitude}&destination=${dropoffLoc.latitude},${dropoffLoc.longitude}&key=${googleApiKey}&mode=driving`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === "OK" && data.routes[0]) {
        const route = data.routes[0];
        const points = decodePolyline(route.overview_polyline.points);
        setRouteCoordinates(points);
        
        const leg = route.legs[0];
        const distanceKm = leg.distance.value / 1000;
        const timeMins = Math.round(leg.duration.value / 60);
        
        setEstimatedDistance(distanceKm.toFixed(1));
        setEstimatedTime(timeMins);
        
        if (mapRef.current) {
          mapRef.current.fitToCoordinates(points, {
            edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
            animated: true,
          });
        }
      }
    } catch (err) {
      console.log("❌ Error calculating route to dropoff:", err);
    }
  };

  // ================= HANDLE ACCEPT REQUEST =================
  const handleAcceptRequest = async (bookingId, requestId) => {
    Alert.alert(
      "Accept Booking",
      "Are you sure you want to accept this booking?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Accept",
          onPress: async () => {
            try {
              setLoading(true);
              
              const { data: bookingCheck, error: checkError } = await supabase
                .from("bookings")
                .select("status")
                .eq("id", bookingId)
                .single();

              if (checkError) throw checkError;

              if (bookingCheck.status !== 'pending') {
                Alert.alert(
                  "Cannot Accept",
                  `This booking is no longer available (Status: ${bookingCheck.status}).`,
                  [{ text: "OK" }]
                );
                await fetchPendingRequests(driverId);
                setLoading(false);
                return;
              }
              
              const { error: bookingError } = await supabase
                .from("bookings")
                .update({ 
                  status: "accepted",
                  driver_id: driverId,
                  accepted_at: new Date(),
                  updated_at: new Date()
                })
                .eq("id", bookingId);

              if (bookingError) throw bookingError;

              const { error: requestError } = await supabase
                .from("booking_requests")
                .update({ 
                  status: "accepted",
                  responded_at: new Date()
                })
                .eq("id", requestId);

              if (requestError) throw requestError;

              await supabase
                .from("booking_requests")
                .update({ 
                  status: "rejected",
                  responded_at: new Date()
                })
                .eq("booking_id", bookingId)
                .neq("id", requestId);

              await fetchActiveBooking(driverId);
              await fetchPendingRequests(driverId);

              Alert.alert("Success", "Booking accepted! Head to pickup location.");
            } catch (err) {
              console.log("❌ Error accepting booking:", err);
              Alert.alert("Error", "Failed to accept booking");
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleDeclineRequest = async (bookingId, requestId) => {
    Alert.alert(
      "Decline Booking",
      "Are you sure you want to decline this booking?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("booking_requests")
                .update({ 
                  status: "rejected",
                  responded_at: new Date()
                })
                .eq("id", requestId);

              if (error) throw error;

              Alert.alert("Success", "Booking declined");
              await fetchPendingRequests(driverId);
            } catch (err) {
              console.log("❌ Error declining booking:", err);
              Alert.alert("Error", "Failed to decline booking");
            }
          }
        }
      ]
    );
  };

  const handleArrivedAtPickup = async () => {
    Alert.alert(
      "Arrived at Pickup",
      "Have you arrived at the pickup location?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, I'm Here",
          onPress: async () => {
            try {
              setLoading(true);
              
              const { error } = await supabase
                .from("bookings")
                .update({ 
                  driver_arrived_at: new Date(),
                  updated_at: new Date()
                })
                .eq("id", activeBooking.id);

              if (error) throw error;

              await supabase
                .from("booking_updates")
                .insert({
                  booking_id: activeBooking.id,
                  type: "driver_arrived",
                  message: "Driver has arrived at pickup location",
                  created_at: new Date()
                });

              setHasArrivedAtPickup(true);
              setNavigationDestination('dropoff');
              
              setActiveBooking(prev => ({
                ...prev,
                driver_arrived_at: new Date()
              }));
              
              if (driverLocation && activeBooking) {
                calculateRouteToDropoff(
                  { latitude: activeBooking.pickup_latitude, longitude: activeBooking.pickup_longitude },
                  { latitude: activeBooking.dropoff_latitude, longitude: activeBooking.dropoff_longitude }
                );
              }

              Alert.alert("Success", "Commuter notified! Proceed to destination.");
            } catch (err) {
              console.log("❌ Error:", err);
              Alert.alert("Error", "Failed to update status");
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleStartRide = async () => {
    Alert.alert(
      "Start Ride",
      "Have you picked up the passenger?",
      [
        { text: "Not Yet", style: "cancel" },
        {
          text: "Yes, Start Ride",
          onPress: async () => {
            try {
              setLoading(true);
              
              const { error } = await supabase
                .from("bookings")
                .update({ 
                  ride_started_at: new Date(),
                  updated_at: new Date()
                })
                .eq("id", activeBooking.id);

              if (error) throw error;

              setRideStarted(true);
              
              Alert.alert("Success", "Ride started! Head to destination.");
            } catch (err) {
              console.log("❌ Error:", err);
              Alert.alert("Error", "Failed to start ride");
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  // ================= PAYMENT OPTIONS =================
  const handleCompleteTrip = () => {
    if (isProcessingPayment) {
      Alert.alert("Processing", "Please wait while payment is being processed.");
      return;
    }

    Alert.alert(
      "Payment Method",
      "How would the passenger like to pay?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "💵 Cash",
          onPress: () => processCashPayment()
        },
        {
          text: "⭐ Points",
          onPress: () => checkCommuterPoints()
        }
      ]
    );
  };

  const processCashPayment = async () => {
    try {
      setLoading(true);
      
      const actualFare = activeBooking.fare || 0;

      console.log("💰 Completing trip with CASH payment:", {
        actualFare,
        bookingId: activeBooking.id
      });

      const { data: wallet, error: walletError } = await supabase
        .from("driver_wallets")
        .select("*")
        .eq("driver_id", driverId)
        .maybeSingle();

      if (walletError) {
        console.log("❌ Error fetching wallet:", walletError);
        throw walletError;
      }

      if (!wallet) {
        console.log("📝 Creating wallet for driver:", driverId);
        const { error: insertError } = await supabase
          .from("driver_wallets")
          .insert({
            driver_id: driverId,
            balance: 0,
            total_deposits: 0,
            total_withdrawals: 0,
            cash_earnings: 0,
            created_at: new Date(),
            updated_at: new Date()
          });

        if (insertError) throw insertError;
      }

      const { data: currentWallet, error: currentError } = await supabase
        .from("driver_wallets")
        .select("cash_earnings")
        .eq("driver_id", driverId)
        .single();

      if (currentError) throw currentError;

      const newCashEarnings = (currentWallet.cash_earnings || 0) + actualFare;

      const { error: earningsError } = await supabase
        .from("driver_wallets")
        .update({
          cash_earnings: newCashEarnings,
          updated_at: new Date()
        })
        .eq("driver_id", driverId);

      if (earningsError) {
        console.log("❌ Error updating earnings:", earningsError);
        throw earningsError;
      }

      console.log(`💵 Added ₱${actualFare} to cash_earnings. New total: ₱${newCashEarnings}`);

      await completeTripWithPayment(actualFare, "cash");

    } catch (err) {
      console.log("❌ Error processing cash payment:", err);
      Alert.alert("Error", "Failed to process cash payment: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const checkCommuterPoints = async () => {
    try {
      setLoading(true);
      
      const actualFare = activeBooking.fare || 0;
      const pointsNeeded = Math.floor(actualFare * 10);
      
      const { data: commuterWallet, error: walletError } = await supabase
        .from("commuter_wallets")
        .select("points")
        .eq("commuter_id", activeBooking.commuter_id)
        .maybeSingle();

      if (walletError) {
        console.log("❌ Error fetching commuter wallet:", walletError);
        throw walletError;
      }

      const currentPoints = commuterWallet?.points || 0;

      if (currentPoints >= pointsNeeded) {
        setQrPoints(pointsNeeded);
        setQrFare(actualFare);
        showQRCodeForPoints(pointsNeeded, actualFare);
      } else {
        Alert.alert(
          "Insufficient Points",
          `Passenger only has ${currentPoints} points but needs ${pointsNeeded} points for this trip (₱${actualFare.toFixed(2)} × 10).\n\nWould you like to switch to cash payment?`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "💵 Use Cash",
              onPress: () => processCashPayment()
            }
          ]
        );
      }
    } catch (err) {
      console.log("❌ Error checking points:", err);
      Alert.alert("Error", "Failed to check points balance");
    } finally {
      setLoading(false);
    }
  };

  const showQRCodeForPoints = (pointsNeeded, fare) => {
    const expiryTime = new Date();
    expiryTime.setMinutes(expiryTime.getMinutes() + 5);
    
    const qrDataValue = JSON.stringify({
      type: "points_payment",
      booking_id: activeBooking.id,
      driver_id: driverId,
      commuter_id: activeBooking.commuter_id,
      amount: fare,
      points: pointsNeeded,
      timestamp: new Date().toISOString(),
      expires_at: expiryTime.toISOString()
    });

    setQrValue(qrDataValue);
    setWaitingForPayment(true);
    setShowQRModal(true);
    setTimeLeft(300);
    
    // Also update the booking to indicate points payment is pending
    supabase
      .from("bookings")
      .update({
        payment_type: "points",
        payment_status: "pending",
        updated_at: new Date()
      })
      .eq("id", activeBooking.id)
      .then(({ error }) => {
        if (error) console.log("❌ Error updating payment status:", error);
      });
  };

  const completeTripWithPayment = async (actualFare, paymentMethod, pointsUsed = 0) => {
    try {
      const { error: bookingError } = await supabase
        .from("bookings")
        .update({ 
          status: "completed",
          actual_fare: actualFare,
          payment_type: paymentMethod,
          payment_status: "paid",
          ride_completed_at: new Date(),
          updated_at: new Date()
        })
        .eq("id", activeBooking.id);

      if (bookingError) throw bookingError;

      const { data: updatedWallet, error: fetchError } = await supabase
        .from("driver_wallets")
        .select("balance, cash_earnings, total_deposits, total_withdrawals")
        .eq("driver_id", driverId)
        .single();

      if (fetchError) throw fetchError;

      const { error: transactionError } = await supabase
        .from("transactions")
        .insert({
          user_id: driverId,
          user_type: "driver",
          type: "earning",
          amount: actualFare,
          status: "completed",
          created_at: new Date(),
          metadata: {
            booking_id: activeBooking.id,
            commuter_id: activeBooking.commuter_id,
            pickup: activeBooking.pickup_location,
            dropoff: activeBooking.dropoff_location,
            payment_method: paymentMethod,
            points_used: pointsUsed,
            fare: actualFare,
            category: "trip"
          }
        });

      if (transactionError) {
        console.log("❌ Transaction error:", transactionError);
      }

      const paymentDetails = paymentMethod === "points"
        ? `   Points Used: ${pointsUsed}\n   Fare: ₱${actualFare.toFixed(2)}`
        : `   Cash Received: ₱${actualFare.toFixed(2)}`;

      const successMessage = `
━━━━━━━━━━━━━━━━━━━━━
✅ TRIP COMPLETED
━━━━━━━━━━━━━━━━━━━━━

📍 From: ${activeBooking.pickup_location?.split(",")[0] || "Pickup"}
📍 To: ${activeBooking.dropoff_location?.split(",")[0] || "Dropoff"}

💰 PAYMENT DETAILS:
${paymentDetails}

📊 YOUR EARNINGS:
   💵 Total Cash Earnings: ₱${(updatedWallet?.cash_earnings || 0).toFixed(2)}

💳 WALLET BALANCE (from top-ups):
   Available: ₱${(updatedWallet?.balance || 0).toFixed(2)}

━━━━━━━━━━━━━━━━━━━━━
Thank you for driving with SakayNA!
━━━━━━━━━━━━━━━━━━━━━`;

      setActiveBooking(null);
      setCommuter(null);
      setBookingStatus("pending");
      setIsNavigating(false);
      setShowPendingRequests(true);
      setHasArrivedAtPickup(false);
      setRideStarted(false);
      setRouteCoordinates([]);
      setEstimatedDistance(null);
      setEstimatedTime(null);
      setWaitingForPayment(false);
      setShowQRModal(false);
      setIsProcessingPayment(false);

      Alert.alert(
        "🎉 Trip Completed!",
        successMessage,
        [{ text: "OK" }]
      );

    } catch (err) {
      console.log("❌ Error completing trip:", err);
      throw err;
    }
  };

  const handleCancelTrip = () => {
    if (bookingStatus !== "accepted") {
      Alert.alert("Cannot Cancel", "This trip cannot be cancelled at this stage");
      return;
    }

    Alert.alert(
      "Cancel Trip",
      "Are you sure you want to cancel this trip? This may affect your acceptance rate.",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);
              
              const { error } = await supabase
                .from("bookings")
                .update({ 
                  status: "cancelled",
                  cancelled_at: new Date(),
                  cancellation_reason: "Cancelled by driver",
                  cancelled_by: "driver",
                  updated_at: new Date()
                })
                .eq("id", activeBooking.id);

              if (error) throw error;

              setActiveBooking(null);
              setCommuter(null);
              setBookingStatus("pending");
              setIsNavigating(false);
              setShowPendingRequests(true);
              setWaitingForPayment(false);
              setShowQRModal(false);
              setIsProcessingPayment(false);

              Alert.alert(
                "❌ Trip Cancelled",
                "The trip has been cancelled."
              );
            } catch (err) {
              console.log("❌ Error cancelling trip:", err);
              Alert.alert("Error", "Failed to cancel trip");
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleCancelQRPayment = () => {
    Alert.alert(
      "Cancel Payment",
      "Are you sure you want to cancel the points payment?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: () => {
            setShowQRModal(false);
            setWaitingForPayment(false);
            setTimeLeft(300);
            
            // Reset payment status
            supabase
              .from("bookings")
              .update({
                payment_type: null,
                payment_status: null,
                updated_at: new Date()
              })
              .eq("id", activeBooking.id)
              .then(() => {});
          }
        }
      ]
    );
  };

  const formatRequestTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffSeconds = Math.floor((now - date) / 1000);
    
    if (diffSeconds < 60) return `${diffSeconds} seconds ago`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} minutes ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)} hours ago`;
    return date.toLocaleDateString();
  };

  const updateDriverLocation = async (coords) => {
    try {
      if (!driverId) return;
      
      const { data: existingLocation, error: checkError } = await supabase
        .from("driver_locations")
        .select("id")
        .eq("driver_id", driverId)
        .maybeSingle();

      if (checkError) {
        console.log("Error checking location:", checkError);
        return;
      }

      if (existingLocation) {
        const { error } = await supabase
          .from("driver_locations")
          .update({
            latitude: coords.latitude,
            longitude: coords.longitude,
            is_online: true,
            last_updated: new Date(),
          })
          .eq("driver_id", driverId);

        if (error) console.log("Update error:", error);
      } else {
        const { error } = await supabase
          .from("driver_locations")
          .insert({
            driver_id: driverId,
            latitude: coords.latitude,
            longitude: coords.longitude,
            is_online: true,
            last_updated: new Date(),
          });

        if (error) console.log("Insert error:", error);
      }
    } catch (err) {
      console.log("❌ Error updating location:", err);
    }
  };

  const startLocationTracking = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Location permission is needed to track rides");
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const newLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      setDriverLocation(newLocation);
      
      if (driverId) {
        const { data: existing } = await supabase
          .from("driver_locations")
          .select("id")
          .eq("driver_id", driverId)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("driver_locations")
            .update({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              is_online: true,
              last_updated: new Date(),
            })
            .eq("driver_id", driverId);
        } else {
          await supabase
            .from("driver_locations")
            .insert({
              driver_id: driverId,
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              is_online: true,
              last_updated: new Date(),
            });
        }
      }

      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        async (newLocation) => {
          const updatedLocation = {
            latitude: newLocation.coords.latitude,
            longitude: newLocation.coords.longitude,
          };
          setDriverLocation(updatedLocation);
          await updateDriverLocation(updatedLocation);

          if (isNavigating && activeBooking) {
            if (navigationDestination === 'pickup' && !hasArrivedAtPickup) {
              calculateRouteToPickup(updatedLocation, {
                latitude: activeBooking.pickup_latitude,
                longitude: activeBooking.pickup_longitude
              });
            } else if (navigationDestination === 'dropoff') {
              calculateRouteToDropoff(
                { latitude: activeBooking.pickup_latitude, longitude: activeBooking.pickup_longitude },
                { latitude: activeBooking.dropoff_latitude, longitude: activeBooking.dropoff_longitude }
              );
            }
          }
        }
      );

      setLocationSubscription(subscription);
    } catch (err) {
      console.log("❌ Location tracking error:", err);
    }
  };

  const calculateRequestRoute = async (request) => {
    if (!request.pickup_latitude || !request.pickup_longitude || 
        !request.dropoff_latitude || !request.dropoff_longitude) return;

    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${request.pickup_latitude},${request.pickup_longitude}&destination=${request.dropoff_latitude},${request.dropoff_longitude}&key=${googleApiKey}&mode=driving`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === "OK" && data.routes[0]) {
        const route = data.routes[0];
        const points = decodePolyline(route.overview_polyline.points);
        setRequestRouteCoordinates(points);
        
        const leg = route.legs[0];
        const distanceKm = leg.distance.value / 1000;
        const timeMins = Math.round(leg.duration.value / 60);
        
        setRequestDistance(distanceKm.toFixed(1));
        setRequestDuration(timeMins);
      }
    } catch (err) {
      console.log("❌ Error calculating route for request:", err);
    }
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

  const fitRequestMapToMarkers = () => {
    if (mapRef.current && selectedRequest && !activeBooking) {
      const markers = [];
      if (selectedRequest.pickup_latitude && selectedRequest.pickup_longitude) {
        markers.push({
          latitude: selectedRequest.pickup_latitude,
          longitude: selectedRequest.pickup_longitude,
        });
      }
      if (selectedRequest.dropoff_latitude && selectedRequest.dropoff_longitude) {
        markers.push({
          latitude: selectedRequest.dropoff_latitude,
          longitude: selectedRequest.dropoff_longitude,
        });
      }
      if (driverLocation) markers.push(driverLocation);

      if (markers.length > 0) {
        mapRef.current.fitToCoordinates(markers, {
          edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
          animated: true,
        });
      }
    }
  };

  const fitMapToMarkers = () => {
    if (mapRef.current && activeBooking) {
      const markers = [];
      if (activeBooking.pickup_latitude && activeBooking.pickup_longitude) {
        markers.push({
          latitude: activeBooking.pickup_latitude,
          longitude: activeBooking.pickup_longitude,
        });
      }
      if (activeBooking.dropoff_latitude && activeBooking.dropoff_longitude) {
        markers.push({
          latitude: activeBooking.dropoff_latitude,
          longitude: activeBooking.dropoff_longitude,
        });
      }
      if (driverLocation) markers.push(driverLocation);

      if (markers.length > 0) {
        mapRef.current.fitToCoordinates(markers, {
          edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
          animated: true,
        });
      }
    }
  };

  const openMaps = (lat, lng, label) => {
    const scheme = Platform.select({
      ios: `maps://0?q=${label}&ll=${lat},${lng}`,
      android: `geo:${lat},${lng}?q=${lat},${lng}(${label})`,
    });
    Linking.openURL(scheme);
  };

  const callCommuter = () => {
    if (!commuter?.phone) {
      Alert.alert("Error", "No phone number available");
      return;
    }
    Linking.openURL(`tel:${commuter.phone}`);
  };

  const messageCommuter = () => {
    if (!commuter?.phone) {
      Alert.alert("Error", "No phone number available");
      return;
    }
    Linking.openURL(`sms:${commuter.phone}`);
  };

  const getStatusText = () => {
    if (rideStarted) {
      return "🚗 On the way to Destination";
    } else if (hasArrivedAtPickup) {
      return "📍 Waiting for Passenger";
    } else {
      return "🚗 Heading to Pickup";
    }
  };

  const getNavigationInstruction = () => {
    if (!hasArrivedAtPickup) {
      return "Navigate to pickup location";
    } else {
      return "Navigate to destination";
    }
  };

  // Memoized QR Code Modal Component to prevent unnecessary re-renders
  const QRCodeModal = useMemo(() => {
    return ({ visible, qrValue, points, fare }) => {
      if (!visible) return null;

      const minutes = Math.floor(timeLeft / 60);
      const seconds = timeLeft % 60;

      return (
        <Modal
          visible={visible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => {}} // Prevent closing by tapping outside or back button
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Points Payment QR Code</Text>
              </View>

              <View style={styles.qrCodeContainer}>
                {qrValue ? (
                  <View style={styles.qrWrapper}>
                    <QRCode
                      value={qrValue}
                      size={220}
                      color="#000"
                      backgroundColor="#FFF"
                    />
                  </View>
                ) : (
                  <View style={styles.qrPlaceholder}>
                    <ActivityIndicator size="large" color="#183B5C" />
                    <Text style={styles.qrPlaceholderText}>Generating QR Code...</Text>
                  </View>
                )}
              </View>

              <View style={styles.paymentDetailsContainer}>
                <View style={styles.paymentDetailRow}>
                  <Text style={styles.paymentDetailLabel}>Fare Amount:</Text>
                  <Text style={styles.paymentDetailValue}>₱{fare.toFixed(2)}</Text>
                </View>
                
                <View style={styles.paymentDetailRow}>
                  <Text style={styles.paymentDetailLabel}>Points Required:</Text>
                  <Text style={[styles.paymentDetailValue, { color: "#F59E0B" }]}>
                    {points} points
                  </Text>
                </View>

                <View style={styles.paymentDetailRow}>
                  <Text style={styles.paymentDetailLabel}>Rate:</Text>
                  <Text style={styles.paymentDetailSubtext}>10 points = ₱1</Text>
                </View>
              </View>

              <View style={styles.timerContainer}>
                <Ionicons name="time-outline" size={20} color="#666" />
                <Text style={styles.timerText}>
                  QR Code expires in {minutes}:{seconds.toString().padStart(2, '0')}
                </Text>
              </View>

              <View style={styles.instructionContainer}>
                <Ionicons name="information-circle" size={20} color="#3B82F6" />
                <Text style={styles.instructionText}>
                  Ask the passenger to scan this QR code with their app to complete the payment.
                </Text>
              </View>

              <View style={styles.waitingContainer}>
                <ActivityIndicator size="small" color="#10B981" />
                <Text style={styles.waitingText}>Waiting for passenger to scan...</Text>
              </View>

              <View style={styles.modalActions}>
                <Pressable 
                  style={[styles.modalButton, styles.cancelModalButton]} 
                  onPress={handleCancelQRPayment}
                >
                  <Text style={styles.cancelModalButtonText}>Cancel Payment</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      );
    };
  }, [timeLeft]); // Only re-create when timeLeft changes

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
      </View>
    );
  }

  // SHOW ACTIVE RIDE
  if (activeBooking) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* QR Code Modal - Memoized to prevent flickering */}
        <QRCodeModal
          visible={showQRModal}
          qrValue={qrValue}
          points={qrPoints}
          fare={qrFare}
        />

        {/* Cancelled Trip Banner */}
        {cancelledBookingAlert && (
          <View style={styles.cancelledBanner}>
            <Ionicons name="alert-circle" size={24} color="#EF4444" />
            <View style={styles.cancelledBannerText}>
              <Text style={styles.cancelledTitle}>Trip Cancelled</Text>
              <Text style={styles.cancelledMessage}>
                Cancelled by {cancelledBookingAlert.cancelled_by}
                {cancelledBookingAlert.reason ? `: ${cancelledBookingAlert.reason}` : ''}
              </Text>
            </View>
            <Pressable onPress={() => setCancelledBookingAlert(null)}>
              <Ionicons name="close" size={20} color="#666" />
            </Pressable>
          </View>
        )}

        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.headerSubtitle}>Active Ride</Text>
            <Text style={styles.headerTitle}>{getStatusText()}</Text>
          </View>
          {pendingRequests.length > 0 && (
            <Pressable 
              style={styles.requestBadge}
              onPress={() => {
                Alert.alert(
                  "Pending Requests",
                  `You have ${pendingRequests.length} pending request${pendingRequests.length > 1 ? 's' : ''}.`,
                  [{ text: "OK" }]
                );
              }}
            >
              <Text style={styles.requestBadgeText}>{pendingRequests.length}</Text>
            </Pressable>
          )}
          <View style={[styles.statusBadge, { backgroundColor: "#3B82F620" }]}>
            <Text style={[styles.statusText, { color: "#3B82F6" }]}>ACTIVE</Text>
          </View>
        </View>

        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            provider={PROVIDER_GOOGLE}
            initialRegion={{
              latitude: activeBooking.pickup_latitude || 14.5995,
              longitude: activeBooking.pickup_longitude || 120.9842,
              latitudeDelta: 0.0922,
              longitudeDelta: 0.0421,
            }}
            onMapReady={fitMapToMarkers}
            showsUserLocation={true}
            showsMyLocationButton={true}
            showsCompass={true}
          >
            {activeBooking.pickup_latitude && (
              <Marker
                coordinate={{
                  latitude: activeBooking.pickup_latitude,
                  longitude: activeBooking.pickup_longitude,
                }}
                title="Pickup"
              >
                <View style={styles.pickupMarker}>
                  <Ionicons name="location" size={16} color="#FFF" />
                </View>
              </Marker>
            )}

            {activeBooking.dropoff_latitude && (
              <Marker
                coordinate={{
                  latitude: activeBooking.dropoff_latitude,
                  longitude: activeBooking.dropoff_longitude,
                }}
                title="Dropoff"
              >
                <View style={styles.dropoffMarker}>
                  <Ionicons name="flag" size={16} color="#FFF" />
                </View>
              </Marker>
            )}

            {driverLocation && (
              <Marker coordinate={driverLocation} title="You" flat>
                <View style={styles.driverMarker}>
                  <Ionicons name="car" size={16} color="#FFF" />
                </View>
              </Marker>
            )}

            {routeCoordinates.length > 0 && (
              <Polyline
                coordinates={routeCoordinates}
                strokeColor="#3B82F6"
                strokeWidth={4}
              />
            )}
          </MapView>

          <Pressable style={styles.locateButton} onPress={fitMapToMarkers}>
            <Ionicons name="locate" size={24} color="#183B5C" />
          </Pressable>

          {isNavigating && (
            <View style={styles.navigationInstruction}>
              <Ionicons name="navigate" size={20} color="#FFF" />
              <Text style={styles.navigationInstructionText}>
                {getNavigationInstruction()} • {estimatedDistance || "?"} km • {estimatedTime || "?"} min
              </Text>
            </View>
          )}
        </View>

        <View style={styles.bottomSheet}>
          <View style={styles.commuterContainer}>
            <View style={styles.commuterAvatar}>
              {commuter?.profile_picture ? (
                <Image source={{ uri: commuter.profile_picture }} style={styles.commuterImage} />
              ) : (
                <Ionicons name="person-circle" size={50} color="#9CA3AF" />
              )}
            </View>
            <View style={styles.commuterInfo}>
              <Text style={styles.commuterName}>
                {commuter?.first_name} {commuter?.last_name}
              </Text>
              <Text style={styles.commuterLabel}>
                {activeBooking.passenger_count || 1} passenger{activeBooking.passenger_count > 1 ? 's' : ''}
              </Text>
            </View>
            <View style={styles.commuterActions}>
              <Pressable style={styles.callButton} onPress={callCommuter}>
                <Ionicons name="call" size={20} color="#FFF" />
              </Pressable>
              <Pressable style={styles.messageButton} onPress={messageCommuter}>
                <Ionicons name="chatbubble" size={20} color="#183B5C" />
              </Pressable>
            </View>
          </View>

          <View style={styles.locationsContainer}>
            <View style={styles.locationRow}>
              <Ionicons name="location" size={16} color="#10B981" />
              <Text style={styles.locationText} numberOfLines={1}>
                {activeBooking.pickup_location}
                {activeBooking.pickup_details ? ` (${activeBooking.pickup_details})` : ''}
              </Text>
            </View>
            <View style={styles.locationRow}>
              <Ionicons name="flag" size={16} color="#EF4444" />
              <Text style={styles.locationText} numberOfLines={1}>
                {activeBooking.dropoff_location}
                {activeBooking.dropoff_details ? ` (${activeBooking.dropoff_details})` : ''}
              </Text>
            </View>
          </View>

          <View style={styles.statsContainer}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Distance</Text>
              <Text style={styles.statValue}>
                {estimatedDistance || activeBooking.distance_km || "?"} km
              </Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Est. Time</Text>
              <Text style={styles.statValue}>
                {estimatedTime || activeBooking.duration_minutes || "?"} min
              </Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Fare</Text>
              <Text style={styles.statValue}>
                ₱{activeBooking.fare?.toFixed(2) || "0.00"}
              </Text>
            </View>
          </View>

          <View style={styles.actionContainer}>
            {!hasArrivedAtPickup && !rideStarted && (
              <>
                <Pressable style={styles.arrivedButton} onPress={handleArrivedAtPickup}>
                  <Ionicons name="location" size={20} color="#FFF" />
                  <Text style={styles.arrivedButtonText}>I've Arrived at Pickup</Text>
                </Pressable>
                <Pressable style={styles.cancelButton} onPress={handleCancelTrip}>
                  <Ionicons name="close-circle" size={20} color="#EF4444" />
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
              </>
            )}

            {hasArrivedAtPickup && !rideStarted && (
              <>
                <Pressable style={styles.startRideButton} onPress={handleStartRide}>
                  <Ionicons name="play" size={20} color="#FFF" />
                  <Text style={styles.startRideButtonText}>Start Ride</Text>
                </Pressable>
                <Pressable style={styles.cancelButton} onPress={handleCancelTrip}>
                  <Ionicons name="close-circle" size={20} color="#EF4444" />
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
              </>
            )}

            {hasArrivedAtPickup && rideStarted && (
              <>
                <Pressable style={styles.completeButton} onPress={handleCompleteTrip}>
                  <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                  <Text style={styles.completeButtonText}>Complete Trip</Text>
                </Pressable>
                <Pressable style={styles.cancelButton} onPress={handleCancelTrip}>
                  <Ionicons name="close-circle" size={20} color="#EF4444" />
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
              </>
            )}
          </View>

          {!hasArrivedAtPickup && !rideStarted && (
            <Pressable
              style={styles.navigationButton}
              onPress={() => openMaps(
                activeBooking.pickup_latitude,
                activeBooking.pickup_longitude,
                "Pickup Location"
              )}
            >
              <Ionicons name="navigate" size={20} color="#FFF" />
              <Text style={styles.navigationButtonText}>Open in Google Maps</Text>
            </Pressable>
          )}

          {(hasArrivedAtPickup || rideStarted) && (
            <Pressable
              style={styles.navigationButton}
              onPress={() => openMaps(
                activeBooking.dropoff_latitude,
                activeBooking.dropoff_longitude,
                "Dropoff Location"
              )}
            >
              <Ionicons name="navigate" size={20} color="#FFF" />
              <Text style={styles.navigationButtonText}>Open in Google Maps</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  // SHOW PENDING REQUESTS IF NO ACTIVE RIDE
  if (pendingRequests.length > 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Cancelled Request Banner */}
        {cancelledRequest && (
          <View style={styles.cancelledBanner}>
            <Ionicons name="alert-circle" size={24} color="#EF4444" />
            <View style={styles.cancelledBannerText}>
              <Text style={styles.cancelledTitle}>Booking Request Cancelled</Text>
              <Text style={styles.cancelledMessage}>
                Cancelled by {cancelledRequest.cancelled_by}
                {cancelledRequest.reason ? `: ${cancelledRequest.reason}` : ''}
              </Text>
            </View>
            <Pressable onPress={() => setCancelledRequest(null)}>
              <Ionicons name="close" size={20} color="#666" />
            </Pressable>
          </View>
        )}

        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.headerSubtitle}>New Bookings</Text>
            <Text style={styles.headerTitle}>{pendingRequests.length} Request{pendingRequests.length > 1 ? 's' : ''}</Text>
          </View>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>ONLINE</Text>
          </View>
        </View>

        <View style={styles.mapPreview}>
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            provider={PROVIDER_GOOGLE}
            initialRegion={{
              latitude: selectedRequest?.pickup_latitude || 14.5995,
              longitude: selectedRequest?.pickup_longitude || 120.9842,
              latitudeDelta: 0.0922,
              longitudeDelta: 0.0421,
            }}
            onMapReady={fitRequestMapToMarkers}
            showsUserLocation={true}
            showsMyLocationButton={true}
            showsCompass={true}
          >
            {selectedRequest?.pickup_latitude && (
              <Marker
                coordinate={{
                  latitude: selectedRequest.pickup_latitude,
                  longitude: selectedRequest.pickup_longitude,
                }}
                title="Pickup Location"
              >
                <View style={styles.pickupMarker}>
                  <Ionicons name="location" size={16} color="#FFF" />
                </View>
              </Marker>
            )}

            {selectedRequest?.dropoff_latitude && (
              <Marker
                coordinate={{
                  latitude: selectedRequest.dropoff_latitude,
                  longitude: selectedRequest.dropoff_longitude,
                }}
                title="Dropoff Location"
              >
                <View style={styles.dropoffMarker}>
                  <Ionicons name="flag" size={16} color="#FFF" />
                </View>
              </Marker>
            )}

            {driverLocation && (
              <Marker coordinate={driverLocation} title="Your Location" flat>
                <View style={styles.driverMarker}>
                  <Ionicons name="car" size={16} color="#FFF" />
                </View>
              </Marker>
            )}

            {requestRouteCoordinates.length > 0 && (
              <Polyline
                coordinates={requestRouteCoordinates}
                strokeColor="#3B82F6"
                strokeWidth={4}
              />
            )}
          </MapView>

          <Pressable style={styles.locateButton} onPress={fitRequestMapToMarkers}>
            <Ionicons name="locate" size={24} color="#183B5C" />
          </Pressable>
        </View>

        {selectedRequest && requestDistance && requestDuration && (
          <View style={styles.requestSummary}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Ionicons name="map-outline" size={16} color="#666" />
                <Text style={styles.summaryLabel}>Distance</Text>
                <Text style={styles.summaryValue}>{requestDistance} km</Text>
              </View>
              <View style={styles.summaryItem}>
                <Ionicons name="time-outline" size={16} color="#666" />
                <Text style={styles.summaryLabel}>Est. Time</Text>
                <Text style={styles.summaryValue}>{requestDuration} min</Text>
              </View>
              <View style={styles.summaryItem}>
                <Ionicons name="people-outline" size={16} color="#666" />
                <Text style={styles.summaryLabel}>Passengers</Text>
                <Text style={styles.summaryValue}>{selectedRequest.passenger_count || 1}</Text>
              </View>
            </View>
          </View>
        )}

        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {pendingRequests.map((request) => (
            <Pressable 
              key={request.request_id} 
              style={[
                styles.requestCard,
                selectedRequest?.id === request.id && styles.selectedRequestCard
              ]}
              onPress={() => setSelectedRequest(request)}
            >
              <View style={styles.cardHeader}>
                <View style={styles.timeBadge}>
                  <Ionicons name="time-outline" size={14} color="#FFB37A" />
                  <Text style={styles.timeText}>{formatRequestTime(request.request_created_at)}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: "#FEF3C7" }]}>
                  <Text style={[styles.statusText, { color: "#D97706" }]}>PENDING</Text>
                </View>
              </View>

              <View style={styles.commuterSection}>
                <View style={styles.commuterAvatar}>
                  {request.commuter?.profile_picture ? (
                    <Image 
                      source={{ uri: request.commuter.profile_picture }} 
                      style={styles.commuterImage} 
                    />
                  ) : (
                    <Ionicons name="person-circle" size={40} color="#9CA3AF" />
                  )}
                </View>
                <View style={styles.commuterInfo}>
                  <Text style={styles.commuterName}>
                    {request.commuter?.first_name} {request.commuter?.last_name}
                  </Text>
                  <Text style={styles.commuterPhone}>{request.commuter?.phone || "No phone"}</Text>
                </View>
              </View>

              <View style={styles.tripDetails}>
                <View style={styles.locationRow}>
                  <View style={styles.locationIcon}>
                    <Ionicons name="location" size={16} color="#10B981" />
                  </View>
                  <View style={styles.locationTextContainer}>
                    <Text style={styles.locationLabel}>PICKUP</Text>
                    <Text style={styles.locationAddress} numberOfLines={1}>
                      {request.pickup_location}
                      {request.pickup_details ? ` (${request.pickup_details})` : ''}
                    </Text>
                  </View>
                </View>

                <View style={styles.locationRow}>
                  <View style={styles.locationIcon}>
                    <Ionicons name="flag" size={16} color="#EF4444" />
                  </View>
                  <View style={styles.locationTextContainer}>
                    <Text style={styles.locationLabel}>DROPOFF</Text>
                    <Text style={styles.locationAddress} numberOfLines={1}>
                      {request.dropoff_location}
                      {request.dropoff_details ? ` (${request.dropoff_details})` : ''}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.fareContainer}>
                <Text style={styles.fareLabel}>Estimated Fare</Text>
                <Text style={styles.fareAmount}>₱{request.fare?.toFixed(2) || "0.00"}</Text>
              </View>

              <View style={styles.actionButtons}>
                <Pressable 
                  style={styles.declineButton}
                  onPress={() => handleDeclineRequest(request.id, request.request_id)}
                >
                  <Ionicons name="close-circle" size={20} color="#EF4444" />
                  <Text style={styles.declineButtonText}>Decline</Text>
                </Pressable>

                <Pressable 
                  style={styles.acceptButton}
                  onPress={() => handleAcceptRequest(request.id, request.request_id)}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                  <Text style={styles.acceptButtonText}>Accept</Text>
                </Pressable>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  // SHOW NO RIDES MESSAGE
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.headerSubtitle}>No Active Ride</Text>
          <Text style={styles.headerTitle}>Available</Text>
        </View>
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>ONLINE</Text>
        </View>
      </View>

      <View style={styles.emptyContainer}>
        <Ionicons name="car-outline" size={80} color="#D1D5DB" />
        <Text style={styles.emptyTitle}>No Booking Requests</Text>
        <Text style={styles.emptyText}>
          You don't have any booking requests at the moment.{'\n'}
          Stay online to receive requests.
        </Text>
        <Pressable 
          style={styles.goOnlineButton} 
          onPress={async () => {
            if (driverLocation) {
              await updateDriverLocation(driverLocation);
            }
            Alert.alert("Online", "You are now online and ready to receive bookings!");
          }}
        >
          <Text style={styles.goOnlineText}>I'm Online</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
  requestBadge: {
    backgroundColor: "#FF3B30",
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  requestBadgeText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#FFF",
  },
  statusText: {
    fontWeight: "600",
    fontSize: 12,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  mapPreview: {
    height: 250,
    margin: 20,
    borderRadius: 16,
    overflow: 'hidden',
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
  driverMarker: {
    backgroundColor: "#3B82F6",
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
  navigationInstruction: {
    position: "absolute",
    top: 20,
    left: 20,
    right: 20,
    backgroundColor: "#183B5C",
    padding: 12,
    borderRadius: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  navigationInstructionText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 8,
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
  },
  commuterContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  commuterAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  commuterImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  commuterInfo: {
    flex: 1,
  },
  commuterName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  commuterLabel: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  commuterActions: {
    flexDirection: "row",
    gap: 10,
  },
  callButton: {
    backgroundColor: "#183B5C",
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  messageButton: {
    backgroundColor: "#FFB37A",
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  locationsContainer: {
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
    marginBottom: 20,
    gap: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 10,
  },
  statLabel: {
    fontSize: 11,
    color: "#666",
  },
  statValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  actionContainer: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  arrivedButton: {
    flex: 2,
    backgroundColor: "#3B82F6",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  arrivedButtonText: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 14,
  },
  startRideButton: {
    flex: 2,
    backgroundColor: "#F59E0B",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  startRideButtonText: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 14,
  },
  completeButton: {
    flex: 2,
    backgroundColor: "#10B981",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  completeButtonText: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 14,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  cancelButtonText: {
    color: "#EF4444",
    fontWeight: "600",
  },
  navigationButton: {
    backgroundColor: "#183B5C",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  navigationButtonText: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#F5F7FA",
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginTop: 20,
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
  },
  goOnlineButton: {
    backgroundColor: "#183B5C",
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 20,
  },
  goOnlineText: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 0,
  },
  requestCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  selectedRequestCard: {
    borderWidth: 2,
    borderColor: "#183B5C",
  },
  requestSummary: {
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 15,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  summaryItem: {
    alignItems: "center",
    gap: 4,
  },
  summaryLabel: {
    fontSize: 11,
    color: "#666",
    marginTop: 2,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#183B5C",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  timeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  timeText: {
    fontSize: 11,
    color: "#666",
    marginLeft: 4,
  },
  commuterSection: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  commuterPhone: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  tripDetails: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 12,
    marginBottom: 15,
  },
  locationIcon: {
    width: 24,
    alignItems: "center",
  },
  locationTextContainer: {
    flex: 1,
    marginLeft: 8,
  },
  locationLabel: {
    fontSize: 10,
    color: "#666",
    marginBottom: 2,
  },
  locationAddress: {
    fontSize: 13,
    color: "#333",
  },
  fareContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
    paddingHorizontal: 4,
  },
  fareLabel: {
    fontSize: 14,
    color: "#666",
  },
  fareAmount: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#183B5C",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 10,
  },
  declineButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEE2E2",
    padding: 12,
    borderRadius: 12,
    gap: 5,
  },
  declineButtonText: {
    color: "#EF4444",
    fontWeight: "600",
  },
  acceptButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10B981",
    padding: 12,
    borderRadius: 12,
    gap: 5,
  },
  acceptButtonText: {
    color: "#FFF",
    fontWeight: "600",
  },
  cancelledBanner: {
    backgroundColor: "#FEE2E2",
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    position: 'absolute',
    top: 80,
    left: 0,
    right: 0,
    zIndex: 100,
    elevation: 100,
  },
  cancelledBannerText: {
    flex: 1,
    marginLeft: 12,
  },
  cancelledTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#B91C1C",
    marginBottom: 2,
  },
  cancelledMessage: {
    fontSize: 12,
    color: "#7F1D1D",
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 20,
    width: "90%",
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    position: 'relative',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    padding: 5,
  },
  qrCodeContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  qrPlaceholder: {
    width: 220,
    height: 220,
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
  },
  qrPlaceholderText: {
    fontSize: 12,
    color: "#666",
    marginTop: 8,
  },
  qrWrapper: {
    width: 220,
    height: 220,
    backgroundColor: "#FFF",
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  paymentDetailsContainer: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
  },
  paymentDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  paymentDetailLabel: {
    fontSize: 14,
    color: "#666",
  },
  paymentDetailValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  paymentDetailSubtext: {
    fontSize: 12,
    color: "#999",
  },
  instructionContainer: {
    flexDirection: "row",
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 15,
    gap: 8,
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: "#3B82F6",
    lineHeight: 20,
  },
  timerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    gap: 8,
  },
  timerText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  waitingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    gap: 8,
    backgroundColor: "#E8F5E9",
    padding: 12,
    borderRadius: 12,
  },
  waitingText: {
    fontSize: 14,
    color: "#10B981",
    fontWeight: "500",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
  },
  modalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelModalButton: {
    backgroundColor: "#F3F4F6",
  },
  cancelModalButtonText: {
    color: "#666",
    fontWeight: "600",
  },
  confirmModalButton: {
    backgroundColor: "#10B981",
  },
  confirmModalButtonText: {
    color: "#FFF",
    fontWeight: "600",
  },
});