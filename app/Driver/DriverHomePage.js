import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import HomeScreen from "./DriverHomeScreen";
import WalletScreen from "./DriverWalletScreen";
import HistoryScreen from "./DriverHistoryScreen";
import AccountScreen from "./DriverAccountScreen";
import { navStyles } from "../styles/Driver/NavStyles";

const Tab = createBottomTabNavigator();

export default function HomePage() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#E97A3E",
        tabBarInactiveTintColor: "#183B5C",
        tabBarStyle: navStyles.tabBar,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          switch (route.name) {
            case "Home":
              iconName = focused ? "home" : "home-outline";
              break;
            case "Wallet":
              iconName = focused ? "wallet" : "wallet-outline";
              break;
            case "History":
              iconName = focused ? "time" : "time-outline";
              break;
            case "Account":
              iconName = focused ? "person" : "person-outline";
              break;
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Wallet" component={WalletScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}