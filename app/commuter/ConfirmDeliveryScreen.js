import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute } from "@react-navigation/native";

const formatAmount = (value) => `₱${Number(value || 0).toFixed(2)}`;

const InfoRow = ({ label, value, valueStyle, multiline = false }) => (
  <View style={[styles.infoRow, multiline && styles.infoRowTop]}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text
      style={[styles.infoValue, valueStyle]}
      numberOfLines={multiline ? 10 : 2}
    >
      {value || "-"}
    </Text>
  </View>
);

const SectionCard = ({ title, icon, color, children }) => (
  <View style={styles.sectionCard}>
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionIconWrap, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    {children}
  </View>
);

const PabiliItemCard = ({ item, index }) => {
  const name = item?.itemName?.trim() || `Item ${index + 1}`;
  const qty = item?.qty?.trim() || "-";
  const specifics = item?.specifics?.trim();

  return (
    <View style={styles.itemCard}>
      <View style={styles.itemCardTop}>
        <View style={styles.itemBadge}>
          <Text style={styles.itemBadgeText}>{index + 1}</Text>
        </View>

        <View style={styles.itemMainContent}>
          <Text style={styles.itemName}>{name}</Text>

          <View style={styles.itemMetaRow}>
            <View style={styles.itemMetaPill}>
              <Ionicons name="layers-outline" size={14} color="#F97316" />
              <Text style={styles.itemMetaPillText}>Qty {qty}</Text>
            </View>
          </View>

          {!!specifics && (
            <View style={styles.itemSpecificWrap}>
              <Text style={styles.itemSpecificLabel}>Specifics</Text>
              <Text style={styles.itemSpecificText}>{specifics}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

export default function ConfirmDeliveryScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  const { serviceType, pabiliData, padalaData } = route.params || {};

  const isPabili = serviceType === "pabili";
  const isPadala = serviceType === "padala";

  const data = isPabili ? pabiliData : isPadala ? padalaData : null;

  const screenTitle = isPabili ? "Confirm Pabili" : "Confirm Padala";
  const heroColors = isPabili
    ? ["#F97316", "#FB923C"]
    : ["#10B981", "#34D399"];
  const heroIcon = isPabili ? "bag-handle" : "cube";

  const normalizedPabiliItems = useMemo(() => {
    if (!isPabili || !data) return [];

    if (Array.isArray(data?.item_rows) && data.item_rows.length > 0) {
      return data.item_rows.filter(
        (item) => item && (item.itemName || item.qty || item.specifics)
      );
    }

    return [];
  }, [isPabili, data]);

  const totalAmount = useMemo(() => {
    if (!data) return 0;

    if (isPabili) {
      const budget = Number(data?.budget || 0);
      const deliveryFee = Number(data?.estimated_delivery_fee || 0);
      const serviceFee = Number(data?.estimated_service_fee || 0);
      return Number(data?.estimated_total || budget + deliveryFee + serviceFee);
    }

    if (isPadala) {
      const baseDeliveryFee = Number(data?.base_delivery_fee || 0);
      const appFee = Number(data?.app_fee || 0);
      const fragileFee = Number(data?.fragile_fee || 0);
      return Number(
        data?.estimated_total || baseDeliveryFee + appFee + fragileFee
      );
    }

    return 0;
  }, [data, isPabili, isPadala]);

  const hasValidData = useMemo(() => {
    if (!data) return false;

    if (isPabili) {
      const hasItems =
        normalizedPabiliItems.length > 0 || !!data.items;

      return (
        !!data.storeName &&
        hasItems &&
        !!data.buyerName &&
        !!data.buyerPhone &&
        !!data.buyerEmail &&
        !!(data.storeAddress || data.pickup_location) &&
        !!(data.deliveryAddress || data.dropoff_location)
      );
    }

    if (isPadala) {
      return (
        !!data.itemName &&
        !!data.senderName &&
        !!data.senderPhone &&
        !!data.buyerEmail &&
        !!data.receiverName &&
        !!data.receiverPhone &&
        !!(data.pickupAddress || data.pickup_location) &&
        !!(data.dropoffAddress || data.dropoff_location)
      );
    }

    return false;
  }, [data, isPabili, isPadala, normalizedPabiliItems]);

  const handleProceedToNext = () => {
    if (!hasValidData) return;

    navigation.navigate("PabiliFindingDriverScreen", {
      serviceType,
      bookingData: data,
      totalAmount,
      paymentMethod: "qrph",
    });
  };

  const renderPabiliContent = () => {
    if (!data) return null;

    return (
      <>
        <SectionCard
          title="Order Summary"
          icon="receipt-outline"
          color="#F97316"
        >
          <InfoRow label="Category" value={data.category} />
          <InfoRow label="Store / Place" value={data.storeName} />
          <InfoRow
            label="Estimated budget"
            value={formatAmount(data.budget)}
          />
          <InfoRow label="Notes" value={data.notes || "None"} multiline />
        </SectionCard>

        <SectionCard
          title="Items to Buy"
          icon="bag-check-outline"
          color="#F97316"
        >
          {normalizedPabiliItems.length > 0 ? (
            <View style={styles.itemsListWrap}>
              {normalizedPabiliItems.map((item, index) => (
                <PabiliItemCard
                  key={`${item?.itemName || "item"}-${index}`}
                  item={item}
                  index={index}
                />
              ))}
            </View>
          ) : (
            <InfoRow label="Items" value={data.items} multiline />
          )}
        </SectionCard>

        <SectionCard
          title="Locations"
          icon="location-outline"
          color="#183B5C"
        >
          <InfoRow
            label="Store location"
            value={data.storeAddress || data.pickup_location}
            multiline
          />
          <InfoRow
            label="Delivery location"
            value={data.deliveryAddress || data.dropoff_location}
            multiline
          />
        </SectionCard>

        <SectionCard
          title="Estimated Payment"
          icon="card-outline"
          color="#F97316"
        >
          <InfoRow
            label="Item budget"
            value={formatAmount(data.budget)}
          />
          <InfoRow
            label="Delivery fee"
            value={formatAmount(data.estimated_delivery_fee)}
          />
          <InfoRow
            label="Service fee"
            value={formatAmount(data.estimated_service_fee)}
          />
          <View style={styles.totalDivider} />
          <InfoRow
            label="Total to pay"
            value={formatAmount(totalAmount)}
            valueStyle={styles.totalValue}
          />
        </SectionCard>

        <View style={styles.noticeCard}>
          <Ionicons name="information-circle" size={18} color="#F97316" />
          <View style={styles.noticeTextWrap}>
            <Text style={styles.noticeTitle}>Important</Text>
            <Text style={styles.noticeText}>
              Driver will only buy the item after successful payment. Final
              amount may change depending on actual store price.
            </Text>
            <Text style={styles.noticeText}>
              Once the driver has purchased the item, cancellation is no longer
              allowed.
            </Text>
          </View>
        </View>
      </>
    );
  };

  const renderPadalaContent = () => {
    if (!data) return null;

    return (
      <>
        <SectionCard
          title="Delivery Summary"
          icon="cube-outline"
          color="#10B981"
        >
          <InfoRow label="Item type" value={data.itemType} />
          <InfoRow label="Item description" value={data.itemName} multiline />
          <InfoRow label="Fragile item" value={data.isFragile ? "Yes" : "No"} />
          <InfoRow label="Require OTP" value={data.requireOtp ? "Yes" : "No"} />
          <InfoRow label="Notes" value={data.notes || "None"} multiline />
        </SectionCard>

        <SectionCard
          title="Locations"
          icon="location-outline"
          color="#183B5C"
        >
          <InfoRow
            label="Pickup location"
            value={data.pickupAddress || data.pickup_location}
            multiline
          />
          <InfoRow
            label="Drop-off location"
            value={data.dropoffAddress || data.dropoff_location}
            multiline
          />
        </SectionCard>

        <SectionCard
          title="Sender Details"
          icon="person-outline"
          color="#3B82F6"
        >
          <InfoRow label="Sender name" value={data.senderName} />
          <InfoRow label="Sender phone" value={data.senderPhone} />
        </SectionCard>

        <SectionCard
          title="Receiver Details"
          icon="call-outline"
          color="#8B5CF6"
        >
          <InfoRow label="Receiver name" value={data.receiverName} />
          <InfoRow label="Receiver phone" value={data.receiverPhone} />
          <InfoRow label="Payment method" value="QR Ph / GCash" />
        </SectionCard>

        <SectionCard
          title="Estimated Payment"
          icon="card-outline"
          color="#10B981"
        >
          <InfoRow
            label="Base delivery fee"
            value={formatAmount(data.base_delivery_fee)}
          />
          <InfoRow
            label="App fee"
            value={formatAmount(data.app_fee)}
          />
          {!!Number(data.fragile_fee || 0) && (
            <InfoRow
              label="Fragile handling fee"
              value={formatAmount(data.fragile_fee)}
            />
          )}
          <View style={styles.totalDivider} />
          <InfoRow
            label="Total to pay"
            value={formatAmount(totalAmount)}
            valueStyle={styles.totalValueGreen}
          />
        </SectionCard>

        <View style={[styles.noticeCard, styles.noticeCardGreen]}>
          <Ionicons
            name="shield-checkmark-outline"
            size={18}
            color="#10B981"
          />
          <View style={styles.noticeTextWrap}>
            <Text style={[styles.noticeTitle, { color: "#047857" }]}>
              Delivery Reminder
            </Text>
            <Text style={[styles.noticeText, { color: "#065F46" }]}>
              Payment is required before the driver proceeds. OTP is recommended
              for safer item handoff.
            </Text>
          </View>
        </View>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient colors={heroColors} style={styles.heroCard}>
            <View style={styles.heroIconWrap}>
              <Ionicons name={heroIcon} size={28} color="#fff" />
            </View>
            <Text style={styles.heroTitle}>{screenTitle}</Text>
            <Text style={styles.heroSubtitle}>
              Review the details carefully before proceeding to payment.
            </Text>
          </LinearGradient>

          {isPabili && renderPabiliContent()}
          {isPadala && renderPadalaContent()}

          {!isPabili && !isPadala && (
            <View style={styles.sectionCard}>
              <Text style={styles.emptyText}>
                No service data found. Please go back and try again.
              </Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            style={styles.secondaryBtn}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.secondaryBtnText}>Back</Text>
          </Pressable>

          <Pressable
            style={[styles.primaryBtn, !hasValidData && styles.primaryBtnDisabled]}
            onPress={handleProceedToNext}
            disabled={!hasValidData}
          >
            <LinearGradient
              colors={hasValidData ? heroColors : ["#D1D5DB", "#D1D5DB"]}
              style={styles.primaryGradient}
            >
              <Text style={styles.primaryBtnText}>
                {hasValidData ? "Find Driver" : "Invalid Data"}
              </Text>
              {hasValidData && (
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

  sectionCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  sectionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    paddingVertical: 8,
  },
  infoRowTop: {
    alignItems: "flex-start",
  },
  infoLabel: {
    flex: 1,
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "600",
  },
  infoValue: {
    flex: 1,
    fontSize: 13,
    color: "#111827",
    fontWeight: "700",
    textAlign: "right",
    lineHeight: 18,
  },

  itemsListWrap: {
    gap: 10,
  },
  itemCard: {
    borderWidth: 1,
    borderColor: "#FED7AA",
    backgroundColor: "#FFF7ED",
    borderRadius: 18,
    padding: 12,
  },
  itemCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  itemBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F97316",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  itemBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  itemMainContent: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
  },
  itemMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  itemMetaPill: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#FDBA74",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
  },
  itemMetaPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#C2410C",
  },
  itemSpecificWrap: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#FED7AA",
  },
  itemSpecificLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9A3412",
    marginBottom: 4,
  },
  itemSpecificText: {
    fontSize: 13,
    lineHeight: 18,
    color: "#7C2D12",
    fontWeight: "600",
  },

  totalDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 4,
  },
  totalValue: {
    color: "#F97316",
    fontSize: 15,
    fontWeight: "900",
  },
  totalValueGreen: {
    color: "#10B981",
    fontSize: 15,
    fontWeight: "900",
  },

  noticeCard: {
    marginTop: 2,
    marginBottom: 8,
    borderRadius: 20,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  noticeCardGreen: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  noticeTextWrap: {
    flex: 1,
  },
  noticeTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#C2410C",
    marginBottom: 4,
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 18,
    color: "#9A3412",
    marginBottom: 2,
  },

  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
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