import React, { useState, useEffect, useRef, useCallback } from "react";
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
import { useFocusEffect } from "@react-navigation/native";

import HomeScreen from "./DriverHomeScreen";
import WalletScreen from "./DriverWalletScreen";
import InboxScreen from "./DriverInboxScreen";
import AccountScreen from "./DriverAccountScreen";
import DriverTrackRideScreen from "./DriverTrackRideScreen";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  const [pendingCount, setPendingCount] = useState(0);
  const [sound, setSound] = useState(null);
  const insets = useSafeAreaInsets();
  // Animation values
  const glowAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  // Fetch driver ID
  useEffect(() => {
    const getDriverId = async () => {
      const id = await AsyncStorage.getItem("user_id");
      console.log("📱 Driver ID from storage:", id);
      setDriverId(id);
    };
    getDriverId();
  }, []);

  // Enhanced fetch unread count with error handling
  const fetchUnreadCount = async () => {
    if (!driverId) {
      console.log("⚠️ No driver ID yet, skipping fetch");
      return;
    }
    
    try {
      console.log("🔍 Fetching unread notifications for driver:", driverId);
      
      const { data, error, count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", driverId)
        .eq("user_type", "driver")
        .eq("is_read", false);

      if (error) throw error;
      
      console.log("📊 Unread notifications count:", count);
      setUnreadCount(count || 0);
      
      // Also fetch actual unread notifications for debugging
      const { data: unreadData } = await supabase
        .from("notifications")
        .select("id, title, is_read")
        .eq("user_id", driverId)
        .eq("user_type", "driver")
        .eq("is_read", false)
        .limit(5);
      
      if (unreadData && unreadData.length > 0) {
        console.log("📬 Unread notifications:", unreadData.map(n => n.title));
      }
      
    } catch (err) {
      console.log("❌ Error fetching unread count:", err.message);
    }
  };

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
            
            // Trigger alert for NEW pending requests
            if (payload.eventType === 'INSERT' && payload.new?.status === 'pending') {
              console.log("✅🔥 NEW PENDING REQUEST!");
              triggerBookingAlert();
            } 
            // Trigger alert for accepted bookings (active ride)
            else if (payload.new?.status === 'accepted') {
              console.log("✅🔥 BOOKING ACCEPTED!");
              triggerBookingAlert();
            }
          }
        }
      )
      .subscribe((status) => {
        console.log("📡 Booking subscription status:", status);
      });

    return () => {
      console.log("🧹 Cleaning up booking subscriptions");
      clearInterval(intervalId);
      subscription.unsubscribe();
    };
  }, [driverId]);

  // Enhanced notification subscription with auto-refresh
  useEffect(() => {
    if (!driverId) return;

    console.log("📡 Setting up notification subscription for driver:", driverId);
    
    // Initial fetch
    fetchUnreadCount();

    // Subscribe to real-time notification changes
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
          console.log("📊 Payload:", payload.new);
          
          // Immediately fetch updated count
          fetchUnreadCount();
          
          // Trigger haptic for new notifications
          if (payload.eventType === 'INSERT' && !payload.new?.is_read) {
            // Vibrate for new notification
            Vibration.vibrate(200);
            if (Platform.OS === 'ios') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
          }
        }
      )
      .subscribe((status) => {
        console.log("📡 Notification subscription status:", status);
      });

    // Set up periodic check as backup (every 30 seconds)
    const periodicCheck = setInterval(() => {
      console.log("⏰ Periodic notification check");
      fetchUnreadCount();
    }, 30000);

    return () => {
      console.log("🧹 Cleaning up notification subscription");
      notifSubscription.unsubscribe();
      clearInterval(periodicCheck);
    };
  }, [driverId]);

  // Refresh unread count when Inbox screen is focused
  useFocusEffect(
    useCallback(() => {
      console.log("📱 Screen focused - refreshing unread count");
      if (driverId) {
        fetchUnreadCount();
      }
    }, [driverId])
  );

  // Animation effect - enhanced glow for pending requests
  useEffect(() => {
    const shouldGlow = hasActiveBooking || hasPendingRequests;
    console.log("🎨 Animation effect - shouldGlow:", shouldGlow, 
                "Active:", hasActiveBooking, "Pending:", hasPendingRequests);
    
    if (shouldGlow) {
      startEnhancedGlowAnimation();
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

  const startEnhancedGlowAnimation = () => {
    console.log("✨ Starting enhanced glow animation");
    
    // Pulse animation for the button itself
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Glow animation for the ring
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.3,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Subtle rotation for the icon when pending
    if (hasPendingRequests && !hasActiveBooking) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(rotateAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(rotateAnim, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  };

  const stopGlowAnimation = () => {
    console.log("🛑 Stopping glow animation");
    glowAnim.stopAnimation();
    pulseAnim.stopAnimation();
    rotateAnim.stopAnimation();
    glowAnim.setValue(0);
    pulseAnim.setValue(1);
    rotateAnim.setValue(0);
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
      
      // Check for PENDING requests
      const { data: pendingData, error: pendingError } = await supabase
        .from("booking_requests")
        .select("id, status")
        .eq("driver_id", driverId)
        .eq("status", "pending");

      if (pendingError) throw pendingError;
      
      const hasActive = activeData && activeData.length > 0;
      const hasPending = pendingData && pendingData.length > 0;
      const pendingCountValue = pendingData?.length || 0;
      
      console.log("📊 Results - Active:", hasActive, "Pending:", hasPending, "Count:", pendingCountValue);
      
      setHasActiveBooking(hasActive);
      setHasPendingRequests(hasPending);
      setPendingCount(pendingCountValue);
      
    } catch (err) {
      console.log("Error checking bookings:", err);
    }
  };

  // Animation interpolations
  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.9, 0.3]
  });

  const glowScale = glowAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.3, 1]
  });

  const iconRotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '10deg']
  });

  // Determine glow color and style based on state
  const getGlowConfig = () => {
    if (hasActiveBooking) {
      return {
        color: '#FF6B6B',
        intensity: 0.9,
        size: 75,
        icon: 'bicycle',
        message: 'Active Ride'
      };
    }
    if (hasPendingRequests) {
      return {
        color: '#FFB37A',
        intensity: 1.0,
        size: 80,
        icon: 'navigate',
        message: `${pendingCount} Request${pendingCount > 1 ? 's' : ''}`
      };
    }
    return {
      color: '#FFB37A',
      intensity: 0.5,
      size: 70,
      icon: 'navigate',
      message: ''
    };
  };

  const glowConfig = getGlowConfig();

  // Debug log for unread count
  console.log("🔔 Current unread count:", unreadCount);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false, // This removes all headers globally
        tabBarActiveTintColor: "#E97A3E",
        tabBarInactiveTintColor: "#183B5C",
        tabBarStyle: [
  navStyles.tabBar,
  {
    height: 60 + insets.bottom,
    paddingBottom: Math.max(insets.bottom, 8),
    paddingTop: 8,
  },
],
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
                      {unreadCount > 99 ? '99+' : unreadCount > 9 ? '9+' : unreadCount}
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
        name="Home" 
        component={HomeScreen}
        listeners={{
          tabPress: () => {
            console.log("🏠 Home tab pressed");
          }
        }}
      />
      <Tab.Screen name="Wallet" component={WalletScreen} />

      {/* TRACK RIDE BUTTON WITH ENHANCED GLOW EFFECT */}
      <Tab.Screen
        name="Track Rides"
        component={DriverTrackRideScreen}
        options={{
          tabBarLabel: "",
          tabBarIcon: () => (
            <View style={{ position: 'relative', alignItems: 'center', marginTop: -50, justifyContent: 'center' }}>
              {/* Outer glow rings - multiple for enhanced effect */}
              {(hasActiveBooking || hasPendingRequests) && (
                <>
                  {/* First glow ring */}
                  <Animated.View
                    style={[
                      styles.glowRing,
                      {
                        width: glowConfig.size,
                        height: glowConfig.size,
                        borderRadius: glowConfig.size / 2,
                        opacity: glowOpacity,
                        transform: [{ scale: glowScale }],
                        backgroundColor: glowConfig.color,
                      }
                    ]}
                  />
                  {/* Second smaller ring for depth */}
                  <Animated.View
                    style={[
                      styles.glowRing,
                      {
                        width: glowConfig.size - 10,
                        height: glowConfig.size - 10,
                        borderRadius: (glowConfig.size - 10) / 2,
                        opacity: glowOpacity * 0.7,
                        transform: [{ scale: glowScale }],
                        backgroundColor: glowConfig.color,
                      }
                    ]}
                  />
                </>
              )}

              {/* Main button with pulse effect */}
              <Animated.View
                style={[
                  navStyles.trackRideWrapper,
                  (hasActiveBooking || hasPendingRequests) && {
                    transform: [{ scale: pulseAnim }],
                  }
                ]}
              >
                <Animated.View style={{
                  transform: hasPendingRequests && !hasActiveBooking 
                    ? [{ rotate: iconRotation }] 
                    : []
                }}>
                  <Ionicons 
                    name={glowConfig.icon} 
                    size={28} 
                    color="#FFF" 
                  />
                </Animated.View>
              </Animated.View>

              {/* Status indicator - different for active vs pending */}
              {(hasActiveBooking || hasPendingRequests) && (
                <View style={[
                  styles.indicatorDot,
                  { 
                    backgroundColor: hasActiveBooking ? '#FF3B30' : '#FFB37A',
                    borderWidth: 2,
                    borderColor: '#FFF',
                  }
                ]}>
                  <Text style={styles.indicatorDotText}>
                    {hasActiveBooking ? '⚡' : hasPendingRequests ? pendingCount : ''}
                  </Text>
                </View>
              )}
            </View>
          ),
        }}
      />

      <Tab.Screen 
        name="Inbox" 
        component={InboxScreen}
        listeners={{
          tabPress: () => {
            console.log("📬 Inbox tab pressed");
            // Refresh unread count when Inbox is opened
            if (driverId) {
              setTimeout(() => fetchUnreadCount(), 100);
            }
          }
        }}
      />
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
    paddingHorizontal: 25,
    paddingBottom: 5,
    marginTop: 20,
    marginBottom: -40,
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
    zIndex: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  indicatorDot: {
    position: 'absolute',
    top: -2,
    right: -11,
    borderRadius: 50,
    minWidth: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  indicatorDotText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  statusMessage: {
    position: 'absolute',
    bottom: -20,
    backgroundColor: 'rgba(223, 43, 43, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    zIndex: 4,
  },
  statusMessageText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '600',
  },
});