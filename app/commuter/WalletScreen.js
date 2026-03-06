// screens/commuter/WalletScreen.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";

export default function CommuterWalletScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [commuterId, setCommuterId] = useState(null);
  const [commuter, setCommuter] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [recentBookings, setRecentBookings] = useState([]);
  const [availablePromos, setAvailablePromos] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [pointsHistory, setPointsHistory] = useState([]);
  const [referralInfo, setReferralInfo] = useState(null);
  
  // Cash-in modal
  const [showCashInModal, setShowCashInModal] = useState(false);
  const [cashInAmount, setCashInAmount] = useState("");
  const [cashInMethod, setCashInMethod] = useState("gcash");
  const [processingCashIn, setProcessingCashIn] = useState(false);
  const [proofImage, setProofImage] = useState(null);

  // Promo modal
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [applyingPromo, setApplyingPromo] = useState(false);

  // Stats
  const [totalSpent, setTotalSpent] = useState(0);
  const [totalTrips, setTotalTrips] = useState(0);
  const [points, setPoints] = useState(0);
  const [referralEarnings, setReferralEarnings] = useState(0);

  useFocusEffect(
    React.useCallback(() => {
      loadCommuterData();
    }, [])
  );

  const loadCommuterData = async () => {
    try {
      const id = await AsyncStorage.getItem("user_id");
      setCommuterId(id);
      
      if (id) {
        await Promise.all([
          fetchCommuterProfile(id),
          fetchWallet(id),
          fetchTransactions(id),
          fetchRecentBookings(id),
          fetchStats(id),
          fetchAvailablePromos(id),
          fetchPaymentMethods(id),
          fetchPointsHistory(id),
          fetchReferralInfo(id)
        ]);
      }
    } catch (err) {
      console.log("Error loading commuter data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchCommuterProfile = async (id) => {
    try {
      const { data, error } = await supabase
        .from("commuters")
        .select("first_name, last_name, phone, email, profile_picture")
        .eq("id", id)
        .single();

      if (error) throw error;
      setCommuter(data);
    } catch (err) {
      console.log("Error fetching commuter profile:", err);
    }
  };

  const fetchWallet = async (id) => {
    try {
      const { data, error } = await supabase
        .from("commuter_wallets")
        .select("*")
        .eq("commuter_id", id)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        setWallet(data);
        setPoints(data.points || 0);
      } else {
        // Create wallet if doesn't exist
        const { data: newWallet, error: createError } = await supabase
          .from("commuter_wallets")
          .insert([
            {
              commuter_id: id,
              balance: 0,
              points: 0,
            },
          ])
          .select()
          .single();

        if (createError) throw createError;
        setWallet(newWallet);
      }
    } catch (err) {
      console.log("Error fetching wallet:", err);
    }
  };

  const fetchTransactions = async (id) => {
    try {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", id)
        .eq("user_type", "commuter")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setTransactions(data || []);
    } catch (err) {
      console.log("Error fetching transactions:", err);
    }
  };

  const fetchRecentBookings = async (id) => {
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id,
          booking_reference,
          fare,
          payment_type,
          payment_status,
          created_at,
          pickup_location,
          dropoff_location,
          commuter_rating
        `)
        .eq("commuter_id", id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      setRecentBookings(data || []);
    } catch (err) {
      console.log("Error fetching recent bookings:", err);
    }
  };

  const fetchAvailablePromos = async (id) => {
    try {
      const now = new Date().toISOString();
      
      const { data, error } = await supabase
        .from("promos")
        .select(`
          *,
          commuter_promos!left (
            id,
            used_at,
            booking_id
          )
        `)
        .eq("is_active", true)
        .gte("end_date", now)
        .lte("start_date", now)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Filter promos based on usage limits
      const availablePromos = data?.filter(promo => {
        if (!promo.usage_limit) return true;
        const usageCount = promo.commuter_promos?.length || 0;
        return usageCount < promo.usage_limit;
      }) || [];

      setAvailablePromos(availablePromos);
    } catch (err) {
      console.log("Error fetching promos:", err);
    }
  };

  const fetchPaymentMethods = async (id) => {
    try {
      const { data, error } = await supabase
        .from("commuter_payment_methods")
        .select("*")
        .eq("commuter_id", id)
        .order("is_default", { ascending: false });

      if (error) throw error;
      setPaymentMethods(data || []);
    } catch (err) {
      console.log("Error fetching payment methods:", err);
    }
  };

  const fetchPointsHistory = async (id) => {
    try {
      const { data, error } = await supabase
        .from("commuter_points_history")
        .select("*")
        .eq("commuter_id", id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      setPointsHistory(data || []);
    } catch (err) {
      console.log("Error fetching points history:", err);
    }
  };

  const fetchReferralInfo = async (id) => {
    try {
      // Get referrals made by this commuter
      const { data: referrals, error: refError } = await supabase
        .from("referrals")
        .select(`
          *,
          referred:referred_id (
            id,
            user_type
          ),
          commissions (
            id,
            amount,
            status,
            paid_at
          )
        `)
        .eq("referrer_id", id)
        .eq("referrer_type", "commuter");

      if (refError) throw refError;

      // Calculate total referral earnings
      const totalEarnings = referrals?.reduce((sum, ref) => {
        const commissionSum = ref.commissions?.reduce((cSum, comm) => 
          cSum + (comm.status === 'paid' ? comm.amount : 0), 0) || 0;
        return sum + commissionSum;
      }, 0) || 0;

      setReferralInfo({
        referrals: referrals || [],
        totalEarnings: totalEarnings
      });
      setReferralEarnings(totalEarnings);
    } catch (err) {
      console.log("Error fetching referral info:", err);
    }
  };

  const fetchStats = async (id) => {
    try {
      // Get total spent from wallet transactions
      const { data: spentData, error: spentError } = await supabase
        .from("transactions")
        .select("amount")
        .eq("user_id", id)
        .eq("user_type", "commuter")
        .eq("type", "payment");

      if (spentError) throw spentError;
      
      const total = spentData?.reduce((sum, t) => sum + t.amount, 0) || 0;
      setTotalSpent(total);

      // Get total trips
      const { count, error: tripsError } = await supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("commuter_id", id)
        .eq("status", "completed");

      if (tripsError) throw tripsError;
      setTotalTrips(count || 0);

    } catch (err) {
      console.log("Error fetching stats:", err);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadCommuterData();
  };

  // ================= POINTS SYSTEM =================
  const calculatePointsEarned = (fare) => {
    // 1 point for every ₱10 spent
    return Math.floor(fare / 10);
  };

  const addPoints = async (source, sourceId, points, description) => {
    try {
      // Update wallet points
      const newPoints = (wallet?.points || 0) + points;
      
      await supabase
        .from("commuter_wallets")
        .update({ 
          points: newPoints,
          updated_at: new Date()
        })
        .eq("commuter_id", commuterId);

      // Add to points history
      await supabase
        .from("commuter_points_history")
        .insert({
          commuter_id: commuterId,
          points: points,
          type: "earned",
          source: source,
          source_id: sourceId,
          description: description,
          created_at: new Date()
        });

      setPoints(newPoints);
    } catch (err) {
      console.log("Error adding points:", err);
    }
  };

  const redeemPoints = async (pointsToRedeem, description) => {
    try {
      if ((wallet?.points || 0) < pointsToRedeem) {
        Alert.alert("Insufficient Points", "You don't have enough points.");
        return false;
      }

      const newPoints = (wallet?.points || 0) - pointsToRedeem;
      
      await supabase
        .from("commuter_wallets")
        .update({ 
          points: newPoints,
          updated_at: new Date()
        })
        .eq("commuter_id", commuterId);

      await supabase
        .from("commuter_points_history")
        .insert({
          commuter_id: commuterId,
          points: pointsToRedeem,
          type: "redeemed",
          source: "promo",
          description: description,
          created_at: new Date()
        });

      setPoints(newPoints);
      return true;
    } catch (err) {
      console.log("Error redeeming points:", err);
      return false;
    }
  };

  // ================= PROMO SYSTEM =================
  const handleApplyPromo = async () => {
    if (!promoCode.trim()) {
      Alert.alert("Error", "Please enter a promo code");
      return;
    }

    setApplyingPromo(true);

    try {
      const { data: promo, error } = await supabase
        .from("promos")
        .select("*")
        .eq("promo_code", promoCode.toUpperCase())
        .eq("is_active", true)
        .single();

      if (error) throw error;

      // Check if promo is within date range
      const now = new Date();
      const startDate = new Date(promo.start_date);
      const endDate = new Date(promo.end_date);

      if (now < startDate) {
        Alert.alert("Not Yet Available", "This promo hasn't started yet.");
        return;
      }

      if (now > endDate) {
        Alert.alert("Expired", "This promo has expired.");
        return;
      }

      // Check if user has already used this promo
      const { count, error: usageError } = await supabase
        .from("commuter_promos")
        .select("*", { count: "exact", head: true })
        .eq("commuter_id", commuterId)
        .eq("promo_id", promo.id);

      if (usageError) throw usageError;

      if (promo.user_limit && count >= promo.user_limit) {
        Alert.alert("Limit Reached", "You have already used this promo.");
        return;
      }

      // Check if promo requires points
      if (promo.points_required && (wallet?.points || 0) < promo.points_required) {
        Alert.alert(
          "Insufficient Points", 
          `You need ${promo.points_required} points to use this promo.`
        );
        return;
      }

      // Store promo in context/navigation for booking
      Alert.alert(
        "Promo Applied!",
        `${promo.title}\n\n${promo.description}\n\nDiscount: ${
          promo.discount_type === 'percentage' ? `${promo.discount_value}%` : `₱${promo.discount_value}`
        }`,
        [
          { 
            text: "Use on Next Booking", 
            onPress: () => {
              // Save promo to AsyncStorage for booking screen
              AsyncStorage.setItem("active_promo", JSON.stringify({
                id: promo.id,
                code: promo.promo_code,
                discount_type: promo.discount_type,
                discount_value: promo.discount_value,
                min_spend: promo.min_spend,
                max_discount: promo.max_discount
              }));
              setShowPromoModal(false);
              setPromoCode("");
            }
          }
        ]
      );

    } catch (err) {
      console.log("Error applying promo:", err);
      Alert.alert("Invalid Promo", "The promo code you entered is invalid.");
    } finally {
      setApplyingPromo(false);
    }
  };

  // ================= CASH-IN SYSTEM =================
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      setProofImage(result.assets[0].uri);
    }
  };

  const generateReferenceNumber = () => {
    return `CASH-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  };

  const handleCashIn = async () => {
    if (!cashInAmount || parseFloat(cashInAmount) < 20) {
      Alert.alert("Invalid Amount", "Minimum cash-in amount is ₱20");
      return;
    }

    if (cashInMethod === "gcash" && !proofImage) {
      Alert.alert("Proof Required", "Please upload a screenshot of your GCash payment.");
      return;
    }

    setProcessingCashIn(true);

    try {
      const referenceNumber = generateReferenceNumber();
      
      // Upload proof image if exists
      let proofUrl = null;
      if (proofImage) {
        const fileName = `cashin/${commuterId}/${referenceNumber}.jpg`;
        const response = await fetch(proofImage);
        const blob = await response.blob();
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("payments")
          .upload(fileName, blob);

        if (!uploadError) {
          proofUrl = supabase.storage.from("payments").getPublicUrl(fileName).data.publicUrl;
        }
      }

      // Create cash-in request
      const { data: cashInRequest, error: requestError } = await supabase
        .from("cash_in_requests")
        .insert([
          {
            commuter_id: commuterId,
            amount: parseFloat(cashInAmount),
            payment_method: cashInMethod,
            reference_number: referenceNumber,
            status: "pending",
            proof_of_payment: proofUrl,
            metadata: {
              method: cashInMethod,
              requested_at: new Date().toISOString()
            },
            created_at: new Date()
          }
        ])
        .select()
        .single();

      if (requestError) throw requestError;

      // Create transaction record
      await supabase
        .from("transactions")
        .insert([
          {
            user_id: commuterId,
            user_type: "commuter",
            type: "cash_in",
            amount: parseFloat(cashInAmount),
            status: "pending",
            metadata: {
              cash_in_request_id: cashInRequest.id,
              method: cashInMethod,
              reference: referenceNumber
            },
            created_at: new Date()
          }
        ]);

      // Show instructions based on payment method
      if (cashInMethod === "gcash") {
        Alert.alert(
          "GCash Payment",
          `Please send ₱${cashInAmount} to:\n\nGCash Number: 0912 345 6789\nName: SAKAY NA TRANSACTIONS INC.\n\nReference: ${referenceNumber}\n\nYour wallet will be updated once payment is verified.`,
          [{ text: "OK", onPress: () => setShowCashInModal(false) }]
        );
      } else if (cashInMethod === "cash") {
        Alert.alert(
          "Cash Payment",
          `Please pay ₱${cashInAmount} at any:\n\n• 7-Eleven (CLIQQ)\n• Bayad Center\n• SM Bills Payment\n• Cebuana Lhuillier\n\nReference: ${referenceNumber}\n\nShow this reference number to the cashier.`,
          [{ text: "OK", onPress: () => setShowCashInModal(false) }]
        );
      } else if (cashInMethod === "card") {
        Alert.alert(
          "Card Payment",
          `You will be redirected to our secure payment gateway to complete the payment of ₱${cashInAmount}.`,
          [
            { text: "Cancel", style: "cancel" },
            { 
              text: "Proceed to Payment", 
              onPress: () => {
                // Integrate with payment gateway (PayMongo, etc.)
                navigation.navigate("CardPayment", {
                  amount: cashInAmount,
                  reference: referenceNumber,
                  onSuccess: () => {
                    refreshWalletAfterCashIn(cashInRequest.id, parseFloat(cashInAmount));
                  }
                });
              }
            }
          ]
        );
      }

      // Reset form
      setCashInAmount("");
      setProofImage(null);

    } catch (err) {
      console.log("Error processing cash in:", err);
      Alert.alert("Error", "Failed to process cash-in request");
    } finally {
      setProcessingCashIn(false);
    }
  };

  const refreshWalletAfterCashIn = async (requestId, amount) => {
    try {
      // Update cash-in request status
      await supabase
        .from("cash_in_requests")
        .update({ 
          status: "completed",
          processed_at: new Date()
        })
        .eq("id", requestId);

      // Update transaction status
      await supabase
        .from("transactions")
        .update({ status: "completed" })
        .eq("metadata->cash_in_request_id", requestId);

      // Update wallet balance
      const newBalance = (wallet?.balance || 0) + amount;
      
      await supabase
        .from("commuter_wallets")
        .update({ 
          balance: newBalance,
          updated_at: new Date()
        })
        .eq("commuter_id", commuterId);

      // Refresh wallet data
      await fetchWallet(commuterId);
      await fetchTransactions(commuterId);

      Alert.alert("Success", "Your wallet has been updated!");
    } catch (err) {
      console.log("Error refreshing wallet:", err);
    }
  };

  // ================= PAYMENT METHODS =================
  const handleAddPaymentMethod = async (methodType) => {
    navigation.navigate("AddPaymentMethod", {
      methodType,
      onSuccess: () => {
        fetchPaymentMethods(commuterId);
      }
    });
  };

  const handleSetDefaultMethod = async (methodId) => {
    try {
      // Remove default from all
      await supabase
        .from("commuter_payment_methods")
        .update({ is_default: false })
        .eq("commuter_id", commuterId);

      // Set new default
      await supabase
        .from("commuter_payment_methods")
        .update({ is_default: true })
        .eq("id", methodId);

      fetchPaymentMethods(commuterId);
    } catch (err) {
      console.log("Error setting default method:", err);
    }
  };

  const handleRemovePaymentMethod = async (methodId) => {
    Alert.alert(
      "Remove Payment Method",
      "Are you sure you want to remove this payment method?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await supabase
                .from("commuter_payment_methods")
                .delete()
                .eq("id", methodId);

              fetchPaymentMethods(commuterId);
            } catch (err) {
              console.log("Error removing payment method:", err);
            }
          }
        }
      ]
    );
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatCurrency = (amount) => {
    return `₱${amount?.toFixed(2) || "0.00"}`;
  };

  const getTransactionIcon = (type, metadata) => {
    switch (type) {
      case "cash_in":
        return { name: "arrow-down-circle", color: "#10B981" };
      case "payment":
        return { name: "arrow-up-circle", color: "#EF4444" };
      case "refund":
        return { name: "repeat", color: "#F59E0B" };
      case "bonus":
        return { name: "gift", color: "#8B5CF6" };
      default:
        return { name: "swap-horizontal", color: "#6B7280" };
    }
  };

  // Cash-in Modal
  const CashInModal = () => (
    <Modal
      visible={showCashInModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowCashInModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Cash In</Text>
            <Pressable onPress={() => {
              setShowCashInModal(false);
              setProofImage(null);
              setCashInAmount("");
            }}>
              <Ionicons name="close" size={24} color="#666" />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.modalLabel}>Amount</Text>
            <View style={styles.amountInputContainer}>
              <Text style={styles.currencySymbol}>₱</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                keyboardType="numeric"
                value={cashInAmount}
                onChangeText={setCashInAmount}
                editable={!processingCashIn}
              />
            </View>

            <Text style={styles.modalLabel}>Payment Method</Text>
            <View style={styles.paymentMethods}>
              <Pressable
                style={[
                  styles.paymentMethod,
                  cashInMethod === "gcash" && styles.paymentMethodSelected,
                ]}
                onPress={() => setCashInMethod("gcash")}
              >
                <Ionicons 
                  name="phone-portrait" 
                  size={24} 
                  color={cashInMethod === "gcash" ? "#FFF" : "#666"} 
                />
                <Text
                  style={[
                    styles.paymentMethodText,
                    cashInMethod === "gcash" && styles.paymentMethodTextSelected,
                  ]}
                >
                  GCash
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.paymentMethod,
                  cashInMethod === "cash" && styles.paymentMethodSelected,
                ]}
                onPress={() => setCashInMethod("cash")}
              >
                <Ionicons 
                  name="cash" 
                  size={24} 
                  color={cashInMethod === "cash" ? "#FFF" : "#666"} 
                />
                <Text
                  style={[
                    styles.paymentMethodText,
                    cashInMethod === "cash" && styles.paymentMethodTextSelected,
                  ]}
                >
                  Cash
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.paymentMethod,
                  cashInMethod === "card" && styles.paymentMethodSelected,
                ]}
                onPress={() => setCashInMethod("card")}
              >
                <Ionicons 
                  name="card" 
                  size={24} 
                  color={cashInMethod === "card" ? "#FFF" : "#666"} 
                />
                <Text
                  style={[
                    styles.paymentMethodText,
                    cashInMethod === "card" && styles.paymentMethodTextSelected,
                  ]}
                >
                  Card
                </Text>
              </Pressable>
            </View>

            {cashInMethod === "gcash" && (
              <View style={styles.gcashInstructions}>
                <Text style={styles.instructionTitle}>GCash Payment Steps:</Text>
                <Text style={styles.instructionText}>1. Open GCash app</Text>
                <Text style={styles.instructionText}>2. Send to: 0912 345 6789</Text>
                <Text style={styles.instructionText}>3. Take a screenshot of the receipt</Text>
                
                <Pressable style={styles.uploadButton} onPress={pickImage}>
                  <Ionicons name="cloud-upload" size={20} color="#183B5C" />
                  <Text style={styles.uploadButtonText}>
                    {proofImage ? "Change Receipt" : "Upload Payment Receipt"}
                  </Text>
                </Pressable>

                {proofImage && (
                  <View style={styles.imagePreview}>
                    <Image source={{ uri: proofImage }} style={styles.previewImage} />
                    <Pressable onPress={() => setProofImage(null)}>
                      <Ionicons name="close-circle" size={24} color="#EF4444" />
                    </Pressable>
                  </View>
                )}
              </View>
            )}

            {cashInMethod === "cash" && (
              <View style={styles.cashInstructions}>
                <Text style={styles.instructionTitle}>Cash Payment Options:</Text>
                <Text style={styles.instructionText}>• 7-Eleven (CLIQQ)</Text>
                <Text style={styles.instructionText}>• Bayad Center</Text>
                <Text style={styles.instructionText}>• SM Bills Payment</Text>
                <Text style={styles.instructionText}>• Cebuana Lhuillier</Text>
                <Text style={styles.instructionNote}>
                  Show the reference number to the cashier
                </Text>
              </View>
            )}

            {cashInMethod === "card" && (
              <View style={styles.cardInstructions}>
                <Text style={styles.instructionTitle}>Card Payment:</Text>
                <Text style={styles.instructionText}>
                  You will be redirected to our secure payment gateway.
                </Text>
                <Text style={styles.instructionNote}>
                  We accept Visa, Mastercard, and JCB
                </Text>
              </View>
            )}

            <Pressable
              style={[
                styles.confirmButton,
                (processingCashIn || (cashInMethod === "gcash" && !proofImage)) && styles.confirmButtonDisabled,
              ]}
              onPress={handleCashIn}
              disabled={processingCashIn || (cashInMethod === "gcash" && !proofImage)}
            >
              {processingCashIn ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.confirmButtonText}>Proceed</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  // Promo Modal
  const PromoModal = () => (
    <Modal
      visible={showPromoModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowPromoModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Enter Promo Code</Text>
            <Pressable onPress={() => setShowPromoModal(false)}>
              <Ionicons name="close" size={24} color="#666" />
            </Pressable>
          </View>

          <TextInput
            style={styles.promoInput}
            placeholder="Enter promo code"
            value={promoCode}
            onChangeText={(text) => setPromoCode(text.toUpperCase())}
            autoCapitalize="characters"
          />

          {availablePromos.length > 0 && (
            <View style={styles.availablePromos}>
              <Text style={styles.availablePromosTitle}>Available for you:</Text>
              {availablePromos.slice(0, 3).map((promo) => (
                <View key={promo.id} style={styles.promoItem}>
                  <View style={styles.promoIcon}>
                    <Ionicons name="pricetag" size={20} color="#183B5C" />
                  </View>
                  <View style={styles.promoInfo}>
                    <Text style={styles.promoCode}>{promo.promo_code}</Text>
                    <Text style={styles.promoDescription}>{promo.title}</Text>
                  </View>
                  <Pressable
                    style={styles.usePromoButton}
                    onPress={() => {
                      setPromoCode(promo.promo_code);
                    }}
                  >
                    <Text style={styles.usePromoText}>Use</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <Pressable
            style={[styles.applyButton, applyingPromo && styles.applyButtonDisabled]}
            onPress={handleApplyPromo}
            disabled={applyingPromo}
          >
            {applyingPromo ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.applyButtonText}>Apply Promo</Text>
            )}
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
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Wallet</Text>
          <View style={styles.headerActions}>
            <Pressable 
              style={styles.headerButton}
              onPress={() => navigation.navigate("Referrals")}
            >
              <Ionicons name="people" size={22} color="#183B5C" />
            </Pressable>
            <Pressable 
              style={styles.headerButton}
              onPress={() => navigation.navigate("TransactionHistory")}
            >
              <Ionicons name="time-outline" size={24} color="#183B5C" />
            </Pressable>
          </View>
        </View>

        {/* Balance Card */}
        <LinearGradient
          colors={["#183B5C", "#2C5A7A"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.balanceCard}
        >
          <View style={styles.balanceHeader}>
            <Text style={styles.balanceLabel}>Total Balance</Text>
            <View style={styles.pointsBadge}>
              <Ionicons name="star" size={14} color="#FFB37A" />
              <Text style={styles.pointsText}>{points} pts</Text>
            </View>
          </View>
          
          <Text style={styles.balanceAmount}>
            {formatCurrency(wallet?.balance)}
          </Text>

          <View style={styles.balanceFooter}>
            <View style={styles.balanceItem}>
              <Text style={styles.balanceItemLabel}>Total Spent</Text>
              <Text style={styles.balanceItemValue}>{formatCurrency(totalSpent)}</Text>
            </View>
            <View style={styles.balanceDivider} />
            <View style={styles.balanceItem}>
              <Text style={styles.balanceItemLabel}>Total Trips</Text>
              <Text style={styles.balanceItemValue}>{totalTrips}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Action Buttons */}
        <View style={styles.actionGrid}>
          <Pressable 
            style={styles.actionButton}
            onPress={() => setShowCashInModal(true)}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#E3F2FD" }]}>
              <Ionicons name="add-circle" size={24} color="#183B5C" />
            </View>
            <Text style={styles.actionText}>Cash In</Text>
          </Pressable>

          <Pressable 
            style={styles.actionButton}
            onPress={() => navigation.navigate("PaymentMethods", {
              methods: paymentMethods,
              onAdd: handleAddPaymentMethod,
              onSetDefault: handleSetDefaultMethod,
              onRemove: handleRemovePaymentMethod
            })}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#E8F5E9" }]}>
              <Ionicons name="card" size={24} color="#10B981" />
            </View>
            <Text style={styles.actionText}>Payment Methods</Text>
          </Pressable>

          <Pressable 
            style={styles.actionButton}
            onPress={() => setShowPromoModal(true)}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#FFF3E0" }]}>
              <Ionicons name="pricetag" size={24} color="#FFB37A" />
            </View>
            <Text style={styles.actionText}>Promos</Text>
          </Pressable>

          <Pressable 
            style={styles.actionButton}
            onPress={() => navigation.navigate("PointsRewards", {
              points: points,
              history: pointsHistory,
              onRedeem: redeemPoints
            })}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#F3E5F5" }]}>
              <Ionicons name="gift" size={24} color="#8B5CF6" />
            </View>
            <Text style={styles.actionText}>Points</Text>
          </Pressable>
        </View>

        {/* Referral Card (if has referrals) */}
        {referralInfo && referralInfo.referrals.length > 0 && (
          <Pressable 
            style={styles.referralCard}
            onPress={() => navigation.navigate("Referrals")}
          >
            <View style={styles.referralIcon}>
              <Ionicons name="people-circle" size={40} color="#183B5C" />
            </View>
            <View style={styles.referralInfo}>
              <Text style={styles.referralTitle}>Referral Earnings</Text>
              <Text style={styles.referralValue}>{formatCurrency(referralEarnings)}</Text>
              <Text style={styles.referralCount}>
                {referralInfo.referrals.length} friend{referralInfo.referrals.length > 1 ? 's' : ''} referred
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </Pressable>
        )}

        {/* Recent Transactions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Transactions</Text>
            <Pressable onPress={() => navigation.navigate("TransactionHistory")}>
              <Text style={styles.seeAllText}>See All</Text>
            </Pressable>
          </View>

          {transactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="swap-horizontal" size={48} color="#D1D5DB" />
              <Text style={styles.emptyStateTitle}>No Transactions Yet</Text>
              <Text style={styles.emptyStateText}>
                Your transactions will appear here
              </Text>
            </View>
          ) : (
            transactions.slice(0, 5).map((transaction) => {
              const icon = getTransactionIcon(transaction.type);
              return (
                <View key={transaction.id} style={styles.transactionItem}>
                  <View style={[styles.transactionIcon, { backgroundColor: icon.color + "20" }]}>
                    <Ionicons name={icon.name} size={20} color={icon.color} />
                  </View>
                  <View style={styles.transactionInfo}>
                    <Text style={styles.transactionType}>
                      {transaction.type === "cash_in" ? "Cash In" : 
                       transaction.type === "payment" ? "Trip Payment" : 
                       transaction.type === "refund" ? "Refund" :
                       transaction.type === "bonus" ? "Bonus" : 
                       transaction.type}
                    </Text>
                    <Text style={styles.transactionDate}>
                      {formatDate(transaction.created_at)}
                    </Text>
                    {transaction.metadata?.reference && (
                      <Text style={styles.transactionRef}>
                        Ref: {transaction.metadata.reference}
                      </Text>
                    )}
                  </View>
                  <View style={styles.transactionAmount}>
                    <Text
                      style={[
                        styles.transactionAmountText,
                        transaction.type === "cash_in" && styles.positiveAmount,
                        transaction.type === "payment" && styles.negativeAmount,
                        transaction.type === "refund" && styles.refundAmount,
                        transaction.type === "bonus" && styles.bonusAmount,
                      ]}
                    >
                      {transaction.type === "cash_in" ? "+" : 
                       transaction.type === "payment" ? "-" : 
                       transaction.type === "refund" ? "+" : 
                       transaction.type === "bonus" ? "+" : ""}
                      {formatCurrency(transaction.amount)}
                    </Text>
                    <View style={[
                      styles.transactionStatusBadge,
                      transaction.status === "completed" ? styles.statusCompleted :
                      transaction.status === "pending" ? styles.statusPending :
                      styles.statusFailed
                    ]}>
                      <Text style={styles.transactionStatusText}>
                        {transaction.status}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Recent Bookings */}
        {recentBookings.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Trips</Text>
              <Pressable onPress={() => navigation.navigate("TripHistory")}>
                <Text style={styles.seeAllText}>See All</Text>
              </Pressable>
            </View>

            {recentBookings.map((booking) => (
              <Pressable
                key={booking.id}
                style={styles.bookingItem}
                onPress={() => navigation.navigate("BookingDetails", { id: booking.id })}
              >
                <View style={styles.bookingIcon}>
                  <Ionicons name="car" size={20} color="#183B5C" />
                </View>
                <View style={styles.bookingInfo}>
                  <Text style={styles.bookingReference} numberOfLines={1}>
                    {booking.booking_reference || "Trip"}
                  </Text>
                  <Text style={styles.bookingRoute} numberOfLines={1}>
                    {booking.pickup_location?.split(",")[0]} → {booking.dropoff_location?.split(",")[0]}
                  </Text>
                  <Text style={styles.bookingDate}>{formatDate(booking.created_at)}</Text>
                </View>
                <View style={styles.bookingAmount}>
                  <Text style={styles.bookingAmountText}>
                    {formatCurrency(booking.fare)}
                  </Text>
                  <View style={styles.pointsEarned}>
                    <Ionicons name="star" size={12} color="#FFB37A" />
                    <Text style={styles.pointsEarnedText}>
                      +{calculatePointsEarned(booking.fare)} pts
                    </Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* Quick Stats */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Ionicons name="wallet-outline" size={24} color="#183B5C" />
            <Text style={styles.statValue}>{formatCurrency(wallet?.balance)}</Text>
            <Text style={styles.statLabel}>Current Balance</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="card-outline" size={24} color="#10B981" />
            <Text style={styles.statValue}>{formatCurrency(totalSpent)}</Text>
            <Text style={styles.statLabel}>Total Spent</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="star-outline" size={24} color="#FFB37A" />
            <Text style={styles.statValue}>{points}</Text>
            <Text style={styles.statLabel}>Points</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="car-outline" size={24} color="#EF4444" />
            <Text style={styles.statValue}>{totalTrips}</Text>
            <Text style={styles.statLabel}>Trips</Text>
          </View>
        </View>

        {/* Help Section */}
        <View style={styles.helpSection}>
          <Ionicons name="help-circle-outline" size={20} color="#666" />
          <Text style={styles.helpText}>
            Having trouble with your wallet?{" "}
            <Text 
              style={styles.helpLink}
              onPress={() => navigation.navigate("Support", { topic: "wallet" })}
            >
              Contact Support
            </Text>
          </Text>
        </View>
      </ScrollView>

      {/* Modals */}
      <CashInModal />
      <PromoModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: -50,
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
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#183B5C",
  },
  headerActions: {
    flexDirection: "row",
    gap: 15,
  },
  headerButton: {
    padding: 8,
  },
  balanceCard: {
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  balanceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  balanceLabel: {
    fontSize: 14,
    color: "#FFB37A",
    opacity: 0.9,
  },
  pointsBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
  },
  pointsText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 4,
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#FFF",
    marginBottom: 20,
  },
  balanceFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.2)",
    paddingTop: 15,
  },
  balanceItem: {
    flex: 1,
    alignItems: "center",
  },
  balanceItemLabel: {
    fontSize: 12,
    color: "#FFB37A",
    opacity: 0.9,
    marginBottom: 4,
  },
  balanceItemValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFF",
  },
  balanceDivider: {
    width: 1,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 20,
    gap: 12,
  },
  actionButton: {
    width: "22%",
    alignItems: "center",
  },
  actionIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  actionText: {
    fontSize: 11,
    color: "#333",
    textAlign: "center",
  },
  referralCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 15,
    borderRadius: 16,
  },
  referralIcon: {
    marginRight: 12,
  },
  referralInfo: {
    flex: 1,
  },
  referralTitle: {
    fontSize: 14,
    color: "#10B981",
    fontWeight: "600",
    marginBottom: 2,
  },
  referralValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 2,
  },
  referralCount: {
    fontSize: 11,
    color: "#666",
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
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  seeAllText: {
    fontSize: 14,
    color: "#183B5C",
    fontWeight: "500",
  },
  emptyState: {
    alignItems: "center",
    padding: 30,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginTop: 10,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#666",
    marginTop: 5,
  },
  transactionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionType: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    marginBottom: 2,
  },
  transactionDate: {
    fontSize: 12,
    color: "#999",
  },
  transactionRef: {
    fontSize: 10,
    color: "#666",
    marginTop: 2,
  },
  transactionAmount: {
    alignItems: "flex-end",
  },
  transactionAmountText: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  positiveAmount: {
    color: "#10B981",
  },
  negativeAmount: {
    color: "#EF4444",
  },
  refundAmount: {
    color: "#F59E0B",
  },
  bonusAmount: {
    color: "#8B5CF6",
  },
  transactionStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusCompleted: {
    backgroundColor: "#D1FAE5",
  },
  statusPending: {
    backgroundColor: "#FEF3C7",
  },
  statusFailed: {
    backgroundColor: "#FEE2E2",
  },
  transactionStatusText: {
    fontSize: 10,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  bookingItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  bookingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  bookingInfo: {
    flex: 1,
  },
  bookingReference: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    marginBottom: 2,
  },
  bookingRoute: {
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
  },
  bookingDate: {
    fontSize: 11,
    color: "#999",
  },
  bookingAmount: {
    alignItems: "flex-end",
  },
  bookingAmountText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  pointsEarned: {
    flexDirection: "row",
    alignItems: "center",
  },
  pointsEarnedText: {
    fontSize: 10,
    color: "#FFB37A",
    fontWeight: "600",
    marginLeft: 2,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: 20,
    marginBottom: 20,
    gap: 10,
  },
  statCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#FFF",
    padding: 15,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginTop: 8,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
  },
  helpSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    marginBottom: 20,
  },
  helpText: {
    fontSize: 12,
    color: "#666",
    marginLeft: 8,
  },
  helpLink: {
    color: "#183B5C",
    fontWeight: "600",
    textDecorationLine: "underline",
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
    maxHeight: "80%",
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
  },
  amountInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    paddingHorizontal: 15,
    marginBottom: 20,
  },
  currencySymbol: {
    fontSize: 20,
    color: "#666",
    marginRight: 5,
  },
  amountInput: {
    flex: 1,
    paddingVertical: 15,
    fontSize: 20,
    color: "#333",
  },
  paymentMethods: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  paymentMethod: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  paymentMethodSelected: {
    backgroundColor: "#183B5C",
  },
  paymentMethodText: {
    fontSize: 12,
    color: "#666",
  },
  paymentMethodTextSelected: {
    color: "#FFF",
  },
  gcashInstructions: {
    backgroundColor: "#F9FAFB",
    padding: 15,
    borderRadius: 12,
    marginBottom: 20,
  },
  cashInstructions: {
    backgroundColor: "#F9FAFB",
    padding: 15,
    borderRadius: 12,
    marginBottom: 20,
  },
  cardInstructions: {
    backgroundColor: "#F9FAFB",
    padding: 15,
    borderRadius: 12,
    marginBottom: 20,
  },
  instructionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  instructionText: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  instructionNote: {
    fontSize: 11,
    color: "#999",
    fontStyle: "italic",
    marginTop: 8,
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginTop: 10,
    gap: 8,
  },
  uploadButtonText: {
    fontSize: 14,
    color: "#183B5C",
    fontWeight: "500",
  },
  imagePreview: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    padding: 10,
    backgroundColor: "#FFF",
    borderRadius: 8,
  },
  previewImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  confirmButton: {
    backgroundColor: "#183B5C",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },
  confirmButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  confirmButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  promoInput: {
    backgroundColor: "#F9FAFB",
    padding: 15,
    borderRadius: 12,
    fontSize: 16,
    marginBottom: 20,
    textAlign: "center",
    letterSpacing: 2,
  },
  availablePromos: {
    marginBottom: 20,
  },
  availablePromosTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 10,
  },
  promoItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  promoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E3F2FD",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  promoInfo: {
    flex: 1,
  },
  promoCode: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#183B5C",
    marginBottom: 2,
  },
  promoDescription: {
    fontSize: 11,
    color: "#666",
  },
  usePromoButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#183B5C",
    borderRadius: 15,
  },
  usePromoText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "600",
  },
  applyButton: {
    backgroundColor: "#183B5C",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  applyButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  applyButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
});


// Recent TRansaction