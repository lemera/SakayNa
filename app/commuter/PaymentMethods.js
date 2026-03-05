// screens/commuter/PaymentMethods.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function PaymentMethodsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [loading, setLoading] = useState(true);
  const [commuterId, setCommuterId] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [paymentMethods, setPaymentMethods] = useState([
    {
      id: "wallet",
      type: "wallet",
      name: "Wallet Balance",
      icon: "wallet",
      isDefault: true,
      enabled: true,
    },
    {
      id: "gcash",
      type: "gcash",
      name: "GCash",
      icon: "phone-portrait",
      number: "09123456789",
      isDefault: false,
      enabled: false,
    },
    {
      id: "card",
      type: "card",
      name: "Credit/Debit Card",
      icon: "card",
      number: "**** **** **** 1234",
      isDefault: false,
      enabled: false,
    },
    {
      id: "cash",
      type: "cash",
      name: "Cash",
      icon: "cash",
      isDefault: false,
      enabled: true,
    },
  ]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newMethod, setNewMethod] = useState({
    type: "gcash",
    name: "",
    number: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const id = await AsyncStorage.getItem("user_id");
      setCommuterId(id);

      // Fetch wallet balance
      const { data: walletData, error: walletError } = await supabase
        .from("commuter_wallets")
        .select("balance")
        .eq("commuter_id", id)
        .single();

      if (walletError && walletError.code !== "PGRST116") throw walletError;
      setWallet(walletData);

    } catch (err) {
      console.log("Error loading data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefault = (id) => {
    setPaymentMethods(methods =>
      methods.map(m => ({
        ...m,
        isDefault: m.id === id,
      }))
    );
  };

  const handleToggleEnable = (id) => {
    setPaymentMethods(methods =>
      methods.map(m =>
        m.id === id ? { ...m, enabled: !m.enabled } : m
      )
    );
  };

  const handleAddMethod = () => {
    if (!newMethod.name || !newMethod.number) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    const method = {
      id: Date.now().toString(),
      type: newMethod.type,
      name: newMethod.name,
      icon: newMethod.type === "gcash" ? "phone-portrait" : "card",
      number: newMethod.number,
      isDefault: false,
      enabled: true,
    };

    setPaymentMethods([...paymentMethods, method]);
    setShowAddModal(false);
    setNewMethod({ type: "gcash", name: "", number: "" });
  };

  const handleRemoveMethod = (id) => {
    Alert.alert(
      "Remove Payment Method",
      "Are you sure you want to remove this payment method?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            setPaymentMethods(methods => methods.filter(m => m.id !== id));
          },
        },
      ]
    );
  };

  const formatCurrency = (amount) => {
    return `₱${amount?.toFixed(2) || "0.00"}`;
  };

  const AddMethodModal = () => (
    <Modal
      visible={showAddModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowAddModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Payment Method</Text>
            <Pressable onPress={() => setShowAddModal(false)}>
              <Ionicons name="close" size={24} color="#666" />
            </Pressable>
          </View>

          <Text style={styles.modalLabel}>Payment Type</Text>
          <View style={styles.typeSelector}>
            <Pressable
              style={[
                styles.typeOption,
                newMethod.type === "gcash" && styles.typeOptionSelected,
              ]}
              onPress={() => setNewMethod({ ...newMethod, type: "gcash" })}
            >
              <Ionicons
                name="phone-portrait"
                size={24}
                color={newMethod.type === "gcash" ? "#FFF" : "#666"}
              />
              <Text
                style={[
                  styles.typeOptionText,
                  newMethod.type === "gcash" && styles.typeOptionTextSelected,
                ]}
              >
                GCash
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.typeOption,
                newMethod.type === "card" && styles.typeOptionSelected,
              ]}
              onPress={() => setNewMethod({ ...newMethod, type: "card" })}
            >
              <Ionicons
                name="card"
                size={24}
                color={newMethod.type === "card" ? "#FFF" : "#666"}
              />
              <Text
                style={[
                  styles.typeOptionText,
                  newMethod.type === "card" && styles.typeOptionTextSelected,
                ]}
              >
                Card
              </Text>
            </Pressable>
          </View>

          <Text style={styles.modalLabel}>Account Name</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Enter account name"
            value={newMethod.name}
            onChangeText={(text) => setNewMethod({ ...newMethod, name: text })}
          />

          <Text style={styles.modalLabel}>
            {newMethod.type === "gcash" ? "GCash Number" : "Card Number"}
          </Text>
          <TextInput
            style={styles.modalInput}
            placeholder={
              newMethod.type === "gcash" ? "0912 345 6789" : "1234 5678 9012 3456"
            }
            value={newMethod.number}
            onChangeText={(text) => setNewMethod({ ...newMethod, number: text })}
            keyboardType="numeric"
          />

          <Pressable style={styles.addButton} onPress={handleAddMethod}>
            <Text style={styles.addButtonText}>Add Payment Method</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#183B5C" />
        </Pressable>
        <Text style={styles.headerTitle}>Payment Methods</Text>
        <Pressable onPress={() => setShowAddModal(true)} style={styles.addButton}>
          <Ionicons name="add" size={24} color="#183B5C" />
        </Pressable>
      </View>

      {/* Wallet Balance Card */}
      <View style={styles.walletCard}>
        <View style={styles.walletIcon}>
          <Ionicons name="wallet" size={32} color="#FFF" />
        </View>
        <View style={styles.walletInfo}>
          <Text style={styles.walletLabel}>Wallet Balance</Text>
          <Text style={styles.walletBalance}>{formatCurrency(wallet?.balance)}</Text>
        </View>
        <Pressable 
          style={styles.topUpButton}
          onPress={() => navigation.navigate("Wallet")}
        >
          <Text style={styles.topUpText}>Top Up</Text>
        </Pressable>
      </View>

      {/* Payment Methods List */}
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Payment Methods</Text>
          
          {paymentMethods.map((method) => (
            <View key={method.id} style={styles.methodCard}>
              <View style={[styles.methodIcon, { backgroundColor: method.enabled ? "#F3F4F6" : "#F9FAFB" }]}>
                <Ionicons 
                  name={method.icon} 
                  size={24} 
                  color={method.enabled ? "#183B5C" : "#999"} 
                />
              </View>
              
              <View style={styles.methodInfo}>
                <Text style={[styles.methodName, !method.enabled && styles.methodDisabled]}>
                  {method.name}
                </Text>
                {method.number && (
                  <Text style={styles.methodNumber}>{method.number}</Text>
                )}
                {method.isDefault && (
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultText}>Default</Text>
                  </View>
                )}
              </View>

              <View style={styles.methodActions}>
                {method.id !== "wallet" && method.id !== "cash" && (
                  <>
                    <Pressable
                      style={[styles.actionButton, method.enabled && styles.actionButtonActive]}
                      onPress={() => handleToggleEnable(method.id)}
                    >
                      <Ionicons
                        name={method.enabled ? "eye" : "eye-off"}
                        size={20}
                        color={method.enabled ? "#10B981" : "#999"}
                      />
                    </Pressable>
                    
                    <Pressable
                      style={styles.actionButton}
                      onPress={() => handleRemoveMethod(method.id)}
                    >
                      <Ionicons name="trash-outline" size={20} color="#EF4444" />
                    </Pressable>
                  </>
                )}

                {!method.isDefault && method.enabled && (
                  <Pressable
                    style={styles.defaultButton}
                    onPress={() => handleSetDefault(method.id)}
                  >
                    <Text style={styles.defaultButtonText}>Set as Default</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))}
        </View>

        {/* Info Section */}
        <View style={styles.infoSection}>
          <Ionicons name="information-circle" size={20} color="#183B5C" />
          <Text style={styles.infoText}>
            Your default payment method will be used for automatic payments. You can change this anytime.
          </Text>
        </View>
      </ScrollView>

      {/* Add Method Modal */}
      <AddMethodModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#183B5C",
  },
  addButton: {
    padding: 8,
  },
  walletCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#183B5C",
    margin: 20,
    padding: 20,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  walletIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  walletInfo: {
    flex: 1,
  },
  walletLabel: {
    fontSize: 14,
    color: "#FFB37A",
    marginBottom: 4,
  },
  walletBalance: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFF",
  },
  topUpButton: {
    backgroundColor: "#FFB37A",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  topUpText: {
    color: "#183B5C",
    fontWeight: "600",
  },
  section: {
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 15,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 15,
  },
  methodCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  methodIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  methodInfo: {
    flex: 1,
  },
  methodName: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
    marginBottom: 4,
  },
  methodDisabled: {
    color: "#999",
  },
  methodNumber: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  defaultBadge: {
    backgroundColor: "#E3F2FD",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  defaultText: {
    fontSize: 10,
    color: "#183B5C",
    fontWeight: "500",
  },
  methodActions: {
    alignItems: "flex-end",
    gap: 8,
  },
  actionButton: {
    padding: 6,
  },
  actionButtonActive: {
    backgroundColor: "#F3F4F6",
    borderRadius: 20,
  },
  defaultButton: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  defaultButtonText: {
    fontSize: 10,
    color: "#183B5C",
    fontWeight: "500",
  },
  infoSection: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F7FF",
    marginHorizontal: 20,
    marginBottom: 30,
    padding: 15,
    borderRadius: 12,
  },
  infoText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 12,
    color: "#183B5C",
    lineHeight: 18,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
    minHeight: 400,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#183B5C",
  },
  modalLabel: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
    marginTop: 15,
  },
  typeSelector: {
    flexDirection: "row",
    gap: 10,
  },
  typeOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
    padding: 15,
    borderRadius: 12,
    gap: 8,
  },
  typeOptionSelected: {
    backgroundColor: "#183B5C",
  },
  typeOptionText: {
    fontSize: 14,
    color: "#666",
  },
  typeOptionTextSelected: {
    color: "#FFF",
  },
  modalInput: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 15,
    fontSize: 14,
    color: "#333",
  },
  addButton: {
    backgroundColor: "#183B5C",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 30,
  },
  addButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
});