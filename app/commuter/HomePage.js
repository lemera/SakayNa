import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { Image, View, Text } from "react-native";

import HomeScreen from "./HomeScreen";
import WalletScreen from "./WalletScreen";
import HistoryScreen from "./HistoryScreen";
import AccountScreen from "./AccountScreen";
import navStyles from "../styles/NavStyles";

const Tab = createBottomTabNavigator();

export default function HomePage() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: {
          backgroundColor: "#ffffff",
          elevation: 0,
          shadowOpacity: 0.1,
        },

        // ✅ Make Title Bold + Change Color
        headerTitleStyle: {
          fontWeight: "bold",
          fontSize: 20,
          color: "#183B5C",
        },

        headerTitleAlign: "center", // optional (center title)

        headerLeft: () => (
          <View style={navStyles.headerContainer}>
            <Image
              source={require("../../assets/logo-sakayna.png")}
              style={navStyles.logo}
            />
          </View>
        ),

        tabBarActiveTintColor: "#E97A3E",
        tabBarInactiveTintColor: "#183B5C",
        tabBarStyle: navStyles.tabBar,
        sceneContainerStyle: {
          backgroundColor: "transparent",
        },

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
