import React, { useRef, useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Modal, Alert, Dimensions } from "react-native";
import MapView, { UrlTile, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import { mapStyles } from "../styles/MapStyles";

const { width, height } = Dimensions.get("window");

export default function DropoffMapScreen({
  visible,
  dropoffMarker,
  setDropoffMarker,
  onConfirm,
  onCancel,
  location, // pickup location
}) {
  const mapRef = useRef(null);
  const [currentLocation, setCurrentLocation] = useState(location);
  const [initialRegion, setInitialRegion] = useState(null);
  const [address, setAddress] = useState("Loading...");

  // Get current location if not provided
  useEffect(() => {
    (async () => {
      if (!currentLocation) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission denied", "Cannot access location");
          return;
        }
        const loc = await Location.getCurrentPositionAsync({});
        const coords = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
        setCurrentLocation(coords);
        setInitialRegion({
          ...coords,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
        setDropoffMarker(coords);
        fetchAddress(coords.latitude, coords.longitude);
      } else {
        setInitialRegion({
          ...currentLocation,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
        setDropoffMarker(currentLocation);
        fetchAddress(currentLocation.latitude, currentLocation.longitude);
      }
    })();
  }, []);

  // Reverse geocode using OpenStreetMap Nominatim
  const fetchAddress = async (lat, lon) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`
      );
      const data = await response.json();
      if (data && data.display_name) setAddress(data.display_name);
      else setAddress(`Lat: ${lat.toFixed(5)}, Lon: ${lon.toFixed(5)}`);
    } catch (error) {
      setAddress(`Lat: ${lat.toFixed(5)}, Lon: ${lon.toFixed(5)}`);
    }
  };

  // Update dropoffMarker to center whenever map moves
  const onRegionChangeComplete = (region) => {
    const coords = {
      latitude: region.latitude,
      longitude: region.longitude,
    };
    setDropoffMarker(coords);
    fetchAddress(coords.latitude, coords.longitude);
  };

  const confirmDropoffLocation = () => {
    if (!dropoffMarker) {
      Alert.alert("No location selected");
      return;
    }
    onConfirm(address, dropoffMarker);
  };

  if (!initialRegion) return null; // wait until location is loaded

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={mapStyles.mapModalContainer}>
        {/* Header */}
        <View style={mapStyles.mapHeader}>
          <Text style={mapStyles.mapHeaderText}>Select Drop-off Location</Text>
          <Text style={mapStyles.mapHeaderSubText}>
            Move the map to select location
          </Text>
          {/* Display the current address */}
          <View style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "#fff", borderRadius: 8, marginTop: 8 }}>
            <Text style={{ fontSize: 14 }}>{address}</Text>
          </View>
        </View>

        {/* Map */}
        <View style={{ flex: 1 }}>
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            initialRegion={initialRegion}
            onRegionChangeComplete={onRegionChangeComplete}
            showsUserLocation={true}
            zoomControlEnabled={true}
          >
            <UrlTile
              urlTemplate="https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maximumZ={19}
            />

            {/* Polyline from pickup to dropoff */}
            {currentLocation && dropoffMarker && (
              <Polyline
                coordinates={[
                  { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
                  { latitude: dropoffMarker.latitude, longitude: dropoffMarker.longitude },
                ]}
                strokeColor="#007AFF" // blue line
                strokeWidth={3}
              />
            )}
          </MapView>

          {/* Fixed marker at center */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: height / 2 - 24,
              left: width / 2 - 12,
            }}
          >
            <Text style={{ fontSize: 40 }}>📍</Text>
          </View>
        </View>

        {/* Buttons */}
        <View style={mapStyles.mapControlsContainer}>
          <TouchableOpacity onPress={onCancel} style={mapStyles.mapCancelButton}>
            <Text style={mapStyles.mapButtonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={confirmDropoffLocation} style={mapStyles.mapConfirmButton}>
            <Text style={mapStyles.mapButtonText}>Confirm</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}