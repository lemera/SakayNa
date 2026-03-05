// screens/driver/DriverHomeScreen.js
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
  Alert,
  AppState,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "../styles/Driver/DriverHomeScreenStyles";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { LineChart } from "react-native-chart-kit";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";

export default function DriverHomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState("earnings");
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [locationSubscription, setLocationSubscription] = useState(null);
  const [locationPermission, setLocationPermission] = useState(false);
  const appState = useRef(AppState.currentState);

  // * ================= WALLET DATA WITH SEPARATE BALANCE AND EARNINGS ================= */
  const [walletData, setWalletData] = useState({
    balance: 0,                    // From top-ups minus withdrawals
    total_deposits: 0,              // Total top-ups made
    total_withdrawals: 0,           // Total withdrawals made
    cash_earnings: 0,               // Earnings from cash trips
    gcash_earnings: 0,              // Earnings from GCash trips
    wallet_earnings: 0,              // Earnings from wallet payments
  });
  
  const [totalEarnings, setTotalEarnings] = useState(0); // Combined earnings from all trips
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [todayTrips, setTodayTrips] = useState(0);
  const [recentTrips, setRecentTrips] = useState([]);
  const [weeklyData, setWeeklyData] = useState({
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    earnings: [0, 0, 0, 0, 0, 0, 0],
    trips: [0, 0, 0, 0, 0, 0, 0],
  });
  const [activeSubscription, setActiveSubscription] = useState(null);
  const [missionProgress, setMissionProgress] = useState(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [driverRank, setDriverRank] = useState({
    currentRank: 1,
    level: "Bronze",
    points: 0,
  });

  // * ================= LOCATION TRACKING SETUP ================= */
  const setupLocationPermission = async () => {
    try {
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        Alert.alert("Permission Denied", "Location permission is needed to go online");
        setLocationPermission(false);
        return false;
      }

      setLocationPermission(true);
      return true;
    } catch (err) {
      console.log("Location permission error:", err);
      return false;
    }
  };

  const startLocationUpdates = async (driverId) => {
    try {
      if (locationSubscription) {
        locationSubscription.remove();
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { data: existingLocation, error: checkError } = await supabase
        .from("driver_locations")
        .select("id")
        .eq("driver_id", driverId)
        .maybeSingle();

      if (checkError) {
        console.log("Error checking existing location:", checkError);
      }

      if (existingLocation) {
        const { error } = await supabase
          .from("driver_locations")
          .update({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            is_online: true,
            last_updated: new Date(),
            accuracy: location.coords.accuracy,
            speed: location.coords.speed,
            heading: location.coords.heading,
          })
          .eq("driver_id", driverId);
        
        if (error) console.log("Location update error:", error);
      } else {
        const { error } = await supabase
          .from("driver_locations")
          .insert({
            driver_id: driverId,
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            is_online: true,
            last_updated: new Date(),
            accuracy: location.coords.accuracy,
            speed: location.coords.speed,
            heading: location.coords.heading,
          });
        
        if (error) console.log("Location insert error:", error);
      }

      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        async (newLocation) => {
          try {
            const { error } = await supabase
              .from("driver_locations")
              .update({
                latitude: newLocation.coords.latitude,
                longitude: newLocation.coords.longitude,
                is_online: true,
                last_updated: new Date(),
                accuracy: newLocation.coords.accuracy,
                speed: newLocation.coords.speed,
                heading: newLocation.coords.heading,
              })
              .eq("driver_id", driverId);

            if (error) {
              console.log("Location update error:", error);
            }
          } catch (err) {
            console.log("Location update error:", err);
          }
        }
      );

      setLocationSubscription(subscription);
    } catch (err) {
      console.log("Start location updates error:", err);
    }
  };

  const stopLocationUpdates = async (driverId) => {
    try {
      if (locationSubscription) {
        locationSubscription.remove();
        setLocationSubscription(null);
      }

      const { error } = await supabase
        .from("driver_locations")
        .update({
          is_online: false,
          last_updated: new Date()
        })
        .eq("driver_id", driverId);

      if (error) {
        console.log("Stop location updates error:", error);
      }
    } catch (err) {
      console.log("Stop location updates error:", err);
    }
  };

  // * ================= CLEANUP ON UNMOUNT ================= */
  useEffect(() => {
    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, []);

  // * ================= HANDLE APP STATE CHANGES ================= */
  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === "active") {
        console.log("App has come to foreground!");
        
        if (isOnline && driver?.id && locationSubscription) {
          try {
            const location = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.High,
            });
            
            await supabase
              .from("driver_locations")
              .upsert({
                driver_id: driver.id,
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                is_online: true,
                last_updated: new Date(),
              });
          } catch (err) {
            console.log("Error refreshing location:", err);
          }
        }
      } else if (nextAppState === "background") {
        console.log("App has gone to background!");
        
        if (isOnline) {
          Alert.alert(
            "App in Background",
            "Location updates will pause when the app is in background. Please keep the app open to receive bookings.",
            [{ text: "OK" }]
          );
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [isOnline, driver?.id]);

  // * ================= FETCH DRIVER ================= */
  useFocusEffect(
    useCallback(() => {
      const getDriver = async () => {
        try {
          setLoading(true);

          const storedUserId = await AsyncStorage.getItem("user_id");
          if (!storedUserId) return;

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

          await setupLocationPermission();

          if (data?.status === "approved" && data?.is_active) {
            await startLocationUpdates(data.id);
          }

          if (data) {
            await Promise.all([
              fetchWalletData(data.id),
              fetchTodayEarnings(data.id),
              fetchRecentTrips(data.id),
              fetchWeeklyData(data.id),
              fetchActiveSubscription(data.id),
              fetchMissionProgress(data.id),
              fetchUnreadNotifications(storedUserId),
              fetchDriverRank(data.id),
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

  // * ================= REFRESH HANDLER ================= */
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (driver?.id) {
      await Promise.all([
        fetchWalletData(driver.id),
        fetchTodayEarnings(driver.id),
        fetchRecentTrips(driver.id),
        fetchWeeklyData(driver.id),
        fetchActiveSubscription(driver.id),
        fetchMissionProgress(driver.id),
        fetchUnreadNotifications(driver.id),
        fetchDriverRank(driver.id),
      ]);
    }
    setRefreshing(false);
  }, [driver?.id]);

  // * ================= FETCH WALLET DATA ================= */
  const fetchWalletData = async (driverId) => {
    try {
      const { data, error } = await supabase
        .from("driver_wallets")
        .select("balance, total_deposits, total_withdrawals, cash_earnings, gcash_earnings, wallet_earnings")
        .eq("driver_id", driverId)
        .maybeSingle();

      if (error) {
        console.log("Wallet error:", error.message);
        return;
      }

      if (data) {
        setWalletData(data);
        // Calculate total earnings from all trips
        const total = (data.cash_earnings || 0) + (data.gcash_earnings || 0) + (data.wallet_earnings || 0);
        setTotalEarnings(total);
      } else {
        // Create wallet if it doesn't exist
        const { error: insertError } = await supabase
          .from("driver_wallets")
          .insert({
            driver_id: driverId,
            balance: 0,
            total_deposits: 0,
            total_withdrawals: 0,
            cash_earnings: 0,
            gcash_earnings: 0,
            wallet_earnings: 0,
          });

        if (insertError) console.log("Wallet creation error:", insertError);
        
        setWalletData({
          balance: 0,
          total_deposits: 0,
          total_withdrawals: 0,
          cash_earnings: 0,
          gcash_earnings: 0,
          wallet_earnings: 0,
        });
        setTotalEarnings(0);
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
        .select("actual_fare, payment_method, payment_type")
        .eq("driver_id", driverId)
        .eq("status", "completed")
        .gte("ride_completed_at", today.toISOString())
        .lt("ride_completed_at", tomorrow.toISOString());

      if (error) {
        console.log("Today earnings error:", error.message);
        return;
      }

      const total = data?.reduce((sum, booking) => sum + (booking.actual_fare || 0), 0) || 0;
      const tripsCount = data?.length || 0;
      
      setTodayEarnings(total);
      setTodayTrips(tripsCount);
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
          status,
          payment_method,
          payment_type
        `,
        )
        .eq("driver_id", driverId)
        .eq("status", "completed")
        .order("ride_completed_at", { ascending: false })
        .limit(10);

      if (error) {
        console.log("❌ Recent trips error:", error.message);
        return;
      }

      const formattedTrips = data?.map((trip) => {
        const paymentMethod = trip.payment_method || trip.payment_type || "cash";
        const paymentColor = 
          paymentMethod === "gcash" ? "#00579F" :
          paymentMethod === "cash" ? "#10B981" : "#183B5C";
        
        return {
          id: trip.id,
          from: trip.pickup_location?.split(",")[0] || "Pickup",
          to: trip.dropoff_location?.split(",")[0] || "Dropoff",
          distance: trip.distance_km ? `${trip.distance_km.toFixed(1)} km` : "? km",
          earnings: `₱${trip.actual_fare?.toFixed(2) || "0.00"}`,
          time: trip.ride_completed_at
            ? new Date(trip.ride_completed_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "Unknown",
          paymentMethod,
          paymentColor,
        };
      }) || [];

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
      const dayOfWeek = today.getDay();

      const startOfWeek = new Date(today);
      startOfWeek.setDate(
        today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1),
      );
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);

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

      const earnings = [0, 0, 0, 0, 0, 0, 0];
      const trips = [0, 0, 0, 0, 0, 0, 0];

      data?.forEach((booking) => {
        if (booking.ride_completed_at) {
          const date = new Date(booking.ride_completed_at);
          let dayIndex = date.getDay();
          dayIndex = dayIndex === 0 ? 6 : dayIndex - 1;

          earnings[dayIndex] += booking.actual_fare || 0;
          trips[dayIndex] += 1;
        }
      });

      setWeeklyData({
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        earnings: earnings,
        trips: trips,
      });
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
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        console.log("Subscription error:", error.message);
        return;
      }

      if (data) {
        setActiveSubscription(data);
      } else {
        setActiveSubscription(null);
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
      startOfWeek.setDate(today.getDate() - today.getDay() + 1);
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
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        console.log("Mission error:", error.message);
        return;
      }

      if (data) {
        setMissionProgress(data);
      } else {
        setMissionProgress(null);
      }
    } catch (err) {
      console.log("Fetch mission error:", err.message);
    }
  };

  // * ================= FETCH UNREAD NOTIFICATIONS ================= */
  const fetchUnreadNotifications = async (userId) => {
    try {
      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false);

      if (error) throw error;
      setUnreadNotifications(count || 0);
    } catch (err) {
      console.log("Error fetching notifications:", err);
    }
  };

  // * ================= FETCH DRIVER RANK ================= */
  const fetchDriverRank = async (driverId) => {
    try {
      const { data: drivers, error } = await supabase
        .from("drivers")
        .select(`
          id,
          first_name,
          last_name
        `)
        .eq("status", "approved");

      if (error) throw error;

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
            points: (count || 0) * 10,
          };
        })
      );

      const sortedDrivers = driverStats.sort((a, b) => b.points - a.points);
      const currentDriverIndex = sortedDrivers.findIndex(d => d.id === driverId);
      const currentRank = currentDriverIndex + 1;
      const currentDriverPoints = sortedDrivers[currentDriverIndex]?.points || 0;

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

  /* ================= ANIMATED TOGGLE ================= */
  const toggleAnim = useRef(new Animated.Value(0)).current;

  const translateY = toggleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [30, 0],
  });

  useEffect(() => {
    Animated.timing(toggleAnim, {
      toValue: isOnline ? 1 : 0,
      duration: 250,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [isOnline]);

  /* ================= TOGGLE ONLINE ================= */
  const toggleAvailability = async () => {
    if (!driver || driver.status !== "approved") return;

    if (!activeSubscription) {
      Alert.alert(
        "No Active Subscription",
        "You need an active subscription to go online. Please subscribe first.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Subscribe", onPress: () => navigation.navigate("SubscriptionScreen") }
        ]
      );
      return;
    }

    if (!locationPermission) {
      const granted = await setupLocationPermission();
      if (!granted) {
        Alert.alert("Permission Required", "Location permission is needed to go online");
        return;
      }
    }

    try {
      const newOnlineStatus = !isOnline;
      setIsOnline(newOnlineStatus);

      if (newOnlineStatus) {
        await startLocationUpdates(driver.id);
      } else {
        await stopLocationUpdates(driver.id);
      }

      const { error } = await supabase
        .from("drivers")
        .update({
          is_active: newOnlineStatus,
          updated_at: new Date(),
        })
        .eq("id", driver.id);

      if (error) {
        setIsOnline(!newOnlineStatus);
        console.log(error.message);
        return;
      }

      await supabase.from("audit_logs").insert([
        {
          user_id: driver.id,
          user_type: "driver",
          action: "UPDATE",
          table_name: "drivers",
          record_id: driver.id,
          metadata: {
            field: "is_active",
            old_value: !newOnlineStatus,
            new_value: newOnlineStatus,
          },
        },
      ]);

      Alert.alert(
        newOnlineStatus ? "You're Online!" : "You're Offline",
        newOnlineStatus 
          ? "You can now receive booking requests. Your location is being tracked while the app is open."
          : "You will no longer receive booking requests.",
        [{ text: "OK" }]
      );
    } catch (err) {
      setIsOnline(!isOnline);
      console.log(err.message);
      Alert.alert("Error", "Failed to update status. Please try again.");
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
        backgroundColor: item.paymentColor || "#183B5C",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
      }}>
        <Ionicons 
          name={
            item.paymentMethod === "gcash" ? "phone-portrait" :
            item.paymentMethod === "cash" ? "cash" : "wallet"
          } 
          size={24} 
          color="#FFF" 
        />
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

    const progress = (missionProgress.actual_rides / missionProgress.target_rides) * 100;

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
            🎉 Congrats! You've hit the target! ₱{missionProgress.bonus_amount} bonus coming soon!
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

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#183B5C" />
        <Text style={{ marginTop: 10, color: "#666" }}>Loading your dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* HEADER */}
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

          {/* Ranking Icon */}
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
                <Ionicons 
                  name={
                    driverRank?.level === "Diamond" ? "diamond" :
                    driverRank?.level === "Gold" ? "trophy" :
                    driverRank?.level === "Silver" ? "medal" :
                    "ribbon"
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
            marginHorizontal: 20,
            marginTop: 15,
            marginBottom: 10,
            padding: 15,
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
          <Text style={{ fontWeight: "600", marginBottom: 5, fontSize: 16 }}>
            {driver.status === "pending" && "⏳ Not yet verified!"}
            {driver.status === "under_review" && "🔍 Under review"}
            {driver.status === "rejected" && "❌ Documents rejected"}
            {driver.status === "suspended" && "⛔ Account suspended"}
          </Text>

          <Text style={{ marginBottom: 10, color: "#333" }}>
            {driver.status === "pending" &&
              "Complete verification to start accepting bookings."}
            {driver.status === "under_review" &&
              "Your documents are being reviewed. Please check back later."}
            {driver.status === "rejected" &&
              "Your documents did not pass. Please resubmit."}
            {driver.status === "suspended" &&
              "Your account is suspended. Contact support for assistance."}
          </Text>

          {(driver.status === "pending" || driver.status === "rejected") && (
            <Pressable
              onPress={() => navigation.navigate("DriverVerificationScreen")}
              style={{
                backgroundColor: "#183B5C",
                paddingVertical: 12,
                borderRadius: 8,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#FFF", fontWeight: "600", fontSize: 16 }}>
                {driver.status === "pending"
                  ? "✅ Complete Verification"
                  : "🔄 Resubmit Documents"}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {/* SUBSCRIPTION & MISSION SIDE BY SIDE */}
      {activeSubscription && missionProgress && (
        <View
          style={{
            marginHorizontal: 20,
            marginTop: 15,
            flexDirection: "row",
            gap: 10,
          }}
        >
          {/* LEFT SIDE - SUBSCRIPTION */}
          <Pressable
            onPress={() => navigation.navigate("SubscriptionScreen")}
            style={{
              flex: 0.6,
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

            <Text style={{ fontSize: 10, color: "#4CAF50", marginBottom: 8 }}>
              Exp: {new Date(activeSubscription.end_date).toLocaleDateString()}
            </Text>

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

          {/* RIGHT SIDE - MISSION */}
          <View
            style={{
              flex: 0.6,
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

      {/* BALANCE CARD - UPDATED WITH CLEAR SEPARATION */}
      <View style={[styles.balanceCard, { position: "relative", marginTop: 10 }]}>
        <View style={styles.balanceRow}>
          <Pressable
            onPress={() => navigation.navigate("Wallet")}
            style={{ flex: 1 }}
          >
            <Text style={styles.balanceLabel}>Wallet Balance (From Top-ups)</Text>
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
              Total Top-ups: ₱{walletData.total_deposits.toFixed(2)} • Withdrawn: ₱{walletData.total_withdrawals.toFixed(2)}
            </Text>
          </Pressable>

          <View>
            <Text style={styles.balanceLabel}>Today's Earnings</Text>
            <Text style={styles.balanceValue}>₱{todayEarnings.toFixed(2)}</Text>
            <Text style={{ fontSize: 10, color: "#666", marginTop: 2 }}>
              {todayTrips} trips
            </Text>
          </View>
        </View>

        {/* EARNINGS BREAKDOWN - FROM TRIPS */}
        <View style={{
          marginTop: 15,
          padding: 12,
          backgroundColor: "#F9FAFB",
          borderRadius: 12,
        }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#333", marginBottom: 8 }}>
            Total Earnings from Trips: ₱{totalEarnings.toFixed(2)}
          </Text>
          <View style={{
            flexDirection: "row",
            justifyContent: "space-around",
          }}>
            <View style={{ alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#10B981", marginRight: 4 }} />
                <Text style={{ fontSize: 11, color: "#666" }}>Cash</Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#10B981" }}>
                ₱{walletData.cash_earnings.toFixed(0)}
              </Text>
            </View>

            <View style={{ alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#00579F", marginRight: 4 }} />
                <Text style={{ fontSize: 11, color: "#666" }}>GCash</Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#00579F" }}>
                ₱{walletData.gcash_earnings.toFixed(0)}
              </Text>
            </View>

            <View style={{ alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#183B5C", marginRight: 4 }} />
                <Text style={{ fontSize: 11, color: "#666" }}>Wallet</Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#183B5C" }}>
                ₱{walletData.wallet_earnings.toFixed(0)}
              </Text>
            </View>
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
                    ? "#12B76A"
                    : "#F2F4F7",
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
              ? "🚫 NOT APPROVED"
              : isOnline
                ? "✅ ONLINE"
                : "😴 OFFLINE"}
          </Text>

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
              ? "Waiting for approval"
              : isOnline
                ? "Ready to accept bookings"
                : "Not accepting bookings"}
          </Text>
        </View>
      </View>

      {/* EARNINGS / TRIPS SECTION */}
      <View style={[styles.earningsCard, { 
        marginHorizontal: 20, 
        marginTop: 30,
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
            <Text style={{ fontSize: 10, color: "#666" }}>{todayTrips} trips</Text>
          </View>
        </View>

        {/* Tabs */}
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
                <Text style={{ fontSize: 10, color: "#666" }}>Earnings (₱)</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#183B5C", marginRight: 4 }} />
                <Text style={{ fontSize: 10, color: "#666" }}>Trips (x50)</Text>
              </View>
            </View>

            {/* Chart */}
            {weeklyData.earnings.some(day => day > 0) ? (
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
            ) : (
              <View style={{ 
                backgroundColor: "#F9FAFB",
                borderRadius: 16,
                padding: 30,
                marginBottom: 10,
                alignItems: "center",
              }}>
                <Ionicons name="bar-chart-outline" size={40} color="#D1D5DB" />
                <Text style={{ marginTop: 10, color: "#9CA3AF" }}>No earnings data this week</Text>
              </View>
            )}

            {/* Daily breakdown */}
            <View style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#333", marginBottom: 8 }}>
                Daily Breakdown
              </Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                {weeklyData.labels.map((day, index) => {
                  const isToday = index === (new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);
                  return (
                    <View key={day} style={{ alignItems: "center" }}>
                      <Text style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{day}</Text>
                      <Text style={{ 
                        fontSize: 13, 
                        fontWeight: "bold", 
                        color: isToday ? "#183B5C" : "#333" 
                      }}>
                        ₱{weeklyData.earnings[index]}
                      </Text>
                      <Text style={{ fontSize: 10, color: "#999" }}>
                        {weeklyData.trips[index]} trips
                      </Text>
                    </View>
                  );
                })}
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
                  {todayTrips}
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
                    No trips yet
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