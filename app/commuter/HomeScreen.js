// screens/commuter/HomeScreen.js (Fixed Version)
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
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
import FindingDriverScreen from "./FindingDriver";
// Add this with your other imports
import CharacterMessage, { CharacterMessages, getRandomIdleMessage } from "../components/characterMessage";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ==================== MODERN CUSTOM ALERT COMPONENT ====================
const ModernAlert = ({ 
  visible, 
  onClose, 
  title, 
  message, 
  type = "info",
  confirmText = "OK",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  showCancel = false,
  icon,
  loading = false 
}) => {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 50,
          friction: 7,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  const getIconConfig = () => {
    switch(type) {
      case 'success':
        return { 
          icon: 'checkmark-circle', 
          color: '#10B981',
        };
      case 'error':
        return { 
          icon: 'alert-circle', 
          color: '#EF4444',
        };
      case 'warning':
        return { 
          icon: 'warning', 
          color: '#F59E0B',
        };
      case 'confirm':
        return { 
          icon: 'help-circle', 
          color: '#3B82F6',
        };
      default:
        return { 
          icon: 'information-circle', 
          color: '#3B82F6',
        };
    }
  };

  const iconConfig = getIconConfig();

  if (!visible) return null;

  return (
    <Modal
      transparent={true}
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
    >
      <Animated.View 
        style={[
          styles.alertOverlay,
          { opacity: opacityAnim }
        ]}
      >
        <Animated.View 
          style={[
            styles.alertContainer,
            {
              transform: [{ scale: scaleAnim }]
            }
          ]}
        >
          <View style={[styles.alertIconContainer, { backgroundColor: `${iconConfig.color}10` }]}>
            {loading ? (
              <ActivityIndicator size="large" color={iconConfig.color} />
            ) : (
              <Ionicons name={icon || iconConfig.icon} size={48} color={iconConfig.color} />
            )}
          </View>

          {title && (
            <Text style={styles.alertTitle}>{title}</Text>
          )}

          {message && (
            <Text style={styles.alertMessage}>{message}</Text>
          )}

          <View style={styles.alertButtons}>
            {showCancel && onCancel && (
              <TouchableOpacity
                style={[styles.alertButton, styles.alertCancelButton]}
                onPress={onCancel}
                activeOpacity={0.7}
              >
                <Text style={styles.alertCancelText}>{cancelText}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.alertButton, 
                styles.alertConfirmButton,
                { backgroundColor: iconConfig.color }
              ]}
              onPress={onConfirm || onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.alertConfirmText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

// ==================== CUSTOM TOAST NOTIFICATION ====================
const ModernToast = ({ visible, message, type, onHide }) => {
  const translateY = useRef(new Animated.Value(100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 300,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: 100,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start(() => onHide());
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [visible]);

  const getIcon = () => {
    switch(type) {
      case 'success': return 'checkmark-circle';
      case 'error': return 'alert-circle';
      case 'warning': return 'warning';
      default: return 'information-circle';
    }
  };

  const getColors = () => {
    switch(type) {
      case 'success': return { bg: '#10B981', icon: '#FFFFFF' };
      case 'error': return { bg: '#EF4444', icon: '#FFFFFF' };
      case 'warning': return { bg: '#F59E0B', icon: '#FFFFFF' };
      default: return { bg: '#183B5C', icon: '#FFFFFF' };
    }
  };

  const colors = getColors();

  return (
    <Animated.View
      style={[
        styles.toastContainer,
        {
          transform: [{ translateY }],
          opacity,
          backgroundColor: colors.bg,
        },
      ]}
    >
      <Ionicons name={getIcon()} size={20} color={colors.icon} />
      <Text style={styles.toastMessage}>{message}</Text>
    </Animated.View>
  );
};

// ==================== LOCATION INPUT CARD (FIXED CURRENT LOCATION BUTTON) ====================
const LocationCard = ({ 
  icon, 
  iconColor, 
  label, 
  placeholder, 
  value, 
  details, 
  onDetailsChange, 
  onPress, 
  onCurrentLocation,
  showCurrentLocation,
  isActive = false,
  trackUserAction
}) => (
  <Pressable 
    style={[
      styles.locationCard,
      isActive && styles.locationCardActive
    ]} 
    onPress={() => {
      if (trackUserAction) trackUserAction();
      onPress();
    }}
  >
    <View style={[styles.locationIconContainer, { backgroundColor: `${iconColor}15` }]}>
      <Ionicons name={icon} size={20} color={iconColor} />
    </View>
    <View style={styles.locationContent}>
      <Text style={styles.locationLabel}>{label}</Text>
      <Text style={[styles.locationValue, !value && styles.locationPlaceholder]}>
        {value || placeholder}
      </Text>
      {details !== undefined && (
        <TextInput
          style={styles.locationDetails}
          placeholder="Add details (optional)"
          placeholderTextColor="#9CA3AF"
          value={details}
          onChangeText={onDetailsChange}
        />
      )}
    </View>
    {showCurrentLocation && (
      <TouchableOpacity 
        onPress={() => {
          if (trackUserAction) trackUserAction();
          onCurrentLocation();
        }} 
        style={styles.currentLocationButton}
        activeOpacity={0.7}
      >
        <Ionicons name="locate" size={22} color="#183B5C" />
      </TouchableOpacity>
    )}
  </Pressable>
);

// ==================== PASSENGER SELECTOR ====================
const PassengerSelector = ({ count, onChange, max = 6, trackUserAction }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <View style={styles.passengerCard}>
      <TouchableOpacity 
        style={styles.passengerHeader}
        onPress={() => {
          if (trackUserAction) trackUserAction();
          setIsExpanded(!isExpanded);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.passengerHeaderLeft}>
          <Ionicons name="people" size={20} color="#6B7280" />
          <Text style={styles.passengerTitle}>Passengers</Text>
        </View>
        <View style={styles.passengerHeaderRight}>
          <Text style={styles.passengerCountText}>{count}</Text>
          <Ionicons 
            name={isExpanded ? "chevron-up" : "chevron-down"} 
            size={20} 
            color="#9CA3AF" 
          />
        </View>
      </TouchableOpacity>
      
      {isExpanded && (
        <View style={styles.passengerControls}>
          <TouchableOpacity
            style={[styles.passengerControl, count <= 1 && styles.passengerControlDisabled]}
            onPress={() => {
              if (trackUserAction) trackUserAction();
              onChange(count - 1);
            }}
            disabled={count <= 1}
            activeOpacity={0.7}
          >
            <Ionicons name="remove" size={20} color={count <= 1 ? "#D1D5DB" : "#183B5C"} />
          </TouchableOpacity>
          <Text style={styles.passengerNumber}>{count}</Text>
          <TouchableOpacity
            style={[styles.passengerControl, count >= max && styles.passengerControlDisabled]}
            onPress={() => {
              if (trackUserAction) trackUserAction();
              onChange(count + 1);
            }}
            disabled={count >= max}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={20} color={count >= max ? "#D1D5DB" : "#183B5C"} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

// ==================== TRIP SUMMARY CARD ====================
const TripSummaryCard = ({ distance, time, passengers, fare }) => (
  <View style={styles.summaryCard}>
    <View style={styles.summaryMetrics}>
      <View style={styles.metricItem}>
        <Ionicons name="map-outline" size={20} color="#6B7280" />
        <Text style={styles.metricValue}>{distance}</Text>
        <Text style={styles.metricLabel}>km</Text>
      </View>
      <View style={styles.metricDivider} />
      <View style={styles.metricItem}>
        <Ionicons name="time-outline" size={20} color="#6B7280" />
        <Text style={styles.metricValue}>{time}</Text>
        <Text style={styles.metricLabel}>min</Text>
      </View>
      <View style={styles.metricDivider} />
      <View style={styles.metricItem}>
        <Ionicons name="people-outline" size={20} color="#6B7280" />
        <Text style={styles.metricValue}>{passengers}</Text>
        <Text style={styles.metricLabel}>pax</Text>
      </View>
    </View>
    <View style={styles.fareRow}>
      <Text style={styles.fareLabel}>Total Fare</Text>
      <Text style={styles.fareAmount}>₱{fare}</Text>
    </View>
  </View>
);

// ==================== ACTION BUTTONS ====================
const ActionButtons = ({ onScan, onFind, disabled, trackUserAction }) => (
  <View style={styles.actionContainer}>
    <TouchableOpacity
      style={[styles.actionButton, disabled && styles.actionButtonDisabled]}
      onPress={() => {
        if (trackUserAction) trackUserAction();
        onScan();
      }}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <View style={styles.actionIconWrapper}>
        <Ionicons name="qr-code-outline" size={28} color="#10B981" />
      </View>
      <Text style={styles.actionTitle}>Scan QR</Text>
      <Text style={styles.actionSubtitle}>Instant ride</Text>
    </TouchableOpacity>
    
    <TouchableOpacity
      style={[styles.actionButton, styles.actionButtonPrimary, disabled && styles.actionButtonDisabled]}
      onPress={() => {
        if (trackUserAction) trackUserAction();
        onFind();
      }}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <View style={styles.actionIconWrapper}>
        <Ionicons name="car-outline" size={28} color="#FFF" />
      </View>
      <Text style={[styles.actionTitle, styles.actionTitleLight]}>Find Driver</Text>
      <Text style={[styles.actionSubtitle, styles.actionSubtitleLight]}>Search nearby</Text>
    </TouchableOpacity>
  </View>
);

// ==================== PROXIMITY FILTER MODAL ====================
const ProximityModal = ({ 
  visible, 
  onClose, 
  radius, 
  onRadiusChange, 
  onApply,
  driversCount,
  config 
}) => {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 300,
      }).start();
    } else {
      slideAnim.setValue(SCREEN_HEIGHT);
    }
  }, [visible]);

  return (
    <Modal
      transparent={true}
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity 
          style={styles.modalBackdrop} 
          activeOpacity={1} 
          onPress={onClose} 
        />
        <Animated.View 
          style={[
            styles.modalContent,
            { transform: [{ translateY: slideAnim }] }
          ]}
        >
          <View style={styles.modalHandle} />
          
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Search Radius</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalClose}>
              <Ionicons name="close" size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <View style={styles.radiusDisplay}>
            <Text style={styles.radiusValue}>{radius.toFixed(1)}</Text>
            <Text style={styles.radiusUnit}>km</Text>
          </View>

          <Slider
            style={styles.slider}
            minimumValue={config.minRadius}
            maximumValue={config.maxRadius}
            step={0.1}
            value={radius}
            onValueChange={onRadiusChange}
            minimumTrackTintColor="#183B5C"
            maximumTrackTintColor="#E5E7EB"
            thumbTintColor="#183B5C"
          />

          <View style={styles.quickSelectGrid}>
            {[1, 2, 3, 5].map((value) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.quickSelectChip,
                  radius === value && styles.quickSelectChipActive
                ]}
                onPress={() => onRadiusChange(value)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.quickSelectText,
                  radius === value && styles.quickSelectTextActive
                ]}>
                  {value} km
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.driverStats}>
            <Ionicons name="car-outline" size={20} color="#6B7280" />
            <Text style={styles.driverStatsText}>
              {driversCount} driver{driversCount !== 1 ? 's' : ''} available
            </Text>
          </View>

          <TouchableOpacity 
            style={styles.applyButton} 
            onPress={onApply}
            activeOpacity={0.8}
          >
            <Text style={styles.applyButtonText}>Apply Filter</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};

// ==================== MAIN SCREEN COMPONENT ====================
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
  const [currentBookingId, setCurrentBookingId] = useState(null);
  const [initialLoad, setInitialLoad] = useState(true);

  // Driver info
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
  const [proximityRadius, setProximityRadius] = useState(2.0);
  const [tempProximityRadius, setTempProximityRadius] = useState(2.0);
  const [proximityConfig, setProximityConfig] = useState({
    defaultRadius: 2.0,
    maxRadius: 5.0,
    minRadius: 0.5,
    showOnMap: true
  });
  const [filteredDrivers, setFilteredDrivers] = useState([]);
  const [driversWithinRadius, setDriversWithinRadius] = useState(0);

  // User data
  const [commuterId, setCommuterId] = useState(null);
  const [activeBooking, setActiveBooking] = useState(null);

  // Recent locations
  const [recentLocations, setRecentLocations] = useState([]);

  // Alert States
  const [alert, setAlert] = useState({
    visible: false,
    type: 'info',
    title: '',
    message: '',
    confirmText: 'OK',
    cancelText: 'Cancel',
    showCancel: false,
    onConfirm: null,
    onCancel: null,
  });
  
  // Character message states
  const [showCharacterMessage, setShowCharacterMessage] = useState(false);
  const [characterMessage, setCharacterMessage] = useState("");
  const [characterType, setCharacterType] = useState('default');
  
  // Add these with your other states
  const [idleTimer, setIdleTimer] = useState(null);
  const [lastUserAction, setLastUserAction] = useState(Date.now());
  const [hasShownWelcome, setHasShownWelcome] = useState(false);
  
  // Toast states
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' });

  // QR Code Scanning States
  const [permission, requestPermission] = useCameraPermissions();
  const [showScanner, setShowScanner] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [scanningForDriver, setScanningForDriver] = useState(false);
  const [scannedDriverData, setScannedDriverData] = useState(null);

  const googleApiKey = Constants.expoConfig?.extra?.GOOGLE_API_KEY;
  
  // Character message helper
  const showCharacterTip = (message, type = 'default', autoHide = true) => {
    setCharacterMessage(message);
    setCharacterType(type);
    setShowCharacterMessage(true);
    
    if (autoHide) {
      setTimeout(() => {
        setShowCharacterMessage(false);
      }, 5000);
    }
  };
  
  // Show custom alert helper
  const showAlert = ({ type = 'info', title, message, confirmText = 'OK', cancelText = 'Cancel', showCancel = false, onConfirm, onCancel }) => {
    setAlert({
      visible: true,
      type,
      title,
      message,
      confirmText,
      cancelText,
      showCancel,
      onConfirm: () => {
        setAlert(prev => ({ ...prev, visible: false }));
        if (onConfirm) onConfirm();
      },
      onCancel: () => {
        setAlert(prev => ({ ...prev, visible: false }));
        if (onCancel) onCancel();
      },
    });
  };

  // Show toast helper
  const showToast = (message, type = 'info') => {
    setToast({ visible: true, message, type });
  };

  // Hide alert helper
  const hideAlert = () => {
    setAlert(prev => ({ ...prev, visible: false }));
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
  }, []);

  // Focus effect
  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      const loadInitialData = async () => {
        if (isActive) {
          setLoading(true);
          await Promise.all([
            checkActiveBooking(),
            getCommuterId(),
            loadRecentLocations(),
            fetchFareSettings(),
            fetchProximityConfig(),
            loadProximityRadius(),
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
    } catch (err) {
      console.log("Error fetching proximity config:", err);
    }
  };

  const loadProximityRadius = async () => {
    try {
      const saved = await AsyncStorage.getItem('proximity_radius_home');
      if (saved) {
        const radius = parseFloat(saved);
        setProximityRadius(radius);
        setTempProximityRadius(radius);
      }
    } catch (err) {
      console.log("Error loading proximity radius:", err);
    }
  };

  const saveProximityRadius = async (radius) => {
    try {
      setProximityRadius(radius);
      await AsyncStorage.setItem('proximity_radius_home', radius.toString());
      setShowProximityFilter(false);
      showToast(`Showing drivers within ${radius.toFixed(1)} km`, 'success');
    } catch (err) {
      console.log("Error saving proximity radius:", err);
    }
  };

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
  };

  const openProximityFilter = () => {
    setTempProximityRadius(proximityRadius);
    setShowProximityFilter(true);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      getUserLocation(),
      fetchFareSettings(),
      loadRecentLocations(),
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

      recents = [recent, ...recents.filter((r) => r.address !== address)].slice(0, 10);

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
          setCurrentBookingId(data.id);
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
        showAlert({
          type: 'warning',
          title: 'Location Permission',
          message: 'Location permission is needed to book a ride',
          confirmText: 'OK',
        });
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
      showAlert({
        type: 'error',
        title: 'Location Error',
        message: 'Failed to get your location. Please try again.',
        confirmText: 'OK',
      });
    }
  };

  const getNearbyDrivers = async (coords) => {
    try {
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

      if (error) throw error;

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

        if (pickup) {
          filterDriversByProximity();
        }
      } else {
        setAllDrivers([]);
        setDriversWithinRadius(0);
        setFilteredDrivers([]);
      }
    } catch (err) {
      console.log("Error getting nearby drivers:", err);
      setAllDrivers([]);
      setDriversWithinRadius(0);
      setFilteredDrivers([]);
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
    trackUserAction();
    
    if (userLocation) {
      setPickup(userLocation);
      Location.reverseGeocodeAsync(userLocation).then((address) => {
        if (address[0]) {
          const { street, name, city, region } = address[0];
          const fullAddress = `${street || name || "Current Location"}, ${city || ""}, ${region || ""}`;
          setPickupText(fullAddress);
          showCharacterTip(CharacterMessages.pickupSelectedCute(fullAddress), 'happy');
        }
      });
    }
  };

  const handleSelectOnMap = (type) => {
    trackUserAction();
    
    navigation.navigate("MapPicker", {
      type,
      onSelect: (location, address) => {
        if (type === "pickup") {
          setPickup(location);
          setPickupText(address);
          showCharacterTip(CharacterMessages.pickupSelectedCute(address), 'happy');
        } else {
          setDropoff(location);
          setDropoffText(address);
          showCharacterTip(CharacterMessages.dropoffSelectedCute(address), 'excited');
        }

        if ((type === "pickup" && dropoff) || (type === "dropoff" && pickup)) {
          calculateRoute(
            type === "pickup" ? location : pickup,
            type === "dropoff" ? location : dropoff,
          );
        }
        
        if (pickup && dropoff) {
          setTimeout(() => {
            showCharacterTip(CharacterMessages.bothSelected(), 'excited');
          }, 1000);
        }
      },
    });
  };

  const handleSelectRecent = (recent) => {
    trackUserAction();
    
    if (recent.type === "pickup") {
      setPickup(recent.location);
      setPickupText(recent.address);
      setPickupDetails(recent.details || "");
      showCharacterTip(CharacterMessages.pickupSelectedCute(recent.address), 'happy');
    } else {
      setDropoff(recent.location);
      setDropoffText(recent.address);
      setDropoffDetails(recent.details || "");
      showCharacterTip(CharacterMessages.dropoffSelectedCute(recent.address), 'excited');
    }

    if (pickup && dropoff) {
      calculateRoute(pickup, dropoff);
    }
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
    setEstimatedDistance(exactDistance.toFixed(2));
    
    let farePerPassenger;
    
    if (exactDistance <= 1.0) {
      farePerPassenger = 20;
    } else if (exactDistance < 2.0) {
      farePerPassenger = 30;
    } else {
      const roundedToHalf = Math.ceil(exactDistance * 2) / 2;
      farePerPassenger = roundedToHalf * 20;
    }
    
    const totalFare = farePerPassenger * passengerCount;
    setEstimatedFare(totalFare);
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
  
  useEffect(() => {
    if (pickup && dropoff && !showCharacterMessage) {
      const lastShown = lastUserAction;
      const now = Date.now();
      if (now - lastShown > 3000) {
        setTimeout(() => {
          showCharacterTip(CharacterMessages.bothSelected(), 'excited');
        }, 500);
      }
    }
  }, [pickup, dropoff]);
  
  useEffect(() => {
    if (!pickup && !dropoff && !initialLoad && !showCharacterMessage) {
      setTimeout(() => {
        showCharacterTip(CharacterMessages.needBoth(), 'cute');
      }, 1000);
    } else if (pickup && !dropoff && !initialLoad && !showCharacterMessage) {
      setTimeout(() => {
        showCharacterTip(CharacterMessages.needDropoff(), 'cute');
      }, 1000);
    } else if (!pickup && dropoff && !initialLoad && !showCharacterMessage) {
      setTimeout(() => {
        showCharacterTip(CharacterMessages.needPickup(), 'cute');
      }, 1000);
    }
  }, [pickup, dropoff, initialLoad]);

  useEffect(() => {
    if (!initialLoad && !hasShownWelcome && !showCharacterMessage) {
      setTimeout(() => {
        showCharacterTip(CharacterMessages.welcome(), 'excited');
        setHasShownWelcome(true);
      }, 1000);
    }
  }, [initialLoad, hasShownWelcome]);

  useEffect(() => {
    const idleCheckInterval = setInterval(() => {
      const now = Date.now();
      const idleTime = now - lastUserAction;
      
      if (idleTime > 10000 && !showCharacterMessage && !loading && !findingDriver) {
        if (!pickup || !dropoff) {
          showCharacterTip(getRandomIdleMessage(), 'curious');
        }
      }
    }, 5000);

    return () => {
      clearInterval(idleCheckInterval);
    };
  }, [lastUserAction, showCharacterMessage, loading, findingDriver, pickup, dropoff]);

  const trackUserAction = useCallback(() => {
    setLastUserAction(Date.now());
  }, []);

  const handlePassengerChange = (newCount) => {
    trackUserAction();
    
    if (newCount >= 1 && newCount <= 6) {
      setPassengerCount(newCount);
      showCharacterTip(CharacterMessages.passengerSelected(newCount), 'cute');
    }
  };

  const createBooking = async () => {
    if (!commuterId) {
      showAlert({
        type: 'error',
        title: 'Login Required',
        message: 'Please login first to book a ride',
        confirmText: 'OK',
      });
      return;
    }

    if (driversWithinRadius === 0) {
      showCharacterTip(CharacterMessages.noDrivers(proximityRadius.toFixed(1)), 'worried');
      showAlert({
        type: 'warning',
        title: 'No Drivers Available',
        message: `No drivers found within ${proximityRadius.toFixed(1)} km of your pickup location. Would you like to increase the search radius?`,
        confirmText: 'Increase Radius',
        cancelText: 'Cancel',
        showCancel: true,
        onConfirm: () => openProximityFilter(),
      });
      return;
    }

    setFindingDriver(true);
    showCharacterTip(CharacterMessages.waiting(), 'excited', false);

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
            created_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (bookingError) throw bookingError;

      setCurrentBookingId(booking.id);
      showCharacterTip(CharacterMessages.bookingSuccess(), 'happy');

      if (pickup && pickupText) {
        saveRecentLocation(pickup, pickupText, pickupDetails, "pickup");
      }
      if (dropoff && dropoffText) {
        saveRecentLocation(dropoff, dropoffText, dropoffDetails, "dropoff");
      }
      
    } catch (err) {
      console.log("Error creating booking:", err);
      showCharacterTip(CharacterMessages.bookingError(), 'worried');
      showAlert({
        type: 'error',
        title: 'Booking Failed',
        message: 'Failed to create booking. Please try again.',
        confirmText: 'OK',
      });
      setFindingDriver(false);
    }
  };

  const handleDriverFound = (driverId) => {
    setFindingDriver(false);
    navigation.navigate("TrackRide", {
      bookingId: currentBookingId,
      driverId: driverId,
    });
  };

  const handleCancelFinding = () => {
    setFindingDriver(false);
    setCurrentBookingId(null);
  };

  const handleNoDriversFound = () => {
    setFindingDriver(false);
    setCurrentBookingId(null);
  };

  const openScanner = async () => {
    try {
      if (!permission?.granted) {
        const { granted } = await requestPermission();
        if (!granted) {
          showAlert({
            type: 'warning',
            title: 'Camera Permission',
            message: 'We need camera access to scan the driver\'s QR code.',
            confirmText: 'OK',
          });
          return;
        }
      }
      
      if (!pickup || !dropoff) {
        showCharacterTip(CharacterMessages.needBoth(), 'worried');
        showAlert({
          type: 'warning',
          title: 'Missing Locations',
          message: 'Please select both pickup and dropoff locations before scanning.',
          confirmText: 'OK',
        });
        return;
      }
      
      showCharacterTip(CharacterMessages.scanning(), 'excited');
      setScanned(false);
      setScanningForDriver(true);
      setShowScanner(true);
    } catch (err) {
      console.log("Error opening scanner:", err);
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
      
      if (qrData.type !== 'driver_qr' && !qrData.driver_id) {
        showAlert({
          type: 'error',
          title: 'Invalid QR Code',
          message: 'This is not a valid driver QR code.',
          confirmText: 'OK',
          onConfirm: () => {
            setShowScanner(false);
            setScanningForDriver(false);
          },
        });
        return;
      }
      
      const driverId = qrData.driver_id || qrData.id;
      
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
        showAlert({
          type: 'error',
          title: 'Driver Not Found',
          message: 'Could not find driver information.',
          confirmText: 'OK',
          onConfirm: () => {
            setShowScanner(false);
            setScanningForDriver(false);
          },
        });
        return;
      }
      
      setScannedDriverData(driverData);
      setShowScanner(false);
      
      if (!pickup) {
        showAlert({
          type: 'warning',
          title: 'Missing Pickup',
          message: 'Please set your pickup location first.',
          confirmText: 'OK',
          onConfirm: () => setScanningForDriver(false),
        });
        return;
      }
      
      if (!dropoff) {
        showAlert({
          type: 'warning',
          title: 'Missing Dropoff',
          message: 'Please set your dropoff location first.',
          confirmText: 'OK',
          onConfirm: () => setScanningForDriver(false),
        });
        return;
      }
      
      showDriverBookingConfirmation(driverData);
      
    } catch (err) {
      console.log("Error processing QR code:", err);
      showAlert({
        type: 'error',
        title: 'Invalid QR Code',
        message: 'Could not read the QR code. Please try again.',
        confirmText: 'OK',
        onConfirm: () => {
          scanTimeoutRef.current = setTimeout(() => {
            setScanned(false);
            setShowScanner(false);
            setScanningForDriver(false);
            scanTimeoutRef.current = null;
          }, 1000);
        },
      });
    }
  };

  const showDriverBookingConfirmation = (driverData) => {
    const vehicle = driverData.driver_vehicles?.[0] || {};
    
    showAlert({
      type: 'confirm',
      title: 'Confirm Ride',
      message: `${driverData.first_name} ${driverData.last_name}\n${vehicle.vehicle_color || ''} ${vehicle.vehicle_type || ''}\n${vehicle.plate_number || 'N/A'}\n\n📍 ${pickupText}\n🏁 ${dropoffText}\n👥 ${passengerCount} pax\n💰 ₱${estimatedFare}`,
      confirmText: 'Confirm',
      cancelText: 'Cancel',
      showCancel: true,
      onConfirm: () => createDirectBooking(driverData.id),
      onCancel: () => setScanningForDriver(false),
    });
  };

  const createDirectBooking = async (driverId) => {
    if (!commuterId) {
      showAlert({
        type: 'error',
        title: 'Login Required',
        message: 'Please login first',
        confirmText: 'OK',
      });
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
            driver_id: driverId,
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
            status: "accepted",
            accepted_at: new Date(),
            created_at: new Date(),
          },
        ])
        .select()
        .single();

      if (bookingError) throw bookingError;

      if (pickup && pickupText) {
        saveRecentLocation(pickup, pickupText, pickupDetails, "pickup");
      }
      if (dropoff && dropoffText) {
        saveRecentLocation(dropoff, dropoffText, dropoffDetails, "dropoff");
      }

      setScanningForDriver(false);
      setFindingDriver(false);
      
      navigation.navigate("TrackRide", {
        bookingId: booking.id,
        driverId: driverId,
      });
      
    } catch (err) {
      console.log("Error creating direct booking:", err);
      showAlert({
        type: 'error',
        title: 'Booking Failed',
        message: 'Failed to create booking. Please try again.',
        confirmText: 'OK',
      });
      setFindingDriver(false);
      setScanningForDriver(false);
    }
  };

  const handleCancelScanning = () => {
    setShowScanner(false);
    setScanned(false);
    setScanningForDriver(false);
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
  };

  const handleBookRide = () => {
    if (!pickup) {
      showCharacterTip(CharacterMessages.needPickup(), 'worried');
      showAlert({
        type: 'warning',
        title: 'Missing Pickup',
        message: 'Please select a pickup location',
        confirmText: 'OK',
      });
      return;
    }
    if (!dropoff) {
      showCharacterTip(CharacterMessages.needDropoff(), 'worried');
      showAlert({
        type: 'warning',
        title: 'Missing Dropoff',
        message: 'Please select a dropoff location',
        confirmText: 'OK',
      });
      return;
    }

    if (driversWithinRadius === 0) {
      showCharacterTip(CharacterMessages.noDrivers(proximityRadius.toFixed(1)), 'worried');
      showAlert({
        type: 'warning',
        title: 'No Drivers Available',
        message: `No drivers found within ${proximityRadius.toFixed(1)} km. Would you like to increase the search radius?`,
        confirmText: 'Increase Radius',
        cancelText: 'Cancel',
        showCancel: true,
        onConfirm: () => openProximityFilter(),
      });
      return;
    }

    showAlert({
      type: 'confirm',
      title: 'Confirm Booking',
      message: `${pickupText}\n→\n${dropoffText}\n\n${passengerCount} passenger${passengerCount > 1 ? 's' : ''} • ₱${estimatedFare}`,
      confirmText: 'Book Now',
      cancelText: 'Cancel',
      showCancel: true,
      onConfirm: createBooking,
    });
  };

  if (initialLoad && loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
      </View>
    );
  }

  if (findingDriver && currentBookingId) {
    return (
      <FindingDriverScreen
        visible={findingDriver}
        bookingId={currentBookingId}
        driversWithinRadius={driversWithinRadius}
        proximityRadius={proximityRadius}
        onCancel={handleCancelFinding}
        onDriverFound={handleDriverFound}
        onNoDrivers={handleNoDriversFound}
        pickupText={pickupText}
        dropoffText={dropoffText}
      />
    );
  }

  if (showScanner) {
    return (
      <View style={styles.container}>
        <View style={styles.scannerHeader}>
          <TouchableOpacity onPress={handleCancelScanning} style={styles.scannerBackButton}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.scannerTitle}>Scan Driver QR</Text>
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
                Position QR code within frame
              </Text>
            </View>
          </CameraView>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container]}>
      {/* Modern Alerts */}
      <ModernAlert
        visible={alert.visible}
        type={alert.type}
        title={alert.title}
        message={alert.message}
        confirmText={alert.confirmText}
        cancelText={alert.cancelText}
        showCancel={alert.showCancel}
        onConfirm={alert.onConfirm}
        onCancel={alert.onCancel}
        onClose={hideAlert}
      />

      {/* Toast Notifications */}
      <ModernToast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast({ ...toast, visible: false })}
      />

      {/* Cute Character Message - at the top */}
      <CharacterMessage
        visible={showCharacterMessage}
        message={characterMessage}
        characterType={characterType}
        position="top"
        autoHide={true}
        autoHideDuration={5000}
        onClose={() => setShowCharacterMessage(false)}
      />

      {/* Proximity Filter Modal */}
      <ProximityModal
        visible={showProximityFilter}
        onClose={() => setShowProximityFilter(false)}
        radius={tempProximityRadius}
        onRadiusChange={setTempProximityRadius}
        onApply={() => saveProximityRadius(tempProximityRadius)}
        driversCount={driversWithinRadius}
        config={proximityConfig}
      />

      {/* Map View */}
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
          showsMyLocationButton={false}
        >
          {pickup && proximityConfig.showOnMap && (
            <Circle
              center={pickup}
              radius={proximityRadius * 1000}
              strokeColor="rgba(24, 59, 92, 0.3)"
              fillColor="rgba(24, 59, 92, 0.05)"
              strokeWidth={1}
            />
          )}

          {pickup && filteredDrivers.map((driver) => (
            <Marker
              key={driver.driver_id}
              coordinate={{
                latitude: driver.latitude,
                longitude: driver.longitude,
              }}
            >
              <View style={styles.driverMarker}>
                <Ionicons name="car" size={12} color="#FFF" />
              </View>
            </Marker>
          ))}

          {pickup && (
            <Marker coordinate={pickup}>
              <View style={styles.pickupMarker}>
                <Ionicons name="location" size={12} color="#FFF" />
              </View>
            </Marker>
          )}
          {dropoff && (
            <Marker coordinate={dropoff}>
              <View style={styles.dropoffMarker}>
                <Ionicons name="flag" size={12} color="#FFF" />
              </View>
            </Marker>
          )}

          {routeCoordinates.length > 0 && (
            <Polyline
              coordinates={routeCoordinates}
              strokeColor="#3B82F6"
              strokeWidth={3}
            />
          )}
        </MapView>
        {/* Custom Current Location Button - Always visible */}
        <TouchableOpacity 
          style={styles.mapCurrentLocationButton}
          onPress={() => {
            trackUserAction();
            if (userLocation) {
              mapRef.current?.animateToRegion({
                latitude: userLocation.latitude,
                longitude: userLocation.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }, 500);
            }
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="location" size={24} color="#FFF" />
          <View style={styles.mapButtonInner}>
            <Ionicons name="locate" size={20} color="#183B5C" />
          </View>
        </TouchableOpacity>
      </View>

      {/* Bottom Sheet - NO TOP PADDING/INSETS */}
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.bottomSheet}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#183B5C"]}
              tintColor="#183B5C"
            />
          }
        >
          {/* Header */}
          <View style={styles.headerSection}>
            <View>
              <Text style={styles.greeting}>Hello,</Text>
              <Text style={styles.greetingName}>Where to?</Text>
            </View>
            <TouchableOpacity 
              style={styles.filterButton} 
              onPress={() => {
                trackUserAction();
                openProximityFilter();
              }}
            >
              <Ionicons name="options-outline" size={20} color="#183B5C" />
              <Text style={styles.filterText}>{proximityRadius.toFixed(1)}km</Text>
            </TouchableOpacity>
          </View>

          {/* Location Inputs */}
          <LocationCard
            icon="location"
            iconColor="#10B981"
            label="PICKUP"
            placeholder="Select pickup location"
            value={pickupText}
            details={pickupDetails}
            onDetailsChange={setPickupDetails}
            onPress={() => handleSelectOnMap("pickup")}
            onCurrentLocation={handleUseCurrentLocation}
            showCurrentLocation={true}
            trackUserAction={trackUserAction}
          />

          <LocationCard
            icon="flag"
            iconColor="#EF4444"
            label="DROPOFF"
            placeholder="Select dropoff location"
            value={dropoffText}
            details={dropoffDetails}
            onDetailsChange={setDropoffDetails}
            onPress={() => handleSelectOnMap("dropoff")}
            showCurrentLocation={false}
            trackUserAction={trackUserAction}
          />
          
          {/* RECENT LOCATIONS  */}
          {recentLocations.length > 0 && (
            <View style={styles.recentSection}>
              <Text style={styles.sectionTitle}>Recent Locations</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {recentLocations.map((recent) => (
                  <TouchableOpacity
                    key={recent.id}
                    style={styles.recentChip}
                    onPress={() => {
                      trackUserAction();
                      handleSelectRecent(recent);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={recent.type === "pickup" ? "location" : "flag"}
                      size={14}
                      color={recent.type === "pickup" ? "#10B981" : "#EF4444"}
                    />
                    <Text style={styles.recentChipText} numberOfLines={1}>
                      {recent.address.split(',')[0]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Passenger Selector */}
          <PassengerSelector
            count={passengerCount}
            onChange={handlePassengerChange}
            trackUserAction={trackUserAction}
          />

          {/* Trip Summary */}
          {pickup && dropoff && estimatedDistance && (
            <TripSummaryCard
              distance={estimatedDistance}
              time={estimatedTime}
              passengers={passengerCount}
              fare={estimatedFare}
            />
          )}

          {/* Action Buttons */}
          <ActionButtons
            onScan={openScanner}
            onFind={handleBookRide}
            disabled={!pickup || !dropoff}
            trackUserAction={trackUserAction}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFF",
  },
  mapContainer: {
    height: 320,
    width: "100%",
  },
  map: {
    flex: 1,
  },
  driverMarker: {
    backgroundColor: "#3B82F6",
    padding: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#FFF",
  },
  pickupMarker: {
    backgroundColor: "#10B981",
    padding: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#FFF",
  },
  dropoffMarker: {
    backgroundColor: "#EF4444",
    padding: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#FFF",
  },
  bottomSheet: {
    flex: 1,
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -24,
    maxHeight: SCREEN_HEIGHT - 200,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },
  headerSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  greeting: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 2,
  },
  greetingName: {
    fontSize: 24,
    fontWeight: "600",
    color: "#111827",
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  filterText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#183B5C",
  },
  locationCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    position: "relative",
  },
  locationCardActive: {
    borderColor: "#183B5C",
    borderWidth: 1.5,
  },
  locationIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  locationContent: {
    flex: 1,
    paddingRight: 8,
  },
  locationLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9CA3AF",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  locationValue: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
    marginBottom: 8,
  },
  locationPlaceholder: {
    color: "#9CA3AF",
    fontWeight: "400",
  },
  locationDetails: {
    fontSize: 13,
    color: "#6B7280",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  currentLocationButton: {
    position: "absolute",
    right: 16,
    top: 16,
    padding: 8,
    backgroundColor: "#FFF",
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  passengerCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    overflow: "hidden",
  },
  passengerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  passengerHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  passengerHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  passengerTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
  },
  passengerCountText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#183B5C",
  },
  passengerControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 32,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  passengerControl: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  passengerControlDisabled: {
    backgroundColor: "#F3F4F6",
  },
  passengerNumber: {
    fontSize: 28,
    fontWeight: "600",
    color: "#183B5C",
    minWidth: 48,
    textAlign: "center",
  },
  recentSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
    marginBottom: 12,
  },
  recentChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    gap: 6,
  },
  recentChipText: {
    fontSize: 13,
    color: "#374151",
    maxWidth: 100,
  },
  summaryCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  summaryMetrics: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  metricItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  metricLabel: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  metricDivider: {
    width: 1,
    backgroundColor: "#E5E7EB",
  },
  fareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  fareLabel: {
    fontSize: 14,
    color: "#6B7280",
  },
  fareAmount: {
    fontSize: 24,
    fontWeight: "700",
    color: "#183B5C",
  },
  actionContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    flex: 1,
    backgroundColor: "#FFF",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  actionButtonPrimary: {
    backgroundColor: "#183B5C",
    borderColor: "#183B5C",
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionIconWrapper: {
    marginBottom: 8,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  actionTitleLight: {
    color: "#FFF",
  },
  actionSubtitle: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  actionSubtitleLight: {
    color: "#E5E7EB",
  },
  alertOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  alertContainer: {
    backgroundColor: "#FFF",
    borderRadius: 24,
    padding: 24,
    width: SCREEN_WIDTH - 48,
    maxWidth: 340,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  alertIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  alertTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  alertMessage: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  alertButtons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  alertButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  alertCancelButton: {
    backgroundColor: "#F3F4F6",
  },
  alertCancelText: {
    color: "#6B7280",
    fontSize: 15,
    fontWeight: "600",
  },
  alertConfirmButton: {
    backgroundColor: "#183B5C",
  },
  alertConfirmText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "600",
  },
  toastContainer: {
    position: "absolute",
    bottom: 100,
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    zIndex: 1000,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  toastMessage: {
    flex: 1,
    color: "#FFF",
    fontSize: 14,
    fontWeight: "500",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#E5E7EB",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
  },
  modalClose: {
    padding: 4,
  },
  radiusDisplay: {
    alignItems: "center",
    marginBottom: 24,
  },
  radiusValue: {
    fontSize: 56,
    fontWeight: "700",
    color: "#183B5C",
  },
  radiusUnit: {
    fontSize: 16,
    color: "#9CA3AF",
    marginTop: -8,
  },
  slider: {
    width: "100%",
    height: 40,
    marginBottom: 24,
  },
  quickSelectGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  quickSelectChip: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    alignItems: "center",
  },
  quickSelectChipActive: {
    backgroundColor: "#183B5C",
  },
  quickSelectText: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "500",
  },
  quickSelectTextActive: {
    color: "#FFF",
  },
  driverStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#F9FAFB",
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 24,
  },
  driverStatsText: {
    fontSize: 14,
    color: "#6B7280",
  },
  applyButton: {
    backgroundColor: "#183B5C",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  applyButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  scannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: "#000",
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
    fontWeight: "600",
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
    backgroundColor: "rgba(0,0,0,0.6)",
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
    borderTopWidth: 3,
    borderLeftWidth: 3,
    top: 0,
    left: 0,
  },
  scanCornerTopRight: {
    right: 0,
    left: "auto",
    borderLeftWidth: 0,
    borderRightWidth: 3,
  },
  scanCornerBottomLeft: {
    bottom: 0,
    top: "auto",
    borderTopWidth: 0,
    borderBottomWidth: 3,
  },
  scanCornerBottomRight: {
    bottom: 0,
    top: "auto",
    right: 0,
    left: "auto",
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 3,
    borderBottomWidth: 3,
  },
  scannerInstruction: {
    color: "#FFF",
    fontSize: 14,
    marginTop: 30,
    textAlign: "center",
  },
  mapCurrentLocationButton: {
    position: "absolute",
    bottom: 30,
    right: 16,
    backgroundColor: "#FFF",
    width: 48,
    height: 48,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 10,
    borderWidth: 1,
    borderColor: "#F0F0F0",
  },
  mapButtonInner: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
});