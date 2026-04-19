import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Image,
  ScrollView,
  Modal,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";

const formatAmount = (value) => `₱${Number(value || 0).toFixed(2)}`;

function logStep(label, data = null) {
  if (data !== null && data !== undefined) {
    console.log("[PaymentScreen]", label, data);
  } else {
    console.log("[PaymentScreen]", label);
  }
}

function CustomAlertModal({
  visible,
  title,
  message,
  type = "info",
  confirmText = "OK",
  onConfirm,
}) {
  const slideAnim = useRef(new Animated.Value(20)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 16,
          stiffness: 180,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      slideAnim.setValue(20);
      fadeAnim.setValue(0);
    }
  }, [visible, slideAnim, fadeAnim]);

  const theme =
    type === "error"
      ? {
          icon: "close-circle",
          color: "#EF4444",
          soft: "#FEF2F2",
        }
      : type === "warning"
      ? {
          icon: "alert-circle",
          color: "#F59E0B",
          soft: "#FFF7ED",
        }
      : type === "success"
      ? {
          icon: "checkmark-circle",
          color: "#10B981",
          soft: "#ECFDF5",
        }
      : {
          icon: "information-circle",
          color: "#2563EB",
          soft: "#EFF6FF",
        };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onConfirm}>
      <View style={styles.modalOverlay}>
        <Animated.View style={[styles.modalWrap, { opacity: fadeAnim }]}>
          <Animated.View
            style={[
              styles.modalCard,
              {
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={[styles.modalIconWrap, { backgroundColor: theme.soft }]}>
              <Ionicons name={theme.icon} size={38} color={theme.color} />
            </View>

            <Text style={styles.modalTitle}>{title}</Text>
            <Text style={styles.modalMessage}>{message}</Text>

            <Pressable
              style={[styles.modalPrimaryBtn, { backgroundColor: theme.color }]}
              onPress={onConfirm}
            >
              <Text style={styles.modalPrimaryBtnText}>{confirmText}</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export default function PaymentScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  const {
    serviceType,
    bookingId,
    bookingData,
    totalAmount = 0,
    paymentMethod = "qrph",
  } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [initializing, setInitializing] = useState(true);

  const [paymentStatus, setPaymentStatus] = useState("pending");
  const [qrImageUrl, setQrImageUrl] = useState("");
  const [checkoutId, setCheckoutId] = useState("");
  const [paymentIntentId, setPaymentIntentId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [hasUpdatedBooking, setHasUpdatedBooking] = useState(false);

  const [cancelAlertVisible, setCancelAlertVisible] = useState(false);
  const [cancelAlertTitle, setCancelAlertTitle] = useState("Booking Cancelled");
  const [cancelAlertMessage, setCancelAlertMessage] = useState(
    "This booking was cancelled by the driver."
  );
  const [bookingCancelled, setBookingCancelled] = useState(false);

  const pollRef = useRef(null);
  const countdownRef = useRef(null);
  const updatingBookingRef = useRef(false);
  const bookingChannelRef = useRef(null);
  const handledCancellationRef = useRef(false);

  const isPabili = serviceType === "pabili";
  const heroColors = isPabili ? ["#F97316", "#FB923C"] : ["#10B981", "#34D399"];
  const heroTitle = isPabili ? "Complete Pabili Payment" : "Complete Payment";

  const isValidPayload = useMemo(() => {
    return !!serviceType && !!bookingId && !!bookingData && Number(totalAmount) > 0;
  }, [serviceType, bookingId, bookingData, totalAmount]);

  const paymentCacheKey = useMemo(() => {
    return bookingId ? `payment_session_${bookingId}` : null;
  }, [bookingId]);

  const clearTimers = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
      logStep("Poll timer cleared");
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
      logStep("Countdown timer cleared");
    }
  }, []);

  const goBackAfterCancellation = useCallback(() => {
    try {
      if (navigation.canGoBack()) {
        navigation.goBack();
        return;
      }

      const state = navigation.getState?.();
      const routeNames = state?.routeNames || [];

      if (routeNames.includes("CommuterHomeScreen")) {
        navigation.navigate("CommuterHomeScreen");
        return;
      }

      if (routeNames.includes("Home")) {
        navigation.navigate("Home");
        return;
      }

      if (routeNames.includes("MainTabs")) {
        navigation.navigate("MainTabs", { screen: "Home" });
        return;
      }
    } catch (error) {
      console.log("[PaymentScreen] goBackAfterCancellation error:", error);
    }
  }, [navigation]);

  const handleBookingCancelled = useCallback(
    async (bookingRow) => {
      if (handledCancellationRef.current) return;
      handledCancellationRef.current = true;

      const driverReason =
        String(
          bookingRow?.cancellation_reason ||
            bookingRow?.cancel_reason ||
            bookingRow?.reason ||
            ""
        ).trim() || "No reason provided.";

      logStep("Booking cancellation detected", {
        bookingId: bookingRow?.id,
        reason: driverReason,
        status: bookingRow?.status,
        service_status: bookingRow?.service_status,
      });

      clearTimers();
      await clearPaymentSession();

      setBookingCancelled(true);
      setCancelAlertTitle("Driver Cancelled the Booking");
      setCancelAlertMessage(`Reason: ${driverReason}`);
      setCancelAlertVisible(true);
    },
    [clearTimers]
  );

  const applyPaymentSession = useCallback((session) => {
    if (!session) return;

    logStep("Applying payment session", session);

    setQrImageUrl(session.qrImageUrl || "");
    setCheckoutId(session.checkoutId || "");
    setPaymentIntentId(session.paymentIntentId || "");
    setSourceId(session.sourceId || "");
    setPaymentReference(session.paymentReference || "");
    setExpiresAt(session.expiresAt || "");
    setPaymentStatus(session.paymentStatus || "pending");
  }, []);

  const savePaymentSession = useCallback(
    async (session) => {
      try {
        if (!paymentCacheKey) return;
        await AsyncStorage.setItem(paymentCacheKey, JSON.stringify(session));
        logStep("Saved payment session", session);
      } catch (error) {
        console.log("[PaymentScreen] savePaymentSession error:", error);
      }
    },
    [paymentCacheKey]
  );

  const loadPaymentSession = useCallback(async () => {
    try {
      if (!paymentCacheKey) return null;
      const raw = await AsyncStorage.getItem(paymentCacheKey);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      logStep("Loaded payment session", parsed);
      return parsed;
    } catch (error) {
      console.log("[PaymentScreen] loadPaymentSession error:", error);
      return null;
    }
  }, [paymentCacheKey]);

  const clearPaymentSession = useCallback(async () => {
    try {
      if (!paymentCacheKey) return;
      await AsyncStorage.removeItem(paymentCacheKey);
      logStep("Cleared payment session");
    } catch (error) {
      console.log("[PaymentScreen] clearPaymentSession error:", error);
    }
  }, [paymentCacheKey]);

  const startCountdown = useCallback((expiryIso) => {
    if (!expiryIso) return;

    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    const updateCountdown = () => {
      const now = Date.now();
      const expiry = new Date(expiryIso).getTime();
      const diff = Math.max(0, Math.floor((expiry - now) / 1000));
      setSecondsLeft(diff);

      if (diff <= 0 && countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };

    updateCountdown();
    countdownRef.current = setInterval(updateCountdown, 1000);
  }, []);

  const formatTimer = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const verifyBookingUpdated = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, status, service_status, payment_status, payment_method, payment_type, cancellation_reason, updated_at"
        )
        .eq("id", bookingId)
        .single();

      logStep("verifyBookingUpdated result", { data, error });

      if (error) throw error;
      return data;
    } catch (error) {
      console.log("[PaymentScreen] verifyBookingUpdated error:", error);
      return null;
    }
  }, [bookingId]);

  const createPayMongoQR = useCallback(async () => {
    try {
      setLoading(true);
      setCreatingPayment(true);

      logStep("Creating QR payment", {
        serviceType,
        bookingId,
        totalAmount,
        paymentMethod,
      });

      const { data, error } = await supabase.functions.invoke("create-paymongo-qrph", {
        body: {
          serviceType,
          amount: Number(totalAmount),
          paymentMethod,
          bookingData,
          bookingId,
        },
      });

      logStep("create-paymongo-qrph response", { data, error });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.message || "Failed to create QR payment.");
      }

      const session = {
        qrImageUrl: data.qr_image_url || "",
        checkoutId: data.payment_intent_id || data.checkout_id || "",
        paymentIntentId: data.payment_intent_id || data.checkout_id || "",
        sourceId: data.source_id || "",
        paymentReference: data.reference || data.payment_intent_id || "",
        expiresAt: data.expires_at || "",
        paymentStatus: "pending",
        bookingId,
        createdAt: new Date().toISOString(),
      };

      applyPaymentSession(session);
      await savePaymentSession(session);

      if (session.expiresAt) {
        startCountdown(session.expiresAt);
      }
    } catch (error) {
      console.log("[PaymentScreen] createPayMongoQR error:", error);

      try {
        if (error?.context) {
          const errorBody = await error.context.json();
          console.log("[PaymentScreen] createPayMongoQR function error body:", errorBody);
          setCancelAlertTitle("Payment Error");
          setCancelAlertMessage(errorBody?.message || "Failed to generate QR payment.");
          setCancelAlertVisible(true);
          return;
        }
      } catch (parseError) {
        console.log("[PaymentScreen] createPayMongoQR parse error:", parseError);
      }

      setCancelAlertTitle("Payment Error");
      setCancelAlertMessage(error?.message || "Failed to generate QR payment.");
      setCancelAlertVisible(true);
    } finally {
      setLoading(false);
      setCreatingPayment(false);
    }
  }, [
    serviceType,
    bookingId,
    totalAmount,
    paymentMethod,
    bookingData,
    applyPaymentSession,
    savePaymentSession,
    startCountdown,
  ]);

  const updateBookingAfterPayment = useCallback(async () => {
    try {
      if (hasUpdatedBooking || !bookingId || updatingBookingRef.current || bookingCancelled) {
        logStep("updateBookingAfterPayment skipped", {
          hasUpdatedBooking,
          bookingId,
          updatingInProgress: updatingBookingRef.current,
          bookingCancelled,
        });
        return;
      }

      updatingBookingRef.current = true;

      logStep("Updating booking after payment", {
        bookingId,
        paymentReference,
        paymentIntentId,
        sourceId,
        checkoutId,
      });

      const latestBooking = await verifyBookingUpdated();
      const latestStatus = String(latestBooking?.status || "").toLowerCase().trim();
      const latestServiceStatus = String(latestBooking?.service_status || "").toLowerCase().trim();

      if (latestStatus === "cancelled" || latestServiceStatus === "cancelled") {
        await handleBookingCancelled(latestBooking);
        return;
      }

      const updatePayload = {
        payment_method: "paymongo",
        payment_type: "qrph",
        payment_status: "paid",
        updated_at: new Date().toISOString(),
      };

      logStep("Minimal booking update payload", updatePayload);

      const { data: booking, error } = await supabase
        .from("bookings")
        .update(updatePayload)
        .eq("id", bookingId)
        .select("id, payment_status, payment_method, payment_type, updated_at")
        .single();

      logStep("Minimal booking update response", { booking, error });

      if (error) throw error;

      const verifiedBooking = await verifyBookingUpdated();

      if (!verifiedBooking || verifiedBooking.payment_status !== "paid") {
        throw new Error("Booking row was not updated to paid.");
      }

      setHasUpdatedBooking(true);
      setPaymentStatus("paid");
      clearTimers();
      await clearPaymentSession();

      setCancelAlertTitle("Payment Successful");
      setCancelAlertMessage("Your payment has been confirmed.");
      setCancelAlertVisible(true);
    } catch (error) {
      console.log("[PaymentScreen] updateBookingAfterPayment error:", error);
      setCancelAlertTitle("Booking Error");
      setCancelAlertMessage(
        error?.message || "Payment succeeded but booking update failed."
      );
      setCancelAlertVisible(true);
    } finally {
      updatingBookingRef.current = false;
    }
  }, [
    hasUpdatedBooking,
    bookingId,
    paymentReference,
    paymentIntentId,
    sourceId,
    checkoutId,
    clearTimers,
    verifyBookingUpdated,
    clearPaymentSession,
    bookingCancelled,
    handleBookingCancelled,
  ]);

  const checkPaymentStatus = useCallback(async () => {
    try {
      if (!checkoutId || hasUpdatedBooking || bookingCancelled) {
        logStep("checkPaymentStatus skipped", {
          checkoutId,
          hasUpdatedBooking,
          bookingCancelled,
        });
        return;
      }

      const latestBooking = await verifyBookingUpdated();
      const latestStatus = String(latestBooking?.status || "").toLowerCase().trim();
      const latestServiceStatus = String(latestBooking?.service_status || "").toLowerCase().trim();

      if (latestStatus === "cancelled" || latestServiceStatus === "cancelled") {
        await handleBookingCancelled(latestBooking);
        return;
      }

      logStep("Checking payment status", {
        checkoutId,
        paymentIntentId,
        sourceId,
      });

      const { data, error } = await supabase.functions.invoke(
        "check-paymongo-payment",
        {
          body: {
            checkout_id: checkoutId,
            payment_intent_id: paymentIntentId || checkoutId,
            source_id: sourceId,
          },
        }
      );

      logStep("check-paymongo-payment response", { data, error });

      if (error) {
        try {
          if (error?.context) {
            const errorBody = await error.context.json();
            console.log("[PaymentScreen] checkPaymentStatus function error body:", errorBody);
          }
        } catch (parseError) {
          console.log("[PaymentScreen] checkPaymentStatus parse error:", parseError);
        }
        throw error;
      }

      if (!data?.success) {
        console.log("[PaymentScreen] checkPaymentStatus backend unsuccessful:", data);
        return;
      }

      const status = String(data.status || "pending").toLowerCase().trim();
      setPaymentStatus(status);

      const updatedSession = {
        qrImageUrl,
        checkoutId,
        paymentIntentId: paymentIntentId || checkoutId,
        sourceId,
        paymentReference,
        expiresAt,
        paymentStatus: status,
        bookingId,
        createdAt: new Date().toISOString(),
      };

      await savePaymentSession(updatedSession);

      if (
        status === "paid" ||
        status === "success" ||
        status === "succeeded" ||
        status === "completed"
      ) {
        clearTimers();
        await updateBookingAfterPayment();
      }

      if (status === "failed" || status === "expired") {
        clearTimers();
      }
    } catch (error) {
      console.log("[PaymentScreen] checkPaymentStatus error:", error);
    }
  }, [
    checkoutId,
    paymentIntentId,
    sourceId,
    paymentReference,
    expiresAt,
    qrImageUrl,
    bookingId,
    hasUpdatedBooking,
    updateBookingAfterPayment,
    clearTimers,
    savePaymentSession,
    bookingCancelled,
    verifyBookingUpdated,
    handleBookingCancelled,
  ]);

  const initializePayment = useCallback(async () => {
    try {
      if (!isValidPayload) {
        setCancelAlertTitle("Invalid Data");
        setCancelAlertMessage("Missing payment details.");
        setCancelAlertVisible(true);
        return;
      }

      setLoading(true);
      setInitializing(true);

      const booking = await verifyBookingUpdated();
      const bookingPaymentStatus = String(booking?.payment_status || "").toLowerCase().trim();
      const bookingStatus = String(booking?.status || "").toLowerCase().trim();
      const bookingServiceStatus = String(booking?.service_status || "").toLowerCase().trim();

      if (bookingStatus === "cancelled" || bookingServiceStatus === "cancelled") {
        await handleBookingCancelled(booking);
        return;
      }

      if (["paid", "success", "succeeded", "completed"].includes(bookingPaymentStatus)) {
        logStep("Booking already paid on init");
        setPaymentStatus("paid");
        setHasUpdatedBooking(true);
        await clearPaymentSession();

        navigation.navigate("TrackRide", { bookingId });
        return;
      }

      const savedSession = await loadPaymentSession();

      if (
        savedSession &&
        savedSession.bookingId === bookingId &&
        savedSession.expiresAt &&
        new Date(savedSession.expiresAt).getTime() > Date.now() &&
        savedSession.paymentStatus !== "failed" &&
        savedSession.paymentStatus !== "expired"
      ) {
        logStep("Reusing saved QR session", savedSession);

        applyPaymentSession(savedSession);
        startCountdown(savedSession.expiresAt);
        return;
      }

      logStep("No reusable QR session found, creating new one");
      await clearPaymentSession();
      await createPayMongoQR();
    } catch (error) {
      console.log("[PaymentScreen] initializePayment error:", error);
    } finally {
      setLoading(false);
      setInitializing(false);
    }
  }, [
    isValidPayload,
    verifyBookingUpdated,
    clearPaymentSession,
    loadPaymentSession,
    bookingId,
    applyPaymentSession,
    startCountdown,
    createPayMongoQR,
    navigation,
    handleBookingCancelled,
  ]);

  useEffect(() => {
    initializePayment();

    return () => {
      clearTimers();
    };
  }, [initializePayment, clearTimers]);

  useEffect(() => {
    if (!bookingId) return;

    bookingChannelRef.current?.unsubscribe?.();

    bookingChannelRef.current = supabase
      .channel(`payment-screen-booking-${bookingId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bookings",
          filter: `id=eq.${bookingId}`,
        },
        async (payload) => {
          const newRow = payload?.new || {};
          const latestStatus = String(newRow?.status || "").toLowerCase().trim();
          const latestServiceStatus = String(newRow?.service_status || "").toLowerCase().trim();

          logStep("Realtime booking update", {
            status: newRow?.status,
            service_status: newRow?.service_status,
            cancellation_reason: newRow?.cancellation_reason,
          });

          if (latestStatus === "cancelled" || latestServiceStatus === "cancelled") {
            await handleBookingCancelled(newRow);
            return;
          }

          const latestPaymentStatus = String(newRow?.payment_status || "").toLowerCase().trim();

          if (
            !hasUpdatedBooking &&
            ["paid", "success", "succeeded", "completed"].includes(latestPaymentStatus)
          ) {
            setPaymentStatus(latestPaymentStatus);
            clearTimers();
            await updateBookingAfterPayment();
          }
        }
      )
      .subscribe();

    return () => {
      bookingChannelRef.current?.unsubscribe?.();
      bookingChannelRef.current = null;
    };
  }, [bookingId, handleBookingCancelled, hasUpdatedBooking, clearTimers, updateBookingAfterPayment]);

  useEffect(() => {
    if (!checkoutId || hasUpdatedBooking || initializing || bookingCancelled) return;

    logStep("Starting payment polling", { checkoutId });

    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    pollRef.current = setInterval(() => {
      checkPaymentStatus();
    }, 5000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [checkoutId, checkPaymentStatus, hasUpdatedBooking, initializing, bookingCancelled]);

  const handleRefreshStatus = async () => {
    await checkPaymentStatus();
  };

  const handleRegenerateQR = async () => {
    if (bookingCancelled) return;

    clearTimers();
    await clearPaymentSession();

    setQrImageUrl("");
    setCheckoutId("");
    setPaymentIntentId("");
    setSourceId("");
    setPaymentReference("");
    setExpiresAt("");
    setSecondsLeft(0);
    setPaymentStatus("pending");
    setHasUpdatedBooking(false);
    updatingBookingRef.current = false;
    handledCancellationRef.current = false;

    await createPayMongoQR();
  };

  const renderStatusColor = () => {
    switch (paymentStatus) {
      case "paid":
      case "success":
      case "succeeded":
      case "completed":
        return "#10B981";
      case "failed":
      case "expired":
        return "#EF4444";
      default:
        return "#F59E0B";
    }
  };

  const renderStatusLabel = () => {
    switch (paymentStatus) {
      case "paid":
      case "success":
      case "succeeded":
      case "completed":
        return "Payment confirmed";
      case "failed":
        return "Payment failed";
      case "expired":
        return "QR expired";
      default:
        return "Waiting for payment";
    }
  };

  const handleAlertConfirm = () => {
    const title = cancelAlertTitle;

    setCancelAlertVisible(false);

    if (bookingCancelled || title === "Driver Cancelled the Booking") {
      goBackAfterCancellation();
      return;
    }

    if (title === "Payment Successful") {
      navigation.navigate("TrackRide", {
        bookingId,
      });
    }
  };

  if (!isValidPayload) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerWrap}>
          <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
          <Text style={styles.errorTitle}>Invalid Payment Data</Text>
          <Text style={styles.errorText}>Please go back and try again.</Text>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </Pressable>
        </View>

        <CustomAlertModal
          visible={cancelAlertVisible}
          title={cancelAlertTitle}
          message={cancelAlertMessage}
          type="warning"
          confirmText="OK"
          onConfirm={handleAlertConfirm}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <LinearGradient colors={heroColors} style={styles.heroCard}>
            <View style={styles.heroIconWrap}>
              <Ionicons name="qr-code-outline" size={28} color="#fff" />
            </View>
            <Text style={styles.heroTitle}>{heroTitle}</Text>
            <Text style={styles.heroSubtitle}>
              Scan the QR code using GCash / QR Ph and wait for payment confirmation.
            </Text>
          </LinearGradient>

          <View style={styles.amountCard}>
            <Text style={styles.amountLabel}>Amount to Pay</Text>
            <Text style={styles.amountValue}>{formatAmount(totalAmount)}</Text>

            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: renderStatusColor() },
                ]}
              />
              <Text style={[styles.statusText, { color: renderStatusColor() }]}>
                {renderStatusLabel()}
              </Text>
            </View>

            {!!secondsLeft && paymentStatus === "pending" && !bookingCancelled && (
              <Text style={styles.expiryText}>
                QR expires in {formatTimer(secondsLeft)}
              </Text>
            )}
          </View>

          <View style={styles.qrCard}>
            <Text style={styles.sectionTitle}>QR Payment</Text>

            {loading || creatingPayment || initializing ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color={isPabili ? "#F97316" : "#10B981"} />
                <Text style={styles.loadingText}>
                  {initializing ? "Restoring payment session..." : "Generating QR code..."}
                </Text>
              </View>
            ) : bookingCancelled ? (
              <View style={styles.loadingWrap}>
                <Ionicons name="close-circle-outline" size={42} color="#EF4444" />
                <Text style={styles.loadingText}>Booking was cancelled by the driver.</Text>
              </View>
            ) : qrImageUrl ? (
              <>
                <Image
                  source={{ uri: qrImageUrl }}
                  style={styles.qrImage}
                  resizeMode="contain"
                />

                {!!paymentReference && (
                  <View style={styles.referenceBox}>
                    <Text style={styles.referenceLabel}>Reference</Text>
                    <Text style={styles.referenceValue}>{paymentReference}</Text>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.loadingWrap}>
                <Ionicons name="alert-circle-outline" size={40} color="#EF4444" />
                <Text style={styles.loadingText}>QR image not available.</Text>
              </View>
            )}
          </View>

          <View style={styles.noticeCard}>
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={isPabili ? "#F97316" : "#10B981"}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.noticeTitle}>Important</Text>
              <Text style={styles.noticeText}>
                Do not leave this screen until payment is confirmed.
              </Text>
              <Text style={styles.noticeText}>
                Your booking will move to tracking right after successful payment.
              </Text>
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable style={styles.secondaryBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.secondaryBtnText}>Back</Text>
          </Pressable>

          <Pressable
            style={[styles.actionBtn, bookingCancelled && { opacity: 0.5 }]}
            onPress={handleRefreshStatus}
            disabled={bookingCancelled}
          >
            <Text style={styles.actionBtnText}>Check Status</Text>
          </Pressable>

          {(paymentStatus === "failed" || paymentStatus === "expired") && !bookingCancelled && (
            <Pressable style={styles.actionBtnPrimary} onPress={handleRegenerateQR}>
              <Text style={styles.actionBtnPrimaryText}>Regenerate</Text>
            </Pressable>
          )}
        </View>
      </View>

      <CustomAlertModal
        visible={cancelAlertVisible}
        title={cancelAlertTitle}
        message={cancelAlertMessage}
        type={
          bookingCancelled || cancelAlertTitle === "Payment Error" || cancelAlertTitle === "Booking Error"
            ? "error"
            : cancelAlertTitle === "Payment Successful"
            ? "success"
            : "warning"
        }
        confirmText="OK"
        onConfirm={handleAlertConfirm}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  content: { padding: 16, paddingBottom: 120 },

  centerWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
    marginTop: 12,
  },
  errorText: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 8,
    textAlign: "center",
  },
  backButton: {
    marginTop: 18,
    backgroundColor: "#183B5C",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  backButtonText: {
    color: "#fff",
    fontWeight: "700",
  },

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

  amountCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  amountLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "700",
  },
  amountValue: {
    fontSize: 30,
    fontWeight: "900",
    color: "#111827",
    marginTop: 6,
  },
  statusRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "700",
  },
  expiryText: {
    marginTop: 8,
    fontSize: 12,
    color: "#6B7280",
  },

  qrCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  sectionTitle: {
    alignSelf: "flex-start",
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 14,
  },
  loadingWrap: {
    width: "100%",
    minHeight: 260,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  qrImage: {
    width: 260,
    height: 260,
    borderRadius: 16,
    backgroundColor: "#fff",
  },
  referenceBox: {
    marginTop: 14,
    width: "100%",
    borderRadius: 16,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
  },
  referenceLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 4,
  },
  referenceValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },

  noticeCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  noticeTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
  },
  noticeText: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
    marginBottom: 2,
  },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 10,
    padding: 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  secondaryBtn: {
    height: 54,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
  },
  secondaryBtnText: {
    color: "#374151",
    fontWeight: "700",
  },
  actionBtn: {
    flex: 1,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#183B5C",
    justifyContent: "center",
    alignItems: "center",
  },
  actionBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  actionBtnPrimary: {
    height: 54,
    borderRadius: 18,
    backgroundColor: "#F97316",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
  },
  actionBtnPrimaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalWrap: {
    width: "100%",
    alignItems: "center",
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff",
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 22,
    alignItems: "center",
  },
  modalIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
  },
  modalMessage: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: "#6B7280",
    textAlign: "center",
  },
  modalPrimaryBtn: {
    marginTop: 18,
    minWidth: 140,
    height: 48,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
  },
  modalPrimaryBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
});