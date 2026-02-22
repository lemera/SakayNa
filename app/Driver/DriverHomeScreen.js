import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  FlatList,
  Pressable,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { styles } from "../styles/Driver/DriverHomeScreenStyles";

// Import chart
import { LineChart, BarChart } from "react-native-chart-kit";

export default function DriverHomeScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState("earnings");

  const trips = [
    { id: 1, from: "Ipil", to: "McDonald's Ipil", distance: "2.5 km", earnings: "₱45.00", time: "9:15 AM" },
    { id: 2, from: "Heights", to: "McDonald's Ipil", distance: "4.2 km", earnings: "₱67.50", time: "11:00 AM" },
    { id: 3, from: "Downtown", to: "Heights", distance: "3.1 km", earnings: "₱52.00", time: "1:45 PM" },
  ];

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
        <Text style={styles.tripDistance}>{item.distance} • {item.time}</Text>
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
              <View style={[styles.onlineDot, { backgroundColor: "#00FF00" }]} />
              <Text style={[styles.onlineText, { color: "#FFF" }]}>Online</Text>
            </View>
            <Text style={[styles.userName, { color: "#FFF" }]}>John Earl Quiros</Text>
          </View>

          <Image
            source={require("../../assets/driver-avatar.jpg")}
            style={styles.avatar}
          />
        </View>
      </LinearGradient>

      {/* BALANCE CARD */}
      <View style={styles.balanceCard}>
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
      </View>

      {/* EARNINGS / TRIPS SECTION */}
      <View style={styles.earningsCard}>
        <Text style={styles.sectionTitle}>Today's Activity</Text>

        {/* Tabs */}
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tabButton, activeTab === "earnings" && styles.activeTab]}
            onPress={() => setActiveTab("earnings")}
          >
            <Text style={[styles.tabText, activeTab === "earnings" && styles.activeTabText]}>
              Earnings
            </Text>
          </Pressable>

          <Pressable
            style={[styles.tabButton, activeTab === "trips" && styles.activeTab]}
            onPress={() => setActiveTab("trips")}
          >
            <Text style={[styles.tabText, activeTab === "trips" && styles.activeTabText]}>
              Trips
            </Text>
          </Pressable>
        </View>

{activeTab === "earnings" ? (
  <View style={styles.earningsSummary}>
    <Text style={{ fontWeight: "bold", marginBottom: 10 }}>Weekly Overview</Text>

    {/* Chart container */}
    <View style={{ paddingHorizontal: 5}}>
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
              data: weeklyData.trips.map(t => t * 50),
              color: () => "#183B5C",
              strokeWidth: 2,
            },
          ],
          legend: ["Earnings (₱)", "Trips x50"]
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