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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

// Responsive sizing function
const responsive = {
  size: (value) => value * (width / 390),
  font: (value) => value * Math.min(1.2, width / 390),
  icon: (value) => value * (width / 390),
  radius: (value) => value * (width / 390),
};

// ================= MODERN ALERT COMPONENT =================
const ModernAlert = ({ visible, title, message, type, onClose, onConfirm, confirmText, cancelText }) => {
  const slideAnim = useRef(new Animated.Value(responsive.size(300))).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      slideAnim.setValue(responsive.size(300));
      opacityAnim.setValue(0);
    }
  }, [visible]);

  const getIconByType = () => {
    switch (type) {
      case 'success': return { name: 'checkmark-circle', color: '#10B981' };
      case 'error': return { name: 'close-circle', color: '#EF4444' };
      case 'warning': return { name: 'alert-circle', color: '#F59E0B' };
      case 'info': return { name: 'information-circle', color: '#3B82F6' };
      default: return { name: 'information-circle', color: '#3B82F6' };
    }
  };

  const icon = getIconByType();

  return (
    <Modal transparent={true} visible={visible} animationType="none" onRequestClose={onClose}>
      <BlurView intensity={20} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <Animated.View style={[styles.alertContainer, { opacity: opacityAnim }]}>
          <Animated.View style={[styles.alertCard, { transform: [{ translateY: slideAnim }] }]}>
            <View style={[styles.alertIconContainer, { backgroundColor: icon.color + '15' }]}>
              <Ionicons name={icon.name} size={responsive.icon(40)} color={icon.color} />
            </View>
            <Text style={[styles.alertTitle, { fontSize: responsive.font(20) }]}>{title}</Text>
            <Text style={[styles.alertMessage, { fontSize: responsive.font(15) }]}>{message}</Text>
            <View style={styles.alertButtons}>
              {cancelText && (
                <TouchableOpacity onPress={onClose} style={styles.alertCancelButton}>
                  <Text style={[styles.alertCancelText, { fontSize: responsive.font(16) }]}>{cancelText}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onConfirm || onClose} style={styles.alertConfirmButton}>
                <Text style={[styles.alertConfirmText, { fontSize: responsive.font(16) }]}>{confirmText || 'OK'}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Animated.View>
      </BlurView>
    </Modal>
  );
};

