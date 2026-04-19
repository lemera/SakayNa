// screens/commuter/HomeScreen.js
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
  PixelRatio,
  StatusBar,
  PanResponder,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, {
  Marker,
  Polyline,
  Circle,
  PROVIDER_GOOGLE,
} from "react-native-maps";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { CameraView, useCameraPermissions } from "expo-camera";
import FindingDriverScreen from "./FindingDriver";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

// ==================== RESPONSIVE UTILITIES ====================
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const guidelineBaseWidth = 375;
const guidelineBaseHeight = 667;

const scale = (size) => (SCREEN_WIDTH / guidelineBaseWidth) * size;
const verticalScale = (size) => (SCREEN_HEIGHT / guidelineBaseHeight) * size;
const moderateScale = (size, factor = 0.5) =>
  size + (scale(size) - size) * factor;
const moderateVerticalScale = (size, factor = 0.5) =>
  size + (verticalScale(size) - size) * factor;

const rf = (size) => {
  const newSize = moderateScale(size);
  return Math.round(PixelRatio.roundToNearestPixel(newSize));
};

const isSmallDevice = SCREEN_HEIGHT < 668;
const isMediumDevice = SCREEN_HEIGHT >= 668 && SCREEN_HEIGHT < 812;

// Draggable sheet snap points
const SHEET_TOP_EXPANDED = SCREEN_HEIGHT * 0.14;
const SHEET_TOP_MID = SCREEN_HEIGHT * 0.42;
const SHEET_TOP_COLLAPSED = SCREEN_HEIGHT * 0.6;

// ==================== MODERN CUSTOM ALERT ====================
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
  loading = false,
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
  }, [visible, scaleAnim, opacityAnim]);

  const getIconConfig = () => {
    switch (type) {
      case "success":
        return { icon: "checkmark-circle", color: "#10B981" };
      case "error":
        return { icon: "alert-circle", color: "#EF4444" };
      case "warning":
        return { icon: "warning", color: "#F59E0B" };
      case "confirm":
        return { icon: "help-circle", color: "#3B82F6" };
      default:
        return { icon: "information-circle", color: "#3B82F6" };
    }
  };

  const iconConfig = getIconConfig();
  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.alertOverlay, { opacity: opacityAnim }]}>
        <Animated.View
          style={[
            styles.alertContainer,
            { transform: [{ scale: scaleAnim }] },
          ]}
        >
          <View
            style={[
              styles.alertIconContainer,
              { backgroundColor: `${iconConfig.color}10` },
            ]}
          >
            {loading ? (
              <ActivityIndicator size="large" color={iconConfig.color} />
            ) : (
              <Ionicons
                name={icon || iconConfig.icon}
                size={moderateScale(44)}
                color={iconConfig.color}
              />
            )}
          </View>

          {!!title && <Text style={styles.alertTitle}>{title}</Text>}
          {!!message && <Text style={styles.alertMessage}>{message}</Text>}

          <View style={styles.alertButtons}>
            {showCancel && onCancel && (
              <TouchableOpacity
                style={[styles.alertButton, styles.alertCancelButton]}
                onPress={onCancel}
              >
                <Text style={styles.alertCancelText}>{cancelText}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.alertButton,
                styles.alertConfirmButton,
                { backgroundColor: iconConfig.color },
              ]}
              onPress={onConfirm || onClose}
            >
              <Text style={styles.alertConfirmText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

// ==================== CLEAN LOCATION CARD ====================
const LocationCard = ({
  iconColor,
  label,
  placeholder,
  value,
  details,
  onDetailsChange,
  onPress,
  trackUserAction,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () =>
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
      tension: 100,
      friction: 10,
    }).start();

  const handlePressOut = () =>
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 100,
      friction: 10,
    }).start();

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        activeOpacity={0.9}
        style={[
          styles.locationCard,
          !value && { borderColor: iconColor, borderWidth: 1.5 },
        ]}
        onPress={() => {
          trackUserAction?.();
          onPress?.();
        }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <View
          style={[
            styles.locationDot,
            { borderColor: iconColor },
            value
              ? { backgroundColor: iconColor }
              : { backgroundColor: "transparent" },
          ]}
        />

        <View style={styles.locationContent}>
          <Text style={styles.locationLabel}>{label}</Text>
          <Text
            style={[styles.locationValue, !value && styles.locationPlaceholder]}
            numberOfLines={2}
          >
            {value || placeholder}
          </Text>

          {details !== undefined && value ? (
            <TextInput
              style={styles.locationDetails}
              placeholder="Add details (optional)"
              placeholderTextColor="#9CA3AF"
              value={details}
              onChangeText={onDetailsChange}
            />
          ) : null}
        </View>

        <Ionicons
          name="chevron-forward"
          size={moderateScale(16)}
          color="#9CA3AF"
        />
      </TouchableOpacity>
    </Animated.View>
  );
};

// ==================== PASSENGER SELECTOR ====================
const PassengerSelector = ({ count, onChange, max = 6, trackUserAction }) => (
  <View style={styles.passengerCard}>
    <Text style={styles.passengerTitle}>Passengers</Text>
    <View style={styles.passengerControls}>
      <TouchableOpacity
        style={[
          styles.passengerControl,
          count <= 1 && styles.passengerControlDisabled,
        ]}
        onPress={() => {
          trackUserAction?.();
          if (count > 1) onChange(count - 1);
        }}
        disabled={count <= 1}
      >
        <Ionicons
          name="remove-outline"
          size={moderateScale(20)}
          color={count <= 1 ? "#D1D5DB" : "#183B5C"}
        />
      </TouchableOpacity>

      <Text style={styles.passengerNumber}>{count}</Text>

      <TouchableOpacity
        style={[
          styles.passengerControl,
          count >= max && styles.passengerControlDisabled,
        ]}
        onPress={() => {
          trackUserAction?.();
          if (count < max) onChange(count + 1);
        }}
        disabled={count >= max}
      >
        <Ionicons
          name="add-outline"
          size={moderateScale(20)}
          color={count >= max ? "#D1D5DB" : "#183B5C"}
        />
      </TouchableOpacity>
    </View>
  </View>
);

// ==================== TRIP METRICS ROW ====================
const TripMetricsRow = ({ distance, time, passengers }) => (
  <View style={styles.tripMetricsRow}>
    <View style={styles.tripMetricItem}>
      <View style={[styles.tripMetricIcon, { backgroundColor: "#10B98115" }]}>
        <Ionicons
          name="map-outline"
          size={moderateScale(16)}
          color="#10B981"
        />
      </View>
      <Text style={styles.tripMetricValue}>{distance || "0"} km</Text>
      <Text style={styles.tripMetricLabel}>Distance</Text>
    </View>

    <View style={styles.tripMetricDivider} />

    <View style={styles.tripMetricItem}>
      <View style={[styles.tripMetricIcon, { backgroundColor: "#3B82F615" }]}>
        <Ionicons
          name="time-outline"
          size={moderateScale(16)}
          color="#3B82F6"
        />
      </View>
      <Text style={styles.tripMetricValue}>{time || "0"} min</Text>
      <Text style={styles.tripMetricLabel}>Est. time</Text>
    </View>

    <View style={styles.tripMetricDivider} />

    <View style={styles.tripMetricItem}>
      <View style={[styles.tripMetricIcon, { backgroundColor: "#8B5CF615" }]}>
        <Ionicons
          name="people-outline"
          size={moderateScale(16)}
          color="#8B5CF6"
        />
      </View>
      <Text style={styles.tripMetricValue}>{passengers || "1"}</Text>
      <Text style={styles.tripMetricLabel}>Passengers</Text>
    </View>
  </View>
);

