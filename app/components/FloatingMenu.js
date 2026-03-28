import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
  Modal,
  Platform,
  StatusBar,
  Alert,
  ScrollView,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import FoodStoreScreen from "../commuter/FoodStoreScreen";
import TopRatedDriversScreen from "../commuter/TopRatedDrivers";

const { width, height } = Dimensions.get("window");

// Menu categories with items - Updated with Top Rated Drivers
const MENU_CATEGORIES = [
  {
    id: "main",
    title: "MAIN",
    icon: "home-outline",
    items: [
      {
        id: "home",
        name: "Home",
        icon: "home-outline",
        activeIcon: "home",
        screen: "Home",
        color: "#FF6B4A",
        gradient: ["#FF6B4A", "#FF8A5C"],
      },
      {
        id: "track",
        name: "Track Ride",
        icon: "navigate-outline",
        activeIcon: "navigate",
        screen: "TrackRideScreen",
        color: "#3B82F6",
        gradient: ["#3B82F6", "#60A5FA"],
      },
      {
        id: "wallet",
        name: "Wallet",
        icon: "wallet-outline",
        activeIcon: "wallet",
        screen: "Wallet",
        color: "#10B981",
        gradient: ["#10B981", "#34D399"],
      },
    ],
  },
  {
    id: "rewards",
    title: "REWARDS & POINTS",
    icon: "star-outline",
    items: [
      {
        id: "points",
        name: "Points & Rewards",
        icon: "star-outline",
        activeIcon: "star",
        screen: "PointsRewards",
        color: "#F59E0B",
        gradient: ["#F59E0B", "#FBBF24"],
      },
      {
        id: "referral",
        name: "Refer & Earn",
        icon: "people-outline",
        activeIcon: "people",
        screen: "ReferralScreen",
        color: "#8B5CF6",
        gradient: ["#8B5CF6", "#A78BFA"],
      },
      {
        id: "rideHistory",
        name: "Ride History",
        icon: "time-outline",
        activeIcon: "time",
        screen: "RideHistoryScreen",
        color: "#3B82F6",
        gradient: ["#3B82F6", "#60A5FA"],
      },
    ],
  },
  // {
  //   id: "premium",
  //   title: "PREMIUM DRIVERS",
  //   icon: "ribbon-outline",
  //   items: [
  //     {
  //       id: "topRated",
  //       name: "Top Rated Drivers",
  //       icon: "star-outline",
  //       activeIcon: "star",
  //       screen: "TopRatedDrivers",
  //       color: "#F59E0B",
  //       gradient: ["#F59E0B", "#FBBF24"],
  //       description: "Best rated drivers 4+ stars",
  //     },
  //     {
  //       id: "nearbyPremium",
  //       name: "Nearby Premium",
  //       icon: "location-outline",
  //       activeIcon: "location",
  //       screen: "NearbyPremiumDrivers",
  //       color: "#10B981",
  //       gradient: ["#10B981", "#34D399"],
  //       comingSoon: true,
  //     },
  //   ],
  // },
  {
    id: "communication",
    title: "COMMUNICATION & PROFILE",
    icon: "chatbubbles-outline",
    items: [
      {
        id: "inbox",
        name: "Messages & Notifications",
        icon: "notifications-outline",
        activeIcon: "notifications",
        screen: "Inbox",
        color: "#EF4444",
        gradient: ["#EF4444", "#F87171"],
      },
      {
        id: "account",
        name: "Profile & Settings",
        icon: "person-outline",
        activeIcon: "person",
        screen: "Account",
        color: "#6B7280",
        gradient: ["#6B7280", "#9CA3AF"],
      },
    ],
  },
  {
    id: "extras",
    title: "EXTRAS",
    icon: "grid-outline",
    items: [
      {
        id: "foodStore",
        name: "Food Store",
        icon: "restaurant-outline",
        activeIcon: "restaurant",
        screen: FoodStoreScreen,
        color: "#EC489A",
        gradient: ["#EC489A", "#F472B6"],
        comingSoon: false,
      },
      {
        id: "shopping",
        name: "Shopping",
        icon: "cart-outline",
        activeIcon: "cart",
        screen: null,
        color: "#10B981",
        gradient: ["#10B981", "#34D399"],
        comingSoon: true,
      },
      {
        id: "promos",
        name: "Promos",
        icon: "pricetag-outline",
        activeIcon: "pricetag",
        screen: null,
        color: "#F59E0B",
        gradient: ["#F59E0B", "#FBBF24"],
        comingSoon: true,
      },
    ],
  },
];