export default function DriverTrackRideScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const notificationAnimation = useRef(new Animated.Value(0)).current;
  const notificationStack = useRef([]);
  const appState = useRef(AppState.currentState);
  const reconnectAttempts = useRef(0);
  const isMounted = useRef(true);
  const requestExpiryTimers = useRef({});

  // Alert state
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    title: '', message: '', type: 'info', onConfirm: null, confirmText: null, cancelText: null,
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [driverId, setDriverId] = useState(null);
  const [activeBooking, setActiveBooking] = useState(null);
  const [commuter, setCommuter] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [estimatedTime, setEstimatedTime] = useState(null);
  const [estimatedDistance, setEstimatedDistance] = useState(null);
  const [bookingStatus, setBookingStatus] = useState("pending");
  const [locationSubscription, setLocationSubscription] = useState(null);
  
  // Notification System
  const [notifications, setNotifications] = useState([]);
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  
  // Pending Requests
  const [pendingRequests, setPendingRequests] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [requestRouteCoordinates, setRequestRouteCoordinates] = useState([]);
  const [requestDistance, setRequestDistance] = useState(null);
  const [requestDuration, setRequestDuration] = useState(null);
  const [expiringRequestId, setExpiringRequestId] = useState(null);

  // Navigation State
  const [isNavigating, setIsNavigating] = useState(false);
  const [hasArrivedAtPickup, setHasArrivedAtPickup] = useState(false);
  const [rideStarted, setRideStarted] = useState(false);
  const [navigationInitialized, setNavigationInitialized] = useState(false);

  // Payment State
  const [waitingForPayment, setWaitingForPayment] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [showPaymentSuccessBanner, setShowPaymentSuccessBanner] = useState(false);
  
  // Subscription refs
  const requestSubscriptionRef = useRef(null);
  const bookingSubscriptionRef = useRef(null);
  const paymentSubscriptionRef = useRef(null);

  const googleApiKey = Constants.expoConfig?.extra?.GOOGLE_API_KEY;
  const REQUEST_EXPIRY_SECONDS = 30;

  // ================= HELPER FUNCTIONS =================
  const showAlert = (title, message, type = 'info', options = {}) => {
    setAlertConfig({
      title, message, type,
      onConfirm: options.onConfirm || (() => setAlertVisible(false)),
      confirmText: options.confirmText || null,
      cancelText: options.cancelText || null,
    });
    setAlertVisible(true);
  };

  const addNotification = ({ type, title, message, duration = 4000, actionable = false, actionText, onAction }) => {
    const id = Date.now().toString();
    const newNotification = {
      id, type, title, message, duration, actionable, actionText, onAction,
      timestamp: new Date(), read: false
    };

    notificationStack.current.push(newNotification);
    setNotifications(prev => [newNotification, ...prev].slice(0, 5));
    setUnreadCount(prev => prev + 1);

    Animated.sequence([
      Animated.timing(notificationAnimation, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(duration - 600),
      Animated.timing(notificationAnimation, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => {
      if (isMounted.current) {
        setNotifications(prev => prev.filter(n => n.id !== id));
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    });

    if (Platform.OS === 'ios') {
      switch(type) {
        case 'success': Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); break;
        case 'error': Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); break;
        case 'warning': Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); break;
        default: Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
    
    if (type === 'urgent' || type === 'booking') {
      Vibration.vibrate([0, 500, 200, 500]);
    } else {
      Vibration.vibrate(300);
    }
  };

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const getNotificationColors = (type) => {
    switch(type) {
      case 'success': return ['#10B981', '#059669'];
      case 'error': return ['#EF4444', '#DC2626'];
      case 'warning': return ['#F59E0B', '#D97706'];
      case 'booking': return ['#3B82F6', '#2563EB'];
      case 'urgent': return ['#8B5CF6', '#7C3AED'];
      default: return ['#6B7280', '#4B5563'];
    }
  };

  const getNotificationIcon = (type) => {
    switch(type) {
      case 'success': return 'checkmark-circle';
      case 'error': return 'alert-circle';
      case 'warning': return 'warning';
      case 'booking': return 'car';
      case 'urgent': return 'alert';
      default: return 'information-circle';
    }
  };

  const getNotificationColor = (type) => {
    switch(type) {
      case 'success': return '#10B981';
      case 'error': return '#EF4444';
      case 'warning': return '#F59E0B';
      case 'booking': return '#3B82F6';
      case 'urgent': return '#8B5CF6';
      default: return '#6B7280';
    }
  };

  // ================= AUTO-EXPIRE REQUEST FUNCTION =================
  const startExpiryTimer = (requestId, bookingId) => {
    if (requestExpiryTimers.current[requestId]) {
      clearTimeout(requestExpiryTimers.current[requestId]);
    }

    console.log(`⏰ Starting expiry timer for request ${requestId} (${REQUEST_EXPIRY_SECONDS}s)`);
    
    setExpiringRequestId(requestId);
    
    const timer = setTimeout(async () => {
      if (!isMounted.current) return;
      
      console.log(`⏰ Request ${requestId} expired, auto-declining...`);
      
      const { data: request, error } = await supabase
        .from("booking_requests")
        .select("status")
        .eq("id", requestId)
        .single();
      
      if (error) {
        console.log("❌ Error checking request status:", error);
        return;
      }
      
      if (request.status === 'pending') {
        const { error: updateError } = await supabase
          .from("booking_requests")
          .update({ 
            status: "expired",
            responded_at: new Date()
          })
          .eq("id", requestId);
        
        if (updateError) {
          console.log("❌ Error expiring request:", updateError);
        } else {
          console.log(`✅ Request ${requestId} expired automatically`);
          
          addNotification({
            type: 'warning',
            title: 'Request Expired',
            message: `Booking request has expired (${REQUEST_EXPIRY_SECONDS}s timeout)`,
            duration: 4000
          });
          
          if (driverId) {
            await fetchPendingRequests(driverId);
          }
        }
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
      console.log(`🧹 Cleared expiry timer for request ${requestId}`);
    }
    setExpiringRequestId(null);
  };

  const getTimeRemaining = (createdAt) => {
    const created = new Date(createdAt);
    const now = new Date();
    const elapsedSeconds = Math.floor((now - created) / 1000);
    const remaining = REQUEST_EXPIRY_SECONDS - elapsedSeconds;
    return Math.max(0, remaining);
  };

  // ================= ENHANCED REAL-TIME SUBSCRIPTIONS =================
  const setupRealtimeSubscriptions = useCallback(async (id) => {
    if (!id || !isMounted.current) return;

    console.log("📡 Setting up enhanced real-time subscriptions for driver:", id);

    if (requestSubscriptionRef.current) {
      requestSubscriptionRef.current.unsubscribe();
    }
    if (bookingSubscriptionRef.current) {
      bookingSubscriptionRef.current.unsubscribe();
    }

    const setupRequestSubscription = () => {
      const subscription = supabase
        .channel(`driver-requests-${id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'booking_requests',
            filter: `driver_id=eq.${id}`,
          },
          async (payload) => {
            console.log("🔔 NEW BOOKING REQUEST RECEIVED!", payload);
            
            if (isMounted.current && !activeBooking) {
              await fetchPendingRequests(id);
              
              const { data: booking } = await supabase
                .from("bookings")
                .select(`*, commuter:commuters(first_name, last_name, phone, profile_picture)`)
                .eq("id", payload.new.booking_id)
                .single();

              if (booking) {
                startExpiryTimer(payload.new.id, payload.new.booking_id);
                
                addNotification({
                  type: 'booking',
                  title: 'New Booking Request!',
                  message: `${booking.commuter?.first_name || 'Someone'} wants to book a ride (${REQUEST_EXPIRY_SECONDS}s to accept)`,
                  duration: 10000,
                  actionable: true,
                  actionText: 'View',
                  onAction: () => {
                    setSelectedRequest({
                      ...booking,
                      request_id: payload.new.id,
                      request_status: payload.new.status,
                      request_distance: payload.new.distance_km,
                      request_created_at: payload.new.created_at
                    });
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                  }
                });
              }
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'booking_requests',
            filter: `driver_id=eq.${id}`,
          },
          async (payload) => {
            console.log("📝 Booking request updated:", payload);
            
            if (payload.new.status === 'expired') {
              clearExpiryTimer(payload.new.id);
              addNotification({
                type: 'warning',
                title: 'Request Expired',
                message: 'A booking request has expired',
                duration: 4000
              });
              await fetchPendingRequests(id);
            }
            
            if (payload.new.status === 'accepted') {
              clearExpiryTimer(payload.new.id);
            }
          }
        )
        .subscribe((status) => {
          console.log("📡 Request subscription status:", status);
          
          if (status === 'SUBSCRIBED') {
            reconnectAttempts.current = 0;
          } else if (status === 'CHANNEL_ERROR' && reconnectAttempts.current < 5) {
            reconnectAttempts.current += 1;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
            setTimeout(() => {
              if (isMounted.current) {
                setupRequestSubscription();
              }
            }, delay);
          }
        });

      return subscription;
    };

    const setupBookingSubscription = () => {
      const subscription = supabase
        .channel(`driver-bookings-${id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'bookings',
            filter: `driver_id=eq.${id}`,
          },
          async (payload) => {
            console.log("📅 Booking update received:", payload);
            
            if (payload.eventType === 'UPDATE') {
              if (payload.new.status === 'accepted' && !activeBooking) {
                addNotification({
                  type: 'success',
                  title: 'Booking Accepted!',
                  message: 'You have accepted a new booking',
                  duration: 5000,
                  actionable: true,
                  actionText: 'View',
                  onAction: () => fetchActiveBooking(id)
                });
                await fetchActiveBooking(id);
              }
              
              if (activeBooking && payload.new.id === activeBooking.id) {
                setActiveBooking(prev => ({ ...prev, ...payload.new }));
                
                if (payload.new.driver_arrived_at && !hasArrivedAtPickup) {
                  addNotification({
                    type: 'success',
                    title: 'Arrival Confirmed',
                    message: 'You have arrived at pickup location',
                    duration: 4000
                  });
                  setHasArrivedAtPickup(true);
                }
                
                if (payload.new.ride_started_at && !rideStarted) {
                  addNotification({
                    type: 'info',
                    title: 'Ride Started',
                    message: 'Trip has started',
                    duration: 4000
                  });
                  setRideStarted(true);
                }

                if (payload.new.status === 'cancelled') {
                  handleActiveTripCancelled(payload.new);
                }

                if (payload.new.payment_status === 'paid' && !paymentSuccess && !isProcessingPayment) {
                  handlePaymentSuccess(payload.new);
                }
              }
            }
          }
        )
        .subscribe((status) => {
          console.log("📡 Booking subscription status:", status);
        });

      return subscription;
    };

    requestSubscriptionRef.current = setupRequestSubscription();
    bookingSubscriptionRef.current = setupBookingSubscription();

    return () => {
      if (requestSubscriptionRef.current) requestSubscriptionRef.current.unsubscribe();
      if (bookingSubscriptionRef.current) bookingSubscriptionRef.current.unsubscribe();
      
      Object.keys(requestExpiryTimers.current).forEach(timerId => {
        clearTimeout(requestExpiryTimers.current[timerId]);
      });
      requestExpiryTimers.current = {};
    };
  }, [activeBooking, hasArrivedAtPickup, rideStarted, paymentSuccess, isProcessingPayment]);

  // ================= PAYMENT HANDLING =================
  const checkPaymentStatus = async () => {
    if (!activeBooking || !isMounted.current) return;
    
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select("payment_status, payment_type")
        .eq("id", activeBooking.id)
        .single();

      if (error) throw error;

      if (data.payment_status === 'paid' && !paymentSuccess && !isProcessingPayment) {
        handlePaymentSuccess(data);
      }
    } catch (err) {
      console.log("❌ Error checking payment status:", err);
    }
  };

  const handlePaymentSuccess = (bookingData) => {
    if (isProcessingPayment) return;

    setIsProcessingPayment(true);
    setPaymentSuccess(true);
    setPaymentMethod(bookingData.payment_type || 'wallet');
    setShowPaymentSuccessBanner(true);
    setWaitingForPayment(false);

    addNotification({
      type: 'success',
      title: 'Payment Received!',
      message: `Payment of ₱${activeBooking?.fare?.toFixed(2)} received`,
      duration: 5000,
      actionable: true,
      actionText: 'Complete Trip',
      onAction: () => completeTrip()
    });

    setTimeout(() => {
      if (isMounted.current && !isProcessingPayment) {
        completeTrip();
      }
    }, 3000);
  };

  // ================= LOCATION TRACKING =================
  const updateDriverLocation = async (coords) => {
    if (!driverId || !isMounted.current) return;
    
    try {
      const { data: existing, error: checkError } = await supabase
        .from("driver_locations")
        .select("id")
        .eq("driver_id", driverId)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existing) {
        await supabase
          .from("driver_locations")
          .update({
            latitude: coords.latitude,
            longitude: coords.longitude,
            is_online: true,
            last_updated: new Date(),
            last_heartbeat: new Date()
          })
          .eq("driver_id", driverId);
      } else {
        await supabase
          .from("driver_locations")
          .insert({
            driver_id: driverId,
            latitude: coords.latitude,
            longitude: coords.longitude,
            is_online: true,
            last_updated: new Date(),
            last_heartbeat: new Date()
          });
      }
    } catch (err) {
      console.log("❌ Error updating location:", err);
    }
  };

  const startLocationTracking = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        showAlert("Permission Required", "Location permission is needed to track rides", 'warning');
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
      await updateDriverLocation(newLocation);

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
            if (!hasArrivedAtPickup && !activeBooking.driver_arrived_at) {
              calculateRouteToPickup(updatedLocation, {
                latitude: activeBooking.pickup_latitude,
                longitude: activeBooking.pickup_longitude
              });
            } else if (hasArrivedAtPickup && rideStarted) {
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

  // ================= ROUTE CALCULATION =================
  const calculateRouteToPickup = async (driverLoc, pickupLoc) => {
    if (!driverLoc || !pickupLoc || !googleApiKey) return;
    
    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${driverLoc.latitude},${driverLoc.longitude}&destination=${pickupLoc.latitude},${pickupLoc.longitude}&key=${googleApiKey}&mode=driving`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === "OK" && data.routes[0]) {
        const points = decodePolyline(data.routes[0].overview_polyline.points);
        setRouteCoordinates(points);
        
        const leg = data.routes[0].legs[0];
        setEstimatedDistance((leg.distance.value / 1000).toFixed(1));
        setEstimatedTime(Math.round(leg.duration.value / 60));
        
        if (mapRef.current && points.length > 0) {
          mapRef.current.fitToCoordinates(points, {
            edgePadding: { top: responsive.size(50), right: responsive.size(50), bottom: responsive.size(50), left: responsive.size(50) },
            animated: true,
          });
        }
      }
    } catch (err) {
      console.log("❌ Error calculating route:", err);
    }
  };

  const calculateRouteToDropoff = async (pickupLoc, dropoffLoc) => {
    if (!pickupLoc || !dropoffLoc || !googleApiKey) return;
    
    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${pickupLoc.latitude},${pickupLoc.longitude}&destination=${dropoffLoc.latitude},${dropoffLoc.longitude}&key=${googleApiKey}&mode=driving`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === "OK" && data.routes[0]) {
        const points = decodePolyline(data.routes[0].overview_polyline.points);
        setRouteCoordinates(points);
        
        const leg = data.routes[0].legs[0];
        setEstimatedDistance((leg.distance.value / 1000).toFixed(1));
        setEstimatedTime(Math.round(leg.duration.value / 60));
        
        if (mapRef.current && points.length > 0) {
          mapRef.current.fitToCoordinates(points, {
            edgePadding: { top: responsive.size(50), right: responsive.size(50), bottom: responsive.size(50), left: responsive.size(50) },
            animated: true,
          });
        }
      }
    } catch (err) {
      console.log("❌ Error calculating route:", err);
    }
  };

  const calculateRequestRoute = async (request) => {
    if (!request?.pickup_latitude || !request?.pickup_longitude || 
        !request?.dropoff_latitude || !request?.dropoff_longitude || !googleApiKey) return;

    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${request.pickup_latitude},${request.pickup_longitude}&destination=${request.dropoff_latitude},${request.dropoff_longitude}&key=${googleApiKey}&mode=driving`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === "OK" && data.routes[0]) {
        const points = decodePolyline(data.routes[0].overview_polyline.points);
        setRequestRouteCoordinates(points);
        
        const leg = data.routes[0].legs[0];
        setRequestDistance((leg.distance.value / 1000).toFixed(1));
        setRequestDuration(Math.round(leg.duration.value / 60));
      }
    } catch (err) {
      console.log("❌ Error calculating route:", err);
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

  // ================= FETCH FUNCTIONS =================
  const fetchActiveBooking = async (id) => {
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select(`*, commuter:commuters(id, first_name, last_name, phone, email, profile_picture)`)
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
        if (data.ride_started_at) setRideStarted(true);
        if (data.payment_status === 'paid') {
          setPaymentSuccess(true);
          setPaymentMethod(data.payment_type);
          setShowPaymentSuccessBanner(true);
        }
      } else {
        setActiveBooking(null);
        setCommuter(null);
        setHasArrivedAtPickup(false);
        setRideStarted(false);
        setPaymentSuccess(false);
      }
    } catch (err) {
      console.log("❌ Error fetching active booking:", err);
    }
  };

  const fetchPendingRequests = async (id) => {
    try {
      const { data, error } = await supabase
        .from("booking_requests")
        .select(`
          id,
          status,
          distance_km,
          created_at,
          booking:bookings!inner (
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
            commuter:commuters (
              first_name,
              last_name,
              phone,
              profile_picture
            )
          )
        `)
        .eq("driver_id", id)
        .in("status", ["pending"])
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

      setPendingRequests(requests || []);
      
      requests.forEach(request => {
        startExpiryTimer(request.request_id, request.id);
      });
      
      if (requests.length > 0 && !selectedRequest && !activeBooking) {
        setSelectedRequest(requests[0]);
      }
    } catch (err) {
      console.log("❌ Error fetching pending requests:", err);
    }
  };

  // ================= BOOKING ACTIONS =================
  const handleAcceptRequest = async (bookingId, requestId) => {
    showAlert("Accept Booking", "Are you sure you want to accept this booking?", 'info', {
      confirmText: "Accept",
      cancelText: "Cancel",
      onConfirm: async () => {
        try {
          setLoading(true);
          setAlertVisible(false);
          
          clearExpiryTimer(requestId);
          
          const { data: bookingCheck, error: checkError } = await supabase
            .from("bookings")
            .select("status")
            .eq("id", bookingId)
            .single();

          if (checkError) throw checkError;

          if (bookingCheck.status !== 'pending') {
            addNotification({
              type: 'warning',
              title: 'Cannot Accept',
              message: `Booking is no longer available`,
              duration: 4000
            });
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

          addNotification({
            type: 'success',
            title: 'Booking Accepted!',
            message: 'Head to pickup location',
            duration: 4000,
            actionable: true,
            actionText: 'Navigate',
            onAction: () => openMaps(
              selectedRequest?.pickup_latitude,
              selectedRequest?.pickup_longitude,
              "Pickup Location"
            )
          });
        } catch (err) {
          console.log("❌ Error accepting booking:", err);
          addNotification({
            type: 'error',
            title: 'Error',
            message: 'Failed to accept booking',
            duration: 4000
          });
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleDeclineRequest = async (bookingId, requestId) => {
    showAlert("Decline Booking", "Are you sure you want to decline this booking?", 'warning', {
      confirmText: "Decline",
      cancelText: "Cancel",
      onConfirm: async () => {
        try {
          setAlertVisible(false);
          clearExpiryTimer(requestId);
          
          const { error } = await supabase
            .from("booking_requests")
            .update({ 
              status: "rejected",
              responded_at: new Date()
            })
            .eq("id", requestId);

          if (error) throw error;

          addNotification({
            type: 'info',
            title: 'Booking Declined',
            message: 'You have declined the booking',
            duration: 3000
          });
          
          await fetchPendingRequests(driverId);
        } catch (err) {
          console.log("❌ Error declining booking:", err);
          addNotification({
            type: 'error',
            title: 'Error',
            message: 'Failed to decline booking',
            duration: 4000
          });
        }
      }
    });
  };

  const handleArrivedAtPickup = async () => {
    showAlert("Arrived at Pickup", "Have you arrived at the pickup location?", 'info', {
      confirmText: "Yes, I'm Here",
      cancelText: "No",
      onConfirm: async () => {
        try {
          setAlertVisible(false);
          setLoading(true);
          
          const { error } = await supabase
            .from("bookings")
            .update({ 
              driver_arrived_at: new Date(),
              updated_at: new Date()
            })
            .eq("id", activeBooking.id);

          if (error) throw error;

          setHasArrivedAtPickup(true);
          
          addNotification({
            type: 'success',
            title: 'Arrival Confirmed!',
            message: 'Passenger notified! Proceed to destination.',
            duration: 4000
          });
        } catch (err) {
          console.log("❌ Error:", err);
          addNotification({
            type: 'error',
            title: 'Error',
            message: 'Failed to update status',
            duration: 4000
          });
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleStartRide = async () => {
    showAlert("Start Ride", "Have you picked up the passenger?", 'info', {
      confirmText: "Yes, Start Ride",
      cancelText: "Not Yet",
      onConfirm: async () => {
        try {
          setAlertVisible(false);
          setLoading(true);
          
          const { error } = await supabase
            .from("bookings")
            .update({ 
              ride_started_at: new Date(),
              status: "ongoing",
              updated_at: new Date()
            })
            .eq("id", activeBooking.id);

          if (error) throw error;

          setRideStarted(true);
          
          addNotification({
            type: 'success',
            title: 'Ride Started!',
            message: 'Head to destination',
            duration: 4000
          });
        } catch (err) {
          console.log("❌ Error:", err);
          addNotification({
            type: 'error',
            title: 'Error',
            message: 'Failed to start ride',
            duration: 4000
          });
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const processCashPayment = async () => {
    try {
      setLoading(true);
      
      const actualFare = activeBooking.fare || 0;

      const { error: bookingError } = await supabase
        .from("bookings")
        .update({
          payment_status: "paid",
          payment_type: "cash",
          updated_at: new Date()
        })
        .eq("id", activeBooking.id);

      if (bookingError) throw bookingError;

      const { data: wallet, error: walletError } = await supabase
        .from("driver_wallets")
        .select("cash_earnings")
        .eq("driver_id", driverId)
        .maybeSingle();

      if (walletError) throw walletError;

      const newCashEarnings = (wallet?.cash_earnings || 0) + actualFare;

      await supabase
        .from("driver_wallets")
        .upsert({
          driver_id: driverId,
          cash_earnings: newCashEarnings,
          updated_at: new Date()
        }, { onConflict: 'driver_id' });

      setPaymentSuccess(true);
      setPaymentMethod('cash');
      setShowPaymentSuccessBanner(true);
      
      addNotification({
        type: 'success',
        title: 'Cash Payment',
        message: `₱${actualFare.toFixed(2)} cash received`,
        duration: 4000
      });
      
      await completeTrip();

    } catch (err) {
      console.log("❌ Error processing cash payment:", err);
      addNotification({
        type: 'error',
        title: 'Payment Failed',
        message: err.message,
        duration: 5000
      });
    } finally {
      setLoading(false);
    }
  };

  const completeTrip = async () => {
    try {
      const { error: bookingError } = await supabase
        .from("bookings")
        .update({ 
          status: "completed",
          ride_completed_at: new Date(),
          updated_at: new Date()
        })
        .eq("id", activeBooking.id);

      if (bookingError) throw bookingError;

      setActiveBooking(null);
      setCommuter(null);
      setBookingStatus("pending");
      setIsNavigating(false);
      setHasArrivedAtPickup(false);
      setRideStarted(false);
      setRouteCoordinates([]);
      setWaitingForPayment(false);
      setIsProcessingPayment(false);
      setPaymentSuccess(false);
      setShowPaymentSuccessBanner(false);
      setNavigationInitialized(false);

      addNotification({
        type: 'success',
        title: 'Trip Completed!',
        message: 'Thank you for your service',
        duration: 6000
      });

      await fetchPendingRequests(driverId);

    } catch (err) {
      console.log("❌ Error completing trip:", err);
      throw err;
    }
  };

  const handleCancelTrip = () => {
    if (bookingStatus !== "accepted" && bookingStatus !== "ongoing") {
      addNotification({
        type: 'warning',
        title: 'Cannot Cancel',
        message: 'This trip cannot be cancelled at this stage',
        duration: 3000
      });
      return;
    }

    showAlert("Cancel Trip", "Are you sure you want to cancel this trip?", 'warning', {
      confirmText: "Yes, Cancel",
      cancelText: "No",
      onConfirm: async () => {
        try {
          setAlertVisible(false);
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
          setWaitingForPayment(false);
          setPaymentSuccess(false);
          setNavigationInitialized(false);

          addNotification({
            type: 'error',
            title: 'Trip Cancelled',
            message: 'The trip has been cancelled',
            duration: 4000
          });
          
          await fetchPendingRequests(driverId);
        } catch (err) {
          console.log("❌ Error cancelling trip:", err);
          addNotification({
            type: 'error',
            title: 'Error',
            message: 'Failed to cancel trip',
            duration: 4000
          });
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleActiveTripCancelled = (cancelledBooking) => {
    const cancelledBy = cancelledBooking.cancelled_by || 'commuter';
    const reason = cancelledBooking.cancellation_reason || 'No reason provided';
    
    addNotification({
      type: 'error',
      title: 'Trip Cancelled',
      message: `Cancelled by ${cancelledBy}: ${reason}`,
      duration: 7000
    });
    
    setActiveBooking(null);
    setCommuter(null);
    setBookingStatus("pending");
    setIsNavigating(false);
    setHasArrivedAtPickup(false);
    setRideStarted(false);
    setRouteCoordinates([]);
    setWaitingForPayment(false);
    setPaymentSuccess(false);
    setNavigationInitialized(false);
    
    fetchPendingRequests(driverId);
  };

  const handleCompleteTrip = () => {
    if (isProcessingPayment) {
      addNotification({
        type: 'warning',
        title: 'Processing',
        message: 'Please wait while payment is being processed.',
        duration: 3000
      });
      return;
    }

    showAlert(
      "Complete Trip",
      "How would the passenger like to pay?",
      'info',
      {
        confirmText: "💰 Cash",
        cancelText: "Cancel",
        onConfirm: () => {
          setAlertVisible(false);
          processCashPayment();
        }
      }
    );
  };

  // ================= UTILITY FUNCTIONS =================
  const formatRequestTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffSeconds = Math.floor((now - date) / 1000);
    
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    return date.toLocaleDateString();
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
          edgePadding: { top: responsive.size(50), right: responsive.size(50), bottom: responsive.size(50), left: responsive.size(50) },
          animated: true,
        });
      }
    }
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
          edgePadding: { top: responsive.size(50), right: responsive.size(50), bottom: responsive.size(50), left: responsive.size(50) },
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
      addNotification({
        type: 'warning',
        title: 'No Phone Number',
        message: 'Phone number not available',
        duration: 3000
      });
      return;
    }
    Linking.openURL(`tel:${commuter.phone}`);
  };

  const messageCommuter = () => {
    if (!commuter?.phone) {
      addNotification({
        type: 'warning',
        title: 'No Phone Number',
        message: 'Phone number not available',
        duration: 3000
      });
      return;
    }
    Linking.openURL(`sms:${commuter.phone}`);
  };

  const getStatusText = () => {
    if (rideStarted) return "🚗 On the way to Destination";
    if (hasArrivedAtPickup) return "📍 Waiting for Passenger";
    return "🚗 Heading to Pickup";
  };

  const getNavigationInstruction = () => {
    if (!hasArrivedAtPickup) return "Navigate to pickup location";
    return "Navigate to destination";
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (driverId) {
      await Promise.all([
        fetchActiveBooking(driverId),
        fetchPendingRequests(driverId)
      ]);
    }
    setRefreshing(false);
  };

  // ================= INITIALIZATION =================
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (locationSubscription) locationSubscription.remove();
      if (requestSubscriptionRef.current) requestSubscriptionRef.current.unsubscribe();
      if (bookingSubscriptionRef.current) bookingSubscriptionRef.current.unsubscribe();
      
      Object.keys(requestExpiryTimers.current).forEach(timerId => {
        clearTimeout(requestExpiryTimers.current[timerId]);
      });
      requestExpiryTimers.current = {};
    };
  }, []);

  useEffect(() => {
    if (!driverId) return;
    setupRealtimeSubscriptions(driverId);
  }, [driverId]);

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

  useEffect(() => {
    if (activeBooking && driverLocation && !navigationInitialized) {
      setIsNavigating(true);
      setNavigationInitialized(true);
      
      if (activeBooking.driver_arrived_at) {
        setHasArrivedAtPickup(true);
        if (activeBooking.ride_started_at) setRideStarted(true);
        calculateRouteToDropoff(
          { latitude: activeBooking.pickup_latitude, longitude: activeBooking.pickup_longitude },
          { latitude: activeBooking.dropoff_latitude, longitude: activeBooking.dropoff_longitude }
        );
      } else {
        calculateRouteToPickup(driverLocation, {
          latitude: activeBooking.pickup_latitude,
          longitude: activeBooking.pickup_longitude
        });
      }
    }
  }, [activeBooking, driverLocation, navigationInitialized]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        if (waitingForPayment && activeBooking && !paymentSuccess) {
          checkPaymentStatus();
        }
        if (driverId) {
          fetchActiveBooking(driverId);
          fetchPendingRequests(driverId);
        }
      }
      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, [waitingForPayment, activeBooking, paymentSuccess, driverId]);

  useEffect(() => {
    if (showPaymentSuccessBanner) {
      const timeout = setTimeout(() => setShowPaymentSuccessBanner(false), 5000);
      return () => clearTimeout(timeout);
    }
  }, [showPaymentSuccessBanner]);

  useFocusEffect(
    useCallback(() => {
      const initialize = async () => {
        const id = await AsyncStorage.getItem("user_id");
        setDriverId(id);
        if (id && isMounted.current) {
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
          setLocationSubscription(null);
        }
        setNavigationInitialized(false);
      };
    }, [])
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
        <Text style={[styles.loadingText, { fontSize: responsive.font(14) }]}>Loading...</Text>
      </View>
    );
  }

  // ================= RENDER ACTIVE RIDE =================
  if (activeBooking) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={[styles.notificationStack, { top: responsive.size(100) }]}>
          {notifications.map((notification, index) => (
            <Animated.View
              key={notification.id}
              style={[
                styles.notificationCard,
                {
                  transform: [{
                    translateY: notificationAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [index * -10, 0]
                    })
                  }],
                  opacity: notificationAnimation,
                  zIndex: notifications.length - index
                }
              ]}
            >
              <LinearGradient
                colors={getNotificationColors(notification.type)}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.notificationGradient}
              >
                <View style={styles.notificationIcon}>
                  <Ionicons name={getNotificationIcon(notification.type)} size={responsive.icon(24)} color="#FFF" />
                </View>
                <View style={styles.notificationContent}>
                  <Text style={[styles.notificationTitle, { fontSize: responsive.font(14) }]}>{notification.title}</Text>
                  <Text style={[styles.notificationMessage, { fontSize: responsive.font(12) }]} numberOfLines={2}>
                    {notification.message}
                  </Text>
                </View>
                {notification.actionable && (
                  <TouchableOpacity 
                    style={styles.notificationAction}
                    onPress={() => {
                      notification.onAction?.();
                      removeNotification(notification.id);
                    }}
                  >
                    <Text style={[styles.notificationActionText, { fontSize: responsive.font(12) }]}>
                      {notification.actionText || 'View'}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity 
                  style={styles.notificationClose}
                  onPress={() => removeNotification(notification.id)}
                >
                  <Ionicons name="close" size={responsive.icon(18)} color="#FFF" />
                </TouchableOpacity>
              </LinearGradient>
            </Animated.View>
          ))}
        </View>

        {showPaymentSuccessBanner && paymentSuccess && (
          <View style={[styles.paymentSuccessBanner, { top: responsive.size(70) }]}>
            <Ionicons name="checkmark-circle" size={responsive.icon(24)} color="#10B981" />
            <View style={styles.paymentSuccessBannerText}>
              <Text style={[styles.paymentSuccessTitle, { fontSize: responsive.font(14) }]}>Payment Received!</Text>
              <Text style={[styles.paymentSuccessMessage, { fontSize: responsive.font(12) }]}>
                {paymentMethod === 'cash' 
                  ? `Cash payment of ₱${activeBooking.fare?.toFixed(2)} received`
                  : `Payment received via ${paymentMethod}`}
              </Text>
            </View>
            <Pressable onPress={() => setShowPaymentSuccessBanner(false)}>
              <Ionicons name="close" size={responsive.icon(20)} color="#666" />
            </Pressable>
          </View>
        )}

        <View style={[styles.header, { paddingTop: responsive.size(12), paddingBottom: responsive.size(16), paddingHorizontal: responsive.size(20) }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={responsive.icon(24)} color="#FFF" />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={[styles.headerSubtitle, { fontSize: responsive.font(14) }]}>Active Ride</Text>
            <Text style={[styles.headerTitle, { fontSize: responsive.font(18) }]}>{getStatusText()}</Text>
          </View>
          <TouchableOpacity 
            style={styles.notificationBell}
            onPress={() => setShowNotificationCenter(true)}
          >
            <Ionicons name="notifications" size={responsive.icon(24)} color="#FFF" />
            {unreadCount > 0 && (
              <View style={[styles.notificationBadge, { minWidth: responsive.size(20), height: responsive.size(20) }]}>
                <Text style={[styles.notificationBadgeText, { fontSize: responsive.font(10) }]}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={[styles.mapContainer, { height: responsive.size(350) }]}>
          <MapView
            ref={mapRef}
            style={styles.map}
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
                <View style={[styles.pickupMarker, { padding: responsive.size(8), borderRadius: responsive.radius(20) }]}>
                  <Ionicons name="location" size={responsive.icon(16)} color="#FFF" />
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
                <View style={[styles.dropoffMarker, { padding: responsive.size(8), borderRadius: responsive.radius(20) }]}>
                  <Ionicons name="flag" size={responsive.icon(16)} color="#FFF" />
                </View>
              </Marker>
            )}

            {driverLocation && (
              <Marker coordinate={driverLocation} title="You" flat>
                <View style={[styles.driverMarker, { padding: responsive.size(8), borderRadius: responsive.radius(20) }]}>
                  <Ionicons name="car" size={responsive.icon(16)} color="#FFF" />
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

          <Pressable style={[styles.locateButton, { width: responsive.size(50), height: responsive.size(50), borderRadius: responsive.radius(25) }]} onPress={fitMapToMarkers}>
            <Ionicons name="locate" size={responsive.icon(24)} color="#183B5C" />
          </Pressable>

          {isNavigating && (
            <View style={[styles.navigationInstruction, { padding: responsive.size(12), borderRadius: responsive.radius(30) }]}>
              <Ionicons name="navigate" size={responsive.icon(20)} color="#FFF" />
              <Text style={[styles.navigationInstructionText, { fontSize: responsive.font(14), marginLeft: responsive.size(8) }]}>
                {getNavigationInstruction()} • {estimatedDistance || "?"} km • {estimatedTime || "?"} min
              </Text>
            </View>
          )}
        </View>

        <ScrollView 
          style={styles.bottomSheetScroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.bottomSheetContent, { padding: responsive.size(20) }]}
        >
          <View style={[styles.commuterContainer, { marginBottom: responsive.size(15) }]}>
            <View style={[styles.commuterAvatar, { width: responsive.size(50), height: responsive.size(50), borderRadius: responsive.radius(25), marginRight: responsive.size(12) }]}>
              {commuter?.profile_picture ? (
                <Image source={{ uri: commuter.profile_picture }} style={[styles.commuterImage, { width: responsive.size(46), height: responsive.size(46), borderRadius: responsive.radius(23) }]} />
              ) : (
                <Ionicons name="person-circle" size={responsive.icon(50)} color="#9CA3AF" />
              )}
            </View>
            <View style={styles.commuterInfo}>
              <Text style={[styles.commuterName, { fontSize: responsive.font(16) }]}>
                {commuter?.first_name} {commuter?.last_name}
              </Text>
              <Text style={[styles.commuterLabel, { fontSize: responsive.font(12) }]}>
                {activeBooking.passenger_count || 1} passenger{activeBooking.passenger_count > 1 ? 's' : ''}
              </Text>
            </View>
            <View style={[styles.commuterActions, { gap: responsive.size(10) }]}>
              <Pressable style={[styles.callButton, { width: responsive.size(40), height: responsive.size(40), borderRadius: responsive.radius(20) }]} onPress={callCommuter}>
                <Ionicons name="call" size={responsive.icon(20)} color="#FFF" />
              </Pressable>
              <Pressable style={[styles.messageButton, { width: responsive.size(40), height: responsive.size(40), borderRadius: responsive.radius(20) }]} onPress={messageCommuter}>
                <Ionicons name="chatbubble" size={responsive.icon(20)} color="#183B5C" />
              </Pressable>
            </View>
          </View>

          <View style={[styles.locationsContainer, { marginBottom: responsive.size(15) }]}>
            <View style={[styles.locationRow, { marginBottom: responsive.size(8) }]}>
              <Ionicons name="location" size={responsive.icon(16)} color="#10B981" />
              <Text style={[styles.locationText, { fontSize: responsive.font(14), marginLeft: responsive.size(8) }]} numberOfLines={1}>
                {activeBooking.pickup_location}
                {activeBooking.pickup_details ? ` (${activeBooking.pickup_details})` : ''}
              </Text>
            </View>
            <View style={[styles.locationRow, { marginBottom: responsive.size(8) }]}>
              <Ionicons name="flag" size={responsive.icon(16)} color="#EF4444" />
              <Text style={[styles.locationText, { fontSize: responsive.font(14), marginLeft: responsive.size(8) }]} numberOfLines={1}>
                {activeBooking.dropoff_location}
                {activeBooking.dropoff_details ? ` (${activeBooking.dropoff_details})` : ''}
              </Text>
            </View>
          </View>

          <View style={[styles.statsContainer, { gap: responsive.size(10), marginBottom: responsive.size(20) }]}>
            <View style={[styles.statBox, { padding: responsive.size(10), borderRadius: responsive.radius(12) }]}>
              <Text style={[styles.statLabel, { fontSize: responsive.font(11) }]}>Distance</Text>
              <Text style={[styles.statValue, { fontSize: responsive.font(16) }]}>
                {estimatedDistance || activeBooking.distance_km || "?"} km
              </Text>
            </View>
            <View style={[styles.statBox, { padding: responsive.size(10), borderRadius: responsive.radius(12) }]}>
              <Text style={[styles.statLabel, { fontSize: responsive.font(11) }]}>Est. Time</Text>
              <Text style={[styles.statValue, { fontSize: responsive.font(16) }]}>
                {estimatedTime || activeBooking.duration_minutes || "?"} min
              </Text>
            </View>
            <View style={[styles.statBox, { padding: responsive.size(10), borderRadius: responsive.radius(12) }]}>
              <Text style={[styles.statLabel, { fontSize: responsive.font(11) }]}>Fare</Text>
              <Text style={[styles.statValue, { fontSize: responsive.font(16) }]}>
                ₱{activeBooking.fare?.toFixed(2) || "0.00"}
              </Text>
            </View>
          </View>

          <View style={[styles.actionContainer, { gap: responsive.size(10), marginBottom: responsive.size(10) }]}>
            {!hasArrivedAtPickup && !rideStarted && !paymentSuccess && !waitingForPayment && (
              <Pressable style={[styles.arrivedButton, { padding: responsive.size(14), borderRadius: responsive.radius(12), gap: responsive.size(8) }]} onPress={handleArrivedAtPickup}>
                <Ionicons name="location" size={responsive.icon(20)} color="#FFF" />
                <Text style={[styles.arrivedButtonText, { fontSize: responsive.font(14) }]}>I've Arrived</Text>
              </Pressable>
            )}

            {hasArrivedAtPickup && !rideStarted && !paymentSuccess && !waitingForPayment && (
              <Pressable style={[styles.startRideButton, { padding: responsive.size(14), borderRadius: responsive.radius(12), gap: responsive.size(8) }]} onPress={handleStartRide}>
                <Ionicons name="play" size={responsive.icon(20)} color="#FFF" />
                <Text style={[styles.startRideButtonText, { fontSize: responsive.font(14) }]}>Start Ride</Text>
              </Pressable>
            )}

            {rideStarted && !paymentSuccess && !waitingForPayment && (
              <Pressable style={[styles.completeButton, { padding: responsive.size(14), borderRadius: responsive.radius(12), gap: responsive.size(8) }]} onPress={handleCompleteTrip}>
                <Ionicons name="checkmark-circle" size={responsive.icon(20)} color="#FFF" />
                <Text style={[styles.completeButtonText, { fontSize: responsive.font(14) }]}>Complete Trip</Text>
              </Pressable>
            )}

            {paymentSuccess && (
              <Pressable style={[styles.completeButton, { padding: responsive.size(14), borderRadius: responsive.radius(12), gap: responsive.size(8) }]} onPress={completeTrip}>
                <Ionicons name="checkmark-circle" size={responsive.icon(20)} color="#FFF" />
                <Text style={[styles.completeButtonText, { fontSize: responsive.font(14) }]}>Complete Trip</Text>
              </Pressable>
            )}
          </View>

          <Pressable style={[styles.cancelButtonLarge, { padding: responsive.size(12), borderRadius: responsive.radius(12), gap: responsive.size(8), marginBottom: responsive.size(10) }]} onPress={handleCancelTrip}>
            <Ionicons name="close-circle" size={responsive.icon(20)} color="#EF4444" />
            <Text style={[styles.cancelButtonTextLarge, { fontSize: responsive.font(14) }]}>Cancel Trip</Text>
          </Pressable>

          <Pressable
            style={[styles.navigationButton, { padding: responsive.size(14), borderRadius: responsive.radius(12), gap: responsive.size(8) }]}
            onPress={() => openMaps(
              !hasArrivedAtPickup ? activeBooking.pickup_latitude : activeBooking.dropoff_latitude,
              !hasArrivedAtPickup ? activeBooking.pickup_longitude : activeBooking.dropoff_longitude,
              !hasArrivedAtPickup ? "Pickup Location" : "Dropoff Location"
            )}
          >
            <Ionicons name="navigate" size={responsive.icon(20)} color="#FFF" />
            <Text style={[styles.navigationButtonText, { fontSize: responsive.font(14) }]}>Open Maps</Text>
          </Pressable>
        </ScrollView>

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
      </View>
    );
  }

  // ================= RENDER PENDING REQUESTS =================
  if (pendingRequests.length > 0) {
    return (
      <View style={[styles.container, { paddingTop: 0 }]}>
        <View style={[styles.notificationStack, { top: responsive.size(80) }]}>
          {notifications.map((notification, index) => (
            <Animated.View
              key={notification.id}
              style={[
                styles.notificationCard,
                {
                  transform: [{
                    translateY: notificationAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [index * -10, 0]
                    })
                  }],
                  opacity: notificationAnimation,
                  zIndex: notifications.length - index
                }
              ]}
            >
              <LinearGradient
                colors={getNotificationColors(notification.type)}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.notificationGradient}
              >
                <View style={styles.notificationIcon}>
                  <Ionicons name={getNotificationIcon(notification.type)} size={responsive.icon(24)} color="#FFF" />
                </View>
                <View style={styles.notificationContent}>
                  <Text style={[styles.notificationTitle, { fontSize: responsive.font(14) }]}>{notification.title}</Text>
                  <Text style={[styles.notificationMessage, { fontSize: responsive.font(12) }]} numberOfLines={2}>
                    {notification.message}
                  </Text>
                </View>
                {notification.actionable && (
                  <TouchableOpacity 
                    style={styles.notificationAction}
                    onPress={() => {
                      notification.onAction?.();
                      removeNotification(notification.id);
                    }}
                  >
                    <Text style={[styles.notificationActionText, { fontSize: responsive.font(12) }]}>
                      {notification.actionText || 'View'}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity 
                  style={styles.notificationClose}
                  onPress={() => removeNotification(notification.id)}
                >
                  <Ionicons name="close" size={responsive.icon(18)} color="#FFF" />
                </TouchableOpacity>
              </LinearGradient>
            </Animated.View>
          ))}
        </View>

        <View style={[styles.header, { paddingTop: responsive.size(12), paddingBottom: responsive.size(16), paddingHorizontal: responsive.size(20) }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={responsive.icon(24)} color="#FFF" />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={[styles.headerSubtitle, { fontSize: responsive.font(14) }]}>New Bookings</Text>
            <Text style={[styles.headerTitle, { fontSize: responsive.font(18) }]}>{pendingRequests.length} Request{pendingRequests.length > 1 ? 's' : ''}</Text>
          </View>
          <TouchableOpacity 
            style={styles.notificationBell}
            onPress={() => setShowNotificationCenter(true)}
          >
            <Ionicons name="notifications" size={responsive.icon(24)} color="#FFF" />
            {unreadCount > 0 && (
              <View style={[styles.notificationBadge, { minWidth: responsive.size(20), height: responsive.size(20) }]}>
                <Text style={[styles.notificationBadgeText, { fontSize: responsive.font(10) }]}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollableContainer}
          contentContainerStyle={[styles.scrollableContent, { padding: responsive.size(20), paddingTop: 0 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#183B5C" />
          }
        >
          <View style={[styles.mapPreview, { height: responsive.size(250), marginBottom: responsive.size(20), borderRadius: responsive.radius(16) }]}>
            <MapView
              ref={mapRef}
              style={styles.mapPreviewMap}
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
            >
              {selectedRequest?.pickup_latitude && (
                <Marker
                  coordinate={{
                    latitude: selectedRequest.pickup_latitude,
                    longitude: selectedRequest.pickup_longitude,
                  }}
                  title="Pickup Location"
                >
                  <View style={[styles.pickupMarker, { padding: responsive.size(8), borderRadius: responsive.radius(20) }]}>
                    <Ionicons name="location" size={responsive.icon(16)} color="#FFF" />
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
                  <View style={[styles.dropoffMarker, { padding: responsive.size(8), borderRadius: responsive.radius(20) }]}>
                    <Ionicons name="flag" size={responsive.icon(16)} color="#FFF" />
                  </View>
                </Marker>
              )}

              {driverLocation && (
                <Marker coordinate={driverLocation} title="Your Location" flat>
                  <View style={[styles.driverMarker, { padding: responsive.size(8), borderRadius: responsive.radius(20) }]}>
                    <Ionicons name="car" size={responsive.icon(16)} color="#FFF" />
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

            <Pressable style={[styles.locateButton, { width: responsive.size(50), height: responsive.size(50), borderRadius: responsive.radius(25) }]} onPress={fitRequestMapToMarkers}>
              <Ionicons name="locate" size={responsive.icon(24)} color="#183B5C" />
            </Pressable>
          </View>

          {selectedRequest && requestDistance && requestDuration && (
            <View style={[styles.requestSummary, { marginBottom: responsive.size(20), padding: responsive.size(15), borderRadius: responsive.radius(12) }]}>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Ionicons name="map-outline" size={responsive.icon(16)} color="#666" />
                  <Text style={[styles.summaryLabel, { fontSize: responsive.font(11), marginTop: responsive.size(2) }]}>Distance</Text>
                  <Text style={[styles.summaryValue, { fontSize: responsive.font(14) }]}>{requestDistance} km</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Ionicons name="time-outline" size={responsive.icon(16)} color="#666" />
                  <Text style={[styles.summaryLabel, { fontSize: responsive.font(11), marginTop: responsive.size(2) }]}>Est. Time</Text>
                  <Text style={[styles.summaryValue, { fontSize: responsive.font(14) }]}>{requestDuration} min</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Ionicons name="people-outline" size={responsive.icon(16)} color="#666" />
                  <Text style={[styles.summaryLabel, { fontSize: responsive.font(11), marginTop: responsive.size(2) }]}>Passengers</Text>
                  <Text style={[styles.summaryValue, { fontSize: responsive.font(14) }]}>{selectedRequest.passenger_count || 1}</Text>
                </View>
              </View>
            </View>
          )}

          {pendingRequests.map((request) => {
            const timeRemaining = getTimeRemaining(request.request_created_at);
            const isExpired = timeRemaining <= 0;
            const isExpiringSoon = timeRemaining <= 10 && timeRemaining > 0;
            
            if (isExpired) return null;
            
            return (
              <Pressable 
                key={request.request_id} 
                style={[
                  styles.requestCard,
                  selectedRequest?.id === request.id && styles.selectedRequestCard,
                  isExpiringSoon && styles.expiringRequestCard,
                  { padding: responsive.size(16), borderRadius: responsive.radius(16), marginBottom: responsive.size(15) }
                ]}
                onPress={() => !isExpired && setSelectedRequest(request)}
                disabled={isExpired}
              >
                <View style={[styles.cardHeader, { marginBottom: responsive.size(12) }]}>
                  <View style={[styles.timeBadge, { paddingHorizontal: responsive.size(8), paddingVertical: responsive.size(4), borderRadius: responsive.radius(12) }]}>
                    <Ionicons name="time-outline" size={responsive.icon(14)} color="#FFB37A" />
                    <Text style={[styles.timeText, { fontSize: responsive.font(11), marginLeft: responsive.size(4) }]}>{formatRequestTime(request.request_created_at)}</Text>
                  </View>
                  <View style={[
                    styles.statusBadge, 
                    isExpiringSoon && styles.expiringStatusBadge,
                    { paddingHorizontal: responsive.size(12), paddingVertical: responsive.size(6), borderRadius: responsive.radius(20) }
                  ]}>
                    <Text style={[
                      styles.statusText, 
                      isExpiringSoon && styles.expiringStatusText,
                      { fontSize: responsive.font(12) }
                    ]}>
                      {isExpiringSoon ? `EXPIRING IN ${timeRemaining}s` : "PENDING"}
                    </Text>
                  </View>
                </View>

                {!isExpired && (
                  <View style={[styles.timerBarContainer, { height: responsive.size(3), marginBottom: responsive.size(12) }]}>
                    <View 
                      style={[
                        styles.timerBar, 
                        { 
                          width: `${(timeRemaining / REQUEST_EXPIRY_SECONDS) * 100}%`,
                          backgroundColor: isExpiringSoon ? '#EF4444' : '#10B981'
                        }
                      ]} 
                    />
                  </View>
                )}

                <View style={[styles.commuterSection, { marginBottom: responsive.size(15) }]}>
                  <View style={[styles.commuterAvatarSmall, { width: responsive.size(40), height: responsive.size(40), borderRadius: responsive.radius(20), marginRight: responsive.size(12) }]}>
                    {request.commuter?.profile_picture ? (
                      <Image source={{ uri: request.commuter.profile_picture }} style={[styles.commuterImageSmall, { width: responsive.size(36), height: responsive.size(36), borderRadius: responsive.radius(18) }]} />
                    ) : (
                      <Ionicons name="person-circle" size={responsive.icon(40)} color="#9CA3AF" />
                    )}
                  </View>
                  <View style={styles.commuterInfo}>
                    <Text style={[styles.commuterName, { fontSize: responsive.font(16) }]}>
                      {request.commuter?.first_name} {request.commuter?.last_name}
                    </Text>
                    <Text style={[styles.commuterPhone, { fontSize: responsive.font(12), marginTop: responsive.size(2) }]}>{request.commuter?.phone || "No phone"}</Text>
                  </View>
                </View>

                <View style={[styles.tripDetails, { padding: responsive.size(12), borderRadius: responsive.radius(12), marginBottom: responsive.size(15) }]}>
                  <View style={[styles.locationRow, { marginBottom: responsive.size(8) }]}>
                    <Ionicons name="location" size={responsive.icon(16)} color="#10B981" />
                    <Text style={[styles.locationTextSmall, { fontSize: responsive.font(13), marginLeft: responsive.size(8) }]} numberOfLines={1}>
                      {request.pickup_location}
                    </Text>
                  </View>
                  <View style={[styles.locationRow, { marginBottom: responsive.size(8) }]}>
                    <Ionicons name="flag" size={responsive.icon(16)} color="#EF4444" />
                    <Text style={[styles.locationTextSmall, { fontSize: responsive.font(13), marginLeft: responsive.size(8) }]} numberOfLines={1}>
                      {request.dropoff_location}
                    </Text>
                  </View>
                </View>

                <View style={[styles.fareContainer, { marginBottom: responsive.size(15), paddingHorizontal: responsive.size(4) }]}>
                  <Text style={[styles.fareLabel, { fontSize: responsive.font(14) }]}>Estimated Fare</Text>
                  <Text style={[styles.fareAmount, { fontSize: responsive.font(20) }]}>₱{request.fare?.toFixed(2) || "0.00"}</Text>
                </View>

                {!isExpired && (
                  <View style={[styles.actionButtons, { gap: responsive.size(10) }]}>
                    <Pressable 
                      style={[styles.declineButton, { padding: responsive.size(12), borderRadius: responsive.radius(12), gap: responsive.size(5) }]}
                      onPress={() => handleDeclineRequest(request.id, request.request_id)}
                    >
                      <Ionicons name="close-circle" size={responsive.icon(20)} color="#EF4444" />
                      <Text style={[styles.declineButtonText, { fontSize: responsive.font(14) }]}>Decline</Text>
                    </Pressable>

                    <Pressable 
                      style={[styles.acceptButton, isExpiringSoon && styles.acceptButtonUrgent, { padding: responsive.size(12), borderRadius: responsive.radius(12), gap: responsive.size(5) }]}
                      onPress={() => handleAcceptRequest(request.id, request.request_id)}
                    >
                      <Ionicons name="checkmark-circle" size={responsive.icon(20)} color="#FFF" />
                      <Text style={[styles.acceptButtonText, { fontSize: responsive.font(14) }]}>Accept</Text>
                    </Pressable>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>

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
      </View>
    );
  }

  // ================= RENDER EMPTY STATE =================
  return (
    <View style={[styles.container, { paddingTop: 0 }]}>
      <View style={[styles.header, { paddingTop: responsive.size(12), paddingBottom: responsive.size(16), paddingHorizontal: responsive.size(20) }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={responsive.icon(24)} color="#FFF" />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={[styles.headerSubtitle, { fontSize: responsive.font(14) }]}>No Active Ride</Text>
          <Text style={[styles.headerTitle, { fontSize: responsive.font(18) }]}>Available</Text>
        </View>
        <TouchableOpacity 
          style={styles.notificationBell}
          onPress={() => setShowNotificationCenter(true)}
        >
          <Ionicons name="notifications" size={responsive.icon(24)} color="#FFF" />
          {unreadCount > 0 && (
            <View style={[styles.notificationBadge, { minWidth: responsive.size(20), height: responsive.size(20) }]}>
              <Text style={[styles.notificationBadgeText, { fontSize: responsive.font(10) }]}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={[styles.emptyContainer, { padding: responsive.size(20) }]}>
        <Ionicons name="car-outline" size={responsive.icon(80)} color="#D1D5DB" />
        <Text style={[styles.emptyTitle, { fontSize: responsive.font(20), marginTop: responsive.size(20), marginBottom: responsive.size(10) }]}>No Booking Requests</Text>
        <Text style={[styles.emptyText, { fontSize: responsive.font(14), lineHeight: responsive.font(20) }]}>
          You don't have any booking requests at the moment.{'\n'}
          Stay online to receive requests.
        </Text>
        <Pressable 
          style={[styles.goOnlineButton, { paddingHorizontal: responsive.size(30), paddingVertical: responsive.size(12), borderRadius: responsive.radius(12), marginTop: responsive.size(20) }]}
          onPress={async () => {
            if (driverLocation) {
              await updateDriverLocation(driverLocation);
              addNotification({
                type: 'success',
                title: 'Online',
                message: 'You are now online and ready to receive bookings!',
                duration: 3000
              });
            }
          }}
        >
          <Text style={[styles.goOnlineText, { fontSize: responsive.font(16) }]}>I'm Online</Text>
        </Pressable>
      </View>

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
    </View>
  );
}

// Notification Center Modal Component
const NotificationCenterModal = ({ visible, onClose, notifications, unreadCount, markAllAsRead, getNotificationIcon, getNotificationColor }) => {
  const { width, height } = Dimensions.get('window');
  const responsiveFont = (value) => value * Math.min(1.2, width / 390);
  const responsiveSize = (value) => value * (width / 390);
  
  return (
    <Modal visible={visible} transparent={true} animationType="slide" onRequestClose={onClose}>
      <BlurView intensity={90} style={styles.notificationCenterOverlay}>
        <View style={[styles.notificationCenter, { maxHeight: height * 0.7 }]}>
          <View style={[styles.notificationCenterHeader, { padding: responsiveSize(20) }]}>
            <Text style={[styles.notificationCenterTitle, { fontSize: responsiveFont(18) }]}>Notifications</Text>
            <View style={styles.notificationCenterActions}>
              {unreadCount > 0 && (
                <TouchableOpacity onPress={markAllAsRead}>
                  <Text style={[styles.markAllReadText, { fontSize: responsiveFont(14) }]}>Mark all as read</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={responsiveSize(24)} color="#666" />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView style={[styles.notificationCenterList, { padding: responsiveSize(20) }]}>
            {notifications.length === 0 ? (
              <View style={[styles.emptyNotifications, { padding: responsiveSize(40) }]}>
                <Ionicons name="notifications-off-outline" size={responsiveSize(48)} color="#D1D5DB" />
                <Text style={[styles.emptyNotificationsText, { fontSize: responsiveFont(14), marginTop: responsiveSize(12) }]}>No notifications</Text>
              </View>
            ) : (
              notifications.map(notification => (
                <View 
                  key={notification.id}
                  style={[
                    styles.notificationCenterItem,
                    !notification.read && styles.unreadNotificationItem,
                    { padding: responsiveSize(12), borderRadius: responsiveSize(12), marginBottom: responsiveSize(8) }
                  ]}
                >
                  <View style={[styles.notificationCenterIcon, { width: responsiveSize(40), height: responsiveSize(40), borderRadius: responsiveSize(20), marginRight: responsiveSize(12) }]}>
                    <Ionicons 
                      name={getNotificationIcon(notification.type)} 
                      size={responsiveSize(24)} 
                      color={getNotificationColor(notification.type)} 
                    />
                  </View>
                  <View style={styles.notificationCenterContent}>
                    <Text style={[styles.notificationCenterItemTitle, { fontSize: responsiveFont(14), marginBottom: responsiveSize(2) }]}>
                      {notification.title}
                    </Text>
                    <Text style={[styles.notificationCenterItemMessage, { fontSize: responsiveFont(12), marginBottom: responsiveSize(4) }]}>
                      {notification.message}
                    </Text>
                    <Text style={[styles.notificationCenterItemTime, { fontSize: responsiveFont(10) }]}>
                      {new Date(notification.timestamp).toLocaleTimeString()}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </BlurView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FA" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F5F7FA" },
  loadingText: { color: "#666" },
  
  header: { backgroundColor: "#183B5C", flexDirection: "row", alignItems: "center" },
  backButton: { marginRight: 15 },
  headerContent: { flex: 1 },
  headerSubtitle: { color: "#FFB37A" },
  headerTitle: { fontWeight: "bold", color: "#FFF" },
  notificationBell: { position: 'relative', padding: 8 },
  notificationBadge: { position: 'absolute', top: 0, right: 0, backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#183B5C' },
  notificationBadgeText: { color: '#FFF', fontWeight: 'bold' },
  
  notificationStack: { position: 'absolute', left: 20, right: 20, zIndex: 1000, elevation: 1000 },
  notificationCard: { borderRadius: 12, marginBottom: 8, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5 },
  notificationGradient: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  notificationIcon: { marginRight: 12 },
  notificationContent: { flex: 1 },
  notificationTitle: { color: '#FFF', fontWeight: 'bold', marginBottom: 2 },
  notificationMessage: { color: '#FFF', opacity: 0.9 },
  notificationAction: { backgroundColor: 'rgba(255,255,255,0.3)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 8 },
  notificationActionText: { color: '#FFF', fontWeight: '600' },
  notificationClose: { padding: 4 },
  
  notificationCenterOverlay: { flex: 1, justifyContent: 'flex-end' },
  notificationCenter: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  notificationCenterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  notificationCenterTitle: { fontWeight: 'bold', color: '#333' },
  notificationCenterActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  markAllReadText: { color: '#3B82F6', fontWeight: '500' },
  notificationCenterList: {},
  notificationCenterItem: { flexDirection: 'row', backgroundColor: '#F9FAFB' },
  unreadNotificationItem: { backgroundColor: '#EFF6FF' },
  notificationCenterIcon: { backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center' },
  notificationCenterContent: { flex: 1 },
  notificationCenterItemTitle: { fontWeight: '600', color: '#333' },
  notificationCenterItemMessage: { color: '#666' },
  notificationCenterItemTime: { color: '#999' },
  emptyNotifications: { alignItems: 'center', justifyContent: 'center' },
  emptyNotificationsText: { color: '#999' },
  
  mapContainer: { position: 'relative' },
  map: { flex: 1 },
  mapPreview: { overflow: 'hidden' },
  mapPreviewMap: { flex: 1 },
  pickupMarker: { backgroundColor: "#10B981", borderWidth: 2, borderColor: "#FFF" },
  dropoffMarker: { backgroundColor: "#EF4444", borderWidth: 2, borderColor: "#FFF" },
  driverMarker: { backgroundColor: "#3B82F6", borderWidth: 2, borderColor: "#FFF" },
  locateButton: { position: "absolute", bottom: 20, right: 20, backgroundColor: "#FFF", justifyContent: "center", alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5 },
  navigationInstruction: { position: "absolute", top: 20, left: 20, right: 20, backgroundColor: "#183B5C", flexDirection: "row", alignItems: "center", justifyContent: "center" },
  navigationInstructionText: { color: "#FFF", fontWeight: "600" },
  
  scrollableContainer: { flex: 1 },
  scrollableContent: {},
  bottomSheetScroll: { flex: 1, backgroundColor: "#FFF", borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  bottomSheetContent: {},
  
  commuterContainer: { flexDirection: "row", alignItems: "center" },
  commuterAvatar: { backgroundColor: "#F3F4F6", justifyContent: "center", alignItems: "center" },
  commuterImage: {},
  commuterAvatarSmall: { backgroundColor: "#F3F4F6", justifyContent: "center", alignItems: "center" },
  commuterImageSmall: {},
  commuterInfo: { flex: 1 },
  commuterName: { fontWeight: "bold", color: "#333" },
  commuterLabel: { color: "#666" },
  commuterPhone: { color: "#666" },
  commuterActions: { flexDirection: "row" },
  callButton: { backgroundColor: "#183B5C", justifyContent: "center", alignItems: "center" },
  messageButton: { backgroundColor: "#FFB37A", justifyContent: "center", alignItems: "center" },
  locationsContainer: {},
  locationRow: { flexDirection: "row", alignItems: "center" },
  locationText: { color: "#333", flex: 1 },
  locationTextSmall: { color: "#333", flex: 1 },
  statsContainer: { flexDirection: "row" },
  statBox: { backgroundColor: "#F9FAFB" },
  statLabel: { color: "#666" },
  statValue: { fontWeight: "bold", color: "#333" },
  
  paymentSuccessBanner: { backgroundColor: "#E8F5E9", flexDirection: "row", alignItems: "center", marginHorizontal: 20, borderRadius: 12, borderWidth: 1, borderColor: "#A5D6A7", position: 'absolute', left: 0, right: 0, zIndex: 100, elevation: 100 },
  paymentSuccessBannerText: { flex: 1, marginLeft: 12 },
  paymentSuccessTitle: { fontWeight: "bold", color: "#2E7D32", marginBottom: 2 },
  paymentSuccessMessage: { color: "#1B5E20" },
  
  actionContainer: { flexDirection: "row" },
  arrivedButton: { backgroundColor: "#3B82F6", alignItems: "center", flexDirection: "row", justifyContent: "center" },
  arrivedButtonText: { color: "#FFF", fontWeight: "600" },
  startRideButton: { backgroundColor: "#F59E0B", alignItems: "center", flexDirection: "row", justifyContent: "center" },
  startRideButtonText: { color: "#FFF", fontWeight: "600" },
  completeButton: { backgroundColor: "#10B981", alignItems: "center", flexDirection: "row", justifyContent: "center" },
  completeButtonText: { color: "#FFF", fontWeight: "600" },
  cancelButtonLarge: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  cancelButtonTextLarge: { color: "#EF4444", fontWeight: "600" },
  navigationButton: { backgroundColor: "#183B5C", alignItems: "center", flexDirection: "row", justifyContent: "center" },
  navigationButtonText: { color: "#FFF", fontWeight: "600" },
  
  requestCard: { backgroundColor: "#FFF", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  selectedRequestCard: { borderWidth: 2, borderColor: "#183B5C" },
  expiringRequestCard: { borderWidth: 1, borderColor: "#EF4444", backgroundColor: "#FEF2F2" },
  requestSummary: { backgroundColor: "#FFF", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  summaryRow: { flexDirection: "row", justifyContent: "space-around" },
  summaryItem: { alignItems: "center" },
  summaryLabel: { color: "#666" },
  summaryValue: { fontWeight: "bold", color: "#183B5C" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  timeBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#F3F4F6" },
  timeText: { color: "#666" },
  statusBadge: { backgroundColor: "#FEF3C7" },
  expiringStatusBadge: { backgroundColor: "#FEE2E2" },
  statusText: { fontWeight: "600", color: "#D97706" },
  expiringStatusText: { color: "#EF4444" },
  
  timerBarContainer: { backgroundColor: "#E5E7EB", borderRadius: 2, overflow: 'hidden' },
  timerBar: { height: '100%', borderRadius: 2 },
  
  commuterSection: { flexDirection: "row", alignItems: "center" },
  tripDetails: { backgroundColor: "#F9FAFB" },
  fareContainer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  fareLabel: { color: "#666" },
  fareAmount: { fontWeight: "bold", color: "#183B5C" },
  actionButtons: { flexDirection: "row" },
  declineButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#FEE2E2" },
  declineButtonText: { color: "#EF4444", fontWeight: "600" },
  acceptButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#10B981" },
  acceptButtonUrgent: { backgroundColor: "#EF4444" },
  acceptButtonText: { color: "#FFF", fontWeight: "600" },
  
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F5F7FA" },
  emptyTitle: { fontWeight: "bold", color: "#333" },
  emptyText: { color: "#666", textAlign: "center" },
  goOnlineButton: { backgroundColor: "#183B5C" },
  goOnlineText: { color: "#FFF", fontWeight: "600" },
  
  alertContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  alertCard: { backgroundColor: '#FFF', borderRadius: 28, width: '85%', maxWidth: 340, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
  alertIconContainer: { alignItems: 'center', marginBottom: 16, width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignSelf: 'center' },
  alertTitle: { fontWeight: '700', color: '#1F2937', textAlign: 'center', marginBottom: 8 },
  alertMessage: { color: '#6B7280', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  alertButtons: { flexDirection: 'row', gap: 12 },
  alertCancelButton: { flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center' },
  alertCancelText: { fontWeight: '600', color: '#4B5563' },
  alertConfirmButton: { flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: '#183B5C', alignItems: 'center' },
  alertConfirmText: { fontWeight: '600', color: '#FFF' },
});

