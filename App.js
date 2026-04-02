import "react-native-gesture-handler";
import React, { useEffect, useRef, useState } from "react";
import { View, ActivityIndicator, Alert, Modal, Text, TouchableOpacity } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { supabase } from './lib/supabase'; // Make sure this path is correct
import { getUserSession, clearUserSession } from './app/utils/authStorage'; // ✅ Import auth storage

/* ============================= */
/* Screens Import */
/* ============================= */
import UserTypeScreen from './app/UserTypeScreen.js';

// Commuter Flow
import CommuterLoginScreen from './app/commuter/CommuterLogin.js';
import OtpScreen from './app/commuter/OtpScreen.js';
import CommuterDetails from './app/commuter/CommuterDetails.js';
import HomePage from './app/commuter/HomePage.js';
import SelectDriverScreen from './app/commuter/SelectDriverScreen';
import TrackRideScreen from './app/commuter/TrackRideScreen.js';
import PaymentScreen from './app/commuter/PaymentScreen.js';
import MapPickerScreen from './app/commuter/MapPickerScreen.js';
import TransactionHistory from './app/commuter/TransactionHistory.js';
import PaymentMethods from './app/commuter/PaymentMethods.js';
import PointsRewards from './app/commuter/PointsRewards.js';
import BookingDetails from './app/commuter/BookingDetails.js';
import Support from './app/commuter/Support.js';
import TransactionDetails from './app/commuter/TransactionDetails.js';
import TicketDetails from './app/commuter/TicketDetails.js';
import HelpCenter from './app/commuter/HelpCenter.js';
import RateDriver from './app/commuter/RateDriver.js';
import RateRide from './app/commuter/RateRide';
import RideHistoryScreen from './app/commuter/RideHistoryScreen.js';
import ReferralScreen from './app/commuter/ReferralScreen.js';
import FloatingMenu from './app/components/FloatingMenu.js';
import MenuButton from './app/components/MenuButton.js';
import FoodStoreScreen from './app/commuter/FoodStoreScreen';
import WithdrawalDetailsScreen from './app/commuter/WithdrawalDetailsScreen.js';


// Driver Flow
import DriverLoginScreen from './app/Driver/DriverLogin.js';
import DriverOtpScreen from './app/Driver/DriverOtpScreen.js';
import DriverDetails from './app/Driver/DriverDetails.js';
import DriverHomePage from './app/Driver/DriverHomePage.js';
import RankingPage from './app/Driver/RankingPage';
import DriverVerificationScreen from './app/Driver/DriverVerificationScreen.js';
import SubscriptionScreen from './app/Driver/SubscriptionScreen.js';
import TripDetailsScreen from './app/Driver/TripDetailsScreen';
import ActiveRideScreen from './app/Driver/ActiveRideScreen';
import PaymentWebView from './app/Driver/PaymentWebView.js';
import PaymentSuccess from './app/Driver/PaymentSuccess.js';
import DriverInboxScreen from "./app/Driver/DriverInboxScreen.js";
import DriverAccountScreen from "./app/Driver/DriverAccountScreen.js";
import RateDriverScreen from './app/commuter/RateDriverScreen.js';
import TopRatedDriversScreen from './app/commuter/TopRatedDrivers';
import AllTripsScreen from "./app/Driver/AllTripsScreen.js";
import {
  configureNotificationHandler,
  setupNotificationChannels,
  registerForPushNotifications,
  addNotificationResponseListener,
  unloadBookingSound,
} from './lib/notifications';

// ── Call this BEFORE your navigation tree renders ─────────────────────────────
configureNotificationHandler();

const Stack = createNativeStackNavigator();

/* ============================= */
/* Deep Linking Configuration */
/* ============================= */
const linking = {
  prefixes: ['sakayna://'],
  config: {
    screens: {
      PaymentSuccess: 'payment-success',
      DriverHomePage: 'payment-failed',
    },
  },
};

// ✅ Test accounts list (same as in config/testAccounts.js)
const TEST_ACCOUNTS = {
  commuter: '+639171234567',
  driver: '+639178765432',
};

