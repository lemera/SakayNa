// screens/commuter/BookingDetails.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import Constants from "expo-constants";

export default function BookingDetailsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const { id } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(null);
  const [driver, setDriver] = useState(null);
  const [commuter, setCommuter] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [showFullMap, setShowFullMap] = useState(false);

  const googleApiKey = Constants.expoConfig?.extra?.GOOGLE_API_KEY;

  useEffect(() => {
    if (id) {
      fetchBookingDetails();
    }
  }, [id]);

  const fetchBookingDetails = async () => {
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          *,
          driver:drivers (
            id,
            first_name,
            last_name,
            phone,
            profile_picture,
            vehicle_model,
            vehicle_color,
            vehicle_plate
          ),
          commuter:commuters (
            id,
            first_name,
            last_name,
            phone,
            profile_picture
          )
        `)
        .eq("id", id)
        .single();

      if (error) throw error;

      setBooking(data);
      setDriver(data.driver);
      setCommuter(data.commuter);

      if (data.pickup_latitude && data.pickup_longitude && 
          data.dropoff_latitude && data.dropoff_longitude) {
        calculateRoute(
          {
            latitude: data.pickup_latitude,
            longitude: data.pickup_longitude,
          },
          {
            latitude: data.dropoff_latitude,
            longitude: data.dropoff_longitude,
          }
        );
      }

    } catch (err) {
      console.log("Error fetching booking:", err);
      Alert.alert("Error", "Failed to load booking details");
    } finally {
      setLoading(false);
    }
  };

  const calculateRoute = async (startCoords, endCoords) => {
    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${startCoords.latitude},${startCoords.longitude}&destination=${endCoords.latitude},${endCoords.longitude}&key=${googleApiKey}&mode=driving`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === "OK" && data.routes[0]) {
        const points = decodePolyline(data.routes[0].overview_polyline.points);
        setRouteCoordinates(points);
      }
    } catch (err) {
      console.log("Error calculating route:", err);
    }
  };

  const decodePolyline = (encoded) => {
    const points = [];
    let index = 0, lat = 0, lng = 0;

    while (index < encoded.length) {
      let b, shift = 0, result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lng += dlng;

      points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
    }
    return points;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatCurrency = (amount) => {
    return `₱${amount?.toFixed(2) || "0.00"}`;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "pending":
        return { bg: "#FEF3C7", text: "#F59E0B" };
      case "accepted":
        return { bg: "#E3F2FD", text: "#3B82F6" };
      case "started":
        return { bg: "#D1FAE5", text: "#10B981" };
      case "completed":
        return { bg: "#D1FAE5", text: "#10B981" };
      case "cancelled":
        return { bg: "#FEE2E2", text: "#EF4444" };
      default:
        return { bg: "#F3F4F6", text: "#6B7280" };
    }
  };

  const getPaymentStatusColor = (status) => {
    switch (status) {
      case "paid":
        return { bg: "#D1FAE5", text: "#10B981" };
      case "pending":
        return { bg: "#FEF3C7", text: "#F59E0B" };
      case "failed":
        return { bg: "#FEE2E2", text: "#EF4444" };
      default:
        return { bg: "#F3F4F6", text: "#6B7280" };
    }
  };

  const callDriver = () => {
    if (!driver?.phone) {
      Alert.alert("Error", "No phone number available");
      return;
    }
    Linking.openURL(`tel:${driver.phone}`);
  };

  const messageDriver = () => {
    if (!driver?.phone) {
      Alert.alert("Error", "No phone number available");
      return;
    }
    Linking.openURL(`sms:${driver.phone}`);
  };

  const openMaps = (lat, lng, label) => {
    const scheme = Platform.select({
      ios: `maps://0?q=${label}&ll=${lat},${lng}`,
      android: `geo:${lat},${lng}?q=${lat},${lng}(${label})`,
    });
    Linking.openURL(scheme);
  };

  const handleSupport = () => {
    navigation.navigate("Support", { bookingId: id });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#183B5C" />
          </Pressable>
          <Text style={styles.headerTitle}>Booking Details</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={64} color="#D1D5DB" />
          <Text style={styles.emptyStateTitle}>Booking Not Found</Text>
        </View>
      </View>
    );
  }

  const statusColors = getStatusColor(booking.status);
  const paymentColors = getPaymentStatusColor(booking.payment_status);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#183B5C" />
        </Pressable>
        <Text style={styles.headerTitle}>Booking Details</Text>
        <Pressable onPress={handleSupport} style={styles.supportButton}>
          <Ionicons name="help-circle" size={24} color="#183B5C" />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Map Preview */}
        {booking.pickup_latitude && booking.dropoff_latitude && (
          <Pressable
            style={styles.mapPreview}
            onPress={() => setShowFullMap(!showFullMap)}
          >
            <MapView
              style={[styles.map, showFullMap ? styles.mapFull : styles.mapSmall]}
              provider={PROVIDER_GOOGLE}
              initialRegion={{
                latitude: booking.pickup_latitude,
                longitude: booking.pickup_longitude,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
              scrollEnabled={showFullMap}
              zoomEnabled={showFullMap}
              pitchEnabled={false}
              rotateEnabled={false}
            >
              <Marker
                coordinate={{
                  latitude: booking.pickup_latitude,
                  longitude: booking.pickup_longitude,
                }}
                title="Pickup"
              >
                <View style={styles.pickupMarker}>
                  <Ionicons name="location" size={12} color="#FFF" />
                </View>
              </Marker>
              <Marker
                coordinate={{
                  latitude: booking.dropoff_latitude,
                  longitude: booking.dropoff_longitude,
                }}
                title="Dropoff"
              >
                <View style={styles.dropoffMarker}>
                  <Ionicons name="flag" size={12} color="#FFF" />
                </View>
              </Marker>
              {routeCoordinates.length > 0 && (
                <Polyline
                  coordinates={routeCoordinates}
                  strokeColor="#3B82F6"
                  strokeWidth={3}
                />
              )}
            </MapView>
            <View style={styles.mapOverlay}>
              <Ionicons
                name={showFullMap ? "contract" : "expand"}
                size={20}
                color="#FFF"
              />
            </View>
          </Pressable>
        )}

        {/* Status Cards */}
        <View style={styles.statusContainer}>
          <View style={[styles.statusCard, { backgroundColor: statusColors.bg }]}>
            <Text style={[styles.statusText, { color: statusColors.text }]}>
              {booking.status?.toUpperCase()}
            </Text>
          </View>
          <View style={[styles.statusCard, { backgroundColor: paymentColors.bg }]}>
            <Text style={[styles.statusText, { color: paymentColors.text }]}>
              {booking.payment_status?.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Booking Reference */}
        <View style={styles.referenceCard}>
          <Text style={styles.referenceLabel}>Booking Reference</Text>
          <Text style={styles.referenceValue}>
            {booking.booking_reference || "N/A"}
          </Text>
        </View>

        {/* Driver Info (if assigned) */}
        {driver && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Driver Details</Text>
            <View style={styles.driverCard}>
              <View style={styles.driverAvatar}>
                {driver.profile_picture ? (
                  <Image source={{ uri: driver.profile_picture }} style={styles.driverImage} />
                ) : (
                  <Ionicons name="person" size={30} color="#9CA3AF" />
                )}
              </View>
              <View style={styles.driverInfo}>
                <Text style={styles.driverName}>
                  {driver.first_name} {driver.last_name}
                </Text>
                <Text style={styles.driverVehicle}>
                  {driver.vehicle_model || "Vehicle"} • {driver.vehicle_color || "N/A"} • {driver.vehicle_plate || "N/A"}
                </Text>
              </View>
              <View style={styles.driverActions}>
                <Pressable style={styles.callButton} onPress={callDriver}>
                  <Ionicons name="call" size={20} color="#FFF" />
                </Pressable>
                <Pressable style={styles.messageButton} onPress={messageDriver}>
                  <Ionicons name="chatbubble" size={20} color="#183B5C" />
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* Trip Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trip Details</Text>
          
          <View style={styles.detailCard}>
            <View style={styles.detailRow}>
              <Ionicons name="location" size={20} color="#10B981" />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>PICKUP</Text>
                <Text style={styles.detailText}>{booking.pickup_location}</Text>
                {booking.pickup_details && (
                  <Text style={styles.detailSubtext}>📍 {booking.pickup_details}</Text>
                )}
              </View>
            </View>

            <View style={styles.detailRow}>
              <Ionicons name="flag" size={20} color="#EF4444" />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>DROPOFF</Text>
                <Text style={styles.detailText}>{booking.dropoff_location}</Text>
                {booking.dropoff_details && (
                  <Text style={styles.detailSubtext}>📍 {booking.dropoff_details}</Text>
                )}
              </View>
            </View>

            <View style={styles.detailDivider} />

            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Ionicons name="people" size={16} color="#666" />
                <Text style={styles.statLabel}>Passengers</Text>
                <Text style={styles.statValue}>{booking.passenger_count || 1}</Text>
              </View>
              <View style={styles.statItem}>
                <Ionicons name="map" size={16} color="#666" />
                <Text style={styles.statLabel}>Distance</Text>
                <Text style={styles.statValue}>{booking.distance_km || "?"} km</Text>
              </View>
              <View style={styles.statItem}>
                <Ionicons name="time" size={16} color="#666" />
                <Text style={styles.statLabel}>Duration</Text>
                <Text style={styles.statValue}>{booking.duration_minutes || "?"} min</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Payment Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Details</Text>
          
          <View style={styles.paymentCard}>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Payment Method</Text>
              <Text style={styles.paymentValue}>
                {booking.payment_type?.toUpperCase() || "CASH"}
              </Text>
            </View>
            
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Base Fare</Text>
              <Text style={styles.paymentValue}>{formatCurrency(booking.base_fare || 15)}</Text>
            </View>
            
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Distance Fare</Text>
              <Text style={styles.paymentValue}>
                {formatCurrency((booking.per_km_rate || 15) * Math.ceil(booking.distance_km || 0))}
              </Text>
            </View>
            
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Passengers</Text>
              <Text style={styles.paymentValue}>× {booking.passenger_count || 1}</Text>
            </View>
            
            <View style={styles.paymentDivider} />
            
            <View style={styles.paymentTotal}>
              <Text style={styles.paymentTotalLabel}>Total Fare</Text>
              <Text style={styles.paymentTotalValue}>{formatCurrency(booking.fare)}</Text>
            </View>

            {booking.payment_status === "paid" && (
              <View style={styles.paidBadge}>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <Text style={styles.paidText}>Paid via {booking.payment_type}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Timeline */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Timeline</Text>
          
          <View style={styles.timelineCard}>
            <View style={styles.timelineItem}>
              <View style={styles.timelineLeft}>
                <View style={styles.timelineDot} />
                <View style={styles.timelineLine} />
              </View>
              <View style={styles.timelineContent}>
                <Text style={styles.timelineTitle}>Booking Created</Text>
                <Text style={styles.timelineTime}>{formatDate(booking.created_at)}</Text>
              </View>
            </View>

            {booking.accepted_at && (
              <View style={styles.timelineItem}>
                <View style={styles.timelineLeft}>
                  <View style={[styles.timelineDot, styles.timelineDotActive]} />
                  <View style={styles.timelineLine} />
                </View>
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineTitle}>Driver Accepted</Text>
                  <Text style={styles.timelineTime}>{formatDate(booking.accepted_at)}</Text>
                </View>
              </View>
            )}

            {booking.ride_started_at && (
              <View style={styles.timelineItem}>
                <View style={styles.timelineLeft}>
                  <View style={[styles.timelineDot, styles.timelineDotActive]} />
                  <View style={styles.timelineLine} />
                </View>
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineTitle}>Trip Started</Text>
                  <Text style={styles.timelineTime}>{formatDate(booking.ride_started_at)}</Text>
                </View>
              </View>
            )}

            {booking.ride_completed_at && (
              <View style={styles.timelineItem}>
                <View style={styles.timelineLeft}>
                  <View style={[styles.timelineDot, styles.timelineDotActive]} />
                </View>
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineTitle}>Trip Completed</Text>
                  <Text style={styles.timelineTime}>{formatDate(booking.ride_completed_at)}</Text>
                </View>
              </View>
            )}

            {booking.cancelled_at && (
              <View style={styles.timelineItem}>
                <View style={styles.timelineLeft}>
                  <View style={[styles.timelineDot, styles.timelineDotCancelled]} />
                </View>
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineTitle}>Trip Cancelled</Text>
                  <Text style={styles.timelineTime}>{formatDate(booking.cancelled_at)}</Text>
                  {booking.cancellation_reason && (
                    <Text style={styles.timelineReason}>Reason: {booking.cancellation_reason}</Text>
                  )}
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          {booking.status === "completed" && booking.commuter_rating === null && (
            <Pressable
              style={styles.rateButton}
              onPress={() => navigation.navigate("RateDriver", { bookingId: id })}
            >
              <Ionicons name="star" size={20} color="#FFF" />
              <Text style={styles.rateButtonText}>Rate Your Driver</Text>
            </Pressable>
          )}

          <Pressable
            style={styles.mapButton}
            onPress={() => openMaps(
              booking.pickup_latitude,
              booking.pickup_longitude,
              "Pickup Location"
            )}
          >
            <Ionicons name="map" size={20} color="#183B5C" />
            <Text style={styles.mapButtonText}>Open in Maps</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#183B5C",
  },
  supportButton: {
    padding: 8,
  },
  mapPreview: {
    height: 200,
    position: "relative",
  },
  map: {
    width: "100%",
  },
  mapSmall: {
    height: 200,
  },
  mapFull: {
    height: 400,
  },
  mapOverlay: {
    position: "absolute",
    bottom: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 20,
    padding: 8,
  },
  pickupMarker: {
    backgroundColor: "#10B981",
    padding: 6,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#FFF",
  },
  dropoffMarker: {
    backgroundColor: "#EF4444",
    padding: 6,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#FFF",
  },
  statusContainer: {
    flexDirection: "row",
    padding: 20,
    gap: 10,
  },
  statusCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  referenceCard: {
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 15,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  referenceLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  referenceValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#183B5C",
  },
  section: {
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 10,
  },
  driverCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 15,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  driverAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  driverImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  driverVehicle: {
    fontSize: 12,
    color: "#666",
  },
  driverActions: {
    flexDirection: "row",
    gap: 8,
  },
  callButton: {
    backgroundColor: "#183B5C",
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  messageButton: {
    backgroundColor: "#FFB37A",
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  detailCard: {
    backgroundColor: "#FFF",
    padding: 15,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  detailRow: {
    flexDirection: "row",
    marginBottom: 15,
  },
  detailContent: {
    flex: 1,
    marginLeft: 12,
  },
  detailLabel: {
    fontSize: 10,
    color: "#666",
    marginBottom: 2,
  },
  detailText: {
    fontSize: 14,
    color: "#333",
    marginBottom: 4,
  },
  detailSubtext: {
    fontSize: 12,
    color: "#FFB37A",
  },
  detailDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginVertical: 15,
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  statItem: {
    alignItems: "center",
  },
  statLabel: {
    fontSize: 11,
    color: "#666",
    marginTop: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  paymentCard: {
    backgroundColor: "#FFF",
    padding: 15,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  paymentLabel: {
    fontSize: 14,
    color: "#666",
  },
  paymentValue: {
    fontSize: 14,
    color: "#333",
    fontWeight: "500",
  },
  paymentDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginVertical: 10,
  },
  paymentTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  paymentTotalLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  paymentTotalValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#183B5C",
  },
  paidBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#D1FAE5",
    padding: 10,
    borderRadius: 8,
    gap: 8,
  },
  paidText: {
    fontSize: 12,
    color: "#10B981",
    fontWeight: "500",
  },
  timelineCard: {
    backgroundColor: "#FFF",
    padding: 15,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  timelineItem: {
    flexDirection: "row",
    minHeight: 60,
  },
  timelineLeft: {
    width: 30,
    alignItems: "center",
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#D1D5DB",
    marginTop: 4,
  },
  timelineDotActive: {
    backgroundColor: "#10B981",
  },
  timelineDotCancelled: {
    backgroundColor: "#EF4444",
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: "#F3F4F6",
    marginVertical: 4,
  },
  timelineContent: {
    flex: 1,
    marginLeft: 10,
    paddingBottom: 20,
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    marginBottom: 2,
  },
  timelineTime: {
    fontSize: 12,
    color: "#999",
  },
  timelineReason: {
    fontSize: 12,
    color: "#EF4444",
    marginTop: 4,
  },
  actionContainer: {
    padding: 20,
    gap: 10,
  },
  rateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#183B5C",
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  rateButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  mapButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  mapButtonText: {
    color: "#183B5C",
    fontSize: 16,
    fontWeight: "600",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginTop: 20,
  },
});