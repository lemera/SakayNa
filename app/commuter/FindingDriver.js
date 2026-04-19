// FindingDriver.js
import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  StatusBar,
  useWindowDimensions,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

const guidelineBaseWidth = 375;
const guidelineBaseHeight = 812;
const TAB_BAR_HEIGHT = 80;
const DRIVER_REQUEST_TIMEOUT_SECONDS = 30;

const C = {
  primary: "#E97A3E",
  text: "#0F0F0F",
  sub: "#9CA3AF",
  muted: "#F4F4F4",
  bg: "#FAFAFA",
  white: "#FFFFFF",
  border: "#EBEBEB",
  success: "#16A34A",
  danger: "#DC2626",
  overlay: "rgba(0,0,0,0.4)",
};

const COMMUTER_CANCEL_REASONS = [
  "Change of plans",
  "Booked by mistake",
  "Found another ride",
  "Other / Iba pa",
];

const getExpiryIso = (seconds = DRIVER_REQUEST_TIMEOUT_SECONDS) =>
  new Date(Date.now() + seconds * 1000).toISOString();

const getSecondsLeft = (expiresAt) => {
  if (!expiresAt) return 0;
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / 1000));
};

const formatCountdown = (seconds) => {
  const safe = Math.max(0, Number(seconds || 0));
  const mm = String(Math.floor(safe / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  return `${mm}:${ss}`;
};

// ─── Custom Alert ─────────────────────────────────────────────────────────────
const CustomAlert = ({
  visible,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "OK",
  cancelText = "Back",
  type = "warning",
  styles,
  ms,
}) => {
  if (!visible) return null;

  const iconMap = {
    success: "checkmark-circle",
    error: "close-circle",
    warning: "alert-circle",
    info: "information-circle",
  };

  const colorMap = {
    success: C.success,
    error: C.danger,
    warning: C.primary,
    info: "#2563EB",
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetPill} />
          <View style={styles.sheetIconRow}>
            <Ionicons
              name={iconMap[type]}
              size={ms(36)}
              color={colorMap[type]}
            />
          </View>
          <Text style={styles.sheetTitle}>{title}</Text>
          <Text style={styles.sheetMsg}>{message}</Text>
          <View style={styles.sheetBtns}>
            {onCancel && (
              <TouchableOpacity
                style={[styles.sheetBtn, styles.sheetBtnGhost]}
                onPress={onCancel}
                activeOpacity={0.8}
              >
                <Text style={styles.sheetBtnGhostTxt}>{cancelText}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.sheetBtn, styles.sheetBtnSolid]}
              onPress={onConfirm}
              activeOpacity={0.8}
            >
              <Text style={styles.sheetBtnSolidTxt}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ─── Cancel Reason Modal ─────────────────────────────────────────────────────
const CancelReasonModal = ({
  visible,
  styles,
  ms,
  selectedReason,
  setSelectedReason,
  customReason,
  setCustomReason,
  onClose,
  onConfirm,
  submitting,
}) => {
  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={() => {
        if (!submitting) onClose?.();
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetPill} />
          <View style={styles.sheetIconRow}>
            <Ionicons name="alert-circle" size={ms(36)} color={C.danger} />
          </View>

          <Text style={styles.sheetTitle}>Cancel booking</Text>
          <Text style={styles.sheetMsg}>
            Please select the reason why you want to cancel your booking.
          </Text>

          <View style={styles.reasonList}>
            {COMMUTER_CANCEL_REASONS.map((reason) => {
              const active = selectedReason === reason;

              return (
                <Pressable
                  key={reason}
                  style={[
                    styles.reasonItem,
                    active && styles.reasonItemActive,
                  ]}
                  onPress={() => setSelectedReason(reason)}
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
                      styles.reasonText,
                      active && styles.reasonTextActive,
                    ]}
                  >
                    {reason}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {selectedReason === "Other / Iba pa" ? (
            <TextInput
              value={customReason}
              onChangeText={setCustomReason}
              placeholder="Type your reason here..."
              placeholderTextColor={C.sub}
              editable={!submitting}
              multiline
              style={styles.reasonInput}
            />
          ) : null}

          <View style={styles.sheetBtns}>
            <TouchableOpacity
              style={[styles.sheetBtn, styles.sheetBtnGhost]}
              onPress={onClose}
              activeOpacity={0.8}
              disabled={submitting}
            >
              <Text style={styles.sheetBtnGhostTxt}>Go back</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.sheetBtn,
                styles.reasonConfirmBtn,
                submitting && { opacity: 0.7 },
              ]}
              onPress={onConfirm}
              activeOpacity={0.8}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={C.white} />
              ) : (
                <Text style={styles.sheetBtnSolidTxt}>Yes, cancel</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function FindingDriverScreen({
  visible,
  bookingId,
  driversWithinRadius,
  proximityRadius,
  onCancel,
  onDriverFound,
  onNoDrivers,
  onExpandRadius,
  onDriverCancelled,
  pickupText,
  dropoffText,
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const isSmall = width < 360;
  const isTablet = width >= 600;

  const sc = (s) => (width / guidelineBaseWidth) * s;
  const vc = (s) => (height / guidelineBaseHeight) * s;
  const mc = (s, f = 0.5) => s + (sc(s) - s) * f;
  const ms = (s) => mc(s);

  const styles = useMemo(
    () =>
      createStyles({ width, height, insets, isSmall, isTablet, sc, vc, mc }),
    [width, height, insets, isSmall, isTablet]
  );

  const [currentDriverIndex, setCurrentDriverIndex] = useState(0);
  const [totalDrivers, setTotalDrivers] = useState(0);
  const [currentDriverName, setCurrentDriverName] = useState("");
  const [currentDriverDistance, setCurrentDriverDistance] = useState("");
  const [findingDriverStatus, setFindingDriverStatus] = useState("");
  const [showErrorAlert, setShowErrorAlert] = useState(false);
  const [showAllCancelledAlert, setShowAllCancelledAlert] = useState(false);
  const [showCancelReasonModal, setShowCancelReasonModal] = useState(false);
  const [selectedCancelReason, setSelectedCancelReason] = useState("");
  const [customCancelReason, setCustomCancelReason] = useState("");
  const [submittingCancel, setSubmittingCancel] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertType, setAlertType] = useState("warning");
  const [accepted, setAccepted] = useState(false);
  const [allDriversCancelled, setAllDriversCancelled] = useState(false);
  const [cancelledCount, setCancelledCount] = useState(0);
  const [currentRequestExpiresAt, setCurrentRequestExpiresAt] = useState(null);
  const [countdownSeconds, setCountdownSeconds] = useState(0);

  const bookingSub = useRef(null);
  const requestsSub = useRef(null);
  const pollingInterval = useRef(null);
  const requestTimeout = useRef(null);
  const pendingRequests = useRef([]);
  const cancelledDrivers = useRef(new Set());
  const cancelReasons = useRef(new Map());
  const isMounted = useRef(true);
  const isStartingRef = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (!visible || !bookingId || accepted || allDriversCancelled) return;
    if (isStartingRef.current) return;

    pendingRequests.current = [];
    startFindingDrivers();
  }, [visible, bookingId, accepted, allDriversCancelled]);

  useEffect(() => {
    if (!currentRequestExpiresAt || accepted || allDriversCancelled) {
      setCountdownSeconds(0);
      return;
    }

    setCountdownSeconds(getSecondsLeft(currentRequestExpiresAt));

    const interval = setInterval(() => {
      const next = getSecondsLeft(currentRequestExpiresAt);
      setCountdownSeconds(next);

      if (next <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentRequestExpiresAt, accepted, allDriversCancelled]);

  const cleanup = () => {
    if (bookingSub.current) {
      supabase.removeChannel(bookingSub.current);
      bookingSub.current = null;
    }
    if (requestsSub.current) {
      supabase.removeChannel(requestsSub.current);
      requestsSub.current = null;
    }
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
    if (requestTimeout.current) {
      clearTimeout(requestTimeout.current);
      requestTimeout.current = null;
    }
    setCurrentRequestExpiresAt(null);
    setCountdownSeconds(0);
    isStartingRef.current = false;
  };

  const startFindingDrivers = async () => {
    try {
      isStartingRef.current = true;
      setCancelledCount(0);
      setCurrentDriverIndex(0);
      setTotalDrivers(0);
      setCurrentDriverName("");
      setCurrentDriverDistance("");
      setFindingDriverStatus("Searching nearby drivers...");
      setCurrentRequestExpiresAt(null);
      setCountdownSeconds(0);
      cancelledDrivers.current.clear();
      cancelReasons.current.clear();
      setAllDriversCancelled(false);
      await findAndNotifyDrivers();
    } finally {
      isStartingRef.current = false;
    }
  };

  const calcDist = (lat1, lon1, lat2, lon2) => {
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

  const findAndNotifyDrivers = async () => {
    try {
      const { data: drivers, error } = await supabase
        .from("driver_locations")
        .select(`
          driver_id,
          latitude,
          longitude,
          drivers!inner(
            id,
            first_name,
            last_name,
            status,
            is_active,
            expo_push_token,
            online_status
          )
        `)
        .eq("is_online", true)
        .eq("drivers.status", "approved")
        .eq("drivers.is_active", true)
        .eq("drivers.online_status", "online");

      if (error) throw error;

      if (!drivers?.length) {
        await handleNoDrivers();
        return;
      }

      const { data: booking, error: bErr } = await supabase
        .from("bookings")
        .select("pickup_latitude, pickup_longitude, status")
        .eq("id", bookingId)
        .single();

      if (bErr) throw bErr;

      if (!booking || booking.status !== "pending") {
        return;
      }

      const { data: busyBookings, error: busyErr } = await supabase
        .from("bookings")
        .select("driver_id, status, payment_status, service_status")
        .not("driver_id", "is", null)
        .or(
          [
            "status.eq.accepted",
            "payment_status.eq.paid",
            "service_status.eq.waiting_for_driver",
            "service_status.eq.driver_assigned",
            "service_status.eq.awaiting_payment",
            "service_status.eq.paid",
            "service_status.eq.purchasing",
            "service_status.eq.purchased",
            "service_status.eq.picked_up",
            "service_status.eq.in_transit",
          ].join(",")
        );

      if (busyErr) throw busyErr;

      const busyDriverIds = new Set(
        (busyBookings || []).map((item) => item.driver_id).filter(Boolean)
      );

      const availableDrivers = drivers.filter(
        (d) => !busyDriverIds.has(d.driver_id)
      );

      if (!availableDrivers.length) {
        await cancelBookingInDatabase(
          "All nearby drivers are currently busy",
          "system"
        );
        setAlertTitle("No Available Drivers");
        setAlertMessage(
          "All nearby drivers are currently busy. You can try again later or adjust the search radius."
        );
        setAlertType("warning");
        setShowAllCancelledAlert(true);
        return;
      }

      const withDist = availableDrivers.map((d) => ({
        driver_id: d.driver_id,
        distance: calcDist(
          booking.pickup_latitude,
          booking.pickup_longitude,
          d.latitude,
          d.longitude
        ),
        first_name: d.drivers.first_name,
        last_name: d.drivers.last_name,
        expo_push_token: d.drivers.expo_push_token,
      }));

      const sorted = withDist
        .filter((d) => d.distance <= proximityRadius)
        .sort((a, b) => a.distance - b.distance);

      if (!sorted.length) {
        await handleNoDriversNearby();
        return;
      }

      pendingRequests.current = sorted;
      setTotalDrivers(sorted.length);
      setCurrentDriverIndex(0);

      await sendRequest(sorted[0], 0, sorted.length);
      setupRealtime();
    } catch (err) {
      console.log("[FindingDriverScreen] findAndNotifyDrivers error:", err);
      await handleNoDrivers();
    }
  };

  const sendRequest = async (driver, index, total) => {
    try {
      setCurrentDriverName(`${driver.first_name} ${driver.last_name}`);
      setCurrentDriverDistance(`${driver.distance.toFixed(1)} km away`);
      setFindingDriverStatus(`Contacting driver ${index + 1} of ${total}`);

      const { data: bCheck } = await supabase
        .from("bookings")
        .select("status, driver_id")
        .eq("id", bookingId)
        .single();

      if (bCheck?.status !== "pending") {
        if (bCheck?.status === "accepted" && !accepted) {
          handleDriverAccepted(bCheck.driver_id);
        }
        return;
      }

      const { data: existingBusyBooking, error: busyCheckErr } = await supabase
        .from("bookings")
        .select("id, status, payment_status, service_status")
        .eq("driver_id", driver.driver_id)
        .or(
          [
            "status.eq.accepted",
            "payment_status.eq.paid",
            "service_status.eq.waiting_for_driver",
            "service_status.eq.driver_assigned",
            "service_status.eq.awaiting_payment",
            "service_status.eq.paid",
            "service_status.eq.purchasing",
            "service_status.eq.purchased",
            "service_status.eq.picked_up",
            "service_status.eq.in_transit",
          ].join(",")
        )
        .limit(1);

      if (busyCheckErr) {
        console.log("[FindingDriverScreen] busyCheckErr:", busyCheckErr);
        nextDriver(index + 1, total);
        return;
      }

      if (existingBusyBooking?.length) {
        console.log(
          "[FindingDriverScreen] driver already busy, skipping:",
          driver.driver_id
        );
        cancelReasons.current.set(driver.driver_id, "Driver is currently busy");
        cancelledDrivers.current.add(driver.driver_id);
        setCancelledCount((p) => p + 1);
        nextDriver(index + 1, total);
        return;
      }

      const expiresAt = getExpiryIso(DRIVER_REQUEST_TIMEOUT_SECONDS);

      const { error: rErr } = await supabase.from("booking_requests").insert({
        booking_id: bookingId,
        driver_id: driver.driver_id,
        status: "pending",
        distance_km: driver.distance,
        created_at: new Date().toISOString(),
        expires_at: expiresAt,
      });

      if (rErr) {
        console.log("[FindingDriverScreen] booking request insert error:", rErr);
        nextDriver(index + 1, total);
        return;
      }

      setCurrentRequestExpiresAt(expiresAt);
      setCountdownSeconds(getSecondsLeft(expiresAt));

      if (driver.expo_push_token) {
        fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: driver.expo_push_token,
            sound: "default",
            title: "New Booking Request",
            body: `Pickup: ${pickupText || "your area"} → ${
              dropoffText || "destination"
            } (${driver.distance.toFixed(1)}km)`,
            data: { type: "booking_request", booking_id: bookingId },
          }),
        }).catch(() => {});
      }

      if (requestTimeout.current) clearTimeout(requestTimeout.current);

      requestTimeout.current = setTimeout(async () => {
        const { data: b } = await supabase
          .from("bookings")
          .select("status")
          .eq("id", bookingId)
          .single();

        if (b?.status === "pending" && !accepted) {
          const { data: expiredCount, error: expireErr } = await supabase.rpc(
            "expire_pending_booking_requests",
            { p_booking_id: bookingId }
          );

          if (expireErr) {
            console.log(
              "[FindingDriverScreen] expire_pending_booking_requests error:",
              expireErr
            );
            return;
          }

          if ((expiredCount || 0) > 0) {
  cancelReasons.current.set(driver.driver_id, "No response");
  cancelledDrivers.current.add(driver.driver_id);
  setCancelledCount((p) => p + 1);

  setCurrentRequestExpiresAt(null);
  setCountdownSeconds(0);

  if (index + 1 < total) {
    setFindingDriverStatus("Driver did not respond. Trying the next driver...");
  } else {
    setFindingDriverStatus("Driver did not respond. Checking for other available drivers...");
  }

  setTimeout(() => {
    nextDriver(index + 1, total);
  }, 1200);
}
        }
      }, DRIVER_REQUEST_TIMEOUT_SECONDS * 1000 + 250);
    } catch (err) {
      console.log("[FindingDriverScreen] sendRequest error:", err);
      nextDriver(index + 1, total);
    }
  };

  const nextDriver = async (nextIdx, total) => {
    if (requestTimeout.current) {
      clearTimeout(requestTimeout.current);
      requestTimeout.current = null;
    }

    setCurrentRequestExpiresAt(null);
    setCountdownSeconds(0);

    const { data: b } = await supabase
      .from("bookings")
      .select("status, driver_id")
      .eq("id", bookingId)
      .single();

    if (b?.status !== "pending") {
      if (b?.status === "accepted" && !accepted) {
        handleDriverAccepted(b.driver_id);
      }
      return;
    }

    const allProcessed = nextIdx >= pendingRequests.current.length;
    const allCancelled =
      cancelledDrivers.current.size >= pendingRequests.current.length;

    if (allProcessed || allCancelled) {
      const { error: expireErr } = await supabase.rpc(
        "expire_pending_booking_requests",
        { p_booking_id: bookingId }
      );

      if (expireErr) {
        console.log(
          "[FindingDriverScreen] nextDriver expire_pending_booking_requests error:",
          expireErr
        );
      }

      const { data: pending } = await supabase
        .from("booking_requests")
        .select("id")
        .eq("booking_id", bookingId)
        .eq("status", "pending");

      if (pending?.length && !accepted) {
        setTimeout(() => nextDriver(nextIdx, total), 5000);
        return;
      }

      if (!accepted && !allDriversCancelled) {
        setAllDriversCancelled(true);

        const last = Array.from(cancelledDrivers.current).pop();
        const reason = cancelReasons.current.get(last);
        const drv = pendingRequests.current.find((d) => d.driver_id === last);

        if (drv && onDriverCancelled) {
          onDriverCancelled(
            drv.driver_id,
            drv.first_name,
            reason || "Driver cancelled"
          );
        } else {
          handleAllDriversCancelled();
        }
      }
      return;
    }

    if (nextIdx < pendingRequests.current.length) {
      setCurrentDriverIndex(nextIdx);
      await sendRequest(pendingRequests.current[nextIdx], nextIdx, total);
    }
  };

  const handleDriverAccepted = (driverId) => {
    if (accepted) return;
    setAccepted(true);
    setCurrentRequestExpiresAt(null);
    setCountdownSeconds(0);
    cleanup();
    if (isMounted.current && onDriverFound) onDriverFound(driverId);
  };

  const handleAllDriversCancelled = async () => {
    await supabase
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: "No nearby driver available",
        cancelled_by: "system",
      })
      .eq("id", bookingId);

    setAlertTitle("No Drivers Available");
    setAlertMessage(
      "No nearby driver can accept your booking right now. You can try again later or adjust the search radius on the HomeScreen."
    );
    setAlertType("warning");
    setShowAllCancelledAlert(true);
  };

  const cancelBookingInDatabase = async (
    reason = "No driver available",
    cancelledBy = "system"
  ) => {
    try {
      await supabase
        .from("bookings")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason,
          cancelled_by: cancelledBy,
        })
        .eq("id", bookingId)
        .eq("status", "pending");

      await supabase
        .from("booking_requests")
        .update({
          status: "cancelled",
          responded_at: new Date().toISOString(),
          cancellation_reason: reason,
        })
        .eq("booking_id", bookingId)
        .eq("status", "pending");
    } catch (err) {
      console.log("[FindingDriverScreen] cancelBookingInDatabase error:", err);
    }
  };

  const setupRealtime = () => {
    bookingSub.current = supabase
      .channel(`booking-${bookingId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bookings",
          filter: `id=eq.${bookingId}`,
        },
        (p) => {
          if (!isMounted.current) return;

          if (p.new.status === "accepted" && !accepted) {
            handleDriverAccepted(p.new.driver_id);
          } else if (
            p.new.status === "cancelled" &&
            !accepted &&
            !allDriversCancelled
          ) {
            cleanup();
            if (isMounted.current && onCancel) onCancel();
          }
        }
      )
      .subscribe();

    requestsSub.current = supabase
      .channel(`booking-reqs-${bookingId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "booking_requests",
          filter: `booking_id=eq.${bookingId}`,
        },
        (p) => {
          const cur = pendingRequests.current[currentDriverIndex];

          if (
  cur &&
  p.new.driver_id === cur.driver_id &&
  !accepted &&
  (p.new.status === "rejected" || p.new.status === "cancelled")
) {
            const reason =
              p.new.cancellation_reason ||
              (p.new.status === "cancelled" ? "No response" : "Driver declined");

            cancelReasons.current.set(cur.driver_id, reason);
            cancelledDrivers.current.add(cur.driver_id);
            setCancelledCount((prev) => prev + 1);

            if (requestTimeout.current) {
              clearTimeout(requestTimeout.current);
              requestTimeout.current = null;
            }

            setCurrentRequestExpiresAt(null);
            setCountdownSeconds(0);

            if (
              cancelledDrivers.current.size >= pendingRequests.current.length
            ) {
              const last = Array.from(cancelledDrivers.current).pop();
              const drv = pendingRequests.current.find(
                (d) => d.driver_id === last
              );
              if (drv && onDriverCancelled) {
                onDriverCancelled(
                  drv.driver_id,
                  drv.first_name,
                  cancelReasons.current.get(last)
                );
              }
            }

            nextDriver(currentDriverIndex + 1, totalDrivers);
          }
        }
      )
      .subscribe();

    startPolling();
  };

  const startPolling = () => {
    let attempts = 0;

    if (pollingInterval.current) clearInterval(pollingInterval.current);

    pollingInterval.current = setInterval(async () => {
      if (!isMounted.current || accepted || allDriversCancelled) {
        clearInterval(pollingInterval.current);
        pollingInterval.current = null;
        return;
      }

      attempts++;

      try {
        const { data: b } = await supabase
          .from("bookings")
          .select("status, driver_id")
          .eq("id", bookingId)
          .single();

        if (b?.status === "accepted" && !accepted) {
          handleDriverAccepted(b.driver_id);
          return;
        } else if (
          b?.status === "cancelled" &&
          !accepted &&
          !allDriversCancelled
        ) {
          cleanup();
          if (isMounted.current && onCancel) onCancel();
          return;
        }

        const { error: expireErr } = await supabase.rpc(
          "expire_pending_booking_requests",
          { p_booking_id: bookingId }
        );

        if (expireErr) {
          console.log(
            "[FindingDriverScreen] startPolling expire_pending_booking_requests error:",
            expireErr
          );
        }

        if (
          attempts >= 120 &&
          b?.status === "pending" &&
          !accepted &&
          !allDriversCancelled
        ) {
          const { data: pr } = await supabase
            .from("booking_requests")
            .select("id")
            .eq("booking_id", bookingId)
            .eq("status", "pending");

          if (!pr?.length) {
            if (cancelledDrivers.current.size > 0) {
              const last = Array.from(cancelledDrivers.current).pop();
              const drv = pendingRequests.current.find(
                (d) => d.driver_id === last
              );
              if (drv && onDriverCancelled) {
                onDriverCancelled(
                  drv.driver_id,
                  drv.first_name,
                  cancelReasons.current.get(last)
                );
              }
            } else {
              await cancelBookingInDatabase(
                "Search timed out with no driver response",
                "system"
              );

              setAlertTitle("No Drivers Available");
              setAlertMessage(
                "No driver accepted your booking in time. Please try again later or adjust the search radius."
              );
              setAlertType("warning");
              setShowErrorAlert(true);
            }
          }
        }
      } catch (err) {
        console.log("[FindingDriverScreen] polling error:", err);
      }
    }, 1000);
  };

  const handleNoDrivers = async () => {
    await cancelBookingInDatabase("No online drivers available", "system");

    setAlertTitle("No Drivers Available");
    setAlertMessage(
      "There are no online drivers right now. Please try again later."
    );
    setAlertType("error");
    setShowErrorAlert(true);

    if (onNoDrivers) onNoDrivers();
  };

  const handleNoDriversNearby = async () => {
    await cancelBookingInDatabase(
      `No driver found within ${proximityRadius} km`,
      "system"
    );

    setAlertTitle("No Drivers Nearby");
    setAlertMessage(
      `No driver found within ${proximityRadius} km. You can adjust the radius on the HomeScreen.`
    );
    setAlertType("warning");
    setShowErrorAlert(true);
  };

  const openCancelReasonModal = () => {
    setSelectedCancelReason("");
    setCustomCancelReason("");
    setShowCancelReasonModal(true);
  };

  const confirmCancel = async () => {
    const finalReason =
      selectedCancelReason === "Other / Iba pa"
        ? customCancelReason.trim()
        : selectedCancelReason.trim();

    if (!selectedCancelReason) {
      setAlertTitle("Reason Required");
      setAlertMessage("Please select a cancellation reason first.");
      setAlertType("warning");
      setShowCancelReasonModal(false);
      setShowErrorAlert(true);
      return;
    }

    if (
      selectedCancelReason === "Other / Iba pa" &&
      !customCancelReason.trim()
    ) {
      setAlertTitle("Reason Required");
      setAlertMessage("Please type your cancellation reason.");
      setAlertType("warning");
      setShowCancelReasonModal(false);
      setShowErrorAlert(true);
      return;
    }

    try {
      setSubmittingCancel(true);
      setShowCancelReasonModal(false);

      await supabase
        .from("bookings")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancellation_reason: finalReason,
          cancelled_by: "commuter",
        })
        .eq("id", bookingId);

      await supabase
        .from("booking_requests")
        .update({
          status: "cancelled",
          responded_at: new Date().toISOString(),
          cancellation_reason: finalReason,
        })
        .eq("booking_id", bookingId)
        .eq("status", "pending");

      cleanup();
      if (onCancel) onCancel();
    } catch (err) {
      console.log("[FindingDriverScreen] confirmCancel error:", err);
      setAlertTitle("Cancel Failed");
      setAlertMessage("Unable to cancel booking right now. Please try again.");
      setAlertType("error");
      setShowErrorAlert(true);
    } finally {
      setSubmittingCancel(false);
    }
  };

  const handleErrorRetry = async () => {
    setShowErrorAlert(false);

    if (alertTitle === "No Drivers Nearby") {
      cleanup();
      if (onExpandRadius) onExpandRadius();
      return;
    }

    await cancelBookingInDatabase("Retry requested after failed driver search");

    cleanup();
    if (onCancel) onCancel();
  };

  const handleTryAgain = async () => {
    setShowAllCancelledAlert(false);

    await cancelBookingInDatabase("User chose to try again later");

    cleanup();
    if (onCancel) onCancel();
  };

  if (!visible) return null;

  const progress =
    totalDrivers > 0
      ? Math.min(((currentDriverIndex + 1) / totalDrivers) * 100, 100)
      : 0;

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.hero}>
          <View style={styles.spinnerRing}>
            <ActivityIndicator size="large" color={C.primary} />
          </View>
          <Text style={styles.heroTitle}>Finding your driver</Text>
          <Text style={styles.heroSub}>
            Matching you with the nearest driver
          </Text>
        </View>

        <View style={styles.routeCard}>
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: C.success }]} />
            <Text style={styles.routeText} numberOfLines={1}>
              {pickupText || "Pickup location"}
            </Text>
          </View>
          <View style={styles.routeDivider} />
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: C.danger }]} />
            <Text style={styles.routeText} numberOfLines={1}>
              {dropoffText || "Drop-off location"}
            </Text>
          </View>
        </View>

        <View style={styles.statsStrip}>
          <View style={styles.statItem}>
            <Text style={styles.statVal}>{driversWithinRadius}</Text>
            <Text style={styles.statLbl}>In range</Text>
          </View>
          <View style={styles.statSep} />
          <View style={styles.statItem}>
            <Text style={styles.statVal}>{proximityRadius} km</Text>
            <Text style={styles.statLbl}>Radius</Text>
          </View>
          <View style={styles.statSep} />
          <View style={styles.statItem}>
            <Text
              style={[
                styles.statVal,
                cancelledCount > 0 && { color: C.danger },
              ]}
            >
              {cancelledCount}
            </Text>
            <Text style={styles.statLbl}>Skipped/Declined</Text>
          </View>
        </View>

        <View style={styles.driverCard}>
          <View style={styles.driverCardTop}>
            <Text style={styles.driverCardTopLbl}>Matching status</Text>
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveTxt}>LIVE</Text>
            </View>
          </View>

          <Text style={styles.statusLine}>
            {findingDriverStatus || "Searching nearby drivers…"}
          </Text>

          {currentRequestExpiresAt && !accepted ? (
  <Text style={styles.countdownLine}>
    {countdownSeconds > 0
      ? `Response time left: ${formatCountdown(countdownSeconds)}`
      : "Driver did not respond. Trying the next driver..."}
  </Text>
) : null}

          {currentDriverName ? (
            <View style={styles.driverInfo}>
              <Text style={styles.driverName} numberOfLines={1}>
                {currentDriverName}
              </Text>
              <View style={styles.distBadge}>
                <Ionicons
                  name="location-outline"
                  size={ms(12)}
                  color={C.success}
                />
                <Text style={styles.distTxt}>{currentDriverDistance}</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.driverPlaceholder}>Preparing requests…</Text>
          )}

          {totalDrivers > 0 && (
            <View style={styles.progressBlock}>
              <View style={styles.progressTrack}>
                <View
                  style={[styles.progressFill, { width: `${progress}%` }]}
                />
              </View>
              <View style={styles.progressMeta}>
                <Text style={styles.progressLbl}>
                  Driver {Math.min(currentDriverIndex + 1, totalDrivers)} of{" "}
                  {totalDrivers}
                </Text>
                <Text style={styles.progressPct}>{Math.round(progress)}%</Text>
              </View>
            </View>
          )}

          <Pressable style={styles.cancelBtn} onPress={openCancelReasonModal}>
            <Text style={styles.cancelTxt}>Cancel booking</Text>
          </Pressable>
        </View>
      </ScrollView>

      <CancelReasonModal
        visible={showCancelReasonModal}
        styles={styles}
        ms={ms}
        selectedReason={selectedCancelReason}
        setSelectedReason={setSelectedCancelReason}
        customReason={customCancelReason}
        setCustomReason={setCustomCancelReason}
        onClose={() => setShowCancelReasonModal(false)}
        onConfirm={confirmCancel}
        submitting={submittingCancel}
      />

      <CustomAlert
        visible={showErrorAlert}
        title={alertTitle}
        message={alertMessage}
        onConfirm={() => {
          if (alertTitle === "No Drivers Nearby") {
            handleErrorRetry();
            return;
          }

          handleErrorRetry();
        }}
        onCancel={() => {
          setShowErrorAlert(false);
          cleanup();
          if (onCancel) onCancel();
        }}
        confirmText={
          alertTitle === "No Drivers Nearby" ? "Adjust radius" : "OK"
        }
        cancelText="Close"
        type={alertType}
        styles={styles}
        ms={ms}
      />

      <Modal
        transparent
        visible={showAllCancelledAlert}
        animationType="fade"
        onRequestClose={() => setShowAllCancelledAlert(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetPill} />
            <View style={styles.sheetIconRow}>
              <Ionicons name="alert-circle" size={ms(36)} color={C.primary} />
            </View>
            <Text style={styles.sheetTitle}>No driver available</Text>
            <Text style={styles.sheetMsg}>
              All nearby drivers are currently busy, declined, or did not
              respond.
            </Text>

            <TouchableOpacity
              style={styles.optRow}
              onPress={handleTryAgain}
              activeOpacity={0.8}
            >
              <View style={[styles.optIcon, { backgroundColor: "#EDFAF3" }]}>
                <Ionicons
                  name="refresh-outline"
                  size={ms(18)}
                  color={C.success}
                />
              </View>
              <View style={styles.optText}>
                <Text style={styles.optTitle}>Try again later</Text>
                <Text style={styles.optDesc}>
                  Return to Home and book again
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={ms(16)}
                color={C.sub}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optRow}
              onPress={() => {
                setShowAllCancelledAlert(false);
                cleanup();
                if (onExpandRadius) onExpandRadius();
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.optIcon, { backgroundColor: "#EFF6FF" }]}>
                <Ionicons
                  name="options-outline"
                  size={ms(18)}
                  color="#2563EB"
                />
              </View>
              <View style={styles.optText}>
                <Text style={styles.optTitle}>Adjust radius</Text>
                <Text style={styles.optDesc}>
                  Go back and increase search radius
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={ms(16)}
                color={C.sub}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optRow}
              onPress={() => {
                setShowAllCancelledAlert(false);
                cleanup();
                if (onCancel) onCancel();
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.optIcon, { backgroundColor: "#FEF2F2" }]}>
                <Ionicons
                  name="close-outline"
                  size={ms(18)}
                  color={C.danger}
                />
              </View>
              <View style={styles.optText}>
                <Text style={styles.optTitle}>Cancel booking</Text>
                <Text style={styles.optDesc}>Stop searching and go back</Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={ms(16)}
                color={C.sub}
              />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
