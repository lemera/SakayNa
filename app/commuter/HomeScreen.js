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
import MapView, { Marker, UrlTile, Polyline } from "react-native-maps";
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

  const mapRef = useRef(null);

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
      setPickup("Current Location");
      setPickupCoords({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
    })();
  }, []);

  // Auto-calculate distance
  useEffect(() => {
    if (pickupCoords && dropoffCoords) {
      const distance = calculateDistance(
        pickupCoords.latitude,
        pickupCoords.longitude,
        dropoffCoords.latitude,
        dropoffCoords.longitude,
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
          <UrlTile
            urlTemplate="https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maximumZ={19}
          />

          {pickupCoords && (
            <Marker coordinate={pickupCoords} title="Pickup" pinColor="green" />
          )}

          {dropoffCoords && (
            <Marker
              coordinate={dropoffCoords}
              title="Drop-off"
              pinColor="red"
            />
          )}

          {pickupCoords && dropoffCoords && (
            <Polyline
              coordinates={[pickupCoords, dropoffCoords]}
              strokeColor="#007AFF"
              strokeWidth={3}
            />
          )}
        </MapView>
      </View>

      {/* Blur Card */}
      <BlurView
        intensity={90}
        style={screenStyles.locationContainer}
        tint="light"
      >
        {/* Header */}
        <View style={screenStyles.titleContainer}>
          <Text style={screenStyles.locationTitle}>Where to?</Text>

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
              const name = await reverseGeocode(
                loc.coords.latitude,
                loc.coords.longitude,
              );

              setPickupCoords({
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
              });

              setPickup(name);

              mapRef.current?.animateToRegion(
                {
                  latitude: loc.coords.latitude,
                  longitude: loc.coords.longitude,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                },
                500,
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
            onSubmitEditing={() =>
              searchDropoffLocation(
                dropoff,
                mapRef,
                setDropoffCoords,
                setDropoff,
              )
            }
          />

          <TouchableOpacity
            style={screenStyles.iconButton}
            onPress={() =>
              searchDropoffLocation(
                dropoff,
                mapRef,
                setDropoffCoords,
                setDropoff,
              )
            }
          >
            <Ionicons name="search" size={24} color="#183B5C" />
          </TouchableOpacity>

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
          <View style={screenStyles.kmSection}>
            <Text style={screenStyles.inputLabel}>Distance (km)</Text>
            <Text style={screenStyles.kmInput}>{kilometers.toFixed(2)}</Text>
          </View>

          <View style={screenStyles.priceSection}>
            <Text style={screenStyles.priceLabel}>Total Price</Text>
            <Text style={screenStyles.priceValue}>
              ₱{calculateFare(kilometers).toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Select Driver Button */}
        <TouchableOpacity
          style={[
            screenStyles.selectDriverButton,
            (!pickupCoords || !dropoffCoords) && { backgroundColor: "#CCC" },
          ]}
          onPress={handleSelectDriver} // no need to disable, alert will handle
        >
          <Ionicons name="car-sport" size={20} color="#FFF" />
          <Text style={screenStyles.selectDriverButtonText}>Select Driver</Text>
        </TouchableOpacity>
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
