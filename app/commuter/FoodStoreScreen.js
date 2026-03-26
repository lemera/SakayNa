import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Dimensions,
  Animated,
  TextInput,
  FlatList,
  StatusBar,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";

const { width, height } = Dimensions.get("window");
const CARD_WIDTH = (width - 48) / 2;

// Sample food categories
const CATEGORIES = [
  { id: "all", name: "All", icon: "grid-outline" },
  { id: "burgers", name: "Burgers", icon: "fast-food-outline" },
  { id: "pizza", name: "Pizza", icon: "pizza-outline" },
  { id: "sushi", name: "Sushi", icon: "fish-outline" },
  { id: "desserts", name: "Desserts", icon: "ice-cream-outline" },
  { id: "drinks", name: "Drinks", icon: "cafe-outline" },
  { id: "chicken", name: "Chicken", icon: "restaurant-outline" },
  { id: "asian", name: "Asian", icon: "restaurant-outline" },
];

// Sample food items with categories
const SAMPLE_FOODS = [
  {
    id: "1",
    name: "Classic Cheeseburger",
    restaurant: "Burger House",
    price: 199,
    originalPrice: 249,
    rating: 4.8,
    reviews: 1234,
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500",
    deliveryTime: "20-30 min",
    deliveryFee: 49,
    isPopular: true,
    discount: 20,
    category: "burgers",
  },
  {
    id: "2",
    name: "Pepperoni Pizza",
    restaurant: "Pizza Heaven",
    price: 299,
    originalPrice: 399,
    rating: 4.9,
    reviews: 2345,
    image: "https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=500",
    deliveryTime: "25-35 min",
    deliveryFee: 59,
    isPopular: true,
    discount: 25,
    category: "pizza",
  },
  {
    id: "3",
    name: "California Maki",
    restaurant: "Sushi Master",
    price: 249,
    originalPrice: 299,
    rating: 4.7,
    reviews: 890,
    image: "https://images.unsplash.com/photo-1553621042-f6e147245754?w=500",
    deliveryTime: "15-25 min",
    deliveryFee: 39,
    isPopular: false,
    discount: 17,
    category: "sushi",
  },
  {
    id: "4",
    name: "Chocolate Cake",
    restaurant: "Sweet Treats",
    price: 149,
    originalPrice: 199,
    rating: 4.9,
    reviews: 567,
    image: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=500",
    deliveryTime: "10-20 min",
    deliveryFee: 29,
    isPopular: true,
    discount: 25,
    category: "desserts",
  },
  {
    id: "5",
    name: "Iced Caramel Latte",
    restaurant: "Coffee Club",
    price: 129,
    originalPrice: 159,
    rating: 4.6,
    reviews: 2341,
    image: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=500",
    deliveryTime: "10-15 min",
    deliveryFee: 19,
    isPopular: false,
    discount: 19,
    category: "drinks",
  },
  {
    id: "6",
    name: "Chicken Wings",
    restaurant: "Wing Stop",
    price: 179,
    originalPrice: 229,
    rating: 4.7,
    reviews: 987,
    image: "https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=500",
    deliveryTime: "20-30 min",
    deliveryFee: 49,
    isPopular: true,
    discount: 22,
    category: "chicken",
  },
  {
    id: "7",
    name: "Vegetarian Sushi",
    restaurant: "Green Sushi",
    price: 199,
    originalPrice: 259,
    rating: 4.5,
    reviews: 456,
    image: "https://images.unsplash.com/photo-1617196035154-1e7e6e28b0db?w=500",
    deliveryTime: "15-25 min",
    deliveryFee: 39,
    isPopular: false,
    discount: 23,
    category: "sushi",
  },
  {
    id: "8",
    name: "BBQ Burger",
    restaurant: "Grill House",
    price: 219,
    originalPrice: 279,
    rating: 4.8,
    reviews: 1567,
    image: "https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=500",
    deliveryTime: "20-30 min",
    deliveryFee: 49,
    isPopular: true,
    discount: 21,
    category: "burgers",
  },
  {
    id: "9",
    name: "Margherita Pizza",
    restaurant: "Pizza Heaven",
    price: 259,
    originalPrice: 329,
    rating: 4.8,
    reviews: 1876,
    image: "https://images.unsplash.com/photo-1604068549290-dea0e4a305ca?w=500",
    deliveryTime: "25-35 min",
    deliveryFee: 59,
    isPopular: true,
    discount: 21,
    category: "pizza",
  },
  {
    id: "10",
    name: "Mango Shake",
    restaurant: "Juice Bar",
    price: 89,
    originalPrice: 129,
    rating: 4.7,
    reviews: 543,
    image: "https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=500",
    deliveryTime: "5-10 min",
    deliveryFee: 19,
    isPopular: false,
    discount: 31,
    category: "drinks",
  },
];

