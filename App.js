import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SplashScreen from './app/SplashScreen.js';
import UserTypeScreen from './app/UserTypeScreen.js';
import CommuterLoginScreen from './app/commuter/CommuterLogin.js';
import OtpScreen from './app/commuter/OtpScreen.js';
import CommuterDetails from './app/commuter/CommuterDetails.js';
import HomePage from "./app/commuter/HomePage";
import SelectDriverScreen from "./app/commuter/SelectDriverScreen";
import TrackRideScreen from "./app/commuter/TrackRideScreen.js";
import PaymentScreen from "./app/commuter/PaymentScreen.js";

import DriverLoginScreen from './app/Driver/DriverLogin.js';
import DriverOtpScreen from './app/Driver/DriverOtpScreen.js';
import DriverDetails from './app/Driver/DriverDetails.js';
import DriverCameraVerification from './app/Driver/DriverCameraVerification.js';
import DriverHomePage from './app/Driver/DriverHomePage.js';

// Help & FAQ
import HelpScreen from './app/commuter/HelpScreen.js';
import FAQScreen from './app/commuter/FAQScreen.js';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {/* Commuter Flow */}
          <Stack.Screen name="Splash" component={SplashScreen} />
          <Stack.Screen name="UserType" component={UserTypeScreen} />
          <Stack.Screen name="CommuterLogin" component={CommuterLoginScreen} />
          <Stack.Screen name="OtpScreen" component={OtpScreen} />
          <Stack.Screen name="CommuterDetails" component={CommuterDetails} />
          <Stack.Screen name="SelectDriverScreen" component={SelectDriverScreen} />
          <Stack.Screen name="TrackRideScreen" component={TrackRideScreen} />
          <Stack.Screen name="PaymentScreen" component={PaymentScreen} />
          <Stack.Screen name="HomePage" component={HomePage} />

          {/* Help & FAQ */}
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

          {/* Driver Flow */}
          <Stack.Screen name="DriverLoginScreen" component={DriverLoginScreen} />
          <Stack.Screen name="DriverOtpScreen" component={DriverOtpScreen} />
          <Stack.Screen name="DriverDetails" component={DriverDetails} />
          <Stack.Screen name="DriverCameraVerification" component={DriverCameraVerification} />
          <Stack.Screen name="DriverHomePage" component={DriverHomePage} />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}