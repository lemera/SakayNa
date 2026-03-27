// screens/commuter/RateDriverScreen.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from 'expo-haptics';

export default function RateDriverScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const { driverId, driverName, bookingId, cancellationReason } = route.params || {};

  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [review, setReview] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [showReportForm, setShowReportForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [userId, setUserId] = useState(null);
  const [driverDetails, setDriverDetails] = useState(null);

  const ratingOptions = [
    { value: 1, label: "Very Poor", icon: "sad-outline", color: "#EF4444", description: "Very unsatisfied with service" },
    { value: 2, label: "Poor", icon: "frown-outline", color: "#F59E0B", description: "Below expectations" },
    { value: 3, label: "Average", icon: "meh-outline", color: "#F59E0B", description: "Met expectations" },
    { value: 4, label: "Good", icon: "smile-outline", color: "#10B981", description: "Above expectations" },
    { value: 5, label: "Excellent", icon: "happy-outline", color: "#10B981", description: "Very satisfied" },
  ];

  const reportReasons = [
    "Driver was rude or disrespectful",
    "Driver cancelled multiple times",
    "Driver asked for cash payment outside app",
    "Driver was not the person in the profile",
    "Driver's vehicle was unsafe",
    "Driver discriminated against me",
    "Driver harassed me",
    "Other issue",
  ];

  useEffect(() => {
    getUserId();
    fetchDriverDetails();
  }, []);

  const getUserId = async () => {
    const id = await AsyncStorage.getItem("user_id");
    setUserId(id);
  };

  const fetchDriverDetails = async () => {
    try {
      const { data, error } = await supabase
        .from("drivers")
        .select(`
          id,
          first_name,
          last_name,
          profile_picture,
          average_rating,
          total_reviews,
          driver_vehicles (
            vehicle_type,
            vehicle_color,
            plate_number
          )
        `)
        .eq("id", driverId)
        .single();

      if (!error && data) {
        setDriverDetails(data);
      }
    } catch (err) {
      console.log("Error fetching driver details:", err);
    }
  };

  const handleRatingSelect = (value) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRating(value);
    if (value <= 2) {
      setShowReportForm(true);
    } else {
      setShowReportForm(false);
      setReportReason("");
      setOtherReason("");
    }
  };

  const handleSubmitRating = async () => {
    if (rating === 0) {
      Alert.alert("Rating Required", "Please select a rating for the driver.");
      return;
    }

    setSubmitting(true);

    try {
      // Save driver review
      const finalReview = review || (cancellationReason ? 
        `Driver cancelled booking. Reason: ${cancellationReason}` : 
        `Rated ${rating} star${rating > 1 ? 's' : ''}`);

      const { data: reviewData, error: reviewError } = await supabase
        .from("driver_reviews")
        .insert([
          {
            driver_id: driverId,
            commuter_id: userId,
            booking_id: bookingId,
            rating: rating,
            comment: finalReview,
            created_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (reviewError) throw reviewError;

      // If there's a report, save it to driver_reports table
      const finalReportReason = reportReason === "Other issue" ? otherReason : reportReason;
      if (finalReportReason) {
        const { error: reportError } = await supabase
          .from("driver_reports")
          .insert([
            {
              driver_id: driverId,
              commuter_id: userId,
              booking_id: bookingId,
              reason: finalReportReason,
              description: review,
              status: "pending",
              created_at: new Date().toISOString(),
            },
          ]);

        if (reportError) {
          console.log("Error saving report:", reportError);
        } else {
          console.log("✅ Report saved successfully");
        }
      }

      // Update driver's average rating
      await updateDriverAverageRating(driverId);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      Alert.alert(
        "Thank You!",
        "Your feedback helps us improve the quality of our service.",
        [
          {
            text: "OK",
            onPress: () => navigation.replace("Home"),
          },
        ]
      );
      
    } catch (err) {
      console.log("Error submitting rating:", err);
      Alert.alert("Error", "Failed to submit rating. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const updateDriverAverageRating = async (driverId) => {
    try {
      const { data: reviews, error } = await supabase
        .from("driver_reviews")
        .select("rating")
        .eq("driver_id", driverId);

      if (error) throw error;

      if (reviews && reviews.length > 0) {
        const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
        const averageRating = totalRating / reviews.length;

        await supabase
          .from("drivers")
          .update({ 
            average_rating: parseFloat(averageRating.toFixed(1)),
            total_reviews: reviews.length 
          })
          .eq("id", driverId);
      }
    } catch (err) {
      console.log("Error updating driver rating:", err);
    }
  };

  const handleSkip = () => {
    Alert.alert(
      "Skip Rating",
      "Are you sure you want to skip rating this driver?\n\nYour feedback helps us maintain quality service.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Skip",
          onPress: () => navigation.replace("Home"),
        },
        {
          text: "Rate Now",
          onPress: () => {},
        },
      ]
    );
  };

  const getRatingIcon = () => {
    if (hoverRating > 0) {
      const option = ratingOptions.find(o => o.value === hoverRating);
      return option?.icon || "star-outline";
    }
    if (rating > 0) {
      const option = ratingOptions.find(o => o.value === rating);
      return option?.icon || "star-outline";
    }
    return "star-outline";
  };

  const vehicle = driverDetails?.driver_vehicles?.[0] || {};

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.header}>
        <Pressable onPress={handleSkip} style={styles.skipButton}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Rate Your Driver</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          {/* Driver Info */}
          <View style={styles.driverInfo}>
            <View style={styles.driverIcon}>
              {driverDetails?.profile_picture ? (
                <Image source={{ uri: driverDetails.profile_picture }} style={styles.driverImage} />
              ) : (
                <Ionicons name="person-circle" size={80} color="#183B5C" />
              )}
            </View>
            <Text style={styles.driverName}>
              {driverDetails?.first_name} {driverDetails?.last_name || driverName || "Driver"}
            </Text>
            {vehicle.plate_number && (
              <View style={styles.vehicleInfo}>
                <Ionicons name="car-outline" size={14} color="#666" />
                <Text style={styles.vehicleText}>
                  {vehicle.vehicle_color} {vehicle.vehicle_type} • {vehicle.plate_number}
                </Text>
              </View>
            )}
            {cancellationReason && (
              <View style={styles.cancellationBadge}>
                <Ionicons name="alert-circle" size={16} color="#EF4444" />
                <Text style={styles.cancellationText}>
                  Driver cancelled: {cancellationReason}
                </Text>
              </View>
            )}
          </View>

          {/* Rating Question */}
          <Text style={styles.questionText}>
            How was your experience with this driver?
          </Text>

          {/* Star Rating */}
          <View style={styles.starContainer}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => handleRatingSelect(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
              >
                <Ionicons
                  name={star <= (hoverRating || rating) ? "star" : "star-outline"}
                  size={44}
                  color={star <= (hoverRating || rating) ? "#FFB800" : "#D1D5DB"}
                  style={styles.star}
                />
              </TouchableOpacity>
            ))}
          </View>

          {/* Rating Description */}
          {rating > 0 && (
            <View style={styles.ratingDescription}>
              <Text style={styles.ratingLabel}>
                {ratingOptions.find(o => o.value === rating)?.label}
              </Text>
              <Text style={styles.ratingSubtext}>
                {ratingOptions.find(o => o.value === rating)?.description}
              </Text>
            </View>
          )}

          {/* Review Input */}
          {rating > 0 && (
            <View style={styles.reviewContainer}>
              <Text style={styles.reviewLabel}>
                Share your experience (optional)
              </Text>
              <TextInput
                style={styles.reviewInput}
                placeholder="What happened? Your feedback helps us improve..."
                value={review}
                onChangeText={setReview}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={500}
              />
              <Text style={styles.charCount}>{review.length}/500</Text>
            </View>
          )}

          {/* Report Form (for low ratings) */}
          {showReportForm && rating <= 2 && (
            <View style={styles.reportContainer}>
              <View style={styles.reportHeader}>
                <Ionicons name="flag-outline" size={20} color="#EF4444" />
                <Text style={styles.reportHeaderText}>Report a Problem</Text>
              </View>
              <Text style={styles.reportDescription}>
                Help us understand what went wrong. Your report will be reviewed by our team.
              </Text>
              
              <View style={styles.reportReasonsContainer}>
                {reportReasons.map((reason, index) => (
                  <Pressable
                    key={index}
                    style={[
                      styles.reportReasonChip,
                      reportReason === reason && styles.reportReasonChipSelected,
                    ]}
                    onPress={() => setReportReason(reason)}
                  >
                    <Text
                      style={[
                        styles.reportReasonText,
                        reportReason === reason && styles.reportReasonTextSelected,
                      ]}
                    >
                      {reason}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {reportReason === "Other issue" && (
                <TextInput
                  style={[styles.reviewInput, { marginTop: 15, minHeight: 80 }]}
                  placeholder="Please describe the issue in detail..."
                  value={otherReason}
                  onChangeText={setOtherReason}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              )}
            </View>
          )}

          {/* Submit Button */}
          <View style={styles.actionButtons}>
            <Pressable
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleSubmitRating}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                  <Text style={styles.submitButtonText}>Submit Rating</Text>
                </>
              )}
            </Pressable>
          </View>

          {/* Footer Note */}
          <Text style={styles.footerNote}>
            Your feedback helps us maintain quality service and address issues appropriately.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
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
  skipButton: {
    padding: 8,
  },
  skipText: {
    fontSize: 16,
    color: "#666",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#183B5C",
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    padding: 20,
  },
  driverInfo: {
    alignItems: "center",
    marginBottom: 30,
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  driverIcon: {
    marginBottom: 12,
  },
  driverImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  driverName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 6,
  },
  vehicleInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  vehicleText: {
    fontSize: 13,
    color: "#666",
  },
  cancellationBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  cancellationText: {
    fontSize: 12,
    color: "#EF4444",
  },
  questionText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
    marginBottom: 20,
  },
  starContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 20,
  },
  star: {
    marginHorizontal: 8,
  },
  ratingDescription: {
    alignItems: "center",
    marginBottom: 25,
  },
  ratingLabel: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#183B5C",
    marginBottom: 4,
  },
  ratingSubtext: {
    fontSize: 13,
    color: "#666",
  },
  reviewContainer: {
    marginBottom: 20,
  },
  reviewLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 10,
  },
  reviewInput: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: "#333",
    minHeight: 100,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  charCount: {
    fontSize: 11,
    color: "#999",
    textAlign: "right",
    marginTop: 5,
  },
  reportContainer: {
    marginBottom: 20,
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: "#FEE2E2",
    backgroundColor: "#FEF2F2",
  },
  reportHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  reportHeaderText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#EF4444",
  },
  reportDescription: {
    fontSize: 13,
    color: "#666",
    marginBottom: 15,
    lineHeight: 18,
  },
  reportReasonsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  reportReasonChip: {
    backgroundColor: "#FFF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#FEE2E2",
  },
  reportReasonChipSelected: {
    backgroundColor: "#EF4444",
    borderColor: "#EF4444",
  },
  reportReasonText: {
    fontSize: 12,
    color: "#EF4444",
  },
  reportReasonTextSelected: {
    color: "#FFF",
  },
  actionButtons: {
    marginTop: 10,
    marginBottom: 20,
  },
  submitButton: {
    backgroundColor: "#183B5C",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  footerNote: {
    fontSize: 11,
    color: "#999",
    textAlign: "center",
    marginTop: 10,
    lineHeight: 16,
  },
});