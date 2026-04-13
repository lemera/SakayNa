// screens/commuter/FindingDriver.js
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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

const guidelineBaseWidth  = 375;
const guidelineBaseHeight = 812;
const TAB_BAR_HEIGHT      = 80;

const C = {
  primary:    "#E97A3E",
  text:       "#0F0F0F",
  sub:        "#9CA3AF",
  muted:      "#F4F4F4",
  bg:         "#FAFAFA",
  white:      "#FFFFFF",
  border:     "#EBEBEB",
  success:    "#16A34A",
  danger:     "#DC2626",
  overlay:    "rgba(0,0,0,0.4)",
};

// ─── Custom Alert ─────────────────────────────────────────────────────────────
const CustomAlert = ({ visible, title, message, onConfirm, onCancel,
  confirmText = "OK", cancelText = "Back", type = "warning", styles, ms }) => {
  if (!visible) return null;

  const iconMap   = { success: "checkmark-circle", error: "close-circle", warning: "alert-circle", info: "information-circle" };
  const colorMap  = { success: C.success, error: C.danger, warning: C.primary, info: "#2563EB" };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetPill} />
          <View style={styles.sheetIconRow}>
            <Ionicons name={iconMap[type]} size={ms(36)} color={colorMap[type]} />
          </View>
          <Text style={styles.sheetTitle}>{title}</Text>
          <Text style={styles.sheetMsg}>{message}</Text>
          <View style={styles.sheetBtns}>
            {onCancel && (
              <TouchableOpacity style={[styles.sheetBtn, styles.sheetBtnGhost]} onPress={onCancel} activeOpacity={0.8}>
                <Text style={styles.sheetBtnGhostTxt}>{cancelText}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.sheetBtn, styles.sheetBtnSolid]} onPress={onConfirm} activeOpacity={0.8}>
              <Text style={styles.sheetBtnSolidTxt}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function FindingDriverScreen({
  visible, bookingId, driversWithinRadius, proximityRadius,
  onCancel, onDriverFound, onNoDrivers, onExpandRadius, onDriverCancelled,
  pickupText, dropoffText,
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const isSmall  = width < 360;
  const isTablet = width >= 600;

  const sc  = (s) => (width  / guidelineBaseWidth)  * s;
  const vc  = (s) => (height / guidelineBaseHeight) * s;
  const mc  = (s, f = 0.5) => s + (sc(s) - s) * f;
  const ms  = (s) => mc(s);

  const styles = useMemo(
    () => createStyles({ width, height, insets, isSmall, isTablet, sc, vc, mc }),
    [width, height, insets]
  );

  const [currentDriverIndex,    setCurrentDriverIndex]    = useState(0);
  const [totalDrivers,          setTotalDrivers]          = useState(0);
  const [currentDriverName,     setCurrentDriverName]     = useState("");
  const [currentDriverDistance, setCurrentDriverDistance] = useState("");
  const [findingDriverStatus,   setFindingDriverStatus]   = useState("");
  const [showCancelAlert,       setShowCancelAlert]       = useState(false);
  const [showErrorAlert,        setShowErrorAlert]        = useState(false);
  const [showAllCancelledAlert, setShowAllCancelledAlert] = useState(false);
  const [alertTitle,            setAlertTitle]            = useState("");
  const [alertMessage,          setAlertMessage]          = useState("");
  const [alertType,             setAlertType]             = useState("warning");
  const [accepted,              setAccepted]              = useState(false);
  const [allDriversCancelled,   setAllDriversCancelled]   = useState(false);
  const [cancelledCount,        setCancelledCount]        = useState(0);

  const bookingSub          = useRef(null);
  const requestsSub         = useRef(null);
  const pollingInterval     = useRef(null);
  const requestTimeout      = useRef(null);
  const pendingRequests     = useRef([]);
  const cancelledDrivers    = useRef(new Set());
  const cancelReasons       = useRef(new Map());
  const isMounted           = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; cleanup(); };
  }, []);

  useEffect(() => {
    if (visible && bookingId && !accepted && !allDriversCancelled) startFindingDrivers();
  }, [visible, bookingId]);

  const cleanup = () => {
    if (bookingSub.current)      { supabase.removeChannel(bookingSub.current);    bookingSub.current    = null; }
    if (requestsSub.current)     { supabase.removeChannel(requestsSub.current);   requestsSub.current   = null; }
    if (pollingInterval.current) { clearInterval(pollingInterval.current);        pollingInterval.current = null; }
    if (requestTimeout.current)  { clearTimeout(requestTimeout.current);          requestTimeout.current  = null; }
  };

  const startFindingDrivers = async () => {
    setCancelledCount(0);
    cancelledDrivers.current.clear();
    cancelReasons.current.clear();
    setAllDriversCancelled(false);
    await findAndNotifyDrivers();
  };

  const findAndNotifyDrivers = async () => {
    try {
      const { data: drivers, error } = await supabase
        .from("driver_locations")
        .select(`driver_id, latitude, longitude,
          drivers!inner(id, first_name, last_name, status, is_active, expo_push_token)`)
        .eq("is_online", true)
        .eq("drivers.status", "approved")
        .eq("drivers.is_active", true);

      if (error) throw error;
      if (!drivers?.length) { handleNoDrivers(); return; }

      const { data: booking, error: bErr } = await supabase
        .from("bookings").select("pickup_latitude, pickup_longitude").eq("id", bookingId).single();
      if (bErr) throw bErr;

      const withDist = drivers.map((d) => ({
        driver_id:       d.driver_id,
        distance:        calcDist(booking.pickup_latitude, booking.pickup_longitude, d.latitude, d.longitude),
        first_name:      d.drivers.first_name,
        last_name:       d.drivers.last_name,
        expo_push_token: d.drivers.expo_push_token,
      }));

      const sorted = withDist.filter((d) => d.distance <= proximityRadius).sort((a, b) => a.distance - b.distance);
      if (!sorted.length) { handleNoDriversNearby(); return; }

      pendingRequests.current = sorted;
      setTotalDrivers(sorted.length);
      setCurrentDriverIndex(0);
      await sendRequest(sorted[0], 0, sorted.length);
      setupRealtime();
    } catch { handleNoDrivers(); }
  };

  const calcDist = (lat1, lon1, lat2, lon2) => {
    const R = 6371, dLat = ((lat2 - lat1) * Math.PI) / 180, dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const sendRequest = async (driver, index, total) => {
    try {
      setCurrentDriverName(`${driver.first_name} ${driver.last_name}`);
      setCurrentDriverDistance(`${driver.distance.toFixed(1)} km away`);
      setFindingDriverStatus(`Contacting driver ${index + 1} of ${total}`);

      const { data: bCheck } = await supabase.from("bookings").select("status, driver_id").eq("id", bookingId).single();
      if (bCheck?.status !== "pending") {
        if (bCheck?.status === "accepted" && !accepted) handleDriverAccepted(bCheck.driver_id);
        return;
      }

      const { error: rErr } = await supabase.from("booking_requests").insert({
        booking_id: bookingId, driver_id: driver.driver_id, status: "pending",
        distance_km: driver.distance, created_at: new Date().toISOString(),
      });
      if (rErr) { nextDriver(index + 1, total); return; }

      if (driver.expo_push_token) {
        fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            to: driver.expo_push_token, sound: "default", title: "New Booking Request",
            body: `Pickup: ${pickupText || "your area"} → ${dropoffText || "destination"} (${driver.distance.toFixed(1)}km)`,
            data: { type: "booking_request", booking_id: bookingId },
          }),
        }).catch(() => {});
      }

      if (requestTimeout.current) clearTimeout(requestTimeout.current);
      requestTimeout.current = setTimeout(async () => {
        const { data: b } = await supabase.from("bookings").select("status").eq("id", bookingId).single();
        if (b?.status === "pending" && !accepted) {
          await supabase.from("booking_requests")
            .update({ status: "expired", responded_at: new Date().toISOString(), cancellation_reason: "No response" })
            .eq("booking_id", bookingId).eq("driver_id", driver.driver_id);
          cancelReasons.current.set(driver.driver_id, "No response");
          cancelledDrivers.current.add(driver.driver_id);
          setCancelledCount((p) => p + 1);
          nextDriver(index + 1, total);
        }
      }, 30000);
    } catch { nextDriver(index + 1, total); }
  };

  const nextDriver = async (nextIdx, total) => {
    if (requestTimeout.current) { clearTimeout(requestTimeout.current); requestTimeout.current = null; }
    const { data: b } = await supabase.from("bookings").select("status, driver_id").eq("id", bookingId).single();
    if (b?.status !== "pending") { if (b?.status === "accepted" && !accepted) handleDriverAccepted(b.driver_id); return; }

    const allProcessed = nextIdx >= pendingRequests.current.length;
    const allCancelled = cancelledDrivers.current.size === pendingRequests.current.length;

    if (allProcessed || allCancelled) {
      const { data: pending } = await supabase.from("booking_requests").select("id").eq("booking_id", bookingId).eq("status", "pending");
      if (pending?.length && !accepted) { setTimeout(() => nextDriver(nextIdx, total), 5000); return; }
      if (!accepted && !allDriversCancelled) {
        setAllDriversCancelled(true);
        const last   = Array.from(cancelledDrivers.current).pop();
        const reason = cancelReasons.current.get(last);
        const drv    = pendingRequests.current.find((d) => d.driver_id === last);
        if (drv && onDriverCancelled) onDriverCancelled(drv.driver_id, drv.first_name, reason || "Driver cancelled");
        else handleAllDriversCancelled();
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
    cleanup();
    if (isMounted.current && onDriverFound) onDriverFound(driverId);
  };

  const handleAllDriversCancelled = () => {
    supabase.from("bookings").update({ status: "cancelled", cancelled_at: new Date().toISOString(),
      cancellation_reason: "All drivers cancelled or rejected", cancelled_by: "system" }).eq("id", bookingId);
    setAlertTitle("No Drivers Available");
    setAlertMessage(`All ${totalDrivers} nearby drivers rejected or did not respond.`);
    setAlertType("warning");
    setShowAllCancelledAlert(true);
  };

  const setupRealtime = () => {
    bookingSub.current = supabase.channel(`booking-${bookingId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bookings", filter: `id=eq.${bookingId}` },
        (p) => {
          if (!isMounted.current) return;
          if (p.new.status === "accepted" && !accepted) handleDriverAccepted(p.new.driver_id);
          else if (p.new.status === "cancelled" && !accepted && !allDriversCancelled) { cleanup(); if (isMounted.current && onCancel) onCancel(); }
        })
      .subscribe();

    requestsSub.current = supabase.channel(`booking-reqs-${bookingId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "booking_requests", filter: `booking_id=eq.${bookingId}` },
        (p) => {
          const cur = pendingRequests.current[currentDriverIndex];
          if (cur && p.new.driver_id === cur.driver_id && !accepted && p.new.status === "rejected") {
            const reason = p.new.cancellation_reason || "Driver declined";
            cancelReasons.current.set(cur.driver_id, reason);
            cancelledDrivers.current.add(cur.driver_id);
            setCancelledCount((prev) => prev + 1);
            if (requestTimeout.current) { clearTimeout(requestTimeout.current); requestTimeout.current = null; }
            if (cancelledDrivers.current.size === pendingRequests.current.length) {
              const last = Array.from(cancelledDrivers.current).pop();
              const drv  = pendingRequests.current.find((d) => d.driver_id === last);
              if (drv && onDriverCancelled) onDriverCancelled(drv.driver_id, drv.first_name, cancelReasons.current.get(last));
            }
            nextDriver(currentDriverIndex + 1, totalDrivers);
          }
        })
      .subscribe();

    startPolling();
  };

  const startPolling = () => {
    let attempts = 0;
    if (pollingInterval.current) clearInterval(pollingInterval.current);
    pollingInterval.current = setInterval(async () => {
      if (!isMounted.current || accepted || allDriversCancelled) { clearInterval(pollingInterval.current); pollingInterval.current = null; return; }
      attempts++;
      try {
        const { data: b } = await supabase.from("bookings").select("status, driver_id").eq("id", bookingId).single();
        if (b?.status === "accepted" && !accepted) handleDriverAccepted(b.driver_id);
        else if (b?.status === "cancelled" && !accepted && !allDriversCancelled) { cleanup(); if (isMounted.current && onCancel) onCancel(); }
        if (attempts >= 120 && b?.status === "pending" && !accepted && !allDriversCancelled) {
          const { data: pr } = await supabase.from("booking_requests").select("id").eq("booking_id", bookingId).eq("status", "pending");
          if (!pr?.length) {
            if (cancelledDrivers.current.size > 0) {
              const last = Array.from(cancelledDrivers.current).pop();
              const drv  = pendingRequests.current.find((d) => d.driver_id === last);
              if (drv && onDriverCancelled) onDriverCancelled(drv.driver_id, drv.first_name, cancelReasons.current.get(last));
            } else handleAllDriversCancelled();
          }
        }
      } catch {}
    }, 1000);
  };

  const handleNoDrivers = () => {
    setAlertTitle("No Drivers Available");
    setAlertMessage("There are no online drivers right now. Please try again.");
    setAlertType("error");
    setShowErrorAlert(true);
    if (onNoDrivers) onNoDrivers();
  };

  const handleNoDriversNearby = () => {
    setAlertTitle("No Drivers Nearby");
    setAlertMessage(`No driver found within ${proximityRadius} km. Expand search area?`);
    setAlertType("warning");
    setShowErrorAlert(true);
  };

  const confirmCancel = async () => {
    setShowCancelAlert(false);
    await supabase.from("bookings").update({ status: "cancelled", cancelled_at: new Date().toISOString(),
      cancellation_reason: "Cancelled by commuter", cancelled_by: "commuter" }).eq("id", bookingId);
    await supabase.from("booking_requests").update({ status: "cancelled", responded_at: new Date().toISOString() })
      .eq("booking_id", bookingId).eq("status", "pending");
    cleanup();
    if (onCancel) onCancel();
  };

  const handleErrorRetry = () => {
    setShowErrorAlert(false);
    if (alertTitle === "No Drivers Nearby") { if (onExpandRadius) onExpandRadius(); return; }
    setAllDriversCancelled(false); setCancelledCount(0);
    cancelledDrivers.current.clear(); cancelReasons.current.clear();
    setAccepted(false); startFindingDrivers();
  };

  const handleTryAgain = () => {
    setShowAllCancelledAlert(false); setAllDriversCancelled(false); setCancelledCount(0);
    cancelledDrivers.current.clear(); cancelReasons.current.clear();
    setAccepted(false); startFindingDrivers();
  };

  if (!visible) return null;

  const progress = totalDrivers > 0
    ? Math.min(((currentDriverIndex + 1) / totalDrivers) * 100, 100)
    : 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <View style={styles.hero}>
          <View style={styles.spinnerRing}>
            <ActivityIndicator size="large" color={C.primary} />
          </View>
          <Text style={styles.heroTitle}>Finding your driver</Text>
          <Text style={styles.heroSub}>Matching you with the nearest driver</Text>
        </View>

        {/* ── Route pill ──────────────────────────────────────────────── */}
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

        {/* ── Stats strip ─────────────────────────────────────────────── */}
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
            <Text style={[styles.statVal, cancelledCount > 0 && { color: C.danger }]}>
              {cancelledCount}
            </Text>
            <Text style={styles.statLbl}>Declined</Text>
          </View>
        </View>

        {/* ── Driver status card ──────────────────────────────────────── */}
        <View style={styles.driverCard}>
          {/* Header */}
          <View style={styles.driverCardTop}>
            <Text style={styles.driverCardTopLbl}>Matching status</Text>
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveTxt}>LIVE</Text>
            </View>
          </View>

          {/* Status line */}
          <Text style={styles.statusLine}>
            {findingDriverStatus || "Searching nearby drivers…"}
          </Text>

          {/* Driver name + distance */}
          {currentDriverName ? (
            <View style={styles.driverInfo}>
              <Text style={styles.driverName} numberOfLines={1}>{currentDriverName}</Text>
              <View style={styles.distBadge}>
                <Ionicons name="location-outline" size={ms(12)} color={C.success} />
                <Text style={styles.distTxt}>{currentDriverDistance}</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.driverPlaceholder}>Preparing requests…</Text>
          )}

          {/* Progress bar */}
          {totalDrivers > 0 && (
            <View style={styles.progressBlock}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress}%` }]} />
              </View>
              <View style={styles.progressMeta}>
                <Text style={styles.progressLbl}>
                  Driver {Math.min(currentDriverIndex + 1, totalDrivers)} of {totalDrivers}
                </Text>
                <Text style={styles.progressPct}>{Math.round(progress)}%</Text>
              </View>
            </View>
          )}

          {/* Cancel */}
          <Pressable style={styles.cancelBtn} onPress={() => setShowCancelAlert(true)}>
            <Text style={styles.cancelTxt}>Cancel booking</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      <CustomAlert
        visible={showCancelAlert}
        title="Cancel booking?"
        message="Your request will be removed from all nearby drivers."
        onConfirm={confirmCancel}
        onCancel={() => setShowCancelAlert(false)}
        confirmText="Yes, cancel"
        cancelText="Go back"
        type="warning"
        styles={styles}
        ms={ms}
      />

      <CustomAlert
        visible={showErrorAlert}
        title={alertTitle}
        message={alertMessage}
        onConfirm={handleErrorRetry}
        confirmText={alertTitle === "No Drivers Nearby" ? "Expand radius" : "Try again"}
        type={alertType}
        styles={styles}
        ms={ms}
      />

      <Modal transparent visible={showAllCancelledAlert} animationType="fade" onRequestClose={() => setShowAllCancelledAlert(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetPill} />
            <View style={styles.sheetIconRow}>
              <Ionicons name="alert-circle" size={ms(36)} color={C.primary} />
            </View>
            <Text style={styles.sheetTitle}>No driver accepted</Text>
            <Text style={styles.sheetMsg}>
              All {totalDrivers} nearby drivers either declined or did not respond.
            </Text>

            <TouchableOpacity style={styles.optRow} onPress={handleTryAgain} activeOpacity={0.8}>
              <View style={[styles.optIcon, { backgroundColor: "#EDFAF3" }]}>
                <Ionicons name="refresh-outline" size={ms(18)} color={C.success} />
              </View>
              <View style={styles.optText}>
                <Text style={styles.optTitle}>Try again</Text>
                <Text style={styles.optDesc}>Restart with current settings</Text>
              </View>
              <Ionicons name="chevron-forward" size={ms(16)} color={C.sub} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.optRow} onPress={() => { setShowAllCancelledAlert(false); cleanup(); if (onCancel) onCancel(); }} activeOpacity={0.8}>
              <View style={[styles.optIcon, { backgroundColor: "#FEF2F2" }]}>
                <Ionicons name="close-outline" size={ms(18)} color={C.danger} />
              </View>
              <View style={styles.optText}>
                <Text style={styles.optTitle}>Cancel booking</Text>
                <Text style={styles.optDesc}>Stop searching and go back</Text>
              </View>
              <Ionicons name="chevron-forward" size={ms(16)} color={C.sub} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
function createStyles({ width, height, insets, isSmall, isTablet, sc, vc, mc }) {
  const px = isTablet ? mc(28) : isSmall ? mc(16) : mc(20);
  const androidTop = Platform.OS === "android" ? Math.max(StatusBar.currentHeight || 0, 8) : 0;
  const bottomPad  = TAB_BAR_HEIGHT + Math.max(insets.bottom, 0) + vc(20);
  const sheetBot   = Math.max(insets.bottom + vc(16), 24);

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

    // ── Hero ─────────────────────────────────────────────────────────────────
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

    // ── Route card ────────────────────────────────────────────────────────────
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

    // ── Stats strip ───────────────────────────────────────────────────────────
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

    // ── Driver card ───────────────────────────────────────────────────────────
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

    // ── Progress ──────────────────────────────────────────────────────────────
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

    // ── Cancel button ─────────────────────────────────────────────────────────
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

    // ── Sheet / Modal ─────────────────────────────────────────────────────────
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
      marginBottom: vc(20),
    },

    sheetBtns: {
      flexDirection: isSmall ? "column" : "row",
      gap: mc(10),
    },

    sheetBtn: {
      flex: 1,
      minHeight: vc(48),
      borderRadius: mc(12),
      alignItems: "center",
      justifyContent: "center",
    },

    sheetBtnSolid: {
      backgroundColor: C.primary,
    },

    sheetBtnGhost: {
      backgroundColor: C.muted,
    },

    sheetBtnSolidTxt: {
      fontSize: mc(isSmall ? 13.5 : 14),
      fontWeight: "700",
      color: C.white,
    },

    sheetBtnGhostTxt: {
      fontSize: mc(isSmall ? 13.5 : 14),
      fontWeight: "600",
      color: C.text,
    },

    // ── Option rows (all-cancelled modal) ────────────────────────────────────
    optRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: vc(12),
      borderBottomWidth: 1,
      borderBottomColor: C.border,
      gap: mc(12),
    },

    optIcon: {
      width: mc(36),
      height: mc(36),
      borderRadius: mc(10),
      alignItems: "center",
      justifyContent: "center",
    },

    optText: {
      flex: 1,
    },

    optTitle: {
      fontSize: mc(isSmall ? 13.5 : 14),
      fontWeight: "700",
      color: C.text,
    },

    optDesc: {
      fontSize: mc(isSmall ? 11 : 12),
      color: C.sub,
      marginTop: vc(2),
    },
  });
}