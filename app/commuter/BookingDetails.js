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
  Image,
  Linking,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function BookingDetails() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const { id } = route.params || {}; // Add fallback empty object

  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(null);
  const [driver, setDriver] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [commuterRating, setCommuterRating] = useState(null);

  useEffect(() => {
    // Check if id exists before fetching
    if (!id) {
      console.log("No booking ID provided");
      Alert.alert("Error", "No booking ID provided");
      navigation.goBack();
      return;
    }
    
    fetchBookingDetails();
  }, [id]);

  const fetchBookingDetails = async () => {
    try {
      // Fetch booking details
      const { data: bookingData, error: bookingError } = await supabase
        .from("bookings")
        .select(`
          *,
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

      if (bookingError) throw bookingError;
      
      // Check if booking data exists
      if (!bookingData) {
        Alert.alert("Error", "Booking not found");
        navigation.goBack();
        return;
      }
      
      setBooking(bookingData);

      // If there's a driver, fetch driver details and vehicle
      if (bookingData.driver_id) {
        // Fetch driver details
        const { data: driverData, error: driverError } = await supabase
          .from("drivers")
          .select(`
            id,
            first_name,
            last_name,
            phone,
            profile_picture
          `)
          .eq("id", bookingData.driver_id)
          .single();

        if (driverError) {
          console.log("Error fetching driver:", driverError);
        } else if (driverData) {
          setDriver(driverData);
        }

        // Fetch vehicle details separately
        const { data: vehicleData, error: vehicleError } = await supabase
          .from("driver_vehicles")
          .select(`
            vehicle_type,
            vehicle_color,
            plate_number
          `)
          .eq("driver_id", bookingData.driver_id)
          .maybeSingle();

        if (!vehicleError && vehicleData) {
          setVehicle(vehicleData);
        }
      }

      // Fetch points earned for this booking
      const { data: pointsData } = await supabase
        .from("commuter_points_history")
        .select("points")
        .eq("source_id", id)
        .eq("type", "earned")
        .maybeSingle();

      if (pointsData) {
        setPointsEarned(pointsData.points);
      }

      // Fetch commuter's rating for this driver (if any)
      if (bookingData.driver_id) {
        const { data: ratingData } = await supabase
          .from("driver_reviews")
          .select("rating, comment")
          .eq("booking_id", id)
          .maybeSingle();

        if (ratingData) {
          setCommuterRating(ratingData);
        }
      }

    } catch (err) {
      console.log("Error fetching booking details:", err);
      Alert.alert("Error", "Failed to load booking details");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
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
      case "completed":
        return "#10B981";
      case "cancelled":
        return "#EF4444";
      case "accepted":
        return "#3B82F6";
      default:
        return "#F59E0B";
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "completed":
        return "checkmark-circle";
      case "cancelled":
        return "close-circle";
      case "accepted":
        return "car";
      default:
        return "time";
    }
  };

  const callDriver = () => {
    if (!driver?.phone) {
      Alert.alert("Error", "Driver phone number not available");
      return;
    }
    Linking.openURL(`tel:${driver.phone}`);
  };

  const messageDriver = () => {
    if (!driver?.phone) {
      Alert.alert("Error", "Driver phone number not available");
      return;
    }
    Linking.openURL(`sms:${driver.phone}`);
  };

  const openInMaps = (lat, lng, label) => {
    if (!lat || !lng) {
      Alert.alert("Error", "Location coordinates not available");
      return;
    }
    
    const scheme = Platform.select({
      ios: `maps:0,0?q=${label}@${lat},${lng}`,
      android: `geo:0,0?q=${lat},${lng}(${label})`,
    });
    Linking.openURL(scheme);
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
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={60} color="#EF4444" />
        <Text style={styles.errorText}>Booking not found</Text>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#183B5C" />
        </Pressable>
        <Text style={styles.headerTitle}>Booking Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Status Card */}
        <View style={styles.statusCard}>
          <View style={[styles.statusIcon, { backgroundColor: getStatusColor(booking.status) + "20" }]}>
            <Ionicons name={getStatusIcon(booking.status)} size={32} color={getStatusColor(booking.status)} />
          </View>
          <View style={styles.statusInfo}>
            <Text style={styles.statusLabel}>Status</Text>
            <Text style={[styles.statusValue, { color: getStatusColor(booking.status) }]}>
              {booking.status?.toUpperCase() || "UNKNOWN"}
            </Text>
          </View>
          <Text style={styles.bookingRef}>#{booking.booking_reference?.slice(-6) || "N/A"}</Text>
        </View>

        {/* Date */}
        <View style={styles.dateCard}>
          <Ionicons name="calendar" size={20} color="#666" />
          <Text style={styles.dateText}>{formatDate(booking.created_at)}</Text>
        </View>

        {/* Locations */}
        <View style={styles.locationsCard}>
          <View style={styles.locationRow}>
            <View style={styles.locationIcon}>
              <View style={[styles.dot, { backgroundColor: "#10B981" }]} />
            </View>
            <View style={styles.locationContent}>
              <Text style={styles.locationLabel}>PICKUP</Text>
              <Text style={styles.locationAddress}>{booking.pickup_location || "N/A"}</Text>
              {booking.pickup_details && (
                <Text style={styles.locationDetails}>📝 {booking.pickup_details}</Text>
              )}
              {booking.pickup_latitude && booking.pickup_longitude && (
                <Pressable
                  style={styles.mapLink}
                  onPress={() => openInMaps(
                    booking.pickup_latitude,
                    booking.pickup_longitude,
                    "Pickup Location"
                  )}
                >
                  <Ionicons name="map" size={14} color="#3B82F6" />
                  <Text style={styles.mapLinkText}>Open in Maps</Text>
                </Pressable>
              )}
            </View>
          </View>

          <View style={styles.locationLine} />

          <View style={styles.locationRow}>
            <View style={styles.locationIcon}>
              <View style={[styles.dot, { backgroundColor: "#EF4444" }]} />
            </View>
            <View style={styles.locationContent}>
              <Text style={styles.locationLabel}>DROPOFF</Text>
              <Text style={styles.locationAddress}>{booking.dropoff_location || "N/A"}</Text>
              {booking.dropoff_details && (
                <Text style={styles.locationDetails}>📝 {booking.dropoff_details}</Text>
              )}
              {booking.dropoff_latitude && booking.dropoff_longitude && (
                <Pressable
                  style={styles.mapLink}
                  onPress={() => openInMaps(
                    booking.dropoff_latitude,
                    booking.dropoff_longitude,
                    "Dropoff Location"
                  )}
                >
                  <Ionicons name="map" size={14} color="#3B82F6" />
                  <Text style={styles.mapLinkText}>Open in Maps</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>

        {/* Driver Info (if available) */}
        {driver && (
          <View style={styles.driverCard}>
            <Text style={styles.cardTitle}>Driver</Text>
            <View style={styles.driverContent}>
              <View style={styles.driverAvatar}>
                {driver.profile_picture ? (
                  <Image source={{ uri: driver.profile_picture }} style={styles.driverImage} />
                ) : (
                  <Ionicons name="person-circle" size={60} color="#9CA3AF" />
                )}
              </View>
              <View style={styles.driverInfo}>
                <Text style={styles.driverName}>
                  {driver.first_name} {driver.last_name}
                </Text>
                {vehicle && (
                  <View style={styles.vehicleInfo}>
                    <Text style={styles.vehicleText}>
                      {vehicle.vehicle_color || ''} {vehicle.vehicle_type || ''}
                    </Text>
                    <Text style={styles.plateText}>{vehicle.plate_number || ''}</Text>
                  </View>
                )}
                {booking.status === "completed" && commuterRating && (
                  <View style={styles.ratingContainer}>
                    <Ionicons name="star" size={16} color="#FFB37A" />
                    <Text style={styles.ratingText}>{commuterRating.rating.toFixed(1)}</Text>
                  </View>
                )}
              </View>
              {booking.status !== "cancelled" && (
                <View style={styles.driverActions}>
                  <Pressable style={styles.callButton} onPress={callDriver}>
                    <Ionicons name="call" size={20} color="#FFF" />
                  </Pressable>
                  <Pressable style={styles.messageButton} onPress={messageDriver}>
                    <Ionicons name="chatbubble" size={20} color="#183B5C" />
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Trip Details */}
        <View style={styles.detailsCard}>
          <Text style={styles.cardTitle}>Trip Details</Text>
          
          <View style={styles.detailsGrid}>
            <View style={styles.detailItem}>
              <Ionicons name="people" size={20} color="#666" />
              <Text style={styles.detailLabel}>Passengers</Text>
              <Text style={styles.detailValue}>{booking.passenger_count || 1}</Text>
            </View>

            <View style={styles.detailItem}>
              <Ionicons name="map" size={20} color="#666" />
              <Text style={styles.detailLabel}>Distance</Text>
              <Text style={styles.detailValue}>{booking.distance_km || "?"} km</Text>
            </View>

            <View style={styles.detailItem}>
              <Ionicons name="time" size={20} color="#666" />
              <Text style={styles.detailLabel}>Duration</Text>
              <Text style={styles.detailValue}>{booking.duration_minutes || "?"} min</Text>
            </View>
          </View>
        </View>

        {/* Payment Details */}
        <View style={styles.paymentCard}>
          <Text style={styles.cardTitle}>Payment Details</Text>

          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Base Fare</Text>
            <Text style={styles.paymentValue}>{formatCurrency(booking.base_fare || 15)}</Text>
          </View>

          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Per KM Rate</Text>
            <Text style={styles.paymentValue}>{formatCurrency(booking.per_km_rate || 15)}/km</Text>
          </View>

          {booking.distance_km > 0 && (
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Distance Charge</Text>
              <Text style={styles.paymentValue}>
                {formatCurrency((booking.per_km_rate || 15) * booking.distance_km)}
              </Text>
            </View>
          )}

          <View style={styles.paymentDivider} />

          <View style={styles.paymentRow}>
            <Text style={styles.totalLabel}>Total Fare</Text>
            <Text style={styles.totalValue}>{formatCurrency(booking.fare)}</Text>
          </View>

          {/* Payment Method */}
          <View style={styles.paymentMethodRow}>
            <Text style={styles.paymentLabel}>Payment Method</Text>
            <View style={[
              styles.paymentMethodBadge,
              booking.payment_type === 'wallet' ? styles.walletBadge : styles.cashBadge
            ]}>
              <Ionicons 
                name={booking.payment_type === 'wallet' ? 'star' : 'cash'} 
                size={14} 
                color={booking.payment_type === 'wallet' ? "#F59E0B" : "#10B981"} 
              />
              <Text style={[
                styles.paymentMethodText,
                booking.payment_type === 'wallet' ? styles.walletText : styles.cashText
              ]}>
                {booking.payment_type === 'wallet' ? 'Paid with Points' : 'Cash'}
              </Text>
            </View>
          </View>

          {/* Points Used (if any) */}
          {booking.points_used > 0 && (
            <View style={styles.pointsUsedRow}>
              <Ionicons name="star" size={16} color="#F59E0B" />
              <Text style={styles.pointsUsedText}>
                {booking.points_used} points used (worth {formatCurrency(booking.points_used * 0.1)})
              </Text>
            </View>
          )}

          {/* Points Earned (if completed) */}
          {booking.status === "completed" && pointsEarned > 0 && (
            <View style={styles.pointsEarnedRow}>
              <Ionicons name="star" size={16} color="#10B981" />
              <Text style={styles.pointsEarnedText}>
                You earned {pointsEarned} points from this trip!
              </Text>
            </View>
          )}

          <View style={styles.paymentStatus}>
            <Text style={styles.paymentStatusLabel}>Status</Text>
            <View style={[
              styles.statusBadge,
              booking.payment_status === "paid" ? styles.paidBadge : styles.pendingBadge
            ]}>
              <Text style={[
                styles.statusBadgeText,
                booking.payment_status === "paid" ? styles.paidText : styles.pendingText
              ]}>
                {booking.payment_status === "paid" ? "PAID" : "PENDING"}
              </Text>
            </View>
          </View>
        </View>

        {/* Action Buttons for Active Rides */}
        {booking.status === "accepted" && (
          <View style={styles.actionButtons}>
            <Pressable
              style={styles.trackButton}
              onPress={() => navigation.navigate("TrackRide", { bookingId: booking.id })}
            >
              <Ionicons name="navigate" size={20} color="#FFF" />
              <Text style={styles.trackButtonText}>Track Ride</Text>
            </Pressable>
          </View>
        )}

        {/* Rate Button for Completed Rides (if not rated) */}
        {booking.status === "completed" && !booking.commuter_rating && (
          <Pressable
            style={styles.rateButton}
            onPress={() => navigation.navigate("RateRide", { 
              bookingId: booking.id,
              driverId: booking.driver_id 
            })}
          >
            <Ionicons name="star" size={20} color="#FFF" />
            <Text style={styles.rateButtonText}>Rate Your Driver</Text>
          </Pressable>
        )}

        {/* Cancellation Info */}
        {booking.status === "cancelled" && booking.cancellation_reason && (
          <View style={styles.cancellationCard}>
            <Ionicons name="information-circle" size={20} color="#EF4444" />
            <View style={styles.cancellationInfo}>
              <Text style={styles.cancellationLabel}>Cancelled by {booking.cancelled_by || "system"}</Text>
              <Text style={styles.cancellationReason}>{booking.cancellation_reason}</Text>
            </View>
          </View>
        )}
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
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: "#333",
    marginTop: 10,
    marginBottom: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: "#183B5C",
    fontSize: 16,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#183B5C",
  },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    margin: 20,
    marginBottom: 10,
    padding: 15,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statusIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  statusInfo: {
    flex: 1,
  },
  statusLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
  },
  statusValue: {
    fontSize: 18,
    fontWeight: "bold",
  },
  bookingRef: {
    fontSize: 12,
    color: "#999",
  },
  dateCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 15,
    borderRadius: 16,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  dateText: {
    fontSize: 14,
    color: "#333",
    flex: 1,
  },
  locationsCard: {
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 15,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  locationRow: {
    flexDirection: "row",
  },
  locationIcon: {
    width: 30,
    alignItems: "center",
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  locationLine: {
    width: 2,
    height: 30,
    backgroundColor: "#E5E7EB",
    marginLeft: 14,
  },
  locationContent: {
    flex: 1,
    marginLeft: 8,
  },
  locationLabel: {
    fontSize: 11,
    color: "#999",
    marginBottom: 2,
  },
  locationAddress: {
    fontSize: 14,
    color: "#333",
    marginBottom: 4,
  },
  locationDetails: {
    fontSize: 12,
    color: "#666",
    fontStyle: "italic",
    marginBottom: 4,
  },
  mapLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  mapLinkText: {
    fontSize: 12,
    color: "#3B82F6",
  },
  driverCard: {
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 15,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  driverContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  driverAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 12,
  },
  driverImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  vehicleInfo: {
    marginBottom: 4,
  },
  vehicleText: {
    fontSize: 13,
    color: "#666",
  },
  plateText: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratingText: {
    fontSize: 14,
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
  detailsCard: {
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 15,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  detailsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  detailItem: {
    alignItems: "center",
  },
  detailLabel: {
    fontSize: 11,
    color: "#666",
    marginTop: 4,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  paymentCard: {
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 15,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  paymentLabel: {
    fontSize: 14,
    color: "#666",
  },
  paymentValue: {
    fontSize: 14,
    color: "#333",
  },
  paymentDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginVertical: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  totalValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#183B5C",
  },
  paymentMethodRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  paymentMethodBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
    gap: 4,
  },
  walletBadge: {
    backgroundColor: "#FEF3C7",
  },
  cashBadge: {
    backgroundColor: "#E8F5E9",
  },
  paymentMethodText: {
    fontSize: 12,
    fontWeight: "600",
  },
  walletText: {
    color: "#F59E0B",
  },
  cashText: {
    color: "#10B981",
  },
  pointsUsedRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  pointsUsedText: {
    fontSize: 12,
    color: "#F59E0B",
    flex: 1,
  },
  pointsEarnedRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  pointsEarnedText: {
    fontSize: 12,
    color: "#10B981",
    flex: 1,
  },
  paymentStatus: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  paymentStatusLabel: {
    fontSize: 14,
    color: "#666",
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  paidBadge: {
    backgroundColor: "#D1FAE5",
  },
  pendingBadge: {
    backgroundColor: "#FEF3C7",
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  paidText: {
    color: "#10B981",
  },
  pendingText: {
    color: "#F59E0B",
  },
  actionButtons: {
    marginHorizontal: 20,
    marginBottom: 10,
  },
  trackButton: {
    backgroundColor: "#3B82F6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  trackButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  rateButton: {
    backgroundColor: "#183B5C",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  rateButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  cancellationCard: {
    flexDirection: "row",
    backgroundColor: "#FEE2E2",
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 15,
    borderRadius: 12,
    gap: 12,
  },
  cancellationInfo: {
    flex: 1,
  },
  cancellationLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#B91C1C",
    marginBottom: 4,
  },
  cancellationReason: {
    fontSize: 13,
    color: "#7F1D1D",
  },
});