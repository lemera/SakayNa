import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  FlatList,
  Pressable,
  Dimensions,
  Animated,
  Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "../styles/Driver/DriverHomeScreenStyles";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { LineChart } from "react-native-chart-kit";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function DriverHomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState("earnings");
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(false);

  // * ================= NEW STATE FOR REAL DATA ================= */
  const [walletData, setWalletData] = useState({
    balance: 0,
    total_deposits: 0,
    total_withdrawals: 0,
  });
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [recentTrips, setRecentTrips] = useState([]);
  const [weeklyData, setWeeklyData] = useState({
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    earnings: [0, 0, 0, 0, 0, 0, 0],
    trips: [0, 0, 0, 0, 0, 0, 0],
  });
  const [activeSubscription, setActiveSubscription] = useState(null);
  const [missionProgress, setMissionProgress] = useState(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  // * ================= FETCH DRIVER ================= */
  useFocusEffect(
    useCallback(() => {
      const getDriver = async () => {
        try {
          setLoading(true);

          const storedUserId = await AsyncStorage.getItem("user_id");
          if (!storedUserId) return;

          // Fetch driver data
          const { data, error } = await supabase
            .from("drivers")
            .select(
              `
              id, 
              first_name, 
              middle_name, 
              last_name, 
              status, 
              is_active,
              email,
              phone,
              profile_picture
            `,
            )
            .eq("id", storedUserId)
            .single();

          if (error) {
            console.log(error.message);
            return;
          }

          setDriver(data);
          setIsOnline(data?.is_active ?? false);

          // Fetch all related data after getting driver
          if (data) {
            await Promise.all([
              fetchWalletData(data.id),
              fetchTodayEarnings(data.id),
              fetchRecentTrips(data.id),
              fetchWeeklyData(data.id),
              fetchActiveSubscription(data.id),
              fetchMissionProgress(data.id),
              fetchUnreadNotifications(storedUserId),
            ]);
          }
        } catch (err) {
          console.log(err.message);
        } finally {
          setLoading(false);
        }
      };

      getDriver();
    }, []),
  );

  // * ================= FETCH WALLET DATA ================= */
  const fetchWalletData = async (driverId) => {
    try {
      const { data, error } = await supabase
        .from("driver_wallets")
        .select("balance, total_deposits, total_withdrawals")
        .eq("driver_id", driverId)
        .single();

      if (error) {
        console.log("Wallet error:", error.message);
        return;
      }

      if (data) {
        setWalletData(data);
      }
    } catch (err) {
      console.log("Fetch wallet error:", err.message);
    }
  };

  // * ================= FETCH TODAY'S EARNINGS ================= */
  const fetchTodayEarnings = async (driverId) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const { data, error } = await supabase
        .from("bookings")
        .select("actual_fare")
        .eq("driver_id", driverId)
        .eq("status", "completed")
        .gte("ride_completed_at", today.toISOString())
        .lt("ride_completed_at", tomorrow.toISOString());

      if (error) {
        console.log("Today earnings error:", error.message);
        return;
      }

      const total =
        data?.reduce((sum, booking) => sum + (booking.actual_fare || 0), 0) ||
        0;
      setTodayEarnings(total);
    } catch (err) {
      console.log("Fetch today earnings error:", err.message);
    }
  };

  // * ================= FETCH RECENT TRIPS ================= */
  const fetchRecentTrips = async (driverId) => {
    try {
      console.log("🔍 Fetching trips for driver:", driverId);

      const { data, error } = await supabase
        .from("bookings")
        .select(
          `
        id,
        pickup_location,
        dropoff_location,
        actual_fare,
        distance_km,
        ride_completed_at,
        status
      `,
        )
        .eq("driver_id", driverId)
        .eq("status", "completed")
        .order("ride_completed_at", { ascending: false })
        .limit(5);

      if (error) {
        console.log("❌ Recent trips error:", error.message);
        return;
      }

      console.log("✅ Raw trips data:", data);
      console.log("📊 Number of trips found:", data?.length);

      // Check each trip's data
      data?.forEach((trip, index) => {
        console.log(`Trip ${index + 1}:`, {
          id: trip.id,
          pickup: trip.pickup_location,
          dropoff: trip.dropoff_location,
          fare: trip.actual_fare,
          distance: trip.distance_km,
          date: trip.ride_completed_at,
        });
      });

      const formattedTrips =
        data?.map((trip) => ({
          id: trip.id,
          from: trip.pickup_location?.split(",")[0] || "Pickup",
          to: trip.dropoff_location?.split(",")[0] || "Dropoff",
          distance: trip.distance_km ? `${trip.distance_km} km` : "? km",
          earnings: `₱${trip.actual_fare?.toFixed(2) || "0.00"}`,
          time: trip.ride_completed_at
            ? new Date(trip.ride_completed_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "Unknown",
        })) || [];

      console.log("✅ Formatted trips:", formattedTrips);
      console.log("📊 Formatted trips count:", formattedTrips.length);

      setRecentTrips(formattedTrips);
    } catch (err) {
      console.log("❌ Fetch recent trips error:", err.message);
    }
  };

  // * ================= FETCH WEEKLY DATA ================= */
  const fetchWeeklyData = async (driverId) => {
    try {
      console.log("🔍 Fetching weekly data for driver:", driverId);

      const today = new Date();
      const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.

      // Get start of week (Monday)
      const startOfWeek = new Date(today);
      startOfWeek.setDate(
        today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1),
      );
      startOfWeek.setHours(0, 0, 0, 0);
      console.log("📅 Start of week:", startOfWeek.toISOString());

      // Get end of week (Sunday)
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);
      console.log("📅 End of week:", endOfWeek.toISOString());

      const { data, error } = await supabase
        .from("bookings")
        .select("actual_fare, ride_completed_at")
        .eq("driver_id", driverId)
        .eq("status", "completed")
        .gte("ride_completed_at", startOfWeek.toISOString())
        .lt("ride_completed_at", endOfWeek.toISOString())
        .order("ride_completed_at", { ascending: true });

      if (error) {
        console.log("❌ Weekly data error:", error.message);
        return;
      }

      console.log("✅ Raw weekly data:", data);
      console.log("📊 Number of weekly bookings:", data?.length);

      // Initialize weekly arrays
      const earnings = [0, 0, 0, 0, 0, 0, 0];
      const trips = [0, 0, 0, 0, 0, 0, 0];

      data?.forEach((booking) => {
        if (booking.ride_completed_at) {
          const date = new Date(booking.ride_completed_at);
          let dayIndex = date.getDay(); // 0-6, Sunday = 0

          // Convert to Monday = 0, Sunday = 6
          dayIndex = dayIndex === 0 ? 6 : dayIndex - 1;

          console.log(`📆 Booking on day ${dayIndex}:`, {
            date: date.toISOString(),
            fare: booking.actual_fare,
            dayName: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][
              dayIndex
            ],
          });

          earnings[dayIndex] += booking.actual_fare || 0;
          trips[dayIndex] += 1;
        }
      });

      console.log("📊 Calculated earnings:", earnings);
      console.log("📊 Calculated trips:", trips);

      setWeeklyData({
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        earnings: earnings,
        trips: trips,
      });

      console.log("✅ Weekly data updated:", { earnings, trips });
    } catch (err) {
      console.log("❌ Fetch weekly data error:", err.message);
    }
  };

  // * ================= FETCH ACTIVE SUBSCRIPTION ================= */
  const fetchActiveSubscription = async (driverId) => {
    try {
      const { data, error } = await supabase
        .from("driver_subscriptions")
        .select(
          `
          id,
          plan_id,
          start_date,
          end_date,
          status,
          subscription_plans (
            plan_name,
            plan_type,
            price
          )
        `,
        )
        .eq("driver_id", driverId)
        .eq("status", "active")
        .gte("end_date", new Date().toISOString())
        .order("end_date", { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 = no rows returned
        console.log("Subscription error:", error.message);
        return;
      }

      if (data) {
        setActiveSubscription(data);
      }
    } catch (err) {
      console.log("Fetch subscription error:", err.message);
    }
  };

  // * ================= FETCH MISSION PROGRESS ================= */
  const fetchMissionProgress = async (driverId) => {
    try {
      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay() + 1); // Monday
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from("ride_missions")
        .select("*")
        .eq("driver_id", driverId)
        .gte("week_start", startOfWeek.toISOString().split("T")[0])
        .lte("week_end", endOfWeek.toISOString().split("T")[0])
        .single();

      if (error && error.code !== "PGRST116") {
        console.log("Mission error:", error.message);
        return;
      }

      if (data) {
        setMissionProgress(data);
      }
    } catch (err) {
      console.log("Fetch mission error:", err.message);
    }
  };

 // Add this state with your other states
