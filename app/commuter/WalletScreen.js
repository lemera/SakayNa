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
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

export default function CommuterWalletScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [commuterId, setCommuterId] = useState(null);
  const [commuter, setCommuter] = useState(null);
  const [points, setPoints] = useState(0);
  const [pointsHistory, setPointsHistory] = useState([]);
  const [recentBookings, setRecentBookings] = useState([]);
  
  // Withdrawal related states
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [processingWithdrawal, setProcessingWithdrawal] = useState(false);
  const [withdrawPoints, setWithdrawPoints] = useState("");
  const [withdrawNotes, setWithdrawNotes] = useState("");
  const [pointsToCash, setPointsToCash] = useState(0);
  
  // PIN related state
  const [hasPin, setHasPin] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showPinSetupModal, setShowPinSetupModal] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinError, setPinError] = useState("");
  const [withdrawalPending, setWithdrawalPending] = useState(null);
  const [settingPin, setSettingPin] = useState(false);
  const [verifyingPin, setVerifyingPin] = useState(false);
  
  // Payout methods
  const [payoutMethods, setPayoutMethods] = useState([]);
  const [selectedPayoutMethod, setSelectedPayoutMethod] = useState(null);
  const [showAddPayoutModal, setShowAddPayoutModal] = useState(false);
  const [showPayoutMethodsModal, setShowPayoutMethodsModal] = useState(false);
  const [addingPayout, setAddingPayout] = useState(false);
  const [settingDefault, setSettingDefault] = useState(false);
  const [deletingPayout, setDeletingPayout] = useState(false);
  
  // Withdrawal history
  const [withdrawals, setWithdrawals] = useState([]);
  const [showWithdrawalHistory, setShowWithdrawalHistory] = useState(false);
  
  // Points stats
  const [totalPointsEarned, setTotalPointsEarned] = useState(0);
  const [totalPointsRedeemed, setTotalPointsRedeemed] = useState(0);
  const [pointsThisMonth, setPointsThisMonth] = useState(0);
  
  // Promo related states
  const [availablePromos, setAvailablePromos] = useState([]);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [processingPromo, setProcessingPromo] = useState(false);
  const [selectedPromo, setSelectedPromo] = useState(null);
  
  // Points configuration
  const POINTS_CONVERSION_RATE = 0.10;
  const MIN_POINTS_WITHDRAWAL = 1000;

  // Stats
  const [totalTrips, setTotalTrips] = useState(0);
  
  const [newPayoutMethod, setNewPayoutMethod] = useState({
    payment_type: "gcash",
    account_name: "",
    account_number: "",
    account_phone: "",
    recipient_name: "",
  });

  // Notification helper function
  const createNotification = async (userId, userType, type, title, message, referenceId = null, referenceType = null, data = null, priority = 'normal') => {
    try {
      console.log(`📱 Creating notification for ${userType}: ${title}`);
      
      const notificationData = {
        user_id: userId,
        user_type: userType,
        type: type,
        title: title,
        message: message,
        reference_id: referenceId,
        reference_type: referenceType,
        data: data || {},
        priority: priority,
        is_read: false,
        created_at: new Date().toISOString()
      };
      
      const { data: notification, error } = await supabase
        .from("notifications")
        .insert(notificationData)
        .select()
        .single();

      if (error) {
        console.log("❌ Error creating notification:", error);
        return null;
      }
      
      console.log(`✅ Notification created for ${userType}: ${notification.id}`);
      return notification;
    } catch (err) {
      console.log("❌ Notification creation failed:", err);
      return null;
    }
  };

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
          fetchRecentBookings(id),
          fetchStats(id),
          fetchPointsHistory(id),
          fetchPointsStats(id),
          fetchAvailablePromos(id),
          loadPayoutMethods(id),
          loadWithdrawalHistory(id),
          checkPinStatus(id)
        ]);
      }
    } catch (err) {
      console.log("Error loading commuter data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const checkPinStatus = async (userId) => {
    try {
      const { data, error } = await supabase
        .from("withdrawal_settings")
        .select("withdrawal_pin")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;
      setHasPin(!!data?.withdrawal_pin);
    } catch (err) {
      console.log("Error checking PIN status:", err.message);
    }
  };

  const setupPin = async () => {
    if (pinInput.length !== 4) {
      setPinError("PIN must be exactly 4 digits");
      return;
    }
    
    if (!/^\d{4}$/.test(pinInput)) {
      setPinError("PIN must contain only numbers");
      return;
    }
    
    if (pinInput !== pinConfirm) {
      setPinError("PINs do not match");
      return;
    }
    
    setSettingPin(true);
    
    try {
      const { data: existing, error: checkError } = await supabase
        .from("withdrawal_settings")
        .select("id")
        .eq("user_id", commuterId)
        .maybeSingle();
      
      if (checkError) throw checkError;
      
      let error;
      if (existing) {
        const { error: updateError } = await supabase
          .from("withdrawal_settings")
          .update({ withdrawal_pin: pinInput, updated_at: new Date().toISOString() })
          .eq("user_id", commuterId);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from("withdrawal_settings")
          .insert({
            user_id: commuterId,
            user_type: "commuter",
            withdrawal_pin: pinInput,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        error = insertError;
      }
      
      if (error) throw error;
      
      setHasPin(true);
      setShowPinSetupModal(false);
      setPinInput("");
      setPinConfirm("");
      setPinError("");
      
      Alert.alert("Success", "Withdrawal PIN has been set successfully!");
    } catch (err) {
      console.log("Error setting PIN:", err.message);
      setPinError("Failed to set PIN. Please try again.");
    } finally {
      setSettingPin(false);
    }
  };

  const verifyPin = async (pin) => {
    setVerifyingPin(true);
    
    try {
      const { data, error } = await supabase
        .from("withdrawal_settings")
        .select("withdrawal_pin")
        .eq("user_id", commuterId)
        .maybeSingle();
      
      if (error) throw error;
      
      if (!data?.withdrawal_pin) {
        return false;
      }
      
      if (data.withdrawal_pin !== pin) {
        Alert.alert("Invalid PIN", "The PIN you entered is incorrect. Please try again.");
        return false;
      }
      
      return true;
    } catch (err) {
      console.log("Error verifying PIN:", err.message);
      Alert.alert("Error", "Failed to verify PIN. Please try again.");
      return false;
    } finally {
      setVerifyingPin(false);
    }
  };

  const loadPayoutMethods = async (userId) => {
    try {
      const { data, error } = await supabase
        .from("user_payment_methods")
        .select("*")
        .eq("user_id", userId)
        .eq("user_type", "commuter")
        .eq("is_active", true)
        .order("is_default", { ascending: false });

      if (error) throw error;
      
      setPayoutMethods(data || []);
      
      const defaultMethod = data?.find(m => m.is_default);
      if (defaultMethod) {
        setSelectedPayoutMethod(defaultMethod);
      } else if (data && data.length > 0) {
        setSelectedPayoutMethod(data[0]);
      }
    } catch (err) {
      console.log("Error loading payout methods:", err.message);
    }
  };

  const loadWithdrawalHistory = async (userId) => {
    try {
      const { data, error } = await supabase
        .from("withdrawals")
        .select("*")
        .eq("user_id", userId)
        .eq("user_type", "commuter")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setWithdrawals(data || []);
    } catch (err) {
      console.log("Error loading withdrawal history:", err.message);
    }
  };

  const handleAddPayoutMethod = async () => {
    if (!newPayoutMethod.account_name || !newPayoutMethod.account_number) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    if (newPayoutMethod.payment_type === "gcash" && !/^09\d{9}$/.test(newPayoutMethod.account_number)) {
      Alert.alert("Error", "Please enter a valid GCash number (11 digits starting with 09)");
      return;
    }

    setAddingPayout(true);
    
    try {
      const { data: existing } = await supabase
        .from("user_payment_methods")
        .select("id")
        .eq("user_id", commuterId)
        .eq("user_type", "commuter")
        .eq("account_number", newPayoutMethod.account_number)
        .maybeSingle();

      if (existing) {
        Alert.alert("Error", "This payout method is already added");
        return;
      }

      const isFirstMethod = payoutMethods.length === 0;

      const { error } = await supabase
        .from("user_payment_methods")
        .insert({
          user_id: commuterId,
          user_type: "commuter",
          payment_type: newPayoutMethod.payment_type,
          account_name: newPayoutMethod.account_name,
          account_number: newPayoutMethod.account_number,
          account_phone: newPayoutMethod.account_phone,
          recipient_name: newPayoutMethod.recipient_name || newPayoutMethod.account_name,
          is_default: isFirstMethod,
          is_active: true,
          created_at: new Date(),
        });

      if (error) throw error;

      Alert.alert("Success", "Payout method added successfully");
      setShowAddPayoutModal(false);
      setNewPayoutMethod({
        payment_type: "gcash",
        account_name: "",
        account_number: "",
        account_phone: "",
        recipient_name: "",
      });
      
      await loadPayoutMethods(commuterId);
    } catch (err) {
      console.log("Error adding payout method:", err.message);
      Alert.alert("Error", "Failed to add payout method");
    } finally {
      setAddingPayout(false);
    }
  };

  const handleSetDefaultPayoutMethod = async (methodId) => {
    setSettingDefault(true);
    
    try {
      await supabase
        .from("user_payment_methods")
        .update({ is_default: false })
        .eq("user_id", commuterId)
        .eq("user_type", "commuter");

      await supabase
        .from("user_payment_methods")
        .update({ is_default: true })
        .eq("id", methodId);

      const updatedMethod = payoutMethods.find(m => m.id === methodId);
      setSelectedPayoutMethod(updatedMethod);
      await loadPayoutMethods(commuterId);
      
      Alert.alert("Success", "Default payout method updated");
    } catch (err) {
      console.log("Error setting default:", err.message);
      Alert.alert("Error", "Failed to update default method");
    } finally {
      setSettingDefault(false);
    }
  };

  const handleDeletePayoutMethod = async (methodId) => {
    Alert.alert(
      "Delete Payout Method",
      "Are you sure you want to remove this payout method?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingPayout(true);
            
            try {
              const { error } = await supabase
                .from("user_payment_methods")
                .update({ is_active: false })
                .eq("id", methodId);

              if (error) throw error;

              await loadPayoutMethods(commuterId);
              Alert.alert("Success", "Payout method removed");
            } catch (err) {
              console.log("Error deleting method:", err.message);
              Alert.alert("Error", "Failed to remove payout method");
            } finally {
              setDeletingPayout(false);
            }
          }
        }
      ]
    );
  };

  const handlePointsChange = (pointsValue) => {
    const pointsNum = parseFloat(pointsValue) || 0;
    setWithdrawPoints(pointsValue);
    setPointsToCash(pointsNum * POINTS_CONVERSION_RATE);
  };

  const initiateWithdrawal = () => {
    const pointsNum = parseFloat(withdrawPoints);
    const cashAmount = pointsNum * POINTS_CONVERSION_RATE;
    
    if (!withdrawPoints || isNaN(pointsNum) || pointsNum < MIN_POINTS_WITHDRAWAL) {
      Alert.alert("Error", `Minimum withdrawal is ${MIN_POINTS_WITHDRAWAL} points (₱${(MIN_POINTS_WITHDRAWAL * POINTS_CONVERSION_RATE).toFixed(2)})`);
      return;
    }

    if (pointsNum > points) {
      Alert.alert("Error", `Insufficient points. Available: ${points} points (₱${(points * POINTS_CONVERSION_RATE).toFixed(2)})`);
      return;
    }

    if (!selectedPayoutMethod) {
      Alert.alert("Error", "Please add a payout method first");
      setShowPayoutMethodsModal(true);
      return;
    }

    const withdrawalData = { points: pointsNum, cashAmount };
    
    setShowWithdrawModal(false);
    
    setTimeout(() => {
      if (hasPin) {
        setWithdrawalPending(withdrawalData);
        setPinInput("");
        setShowPinModal(true);
      } else {
        Alert.alert(
          "Setup Withdrawal PIN",
          "For your security, please set up a 4-digit withdrawal PIN first.",
          [
            { text: "Cancel", style: "cancel", onPress: () => {
              setWithdrawalPending(null);
              setWithdrawPoints("");
              setWithdrawNotes("");
              setPointsToCash(0);
            }},
            { text: "Set Up PIN", onPress: () => {
                setWithdrawalPending(withdrawalData);
                setShowPinSetupModal(true);
              }
            }
          ]
        );
      }
    }, 300);
  };

  const handleWithdrawWithPin = async () => {
    if (pinInput.length !== 4) {
      Alert.alert("Error", "Please enter your 4-digit PIN");
      return;
    }
    
    const isValid = await verifyPin(pinInput);
    if (isValid && withdrawalPending) {
      setShowPinModal(false);
      setPinInput("");
      setTimeout(async () => {
        await processPointsWithdrawal(withdrawalPending.points, withdrawalPending.cashAmount);
        setWithdrawalPending(null);
      }, 300);
    }
  };

  const processPointsWithdrawal = async (pointsAmount, cashAmount) => {
    setProcessingWithdrawal(true);
    
    try {
      // First, check if enough points
      const { data: wallet, error: walletError } = await supabase
        .from("commuter_wallets")
        .select("points")
        .eq("commuter_id", commuterId)
        .single();

      if (walletError) throw walletError;
      
      if (wallet.points < pointsAmount) {
        throw new Error("Insufficient points");
      }

      // Get commuter details
      const { data: commuterData, error: commuterError } = await supabase
        .from("commuters")
        .select("first_name, last_name, phone, email")
        .eq("id", commuterId)
        .single();

      const commuterName = commuterData ? `${commuterData.first_name} ${commuterData.last_name}` : "Commuter";

      // Create withdrawal request
      const { data: withdrawal, error: withdrawalError } = await supabase
        .from("withdrawals")
        .insert({
          user_id: commuterId,
          user_type: "commuter",
          amount: cashAmount,
          payment_method: selectedPayoutMethod.payment_type,
          account_details: {
            account_name: selectedPayoutMethod.account_name,
            account_number: selectedPayoutMethod.account_number,
            account_phone: selectedPayoutMethod.account_phone,
            points_converted: pointsAmount,
            conversion_rate: POINTS_CONVERSION_RATE,
            payment_method_id: selectedPayoutMethod.id
          },
          notes: withdrawNotes || `Converting ${pointsAmount} points to cash`,
          payment_method_id: selectedPayoutMethod.id,
          requested_at: new Date().toISOString(),
          status: "pending",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (withdrawalError) {
        console.log("Withdrawal insert error:", withdrawalError);
        throw withdrawalError;
      }

      console.log("✅ Withdrawal created:", withdrawal.id);

      // Deduct points from wallet
      const { error: updateError } = await supabase
        .from("commuter_wallets")
        .update({
          points: wallet.points - pointsAmount,
          updated_at: new Date().toISOString()
        })
        .eq("commuter_id", commuterId);

      if (updateError) {
        console.log("Wallet update error:", updateError);
        throw updateError;
      }

      console.log("✅ Points deducted from wallet");

      // Log points history
      const { error: historyError } = await supabase
        .from("commuter_points_history")
        .insert({
          commuter_id: commuterId,
          points: pointsAmount,
          type: "redeemed",
          source: "withdrawal",
          source_id: withdrawal.id,
          description: `Converted ${pointsAmount} points to ₱${cashAmount.toFixed(2)}`,
          created_at: new Date().toISOString()
        });

      if (historyError) {
        console.log("Points history error:", historyError);
      } else {
        console.log("✅ Points history recorded");
      }

      // Insert into withdrawal_logs
      const { error: logError } = await supabase
        .from("withdrawal_logs")
        .insert({
          withdrawal_id: withdrawal.id,
          action: "requested",
          user_id: commuterId,
          user_type: "commuter",
          notes: `Points withdrawal request: ${pointsAmount} points = ₱${cashAmount.toFixed(2)}`,
          created_at: new Date().toISOString()
        });

      if (logError) {
        console.log("❌ Withdrawal log error:", logError);
      } else {
        console.log("✅ Withdrawal log created");
      }

      // ========== CREATE NOTIFICATIONS ==========
      
      // 1. Notification for commuter
      console.log("🔔 Creating notification for commuter...");
      const commuterNotification = await createNotification(
        commuterId,
        "commuter",
        "payment",
        "💸 Withdrawal Request Submitted",
        `Your request to convert ${pointsAmount} points to ₱${cashAmount.toFixed(2)} has been submitted. We will notify you once processed.`,
        withdrawal.id,
        "withdrawal",
        {
          points: pointsAmount,
          amount: cashAmount,
          status: "pending",
          withdrawal_id: withdrawal.id
        },
        "normal"
      );
      
      if (commuterNotification) {
        console.log("✅ Commuter notification created successfully");
      } else {
        console.log("❌ Failed to create commuter notification");
      }
      
      // 2. Get all active admins
      const { data: admins, error: adminsError } = await supabase
        .from("admins")
        .select("id")
        .eq("is_active", true);

      if (adminsError) {
        console.log("Error fetching admins:", adminsError);
      } else if (admins && admins.length > 0) {
        console.log(`Found ${admins.length} admins to notify`);
        
        // Create notifications for each admin
        let adminNotificationsCreated = 0;
        for (const admin of admins) {
          const adminNotification = await createNotification(
            admin.id,
            "admin",
            "payment",
            "💰 New Withdrawal Request",
            `${commuterName} requested to convert ${pointsAmount} points to ₱${cashAmount.toFixed(2)} via ${selectedPayoutMethod.payment_type.toUpperCase()}`,
            withdrawal.id,
            "withdrawal",
            {
              commuter_id: commuterId,
              commuter_name: commuterName,
              commuter_phone: commuterData?.phone || "N/A",
              points: pointsAmount,
              amount: cashAmount,
              payment_method: selectedPayoutMethod.payment_type,
              account_number: selectedPayoutMethod.account_number,
              account_name: selectedPayoutMethod.account_name,
              withdrawal_id: withdrawal.id,
              requested_at: new Date().toISOString()
            },
            "high"
          );
          
          if (adminNotification) {
            adminNotificationsCreated++;
          }
        }
        console.log(`✅ Created ${adminNotificationsCreated}/${admins.length} admin notifications`);
      } else {
        console.log("⚠️ No active admins found to notify");
      }

      // 3. Also create a system notification for tracking
      await createNotification(
        commuterId,
        "commuter",
        "system",
        "📝 Withdrawal Request Received",
        `We've received your withdrawal request for ${pointsAmount} points (₱${cashAmount.toFixed(2)}). Our team will process it within 1-2 business days.`,
        withdrawal.id,
        "withdrawal",
        {
          points: pointsAmount,
          amount: cashAmount,
          request_id: withdrawal.id
        },
        "low"
      );

      Alert.alert(
        "✅ Withdrawal Request Submitted",
        `${pointsAmount.toFixed(0)} points converted to ₱${cashAmount.toFixed(2)}\n\n` +
        `Request ID: ${withdrawal.id.substring(0, 8)}...\n\n` +
        `We have notified our admin team. You will receive a notification once processed.`
      );
      
      setShowWithdrawModal(false);
      setWithdrawPoints("");
      setWithdrawNotes("");
      setPointsToCash(0);
      
      // Refresh all data
      await Promise.all([
        fetchWallet(commuterId),
        loadWithdrawalHistory(commuterId),
        fetchPointsHistory(commuterId),
        fetchPointsStats(commuterId)
      ]);
      
    } catch (err) {
      console.log("Withdrawal error:", err);
      Alert.alert("Error", err.message || "Failed to process withdrawal. Please try again.");
    } finally {
      setProcessingWithdrawal(false);
    }
  };

  const fetchCommuterProfile = async (id) => {
    try {
      const { data, error } = await supabase
        .from("commuters")
        .select("first_name, last_name, phone, email")
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
        .select("points")
        .eq("commuter_id", id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        setPoints(data.points || 0);
      } else {
        const { data: newWallet } = await supabase
          .from("commuter_wallets")
          .insert([{ commuter_id: id, points: 0, updated_at: new Date() }])
          .select()
          .single();

        setPoints(newWallet?.points || 0);
      }
    } catch (err) {
      console.log("Error fetching wallet:", err);
    }
  };

  const fetchRecentBookings = async (id) => {
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id,
          fare,
          payment_type,
          created_at,
          pickup_location,
          dropoff_location
        `)
        .eq("commuter_id", id)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      setRecentBookings(data || []);
    } catch (err) {
      console.log("Error fetching recent bookings:", err);
    }
  };

  const fetchPointsHistory = async (id) => {
    try {
      const { data, error } = await supabase
        .from("commuter_points_history")
        .select("*")
        .eq("commuter_id", id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setPointsHistory(data || []);
    } catch (err) {
      console.log("Error fetching points history:", err);
    }
  };

  const fetchPointsStats = async (id) => {
    try {
      const { data: earnedData } = await supabase
        .from("commuter_points_history")
        .select("points")
        .eq("commuter_id", id)
        .eq("type", "earned");

      const totalEarned = earnedData?.reduce((sum, item) => sum + item.points, 0) || 0;
      setTotalPointsEarned(totalEarned);

      const { data: redeemedData } = await supabase
        .from("commuter_points_history")
        .select("points")
        .eq("commuter_id", id)
        .eq("type", "redeemed");

      const totalRedeemed = redeemedData?.reduce((sum, item) => sum + item.points, 0) || 0;
      setTotalPointsRedeemed(totalRedeemed);

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data: monthData } = await supabase
        .from("commuter_points_history")
        .select("points")
        .eq("commuter_id", id)
        .eq("type", "earned")
        .gte("created_at", startOfMonth.toISOString());

      const monthEarned = monthData?.reduce((sum, item) => sum + item.points, 0) || 0;
      setPointsThisMonth(monthEarned);
    } catch (err) {
      console.log("Error fetching points stats:", err);
    }
  };

  const fetchStats = async (id) => {
    try {
      const { count, error } = await supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("commuter_id", id)
        .eq("status", "completed");

      if (error) throw error;
      setTotalTrips(count || 0);
    } catch (err) {
      console.log("Error fetching stats:", err);
    }
  };

  const fetchAvailablePromos = async (id) => {
    try {
      const now = new Date().toISOString();
      
      const { data, error } = await supabase
        .from("promos")
        .select("*")
        .eq("is_active", true)
        .gte("end_date", now)
        .lte("start_date", now);

      if (error) throw error;
      setAvailablePromos(data || []);
    } catch (err) {
      console.log("Error fetching promos:", err);
    }
  };

  const handlePromoSelect = (promo) => {
    setSelectedPromo(promo);
    
    Alert.alert(
      "Redeem Points",
      `${promo.description}\n\nYou have ${points} points available.`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Redeem Now", 
          onPress: () => handleRedeemPromo(promo)
        }
      ]
    );
  };

  const handleRedeemPromo = async (promo) => {
    if (points < promo.points_required) {
      Alert.alert(
        "Insufficient Points",
        `You need ${promo.points_required} points to redeem this promo.`
      );
      return;
    }

    setProcessingPromo(true);

    try {
      const newPoints = points - promo.points_required;
      
      await supabase
        .from("commuter_wallets")
        .update({ points: newPoints, updated_at: new Date() })
        .eq("commuter_id", commuterId);

      await supabase
        .from("commuter_points_history")
        .insert({
          commuter_id: commuterId,
          points: promo.points_required,
          type: 'redeemed',
          source: 'promo',
          description: `Redeemed ${promo.points_required} points for ${promo.discount_value}% off`,
          created_at: new Date()
        });

      await supabase
        .from("commuter_promos")
        .insert({
          commuter_id: commuterId,
          promo_id: promo.id,
          used_at: new Date(),
          discount_amount: promo.discount_value
        });

      setPoints(newPoints);
      
      Alert.alert(
        "🎉 Redemption Successful!",
        `You have successfully redeemed ${promo.points_required} points for ${promo.discount_value}% off!`
      );

      await Promise.all([
        fetchWallet(commuterId),
        fetchPointsHistory(commuterId),
        fetchPointsStats(commuterId)
      ]);

    } catch (err) {
      console.log("Error redeeming promo:", err);
      Alert.alert("Oops!", "Failed to redeem promo. Please try again.");
    } finally {
      setProcessingPromo(false);
      setSelectedPromo(null);
      setShowPromoModal(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadCommuterData();
  };

  const getPointsTier = (totalEarned) => {
    if (totalEarned >= 10000) return { name: 'Platinum', color: '#8B5CF6', icon: 'diamond' };
    if (totalEarned >= 5000) return { name: 'Gold', color: '#F59E0B', icon: 'star' };
    if (totalEarned >= 1000) return { name: 'Silver', color: '#9CA3AF', icon: 'star-outline' };
    return { name: 'Bronze', color: '#CD7F32', icon: 'star-outline' };
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

  const getWithdrawalStatusColor = (status) => {
    switch(status) {
      case 'pending': return '#F59E0B';
      case 'success': return '#10B981';
      case 'failed': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const getWithdrawalStatusText = (status) => {
    switch(status) {
      case 'pending': return 'Pending';
      case 'success': return 'Success';
      case 'failed': return 'Failed';
      default: return status;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
        <Text style={styles.loadingText}>Loading your points...</Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.container}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#183B5C" />
          }
        >
          {/* Header */}
           <View style={[styles.header, { paddingTop: 0, marginTop: 20 }]}>
            <View>
              <Text style={styles.headerGreeting}>Hello, {commuter?.first_name || 'Rider'}! 👋</Text>
              <Text style={styles.headerTitle}>My Points</Text>
            </View>
            <View style={styles.headerActions}>
              {/* NEW: Points Rewards Button */}
              <Pressable 
                style={styles.headerButton}
                onPress={() => navigation.navigate("PointsRewards")}
              >
                <LinearGradient
                  colors={['#F59E0B', '#FBBF24']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.headerButtonGradient}
                >
                  <Ionicons name="gift" size={20} color="#FFF" />
                </LinearGradient>
              </Pressable>
              <Pressable 
                style={styles.headerButton}
                onPress={() => navigation.navigate("ReferralsScreen")}
              >
                <LinearGradient
                  colors={['#10B981', '#34D399']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.headerButtonGradient}
                >
                  <Ionicons name="people" size={20} color="#FFF" />
                </LinearGradient>
              </Pressable>
              <Pressable 
                style={styles.headerButton}
                onPress={() => navigation.navigate("RideHistoryScreen")}
              >
                <LinearGradient
                  colors={['#3B82F6', '#60A5FA']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.headerButtonGradient}
                >
                  <Ionicons name="time-outline" size={20} color="#FFF" />
                </LinearGradient>
              </Pressable>
            </View>
          </View>

          {/* Points Card */}
          <LinearGradient
            colors={["#183B5C", "#1E4B6E", "#235D82"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.pointsCard}
          >
            <View style={styles.pointsCardHeader}>
              <Text style={styles.pointsLabel}>Available Points</Text>
              <View style={styles.pointsBadge}>
                <Ionicons name="star" size={16} color="#FFB37A" />
                <Text style={styles.pointsBadgeText}>{pointsThisMonth} this month</Text>
              </View>
            </View>
            
            <View style={styles.pointsMain}>
              <Text style={styles.pointsAmount}>{points}</Text>
              <Text style={styles.pointsCurrency}>⭐</Text>
            </View>
            
            <Text style={styles.pointsValue}>Worth ₱{(points * 0.1).toFixed(2)}</Text>
            
            <View style={styles.pointsFooter}>
              <View style={styles.pointsFooterItem}>
                <Ionicons name="car-outline" size={20} color="#FFB37A" />
                <Text style={styles.pointsFooterLabel}>Total Trips</Text>
                <Text style={styles.pointsFooterValue}>{totalTrips}</Text>
              </View>
              <View style={styles.pointsFooterDivider} />
              <View style={styles.pointsFooterItem}>
                <Ionicons name="trending-up-outline" size={20} color="#FFB37A" />
                <Text style={styles.pointsFooterLabel}>This Month</Text>
                <Text style={styles.pointsFooterValue}>{pointsThisMonth}</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <Pressable 
              style={styles.quickAction}
              onPress={() => setShowPromoModal(true)}
            >
              <LinearGradient
                colors={['#F59E0B', '#FBBF24']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.quickActionGradient}
              >
                <Ionicons name="pricetag" size={24} color="#FFF" />
              </LinearGradient>
              <Text style={styles.quickActionText}>Redeem Promos</Text>
            </Pressable>

            <Pressable 
              style={styles.quickAction}
              onPress={() => setShowWithdrawModal(true)}
            >
              <LinearGradient
                colors={['#10B981', '#34D399']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.quickActionGradient}
              >
                <Ionicons name="cash-outline" size={24} color="#FFF" />
              </LinearGradient>
              <Text style={styles.quickActionText}>Withdraw Points</Text>
            </Pressable>

            <Pressable 
              style={styles.quickAction}
              onPress={() => setShowPayoutMethodsModal(true)}
            >
              <LinearGradient
                colors={['#8B5CF6', '#A78BFA']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.quickActionGradient}
              >
                <Ionicons name="card-outline" size={24} color="#FFF" />
              </LinearGradient>
              <Text style={styles.quickActionText}>Payout Methods</Text>
            </Pressable>
          </View>

          {/* PIN Status Indicator */}
          {!hasPin && (
            <View style={styles.pinStatusCard}>
              <View style={styles.pinStatusContent}>
                <Ionicons name="shield-outline" size={20} color="#F59E0B" />
                <Text style={styles.pinStatusText}>Withdrawal PIN not set</Text>
              </View>
              <Pressable onPress={() => setShowPinSetupModal(true)}>
                <Text style={styles.pinStatusButton}>Set up now →</Text>
              </Pressable>
            </View>
          )}

          {/* Payout Methods Quick View */}
          {payoutMethods.length > 0 && selectedPayoutMethod && (
            <Pressable
              onPress={() => setShowPayoutMethodsModal(true)}
              style={styles.payoutQuickView}
            >
              <View style={styles.payoutQuickViewContent}>
                <View style={styles.payoutQuickViewIcon}>
                  <Ionicons name={selectedPayoutMethod.payment_type === "gcash" ? "phone-portrait" : "cash"} size={20} color="#00579F" />
                </View>
                <View>
                  <Text style={styles.payoutQuickViewMethod}>
                    {selectedPayoutMethod.payment_type.toUpperCase()}: {selectedPayoutMethod.account_number}
                  </Text>
                  <Text style={styles.payoutQuickViewName}>{selectedPayoutMethod.account_name}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </Pressable>
          )}

          {/* Points Tier Card */}
          <View style={styles.tierCard}>
            <View style={styles.tierHeader}>
              <View>
                <Text style={styles.tierTitle}>Points Tier</Text>
                <View style={styles.tierNameContainer}>
                  <Ionicons name={getPointsTier(totalPointsEarned).icon} size={20} color={getPointsTier(totalPointsEarned).color} />
                  <Text style={[styles.tierName, { color: getPointsTier(totalPointsEarned).color }]}>
                    {getPointsTier(totalPointsEarned).name}
                  </Text>
                </View>
              </View>
              <View style={[styles.tierBadge, { backgroundColor: getPointsTier(totalPointsEarned).color + '20' }]}>
                <Ionicons name="star" size={24} color={getPointsTier(totalPointsEarned).color} />
              </View>
            </View>

            <View style={styles.tierProgress}>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { 
                      width: `${Math.min((totalPointsEarned / 10000) * 100, 100)}%`,
                      backgroundColor: getPointsTier(totalPointsEarned).color
                    }
                  ]} 
                />
              </View>
              <View style={styles.progressLabels}>
                <Text style={styles.progressLabel}>{totalPointsEarned} pts earned</Text>
                {totalPointsEarned < 10000 && (
                  <Text style={styles.progressLabel}>{10000 - totalPointsEarned} to Platinum</Text>
                )}
              </View>
            </View>

            <View style={styles.tierStats}>
              <View style={styles.tierStat}>
                <Text style={styles.tierStatValue}>{totalPointsEarned}</Text>
                <Text style={styles.tierStatLabel}>Total Earned</Text>
              </View>
              <View style={styles.tierStatDivider} />
              <View style={styles.tierStat}>
                <Text style={styles.tierStatValue}>{totalPointsRedeemed}</Text>
                <Text style={styles.tierStatLabel}>Redeemed</Text>
              </View>
            </View>
          </View>

          {/* Points History */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Points History</Text>
              <Pressable onPress={() => setShowWithdrawalHistory(true)}>
                <Text style={styles.seeAll}>Withdrawal History →</Text>
              </Pressable>
            </View>

            {pointsHistory.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyStateIcon}>
                  <Ionicons name="star-outline" size={48} color="#D1D5DB" />
                </View>
                <Text style={styles.emptyTitle}>No Points Yet</Text>
                <Text style={styles.emptyText}>Complete rides to earn points!</Text>
                <Pressable style={styles.emptyStateButton} onPress={() => navigation.navigate("Home")}>
                  <Text style={styles.emptyStateButtonText}>Book a Ride</Text>
                </Pressable>
              </View>
            ) : (
              pointsHistory.slice(0, 5).map((item, index) => {
                let sourceText = '';
                let iconColor = '';
                let bgColor = '';
                
                if (item.type === 'earned') {
                  iconColor = '#10B981';
                  bgColor = '#D1FAE5';
                  if (item.source === 'trip') sourceText = 'Trip Earned';
                  else if (item.source === 'referral') sourceText = 'Referral Bonus';
                  else sourceText = 'Points Earned';
                } else {
                  iconColor = '#EF4444';
                  bgColor = '#FEE2E2';
                  if (item.source === 'promo') sourceText = 'Redeemed Promo';
                  else if (item.source === 'withdrawal') sourceText = 'Withdrawn to Cash';
                  else sourceText = 'Points Used';
                }
                
                return (
                  <View key={item.id} style={[styles.historyItem, index === 0 && styles.firstHistoryItem]}>
                    <View style={[styles.historyIcon, { backgroundColor: bgColor }]}>
                      <Ionicons name={item.type === 'earned' ? 'star' : 'gift'} size={20} color={iconColor} />
                    </View>
                    <View style={styles.historyInfo}>
                      <Text style={styles.historyTitle}>{sourceText}</Text>
                      <Text style={styles.historyDate}>{formatDate(item.created_at)}</Text>
                    </View>
                    <Text style={[styles.historyAmount, item.type === 'earned' ? styles.earnedAmount : styles.redeemedAmount]}>
                      {item.type === 'earned' ? '+' : '-'}{item.points}
                    </Text>
                  </View>
                );
              })
            )}
          </View>

          {/* Recent Trips */}
          {recentBookings.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent Trips</Text>
                <Pressable onPress={() => navigation.navigate("RideHistoryScreen")}>
                  <Text style={styles.seeAll}>See All →</Text>
                </Pressable>
              </View>

              {recentBookings.map((booking, index) => (
                <Pressable
                  key={booking.id}
                  style={[styles.tripItem, index === 0 && styles.firstTripItem]}
                  onPress={() => navigation.navigate("BookingDetails", { id: booking.id })}
                >
                  <View style={styles.tripIcon}>
                    <Ionicons name="car" size={20} color="#183B5C" />
                  </View>
                  <View style={styles.tripInfo}>
                    <Text style={styles.tripRoute} numberOfLines={1}>
                      {booking.pickup_location?.split(",")[0]} → {booking.dropoff_location?.split(",")[0]}
                    </Text>
                    <Text style={styles.tripDate}>{formatDate(booking.created_at)}</Text>
                  </View>
                  <Text style={styles.tripFare}>{formatCurrency(booking.fare)}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Info Card */}
          <View style={styles.infoCard}>
            <View style={styles.infoHeader}>
              <Ionicons name="information-circle" size={20} color="#183B5C" />
              <Text style={styles.infoTitle}>Points Guide</Text>
            </View>
            
            <View style={styles.infoGrid}>
              <View style={styles.infoGridItem}>
                <Text style={styles.infoRate}>5%</Text>
                <Text style={styles.infoDesc}>Cash payments</Text>
              </View>
              <View style={styles.infoGridDivider} />
              <View style={styles.infoGridItem}>
                <Text style={[styles.infoRate, styles.walletRate]}>10%</Text>
                <Text style={styles.infoDesc}>Points payment</Text>
              </View>
            </View>
            
            <View style={styles.infoNote}>
              <Ionicons name="star" size={14} color="#F59E0B" />
              <Text style={styles.infoNoteText}>10 points = ₱1 • Min fare: ₱15 • Min withdrawal: 1000 points (₱100)</Text>
            </View>
          </View>
        </ScrollView>
      </View>

      {/* Promo Modal */}
      <Modal
        visible={showPromoModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowPromoModal(false);
          setSelectedPromo(null);
        }}
      >
        <TouchableWithoutFeedback onPress={() => setShowPromoModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>✨ Redeem Points</Text>
                  <Pressable onPress={() => setShowPromoModal(false)}>
                    <Ionicons name="close" size={24} color="#666" />
                  </Pressable>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  {availablePromos.length === 0 ? (
                    <View style={styles.emptyPromoContainer}>
                      <Ionicons name="pricetag-outline" size={60} color="#D1D5DB" />
                      <Text style={styles.emptyPromoText}>No promos available</Text>
                    </View>
                  ) : (
                    availablePromos.map((promo) => {
                      const canRedeem = points >= (promo.points_required || 0);
                      return (
                        <Pressable
                          key={promo.id}
                          style={[styles.promoCard, !canRedeem && styles.promoCardDisabled]}
                          onPress={() => handlePromoSelect(promo)}
                          disabled={!canRedeem}
                        >
                          <View style={styles.promoCardContent}>
                            <View style={[styles.promoIcon, { backgroundColor: '#10B981' }]}>
                              <Ionicons name="cash-outline" size={24} color="#FFF" />
                            </View>
                            <View style={styles.promoInfo}>
                              <Text style={styles.promoTitle}>{promo.title}</Text>
                              <Text style={styles.promoDescription}>{promo.description}</Text>
                              <View style={styles.promoRequirement}>
                                <Ionicons name="star" size={12} color="#F59E0B" />
                                <Text style={styles.requirementText}>Need {promo.points_required} points</Text>
                              </View>
                            </View>
                            <Text style={[styles.promoAction, !canRedeem && styles.promoActionDisabled]}>
                              Redeem
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* PIN Setup Modal */}
      <Modal
        visible={showPinSetupModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => {
          setShowPinSetupModal(false);
          setPinInput("");
          setPinConfirm("");
          setPinError("");
        }}
      >
        <TouchableWithoutFeedback onPress={() => setShowPinSetupModal(false)}>
          <View style={styles.modalOverlayCenter}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCenterContent}>
                <View style={styles.modalCenterHeader}>
                  <Ionicons name="shield-checkmark" size={48} color="#183B5C" />
                  <Text style={styles.modalCenterTitle}>
                    {hasPin ? "Change Withdrawal PIN" : "Set Withdrawal PIN"}
                  </Text>
                  <Text style={styles.modalCenterSubtitle}>
                    {hasPin ? "Enter your new 4-digit PIN" : "Create a 4-digit PIN for withdrawals"}
                  </Text>
                </View>

                <TextInput
                  style={[styles.pinInput, pinError && styles.pinInputError]}
                  placeholder="****"
                  keyboardType="number-pad"
                  maxLength={4}
                  secureTextEntry
                  value={pinInput}
                  onChangeText={(text) => {
                    setPinInput(text);
                    setPinError("");
                  }}
                />

                {!hasPin && (
                  <TextInput
                    style={[styles.pinInput, pinError && styles.pinInputError]}
                    placeholder="Confirm PIN"
                    keyboardType="number-pad"
                    maxLength={4}
                    secureTextEntry
                    value={pinConfirm}
                    onChangeText={(text) => {
                      setPinConfirm(text);
                      setPinError("");
                    }}
                  />
                )}

                {pinError ? <Text style={styles.pinErrorText}>{pinError}</Text> : null}

                <View style={styles.modalCenterActions}>
                  <Pressable
                    style={styles.modalCenterCancel}
                    onPress={() => {
                      setShowPinSetupModal(false);
                      setPinInput("");
                      setPinConfirm("");
                      setPinError("");
                    }}
                  >
                    <Text style={styles.modalCenterCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={styles.modalCenterConfirm}
                    onPress={setupPin}
                    disabled={settingPin}
                  >
                    {settingPin ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={styles.modalCenterConfirmText}>
                        {hasPin ? "Update PIN" : "Set PIN"}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* PIN Verification Modal */}
      <Modal
        visible={showPinModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => {
          setShowPinModal(false);
          setPinInput("");
          setWithdrawalPending(null);
        }}
      >
        <TouchableWithoutFeedback onPress={() => {
          setShowPinModal(false);
          setPinInput("");
          setWithdrawalPending(null);
        }}>
          <View style={styles.modalOverlayCenter}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCenterContent}>
                <View style={styles.modalCenterHeader}>
                  <Ionicons name="lock-closed" size={48} color="#183B5C" />
                  <Text style={styles.modalCenterTitle}>Verify PIN</Text>
                  <Text style={styles.modalCenterSubtitle}>
                    Enter your 4-digit withdrawal PIN to continue
                  </Text>
                </View>

                <TextInput
                  style={styles.pinInput}
                  placeholder="****"
                  keyboardType="number-pad"
                  maxLength={4}
                  secureTextEntry
                  value={pinInput}
                  onChangeText={setPinInput}
                  autoFocus
                />

                <View style={styles.modalCenterActions}>
                  <Pressable
                    style={styles.modalCenterCancel}
                    onPress={() => {
                      setShowPinModal(false);
                      setPinInput("");
                      setWithdrawalPending(null);
                    }}
                  >
                    <Text style={styles.modalCenterCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modalCenterConfirm, { backgroundColor: "#F59E0B" }]}
                    onPress={handleWithdrawWithPin}
                    disabled={verifyingPin}
                  >
                    {verifyingPin ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={styles.modalCenterConfirmText}>Confirm</Text>
                    )}
                  </Pressable>
                </View>

                <Pressable
                  style={styles.forgotPinButton}
                  onPress={() => {
                    setShowPinModal(false);
                    setShowPinSetupModal(true);
                    setPinInput("");
                  }}
                >
                  <Text style={styles.forgotPinText}>Forgot PIN? Reset it here</Text>
                </Pressable>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Withdrawal Modal */}
      <Modal
        visible={showWithdrawModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowWithdrawModal(false);
          setWithdrawPoints("");
          setWithdrawNotes("");
        }}
      >
        <TouchableWithoutFeedback onPress={() => setShowWithdrawModal(false)}>
          <View style={[styles.modalOverlay, { marginBottom: -100 }]}>
            <TouchableWithoutFeedback>
              <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalKeyboardView}>
                <View style={styles.modalContentLarge}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Convert Points to Cash</Text>
                    <Pressable onPress={() => setShowWithdrawModal(false)}>
                      <Ionicons name="close" size={24} color="#666" />
                    </Pressable>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false}>
                    <View style={styles.withdrawInfoCard}>
                      <Text style={styles.withdrawInfoLabel}>Available Points</Text>
                      <View style={styles.withdrawInfoPoints}>
                        <Ionicons name="star" size={24} color="#F59E0B" />
                        <Text style={styles.withdrawInfoAmount}>{points}</Text>
                      </View>
                      <Text style={styles.withdrawInfoValue}>≈ ₱{(points * POINTS_CONVERSION_RATE).toFixed(2)} value</Text>
                    </View>

                    {selectedPayoutMethod ? (
                      <View style={styles.selectedMethodCard}>
                        <Text style={styles.selectedMethodLabel}>Send to:</Text>
                        <Text style={styles.selectedMethodType}>
                          {selectedPayoutMethod.payment_type.toUpperCase()}
                        </Text>
                        <Text style={styles.selectedMethodNumber}>{selectedPayoutMethod.account_number}</Text>
                        <Text style={styles.selectedMethodName}>{selectedPayoutMethod.account_name}</Text>
                        <Pressable 
                          onPress={() => {
                            setShowWithdrawModal(false);
                            setShowPayoutMethodsModal(true);
                          }}
                          style={styles.changeMethodButton}
                        >
                          <Text style={styles.changeMethodText}>Change payout method →</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <View style={styles.noMethodCard}>
                        <Text style={styles.noMethodText}>No payout method added</Text>
                        <Pressable 
                          onPress={() => {
                            setShowWithdrawModal(false);
                            setShowAddPayoutModal(true);
                          }}
                          style={styles.addMethodButton}
                        >
                          <Text style={styles.addMethodText}>Add payout method →</Text>
                        </Pressable>
                      </View>
                    )}

                    <Text style={styles.inputLabel}>Points to Convert</Text>
                    <View style={styles.pointsInputContainer}>
                      <Ionicons name="star" size={24} color="#F59E0B" />
                      <TextInput
                        style={styles.pointsInput}
                        placeholder="0"
                        keyboardType="numeric"
                        value={withdrawPoints}
                        onChangeText={handlePointsChange}
                      />
                    </View>

                    {parseFloat(withdrawPoints) > 0 && (
                      <View style={styles.conversionPreview}>
                        <Text style={styles.conversionPreviewText}>
                          You will receive: ₱{pointsToCash.toFixed(2)}
                        </Text>
                        <Text style={styles.conversionRateText}>
                          1 point = ₱{POINTS_CONVERSION_RATE}
                        </Text>
                      </View>
                    )}

                    <Text style={styles.quickSelectLabel}>Quick select:</Text>
                    <View style={styles.quickSelectContainer}>
                      {[1000, 2000, 5000, 10000].map(pointsOption => (
                        <Pressable 
                          key={pointsOption} 
                          style={styles.quickSelectButton}
                          onPress={() => handlePointsChange(pointsOption.toString())}
                        >
                          <Text style={styles.quickSelectText}>{pointsOption} pts</Text>
                          <Text style={styles.quickSelectValue}>₱{(pointsOption * POINTS_CONVERSION_RATE).toFixed(0)}</Text>
                        </Pressable>
                      ))}
                    </View>

                    <Text style={styles.inputLabel}>Notes (Optional)</Text>
                    <TextInput
                      style={styles.notesInput}
                      placeholder="Any notes for the admin?"
                      multiline
                      value={withdrawNotes}
                      onChangeText={setWithdrawNotes}
                    />

                    <Pressable
                      style={[
                        styles.withdrawButton,
                        (!selectedPayoutMethod || !withdrawPoints || parseFloat(withdrawPoints) < MIN_POINTS_WITHDRAWAL || parseFloat(withdrawPoints) > points || processingWithdrawal) && styles.withdrawButtonDisabled
                      ]}
                      onPress={initiateWithdrawal}
                      disabled={!selectedPayoutMethod || !withdrawPoints || parseFloat(withdrawPoints) < MIN_POINTS_WITHDRAWAL || parseFloat(withdrawPoints) > points || processingWithdrawal}
                    >
                      {processingWithdrawal ? (
                        <ActivityIndicator size="small" color="#FFF" />
                      ) : (
                        <Text style={styles.withdrawButtonText}>
                          Convert {withdrawPoints || 0} points to ₱{pointsToCash.toFixed(2)}
                        </Text>
                      )}
                    </Pressable>

                    <Text style={styles.minWithdrawalText}>
                      Minimum: {MIN_POINTS_WITHDRAWAL} points (₱{(MIN_POINTS_WITHDRAWAL * POINTS_CONVERSION_RATE).toFixed(2)})
                    </Text>
                  </ScrollView>
                </View>
              </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Payout Methods Modal */}
      <Modal
        visible={showPayoutMethodsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPayoutMethodsModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowPayoutMethodsModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalKeyboardView}>
                <View style={styles.modalContentLarge}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Payout Methods</Text>
                    <Pressable onPress={() => setShowPayoutMethodsModal(false)}>
                      <Ionicons name="close" size={24} color="#666" />
                    </Pressable>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false}>
                    {payoutMethods.length === 0 ? (
                      <View style={styles.emptyPayoutContainer}>
                        <Ionicons name="card-outline" size={60} color="#D1D5DB" />
                        <Text style={styles.emptyPayoutText}>No payout methods added yet</Text>
                        <Pressable 
                          style={styles.addPayoutButton}
                          onPress={() => {
                            setShowPayoutMethodsModal(false);
                            setShowAddPayoutModal(true);
                          }}
                        >
                          <Text style={styles.addPayoutButtonText}>Add Payout Method</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <>
                        {payoutMethods.map((method) => (
                          <View key={method.id} style={[styles.payoutMethodCard, method.is_default && styles.defaultPayoutMethod]}>
                            <View style={styles.payoutMethodHeader}>
                              <View style={styles.payoutMethodIcon}>
                                <Ionicons name={method.payment_type === "gcash" ? "phone-portrait" : "cash"} size={20} color="#00579F" />
                              </View>
                              <View style={styles.payoutMethodInfo}>
                                <Text style={styles.payoutMethodType}>{method.payment_type.toUpperCase()}</Text>
                                <Text style={styles.payoutMethodNumber}>{method.account_number}</Text>
                                <Text style={styles.payoutMethodName}>{method.account_name}</Text>
                              </View>
                              {method.is_default && (
                                <View style={styles.defaultBadge}>
                                  <Text style={styles.defaultBadgeText}>Default</Text>
                                </View>
                              )}
                            </View>
                            
                            <View style={styles.payoutMethodActions}>
                              {!method.is_default && (
                                <Pressable 
                                  style={styles.setDefaultButton}
                                  onPress={() => handleSetDefaultPayoutMethod(method.id)}
                                  disabled={settingDefault}
                                >
                                  {settingDefault ? (
                                    <ActivityIndicator size="small" color="#183B5C" />
                                  ) : (
                                    <Text style={styles.setDefaultButtonText}>Set Default</Text>
                                  )}
                                </Pressable>
                              )}
                              <Pressable 
                                style={styles.removeButton}
                                onPress={() => handleDeletePayoutMethod(method.id)}
                                disabled={deletingPayout}
                              >
                                {deletingPayout ? (
                                  <ActivityIndicator size="small" color="#EF4444" />
                                ) : (
                                  <Text style={styles.removeButtonText}>Remove</Text>
                                )}
                              </Pressable>
                            </View>
                          </View>
                        ))}
                        
                        <Pressable 
                          style={styles.addNewPayoutButton}
                          onPress={() => {
                            setShowPayoutMethodsModal(false);
                            setShowAddPayoutModal(true);
                          }}
                        >
                          <Ionicons name="add" size={20} color="#183B5C" />
                          <Text style={styles.addNewPayoutButtonText}>Add New Payout Method</Text>
                        </Pressable>
                      </>
                    )}
                  </ScrollView>
                </View>
              </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Add Payout Method Modal */}
      <Modal
        visible={showAddPayoutModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddPayoutModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowAddPayoutModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalKeyboardView}>
                <View style={styles.modalContentLarge}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Add Payout Method</Text>
                    <Pressable onPress={() => setShowAddPayoutModal(false)}>
                      <Ionicons name="close" size={24} color="#666" />
                    </Pressable>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false}>
                    <Text style={styles.inputLabel}>Payment Type</Text>
                    <View style={styles.paymentTypeContainer}>
                      <Pressable
                        style={[styles.paymentTypeButton, newPayoutMethod.payment_type === "gcash" && styles.paymentTypeActive]}
                        onPress={() => setNewPayoutMethod({ ...newPayoutMethod, payment_type: "gcash" })}
                      >
                        <Ionicons name="phone-portrait" size={24} color={newPayoutMethod.payment_type === "gcash" ? "#00579F" : "#9CA3AF"} />
                        <Text style={[styles.paymentTypeText, newPayoutMethod.payment_type === "gcash" && styles.paymentTypeTextActive]}>GCash</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.paymentTypeButton, newPayoutMethod.payment_type === "paymaya" && styles.paymentTypeActive]}
                        onPress={() => setNewPayoutMethod({ ...newPayoutMethod, payment_type: "paymaya" })}
                      >
                        <Ionicons name="card" size={24} color={newPayoutMethod.payment_type === "paymaya" ? "#00579F" : "#9CA3AF"} />
                        <Text style={[styles.paymentTypeText, newPayoutMethod.payment_type === "paymaya" && styles.paymentTypeTextActive]}>PayMaya</Text>
                      </Pressable>
                    </View>

                    <Text style={styles.inputLabel}>Account Name</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="Full name as per GCash/PayMaya"
                      value={newPayoutMethod.account_name}
                      onChangeText={(text) => setNewPayoutMethod({ ...newPayoutMethod, account_name: text })}
                    />

                    <Text style={styles.inputLabel}>
                      {newPayoutMethod.payment_type === "gcash" ? "GCash Number" : "PayMaya Number"}
                    </Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder={newPayoutMethod.payment_type === "gcash" ? "0917XXXXXXX" : "0999XXXXXXX"}
                      keyboardType="phone-pad"
                      value={newPayoutMethod.account_number}
                      onChangeText={(text) => setNewPayoutMethod({ ...newPayoutMethod, account_number: text })}
                      maxLength={11}
                    />

                    <Pressable
                      style={styles.addPayoutConfirmButton}
                      onPress={handleAddPayoutMethod}
                      disabled={addingPayout}
                    >
                      {addingPayout ? (
                        <ActivityIndicator size="small" color="#FFF" />
                      ) : (
                        <Text style={styles.addPayoutConfirmButtonText}>Add Payout Method</Text>
                      )}
                    </Pressable>
                  </ScrollView>
                </View>
              </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Withdrawal History Modal */}
      <Modal
        visible={showWithdrawalHistory}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowWithdrawalHistory(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowWithdrawalHistory(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalContentLarge}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Conversion History</Text>
                  <Pressable onPress={() => setShowWithdrawalHistory(false)}>
                    <Ionicons name="close" size={24} color="#666" />
                  </Pressable>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  {withdrawals.length === 0 ? (
                    <View style={styles.emptyHistoryContainer}>
                      <Ionicons name="time-outline" size={60} color="#D1D5DB" />
                      <Text style={styles.emptyHistoryText}>No conversion requests yet</Text>
                    </View>
                  ) : (
                    withdrawals.map((withdrawal) => {
                      const pointsConverted = withdrawal.account_details?.points_converted || 0;
                      return (
                        <View key={withdrawal.id} style={styles.historyCard}>
                          <View style={styles.historyCardHeader}>
                            <View>
                              <Text style={styles.historyCardAmount}>₱{Number(withdrawal.amount).toFixed(2)}</Text>
                              {pointsConverted > 0 && (
                                <Text style={styles.historyCardPoints}>{pointsConverted} points</Text>
                              )}
                            </View>
                            <View style={[styles.historyCardStatus, { backgroundColor: getWithdrawalStatusColor(withdrawal.status) + "20" }]}>
                              <Text style={[styles.historyCardStatusText, { color: getWithdrawalStatusColor(withdrawal.status) }]}>
                                {getWithdrawalStatusText(withdrawal.status)}
                              </Text>
                            </View>
                          </View>
                          
                          <Text style={styles.historyCardDate}>
                            {new Date(withdrawal.created_at).toLocaleDateString("en-PH", { 
                              month: "short", 
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit"
                            })}
                          </Text>
                          
                          <Text style={styles.historyCardMethod}>
                            Method: {withdrawal.payment_method?.toUpperCase() || "GCash"}
                          </Text>
                        </View>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
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
    backgroundColor: "#F5F7FA",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#666",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    paddingTop: 10, // Reduce this value
    marginTop: 0,   // Ensure no margin
  },
  headerGreeting: {
    fontSize: 14,
    color: "#666",
    marginBottom: 0,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#183B5C",
  },
  headerActions: {
    flexDirection: "row",
    gap: 10,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerButtonGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pointsCard: {
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  pointsCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  pointsLabel: {
    fontSize: 14,
    color: "#FFB37A",
    opacity: 0.9,
  },
  pointsBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 4,
  },
  pointsBadgeText: {
    color: "#FFB37A",
    fontSize: 12,
    fontWeight: "500",
  },
  pointsMain: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 5,
  },
  pointsAmount: {
    fontSize: 52,
    fontWeight: "bold",
    color: "#FFF",
  },
  pointsCurrency: {
    fontSize: 28,
    color: "#FFB37A",
    marginLeft: 5,
  },
  pointsValue: {
    fontSize: 16,
    color: "#FFB37A",
    marginBottom: 20,
  },
  pointsFooter: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.15)",
    paddingTop: 15,
  },
  pointsFooterItem: {
    flex: 1,
    alignItems: "center",
  },
  pointsFooterLabel: {
    fontSize: 11,
    color: "#FFB37A",
    opacity: 0.8,
    marginTop: 4,
    marginBottom: 2,
  },
  pointsFooterValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFF",
  },
  pointsFooterDivider: {
    width: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  quickActions: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 20,
    paddingVertical: 15,
    gap: 10,
  },
  quickAction: {
    alignItems: "center",
    flex: 1,
  },
  quickActionGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  quickActionText: {
    fontSize: 12,
    color: "#333",
    fontWeight: "500",
  },
  pinStatusCard: {
    marginHorizontal: 20,
    marginTop: 10,
    padding: 15,
    backgroundColor: "#FEF3C7",
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pinStatusContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pinStatusText: {
    fontSize: 13,
    color: "#F59E0B",
    fontWeight: "500",
  },
  pinStatusButton: {
    fontSize: 13,
    color: "#183B5C",
    fontWeight: "600",
  },
  payoutQuickView: {
    marginHorizontal: 20,
    marginTop: 15,
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  payoutQuickViewContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  payoutQuickViewIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E6F0FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  payoutQuickViewMethod: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  payoutQuickViewName: {
    fontSize: 12,
    color: "#666",
  },
  tierCard: {
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginTop: 15,
    padding: 20,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  tierHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  tierTitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  tierNameContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tierName: {
    fontSize: 20,
    fontWeight: "bold",
  },
  tierBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  tierProgress: {
    marginBottom: 15,
  },
  progressBar: {
    height: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 4,
    marginBottom: 6,
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
  },
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressLabel: {
    fontSize: 11,
    color: "#666",
  },
  tierStats: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 15,
  },
  tierStat: {
    flex: 1,
    alignItems: "center",
  },
  tierStatValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  tierStatLabel: {
    fontSize: 11,
    color: "#666",
  },
  tierStatDivider: {
    width: 1,
    backgroundColor: "#F3F4F6",
  },
  section: {
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginTop: 15,
    padding: 20,
    borderRadius: 20,
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
  seeAll: {
    fontSize: 14,
    color: "#183B5C",
    fontWeight: "500",
  },
  emptyState: {
    alignItems: "center",
    padding: 30,
  },
  emptyStateIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 15,
  },
  emptyStateButton: {
    backgroundColor: "#183B5C",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  emptyStateButtonText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  firstHistoryItem: {
    paddingTop: 0,
  },
  historyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  historyInfo: {
    flex: 1,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    marginBottom: 4,
  },
  historyDate: {
    fontSize: 11,
    color: "#999",
  },
  historyAmount: {
    fontSize: 16,
    fontWeight: "600",
  },
  earnedAmount: {
    color: "#10B981",
  },
  redeemedAmount: {
    color: "#EF4444",
  },
  tripItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  firstTripItem: {
    paddingTop: 0,
  },
  tripIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  tripInfo: {
    flex: 1,
  },
  tripRoute: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    marginBottom: 4,
  },
  tripDate: {
    fontSize: 11,
    color: "#999",
  },
  tripFare: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  infoCard: {
    backgroundColor: "#F0F9FF",
    marginHorizontal: 20,
    marginTop: 15,
    marginBottom: 30,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
    gap: 6,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#183B5C",
  },
  infoGrid: {
    flexDirection: "row",
    marginBottom: 15,
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 15,
  },
  infoGridItem: {
    flex: 1,
    alignItems: "center",
  },
  infoGridDivider: {
    width: 1,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 15,
  },
  infoRate: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  walletRate: {
    color: "#F59E0B",
  },
  infoDesc: {
    fontSize: 12,
    color: "#666",
  },
  infoNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  infoNoteText: {
    fontSize: 12,
    color: "#666",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalKeyboardView: {
    width: "100%",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
    maxHeight: "85%",
  },
  modalContentLarge: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
    maxHeight: "85%",
  },
  modalCenterContent: {
    backgroundColor: "#FFF",
    borderRadius: 24,
    padding: 20,
    width: "90%",
    maxWidth: 350,
  },
  modalCenterHeader: {
    alignItems: "center",
    marginBottom: 20,
  },
  modalCenterTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginTop: 10,
  },
  modalCenterSubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginTop: 5,
  },
  modalCenterActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
  },
  modalCenterCancel: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
  },
  modalCenterCancelText: {
    textAlign: "center",
    color: "#666",
  },
  modalCenterConfirm: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#183B5C",
  },
  modalCenterConfirmText: {
    textAlign: "center",
    color: "#FFF",
    fontWeight: "600",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#183B5C",
  },
  pinInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    fontSize: 24,
    textAlign: "center",
    letterSpacing: 8,
    marginBottom: 16,
  },
  pinInputError: {
    borderColor: "#EF4444",
  },
  pinErrorText: {
    color: "#EF4444",
    fontSize: 12,
    marginBottom: 16,
    textAlign: "center",
  },
  forgotPinButton: {
    marginTop: 12,
    padding: 8,
  },
  forgotPinText: {
    textAlign: "center",
    color: "#183B5C",
    fontSize: 12,
  },
  emptyPromoContainer: {
    alignItems: "center",
    padding: 40,
  },
  emptyPromoText: {
    marginTop: 10,
    color: "#666",
    textAlign: "center",
  },
  promoCard: {
    marginBottom: 12,
    padding: 15,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  promoCardDisabled: {
    opacity: 0.5,
  },
  promoCardContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  promoIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  promoInfo: {
    flex: 1,
  },
  promoTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  promoDescription: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  promoRequirement: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  requirementText: {
    fontSize: 10,
    color: "#F59E0B",
  },
  promoAction: {
    fontSize: 12,
    color: "#183B5C",
    fontWeight: "600",
  },
  promoActionDisabled: {
    color: "#9CA3AF",
  },
  withdrawInfoCard: {
    backgroundColor: "#FEF3C7",
    padding: 15,
    borderRadius: 12,
    marginBottom: 20,
  },
  withdrawInfoLabel: {
    fontSize: 14,
    color: "#666",
    marginBottom: 5,
  },
  withdrawInfoPoints: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  withdrawInfoAmount: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#F59E0B",
  },
  withdrawInfoValue: {
    fontSize: 12,
    color: "#10B981",
    marginTop: 4,
  },
  selectedMethodCard: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
  },
  selectedMethodLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 5,
  },
  selectedMethodType: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  selectedMethodNumber: {
    fontSize: 14,
    color: "#666",
  },
  selectedMethodName: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  changeMethodButton: {
    marginTop: 8,
  },
  changeMethodText: {
    fontSize: 12,
    color: "#183B5C",
  },
  noMethodCard: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
  },
  noMethodText: {
    fontSize: 14,
    color: "#F59E0B",
    marginBottom: 8,
  },
  addMethodButton: {
    marginTop: 4,
  },
  addMethodText: {
    fontSize: 14,
    color: "#183B5C",
    fontWeight: "600",
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  pointsInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    gap: 8,
  },
  pointsInput: {
    flex: 1,
    fontSize: 18,
    color: "#333",
  },
  conversionPreview: {
    marginBottom: 20,
    padding: 12,
    backgroundColor: "#D1FAE5",
    borderRadius: 12,
  },
  conversionPreviewText: {
    fontSize: 14,
    color: "#10B981",
    textAlign: "center",
    fontWeight: "500",
  },
  conversionRateText: {
    fontSize: 11,
    color: "#666",
    textAlign: "center",
    marginTop: 4,
  },
  quickSelectLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 8,
  },
  quickSelectContainer: {
    flexDirection: "row",
    marginBottom: 20,
    gap: 8,
    flexWrap: "wrap",
  },
  quickSelectButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    alignItems: "center",
  },
  quickSelectText: {
    fontSize: 12,
    color: "#333",
  },
  quickSelectValue: {
    fontSize: 10,
    color: "#10B981",
  },
  notesInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    height: 80,
    textAlignVertical: "top",
  },
  withdrawButton: {
    backgroundColor: "#F59E0B",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  withdrawButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  withdrawButtonText: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 16,
  },
  minWithdrawalText: {
    fontSize: 11,
    color: "#9CA3AF",
    textAlign: "center",
    marginTop: 12,
  },
  emptyPayoutContainer: {
    alignItems: "center",
    padding: 40,
  },
  emptyPayoutText: {
    marginTop: 10,
    color: "#666",
    textAlign: "center",
  },
  addPayoutButton: {
    marginTop: 20,
    backgroundColor: "#183B5C",
    padding: 12,
    borderRadius: 12,
    width: "100%",
  },
  addPayoutButtonText: {
    color: "#FFF",
    textAlign: "center",
    fontWeight: "600",
  },
  payoutMethodCard: {
    marginBottom: 12,
    padding: 15,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  defaultPayoutMethod: {
    borderColor: "#183B5C",
    borderWidth: 2,
  },
  payoutMethodHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  payoutMethodIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E6F0FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  payoutMethodInfo: {
    flex: 1,
  },
  payoutMethodType: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  payoutMethodNumber: {
    fontSize: 12,
    color: "#666",
  },
  payoutMethodName: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  defaultBadge: {
    backgroundColor: "#183B5C",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  defaultBadgeText: {
    fontSize: 10,
    color: "#FFF",
  },
  payoutMethodActions: {
    flexDirection: "row",
    marginTop: 12,
    gap: 8,
  },
  setDefaultButton: {
    flex: 1,
    padding: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    alignItems: "center",
  },
  setDefaultButtonText: {
    fontSize: 12,
    color: "#183B5C",
  },
  removeButton: {
    flex: 1,
    padding: 8,
    backgroundColor: "#FEE2E2",
    borderRadius: 8,
    alignItems: "center",
  },
  removeButtonText: {
    fontSize: 12,
    color: "#EF4444",
  },
  addNewPayoutButton: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  addNewPayoutButtonText: {
    color: "#183B5C",
    fontWeight: "600",
    marginLeft: 5,
  },
  paymentTypeContainer: {
    flexDirection: "row",
    marginBottom: 20,
    gap: 10,
  },
  paymentTypeButton: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  paymentTypeActive: {
    borderColor: "#00579F",
    backgroundColor: "#E6F0FF",
  },
  paymentTypeText: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  paymentTypeTextActive: {
    color: "#00579F",
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  addPayoutConfirmButton: {
    backgroundColor: "#183B5C",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
    marginBottom: 20,
  },
  addPayoutConfirmButtonText: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 16,
  },
  emptyHistoryContainer: {
    alignItems: "center",
    padding: 40,
  },
  emptyHistoryText: {
    marginTop: 10,
    color: "#666",
    textAlign: "center",
  },
  historyCard: {
    marginBottom: 12,
    padding: 15,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
  },
  historyCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  historyCardAmount: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  historyCardPoints: {
    fontSize: 12,
    color: "#F59E0B",
  },
  historyCardStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  historyCardStatusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  historyCardDate: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  historyCardMethod: {
    fontSize: 12,
    color: "#666",
  },
});

