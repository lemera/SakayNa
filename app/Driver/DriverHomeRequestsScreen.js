import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "../../lib/supabase";

const COLORS = {
  navy: "#0F2744",
  navyLight: "#183B5C",
  orange: "#F97316",
  orangeSoft: "#FFF7ED",
  green: "#10B981",
  greenSoft: "#ECFDF5",
  red: "#EF4444",
  redSoft: "#FEF2F2",
  yellow: "#F59E0B",
  yellowSoft: "#FFFBEB",
  blue: "#2563EB",
  blueSoft: "#EFF6FF",
  white: "#FFFFFF",
  gray50: "#F8FAFC",
  gray100: "#F1F5F9",
  gray200: "#E2E8F0",
  gray300: "#CBD5E1",
  gray400: "#94A3B8",
  gray500: "#64748B",
  gray700: "#334155",
  gray900: "#0F172A",
  overlay: "rgba(0,0,0,0.45)",
};

const TABS = {
  RIDES: "ride",
  PABILI: "pabili",
};

const REJECT_REASONS = [
  "Too far from pickup",
  "Currently unavailable",
  "Vehicle issue / mechanical problem",
  "Other / Iba pa",
];

const CANCEL_RIDE_REASONS = [
  "Passenger no-show",
  "Vehicle issue / mechanical problem",
  "Emergency / personal reason",
  "Other / Iba pa",
];

function log(label, data = null) {
  if (data !== null && data !== undefined) {
    console.log("[DriverHomeRequestsScreen]", label, data);
  } else {
    console.log("[DriverHomeRequestsScreen]", label);
  }
}

function formatAmount(value) {
  return `₱${Number(value || 0).toFixed(2)}`;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function isFinalBooking(booking) {
  const status = normalize(booking?.status);
  const serviceStatus = normalize(booking?.service_status);
  return (
    status === "completed" ||
    status === "cancelled" ||
    serviceStatus === "completed" ||
    serviceStatus === "cancelled"
  );
}

function isAssignedToOtherDriver(booking, currentDriverId) {
  return !!booking?.driver_id && booking.driver_id !== currentDriverId;
}

function canShowRequest(booking, currentDriverId) {
  if (!booking?.id) return false;
  if (isFinalBooking(booking)) return false;
  if (isAssignedToOtherDriver(booking, currentDriverId)) return false;
  return true;
}

function canDriverCancelActiveRide(booking) {
  const status = normalize(booking?.status);
  const serviceStatus = normalize(booking?.service_status);
  const paymentStatus = normalize(booking?.payment_status);

  if (status === "completed" || status === "cancelled") return false;
  if (serviceStatus === "completed" || serviceStatus === "cancelled") return false;
  if (paymentStatus === "paid") return false;
  if (booking?.ride_started_at) return false;

  return true;
}

function getSecondsLeft(expiresAt) {
  if (!expiresAt) return null;
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / 1000));
}