// ==================== FARE BAR ====================
const FareBar = ({ fare, passengers, distance, onBreakdownPress }) => {
  const slideAnim = useRef(new Animated.Value(-60)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 18,
        stiffness: 220,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }, [slideAnim, opacityAnim]);

  const isMinFare = parseFloat(distance || 0) <= 1;
  const perPax =
    passengers > 1
      ? `₱${((fare || 0) / passengers).toFixed(2)} × ${passengers} passengers`
      : "Total fare";

  return (
    <Animated.View
      style={[
        styles.fareBar,
        { transform: [{ translateY: slideAnim }], opacity: opacityAnim },
      ]}
    >
      <View style={styles.fareBarLeft}>
        <Text style={styles.fareBarAmount}>
          ₱{fare ? Number(fare).toFixed(2) : "0.00"}
        </Text>
        <View style={styles.fareBarMeta}>
          <Text style={styles.fareBarLabel}>{perPax}</Text>
          {isMinFare && (
            <View style={styles.fareMinBadge}>
              <Text style={styles.fareMinText}>Min fare</Text>
            </View>
          )}
        </View>
      </View>

      <TouchableOpacity
        style={styles.fareBreakdownBtn}
        onPress={onBreakdownPress}
        activeOpacity={0.75}
      >
        <Ionicons
          name="receipt-outline"
          size={moderateScale(18)}
          color="#183B5C"
        />
        <Text style={styles.fareBreakdownLabel}>Breakdown</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ==================== FARE BREAKDOWN MODAL ====================
const FareBreakdownModal = ({
  visible,
  onClose,
  fare,
  passengers,
  distance,
  time,
  baseFare,
  perKmRate,
  appFee,
}) => {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 280,
      }).start();
    } else {
      slideAnim.setValue(SCREEN_HEIGHT);
    }
  }, [visible, slideAnim]);

  const fmt = (amount) => `₱${(amount || 0).toFixed(2)}`;

  const distanceNum = parseFloat(distance) || 0;
  const baseFareNum = baseFare || 20;
  const perKmRateNum = perKmRate || 5;
  const appFeeNum = appFee || 0;
  const isMinFare = distanceNum <= 1;
  const extraKm = isMinFare ? 0 : Math.ceil(distanceNum - 1);
  const distanceFee = extraKm * perKmRateNum;
  const subtotal = Math.max(baseFareNum + distanceFee, 20);
  const perPaxTotal = subtotal + appFeeNum;
  const grandTotal = perPaxTotal * passengers;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.breakdownOverlay}>
        <TouchableOpacity
          style={styles.breakdownBackdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <Animated.View
          style={[
            styles.breakdownModal,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={styles.breakdownHandle} />

          <View style={styles.breakdownHeader}>
            <View style={styles.breakdownHeaderLeft}>
              <View style={styles.breakdownIconWrap}>
                <Ionicons
                  name="receipt-outline"
                  size={moderateScale(20)}
                  color="#183B5C"
                />
              </View>
              <Text style={styles.breakdownTitle}>Fare breakdown</Text>
            </View>

            <TouchableOpacity onPress={onClose} style={styles.breakdownClose}>
              <Ionicons
                name="close"
                size={moderateScale(20)}
                color="#9CA3AF"
              />
            </TouchableOpacity>
          </View>

          <View style={styles.breakdownTripStrip}>
            <View style={styles.breakdownTripItem}>
              <Ionicons
                name="map-outline"
                size={moderateScale(13)}
                color="#6B7280"
              />
              <Text style={styles.breakdownTripText}>{distance} km</Text>
            </View>

            <View style={styles.breakdownTripDot} />

            <View style={styles.breakdownTripItem}>
              <Ionicons
                name="time-outline"
                size={moderateScale(13)}
                color="#6B7280"
              />
              <Text style={styles.breakdownTripText}>{time} min</Text>
            </View>

            <View style={styles.breakdownTripDot} />

            <View style={styles.breakdownTripItem}>
              <Ionicons
                name="people-outline"
                size={moderateScale(13)}
                color="#6B7280"
              />
              <Text style={styles.breakdownTripText}>{passengers} pax</Text>
            </View>
          </View>

          <View style={styles.breakdownRows}>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownRowLabel}>Base fare (first km)</Text>
              <Text style={styles.breakdownRowValue}>{fmt(baseFareNum)}</Text>
            </View>

            {!isMinFare && (
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownRowLabel}>
                  Distance fee ({extraKm} km × {fmt(perKmRateNum)})
                </Text>
                <Text style={styles.breakdownRowValue}>{fmt(distanceFee)}</Text>
              </View>
            )}

            {isMinFare && (
              <View style={styles.breakdownInfoRow}>
                <Ionicons
                  name="information-circle-outline"
                  size={moderateScale(13)}
                  color="#F59E0B"
                />
                <Text style={styles.breakdownInfoText}>
                  Trips under 1 km use the minimum fare of {fmt(baseFareNum)}
                </Text>
              </View>
            )}

            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownRowLabel}>
                Subtotal (per passenger)
              </Text>
              <Text style={styles.breakdownRowValue}>{fmt(subtotal)}</Text>
            </View>

            {appFeeNum > 0 && (
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownRowLabel}>App service fee</Text>
                <Text
                  style={[styles.breakdownRowValue, { color: "#F59E0B" }]}
                >
                  {fmt(appFeeNum)}
                </Text>
              </View>
            )}

            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownRowLabel}>Per passenger total</Text>
              <Text style={styles.breakdownRowValue}>{fmt(perPaxTotal)}</Text>
            </View>

            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownRowLabel}>Passengers</Text>
              <Text style={styles.breakdownRowValue}>× {passengers}</Text>
            </View>
          </View>

          <View style={styles.breakdownTotal}>
            <Text style={styles.breakdownTotalLabel}>Total fare</Text>
            <Text style={styles.breakdownTotalAmount}>{fmt(grandTotal)}</Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

// ==================== FLOATING ACTION BUTTONS ====================
const FloatingActionButtons = ({
  onScan,
  onFind,
  disabled,
  trackUserAction,
  visible,
  driversWithinRadius = 0,
}) => {
  const translateY = useRef(new Animated.Value(120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  const [mounted, setMounted] = useState(false);
  const [canPress, setCanPress] = useState(false);

  const hideTimerRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (animRef.current) animRef.current.stop();
    };
  }, []);

  useEffect(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (animRef.current) animRef.current.stop();

    if (visible) {
      setMounted(true);
      setCanPress(true);
      translateY.setValue(120);
      opacity.setValue(0);

      animRef.current = Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 18,
          stiffness: 220,
          mass: 0.8,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]);
      animRef.current.start();
    } else {
      setCanPress(false);

      animRef.current = Animated.parallel([
        Animated.timing(translateY, {
          toValue: 120,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
      ]);
      animRef.current.start();

      hideTimerRef.current = setTimeout(() => setMounted(false), 190);
    }
  }, [visible, translateY, opacity]);

  if (!mounted) return null;

  const bottom = tabBarHeight + insets.bottom + 10;
  const driverSubtitle =
  driversWithinRadius > 0
    ? `${driversWithinRadius} driver${driversWithinRadius > 1 ? "s" : ""} nearby`
    : "No nearby drivers";

  return (
    <Animated.View
      pointerEvents={canPress ? "box-none" : "none"}
      style={[
        styles.floatingActionContainer,
        {
          bottom,
          transform: [{ translateY }],
          opacity,
          paddingHorizontal: scale(16),
        },
      ]}
    >
      <View style={styles.floatingActionButtons}>
        <TouchableOpacity
          style={[
            styles.floatingActionButton,
            (disabled || !canPress) && styles.floatingActionButtonDisabled,
          ]}
          onPress={() => {
            if (!canPress || disabled) return;
            trackUserAction?.();
            onScan?.();
          }}
          disabled={disabled || !canPress}
          activeOpacity={0.85}
        >
          <View style={styles.floatingActionIconWrapper}>
            <Ionicons
              name="qr-code-outline"
              size={moderateScale(22)}
              color="#10B981"
            />
          </View>
          <View style={styles.floatingActionTextContainer}>
            <Text style={styles.floatingActionTitle}>Scan QR</Text>
            <Text style={styles.floatingActionSubtitle}>
              Scan driver's code
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.floatingActionButton,
            styles.floatingActionButtonPrimary,
            (disabled || !canPress) && styles.floatingActionButtonDisabled,
          ]}
          onPress={() => {
            if (!canPress || disabled) return;
            trackUserAction?.();
            onFind?.();
          }}
          disabled={disabled || !canPress}
          activeOpacity={0.85}
        >
          <View
            style={[
              styles.floatingActionIconWrapper,
              styles.floatingActionIconWrapperPrimary,
            ]}
          >
            <Ionicons name="location" size={moderateScale(22)} color="#FFF" />
          </View>
          <View style={styles.floatingActionTextContainer}>
            <Text
              style={[styles.floatingActionTitle, styles.floatingActionTitleLight]}
            >
              Find Driver
            </Text>
            <Text
              style={[
                styles.floatingActionSubtitle,
                styles.floatingActionSubtitleLight,
              ]}
            >
              {driverSubtitle}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

