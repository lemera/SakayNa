import React, { useState } from "react";
import { View, Image, Pressable } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

import HomeScreen from "./HomeScreen";
import WalletScreen from "./WalletScreen";
import AccountScreen from "./AccountScreen";
import TrackRideScreen from "./TrackRideScreen";
import InboxScreen from "./InboxScreen";
import navStyles from "../styles/NavStyles";

const Tab = createBottomTabNavigator();

// Custom TrackRide button 
const TrackRideButton = ({ accessibilityState }) => {
  const navigation = useNavigation();
  const [pressed, setPressed] = useState(false);
  const isActive = accessibilityState?.selected;

  return (
    <Pressable
      onPress={() => navigation.navigate("TrackRide")}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        navStyles.trackRideButton,
        {
          backgroundColor: pressed || isActive ? "#E97A3E" : "#183B5C",
          transform: [{ scale: pressed ? 0.95 : 1 }],
        },
      ]}
    >
      <Ionicons name="navigate" size={30} color="#fff" />
    </Pressable>
  );
};

export default function HomePage() {
  const navigation = useNavigation();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: "#fff", elevation: 0, shadowOpacity: 0.1 },
        headerTitleStyle: { fontWeight: "bold", fontSize: 20, color: "#183B5C" },
        headerTitleAlign: "center",
        headerLeft: () => (
          <View style={navStyles.headerContainer}>
            <Image source={require("../../assets/logo-sakayna.png")} style={navStyles.logo} />
          </View>
        ),
        headerRight: () => (
          <Pressable onPress={() => navigation.navigate("Help")} style={{ marginRight: 15 }}>
            <Ionicons name="help-circle-outline" size={28} color="#183B5C" />
          </Pressable>
        ),
        tabBarActiveTintColor: "#E97A3E",
        tabBarInactiveTintColor: "#183B5C",
        tabBarStyle: navStyles.tabBar,
        sceneContainerStyle: { backgroundColor: "transparent" },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          switch (route.name) {
            case "Home":
              iconName = focused ? "home" : "home-outline";
              break;
            case "Wallet":
              iconName = focused ? "wallet" : "wallet-outline";
              break;
            case "Inbox":
              iconName = focused ? "chatbubbles" : "chatbubbles-outline";
              break;
            case "Account":
              iconName = focused ? "person" : "person-outline";
              break;
          }
          return route.name !== "TrackRide" ? <Ionicons name={iconName} size={size} color={color} /> : null;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Wallet" component={WalletScreen} />

      {/* TrackRide button in center */}
      <Tab.Screen
        name="TrackRide"
        component={TrackRideScreen}
        options={{
          tabBarLabel: "",
          tabBarButton: (props) => <TrackRideButton {...props} />,
          // Always show bottom tab bar
          tabBarStyle: navStyles.tabBar,
        }}
      />

      <Tab.Screen name="Inbox" component={InboxScreen} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}