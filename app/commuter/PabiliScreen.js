import React, { useEffect, useMemo, useState } from "react";
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
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";

const PABILI_CATEGORIES = [
  { key: "food", label: "Food", icon: "fast-food-outline" },
  { key: "grocery", label: "Grocery", icon: "cart-outline" },
  { key: "pharmacy", label: "Pharmacy", icon: "medkit-outline" },
  { key: "other", label: "Other", icon: "apps-outline" },
];

const createEmptyItemRow = () => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  itemName: "",
  qty: "1",
  specifics: "",
});

export default function PabiliScreen({ navigation }) {
  const [category, setCategory] = useState("food");
  const [storeName, setStoreName] = useState("");
  const [itemRows, setItemRows] = useState([createEmptyItemRow()]);
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [loadingUser, setLoadingUser] = useState(true);

  const [loadingFares, setLoadingFares] = useState(true);
  const [fareSettings, setFareSettings] = useState({
    deliveryFee: 30,
    serviceFee: 10,
  });

  const [storeLocation, setStoreLocation] = useState(null);
  const [storeAddress, setStoreAddress] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState(null);
  const [deliveryAddress, setDeliveryAddress] = useState("");

  const paymentMethod = "qrph";

  const estimatedBudget = Number(budget || 0);
  const estimatedDeliveryFee = Number(fareSettings.deliveryFee || 0);
  const estimatedServiceFee = Number(fareSettings.serviceFee || 0);
  const estimatedTotal =
    estimatedBudget + estimatedDeliveryFee + estimatedServiceFee;

  useEffect(() => {
    const firstId = itemRows[0]?.id;
    if (firstId && !expandedItemId) {
      setExpandedItemId(firstId);
    }
  }, [itemRows, expandedItemId]);

  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        setLoadingUser(true);

        const userId = await AsyncStorage.getItem("user_id");
        if (!userId) {
          Alert.alert(
            "Login Required",
            "Unable to load your account details. Please log in again.",
          );
          return;
        }

        const [
          { data: userData, error: userError },
          { data: commuterData, error: commuterError },
        ] = await Promise.all([
          supabase.from("users").select("phone").eq("id", userId).single(),
          supabase
            .from("commuters")
            .select("first_name, middle_name, last_name, email")
            .eq("id", userId)
            .single(),
        ]);

        if (userError) console.log("users fetch error:", userError);
        if (commuterError) console.log("commuters fetch error:", commuterError);

        if (userData?.phone) {
          setBuyerPhone(userData.phone);
        }

        if (commuterData) {
          const fullName = [
            commuterData.first_name,
            commuterData.middle_name,
            commuterData.last_name,
          ]
            .filter(Boolean)
            .join(" ")
            .trim();

          setBuyerName(fullName);
        }

        if (commuterData?.email) {
          setBuyerEmail(commuterData.email);
        }
      } catch (error) {
        console.log("loadUserProfile error:", error);
        Alert.alert(
          "Error",
          "Failed to load your account details. Please try again.",
        );
      } finally {
        setLoadingUser(false);
      }
    };

    loadUserProfile();
  }, []);

  useEffect(() => {
    const loadFareSettings = async () => {
      try {
        setLoadingFares(true);

        const { data, error } = await supabase
          .from("fares")
          .select("fare_type, amount")
          .eq("active", true)
          .in("fare_type", ["delivery_fee", "service_fee"]);

        if (error) throw error;

        const deliveryFeeRow = data?.find(
          (f) => f.fare_type === "delivery_fee",
        );
        const serviceFeeRow = data?.find((f) => f.fare_type === "service_fee");

        const deliveryFee =
          deliveryFeeRow?.amount !== null &&
          deliveryFeeRow?.amount !== undefined
            ? Number(deliveryFeeRow.amount)
            : 0;

        const serviceFee =
          serviceFeeRow?.amount !== null && serviceFeeRow?.amount !== undefined
            ? Number(serviceFeeRow.amount)
            : 0;

        setFareSettings({
          deliveryFee,
          serviceFee,
        });
      } catch (error) {
        console.log("loadFareSettings error:", error);
        setFareSettings({
          deliveryFee: 30,
          serviceFee: 10,
        });
      } finally {
        setLoadingFares(false);
      }
    };

    loadFareSettings();
  }, []);

  const updateItemRow = (id, field, value) => {
    setItemRows((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              [field]: field === "qty" ? value.replace(/[^0-9]/g, "") : value,
            }
          : row,
      ),
    );
  };

  const addItemRow = () => {
    const newRow = createEmptyItemRow();
    setItemRows((prev) => [...prev, newRow]);
    setExpandedItemId(newRow.id);
  };

  const removeItemRow = (id) => {
    setItemRows((prev) => {
      if (prev.length === 1) {
        const newOnlyRow = createEmptyItemRow();
        setExpandedItemId(newOnlyRow.id);
        return [newOnlyRow];
      }

      const nextRows = prev.filter((row) => row.id !== id);

      if (expandedItemId === id) {
        setExpandedItemId(nextRows[0]?.id || null);
      }

      return nextRows;
    });
  };

  const toggleItemExpand = (id) => {
    setExpandedItemId((prev) => (prev === id ? null : id));
  };

  const cleanedItemRows = useMemo(() => {
    return itemRows
      .map((row) => ({
        ...row,
        itemName: row.itemName.trim(),
        qty: row.qty.trim(),
        specifics: row.specifics.trim(),
      }))
      .filter(
        (row) =>
          row.itemName.length > 0 ||
          row.qty.length > 0 ||
          row.specifics.length > 0,
      );
  }, [itemRows]);

  const itemsTextSummary = useMemo(() => {
    if (!cleanedItemRows.length) return "";

    return cleanedItemRows
      .map((row, index) => {
        const qtyText = row.qty ? `Qty: ${row.qty}` : "Qty: -";
        const specificsText = row.specifics
          ? ` | Specifics: ${row.specifics}`
          : "";
        return `${index + 1}. ${row.itemName || "Unnamed item"} | ${qtyText}${specificsText}`;
      })
      .join("\n");
  }, [cleanedItemRows]);

  const hasAtLeastOneValidItem = useMemo(() => {
    return cleanedItemRows.some((row) => row.itemName.trim() && row.qty.trim());
  }, [cleanedItemRows]);

  const openMapPicker = (type) => {
    const currentLocation =
      type === "pickup" ? storeLocation : deliveryLocation;

    navigation.navigate("MapPicker", {
      type,
      initialLocation: currentLocation || undefined,
      onSelect: (location, address) => {
        if (type === "pickup") {
          setStoreLocation(location);
          setStoreAddress(address);
        } else {
          setDeliveryLocation(location);
          setDeliveryAddress(address);
        }
      },
    });
  };

  const isValid = useMemo(() => {
    return (
      storeName.trim() &&
      hasAtLeastOneValidItem &&
      budget.trim() &&
      buyerName.trim() &&
      buyerPhone.trim() &&
      buyerEmail.trim() &&
      storeLocation &&
      deliveryLocation &&
      storeAddress.trim() &&
      deliveryAddress.trim() &&
      !loadingUser &&
      !loadingFares
    );
  }, [
    storeName,
    hasAtLeastOneValidItem,
    budget,
    buyerName,
    buyerPhone,
    buyerEmail,
    storeLocation,
    deliveryLocation,
    storeAddress,
    deliveryAddress,
    loadingUser,
    loadingFares,
  ]);

  const handleContinue = () => {
    if (loadingUser || loadingFares) {
      Alert.alert(
        "Please wait",
        "We are still loading your account and fare information.",
      );
      return;
    }

    if (!buyerName.trim() || !buyerPhone.trim() || !buyerEmail.trim()) {
      Alert.alert(
        "Missing account info",
        "We could not load your account information. Please check your profile.",
      );
      return;
    }

    if (!hasAtLeastOneValidItem) {
      Alert.alert(
        "Incomplete items",
        "Please add at least one item with item name and quantity.",
      );
      return;
    }

    const invalidRow = cleanedItemRows.find(
      (row) =>
        (row.itemName && !row.qty) ||
        (!row.itemName && row.qty) ||
        (!row.itemName && row.specifics && row.qty),
    );

    if (invalidRow) {
      Alert.alert(
        "Incomplete item row",
        "Each item row should have both item name and quantity.",
      );
      return;
    }

    if (!isValid) {
      Alert.alert(
        "Incomplete",
        "Please complete all required fields including store and delivery locations.",
      );
      return;
    }

    navigation.navigate("ConfirmDeliveryScreen", {
      serviceType: "pabili",
      pabiliData: {
        category,
        storeName,
        items: itemsTextSummary,
        item_rows: cleanedItemRows.filter(
          (row) => row.itemName.trim() && row.qty.trim(),
        ),
        budget: estimatedBudget,
        buyerName,
        buyerPhone,
        buyerEmail,
        notes,
        paymentMethod,
        storeAddress,
        deliveryAddress,
        pickup_location: storeAddress,
        pickup_latitude: storeLocation.latitude,
        pickup_longitude: storeLocation.longitude,
        dropoff_location: deliveryAddress,
        dropoff_latitude: deliveryLocation.latitude,
        dropoff_longitude: deliveryLocation.longitude,
        estimated_delivery_fee: estimatedDeliveryFee,
        estimated_service_fee: estimatedServiceFee,
        estimated_total: estimatedTotal,
      },
    });
  };

  const getCollapsedPreview = (row) => {
    const name = row.itemName?.trim() || "Unnamed item";
    const qty = row.qty?.trim() || "-";
    const specifics = row.specifics?.trim();

    if (specifics) {
      return `${name} • Qty ${qty} • ${specifics}`;
    }

    return `${name} • Qty ${qty}`;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={["#F97316", "#FB923C"]}
            style={styles.heroCard}
          >
            <View style={styles.heroIconWrap}>
              <Ionicons name="bag-handle" size={28} color="#fff" />
            </View>
            <Text style={styles.heroTitle}>Pabili</Text>
            <Text style={styles.heroSubtitle}>
              Fill in the item request, choose the store on the map, and pay
              first before the driver buys.
            </Text>
          </LinearGradient>

          <View style={styles.noticeCard}>
            <View style={styles.noticeHeader}>
              <Ionicons name="information-circle" size={18} color="#F97316" />
              <Text style={styles.noticeTitle}>Important</Text>
            </View>
            <Text style={styles.noticeText}>
              • Cashless only via QR Ph / GCash
            </Text>
            <Text style={styles.noticeText}>
              • Driver buys only after successful payment
            </Text>
            <Text style={styles.noticeText}>
              • Final amount may change based on actual store price
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Order Category</Text>
            <View style={styles.categoryGrid}>
              {PABILI_CATEGORIES.map((item) => {
                const active = category === item.key;
                return (
                  <Pressable
                    key={item.key}
                    style={[
                      styles.categoryChip,
                      active && styles.categoryChipActive,
                    ]}
                    onPress={() => setCategory(item.key)}
                  >
                    <Ionicons
                      name={item.icon}
                      size={18}
                      color={active ? "#F97316" : "#6B7280"}
                    />
                    <Text
                      style={[
                        styles.categoryChipText,
                        active && styles.categoryChipTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Store & Item Details</Text>

            <Text style={styles.label}>Store / Place</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="storefront-outline" size={20} color="#6B7280" />
              <TextInput
                value={storeName}
                onChangeText={setStoreName}
                placeholder="Hal. Jollibee Ipil, Mercury Drug"
                placeholderTextColor="#9CA3AF"
                style={styles.input}
              />
            </View>

            <View style={styles.itemsHeaderRow}>
              <Text style={styles.labelNoMargin}>What to buy</Text>
              <Pressable style={styles.addItemBtn} onPress={addItemRow}>
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.addItemBtnText}>Add item</Text>
              </Pressable>
            </View>

            <Text style={styles.helperTextTop}>
              Each new item opens automatically while previous items collapse.
            </Text>

            {itemRows.map((row, index) => {
              const isExpanded = expandedItemId === row.id;

              return (
                <View key={row.id} style={styles.itemCard}>
                  <Pressable
                    style={styles.itemCardHeader}
                    onPress={() => toggleItemExpand(row.id)}
                  >
                    <View style={styles.itemHeaderLeft}>
                      <View style={styles.itemIndexBadge}>
                        <Text style={styles.itemIndexBadgeText}>
                          {index + 1}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemCardTitle}>
                          Item #{index + 1}
                        </Text>
                        {!isExpanded && (
                          <Text
                            style={styles.itemCollapsedPreview}
                            numberOfLines={2}
                          >
                            {getCollapsedPreview(row)}
                          </Text>
                        )}
                      </View>
                    </View>

                    <View style={styles.itemHeaderRight}>
                      <Pressable
                        onPress={() => removeItemRow(row.id)}
                        style={styles.removeItemBtn}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={16}
                          color="#DC2626"
                        />
                      </Pressable>
                      <Ionicons
                        name={isExpanded ? "chevron-up" : "chevron-down"}
                        size={20}
                        color="#6B7280"
                      />
                    </View>
                  </Pressable>

                  {isExpanded && (
                    <View style={styles.itemBody}>
                      <Text style={styles.labelSmall}>Item name</Text>
                      <View style={styles.inputWrap}>
                        <Ionicons
                          name="bag-outline"
                          size={20}
                          color="#6B7280"
                        />
                        <TextInput
                          value={row.itemName}
                          onChangeText={(text) =>
                            updateItemRow(row.id, "itemName", text)
                          }
                          placeholder="Hal. Coke"
                          placeholderTextColor="#9CA3AF"
                          style={styles.input}
                        />
                      </View>

                      <Text style={styles.labelSmall}>Quantity</Text>
                      <View style={styles.inputWrap}>
                        <Ionicons
                          name="layers-outline"
                          size={20}
                          color="#6B7280"
                        />
                        <TextInput
                          value={row.qty}
                          onChangeText={(text) =>
                            updateItemRow(row.id, "qty", text)
                          }
                          placeholder="Hal. 1"
                          placeholderTextColor="#9CA3AF"
                          style={styles.input}
                          keyboardType="number-pad"
                        />
                      </View>

                      <Text style={styles.labelSmall}>
                        Specific item / details (optional)
                      </Text>
                      <View style={[styles.inputWrap, styles.textareaWrap]}>
                        <Ionicons
                          name="create-outline"
                          size={20}
                          color="#6B7280"
                        />
                        <TextInput
                          value={row.specifics}
                          onChangeText={(text) =>
                            updateItemRow(row.id, "specifics", text)
                          }
                          placeholder="Hal. 1.5L, regular, malamig"
                          placeholderTextColor="#9CA3AF"
                          style={[styles.input, styles.textareaSmall]}
                          multiline
                          textAlignVertical="top"
                        />
                      </View>
                    </View>
                  )}
                </View>
              );
            })}

            <Text style={styles.label}>Estimated Budget</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="cash-outline" size={20} color="#6B7280" />
              <TextInput
                value={budget}
                onChangeText={(text) => {
                  const numeric = text.replace(/[^0-9]/g, "");

                  if (numeric === "") {
                    setBudget("");
                    return;
                  }

                  const value = Math.max(1, parseInt(numeric, 10));
                  setBudget(String(value));
                }}
                placeholder="Hal. 300"
                placeholderTextColor="#9CA3AF"
                style={styles.input}
                keyboardType="numeric"
              />
            </View>

            <Text style={styles.sectionTitle}>Locations</Text>

            <Text style={styles.label}>Store Location</Text>
            <Pressable
              style={styles.locationCard}
              onPress={() => openMapPicker("pickup")}
            >
              <View style={styles.locationLeft}>
                <View
                  style={[styles.locationDot, { backgroundColor: "#F97316" }]}
                />
                <View style={styles.locationTextWrap}>
                  <Text style={styles.locationTitle}>
                    Select Store Location
                  </Text>
                  <Text
                    style={[
                      styles.locationValue,
                      !storeAddress && styles.locationPlaceholder,
                    ]}
                    numberOfLines={2}
                  >
                    {storeAddress || "Tap to pin the store on the map"}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </Pressable>

            <Text style={styles.label}>Delivery Location</Text>
            <Pressable
              style={styles.locationCard}
              onPress={() => openMapPicker("dropoff")}
            >
              <View style={styles.locationLeft}>
                <View
                  style={[styles.locationDot, { backgroundColor: "#183B5C" }]}
                />
                <View style={styles.locationTextWrap}>
                  <Text style={styles.locationTitle}>
                    Select Delivery Location
                  </Text>
                  <Text
                    style={[
                      styles.locationValue,
                      !deliveryAddress && styles.locationPlaceholder,
                    ]}
                    numberOfLines={2}
                  >
                    {deliveryAddress ||
                      "Tap to pin where the item will be delivered"}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </Pressable>

            <Text style={styles.label}>Payment Method</Text>
            <View style={styles.paymentLockedCard}>
              <Ionicons name="qr-code-outline" size={20} color="#F97316" />
              <View style={{ flex: 1 }}>
                <Text style={styles.paymentLockedTitle}>QR Ph / GCash</Text>
                <Text style={styles.paymentLockedSubtitle}>
                  Cashless payment only for safer pabili transactions
                </Text>
              </View>
            </View>

            <Text style={styles.label}>Notes (Optional)</Text>
            <View style={[styles.inputWrap, styles.textareaWrap]}>
              <Ionicons name="create-outline" size={20} color="#6B7280" />
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Hal. spicy only, no substitute, pakidagdagan ng resibo"
                placeholderTextColor="#9CA3AF"
                style={[styles.input, styles.textareaSmall]}
                multiline
                textAlignVertical="top"
              />
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Estimated Payment</Text>

              {loadingFares ? (
                <View style={styles.loadingFareWrap}>
                  <ActivityIndicator size="small" color="#F97316" />
                  <Text style={styles.loadingFareText}>
                    Loading fare settings...
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Item budget</Text>
                    <Text style={styles.summaryValue}>
                      ₱{estimatedBudget.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Delivery fee</Text>
                    <Text style={styles.summaryValue}>
                      ₱{estimatedDeliveryFee.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Service fee</Text>
                    <Text style={styles.summaryValue}>
                      ₱{estimatedServiceFee.toFixed(2)}
                    </Text>
                  </View>
                  <View style={[styles.summaryRow, styles.summaryRowTotal]}>
                    <Text style={styles.summaryTotalLabel}>
                      Estimated total
                    </Text>
                    <Text style={styles.summaryTotalValue}>
                      ₱{estimatedTotal.toFixed(2)}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            style={styles.secondaryBtn}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.secondaryBtnText}>Back</Text>
          </Pressable>

          <Pressable
            style={[styles.primaryBtn, !isValid && styles.primaryBtnDisabled]}
            onPress={handleContinue}
            disabled={!isValid}
          >
            <LinearGradient
              colors={isValid ? ["#F97316", "#FB923C"] : ["#D1D5DB", "#D1D5DB"]}
              style={styles.primaryGradient}
            >
              <Text style={styles.primaryBtnText}>
                {loadingUser || loadingFares ? "Loading..." : "Continue"}
              </Text>
              {!loadingUser && !loadingFares && (
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              )}
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

  heroCard: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
  },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 6,
  },
  heroSubtitle: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 14,
    lineHeight: 20,
  },

  noticeCard: {
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
    borderRadius: 20,
    padding: 14,
    marginBottom: 16,
  },
  noticeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  noticeTitle: {
    color: "#C2410C",
    fontWeight: "800",
    fontSize: 14,
  },
  noticeText: {
    color: "#9A3412",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },

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

  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 8,
  },
  categoryChip: {
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
  categoryChipActive: {
    borderColor: "#FDBA74",
    backgroundColor: "#FFF7ED",
  },
  categoryChipText: {
    color: "#6B7280",
    fontWeight: "700",
    fontSize: 13,
  },
  categoryChipTextActive: {
    color: "#F97316",
  },

  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 8,
    marginTop: 12,
  },
  labelNoMargin: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
  },
  labelSmall: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 8,
    marginTop: 10,
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
  helperTextTop: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 10,
    lineHeight: 17,
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
  textareaSmall: {
    minHeight: 80,
  },

  itemsHeaderRow: {
    marginTop: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  addItemBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F97316",
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 12,
  },
  addItemBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },

  itemCard: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FCFCFD",
    borderRadius: 18,
    marginBottom: 12,
    overflow: "hidden",
  },
  itemCardHeader: {
    minHeight: 62,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  itemHeaderLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  itemHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  itemIndexBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFF7ED",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  itemIndexBadgeText: {
    color: "#F97316",
    fontWeight: "800",
    fontSize: 12,
  },
  itemCardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  itemCollapsedPreview: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 17,
  },
  itemBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 2,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  removeItemBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
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
  locationTextWrap: {
    flex: 1,
  },
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

  paymentLockedCard: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  paymentLockedTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#C2410C",
  },
  paymentLockedSubtitle: {
    fontSize: 12,
    color: "#9A3412",
    marginTop: 2,
    lineHeight: 16,
  },

  summaryCard: {
    marginTop: 16,
    borderRadius: 20,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
    padding: 14,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 10,
  },
  loadingFareWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  loadingFareText: {
    fontSize: 13,
    color: "#9A3412",
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
    borderTopColor: "#FED7AA",
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
    color: "#F97316",
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
