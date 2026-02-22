import React from "react";
import { View, Text, Pressable, StyleSheet, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context"; // <- SafeAreaView
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import HomeScreen from "./DriverHomeScreen";
import WalletScreen from "./DriverWalletScreen";
import InboxScreen from "./DriverInboxScreen";
import AccountScreen from "./DriverAccountScreen";
import TrackRideScreen from "./DriverTrackRideScreen";

import { navStyles } from "../styles/Driver/NavStyles";

const Tab = createBottomTabNavigator();

// TopBar Component with safe area
const TopBar = ({ title, onNotificationPress }) => (
  <SafeAreaView style={styles.safeArea}>
    <View style={styles.topBar}>
      {/* Logo on the left */}
      <Image
        source={require("../../assets/logo-sakayna.png")} // replace with your logo path
        style={styles.logo}
        resizeMode="contain"
      />

      {/* Title centered */}
      <Text style={styles.topBarTitle}>{title}</Text>

      
    </View>
  </SafeAreaView>
);

export default function HomePage() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        // Show topbar for all tabs except Home
        header: ({ navigation }) =>
          route.name === "Home" ? null : (
            <TopBar
              title={route.name}
              onNotificationPress={() => alert("No new notifications")}
            />
          ),
        tabBarActiveTintColor: "#E97A3E",
        tabBarInactiveTintColor: "#183B5C",
        tabBarStyle: navStyles.tabBar,
        tabBarLabelStyle: { fontSize: 12 },
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
              iconName = focused ? "chatbubble" : "chatbubble-outline";
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

      {/* CENTER TRACK RIDE BUTTON */}
      <Tab.Screen
        name="TrackRide"
        component={TrackRideScreen}
        options={{
          tabBarLabel: "",
          tabBarIcon: ({ focused }) => (
            <View style={navStyles.trackRideWrapper}>
              <Ionicons name="navigate" size={28} color="#FFF" />
            </View>
          ),
        }}
      />

      <Tab.Screen name="Inbox" component={InboxScreen} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#FFF",
  },
  topBar: {
    height: 25, // actual content height (inside safe area)
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 15,
  },
  logo: {
    width: 40,
    height: 40,
  },
  topBarTitle: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "bold",
    color: "#183B5C",
  },

});