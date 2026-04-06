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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { LineChart } from "react-native-chart-kit";
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

  const [pointsData, setPointsData] = useState({
    total_points: 0,
    points_from_rides: 0,
    points_from_referrals: 0,
    points_from_bonuses: 0,
    points_value: 0,
  });

  const [earningsData, setEarningsData] = useState({
    cash_earnings: 0,
    gcash_earnings: 0,
    total_earnings: 0,
    today_earnings: 0,
  });

  const [recentTransactions, setRecentTransactions] = useState([]);
  const [weeklyPoints, setWeeklyPoints] = useState([0, 0, 0, 0, 0, 0, 0]);
  const [monthlyPoints, setMonthlyPoints] = useState(0);
  const [totalTrips, setTotalTrips] = useState(0);

  const POINTS_CONVERSION_RATE = 0.1;

  useFocusEffect(
    useCallback(() => {
      const getDriverId = async () => {
        try {
          const session = await getUserSession();

          if (session && session.isTestAccount && session.userType === "driver") {
            setIsTestAccount(true);
            setDriverId(session.phone);
            setDriverName("Test Driver");

            setPointsData({
              total_points: 5000,
              points_from_rides: 3500,
              points_from_referrals: 1000,
              points_from_bonuses: 500,
              points_value: 500,
            });

            setEarningsData({
              cash_earnings: 1250,
              gcash_earnings: 0,
              total_earnings: 1250,
              today_earnings: 180,
            });

            setWeeklyPoints([100, 200, 150, 300, 250, 400, 350]);
            setMonthlyPoints(1750);
            setTotalTrips(24);
            setRecentTransactions([
              {
                id: "demo-1",
                type: "earning",
                amount: 120,
                description: "Ride completed: Ipil → Poblacion",
                date: new Date().toISOString(),
                paymentMethod: "cash",
                isPoints: false,
              },
              {
                id: "demo-2",
                type: "points_earned",
                amount: 40,
                description: "Rewards earned from completed trips",
                date: new Date(Date.now() - 86400000).toISOString(),
                isPoints: true,
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
          console.log("Error getting driver ID:", error);
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
        fetchWalletAndEarnings(uid),
        fetchPointsHistory(uid),
        fetchWeeklyPoints(uid),
        fetchStatistics(uid),
        fetchTransactions(uid),
      ]);
    } catch (err) {
      console.log("Error loading data:", err.message);
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
      console.log("Error fetching driver name:", err.message);
    }
  };

  const fetchWalletAndEarnings = async (uid) => {
    try {
      const { data, error } = await supabase
        .from("driver_wallets")
        .select("points, cash_earnings, gcash_earnings")
        .eq("driver_id", uid)
        .maybeSingle();

      if (error) throw error;

      const points = Number(data?.points) || 0;
      const cashEarnings = Number(data?.cash_earnings) || 0;
      const gcashEarnings = Number(data?.gcash_earnings) || 0;

      setPointsData((prev) => ({
        ...prev,
        total_points: points,
        points_value: points * POINTS_CONVERSION_RATE,
      }));

      setEarningsData((prev) => ({
        ...prev,
        cash_earnings: cashEarnings,
        gcash_earnings: gcashEarnings,
        total_earnings: cashEarnings + gcashEarnings,
      }));
    } catch (err) {
      console.log("Error fetching wallet/earnings:", err.message);
    }
  };

  const fetchPointsHistory = async (uid) => {
    try {
      const { data, error } = await supabase
        .from("driver_points_history")
        .select("points, source, type, created_at")
        .eq("driver_id", uid)
        .eq("type", "earned")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const pointsFromRides =
        data?.filter((p) => p.source === "trip").reduce((sum, p) => sum + (Number(p.points) || 0), 0) || 0;

      const pointsFromReferrals =
        data?.filter((p) => p.source === "referral").reduce((sum, p) => sum + (Number(p.points) || 0), 0) || 0;

      const pointsFromBonuses =
        data?.filter((p) => p.source === "mission").reduce((sum, p) => sum + (Number(p.points) || 0), 0) || 0;

      setPointsData((prev) => ({
        ...prev,
        points_from_rides: pointsFromRides,
        points_from_referrals: pointsFromReferrals,
        points_from_bonuses: pointsFromBonuses,
      }));
    } catch (err) {
      console.log("Error fetching points history:", err.message);
    }
  };

  const fetchWeeklyPoints = async (uid) => {
    try {
      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay() + 1);
      startOfWeek.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("driver_points_history")
        .select("points, created_at")
        .eq("driver_id", uid)
        .eq("type", "earned")
        .gte("created_at", startOfWeek.toISOString())
        .order("created_at", { ascending: true });

      if (error) throw error;

      const dailyPoints = [0, 0, 0, 0, 0, 0, 0];

      data?.forEach((record) => {
        if (record.created_at) {
          const date = new Date(record.created_at);
          let dayIndex = date.getDay();
          dayIndex = dayIndex === 0 ? 6 : dayIndex - 1;
          dailyPoints[dayIndex] += Number(record.points) || 0;
        }
      });

      setWeeklyPoints(dailyPoints);
    } catch (err) {
      console.log("Error fetching weekly points:", err.message);
    }
  };

  const fetchStatistics = async (uid) => {
    try {
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

      const { data: monthlyData, error: monthlyError } = await supabase
        .from("driver_points_history")
        .select("points")
        .eq("driver_id", uid)
        .eq("type", "earned")
        .gte("created_at", startOfMonth.toISOString());

      if (monthlyError) throw monthlyError;

      const monthlyTotal =
        monthlyData?.reduce((sum, p) => sum + (Number(p.points) || 0), 0) || 0;
      setMonthlyPoints(monthlyTotal);

      const { data: tripsData, error: tripsError } = await supabase
        .from("bookings")
        .select("id, actual_fare, created_at")
        .eq("driver_id", uid)
        .eq("status", "completed");

      if (tripsError) throw tripsError;

      setTotalTrips(tripsData?.length || 0);

      const todayEarnings =
        tripsData?.filter((trip) => {
          const tripDate = new Date(trip.created_at);
          return tripDate >= startOfToday;
        }).reduce((sum, trip) => sum + (Number(trip.actual_fare) || 0), 0) || 0;

      setEarningsData((prev) => ({
        ...prev,
        today_earnings: todayEarnings,
      }));
    } catch (err) {
      console.log("Error fetching statistics:", err.message);
    }
  };

  const fetchTransactions = async (uid) => {
    try {
      const { data: bookings, error: bookingsError } = await supabase
        .from("bookings")
        .select(`
          id,
          fare,
          created_at,
          pickup_location,
          dropoff_location,
          payment_type
        `)
        .eq("driver_id", uid)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(20);

      if (bookingsError) throw bookingsError;

      const bookingTransactions = (bookings || []).map((b) => ({
        id: `booking-${b.id}`,
        type: "earning",
        amount: Number(b.fare) || 0,
        description: `${safeString((b.pickup_location || "Pickup").split(",")[0])} → ${safeString((b.dropoff_location || "Dropoff").split(",")[0])}`,
        date: b.created_at,
        paymentMethod: b.payment_type || "cash",
        isPoints: false,
      }));

      const { data: pointsHistory, error: pointsError } = await supabase
        .from("driver_points_history")
        .select("*")
        .eq("driver_id", uid)
        .eq("type", "earned")
        .order("created_at", { ascending: false })
        .limit(20);

      if (pointsError) throw pointsError;

      const pointsTransactions = (pointsHistory || []).map((p) => ({
        id: `points-${p.id}`,
        type: "points_earned",
        amount: Number(p.points) || 0,
        description: safeString(
          p.description ||
          `${
            p.source === "trip"
              ? "Rewards earned from trips"
              : p.source === "referral"
              ? "Referral reward"
              : "Bonus reward"
          }`,
          "Points earned"
        ),
        date: p.created_at,
        isPoints: true,
      }));

      const allTransactions = [...bookingTransactions, ...pointsTransactions].sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      );

      setRecentTransactions(allTransactions);
    } catch (err) {
      console.log("Error fetching transactions:", err.message);
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

  const getTransactionIcon = (type, paymentMethod, isPoints) => {
    if (isPoints || type === "points_earned") {
      return { name: "star", color: "#F59E0B", bg: "#FEF3C7" };
    }

    switch (paymentMethod) {
      case "gcash":
        return { name: "phone-portrait", color: "#00579F", bg: "#E6F0FF" };
      case "cash":
        return { name: "cash", color: "#10B981", bg: "#D1FAE5" };
      default:
        return { name: "receipt", color: "#6B7280", bg: "#F3F4F6" };
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
        <Text style={{ marginTop: 10, color: "#666" }}>Loading earnings...</Text>
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
          Earnings & Rewards
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
          Track your completed trip earnings and reward points
        </Text>
      </View>

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
            <Text style={{ fontSize: 12, color: "#666" }}>Total Earnings</Text>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#10B981" }}>
              ₱{safeNumber(earningsData.total_earnings)}
            </Text>
          </View>

          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: "#666" }}>Reward Points</Text>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#F59E0B" }}>
              {safeNumber(pointsData.total_points)}
            </Text>
          </View>
        </View>
      </View>

      <View
        style={{
          marginHorizontal: 20,
          marginTop: 15,
          backgroundColor: "#FFF",
          borderRadius: 24,
          padding: 20,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ fontSize: 14, color: "#666" }}>Available Rewards</Text>
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
              <Ionicons name="star" size={26} color="#F59E0B" />
              <Text
                style={{
                  fontSize: 32,
                  fontWeight: "bold",
                  color: "#183B5C",
                  marginLeft: 6,
                }}
              >
                {safeNumber(pointsData.total_points)}
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2, flexWrap: "wrap" }}>
              Rewards earned from completed trips and bonuses
            </Text>
          </View>

          <View
            style={{
              backgroundColor: "#FEF3C7",
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 20,
              alignSelf: "flex-start",
            }}
          >
            <Text style={{ fontSize: 12, color: "#F59E0B", fontWeight: "600" }}>
              Rewards Only
            </Text>
          </View>
        </View>

        <View
          style={{
            marginTop: 16,
            backgroundColor: "#F9FAFB",
            borderRadius: 14,
            padding: 12,
          }}
        >
          <Text style={{ fontSize: 12, color: "#4B5563", lineHeight: 18 }}>
            • Reward points are for promotions, loyalty, and driver incentives{"\n"}
            • Points are shown for tracking purposes inside the app{"\n"}
            • Earnings are displayed to help drivers monitor trip performance
          </Text>
        </View>
      </View>

      <View
        style={{
          marginHorizontal: 20,
          marginTop: 20,
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
          Weekly Reward Points
        </Text>

        {weeklyPoints && weeklyPoints.some((day) => day > 0) ? (
          <LineChart
            data={{
              labels: ["M", "T", "W", "T", "F", "S", "S"],
              datasets: [{ data: weeklyPoints }],
            }}
            width={screenWidth}
            height={160}
            yAxisLabel=""
            chartConfig={{
              backgroundColor: "#FFF",
              backgroundGradientFrom: "#FFF",
              backgroundGradientTo: "#FFF",
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(245, 158, 11, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
              style: { borderRadius: 16 },
              propsForDots: {
                r: "4",
                strokeWidth: "2",
                stroke: "#F59E0B",
              },
            }}
            bezier
            style={{ borderRadius: 16, marginLeft: -20 }}
          />
        ) : (
          <View style={{ height: 160, justifyContent: "center", alignItems: "center" }}>
            <Ionicons name="bar-chart-outline" size={40} color="#D1D5DB" />
            <Text style={{ color: "#9CA3AF", marginTop: 8 }}>No rewards earned this week</Text>
          </View>
        )}
      </View>

      <View
        style={{
          marginHorizontal: 20,
          marginTop: 20,
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
          Rewards Breakdown
        </Text>

        <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
          <View style={{ alignItems: "center" }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: "#FEF3C7",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="car" size={24} color="#F59E0B" />
            </View>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#F59E0B", marginTop: 8 }}>
              {safeNumber(pointsData.points_from_rides)}
            </Text>
            <Text style={{ fontSize: 12, color: "#666" }}>From Trips</Text>
          </View>

          <View style={{ alignItems: "center" }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: "#E6F0FF",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="people" size={24} color="#00579F" />
            </View>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#00579F", marginTop: 8 }}>
              {safeNumber(pointsData.points_from_referrals)}
            </Text>
            <Text style={{ fontSize: 12, color: "#666" }}>Referrals</Text>
          </View>

          <View style={{ alignItems: "center" }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: "#D1FAE5",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="trophy" size={24} color="#10B981" />
            </View>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#10B981", marginTop: 8 }}>
              {safeNumber(pointsData.points_from_bonuses)}
            </Text>
            <Text style={{ fontSize: 12, color: "#666" }}>Bonuses</Text>
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
            • Rewards are earned from completed trips, referrals, and bonuses{"\n"}
            • Earnings shown here are for driver performance tracking{"\n"}
            • Additional reward redemption options can be added later
          </Text>
        </View>
      </View>

      <View
        style={{
          marginHorizontal: 20,
          marginTop: 20,
          marginBottom: 20,
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
          Recent Activity
        </Text>

        {!recentTransactions || recentTransactions.length === 0 ? (
          <View style={{ padding: 30, alignItems: "center" }}>
            <Ionicons name="receipt-outline" size={40} color="#D1D5DB" />
            <Text style={{ marginTop: 10, color: "#9CA3AF" }}>No activity yet</Text>
          </View>
        ) : (
          recentTransactions.slice(0, 5).map((transaction, index) => {
            const icon = getTransactionIcon(
              transaction.type,
              transaction.paymentMethod,
              transaction.isPoints
            );

            const displayDescription = safeString(transaction.description, "Transaction");
            const displayDate = formatDate(transaction.date);
            const displayAmount = transaction.isPoints
              ? `+${safeNumber(transaction.amount)} pts`
              : `₱${safeNumber(transaction.amount, 2)}`;

            return (
              <View
                key={transaction.id || index}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 12,
                  borderBottomWidth: index === recentTransactions.slice(0, 5).length - 1 ? 0 : 1,
                  borderBottomColor: "#F3F4F6",
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: icon.bg,
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: 12,
                  }}
                >
                  <Ionicons name={icon.name} size={20} color={icon.color} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "500",
                      color: "#333",
                    }}
                    numberOfLines={1}
                  >
                    {displayDescription}
                  </Text>
                  <Text style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
                    {displayDate}
                  </Text>
                </View>

                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "bold",
                    color: transaction.isPoints ? "#F59E0B" : "#10B981",
                  }}
                >
                  {displayAmount}
                </Text>
              </View>
            );
          })
        )}
      </View>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}