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
  const trips = [
    {
      id: 1,
      from: "Ipil",
      to: "McDonald's Ipil",
      distance: "2.5 km",
      earnings: "₱45.00",
      time: "9:15 AM",
    },
    {
      id: 2,
      from: "Heights",
      to: "McDonald's Ipil",
      distance: "4.2 km",
      earnings: "₱67.50",
      time: "11:00 AM",
    },
    {
      id: 3,
      from: "Downtown",
      to: "Heights",
      distance: "3.1 km",
      earnings: "₱52.00",
      time: "1:45 PM",
    },
  ];

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
            .select("id, first_name, middle_name, last_name, status, is_active")
            .eq("id", storedUserId)
            .single();

          if (error) {
            console.log(error.message);
            return;
          }

          setDriver(data);
          setIsOnline(data?.is_active ?? false);
        } catch (err) {
          console.log(err.message);
        } finally {
          setLoading(false);
        }
      };

      getDriver();
    }, []),
  );

  /* ================= ANIMATED TOGGLE ================= */

  const toggleAnim = useRef(new Animated.Value(0)).current;

  const translateY = toggleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 30], // movement distance
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

    try {
      const { error } = await supabase
        .from("drivers")
        .update({
          is_active: !isOnline,
          updated_at: new Date(),
        })
        .eq("id", driver.id);

      if (error) {
        console.log(error.message);
        return;
      }

      setIsOnline(!isOnline);
    } catch (err) {
      console.log(err.message);
    }
  };
  // Sample weekly data for graph
  const weeklyData = {
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    earnings: [200, 150, 300, 250, 400, 350, 500],
    trips: [3, 2, 4, 3, 5, 4, 6],
  };

  const renderTrip = ({ item }) => (
    <View style={styles.tripCard}>
      <View style={styles.tripIcon}>
        <Ionicons name="bicycle" size={18} color="#183B5C" />
      </View>

      <View style={styles.tripInfo}>
        <Text style={styles.tripRoute}>
          {item.from} → {item.to}
        </Text>
        <Text style={styles.tripDistance}>
          {item.distance} • {item.time}
        </Text>
      </View>

      <Text style={styles.tripEarnings}>{item.earnings}</Text>
    </View>
  );

  const screenWidth = Dimensions.get("window").width - 40; // for padding

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      showsVerticalScrollIndicator={false}
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

          {/* Ranking Icon - Clickable */}
          <Pressable
            style={styles.rankingIconBadge}
            onPress={() => navigation.navigate("RankingPage")} // <-- Replace with your target page
          >
            <Image
              source={require("../../assets/ranking.png")}
              style={{ width: "100%", height: "100%" }}
              resizeMode="contain"
            />
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
            {driver.status === "pending" && "Account Setup Incomplete"}
            {driver.status === "under_review" && "Verification Under Review"}
            {driver.status === "rejected" && "Verification Rejected"}
            {driver.status === "suspended" && "Account Suspended"}
          </Text>

          <Text style={{ marginBottom: 10 }}>
            {driver.status === "pending" &&
              "Please complete your verification to start accepting rides."}

            {driver.status === "under_review" &&
              "Your documents are being reviewed by admin. Please wait."}

            {driver.status === "rejected" &&
              "Your documents were rejected. Please resubmit."}

            {driver.status === "suspended" &&
              "Your account has been suspended. Contact support."}
          </Text>

          {/* Button Logic */}
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
                Verify Now
              </Text>
            </Pressable>
          )}
        </View>
      )}
      {/* BALANCE CARD */}
      <View style={[styles.balanceCard, { position: "relative" }]}>
        <View style={styles.balanceRow}>
          <View>
            <Text style={styles.balanceLabel}>Wallet Balance</Text>
            <Text style={styles.balanceValue}>₱1,000.00</Text>
          </View>

          <View style={styles.verticalDivider} />

          <View>
            <Text style={styles.balanceLabel}>Today's Earnings</Text>
            <Text style={styles.balanceValue}>₱100.00</Text>
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

          {/* STATUS TEXT */}
          <Text
            style={{
              marginTop: 9,
              fontWeight: "700",
              fontSize: 12,
              color:
                driver?.status !== "approved"
                  ? "#999"
                  : isOnline
                    ? "#12B76A"
                    : "#555",
            }}
          >
            {driver?.status !== "approved"
              ? "LOCKED"
              : isOnline
                ? "ONLINE"
                : "OFFLINE"}
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
              ? "Account pending approval"
              : isOnline
                ? "Receiving booking requests"
                : "Not receiving booking requests"}
          </Text>
        </View>
      </View>

      {/* EARNINGS / TRIPS SECTION */}
      <View style={styles.earningsCard}>
        <Text style={styles.sectionTitle}>Today's Activity</Text>

        {/* Tabs */}
        <View style={styles.tabs}>
          <Pressable
            style={[
              styles.tabButton,
              activeTab === "earnings" && styles.activeTab,
            ]}
            onPress={() => setActiveTab("earnings")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "earnings" && styles.activeTabText,
              ]}
            >
              Earnings
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.tabButton,
              activeTab === "trips" && styles.activeTab,
            ]}
            onPress={() => setActiveTab("trips")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "trips" && styles.activeTabText,
              ]}
            >
              Trips
            </Text>
          </Pressable>
        </View>

        {activeTab === "earnings" ? (
          <View style={styles.earningsSummary}>
            <Text style={{ fontWeight: "bold", marginBottom: 10 }}>
              Weekly Overview
            </Text>

            {/* Chart container */}
            <View style={{ paddingHorizontal: 5 }}>
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
                  legend: ["Earnings (₱)", "Trips x50"],
                }}
                width={screenWidth - 40} // reduced to fit inside padding
                height={220}
                yAxisLabel="₱"
                chartConfig={{
                  backgroundGradientFrom: "#FFF",
                  backgroundGradientTo: "#FFF",
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(24, 59, 92, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(0,0,0,${opacity})`,
                  style: { borderRadius: 16 },
                  propsForDots: { r: "4", strokeWidth: "2", stroke: "#FFA500" },
                }}
                style={{ marginVertical: 8, borderRadius: 16 }}
                fromZero={true} // optional: ensures chart starts from 0
              />
            </View>
          </View>
        ) : (
          <FlatList
            data={trips}
            renderItem={renderTrip}
            keyExtractor={(item) => item.id.toString()}
            scrollEnabled={false}
          />
        )}
      </View>
    </ScrollView>
  );
}
