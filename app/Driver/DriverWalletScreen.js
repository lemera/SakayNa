// screens/driver/DriverWalletScreen.js
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { getUserSession } from "../utils/authStorage";

// Helper function to safely format numbers
const safeNumber = (value, decimals = 0) => {
  const num = Number(value);
  if (isNaN(num)) return decimals === 0 ? "0" : "0.00";
  return decimals === 0 ? num.toFixed(0) : num.toFixed(decimals);
};

// Helper function to safely get string
const safeString = (value, defaultValue = "") => {
  if (value === null || value === undefined) return defaultValue;
  return String(value);
};

export default function DriverWalletScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get("window").width - 40;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [driverId, setDriverId] = useState(null);
  const [isTestAccount, setIsTestAccount] = useState(false);
  const [driverName, setDriverName] = useState("");

  const [earningsData, setEarningsData] = useState({
    cash_earnings: 0,
    gcash_earnings: 0,
    total_earnings: 0,
    today_earnings: 0,
    this_week_earnings: 0,
    this_month_earnings: 0,
  });

  const [creditsData, setCreditsData] = useState({
    subscription_credits: 0,
    total_credits_earned: 0,
    credits_used: 0,
    mission_credits: 0,
    bonus_credits: 0,
  });

  const [recentTrips, setRecentTrips] = useState([]);
  const [totalTrips, setTotalTrips] = useState(0);
  const [statsData, setStatsData] = useState({
    total_trips: 0,
    completed_trips: 0,
    cancelled_trips: 0,
    average_rating: 0,
  });

  useFocusEffect(
    useCallback(() => {
      const getDriverId = async () => {
        try {
          const session = await getUserSession();

          if (session && session.isTestAccount && session.userType === "driver") {
            setIsTestAccount(true);
            setDriverId(session.phone);
            setDriverName("Test Driver");

            // Test data
            setEarningsData({
              cash_earnings: 1250,
              gcash_earnings: 350,
              total_earnings: 1600,
              today_earnings: 180,
              this_week_earnings: 1250,
              this_month_earnings: 4850,
            });

            setCreditsData({
              subscription_credits: 250,
              total_credits_earned: 500,
              credits_used: 250,
              mission_credits: 150,
              bonus_credits: 100,
            });

            setTotalTrips(24);
            setStatsData({
              total_trips: 28,
              completed_trips: 24,
              cancelled_trips: 4,
              average_rating: 4.8,
            });

            setRecentTrips([
              {
                id: "trip-1",
                booking_reference: "BK-2024001",
                pickup_location: "Ipil Central School",
                dropoff_location: "Poblacion Market",
                fare: 120,
                payment_method: "cash",
                status: "completed",
                created_at: new Date().toISOString(),
                completed_at: new Date().toISOString(),
                distance_km: 8.5,
                duration_minutes: 15,
                commuter_name: "Juan Dela Cruz",
              },
              {
                id: "trip-2",
                booking_reference: "BK-2024002",
                pickup_location: "Ipil Plaza",
                dropoff_location: "Sanito Terminal",
                fare: 85,
                payment_method: "gcash",
                status: "completed",
                created_at: new Date(Date.now() - 3600000).toISOString(),
                completed_at: new Date(Date.now() - 3500000).toISOString(),
                distance_km: 5.2,
                duration_minutes: 10,
                commuter_name: "Maria Santos",
              },
            ]);

            setLoading(false);
            return;
          }

          const id = await AsyncStorage.getItem("user_id");
          setDriverId(id);
          setIsTestAccount(false);

          if (id) {
            await fetchDriverName(id);
            await loadAllData(id);
          } else {
            setLoading(false);
          }
        } catch (error) {
          setLoading(false);
        }
      };

      getDriverId();
    }, [])
  );

  useEffect(() => {
    if (driverId && !isTestAccount) {
      loadAllData(driverId);
    }
  }, [driverId, isTestAccount]);

  const loadAllData = async (uid) => {
    try {
      setLoading(true);
      await Promise.all([
        fetchEarningsData(uid),
        fetchCreditsData(uid),
        fetchRecentTrips(uid),
        fetchStatistics(uid),
      ]);
    } catch (err) {
      // Silent fail
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    if (!driverId || isTestAccount) {
      setRefreshing(false);
      return;
    }

    setRefreshing(true);
    await loadAllData(driverId);
    setRefreshing(false);
  };

  const fetchDriverName = async (id) => {
    try {
      const { data, error } = await supabase
        .from("drivers")
        .select("first_name, last_name")
        .eq("id", id)
        .single();

      if (error) throw error;
      if (data) setDriverName(`${data.first_name} ${data.last_name}`);
    } catch (err) {
      // Silent fail
    }
  };

  const fetchEarningsData = async (uid) => {
    try {
      const today = new Date();
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      const { data: tripsData, error: tripsError } = await supabase
        .from("bookings")
        .select("fare, payment_type, created_at")
        .eq("driver_id", uid)
        .eq("status", "completed");

      if (tripsError) throw tripsError;

      let cashEarnings = 0;
      let gcashEarnings = 0;
      let todayEarnings = 0;
      let weekEarnings = 0;
      let monthEarnings = 0;

      tripsData?.forEach((trip) => {
        const fare = Number(trip.fare) || 0;
        const tripDate = new Date(trip.created_at);

        if (trip.payment_type === "cash") {
          cashEarnings += fare;
        } else if (trip.payment_type === "gcash") {
          gcashEarnings += fare;
        }

        if (tripDate >= startOfToday) {
          todayEarnings += fare;
        }
        if (tripDate >= startOfWeek) {
          weekEarnings += fare;
        }
        if (tripDate >= startOfMonth) {
          monthEarnings += fare;
        }
      });

      setEarningsData({
        cash_earnings: cashEarnings,
        gcash_earnings: gcashEarnings,
        total_earnings: cashEarnings + gcashEarnings,
        today_earnings: todayEarnings,
        this_week_earnings: weekEarnings,
        this_month_earnings: monthEarnings,
      });
    } catch (err) {
      // Silent fail
    }
  };

  const fetchCreditsData = async (uid) => {
    try {
      // Fetch subscription credits
      const { data: creditsData, error: creditsError } = await supabase
        .from("driver_subscription_credits")
        .select("credit_balance, total_earned, total_used")
        .eq("driver_id", uid)
        .maybeSingle();

      if (creditsError && creditsError.code !== "PGRST116") throw creditsError;

      // Fetch mission credits
      const { data: missionData, error: missionError } = await supabase
        .from("driver_subscription_credit_transactions")
        .select("amount")
        .eq("driver_id", uid)
        .eq("transaction_type", "earned")
        .not("mission_id", "is", null);

      if (missionError) throw missionError;

      // Fetch bonus credits
      const { data: bonusData, error: bonusError } = await supabase
        .from("driver_subscription_credit_transactions")
        .select("amount")
        .eq("driver_id", uid)
        .eq("transaction_type", "earned")
        .is("mission_id", null);

      if (bonusError) throw bonusError;

      const missionCredits = missionData?.reduce((sum, t) => sum + (Number(t.amount) || 0), 0) || 0;
      const bonusCredits = bonusData?.reduce((sum, t) => sum + (Number(t.amount) || 0), 0) || 0;

      setCreditsData({
        subscription_credits: Number(creditsData?.credit_balance) || 0,
        total_credits_earned: Number(creditsData?.total_earned) || 0,
        credits_used: Number(creditsData?.total_used) || 0,
        mission_credits: missionCredits,
        bonus_credits: bonusCredits,
      });
    } catch (err) {
      // Silent fail
    }
  };

  const fetchRecentTrips = async (uid) => {
    try {
      const { data: trips, error } = await supabase
        .from("bookings")
        .select(`
          id,
          booking_reference,
          pickup_location,
          dropoff_location,
          fare,
          payment_type,
          status,
          created_at,
          ride_completed_at,
          distance_km,
          duration_minutes,
          commuter_id,
          commuters (
            first_name,
            last_name
          )
        `)
        .eq("driver_id", uid)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;

      const formattedTrips = trips?.map((trip) => ({
        id: trip.id,
        booking_reference: trip.booking_reference || `BK-${trip.id.slice(0, 8)}`,
        pickup_location: trip.pickup_location || "Unknown",
        dropoff_location: trip.dropoff_location || "Unknown",
        fare: Number(trip.fare || trip.fare) || 0,
        payment_method: trip.payment_type || "cash",
        status: trip.status,
        created_at: trip.created_at,
        completed_at: trip.ride_completed_at,
        distance_km: trip.distance_km,
        duration_minutes: trip.duration_minutes,
        commuter_name: trip.commuters 
          ? `${trip.commuters.first_name} ${trip.commuters.last_name}`
          : "Passenger",
      })) || [];
      
      setRecentTrips(formattedTrips);
    } catch (err) {
      // Silent fail
    }
  };

const fetchStatistics = async (uid) => {
  try {
    // Get trips data for status counts
    const { data: tripsData, error: tripsError } = await supabase
      .from("bookings")
      .select("status")
      .eq("driver_id", uid);

    if (tripsError) throw tripsError;

    // Get ratings from driver_reviews table
    const { data: reviewsData, error: reviewsError } = await supabase
      .from("driver_reviews")
      .select("rating")
      .eq("driver_id", uid);

    if (reviewsError) throw reviewsError;

    const total = tripsData?.length || 0;
    const completed = tripsData?.filter(t => t.status === "completed").length || 0;
    const cancelled = tripsData?.filter(t => t.status === "cancelled").length || 0;
    
    // Calculate average rating from driver_reviews
    const ratings = reviewsData?.map(r => r.rating) || [];
    const avgRating = ratings.length > 0 
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length 
      : 0;

    setTotalTrips(completed);
    setStatsData({
      total_trips: total,
      completed_trips: completed,
      cancelled_trips: cancelled,
      average_rating: avgRating,
    });
  } catch (err) {
    console.error("Error fetching statistics:", err);
  }
};

  const formatDate = (dateString) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return "Today";
      if (diffDays === 1) return "Yesterday";
      if (diffDays < 7) return `${diffDays} days ago`;

      return date.toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
      });
    } catch (err) {
      return "";
    }
  };

  const formatTime = (dateString) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString("en-PH", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (err) {
      return "";
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "completed":
        return { bg: "#D1FAE5", text: "#10B981", label: "Completed" };
      case "cancelled":
        return { bg: "#FEE2E2", text: "#EF4444", label: "Cancelled" };
      case "pending":
        return { bg: "#FEF3C7", text: "#F59E0B", label: "Pending" };
      default:
        return { bg: "#F3F4F6", text: "#6B7280", label: status };
    }
  };

  const getPaymentIcon = (method) => {
    switch (method) {
      case "gcash":
        return { name: "phone-portrait", color: "#00579F", bg: "#E6F0FF" };
      case "cash":
        return { name: "cash", color: "#10B981", bg: "#D1FAE5" };
      default:
        return { name: "card", color: "#6B7280", bg: "#F3F4F6" };
    }
  };

  if (loading && !refreshing) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#F5F7FA",
        }}
      >
        <ActivityIndicator size="large" color="#183B5C" />
        <Text style={{ marginTop: 10, color: "#666" }}>Loading wallet data...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F5F7FA" }}
      refreshControl={
        !isTestAccount ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        ) : undefined
      }
    >
      {isTestAccount && (
        <View
          style={{
            backgroundColor: "#FFF3E0",
            padding: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Ionicons name="flask" size={20} color="#E97A3E" />
          <Text style={{ color: "#E97A3E", fontSize: 12, fontWeight: "500" }}>
            Test Account Mode
          </Text>
        </View>
      )}

      {/* Header */}
      <View
        style={{
          backgroundColor: "#183B5C",
          paddingTop: insets.top + 20,
          paddingBottom: 18,
          paddingHorizontal: 20,
          borderBottomLeftRadius: 30,
          borderBottomRightRadius: 30,
        }}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          style={{ 
            position: "absolute", 
            top: insets.top + 10, 
            left: 20,
            zIndex: 1,
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </Pressable>

        <Text
          style={{
            fontSize: 24,
            fontWeight: "bold",
            color: "#FFF",
            marginTop: 20,
            marginLeft: 30,
            marginRight: 20,
          }}
        >
          My Wallet
        </Text>
        <Text 
          style={{ 
            color: "#D1D5DB", 
            marginTop: 4, 
            fontSize: 13,
            marginLeft: 30,
            marginRight: 20,
          }}
        >
          Track your earnings, credits, and trip history
        </Text>
      </View>

      {/* Today's Earnings Card */}
      <View
        style={{
          marginHorizontal: 20,
          backgroundColor: "#FFF",
          borderRadius: 24,
          padding: 20,
          marginTop: 20,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 4,
        }}
      >
        <Text style={{ fontSize: 14, color: "#666" }}>Today's Earnings</Text>
        <Text
          style={{
            fontSize: 34,
            fontWeight: "bold",
            color: "#183B5C",
            marginTop: 4,
          }}
        >
          ₱{safeNumber(earningsData.today_earnings, 2)}
        </Text>

        <View
          style={{
            flexDirection: "row",
            marginTop: 18,
            paddingTop: 16,
            borderTopWidth: 1,
            borderTopColor: "#F3F4F6",
          }}
        >
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: "#666" }}>Total Trips</Text>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#333" }}>
              {safeNumber(totalTrips)}
            </Text>
          </View>

          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: "#666" }}>This Week</Text>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#10B981" }}>
              ₱{safeNumber(earningsData.this_week_earnings)}
            </Text>
          </View>

          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: "#666" }}>This Month</Text>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#00579F" }}>
              ₱{safeNumber(earningsData.this_month_earnings)}
            </Text>
          </View>
        </View>
      </View>

      {/* Subscription Credits Card */}
      <View
        style={{
          marginHorizontal: 20,
          marginTop: 15,
          backgroundColor: "#FFF",
          borderRadius: 24,
          padding: 20,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <Text
            style={{
              fontSize: 16,
              fontWeight: "bold",
              color: "#333",
            }}
          >
            Subscription Credits
          </Text>
          <View
            style={{
              backgroundColor: "#E6F0FF",
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 12,
            }}
          >
            <Text style={{ fontSize: 12, color: "#00579F", fontWeight: "600" }}>
              Available Balance
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 15 }}>
          <Ionicons name="wallet" size={28} color="#00579F" />
          <Text
            style={{
              fontSize: 32,
              fontWeight: "bold",
              color: "#00579F",
              marginLeft: 8,
            }}
          >
            ₱{safeNumber(creditsData.subscription_credits, 2)}
          </Text>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: "#666" }}>Total Earned</Text>
            <Text style={{ fontSize: 16, fontWeight: "bold", color: "#10B981" }}>
              ₱{safeNumber(creditsData.total_credits_earned)}
            </Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: "#666" }}>Credits Used</Text>
            <Text style={{ fontSize: 16, fontWeight: "bold", color: "#F59E0B" }}>
              ₱{safeNumber(creditsData.credits_used)}
            </Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: "#666" }}>Mission Credits</Text>
            <Text style={{ fontSize: 16, fontWeight: "bold", color: "#8B5CF6" }}>
              ₱{safeNumber(creditsData.mission_credits)}
            </Text>
          </View>
        </View>

        <View
          style={{
            marginTop: 15,
            padding: 10,
            backgroundColor: "#F9FAFB",
            borderRadius: 12,
          }}
        >
          <Text style={{ fontSize: 12, color: "#4B5563", lineHeight: 18 }}>
            • Credits can be used to pay for your subscription{"\n"}
            • Earn credits by completing ride missions{"\n"}
            • Credits are automatically applied to your next subscription payment
          </Text>
        </View>
      </View>

      {/* Performance Stats */}
      <View
        style={{
          marginHorizontal: 20,
          marginTop: 15,
          backgroundColor: "#FFF",
          borderRadius: 24,
          padding: 20,
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: "bold",
            color: "#333",
            marginBottom: 15,
          }}
        >
          Performance Stats
        </Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          <View style={{ width: "50%", marginBottom: 15 }}>
            <Text style={{ fontSize: 12, color: "#666" }}>Completed Trips</Text>
            <Text style={{ fontSize: 20, fontWeight: "bold", color: "#10B981" }}>
              {statsData.completed_trips}
            </Text>
          </View>

          <View style={{ width: "50%", marginBottom: 15 }}>
            <Text style={{ fontSize: 12, color: "#666" }}>Cancelled Trips</Text>
            <Text style={{ fontSize: 20, fontWeight: "bold", color: "#EF4444" }}>
              {statsData.cancelled_trips}
            </Text>
          </View>

          <View style={{ width: "50%", marginBottom: 15 }}>
            <Text style={{ fontSize: 12, color: "#666" }}>Total Trips</Text>
            <Text style={{ fontSize: 20, fontWeight: "bold", color: "#183B5C" }}>
              {statsData.total_trips}
            </Text>
          </View>

          <View style={{ width: "50%", marginBottom: 15 }}>
            <Text style={{ fontSize: 12, color: "#666" }}>Average Rating</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ fontSize: 20, fontWeight: "bold", color: "#F59E0B" }}>
                {statsData.average_rating.toFixed(1)}
              </Text>
              <Ionicons name="star" size={16} color="#F59E0B" style={{ marginLeft: 4 }} />
            </View>
          </View>
        </View>
      </View>

      {/* Recent Trips with View All Button */}
      <View
        style={{
          marginHorizontal: 20,
          marginTop: 15,
          marginBottom: 20,
          backgroundColor: "#FFF",
          borderRadius: 24,
          padding: 20,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}>
          <Text
            style={{
              fontSize: 16,
              fontWeight: "bold",
              color: "#333",
            }}
          >
            Recent Trips
          </Text>
          <TouchableOpacity
            style={{ flexDirection: "row", alignItems: "center" }}
            onPress={() => navigation.navigate("AllTripsScreen")}
          >
            <Text style={{ fontSize: 14, color: "#183B5C", fontWeight: "500", marginRight: 4 }}>
              View All
            </Text>
            <Ionicons name="arrow-forward" size={16} color="#183B5C" />
          </TouchableOpacity>
        </View>

        {!recentTrips || recentTrips.length === 0 ? (
          <View style={{ padding: 30, alignItems: "center" }}>
            <Ionicons name="car-outline" size={40} color="#D1D5DB" />
            <Text style={{ marginTop: 10, color: "#9CA3AF" }}>No trips yet</Text>
            <Text style={{ fontSize: 12, color: "#D1D5DB", marginTop: 4 }}>
              Complete trips to see them here
            </Text>
          </View>
        ) : (
          recentTrips.map((trip, index) => {
            const statusStyle = getStatusColor(trip.status);
            const paymentIcon = getPaymentIcon(trip.payment_method);

            return (
              <TouchableOpacity
                key={trip.id || index}
                style={{
                  paddingVertical: 12,
                  borderBottomWidth: index === recentTrips.length - 1 ? 0 : 1,
                  borderBottomColor: "#F3F4F6",
                }}
                onPress={() => navigation.navigate("TripDetailsScreen", { tripId: trip.id })}
              >
                {/* Trip Header */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#333" }}>
                      {trip.booking_reference}
                    </Text>
                    <View
                      style={{
                        marginLeft: 8,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 4,
                        backgroundColor: statusStyle.bg,
                      }}
                    >
                      <Text style={{ fontSize: 10, color: statusStyle.text, fontWeight: "500" }}>
                        {statusStyle.label}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 11, color: "#9CA3AF" }}>
                    {formatDate(trip.created_at)}
                  </Text>
                </View>

                {/* Route Info */}
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                  <View style={{ alignItems: "center", marginRight: 8 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#10B981" }} />
                    <View style={{ width: 1, height: 15, backgroundColor: "#E5E7EB", marginVertical: 1 }} />
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#EF4444" }} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, color: "#333" }} numberOfLines={1}>
                      {safeString(trip.pickup_location, "Pickup")}
                    </Text>
                    <Text style={{ fontSize: 12, color: "#333", marginTop: 1 }} numberOfLines={1}>
                      {safeString(trip.dropoff_location, "Dropoff")}
                    </Text>
                  </View>
                </View>

                {/* Trip Footer */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: paymentIcon.bg,
                        justifyContent: "center",
                        alignItems: "center",
                        marginRight: 6,
                      }}
                    >
                      <Ionicons name={paymentIcon.name} size={10} color={paymentIcon.color} />
                    </View>
                    <Text style={{ fontSize: 12, color: "#666" }}>
                      {trip.commuter_name}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "bold",
                      color: "#10B981",
                    }}
                  >
                    ₱{safeNumber(trip.fare, 2)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}