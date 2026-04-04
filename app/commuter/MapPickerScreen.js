// screens/commuter/MapPickerScreen.js
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
  ScrollView,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";

// Get screen dimensions
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const GEOCODE_DEBOUNCE_MS = 500;
const FAVORITES_STORAGE_KEY = "user_favorite_locations";

// ─── Landmark display maps ────────────────────────────────────────────────────
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

// ─── Address helpers ──────────────────────────────────────────────────────────
const isPlusCode = (str = "") =>
  /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}$/i.test(str.trim());

const buildAddressFromComponents = (result) => {
  if (!result?.address_components) return null;
  const get = (...types) => {
    for (const type of types) {
      const c = result.address_components.find((ac) => ac.types.includes(type));
      if (c) return c.long_name;
    }
    return null;
  };
  const premise = get("premise", "point_of_interest", "establishment");
  const streetNum = get("street_number");
  const route = get("route");
  const sublocality = get("sublocality_level_1", "sublocality");
  const neighborhood = get("neighborhood");
  const city = get("locality");
  const province = get("administrative_area_level_2");
  const parts = [];
  if (premise && premise !== route) parts.push(premise);
  const street = [streetNum, route].filter(Boolean).join(" ");
  if (street) parts.push(street);
  if (sublocality) parts.push(sublocality);
  else if (neighborhood) parts.push(neighborhood);
  if (city) parts.push(city);
  if (province && province !== city) parts.push(province);
  return parts.filter(Boolean).join(", ") || null;
};

const extractCleanAddress = (result) => {
  const fmt = result?.formatted_address || "";
  const firstSegment = fmt.split(",")[0].trim();
  if (!isPlusCode(firstSegment)) return fmt;
  return buildAddressFromComponents(result) || null;
};

