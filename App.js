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

/* 🔐 Security (PIN System) */
import CreatePinScreen from './app/CreatePinScreen.js';
import ConfirmPinScreen from './app/ConfirmPinScreen.js';
import PinLockScreen from './app/PinLockScreen.js';

/* ============================= */
/* Commuter Flow */
/* ============================= */

import CommuterLoginScreen from './app/commuter/CommuterLogin.js';
import OtpScreen from './app/commuter/OtpScreen.js';
import CommuterDetails from './app/commuter/CommuterDetails.js';
import HomePage from "./app/commuter/HomePage";
import SelectDriverScreen from "./app/commuter/SelectDriverScreen";
import TrackRideScreen from "./app/commuter/TrackRideScreen.js";
import PaymentScreen from "./app/commuter/PaymentScreen.js";

/* Help & FAQ */
import HelpScreen from './app/commuter/HelpScreen.js';
import FAQScreen from './app/commuter/FAQScreen.js';

/* ============================= */
/* Driver Flow */
/* ============================= */

import DriverLoginScreen from './app/Driver/DriverLogin.js';
import DriverOtpScreen from './app/Driver/DriverOtpScreen.js';
import DriverDetails from './app/Driver/DriverDetails.js';
import DriverHomePage from './app/Driver/DriverHomePage.js';
import RankingPage from "./app/Driver/RankingPage";
import DriverVerificationScreen from './app/Driver/DriverVerificationScreen.js';

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
          {/* 🔐 Security Layer */}
          {/* ============================= */}
          <Stack.Screen name="CreatePinScreen" component={CreatePinScreen} />
          <Stack.Screen name="ConfirmPinScreen" component={ConfirmPinScreen} />
          <Stack.Screen name="PinLockScreen" component={PinLockScreen} />

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

          {/* Help & FAQ (With Header) */}
          <Stack.Screen
            name="Help"
            component={HelpScreen}
            options={{ headerShown: true, title: "Help & Support" }}
          />
          <Stack.Screen
            name="FAQ"
            component={FAQScreen}
            options={{ headerShown: true, title: "FAQ" }}
          />

          {/* ============================= */}
          {/* Driver Flow */}
          {/* ============================= */}
          <Stack.Screen name="DriverLoginScreen" component={DriverLoginScreen} />
          <Stack.Screen name="DriverOtpScreen" component={DriverOtpScreen} />
          <Stack.Screen name="DriverDetails" component={DriverDetails} />
          <Stack.Screen name="DriverHomePage" component={DriverHomePage} />
          <Stack.Screen name="RankingPage" component={RankingPage} />
          <Stack.Screen name="DriverVerificationScreen" component={DriverVerificationScreen} />

        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}