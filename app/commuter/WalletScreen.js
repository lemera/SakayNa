import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import styles from "../styles/WalletStyles";
const { width } = Dimensions.get("window");

export default function WalletScreen() {
  const [points, setPoints] = useState(1250);
  const [transactions, setTransactions] = useState([
    { id: "1", type: "Earned", amount: 200, date: "2026-02-20" },
    { id: "2", type: "Spent", amount: 50, date: "2026-02-18" },
    { id: "3", type: "Earned", amount: 100, date: "2026-02-15" },
  ]);

  const handleRedeem = () => {
    if (points >= 500) {
      Alert.alert("Redeem Points", "You redeemed 500 points!", [
        { text: "OK", onPress: () => setPoints(points - 500) },
      ]);
      setTransactions([
        {
          id: Date.now().toString(),
          type: "Spent",
          amount: 500,
          date: new Date().toISOString().split("T")[0],
        },
        ...transactions,
      ]);
    } else {
      Alert.alert(
        "Not enough points",
        "You need at least 500 points to redeem.",
      );
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.transactionRow}>
      <Ionicons
        name={item.type === "Earned" ? "arrow-up-circle" : "arrow-down-circle"}
        size={28}
        color={item.type === "Earned" ? "#4CAF50" : "#F44336"}
      />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.transactionText}>
          {item.type} {item.amount} pts
        </Text>
        <Text style={styles.transactionDate}>{item.date}</Text>
      </View>
      <Text style={{ color: "#999", fontWeight: "bold" }}>
        {item.type === "Earned" ? `+${item.amount}` : `-${item.amount}`}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Top Wallet Card */}
      {/* Wallet Card */}
      <LinearGradient
        colors={["#183B5C", "#E97A3E"]}
        style={styles.walletCard}
        start={[0, 0]}
        end={[1, 1]}
      >
        {/* Top left stacked lines */}
        <View style={styles.linesContainer}>
          <View style={[styles.line, { width: 200 }]} />
          <View style={[styles.line, { width: 160 }]} />
          <View style={[styles.line, { width: 120 }]} />
        </View>

        <Text style={styles.cardTitle}>Wallet Points</Text>

        {/* Points + Redeem Button Row */}
        <View style={styles.pointsRow}>
          <Text style={styles.pointsValue}>{points} pts</Text>
          <TouchableOpacity style={styles.redeemButton} onPress={handleRedeem}>
            <Ionicons
              name="gift"
              size={20}
              color="#fff"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.redeemButtonText}>Redeem</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.rewardText}>Next reward: 500 pts</Text>
      </LinearGradient>

      <Text style={styles.transactionsTitle}>Recent Activity</Text>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 50 }}
      />
    </View>
  );
}
