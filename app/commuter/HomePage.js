// HomePage.js
import React, { useState, useEffect } from "react";
import { View, Image, Pressable, StyleSheet, Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

import HomeScreen from "./HomeScreen";
import WalletScreen from "./WalletScreen";
import AccountScreen from "./AccountScreen";
import TrackRideScreen from "./TrackRideScreen";
import InboxScreen from "./InboxScreen";
import BookingDetails from "./BookingDetails";
import PointsRewardsScreen from "./PointsRewards";
import ReferralScreen from "./ReferralScreen";
import RideHistoryScreen from "./RideHistoryScreen";
import FloatingMenu from "../components/FloatingMenu";
import MenuButton from "../components/MenuButton";
import navStyles from "../styles/NavStyles";

const Tab = createBottomTabNavigator();

const HomeButton = ({ accessibilityState }) => {
  const navigation = useNavigation();
  const [pressed, setPressed] = useState(false);
  const isActive = accessibilityState?.selected;

  return (
    <Pressable
      onPress={() => navigation.navigate("Home")}
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
      <Ionicons name="location" size={30} color="#fff" />
      <Text style={styles.buttonLabel}>Booking</Text>
    </Pressable>
  );
};

export default function HomePage() {
  const navigation = useNavigation();
  const route = useRoute();
  const [unreadCount, setUnreadCount] = useState(0);
  const [userId, setUserId] = useState(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [currentScreen, setCurrentScreen] = useState("Home");

  useEffect(() => {
    const getUserId = async () => {
      const id = await AsyncStorage.getItem("user_id");
      setUserId(id);
    };
    getUserId();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener("state", () => {
      const routes = navigation.getState()?.routes;
      if (routes && routes.length > 0) {
        const currentRoute = routes[routes.length - 1];
        setCurrentScreen(currentRoute?.name || "Home");
      }
    });
    return unsubscribe;
  }, [navigation]);

  const fetchUnreadCount = async () => {
    try {
      if (!userId) return;

      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("user_type", "commuter")
        .eq("is_read", false);

      if (error) throw error;

      setUnreadCount(count || 0);
    } catch (err) {
      console.log("Error fetching unread count:", err.message);
    }
  };

  useEffect(() => {
    if (!userId) return;

    fetchUnreadCount();

    const notificationSubscription = supabase
      .channel("commuter-notifications")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchUnreadCount();
        }
      )
      .subscribe();

    const unsubscribeFocus = navigation.addListener("focus", () => {
      fetchUnreadCount();
    });

    return () => {
      notificationSubscription.unsubscribe();
      unsubscribeFocus();
    };
  }, [userId, navigation]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (userId) fetchUnreadCount();
    }, 10000);

    return () => clearInterval(interval);
  }, [userId]);

  return (
    <>
      <Tab.Navigator
        initialRouteName="Home"
        screenOptions={({ route }) => ({
          headerStyle: { backgroundColor: "#fff", elevation: 0, shadowOpacity: 0.1 },
          headerTitleStyle: { fontWeight: "bold", fontSize: 20, color: "#183B5C" },
          headerTitleAlign: "center",
          headerLeft: () => (
            <View style={navStyles.headerContainer}>
              <Image
                source={require("../../assets/logo-sakayna.png")}
                style={navStyles.logo}
              />
            </View>
          ),
          headerRight: () => (
  <Pressable
    onPress={() => navigation.navigate("Support")}
    style={{ marginRight: 15, alignItems: "center" }}
  >
    <Ionicons name="help-circle-outline" size={24} color="#183B5C" />
    <Text style={{ fontSize: 11, color: "#183B5C", fontWeight: "500", marginTop: 2 }}>
      Help
    </Text>
  </Pressable>
),
          tabBarActiveTintColor: "#E97A3E",
          tabBarInactiveTintColor: "#183B5C",
          tabBarStyle: navStyles.tabBar,
          sceneContainerStyle: { backgroundColor: "transparent" },
          tabBarIcon: ({ focused, color, size }) => {
            let iconName;

            switch (route.name) {
              case "TrackRide":
                iconName = focused ? "navigate" : "navigate-outline";
                break;
              case "Earnings":
                iconName = focused ? "wallet" : "wallet-outline";
                break;
              case "Inbox":
                iconName = focused ? "chatbubbles" : "chatbubbles-outline";
                break;
              case "Account":
                iconName = focused ? "person" : "person-outline";
                break;
              case "Home":
                return null;
            }

            if (route.name === "Inbox") {
              return (
                <View style={{ position: "relative", width: size, height: size }}>
                  <Ionicons name={iconName} size={size} color={color} />
                  {unreadCount > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </Text>
                    </View>
                  )}
                </View>
              );
            }

            return route.name !== "Home" ? (
              <Ionicons name={iconName} size={size} color={color} />
            ) : null;
          },
        })}
      >
        <Tab.Screen
          name="TrackRide"
          component={TrackRideScreen}
        />
        <Tab.Screen
          name="Earnings"
          component={WalletScreen}
        />
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            tabBarLabel: "",
            tabBarButton: (props) => <HomeButton {...props} />,
            tabBarStyle: navStyles.tabBar,
          }}
        />
        <Tab.Screen
          name="Inbox"
          component={InboxScreen}
        />
        <Tab.Screen
          name="Account"
          component={AccountScreen}
        />
      </Tab.Navigator>

      {!menuVisible && <MenuButton onPress={() => setMenuVisible(true)} />}

      <FloatingMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        currentScreen={currentScreen}
      />
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: -8,
    right: -12,
    backgroundColor: "#FF3B30",
    borderRadius: 12,
    minWidth: 22,
    height: 22,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "#FFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 4,
  },
  badgeText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "bold",
  },
  buttonLabel: {
    color: "#fff",
    fontSize: 10,
    marginTop: 2,
    fontWeight: "600",
  },
});