import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";

import { screenStyles } from "../styles/ScreenStyles";
import DropoffMapScreen from "./DropoffMapScreen";

import {
  calculateDistance,
  calculateFare,
  reverseGeocode,
  searchDropoffLocation,
  getRoutePolyline,
  getAddressDetails,
  formatAreaFromComponents,
  formatFullAddress,
  getNearbyPlaceName,
  parseDistanceTextToKm,
} from "./utils/locationUtils";

export default function HomeScreen({ navigation }) {
  const [location, setLocation] = useState(null);
  const [pickup, setPickup] = useState("");
  const [pickupCoords, setPickupCoords] = useState(null);
  const [dropoff, setDropoff] = useState("");
  const [dropoffCoords, setDropoffCoords] = useState(null);
  const [isOnRide, setIsOnRide] = useState(false);
  const [kilometers, setKilometers] = useState(0);
  const [showDropoffMap, setShowDropoffMap] = useState(false);
  const [dropoffMarker, setDropoffMarker] = useState(null);
  const [routePolyline, setRoutePolyline] = useState([]);
  const [isMinimized, setIsMinimized] = useState(false);

  const mapRef = useRef(null);

  // Calculate bounding region for polyline coordinates
  const calculateRegionForCoordinates = (coordinates) => {
    if (!coordinates || coordinates.length === 0) return null;

    let minLat = coordinates[0].latitude;
    let maxLat = coordinates[0].latitude;
    let minLng = coordinates[0].longitude;
    let maxLng = coordinates[0].longitude;

    coordinates.forEach((coord) => {
      minLat = Math.min(minLat, coord.latitude);
      maxLat = Math.max(maxLat, coord.latitude);
      minLng = Math.min(minLng, coord.longitude);
      maxLng = Math.max(maxLng, coord.longitude);
    });

    const latDelta = maxLat - minLat;
    const lngDelta = maxLng - minLng;

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: latDelta * 1.3, // Add 30% padding
      longitudeDelta: lngDelta * 1.3,
    };
  };

  // Simulate camera tracking along the polyline (like Google Maps)
  const startCameraTracking = (coordinates) => {
    if (!coordinates || coordinates.length < 2) return;

    let pointIndex = 0;
    const trackingInterval = setInterval(() => {
      if (pointIndex < coordinates.length) {
        const currentPoint = coordinates[pointIndex];
        const nextPoint =
          coordinates[Math.min(pointIndex + 5, coordinates.length - 1)];

        // Calculate heading/direction towards next point
        const deltaLat = nextPoint.latitude - currentPoint.latitude;
        const deltaLng = nextPoint.longitude - currentPoint.longitude;

        // Animate to current point with zoom
        mapRef.current?.animateToRegion(
          {
            latitude: currentPoint.latitude,
            longitude: currentPoint.longitude,
            latitudeDelta: 0.008, // Higher zoom level for tracking view
            longitudeDelta: 0.008,
          },
          800,
        );

        pointIndex += 5;
      } else {
        clearInterval(trackingInterval);
      }
    }, 1000);
  };

  // Auto-detect location
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission denied", "Location permission is required.");
        return;
      }

      let loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);
      // Resolve a readable pickup address (prefer component-based full address)
      try {
        const details = await getAddressDetails(loc.coords.latitude, loc.coords.longitude);
        if (details) {
          const compFull = formatFullAddress(details.components, details.formatted_address);
          if (compFull && compFull !== "Unknown location") {
            setPickup(compFull);
          } else if (details.formatted_address) {
            setPickup(details.formatted_address);
          } else {
            // try nearby place
            try {
              const nearby = await getNearbyPlaceName(loc.coords.latitude, loc.coords.longitude);
              if (nearby) setPickup(nearby);
              else setPickup("Current Location");
            } catch {
              setPickup("Current Location");
            }
          }
        } else {
          setPickup("Current Location");
        }
      } catch (e) {
        setPickup("Current Location");
      }
      setPickupCoords({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
    })();
  }, []);

  // Auto-calculate distance and fetch route
  useEffect(() => {
    if (pickupCoords && dropoffCoords) {
      // Fetch actual road route from Google Directions API and derive distance from the route
      const fetchRoute = async () => {
        console.log("Fetching route...");
        const route = await getRoutePolyline(
          pickupCoords.latitude,
          pickupCoords.longitude,
          dropoffCoords.latitude,
          dropoffCoords.longitude,
        );
        console.log("Route result:", route);
        if (route.success && route.polylinePoints.length > 0) {
          console.log(
            "Setting route polyline with",
            route.polylinePoints.length,
            "points",
          );
          setRoutePolyline(route.polylinePoints);

          // Parse distance text from Directions API (e.g., "12.3 km" or "900 m")
          const kmFromRoute = parseDistanceTextToKm(route.distance);
          if (kmFromRoute !== null) {
            setKilometers(parseFloat(kmFromRoute.toFixed(2)));
          } else {
            // Fallback to haversine if Directions distance missing
            const distance = calculateDistance(
              pickupCoords.latitude,
              pickupCoords.longitude,
              dropoffCoords.latitude,
              dropoffCoords.longitude,
            );
            setKilometers(parseFloat(distance.toFixed(2)));
          }

          // Animate camera to fit the entire route
          const region = calculateRegionForCoordinates(route.polylinePoints);
          if (region && mapRef.current) {
            mapRef.current.animateToRegion(region, 1500);
          }
        } else {
          console.log("Route fetch failed or no polyline points");
        }
      };
      fetchRoute();
    }
  }, [pickupCoords, dropoffCoords]);

  // Swap pickup and drop-off
  const handleSwap = () => {
    const tempPickup = pickup;
    setPickup(dropoff);
    setDropoff(tempPickup);

    const tempCoords = pickupCoords;
    setPickupCoords(dropoffCoords);
    setDropoffCoords(tempCoords);
  };

  // Confirm drop-off from map modal
  const handleConfirmDropoffLocation = (locationName, coords) => {
    setDropoff(locationName);
    setDropoffCoords(coords);
    setShowDropoffMap(false);
  };

  if (!location) return null;

  const handleSelectDriver = () => {
    if (!pickupCoords || !dropoffCoords) {
      Alert.alert(
        "Incomplete Information",
        "You must select both pickup and drop-off locations before selecting a driver.",
      );
      return;
    }

    navigation.navigate("SelectDriverScreen", {
      pickup,
      dropoff,
      kilometers,
      totalPrice: calculateFare(kilometers),
      pickupLocation: pickupCoords,
      dropoffLocation: dropoffCoords,
    });
  };
  // Helpers
