import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  FlatList,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import GCashLogo from "../../assets/gcash.png";

import { styles, CARD_WIDTH } from "../styles/PaymentScreenStyles";

export default function PaymentScreen({ route, navigation }) {
  const { driver, pickupAddress, dropoffAddress, kilometers = 0, qty = 1 } =
    route.params;

  const [selectedPayment, setSelectedPayment] = useState("GCash");
  const [payPressed, setPayPressed] = useState(false);
  const flatListRef = useRef();

  const farePerKm = kilometers <= 1 ? 15 : 20;
  const calculatedFare = kilometers <= 1 ? 15 : kilometers * farePerKm;
  const totalFare = calculatedFare * qty;

const handlePayment = () => {
  // Demo ride data
  const demoRide = {
    driver: { name: "Juan Dela Cruz", vehicle: "Toyota Vios", plate: "XYZ123" },
    pickupAddress: "Manila City",
    dropoffAddress: "Intramuros",
    pickupCoordinates: { latitude: 14.5995, longitude: 120.9842 },
    dropoffCoordinates: { latitude: 14.601, longitude: 120.99 },
    kilometers: kilometers,
    qty: qty,
  };

  Alert.alert(
    "Payment Successful",
    `You paid ₱${totalFare.toFixed(2)} via ${selectedPayment} for ${qty} passenger(s).`,
    [
      {
        text: "OK",
        onPress: () =>
          navigation.navigate("TrackRide", demoRide), // Pass demo ride
      },
    ]
  );
};

  const handleComingSoon = (platform) => {
    Alert.alert("Coming Soon", `${platform} payment is coming soon!`);
  };

  const paymentMethods = [
    {
      type: "GCash",
      logo: <Image source={GCashLogo} style={styles.platformLogo} />,
      disabled: false,
    },
    {
      type: "Cash",
      logo: <Ionicons name="cash-outline" size={32} color="#183B5C" />,
      disabled: false,
    },
    {
      type: "PayMaya",
      logo: <Ionicons name="card-outline" size={32} color="#AAA" />,
      disabled: true,
    },
    {
      type: "Credit Card",
      logo: <Ionicons name="card-outline" size={32} color="#AAA" />,
      disabled: true,
    },
  ];

  const renderPaymentItem = ({ item }) => {
    const isSelected = selectedPayment === item.type;

    if (item.disabled) {
      return (
        <TouchableOpacity
          style={[styles.platformCard, styles.platformCardDisabled]}
          onPress={() => handleComingSoon(item.type)}
        >
          {item.logo}
          <Text style={[styles.platformText, { color: "#AAA" }]}>{item.type}</Text>
          <Text style={styles.comingSoonText}>Coming Soon</Text>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        style={[styles.platformCard, isSelected && styles.platformCardSelected]}
        onPress={() => setSelectedPayment(item.type)}
      >
        {item.logo}
        {item.type !== "GCash" && <Text style={styles.platformText}>{item.type}</Text>}
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 30 }}>
      {/* Header */}
      <LinearGradient colors={["#183B5C", "#1F5A8C"]} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment</Text>
      </LinearGradient>

      {/* Driver Info */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Driver Info</Text>
        <Text style={styles.infoText}>Name: {driver.name}</Text>
        <Text style={styles.infoText}>Vehicle: {driver.vehicle}</Text>
        <Text style={styles.infoText}>Plate: {driver.plate}</Text>
      </View>

      {/* Ride Info */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Ride Details</Text>
        <Text style={styles.infoText}>From: {pickupAddress || "Unknown"}</Text>
        <Text style={styles.infoText}>To: {dropoffAddress || "Unknown"}</Text>
        <Text style={styles.infoText}>Distance: {kilometers?.toFixed(2)} km</Text>
        <Text style={styles.infoText}>Passengers: {qty}</Text>
        <Text style={styles.infoText}>Fare per km: ₱{farePerKm.toFixed(2)} per passenger</Text>
        <Text style={styles.totalText}>Total Fare: ₱{totalFare.toFixed(2)}</Text>
      </View>

      {/* Payment Methods */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Select Payment Method</Text>
        <FlatList
          ref={flatListRef}
          horizontal
          data={paymentMethods}
          renderItem={renderPaymentItem}
          keyExtractor={(item) => item.type}
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_WIDTH}
          decelerationRate="fast"
          contentContainerStyle={{ paddingVertical: 10, paddingLeft: 20 }}
        />
      </View>

      {/* Pay Now Button */}
      <TouchableOpacity
        style={[styles.payButton, payPressed && { backgroundColor: "#E97A3E" }]}
        onPress={handlePayment}
        activeOpacity={0.8}
        onPressIn={() => setPayPressed(true)}
        onPressOut={() => setPayPressed(false)}
      >
        <Text style={styles.payButtonText}>Pay Now</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}