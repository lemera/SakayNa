
import 'react-native-gesture-handler';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

/* ============================= */
/* Screens */
/* ============================= */

import SplashScreen from './app/SplashScreen.js';
import UserTypeScreen from './app/UserTypeScreen.js';


/* ============================= */
/* Commuter Flow */
/* ============================= */

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
import Promos from './app/commuter/Promos.js';
import PointsRewards from './app/commuter/PointsRewards.js';
import BookingDetails from './app/commuter/BookingDetails.js';
import Support from './app/commuter/Support.js';
import TransactionDetails from './app/commuter/TransactionDetails.js';
import TicketDetails from './app/commuter/TicketDetails.js';
import HelpCenter from './app/commuter/HelpCenter.js';
import RateDriver from './app/commuter/RateDriver.js';
import RateRide from './app/commuter/RateRide';


/* ============================= */
/* Driver Flow */
/* ============================= */

import DriverLoginScreen from './app/Driver/DriverLogin.js';
import DriverOtpScreen from './app/Driver/DriverOtpScreen.js';
import DriverDetails from './app/Driver/DriverDetails.js';
import DriverHomePage from './app/Driver/DriverHomePage.js';
import RankingPage from "./app/Driver/RankingPage";
import DriverVerificationScreen from './app/Driver/DriverVerificationScreen.js';
import SubscriptionScreen from './app/Driver/SubscriptionScreen.js';
import TripDetailsScreen from "./app/Driver/TripDetailsScreen";
import ActiveRideScreen from './app/Driver/ActiveRideScreen';
const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>

          {/* ============================= */}
          {/* Splash (App Entry Point) */}
          {/* ============================= */}
          <Stack.Screen name="Splash" component={SplashScreen} />

          {/* ============================= */}
          {/* User Type Selection */}
          {/* ============================= */}
          <Stack.Screen name="UserType" component={UserTypeScreen} />

          {/* ============================= */}
          {/* Commuter Flow */}
          {/* ============================= */}
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
          <Stack.Screen name="Promos" component={Promos} />
          <Stack.Screen name="PointsRewards" component={PointsRewards} />
          <Stack.Screen name="BookingDetails" component={BookingDetails} />
          <Stack.Screen name="Support" component={Support} />
          <Stack.Screen name="TransactionDetails" component={TransactionDetails} />
          <Stack.Screen name="TicketDetails" component={TicketDetails} />
          <Stack.Screen name="HelpCenter" component={HelpCenter} />
          <Stack.Screen name="RateDriver" component={RateDriver} />
          <Stack.Screen name="RateRide" component={RateRide} />
          


          {/* ============================= */}
          {/* Driver Flow */}
          {/* ============================= */}
          <Stack.Screen name="DriverLoginScreen" component={DriverLoginScreen} />
          <Stack.Screen name="DriverOtpScreen" component={DriverOtpScreen} />
          <Stack.Screen name="DriverDetails" component={DriverDetails} />
          <Stack.Screen name="DriverHomePage" component={DriverHomePage} />
          <Stack.Screen name="RankingPage" component={RankingPage} />
          <Stack.Screen name="DriverVerificationScreen" component={DriverVerificationScreen} />
          <Stack.Screen name="SubscriptionScreen" component={SubscriptionScreen} />
          <Stack.Screen name="TripDetailsScreen" component={TripDetailsScreen} />
          <Stack.Screen name="ActiveRideScreen" component={ActiveRideScreen} />
          {/* <Stack.Screen name="DriverHome" component={DriverHomeScreen} />
          <Stack.Screen name="DriverTrackRide" component={DriverTrackRideScreen} /> */}

        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}