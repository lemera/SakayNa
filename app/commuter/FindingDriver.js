// screens/commuter/FindingDriver.js
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Modal,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";

// Custom Alert Component (same as before)
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
  const [status, setStatus] = useState("finding");
  const [currentDriverIndex, setCurrentDriverIndex] = useState(0);
  const [totalDrivers, setTotalDrivers] = useState(0);
  const [currentDriverName, setCurrentDriverName] = useState("");
  const [currentDriverDistance, setCurrentDriverDistance] = useState("");
  const [findingDriverStatus, setFindingDriverStatus] = useState("");
  const [showCancelAlert, setShowCancelAlert] = useState(false);
  const [showErrorAlert, setShowErrorAlert] = useState(false);
  const [showAllCancelledAlert, setShowAllCancelledAlert] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertType, setAlertType] = useState("warning");
  const [accepted, setAccepted] = useState(false);
  const [allDriversCancelled, setAllDriversCancelled] = useState(false);
  const [cancelledCount, setCancelledCount] = useState(0);

  const bookingSubscription = useRef(null);
  const requestsSubscription = useRef(null);
  const pollingInterval = useRef(null);
  const requestTimeoutRef = useRef(null);
  const pendingRequests = useRef([]);
  const cancelledDrivers = useRef(new Set());
  const driverCancellationReasons = useRef(new Map());
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (visible && bookingId && !accepted && !allDriversCancelled) {
      console.log("🚀 Starting finding drivers for booking:", bookingId);
      startFindingDrivers();
    }
  }, [visible, bookingId]);

  const cleanup = () => {
    console.log("🧹 Cleaning up subscriptions");
    if (bookingSubscription.current) {
      supabase.removeChannel(bookingSubscription.current);
      bookingSubscription.current = null;
    }
    if (requestsSubscription.current) {
      supabase.removeChannel(requestsSubscription.current);
      requestsSubscription.current = null;
    }
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
    if (requestTimeoutRef.current) {
      clearTimeout(requestTimeoutRef.current);
      requestTimeoutRef.current = null;
    }
  };

  const startFindingDrivers = async () => {
    setStatus("finding");
    setCancelledCount(0);
    cancelledDrivers.current.clear();
    driverCancellationReasons.current.clear();
    setAllDriversCancelled(false);
    await findAndNotifyDrivers();
  };

  const findAndNotifyDrivers = async () => {
    try {
      console.log(`🚀 Finding drivers for booking: ${bookingId}`);
      
      const { data: drivers, error } = await supabase
        .from("driver_locations")
        .select(`
          driver_id,
          latitude,
          longitude,
          drivers!inner (
            id,
            first_name,
            last_name,
            status,
            is_active,
            expo_push_token
          )
        `)
        .eq("is_online", true)
        .eq("drivers.status", "approved")
        .eq("drivers.is_active", true);

      if (error) throw error;

      if (!drivers || drivers.length === 0) {
        handleNoDrivers();
        return;
      }

      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .select("pickup_latitude, pickup_longitude")
        .eq("id", bookingId)
        .single();

      if (bookingError) throw bookingError;

      const driversWithDistance = drivers.map((driver) => {
        const distance = calculateDistance(
          booking.pickup_latitude,
          booking.pickup_longitude,
          driver.latitude,
          driver.longitude
        );
        return {
          driver_id: driver.driver_id,
          distance: distance,
          first_name: driver.drivers.first_name,
          last_name: driver.drivers.last_name,
          expo_push_token: driver.drivers.expo_push_token,
        };
      });

      const sortedDrivers = driversWithDistance
        .filter((d) => d.distance <= proximityRadius)
        .sort((a, b) => a.distance - b.distance);

      console.log(`🎯 Found ${sortedDrivers.length} drivers within ${proximityRadius}km`);

      if (sortedDrivers.length === 0) {
        handleNoDriversNearby();
        return;
      }

      pendingRequests.current = sortedDrivers;
      setTotalDrivers(sortedDrivers.length);
      setCurrentDriverIndex(0);
      
      await sendRequestToDriver(sortedDrivers[0], 0, sortedDrivers.length);
      
      setupRealtimeSubscriptions();
      
    } catch (err) {
      console.log("❌ Error finding drivers:", err);
      handleNoDrivers();
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

  const sendRequestToDriver = async (driver, index, total) => {
    try {
      console.log(`📨 Sending request to driver ${index + 1}/${total}: ${driver.first_name} ${driver.last_name} (${driver.distance.toFixed(1)}km away)`);
      
      setCurrentDriverName(`${driver.first_name} ${driver.last_name}`);
      setCurrentDriverDistance(`${driver.distance.toFixed(1)}km away`);
      setFindingDriverStatus(`Looking for drivers... (${index + 1}/${total}) - Checking with ${driver.first_name} ${driver.last_name}`);
      
      const { data: bookingCheck, error: checkError } = await supabase
        .from("bookings")
        .select("status")
        .eq("id", bookingId)
        .single();
      
      if (checkError || bookingCheck?.status !== "pending") {
        console.log(`⚠️ Booking status is ${bookingCheck?.status}, stopping request`);
        if (bookingCheck?.status === "accepted" && !accepted) {
          handleDriverAccepted(bookingCheck.driver_id);
        }
        return;
      }
      
      const { error: requestError } = await supabase
        .from("booking_requests")
        .insert({
          booking_id: bookingId,
          driver_id: driver.driver_id,
          status: "pending",
          distance_km: driver.distance,
          created_at: new Date().toISOString(),
        });

      if (requestError) {
        console.log("❌ Error creating booking request:", requestError);
        moveToNextDriver(index + 1, total);
        return;
      }

      console.log(`✅ Booking request created for driver ${driver.driver_id}`);

      if (driver.expo_push_token) {
        try {
          await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              to: driver.expo_push_token,
              sound: "default",
              title: "New Booking Request",
              body: `New booking from ${pickupText || "your area"} to ${dropoffText || "destination"}. Distance: ${driver.distance.toFixed(1)}km`,
              data: { type: "booking_request", booking_id: bookingId },
            }),
          });
        } catch (notifError) {
          console.log(`Failed to send notification:`, notifError);
        }
      }

      if (requestTimeoutRef.current) {
        clearTimeout(requestTimeoutRef.current);
      }
      
      requestTimeoutRef.current = setTimeout(async () => {
        console.log(`⏰ Driver ${driver.driver_id} timeout`);
        
        const { data: booking } = await supabase
          .from("bookings")
          .select("status")
          .eq("id", bookingId)
          .single();
        
        if (booking?.status === "pending" && !accepted) {
          await supabase
            .from("booking_requests")
            .update({
              status: "expired",
              responded_at: new Date().toISOString(),
              cancellation_reason: "Driver did not respond in time",
            })
            .eq("booking_id", bookingId)
            .eq("driver_id", driver.driver_id);
          
          driverCancellationReasons.current.set(driver.driver_id, "Driver did not respond in time");
          cancelledDrivers.current.add(driver.driver_id);
          setCancelledCount(prev => prev + 1);
          
          moveToNextDriver(index + 1, total);
        }
      }, 30000);
      
    } catch (err) {
      console.log("❌ Error sending request:", err);
      moveToNextDriver(index + 1, total);
    }
  };

  const moveToNextDriver = async (nextIndex, total) => {
    console.log(`🔄 Moving to next driver. Next index: ${nextIndex}, Total: ${total}`);
    
    if (requestTimeoutRef.current) {
      clearTimeout(requestTimeoutRef.current);
      requestTimeoutRef.current = null;
    }
    
    const { data: booking } = await supabase
      .from("bookings")
      .select("status")
      .eq("id", bookingId)
      .single();
    
    if (booking?.status !== "pending") {
      console.log(`⚠️ Booking no longer pending (status: ${booking?.status})`);
      if (booking?.status === "accepted" && !accepted) {
        handleDriverAccepted(booking.driver_id);
      }
      return;
    }
    
    // Check if all drivers have been processed
    const allDriversProcessed = nextIndex >= pendingRequests.current.length;
    const allDriversCancelledStatus = cancelledDrivers.current.size === pendingRequests.current.length;
    
    if (allDriversProcessed || allDriversCancelledStatus) {
      console.log("❌ ALL DRIVERS HAVE BEEN CANCELLED OR EXPIRED");
      
      const { data: pendingReqs } = await supabase
        .from("booking_requests")
        .select("id, status, driver_id")
        .eq("booking_id", bookingId)
        .eq("status", "pending");
      
      if (pendingReqs && pendingReqs.length > 0 && !accepted) {
        console.log(`⚠️ Still have ${pendingReqs.length} pending requests, waiting...`);
        setTimeout(() => {
          moveToNextDriver(nextIndex, total);
        }, 5000);
        return;
      }
      
      if (!accepted && !allDriversCancelled) {
        setAllDriversCancelled(true);
        
        // Get the last cancelled driver to show rating prompt
        const lastCancelledDriver = Array.from(cancelledDrivers.current).pop();
        const cancellationReason = driverCancellationReasons.current.get(lastCancelledDriver);
        const driver = pendingRequests.current.find(d => d.driver_id === lastCancelledDriver);
        
        if (driver && onDriverCancelled) {
          console.log(`📝 Showing rating prompt for driver: ${driver.first_name}`);
          onDriverCancelled(driver.driver_id, driver.first_name, cancellationReason || "Driver cancelled the booking");
        } else {
          handleAllDriversCancelled();
        }
      }
      return;
    }
    
    if (nextIndex < pendingRequests.current.length) {
      const nextDriver = pendingRequests.current[nextIndex];
      setCurrentDriverIndex(nextIndex);
      await sendRequestToDriver(nextDriver, nextIndex, total);
    }
  };

  const handleDriverAccepted = (driverId) => {
    console.log(`✅✅✅ DRIVER ACCEPTED: ${driverId} ✅✅✅`);
    
    if (accepted) {
      console.log("⚠️ Already accepted, ignoring duplicate call");
      return;
    }
    
    setAccepted(true);
    cleanup();
    
    if (isMounted.current && onDriverFound) {
      onDriverFound(driverId);
    }
  };

  const handleAllDriversCancelled = () => {
    console.log("🚨 ALL DRIVERS CANCELLED - Showing options to user");
    
    supabase
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: "All drivers cancelled or rejected",
        cancelled_by: "system",
      })
      .eq("id", bookingId)
      .then(({ error }) => {
        if (error) {
          console.log("Error cancelling booking:", error);
        } else {
          console.log("✅ Booking cancelled due to all drivers rejecting");
        }
      });
    
    setAlertTitle("No Drivers Available");
    setAlertMessage(`All ${totalDrivers} nearby drivers have either rejected your request or did not respond.\n\nWhat would you like to do?`);
    setAlertType("warning");
    setShowAllCancelledAlert(true);
  };

  const handleExpandRadius = () => {
    setShowAllCancelledAlert(false);
    cleanup();
    if (onExpandRadius) {
      onExpandRadius();
    }
  };

  const handleTryAgain = () => {
    setShowAllCancelledAlert(false);
    setAllDriversCancelled(false);
    setCancelledCount(0);
    cancelledDrivers.current.clear();
    driverCancellationReasons.current.clear();
    setAccepted(false);
    startFindingDrivers();
  };

  const handleCancelBooking = () => {
    setShowAllCancelledAlert(false);
    cleanup();
    if (onCancel) {
      onCancel();
    }
  };

  const setupRealtimeSubscriptions = () => {
    console.log("🔌 Setting up real-time subscriptions for booking:", bookingId);
    
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
          console.log("🔄 REAL-TIME BOOKING UPDATE:", payload.new);
          
          if (!isMounted.current) return;
          
          if (payload.new.status === "accepted" && !accepted) {
            console.log(`✅✅✅ Driver ACCEPTED via real-time! Driver ID: ${payload.new.driver_id}`);
            handleDriverAccepted(payload.new.driver_id);
          } else if (payload.new.status === "cancelled" && !accepted && !allDriversCancelled) {
            console.log("❌ Booking cancelled via real-time");
            cleanup();
            if (isMounted.current && onCancel) {
              onCancel();
            }
          }
        }
      )
      .subscribe();

    requestsSubscription.current = supabase
      .channel(`booking-requests-${bookingId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "booking_requests",
          filter: `booking_id=eq.${bookingId}`,
        },
        (payload) => {
          console.log("🔄 REAL-TIME BOOKING REQUEST UPDATE:", payload.new);
          
          const currentDriver = pendingRequests.current[currentDriverIndex];
          
          if (currentDriver && payload.new.driver_id === currentDriver.driver_id && !accepted) {
            if (payload.new.status === "rejected") {
              console.log(`❌ Driver ${currentDriver.driver_id} REJECTED the request`);
              
              const rejectionReason = payload.new.cancellation_reason || "Driver cancelled the booking";
              driverCancellationReasons.current.set(currentDriver.driver_id, rejectionReason);
              cancelledDrivers.current.add(currentDriver.driver_id);
              setCancelledCount(prev => prev + 1);
              
              if (requestTimeoutRef.current) {
                clearTimeout(requestTimeoutRef.current);
                requestTimeoutRef.current = null;
              }
              
              // Check if all drivers have been processed
              if (cancelledDrivers.current.size === pendingRequests.current.length) {
                const lastCancelledDriver = Array.from(cancelledDrivers.current).pop();
                const cancellationReason = driverCancellationReasons.current.get(lastCancelledDriver);
                const driver = pendingRequests.current.find(d => d.driver_id === lastCancelledDriver);
                
                if (driver && onDriverCancelled) {
                  console.log(`📝 All drivers cancelled, showing rating prompt for: ${driver.first_name}`);
                  onDriverCancelled(driver.driver_id, driver.first_name, cancellationReason);
                }
              }
              
              moveToNextDriver(currentDriverIndex + 1, totalDrivers);
            }
          }
        }
      )
      .subscribe();
      
    startPolling();
  };
  
  const startPolling = () => {
    let attempts = 0;
    const maxAttempts = 120;
    
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
    }
    
    pollingInterval.current = setInterval(async () => {
      if (!isMounted.current || accepted || allDriversCancelled) {
        clearInterval(pollingInterval.current);
        pollingInterval.current = null;
        return;
      }
      
      attempts++;
      
      try {
        const { data: booking, error } = await supabase
          .from("bookings")
          .select("status, driver_id")
          .eq("id", bookingId)
          .single();
        
        if (error) {
          console.log("❌ Polling error:", error);
          return;
        }
        
        if (booking?.status === "accepted" && !accepted) {
          console.log(`✅✅✅ Polling found ACCEPTED booking! Driver: ${booking.driver_id}`);
          handleDriverAccepted(booking.driver_id);
        } else if (booking?.status === "cancelled" && !accepted && !allDriversCancelled) {
          console.log("❌ Polling found CANCELLED booking");
          cleanup();
          if (isMounted.current && onCancel) {
            onCancel();
          }
        }
        
        if (attempts >= maxAttempts && booking?.status === "pending" && !accepted && !allDriversCancelled) {
          console.log("⏰ Polling timeout - checking if all drivers were processed");
          
          const { data: pendingReqs } = await supabase
            .from("booking_requests")
            .select("id")
            .eq("booking_id", bookingId)
            .eq("status", "pending");
          
          if (!pendingReqs || pendingReqs.length === 0) {
            console.log("❌ No pending requests found - all drivers processed");
            
            if (cancelledDrivers.current.size > 0) {
              const lastCancelledDriver = Array.from(cancelledDrivers.current).pop();
              const cancellationReason = driverCancellationReasons.current.get(lastCancelledDriver);
              const driver = pendingRequests.current.find(d => d.driver_id === lastCancelledDriver);
              
              if (driver && onDriverCancelled) {
                onDriverCancelled(driver.driver_id, driver.first_name, cancellationReason);
              }
            } else {
              handleAllDriversCancelled();
            }
          }
        }
      } catch (err) {
        console.log("Error polling booking:", err);
      }
    }, 1000);
  };

  const handleNoDrivers = () => {
    setStatus("no_drivers");
    setAlertTitle("No Drivers Available");
    setAlertMessage("No drivers are currently online. Please try again later.");
    setAlertType("error");
    setShowErrorAlert(true);
  };

  const handleNoDriversNearby = () => {
    setStatus("no_drivers");
    setAlertTitle("No Drivers Nearby");
    setAlertMessage(`No drivers found within ${proximityRadius}km. Would you like to expand your search radius?`);
    setAlertType("warning");
    setShowErrorAlert(true);
  };

  const handleCancel = () => {
    setShowCancelAlert(true);
  };

  const confirmCancel = async () => {
    setShowCancelAlert(false);
    
    await supabase
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: "Cancelled by commuter",
        cancelled_by: "commuter",
      })
      .eq("id", bookingId);
    
    await supabase
      .from("booking_requests")
      .update({
        status: "cancelled",
        responded_at: new Date().toISOString(),
      })
      .eq("booking_id", bookingId)
      .eq("status", "pending");
    
    cleanup();
    if (onCancel) onCancel();
  };

  const handleErrorRetry = () => {
    setShowErrorAlert(false);
    if (alertTitle === "No Drivers Nearby") {
      if (onExpandRadius) {
        onExpandRadius();
      }
    } else {
      setAllDriversCancelled(false);
      setCancelledCount(0);
      cancelledDrivers.current.clear();
      driverCancellationReasons.current.clear();
      setAccepted(false);
      startFindingDrivers();
    }
  };

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#183B5C" />
      <Text style={styles.title}>Finding your driver...</Text>
      {findingDriverStatus ? (
        <Text style={styles.status}>{findingDriverStatus}</Text>
      ) : (
        <Text style={styles.subtitle}>
          Matching you with the nearest available driver
        </Text>
      )}

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
        {cancelledCount > 0 && (
          <View style={styles.statItem}>
            <Ionicons name="close-circle" size={24} color="#EF4444" />
            <Text style={[styles.statValue, { color: "#EF4444" }]}>{cancelledCount}</Text>
            <Text style={styles.statLabel}>Declined</Text>
          </View>
        )}
      </View>

      {currentDriverName && (
        <View style={styles.currentDriverContainer}>
          <Text style={styles.currentDriverLabel}>Currently notifying:</Text>
          <Text style={styles.currentDriverName}>{currentDriverName}</Text>
          <Text style={styles.currentDriverDistance}>{currentDriverDistance}</Text>
          {cancelledCount > 0 && (
            <Text style={styles.cancelledCountText}>
              {cancelledCount} driver{cancelledCount > 1 ? 's' : ''} have declined
            </Text>
          )}
        </View>
      )}

      <Pressable style={styles.cancelButton} onPress={handleCancel}>
        <Text style={styles.cancelButtonText}>Cancel Booking</Text>
      </Pressable>

      <CustomAlert
        visible={showCancelAlert}
        title="Cancel Booking"
        message="Are you sure you want to cancel this booking?\n\nThis will remove your request from all drivers."
        onConfirm={confirmCancel}
        onCancel={() => setShowCancelAlert(false)}
        confirmText="Yes, Cancel"
        cancelText="No"
        type="warning"
      />

      <CustomAlert
        visible={showErrorAlert}
        title={alertTitle}
        message={alertMessage}
        onConfirm={handleErrorRetry}
        confirmText={alertTitle === "No Drivers Nearby" ? "Expand Radius" : "Try Again"}
        type={alertType}
      />

      <Modal
        transparent={true}
        visible={showAllCancelledAlert}
        animationType="fade"
        onRequestClose={() => setShowAllCancelledAlert(false)}
      >
        <View style={styles.customAlertOverlay}>
          <View style={styles.customAlertContainer}>
            <View style={styles.customAlertIconContainer}>
              <Ionicons name="alert-circle" size={50} color="#F59E0B" />
            </View>
            <Text style={styles.customAlertTitle}>No Drivers Available</Text>
            <Text style={styles.customAlertMessage}>
              All {totalDrivers} nearby drivers have either rejected your request or did not respond.
              
              What would you like to do?
            </Text>
            
            <View style={styles.optionsContainer}>
              <TouchableOpacity
                style={[styles.optionButton, styles.expandRadiusOption]}
                onPress={handleExpandRadius}
              >
                <Ionicons name="options-outline" size={24} color="#183B5C" />
                <View style={styles.optionTextContainer}>
                  <Text style={styles.optionTitle}>Expand Search Radius</Text>
                  <Text style={styles.optionDescription}>Look for drivers further away</Text>
                </View>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.optionButton, styles.retryOption]}
                onPress={handleTryAgain}
              >
                <Ionicons name="refresh-outline" size={24} color="#10B981" />
                <View style={styles.optionTextContainer}>
                  <Text style={styles.optionTitle}>Try Again</Text>
                  <Text style={styles.optionDescription}>Search for drivers again</Text>
                </View>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.optionButton, styles.cancelOption]}
                onPress={handleCancelBooking}
              >
                <Ionicons name="close-circle-outline" size={24} color="#EF4444" />
                <View style={styles.optionTextContainer}>
                  <Text style={styles.optionTitle}>Cancel Booking</Text>
                  <Text style={styles.optionDescription}>Cancel and try later</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#183B5C",
    marginTop: 20,
  },
  status: {
    fontSize: 14,
    color: "#666",
    marginTop: 10,
    marginBottom: 10,
    textAlign: "center",
  },
  subtitle: {
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
    marginBottom: 30,
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
  currentDriverContainer: {
    backgroundColor: "#F0F7FF",
    padding: 15,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
    marginBottom: 30,
  },
  currentDriverLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 5,
  },
  currentDriverName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#183B5C",
    marginBottom: 3,
  },
  currentDriverDistance: {
    fontSize: 12,
    color: "#10B981",
  },
  cancelledCountText: {
    fontSize: 12,
    color: "#EF4444",
    marginTop: 8,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 30,
  },
  cancelButtonText: {
    color: "#EF4444",
    fontSize: 16,
    fontWeight: "600",
  },
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
    width: "85%",
    maxWidth: 350,
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
  optionsContainer: {
    width: "100%",
    gap: 12,
  },
  optionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  expandRadiusOption: {
    backgroundColor: "#F0F7FF",
    borderColor: "#183B5C",
  },
  retryOption: {
    backgroundColor: "#E8F5E9",
    borderColor: "#10B981",
  },
  cancelOption: {
    backgroundColor: "#FEE2E2",
    borderColor: "#EF4444",
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  optionDescription: {
    fontSize: 12,
    color: "#666",
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