function createStyles({
  width,
  height,
  insets,
  isSmall,
  isTablet,
  sc,
  vc,
  mc,
}) {
  const px = isTablet ? mc(28) : isSmall ? mc(16) : mc(20);
  const androidTop =
    Platform.OS === "android" ? Math.max(StatusBar.currentHeight || 0, 8) : 0;
  const bottomPad = TAB_BAR_HEIGHT + Math.max(insets.bottom, 0) + vc(20);
  const sheetBot = Math.max(insets.bottom + vc(16), 24);

  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: C.bg,
    },

    scroll: {
      flexGrow: 1,
      paddingHorizontal: px,
      paddingTop: Platform.OS === "android" ? androidTop + vc(8) : vc(10),
      paddingBottom: bottomPad,
    },

    hero: {
      alignItems: "center",
      paddingTop: vc(12),
      paddingBottom: vc(20),
    },

    spinnerRing: {
      width: mc(isSmall ? 56 : isTablet ? 76 : 64),
      height: mc(isSmall ? 56 : isTablet ? 76 : 64),
      borderRadius: mc(isSmall ? 28 : isTablet ? 38 : 32),
      borderWidth: 1.5,
      borderColor: C.border,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: vc(14),
      backgroundColor: C.white,
    },

    heroTitle: {
      fontSize: mc(isSmall ? 19 : isTablet ? 26 : 22),
      fontWeight: "700",
      color: C.text,
      letterSpacing: -0.4,
    },

    heroSub: {
      marginTop: vc(5),
      fontSize: mc(isSmall ? 12 : 13),
      color: C.sub,
      textAlign: "center",
    },

    routeCard: {
      backgroundColor: C.white,
      borderRadius: mc(14),
      paddingVertical: vc(12),
      paddingHorizontal: mc(14),
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: vc(10),
    },

    routeRow: {
      flexDirection: "row",
      alignItems: "center",
    },

    routeDot: {
      width: mc(7),
      height: mc(7),
      borderRadius: mc(4),
      marginRight: mc(10),
    },

    routeText: {
      flex: 1,
      fontSize: mc(isSmall ? 12.5 : 13.5),
      color: C.text,
      fontWeight: "500",
    },

    routeDivider: {
      width: 1,
      height: vc(14),
      backgroundColor: C.border,
      marginLeft: mc(3),
      marginVertical: vc(5),
    },

    statsStrip: {
      flexDirection: "row",
      backgroundColor: C.white,
      borderRadius: mc(14),
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: vc(10),
      paddingVertical: vc(12),
    },

    statItem: {
      flex: 1,
      alignItems: "center",
    },

    statSep: {
      width: 1,
      backgroundColor: C.border,
      marginVertical: vc(2),
    },

    statVal: {
      fontSize: mc(isSmall ? 14 : 16),
      fontWeight: "700",
      color: C.text,
      letterSpacing: -0.2,
    },

    statLbl: {
      marginTop: vc(2),
      fontSize: mc(isSmall ? 10 : 11),
      color: C.sub,
    },

    driverCard: {
      backgroundColor: C.white,
      borderRadius: mc(16),
      borderWidth: 1,
      borderColor: C.border,
      padding: mc(isSmall ? 14 : 16),
    },

    driverCardTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: vc(10),
    },

    driverCardTopLbl: {
      fontSize: mc(isSmall ? 11 : 12),
      color: C.sub,
      fontWeight: "500",
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },

    livePill: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#F0FDF4",
      borderRadius: mc(999),
      paddingHorizontal: mc(8),
      paddingVertical: vc(4),
      gap: mc(5),
    },

    liveDot: {
      width: mc(6),
      height: mc(6),
      borderRadius: mc(3),
      backgroundColor: C.success,
    },

    liveTxt: {
      fontSize: mc(10),
      fontWeight: "700",
      color: C.success,
      letterSpacing: 0.5,
    },

    statusLine: {
      fontSize: mc(isSmall ? 13 : 14),
      fontWeight: "600",
      color: C.text,
      marginBottom: vc(6),
    },

    countdownLine: {
      fontSize: mc(isSmall ? 12 : 13),
      fontWeight: "700",
      color: C.danger,
      marginBottom: vc(10),
    },

    driverInfo: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: vc(4),
    },

    driverName: {
      flex: 1,
      fontSize: mc(isSmall ? 16 : isTablet ? 20 : 18),
      fontWeight: "700",
      color: C.text,
      letterSpacing: -0.3,
      marginRight: mc(8),
    },

    distBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: mc(3),
      backgroundColor: "#F0FDF4",
      borderRadius: mc(999),
      paddingHorizontal: mc(8),
      paddingVertical: vc(4),
    },

    distTxt: {
      fontSize: mc(isSmall ? 11 : 12),
      fontWeight: "600",
      color: C.success,
    },

    driverPlaceholder: {
      fontSize: mc(isSmall ? 12.5 : 13.5),
      color: C.sub,
      marginBottom: vc(4),
    },

    progressBlock: {
      marginTop: vc(14),
    },

    progressTrack: {
      height: vc(4),
      backgroundColor: C.muted,
      borderRadius: mc(999),
      overflow: "hidden",
    },

    progressFill: {
      height: "100%",
      backgroundColor: C.primary,
      borderRadius: mc(999),
    },

    progressMeta: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: vc(6),
    },

    progressLbl: {
      fontSize: mc(11),
      color: C.sub,
    },

    progressPct: {
      fontSize: mc(11),
      fontWeight: "700",
      color: C.text,
    },

    cancelBtn: {
      marginTop: vc(16),
      paddingVertical: vc(13),
      borderRadius: mc(12),
      borderWidth: 1,
      borderColor: "#FECACA",
      backgroundColor: "#FFF5F5",
      alignItems: "center",
    },

    cancelTxt: {
      fontSize: mc(isSmall ? 13.5 : 14),
      fontWeight: "700",
      color: C.danger,
    },

    overlay: {
      flex: 1,
      backgroundColor: C.overlay,
      justifyContent: "flex-end",
    },

    sheet: {
      backgroundColor: C.white,
      borderTopLeftRadius: mc(24),
      borderTopRightRadius: mc(24),
      paddingHorizontal: px,
      paddingTop: vc(10),
      paddingBottom: sheetBot,
      maxHeight: height * 0.82,
    },

    sheetPill: {
      width: mc(36),
      height: vc(4),
      borderRadius: mc(999),
      backgroundColor: C.border,
      alignSelf: "center",
      marginBottom: vc(18),
    },

    sheetIconRow: {
      alignItems: "center",
      marginBottom: vc(12),
    },

    sheetTitle: {
      fontSize: mc(isSmall ? 17 : 20),
      fontWeight: "700",
      color: C.text,
      textAlign: "center",
      letterSpacing: -0.3,
    },

    sheetMsg: {
      fontSize: mc(isSmall ? 12.5 : 13.5),
      color: C.sub,
      textAlign: "center",
      lineHeight: mc(isSmall ? 18 : 20),
      marginTop: vc(8),
      marginBottom: vc(18),
    },

    sheetBtns: {
      flexDirection: "row",
      gap: mc(10),
      marginTop: vc(8),
    },

    sheetBtn: {
      flex: 1,
      minHeight: vc(48),
      borderRadius: mc(12),
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: mc(12),
    },

    sheetBtnGhost: {
      backgroundColor: C.white,
      borderWidth: 1,
      borderColor: C.border,
    },

    sheetBtnSolid: {
      backgroundColor: C.primary,
    },

    sheetBtnGhostTxt: {
      fontSize: mc(13.5),
      fontWeight: "700",
      color: C.text,
    },

    sheetBtnSolidTxt: {
      fontSize: mc(13.5),
      fontWeight: "700",
      color: C.white,
    },

    reasonList: {
      gap: vc(10),
      marginBottom: vc(14),
    },

    reasonItem: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.white,
      borderRadius: mc(14),
      paddingVertical: vc(12),
      paddingHorizontal: mc(12),
    },

    reasonItemActive: {
      borderColor: C.primary,
      backgroundColor: "#FFF7ED",
    },

    reasonRadio: {
      width: mc(20),
      height: mc(20),
      borderRadius: mc(10),
      borderWidth: 1.5,
      borderColor: "#D1D5DB",
      alignItems: "center",
      justifyContent: "center",
      marginRight: mc(10),
      backgroundColor: C.white,
    },

    reasonRadioActive: {
      borderColor: C.primary,
    },

    reasonRadioInner: {
      width: mc(10),
      height: mc(10),
      borderRadius: mc(5),
      backgroundColor: C.primary,
    },

    reasonText: {
      flex: 1,
      fontSize: mc(13),
      color: C.text,
      fontWeight: "500",
    },

    reasonTextActive: {
      color: C.primary,
      fontWeight: "700",
    },

    reasonInput: {
      minHeight: vc(90),
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: mc(14),
      backgroundColor: "#FAFAFA",
      paddingHorizontal: mc(12),
      paddingVertical: vc(12),
      color: C.text,
      textAlignVertical: "top",
      marginBottom: vc(10),
      fontSize: mc(13),
    },

    reasonConfirmBtn: {
      backgroundColor: C.danger,
    },

    optRow: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: mc(14),
      paddingVertical: vc(12),
      paddingHorizontal: mc(12),
      marginTop: vc(10),
      backgroundColor: C.white,
    },

    optIcon: {
      width: mc(40),
      height: mc(40),
      borderRadius: mc(12),
      alignItems: "center",
      justifyContent: "center",
      marginRight: mc(12),
    },

    optText: {
      flex: 1,
    },

    optTitle: {
      fontSize: mc(13.5),
      fontWeight: "700",
      color: C.text,
    },

    optDesc: {
      marginTop: vc(2),
      fontSize: mc(11.5),
      color: C.sub,
      lineHeight: mc(16),
    },
  });
}