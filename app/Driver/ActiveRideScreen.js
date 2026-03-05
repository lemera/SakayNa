// screens/driver/ActiveRideScreen.js
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
import { useFocusEffect } from "@react-navigation/native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import Constants from "expo-constants";

export default function ActiveRideScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  
  // Get booking data from navigation params
  const { booking: initialBooking, driverId } = route.params;
  
  const [loading, setLoading] = useState(false);
  const [activeBooking, setActiveBooking] = useState(initialBooking);
  const [commuter, setCommuter] = useState(initialBooking?.commuter);
  const [driverLocation, setDriverLocation] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [estimatedTime, setEstimatedTime] = useState(null);
  const [estimatedDistance, setEstimatedDistance] = useState(null);
  const [locationSubscription, setLocationSubscription] = useState(null);
  
  // Navigation state
  const [isNavigating, setIsNavigating] = useState(true);
  const [navigationDestination, setNavigationDestination] = useState('pickup');
  const [hasArrivedAtPickup, setHasArrivedAtPickup] = useState(false);
  const [rideStarted, setRideStarted] = useState(false);

  const googleApiKey = Constants.expoConfig?.extra?.GOOGLE_API_KEY;

  // Subscribe to real-time booking updates
  useEffect(() => {
    if (!activeBooking?.id) return;

    const bookingSubscription = supabase
      .channel(`booking-${activeBooking.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookings',
          filter: `id=eq.${activeBooking.id}`,
        },
        (payload) => {
          console.log("📅 Booking updated:", payload);
          if (payload.new) {
            setActiveBooking(payload.new);
            
            // Handle status changes
            if (payload.new.status === "cancelled") {
              Alert.alert(
                "Trip Cancelled",
                "This trip has been cancelled.",
                [{ text: "OK", onPress: () => navigation.goBack() }]
              );
            }
          }
        }
      )
      .subscribe();

    return () => {
      bookingSubscription.unsubscribe();
    };
  }, [activeBooking?.id]);

  // Start location tracking
  useEffect(() => {
    startLocationTracking();
    
    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, []);

  // Calculate initial route
  useEffect(() => {
    if (driverLocation && activeBooking) {
      calculateRouteToPickup(driverLocation, {
        latitude: activeBooking.pickup_latitude,
        longitude: activeBooking.pickup_longitude
      });
    }
  }, [driverLocation]);

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
      
      // Update driver location in database
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

          // Recalculate route based on current navigation state
          if (isNavigating) {
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

  const updateDriverLocation = async (coords) => {
    try {
      if (!driverId) return;
      
      // Check if a record exists
      const { data: existingLocation } = await supabase
        .from("driver_locations")
        .select("id")
        .eq("driver_id", driverId)
        .maybeSingle();

      if (existingLocation) {
        await supabase
          .from("driver_locations")
          .update({
            latitude: coords.latitude,
            longitude: coords.longitude,
            is_online: true,
            last_updated: new Date(),
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
          });
      }
    } catch (err) {
      console.log("❌ Error updating location:", err);
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
        
        // Fit map to show entire route
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
        
        // Fit map to show entire route
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
              
              // Update booking with arrival time
              const { error } = await supabase
                .from("bookings")
                .update({ 
                  driver_arrived_at: new Date(),
                  updated_at: new Date()
                })
                .eq("id", activeBooking.id);

              if (error) throw error;

              // Send notification to commuter
              await supabase
                .from("booking_updates")
                .insert({
                  booking_id: activeBooking.id,
                  type: "driver_arrived",
                  message: "Driver has arrived at pickup location",
                  created_at: new Date()
                });

              // Update local state
              setHasArrivedAtPickup(true);
              setNavigationDestination('dropoff');
              setRideStarted(true);
              
              // Switch to route to dropoff
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

  const handleCompleteTrip = async () => {
    Alert.alert(
      "Complete Trip",
      "Have you reached the destination and dropped off the passenger?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Complete",
          onPress: async () => {
            try {
              setLoading(true);
              
              const { error } = await supabase
                .from("bookings")
                .update({ 
                  status: "completed",
                  ride_completed_at: new Date(),
                  updated_at: new Date()
                })
                .eq("id", activeBooking.id);

              if (error) throw error;

              Alert.alert(
                "🎉 Trip Completed!",
                "You have successfully completed the trip. Thank you for driving!",
                [
                  { 
                    text: "OK", 
                    onPress: () => navigation.navigate("DriverEarnings", { 
                      bookingId: activeBooking.id,
                      fare: activeBooking.fare 
                    }) 
                  }
                ]
              );
            } catch (err) {
              console.log("❌ Error completing trip:", err);
              Alert.alert("Error", "Failed to complete trip");
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleCancelTrip = () => {
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

              Alert.alert(
                "❌ Trip Cancelled",
                "The trip has been cancelled.",
                [{ text: "OK", onPress: () => navigation.goBack() }]
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
    if (!hasArrivedAtPickup) {
      return "🚗 Heading to Pickup";
    } else if (hasArrivedAtPickup && !rideStarted) {
      return "📍 Waiting for Passenger";
    } else {
      return "🚗 On the way to Destination";
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.headerSubtitle}>Active Ride</Text>
          <Text style={styles.headerTitle}>{getStatusText()}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: "#3B82F620" }]}>
          <Text style={[styles.statusText, { color: "#3B82F6" }]}>ACCEPTED</Text>
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

        {/* Navigation Instruction */}
        {isNavigating && (
          <View style={styles.navigationInstruction}>
            <Ionicons name="navigate" size={20} color="#FFF" />
            <Text style={styles.navigationInstructionText}>
              {getNavigationInstruction()} • {estimatedDistance} km • {estimatedTime} min
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
          {!hasArrivedAtPickup && (
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

        {!hasArrivedAtPickup && (
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

        {hasArrivedAtPickup && (
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
});