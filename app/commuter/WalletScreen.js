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
  TouchableWithoutFeedback,
  Dimensions, // Added missing import
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";

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
  
  // Promo related states
  const [availablePromos, setAvailablePromos] = useState([]);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [processingPromo, setProcessingPromo] = useState(false);
  const [selectedPromo, setSelectedPromo] = useState(null);
  
  // Stats
  const [totalTrips, setTotalTrips] = useState(0);
  const [totalPointsEarned, setTotalPointsEarned] = useState(0);
  const [totalPointsRedeemed, setTotalPointsRedeemed] = useState(0);
  const [pointsThisMonth, setPointsThisMonth] = useState(0);

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
          fetchAvailablePromos(id)
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
           contentContainerStyle={{ paddingBottom: 100 }}
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
              
              <Pressable 
                style={styles.headerButton}
                onPress={() => navigation.navigate("ReferralScreen")}
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
              onPress={() => navigation.navigate("PointsRewards")}
            >
              <LinearGradient
                colors={['#8B5CF6', '#A78BFA']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.quickActionGradient}
              >
                <Ionicons name="gift-outline" size={24} color="#FFF" />
              </LinearGradient>
              <Text style={styles.quickActionText}>Rewards Store</Text>
            </Pressable>
          </View>

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
              <Text style={styles.infoNoteText}>10 points = ₱1 • Min fare: ₱15</Text>
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
    paddingTop: 10,
    marginTop: 0,
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
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
    maxHeight: "85%",
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
});