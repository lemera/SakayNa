// screens/commuter/MapPickerScreen.js
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  FlatList,
  Keyboard,
  TouchableOpacity,
  Dimensions,
  Animated,
  StatusBar,
  ScrollView,
  Modal,
  PanResponder,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const GEOCODE_DEBOUNCE_MS = 500;
const FAVORITES_STORAGE_KEY = "user_favorite_locations";

const BOTTOM_SHEET_SNAP_POINTS = {
  MINIMIZED: 220,
  PARTIAL: SCREEN_HEIGHT * 0.35,
  EXPANDED: SCREEN_HEIGHT * 0.58,
};

const LANDMARK_ICONS = {
  restaurant: "restaurant",
  mall: "bag-handle",
  market: "storefront",
  hospital: "medkit",
  church: "heart",
  school: "school",
  terminal: "bus",
  hotel: "bed",
  bank: "card",
  government: "business",
  park: "leaf",
  cafe: "cafe",
  gym: "barbell",
  pharmacy: "medical",
  home: "home",
  work: "briefcase",
  other: "location",
};

const LANDMARK_COLORS = {
  restaurant: "#EF4444",
  mall: "#8B5CF6",
  market: "#F59E0B",
  hospital: "#3B82F6",
  church: "#EC4899",
  school: "#10B981",
  terminal: "#6366F1",
  hotel: "#F97316",
  bank: "#14B8A6",
  government: "#64748B",
  park: "#22C55E",
  cafe: "#D97706",
  gym: "#7C3AED",
  pharmacy: "#06B6D4",
  home: "#183B5C",
  work: "#DC2626",
  other: "#94A3B8",
};

const LANDMARK_LABELS = {
  restaurant: "Restaurants",
  mall: "Malls",
  market: "Markets",
  hospital: "Hospitals",
  church: "Churches",
  school: "Schools",
  terminal: "Terminals",
  hotel: "Hotels",
  bank: "Banks",
  government: "Government",
  park: "Parks",
  cafe: "Cafes",
  gym: "Gyms",
  pharmacy: "Pharmacies",
  home: "Home",
  work: "Work",
  other: "Places",
};

const isPlusCode = (str = "") =>
  /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}$/i.test(str.trim());

const createSessionToken = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;

const getAddressComponentValue = (components = [], ...types) => {
  for (const type of types) {
    const found = components.find((c) => c?.types?.includes(type));
    if (found) {
      return (
        found.longText ||
        found.shortText ||
        found.long_name ||
        found.short_name ||
        null
      );
    }
  }
  return null;
};

const getBestPlaceNameFromGeocodeResult = (result) => {
  if (!result?.address_components?.length) return null;

  return (
    getAddressComponentValue(
      result.address_components,
      "premise",
      "point_of_interest",
      "establishment"
    ) || null
  );
};

const getBestPlaceNameFromNewPlace = (place) => {
  if (!place) return null;

  const fromDisplayName = place?.displayName?.text || null;
  const fromComponents = getAddressComponentValue(
    place?.addressComponents || [],
    "premise",
    "point_of_interest",
    "establishment"
  );

  return fromDisplayName || fromComponents || null;
};

const buildAddressFromNewPlace = (place) => {
  if (!place?.addressComponents?.length) return null;

  const placeName = getBestPlaceNameFromNewPlace(place);
  const streetNum = getAddressComponentValue(place.addressComponents, "street_number");
  const route = getAddressComponentValue(place.addressComponents, "route");
  const sublocality = getAddressComponentValue(
    place.addressComponents,
    "sublocality_level_1",
    "sublocality"
  );
  const neighborhood = getAddressComponentValue(place.addressComponents, "neighborhood");
  const city = getAddressComponentValue(place.addressComponents, "locality");
  const province = getAddressComponentValue(
    place.addressComponents,
    "administrative_area_level_2",
    "administrative_area_level_1"
  );

  const parts = [];

  if (placeName) parts.push(placeName);

  const street = [streetNum, route].filter(Boolean).join(" ");
  if (street && street !== placeName) parts.push(street);

  if (sublocality) parts.push(sublocality);
  else if (neighborhood) parts.push(neighborhood);

  if (city) parts.push(city);
  if (province && province !== city) parts.push(province);

  return parts.filter(Boolean).join(", ") || null;
};

const buildAddressFromGeocodeResult = (result) => {
  if (!result?.address_components?.length) return null;

  const placeName = getBestPlaceNameFromGeocodeResult(result);
  const streetNum = getAddressComponentValue(result.address_components, "street_number");
  const route = getAddressComponentValue(result.address_components, "route");
  const sublocality = getAddressComponentValue(
    result.address_components,
    "sublocality_level_1",
    "sublocality"
  );
  const neighborhood = getAddressComponentValue(result.address_components, "neighborhood");
  const city = getAddressComponentValue(result.address_components, "locality");
  const province = getAddressComponentValue(
    result.address_components,
    "administrative_area_level_2",
    "administrative_area_level_1"
  );

  const parts = [];

  if (placeName) parts.push(placeName);

  const street = [streetNum, route].filter(Boolean).join(" ");
  if (street && street !== placeName) parts.push(street);

  if (sublocality) parts.push(sublocality);
  else if (neighborhood) parts.push(neighborhood);

  if (city) parts.push(city);
  if (province && province !== city) parts.push(province);

  return parts.filter(Boolean).join(", ") || null;
};

const extractCleanAddressFromPlaceDetails = (place) => {
  const displayName = place?.displayName?.text || "";
  const built = buildAddressFromNewPlace(place);
  const formatted = place?.formattedAddress || "";

  if (displayName && !isPlusCode(displayName)) {
    if (built && !built.toLowerCase().startsWith(displayName.toLowerCase())) {
      return `${displayName}, ${built}`;
    }
    return built || displayName || formatted || null;
  }

  if (built && !isPlusCode(built.split(",")[0]?.trim() || "")) {
    return built;
  }

  const firstSegment = formatted.split(",")[0]?.trim();
  if (firstSegment && !isPlusCode(firstSegment)) {
    return formatted;
  }

  return built || formatted || null;
};

const extractCleanAddressFromGeocode = (result) => {
  const built = buildAddressFromGeocodeResult(result);
  const formatted = result?.formatted_address || "";

  if (built && !isPlusCode(built.split(",")[0]?.trim() || "")) {
    return built;
  }

  const firstSegment = formatted.split(",")[0]?.trim();
  if (firstSegment && !isPlusCode(firstSegment)) {
    return formatted;
  }

  return built || formatted || null;
};

const buildExpoReverseGeocodeAddress = (a) => {
  if (!a) return null;

  const parts = [];

  if (a.name && a.name !== a.street && a.name !== a.streetNumber) {
    parts.push(a.name);
  }

  const street = [a.streetNumber, a.street].filter(Boolean).join(" ");
  if (street) parts.push(street);

  if (a.district) parts.push(a.district);
  else if (a.subregion) parts.push(a.subregion);

  if (a.city) parts.push(a.city);
  if (a.region && a.region !== a.city) parts.push(a.region);

  return parts.filter(Boolean).join(", ") || null;
};

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const formatDistance = (distance) => {
  if (distance < 1) return `${Math.round(distance * 1000)}m`;
  return `${distance.toFixed(1)}km`;
};