export default function FloatingMenu({ visible, onClose, currentScreen }) {
  const navigation = useNavigation();
  const [selectedItem, setSelectedItem] = useState(null);
  const [isClosing, setIsClosing] = useState(false);
  const scrollViewRef = useRef(null);
  
  // Animation values
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const menuTranslateY = useRef(new Animated.Value(height)).current;
  const menuScale = useRef(new Animated.Value(0.95)).current;
  const menuOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && !isClosing) {
      // Reset scroll position when menu opens
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollTo({ y: 0, animated: false });
      }
      
      // Animate in
      setIsClosing(false);
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(menuTranslateY, {
          toValue: 0,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.spring(menuScale, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(menuOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (!visible && !isClosing) {
      closeMenu();
    }
  }, [visible]);

  const closeMenu = () => {
    setIsClosing(true);
    
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(menuTranslateY, {
        toValue: height,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(menuScale, {
        toValue: 0.95,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(menuOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsClosing(false);
      onClose();
    });
  };

  const handleNavigate = (item) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (item.comingSoon) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert("✨ Coming Soon!", `${item.name} will be available in the next update!`);
      return;
    }

    if (item.screen) {
      setSelectedItem(item.id);
      
      setTimeout(() => {
        navigation.navigate(item.screen);
        closeMenu();
        setSelectedItem(null);
      }, 150);
    }
  };

  const handleBackdropPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    closeMenu();
  };

  const getCurrentActiveItem = () => {
    for (const category of MENU_CATEGORIES) {
      const active = category.items.find(item => item.screen === currentScreen);
      if (active) return active.id;
    }
    return null;
  };

  const activeItemId = getCurrentActiveItem();

  const renderCategory = (category, categoryIndex) => {
    const isPremium = category.id === "premium";
    
    return (
      <View key={category.id} style={styles.categoryContainer}>
        {/* Category Header */}
        <View style={styles.categoryHeader}>
          <LinearGradient
            colors={isPremium ? ["#FEF3C7", "#FDE68A"] : ["#FFF3F0", "#FFE5E0"]}
            style={styles.categoryIconContainer}
          >
            <Ionicons 
              name={category.icon} 
              size={18} 
              color={isPremium ? "#F59E0B" : "#FF6B4A"} 
            />
          </LinearGradient>
          <Text style={[
            styles.categoryTitle,
            isPremium && styles.categoryTitlePremium
          ]}>
            {category.title}
          </Text>
          {isPremium && (
            <View style={styles.premiumBadge}>
              <Ionicons name="diamond" size={12} color="#F59E0B" />
              <Text style={styles.premiumBadgeText}>Premium</Text>
            </View>
          )}
        </View>

        {/* Category Items */}
        <View style={styles.categoryItems}>
          {category.items.map((item) => {
            const isActive = activeItemId === item.id || selectedItem === item.id;
            const isPremiumItem = item.id === "topRated";
            
            return (
              <Pressable
                key={item.id}
                style={({ pressed }) => [
                  styles.menuItem,
                  pressed && styles.menuItemPressed,
                  isActive && styles.menuItemActive,
                  isPremiumItem && styles.premiumMenuItem,
                ]}
                onPress={() => handleNavigate(item)}
              >
                <LinearGradient
                  colors={isActive ? item.gradient : (isPremiumItem ? ["#FEF3C7", "#FDE68A"] : ["#F9FAFB", "#F3F4F6"])}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.menuIconContainer,
                    isPremiumItem && styles.premiumIconContainer
                  ]}
                >
                  <Ionicons
                    name={isActive ? item.activeIcon || item.icon : item.icon}
                    size={isPremiumItem ? 26 : 24}
                    color={isActive ? "#FFF" : (isPremiumItem ? "#F59E0B" : item.color)}
                  />
                  {item.comingSoon && (
                    <View style={styles.comingSoonDot} />
                  )}
                  {isPremiumItem && !isActive && (
                    <View style={styles.premiumGlow} />
                  )}
                </LinearGradient>
                <Text
                  style={[
                    styles.menuItemText,
                    isActive && styles.menuItemTextActive,
                    isPremiumItem && styles.premiumItemText,
                    item.comingSoon && styles.menuItemTextDisabled,
                  ]}
                >
                  {item.name}
                </Text>
                {item.description && (
                  <Text style={styles.menuItemDescription}>{item.description}</Text>
                )}
                {item.comingSoon && (
                  <View style={styles.comingSoonBadge}>
                    <Text style={styles.comingSoonBadgeText}>Soon</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={closeMenu}
      statusBarTranslucent={true}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={styles.container}>
        {/* Backdrop with blur effect */}
        <Animated.View
          style={[
            styles.backdrop,
            { opacity: backdropOpacity },
          ]}
        >
          <TouchableWithoutFeedback onPress={handleBackdropPress}>
            <BlurView
              intensity={Platform.OS === 'ios' ? 60 : 80}
              tint="dark"
              style={styles.backdropBlur}
            />
          </TouchableWithoutFeedback>
        </Animated.View>

        {/* Menu Panel */}
        <Animated.View
          style={[
            styles.menuContainer,
            {
              transform: [
                { translateY: menuTranslateY },
                { scale: menuScale },
              ],
              opacity: menuOpacity,
            },
          ]}
        >
          <LinearGradient
            colors={["#FFFFFF", "#FEFEFE"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.menuGradient}
          >
            {/* Header with drag handle */}
            <View style={styles.menuHeader}>
              <View style={styles.dragHandle}>
                <View style={styles.dragHandleBar} />
              </View>
              <View style={styles.headerContent}>
                <LinearGradient
                  colors={["#FF6B4A", "#FF8A5C"]}
                  style={styles.logoIcon}
                >
                  <Ionicons name="apps" size={20} color="#FFF" />
                </LinearGradient>
                <Text style={styles.menuTitle}>Menu</Text>
                <Pressable onPress={closeMenu} style={styles.closeButton}>
                  <Ionicons name="close" size={22} color="#9CA3AF" />
                </Pressable>
              </View>
            </View>

            {/* Categories ScrollView - Enhanced scrolling with extra bottom padding */}
            <ScrollView
              ref={scrollViewRef}
              showsVerticalScrollIndicator={Platform.OS === 'ios' ? true : false}
              indicatorStyle="black"
              contentContainerStyle={styles.scrollContent}
              style={styles.scrollView}
              bounces={true}
              overScrollMode="always"
              scrollEventThrottle={16}
              decelerationRate="fast"
              persistentScrollbar={true}
            >
              {MENU_CATEGORIES.map((category, index) => renderCategory(category, index))}
              {/* Extra bottom padding for better scrolling experience */}
              <View style={styles.bottomSpacer} />
              <View style={styles.extraBottomPadding} />
            </ScrollView>

            {/* Footer with user info - Fixed at bottom with improved spacing */}
            <View style={styles.menuFooter}>
              <LinearGradient
                colors={["#F9FAFB", "#F3F4F6"]}
                style={styles.footerGradient}
              >
                <View style={styles.footerContent}>
                  <Ionicons name="help-circle-outline" size={20} color="#9CA3AF" />
                  <Text style={styles.footerText}>Need help?</Text>
                  <Pressable
                    style={styles.footerButton}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      navigation.navigate("Support");
                      closeMenu();
                    }}
                  >
                    <Text style={styles.footerButtonText}>Contact Support</Text>
                    <Ionicons name="arrow-forward" size={16} color="#FF6B4A" />
                  </Pressable>
                </View>
              </LinearGradient>
            </View>
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropBlur: {
    flex: 1,
  },
  menuContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFF",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 25,
    maxHeight: height * 0.85,
  },
  menuGradient: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: "hidden",
    flex: 1,
    display: "flex",
    flexDirection: "column",
  },
  menuHeader: {
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
    backgroundColor: "#FFF",
    flexShrink: 0,
  },
  dragHandle: {
    alignItems: "center",
    paddingVertical: 8,
  },
  dragHandleBar: {
    width: 40,
    height: 4,
    backgroundColor: "#E5E7EB",
    borderRadius: 2,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  menuTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
    letterSpacing: -0.3,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  bottomSpacer: {
    height: Platform.OS === 'ios' ? 30 : 20,
  },
  extraBottomPadding: {
    height: Platform.OS === 'ios' ? 40 : 30,
  },
  categoryContainer: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  categoryIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  categoryTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#9CA3AF",
    letterSpacing: 0.5,
  },
  categoryTitlePremium: {
    color: "#F59E0B",
  },
  premiumBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
    gap: 4,
  },
  premiumBadgeText: {
    fontSize: 9,
    fontWeight: "600",
    color: "#F59E0B",
  },
  categoryItems: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  menuItem: {
    width: "33.33%",
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 8,
    position: "relative",
  },
  menuItemPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
  menuItemActive: {
    backgroundColor: "#FFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  premiumMenuItem: {
    transform: [{ scale: 1 }],
  },
  menuIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    position: "relative",
  },
  premiumIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: "#F59E0B20",
  },
  premiumGlow: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#F59E0B",
    opacity: 0.6,
  },
  menuItemText: {
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "500",
    textAlign: "center",
  },
  menuItemTextActive: {
    color: "#FF6B4A",
    fontWeight: "600",
  },
  premiumItemText: {
    color: "#F59E0B",
    fontWeight: "600",
  },
  menuItemDescription: {
    fontSize: 9,
    color: "#9CA3AF",
    textAlign: "center",
    marginTop: 2,
  },
  menuItemTextDisabled: {
    color: "#D1D5DB",
  },
  comingSoonDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#EF4444",
    borderWidth: 2,
    borderColor: "#FFF",
  },
  comingSoonBadge: {
    position: "absolute",
    top: -6,
    right: 6,
    backgroundColor: "#EF4444",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  comingSoonBadgeText: {
    fontSize: 8,
    color: "#FFF",
    fontWeight: "bold",
  },
  menuFooter: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
    backgroundColor: "#FFF",
    flexShrink: 0,
  },
  footerGradient: {
    borderRadius: 20,
    padding: 14,
  },
  footerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  footerText: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },
  footerButton: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: "auto",
    gap: 4,
  },
  footerButtonText: {
    fontSize: 13,
    color: "#FF6B4A",
    fontWeight: "600",
  },
});