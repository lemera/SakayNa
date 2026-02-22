import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function DriverTrackRideScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Driver Track Ride</Text>
      <Text>Waiting for passenger...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 10,
  },
});