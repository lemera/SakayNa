// screens/commuter/HomeScreen.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, Polyline, Circle, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import Slider from '@react-native-community/slider';
import { CameraView, useCameraPermissions } from 'expo-camera';

// Custom Alert Component
const CustomAlert = ({ visible, title, message, onConfirm, onCancel, confirmText = "Yes", cancelText = "No", type = "warning" }) => {
  if (!visible) return null;

  const getIconName = () => {
    switch(type) {
      case 'success': return 'checkmark-circle';
      case 'error': return 'alert-circle';
      case 'warning': return 'warning';
      default: return 'information-circle';
    }
  };

  const getIconColor = () => {
    switch(type) {
      case 'success': return '#10B981';
      case 'error': return '#EF4444';
      case 'warning': return '#F59E0B';
      default: return '#3B82F6';
    }
  };

  return (
    <Modal
      transparent={true}
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.customAlertOverlay}>
        <View style={styles.customAlertContainer}>
          <View style={styles.customAlertIconContainer}>
            <Ionicons name={getIconName()} size={50} color={getIconColor()} />
          </View>
          <Text style={styles.customAlertTitle}>{title}</Text>
          <Text style={styles.customAlertMessage}>{message}</Text>
          <View style={styles.customAlertButtons}>
            {onCancel && (
              <TouchableOpacity
                style={[styles.customAlertButton, styles.customAlertCancelButton]}
                onPress={onCancel}
              >
                <Text style={styles.customAlertCancelText}>{cancelText}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.customAlertButton, styles.customAlertConfirmButton]}
              onPress={onConfirm}
            >
              <Text style={styles.customAlertConfirmText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default function CommuterHomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const mapRef = useRef(null);
  const scanTimeoutRef = useRef(null);

  // Location states
  const [userLocation, setUserLocation] = useState(null);
  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [pickupText, setPickupText] = useState("");
  const [dropoffText, setDropoffText] = useState("");
  const [pickupDetails, setPickupDetails] = useState("");
  const [dropoffDetails, setDropoffDetails] = useState("");

  // Passenger count
  const [passengerCount, setPassengerCount] = useState(1);

  // Loading states
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [findingDriver, setFindingDriver] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  // Driver info
  const [nearbyDrivers, setNearbyDrivers] = useState(0);
  const [allDrivers, setAllDrivers] = useState([]);

  // Trip calculation
  const [estimatedFare, setEstimatedFare] = useState(null);
  const [estimatedDistance, setEstimatedDistance] = useState(null);
  const [estimatedTime, setEstimatedTime] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);

  // Fare settings
  const [fareSettings, setFareSettings] = useState({
    baseFare: 15,
    perKmRate: 15,
    minimumFare: 15,
  });

  // Proximity Filter States
  const [showProximityFilter, setShowProximityFilter] = useState(false);
  const [proximityRadius, setProximityRadius] = useState(3);
  const [tempProximityRadius, setTempProximityRadius] = useState(3);
  const [proximityConfig, setProximityConfig] = useState({
    defaultRadius: 3,
    maxRadius: 10,
    minRadius: 0.1,
    showOnMap: true
  });
  const [filteredDrivers, setFilteredDrivers] = useState([]);
  const [driversWithinRadius, setDriversWithinRadius] = useState(0);

  // User data
  const [commuterId, setCommuterId] = useState(null);
  const [activeBooking, setActiveBooking] = useState(null);

  // Recent locations
  const [recentLocations, setRecentLocations] = useState([]);
  const [savedPlaces, setSavedPlaces] = useState([]);

  // QR Code Scanning States
  const [permission, requestPermission] = useCameraPermissions();
  const [showScanner, setShowScanner] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [scanningForDriver, setScanningForDriver] = useState(false);
  const [scannedDriverData, setScannedDriverData] = useState(null);

  // Custom Alert States
  const [showCancelAlert, setShowCancelAlert] = useState(false);
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  const [showErrorAlert, setShowErrorAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [alertTitle, setAlertTitle] = useState("");
  const [alertType, setAlertType] = useState("warning");

  // Refs
  const bookingSubscription = useRef(null);
  const pollingInterval = useRef(null);
  const currentBookingId = useRef(null);
  const isMounted = useRef(true);

  const commonDetails = [
    "near the corner",
    "in front of",
    "behind",
    "beside",
    "under the bridge",
    "near waiting shed",
    "near basketball court",
    "near barangay hall",
    "near alley",
    "near overpass",
  ];

  const googleApiKey = Constants.expoConfig?.extra?.GOOGLE_API_KEY;

  // Cleanup
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      cleanupBookingTracking();
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
  }, []);

  const cleanupBookingTracking = () => {
    console.log("🧹 Cleaning up booking tracking");
    if (bookingSubscription.current) {
      bookingSubscription.current.unsubscribe();
      bookingSubscription.current = null;
    }
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
    currentBookingId.current = null;
  };

  // Focus effect
  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      const loadInitialData = async () => {
        if (isActive && isMounted.current) {
          setLoading(true);
          await Promise.all([
            checkActiveBooking(),
            getCommuterId(),
            loadRecentLocations(),
            loadSavedPlaces(),
            fetchFareSettings(),
            fetchProximityConfig(),
            loadProximityRadius(),
            checkAndCancelStaleBookings(),
          ]);
          setLoading(false);
          setInitialLoad(false);
        }
      };
      loadInitialData();
      return () => {
        isActive = false;
      };
    }, []),
  );

  // Location effect
  useEffect(() => {
    getUserLocation();
  }, []);

  // Filter drivers effect
  useEffect(() => {
    if (pickup && allDrivers.length > 0) {
      filterDriversByProximity();
    }
  }, [proximityRadius, pickup, allDrivers]);

  const fetchProximityConfig = async () => {
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", [
          'proximity_default_radius',
          'proximity_max_radius',
          'proximity_min_radius',
          'proximity_show_on_map'
        ])
        .eq("category", "booking");

      if (error) throw error;

      const config = { ...proximityConfig };
      data?.forEach(item => {
        switch(item.key) {
          case 'proximity_default_radius':
            config.defaultRadius = parseFloat(item.value);
            setProximityRadius(parseFloat(item.value));
            setTempProximityRadius(parseFloat(item.value));
            break;
          case 'proximity_max_radius':
            config.maxRadius = parseFloat(item.value);
            break;
          case 'proximity_min_radius':
            config.minRadius = parseFloat(item.value);
            break;
          case 'proximity_show_on_map':
            config.showOnMap = item.value === 'true';
            break;
        }
      });
      setProximityConfig(config);
      console.log("✅ Proximity config loaded:", config);
    } catch (err) {
      console.log("❌ Error fetching proximity config:", err);
    }
  };

  // Load saved radius
  const loadProximityRadius = async () => {
    try {
      const saved = await AsyncStorage.getItem('proximity_radius_home');
      if (saved) {
        const radius = parseFloat(saved);
        setProximityRadius(radius);
        setTempProximityRadius(radius);
      }
    } catch (err) {
      console.log("❌ Error loading proximity radius:", err);
    }
  };

  // Save radius
  const saveProximityRadius = async (radius) => {
    try {
      setProximityRadius(radius);
      await AsyncStorage.setItem('proximity_radius_home', radius.toString());
      
      showCustomAlert("success", "✅ Proximity Filter Updated", `Showing drivers within ${parseFloat(radius).toFixed(1)} km of your pickup location.`);
    } catch (err) {
      console.log("❌ Error saving proximity radius:", err);
    }
  };

  // Custom Alert Helper
  const showCustomAlert = (type, title, message, onConfirm = null) => {
    setAlertType(type);
    setAlertTitle(title);
    setAlertMessage(message);
    
    if (type === 'success') {
      setShowSuccessAlert(true);
      setTimeout(() => {
        setShowSuccessAlert(false);
        if (onConfirm) onConfirm();
      }, 2000);
    } else if (type === 'error') {
      setShowErrorAlert(true);
    } else {
      setShowCancelAlert(true);
    }
  };

  // Filter drivers
  const filterDriversByProximity = () => {
    if (!pickup || allDrivers.length === 0) {
      setFilteredDrivers([]);
      setDriversWithinRadius(0);
      return;
    }

    const filtered = allDrivers.filter(driver => {
      const distance = calculateDistance(
        pickup.latitude,
        pickup.longitude,
        driver.latitude,
        driver.longitude
      );
      return distance <= proximityRadius;
    });

    setFilteredDrivers(filtered);
    setDriversWithinRadius(filtered.length);
    console.log(`🎯 Found ${filtered.length} drivers within ${proximityRadius}km`);
  };

  // Open proximity filter modal
  const openProximityFilter = () => {
    setTempProximityRadius(proximityRadius);
    setShowProximityFilter(true);
  };

  // Refresh function
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      getUserLocation(),
      fetchFareSettings(),
      loadRecentLocations(),
      loadSavedPlaces(),
      checkActiveBooking(),
      fetchProximityConfig(),
    ]);
    setRefreshing(false);
  }, []);

  const fetchFareSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("fares")
        .select("*")
        .eq("active", true);

      if (error) throw error;

      if (data && data.length > 0) {
        const baseFareData = data.find((f) => f.fare_type === "base_fare");
        const perKmFareData = data.find((f) => f.fare_type === "per_km");
        const minFareData = data.find((f) => f.fare_type === "minimum_fare");

        setFareSettings({
          baseFare: baseFareData?.amount || 15,
          perKmRate: perKmFareData?.amount || 15,
          minimumFare: minFareData?.amount || 15,
        });
      }
    } catch (err) {
      console.log("Error fetching fare settings:", err);
    }
  };

  const loadRecentLocations = async () => {
    try {
      const recent = await AsyncStorage.getItem("recent_locations");
      if (recent) {
        setRecentLocations(JSON.parse(recent));
      }
    } catch (err) {
      console.log("Error loading recent locations:", err);
    }
  };

  const loadSavedPlaces = async () => {
    try {
      const id = await AsyncStorage.getItem("user_id");
      if (!id) return;

      const { data, error } = await supabase
        .from("saved_places")
        .select("*")
        .eq("commuter_id", id)
        .order("created_at", { ascending: false });

      if (data) {
        setSavedPlaces(data);
      }
    } catch (err) {
      console.log("Error loading saved places:", err);
    }
  };

  const saveRecentLocation = async (location, address, details, type) => {
    try {
      const recent = {
        id: Date.now().toString(),
        location,
        address,
        details,
        type,
        timestamp: new Date().toISOString(),
      };

      const existing = await AsyncStorage.getItem("recent_locations");
      let recents = existing ? JSON.parse(existing) : [];

      recents = [recent, ...recents.filter((r) => r.address !== address)].slice(
        0,
        10,
      );

      await AsyncStorage.setItem("recent_locations", JSON.stringify(recents));
      setRecentLocations(recents);
    } catch (err) {
      console.log("Error saving recent location:", err);
    }
  };

  const checkActiveBooking = async () => {
    try {
      const id = await AsyncStorage.getItem("user_id");
      if (!id) return;

      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("commuter_id", id)
        .in("status", ["pending", "accepted", "started"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setActiveBooking(data);

        if (data.status === "accepted" || data.status === "started") {
          navigation.navigate("TrackRide", {
            bookingId: data.id,
            driverId: data.driver_id,
          });
        }
        else if (data.status === "pending") {
          setFindingDriver(true);
          currentBookingId.current = data.id;
          setupBookingTracking(data.id);
        }
      } else {
        setActiveBooking(null);
      }
    } catch (err) {
      console.log("Error checking active booking:", err);
      setActiveBooking(null);
    }
  };

  const getCommuterId = async () => {
    const id = await AsyncStorage.getItem("user_id");
    setCommuterId(id);
  };

  const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Denied",
          "Location permission is needed to book a ride",
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

      setUserLocation(coords);

      if (!pickup) {
        setPickup(coords);

        const address = await Location.reverseGeocodeAsync(coords);
        if (address[0]) {
          const { street, name, city, region } = address[0];
          const fullAddress = `${street || name || "Current Location"}, ${city || ""}, ${region || ""}`;
          setPickupText(fullAddress);
        }
      }

      getNearbyDrivers(coords);
    } catch (err) {
      console.log("Error getting location:", err);
    }
  };

  const getNearbyDrivers = async (coords) => {
    try {
      console.log("🔍 Searching for drivers near:", coords);

      const { data: drivers, error } = await supabase
        .from("driver_locations")
        .select(
          `
          driver_id,
          latitude,
          longitude,
          last_updated,
          drivers!inner (
            id,
            first_name,
            last_name,
            status,
            is_active,
            driver_vehicles (
              vehicle_type,
              vehicle_color,
              plate_number
            )
          )
        `,
        )
        .eq("is_online", true)
        .eq("drivers.status", "approved")
        .eq("drivers.is_active", true);

      if (error) {
        console.log("❌ Query error:", error);
        throw error;
      }

      if (drivers && drivers.length > 0) {
        const driversWithDistance = drivers.map((driver) => {
          const distance = calculateDistance(
            coords.latitude,
            coords.longitude,
            driver.latitude,
            driver.longitude,
          );

          const vehicle = driver.drivers.driver_vehicles?.[0] || {};

          return {
            driver_id: driver.driver_id,
            first_name: driver.drivers.first_name,
            last_name: driver.drivers.last_name,
            distance_km: distance,
            latitude: driver.latitude,
            longitude: driver.longitude,
            vehicle_type: vehicle.vehicle_type || "Motorcycle",
            vehicle_color: vehicle.vehicle_color || "N/A",
            vehicle_plate: vehicle.plate_number || "N/A",
            last_updated: driver.last_updated,
          };
        });

        setAllDrivers(driversWithDistance);

        const nearbyDrivers = driversWithDistance
          .filter((d) => d.distance_km <= 5)
          .sort((a, b) => a.distance_km - b.distance_km);

        console.log(`🎯 Found ${nearbyDrivers.length} drivers within 5km`);
        setNearbyDrivers(nearbyDrivers.length);

        if (pickup) {
          filterDriversByProximity();
        }
      } else {
        console.log("❌ No online drivers found");
        setAllDrivers([]);
        setNearbyDrivers(0);
        setFilteredDrivers([]);
        setDriversWithinRadius(0);
      }
    } catch (err) {
      console.log("❌ Error getting nearby drivers:", err);
      setAllDrivers([]);
      setNearbyDrivers(0);
      setFilteredDrivers([]);
      setDriversWithinRadius(0);
    }
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

  const handleUseCurrentLocation = () => {
    if (userLocation) {
      setPickup(userLocation);
      Location.reverseGeocodeAsync(userLocation).then((address) => {
        if (address[0]) {
          const { street, name, city, region } = address[0];
          const fullAddress = `${street || name || "Current Location"}, ${city || ""}, ${region || ""}`;
          setPickupText(fullAddress);
        }
      });
    }
  };

  const handleSelectOnMap = (type) => {
    navigation.navigate("MapPicker", {
      type,
      onSelect: (location, address) => {
        if (type === "pickup") {
          setPickup(location);
          setPickupText(address);
        } else {
          setDropoff(location);
          setDropoffText(address);
        }

        if ((type === "pickup" && dropoff) || (type === "dropoff" && pickup)) {
          calculateRoute(
            type === "pickup" ? location : pickup,
            type === "dropoff" ? location : dropoff,
          );
        }
      },
    });
  };

  const handleSelectRecent = (recent) => {
    if (recent.type === "pickup") {
      setPickup(recent.location);
      setPickupText(recent.address);
      setPickupDetails(recent.details || "");
    } else {
      setDropoff(recent.location);
      setDropoffText(recent.address);
      setDropoffDetails(recent.details || "");
    }

    if (pickup && dropoff) {
      calculateRoute(pickup, dropoff);
    }
  };

  const handleSelectSavedPlace = (place) => {
    Alert.alert("Use as pickup?", place.address, [
      { text: "No", style: "cancel" },
      {
        text: "Yes",
        onPress: () => {
          setPickup({
            latitude: place.latitude,
            longitude: place.longitude,
          });
          setPickupText(place.address);
          setPickupDetails(place.details || "");
        },
      },
    ]);
  };

  const calculateRoute = async (startCoords, endCoords) => {
    if (!startCoords || !endCoords || !googleApiKey) return;

    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${startCoords.latitude},${startCoords.longitude}&destination=${endCoords.latitude},${endCoords.longitude}&key=${googleApiKey}&mode=driving`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.status === "OK" && data.routes[0]) {
        const route = data.routes[0];
        const points = decodePolyline(route.overview_polyline.points);
        setRouteCoordinates(points);

        const leg = route.legs[0];
        const distanceKm = leg.distance.value / 1000;
        const timeMins = Math.round(leg.duration.value / 60);

        setEstimatedDistance(distanceKm.toFixed(1));
        setEstimatedTime(timeMins);

        calculateFareWithPassengers(distanceKm);

        if (mapRef.current) {
          mapRef.current.fitToCoordinates([startCoords, endCoords], {
            edgePadding: { top: 100, right: 50, bottom: 300, left: 50 },
            animated: true,
          });
        }
      }
    } catch (err) {
      console.log("Error calculating route:", err);
    }
  };

  const decodePolyline = (encoded) => {
    const points = [];
    let index = 0,
      lat = 0,
      lng = 0;

    while (index < encoded.length) {
      let b,
        shift = 0,
        result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = result & 1 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = result & 1 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
    }
    return points;
  };

  const calculateFareWithPassengers = (distanceKm) => {
    if (!distanceKm) return;

    const exactDistance = parseFloat(distanceKm);
    setEstimatedDistance(exactDistance.toFixed(1));

    let farePerPassenger;

    if (exactDistance <= 2.0) {
      farePerPassenger = fareSettings.minimumFare;
    } else {
      const roundedKm = Math.ceil(exactDistance);
      const additionalKm = roundedKm - 1;
      farePerPassenger =
        fareSettings.baseFare + additionalKm * fareSettings.perKmRate;
    }

    const totalFare = farePerPassenger * passengerCount;
    setEstimatedFare(totalFare);

    console.log(
      `Distance: ${exactDistance}km, Fare per passenger: ₱${farePerPassenger}, Total: ₱${totalFare}`,
    );
  };

  useEffect(() => {
    if (pickup && dropoff && estimatedDistance) {
      calculateFareWithPassengers(parseFloat(estimatedDistance));
    }
  }, [passengerCount, estimatedDistance, fareSettings]);

  useEffect(() => {
    if (pickup && dropoff) {
      calculateRoute(pickup, dropoff);
    }
  }, [pickup, dropoff]);

  const handlePassengerChange = (increment) => {
    const newCount = passengerCount + increment;
    if (newCount >= 1 && newCount <= 6) {
      setPassengerCount(newCount);
    }
  };

  const handleBookRide = () => {
    if (!pickup) {
      Alert.alert("Missing Info", "Please select a pickup location");
      return;
    }
    if (!dropoff) {
      Alert.alert("Missing Info", "Please select a dropoff location");
      return;
    }

    const pickupDisplay = pickupDetails
      ? `${pickupText} - ${pickupDetails}`
      : pickupText;
    const dropoffDisplay = dropoffDetails
      ? `${dropoffText} - ${dropoffDetails}`
      : dropoffText;

    Alert.alert(
      "Confirm Booking",
      `📍 PICKUP:\n${pickupDisplay}\n\n🏁 DROPOFF:\n${dropoffDisplay}\n\n👥 Passengers: ${passengerCount}\n📏 Distance: ${estimatedDistance} km\n⏱️ Est. Time: ${estimatedTime} mins\n💰 Total Fare: ₱${estimatedFare}`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Book Now", onPress: createBooking },
      ],
    );
  };

  // ==================== SCAN TO RIDE FUNCTIONS ====================

  const openScanner = async () => {
    try {
      if (!permission?.granted) {
        const { granted } = await requestPermission();
        if (!granted) {
          Alert.alert(
            "Camera Permission Required",
            "We need camera access to scan the driver's QR code.",
            [{ text: "OK" }]
          );
          return;
        }
      }
      
      setScanned(false);
      setScanningForDriver(true);
      setShowScanner(true);
    } catch (err) {
      console.log("❌ Error opening scanner:", err);
    }
  };

  const handleBarCodeScanned = async ({ type, data }) => {
    if (scanned) return;
    
    setScanned(true);
    
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
    }
    
    try {
      const qrData = JSON.parse(data);
      console.log("📱 QR Code scanned:", qrData);
      
      // Check if it's a driver QR code
      if (qrData.type !== 'driver_qr' && !qrData.driver_id) {
        Alert.alert(
          "Invalid QR Code",
          "This is not a valid driver QR code. Please scan the QR code on the driver's vehicle.",
          [{ text: "OK", onPress: () => {
            setShowScanner(false);
            setScanningForDriver(false);
          }}]
        );
        return;
      }
      
      const driverId = qrData.driver_id || qrData.id;
      
      // Fetch driver details
      const { data: driverData, error: driverError } = await supabase
        .from("drivers")
        .select(`
          id,
          first_name,
          last_name,
          phone,
          profile_picture,
          driver_vehicles (
            vehicle_type,
            vehicle_color,
            plate_number
          )
        `)
        .eq("id", driverId)
        .single();
      
      if (driverError || !driverData) {
        Alert.alert(
          "Driver Not Found",
          "Could not find driver information. Please try again.",
          [{ text: "OK", onPress: () => {
            setShowScanner(false);
            setScanningForDriver(false);
          }}]
        );
        return;
      }
      
      setScannedDriverData(driverData);
      setShowScanner(false);
      
      // Check if pickup and dropoff are set
      if (!pickup) {
        Alert.alert(
          "Missing Pickup Location",
          "Please set your pickup location first.",
          [{ text: "OK", onPress: () => setScanningForDriver(false) }]
        );
        return;
      }
      
      if (!dropoff) {
        Alert.alert(
          "Missing Dropoff Location",
          "Please set your dropoff location first.",
          [{ text: "OK", onPress: () => setScanningForDriver(false) }]
        );
        return;
      }
      
      // Show driver info and confirm booking
      showDriverBookingConfirmation(driverData);
      
    } catch (err) {
      console.log("❌ Error processing QR code:", err);
      Alert.alert(
        "Invalid QR Code",
        "Could not read the QR code. Please try again.",
        [{ text: "OK", onPress: () => {
          scanTimeoutRef.current = setTimeout(() => {
            setScanned(false);
            setShowScanner(false);
            setScanningForDriver(false);
            scanTimeoutRef.current = null;
          }, 1000);
        }}]
      );
    }
  };

  const showDriverBookingConfirmation = (driverData) => {
    const vehicle = driverData.driver_vehicles?.[0] || {};
    
    Alert.alert(
      "📱 Scan to Ride",
      `Driver: ${driverData.first_name} ${driverData.last_name}\nVehicle: ${vehicle.vehicle_color || ''} ${vehicle.vehicle_type || ''}\nPlate: ${vehicle.plate_number || 'N/A'}\n\n📍 Pickup: ${pickupText}\n🏁 Dropoff: ${dropoffText}\n👥 Passengers: ${passengerCount}\n💰 Fare: ₱${estimatedFare}`,
      [
        { text: "Cancel", style: "cancel", onPress: () => setScanningForDriver(false) },
        { text: "Confirm Ride", onPress: () => createDirectBooking(driverData.id) }
      ]
    );
  };

  const createDirectBooking = async (driverId) => {
    if (!commuterId) {
      Alert.alert("Error", "Please login first");
      return;
    }

    setFindingDriver(true);

    try {
      const pickupDisplay = pickupDetails
        ? `${pickupText} - ${pickupDetails}`
        : pickupText;
      const dropoffDisplay = dropoffDetails
        ? `${dropoffText} - ${dropoffDetails}`
        : dropoffText;

      // Create booking with driver_id directly (bypassing queue)
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .insert([
          {
            commuter_id: commuterId,
            driver_id: driverId, // Direct assignment - overrides queue!
            pickup_location: pickupDisplay,
            pickup_latitude: pickup.latitude,
            pickup_longitude: pickup.longitude,
            pickup_details: pickupDetails,
            dropoff_location: dropoffDisplay,
            dropoff_latitude: dropoff.latitude,
            dropoff_longitude: dropoff.longitude,
            dropoff_details: dropoffDetails,
            passenger_count: passengerCount,
            fare: estimatedFare,
            base_fare: fareSettings.baseFare,
            per_km_rate: fareSettings.perKmRate,
            distance_km: estimatedDistance,
            duration_minutes: estimatedTime,
            status: "accepted", // Direct acceptance since driver is scanned
            accepted_at: new Date(),
            created_at: new Date(),
          },
        ])
        .select()
        .single();

      if (bookingError) throw bookingError;

      console.log(`✅ Direct booking created: ${booking.id}`);

      // Cancel any pending booking requests for this driver (cleanup)
      await supabase
        .from("booking_requests")
        .update({
          status: "cancelled",
          responded_at: new Date(),
        })
        .eq("booking_id", booking.id)
        .eq("status", "pending");

      // Send notification to driver
      const { data: driverToken } = await supabase
        .from("drivers")
        .select("expo_push_token")
        .eq("id", driverId)
        .single();

      if (driverToken?.expo_push_token) {
        sendPushNotification(
          driverToken.expo_push_token,
          "🎯 Direct Booking!",
          `A passenger has booked you directly via QR scan to ${dropoffDisplay}`
        );
      }

      // Save recent locations
      if (pickup && pickupText) {
        saveRecentLocation(pickup, pickupText, pickupDetails, "pickup");
      }
      if (dropoff && dropoffText) {
        saveRecentLocation(dropoff, dropoffText, dropoffDetails, "dropoff");
      }

      setScanningForDriver(false);
      setFindingDriver(false);
      
      // Navigate to TrackRide
      navigation.navigate("TrackRide", {
        bookingId: booking.id,
        driverId: driverId,
      });
      
    } catch (err) {
      console.log("Error creating direct booking:", err);
      Alert.alert("Error", "Failed to create booking");
      setFindingDriver(false);
      setScanningForDriver(false);
    }
  };

  const handleCancelScanning = () => {
    setShowScanner(false);
    setScanned(false);
    setScanningForDriver(false);
    setScannedDriverData(null);
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
  };

  const setupBookingTracking = (bookingId) => {
    console.log(`🔴 Setting up tracking for booking: ${bookingId}`);

    cleanupBookingTracking();

    currentBookingId.current = bookingId;

    bookingSubscription.current = supabase
      .channel(`booking-${bookingId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bookings",
          filter: `id=eq.${bookingId}`,
        },
        (payload) => {
          console.log("🔄 REAL-TIME UPDATE:", payload.new);

          if (!isMounted.current) return;

          if (payload.new.status === "accepted") {
            console.log(
              `✅ Driver ACCEPTED! Driver ID: ${payload.new.driver_id}`,
            );
            handleDriverAccepted(bookingId, payload.new.driver_id);
          } else if (payload.new.status === "cancelled") {
            console.log("❌ Booking cancelled");
            const cancelledBy = payload.new.cancelled_by || "unknown";
            const reason =
              payload.new.cancellation_reason || "No reason provided";
            handleBookingCancelled(cancelledBy, reason);
          } else if (payload.new.status === "started") {
            console.log("🚗 Trip started");
          }
        },
      )
      .subscribe((status) => {
        console.log(`📡 Subscription status: ${status}`);
      });

    let attempts = 0;
    const maxAttempts = 30;

    pollingInterval.current = setInterval(async () => {
      if (!isMounted.current || !currentBookingId.current) {
        clearInterval(pollingInterval.current);
        pollingInterval.current = null;
        return;
      }

      attempts++;
      console.log(`⏱️ Polling attempt ${attempts}/${maxAttempts}`);

      const { data: booking, error } = await supabase
        .from("bookings")
        .select("status, driver_id, cancelled_by, cancellation_reason")
        .eq("id", bookingId)
        .maybeSingle();

      if (error) {
        console.log("❌ Polling error:", error);
        return;
      }

      if (booking?.status === "accepted") {
        console.log(
          `✅ Polling found ACCEPTED booking! Driver: ${booking.driver_id}`,
        );
        cleanupBookingTracking();
        if (isMounted.current) {
          setFindingDriver(false);
          navigation.navigate("TrackRide", {
            bookingId,
            driverId: booking.driver_id,
          });
        }
      } else if (booking?.status === "cancelled") {
        console.log("❌ Polling found CANCELLED booking");
        cleanupBookingTracking();
        if (isMounted.current) {
          const cancelledBy = booking.cancelled_by || "unknown";
          const reason = booking.cancellation_reason || "No reason provided";
          showCustomAlert("error", "❌ Booking Cancelled", `This booking was cancelled by the ${cancelledBy}.\n\nReason: ${reason}`);
          setFindingDriver(false);
        }
      } else if (attempts >= maxAttempts) {
        console.log("⏰ Polling timeout - no driver found");
        cleanupBookingTracking();
        if (isMounted.current) {
          Alert.alert(
            "No Driver Found",
            "We couldn't find a driver at this time. Would you like to try again?",
            [
              {
                text: "Cancel",
                onPress: () => {
                  setFindingDriver(false);
                  cancelBooking(bookingId);
                },
              },
              {
                text: "Try Again",
                onPress: () => findAndNotifyDrivers(bookingId),
              },
            ],
          );
        }
      }
    }, 3000);
  };

  const handleDriverAccepted = (bookingId, driverId) => {
    cleanupBookingTracking();
    setFindingDriver(false);
    navigation.navigate("TrackRide", {
      bookingId,
      driverId,
    });
  };

  const handleBookingCancelled = (cancelledBy, reason) => {
    cleanupBookingTracking();
    if (isMounted.current) {
      setFindingDriver(false);
      if (cancelledBy === "commuter") {
        showCustomAlert("success", "✅ Booking Cancelled", "Your booking has been successfully cancelled.");
      } else if (cancelledBy === "driver") {
        showCustomAlert("error", "❌ Booking Cancelled by Driver", `The driver cancelled your booking.\n\nReason: ${reason}`);
      } else if (cancelledBy === "system") {
        showCustomAlert("warning", "⚠️ Booking Expired", `Your booking has expired.\n\nReason: ${reason}`);
      } else {
        showCustomAlert("error", "❌ Booking Cancelled", `Your booking was cancelled.\n\nReason: ${reason}`);
      }
    }
  };

  // ==================== UPDATED CANCEL BOOKING FUNCTIONS ====================

  const cancelBooking = async (bookingId, reason = "Cancelled by commuter") => {
    try {
      console.log(`🛑 Attempting to cancel booking: ${bookingId}`);

      if (!bookingId) {
        console.log("❌ No booking ID provided");
        showCustomAlert("error", "Error", "No booking to cancel");
        return;
      }

      // First, verify the booking exists and get its current status
      const { data: bookingCheck, error: checkError } = await supabase
        .from("bookings")
        .select("id, status")
        .eq("id", bookingId)
        .single();

      if (checkError) {
        console.log("❌ Error checking booking:", checkError);
        showCustomAlert("error", "Error", "Could not find the booking");
        return;
      }

      console.log(`📊 Current booking status: ${bookingCheck?.status}`);

      if (bookingCheck?.status === "cancelled") {
        console.log("ℹ️ Booking already cancelled");
        cleanupBookingTracking();
        setFindingDriver(false);
        showCustomAlert("success", "✅ Already Cancelled", "This booking was already cancelled.");
        return;
      }

      // Update the booking status
      console.log("📝 Updating booking status to cancelled...");
      const { error: bookingError, data: updatedBooking } = await supabase
        .from("bookings")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason,
          cancelled_by: "commuter",
          updated_at: new Date().toISOString(),
        })
        .eq("id", bookingId)
        .select();

      if (bookingError) {
        console.log("❌ Error updating booking:", bookingError);
        showCustomAlert("error", "Error", "Failed to cancel booking: " + bookingError.message);
        return;
      }

      console.log("✅ Booking updated successfully:", updatedBooking);

      // Now update all booking requests for this booking
      console.log("📝 Updating booking requests to cancelled...");
      const { data: requests, error: requestsFetchError } = await supabase
        .from("booking_requests")
        .select("id, status")
        .eq("booking_id", bookingId);

      if (requestsFetchError) {
        console.log("❌ Error fetching booking requests:", requestsFetchError);
      } else {
        console.log(`📊 Found ${requests?.length || 0} booking requests:`, requests);

        if (requests && requests.length > 0) {
          const { error: requestsError, data: updatedRequests } = await supabase
            .from("booking_requests")
            .update({
              status: "cancelled",
              responded_at: new Date().toISOString(),
            })
            .eq("booking_id", bookingId)
            .in("status", ["pending", "accepted"]) // Update both pending and accepted requests
            .select();

          if (requestsError) {
            console.log("❌ Error updating booking requests:", requestsError);
          } else {
            console.log("✅ Booking requests updated successfully:", updatedRequests);
          }
        } else {
          console.log("ℹ️ No booking requests found for this booking");
        }
      }

      // Clean up tracking
      cleanupBookingTracking();
      setFindingDriver(false);

      // Show success message
      showCustomAlert("success", "✅ Booking Cancelled", "Your booking has been successfully cancelled.");

    } catch (err) {
      console.log("❌ Unexpected error in cancelBooking:", err);
      showCustomAlert("error", "Error", "An unexpected error occurred");
    }
  };

  const handleManualCancel = () => {
    console.log("🔘 Manual cancel clicked");
    console.log("Current booking ID:", currentBookingId.current);
    
    if (!currentBookingId.current) {
      console.log("❌ No current booking ID found");
      showCustomAlert("error", "No Active Booking", "There is no active booking to cancel.");
      return;
    }

    // Show custom cancel confirmation
    setAlertType("warning");
    setAlertTitle("Cancel Booking");
    setAlertMessage("Are you sure you want to cancel this booking?\n\nThis will remove your request from all drivers.");
    setShowCancelAlert(true);
  };

  const confirmCancellation = async () => {
    setShowCancelAlert(false);
    await cancelBooking(
      currentBookingId.current,
      "Cancelled by commuter",
    );
  };

  const cancelFinding = () => {
    console.log("🔘 Cancel finding clicked");
    console.log("Current booking ID:", currentBookingId.current);
    
    setAlertType("warning");
    setAlertTitle("Cancel Finding");
    setAlertMessage("Are you sure you want to cancel finding a driver?\n\nThis will cancel your booking request.");
    setShowCancelAlert(true);
  };

  const checkAndCancelStaleBookings = async () => {
    try {
      const id = await AsyncStorage.getItem("user_id");
      if (!id) return;

      // Find any pending bookings older than 5 minutes
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const { data: staleBookings, error } = await supabase
        .from("bookings")
        .select("id")
        .eq("commuter_id", id)
        .eq("status", "pending")
        .lt("created_at", fiveMinutesAgo);

      if (error) throw error;

      if (staleBookings && staleBookings.length > 0) {
        console.log(`Found ${staleBookings.length} stale bookings to cancel`);

        for (const booking of staleBookings) {
          await cancelBooking(booking.id, "Automatically cancelled - stale booking");
        }
      }
    } catch (err) {
      console.log("Error checking stale bookings:", err);
    }
  };

  const debugBookingStatus = async () => {
    if (!currentBookingId.current) {
      console.log("❌ No booking ID to debug");
      showCustomAlert("error", "Debug", "No active booking to debug");
      return;
    }

    try {
      console.log("🔍 Debugging booking:", currentBookingId.current);
      
      // Check bookings table
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", currentBookingId.current)
        .single();

      if (bookingError) {
        console.log("❌ Error fetching booking:", bookingError);
        showCustomAlert("error", "Debug Error", "Could not fetch booking");
      } else {
        console.log("📊 Booking data:", booking);
        showCustomAlert("success", "Debug Info", `Booking Status: ${booking.status}\nBooking ID: ${booking.id}`);
      }

      // Check booking requests
      const { data: requests, error: requestsError } = await supabase
        .from("booking_requests")
        .select("*")
        .eq("booking_id", currentBookingId.current);

      if (requestsError) {
        console.log("❌ Error fetching requests:", requestsError);
      } else {
        console.log("📊 Booking requests:", requests);
      }

    } catch (err) {
      console.log("❌ Debug error:", err);
    }
  };

  const findAndNotifyDrivers = async (bookingId) => {
    try {
      console.log(`🚀 Finding drivers for booking: ${bookingId}`);

      const { data: drivers, error } = await supabase
        .from("driver_locations")
        .select(
          `
          driver_id,
          latitude,
          longitude,
          drivers!inner (
            id,
            expo_push_token
          )
        `,
        )
        .eq("is_online", true)
        .eq("drivers.status", "approved")
        .eq("drivers.is_active", true);

      if (error) throw error;

      if (!drivers || drivers.length === 0) {
        handleNoDriversAvailable(bookingId);
        return;
      }

      const driversWithDistance = drivers.map((driver) => {
        const distance = calculateDistance(
          pickup.latitude,
          pickup.longitude,
          driver.latitude,
          driver.longitude,
        );
        return {
          driver_id: driver.driver_id,
          distance: distance,
          expo_push_token: driver.drivers.expo_push_token,
        };
      });

      const nearbyDrivers = driversWithDistance
        .filter((d) => d.distance <= proximityRadius)
        .sort((a, b) => a.distance - b.distance);

      if (nearbyDrivers.length === 0) {
        handleNoDriversNearby(bookingId);
        return;
      }

      const bookingRequests = nearbyDrivers.slice(0, 5).map((driver) => ({
        booking_id: bookingId,
        driver_id: driver.driver_id,
        status: "pending",
        distance_km: driver.distance,
        created_at: new Date(),
      }));

      const { error: requestError } = await supabase
        .from("booking_requests")
        .insert(bookingRequests);

      if (requestError) throw requestError;

      nearbyDrivers.slice(0, 5).forEach((driver) => {
        if (driver.expo_push_token) {
          sendPushNotification(
            driver.expo_push_token,
            "New Booking Request",
            `New booking from ${pickupDetails || "your area"} to ${dropoffDetails || "destination"}`,
          );
        }
      });

      console.log(`📨 Notified ${nearbyDrivers.length} drivers`);
    } catch (err) {
      console.log("❌ Error finding drivers:", err);
    }
  };

  const handleNoDriversAvailable = async (bookingId) => {
    Alert.alert(
      "No Drivers Available",
      "No drivers are currently online. Would you like to try again?",
      [
        {
          text: "Cancel",
          onPress: async () => {
            await cancelBooking(bookingId, "No drivers available");
          },
        },
        {
          text: "Try Again",
          onPress: () => findAndNotifyDrivers(bookingId),
        },
      ],
    );
  };

  const handleNoDriversNearby = async (bookingId) => {
    Alert.alert(
      "No Drivers Nearby",
      `No drivers found within ${proximityRadius}km. Would you like to expand search radius?`,
      [
        {
          text: "Cancel",
          onPress: async () => {
            await cancelBooking(bookingId, "No drivers nearby");
          },
        },
        {
          text: "Expand to 5km",
          onPress: () => expandDriverSearch(bookingId, 5),
        },
      ],
    );
  };

  const expandDriverSearch = async (bookingId, radius) => {
    try {
      const { data: drivers, error } = await supabase
        .from("driver_locations")
        .select(
          `
          driver_id,
          latitude,
          longitude,
          drivers!inner (
            id,
            expo_push_token
          )
        `,
        )
        .eq("is_online", true)
        .eq("drivers.status", "approved")
        .eq("drivers.is_active", true);

      if (error) throw error;

      const driversWithDistance = drivers.map((driver) => {
        const distance = calculateDistance(
          pickup.latitude,
          pickup.longitude,
          driver.latitude,
          driver.longitude,
        );
        return {
          driver_id: driver.driver_id,
          distance: distance,
          expo_push_token: driver.drivers.expo_push_token,
        };
      });

      const nearbyDrivers = driversWithDistance
        .filter((d) => d.distance <= radius)
        .sort((a, b) => a.distance - b.distance);

      if (nearbyDrivers.length === 0) {
        Alert.alert(
          "Still No Drivers",
          `No drivers found within ${radius}km. Try again later?`,
          [
            {
              text: "Cancel",
              onPress: async () => {
                await cancelBooking(bookingId, `No drivers within ${radius}km`);
              },
            },
            {
              text: "Try Again",
              onPress: () => expandDriverSearch(bookingId, radius),
            },
          ],
        );
        return;
      }

      const bookingRequests = nearbyDrivers.slice(0, 5).map((driver) => ({
        booking_id: bookingId,
        driver_id: driver.driver_id,
        status: "pending",
        distance_km: driver.distance,
        created_at: new Date(),
      }));

      const { error: requestError } = await supabase
        .from("booking_requests")
        .insert(bookingRequests);

      if (requestError) throw requestError;

      nearbyDrivers.slice(0, 5).forEach((driver) => {
        if (driver.expo_push_token) {
          sendPushNotification(
            driver.expo_push_token,
            "New Booking Request",
            `New booking from ${pickupDetails || "your area"}`,
          );
        }
      });
    } catch (err) {
      console.log("Error expanding search:", err);
    }
  };

  const sendPushNotification = async (expoPushToken, title, body) => {
    if (!expoPushToken) return;

    const message = {
      to: expoPushToken,
      sound: "default",
      title: title,
      body: body,
      data: { type: "booking_request" },
    };

    try {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });
    } catch (err) {
      console.log("Error sending push notification:", err);
    }
  };

  const createBooking = async () => {
    if (!commuterId) {
      Alert.alert("Error", "Please login first");
      return;
    }

    setFindingDriver(true);

    try {
      const pickupDisplay = pickupDetails
        ? `${pickupText} - ${pickupDetails}`
        : pickupText;
      const dropoffDisplay = dropoffDetails
        ? `${dropoffText} - ${dropoffDetails}`
        : dropoffText;

      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .insert([
          {
            commuter_id: commuterId,
            pickup_location: pickupDisplay,
            pickup_latitude: pickup.latitude,
            pickup_longitude: pickup.longitude,
            pickup_details: pickupDetails,
            dropoff_location: dropoffDisplay,
            dropoff_latitude: dropoff.latitude,
            dropoff_longitude: dropoff.longitude,
            dropoff_details: dropoffDetails,
            passenger_count: passengerCount,
            fare: estimatedFare,
            base_fare: fareSettings.baseFare,
            per_km_rate: fareSettings.perKmRate,
            distance_km: estimatedDistance,
            duration_minutes: estimatedTime,
            status: "pending",
            created_at: new Date(),
          },
        ])
        .select()
        .single();

      if (bookingError) throw bookingError;

      console.log(`✅ Booking created: ${booking.id}`);

      if (pickup && pickupText) {
        saveRecentLocation(pickup, pickupText, pickupDetails, "pickup");
      }
      if (dropoff && dropoffText) {
        saveRecentLocation(dropoff, dropoffText, dropoffDetails, "dropoff");
      }

      setupBookingTracking(booking.id);
      findAndNotifyDrivers(booking.id);
    } catch (err) {
      console.log("Error creating booking:", err);
      Alert.alert("Error", "Failed to create booking");
      setFindingDriver(false);
    }
  };

  // Proximity Filter Modal
  const ProximityFilterModal = useMemo(() => (
    <Modal
      animationType="slide"
      transparent={true}
      visible={showProximityFilter}
      onRequestClose={() => setShowProximityFilter(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>📍 Proximity Filter</Text>
            <Pressable onPress={() => setShowProximityFilter(false)}>
              <Ionicons name="close" size={24} color="#666" />
            </Pressable>
          </View>

          <Text style={styles.modalDescription}>
            Set the search radius for finding nearby drivers. Only drivers within this radius will be notified of your booking.
          </Text>

          <View style={styles.radiusDisplay}>
            <Text style={styles.radiusValue}>
              {tempProximityRadius.toFixed(1)} km
            </Text>
          </View>

          <Slider
            style={styles.slider}
            minimumValue={proximityConfig.minRadius}
            maximumValue={proximityConfig.maxRadius}
            step={0.1}
            value={tempProximityRadius}
            onValueChange={(value) => setTempProximityRadius(value)}
            minimumTrackTintColor="#183B5C"
            maximumTrackTintColor="#E5E7EB"
            thumbTintColor="#183B5C"
          />

          <View style={styles.radiusLabels}>
            <Text style={styles.radiusLabel}>{proximityConfig.minRadius.toFixed(1)} km</Text>
            <Text style={styles.radiusLabel}>{proximityConfig.maxRadius.toFixed(1)} km</Text>
          </View>

          {pickup && (
            <View style={styles.currentDriversContainer}>
              <Text style={styles.currentDriversLabel}>Drivers within range:</Text>
              <Text style={[
                styles.currentDriversValue,
                driversWithinRadius > 0 ? styles.driversAvailable : styles.driversUnavailable
              ]}>
                {driversWithinRadius} {driversWithinRadius === 1 ? 'driver' : 'drivers'}
              </Text>
              {driversWithinRadius === 0 && (
                <Text style={styles.noDriversHint}>
                  Try increasing the radius to find more drivers
                </Text>
              )}
            </View>
          )}

          <View style={styles.modalButtons}>
            <Pressable 
              style={[styles.modalButton, styles.cancelModalButton]} 
              onPress={() => setShowProximityFilter(false)}
            >
              <Text style={styles.cancelModalButtonText}>Cancel</Text>
            </Pressable>
            <Pressable 
              style={[styles.modalButton, styles.saveModalButton]} 
              onPress={() => {
                saveProximityRadius(tempProximityRadius);
                setShowProximityFilter(false);
              }}
            >
              <Text style={styles.saveModalButtonText}>Apply Filter</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  ), [showProximityFilter, tempProximityRadius, proximityConfig, pickup, driversWithinRadius]);

  // Show loading indicator
  if (initialLoad && loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
        <Text style={styles.loadingText}>Loading your ride...</Text>
      </View>
    );
  }

  if (findingDriver) {
    return (
      <View style={styles.findingDriverContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
        <Text style={styles.findingDriverTitle}>Finding your driver...</Text>
        <Text style={styles.findingDriverSubtitle}>
          Looking for drivers within {proximityRadius}km{"\n"}
          You'll be notified as soon as a driver accepts
        </Text>

        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Ionicons name="people" size={24} color="#FFB37A" />
            <Text style={styles.statValue}>{driversWithinRadius}</Text>
            <Text style={styles.statLabel}>Drivers in Range</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="radio" size={24} color="#FFB37A" />
            <Text style={styles.statValue}>{proximityRadius}km</Text>
            <Text style={styles.statLabel}>Search Radius</Text>
          </View>
        </View>

        {/* Debug button - remove after testing */}
        <Pressable 
          style={{ backgroundColor: '#FFB37A', padding: 10, borderRadius: 8, marginBottom: 10 }}
          onPress={debugBookingStatus}
        >
          
        </Pressable>

        <Pressable style={styles.adjustRadiusButton} onPress={() => {
          setFindingDriver(false);
          openProximityFilter();
        }}>
          <Ionicons name="options-outline" size={20} color="#183B5C" />
          <Text style={styles.adjustRadiusText}>Adjust Search Radius</Text>
        </Pressable>

        <Pressable style={styles.cancelFindingButton} onPress={cancelFinding}>
          <Text style={styles.cancelFindingText}>Cancel Booking</Text>
        </Pressable>

        {/* Custom Alerts */}
        <CustomAlert
          visible={showCancelAlert}
          title={alertTitle}
          message={alertMessage}
          onConfirm={confirmCancellation}
          onCancel={() => setShowCancelAlert(false)}
          confirmText="Yes, Cancel"
          cancelText="No"
          type="warning"
        />

        <CustomAlert
          visible={showSuccessAlert}
          title={alertTitle}
          message={alertMessage}
          onConfirm={() => setShowSuccessAlert(false)}
          confirmText="OK"
          type="success"
        />

        <CustomAlert
          visible={showErrorAlert}
          title={alertTitle}
          message={alertMessage}
          onConfirm={() => setShowErrorAlert(false)}
          confirmText="OK"
          type="error"
        />
      </View>
    );
  }

  // QR Code Scanner Screen
  if (showScanner) {
    return (
      <View style={styles.container}>
        <View style={styles.scannerHeader}>
          <Pressable onPress={handleCancelScanning} style={styles.scannerBackButton}>
            <Ionicons name="close" size={28} color="#FFF" />
          </Pressable>
          <Text style={styles.scannerTitle}>Scan Driver's QR Code</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.scannerContainer}>
          <CameraView
            style={styles.scanner}
            facing="back"
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
          >
            <View style={styles.scannerOverlay}>
              <View style={styles.scanArea}>
                <View style={styles.scanCorner} />
                <View style={[styles.scanCorner, styles.scanCornerTopRight]} />
                <View style={[styles.scanCorner, styles.scanCornerBottomLeft]} />
                <View style={[styles.scanCorner, styles.scanCornerBottomRight]} />
              </View>
              
              <Text style={styles.scannerInstruction}>
                Position the driver's QR code within the frame
              </Text>
              
              <Text style={styles.scannerSubInstruction}>
                Look for the SakayNa sticker on the vehicle
              </Text>
            </View>
          </CameraView>
        </View>

        <View style={styles.scannerFooter}>
          <Text style={styles.scannerFooterText}>
            Scan the QR code on the driver's vehicle to book directly
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Proximity Filter Modal */}
      {ProximityFilterModal}

      {/* Custom Alerts for main screen */}
      <CustomAlert
        visible={showSuccessAlert}
        title={alertTitle}
        message={alertMessage}
        onConfirm={() => setShowSuccessAlert(false)}
        confirmText="OK"
        type="success"
      />

      <CustomAlert
        visible={showErrorAlert}
        title={alertTitle}
        message={alertMessage}
        onConfirm={() => setShowErrorAlert(false)}
        confirmText="OK"
        type="error"
      />

      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={{
            latitude: userLocation?.latitude || 14.5995,
            longitude: userLocation?.longitude || 120.9842,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          showsUserLocation={true}
          showsMyLocationButton={true}
        >
          {pickup && proximityConfig.showOnMap && (
            <Circle
              center={{
                latitude: pickup.latitude,
                longitude: pickup.longitude,
              }}
              radius={proximityRadius * 1000}
              strokeColor="rgba(24, 59, 92, 0.5)"
              fillColor="rgba(24, 59, 92, 0.1)"
              strokeWidth={2}
            />
          )}

          {pickup && filteredDrivers.map((driver) => (
            <Marker
              key={driver.driver_id}
              coordinate={{
                latitude: driver.latitude,
                longitude: driver.longitude,
              }}
              title={`${driver.first_name} ${driver.last_name}`}
              description={`${driver.vehicle_color} ${driver.vehicle_type} • ${driver.distance_km.toFixed(1)}km away`}
            >
              <View style={styles.driverMarker}>
                <Ionicons name="car" size={16} color="#FFF" />
              </View>
            </Marker>
          ))}

          {pickup && (
            <Marker
              coordinate={pickup}
              title="Pickup Location"
              description={pickupDetails || ""}
            >
              <View style={styles.pickupMarker}>
                <Ionicons name="location" size={16} color="#FFF" />
              </View>
            </Marker>
          )}
          {dropoff && (
            <Marker
              coordinate={dropoff}
              title="Dropoff Location"
              description={dropoffDetails || ""}
            >
              <View style={styles.dropoffMarker}>
                <Ionicons name="flag" size={16} color="#FFF" />
              </View>
            </Marker>
          )}

          {routeCoordinates.length > 0 && (
            <Polyline
              coordinates={routeCoordinates}
              strokeColor="#3B82F6"
              strokeWidth={4}
            />
          )}
        </MapView>
      </View>

      <View style={styles.bottomSheet}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#183B5C"]}
              tintColor="#183B5C"
            />
          }
        >
          <View style={styles.headerRow}>
            <Text style={styles.title}>Where are you going?</Text>
            
            <Pressable 
              style={styles.proximityButton} 
              onPress={openProximityFilter}
            >
              <Ionicons name="options-outline" size={20} color="#183B5C" />
              <Text style={styles.proximityButtonText}>
                {parseFloat(proximityRadius).toFixed(1)}km
              </Text>
            </Pressable>
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.inputIcon}>
              <Ionicons name="location" size={20} color="#10B981" />
            </View>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>PICKUP LOCATION</Text>
              <Pressable onPress={() => handleSelectOnMap("pickup")}>
                <Text style={styles.inputText} numberOfLines={2}>
                  {pickupText || "Tap to select pickup location"}
                </Text>
              </Pressable>

              <View style={styles.detailsContainer}>
                <TextInput
                  style={styles.detailsInput}
                  placeholder="Where exactly? (e.g., near the corner)"
                  value={pickupDetails}
                  onChangeText={setPickupDetails}
                  multiline
                  numberOfLines={2}
                />
              </View>
            </View>
            <Pressable
              onPress={handleUseCurrentLocation}
              style={styles.currentLocation}
            >
              <Ionicons name="locate" size={20} color="#183B5C" />
            </Pressable>
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.inputIcon}>
              <Ionicons name="flag" size={20} color="#EF4444" />
            </View>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>DROPOFF LOCATION</Text>
              <Pressable onPress={() => handleSelectOnMap("dropoff")}>
                <Text style={styles.inputText} numberOfLines={2}>
                  {dropoffText || "Tap to select dropoff location"}
                </Text>
              </Pressable>

              <View style={styles.detailsContainer}>
                <TextInput
                  style={styles.detailsInput}
                  placeholder="Where exactly? (e.g., in front of Jollibee)"
                  value={dropoffDetails}
                  onChangeText={setDropoffDetails}
                  multiline
                  numberOfLines={2}
                />
              </View>
            </View>
          </View>

          {(pickup || dropoff) && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.detailsSuggestions}
            >
              {commonDetails.map((detail, index) => (
                <Pressable
                  key={index}
                  style={styles.detailChip}
                  onPress={() => {
                    if (pickupDetails === "" && dropoffDetails === "") {
                      setPickupDetails(detail);
                    } else if (pickupDetails !== "") {
                      setDropoffDetails(detail);
                    } else {
                      setPickupDetails(detail);
                    }
                  }}
                >
                  <Text style={styles.detailChipText}>{detail}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <View style={styles.passengerContainer}>
            <Text style={styles.passengerLabel}>Number of Passengers:</Text>
            <View style={styles.passengerControls}>
              <Pressable
                style={[
                  styles.passengerButton,
                  passengerCount <= 1 && styles.passengerButtonDisabled,
                ]}
                onPress={() => handlePassengerChange(-1)}
                disabled={passengerCount <= 1}
              >
                <Ionicons
                  name="remove"
                  size={20}
                  color={passengerCount <= 1 ? "#9CA3AF" : "#183B5C"}
                />
              </Pressable>

              <Text style={styles.passengerCount}>{passengerCount}</Text>

              <Pressable
                style={[
                  styles.passengerButton,
                  passengerCount >= 6 && styles.passengerButtonDisabled,
                ]}
                onPress={() => handlePassengerChange(1)}
                disabled={passengerCount >= 6}
              >
                <Ionicons
                  name="add"
                  size={20}
                  color={passengerCount >= 6 ? "#9CA3AF" : "#183B5C"}
                />
              </Pressable>
            </View>
            <Text style={styles.passengerNote}>Maximum of 6 passengers</Text>
          </View>

          {recentLocations.length > 0 && (
            <View style={styles.recentContainer}>
              <Text style={styles.recentTitle}>Recent Locations</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {recentLocations.map((recent) => (
                  <Pressable
                    key={recent.id}
                    style={styles.recentItem}
                    onPress={() => handleSelectRecent(recent)}
                  >
                    <Ionicons
                      name={recent.type === "pickup" ? "location" : "flag"}
                      size={16}
                      color={recent.type === "pickup" ? "#10B981" : "#EF4444"}
                    />
                    <Text style={styles.recentText} numberOfLines={1}>
                      {recent.details || "Recent"}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {pickup && dropoff && estimatedDistance && (
            <View style={styles.tripSummary}>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Ionicons name="map-outline" size={16} color="#666" />
                  <Text style={styles.summaryLabel}>Distance</Text>
                  <Text style={styles.summaryValue}>
                    {estimatedDistance} km
                  </Text>
                </View>
                <View style={styles.summaryItem}>
                  <Ionicons name="time-outline" size={16} color="#666" />
                  <Text style={styles.summaryLabel}>Est. Time</Text>
                  <Text style={styles.summaryValue}>{estimatedTime} min</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Ionicons name="people-outline" size={16} color="#666" />
                  <Text style={styles.summaryLabel}>Passengers</Text>
                  <Text style={styles.summaryValue}>{passengerCount}</Text>
                </View>
              </View>

              <View style={styles.fareBreakdown}>
                <View style={styles.fareRow}>
                  <Text style={styles.fareBreakdownLabel}>
                    First 2 kilometers
                  </Text>
                  <Text style={styles.fareBreakdownValue}>
                    ₱{fareSettings.minimumFare}
                  </Text>
                </View>
                {parseFloat(estimatedDistance) > 2.0 && (
                  <View style={styles.fareRow}>
                    <Text style={styles.fareBreakdownLabel}>
                      Additional {Math.ceil(parseFloat(estimatedDistance)) - 2}{" "}
                      km (₱{fareSettings.perKmRate}/km)
                    </Text>
                    <Text style={styles.fareBreakdownValue}>
                      ₱
                      {(Math.ceil(parseFloat(estimatedDistance)) - 2) *
                        fareSettings.perKmRate}
                    </Text>
                  </View>
                )}
                <View style={styles.fareRow}>
                  <Text style={styles.fareBreakdownLabel}>
                    Subtotal (per passenger)
                  </Text>
                  <Text style={styles.fareBreakdownValue}>
                    ₱
                    {fareSettings.baseFare +
                      Math.max(
                        0,
                        Math.ceil(parseFloat(estimatedDistance)) - 2,
                      ) *
                        fareSettings.perKmRate}
                  </Text>
                </View>
                <View style={styles.fareRow}>
                  <Text style={styles.fareBreakdownLabel}>Passengers</Text>
                  <Text style={styles.fareBreakdownValue}>
                    × {passengerCount}
                  </Text>
                </View>
                <View style={styles.fareTotal}>
                  <Text style={styles.fareTotalLabel}>Total Fare</Text>
                  <Text style={styles.fareTotalValue}>₱{estimatedFare}</Text>
                </View>
              </View>
            </View>
          )}

          <View style={styles.driversInfo}>
            <Ionicons name="people-circle" size={20} color="#183B5C" />
            <Text style={styles.driversText}>
              {driversWithinRadius} drivers within {parseFloat(proximityRadius).toFixed(1)}km • Real-time updates when driver accepts
            </Text>
          </View>

          {/* SCAN TO RIDE BUTTON - Large and Prominent */}
          <Pressable
            style={[
              styles.scanButton,
              (!pickup || !dropoff) && styles.scanButtonDisabled,
            ]}
            onPress={openScanner}
            disabled={!pickup || !dropoff}
          >
            <Ionicons name="qr-code" size={28} color="#FFF" />
            <View style={styles.scanButtonTextContainer}>
              <Text style={styles.scanButtonTitle}>Scan to Ride</Text>
              <Text style={styles.scanButtonSubtitle}>
                {(!pickup || !dropoff) 
                  ? "Set pickup and dropoff first" 
                  : "Scan driver's QR code to book directly"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#FFF" />
          </Pressable>

          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.divider} />
          </View>

          <Pressable
            style={[
              styles.bookButton,
              (!pickup || !dropoff) && styles.bookButtonDisabled,
            ]}
            onPress={handleBookRide}
            disabled={!pickup || !dropoff}
          >
            <Text style={styles.bookButtonText}>Find Driver via Queue</Text>
          </Pressable>

          <View style={styles.queueInfo}>
            <Ionicons name="information-circle" size={16} color="#666" />
            <Text style={styles.queueInfoText}>
              {scanningForDriver 
                ? "Scanning for driver..." 
                : "Scan to Ride bypasses the queue - book directly with a driver you see"}
            </Text>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: -50,
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFF",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#183B5C",
  },
  mapContainer: {
    height: 300,
    width: "100%",
  },
  map: {
    flex: 1,
  },
  driverMarker: {
    backgroundColor: "#3B82F6",
    padding: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#FFF",
  },
  pickupMarker: {
    backgroundColor: "#10B981",
    padding: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#FFF",
  },
  dropoffMarker: {
    backgroundColor: "#EF4444",
    padding: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#FFF",
  },
  bottomSheet: {
    flex: 1,
    backgroundColor: "#FFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#183B5C",
  },
  proximityButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F7FF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  proximityButtonText: {
    color: "#183B5C",
    fontSize: 14,
    fontWeight: "600",
  },
  inputGroup: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 15,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 10,
  },
  inputIcon: {
    width: 40,
    alignItems: "center",
    paddingTop: 8,
  },
  inputContainer: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 10,
    color: "#666",
    marginBottom: 2,
  },
  inputText: {
    fontSize: 14,
    color: "#333",
    fontWeight: "500",
  },
  currentLocation: {
    padding: 8,
    marginTop: 8,
  },
  detailsContainer: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 8,
  },
  detailsInput: {
    fontSize: 13,
    color: "#666",
    padding: 0,
    minHeight: 40,
    textAlignVertical: "top",
  },
  detailsSuggestions: {
    flexDirection: "row",
    marginBottom: 15,
    marginLeft: 40,
  },
  detailChip: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
  },
  detailChipText: {
    fontSize: 12,
    color: "#666",
  },
  passengerContainer: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
  },
  passengerLabel: {
    fontSize: 14,
    color: "#666",
    marginBottom: 10,
  },
  passengerControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  passengerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  passengerButtonDisabled: {
    backgroundColor: "#F3F4F6",
  },
  passengerCount: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#183B5C",
    minWidth: 40,
    textAlign: "center",
  },
  passengerNote: {
    fontSize: 11,
    color: "#999",
    textAlign: "center",
    marginTop: 8,
  },
  recentContainer: {
    marginBottom: 15,
  },
  recentTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
  },
  recentItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  recentText: {
    fontSize: 12,
    color: "#333",
    marginLeft: 4,
    maxWidth: 100,
  },
  tripSummary: {
    backgroundColor: "#F9FAFB",
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 15,
  },
  summaryItem: {
    alignItems: "center",
    gap: 4,
  },
  summaryLabel: {
    fontSize: 11,
    color: "#666",
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#183B5C",
  },
  fareBreakdown: {
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 15,
  },
  fareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  fareBreakdownLabel: {
    fontSize: 12,
    color: "#666",
    flex: 1,
  },
  fareBreakdownValue: {
    fontSize: 12,
    color: "#333",
    fontWeight: "500",
  },
  fareTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  fareTotalLabel: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
  },
  fareTotalValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#183B5C",
  },
  driversInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F7FF",
    padding: 12,
    borderRadius: 12,
    marginBottom: 15,
  },
  driversText: {
    marginLeft: 8,
    fontSize: 13,
    color: "#183B5C",
    flex: 1,
  },
  scanButton: {
    backgroundColor: "#10B981",
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginBottom: 15,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  scanButtonDisabled: {
    backgroundColor: "#9CA3AF",
    opacity: 0.7,
  },
  scanButtonTextContainer: {
    flex: 1,
  },
  scanButtonTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "bold",
  },
  scanButtonSubtitle: {
    color: "#FFF",
    fontSize: 12,
    opacity: 0.9,
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 10,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: "#E5E7EB",
  },
  dividerText: {
    marginHorizontal: 10,
    color: "#666",
    fontSize: 12,
  },
  bookButton: {
    backgroundColor: "#183B5C",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 15,
  },
  bookButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  bookButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  queueInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  queueInfoText: {
    fontSize: 11,
    color: "#666",
    marginLeft: 6,
    textAlign: "center",
    flex: 1,
  },
  findingDriverContainer: {
    flex: 1,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  findingDriverTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#183B5C",
    marginTop: 20,
  },
  findingDriverSubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginTop: 10,
    marginBottom: 30,
  },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginBottom: 20,
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#183B5C",
    marginTop: 5,
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  adjustRadiusButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F7FF",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 25,
    marginBottom: 20,
    gap: 8,
  },
  adjustRadiusText: {
    color: "#183B5C",
    fontSize: 14,
    fontWeight: "600",
  },
  cancelFindingButton: {
    paddingVertical: 12,
    paddingHorizontal: 30,
  },
  cancelFindingText: {
    color: "#EF4444",
    fontSize: 16,
    fontWeight: "600",
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 20,
    width: "90%",
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  modalDescription: {
    fontSize: 14,
    color: "#666",
    marginBottom: 20,
    lineHeight: 20,
  },
  radiusDisplay: {
    alignItems: "center",
    marginBottom: 20,
  },
  radiusValue: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#183B5C",
  },
  slider: {
    width: "100%",
    height: 40,
  },
  radiusLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  radiusLabel: {
    fontSize: 12,
    color: "#666",
  },
  currentDriversContainer: {
    backgroundColor: "#F9FAFB",
    padding: 15,
    borderRadius: 12,
    marginBottom: 20,
  },
  currentDriversLabel: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  currentDriversValue: {
    fontSize: 24,
    fontWeight: "bold",
  },
  driversAvailable: {
    color: "#10B981",
  },
  driversUnavailable: {
    color: "#F59E0B",
  },
  noDriversHint: {
    fontSize: 12,
    color: "#666",
    marginTop: 8,
    fontStyle: "italic",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 10,
  },
  modalButton: {
    flex: 1,
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelModalButton: {
    backgroundColor: "#F3F4F6",
  },
  cancelModalButtonText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
  },
  saveModalButton: {
    backgroundColor: "#183B5C",
  },
  saveModalButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  // Scanner Styles
  scannerHeader: {
    backgroundColor: "#183B5C",
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  scannerBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  scannerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFF",
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  scanner: {
    flex: 1,
  },
  scannerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  scanArea: {
    width: 250,
    height: 250,
    position: "relative",
  },
  scanCorner: {
    position: "absolute",
    width: 40,
    height: 40,
    borderColor: "#FFF",
    borderTopWidth: 4,
    borderLeftWidth: 4,
    top: 0,
    left: 0,
  },
  scanCornerTopRight: {
    right: 0,
    left: "auto",
    borderLeftWidth: 0,
    borderRightWidth: 4,
  },
  scanCornerBottomLeft: {
    bottom: 0,
    top: "auto",
    borderTopWidth: 0,
    borderBottomWidth: 4,
  },
  scanCornerBottomRight: {
    bottom: 0,
    top: "auto",
    right: 0,
    left: "auto",
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 4,
    borderBottomWidth: 4,
  },
  scannerInstruction: {
    color: "#FFF",
    fontSize: 16,
    marginTop: 30,
    textAlign: "center",
  },
  scannerSubInstruction: {
    color: "#FFF",
    fontSize: 14,
    marginTop: 10,
    textAlign: "center",
    opacity: 0.8,
  },
  scannerFooter: {
    backgroundColor: "#183B5C",
    padding: 20,
    alignItems: "center",
  },
  scannerFooterText: {
    color: "#FFF",
    fontSize: 14,
    textAlign: "center",
  },
  // Custom Alert Styles
  customAlertOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  customAlertContainer: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 24,
    width: "80%",
    maxWidth: 320,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  customAlertIconContainer: {
    marginBottom: 16,
  },
  customAlertTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
    textAlign: "center",
  },
  customAlertMessage: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  customAlertButtons: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  customAlertButton: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  customAlertCancelButton: {
    backgroundColor: "#F3F4F6",
  },
  customAlertCancelText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
  },
  customAlertConfirmButton: {
    backgroundColor: "#183B5C",
  },
  customAlertConfirmText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
});