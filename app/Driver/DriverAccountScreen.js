import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  Image,
  Switch,
  Linking,
  KeyboardAvoidingView, // ← Add this
  Platform, // ← Add this
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
// import * as DocumentPicker from "expo-document-picker";

export default function DriverAccountScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [driverId, setDriverId] = useState(null);
  const [driver, setDriver] = useState(null);
  const [driverStats, setDriverStats] = useState({
    totalTrips: 0,
    totalEarnings: 0,
    avgRating: 0,
    memberSince: null,
  });
  const [vehicle, setVehicle] = useState(null);
  const [documents, setDocuments] = useState(null);
  const [activeSubscription, setActiveSubscription] = useState(null);

  // Modal states
  const [editProfileModal, setEditProfileModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const [vehicleModal, setVehicleModal] = useState(false);
  const [editPlate, setEditPlate] = useState("");
  const [editVehicleType, setEditVehicleType] = useState("motorcycle");
  const [editVehicleColor, setEditVehicleColor] = useState("");

  const [settingsModal, setSettingsModal] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const [language, setLanguage] = useState("english");

  // Fetch driver ID
  useFocusEffect(
    useCallback(() => {
      const getDriverId = async () => {
        const id = await AsyncStorage.getItem("user_id");
        setDriverId(id);
      };
      getDriverId();
    }, []),
  );

  // Fetch all driver data
  useEffect(() => {
    if (driverId) {
      loadDriverData();
    }
  }, [driverId]);
  // Add this function BEFORE loadDriverData (around line 65-70)
  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("driver_settings")
        .select("*")
        .eq("driver_id", driverId)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        setSettings({
          notifications_enabled: data.notifications_enabled,
          dark_mode_enabled: data.dark_mode_enabled,
          language: data.language,
        });
        setNotificationsEnabled(data.notifications_enabled);
        setDarkModeEnabled(data.dark_mode_enabled);
        setLanguage(data.language);
      } else {
        // Create default settings if none exists
        await createDefaultSettings();
      }
    } catch (err) {
      console.log("Error fetching settings:", err.message);
    }
  };

  const createDefaultSettings = async () => {
    try {
      const { error } = await supabase.from("driver_settings").insert([
        {
          driver_id: driverId,
          notifications_enabled: true,
          dark_mode_enabled: false,
          language: "english",
        },
      ]);

      if (error) throw error;
    } catch (err) {
      console.log("Error creating settings:", err.message);
    }
  };

  const loadDriverData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchDriverProfile(),
        fetchDriverStats(),
        fetchVehicleInfo(),
        fetchDocuments(),
        fetchActiveSubscription(),
      ]);
    } catch (err) {
      console.log("Error loading driver data:", err);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDriverData();
    setRefreshing(false);
  };

  const fetchDriverProfile = async () => {
    try {
      const { data, error } = await supabase
        .from("drivers")
        .select(
          `
        id,
        first_name,
        middle_name,
        last_name,
        phone,
        email,
        profile_picture,
        status,
        is_active,
        created_at
      `,
        )
        .eq("id", driverId)
        .single();

      if (error) throw error;

      // Debug: See what's actually stored in database
      console.log("Raw profile_picture from DB:", data.profile_picture);

      // Fix the profile picture URL if needed
      if (data.profile_picture) {
        // Check if it's already a full URL
        if (!data.profile_picture.startsWith("http")) {
          // If it's just a filename, construct the full URL
          const { data: urlData } = supabase.storage
            .from("driver-profiles")
            .getPublicUrl(data.profile_picture);

          data.profile_picture = urlData.publicUrl;
        }

        // Add timestamp for cache busting
        data.profile_picture = data.profile_picture + "?t=" + Date.now();
      }

      setDriver(data);

      setEditName(
        `${data.first_name} ${data.middle_name || ""} ${data.last_name}`,
      );
      setEditPhone(data.phone || "");
      setEditEmail(data.email || "");
    } catch (err) {
      console.log("Error fetching profile:", err.message);
    }
  };

  const fetchDriverStats = async () => {
    try {
      // Get total trips and earnings Image
      const { data: bookings, error: bookingsError } = await supabase
        .from("bookings")
        .select("actual_fare, commuter_rating")
        .eq("driver_id", driverId)
        .eq("status", "completed");

      if (bookingsError) throw bookingsError;

      const totalTrips = bookings?.length || 0;
      const totalEarnings =
        bookings?.reduce((sum, b) => sum + (b.actual_fare || 0), 0) || 0;

      // Calculate average rating
      const ratings =
        bookings
          ?.filter((b) => b.commuter_rating)
          .map((b) => b.commuter_rating) || [];
      const avgRating =
        ratings.length > 0
          ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
          : 0;

      setDriverStats({
        totalTrips,
        totalEarnings,
        avgRating,
        memberSince: driver?.created_at,
      });
    } catch (err) {
      console.log("Error fetching stats:", err.message);
    }
  };

  const fetchVehicleInfo = async () => {
    try {
      const { data, error } = await supabase
        .from("driver_vehicles")
        .select("*")
        .eq("driver_id", driverId)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        setVehicle(data);
        setEditPlate(data.plate_number || "");
        setEditVehicleType(data.vehicle_type || "motorcycle");
        setEditVehicleColor(data.vehicle_color || "");
      }
    } catch (err) {
      console.log("Error fetching vehicle:", err.message);
    }
  };

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from("driver_documents")
        .select("*")
        .eq("driver_id", driverId)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      setDocuments(data);
    } catch (err) {
      console.log("Error fetching documents:", err.message);
    }
  };

  const fetchActiveSubscription = async () => {
    try {
      const { data, error } = await supabase
        .from("driver_subscriptions")
        .select(
          `
          *,
          subscription_plans (
            plan_name,
            plan_type,
            price
          )
        `,
        )
        .eq("driver_id", driverId)
        .eq("status", "active")
        .gte("end_date", new Date().toISOString())
        .order("end_date", { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      setActiveSubscription(data);
    } catch (err) {
      console.log("Error fetching subscription:", err.message);
    }
  };

  const handleUpdateProfile = async () => {
    try {
      // Parse name loadDriverData
      const nameParts = editName.split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      const { error } = await supabase
        .from("drivers")
        .update({
          first_name: firstName,
          last_name: lastName,
          phone: editPhone,
          email: editEmail,
          updated_at: new Date(),
        })
        .eq("id", driverId);

      if (error) throw error;

      Alert.alert("Success", "Profile updated successfully");
      setEditProfileModal(false);
      fetchDriverProfile();
    } catch (err) {
      console.log("Error updating profile:", err.message);
      Alert.alert("Error", "Failed to update profile");
    }
  };

  const handleUpdateVehicle = async () => {
    try {
      if (vehicle) {
        // Update existing vehicle
        const { error } = await supabase
          .from("driver_vehicles")
          .update({
            plate_number: editPlate,
            vehicle_type: editVehicleType,
            vehicle_color: editVehicleColor,
            updated_at: new Date(),
          })
          .eq("driver_id", driverId);

        if (error) throw error;
      } else {
        // Insert new vehicle
        const { error } = await supabase.from("driver_vehicles").insert([
          {
            driver_id: driverId,
            plate_number: editPlate,
            vehicle_type: editVehicleType,
            vehicle_color: editVehicleColor,
          },
        ]);

        if (error) throw error;
      }

      Alert.alert("Success", "Vehicle information updated");
      setVehicleModal(false);
      fetchVehicleInfo();
    } catch (err) {
      console.log("Error updating vehicle:", err.message);
      Alert.alert("Error", "Failed to update vehicle information");
    }
  };

  const handleSignOut = async () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          try {
            await AsyncStorage.removeItem("user_id");
            await supabase.auth.signOut();
            navigation.replace("UserType");
          } catch (err) {
            console.log("Error signing out:", err.message);
          }
        },
      },
    ]);
  };

  const pickImage = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Please enable photo access");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const image = result.assets[0];

        // Alert.alert("Uploading", "Please wait..."); car

        const fileName = `${Date.now()}.jpg`;
        const filePath = `${driverId}/${fileName}`;

        // Convert image to arrayBuffer instead of blob
        const response = await fetch(image.uri);
        const arrayBuffer = await response.arrayBuffer();

        // Upload using arrayBuffer
        const { data, error } = await supabase.storage
          .from("driver-profiles")
          .upload(filePath, arrayBuffer, {
            contentType: "image/jpeg",
            upsert: true,
          });

        if (error) throw error;

        // Get public URL
        const { data: urlData } = supabase.storage
          .from("driver-profiles")
          .getPublicUrl(filePath);

        console.log("Upload successful:", urlData.publicUrl);

        // Update database
        const { error: updateError } = await supabase
          .from("drivers")
          .update({
            profile_picture: urlData.publicUrl,
            updated_at: new Date(),
          })
          .eq("id", driverId);

        if (updateError) throw updateError;

        // Update state
        setDriver((prevDriver) => ({
          ...prevDriver,
          profile_picture: urlData.publicUrl + "?t=" + Date.now(),
        }));

        Alert.alert("Success", "Profile picture updated!");
      }
    } catch (err) {
      console.log("Error:", err);
      Alert.alert("Upload Failed", err.message);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "approved":
        return "#10B981";
      case "pending":
        return "#F59E0B";
      case "under_review":
        return "#3B82F6";
      case "rejected":
        return "#EF4444";
      case "suspended":
        return "#EF4444";
      default:
        return "#6B7280";
    }
  };
  // pickImage fetchDriverProfile
  const getStatusIcon = (status) => {
    switch (status) {
      case "approved":
        return "checkmark-circle";
      case "pending":
        return "time";
      case "under_review":
        return "eye";
      case "rejected":
        return "close-circle";
      case "suspended":
        return "alert-circle";
      default:
        return "information-circle";
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (loading && !refreshing) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#F5F7FA",
        }}
      >
        <ActivityIndicator size="large" color="#183B5C" />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F5F7FA" }}
      contentContainerStyle={{ paddingBottom: 30 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header with Cover */}
      <View
        style={{
          backgroundColor: "#183B5C",
          paddingTop: insets.top + 20,
          paddingBottom: 60,
          paddingHorizontal: 20,
          borderBottomLeftRadius: 30,
          borderBottomRightRadius: 30,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Pressable onPress={() => navigation.goBack()} style={{ width: 40 }}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </Pressable>

          <Text style={{ fontSize: 20, fontWeight: "bold", color: "#FFF" }}>
            My Account
          </Text>

          <Pressable onPress={() => setSettingsModal(true)}>
            <Ionicons name="settings-outline" size={24} color="#FFF" />
          </Pressable>
        </View>
      </View>

      {/* Profile Section - Overlapping Card */}
      <View
        style={{
          marginHorizontal: 20,
          marginTop: -40,
          backgroundColor: "#FFF",
          borderRadius: 24,
          padding: 20,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 12,
          elevation: 5,
        }}
      >
        <View style={{ alignItems: "center" }}>
          {/* Profile Picture */}
          <Pressable
            onPress={pickImage}
            style={{ position: "relative", marginBottom: 10 }}
          >
            <View
              style={{
                width: 100,
                height: 100,
                borderRadius: 50,
                backgroundColor: "#E5E7EB",
                justifyContent: "center",
                alignItems: "center",
                borderWidth: 4,
                borderColor: "#FFF",
              }}
            >
              {driver?.profile_picture ? (
                <Image
                  source={{
                    uri: driver.profile_picture,
                  }}
                  style={{ width: "100%", height: "100%", borderRadius: 50 }}
                  onLoad={() =>
                    console.log(
                      "✅ Image loaded successfully:",
                      driver.profile_picture,
                    )
                  }
                  onError={(e) => {
                    console.log("❌ Image load error:", e.nativeEvent.error);
                    console.log("❌ Failed URL:", driver.profile_picture);
                  }}
                />
              ) : (
                <Ionicons name="person" size={50} color="#9CA3AF" />
              )}
            </View>
            {/* Camera icon */}
            <View
              style={{
                position: "absolute",
                bottom: 0,
                right: 0,
                backgroundColor: "#183B5C",
                width: 30,
                height: 30,
                borderRadius: 15,
                justifyContent: "center",
                alignItems: "center",
                borderWidth: 2,
                borderColor: "#FFF",
              }}
            >
              <Ionicons name="camera" size={16} color="#FFF" />
            </View>
          </Pressable>

          {/* Name and Status */}
          <Text
            style={{
              fontSize: 22,
              fontWeight: "bold",
              color: "#333",
              marginBottom: 5,
            }}
          >
            {driver ? `${driver.first_name} ${driver.last_name}` : "Loading..."}
          </Text>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 15,
            }}
          >
            <View
              style={{
                backgroundColor: getStatusColor(driver?.status) + "20",
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderRadius: 20,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Ionicons
                name={getStatusIcon(driver?.status)}
                size={14}
                color={getStatusColor(driver?.status)}
                style={{ marginRight: 4 }}
              />
              <Text
                style={{
                  color: getStatusColor(driver?.status),
                  fontWeight: "600",
                  textTransform: "capitalize",
                }}
              >
                {driver?.status || "Unknown"}
              </Text>
            </View>
          </View>

          {/* Edit Profile Button */}
          <Pressable
            style={{
              backgroundColor: "#F3F4F6",
              paddingHorizontal: 20,
              paddingVertical: 10,
              borderRadius: 20,
              flexDirection: "row",
              alignItems: "center",
            }}
            onPress={() => setEditProfileModal(true)}
          >
            <Ionicons name="pencil" size={16} color="#183B5C" />
            <Text
              style={{ color: "#183B5C", fontWeight: "600", marginLeft: 5 }}
            >
              Edit Profile
            </Text>
          </Pressable>
        </View>

        {/* Stats Grid */}
        <View style={{ flexDirection: "row", marginTop: 20, gap: 10 }}>
          <View
            style={{
              flex: 1,
              backgroundColor: "#F9FAFB",
              borderRadius: 16,
              padding: 12,
              alignItems: "center",
            }}
          >
            <Text
              style={{ fontSize: 20, fontWeight: "bold", color: "#183B5C" }}
            >
              {driverStats.totalTrips}
            </Text>
            <Text style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
              Total Trips
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              backgroundColor: "#F9FAFB",
              borderRadius: 16,
              padding: 12,
              alignItems: "center",
            }}
          >
            <Text
              style={{ fontSize: 20, fontWeight: "bold", color: "#183B5C" }}
            >
              ₱{driverStats.totalEarnings.toFixed(0)}
            </Text>
            <Text style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
              Lifetime Earnings
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              backgroundColor: "#F9FAFB",
              borderRadius: 16,
              padding: 12,
              alignItems: "center",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text
                style={{ fontSize: 20, fontWeight: "bold", color: "#183B5C" }}
              >
                {driverStats.avgRating.toFixed(1)}
              </Text>
              <Ionicons
                name="star"
                size={16}
                color="#F59E0B"
                style={{ marginLeft: 2 }}
              />
            </View>
            <Text style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
              Rating
            </Text>
          </View>
        </View>
      </View>

      {/* Contact Information */}
      <View
        style={{
          marginHorizontal: 20,
          marginTop: 20,
          backgroundColor: "#FFF",
          borderRadius: 24,
          padding: 20,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: "bold",
            color: "#333",
            marginBottom: 15,
          }}
        >
          📞 Contact Information
        </Text>

        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 12, color: "#666", marginBottom: 2 }}>
            Phone Number
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Ionicons
              name="call-outline"
              size={16}
              color="#183B5C"
              style={{ marginRight: 8 }}
            />
            <Text style={{ fontSize: 16, color: "#333" }}>
              {driver?.phone || "Not provided"}
            </Text>
          </View>
        </View>

        <View>
          <Text style={{ fontSize: 12, color: "#666", marginBottom: 2 }}>
            Email Address
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Ionicons
              name="mail-outline"
              size={16}
              color="#183B5C"
              style={{ marginRight: 8 }}
            />
            <Text style={{ fontSize: 16, color: "#333" }}>
              {driver?.email || "Not provided"}
            </Text>
          </View>
        </View>
      </View>

      {/* Vehicle Information */}
      <Pressable
        style={{
          marginHorizontal: 20,
          marginTop: 20,
          backgroundColor: "#FFF",
          borderRadius: 24,
          padding: 20,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        }}
        onPress={() => setVehicleModal(true)}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 15,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "bold", color: "#333" }}>
            🚲 Vehicle Information
          </Text>
          <Ionicons name="pencil" size={18} color="#183B5C" />
        </View>

        {vehicle ? (
          <>
            <View style={{ flexDirection: "row", marginBottom: 10 }}>
              <Text style={{ width: 100, color: "#666" }}>Plate Number</Text>
              <Text style={{ color: "#333", fontWeight: "500" }}>
                {vehicle.plate_number}
              </Text>
            </View>
            <View style={{ flexDirection: "row", marginBottom: 10 }}>
              <Text style={{ width: 100, color: "#666" }}>Vehicle Type</Text>
              <Text
                style={{
                  color: "#333",
                  fontWeight: "500",
                  textTransform: "capitalize",
                }}
              >
                {vehicle.vehicle_type}
              </Text>
            </View>
            <View style={{ flexDirection: "row" }}>
              <Text style={{ width: 100, color: "#666" }}>Color</Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    backgroundColor: vehicle.vehicle_color || "#999",
                    marginRight: 6,
                  }}
                />
                <Text style={{ color: "#333", fontWeight: "500" }}>
                  {vehicle.vehicle_color || "Not specified"}
                </Text>
              </View>
            </View>
          </>
        ) : (
          <View style={{ alignItems: "center", padding: 20 }}>
            <Ionicons name="bicycle" size={40} color="#D1D5DB" />
            <Text style={{ color: "#9CA3AF", marginTop: 10 }}>
              No vehicle information added
            </Text>
            <Text style={{ color: "#183B5C", marginTop: 5 }}>
              Tap to add vehicle details
            </Text>
          </View>
        )}
      </Pressable>

      {/* Documents Status */}
      <View
        style={{
          marginHorizontal: 20,
          marginTop: 20,
          backgroundColor: "#FFF",
          borderRadius: 24,
          padding: 20,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: "bold",
            color: "#333",
            marginBottom: 15,
          }}
        >
          📄 Documents
        </Text>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <Text style={{ color: "#666" }}>License</Text>
          {documents?.license_number ? (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={{ color: "#10B981", marginLeft: 4 }}>Verified</Text>
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="alert-circle" size={16} color="#F59E0B" />
              <Text style={{ color: "#F59E0B", marginLeft: 4 }}>Pending</Text>
            </View>
          )}
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <Text style={{ color: "#666" }}>OR/CR</Text>
          {documents?.orcr_image_url ? (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={{ color: "#10B981", marginLeft: 4 }}>Uploaded</Text>
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="alert-circle" size={16} color="#F59E0B" />
              <Text style={{ color: "#F59E0B", marginLeft: 4 }}>Missing</Text>
            </View>
          )}
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: "#666" }}>Selfie with ID</Text>
          {documents?.selfie_with_id_url ? (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={{ color: "#10B981", marginLeft: 4 }}>Uploaded</Text>
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="alert-circle" size={16} color="#F59E0B" />
              <Text style={{ color: "#F59E0B", marginLeft: 4 }}>Missing</Text>
            </View>
          )}
        </View>

        <Pressable
          style={{
            backgroundColor: "#F3F4F6",
            padding: 12,
            borderRadius: 12,
            alignItems: "center",
            marginTop: 15,
          }}
          onPress={() => navigation.navigate("DriverVerificationScreen")}
        >
          <Text style={{ color: "#183B5C", fontWeight: "600" }}>
            Manage Documents
          </Text>
        </Pressable>
      </View>

      {/* Subscription Info */}
      <View
        style={{
          marginHorizontal: 20,
          marginTop: 20,
          backgroundColor: "#FFF",
          borderRadius: 24,
          padding: 20,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: "bold",
            color: "#333",
            marginBottom: 15,
          }}
        >
          ⭐ Subscription
        </Text>

        {activeSubscription ? (
          <>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <Text style={{ color: "#666" }}>Current Plan</Text>
              <Text style={{ color: "#333", fontWeight: "600" }}>
                {activeSubscription.subscription_plans?.plan_name}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <Text style={{ color: "#666" }}>Valid Until</Text>
              <Text style={{ color: "#333", fontWeight: "600" }}>
                {formatDate(activeSubscription.end_date)}
              </Text>
            </View>
            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <Text style={{ color: "#666" }}>Days Left</Text>
              <Text style={{ color: "#183B5C", fontWeight: "bold" }}>
                {Math.ceil(
                  (new Date(activeSubscription.end_date) - new Date()) /
                    (1000 * 60 * 60 * 24),
                )}{" "}
                days
              </Text>
            </View>
          </>
        ) : (
          <View style={{ alignItems: "center", padding: 15 }}>
            <Ionicons name="card-outline" size={40} color="#D1D5DB" />
            <Text
              style={{ color: "#9CA3AF", marginTop: 10, textAlign: "center" }}
            >
              No active subscription
            </Text>
          </View>
        )}

        <Pressable
          style={{
            backgroundColor: "#183B5C",
            padding: 12,
            borderRadius: 12,
            alignItems: "center",
            marginTop: 15,
          }}
          onPress={() => navigation.navigate("SubscriptionScreen")}
        >
          <Text style={{ color: "#FFF", fontWeight: "600" }}>
            {activeSubscription ? "Manage Subscription" : "Subscribe Now"}
          </Text>
        </Pressable>
      </View>

      {/* Account Settings */}
      <View
        style={{
          marginHorizontal: 20,
          marginTop: 20,
          backgroundColor: "#FFF",
          borderRadius: 24,
          padding: 20,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: "bold",
            color: "#333",
            marginBottom: 15,
          }}
        >
          ⚙️ Account Settings
        </Text>

        <Pressable
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: "#F3F4F6",
          }}
          onPress={() => navigation.navigate("DriverVerificationScreen")}
        >
          <Ionicons
            name="shield-checkmark-outline"
            size={22}
            color="#183B5C"
            style={{ width: 30 }}
          />
          <Text style={{ flex: 1, color: "#333" }}>Verification Status</Text>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </Pressable>
{/* Sign Out */}
        <Pressable
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: "#F3F4F6",
          }}
          onPress={() => Linking.openURL("https://sakayna.ph/help")}
        >
          <Ionicons
            name="help-circle-outline"
            size={22}
            color="#183B5C"
            style={{ width: 30 }}
          />
          <Text style={{ flex: 1, color: "#333" }}>Help Center</Text>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </Pressable>

        <Pressable
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: "#F3F4F6",
          }}
          onPress={() => Linking.openURL("https://sakayna.ph/terms")}
        >
          <Ionicons
            name="document-text-outline"
            size={22}
            color="#183B5C"
            style={{ width: 30 }}
          />
          <Text style={{ flex: 1, color: "#333" }}>Terms & Conditions</Text>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </Pressable>

        <Pressable
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: "#F3F4F6",
          }}
          onPress={() => Linking.openURL("https://sakayna.ph/privacy")}
        >
          <Ionicons
            name="lock-closed-outline"
            size={22}
            color="#183B5C"
            style={{ width: 30 }}
          />
          <Text style={{ flex: 1, color: "#333" }}>Privacy Policy</Text>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </Pressable>

        <Pressable
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 12,
          }}
          onPress={handleSignOut}
        >
          <Ionicons
            name="log-out-outline"
            size={22}
            color="#EF4444"
            style={{ width: 30 }}
          />
          <Text style={{ flex: 1, color: "#EF4444", fontWeight: "600" }}>
            Sign Out
          </Text>
        </Pressable>
      </View>

      {/* App Info */}
      <View style={{ alignItems: "center", marginTop: 20, marginBottom: 10 }}>
        <Text style={{ fontSize: 12, color: "#9CA3AF" }}>
          SakayNa Driver v1.0.0
        </Text>
        <Text style={{ fontSize: 11, color: "#D1D5DB", marginTop: 2 }}>
          Member since: {formatDate(driver?.created_at)}
        </Text>
      </View>

      {/* Edit Profile Modal */}
      <Modal
        visible={editProfileModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setEditProfileModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: "#FFF",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 20,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: "bold", color: "#333" }}>
                Edit Profile
              </Text>
              <Pressable onPress={() => setEditProfileModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </Pressable>
            </View>

            <ScrollView>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: "#333",
                  marginBottom: 8,
                }}
              >
                Full Name
              </Text>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 16,
                  marginBottom: 15,
                }}
                placeholder="Enter your full name"
                value={editName}
                onChangeText={setEditName}
              />

              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: "#333",
                  marginBottom: 8,
                }}
              >
                Phone Number
              </Text>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 16,
                  marginBottom: 15,
                }}
                placeholder="Enter phone number"
                keyboardType="phone-pad"
                value={editPhone}
                onChangeText={setEditPhone}
              />

              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: "#333",
                  marginBottom: 8,
                }}
              >
                Email Address
              </Text>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 16,
                  marginBottom: 20,
                }}
                placeholder="Enter email address"
                keyboardType="email-address"
                autoCapitalize="none"
                value={editEmail}
                onChangeText={setEditEmail}
              />

              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  style={{
                    flex: 1,
                    backgroundColor: "#F3F4F6",
                    padding: 14,
                    borderRadius: 12,
                    alignItems: "center",
                  }}
                  onPress={() => setEditProfileModal(false)}
                >
                  <Text style={{ color: "#333", fontWeight: "600" }}>
                    Cancel
                  </Text>
                </Pressable>

                <Pressable
                  style={{
                    flex: 1,
                    backgroundColor: "#183B5C",
                    padding: 14,
                    borderRadius: 12,
                    alignItems: "center",
                  }}
                  onPress={handleUpdateProfile}
                >
                  <Text style={{ color: "#FFF", fontWeight: "600" }}>Save</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Vehicle Modal */}
      <Modal
        visible={vehicleModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setVehicleModal(false)}
      >
        {/* Add KeyboardAvoidingView here */}
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.5)",
              justifyContent: "flex-end",
            }}
          >
            <View
              style={{
                backgroundColor: "#FFF",
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                padding: 20,
                maxHeight: "90%", // Limit height para di lumagpas
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 20,
                }}
              >
                <Text
                  style={{ fontSize: 20, fontWeight: "bold", color: "#333" }}
                >
                  Vehicle Information
                </Text>
                <Pressable onPress={() => setVehicleModal(false)}>
                  <Ionicons name="close" size={24} color="#666" />
                </Pressable>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled" // Para mag-dismiss keyboard kapag nag-tap sa labas
              >
                {/* Plate Number */}
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: "#333",
                    marginBottom: 8,
                  }}
                >
                  Plate Number
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    borderRadius: 12,
                    padding: 12,
                    fontSize: 16,
                    marginBottom: 15,
                    textTransform: "uppercase",
                  }}
                  placeholder="ABC-1234"
                  value={editPlate}
                  onChangeText={setEditPlate}
                  returnKeyType="done" // Para may "Done" button sa keyboard
                />

                {/* Vehicle Type */}
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: "#333",
                    marginBottom: 8,
                  }}
                >
                  Vehicle Type
                </Text>
                <View
                  style={{ flexDirection: "row", marginBottom: 15, gap: 10 }}
                >
                  {["motorcycle", "tricycle"].map((type) => (
                    <Pressable
                      key={type}
                      style={[
                        {
                          flex: 1,
                          padding: 12,
                          borderRadius: 12,
                          borderWidth: 2,
                          alignItems: "center",
                        },
                        editVehicleType === type
                          ? {
                              borderColor: "#183B5C",
                              backgroundColor: "#E6E9F0",
                            }
                          : { borderColor: "#E5E7EB" },
                      ]}
                      onPress={() => setEditVehicleType(type)}
                    >
                      <Ionicons
                        name={
                          type === "motorcycle"
                            ? "bicycle"
                            : type === "tricycle"
                              ? "car-sport"
                              : "car"
                        }
                        size={20}
                        color={editVehicleType === type ? "#183B5C" : "#9CA3AF"}
                      />
                      <Text
                        style={{
                          fontSize: 10,
                          marginTop: 4,
                          color: editVehicleType === type ? "#183B5C" : "#666",
                          textTransform: "capitalize",
                        }}
                      >
                        {type}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Vehicle Color */}
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: "#333",
                    marginBottom: 8,
                  }}
                >
                  Vehicle Color
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    marginBottom: 20,
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  {[
                    "Red",
                    "Blue",
                    "Black",
                    "White",
                    "Silver",
                    "Gray",
                    "Green",
                    "Yellow",
                  ].map((color) => (
                    <Pressable
                      key={color}
                      style={[
                        {
                          paddingHorizontal: 16,
                          paddingVertical: 8,
                          borderRadius: 20,
                          borderWidth: 1,
                        },
                        editVehicleColor.toLowerCase() === color.toLowerCase()
                          ? {
                              borderColor: "#183B5C",
                              backgroundColor: "#E6E9F0",
                            }
                          : { borderColor: "#E5E7EB" },
                      ]}
                      onPress={() => setEditVehicleColor(color)}
                    >
                      <View
                        style={{ flexDirection: "row", alignItems: "center" }}
                      >
                        <View
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: 6,
                            backgroundColor: color.toLowerCase(),
                            marginRight: 4,
                          }}
                        />
                        <Text
                          style={{
                            fontSize: 12,
                            color:
                              editVehicleColor.toLowerCase() ===
                              color.toLowerCase()
                                ? "#183B5C"
                                : "#666",
                          }}
                        >
                          {color}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>

                {/* Buttons */}
                <View
                  style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}
                >
                  <Pressable
                    style={{
                      flex: 1,
                      backgroundColor: "#F3F4F6",
                      padding: 14,
                      borderRadius: 12,
                      alignItems: "center",
                    }}
                    onPress={() => setVehicleModal(false)}
                  >
                    <Text style={{ color: "#333", fontWeight: "600" }}>
                      Cancel
                    </Text>
                  </Pressable>

                  <Pressable
                    style={{
                      flex: 1,
                      backgroundColor: "#183B5C",
                      padding: 14,
                      borderRadius: 12,
                      alignItems: "center",
                    }}
                    onPress={handleUpdateVehicle}
                  >
                    <Text style={{ color: "#FFF", fontWeight: "600" }}>
                      Save
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}
