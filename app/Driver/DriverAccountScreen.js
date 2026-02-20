import React from "react";
import { View, Text } from "react-native";
import { screenStyles } from "../styles/ScreenStyles";

export default function DriverAccountScreen() {
  return (
    <View style={screenStyles.screenContainer}>
      <Text style={screenStyles.title}>Driver Account</Text>
      <Text style={screenStyles.subtitle}>Manage your profile and settings</Text>
    </View>
  );
}