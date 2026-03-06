// screens/commuter/HomeScreen.js
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

export default function CommuterHomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const mapRef = useRef(null);
  
  // Location states
  const [userLocation, setUserLocation] = useState(null);
  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [pickupText, setPickupText] = useState("");
  const [dropoffText, setDropoffText] = useState("");
  const [pickupDetails, setPickupDetails] = useState("");
  const [dropoffDetails, setDropoffDetails] = useState("");
  
  // Passenger count
  const [passengerCount, setPassengerCount] = useState(1);
  
  // Loading states
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [findingDriver, setFindingDriver] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  
  // Driver info
  const [nearbyDrivers, setNearbyDrivers] = useState(0);
  
  // Trip calculation
  const [estimatedFare, setEstimatedFare] = useState(null);
  const [estimatedDistance, setEstimatedDistance] = useState(null);
  const [estimatedTime, setEstimatedTime] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  
  // Fare settings from database
  const [fareSettings, setFareSettings] = useState({
    baseFare: 15,
    perKmRate: 15,
    minimumFare: 15,
  });
  
  // User data
  const [commuterId, setCommuterId] = useState(null);
  const [activeBooking, setActiveBooking] = useState(null);
  
  // Recent locations
  const [recentLocations, setRecentLocations] = useState([]);
  const [savedPlaces, setSavedPlaces] = useState([]);

  // Refs for cleanup and tracking
  const bookingSubscription = useRef(null);
  const pollingInterval = useRef(null);
  const currentBookingId = useRef(null);
  const isMounted = useRef(true);

  // Common location details phrases
  const commonDetails = [
    "near the corner",
    "in front of",
    "behind",
    "beside",
    "under the bridge",
    "near waiting shed",
    "near basketball court",
    "near barangay hall",
    "near alley",
    "near overpass",
  ];

  const googleApiKey = Constants.expoConfig?.extra?.GOOGLE_API_KEY;

  // Cleanup on unmount
  useEffect(() => {
    isMounted.current = true;
    
    return () => {
      isMounted.current = false;
      cleanupBookingTracking();
    };
  }, []);

  const cleanupBookingTracking = () => {
    console.log("🧹 Cleaning up booking tracking");
    
    if (bookingSubscription.current) {
      bookingSubscription.current.unsubscribe();
      bookingSubscription.current = null;
    }
    
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
    
    currentBookingId.current = null;
  };

  // Use focus effect with cleanup and proper data fetching
  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      
      const loadInitialData = async () => {
        if (isActive && isMounted.current) {
          setLoading(true);
          await Promise.all([
            checkActiveBooking(),
            getCommuterId(),
            loadRecentLocations(),
            loadSavedPlaces(),
            fetchFareSettings(),
          ]);
          setLoading(false);
          setInitialLoad(false);
        }
      };

      loadInitialData();

      return () => {
        isActive = false;
        // Don't cleanup booking tracking on blur if we're finding driver
        // Only cleanup when component unmounts or when explicitly cancelled
      };
    }, [])
  );

  // Separate effect for location to avoid re-running on every focus
  useEffect(() => {
    getUserLocation();
  }, []);

  // Refresh function for pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      getUserLocation(),
      fetchFareSettings(),
      loadRecentLocations(),
      loadSavedPlaces(),
      checkActiveBooking(),
    ]);
    setRefreshing(false);
  }, []);

  const fetchFareSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("fares")
        .select("*")
        .eq("active", true);

      if (error) throw error;

      if (data && data.length > 0) {
        const baseFareData = data.find(f => f.fare_type === 'base_fare');
        const perKmFareData = data.find(f => f.fare_type === 'per_km');
        const minFareData = data.find(f => f.fare_type === 'minimum_fare');
        
        setFareSettings({
          baseFare: baseFareData?.amount || 15,
          perKmRate: perKmFareData?.amount || 15,
          minimumFare: minFareData?.amount || 15,
        });
      }
    } catch (err) {
      console.log("Error fetching fare settings:", err);
    }
  };

  const loadRecentLocations = async () => {
    try {
      const recent = await AsyncStorage.getItem("recent_locations");
      if (recent) {
        setRecentLocations(JSON.parse(recent));
      }
    } catch (err) {
      console.log("Error loading recent locations:", err);
    }
  };

  const loadSavedPlaces = async () => {
    try {
      const id = await AsyncStorage.getItem("user_id");
      if (!id) return;

      const { data, error } = await supabase
        .from("saved_places")
        .select("*")
        .eq("commuter_id", id)
        .order("created_at", { ascending: false });

      if (data) {
        setSavedPlaces(data);
      }
    } catch (err) {
      console.log("Error loading saved places:", err);
    }
  };

  const saveRecentLocation = async (location, address, details, type) => {
    try {
      const recent = {
        id: Date.now().toString(),
        location,
        address,
        details,
        type,
        timestamp: new Date().toISOString(),
      };

      const existing = await AsyncStorage.getItem("recent_locations");
      let recents = existing ? JSON.parse(existing) : [];
      
      recents = [recent, ...recents.filter(r => r.address !== address)].slice(0, 10);
      
      await AsyncStorage.setItem("recent_locations", JSON.stringify(recents));
      setRecentLocations(recents);
    } catch (err) {
      console.log("Error saving recent location:", err);
    }
  };

  const checkActiveBooking = async () => {
    try {
      const id = await AsyncStorage.getItem("user_id");
      if (!id) return;

      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("commuter_id", id)
        .in("status", ["pending", "accepted", "started"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setActiveBooking(data);
        
        // If there's an accepted booking, go to TrackRide
        if (data.status === 'accepted' || data.status === 'started') {
          navigation.navigate("TrackRide", { 
            bookingId: data.id, 
            driverId: data.driver_id 
          });
        } 
        // If there's a pending booking, show finding driver screen
        else if (data.status === 'pending') {
          setFindingDriver(true);
          currentBookingId.current = data.id;
          setupBookingTracking(data.id);
        }
      } else {
        setActiveBooking(null);
      }
    } catch (err) {
      console.log("Error checking active booking:", err);
      setActiveBooking(null);
    }
  };

  const getCommuterId = async () => {
    const id = await AsyncStorage.getItem("user_id");
    setCommuterId(id);
  };

  const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Denied", "Location permission is needed to book a ride");
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      setUserLocation(coords);
      
      // Only set pickup if it's not already set
      if (!pickup) {
        setPickup(coords);

        const address = await Location.reverseGeocodeAsync(coords);
        if (address[0]) {
          const { street, name, city, region } = address[0];
          const fullAddress = `${street || name || "Current Location"}, ${city || ""}, ${region || ""}`;
          setPickupText(fullAddress);
        }
      }

      getNearbyDrivers(coords);
    } catch (err) {
      console.log("Error getting location:", err);
    }
  };

  const getNearbyDrivers = async (coords) => {
    try {
      console.log("🔍 Searching for drivers near:", coords);
      
      const { data: drivers, error } = await supabase
        .from("driver_locations")
        .select(`
          driver_id,
          latitude,
          longitude,
          last_updated,
          drivers!inner (
            id,
            first_name,
            last_name,
            status,
            is_active,
            driver_vehicles (
              vehicle_type,
              vehicle_color,
              plate_number
            )
          )
        `)
        .eq("is_online", true)
        .eq("drivers.status", "approved")
        .eq("drivers.is_active", true);

      if (error) {
        console.log("❌ Query error:", error);
        throw error;
      }

      if (drivers && drivers.length > 0) {
        const driversWithDistance = drivers.map(driver => {
          const distance = calculateDistance(
            coords.latitude,
            coords.longitude,
            driver.latitude,
            driver.longitude
          );
          
          const vehicle = driver.drivers.driver_vehicles?.[0] || {};
          
          return {
            driver_id: driver.driver_id,
            first_name: driver.drivers.first_name,
            last_name: driver.drivers.last_name,
            distance_km: distance,
            latitude: driver.latitude,
            longitude: driver.longitude,
            vehicle_type: vehicle.vehicle_type || 'Motorcycle',
            vehicle_color: vehicle.vehicle_color || 'N/A',
            vehicle_plate: vehicle.plate_number || 'N/A',
            last_updated: driver.last_updated
          };
        });

        const nearbyDrivers = driversWithDistance
          .filter(d => d.distance_km <= 5)
          .sort((a, b) => a.distance_km - b.distance_km);

        console.log(`🎯 Found ${nearbyDrivers.length} drivers within 5km`);
        setNearbyDrivers(nearbyDrivers.length);
      } else {
        console.log("❌ No online drivers found");
        setNearbyDrivers(0);
      }
    } catch (err) {
      console.log("❌ Error getting nearby drivers:", err);
      setNearbyDrivers(0);
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

  const handleUseCurrentLocation = () => {
    if (userLocation) {
      setPickup(userLocation);
      // Refresh address
      Location.reverseGeocodeAsync(userLocation).then(address => {
        if (address[0]) {
          const { street, name, city, region } = address[0];
          const fullAddress = `${street || name || "Current Location"}, ${city || ""}, ${region || ""}`;
          setPickupText(fullAddress);
        }
      });
    }
  };

  const handleSelectOnMap = (type) => {
    navigation.navigate("MapPicker", {
      type,
      onSelect: (location, address) => {
        if (type === "pickup") {
          setPickup(location);
          setPickupText(address);
        } else {
          setDropoff(location);
          setDropoffText(address);
        }
        
        if ((type === "pickup" && dropoff) || (type === "dropoff" && pickup)) {
          calculateRoute(
            type === "pickup" ? location : pickup,
            type === "dropoff" ? location : dropoff
          );
        }
      },
    });
  };

  const handleSelectRecent = (recent) => {
    if (recent.type === "pickup") {
      setPickup(recent.location);
      setPickupText(recent.address);
      setPickupDetails(recent.details || "");
    } else {
      setDropoff(recent.location);
      setDropoffText(recent.address);
      setDropoffDetails(recent.details || "");
    }

    if (pickup && dropoff) {
      calculateRoute(pickup, dropoff);
    }
  };

  const handleSelectSavedPlace = (place) => {
    Alert.alert(
      "Use as pickup?",
      place.address,
      [
        { text: "No", style: "cancel" },
        { 
          text: "Yes", 
          onPress: () => {
            setPickup({
              latitude: place.latitude,
              longitude: place.longitude,
            });
            setPickupText(place.address);
            setPickupDetails(place.details || "");
          }
        }
      ]
    );
  };

  const calculateRoute = async (startCoords, endCoords) => {
    if (!startCoords || !endCoords || !googleApiKey) return;
    
    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${startCoords.latitude},${startCoords.longitude}&destination=${endCoords.latitude},${endCoords.longitude}&key=${googleApiKey}&mode=driving`;
      
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
        
        calculateFareWithPassengers(distanceKm);

        if (mapRef.current) {
          mapRef.current.fitToCoordinates(
            [startCoords, endCoords],
            {
              edgePadding: { top: 100, right: 50, bottom: 300, left: 50 },
              animated: true,
            }
          );
        }
      }
    } catch (err) {
      console.log("Error calculating route:", err);
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

  const calculateFareWithPassengers = (distanceKm) => {
    if (!distanceKm) return;
    
    const km = Math.ceil(parseFloat(distanceKm));
    
    let farePerPassenger = fareSettings.baseFare;
    
    if (km > 1) {
      farePerPassenger = fareSettings.baseFare + ((km - 1) * fareSettings.perKmRate);
    }
    
    if (farePerPassenger < fareSettings.minimumFare) {
      farePerPassenger = fareSettings.minimumFare;
    }
    
    const totalFare = farePerPassenger * passengerCount;
    setEstimatedFare(totalFare);
  };

  useEffect(() => {
    if (pickup && dropoff && estimatedDistance) {
      calculateFareWithPassengers(parseFloat(estimatedDistance));
    }
  }, [passengerCount, estimatedDistance, fareSettings]);

  useEffect(() => {
    if (pickup && dropoff) {
      calculateRoute(pickup, dropoff);
    }
  }, [pickup, dropoff]);

  const handlePassengerChange = (increment) => {
    const newCount = passengerCount + increment;
    if (newCount >= 1 && newCount <= 6) {
      setPassengerCount(newCount);
    }
  };

  const handleBookRide = () => {
    if (!pickup) {
      Alert.alert("Missing Info", "Please select a pickup location");
      return;
    }
    if (!dropoff) {
      Alert.alert("Missing Info", "Please select a dropoff location");
      return;
    }

    const pickupDisplay = pickupDetails 
      ? `${pickupText} - ${pickupDetails}`
      : pickupText;
    const dropoffDisplay = dropoffDetails 
      ? `${dropoffText} - ${dropoffDetails}`
      : dropoffText;

    Alert.alert(
      "Confirm Booking",
      `📍 PICKUP:\n${pickupDisplay}\n\n🏁 DROPOFF:\n${dropoffDisplay}\n\n👥 Passengers: ${passengerCount}\n📏 Distance: ${estimatedDistance} km\n⏱️ Est. Time: ${estimatedTime} mins\n💰 Total Fare: ₱${estimatedFare}`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Book Now", onPress: createBooking }
      ]
    );
  };

  const setupBookingTracking = (bookingId) => {
    console.log(`🔴 Setting up tracking for booking: ${bookingId}`);
    
    // Clean up any existing tracking
    cleanupBookingTracking();
    
    currentBookingId.current = bookingId;

    // 1. REAL-TIME SUBSCRIPTION (Fastest - updates instantly)
    bookingSubscription.current = supabase
      .channel(`booking-${bookingId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookings',
          filter: `id=eq.${bookingId}`
        },
        (payload) => {
          console.log('🔄 REAL-TIME UPDATE:', payload.new);
          
          if (!isMounted.current) return;
          
          if (payload.new.status === 'accepted') {
            console.log(`✅ Driver ACCEPTED! Driver ID: ${payload.new.driver_id}`);
            
            // Navigate immediately
            handleDriverAccepted(bookingId, payload.new.driver_id);
          } 
          else if (payload.new.status === 'cancelled') {
            console.log('❌ Booking cancelled');
            
            // Check who cancelled
            const cancelledBy = payload.new.cancelled_by || 'unknown';
            const reason = payload.new.cancellation_reason || 'No reason provided';
            
            handleBookingCancelled(cancelledBy, reason);
          }
          else if (payload.new.status === 'started') {
            console.log('🚗 Trip started');
            // Already in TrackRide, will update there
          }
        }
      )
      .subscribe((status) => {
        console.log(`📡 Subscription status: ${status}`);
      });

    // 2. POLLING (Backup - checks every 3 seconds)
    let attempts = 0;
    const maxAttempts = 30; // 90 seconds (3s × 30)
    
    pollingInterval.current = setInterval(async () => {
      if (!isMounted.current || !currentBookingId.current) {
        clearInterval(pollingInterval.current);
        pollingInterval.current = null;
        return;
      }
      
      attempts++;
      console.log(`⏱️ Polling attempt ${attempts}/${maxAttempts}`);
      
      const { data: booking, error } = await supabase
        .from("bookings")
        .select("status, driver_id, cancelled_by, cancellation_reason")
        .eq("id", bookingId)
        .maybeSingle();

      if (error) {
        console.log("❌ Polling error:", error);
        return;
      }

      if (booking?.status === 'accepted') {
        console.log(`✅ Polling found ACCEPTED booking! Driver: ${booking.driver_id}`);
        
        // Clean up
        cleanupBookingTracking();
        
        // Navigate
        if (isMounted.current) {
          setFindingDriver(false);
          navigation.navigate("TrackRide", { 
            bookingId, 
            driverId: booking.driver_id 
          });
        }
      }
      else if (booking?.status === 'cancelled') {
        console.log('❌ Polling found CANCELLED booking');
        
        // Clean up
        cleanupBookingTracking();
        
        // Show alert
        if (isMounted.current) {
          const cancelledBy = booking.cancelled_by || 'unknown';
          const reason = booking.cancellation_reason || 'No reason provided';
          
          Alert.alert(
            "❌ Booking Cancelled",
            `This booking was cancelled by the ${cancelledBy}.\n\nReason: ${reason}`,
            [{ text: "OK" }]
          );
          
          setFindingDriver(false);
        }
      }
      else if (attempts >= maxAttempts) {
        // Time out after 90 seconds
        console.log('⏰ Polling timeout - no driver found');
        cleanupBookingTracking();
        
        if (isMounted.current) {
          Alert.alert(
            "No Driver Found",
            "We couldn't find a driver at this time. Would you like to try again?",
            [
              { 
                text: "Cancel", 
                onPress: () => {
                  setFindingDriver(false);
                  cancelBooking(bookingId);
                }
              },
              { 
                text: "Try Again", 
                onPress: () => findAndNotifyDrivers(bookingId) 
              }
            ]
          );
        }
      }
    }, 3000);
  };

  const handleDriverAccepted = (bookingId, driverId) => {
    // Clean up tracking
    cleanupBookingTracking();
    
    // Update UI
    setFindingDriver(false);
    
    // Navigate to TrackRide
    navigation.navigate("TrackRide", { 
      bookingId, 
      driverId 
    });
  };

  const handleBookingCancelled = (cancelledBy, reason) => {
    cleanupBookingTracking();
    
    if (isMounted.current) {
      setFindingDriver(false);
      
      // Show different messages based on who cancelled
      if (cancelledBy === 'commuter') {
        Alert.alert(
          "✅ Booking Cancelled",
          "Your booking has been successfully cancelled.",
          [{ text: "OK" }]
        );
      } else if (cancelledBy === 'driver') {
        Alert.alert(
          "❌ Booking Cancelled by Driver",
          `The driver cancelled your booking.\n\nReason: ${reason}`,
          [{ text: "OK" }]
        );
      } else if (cancelledBy === 'system') {
        Alert.alert(
          "⚠️ Booking Expired",
          `Your booking has expired.\n\nReason: ${reason}`,
          [{ text: "OK" }]
        );
      } else {
        Alert.alert(
          "❌ Booking Cancelled",
          `Your booking was cancelled.\n\nReason: ${reason}`,
          [{ text: "OK" }]
        );
      }
    }
  };

  // ================= NEW: CANCEL BOOKING FUNCTION =================
  const cancelBooking = async (bookingId, reason = "Cancelled by commuter") => {
    try {
      console.log(`🛑 Cancelling booking: ${bookingId}`);
      
      const { error } = await supabase
        .from("bookings")
        .update({ 
          status: "cancelled",
          cancelled_at: new Date(),
          cancellation_reason: reason,
          cancelled_by: "commuter",
          updated_at: new Date()
        })
        .eq("id", bookingId);

      if (error) throw error;

      console.log("✅ Booking cancelled successfully");
      
      // Also update any pending booking requests
      await supabase
        .from("booking_requests")
        .update({ 
          status: "cancelled",
          responded_at: new Date()
        })
        .eq("booking_id", bookingId)
        .eq("status", "pending");

      // Clean up tracking
      cleanupBookingTracking();
      
      // Update UI
      setFindingDriver(false);
      
    } catch (err) {
      console.log("❌ Error cancelling booking:", err);
      Alert.alert("Error", "Failed to cancel booking");
    }
  };

  // ================= NEW: HANDLE MANUAL CANCELLATION =================
  const handleManualCancel = async () => {
    if (!currentBookingId.current) {
      setFindingDriver(false);
      return;
    }

    Alert.alert(
      "Cancel Booking",
      "Are you sure you want to cancel this booking?",
      [
        { text: "No", style: "cancel" },
        { 
          text: "Yes, Cancel", 
          style: "destructive",
          onPress: async () => {
            await cancelBooking(currentBookingId.current, "Cancelled by commuter");
          }
        }
      ]
    );
  };

  const createBooking = async () => {
    if (!commuterId) {
      Alert.alert("Error", "Please login first");
      return;
    }

    setFindingDriver(true);

    try {
      const pickupDisplay = pickupDetails 
        ? `${pickupText} - ${pickupDetails}`
        : pickupText;
      const dropoffDisplay = dropoffDetails 
        ? `${dropoffText} - ${dropoffDetails}`
        : dropoffText;

      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .insert([
          {
            commuter_id: commuterId,
            pickup_location: pickupDisplay,
            pickup_latitude: pickup.latitude,
            pickup_longitude: pickup.longitude,
            pickup_details: pickupDetails,
            dropoff_location: dropoffDisplay,
            dropoff_latitude: dropoff.latitude,
            dropoff_longitude: dropoff.longitude,
            dropoff_details: dropoffDetails,
            passenger_count: passengerCount,
            fare: estimatedFare,
            base_fare: fareSettings.baseFare,
            per_km_rate: fareSettings.perKmRate,
            distance_km: estimatedDistance,
            duration_minutes: estimatedTime,
            status: "pending",
            created_at: new Date(),
          },
        ])
        .select()
        .single();

      if (bookingError) throw bookingError;

      console.log(`✅ Booking created: ${booking.id}`);
      
      // Save recent locations
      if (pickup && pickupText) {
        saveRecentLocation(pickup, pickupText, pickupDetails, "pickup");
      }
      if (dropoff && dropoffText) {
        saveRecentLocation(dropoff, dropoffText, dropoffDetails, "dropoff");
      }

      // Set up tracking for this booking
      setupBookingTracking(booking.id);

      // Find and notify drivers (background process)
      findAndNotifyDrivers(booking.id);

    } catch (err) {
      console.log("Error creating booking:", err);
      Alert.alert("Error", "Failed to create booking");
      setFindingDriver(false);
    }
  };

  const findAndNotifyDrivers = async (bookingId) => {
    try {
      console.log(`🚀 Finding drivers for booking: ${bookingId}`);

      const { data: drivers, error } = await supabase
        .from("driver_locations")
        .select(`
          driver_id,
          latitude,
          longitude,
          drivers!inner (
            id,
            expo_push_token
          )
        `)
        .eq("is_online", true)
        .eq("drivers.status", "approved")
        .eq("drivers.is_active", true);

      if (error) throw error;

      if (!drivers || drivers.length === 0) {
        handleNoDriversAvailable(bookingId);
        return;
      }

      const driversWithDistance = drivers.map(driver => {
        const distance = calculateDistance(
          pickup.latitude,
          pickup.longitude,
          driver.latitude,
          driver.longitude
        );
        return {
          driver_id: driver.driver_id,
          distance: distance,
          expo_push_token: driver.drivers.expo_push_token
        };
      });

      const nearbyDrivers = driversWithDistance
        .filter(d => d.distance <= 3)
        .sort((a, b) => a.distance - b.distance);

      if (nearbyDrivers.length === 0) {
        handleNoDriversNearby(bookingId);
        return;
      }

      const bookingRequests = nearbyDrivers.slice(0, 5).map(driver => ({
        booking_id: bookingId,
        driver_id: driver.driver_id,
        status: 'pending',
        distance_km: driver.distance,
        created_at: new Date()
      }));

      const { error: requestError } = await supabase
        .from("booking_requests")
        .insert(bookingRequests);

      if (requestError) throw requestError;

      // Send push notifications
      nearbyDrivers.slice(0, 5).forEach(driver => {
        if (driver.expo_push_token) {
          sendPushNotification(
            driver.expo_push_token,
            "New Booking Request",
            `New booking from ${pickupDetails || 'your area'} to ${dropoffDetails || 'destination'}`
          );
        }
      });

      console.log(`📨 Notified ${nearbyDrivers.length} drivers`);

    } catch (err) {
      console.log("❌ Error finding drivers:", err);
    }
  };

  const handleNoDriversAvailable = async (bookingId) => {
    Alert.alert(
      "No Drivers Available",
      "No drivers are currently online. Would you like to try again?",
      [
        { 
          text: "Cancel", 
          onPress: async () => {
            await cancelBooking(bookingId, "No drivers available");
          }
        },
        { 
          text: "Try Again", 
          onPress: () => findAndNotifyDrivers(bookingId) 
        }
      ]
    );
  };

  const handleNoDriversNearby = async (bookingId) => {
    Alert.alert(
      "No Drivers Nearby",
      "No drivers found within 3km. Would you like to expand search radius?",
      [
        { 
          text: "Cancel", 
          onPress: async () => {
            await cancelBooking(bookingId, "No drivers nearby");
          }
        },
        { 
          text: "Expand to 5km", 
          onPress: () => expandDriverSearch(bookingId, 5) 
        }
      ]
    );
  };

  const expandDriverSearch = async (bookingId, radius) => {
    try {
      const { data: drivers, error } = await supabase
        .from("driver_locations")
        .select(`
          driver_id,
          latitude,
          longitude,
          drivers!inner (
            id,
            expo_push_token
          )
        `)
        .eq("is_online", true)
        .eq("drivers.status", "approved")
        .eq("drivers.is_active", true);

      if (error) throw error;

      const driversWithDistance = drivers.map(driver => {
        const distance = calculateDistance(
          pickup.latitude,
          pickup.longitude,
          driver.latitude,
          driver.longitude
        );
        return {
          driver_id: driver.driver_id,
          distance: distance,
          expo_push_token: driver.drivers.expo_push_token
        };
      });

      const nearbyDrivers = driversWithDistance
        .filter(d => d.distance <= radius)
        .sort((a, b) => a.distance - b.distance);

      if (nearbyDrivers.length === 0) {
        Alert.alert(
          "Still No Drivers",
          "No drivers found within 5km. Try again later?",
          [
            { 
              text: "Cancel", 
              onPress: async () => {
                await cancelBooking(bookingId, "No drivers within 5km");
              }
            },
            { 
              text: "Try Again", 
              onPress: () => expandDriverSearch(bookingId, radius) 
            }
          ]
        );
        return;
      }

      const bookingRequests = nearbyDrivers.slice(0, 5).map(driver => ({
        booking_id: bookingId,
        driver_id: driver.driver_id,
        status: 'pending',
        distance_km: driver.distance,
        created_at: new Date()
      }));

      const { error: requestError } = await supabase
        .from("booking_requests")
        .insert(bookingRequests);

      if (requestError) throw requestError;

      nearbyDrivers.slice(0, 5).forEach(driver => {
        if (driver.expo_push_token) {
          sendPushNotification(
            driver.expo_push_token,
            "New Booking Request",
            `New booking from ${pickupDetails || 'your area'}`
          );
        }
      });

    } catch (err) {
      console.log("Error expanding search:", err);
    }
  };

  const sendPushNotification = async (expoPushToken, title, body) => {
    if (!expoPushToken) return;
    
    const message = {
      to: expoPushToken,
      sound: 'default',
      title: title,
      body: body,
      data: { type: 'booking_request' }
    };

    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });
    } catch (err) {
      console.log("Error sending push notification:", err);
    }
  };

  const cancelFinding = async () => {
    Alert.alert(
      "Cancel Finding",
      "Are you sure you want to cancel finding a driver?",
      [
        { text: "No", style: "cancel" },
        { 
          text: "Yes, Cancel", 
          style: "destructive",
          onPress: async () => {
            if (currentBookingId.current) {
              await cancelBooking(currentBookingId.current, "Cancelled by commuter");
            } else {
              setFindingDriver(false);
            }
          }
        }
      ]
    );
  };

  // Show loading indicator on initial load
  if (initialLoad && loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
        <Text style={styles.loadingText}>Loading your ride...</Text>
      </View>
    );
  }

  if (findingDriver) {
    return (
      <View style={styles.findingDriverContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
        <Text style={styles.findingDriverTitle}>Finding your driver...</Text>
        <Text style={styles.findingDriverSubtitle}>
          Looking for nearby available drivers{'\n'}
          You'll be notified as soon as a driver accepts
        </Text>
        
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Ionicons name="people" size={24} color="#FFB37A" />
            <Text style={styles.statValue}>{nearbyDrivers}</Text>
            <Text style={styles.statLabel}>Drivers Nearby</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="time" size={24} color="#FFB37A" />
            <Text style={styles.statValue}>Instant</Text>
            <Text style={styles.statLabel}>Real-time Updates</Text>
          </View>
        </View>

        <Pressable 
          style={styles.cancelFindingButton}
          onPress={cancelFinding}
        >
          <Text style={styles.cancelFindingText}>Cancel Booking</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={{
            latitude: userLocation?.latitude || 14.5995,
            longitude: userLocation?.longitude || 120.9842,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          showsUserLocation={true}
          showsMyLocationButton={true}
        >
          {pickup && (
            <Marker
              coordinate={pickup}
              title="Pickup Location"
              description={pickupDetails || ""}
            >
              <View style={styles.pickupMarker}>
                <Ionicons name="location" size={16} color="#FFF" />
              </View>
            </Marker>
          )}
          {dropoff && (
            <Marker
              coordinate={dropoff}
              title="Dropoff Location"
              description={dropoffDetails || ""}
            >
              <View style={styles.dropoffMarker}>
                <Ionicons name="flag" size={16} color="#FFF" />
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
      </View>

      <View style={styles.bottomSheet}>
        <ScrollView 
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#183B5C"]}
              tintColor="#183B5C"
            />
          }
        >
          <Text style={styles.title}>Where are you going?</Text>

          <View style={styles.inputGroup}>
            <View style={styles.inputIcon}>
              <Ionicons name="location" size={20} color="#10B981" />
            </View>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>PICKUP LOCATION</Text>
              <Pressable onPress={() => handleSelectOnMap("pickup")}>
                <Text style={styles.inputText} numberOfLines={2}>
                  {pickupText || "Tap to select pickup location"}
                </Text>
              </Pressable>

              <View style={styles.detailsContainer}>
                <TextInput
                  style={styles.detailsInput}
                  placeholder="Where exactly? (e.g., near the corner)"
                  value={pickupDetails}
                  onChangeText={setPickupDetails}
                  multiline
                  numberOfLines={2}
                />
              </View>
            </View>
            <Pressable onPress={handleUseCurrentLocation} style={styles.currentLocation}>
              <Ionicons name="locate" size={20} color="#183B5C" />
            </Pressable>
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.inputIcon}>
              <Ionicons name="flag" size={20} color="#EF4444" />
            </View>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>DROPOFF LOCATION</Text>
              <Pressable onPress={() => handleSelectOnMap("dropoff")}>
                <Text style={styles.inputText} numberOfLines={2}>
                  {dropoffText || "Tap to select dropoff location"}
                </Text>
              </Pressable>

              <View style={styles.detailsContainer}>
                <TextInput
                  style={styles.detailsInput}
                  placeholder="Where exactly? (e.g., in front of Jollibee)"
                  value={dropoffDetails}
                  onChangeText={setDropoffDetails}
                  multiline
                  numberOfLines={2}
                />
              </View>
            </View>
          </View>

          {(pickup || dropoff) && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.detailsSuggestions}>
              {commonDetails.map((detail, index) => (
                <Pressable
                  key={index}
                  style={styles.detailChip}
                  onPress={() => {
                    if (pickupDetails === "" && dropoffDetails === "") {
                      setPickupDetails(detail);
                    } else if (pickupDetails !== "") {
                      setDropoffDetails(detail);
                    } else {
                      setPickupDetails(detail);
                    }
                  }}
                >
                  <Text style={styles.detailChipText}>{detail}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <View style={styles.passengerContainer}>
            <Text style={styles.passengerLabel}>Number of Passengers:</Text>
            <View style={styles.passengerControls}>
              <Pressable 
                style={[styles.passengerButton, passengerCount <= 1 && styles.passengerButtonDisabled]}
                onPress={() => handlePassengerChange(-1)}
                disabled={passengerCount <= 1}
              >
                <Ionicons name="remove" size={20} color={passengerCount <= 1 ? "#9CA3AF" : "#183B5C"} />
              </Pressable>
              
              <Text style={styles.passengerCount}>{passengerCount}</Text>
              
              <Pressable 
                style={[styles.passengerButton, passengerCount >= 6 && styles.passengerButtonDisabled]}
                onPress={() => handlePassengerChange(1)}
                disabled={passengerCount >= 6}
              >
                <Ionicons name="add" size={20} color={passengerCount >= 6 ? "#9CA3AF" : "#183B5C"} />
              </Pressable>
            </View>
            <Text style={styles.passengerNote}>Maximum of 6 passengers</Text>
          </View>

          {recentLocations.length > 0 && (
            <View style={styles.recentContainer}>
              <Text style={styles.recentTitle}>Recent Locations</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {recentLocations.map((recent) => (
                  <Pressable
                    key={recent.id}
                    style={styles.recentItem}
                    onPress={() => handleSelectRecent(recent)}
                  >
                    <Ionicons 
                      name={recent.type === "pickup" ? "location" : "flag"} 
                      size={16} 
                      color={recent.type === "pickup" ? "#10B981" : "#EF4444"} 
                    />
                    <Text style={styles.recentText} numberOfLines={1}>
                      {recent.details || "Recent"}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {pickup && dropoff && estimatedDistance && (
            <View style={styles.tripSummary}>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Ionicons name="map-outline" size={16} color="#666" />
                  <Text style={styles.summaryLabel}>Distance</Text>
                  <Text style={styles.summaryValue}>{estimatedDistance} km</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Ionicons name="time-outline" size={16} color="#666" />
                  <Text style={styles.summaryLabel}>Est. Time</Text>
                  <Text style={styles.summaryValue}>{estimatedTime} min</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Ionicons name="people-outline" size={16} color="#666" />
                  <Text style={styles.summaryLabel}>Passengers</Text>
                  <Text style={styles.summaryValue}>{passengerCount}</Text>
                </View>
              </View>
              
              <View style={styles.fareBreakdown}>
                <View style={styles.fareRow}>
                  <Text style={styles.fareBreakdownLabel}>First kilometer</Text>
                  <Text style={styles.fareBreakdownValue}>₱{fareSettings.baseFare}</Text>
                </View>
                {Math.ceil(parseFloat(estimatedDistance)) > 1 && (
                  <View style={styles.fareRow}>
                    <Text style={styles.fareBreakdownLabel}>
                      Additional {Math.ceil(parseFloat(estimatedDistance)) - 1} km (₱{fareSettings.perKmRate}/km)
                    </Text>
                    <Text style={styles.fareBreakdownValue}>
                      ₱{(Math.ceil(parseFloat(estimatedDistance)) - 1) * fareSettings.perKmRate}
                    </Text>
                  </View>
                )}
                <View style={styles.fareRow}>
                  <Text style={styles.fareBreakdownLabel}>Subtotal (per passenger)</Text>
                  <Text style={styles.fareBreakdownValue}>
                    ₱{fareSettings.baseFare + (Math.max(0, Math.ceil(parseFloat(estimatedDistance)) - 1) * fareSettings.perKmRate)}
                  </Text>
                </View>
                <View style={styles.fareRow}>
                  <Text style={styles.fareBreakdownLabel}>Passengers</Text>
                  <Text style={styles.fareBreakdownValue}>× {passengerCount}</Text>
                </View>
                <View style={styles.fareTotal}>
                  <Text style={styles.fareTotalLabel}>Total Fare</Text>
                  <Text style={styles.fareTotalValue}>₱{estimatedFare}</Text>
                </View>
              </View>
            </View>
          )}

          <View style={styles.driversInfo}>
            <Ionicons name="people-circle" size={20} color="#183B5C" />
            <Text style={styles.driversText}>
              {nearbyDrivers} drivers nearby • Real-time updates when driver accepts
            </Text>
          </View>

          <Pressable 
            style={[
              styles.bookButton,
              (!pickup || !dropoff) && styles.bookButtonDisabled
            ]}
            onPress={handleBookRide}
            disabled={!pickup || !dropoff}
          >
            <Text style={styles.bookButtonText}>Book a Ride</Text>
          </Pressable>

          <View style={styles.queueInfo}>
            <Ionicons name="information-circle" size={16} color="#666" />
            <Text style={styles.queueInfoText}>
              Drivers will be notified based on proximity and availability
            </Text>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop:-50,
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFF",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#183B5C",
  },
  mapContainer: {
    height: 300,
    width: "100%",
  },
  map: {
    flex: 1,
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
  bottomSheet: {
    flex: 1,
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
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#183B5C",
    marginBottom: 20,
  },
  inputGroup: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 15,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 10,
  },
  inputIcon: {
    width: 40,
    alignItems: "center",
    paddingTop: 8,
  },
  inputContainer: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 10,
    color: "#666",
    marginBottom: 2,
  },
  inputText: {
    fontSize: 14,
    color: "#333",
    fontWeight: "500",
  },
  currentLocation: {
    padding: 8,
    marginTop: 8,
  },
  detailsContainer: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 8,
  },
  detailsInput: {
    fontSize: 13,
    color: "#666",
    padding: 0,
    minHeight: 40,
    textAlignVertical: "top",
  },
  detailsSuggestions: {
    flexDirection: "row",
    marginBottom: 15,
    marginLeft: 40,
  },
  detailChip: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
  },
  detailChipText: {
    fontSize: 12,
    color: "#666",
  },
  passengerContainer: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
  },
  passengerLabel: {
    fontSize: 14,
    color: "#666",
    marginBottom: 10,
  },
  passengerControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  passengerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  passengerButtonDisabled: {
    backgroundColor: "#F3F4F6",
  },
  passengerCount: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#183B5C",
    minWidth: 40,
    textAlign: "center",
  },
  passengerNote: {
    fontSize: 11,
    color: "#999",
    textAlign: "center",
    marginTop: 8,
  },
  recentContainer: {
    marginBottom: 15,
  },
  recentTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
  },
  recentItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  recentText: {
    fontSize: 12,
    color: "#333",
    marginLeft: 4,
    maxWidth: 100,
  },
  tripSummary: {
    backgroundColor: "#F9FAFB",
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 15,
  },
  summaryItem: {
    alignItems: "center",
    gap: 4,
  },
  summaryLabel: {
    fontSize: 11,
    color: "#666",
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#183B5C",
  },
  fareBreakdown: {
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 15,
  },
  fareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  fareBreakdownLabel: {
    fontSize: 12,
    color: "#666",
    flex: 1,
  },
  fareBreakdownValue: {
    fontSize: 12,
    color: "#333",
    fontWeight: "500",
  },
  fareTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  fareTotalLabel: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
  },
  fareTotalValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#183B5C",
  },
  driversInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F7FF",
    padding: 12,
    borderRadius: 12,
    marginBottom: 15,
  },
  driversText: {
    marginLeft: 8,
    fontSize: 13,
    color: "#183B5C",
    flex: 1,
  },
  bookButton: {
    backgroundColor: "#183B5C",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 15,
  },
  bookButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  bookButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  queueInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  queueInfoText: {
    fontSize: 11,
    color: "#666",
    marginLeft: 6,
    textAlign: "center",
    flex: 1,
  },
  findingDriverContainer: {
    flex: 1,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  findingDriverTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#183B5C",
    marginTop: 20,
  },
  findingDriverSubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginTop: 10,
    marginBottom: 30,
  },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginBottom: 40,
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#183B5C",
    marginTop: 5,
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  cancelFindingButton: {
    paddingVertical: 12,
    paddingHorizontal: 30,
  },
  cancelFindingText: {
    color: "#EF4444",
    fontSize: 16,
    fontWeight: "600",
  },
});