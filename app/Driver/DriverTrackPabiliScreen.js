// DriverTrackPabiliScreen.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Animated,
  Dimensions,
  Platform,
  Linking,
  ScrollView,
  PanResponder,
  Image,
  TextInput,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { useFocusEffect, useRoute, useNavigation } from "@react-navigation/native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
const isTablet = screenWidth >= 768;
const isSmallDevice = screenWidth <= 375;

const responsiveScale = (size) => {
  const baseWidth = 390;
  const scale = screenWidth / baseWidth;
  const scaled = Math.round(size * scale);
  return Math.max(size * 0.8, Math.min(scaled, size * 1.2));
};

const COLORS = {
  navy: "#0F2744",
  navyLight: "#183B5C",
  navyMid: "#1E4976",
  orange: "#F97316",
  orangeDark: "#EA580C",
  orangeSoft: "#FFF7ED",
  green: "#10B981",
  greenDark: "#059669",
  greenSoft: "#ECFDF5",
  red: "#EF4444",
  redDark: "#DC2626",
  redSoft: "#FEF2F2",
  blue: "#2563EB",
  blueSoft: "#EFF6FF",
  white: "#FFFFFF",
  pageBg: "#EEF2F7",
  cardBg: "#FFFFFF",
  gray50: "#F8FAFC",
  gray100: "#F1F5F9",
  gray200: "#E2E8F0",
  gray300: "#CBD5E1",
  gray400: "#94A3B8",
  gray500: "#64748B",
  gray600: "#475569",
  gray700: "#334155",
  gray800: "#1E293B",
  gray900: "#0F172A",
  overlay: "rgba(15, 23, 42, 0.78)",
};

const FONT = {
  xs: responsiveScale(11),
  sm: responsiveScale(13),
  md: responsiveScale(15),
  lg: responsiveScale(17),
  xl: responsiveScale(20),
  xxl: responsiveScale(24),
};

const SPACING = {
  xs: responsiveScale(4),
  sm: responsiveScale(8),
  md: responsiveScale(12),
  lg: responsiveScale(16),
  xl: responsiveScale(20),
  xxl: responsiveScale(28),
  xxxl: responsiveScale(36),
};

const BR = {
  sm: responsiveScale(8),
  md: responsiveScale(12),
  lg: responsiveScale(16),
  xl: responsiveScale(24),
  xxl: responsiveScale(30),
};

const DEFAULT_REGION = {
  latitude: 14.5995,
  longitude: 120.9842,
  latitudeDelta: isTablet ? 0.03 : 0.05,
  longitudeDelta: isTablet ? 0.03 : 0.05,
};

const CANCEL_REASONS = [
  "Customer is unresponsive",
  "Store is closed",
  "Item is unavailable",
  "Vehicle problem / emergency",
];

function log(label, data = null) {
  if (data !== null && data !== undefined) {
    console.log("[DriverTrackPabiliScreen]", label, data);
  } else {
    console.log("[DriverTrackPabiliScreen]", label);
  }
}

function normalizeSupabaseImageUrl(url) {
  if (!url) return null;

  let cleaned = String(url).trim();

  cleaned = cleaned.replace(/[?&](t|thumb|preview|v)=\d+/g, "");
  cleaned = cleaned.replace(
    "/storage/v1/object/public/booking-proofs/booking-proofs/",
    "/storage/v1/object/public/booking-proofs/"
  );

  return cleaned;
}

function getImageDebugInfo(url) {
  const normalized = normalizeSupabaseImageUrl(url);
  const safeUrl = String(url || "");

  return {
    exists: !!safeUrl,
    length: safeUrl.length,
    hasQuery: safeUrl.includes("?"),
    startsWithHttp: safeUrl.startsWith("http"),
    looksLikeSupabase: safeUrl.includes("/storage/v1/object/public/"),
    hasDoubleBucket: safeUrl.includes("/booking-proofs/booking-proofs/"),
    cleaned: normalized,
  };
}

function formatAmount(value) {
  return `₱${Number(value || 0).toFixed(2)}`;
}

function parsePabiliItems(booking) {
  const raw =
    booking?.items ||
    booking?.item_list ||
    booking?.item_description ||
    booking?.item_name ||
    "";

  if (Array.isArray(raw)) {
    return raw
      .map((item, index) => ({
        id: String(item?.id || index),
        name: String(item?.name || item?.item_name || item?.label || "Unnamed item").trim(),
        qty: Number(item?.qty || item?.quantity || 1),
        note: String(item?.note || item?.description || "").trim(),
      }))
      .filter((item) => item.name);
  }

  const text = String(raw || "").trim();
  if (!text) return [];

  const lines = text
    .split(/\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, index) => {
    const qtyMatch =
      line.match(/(?:qty|quantity|x)\s*[:\-]?\s*(\d+)/i) ||
      line.match(/^(\d+)\s*x\s+/i) ||
      line.match(/\b(\d+)\s*(pcs|pc|piece|pieces|bottle|pack|order|orders)\b/i);

    let qty = qtyMatch ? Number(qtyMatch[1]) : 1;

    let cleanedName = line
      .replace(/(?:qty|quantity)\s*[:\-]?\s*\d+/gi, "")
      .replace(/^\d+\s*x\s+/i, "")
      .replace(/\b\d+\s*(pcs|pc|piece|pieces|bottle|pack|order|orders)\b/gi, "")
      .replace(/[-–•]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleanedName) cleanedName = `Item ${index + 1}`;

    return {
      id: String(index),
      name: cleanedName,
      qty,
      note: "",
    };
  });
}

function getPabiliPhase(booking) {
  if (!booking) return "heading_to_store";

  const serviceStatus = String(booking.service_status || "").toLowerCase().trim();
  const bookingStatus = String(booking.status || "").toLowerCase().trim();

  if (bookingStatus === "completed" || serviceStatus === "completed") return "completed";
  if (booking.delivered_at || serviceStatus === "delivered") return "delivered";
  if (serviceStatus === "in_transit") return "delivering";
  if (serviceStatus === "purchased") return "purchased";
  if (booking.purchased_at && serviceStatus !== "picked_up") return "purchased";
  if (serviceStatus === "purchasing") return "purchasing";
  if (serviceStatus === "picked_up") return "arrived_at_store";

  return "heading_to_store";
}

const PHASE_META = {
  heading_to_store: {
    subtitle: "Assigned Pabili",
    title: "Heading to store",
    color: COLORS.orange,
    chipLabel: "To store",
    polylineColor: COLORS.orange,
  },
  arrived_at_store: {
    subtitle: "At Store",
    title: "Ready to buy item",
    color: COLORS.orangeDark,
    chipLabel: "At store",
    polylineColor: COLORS.orangeDark,
  },
  purchasing: {
    subtitle: "Purchasing",
    title: "Buying requested items",
    color: COLORS.orangeDark,
    chipLabel: "Buying",
    polylineColor: COLORS.orangeDark,
  },
  purchased: {
    subtitle: "Purchased",
    title: "Ready for delivery",
    color: COLORS.green,
    chipLabel: "Purchased",
    polylineColor: COLORS.green,
  },
  delivering: {
    subtitle: "On the Way",
    title: "Heading to customer",
    color: COLORS.navyLight,
    chipLabel: "To customer",
    polylineColor: COLORS.navyLight,
  },
  delivered: {
    subtitle: "Delivered",
    title: "Ready to complete",
    color: COLORS.greenDark,
    chipLabel: "Delivered",
    polylineColor: COLORS.greenDark,
  },
  completed: {
    subtitle: "Completed",
    title: "Pabili completed",
    color: COLORS.greenDark,
    chipLabel: "Completed",
    polylineColor: COLORS.greenDark,
  },
};

function Header({ insets, navigation, subtitle, title, statusColor, isPaid }) {
  const handleGoBack = useCallback(() => {
    try {
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate("DriverHomeRequestsScreen");
      }
    } catch (error) {
      navigation.navigate("DriverHomeRequestsScreen");
    }
  }, [navigation]);

  return (
    <LinearGradient
      colors={[COLORS.navy, COLORS.navyMid]}
      style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}
    >
      <Pressable style={styles.headerIconBtn} onPress={handleGoBack}>
        <Ionicons name="arrow-back" size={responsiveScale(22)} color={COLORS.white} />
      </Pressable>

      <View style={styles.headerCenter}>
        <View style={styles.headerSubRow}>
          <View style={[styles.headerStatusDot, { backgroundColor: statusColor }]} />
          <Text style={styles.headerSub}>{subtitle}</Text>
        </View>

        <Text numberOfLines={1} style={styles.headerTitle}>
          {title}
        </Text>
      </View>

      <View
        style={[
          styles.paymentBadge,
          { backgroundColor: isPaid ? COLORS.greenSoft : COLORS.orangeSoft },
        ]}
      >
        <Ionicons
          name={isPaid ? "checkmark-circle" : "time-outline"}
          size={responsiveScale(16)}
          color={isPaid ? COLORS.green : COLORS.orange}
        />
        <Text
          style={[
            styles.paymentBadgeText,
            { color: isPaid ? COLORS.green : COLORS.orange },
          ]}
        >
          {isPaid ? "Paid" : "Pending"}
        </Text>
      </View>
    </LinearGradient>
  );
}

function DriverMapMarker() {
  return (
    <View style={styles.driverMarker}>
      <Ionicons name="bicycle-outline" size={responsiveScale(18)} color={COLORS.white} />
    </View>
  );
}

