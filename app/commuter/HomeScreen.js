// screens/commuter/HomeScreen.js
import React, { useState, useEffect, useRef, useCallback } from "react";
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
  PixelRatio,
  StatusBar,
  PanResponder,
  Keyboard, // Add this import
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
const isLargeDevice = SCREEN_HEIGHT >= 812 && SCREEN_HEIGHT < 900;
const isXLDevice = SCREEN_HEIGHT >= 900;
const isNotchDevice = Platform.OS === "ios" && (isLargeDevice || isXLDevice);

// Draggable sheet snap points
const SHEET_TOP_EXPANDED = SCREEN_HEIGHT * 0.14;
const SHEET_TOP_MID = SCREEN_HEIGHT * 0.42;
const SHEET_TOP_COLLAPSED = SCREEN_HEIGHT * 0.6;

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
          style={[styles.alertContainer, { transform: [{ scale: scaleAnim }] }]}
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

// ==================== CUSTOM TOAST NOTIFICATION ====================
const ModernToast = ({ visible, message, type, onHide }) => {
  const translateY = useRef(new Animated.Value(100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

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
      ]).start(() => onHide?.());
    }, 3000);

    return () => clearTimeout(timer);
  }, [visible, translateY, opacity, onHide]);

  const getIcon = () => {
    switch (type) {
      case "success":
        return "checkmark-circle";
      case "error":
        return "alert-circle";
      case "warning":
        return "warning";
      default:
        return "information-circle";
    }
  };

  const getColors = () => {
    switch (type) {
      case "success":
        return { bg: "#10B981", icon: "#FFFFFF" };
      case "error":
        return { bg: "#EF4444", icon: "#FFFFFF" };
      case "warning":
        return { bg: "#F59E0B", icon: "#FFFFFF" };
      default:
        return { bg: "#183B5C", icon: "#FFFFFF" };
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
      <Ionicons name={getIcon()} size={moderateScale(18)} color={colors.icon} />
      <Text style={styles.toastMessage}>{message}</Text>
    </Animated.View>
  );
};

// ==================== GLOWING LOCATION INPUT CARD ====================
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
  trackUserAction,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [isPressed, setIsPressed] = useState(false);
  const glowAnim = useRef(new Animated.Value(0)).current;
  const pulseGlowAnim = useRef(new Animated.Value(0)).current;
  const borderGlowAnim = useRef(new Animated.Value(0)).current;
  const badgeScaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let pulseGlow;
    let borderGlow;
    let badgeScale;

    if (!value) {
      pulseGlow = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseGlowAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: false,
          }),
          Animated.timing(pulseGlowAnim, {
            toValue: 0,
            duration: 800,
            useNativeDriver: false,
          }),
        ]),
      );

      borderGlow = Animated.loop(
        Animated.sequence([
          Animated.timing(borderGlowAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: false,
          }),
          Animated.timing(borderGlowAnim, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: false,
          }),
        ]),
      );

      badgeScale = Animated.loop(
        Animated.sequence([
          Animated.spring(badgeScaleAnim, {
            toValue: 1.1,
            useNativeDriver: true,
            friction: 3,
            tension: 40,
          }),
          Animated.spring(badgeScaleAnim, {
            toValue: 1,
            useNativeDriver: true,
            friction: 3,
            tension: 40,
          }),
        ]),
      );

      pulseGlow.start();
      borderGlow.start();
      badgeScale.start();
    } else {
      pulseGlowAnim.setValue(0);
      borderGlowAnim.setValue(0);
      badgeScaleAnim.setValue(1);
    }

    return () => {
      pulseGlow?.stop();
      borderGlow?.stop();
      badgeScale?.stop();
    };
  }, [value, pulseGlowAnim, borderGlowAnim, badgeScaleAnim]);

  useEffect(() => {
    if (isActive) {
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.5,
          duration: 300,
          useNativeDriver: false,
        }),
      ]).start();
    } else {
      glowAnim.setValue(0);
    }
  }, [isActive, glowAnim]);

  const handlePressIn = () => {
    setIsPressed(true);

    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
      tension: 100,
      friction: 10,
    }).start();

    Animated.sequence([
      Animated.timing(glowAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: false,
      }),
      Animated.timing(glowAnim, {
        toValue: 0.3,
        duration: 150,
        useNativeDriver: false,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    setIsPressed(false);
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 100,
      friction: 10,
    }).start();
  };

  const glowIntensity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.2],
  });

  const pulseGlowIntensity = pulseGlowAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.15, 0],
  });

  const borderGlowIntensity = borderGlowAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 1, 0],
  });

  const getGlowColor = () => {
    if (iconColor === "#10B981") return "rgba(16, 185, 129,";
    if (iconColor === "#EF4444") return "rgba(239, 68, 68,";
    return "rgba(24, 59, 92,";
  };

  const glowColor = getGlowColor();

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        style={[
          styles.locationCard,
          isActive && styles.locationCardActive,
          isPressed && styles.locationCardPressed,
          !value && styles.locationCardEmpty,
        ]}
        onPress={() => {
          trackUserAction?.();
          onPress?.();
        }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {!value && (
          <Animated.View
            style={[
              styles.glowBorder,
              { borderColor: iconColor, opacity: borderGlowIntensity },
            ]}
          />
        )}

        <Animated.View
          style={[
            styles.glowBackground,
            {
              backgroundColor: glowColor,
              opacity: isActive ? glowIntensity : pulseGlowIntensity,
            },
          ]}
        />

        <Animated.View
          style={[
            styles.outerGlow,
            {
              backgroundColor: iconColor,
              opacity: pulseGlowIntensity,
              transform: [
                {
                  scale: pulseGlowAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.95, 1.05],
                  }),
                },
              ],
            },
          ]}
        />

        <View
          style={[
            styles.locationIconContainer,
            { backgroundColor: `${iconColor}15` },
          ]}
        >
          <Ionicons name={icon} size={moderateScale(20)} color={iconColor} />
        </View>

        <View style={styles.locationContent}>
          <Text
            style={[
              styles.locationLabel,
              value && styles.locationLabelActive,
              !value && { color: iconColor },
            ]}
          >
            {label}
          </Text>

          <Text
            style={[styles.locationValue, !value && styles.locationPlaceholder]}
            numberOfLines={2}
          >
            {value || placeholder}
          </Text>

          {!value && (
            <View style={styles.tapHintContainer}>
              <Ionicons
                name="hand-left-outline"
                size={moderateScale(11)}
                color={iconColor}
              />
              <Text style={[styles.tapHint, { color: iconColor }]}>
                Tap to select location
              </Text>
            </View>
          )}

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

        {/* {showCurrentLocation && (
          <TouchableOpacity
            onPress={onCurrentLocation}
            style={styles.currentLocationButton}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.currentLocationGlow,
                { shadowColor: iconColor },
              ]}
            >
              <Ionicons
                name="locate"
                size={moderateScale(20)}
                color="#183B5C"
              />
            </View>
          </TouchableOpacity>
        )} */}

        <View style={styles.chevronContainer}>
          <Ionicons
            name="chevron-forward"
            size={moderateScale(16)}
            color="#D1D5DB"
          />
        </View>

        {!value && (
          <Animated.View
            style={[
              styles.tapBadge,
              {
                backgroundColor: iconColor,
                transform: [{ scale: badgeScaleAnim }],
              },
            ]}
          >
            <Ionicons
              name="search-outline"
              size={moderateScale(10)}
              color="#FFF"
            />
            <Text style={styles.tapBadgeText}>Tap here</Text>
          </Animated.View>
        )}

        {!value && (
          <Animated.View
            style={[
              styles.pulsingDot,
              { backgroundColor: iconColor, opacity: pulseGlowAnim },
            ]}
          />
        )}
      </Pressable>
    </Animated.View>
  );
};

