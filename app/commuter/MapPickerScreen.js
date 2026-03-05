// /commuter/MapPickerScreen.js
import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  Platform,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import Constants from "expo-constants";

export default function MapPickerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const mapRef = useRef(null);
  const searchTimeout = useRef(null);
  
  const { type, onSelect, initialLocation } = route.params || {};
  const [selectedLocation, setSelectedLocation] = useState(initialLocation || null);
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [initialRegion, setInitialRegion] = useState({
    latitude: 14.5995,
    longitude: 120.9842,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  });

  const googleApiKey = Constants.expoConfig?.extra?.GOOGLE_API_KEY;

  // Get current location on mount
  useEffect(() => {
    getCurrentLocation();
  }, []);

  // Auto-search when user types (with debounce)
  useEffect(() => {
    if (searchQuery.length < 3) {
      setSearchResults([]);
      return;
    }

    // Clear previous timeout
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    // Set new timeout for auto-search
    searchTimeout.current = setTimeout(() => {
      performSearch();
    }, 500); // Search after 500ms of no typing

    return () => {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
    };
  }, [searchQuery]);

  // If initial location provided, use it
  useEffect(() => {
    if (initialLocation) {
      setSelectedLocation(initialLocation);
      getAddressFromCoords(initialLocation);
      
      setTimeout(() => {
        mapRef.current?.animateToRegion({
          latitude: initialLocation.latitude,
          longitude: initialLocation.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }, 500);
      }, 500);
    }
  }, [initialLocation]);

  const getCurrentLocation = async () => {
    try {
      setLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Denied", "Location permission is needed to select location");
        setLoading(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      setInitialRegion({
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });

      if (!initialLocation) {
        setSelectedLocation(coords);
        getAddressFromCoords(coords);
      }

      mapRef.current?.animateToRegion({
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
    } catch (err) {
      console.log("Error getting location:", err);
      Alert.alert("Error", "Failed to get current location");
    } finally {
      setLoading(false);
    }
  };

  const getAddressFromCoords = async (coords) => {
    try {
      setLoading(true);
      const addressArray = await Location.reverseGeocodeAsync(coords);
      
      if (addressArray[0]) {
        const addr = addressArray[0];
        
        const addressParts = [];
        
        if (addr.street) addressParts.push(addr.street);
        else if (addr.name) addressParts.push(addr.name);
        
        if (addr.city) addressParts.push(addr.city);
        else if (addr.subregion) addressParts.push(addr.subregion);
        
        if (addr.region) addressParts.push(addr.region);
        
        const fullAddress = addressParts.filter(Boolean).join(", ");
        
        setAddress(fullAddress || "Selected Location");
      }
    } catch (err) {
      console.log("Error getting address:", err);
      setAddress("Selected Location");
    } finally {
      setLoading(false);
    }
  };

  const handleMapPress = (event) => {
    const coords = event.nativeEvent.coordinate;
    setSelectedLocation(coords);
    getAddressFromCoords(coords);
    // Clear search when manually selecting on map
    setSearchQuery("");
    setSearchResults([]);
  };

  const performSearch = async () => {
    if (!searchQuery.trim() || searchQuery.length < 3) return;

    try {
      setSearching(true);
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        searchQuery
      )}&key=${googleApiKey}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.status === "OK") {
        const results = data.results.map((result) => ({
          id: result.place_id,
          address: result.formatted_address,
          location: result.geometry.location,
        }));
        setSearchResults(results);
      } else {
        setSearchResults([]);
      }
    } catch (err) {
      console.log("Search error:", err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectSearchResult = (result) => {
    const coords = {
      latitude: result.location.lat,
      longitude: result.location.lng,
    };

    setSelectedLocation(coords);
    setAddress(result.address);
    setSearchQuery("");
    setSearchResults([]);

    mapRef.current?.animateToRegion({
      latitude: coords.latitude,
      longitude: coords.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 1000);
  };

  const handleConfirm = () => {
    if (!selectedLocation) {
      Alert.alert("No Location", "Please select a location on the map");
      return;
    }

    if (onSelect) {
      onSelect(selectedLocation, address);
    }

    navigation.goBack();
  };

  const renderSearchResult = ({ item }) => (
    <Pressable
      style={styles.searchResultItem}
      onPress={() => handleSelectSearchResult(item)}
    >
      <Ionicons name="location" size={20} color="#183B5C" />
      <Text style={styles.searchResultText} numberOfLines={2}>
        {item.address}
      </Text>
    </Pressable>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#183B5C" />
        </Pressable>
        <Text style={styles.headerTitle}>
          Select {type === "pickup" ? "Pickup" : "Dropoff"} Location
        </Text>
        <Pressable onPress={getCurrentLocation} style={styles.currentLocationButton}>
          <Ionicons name="locate" size={24} color="#183B5C" />
        </Pressable>
      </View>

      {/* Search Bar - Auto-search, no button */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color="#999" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for a place..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            placeholderTextColor="#999"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => {
              setSearchQuery("");
              setSearchResults([]);
            }}>
              <Ionicons name="close-circle" size={20} color="#999" />
            </Pressable>
          )}
        </View>
        {searching && (
          <ActivityIndicator size="small" color="#183B5C" style={styles.searchingIndicator} />
        )}
      </View>

      {/* Search Results - Auto display */}
      {searchResults.length > 0 && (
        <View style={styles.searchResultsContainer}>
          <FlatList
            data={searchResults}
            renderItem={renderSearchResult}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        </View>
      )}

      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        onPress={handleMapPress}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={true}
        loadingEnabled={true}
        loadingIndicatorColor="#183B5C"
        loadingBackgroundColor="#F5F7FA"
      >
        {selectedLocation && (
          <Marker
            coordinate={selectedLocation}
            title={type === "pickup" ? "Pickup Location" : "Dropoff Location"}
            description={address}
          >
            <View style={[
              styles.marker,
              type === "pickup" ? styles.pickupMarker : styles.dropoffMarker
            ]}>
              <Ionicons 
                name={type === "pickup" ? "location" : "flag"} 
                size={20} 
                color="#FFF" 
              />
            </View>
          </Marker>
        )}
      </MapView>

      {/* Bottom Sheet */}
      <View style={styles.bottomSheet}>
        {loading ? (
          <ActivityIndicator size="large" color="#183B5C" />
        ) : (
          <>
            <View style={styles.addressContainer}>
              <Ionicons 
                name={type === "pickup" ? "location" : "flag"} 
                size={24} 
                color={type === "pickup" ? "#10B981" : "#EF4444"} 
              />
              <Text style={styles.addressText} numberOfLines={2}>
                {address || "Tap on the map to select a location"}
              </Text>
            </View>

            <View style={styles.instructionContainer}>
              <Ionicons name="hand-right" size={16} color="#666" />
              <Text style={styles.instructionText}>
                Tap on the map to set exact location or search above
              </Text>
            </View>

            <Pressable 
              style={[
                styles.confirmButton,
                (!selectedLocation || loading) && styles.confirmButtonDisabled
              ]}
              onPress={handleConfirm}
              disabled={!selectedLocation || loading}
            >
              <Text style={styles.confirmButtonText}>
                Confirm {type === "pickup" ? "Pickup" : "Dropoff"} Location
              </Text>
            </Pressable>

            <Pressable 
              style={styles.cancelButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Recenter Button */}
      <Pressable style={styles.recenterButton} onPress={getCurrentLocation}>
        <Ionicons name="locate" size={24} color="#183B5C" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#183B5C",
  },
  currentLocationButton: {
    padding: 8,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    zIndex: 3,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    fontSize: 14,
    color: "#333",
  },
  searchingIndicator: {
    marginLeft: 10,
  },
  searchResultsContainer: {
    position: "absolute",
    top: 110,
    left: 15,
    right: 15,
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 10,
    maxHeight: 300,
    zIndex: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  searchResultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  searchResultText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: "#333",
  },
  map: {
    flex: 1,
  },
  marker: {
    padding: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#FFF",
  },
  pickupMarker: {
    backgroundColor: "#10B981",
  },
  dropoffMarker: {
    backgroundColor: "#EF4444",
  },
  bottomSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 2,
  },
  addressContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
  },
  addressText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
  },
  instructionContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
    paddingHorizontal: 5,
  },
  instructionText: {
    marginLeft: 8,
    fontSize: 12,
    color: "#666",
    flex: 1,
  },
  confirmButton: {
    backgroundColor: "#183B5C",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  confirmButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  confirmButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  cancelButton: {
    padding: 12,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#EF4444",
    fontSize: 14,
    fontWeight: "600",
  },
  recenterButton: {
    position: "absolute",
    bottom: 200,
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
    zIndex: 2,
  },
});