import React from "react";
import { View, Text, Image, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { styles } from "../styles/Driver/DriverHomeScreenStyles";

export default function DriverHomeScreen() {
  const insets = useSafeAreaInsets();
  
  const trips = [
    { id: 1, from: "Ipil", to: "McDonald's Ipil", distance: "2.5 km", earnings: "₱45.00" },
    { id: 2, from: "Heights", to: "McDonald's Ipil", distance: "4.2 km", earnings: "₱67.50" },
    { id: 3, from: "Downtown", to: "Heights", distance: "3.1 km", earnings: "₱52.00" },
    { id: 4, from: "Downtown", to: "Heights", distance: "3.1 km", earnings: "₱52.00" },
    { id: 5, from: "Downtown", to: "Heights", distance: "3.1 km", earnings: "₱52.00" },
    { id: 6, from: "Downtown", to: "Heights", distance: "3.1 km", earnings: "₱52.00" },
    { id: 7, from: "Downtown", to: "Heights", distance: "3.1 km", earnings: "₱52.00" },
    { id: 8, from: "Downtown", to: "Heights", distance: "3.1 km", earnings: "₱52.00" },
    { id: 9, from: "Downtown", to: "Heights", distance: "3.1 km", earnings: "₱52.00" },
    { id: 10, from: "Downtown", to: "Heights", distance: "3.1 km", earnings: "₱52.00" },
  ];
  
  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      {/* HEADER */}
      <View style={styles.header}>
        <Image
          source={require("../../assets/logo-sakayna.png")}
          style={styles.logo}
        />
        <View style={styles.headerContent}>
          <Text style={styles.status}>Online</Text>
          <Text style={styles.userName}>John Earl Quiros</Text>
        </View>
        <Image
          source={require("../../assets/driver-avatar.jpg")}
          style={styles.avatar}
        />
      </View>

      {/* BALANCE CARD */}
      <View style={styles.balanceCard}>
        <View style={styles.balanceItem}>
          <Text style={styles.balanceLabel}>Wallet Balance</Text>
          <Text style={styles.balanceValue}>₱1,000.00</Text>
        </View>
        <View style={styles.divider} />
        <View style={[styles.balanceItem, styles.balanceItemLast]}>
          <Text style={styles.balanceLabel}>Todays Earnings</Text>
          <Text style={styles.balanceValue}>₱100.00</Text>
        </View>
      </View>

      {/* EARNINGS SUMMARY */}
      <View style={styles.earningsCard}>
        <Text style={styles.earningsTitle}>Today's Earnings</Text>
        <View style={styles.earningsTabs}>
          <View style={[styles.tab, styles.activeTab]}>
            <Text style={styles.tabTextActive}>Earnings</Text>
          </View>
          <View style={styles.tab}>
            <Text style={styles.tabText}>Trips</Text>
          </View>
        </View>
        <View style={styles.earningsContent}>
          <ScrollView
            style={styles.tripsContainer}
            nestedScrollEnabled={true}
            scrollEnabled={true}
            showsVerticalScrollIndicator={true}
          >
            {trips.map((trip) => (
              <View key={trip.id} style={styles.tripCard}>
                <View style={styles.tripIcon}>
                  <Text style={{ fontSize: 18 }}>🏍️</Text>
                </View>
                <View style={styles.tripInfo}>
                  <Text style={styles.tripRoute}>{trip.from} → {trip.to}</Text>
                  <Text style={styles.tripDistance}>{trip.distance}</Text>
                </View>
                <Text style={styles.tripEarnings}>{trip.earnings}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </ScrollView>
  );
}