const CenterPin = ({ type, isMoving }) => {
  const isPickup = type === "pickup";
  const pinColor = isPickup ? "#16A34A" : "#DC2626";
  const iconName = isPickup ? "radio-button-on" : "location";

  return (
    <View style={centerPinStyles.wrapper} pointerEvents="none">
      <View style={[centerPinStyles.shadow, isMoving && centerPinStyles.shadowMoving]} />
      <View
        style={[
          centerPinStyles.pinBody,
          { backgroundColor: pinColor },
          isMoving && centerPinStyles.pinBodyMoving,
        ]}
      >
        <Ionicons name={iconName} size={18} color="#FFFFFF" />
      </View>
      <View style={[centerPinStyles.pinStem, { backgroundColor: pinColor }]} />
      <View style={centerPinStyles.pinDot} />
    </View>
  );
};

const centerPinStyles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  shadow: {
    position: "absolute",
    top: 52,
    width: 22,
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  shadowMoving: {
    width: 28,
    height: 10,
    backgroundColor: "rgba(0,0,0,0.24)",
  },
  pinBody: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 10,
  },
  pinBodyMoving: {
    transform: [{ translateY: -8 }, { scale: 1.05 }],
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 14,
  },
  pinStem: {
    width: 4,
    height: 16,
    borderRadius: 999,
    marginTop: -2,
  },
  pinDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#183B5C",
    marginTop: -1,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
});

