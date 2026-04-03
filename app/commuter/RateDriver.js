// screens/commuter/RateDriver.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";

export default function RateDriverScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const { bookingId } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [booking, setBooking] = useState(null);
  const [driver, setDriver] = useState(null);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);

  const ratingTags = {
    5: ["On Time", "Friendly", "Safe Driver", "Clean Vehicle", "Professional"],
    4: ["On Time", "Friendly", "Safe Driver"],
    3: ["OK Service", "On Time"],
    2: ["Late", "Unfriendly"],
    1: ["Very Late", "Rude", "Unsafe Driving"],
  };

  useEffect(() => {
    if (bookingId) {
      fetchBookingDetails();
    }
  }, [bookingId]);

  const fetchBookingDetails = async () => {
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          *,
          driver:drivers (
            id,
            first_name,
            last_name,
            profile_picture,
            vehicle_model,
            vehicle_color,
            vehicle_plate
          )
        `)
        .eq("id", bookingId)
        .single();

      if (error) throw error;

      setBooking(data);
      setDriver(data.driver);

    } catch (err) {
      console.log("Error fetching booking:", err);
      Alert.alert("Error", "Failed to load booking details");
    } finally {
      setLoading(false);
    }
  };

  const handleTagSelect = (tag) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleSubmitRating = async () => {
    if (rating === 0) {
      Alert.alert("Error", "Please select a rating");
      return;
    }

    setSubmitting(true);

    try {
      // Update booking with rating
      const { error: bookingError } = await supabase
        .from("bookings")
        .update({
          commuter_rating: rating,
          commuter_review: feedback,
          commuter_rated_at: new Date(),
        })
        .eq("id", bookingId);

      if (bookingError) throw bookingError;

      // Create driver review
      const { error: reviewError } = await supabase
        .from("driver_reviews")
        .insert([
          {
            driver_id: driver.id,
            commuter_id: booking.commuter_id,
            booking_id: bookingId,
            rating: rating,
            comment: feedback,
            tags: selectedTags,
            created_at: new Date(),
          },
        ]);

      if (reviewError) throw reviewError;

      // Update driver's average rating
      const { data: reviews, error: reviewsError } = await supabase
        .from("driver_reviews")
        .select("rating")
        .eq("driver_id", driver.id);

      if (!reviewsError && reviews) {
        const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
        
        await supabase
          .from("drivers")
          .update({ average_rating: avgRating })
          .eq("id", driver.id);
      }

      Alert.alert(
        "Thank You!",
        "Your rating has been submitted successfully.",
        [
          {
            text: "OK",
            onPress: () => navigation.navigate("BookingDetails", { id: bookingId }),
          },
        ]
      );

    } catch (err) {
      console.log("Error submitting rating:", err);
      Alert.alert("Error", "Failed to submit rating");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#183B5C" />
        </Pressable>
        <Text style={styles.headerTitle}>Rate Your Driver</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Driver Info */}
        <View style={styles.driverCard}>
          <View style={styles.driverAvatar}>
            {driver?.profile_picture ? (
              <Image source={{ uri: driver.profile_picture }} style={styles.driverImage} />
            ) : (
              <Ionicons name="person" size={50} color="#9CA3AF" />
            )}
          </View>
          <Text style={styles.driverName}>
            {driver?.first_name} {driver?.last_name}
          </Text>
          <Text style={styles.driverVehicle}>
            {driver?.vehicle_model} • {driver?.vehicle_color} • {driver?.vehicle_plate}
          </Text>
          <Text style={styles.tripDate}>
            Trip on {formatDate(booking?.created_at)}
          </Text>
        </View>

        {/* Rating Stars */}
        <View style={styles.ratingContainer}>
          <Text style={styles.ratingTitle}>How was your ride?</Text>
          <View style={styles.starsContainer}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable key={star} onPress={() => setRating(star)}>
                <Ionicons
                  name={rating >= star ? "star" : "star-outline"}
                  size={48}
                  color={rating >= star ? "#FFB37A" : "#D1D5DB"}
                />
              </Pressable>
            ))}
          </View>
          <Text style={styles.ratingSubtext}>
            {rating === 5 ? "Excellent!" :
             rating === 4 ? "Good" :
             rating === 3 ? "Average" :
             rating === 2 ? "Poor" :
             rating === 1 ? "Very Poor" :
             "Tap a star to rate"}
          </Text>
        </View>

        {/* Rating Tags */}
        {rating > 0 && ratingTags[rating] && (
          <View style={styles.tagsContainer}>
            <Text style={styles.tagsTitle}>What did you like?</Text>
            <View style={styles.tagsGrid}>
              {ratingTags[rating].map((tag) => (
                <Pressable
                  key={tag}
                  style={[
                    styles.tag,
                    selectedTags.includes(tag) && styles.tagSelected,
                  ]}
                  onPress={() => handleTagSelect(tag)}
                >
                  <Text
                    style={[
                      styles.tagText,
                      selectedTags.includes(tag) && styles.tagTextSelected,
                    ]}
                  >
                    {tag}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Feedback Input */}
        <View style={styles.feedbackContainer}>
          <Text style={styles.feedbackLabel}>Write a review (optional)</Text>
          <TextInput
            style={styles.feedbackInput}
            placeholder="Share your experience with this driver..."
            value={feedback}
            onChangeText={setFeedback}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Submit Button */}
        <View style={styles.buttonContainer}>
          <Pressable
            style={[styles.submitButton, (rating === 0 || submitting) && styles.submitButtonDisabled]}
            onPress={handleSubmitRating}
            disabled={rating === 0 || submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.submitButtonText}>Submit Rating</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.skipButton}
            onPress={() => navigation.replace("HomeScreen")}
          >
            <Text style={styles.skipButtonText}>Skip</Text>
          </Pressable>
        </View>

        {/* Info Text */}
        <Text style={styles.infoText}>
          Your feedback helps us improve our service and maintain driver quality.
        </Text>
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
  driverCard: {
    alignItems: "center",
    backgroundColor: "#FFF",
    margin: 20,
    padding: 20,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  driverAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  driverImage: {
    width: 76,
    height: 76,
    borderRadius: 38,
  },
  driverName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  driverVehicle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  tripDate: {
    fontSize: 12,
    color: "#999",
  },
  ratingContainer: {
    alignItems: "center",
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginBottom: 15,
    padding: 20,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  ratingTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 15,
  },
  starsContainer: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  ratingSubtext: {
    fontSize: 14,
    color: "#666",
  },
  tagsContainer: {
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginBottom: 15,
    padding: 20,
    borderRadius: 16,
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
  tagsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tag: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  tagSelected: {
    backgroundColor: "#183B5C",
  },
  tagText: {
    fontSize: 13,
    color: "#666",
  },
  tagTextSelected: {
    color: "#FFF",
  },
  feedbackContainer: {
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 20,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  feedbackLabel: {
    fontSize: 14,
    color: "#666",
    marginBottom: 10,
  },
  feedbackInput: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 15,
    fontSize: 14,
    color: "#333",
    minHeight: 100,
  },
  buttonContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  submitButton: {
    backgroundColor: "#183B5C",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  submitButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  submitButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  skipButton: {
    padding: 12,
    alignItems: "center",
  },
  skipButtonText: {
    color: "#666",
    fontSize: 14,
  },
  infoText: {
    textAlign: "center",
    fontSize: 12,
    color: "#999",
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
});