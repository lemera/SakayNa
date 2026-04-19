// PabiliFindingDriverScreen.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Modal,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";

const DEFAULT_SEARCH_RADIUS_KM = 5;
const REQUEST_BATCH_SIZE = 10;
const POLL_INTERVAL_MS = 1000;
const COUNTDOWN_INTERVAL_MS = 1000;
const DRIVER_REQUEST_TIMEOUT_SECONDS = 30;

const CANCEL_REASON_OPTIONS = [
  "Changed my mind",
  "Wrong booking details",
  "Too long to find a driver",
  "I will book again later",
];

const formatAmount = (value) => `₱${Number(value || 0).toFixed(2)}`;

function toRad(value) {
  return (value * Math.PI) / 180;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function generateBookingReference() {
  const random = Math.floor(100000 + Math.random() * 900000);
  return `SKY${random}`;
}

function logStep(label, data = null) {
  if (data !== null && data !== undefined) {
    console.log(`[PabiliFindingDriverScreen] ${label}:`, data);
  } else {
    console.log(`[PabiliFindingDriverScreen] ${label}`);
  }
}

function getExpiryIso(seconds = DRIVER_REQUEST_TIMEOUT_SECONDS) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function getSecondsLeft(expiresAt) {
  if (!expiresAt) return 0;
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / 1000));
}

