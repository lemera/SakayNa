// screens/commuter/RateRide.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function RateRide({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { bookingId, driverId } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [booking, setBooking] = useState(null);
  const [driver, setDriver] = useState(null);
  
  // Rating state
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);

  // Rating tags
  const ratingTags = {
    5: ["On Time", "Friendly Driver", "Safe Driving", "Clean Vehicle", "Smooth Ride", "Great Service"],
    4: ["On Time", "Friendly Driver", "Safe Driving", "Good Service"],
    3: ["Okay Service", "On Time", "Could be Better"],
    2: ["Late", "Not Friendly", "Rough Ride"],
    1: ["Very Late", "Unprofessional", "Unsafe Driving", "Poor Service"],
  };

  useEffect(() => {
    if (!bookingId || !driverId) {
      Alert.alert("Error", "Missing booking information");
      navigation.goBack();
      return;
    }

    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch booking details
      const { data: bookingData, error: bookingError } = await supabase
        .from("bookings")
        .select(`
          *,
          commuter:commuters (
            id,
            first_name,
            last_name
          )
        `)
        .eq("id", bookingId)
        .single();

      if (bookingError) throw bookingError;
      setBooking(bookingData);

      // Fetch driver details
      const { data: driverData, error: driverError } = await supabase
        .from("drivers")
        .select(`
          id,
          first_name,
          last_name,
          profile_picture,
          driver_vehicles (
            vehicle_type,
            vehicle_color,
            plate_number
          )
        `)
        .eq("id", driverId)
        .single();

      if (driverError) throw driverError;
      setDriver(driverData);

      // Check if already rated
      if (bookingData.commuter_rating) {
        setRating(bookingData.commuter_rating);
        setReview(bookingData.commuter_review || "");
      }

    } catch (err) {
      console.log("❌ Error fetching data:", err);
      Alert.alert("Error", "Failed to load ride details");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitRating = async () => {
    if (rating === 0) {
      Alert.alert("Rate Your Driver", "Please select a rating to continue");
      return;
    }

    setSubmitting(true);

    try {
      // Update booking with rating
      const { error } = await supabase
        .from("bookings")
        .update({
          commuter_rating: rating,
          commuter_review: review.trim() || null,
          commuter_rated_at: new Date(),
          updated_at: new Date(),
        })
        .eq("id", bookingId);

      if (error) throw error;

      // Also add to driver_reviews table
      const { error: reviewError } = await supabase
        .from("driver_reviews")
        .insert({
          driver_id: driverId,
          commuter_id: booking.commuter_id,
          booking_id: bookingId,
          rating: rating,
          comment: review.trim() || null,
          created_at: new Date(),
        });

      if (reviewError) throw reviewError;

      Alert.alert(
        "Thank You!",
        "Your feedback has been submitted. Thank you for riding with us!",
        [
          {
            text: "OK",
            onPress: () => navigation.navigate("HomePage")
          }
        ]
      );

    } catch (err) {
      console.log("❌ Error submitting rating:", err);
      Alert.alert("Error", "Failed to submit rating. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    Alert.alert(
      "Skip Rating",
      "Are you sure you want to skip rating your driver? You can always rate them later from your ride history.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Skip",
          onPress: () => navigation.navigate("HomePage")
        }
      ]
    );
  };

  const toggleTag = (tag) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const renderStars = () => {
    return [1, 2, 3, 4, 5].map((star) => (
      <Pressable
        key={star}
        onPress={() => setRating(star)}
        style={styles.starButton}
      >
        <Ionicons
          name={star <= rating ? "star" : "star-outline"}
          size={40}
          color={star <= rating ? "#FFB37A" : "#D1D5DB"}
        />
      </Pressable>
    ));
  };

  const getRatingLabel = () => {
    switch (rating) {
      case 5: return "Excellent! ⭐⭐⭐⭐⭐";
      case 4: return "Great! ⭐⭐⭐⭐";
      case 3: return "Good ⭐⭐⭐";
      case 2: return "Fair ⭐⭐";
      case 1: return "Poor ⭐";
      default: return "Tap to rate";
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#183B5C" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView 
        style={[styles.container, { paddingTop: insets.top }]}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#183B5C" />
          </Pressable>
          <Text style={styles.headerTitle}>Rate Your Ride</Text>
          <Pressable onPress={handleSkip} style={styles.skipButton}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        </View>

        {/* Success Message */}
        <View style={styles.successCard}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={60} color="#10B981" />
          </View>
          <Text style={styles.successTitle}>Trip Completed!</Text>
          <Text style={styles.successMessage}>
            Thank you for riding with SakayNa! How was your experience with your driver?
          </Text>
        </View>

        {/* Driver Info */}
        {driver && (
          <View style={styles.driverCard}>
            <View style={styles.driverAvatar}>
              {driver.profile_picture ? (
                <Image source={{ uri: driver.profile_picture }} style={styles.driverImage} />
              ) : (
                <View style={styles.driverAvatarPlaceholder}>
                  <Ionicons name="person" size={30} color="#9CA3AF" />
                </View>
              )}
            </View>
            <View style={styles.driverInfo}>
              <Text style={styles.driverName}>
                {driver.first_name} {driver.last_name}
              </Text>
              {driver.driver_vehicles?.[0] && (
                <Text style={styles.vehicleInfo}>
                  {driver.driver_vehicles[0].vehicle_color || ''} {driver.driver_vehicles[0].vehicle_type || ''} • 
                  {driver.driver_vehicles[0].plate_number || ''}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Trip Summary */}
        {booking && (
          <View style={styles.tripSummary}>
            <View style={styles.locationItem}>
              <Ionicons name="location" size={16} color="#10B981" />
              <Text style={styles.locationText} numberOfLines={1}>
                {booking.pickup_location}
              </Text>
            </View>
            <View style={styles.locationItem}>
              <Ionicons name="flag" size={16} color="#EF4444" />
              <Text style={styles.locationText} numberOfLines={1}>
                {booking.dropoff_location}
              </Text>
            </View>
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Fare Paid:</Text>
              <Text style={styles.fareAmount}>₱{booking.fare?.toFixed(2) || "0.00"}</Text>
            </View>
          </View>
        )}

        {/* Rating Section */}
        <View style={styles.ratingSection}>
          <Text style={styles.ratingTitle}>Rate your driver</Text>
          <View style={styles.starsContainer}>
            {renderStars()}
          </View>
          <Text style={styles.ratingLabel}>{getRatingLabel()}</Text>
        </View>

        {/* Rating Tags - Show based on selected rating */}
        {rating > 0 && ratingTags[rating] && (
          <View style={styles.tagsSection}>
            <Text style={styles.tagsTitle}>What went well? (Optional)</Text>
            <View style={styles.tagsContainer}>
              {ratingTags[rating].map((tag) => (
                <Pressable
                  key={tag}
                  style={[
                    styles.tag,
                    selectedTags.includes(tag) && styles.tagSelected
                  ]}
                  onPress={() => toggleTag(tag)}
                >
                  <Text
                    style={[
                      styles.tagText,
                      selectedTags.includes(tag) && styles.tagTextSelected
                    ]}
                  >
                    {tag}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Review Input */}
        <View style={styles.reviewSection}>
          <Text style={styles.reviewTitle}>Write a review (Optional)</Text>
          <TextInput
            style={styles.reviewInput}
            placeholder="Share your experience with this driver..."
            placeholderTextColor="#9CA3AF"
            value={review}
            onChangeText={setReview}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Submit Button */}
        <Pressable
          style={[
            styles.submitButton,
            rating === 0 && styles.submitButtonDisabled
          ]}
          onPress={handleSubmitRating}
          disabled={rating === 0 || submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Ionicons name="star" size={20} color="#FFF" />
              <Text style={styles.submitButtonText}>Submit Rating</Text>
            </>
          )}
        </Pressable>

        {/* Maybe Later Button */}
        <Pressable style={styles.laterButton} onPress={handleSkip}>
          <Text style={styles.laterButtonText}>Maybe Later</Text>
        </Pressable>

        {/* Bottom padding */}
        <View style={{ height: 20 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  contentContainer: {
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 20,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#183B5C",
  },
  skipButton: {
    padding: 8,
  },
  skipText: {
    fontSize: 16,
    color: "#9CA3AF",
  },
  successCard: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  successIcon: {
    marginBottom: 10,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#10B981",
    marginBottom: 8,
  },
  successMessage: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
  },
  driverCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 15,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  driverAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#F3F4F6",
    marginRight: 15,
    overflow: "hidden",
  },
  driverAvatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  driverImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  vehicleInfo: {
    fontSize: 14,
    color: "#666",
  },
  tripSummary: {
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 15,
    marginBottom: 20,
  },
  locationItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  locationText: {
    fontSize: 14,
    color: "#333",
    flex: 1,
    marginLeft: 8,
  },
  fareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  fareLabel: {
    fontSize: 14,
    color: "#666",
  },
  fareAmount: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#183B5C",
  },
  ratingSection: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  ratingTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 15,
  },
  starsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 10,
  },
  starButton: {
    paddingHorizontal: 5,
  },
  ratingLabel: {
    fontSize: 16,
    color: "#666",
    marginTop: 5,
  },
  tagsSection: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tagsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 15,
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tag: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  tagSelected: {
    backgroundColor: "#183B5C",
    borderColor: "#183B5C",
  },
  tagText: {
    fontSize: 14,
    color: "#666",
  },
  tagTextSelected: {
    color: "#FFF",
  },
  reviewSection: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  reviewTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 10,
  },
  reviewInput: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 15,
    fontSize: 14,
    color: "#333",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    minHeight: 100,
  },
  submitButton: {
    backgroundColor: "#183B5C",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 10,
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: "#9CA3AF",
    opacity: 0.5,
  },
  submitButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  laterButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  laterButtonText: {
    fontSize: 14,
    color: "#9CA3AF",
    textDecorationLine: "underline",
  },
});