function formatCountdown(seconds) {
  const safe = Math.max(0, Number(seconds || 0));
  const mm = String(Math.floor(safe / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function isLocallyExpired(request) {
  const secondsLeft = getSecondsLeft(request?.expires_at);
  return secondsLeft !== null && secondsLeft <= 0;
}

function getCountdownMeta(expiresAt) {
  const secondsLeft = getSecondsLeft(expiresAt);

  if (secondsLeft === null) {
    return {
      label: "No timer",
      color: COLORS.gray500,
      bg: COLORS.gray100,
      icon: "time-outline",
    };
  }

  if (secondsLeft <= 10) {
    return {
      label: formatCountdown(secondsLeft),
      color: COLORS.red,
      bg: COLORS.redSoft,
      icon: "alarm-outline",
    };
  }

  if (secondsLeft <= 20) {
    return {
      label: formatCountdown(secondsLeft),
      color: COLORS.yellow,
      bg: COLORS.yellowSoft,
      icon: "time-outline",
    };
  }

  return {
    label: formatCountdown(secondsLeft),
    color: COLORS.blue,
    bg: COLORS.blueSoft,
    icon: "timer-outline",
  };
}

function parsePabiliItems(booking) {
  const raw =
    booking?.items ||
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
      line.match(/(?:qty|x)\s*[:\-]?\s*(\d+)/i) ||
      line.match(/^(\d+)\s*x\s+/i) ||
      line.match(/\b(\d+)\s*(pcs|pc|bottle|pack|order|orders)\b/i);

    let qty = qtyMatch ? Number(qtyMatch[1]) : 1;

    let cleanedName = line
      .replace(/(?:qty|quantity)\s*[:\-]?\s*\d+/gi, "")
      .replace(/^\d+\s*x\s+/i, "")
      .replace(/\b\d+\s*(pcs|pc|bottle|pack|order|orders)\b/gi, "")
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

function HeaderStat({ icon, label, value, softColor, iconColor }) {
  return (
    <View style={styles.headerStatCard}>
      <View style={[styles.headerStatIcon, { backgroundColor: softColor }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text style={styles.headerStatValue}>{value}</Text>
      <Text style={styles.headerStatLabel}>{label}</Text>
    </View>
  );
}


function RequestCard({ item, onAccept, onReject, busy }) {
  const booking = item.bookings || {};
  const isPabili = booking.booking_type === "pabili";
  const countdown = getCountdownMeta(item.expires_at);
  const distanceKm = Number(item.distance_km || 0);
  const hasDistance = Number.isFinite(distanceKm) && distanceKm > 0;

  const parsedItems = isPabili ? parsePabiliItems(booking) : [];
  const previewItems = parsedItems.slice(0, 3);
  const extraItemsCount = Math.max(0, parsedItems.length - 3);

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={[styles.badge, isPabili ? styles.badgePabili : styles.badgeRide]}>
          <Ionicons
            name={isPabili ? "bag-handle-outline" : "car-outline"}
            size={14}
            color={isPabili ? COLORS.orange : COLORS.navyLight}
          />
          <Text style={[styles.badgeText, { color: isPabili ? COLORS.orange : COLORS.navyLight }]}>
            {isPabili ? "Pabili" : "Ride"}
          </Text>
        </View>

        <Text style={styles.fareText}>{formatAmount(booking.fare)}</Text>
      </View>

      <View style={styles.metaRow}>
        <View style={[styles.countdownPill, { backgroundColor: countdown.bg }]}>
          <Ionicons name={countdown.icon} size={13} color={countdown.color} />
          <Text style={[styles.countdownPillText, { color: countdown.color }]}>
            {countdown.label === "No timer" ? countdown.label : `Time left ${countdown.label}`}
          </Text>
        </View>

        {hasDistance ? (
          <View style={styles.distancePill}>
            <Ionicons name="navigate-outline" size={13} color={COLORS.gray700} />
            <Text style={styles.distancePillText}>{distanceKm.toFixed(2)} km</Text>
          </View>
        ) : null}
      </View>

      {isPabili ? (
        <>
          <Text style={styles.mainTitle}>{booking.store_name || "Store not set"}</Text>

          <View style={styles.quickInfoRow}>
            <View style={styles.quickInfoPill}>
              <Ionicons name="person-outline" size={14} color={COLORS.gray500} />
              <Text style={styles.quickInfoText} numberOfLines={1}>
                {booking.buyer_name || "Unknown buyer"}
              </Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>Items to buy</Text>

          {previewItems.length > 0 ? (
            <View style={styles.itemsListWrap}>
              {previewItems.map((pItem, index) => (
                <View key={pItem.id || index} style={styles.itemCard}>
                  <View style={styles.itemCardLeft}>
                    <View style={styles.itemBullet}>
                      <Ionicons name="cube-outline" size={14} color={COLORS.orange} />
                    </View>

                    <View style={styles.itemCardTextWrap}>
                      <Text style={styles.itemName} numberOfLines={2}>
                        {pItem.name}
                      </Text>

                      {!!pItem.note ? (
                        <Text style={styles.itemNote} numberOfLines={2}>
                          {pItem.note}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.qtyBadge}>
                    <Text style={styles.qtyBadgeText}>x{pItem.qty || 1}</Text>
                  </View>
                </View>
              ))}

              {extraItemsCount > 0 ? (
                <View style={styles.moreItemsBox}>
                  <Ionicons name="add-circle-outline" size={15} color={COLORS.gray500} />
                  <Text style={styles.moreItemsText}>+{extraItemsCount} more item(s)</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.noItemsBox}>
              <Ionicons name="bag-outline" size={16} color={COLORS.gray400} />
              <Text style={styles.noItemsText}>No item details provided</Text>
            </View>
          )}

          <View style={styles.locationCard}>
            <Ionicons name="location-outline" size={16} color={COLORS.red} />
            <Text style={styles.locationCardText} numberOfLines={2}>
              {booking.dropoff_location || "No delivery location"}
            </Text>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.mainTitle}>Ride Request</Text>

          <View style={styles.routeWrap}>
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: COLORS.green }]} />
              <View style={styles.routeTextWrap}>
                <Text style={styles.routeLabel}>Pickup</Text>
                <Text style={styles.routeText} numberOfLines={1}>
                  {booking.pickup_location || "No pickup"}
                </Text>
              </View>
            </View>

            <View style={styles.routeLine} />

            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: COLORS.red }]} />
              <View style={styles.routeTextWrap}>
                <Text style={styles.routeLabel}>Drop-off</Text>
                <Text style={styles.routeText} numberOfLines={1}>
                  {booking.dropoff_location || "No dropoff"}
                </Text>
              </View>
            </View>
          </View>
        </>
      )}

      <View style={styles.actionRow}>
        <Pressable
          disabled={busy}
          style={[styles.declineBtn, busy && styles.disabledBtn]}
          onPress={() => onReject(item)}
        >
          <Text style={styles.declineBtnText}>{busy ? "Please wait..." : "Reject"}</Text>
        </Pressable>

        <Pressable
          disabled={busy}
          style={[styles.acceptBtn, busy && styles.disabledBtn]}
          onPress={() => onAccept(item)}
        >
          <Text style={styles.acceptBtnText}>{busy ? "Please wait..." : "Accept"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ActiveBookingCard({ booking, onResume, onCancelRide }) {
  if (!booking) return null;

  const isPabili = booking.booking_type === "pabili";
  const canCancel = booking.booking_type === "ride" && canDriverCancelActiveRide(booking);

  return (
    <View style={styles.resumeCard}>
      <View style={styles.resumeTop}>
        <View style={styles.resumeBadge}>
          <Ionicons
            name={isPabili ? "bag-handle-outline" : "car-outline"}
            size={14}
            color="#fff"
          />
          <Text style={styles.resumeBadgeText}>{isPabili ? "Active Pabili" : "Active Ride"}</Text>
        </View>

        <Text style={styles.resumeFare}>{formatAmount(booking.fare)}</Text>
      </View>

      <Text style={styles.resumeTitle}>
        {isPabili ? booking.store_name || "Continue active pabili" : "Continue active ride"}
      </Text>

      <Text style={styles.resumeSub}>
        Status: {booking.status || "-"} • Service: {booking.service_status || "-"} • Payment:{" "}
        {booking.payment_status || "-"}
      </Text>

      <Text style={styles.resumeLocation} numberOfLines={2}>
        {isPabili
          ? booking.dropoff_location || "No delivery location"
          : `${booking.pickup_location || "No pickup"} → ${booking.dropoff_location || "No dropoff"}`}
      </Text>

      <View style={styles.resumeActionRow}>
        <Pressable style={[styles.resumeBtn, { flex: 1 }]} onPress={onResume}>
          <Text style={styles.resumeBtnText}>Resume Active Booking</Text>
        </Pressable>

        {canCancel ? (
          <Pressable style={styles.resumeCancelBtn} onPress={onCancelRide}>
            <Ionicons name="close-circle-outline" size={18} color={COLORS.red} />
            <Text style={styles.resumeCancelBtnText}>Cancel</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function ReasonModal({
  visible,
  title,
  subtitle,
  reasons,
  selectedReason,
  customReason,
  onSelectReason,
  onChangeCustomReason,
  onClose,
  onConfirm,
  loading,
  confirmText = "Confirm",
}) {
  if (!visible) return null;

  const needsCustom = selectedReason === "Other / Iba pa";

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.reasonOverlay}>
        <View style={styles.reasonModalCard}>
          <View style={styles.reasonHandle} />

          <View style={styles.reasonIconWrap}>
            <Ionicons name="alert-circle" size={34} color={COLORS.red} />
          </View>

          <Text style={styles.reasonModalTitle}>{title}</Text>
          <Text style={styles.reasonModalSubtitle}>{subtitle}</Text>

          <ScrollView
            style={styles.reasonList}
            contentContainerStyle={styles.reasonListContent}
            showsVerticalScrollIndicator={false}
          >
            {reasons.map((reason) => {
              const active = selectedReason === reason;
              return (
                <Pressable
                  key={reason}
                  style={[
                    styles.reasonOption,
                    active && styles.reasonOptionActive,
                  ]}
                  onPress={() => onSelectReason(reason)}
                >
                  <View
                    style={[
                      styles.reasonRadio,
                      active && styles.reasonRadioActive,
                    ]}
                  >
                    {active ? <View style={styles.reasonRadioInner} /> : null}
                  </View>

                  <Text
                    style={[
                      styles.reasonOptionText,
                      active && styles.reasonOptionTextActive,
                    ]}
                  >
                    {reason}
                  </Text>
                </Pressable>
              );
            })}

            {needsCustom ? (
              <TextInput
                value={customReason}
                onChangeText={onChangeCustomReason}
                placeholder="Type your reason here..."
                placeholderTextColor={COLORS.gray400}
                multiline
                style={styles.reasonInput}
              />
            ) : null}
          </ScrollView>

          <View style={styles.reasonActionRow}>
            <Pressable
              style={[styles.reasonBtn, styles.reasonBtnGhost]}
              onPress={onClose}
              disabled={loading}
            >
              <Text style={styles.reasonBtnGhostText}>Back</Text>
            </Pressable>

            <Pressable
              style={[styles.reasonBtn, styles.reasonBtnSolid, loading && styles.disabledBtn]}
              onPress={onConfirm}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.reasonBtnSolidText}>{confirmText}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function DriverHomeRequestsScreen() {
  const navigation = useNavigation();
  const channelRef = useRef(null);
  const expireSweepRef = useRef(null);

  const [driverId, setDriverId] = useState(null);
  const [activeTab, setActiveTab] = useState(TABS.RIDES);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyRequestId, setBusyRequestId] = useState(null);
  const [clockTick, setClockTick] = useState(0);

  const [rideRequests, setRideRequests] = useState([]);
  const [pabiliRequests, setPabiliRequests] = useState([]);
  const [activeBooking, setActiveBooking] = useState(null);

  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [cancelRideModalVisible, setCancelRideModalVisible] = useState(false);

  const [selectedRejectReason, setSelectedRejectReason] = useState("");
  const [customRejectReason, setCustomRejectReason] = useState("");
  const [requestToReject, setRequestToReject] = useState(null);

  const [selectedCancelRideReason, setSelectedCancelRideReason] = useState("");
  const [customCancelRideReason, setCustomCancelRideReason] = useState("");

  const [submittingReject, setSubmittingReject] = useState(false);
  const [submittingCancelRide, setSubmittingCancelRide] = useState(false);

  const visibleRideRequests = useMemo(
    () => rideRequests.filter((item) => !isLocallyExpired(item)),
    [rideRequests, clockTick]
  );

  const visiblePabiliRequests = useMemo(
    () => pabiliRequests.filter((item) => !isLocallyExpired(item)),
    [pabiliRequests, clockTick]
  );

  const data = useMemo(
    () => (activeTab === TABS.RIDES ? visibleRideRequests : visiblePabiliRequests),
    [activeTab, visibleRideRequests, visiblePabiliRequests]
  );

  const totalPending = visibleRideRequests.length + visiblePabiliRequests.length;

  useEffect(() => {
    const interval = setInterval(() => {
      setClockTick((v) => v + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const fetchActiveBooking = useCallback(async (currentDriverId) => {
    if (!currentDriverId) return null;

    try {
      log("Fetching active booking...", { driverId: currentDriverId });

      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id,
          booking_type,
          driver_id,
          status,
          service_status,
          payment_status,
          pickup_location,
          pickup_latitude,
          pickup_longitude,
          dropoff_location,
          dropoff_latitude,
          dropoff_longitude,
          fare,
          buyer_name,
          buyer_phone,
          store_name,
          item_description,
          item_name,
          booking_reference,
          created_at,
          accepted_at,
          ride_started_at,
          updated_at
        `)
        .eq("driver_id", currentDriverId)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const active = (data || []).find((booking) => !isFinalBooking(booking)) || null;
      setActiveBooking(active);

      log("Active booking fetched", {
        found: !!active,
        bookingId: active?.id,
        bookingType: active?.booking_type,
        status: active?.status,
        serviceStatus: active?.service_status,
        paymentStatus: active?.payment_status,
      });

      return active;
    } catch (err) {
      console.log("fetchActiveBooking error:", err);
      setActiveBooking(null);
      return null;
    }
  }, []);

  const fetchRequests = useCallback(
    async (currentDriverId) => {
      if (!currentDriverId) return;

      try {
        setLoading(true);
        log("Fetching requests...", { driverId: currentDriverId });

        const { data, error } = await supabase
          .from("booking_requests")
          .select(`
            id,
            booking_id,
            driver_id,
            status,
            distance_km,
            created_at,
            responded_at,
            expires_at,
            bookings (
              id,
              booking_type,
              driver_id,
              pickup_location,
              pickup_latitude,
              pickup_longitude,
              dropoff_location,
              dropoff_latitude,
              dropoff_longitude,
              fare,
              buyer_name,
              buyer_phone,
              store_name,
              item_description,
              item_name,
              service_status,
              status,
              payment_status,
              booking_reference,
              accepted_at,
              ride_started_at,
              updated_at
            )
          `)
          .eq("driver_id", currentDriverId)
          .eq("status", "pending")
          .order("expires_at", { ascending: true })
          .order("created_at", { ascending: true });

        if (error) throw error;

        const validRequests = (data || []).filter((r) => canShowRequest(r.bookings, currentDriverId));
        const rides = validRequests.filter((r) => r.bookings?.booking_type === "ride");
        const pabili = validRequests.filter((r) => r.bookings?.booking_type === "pabili");

        setRideRequests(rides);
        setPabiliRequests(pabili);

        await fetchActiveBooking(currentDriverId);

        log("Requests fetched", {
          rideCount: rides.length,
          pabiliCount: pabili.length,
        });
      } catch (err) {
        console.log("fetchRequests error:", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetchActiveBooking]
  );

  const expireOverdueForDriver = useCallback(async (currentDriverId) => {
    if (!currentDriverId) return 0;

    try {
      const nowIso = new Date().toISOString();

      const { data, error } = await supabase
        .from("booking_requests")
        .update({
          status: "cancelled",
          responded_at: nowIso,
          cancellation_reason: "No response before timeout",
          cancelled_by: "system",
        })
        .eq("driver_id", currentDriverId)
        .eq("status", "pending")
        .not("expires_at", "is", null)
        .lte("expires_at", nowIso)
        .select("id");

      if (error) {
        console.log("expireOverdueForDriver error:", error);
        return 0;
      }

      return data?.length || 0;
    } catch (err) {
      console.log("expireOverdueForDriver catch:", err);
      return 0;
    }
  }, []);

  const setupRealtime = useCallback(
    (currentDriverId) => {
      if (!currentDriverId) return;

      channelRef.current?.unsubscribe?.();

      channelRef.current = supabase
        .channel(`driver-home-requests-${currentDriverId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "booking_requests",
            filter: `driver_id=eq.${currentDriverId}`,
          },
          async (payload) => {
            log("Realtime booking_requests event", payload);
            await fetchRequests(currentDriverId);
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "bookings",
          },
          async (payload) => {
            log("Realtime bookings event", {
              eventType: payload?.eventType,
              newId: payload?.new?.id,
              newDriverId: payload?.new?.driver_id,
              newStatus: payload?.new?.status,
              newServiceStatus: payload?.new?.service_status,
              newPaymentStatus: payload?.new?.payment_status,
            });

            const bookingDriverId = payload?.new?.driver_id;
            if (
              !bookingDriverId ||
              bookingDriverId === currentDriverId ||
              payload?.old?.driver_id === currentDriverId
            ) {
              await fetchRequests(currentDriverId);
            }
          }
        )
        .subscribe((status) => {
          log("Realtime channel status", status);
        });
    },
    [fetchRequests]
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const init = async () => {
        const id = await AsyncStorage.getItem("user_id");
        if (!active || !id) return;

        setDriverId(id);
        log("Driver ID loaded", id);

        await fetchRequests(id);
        setupRealtime(id);
      };

      init();

      return () => {
        active = false;
      };
    }, [fetchRequests, setupRealtime])
  );

  useEffect(() => {
    return () => {
      channelRef.current?.unsubscribe?.();
      if (expireSweepRef.current) {
        clearInterval(expireSweepRef.current);
        expireSweepRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!driverId) return;

    if (expireSweepRef.current) {
      clearInterval(expireSweepRef.current);
    }

    expireSweepRef.current = setInterval(async () => {
      const updated = await expireOverdueForDriver(driverId);
      if (updated > 0) {
        await fetchRequests(driverId);
      }
    }, 10000);

    return () => {
      if (expireSweepRef.current) {
        clearInterval(expireSweepRef.current);
        expireSweepRef.current = null;
      }
    };
  }, [driverId, expireOverdueForDriver, fetchRequests]);

  const handleRefresh = () => {
    if (!driverId) return;
    setRefreshing(true);
    fetchRequests(driverId);
  };

  const handleResumeActiveBooking = useCallback(() => {
    if (!activeBooking?.id) return;

    if (activeBooking.booking_type === "ride") {
      navigation.navigate("DriverTrackRideScreen", { bookingId: activeBooking.id });
    } else {
      navigation.navigate("DriverTrackPabiliScreen", { bookingId: activeBooking.id });
    }
  }, [activeBooking, navigation]);

  const handleAccept = async (request) => {
    const requestId = request?.id;
    const booking = request?.bookings;

    if (!requestId || !booking?.id || !driverId) return;

    try {
      setBusyRequestId(requestId);
      log("Accept request", { requestId, bookingId: booking.id, bookingType: booking.booking_type });

      const { data: latestBooking, error: latestBookingError } = await supabase
        .from("bookings")
        .select("id, driver_id, status, service_status, booking_type")
        .eq("id", booking.id)
        .single();

      if (latestBookingError) throw latestBookingError;

      if (isFinalBooking(latestBooking)) {
        Alert.alert("Unavailable", "This booking is already completed or cancelled.");
        await fetchRequests(driverId);
        return;
      }

      if (latestBooking?.driver_id && latestBooking.driver_id !== driverId) {
        Alert.alert("Already assigned", "This request was already accepted by another driver.");
        await fetchRequests(driverId);
        return;
      }

      const now = new Date().toISOString();
      const nextServiceStatus = "driver_assigned";

      const { error: bookingError } = await supabase
        .from("bookings")
        .update({
          driver_id: driverId,
          status: "accepted",
          accepted_at: now,
          service_status: nextServiceStatus,
          updated_at: now,
        })
        .eq("id", booking.id)
        .or("driver_id.is.null,driver_id.eq." + driverId);

      if (bookingError) throw bookingError;

      const { error: acceptRequestError } = await supabase
        .from("booking_requests")
        .update({
          status: "accepted",
          responded_at: now,
        })
        .eq("id", requestId);

      if (acceptRequestError) throw acceptRequestError;

      const { error: otherRequestsError } = await supabase
        .from("booking_requests")
        .update({
          status: "cancelled",
          responded_at: now,
          cancellation_reason: "Accepted by another driver",
          cancelled_by: "system",
        })
        .eq("booking_id", booking.id)
        .neq("id", requestId)
        .eq("status", "pending");

      if (otherRequestsError) {
        console.log("otherRequestsError:", otherRequestsError);
      }

      await fetchRequests(driverId);

      if (booking.booking_type === "ride") {
        navigation.replace("DriverTrackRideScreen", { bookingId: booking.id });
      } else {
        navigation.replace("DriverTrackPabiliScreen", { bookingId: booking.id });
      }
    } catch (err) {
      console.log("handleAccept error:", err);
      Alert.alert("Accept failed", err?.message || "Unable to accept this request.");
    } finally {
      setBusyRequestId(null);
    }
  };

  const openRejectModal = useCallback((request) => {
    setRequestToReject(request);
    setSelectedRejectReason("");
    setCustomRejectReason("");
    setRejectModalVisible(true);
  }, []);

  const confirmReject = useCallback(async () => {
    if (!requestToReject?.id) return;

    const finalReason =
      selectedRejectReason === "Other / Iba pa"
        ? customRejectReason.trim()
        : selectedRejectReason.trim();

    if (!selectedRejectReason) {
      Alert.alert("Reason required", "Please select a reason first.");
      return;
    }

    if (selectedRejectReason === "Other / Iba pa" && !customRejectReason.trim()) {
      Alert.alert("Reason required", "Please type your reason.");
      return;
    }

    try {
      setSubmittingReject(true);
      setBusyRequestId(requestToReject.id);
      log("Reject request", { request: requestToReject, reason: finalReason });

      const { error } = await supabase
        .from("booking_requests")
        .update({
          status: "rejected",
          responded_at: new Date().toISOString(),
          cancellation_reason: finalReason,
          cancelled_by: "driver",
        })
        .eq("id", requestToReject.id);

      if (error) throw error;

      setRejectModalVisible(false);
      setRequestToReject(null);
      setSelectedRejectReason("");
      setCustomRejectReason("");

      await fetchRequests(driverId);
    } catch (err) {
      console.log("handleReject error:", err);
      Alert.alert("Reject failed", err?.message || "Unable to reject this request.");
    } finally {
      setSubmittingReject(false);
      setBusyRequestId(null);
    }
  }, [
    customRejectReason,
    driverId,
    fetchRequests,
    requestToReject,
    selectedRejectReason,
  ]);

  const openCancelActiveRideModal = useCallback(() => {
    if (!activeBooking?.id || activeBooking.booking_type !== "ride") return;

    setSelectedCancelRideReason("");
    setCustomCancelRideReason("");
    setCancelRideModalVisible(true);
  }, [activeBooking]);

  const confirmCancelActiveRide = useCallback(async () => {
    if (!activeBooking?.id || activeBooking.booking_type !== "ride") return;

    const finalReason =
      selectedCancelRideReason === "Other / Iba pa"
        ? customCancelRideReason.trim()
        : selectedCancelRideReason.trim();

    if (!selectedCancelRideReason) {
      Alert.alert("Reason required", "Please select a reason first.");
      return;
    }

    if (selectedCancelRideReason === "Other / Iba pa" && !customCancelRideReason.trim()) {
      Alert.alert("Reason required", "Please type your reason.");
      return;
    }

    try {
      setSubmittingCancelRide(true);
      const now = new Date().toISOString();

      const { error: bookingError } = await supabase
        .from("bookings")
        .update({
          driver_id: null,
          status: "cancelled",
          service_status: "cancelled",
          cancelled_at: now,
          cancellation_reason: finalReason,
          cancelled_by: "driver",
          updated_at: now,
        })
        .eq("id", activeBooking.id);

      if (bookingError) throw bookingError;

      const { error: requestsError } = await supabase
        .from("booking_requests")
        .update({
          status: "cancelled",
          responded_at: now,
          cancellation_reason: finalReason,
          cancelled_by: "driver",
        })
        .eq("booking_id", activeBooking.id)
        .eq("driver_id", driverId)
        .in("status", ["pending", "accepted"]);

      if (requestsError) throw requestsError;

      setCancelRideModalVisible(false);
      setSelectedCancelRideReason("");
      setCustomCancelRideReason("");

      await fetchRequests(driverId);
    } catch (error) {
      console.log("handleCancelActiveRide error:", error);
      Alert.alert("Cancel failed", error?.message || "Unable to cancel the active ride.");
    } finally {
      setSubmittingCancelRide(false);
    }
  }, [
    activeBooking,
    customCancelRideReason,
    driverId,
    fetchRequests,
    selectedCancelRideReason,
  ]);

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={[COLORS.navy, COLORS.navyLight]} style={styles.header}>
        <View>
          <Text style={styles.headerSub}>Driver Dashboard</Text>
          <Text style={styles.headerTitle}>Incoming Requests</Text>
        </View>

        <View style={styles.headerIconWrap}>
          <Ionicons name="notifications-outline" size={22} color="#fff" />
        </View>
      </LinearGradient>

      <View style={styles.summaryStrip}>
        <HeaderStat
          icon="time-outline"
          label="Available"
          value={totalPending}
          softColor={COLORS.blueSoft}
          iconColor={COLORS.blue}
        />
        <HeaderStat
          icon="car-outline"
          label="Rides"
          value={visibleRideRequests.length}
          softColor="#EAF2FF"
          iconColor={COLORS.navyLight}
        />
        <HeaderStat
          icon="bag-handle-outline"
          label="Pabili"
          value={visiblePabiliRequests.length}
          softColor={COLORS.orangeSoft}
          iconColor={COLORS.orange}
        />
      </View>

      {!!activeBooking && (
        <ActiveBookingCard
          booking={activeBooking}
          onResume={handleResumeActiveBooking}
          onCancelRide={openCancelActiveRideModal}
        />
      )}

      <View style={styles.tabsWrap}>
        <Pressable
          style={[styles.tabBtn, activeTab === TABS.RIDES && styles.tabBtnActive]}
          onPress={() => setActiveTab(TABS.RIDES)}
        >
          <Text style={[styles.tabText, activeTab === TABS.RIDES && styles.tabTextActive]}>
            Rides ({visibleRideRequests.length})
          </Text>
        </Pressable>

        <Pressable
          style={[styles.tabBtn, activeTab === TABS.PABILI && styles.tabBtnActive]}
          onPress={() => setActiveTab(TABS.PABILI)}
        >
          <Text style={[styles.tabText, activeTab === TABS.PABILI && styles.tabTextActive]}>
            Pabili ({visiblePabiliRequests.length})
          </Text>
        </Pressable>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.orange} />
          <Text style={styles.loadingText}>Loading requests...</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          extraData={clockTick}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <RequestCard
              item={item}
              onAccept={handleAccept}
              onReject={openRejectModal}
              busy={busyRequestId === item.id}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="file-tray-outline" size={42} color={COLORS.gray400} />
              <Text style={styles.emptyTitle}>No requests available</Text>
              <Text style={styles.emptySub}>
                {activeTab === TABS.RIDES
                  ? "No ride requests available right now."
                  : "No pabili requests available right now."}
              </Text>
            </View>
          }
        />
      )}

      <ReasonModal
        visible={rejectModalVisible}
        title="Reject request"
        subtitle="Please select the reason why you want to reject this request."
        reasons={REJECT_REASONS}
        selectedReason={selectedRejectReason}
        customReason={customRejectReason}
        onSelectReason={setSelectedRejectReason}
        onChangeCustomReason={setCustomRejectReason}
        onClose={() => {
          if (submittingReject) return;
          setRejectModalVisible(false);
          setRequestToReject(null);
          setSelectedRejectReason("");
          setCustomRejectReason("");
        }}
        onConfirm={confirmReject}
        loading={submittingReject}
        confirmText="Confirm Reject"
      />

      <ReasonModal
        visible={cancelRideModalVisible}
        title="Cancel active ride"
        subtitle="Pwede lang ito kapag hindi pa paid at hindi pa nagsisimula ang ride."
        reasons={CANCEL_RIDE_REASONS}
        selectedReason={selectedCancelRideReason}
        customReason={customCancelRideReason}
        onSelectReason={setSelectedCancelRideReason}
        onChangeCustomReason={setCustomCancelRideReason}
        onClose={() => {
          if (submittingCancelRide) return;
          setCancelRideModalVisible(false);
          setSelectedCancelRideReason("");
          setCustomCancelRideReason("");
        }}
        onConfirm={confirmCancelActiveRide}
        loading={submittingCancelRide}
        confirmText="Confirm Cancel"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray50,
  },

  header: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerSub: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 2,
  },
  headerTitle: {
    color: COLORS.white,
    fontSize: 24,
    fontWeight: "800",
  },
  headerIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  summaryStrip: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 14,
    marginBottom: 4,
  },
  headerStatCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    alignItems: "center",
  },
  headerStatIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  headerStatValue: {
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.gray900,
  },
  headerStatLabel: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.gray500,
  },

  resumeCard: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 6,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  resumeTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  resumeBadge: {
    backgroundColor: COLORS.navyLight,
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  resumeBadgeText: {
    color: COLORS.white,
    fontWeight: "800",
    fontSize: 12,
  },
  resumeFare: {
    fontSize: 18,
    color: COLORS.green,
    fontWeight: "900",
  },
  resumeTitle: {
    marginTop: 12,
    fontSize: 18,
    color: COLORS.gray900,
    fontWeight: "800",
  },
  resumeSub: {
    marginTop: 6,
    fontSize: 13,
    color: COLORS.gray500,
    lineHeight: 19,
  },
  resumeLocation: {
    marginTop: 8,
    fontSize: 14,
    color: COLORS.gray700,
    lineHeight: 21,
  },
  resumeActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
  },
  resumeBtn: {
    backgroundColor: COLORS.orange,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  resumeBtnText: {
    color: COLORS.white,
    fontWeight: "800",
    fontSize: 14,
  },
  resumeCancelBtn: {
    minWidth: 96,
    backgroundColor: COLORS.redSoft,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  resumeCancelBtnText: {
    color: COLORS.red,
    fontWeight: "800",
    fontSize: 14,
  },

  tabsWrap: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
    backgroundColor: COLORS.gray100,
    borderRadius: 16,
    padding: 5,
    flexDirection: "row",
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  tabBtnActive: {
    backgroundColor: COLORS.white,
  },
  tabText: {
    color: COLORS.gray500,
    fontWeight: "700",
    fontSize: 14,
  },
  tabTextActive: {
    color: COLORS.navyLight,
  },

  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 26,
    flexGrow: 1,
  },

  card: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    padding: 16,
    marginBottom: 14,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  badgeRide: {
    backgroundColor: "#EAF2FF",
  },
  badgePabili: {
    backgroundColor: COLORS.orangeSoft,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "800",
  },
  fareText: {
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.green,
  },

  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    gap: 10,
  },
  countdownPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    flexShrink: 1,
  },
  countdownPillText: {
    fontSize: 12,
    fontWeight: "800",
  },
  distancePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.gray100,
  },
  distancePillText: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.gray700,
  },

  mainTitle: {
    marginTop: 14,
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.gray900,
  },
  sectionLabel: {
    marginTop: 10,
    marginBottom: 4,
    fontSize: 12,
    color: COLORS.gray500,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  subText: {
    fontSize: 14,
    color: COLORS.gray700,
    lineHeight: 21,
  },

  infoBlock: {
    marginTop: 12,
    gap: 8,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.gray700,
  },

  routeWrap: {
    marginTop: 14,
    paddingLeft: 4,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginRight: 10,
    marginTop: 4,
  },
  routeTextWrap: {
    flex: 1,
  },
  routeLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.gray500,
    marginBottom: 2,
  },
  routeText: {
    fontSize: 14,
    color: COLORS.gray700,
  },
  routeLine: {
    width: 2,
    height: 18,
    backgroundColor: COLORS.gray200,
    marginLeft: 4,
    marginVertical: 4,
  },

  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  declineBtn: {
    flex: 1,
    backgroundColor: COLORS.redSoft,
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
  },
  declineBtnText: {
    color: COLORS.red,
    fontWeight: "800",
    fontSize: 14,
  },
  acceptBtn: {
    flex: 1,
    backgroundColor: COLORS.orange,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
  },
  acceptBtnText: {
    color: COLORS.white,
    fontWeight: "800",
    fontSize: 14,
  },
  disabledBtn: {
    opacity: 0.6,
  },

  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.gray500,
  },

  emptyWrap: {
    flex: 1,
    minHeight: 280,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 17,
    fontWeight: "800",
    color: COLORS.gray900,
  },
  emptySub: {
    marginTop: 8,
    fontSize: 14,
    textAlign: "center",
    color: COLORS.gray500,
    lineHeight: 21,
  },

  reasonOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: "flex-end",
  },
  reasonModalCard: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 22,
    maxHeight: "85%",
  },
  reasonHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: COLORS.gray200,
    alignSelf: "center",
    marginBottom: 16,
  },
  reasonIconWrap: {
    alignItems: "center",
    marginBottom: 10,
  },
  reasonModalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.gray900,
    textAlign: "center",
  },
  reasonModalSubtitle: {
    marginTop: 8,
    marginBottom: 18,
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.gray500,
    textAlign: "center",
  },
  reasonList: {
    maxHeight: 320,
  },
  reasonListContent: {
    paddingBottom: 6,
  },
  reasonOption: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.gray200,
    backgroundColor: COLORS.white,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  reasonOptionActive: {
    borderColor: COLORS.red,
    backgroundColor: COLORS.redSoft,
  },
  reasonRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.gray400,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  reasonRadioActive: {
    borderColor: COLORS.red,
  },
  reasonRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.red,
  },
  reasonOptionText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.gray700,
    fontWeight: "700",
  },
  reasonOptionTextActive: {
    color: COLORS.red,
    fontWeight: "800",
  },
  reasonInput: {
    minHeight: 95,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.gray200,
    backgroundColor: COLORS.gray100,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.gray900,
    textAlignVertical: "top",
    marginBottom: 8,
  },
  reasonActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  reasonBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  reasonBtnGhost: {
    backgroundColor: COLORS.gray100,
  },
  reasonBtnSolid: {
    backgroundColor: COLORS.red,
  },
  reasonBtnGhostText: {
    color: COLORS.gray900,
    fontWeight: "700",
    fontSize: 14,
  },
  reasonBtnSolidText: {
    color: COLORS.white,
    fontWeight: "800",
    fontSize: 14,
  },
  quickInfoRow: {
  flexDirection: "row",
  gap: 8,
  marginTop: 10,
  flexWrap: "wrap",
},
quickInfoPill: {
  flexDirection: "row",
  alignItems: "center",
  gap: 6,
  backgroundColor: COLORS.gray100,
  borderRadius: 999,
  paddingHorizontal: 10,
  paddingVertical: 7,
  maxWidth: "100%",
},
quickInfoText: {
  fontSize: 12,
  color: COLORS.gray700,
  fontWeight: "700",
  flexShrink: 1,
},

