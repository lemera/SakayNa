import React, { useState, useEffect, useRef } from "react";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import Constants from "expo-constants";

export default function DriverTrackRideScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
  const [showRequests, setShowRequests] = useState(false);

  // Get Google API Key
  const googleApiKey = Constants.expoConfig?.extra?.GOOGLE_API_KEY;

  // Fare calculation (₱15 per km, minimum ₱15)
  const calculateFare = (distanceKm) => {
    const baseFare = 15;
    if (!distanceKm || distanceKm <= 1) return baseFare;
    return Math.ceil(distanceKm) * baseFare;
  };

  // Fetch driver ID and all data
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

  // Subscribe to real-time updates
  useEffect(() => {
    if (!driverId) return;

    const subscription = supabase
      .channel('driver-all-bookings')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `driver_id=eq.${driverId}`,
        },
        () => {
          // Refresh both active and pending
          fetchActiveBooking(driverId);
          fetchPendingRequests(driverId);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [driverId]);

  // Fetch pending requests
  const fetchPendingRequests = async (id) => {
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          *,
          commuter:commuters (
            first_name,
            last_name,
            phone,
            profile_picture
          )
        `)
        .eq("driver_id", id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPendingRequests(data || []);
    } catch (err) {
      console.log("❌ Error fetching pending requests:", err);
    }
  };

  // Fetch active booking
  const fetchActiveBooking = async (id) => {
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          `
          *,
          commuter:commuters (
            id,
            first_name,
            last_name,
            phone,
            email,
            profile_picture
          )
        `
        )
        .eq("driver_id", id)
        .eq("status", "accepted")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        setActiveBooking(data);
        setCommuter(data.commuter);
        setBookingStatus(data.status);
        setShowRequests(false); // Hide requests when there's an active ride

        if (data.pickup_latitude && data.pickup_longitude && 
            data.dropoff_latitude && data.dropoff_longitude) {
          calculateRouteWithGoogle(
            { latitude: data.pickup_latitude, longitude: data.pickup_longitude },
            { latitude: data.dropoff_latitude, longitude: data.dropoff_longitude }
          );
        }
      } else {
        setActiveBooking(null);
        setCommuter(null);
        setShowRequests(true); // Show requests when no active ride
      }
    } catch (err) {
      console.log("❌ Error fetching booking:", err);
    } finally {
      setLoading(false);
    }
  };

  // Accept booking
  const handleAcceptRequest = async (bookingId) => {
    Alert.alert(
      "Accept Booking",
      "Are you sure you want to accept this booking?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Accept",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("bookings")
                .update({ 
                  status: "accepted",
                  updated_at: new Date()
                })
                .eq("id", bookingId);

              if (error) throw error;
              
              Alert.alert("Success", "Booking accepted!");
              // Refresh data
              await fetchActiveBooking(driverId);
              await fetchPendingRequests(driverId);
            } catch (err) {
              Alert.alert("Error", "Failed to accept booking");
            }
          }
        }
      ]
    );
  };

  // Decline booking
  const handleDeclineRequest = async (bookingId) => {
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
                .from("bookings")
                .update({ 
                  status: "cancelled",
                  cancellation_reason: "Declined by driver",
                  cancelled_by: "driver",
                  updated_at: new Date()
                })
                .eq("id", bookingId);

              if (error) throw error;
              
              Alert.alert("Success", "Booking declined");
              await fetchPendingRequests(driverId);
            } catch (err) {
              Alert.alert("Error", "Failed to decline booking");
            }
          }
        }
      ]
    );
  };

  // Format time for requests
  const formatRequestTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffMinutes < 1) return "Just now";
    if (diffMinutes < 60) return `${diffMinutes} min ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} hours ago`;
    return date.toLocaleDateString();
  };

  // ... (keep all your existing functions: startLocationTracking, updateDriverLocation, 
  // calculateRouteWithGoogle, calculateRouteWithOSRM, decodePolyline, 
  // handleBookingUpdate, updateBookingStatus, handleCompleteTrip, 
  // handleCancelTrip, openMaps, callCommuter, messageCommuter, fitMapToMarkers,
  // getStatusColor, getStatusText)

  // I'll paste the rest of the functions here but keep them the same as your original code
  // ... [Your existing functions remain exactly the same]

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

      setDriverLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        (newLocation) => {
          setDriverLocation({
            latitude: newLocation.coords.latitude,
            longitude: newLocation.coords.longitude,
          });
          updateDriverLocation(newLocation.coords);
        }
      );

      setLocationSubscription(subscription);
    } catch (err) {
      console.log("❌ Location tracking error:", err);
    }
  };

  const updateDriverLocation = async (coords) => {
    try {
      if (!driverId || !activeBooking?.id) return;
      await supabase.from("driver_locations").upsert({
        driver_id: driverId,
        latitude: coords.latitude,
        longitude: coords.longitude,
        updated_at: new Date(),
        booking_id: activeBooking.id,
      });
    } catch (err) {
      console.log("❌ Error updating location:", err);
    }
  };

  const calculateRouteWithGoogle = async (startCoords, endCoords) => {
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
        
        const calculatedFare = calculateFare(distanceKm);
        if (activeBooking?.id) {
          await supabase
            .from("bookings")
            .update({ 
              fare: calculatedFare,
              distance_km: distanceKm,
              duration_minutes: timeMins
            })
            .eq("id", activeBooking.id);
            
          setActiveBooking(prev => ({
            ...prev,
            fare: calculatedFare,
            distance_km: distanceKm,
            duration_minutes: timeMins
          }));
        }
      } else {
        calculateRouteWithOSRM(startCoords, endCoords);
      }
    } catch (err) {
      calculateRouteWithOSRM(startCoords, endCoords);
    }
  };

  const calculateRouteWithOSRM = async (startCoords, endCoords) => {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${startCoords.longitude},${startCoords.latitude};${endCoords.longitude},${endCoords.latitude}?overview=full&geometries=geojson`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.routes?.[0]) {
        const route = data.routes[0];
        const coordinates = route.geometry.coordinates.map(coord => ({
          latitude: coord[1],
          longitude: coord[0],
        }));

        setRouteCoordinates(coordinates);
        
        const distanceKm = route.distance / 1000;
        const timeMins = Math.round(route.duration / 60);
        
        setEstimatedDistance(distanceKm.toFixed(1));
        setEstimatedTime(timeMins);
        
        const calculatedFare = calculateFare(distanceKm);
        if (activeBooking?.id) {
          await supabase
            .from("bookings")
            .update({ 
              fare: calculatedFare,
              distance_km: distanceKm,
              duration_minutes: timeMins
            })
            .eq("id", activeBooking.id);
            
          setActiveBooking(prev => ({
            ...prev,
            fare: calculatedFare,
            distance_km: distanceKm,
            duration_minutes: timeMins
          }));
        }
      }
    } catch (err) {
      console.log("❌ Route calculation error:", err);
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

  const handleBookingUpdate = (updatedBooking) => {
    setActiveBooking(updatedBooking);
    setBookingStatus(updatedBooking.status);
  };

  const updateBookingStatus = async (newStatus) => {
    if (!activeBooking) {
      Alert.alert("Error", "No active booking found");
      return;
    }

    if (newStatus === "cancelled" && bookingStatus === "completed") {
      Alert.alert("Cannot Cancel", "This trip is already completed");
      return;
    }

    if (["completed", "cancelled"].includes(bookingStatus)) {
      Alert.alert("Cannot Update", "This trip is already finished");
      return;
    }

    try {
      const updates = {
        status: newStatus,
        updated_at: new Date(),
      };

      switch (newStatus) {
        case "completed":
          updates.ride_completed_at = new Date();
          updates.actual_fare = activeBooking.fare;
          updates.payment_status = "paid";
          break;
        case "cancelled":
          updates.cancelled_at = new Date();
          updates.cancellation_reason = "Cancelled by driver";
          updates.cancelled_by = "driver";
          break;
      }

      const { error } = await supabase
        .from("bookings")
        .update(updates)
        .eq("id", activeBooking.id);

      if (error) throw error;

      setBookingStatus(newStatus);

      if (newStatus === "completed") {
        Alert.alert(
          "🎉 Trip Completed!",
          "You have successfully completed the trip. Thank you for driving!",
          [{ text: "OK", onPress: () => navigation.goBack() }]
        );
      } else if (newStatus === "cancelled") {
        Alert.alert(
          "❌ Trip Cancelled",
          "The trip has been cancelled.",
          [{ text: "OK", onPress: () => navigation.goBack() }]
        );
      }
    } catch (err) {
      console.log("❌ Error updating status:", err);
      Alert.alert("Error", "Failed to update trip status");
    }
  };

  const handleCompleteTrip = () => {
    if (bookingStatus !== "accepted") {
      Alert.alert("Cannot Complete", "This trip cannot be completed at this stage");
      return;
    }

    Alert.alert(
      "Complete Trip",
      "Have you reached the destination?",
      [
        { text: "No", style: "cancel" },
        { 
          text: "Yes, Complete", 
          onPress: () => updateBookingStatus("completed") 
        },
      ]
    );
  };

  const handleCancelTrip = () => {
    if (bookingStatus !== "accepted") {
      Alert.alert("Cannot Cancel", "This trip cannot be cancelled at this stage");
      return;
    }

    Alert.alert(
      "Cancel Trip",
      "Are you sure you want to cancel this trip?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: () => updateBookingStatus("cancelled"),
        },
      ]
    );
  };

  const openMaps = (lat, lng, label) => {
    const scheme = Platform.select({
      ios: `maps://?q=${label}&ll=${lat},${lng}`,
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

  const getStatusColor = (status) => {
    switch (status) {
      case "accepted": return "#3B82F6";
      case "completed": return "#10B981";
      case "cancelled": return "#EF4444";
      default: return "#6B7280";
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case "accepted": return "🚗 Heading to Pickup";
      case "completed": return "✅ Trip Completed";
      case "cancelled": return "❌ Trip Cancelled";
      default: return "Unknown";
    }
  };

  const canCancel = bookingStatus === "accepted";
  const canComplete = bookingStatus === "accepted";

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
      </View>
    );
  }

  // SHOW PENDING REQUESTS IF NO ACTIVE RIDE
  if (!activeBooking && pendingRequests.length > 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#183B5C" />
          </Pressable>
          <Text style={styles.headerTitle}>Booking Requests ({pendingRequests.length})</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {pendingRequests.map((request) => (
            <View key={request.id} style={styles.requestCard}>
              {/* Header with time */}
              <View style={styles.cardHeader}>
                <View style={styles.timeBadge}>
                  <Ionicons name="time-outline" size={14} color="#FFB37A" />
                  <Text style={styles.timeText}>{formatRequestTime(request.created_at)}</Text>
                </View>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>PENDING</Text>
                </View>
              </View>

              {/* Commuter Info */}
              <View style={styles.commuterSection}>
                <View style={styles.commuterAvatar}>
                  {request.commuter?.profile_picture ? (
                    <Image 
                      source={{ uri: request.commuter.profile_picture }} 
                      style={styles.commuterImage} 
                    />
                  ) : (
                    <Ionicons name="person" size={30} color="#9CA3AF" />
                  )}
                </View>
                <View style={styles.commuterInfo}>
                  <Text style={styles.commuterName}>
                    {request.commuter?.first_name} {request.commuter?.last_name}
                  </Text>
                  <Text style={styles.commuterPhone}>{request.commuter?.phone || "No phone"}</Text>
                </View>
              </View>

              {/* Trip Details */}
              <View style={styles.tripDetails}>
                <View style={styles.locationRow}>
                  <View style={styles.locationIcon}>
                    <Ionicons name="location" size={16} color="#10B981" />
                  </View>
                  <View style={styles.locationTextContainer}>
                    <Text style={styles.locationLabel}>PICKUP</Text>
                    <Text style={styles.locationAddress}>{request.pickup_location}</Text>
                  </View>
                </View>

                <View style={styles.locationRow}>
                  <View style={styles.locationIcon}>
                    <Ionicons name="flag" size={16} color="#EF4444" />
                  </View>
                  <View style={styles.locationTextContainer}>
                    <Text style={styles.locationLabel}>DROPOFF</Text>
                    <Text style={styles.locationAddress}>{request.dropoff_location}</Text>
                  </View>
                </View>
              </View>

              {/* Fare */}
              <View style={styles.fareContainer}>
                <Text style={styles.fareLabel}>Estimated Fare</Text>
                <Text style={styles.fareAmount}>₱{request.fare?.toFixed(2) || "0.00"}</Text>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionButtons}>
                <Pressable 
                  style={styles.declineButton}
                  onPress={() => handleDeclineRequest(request.id)}
                >
                  <Ionicons name="close-circle" size={20} color="#EF4444" />
                  <Text style={styles.declineButtonText}>Decline</Text>
                </Pressable>

                <Pressable 
                  style={styles.acceptButton}
                  onPress={() => handleAcceptRequest(request.id)}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                  <Text style={styles.acceptButtonText}>Accept</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  // SHOW NO RIDES MESSAGE IF NO ACTIVE AND NO REQUESTS
  if (!activeBooking && pendingRequests.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F7FA" }}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#183B5C" />
          </Pressable>
          <Text style={styles.headerTitle}>Track Ride</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="bicycle-outline" size={80} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>No Active Ride</Text>
          <Text style={styles.emptyText}>You don't have any ongoing rides at the moment.</Text>
          <Pressable style={styles.goBackButton} onPress={() => navigation.goBack()}>
            <Text style={styles.goBackText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // SHOW ACTIVE RIDE (your existing UI)
  return (
    <View style={{ flex: 1, backgroundColor: "#F5F7FA" }}>
      {/* Header with request count badge */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.headerSubtitle}>Active Ride</Text>
          <Text style={styles.headerTitle}>{getStatusText(bookingStatus)}</Text>
        </View>
        {pendingRequests.length > 0 && (
          <Pressable 
            style={styles.requestBadge}
            onPress={() => setShowRequests(!showRequests)}
          >
            <Text style={styles.requestBadgeText}>{pendingRequests.length}</Text>
          </Pressable>
        )}
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(bookingStatus) + "20" }]}>
          <Text style={[styles.statusText, { color: getStatusColor(bookingStatus) }]}>
            {bookingStatus.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Map (your existing map) */}
      <View style={{ flex: 1 }}>
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
            <Marker coordinate={{
              latitude: activeBooking.pickup_latitude,
              longitude: activeBooking.pickup_longitude,
            }} title="Pickup">
              <View style={styles.pickupMarker}>
                <Ionicons name="location" size={16} color="#FFF" />
              </View>
            </Marker>
          )}

          {activeBooking.dropoff_latitude && (
            <Marker coordinate={{
              latitude: activeBooking.dropoff_latitude,
              longitude: activeBooking.dropoff_longitude,
            }} title="Dropoff">
              <View style={styles.dropoffMarker}>
                <Ionicons name="flag" size={16} color="#FFF" />
              </View>
            </Marker>
          )}

          {driverLocation && (
            <Marker coordinate={driverLocation} title="You" flat>
              <View style={styles.driverMarker}>
                <Ionicons name="bicycle" size={16} color="#FFF" />
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
      </View>

      {/* Bottom Sheet (your existing bottom sheet) */}
      <View style={styles.bottomSheet}>
        {/* Commuter Info */}
        <View style={styles.commuterContainer}>
          <View style={styles.commuterAvatar}>
            {commuter?.profile_picture ? (
              <Image source={{ uri: commuter.profile_picture }} style={styles.commuterImage} />
            ) : (
              <Ionicons name="person" size={30} color="#9CA3AF" />
            )}
          </View>
          <View style={styles.commuterInfo}>
            <Text style={styles.commuterName}>
              {commuter?.first_name} {commuter?.last_name}
            </Text>
            <Text style={styles.commuterLabel}>Passenger</Text>
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

        {/* Locations */}
        <View style={styles.locationsContainer}>
          <View style={styles.locationRow}>
            <Ionicons name="location" size={16} color="#10B981" />
            <Text style={styles.locationText} numberOfLines={1}>
              {activeBooking.pickup_location}
            </Text>
          </View>
          <View style={styles.locationRow}>
            <Ionicons name="flag" size={16} color="#EF4444" />
            <Text style={styles.locationText} numberOfLines={1}>
              {activeBooking.dropoff_location}
            </Text>
          </View>
        </View>

        {/* Trip Stats */}
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

        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          {canComplete && (
            <Pressable style={styles.completeButton} onPress={handleCompleteTrip}>
              <Text style={styles.completeButtonText}>Complete Trip</Text>
            </Pressable>
          )}

          {canCancel && (
            <Pressable style={styles.cancelButton} onPress={handleCancelTrip}>
              <Ionicons name="close-circle" size={20} color="#EF4444" />
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          )}

          {!canCancel && !canComplete && (
            <View style={styles.disabledMessage}>
              <Text style={styles.disabledText}>
                {bookingStatus === "completed" ? "Trip Completed" : "Trip Cancelled"}
              </Text>
            </View>
          )}
        </View>

        {/* Navigation Button */}
        {bookingStatus === "accepted" && (
          <Pressable
            style={styles.navigationButton}
            onPress={() => openMaps(
              activeBooking.pickup_latitude,
              activeBooking.pickup_longitude,
              "Pickup Location"
            )}
          >
            <Ionicons name="map" size={20} color="#183B5C" />
            <Text style={styles.navigationButtonText}>Open in Maps</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// Add new styles for requests
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
    paddingTop: 60,
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
    fontSize: 16,
    color: "#FFB37A",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFF",
  },
  requestBadge: {
    backgroundColor: "#FF3B30",
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  requestBadgeText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "bold",
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    fontWeight: "600",
    fontSize: 12,
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
  completeButton: {
    flex: 2,
    backgroundColor: "#10B981",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  completeButtonText: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 16,
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
  disabledMessage: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  disabledText: {
    color: "#666",
    fontWeight: "600",
  },
  navigationButton: {
    backgroundColor: "#F3F4F6",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  navigationButtonText: {
    color: "#183B5C",
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginTop: 20,
  },
  emptyText: {
    fontSize: 14,
    color: "#666",
    marginTop: 10,
    textAlign: "center",
  },
  goBackButton: {
    backgroundColor: "#183B5C",
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 20,
  },
  goBackText: {
    color: "#FFF",
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
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
    marginRight: 8,
  },
  locationTextContainer: {
    flex: 1,
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
    fontSize: 18,
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
});