function formatCountdown(seconds) {
  const safe = Math.max(0, Number(seconds || 0));
  const mm = String(Math.floor(safe / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function isActiveBookingError(error) {
  if (!error) return false;

  return (
    (error.code === "P0001" &&
      (String(error.message || "").includes("ACTIVE_BOOKING_EXISTS") ||
        String(error.details || "").toLowerCase().includes("active booking"))) ||
    (error.code === "23505" &&
      String(error.message || "").includes("one_active_booking_per_commuter"))
  );
}

function getReadableBookingError(error) {
  if (!error) return "Failed to create booking request.";

  if (isActiveBookingError(error)) {
    const existingId = error?.hint;
    return existingId
      ? `You already have an active booking.\n\nReference: ${existingId}\n\nPlease complete or cancel your current booking before creating a new one.`
      : "You already have an active booking.\n\nPlease complete or cancel your current booking before creating a new one.";
  }

  if (error.code === "23503") {
    return "Some booking data is invalid or missing. Please go back and try again.";
  }

  if (error.code === "42501") {
    return "You do not have permission to perform this action.";
  }

  return error.message || "Failed to create booking request.";
}

function CustomAlertModal({
  visible,
  title,
  message,
  type = "info",
  confirmText = "OK",
  cancelText,
  onConfirm,
  onCancel,
}) {
  const iconName =
    type === "error"
      ? "alert-circle"
      : type === "success"
      ? "checkmark-circle"
      : type === "warning"
      ? "warning"
      : "information-circle";

  const iconColor =
    type === "error"
      ? "#EF4444"
      : type === "success"
      ? "#10B981"
      : type === "warning"
      ? "#F59E0B"
      : "#F97316";

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Ionicons name={iconName} size={42} color={iconColor} />
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalMessage}>{message}</Text>

          <View style={styles.modalActions}>
            {!!cancelText && (
              <Pressable style={styles.modalSecondaryBtn} onPress={onCancel}>
                <Text style={styles.modalSecondaryBtnText}>{cancelText}</Text>
              </Pressable>
            )}

            <Pressable style={styles.modalPrimaryBtn} onPress={onConfirm}>
              <Text style={styles.modalPrimaryBtnText}>{confirmText}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function getDriverStatusMeta(request, activePendingRequestId, acceptedDriverId) {
  const status = request?.status || "pending";
  const isActivePending =
    status === "pending" && request?.id && request.id === activePendingRequestId;

  if (acceptedDriverId && request?.driver_id === acceptedDriverId) {
    return {
      label: "Accepted",
      bg: "#DCFCE7",
      text: "#166534",
      icon: "checkmark-circle",
    };
  }

  if (isActivePending) {
    return {
      label: "Waiting",
      bg: "#DBEAFE",
      text: "#1D4ED8",
      icon: "time-outline",
    };
  }

  if (status === "cancelled") {
    return {
      label: "Cancelled",
      bg: "#FEE2E2",
      text: "#B91C1C",
      icon: "close-circle",
    };
  }

  if (status === "accepted") {
    return {
      label: "Accepted",
      bg: "#DCFCE7",
      text: "#166534",
      icon: "checkmark-circle",
    };
  }

  if (status === "rejected") {
    return {
      label: "Declined",
      bg: "#FEF3C7",
      text: "#92400E",
      icon: "close-outline",
    };
  }

  return {
    label: "Pending",
    bg: "#FEF3C7",
    text: "#92400E",
    icon: "hourglass-outline",
  };
}

export default function PabiliFindingDriverScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  const {
    serviceType,
    bookingData,
    totalAmount = 0,
    paymentMethod = "qrph",
  } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [bookingId, setBookingId] = useState(null);
  const [requestedDrivers, setRequestedDrivers] = useState([]);
  const [driverRequests, setDriverRequests] = useState([]);
  const [driverCount, setDriverCount] = useState(0);
  const [statusText, setStatusText] = useState("Preparing your request...");
  const [acceptedDriver, setAcceptedDriver] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const [pendingRequestId, setPendingRequestId] = useState(null);
  const [pendingExpiresAt, setPendingExpiresAt] = useState(null);
  const [countdownSeconds, setCountdownSeconds] = useState(0);

  const [cancelReasonModalVisible, setCancelReasonModalVisible] = useState(false);
  const [selectedCancelReason, setSelectedCancelReason] = useState("");
  const [customCancelReason, setCustomCancelReason] = useState("");

  const [alertState, setAlertState] = useState({
    visible: false,
    title: "",
    message: "",
    type: "info",
    confirmText: "OK",
    cancelText: null,
    onConfirm: null,
    onCancel: null,
  });

  const pollRef = useRef(null);
  const countdownRef = useRef(null);
  const hasStartedRef = useRef(false);
  const noDriversHandledRef = useRef(false);
  const navigatingRef = useRef(false);
  const unmountedRef = useRef(false);
  const lastExpiredRequestIdRef = useRef(null);

  const isPabili = serviceType === "pabili";
  const isPadala = serviceType === "padala";

  const heroColors = isPabili
    ? ["#F97316", "#FB923C"]
    : ["#10B981", "#34D399"];

  const heroTitle = isPabili ? "Finding Driver" : "Finding Delivery Driver";
  const heroSubtitle = isPabili
    ? "We are looking for an available driver near the store."
    : "We are looking for an available driver near the pickup point.";

  const pickupLat = bookingData?.pickup_latitude;
  const pickupLng = bookingData?.pickup_longitude;

  const isValidPayload = useMemo(() => {
    return (
      !!serviceType &&
      !!bookingData &&
      Number(totalAmount) > 0 &&
      pickupLat !== undefined &&
      pickupLng !== undefined &&
      pickupLat !== null &&
      pickupLng !== null
    );
  }, [serviceType, bookingData, totalAmount, pickupLat, pickupLng]);

  const showAlert = ({
    title,
    message,
    type = "info",
    confirmText = "OK",
    cancelText = null,
    onConfirm = null,
    onCancel = null,
  }) => {
    setAlertState({
      visible: true,
      title,
      message,
      type,
      confirmText,
      cancelText,
      onConfirm,
      onCancel,
    });
  };

  const hideAlert = () => {
    setAlertState((prev) => ({
      ...prev,
      visible: false,
    }));
  };

  const clearPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
      logStep("Polling cleared");
    }
  }, []);

  const clearCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
      logStep("Countdown cleared");
    }
  }, []);

  const buildBookingInsertPayload = useCallback(
    (userId) => {
      if (isPabili) {
        return {
          commuter_id: userId,
          booking_reference: generateBookingReference(),
          booking_type: "pabili",

          pickup_location: bookingData.pickup_location,
          pickup_latitude: bookingData.pickup_latitude,
          pickup_longitude: bookingData.pickup_longitude,

          dropoff_location: bookingData.dropoff_location,
          dropoff_latitude: bookingData.dropoff_latitude,
          dropoff_longitude: bookingData.dropoff_longitude,

          fare: Number(totalAmount),
          estimated_fare: Number(totalAmount),
          actual_fare: Number(totalAmount),

          payment_method: "paymongo",
          payment_type: paymentMethod,
          payment_status: "awaiting_payment",

          status: "pending",
          service_status: "waiting_for_driver",

          store_name: bookingData.storeName || null,
          item_type: bookingData.category || null,
          item_name: bookingData.storeName || null,
          item_description: bookingData.items || null,
          notes: bookingData.notes || null,

          buyer_name: bookingData.buyerName || null,
          buyer_phone: bookingData.buyerPhone || null,

          order_estimated_cost: Number(bookingData.budget || 0),
          delivery_fee: Number(bookingData.estimated_delivery_fee || 0),
          service_fee: Number(bookingData.estimated_service_fee || 0),
          app_fee: Number(bookingData.app_fee || 0),

          reimbursement_status: "not_applicable",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }

      if (isPadala) {
        return {
          commuter_id: userId,
          booking_reference: generateBookingReference(),
          booking_type: "padala",

          pickup_location: bookingData.pickup_location,
          pickup_latitude: bookingData.pickup_latitude,
          pickup_longitude: bookingData.pickup_longitude,

          dropoff_location: bookingData.dropoff_location,
          dropoff_latitude: bookingData.dropoff_latitude,
          dropoff_longitude: bookingData.dropoff_longitude,

          fare: Number(totalAmount),
          estimated_fare: Number(totalAmount),
          actual_fare: Number(totalAmount),

          payment_method: "paymongo",
          payment_type: paymentMethod,
          payment_status: "awaiting_payment",

          status: "pending",
          service_status: "waiting_for_driver",

          item_type: bookingData.itemType || null,
          item_name: bookingData.itemName || null,
          item_description: bookingData.itemName || null,
          notes: bookingData.notes || null,

          sender_name: bookingData.senderName || null,
          sender_phone: bookingData.senderPhone || null,
          receiver_name: bookingData.receiverName || null,
          receiver_phone: bookingData.receiverPhone || null,

          is_fragile: !!bookingData.isFragile,
          require_delivery_otp: !!bookingData.requireOtp,

          delivery_fee: Number(bookingData.base_delivery_fee || 0),
          fragile_fee: Number(bookingData.fragile_fee || 0),
          app_fee: Number(bookingData.app_fee || 0),

          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }

      throw new Error("Unsupported service type.");
    },
    [bookingData, isPabili, isPadala, paymentMethod, totalAmount]
  );

  const fetchNearbyDrivers = useCallback(async () => {
    logStep("Fetching nearby drivers", {
      pickupLat,
      pickupLng,
      radiusKm: DEFAULT_SEARCH_RADIUS_KM,
    });

    const { data, error } = await supabase
      .from("driver_locations")
      .select(`
        driver_id,
        latitude,
        longitude,
        is_online,
        drivers!inner (
          id,
          first_name,
          last_name,
          phone,
          status,
          is_active,
          online_status
        )
      `)
      .eq("is_online", true)
      .eq("drivers.status", "approved")
      .eq("drivers.is_active", true)
      .eq("drivers.online_status", "online");

    if (error) {
      logStep("fetchNearbyDrivers supabase error", error);
      throw error;
    }

    const filtered = (data || [])
      .map((row) => {
        const distanceKm = haversineKm(
          Number(pickupLat),
          Number(pickupLng),
          Number(row.latitude),
          Number(row.longitude)
        );

        return {
          driver_id: row.driver_id,
          latitude: row.latitude,
          longitude: row.longitude,
          distance_km: distanceKm,
          driver: row.drivers,
        };
      })
      .filter((row) => row.distance_km <= DEFAULT_SEARCH_RADIUS_KM)
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(0, REQUEST_BATCH_SIZE);

    logStep("Nearby drivers filtered", filtered);
    return filtered;
  }, [pickupLat, pickupLng]);

  const createBooking = useCallback(async () => {
    const userId = await AsyncStorage.getItem("user_id");
    logStep("Retrieved user_id", userId);

    if (!userId) {
      throw new Error("User not found. Please log in again.");
    }

    const payload = buildBookingInsertPayload(userId);
    logStep("Creating booking payload", payload);

    const { data, error } = await supabase
      .from("bookings")
      .insert([payload])
      .select()
      .single();

    if (error) {
      logStep("createBooking error", error);
      throw error;
    }

    logStep("Booking created successfully", data);
    return data;
  }, [buildBookingInsertPayload]);

  const createBookingRequests = useCallback(async (currentBookingId, drivers) => {
    if (!drivers.length) return [];

    const baseNow = Date.now();

    const requestRows = drivers.map((item, index) => ({
      booking_id: currentBookingId,
      driver_id: item.driver_id,
      status: "pending",
      distance_km: Number(item.distance_km.toFixed(3)),
      created_at: new Date().toISOString(),
      expires_at: new Date(
        baseNow + (index + 1) * DRIVER_REQUEST_TIMEOUT_SECONDS * 1000
      ).toISOString(),
    }));

    logStep("Creating booking_requests", requestRows);

    const { data, error } = await supabase
      .from("booking_requests")
      .insert(requestRows)
      .select();

    if (error) {
      logStep("createBookingRequests error", error);
      throw error;
    }

    logStep("booking_requests created successfully", data);
    return data || [];
  }, []);

  const loadDriverRequests = useCallback(async (currentBookingId) => {
    if (!currentBookingId) return [];

    const { data, error } = await supabase
      .from("booking_requests")
      .select("id, booking_id, driver_id, status, distance_km, created_at, responded_at, expires_at, cancellation_reason, cancelled_by")
      .eq("booking_id", currentBookingId)
      .order("created_at", { ascending: true })
      .order("expires_at", { ascending: true });

    if (error) {
      logStep("loadDriverRequests error", error);
      return [];
    }

    setDriverRequests(data || []);
    return data || [];
  }, []);

  const markBookingCancelled = useCallback(
    async (reason = "Cancelled by commuter") => {
      if (!bookingId) return;

      logStep("markBookingCancelled start", { bookingId, reason });

      const { error: bookingError } = await supabase
        .from("bookings")
        .update({
          status: "cancelled",
          service_status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason,
          cancelled_by: "commuter",
          updated_at: new Date().toISOString(),
        })
        .eq("id", bookingId);

      if (bookingError) {
        logStep("markBookingCancelled booking update error", bookingError);
        throw bookingError;
      }

      const { error: requestsError } = await supabase
        .from("booking_requests")
        .update({
          status: "cancelled",
          cancellation_reason: reason,
          cancelled_by: "commuter",
          responded_at: new Date().toISOString(),
        })
        .eq("booking_id", bookingId)
        .eq("status", "pending");

      if (requestsError) {
        logStep("markBookingCancelled booking_requests update error", requestsError);
        throw requestsError;
      }
    },
    [bookingId]
  );

  const handleNoDriversFound = useCallback(
    async (currentBookingId) => {
      if (noDriversHandledRef.current) return;
      noDriversHandledRef.current = true;

      logStep("handleNoDriversFound triggered", { currentBookingId });

      setStatusText("No drivers available right now.");
      clearPolling();
      clearCountdown();

      const { error: bookingError } = await supabase
        .from("bookings")
        .update({
          status: "cancelled",
          service_status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancellation_reason: "No nearby drivers available",
          cancelled_by: "system",
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentBookingId);

      if (bookingError) {
        logStep("handleNoDriversFound booking update error", bookingError);
      }

      const { error: requestError } = await supabase
        .from("booking_requests")
        .update({
          status: "cancelled",
          cancellation_reason: "No nearby drivers available",
          cancelled_by: "system",
          responded_at: new Date().toISOString(),
        })
        .eq("booking_id", currentBookingId)
        .eq("status", "pending");

      if (requestError) {
        logStep("handleNoDriversFound request update error", requestError);
      }

      await loadDriverRequests(currentBookingId);

      showAlert({
        title: "No Drivers Available",
        message:
          "No nearby driver accepted your request. No payment was collected.",
        type: "error",
        confirmText: "Go Back",
        onConfirm: () => {
          hideAlert();
          navigation.goBack();
        },
      });
    },
    [clearCountdown, clearPolling, loadDriverRequests, navigation]
  );

  const syncPendingRequestCountdown = useCallback(async (currentBookingId) => {
    if (!currentBookingId) return { pendingRows: [], latestRows: [] };

    const { data: cancelledCount, error: expireError } = await supabase.rpc(
      "expire_pending_booking_requests",
      { p_booking_id: currentBookingId }
    );

    if (expireError) {
      logStep("syncPendingRequestCountdown expireError", expireError);
    }

    const latestRows = await loadDriverRequests(currentBookingId);

    const pendingRows = (latestRows || []).filter((row) => row.status === "pending");
    const firstPending = pendingRows[0] || null;

    if ((cancelledCount || 0) > 0) {
      const cancelledNoResponseRows = (latestRows || []).filter(
        (row) =>
          row.status === "cancelled" &&
          row.cancellation_reason === "No response before timeout"
      );

      const latestCancelled = cancelledNoResponseRows
        .slice()
        .sort((a, b) => new Date(b.responded_at || 0) - new Date(a.responded_at || 0))[0];

      if (
        latestCancelled?.id &&
        latestCancelled.id !== lastExpiredRequestIdRef.current
      ) {
        lastExpiredRequestIdRef.current = latestCancelled.id;

        if (firstPending) {
          setStatusText("Driver did not respond. Trying the next driver...");
          setTimeout(() => {
            if (!unmountedRef.current && !navigatingRef.current) {
              setStatusText("Waiting for a driver to accept your request...");
            }
          }, 1200);
        } else {
          setStatusText(
            "Driver did not respond. Checking for other available drivers..."
          );
        }
      }
    }

    if (firstPending) {
      setPendingRequestId(firstPending.id);
      setPendingExpiresAt(firstPending.expires_at);
      setCountdownSeconds(getSecondsLeft(firstPending.expires_at));
    } else {
      setPendingRequestId(null);
      setPendingExpiresAt(null);
      setCountdownSeconds(0);
    }

    return {
      pendingRows,
      latestRows,
    };
  }, [loadDriverRequests]);

  const checkAcceptedDriver = useCallback(
    async (currentBookingId) => {
      if (!currentBookingId || navigatingRef.current || unmountedRef.current) {
        logStep("checkAcceptedDriver skipped", {
          currentBookingId,
          navigating: navigatingRef.current,
          unmounted: unmountedRef.current,
        });
        return;
      }

      logStep("Checking accepted driver", { currentBookingId });

      const { data: acceptedRequest, error } = await supabase
        .from("booking_requests")
        .select(`
          id,
          driver_id,
          status,
          responded_at,
          expires_at,
          distance_km,
          drivers!inner (
            id,
            first_name,
            last_name,
            phone
          )
        `)
        .eq("booking_id", currentBookingId)
        .eq("status", "accepted")
        .maybeSingle();

      logStep("acceptedRequest query result", {
        currentBookingId,
        acceptedRequest,
        error,
      });

      if (error) {
        console.log("[PabiliFindingDriverScreen] checkAcceptedDriver error:", error);
        return;
      }

      if (acceptedRequest) {
        const driver = acceptedRequest.drivers;
        const fullName = [driver?.first_name, driver?.last_name]
          .filter(Boolean)
          .join(" ")
          .trim();

        setAcceptedDriver({
          id: acceptedRequest.driver_id,
          name: fullName || "Driver",
          phone: driver?.phone || "",
          distanceKm: acceptedRequest.distance_km || null,
        });

        setStatusText("Driver accepted your request. Preparing payment...");
        clearCountdown();

        const { error: bookingUpdateError } = await supabase
          .from("bookings")
          .update({
            driver_id: acceptedRequest.driver_id,
            status: "accepted",
            service_status: "driver_assigned",
            accepted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentBookingId);

        if (bookingUpdateError) {
          logStep("booking update after accepted error", bookingUpdateError);
        } else {
          logStep("booking updated after driver accepted", {
            currentBookingId,
            driver_id: acceptedRequest.driver_id,
          });
        }

        await loadDriverRequests(currentBookingId);
        clearPolling();

        if (!navigatingRef.current) {
          navigatingRef.current = true;

          logStep("Navigating to PaymentScreen", {
            serviceType,
            bookingId: currentBookingId,
            totalAmount,
            paymentMethod,
          });

          navigation.replace("PaymentScreen", {
            serviceType,
            bookingId: currentBookingId,
            bookingData,
            totalAmount,
            paymentMethod,
          });
        }

        return;
      }

      const { pendingRows } = await syncPendingRequestCountdown(currentBookingId);

      if (!pendingRows.length) {
        logStep("No pending requests left, handling no drivers found", {
          currentBookingId,
        });
        await handleNoDriversFound(currentBookingId);
      }
    },
    [
      bookingData,
      clearCountdown,
      clearPolling,
      handleNoDriversFound,
      loadDriverRequests,
      navigation,
      paymentMethod,
      serviceType,
      syncPendingRequestCountdown,
      totalAmount,
    ]
  );

  const setupFindingFlow = useCallback(async () => {
    if (hasStartedRef.current) {
      logStep("setupFindingFlow skipped - already started");
      return;
    }

    hasStartedRef.current = true;

    try {
      setLoading(true);
      setStatusText("Creating your booking request...");

      const booking = await createBooking();
      setBookingId(booking.id);

      logStep("Booking ID saved to state", booking.id);

      setStatusText("Looking for nearby drivers...");

      const nearbyDrivers = await fetchNearbyDrivers();
      setRequestedDrivers(nearbyDrivers);
      setDriverCount(nearbyDrivers.length);

      if (!nearbyDrivers.length) {
        await handleNoDriversFound(booking.id);
        return;
      }

      await createBookingRequests(booking.id, nearbyDrivers);
      await loadDriverRequests(booking.id);

      setStatusText("Waiting for a driver to accept your request...");

      await checkAcceptedDriver(booking.id);

      pollRef.current = setInterval(() => {
        checkAcceptedDriver(booking.id);
      }, POLL_INTERVAL_MS);

      logStep("Polling started", {
        bookingId: booking.id,
        pollInterval: POLL_INTERVAL_MS,
      });
    } catch (error) {
      console.log("[PabiliFindingDriverScreen] setupFindingFlow error:", error);

      if (isActiveBookingError(error)) {
        showAlert({
          title: "Active Booking Found",
          message: getReadableBookingError(error),
          type: "warning",
          confirmText: "Go Back",
          onConfirm: () => {
            hideAlert();
            navigation.goBack();
          },
        });
        return;
      }

      showAlert({
        title: "Error",
        message: getReadableBookingError(error),
        type: "error",
        confirmText: "Go Back",
        onConfirm: () => {
          hideAlert();
          navigation.goBack();
        },
      });
    } finally {
      setLoading(false);
    }
  }, [
    checkAcceptedDriver,
    createBooking,
    createBookingRequests,
    fetchNearbyDrivers,
    handleNoDriversFound,
    loadDriverRequests,
    navigation,
  ]);

  useEffect(() => {
    unmountedRef.current = false;

    logStep("Screen mounted with params", {
      serviceType,
      bookingData,
      totalAmount,
      paymentMethod,
      isValidPayload,
    });

    if (!isValidPayload) {
      showAlert({
        title: "Invalid Data",
        message: "Missing booking details.",
        type: "error",
        confirmText: "Go Back",
        onConfirm: () => {
          hideAlert();
          navigation.goBack();
        },
      });
      return;
    }

    setupFindingFlow();

    return () => {
      logStep("Screen unmounted");
      unmountedRef.current = true;
      clearPolling();
      clearCountdown();
    };
  }, [
    bookingData,
    clearCountdown,
    clearPolling,
    isValidPayload,
    navigation,
    paymentMethod,
    serviceType,
    setupFindingFlow,
    totalAmount,
  ]);

  useEffect(() => {
    clearCountdown();

    if (!pendingExpiresAt || acceptedDriver || navigatingRef.current) return;

    setCountdownSeconds(getSecondsLeft(pendingExpiresAt));

    countdownRef.current = setInterval(() => {
      const next = getSecondsLeft(pendingExpiresAt);
      setCountdownSeconds(next);

      if (next <= 0) {
        clearCountdown();
      }
    }, COUNTDOWN_INTERVAL_MS);

    return () => clearCountdown();
  }, [acceptedDriver, clearCountdown, pendingExpiresAt]);

  const openCancelReasonModal = () => {
    setSelectedCancelReason("");
    setCustomCancelReason("");
    setCancelReasonModalVisible(true);
  };

  const closeCancelReasonModal = () => {
    if (isCancelling) return;
    setCancelReasonModalVisible(false);
  };

  const getFinalCancelReason = () => {
    const custom = customCancelReason.trim();

    if (selectedCancelReason === "__other__") {
      return custom || "";
    }

    return selectedCancelReason || "";
  };

  const submitCancelWithReason = async () => {
    if (isCancelling || loading) return;

    const finalReason = getFinalCancelReason();

    if (!finalReason) {
      showAlert({
        title: "Reason Required",
        message: "Please select a reason or enter your custom reason.",
        type: "warning",
        confirmText: "OK",
        onConfirm: hideAlert,
      });
      return;
    }

    try {
      setIsCancelling(true);
      clearPolling();
      clearCountdown();
      await markBookingCancelled(finalReason);
      if (bookingId) {
        await loadDriverRequests(bookingId);
      }
      setCancelReasonModalVisible(false);
      navigation.goBack();
    } catch (error) {
      console.log("[PabiliFindingDriverScreen] submitCancelWithReason error:", error);
      showAlert({
        title: "Error",
        message: "Failed to cancel booking.",
        type: "error",
        confirmText: "OK",
        onConfirm: hideAlert,
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const handleCancel = () => {
    if (isCancelling || loading) return;
    openCancelReasonModal();
  };

  const mergedDriverRows = useMemo(() => {
    return requestedDrivers.map((item, index) => {
      const matchedRequest = driverRequests.find(
        (req) => req.driver_id === item.driver_id
      );

      return {
        ...item,
        request: matchedRequest || null,
        key: `${item.driver_id}-${index}`,
      };
    });
  }, [requestedDrivers, driverRequests]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <CustomAlertModal
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
        confirmText={alertState.confirmText}
        cancelText={alertState.cancelText}
        onConfirm={alertState.onConfirm || hideAlert}
        onCancel={alertState.onCancel || hideAlert}
      />

      <Modal
        visible={cancelReasonModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeCancelReasonModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.reasonModalCard}>
            <View style={styles.reasonHeaderRow}>
              <Ionicons name="help-circle-outline" size={26} color="#F97316" />
              <Text style={styles.reasonModalTitle}>Cancel Booking</Text>
            </View>

            <Text style={styles.reasonModalSubtitle}>
              Please select your reason for cancellation.
            </Text>

            <View style={styles.reasonOptionsWrap}>
              {CANCEL_REASON_OPTIONS.map((reason) => {
                const selected = selectedCancelReason === reason;

                return (
                  <Pressable
                    key={reason}
                    style={[
                      styles.reasonOptionBtn,
                      selected && styles.reasonOptionBtnActive,
                    ]}
                    onPress={() => setSelectedCancelReason(reason)}
                    disabled={isCancelling}
                  >
                    <View
                      style={[
                        styles.reasonRadio,
                        selected && styles.reasonRadioActive,
                      ]}
                    >
                      {selected ? <View style={styles.reasonRadioDot} /> : null}
                    </View>

                    <Text
                      style={[
                        styles.reasonOptionText,
                        selected && styles.reasonOptionTextActive,
                      ]}
                    >
                      {reason}
                    </Text>
                  </Pressable>
                );
              })}

              <Pressable
                style={[
                  styles.reasonOptionBtn,
                  selectedCancelReason === "__other__" &&
                    styles.reasonOptionBtnActive,
                ]}
                onPress={() => setSelectedCancelReason("__other__")}
                disabled={isCancelling}
              >
                <View
                  style={[
                    styles.reasonRadio,
                    selectedCancelReason === "__other__" &&
                      styles.reasonRadioActive,
                  ]}
                >
                  {selectedCancelReason === "__other__" ? (
                    <View style={styles.reasonRadioDot} />
                  ) : null}
                </View>

                <Text
                  style={[
                    styles.reasonOptionText,
                    selectedCancelReason === "__other__" &&
                      styles.reasonOptionTextActive,
                  ]}
                >
                  Other reason
                </Text>
              </Pressable>
            </View>

            {selectedCancelReason === "__other__" && (
              <View style={styles.reasonInputWrap}>
                <TextInput
                  value={customCancelReason}
                  onChangeText={setCustomCancelReason}
                  placeholder="Type your reason here..."
                  placeholderTextColor="#9CA3AF"
                  style={styles.reasonInput}
                  multiline
                  editable={!isCancelling}
                />
              </View>
            )}

            <View style={styles.reasonActions}>
              <Pressable
                style={styles.reasonSecondaryBtn}
                onPress={closeCancelReasonModal}
                disabled={isCancelling}
              >
                <Text style={styles.reasonSecondaryBtnText}>Back</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.reasonPrimaryBtn,
                  isCancelling && styles.reasonPrimaryBtnDisabled,
                ]}
                onPress={submitCancelWithReason}
                disabled={isCancelling}
              >
                <Text style={styles.reasonPrimaryBtnText}>
                  {isCancelling ? "Cancelling..." : "Confirm Cancel"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient colors={heroColors} style={styles.heroCard}>
            <View style={styles.heroIconWrap}>
              <Ionicons name="search-outline" size={28} color="#fff" />
            </View>
            <Text style={styles.heroTitle}>{heroTitle}</Text>
            <Text style={styles.heroSubtitle}>{heroSubtitle}</Text>
          </LinearGradient>

          <View style={styles.centerCard}>
            <ActivityIndicator
              size="large"
              color={isPabili ? "#F97316" : "#10B981"}
            />
            <Text style={styles.centerTitle}>Looking for a driver...</Text>
            <Text style={styles.centerText}>{statusText}</Text>

            {pendingExpiresAt && !acceptedDriver ? (
              <Text style={styles.countdownText}>
                {countdownSeconds > 0
                  ? `Response time left: ${formatCountdown(countdownSeconds)}`
                  : "Driver did not respond. Trying the next driver..."}
              </Text>
            ) : null}

            {!!driverCount && (
              <View style={styles.countPill}>
                <Ionicons name="car-outline" size={16} color="#183B5C" />
                <Text style={styles.countPillText}>
                  {driverCount} nearby driver{driverCount > 1 ? "s" : ""} notified
                </Text>
              </View>
            )}
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Booking Summary</Text>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Service</Text>
              <Text style={styles.summaryValue}>
                {isPabili ? "Pabili" : "Padala"}
              </Text>
            </View>

            {!!isPabili && (
              <>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Store</Text>
                  <Text style={styles.summaryValue}>
                    {bookingData?.storeName || "-"}
                  </Text>
                </View>

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Item</Text>
                  <Text style={styles.summaryValue}>
                    {bookingData?.items || "-"}
                  </Text>
                </View>
              </>
            )}

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Pickup</Text>
              <Text style={styles.summaryValue}>
                {bookingData?.pickup_location || "-"}
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Drop-off</Text>
              <Text style={styles.summaryValue}>
                {bookingData?.dropoff_location || "-"}
              </Text>
            </View>

            <View style={[styles.summaryRow, styles.summaryRowTotal]}>
              <Text style={styles.summaryTotalLabel}>Estimated payment</Text>
              <Text style={styles.summaryTotalValue}>
                {formatAmount(totalAmount)}
              </Text>
            </View>
          </View>

          {!!mergedDriverRows.length && (
            <View style={styles.driverListCard}>
              <Text style={styles.driverListTitle}>Requested Drivers</Text>

              {mergedDriverRows.map((item) => {
                const fullName = [
                  item.driver?.first_name,
                  item.driver?.last_name,
                ]
                  .filter(Boolean)
                  .join(" ")
                  .trim();

                const badge = getDriverStatusMeta(
                  item.request,
                  pendingRequestId,
                  acceptedDriver?.id
                );

                return (
                  <View key={item.key} style={styles.driverRow}>
                    <View style={styles.driverAvatar}>
                      <Ionicons name="person-outline" size={18} color="#183B5C" />
                    </View>

                    <View style={styles.driverInfo}>
                      <Text style={styles.driverName}>
                        {fullName || "Driver"}
                      </Text>
                      <Text style={styles.driverDistance}>
                        {Number(item.distance_km || 0).toFixed(2)} km away
                      </Text>

                      {item.request?.cancellation_reason ? (
                        <Text style={styles.driverReason} numberOfLines={2}>
                          {item.request.cancellation_reason}
                        </Text>
                      ) : null}
                    </View>

                    <View style={[styles.dynamicBadge, { backgroundColor: badge.bg }]}>
                      <Ionicons name={badge.icon} size={13} color={badge.text} />
                      <Text style={[styles.dynamicBadgeText, { color: badge.text }]}>
                        {badge.label}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {!!acceptedDriver && (
            <View style={styles.acceptedCard}>
              <Ionicons name="checkmark-circle" size={22} color="#10B981" />
              <Text style={styles.acceptedTitle}>Driver accepted</Text>
              <Text style={styles.acceptedText}>
                {acceptedDriver.name} has accepted your request.
              </Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            style={[
              styles.cancelBtn,
              (isCancelling || loading) && styles.cancelBtnDisabled,
            ]}
            onPress={handleCancel}
            disabled={isCancelling || loading}
          >
            <Text style={styles.cancelBtnText}>
              {isCancelling ? "Cancelling..." : "Cancel"}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  content: { padding: 16, paddingBottom: 110 },

  heroCard: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
  },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 6,
  },
  heroSubtitle: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 14,
    lineHeight: 20,
  },

  centerCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    padding: 22,
    alignItems: "center",
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  centerTitle: {
    marginTop: 14,
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  centerText: {
    marginTop: 6,
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },
  countdownText: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: "800",
    color: "#DC2626",
    textAlign: "center",
  },
  countPill: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#EFF6FF",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  countPillText: {
    color: "#183B5C",
    fontWeight: "700",
    fontSize: 13,
  },

  summaryCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 14,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 14,
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "700",
    flex: 1,
  },
  summaryValue: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "700",
    flex: 1.4,
    textAlign: "right",
  },
  summaryRowTotal: {
    marginTop: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  summaryTotalLabel: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "800",
  },
  summaryTotalValue: {
    fontSize: 18,
    color: "#F97316",
    fontWeight: "900",
  },

  driverListCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
  },
  driverListTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 12,
  },
  driverRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
  },
  driverAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#E0F2FE",
    alignItems: "center",
    justifyContent: "center",
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  driverDistance: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  driverReason: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 3,
    lineHeight: 15,
  },
  dynamicBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  dynamicBadgeText: {
    fontSize: 12,
    fontWeight: "800",
  },

  acceptedCard: {
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    borderRadius: 20,
    padding: 16,
    marginBottom: 10,
  },
  acceptedTitle: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: "800",
    color: "#065F46",
  },
  acceptedText: {
    marginTop: 4,
    fontSize: 13,
    color: "#047857",
    lineHeight: 18,
  },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  cancelBtn: {
    height: 54,
    borderRadius: 18,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnDisabled: {
    opacity: 0.6,
  },
  cancelBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 22,
    alignItems: "center",
  },
  modalTitle: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
  },
  modalMessage: {
    marginTop: 8,
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  modalSecondaryBtn: {
    minWidth: 110,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  modalSecondaryBtnText: {
    color: "#374151",
    fontWeight: "800",
  },
  modalPrimaryBtn: {
    minWidth: 110,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#183B5C",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  modalPrimaryBtnText: {
    color: "#fff",
    fontWeight: "800",
  },

  reasonModalCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 20,
  },
  reasonHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  reasonModalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
  },
  reasonModalSubtitle: {
    marginTop: 10,
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
  },
  reasonOptionsWrap: {
    marginTop: 18,
    gap: 10,
  },
  reasonOptionBtn: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
  },
  reasonOptionBtnActive: {
    borderColor: "#F97316",
    backgroundColor: "#FFF7ED",
  },
  reasonRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  reasonRadioActive: {
    borderColor: "#F97316",
  },
  reasonRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F97316",
  },
  reasonOptionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  reasonOptionTextActive: {
    color: "#C2410C",
  },
  reasonInputWrap: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  reasonInput: {
    minHeight: 86,
    fontSize: 14,
    color: "#111827",
    textAlignVertical: "top",
  },
  reasonActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  reasonSecondaryBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  reasonSecondaryBtnText: {
    color: "#374151",
    fontWeight: "800",
  },
  reasonPrimaryBtn: {
    flex: 1.2,
    height: 50,
    borderRadius: 14,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  reasonPrimaryBtnDisabled: {
    opacity: 0.7,
  },
  reasonPrimaryBtnText: {
    color: "#fff",
    fontWeight: "800",
  },
});