import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import CommuterLoginScreen from './app/commuter/CommuterLogin.js';
import UserTypeScreen from './app/UserTypeScreen.js';
import SplashScreen from './app/SplashScreen.js';
import OtpScreen from './app/commuter/OtpScreen.js';
import CommuterDetails from './app/commuter/CommuterDetails.js';
import HomePage from "./app/commuter/HomePage";

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Splash" component={SplashScreen} />
          <Stack.Screen name="UserType" component={UserTypeScreen} />
          <Stack.Screen name="CommuterLogin" component={CommuterLoginScreen} />
          <Stack.Screen name="OtpScreen" component={OtpScreen} />
          <Stack.Screen name="CommuterDetails" component={CommuterDetails} />
          <Stack.Screen name="HomePage" component={HomePage} />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}