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
  
  // Promo related states
  const [availablePromos, setAvailablePromos] = useState([]);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [processingPromo, setProcessingPromo] = useState(false);
  const [selectedPromo, setSelectedPromo] = useState(null);
  const [promoCategory, setPromoCategory] = useState('all'); // 'all', 'redeem', 'buy'
  
  // Buy points states
  const [showBuyPointsModal, setShowBuyPointsModal] = useState(false);
  const [processingBuyPoints, setProcessingBuyPoints] = useState(false);
  const [gcashNumber, setGcashNumber] = useState("");
  
  // Points stats
  const [totalPointsEarned, setTotalPointsEarned] = useState(0);
  const [totalPointsRedeemed, setTotalPointsRedeemed] = useState(0);
  const [pointsThisMonth, setPointsThisMonth] = useState(0);
  const [nextTierPoints, setNextTierPoints] = useState(0);
  
  // Points configuration
  const [pointsConfig] = useState({
    cashRate: 0.05,
    walletRate: 0.10,
    minFare: 20,
    conversionRate: 0.10,
  });

  // Stats
  const [totalSpent, setTotalSpent] = useState(0);
  const [totalTrips, setTotalTrips] = useState(0);

  // Animation values
  const [slideAnim] = useState(new Animated.Value(0));

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

  const handlePromoSelect = (promo) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPromo(promo);
    
    if (promo.discount_type === 'points_multiplier') {
      setShowBuyPointsModal(true);
    } else {
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
    }
  };

  const handleRedeemPromo = async (promo) => {
    if (points < promo.points_required) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Insufficient Points",
        `You need ${promo.points_required} points to redeem this promo. You only have ${points} points.`
      );
      return;
    }

    setProcessingPromo(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const { count, error: usageError } = await supabase
        .from("commuter_promos")
        .select("*", { count: "exact", head: true })
        .eq("commuter_id", commuterId)
        .eq("promo_id", promo.id);

      if (usageError) throw usageError;

      if (promo.user_limit && count >= promo.user_limit) {
        Alert.alert("Limit Reached", "You have already used this promo.");
        setProcessingPromo(false);
        return;
      }

      const newPoints = points - promo.points_required;
      
      const { error: updateError } = await supabase
        .from("commuter_wallets")
        .update({ 
          points: newPoints,
          updated_at: new Date()
        })
        .eq("commuter_id", commuterId);

      if (updateError) throw updateError;

      const { error: historyError } = await supabase
        .from("commuter_points_history")
        .insert({
          commuter_id: commuterId,
          points: promo.points_required,
          type: 'redeemed',
          source: 'promo',
          description: `Redeemed ${promo.points_required} points for ₱${promo.discount_value} GCash`,
          created_at: new Date()
        });

      if (historyError) throw historyError;

      const { error: promoError } = await supabase
        .from("commuter_promos")
        .insert({
          commuter_id: commuterId,
          promo_id: promo.id,
          used_at: new Date(),
          discount_amount: promo.discount_value
        });

      if (promoError) throw promoError;

      setPoints(newPoints);
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      Alert.alert(
        "🎉 Redemption Successful!",
        `You have successfully redeemed ${promo.points_required} points for ₱${promo.discount_value} GCash.\n\nPlease check your GCash app within 24 hours.`,
        [{ text: "Awesome!" }]
      );

      await Promise.all([
        fetchWallet(commuterId),
        fetchPointsHistory(commuterId),
        fetchPointsStats(commuterId),
        fetchAvailablePromos(commuterId)
      ]);

    } catch (err) {
      console.log("Error redeeming promo:", err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Oops!", "Failed to redeem promo. Please try again.");
    } finally {
      setProcessingPromo(false);
      setSelectedPromo(null);
      setShowPromoModal(false);
    }
  };

  const handleBuyPoints = async () => {
    if (!selectedPromo) return;
    
    if (!gcashNumber || gcashNumber.length < 11) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Invalid Number", "Please enter a valid GCash number.");
      return;
    }

    setProcessingBuyPoints(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const pointsToAdd = selectedPromo.discount_value;
      const newPoints = points + pointsToAdd;
      
      const { error: updateError } = await supabase
        .from("commuter_wallets")
        .update({ 
          points: newPoints,
          updated_at: new Date()
        })
        .eq("commuter_id", commuterId);

      if (updateError) throw updateError;

      const { error: historyError } = await supabase
        .from("commuter_points_history")
        .insert({
          commuter_id: commuterId,
          points: pointsToAdd,
          type: 'earned',
          source: 'promo',
          description: `Bought ${pointsToAdd} points via GCash`,
          created_at: new Date()
        });

      if (historyError) throw historyError;

      const { error: promoError } = await supabase
        .from("commuter_promos")
        .insert({
          commuter_id: commuterId,
          promo_id: selectedPromo.id,
          used_at: new Date(),
          discount_amount: pointsToAdd
        });

      if (promoError) throw promoError;

      setPoints(newPoints);
      
      const amountPaid = selectedPromo.promo_code === 'BUY100' ? 10 :
                        selectedPromo.promo_code === 'BUY500' ? 50 :
                        selectedPromo.promo_code === 'BUY1000' ? 100 : 0;
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      Alert.alert(
        "✨ Purchase Successful!",
        `You have successfully bought ${pointsToAdd} points for ₱${amountPaid} via GCash.\n\nReference: GCASH-${Date.now()}`,
        [{ text: "Great!" }]
      );

      await Promise.all([
        fetchWallet(commuterId),
        fetchPointsHistory(commuterId),
        fetchPointsStats(commuterId),
        fetchAvailablePromos(commuterId)
      ]);

    } catch (err) {
      console.log("Error buying points:", err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Oops!", "Failed to buy points. Please try again.");
    } finally {
      setProcessingBuyPoints(false);
      setShowBuyPointsModal(false);
      setShowPromoModal(false);
      setGcashNumber("");
      setSelectedPromo(null);
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

      const tiers = [0, 1000, 5000, 10000];
      const nextTier = tiers.find(tier => tier > totalEarned) || tiers[tiers.length - 1];
      setNextTierPoints(nextTier - totalEarned);

    } catch (err) {
      console.log("Error fetching points stats:", err);
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
        .select("points")
        .eq("commuter_id", id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        setPoints(data.points || 0);
      } else {
        const { data: newWallet, error: createError } = await supabase
          .from("commuter_wallets")
          .insert([
            {
              commuter_id: id,
              points: 0,
              updated_at: new Date()
            },
          ])
          .select()
          .single();

        if (createError) throw createError;
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
          booking_reference,
          fare,
          payment_type,
          payment_status,
          created_at,
          pickup_location,
          dropoff_location,
          commuter_rating,
          points_used
        `)
        .eq("commuter_id", id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      
      const enhancedBookings = await Promise.all((data || []).map(async (booking) => {
        const { data: pointsData } = await supabase
          .from("commuter_points_history")
          .select("points")
          .eq("source_id", booking.id)
          .eq("type", "earned")
          .maybeSingle();
        
        return {
          ...booking,
          points_earned: pointsData?.points || 0
        };
      }));
      
      setRecentBookings(enhancedBookings);
    } catch (err) {
      console.log("Error fetching recent bookings:", err);
    }
  };

  const fetchPointsHistory = async (id) => {
    try {
      const { data: historyData, error: historyError } = await supabase
        .from("commuter_points_history")
        .select("*")
        .eq("commuter_id", id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (historyError) throw historyError;
      
      if (historyData && historyData.length > 0) {
        const bookingIds = historyData
          .filter(item => item.source_id && (item.source === 'trip' || item.source === 'trip_cash' || item.source === 'trip_wallet'))
          .map(item => item.source_id);
        
        let bookingsMap = {};
        
        if (bookingIds.length > 0) {
          const { data: bookingsData } = await supabase
            .from("bookings")
            .select("id, pickup_location, dropoff_location, fare, payment_type")
            .in("id", bookingIds);

          if (bookingsData) {
            bookingsMap = bookingsData.reduce((acc, booking) => {
              acc[booking.id] = booking;
              return acc;
            }, {});
          }
        }
        
        const enhancedHistory = historyData.map(item => ({
          ...item,
          bookings: item.source_id && bookingsMap[item.source_id] ? bookingsMap[item.source_id] : null
        }));
        
        setPointsHistory(enhancedHistory);
      } else {
        setPointsHistory([]);
      }
      
    } catch (err) {
      console.log("Error fetching points history:", err);
      setPointsHistory([]);
    }
  };

  const fetchStats = async (id) => {
    try {
      const { data: bookingsData, error: bookingsError } = await supabase
        .from("bookings")
        .select("fare")
        .eq("commuter_id", id)
        .eq("status", "completed");

      if (bookingsError) throw bookingsError;
      
      const total = bookingsData?.reduce((sum, b) => sum + b.fare, 0) || 0;
      setTotalSpent(total);

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

  const calculatePointsEarned = (fare, paymentType = 'cash') => {
    if (!fare || fare < pointsConfig.minFare) return 0;
    
    const rate = paymentType === 'wallet' ? pointsConfig.walletRate : pointsConfig.cashRate;
    let points = fare * rate;
    return Math.floor(points);
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

  // Promo Modal Component
  const PromoModal = () => (
    <Modal
      visible={showPromoModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => {
        setShowPromoModal(false);
        setSelectedPromo(null);
        setPromoCategory('all');
      }}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>✨ Special Offers</Text>
            <Pressable 
              style={styles.modalCloseButton}
              onPress={() => {
                setShowPromoModal(false);
                setSelectedPromo(null);
                setPromoCategory('all');
              }}
            >
              <Ionicons name="close" size={24} color="#666" />
            </Pressable>
          </View>

          {/* Category Tabs */}
          <View style={styles.categoryTabs}>
            <Pressable
              style={[styles.categoryTab, promoCategory === 'all' && styles.categoryTabActive]}
              onPress={() => setPromoCategory('all')}
            >
              <Text style={[styles.categoryTabText, promoCategory === 'all' && styles.categoryTabTextActive]}>All</Text>
            </Pressable>
            <Pressable
              style={[styles.categoryTab, promoCategory === 'redeem' && styles.categoryTabActive]}
              onPress={() => setPromoCategory('redeem')}
            >
              <Text style={[styles.categoryTabText, promoCategory === 'redeem' && styles.categoryTabTextActive]}>Redeem</Text>
            </Pressable>
            <Pressable
              style={[styles.categoryTab, promoCategory === 'buy' && styles.categoryTabActive]}
              onPress={() => setPromoCategory('buy')}
            >
              <Text style={[styles.categoryTabText, promoCategory === 'buy' && styles.categoryTabTextActive]}>Buy Points</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.promoList}>
            {availablePromos.length === 0 ? (
              <View style={styles.emptyPromoContainer}>
                <View style={styles.emptyPromoIcon}>
                  <Ionicons name="pricetag-outline" size={48} color="#D1D5DB" />
                </View>
                <Text style={styles.emptyPromoTitle}>No Promos Available</Text>
                <Text style={styles.emptyPromoText}>Check back later for exciting offers!</Text>
              </View>
            ) : (
              availablePromos
                .filter(promo => {
                  if (promoCategory === 'all') return true;
                  if (promoCategory === 'redeem') return promo.discount_type !== 'points_multiplier';
                  if (promoCategory === 'buy') return promo.discount_type === 'points_multiplier';
                  return true;
                })
                .map((promo) => {
                  const isRedeemPromo = promo.discount_type !== 'points_multiplier';
                  const pointsRequired = promo.points_required || 0;
                  const canRedeem = points >= pointsRequired;
                  
                  return (
                    <Pressable
                      key={promo.id}
                      style={[
                        styles.promoCard,
                        !canRedeem && isRedeemPromo && styles.promoCardDisabled
                      ]}
                      onPress={() => handlePromoSelect(promo)}
                      disabled={!canRedeem && isRedeemPromo}
                    >
                      <LinearGradient
                        colors={isRedeemPromo ? ['#10B98120', '#10B98105'] : ['#F59E0B20', '#F59E0B05']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.promoCardGradient}
                      >
                        <View style={styles.promoCardContent}>
                          <View style={[styles.promoIcon, { backgroundColor: isRedeemPromo ? '#10B981' : '#F59E0B' }]}>
                            <Ionicons 
                              name={isRedeemPromo ? "cash-outline" : "card-outline"} 
                              size={24} 
                              color="#FFF" 
                            />
                          </View>
                          
                          <View style={styles.promoInfo}>
                            <Text style={styles.promoTitle}>{promo.title}</Text>
                            <Text style={styles.promoDescription}>{promo.description}</Text>
                            
                            {isRedeemPromo ? (
                              <View style={styles.promoRequirement}>
                                <View style={[styles.requirementBadge, { backgroundColor: '#F59E0B20' }]}>
                                  <Ionicons name="star" size={12} color="#F59E0B" />
                                  <Text style={styles.requirementText}>Need {promo.points_required}</Text>
                                </View>
                                <View style={[styles.availabilityBadge, { backgroundColor: canRedeem ? '#10B98120' : '#EF444420' }]}>
                                  <Text style={[styles.availabilityText, { color: canRedeem ? '#10B981' : '#EF4444' }]}>
                                    {canRedeem ? 'Available' : 'Insufficient'}
                                  </Text>
                                </View>
                              </View>
                            ) : (
                              <View style={styles.promoRequirement}>
                                <View style={[styles.requirementBadge, { backgroundColor: '#10B98120' }]}>
                                  <Ionicons name="cash" size={12} color="#10B981" />
                                  <Text style={styles.requirementText}>GCash</Text>
                                </View>
                              </View>
                            )}
                          </View>

                          <View style={styles.promoAction}>
                            <Text style={[
                              styles.promoActionText,
                              !canRedeem && isRedeemPromo && styles.promoActionDisabled
                            ]}>
                              {isRedeemPromo ? 'Redeem' : 'Buy'}
                            </Text>
                            <Ionicons name="chevron-forward" size={16} color={!canRedeem && isRedeemPromo ? '#9CA3AF' : '#183B5C'} />
                          </View>
                        </View>
                      </LinearGradient>
                    </Pressable>
                  );
                })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  // Buy Points Modal
  const BuyPointsModal = () => (
    <Modal
      visible={showBuyPointsModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => {
        setShowBuyPointsModal(false);
        setSelectedPromo(null);
        setGcashNumber("");
      }}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, styles.buyModalContent]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>💳 Buy Points</Text>
            <Pressable 
              style={styles.modalCloseButton}
              onPress={() => {
                setShowBuyPointsModal(false);
                setSelectedPromo(null);
                setGcashNumber("");
              }}
            >
              <Ionicons name="close" size={24} color="#666" />
            </Pressable>
          </View>

          {selectedPromo && (
            <View style={styles.buyContainer}>
              {/* Promo Summary Card */}
              <LinearGradient
                colors={['#F59E0B', '#FBBF24']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.promoSummaryCard}
              >
                <View style={styles.promoSummaryContent}>
                  <View style={styles.promoSummaryIcon}>
                    <Ionicons name="gift" size={32} color="#FFF" />
                  </View>
                  <View style={styles.promoSummaryInfo}>
                    <Text style={styles.promoSummaryTitle}>{selectedPromo.title}</Text>
                    <Text style={styles.promoSummaryDescription}>{selectedPromo.description}</Text>
                  </View>
                </View>
                
                <View style={styles.promoSummaryDivider} />
                
                <View style={styles.promoSummaryDetails}>
                  <View style={styles.promoSummaryDetail}>
                    <Text style={styles.promoSummaryDetailLabel}>Points to get</Text>
                    <Text style={styles.promoSummaryDetailValue}>{selectedPromo.discount_value} ⭐</Text>
                  </View>
                  <View style={styles.promoSummaryDetail}>
                    <Text style={styles.promoSummaryDetailLabel}>Amount to pay</Text>
                    <Text style={styles.promoSummaryDetailValue}>
                      ₱{selectedPromo.promo_code === 'BUY100' ? 10 :
                         selectedPromo.promo_code === 'BUY500' ? 50 :
                         selectedPromo.promo_code === 'BUY1000' ? 100 : 0}
                    </Text>
                  </View>
                </View>
              </LinearGradient>

              {/* GCash Input */}
              <View style={styles.inputSection}>
                <Text style={styles.inputLabel}>GCash Number</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="phone-portrait-outline" size={20} color="#666" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="0912 345 6789"
                    placeholderTextColor="#999"
                    keyboardType="phone-pad"
                    value={gcashNumber}
                    onChangeText={setGcashNumber}
                    maxLength={11}
                  />
                </View>
                <Text style={styles.inputHint}>Enter the GCash number linked to your account</Text>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionButtons}>
                <Pressable
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowBuyPointsModal(false);
                    setSelectedPromo(null);
                    setGcashNumber("");
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.confirmButton,
                    (!gcashNumber || gcashNumber.length < 11 || processingBuyPoints) && styles.confirmButtonDisabled
                  ]}
                  onPress={handleBuyPoints}
                  disabled={!gcashNumber || gcashNumber.length < 11 || processingBuyPoints}
                >
                  {processingBuyPoints ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Text style={styles.confirmButtonText}>Confirm Purchase</Text>
                      <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                    </>
                  )}
                </Pressable>
              </View>

              {/* Security Note */}
              <View style={styles.securityNote}>
                <Ionicons name="shield-checkmark-outline" size={16} color="#10B981" />
                <Text style={styles.securityNoteText}>Secure transaction powered by GCash</Text>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
        <Text style={styles.loadingText}>Loading your points...</Text>
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
          <View>
            <Text style={styles.headerGreeting}>Hello, {commuter?.first_name || 'Rider'}! 👋</Text>
            <Text style={styles.headerTitle}>My Points</Text>
          </View>
          <View style={styles.headerActions}>
            {/* <Pressable 
              style={styles.headerButton}
              onPress={() => setShowPromoModal(true)}
            >
              <LinearGradient
                colors={['#F59E0B', '#FBBF24']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.headerButtonGradient}
              >
                <Ionicons name="pricetag" size={20} color="#FFF" />
              </LinearGradient>
            </Pressable> */}
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
            <Text style={styles.quickActionText}>Promos</Text>
          </Pressable>

          <Pressable 
            style={styles.quickAction}
            onPress={() => {
              setPromoCategory('buy');
              setShowPromoModal(true);
            }}
          >
            <LinearGradient
              colors={['#10B981', '#34D399']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.quickActionGradient}
            >
              <Ionicons name="add-circle" size={24} color="#FFF" />
            </LinearGradient>
            <Text style={styles.quickActionText}>Buy Points</Text>
          </Pressable>

          <Pressable 
            style={styles.quickAction}
            onPress={() => {
              setPromoCategory('redeem');
              setShowPromoModal(true);
            }}
          >
            <LinearGradient
              colors={['#8B5CF6', '#A78BFA']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.quickActionGradient}
            >
              <Ionicons name="swap-horizontal" size={24} color="#FFF" />
            </LinearGradient>
            <Text style={styles.quickActionText}>Redeem</Text>
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
            {pointsHistory.length > 0 && (
              <Pressable onPress={() => navigation.navigate("PointsHistory")}>
                <Text style={styles.seeAll}>See All →</Text>
              </Pressable>
            )}
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
                if (item.source === 'trip' || item.source === 'trip_cash') {
                  sourceText = 'Trip (Cash)';
                } else if (item.source === 'trip_wallet') {
                  sourceText = 'Trip (Points)';
                } else if (item.source === 'referral') {
                  sourceText = 'Referral Bonus';
                } else if (item.source === 'promo') {
                  sourceText = 'Promo Bonus';
                } else {
                  sourceText = 'Points Earned';
                }
              } else {
                iconColor = '#EF4444';
                bgColor = '#FEE2E2';
                sourceText = 'Points Used';
              }
              
              return (
                <Animated.View 
                  key={item.id} 
                  style={[
                    styles.historyItem,
                    index === 0 && styles.firstHistoryItem
                  ]}
                >
                  <View style={[styles.historyIcon, { backgroundColor: bgColor }]}>
                    <Ionicons 
                      name={item.type === 'earned' ? 'star' : 'gift'} 
                      size={20} 
                      color={iconColor} 
                    />
                  </View>
                  <View style={styles.historyInfo}>
                    <Text style={styles.historyTitle}>{sourceText}</Text>
                    <Text style={styles.historyDate}>{formatDate(item.created_at)}</Text>
                  </View>
                  <Text style={[
                    styles.historyAmount,
                    item.type === 'earned' ? styles.earnedAmount : styles.redeemedAmount
                  ]}>
                    {item.type === 'earned' ? '+' : '-'}{item.points}
                  </Text>
                </Animated.View>
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

            {recentBookings.map((booking, index) => {
              const pointsEarned = booking.points_earned || calculatePointsEarned(booking.fare, booking.payment_type);
              
              return (
                <Pressable
                  key={booking.id}
                  style={[
                    styles.tripItem,
                    index === 0 && styles.firstTripItem
                  ]}
                  onPress={() => navigation.navigate("BookingDetails", { id: booking.id })}
                >
                  <View style={styles.tripIcon}>
                    <Ionicons name="car" size={20} color="#183B5C" />
                  </View>
                  <View style={styles.tripInfo}>
                    <Text style={styles.tripRoute} numberOfLines={1}>
                      {booking.pickup_location?.split(",")[0]} → {booking.dropoff_location?.split(",")[0]}
                    </Text>
                    <View style={styles.tripMeta}>
                      <Text style={styles.tripDate}>{formatDate(booking.created_at)}</Text>
                      {booking.payment_type === 'wallet' ? (
                        <View style={styles.pointsBadge}>
                          <Ionicons name="star" size={10} color="#F59E0B" />
                          <Text style={styles.pointsBadgeText}>Points</Text>
                        </View>
                      ) : (
                        <View style={styles.cashBadge}>
                          <Ionicons name="cash" size={10} color="#10B981" />
                          <Text style={styles.cashBadgeText}>Cash</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={styles.tripAmount}>
                    <Text style={styles.tripFare}>{formatCurrency(booking.fare)}</Text>
                    {pointsEarned > 0 && (
                      <View style={styles.pointsEarned}>
                        <Ionicons name="star" size={10} color="#F59E0B" />
                        <Text style={styles.pointsEarnedText}>+{pointsEarned}</Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
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

      {/* Modals */}
      <PromoModal />
      <BuyPointsModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
    marginTop: -40,
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
  },
  headerGreeting: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
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
    marginTop: 5,
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
  tripMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tripDate: {
    fontSize: 11,
    color: "#999",
  },
  pointsBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 2,
  },
  pointsBadgeText: {
    fontSize: 9,
    color: "#F59E0B",
    fontWeight: "600",
  },
  cashBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 2,
  },
  cashBadgeText: {
    fontSize: 9,
    color: "#10B981",
    fontWeight: "600",
  },
  tripAmount: {
    alignItems: "flex-end",
  },
  tripFare: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  pointsEarned: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 2,
  },
  pointsEarnedText: {
    fontSize: 10,
    color: "#F59E0B",
    fontWeight: "600",
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

  // Modal Styles
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
  buyModalContent: {
    maxHeight: "70%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#183B5C",
  },
  categoryTabs: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    borderRadius: 25,
    padding: 4,
    marginBottom: 20,
  },
  categoryTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 21,
  },
  categoryTabActive: {
    backgroundColor: "#FFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  categoryTabText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666",
  },
  categoryTabTextActive: {
    color: "#183B5C",
  },
  promoList: {
    paddingBottom: 20,
  },
  emptyPromoContainer: {
    alignItems: "center",
    padding: 40,
  },
  emptyPromoIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },
  emptyPromoTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 6,
  },
  emptyPromoText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  promoCard: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  promoCardDisabled: {
    opacity: 0.5,
  },
  promoCardGradient: {
    padding: 15,
  },
  promoCardContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  promoIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  promoInfo: {
    flex: 1,
  },
  promoTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  promoDescription: {
    fontSize: 13,
    color: "#666",
    marginBottom: 8,
  },
  promoRequirement: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  requirementBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  requirementText: {
    fontSize: 11,
    color: "#666",
    fontWeight: "500",
  },
  availabilityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  availabilityText: {
    fontSize: 11,
    fontWeight: "600",
  },
  promoAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  promoActionText: {
    fontSize: 14,
    color: "#183B5C",
    fontWeight: "600",
  },
  promoActionDisabled: {
    color: "#9CA3AF",
  },
  buyContainer: {
    paddingVertical: 10,
  },
  promoSummaryCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  promoSummaryContent: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  promoSummaryIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  promoSummaryInfo: {
    flex: 1,
  },
  promoSummaryTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFF",
    marginBottom: 4,
  },
  promoSummaryDescription: {
    fontSize: 13,
    color: "#FFF",
    opacity: 0.9,
  },
  promoSummaryDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginBottom: 15,
  },
  promoSummaryDetails: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  promoSummaryDetail: {
    alignItems: "center",
  },
  promoSummaryDetailLabel: {
    fontSize: 12,
    color: "#FFF",
    opacity: 0.8,
    marginBottom: 4,
  },
  promoSummaryDetailValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFF",
  },
  inputSection: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 15,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 15,
    fontSize: 16,
    color: "#333",
  },
  inputHint: {
    fontSize: 12,
    color: "#999",
    marginTop: 6,
    marginLeft: 5,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 15,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
  },
  confirmButton: {
    flex: 2,
    backgroundColor: "#183B5C",
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  confirmButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  confirmButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  securityNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
  securityNoteText: {
    fontSize: 12,
    color: "#10B981",
    fontWeight: "500",
  },
});