// ─── Distance utilities ───────────────────────────────────────────────────────
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const formatDistance = (distance) => {
  if (distance < 1) return `${Math.round(distance * 1000)}m`;
  return `${distance.toFixed(1)}km`;
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function MapPickerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const mapRef = useRef(null);
  const searchTimeout = useRef(null);
  const geocodeTimeout = useRef(null);
  const bottomSheetAnim = useRef(new Animated.Value(0)).current;
  const hasAutoCentered = useRef(false);
  const geocodeAbortRef = useRef(null);

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

  // Favorites related state
  const [favorites, setFavorites] = useState([]);
  const [showAddFavoriteModal, setShowAddFavoriteModal] = useState(false);
  const [favoriteNickname, setFavoriteNickname] = useState("");
  const [favoriteIcon, setFavoriteIcon] = useState("heart");
  const [favoriteColor, setFavoriteColor] = useState("#EF4444");
  const [editingFavoriteId, setEditingFavoriteId] = useState(null);
  const [showFavoriteOptions, setShowFavoriteOptions] = useState(false);
  const [selectedFavorite, setSelectedFavorite] = useState(null);

  const googleApiKey = Constants.expoConfig?.extra?.GOOGLE_API_KEY;

  // Load favorites from storage
  useEffect(() => {
    loadFavorites();
  }, []);

  const loadFavorites = async () => {
    try {
      const storedFavorites = await AsyncStorage.getItem(FAVORITES_STORAGE_KEY);
      if (storedFavorites) {
        setFavorites(JSON.parse(storedFavorites));
      }
    } catch (error) {
      console.log("Error loading favorites:", error);
    }
  };

  const saveFavorites = async (newFavorites) => {
    try {
      await AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(newFavorites));
      setFavorites(newFavorites);
    } catch (error) {
      console.log("Error saving favorites:", error);
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
      address: address,
      latitude: selectedLocation.latitude,
      longitude: selectedLocation.longitude,
      icon: favoriteIcon,
      color: favoriteColor,
      type: type,
      createdAt: new Date().toISOString(),
    };
    let updatedFavorites;
    if (editingFavoriteId) {
      updatedFavorites = favorites.map(fav =>
        fav.id === editingFavoriteId ? { ...newFavorite, id: editingFavoriteId } : fav
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
    Alert.alert("Success", editingFavoriteId ? "Favorite updated!" : "Location added to favorites!");
  };

  const removeFromFavorites = async (id) => {
    Alert.alert(
      "Remove Favorite",
      "Are you sure you want to remove this location from favorites?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const updatedFavorites = favorites.filter(fav => fav.id !== id);
            await saveFavorites(updatedFavorites);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          },
        },
      ]
    );
  };

  const editFavorite = (favorite) => {
    setEditingFavoriteId(favorite.id);
    setFavoriteNickname(favorite.nickname);
    setFavoriteIcon(favorite.icon || "heart");
    setFavoriteColor(favorite.color || "#EF4444");
    setShowAddFavoriteModal(true);
  };

  const selectFavoriteLocation = (favorite) => {
    const coords = { latitude: favorite.latitude, longitude: favorite.longitude };
    setSelectedLocation(coords);
    setAddress(favorite.address);
    mapRef.current?.animateToRegion({ ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 500);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowFavoriteOptions(false);
  };

  const isLocationFavorite = () => {
    if (!selectedLocation) return false;
    return favorites.some(fav =>
      Math.abs(fav.latitude - selectedLocation.latitude) < 0.0001 &&
      Math.abs(fav.longitude - selectedLocation.longitude) < 0.0001
    );
  };

  const getCurrentFavorite = () => {
    if (!selectedLocation) return null;
    return favorites.find(fav =>
      Math.abs(fav.latitude - selectedLocation.latitude) < 0.0001 &&
      Math.abs(fav.longitude - selectedLocation.longitude) < 0.0001
    );
  };

  // Get popular landmarks (top rated)
  const popularLandmarks = useMemo(() => {
    return [...landmarks]
      .sort((a, b) => (b.popularity_score || 0) - (a.popularity_score || 0))
      .slice(0, 8);
  }, [landmarks]);

  // Get nearby landmarks based on selected location
  const nearbyLandmarks = useMemo(() => {
    if (!selectedLocation) return [];
    return [...landmarks]
      .map(landmark => {
        const distance = calculateDistance(
          selectedLocation.latitude,
          selectedLocation.longitude,
          landmark.latitude,
          landmark.longitude
        );
        return { ...landmark, distance };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10);
  }, [landmarks, selectedLocation]);

  // ─── Bottom sheet entrance ───────────────────────────────────────────────────
  useEffect(() => {
    Animated.spring(bottomSheetAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 70,
      friction: 12,
    }).start();
  }, []);

  // ─── Fetch landmarks from Supabase ───────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("location_landmarks")
          .select("id, name, landmark_type, address, barangay, city, province, latitude, longitude, popularity_score")
          .eq("is_active", true)
          .order("popularity_score", { ascending: false });
        if (!error && data) {
          setLandmarks(data);
        }
      } catch (error) {
        console.log("Error fetching landmarks:", error);
      } finally {
        setLoadingLandmarks(false);
      }
    })();
  }, []);

  // ─── Initial location ────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (initialLocation) {
          setSelectedLocation(initialLocation);
          await getAddressFromCoords(initialLocation, true);
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
      } catch (error) {
        console.log("Error in initial location:", error);
      } finally {
        if (mounted) setInitialAutoLocating(false);
      }
    })();
    return () => {
      mounted = false;
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      if (geocodeTimeout.current) clearTimeout(geocodeTimeout.current);
    };
  }, []);

  // ─── Search debounce ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (searchQuery.length < 3) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(performSearch, 500);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [searchQuery]);

  // ─── Reverse geocode with Plus Code stripping ────────────────────────────────
  const getAddressFromCoords = useCallback(async (coords, immediate = false) => {
    if (geocodeTimeout.current) clearTimeout(geocodeTimeout.current);

    const run = async () => {
      const token = {};
      geocodeAbortRef.current = token;
      try {
        setLoading(true);
        let resolvedAddress = null;

        if (googleApiKey) {
          try {
            const res = await fetch(
              `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coords.latitude},${coords.longitude}&key=${googleApiKey}`
            );
            const json = await res.json();
            if (json.status === "OK" && json.results.length > 0) {
              for (const result of json.results) {
                const clean = extractCleanAddress(result);
                if (clean) {
                  resolvedAddress = clean;
                  break;
                }
              }
            }
          } catch (error) {
            console.log("Google geocoding error:", error);
          }
        }

        if (geocodeAbortRef.current !== token) return;

        if (!resolvedAddress) {
          try {
            const arr = await Location.reverseGeocodeAsync(coords);
            if (geocodeAbortRef.current !== token) return;
            if (arr[0]) {
              const a = arr[0];
              const parts = [];
              if (a.name && a.name !== a.street && a.name !== a.streetNumber) parts.push(a.name);
              const st = [a.streetNumber, a.street].filter(Boolean).join(" ");
              if (st) parts.push(st);
              if (a.district) parts.push(a.district);
              else if (a.subregion) parts.push(a.subregion);
              if (a.city) parts.push(a.city);
              if (a.region && a.region !== a.city) parts.push(a.region);
              resolvedAddress = parts.filter(Boolean).join(", ") || null;
            }
          } catch (error) {
            console.log("Expo location reverse geocode error:", error);
          }
        }

        setAddress(resolvedAddress || "Selected location");
      } catch (error) {
        console.log("Reverse geocode error:", error);
        if (geocodeAbortRef.current === token) setAddress("Selected location");
      } finally {
        if (geocodeAbortRef.current === token) setLoading(false);
      }
    };

    if (immediate) run();
    else geocodeTimeout.current = setTimeout(run, GEOCODE_DEBOUNCE_MS);
  }, [googleApiKey]);

  // ─── Device location ─────────────────────────────────────────────────────────
  const getCurrentLocation = useCallback(async ({ isInitial = false, forceRecenter = false } = {}) => {
    try {
      setIsLocating(true);
      setErrorMessage("");
      if (!isInitial) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location Permission Required", "Please enable location access to find places near you.", [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Location.openSettings() },
        ]);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };

      if ((forceRecenter || !hasAutoCentered.current) && mapRef.current) {
        mapRef.current.animateToRegion({ ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 900);
        hasAutoCentered.current = true;
      }

      if (isInitial || !initialLocation || forceRecenter) {
        setSelectedLocation(coords);
        await getAddressFromCoords(coords, true);
      }

      if (!isInitial) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.log("Get current location error:", error);
      setErrorMessage("Unable to get your current location. Please check your GPS.");
      setTimeout(() => setErrorMessage(""), 2500);
    } finally {
      setIsLocating(false);
    }
  }, [getAddressFromCoords, initialLocation]);

  // ─── Map interactions ────────────────────────────────────────────────────────
  const handleMapPress = useCallback((event) => {
    if (isLocating || initialAutoLocating) return;
    const coords = event.nativeEvent.coordinate;
    setSelectedLocation(coords);
    getAddressFromCoords(coords);
    setSearchQuery("");
    setSearchResults([]);
    setShowSearchResults(false);
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [isLocating, initialAutoLocating, getAddressFromCoords]);

  const handleMarkerDragEnd = useCallback((e) => {
    if (isLocating || initialAutoLocating) return;
    const coords = e.nativeEvent.coordinate;
    setSelectedLocation(coords);
    getAddressFromCoords(coords);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [isLocating, initialAutoLocating, getAddressFromCoords]);

  // ─── Select a landmark ───────────────────────────────────────────────────────
  const handleSelectLandmark = useCallback((landmark) => {
    const coords = { latitude: landmark.latitude, longitude: landmark.longitude };
    setSelectedLocation(coords);
    const addrParts = [landmark.name];
    if (landmark.address) addrParts.push(landmark.address);
    else {
      if (landmark.barangay) addrParts.push(landmark.barangay);
      if (landmark.city) addrParts.push(landmark.city);
      if (landmark.province) addrParts.push(landmark.province);
    }
    setAddress(addrParts.filter(Boolean).join(", "));
    mapRef.current?.animateToRegion({ ...coords, latitudeDelta: 0.008, longitudeDelta: 0.008 }, 500);
    Keyboard.dismiss();
    setShowAllLandmarks(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  // ─── Search ───────────────────────────────────────────────────────────────────
  const performSearch = useCallback(async () => {
    if (!searchQuery.trim() || searchQuery.length < 3) return;
    try {
      setSearching(true);
      let results = [];

      const q = searchQuery.toLowerCase();
      const localMatches = landmarks.filter((l) =>
        l.name.toLowerCase().includes(q) ||
        (l.address || "").toLowerCase().includes(q) ||
        (l.barangay || "").toLowerCase().includes(q)
      );
      if (localMatches.length > 0) {
        results = localMatches.map((l) => ({
          id: l.id,
          address: [l.name, l.address || [l.barangay, l.city, l.province].filter(Boolean).join(", ")].filter(Boolean).join(", "),
          location: { lat: l.latitude, lng: l.longitude },
          isLandmark: true,
          landmarkType: l.landmark_type,
        }));
      }

      if (googleApiKey) {
        let url =
          `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
          `?input=${encodeURIComponent(searchQuery)}&key=${googleApiKey}&language=en&components=country:ph`;
        if (selectedLocation) url += `&location=${selectedLocation.latitude},${selectedLocation.longitude}&radius=50000`;

        const acRes = await fetch(url);
        const acData = await acRes.json();

        if (acData.status === "OK" && acData.predictions?.length > 0) {
          const detailRequests = acData.predictions.slice(0, 5).map((p) =>
            fetch(
              `https://maps.googleapis.com/maps/api/place/details/json?place_id=${p.place_id}` +
              `&fields=geometry,formatted_address,name,address_components,place_id&key=${googleApiKey}`
            ).then((r) => r.json())
          );
          const details = await Promise.all(detailRequests);
          const googleResults = details
            .filter((d) => d.status === "OK")
            .map((d) => ({
              id: d.result.place_id || Math.random().toString(),
              address: extractCleanAddress(d.result) || d.result.name || d.result.formatted_address,
              location: { lat: d.result.geometry.location.lat, lng: d.result.geometry.location.lng },
              isLandmark: false,
            }));
          const unique = googleResults.filter(
            (g) => !results.some((r) => Math.abs(r.location.lat - g.location.lat) < 0.0001)
          );
          results = [...results, ...unique];
        }
      }

      if (results.length === 0 && googleApiKey) {
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(searchQuery)}&key=${googleApiKey}`
        );
        const data = await res.json();
        if (data.status === "OK") {
          results = data.results.map((r) => ({
            id: r.place_id,
            address: extractCleanAddress(r) || r.formatted_address,
            location: r.geometry.location,
            isLandmark: false,
          }));
        }
      }

      setSearchResults(results);
      setShowSearchResults(results.length > 0);
    } catch (error) {
      console.log("Search error:", error);
      setSearchResults([]);
      setShowSearchResults(false);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, googleApiKey, selectedLocation, landmarks]);

  const handleSelectSearchResult = useCallback((result) => {
    const coords = { latitude: result.location.lat, longitude: result.location.lng };
    setSelectedLocation(coords);
    setAddress(result.address);
    setSearchQuery("");
    setSearchResults([]);
    setShowSearchResults(false);
    Keyboard.dismiss();
    mapRef.current?.animateToRegion({ ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 500);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  // ─── Confirm ──────────────────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    if (!selectedLocation) {
      Alert.alert("No Location Selected", "Please select a location by tapping on the map or choosing a landmark.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (onSelect) onSelect(selectedLocation, address);
    navigation.goBack();
  }, [selectedLocation, address, onSelect, navigation]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
    setShowSearchResults(false);
  }, []);

  // ─── Render: search result row ────────────────────────────────────────────────
  const renderSearchResult = useCallback(({ item }) => {
    const color = item.isLandmark ? (LANDMARK_COLORS[item.landmarkType] || "#183B5C") : "#183B5C";
    const icon = item.isLandmark ? (LANDMARK_ICONS[item.landmarkType] || "location") : "location-outline";
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
          <Text style={styles.searchResultText} numberOfLines={2}>{item.address}</Text>
          {item.isLandmark && (
            <Text style={[styles.searchResultBadge, { color }]}>
              {LANDMARK_LABELS[item.landmarkType] || item.landmarkType}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
      </TouchableOpacity>
    );
  }, [handleSelectSearchResult]);

  // ─── Render: popular spot card ────────────────────────────────────────────────
  const renderPopularSpot = useCallback((landmark) => {
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
  }, [handleSelectLandmark]);

  // ─── Render: favorite card ────────────────────────────────────────────────────
  const renderFavoriteCard = useCallback((favorite) => {
    return (
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
        <View style={[styles.favoriteIcon, { backgroundColor: `${favorite.color}15` }]}>
          <Ionicons name={favorite.icon} size={24} color={favorite.color} />
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
          style={styles.favoriteDelete}
        >
          <Ionicons name="close-circle" size={22} color="#EF4444" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }, [favorites, selectedLocation]);

  // ─── Render: nearby landmark card ─────────────────────────────────────────────
  const renderNearbyLandmark = useCallback((landmark) => {
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
        <Text style={styles.nearbyDistance}>
          {formatDistance(landmark.distance)}
        </Text>
      </TouchableOpacity>
    );
  }, [handleSelectLandmark]);

  const bottomSheetTransform = {
    transform: [{ translateY: bottomSheetAnim.interpolate({ inputRange: [0, 1], outputRange: [260, 0] }) }],
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={{
          latitude: 7.7862,
          longitude: 122.5894,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        }}
        onPress={handleMapPress}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        loadingEnabled
        loadingIndicatorColor="#183B5C"
        loadingBackgroundColor="#F8FAFC"
        onError={() => Alert.alert("Map Error", "Unable to load map. Please check your connection.")}
      >
        {selectedLocation && (
          <Marker
            coordinate={selectedLocation}
            title={type === "pickup" ? "Pickup Location" : "Dropoff Location"}
            description={address}
            draggable={!isLocating && !initialAutoLocating}
            onDragEnd={handleMarkerDragEnd}
          >
            <View style={[styles.marker, type === "pickup" ? styles.pickupMarker : styles.dropoffMarker]}>
              <Ionicons name={type === "pickup" ? "location" : "flag"} size={18} color="#FFF" />
            </View>
          </Marker>
        )}
      </MapView>

      {/* ── Top overlay ── */}
      <View style={[styles.topOverlay, { paddingTop: insets.top + 8 }]}>
        {/* Title bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton} activeOpacity={0.75}>
            <Ionicons name="arrow-back" size={22} color="#183B5C" />
          </TouchableOpacity>
          <Text style={styles.screenTitle}>
            {type === "pickup" ? "Pickup Location" : "Dropoff Location"}
          </Text>
          <TouchableOpacity
            onPress={() => getCurrentLocation({ forceRecenter: true })}
            style={styles.iconButton}
            activeOpacity={0.75}
            disabled={isLocating}
          >
            {isLocating
              ? <ActivityIndicator size="small" color="#183B5C" />
              : <Ionicons name="locate" size={20} color="#183B5C" />}
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchWrapper}>
          <View style={[styles.searchBox, searchFocused && styles.searchBoxFocused]}>
            <Ionicons name="search" size={18} color={searchFocused ? "#183B5C" : "#94A3B8"} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search places, landmarks, or addresses..."
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
            {searching
              ? <ActivityIndicator size="small" color="#183B5C" />
              : searchQuery.length > 0
                ? <TouchableOpacity onPress={handleClearSearch}>
                    <Ionicons name="close-circle" size={18} color="#94A3B8" />
                  </TouchableOpacity>
                : null}
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

        {/* Error */}
        {errorMessage ? (
          <View style={styles.errorChip}>
            <Ionicons name="alert-circle" size={16} color="#DC2626" />
            <Text style={styles.errorChipText}>{errorMessage}</Text>
          </View>
        ) : null}
      </View>

      {/* ── Loading overlay ── */}
      {initialAutoLocating && (
        <View style={styles.mapLoadingOverlay} pointerEvents="auto">
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#183B5C" />
            <Text style={styles.mapLoadingTitle}>Finding your location</Text>
            <Text style={styles.mapLoadingSubtext}>Discovering places near you...</Text>
          </View>
        </View>
      )}

      {/* ── Bottom card ── */}
      <Animated.View style={[styles.bottomCard, bottomSheetTransform, { paddingBottom: Math.max(insets.bottom + 14, 20) }]}>
        <View style={styles.sheetHandle} />

        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "popular" && styles.activeTab]}
            onPress={() => setActiveTab("popular")}
          >
            <Ionicons name="flame" size={18} color={activeTab === "popular" ? "#183B5C" : "#94A3B8"} />
            <Text style={[styles.tabText, activeTab === "popular" && styles.activeTabText]}>Popular</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "favorites" && styles.activeTab]}
            onPress={() => setActiveTab("favorites")}
          >
            <Ionicons name="heart" size={18} color={activeTab === "favorites" ? "#EF4444" : "#94A3B8"} />
            <Text style={[styles.tabText, activeTab === "favorites" && styles.activeTabText]}>Favorites</Text>
            {favorites.length > 0 && (
              <View style={styles.favoriteBadge}>
                <Text style={styles.favoriteBadgeText}>{favorites.length}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "nearby" && styles.activeTab]}
            onPress={() => setActiveTab("nearby")}
          >
            <Ionicons name="location" size={18} color={activeTab === "nearby" ? "#183B5C" : "#94A3B8"} />
            <Text style={[styles.tabText, activeTab === "nearby" && styles.activeTabText]}>Nearby</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={styles.bottomScrollView}>
          {/* Popular Spots Section */}
          {activeTab === "popular" && (
            <View style={styles.popularSection}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleContainer}>
                  <Ionicons name="flame" size={18} color="#F59E0B" />
                  <Text style={styles.sectionTitle}>Trending Places</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowAllLandmarks(!showAllLandmarks);
                  }}
                >
                  <Text style={styles.seeAllButton}>
                    {showAllLandmarks ? "Show less" : "See all"}
                  </Text>
                </TouchableOpacity>
              </View>

              {!showAllLandmarks ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.popularScroll}
                  decelerationRate="fast"
                >
                  {popularLandmarks.map(renderPopularSpot)}
                </ScrollView>
              ) : (
                <View style={styles.allLandmarksList}>
                  {landmarks.map((landmark) => (
                    <TouchableOpacity
                      key={landmark.id}
                      style={styles.allLandmarkCard}
                      onPress={() => handleSelectLandmark(landmark)}
                    >
                      <View style={[styles.allLandmarkIcon, { backgroundColor: `${LANDMARK_COLORS[landmark.landmark_type] || "#94A3B8"}15` }]}>
                        <Ionicons name={LANDMARK_ICONS[landmark.landmark_type] || "location"} size={20} color={LANDMARK_COLORS[landmark.landmark_type] || "#94A3B8"} />
                      </View>
                      <View style={styles.allLandmarkContent}>
                        <Text style={styles.allLandmarkName}>{landmark.name}</Text>
                        <Text style={styles.allLandmarkAddress}>{landmark.address || landmark.barangay}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Favorites Section */}
          {activeTab === "favorites" && (
            <View style={styles.favoritesSection}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleContainer}>
                  <Ionicons name="heart" size={18} color="#EF4444" />
                  <Text style={styles.sectionTitle}>Saved Locations</Text>
                </View>
              </View>

              {favorites.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="heart-outline" size={48} color="#CBD5E1" />
                  <Text style={styles.emptyStateTitle}>No favorites yet</Text>
                  <Text style={styles.emptyStateText}>
                    Save your frequently used locations by tapping the ❤️ button below
                  </Text>
                </View>
              ) : (
                <View style={styles.favoritesList}>
                  {favorites.map(renderFavoriteCard)}
                </View>
              )}
            </View>
          )}

          {/* Nearby Places Section */}
          {activeTab === "nearby" && (
            <View style={styles.nearbySection}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleContainer}>
                  <Ionicons name="location" size={18} color="#183B5C" />
                  <Text style={styles.sectionTitle}>Nearby Places</Text>
                </View>
                {selectedLocation && (
                  <TouchableOpacity onPress={() => getCurrentLocation({ forceRecenter: true })}>
                    <Text style={styles.refreshButton}>Refresh</Text>
                  </TouchableOpacity>
                )}
              </View>

              {!selectedLocation ? (
                <View style={styles.emptyState}>
                  <Ionicons name="pin-outline" size={48} color="#CBD5E1" />
                  <Text style={styles.emptyStateTitle}>No location selected</Text>
                  <Text style={styles.emptyStateText}>
                    Tap on the map or search for a location to see nearby places
                  </Text>
                </View>
              ) : nearbyLandmarks.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="map-outline" size={48} color="#CBD5E1" />
                  <Text style={styles.emptyStateTitle}>No nearby places found</Text>
                  <Text style={styles.emptyStateText}>
                    Try moving the pin to a different location
                  </Text>
                </View>
              ) : (
                <View style={styles.nearbyList}>
                  {nearbyLandmarks.map(renderNearbyLandmark)}
                </View>
              )}
            </View>
          )}

          {/* Selected Location Section */}
          <View style={styles.selectedLocationSection}>
            <View style={styles.locationRow}>
              <View style={[styles.locationBadge, type === "pickup" ? styles.pickupIconBg : styles.dropoffIconBg]}>
                <Ionicons
                  name={type === "pickup" ? "navigate" : "flag"}
                  size={18}
                  color={type === "pickup" ? "#059669" : "#DC2626"}
                />
              </View>
              <View style={styles.locationTextWrap}>
                <Text style={styles.locationLabel}>
                  {type === "pickup" ? "Selected pickup point" : "Selected dropoff point"}
                </Text>
                {loading ? (
                  <View style={styles.inlineLoading}>
                    <ActivityIndicator size="small" color="#183B5C" />
                    <Text style={styles.inlineLoadingText}>Getting address...</Text>
                  </View>
                ) : (
                  <Text style={styles.locationAddress} numberOfLines={2}>
                    {address || "Tap on the map to select a location"}
                  </Text>
                )}
              </View>
            </View>

            {selectedLocation && (
              <View style={styles.locationActions}>
                <TouchableOpacity
                  style={styles.actionButton}
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
                    color={isLocationFavorite() ? "#EF4444" : "#64748B"}
                  />
                  <Text style={styles.actionButtonText}>
                    {isLocationFavorite() ? "Saved" : "Save"}
                  </Text>
                </TouchableOpacity>

                <View style={styles.coordinatePill}>
                  <Ionicons name="map" size={12} color="#64748B" />
                  <Text style={styles.coordinateText}>
                    {selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}
                  </Text>
                </View>
              </View>
            )}

            <Text style={styles.helperText}>
              💡 Tip: Long press on saved locations to edit or remove them
            </Text>

            <TouchableOpacity
              style={[styles.confirmButton, (!selectedLocation || loading) && styles.confirmButtonDisabled]}
              onPress={handleConfirm}
              disabled={!selectedLocation || loading}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmButtonText}>
                Confirm {type === "pickup" ? "pickup location" : "dropoff location"}
              </Text>
              <Ionicons name="checkmark-circle" size={20} color="#FFF" style={styles.confirmIcon} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Animated.View>

      {/* Add/Edit Favorite Modal */}
      <Modal
        visible={showAddFavoriteModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddFavoriteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingFavoriteId ? "Edit Favorite" : "Save to Favorites"}
              </Text>
              <TouchableOpacity onPress={() => setShowAddFavoriteModal(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>Nickname</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g., My Home, Office, Mall"
              value={favoriteNickname}
              onChangeText={setFavoriteNickname}
              maxLength={30}
            />

            <Text style={styles.modalLabel}>Choose Icon</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconPicker}>
              {["heart", "home", "briefcase", "restaurant", "cart", "business", "school", "medkit", "bus", "cafe"].map((icon) => (
                <TouchableOpacity
                  key={icon}
                  style={[styles.iconOption, favoriteIcon === icon && styles.iconOptionSelected]}
                  onPress={() => setFavoriteIcon(icon)}
                >
                  <Ionicons name={icon} size={24} color={favoriteIcon === icon ? "#183B5C" : "#94A3B8"} />
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.modalLabel}>Color</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorPicker}>
              {["#EF4444", "#10B981", "#3B82F6", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#183B5C"].map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[styles.colorOption, { backgroundColor: color }, favoriteColor === color && styles.colorOptionSelected]}
                  onPress={() => setFavoriteColor(color)}
                />
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.modalButton} onPress={addToFavorites}>
              <Text style={styles.modalButtonText}>
                {editingFavoriteId ? "Update Favorite" : "Save Favorite"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Favorite Options Modal */}
      <Modal
        visible={showFavoriteOptions}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowFavoriteOptions(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowFavoriteOptions(false)}
        >
          <View style={styles.optionsModal}>
            <TouchableOpacity
              style={styles.optionItem}
              onPress={() => {
                if (selectedFavorite) {
                  selectFavoriteLocation(selectedFavorite);
                  setShowFavoriteOptions(false);
                }
              }}
            >
              <Ionicons name="locate" size={20} color="#183B5C" />
              <Text style={styles.optionText}>Select Location</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.optionItem}
              onPress={() => {
                if (selectedFavorite) {
                  editFavorite(selectedFavorite);
                  setShowFavoriteOptions(false);
                }
              }}
            >
              <Ionicons name="create-outline" size={20} color="#3B82F6" />
              <Text style={styles.optionText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.optionItem, styles.optionItemDanger]}
              onPress={() => {
                if (selectedFavorite) {
                  removeFromFavorites(selectedFavorite.id);
                  setShowFavoriteOptions(false);
                }
              }}
            >
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
              <Text style={[styles.optionText, styles.optionTextDanger]}>Remove</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  map: { flex: 1 },

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
    marginBottom: 10,
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

  searchWrapper: { zIndex: 11 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.98)",
    borderRadius: 18,
    paddingHorizontal: 14,
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: "transparent",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  searchBoxFocused: { borderColor: "#183B5C" },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: "#0F172A",
    paddingVertical: 14,
  },

  searchResultsContainer: {
    marginTop: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    maxHeight: SCREEN_HEIGHT * 0.35,
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
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  searchResultIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  searchResultContent: { flex: 1 },
  searchResultText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#0F172A",
  },
  searchResultBadge: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "capitalize",
    marginTop: 2,
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
  pickupMarker: { backgroundColor: "#10B981" },
  dropoffMarker: { backgroundColor: "#EF4444" },

  mapLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(248,250,252,0.92)",
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
    maxHeight: SCREEN_HEIGHT * 0.7,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    marginBottom: 16,
  },

  bottomScrollView: {
    flex: 1,
  },

  // Tab Styles
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  activeTab: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  activeTabText: {
    color: "#183B5C",
  },
  favoriteBadge: {
    backgroundColor: "#EF4444",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    marginLeft: 4,
  },
  favoriteBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },

  popularSection: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  seeAllButton: {
    fontSize: 13,
    color: "#183B5C",
    fontWeight: "600",
  },
  refreshButton: {
    fontSize: 13,
    color: "#183B5C",
    fontWeight: "600",
  },
  popularScroll: {
    paddingRight: 4,
    gap: 12,
  },
  popularSpotCard: {
    width: 100,
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 12,
    marginRight: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  popularSpotIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  popularSpotName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 4,
  },
  popularSpotType: {
    fontSize: 11,
    color: "#64748B",
    textAlign: "center",
  },

  allLandmarksList: {
    marginTop: 8,
  },
  allLandmarkCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  allLandmarkIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  allLandmarkContent: {
    flex: 1,
  },
  allLandmarkName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
    marginBottom: 2,
  },
  allLandmarkAddress: {
    fontSize: 12,
    color: "#64748B",
  },

  // Favorites Styles
  favoritesSection: {
    marginBottom: 20,
  },
  favoritesList: {
    marginTop: 8,
  },
  favoriteCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  favoriteIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  favoriteContent: {
    flex: 1,
  },
  favoriteName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
    marginBottom: 4,
  },
  favoriteAddress: {
    fontSize: 12,
    color: "#64748B",
  },
  favoriteDelete: {
    padding: 8,
  },

  // Nearby Styles
  nearbySection: {
    marginBottom: 20,
  },
  nearbyList: {
    marginTop: 8,
  },
  nearbyCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  nearbyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  nearbyContent: {
    flex: 1,
  },
  nearbyName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
    marginBottom: 2,
  },
  nearbyType: {
    fontSize: 12,
    color: "#64748B",
  },
  nearbyDistance: {
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "500",
  },

  // Selected Location Section
  selectedLocationSection: {
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: 16,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  locationBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  pickupIconBg: { backgroundColor: "#ECFDF5" },
  dropoffIconBg: { backgroundColor: "#FEF2F2" },
  locationTextWrap: { flex: 1 },
  locationLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  locationAddress: {
    fontSize: 14,
    lineHeight: 20,
    color: "#0F172A",
    fontWeight: "500",
  },
  inlineLoading: {
    flexDirection: "row",
    alignItems: "center",
  },
  inlineLoadingText: {
    marginLeft: 8,
    fontSize: 13,
    color: "#64748B",
  },

  locationActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  actionButtonText: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },

  coordinatePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  coordinateText: {
    fontSize: 12,
    color: "#475569",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  helperText: {
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
    marginBottom: 14,
    backgroundColor: "#F1F5F9",
    padding: 10,
    borderRadius: 12,
  },

  confirmButton: {
    backgroundColor: "#183B5C",
    minHeight: 52,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  confirmButtonDisabled: { backgroundColor: "#CBD5E1" },
  confirmButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  confirmIcon: {
    marginLeft: 4,
  },

  // Empty State
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0F172A",
    marginTop: 12,
    marginBottom: 4,
  },
  emptyStateText: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    paddingHorizontal: 20,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    width: "85%",
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 8,
    marginTop: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0F172A",
  },
  iconPicker: {
    flexDirection: "row",
    marginBottom: 8,
  },
  iconOption: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 2,
    borderColor: "transparent",
  },
  iconOptionSelected: {
    borderColor: "#183B5C",
    backgroundColor: "#EBF4FF",
  },
  colorPicker: {
    flexDirection: "row",
    marginBottom: 20,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 3,
    borderColor: "transparent",
  },
  colorOptionSelected: {
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  modalButton: {
    backgroundColor: "#183B5C",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  modalButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },

  // Options Modal
  optionsModal: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 8,
    width: "70%",
    maxWidth: 280,
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  optionItemDanger: {
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  optionText: {
    fontSize: 15,
    color: "#0F172A",
  },
  optionTextDanger: {
    color: "#EF4444",
  },
});