// Featured restaurants
const FEATURED_RESTAURANTS = [
  {
    id: "1",
    name: "Burger House",
    image: "https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=500",
    rating: 4.8,
    cuisine: "American",
    deliveryTime: "20-30 min",
  },
  {
    id: "2",
    name: "Pizza Heaven",
    image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500",
    rating: 4.9,
    cuisine: "Italian",
    deliveryTime: "25-35 min",
  },
  {
    id: "3",
    name: "Sushi Master",
    image: "https://images.unsplash.com/photo-1553621042-f6e147245754?w=500",
    rating: 4.7,
    cuisine: "Japanese",
    deliveryTime: "15-25 min",
  },
  {
    id: "4",
    name: "Wing Stop",
    image: "https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=500",
    rating: 4.6,
    cuisine: "American",
    deliveryTime: "20-30 min",
  },
  {
    id: "5",
    name: "Sweet Treats",
    image: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=500",
    rating: 4.9,
    cuisine: "Desserts",
    deliveryTime: "10-20 min",
  },
];

export default function FoodStoreScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const scrollY = useRef(new Animated.Value(0)).current;
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [1, 0.9],
    extrapolate: "clamp",
  });

  const formatCurrency = (amount) => {
    return `₱${amount.toFixed(2)}`;
  };

  // Filter items based on search and category
  const filteredItems = useMemo(() => {
    let filtered = SAMPLE_FOODS;
    
    // Filter by category
    if (selectedCategory !== "all") {
      filtered = filtered.filter(item => item.category === selectedCategory);
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(item => 
        item.name.toLowerCase().includes(query) ||
        item.restaurant.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [selectedCategory, searchQuery]);

  // Popular items filtered
  const popularItems = useMemo(() => {
    return filteredItems.filter(item => item.isPopular);
  }, [filteredItems]);

  const renderFoodItem = ({ item }) => (
    <Pressable style={styles.foodCard}>
      <Image source={{ uri: item.image }} style={styles.foodImage} />
      {item.isPopular && (
        <View style={styles.popularBadge}>
          <Text style={styles.popularBadgeText}>Popular</Text>
        </View>
      )}
      {item.discount > 0 && (
        <View style={styles.discountBadge}>
          <Text style={styles.discountBadgeText}>{item.discount}% OFF</Text>
        </View>
      )}
      <View style={styles.foodInfo}>
        <Text style={styles.foodName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.restaurantName} numberOfLines={1}>
          {item.restaurant}
        </Text>
        <View style={styles.ratingContainer}>
          <Ionicons name="star" size={14} color="#F59E0B" />
          <Text style={styles.ratingText}>{item.rating}</Text>
          <Text style={styles.reviewsText}>({item.reviews})</Text>
        </View>
        <View style={styles.priceContainer}>
          <Text style={styles.price}>{formatCurrency(item.price)}</Text>
          <Text style={styles.originalPrice}>{formatCurrency(item.originalPrice)}</Text>
        </View>
        <View style={styles.deliveryInfo}>
          <Ionicons name="time-outline" size={12} color="#9CA3AF" />
          <Text style={styles.deliveryTime}>{item.deliveryTime}</Text>
          <Text style={styles.deliveryFee}>+{formatCurrency(item.deliveryFee)}</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.addButton}>
        <Ionicons name="add" size={20} color="#FF6B4A" />
      </TouchableOpacity>
    </Pressable>
  );

  const renderCategory = ({ item }) => (
    <Pressable
      style={[
        styles.categoryButton,
        selectedCategory === item.id && styles.categoryButtonActive,
      ]}
      onPress={() => setSelectedCategory(item.id)}
    >
      <Ionicons
        name={item.icon}
        size={20}
        color={selectedCategory === item.id ? "#FFF" : "#6B7280"}
      />
      <Text
        style={[
          styles.categoryText,
          selectedCategory === item.id && styles.categoryTextActive,
        ]}
      >
        {item.name}
      </Text>
    </Pressable>
  );

  const renderFeaturedRestaurant = ({ item }) => (
    <Pressable style={styles.featuredCard}>
      <Image source={{ uri: item.image }} style={styles.featuredImage} />
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.8)"]}
        style={styles.featuredGradient}
      >
        <View style={styles.featuredInfo}>
          <Text style={styles.featuredName}>{item.name}</Text>
          <View style={styles.featuredDetails}>
            <View style={styles.featuredRating}>
              <Ionicons name="star" size={12} color="#F59E0B" />
              <Text style={styles.featuredRatingText}>{item.rating}</Text>
            </View>
            <Text style={styles.featuredCuisine}>{item.cuisine}</Text>
            <Text style={styles.featuredTime}>{item.deliveryTime}</Text>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="restaurant-outline" size={80} color="#D1D5DB" />
      <Text style={styles.emptyTitle}>No items found</Text>
      <Text style={styles.emptyText}>
        Try searching for something else or check back later
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
      
      {/* Header */}
      <Animated.View style={[styles.header, { opacity: headerOpacity }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </Pressable>
        <Text style={styles.headerTitle}>Food Store</Text>
        <Pressable style={styles.cartButton}>
          <Ionicons name="cart-outline" size={24} color="#1F2937" />
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>0</Text>
          </View>
        </Pressable>
      </Animated.View>

      {/* Main ScrollView - Everything scrolls together */}
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Coming Soon Banner */}
        <LinearGradient
          colors={["#FF6B4A", "#FF8A5C"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.comingSoonBanner}
        >
          <View style={styles.comingSoonContent}>
            <View style={styles.comingSoonIcon}>
              <Ionicons name="restaurant" size={32} color="#FF6B4A" />
            </View>
            <Text style={styles.comingSoonTitle}>Coming Soon! 🚀</Text>
            <Text style={styles.comingSoonSubtitle}>
              We're working hard to bring you the best food delivery experience
            </Text>
            <View style={styles.comingSoonFeatures}>
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                <Text style={styles.featureText}>50+ Partner Restaurants</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                <Text style={styles.featureText}>30 Min Delivery</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                <Text style={styles.featureText}>Exclusive Discounts</Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={20} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for food, restaurants..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={20} color="#9CA3AF" />
            </Pressable>
          )}
        </View>

        {/* Categories - Horizontal Scroll */}
        <View style={styles.categoriesSection}>
          <Text style={styles.sectionTitle}>Categories</Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={CATEGORIES}
            renderItem={renderCategory}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.categoriesList}
          />
        </View>

        {/* Featured Restaurants - Horizontal Scroll */}
        <View style={styles.featuredSection}>
          <Text style={styles.sectionTitle}>Featured Restaurants</Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={FEATURED_RESTAURANTS}
            renderItem={renderFeaturedRestaurant}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.featuredList}
          />
        </View>

        {/* Search Results Info */}
        {searchQuery.length > 0 && (
          <View style={styles.searchInfo}>
            <Text style={styles.searchInfoText}>
              Found {filteredItems.length} results for "{searchQuery}"
            </Text>
          </View>
        )}

        {/* Popular Items */}
        {popularItems.length > 0 && searchQuery.length === 0 && (
          <View style={styles.popularSection}>
            <Text style={styles.sectionTitle}>🔥 Popular Items</Text>
            <FlatList
              data={popularItems}
              renderItem={renderFoodItem}
              keyExtractor={(item) => item.id}
              numColumns={2}
              columnWrapperStyle={styles.foodGrid}
              scrollEnabled={false}
            />
          </View>
        )}

        {/* All Items / Search Results */}
        <View style={styles.allItemsSection}>
          <Text style={styles.sectionTitle}>
            {searchQuery.length > 0 ? "Search Results" : "All Items"}
          </Text>
          {filteredItems.length > 0 ? (
            <FlatList
              data={filteredItems}
              renderItem={renderFoodItem}
              keyExtractor={(item) => item.id}
              numColumns={2}
              columnWrapperStyle={styles.foodGrid}
              scrollEnabled={false}
            />
          ) : (
            renderEmptyState()
          )}
        </View>

        {/* Bottom Padding */}
        <View style={{ height: 100 }} />
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
  },
  cartButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    position: "relative",
  },
  cartBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#FF6B4A",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "bold",
  },
  comingSoonBanner: {
    margin: 20,
    borderRadius: 24,
    overflow: "hidden",
  },
  comingSoonContent: {
    padding: 24,
    alignItems: "center",
  },
  comingSoonIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  comingSoonTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFF",
    marginBottom: 8,
  },
  comingSoonSubtitle: {
    fontSize: 14,
    color: "#FFF",
    textAlign: "center",
    marginBottom: 20,
    opacity: 0.9,
  },
  comingSoonFeatures: {
    gap: 8,
    width: "100%",
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  featureText: {
    fontSize: 12,
    color: "#FFF",
    fontWeight: "500",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginBottom: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#1F2937",
  },
  searchInfo: {
    marginHorizontal: 20,
    marginBottom: 12,
  },
  searchInfoText: {
    fontSize: 13,
    color: "#6B7280",
  },
  categoriesSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    marginHorizontal: 20,
    marginBottom: 12,
  },
  categoriesList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 30,
    backgroundColor: "#F3F4F6",
    gap: 6,
    marginHorizontal: 4,
  },
  categoryButtonActive: {
    backgroundColor: "#FF6B4A",
  },
  categoryText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
  },
  categoryTextActive: {
    color: "#FFF",
  },
  featuredSection: {
    marginBottom: 24,
  },
  featuredList: {
    paddingHorizontal: 16,
    gap: 12,
  },
  featuredCard: {
    width: width - 100,
    height: 140,
    borderRadius: 20,
    overflow: "hidden",
    marginHorizontal: 4,
  },
  featuredImage: {
    width: "100%",
    height: "100%",
  },
  featuredGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
  },
  featuredInfo: {
    gap: 4,
  },
  featuredName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFF",
  },
  featuredDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  featuredRating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  featuredRatingText: {
    fontSize: 12,
    color: "#FFF",
    fontWeight: "500",
  },
  featuredCuisine: {
    fontSize: 12,
    color: "#FFF",
    opacity: 0.8,
  },
  featuredTime: {
    fontSize: 12,
    color: "#FFF",
    opacity: 0.8,
  },
  popularSection: {
    marginBottom: 24,
  },
  allItemsSection: {
    marginBottom: 24,
  },
  foodGrid: {
    justifyContent: "space-between",
    paddingHorizontal: 16,
    gap: 12,
  },
  foodCard: {
    width: CARD_WIDTH,
    backgroundColor: "#FFF",
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  foodImage: {
    width: "100%",
    height: 120,
  },
  popularBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "#FF6B4A",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularBadgeText: {
    fontSize: 10,
    color: "#FFF",
    fontWeight: "bold",
  },
  discountBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#EF4444",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  discountBadgeText: {
    fontSize: 10,
    color: "#FFF",
    fontWeight: "bold",
  },
  foodInfo: {
    padding: 12,
  },
  foodName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 2,
  },
  restaurantName: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 4,
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#F59E0B",
    marginLeft: 4,
  },
  reviewsText: {
    fontSize: 10,
    color: "#9CA3AF",
    marginLeft: 2,
  },
  priceContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  price: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#FF6B4A",
  },
  originalPrice: {
    fontSize: 11,
    color: "#9CA3AF",
    textDecorationLine: "line-through",
  },
  deliveryInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  deliveryTime: {
    fontSize: 10,
    color: "#9CA3AF",
  },
  deliveryFee: {
    fontSize: 10,
    color: "#9CA3AF",
  },
  addButton: {
    position: "absolute",
    bottom: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    marginHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1F2937",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
  },
});