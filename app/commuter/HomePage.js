// app/commuter/HomePage.js
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Image,
  Pressable,
  StyleSheet,
  Text,
  Platform,
  useWindowDimensions,
} from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "../../lib/supabase";

import HomeScreen from "./HomeScreen";
import WalletScreen from "./WalletScreen";
import AccountScreen from "./AccountScreen";
import TrackRideScreen from "./TrackRideScreen";
import InboxScreen from "./InboxScreen";

import FloatingMenu from "../components/FloatingMenu";
import MenuButton from "../components/MenuButton";
import navStylesFactory from "../styles/NavStyles";

const Tab = createBottomTabNavigator();

function HomeButton({ accessibilityState, onPress }) {
  const { width } = useWindowDimensions();
  const styles = navStylesFactory(width);
  const [pressed, setPressed] = useState(false);
  const isActive = accessibilityState?.selected;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.trackRideButton,
        {
          backgroundColor: pressed || isActive ? "#E97A3E" : "#183B5C",
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
      ]}
    >
      <Ionicons name="location" size={width < 360 ? 24 : 28} color="#fff" />
      <Text style={stylesLocal.buttonLabel}>Booking</Text>
    </Pressable>
  );
}
 
export default function HomePage() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const navStyles = navStylesFactory(width);

  const [unreadCount, setUnreadCount] = useState(0);
  const [userId, setUserId] = useState(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [currentScreen, setCurrentScreen] = useState("Home");

  useEffect(() => {
    let mounted = true;

    const getUserId = async () => {
      try {
        const id = await AsyncStorage.getItem("user_id");
        if (mounted) {
          setUserId(id);
        }
      } catch (error) {
        console.log("Error getting user_id:", error?.message || error);
      }
    };

    getUserId();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener("state", () => {
      try {
        const navState = navigation.getState?.();
        const routes = navState?.routes || [];
        const currentRoute = routes[routes.length - 1];
        setCurrentScreen(currentRoute?.name || "Home");
      } catch (error) {
        console.log("Navigation state error:", error?.message || error);
      }
    });

    return unsubscribe;
  }, [navigation]);

  const fetchUnreadCount = useCallback(async () => {
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
      console.log("Error fetching unread count:", err?.message || err);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    fetchUnreadCount();

    const notificationSubscription = supabase
      .channel(`commuter-notifications-${userId}`)
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
      supabase.removeChannel(notificationSubscription);
      unsubscribeFocus();
    };
  }, [userId, navigation, fetchUnreadCount]);

  useEffect(() => {
    if (!userId) return;

    const interval = setInterval(() => {
      fetchUnreadCount();
    }, 10000);

    return () => clearInterval(interval);
  }, [userId, fetchUnreadCount]);

  // FIXED: Proper tab bar height calculation for Android
  const getTabBarHeight = () => {
    const baseHeight = width < 360 ? 50 : 58; // mas slim
    
    if (Platform.OS === 'android') {
      const navigationBarHeight = insets.bottom;
      
      // For gesture navigation (no visible buttons)
      if (navigationBarHeight === 0) {
        return baseHeight + 20;
      }
      
      // For devices with 3-button navigation
      return baseHeight + navigationBarHeight;
    }
    
    // iOS
    const extraBottom = Math.max(insets.bottom, 8);
    return baseHeight + extraBottom;
  };

  return (
    <>
      <Tab.Navigator
        initialRouteName="Home"
        screenOptions={({ route }) => ({
          headerStyle: {
  backgroundColor: "#fff",
  elevation: 0,
  shadowOpacity: 0,
  borderBottomWidth: 0,
},

headerTitleStyle: {
  fontWeight: "800",
  fontSize: width < 360 ? 17 : 20,
  color: "#183B5C",
  letterSpacing: 0.3,
},
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
              style={navStyles.helpButton}
            >
              <Ionicons name="help-circle-outline" size={width < 360 ? 18 : 20} color="#183B5C" />
<Text style={navStyles.helpText}>Help</Text>
            </Pressable>
          ),

          tabBarShowLabel: true,
          tabBarActiveTintColor: "#E97A3E",
          tabBarInactiveTintColor: "#183B5C",
          tabBarLabelStyle: {
  fontSize: width < 360 ? 10 : 11,
  fontWeight: "700",
  marginBottom: Platform.OS === "ios" ? 2 : 4,
  letterSpacing: 0.2,
},
          // FIXED: Tab bar style with proper Android handling
          tabBarStyle: [
            navStyles.tabBar,
            {
              height: getTabBarHeight(),
              paddingBottom: Platform.select({
                android: Math.max(insets.bottom, 16),
                ios: Math.max(insets.bottom, 8),
                default: 10,
              }),
              paddingTop: Platform.select({
                android: 8,
                default: 0,
              }),
              // Important for Android
              position: 'absolute',
              bottom: 5,
              left: 5,
              right: 5,
            },
          ],
          // FIXED: Safe area insets
          tabBarSafeAreaInsets: {
            bottom: Platform.OS === 'android' ? Math.max(insets.bottom, 16) : insets.bottom,
          },
          sceneContainerStyle: {
            backgroundColor: "#fff",
          },
          tabBarIcon: ({ focused, color, size }) => {
            let iconName = "";

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
              default:
                return null;
            }

            if (route.name === "Inbox") {
              return (
                <View style={stylesLocal.iconWrapper}>
                  <Ionicons name={iconName} size={size} color={color} />
                  {unreadCount > 0 && (
                    <View style={stylesLocal.badge}>
                      <Text style={stylesLocal.badgeText}>
                        {unreadCount > 9 ? "9+" : unreadCount}
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
        <Tab.Screen
          name="TrackRide"
          component={TrackRideScreen}
          options={{
            title: "Track Ride",
            tabBarLabel: "Track",
          }}
        />

        <Tab.Screen
          name="Earnings"
          component={WalletScreen}
          options={{
            title: "Wallet",
            tabBarLabel: "Wallet",
          }}
        />

        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            title: "Home",
            tabBarLabel: "",
            tabBarButton: (props) => <HomeButton {...props} />,
          }}
        />

        <Tab.Screen
          name="Inbox"
          component={InboxScreen}
          options={{
            title: "Inbox",
            tabBarLabel: "Inbox",
          }}
        />

        <Tab.Screen
          name="Account"
          component={AccountScreen}
          options={{
            title: "Account",
            tabBarLabel: "Account",
          }}
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

const stylesLocal = StyleSheet.create({
  iconWrapper: {
    position: "relative",
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },

  badge: {
    position: "absolute",
    top: -4,
    right: -10,
    backgroundColor: "#FF4D4F",
    borderRadius: 999,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: "#FFF",
    elevation: 5,
  },

  badgeText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "800",
  },

  buttonLabel: {
    color: "#fff",
    fontSize: 10,
    marginTop: 3,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});