import React, { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, Keyboard, Modal, ScrollView } from "react-native";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { screenStyles } from "../styles/ScreenStyles";

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

  // Calculate distance between two coordinates using Haversine formula
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in kilometers
  };

  // Auto-calculate distance when pickup or dropoff changes
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

  // Calculate fare based on kilometers
  const MIN_PRICE = 15;
  const PRICE_PER_KM = 12;
  const calculateFare = () => {
    const fare = kilometers * PRICE_PER_KM;
    return Math.max(fare, MIN_PRICE);
  };

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

  // Listen for keyboard show/hide events
  useEffect(() => {
    const keyboardShowListener = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      }
    );

    const keyboardHideListener = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        setKeyboardHeight(0);
      }
    );

    return () => {
      keyboardShowListener.remove();
      keyboardHideListener.remove();
    };
  }, []);

  // Handle Pickup Button Click
  const handlePickupMap = async () => {
    try {
      let loc = await Location.getCurrentPositionAsync({});
      const coords = loc.coords;
      
      // Reverse geocode to get address
      const address = await Location.reverseGeocodeAsync({
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      
      if (address.length > 0) {
        const addressData = address[0];
        // Build location name with purok, barangay, city, and region
        const addressParts = [];
        
        if (addressData.postalCode) addressParts.push(addressData.postalCode); // Purok/Postal Code
        if (addressData.district) addressParts.push(addressData.district); // District/Barangay
        if (addressData.city) addressParts.push(addressData.city); // City
        if (addressData.region) addressParts.push(addressData.region); // Region
        
        const locationName = addressParts.length > 0 
          ? addressParts.join(", ") 
          : addressData.name || `Lat: ${coords.latitude.toFixed(5)}, Lon: ${coords.longitude.toFixed(5)}`;
        
        setPickup(locationName);
        setPickupCoords({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        Alert.alert("Pickup Location Set", locationName);
      } else {
        // Fall back to coordinates if reverse geocoding returns empty
        const coordName = `Lat: ${coords.latitude.toFixed(5)}, Lon: ${coords.longitude.toFixed(5)}`;
        setPickup(coordName);
        setPickupCoords({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        Alert.alert("Pickup Location Set", coordName);
      }
    } catch (err) {
      // Fall back to coordinates on error
      try {
        let loc = await Location.getCurrentPositionAsync({});
        const coords = loc.coords;
        const coordName = `Lat: ${coords.latitude.toFixed(5)}, Lon: ${coords.longitude.toFixed(5)}`;
        setPickup(coordName);
        setPickupCoords({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        Alert.alert("Pickup Location Set", coordName);
      } catch {
        Alert.alert("Error", "Could not get pickup location.");
      }
    }
  };

  // Handle Drop-off Button Click - Open Map for selection
  const handleDropoffMap = async () => {
    try {
      // Use pickup coordinates as reference, or default location
      let initialLat = 14.5;
      let initialLon = 121.0;
      
      // If user has set a pickup location, start drop-off map from there
      if (pickupCoords) {
        // Offset drop-off marker slightly south (~1km) so it's different from pickup
        initialLat = pickupCoords.latitude - 0.01;
        initialLon = pickupCoords.longitude;
      }
      
      // Set initial marker position
      setDropoffMarker({
        latitude: initialLat,
        longitude: initialLon,
      });
      
      // Show the map modal
      setShowDropoffMap(true);
    } catch (err) {
      Alert.alert("Error", "Could not open drop-off map.");
    }
  };

  // Confirm drop-off location
  const confirmDropoffLocation = async () => {
    if (!dropoffMarker) return;

    try {

      // Reverse geocode to get address
      const address = await Location.reverseGeocodeAsync({
        latitude: dropoffMarker.latitude,
        longitude: dropoffMarker.longitude,
      });

      if (address.length > 0) {
        const addressData = address[0];
        // Build location name with purok, barangay, city, and region
        const addressParts = [];
        
        if (addressData.postalCode) addressParts.push(addressData.postalCode); // Purok/Postal Code
        if (addressData.district) addressParts.push(addressData.district); // District/Barangay
        if (addressData.city) addressParts.push(addressData.city); // City
        if (addressData.region) addressParts.push(addressData.region); // Region
        
        const locationName = addressParts.length > 0 
          ? addressParts.join(", ") 
          : addressData.name || `Lat: ${dropoffMarker.latitude.toFixed(5)}, Lon: ${dropoffMarker.longitude.toFixed(5)}`;
        
        setDropoff(locationName);
        setDropoffCoords({
          latitude: dropoffMarker.latitude,
          longitude: dropoffMarker.longitude,
        });
        Alert.alert("Drop-off Location Set", locationName);
        setShowDropoffMap(false);
      } else {
        // Fall back to coordinates if reverse geocoding returns empty
        const coordName = `Lat: ${dropoffMarker.latitude.toFixed(5)}, Lon: ${dropoffMarker.longitude.toFixed(5)}`;
        setDropoff(coordName);
        setDropoffCoords({
          latitude: dropoffMarker.latitude,
          longitude: dropoffMarker.longitude,
        });
        Alert.alert("Drop-off Location Set", coordName);
        setShowDropoffMap(false);
      }
    } catch (err) {
      // Fall back to coordinates on error
      const coordName = `Lat: ${dropoffMarker.latitude.toFixed(5)}, Lon: ${dropoffMarker.longitude.toFixed(5)}`;
      setDropoff(coordName);
      setDropoffCoords({
        latitude: dropoffMarker.latitude,
        longitude: dropoffMarker.longitude,
      });
      Alert.alert("Drop-off Location Set", coordName);
      setShowDropoffMap(false);
    }
  };

  // Swap pickup and drop-off
  const handleSwap = () => {
    // Swap location names
    const tempPickup = pickup;
    setPickup(dropoff);
    setDropoff(tempPickup);

    // Swap coordinates
    const tempCoords = pickupCoords;
    setPickupCoords(dropoffCoords);
    setDropoffCoords(tempCoords);
  };

  return (
    <KeyboardAvoidingView 
      style={screenStyles.screenContainer}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      {/* Location Preview Card */}
      <View style={[screenStyles.map, { backgroundColor: "#F5F5F5", justifyContent: "center", alignItems: "center" }]}>
        <Ionicons name="map" size={80} color="#DDD" />
        <Text style={[screenStyles.locationTitle, { marginTop: 16, color: "#999" }]}>Map View</Text>
        <Text style={{ color: "#BBB", fontSize: 12, marginTop: 8 }}>Locations shown in detail below</Text>
        {location && (
          <Text style={{ color: "#888", fontSize: 10, marginTop: 12 }}>
            Current: {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
          </Text>
        )}
      </View>

      {/* Floating Blur Card */}
      <BlurView intensity={90} style={screenStyles.locationContainer} tint="light">
        <View style={screenStyles.titleContainer}>
          <Text style={screenStyles.locationTitle}>Where to?</Text>
          <TouchableOpacity
            onPress={handleSwap}
            style={screenStyles.swapButton}
            disabled={!pickup || !dropoff}
          >
            <Ionicons name="swap-vertical" size={20} color={pickup && dropoff ? "#183B5C" : "#CCC"} />
          </TouchableOpacity>
          {isOnRide && (
            <View style={screenStyles.rideIndicatorContainer}>
              <View style={screenStyles.rideIndicatorDot} />
              <Text style={screenStyles.rideIndicatorText}>On Ride</Text>
            </View>
          )}
        </View>

        {/* Pickup Row */}
        <View style={screenStyles.inputRow}>
          <Ionicons name="location" size={20} color="#E97A3E" />
          <TextInput
            placeholder="Enter Pickup Location"
            placeholderTextColor="#999"
            style={screenStyles.input}
            value={pickup}
            onChangeText={setPickup}
          />
          <TouchableOpacity onPress={handlePickupMap} style={screenStyles.iconButton}>
            <Ionicons name="map" size={24} color="#183B5C" />
          </TouchableOpacity>
        </View>

        <View style={screenStyles.divider} />

        {/* Drop-off Row */}
        <View style={screenStyles.inputRow}>
          <Ionicons name="flag" size={20} color="#183B5C" />
          <TextInput
            placeholder="Enter Drop-off Location"
            placeholderTextColor="#999"
            style={screenStyles.input}
            value={dropoff}
            onChangeText={setDropoff}
          />
          <TouchableOpacity onPress={handleDropoffMap} style={screenStyles.iconButton}>
            <Ionicons name="map" size={24} color="#183B5C" />
          </TouchableOpacity>
        </View>

        <View style={screenStyles.divider} />

        {/* Kilometers Input & Price Display */}
        <View style={screenStyles.distancePriceRow}>
          {/* Left: Kilometers Display */}
          <View style={screenStyles.kmSection}>
            <View style={screenStyles.kmInputRow}>
              <Text style={screenStyles.inputLabel}>Distance (km)</Text>
              <Ionicons name="navigate" size={18} color="#E97A3E" />
              <TextInput
                placeholder="0"
                placeholderTextColor="#999"
                style={screenStyles.kmInput}
                keyboardType="decimal-pad"
                value={kilometers.toString()}
                editable={false}
              />
            </View>
          </View>

          {/* Right: Price Display */}
          <View style={screenStyles.priceSection}>
            <Text style={screenStyles.priceLabel}>Total Price</Text>
            <Text style={screenStyles.priceValue}>₱{calculateFare().toFixed(2)}</Text>
          </View>
        </View>

      </BlurView>

      {/* Drop-off Location Picker Modal */}
      <Modal
        visible={showDropoffMap}
        animationType="slide"
        onRequestClose={() => setShowDropoffMap(false)}
      >
        <View style={{ flex: 1, backgroundColor: "#FFF" }}>
          {/* Header */}
          <View style={screenStyles.mapHeader}>
            <Text style={screenStyles.mapHeaderText}>Select Drop-off Location</Text>
            <Text style={screenStyles.mapHeaderSubText}>Enter coordinates or address below</Text>
          </View>

          {/* Location Input Form */}
          <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingTop: 20 }}>
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#183B5C", marginBottom: 8 }}>
                Current Marker Position
              </Text>
              <View style={{ 
                backgroundColor: "#F5F5F5", 
                padding: 16, 
                borderRadius: 8,
                marginBottom: 16
              }}>
                <Text style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Latitude</Text>
                <Text style={{ fontSize: 14, fontWeight: "500", color: "#183B5C", marginBottom: 12 }}>
                  {dropoffMarker?.latitude.toFixed(6)}
                </Text>
                <Text style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Longitude</Text>
                <Text style={{ fontSize: 14, fontWeight: "500", color: "#183B5C" }}>
                  {dropoffMarker?.longitude.toFixed(6)}
                </Text>
              </View>

              <Text style={{ fontSize: 14, fontWeight: "600", color: "#183B5C", marginBottom: 8 }}>
                Move Location
              </Text>
              <View style={{ 
                flexDirection: "row", 
                gap: 12, 
                marginBottom: 16
              }}>
                <TouchableOpacity
                  onPress={() => {
                    setDropoffMarker(prev => ({
                      ...prev,
                      latitude: prev.latitude + 0.005
                    }));
                  }}
                  style={{ 
                    flex: 1, 
                    backgroundColor: "#183B5C", 
                    padding: 12, 
                    borderRadius: 8,
                    alignItems: "center"
                  }}
                >
                  <Ionicons name="arrow-up" size={20} color="#FFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setDropoffMarker(prev => ({
                      ...prev,
                      latitude: prev.latitude - 0.005
                    }));
                  }}
                  style={{ 
                    flex: 1, 
                    backgroundColor: "#183B5C", 
                    padding: 12, 
                    borderRadius: 8,
                    alignItems: "center"
                  }}
                >
                  <Ionicons name="arrow-down" size={20} color="#FFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setDropoffMarker(prev => ({
                      ...prev,
                      longitude: prev.longitude - 0.005
                    }));
                  }}
                  style={{ 
                    flex: 1, 
                    backgroundColor: "#183B5C", 
                    padding: 12, 
                    borderRadius: 8,
                    alignItems: "center"
                  }}
                >
                  <Ionicons name="arrow-back" size={20} color="#FFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setDropoffMarker(prev => ({
                      ...prev,
                      longitude: prev.longitude + 0.005
                    }));
                  }}
                  style={{ 
                    flex: 1, 
                    backgroundColor: "#183B5C", 
                    padding: 12, 
                    borderRadius: 8,
                    alignItems: "center"
                  }}
                >
                  <Ionicons name="arrow-forward" size={20} color="#FFF" />
                </TouchableOpacity>
              </View>

              {/* Reset to current location button */}
              <TouchableOpacity
                onPress={() => {
                  if (location) {
                    setDropoffMarker({
                      latitude: location.latitude,
                      longitude: location.longitude
                    });
                  }
                }}
                style={{
                  backgroundColor: "#E97A3E",
                  padding: 12,
                  borderRadius: 8,
                  alignItems: "center",
                  marginBottom: 24
                }}
              >
                <Text style={{ color: "#FFF", fontWeight: "600" }}>Use Current Location</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Control Buttons */}
          <View style={screenStyles.mapControlsContainer}>
            <TouchableOpacity
              onPress={() => setShowDropoffMap(false)}
              style={screenStyles.mapCancelButton}
            >
              <Text style={screenStyles.mapButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirmDropoffLocation}
              style={screenStyles.mapConfirmButton}
            >
              <Text style={screenStyles.mapButtonText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}