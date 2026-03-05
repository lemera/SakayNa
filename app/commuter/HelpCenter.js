// screens/commuter/HelpCenter.js
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";

export default function HelpCenterScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const categories = [
    { id: "all", name: "All", icon: "apps" },
    { id: "booking", name: "Booking", icon: "car" },
    { id: "payment", name: "Payment", icon: "cash" },
    { id: "account", name: "Account", icon: "person" },
    { id: "wallet", name: "Wallet", icon: "wallet" },
    { id: "promos", name: "Promos", icon: "pricetag" },
  ];

  const articles = [
    {
      id: 1,
      title: "How to book a ride",
      category: "booking",
      views: 1234,
      content: "Open the app, select your pickup and dropoff locations, choose number of passengers, and tap 'Book a Ride'. The system will automatically find a nearby driver for you.",
    },
    {
      id: 2,
      title: "Understanding fare calculation",
      category: "payment",
      views: 987,
      content: "Fare is calculated based on distance: ₱15 for the first kilometer, and ₱15 for each additional kilometer. The total fare is multiplied by the number of passengers.",
    },
    {
      id: 3,
      title: "How to add payment methods",
      category: "payment",
      views: 756,
      content: "Go to Wallet > Payment Methods > Add Payment Method. You can add GCash or credit/debit cards. Set a default payment method for automatic payments.",
    },
    {
      id: 4,
      title: "What to do if your ride is late",
      category: "booking",
      views: 654,
      content: "If your driver is running late, you can contact them through the app. If the driver doesn't arrive within 5 minutes, you can cancel the booking without penalty.",
    },
    {
      id: 5,
      title: "How to earn and use points",
      category: "wallet",
      views: 543,
      content: "Earn 10 points per ride, 100 points per referral, double points on weekends. Redeem points for discounts and rewards in the Points & Rewards section.",
    },
    {
      id: 6,
      title: "Changing your account information",
      category: "account",
      views: 432,
      content: "Go to Account > Profile Settings to update your personal information, profile picture, and contact details.",
    },
    {
      id: 7,
      title: "How promo codes work",
      category: "promos",
      views: 321,
      content: "Enter promo codes during booking to get discounts. Promos cannot be combined with other offers and each code can only be used once.",
    },
    {
      id: 8,
      title: "Wallet cash-in options",
      category: "wallet",
      views: 298,
      content: "You can cash in via GCash or over-the-counter at partner outlets. Minimum cash-in amount is ₱20.",
    },
  ];

  const filteredArticles = articles.filter(article => {
    const matchesSearch = article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         article.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || article.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const [expandedArticle, setExpandedArticle] = useState(null);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#183B5C" />
        </Pressable>
        <Text style={styles.headerTitle}>Help Center</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color="#999" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for help..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#999"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={20} color="#999" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Categories */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesContainer}
      >
        {categories.map((category) => (
          <Pressable
            key={category.id}
            style={[
              styles.categoryChip,
              selectedCategory === category.id && styles.categoryChipActive,
            ]}
            onPress={() => setSelectedCategory(category.id)}
          >
            <Ionicons
              name={category.icon}
              size={16}
              color={selectedCategory === category.id ? "#FFF" : "#666"}
            />
            <Text
              style={[
                styles.categoryText,
                selectedCategory === category.id && styles.categoryTextActive,
              ]}
            >
              {category.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Articles */}
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.articlesContainer}>
          {filteredArticles.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={64} color="#D1D5DB" />
              <Text style={styles.emptyStateTitle}>No articles found</Text>
              <Text style={styles.emptyStateText}>
                Try searching with different keywords
              </Text>
            </View>
          ) : (
            filteredArticles.map((article) => (
              <View key={article.id} style={styles.articleCard}>
                <Pressable
                  style={styles.articleHeader}
                  onPress={() => setExpandedArticle(
                    expandedArticle === article.id ? null : article.id
                  )}
                >
                  <View style={styles.articleTitleContainer}>
                    <Text style={styles.articleTitle}>{article.title}</Text>
                    <View style={styles.articleMeta}>
                      <Ionicons name="eye" size={12} color="#999" />
                      <Text style={styles.articleViews}>{article.views}</Text>
                    </View>
                  </View>
                  <Ionicons
                    name={expandedArticle === article.id ? "chevron-up" : "chevron-down"}
                    size={20}
                    color="#666"
                  />
                </Pressable>

                {expandedArticle === article.id && (
                  <Text style={styles.articleContent}>{article.content}</Text>
                )}
              </View>
            ))
          )}
        </View>

        {/* Contact Support */}
        <View style={styles.contactCard}>
          <Ionicons name="help-circle" size={24} color="#183B5C" />
          <Text style={styles.contactTitle}>Still need help?</Text>
          <Text style={styles.contactText}>
            Can't find what you're looking for? Contact our support team.
          </Text>
          <Pressable
            style={styles.contactButton}
            onPress={() => navigation.navigate("Support")}
          >
            <Text style={styles.contactButtonText}>Contact Support</Text>
          </Pressable>
        </View>

        {/* Quick Links */}
        <View style={styles.quickLinks}>
          <Text style={styles.quickLinksTitle}>Quick Links</Text>
          <Pressable
            style={styles.quickLink}
            onPress={() => navigation.navigate("FAQ")}
          >
            <Ionicons name="help" size={20} color="#183B5C" />
            <Text style={styles.quickLinkText}>Frequently Asked Questions</Text>
          </Pressable>
          <Pressable
            style={styles.quickLink}
            onPress={() => navigation.navigate("Terms")}
          >
            <Ionicons name="document-text" size={20} color="#183B5C" />
            <Text style={styles.quickLinkText}>Terms of Service</Text>
          </Pressable>
          <Pressable
            style={styles.quickLink}
            onPress={() => navigation.navigate("Privacy")}
          >
            <Ionicons name="shield" size={20} color="#183B5C" />
            <Text style={styles.quickLinkText}>Privacy Policy</Text>
          </Pressable>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#183B5C",
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: "#FFF",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: "#333",
    padding: 0,
  },
  categoriesContainer: {
    backgroundColor: "#FFF",
    paddingHorizontal: 20,
    paddingBottom: 15,
    height: 60,
    maxHeight: 60,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10,
    gap: 6,
  },
  categoryChipActive: {
    backgroundColor: "#183B5C",
  },
  categoryText: {
    fontSize: 14,
    color: "#666",
  },
  categoryTextActive: {
    color: "#FFF",
  },
  articlesContainer: {
    padding: 20,
  },
  articleCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  articleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  articleTitleContainer: {
    flex: 1,
    marginRight: 10,
  },
  articleTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#333",
    marginBottom: 4,
  },
  articleMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  articleViews: {
    fontSize: 11,
    color: "#999",
  },
  articleContent: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  emptyState: {
    alignItems: "center",
    padding: 40,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginTop: 20,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#666",
    marginTop: 8,
    textAlign: "center",
  },
  contactCard: {
    backgroundColor: "#F0F7FF",
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 20,
    borderRadius: 16,
    alignItems: "center",
  },
  contactTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#183B5C",
    marginTop: 10,
    marginBottom: 5,
  },
  contactText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 15,
  },
  contactButton: {
    backgroundColor: "#183B5C",
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
  },
  contactButtonText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
  },
  quickLinks: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  quickLinksTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 15,
  },
  quickLink: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  quickLinkText: {
    fontSize: 14,
    color: "#333",
  },
});