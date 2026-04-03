import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Linking,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { useRoute } from "@react-navigation/native";

export default function TripDetailsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const { tripId } = route.params;
  
  const [loading, setLoading] = useState(true);
  const [trip, setTrip] = useState(null);
  const [commuter, setCommuter] = useState(null);

  useEffect(() => {
    fetchTripDetails();
  }, [tripId]);

  const fetchTripDetails = async () => {
    try {
      setLoading(true);
      console.log("🔍 Fetching trip details for ID:", tripId);

      // Fetch booking details with commuter info and driver info if available
      const { data: bookingData, error: bookingError } = await supabase
        .from("bookings")
        .select(`
          *,
          commuter:commuters (
            id,
            first_name,
            middle_name,
            last_name,
            phone,
            email,
            profile_picture
          ),
          driver:drivers (
            id,
            first_name,
            middle_name,
            last_name,
            phone,
            profile_picture
          )
        `)
        .eq("id", tripId)
        .single();

      if (bookingError) throw bookingError;
      
      console.log("✅ Trip details:", bookingData);
      setTrip(bookingData);
      
      if (bookingData?.commuter) {
        setCommuter(bookingData.commuter);
      }

    } catch (err) {
      console.log("❌ Error fetching trip details:", err.message);
      Alert.alert("Error", "Hindi makuha ang trip details");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed': return '#10B981';
      case 'cancelled': return '#EF4444';
      case 'pending': return '#F59E0B';
      case 'accepted': return '#3B82F6';
      default: return '#6B7280';
    }
  };

  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed': return 'checkmark-circle';
      case 'cancelled': return 'close-circle';
      case 'pending': return 'time';
      case 'accepted': return 'bicycle';
      default: return 'information-circle';
    }
  };

  const getStatusLabel = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      case 'pending': return 'Pending';
      case 'accepted': return 'Accepted';
      default: return status || 'Unknown';
    }
  };

  const openMaps = (lat, lng, label) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    Linking.openURL(url);
  };

  const callContact = (phone) => {
    if (!phone) {
      Alert.alert("Error", "No phone number available");
      return;
    }
    Linking.openURL(`tel:${phone}`);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F5F7FA" }}>
        <ActivityIndicator size="large" color="#183B5C" />
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F5F7FA" }}>
        <Ionicons name="alert-circle-outline" size={60} color="#999" />
        <Text style={{ marginTop: 16, fontSize: 16, color: "#666" }}>
          Trip not found
        </Text>
        <Pressable
          onPress={() => navigation.goBack()}
          style={{
            marginTop: 20,
            backgroundColor: "#183B5C",
            paddingHorizontal: 20,
            paddingVertical: 10,
            borderRadius: 8,
          }}
        >
          <Text style={{ color: "#FFF", fontWeight: "600" }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  // Determine which fare to display
  const displayFare = trip.actual_fare || trip.fare || trip.estimated_fare || 0;
  
  // Determine payment method
  const paymentMethod = trip.payment_method || trip.payment_type || 'cash';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F5F7FA" }}
      contentContainerStyle={{ paddingBottom: 30 }}
    >
      {/* Header */}
      <View
        style={{
          backgroundColor: "#183B5C",
          paddingTop: insets.top + 20,
          paddingBottom: 30,
          paddingHorizontal: 20,
          borderBottomLeftRadius: 30,
          borderBottomRightRadius: 30,
        }}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          style={{ position: "absolute", top: insets.top + 10, left: 20, zIndex: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </Pressable>

        <Text style={{ fontSize: 24, fontWeight: "bold", color: "#FFF", marginTop: 20 }}>
          Trip Details
        </Text>
        <Text style={{ fontSize: 14, color: "#FFB37A", marginTop: 5 }}>
          {formatDate(trip.created_at)}
        </Text>
        {trip.booking_reference && (
          <Text style={{ fontSize: 12, color: "#FFF", marginTop: 5 }}>
            Ref: {trip.booking_reference}
          </Text>
        )}
      </View>

      {/* Status Banner */}
      <View style={{
        marginHorizontal: 20,
        marginTop: -15,
        padding: 15,
        backgroundColor: "#FFF",
        borderRadius: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{
            backgroundColor: getStatusColor(trip.status) + "20",
            padding: 10,
            borderRadius: 12,
            marginRight: 12,
          }}>
            <Ionicons 
              name={getStatusIcon(trip.status)} 
              size={28} 
              color={getStatusColor(trip.status)} 
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: "bold", color: "#333" }}>
              Trip Status
            </Text>
            <Text style={{ 
              fontSize: 18, 
              fontWeight: "700", 
              color: getStatusColor(trip.status),
              textTransform: "capitalize"
            }}>
              {getStatusLabel(trip.status)}
            </Text>
          </View>
          <View>
            <Text style={{ color: "#666", fontSize: 12 }}>Fare</Text>
            <Text style={{ fontSize: 22, fontWeight: "bold", color: "#183B5C" }}>
              ₱{displayFare?.toFixed(2)}
            </Text>
          </View>
        </View>
      </View>

      {/* Route Information */}
      <View style={{ marginHorizontal: 20, marginTop: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 15, color: "#333" }}>
          📍 Route
        </Text>

        {/* Pickup */}
        <View style={{ flexDirection: "row", marginBottom: 15 }}>
          <View style={{ alignItems: "center", marginRight: 12 }}>
            <View style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: "#10B98120",
              justifyContent: "center",
              alignItems: "center",
            }}>
              <Ionicons name="location" size={14} color="#10B981" />
            </View>
            <View style={{ width: 2, height: 30, backgroundColor: "#E5E7EB" }} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, color: "#10B981", fontWeight: "600" }}>PICKUP</Text>
            <Text style={{ fontSize: 16, color: "#333", marginTop: 2 }}>
              {trip.pickup_location}
            </Text>
            {trip.pickup_landmark && (
              <Text style={{ fontSize: 14, color: "#666", marginTop: 2 }}>
                Landmark: {trip.pickup_landmark}
              </Text>
            )}
            {trip.pickup_details && (
              <Text style={{ fontSize: 14, color: "#666", marginTop: 2 }}>
                Details: {trip.pickup_details}
              </Text>
            )}
            {trip.pickup_latitude && trip.pickup_longitude && (
              <Pressable 
                onPress={() => openMaps(trip.pickup_latitude, trip.pickup_longitude, "Pickup")}
                style={{ flexDirection: "row", alignItems: "center", marginTop: 5 }}
              >
                <Ionicons name="map-outline" size={14} color="#3B82F6" />
                <Text style={{ fontSize: 12, color: "#3B82F6", marginLeft: 4 }}>
                  Open in Maps
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Dropoff */}
        <View style={{ flexDirection: "row" }}>
          <View style={{ alignItems: "center", marginRight: 12 }}>
            <View style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: "#EF444420",
              justifyContent: "center",
              alignItems: "center",
            }}>
              <Ionicons name="flag" size={14} color="#EF4444" />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, color: "#EF4444", fontWeight: "600" }}>DROPOFF</Text>
            <Text style={{ fontSize: 16, color: "#333", marginTop: 2 }}>
              {trip.dropoff_location}
            </Text>
            {trip.dropoff_landmark && (
              <Text style={{ fontSize: 14, color: "#666", marginTop: 2 }}>
                Landmark: {trip.dropoff_landmark}
              </Text>
            )}
            {trip.dropoff_details && (
              <Text style={{ fontSize: 14, color: "#666", marginTop: 2 }}>
                Details: {trip.dropoff_details}
              </Text>
            )}
            {trip.dropoff_latitude && trip.dropoff_longitude && (
              <Pressable 
                onPress={() => openMaps(trip.dropoff_latitude, trip.dropoff_longitude, "Dropoff")}
                style={{ flexDirection: "row", alignItems: "center", marginTop: 5 }}
              >
                <Ionicons name="map-outline" size={14} color="#3B82F6" />
                <Text style={{ fontSize: 12, color: "#3B82F6", marginLeft: 4 }}>
                  Open in Maps
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {/* Trip Statistics */}
      <View style={{ marginHorizontal: 20, marginTop: 25 }}>
        <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 15, color: "#333" }}>
          📊 Trip Statistics
        </Text>

        <View style={{ 
          backgroundColor: "#FFF", 
          borderRadius: 16, 
          padding: 15,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
          elevation: 2,
        }}>
          {trip.passenger_count && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
              <Text style={{ color: "#666" }}>Passengers</Text>
              <Text style={{ fontWeight: "600", color: "#333" }}>
                {trip.passenger_count}
              </Text>
            </View>
          )}

          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={{ color: "#666" }}>Distance</Text>
            <Text style={{ fontWeight: "600", color: "#333" }}>
              {trip.distance_km ? `${trip.distance_km} km` : "N/A"}
            </Text>
          </View>
          
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={{ color: "#666" }}>Duration</Text>
            <Text style={{ fontWeight: "600", color: "#333" }}>
              {trip.duration_minutes ? `${trip.duration_minutes} mins` : "N/A"}
            </Text>
          </View>

          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={{ color: "#666" }}>Payment Method</Text>
            <Text style={{ fontWeight: "600", color: "#333", textTransform: "capitalize" }}>
              {paymentMethod}
            </Text>
          </View>

          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: "#666" }}>Payment Status</Text>
            <Text style={{ 
              fontWeight: "600", 
              color: trip.payment_status === 'paid' ? '#10B981' : '#F59E0B',
              textTransform: "capitalize"
            }}>
              {trip.payment_status || "pending"}
            </Text>
          </View>

          {trip.base_fare && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12 }}>
              <Text style={{ color: "#666" }}>Base Fare</Text>
              <Text style={{ fontWeight: "600", color: "#333" }}>
                ₱{trip.base_fare}.00
              </Text>
            </View>
          )}

          {trip.per_km_rate && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12 }}>
              <Text style={{ color: "#666" }}>Per KM Rate</Text>
              <Text style={{ fontWeight: "600", color: "#333" }}>
                ₱{trip.per_km_rate}.00
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Commuter Information */}
      {commuter && (
        <View style={{ marginHorizontal: 20, marginTop: 25 }}>
          <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 15, color: "#333" }}>
            👤 Commuter
          </Text>

          <View style={{ 
            backgroundColor: "#FFF", 
            borderRadius: 16, 
            padding: 15,
            flexDirection: "row",
            alignItems: "center",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 4,
            elevation: 2,
          }}>
            <View style={{
              width: 50,
              height: 50,
              borderRadius: 25,
              backgroundColor: "#E5E7EB",
              justifyContent: "center",
              alignItems: "center",
              marginRight: 15,
            }}>
              {commuter.profile_picture ? (
                <Image source={{ uri: commuter.profile_picture }} style={{ width: 50, height: 50, borderRadius: 25 }} />
              ) : (
                <Ionicons name="person" size={30} color="#9CA3AF" />
              )}
            </View>
            
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "bold", color: "#333" }}>
                {commuter.first_name} {commuter.middle_name ? commuter.middle_name + ' ' : ''}{commuter.last_name}
              </Text>
              <Text style={{ fontSize: 14, color: "#666", marginTop: 2 }}>
                {commuter.phone || "No phone number"}
              </Text>
              {commuter.email && (
                <Text style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                  {commuter.email}
                </Text>
              )}
            </View>

            {commuter.phone && (
              <Pressable 
                onPress={() => callContact(commuter.phone)}
                style={{
                  backgroundColor: "#183B5C",
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons name="call" size={20} color="#FFF" />
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* Driver Information (if assigned)
      {trip.driver && (
        <View style={{ marginHorizontal: 20, marginTop: 25 }}>
          <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 15, color: "#333" }}>
            🚗 Driver
          </Text>

          <View style={{ 
            backgroundColor: "#FFF", 
            borderRadius: 16, 
            padding: 15,
            flexDirection: "row",
            alignItems: "center",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 4,
            elevation: 2,
          }}>
            <View style={{
              width: 50,
              height: 50,
              borderRadius: 25,
              backgroundColor: "#E5E7EB",
              justifyContent: "center",
              alignItems: "center",
              marginRight: 15,
            }}>
              {trip.driver.profile_picture ? (
                <Image source={{ uri: trip.driver.profile_picture }} style={{ width: 50, height: 50, borderRadius: 25 }} />
              ) : (
                <Ionicons name="person" size={30} color="#9CA3AF" />
              )}
            </View>
            
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "bold", color: "#333" }}>
                {trip.driver.first_name} {trip.driver.middle_name ? trip.driver.middle_name + ' ' : ''}{trip.driver.last_name}
              </Text>
              <Text style={{ fontSize: 14, color: "#666", marginTop: 2 }}>
                {trip.driver.phone || "No phone number"}
              </Text>
            </View>

            {trip.driver.phone && (
              <Pressable 
                onPress={() => callContact(trip.driver.phone)}
                style={{
                  backgroundColor: "#183B5C",
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons name="call" size={20} color="#FFF" />
              </Pressable>
            )}
          </View>
        </View>
      )} */}

      {/* Timeline */}
      <View style={{ marginHorizontal: 20, marginTop: 25 }}>
        <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 15, color: "#333" }}>
          ⏱️ Timeline
        </Text>

        <View style={{ 
          backgroundColor: "#FFF", 
          borderRadius: 16, 
          padding: 15,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
          elevation: 2,
        }}>
          <View style={{ flexDirection: "row", marginBottom: 10 }}>
            <Text style={{ width: 100, color: "#666" }}>Created</Text>
            <Text style={{ flex: 1, fontWeight: "500" }}>{formatDate(trip.created_at)}</Text>
          </View>

          {trip.accepted_at && (
            <View style={{ flexDirection: "row", marginBottom: 10 }}>
              <Text style={{ width: 100, color: "#666" }}>Accepted</Text>
              <Text style={{ flex: 1, fontWeight: "500" }}>{formatDate(trip.accepted_at)}</Text>
            </View>
          )}
          
          {trip.driver_arrived_at && (
            <View style={{ flexDirection: "row", marginBottom: 10 }}>
              <Text style={{ width: 100, color: "#666" }}>Arrived</Text>
              <Text style={{ flex: 1, fontWeight: "500" }}>{formatDate(trip.driver_arrived_at)}</Text>
            </View>
          )}
          
          {trip.ride_started_at && (
            <View style={{ flexDirection: "row", marginBottom: 10 }}>
              <Text style={{ width: 100, color: "#666" }}>Started</Text>
              <Text style={{ flex: 1, fontWeight: "500" }}>{formatDate(trip.ride_started_at)}</Text>
            </View>
          )}
          
          {trip.ride_completed_at && (
            <View style={{ flexDirection: "row", marginBottom: 10 }}>
              <Text style={{ width: 100, color: "#666" }}>Completed</Text>
              <Text style={{ flex: 1, fontWeight: "500" }}>{formatDate(trip.ride_completed_at)}</Text>
            </View>
          )}

          {trip.cancelled_at && (
            <View style={{ flexDirection: "row" }}>
              <Text style={{ width: 100, color: "#666" }}>Cancelled</Text>
              <Text style={{ flex: 1, fontWeight: "500" }}>{formatDate(trip.cancelled_at)}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Ratings & Reviews */}
      {(trip.commuter_rating || trip.commuter_review || trip.driver_rating || trip.driver_review) && (
        <View style={{ marginHorizontal: 20, marginTop: 25 }}>
          <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 15, color: "#333" }}>
            ⭐ Feedback
          </Text>

          <View style={{ 
            backgroundColor: "#FFF", 
            borderRadius: 16, 
            padding: 15,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 4,
            elevation: 2,
          }}>
            {trip.commuter_rating && (
              <View style={{ marginBottom: trip.commuter_review ? 15 : 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
                  <Text style={{ marginRight: 10, color: "#666" }}>Commuter rating:</Text>
                  <View style={{ flexDirection: "row" }}>
                    {[1,2,3,4,5].map((star) => (
                      <Ionicons 
                        key={star}
                        name={star <= trip.commuter_rating ? "star" : "star-outline"} 
                        size={16} 
                        color="#F59E0B" 
                      />
                    ))}
                  </View>
                </View>
                {trip.commuter_review && (
                  <Text style={{ color: "#333", fontStyle: "italic" }}>"{trip.commuter_review}"</Text>
                )}
                {trip.commuter_rated_at && (
                  <Text style={{ fontSize: 11, color: "#999", marginTop: 5 }}>
                    Rated on: {formatDate(trip.commuter_rated_at)}
                  </Text>
                )}
              </View>
            )}
            
            {trip.driver_rating && (
              <View>
                {trip.commuter_rating && <View style={{ height: 1, backgroundColor: "#E5E7EB", marginVertical: 15 }} />}
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
                  <Text style={{ marginRight: 10, color: "#666" }}>Driver rating:</Text>
                  <View style={{ flexDirection: "row" }}>
                    {[1,2,3,4,5].map((star) => (
                      <Ionicons 
                        key={star}
                        name={star <= trip.driver_rating ? "star" : "star-outline"} 
                        size={16} 
                        color="#F59E0B" 
                      />
                    ))}
                  </View>
                </View>
                {trip.driver_review && (
                  <Text style={{ color: "#333", fontStyle: "italic" }}>"{trip.driver_review}"</Text>
                )}
                {trip.driver_rated_at && (
                  <Text style={{ fontSize: 11, color: "#999", marginTop: 5 }}>
                    Rated on: {formatDate(trip.driver_rated_at)}
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>
      )}

      {/* Action Buttons */}
      <View style={{ marginHorizontal: 20, marginTop: 30 }}>
        {trip.status === 'completed' && (
          <Pressable
  onPress={() => navigation.goBack()}
  style={{
    backgroundColor: "#183B5C",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 10,
  }}
>
  <Text style={{ color: "#FFF", fontWeight: "600", fontSize: 16 }}>
    ← Back to Trips
  </Text>
</Pressable>
        )}

        {trip.status === 'cancelled' && trip.cancellation_reason && (
          <View style={{
            backgroundColor: "#FEE2E2",
            padding: 15,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#FCA5A5",
          }}>
            <Text style={{ fontWeight: "600", color: "#B91C1C", marginBottom: 5 }}>
              Cancellation Reason:
            </Text>
            <Text style={{ color: "#7F1D1D" }}>{trip.cancellation_reason}</Text>
            {trip.cancelled_by && (
              <Text style={{ color: "#7F1D1D", marginTop: 5, fontSize: 12 }}>
                Cancelled by: {trip.cancelled_by}
              </Text>
            )}
            {trip.cancelled_at && (
              <Text style={{ color: "#7F1D1D", marginTop: 5, fontSize: 12 }}>
                Cancelled at: {formatDate(trip.cancelled_at)}
              </Text>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

// Payment Status