const handleUseCurrentLocation = async () => {
  try {
    const loc = await Location.getCurrentPositionAsync({});
    const { latitude, longitude } = loc.coords;

    let pickupName = null;
    try {
      const details = await getAddressDetails(latitude, longitude);
      if (details) {
        pickupName = formatFullAddress(details.components, details.formatted_address) || details.formatted_address;
      }
    } catch (e) {
      console.log("Address details parse error:", e);
    }

    if (!pickupName) {
      try {
        const nearby = await getNearbyPlaceName(latitude, longitude);
        if (nearby) pickupName = nearby;
      } catch (e) {
        /* ignore */
      }
    }

    if (!pickupName) {
      pickupName = await reverseGeocode(latitude, longitude);
    }

    setPickupCoords({ latitude, longitude });
    setPickup(pickupName);

    mapRef.current?.animateToRegion(
      { latitude, longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 },
      500
    );
  } catch (error) {
    console.log("Location error:", error);
  }
};

  const handleSearchDropoff = () => {
    if (!dropoff) return;

    searchDropoffLocation(dropoff, mapRef, setDropoffCoords, setDropoff);
  };

  const isLocationComplete = pickupCoords && dropoffCoords;
  return (
    <KeyboardAvoidingView
      style={screenStyles.screenContainer}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Map */}
      <View style={screenStyles.map}>
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          initialRegion={{
            latitude: location.latitude,
            longitude: location.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          showsUserLocation={true}
          zoomControlEnabled={true}
        >
          {pickupCoords && (
            <Marker
              coordinate={pickupCoords}
              title={pickup || "Pickup Location"}
              description={pickup}
              pinColor="green"
            />
          )}

          {dropoffCoords && (
            <Marker
              coordinate={dropoffCoords}
              title={dropoff || "Dropoff Location"}
              description={dropoff}
              pinColor="red"
            />
          )}

          {pickupCoords &&
            dropoffCoords &&
            (routePolyline.length > 0 ? (
              <Polyline
                coordinates={routePolyline}
                strokeColor="#007AFF"
                strokeWidth={4}
              />
            ) : (
              <Polyline
                coordinates={[pickupCoords, dropoffCoords]}
                strokeColor="#999999"
                strokeWidth={2}
                lineDashPattern={[5, 5]}
              />
            ))}
        </MapView>

        {/* Camera Tracking Buttons */}
        {routePolyline.length > 0 && (
          <View
            style={{
              position: "absolute",
              bottom: 40, // 👈 distance from bottom
              right: 20,
              alignItems: "center",
            }}
          >
            {/* Start Tracking */}
            <TouchableOpacity
              style={{
                backgroundColor: "#007AFF",
                width: 55,
                height: 55,
                borderRadius: 27.5,
                justifyContent: "center",
                alignItems: "center",
                elevation: 6,
                shadowColor: "#000",
                shadowOpacity: 0.3,
                shadowRadius: 4,
                marginBottom: 15, // 👈 space between buttons
              }}
              onPress={() => startCameraTracking(routePolyline)}
            >
              <Ionicons name="navigate" size={24} color="#FFF" />
            </TouchableOpacity>

            {/* Fit Route */}
            <TouchableOpacity
              style={{
                backgroundColor: "#183B5C",
                width: 55,
                height: 55,
                borderRadius: 27.5,
                justifyContent: "center",
                alignItems: "center",
                elevation: 6,
                shadowColor: "#000",
                shadowOpacity: 0.3,
                shadowRadius: 4,
              }}
              onPress={() => {
                const region = calculateRegionForCoordinates(routePolyline);
                if (region && mapRef.current) {
                  mapRef.current.animateToRegion(region, 1500);
                }
              }}
            >
              <Ionicons name="contract" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Blur Card handleUseCurrentLocation  */}
      <BlurView
        intensity={90}
        tint="light"
        style={[
          screenStyles.locationContainer,
          isMinimized && screenStyles.minimizedContainer,
        ]}
      >
        {/* Left-side minimize/expand circle */}
        <TouchableOpacity
          onPress={() => setIsMinimized((prev) => !prev)}
          style={{
            position: "absolute",
            left: 12,
            top: 12,
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: "rgba(255,255,255,0.9)",
            justifyContent: "center",
            alignItems: "center",
            elevation: 3,
            shadowColor: "#000",
            shadowOpacity: 0.15,
            shadowRadius: 2,
          }}
          accessibilityLabel={isMinimized ? "Expand" : "Minimize"}
        >
          <Ionicons
            name={isMinimized ? "chevron-up" : "chevron-down"}
            size={20}
            color="#183B5C"
          />
        </TouchableOpacity>
        {/* Header / Minimized compact view */}
        {isMinimized ? (
          <TouchableOpacity
            onPress={() => setIsMinimized(false)}
            style={{ paddingLeft: 60, paddingVertical: 12 }}
            accessibilityLabel="Expand"
          >
            <Text style={screenStyles.locationTitle}>Where to?</Text>
          </TouchableOpacity>
        ) : (
          <>
            <View style={[screenStyles.titleContainer, { paddingLeft: 60 }]}>
              <Text style={screenStyles.locationTitle}>Where to?</Text>

              <View style={screenStyles.headerActions}>
                <TouchableOpacity
                  onPress={handleSwap}
                  style={screenStyles.swapButton}
                  disabled={!pickup || !dropoff}
                >
                  <Ionicons
                    name="swap-vertical"
                    size={20}
                    color={pickup && dropoff ? "#183B5C" : "#CCC"}
                  />
                </TouchableOpacity>
              </View>

              {isOnRide && (
                <View style={screenStyles.rideIndicatorContainer}>
                  <View style={screenStyles.rideIndicatorDot} />
                  <Text style={screenStyles.rideIndicatorText}>On Ride</Text>
                </View>
              )}
            </View>
            {/* Pickup */}
            <View style={screenStyles.inputRow}>
              <Ionicons name="location" size={20} color="#E97A3E" />

              <TextInput
                placeholder="Enter Pickup Location"
                placeholderTextColor="#999"
                style={screenStyles.input}
                value={pickup}
                onChangeText={setPickup}
              />

              <TouchableOpacity
                style={screenStyles.iconButton}
                onPress={handleUseCurrentLocation}
              >
                <Ionicons name="map" size={24} color="#183B5C" />
              </TouchableOpacity>
            </View>

            <View style={screenStyles.divider} />

            {/* Drop-off */}
            <View style={screenStyles.inputRow}>
              <Ionicons name="flag" size={20} color="#183B5C" />

              <TextInput
                placeholder="Enter Drop-off Location"
                placeholderTextColor="#999"
                style={screenStyles.input}
                value={dropoff}
                onChangeText={setDropoff}
                onSubmitEditing={handleSearchDropoff}
              />

              <TouchableOpacity
                style={screenStyles.iconButton}
                onPress={() => setShowDropoffMap(true)}
              >
                <Ionicons name="map" size={24} color="#183B5C" />
              </TouchableOpacity>
            </View>

            <View style={screenStyles.divider} />

            {/* Distance & Price */}
            <View style={screenStyles.distancePriceRow}>
              <View>
                <Text style={screenStyles.inputLabel}>Distance (km)</Text>
                <Text style={screenStyles.kmInput}>
                  {kilometers.toFixed(2)}
                </Text>
              </View>

              <View>
                <Text style={screenStyles.priceLabel}>Total Price</Text>
                <Text style={screenStyles.priceValue}>
                  ₱{calculateFare(kilometers).toFixed(2)}
                </Text>
              </View>
            </View>

            {/* Select Driver */}
            <TouchableOpacity
              style={[
                screenStyles.selectDriverButton,
                !isLocationComplete && screenStyles.disabledButton,
              ]}
              onPress={handleSelectDriver}
              disabled={!isLocationComplete}
            >
              <Ionicons name="car-sport" size={20} color="#FFF" />
              <Text style={screenStyles.selectDriverButtonText}>
                Select Driver
              </Text>
            </TouchableOpacity>
          </>
        )}
      </BlurView>

      {/* Drop-off Map Modal */}
      <DropoffMapScreen
        visible={showDropoffMap}
        dropoffMarker={dropoffMarker}
        setDropoffMarker={setDropoffMarker}
        onConfirm={handleConfirmDropoffLocation}
        onCancel={() => setShowDropoffMap(false)}
        location={location}
      />
    </KeyboardAvoidingView>
  );
}
