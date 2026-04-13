import "react-native-gesture-handler";
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  ActivityIndicator,
  Alert,
  Modal,
  Text,
  TouchableOpacity,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { supabase } from "./lib/supabase";
import { getUserSession, clearUserSession } from "./app/utils/authStorage";
import { SafeAreaProvider } from "react-native-safe-area-context";

/* ============================= */
/* Force Update Import */
/* ============================= */
import { checkAppVersion } from "./app/utils/versionChecker";
import ForceUpdateModal from "./app/components/ForceUpdateModal";

/* ============================= */
/* Screens Import */
/* ============================= */
import UserTypeScreen from "./app/UserTypeScreen.js";

import TermsScreen from "./app/TermsScreen.js";
import PrivacyScreen from "./app/PrivacyScreen.js";
// Commuter Flow
import CommuterLoginScreen from "./app/commuter/CommuterLogin.js";
import OtpScreen from "./app/commuter/OtpScreen.js";
import CommuterDetails from "./app/commuter/CommuterDetails.js";
import HomePage from "./app/commuter/HomePage.js";
import SelectDriverScreen from "./app/commuter/SelectDriverScreen";
import TrackRideScreen from "./app/commuter/TrackRideScreen.js";
import PaymentScreen from "./app/commuter/PaymentScreen.js";
import MapPickerScreen from "./app/commuter/MapPickerScreen.js";
import TransactionHistory from "./app/commuter/TransactionHistory.js";
import PaymentMethods from "./app/commuter/PaymentMethods.js";
import PointsRewards from "./app/commuter/PointsRewards.js";
import BookingDetails from "./app/commuter/BookingDetails.js";
import Support from "./app/commuter/Support.js";
import TransactionDetails from "./app/commuter/TransactionDetails.js";
import TicketDetails from "./app/commuter/TicketDetails.js";
import HelpCenter from "./app/commuter/HelpCenter.js";
import RateDriver from "./app/commuter/RateDriver.js";
import RateRide from "./app/commuter/RateRide";
import RideHistoryScreen from "./app/commuter/RideHistoryScreen.js";
import ReferralScreen from "./app/commuter/ReferralScreen.js";
import FloatingMenu from "./app/components/FloatingMenu.js";
import MenuButton from "./app/components/MenuButton.js";
import FoodStoreScreen from "./app/commuter/FoodStoreScreen";
import WithdrawalDetailsScreen from "./app/commuter/WithdrawalDetailsScreen.js";

// Driver Flow
import DriverLoginScreen from "./app/Driver/DriverLogin.js";
import DriverOtpScreen from "./app/Driver/DriverOtpScreen.js";
import DriverDetails from "./app/Driver/DriverDetails.js";
import DriverHomePage from "./app/Driver/DriverHomePage.js";
import RankingPage from "./app/Driver/RankingPage";
import DriverVerificationScreen from "./app/Driver/DriverVerificationScreen.js";
import SubscriptionScreen from "./app/Driver/SubscriptionScreen.js";
import TripDetailsScreen from "./app/Driver/TripDetailsScreen";
import ActiveRideScreen from "./app/Driver/ActiveRideScreen";
import PaymentWebView from "./app/Driver/PaymentWebView.js";
import PaymentSuccess from "./app/Driver/PaymentSuccess.js";
import DriverInboxScreen from "./app/Driver/DriverInboxScreen.js";
import DriverAccountScreen from "./app/Driver/DriverAccountScreen.js";
import RateDriverScreen from "./app/commuter/RateDriverScreen.js";
import TopRatedDriversScreen from "./app/commuter/TopRatedDrivers";
import AllTripsScreen from "./app/Driver/AllTripsScreen.js";
import RideMissionsScreen from "./app/Driver/RideMissionsScreen";
import {
  configureNotificationHandler,
  setupNotificationChannels,
  registerForPushNotifications,
  addNotificationResponseListener,
  unloadBookingSound,
} from "./lib/notifications";

// Configure notifications before rendering
configureNotificationHandler();

const Stack = createNativeStackNavigator();

/* ============================= */
/* Deep Linking Configuration */
/* ============================= */
const linking = {
  prefixes: ["sakayna://"],
  config: {
    screens: {
      PaymentSuccess: "payment-success",
      DriverHomePage: "payment-failed",
    },
  },
};

// Optional test accounts reference
const TEST_ACCOUNTS = {
  commuter: "+639171234567",
  driver: "+639178765432",
};

