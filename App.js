import 'react-native-gesture-handler';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

/* ============================= */
/* Screens Import */
/* ============================= */
import SplashScreen from './app/SplashScreen.js';
import UserTypeScreen from './app/UserTypeScreen.js';

// Commuter Flow
import CommuterLoginScreen from './app/commuter/CommuterLogin.js';
import OtpScreen from './app/commuter/OtpScreen.js';
import CommuterDetails from './app/commuter/CommuterDetails.js';
import HomePage from "./app/commuter/HomePage.js";
import SelectDriverScreen from "./app/commuter/SelectDriverScreen";
import TrackRideScreen from "./app/commuter/TrackRideScreen.js";
import PaymentScreen from "./app/commuter/PaymentScreen.js";
import MapPickerScreen from "./app/commuter/MapPickerScreen.js";
import TransactionHistory from "./app/commuter/TransactionHistory.js";
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
import RateDriverScreen from './app/commuter/RateDriverScreen.js';
import TopRatedDriversScreen from './app/commuter/TopRatedDrivers';
// Driver Flow
import DriverLoginScreen from './app/Driver/DriverLogin.js';
import DriverOtpScreen from './app/Driver/DriverOtpScreen.js';
import DriverDetails from './app/Driver/DriverDetails.js';
import DriverHomePage from './app/Driver/DriverHomePage.js';
import RankingPage from "./app/Driver/RankingPage";
import DriverVerificationScreen from './app/Driver/DriverVerificationScreen.js';
import SubscriptionScreen from './app/Driver/SubscriptionScreen.js';
import TripDetailsScreen from "./app/Driver/TripDetailsScreen";
import ActiveRideScreen from './app/Driver/ActiveRideScreen';
import PaymentWebView from './app/Driver/PaymentWebView.js';
import PaymentSuccess from './app/Driver/PaymentSuccess.js';

const Stack = createNativeStackNavigator();

/* ============================= */
/* Deep Linking Configuration */
/* ============================= */
const linking = {
  // Ito ang scheme na nilagay mo sa app.json
  prefixes: ['sakayna://'],
  config: {
    screens: {
      // "ScreenName": "url-path"
      PaymentSuccess: 'payment-success',
      DriverHomePage: 'payment-failed', 
    },
  },
};

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Idinagdag ang linking prop dito */}
      <NavigationContainer linking={linking}>
        <Stack.Navigator 
          initialRouteName="Splash"
          screenOptions={{ headerShown: false }}
        >

          {/* Splash & Auth */}
          <Stack.Screen name="Splash" component={SplashScreen} />
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
          <Stack.Screen name="WithdrawalDetails" component={WithdrawalDetailsScreen}options={{ headerShown: false }}/>
          <Stack.Screen name="RateDriverScreen" component={RateDriverScreen}options={{ headerShown: false }}/>
          <Stack.Screen name="TopRatedDrivers" component={TopRatedDriversScreen}options={{ headerShown: false }}/>
          {/* Driver Flow */}
          <Stack.Screen name="DriverLoginScreen" component={DriverLoginScreen} />
          <Stack.Screen name="DriverOtpScreen" component={DriverOtpScreen} />
          <Stack.Screen name="DriverDetails" component={DriverDetails} />
          <Stack.Screen name="DriverHomePage" component={DriverHomePage} />
          <Stack.Screen name="RankingPage" component={RankingPage} />
          <Stack.Screen name="DriverVerificationScreen" component={DriverVerificationScreen} />
          <Stack.Screen name="SubscriptionScreen" component={SubscriptionScreen} />
          <Stack.Screen name="TripDetailsScreen" component={TripDetailsScreen} />
          <Stack.Screen name="ActiveRideScreen" component={ActiveRideScreen} />
          <Stack.Screen name="PaymentWebView" component={PaymentWebView} />
          <Stack.Screen name="PaymentSuccess" component={PaymentSuccess} />

        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}