// ==================== GLOW GUIDE TOOLTIP ====================
const GlowGuide = ({ visible, onClose }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.loop(
          Animated.sequence([
            Animated.timing(fadeAnim, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }),
            Animated.timing(fadeAnim, {
              toValue: 0.3,
              duration: 500,
              useNativeDriver: true,
            }),
          ]),
        ),
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 50,
          friction: 7,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      translateY.setValue(-20);
    }
  }, [visible, fadeAnim, translateY]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[styles.glowGuideContainer, { transform: [{ translateY }] }]}
    >
      <Animated.View style={[styles.glowGuide, { opacity: fadeAnim }]}>
        <Ionicons name="flash-outline" size={moderateScale(18)} color="#FFF" />
        <Text style={styles.glowGuideText}>
          ✨ Tap the glowing boxes to set your location!
        </Text>
        <TouchableOpacity onPress={onClose} style={styles.glowGuideClose}>
          <Ionicons name="close" size={moderateScale(15)} color="#FFF" />
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
};

// ==================== PASSENGER SELECTOR ====================
const PassengerSelector = ({ count, onChange, max = 6, trackUserAction }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <View style={styles.passengerCard}>
      <TouchableOpacity
        style={styles.passengerHeader}
        onPress={() => {
          trackUserAction?.();
          setIsExpanded((prev) => !prev);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.passengerHeaderLeft}>
          <Ionicons name="people" size={moderateScale(18)} color="#6B7280" />
          <Text style={styles.passengerTitle}>Passengers</Text>
        </View>

        <View style={styles.passengerHeaderRight}>
          <Text style={styles.passengerCountText}>{count}</Text>
          <Ionicons
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={moderateScale(18)}
            color="#9CA3AF"
          />
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.passengerControls}>
          <TouchableOpacity
            style={[
              styles.passengerControl,
              count <= 1 && styles.passengerControlDisabled,
            ]}
            onPress={() => {
              trackUserAction?.();
              onChange(count - 1);
            }}
            disabled={count <= 1}
          >
            <Ionicons
              name="remove"
              size={moderateScale(18)}
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
              onChange(count + 1);
            }}
            disabled={count >= max}
          >
            <Ionicons
              name="add"
              size={moderateScale(18)}
              color={count >= max ? "#D1D5DB" : "#183B5C"}
            />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

// ==================== TRIP SUMMARY CARD ====================
const TripSummaryCard = ({ distance, time, passengers, fare, appFee }) => (
  <View style={styles.summaryCard}>
    <View style={styles.summaryMetrics}>
      <View style={styles.metricItem}>
        <Ionicons name="map-outline" size={moderateScale(18)} color="#6B7280" />
        <Text style={styles.metricValue}>{distance}</Text>
        <Text style={styles.metricLabel}>km</Text>
      </View>

      <View style={styles.metricDivider} />

      <View style={styles.metricItem}>
        <Ionicons
          name="time-outline"
          size={moderateScale(18)}
          color="#6B7280"
        />
        <Text style={styles.metricValue}>{time}</Text>
        <Text style={styles.metricLabel}>min</Text>
      </View>

      <View style={styles.metricDivider} />

      <View style={styles.metricItem}>
        <Ionicons
          name="people-outline"
          size={moderateScale(18)}
          color="#6B7280"
        />
        <Text style={styles.metricValue}>{passengers}</Text>
        <Text style={styles.metricLabel}>pax</Text>
      </View>
    </View>

    <View style={styles.fareRow}>
      <Text style={styles.fareLabel}>Service Fee</Text>
      <Text style={styles.fareLabel}>₱{appFee}</Text>
    </View>

    <View style={styles.fareRow}>
      <Text style={styles.fareLabel}>Total Fare</Text>
      <Text style={styles.fareAmount}>₱{fare}</Text>
    </View>
  </View>
);

