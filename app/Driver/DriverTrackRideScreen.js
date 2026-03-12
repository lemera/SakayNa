// screens/driver/DriverTrackRideScreen.js
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
  Animated,
  Vibration,
  TouchableOpacity,
  Dimensions,
  AppState,
  Easing,
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

// ================= MODERN ALERT COMPONENT =================
const ModernAlert = ({ visible, title, message, type, onClose, onConfirm, confirmText, cancelText }) => {
  const slideAnim = useRef(new Animated.Value(300)).current;
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
      slideAnim.setValue(300);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  const getIconByType = () => {
    switch (type) {
      case 'success':
        return { name: 'checkmark-circle', color: '#10B981' };
      case 'error':
        return { name: 'close-circle', color: '#EF4444' };
      case 'warning':
        return { name: 'alert-circle', color: '#F59E0B' };
      case 'info':
        return { name: 'information-circle', color: '#3B82F6' };
      default:
        return { name: 'information-circle', color: '#3B82F6' };
    }
  };

  const icon = getIconByType();

  return (
    <Modal
      transparent={true}
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
    >
      <BlurView intensity={20} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <Animated.View style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          opacity: opacityAnim,
        }}>
          <Animated.View style={{
            backgroundColor: '#FFF',
            borderRadius: 28,
            width: '85%',
            maxWidth: 340,
            padding: 24,
            transform: [{ translateY: slideAnim }],
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.2,
            shadowRadius: 20,
            elevation: 10,
          }}>
            {/* Icon */}
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: icon.color + '15',
                justifyContent: 'center',
                alignItems: 'center',
              }}>
                <Ionicons name={icon.name} size={40} color={icon.color} />
              </View>
            </View>

            {/* Title */}
            <Text style={{
              fontSize: 20,
              fontWeight: '700',
              color: '#1F2937',
              textAlign: 'center',
              marginBottom: 8,
            }}>
              {title}
            </Text>

            {/* Message */}
            <Text style={{
              fontSize: 15,
              color: '#6B7280',
              textAlign: 'center',
              marginBottom: 24,
              lineHeight: 22,
            }}>
              {message}
            </Text>

            {/* Buttons */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {cancelText && (
                <TouchableOpacity
                  onPress={onClose}
                  style={{
                    flex: 1,
                    paddingVertical: 14,
                    borderRadius: 16,
                    backgroundColor: '#F3F4F6',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#4B5563' }}>
                    {cancelText}
                  </Text>
                </TouchableOpacity>
              )}
              
              {confirmText && (
                <TouchableOpacity
                  onPress={onConfirm}
                  style={{
                    flex: 1,
                    paddingVertical: 14,
                    borderRadius: 16,
                    backgroundColor: '#183B5C',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFF' }}>
                    {confirmText}
                  </Text>
                </TouchableOpacity>
              )}
              
              {!cancelText && !confirmText && (
                <TouchableOpacity
                  onPress={onClose}
                  style={{
                    flex: 1,
                    paddingVertical: 14,
                    borderRadius: 16,
                    backgroundColor: '#183B5C',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFF' }}>
                    OK
                  </Text>
                </TouchableOpacity>
              )}
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

  // Alert state
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    title: '',
    message: '',
    type: 'info',
    onConfirm: null,
    confirmText: null,
    cancelText: null,
  });

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
  
  // MODERN NOTIFICATION SYSTEM
  const [notifications, setNotifications] = useState([]);
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  
  // For pending requests
  const [pendingRequests, setPendingRequests] = useState([]);
  
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
  const [navigationInitialized, setNavigationInitialized] = useState(false);
  
  // UI state
  const [showPendingRequests, setShowPendingRequests] = useState(true);

  // Points payment state
  const [waitingForPayment, setWaitingForPayment] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [showPaymentSuccessBanner, setShowPaymentSuccessBanner] = useState(false);
  const [paymentChecked, setPaymentChecked] = useState(false);
  const [pointsNeeded, setPointsNeeded] = useState(0);
  
  // Timer refs
  const timerRef = useRef(null);
  const [timeLeft, setTimeLeft] = useState(300);
  const paymentCheckIntervalRef = useRef(null);

  // Refs for tracking subscription status
  const requestSubscriptionRef = useRef(null);
  const bookingSubscriptionRef = useRef(null);
  const paymentSubscriptionRef = useRef(null);
  const isMounted = useRef(true);
  const reconnectAttempts = useRef(0);

  const googleApiKey = Constants.expoConfig?.extra?.GOOGLE_API_KEY;

  // ================= CUSTOM ALERT FUNCTION =================
  const showAlert = (title, message, type = 'info', options = {}) => {
    setAlertConfig({
      title,
      message,
      type,
      onConfirm: options.onConfirm || (() => setAlertVisible(false)),
      confirmText: options.confirmText || null,
      cancelText: options.cancelText || null,
    });
    setAlertVisible(true);
  };

  // Set isMounted on mount/unmount
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (paymentCheckIntervalRef.current) {
        clearInterval(paymentCheckIntervalRef.current);
      }
    };
  }, []);

  // Handle App State changes (for when app goes to background/foreground)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App has come to the foreground, check payment status
        if (waitingForPayment && activeBooking && !paymentSuccess) {
          checkPaymentStatus();
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [waitingForPayment, activeBooking, paymentSuccess]);

  // Auto-hide payment success banner after 5 seconds
  useEffect(() => {
    if (showPaymentSuccessBanner) {
      const timeout = setTimeout(() => {
        setShowPaymentSuccessBanner(false);
      }, 5000);
      
      return () => clearTimeout(timeout);
    }
  }, [showPaymentSuccessBanner]);

  // Reset navigation state when activeBooking changes
  useEffect(() => {
    if (!activeBooking) {
      setIsNavigating(false);
      setNavigationDestination('pickup');
      setHasArrivedAtPickup(false);
      setRideStarted(false);
      setNavigationInitialized(false);
      setRouteCoordinates([]);
      setEstimatedTime(null);
      setEstimatedDistance(null);
      setPaymentSuccess(false);
      setPaymentMethod(null);
      setShowPaymentSuccessBanner(false);
      setWaitingForPayment(false);
      setIsProcessingPayment(false);
      setPaymentChecked(false);
    }
  }, [activeBooking]);

  // Initialize navigation when activeBooking is set
  useEffect(() => {
    if (activeBooking && activeBooking.status === "accepted" && driverLocation && !navigationInitialized) {
      initializeNavigation();
      setNavigationInitialized(true);
    }
  }, [activeBooking, driverLocation, navigationInitialized]);

  // Initialize navigation
  const initializeNavigation = () => {
    setIsNavigating(true);
    setShowPendingRequests(false);
    
    if (activeBooking.driver_arrived_at) {
      setHasArrivedAtPickup(true);
      setNavigationDestination('dropoff');
      
      if (activeBooking.ride_started_at) {
        setRideStarted(true);
      }
      
      if (driverLocation) {
        calculateRouteToDropoff(
          { latitude: activeBooking.pickup_latitude, longitude: activeBooking.pickup_longitude },
          { latitude: activeBooking.dropoff_latitude, longitude: activeBooking.dropoff_longitude }
        );
      }
    } else {
      setNavigationDestination('pickup');
      setHasArrivedAtPickup(false);
      setRideStarted(false);
      
      if (driverLocation) {
        calculateRouteToPickup(driverLocation, {
          latitude: activeBooking.pickup_latitude,
          longitude: activeBooking.pickup_longitude
        });
      }
    }
  };

  // ================= ENHANCED PAYMENT DETECTION =================
  const checkPaymentStatus = async () => {
    if (!activeBooking || !isMounted.current) return;
    
    try {
      console.log("🔍 Checking payment status for booking:", activeBooking.id);
      
      const { data, error } = await supabase
        .from("bookings")
        .select("payment_status, payment_type, points_used, status")
        .eq("id", activeBooking.id)
        .single();

      if (error) {
        console.log("❌ Error checking payment status:", error);
        return;
      }

      console.log("📊 Payment status check result:", data);

      if (data.payment_status === 'paid' && !paymentSuccess && !isProcessingPayment) {
        console.log("✅ Payment detected via status check!");
        handlePaymentSuccess(data);
      }
    } catch (err) {
      console.log("❌ Error in checkPaymentStatus:", err);
    }
  };

  const handlePaymentSuccess = (bookingData) => {
    if (isProcessingPayment) {
      console.log("⚠️ Already processing payment, skipping...");
      return;
    }

    setIsProcessingPayment(true);
    setPaymentSuccess(true);
    setPaymentMethod(bookingData.payment_type || 'wallet');
    setShowPaymentSuccessBanner(true);
    
    setWaitingForPayment(false);
    
    if (paymentCheckIntervalRef.current) {
      clearInterval(paymentCheckIntervalRef.current);
    }

    addNotification({
      type: 'success',
      title: 'Payment Received!',
      message: `The passenger has successfully paid ₱${activeBooking?.fare?.toFixed(2)} using ${bookingData.points_used || pointsNeeded || 0} points.`,
      duration: 5000,
      actionable: true,
      actionText: 'Complete Trip',
      onAction: () => {
        completeTripWithPayment(
          activeBooking?.fare || 0,
          "wallet",
          bookingData.points_used || pointsNeeded || 0
        );
      }
    });

    // Auto-complete after 3 seconds
    setTimeout(() => {
      if (isMounted.current && !isProcessingPayment) {
        completeTripWithPayment(
          activeBooking?.fare || 0,
          "wallet",
          bookingData.points_used || pointsNeeded || 0
        ).finally(() => {
          setIsProcessingPayment(false);
        });
      }
    }, 3000);
  };

  // Listen for payment confirmation from commuter via real-time subscription
  useEffect(() => {
    if (!activeBooking || !driverId) return;

    console.log("📡 Setting up enhanced payment listener for booking:", activeBooking.id);

    // Clean up existing subscription
    if (paymentSubscriptionRef.current) {
      paymentSubscriptionRef.current.unsubscribe();
    }

    // Set up periodic payment check (backup)
    if (paymentCheckIntervalRef.current) {
      clearInterval(paymentCheckIntervalRef.current);
    }

    paymentCheckIntervalRef.current = setInterval(() => {
      if (waitingForPayment && !paymentSuccess && !isProcessingPayment) {
        checkPaymentStatus();
      }
    }, 3000); // Check every 3 seconds

    // Real-time subscription
    paymentSubscriptionRef.current = supabase
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
          
          if (payload.new.payment_status === 'paid') {
            console.log("✅ Payment confirmed via real-time!");
            handlePaymentSuccess(payload.new);
          }
        }
      )
      .subscribe((status) => {
        console.log("📡 Payment subscription status:", status);
      });

    return () => {
      console.log("🧹 Cleaning up payment subscription");
      if (paymentSubscriptionRef.current) {
        paymentSubscriptionRef.current.unsubscribe();
      }
      if (paymentCheckIntervalRef.current) {
        clearInterval(paymentCheckIntervalRef.current);
      }
    };
  }, [activeBooking?.id, driverId, waitingForPayment, paymentSuccess, isProcessingPayment]);

  // ================= MODERN NOTIFICATION SYSTEM =================
  const addNotification = ({ type, title, message, duration = 4000, actionable = false, actionText, onAction }) => {
    const id = Date.now().toString();
    const newNotification = {
      id,
      type,
      title,
      message,
      duration,
      actionable,
      actionText,
      onAction,
      timestamp: new Date(),
      read: false
    };

    notificationStack.current.push(newNotification);
    setNotifications(prev => [newNotification, ...prev].slice(0, 5)); // Keep last 5
    setUnreadCount(prev => prev + 1);

    // Animate notification in
    Animated.sequence([
      Animated.timing(notificationAnimation, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.delay(duration - 600),
      Animated.timing(notificationAnimation, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (isMounted.current) {
        setNotifications(prev => prev.filter(n => n.id !== id));
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    });

    // Haptic feedback based on type
    if (Platform.OS === 'ios') {
      switch(type) {
        case 'success':
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          break;
        case 'error':
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          break;
        case 'warning':
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          break;
        default:
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }

    // Vibration pattern based on type
    if (type === 'urgent' || type === 'booking') {
      Vibration.vibrate([0, 500, 200, 500]);
    } else {
      Vibration.vibrate(300);
    }
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  // ================= ENHANCED REAL-TIME SUBSCRIPTIONS WITH AUTO-RECONNECT =================
  const setupRealtimeSubscriptions = useCallback(async (id) => {
    if (!id) return;

    console.log("📡 Setting up enhanced real-time subscriptions for driver:", id);

    // Clean up existing subscriptions
    if (requestSubscriptionRef.current) {
      requestSubscriptionRef.current.unsubscribe();
    }
    if (bookingSubscriptionRef.current) {
      bookingSubscriptionRef.current.unsubscribe();
    }

    // 1. Subscribe to booking_requests table with retry logic
    const setupRequestSubscription = () => {
      const subscription = supabase
        .channel('driver-requests-realtime')
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
              
              // Fetch full booking details for notification
              const { data: booking } = await supabase
                .from("bookings")
                .select(`
                  *,
                  commuter:commuters (
                    first_name,
                    last_name
                  )
                `)
                .eq("id", payload.new.booking_id)
                .single();

              if (booking) {
                addNotification({
                  type: 'booking',
                  title: 'New Booking Request',
                  message: `${booking.commuter.first_name} wants to book a ride from ${booking.pickup_location.split(',')[0]}`,
                  duration: 8000,
                  actionable: true,
                  actionText: 'View',
                  onAction: () => {
                    // Auto-select this request
                    setSelectedRequest(prev => ({
                      ...booking,
                      request_id: payload.new.id,
                      request_status: payload.new.status,
                      request_distance: payload.new.distance_km,
                      request_created_at: payload.new.created_at
                    }));
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
            
            if (payload.new.status === 'rejected' || payload.new.status === 'cancelled') {
              const { data: booking } = await supabase
                .from("bookings")
                .select("cancelled_by, cancellation_reason")
                .eq("id", payload.new.booking_id)
                .single();

              if (booking && isMounted.current) {
                addNotification({
                  type: 'error',
                  title: 'Request Cancelled',
                  message: `Booking cancelled by ${booking.cancelled_by || 'commuter'}`,
                  duration: 5000
                });
              }
            }
            
            if (isMounted.current) {
              await fetchPendingRequests(id);
            }
          }
        )
        .subscribe((status) => {
          console.log("📡 Request subscription status:", status);
          
          // Auto-reconnect on error
          if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            reconnectAttempts.current += 1;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
            
            setTimeout(() => {
              if (isMounted.current) {
                setupRequestSubscription();
              }
            }, delay);
          } else if (status === 'SUBSCRIBED') {
            reconnectAttempts.current = 0;
          }
        });

      return subscription;
    };

    // 2. Subscribe to bookings table
    const setupBookingSubscription = () => {
      const subscription = supabase
        .channel('driver-bookings-realtime')
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
            
            if (payload.eventType === 'INSERT' && payload.new.status === 'pending') {
              // New booking created
              addNotification({
                type: 'info',
                title: 'New Booking Created',
                message: 'A new booking request has been created',
                duration: 5000
              });
            }
            
            if (payload.eventType === 'UPDATE') {
              if (payload.new.status === 'accepted' && !activeBooking) {
                addNotification({
                  type: 'success',
                  title: 'Booking Accepted',
                  message: 'You have accepted a new booking',
                  duration: 5000
                });
                await fetchActiveBooking(id);
              }
              
              if (activeBooking && payload.new.id === activeBooking.id) {
                if (payload.new.status === 'cancelled') {
                  handleActiveTripCancelled(payload.new);
                } else {
                  setActiveBooking(prev => ({
                    ...prev,
                    ...payload.new
                  }));
                  
                  if (payload.new.driver_arrived_at && !hasArrivedAtPickup) {
                    addNotification({
                      type: 'success',
                      title: 'Arrival Confirmed',
                      message: 'You have arrived at pickup location',
                      duration: 4000
                    });
                    setHasArrivedAtPickup(true);
                    setNavigationDestination('dropoff');
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

                  // Check for payment status change
                  if (payload.new.payment_status === 'paid' && !paymentSuccess && !isProcessingPayment) {
                    console.log("✅ Payment detected in booking subscription!");
                    handlePaymentSuccess(payload.new);
                  }
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
      if (requestSubscriptionRef.current) {
        requestSubscriptionRef.current.unsubscribe();
      }
      if (bookingSubscriptionRef.current) {
        bookingSubscriptionRef.current.unsubscribe();
      }
    };
  }, [activeBooking, hasArrivedAtPickup, rideStarted, paymentSuccess, isProcessingPayment]);

  // Set up subscriptions when driverId is available
  useEffect(() => {
    if (!driverId) return;
    
    setupRealtimeSubscriptions(driverId);
    
    return () => {
      if (requestSubscriptionRef.current) {
        requestSubscriptionRef.current.unsubscribe();
      }
      if (bookingSubscriptionRef.current) {
        bookingSubscriptionRef.current.unsubscribe();
      }
    };
  }, [driverId]);

  // Auto-select first pending request
  useEffect(() => {
    if (pendingRequests.length > 0 && !selectedRequest && !activeBooking) {
      setSelectedRequest(pendingRequests[0]);
    }
  }, [pendingRequests, activeBooking]);

  // Calculate route when request is selected
  useEffect(() => {
    if (selectedRequest && !activeBooking) {
      calculateRequestRoute(selectedRequest);
    }
  }, [selectedRequest, activeBooking]);

  // Initialize on focus
  useFocusEffect(
    React.useCallback(() => {
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
        }
        setNavigationInitialized(false);
      };
    }, [])
  );

  // ================= HELPER FUNCTIONS =================
  const fetchPendingRequests = async (id) => {
    try {
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

      setPendingRequests(requests || []);
      
      if (requests.length > 0 && !selectedRequest && !activeBooking) {
        setSelectedRequest(requests[0]);
      }
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

      if (error && error.code !== "PGRST116") {
        console.log("❌ Error fetching booking:", error);
        throw error;
      }

      if (data) {
        console.log("✅ Active booking found:", data.id);
        console.log("✅ Commuter data:", data.commuter ? "Loaded" : "Missing");
        console.log("✅ Payment status:", data.payment_status);
        
        // Validate commuter data
        if (!data.commuter) {
          console.log("⚠️ Warning: Commuter data is missing for this booking");
          // Try to fetch commuter data separately if needed
          const { data: commuterData } = await supabase
            .from("commuters")
            .select("*")
            .eq("id", data.commuter_id)
            .single();
          
          if (commuterData) {
            data.commuter = commuterData;
          }
        }
        
        setActiveBooking(data);
        setCommuter(data.commuter);
        setBookingStatus(data.status);
        setShowPendingRequests(false);
        setNavigationInitialized(false);
        
        console.log("⏳ Will initialize navigation when driver location is available");
        
        if (data.payment_status === 'paid') {
          console.log("✅ Booking already has payment completed");
          setPaymentSuccess(true);
          setPaymentMethod(data.payment_type);
          setShowPaymentSuccessBanner(true);
        }
      } else {
        console.log("❌ No active booking found");
        setActiveBooking(null);
        setCommuter(null);
        setIsNavigating(false);
        setShowPendingRequests(true);
        setHasArrivedAtPickup(false);
        setRideStarted(false);
        setNavigationInitialized(false);
      }
    } catch (err) {
      console.log("❌ Error in fetchActiveBooking:", err);
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to load booking data',
        duration: 4000
      });
    }
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
    setShowPendingRequests(true);
    setHasArrivedAtPickup(false);
    setRideStarted(false);
    setRouteCoordinates([]);
    setEstimatedDistance(null);
    setEstimatedTime(null);
    setWaitingForPayment(false);
    setIsProcessingPayment(false);
    setPaymentSuccess(false);
    setPaymentMethod(null);
    setShowPaymentSuccessBanner(false);
    setNavigationInitialized(false);
  };

  // ================= MAP ROUTING FUNCTIONS =================
  const calculateRouteToPickup = async (driverLoc, pickupLoc) => {
    try {
      if (!driverLoc || !pickupLoc) return;
      
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
      if (!pickupLoc || !dropoffLoc) return;
      
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

  // ================= BOOKING ACTIONS =================
  const handleAcceptRequest = async (bookingId, requestId) => {
    showAlert(
      "Accept Booking",
      "Are you sure you want to accept this booking?",
      'info',
      {
        confirmText: "Accept",
        cancelText: "Cancel",
        onConfirm: async () => {
          try {
            setLoading(true);
            setAlertVisible(false);
            
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
                message: `Booking is no longer available (Status: ${bookingCheck.status})`,
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
              title: 'Booking Accepted',
              message: 'Head to pickup location',
              duration: 4000
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
      }
    );
  };

  const handleDeclineRequest = async (bookingId, requestId) => {
    showAlert(
      "Decline Booking",
      "Are you sure you want to decline this booking?",
      'warning',
      {
        confirmText: "Decline",
        cancelText: "Cancel",
        confirmStyle: "destructive",
        onConfirm: async () => {
          try {
            setAlertVisible(false);
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
      }
    );
  };

  const handleArrivedAtPickup = async () => {
    showAlert(
      "Arrived at Pickup",
      "Have you arrived at the pickup location?",
      'info',
      {
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

            addNotification({
              type: 'success',
              title: 'Arrival Confirmed',
              message: 'Commuter notified! Proceed to destination.',
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
      }
    );
  };

  const handleStartRide = async () => {
    showAlert(
      "Start Ride",
      "Have you picked up the passenger?",
      'info',
      {
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
                updated_at: new Date()
              })
              .eq("id", activeBooking.id);

            if (error) throw error;

            setRideStarted(true);
            
            addNotification({
              type: 'success',
              title: 'Ride Started',
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
      }
    );
  };

  // ================= PAYMENT OPTIONS =================
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

    if (paymentSuccess) {
      showAlert(
        "Payment Already Completed",
        "This trip has already been paid for. Would you like to complete the trip?",
        'info',
        {
          confirmText: "Complete Trip",
          cancelText: "Cancel",
          onConfirm: () => {
            setAlertVisible(false);
            completeTripWithPayment(activeBooking.fare, paymentMethod, pointsNeeded);
          }
        }
      );
      return;
    }

    showAlert(
      "Payment Method",
      "How would the passenger like to pay?",
      'info',
      {
        confirmText: "💵 Cash",
        // cancelText: "⭐ Points (Wallet)",
        onConfirm: () => {
          setAlertVisible(false);
          processCashPayment();
        },
        onCancel: () => {
          setAlertVisible(false);
          checkCommuterPoints();
        }
      }
    );
  };

  const processCashPayment = async () => {
    try {
      setLoading(true);
      
      const actualFare = activeBooking.fare || 0;

      const { data: wallet, error: walletError } = await supabase
        .from("driver_wallets")
        .select("*")
        .eq("driver_id", driverId)
        .maybeSingle();

      if (walletError) throw walletError;

      if (!wallet) {
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

      if (earningsError) throw earningsError;

      setPaymentSuccess(true);
      setPaymentMethod('cash');
      setShowPaymentSuccessBanner(true);
      
      addNotification({
        type: 'success',
        title: 'Cash Payment',
        message: `₱${actualFare.toFixed(2)} cash received`,
        duration: 4000
      });
      
      await completeTripWithPayment(actualFare, "cash");

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

  const fetchCommuterPoints = async (commuterId) => {
    if (!commuterId) {
      console.log("⚠️ Cannot fetch points: No commuter ID provided");
      return 0;
    }
    
    try {
      const { data, error } = await supabase
        .from("commuter_wallets")
        .select("points")
        .eq("commuter_id", commuterId)
        .maybeSingle();

      if (error) {
        console.log("❌ Error fetching commuter points:", error);
        return 0;
      }

      return data?.points || 0;
    } catch (err) {
      console.log("❌ Exception fetching commuter points:", err);
      return 0;
    }
  };

  const checkCommuterPoints = async () => {
    try {
      setLoading(true);
      
      if (!activeBooking) {
        addNotification({
          type: 'error',
          title: 'Error',
          message: 'No active booking found',
          duration: 3000
        });
        return;
      }

      if (!activeBooking.commuter_id) {
        addNotification({
          type: 'error',
          title: 'Error',
          message: 'Commuter information not available',
          duration: 3000
        });
        return;
      }
      
      const actualFare = activeBooking.fare || 0;
      const pointsNeededValue = Math.floor(actualFare * 10); // 10 points = ₱1
      setPointsNeeded(pointsNeededValue);
      
      const currentPoints = await fetchCommuterPoints(activeBooking.commuter_id);

      if (currentPoints >= pointsNeededValue) {
        processPointsPayment(pointsNeededValue, actualFare);
      } else {
        showAlert(
          "Insufficient Points",
          `Passenger only has ${currentPoints} points but needs ${pointsNeededValue} points for this trip (₱${actualFare.toFixed(2)} × 10).\n\nWould you like to switch to cash payment?`,
          'warning',
          {
            confirmText: "💵 Use Cash",
            cancelText: "Cancel",
            onConfirm: () => {
              setAlertVisible(false);
              processCashPayment();
            }
          }
        );
      }
    } catch (err) {
      console.log("❌ Error checking points:", err);
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to check points balance',
        duration: 4000
      });
    } finally {
      setLoading(false);
    }
  };

  const processPointsPayment = (pointsNeededValue, fare) => {
    setWaitingForPayment(true);
    setPointsNeeded(pointsNeededValue);
    
    // Update booking to pending payment
    supabase
      .from("bookings")
      .update({
        payment_type: "wallet",
        payment_status: "pending",
        points_used: pointsNeededValue,
        updated_at: new Date()
      })
      .eq("id", activeBooking.id)
      .then(({ error }) => {
        if (error) {
          console.log("❌ Error updating payment status:", error);
          addNotification({
            type: 'error',
            title: 'Payment Error',
            message: 'Failed to initiate payment. Please try again.',
            duration: 4000
          });
          setWaitingForPayment(false);
        } else {
          console.log("✅ Payment status updated to pending");
          
          addNotification({
            type: 'info',
            title: 'Payment Initiated',
            message: 'Waiting for passenger to confirm payment...',
            duration: 4000
          });
          
          // Start checking payment status immediately
          setTimeout(() => {
            checkPaymentStatus();
          }, 2000);
        }
      });
  };

  const completeTripWithPayment = async (actualFare, paymentMethod, pointsUsed = 0) => {
    try {
      console.log("🎉 Completing trip with payment:", { actualFare, paymentMethod, pointsUsed });
      
      const { error: bookingError } = await supabase
        .from("bookings")
        .update({ 
          status: "completed",
          actual_fare: actualFare,
          payment_type: paymentMethod === "points" ? "wallet" : paymentMethod,
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
            payment_method: paymentMethod,
            points_used: pointsUsed,
            fare: actualFare
          }
        });

      if (transactionError) {
        console.log("❌ Transaction error:", transactionError);
      }

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
      setIsProcessingPayment(false);
      setPaymentSuccess(true);
      setShowPaymentSuccessBanner(true);
      setNavigationInitialized(false);
      setPaymentChecked(false);

      addNotification({
        type: 'success',
        title: 'Trip Completed!',
        message: `Earned ₱${actualFare.toFixed(2)}`,
        duration: 6000
      });

      setTimeout(() => {
        setShowPaymentSuccessBanner(false);
      }, 5000);

      await fetchPendingRequests(driverId);

    } catch (err) {
      console.log("❌ Error completing trip:", err);
      throw err;
    }
  };

  const handleCancelTrip = () => {
    if (bookingStatus !== "accepted") {
      addNotification({
        type: 'warning',
        title: 'Cannot Cancel',
        message: 'This trip cannot be cancelled at this stage',
        duration: 3000
      });
      return;
    }

    showAlert(
      "Cancel Trip",
      "Are you sure you want to cancel this trip?",
      'warning',
      {
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
            setShowPendingRequests(true);
            setWaitingForPayment(false);
            setIsProcessingPayment(false);
            setPaymentSuccess(false);
            setPaymentMethod(null);
            setShowPaymentSuccessBanner(false);
            setNavigationInitialized(false);

            addNotification({
              type: 'error',
              title: 'Trip Cancelled',
              message: 'The trip has been cancelled',
              duration: 4000
            });
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
      }
    );
  };

  // ================= LOCATION TRACKING =================
  const updateDriverLocation = async (coords) => {
    try {
      if (!driverId) return;
      
      const { data: existingLocation, error: checkError } = await supabase
        .from("driver_locations")
        .select("id")
        .eq("driver_id", driverId)
        .maybeSingle();

      if (checkError) return;

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
        showAlert(
          "Permission Required",
          "Location permission is needed to track rides",
          'warning',
          { confirmText: "OK" }
        );
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
        await updateDriverLocation(newLocation);
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
            if (!hasArrivedAtPickup && !activeBooking.driver_arrived_at) {
              calculateRouteToPickup(updatedLocation, {
                latitude: activeBooking.pickup_latitude,
                longitude: activeBooking.pickup_longitude
              });
            } else {
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
        {/* MODERN NOTIFICATION STACK */}
        <View style={styles.notificationStack}>
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
                  <Ionicons 
                    name={getNotificationIcon(notification.type)} 
                    size={24} 
                    color="#FFF" 
                  />
                </View>
                <View style={styles.notificationContent}>
                  <Text style={styles.notificationTitle}>{notification.title}</Text>
                  <Text style={styles.notificationMessage} numberOfLines={2}>
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
                    <Text style={styles.notificationActionText}>
                      {notification.actionText || 'View'}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity 
                  style={styles.notificationClose}
                  onPress={() => removeNotification(notification.id)}
                >
                  <Ionicons name="close" size={18} color="#FFF" />
                </TouchableOpacity>
              </LinearGradient>
            </Animated.View>
          ))}
        </View>

        {/* Payment Success Banner */}
        {showPaymentSuccessBanner && paymentSuccess && (
          <View style={styles.paymentSuccessBanner}>
            <Ionicons name="checkmark-circle" size={24} color="#10B981" />
            <View style={styles.paymentSuccessBannerText}>
              <Text style={styles.paymentSuccessTitle}>Payment Received!</Text>
              <Text style={styles.paymentSuccessMessage}>
                {paymentMethod === 'wallet' 
                  ? `Passenger paid ₱${activeBooking.fare?.toFixed(2)} using ${pointsNeeded} points`
                  : `Cash payment of ₱${activeBooking.fare?.toFixed(2)} received`}
              </Text>
            </View>
            <Pressable onPress={() => setShowPaymentSuccessBanner(false)}>
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
          <TouchableOpacity 
            style={styles.notificationBell}
            onPress={() => setShowNotificationCenter(!showNotificationCenter)}
          >
            <Ionicons name="notifications" size={24} color="#FFF" />
            {unreadCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
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

          {/* Payment Status Indicator */}
          {paymentSuccess && paymentMethod === 'wallet' && (
            <View style={styles.paymentStatusContainer}>
              <Ionicons name="wallet" size={20} color="#10B981" />
              <Text style={styles.paymentStatusText}>
                Paid with Wallet Points • {pointsNeeded} points used
              </Text>
            </View>
          )}

          {paymentSuccess && paymentMethod === 'cash' && (
            <View style={styles.paymentStatusContainer}>
              <Ionicons name="cash" size={20} color="#10B981" />
              <Text style={styles.paymentStatusText}>
                Cash Payment Received • ₱{activeBooking.fare?.toFixed(2)}
              </Text>
            </View>
          )}

          {/* Points Payment Waiting Indicator */}
          {waitingForPayment && !paymentSuccess && (
            <View style={styles.waitingPaymentContainer}>
              <ActivityIndicator size="small" color="#F59E0B" />
              <Text style={styles.waitingPaymentText}>
                Waiting for passenger to confirm points payment...
              </Text>
            </View>
          )}

          <View style={styles.actionContainer}>
            {!hasArrivedAtPickup && !rideStarted && !paymentSuccess && !waitingForPayment && (
              <>
                <Pressable style={styles.arrivedButton} onPress={handleArrivedAtPickup}>
                  <Ionicons name="location" size={20} color="#FFF" />
                  <Text style={styles.arrivedButtonText}>I've Arrived</Text>
                </Pressable>
              </>
            )}

            {hasArrivedAtPickup && !rideStarted && !paymentSuccess && !waitingForPayment && (
              <>
                <Pressable style={styles.startRideButton} onPress={handleStartRide}>
                  <Ionicons name="play" size={20} color="#FFF" />
                  <Text style={styles.startRideButtonText}>Start Ride</Text>
                </Pressable>
              </>
            )}

            {hasArrivedAtPickup && rideStarted && !paymentSuccess && !waitingForPayment && (
              <>
                <Pressable style={styles.completeButton} onPress={handleCompleteTrip}>
                  <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                  <Text style={styles.completeButtonText}>Complete Trip</Text>
                </Pressable>
              </>
            )}

            {paymentSuccess && (
              <Pressable style={styles.completeButton} onPress={() => completeTripWithPayment(activeBooking.fare, paymentMethod, pointsNeeded)}>
                <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                <Text style={styles.completeButtonText}>Complete Trip</Text>
              </Pressable>
            )}

            {waitingForPayment && (
              <Pressable 
                style={styles.cancelButton} 
                onPress={() => {
                  setWaitingForPayment(false);
                  setPointsNeeded(0);
                }}
              >
                <Ionicons name="close-circle" size={20} color="#EF4444" />
                <Text style={styles.cancelButtonText}>Cancel Payment</Text>
              </Pressable>
            )}
          </View>

          {!hasArrivedAtPickup && !rideStarted && !paymentSuccess && !waitingForPayment && (
            <Pressable
              style={styles.navigationButton}
              onPress={() => openMaps(
                activeBooking.pickup_latitude,
                activeBooking.pickup_longitude,
                "Pickup Location"
              )}
            >
              <Ionicons name="navigate" size={20} color="#FFF" />
              <Text style={styles.navigationButtonText}>Open Maps</Text>
            </Pressable>
          )}

          {(hasArrivedAtPickup || rideStarted) && !paymentSuccess && !waitingForPayment && (
            <Pressable
              style={styles.navigationButton}
              onPress={() => openMaps(
                activeBooking.dropoff_latitude,
                activeBooking.dropoff_longitude,
                "Dropoff Location"
              )}
            >
              <Ionicons name="navigate" size={20} color="#FFF" />
              <Text style={styles.navigationButtonText}>Open Maps</Text>
            </Pressable>
          )}
        </View>

        {/* Notification Center Modal */}
        {showNotificationCenter && (
          <Modal
            visible={showNotificationCenter}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setShowNotificationCenter(false)}
          >
            <BlurView intensity={90} style={styles.notificationCenterOverlay}>
              <View style={styles.notificationCenter}>
                <View style={styles.notificationCenterHeader}>
                  <Text style={styles.notificationCenterTitle}>Notifications</Text>
                  <View style={styles.notificationCenterActions}>
                    <TouchableOpacity onPress={markAllAsRead}>
                      <Text style={styles.markAllReadText}>Mark all as read</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowNotificationCenter(false)}>
                      <Ionicons name="close" size={24} color="#666" />
                    </TouchableOpacity>
                  </View>
                </View>

                <ScrollView style={styles.notificationCenterList}>
                  {notifications.length === 0 ? (
                    <View style={styles.emptyNotifications}>
                      <Ionicons name="notifications-off-outline" size={48} color="#D1D5DB" />
                      <Text style={styles.emptyNotificationsText}>No notifications</Text>
                    </View>
                  ) : (
                    notifications.map(notification => (
                      <TouchableOpacity 
                        key={notification.id}
                        style={[
                          styles.notificationCenterItem,
                          !notification.read && styles.unreadNotificationItem
                        ]}
                      >
                        <View style={styles.notificationCenterIcon}>
                          <Ionicons 
                            name={getNotificationIcon(notification.type)} 
                            size={24} 
                            color={getNotificationColor(notification.type)} 
                          />
                        </View>
                        <View style={styles.notificationCenterContent}>
                          <Text style={styles.notificationCenterItemTitle}>
                            {notification.title}
                          </Text>
                          <Text style={styles.notificationCenterItemMessage}>
                            {notification.message}
                          </Text>
                          <Text style={styles.notificationCenterItemTime}>
                            {new Date(notification.timestamp).toLocaleTimeString()}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </View>
            </BlurView>
          </Modal>
        )}

        {/* Modern Alert Modal */}
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

  // SHOW PENDING REQUESTS IF NO ACTIVE RIDE
  if (pendingRequests.length > 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* MODERN NOTIFICATION STACK */}
        <View style={styles.notificationStack}>
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
                  <Ionicons 
                    name={getNotificationIcon(notification.type)} 
                    size={24} 
                    color="#FFF" 
                  />
                </View>
                <View style={styles.notificationContent}>
                  <Text style={styles.notificationTitle}>{notification.title}</Text>
                  <Text style={styles.notificationMessage} numberOfLines={2}>
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
                    <Text style={styles.notificationActionText}>
                      {notification.actionText || 'View'}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity 
                  style={styles.notificationClose}
                  onPress={() => removeNotification(notification.id)}
                >
                  <Ionicons name="close" size={18} color="#FFF" />
                </TouchableOpacity>
              </LinearGradient>
            </Animated.View>
          ))}
        </View>

        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.headerSubtitle}>New Bookings</Text>
            <Text style={styles.headerTitle}>{pendingRequests.length} Request{pendingRequests.length > 1 ? 's' : ''}</Text>
          </View>
          <TouchableOpacity 
            style={styles.notificationBell}
            onPress={() => setShowNotificationCenter(!showNotificationCenter)}
          >
            <Ionicons name="notifications" size={24} color="#FFF" />
            {unreadCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
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

        {/* Modern Alert Modal */}
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
        <TouchableOpacity 
          style={styles.notificationBell}
          onPress={() => setShowNotificationCenter(!showNotificationCenter)}
        >
          <Ionicons name="notifications" size={24} color="#FFF" />
          {unreadCount > 0 && (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
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
            addNotification({
              type: 'success',
              title: 'Online',
              message: 'You are now online and ready to receive bookings!',
              duration: 3000
            });
          }}
        >
          <Text style={styles.goOnlineText}>I'm Online</Text>
        </Pressable>
      </View>

      {/* Modern Alert Modal */}
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

// Helper functions for notifications
const getNotificationColors = (type) => {
  switch(type) {
    case 'success':
      return ['#10B981', '#059669'];
    case 'error':
      return ['#EF4444', '#DC2626'];
    case 'warning':
      return ['#F59E0B', '#D97706'];
    case 'booking':
      return ['#3B82F6', '#2563EB'];
    case 'urgent':
      return ['#8B5CF6', '#7C3AED'];
    default:
      return ['#6B7280', '#4B5563'];
  }
};

const getNotificationIcon = (type) => {
  switch(type) {
    case 'success':
      return 'checkmark-circle';
    case 'error':
      return 'alert-circle';
    case 'warning':
      return 'warning';
    case 'booking':
      return 'car';
    case 'urgent':
      return 'alert';
    default:
      return 'information-circle';
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
  notificationBell: {
    position: 'relative',
    padding: 8,
  },
  notificationBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#183B5C',
  },
  notificationBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  notificationStack: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    zIndex: 1000,
    elevation: 1000,
  },
  notificationCard: {
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  notificationGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  notificationIcon: {
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  notificationMessage: {
    color: '#FFF',
    fontSize: 12,
    opacity: 0.9,
  },
  notificationAction: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
  },
  notificationActionText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  notificationClose: {
    padding: 4,
  },
  notificationCenterOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  notificationCenter: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: height * 0.7,
  },
  notificationCenterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  notificationCenterTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  notificationCenterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  markAllReadText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '500',
  },
  notificationCenterList: {
    padding: 20,
  },
  notificationCenterItem: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    marginBottom: 8,
  },
  unreadNotificationItem: {
    backgroundColor: '#EFF6FF',
  },
  notificationCenterIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  notificationCenterContent: {
    flex: 1,
  },
  notificationCenterItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  notificationCenterItemMessage: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  notificationCenterItemTime: {
    fontSize: 10,
    color: '#999',
  },
  emptyNotifications: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyNotificationsText: {
    fontSize: 14,
    color: '#999',
    marginTop: 12,
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
  paymentStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    padding: 12,
    borderRadius: 12,
    marginBottom: 15,
    gap: 8,
  },
  paymentStatusText: {
    fontSize: 14,
    color: "#2E7D32",
    fontWeight: "500",
    flex: 1,
  },
  paymentSuccessBanner: {
    backgroundColor: "#E8F5E9",
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#A5D6A7",
    position: 'absolute',
    top: 80,
    left: 0,
    right: 0,
    zIndex: 100,
    elevation: 100,
  },
  paymentSuccessBannerText: {
    flex: 1,
    marginLeft: 12,
  },
  paymentSuccessTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#2E7D32",
    marginBottom: 2,
  },
  paymentSuccessMessage: {
    fontSize: 12,
    color: "#1B5E20",
  },
  waitingPaymentContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    padding: 12,
    borderRadius: 12,
    marginBottom: 15,
    gap: 8,
  },
  waitingPaymentText: {
    fontSize: 14,
    color: "#D97706",
    fontWeight: "500",
    flex: 1,
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
    backgroundColor: "#FEE2E2",
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
});