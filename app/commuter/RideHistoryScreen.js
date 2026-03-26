// app/commuter/RideHistoryScreen.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function RideHistoryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rides, setRides] = useState([]);
  const [stats, setStats] = useState({
    totalRides: 0,
    totalPoints: 0,
  });

  useFocusEffect(
    React.useCallback(() => {
      loadRideHistory();
    }, [])
  );

  const loadRideHistory = async () => {
    try {
      const userId = await AsyncStorage.getItem("user_id");
      if (!userId) return;

      const { data: ridesData, error: ridesError } = await supabase
        .from("bookings")
        .select(`
          id,
          booking_reference,
          created_at,
          pickup_location,
          dropoff_location,
          fare,
          payment_type,
          payment_status,
          status,
          distance_km,
          duration_minutes,
          driver:drivers (
            id,
            first_name,
            last_name,
            profile_picture
          ),
          driver_rating,
          commuter_rating,
          points_used
        `)
        .eq("commuter_id", userId)
        .in("status", ["completed", "cancelled"])
        .order("created_at", { ascending: false });

      if (ridesError) throw ridesError;

      const enhancedRides = await Promise.all((ridesData || []).map(async (ride) => {
        const { data: pointsData } = await supabase
          .from("commuter_points_history")
          .select("points")
          .eq("source_id", ride.id)
          .eq("type", "earned")
          .maybeSingle();

        const { data: ratingData } = await supabase
          .from("driver_reviews")
          .select("rating, comment")
          .eq("booking_id", ride.id)
          .maybeSingle();

        return {
          ...ride,
          points_earned: pointsData?.points || 0,
          my_rating: ratingData,
        };
      }));

      const completedRides = enhancedRides.filter(r => r.status === "completed");
      const totalPoints = completedRides.reduce((sum, ride) => sum + (ride.points_earned || 0), 0);

      setStats({
        totalRides: completedRides.length,
        totalPoints,
      });

      setRides(enhancedRides);
    } catch (err) {
      console.log("Error loading ride history:", err);
      Alert.alert("Error", "Failed to load ride history");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadRideHistory();
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays < 7) {
      return `${date.toLocaleDateString('en-US', { weekday: 'short' })} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  const formatCurrency = (amount) => {
    return `₱${amount?.toFixed(2) || "0.00"}`;
  };

  const getStatusColor = (status) => {
    return status === "completed" ? "#10B981" : "#EF4444";
  };

  const getStatusIcon = (status) => {
    return status === "completed" ? "checkmark-circle" : "close-circle";
  };

  const renderRideItem = ({ item }) => (
    <Pressable
      style={styles.rideCard}
      onPress={() => navigation.navigate("BookingDetails", { id: item.id })}
    >
      <View style={styles.rideHeader}>
        <View style={styles.dateContainer}>
          <Ionicons name="calendar-outline" size={14} color="#666" />
          <Text style={styles.dateText}>{formatDate(item.created_at)}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + "20" }]}>
          <Ionicons name={getStatusIcon(item.status)} size={12} color={getStatusColor(item.status)} />
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {item.status === "completed" ? "Completed" : "Cancelled"}
          </Text>
        </View>
      </View>

      <View style={styles.locationsContainer}>
        <View style={styles.locationRow}>
          <View style={styles.locationDot}>
            <View style={[styles.dot, { backgroundColor: "#10B981" }]} />
          </View>
          <Text style={styles.locationText} numberOfLines={1}>
            {item.pickup_location || ""}
          </Text>
        </View>
        
        <View style={styles.locationLine} />
        
        <View style={styles.locationRow}>
          <View style={styles.locationDot}>
            <View style={[styles.dot, { backgroundColor: "#EF4444" }]} />
          </View>
          <Text style={styles.locationText} numberOfLines={1}>
            {item.dropoff_location || ""}
          </Text>
        </View>
      </View>

      {item.driver && (
        <View style={styles.driverContainer}>
          <View style={styles.driverAvatar}>
            {item.driver.profile_picture ? (
              <Image source={{ uri: item.driver.profile_picture }} style={styles.driverImage} />
            ) : (
              <Ionicons name="person-circle" size={32} color="#9CA3AF" />
            )}
          </View>
          <View style={styles.driverInfo}>
            <Text style={styles.driverName}>
              {`${item.driver.first_name || ""} ${item.driver.last_name || ""}`}
            </Text>
            {item.driver_rating > 0 && (
              <View style={styles.ratingContainer}>
                <Ionicons name="star" size={12} color="#FFB37A" />
                <Text style={styles.ratingText}>{item.driver_rating.toFixed(1)}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      <View style={styles.rideFooter}>
        <View style={styles.rideStats}>
          {item.distance_km ? (
            <View style={styles.statItem}>
              <Ionicons name="map-outline" size={14} color="#666" />
              <Text style={styles.statText}>{`${item.distance_km} km`}</Text>
            </View>
          ) : null}
          {item.duration_minutes ? (
            <View style={styles.statItem}>
              <Ionicons name="time-outline" size={14} color="#666" />
              <Text style={styles.statText}>{`${item.duration_minutes} min`}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.amountContainer}>
          <View style={styles.fareContainer}>
            <Text style={styles.fareLabel}>Fare</Text>
            <Text style={styles.fareAmount}>{formatCurrency(item.fare)}</Text>
          </View>

          {item.status === "completed" && item.points_earned > 0 && (
            <View style={styles.pointsContainer}>
              <Ionicons name="star" size={14} color="#F59E0B" />
              <Text style={styles.pointsText}>{`+${item.points_earned} pts`}</Text>
            </View>
          )}

          <View style={[
            styles.paymentBadge,
            item.payment_type === 'wallet' ? styles.walletBadge : styles.cashBadge
          ]}>
            <Ionicons 
              name={item.payment_type === 'wallet' ? 'star' : 'cash'} 
              size={10} 
              color={item.payment_type === 'wallet' ? "#F59E0B" : "#10B981"} 
            />
            <Text style={[
              styles.paymentText,
              item.payment_type === 'wallet' ? styles.walletText : styles.cashText
            ]}>
              {item.payment_type === 'wallet' ? 'Points' : 'Cash'}
            </Text>
          </View>
        </View>

        {item.status === "completed" && !item.commuter_rating && (
          <View style={styles.rateReminder}>
            <Ionicons name="star-outline" size={16} color="#FFB37A" />
            <Text style={styles.rateReminderText}>Tap to rate this ride</Text>
          </View>
        )}
      </View>
    </Pressable>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="car-outline" size={80} color="#D1D5DB" />
      <Text style={styles.emptyTitle}>No Rides Yet</Text>
      <Text style={styles.emptyText}>
        Your completed rides will appear here
      </Text>
      <Pressable 
        style={styles.bookButton}
        onPress={() => navigation.navigate("Home")}
      >
        <Text style={styles.bookButtonText}>Book a Ride</Text>
      </Pressable>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#183B5C" />
        </Pressable>
        <Text style={styles.headerTitle}>Ride History</Text>
        <View style={{ width: 40 }} />
      </View>

      {stats.totalRides > 0 && (
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statCardValue}>{String(stats.totalRides)}</Text>
            <Text style={styles.statCardLabel}>Total Rides</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statCardValue}>{String(stats.totalPoints)}</Text>
            <Text style={styles.statCardLabel}>Points Earned</Text>
          </View>
        </View>
      )}

      <FlatList
        data={rides}
        renderItem={renderRideItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={renderEmptyState}
      />
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
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#183B5C",
  },
  statsContainer: {
    flexDirection: "row",
    padding: 15,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#FFF",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statCardValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#183B5C",
    marginBottom: 4,
  },
  statCardLabel: {
    fontSize: 11,
    color: "#666",
  },
  listContent: {
    padding: 15,
    paddingTop: 0,
  },
  rideCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 15,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  rideHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  dateContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dateText: {
    fontSize: 12,
    color: "#666",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  locationsContainer: {
    marginBottom: 12,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  locationDot: {
    width: 24,
    alignItems: "center",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  locationLine: {
    width: 2,
    height: 16,
    backgroundColor: "#E5E7EB",
    marginLeft: 11,
  },
  locationText: {
    flex: 1,
    fontSize: 13,
    color: "#333",
    marginLeft: 8,
  },
  driverContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    padding: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  driverAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  driverImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  driverInfo: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  driverName: {
    fontSize: 13,
    fontWeight: "500",
    color: "#333",
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  ratingText: {
    fontSize: 11,
    color: "#666",
  },
  rideFooter: {
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 12,
  },
  rideStats: {
    flexDirection: "row",
    gap: 15,
    marginBottom: 10,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statText: {
    fontSize: 11,
    color: "#666",
  },
  amountContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fareContainer: {
    flex: 1,
  },
  fareLabel: {
    fontSize: 10,
    color: "#999",
    marginBottom: 2,
  },
  fareAmount: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  pointsContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    marginRight: 8,
  },
  pointsText: {
    fontSize: 11,
    color: "#F59E0B",
    fontWeight: "600",
  },
  paymentBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  walletBadge: {
    backgroundColor: "#FEF3C7",
  },
  cashBadge: {
    backgroundColor: "#E8F5E9",
  },
  paymentText: {
    fontSize: 10,
    fontWeight: "600",
  },
  walletText: {
    color: "#F59E0B",
  },
  cashText: {
    color: "#10B981",
  },
  rateReminder: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF3E0",
    padding: 8,
    borderRadius: 8,
    marginTop: 10,
    gap: 6,
  },
  rateReminderText: {
    fontSize: 11,
    color: "#F59E0B",
    fontWeight: "500",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
    minHeight: 400,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginTop: 20,
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
  },
  bookButton: {
    backgroundColor: "#183B5C",
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 12,
  },
  bookButtonText: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 16,
  },
});