// ==================== PROXIMITY FILTER MODAL ====================
const ProximityModal = ({
  visible,
  onClose,
  radius,
  onRadiusChange,
  onApply,
  driversCount,
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
  }, [visible, slideAnim]);

  const radiusOptions = [0.1, 0.2, 0.3, 0.4];

  return (
    <Modal
      transparent
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
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Search radius</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalClose}>
              <Ionicons
                name="close"
                size={moderateScale(22)}
                color="#9CA3AF"
              />
            </TouchableOpacity>
          </View>

          <View style={styles.radiusDisplay}>
            <Text style={styles.radiusValue}>{radius.toFixed(1)}</Text>
            <Text style={styles.radiusUnit}>km</Text>
          </View>

          <View style={styles.radiusOptionsGrid}>
            {radiusOptions.map((value) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.radiusOptionChip,
                  radius === value && styles.radiusOptionChipActive,
                ]}
                onPress={() => onRadiusChange(value)}
              >
                <Text
                  style={[
                    styles.radiusOptionText,
                    radius === value && styles.radiusOptionTextActive,
                  ]}
                >
                  {value.toFixed(1)} km
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.driverStats}>
            <Ionicons
              name="car-outline"
              size={moderateScale(18)}
              color="#6B7280"
            />
            <Text style={styles.driverStatsText}>
              {driversCount} driver{driversCount !== 1 ? "s" : ""} available
              within {radius.toFixed(1)} km
            </Text>
          </View>

          <TouchableOpacity style={styles.applyButton} onPress={onApply}>
            <Text style={styles.applyButtonText}>Apply filter</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};

// ==================== MAIN SCREEN ====================
export default function CommuterHomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const mapRef = useRef(null);
  const scanTimeoutRef = useRef(null);
  const shakeAnimPickup = useRef(new Animated.Value(0)).current;
  const shakeAnimDropoff = useRef(new Animated.Value(0)).current;
  const sheetTopAnim = useRef(new Animated.Value(SHEET_TOP_MID)).current;
  const lastSheetTop = useRef(SHEET_TOP_MID);
  const tabBarHeight = useBottomTabBarHeight();

  const driverRealtimeChannelRef = useRef(null);
const latestPickupRef = useRef(null);
const mountedRef = useRef(true);

  const [userLocation, setUserLocation] = useState(null);
  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [pickupText, setPickupText] = useState("");
  const [dropoffText, setDropoffText] = useState("");
  const [pickupDetails, setPickupDetails] = useState("");
  const [dropoffDetails, setDropoffDetails] = useState("");
  const [passengerCount, setPassengerCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [findingDriver, setFindingDriver] = useState(false);
  const [currentBookingId, setCurrentBookingId] = useState(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const [allDrivers, setAllDrivers] = useState([]);
  const [estimatedFare, setEstimatedFare] = useState(null);
  const [estimatedDistance, setEstimatedDistance] = useState(null);
  const [estimatedTime, setEstimatedTime] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [fareSettings, setFareSettings] = useState({
    baseFare: 20,
    perKmRate: 5,
    minimumFare: 20,
    appFee: 0,
  });
  const [showProximityFilter, setShowProximityFilter] = useState(false);
  const [proximityRadius, setProximityRadius] = useState(0.1);
  const [tempProximityRadius, setTempProximityRadius] = useState(0.1);
  const [proximityConfig, setProximityConfig] = useState({
    defaultRadius: 0.1,
    maxRadius: 0.4,
    minRadius: 0.1,
    showOnMap: true,
  });
  const [filteredDrivers, setFilteredDrivers] = useState([]);
  const [driversWithinRadius, setDriversWithinRadius] = useState(0);
  const [commuterId, setCommuterId] = useState(null);
  const [recentLocations, setRecentLocations] = useState([]);
  const [forceUpdate, setForceUpdate] = useState(false);
  const [alert, setAlert] = useState({
    visible: false,
    type: "info",
    title: "",
    message: "",
    confirmText: "OK",
    cancelText: "Cancel",
    showCancel: false,
    onConfirm: null,
    onCancel: null,
  });
  const [lastUserAction, setLastUserAction] = useState(Date.now());
  const [permission, requestPermission] = useCameraPermissions();
  const [showScanner, setShowScanner] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [scanningForDriver, setScanningForDriver] = useState(false);
  const [showFareBreakdown, setShowFareBreakdown] = useState(false);

  useEffect(() => {
  latestPickupRef.current = pickup;
}, [pickup]);

useEffect(() => {
  mountedRef.current = true;

  return () => {
    mountedRef.current = false;

    if (driverRealtimeChannelRef.current) {
      supabase.removeChannel(driverRealtimeChannelRef.current);
      driverRealtimeChannelRef.current = null;
    }
  };
}, []);
  const googleApiKey = Constants.expoConfig?.extra?.GOOGLE_API_KEY;

  useEffect(() => {
    if (pickup && dropoff && Platform.OS === "android") {
      const timer = setTimeout(() => setForceUpdate((prev) => !prev), 100);
      return () => clearTimeout(timer);
    }
  }, [pickup, dropoff]);

  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidHide", () => {
      if (pickup && dropoff && Platform.OS === "android") {
        setForceUpdate((prev) => !prev);
      }
    });
    return () => sub.remove();
  }, [pickup, dropoff]);

  // ==================== HELPERS ====================
  const showAlert = ({
    type = "info",
    title,
    message,
    confirmText = "OK",
    cancelText = "Cancel",
    showCancel = false,
    onConfirm,
    onCancel,
  }) => {
    setAlert({
      visible: true,
      type,
      title,
      message,
      confirmText,
      cancelText,
      showCancel,
      onConfirm: () => {
        setAlert((p) => ({ ...p, visible: false }));
        onConfirm?.();
      },
      onCancel: () => {
        setAlert((p) => ({ ...p, visible: false }));
        onCancel?.();
      },
    });
  };

  const hideAlert = () => setAlert((p) => ({ ...p, visible: false }));
  const trackUserAction = useCallback(() => setLastUserAction(Date.now()), []);

  const isActiveBookingError = (err) => {
    if (!err) return false;

    return (
      (err.code === "23505" &&
        err.message?.includes("one_active_booking_per_commuter")) ||
      (err.code === "P0001" &&
        (err.message?.includes("ACTIVE_BOOKING_EXISTS") ||
          err.details?.includes("active booking")))
    );
  };

  const showActiveBookingAlert = (err) => {
    const existingBookingId = err?.hint;

    showAlert({
      type: "warning",
      title: "Active Booking Found",
      message: existingBookingId
        ? `You already have an active booking in progress.\n\nReference: ${existingBookingId}\n\nPlease complete or cancel your current booking before creating a new one.`
        : "You already have an active booking in progress.\n\nPlease complete or cancel your current booking before creating a new one.",
      confirmText: "Got it",
    });
  };

  const shakeLocationCard = (type) => {
    const anim = type === "pickup" ? shakeAnimPickup : shakeAnimDropoff;

    Animated.sequence([
      Animated.timing(anim, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(anim, {
        toValue: -10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(anim, {
        toValue: 5,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(anim, {
        toValue: -5,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(anim, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
  };

  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    };
  }, []);

  // ==================== DATA LOADING ====================
  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const load = async () => {
        if (!isActive) return;
        setLoading(true);

        await Promise.all([
          getCommuterId(),
          loadRecentLocations(),
          fetchFareSettings(),
          fetchProximityConfig(),
          loadProximityRadius(),
        ]);

        setLoading(false);
        setInitialLoad(false);
      };

      load();

      return () => {
        isActive = false;
      };
    }, [])
  );

  useEffect(() => {
    getUserLocation();
  }, []);

  useEffect(() => {
    if (pickup && allDrivers.length > 0) {
      filterDriversByProximity(pickup, allDrivers, proximityRadius);
    } else {
      setFilteredDrivers([]);
      setDriversWithinRadius(0);
    }
  }, [pickup, allDrivers, proximityRadius]);

  // ==================== DRAGGABLE SHEET ====================
  const animateSheetTo = useCallback(
    (toValue) => {
      lastSheetTop.current = toValue;
      Animated.spring(sheetTopAnim, {
        toValue,
        useNativeDriver: false,
        tension: 80,
        friction: 12,
      }).start();
    },
    [sheetTopAnim]
  );

  useEffect(() => {
    animateSheetTo(SHEET_TOP_MID);
  }, [animateSheetTo]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8,
      onPanResponderGrant: () => {
        sheetTopAnim.stopAnimation((value) => {
          lastSheetTop.current = value;
        });
      },
      onPanResponderMove: (_, g) => {
        let next = lastSheetTop.current + g.dy;
        if (next < SHEET_TOP_EXPANDED) next = SHEET_TOP_EXPANDED;
        if (next > SHEET_TOP_COLLAPSED) next = SHEET_TOP_COLLAPSED;
        sheetTopAnim.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        const finalTop = lastSheetTop.current + g.dy;
        const velocity = g.vy;
        const snaps = [SHEET_TOP_EXPANDED, SHEET_TOP_MID, SHEET_TOP_COLLAPSED];
        let dest = SHEET_TOP_MID;

        if (velocity < -0.5) {
          dest = finalTop > SHEET_TOP_MID ? SHEET_TOP_MID : SHEET_TOP_EXPANDED;
        } else if (velocity > 0.5) {
          dest =
            finalTop < SHEET_TOP_MID ? SHEET_TOP_MID : SHEET_TOP_COLLAPSED;
        } else {
          dest = snaps.reduce((p, c) =>
            Math.abs(c - finalTop) < Math.abs(p - finalTop) ? c : p
          );
        }

        animateSheetTo(dest);
      },
    })
  ).current;

  // ==================== DATA FUNCTIONS ====================
  const fetchProximityConfig = async () => {
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", [
          "proximity_default_radius",
          "proximity_max_radius",
          "proximity_min_radius",
          "proximity_show_on_map",
        ])
        .eq("category", "booking");

      if (error) throw error;

      const config = {
        defaultRadius: 0.1,
        maxRadius: 0.4,
        minRadius: 0.1,
        showOnMap: true,
      };

      data?.forEach((item) => {
        if (item.key === "proximity_default_radius") {
          config.defaultRadius = Math.min(
            0.4,
            Math.max(0.1, parseFloat(item.value))
          );
        }
        if (item.key === "proximity_max_radius") {
          config.maxRadius = Math.min(0.4, parseFloat(item.value));
        }
        if (item.key === "proximity_min_radius") {
          config.minRadius = Math.max(0.1, parseFloat(item.value));
        }
        if (item.key === "proximity_show_on_map") {
          config.showOnMap = item.value === "true";
        }
      });

      setProximityConfig(config);
      setProximityRadius(config.defaultRadius);
      setTempProximityRadius(config.defaultRadius);
    } catch {
      setProximityRadius(0.1);
      setTempProximityRadius(0.1);
    }
  };

  const loadProximityRadius = async () => {
    try {
      setProximityRadius(0.1);
      setTempProximityRadius(0.1);
      await AsyncStorage.removeItem("proximity_radius_home");
    } catch {
      setProximityRadius(0.1);
      setTempProximityRadius(0.1);
    }
  };

  const saveProximityRadius = async (radius) => {
    try {
      const valid = Math.min(0.4, Math.max(0.1, radius));
      setProximityRadius(valid);
      await AsyncStorage.setItem("proximity_radius_home", valid.toString());
      setShowProximityFilter(false);

      if (pickup && allDrivers.length > 0) {
        filterDriversByProximity(pickup, allDrivers, valid);
      }
    } catch (err) {
      console.log("Error saving proximity radius:", err);
    }
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

const filterDriversByProximity = (
  pickupCoords = latestPickupRef.current || pickup,
  drivers = allDrivers,
  radius = proximityRadius
) => {
  if (!pickupCoords || !drivers.length) {
    setFilteredDrivers([]);
    setDriversWithinRadius(0);
    return;
  }

  const filtered = drivers
    .map((d) => {
      const distance = calculateDistance(
        pickupCoords.latitude,
        pickupCoords.longitude,
        d.latitude,
        d.longitude
      );

      return {
        ...d,
        distance_km: distance,
      };
    })
    .filter((d) => d.distance_km <= radius)
    .sort((a, b) => a.distance_km - b.distance_km);

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

      if (data?.length) {
        setFareSettings({
          baseFare: Number(
            data.find((f) => f.fare_type === "base_fare")?.amount ?? 20
          ),
          perKmRate: Number(
            data.find((f) => f.fare_type === "per_km")?.amount ?? 5
          ),
          minimumFare: Number(
            data.find((f) => f.fare_type === "minimum_fare")?.amount ?? 20
          ),
          appFee: Number(
            data.find((f) => f.fare_type === "app_fee")?.amount ?? 0
          ),
        });
      }
    } catch (err) {
      console.log("Error fetching fare settings:", err);
    }
  };

  const loadRecentLocations = async () => {
    try {
      const recent = await AsyncStorage.getItem("recent_locations");
      if (recent) setRecentLocations(JSON.parse(recent));
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

      recents = [recent, ...recents.filter((r) => r.address !== address)].slice(
        0,
        10
      );

      await AsyncStorage.setItem("recent_locations", JSON.stringify(recents));
      setRecentLocations(recents);
    } catch (err) {
      console.log("Error saving recent location:", err);
    }
  };

  const getCommuterId = async () => {
    const id = await AsyncStorage.getItem("user_id");
    setCommuterId(id);
  };

