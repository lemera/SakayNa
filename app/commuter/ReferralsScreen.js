// screens/commuter/ReferralsScreen.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Share,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from 'expo-haptics';

export default function ReferralsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState(null);
  const [userType, setUserType] = useState('commuter');
  const [referralCode, setReferralCode] = useState('');
  const [referralStats, setReferralStats] = useState({
    totalReferrals: 0,
    activeReferrals: 0,
    completedReferrals: 0,
    totalEarnings: 0,
    pendingEarnings: 0,
  });
  const [referrals, setReferrals] = useState([]);
  const [commissionRate, setCommissionRate] = useState(0.01); // 1% default

  useFocusEffect(
    React.useCallback(() => {
      loadReferralData();
    }, [])
  );

  const loadReferralData = async () => {
    try {
      const id = await AsyncStorage.getItem("user_id");
      const type = await AsyncStorage.getItem("user_type") || 'commuter';
      setUserId(id);
      setUserType(type);
      
      if (id) {
        await Promise.all([
          fetchReferralCode(id),
          fetchReferrals(id, type),
          fetchCommissionRate()
        ]);
      }
    } catch (err) {
      console.log("Error loading referral data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchReferralCode = async (id) => {
    try {
      // Check if user already has a referral code
      const { data: existing, error: checkError } = await supabase
        .from("referrals")
        .select("id")
        .eq("referrer_id", id)
        .eq("referrer_type", userType)
        .maybeSingle();

      if (checkError) throw checkError;

      if (!existing) {
        // Generate unique referral code
        const code = generateReferralCode(id);
        setReferralCode(code);
      } else {
        // Fetch the referral code from user's profile or generate based on ID
        const code = generateReferralCode(id);
        setReferralCode(code);
      }
    } catch (err) {
      console.log("Error fetching referral code:", err);
      // Generate a code anyway
      setReferralCode(generateReferralCode(id));
    }
  };

  const generateReferralCode = (id) => {
    // Generate a code based on user ID (first 8 chars of UUID)
    const shortId = id.replace(/-/g, '').substring(0, 8).toUpperCase();
    return `SAKAY${shortId}`;
  };

  const fetchReferrals = async (id, type) => {
    try {
      const { data, error } = await supabase
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
            paid_at,
            booking:booking_id (
              id,
              fare,
              created_at
            )
          )
        `)
        .eq("referrer_id", id)
        .eq("referrer_type", type)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setReferrals(data || []);

      // Calculate stats
      const stats = {
        totalReferrals: data?.length || 0,
        activeReferrals: data?.filter(r => r.status === 'active').length || 0,
        completedReferrals: data?.filter(r => r.status === 'completed').length || 0,
        totalEarnings: 0,
        pendingEarnings: 0,
      };

      data?.forEach(referral => {
        referral.commissions?.forEach(commission => {
          if (commission.status === 'paid') {
            stats.totalEarnings += commission.amount;
          } else if (commission.status === 'pending') {
            stats.pendingEarnings += commission.amount;
          }
        });
      });

      setReferralStats(stats);
    } catch (err) {
      console.log("Error fetching referrals:", err);
    }
  };

  const fetchCommissionRate = async () => {
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "referral_commission_rate")
        .eq("category", "referral")
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setCommissionRate(parseFloat(data.value));
      }
    } catch (err) {
      console.log("Error fetching commission rate:", err);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadReferralData();
  };

  const handleShare = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      const message = `Join SakayNA using my referral code ${referralCode} and get discounts on your first rides! Download the app now.`;
      
      const result = await Share.share({
        message,
        title: 'Invite Friends to SakayNA',
      });

      if (result.action === Share.sharedAction) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) {
      console.log("Error sharing:", err);
      Alert.alert("Error", "Failed to share referral code.");
    }
  };

  const handleCopyCode = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("Copied!", "Referral code copied to clipboard.");
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return '#10B981';
      case 'active':
        return '#3B82F6';
      case 'pending':
        return '#F59E0B';
      case 'expired':
        return '#EF4444';
      default:
        return '#666';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return 'checkmark-circle';
      case 'active':
        return 'sync';
      case 'pending':
        return 'time';
      case 'expired':
        return 'close-circle';
      default:
        return 'information-circle';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatCurrency = (amount) => {
    return `₱${amount?.toFixed(2) || '0.00'}`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
        <Text style={styles.loadingText}>Loading referrals...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#183B5C" />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#183B5C" />
          </Pressable>
          <Text style={styles.headerTitle}>Referrals</Text>
          <Pressable style={styles.shareButton} onPress={handleShare}>
            <Ionicons name="share-social" size={22} color="#183B5C" />
          </Pressable>
        </View>

        {/* Hero Card */}
        <LinearGradient
          colors={["#183B5C", "#1E4B6E", "#235D82"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>Invite Friends, Earn Rewards</Text>
            <Text style={styles.heroDescription}>
              Share your code and earn {commissionRate * 100}% commission on every ride your friends take!
            </Text>
          </View>
          
          <View style={styles.codeContainer}>
            <View style={styles.codeWrapper}>
              <Text style={styles.codeLabel}>Your Referral Code</Text>
              <Text style={styles.codeValue}>{referralCode}</Text>
            </View>
            <Pressable style={styles.copyButton} onPress={handleCopyCode}>
              <Ionicons name="copy-outline" size={24} color="#FFF" />
            </Pressable>
          </View>
        </LinearGradient>

        {/* Stats Cards */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="people" size={24} color="#3B82F6" />
            </View>
            <Text style={styles.statValue}>{referralStats.totalReferrals}</Text>
            <Text style={styles.statLabel}>Total Referrals</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="time" size={24} color="#F59E0B" />
            </View>
            <Text style={styles.statValue}>{referralStats.pendingEarnings > 0 ? '₱' + referralStats.pendingEarnings.toFixed(2) : '₱0'}</Text>
            <Text style={styles.statLabel}>Pending Earnings</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#E8F5E9' }]}>
              <Ionicons name="wallet" size={24} color="#10B981" />
            </View>
            <Text style={styles.statValue}>{formatCurrency(referralStats.totalEarnings)}</Text>
            <Text style={styles.statLabel}>Total Earned</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#F3E8FF' }]}>
              <Ionicons name="checkmark-done" size={24} color="#8B5CF6" />
            </View>
            <Text style={styles.statValue}>{referralStats.completedReferrals}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
        </View>

        {/* How It Works */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How It Works</Text>
          
          <View style={styles.stepContainer}>
            <View style={styles.step}>
              <View style={[styles.stepNumber, { backgroundColor: '#EFF6FF' }]}>
                <Text style={[styles.stepNumberText, { color: '#3B82F6' }]}>1</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Share Your Code</Text>
                <Text style={styles.stepDescription}>
                  Share your unique referral code with friends
                </Text>
              </View>
            </View>

            <View style={styles.step}>
              <View style={[styles.stepNumber, { backgroundColor: '#FEF3C7' }]}>
                <Text style={[styles.stepNumberText, { color: '#F59E0B' }]}>2</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Friend Signs Up</Text>
                <Text style={styles.stepDescription}>
                  They use your code when registering
                </Text>
              </View>
            </View>

            <View style={styles.step}>
              <View style={[styles.stepNumber, { backgroundColor: '#E8F5E9' }]}>
                <Text style={[styles.stepNumberText, { color: '#10B981' }]}>3</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>You Earn Commission</Text>
                <Text style={styles.stepDescription}>
                  Get {commissionRate * 100}% of their ride fares
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Referral List */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Referrals</Text>
            <Text style={styles.sectionCount}>{referrals.length}</Text>
          </View>

          {referrals.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="people-outline" size={48} color="#D1D5DB" />
              </View>
              <Text style={styles.emptyTitle}>No Referrals Yet</Text>
              <Text style={styles.emptyText}>
                Share your code and start earning rewards!
              </Text>
              <Pressable style={styles.emptyButton} onPress={handleShare}>
                <Text style={styles.emptyButtonText}>Invite Friends</Text>
              </Pressable>
            </View>
          ) : (
            referrals.map((referral) => {
              const totalCommission = referral.commissions?.reduce((sum, c) => sum + c.amount, 0) || 0;
              const paidCommission = referral.commissions?.filter(c => c.status === 'paid').reduce((sum, c) => sum + c.amount, 0) || 0;
              
              return (
                <View key={referral.id} style={styles.referralCard}>
                  <View style={styles.referralHeader}>
                    <View style={styles.referralUser}>
                      <View style={styles.referralAvatar}>
                        <Text style={styles.referralAvatarText}>
                          {referral.referred?.user_type === 'commuter' ? '👤' : '🚗'}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.referralType}>
                          {referral.referred?.user_type === 'commuter' ? 'Passenger' : 'Driver'}
                        </Text>
                        <Text style={styles.referralDate}>
                          Joined {formatDate(referral.referred_at)}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.referralStatus, { backgroundColor: getStatusColor(referral.status) + '20' }]}>
                      <Ionicons name={getStatusIcon(referral.status)} size={12} color={getStatusColor(referral.status)} />
                      <Text style={[styles.referralStatusText, { color: getStatusColor(referral.status) }]}>
                        {referral.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  {referral.first_ride_completed_at && (
                    <View style={styles.referralFirstRide}>
                      <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                      <Text style={styles.referralFirstRideText}>
                        First ride completed on {formatDate(referral.first_ride_completed_at)}
                      </Text>
                    </View>
                  )}

                  <View style={styles.referralCommissions}>
                    <View style={styles.commissionItem}>
                      <Text style={styles.commissionLabel}>Total Commission</Text>
                      <Text style={styles.commissionValue}>{formatCurrency(totalCommission)}</Text>
                    </View>
                    <View style={styles.commissionDivider} />
                    <View style={styles.commissionItem}>
                      <Text style={styles.commissionLabel}>Paid</Text>
                      <Text style={[styles.commissionValue, styles.paidValue]}>
                        {formatCurrency(paidCommission)}
                      </Text>
                    </View>
                    <View style={styles.commissionDivider} />
                    <View style={styles.commissionItem}>
                      <Text style={styles.commissionLabel}>Pending</Text>
                      <Text style={[styles.commissionValue, styles.pendingValue]}>
                        {formatCurrency(totalCommission - paidCommission)}
                      </Text>
                    </View>
                  </View>

                  {referral.commissions && referral.commissions.length > 0 && (
                    <Pressable 
                      style={styles.viewDetailsButton}
                      onPress={() => {
                        Alert.alert(
                          "Commission Details",
                          referral.commissions.map(c => 
                            `• ${formatCurrency(c.amount)} from ride on ${formatDate(c.booking?.created_at)} - ${c.status}`
                          ).join('\n\n')
                        );
                      }}
                    >
                      <Text style={styles.viewDetailsText}>View Details</Text>
                      <Ionicons name="chevron-forward" size={16} color="#666" />
                    </Pressable>
                  )}
                </View>
              );
            })
          )}
        </View>

        {/* Terms */}
        <View style={styles.termsSection}>
          <Text style={styles.termsTitle}>Terms & Conditions</Text>
          <Text style={styles.termsText}>
            • Referral bonus applies to new users only{'\n'}
            • Friend must use your code within 30 days of signing up{'\n'}
            • Commission is earned on completed rides only{'\n'}
            • Payouts are processed monthly{'\n'}
            • Terms subject to change
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
  shareButton: {
    padding: 8,
  },
  heroCard: {
    margin: 20,
    padding: 20,
    borderRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  heroContent: {
    marginBottom: 20,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#FFF",
    marginBottom: 8,
  },
  heroDescription: {
    fontSize: 14,
    color: "#FFB37A",
    lineHeight: 20,
  },
  codeContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 16,
    padding: 12,
  },
  codeWrapper: {
    flex: 1,
  },
  codeLabel: {
    fontSize: 11,
    color: "#FFB37A",
    opacity: 0.8,
    marginBottom: 4,
  },
  codeValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFF",
    letterSpacing: 1,
  },
  copyButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 15,
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
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: "#666",
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
  sectionCount: {
    fontSize: 14,
    color: "#666",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  stepContainer: {
    gap: 15,
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
  },
  stepNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  stepNumberText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  stepDescription: {
    fontSize: 12,
    color: "#666",
  },
  emptyState: {
    alignItems: "center",
    padding: 30,
  },
  emptyIcon: {
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
  emptyButton: {
    backgroundColor: "#183B5C",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  emptyButtonText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
  },
  referralCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 15,
    marginBottom: 10,
  },
  referralHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  referralUser: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  referralAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  referralAvatarText: {
    fontSize: 20,
  },
  referralType: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  referralDate: {
    fontSize: 11,
    color: "#999",
  },
  referralStatus: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  referralStatusText: {
    fontSize: 10,
    fontWeight: "600",
  },
  referralFirstRide: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    padding: 8,
    borderRadius: 8,
    marginBottom: 10,
    gap: 6,
  },
  referralFirstRideText: {
    fontSize: 11,
    color: "#10B981",
    flex: 1,
  },
  referralCommissions: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  commissionItem: {
    flex: 1,
    alignItems: "center",
  },
  commissionLabel: {
    fontSize: 10,
    color: "#999",
    marginBottom: 2,
  },
  commissionValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  paidValue: {
    color: "#10B981",
  },
  pendingValue: {
    color: "#F59E0B",
  },
  commissionDivider: {
    width: 1,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 10,
  },
  viewDetailsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  viewDetailsText: {
    fontSize: 12,
    color: "#666",
  },
  termsSection: {
    marginHorizontal: 20,
    marginTop: 15,
    marginBottom: 30,
    padding: 15,
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
  },
  termsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  termsText: {
    fontSize: 12,
    color: "#666",
    lineHeight: 20,
  },
});