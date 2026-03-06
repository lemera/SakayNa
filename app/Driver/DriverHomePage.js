import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Image,
  Animated,
  Vibration,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";

import HomeScreen from "./DriverHomeScreen";
import WalletScreen from "./DriverWalletScreen";
import InboxScreen from "./DriverInboxScreen";
import AccountScreen from "./DriverAccountScreen";
import DriverTrackRideScreen from "./DriverTrackRideScreen";

import { navStyles } from "../styles/Driver/NavStyles";

const Tab = createBottomTabNavigator();

// TopBar Component with safe area
const TopBar = ({ title }) => (
  <SafeAreaView style={styles.safeArea}>
    <View style={styles.topBar}>
      <Image
        source={require("../../assets/logo-sakayna.png")}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.topBarTitle}>{title}</Text>
    </View>
  </SafeAreaView>
);

export default function HomePage() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [driverId, setDriverId] = useState(null);
  const [hasActiveBooking, setHasActiveBooking] = useState(false);
  const [hasPendingRequests, setHasPendingRequests] = useState(false);
  const [pendingCount, setPendingCount] = useState(0); // Fixed: Added pendingCount state
  const [sound, setSound] = useState(null);

  // Animation values
  const glowAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Fetch driver ID
  useEffect(() => {
    const getDriverId = async () => {
      const id = await AsyncStorage.getItem("user_id");
      console.log("📱 Driver ID from storage:", id);
      setDriverId(id);
    };
    getDriverId();
  }, []);

  // Check for both active bookings AND pending requests
  useEffect(() => {
    if (!driverId) {
      console.log("⏳ Waiting for driver ID...");
      return;
    }

    console.log("🚀 Setting up booking monitor for driver:", driverId);
    
    // Initial check
    checkAllBookings();
    
    // Set up periodic check as backup (every 10 seconds)
    const intervalId = setInterval(() => {
      console.log("⏰ Periodic check for bookings");
      checkAllBookings();
    }, 10000);
    
    // Subscribe to real-time booking updates
    const subscription = supabase
      .channel('driver-all-bookings')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'booking_requests',
          filter: `driver_id=eq.${driverId}`,
        },
        (payload) => {
          console.log("📦 Booking update received:", payload.eventType);
          console.log("📊 New status:", payload.new?.status);
          
          if (payload.new?.driver_id === driverId) {
            checkAllBookings(); // Recheck all bookings
            
            // Trigger alert for NEW pending requests OR new accepted bookings
            if (payload.eventType === 'INSERT' && payload.new?.status === 'pending') {
              console.log("✅🔥 NEW PENDING REQUEST!");
              triggerBookingAlert();
            } else if (payload.new?.status === 'accepted') {
              console.log("✅🔥 BOOKING ACCEPTED!");
              triggerBookingAlert();
            }
          }
        }
      )
      .subscribe((status) => {
        console.log("📡 Subscription status:", status);
      });

    return () => {
      console.log("🧹 Cleaning up subscriptions");
      clearInterval(intervalId);
      subscription.unsubscribe();
      if (sound) {
        console.log("🧹 Unloading sound");
        sound.unloadAsync();
      }
    };
  }, [driverId]);

  // Animation effect - glow if has ACTIVE booking OR PENDING request
  useEffect(() => {
    const shouldGlow = hasActiveBooking || hasPendingRequests;
    console.log("🎨 Animation effect - shouldGlow:", shouldGlow, 
                "Active:", hasActiveBooking, "Pending:", hasPendingRequests);
    
    if (shouldGlow) {
      startGlowAnimation();
    } else {
      stopGlowAnimation();
    }
  }, [hasActiveBooking, hasPendingRequests]);

  // Clean up sound on unmount
  useEffect(() => {
    return () => {
      if (sound) {
        console.log("🧹 Cleaning up sound on unmount");
        sound.unloadAsync();
      }
    };
  }, []);

  const startGlowAnimation = () => {
    console.log("✨ Starting glow animation");
    
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const stopGlowAnimation = () => {
    console.log("🛑 Stopping glow animation");
    glowAnim.stopAnimation();
    glowAnim.setValue(0);
  };

  const triggerBookingAlert = async () => {
    console.log("🔔 TRIGGERING ALERT: New booking!");
    
    // 1. VIBRATION
    try {
      Vibration.vibrate([500, 300, 500]);
      console.log("✅ Vibration sent");
    } catch (error) {
      console.log("❌ Vibration failed:", error);
    }

    // 2. HAPTIC FEEDBACK
    try {
      if (Platform.OS === 'ios') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
      console.log("✅ Haptic sent");
    } catch (error) {
      console.log("❌ Haptic failed:", error);
    }

    // 3. SOUND - Using local asset file
    try {
      console.log("🔊 Attempting to play local sound file...");
      
      if (sound) {
        await sound.unloadAsync();
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        require('../../assets/sounds/booking_alert.mp3'),
        { 
          shouldPlay: true,
          volume: 1.0,
          isLooping: false
        }
      );
      
      setSound(newSound);
      console.log("✅ Local sound playing successfully!");
      
      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          console.log("✅ Sound finished playing");
        }
      });
      
    } catch (error) {
      console.log("❌ Local sound failed:", error);
    }
  };

  const checkAllBookings = async () => {
    try {
      console.log("🔍 Checking all bookings for driver:", driverId);
      
      // Check for ACTIVE bookings (accepted)
      const { data: activeData, error: activeError } = await supabase
        .from("bookings")
        .select("id, status")
        .eq("driver_id", driverId)
        .eq("status", "accepted")
        .limit(1);

      if (activeError) throw activeError;
      
      // Check for PENDING requests and get count
      const { data: pendingData, error: pendingError, count } = await supabase
        .from("bookings")
        .select("id, status", { count: "exact", head: false })
        .eq("driver_id", driverId)
        .eq("status", "pending");

      if (pendingError) throw pendingError;
      
      const hasActive = activeData && activeData.length > 0;
      const hasPending = pendingData && pendingData.length > 0;
      const pendingCountValue = pendingData?.length || 0;
      
      console.log("📊 Results - Active:", hasActive, "Pending:", hasPending, "Count:", pendingCountValue);
      
      setHasActiveBooking(hasActive);
      setHasPendingRequests(hasPending);
      setPendingCount(pendingCountValue); // Store the count
      
    } catch (err) {
      console.log("Error checking bookings:", err);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      console.log("🔍 Fetching unread notifications for driver:", driverId);
      
      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", driverId)
        .eq("user_type", "driver")
        .eq("is_read", false);

      if (error) throw error;
      
      console.log("📊 Unread notifications count:", count);
      setUnreadCount(count || 0);
    } catch (err) {
      console.log("Error fetching unread count:", err.message);
    }
  };

  // Fetch unread notifications - with better subscription
  useEffect(() => {
    if (!driverId) return;

    fetchUnreadCount();

    const notifSubscription = supabase
      .channel('inbox-notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${driverId}`,
        },
        (payload) => {
          console.log("📦 Notification changed:", payload.eventType);
          // Always fetch fresh count on any change
          fetchUnreadCount();
        }
      )
      .subscribe((status) => {
        console.log("📡 Notification subscription status:", status);
      });

    return () => {
      console.log("🧹 Cleaning up notification subscription");
      notifSubscription.unsubscribe();
    };
  }, [driverId]);

  // Animation interpolations
  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.8, 0.3]
  });

  const glowScale = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.2]
  });

  // Determine glow color based on what's pending/active
  const getGlowColor = () => {
    if (hasActiveBooking) return '#FF6B6B'; // Red for active ride
    if (hasPendingRequests) return '#FFB37A'; // Orange for pending requests
    return '#FFB37A'; // Default
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        header: ({ navigation }) =>
          route.name === "Home" ? null : (
            <TopBar title={route.name} />
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
            default:
              iconName = "help-outline";
          }
          
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

      {/* TRACK RIDE BUTTON WITH GLOW EFFECT - Glows for BOTH active AND pending */}
      <Tab.Screen
        name="DriverTrackRideScreen"
        component={DriverTrackRideScreen}
        options={{
          tabBarLabel: "",
          tabBarIcon: () => (
            <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
              {/* Glow effect when has active booking OR pending request */}
              {(hasActiveBooking || hasPendingRequests) && (
                <Animated.View
                  style={[
                    styles.glowRing,
                    {
                      opacity: glowOpacity,
                      transform: [{ scale: glowScale }],
                      backgroundColor: getGlowColor(),
                    }
                  ]}
                />
              )}

              {/* Main button */}
              <View style={navStyles.trackRideWrapper}>
                <Ionicons 
                  name={hasActiveBooking ? "bicycle" : "navigate"} 
                  size={28} 
                  color="#FFF" 
                />
              </View>

              {/* Indicator dot - different colors and counts for different states */}
              {(hasActiveBooking || hasPendingRequests) && (
                <View style={[
                  styles.indicatorDot,
                  { backgroundColor: hasActiveBooking ? '#FF3B30' : '#FFB37A' }
                ]}>
                  <Text style={styles.indicatorDotText}>
                    {hasActiveBooking ? '!' : hasPendingRequests ? (pendingCount > 9 ? '9+' : pendingCount) : ''}
                  </Text>
                </View>
              )}
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
    height: 45,
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
    top: -5,
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
  glowRing: {
    position: 'absolute',
    marginTop: 15,
    width: 70,
    height: 70,
    borderRadius: 35,
    zIndex: 1,
  },
  indicatorDot: {
    position: 'absolute',
    top: -2,
    right: -11,
    borderRadius: 50,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
    zIndex: 3,
  },
  indicatorDotText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
});