itemsListWrap: {
  marginTop: 6,
  gap: 10,
},
itemCard: {
  borderWidth: 1,
  borderColor: COLORS.gray200,
  backgroundColor: "#FCFCFD",
  borderRadius: 16,
  padding: 12,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
},
itemCardLeft: {
  flex: 1,
  flexDirection: "row",
  alignItems: "flex-start",
  gap: 10,
},
itemBullet: {
  width: 30,
  height: 30,
  borderRadius: 15,
  backgroundColor: COLORS.orangeSoft,
  alignItems: "center",
  justifyContent: "center",
  marginTop: 1,
},
itemCardTextWrap: {
  flex: 1,
},
itemName: {
  fontSize: 14,
  color: COLORS.gray900,
  fontWeight: "800",
  lineHeight: 20,
},
itemNote: {
  marginTop: 3,
  fontSize: 12,
  color: COLORS.gray500,
  lineHeight: 18,
},
qtyBadge: {
  minWidth: 42,
  paddingHorizontal: 10,
  paddingVertical: 8,
  borderRadius: 999,
  backgroundColor: COLORS.navyLight,
  alignItems: "center",
  justifyContent: "center",
},
qtyBadgeText: {
  color: COLORS.white,
  fontSize: 12,
  fontWeight: "900",
},

moreItemsBox: {
  marginTop: 2,
  borderRadius: 14,
  backgroundColor: COLORS.gray100,
  paddingVertical: 10,
  paddingHorizontal: 12,
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
},
moreItemsText: {
  fontSize: 13,
  color: COLORS.gray500,
  fontWeight: "700",
},

noItemsBox: {
  marginTop: 8,
  borderRadius: 14,
  backgroundColor: COLORS.gray100,
  paddingVertical: 12,
  paddingHorizontal: 12,
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
},
noItemsText: {
  fontSize: 13,
  color: COLORS.gray500,
  fontWeight: "600",
},

locationCard: {
  marginTop: 12,
  borderRadius: 16,
  backgroundColor: COLORS.redSoft,
  borderWidth: 1,
  borderColor: "#FECACA",
  paddingHorizontal: 12,
  paddingVertical: 12,
  flexDirection: "row",
  alignItems: "flex-start",
  gap: 8,
},
locationCardText: {
  flex: 1,
  fontSize: 13,
  color: COLORS.gray700,
  lineHeight: 19,
  fontWeight: "600",
},
});