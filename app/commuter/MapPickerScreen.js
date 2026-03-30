// screens/commuter/MapPickerScreen.js
import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  FlatList,
  Keyboard,
  TouchableOpacity,
  Dimensions,
  Animated,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function MapPickerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const mapRef = useRef(null);
  const searchTimeout = useRef(null);
  const bottomSheetAnim = useRef(new Animated.Value(0)).current;
  const hasAutoCentered = useRef(false);

  const { type, onSelect, initialLocation } = route.params || {};

  const [selectedLocation, setSelectedLocation] = useState(initialLocation || null);
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [initialAutoLocating, setInitialAutoLocating] = useState(true);
  const [mapInteracted, setMapInteracted] = useState(false);

  const googleApiKey = Constants.expoConfig?.extra?.GOOGLE_API_KEY;

  useEffect(() => {
    Animated.spring(bottomSheetAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 70,
      friction: 12,
    }).start();
  }, []);

  useEffect(() => {
    let mounted = true;

    const initLocation = async () => {
      try {
        if (initialLocation) {
          setSelectedLocation(initialLocation);
          await getAddressFromCoords(initialLocation);

          setTimeout(() => {
            mapRef.current?.animateToRegion(
              {
                latitude: initialLocation.latitude,
                longitude: initialLocation.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              },
              500
            );
          }, 250);

          hasAutoCentered.current = true;
        } else {
          await getCurrentLocation({ isInitial: true, forceRecenter: true });
        }
      } finally {
        if (mounted) setInitialAutoLocating(false);
      }
    };

    initLocation();

    return () => {
      mounted = false;
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, []);

  useEffect(() => {
    if (searchQuery.length < 3) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    searchTimeout.current = setTimeout(() => {
      performSearch();
    }, 500);

    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [searchQuery]);

  const getCurrentLocation = async ({ isInitial = false, forceRecenter = false } = {}) => {
    try {
      setIsLocating(true);
      setErrorMessage("");

      if (!isInitial) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "Location Permission Required",
          "Please enable location access to find your current location.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Location.openSettings() },
          ]
        );
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      const shouldMoveMap =
        forceRecenter || !mapInteracted || !hasAutoCentered.current;

      if (shouldMoveMap && mapRef.current) {
        mapRef.current.animateToRegion(
          {
            latitude: coords.latitude,
            longitude: coords.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          },
          900
        );
        hasAutoCentered.current = true;
      }

      if (isInitial || !initialLocation || forceRecenter) {
        setSelectedLocation(coords);
        await getAddressFromCoords(coords);
      }

      if (!isInitial) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) {
      console.log("Error getting location:", err);
      setErrorMessage("Unable to get your current location.");
      setTimeout(() => setErrorMessage(""), 2500);
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

        if (addr.name) addressParts.push(addr.name);
        else if (addr.street) addressParts.push(addr.street);

        if (addr.district) addressParts.push(addr.district);
        else if (addr.subregion) addressParts.push(addr.subregion);

        if (addr.city) addressParts.push(addr.city);
        else if (addr.region) addressParts.push(addr.region);

        const fullAddress = addressParts.filter(Boolean).join(", ");
        setAddress(fullAddress || "Selected location");
      } else {
        setAddress("Selected location");
      }
    } catch (err) {
      console.log("Error getting address:", err);
      setAddress("Selected location");
    } finally {
      setLoading(false);
    }
  };

  const handleMapPress = (event) => {
    if (isLocating || initialAutoLocating) return;

    const coords = event.nativeEvent.coordinate;
    setMapInteracted(true);
    setSelectedLocation(coords);
    getAddressFromCoords(coords);

    setSearchQuery("");
    setSearchResults([]);
    setShowSearchResults(false);
    Keyboard.dismiss();

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

    setMapInteracted(true);
    setSelectedLocation(coords);
    setAddress(result.address);
    setSearchQuery("");
    setSearchResults([]);
    setShowSearchResults(false);
    Keyboard.dismiss();

    mapRef.current?.animateToRegion(
      {
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      500
    );

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleConfirm = () => {
    if (!selectedLocation) {
      Alert.alert("No Location Selected", "Please select a location first.");
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
      activeOpacity={0.75}
    >
      <View style={styles.searchResultIcon}>
        <Ionicons name="location-outline" size={18} color="#183B5C" />
      </View>

      <View style={styles.searchResultContent}>
        <Text style={styles.searchResultText} numberOfLines={2}>
          {item.address}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
    </TouchableOpacity>
  );

  const bottomSheetTransform = {
    transform: [
      {
        translateY: bottomSheetAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [260, 0],
        }),
      },
    ],
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

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
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        loadingEnabled
        loadingIndicatorColor="#183B5C"
        loadingBackgroundColor="#F8FAFC"
        onError={() =>
          Alert.alert("Map Error", "Unable to load map. Please check your connection.")
        }
      >
        {selectedLocation && (
          <Marker
            coordinate={selectedLocation}
            title={type === "pickup" ? "Pickup Location" : "Dropoff Location"}
            description={address}
            draggable={!isLocating && !initialAutoLocating}
            onDragEnd={(e) => {
              if (isLocating || initialAutoLocating) return;

              const coords = e.nativeEvent.coordinate;
              setMapInteracted(true);
              setSelectedLocation(coords);
              getAddressFromCoords(coords);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <View
              style={[
                styles.marker,
                type === "pickup" ? styles.pickupMarker : styles.dropoffMarker,
              ]}
            >
              <Ionicons
                name={type === "pickup" ? "location" : "flag"}
                size={18}
                color="#FFF"
              />
            </View>
          </Marker>
        )}
      </MapView>

      <View style={[styles.topOverlay, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.iconButton}
            activeOpacity={0.75}
          >
            <Ionicons name="arrow-back" size={22} color="#183B5C" />
          </TouchableOpacity>

          <Text style={styles.screenTitle}>
            {type === "pickup" ? "Pickup location" : "Dropoff location"}
          </Text>

          <TouchableOpacity
            onPress={() => getCurrentLocation({ forceRecenter: true })}
            style={styles.iconButton}
            activeOpacity={0.75}
            disabled={isLocating}
          >
            {isLocating ? (
              <ActivityIndicator size="small" color="#183B5C" />
            ) : (
              <Ionicons name="locate" size={20} color="#183B5C" />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.searchWrapper}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color="#94A3B8" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search place or address"
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={performSearch}
              editable={!initialAutoLocating}
            />

            {searching ? (
              <ActivityIndicator size="small" color="#183B5C" />
            ) : searchQuery.length > 0 ? (
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery("");
                  setSearchResults([]);
                  setShowSearchResults(false);
                }}
              >
                <Ionicons name="close-circle" size={18} color="#94A3B8" />
              </TouchableOpacity>
            ) : null}
          </View>

          {showSearchResults && searchResults.length > 0 && (
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
        </View>

        {errorMessage ? (
          <View style={styles.errorChip}>
            <Ionicons name="alert-circle" size={16} color="#DC2626" />
            <Text style={styles.errorChipText}>{errorMessage}</Text>
          </View>
        ) : null}
      </View>

      {initialAutoLocating && (
        <View style={styles.mapLoadingOverlay} pointerEvents="auto">
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#183B5C" />
            <Text style={styles.mapLoadingTitle}>Getting your location</Text>
            <Text style={styles.mapLoadingSubtext}>
              Please wait while we find your current position
            </Text>
          </View>
        </View>
      )}

      <TouchableOpacity
        style={[styles.floatingLocateButton, { bottom: 250 }]}
        onPress={() => getCurrentLocation({ forceRecenter: true })}
        activeOpacity={0.8}
        disabled={isLocating}
      >
        {isLocating ? (
          <ActivityIndicator size="small" color="#183B5C" />
        ) : (
          <Ionicons name="locate" size={22} color="#183B5C" />
        )}
      </TouchableOpacity>

      <Animated.View
        style={[
          styles.bottomCard,
          bottomSheetTransform,
          { paddingBottom: Math.max(insets.bottom + 14, 20) },
        ]}
      >
        <View style={styles.sheetHandle} />

        <View style={styles.locationRow}>
          <View
            style={[
              styles.locationBadge,
              type === "pickup" ? styles.pickupIconBg : styles.dropoffIconBg,
            ]}
          >
            <Ionicons
              name={type === "pickup" ? "navigate" : "flag"}
              size={18}
              color={type === "pickup" ? "#059669" : "#DC2626"}
            />
          </View>

          <View style={styles.locationTextWrap}>
            <Text style={styles.locationLabel}>
              {type === "pickup" ? "Selected pickup" : "Selected dropoff"}
            </Text>

            {loading ? (
              <View style={styles.inlineLoading}>
                <ActivityIndicator size="small" color="#183B5C" />
                <Text style={styles.inlineLoadingText}>Loading address...</Text>
              </View>
            ) : (
              <Text style={styles.locationAddress} numberOfLines={2}>
                {address || "Tap on the map to choose a location"}
              </Text>
            )}
          </View>
        </View>

        {selectedLocation && (
          <View style={styles.coordinatePill}>
            <Text style={styles.coordinateText}>
              {selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}
            </Text>
          </View>
        )}

        <Text style={styles.helperText}>
          Drag the pin or tap the map to adjust the exact location.
        </Text>

        <TouchableOpacity
          style={[
            styles.confirmButton,
            (!selectedLocation || loading) && styles.confirmButtonDisabled,
          ]}
          onPress={handleConfirm}
          disabled={!selectedLocation || loading}
          activeOpacity={0.85}
        >
          <Text style={styles.confirmButtonText}>
            Confirm {type === "pickup" ? "pickup" : "dropoff"}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  map: {
    flex: 1,
  },

  topOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    zIndex: 10,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  screenTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: "#183B5C",
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.95)",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },

  searchWrapper: {
    zIndex: 11,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.98)",
    borderRadius: 18,
    paddingHorizontal: 14,
    minHeight: 54,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: "#0F172A",
    paddingVertical: 14,
  },
  searchResultsContainer: {
    marginTop: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    maxHeight: SCREEN_HEIGHT * 0.32,
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 8,
  },
  searchResultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  searchResultIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  searchResultContent: {
    flex: 1,
  },
  searchResultText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#0F172A",
  },

  errorChip: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(254,242,242,0.96)",
    borderColor: "#FECACA",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  errorChipText: {
    marginLeft: 6,
    fontSize: 12,
    color: "#DC2626",
    fontWeight: "500",
  },

  marker: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 7,
  },
  pickupMarker: {
    backgroundColor: "#10B981",
  },
  dropoffMarker: {
    backgroundColor: "#EF4444",
  },

  mapLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(248,250,252,0.82)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 20,
  },
  loadingCard: {
    width: "78%",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: "center",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
    elevation: 10,
  },
  mapLoadingTitle: {
    marginTop: 14,
    fontSize: 16,
    fontWeight: "700",
    color: "#183B5C",
  },
  mapLoadingSubtext: {
    marginTop: 6,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    color: "#64748B",
  },

  floatingLocateButton: {
    position: "absolute",
    right: 18,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 12,
  },

  bottomCard: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    paddingTop: 14,
    paddingHorizontal: 18,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 12,
    zIndex: 12,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    marginBottom: 16,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  locationBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  pickupIconBg: {
    backgroundColor: "#ECFDF5",
  },
  dropoffIconBg: {
    backgroundColor: "#FEF2F2",
  },
  locationTextWrap: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 15,
    lineHeight: 21,
    color: "#0F172A",
    fontWeight: "500",
  },

  inlineLoading: {
    flexDirection: "row",
    alignItems: "center",
  },
  inlineLoadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: "#64748B",
  },

  coordinatePill: {
    alignSelf: "flex-start",
    marginTop: 14,
    marginBottom: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  coordinateText: {
    fontSize: 12,
    color: "#475569",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  helperText: {
    fontSize: 13,
    lineHeight: 19,
    color: "#64748B",
    marginBottom: 16,
  },

  confirmButton: {
    backgroundColor: "#183B5C",
    minHeight: 54,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  confirmButtonDisabled: {
    backgroundColor: "#CBD5E1",
  },
  confirmButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});