function LocationPin({ type = "store" }) {
  const bg = type === "store" ? COLORS.orange : COLORS.green;
  const icon = type === "store" ? "storefront-outline" : "home-outline";

  return (
    <View style={[styles.pinWrap, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={responsiveScale(15)} color={COLORS.white} />
    </View>
  );
}

function SummaryBar({ timeText, distanceText, totalText }) {
  return (
    <View style={styles.summaryBar}>
      <View style={styles.summaryItem}>
        <Ionicons name="time-outline" size={responsiveScale(16)} color={COLORS.navyLight} />
        <Text style={styles.summaryText}>{timeText}</Text>
      </View>

      <View style={styles.summaryDivider} />

      <View style={styles.summaryItem}>
        <Ionicons name="map-outline" size={responsiveScale(16)} color={COLORS.navyLight} />
        <Text style={styles.summaryText}>{distanceText}</Text>
      </View>

      <View style={styles.summaryDivider} />

      <View style={styles.summaryItem}>
        <Ionicons name="cash-outline" size={responsiveScale(16)} color={COLORS.greenDark} />
        <Text style={[styles.summaryText, { color: COLORS.greenDark, fontWeight: "800" }]}>
          {totalText}
        </Text>
      </View>
    </View>
  );
}

function StepBar({ phase }) {
  const steps = [
    { label: "Store", phase: "heading_to_store", icon: "storefront-outline" },
    { label: "At Store", phase: "arrived_at_store", icon: "location-outline" },
    { label: "Purchased", phase: "purchased", icon: "bag-check-outline" },
    { label: "Delivering", phase: "delivering", icon: "navigate-outline" },
    { label: "Done", phase: "delivered", icon: "checkmark-circle-outline" },
  ];

  const order = [
    "heading_to_store",
    "arrived_at_store",
    "purchasing",
    "purchased",
    "delivering",
    "delivered",
    "completed",
  ];

  const currentIndex = order.indexOf(phase);

  return (
    <View style={styles.stepBar}>
      {steps.map((step, index) => {
        const stepIndex = order.indexOf(step.phase);
        const done = stepIndex <= currentIndex;
        const active = stepIndex === currentIndex;

        return (
          <View key={step.label} style={styles.stepItem}>
            <View
              style={[
                styles.stepCircle,
                done && styles.stepCircleDone,
                active && styles.stepCircleActive,
              ]}
            >
              <Ionicons
                name={step.icon}
                size={responsiveScale(14)}
                color={done ? COLORS.white : COLORS.gray400}
              />
            </View>

            <Text style={[styles.stepLabel, done && styles.stepLabelDone]}>{step.label}</Text>

            {index < steps.length - 1 && (
              <View style={[styles.stepConnector, done && styles.stepConnectorDone]} />
            )}
          </View>
        );
      })}
    </View>
  );
}

function ModernAlert({
  visible,
  title,
  message,
  type = "info",
  confirmText = "OK",
  cancelText,
  onClose,
  onConfirm,
}) {
  const slide = useRef(new Animated.Value(40)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slide, {
          toValue: 0,
          useNativeDriver: true,
          damping: 18,
          stiffness: 220,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      slide.setValue(40);
      opacity.setValue(0);
    }
  }, [visible, opacity, slide]);

  const cfg = {
    success: { icon: "checkmark-circle", color: COLORS.green, bg: "#ECFDF5" },
    error: { icon: "close-circle", color: COLORS.red, bg: "#FEF2F2" },
    warning: { icon: "alert-circle", color: COLORS.orange, bg: "#FFF7ED" },
    info: { icon: "information-circle", color: COLORS.navyLight, bg: "#EFF6FF" },
  }[type] || { icon: "information-circle", color: COLORS.navyLight, bg: "#EFF6FF" };

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <BlurView intensity={20} style={styles.alertOverlay}>
        <Animated.View style={[styles.alertWrap, { opacity }]}>
          <Animated.View style={[styles.alertCard, { transform: [{ translateY: slide }] }]}>
            <View style={[styles.alertIconBox, { backgroundColor: cfg.bg }]}>
              <Ionicons name={cfg.icon} size={responsiveScale(38)} color={cfg.color} />
            </View>

            <Text style={styles.alertTitle}>{title}</Text>
            <Text style={styles.alertMessage}>{message}</Text>

            <View style={styles.alertBtns}>
              {!!cancelText && (
                <Pressable style={styles.alertSecondaryBtn} onPress={onClose}>
                  <Text style={styles.alertSecondaryText}>{cancelText}</Text>
                </Pressable>
              )}

              <Pressable
                style={[styles.alertPrimaryBtn, { backgroundColor: cfg.color }]}
                onPress={onConfirm || onClose}
              >
                <Text style={styles.alertPrimaryText}>{confirmText}</Text>
              </Pressable>
            </View>
          </Animated.View>
        </Animated.View>
      </BlurView>
    </Modal>
  );
}

function ActionButton({ label, icon, onPress, color, disabled = false }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionBtn,
        { backgroundColor: color },
        pressed && !disabled && { opacity: 0.88, transform: [{ scale: 0.99 }] },
        disabled && { opacity: 0.45 },
      ]}
    >
      <Ionicons name={icon} size={responsiveScale(18)} color={COLORS.white} />
      <Text style={styles.actionBtnText}>{label}</Text>
    </Pressable>
  );
}