export default function App() {
  const notificationSub = useRef(null);
  const [appReady, setAppReady] = useState(false);
  const [initialRoute, setInitialRoute] = useState('UserType');
  
  // State for prominent disclosure modal
  const [showLocationDisclosure, setShowLocationDisclosure] = useState(false);
  const [pendingLocationRequest, setPendingLocationRequest] = useState(false);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState(false);

  // Function to show prominent disclosure first
  const showLocationProminentDisclosure = () => {
    setShowLocationDisclosure(true);
  };

  // Function to request location permission after disclosure is accepted
  const requestLocationPermission = async () => {
    try {
      // Request foreground permission
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      
      if (foregroundStatus !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Location permission is required to use this app. Please enable it in settings.'
        );
        return false;
      }
      
      // Request background permission (required for ride tracking when app is minimized)
      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      
      if (backgroundStatus === 'granted') {
        setLocationPermissionGranted(true);
        console.log('✅ Background location permission granted');
      } else {
        console.log('⚠️ Background location permission not granted - app will still work but with limitations');
      }
      
      return true;
    } catch (error) {
      console.log('Error requesting location permission:', error);
      return false;
    }
  };

  // Handle user accepting the disclosure
  const handleAcceptDisclosure = async () => {
    setShowLocationDisclosure(false);
    setPendingLocationRequest(false);
    await requestLocationPermission();
  };

  // Handle user declining the disclosure
  const handleDeclineDisclosure = () => {
    setShowLocationDisclosure(false);
    setPendingLocationRequest(false);
    Alert.alert(
      'Location Access Required',
      'You need to accept location access to use SakayNa. You can enable it later in settings.',
      [
        {
          text: 'OK',
          onPress: () => {
            // App can still work but location features will be limited
            console.log('User declined location permission');
          }
        }
      ]
    );
  };

  // Check if location permission is already granted
  const checkLocationPermissionStatus = async () => {
    try {
      const { status: foregroundStatus } = await Location.getForegroundPermissionsAsync();
      const { status: backgroundStatus } = await Location.getBackgroundPermissionsAsync();
      
      if (foregroundStatus === 'granted') {
        setLocationPermissionGranted(true);
        return true;
      }
      return false;
    } catch (error) {
      console.log('Error checking location permission:', error);
      return false;
    }
  };

  // Function to request notification permission
  const requestNotificationPermission = async () => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      return finalStatus === 'granted';
    } catch (error) {
      console.log('Notification permission error:', error);
      return false;
    }
  };

  // ✅ Updated function to check session and determine initial route (with test account support)
  const checkSessionAndNavigate = async () => {
    try {
      // ✅ First check if there's a saved test account session
      const savedSession = await getUserSession();
      
      if (savedSession && savedSession.isTestAccount) {
        console.log("✅ Test account session found:", savedSession.phone);
        
        // For test accounts, directly return the appropriate screen
        if (savedSession.userType === 'commuter') {
          return 'HomePage';
        } else if (savedSession.userType === 'driver') {
          return 'DriverHomePage';
        }
      }

      // ✅ Check for normal user session
      const userId = await AsyncStorage.getItem('user_id');

      if (!userId) {
        return 'UserType';
      }

      // Check users table
      const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (!user) {
        await AsyncStorage.removeItem('user_id');
        await clearUserSession(); // Clear test session too
        return 'UserType';
      }

      // Commuter flow
      if (user.user_type === 'commuter') {
        const { data: commuter } = await supabase
          .from('commuters')
          .select('id')
          .eq('id', userId)
          .maybeSingle();

        if (commuter) {
          return 'HomePage';
        } else {
          return 'CommuterDetails';
        }
      }

      // Driver flow
      if (user.user_type === 'driver') {
        const { data: driver } = await supabase
          .from('drivers')
          .select('id')
          .eq('id', userId)
          .maybeSingle();

        if (driver) {
          return 'DriverHomePage';
        } else {
          return 'DriverDetails';
        }
      }

      return 'UserType';
    } catch (error) {
      console.log('Session check error:', error);
      return 'UserType';
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        // 1. Check if location permission is already granted
        const hasLocationPermission = await checkLocationPermissionStatus();
        
        // 2. If not granted, show prominent disclosure before requesting
        if (!hasLocationPermission) {
          setPendingLocationRequest(true);
          showLocationProminentDisclosure();
        }

        // 3. Check session and get initial route
        const route = await checkSessionAndNavigate();
        setInitialRoute(route);

        // 4. Setup notifications (don't wait for location permission)
        const granted = await requestNotificationPermission();

        // 5. Setup notification channels
        await setupNotificationChannels();

        // 6. Register token only if allowed (only for real users, not test accounts)
        if (granted) {
          const savedSession = await getUserSession();
          const driverId = await AsyncStorage.getItem("user_id");
          
          // Only register if it's not a test account
          if (driverId && !(savedSession && savedSession.isTestAccount)) {
            await registerForPushNotifications(driverId);
          }
        }

        // 7. Listen for notification taps
        notificationSub.current = addNotificationResponseListener((response) => {
          const data = response?.notification?.request?.content?.data;
          if (data?.type === "booking_request") {
            console.log("📲 Notification tapped — booking request", data);
          }
        });
      } catch (error) {
        console.log("App init error:", error);
      } finally {
        setAppReady(true);
      }
    };

    init();

    return () => {
      notificationSub.current?.remove?.();
      unloadBookingSound();
    };
  }, []);

  if (!appReady) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "#fff",
          }}
        >
          <ActivityIndicator size="large" color="#183B5C" />
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer linking={linking}>
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{ headerShown: false }}
        >
          {/* Auth Screens */}
          <Stack.Screen name="UserType" component={UserTypeScreen} />

          {/* Commuter Flow */}
          <Stack.Screen name="CommuterLogin" component={CommuterLoginScreen} />
          <Stack.Screen name="OtpScreen" component={OtpScreen} />
          <Stack.Screen name="CommuterDetails" component={CommuterDetails} />
          <Stack.Screen name="HomePage" component={HomePage} />
          <Stack.Screen name="SelectDriverScreen" component={SelectDriverScreen} />
          <Stack.Screen name="TrackRideScreen" component={TrackRideScreen} />
          <Stack.Screen name="PaymentScreen" component={PaymentScreen} />
          <Stack.Screen name="MapPicker" component={MapPickerScreen} />
          <Stack.Screen name="TransactionHistory" component={TransactionHistory} />
          <Stack.Screen name="PaymentMethods" component={PaymentMethods} />
          <Stack.Screen name="PointsRewards" component={PointsRewards} />
          <Stack.Screen name="BookingDetails" component={BookingDetails} />
          <Stack.Screen name="Support" component={Support} />
          <Stack.Screen name="TransactionDetails" component={TransactionDetails} />
          <Stack.Screen name="TicketDetails" component={TicketDetails} />
          <Stack.Screen name="HelpCenter" component={HelpCenter} />
          <Stack.Screen name="RateDriver" component={RateDriver} />
          <Stack.Screen name="RateRide" component={RateRide} />
          <Stack.Screen name="RideHistoryScreen" component={RideHistoryScreen} />
          <Stack.Screen name="ReferralScreen" component={ReferralScreen} />
          <Stack.Screen name="FloatingMenu" component={FloatingMenu} />
          <Stack.Screen name="MenuButton" component={MenuButton} />
          <Stack.Screen name="FoodStoreScreen" component={FoodStoreScreen} />
          <Stack.Screen
            name="WithdrawalDetails"
            component={WithdrawalDetailsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="RateDriverScreen"
            component={RateDriverScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="TopRatedDrivers"
            component={TopRatedDriversScreen}
            options={{ headerShown: false }}
          />

          {/* Driver Flow */}
          <Stack.Screen name="DriverLoginScreen" component={DriverLoginScreen} />
          <Stack.Screen name="DriverOtpScreen" component={DriverOtpScreen} />
          <Stack.Screen name="DriverDetails" component={DriverDetails} />
          <Stack.Screen name="DriverHomePage" component={DriverHomePage} />
          <Stack.Screen name="RankingPage" component={RankingPage} />
          <Stack.Screen
            name="DriverVerificationScreen"
            component={DriverVerificationScreen}
          />
          <Stack.Screen name="SubscriptionScreen" component={SubscriptionScreen} />
          <Stack.Screen name="TripDetailsScreen" component={TripDetailsScreen} />
          <Stack.Screen name="ActiveRideScreen" component={ActiveRideScreen} />
          <Stack.Screen name="PaymentWebView" component={PaymentWebView} />
          <Stack.Screen name="PaymentSuccess" component={PaymentSuccess} />
          <Stack.Screen name="inbox" component={DriverInboxScreen} />
          <Stack.Screen name="account" component={DriverAccountScreen} />
          <Stack.Screen name="AllTripsScreen" component={AllTripsScreen} />
        </Stack.Navigator>
      </NavigationContainer>

      {/* Prominent Disclosure Modal for Location */}
      <Modal
        visible={showLocationDisclosure}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowLocationDisclosure(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.5)',
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: 'white',
              borderRadius: 20,
              padding: 24,
              width: '100%',
              maxWidth: 350,
              elevation: 5,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.25,
              shadowRadius: 4,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: 'bold',
                color: '#183B5C',
                marginBottom: 16,
                textAlign: 'center',
              }}
            >
              📍 Location Access Needed
            </Text>

            <Text
              style={{
                fontSize: 14,
                color: '#333',
                lineHeight: 20,
                marginBottom: 16,
              }}
            >
              SakayNa needs access to your location even when you're not using the app to:
            </Text>

            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, color: '#555', marginBottom: 8 }}>
                • Help your driver find your exact pickup location
              </Text>
              <Text style={{ fontSize: 14, color: '#555', marginBottom: 8 }}>
                • Share your real-time location with your driver during an active ride
              </Text>
              <Text style={{ fontSize: 14, color: '#555', marginBottom: 8 }}>
                • Ensure your safety by allowing location sharing until your ride is complete
              </Text>
            </View>

            <Text
              style={{
                fontSize: 12,
                color: '#888',
                fontStyle: 'italic',
                marginBottom: 20,
                textAlign: 'center',
              }}
            >
              Your location is only shared while you have an active booking. We do not track your location when you're not using the app.
            </Text>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#ccc',
                  paddingVertical: 12,
                  borderRadius: 8,
                  alignItems: 'center',
                }}
                onPress={handleDeclineDisclosure}
              >
                <Text style={{ color: '#333', fontWeight: '600' }}>NOT NOW</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#183B5C',
                  paddingVertical: 12,
                  borderRadius: 8,
                  alignItems: 'center',
                }}
                onPress={handleAcceptDisclosure}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>CONTINUE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </GestureHandlerRootView>
  );
}