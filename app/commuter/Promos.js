// screens/commuter/Promos.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";

export default function PromosScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [loading, setLoading] = useState(true);
  const [promos, setPromos] = useState([]);
  const [myVouchers, setMyVouchers] = useState([]);
  const [activeTab, setActiveTab] = useState("available"); // available, my-vouchers

  // Sample promos data - in production, fetch from database
  const samplePromos = [
    {
      id: 1,
      title: "First Ride Discount",
      description: "Get 50% off on your first ride!",
      code: "FIRST50",
      discount: "50%",
      maxDiscount: 100,
      expiryDate: "2024-12-31",
      minSpend: 50,
      image: "🎉",
      color: ["#FF6B6B", "#FF8E8E"],
      terms: "Valid for first-time users only. Maximum discount of ₱100.",
    },
    {
      id: 2,
      title: "Weekend Special",
      description: "₱20 off on weekends",
      code: "WEEKEND20",
      discount: "₱20",
      expiryDate: "2024-11-30",
      minSpend: 100,
      image: "🎪",
      color: ["#4ECDC4", "#6EE7E7"],
      terms: "Valid every Saturday and Sunday. Minimum spend of ₱100.",
    },
    {
      id: 3,
      title: "Referral Bonus",
      description: "Get ₱50 when you refer a friend",
      code: "REFER50",
      discount: "₱50",
      expiryDate: "2024-12-31",
      image: "🤝",
      color: ["#A8E6CF", "#C8F0DC"],
      terms: "Valid after your friend completes their first ride.",
    },
    {
      id: 4,
      title: "Late Night Ride",
      description: "₱30 off from 10PM to 5AM",
      code: "NIGHT30",
      discount: "₱30",
      expiryDate: "2024-10-31",
      minSpend: 150,
      image: "🌙",
      color: ["#845EC2", "#A178DF"],
      terms: "Valid only from 10PM to 5AM. Minimum spend of ₱150.",
    },
    {
      id: 5,
      title: "Group Ride",
      description: "20% off for 3+ passengers",
      code: "GROUP20",
      discount: "20%",
      maxDiscount: 150,
      expiryDate: "2024-11-15",
      image: "👥",
      color: ["#FFC75F", "#FFD966"],
      terms: "Valid for bookings with 3 or more passengers. Maximum discount of ₱150.",
    },
  ];

  const mySampleVouchers = [
    {
      id: 101,
      title: "Birthday Special",
      description: "₱50 off on your birthday month",
      code: "BDAY50",
      discount: "₱50",
      expiryDate: "2024-12-31",
      used: false,
      image: "🎂",
      color: ["#FF9671", "#FFB091"],
    },
    {
      id: 102,
      title: "5th Ride Reward",
      description: "Free ride up to ₱100",
      code: "5THRIDE",
      discount: "₱100",
      expiryDate: "2024-11-30",
      used: true,
      image: "🏆",
      color: ["#D65DB1", "#E07FC1"],
    },
  ];

  useEffect(() => {
    loadPromos();
  }, []);

  const loadPromos = async () => {
    try {
      // In production, fetch from database
      // const { data, error } = await supabase
      //   .from("promos")
      //   .select("*")
      //   .eq("active", true)
      //   .order("created_at", { ascending: false });

      // if (error) throw error;
      // setPromos(data || []);

      // Using sample data for now
      setTimeout(() => {
        setPromos(samplePromos);
        setMyVouchers(mySampleVouchers);
        setLoading(false);
      }, 1000);

    } catch (err) {
      console.log("Error loading promos:", err);
      setLoading(false);
    }
  };

  const handleRedeem = (promo) => {
    Alert.alert(
      "Redeem Promo",
      `Are you sure you want to redeem ${promo.title}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Redeem",
          onPress: () => {
            Alert.alert(
              "Promo Code",
              `Your promo code is: ${promo.code}\n\nUse this code on your next booking.`,
              [{ text: "OK" }]
            );
          },
        },
      ]
    );
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

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
        <Text style={styles.headerTitle}>Promos & Vouchers</Text>
        <Pressable style={styles.historyButton}>
          <Ionicons name="time-outline" size={24} color="#183B5C" />
        </Pressable>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <Pressable
          style={[styles.tab, activeTab === "available" && styles.tabActive]}
          onPress={() => setActiveTab("available")}
        >
          <Text style={[styles.tabText, activeTab === "available" && styles.tabTextActive]}>
            Available
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "my-vouchers" && styles.tabActive]}
          onPress={() => setActiveTab("my-vouchers")}
        >
          <Text style={[styles.tabText, activeTab === "my-vouchers" && styles.tabTextActive]}>
            My Vouchers
          </Text>
          {myVouchers.filter(v => !v.used).length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {myVouchers.filter(v => !v.used).length}
              </Text>
            </View>
          )}
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {activeTab === "available" ? (
          // Available Promos
          <View style={styles.promoList}>
            {promos.map((promo) => (
              <LinearGradient
                key={promo.id}
                colors={promo.color}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.promoCard}
              >
                <View style={styles.promoHeader}>
                  <Text style={styles.promoEmoji}>{promo.image}</Text>
                  <View style={styles.discountBadge}>
                    <Text style={styles.discountText}>{promo.discount}</Text>
                  </View>
                </View>

                <View style={styles.promoBody}>
                  <Text style={styles.promoTitle}>{promo.title}</Text>
                  <Text style={styles.promoDescription}>{promo.description}</Text>
                  
                  <View style={styles.promoDetails}>
                    <View style={styles.detailRow}>
                      <Ionicons name="calendar-outline" size={14} color="#FFF" />
                      <Text style={styles.detailText}>
                        Expires: {formatDate(promo.expiryDate)}
                      </Text>
                    </View>
                    {promo.minSpend && (
                      <View style={styles.detailRow}>
                        <Ionicons name="cash-outline" size={14} color="#FFF" />
                        <Text style={styles.detailText}>
                          Min. spend: ₱{promo.minSpend}
                        </Text>
                      </View>
                    )}
                  </View>

                  <Pressable
                    style={styles.redeemButton}
                    onPress={() => handleRedeem(promo)}
                  >
                    <Text style={styles.redeemButtonText}>Redeem</Text>
                  </Pressable>
                </View>
              </LinearGradient>
            ))}
          </View>
        ) : (
          // My Vouchers
          <View style={styles.voucherList}>
            {myVouchers.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="ticket-outline" size={64} color="#D1D5DB" />
                <Text style={styles.emptyStateTitle}>No Vouchers Yet</Text>
                <Text style={styles.emptyStateText}>
                  Redeem promos to get vouchers
                </Text>
              </View>
            ) : (
              myVouchers.map((voucher) => (
                <LinearGradient
                  key={voucher.id}
                  colors={voucher.used ? ["#E5E7EB", "#F3F4F6"] : voucher.color}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.voucherCard, voucher.used && styles.voucherUsed]}
                >
                  <View style={styles.voucherLeft}>
                    <Text style={styles.voucherEmoji}>{voucher.image}</Text>
                  </View>
                  
                  <View style={styles.voucherMiddle}>
                    <Text style={[styles.voucherTitle, voucher.used && styles.textUsed]}>
                      {voucher.title}
                    </Text>
                    <Text style={[styles.voucherDescription, voucher.used && styles.textUsed]}>
                      {voucher.description}
                    </Text>
                    <Text style={[styles.voucherCode, voucher.used && styles.textUsed]}>
                      Code: {voucher.code}
                    </Text>
                  </View>

                  <View style={styles.voucherRight}>
                    <Text style={[styles.voucherDiscount, voucher.used && styles.textUsed]}>
                      {voucher.discount}
                    </Text>
                    <Text style={[styles.voucherExpiry, voucher.used && styles.textUsed]}>
                      {formatDate(voucher.expiryDate)}
                    </Text>
                    {voucher.used && (
                      <View style={styles.usedBadge}>
                        <Text style={styles.usedText}>Used</Text>
                      </View>
                    )}
                  </View>
                </LinearGradient>
              ))
            )}
          </View>
        )}

        {/* Info Section */}
        <View style={styles.infoSection}>
          <Ionicons name="information-circle" size={20} color="#183B5C" />
          <Text style={styles.infoText}>
            Promos cannot be combined with other discounts. Each promo code can only be used once.
          </Text>
        </View>
      </ScrollView>
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
  historyButton: {
    padding: 8,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    marginHorizontal: 5,
    borderRadius: 20,
  },
  tabActive: {
    backgroundColor: "#183B5C",
  },
  tabText: {
    fontSize: 14,
    color: "#666",
  },
  tabTextActive: {
    color: "#FFF",
    fontWeight: "500",
  },
  badge: {
    backgroundColor: "#EF4444",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
  },
  badgeText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "600",
  },
  promoList: {
    padding: 20,
  },
  promoCard: {
    borderRadius: 20,
    marginBottom: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  promoHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
  },
  promoEmoji: {
    fontSize: 48,
  },
  discountBadge: {
    backgroundColor: "rgba(255,255,255,0.3)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  discountText: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "bold",
  },
  promoBody: {
    padding: 20,
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  promoTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFF",
    marginBottom: 4,
  },
  promoDescription: {
    fontSize: 14,
    color: "#FFF",
    opacity: 0.9,
    marginBottom: 12,
  },
  promoDetails: {
    marginBottom: 15,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  detailText: {
    marginLeft: 6,
    fontSize: 12,
    color: "#FFF",
    opacity: 0.9,
  },
  redeemButton: {
    backgroundColor: "#FFF",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  redeemButtonText: {
    color: "#183B5C",
    fontSize: 16,
    fontWeight: "600",
  },
  voucherList: {
    padding: 20,
  },
  voucherCard: {
    flexDirection: "row",
    borderRadius: 16,
    marginBottom: 15,
    padding: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  voucherUsed: {
    opacity: 0.7,
  },
  voucherLeft: {
    marginRight: 15,
    justifyContent: "center",
  },
  voucherEmoji: {
    fontSize: 36,
  },
  voucherMiddle: {
    flex: 1,
  },
  voucherTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  voucherDescription: {
    fontSize: 13,
    color: "#666",
    marginBottom: 4,
  },
  voucherCode: {
    fontSize: 12,
    color: "#183B5C",
    fontWeight: "500",
  },
  voucherRight: {
    alignItems: "flex-end",
    justifyContent: "center",
  },
  voucherDiscount: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  voucherExpiry: {
    fontSize: 10,
    color: "#999",
  },
  usedBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 4,
  },
  usedText: {
    fontSize: 10,
    color: "#999",
    fontWeight: "500",
  },
  textUsed: {
    color: "#999",
  },
  emptyState: {
    alignItems: "center",
    padding: 40,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginTop: 20,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#666",
    marginTop: 8,
    textAlign: "center",
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
});