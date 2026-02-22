import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Dimensions,
  Modal,
  TextInput,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import styles from "../styles/Driver/DriverWalletStyles";

const { width } = Dimensions.get("window");

export default function WalletScreen() {
  const [balance, setBalance] = useState(1250); // balance in PHP
  const [transactions, setTransactions] = useState([
    { id: "1", type: "Earned", amount: 200, date: "2026-02-20" },
    { id: "2", type: "Withdrawn", amount: 50, date: "2026-02-18" },
    { id: "3", type: "Earned", amount: 100, date: "2026-02-15" },
  ]);

  const [modalVisible, setModalVisible] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const handleWithdraw = () => {
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid number.");
      return;
    }
    if (amount > balance) {
      Alert.alert("Insufficient balance", "You don't have enough balance.");
      return;
    }

    // Update balance and transactions
    setBalance(balance - amount);
    setTransactions([
      { id: (transactions.length + 1).toString(), type: "Withdrawn", amount, date: new Date().toISOString().slice(0, 10) },
      ...transactions,
    ]);
    setModalVisible(false);
    setWithdrawAmount("");
    Alert.alert("Success", `You have withdrawn ₱${amount.toFixed(2)}`);
  };

  const renderItem = ({ item }) => (
    <View style={styles.transactionRow}>
      <Text style={{ fontSize: 16, fontWeight: "bold", color: item.type === "Earned" ? "#4CAF50" : "#F44336" }}>
        {item.type === "Earned" ? `+₱${item.amount.toFixed(2)}` : `-₱${item.amount.toFixed(2)}`}
      </Text>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.transactionText}>
          {item.type} ₱{item.amount.toFixed(2)}
        </Text>
        <Text style={styles.transactionDate}>{item.date}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Wallet Card */}
      <LinearGradient
        colors={["#183B5C", "#E97A3E"]}
        style={styles.walletCard}
        start={[0, 0]}
        end={[1, 1]}
      >
        {/* Decorative lines */}
        <View style={styles.linesContainer}>
          <View style={[styles.line, { width: 200 }]} />
          <View style={[styles.line, { width: 160 }]} />
          <View style={[styles.line, { width: 120 }]} />
        </View>

        <Text style={styles.cardTitle}>Wallet Balance</Text>

        {/* Balance + Withdraw Button */}
        <View style={styles.pointsRow}>
          <Text style={styles.pointsValue}>₱{balance.toFixed(2)}</Text>
          <TouchableOpacity style={styles.withdrawButton} onPress={() => setModalVisible(true)}>
            <Text style={styles.withdrawButtonText}>Withdraw</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.rewardText}>Next payout: ₱500</Text>
      </LinearGradient>

      {/* Transaction List */}
      <Text style={styles.transactionsTitle}>Recent Activity</Text>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 50 }}
      />

      {/* Withdraw Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Withdraw Money</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter amount"
              keyboardType="numeric"
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmButton} onPress={handleWithdraw}>
                <Text style={styles.confirmButtonText}>Withdraw</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}