const [driverRank, setDriverRank] = useState({
  currentRank: 1,
  level: "Bronze",
  points: 0,
});

// Add this function to fetch rank (using driver.id instead of driverId)
const fetchDriverRank = async () => {
  try {
    if (!driver?.id) return; // Use driver.id from existing state
    
    // Get all drivers with completed trips count
    const { data: drivers, error } = await supabase
      .from("drivers")
      .select(`
        id,
        first_name,
        last_name
      `)
      .eq("status", "approved");

    if (error) throw error;

    // Get trip counts for each driver
    const driverStats = await Promise.all(
      drivers.map(async (d) => {
        const { count, error: countError } = await supabase
          .from("bookings")
          .select("*", { count: "exact", head: true })
          .eq("driver_id", d.id)
          .eq("status", "completed");

        if (countError) throw countError;

        return {
          ...d,
          trips: count || 0,
          points: (count || 0) * 10, // 10 points per trip
        };
      })
    );

    // Sort by points
    const sortedDrivers = driverStats.sort((a, b) => b.points - a.points);
    
    // Find current driver's rank using driver.id
    const currentDriverIndex = sortedDrivers.findIndex(d => d.id === driver.id);
    const currentRank = currentDriverIndex + 1;
    const currentDriverPoints = sortedDrivers[currentDriverIndex]?.points || 0;

    // Determine level
    let level = "Bronze";
    if (currentDriverPoints >= 2000) level = "Diamond";
    else if (currentDriverPoints >= 1000) level = "Gold";
    else if (currentDriverPoints >= 500) level = "Silver";

    setDriverRank({
      currentRank,
      level,
      points: currentDriverPoints,
    });

  } catch (err) {
    console.log("Error fetching rank:", err.message);
  }
};