const getNearbyDrivers = async (coordsArg) => {
  try {
    const baseCoords = coordsArg || latestPickupRef.current || userLocation;
    if (!baseCoords) return;

    const { data: drivers, error } = await supabase
      .from("driver_locations")
      .select(`
        driver_id,
        latitude,
        longitude,
        last_updated,
        is_online,
        drivers!inner(
          id,
          first_name,
          last_name,
          status,
          is_active,
          online_status,
          driver_vehicles(vehicle_type,vehicle_color,plate_number)
        )
      `)
      .eq("is_online", true)
      .eq("drivers.status", "approved")
      .eq("drivers.is_active", true)
      .eq("drivers.online_status", "online");

    if (error) throw error;

    const mapped = (drivers || []).map((d) => {
      const distance = calculateDistance(
        baseCoords.latitude,
        baseCoords.longitude,
        d.latitude,
        d.longitude
      );

      const vehicle = d.drivers?.driver_vehicles?.[0] || {};

      return {
        driver_id: d.driver_id,
        first_name: d.drivers?.first_name || "",
        last_name: d.drivers?.last_name || "",
        distance_km: distance,
        latitude: d.latitude,
        longitude: d.longitude,
        vehicle_type: vehicle.vehicle_type || "Motorcycle",
        vehicle_color: vehicle.vehicle_color || "N/A",
        vehicle_plate: vehicle.plate_number || "N/A",
        last_updated: d.last_updated,
        is_online: d.is_online,
      };
    });

    if (!mountedRef.current) return;

    setAllDrivers(mapped);

    const activePickup = latestPickupRef.current || baseCoords;
    if (activePickup) {
      filterDriversByProximity(activePickup, mapped, proximityRadius);
    } else {
      setFilteredDrivers([]);
      setDriversWithinRadius(0);
    }
  } catch (err) {
    console.log("Error getting nearby drivers:", err);

    if (!mountedRef.current) return;

    setAllDrivers([]);
    setFilteredDrivers([]);
    setDriversWithinRadius(0);
  }
};

  const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        showAlert({
          type: "warning",
          title: "Location permission",
          message: "Location permission is needed to book a ride",
          confirmText: "OK",
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
          setPickupText(
            `${street || name || "Current Location"}, ${city || ""}, ${
              region || ""
            }`
          );
        }
      }

      getNearbyDrivers(coords);
    } catch (err) {
      console.log("Error getting location:", err);
      showAlert({
        type: "error",
        title: "Location error",
        message: "Failed to get your location. Please try again.",
        confirmText: "OK",
      });
    }
  };

  useEffect(() => {
  const baseCoords = latestPickupRef.current || userLocation;
  if (!baseCoords) return;

  if (driverRealtimeChannelRef.current) {
    supabase.removeChannel(driverRealtimeChannelRef.current);
    driverRealtimeChannelRef.current = null;
  }

  const refreshDriversRealtime = async () => {
    const coords = latestPickupRef.current || userLocation;
    if (!coords) return;
    await getNearbyDrivers(coords);
  };

  const channel = supabase
    .channel("home-drivers-realtime")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "driver_locations",
      },
      async (payload) => {
        console.log("[Realtime] driver_locations changed:", payload.eventType);
        await refreshDriversRealtime();
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "drivers",
      },
      async (payload) => {
        console.log("[Realtime] drivers changed:", payload.eventType);
        await refreshDriversRealtime();
      }
    )
    .subscribe((status) => {
      console.log("[Realtime] channel status:", status);
    });

  driverRealtimeChannelRef.current = channel;

  return () => {
    if (driverRealtimeChannelRef.current) {
      supabase.removeChannel(driverRealtimeChannelRef.current);
      driverRealtimeChannelRef.current = null;
    }
  };
}, [userLocation, pickup, proximityRadius]);

  const handleUseCurrentLocation = () => {
    trackUserAction();
    if (!userLocation) return;

    setPickup(userLocation);

    Location.reverseGeocodeAsync(userLocation).then((address) => {
      if (address[0]) {
        const { street, name, city, region } = address[0];
        setPickupText(
          `${street || name || "Current Location"}, ${city || ""}, ${
            region || ""
          }`
        );
      }
    });
  };

  const handleSelectOnMap = (type) => {
    trackUserAction();

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

        const np = type === "pickup" ? location : pickup;
        const nd = type === "dropoff" ? location : dropoff;

        if (np && nd) calculateRoute(np, nd);
      },
    });
  };

  const handleSelectRecent = (recent) => {
    trackUserAction();

    if (recent.type === "pickup") {
      setPickup(recent.location);
      setPickupText(recent.address);
      setPickupDetails(recent.details || "");
    } else {
      setDropoff(recent.location);
      setDropoffText(recent.address);
      setDropoffDetails(recent.details || "");
    }

    const np = recent.type === "pickup" ? recent.location : pickup;
    const nd = recent.type === "dropoff" ? recent.location : dropoff;

    if (np && nd) calculateRoute(np, nd);
  };

  const decodePolyline = (encoded) => {
    const points = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
      let b;
      let shift = 0;
      let result = 0;

      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);

      lat += result & 1 ? ~(result >> 1) : result >> 1;

      shift = 0;
      result = 0;

      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);

      lng += result & 1 ? ~(result >> 1) : result >> 1;

      points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
    }

    return points;
  };

  const calculateFareWithPassengers = (distanceKm) => {
    if (!distanceKm) return;

    const exact = parseFloat(distanceKm);
    const baseFare = Number(fareSettings.baseFare || 20);
    const perKmRate = Number(fareSettings.perKmRate || 5);
    const minimumFare = Number(fareSettings.minimumFare || 20);
    const appFee = Number(fareSettings.appFee || 0);

    let farePerPax =
      exact <= 1 ? baseFare : baseFare + Math.ceil(exact - 1) * perKmRate;

    farePerPax = Math.max(farePerPax, minimumFare);
    setEstimatedFare((farePerPax + appFee) * passengerCount);
  };

  const calculateRoute = async (startCoords, endCoords) => {
    if (!startCoords || !endCoords || !googleApiKey) return;

    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${startCoords.latitude},${startCoords.longitude}&destination=${endCoords.latitude},${endCoords.longitude}&key=${googleApiKey}&mode=driving`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.status === "OK" && data.routes?.[0]) {
        const route = data.routes[0];
        const points = decodePolyline(route.overview_polyline.points);
        const leg = route.legs[0];
        const distanceKm = leg.distance.value / 1000;
        const timeMins = Math.round(leg.duration.value / 60);

        setRouteCoordinates(points);
        setEstimatedDistance(distanceKm.toFixed(1));
        setEstimatedTime(timeMins);
        calculateFareWithPassengers(distanceKm);

        mapRef.current?.fitToCoordinates([startCoords, endCoords], {
          edgePadding: { top: 120, right: 60, bottom: 280, left: 60 },
          animated: true,
        });
      }
    } catch (err) {
      console.log("Error calculating route:", err);
    }
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

  const handlePassengerChange = (newCount) => {
    trackUserAction();
    if (newCount >= 1 && newCount <= 6) {
      setPassengerCount(newCount);
    }
  };

  // ==================== BOOKING ====================
  const createBooking = async () => {
    if (!commuterId) {
      showAlert({
        type: "error",
        title: "Login required",
        message: "Please login first to book a ride",
        confirmText: "OK",
      });
      return;
    }

    if (driversWithinRadius === 0) {
      showAlert({
        type: "warning",
        title: "No drivers available",
        message: `No drivers found within ${proximityRadius.toFixed(
          1
        )} km. Would you like to increase the search radius?`,
        confirmText: "Increase radius",
        cancelText: "Cancel",
        showCancel: true,
        onConfirm: openProximityFilter,
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

      const { data: booking, error } = await supabase
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
            app_fee: fareSettings.appFee,
            distance_km: estimatedDistance,
            duration_minutes: estimatedTime,
            status: "pending",
            created_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (error) throw error;

      setCurrentBookingId(booking.id);

      if (pickup && pickupText) {
        saveRecentLocation(pickup, pickupText, pickupDetails, "pickup");
      }

      if (dropoff && dropoffText) {
        saveRecentLocation(dropoff, dropoffText, dropoffDetails, "dropoff");
      }
    } catch (err) {
      console.log("Error creating booking:", err);

      if (isActiveBookingError(err)) {
        showActiveBookingAlert(err);
        setFindingDriver(false);
        return;
      }

      showAlert({
        type: "error",
        title: "Booking failed",
        message: err?.message || "Failed to create booking. Please try again.",
        confirmText: "OK",
      });
      setFindingDriver(false);
    }
  };

  const handleDriverFound = (driverId) => {
    setFindingDriver(false);
    navigation.navigate("TrackRide", {
      bookingId: currentBookingId,
      driverId,
    });
  };

  const handleCancelFinding = async () => {
    setFindingDriver(false);
    setCurrentBookingId(null);
  };

  const handleNoDriversFound = async () => {
    setFindingDriver(false);
    setCurrentBookingId(null);
  };

  // ==================== QR SCANNER ====================
  const openScanner = async () => {
    try {
      if (!permission?.granted) {
        const { granted } = await requestPermission();
        if (!granted) {
          showAlert({
            type: "warning",
            title: "Camera permission",
            message: "We need camera access to scan the driver's QR code.",
            confirmText: "OK",
          });
          return;
        }
      }

      if (!pickup || !dropoff) {
        showAlert({
          type: "warning",
          title: "Missing locations",
          message:
            "Please select both pickup and dropoff locations before scanning.",
          confirmText: "OK",
        });
        return;
      }

      setScanned(false);
      setScanningForDriver(true);
      setShowScanner(true);
    } catch (err) {
      console.log("Error opening scanner:", err);
    }
  };

  const showDriverBookingConfirmation = (driverData) => {
    const vehicle = driverData.driver_vehicles?.[0] || {};

    showAlert({
      type: "confirm",
      title: "Confirm ride",
      message: `${driverData.first_name} ${driverData.last_name}\n${
        vehicle.vehicle_color || ""
      } ${vehicle.vehicle_type || ""}\n${
        vehicle.plate_number || "N/A"
      }\n\n${pickupText}\n${dropoffText}\n${passengerCount} pax · ₱${estimatedFare}`,
      confirmText: "Confirm",
      cancelText: "Cancel",
      showCancel: true,
      onConfirm: () => createDirectBooking(driverData.id),
      onCancel: () => setScanningForDriver(false),
    });
  };

  const createDirectBooking = async (driverId) => {
    if (!commuterId) {
      showAlert({
        type: "error",
        title: "Login required",
        message: "Please login first",
        confirmText: "OK",
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

      const { data: booking, error } = await supabase
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
            app_fee: fareSettings.appFee,
            distance_km: estimatedDistance,
            duration_minutes: estimatedTime,
            status: "accepted",
            accepted_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (error) throw error;

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
        driverId,
      });
    } catch (err) {
      console.log("Direct booking error:", err);

      if (isActiveBookingError(err)) {
        showActiveBookingAlert(err);
        setScanningForDriver(false);
        setFindingDriver(false);
        return;
      }

      showAlert({
        type: "error",
        title: "Booking failed",
        message: err?.message || "Failed to create booking. Please try again.",
        confirmText: "OK",
      });

      setFindingDriver(false);
      setScanningForDriver(false);
    }
  };

  const handleBarCodeScanned = async ({ data }) => {
    if (scanned) return;

    setScanned(true);

    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);

    try {
      const qrData = JSON.parse(data);

      if (qrData.type !== "driver_qr" && !qrData.driver_id) {
        showAlert({
          type: "error",
          title: "Invalid QR code",
          message: "This is not a valid driver QR code.",
          confirmText: "OK",
          onConfirm: () => {
            setShowScanner(false);
            setScanningForDriver(false);
          },
        });
        return;
      }

      const driverId = qrData.driver_id || qrData.id;

      const { data: driverData, error } = await supabase
        .from("drivers")
        .select(
          "id,first_name,last_name,phone,profile_picture,driver_vehicles(vehicle_type,vehicle_color,plate_number)"
        )
        .eq("id", driverId)
        .single();

      if (error || !driverData) {
        showAlert({
          type: "error",
          title: "Driver not found",
          message: "Could not find driver information.",
          confirmText: "OK",
          onConfirm: () => {
            setShowScanner(false);
            setScanningForDriver(false);
          },
        });
        return;
      }

      setShowScanner(false);

      if (!pickup) {
        showAlert({
          type: "warning",
          title: "Missing pickup",
          message: "Please set your pickup location first.",
          confirmText: "OK",
          onConfirm: () => setScanningForDriver(false),
        });
        return;
      }

      if (!dropoff) {
        showAlert({
          type: "warning",
          title: "Missing dropoff",
          message: "Please set your dropoff location first.",
          confirmText: "OK",
          onConfirm: () => setScanningForDriver(false),
        });
        return;
      }

      showDriverBookingConfirmation(driverData);
    } catch (err) {
      console.log("QR scan error:", err);
      showAlert({
        type: "error",
        title: "Invalid QR code",
        message: "Could not read the QR code. Please try again.",
        confirmText: "OK",
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

  const handleCancelScanning = () => {
    setShowScanner(false);
    setScanned(false);
    setScanningForDriver(false);

    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
  };

  const handleBookRide = async () => {
    if (!pickup) {
      shakeLocationCard("pickup");
      showAlert({
        type: "warning",
        title: "Missing pickup",
        message: "Tap the pickup box to select where you want to be picked up.",
        confirmText: "OK",
      });
      return;
    }

    if (!dropoff) {
      shakeLocationCard("dropoff");
      showAlert({
        type: "warning",
        title: "Missing dropoff",
        message: "Tap the dropoff box to select your destination.",
        confirmText: "OK",
      });
      return;
    }

    if (driversWithinRadius === 0) {
      showAlert({
        type: "warning",
        title: "No drivers available",
        message: `No drivers found within ${proximityRadius.toFixed(
          1
        )} km. Would you like to increase the search radius?`,
        confirmText: "Increase radius",
        cancelText: "Cancel",
        showCancel: true,
        onConfirm: openProximityFilter,
      });
      return;
    }

    showAlert({
      type: "confirm",
      title: "Confirm booking",
      message: `${pickupText}\n→\n${dropoffText}\n\n${passengerCount} passenger${
        passengerCount > 1 ? "s" : ""
      } · ₱${estimatedFare}`,
      confirmText: "Book now",
      cancelText: "Cancel",
      showCancel: true,
      onConfirm: createBooking,
    });
  };

  // ==================== DERIVED STATE ====================
  const isPickupValid = !!pickup && typeof pickup.latitude === "number";
  const isDropoffValid = !!dropoff && typeof dropoff.latitude === "number";
  const shouldShowButtonsFixed = isPickupValid && isDropoffValid;
  const showTripInfo = pickup && dropoff && estimatedDistance && estimatedFare;

  // ==================== EARLY RETURNS ====================
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
        onExpandRadius={() => {
          setFindingDriver(false);
          setCurrentBookingId(null);
          setShowProximityFilter(true);
        }}
        pickupText={pickupText}
        dropoffText={dropoffText}
      />
    );
  }

  if (showScanner) {
    return (
      <View style={styles.container}>
        <View
          style={[styles.scannerHeader, { paddingTop: insets.top + scale(12) }]}
        >
          <TouchableOpacity
            onPress={handleCancelScanning}
            style={styles.scannerBackButton}
          >
            <Ionicons
              name="arrow-back"
              size={moderateScale(22)}
              color="#FFF"
            />
          </TouchableOpacity>
          <Text style={styles.scannerTitle}>Scan driver QR</Text>
          <View style={{ width: moderateScale(40) }} />
        </View>

        <View style={styles.scannerContainer}>
          <CameraView
            style={styles.scanner}
            facing="back"
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          >
            <View style={styles.scannerOverlay}>
              <View style={styles.scanArea}>
                <View style={styles.scanCorner} />
                <View style={[styles.scanCorner, styles.scanCornerTopRight]} />
                <View
                  style={[styles.scanCorner, styles.scanCornerBottomLeft]}
                />
                <View
                  style={[styles.scanCorner, styles.scanCornerBottomRight]}
                />
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

  // ==================== SHEET CONTENT ====================
  const renderSheetContent = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: insets.bottom + scale(120) },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={["#183B5C"]}
          tintColor="#183B5C"
        />
      }
    >
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
          activeOpacity={0.7}
        >
          <View style={styles.filterButtonContent}>
            <Ionicons
              name="options-outline"
              size={moderateScale(16)}
              color="#183B5C"
            />
            <Text style={styles.filterText}>
              {proximityRadius.toFixed(1)} km
            </Text>
            <Ionicons
              name="chevron-down"
              size={moderateScale(13)}
              color="#9CA3AF"
            />
          </View>

          <View style={styles.proximityIndicator}>
            <Ionicons
              name="radio-outline"
              size={moderateScale(11)}
              color="#10B981"
            />
            <Text style={styles.proximityIndicatorText}>
              {proximityRadius === 0.1
                ? "Nearest"
                : proximityRadius === 0.2
                ? "Near"
                : proximityRadius === 0.3
                ? "Standard"
                : "Wide"}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.currentLocationBtn}
        onPress={handleUseCurrentLocation}
        activeOpacity={0.8}
      >
        <Ionicons
          name="locate-outline"
          size={moderateScale(16)}
          color="#183B5C"
        />
        <Text style={styles.currentLocationText}>Use current location</Text>
      </TouchableOpacity>

      <Animated.View style={{ transform: [{ translateX: shakeAnimPickup }] }}>
        <LocationCard
          iconColor="#10B981"
          label="Pickup"
          placeholder="Where should we pick you up?"
          value={pickupText}
          details={pickupDetails}
          onDetailsChange={setPickupDetails}
          onPress={() => handleSelectOnMap("pickup")}
          trackUserAction={trackUserAction}
        />
      </Animated.View>

      <View style={styles.locationConnector}>
        <View style={styles.locationConnectorLine} />
      </View>

      <Animated.View style={{ transform: [{ translateX: shakeAnimDropoff }] }}>
        <LocationCard
          iconColor="#EF4444"
          label="Dropoff"
          placeholder="Where are you going?"
          value={dropoffText}
          details={dropoffDetails}
          onDetailsChange={setDropoffDetails}
          onPress={() => handleSelectOnMap("dropoff")}
          trackUserAction={trackUserAction}
        />
      </Animated.View>

      {recentLocations.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.sectionTitle}>Recent locations</Text>
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
                  size={moderateScale(13)}
                  color={recent.type === "pickup" ? "#10B981" : "#EF4444"}
                />
                <Text style={styles.recentChipText} numberOfLines={1}>
                  {recent.address.split(",")[0]}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <PassengerSelector
        count={passengerCount}
        onChange={handlePassengerChange}
        trackUserAction={trackUserAction}
      />

      {showTripInfo && (
        <>
          <TripMetricsRow
            distance={estimatedDistance}
            time={estimatedTime}
            passengers={passengerCount}
          />

          <FareBar
            fare={estimatedFare}
            passengers={passengerCount}
            distance={estimatedDistance}
            onBreakdownPress={() => setShowFareBreakdown(true)}
          />
        </>
      )}

      <View style={styles.helpContainer}>
        <Text style={styles.helpText}>
          Drag this panel down to see more of the map
        </Text>
      </View>
    </ScrollView>
  );

  // ==================== RENDER ====================
  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="transparent"
        translucent
      />

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

      <ProximityModal
        visible={showProximityFilter}
        onClose={() => setShowProximityFilter(false)}
        radius={tempProximityRadius}
        onRadiusChange={setTempProximityRadius}
        onApply={() => saveProximityRadius(tempProximityRadius)}
        driversCount={driversWithinRadius}
      />

      <FareBreakdownModal
        visible={showFareBreakdown}
        onClose={() => setShowFareBreakdown(false)}
        fare={estimatedFare}
        passengers={passengerCount}
        distance={estimatedDistance}
        time={estimatedTime}
        baseFare={fareSettings.baseFare}
        perKmRate={fareSettings.perKmRate}
        appFee={fareSettings.appFee}
      />

      <View style={styles.fullMapContainer}>
        <MapView
          ref={mapRef}
          style={styles.fullMap}
          provider={PROVIDER_GOOGLE}
          initialRegion={{
            latitude: userLocation?.latitude || 14.5995,
            longitude: userLocation?.longitude || 120.9842,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          showsUserLocation
          showsMyLocationButton={false}
        >
          {pickup && proximityConfig.showOnMap && (
            <Circle
              center={pickup}
              radius={proximityRadius * 1000}
              strokeColor="rgba(24,59,92,0.35)"
              fillColor="rgba(24,59,92,0.08)"
            />
          )}

          {pickup && (
            <Marker coordinate={pickup} title="Pickup">
              <View style={styles.pickupMarker}>
                <Ionicons name="location" size={moderateScale(18)} color="#FFF" />
              </View>
            </Marker>
          )}

          {dropoff && (
            <Marker coordinate={dropoff} title="Dropoff">
              <View style={styles.dropoffMarker}>
                <Ionicons name="flag" size={moderateScale(18)} color="#FFF" />
              </View>
            </Marker>
          )}

          {filteredDrivers.map((driver) => (
            <Marker
              key={driver.driver_id}
              coordinate={{
                latitude: driver.latitude,
                longitude: driver.longitude,
              }}
              title={`${driver.first_name} ${driver.last_name}`}
              description={`${driver.vehicle_type} • ${driver.distance_km.toFixed(
                2
              )} km`}
            >
              <View style={styles.driverMarker}>
                <Ionicons name="car-sport" size={moderateScale(16)} color="#FFF" />
              </View>
            </Marker>
          ))}

          {routeCoordinates?.length > 0 && (
            <Polyline
              key={`${routeCoordinates.length}-${forceUpdate}`}
              coordinates={routeCoordinates}
              strokeWidth={5}
              strokeColor="#183B5C"
              lineCap="round"
              lineJoin="round"
            />
          )}
        </MapView>
      </View>

      <Animated.View
        style={[
          styles.sheetContainer,
          {
            top: sheetTopAnim,
            paddingBottom: tabBarHeight + insets.bottom,
          },
        ]}
      >
        <View style={styles.sheetHandleArea} {...panResponder.panHandlers}>
          <View style={styles.sheetHandle} />
        </View>

        {renderSheetContent()}
      </Animated.View>

      <FloatingActionButtons
        visible={shouldShowButtonsFixed}
        disabled={!pickup || !dropoff || loading}
        onScan={openScanner}
        onFind={handleBookRide}
        trackUserAction={trackUserAction}
        driversWithinRadius={driversWithinRadius}
      />
    </View>
  );
}

// ==================== STYLES ====================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },

  fullMapContainer: {
    flex: 1,
  },

  fullMap: {
    flex: 1,
  },

  alertOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: scale(20),
    zIndex: 999,
  },

  alertContainer: {
    width: "100%",
    backgroundColor: "#FFF",
    borderRadius: moderateScale(22),
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(20),
  },

  alertIconContainer: {
    width: moderateScale(72),
    height: moderateScale(72),
    borderRadius: moderateScale(36),
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: verticalScale(12),
  },

  alertTitle: {
    fontSize: rf(18),
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    marginBottom: verticalScale(8),
  },

  alertMessage: {
    fontSize: rf(13),
    color: "#6B7280",
    lineHeight: moderateScale(20),
    textAlign: "center",
    marginBottom: verticalScale(18),
  },

  alertButtons: {
    flexDirection: "row",
    gap: scale(10),
  },

  alertButton: {
    flex: 1,
    minHeight: verticalScale(46),
    borderRadius: moderateScale(14),
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: scale(14),
  },

  alertCancelButton: {
    backgroundColor: "#F3F4F6",
  },

  alertConfirmButton: {
    backgroundColor: "#183B5C",
  },

  alertCancelText: {
    fontSize: rf(13),
    fontWeight: "700",
    color: "#374151",
  },

  alertConfirmText: {
    fontSize: rf(13),
    fontWeight: "800",
    color: "#FFF",
  },

  locationCard: {
    backgroundColor: "#FFF",
    borderRadius: moderateScale(16),
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(14),
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  locationDot: {
    width: moderateScale(14),
    height: moderateScale(14),
    borderRadius: moderateScale(7),
    borderWidth: 2,
    marginRight: scale(12),
  },

  locationContent: {
    flex: 1,
  },

  locationLabel: {
    fontSize: rf(11),
    color: "#6B7280",
    marginBottom: verticalScale(4),
    fontWeight: "700",
    textTransform: "uppercase",
  },

  locationValue: {
    fontSize: rf(13),
    color: "#111827",
    fontWeight: "700",
  },

  locationPlaceholder: {
    color: "#9CA3AF",
    fontWeight: "500",
  },

  locationDetails: {
    marginTop: verticalScale(8),
    backgroundColor: "#F9FAFB",
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(10),
    fontSize: rf(12),
    color: "#111827",
  },

  passengerCard: {
    backgroundColor: "#FFF",
    borderRadius: moderateScale(16),
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(14),
    marginTop: verticalScale(12),
  },

  passengerTitle: {
    fontSize: rf(13),
    fontWeight: "800",
    color: "#111827",
    marginBottom: verticalScale(10),
  },

  passengerControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  passengerControl: {
    width: moderateScale(42),
    height: moderateScale(42),
    borderRadius: moderateScale(12),
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },

  passengerControlDisabled: {
    opacity: 0.5,
  },

  passengerNumber: {
    fontSize: rf(18),
    fontWeight: "800",
    color: "#111827",
  },

  tripMetricsRow: {
    backgroundColor: "#FFF",
    borderRadius: moderateScale(16),
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: verticalScale(14),
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: verticalScale(12),
  },

  tripMetricItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: scale(8),
  },

  tripMetricIcon: {
    width: moderateScale(34),
    height: moderateScale(34),
    borderRadius: moderateScale(17),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: verticalScale(6),
  },

  tripMetricValue: {
    fontSize: rf(14),
    fontWeight: "800",
    color: "#111827",
  },

  tripMetricLabel: {
    fontSize: rf(11),
    color: "#6B7280",
    marginTop: verticalScale(2),
  },

  tripMetricDivider: {
    width: 1,
    backgroundColor: "#E5E7EB",
  },

  fareBar: {
    backgroundColor: "#FFF",
    marginTop: verticalScale(12),
    borderRadius: moderateScale(16),
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(14),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  fareBarLeft: {
    flex: 1,
    marginRight: scale(10),
  },

  fareBarAmount: {
    fontSize: rf(22),
    fontWeight: "900",
    color: "#183B5C",
  },

  fareBarMeta: {
    marginTop: verticalScale(4),
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },

  fareBarLabel: {
    fontSize: rf(11),
    color: "#6B7280",
    fontWeight: "600",
  },

  fareMinBadge: {
    marginLeft: scale(8),
    backgroundColor: "#FEF3C7",
    borderRadius: moderateScale(999),
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(3),
  },

  fareMinText: {
    fontSize: rf(10),
    color: "#92400E",
    fontWeight: "800",
  },

  fareBreakdownBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(10),
  },

  fareBreakdownLabel: {
    marginLeft: scale(6),
    fontSize: rf(12),
    fontWeight: "800",
    color: "#183B5C",
  },

  breakdownOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.45)",
  },

  breakdownBackdrop: {
    flex: 1,
  },

  breakdownModal: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: moderateScale(24),
    borderTopRightRadius: moderateScale(24),
    paddingHorizontal: scale(18),
    paddingTop: verticalScale(10),
    paddingBottom: verticalScale(20),
  },

  breakdownHandle: {
    width: moderateScale(40),
    height: verticalScale(5),
    borderRadius: moderateScale(999),
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginBottom: verticalScale(14),
  },

  breakdownHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: verticalScale(12),
  },

  breakdownHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },

  breakdownIconWrap: {
    width: moderateScale(34),
    height: moderateScale(34),
    borderRadius: moderateScale(12),
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: scale(10),
  },

  breakdownTitle: {
    fontSize: rf(16),
    fontWeight: "900",
    color: "#111827",
  },

  breakdownClose: {
    width: moderateScale(34),
    height: moderateScale(34),
    borderRadius: moderateScale(17),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },

  breakdownTripStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: verticalScale(14),
    flexWrap: "wrap",
  },

  breakdownTripItem: {
    flexDirection: "row",
    alignItems: "center",
  },

  breakdownTripText: {
    marginLeft: scale(4),
    fontSize: rf(11),
    color: "#6B7280",
    fontWeight: "700",
  },

  breakdownTripDot: {
    width: moderateScale(4),
    height: moderateScale(4),
    borderRadius: moderateScale(2),
    backgroundColor: "#D1D5DB",
    marginHorizontal: scale(8),
  },

  breakdownRows: {
    backgroundColor: "#F9FAFB",
    borderRadius: moderateScale(16),
    padding: scale(14),
  },

  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: verticalScale(10),
  },

  breakdownRowLabel: {
    flex: 1,
    fontSize: rf(12),
    color: "#374151",
    paddingRight: scale(10),
  },

  breakdownRowValue: {
    fontSize: rf(12),
    color: "#111827",
    fontWeight: "800",
  },

  breakdownInfoRow: {
    flexDirection: "row",
    marginBottom: verticalScale(10),
  },

  breakdownInfoText: {
    flex: 1,
    fontSize: rf(11),
    color: "#92400E",
    marginLeft: scale(6),
  },

  breakdownTotal: {
    marginTop: verticalScale(14),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  breakdownTotalLabel: {
    fontSize: rf(14),
    fontWeight: "800",
    color: "#111827",
  },

  breakdownTotalAmount: {
    fontSize: rf(22),
    fontWeight: "900",
    color: "#183B5C",
  },

  floatingActionContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 20,
  },

  floatingActionButtons: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.97)",
    padding: scale(10),
    borderRadius: moderateScale(18),
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
    gap: scale(10),
  },

  floatingActionButton: {
    flex: 1,
    borderRadius: moderateScale(14),
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(10),
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    alignItems: "center",
  },

  floatingActionButtonPrimary: {
    backgroundColor: "#183B5C",
  },

  floatingActionButtonDisabled: {
    opacity: 0.5,
  },

  floatingActionIconWrapper: {
    width: moderateScale(36),
    height: moderateScale(36),
    borderRadius: moderateScale(18),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ECFDF5",
    marginRight: scale(10),
  },

  floatingActionIconWrapperPrimary: {
    backgroundColor: "rgba(255,255,255,0.16)",
  },

  floatingActionTextContainer: {
    flex: 1,
  },

  floatingActionTitle: {
    fontSize: rf(13),
    fontWeight: "900",
    color: "#111827",
  },

  floatingActionTitleLight: {
    color: "#FFF",
  },

  floatingActionSubtitle: {
    fontSize: rf(10),
    color: "#6B7280",
    marginTop: verticalScale(2),
  },

  floatingActionSubtitleLight: {
    color: "rgba(255,255,255,0.78)",
  },

  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.45)",
  },

  modalBackdrop: {
    flex: 1,
  },

  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: moderateScale(24),
    borderTopRightRadius: moderateScale(24),
    paddingHorizontal: scale(18),
    paddingTop: verticalScale(10),
    paddingBottom: verticalScale(22),
  },

  modalHandle: {
    width: moderateScale(40),
    height: verticalScale(5),
    borderRadius: moderateScale(999),
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginBottom: verticalScale(14),
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: verticalScale(16),
  },

  modalTitle: {
    fontSize: rf(18),
    fontWeight: "900",
    color: "#111827",
  },

  modalClose: {
    width: moderateScale(34),
    height: moderateScale(34),
    borderRadius: moderateScale(17),
    backgroundColor: "#F9FAFB",
    alignItems: "center",
    justifyContent: "center",
  },

  radiusDisplay: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    marginBottom: verticalScale(16),
  },

  radiusValue: {
    fontSize: rf(34),
    fontWeight: "900",
    color: "#183B5C",
  },

  radiusUnit: {
    fontSize: rf(16),
    fontWeight: "700",
    color: "#6B7280",
    marginLeft: scale(6),
    marginBottom: verticalScale(4),
  },

  radiusOptionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: scale(10),
    marginBottom: verticalScale(16),
  },

  radiusOptionChip: {
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(10),
    borderRadius: moderateScale(12),
    backgroundColor: "#F3F4F6",
  },

  radiusOptionChipActive: {
    backgroundColor: "#183B5C",
  },

  radiusOptionText: {
    fontSize: rf(12),
    fontWeight: "800",
    color: "#374151",
  },

  radiusOptionTextActive: {
    color: "#FFF",
  },

  driverStats: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(12),
    marginBottom: verticalScale(16),
  },

  driverStatsText: {
    marginLeft: scale(8),
    flex: 1,
    fontSize: rf(12),
    color: "#374151",
    fontWeight: "600",
  },

  applyButton: {
    backgroundColor: "#183B5C",
    borderRadius: moderateScale(14),
    minHeight: verticalScale(48),
    alignItems: "center",
    justifyContent: "center",
  },

  applyButtonText: {
    fontSize: rf(14),
    fontWeight: "900",
    color: "#FFF",
  },

  sheetContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFF",
    borderTopLeftRadius: moderateScale(24),
    borderTopRightRadius: moderateScale(24),
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -10 },
    elevation: 12,
  },

  sheetHandleArea: {
    paddingTop: verticalScale(10),
    paddingBottom: verticalScale(4),
    alignItems: "center",
  },

  sheetHandle: {
    width: moderateScale(42),
    height: verticalScale(5),
    borderRadius: moderateScale(999),
    backgroundColor: "#D1D5DB",
  },

  scrollContent: {
    paddingHorizontal: scale(16),
  },

  headerSection: {
    marginTop: verticalScale(6),
    marginBottom: verticalScale(12),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  greeting: {
    fontSize: rf(13),
    color: "#6B7280",
    fontWeight: "600",
  },

  greetingName: {
    marginTop: verticalScale(2),
    fontSize: rf(24),
    color: "#111827",
    fontWeight: "900",
  },

  filterButton: {
    backgroundColor: "#F9FAFB",
    borderRadius: moderateScale(16),
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(10),
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  filterButtonContent: {
    flexDirection: "row",
    alignItems: "center",
  },

  filterText: {
    marginHorizontal: scale(6),
    fontSize: rf(12),
    fontWeight: "800",
    color: "#183B5C",
  },

  proximityIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: verticalScale(6),
  },

  proximityIndicatorText: {
    marginLeft: scale(4),
    fontSize: rf(10),
    color: "#10B981",
    fontWeight: "800",
  },

  currentLocationBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginBottom: verticalScale(12),
    backgroundColor: "#EFF6FF",
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(10),
  },

  currentLocationText: {
    marginLeft: scale(6),
    fontSize: rf(12),
    fontWeight: "800",
    color: "#183B5C",
  },

  locationConnector: {
    alignItems: "flex-start",
    paddingLeft: scale(20),
    paddingVertical: verticalScale(4),
  },

  locationConnectorLine: {
    width: 2,
    height: verticalScale(14),
    backgroundColor: "#D1D5DB",
  },

  recentSection: {
    marginTop: verticalScale(12),
  },

  sectionTitle: {
    fontSize: rf(13),
    fontWeight: "800",
    color: "#111827",
    marginBottom: verticalScale(10),
  },

  recentChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: moderateScale(999),
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(8),
    marginRight: scale(8),
    maxWidth: scale(180),
  },

  recentChipText: {
    marginLeft: scale(6),
    fontSize: rf(11),
    color: "#374151",
    fontWeight: "700",
  },

  helpContainer: {
    marginTop: verticalScale(14),
    marginBottom: verticalScale(10),
    alignItems: "center",
  },

  helpText: {
    fontSize: rf(11),
    color: "#9CA3AF",
    textAlign: "center",
  },

  pickupMarker: {
    width: moderateScale(34),
    height: moderateScale(34),
    borderRadius: moderateScale(17),
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFF",
  },

  dropoffMarker: {
    width: moderateScale(34),
    height: moderateScale(34),
    borderRadius: moderateScale(17),
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFF",
  },

  driverMarker: {
    width: moderateScale(32),
    height: moderateScale(32),
    borderRadius: moderateScale(16),
    backgroundColor: "#183B5C",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFF",
  },

  scannerHeader: {
    backgroundColor: "#111827",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: scale(16),
    paddingBottom: verticalScale(14),
  },

  scannerBackButton: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  scannerTitle: {
    fontSize: rf(16),
    fontWeight: "800",
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
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.28)",
  },

  scanArea: {
    width: scale(240),
    height: scale(240),
    borderRadius: moderateScale(20),
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
  },

  scanCorner: {
    position: "absolute",
    width: scale(30),
    height: scale(30),
    borderLeftWidth: 4,
    borderTopWidth: 4,
    borderColor: "#FFF",
    top: -2,
    left: -2,
  },

  scanCornerTopRight: {
    right: -2,
    left: undefined,
    borderLeftWidth: 0,
    borderRightWidth: 4,
  },

  scanCornerBottomLeft: {
    top: undefined,
    bottom: -2,
    borderTopWidth: 0,
    borderBottomWidth: 4,
  },

  scanCornerBottomRight: {
    top: undefined,
    right: -2,
    left: undefined,
    bottom: -2,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 4,
    borderBottomWidth: 4,
  },

  scannerInstruction: {
    marginTop: verticalScale(20),
    color: "#FFF",
    fontSize: rf(13),
    fontWeight: "700",
  },
});