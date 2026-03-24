// screens/commuter/MapPickerScreen.js
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
  Keyboard,
  TouchableOpacity,
  Dimensions,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import Constants from "expo-constants";
import * as Haptics from 'expo-haptics';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function MapPickerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const mapRef = useRef(null);
  const searchTimeout = useRef(null);
  const bottomSheetAnim = useRef(new Animated.Value(0)).current;
  
  const { type, onSelect, initialLocation } = route.params || {};
  const [selectedLocation, setSelectedLocation] = useState(initialLocation || null);
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  
  const googleApiKey = Constants.expoConfig?.extra?.GOOGLE_API_KEY;
  
  // Animate bottom sheet on mount
  useEffect(() => {
    Animated.spring(bottomSheetAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, []);

  // Get current location on mount
  useEffect(() => {
    getCurrentLocation();
  }, []);

  // Auto-search when user types (with debounce)
  useEffect(() => {
    if (searchQuery.length < 3) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    searchTimeout.current = setTimeout(() => {
      performSearch();
    }, 500);

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
        if (mapRef.current) {
          mapRef.current.animateToRegion({
            latitude: initialLocation.latitude,
            longitude: initialLocation.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }, 500);
        }
      }, 500);
    }
  }, [initialLocation]);

  const getCurrentLocation = async () => {
    try {
      setIsLocating(true);
      setErrorMessage("");
      
      // Haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location Permission Required",
          "Please enable location access to find your current location. You can manually search for locations instead.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Location.openSettings() }
          ]
        );
        setIsLocating(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      // Animate to current location
      mapRef.current?.animateToRegion({
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);

      if (!initialLocation) {
        setSelectedLocation(coords);
        await getAddressFromCoords(coords);
      }
      
      // Success feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
    } catch (err) {
      console.log("Error getting location:", err);
      setErrorMessage("Unable to get your location. Please check your GPS or try searching manually.");
      setTimeout(() => setErrorMessage(""), 3000);
    } finally {
      setIsLocating(false);
    }
  };

  const getAddressFromCoords = async (coords) => {
    try {
      setLoading(true);
      const addressArray = await Location.reverseGeocodeAsync(coords);
      
      if (addressArray[0]) {
        const addr = addressArray[0];
        
        const addressParts = [];
        
        // Build a user-friendly address
        if (addr.street) addressParts.push(addr.street);
        else if (addr.name) addressParts.push(addr.name);
        
        if (addr.district) addressParts.push(addr.district);
        else if (addr.subregion) addressParts.push(addr.subregion);
        
        if (addr.city) addressParts.push(addr.city);
        else if (addr.region) addressParts.push(addr.region);
        
        const fullAddress = addressParts.filter(Boolean).join(", ");
        setAddress(fullAddress || "Selected Location");
      } else {
        setAddress("Selected Location");
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
    
    // Clear search and hide results
    setSearchQuery("");
    setSearchResults([]);
    setShowSearchResults(false);
    Keyboard.dismiss();
    
    // Haptic feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
        setShowSearchResults(true);
      } else {
        setSearchResults([]);
        setShowSearchResults(false);
      }
    } catch (err) {
      console.log("Search error:", err);
      setSearchResults([]);
      setShowSearchResults(false);
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
    setShowSearchResults(false);
    Keyboard.dismiss();

    mapRef.current?.animateToRegion({
      latitude: coords.latitude,
      longitude: coords.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 500);
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleConfirm = () => {
    if (!selectedLocation) {
      Alert.alert(
        "No Location Selected",
        "Please select a location on the map by tapping or searching",
        [{ text: "OK" }]
      );
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    if (onSelect) {
      onSelect(selectedLocation, address);
    }

    navigation.goBack();
  };

  const renderSearchResult = ({ item }) => (
    <TouchableOpacity
      style={styles.searchResultItem}
      onPress={() => handleSelectSearchResult(item)}
      activeOpacity={0.7}
    >
      <View style={styles.searchResultIcon}>
        <Ionicons name="location-outline" size={20} color="#183B5C" />
      </View>
      <View style={styles.searchResultContent}>
        <Text style={styles.searchResultText} numberOfLines={2}>
          {item.address}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
    </TouchableOpacity>
  );

  const bottomSheetTransform = {
    transform: [{
      translateY: bottomSheetAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [300, 0],
      })
    }]
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.headerButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#183B5C" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>
            Set {type === "pickup" ? "Pickup" : "Dropoff"} Location
          </Text>
          <Text style={styles.headerSubtitle}>
            Tap on map or search for a place
          </Text>
        </View>
        <TouchableOpacity 
          onPress={getCurrentLocation} 
          style={styles.headerButton}
          disabled={isLocating}
          activeOpacity={0.7}
        >
          {isLocating ? (
            <ActivityIndicator size="small" color="#183B5C" />
          ) : (
            <Ionicons name="location" size={24} color="#183B5C" />
          )}
        </TouchableOpacity>
      </View>

      {/* Error Message */}
      {errorMessage ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={18} color="#EF4444" />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for a place, address, or landmark..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={performSearch}
          />
          {searching ? (
            <ActivityIndicator size="small" color="#183B5C" />
          ) : searchQuery.length > 0 ? (
            <TouchableOpacity onPress={() => {
              setSearchQuery("");
              setSearchResults([]);
              setShowSearchResults(false);
            }}>
              <Ionicons name="close-circle" size={20} color="#94A3B8" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Search Results */}
      {showSearchResults && searchResults.length > 0 && (
        <View style={styles.searchResultsContainer}>
          <View style={styles.searchResultsHeader}>
            <Text style={styles.searchResultsTitle}>Search Results</Text>
            <TouchableOpacity onPress={() => setShowSearchResults(false)}>
              <Ionicons name="close" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={searchResults}
            renderItem={renderSearchResult}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            maxToRenderPerBatch={10}
          />
        </View>
      )}

      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={{
          latitude: 14.5995,
          longitude: 120.9842,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        }}
        onPress={handleMapPress}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={true}
        showsScale={true}
        loadingEnabled={true}
        loadingIndicatorColor="#183B5C"
        loadingBackgroundColor="#F5F7FA"
        onMapReady={() => setMapReady(true)}
        onError={() => Alert.alert("Map Error", "Unable to load map. Please check your connection.")}
      >
        {selectedLocation && (
          <Marker
            coordinate={selectedLocation}
            title={type === "pickup" ? "Pickup Location" : "Dropoff Location"}
            description={address}
            draggable={true}
            onDragEnd={(e) => {
              const coords = e.nativeEvent.coordinate;
              setSelectedLocation(coords);
              getAddressFromCoords(coords);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
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

      {/* Recenter Button */}
      <TouchableOpacity 
        style={styles.recenterButton} 
        onPress={getCurrentLocation}
        activeOpacity={0.8}
      >
        <Ionicons name="locate" size={24} color="#183B5C" />
      </TouchableOpacity>

      {/* Bottom Sheet */}
      <Animated.View style={[styles.bottomSheet, bottomSheetTransform]}>
        <View style={styles.bottomSheetHandle}>
          <View style={styles.handle} />
        </View>
        
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#183B5C" />
            <Text style={styles.loadingText}>Getting address...</Text>
          </View>
        ) : (
          <>
            <View style={styles.addressContainer}>
              <View style={[
                styles.addressIcon,
                type === "pickup" ? styles.pickupIconBg : styles.dropoffIconBg
              ]}>
                <Ionicons 
                  name={type === "pickup" ? "location" : "flag"} 
                  size={20} 
                  color={type === "pickup" ? "#10B981" : "#EF4444"} 
                />
              </View>
              <View style={styles.addressContent}>
                <Text style={styles.addressLabel}>
                  {type === "pickup" ? "Pickup Location" : "Dropoff Location"}
                </Text>
                <Text style={styles.addressText} numberOfLines={2}>
                  {address || "Tap on the map to select a location"}
                </Text>
              </View>
            </View>

            {selectedLocation && (
              <View style={styles.coordinatesContainer}>
                <Text style={styles.coordinatesText}>
                  📍 {selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}
                </Text>
              </View>
            )}

            <View style={styles.instructionContainer}>
              <Ionicons name="hand-right" size={16} color="#94A3B8" />
              <Text style={styles.instructionText}>
                Tip: You can drag the marker to adjust the exact location
              </Text>
            </View>

            <TouchableOpacity 
              style={[
                styles.confirmButton,
                (!selectedLocation || loading) && styles.confirmButtonDisabled
              ]}
              onPress={handleConfirm}
              disabled={!selectedLocation || loading}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmButtonText}>
                Confirm {type === "pickup" ? "Pickup" : "Dropoff"} Location
              </Text>
              <Ionicons name="checkmark" size={20} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.cancelButton}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}
      </Animated.View>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#183B5C",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FEE2E2",
  },
  errorText: {
    marginLeft: 8,
    fontSize: 12,
    color: "#EF4444",
    flex: 1,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    zIndex: 3,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    fontSize: 15,
    color: "#333",
  },
  searchResultsContainer: {
    position: "absolute",
    top: 120,
    left: 16,
    right: 16,
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 8,
    maxHeight: SCREEN_HEIGHT * 0.4,
    zIndex: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  searchResultsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  searchResultsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#183B5C",
  },
  searchResultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  searchResultIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  searchResultContent: {
    flex: 1,
  },
  searchResultText: {
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
  },
  map: {
    flex: 1,
  },
  marker: {
    padding: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#FFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 2,
  },
  bottomSheetHandle: {
    alignItems: "center",
    marginBottom: 16,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "#E5E7EB",
    borderRadius: 2,
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6B7280",
  },
  addressContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#F9FAFB",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  addressIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  pickupIconBg: {
    backgroundColor: "#E8F5E9",
  },
  dropoffIconBg: {
    backgroundColor: "#FEE2E2",
  },
  addressContent: {
    flex: 1,
  },
  addressLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 4,
  },
  addressText: {
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
  },
  coordinatesContainer: {
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  coordinatesText: {
    fontSize: 11,
    color: "#9CA3AF",
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  instructionContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  instructionText: {
    marginLeft: 8,
    fontSize: 12,
    color: "#94A3B8",
    flex: 1,
  },
  confirmButton: {
    backgroundColor: "#183B5C",
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    gap: 8,
  },
  confirmButtonDisabled: {
    backgroundColor: "#CBD5E1",
  },
  confirmButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#EF4444",
    fontSize: 15,
    fontWeight: "500",
  },
  recenterButton: {
    position: "absolute",
    bottom: 220,
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
    shadowRadius: 8,
    elevation: 5,
    zIndex: 2,
  },
});