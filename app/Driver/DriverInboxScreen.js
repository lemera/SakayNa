import React from "react";
import { View, Text, Image } from "react-native";
import { screenStyles } from "../styles/ScreenStyles";

export default function HistoryScreen() {
  return (
    <View style={screenStyles.screenContainer}>
      <Image
        source={require("../../assets/logo-sakayna.png")}
        style={screenStyles.logo}
      />
      <Text style={screenStyles.title}>Welcome to SakayNa!</Text>
      <Text style={screenStyles.subtitle}>This is your Driver History screen</Text>
    </View>
  );
}