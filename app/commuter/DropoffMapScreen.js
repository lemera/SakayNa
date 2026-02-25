import React, { useRef, useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Modal, Alert, Dimensions } from "react-native";
import MapView, { Polyline, Marker } from "react-native-maps";
import * as Location from "expo-location";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import { mapStyles } from "../styles/MapStyles";
import { getGooglePlaceDetails, getRoutePolyline, getAddressDetails, formatFullAddress, getNearbyPlaceName, reverseGeocode } from "./utils/locationUtils";

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
  const [routePolyline, setRoutePolyline] = useState([]);
  const [routeInfo, setRouteInfo] = useState({ distance: "", duration: "" });

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

  // Resolve a readable address from lat/lon using helpers
  const fetchAddress = async (lat, lon) => {
    try {
      const details = await getAddressDetails(lat, lon);
      if (details) {
        // Prefer a component-based full address (street, barangay, locality, province)
        if (details.components) {
          const compFull = formatFullAddress(details.components, details.formatted_address);
          if (compFull && compFull !== "Unknown location") {
            setAddress(compFull);
            return;
          }
        }

        // Fallback to Google's formatted_address if components didn't produce a value
        if (details.formatted_address) {
          setAddress(details.formatted_address);
          return;
        }
      }

      // Try nearby place name as fallback
      try {
        const nearby = await getNearbyPlaceName(lat, lon);
        if (nearby) {
          setAddress(nearby);
          return;
        }
      } catch (e) {
        // ignore
      }

      // Last resort: reverse geocode to get something
      try {
        const rev = await reverseGeocode(lat, lon);
        if (rev) {
          setAddress(rev);
          return;
        }
      } catch (e) {
        // ignore
      }

      setAddress(`Lat: ${lat.toFixed(5)}, Lon: ${lon.toFixed(5)}`);
    } catch (error) {
      setAddress(`Lat: ${lat.toFixed(5)}, Lon: ${lon.toFixed(5)}`);
    }
  };

  // Fetch route from Google Directions API
  const fetchRoute = async (pickupLat, pickupLng, dropoffLat, dropoffLng) => {
    const route = await getRoutePolyline(pickupLat, pickupLng, dropoffLat, dropoffLng);
    if (route.success) {
      setRoutePolyline(route.polylinePoints);
      setRouteInfo({ distance: route.distance, duration: route.duration });
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
    // Fetch route when dropoff location changes
    if (currentLocation) {
      fetchRoute(currentLocation.latitude, currentLocation.longitude, coords.latitude, coords.longitude);
    }
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
            Search or move the map to select location
          </Text>
          
          {/* Google Places Autocomplete */}
          <GooglePlacesAutocomplete
            placeholder="Search location"
            onPress={async (data, details = null) => {
              const placeDetails = await getGooglePlaceDetails(data.place_id);
              if (placeDetails) {
                const coords = {
                  latitude: placeDetails.latitude,
                  longitude: placeDetails.longitude,
                };
                setDropoffMarker(coords);
                setAddress(placeDetails.address);
                mapRef.current?.animateToRegion(
                  { ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 },
                  500
                );
              }
            }}
            query={{
              key: "AIzaSyCPuMCVa_9EB832dXm1P0t2Nv1UqBYQgws",
              language: "en",
              components: "country:ph",
            }}
            textInputProps={{
              placeholderTextColor: "#888",
            }}
            styles={{
              textInput: {
                marginHorizontal: 12,
                marginTop: 8,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 8,
                borderColor: "#ddd",
                borderWidth: 1,
                fontSize: 16,
              },
              listView: {
                marginHorizontal: 12,
                marginTop: 4,
                borderRadius: 8,
                elevation: 2,
                zIndex: 100,
              },
              row: {
                paddingVertical: 10,
                paddingHorizontal: 12,
              },
            }}
          />
          
          {/* Display route information */}
          {routeInfo.distance && (
            <View style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "#e3f2fd", borderRadius: 8, marginTop: 8, marginHorizontal: 12 }}>
              <Text style={{ fontSize: 12, color: "#183B5C", fontWeight: "600" }}>Route Info</Text>
              <Text style={{ fontSize: 13, color: "#183B5C" }}>Distance: {routeInfo.distance} • Duration: {routeInfo.duration}</Text>
            </View>
          )}
          
          {/* Display the current address */}
          <View style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "#fff", borderRadius: 8, marginTop: 8, marginHorizontal: 12 }}>
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


            {/* Pickup marker */}
            {currentLocation && (
              <Marker
                coordinate={currentLocation}
                title="Pickup Location"
                pinColor="green"
              />
            )}

            {/* Dropoff marker at center */}
            {dropoffMarker && (
              <Marker
                coordinate={dropoffMarker}
                title="Dropoff Location"
              />
            )}

            {/* Polyline from pickup to dropoff - follows actual roads */}
            {routePolyline.length > 0 ? (
              <Polyline
                coordinates={routePolyline}
                strokeColor="#007AFF"
                strokeWidth={4}
              />
            ) : (
              currentLocation && dropoffMarker && (
                <Polyline
                  coordinates={[
                    { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
                    { latitude: dropoffMarker.latitude, longitude: dropoffMarker.longitude },
                  ]}
                  strokeColor="#999999"
                  strokeWidth={2}
                  lineDashPattern={[5, 5]}
                />
              )
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
// lat: