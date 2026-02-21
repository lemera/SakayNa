import React, { useState, useEffect, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, Dimensions } from "react-native";
import MapView, { Marker, UrlTile, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { screenStyles } from "../styles/ScreenStyles";
import { mapStyles } from "../styles/MapStyles";
import DropoffMapScreen from "./DropoffMapScreen";

const { width, height } = Dimensions.get("window");

export default function HomeScreen() {
  const [location, setLocation] = useState(null);
  const [pickup, setPickup] = useState("");
  const [pickupCoords, setPickupCoords] = useState(null);
  const [dropoff, setDropoff] = useState("");
  const [dropoffCoords, setDropoffCoords] = useState(null);
  const [isOnRide, setIsOnRide] = useState(false);
  const [kilometers, setKilometers] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showDropoffMap, setShowDropoffMap] = useState(false);
  const [dropoffMarker, setDropoffMarker] = useState(null);

  const mapRef = useRef(null);

  // Auto-detect location
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      let loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);
      setPickup("Current Location");
      setPickupCoords({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
    })();
  }, []);

  // Calculate distance
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Auto-calculate distance when pickup/dropoff changes
  useEffect(() => {
    if (pickupCoords && dropoffCoords) {
      const distance = calculateDistance(
        pickupCoords.latitude,
        pickupCoords.longitude,
        dropoffCoords.latitude,
        dropoffCoords.longitude
      );
      setKilometers(parseFloat(distance.toFixed(2)));
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

  // Confirm drop-off location from map
  const handleConfirmDropoffLocation = (locationName, coords) => {
    setDropoff(locationName);
    setDropoffCoords(coords);
    setShowDropoffMap(false);
  };

  // Fare calculation
  const MIN_PRICE = 15;
  const PRICE_PER_KM = 15;
  const calculateFare = () => Math.max(kilometers * PRICE_PER_KM, MIN_PRICE);

  // Reverse geocode function
  const reverseGeocode = async (lat, lon) => {
    try {
      const addr = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
      if (addr.length > 0) {
        const a = addr[0];
        const parts = [];
        if (a.postalCode) parts.push(a.postalCode);
        if (a.district) parts.push(a.district);
        if (a.city) parts.push(a.city);
        if (a.region) parts.push(a.region);
        return parts.length > 0 ? parts.join(", ") : a.name || `Lat: ${lat.toFixed(5)}, Lon: ${lon.toFixed(5)}`;
      }
      return `Lat: ${lat.toFixed(5)}, Lon: ${lon.toFixed(5)}`;
    } catch {
      return `Lat: ${lat.toFixed(5)}, Lon: ${lon.toFixed(5)}`;
    }
  };

  // New: Drop-off search handler
  const handleDropoffSearch = async (query) => {
    if (!query) return;
    try {
      const results = await Location.geocodeAsync(query);
      if (results.length > 0) {
        const loc = results[0];
        const coords = { latitude: loc.latitude, longitude: loc.longitude };
        setDropoffCoords(coords);
        setDropoff(query);
        mapRef.current.animateToRegion(
          { ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 },
          500
        );
      } else {
        Alert.alert("Location not found", "Please try a different address");
      }
    } catch (error) {
      Alert.alert("Error", "Failed to search location");
      console.error(error);
    }
  };

  if (!location) return null;

  return (
    <KeyboardAvoidingView
      style={screenStyles.screenContainer}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
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
          <UrlTile urlTemplate="https://a.tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} />
          {pickupCoords && <Marker coordinate={pickupCoords} title="Pickup" pinColor="green" />}
          {dropoffCoords && <Marker coordinate={dropoffCoords} title="Drop-off" pinColor="red" />}
          {pickupCoords && dropoffCoords && <Polyline coordinates={[pickupCoords, dropoffCoords]} strokeColor="#007AFF" strokeWidth={3} />}
        </MapView>
      </View>

      {/* Blur Input Card */}
      <BlurView intensity={90} style={screenStyles.locationContainer} tint="light">
        <View style={screenStyles.titleContainer}>
          <Text style={screenStyles.locationTitle}>Where to?</Text>
          <TouchableOpacity onPress={handleSwap} style={screenStyles.swapButton} disabled={!pickup || !dropoff}>
            <Ionicons name="swap-vertical" size={20} color={pickup && dropoff ? "#183B5C" : "#CCC"} />
          </TouchableOpacity>
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
            onPress={async () => {
              const loc = await Location.getCurrentPositionAsync({});
              const name = await reverseGeocode(loc.coords.latitude, loc.coords.longitude);
              setPickupCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
              setPickup(name);
              mapRef.current.animateToRegion(
                { latitude: loc.coords.latitude, longitude: loc.coords.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 },
                500
              );
            }}
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
            onSubmitEditing={() => handleDropoffSearch(dropoff)}
          />
          <TouchableOpacity style={screenStyles.iconButton} onPress={() => handleDropoffSearch(dropoff)}>
            <Ionicons name="search" size={24} color="#183B5C" />
          </TouchableOpacity>
          <TouchableOpacity style={screenStyles.iconButton} onPress={() => setShowDropoffMap(true)}>
            <Ionicons name="map" size={24} color="#183B5C" />
          </TouchableOpacity>
        </View>

        <View style={screenStyles.divider} />

        {/* Distance & Price */}
        <View style={screenStyles.distancePriceRow}>
          <View style={screenStyles.kmSection}>
            <Text style={screenStyles.inputLabel}>Distance (km)</Text>
            <Text style={screenStyles.kmInput}>{kilometers.toFixed(2)}</Text>
          </View>
          <View style={screenStyles.priceSection}>
            <Text style={screenStyles.priceLabel}>Total Price</Text>
            <Text style={screenStyles.priceValue}>₱{calculateFare().toFixed(2)}</Text>
          </View>
        </View>
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