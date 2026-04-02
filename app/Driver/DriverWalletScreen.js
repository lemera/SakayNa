// screens/driver/DriverWalletScreen.js
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { LineChart } from "react-native-chart-kit";
import { getUserSession } from '../utils/authStorage'; // ✅ Import test account session

export default function DriverWalletScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get("window").width - 40;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [driverId, setDriverId] = useState(null);
  const [isTestAccount, setIsTestAccount] = useState(false); // ✅ Track if test account
  const [driverName, setDriverName] = useState("");

  // Loading states for buttons
  const [addingPayout, setAddingPayout] = useState(false);
  const [processingWithdrawal, setProcessingWithdrawal] = useState(false);
  const [settingDefault, setSettingDefault] = useState(false);
  const [deletingPayout, setDeletingPayout] = useState(false);
  const [settingPin, setSettingPin] = useState(false);
  const [verifyingPin, setVerifyingPin] = useState(false);

  // Points data (primary currency for withdrawal)
  const [pointsData, setPointsData] = useState({
    total_points: 0,
    points_from_rides: 0,
    points_from_referrals: 0,
    points_from_bonuses: 0,
    points_value: 0,
  });

  // Earnings data for display only
  const [earningsData, setEarningsData] = useState({
    cash_earnings: 0,
    gcash_earnings: 0,
    wallet_earnings: 0,
    total_earnings: 0,
  });

  const [recentTransactions, setRecentTransactions] = useState([]);
  const [weeklyPoints, setWeeklyPoints] = useState([0, 0, 0, 0, 0, 0, 0]);
  const [monthlyPoints, setMonthlyPoints] = useState(0);
  const [totalTrips, setTotalTrips] = useState(0);

  // Payout methods
  const [payoutMethods, setPayoutMethods] = useState([]);
  const [selectedPayoutMethod, setSelectedPayoutMethod] = useState(null);
  const [showAddPayoutModal, setShowAddPayoutModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showPayoutMethodsModal, setShowPayoutMethodsModal] = useState(false);

  // PIN related state
  const [hasPin, setHasPin] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showPinSetupModal, setShowPinSetupModal] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinError, setPinError] = useState("");
  const [withdrawalPending, setWithdrawalPending] = useState(null);

  // Payout form
  const [newPayoutMethod, setNewPayoutMethod] = useState({
    payment_type: "gcash",
    account_name: "",
    account_number: "",
    account_phone: "",
    recipient_name: "",
  });

  // Withdrawal form (points withdrawal)
  const [withdrawPoints, setWithdrawPoints] = useState("");
  const [withdrawNotes, setWithdrawNotes] = useState("");
  const [pointsToCash, setPointsToCash] = useState(0);

  // Withdrawal history
  const [withdrawals, setWithdrawals] = useState([]);
  const [showWithdrawalHistory, setShowWithdrawalHistory] = useState(false);

  // Points conversion rate (1 point = ₱0.10)
  const POINTS_CONVERSION_RATE = 0.1;
  const MIN_POINTS_WITHDRAWAL = 1000; // Minimum 1000 points = ₱100

  // ─── Reset withdrawal modal state cleanly ──────────────────────────────────
  const resetWithdrawModal = () => {
    setWithdrawPoints("");
    setWithdrawNotes("");
    setPointsToCash(0);
    setShowWithdrawModal(false);
  };

  // ─── Reset PIN input fields cleanly ────────────────────────────────────────
  const resetPinFields = () => {
    setPinInput("");
    setPinConfirm("");
    setPinError("");
  };

  // Fetch driver ID and check if test account
  useFocusEffect(
    useCallback(() => {
      const getDriverId = async () => {
        try {
          // ✅ Check test account session first
          const session = await getUserSession();
          
          if (session && session.isTestAccount && session.userType === 'driver') {
            console.log("✅ Test driver account detected in WalletScreen");
            setIsTestAccount(true);
            setDriverId(session.phone);
            setDriverName("Test Driver");
            
            // Set mock data for test account
            setPointsData({
              total_points: 5000,
              points_from_rides: 3500,
              points_from_referrals: 1000,
              points_from_bonuses: 500,
              points_value: 500,
            });
            
            setEarningsData({
              cash_earnings: 0,
              gcash_earnings: 0,
              wallet_earnings: 0,
              total_earnings: 0,
            });
            
            setWeeklyPoints([100, 200, 150, 300, 250, 400, 350]);
            setMonthlyPoints(1750);
            setTotalTrips(0);
            
            setLoading(false);
            return;
          }
          
          // Normal user flow
          const id = await AsyncStorage.getItem("user_id");
          setDriverId(id);
          setIsTestAccount(false);
          
          if (id) {
            await fetchDriverName(id);
            await loadPayoutMethods(id);
            await loadWithdrawalHistory(id);
            await checkPinStatus(id);
          }
        } catch (error) {
          console.log("Error getting driver ID:", error);
        }
      };
      getDriverId();
    }, [])
  );

  // Fetch all data when driverId changes (only for normal users)
  useEffect(() => {
    if (driverId && !isTestAccount) loadPointsData(driverId);
  }, [driverId, isTestAccount]);

  const fetchDriverName = async (id) => {
    if (isTestAccount) return;
    
    try {
      const { data, error } = await supabase
        .from("drivers")
        .select("first_name, last_name")
        .eq("id", id)
        .single();

      if (error) throw error;
      if (data) setDriverName(`${data.first_name} ${data.last_name}`);
    } catch (err) {
      console.log("Error fetching driver name:", err.message);
    }
  };

  const checkPinStatus = async (userId) => {
    if (isTestAccount) return;
    
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

  // ─── BUG FIX: setupPin now correctly handles change-PIN flow ───────────────
  const setupPin = async () => {
    if (isTestAccount) {
      Alert.alert("Test Account", "PIN setup is disabled for test accounts.");
      return;
    }
    
    if (pinInput.length !== 4) {
      setPinError("PIN must be exactly 4 digits");
      return;
    }

    if (!/^\d{4}$/.test(pinInput)) {
      setPinError("PIN must contain only numbers");
      return;
    }

    // Confirm PIN only required for first-time setup
    if (!hasPin) {
      if (pinConfirm.length !== 4) {
        setPinError("Please confirm your PIN");
        return;
      }
      if (pinInput !== pinConfirm) {
        setPinError("PINs do not match");
        return;
      }
    }

    setSettingPin(true);

    try {
      const { data: existing, error: checkError } = await supabase
        .from("withdrawal_settings")
        .select("id")
        .eq("user_id", driverId)
        .maybeSingle();

      if (checkError) throw checkError;

      let error;
      if (existing) {
        const { error: updateError } = await supabase
          .from("withdrawal_settings")
          .update({
            withdrawal_pin: pinInput,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", driverId);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from("withdrawal_settings")
          .insert({
            user_id: driverId,
            user_type: "driver",
            withdrawal_pin: pinInput,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        error = insertError;
      }

      if (error) throw error;

      setHasPin(true);
      setShowPinSetupModal(false);
      resetPinFields();

      Alert.alert("Success", "Withdrawal PIN has been set successfully!");

      // After first-time PIN setup, continue with the pending withdrawal
      if (withdrawalPending) {
        const pending = withdrawalPending;
        setWithdrawalPending(null);
        await processPointsWithdrawal(pending.points, pending.cashAmount);
      }
    } catch (err) {
      console.log("Error setting PIN:", err.message);
      setPinError("Failed to set PIN. Please try again.");
    } finally {
      setSettingPin(false);
    }
  };

  const verifyPin = async (pin) => {
    if (isTestAccount) {
      Alert.alert("Test Account", "PIN verification is disabled for test accounts.");
      return false;
    }
    
    setVerifyingPin(true);

    try {
      const { data, error } = await supabase
        .from("withdrawal_settings")
        .select("withdrawal_pin")
        .eq("user_id", driverId)
        .maybeSingle();

      if (error) throw error;

      if (!data?.withdrawal_pin) {
        Alert.alert("Setup Required", "Please set up a withdrawal PIN first.");
        return false;
      }

      if (data.withdrawal_pin !== pin) {
        Alert.alert(
          "Invalid PIN",
          "The PIN you entered is incorrect. Please try again."
        );
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
    if (isTestAccount) {
      // Set mock payout method for test account
      setPayoutMethods([{
        id: 'test-payout',
        payment_type: 'gcash',
        account_name: 'Test Driver',
        account_number: '09123456789',
        is_default: true,
      }]);
      setSelectedPayoutMethod({
        id: 'test-payout',
        payment_type: 'gcash',
        account_name: 'Test Driver',
        account_number: '09123456789',
        is_default: true,
      });
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from("user_payment_methods")
        .select("*")
        .eq("user_id", userId)
        .eq("user_type", "driver")
        .eq("is_active", true)
        .order("is_default", { ascending: false });

      if (error) throw error;

      setPayoutMethods(data || []);

      const defaultMethod = data?.find((m) => m.is_default);
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
    if (isTestAccount) {
      setWithdrawals([]);
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from("withdrawals")
        .select(
          `
          *,
          withdrawal_logs (
            action,
            notes,
            created_at
          )
        `
        )
        .eq("user_id", userId)
        .eq("user_type", "driver")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setWithdrawals(data || []);
    } catch (err) {
      console.log("Error loading withdrawal history:", err.message);
    }
  };

  const loadPointsData = async (id) => {
    if (isTestAccount) return;
    
    const uid = id || driverId;
    if (!uid) return;

    try {
      setLoading(true);
      await Promise.all([
        fetchPointsFromWallet(uid),
        fetchPointsHistory(uid),
        fetchWeeklyPoints(uid),
        fetchStatistics(uid),
        fetchTransactions(uid),
      ]);
    } catch (err) {
      console.log("Error loading points data:", err);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    if (isTestAccount) {
      setRefreshing(false);
      return;
    }
    
    if (!driverId) return;
    setRefreshing(true);
    await Promise.all([
      loadPointsData(driverId),
      loadPayoutMethods(driverId),
      loadWithdrawalHistory(driverId),
    ]);
    setRefreshing(false);
  };

  const fetchPointsFromWallet = async (uid) => {
    try {
      const { data, error } = await supabase
        .from("driver_wallets")
        .select("points, cash_earnings, gcash_earnings, wallet_earnings")
        .eq("driver_id", uid)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const points = Number(data.points) || 0;
        setPointsData((prev) => ({
          ...prev,
          total_points: points,
          points_value: points * POINTS_CONVERSION_RATE,
        }));

        setEarningsData({
          cash_earnings: Number(data.cash_earnings) || 0,
          gcash_earnings: Number(data.gcash_earnings) || 0,
          wallet_earnings: Number(data.wallet_earnings) || 0,
          total_earnings:
            (Number(data.cash_earnings) || 0) +
            (Number(data.wallet_earnings) || 0),
        });
      } else {
        // Create wallet if it doesn't exist
        await supabase.from("driver_wallets").insert({
          driver_id: uid,
          points: 0,
          cash_earnings: 0,
          gcash_earnings: 0,
          wallet_earnings: 0,
          balance: 0,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }
    } catch (err) {
      console.log("Error fetching points from wallet:", err.message);
    }
  };

  const fetchPointsHistory = async (uid) => {
    try {
      const { data: pointsHistory, error: historyError } = await supabase
        .from("driver_points_history")
        .select("points, source, type, created_at")
        .eq("driver_id", uid)
        .eq("type", "earned")
        .order("created_at", { ascending: false });

      if (historyError) throw historyError;

      const pointsFromRides =
        pointsHistory
          ?.filter((p) => p.source === "trip")
          .reduce((sum, p) => sum + (Number(p.points) || 0), 0) || 0;

      const pointsFromReferrals =
        pointsHistory
          ?.filter((p) => p.source === "referral")
          .reduce((sum, p) => sum + (Number(p.points) || 0), 0) || 0;

      const pointsFromBonuses =
        pointsHistory
          ?.filter((p) => p.source === "mission")
          .reduce((sum, p) => sum + (Number(p.points) || 0), 0) || 0;

      setPointsData((prev) => ({
        ...prev,
        points_from_rides: pointsFromRides,
        points_from_referrals: pointsFromReferrals,
        points_from_bonuses: pointsFromBonuses,
      }));
    } catch (err) {
      console.log("Error fetching points history:", err.message);
    }
  };

  const fetchWeeklyPoints = async (uid) => {
    try {
      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay() + 1);
      startOfWeek.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("driver_points_history")
        .select("points, created_at")
        .eq("driver_id", uid)
        .eq("type", "earned")
        .gte("created_at", startOfWeek.toISOString())
        .order("created_at", { ascending: true });

      if (error) throw error;

      const dailyPoints = [0, 0, 0, 0, 0, 0, 0];

      data?.forEach((record) => {
        if (record.created_at) {
          const date = new Date(record.created_at);
          let dayIndex = date.getDay();
          dayIndex = dayIndex === 0 ? 6 : dayIndex - 1;
          dailyPoints[dayIndex] += Number(record.points) || 0;
        }
      });

      setWeeklyPoints(dailyPoints);
    } catch (err) {
      console.log("Error fetching weekly points:", err.message);
    }
  };

  const fetchStatistics = async (uid) => {
    try {
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      const { data: monthlyData, error: monthlyError } = await supabase
        .from("driver_points_history")
        .select("points")
        .eq("driver_id", uid)
        .eq("type", "earned")
        .gte("created_at", startOfMonth.toISOString());

      if (monthlyError) throw monthlyError;

      const monthlyTotal =
        monthlyData?.reduce((sum, p) => sum + (Number(p.points) || 0), 0) || 0;
      setMonthlyPoints(monthlyTotal);

      const { data: tripsData, error: tripsError } = await supabase
        .from("bookings")
        .select("id")
        .eq("driver_id", uid)
        .eq("status", "completed");

      if (tripsError) throw tripsError;
      setTotalTrips(tripsData?.length || 0);
    } catch (err) {
      console.log("Error fetching statistics:", err.message);
    }
  };

  const fetchTransactions = async (uid) => {
    try {
      const { data: bookings, error: bookingsError } = await supabase
        .from("bookings")
        .select(
          `
          id,
          actual_fare,
          created_at,
          pickup_location,
          dropoff_location,
          payment_type,
          points_used
        `
        )
        .eq("driver_id", uid)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(50);

      if (bookingsError) throw bookingsError;

      const bookingTransactions = (bookings || []).map((b) => {
        const paymentMethod = b.payment_type || "cash";
        const pointsUsed = Number(b.points_used) || 0;

        let description = `${(b.pickup_location || "Pickup").split(",")[0]} → ${
          (b.dropoff_location || "Dropoff").split(",")[0]
        }`;
        if (paymentMethod === "wallet" && pointsUsed > 0) {
          description += ` (+${pointsUsed} pts)`;
        }

        return {
          id: `booking-${b.id}`,
          type: paymentMethod === "wallet" ? "points_earning" : "earning",
          amount:
            paymentMethod === "wallet"
              ? pointsUsed
              : Number(b.actual_fare) || 0,
          description,
          date: b.created_at,
          paymentMethod,
          points: pointsUsed,
          isPoints: paymentMethod === "wallet",
        };
      });

      const { data: pointsHistory, error: pointsError } = await supabase
        .from("driver_points_history")
        .select("*")
        .eq("driver_id", uid)
        .order("created_at", { ascending: false })
        .limit(50);

      if (pointsError) throw pointsError;

      const pointsTransactions = (pointsHistory || []).map((p) => ({
        id: `points-${p.id}`,
        type: p.type === "converted" ? "points_converted" : "points_earned",
        amount: p.points,
        description:
          p.description ||
          `${
            p.source === "trip"
              ? "Ride earnings"
              : p.source === "referral"
              ? "Referral bonus"
              : "Mission bonus"
          } (+${p.points} pts)`,
        date: p.created_at,
        isPoints: true,
        points: p.points,
        conversionRate: p.conversion_rate,
      }));

      const { data: withdrawalData, error: withdrawalsError } = await supabase
        .from("withdrawals")
        .select("*")
        .eq("user_id", uid)
        .eq("user_type", "driver")
        .order("created_at", { ascending: false })
        .limit(50);

      if (withdrawalsError) throw withdrawalsError;

      const withdrawalTransactions = (withdrawalData || []).map((w) => ({
        id: `withdrawal-${w.id}`,
        type: "withdrawal",
        amount: -Number(w.amount),
        description: `Withdrew ₱${Number(w.amount).toFixed(2)} to ${
          w.payment_method?.toUpperCase() || "GCash"
        }`,
        date: w.created_at,
        status: w.status,
        points: 0,
        isPoints: false,
      }));

      const allTransactions = [
        ...bookingTransactions,
        ...pointsTransactions,
        ...withdrawalTransactions,
      ].sort((a, b) => new Date(b.date) - new Date(a.date));

      setRecentTransactions(allTransactions);
    } catch (err) {
      console.log("Error fetching transactions:", err.message);
    }
  };

  const handleAddPayoutMethod = async () => {
    if (isTestAccount) {
      Alert.alert("Test Account", "Adding payout methods is disabled for test accounts.");
      return;
    }
    
    if (!newPayoutMethod.account_name || !newPayoutMethod.account_number) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    if (
      newPayoutMethod.payment_type === "gcash" &&
      !/^09\d{9}$/.test(newPayoutMethod.account_number)
    ) {
      Alert.alert(
        "Error",
        "Please enter a valid GCash number (11 digits starting with 09)"
      );
      return;
    }

    setAddingPayout(true);

    try {
      const { data: existing } = await supabase
        .from("user_payment_methods")
        .select("id")
        .eq("user_id", driverId)
        .eq("user_type", "driver")
        .eq("account_number", newPayoutMethod.account_number)
        .maybeSingle();

      if (existing) {
        Alert.alert("Error", "This payout method is already added");
        return;
      }

      const isFirstMethod = payoutMethods.length === 0;

      const { error } = await supabase.from("user_payment_methods").insert({
        user_id: driverId,
        user_type: "driver",
        payment_type: newPayoutMethod.payment_type,
        account_name: newPayoutMethod.account_name,
        account_number: newPayoutMethod.account_number,
        account_phone: newPayoutMethod.account_phone,
        recipient_name:
          newPayoutMethod.recipient_name || newPayoutMethod.account_name,
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

      await loadPayoutMethods(driverId);
    } catch (err) {
      console.log("Error adding payout method:", err.message);
      Alert.alert("Error", "Failed to add payout method");
    } finally {
      setAddingPayout(false);
    }
  };

  const handleSetDefaultPayoutMethod = async (methodId) => {
    if (isTestAccount) {
      Alert.alert("Test Account", "This feature is disabled for test accounts.");
      return;
    }
    
    setSettingDefault(true);

    try {
      await supabase
        .from("user_payment_methods")
        .update({ is_default: false })
        .eq("user_id", driverId)
        .eq("user_type", "driver");

      await supabase
        .from("user_payment_methods")
        .update({ is_default: true })
        .eq("id", methodId);

      await loadPayoutMethods(driverId);

      Alert.alert("Success", "Default payout method updated");
    } catch (err) {
      console.log("Error setting default:", err.message);
      Alert.alert("Error", "Failed to update default method");
    } finally {
      setSettingDefault(false);
    }
  };

  const handleDeletePayoutMethod = async (methodId) => {
    if (isTestAccount) {
      Alert.alert("Test Account", "This feature is disabled for test accounts.");
      return;
    }
    
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

              await loadPayoutMethods(driverId);
              Alert.alert("Success", "Payout method removed");
            } catch (err) {
              console.log("Error deleting method:", err.message);
              Alert.alert("Error", "Failed to remove payout method");
            } finally {
              setDeletingPayout(false);
            }
          },
        },
      ]
    );
  };

  const handlePointsChange = (points) => {
    const cleaned = points.replace(/[^0-9]/g, "");
    const pointsNum = parseFloat(cleaned) || 0;
    setWithdrawPoints(cleaned);
    setPointsToCash(pointsNum * POINTS_CONVERSION_RATE);
  };

  const isWithdrawDisabled = () => {
    if (isTestAccount) return true;
    const points = parseFloat(withdrawPoints);
    return (
      !withdrawPoints ||
      isNaN(points) ||
      points < MIN_POINTS_WITHDRAWAL ||
      points > pointsData.total_points ||
      !selectedPayoutMethod ||
      processingWithdrawal
    );
  };

  const initiateWithdrawal = () => {
    if (isTestAccount) {
      Alert.alert("Test Account", "Withdrawals are disabled for test accounts.");
      return;
    }
    
    const points = parseFloat(withdrawPoints);

    if (!withdrawPoints || isNaN(points) || points < MIN_POINTS_WITHDRAWAL) {
      Alert.alert(
        "Error",
        `Minimum withdrawal is ${MIN_POINTS_WITHDRAWAL} points (₱${(
          MIN_POINTS_WITHDRAWAL * POINTS_CONVERSION_RATE
        ).toFixed(2)})`
      );
      return;
    }

    if (points > pointsData.total_points) {
      Alert.alert(
        "Error",
        `Insufficient points. Available: ${pointsData.total_points.toFixed(
          0
        )} points (₱${pointsData.points_value.toFixed(2)})`
      );
      return;
    }

    if (!selectedPayoutMethod) {
      Alert.alert("Error", "Please add a payout method first");
      setShowPayoutMethodsModal(true);
      return;
    }

    const cashAmount = points * POINTS_CONVERSION_RATE;
    const withdrawalData = { points, cashAmount };

    if (hasPin) {
      resetPinFields();
      setWithdrawalPending(withdrawalData);
      setShowPinModal(true);
    } else {
      Alert.alert(
        "Setup Withdrawal PIN",
        "For your security, please set up a 4-digit withdrawal PIN first.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Set Up PIN",
            onPress: () => {
              resetPinFields();
              setWithdrawalPending(withdrawalData);
              setShowPinSetupModal(true);
            },
          },
        ]
      );
    }
  };

  const handleWithdrawWithPin = async () => {
    if (pinInput.length !== 4) {
      Alert.alert("Error", "Please enter your 4-digit PIN");
      return;
    }

    const pending = withdrawalPending;
    const isValid = await verifyPin(pinInput);

    if (isValid && pending) {
      setShowPinModal(false);
      setWithdrawalPending(null);
      setPinInput("");
      await processPointsWithdrawal(pending.points, pending.cashAmount);
    }
  };

  const processPointsWithdrawal = async (points, cashAmount) => {
    if (isTestAccount) return;
    
    setProcessingWithdrawal(true);

    try {
      // Re-check available points at the time of processing
      const { data: wallet, error: walletError } = await supabase
        .from("driver_wallets")
        .select("points, points_converted")
        .eq("driver_id", driverId)
        .single();

      if (walletError) throw walletError;

      if (wallet.points < points) {
        throw new Error(
          "Insufficient points. Please refresh and try again."
        );
      }

      const notificationDriverName = driverName || "Driver";

      // Create withdrawal request
      const { data: withdrawal, error: withdrawalError } = await supabase
        .from("withdrawals")
        .insert({
          user_id: driverId,
          user_type: "driver",
          amount: cashAmount,
          payment_method: selectedPayoutMethod.payment_type,
          account_details: {
            account_name: selectedPayoutMethod.account_name,
            account_number: selectedPayoutMethod.account_number,
            account_phone: selectedPayoutMethod.account_phone,
            points_converted: points,
            conversion_rate: POINTS_CONVERSION_RATE,
            payment_method_id: selectedPayoutMethod.id,
          },
          notes: withdrawNotes || `Converting ${points} points to cash`,
          payment_method_id: selectedPayoutMethod.id,
          requested_at: new Date().toISOString(),
          status: "pending",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
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
        .from("driver_wallets")
        .update({
          points: wallet.points - points,
          points_converted: (wallet.points_converted || 0) + points,
          last_points_conversion: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("driver_id", driverId);

      if (updateError) {
        console.log("Wallet update error:", updateError);
        throw updateError;
      }

      console.log("✅ Points deducted from wallet");

      // Log points conversion in driver_points_history
      const { error: historyError } = await supabase
        .from("driver_points_history")
        .insert({
          driver_id: driverId,
          points: points,
          type: "converted",
          source: "conversion",
          source_id: withdrawal.id,
          description: `Converted ${points} points to ₱${cashAmount.toFixed(2)}`,
          conversion_rate: POINTS_CONVERSION_RATE,
          converted_amount: cashAmount,
          created_at: new Date().toISOString(),
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
          user_id: driverId,
          user_type: "driver",
          notes: `Points withdrawal request: ${points} points = ₱${cashAmount.toFixed(2)}`,
          created_at: new Date().toISOString(),
        });

      if (logError) {
        console.log("❌ Withdrawal log error:", logError);
      } else {
        console.log("✅ Withdrawal log created");
      }

      // Driver notification
      const { error: driverNotifError } = await supabase
        .from("notifications")
        .insert({
          user_id: driverId,
          user_type: "driver",
          type: "payment",
          title: "Withdrawal Request Submitted",
          message: `Your request to convert ${points} points to ₱${cashAmount.toFixed(
            2
          )} has been submitted. We will notify you once processed.`,
          reference_id: withdrawal.id,
          reference_type: "withdrawal",
          data: {
            points: points,
            amount: cashAmount,
            status: "pending",
          },
          priority: "normal",
          created_at: new Date().toISOString(),
        });

      if (driverNotifError) {
        console.log("Driver notification error:", driverNotifError);
      } else {
        console.log("✅ Driver notification created");
      }

      // Admin notifications
      const { data: admins, error: adminsError } = await supabase
        .from("admins")
        .select("id")
        .eq("is_active", true);

      if (adminsError) {
        console.log("Error fetching admins:", adminsError);
      } else if (admins && admins.length > 0) {
        const adminNotifications = admins.map((admin) => ({
          user_id: admin.id,
          user_type: "admin",
          type: "payment",
          title: "New Withdrawal Request",
          message: `${notificationDriverName} requested to convert ${points} points to ₱${cashAmount.toFixed(
            2
          )} via ${selectedPayoutMethod.payment_type.toUpperCase()}`,
          reference_id: withdrawal.id,
          reference_type: "withdrawal",
          data: {
            driver_id: driverId,
            driver_name: notificationDriverName,
            points: points,
            amount: cashAmount,
            payment_method: selectedPayoutMethod.payment_type,
            account_number: selectedPayoutMethod.account_number,
          },
          priority: "high",
          created_at: new Date().toISOString(),
        }));

        const { error: adminNotifError } = await supabase
          .from("notifications")
          .insert(adminNotifications);

        if (adminNotifError) {
          console.log("Admin notifications error:", adminNotifError);
        } else {
          console.log(
            `✅ ${adminNotifications.length} admin notifications created`
          );
        }
      }

      Alert.alert(
        "✅ Withdrawal Request Submitted",
        `${points.toFixed(0)} points converted to ₱${cashAmount.toFixed(2)}\n\n` +
          `Request ID: ${withdrawal.id.substring(0, 8)}...\n\n` +
          `We have notified our admin team. You will receive a notification once processed.`
      );

      resetWithdrawModal();

      // Refresh all data
      await Promise.all([
        loadPointsData(driverId),
        loadWithdrawalHistory(driverId),
      ]);
    } catch (err) {
      console.log("Withdrawal error:", err);
      Alert.alert(
        "Error",
        err.message || "Failed to process withdrawal. Please try again."
      );
    } finally {
      setProcessingWithdrawal(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
    });
  };

  const getTransactionIcon = (type, paymentMethod, isPoints) => {
    if (isPoints && type === "points_earning") {
      return { name: "star", color: "#F59E0B", bg: "#FEF3C7" };
    }
    if (type === "points_converted") {
      return { name: "swap-horizontal", color: "#10B981", bg: "#D1FAE5" };
    }
    if (type === "withdrawal") {
      return { name: "arrow-down-outline", color: "#EF4444", bg: "#FEE2E2" };
    }
    if (type === "earning") {
      switch (paymentMethod) {
        case "gcash":
          return { name: "phone-portrait", color: "#00579F", bg: "#E6F0FF" };
        case "cash":
          return { name: "cash", color: "#10B981", bg: "#D1FAE5" };
        default:
          return { name: "wallet", color: "#183B5C", bg: "#E6E9F0" };
      }
    }
    return { name: "receipt", color: "#6B7280", bg: "#F3F4F6" };
  };

  const getWithdrawalStatusColor = (status) => {
    switch (status) {
      case "pending":
        return "#F59E0B";
      case "success":
        return "#10B981";
      case "failed":
        return "#EF4444";
      default:
        return "#6B7280";
    }
  };

  const getWithdrawalStatusText = (status) => {
    switch (status) {
      case "pending":
        return "Pending Approval";
      case "success":
        return "Processing";
      case "failed":
        return "Failed";
      default:
        return status;
    }
  };

  // Show loading only for normal users
  if (loading && !refreshing && !isTestAccount) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#F5F7FA",
        }}
      >
        <ActivityIndicator size="large" color="#183B5C" />
        <Text style={{ marginTop: 10, color: "#666" }}>
          Loading your points...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F5F7FA" }}
      refreshControl={
        !isTestAccount ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        ) : undefined
      }
    >
      {/* Test Account Banner */}
      {isTestAccount && (
        <View style={{
          backgroundColor: "#FFF3E0",
          padding: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}>
          <Ionicons name="flask" size={20} color="#E97A3E" />
          <Text style={{ color: "#E97A3E", fontSize: 12, fontWeight: "500" }}>
            Test Account Mode - Withdrawals disabled
          </Text>
        </View>
      )}

      {/* Header */}
      <View
        style={{
          backgroundColor: "#183B5C",
          paddingTop: insets.top + 20,
          paddingBottom: 5,
          paddingHorizontal: 20,
          borderBottomLeftRadius: 30,
          borderBottomRightRadius: 30,
        }}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          style={{ position: "absolute", top: insets.top + 10, left: 20 }}
        >
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </Pressable>
        <Text
          style={{
            fontSize: 24,
            fontWeight: "bold",
            color: "#FFF",
            marginTop: 20,
          }}
        >
          Points Wallet
        </Text>
      </View>

      {/* Main Points Card */}
      <View
        style={{
          marginHorizontal: 20,
          backgroundColor: "#FFF",
          borderRadius: 24,
          padding: 20,
          marginTop: 20,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 12,
          elevation: 5,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View>
            <Text style={{ fontSize: 14, color: "#666" }}>
              Available Points
            </Text>
            <View style={{ flexDirection: "row", alignItems: "baseline" }}>
              <Ionicons name="star" size={28} color="#F59E0B" />
              <Text
                style={{
                  fontSize: 36,
                  fontWeight: "bold",
                  color: "#183B5C",
                  marginLeft: 5,
                }}
              >
                {pointsData.total_points.toFixed(0)}
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: "#10B981", marginTop: 2 }}>
              ≈ ₱{pointsData.points_value.toFixed(2)} value
            </Text>
          </View>
          <View
            style={{
              backgroundColor: "#FEF3C7",
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 20,
            }}
          >
            <Text style={{ fontSize: 12, color: "#F59E0B", fontWeight: "600" }}>
              1 pt = ₱0.10
            </Text>
          </View>
        </View>

        {/* Quick Stats Row */}
        <View
          style={{
            flexDirection: "row",
            marginTop: 20,
            paddingTop: 15,
            borderTopWidth: 1,
            borderTopColor: "#F3F4F6",
          }}
        >
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: "#666" }}>Total Trips</Text>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#333" }}>
              {totalTrips}
            </Text>
          </View>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: "#666" }}>
              Points This Month
            </Text>
            <Text
              style={{ fontSize: 18, fontWeight: "bold", color: "#F59E0B" }}
            >
              {monthlyPoints}
            </Text>
          </View>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: "#666" }}>Total Earnings</Text>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#333" }}>
              ₱{earningsData.total_earnings.toFixed(0)}
            </Text>
          </View>
        </View>

        {/* Action Buttons - Disabled for test accounts */}
        <View style={{ flexDirection: "row", marginTop: 20, gap: 10 }}>
          <Pressable
            style={{
              flex: 1,
              backgroundColor: isTestAccount ? "#9CA3AF" : "#F59E0B",
              padding: 12,
              borderRadius: 12,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
            }}
            onPress={() => !isTestAccount && setShowWithdrawModal(true)}
            disabled={isTestAccount}
          >
            <Ionicons name="cash-outline" size={18} color="#FFF" />
            <Text
              style={{ color: "#FFF", fontWeight: "600", marginLeft: 5 }}
            >
              Convert Points
            </Text>
          </Pressable>

          <Pressable
            style={{
              flex: 1,
              backgroundColor: isTestAccount ? "#9CA3AF" : "#183B5C",
              padding: 12,
              borderRadius: 12,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
            }}
            onPress={() => !isTestAccount && setShowPayoutMethodsModal(true)}
            disabled={isTestAccount}
          >
            <Ionicons name="card-outline" size={18} color="#FFF" />
            <Text
              style={{ color: "#FFF", fontWeight: "600", marginLeft: 5 }}
            >
              Payout Methods
            </Text>
          </Pressable>
        </View>

        {/* PIN Status Indicator - Hide for test accounts */}
        {!isTestAccount && !hasPin && (
          <View
            style={{
              marginTop: 12,
              padding: 10,
              backgroundColor: "#FEF3C7",
              borderRadius: 12,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="shield-outline" size={16} color="#F59E0B" />
              <Text
                style={{ fontSize: 12, color: "#F59E0B", marginLeft: 5 }}
              >
                Withdrawal PIN not set
              </Text>
            </View>
            <Pressable
              onPress={() => {
                resetPinFields();
                setShowPinSetupModal(true);
              }}
            >
              <Text
                style={{ fontSize: 12, color: "#183B5C", fontWeight: "600" }}
              >
                Set up now →
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Payout Methods Quick View - Hide for test accounts */}
      {!isTestAccount && payoutMethods.length > 0 && selectedPayoutMethod && (
        <Pressable
          onPress={() => setShowPayoutMethodsModal(true)}
          style={{
            marginHorizontal: 20,
            marginTop: 15,
            backgroundColor: "#FFF",
            borderRadius: 16,
            padding: 15,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: "#E6F0FF",
                justifyContent: "center",
                alignItems: "center",
                marginRight: 12,
              }}
            >
              <Ionicons
                name={
                  selectedPayoutMethod.payment_type === "gcash"
                    ? "phone-portrait"
                    : "cash"
                }
                size={20}
                color="#00579F"
              />
            </View>
            <View>
              <Text
                style={{ fontSize: 14, fontWeight: "600", color: "#333" }}
              >
                {selectedPayoutMethod.payment_type.toUpperCase()}:{" "}
                {selectedPayoutMethod.account_number}
              </Text>
              <Text style={{ fontSize: 12, color: "#666" }}>
                {selectedPayoutMethod.account_name}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </Pressable>
      )}

      {/* For test accounts, show a demo payout method info */}
      {isTestAccount && payoutMethods.length > 0 && selectedPayoutMethod && (
        <View
          style={{
            marginHorizontal: 20,
            marginTop: 15,
            backgroundColor: "#FFF",
            borderRadius: 16,
            padding: 15,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            opacity: 0.7,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: "#E6F0FF",
                justifyContent: "center",
                alignItems: "center",
                marginRight: 12,
              }}
            >
              <Ionicons name="phone-portrait" size={20} color="#00579F" />
            </View>
            <View>
              <Text
                style={{ fontSize: 14, fontWeight: "600", color: "#333" }}
              >
                GCASH: 09123456789 (Demo)
              </Text>
              <Text style={{ fontSize: 12, color: "#666" }}>
                Test Driver
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Points Chart */}
      <View
        style={{
          marginHorizontal: 20,
          marginTop: 20,
          backgroundColor: "#FFF",
          borderRadius: 24,
          padding: 20,
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: "bold",
            color: "#333",
            marginBottom: 15,
          }}
        >
          Weekly Points Earned
        </Text>
        {weeklyPoints.some((day) => day > 0) ? (
          <LineChart
            data={{
              labels: ["M", "T", "W", "T", "F", "S", "S"],
              datasets: [{ data: weeklyPoints }],
            }}
            width={screenWidth}
            height={160}
            yAxisLabel=""
            chartConfig={{
              backgroundColor: "#FFF",
              backgroundGradientFrom: "#FFF",
              backgroundGradientTo: "#FFF",
              decimalPlaces: 0,
              color: () => `#F59E0B`,
              style: { borderRadius: 16 },
            }}
            bezier
            style={{ borderRadius: 16 }}
            formatYLabel={(value) => `${value} pts`}
          />
        ) : (
          <View
            style={{ height: 160, justifyContent: "center", alignItems: "center" }}
          >
            <Text style={{ color: "#9CA3AF" }}>No points earned this week</Text>
          </View>
        )}
      </View>

      {/* Points Breakdown */}
      <View
        style={{
          marginHorizontal: 20,
          marginTop: 20,
          backgroundColor: "#FFF",
          borderRadius: 24,
          padding: 20,
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: "bold",
            color: "#333",
            marginBottom: 15,
          }}
        >
          Points Breakdown
        </Text>
        <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
          <View style={{ alignItems: "center" }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: "#FEF3C7",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="car" size={24} color="#F59E0B" />
            </View>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "bold",
                color: "#F59E0B",
                marginTop: 8,
              }}
            >
              {pointsData.points_from_rides}
            </Text>
            <Text style={{ fontSize: 12, color: "#666" }}>From Rides</Text>
          </View>

          <View style={{ alignItems: "center" }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: "#E6F0FF",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="people" size={24} color="#00579F" />
            </View>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "bold",
                color: "#00579F",
                marginTop: 8,
              }}
            >
              {pointsData.points_from_referrals}
            </Text>
            <Text style={{ fontSize: 12, color: "#666" }}>Referrals</Text>
          </View>

          <View style={{ alignItems: "center" }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: "#D1FAE5",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="trophy" size={24} color="#10B981" />
            </View>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "bold",
                color: "#10B981",
                marginTop: 8,
              }}
            >
              {pointsData.points_from_bonuses}
            </Text>
            <Text style={{ fontSize: 12, color: "#666" }}>Bonuses</Text>
          </View>
        </View>

        <View
          style={{
            marginTop: 15,
            padding: 10,
            backgroundColor: "#F9FAFB",
            borderRadius: 12,
          }}
        >
          <Text style={{ fontSize: 12, color: "#4B5563" }}>
            <Text style={{ fontWeight: "bold" }}>
              • Points are earned when passengers pay via wallet{"\n"}
            </Text>
            <Text style={{ fontWeight: "bold" }}>
              • 1 point = ₱0.10 cash value{"\n"}
            </Text>
            <Text style={{ fontWeight: "bold" }}>
              • Minimum withdrawal: {MIN_POINTS_WITHDRAWAL} points (₱
              {(MIN_POINTS_WITHDRAWAL * POINTS_CONVERSION_RATE).toFixed(2)})
            </Text>
          </Text>
        </View>
      </View>

      {/* Recent Transactions */}
      <View
        style={{
          marginHorizontal: 20,
          marginTop: 20,
          backgroundColor: "#FFF",
          borderRadius: 24,
          padding: 20,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 15,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "bold", color: "#333" }}>
            Recent Activity
          </Text>
          {!isTestAccount && (
            <Pressable onPress={() => setShowWithdrawalHistory(true)}>
              <Text style={{ fontSize: 12, color: "#183B5C" }}>
                Conversion History →
              </Text>
            </Pressable>
          )}
        </View>
        {recentTransactions.length === 0 ? (
          <View style={{ padding: 30, alignItems: "center" }}>
            <Ionicons name="receipt-outline" size={40} color="#D1D5DB" />
            <Text style={{ marginTop: 10, color: "#9CA3AF" }}>
              No transactions yet
            </Text>
          </View>
        ) : (
          recentTransactions.slice(0, 5).map((transaction, index) => {
            const icon = getTransactionIcon(
              transaction.type,
              transaction.paymentMethod,
              transaction.isPoints
            );
            return (
              <View
                key={transaction.id || index}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 12,
                  borderBottomWidth: index === 4 ? 0 : 1,
                  borderBottomColor: "#F3F4F6",
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: icon.bg,
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: 12,
                  }}
                >
                  <Ionicons name={icon.name} size={20} color={icon.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "500",
                      color: "#333",
                    }}
                    numberOfLines={1}
                  >
                    {transaction.description}
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: "#9CA3AF",
                      marginTop: 2,
                    }}
                  >
                    {formatDate(transaction.date)}
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "bold",
                    color:
                      transaction.type === "withdrawal"
                        ? "#EF4444"
                        : transaction.isPoints
                        ? "#F59E0B"
                        : "#10B981",
                  }}
                >
                  {transaction.type === "withdrawal" ? "-" : "+"}
                  {transaction.isPoints
                    ? `${transaction.amount} pts`
                    : `₱${Math.abs(transaction.amount).toFixed(2)}`}
                </Text>
              </View>
            );
          })
        )}
      </View>

      {/* Info Card */}
      <View
        style={{
          marginHorizontal: 20,
          marginTop: 20,
          padding: 15,
          backgroundColor: "#F0F9FF",
          borderRadius: 16,
        }}
      >
        <Text style={{ fontSize: 12, color: "#4B5563" }}>
          • ⭐ Points are earned from wallet payments (passengers paying with
          points){"\n"}• 💰 1 point = ₱0.10 when converted to cash{"\n"}• 📱
          Converted points are sent to your GCash/PayMaya within 1-2 business
          days{"\n"}• 🎯 Minimum conversion: {MIN_POINTS_WITHDRAWAL} points
          {"\n"}• 🔒 Withdrawal PIN required for security
        </Text>
      </View>
      <View style={{ height: 30 }} />

      {/* All modals remain the same, just wrapped with !isTestAccount condition */}
      {/* PIN Setup Modal - Hide for test accounts */}
      {!isTestAccount && (
        <Modal visible={showPinSetupModal} transparent animationType="slide">
          {/* ... existing modal content ... */}
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.5)",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <View
              style={{
                backgroundColor: "#FFF",
                borderRadius: 24,
                padding: 20,
                width: "90%",
                maxWidth: 350,
              }}
            >
              <View style={{ alignItems: "center", marginBottom: 20 }}>
                <Ionicons name="shield-checkmark" size={48} color="#183B5C" />
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: "bold",
                    color: "#333",
                    marginTop: 10,
                  }}
                >
                  {hasPin ? "Change Withdrawal PIN" : "Set Withdrawal PIN"}
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: "#666",
                    textAlign: "center",
                    marginTop: 5,
                  }}
                >
                  {hasPin
                    ? "Enter your new 4-digit PIN"
                    : "Create a 4-digit PIN for withdrawals"}
                </Text>
              </View>

              <Text style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
                {hasPin ? "New PIN" : "Enter PIN"}
              </Text>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: pinError ? "#EF4444" : "#E5E7EB",
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 24,
                  textAlign: "center",
                  marginBottom: 16,
                  backgroundColor: "#FFF",
                }}
                placeholder="••••"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry={true}
                value={pinInput}
                onChangeText={(text) => {
                  setPinInput(text.replace(/[^0-9]/g, ""));
                  setPinError("");
                }}
              />

              {!hasPin && (
                <>
                  <Text style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
                    Confirm PIN
                  </Text>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: pinError ? "#EF4444" : "#E5E7EB",
                      borderRadius: 12,
                      padding: 12,
                      fontSize: 24,
                      textAlign: "center",
                      marginBottom: 16,
                      backgroundColor: "#FFF",
                    }}
                    placeholder="••••"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    maxLength={4}
                    secureTextEntry={true}
                    value={pinConfirm}
                    onChangeText={(text) => {
                      setPinConfirm(text.replace(/[^0-9]/g, ""));
                      setPinError("");
                    }}
                  />
                </>
              )}

              {pinError ? (
                <Text
                  style={{
                    color: "#EF4444",
                    fontSize: 12,
                    marginBottom: 16,
                    textAlign: "center",
                  }}
                >
                  {pinError}
                </Text>
              ) : null}

              <View style={{ flexDirection: "row", gap: 12 }}>
                <Pressable
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: "#F3F4F6",
                  }}
                  onPress={() => {
                    setShowPinSetupModal(false);
                    resetPinFields();
                    setWithdrawalPending(null);
                  }}
                >
                  <Text style={{ textAlign: "center", color: "#666" }}>
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: "#183B5C",
                  }}
                  onPress={setupPin}
                  disabled={settingPin}
                >
                  {settingPin ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text
                      style={{
                        textAlign: "center",
                        color: "#FFF",
                        fontWeight: "600",
                      }}
                    >
                      {hasPin ? "Update PIN" : "Set PIN"}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* PIN Verification Modal - Hide for test accounts */}
      {!isTestAccount && (
        <Modal visible={showPinModal} transparent animationType="slide">
          {/* ... existing modal content ... */}
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.5)",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <View
              style={{
                backgroundColor: "#FFF",
                borderRadius: 24,
                padding: 20,
                width: "90%",
                maxWidth: 350,
              }}
            >
              <View style={{ alignItems: "center", marginBottom: 20 }}>
                <Ionicons name="lock-closed" size={48} color="#183B5C" />
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: "bold",
                    color: "#333",
                    marginTop: 10,
                  }}
                >
                  Verify PIN
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: "#666",
                    textAlign: "center",
                    marginTop: 5,
                  }}
                >
                  Enter your 4-digit withdrawal PIN to continue
                </Text>
              </View>

              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 24,
                  textAlign: "center",
                  marginBottom: 20,
                  backgroundColor: "#FFF",
                }}
                placeholder="••••"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry={true}
                value={pinInput}
                onChangeText={(text) =>
                  setPinInput(text.replace(/[^0-9]/g, ""))
                }
                autoFocus
              />

              <View style={{ flexDirection: "row", gap: 12 }}>
                <Pressable
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: "#F3F4F6",
                  }}
                  onPress={() => {
                    setShowPinModal(false);
                    resetPinFields();
                    setWithdrawalPending(null);
                  }}
                >
                  <Text style={{ textAlign: "center", color: "#666" }}>
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: "#F59E0B",
                  }}
                  onPress={handleWithdrawWithPin}
                  disabled={verifyingPin}
                >
                  {verifyingPin ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text
                      style={{
                        textAlign: "center",
                        color: "#FFF",
                        fontWeight: "600",
                      }}
                    >
                      Confirm
                    </Text>
                  )}
                </Pressable>
              </View>

              <Pressable
                style={{ marginTop: 12, padding: 8 }}
                onPress={() => {
                  setShowPinModal(false);
                  resetPinFields();
                  setShowPinSetupModal(true);
                }}
              >
                <Text
                  style={{
                    textAlign: "center",
                    color: "#183B5C",
                    fontSize: 12,
                  }}
                >
                  Forgot PIN? Reset it here
                </Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}

      {/* Payout Methods Modal - Hide for test accounts */}
      {!isTestAccount && (
        <Modal visible={showPayoutMethodsModal} transparent animationType="slide">
          {/* ... existing modal content ... */}
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.5)",
              justifyContent: "flex-end",
            }}
          >
            <View
              style={{
                backgroundColor: "#FFF",
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                padding: 20,
                maxHeight: "90%",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 20,
                }}
              >
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: "bold",
                    color: "#333",
                  }}
                >
                  Payout Methods
                </Text>
                <Pressable onPress={() => setShowPayoutMethodsModal(false)}>
                  <Ionicons name="close" size={24} color="#666" />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}
                keyboardShouldPersistTaps="handled">
                {payoutMethods.length === 0 ? (
                  <View style={{ alignItems: "center", padding: 40 }}>
                    <Ionicons
                      name="card-outline"
                      size={60}
                      color="#D1D5DB"
                    />
                    <Text
                      style={{
                        marginTop: 10,
                        color: "#666",
                        textAlign: "center",
                      }}
                    >
                      No payout methods added yet
                    </Text>
                    <Pressable
                      style={{
                        marginTop: 20,
                        backgroundColor: "#183B5C",
                        padding: 12,
                        borderRadius: 12,
                        width: "100%",
                      }}
                      onPress={() => {
                        setShowPayoutMethodsModal(false);
                        setShowAddPayoutModal(true);
                      }}
                    >
                      <Text
                        style={{
                          color: "#FFF",
                          textAlign: "center",
                          fontWeight: "600",
                        }}
                      >
                        Add Payout Method
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    {payoutMethods.map((method) => (
                      <View
                        key={method.id}
                        style={{
                          marginBottom: 12,
                          padding: 15,
                          backgroundColor: "#F9FAFB",
                          borderRadius: 12,
                          borderWidth: method.is_default ? 2 : 1,
                          borderColor: method.is_default
                            ? "#183B5C"
                            : "#E5E7EB",
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              flex: 1,
                            }}
                          >
                            <View
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                backgroundColor: "#E6F0FF",
                                justifyContent: "center",
                                alignItems: "center",
                                marginRight: 12,
                              }}
                            >
                              <Ionicons
                                name={
                                  method.payment_type === "gcash"
                                    ? "phone-portrait"
                                    : "cash"
                                }
                                size={20}
                                color="#00579F"
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text
                                style={{
                                  fontSize: 16,
                                  fontWeight: "600",
                                  color: "#333",
                                }}
                              >
                                {method.payment_type.toUpperCase()}
                              </Text>
                              <Text style={{ fontSize: 12, color: "#666" }}>
                                {method.account_number}
                              </Text>
                              <Text
                                style={{ fontSize: 11, color: "#9CA3AF" }}
                              >
                                {method.account_name}
                              </Text>
                            </View>
                          </View>
                          {method.is_default && (
                            <View
                              style={{
                                backgroundColor: "#183B5C",
                                paddingHorizontal: 8,
                                paddingVertical: 4,
                                borderRadius: 12,
                              }}
                            >
                              <Text style={{ fontSize: 10, color: "#FFF" }}>
                                Default
                              </Text>
                            </View>
                          )}
                        </View>

                        <View
                          style={{
                            flexDirection: "row",
                            marginTop: 12,
                            gap: 8,
                          }}
                        >
                          {!method.is_default && (
                            <Pressable
                              style={{
                                flex: 1,
                                padding: 8,
                                backgroundColor: "#F3F4F6",
                                borderRadius: 8,
                                alignItems: "center",
                              }}
                              onPress={() =>
                                handleSetDefaultPayoutMethod(method.id)
                              }
                              disabled={settingDefault}
                            >
                              {settingDefault ? (
                                <ActivityIndicator
                                  size="small"
                                  color="#183B5C"
                                />
                              ) : (
                                <Text
                                  style={{ fontSize: 12, color: "#183B5C" }}
                                >
                                  Set Default
                                </Text>
                              )}
                            </Pressable>
                          )}
                          <Pressable
                            style={{
                              flex: 1,
                              padding: 8,
                              backgroundColor: "#FEE2E2",
                              borderRadius: 8,
                              alignItems: "center",
                            }}
                            onPress={() =>
                              handleDeletePayoutMethod(method.id)
                            }
                            disabled={deletingPayout}
                          >
                            {deletingPayout ? (
                              <ActivityIndicator
                                size="small"
                                color="#EF4444"
                              />
                            ) : (
                              <Text
                                style={{ fontSize: 12, color: "#EF4444" }}
                              >
                                Remove
                              </Text>
                            )}
                          </Pressable>
                        </View>
                      </View>
                    ))}

                    <Pressable
                      style={{
                        marginTop: 12,
                        padding: 12,
                        backgroundColor: "#F3F4F6",
                        borderRadius: 12,
                        alignItems: "center",
                        flexDirection: "row",
                        justifyContent: "center",
                      }}
                      onPress={() => {
                        setShowPayoutMethodsModal(false);
                        setShowAddPayoutModal(true);
                      }}
                    >
                      <Ionicons name="add" size={20} color="#183B5C" />
                      <Text
                        style={{
                          color: "#183B5C",
                          fontWeight: "600",
                          marginLeft: 5,
                        }}
                      >
                        Add New Payout Method
                      </Text>
                    </Pressable>
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* Add Payout Method Modal - Hide for test accounts */}
      {!isTestAccount && (
        <Modal visible={showAddPayoutModal} transparent animationType="slide">
          {/* ... existing modal content ... */}
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.5)",
              justifyContent: "flex-end",
            }}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
            >
              <View
                style={{
                  backgroundColor: "#FFF",
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  padding: 20,
                  maxHeight: "90%",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 20,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: "bold",
                      color: "#333",
                    }}
                  >
                    Add Payout Method
                  </Text>
                  <Pressable onPress={() => setShowAddPayoutModal(false)}>
                    <Ionicons name="close" size={24} color="#666" />
                  </Pressable>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}
                  keyboardShouldPersistTaps="handled">
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: "#333",
                      marginBottom: 8,
                    }}
                  >
                    Payment Type
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      marginBottom: 20,
                      gap: 10,
                    }}
                  >
                    <Pressable
                      style={[
                        {
                          flex: 1,
                          padding: 12,
                          borderRadius: 12,
                          borderWidth: 2,
                          alignItems: "center",
                        },
                        newPayoutMethod.payment_type === "gcash"
                          ? {
                              borderColor: "#00579F",
                              backgroundColor: "#E6F0FF",
                            }
                          : { borderColor: "#E5E7EB" },
                      ]}
                      onPress={() =>
                        setNewPayoutMethod({
                          ...newPayoutMethod,
                          payment_type: "gcash",
                        })
                      }
                    >
                      <Ionicons
                        name="phone-portrait"
                        size={24}
                        color={
                          newPayoutMethod.payment_type === "gcash"
                            ? "#00579F"
                            : "#9CA3AF"
                        }
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          color:
                            newPayoutMethod.payment_type === "gcash"
                              ? "#00579F"
                              : "#666",
                        }}
                      >
                        GCash
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        {
                          flex: 1,
                          padding: 12,
                          borderRadius: 12,
                          borderWidth: 2,
                          alignItems: "center",
                        },
                        newPayoutMethod.payment_type === "paymaya"
                          ? {
                              borderColor: "#00579F",
                              backgroundColor: "#E6F0FF",
                            }
                          : { borderColor: "#E5E7EB" },
                      ]}
                      onPress={() =>
                        setNewPayoutMethod({
                          ...newPayoutMethod,
                          payment_type: "paymaya",
                        })
                      }
                    >
                      <Ionicons
                        name="card"
                        size={24}
                        color={
                          newPayoutMethod.payment_type === "paymaya"
                            ? "#00579F"
                            : "#9CA3AF"
                        }
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          color:
                            newPayoutMethod.payment_type === "paymaya"
                              ? "#00579F"
                              : "#666",
                        }}
                      >
                        PayMaya
                      </Text>
                    </Pressable>
                  </View>

                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: "#333",
                      marginBottom: 8,
                    }}
                  >
                    Account Name
                  </Text>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: "#E5E7EB",
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 16,
                    }}
                    placeholder="Full name as per GCash/PayMaya"
                    value={newPayoutMethod.account_name}
                    onChangeText={(text) =>
                      setNewPayoutMethod({
                        ...newPayoutMethod,
                        account_name: text,
                      })
                    }
                  />

                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: "#333",
                      marginBottom: 8,
                    }}
                  >
                    {newPayoutMethod.payment_type === "gcash"
                      ? "GCash Number"
                      : "PayMaya Number"}
                  </Text>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: "#E5E7EB",
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 16,
                    }}
                    placeholder={
                      newPayoutMethod.payment_type === "gcash"
                        ? "0917XXXXXXX"
                        : "0999XXXXXXX"
                    }
                    keyboardType="phone-pad"
                    value={newPayoutMethod.account_number}
                    onChangeText={(text) =>
                      setNewPayoutMethod({
                        ...newPayoutMethod,
                        account_number: text,
                      })
                    }
                    maxLength={11}
                  />

                  <Pressable
                    style={{
                      backgroundColor: "#183B5C",
                      padding: 16,
                      borderRadius: 12,
                      alignItems: "center",
                      marginTop: 10,
                    }}
                    onPress={handleAddPayoutMethod}
                    disabled={addingPayout}
                  >
                    {addingPayout ? (
                      <ActivityInflater size="small" color="#FFF" />
                    ) : (
                      <Text
                        style={{
                          color: "#FFF",
                          fontWeight: "600",
                          fontSize: 16,
                        }}
                      >
                        Add Payout Method
                      </Text>
                    )}
                  </Pressable>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      )}

      {/* Withdrawal / Convert Points Modal - Hide for test accounts */}
      {!isTestAccount && (
        <Modal visible={showWithdrawModal} transparent animationType="slide">
          {/* ... existing modal content ... */}
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.5)",
              justifyContent: "flex-end",
            }}
          >
            <View
              style={{
                backgroundColor: "#FFF",
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                padding: 20,
                maxHeight: "90%",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 20,
                }}
              >
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: "bold",
                    color: "#333",
                  }}
                >
                  Convert Points to Cash
                </Text>
                <Pressable onPress={resetWithdrawModal}>
                  <Ionicons name="close" size={24} color="#666" />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 24 }}
                keyboardShouldPersistTaps="handled">
                <View
                  style={{
                    backgroundColor: "#FEF3C7",
                    padding: 15,
                    borderRadius: 12,
                    marginBottom: 20,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontSize: 14, color: "#666" }}>
                      Available Points
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Ionicons name="star" size={16} color="#F59E0B" />
                      <Text
                        style={{
                          fontSize: 18,
                          fontWeight: "bold",
                          color: "#F59E0B",
                          marginLeft: 4,
                        }}
                      >
                        {pointsData.total_points.toFixed(0)}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={{ fontSize: 12, color: "#10B981", marginTop: 4 }}
                  >
                    ≈ ₱{pointsData.points_value.toFixed(2)} value
                  </Text>
                </View>

                {/* Selected Payout Method */}
                {selectedPayoutMethod ? (
                  <View
                    style={{
                      marginBottom: 20,
                      padding: 15,
                      backgroundColor: "#F9FAFB",
                      borderRadius: 12,
                    }}
                  >
                    <Text style={{ fontSize: 12, color: "#666", marginBottom: 5 }}>
                      Send to:
                    </Text>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "600",
                        color: "#333",
                      }}
                    >
                      {selectedPayoutMethod.payment_type.toUpperCase()}
                    </Text>
                    <Text style={{ fontSize: 14, color: "#666" }}>
                      {selectedPayoutMethod.account_number}
                    </Text>
                    <Text style={{ fontSize: 12, color: "#9CA3AF" }}>
                      {selectedPayoutMethod.account_name}
                    </Text>
                    <Pressable
                      onPress={() => {
                        resetWithdrawModal();
                        setShowPayoutMethodsModal(true);
                      }}
                      style={{ marginTop: 8 }}
                    >
                      <Text style={{ fontSize: 12, color: "#183B5C" }}>
                        Change payout method →
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <View
                    style={{
                      marginBottom: 20,
                      padding: 15,
                      backgroundColor: "#FEF3C7",
                      borderRadius: 12,
                    }}
                  >
                    <Text style={{ fontSize: 14, color: "#F59E0B" }}>
                      No payout method added
                    </Text>
                    <Pressable
                      onPress={() => {
                        resetWithdrawModal();
                        setShowAddPayoutModal(true);
                      }}
                      style={{ marginTop: 8 }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          color: "#183B5C",
                          fontWeight: "600",
                        }}
                      >
                        Add payout method →
                      </Text>
                    </Pressable>
                  </View>
                )}

                {/* Points Input */}
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: "#333",
                    marginBottom: 8,
                  }}
                >
                  Points to Convert
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 20,
                  }}
                >
                  <Ionicons name="star" size={24} color="#F59E0B" />
                  <TextInput
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: "#E5E7EB",
                      borderRadius: 12,
                      padding: 12,
                      fontSize: 18,
                      marginLeft: 8,
                    }}
                    placeholder="0"
                    keyboardType="numeric"
                    value={withdrawPoints}
                    onChangeText={handlePointsChange}
                  />
                </View>

                {/* Conversion Preview */}
                {parseFloat(withdrawPoints) > 0 && (
                  <View
                    style={{
                      marginBottom: 20,
                      padding: 12,
                      backgroundColor: "#D1FAE5",
                      borderRadius: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        color: "#10B981",
                        textAlign: "center",
                      }}
                    >
                      You will receive: ₱{pointsToCash.toFixed(2)}
                    </Text>
                    <Text
                      style={{
                        fontSize: 11,
                        color: "#666",
                        textAlign: "center",
                        marginTop: 4,
                      }}
                    >
                      Conversion rate: 1 point = ₱{POINTS_CONVERSION_RATE}
                    </Text>
                  </View>
                )}

                {/* Quick Points */}
                <Text style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
                  Quick select:
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    marginBottom: 20,
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  {[1000, 2000, 5000, 10000].map((pts) => (
                    <Pressable
                      key={pts}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        backgroundColor: "#F3F4F6",
                        borderRadius: 8,
                        alignItems: "center",
                      }}
                      onPress={() => handlePointsChange(pts.toString())}
                    >
                      <Text style={{ fontSize: 12, color: "#333" }}>
                        {pts} pts
                      </Text>
                      <Text style={{ fontSize: 10, color: "#10B981" }}>
                        ₱{(pts * POINTS_CONVERSION_RATE).toFixed(0)}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Notes */}
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: "#333",
                    marginBottom: 8,
                  }}
                >
                  Notes (Optional)
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 20,
                    height: 80,
                  }}
                  placeholder="Any notes for the admin?"
                  multiline
                  value={withdrawNotes}
                  onChangeText={setWithdrawNotes}
                />

                {/* Convert Button */}
                <Pressable
                  style={{
                    backgroundColor: isWithdrawDisabled()
                      ? "#9CA3AF"
                      : "#F59E0B",
                    padding: 16,
                    borderRadius: 12,
                    alignItems: "center",
                  }}
                  onPress={initiateWithdrawal}
                  disabled={isWithdrawDisabled()}
                >
                  {processingWithdrawal ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text
                      style={{
                        color: "#FFF",
                        fontWeight: "600",
                        fontSize: 16,
                      }}
                    >
                      Convert {withdrawPoints || 0} points to ₱
                      {pointsToCash.toFixed(2)}
                    </Text>
                  )}
                </Pressable>

                <Text
                  style={{
                    fontSize: 11,
                    color: "#9CA3AF",
                    textAlign: "center",
                    marginTop: 12,
                  }}
                >
                  Minimum conversion: {MIN_POINTS_WITHDRAWAL} points (₱
                  {(MIN_POINTS_WITHDRAWAL * POINTS_CONVERSION_RATE).toFixed(2)}
                  )
                </Text>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* Withdrawal History Modal - Hide for test accounts */}
      {!isTestAccount && (
        <Modal visible={showWithdrawalHistory} transparent animationType="slide">
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.5)",
              justifyContent: "flex-end",
            }}
          >
            <View
              style={{
                backgroundColor: "#FFF",
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                padding: 20,
                maxHeight: "90%",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 20,
                }}
              >
                <Text
                  style={{ fontSize: 20, fontWeight: "bold", color: "#333" }}
                >
                  Conversion History
                </Text>
                <Pressable onPress={() => setShowWithdrawalHistory(false)}>
                  <Ionicons name="close" size={24} color="#666" />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}
                keyboardShouldPersistTaps="handled">
                {withdrawals.length === 0 ? (
                  <View style={{ alignItems: "center", padding: 40 }}>
                    <Ionicons
                      name="time-outline"
                      size={60}
                      color="#D1D5DB"
                    />
                    <Text
                      style={{
                        marginTop: 10,
                        color: "#666",
                        textAlign: "center",
                      }}
                    >
                      No conversion requests yet
                    </Text>
                  </View>
                ) : (
                  withdrawals.map((withdrawal) => {
                    const pointsConverted =
                      withdrawal.account_details?.points_converted || 0;
                    return (
                      <View
                        key={withdrawal.id}
                        style={{
                          marginBottom: 12,
                          padding: 15,
                          backgroundColor: "#F9FAFB",
                          borderRadius: 12,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 8,
                          }}
                        >
                          <View>
                            <Text
                              style={{
                                fontSize: 16,
                                fontWeight: "bold",
                                color: "#333",
                              }}
                            >
                              ₱{Number(withdrawal.amount).toFixed(2)}
                            </Text>
                            {pointsConverted > 0 && (
                              <Text
                                style={{ fontSize: 12, color: "#F59E0B" }}
                              >
                                {pointsConverted} points
                              </Text>
                            )}
                          </View>
                          <View
                            style={{
                              backgroundColor:
                                getWithdrawalStatusColor(withdrawal.status) +
                                "20",
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 12,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                color: getWithdrawalStatusColor(
                                  withdrawal.status
                                ),
                              }}
                            >
                              {getWithdrawalStatusText(withdrawal.status)}
                            </Text>
                          </View>
                        </View>

                        <Text style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
                          {new Date(withdrawal.created_at).toLocaleDateString(
                            "en-PH",
                            {
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            }
                          )}
                        </Text>

                        <Text style={{ fontSize: 12, color: "#666" }}>
                          Method:{" "}
                          {withdrawal.payment_method?.toUpperCase() || "GCash"}
                        </Text>

                        {withdrawal.payment_reference && (
                          <Text
                            style={{
                              fontSize: 11,
                              color: "#10B981",
                              marginTop: 4,
                            }}
                          >
                            Ref: {withdrawal.payment_reference}
                          </Text>
                        )}

                        {withdrawal.admin_notes && (
                          <Text
                            style={{
                              fontSize: 11,
                              color: "#9CA3AF",
                              marginTop: 4,
                              fontStyle: "italic",
                            }}
                          >
                            Note: {withdrawal.admin_notes}
                          </Text>
                        )}
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
}