function ImagePreviewModal({ visible, imageUrl, title, onClose, onRetake }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [stablePreviewUrl, setStablePreviewUrl] = useState(null);

  useEffect(() => {
    if (!visible) {
      setImageFailed(false);
      setImageLoading(false);
      setStablePreviewUrl(null);
      return;
    }

    const cleaned = normalizeSupabaseImageUrl(imageUrl);
    const finalStableUrl = cleaned
      ? `${cleaned}${cleaned.includes("?") ? "&" : "?"}preview=${Date.now()}`
      : null;

    setImageFailed(false);
    setImageLoading(!!finalStableUrl);
    setStablePreviewUrl(finalStableUrl);

    log("ImagePreviewModal opened", {
      title,
      rawUrl: imageUrl,
      cleanedUrl: cleaned,
      finalStableUrl,
      debug: getImageDebugInfo(imageUrl),
    });
  }, [visible, imageUrl, title]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.previewOverlay}>
        <View style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle}>{title || "Image Preview"}</Text>
            <Pressable onPress={onClose} style={styles.previewCloseBtn}>
              <Ionicons name="close" size={22} color={COLORS.white} />
            </Pressable>
          </View>

          <View style={styles.previewImageWrap}>
            {!stablePreviewUrl || imageFailed ? (
              <View style={styles.previewEmpty}>
                <Ionicons name="image-outline" size={40} color={COLORS.gray400} />
                <Text style={styles.previewEmptyText}>
                  {!stablePreviewUrl ? "No image available." : "Image failed to load."}
                </Text>
              </View>
            ) : (
              <>
                <Image
                  source={{ uri: stablePreviewUrl }}
                  style={styles.previewImage}
                  resizeMode="contain"
                  fadeDuration={0}
                  onLoadStart={() => {
                    log("ImagePreviewModal onLoadStart", { stablePreviewUrl });
                    setImageLoading(true);
                  }}
                  onLoadEnd={() => {
                    log("ImagePreviewModal onLoadEnd", { stablePreviewUrl });
                    setImageLoading(false);
                  }}
                  onError={(error) => {
                    log("ImagePreviewModal onError", {
                      stablePreviewUrl,
                      error: error?.nativeEvent,
                    });
                    setImageLoading(false);
                    setImageFailed(true);
                  }}
                />

                {imageLoading && (
                  <View style={styles.previewLoader}>
                    <ActivityIndicator size="large" color={COLORS.white} />
                    <Text style={styles.previewLoaderText}>Loading image...</Text>
                  </View>
                )}
              </>
            )}
          </View>

          <View style={styles.previewActions}>
            <Pressable style={styles.previewSecondaryBtn} onPress={onClose}>
              <Text style={styles.previewSecondaryText}>Close</Text>
            </Pressable>

            <Pressable style={styles.previewPrimaryBtn} onPress={onRetake}>
              <Ionicons name="camera-outline" size={18} color={COLORS.white} />
              <Text style={styles.previewPrimaryText}>Re-upload</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DetailPill({ icon, label, value, tint = COLORS.navyLight }) {
  return (
    <View style={styles.detailPill}>
      <View style={[styles.detailPillIcon, { backgroundColor: `${tint}12` }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <View style={styles.detailPillTextWrap}>
        <Text style={styles.detailPillLabel}>{label}</Text>
        <Text style={styles.detailPillValue} numberOfLines={2}>
          {value || "-"}
        </Text>
      </View>
    </View>
  );
}

function ProofStatusCard({ title, uploaded, icon, tint, onCapture, onView, uploading }) {
  return (
    <View style={styles.proofStatusCard}>
      <View style={styles.proofStatusTop}>
        <View style={[styles.proofStatusIcon, { backgroundColor: `${tint}14` }]}>
          <Ionicons name={icon} size={20} color={tint} />
        </View>

        <View style={styles.proofStatusTextWrap}>
          <Text style={styles.proofStatusTitle}>{title}</Text>
          <Text style={styles.proofStatusSub}>
            {uploaded ? "Uploaded successfully" : "Required before delivery"}
          </Text>
        </View>

        <View
          style={[
            styles.proofBadge,
            { backgroundColor: uploaded ? COLORS.greenSoft : COLORS.orangeSoft },
          ]}
        >
          <Text
            style={[
              styles.proofBadgeText,
              { color: uploaded ? COLORS.greenDark : COLORS.orangeDark },
            ]}
          >
            {uploaded ? "Ready" : "Needed"}
          </Text>
        </View>
      </View>

      <View style={styles.proofStatusActions}>
        <Pressable
          style={[styles.proofActionBtn, styles.proofActionPrimary]}
          onPress={onCapture}
          disabled={uploading}
        >
          <Ionicons name="camera-outline" size={16} color={COLORS.white} />
          <Text style={styles.proofActionPrimaryText}>
            {uploading ? "Uploading..." : uploaded ? "Re-capture" : "Capture"}
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.proofActionBtn,
            styles.proofActionSecondary,
            !uploaded && styles.proofActionDisabled,
          ]}
          onPress={onView}
          disabled={!uploaded}
        >
          <Ionicons
            name="eye-outline"
            size={16}
            color={uploaded ? COLORS.gray800 : COLORS.gray400}
          />
          <Text
            style={[
              styles.proofActionSecondaryText,
              { color: uploaded ? COLORS.gray800 : COLORS.gray400 },
            ]}
          >
            View
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function ItemsPreviewCard({ items, onOpenFullDetails, notes, rawDescription }) {
  const previewItems = items.slice(0, 3);
  const extraCount = Math.max(0, items.length - 3);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardTitle}>Items to Buy</Text>
        <Pressable style={styles.linkBtn} onPress={onOpenFullDetails}>
          <Text style={styles.linkBtnText}>View All</Text>
          <Ionicons name="chevron-forward" size={14} color={COLORS.navyLight} />
        </Pressable>
      </View>

      {previewItems.length > 0 ? (
        <View style={styles.itemsPreviewList}>
          {previewItems.map((item, index) => (
            <View key={item.id || index} style={styles.itemPreviewCard}>
              <View style={styles.itemPreviewLeft}>
                <View style={styles.itemPreviewIcon}>
                  <Ionicons name="cube-outline" size={15} color={COLORS.orangeDark} />
                </View>

                <View style={styles.itemPreviewTextWrap}>
                  <Text style={styles.itemPreviewName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {!!item.note ? (
                    <Text style={styles.itemPreviewNote} numberOfLines={2}>
                      {item.note}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.qtyPill}>
                <Text style={styles.qtyPillText}>x{item.qty || 1}</Text>
              </View>
            </View>
          ))}

          {extraCount > 0 ? (
            <View style={styles.moreItemsRow}>
              <Ionicons name="add-circle-outline" size={15} color={COLORS.gray500} />
              <Text style={styles.moreItemsText}>+{extraCount} more item(s)</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.emptyItemsBox}>
          <Ionicons name="bag-outline" size={18} color={COLORS.gray400} />
          <Text style={styles.emptyItemsText}>No parsed items available</Text>
        </View>
      )}

      {!!notes ? (
        <View style={styles.inlineInfoBox}>
          <Text style={styles.inlineInfoLabel}>Notes</Text>
          <Text style={styles.inlineInfoText} numberOfLines={3}>
            {notes}
          </Text>
        </View>
      ) : null}

      {!notes && !!rawDescription && previewItems.length === 0 ? (
        <View style={styles.inlineInfoBox}>
          <Text style={styles.inlineInfoLabel}>Description</Text>
          <Text style={styles.inlineInfoText} numberOfLines={4}>
            {rawDescription}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function DetailsModal({ visible, booking, items, onClose, onCallBuyer, onOpenStore, onOpenDropoff }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.detailsOverlay}>
        <View style={styles.detailsModalCard}>
          <View style={styles.detailsHandle} />

          <View style={styles.detailsHeader}>
            <View>
              <Text style={styles.detailsTitle}>Pabili Details</Text>
              <Text style={styles.detailsSub}>Full booking information</Text>
            </View>

            <Pressable style={styles.detailsCloseBtn} onPress={onClose}>
              <Ionicons name="close" size={22} color={COLORS.gray800} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.detailsScrollContent}
          >
            <View style={styles.detailsSection}>
              <Text style={styles.detailsSectionTitle}>Quick Info</Text>

              <DetailPill
                icon="storefront-outline"
                label="Store"
                value={booking?.store_name || booking?.pickup_location || "-"}
                tint={COLORS.orangeDark}
              />
              <DetailPill
                icon="person-outline"
                label="Buyer"
                value={booking?.buyer_name || "-"}
                tint={COLORS.navyLight}
              />
              <DetailPill
                icon="call-outline"
                label="Phone"
                value={booking?.buyer_phone || "-"}
                tint={COLORS.greenDark}
              />
              <DetailPill
                icon="location-outline"
                label="Delivery Address"
                value={booking?.dropoff_location || "-"}
                tint={COLORS.redDark}
              />
            </View>

            <View style={styles.detailsSection}>
              <Text style={styles.detailsSectionTitle}>Items</Text>

              {items.length > 0 ? (
                items.map((item, index) => (
                  <View key={item.id || index} style={styles.detailItemCard}>
                    <View style={styles.detailItemLeft}>
                      <View style={styles.detailItemIcon}>
                        <Ionicons name="bag-handle-outline" size={15} color={COLORS.orangeDark} />
                      </View>
                      <View style={styles.detailItemTextWrap}>
                        <Text style={styles.detailItemName}>{item.name}</Text>
                        {!!item.note ? <Text style={styles.detailItemNote}>{item.note}</Text> : null}
                      </View>
                    </View>

                    <View style={styles.detailQtyPill}>
                      <Text style={styles.detailQtyPillText}>x{item.qty || 1}</Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyItemsBox}>
                  <Ionicons name="document-text-outline" size={18} color={COLORS.gray400} />
                  <Text style={styles.emptyItemsText}>
                    {booking?.item_description || booking?.item_name || "No item details"}
                  </Text>
                </View>
              )}
            </View>

            {!!booking?.notes ? (
              <View style={styles.detailsSection}>
                <Text style={styles.detailsSectionTitle}>Customer Notes</Text>
                <View style={styles.notesBox}>
                  <Text style={styles.notesText}>{booking.notes}</Text>
                </View>
              </View>
            ) : null}

            {!!booking?.item_description ? (
              <View style={styles.detailsSection}>
                <Text style={styles.detailsSectionTitle}>Raw Item Description</Text>
                <View style={styles.notesBox}>
                  <Text style={styles.notesText}>{booking.item_description}</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.detailsSection}>
              <Text style={styles.detailsSectionTitle}>Quick Actions</Text>

              <View style={styles.detailsActionGrid}>
                <Pressable style={styles.detailsActionBtn} onPress={onCallBuyer}>
                  <Ionicons name="call-outline" size={18} color={COLORS.navyLight} />
                  <Text style={styles.detailsActionText}>Call Buyer</Text>
                </Pressable>

                <Pressable style={styles.detailsActionBtn} onPress={onOpenStore}>
                  <Ionicons name="storefront-outline" size={18} color={COLORS.orangeDark} />
                  <Text style={styles.detailsActionText}>Open Store</Text>
                </Pressable>

                <Pressable style={styles.detailsActionBtn} onPress={onOpenDropoff}>
                  <Ionicons name="home-outline" size={18} color={COLORS.greenDark} />
                  <Text style={styles.detailsActionText}>Open Dropoff</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function CancelReasonModal({
  visible,
  reasons,
  selectedReason,
  customReason,
  onSelectReason,
  onChangeCustomReason,
  onClose,
  onSubmit,
  submitting,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.cancelReasonOverlay}>
        <View style={styles.cancelReasonCard}>
          <View style={styles.cancelReasonIconWrap}>
            <Ionicons name="close-circle-outline" size={32} color={COLORS.redDark} />
          </View>

          <Text style={styles.cancelReasonTitle}>Cancel Pabili</Text>
          <Text style={styles.cancelReasonSubtitle}>
            Please select the reason for cancellation.
          </Text>

          <View style={styles.cancelReasonList}>
            {reasons.map((reason) => {
              const active = selectedReason === reason;
              return (
                <Pressable
                  key={reason}
                  style={[
                    styles.cancelReasonOption,
                    active && styles.cancelReasonOptionActive,
                  ]}
                  onPress={() => onSelectReason(reason)}
                >
                  <View
                    style={[
                      styles.cancelReasonRadio,
                      active && styles.cancelReasonRadioActive,
                    ]}
                  >
                    {active ? <View style={styles.cancelReasonRadioInner} /> : null}
                  </View>
                  <Text
                    style={[
                      styles.cancelReasonOptionText,
                      active && styles.cancelReasonOptionTextActive,
                    ]}
                  >
                    {reason}
                  </Text>
                </Pressable>
              );
            })}

            <Pressable
              style={[
                styles.cancelReasonOption,
                selectedReason === "Others" && styles.cancelReasonOptionActive,
              ]}
              onPress={() => onSelectReason("Others")}
            >
              <View
                style={[
                  styles.cancelReasonRadio,
                  selectedReason === "Others" && styles.cancelReasonRadioActive,
                ]}
              >
                {selectedReason === "Others" ? (
                  <View style={styles.cancelReasonRadioInner} />
                ) : null}
              </View>
              <Text
                style={[
                  styles.cancelReasonOptionText,
                  selectedReason === "Others" && styles.cancelReasonOptionTextActive,
                ]}
              >
                Others
              </Text>
            </Pressable>
          </View>

          {selectedReason === "Others" ? (
            <TextInput
              value={customReason}
              onChangeText={onChangeCustomReason}
              placeholder="Type the reason here..."
              placeholderTextColor={COLORS.gray400}
              style={styles.cancelReasonInput}
              multiline
              textAlignVertical="top"
            />
          ) : null}

          <View style={styles.cancelReasonActions}>
            <Pressable style={styles.cancelReasonSecondaryBtn} onPress={onClose}>
              <Text style={styles.cancelReasonSecondaryText}>Back</Text>
            </Pressable>

            <Pressable
              style={[
                styles.cancelReasonPrimaryBtn,
                submitting && { opacity: 0.7 },
              ]}
              onPress={onSubmit}
              disabled={submitting}
            >
              <Text style={styles.cancelReasonPrimaryText}>
                {submitting ? "Cancelling..." : "Confirm Cancel"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DraggableBottomSheet({
  phaseMeta,
  primaryAction,
  canDriverCancel,
  handleCancelPabili,
  callBuyer,
  booking,
  openMaps,
  children,
}) {
  const COLLAPSED_HEIGHT = isSmallDevice ? 290 : 320;
  const EXPANDED_TOP = isSmallDevice ? 90 : 110;

  const collapsedY = screenHeight - COLLAPSED_HEIGHT;
  const expandedY = EXPANDED_TOP;

  const translateY = useRef(new Animated.Value(collapsedY)).current;
  const lastValueRef = useRef(collapsedY);
  const scrollEnabledRef = useRef(false);

  const [expanded, setExpanded] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(false);

  useEffect(() => {
    const id = translateY.addListener(({ value }) => {
      lastValueRef.current = value;
    });

    return () => {
      translateY.removeListener(id);
    };
  }, [translateY]);

  const snapTo = useCallback(
    (toValue) => {
      Animated.spring(translateY, {
        toValue,
        useNativeDriver: true,
        damping: 22,
        stiffness: 220,
        mass: 0.9,
      }).start(() => {
        const isExpanded = toValue === expandedY;
        setExpanded(isExpanded);
        setScrollEnabled(isExpanded);
        scrollEnabledRef.current = isExpanded;
      });
    },
    [expandedY, translateY]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
          if (scrollEnabledRef.current) {
            if (gesture.dy > 8) return true;
            return false;
          }
          return Math.abs(gesture.dy) > 6;
        },
        onPanResponderGrant: () => {
          translateY.stopAnimation((value) => {
            lastValueRef.current = value;
          });
        },
        onPanResponderMove: (_, gesture) => {
          let next = lastValueRef.current + gesture.dy;
          if (next < expandedY) next = expandedY;
          if (next > collapsedY) next = collapsedY;
          translateY.setValue(next);
        },
        onPanResponderRelease: (_, gesture) => {
          const currentY = lastValueRef.current + gesture.dy;
          const midpoint = (collapsedY + expandedY) / 2;

          if (gesture.vy > 0.9) {
            snapTo(collapsedY);
            return;
          }
          if (gesture.vy < -0.9) {
            snapTo(expandedY);
            return;
          }
          if (currentY < midpoint) snapTo(expandedY);
          else snapTo(collapsedY);
        },
        onPanResponderTerminate: () => {
          const current = lastValueRef.current;
          const midpoint = (collapsedY + expandedY) / 2;
          snapTo(current < midpoint ? expandedY : collapsedY);
        },
      }),
    [collapsedY, expandedY, snapTo, translateY]
  );

  return (
    <Animated.View
      style={[
        styles.bottomSheet,
        {
          transform: [{ translateY }],
          top: 0,
          bottom: 0,
        },
      ]}
    >
      <View style={styles.bottomSheetContainer}>
        <View style={styles.sheetDragArea} {...panResponder.panHandlers}>
          <View style={styles.panelHandle} />

          <View style={styles.panelHeaderRow}>
            <View style={styles.panelHeaderLeft}>
              <Text style={styles.panelHeaderTitle}>{phaseMeta.title}</Text>
              <Text style={styles.panelHeaderSub}>
                {expanded ? "Drag down to minimize" : "Drag up for more details"}
              </Text>
            </View>

            <View style={[styles.phaseChip, { backgroundColor: `${phaseMeta.color}18` }]}>
              <Text style={[styles.phaseChipText, { color: phaseMeta.color }]}>
                {phaseMeta.chipLabel}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.stickyActionsWrap}>
          {primaryAction ? (
            <ActionButton
              label={primaryAction.label}
              icon={primaryAction.icon}
              color={primaryAction.color}
              onPress={primaryAction.onPress}
            />
          ) : null}

          <View style={styles.quickMiniRow}>
            <Pressable style={styles.quickMiniBtn} onPress={callBuyer}>
              <Ionicons name="call-outline" size={16} color={COLORS.navyLight} />
              <Text style={styles.quickMiniBtnText}>Call Buyer</Text>
            </Pressable>

            <Pressable
              style={styles.quickMiniBtn}
              onPress={() =>
                openMaps(
                  Number(booking?.pickup_latitude),
                  Number(booking?.pickup_longitude),
                  booking?.store_name || "Store"
                )
              }
            >
              <Ionicons name="storefront-outline" size={16} color={COLORS.orangeDark} />
              <Text style={styles.quickMiniBtnText}>Store</Text>
            </Pressable>

            <Pressable
              style={styles.quickMiniBtn}
              onPress={() =>
                openMaps(
                  Number(booking?.dropoff_latitude),
                  Number(booking?.dropoff_longitude),
                  booking?.dropoff_location || "Dropoff"
                )
              }
            >
              <Ionicons name="home-outline" size={16} color={COLORS.greenDark} />
              <Text style={styles.quickMiniBtnText}>Dropoff</Text>
            </Pressable>
          </View>

          <Pressable
            disabled={!canDriverCancel}
            onPress={handleCancelPabili}
            style={[styles.cancelMiniBtn, !canDriverCancel && { opacity: 0.45 }]}
          >
            <Ionicons name="close-circle-outline" size={16} color={COLORS.red} />
            <Text style={[styles.cancelMiniBtnText, { color: COLORS.red }]}>
              {canDriverCancel ? "Cancel Pabili" : "Cancellation Locked"}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={scrollEnabled}
          nestedScrollEnabled
        >
          {children}
        </ScrollView>
      </View>
    </Animated.View>
  );
}

export default function DriverTrackPabiliScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const navigation = useNavigation();
  const googleApiKey = Constants.expoConfig?.extra?.GOOGLE_API_KEY;

  const bookingId = route.params?.bookingId;

  const mapRef = useRef(null);
  const locationSubscriptionRef = useRef(null);
  const bookingSubscriptionRef = useRef(null);
  const paymentSubscriptionRef = useRef(null);
  const bookingRef = useRef(null);
  const prevPaymentStatusRef = useRef(null);
  const fetchingRef = useRef(false);
  const paymentPollingRef = useRef(null);
  const pickAndUploadImageRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);

  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [estimatedTime, setEstimatedTime] = useState(null);
  const [estimatedDistance, setEstimatedDistance] = useState(null);

  const [uploadingProof, setUploadingProof] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    title: "",
    message: "",
    type: "info",
    confirmText: "OK",
    cancelText: null,
    onConfirm: null,
  });

  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewType, setPreviewType] = useState(null);

  const [detailsVisible, setDetailsVisible] = useState(false);

  const [cancelReasonVisible, setCancelReasonVisible] = useState(false);
  const [selectedCancelReason, setSelectedCancelReason] = useState("");
  const [customCancelReason, setCustomCancelReason] = useState("");
  const [submittingCancel, setSubmittingCancel] = useState(false);

  useEffect(() => {
    bookingRef.current = booking;
  }, [booking]);

  const parsedItems = useMemo(() => parsePabiliItems(booking), [booking]);

  const showAlert = useCallback((title, message, type = "info", options = {}) => {
    setAlertConfig({
      title,
      message,
      type,
      confirmText: options.confirmText || "OK",
      cancelText: options.cancelText || null,
      onConfirm: options.onConfirm || (() => setAlertVisible(false)),
    });
    setAlertVisible(true);
  }, []);

  const goToDriverHome = useCallback(() => {
    try {
      const state = navigation.getState?.();
      const routeNames = state?.routeNames || [];

      if (routeNames.includes("DriverHomeRequestsScreen")) {
        navigation.navigate("DriverHomeRequestsScreen");
        return;
      }
      if (routeNames.includes("Home")) {
        navigation.navigate("Home");
        return;
      }
      if (routeNames.includes("DriverHomePage")) {
        navigation.navigate("DriverHomePage");
        return;
      }
      if (routeNames.includes("DriverTabs")) {
        navigation.navigate("DriverTabs", { screen: "Home" });
        return;
      }
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
    } catch (error) {
      log("goToDriverHome error", error?.message || error);
    }
  }, [navigation]);

  const openMaps = useCallback((lat, lng, label) => {
    if (!lat || !lng) return;

    const safeLabel = encodeURIComponent(label || "Location");

    const url = Platform.select({
      ios: `maps://0?q=${safeLabel}&ll=${lat},${lng}`,
      android: `geo:${lat},${lng}?q=${lat},${lng}(${safeLabel})`,
      default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    });

    Linking.openURL(url).catch((error) => {
      log("openMaps error", error?.message || error);
    });
  }, []);

  const phase = useMemo(() => getPabiliPhase(booking), [booking]);
  const phaseMeta = PHASE_META[phase] || PHASE_META.heading_to_store;

  const isPaymentSuccessful = useMemo(() => {
    const status = String(booking?.payment_status || "").toLowerCase().trim();
    return ["paid", "success", "succeeded", "completed"].includes(status);
  }, [booking?.payment_status]);

  const isStorePhase = useMemo(
    () => ["heading_to_store", "arrived_at_store", "purchasing"].includes(phase),
    [phase]
  );

  const paymentBlocked = isStorePhase && !isPaymentSuccessful;

  const canDriverCancel = useMemo(() => {
    const paymentStatus = String(booking?.payment_status || "").toLowerCase().trim();
    const bookingStatus = String(booking?.status || "").toLowerCase().trim();
    const serviceStatus = String(booking?.service_status || "").toLowerCase().trim();

    const isPaid = ["paid", "success", "succeeded", "completed"].includes(paymentStatus);
    const isFinished =
      ["completed", "cancelled"].includes(bookingStatus) ||
      ["completed", "cancelled", "delivered"].includes(serviceStatus);

    return !isPaid && !isFinished;
  }, [booking]);

  const hasPurchaseProof = useMemo(
    () => !!String(booking?.purchase_proof_url || "").trim(),
    [booking?.purchase_proof_url]
  );

  const hasReceiptImage = useMemo(
    () => !!String(booking?.receipt_image_url || "").trim(),
    [booking?.receipt_image_url]
  );

  const canMarkDelivered = useMemo(
    () => hasPurchaseProof && hasReceiptImage,
    [hasPurchaseProof, hasReceiptImage]
  );

  const showPaymentRequiredAlert = useCallback(() => {
    showAlert(
      "Payment Required",
      "Hindi pa successful ang payment ng commuter. Hintayin muna ang payment success bago pumunta sa store.",
      "warning"
    );
  }, [showAlert]);

  const openPreview = useCallback(
    (type) => {
      const rawImageUrl =
        type === "proof"
          ? bookingRef.current?.purchase_proof_url
          : bookingRef.current?.receipt_image_url;

      const normalizedUrl = normalizeSupabaseImageUrl(rawImageUrl);

      log("openPreview pressed", {
        type,
        rawImageUrl,
        normalizedUrl,
        debug: getImageDebugInfo(rawImageUrl),
        bookingId: bookingRef.current?.id,
      });

      if (!normalizedUrl) {
        showAlert("No image", "Wala pang uploaded image para ma-preview.", "warning");
        return;
      }

      setPreviewType(type);
      setPreviewImageUrl(normalizedUrl);
      setPreviewTitle(type === "proof" ? "Purchase Proof Preview" : "Receipt Preview");
      setPreviewVisible(true);
    },
    [showAlert]
  );

  const handleRetakeFromPreview = useCallback(() => {
    const currentType = previewType;
    setPreviewVisible(false);

    if (!currentType) return;

    setTimeout(() => {
      pickAndUploadImageRef.current?.(currentType);
    }, 250);
  }, [previewType]);

  const callBuyer = useCallback(() => {
    if (paymentBlocked) {
      showPaymentRequiredAlert();
      return;
    }

    if (bookingRef.current?.buyer_phone) {
      Linking.openURL(`tel:${bookingRef.current.buyer_phone}`).catch((error) => {
        log("callBuyer error", error?.message || error);
      });
    } else {
      showAlert("No contact", "Buyer phone number is not available.", "warning");
    }
  }, [paymentBlocked, showAlert, showPaymentRequiredAlert]);

  const decodePolyline = useCallback((encoded) => {
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
  }, []);

  const calculateDirections = useCallback(
    async (origin, destination) => {
      if (!googleApiKey || !origin || !destination) return null;

      try {
        const url =
          `https://maps.googleapis.com/maps/api/directions/json` +
          `?origin=${origin.latitude},${origin.longitude}` +
          `&destination=${destination.latitude},${destination.longitude}` +
          `&mode=driving&alternatives=false&key=${googleApiKey}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.status !== "OK" || !data.routes?.[0]) return null;

        const mapRoute = data.routes[0];
        const leg = mapRoute.legs?.[0];

        return {
          points: decodePolyline(mapRoute.overview_polyline.points),
          distanceKm: leg?.distance?.value ? (leg.distance.value / 1000).toFixed(1) : null,
          durationMin: leg?.duration?.value ? Math.round(leg.duration.value / 60) : null,
        };
      } catch (error) {
        log("calculateDirections error", error?.message || error);
        return null;
      }
    },
    [decodePolyline, googleApiKey]
  );

  const fitMap = useCallback((coordinates) => {
    if (!mapRef.current || !coordinates?.length) return;

    mapRef.current.fitToCoordinates(coordinates, {
      edgePadding: {
        top: isTablet ? 120 : 100,
        right: isTablet ? 90 : 70,
        left: isTablet ? 90 : 70,
        bottom: isTablet ? 380 : 320,
      },
      animated: true,
    });
  }, []);

  const fitMapToRoute = useCallback(
    (coordinates = []) => {
      const points = [];

      if (Array.isArray(coordinates) && coordinates.length > 0) {
        points.push(...coordinates);
      }

      if (driverLocation?.latitude && driverLocation?.longitude) {
        points.push({
          latitude: Number(driverLocation.latitude),
          longitude: Number(driverLocation.longitude),
        });
      }

      if (booking?.pickup_latitude && booking?.pickup_longitude) {
        points.push({
          latitude: Number(booking.pickup_latitude),
          longitude: Number(booking.pickup_longitude),
        });
      }

      if (booking?.dropoff_latitude && booking?.dropoff_longitude) {
        points.push({
          latitude: Number(booking.dropoff_latitude),
          longitude: Number(booking.dropoff_longitude),
        });
      }

      const validPoints = points.filter(
        (p) =>
          p &&
          Number.isFinite(Number(p.latitude)) &&
          Number.isFinite(Number(p.longitude))
      );

      if (!mapRef.current || validPoints.length === 0) return;

      mapRef.current.fitToCoordinates(validPoints, {
        edgePadding: {
          top: isTablet ? 130 : 110,
          right: isTablet ? 90 : 70,
          left: isTablet ? 90 : 70,
          bottom: isTablet ? 380 : 320,
        },
        animated: true,
      });
    },
    [booking, driverLocation]
  );

  const fetchBooking = useCallback(async () => {
    if (!bookingId) {
      setLoading(false);
      return;
    }

    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", bookingId)
        .maybeSingle();

      if (error) throw error;

      log("fetchBooking result", {
        bookingId,
        found: !!data,
        purchase_proof_url: data?.purchase_proof_url || null,
        receipt_image_url: data?.receipt_image_url || null,
      });

      if (!data) {
        setBooking(null);
        setDriverLocation(null);
        setRouteCoordinates([]);
        setEstimatedDistance(null);
        setEstimatedTime(null);
        return;
      }

      prevPaymentStatusRef.current = ["paid", "success", "succeeded", "completed"].includes(
        String(data?.payment_status || "").toLowerCase().trim()
      );

      setBooking(data);
    } catch (error) {
      log("fetchBooking error", { message: error?.message || error });
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [bookingId]);

  const updateDriverLocation = useCallback(async (coords) => {
    const driverId = await AsyncStorage.getItem("user_id");
    if (!driverId || !coords) return;

    try {
      const { data: existing } = await supabase
        .from("driver_locations")
        .select("id")
        .eq("driver_id", driverId)
        .maybeSingle();

      const payload = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        is_online: true,
        last_updated: new Date().toISOString(),
        last_heartbeat: new Date().toISOString(),
      };

      if (existing?.id) {
        await supabase.from("driver_locations").update(payload).eq("driver_id", driverId);
      } else {
        await supabase.from("driver_locations").insert({
          driver_id: driverId,
          ...payload,
        });
      }
    } catch (error) {
      log("updateDriverLocation error", error?.message || error);
    }
  }, []);

  const startLocationTracking = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        showAlert("Location required", "Please allow location access.", "warning");
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const latest = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      };

      setDriverLocation(latest);
      await updateDriverLocation(latest);

      locationSubscriptionRef.current?.remove?.();

      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 3000,
          distanceInterval: 5,
        },
        async (location) => {
          const next = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };
          setDriverLocation(next);
          await updateDriverLocation(next);
        }
      );

      locationSubscriptionRef.current = sub;
    } catch (error) {
      log("startLocationTracking error", error?.message || error);
    }
  }, [showAlert, updateDriverLocation]);

  const recalculateRoute = useCallback(
    async (currentDriverLocation, currentBooking, currentPhase) => {
      if (!currentDriverLocation || !currentBooking) {
        setRouteCoordinates([]);
        setEstimatedDistance(null);
        setEstimatedTime(null);
        return;
      }

      const goingToCustomer = ["purchased", "delivering", "delivered", "completed"].includes(
        currentPhase
      );

      const target = goingToCustomer
        ? {
            latitude: Number(currentBooking.dropoff_latitude),
            longitude: Number(currentBooking.dropoff_longitude),
          }
        : {
            latitude: Number(currentBooking.pickup_latitude),
            longitude: Number(currentBooking.pickup_longitude),
          };

      if (!target?.latitude || !target?.longitude) {
        setRouteCoordinates([]);
        setEstimatedDistance(null);
        setEstimatedTime(null);
        return;
      }

      const result = await calculateDirections(currentDriverLocation, target);

      if (!result) {
        setRouteCoordinates([]);
        setEstimatedDistance(null);
        setEstimatedTime(null);
        return;
      }

      setRouteCoordinates(result.points || []);
      setEstimatedDistance(result.distanceKm);
      setEstimatedTime(result.durationMin);

      fitMap([currentDriverLocation, target]);
    },
    [calculateDirections, fitMap]
  );

  const updateBookingFields = useCallback(
    async (values, metaLabel = "updateBookingFields") => {
      try {
        if (!bookingRef.current?.id) {
          return { ok: false, error: new Error("Missing booking id") };
        }

        const payload = {
          ...values,
          updated_at: new Date().toISOString(),
        };

        log(`${metaLabel} payload`, payload);

        const { data, error } = await supabase
          .from("bookings")
          .update(payload)
          .eq("id", bookingRef.current.id)
          .select("*")
          .single();

        if (error) throw error;

        log(`${metaLabel} success`, {
          id: data?.id,
          purchase_proof_url: data?.purchase_proof_url,
          receipt_image_url: data?.receipt_image_url,
        });

        setBooking(data);
        return { ok: true, data };
      } catch (error) {
        log(`${metaLabel} catch error`, { message: error?.message || error });
        showAlert(
          "Update failed",
          error?.message || "Hindi na-update ang booking. Pakicheck ang logs.",
          "error"
        );
        return { ok: false, error };
      }
    },
    [showAlert]
  );

  const pickAndUploadImage = useCallback(
    async (type) => {
      try {
        if (!bookingRef.current?.id) return;

        const currentPaymentStatus = String(bookingRef.current?.payment_status || "")
          .toLowerCase()
          .trim();

        const paid = ["paid", "success", "succeeded", "completed"].includes(currentPaymentStatus);

        if (!paid) {
          showPaymentRequiredAlert();
          return;
        }

        if (type === "proof") setUploadingProof(true);
        else setUploadingReceipt(true);

        log("pickAndUploadImage start", {
          type,
          bookingId: bookingRef.current?.id,
          paymentStatus: bookingRef.current?.payment_status,
        });

        const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
        if (!cameraPermission.granted) {
          showAlert("Permission needed", "Please allow camera access first.", "warning");
          return;
        }

        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          quality: 1,
          cameraType: ImagePicker.CameraType.back,
          exif: false,
        });

        if (result.canceled || !result.assets?.[0]) {
          log("pickAndUploadImage cancelled", { type });
          return;
        }

        const asset = result.assets[0];

        const manipulated = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: 1600 } }],
          {
            compress: 0.82,
            format: ImageManipulator.SaveFormat.JPEG,
            base64: false,
          }
        );

        const base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        if (!base64 || base64.length < 50) {
          throw new Error("Captured image is empty or invalid.");
        }

        const atobFn =
          global?.atob ||
          ((input) => {
            const chars =
              "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
            let str = input.replace(/=+$/, "");
            let output = "";

            if (str.length % 4 === 1) {
              throw new Error("Invalid base64 string");
            }

            for (
              let bc = 0, bs, buffer, idx = 0;
              (buffer = str.charAt(idx++));
              ~buffer &&
              ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
                ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
                : 0
            ) {
              buffer = chars.indexOf(buffer);
            }

            return output;
          });

        const binaryString = atobFn(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);

        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        if (!bytes.length) {
          throw new Error("Converted image bytes are empty.");
        }

        const filename = `${bookingRef.current.id}-${type}-${Date.now()}.jpg`;
        const path = `${bookingRef.current.id}/${filename}`;

        const { error: uploadError } = await supabase.storage
          .from("booking-proofs")
          .upload(path, bytes, {
            contentType: "image/jpeg",
            upsert: true,
            cacheControl: "0",
          });

        if (uploadError) {
          throw new Error(`Storage upload failed: ${uploadError.message}`);
        }

        const { data: publicData } = supabase.storage.from("booking-proofs").getPublicUrl(path);

        const rawPublicUrl = publicData?.publicUrl || null;

        if (!rawPublicUrl) {
          throw new Error("Failed to generate public URL.");
        }

        const cleanPublicUrl = normalizeSupabaseImageUrl(rawPublicUrl);

        const fields =
          type === "proof"
            ? { purchase_proof_url: cleanPublicUrl }
            : { receipt_image_url: cleanPublicUrl };

        const resultUpdate = await updateBookingFields(fields, `upload_${type}`);
        if (!resultUpdate?.ok) {
          throw new Error("Image uploaded but saving URL to booking failed.");
        }

        setBooking((prev) =>
          prev
            ? {
                ...prev,
                ...fields,
              }
            : prev
        );

        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        showAlert(
          "Upload successful",
          `${type === "proof" ? "Purchase proof" : "Receipt"} captured and uploaded successfully.`,
          "success"
        );
      } catch (error) {
        log("pickAndUploadImage REAL ERROR", {
          type,
          bookingId: bookingRef.current?.id,
          message: error?.message,
          stack: error?.stack,
        });

        showAlert(
          "Upload failed",
          error?.message || "Could not upload image. Please try again.",
          "error"
        );
      } finally {
        if (type === "proof") setUploadingProof(false);
        else setUploadingReceipt(false);
      }
    },
    [showAlert, showPaymentRequiredAlert, updateBookingFields]
  );

  useEffect(() => {
    pickAndUploadImageRef.current = pickAndUploadImage;
  }, [pickAndUploadImage]);

  const handleArrivedAtStore = useCallback(() => {
    if (!isPaymentSuccessful) {
      showPaymentRequiredAlert();
      return;
    }

    showAlert("Confirm arrival", "Mark that you already arrived at the store?", "info", {
      confirmText: "Yes, Arrived",
      cancelText: "Not Yet",
      onConfirm: async () => {
        setAlertVisible(false);

        const result = await updateBookingFields(
          { service_status: "picked_up" },
          "handleArrivedAtStore"
        );

        if (!result?.ok) return;
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showAlert("Updated", "Na-mark na as arrived at store.", "success");
      },
    });
  }, [isPaymentSuccessful, showAlert, showPaymentRequiredAlert, updateBookingFields]);

  const handleStartPurchasing = useCallback(() => {
    if (!isPaymentSuccessful) {
      showPaymentRequiredAlert();
      return;
    }

    showAlert("Start purchasing", "Mark that you are now buying the requested items?", "info", {
      confirmText: "Start",
      cancelText: "Cancel",
      onConfirm: async () => {
        setAlertVisible(false);

        const result = await updateBookingFields(
          { service_status: "purchasing" },
          "handleStartPurchasing"
        );

        if (!result?.ok) return;
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
    });
  }, [isPaymentSuccessful, showAlert, showPaymentRequiredAlert, updateBookingFields]);

  const handleMarkPurchased = useCallback(() => {
    if (!isPaymentSuccessful) {
      showPaymentRequiredAlert();
      return;
    }

    showAlert("Items purchased", "Confirm that you already bought the requested items?", "success", {
      confirmText: "Confirm",
      cancelText: "Cancel",
      onConfirm: async () => {
        setAlertVisible(false);

        const result = await updateBookingFields(
          {
            service_status: "purchased",
            purchased_at: new Date().toISOString(),
          },
          "handleMarkPurchased"
        );

        if (!result?.ok) return;
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
    });
  }, [isPaymentSuccessful, showAlert, showPaymentRequiredAlert, updateBookingFields]);

  const handleStartDelivery = useCallback(() => {
    showAlert("Start delivery", "Proceed to the customer now?", "info", {
      confirmText: "Start",
      cancelText: "Wait",
      onConfirm: async () => {
        setAlertVisible(false);

        const result = await updateBookingFields(
          { service_status: "in_transit" },
          "handleStartDelivery"
        );

        if (!result?.ok) return;
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
    });
  }, [showAlert, updateBookingFields]);

  const handleMarkDelivered = useCallback(() => {
    if (!hasPurchaseProof || !hasReceiptImage) {
      showAlert(
        "Proof Required",
        "Bago ma-mark as delivered, required muna ang actual camera photo ng purchase proof at receipt.",
        "warning"
      );
      return;
    }

    showAlert("Mark delivered", "Confirm that the item was delivered to the customer?", "success", {
      confirmText: "Delivered",
      cancelText: "Cancel",
      onConfirm: async () => {
        setAlertVisible(false);

        const result = await updateBookingFields(
          {
            service_status: "delivered",
            delivered_at: new Date().toISOString(),
            status: "completed",
          },
          "handleMarkDelivered"
        );

        if (!result?.ok) return;
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        goToDriverHome();
      },
    });
  }, [hasPurchaseProof, hasReceiptImage, showAlert, updateBookingFields, goToDriverHome]);

  const confirmDriverCancellation = useCallback(async () => {
    const pickedReason =
      selectedCancelReason === "Others"
        ? customCancelReason.trim()
        : selectedCancelReason.trim();

    if (!pickedReason) {
      showAlert(
        "Reason required",
        "Please select or enter a cancellation reason first.",
        "warning"
      );
      return;
    }

    try {
      setSubmittingCancel(true);

      const result = await updateBookingFields(
        {
          status: "cancelled",
          service_status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancellation_reason: pickedReason,
          cancelled_by: "driver",
        },
        "handleCancelPabili"
      );

      if (!result?.ok) return;

      setCancelReasonVisible(false);
      setSelectedCancelReason("");
      setCustomCancelReason("");

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      goToDriverHome();
    } finally {
      setSubmittingCancel(false);
    }
  }, [
    selectedCancelReason,
    customCancelReason,
    showAlert,
    updateBookingFields,
    goToDriverHome,
  ]);

  const handleCancelPabili = useCallback(() => {
    const currentBooking = bookingRef.current;

    const paymentStatus = String(currentBooking?.payment_status || "").toLowerCase().trim();
    const bookingStatus = String(currentBooking?.status || "").toLowerCase().trim();
    const serviceStatus = String(currentBooking?.service_status || "").toLowerCase().trim();

    const isPaid = ["paid", "success", "succeeded", "completed"].includes(paymentStatus);
    const isFinished =
      ["completed", "cancelled"].includes(bookingStatus) ||
      ["completed", "cancelled", "delivered"].includes(serviceStatus);

    if (isPaid) {
      showAlert(
        "Cancellation Not Allowed",
        "Hindi na puwedeng i-cancel ng driver ang booking kapag paid na ito.",
        "warning"
      );
      return;
    }

    if (isFinished) {
      showAlert(
        "Cancellation Not Allowed",
        "Hindi na puwedeng i-cancel dahil tapos o cancelled na ang booking.",
        "warning"
      );
      return;
    }

    setSelectedCancelReason("");
    setCustomCancelReason("");
    setCancelReasonVisible(true);
  }, [showAlert]);

  const primaryAction = useMemo(() => {
    switch (phase) {
      case "heading_to_store":
        return {
          label: "Arrived at Store",
          icon: "location",
          color: COLORS.orange,
          onPress: handleArrivedAtStore,
        };
      case "arrived_at_store":
        return {
          label: "Start Purchasing",
          icon: "bag-handle-outline",
          color: COLORS.orangeDark,
          onPress: handleStartPurchasing,
        };
      case "purchasing":
        return {
          label: "Mark Purchased",
          icon: "bag-check-outline",
          color: COLORS.green,
          onPress: handleMarkPurchased,
        };
      case "purchased":
        return {
          label: "Start Delivery",
          icon: "navigate-outline",
          color: COLORS.navyLight,
          onPress: handleStartDelivery,
        };
      case "delivering":
        return {
          label: canMarkDelivered ? "Mark Delivered" : "Upload Proof First",
          icon: canMarkDelivered ? "checkmark-circle-outline" : "camera-outline",
          color: canMarkDelivered ? COLORS.greenDark : COLORS.orangeDark,
          onPress: handleMarkDelivered,
        };
      case "delivered":
        return {
          label: "Complete",
          icon: "checkmark-done-outline",
          color: COLORS.greenDark,
          onPress: handleMarkDelivered,
        };
      default:
        return null;
    }
  }, [
    phase,
    canMarkDelivered,
    handleArrivedAtStore,
    handleStartPurchasing,
    handleMarkPurchased,
    handleStartDelivery,
    handleMarkDelivered,
  ]);

  useEffect(() => {
    if (!bookingId) return;

    paymentSubscriptionRef.current = supabase
      .channel(`payment-realtime-${bookingId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bookings",
          filter: `id=eq.${bookingId}`,
        },
        (payload) => {
          const newPaymentStatus = String(payload.new?.payment_status || "").toLowerCase();
          const oldPaymentStatus = String(payload.old?.payment_status || "").toLowerCase();

          const wasPaid = ["paid", "success", "succeeded", "completed"].includes(oldPaymentStatus);
          const isNowPaid = ["paid", "success", "succeeded", "completed"].includes(newPaymentStatus);

          if (!wasPaid && isNowPaid) {
            log("payment realtime success", {
              bookingId,
              oldPaymentStatus,
              newPaymentStatus,
            });

            setBooking((prev) => ({
              ...prev,
              payment_status: payload.new?.payment_status,
            }));

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            const currentPhase = getPabiliPhase(bookingRef.current);
            const inStorePhase = ["heading_to_store", "arrived_at_store", "purchasing"].includes(
              currentPhase
            );

            if (inStorePhase) {
              showAlert(
                "✅ Payment Successful! 💰",
                "The customer has completed the payment. You can now proceed to the store.",
                "success",
                {
                  confirmText: "Proceed",
                  onConfirm: () => {
                    setAlertVisible(false);
                    fetchBooking();
                  },
                }
              );
            } else {
              showAlert("✅ Payment Received!", "Payment has been successfully processed.", "success");
            }
          }
        }
      )
      .subscribe();

    return () => {
      if (paymentSubscriptionRef.current) {
        paymentSubscriptionRef.current.unsubscribe();
      }
    };
  }, [bookingId, showAlert, fetchBooking]);

  useEffect(() => {
    if (!bookingId) return;

    const checkPaymentStatus = async () => {
      try {
        const { data, error } = await supabase
          .from("bookings")
          .select("payment_status, status, service_status")
          .eq("id", bookingId)
          .single();

        if (error) throw error;

        const currentPaymentStatus = String(data?.payment_status || "").toLowerCase();
        const isNowPaid = ["paid", "success", "succeeded", "completed"].includes(currentPaymentStatus);
        const wasPaid = prevPaymentStatusRef.current;

        if (!wasPaid && isNowPaid) {
          log("payment polling success", {
            bookingId,
            payment_status: data?.payment_status,
          });

          setBooking((prev) => ({ ...prev, payment_status: data.payment_status }));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

          const currentPhase = getPabiliPhase(bookingRef.current);
          const inStorePhase = ["heading_to_store", "arrived_at_store", "purchasing"].includes(
            currentPhase
          );

          if (inStorePhase) {
            showAlert(
              "💵 Payment Confirmed!",
              "Payment has been received. You can now proceed with the pabili service.",
              "success"
            );
          }
        }

        prevPaymentStatusRef.current = isNowPaid;
      } catch (error) {
        log("Payment polling error", error);
      }
    };

    checkPaymentStatus();
    paymentPollingRef.current = setInterval(checkPaymentStatus, 5000);

    return () => {
      if (paymentPollingRef.current) clearInterval(paymentPollingRef.current);
    };
  }, [bookingId, showAlert]);

  useFocusEffect(
    useCallback(() => {
      fetchBooking();
      startLocationTracking();

      return () => {
        locationSubscriptionRef.current?.remove?.();
        locationSubscriptionRef.current = null;
      };
    }, [fetchBooking, startLocationTracking])
  );

  useEffect(() => {
    if (!bookingId) return;

    bookingSubscriptionRef.current?.unsubscribe?.();

    bookingSubscriptionRef.current = supabase
      .channel(`driver-track-pabili-${bookingId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `id=eq.${bookingId}`,
        },
        async (payload) => {
          log("booking realtime payload", {
            eventType: payload?.eventType,
            hasNew: !!payload?.new,
          });

          if (payload?.new && Object.keys(payload.new).length > 0) {
            setBooking(payload.new);
          } else {
            await fetchBooking();
          }
        }
      )
      .subscribe();

    return () => {
      bookingSubscriptionRef.current?.unsubscribe?.();
      bookingSubscriptionRef.current = null;
    };
  }, [bookingId, fetchBooking]);

  useEffect(() => {
    if (driverLocation && booking) {
      recalculateRoute(driverLocation, booking, phase);
    }
  }, [driverLocation, booking, phase, recalculateRoute]);

  useEffect(() => {
    return () => {
      try {
        locationSubscriptionRef.current?.remove?.();
        bookingSubscriptionRef.current?.unsubscribe?.();
        paymentSubscriptionRef.current?.unsubscribe?.();
        if (paymentPollingRef.current) clearInterval(paymentPollingRef.current);
      } catch (error) {
        log("Cleanup error", error?.message || error);
      }
    };
  }, []);

  const floatingTop = insets.top + responsiveScale(14);

  if (loading && !booking) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.navyLight} />
          <Text style={styles.loadingText}>Loading pabili tracking...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!booking) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>Booking not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={styles.safeArea}>
      <Header
        insets={insets}
        navigation={navigation}
        subtitle={phaseMeta.subtitle}
        title={phaseMeta.title}
        statusColor={phaseMeta.color}
        isPaid={isPaymentSuccessful}
      />

      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          initialRegion={DEFAULT_REGION}
        >
          {!!driverLocation && (
            <Marker coordinate={driverLocation}>
              <DriverMapMarker />
            </Marker>
          )}

          {!!booking?.pickup_latitude && !!booking?.pickup_longitude && (
            <Marker
              coordinate={{
                latitude: Number(booking.pickup_latitude),
                longitude: Number(booking.pickup_longitude),
              }}
            >
              <LocationPin type="store" />
            </Marker>
          )}

          {!!booking?.dropoff_latitude && !!booking?.dropoff_longitude && (
            <Marker
              coordinate={{
                latitude: Number(booking.dropoff_latitude),
                longitude: Number(booking.dropoff_longitude),
              }}
            >
              <LocationPin type="home" />
            </Marker>
          )}

          {!!routeCoordinates.length && (
            <Polyline
              coordinates={routeCoordinates}
              strokeWidth={isTablet ? 6 : 5}
              strokeColor={phaseMeta.polylineColor}
            />
          )}
        </MapView>

        <View style={[styles.floatingTopRight, { top: floatingTop }]}>
          <Pressable
            style={styles.floatingIconBtn}
            onPress={() => fitMapToRoute(routeCoordinates)}
          >
            <Ionicons name="scan-outline" size={21} color={COLORS.gray800} />
          </Pressable>
        </View>
      </View>

      <DraggableBottomSheet
        phaseMeta={phaseMeta}
        primaryAction={primaryAction}
        canDriverCancel={canDriverCancel}
        handleCancelPabili={handleCancelPabili}
        callBuyer={callBuyer}
        booking={booking}
        openMaps={openMaps}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Progress</Text>
          <View style={{ marginTop: SPACING.sm }}>
            <StepBar phase={phase} />
          </View>
        </View>

        <SummaryBar
          timeText={estimatedTime ? `${estimatedTime} min` : "-"}
          distanceText={estimatedDistance ? `${estimatedDistance} km` : "-"}
          totalText={formatAmount(booking.fare || 0)}
        />

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Quick Details</Text>

            <Pressable style={styles.linkBtn} onPress={() => setDetailsVisible(true)}>
              <Text style={styles.linkBtnText}>More Details</Text>
              <Ionicons name="chevron-forward" size={14} color={COLORS.navyLight} />
            </Pressable>
          </View>

          <View style={styles.quickDetailGrid}>
            <DetailPill
              icon="storefront-outline"
              label="Store"
              value={booking?.store_name || booking?.pickup_location || "-"}
              tint={COLORS.orangeDark}
            />
            <DetailPill
              icon="person-outline"
              label="Buyer"
              value={booking?.buyer_name || "-"}
              tint={COLORS.navyLight}
            />
            <DetailPill
              icon="home-outline"
              label="Dropoff"
              value={booking?.dropoff_location || "-"}
              tint={COLORS.greenDark}
            />
          </View>
        </View>

        <ItemsPreviewCard
          items={parsedItems}
          notes={booking?.notes}
          rawDescription={booking?.item_description || booking?.item_name}
          onOpenFullDetails={() => setDetailsVisible(true)}
        />

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Proof & Receipt</Text>
            <View
              style={[
                styles.deliveryReadyBadge,
                {
                  backgroundColor: canMarkDelivered ? COLORS.greenSoft : COLORS.orangeSoft,
                },
              ]}
            >
              <Text
                style={[
                  styles.deliveryReadyBadgeText,
                  {
                    color: canMarkDelivered ? COLORS.greenDark : COLORS.orangeDark,
                  },
                ]}
              >
                {canMarkDelivered ? "Ready for delivery" : "Need both images"}
              </Text>
            </View>
          </View>

          <View style={styles.proofStatusList}>
            <ProofStatusCard
              title="Purchase Proof"
              uploaded={hasPurchaseProof}
              icon="camera-outline"
              tint={COLORS.orangeDark}
              onCapture={() => pickAndUploadImage("proof")}
              onView={() => openPreview("proof")}
              uploading={uploadingProof}
            />

            <ProofStatusCard
              title="Receipt"
              uploaded={hasReceiptImage}
              icon="receipt-outline"
              tint={COLORS.greenDark}
              onCapture={() => pickAndUploadImage("receipt")}
              onView={() => openPreview("receipt")}
              uploading={uploadingReceipt}
            />
          </View>
        </View>
      </DraggableBottomSheet>

      <ModernAlert
        visible={alertVisible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
        onClose={() => setAlertVisible(false)}
        onConfirm={alertConfig.onConfirm}
      />

      <ImagePreviewModal
        visible={previewVisible}
        imageUrl={previewImageUrl}
        title={previewTitle}
        onClose={() => setPreviewVisible(false)}
        onRetake={handleRetakeFromPreview}
      />

      <DetailsModal
        visible={detailsVisible}
        booking={booking}
        items={parsedItems}
        onClose={() => setDetailsVisible(false)}
        onCallBuyer={callBuyer}
        onOpenStore={() =>
          openMaps(
            Number(booking?.pickup_latitude),
            Number(booking?.pickup_longitude),
            booking?.store_name || "Store"
          )
        }
        onOpenDropoff={() =>
          openMaps(
            Number(booking?.dropoff_latitude),
            Number(booking?.dropoff_longitude),
            booking?.dropoff_location || "Dropoff"
          )
        }
      />

      <CancelReasonModal
        visible={cancelReasonVisible}
        reasons={CANCEL_REASONS}
        selectedReason={selectedCancelReason}
        customReason={customCancelReason}
        onSelectReason={setSelectedCancelReason}
        onChangeCustomReason={setCustomCancelReason}
        onClose={() => {
          if (submittingCancel) return;
          setCancelReasonVisible(false);
          setSelectedCancelReason("");
          setCustomCancelReason("");
        }}
        onSubmit={confirmDriverCancellation}
        submitting={submittingCancel}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.pageBg,
  },

  mapContainer: {
    flex: 1,
    backgroundColor: COLORS.gray100,
  },

  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.xl,
  },

  loadingText: {
    marginTop: SPACING.md,
    color: COLORS.gray700,
    fontSize: FONT.md,
    fontWeight: "700",
    textAlign: "center",
  },

  header: {
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  headerIconBtn: {
    width: responsiveScale(42),
    height: responsiveScale(42),
    borderRadius: responsiveScale(21),
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },

  headerCenter: {
    flex: 1,
    paddingHorizontal: SPACING.md,
  },

  headerSubRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: responsiveScale(2),
  },

  headerStatusDot: {
    width: responsiveScale(8),
    height: responsiveScale(8),
    borderRadius: responsiveScale(4),
    marginRight: SPACING.xs,
  },

  headerSub: {
    color: "rgba(255,255,255,0.78)",
    fontSize: FONT.xs,
    fontWeight: "700",
  },

  headerTitle: {
    color: COLORS.white,
    fontSize: FONT.lg,
    fontWeight: "800",
  },

  paymentBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: responsiveScale(7),
    borderRadius: responsiveScale(999),
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  paymentBadgeText: {
    fontSize: FONT.xs,
    fontWeight: "800",
  },

  driverMarker: {
    width: responsiveScale(38),
    height: responsiveScale(38),
    borderRadius: responsiveScale(19),
    backgroundColor: COLORS.navyLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: COLORS.white,
  },

  pinWrap: {
    width: responsiveScale(34),
    height: responsiveScale(34),
    borderRadius: responsiveScale(17),
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: COLORS.white,
  },

  floatingTopRight: {
    position: "absolute",
    right: SPACING.lg,
  },

  floatingIconBtn: {
    width: responsiveScale(46),
    height: responsiveScale(46),
    borderRadius: responsiveScale(23),
    backgroundColor: "rgba(255,255,255,0.94)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },

  bottomSheet: {
    position: "absolute",
    left: 0,
    right: 0,
  },

  bottomSheetContainer: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BR.xxl,
    borderTopRightRadius: BR.xxl,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -3 },
    elevation: 10,
  },

  sheetDragArea: {
    paddingTop: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.white,
  },

  panelHandle: {
    width: responsiveScale(46),
    height: responsiveScale(5),
    borderRadius: responsiveScale(999),
    backgroundColor: COLORS.gray300,
    alignSelf: "center",
    marginBottom: SPACING.sm,
  },

  panelHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: SPACING.sm,
  },

  panelHeaderLeft: {
    flex: 1,
    paddingRight: SPACING.sm,
  },

  panelHeaderTitle: {
    color: COLORS.gray900,
    fontSize: FONT.lg,
    fontWeight: "800",
  },

  panelHeaderSub: {
    color: COLORS.gray500,
    fontSize: FONT.xs,
    fontWeight: "600",
    marginTop: responsiveScale(2),
  },

  phaseChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: responsiveScale(7),
    borderRadius: responsiveScale(999),
  },

  phaseChipText: {
    fontSize: FONT.xs,
    fontWeight: "800",
  },

  stickyActionsWrap: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.white,
  },

  actionBtn: {
    minHeight: responsiveScale(50),
    borderRadius: BR.lg,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },

  actionBtnText: {
    color: COLORS.white,
    fontSize: FONT.md,
    fontWeight: "800",
  },

  quickMiniRow: {
    marginTop: SPACING.sm,
    flexDirection: "row",
    gap: SPACING.sm,
  },

  quickMiniBtn: {
    flex: 1,
    minHeight: responsiveScale(42),
    borderRadius: BR.md,
    backgroundColor: COLORS.gray50,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    flexDirection: "row",
  },

  quickMiniBtnText: {
    color: COLORS.gray800,
    fontSize: FONT.xs,
    fontWeight: "700",
  },

  cancelMiniBtn: {
    marginTop: SPACING.sm,
    minHeight: responsiveScale(44),
    borderRadius: BR.md,
    backgroundColor: COLORS.redSoft,
    borderWidth: 1,
    borderColor: "#FECACA",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },

  cancelMiniBtnText: {
    fontSize: FONT.sm,
    fontWeight: "800",
  },

  sheetScroll: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: responsiveScale(160),
  },

  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: BR.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.gray100,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  cardTitle: {
    color: COLORS.gray900,
    fontSize: FONT.md,
    fontWeight: "800",
  },

  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },

  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },

  linkBtnText: {
    color: COLORS.navyLight,
    fontSize: FONT.xs,
    fontWeight: "800",
  },

  stepBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    position: "relative",
    paddingTop: SPACING.xs,
  },

  stepItem: {
    flex: 1,
    alignItems: "center",
    position: "relative",
  },

  stepCircle: {
    width: responsiveScale(30),
    height: responsiveScale(30),
    borderRadius: responsiveScale(15),
    backgroundColor: COLORS.gray100,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },

  stepCircleDone: {
    backgroundColor: COLORS.greenDark,
    borderColor: COLORS.greenDark,
  },

  stepCircleActive: {
    transform: [{ scale: 1.04 }],
  },

  stepLabel: {
    marginTop: SPACING.xs,
    color: COLORS.gray500,
    fontSize: FONT.xs,
    fontWeight: "700",
    textAlign: "center",
  },

  stepLabelDone: {
    color: COLORS.gray900,
  },

  stepConnector: {
    position: "absolute",
    top: responsiveScale(14),
    right: "-50%",
    width: "100%",
    height: 2,
    backgroundColor: COLORS.gray200,
    zIndex: 1,
  },

  stepConnectorDone: {
    backgroundColor: COLORS.greenDark,
  },

  summaryBar: {
    marginBottom: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: BR.xl,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: COLORS.gray100,
  },

  summaryItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  summaryDivider: {
    width: 1,
    height: responsiveScale(22),
    backgroundColor: COLORS.gray200,
  },

  summaryText: {
    color: COLORS.gray800,
    fontSize: FONT.sm,
    fontWeight: "700",
  },

  quickDetailGrid: {
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },

  detailPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.gray50,
    borderWidth: 1,
    borderColor: COLORS.gray100,
    borderRadius: BR.lg,
    padding: SPACING.md,
    gap: SPACING.sm,
  },

  detailPillIcon: {
    width: responsiveScale(34),
    height: responsiveScale(34),
    borderRadius: responsiveScale(17),
    alignItems: "center",
    justifyContent: "center",
  },

  detailPillTextWrap: {
    flex: 1,
  },

  detailPillLabel: {
    color: COLORS.gray500,
    fontSize: FONT.xs,
    fontWeight: "700",
  },

  detailPillValue: {
    marginTop: responsiveScale(2),
    color: COLORS.gray900,
    fontSize: FONT.sm,
    fontWeight: "800",
  },

  itemsPreviewList: {
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },

  itemPreviewCard: {
    backgroundColor: COLORS.gray50,
    borderRadius: BR.lg,
    borderWidth: 1,
    borderColor: COLORS.gray100,
    padding: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },

  itemPreviewLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },

  itemPreviewIcon: {
    width: responsiveScale(34),
    height: responsiveScale(34),
    borderRadius: responsiveScale(17),
    backgroundColor: COLORS.orangeSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  itemPreviewTextWrap: {
    flex: 1,
  },

  itemPreviewName: {
    color: COLORS.gray900,
    fontSize: FONT.sm,
    fontWeight: "800",
  },

  itemPreviewNote: {
    marginTop: responsiveScale(2),
    color: COLORS.gray500,
    fontSize: FONT.xs,
    fontWeight: "600",
  },

  qtyPill: {
    minWidth: responsiveScale(42),
    paddingHorizontal: SPACING.sm,
    paddingVertical: responsiveScale(7),
    borderRadius: responsiveScale(999),
    backgroundColor: COLORS.orangeSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  qtyPillText: {
    color: COLORS.orangeDark,
    fontSize: FONT.xs,
    fontWeight: "800",
  },

  moreItemsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: SPACING.xs,
  },

  moreItemsText: {
    color: COLORS.gray500,
    fontSize: FONT.xs,
    fontWeight: "700",
  },

  emptyItemsBox: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.gray50,
    borderRadius: BR.lg,
    borderWidth: 1,
    borderColor: COLORS.gray100,
    padding: SPACING.lg,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyItemsText: {
    marginTop: SPACING.xs,
    color: COLORS.gray500,
    fontSize: FONT.sm,
    fontWeight: "700",
    textAlign: "center",
  },

  inlineInfoBox: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.blueSoft,
    borderRadius: BR.lg,
    padding: SPACING.md,
  },

  inlineInfoLabel: {
    color: COLORS.navyLight,
    fontSize: FONT.xs,
    fontWeight: "800",
    marginBottom: responsiveScale(2),
  },

  inlineInfoText: {
    color: COLORS.gray800,
    fontSize: FONT.sm,
    fontWeight: "600",
    lineHeight: responsiveScale(20),
  },

  deliveryReadyBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: responsiveScale(7),
    borderRadius: responsiveScale(999),
  },

  deliveryReadyBadgeText: {
    fontSize: FONT.xs,
    fontWeight: "800",
  },

  proofStatusList: {
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },

  proofStatusCard: {
    backgroundColor: COLORS.gray50,
    borderWidth: 1,
    borderColor: COLORS.gray100,
    borderRadius: BR.lg,
    padding: SPACING.md,
  },

  proofStatusTop: {
    flexDirection: "row",
    alignItems: "center",
  },

  proofStatusIcon: {
    width: responsiveScale(40),
    height: responsiveScale(40),
    borderRadius: responsiveScale(20),
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.sm,
  },

  proofStatusTextWrap: {
    flex: 1,
    paddingRight: SPACING.sm,
  },

  proofStatusTitle: {
    color: COLORS.gray900,
    fontSize: FONT.sm,
    fontWeight: "800",
  },

  proofStatusSub: {
    marginTop: responsiveScale(2),
    color: COLORS.gray500,
    fontSize: FONT.xs,
    fontWeight: "600",
  },

  proofBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: responsiveScale(6),
    borderRadius: responsiveScale(999),
  },

  proofBadgeText: {
    fontSize: FONT.xs,
    fontWeight: "800",
  },

  proofStatusActions: {
    marginTop: SPACING.md,
    flexDirection: "row",
    gap: SPACING.sm,
  },

  proofActionBtn: {
    flex: 1,
    minHeight: responsiveScale(42),
    borderRadius: BR.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },

  proofActionPrimary: {
    backgroundColor: COLORS.navyLight,
  },

  proofActionPrimaryText: {
    color: COLORS.white,
    fontSize: FONT.xs,
    fontWeight: "800",
  },

  proofActionSecondary: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },

  proofActionSecondaryText: {
    fontSize: FONT.xs,
    fontWeight: "800",
  },

  proofActionDisabled: {
    opacity: 0.55,
  },

  alertOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },

  alertWrap: {
    width: "100%",
    alignItems: "center",
  },

  alertCard: {
    width: "100%",
    maxWidth: responsiveScale(360),
    backgroundColor: COLORS.white,
    borderRadius: BR.xl,
    padding: SPACING.xl,
    alignItems: "center",
  },

  alertIconBox: {
    width: responsiveScale(72),
    height: responsiveScale(72),
    borderRadius: responsiveScale(36),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.md,
  },

  alertTitle: {
    fontSize: FONT.lg,
    color: COLORS.gray900,
    fontWeight: "800",
    textAlign: "center",
  },

  alertMessage: {
    marginTop: SPACING.sm,
    fontSize: FONT.sm,
    color: COLORS.gray600,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: responsiveScale(20),
  },

  alertBtns: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    width: "100%",
  },

  alertSecondaryBtn: {
    flex: 1,
    minHeight: responsiveScale(46),
    borderRadius: BR.md,
    backgroundColor: COLORS.gray100,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.md,
  },

  alertSecondaryText: {
    color: COLORS.gray700,
    fontSize: FONT.sm,
    fontWeight: "800",
  },

  alertPrimaryBtn: {
    flex: 1,
    minHeight: responsiveScale(46),
    borderRadius: BR.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.md,
  },

  alertPrimaryText: {
    color: COLORS.white,
    fontSize: FONT.sm,
    fontWeight: "800",
  },

  previewOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.88)",
    justifyContent: "center",
    padding: SPACING.lg,
  },

  previewCard: {
    backgroundColor: COLORS.gray900,
    borderRadius: BR.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  previewTitle: {
    flex: 1,
    color: COLORS.white,
    fontSize: FONT.md,
    fontWeight: "800",
  },

  previewCloseBtn: {
    width: responsiveScale(36),
    height: responsiveScale(36),
    borderRadius: responsiveScale(18),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    marginLeft: SPACING.md,
  },

  previewImageWrap: {
    minHeight: screenHeight * 0.45,
    maxHeight: screenHeight * 0.58,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },

  previewImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "#000",
  },

  previewLoader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },

  previewLoaderText: {
    marginTop: SPACING.sm,
    color: COLORS.white,
    fontSize: FONT.sm,
    fontWeight: "700",
  },

  previewEmpty: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.xl,
  },

  previewEmptyText: {
    marginTop: SPACING.sm,
    color: COLORS.gray300,
    fontSize: FONT.sm,
    fontWeight: "700",
    textAlign: "center",
  },

  previewActions: {
    flexDirection: "row",
    gap: SPACING.sm,
    padding: SPACING.lg,
    backgroundColor: "rgba(255,255,255,0.04)",
  },

  previewSecondaryBtn: {
    flex: 1,
    minHeight: responsiveScale(46),
    borderRadius: BR.md,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  previewSecondaryText: {
    color: COLORS.white,
    fontSize: FONT.sm,
    fontWeight: "800",
  },

  previewPrimaryBtn: {
    flex: 1,
    minHeight: responsiveScale(46),
    borderRadius: BR.md,
    backgroundColor: COLORS.orange,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },

  previewPrimaryText: {
    color: COLORS.white,
    fontSize: FONT.sm,
    fontWeight: "800",
  },

  detailsOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
  },

  detailsModalCard: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BR.xxl,
    borderTopRightRadius: BR.xxl,
    maxHeight: screenHeight * 0.88,
    paddingBottom: SPACING.lg,
  },

  detailsHandle: {
    width: responsiveScale(42),
    height: responsiveScale(5),
    borderRadius: responsiveScale(999),
    backgroundColor: COLORS.gray300,
    alignSelf: "center",
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },

  detailsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
  },

  detailsTitle: {
    color: COLORS.gray900,
    fontSize: FONT.lg,
    fontWeight: "800",
  },

  detailsSub: {
    color: COLORS.gray500,
    fontSize: FONT.xs,
    fontWeight: "600",
    marginTop: responsiveScale(2),
  },

  detailsCloseBtn: {
    width: responsiveScale(38),
    height: responsiveScale(38),
    borderRadius: responsiveScale(19),
    backgroundColor: COLORS.gray100,
    alignItems: "center",
    justifyContent: "center",
  },

  detailsScrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },

  detailsSection: {
    marginTop: SPACING.md,
  },

  detailsSectionTitle: {
    color: COLORS.gray900,
    fontSize: FONT.md,
    fontWeight: "800",
    marginBottom: SPACING.sm,
  },

  detailItemCard: {
    backgroundColor: COLORS.gray50,
    borderWidth: 1,
    borderColor: COLORS.gray100,
    borderRadius: BR.lg,
    padding: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },

  detailItemLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },

  detailItemIcon: {
    width: responsiveScale(34),
    height: responsiveScale(34),
    borderRadius: responsiveScale(17),
    backgroundColor: COLORS.orangeSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  detailItemTextWrap: {
    flex: 1,
  },

  detailItemName: {
    color: COLORS.gray900,
    fontSize: FONT.sm,
    fontWeight: "800",
  },

  detailItemNote: {
    marginTop: responsiveScale(2),
    color: COLORS.gray500,
    fontSize: FONT.xs,
    fontWeight: "600",
  },

  detailQtyPill: {
    minWidth: responsiveScale(42),
    paddingHorizontal: SPACING.sm,
    paddingVertical: responsiveScale(7),
    borderRadius: responsiveScale(999),
    backgroundColor: COLORS.orangeSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  detailQtyPillText: {
    color: COLORS.orangeDark,
    fontSize: FONT.xs,
    fontWeight: "800",
  },

  notesBox: {
    backgroundColor: COLORS.gray50,
    borderWidth: 1,
    borderColor: COLORS.gray100,
    borderRadius: BR.lg,
    padding: SPACING.md,
  },

  notesText: {
    color: COLORS.gray800,
    fontSize: FONT.sm,
    fontWeight: "600",
    lineHeight: responsiveScale(20),
  },

  detailsActionGrid: {
    flexDirection: "row",
    gap: SPACING.sm,
    flexWrap: "wrap",
  },

  detailsActionBtn: {
    minWidth: responsiveScale(100),
    flexGrow: 1,
    backgroundColor: COLORS.gray50,
    borderWidth: 1,
    borderColor: COLORS.gray100,
    borderRadius: BR.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },

  detailsActionText: {
    color: COLORS.gray800,
    fontSize: FONT.xs,
    fontWeight: "800",
    textAlign: "center",
  },

  cancelReasonOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.72)",
    justifyContent: "center",
    paddingHorizontal: SPACING.lg,
  },

  cancelReasonCard: {
    backgroundColor: COLORS.white,
    borderRadius: BR.xl,
    padding: SPACING.lg,
  },

  cancelReasonIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: COLORS.redSoft,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: SPACING.md,
  },

  cancelReasonTitle: {
    fontSize: FONT.xl,
    fontWeight: "800",
    color: COLORS.gray900,
    textAlign: "center",
  },

  cancelReasonSubtitle: {
    marginTop: SPACING.xs,
    fontSize: FONT.sm,
    color: COLORS.gray500,
    textAlign: "center",
    lineHeight: responsiveScale(20),
  },

  cancelReasonList: {
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },

  cancelReasonOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: BR.lg,
    backgroundColor: COLORS.gray50,
  },

  cancelReasonOptionActive: {
    borderColor: COLORS.red,
    backgroundColor: COLORS.redSoft,
  },

  cancelReasonRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.gray300,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.sm,
  },

  cancelReasonRadioActive: {
    borderColor: COLORS.red,
  },

  cancelReasonRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.red,
  },

  cancelReasonOptionText: {
    flex: 1,
    fontSize: FONT.md,
    color: COLORS.gray800,
    fontWeight: "600",
  },

  cancelReasonOptionTextActive: {
    color: COLORS.redDark,
  },

  cancelReasonInput: {
    minHeight: 96,
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: BR.lg,
    backgroundColor: COLORS.gray50,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: FONT.md,
    color: COLORS.gray900,
  },

  cancelReasonActions: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },

  cancelReasonSecondaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: BR.lg,
    backgroundColor: COLORS.gray100,
    alignItems: "center",
    justifyContent: "center",
  },

  cancelReasonSecondaryText: {
    fontSize: FONT.md,
    fontWeight: "700",
    color: COLORS.gray700,
  },

  cancelReasonPrimaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: BR.lg,
    backgroundColor: COLORS.red,
    alignItems: "center",
    justifyContent: "center",
  },

  cancelReasonPrimaryText: {
    fontSize: FONT.md,
    fontWeight: "800",
    color: COLORS.white,
  },
});