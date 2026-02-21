import React, { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, Keyboard, Modal } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
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
  const mapRef = React.useRef(null);
  const dropoffMapRef = React.useRef(null);

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
      
      // Animate map to current location
      mapRef.current?.animateToRegion({
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 1000);
      
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

  // Handle drop-off marker drag
  const handleMarkerDragEnd = (e) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setDropoffMarker({
      latitude,
      longitude,
    });
  };

  // Confirm drop-off location
  const confirmDropoffLocation = async () => {
    if (!dropoffMarker) return;

    try {
      // Animate map to marker
      dropoffMapRef.current?.animateToRegion({
        ...dropoffMarker,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 500);

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
      {/* Map Background */}
      <MapView
        ref={mapRef}
        style={screenStyles.map}
        initialRegion={{
          latitude: location ? location.latitude : 14.5,
          longitude: location ? location.longitude : 121.0,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {location && <Marker coordinate={location} pinColor="#E97A3E" />}
        {pickupCoords && (
          <Marker
            coordinate={pickupCoords}
            pinColor="#27AE60"
            title="Pickup"
          />
        )}
        {dropoffCoords && (
          <Marker
            coordinate={dropoffCoords}
            pinColor="#E74C3C"
            title="Drop-off"
          />
        )}
        {pickupCoords && dropoffCoords && (
          <Polyline
            coordinates={[pickupCoords, dropoffCoords]}
            strokeColor="#183B5C"
            strokeWidth={3}
          />
        )}
      </MapView>

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

      {/* Drop-off Map Selection Modal */}
      <Modal
        visible={showDropoffMap}
        animationType="slide"
        onRequestClose={() => setShowDropoffMap(false)}
      >
        <View style={{ flex: 1 }}>
          <MapView
            ref={dropoffMapRef}
            style={{ flex: 1 }}
            initialRegion={{
              latitude: dropoffMarker?.latitude || 14.5,
              longitude: dropoffMarker?.longitude || 121.0,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
          >
            {dropoffMarker && (
              <Marker
                coordinate={dropoffMarker}
                draggable
                onDragEnd={handleMarkerDragEnd}
                title="Drop-off Location"
                description="Drag to change location"
              />
            )}
          </MapView>

          {/* Center Marker Pin (Visual guide) */}
          <View style={screenStyles.centerMarkerContainer}>
            <Ionicons name="location" size={40} color="#E97A3E" />
          </View>

          {/* Header with instructions */}
          <View style={screenStyles.mapHeader}>
            <Text style={screenStyles.mapHeaderText}>Select Drop-off Location</Text>
            <Text style={screenStyles.mapHeaderSubText}>Drag the map to move the pin</Text>
          </View>

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