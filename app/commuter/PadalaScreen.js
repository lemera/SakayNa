import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

const ITEM_TYPES = [
  { key: "documents", label: "Documents", icon: "document-text-outline" },
  { key: "small_package", label: "Small Package", icon: "cube-outline" },
  { key: "food", label: "Food", icon: "fast-food-outline" },
  { key: "other", label: "Other", icon: "apps-outline" },
];

export default function PadalaScreen({ navigation }) {
  const [pickupLocation, setPickupLocation] = useState(null);
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffLocation, setDropoffLocation] = useState(null);
  const [dropoffAddress, setDropoffAddress] = useState("");

  const [itemType, setItemType] = useState("documents");
  const [itemName, setItemName] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [isFragile, setIsFragile] = useState(false);
  const [requireOtp, setRequireOtp] = useState(true);
  const [notes, setNotes] = useState("");

  const paymentMethod = "qrph";

  const baseDeliveryFee = 25;
  const appFee = 5;
  const fragileFee = isFragile ? 5 : 0;
  const estimatedTotal = baseDeliveryFee + appFee + fragileFee;

  const isValid = useMemo(() => {
    return (
      pickupLocation &&
      dropoffLocation &&
      pickupAddress.trim() &&
      dropoffAddress.trim() &&
      itemName.trim() &&
      senderName.trim() &&
      senderPhone.trim() &&
      receiverName.trim() &&
      receiverPhone.trim()
    );
  }, [
    pickupLocation,
    dropoffLocation,
    pickupAddress,
    dropoffAddress,
    itemName,
    senderName,
    senderPhone,
    receiverName,
    receiverPhone,
  ]);

  const openMapPicker = (type) => {
    const currentLocation =
      type === "pickup" ? pickupLocation : dropoffLocation;

    navigation.navigate("MapPicker", {
      type,
      initialLocation: currentLocation || undefined,
      onSelect: (location, address) => {
        if (type === "pickup") {
          setPickupLocation(location);
          setPickupAddress(address);
        } else {
          setDropoffLocation(location);
          setDropoffAddress(address);
        }
      },
    });
  };

  const handleContinue = () => {
    if (!isValid) {
      Alert.alert("Incomplete", "Please complete all required fields.");
      return;
    }

    navigation.navigate("ConfirmDeliveryScreen", {
      serviceType: "padala",
      padalaData: {
        pickupAddress,
        dropoffAddress,
        pickup_location: pickupAddress,
        pickup_latitude: pickupLocation.latitude,
        pickup_longitude: pickupLocation.longitude,
        dropoff_location: dropoffAddress,
        dropoff_latitude: dropoffLocation.latitude,
        dropoff_longitude: dropoffLocation.longitude,
        itemType,
        itemName,
        senderName,
        senderPhone,
        receiverName,
        receiverPhone,
        isFragile,
        requireOtp,
        notes,
        paymentMethod,
        base_delivery_fee: baseDeliveryFee,
        app_fee: appFee,
        fragile_fee: fragileFee,
        estimated_total: estimatedTotal,
      },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={["#10B981", "#34D399"]}
            style={styles.heroCard}
          >
            <View style={styles.heroIconWrap}>
              <Ionicons name="cube" size={28} color="#fff" />
            </View>
            <Text style={styles.heroTitle}>Padala</Text>
            <Text style={styles.heroSubtitle}>
              Select pickup and drop-off on the map, then pay before the driver proceeds.
            </Text>
          </LinearGradient>

          <View style={styles.noticeCard}>
            <View style={styles.noticeHeader}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#10B981" />
              <Text style={styles.noticeTitle}>Delivery Reminder</Text>
            </View>
            <Text style={styles.noticeText}>• Cashless only via QR Ph / GCash</Text>
            <Text style={styles.noticeText}>• Payment is required before delivery proceeds</Text>
            <Text style={styles.noticeText}>• OTP is recommended for safer handoff</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Location Details</Text>

            <Text style={styles.label}>Pickup Location</Text>
            <Pressable style={styles.locationCard} onPress={() => openMapPicker("pickup")}>
              <View style={styles.locationLeft}>
                <View style={[styles.locationDot, { backgroundColor: "#10B981" }]} />
                <View style={styles.locationTextWrap}>
                  <Text style={styles.locationTitle}>Select Pickup Location</Text>
                  <Text
                    style={[
                      styles.locationValue,
                      !pickupAddress && styles.locationPlaceholder,
                    ]}
                    numberOfLines={2}
                  >
                    {pickupAddress || "Tap to pin where the item will be picked up"}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </Pressable>

            <Text style={styles.label}>Drop-off Location</Text>
            <Pressable style={styles.locationCard} onPress={() => openMapPicker("dropoff")}>
              <View style={styles.locationLeft}>
                <View style={[styles.locationDot, { backgroundColor: "#183B5C" }]} />
                <View style={styles.locationTextWrap}>
                  <Text style={styles.locationTitle}>Select Drop-off Location</Text>
                  <Text
                    style={[
                      styles.locationValue,
                      !dropoffAddress && styles.locationPlaceholder,
                    ]}
                    numberOfLines={2}
                  >
                    {dropoffAddress || "Tap to pin where the item will be delivered"}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </Pressable>

            <Text style={styles.sectionTitle}>Item Details</Text>

            <View style={styles.typeGrid}>
              {ITEM_TYPES.map((item) => {
                const active = itemType === item.key;
                return (
                  <Pressable
                    key={item.key}
                    style={[styles.typeChip, active && styles.typeChipActive]}
                    onPress={() => setItemType(item.key)}
                  >
                    <Ionicons
                      name={item.icon}
                      size={18}
                      color={active ? "#10B981" : "#6B7280"}
                    />
                    <Text
                      style={[
                        styles.typeChipText,
                        active && styles.typeChipTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>Item Name / Description</Text>
            <View style={[styles.inputWrap, styles.textareaWrap]}>
              <Ionicons name="cube-outline" size={20} color="#6B7280" />
              <TextInput
                value={itemName}
                onChangeText={setItemName}
                placeholder="Hal. Documents, Small Box, Clothes, Food Pack"
                placeholderTextColor="#9CA3AF"
                style={[styles.input, styles.textarea]}
                multiline
                textAlignVertical="top"
              />
            </View>

            <Text style={styles.sectionTitle}>Sender Details</Text>

            <Text style={styles.label}>Sender Name</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="person-outline" size={20} color="#6B7280" />
              <TextInput
                value={senderName}
                onChangeText={setSenderName}
                placeholder="Pangalan ng sender"
                placeholderTextColor="#9CA3AF"
                style={styles.input}
              />
            </View>

            <Text style={styles.label}>Sender Phone</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="call-outline" size={20} color="#6B7280" />
              <TextInput
                value={senderPhone}
                onChangeText={setSenderPhone}
                placeholder="09XXXXXXXXX"
                placeholderTextColor="#9CA3AF"
                style={styles.input}
                keyboardType="phone-pad"
              />
            </View>

            <Text style={styles.sectionTitle}>Receiver Details</Text>

            <Text style={styles.label}>Receiver Name</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="person-outline" size={20} color="#6B7280" />
              <TextInput
                value={receiverName}
                onChangeText={setReceiverName}
                placeholder="Pangalan ng tatanggap"
                placeholderTextColor="#9CA3AF"
                style={styles.input}
              />
            </View>

            <Text style={styles.label}>Receiver Phone</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="call-outline" size={20} color="#6B7280" />
              <TextInput
                value={receiverPhone}
                onChangeText={setReceiverPhone}
                placeholder="09XXXXXXXXX"
                placeholderTextColor="#9CA3AF"
                style={styles.input}
                keyboardType="phone-pad"
              />
            </View>

            <Text style={styles.sectionTitle}>Delivery Options</Text>

            <Pressable
              style={[styles.toggleCard, isFragile && styles.toggleCardActive]}
              onPress={() => setIsFragile((prev) => !prev)}
            >
              <View style={styles.toggleLeft}>
                <Ionicons
                  name="warning-outline"
                  size={20}
                  color={isFragile ? "#10B981" : "#6B7280"}
                />
                <View>
                  <Text style={styles.toggleTitle}>Fragile Item</Text>
                  <Text style={styles.toggleSubtitle}>
                    Mark this if the item needs extra care
                  </Text>
                </View>
              </View>
              <Ionicons
                name={isFragile ? "checkbox" : "square-outline"}
                size={22}
                color={isFragile ? "#10B981" : "#9CA3AF"}
              />
            </Pressable>

            <Pressable
              style={[styles.toggleCard, requireOtp && styles.toggleCardActive]}
              onPress={() => setRequireOtp((prev) => !prev)}
            >
              <View style={styles.toggleLeft}>
                <Ionicons
                  name="key-outline"
                  size={20}
                  color={requireOtp ? "#10B981" : "#6B7280"}
                />
                <View>
                  <Text style={styles.toggleTitle}>Require OTP on Delivery</Text>
                  <Text style={styles.toggleSubtitle}>
                    Add extra security before handoff
                  </Text>
                </View>
              </View>
              <Ionicons
                name={requireOtp ? "checkbox" : "square-outline"}
                size={22}
                color={requireOtp ? "#10B981" : "#9CA3AF"}
              />
            </Pressable>

            <Text style={styles.label}>Payment Method</Text>
            <View style={styles.paymentLockedCard}>
              <Ionicons name="qr-code-outline" size={20} color="#10B981" />
              <View style={{ flex: 1 }}>
                <Text style={styles.paymentLockedTitle}>QR Ph / GCash</Text>
                <Text style={styles.paymentLockedSubtitle}>
                  Cashless payment only for delivery transactions
                </Text>
              </View>
            </View>

            <Text style={styles.label}>Notes (Optional)</Text>
            <View style={[styles.inputWrap, styles.textareaWrap]}>
              <Ionicons name="document-text-outline" size={20} color="#6B7280" />
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Hal. fragile, tawagan muna bago ihatid, pakidiretso sa guard"
                placeholderTextColor="#9CA3AF"
                style={[styles.input, styles.textarea]}
                multiline
                textAlignVertical="top"
              />
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Estimated Payment</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Base delivery fee</Text>
                <Text style={styles.summaryValue}>₱{baseDeliveryFee.toFixed(2)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>App fee</Text>
                <Text style={styles.summaryValue}>₱{appFee.toFixed(2)}</Text>
              </View>
              {fragileFee > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Fragile handling fee</Text>
                  <Text style={styles.summaryValue}>₱{fragileFee.toFixed(2)}</Text>
                </View>
              )}
              <View style={[styles.summaryRow, styles.summaryRowTotal]}>
                <Text style={styles.summaryTotalLabel}>Estimated total</Text>
                <Text style={styles.summaryTotalValue}>₱{estimatedTotal.toFixed(2)}</Text>
              </View>
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable style={styles.secondaryBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.secondaryBtnText}>Back</Text>
          </Pressable>

          <Pressable
            style={[styles.primaryBtn, !isValid && styles.primaryBtnDisabled]}
            onPress={handleContinue}
          >
            <LinearGradient
              colors={isValid ? ["#10B981", "#34D399"] : ["#D1D5DB", "#D1D5DB"]}
              style={styles.primaryGradient}
            >
              <Text style={styles.primaryBtnText}>Continue</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  content: { padding: 16, paddingBottom: 130 },

  heroCard: { borderRadius: 24, padding: 20, marginBottom: 16 },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  heroTitle: { color: "#fff", fontSize: 24, fontWeight: "800", marginBottom: 6 },
  heroSubtitle: { color: "rgba(255,255,255,0.92)", fontSize: 14, lineHeight: 20 },

  noticeCard: {
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    borderRadius: 20,
    padding: 14,
    marginBottom: 16,
  },
  noticeHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  noticeTitle: { color: "#047857", fontWeight: "800", fontSize: 14 },
  noticeText: { color: "#065F46", fontSize: 13, lineHeight: 18, marginTop: 4 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
    marginTop: 6,
    marginBottom: 8,
  },

  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 8,
    marginTop: 12,
  },

  locationCard: {
    minHeight: 60,
    borderRadius: 18,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  locationLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    flex: 1,
    paddingRight: 10,
  },
  locationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 6,
  },
  locationTextWrap: { flex: 1 },
  locationTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  locationValue: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 18,
  },
  locationPlaceholder: {
    color: "#9CA3AF",
  },

  inputWrap: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10,
  },
  textareaWrap: {
    alignItems: "flex-start",
    paddingTop: 14,
  },
  input: {
    flex: 1,
    color: "#111827",
    fontSize: 15,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
  },
  textarea: {
    minHeight: 90,
  },

  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 4,
  },
  typeChip: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  typeChipActive: {
    borderColor: "#6EE7B7",
    backgroundColor: "#ECFDF5",
  },
  typeChipText: {
    color: "#6B7280",
    fontWeight: "700",
    fontSize: 13,
  },
  typeChipTextActive: {
    color: "#10B981",
  },

  toggleCard: {
    minHeight: 62,
    borderRadius: 18,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  toggleCardActive: {
    borderColor: "#6EE7B7",
    backgroundColor: "#ECFDF5",
  },
  toggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    paddingRight: 12,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  toggleSubtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
    lineHeight: 16,
  },

  paymentLockedCard: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  paymentLockedTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#047857",
  },
  paymentLockedSubtitle: {
    fontSize: 12,
    color: "#065F46",
    marginTop: 2,
    lineHeight: 16,
  },

  summaryCard: {
    marginTop: 16,
    borderRadius: 20,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    padding: 14,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 10,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 13,
    color: "#6B7280",
  },
  summaryValue: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "700",
  },
  summaryRowTotal: {
    borderTopWidth: 1,
    borderTopColor: "#A7F3D0",
    paddingTop: 10,
    marginTop: 2,
    marginBottom: 0,
  },
  summaryTotalLabel: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "800",
  },
  summaryTotalValue: {
    fontSize: 16,
    color: "#10B981",
    fontWeight: "900",
  },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 10,
    padding: 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  secondaryBtn: {
    width: 100,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  secondaryBtnText: {
    color: "#374151",
    fontWeight: "700",
  },
  primaryBtn: {
    flex: 1,
    borderRadius: 18,
    overflow: "hidden",
  },
  primaryBtnDisabled: {
    opacity: 0.7,
  },
  primaryGradient: {
    height: 54,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },
});