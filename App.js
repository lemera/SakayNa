import 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';


import CommuterLoginScreen from './app/commuter/CommuterLogin.js';
import UserTypeScreen from './app/UserTypeScreen.js';
import SplashScreen from './app/SplashScreen.js';
const Stack = createNativeStackNavigator();


/* ------------------ App Navigation ------------------ */
export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="UserType" component={UserTypeScreen} />
        <Stack.Screen name="CommuterLogin" component={CommuterLoginScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}



