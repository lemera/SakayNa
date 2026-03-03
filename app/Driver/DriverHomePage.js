import React, { useState, useEffect } from "react";
import { View, Text, Pressable, StyleSheet, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

import HomeScreen from "./DriverHomeScreen";
import WalletScreen from "./DriverWalletScreen";
import InboxScreen from "./DriverInboxScreen";
import AccountScreen from "./DriverAccountScreen";
import TrackRideScreen from "./DriverTrackRideScreen";

import { navStyles } from "../styles/Driver/NavStyles";

const Tab = createBottomTabNavigator();

// TopBar Component with safe area
const TopBar = ({ title, onNotificationPress }) => (
  <SafeAreaView style={styles.safeArea}>
    <View style={styles.topBar}>
      {/* Logo on the left */}
      <Image
        source={require("../../assets/logo-sakayna.png")}
        style={styles.logo}
        resizeMode="contain"
      />

      {/* Title centered */}
      <Text style={styles.topBarTitle}>{title}</Text>
    </View>
  </SafeAreaView>
);

export default function HomePage() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [driverId, setDriverId] = useState(null);

  // Fetch driver ID and unread count
  useEffect(() => {
    const getDriverId = async () => {
      const id = await AsyncStorage.getItem("user_id");
      setDriverId(id);
    };
    getDriverId();
  }, []);

  // Fetch unread notifications count
  useEffect(() => {
    if (driverId) {
      fetchUnreadCount();

      // Subscribe to real-time updates
      const subscription = supabase
        .channel('inbox-notifications')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${driverId}`,
          },
          () => {
            fetchUnreadCount(); // Refresh count when notifications change
          }
        )
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [driverId]);

  const fetchUnreadCount = async () => {
    try {
      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", driverId)
        .eq("user_type", "driver")
        .eq("is_read", false);

      if (error) throw error;
      setUnreadCount(count || 0);
    } catch (err) {
      console.log("Error fetching unread count:", err.message);
    }
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        header: ({ navigation }) =>
          route.name === "Home" ? null : (
            <TopBar
              title={route.name}
              onNotificationPress={() => alert("No new notifications")}
            />
          ),
        tabBarActiveTintColor: "#E97A3E",
        tabBarInactiveTintColor: "#183B5C",
        tabBarStyle: navStyles.tabBar,
        tabBarLabelStyle: { fontSize: 12 },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          switch (route.name) {
            case "Home":
              iconName = focused ? "home" : "home-outline";
              break;
            case "Wallet":
              iconName = focused ? "wallet" : "wallet-outline";
              break;
            case "Inbox":
              iconName = focused ? "chatbubble" : "chatbubble-outline";
              break;
            case "Account":
              iconName = focused ? "person" : "person-outline";
              break;
          }
          
          // Return icon with notification badge for Inbox
          if (route.name === "Inbox") {
            return (
              <View style={{ position: 'relative' }}>
                <Ionicons name={iconName} size={size} color={color} />
                {unreadCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </Text>
                  </View>
                )}
              </View>
            );
          }
          
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Wallet" component={WalletScreen} />

      {/* CENTER TRACK RIDE BUTTON */}
      <Tab.Screen
        name="TrackRide"
        component={TrackRideScreen}
        options={{
          tabBarLabel: "",
          tabBarIcon: ({ focused }) => (
            <View style={navStyles.trackRideWrapper}>
              <Ionicons name="navigate" size={28} color="#FFF" />
            </View>
          ),
        }}
      />

      <Tab.Screen name="Inbox" component={InboxScreen} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#FFF",
  },
  topBar: {
    height: 25,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 15,
  },
  logo: {
    width: 40,
    height: 40,
  },
  topBarTitle: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "bold",
    color: "#183B5C",
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -10,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  badgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
});