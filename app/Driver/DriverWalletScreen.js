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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { LineChart } from "react-native-chart-kit";

export default function DriverWalletScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get("window").width - 40;
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [driverId, setDriverId] = useState(null);
  const [driverName, setDriverName] = useState("");
  
  // Points data (primary currency for withdrawal)
  const [pointsData, setPointsData] = useState({
    total_points: 0,           // Current points from driver_wallets
    points_from_rides: 0,      // Points earned from rides
    points_from_referrals: 0,  // Points from referrals
    points_from_bonuses: 0,    // Bonus points
    points_value: 0,           // Cash value of points (1 point = ₱0.10)
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
  const POINTS_CONVERSION_RATE = 0.10;
  const MIN_POINTS_WITHDRAWAL = 1000; // Minimum 1000 points = ₱100

  // Fetch driver ID
  useFocusEffect(
    useCallback(() => {
      const getDriverId = async () => {
        try {
          const id = await AsyncStorage.getItem("user_id");
          setDriverId(id);
          if (id) {
            await fetchDriverName(id);
            await loadPayoutMethods(id);
            await loadWithdrawalHistory(id);
          }
        } catch (error) {
          console.log("Error getting driver ID:", error);
        }
      };
      getDriverId();
    }, [])
  );

  // Fetch all data when driverId changes
  useEffect(() => {
    if (driverId) loadPointsData();
  }, [driverId]);

  const fetchDriverName = async (id) => {
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

  const loadPayoutMethods = async (userId) => {
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
      
      // Set default selected method
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
        .select(`
          *,
          withdrawal_logs (
            action,
            notes,
            created_at
          )
        `)
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

  const loadPointsData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchPointsFromWallet(),
        fetchPointsHistory(),
        fetchWeeklyPoints(),
        fetchStatistics(),
        fetchTransactions(),
      ]);
    } catch (err) {
      console.log("Error loading points data:", err);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      loadPointsData(),
      loadPayoutMethods(driverId),
      loadWithdrawalHistory(driverId),
    ]);
    setRefreshing(false);
  };

  const fetchPointsFromWallet = async () => {
    try {
      const { data, error } = await supabase
        .from("driver_wallets")
        .select("points, cash_earnings, gcash_earnings, wallet_earnings")
        .eq("driver_id", driverId)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        const points = Number(data.points) || 0;
        setPointsData(prev => ({
          ...prev,
          total_points: points,
          points_value: points * POINTS_CONVERSION_RATE,
        }));
        
        setEarningsData({
          cash_earnings: Number(data.cash_earnings) || 0,
          gcash_earnings: Number(data.gcash_earnings) || 0,
          wallet_earnings: Number(data.wallet_earnings) || 0,
          total_earnings: (Number(data.cash_earnings) || 0) + (Number(data.wallet_earnings) || 0),
        });
      } else {
        // Create wallet if it doesn't exist
        await supabase.from("driver_wallets").insert({
          driver_id: driverId,
          points: 0,
          cash_earnings: 0,
          gcash_earnings: 0,
          wallet_earnings: 0,
          balance: 0,
          created_at: new Date(),
          updated_at: new Date()
        });
      }
    } catch (err) {
      console.log("Error fetching points from wallet:", err.message);
    }
  };

  const fetchPointsHistory = async () => {
    try {
      // Get points from completed bookings (wallet payments)
      const { data: walletPayments, error: paymentsError } = await supabase
        .from("bookings")
        .select("points_used, created_at, actual_fare")
        .eq("driver_id", driverId)
        .eq("status", "completed")
        .eq("payment_type", "wallet");

      if (paymentsError) throw paymentsError;
      
      const pointsFromRides = walletPayments?.reduce((sum, b) => sum + (Number(b.points_used) || 0), 0) || 0;
      
      // Get points from driver_points_history
      const { data: pointsHistory, error: historyError } = await supabase
        .from("driver_points_history")
        .select("points, source, created_at")
        .eq("driver_id", driverId)
        .order("created_at", { ascending: false });

      if (historyError) throw historyError;
      
      const pointsFromReferrals = pointsHistory?.filter(p => p.source === "referral").reduce((sum, p) => sum + (Number(p.points) || 0), 0) || 0;
      const pointsFromBonuses = pointsHistory?.filter(p => p.source === "mission").reduce((sum, p) => sum + (Number(p.points) || 0), 0) || 0;
      
      setPointsData(prev => ({
        ...prev,
        points_from_rides: pointsFromRides,
        points_from_referrals: pointsFromReferrals,
        points_from_bonuses: pointsFromBonuses,
      }));
      
    } catch (err) {
      console.log("Error fetching points history:", err.message);
    }
  };

  const fetchWeeklyPoints = async () => {
    try {
      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay() + 1);
      startOfWeek.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("bookings")
        .select("points_used, ride_completed_at")
        .eq("driver_id", driverId)
        .eq("status", "completed")
        .eq("payment_type", "wallet")
        .gte("ride_completed_at", startOfWeek.toISOString())
        .order("ride_completed_at", { ascending: true });

      if (error) throw error;

      const dailyPoints = [0, 0, 0, 0, 0, 0, 0];

      data?.forEach(booking => {
        if (booking.ride_completed_at) {
          const date = new Date(booking.ride_completed_at);
          let dayIndex = date.getDay();
          dayIndex = dayIndex === 0 ? 6 : dayIndex - 1;
          dailyPoints[dayIndex] += Number(booking.points_used) || 0;
        }
      });

      setWeeklyPoints(dailyPoints);
    } catch (err) {
      console.log("Error fetching weekly points:", err.message);
    }
  };

  const fetchStatistics = async () => {
    try {
      // Get monthly points
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      
      const { data: monthlyData, error: monthlyError } = await supabase
        .from("bookings")
        .select("points_used")
        .eq("driver_id", driverId)
        .eq("status", "completed")
        .eq("payment_type", "wallet")
        .gte("ride_completed_at", startOfMonth.toISOString());

      if (monthlyError) throw monthlyError;

      const monthlyTotal = monthlyData?.reduce((sum, b) => sum + (Number(b.points_used) || 0), 0) || 0;
      setMonthlyPoints(monthlyTotal);

      // Get total trips
      const { data: tripsData, error: tripsError } = await supabase
        .from("bookings")
        .select("id")
        .eq("driver_id", driverId)
        .eq("status", "completed");

      if (tripsError) throw tripsError;
      setTotalTrips(tripsData?.length || 0);

    } catch (err) {
      console.log("Error fetching statistics:", err.message);
    }
  };

  const fetchTransactions = async () => {
    try {
      // Get completed bookings with points
      const { data: bookings, error: bookingsError } = await supabase
        .from("bookings")
        .select(`
          id,
          actual_fare,
          created_at,
          pickup_location,
          dropoff_location,
          payment_type,
          points_used
        `)
        .eq("driver_id", driverId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(50);

      if (bookingsError) throw bookingsError;

      // Format booking transactions
      const bookingTransactions = (bookings || []).map(b => {
        const paymentMethod = b.payment_type || "cash";
        const pointsUsed = Number(b.points_used) || 0;
        
        let description = `${(b.pickup_location || "Pickup").split(",")[0]} → ${(b.dropoff_location || "Dropoff").split(",")[0]}`;
        if (paymentMethod === "wallet" && pointsUsed > 0) {
          description += ` (+${pointsUsed} pts)`;
        }
        
        return {
          id: `booking-${b.id}`,
          type: paymentMethod === "wallet" ? "points_earning" : "earning",
          amount: paymentMethod === "wallet" ? pointsUsed : Number(b.actual_fare) || 0,
          description,
          date: b.created_at,
          paymentMethod,
          points: pointsUsed,
          isPoints: paymentMethod === "wallet",
        };
      });

      // Get points conversion transactions from driver_points_history
      const { data: pointsHistory, error: pointsError } = await supabase
        .from("driver_points_history")
        .select("*")
        .eq("driver_id", driverId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (pointsError) throw pointsError;

      const pointsTransactions = (pointsHistory || []).map(p => ({
        id: `points-${p.id}`,
        type: p.type === "converted" ? "points_converted" : "points_earned",
        amount: p.points,
        description: p.description || `${p.source === "trip" ? "Ride earnings" : p.source === "referral" ? "Referral bonus" : "Mission bonus"} (+${p.points} pts)`,
        date: p.created_at,
        isPoints: true,
        points: p.points,
        conversionRate: p.conversion_rate,
      }));

      // Get withdrawal transactions
      const { data: withdrawals, error: withdrawalsError } = await supabase
        .from("withdrawals")
        .select("*")
        .eq("user_id", driverId)
        .eq("user_type", "driver")
        .order("created_at", { ascending: false })
        .limit(50);

      if (withdrawalsError) throw withdrawalsError;

      const withdrawalTransactions = (withdrawals || []).map(w => ({
        id: `withdrawal-${w.id}`,
        type: "withdrawal",
        amount: -Number(w.amount),
        description: `Withdrew ₱${Number(w.amount).toFixed(2)} to ${w.payment_method?.toUpperCase() || "GCash"}`,
        date: w.created_at,
        status: w.status,
        points: 0,
        isPoints: false,
      }));

      // Combine and sort all transactions
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
    if (!newPayoutMethod.account_name || !newPayoutMethod.account_number) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    if (newPayoutMethod.payment_type === "gcash" && !/^09\d{9}$/.test(newPayoutMethod.account_number)) {
      Alert.alert("Error", "Please enter a valid GCash number (11 digits starting with 09)");
      return;
    }

    try {
      // Check if method already exists
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

      const { error } = await supabase
        .from("user_payment_methods")
        .insert({
          user_id: driverId,
          user_type: "driver",
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
      
      await loadPayoutMethods(driverId);
    } catch (err) {
      console.log("Error adding payout method:", err.message);
      Alert.alert("Error", "Failed to add payout method");
    }
  };

  const handleSetDefaultPayoutMethod = async (methodId) => {
    try {
      // Update all methods to not default
      await supabase
        .from("user_payment_methods")
        .update({ is_default: false })
        .eq("user_id", driverId)
        .eq("user_type", "driver");

      // Set selected as default
      await supabase
        .from("user_payment_methods")
        .update({ is_default: true })
        .eq("id", methodId);

      const updatedMethod = payoutMethods.find(m => m.id === methodId);
      setSelectedPayoutMethod(updatedMethod);
      await loadPayoutMethods(driverId);
      
      Alert.alert("Success", "Default payout method updated");
    } catch (err) {
      console.log("Error setting default:", err.message);
      Alert.alert("Error", "Failed to update default method");
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
            }
          }
        }
      ]
    );
  };

  const handlePointsChange = (points) => {
    const pointsNum = parseFloat(points) || 0;
    setWithdrawPoints(points);
    setPointsToCash(pointsNum * POINTS_CONVERSION_RATE);
  };

  const handleWithdraw = async () => {
    const points = parseFloat(withdrawPoints);
    const cashAmount = points * POINTS_CONVERSION_RATE;
    
    if (!withdrawPoints || isNaN(points) || points < MIN_POINTS_WITHDRAWAL) {
      Alert.alert("Error", `Minimum withdrawal is ${MIN_POINTS_WITHDRAWAL} points (₱${(MIN_POINTS_WITHDRAWAL * POINTS_CONVERSION_RATE).toFixed(2)})`);
      return;
    }

    if (points > pointsData.total_points) {
      Alert.alert("Error", `Insufficient points. Available: ${pointsData.total_points.toFixed(0)} points (₱${pointsData.points_value.toFixed(2)})`);
      return;
    }

    if (!selectedPayoutMethod) {
      Alert.alert("Error", "Please add a payout method first");
      setShowPayoutMethodsModal(true);
      return;
    }

    Alert.alert(
      "Confirm Withdrawal",
      `Convert ${points.toFixed(0)} points to ₱${cashAmount.toFixed(2)}\n\nWithdraw to:\n${selectedPayoutMethod.payment_type.toUpperCase()}\n${selectedPayoutMethod.account_number}\n${selectedPayoutMethod.account_name}\n\nThis will be processed within 1-2 business days.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", onPress: () => processPointsWithdrawal(points, cashAmount) },
      ]
    );
  };

const processPointsWithdrawal = async (points, cashAmount) => {
  try {
    // First, check if enough points
    const { data: wallet, error: walletError } = await supabase
      .from("driver_wallets")
      .select("points, points_converted")
      .eq("driver_id", driverId)
      .single();

    if (walletError) throw walletError;
    
    if (wallet.points < points) {
      throw new Error("Insufficient points");
    }

    // Get driver details for notification
    const { data: driver, error: driverError } = await supabase
      .from("drivers")
      .select("first_name, last_name")
      .eq("id", driverId)
      .single();

    if (driverError) {
      console.log("Error fetching driver details:", driverError);
    }

    const driverName = driver ? `${driver.first_name} ${driver.last_name}` : "Driver";

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
          payment_method_id: selectedPayoutMethod.id
        },
        notes: withdrawNotes || `Converting ${points} points to cash`,
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
      .from("driver_wallets")
      .update({
        points: wallet.points - points,
        points_converted: (wallet.points_converted || 0) + points,
        last_points_conversion: new Date().toISOString(),
        updated_at: new Date().toISOString()
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
        created_at: new Date().toISOString()
      });

    if (historyError) {
      console.log("Points history error:", historyError);
    } else {
      console.log("✅ Points history recorded");
    }

    // ✅ Insert into withdrawal_logs
    const { error: logError } = await supabase
      .from("withdrawal_logs")
      .insert({
        withdrawal_id: withdrawal.id,
        action: "requested",
        user_id: driverId,
        user_type: "driver",
        notes: `Points withdrawal request: ${points} points = ₱${cashAmount.toFixed(2)}`,
        created_at: new Date().toISOString()
      });

    if (logError) {
      console.log("❌ Withdrawal log error:", logError);
    } else {
      console.log("✅ Withdrawal log created");
    }

    // ✅ CREATE NOTIFICATION FOR DRIVER (Confirmation)
    const { error: driverNotifError } = await supabase
      .from("notifications")
      .insert({
        user_id: driverId,
        user_type: "driver",
        type: "payment",
        title: "Withdrawal Request Submitted",
        message: `Your request to convert ${points} points to ₱${cashAmount.toFixed(2)} has been submitted. We will notify you once processed.`,
        reference_id: withdrawal.id,
        reference_type: "withdrawal",
        data: {
          points: points,
          amount: cashAmount,
          status: "pending"
        },
        priority: "normal",
        created_at: new Date().toISOString()
      });

    if (driverNotifError) {
      console.log("Driver notification error:", driverNotifError);
    } else {
      console.log("✅ Driver notification created");
    }

    // ✅ CREATE NOTIFICATION FOR ADMINS
    // First, get all admin users
    const { data: admins, error: adminsError } = await supabase
      .from("admins")
      .select("id")
      .eq("is_active", true);

    if (adminsError) {
      console.log("Error fetching admins:", adminsError);
    } else if (admins && admins.length > 0) {
      // Create notification for each admin
      const adminNotifications = admins.map(admin => ({
        user_id: admin.id,
        user_type: "admin",
        type: "payment",
        title: "New Withdrawal Request",
        message: `${driverName} requested to convert ${points} points to ₱${cashAmount.toFixed(2)} via ${selectedPayoutMethod.payment_type.toUpperCase()}`,
        reference_id: withdrawal.id,
        reference_type: "withdrawal",
        data: {
          driver_id: driverId,
          driver_name: driverName,
          points: points,
          amount: cashAmount,
          payment_method: selectedPayoutMethod.payment_type,
          account_number: selectedPayoutMethod.account_number
        },
        priority: "high",  // High priority for withdrawals
        created_at: new Date().toISOString()
      }));

      const { error: adminNotifError } = await supabase
        .from("notifications")
        .insert(adminNotifications);

      if (adminNotifError) {
        console.log("Admin notifications error:", adminNotifError);
      } else {
        console.log(`✅ ${adminNotifications.length} admin notifications created`);
      }
    }

    Alert.alert(
      "✅ Withdrawal Request Submitted",
      `${points.toFixed(0)} points converted to ₱${cashAmount.toFixed(2)}\n\n` +
      `Request ID: ${withdrawal.id.substring(0, 8)}...\n\n` +
      `We have notified our admin team. You will receive a notification once processed.`
    );
    
    setShowWithdrawModal(false);
    setWithdrawPoints("");
    setWithdrawNotes("");
    setPointsToCash(0);
    
    // Refresh all data
    await Promise.all([
      loadPointsData(),
      loadWithdrawalHistory(driverId)
    ]);
    
  } catch (err) {
    console.log("Withdrawal error:", err);
    Alert.alert("Error", err.message || "Failed to process withdrawal. Please try again.");
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
    return date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
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
        case "gcash": return { name: "phone-portrait", color: "#00579F", bg: "#E6F0FF" };
        case "cash": return { name: "cash", color: "#10B981", bg: "#D1FAE5" };
        default: return { name: "wallet", color: "#183B5C", bg: "#E6E9F0" };
      }
    }
    return { name: "receipt", color: "#6B7280", bg: "#F3F4F6" };
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
      case 'pending': return 'Pending Approval';
      case 'success': return 'Processing';
      case 'failed': return 'Failed';
      default: return status;
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F5F7FA" }}>
        <ActivityIndicator size="large" color="#183B5C" />
        <Text style={{ marginTop: 10, color: "#666" }}>Loading your points...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F5F7FA" }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={{
        backgroundColor: "#183B5C",
        paddingTop: insets.top + 20,
        paddingBottom: 30,
        paddingHorizontal: 20,
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
      }}>
        <Pressable onPress={() => navigation.goBack()} style={{ position: "absolute", top: insets.top + 10, left: 20 }}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </Pressable>
        <Text style={{ fontSize: 24, fontWeight: "bold", color: "#FFF", marginTop: 20 }}>Points Wallet</Text>
        <Text style={{ fontSize: 14, color: "#FFB37A", marginTop: 5 }}>{driverName || "Driver"}</Text>
      </View>

      {/* Main Points Card */}
      <View style={{
        marginHorizontal: 20,
        backgroundColor: "#FFF",
        borderRadius: 24,
        padding: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 5,
      }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={{ fontSize: 14, color: "#666" }}>Available Points</Text>
            <View style={{ flexDirection: "row", alignItems: "baseline" }}>
              <Ionicons name="star" size={28} color="#F59E0B" />
              <Text style={{ fontSize: 36, fontWeight: "bold", color: "#183B5C", marginLeft: 5 }}>
                {pointsData.total_points.toFixed(0)}
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: "#10B981", marginTop: 2 }}>
              ≈ ₱{pointsData.points_value.toFixed(2)} value
            </Text>
          </View>
          <View style={{ backgroundColor: "#FEF3C7", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
            <Text style={{ fontSize: 12, color: "#F59E0B", fontWeight: "600" }}>1 pt = ₱0.10</Text>
          </View>
        </View>

        {/* Quick Stats Row */}
        <View style={{ flexDirection: "row", marginTop: 20, paddingTop: 15, borderTopWidth: 1, borderTopColor: "#F3F4F6" }}>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: "#666" }}>Total Trips</Text>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#333" }}>{totalTrips}</Text>
          </View>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: "#666" }}>Points This Month</Text>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#F59E0B" }}>{monthlyPoints}</Text>
          </View>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 12, color: "#666" }}>Total Earnings</Text>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#333" }}>₱{earningsData.total_earnings.toFixed(0)}</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={{ flexDirection: "row", marginTop: 20, gap: 10 }}>
          <Pressable
            style={{ flex: 1, backgroundColor: "#F59E0B", padding: 12, borderRadius: 12, alignItems: "center", flexDirection: "row", justifyContent: "center" }}
            onPress={() => setShowWithdrawModal(true)}
          >
            <Ionicons name="cash-outline" size={18} color="#FFF" />
            <Text style={{ color: "#FFF", fontWeight: "600", marginLeft: 5 }}>Convert Points</Text>
          </Pressable>
          
          <Pressable
            style={{ flex: 1, backgroundColor: "#183B5C", padding: 12, borderRadius: 12, alignItems: "center", flexDirection: "row", justifyContent: "center" }}
            onPress={() => setShowPayoutMethodsModal(true)}
          >
            <Ionicons name="card-outline" size={18} color="#FFF" />
            <Text style={{ color: "#FFF", fontWeight: "600", marginLeft: 5 }}>Payout Methods</Text>
          </Pressable>
        </View>
      </View>

      {/* Payout Methods Quick View */}
      {payoutMethods.length > 0 && selectedPayoutMethod && (
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
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#E6F0FF", justifyContent: "center", alignItems: "center", marginRight: 12 }}>
              <Ionicons name={selectedPayoutMethod.payment_type === "gcash" ? "phone-portrait" : "cash"} size={20} color="#00579F" />
            </View>
            <View>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#333" }}>
                {selectedPayoutMethod.payment_type.toUpperCase()}: {selectedPayoutMethod.account_number}
              </Text>
              <Text style={{ fontSize: 12, color: "#666" }}>{selectedPayoutMethod.account_name}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </Pressable>
      )}

      {/* Points Chart */}
      <View style={{ marginHorizontal: 20, marginTop: 20, backgroundColor: "#FFF", borderRadius: 24, padding: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: "bold", color: "#333", marginBottom: 15 }}>Weekly Points Earned</Text>
        {weeklyPoints.some(day => day > 0) ? (
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
          <View style={{ height: 160, justifyContent: "center", alignItems: "center" }}>
            <Text style={{ color: "#9CA3AF" }}>No points earned this week</Text>
          </View>
        )}
      </View>

      {/* Points Breakdown */}
      <View style={{ marginHorizontal: 20, marginTop: 20, backgroundColor: "#FFF", borderRadius: 24, padding: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: "bold", color: "#333", marginBottom: 15 }}>Points Breakdown</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
          
          {/* Points from Rides */}
          <View style={{ alignItems: "center" }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#FEF3C7", justifyContent: "center", alignItems: "center" }}>
              <Ionicons name="car" size={24} color="#F59E0B" />
            </View>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#F59E0B", marginTop: 8 }}>
              {pointsData.points_from_rides}
            </Text>
            <Text style={{ fontSize: 12, color: "#666" }}>From Rides</Text>
          </View>

          {/* Points from Referrals */}
          <View style={{ alignItems: "center" }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#E6F0FF", justifyContent: "center", alignItems: "center" }}>
              <Ionicons name="people" size={24} color="#00579F" />
            </View>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#00579F", marginTop: 8 }}>
              {pointsData.points_from_referrals}
            </Text>
            <Text style={{ fontSize: 12, color: "#666" }}>Referrals</Text>
          </View>

          {/* Points from Bonuses */}
          <View style={{ alignItems: "center" }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#D1FAE5", justifyContent: "center", alignItems: "center" }}>
              <Ionicons name="trophy" size={24} color="#10B981" />
            </View>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#10B981", marginTop: 8 }}>
              {pointsData.points_from_bonuses}
            </Text>
            <Text style={{ fontSize: 12, color: "#666" }}>Bonuses</Text>
          </View>
        </View>

        {/* Explanation */}
        <View style={{ marginTop: 15, padding: 10, backgroundColor: "#F9FAFB", borderRadius: 12 }}>
          <Text style={{ fontSize: 12, color: "#4B5563" }}>
            <Text style={{ fontWeight: "bold" }}>• Points are earned when passengers pay via wallet{'\n'}</Text>
            <Text style={{ fontWeight: "bold" }}>• 1 point = ₱0.10 cash value{'\n'}</Text>
            <Text style={{ fontWeight: "bold" }}>• Minimum withdrawal: {MIN_POINTS_WITHDRAWAL} points (₱{(MIN_POINTS_WITHDRAWAL * POINTS_CONVERSION_RATE).toFixed(2)})</Text>
          </Text>
        </View>
      </View>

      {/* Recent Transactions */}
      <View style={{ marginHorizontal: 20, marginTop: 20, backgroundColor: "#FFF", borderRadius: 24, padding: 20 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}>
          <Text style={{ fontSize: 16, fontWeight: "bold", color: "#333" }}>Recent Activity</Text>
          <Pressable onPress={() => setShowWithdrawalHistory(true)}>
            <Text style={{ fontSize: 12, color: "#183B5C" }}>Conversion History →</Text>
          </Pressable>
        </View>
        {recentTransactions.length === 0 ? (
          <View style={{ padding: 30, alignItems: "center" }}>
            <Ionicons name="receipt-outline" size={40} color="#D1D5DB" />
            <Text style={{ marginTop: 10, color: "#9CA3AF" }}>No transactions yet</Text>
          </View>
        ) : (
          recentTransactions.slice(0, 5).map((transaction, index) => {
            const icon = getTransactionIcon(transaction.type, transaction.paymentMethod, transaction.isPoints);
            return (
              <View key={transaction.id || index} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: index === 4 ? 0 : 1, borderBottomColor: "#F3F4F6" }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: icon.bg, justifyContent: "center", alignItems: "center", marginRight: 12 }}>
                  <Ionicons name={icon.name} size={20} color={icon.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "500", color: "#333" }} numberOfLines={1}>
                    {transaction.description}
                  </Text>
                  <Text style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
                    {formatDate(transaction.date)}
                  </Text>
                </View>
                <Text style={{ fontSize: 16, fontWeight: "bold", color: transaction.type === "withdrawal" ? "#EF4444" : (transaction.isPoints ? "#F59E0B" : "#10B981") }}>
                  {transaction.type === "withdrawal" ? "-" : "+"}{transaction.isPoints ? `${transaction.amount} pts` : `₱${Math.abs(transaction.amount).toFixed(2)}`}
                </Text>
              </View>
            );
          })
        )}
      </View>

      {/* Info Card */}
      <View style={{ marginHorizontal: 20, marginTop: 20, padding: 15, backgroundColor: "#F0F9FF", borderRadius: 16 }}>
        <Text style={{ fontSize: 12, color: "#4B5563" }}>
          • ⭐ Points are earned from wallet payments (passengers paying with points){'\n'}
          • 💰 1 point = ₱0.10 when converted to cash{'\n'}
          • 📱 Converted points are sent to your GCash/PayMaya within 1-2 business days{'\n'}
          • 🎯 Minimum conversion: {MIN_POINTS_WITHDRAWAL} points
        </Text>
      </View>
      <View style={{ height: 30 }} />

      {/* Payout Methods Modal */}
      <Modal visible={showPayoutMethodsModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <View style={{ backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%" }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <Text style={{ fontSize: 20, fontWeight: "bold", color: "#333" }}>Payout Methods</Text>
                <Pressable onPress={() => setShowPayoutMethodsModal(false)}>
                  <Ionicons name="close" size={24} color="#666" />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {payoutMethods.length === 0 ? (
                  <View style={{ alignItems: "center", padding: 40 }}>
                    <Ionicons name="card-outline" size={60} color="#D1D5DB" />
                    <Text style={{ marginTop: 10, color: "#666", textAlign: "center" }}>
                      No payout methods added yet
                    </Text>
                    <Pressable 
                      style={{ marginTop: 20, backgroundColor: "#183B5C", padding: 12, borderRadius: 12, width: "100%" }}
                      onPress={() => {
                        setShowPayoutMethodsModal(false);
                        setShowAddPayoutModal(true);
                      }}
                    >
                      <Text style={{ color: "#FFF", textAlign: "center", fontWeight: "600" }}>
                        Add Payout Method
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    {payoutMethods.map((method) => (
                      <View key={method.id} style={{ marginBottom: 12, padding: 15, backgroundColor: "#F9FAFB", borderRadius: 12, borderWidth: method.is_default ? 2 : 1, borderColor: method.is_default ? "#183B5C" : "#E5E7EB" }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#E6F0FF", justifyContent: "center", alignItems: "center", marginRight: 12 }}>
                              <Ionicons name={method.payment_type === "gcash" ? "phone-portrait" : "cash"} size={20} color="#00579F" />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 16, fontWeight: "600", color: "#333" }}>
                                {method.payment_type.toUpperCase()}
                              </Text>
                              <Text style={{ fontSize: 12, color: "#666" }}>{method.account_number}</Text>
                              <Text style={{ fontSize: 11, color: "#9CA3AF" }}>{method.account_name}</Text>
                            </View>
                          </View>
                          {method.is_default && (
                            <View style={{ backgroundColor: "#183B5C", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                              <Text style={{ fontSize: 10, color: "#FFF" }}>Default</Text>
                            </View>
                          )}
                        </View>
                        
                        <View style={{ flexDirection: "row", marginTop: 12, gap: 8 }}>
                          {!method.is_default && (
                            <Pressable 
                              style={{ flex: 1, padding: 8, backgroundColor: "#F3F4F6", borderRadius: 8, alignItems: "center" }}
                              onPress={() => handleSetDefaultPayoutMethod(method.id)}
                            >
                              <Text style={{ fontSize: 12, color: "#183B5C" }}>Set Default</Text>
                            </Pressable>
                          )}
                          <Pressable 
                            style={{ flex: 1, padding: 8, backgroundColor: "#FEE2E2", borderRadius: 8, alignItems: "center" }}
                            onPress={() => handleDeletePayoutMethod(method.id)}
                          >
                            <Text style={{ fontSize: 12, color: "#EF4444" }}>Remove</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                    
                    <Pressable 
                      style={{ marginTop: 12, padding: 12, backgroundColor: "#F3F4F6", borderRadius: 12, alignItems: "center", flexDirection: "row", justifyContent: "center" }}
                      onPress={() => {
                        setShowPayoutMethodsModal(false);
                        setShowAddPayoutModal(true);
                      }}
                    >
                      <Ionicons name="add" size={20} color="#183B5C" />
                      <Text style={{ color: "#183B5C", fontWeight: "600", marginLeft: 5 }}>Add New Payout Method</Text>
                    </Pressable>
                  </>
                )}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Add Payout Method Modal */}
      <Modal visible={showAddPayoutModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <View style={{ backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <Text style={{ fontSize: 20, fontWeight: "bold", color: "#333" }}>Add Payout Method</Text>
                <Pressable onPress={() => setShowAddPayoutModal(false)}>
                  <Ionicons name="close" size={24} color="#666" />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Payment Type Selection */}
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 8 }}>Payment Type</Text>
                <View style={{ flexDirection: "row", marginBottom: 20, gap: 10 }}>
                  <Pressable
                    style={[{
                      flex: 1, padding: 12, borderRadius: 12, borderWidth: 2, alignItems: "center"
                    }, newPayoutMethod.payment_type === "gcash" ? { borderColor: "#00579F", backgroundColor: "#E6F0FF" } : { borderColor: "#E5E7EB" }]}
                    onPress={() => setNewPayoutMethod({ ...newPayoutMethod, payment_type: "gcash" })}
                  >
                    <Ionicons name="phone-portrait" size={24} color={newPayoutMethod.payment_type === "gcash" ? "#00579F" : "#9CA3AF"} />
                    <Text style={{ fontSize: 12, color: newPayoutMethod.payment_type === "gcash" ? "#00579F" : "#666" }}>GCash</Text>
                  </Pressable>
                  <Pressable
                    style={[{
                      flex: 1, padding: 12, borderRadius: 12, borderWidth: 2, alignItems: "center"
                    }, newPayoutMethod.payment_type === "paymaya" ? { borderColor: "#00579F", backgroundColor: "#E6F0FF" } : { borderColor: "#E5E7EB" }]}
                    onPress={() => setNewPayoutMethod({ ...newPayoutMethod, payment_type: "paymaya" })}
                  >
                    <Ionicons name="card" size={24} color={newPayoutMethod.payment_type === "paymaya" ? "#00579F" : "#9CA3AF"} />
                    <Text style={{ fontSize: 12, color: newPayoutMethod.payment_type === "paymaya" ? "#00579F" : "#666" }}>PayMaya</Text>
                  </Pressable>
                </View>

                {/* Account Name */}
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 8 }}>Account Name</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 12, marginBottom: 16 }}
                  placeholder="Full name as per GCash/PayMaya"
                  value={newPayoutMethod.account_name}
                  onChangeText={(text) => setNewPayoutMethod({ ...newPayoutMethod, account_name: text })}
                />

                {/* Account Number */}
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 8 }}>
                  {newPayoutMethod.payment_type === "gcash" ? "GCash Number" : "PayMaya Number"}
                </Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 12, marginBottom: 16 }}
                  placeholder={newPayoutMethod.payment_type === "gcash" ? "0917XXXXXXX" : "0999XXXXXXX"}
                  keyboardType="phone-pad"
                  value={newPayoutMethod.account_number}
                  onChangeText={(text) => setNewPayoutMethod({ ...newPayoutMethod, account_number: text })}
                  maxLength={11}
                />

                {/* Add Button */}
                <Pressable
                  style={{
                    backgroundColor: "#183B5C",
                    padding: 16,
                    borderRadius: 12,
                    alignItems: "center",
                    marginTop: 10,
                  }}
                  onPress={handleAddPayoutMethod}
                >
                  <Text style={{ color: "#FFF", fontWeight: "600", fontSize: 16 }}>
                    Add Payout Method
                  </Text>
                </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Withdrawal Modal - Points to Cash */}
      <Modal visible={showWithdrawModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <View style={{ backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <Text style={{ fontSize: 20, fontWeight: "bold", color: "#333" }}>Convert Points to Cash</Text>
                <Pressable onPress={() => setShowWithdrawModal(false)}>
                  <Ionicons name="close" size={24} color="#666" />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ backgroundColor: "#FEF3C7", padding: 15, borderRadius: 12, marginBottom: 20 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ fontSize: 14, color: "#666" }}>Available Points</Text>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Ionicons name="star" size={16} color="#F59E0B" />
                      <Text style={{ fontSize: 18, fontWeight: "bold", color: "#F59E0B", marginLeft: 4 }}>
                        {pointsData.total_points.toFixed(0)}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12, color: "#10B981", marginTop: 4 }}>
                    ≈ ₱{pointsData.points_value.toFixed(2)} value
                  </Text>
                </View>

                {/* Selected Payout Method */}
                {selectedPayoutMethod ? (
                  <View style={{ marginBottom: 20, padding: 15, backgroundColor: "#F9FAFB", borderRadius: 12 }}>
                    <Text style={{ fontSize: 12, color: "#666", marginBottom: 5 }}>Send to:</Text>
                    <Text style={{ fontSize: 16, fontWeight: "600", color: "#333" }}>
                      {selectedPayoutMethod.payment_type.toUpperCase()}
                    </Text>
                    <Text style={{ fontSize: 14, color: "#666" }}>{selectedPayoutMethod.account_number}</Text>
                    <Text style={{ fontSize: 12, color: "#9CA3AF" }}>{selectedPayoutMethod.account_name}</Text>
                    <Pressable 
                      onPress={() => {
                        setShowWithdrawModal(false);
                        setShowPayoutMethodsModal(true);
                      }}
                      style={{ marginTop: 8 }}
                    >
                      <Text style={{ fontSize: 12, color: "#183B5C" }}>Change payout method →</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={{ marginBottom: 20, padding: 15, backgroundColor: "#FEF3C7", borderRadius: 12 }}>
                    <Text style={{ fontSize: 14, color: "#F59E0B" }}>No payout method added</Text>
                    <Pressable 
                      onPress={() => {
                        setShowWithdrawModal(false);
                        setShowAddPayoutModal(true);
                      }}
                      style={{ marginTop: 8 }}
                    >
                      <Text style={{ fontSize: 14, color: "#183B5C", fontWeight: "600" }}>Add payout method →</Text>
                    </Pressable>
                  </View>
                )}

                {/* Points Input */}
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 8 }}>Points to Convert</Text>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}>
                  <Ionicons name="star" size={24} color="#F59E0B" />
                  <TextInput
                    style={{ flex: 1, borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 12, fontSize: 18, marginLeft: 8 }}
                    placeholder="0"
                    keyboardType="numeric"
                    value={withdrawPoints}
                    onChangeText={handlePointsChange}
                  />
                </View>

                {/* Conversion Preview */}
                {parseFloat(withdrawPoints) > 0 && (
                  <View style={{ marginBottom: 20, padding: 12, backgroundColor: "#D1FAE5", borderRadius: 12 }}>
                    <Text style={{ fontSize: 14, color: "#10B981", textAlign: "center" }}>
                      You will receive: ₱{pointsToCash.toFixed(2)}
                    </Text>
                    <Text style={{ fontSize: 11, color: "#666", textAlign: "center", marginTop: 4 }}>
                      Conversion rate: 1 point = ₱{POINTS_CONVERSION_RATE}
                    </Text>
                  </View>
                )}

                {/* Quick Points */}
                <Text style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>Quick select:</Text>
                <View style={{ flexDirection: "row", marginBottom: 20, gap: 8, flexWrap: "wrap" }}>
                  {[1000, 2000, 5000, 10000].map(points => (
                    <Pressable 
                      key={points} 
                      style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#F3F4F6", borderRadius: 8, alignItems: "center" }}
                      onPress={() => handlePointsChange(points.toString())}
                    >
                      <Text style={{ fontSize: 12, color: "#333" }}>{points} pts</Text>
                      <Text style={{ fontSize: 10, color: "#10B981" }}>₱{(points * POINTS_CONVERSION_RATE).toFixed(0)}</Text>
                    </Pressable>
                  ))}
                </View>

                {/* Notes */}
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 8 }}>Notes (Optional)</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 12, marginBottom: 20, height: 80 }}
                  placeholder="Any notes for the admin?"
                  multiline
                  value={withdrawNotes}
                  onChangeText={setWithdrawNotes}
                />

                {/* Withdraw Button */}
                <Pressable
                  style={{
                    backgroundColor: (!selectedPayoutMethod || !withdrawPoints || parseFloat(withdrawPoints) < MIN_POINTS_WITHDRAWAL || parseFloat(withdrawPoints) > pointsData.total_points) ? "#9CA3AF" : "#F59E0B",
                    padding: 16,
                    borderRadius: 12,
                    alignItems: "center",
                  }}
                  onPress={handleWithdraw}
                  disabled={!selectedPayoutMethod || !withdrawPoints || parseFloat(withdrawPoints) < MIN_POINTS_WITHDRAWAL || parseFloat(withdrawPoints) > pointsData.total_points}
                >
                  <Text style={{ color: "#FFF", fontWeight: "600", fontSize: 16 }}>
                    Convert {withdrawPoints || 0} points to ₱{pointsToCash.toFixed(2)}
                  </Text>
                </Pressable>

                <Text style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center", marginTop: 12 }}>
                  Minimum conversion: {MIN_POINTS_WITHDRAWAL} points (₱{(MIN_POINTS_WITHDRAWAL * POINTS_CONVERSION_RATE).toFixed(2)})
                </Text>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Withdrawal History Modal */}
      <Modal visible={showWithdrawalHistory} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: "bold", color: "#333" }}>Conversion History</Text>
              <Pressable onPress={() => setShowWithdrawalHistory(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {withdrawals.length === 0 ? (
                <View style={{ alignItems: "center", padding: 40 }}>
                  <Ionicons name="time-outline" size={60} color="#D1D5DB" />
                  <Text style={{ marginTop: 10, color: "#666", textAlign: "center" }}>
                    No conversion requests yet
                  </Text>
                </View>
              ) : (
                withdrawals.map((withdrawal, index) => {
                  const pointsConverted = withdrawal.account_details?.points_converted || 0;
                  return (
                    <View key={withdrawal.id} style={{ marginBottom: 12, padding: 15, backgroundColor: "#F9FAFB", borderRadius: 12 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <View>
                          <Text style={{ fontSize: 16, fontWeight: "bold", color: "#333" }}>
                            ₱{Number(withdrawal.amount).toFixed(2)}
                          </Text>
                          {pointsConverted > 0 && (
                            <Text style={{ fontSize: 12, color: "#F59E0B" }}>
                              {pointsConverted} points
                            </Text>
                          )}
                        </View>
                        <View style={{ backgroundColor: getWithdrawalStatusColor(withdrawal.status) + "20", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                          <Text style={{ fontSize: 11, color: getWithdrawalStatusColor(withdrawal.status) }}>
                            {getWithdrawalStatusText(withdrawal.status)}
                          </Text>
                        </View>
                      </View>
                      
                      <Text style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
                        {new Date(withdrawal.created_at).toLocaleDateString("en-PH", { 
                          month: "long", 
                          day: "numeric", 
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </Text>
                      
                      <Text style={{ fontSize: 12, color: "#666" }}>
                        Method: {withdrawal.payment_method?.toUpperCase() || "GCash"}
                      </Text>
                      
                      {withdrawal.payment_reference && (
                        <Text style={{ fontSize: 11, color: "#10B981", marginTop: 4 }}>
                          Ref: {withdrawal.payment_reference}
                        </Text>
                      )}
                      
                      {withdrawal.admin_notes && (
                        <Text style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4, fontStyle: "italic" }}>
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
    </ScrollView>
  );
}