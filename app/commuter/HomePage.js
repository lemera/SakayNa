// HomePage.js - Main navigation for commuter with custom TrackRide button
import React, { useState, useEffect } from "react";
import { View, Image, Pressable, StyleSheet, Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

import HomeScreen from "./HomeScreen";
import WalletScreen from "./WalletScreen";
import AccountScreen from "./AccountScreen";
import TrackRideScreen from "./TrackRideScreen";
import BookingDetails from "./BookingDetails";
import InboxScreen from "./InboxScreen";
import navStyles from "../styles/NavStyles";

const Tab = createBottomTabNavigator();

// Custom TrackRide button 
const TrackRideButton = ({ accessibilityState }) => {
  const navigation = useNavigation();
  const [pressed, setPressed] = useState(false);
  const isActive = accessibilityState?.selected;

  return (
    <Pressable
      onPress={() => navigation.navigate("TrackRide")}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        navStyles.trackRideButton,
        {
          backgroundColor: pressed || isActive ? "#E97A3E" : "#183B5C",
          transform: [{ scale: pressed ? 0.95 : 1 }],
        },
      ]}
    >
      <Ionicons name="navigate" size={30} color="#fff" />
    </Pressable>
  );
};

export default function HomePage() {
  const navigation = useNavigation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [userId, setUserId] = useState(null);

  // Fetch user ID
  useEffect(() => {
    const getUserId = async () => {
      const id = await AsyncStorage.getItem("user_id");
      setUserId(id);
    };
    getUserId();
  }, []);

  // Fetch unread notifications count
  const fetchUnreadCount = async () => {
    try {
      if (!userId) return;
      
      console.log("🔍 Fetching unread notifications for user:", userId);
      
      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("user_type", "commuter")
        .eq("is_read", false);

      if (error) throw error;
      
      console.log("📊 Unread notifications count:", count);
      setUnreadCount(count || 0);
    } catch (err) {
      console.log("Error fetching unread count:", err.message);
    }
  };

  // Set up real-time subscription for notifications
  useEffect(() => {
    if (!userId) return;

    // Initial fetch
    fetchUnreadCount();

    // Subscribe to notification changes
    const notificationSubscription = supabase
      .channel('commuter-notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log("📦 Notification changed:", payload.eventType);
          fetchUnreadCount();
        }
      )
      .subscribe((status) => {
        console.log("📡 Notification subscription status:", status);
      });

    // Refresh count when screen comes into focus
    const unsubscribeFocus = navigation.addListener('focus', () => {
      console.log("🏠 Home screen focused - refreshing unread count");
      fetchUnreadCount();
    });

    return () => {
      notificationSubscription.unsubscribe();
      unsubscribeFocus();
    };
  }, [userId, navigation]);

  // Periodic refresh every 10 seconds as backup
  useEffect(() => {
    const interval = setInterval(() => {
      if (userId) {
        fetchUnreadCount();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [userId]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: "#fff", elevation: 0, shadowOpacity: 0.1 },
        headerTitleStyle: { fontWeight: "bold", fontSize: 20, color: "#183B5C" },
        headerTitleAlign: "center",
        headerLeft: () => (
          <View style={navStyles.headerContainer}>
            <Image source={require("../../assets/logo-sakayna.png")} style={navStyles.logo} />
          </View>
        ),
        headerRight: () => (
          <Pressable onPress={() => navigation.navigate("Support")} style={{ marginRight: 15 }}>
            <Ionicons name="help-circle-outline" size={28} color="#183B5C" />
          </Pressable>
        ),
        tabBarActiveTintColor: "#E97A3E",
        tabBarInactiveTintColor: "#183B5C",
        tabBarStyle: navStyles.tabBar,
        sceneContainerStyle: { backgroundColor: "transparent" },
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
              iconName = focused ? "chatbubbles" : "chatbubbles-outline";
              break;
            case "Account":
              iconName = focused ? "person" : "person-outline";
              break;
          }
          
          // Handle Inbox with notification badge
          if (route.name === "Inbox") {
            return (
              <View style={{ position: 'relative', width: size, height: size }}>
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
          
          // For all other tabs, just return the icon
          return route.name !== "TrackRide" ? <Ionicons name={iconName} size={size} color={color} /> : null;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Wallet" component={WalletScreen} />

      {/* TrackRide button in center */}
      <Tab.Screen
        name="TrackRide"
        component={TrackRideScreen}
        options={{
          tabBarLabel: "",
          tabBarButton: (props) => <TrackRideButton {...props} />,
          // Always show bottom tab bar
          tabBarStyle: navStyles.tabBar,
        }}
      />

      <Tab.Screen name="Inbox" component={InboxScreen} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -8,
    right: -12,
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    minWidth: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#FFF',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 4,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
});