// ==================== FLOATING ACTION BUTTONS (FIXED FOR ANDROID) ====================
// Update the FloatingActionButtons component (around line 400)
const FloatingActionButtons = ({
  onScan,
  onFind,
  disabled,
  trackUserAction,
  visible,
}) => {
  const translateY = useRef(new Animated.Value(120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  const [mounted, setMounted] = useState(false);
  const [canPress, setCanPress] = useState(false);

  const hideTimerRef = useRef(null);
  const animRef = useRef(null);

  const tabBarHeight = useBottomTabBarHeight();

  const getBottomPosition = useCallback(() => {
    return tabBarHeight + insets.bottom + 10;
  }, [tabBarHeight, insets.bottom]);

  const getButtonDimensions = useCallback(() => {
    if (isSmallDevice) {
      return {
        paddingVertical: moderateVerticalScale(9),
        paddingHorizontal: scale(10),
        iconSize: moderateScale(22),
        iconWrapperSize: moderateScale(30),
        gap: scale(7),
      };
    }

    if (isMediumDevice) {
      return {
        paddingVertical: moderateVerticalScale(10),
        paddingHorizontal: scale(12),
        iconSize: moderateScale(24),
        iconWrapperSize: moderateScale(33),
        gap: scale(8),
      };
    }

    return {
      paddingVertical: moderateVerticalScale(11),
      paddingHorizontal: scale(13),
      iconSize: moderateScale(24),
      iconWrapperSize: moderateScale(36),
      gap: scale(10),
    };
  }, []);

  const getTextSizes = useCallback(() => {
    if (isSmallDevice) {
      return {
        titleSize: rf(11),
        subtitleSize: rf(8),
      };
    }

    if (isMediumDevice) {
      return {
        titleSize: rf(12),
        subtitleSize: rf(8.5),
      };
    }

    return {
      titleSize: rf(13),
      subtitleSize: rf(9),
    };
  }, []);

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

    if (animRef.current) {
      animRef.current.stop();
    }

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
      // disable touch immediately
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

      hideTimerRef.current = setTimeout(() => {
        setMounted(false);
      }, 190);
    }
  }, [visible, translateY, opacity]);

  if (!mounted) return null;

  const buttonDims = getButtonDimensions();
  const textSizes = getTextSizes();

  return (
    <Animated.View
      pointerEvents={canPress ? "box-none" : "none"}
      style={[
        styles.floatingActionContainer,
        {
          bottom: getBottomPosition(),
          transform: [{ translateY }],
          opacity,
          paddingHorizontal: scale(16),
        },
      ]}
    >
      <View
        style={[
          styles.floatingActionButtons,
          {
            borderRadius: moderateScale(isSmallDevice ? 14 : 18),
            padding: scale(isSmallDevice ? 8 : 10),
            gap: scale(isSmallDevice ? 8 : 10),
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.floatingActionButton,
            {
              paddingVertical: buttonDims.paddingVertical,
              paddingHorizontal: buttonDims.paddingHorizontal,
              gap: buttonDims.gap,
              borderRadius: moderateScale(isSmallDevice ? 11 : 13),
            },
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
          <View
            style={[
              styles.floatingActionIconWrapper,
              {
                width: buttonDims.iconWrapperSize,
                height: buttonDims.iconWrapperSize,
                borderRadius: buttonDims.iconWrapperSize / 2,
              },
            ]}
          >
            <Ionicons
              name="qr-code-outline"
              size={buttonDims.iconSize}
              color="#10B981"
            />
          </View>

          <View style={styles.floatingActionTextContainer}>
            <Text
              style={[
                styles.floatingActionTitle,
                { fontSize: textSizes.titleSize },
              ]}
            >
              Scan QR
            </Text>
            <Text
              style={[
                styles.floatingActionSubtitle,
                { fontSize: textSizes.subtitleSize },
              ]}
            >
              Instant ride
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.floatingActionButton,
            styles.floatingActionButtonPrimary,
            {
              paddingVertical: buttonDims.paddingVertical,
              paddingHorizontal: buttonDims.paddingHorizontal,
              gap: buttonDims.gap,
              borderRadius: moderateScale(isSmallDevice ? 11 : 13),
            },
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
              {
                width: buttonDims.iconWrapperSize,
                height: buttonDims.iconWrapperSize,
                borderRadius: buttonDims.iconWrapperSize / 2,
              },
            ]}
          >
            <Ionicons name="location" size={buttonDims.iconSize} color="#FFF" />
          </View>

          <View style={styles.floatingActionTextContainer}>
            <Text
              style={[
                styles.floatingActionTitle,
                styles.floatingActionTitleLight,
                { fontSize: textSizes.titleSize },
              ]}
            >
              Find Driver
            </Text>
            <Text
              style={[
                styles.floatingActionSubtitle,
                styles.floatingActionSubtitleLight,
                { fontSize: textSizes.subtitleSize },
              ]}
            >
              Search nearby
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
            <Text style={styles.modalTitle}>Search Radius</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalClose}>
              <Ionicons name="close" size={moderateScale(22)} color="#9CA3AF" />
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
  const shakeAnimPickup = useRef(new Animated.Value(0)).current;
  const shakeAnimDropoff = useRef(new Animated.Value(0)).current;

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
  const [activeBooking, setActiveBooking] = useState(null);
  const [recentLocations, setRecentLocations] = useState([]);
  const [forceUpdate, setForceUpdate] = useState(false); // Added for Android fix
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
  const [showGlowGuide, setShowGlowGuide] = useState(false);
  const [toast, setToast] = useState({
    visible: false,
    message: "",
    type: "info",
  });
  const [permission, requestPermission] = useCameraPermissions();
  const [showScanner, setShowScanner] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [scanningForDriver, setScanningForDriver] = useState(false);
  const [scannedDriverData, setScannedDriverData] = useState(null);

  const googleApiKey = Constants.expoConfig?.extra?.GOOGLE_API_KEY;

  // Force re-render for Android when locations are set
  useEffect(() => {
    if (pickup && dropoff && Platform.OS === "android") {
      // Small delay to ensure Android layout updates
      const timer = setTimeout(() => {
        setForceUpdate((prev) => !prev);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [pickup, dropoff]);

  // Keyboard listener for Android
  useEffect(() => {
    const keyboardDidHideListener = Keyboard.addListener(
      "keyboardDidHide",
      () => {
        if (pickup && dropoff && Platform.OS === "android") {
          setForceUpdate((prev) => !prev);
        }
      },
    );

    return () => {
      keyboardDidHideListener.remove();
    };
  }, [pickup, dropoff]);

  // ==================== DRAGGABLE SHEET ====================
  const sheetTopAnim = useRef(new Animated.Value(SHEET_TOP_MID)).current;
  const lastSheetTop = useRef(SHEET_TOP_MID);

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
    [sheetTopAnim],
  );

  const toggleSheet = useCallback(() => {
    const current = lastSheetTop.current;

    if (current <= SHEET_TOP_EXPANDED + 20) {
      animateSheetTo(SHEET_TOP_COLLAPSED);
    } else if (current >= SHEET_TOP_COLLAPSED - 20) {
      animateSheetTo(SHEET_TOP_MID);
    } else {
      animateSheetTo(SHEET_TOP_COLLAPSED);
    }
  }, [animateSheetTo]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dy) > 8,
      onPanResponderGrant: () => {
        sheetTopAnim.stopAnimation((value) => {
          lastSheetTop.current = value;
        });
      },
      onPanResponderMove: (_, gestureState) => {
        let nextTop = lastSheetTop.current + gestureState.dy;

        if (nextTop < SHEET_TOP_EXPANDED) nextTop = SHEET_TOP_EXPANDED;
        if (nextTop > SHEET_TOP_COLLAPSED) nextTop = SHEET_TOP_COLLAPSED;

        sheetTopAnim.setValue(nextTop);
      },
      onPanResponderRelease: (_, gestureState) => {
        const finalTop = lastSheetTop.current + gestureState.dy;
        const velocity = gestureState.vy;

        const snapPoints = [
          SHEET_TOP_EXPANDED,
          SHEET_TOP_MID,
          SHEET_TOP_COLLAPSED,
        ];

        let destination = SHEET_TOP_MID;

        if (velocity < -0.5) {
          destination =
            finalTop > SHEET_TOP_MID ? SHEET_TOP_MID : SHEET_TOP_EXPANDED;
        } else if (velocity > 0.5) {
          destination =
            finalTop < SHEET_TOP_MID ? SHEET_TOP_MID : SHEET_TOP_COLLAPSED;
        } else {
          destination = snapPoints.reduce((prev, curr) =>
            Math.abs(curr - finalTop) < Math.abs(prev - finalTop) ? curr : prev,
          );
        }

        animateSheetTo(destination);
      },
    }),
  ).current;

  useEffect(() => {
    animateSheetTo(SHEET_TOP_MID);
  }, [animateSheetTo]);

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
        setAlert((prev) => ({ ...prev, visible: false }));
        onConfirm?.();
      },
      onCancel: () => {
        setAlert((prev) => ({ ...prev, visible: false }));
        onCancel?.();
      },
    });
  };

  const showToast = (message, type = "info") =>
    setToast({ visible: true, message, type });

  const hideAlert = () => setAlert((prev) => ({ ...prev, visible: false }));

  const trackUserAction = useCallback(() => {
    setLastUserAction(Date.now());
  }, []);

  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const checkFirstTime = async () => {
      try {
        const hasSeenGlowGuide = await AsyncStorage.getItem(
          "has_seen_glow_guide",
        );

        if (!hasSeenGlowGuide) {
          setShowGlowGuide(true);
          await AsyncStorage.setItem("has_seen_glow_guide", "true");
          setTimeout(() => setShowGlowGuide(false), 8000);
        }
      } catch (err) {
        console.log("Error checking glow guide status:", err);
      }
    };

    checkFirstTime();
  }, []);

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
        switch (item.key) {
          case "proximity_default_radius":
            config.defaultRadius = 0.1;
            break;
          case "proximity_max_radius":
            config.maxRadius = Math.min(0.4, parseFloat(item.value));
            break;
          case "proximity_min_radius":
            config.minRadius = Math.max(0.1, parseFloat(item.value));
            break;
          case "proximity_show_on_map":
            config.showOnMap = item.value === "true";
            break;
          default:
            break;
        }
      });

      setProximityConfig(config);
      setProximityRadius(config.defaultRadius);
      setTempProximityRadius(config.defaultRadius);
    } catch (err) {
      console.log("Error fetching proximity config:", err);
      setProximityRadius(0.1);
      setTempProximityRadius(0.1);
    }
  };

  const loadProximityRadius = async () => {
    try {
      setProximityRadius(0.1);
      setTempProximityRadius(0.1);
      await AsyncStorage.removeItem("proximity_radius_home");
    } catch (err) {
      setProximityRadius(0.1);
      setTempProximityRadius(0.1);
    }
  };

  const saveProximityRadius = async (radius) => {
    try {
      const validRadius = Math.min(0.4, Math.max(0.1, radius));
      setProximityRadius(validRadius);
      await AsyncStorage.setItem(
        "proximity_radius_home",
        validRadius.toString(),
      );
      setShowProximityFilter(false);
      showToast(
        `Showing drivers within ${validRadius.toFixed(1)} km`,
        "success",
      );

      if (pickup && allDrivers.length > 0) {
        filterDriversByProximity(pickup, allDrivers, validRadius);
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
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const filterDriversByProximity = (
    pickupCoords = pickup,
    drivers = allDrivers,
    radius = proximityRadius,
  ) => {
    if (!pickupCoords || drivers.length === 0) {
      setFilteredDrivers([]);
      setDriversWithinRadius(0);
      return;
    }

    const filtered = drivers.filter((driver) => {
      const distance = calculateDistance(
        pickupCoords.latitude,
        pickupCoords.longitude,
        driver.latitude,
        driver.longitude,
      );
      return distance <= radius;
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
        const appFeeData = data.find((f) => f.fare_type === "app_fee");

        setFareSettings({
          baseFare: Number(baseFareData?.amount ?? 20),
          perKmRate: Number(perKmFareData?.amount ?? 5),
          minimumFare: Number(minFareData?.amount ?? 20),
          appFee: Number(appFeeData?.amount ?? 0),
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

      const { data } = await supabase
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
        } else if (data.status === "pending") {
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
          drivers!inner(
            id,
            first_name,
            last_name,
            status,
            is_active,
            driver_vehicles(vehicle_type, vehicle_color, plate_number)
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

          const vehicle = driver.drivers?.driver_vehicles?.[0] || {};

          return {
            driver_id: driver.driver_id,
            first_name: driver.drivers?.first_name,
            last_name: driver.drivers?.last_name,
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
          filterDriversByProximity(
            pickup,
            driversWithDistance,
            proximityRadius,
          );
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

  const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        showAlert({
          type: "warning",
          title: "Location Permission",
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
          const fullAddress = `${street || name || "Current Location"}, ${
            city || ""
          }, ${region || ""}`;
          setPickupText(fullAddress);
        }
      }

      getNearbyDrivers(coords);
    } catch (err) {
      console.log("Error getting location:", err);
      showAlert({
        type: "error",
        title: "Location Error",
        message: "Failed to get your location. Please try again.",
        confirmText: "OK",
      });
    }
  };

  const handleUseCurrentLocation = () => {
    trackUserAction();

    if (userLocation) {
      setPickup(userLocation);

      Location.reverseGeocodeAsync(userLocation).then((address) => {
        if (address[0]) {
          const { street, name, city, region } = address[0];
          const fullAddress = `${street || name || "Current Location"}, ${
            city || ""
          }, ${region || ""}`;

          setPickupText(fullAddress);
          showToast("Pickup location set!", "success");
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
          showToast("Pickup location selected!", "success");
        } else {
          setDropoff(location);
          setDropoffText(address);
          showToast("Dropoff location selected!", "success");
        }

        const nextPickup = type === "pickup" ? location : pickup;
        const nextDropoff = type === "dropoff" ? location : dropoff;

        if (nextPickup && nextDropoff) {
          calculateRoute(nextPickup, nextDropoff);
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
      showToast("Pickup location set from recent", "success");
    } else {
      setDropoff(recent.location);
      setDropoffText(recent.address);
      setDropoffDetails(recent.details || "");
      showToast("Dropoff location set from recent", "success");
    }

    const nextPickup = recent.type === "pickup" ? recent.location : pickup;
    const nextDropoff = recent.type === "dropoff" ? recent.location : dropoff;

    if (nextPickup && nextDropoff) {
      calculateRoute(nextPickup, nextDropoff);
    }
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

      points.push({
        latitude: lat / 1e5,
        longitude: lng / 1e5,
      });
    }

    return points;
  };

  const calculateFareWithPassengers = (distanceKm) => {
    if (!distanceKm) return;

    const exactDistance = parseFloat(distanceKm);
    setEstimatedDistance(exactDistance.toFixed(2));

    const baseFare = Number(fareSettings.baseFare || 20);
    const perKmRate = Number(fareSettings.perKmRate || 5);
    const minimumFare = Number(fareSettings.minimumFare || 20);
    const appFee = Number(fareSettings.appFee || 0);

    let farePerPassenger = 0;

    if (exactDistance <= 1) {
      farePerPassenger = baseFare;
    } else {
      const remainingKm = Math.ceil(exactDistance - 1);
      farePerPassenger = baseFare + remainingKm * perKmRate;
    }

    // apply minimum fare
    farePerPassenger = Math.max(farePerPassenger, minimumFare);

    // add app fee separately
    const totalPerPassenger = farePerPassenger + appFee;

    setEstimatedFare(totalPerPassenger * passengerCount);
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
        setRouteCoordinates(points);

        const leg = route.legs[0];
        const distanceKm = leg.distance.value / 1000;
        const timeMins = Math.round(leg.duration.value / 60);

        setEstimatedDistance(distanceKm.toFixed(1));
        setEstimatedTime(timeMins);
        calculateFareWithPassengers(distanceKm);

        if (mapRef.current) {
          mapRef.current.fitToCoordinates([startCoords, endCoords], {
            edgePadding: {
              top: 120,
              right: 60,
              bottom: 280,
              left: 60,
            },
            animated: true,
          });
        }
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

  const createBooking = async () => {
    if (!commuterId) {
      showAlert({
        type: "error",
        title: "Login Required",
        message: "Please login first to book a ride",
        confirmText: "OK",
      });
      return;
    }

    if (driversWithinRadius === 0) {
      showAlert({
        type: "warning",
        title: "No Drivers Available",
        message: `No drivers found within ${proximityRadius.toFixed(
          1,
        )} km. Would you like to increase the search radius?`,
        confirmText: "Increase Radius",
        cancelText: "Cancel",
        showCancel: true,
        onConfirm: () => openProximityFilter(),
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

      if (bookingError) throw bookingError;

      setCurrentBookingId(booking.id);

      if (pickup && pickupText) {
        saveRecentLocation(pickup, pickupText, pickupDetails, "pickup");
      }

      if (dropoff && dropoffText) {
        saveRecentLocation(dropoff, dropoffText, dropoffDetails, "dropoff");
      }
    } catch (err) {
      console.log("Error creating booking:", err);
      showAlert({
        type: "error",
        title: "Booking Failed",
        message: "Failed to create booking. Please try again.",
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
            type: "warning",
            title: "Camera Permission",
            message: "We need camera access to scan the driver's QR code.",
            confirmText: "OK",
          });
          return;
        }
      }

      if (!pickup || !dropoff) {
        showAlert({
          type: "warning",
          title: "Missing Locations",
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
      title: "Confirm Ride",
      message: `${driverData.first_name} ${driverData.last_name}\n${
        vehicle.vehicle_color || ""
      } ${vehicle.vehicle_type || ""}\n${vehicle.plate_number || "N/A"}\n\n📍 ${pickupText}\n🏁 ${dropoffText}\n👥 ${passengerCount} pax\n💰 ₱${estimatedFare}`,
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
        title: "Login Required",
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
            app_fee: fareSettings.appFee,
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
        driverId,
      });
    } catch (err) {
      console.log("Direct booking error:", err);
      showAlert({
        type: "error",
        title: "Booking Failed",
        message: "Failed to create booking. Please try again.",
        confirmText: "OK",
      });
      setFindingDriver(false);
      setScanningForDriver(false);
    }
  };

  const handleBarCodeScanned = async ({ data }) => {
    if (scanned) return;

    setScanned(true);

    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
    }

    try {
      const qrData = JSON.parse(data);

      if (qrData.type !== "driver_qr" && !qrData.driver_id) {
        showAlert({
          type: "error",
          title: "Invalid QR Code",
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

      const { data: driverData, error: driverError } = await supabase
        .from("drivers")
        .select(
          `
          id,
          first_name,
          last_name,
          phone,
          profile_picture,
          driver_vehicles(vehicle_type, vehicle_color, plate_number)
        `,
        )
        .eq("id", driverId)
        .single();

      if (driverError || !driverData) {
        showAlert({
          type: "error",
          title: "Driver Not Found",
          message: "Could not find driver information.",
          confirmText: "OK",
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
          type: "warning",
          title: "Missing Pickup",
          message: "Please set your pickup location first.",
          confirmText: "OK",
          onConfirm: () => setScanningForDriver(false),
        });
        return;
      }

      if (!dropoff) {
        showAlert({
          type: "warning",
          title: "Missing Dropoff",
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
        title: "Invalid QR Code",
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

  const handleBookRide = () => {
    if (!pickup) {
      shakeLocationCard("pickup");
      showAlert({
        type: "warning",
        title: "Missing Pickup",
        message:
          "Please tap on the glowing pickup box to select where you want to be picked up.",
        confirmText: "OK",
      });
      return;
    }

    if (!dropoff) {
      shakeLocationCard("dropoff");
      showAlert({
        type: "warning",
        title: "Missing Dropoff",
        message:
          "Please tap on the glowing dropoff box to select your destination.",
        confirmText: "OK",
      });
      return;
    }

    if (driversWithinRadius === 0) {
      showAlert({
        type: "warning",
        title: "No Drivers Available",
        message: `No drivers found within ${proximityRadius.toFixed(
          1,
        )} km. Would you like to increase the search radius?`,
        confirmText: "Increase Radius",
        cancelText: "Cancel",
        showCancel: true,
        onConfirm: () => openProximityFilter(),
      });
      return;
    }

    showAlert({
      type: "confirm",
      title: "Confirm Booking",
      message: `${pickupText}\n→\n${dropoffText}\n\n${passengerCount} passenger${
        passengerCount > 1 ? "s" : ""
      } • ₱${estimatedFare}`,
      confirmText: "Book Now",
      cancelText: "Cancel",
      showCancel: true,
      onConfirm: createBooking,
    });
  };

  const shouldShowButtons = !!(pickup && dropoff);

  // Also add a more robust check:
  const isPickupValid =
    !!pickup &&
    typeof pickup.latitude === "number" &&
    typeof pickup.longitude === "number";

  const isDropoffValid =
    !!dropoff &&
    typeof dropoff.latitude === "number" &&
    typeof dropoff.longitude === "number";

  const shouldShowButtonsFixed = isPickupValid && isDropoffValid;

  // Debug log (remove in production)
  useEffect(() => {
    console.log("Button Debug:", {
      pickup: !!pickup,
      dropoff: !!dropoff,
      shouldShow: !!(pickup && dropoff),
      pickupValid: isPickupValid,
      dropoffValid: isDropoffValid,
    });
  }, [pickup, dropoff, isPickupValid, isDropoffValid]);

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
        <View
          style={[styles.scannerHeader, { paddingTop: insets.top + scale(12) }]}
        >
          <TouchableOpacity
            onPress={handleCancelScanning}
            style={styles.scannerBackButton}
          >
            <Ionicons name="arrow-back" size={moderateScale(22)} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.scannerTitle}>Scan Driver QR</Text>
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

      <ModernToast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />

      <GlowGuide
        visible={showGlowGuide}
        onClose={() => setShowGlowGuide(false)}
      />

      <ProximityModal
        visible={showProximityFilter}
        onClose={() => setShowProximityFilter(false)}
        radius={tempProximityRadius}
        onRadiusChange={setTempProximityRadius}
        onApply={() => saveProximityRadius(tempProximityRadius)}
        driversCount={driversWithinRadius}
      />

      {/* FULL SCREEN MAP */}
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
              strokeColor="rgba(24, 59, 92, 0.3)"
              fillColor="rgba(24, 59, 92, 0.05)"
              strokeWidth={1}
            />
          )}

          {pickup &&
            filteredDrivers.map((driver) => (
              <Marker
                key={driver.driver_id}
                coordinate={{
                  latitude: driver.latitude,
                  longitude: driver.longitude,
                }}
              >
                <View style={styles.driverMarker}>
                  <Ionicons name="car" size={10} color="#FFF" />
                </View>
              </Marker>
            ))}

          {pickup && (
            <Marker coordinate={pickup}>
              <View style={styles.pickupMarker}>
                <Ionicons name="location" size={10} color="#FFF" />
              </View>
            </Marker>
          )}

          {dropoff && (
            <Marker coordinate={dropoff}>
              <View style={styles.dropoffMarker}>
                <Ionicons name="flag" size={10} color="#FFF" />
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

        <TouchableOpacity
          style={[
            styles.mapCurrentLocationButton,
            { top: insets.top + scale(12), bottom: undefined },
          ]}
          onPress={() => {
            trackUserAction();
            if (userLocation) {
              mapRef.current?.animateToRegion(
                {
                  ...userLocation,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                },
                500,
              );
            }
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="locate" size={moderateScale(20)} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* DRAGGABLE BOTTOM SHEET - FIXED FOR ANDROID */}
      <Animated.View
        style={[
          styles.draggableSheet,
          {
            top: sheetTopAnim,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <View style={styles.sheetHandleWrap} {...panResponder.panHandlers}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={toggleSheet}
            style={styles.sheetHandleButton}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetHandleText}>Drag or tap to resize</Text>
          </TouchableOpacity>
        </View>

        {/* Fixed KeyboardAvoidingView for Android */}
        {Platform.OS === "ios" ? (
          <KeyboardAvoidingView
            behavior="padding"
            style={styles.sheetContentWrapper}
            keyboardVerticalOffset={0}
          >
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
              {/* Content */}
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
                    <View style={styles.filterIconContainer}>
                      <Ionicons
                        name="options-outline"
                        size={moderateScale(16)}
                        color="#183B5C"
                      />
                      {proximityRadius === 0.1 && (
                        <View style={styles.activeFilterDot} />
                      )}
                    </View>

                    <Text style={styles.filterText}>
                      {proximityRadius.toFixed(1)}km
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

              {/* Pickup */}
              <Animated.View
                style={{ transform: [{ translateX: shakeAnimPickup }] }}
              >
                <LocationCard
                  icon="location"
                  iconColor="#10B981"
                  label="PICKUP"
                  placeholder="📍 Where should we pick you up?"
                  value={pickupText}
                  details={pickupDetails}
                  onDetailsChange={setPickupDetails}
                  onPress={() => handleSelectOnMap("pickup")}
                  onCurrentLocation={handleUseCurrentLocation}
                  showCurrentLocation
                  trackUserAction={trackUserAction}
                />
              </Animated.View>

              {/* Dropoff */}
              <Animated.View
                style={{ transform: [{ translateX: shakeAnimDropoff }] }}
              >
                <LocationCard
                  icon="flag"
                  iconColor="#EF4444"
                  label="DROPOFF"
                  placeholder="🎯 Where are you going?"
                  value={dropoffText}
                  details={dropoffDetails}
                  onDetailsChange={setDropoffDetails}
                  onPress={() => handleSelectOnMap("dropoff")}
                  showCurrentLocation={false}
                  trackUserAction={trackUserAction}
                />
              </Animated.View>

              <View style={styles.instructionContainer}>
                <Ionicons
                  name="information-circle-outline"
                  size={moderateScale(13)}
                  color="#9CA3AF"
                />
                <Text style={styles.instructionText}>
                  ✨ Tap on any glowing box above to choose your location from
                  the map
                </Text>
              </View>

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
                          size={moderateScale(13)}
                          color={
                            recent.type === "pickup" ? "#10B981" : "#EF4444"
                          }
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

              {pickup && dropoff && estimatedDistance && (
                <TripSummaryCard
                  distance={estimatedDistance}
                  time={estimatedTime}
                  passengers={passengerCount}
                  fare={estimatedFare}
                  appFee={fareSettings.appFee}
                />
              )}

              <View style={styles.helpContainer}>
                <Text style={styles.helpText}>
                  💡 Tip: Drag this panel down to see more of the map
                </Text>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        ) : (
          // Android: Use regular View instead of KeyboardAvoidingView
          <View style={styles.sheetContentWrapper}>
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
              {/* Same content as above */}
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
                    <View style={styles.filterIconContainer}>
                      <Ionicons
                        name="options-outline"
                        size={moderateScale(16)}
                        color="#183B5C"
                      />
                      {proximityRadius === 0.1 && (
                        <View style={styles.activeFilterDot} />
                      )}
                    </View>

                    <Text style={styles.filterText}>
                      {proximityRadius.toFixed(1)}km
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

              {/* Pickup */}
              <Animated.View
                style={{ transform: [{ translateX: shakeAnimPickup }] }}
              >
                <LocationCard
                  icon="location"
                  iconColor="#10B981"
                  label="PICKUP"
                  placeholder="📍 Where should we pick you up?"
                  value={pickupText}
                  details={pickupDetails}
                  onDetailsChange={setPickupDetails}
                  onPress={() => handleSelectOnMap("pickup")}
                  onCurrentLocation={handleUseCurrentLocation}
                  showCurrentLocation
                  trackUserAction={trackUserAction}
                />
              </Animated.View>

              {/* Dropoff */}
              <Animated.View
                style={{ transform: [{ translateX: shakeAnimDropoff }] }}
              >
                <LocationCard
                  icon="flag"
                  iconColor="#EF4444"
                  label="DROPOFF"
                  placeholder="🎯 Where are you going?"
                  value={dropoffText}
                  details={dropoffDetails}
                  onDetailsChange={setDropoffDetails}
                  onPress={() => handleSelectOnMap("dropoff")}
                  showCurrentLocation={false}
                  trackUserAction={trackUserAction}
                />
              </Animated.View>

              <View style={styles.instructionContainer}>
                <Ionicons
                  name="information-circle-outline"
                  size={moderateScale(13)}
                  color="#9CA3AF"
                />
                <Text style={styles.instructionText}>
                  ✨ Tap on any glowing box above to choose your location from
                  the map
                </Text>
              </View>

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
                          size={moderateScale(13)}
                          color={
                            recent.type === "pickup" ? "#10B981" : "#EF4444"
                          }
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

              {pickup && dropoff && estimatedDistance && (
                <TripSummaryCard
                  distance={estimatedDistance}
                  time={estimatedTime}
                  passengers={passengerCount}
                  fare={estimatedFare}
                  appFee={fareSettings.appFee}
                />
              )}

              <View style={styles.helpContainer}>
                <Text style={styles.helpText}>
                  💡 Tip: Drag this panel down to see more of the map
                </Text>
              </View>
            </ScrollView>
          </View>
        )}
      </Animated.View>

      {/* Wrapper for floating buttons to ensure proper positioning on Android */}

      <FloatingActionButtons
        onScan={openScanner}
        onFind={handleBookRide}
        disabled={!isPickupValid || !isDropoffValid}
        trackUserAction={trackUserAction}
        visible={shouldShowButtonsFixed}
      />
    </View>
  );
}

// ==================== RESPONSIVE STYLES ====================
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

  fullMapContainer: {
    ...StyleSheet.absoluteFillObject,
  },

  fullMap: {
    flex: 1,
  },

  mapCurrentLocationButton: {
    position: "absolute",
    right: scale(14),
    backgroundColor: "#183B5C",
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: moderateScale(14),
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1,
    borderColor: "#F0F0F0",
    zIndex: 20,
  },

  driverMarker: {
    backgroundColor: "#3B82F6",
    padding: moderateScale(5),
    borderRadius: moderateScale(10),
    borderWidth: 1.5,
    borderColor: "#FFF",
  },

  pickupMarker: {
    backgroundColor: "#10B981",
    padding: moderateScale(5),
    borderRadius: moderateScale(10),
    borderWidth: 1.5,
    borderColor: "#FFF",
  },

  dropoffMarker: {
    backgroundColor: "#EF4444",
    padding: moderateScale(5),
    borderRadius: moderateScale(10),
    borderWidth: 1.5,
    borderColor: "#FFF",
  },

  draggableSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFF",
    borderTopLeftRadius: moderateScale(24),
    borderTopRightRadius: moderateScale(24),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 12,
    overflow: "hidden",
  },

  sheetHandleWrap: {
    paddingTop: moderateVerticalScale(8),
    paddingBottom: moderateVerticalScale(6),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF",
  },

  sheetHandleButton: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },

  sheetHandle: {
    width: scale(42),
    height: 5,
    borderRadius: 999,
    backgroundColor: "#D1D5DB",
    marginBottom: 6,
  },

  sheetHandleText: {
    fontSize: rf(10),
    color: "#9CA3AF",
    fontWeight: "500",
  },

  sheetContentWrapper: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: scale(18),
    paddingTop: moderateVerticalScale(12),
  },

  headerSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: moderateVerticalScale(16),
  },

  greeting: {
    fontSize: rf(13),
    color: "#6B7280",
    marginBottom: 2,
  },

  greetingName: {
    fontSize: rf(22),
    fontWeight: "600",
    color: "#111827",
  },

  filterButton: {
    flexDirection: "column",
    alignItems: "flex-end",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: scale(11),
    paddingVertical: moderateVerticalScale(7),
    borderRadius: moderateScale(18),
    gap: 3,
    minWidth: scale(82),
  },

  filterButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(5),
  },

  filterIconContainer: {
    position: "relative",
  },

  activeFilterDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: moderateScale(7),
    height: moderateScale(7),
    borderRadius: moderateScale(3.5),
    backgroundColor: "#10B981",
    borderWidth: 1,
    borderColor: "#FFF",
  },

  filterText: {
    fontSize: rf(13),
    fontWeight: "600",
    color: "#183B5C",
  },

  proximityIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(3),
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    paddingHorizontal: scale(7),
    paddingVertical: 2,
    borderRadius: moderateScale(10),
  },

  proximityIndicatorText: {
    fontSize: rf(9),
    fontWeight: "500",
    color: "#10B981",
  },

  locationCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FFF",
    borderRadius: moderateScale(14),
    padding: scale(13),
    marginBottom: moderateVerticalScale(10),
    borderWidth: 1.5,
    borderColor: "#F3F4F6",
    position: "relative",
    overflow: "hidden",
    minHeight: moderateVerticalScale(72),
  },

  locationCardActive: {
    borderColor: "#183B5C",
    shadowColor: "#183B5C",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },

  locationCardPressed: {
    backgroundColor: "#F9FAFB",
  },

  locationCardEmpty: {
    borderColor: "transparent",
  },

  glowBorder: {
    position: "absolute",
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: moderateScale(16),
    borderWidth: 2,
    zIndex: 0,
  },

  glowBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: moderateScale(14),
    zIndex: 0,
  },

  outerGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: moderateScale(18),
    zIndex: -1,
    opacity: 0.1,
  },

  locationIconContainer: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(20),
    justifyContent: "center",
    alignItems: "center",
    marginRight: scale(10),
    zIndex: 1,
  },

  locationContent: {
    flex: 1,
    paddingRight: scale(28),
    zIndex: 1,
  },

  locationLabel: {
    fontSize: rf(10),
    fontWeight: "600",
    color: "#9CA3AF",
    letterSpacing: 0.5,
    marginBottom: 3,
  },

  locationLabelActive: {
    color: "#183B5C",
  },

  locationValue: {
    fontSize: rf(14),
    fontWeight: "500",
    color: "#111827",
    marginBottom: 3,
  },

  locationPlaceholder: {
    color: "#9CA3AF",
    fontWeight: "400",
  },

  locationDetails: {
    fontSize: rf(12),
    color: "#6B7280",
    paddingTop: moderateVerticalScale(7),
    marginTop: 3,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },

  currentLocationButton: {
    position: "absolute",
    right: scale(36),
    top: scale(12),
    zIndex: 2,
  },

  currentLocationGlow: {
    padding: moderateScale(7),
    borderRadius: moderateScale(18),
    backgroundColor: "#FFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },

  chevronContainer: {
    position: "absolute",
    right: scale(12),
    top: moderateVerticalScale(26),
    zIndex: 2,
  },

  tapHintContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },

  tapHint: {
    fontSize: rf(10),
  },

  tapBadge: {
    position: "absolute",
    right: scale(10),
    bottom: scale(10),
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: scale(9),
    paddingVertical: 4,
    borderRadius: moderateScale(12),
    gap: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 2,
  },

  tapBadgeText: {
    fontSize: rf(9),
    color: "#FFF",
    fontWeight: "700",
  },

  pulsingDot: {
    position: "absolute",
    top: 18,
    right: 18,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    zIndex: 3,
  },

  instructionContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(5),
    backgroundColor: "#F3F4F6",
    paddingHorizontal: scale(11),
    paddingVertical: moderateVerticalScale(9),
    borderRadius: moderateScale(10),
    marginBottom: moderateVerticalScale(14),
  },

  instructionText: {
    fontSize: rf(10),
    color: "#6B7280",
    flex: 1,
  },

  passengerCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: moderateScale(14),
    marginBottom: moderateVerticalScale(14),
    borderWidth: 1,
    borderColor: "#F3F4F6",
    overflow: "hidden",
  },

  passengerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: scale(14),
  },

  passengerHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(7),
  },

  passengerHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(7),
  },

  passengerTitle: {
    fontSize: rf(13),
    fontWeight: "500",
    color: "#111827",
  },

  passengerCountText: {
    fontSize: rf(15),
    fontWeight: "600",
    color: "#183B5C",
  },

  passengerControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: scale(28),
    paddingVertical: moderateVerticalScale(14),
    paddingHorizontal: scale(14),
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },

  passengerControl: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: moderateScale(22),
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
    fontSize: rf(26),
    fontWeight: "600",
    color: "#183B5C",
    minWidth: moderateScale(44),
    textAlign: "center",
  },

  recentSection: {
    marginBottom: moderateVerticalScale(14),
  },

  sectionTitle: {
    fontSize: rf(12),
    fontWeight: "500",
    color: "#6B7280",
    marginBottom: moderateVerticalScale(10),
  },

  recentChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: scale(12),
    paddingVertical: moderateVerticalScale(7),
    borderRadius: moderateScale(18),
    marginRight: scale(7),
    gap: scale(5),
  },

  recentChipText: {
    fontSize: rf(12),
    color: "#374151",
    maxWidth: scale(90),
  },

  summaryCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: moderateScale(14),
    padding: scale(14),
    marginBottom: moderateVerticalScale(14),
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },

  summaryMetrics: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: moderateVerticalScale(14),
  },

  metricItem: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },

  metricValue: {
    fontSize: rf(16),
    fontWeight: "600",
    color: "#111827",
  },

  metricLabel: {
    fontSize: rf(10),
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
    paddingTop: moderateVerticalScale(10),
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },

  fareLabel: {
    fontSize: rf(13),
    color: "#6B7280",
  },

  fareAmount: {
    fontSize: rf(22),
    fontWeight: "700",
    color: "#183B5C",
  },

  helpContainer: {
    alignItems: "center",
    paddingVertical: moderateVerticalScale(10),
  },

  helpText: {
    fontSize: rf(10),
    color: "#9CA3AF",
    textAlign: "center",
  },

  alertOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },

  alertContainer: {
    backgroundColor: "#FFF",
    borderRadius: moderateScale(22),
    padding: scale(22),
    width: SCREEN_WIDTH - scale(40),
    maxWidth: moderateScale(340),
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },

  alertIconContainer: {
    width: moderateScale(70),
    height: moderateScale(70),
    borderRadius: moderateScale(35),
    justifyContent: "center",
    alignItems: "center",
    marginBottom: moderateVerticalScale(16),
  },

  alertTitle: {
    fontSize: rf(18),
    fontWeight: "600",
    color: "#111827",
    marginBottom: 7,
    textAlign: "center",
  },

  alertMessage: {
    fontSize: rf(13),
    color: "#6B7280",
    textAlign: "center",
    marginBottom: moderateVerticalScale(20),
    lineHeight: rf(18),
  },

  alertButtons: {
    flexDirection: "row",
    gap: scale(10),
    width: "100%",
  },

  alertButton: {
    flex: 1,
    paddingVertical: moderateVerticalScale(11),
    borderRadius: moderateScale(11),
    alignItems: "center",
  },

  alertCancelButton: {
    backgroundColor: "#F3F4F6",
  },

  alertCancelText: {
    color: "#6B7280",
    fontSize: rf(14),
    fontWeight: "600",
  },

  alertConfirmButton: {
    backgroundColor: "#183B5C",
  },

  alertConfirmText: {
    color: "#FFF",
    fontSize: rf(14),
    fontWeight: "600",
  },

  toastContainer: {
    position: "absolute",
    bottom: moderateVerticalScale(96),
    left: scale(16),
    right: scale(16),
    flexDirection: "row",
    alignItems: "center",
    gap: scale(10),
    paddingHorizontal: scale(14),
    paddingVertical: moderateVerticalScale(11),
    borderRadius: moderateScale(11),
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
    fontSize: rf(13),
    fontWeight: "500",
  },

  radiusOptionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: scale(10),
    marginBottom: moderateVerticalScale(20),
  },

  radiusOptionChip: {
    flex: 1,
    minWidth: "22%",
    paddingVertical: moderateVerticalScale(11),
    backgroundColor: "#F3F4F6",
    borderRadius: moderateScale(11),
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  radiusOptionChipActive: {
    backgroundColor: "#183B5C",
    borderColor: "#183B5C",
    shadowColor: "#183B5C",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },

  radiusOptionText: {
    fontSize: rf(13),
    color: "#374151",
    fontWeight: "500",
  },

  radiusOptionTextActive: {
    color: "#FFF",
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
    borderTopLeftRadius: moderateScale(22),
    borderTopRightRadius: moderateScale(22),
    paddingHorizontal: scale(18),
    paddingTop: moderateVerticalScale(10),
    paddingBottom: moderateVerticalScale(32),
  },

  modalHandle: {
    width: scale(36),
    height: 4,
    backgroundColor: "#E5E7EB",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: moderateVerticalScale(14),
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: moderateVerticalScale(20),
  },

  modalTitle: {
    fontSize: rf(18),
    fontWeight: "600",
    color: "#111827",
  },

  modalClose: {
    padding: 4,
  },

  radiusDisplay: {
    alignItems: "center",
    marginBottom: moderateVerticalScale(20),
  },

  radiusValue: {
    fontSize: rf(50),
    fontWeight: "700",
    color: "#183B5C",
  },

  radiusUnit: {
    fontSize: rf(14),
    color: "#9CA3AF",
    marginTop: -6,
  },

  driverStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: scale(7),
    backgroundColor: "#F9FAFB",
    paddingVertical: moderateVerticalScale(11),
    borderRadius: moderateScale(11),
    marginBottom: moderateVerticalScale(20),
  },

  driverStatsText: {
    fontSize: rf(13),
    color: "#6B7280",
  },

  applyButton: {
    backgroundColor: "#183B5C",
    paddingVertical: moderateVerticalScale(15),
    borderRadius: moderateScale(14),
    alignItems: "center",
  },

  applyButtonText: {
    color: "#FFF",
    fontSize: rf(15),
    fontWeight: "600",
  },

  scannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: scale(18),
    paddingBottom: moderateVerticalScale(16),
    backgroundColor: "#000",
  },

  scannerBackButton: {
    width: moderateScale(38),
    height: moderateScale(38),
    borderRadius: moderateScale(19),
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },

  scannerTitle: {
    fontSize: rf(17),
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
    width: scale(220),
    height: scale(220),
    position: "relative",
  },

  scanCorner: {
    position: "absolute",
    width: scale(36),
    height: scale(36),
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
    fontSize: rf(13),
    marginTop: moderateVerticalScale(26),
    textAlign: "center",
  },

  glowGuideContainer: {
    position: "absolute",
    top: moderateVerticalScale(90),
    left: scale(16),
    right: scale(16),
    zIndex: 1000,
  },

  glowGuide: {
    backgroundColor: "#183B5C",
    borderRadius: moderateScale(14),
    padding: scale(12),
    flexDirection: "row",
    alignItems: "center",
    gap: scale(10),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },

  glowGuideText: {
    flex: 1,
    color: "#FFF",
    fontSize: rf(12),
    lineHeight: rf(17),
    fontWeight: "500",
  },

  glowGuideClose: {
    padding: 4,
  },

  floatingActionContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "transparent",
    zIndex: 100,
    elevation: 10, // Added for Android
  },

  floatingActionButtons: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.97)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: "#F0F0F0",
    marginBottom: 70,
  },
  floatingActionContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 999,
    elevation: 999,
  },

  floatingActionButtons: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.96)",
    marginHorizontal: scale(2),
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 10,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },

  floatingActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },

  floatingActionButtonPrimary: {
    backgroundColor: "#183B5C",
  },

  floatingActionButtonDisabled: {
    opacity: 0.45,
  },

  floatingActionIconWrapper: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
  },

  floatingActionIconWrapperPrimary: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },

  floatingActionTextContainer: {
    flex: 1,
  },

  floatingActionTitle: {
    color: "#111827",
    fontWeight: "700",
  },

  floatingActionTitleLight: {
    color: "#FFFFFF",
  },

  floatingActionSubtitle: {
    color: "#6B7280",
    fontWeight: "500",
    marginTop: 1,
  },

  floatingActionSubtitleLight: {
    color: "rgba(255,255,255,0.82)",
  },
});