export default function App() {
  const notificationSub = useRef(null);

  const [appReady, setAppReady] = useState(false);
  const [initialRoute, setInitialRoute] = useState("UserType");

  /* ============================= */
  /* Force Update State - Modal Approach */
  /* ============================= */
  const [showForceUpdateModal, setShowForceUpdateModal] = useState(false);
  const [forceUpdateData, setForceUpdateData] = useState(null);

  const [showLocationDisclosure, setShowLocationDisclosure] = useState(false);
  const [locationPermissionGranted, setLocationPermissionGranted] =
    useState(false);

  const showLocationProminentDisclosure = () => {
    setShowLocationDisclosure(true);
  };

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "Permission Denied",
          "Location permission is required to use this app. Please enable it in settings.",
        );
        setLocationPermissionGranted(false);
        return false;
      }

      setLocationPermissionGranted(true);
      console.log("✅ Foreground location permission granted");
      return true;
    } catch (error) {
      console.log("Error requesting location permission:", error);
      setLocationPermissionGranted(false);
      return false;
    }
  };

  const handleAcceptDisclosure = async () => {
    setShowLocationDisclosure(false);
    await requestLocationPermission();
  };

  const handleDeclineDisclosure = () => {
    setShowLocationDisclosure(false);
    Alert.alert(
      "Location Access Required",
      "You can still open SakayNa, but map and booking features that use your current location may be limited until you allow location access.",
      [{ text: "OK" }],
    );
  };

  const checkLocationPermissionStatus = async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();

      if (status === "granted") {
        setLocationPermissionGranted(true);
        return true;
      }

      setLocationPermissionGranted(false);
      return false;
    } catch (error) {
      console.log("Error checking location permission:", error);
      setLocationPermissionGranted(false);
      return false;
    }
  };

  const requestNotificationPermission = async () => {
    try {
      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      return finalStatus === "granted";
    } catch (error) {
      console.log("Notification permission error:", error);
      return false;
    }
  };

  const checkSessionAndNavigate = async () => {
    try {
      const savedSession = await getUserSession();

      if (savedSession && savedSession.isTestAccount) {
        console.log("✅ Test account session found:", savedSession.phone);

        if (savedSession.userType === "commuter") {
          return "HomePage";
        } else if (savedSession.userType === "driver") {
          return "DriverHomePage";
        }
      }

      const userId = await AsyncStorage.getItem("user_id");

      if (!userId) {
        return "UserType";
      }

      const { data: user } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (!user) {
        await AsyncStorage.removeItem("user_id");
        await clearUserSession();
        return "UserType";
      }

      if (user.user_type === "commuter") {
        const { data: commuter } = await supabase
          .from("commuters")
          .select("id")
          .eq("id", userId)
          .maybeSingle();

        return commuter ? "HomePage" : "CommuterDetails";
      }

      if (user.user_type === "driver") {
        const { data: driver } = await supabase
          .from("drivers")
          .select("id")
          .eq("id", userId)
          .maybeSingle();

        return driver ? "DriverHomePage" : "DriverDetails";
      }

      return "UserType";
    } catch (error) {
      console.log("Session check error:", error);
      return "UserType";
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        /* ============================= */
        /* FORCE UPDATE CHECK - HIGHEST PRIORITY */
        /* ============================= */
        const versionCheck = await checkAppVersion();

        console.log("Version check result:", versionCheck);

        if (versionCheck.needsUpdate && versionCheck.isForceUpdate) {
          setForceUpdateData({
            releaseNotes: versionCheck.releaseNotes,
            updateUrl: versionCheck.updateUrl,
            currentVersion: versionCheck.currentVersion,
            minVersion: versionCheck.minVersion,
          });
          setShowForceUpdateModal(true);
          return;
        }

        /* ============================= */
        /* NORMAL APP INITIALIZATION */
        /* ============================= */
        const hasLocationPermission = await checkLocationPermissionStatus();
        if (!hasLocationPermission) {
          showLocationProminentDisclosure();
        }

        const route = await checkSessionAndNavigate();
        setInitialRoute(route);

        // === NOTIFICATION SETUP ===
        await setupNotificationChannels();

        if (typeof configureNotificationHandler === "function") {
          configureNotificationHandler();
        } else {
          console.warn("configureNotificationHandler is not available");
        }

        // Register push token for driver
        const userId = await AsyncStorage.getItem("user_id");
        if (userId) {
          const { data: user } = await supabase
            .from("users")
            .select("user_type")
            .eq("id", userId)
            .maybeSingle();

          if (user?.user_type === "driver") {
            await registerForPushNotifications(userId);
          }
        }

        // Notification tap listener
        notificationSub.current = addNotificationResponseListener(
          (response) => {
            const data = response?.notification?.request?.content?.data;
            if (data?.type === "booking_request") {
              console.log("📲 Notification tapped - Booking Request", data);
            }
          },
        );
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

  /* ============================= */
  /* MAIN APP RENDER */
  /* ============================= */
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer linking={linking}>
          <Stack.Navigator
            initialRouteName={initialRoute}
            screenOptions={{ headerShown: false }}
          >
            <Stack.Screen name="UserType" component={UserTypeScreen} />

            <Stack.Screen name="TermsScreen" component={TermsScreen} />
            <Stack.Screen name="PrivacyScreen" component={PrivacyScreen} />
            <Stack.Screen
              name="CommuterLogin"
              component={CommuterLoginScreen}
            />
            <Stack.Screen name="OtpScreen" component={OtpScreen} />
            <Stack.Screen name="CommuterDetails" component={CommuterDetails} />
            <Stack.Screen name="HomePage" component={HomePage} />
            <Stack.Screen
              name="SelectDriverScreen"
              component={SelectDriverScreen}
            />
            <Stack.Screen name="TrackRideScreen" component={TrackRideScreen} />
            <Stack.Screen name="PaymentScreen" component={PaymentScreen} />
            <Stack.Screen name="MapPicker" component={MapPickerScreen} />
            <Stack.Screen
              name="TransactionHistory"
              component={TransactionHistory}
            />
            <Stack.Screen name="PaymentMethods" component={PaymentMethods} />
            <Stack.Screen name="PointsRewards" component={PointsRewards} />
            <Stack.Screen name="BookingDetails" component={BookingDetails} />
            <Stack.Screen name="Support" component={Support} />
            <Stack.Screen
              name="TransactionDetails"
              component={TransactionDetails}
            />
            <Stack.Screen name="TicketDetails" component={TicketDetails} />
            <Stack.Screen name="HelpCenter" component={HelpCenter} />
            <Stack.Screen name="RateDriver" component={RateDriver} />
            <Stack.Screen name="RateRide" component={RateRide} />
            <Stack.Screen
              name="RideHistoryScreen"
              component={RideHistoryScreen}
            />
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

            <Stack.Screen
              name="DriverLoginScreen"
              component={DriverLoginScreen}
            />
            <Stack.Screen name="DriverOtpScreen" component={DriverOtpScreen} />
            <Stack.Screen name="DriverDetails" component={DriverDetails} />
            <Stack.Screen name="DriverHomePage" component={DriverHomePage} />
            <Stack.Screen name="RankingPage" component={RankingPage} />
            <Stack.Screen
              name="DriverVerificationScreen"
              component={DriverVerificationScreen}
            />
            <Stack.Screen
              name="SubscriptionScreen"
              component={SubscriptionScreen}
            />
            <Stack.Screen
              name="TripDetailsScreen"
              component={TripDetailsScreen}
            />
            <Stack.Screen
              name="ActiveRideScreen"
              component={ActiveRideScreen}
            />
            <Stack.Screen name="PaymentWebView" component={PaymentWebView} />
            <Stack.Screen name="PaymentSuccess" component={PaymentSuccess} />
            <Stack.Screen name="inbox" component={DriverInboxScreen} />
            <Stack.Screen name="account" component={DriverAccountScreen} />
            <Stack.Screen name="AllTripsScreen" component={AllTripsScreen} />
            <Stack.Screen name="RideMissionsScreen" component={RideMissionsScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>

      {/* Location Disclosure Modal */}
      <Modal
        visible={showLocationDisclosure}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowLocationDisclosure(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "rgba(0,0,0,0.5)",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: "white",
              borderRadius: 20,
              padding: 24,
              width: "100%",
              maxWidth: 350,
              elevation: 5,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.25,
              shadowRadius: 4,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "bold",
                color: "#183B5C",
                marginBottom: 16,
                textAlign: "center",
              }}
            >
              📍 Location Access Needed
            </Text>

            <Text
              style={{
                fontSize: 14,
                color: "#333",
                lineHeight: 20,
                marginBottom: 16,
              }}
            >
              SakayNa needs access to your location while you are using the app
              to:
            </Text>

            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, color: "#555", marginBottom: 8 }}>
                • Show your current position on the map
              </Text>
              <Text style={{ fontSize: 14, color: "#555", marginBottom: 8 }}>
                • Help you choose an accurate pickup location
              </Text>
              <Text style={{ fontSize: 14, color: "#555", marginBottom: 8 }}>
                • Find nearby drivers during booking
              </Text>
            </View>

            <Text
              style={{
                fontSize: 12,
                color: "#888",
                fontStyle: "italic",
                marginBottom: 20,
                textAlign: "center",
              }}
            >
              Your location is only used while the app is open and in use.
            </Text>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: "#ccc",
                  paddingVertical: 12,
                  borderRadius: 8,
                  alignItems: "center",
                }}
                onPress={handleDeclineDisclosure}
              >
                <Text style={{ color: "#333", fontWeight: "600" }}>
                  NOT NOW
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: "#183B5C",
                  paddingVertical: 12,
                  borderRadius: 8,
                  alignItems: "center",
                }}
                onPress={handleAcceptDisclosure}
              >
                <Text style={{ color: "#fff", fontWeight: "600" }}>
                  CONTINUE
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Force Update Modal - This will show on top of everything */}
      <ForceUpdateModal
        visible={showForceUpdateModal}
        releaseNotes={forceUpdateData?.releaseNotes}
        updateUrl={forceUpdateData?.updateUrl}
        currentVersion={forceUpdateData?.currentVersion}
        minVersion={forceUpdateData?.minVersion}
      />
    </GestureHandlerRootView>
  );
}
