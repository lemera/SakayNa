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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import Constants from "expo-constants";

export default function TrackRide({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const mapRef = useRef(null);
  
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

  const googleApiKey = Constants.expoConfig?.extra?.GOOGLE_API_KEY;

  // Reset state when screen focuses
  useFocusEffect(
    React.useCallback(() => {
      console.log("🎯 TrackRide focused - resetting state");
      
      // Clear previous state
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
      
      // Check for active booking
      checkForActiveBooking();
      
      return () => {
        console.log("🧹 Cleaning up TrackRide");
        if (locationSubscription) {
          locationSubscription.remove();
        }
      };
    }, [])
  );

  const checkForActiveBooking = async () => {
    try {
      setLoading(true);
      
      const id = await AsyncStorage.getItem("user_id");
      if (!id) {
        setNoRideAvailable(true);
        setLoading(false);
        return;
      }

      setCommuterId(id);

      // First, check if there's a booking ID from params
      if (route.params?.bookingId) {
        console.log("📦 Using booking from params:", route.params.bookingId);
        setBookingId(route.params.bookingId);
        setDriverId(route.params.driverId);
        
        // Fetch this specific booking
        await fetchBookingDetails(route.params.bookingId);
        setLoading(false);
        return;
      }

      // Otherwise, look for any ACCEPTED booking
      console.log("🔍 Looking for active booking for commuter:", id);
      
      const { data, error } = await supabase
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
          dropoff_details
        `)
        .eq("commuter_id", id)
        .eq("status", "accepted")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        console.log("✅ Found active booking:", data);
        setBookingId(data.id);
        setDriverId(data.driver_id);
        setBooking(data);
        setStatus(data.status);
        
        // Check driver arrival status
        if (data.driver_arrived_at) {
          console.log("✅ Driver has arrived");
          setDriverArrived(true);
        }
        
        // Check if ride has started
        if (data.ride_started_at) {
          console.log("✅ Ride has started");
          setRideStarted(true);
          setDriverArrived(false);
        }
        
        // Fetch driver details
        if (data.driver_id) {
          fetchDriverDetails(data.driver_id);
        }
        
        // Calculate trip route
        if (data.pickup_latitude && data.pickup_longitude && 
            data.dropoff_latitude && data.dropoff_longitude) {
          calculateTripRoute(
            { latitude: data.pickup_latitude, longitude: data.pickup_longitude },
            { latitude: data.dropoff_latitude, longitude: data.dropoff_longitude }
          );
        }
        
        setNoRideAvailable(false);
        setShowCompletedUI(false);
      } else {
        // Check for any completed booking to show summary
        const { data: completedData } = await supabase
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
            passenger_count
          `)
          .eq("commuter_id", id)
          .in("status", ["completed", "cancelled"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

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
          
          // Calculate trip route for completed ride
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
    if (!bookingId || status === "completed" || status === "cancelled" || showCompletedUI) return;

    console.log("📡 Setting up real-time subscriptions for booking:", bookingId);

    // Listen for booking updates
    const bookingSubscription = supabase
      .channel(`booking-${bookingId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `id=eq.${bookingId}`,
        },
        (payload) => {
          console.log("📅 Booking updated:", payload);
          if (payload.new) {
            setBooking(payload.new);
            setStatus(payload.new.status);
            
            // Check for driver_arrived_at field
            if (payload.new.driver_arrived_at) {
              console.log("✅ Driver has arrived at pickup!");
              setDriverArrived(true);
            }
            
            // Check for ride_started_at field
            if (payload.new.ride_started_at) {
              console.log("✅ Ride has started!");
              setRideStarted(true);
              setDriverArrived(false);
            }
            
            if (payload.new.status === "completed") {
              setShowCompletedUI(true);
              setRideStarted(false);
              setDriverArrived(false);
              // Stop location tracking
              if (locationSubscription) {
                locationSubscription.remove();
              }
              Alert.alert(
                "🎉 Trip Completed!",
                "You have reached your destination. Thank you for riding with us!",
                [
                  { 
                    text: "Rate Driver", 
                    onPress: () => navigation.replace("RateRide", { bookingId, driverId: payload.new.driver_id })
                  },
                  {
                    text: "Later",
                    style: "cancel",
                    onPress: () => navigation.goBack()
                  }
                ]
              );
            } else if (payload.new.status === "cancelled") {
              setShowCompletedUI(true);
              Alert.alert(
                "❌ Trip Cancelled",
                payload.new.cancellation_reason || "The trip has been cancelled.",
                [{ text: "OK", onPress: () => navigation.goBack() }]
              );
            }
          }
        }
      )
      .subscribe();

    // Listen for booking updates from the updates table
    const updatesSubscription = supabase
      .channel(`booking-updates-${bookingId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'booking_updates',
          filter: `booking_id=eq.${bookingId}`,
        },
        (payload) => {
          console.log("📢 Booking update:", payload);
          if (payload.new.type === "driver_arrived") {
            console.log("✅ Driver arrived notification received!");
            setDriverArrived(true);
            Alert.alert(
              "Driver Arrived",
              "Your driver has arrived at the pickup location.",
              [{ text: "OK" }]
            );
          }
        }
      )
      .subscribe();

    // Start location tracking for active rides
    if (status === "accepted" && !showCompletedUI) {
      startUserLocationTracking();
    }

    return () => {
      bookingSubscription.unsubscribe();
      updatesSubscription.unsubscribe();
    };
  }, [bookingId, status, showCompletedUI]);

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
          console.log("📍 Driver location updated:", payload);
          if (payload.new) {
            const newLocation = {
              latitude: payload.new.latitude,
              longitude: payload.new.longitude,
            };
            setDriverLocation(newLocation);
            setDriverLocationLoaded(true);
            
            // Only calculate ETA if driver hasn't arrived and ride hasn't started
            if (booking && !driverArrived && !rideStarted) {
              calculateDriverETA(newLocation, {
                latitude: booking.pickup_latitude,
                longitude: booking.pickup_longitude
              });
              
              // Check if driver has arrived (within 50 meters)
              const distanceToPickup = calculateDistance(
                newLocation.latitude,
                newLocation.longitude,
                booking.pickup_latitude,
                booking.pickup_longitude
              );
              
              // If driver is very close, set arrived to true
              if (distanceToPickup < 0.05 && !driverArrived && !rideStarted) {
                console.log("📍 Driver is within 50 meters - arrived!");
                setDriverArrived(true);
              }
            }
          }
        }
      )
      .subscribe();

    // Also try to fetch driver location immediately
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
        console.log("✅ Driver location found:", data);
        const newLocation = {
          latitude: data.latitude,
          longitude: data.longitude,
        };
        setDriverLocation(newLocation);
        setDriverLocationLoaded(true);
        
        // Check if driver is already near pickup
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
        (newLocation) => {
          // We don't need to store user location for anything, just for map display
        }
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
        
        // Fit map to show route
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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
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

          <Pressable style={styles.historyButton} onPress={() => navigation.navigate("RideHistory")}>
            <Text style={styles.historyButtonText}>View Ride History</Text>
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

        <View style={styles.completedContainer}>
          <View style={styles.completedIconContainer}>
            <Ionicons 
              name={status === "completed" ? "checkmark-circle" : "close-circle"} 
              size={80} 
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
              <View style={styles.completedFareRow}>
                <Text style={styles.completedFareLabel}>Fare Paid:</Text>
                <Text style={styles.completedFareAmount}>₱{booking.fare?.toFixed(2) || "0.00"}</Text>
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

          <Pressable style={styles.completedHistoryButton} onPress={() => navigation.navigate("RideHistory")}>
            <Text style={styles.completedHistoryButtonText}>View Ride History</Text>
          </Pressable>
        </View>
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
          {/* Driver Location */}
          {showDriverLocation && driverLocation && (
            <Marker coordinate={driverLocation} title="Your Driver" flat>
              <View style={styles.driverMarker}>
                <Ionicons name="car" size={20} color="#FFF" />
              </View>
            </Marker>
          )}

          {/* Pickup Location */}
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

          {/* Dropoff Location */}
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

          {/* Route to Driver */}
          {showRouteToDriver && (
            <Polyline
              coordinates={routeCoordinates}
              strokeColor="#3B82F6"
              strokeWidth={4}
              lineDashPattern={[1]}
            />
          )}

          {/* Trip Route */}
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
      <View style={styles.bottomSheet}>
        {/* Status Card */}
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

        {/* Driver Info */}
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

        {/* Trip Details */}
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

        {/* Trip Stats */}
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

        {/* Action Buttons */}
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

        {/* Share Trip Button */}
        {(status === "accepted" || driverArrived || rideStarted) && (
          <Pressable style={styles.shareButton}>
            <Ionicons name="share-social" size={20} color="#183B5C" />
            <Text style={styles.shareButtonText}>Share Trip</Text>
          </Pressable>
        )}
      </View>
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
  // No Ride Available Styles
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
  // Completed/Cancelled UI Styles
  completedContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    backgroundColor: "#F5F7FA",
  },
  completedIconContainer: {
    marginBottom: 20,
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
  completedFareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  completedFareLabel: {
    fontSize: 14,
    color: "#666",
  },
  completedFareAmount: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#183B5C",
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
  },
  completedHistoryButtonText: {
    color: "#183B5C",
    fontSize: 14,
    fontWeight: "500",
    textDecorationLine: "underline",
  },
});