export default function MapPickerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const mapRef = useRef(null);
  const searchTimeout = useRef(null);
  const geocodeTimeout = useRef(null);
  const bottomSheetAnim = useRef(
    new Animated.Value(BOTTOM_SHEET_SNAP_POINTS.EXPANDED)
  ).current;
  const hasAutoCentered = useRef(false);
  const geocodeAbortRef = useRef(null);
  const scrollViewRef = useRef(null);
  const isScrollingRef = useRef(false);
  const scrollOffsetRef = useRef(0);
  const isProgrammaticMoveRef = useRef(false);
  const regionChangeTimeoutRef = useRef(null);
  const placesSessionTokenRef = useRef(createSessionToken());

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
  const [landmarks, setLandmarks] = useState([]);
  const [loadingLandmarks, setLoadingLandmarks] = useState(true);
  const [searchFocused, setSearchFocused] = useState(false);
  const [showAllLandmarks, setShowAllLandmarks] = useState(false);
  const [activeTab, setActiveTab] = useState("popular");
  const [isSheetExpanded, setIsSheetExpanded] = useState(true);
  const [isMapMoving, setIsMapMoving] = useState(false);

  const [favorites, setFavorites] = useState([]);
  const [showAddFavoriteModal, setShowAddFavoriteModal] = useState(false);
  const [favoriteNickname, setFavoriteNickname] = useState("");
  const [favoriteIcon, setFavoriteIcon] = useState("heart");
  const [favoriteColor, setFavoriteColor] = useState("#EF4444");
  const [editingFavoriteId, setEditingFavoriteId] = useState(null);
  const [showFavoriteOptions, setShowFavoriteOptions] = useState(false);
  const [selectedFavorite, setSelectedFavorite] = useState(null);

  const googleApiKey = Constants.expoConfig?.extra?.GOOGLE_API_KEY;
  const isPickup = type === "pickup";

  const [mapRegion, setMapRegion] = useState({
    latitude: initialLocation?.latitude || 7.7862,
    longitude: initialLocation?.longitude || 122.5894,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });

  const resetPlacesSessionToken = useCallback(() => {
    placesSessionTokenRef.current = createSessionToken();
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (isScrollingRef.current) return false;
        if (scrollOffsetRef.current > 0) return false;
        return Math.abs(gestureState.dy) > 10;
      },
      onPanResponderMove: (_, gestureState) => {
        const newHeight = BOTTOM_SHEET_SNAP_POINTS.EXPANDED - gestureState.dy;
        if (
          newHeight >= BOTTOM_SHEET_SNAP_POINTS.MINIMIZED &&
          newHeight <= BOTTOM_SHEET_SNAP_POINTS.EXPANDED
        ) {
          bottomSheetAnim.setValue(newHeight);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const currentHeight = BOTTOM_SHEET_SNAP_POINTS.EXPANDED - gestureState.dy;
        const velocity = gestureState.vy;
        let targetHeight;

        if (Math.abs(velocity) > 0.5) {
          targetHeight =
            velocity > 0
              ? BOTTOM_SHEET_SNAP_POINTS.MINIMIZED
              : BOTTOM_SHEET_SNAP_POINTS.EXPANDED;
        } else {
          if (currentHeight < BOTTOM_SHEET_SNAP_POINTS.PARTIAL) {
            targetHeight = BOTTOM_SHEET_SNAP_POINTS.MINIMIZED;
          } else if (currentHeight < BOTTOM_SHEET_SNAP_POINTS.EXPANDED) {
            targetHeight = BOTTOM_SHEET_SNAP_POINTS.PARTIAL;
          } else {
            targetHeight = BOTTOM_SHEET_SNAP_POINTS.EXPANDED;
          }
        }

        Animated.spring(bottomSheetAnim, {
          toValue: targetHeight,
          useNativeDriver: false,
          tension: 300,
          friction: 30,
        }).start(() => {
          setIsSheetExpanded(targetHeight === BOTTOM_SHEET_SNAP_POINTS.EXPANDED);
        });

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
    })
  ).current;

  const toggleBottomSheet = useCallback(() => {
    const targetHeight = isSheetExpanded
      ? BOTTOM_SHEET_SNAP_POINTS.MINIMIZED
      : BOTTOM_SHEET_SNAP_POINTS.EXPANDED;

    Animated.spring(bottomSheetAnim, {
      toValue: targetHeight,
      useNativeDriver: false,
      tension: 300,
      friction: 30,
    }).start(() => setIsSheetExpanded(!isSheetExpanded));

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [bottomSheetAnim, isSheetExpanded]);

  const handleScrollBeginDrag = () => {
    isScrollingRef.current = true;
  };

  const handleScrollEndDrag = () => {
    setTimeout(() => {
      isScrollingRef.current = false;
    }, 100);
  };

  const handleScroll = (event) => {
    scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
  };

  useEffect(() => {
    loadFavorites();
  }, []);

  const loadFavorites = async () => {
    try {
      const stored = await AsyncStorage.getItem(FAVORITES_STORAGE_KEY);
      if (stored) setFavorites(JSON.parse(stored));
    } catch (e) {
      console.log("Error loading favorites:", e);
    }
  };

  const saveFavorites = async (newFavorites) => {
    try {
      await AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(newFavorites));
      setFavorites(newFavorites);
    } catch (e) {
      console.log("Error saving favorites:", e);
    }
  };

  const addToFavorites = async () => {
    if (!selectedLocation) {
      Alert.alert("No Location", "Please select a location first");
      return;
    }

    if (!favoriteNickname.trim()) {
      Alert.alert("Required", "Please enter a nickname for this location");
      return;
    }

    const newFavorite = {
      id: Date.now().toString(),
      nickname: favoriteNickname.trim(),
      address,
      latitude: selectedLocation.latitude,
      longitude: selectedLocation.longitude,
      icon: favoriteIcon,
      color: favoriteColor,
      type,
      createdAt: new Date().toISOString(),
    };

    let updatedFavorites;

    if (editingFavoriteId) {
      updatedFavorites = favorites.map((f) =>
        f.id === editingFavoriteId ? { ...newFavorite, id: editingFavoriteId } : f
      );
    } else {
      updatedFavorites = [...favorites, newFavorite];
    }

    await saveFavorites(updatedFavorites);
    setShowAddFavoriteModal(false);
    setFavoriteNickname("");
    setFavoriteIcon("heart");
    setFavoriteColor("#EF4444");
    setEditingFavoriteId(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      "Success",
      editingFavoriteId ? "Favorite updated!" : "Location saved to favorites!"
    );
  };

  const removeFromFavorites = async (id) => {
    Alert.alert("Remove Favorite", "Remove this saved location?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await saveFavorites(favorites.filter((f) => f.id !== id));
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        },
      },
    ]);
  };

  const editFavorite = (fav) => {
    setEditingFavoriteId(fav.id);
    setFavoriteNickname(fav.nickname);
    setFavoriteIcon(fav.icon || "heart");
    setFavoriteColor(fav.color || "#EF4444");
    setShowAddFavoriteModal(true);
  };

  const selectFavoriteLocation = (fav) => {
    const coords = {
      latitude: fav.latitude,
      longitude: fav.longitude,
    };

    const region = {
      ...coords,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };

    setSelectedLocation(coords);
    setAddress(fav.address);
    setMapRegion(region);

    isProgrammaticMoveRef.current = true;
    mapRef.current?.animateToRegion(region, 500);

    setTimeout(() => {
      isProgrammaticMoveRef.current = false;
    }, 700);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowFavoriteOptions(false);
  };

  const isLocationFavorite = () => {
    if (!selectedLocation) return false;
    return favorites.some(
      (f) =>
        Math.abs(f.latitude - selectedLocation.latitude) < 0.0001 &&
        Math.abs(f.longitude - selectedLocation.longitude) < 0.0001
    );
  };

  const popularLandmarks = useMemo(
    () =>
      [...landmarks]
        .sort((a, b) => (b.popularity_score || 0) - (a.popularity_score || 0))
        .slice(0, 8),
    [landmarks]
  );

  const nearbyLandmarks = useMemo(() => {
    if (!selectedLocation) return [];
    return [...landmarks]
      .map((l) => ({
        ...l,
        distance: calculateDistance(
          selectedLocation.latitude,
          selectedLocation.longitude,
          l.latitude,
          l.longitude
        ),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10);
  }, [landmarks, selectedLocation]);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("location_landmarks")
          .select(
            "id, name, landmark_type, address, barangay, city, province, latitude, longitude, popularity_score"
          )
          .eq("is_active", true)
          .order("popularity_score", { ascending: false });

        if (!error && data) setLandmarks(data);
      } catch (e) {
        console.log("Error fetching landmarks:", e);
      } finally {
        setLoadingLandmarks(false);
      }
    })();
  }, []);

  const fetchPlaceDetailsNew = useCallback(
    async (placeId, sessionToken) => {
      const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(
        placeId
      )}?languageCode=en&regionCode=PH${
        sessionToken ? `&sessionToken=${encodeURIComponent(sessionToken)}` : ""
      }`;

      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": googleApiKey,
          "X-Goog-FieldMask":
            "id,displayName,formattedAddress,location,addressComponents,types,rating,userRatingCount,priceLevel",
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error?.message || "Failed to get place details");
      }

      return data;
    },
    [googleApiKey]
  );

  const searchNearbyPlaceName = useCallback(
    async (coords) => {
      console.log("=== searchNearbyPlaceName START ===", coords);

      if (!googleApiKey) {
        console.log("No Google API key");
        return null;
      }

      try {
        const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": googleApiKey,
            "X-Goog-FieldMask":
              "places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents,places.types",
          },
          body: JSON.stringify({
            maxResultCount: 15,                    // Increased
            locationRestriction: {
              circle: {
                center: coords,
                radius: 100.0,                     // ← Important: Increased to 100 meters
              },
            },
            languageCode: "en",
            regionCode: "PH",
          }),
        });

        const data = await res.json();
        if (!res.ok || !data?.places?.length) {
          console.log("Nearby search failed or no places");
          return null;
        }

        const sorted = data.places
          .filter(p => typeof p?.location?.latitude === "number" && typeof p?.location?.longitude === "number")
          .map((p) => ({
            ...p,
            distance: calculateDistance(
              coords.latitude,
              coords.longitude,
              p.location.latitude,
              p.location.longitude
            ),
          }))
          .sort((a, b) => a.distance - b.distance);

        // Prefer real building/establishment
        const best = sorted.find((p) =>
          p.types?.some((t) =>
            ["establishment", "point_of_interest", "premise", "building"].includes(t)
          )
        ) || sorted[0];

        if (!best) return null;

        console.log("Best nearby place:", best.displayName?.text, "Distance:", best.distance);

        return {
          name: getBestPlaceNameFromNewPlace(best),
          address: extractCleanAddressFromPlaceDetails(best),
          raw: best,
          distance: best.distance,
        };
      } catch (e) {
        console.log("searchNearbyPlaceName error:", e);
        return null;
      }
    },
    [googleApiKey]
  );

  const getAddressFromCoords = useCallback(
    async (coords, immediate = false) => {
      if (geocodeTimeout.current) clearTimeout(geocodeTimeout.current);

      const run = async () => {
        const token = {};
        geocodeAbortRef.current = token;

        try {
          setLoading(true);
          let resolvedAddress = null;
          let geocodePlaceName = null;
          let geocodeBuiltAddress = null;

          // 1. Google Reverse Geocoding
          if (googleApiKey) {
            try {
              const res = await fetch(
                `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coords.latitude},${coords.longitude}&key=${googleApiKey}`
              );
              const json = await res.json();

              if (json.status === "OK" && json.results?.length > 0) {
                for (const result of json.results) {
                  const built = buildAddressFromGeocodeResult(result);
                  const placeName = getBestPlaceNameFromGeocodeResult(result);

                  if (placeName) {
                    geocodePlaceName = placeName;
                    geocodeBuiltAddress = built || extractCleanAddressFromGeocode(result);
                    break;
                  }
                  if (!geocodeBuiltAddress) {
                    geocodeBuiltAddress = extractCleanAddressFromGeocode(result) || result.formatted_address || null;
                  }
                }
              }
            } catch (e) {
              console.log("Google geocoding error:", e);
            }
          }

          if (geocodeAbortRef.current !== token) return;

          // 2. Always try Nearby Places (main improvement)
          const nearbyPlace = await searchNearbyPlaceName(coords);
          if (geocodeAbortRef.current !== token) return;

          // Smart combining - This is the key fix
          if (nearbyPlace?.name && nearbyPlace.distance <= 0.12) {   // 120 meters tolerance
            const placeName = nearbyPlace.name;

            if (geocodeBuiltAddress) {
              if (!geocodeBuiltAddress.toLowerCase().includes(placeName.toLowerCase())) {
                resolvedAddress = `${placeName}, ${geocodeBuiltAddress}`;
              } else {
                resolvedAddress = geocodeBuiltAddress;
              }
            } else {
              resolvedAddress = nearbyPlace.address || placeName;
            }
          } 
          else if (geocodePlaceName && geocodeBuiltAddress) {
            resolvedAddress = geocodeBuiltAddress;
          } 
          else if (geocodeBuiltAddress) {
            resolvedAddress = geocodeBuiltAddress;
          }

          // 3. Expo fallback
          if (!resolvedAddress) {
            try {
              const arr = await Location.reverseGeocodeAsync(coords);
              if (geocodeAbortRef.current !== token) return;
              if (arr[0]) {
                resolvedAddress = buildExpoReverseGeocodeAddress(arr[0]);
              }
            } catch (e) {
              console.log("Expo geocode error:", e);
            }
          }

          if (geocodeAbortRef.current !== token) return;

          setAddress(resolvedAddress || "Selected location");

        } catch (e) {
          console.log("getAddressFromCoords error:", e);
          if (geocodeAbortRef.current === token) {
            setAddress("Selected location");
          }
        } finally {
          if (geocodeAbortRef.current === token) {
            setLoading(false);
          }
        }
      };

      if (immediate) run();
      else geocodeTimeout.current = setTimeout(run, GEOCODE_DEBOUNCE_MS);
    },
    [googleApiKey, searchNearbyPlaceName]
  );

  const getCurrentLocation = useCallback(
    async ({ isInitial = false, forceRecenter = false } = {}) => {
      try {
        setIsLocating(true);
        setErrorMessage("");

        if (!isInitial) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }

        const { status } = await Location.requestForegroundPermissionsAsync();

        if (status !== "granted") {
          Alert.alert(
            "Location Required",
            "Please enable location access to find places near you.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: () => Location.openSettings() },
            ]
          );
          return;
        }

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const coords = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };

        const nextRegion = {
          ...coords,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        };

        setSelectedLocation(coords);
        setMapRegion(nextRegion);

        if ((forceRecenter || !hasAutoCentered.current) && mapRef.current) {
          isProgrammaticMoveRef.current = true;
          mapRef.current.animateToRegion(nextRegion, 800);

          setTimeout(() => {
            isProgrammaticMoveRef.current = false;
          }, 900);

          hasAutoCentered.current = true;
        }

        await getAddressFromCoords(coords, true);

        if (!isInitial) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch (e) {
        setErrorMessage("Unable to get your location. Check your GPS.");
        setTimeout(() => setErrorMessage(""), 3000);
      } finally {
        setIsLocating(false);
      }
    },
    [getAddressFromCoords]
  );

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        if (initialLocation) {
          const region = {
            latitude: initialLocation.latitude,
            longitude: initialLocation.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          };

          setSelectedLocation(initialLocation);
          setMapRegion(region);
          await getAddressFromCoords(initialLocation, true);

          setTimeout(() => {
            isProgrammaticMoveRef.current = true;
            mapRef.current?.animateToRegion(region, 500);

            setTimeout(() => {
              isProgrammaticMoveRef.current = false;
            }, 700);
          }, 250);

          hasAutoCentered.current = true;
        } else {
          await getCurrentLocation({ isInitial: true, forceRecenter: true });
        }
      } catch (e) {
        console.log("Initial location error:", e);
      } finally {
        if (mounted) setInitialAutoLocating(false);
      }
    })();

    return () => {
      mounted = false;
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      if (geocodeTimeout.current) clearTimeout(geocodeTimeout.current);
      if (regionChangeTimeoutRef.current) clearTimeout(regionChangeTimeoutRef.current);
    };
  }, [getAddressFromCoords, getCurrentLocation, initialLocation]);

  useEffect(() => {
    if (searchQuery.length < 3) {
      setSearchResults([]);
      setShowSearchResults(false);
      resetPlacesSessionToken();
      return;
    }

    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      performSearch();
    }, 450);

    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [searchQuery, resetPlacesSessionToken]);

  const handleRegionChange = useCallback((region) => {
    setMapRegion(region);

    if (!isProgrammaticMoveRef.current) {
      setIsMapMoving(true);
    }
  }, []);

  const handleRegionChangeComplete = useCallback(
    (region) => {
      setMapRegion(region);

      if (isProgrammaticMoveRef.current) return;
      if (isLocating || initialAutoLocating) return;

      if (regionChangeTimeoutRef.current) {
        clearTimeout(regionChangeTimeoutRef.current);
      }

      regionChangeTimeoutRef.current = setTimeout(() => {
        const coords = {
          latitude: region.latitude,
          longitude: region.longitude,
        };

        setSelectedLocation(coords);
        getAddressFromCoords(coords);
        setIsMapMoving(false);
      }, 120);
    },
    [getAddressFromCoords, initialAutoLocating, isLocating]
  );

  const handleSelectLandmark = useCallback((landmark) => {
    const coords = {
      latitude: landmark.latitude,
      longitude: landmark.longitude,
    };

    const region = {
      ...coords,
      latitudeDelta: 0.008,
      longitudeDelta: 0.008,
    };

    const addrParts = [landmark.name];
    if (landmark.address) {
      addrParts.push(landmark.address);
    } else {
      if (landmark.barangay) addrParts.push(landmark.barangay);
      if (landmark.city) addrParts.push(landmark.city);
      if (landmark.province) addrParts.push(landmark.province);
    }

    setSelectedLocation(coords);
    setAddress(addrParts.filter(Boolean).join(", "));
    setMapRegion(region);

    isProgrammaticMoveRef.current = true;
    mapRef.current?.animateToRegion(region, 500);

    setTimeout(() => {
      isProgrammaticMoveRef.current = false;
    }, 700);

    Keyboard.dismiss();
    setShowAllLandmarks(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const performSearch = useCallback(async () => {
    if (!searchQuery.trim() || searchQuery.length < 3) return;

    try {
      setSearching(true);
      let results = [];
      const q = searchQuery.toLowerCase();

      const localMatches = landmarks.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          (l.address || "").toLowerCase().includes(q) ||
          (l.barangay || "").toLowerCase().includes(q)
      );

      if (localMatches.length > 0) {
        results = localMatches.map((l) => ({
          id: l.id,
          address: [
            l.name,
            l.address || [l.barangay, l.city, l.province].filter(Boolean).join(", "),
          ]
            .filter(Boolean)
            .join(", "),
          location: { lat: l.latitude, lng: l.longitude },
          isLandmark: true,
          landmarkType: l.landmark_type,
        }));
      }

      if (googleApiKey) {
        const autocompleteBody = {
          input: searchQuery,
          includedRegionCodes: ["ph"],
          languageCode: "en",
          sessionToken: placesSessionTokenRef.current,
        };

        if (selectedLocation) {
          autocompleteBody.locationBias = {
            circle: {
              center: {
                latitude: selectedLocation.latitude,
                longitude: selectedLocation.longitude,
              },
              radius: 50000,
            },
          };
        }

        const acRes = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": googleApiKey,
            "X-Goog-FieldMask":
              "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.types",
          },
          body: JSON.stringify(autocompleteBody),
        });

        const acData = await acRes.json();

        const placePredictions =
          acData?.suggestions
            ?.map((s) => s.placePrediction)
            ?.filter((p) => p?.placeId) || [];

        if (placePredictions.length > 0) {
          const detailRequests = placePredictions.slice(0, 5).map(async (prediction) => {
            try {
              const detail = await fetchPlaceDetailsNew(
                prediction.placeId,
                placesSessionTokenRef.current
              );

              const betterAddress =
                extractCleanAddressFromPlaceDetails(detail) ||
                detail?.displayName?.text ||
                prediction?.text?.text ||
                "Selected place";

              const isEstablishment =
                detail?.types?.includes("establishment") ||
                detail?.types?.includes("point_of_interest") ||
                detail?.types?.includes("premise");

              return {
                id: detail.id || prediction.placeId,
                address: betterAddress,
                location: {
                  lat: detail?.location?.latitude,
                  lng: detail?.location?.longitude,
                },
                isLandmark: false,
                placeId: prediction.placeId,
                rawPlace: detail,
                isEstablishment,
                establishmentName: detail?.displayName?.text || null,
                rating: detail?.rating,
                userRatingCount: detail?.userRatingCount,
                priceLevel: detail?.priceLevel,
              };
            } catch (e) {
              console.log("Error fetching place details:", e);
              return null;
            }
          });

          const details = await Promise.all(detailRequests);

          const googleResults = details.filter(
            (item) =>
              item &&
              item.location &&
              typeof item.location.lat === "number" &&
              typeof item.location.lng === "number"
          );

          const unique = googleResults.filter(
            (g) =>
              !results.some(
                (r) =>
                  Math.abs(r.location.lat - g.location.lat) < 0.0001 &&
                  Math.abs(r.location.lng - g.location.lng) < 0.0001
              )
          );

          results = [...results, ...unique];
        }
      }

      if (results.length === 0 && googleApiKey) {
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
            searchQuery
          )}&components=country:PH&key=${googleApiKey}`
        );
        const data = await res.json();

        if (data.status === "OK" && data.results?.length > 0) {
          results = data.results.map((r) => ({
            id: r.place_id || Math.random().toString(),
            address: extractCleanAddressFromGeocode(r) || r.formatted_address,
            location: {
              lat: r.geometry.location.lat,
              lng: r.geometry.location.lng,
            },
            isLandmark: false,
          }));
        }
      }

      setSearchResults(results);
      setShowSearchResults(results.length > 0);
    } catch (e) {
      console.log("Places search error:", e);
      setSearchResults([]);
      setShowSearchResults(false);
    } finally {
      setSearching(false);
    }
  }, [fetchPlaceDetailsNew, googleApiKey, landmarks, searchQuery, selectedLocation]);

  const handleSelectSearchResult = useCallback(
    async (result) => {
      try {
        const coords = {
          latitude: result.location.lat,
          longitude: result.location.lng,
        };

        const region = {
          ...coords,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        };

        setSelectedLocation(coords);
        setAddress(result.address);
        setSearchQuery("");
        setSearchResults([]);
        setShowSearchResults(false);
        setMapRegion(region);

        isProgrammaticMoveRef.current = true;
        mapRef.current?.animateToRegion(region, 500);

        setTimeout(() => {
          isProgrammaticMoveRef.current = false;
        }, 700);

        Keyboard.dismiss();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        resetPlacesSessionToken();
      } catch (e) {
        console.log("Select search result error:", e);
      }
    },
    [resetPlacesSessionToken]
  );

  const handleConfirm = useCallback(() => {
    if (!selectedLocation) {
      Alert.alert("No Location Selected", "Drag the map to set your location.");
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (onSelect) {
      onSelect(selectedLocation, address);
    }

    navigation.goBack();
  }, [address, navigation, onSelect, selectedLocation]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
    setShowSearchResults(false);
    resetPlacesSessionToken();
  }, [resetPlacesSessionToken]);

  const renderSearchResult = useCallback(
    ({ item }) => {
      const color = item.isLandmark
        ? LANDMARK_COLORS[item.landmarkType] || "#183B5C"
        : item.isEstablishment
        ? "#10B981"
        : "#183B5C";

      const icon = item.isLandmark
        ? LANDMARK_ICONS[item.landmarkType] || "location"
        : item.isEstablishment
        ? "business-outline"
        : "location-outline";

      return (
        <TouchableOpacity
          style={styles.searchResultItem}
          onPress={() => handleSelectSearchResult(item)}
          activeOpacity={0.75}
        >
          <View style={[styles.searchResultIcon, { backgroundColor: `${color}18` }]}>
            <Ionicons name={icon} size={18} color={color} />
          </View>

          <View style={styles.searchResultContent}>
            <Text style={styles.searchResultText} numberOfLines={2}>
              {item.address}
            </Text>

            <View style={styles.searchResultMeta}>
              {item.isEstablishment && item.establishmentName ? (
                <Text
                  style={[
                    styles.searchResultBadge,
                    { color: "#10B981", backgroundColor: "#D1FAE5" },
                  ]}
                >
                  Business
                </Text>
              ) : null}

              {item.rating ? (
                <View style={styles.ratingBadge}>
                  <Ionicons name="star" size={10} color="#F59E0B" />
                  <Text style={styles.ratingText}>{item.rating}</Text>
                  {item.userRatingCount ? (
                    <Text style={styles.ratingCountText}>({item.userRatingCount})</Text>
                  ) : null}
                </View>
              ) : null}

              {item.priceLevel ? (
                <Text style={styles.priceBadge}>{"₱".repeat(item.priceLevel)}</Text>
              ) : null}

              {item.isLandmark ? (
                <Text
                  style={[
                    styles.searchResultBadge,
                    { color, backgroundColor: `${color}15` },
                  ]}
                >
                  {LANDMARK_LABELS[item.landmarkType] || item.landmarkType}
                </Text>
              ) : null}
            </View>
          </View>

          <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
        </TouchableOpacity>
      );
    },
    [handleSelectSearchResult]
  );

  const renderPopularSpot = useCallback(
    (landmark) => {
      const color = LANDMARK_COLORS[landmark.landmark_type] || "#94A3B8";
      const icon = LANDMARK_ICONS[landmark.landmark_type] || "location";

      return (
        <TouchableOpacity
          key={landmark.id}
          style={styles.popularSpotCard}
          onPress={() => handleSelectLandmark(landmark)}
          activeOpacity={0.75}
        >
          <View style={[styles.popularSpotIcon, { backgroundColor: `${color}15` }]}>
            <Ionicons name={icon} size={22} color={color} />
          </View>

          <Text style={styles.popularSpotName} numberOfLines={1}>
            {landmark.name}
          </Text>

          <Text style={styles.popularSpotType}>
            {LANDMARK_LABELS[landmark.landmark_type] || landmark.landmark_type}
          </Text>
        </TouchableOpacity>
      );
    },
    [handleSelectLandmark]
  );

  const renderFavoriteCard = useCallback(
    (favorite) => (
      <TouchableOpacity
        key={favorite.id}
        style={styles.favoriteCard}
        onPress={() => selectFavoriteLocation(favorite)}
        onLongPress={() => {
          setSelectedFavorite(favorite);
          setShowFavoriteOptions(true);
        }}
        activeOpacity={0.7}
      >
        <View style={[styles.favoriteIcon, { backgroundColor: `${favorite.color}18` }]}>
          <Ionicons name={favorite.icon} size={22} color={favorite.color} />
        </View>

        <View style={styles.favoriteContent}>
          <Text style={styles.favoriteName} numberOfLines={1}>
            {favorite.nickname}
          </Text>
          <Text style={styles.favoriteAddress} numberOfLines={1}>
            {favorite.address}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => removeFromFavorites(favorite.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close-circle" size={22} color="#EF4444" />
        </TouchableOpacity>
      </TouchableOpacity>
    ),
    [selectFavoriteLocation]
  );

  const renderNearbyLandmark = useCallback(
    (landmark) => {
      const color = LANDMARK_COLORS[landmark.landmark_type] || "#94A3B8";
      const icon = LANDMARK_ICONS[landmark.landmark_type] || "location";

      return (
        <TouchableOpacity
          key={landmark.id}
          style={styles.nearbyCard}
          onPress={() => handleSelectLandmark(landmark)}
          activeOpacity={0.7}
        >
          <View style={[styles.nearbyIcon, { backgroundColor: `${color}15` }]}>
            <Ionicons name={icon} size={20} color={color} />
          </View>

          <View style={styles.nearbyContent}>
            <Text style={styles.nearbyName} numberOfLines={1}>
              {landmark.name}
            </Text>
            <Text style={styles.nearbyType}>
              {LANDMARK_LABELS[landmark.landmark_type] || landmark.landmark_type}
            </Text>
          </View>

          <View style={styles.distancePill}>
            <Text style={styles.nearbyDistance}>{formatDistance(landmark.distance)}</Text>
          </View>
        </TouchableOpacity>
      );
    },
    [handleSelectLandmark]
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={mapRegion}
        onRegionChange={handleRegionChange}
        onRegionChangeComplete={handleRegionChangeComplete}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        rotateEnabled={false}
        pitchEnabled={false}
        moveOnMarkerPress={false}
        loadingEnabled
        loadingIndicatorColor="#183B5C"
        loadingBackgroundColor="#F8FAFC"
        onError={() =>
          Alert.alert("Map Error", "Unable to load map. Please check your connection.")
        }
      />

      <View style={styles.centerPinContainer} pointerEvents="none">
        <CenterPin type={type} isMoving={isMapMoving} />
      </View>

      {!initialAutoLocating && (
        <View style={styles.tapHint} pointerEvents="none">
          <View style={styles.tapHintBubble}>
            <Ionicons name="move-outline" size={18} color="#183B5C" />
            <Text style={styles.tapHintText}>
              Drag the map to set {isPickup ? "pickup" : "drop-off"}
            </Text>
          </View>
        </View>
      )}

      <View style={[styles.topOverlay, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.iconButton}
            activeOpacity={0.75}
          >
            <Ionicons name="arrow-back" size={22} color="#183B5C" />
          </TouchableOpacity>

          <View
            style={[
              styles.titleBadge,
              isPickup ? styles.titleBadgePickup : styles.titleBadgeDropoff,
            ]}
          >
            <Ionicons
              name={isPickup ? "radio-button-on" : "location"}
              size={14}
              color={isPickup ? "#059669" : "#DC2626"}
            />
            <Text
              style={[
                styles.screenTitle,
                isPickup ? styles.titlePickup : styles.titleDropoff,
              ]}
            >
              {isPickup ? "Pickup Location" : "Drop-off Location"}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => getCurrentLocation({ forceRecenter: true })}
            style={[styles.iconButton, isLocating && styles.iconButtonActive]}
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
          <View style={[styles.searchBox, searchFocused && styles.searchBoxFocused]}>
            <Ionicons name="search" size={18} color={searchFocused ? "#183B5C" : "#94A3B8"} />

            <TextInput
              style={styles.searchInput}
              placeholder="Search places, businesses, or addresses..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={performSearch}
              editable={!initialAutoLocating}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
            />

            {searching ? (
              <ActivityIndicator size="small" color="#183B5C" />
            ) : searchQuery.length > 0 ? (
              <TouchableOpacity
                onPress={handleClearSearch}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
                keyExtractor={(item) => item.id.toString()}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                maxToRenderPerBatch={10}
              />
            </View>
          )}
        </View>

        {errorMessage ? (
          <View style={styles.errorChip}>
            <Ionicons name="alert-circle" size={15} color="#DC2626" />
            <Text style={styles.errorChipText}>{errorMessage}</Text>
          </View>
        ) : null}
      </View>

      {initialAutoLocating && (
        <View style={styles.mapLoadingOverlay} pointerEvents="auto">
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#183B5C" />
            <Text style={styles.mapLoadingTitle}>Finding your location</Text>
            <Text style={styles.mapLoadingSubtext}>Discovering places near you…</Text>
          </View>
        </View>
      )}

      <Animated.View
        style={[
          styles.bottomCard,
          { height: bottomSheetAnim, paddingBottom: Math.max(insets.bottom + 12, 18) },
        ]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          onPress={toggleBottomSheet}
          activeOpacity={0.7}
          style={styles.sheetHandleContainer}
        >
          <View style={styles.sheetHandle} />
          <Ionicons
            name={isSheetExpanded ? "chevron-down" : "chevron-up"}
            size={14}
            color="#CBD5E1"
            style={{ marginTop: 2 }}
          />
        </TouchableOpacity>

        <View style={styles.locationStrip}>
          <View style={[styles.locationBadge, isPickup ? styles.pickupIconBg : styles.dropoffIconBg]}>
            <Ionicons
              name={isPickup ? "radio-button-on" : "location"}
              size={16}
              color={isPickup ? "#059669" : "#DC2626"}
            />
          </View>

          <View style={styles.locationTextWrap}>
            {loading ? (
              <View style={styles.inlineLoading}>
                <ActivityIndicator size="small" color="#183B5C" />
                <Text style={styles.inlineLoadingText}>Getting address…</Text>
              </View>
            ) : (
              <Text style={styles.locationAddress} numberOfLines={2}>
                {address || `Drag the map to set ${isPickup ? "pickup" : "drop-off"}`}
              </Text>
            )}
          </View>

          {selectedLocation && (
            <TouchableOpacity
              style={styles.saveButton}
              onPress={() => {
                setEditingFavoriteId(null);
                setFavoriteNickname("");
                setFavoriteIcon("heart");
                setFavoriteColor("#EF4444");
                setShowAddFavoriteModal(true);
              }}
            >
              <Ionicons
                name={isLocationFavorite() ? "heart" : "heart-outline"}
                size={20}
                color={isLocationFavorite() ? "#EF4444" : "#94A3B8"}
              />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.tabContainer}>
          {[
            { key: "popular", label: "Popular", icon: "flame", activeColor: "#F59E0B" },
            { key: "favorites", label: "Saved", icon: "heart", activeColor: "#EF4444" },
            { key: "nearby", label: "Nearby", icon: "location", activeColor: "#10B981" },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.activeTab]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Ionicons
                name={tab.icon}
                size={15}
                color={activeTab === tab.key ? tab.activeColor : "#94A3B8"}
              />
              <Text style={[styles.tabText, activeTab === tab.key && { color: "#0F172A" }]}>
                {tab.label}
              </Text>
              {tab.key === "favorites" && favorites.length > 0 && (
                <View style={styles.favoriteBadge}>
                  <Text style={styles.favoriteBadgeText}>{favorites.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          style={styles.bottomScrollView}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEndDrag}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
        >
          {activeTab === "popular" && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="flame" size={16} color="#F59E0B" />
                  <Text style={styles.sectionTitle}>Trending Places</Text>
                </View>

                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowAllLandmarks(!showAllLandmarks);
                  }}
                >
                  <Text style={styles.seeAll}>{showAllLandmarks ? "Show less" : "See all"}</Text>
                </TouchableOpacity>
              </View>

              {loadingLandmarks ? (
                <View style={styles.emptyState}>
                  <ActivityIndicator size="small" color="#183B5C" />
                  <Text style={styles.emptyStateTitle}>Loading places...</Text>
                </View>
              ) : !showAllLandmarks ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.popularScroll}
                  decelerationRate="fast"
                >
                  {popularLandmarks.map(renderPopularSpot)}
                </ScrollView>
              ) : (
                <View>
                  {landmarks.map((l) => (
                    <TouchableOpacity
                      key={l.id}
                      style={styles.allLandmarkCard}
                      onPress={() => handleSelectLandmark(l)}
                    >
                      <View
                        style={[
                          styles.allLandmarkIcon,
                          {
                            backgroundColor: `${LANDMARK_COLORS[l.landmark_type] || "#94A3B8"}15`,
                          },
                        ]}
                      >
                        <Ionicons
                          name={LANDMARK_ICONS[l.landmark_type] || "location"}
                          size={18}
                          color={LANDMARK_COLORS[l.landmark_type] || "#94A3B8"}
                        />
                      </View>

                      <View style={styles.allLandmarkContent}>
                        <Text style={styles.allLandmarkName}>{l.name}</Text>
                        <Text style={styles.allLandmarkAddress} numberOfLines={1}>
                          {l.address || l.barangay}
                        </Text>
                      </View>

                      <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {activeTab === "favorites" && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="heart" size={16} color="#EF4444" />
                  <Text style={styles.sectionTitle}>Saved Locations</Text>
                </View>
              </View>

              {favorites.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="heart-outline" size={44} color="#E2E8F0" />
                  <Text style={styles.emptyStateTitle}>No saved places yet</Text>
                  <Text style={styles.emptyStateText}>
                    Tap the ♥ next to a selected location to save it here
                  </Text>
                </View>
              ) : (
                <View>{favorites.map(renderFavoriteCard)}</View>
              )}
            </View>
          )}

          {activeTab === "nearby" && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="location" size={16} color="#10B981" />
                  <Text style={styles.sectionTitle}>Nearby Places</Text>
                </View>

                {selectedLocation && (
                  <TouchableOpacity onPress={() => getCurrentLocation({ forceRecenter: true })}>
                    <Text style={styles.seeAll}>Refresh</Text>
                  </TouchableOpacity>
                )}
              </View>

              {!selectedLocation ? (
                <View style={styles.emptyState}>
                  <Ionicons name="pin-outline" size={44} color="#E2E8F0" />
                  <Text style={styles.emptyStateTitle}>No point selected yet</Text>
                  <Text style={styles.emptyStateText}>
                    Drag the map to set a location and see what's nearby
                  </Text>
                </View>
              ) : nearbyLandmarks.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="map-outline" size={44} color="#E2E8F0" />
                  <Text style={styles.emptyStateTitle}>Nothing found nearby</Text>
                  <Text style={styles.emptyStateText}>Try moving the map to a different spot</Text>
                </View>
              ) : (
                <View>{nearbyLandmarks.map(renderNearbyLandmark)}</View>
              )}
            </View>
          )}

          <View style={{ height: 80 }} />
        </ScrollView>
      </Animated.View>

      <TouchableOpacity
        style={[
          styles.confirmButton,
          isPickup ? styles.confirmPickup : styles.confirmDropoff,
          (!selectedLocation || loading) && styles.confirmDisabled,
        ]}
        onPress={handleConfirm}
        disabled={!selectedLocation || loading}
        activeOpacity={0.88}
      >
        <Ionicons name={isPickup ? "radio-button-on" : "location"} size={18} color="#FFF" />
        <Text style={styles.confirmText}>Confirm {isPickup ? "Pickup" : "Drop-off"}</Text>
        <Ionicons name="checkmark-circle" size={20} color="rgba(255,255,255,0.8)" />
      </TouchableOpacity>

      <Modal
        visible={showAddFavoriteModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddFavoriteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingFavoriteId ? "Edit Saved Place" : "Save This Location"}
              </Text>
              <TouchableOpacity
                onPress={() => setShowAddFavoriteModal(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>Nickname</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g., Home, Office, School…"
              placeholderTextColor="#94A3B8"
              value={favoriteNickname}
              onChangeText={setFavoriteNickname}
              maxLength={30}
            />

            <Text style={styles.modalLabel}>Icon</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconPicker}>
              {[
                "heart",
                "home",
                "briefcase",
                "restaurant",
                "cart",
                "business",
                "school",
                "medkit",
                "bus",
                "cafe",
              ].map((icon) => (
                <TouchableOpacity
                  key={icon}
                  style={[styles.iconOption, favoriteIcon === icon && styles.iconOptionSelected]}
                  onPress={() => setFavoriteIcon(icon)}
                >
                  <Ionicons
                    name={icon}
                    size={22}
                    color={favoriteIcon === icon ? "#183B5C" : "#94A3B8"}
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.modalLabel}>Color</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorPicker}>
              {[
                "#EF4444",
                "#10B981",
                "#3B82F6",
                "#F59E0B",
                "#8B5CF6",
                "#EC4899",
                "#06B6D4",
                "#183B5C",
              ].map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorOption,
                    { backgroundColor: color },
                    favoriteColor === color && styles.colorOptionSelected,
                  ]}
                  onPress={() => setFavoriteColor(color)}
                />
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.modalButton} onPress={addToFavorites}>
              <Ionicons name="heart" size={16} color="#FFF" />
              <Text style={styles.modalButtonText}>
                {editingFavoriteId ? "Update" : "Save Location"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showFavoriteOptions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFavoriteOptions(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowFavoriteOptions(false)}
        >
          <View style={styles.optionsModal}>
            {[
              {
                icon: "locate",
                color: "#183B5C",
                label: "Go Here",
                onPress: () => selectedFavorite && selectFavoriteLocation(selectedFavorite),
              },
              {
                icon: "create-outline",
                color: "#3B82F6",
                label: "Edit",
                onPress: () => {
                  if (selectedFavorite) {
                    editFavorite(selectedFavorite);
                    setShowFavoriteOptions(false);
                  }
                },
              },
              {
                icon: "trash-outline",
                color: "#EF4444",
                label: "Remove",
                onPress: () => {
                  if (selectedFavorite) {
                    removeFromFavorites(selectedFavorite.id);
                    setShowFavoriteOptions(false);
                  }
                },
                danger: true,
              },
            ].map((opt, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.optionItem, opt.danger && styles.optionItemDanger]}
                onPress={opt.onPress}
              >
                <Ionicons name={opt.icon} size={20} color={opt.color} />
                <Text style={[styles.optionText, opt.danger && styles.optionTextDanger]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  map: { flex: 1 },

  centerPinContainer: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: [{ translateX: -23 }, { translateY: -58 }],
    zIndex: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  tapHint: {
    position: "absolute",
    top: "38%",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 5,
  },
  tapHintBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  tapHintText: { fontSize: 14, color: "#183B5C", fontWeight: "600" },

  topOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    zIndex: 10,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 10,
  },
  titleBadge: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.97)",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 5,
  },
  titleBadgePickup: { borderBottomWidth: 2, borderBottomColor: "#10B981" },
  titleBadgeDropoff: { borderBottomWidth: 2, borderBottomColor: "#EF4444" },
  screenTitle: { fontSize: 15, fontWeight: "700" },
  titlePickup: { color: "#059669" },
  titleDropoff: { color: "#DC2626" },

  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.97)",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 5,
  },
  iconButtonActive: { backgroundColor: "#EBF4FF" },

  searchWrapper: { zIndex: 11 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.98)",
    borderRadius: 16,
    paddingHorizontal: 14,
    minHeight: 50,
    borderWidth: 1.5,
    borderColor: "transparent",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 6,
  },
  searchBoxFocused: { borderColor: "#183B5C" },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: "#0F172A",
    paddingVertical: 13,
  },
  searchResultsContainer: {
    marginTop: 6,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    maxHeight: SCREEN_HEIGHT * 0.32,
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
  searchResultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  searchResultIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  searchResultContent: { flex: 1 },
  searchResultText: {
    fontSize: 13,
    lineHeight: 19,
    color: "#0F172A",
    fontWeight: "500",
  },
  searchResultMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    flexWrap: "wrap",
  },
  searchResultBadge: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "capitalize",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 2,
  },
  ratingText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#D97706",
  },
  ratingCountText: {
    fontSize: 9,
    color: "#B45309",
  },
  priceBadge: {
    fontSize: 10,
    fontWeight: "600",
    color: "#059669",
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },

  errorChip: {
    marginTop: 8,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(254,242,242,0.96)",
    borderColor: "#FECACA",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 6,
  },
  errorChipText: { fontSize: 12, color: "#DC2626", fontWeight: "500" },

  mapLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(248,250,252,0.92)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 20,
  },
  loadingCard: {
    width: "72%",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: "center",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 10,
  },
  mapLoadingTitle: { marginTop: 14, fontSize: 16, fontWeight: "700", color: "#183B5C" },
  mapLoadingSubtext: { marginTop: 6, fontSize: 13, color: "#64748B", textAlign: "center" },

  bottomCard: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 26,
    paddingTop: 12,
    paddingHorizontal: 16,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 14,
    zIndex: 12,
  },
  sheetHandleContainer: {
    alignItems: "center",
    marginBottom: 12,
    paddingVertical: 4,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    marginBottom: 2,
  },

  locationStrip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 10,
  },
  locationBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  pickupIconBg: { backgroundColor: "#ECFDF5" },
  dropoffIconBg: { backgroundColor: "#FEF2F2" },
  locationTextWrap: { flex: 1 },
  locationAddress: { fontSize: 13, lineHeight: 19, color: "#0F172A", fontWeight: "500" },
  inlineLoading: { flexDirection: "row", alignItems: "center", gap: 8 },
  inlineLoadingText: { fontSize: 13, color: "#64748B" },
  saveButton: { padding: 6 },

  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    borderRadius: 10,
    gap: 5,
  },
  activeTab: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: { fontSize: 12, fontWeight: "600", color: "#94A3B8" },
  favoriteBadge: {
    backgroundColor: "#EF4444",
    borderRadius: 9,
    minWidth: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  favoriteBadgeText: { color: "#FFF", fontSize: 9, fontWeight: "700" },

  bottomScrollView: { flex: 1 },

  section: { marginBottom: 16 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#0F172A" },
  seeAll: { fontSize: 13, color: "#183B5C", fontWeight: "600" },

  popularScroll: { paddingRight: 4, gap: 10 },
  popularSpotCard: {
    width: 96,
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 12,
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  popularSpotIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  popularSpotName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 3,
  },
  popularSpotType: { fontSize: 10, color: "#64748B", textAlign: "center" },

  allLandmarkCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    gap: 10,
  },
  allLandmarkIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  allLandmarkContent: { flex: 1 },
  allLandmarkName: { fontSize: 13, fontWeight: "600", color: "#0F172A", marginBottom: 2 },
  allLandmarkAddress: { fontSize: 11, color: "#64748B" },

  favoriteCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 10,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  favoriteIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  favoriteContent: { flex: 1 },
  favoriteName: { fontSize: 14, fontWeight: "600", color: "#0F172A", marginBottom: 3 },
  favoriteAddress: { fontSize: 12, color: "#64748B" },

  nearbyCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    gap: 10,
  },
  nearbyIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  nearbyContent: { flex: 1 },
  nearbyName: { fontSize: 13, fontWeight: "600", color: "#0F172A", marginBottom: 2 },
  nearbyType: { fontSize: 11, color: "#64748B" },
  distancePill: {
    backgroundColor: "#F1F5F9",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  nearbyDistance: { fontSize: 11, color: "#475569", fontWeight: "600" },

  emptyState: { alignItems: "center", paddingVertical: 28 },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#94A3B8",
    marginTop: 10,
    marginBottom: 6,
  },
  emptyStateText: {
    fontSize: 12,
    color: "#CBD5E1",
    textAlign: "center",
    paddingHorizontal: 20,
    lineHeight: 18,
  },

  confirmButton: {
    position: "absolute",
    bottom: 28,
    left: "10%",
    right: "10%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 28,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 20,
  },
  confirmPickup: { backgroundColor: "#059669" },
  confirmDropoff: { backgroundColor: "#DC2626" },
  confirmDisabled: { backgroundColor: "#CBD5E1", shadowOpacity: 0.1, elevation: 2 },
  confirmText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    width: "88%",
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: "#0F172A" },
  modalLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 8,
    marginTop: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: "#0F172A",
  },
  iconPicker: { flexDirection: "row", marginBottom: 4 },
  iconOption: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 2,
    borderColor: "transparent",
  },
  iconOptionSelected: { borderColor: "#183B5C", backgroundColor: "#EBF4FF" },
  colorPicker: { flexDirection: "row", marginBottom: 20 },
  colorOption: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    borderWidth: 3,
    borderColor: "transparent",
  },
  colorOptionSelected: {
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  modalButton: {
    backgroundColor: "#183B5C",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  modalButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },

  optionsModal: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 6,
    width: "65%",
    maxWidth: 260,
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 16,
    gap: 12,
  },
  optionItemDanger: { borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  optionText: { fontSize: 14, color: "#0F172A", fontWeight: "500" },
  optionTextDanger: { color: "#EF4444" },
});