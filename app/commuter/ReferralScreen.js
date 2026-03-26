// screens/commuter/ReferralsScreen.js
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Alert,
  Share,
  Modal,
  TextInput,
  Animated,
  Dimensions,
  Linking,
  Clipboard, // Use React Native's built-in Clipboard
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

const { width } = Dimensions.get("window");

export default function ReferralsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [referralCode, setReferralCode] = useState(null);
  const [referralStats, setReferralStats] = useState({
    totalReferrals: 0,
    activeReferrals: 0,
    totalCommission: 0,
    pointsEarned: 0,
    pendingCommission: 0,
  });
  const [referralsList, setReferralsList] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [referralSettings, setReferralSettings] = useState({
    referral_points: 100,
    referral_commission_rate: 0.05,
    referral_bonus_points: 50,
    referral_commission_duration_days: 365,
    min_referral_rides: 1,
    referral_expiry_days: 90,
  });
  const [showShareModal, setShowShareModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [invitePhone, setInvitePhone] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadReferralData();
    }, [])
  );

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const loadReferralData = async () => {
    try {
      const id = await AsyncStorage.getItem("user_id");
      setUserId(id);

      if (id) {
        await Promise.all([
          fetchUserProfile(id),
          fetchReferralCode(id),
          fetchReferralStats(id),
          fetchReferralsList(id),
          fetchCommissions(id),
          fetchReferralSettings(),
        ]);
      }
    } catch (err) {
      console.log("Error loading referral data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchUserProfile = async (id) => {
    try {
      const { data, error } = await supabase
        .from("commuters")
        .select("first_name, last_name, profile_picture")
        .eq("id", id)
        .single();

      if (error) throw error;
      setUserProfile(data);
    } catch (err) {
      console.log("Error fetching user profile:", err.message);
    }
  };

  const fetchReferralCode = async (id) => {
    try {
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("referral_code")
        .eq("id", id)
        .single();

      if (userError) throw userError;

      if (userData?.referral_code) {
        setReferralCode(userData.referral_code);
      } else {
        const newCode = `REF${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        const { error: updateError } = await supabase
          .from("users")
          .update({ referral_code: newCode })
          .eq("id", id);

        if (updateError) throw updateError;
        setReferralCode(newCode);
      }
    } catch (err) {
      console.log("Error fetching referral code:", err.message);
    }
  };

  const fetchReferralStats = async (id) => {
    try {
      const { data: referrals, error: referralsError } = await supabase
        .from("referrals")
        .select("status, total_commission_earned")
        .eq("referrer_id", id)
        .eq("referrer_type", "commuter");

      if (referralsError) throw referralsError;

      const totalReferrals = referrals?.length || 0;
      const activeReferrals = referrals?.filter(r => r.status === "active").length || 0;
      const totalCommission = referrals?.reduce((sum, r) => sum + (r.total_commission_earned || 0), 0) || 0;

      const { data: pointsHistory, error: pointsError } = await supabase
        .from("commuter_points_history")
        .select("points")
        .eq("commuter_id", id)
        .eq("source", "referral");

      if (pointsError) throw pointsError;

      const pointsEarned = pointsHistory?.reduce((sum, p) => sum + p.points, 0) || 0;

      const { data: pendingCommissions, error: pendingError } = await supabase
        .from("commissions")
        .select("amount")
        .eq("status", "pending");

      const pendingCommission = pendingCommissions?.reduce((sum, c) => sum + c.amount, 0) || 0;

      setReferralStats({
        totalReferrals,
        activeReferrals,
        totalCommission,
        pointsEarned,
        pendingCommission,
      });
    } catch (err) {
      console.log("Error fetching referral stats:", err.message);
    }
  };

  const fetchReferralsList = async (id) => {
    try {
      const { data, error } = await supabase
        .from("referrals")
        .select(`
          id,
          referred_id,
          status,
          total_commission_earned,
          referred_at,
          first_ride_completed_at,
          commission_ends_at,
          referred:users!referred_id (
            phone,
            created_at
          ),
          referred_commuter:commuters!users_id (
            first_name,
            last_name
          )
        `)
        .eq("referrer_id", id)
        .eq("referrer_type", "commuter")
        .order("referred_at", { ascending: false });

      if (error) throw error;

      const enhancedData = data?.map(item => ({
        ...item,
        referred_name: item.referred_commuter 
          ? `${item.referred_commuter.first_name} ${item.referred_commuter.last_name}`
          : "User",
        referred_phone: item.referred?.phone || "N/A",
      })) || [];

      setReferralsList(enhancedData);
    } catch (err) {
      console.log("Error fetching referrals list:", err.message);
    }
  };

  const fetchCommissions = async (id) => {
    try {
      const { data, error } = await supabase
        .from("commissions")
        .select(`
          id,
          amount,
          status,
          created_at,
          paid_at,
          booking:bookings (
            id,
            fare,
            created_at,
            pickup_location,
            dropoff_location
          )
        `)
        .in("status", ["pending", "paid"])
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setCommissions(data || []);
    } catch (err) {
      console.log("Error fetching commissions:", err.message);
    }
  };

  const fetchReferralSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("referral_settings")
        .select("*")
        .eq("is_active", true);

      if (error) throw error;

      const settings = {};
      data?.forEach(item => {
        let value = item.value;
        if (item.data_type === "integer") value = parseInt(value);
        if (item.data_type === "float") value = parseFloat(value);
        settings[item.key] = value;
      });

      setReferralSettings(prev => ({ ...prev, ...settings }));
    } catch (err) {
      console.log("Error fetching referral settings:", err.message);
    }
  };

  const handleShare = async () => {
    try {
      const message = `🎉 Join me on SakayNa! Use my referral code ${referralCode} to get ₱${(referralSettings.referral_bonus_points * 0.1).toFixed(0)} off your first ride!\n\nDownload the app: https://sakay.ph/download`;
      
      const result = await Share.share({
        message: message,
        title: "Invite Friends to SakayNa",
      });

      if (result.action === Share.sharedAction) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) {
      console.log("Error sharing:", err);
    }
  };

  const handleCopyCode = async () => {
    // Use React Native's built-in Clipboard
    await Clipboard.setString(referralCode || "");
    Alert.alert("Copied!", "Referral code copied to clipboard");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSendInvite = async () => {
    if (!invitePhone || invitePhone.length < 10) {
      Alert.alert("Error", "Please enter a valid phone number");
      return;
    }

    setSendingInvite(true);
    try {
      Alert.alert(
        "Invite Sent!",
        `Invitation sent to ${invitePhone}. They'll receive a text message with your referral code.`
      );
      setInvitePhone("");
      setShowInviteModal(false);
    } catch (err) {
      console.log("Error sending invite:", err);
      Alert.alert("Error", "Failed to send invitation");
    } finally {
      setSendingInvite(false);
    }
  };

  const handleWhatsAppShare = () => {
    const message = encodeURIComponent(
      `🎉 Join me on SakayNa! Use my referral code ${referralCode} to get ₱${(referralSettings.referral_bonus_points * 0.1).toFixed(0)} off your first ride!\n\nDownload: https://sakay.ph/download`
    );
    Linking.openURL(`whatsapp://send?text=${message}`);
  };

  const handleMessengerShare = () => {
    const message = encodeURIComponent(
      `🎉 Join me on SakayNa! Use my referral code ${referralCode} to get ₱${(referralSettings.referral_bonus_points * 0.1).toFixed(0)} off your first ride!\n\nDownload: https://sakay.ph/download`
    );
    Linking.openURL(`fb-messenger://share?link=${message}`);
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  };

  const formatCurrency = (amount) => {
    return `₱${amount?.toFixed(2) || "0.00"}`;
  };

  const getReferralStatusColor = (status) => {
    switch (status) {
      case "active": return "#10B981";
      case "completed": return "#3B82F6";
      case "expired": return "#EF4444";
      default: return "#F59E0B";
    }
  };

  const getReferralStatusText = (status) => {
    switch (status) {
      case "active": return "Active";
      case "completed": return "Completed";
      case "expired": return "Expired";
      default: return "Pending";
    }
  };

  const getCommissionStatusColor = (status) => {
    return status === "paid" ? "#10B981" : "#F59E0B";
  };

  const getCommissionStatusText = (status) => {
    return status === "paid" ? "Paid" : "Pending";
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadReferralData();
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
        <Text style={styles.loadingText}>Loading referral info...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#183B5C" />
          </Pressable>
          <Text style={styles.headerTitle}>Refer & Earn</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Hero Section */}
        <Animated.View 
          style={[
            styles.heroCard,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }]
            }
          ]}
        >
          <LinearGradient
            colors={["#183B5C", "#2C5A7A"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            <Text style={styles.heroTitle}>Invite Friends, Earn Rewards!</Text>
            <Text style={styles.heroSubtitle}>
              Get {referralSettings.referral_points} points for every friend who joins
            </Text>
            
            <View style={styles.referralCodeContainer}>
              <Text style={styles.referralCodeLabel}>Your Referral Code</Text>
              <View style={styles.codeBox}>
                <Text style={styles.referralCode}>{referralCode || "Loading..."}</Text>
                <Pressable onPress={handleCopyCode} style={styles.copyButton}>
                  <Ionicons name="copy-outline" size={20} color="#FFF" />
                </Pressable>
              </View>
            </View>

            <View style={styles.heroActions}>
              <Pressable style={styles.shareButton} onPress={handleShare}>
                <Ionicons name="share-social" size={20} color="#FFF" />
                <Text style={styles.shareButtonText}>Share Link</Text>
              </Pressable>
              <Pressable style={styles.inviteButton} onPress={() => setShowInviteModal(true)}>
                <Ionicons name="person-add" size={20} color="#FFF" />
                <Text style={styles.inviteButtonText}>Invite Friend</Text>
              </Pressable>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Stats Cards */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Ionicons name="people" size={24} color="#183B5C" />
            </View>
            <Text style={styles.statValue}>{referralStats.totalReferrals}</Text>
            <Text style={styles.statLabel}>Total Referrals</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Ionicons name="star" size={24} color="#F59E0B" />
            </View>
            <Text style={styles.statValue}>{referralStats.pointsEarned}</Text>
            <Text style={styles.statLabel}>Points Earned</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Ionicons name="cash-outline" size={24} color="#10B981" />
            </View>
            <Text style={styles.statValue}>{formatCurrency(referralStats.totalCommission)}</Text>
            <Text style={styles.statLabel}>Commission</Text>
          </View>
        </View>

        {/* How It Works */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>✨ How It Works</Text>
          
          <View style={styles.stepContainer}>
            <View style={styles.step}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>1</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Share Your Code</Text>
                <Text style={styles.stepDesc}>
                  Share your unique referral code with friends
                </Text>
              </View>
            </View>

            <View style={styles.step}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>2</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Friend Signs Up</Text>
                <Text style={styles.stepDesc}>
                  Friend enters your code when registering
                </Text>
              </View>
            </View>

            <View style={styles.step}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>3</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Earn Rewards</Text>
                <Text style={styles.stepDesc}>
                  Get {referralSettings.referral_points} points + {referralSettings.referral_commission_rate * 100}% commission on their rides for {referralSettings.referral_commission_duration_days} days
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Share Options */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>📱 Quick Share</Text>
          
          <View style={styles.shareOptions}>
            <Pressable style={styles.shareOption} onPress={handleWhatsAppShare}>
              <LinearGradient
                colors={["#25D366", "#128C7E"]}
                style={styles.shareOptionIcon}
              >
                <Ionicons name="logo-whatsapp" size={28} color="#FFF" />
              </LinearGradient>
              <Text style={styles.shareOptionText}>WhatsApp</Text>
            </Pressable>

            <Pressable style={styles.shareOption} onPress={handleMessengerShare}>
              <LinearGradient
                colors={["#0084FF", "#0066CC"]}
                style={styles.shareOptionIcon}
              >
                <Ionicons name="logo-facebook" size={28} color="#FFF" />
              </LinearGradient>
              <Text style={styles.shareOptionText}>Messenger</Text>
            </Pressable>

            <Pressable style={styles.shareOption} onPress={handleShare}>
              <LinearGradient
                colors={["#6366F1", "#4F46E5"]}
                style={styles.shareOptionIcon}
              >
                <Ionicons name="share-social" size={28} color="#FFF" />
              </LinearGradient>
              <Text style={styles.shareOptionText}>More</Text>
            </Pressable>
          </View>
        </View>

        {/* Referrals List */}
        {referralsList.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>👥 Your Referrals</Text>
            
            {referralsList.map((referral, index) => (
              <View key={referral.id} style={[styles.referralItem, index === referralsList.length - 1 && styles.lastReferralItem]}>
                <View style={styles.referralAvatar}>
                  <Text style={styles.referralAvatarText}>
                    {referral.referred_name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.referralInfo}>
                  <Text style={styles.referralName}>{referral.referred_name}</Text>
                  <Text style={styles.referralPhone}>{referral.referred_phone}</Text>
                  <Text style={styles.referralDate}>Joined {formatDate(referral.referred_at)}</Text>
                </View>
                <View style={[styles.referralStatus, { backgroundColor: getReferralStatusColor(referral.status) + "20" }]}>
                  <Text style={[styles.referralStatusText, { color: getReferralStatusColor(referral.status) }]}>
                    {getReferralStatusText(referral.status)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Commissions History */}
        {commissions.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>💰 Commission History</Text>
            
            {commissions.map((commission, index) => (
              <View key={commission.id} style={[styles.commissionItem, index === commissions.length - 1 && styles.lastCommissionItem]}>
                <View style={styles.commissionLeft}>
                  <Text style={styles.commissionAmount}>{formatCurrency(commission.amount)}</Text>
                  <Text style={styles.commissionDate}>{formatDate(commission.created_at)}</Text>
                  {commission.booking && (
                    <Text style={styles.commissionBooking} numberOfLines={1}>
                      Ride: {commission.booking.pickup_location?.split(",")[0]} → {commission.booking.dropoff_location?.split(",")[0]}
                    </Text>
                  )}
                </View>
                <View style={[styles.commissionStatus, { backgroundColor: getCommissionStatusColor(commission.status) + "20" }]}>
                  <Text style={[styles.commissionStatusText, { color: getCommissionStatusColor(commission.status) }]}>
                    {getCommissionStatusText(commission.status)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={20} color="#183B5C" />
          <Text style={styles.infoText}>
            Terms: Referral points are credited when your referred friend completes their first ride. Commission is earned on their rides for {referralSettings.referral_commission_duration_days} days. Referral codes expire after {referralSettings.referral_expiry_days} days of inactivity.
          </Text>
        </View>
      </ScrollView>

      {/* Invite Friend Modal */}
      <Modal
        visible={showInviteModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowInviteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Invite a Friend</Text>
              <Pressable onPress={() => setShowInviteModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </Pressable>
            </View>

            <Text style={styles.modalSubtitle}>
              Enter your friend's phone number to send an invitation
            </Text>

            <TextInput
              style={styles.phoneInput}
              placeholder="0917 123 4567"
              keyboardType="phone-pad"
              value={invitePhone}
              onChangeText={setInvitePhone}
              maxLength={11}
            />

            <Pressable
              style={[styles.sendInviteButton, sendingInvite && styles.sendInviteButtonDisabled]}
              onPress={handleSendInvite}
              disabled={sendingInvite}
            >
              {sendingInvite ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons name="send" size={20} color="#FFF" />
                  <Text style={styles.sendInviteButtonText}>Send Invitation</Text>
                </>
              )}
            </Pressable>

            <Text style={styles.modalNote}>
              Note: Your friend will receive a text message with your referral code
            </Text>
          </View>
        </View>
      </Modal>
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
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#183B5C",
  },
  heroCard: {
    margin: 20,
    marginTop: 16,
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  heroGradient: {
    padding: 24,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFF",
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 14,
    color: "#FFB37A",
    marginBottom: 24,
  },
  referralCodeContainer: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  referralCodeLabel: {
    fontSize: 12,
    color: "#FFB37A",
    marginBottom: 8,
  },
  codeBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  referralCode: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#FFF",
    letterSpacing: 1,
  },
  copyButton: {
    padding: 8,
  },
  heroActions: {
    flexDirection: "row",
    gap: 12,
  },
  shareButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  shareButtonText: {
    color: "#FFF",
    fontWeight: "600",
  },
  inviteButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFB37A",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  inviteButtonText: {
    color: "#183B5C",
    fontWeight: "600",
  },
  statsGrid: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#183B5C",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
  },
  sectionCard: {
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 20,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 16,
  },
  stepContainer: {
    gap: 16,
  },
  step: {
    flexDirection: "row",
    gap: 12,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#183B5C",
    justifyContent: "center",
    alignItems: "center",
  },
  stepNumberText: {
    color: "#FFF",
    fontWeight: "bold",
    fontSize: 14,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  stepDesc: {
    fontSize: 13,
    color: "#666",
    lineHeight: 18,
  },
  shareOptions: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  shareOption: {
    alignItems: "center",
  },
  shareOptionIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  shareOptionText: {
    fontSize: 12,
    color: "#666",
  },
  referralItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  lastReferralItem: {
    borderBottomWidth: 0,
  },
  referralAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  referralAvatarText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#183B5C",
  },
  referralInfo: {
    flex: 1,
  },
  referralName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  referralPhone: {
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
  },
  referralDate: {
    fontSize: 11,
    color: "#999",
  },
  referralStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  referralStatusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  commissionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  lastCommissionItem: {
    borderBottomWidth: 0,
  },
  commissionLeft: {
    flex: 1,
  },
  commissionAmount: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#10B981",
    marginBottom: 2,
  },
  commissionDate: {
    fontSize: 11,
    color: "#999",
    marginBottom: 2,
  },
  commissionBooking: {
    fontSize: 11,
    color: "#666",
  },
  commissionStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  commissionStatusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  infoCard: {
    flexDirection: "row",
    backgroundColor: "#FFF3E0",
    marginHorizontal: 20,
    marginBottom: 30,
    padding: 16,
    borderRadius: 16,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: "#F59E0B",
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 20,
  },
  phoneInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 20,
  },
  sendInviteButton: {
    backgroundColor: "#183B5C",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    borderRadius: 12,
    gap: 8,
  },
  sendInviteButtonDisabled: {
    opacity: 0.7,
  },
  sendInviteButtonText: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 16,
  },
  modalNote: {
    fontSize: 11,
    color: "#999",
    textAlign: "center",
    marginTop: 12,
  },
});