// Call it after driver is loaded
useEffect(() => {
  if (driver?.id) {
    fetchDriverRank();
  }
}, [driver?.id]); // Depend on driver.id

  /* ================= ANIMATED TOGGLE ================= */
  const toggleAnim = useRef(new Animated.Value(0)).current;

  // Baliktarin ang outputRange
  const translateY = toggleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [30, 0], // <- Pinalitan: 0 = online (top), 30 = offline (bottom)
  });

  useEffect(() => {
    Animated.timing(toggleAnim, {
      toValue: isOnline ? 1 : 0, // 1 = online, 0 = offline
      duration: 250,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [isOnline]);

  /* ================= TOGGLE ONLINE ================= */
  const toggleAvailability = async () => {
    if (!driver || driver.status !== "approved") return;

    // Check if driver has active subscription
    if (!activeSubscription) {
      alert(
        "You need an active subscription to go online. Please subscribe first.",
      );
      navigation.navigate("SubscriptionScreen");
      return;
    }

    try {
      // I-set muna ang UI bago mag-database update
      const newOnlineStatus = !isOnline;
      setIsOnline(newOnlineStatus); // <- I-set agad para mag-render agad ang UI

      const { error } = await supabase
        .from("drivers")
        .update({
          is_active: newOnlineStatus, // <- Gamitin ang new value
          updated_at: new Date(),
        })
        .eq("id", driver.id);

      if (error) {
        // If error, revert back
        setIsOnline(isOnline);
        console.log(error.message);
        return;
      }

      // Log the status change
      await supabase.from("audit_logs").insert([
        {
          user_id: driver.id,
          user_type: "driver",
          action: "UPDATE",
          table_name: "drivers",
          record_id: driver.id,
          metadata: {
            field: "is_active",
            old_value: isOnline,
            new_value: newOnlineStatus,
          },
        },
      ]);
    } catch (err) {
      // If error, revert back
      setIsOnline(isOnline);
      console.log(err.message);
    }
  };

const renderTrip = ({ item }) => (
  <Pressable
    style={({ pressed }) => ({
      backgroundColor: pressed ? "#F3F4F6" : "#F9FAFB",
      borderRadius: 16,
      padding: 15,
      marginBottom: 10,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: "#E5E7EB",
    })}
    onPress={() =>
      navigation.navigate("TripDetailsScreen", { tripId: item.id })
    }
  >
    <View style={{
      width: 45,
      height: 45,
      borderRadius: 12,
      backgroundColor: "#183B5C",
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    }}>
      <Ionicons name="bicycle" size={24} color="#FFB37A" />
    </View>

    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
        <Ionicons name="location" size={12} color="#10B981" />
        <Text style={{ fontSize: 13, color: "#333", marginLeft: 2, flex: 1 }} numberOfLines={1}>
          {item.from}
        </Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Ionicons name="flag" size={12} color="#EF4444" />
        <Text style={{ fontSize: 13, color: "#333", marginLeft: 2, flex: 1 }} numberOfLines={1}>
          {item.to}
        </Text>
      </View>
    </View>

    <View style={{ alignItems: "flex-end" }}>
      <Text style={{ fontSize: 16, fontWeight: "bold", color: "#183B5C" }}>
        {item.earnings}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
        <Ionicons name="time-outline" size={10} color="#9CA3AF" />
        <Text style={{ fontSize: 10, color: "#9CA3AF", marginLeft: 2 }}>
          {item.distance} • {item.time}
        </Text>
      </View>
    </View>
  </Pressable>
);

  const screenWidth = Dimensions.get("window").width - 40;

  // Mission progress component
  const MissionProgress = () => {
    if (!missionProgress) return null;

    const progress =
      (missionProgress.actual_rides / missionProgress.target_rides) * 100;

    return (
      <View
        style={{
          marginHorizontal: 20,
          marginTop: 10,
          padding: 15,
          backgroundColor: "#F0F9FF",
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "#B2D9FF",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={{ fontWeight: "bold", fontSize: 16 }}>
            🎯 Weekly Mission
          </Text>
          <Text style={{ color: "#183B5C", fontWeight: "bold" }}>
            {missionProgress.actual_rides}/{missionProgress.target_rides} rides
          </Text>
        </View>

        <View
          style={{
            height: 8,
            backgroundColor: "#E5E7EB",
            borderRadius: 4,
            marginTop: 10,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              width: `${progress}%`,
              height: "100%",
              backgroundColor: progress >= 100 ? "#10B981" : "#3B82F6",
            }}
          />
        </View>

        {progress >= 100 ? (
          <Text style={{ marginTop: 8, color: "#10B981", fontWeight: "600" }}>
            🎉 Congrats! You've hit the target! ₱{missionProgress.bonus_amount}{" "}
            bonus coming soon!
          </Text>
        ) : (
          <Text style={{ marginTop: 8, color: "#6B7280" }}>
            {missionProgress.target_rides - missionProgress.actual_rides} more
            rides to earn ₱{missionProgress.bonus_amount} bonus!
          </Text>
        )}
      </View>
    );
  };

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      showsVerticalScrollIndicator={false}
    >
      {/* HEADER  */}
      <LinearGradient
        colors={["#FFB37A", "#183B5C"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <View style={styles.headerTop}>
          <View style={styles.logoWrapper}>
            <Image
              source={require("../../assets/logo-sakayna.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          <View style={styles.headerContent}>
            <View style={styles.onlineBadge}>
              <View
                style={[
                  styles.onlineDot,
                  {
                    backgroundColor:
                      driver?.status === "approved" ? "#00FF00" : "#FF0000",
                  },
                ]}
              />
              <Text style={[styles.onlineText, { color: "#FFF" }]}>
                {driver?.status === "approved"
                  ? "Online"
                  : driver?.status === "under_review"
                    ? "Under Review"
                    : driver?.status === "pending"
                      ? "Not Verified"
                      : driver?.status === "rejected"
                        ? "Rejected"
                        : driver?.status === "suspended"
                          ? "Suspended"
                          : "Inactive"}
              </Text>
            </View>

            <Text style={[styles.userName, { color: "#FFF" }]}>
              {loading
                ? "Loading..."
                : driver
                  ? `${driver.first_name} ${driver.middle_name ? driver.middle_name + " " : ""}${driver.last_name}`
                  : "Driver"}
            </Text>
          </View>

          {/* Ranking Icon - Clickable */}
{/* RANKING ICON - ENHANCED VERSION */}
{/* RANKING ICON - ENHANCED VERSION */}
<Pressable
  style={styles.rankingIconBadge}
  onPress={() => navigation.navigate("RankingPage")}
>
  <View
    style={{
      width: "100%",
      height: "100%",
      justifyContent: "center",
      alignItems: "center",
    }}
  >
    {/* Outer Ring - Changes color based on rank */}
    <View
      style={{
        position: "absolute",
        width: 50,
        height: 50,
        borderRadius: 25,
        borderWidth: 2,
        borderColor: 
          driverRank?.level === "Diamond" ? "#B9F2FF" :
          driverRank?.level === "Gold" ? "#FFD700" :
          driverRank?.level === "Silver" ? "#C0C0C0" :
          "#CD7F32",
        opacity: 0.5,
      }}
    />
    
    {/* Inner Icon with Level Badge */}
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "#FFF",
        justifyContent: "center",
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 5,
      }}
    >
      {/* FIXED: Correct icon names for Ionicons */}
      <Ionicons 
        name={
          driverRank?.level === "Diamond" ? "diamond" : // or "diamond-outline"
          driverRank?.level === "Gold" ? "trophy" : // or "trophy-outline"
          driverRank?.level === "Silver" ? "medal" : // or "medal-outline"
          "ribbon" // or "ribbon-outline"
        } 
        size={24} 
        color={
          driverRank?.level === "Diamond" ? "#B9F2FF" :
          driverRank?.level === "Gold" ? "#FFD700" :
          driverRank?.level === "Silver" ? "#C0C0C0" :
          "#CD7F32"
        } 
      />
    </View>

    {/* Rank Number Badge */}
    <View
      style={{
        position: "absolute",
        bottom: -2,
        right: -2,
        backgroundColor: "#183B5C",
        borderRadius: 10,
        width: 20,
        height: 20,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 2,
        borderColor: "#FFF",
      }}
    >
      <Text style={{ color: "#FFF", fontSize: 10, fontWeight: "bold" }}>
        #{driverRank?.currentRank || "?"}
      </Text>
    </View>
  </View>

  {/* Notification Badge */}
  {unreadNotifications > 0 && (
    <View
      style={{
        position: "absolute",
        top: -5,
        right: -5,
        backgroundColor: "#FF3B30",
        borderRadius: 12,
        minWidth: 22,
        height: 22,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 2,
        borderColor: "#FFF",
        paddingHorizontal: 4,
      }}
    >
      <Text style={{ color: "#FFF", fontSize: 11, fontWeight: "bold" }}>
        {unreadNotifications > 9 ? "9+" : unreadNotifications}
      </Text>
    </View>
  )}
</Pressable>
        </View>
      </LinearGradient>
      {/* DRIVER STATUS WARNING */}
      {!loading && driver && driver.status !== "approved" && (
        <View
          style={{
            marginHorizontal: 1,
            marginTop: 15,
            marginBottom: 10,
            padding: 10,
            borderRadius: 12,
            borderLeftWidth: 5,
            backgroundColor:
              driver.status === "rejected"
                ? "#FFD6D6"
                : driver.status === "suspended"
                  ? "#F8D7DA"
                  : "#FFF4CC",
            borderLeftColor:
              driver.status === "rejected"
                ? "#B00020"
                : driver.status === "suspended"
                  ? "#8B0000"
                  : "#FF8C00",
          }}
        >
          <Text style={{ fontWeight: "600", marginBottom: 5 }}>
            {driver.status === "pending" && "⏳ Teka, di ka pa verified!"}
            {driver.status === "under_review" && "🔍 Chini-check pa ni admin"}
            {driver.status === "rejected" && "❌ Ayun, bagsak docs mo"}
            {driver.status === "suspended" && "⛔ Temporaryong suspendido"}
          </Text>

          <Text style={{ marginBottom: 10 }}>
            {driver.status === "pending" &&
              "Kumpletuhin mo muna verification para makapag-booking na!"}

            {driver.status === "under_review" &&
              "Ini-examine pa documents mo. Balikan mo lang mamaya."}

            {driver.status === "rejected" &&
              "Hindi pumasa. Need mo mag-resubmit ulit."}

            {driver.status === "suspended" &&
              "May issue account mo. Kausapin mo support para maayos."}
          </Text>

          {(driver.status === "pending" || driver.status === "rejected") && (
            <Pressable
              onPress={() => navigation.navigate("DriverVerificationScreen")}
              style={{
                backgroundColor: "#183B5C",
                paddingVertical: 8,
                borderRadius: 8,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#FFF", fontWeight: "600" }}>
                {driver.status === "pending"
                  ? "✅ I-verify na!"
                  : "🔄 Mag-resubmit na"}
              </Text>
            </Pressable>
          )}
        </View>
      )}
{/* SUBSCRIPTION & MISSION SIDE BY SIDE */}
{activeSubscription && missionProgress && (
  <View
    style={{
      marginHorizontal: 1,
      marginTop: 15,
      flexDirection: "row",
      gap: 10, // Space between left and right
    }}
  >
    {/* LEFT SIDE - SUBSCRIPTION BANNER (40%) */}
    <Pressable
      onPress={() => navigation.navigate("SubscriptionScreen")}
      style={{
        flex: 0.6, // Takes 40% of width
        padding: 15,
        borderRadius: 12,
        backgroundColor: "#E6F7E6",
        borderWidth: 1,
        borderColor: "#A0D9A0",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
        justifyContent: "space-between",
      }}
    >
      {/* Icon */}
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: "#4CAF50",
          justifyContent: "center",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <Ionicons name="card" size={16} color="#FFF" />
      </View>

      {/* Plan Name */}
      <Text
        style={{
          fontWeight: "bold",
          color: "#2E7D32",
          fontSize: 14,
          marginBottom: 2,
        }}
        numberOfLines={1}
      >
        {activeSubscription.subscription_plans?.plan_name}
      </Text>

      {/* Expiry */}
      <Text style={{ fontSize: 10, color: "#4CAF50", marginBottom: 8 }}>
        Exp: {new Date(activeSubscription.end_date).toLocaleDateString()}
      </Text>

      {/* Manage Link */}
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text
          style={{
            color: "#183B5C",
            fontWeight: "600",
            fontSize: 10,
            marginRight: 2,
          }}
        >
          Manage
        </Text>
        <Ionicons name="arrow-forward" size={10} color="#183B5C" />
      </View>
    </Pressable>

    {/* RIGHT SIDE - MISSION PROGRESS (60%) */}
    <View
      style={{
        flex: 0.6, // Takes 60% of width
        padding: 12,
        borderRadius: 12,
        backgroundColor: "#F0F9FF",
        borderWidth: 1,
        borderColor: "#B2D9FF",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <Text style={{ fontWeight: "bold", fontSize: 12 }}>🎯 Mission</Text>
        <Text style={{ color: "#183B5C", fontWeight: "bold", fontSize: 11 }}>
          {missionProgress.actual_rides}/{missionProgress.target_rides}
        </Text>
      </View>

      {/* Progress Bar */}
      <View
        style={{
          height: 6,
          backgroundColor: "#E5E7EB",
          borderRadius: 3,
          overflow: "hidden",
          marginBottom: 6,
        }}
      >
        <View
          style={{
            width: `${(missionProgress.actual_rides / missionProgress.target_rides) * 100}%`,
            height: "100%",
            backgroundColor:
              missionProgress.actual_rides >= missionProgress.target_rides
                ? "#10B981"
                : "#3B82F6",
          }}
        />
      </View>

      {/* Bonus Text */}
      <Text style={{ fontSize: 9, color: "#6B7280" }} numberOfLines={2}>
        {missionProgress.actual_rides >= missionProgress.target_rides
          ? `🎉 ₱${missionProgress.bonus_amount} bonus!`
          : `${missionProgress.target_rides - missionProgress.actual_rides} more rides = ₱${missionProgress.bonus_amount}`}
      </Text>
    </View>
  </View>
)}

{/* If only subscription exists */}
{activeSubscription && !missionProgress && (
  <Pressable
    onPress={() => navigation.navigate("SubscriptionScreen")}
    style={{
      marginHorizontal: 20,
      marginTop: 15,
      padding: 15,
      borderRadius: 12,
      backgroundColor: "#E6F7E6",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderWidth: 1,
      borderColor: "#A0D9A0",
    }}
  >
    <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: "#4CAF50",
          justifyContent: "center",
          alignItems: "center",
          marginRight: 12,
        }}
      >
        <Ionicons name="card" size={20} color="#FFF" />
      </View>
      <View>
        <Text style={{ fontWeight: "bold", color: "#2E7D32", fontSize: 16 }}>
          {activeSubscription.subscription_plans?.plan_name}
        </Text>
        <Text style={{ fontSize: 12, color: "#4CAF50" }}>
          Expires: {new Date(activeSubscription.end_date).toLocaleDateString()}
        </Text>
      </View>
    </View>
    <View
      style={{
        backgroundColor: "#183B5C",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <Text style={{ color: "#FFF", fontWeight: "600", fontSize: 12, marginRight: 4 }}>
        Manage
      </Text>
      <Ionicons name="arrow-forward" size={12} color="#FFF" />
    </View>
  </Pressable>
)}

{/* If only mission exists */}
{!activeSubscription && missionProgress && (
  <View style={{ marginHorizontal: 20, marginTop: 15 }}>
    <MissionProgress />
  </View>
)}




      {/* BALANCE CARD */}
      <View
        style={[styles.balanceCard, { position: "relative", marginTop: 10 }]}
      >
        <View style={styles.balanceRow}>
          <Pressable
      onPress={() => navigation.navigate("DriverWalletScreen")}
      style={{ flex: 1 }}
    >
      <Text style={styles.balanceLabel}>Wallet Balance</Text>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={styles.balanceValue}>
          ₱{walletData.balance.toFixed(2)}
        </Text>
        <Ionicons 
          name="chevron-forward" 
          size={16} 
          color="#183B5C" 
          style={{ marginLeft: 4 }}
        />
      </View>
      <Text style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}>
        Lifetime: ₱{walletData.total_deposits.toFixed(2)}
      </Text>
    </Pressable>

          {/* <View style={styles.verticalDivider} /> */}

          <View>
            <Text style={styles.balanceLabel}>Today's Earnings</Text>
            <Text style={styles.balanceValue}>₱{todayEarnings.toFixed(2)}</Text>
          </View>
        </View>

        {/* CENTER VERTICAL TOGGLE */}
        <View
          style={{
            position: "absolute",
            alignSelf: "center",
            top: 5,
            alignItems: "center",
          }}
        >
          <Pressable
            onPress={toggleAvailability}
            disabled={driver?.status !== "approved"}
            style={{
              width: 30,
              height: 60,
              borderRadius: 40,
              padding: 5,
              justifyContent: "flex-start",
              backgroundColor:
                driver?.status !== "approved"
                  ? "#D0D5DD"
                  : isOnline
                    ? "#12B76A" // Green kapag online (nasa itaas)
                    : "#F2F4F7", // Gray kapag offline (nasa ibaba)
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 6,
              elevation: 6,
            }}
          >
            <Animated.View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: "#FFF",
                transform: [{ translateY }],
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
                elevation: 4,
              }}
            />
          </Pressable>

          {/* STATUS TEXT */}
          <Text
            style={{
              marginTop: 5,
              fontWeight: "700",
              fontSize: 10,
              color:
                driver?.status !== "approved"
                  ? "#999"
                  : isOnline
                    ? "#12B76A"
                    : "#555",
            }}
          >
            {driver?.status !== "approved"
              ? "🚫 DI PA APPROVED"
              : isOnline
                ? "✅ ONLINE NA"
                : "😴 TULOG PA"}
          </Text>

          {/* BOOKING STATUS TEXT */}
          <Text
            style={{
              marginTop: 6,
              fontSize: 11,
              textAlign: "center",
              fontWeight: "500",
              color:
                driver?.status !== "approved"
                  ? "#98A2B3"
                  : isOnline
                    ? "#12B76A"
                    : "#667085",
            }}
          >
            {driver?.status !== "approved"
              ? "Wait lang, approve muna"
              : isOnline
                ? "Bukas na booking, pre!"
                : "Sarado muna, walang booking"}
          </Text>
        </View>
      </View>

      {/* EARNINGS / TRIPS SECTION */}
{/* EARNINGS / TRIPS SECTION */}
<View style={[styles.earningsCard, { 
  marginHorizontal: 1, 
  marginTop: 5,
  backgroundColor: "#FFF",
  borderRadius: 24,
  padding: 20,
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.1,
  shadowRadius: 12,
  elevation: 5,
}]}>
  
  {/* Header with icon */}
  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}>
    <View style={{
      backgroundColor: "#183B5C",
      width: 40,
      height: 40,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    }}>
      <Ionicons name="stats-chart" size={22} color="#FFB37A" />
    </View>
    <View>
      <Text style={{ fontSize: 18, fontWeight: "bold", color: "#333" }}>
        Performance
      </Text>
      <Text style={{ fontSize: 12, color: "#666" }}>
        Your earnings and trips this week
      </Text>
    </View>
  </View>

  {/* Quick Stats Cards */}
  <View style={{ 
    flexDirection: "row", 
    justifyContent: "space-between",
    marginBottom: 20,
  }}>
    <View style={{
      flex: 1,
      backgroundColor: "#F0F9FF",
      padding: 12,
      borderRadius: 16,
      marginRight: 8,
      borderWidth: 1,
      borderColor: "#B2D9FF",
    }}>
      <Text style={{ fontSize: 12, color: "#3B82F6", marginBottom: 4 }}>Week Total</Text>
      <Text style={{ fontSize: 20, fontWeight: "bold", color: "#183B5C" }}>
        ₱{weeklyData.earnings.reduce((a, b) => a + b, 0).toFixed(0)}
      </Text>
      <Text style={{ fontSize: 10, color: "#666" }}>earnings</Text>
    </View>

    <View style={{
      flex: 1,
      backgroundColor: "#FEF9E7",
      padding: 12,
      borderRadius: 16,
      marginLeft: 8,
      borderWidth: 1,
      borderColor: "#FFE5A3",
    }}>
      <Text style={{ fontSize: 12, color: "#F59E0B", marginBottom: 4 }}>Today</Text>
      <Text style={{ fontSize: 20, fontWeight: "bold", color: "#183B5C" }}>
        ₱{todayEarnings.toFixed(0)}
      </Text>
      <Text style={{ fontSize: 10, color: "#666" }}>earnings</Text>
    </View>
  </View>

  {/* Tabs - Redesigned */}
  <View style={{ 
    flexDirection: "row", 
    backgroundColor: "#F3F4F6",
    padding: 4,
    borderRadius: 12,
    marginBottom: 20,
  }}>
    <Pressable
      style={[
        {
          flex: 1,
          paddingVertical: 10,
          paddingHorizontal: 16,
          borderRadius: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
        },
        activeTab === "earnings" && {
          backgroundColor: "#FFF",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
          elevation: 2,
        },
      ]}
      onPress={() => setActiveTab("earnings")}
    >
      <Ionicons 
        name="cash-outline" 
        size={18} 
        color={activeTab === "earnings" ? "#183B5C" : "#9CA3AF"} 
        style={{ marginRight: 6 }}
      />
      <Text
        style={[
          { fontSize: 14, fontWeight: "600" },
          activeTab === "earnings" ? { color: "#183B5C" } : { color: "#9CA3AF" },
        ]}
      >
        Earnings
      </Text>
    </Pressable>

    <Pressable
      style={[
        {
          flex: 1,
          paddingVertical: 10,
          paddingHorizontal: 16,
          borderRadius: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
        },
        activeTab === "trips" && {
          backgroundColor: "#FFF",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
          elevation: 2,
        },
      ]}
      onPress={() => setActiveTab("trips")}
    >
      <Ionicons 
        name="bicycle-outline" 
        size={18} 
        color={activeTab === "trips" ? "#183B5C" : "#9CA3AF"} 
        style={{ marginRight: 6 }}
      />
      <Text
        style={[
          { fontSize: 14, fontWeight: "600" },
          activeTab === "trips" ? { color: "#183B5C" } : { color: "#9CA3AF" },
        ]}
      >
        Trips
      </Text>
    </Pressable>
  </View>

  {/* Content based on active tab */}
  {activeTab === "earnings" ? (
    <View>
      {/* Legend */}
      <View style={{ 
        flexDirection: "row", 
        justifyContent: "flex-end",
        marginBottom: 10,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginRight: 12 }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#FFB37A", marginRight: 4 }} />
          <Text style={{ fontSize: 10, color: "#666" }}>Earnings</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#183B5C", marginRight: 4 }} />
          <Text style={{ fontSize: 10, color: "#666" }}>Trips (x50)</Text>
        </View>
      </View>

      {/* Chart */}
      <View style={{ 
        backgroundColor: "#F9FAFB",
        borderRadius: 16,
        padding: 12,
        marginBottom: 10,
      }}>
        <LineChart
          data={{
            labels: weeklyData.labels,
            datasets: [
              {
                data: weeklyData.earnings,
                color: () => "#FFB37A",
                strokeWidth: 2,
              },
              {
                data: weeklyData.trips.map((t) => t * 50),
                color: () => "#183B5C",
                strokeWidth: 2,
              },
            ],
          }}
          width={screenWidth - 80}
          height={180}
          yAxisLabel="₱"
          chartConfig={{
            backgroundGradientFrom: "#F9FAFB",
            backgroundGradientTo: "#F9FAFB",
            decimalPlaces: 0,
            color: (opacity = 1) => `rgba(24, 59, 92, ${opacity})`,
            labelColor: (opacity = 1) => `rgba(0,0,0,${opacity})`,
            style: { borderRadius: 16 },
            propsForDots: { r: "4", strokeWidth: "2", stroke: "#FFA500" },
          }}
          style={{ marginVertical: 8, borderRadius: 16 }}
          fromZero={true}
        />
      </View>

      {/* Daily breakdown */}
      <View style={{ marginTop: 10 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: "#333", marginBottom: 8 }}>
          Daily Breakdown
        </Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          {weeklyData.labels.map((day, index) => (
            <View key={day} style={{ alignItems: "center" }}>
              <Text style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{day}</Text>
              <Text style={{ fontSize: 13, fontWeight: "bold", color: "#183B5C" }}>
                ₱{weeklyData.earnings[index]}
              </Text>
              <Text style={{ fontSize: 10, color: "#999" }}>
                {weeklyData.trips[index]} trips
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  ) : (
    <View>
      {/* Trips Summary */}
      <View style={{
        backgroundColor: "#F9FAFB",
        borderRadius: 16,
        padding: 15,
        marginBottom: 15,
        flexDirection: "row",
        justifyContent: "space-between",
      }}>
        <View>
          <Text style={{ fontSize: 12, color: "#666" }}>Total Trips (Week)</Text>
          <Text style={{ fontSize: 24, fontWeight: "bold", color: "#183B5C" }}>
            {weeklyData.trips.reduce((a, b) => a + b, 0)}
          </Text>
        </View>
        <View>
          <Text style={{ fontSize: 12, color: "#666" }}>Today's Trips</Text>
          <Text style={{ fontSize: 24, fontWeight: "bold", color: "#183B5C" }}>
            {weeklyData.trips[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]}
          </Text>
        </View>
      </View>

      {/* Recent Trips List */}
      <Text style={{ fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 10 }}>
        Recent Trips
      </Text>
      <FlatList
        data={recentTrips}
        renderItem={renderTrip}
        keyExtractor={(item) => item.id.toString()}
        scrollEnabled={false}
        ListEmptyComponent={
          <View style={{ 
            padding: 30, 
            alignItems: "center",
            backgroundColor: "#F9FAFB",
            borderRadius: 16,
          }}>
            <Ionicons name="bicycle-outline" size={40} color="#D1D5DB" />
            <Text style={{ marginTop: 10, color: "#9CA3AF", textAlign: "center" }}>
              No trips yet today
            </Text>
            <Text style={{ fontSize: 12, color: "#D1D5DB", marginTop: 4 }}>
              Complete a booking to see it here
            </Text>
          </View>
        }
      />
    </View>
  )}
</View>
    </ScrollView>
  );
}
