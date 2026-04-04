import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Image,
  Linking,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import QRCode from "react-native-qrcode-svg";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { getUserSession } from "../utils/authStorage";

// Custom Alert Component
const CustomAlert = ({ visible, title, message, onConfirm, onCancel, confirmText = "OK", cancelText = "Cancel", type = "info" }) => {
  const getIcon = () => {
    switch (type) {
      case "success":
        return <Ionicons name="checkmark-circle" size={50} color="#10B981" />;
      case "error":
        return <Ionicons name="close-circle" size={50} color="#EF4444" />;
      case "warning":
        return <Ionicons name="warning" size={50} color="#F59E0B" />;
      default:
        return <Ionicons name="information-circle" size={50} color="#183B5C" />;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <View
          style={{
            backgroundColor: "#FFF",
            borderRadius: 24,
            padding: 24,
            width: "80%",
            maxWidth: 320,
            alignItems: "center",
          }}
        >
          {getIcon()}
          <Text
            style={{
              fontSize: 20,
              fontWeight: "bold",
              color: "#333",
              marginTop: 16,
              marginBottom: 8,
              textAlign: "center",
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: "#666",
              textAlign: "center",
              marginBottom: 24,
              lineHeight: 20,
            }}
          >
            {message}
          </Text>
          <View style={{ flexDirection: "row", gap: 12, width: "100%" }}>
            {onCancel && (
              <Pressable
                style={{
                  flex: 1,
                  backgroundColor: "#F3F4F6",
                  padding: 12,
                  borderRadius: 12,
                  alignItems: "center",
                }}
                onPress={onCancel}
              >
                <Text style={{ color: "#666", fontWeight: "600" }}>
                  {cancelText}
                </Text>
              </Pressable>
            )}
            <Pressable
              style={{
                flex: 1,
                backgroundColor: "#183B5C",
                padding: 12,
                borderRadius: 12,
                alignItems: "center",
              }}
              onPress={onConfirm}
            >
              <Text style={{ color: "#FFF", fontWeight: "600" }}>
                {confirmText}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default function DriverAccountScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [driverId, setDriverId] = useState(null);
  const [isTestAccount, setIsTestAccount] = useState(false);
  const [driver, setDriver] = useState(null);

  // URLs from database
  const [helpCenterUrl, setHelpCenterUrl] = useState(null);
  const [termsUrl, setTermsUrl] = useState(null);
  const [privacyUrl, setPrivacyUrl] = useState(null);
  const [urlsLoading, setUrlsLoading] = useState(true);

  // Custom alert states
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    title: "",
    message: "",
    type: "info",
    onConfirm: null,
    onCancel: null,
    confirmText: "OK",
    cancelText: "Cancel",
  });

  const [driverStats, setDriverStats] = useState({
    totalTrips: 0,
    totalEarnings: 0,
    avgRating: 0,
    memberSince: null,
    referrals: 0,
  });

  const [vehicle, setVehicle] = useState(null);
  const [documents, setDocuments] = useState(null);
  const [activeSubscription, setActiveSubscription] = useState(null);

  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [qrValue, setQrValue] = useState(null);
  const [qrSize, setQrSize] = useState(250);
  const [qrLogo, setQrLogo] = useState(null);

  const [editProfileModal, setEditProfileModal] = useState(false);
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

  // Fetch URLs from system_settings
  const fetchSystemUrls = async () => {
    try {
      setUrlsLoading(true);
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", ["help_center_url", "terms_and_conditions_url", "privacy_policy_url"])
        .eq("is_public", true);

      if (error) throw error;

      if (data) {
        data.forEach(setting => {
          switch (setting.key) {
            case "help_center_url":
              setHelpCenterUrl(setting.value);
              break;
            case "terms_and_conditions_url":
              setTermsUrl(setting.value);
              break;
            case "privacy_policy_url":
              setPrivacyUrl(setting.value);
              break;
          }
        });
      }
    } catch (err) {
      console.log("Error fetching system URLs:", err.message);
      // Set fallback URLs if database fetch fails
      setHelpCenterUrl("https://sakayna-v1.netlify.app/help");
      setTermsUrl("https://sakayna-v1.netlify.app/terms");
      setPrivacyUrl("https://sakayna-v1.netlify.app/privacy");
    } finally {
      setUrlsLoading(false);
    }
  };

  // Custom alert helper functions
  const showAlert = (title, message, type = "info", onConfirm = null, onCancel = null, confirmText = "OK", cancelText = "Cancel") => {
    setAlertConfig({
      title,
      message,
      type,
      onConfirm: () => {
        setAlertVisible(false);
        if (onConfirm) onConfirm();
      },
      onCancel: onCancel ? () => {
        setAlertVisible(false);
        onCancel();
      } : null,
      confirmText,
      cancelText,
    });
    setAlertVisible(true);
  };

  const hideAlert = () => {
    setAlertVisible(false);
  };

  // Helper function to open URLs with validation
  const openUrl = async (url, name) => {
    if (!url) {
      showAlert("Error", `${name} URL is not configured. Please contact support.`, "error");
      return;
    }

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        showAlert("Error", `Cannot open ${name.toLowerCase()} URL.`, "error");
      }
    } catch (err) {
      console.log(`Error opening ${name}:`, err);
      showAlert("Error", `Failed to open ${name.toLowerCase()}.`, "error");
    }
  };

  useFocusEffect(
    useCallback(() => {
      const getDriverId = async () => {
        const session = await getUserSession();

        if (session && session.isTestAccount && session.userType === "driver") {
          console.log("✅ Test driver account detected");
          setIsTestAccount(true);
          setDriverId(session.phone);

          const mockDriver = {
            first_name: "Test",
            last_name: "Driver",
            phone: session.phone,
            email: "test.driver@example.com",
            profile_picture: null,
            status: "approved",
            is_active: true,
            created_at: new Date().toISOString(),
          };

          setDriver(mockDriver);
          setEditPhone(mockDriver.phone);
          setEditEmail(mockDriver.email);

          setDriverStats({
            totalTrips: 0,
            totalEarnings: 0,
            avgRating: 5.0,
            memberSince: new Date().toISOString(),
            referrals: 0,
          });

          setLoading(false);
          generateQRCodeForTest();
        } else {
          const id = await AsyncStorage.getItem("user_id");
          setDriverId(id);
          setIsTestAccount(false);
        }
      };

      getDriverId();
      fetchSystemUrls(); // Fetch URLs from database
    }, [])
  );

  const generateQRCodeForTest = () => {
    const qrData = {
      type: "driver_qr",
      driver_id: "test_driver_001",
      name: "Test Driver",
      timestamp: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
    setQrValue(JSON.stringify(qrData));
  };

  useEffect(() => {
    if (driverId && !isTestAccount) {
      loadDriverData();
      generateQRCode();
    } else if (isTestAccount) {
      generateQRCodeForTest();
    }
  }, [driverId, isTestAccount]);

  const generateQRCode = () => {
    if (!driverId) return;

    const qrData = {
      type: "driver_qr",
      driver_id: driverId,
      name: driver ? `${driver.first_name} ${driver.last_name}` : "SakayNa Driver",
      timestamp: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    setQrValue(JSON.stringify(qrData));
  };

  const refreshQRCode = () => {
    if (isTestAccount) {
      showAlert("Test Account", "QR code refresh is disabled for test accounts.", "warning");
      return;
    }

    showAlert(
      "Refresh QR Code",
      "Generating a new QR code will make the old one invalid. Continue?",
      "warning",
      () => {
        generateQRCode();
        showAlert("Success", "New QR code has been generated!", "success");
      },
      null,
      "Generate New",
      "Cancel"
    );
  };

  const fetchReferrals = async () => {
    if (isTestAccount) return;

    try {
      const { count, error } = await supabase
        .from("referrals")
        .select("*", { count: "exact", head: true })
        .eq("referrer_id", driverId)
        .eq("referrer_type", "driver");

      if (error) throw error;

      setDriverStats((prev) => ({
        ...prev,
        referrals: count || 0,
      }));
    } catch (err) {
      console.log("Error fetching referrals:", err.message);
    }
  };

  const fetchSettings = async () => {
    if (isTestAccount) return;

    try {
      const { data, error } = await supabase
        .from("driver_settings")
        .select("*")
        .eq("driver_id", driverId)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        setNotificationsEnabled(data.notifications_enabled);
        setDarkModeEnabled(data.dark_mode_enabled);
        setLanguage(data.language);
      } else {
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

  const updateSettings = async () => {
    try {
      const { error } = await supabase
        .from("driver_settings")
        .update({
          notifications_enabled: notificationsEnabled,
          dark_mode_enabled: darkModeEnabled,
          language: language,
          updated_at: new Date(),
        })
        .eq("driver_id", driverId);

      if (error) throw error;

      showAlert("Success", "Settings updated successfully!", "success");
      setSettingsModal(false);
    } catch (err) {
      console.log("Error updating settings:", err.message);
      showAlert("Error", "Failed to update settings", "error");
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
        fetchReferrals(),
        fetchSettings(),
      ]);
    } catch (err) {
      console.log("Error loading driver data:", err);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    if (isTestAccount) {
      setRefreshing(false);
      return;
    }

    setRefreshing(true);
    await Promise.all([
      loadDriverData(),
      fetchSystemUrls() // Refresh URLs on pull-to-refresh
    ]);
    generateQRCode();
    setRefreshing(false);
  };

  const fetchDriverProfile = async () => {
    if (isTestAccount) return;

    try {
      const { data, error } = await supabase
        .from("drivers")
        .select(`
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
        `)
        .eq("id", driverId)
        .single();

      if (error) throw error;

      if (data.profile_picture) {
        if (!data.profile_picture.startsWith("http")) {
          const { data: urlData } = supabase.storage
            .from("driver-profiles")
            .getPublicUrl(data.profile_picture);

          data.profile_picture = urlData.publicUrl;
        }

        data.profile_picture = data.profile_picture + "?t=" + Date.now();
      }

      setDriver(data);
      setEditPhone(data.phone || "");
      setEditEmail(data.email || "");
    } catch (err) {
      console.log("Error fetching profile:", err.message);
    }
  };

  const fetchDriverStats = async () => {
    if (isTestAccount) return;

    try {
      const { data: bookings, error: bookingsError } = await supabase
        .from("bookings")
        .select("actual_fare, commuter_rating")
        .eq("driver_id", driverId)
        .eq("status", "completed");

      if (bookingsError) throw bookingsError;

      const totalTrips = bookings?.length || 0;
      const totalEarnings =
        bookings?.reduce((sum, b) => sum + (b.actual_fare || 0), 0) || 0;

      const ratings =
        bookings?.filter((b) => b.commuter_rating).map((b) => b.commuter_rating) || [];
      const avgRating =
        ratings.length > 0
          ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
          : 0;

      setDriverStats((prev) => ({
        ...prev,
        totalTrips,
        totalEarnings,
        avgRating,
        memberSince: driver?.created_at,
      }));
    } catch (err) {
      console.log("Error fetching stats:", err.message);
    }
  };

  const fetchVehicleInfo = async () => {
    if (isTestAccount) return;

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
    if (isTestAccount) return;

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
    if (isTestAccount) return;

    try {
      const { data, error } = await supabase
        .from("driver_subscriptions")
        .select(`
          *,
          subscription_plans (
            plan_name,
            plan_type,
            price
          )
        `)
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
    if (isTestAccount) {
      showAlert("Test Account", "Profile updates are disabled for test accounts.", "warning");
      return;
    }

    try {
      const { error } = await supabase
        .from("drivers")
        .update({
          phone: editPhone,
          email: editEmail,
          updated_at: new Date(),
        })
        .eq("id", driverId);

      if (error) throw error;

      showAlert("Success", "Profile updated successfully", "success");
      setEditProfileModal(false);
      fetchDriverProfile();
    } catch (err) {
      console.log("Error updating profile:", err.message);
      showAlert("Error", "Failed to update profile", "error");
    }
  };

  const handleUpdateVehicle = async () => {
    if (isTestAccount) {
      showAlert("Test Account", "Vehicle updates are disabled for test accounts.", "warning");
      return;
    }

    try {
      if (vehicle) {
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

      showAlert("Success", "Vehicle information updated", "success");
      setVehicleModal(false);
      fetchVehicleInfo();
    } catch (err) {
      console.log("Error updating vehicle:", err.message);
      showAlert("Error", "Failed to update vehicle information", "error");
    }
  };

  const handleSignOut = () => {
    showAlert(
      "Sign Out",
      "Are you sure you want to sign out?",
      "warning",
      async () => {
        try {
          const session = await getUserSession();
          if (session && session.isTestAccount) {
            await AsyncStorage.removeItem("@sakayna_user_session");
            await AsyncStorage.removeItem("@sakayna_test_account");
          } else {
            await AsyncStorage.removeItem("user_id");
            await supabase.auth.signOut();
          }
          navigation.replace("UserType");
        } catch (err) {
          console.log("Error signing out:", err.message);
          showAlert("Error", "Failed to sign out", "error");
        }
      },
      null,
      "Sign Out",
      "Cancel"
    );
  };

  const pickImage = async () => {
    if (isTestAccount) {
      showAlert("Test Account", "Profile picture updates are disabled for test accounts.", "warning");
      return;
    }

    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        showAlert("Permission Required", "Please enable photo access", "warning");
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
        const fileName = `${Date.now()}.jpg`;
        const filePath = `${driverId}/${fileName}`;

        const response = await fetch(image.uri);
        const arrayBuffer = await response.arrayBuffer();

        const { error } = await supabase.storage
          .from("driver-profiles")
          .upload(filePath, arrayBuffer, {
            contentType: "image/jpeg",
            upsert: true,
          });

        if (error) throw error;

        const { data: urlData } = supabase.storage
          .from("driver-profiles")
          .getPublicUrl(filePath);

        const { error: updateError } = await supabase
          .from("drivers")
          .update({
            profile_picture: urlData.publicUrl,
            updated_at: new Date(),
          })
          .eq("id", driverId);

        if (updateError) throw updateError;

        setDriver((prevDriver) => ({
          ...prevDriver,
          profile_picture: urlData.publicUrl + "?t=" + Date.now(),
        }));

        showAlert("Success", "Profile picture updated!", "success");
      }
    } catch (err) {
      console.log("Error:", err);
      showAlert("Upload Failed", err.message, "error");
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

  if (loading && !refreshing && !isTestAccount) {
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
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: "#F5F7FA" }}
        contentContainerStyle={{ paddingBottom: 0 }}
        refreshControl={
          !isTestAccount ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          ) : undefined
        }
      >
        {isTestAccount && (
          <View
            style={{
              backgroundColor: "#FFF3E0",
              padding: 10,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingTop: 40,
            }}
          >
            <Ionicons name="flask" size={20} color="#E97A3E" />
            <Text style={{ color: "#E97A3E", fontSize: 12, fontWeight: "500" }}>
              Test Account Mode
            </Text>
          </View>
        )}

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

            {!isTestAccount ? (
              <Pressable onPress={() => setSettingsModal(true)}>
                <Ionicons name="settings-outline" size={24} color="#FFF" />
              </Pressable>
            ) : (
              <View style={{ width: 40 }} />
            )}
          </View>
        </View>

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
            <Pressable
              onPress={pickImage}
              disabled={isTestAccount}
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
                    source={{ uri: driver.profile_picture }}
                    style={{ width: "100%", height: "100%", borderRadius: 50 }}
                  />
                ) : (
                  <Ionicons name="person" size={50} color="#9CA3AF" />
                )}
              </View>

              {!isTestAccount && (
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
              )}
            </Pressable>

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
          </View>

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
              <Text style={{ fontSize: 20, fontWeight: "bold", color: "#183B5C" }}>
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
              <Text style={{ fontSize: 20, fontWeight: "bold", color: "#183B5C" }}>
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
                <Text style={{ fontSize: 20, fontWeight: "bold", color: "#183B5C" }}>
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

          {!isTestAccount && (
            <Pressable
              style={{
                backgroundColor: "#F3F4F6",
                padding: 12,
                borderRadius: 12,
                alignItems: "center",
                marginTop: 15,
              }}
              onPress={() => setEditProfileModal(true)}
            >
              <Text style={{ color: "#183B5C", fontWeight: "600" }}>
                Edit Contact Information
              </Text>
            </Pressable>
          )}
        </View>

        {/* QR Code Section */}
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
            📱 My QR Code
          </Text>

          <Text style={{ fontSize: 14, color: "#666", marginBottom: 15 }}>
            Let passengers scan your QR code to book directly with you!
          </Text>

          <View style={{ alignItems: "center", marginBottom: 20 }}>
            {qrValue ? (
              <View
                style={{
                  padding: 20,
                  backgroundColor: "#FFF",
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.1,
                  shadowRadius: 4,
                  elevation: 3,
                }}
              >
                <QRCode
                  value={qrValue}
                  size={qrSize}
                  color="#183B5C"
                  backgroundColor="#FFF"
                  logo={qrLogo}
                  logoSize={50}
                  logoBorderRadius={25}
                />
              </View>
            ) : (
              <View
                style={{
                  width: qrSize,
                  height: qrSize,
                  backgroundColor: "#F3F4F6",
                  borderRadius: 16,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <ActivityIndicator size="large" color="#183B5C" />
              </View>
            )}
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
            <Pressable
              style={{
                flex: 1,
                backgroundColor: "#183B5C",
                padding: 12,
                borderRadius: 12,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 6,
              }}
              onPress={() => setQrModalVisible(true)}
            >
              <Ionicons name="qr-code-outline" size={20} color="#FFF" />
              <Text style={{ color: "#FFF", fontWeight: "600" }}>View</Text>
            </Pressable>

            {!isTestAccount && (
              <Pressable
                style={{
                  flex: 1,
                  backgroundColor: "#F3F4F6",
                  padding: 12,
                  borderRadius: 12,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 6,
                }}
                onPress={refreshQRCode}
              >
                <Ionicons name="refresh-outline" size={18} color="#183B5C" />
                <Text style={{ color: "#183B5C", fontWeight: "600" }}>Refresh</Text>
              </Pressable>
            )}
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: 15,
              paddingTop: 15,
              borderTopWidth: 1,
              borderTopColor: "#F3F4F6",
            }}
          >
            <Ionicons name="information-circle-outline" size={18} color="#F59E0B" />
            <Text style={{ fontSize: 12, color: "#666", marginLeft: 6, flex: 1 }}>
              Show this QR code to passengers so they can book directly with you!
            </Text>
          </View>
        </View>

        {/* Referrals Section */}
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
            🤝 Referrals
          </Text>

          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <View>
              <Text style={{ fontSize: 14, color: "#666", marginBottom: 4 }}>
                Total Referrals
              </Text>
              <Text
                style={{ fontSize: 24, fontWeight: "bold", color: "#183B5C" }}
              >
                {driverStats.referrals}
              </Text>
            </View>

            {!isTestAccount && (
              <Pressable
                style={{
                  backgroundColor: "#183B5C",
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 20,
                }}
                onPress={() => navigation.navigate("ReferralScreen")}
              >
                <Text style={{ color: "#FFF", fontWeight: "600" }}>Invite</Text>
              </Pressable>
            )}
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: 10,
              paddingTop: 10,
              borderTopWidth: 1,
              borderTopColor: "#F3F4F6",
            }}
          >
            <Ionicons name="gift-outline" size={18} color="#F59E0B" />
            <Text style={{ fontSize: 12, color: "#666", marginLeft: 6 }}>
              Earn rewards for every successful referral!
            </Text>
          </View>
        </View>

        {/* Contact Information Section */}
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

        {/* Vehicle Information Section */}
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
          onPress={() => !isTestAccount && setVehicleModal(true)}
          disabled={isTestAccount}
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
            {!isTestAccount && <Ionicons name="pencil" size={18} color="#183B5C" />}
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
                {isTestAccount
                  ? "Vehicle info not available in test mode"
                  : "No vehicle information added"}
              </Text>
              {!isTestAccount && (
                <Text style={{ color: "#183B5C", marginTop: 5 }}>
                  Tap to add vehicle details
                </Text>
              )}
            </View>
          )}
        </Pressable>

        {/* Documents Section */}
        {!isTestAccount && (
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
        )}

        {/* Subscription Section */}
        {!isTestAccount && (
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
        )}

        {/* Account Settings Section */}
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

          {!isTestAccount && (
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
          )}

          {/* Help Center - Using URL from database */}
          <Pressable
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: "#F3F4F6",
            }}
            onPress={() => openUrl(helpCenterUrl, "Help Center")}
          >
            <Ionicons
              name="help-circle-outline"
              size={22}
              color="#183B5C"
              style={{ width: 30 }}
            />
            <Text style={{ flex: 1, color: "#333" }}>Help Center</Text>
            {urlsLoading ? (
              <ActivityIndicator size="small" color="#9CA3AF" />
            ) : (
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            )}
          </Pressable>

          {/* Terms & Conditions - Using URL from database */}
          <Pressable
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: "#F3F4F6",
            }}
            onPress={() => openUrl(termsUrl, "Terms and Conditions")}
          >
            <Ionicons
              name="document-text-outline"
              size={22}
              color="#183B5C"
              style={{ width: 30 }}
            />
            <Text style={{ flex: 1, color: "#333" }}>Terms & Conditions</Text>
            {urlsLoading ? (
              <ActivityIndicator size="small" color="#9CA3AF" />
            ) : (
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            )}
          </Pressable>

          {/* Privacy Policy - Using URL from database */}
          <Pressable
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: "#F3F4F6",
            }}
            onPress={() => openUrl(privacyUrl, "Privacy Policy")}
          >
            <Ionicons
              name="lock-closed-outline"
              size={22}
              color="#183B5C"
              style={{ width: 30 }}
            />
            <Text style={{ flex: 1, color: "#333" }}>Privacy Policy</Text>
            {urlsLoading ? (
              <ActivityIndicator size="small" color="#9CA3AF" />
            ) : (
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            )}
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

        <View style={{ alignItems: "center", marginTop: 20, marginBottom: 10 }}>
          <Text style={{ fontSize: 12, color: "#9CA3AF" }}>
            SakayNa Driver v1.0.0
          </Text>
          {!isTestAccount && (
            <Text style={{ fontSize: 11, color: "#D1D5DB", marginTop: 2 }}>
              Member since: {formatDate(driver?.created_at)}
            </Text>
          )}
        </View>
      </ScrollView>

      {/* Settings Modal */}
      <Modal
        visible={settingsModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSettingsModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
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
                  maxHeight: "80%",
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
                    Settings
                  </Text>
                  <Pressable onPress={() => setSettingsModal(false)}>
                    <Ionicons name="close" size={24} color="#666" />
                  </Pressable>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  {/* Notifications */}
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingVertical: 15,
                      borderBottomWidth: 1,
                      borderBottomColor: "#F3F4F6",
                    }}
                  >
                    <View>
                      <Text style={{ fontSize: 16, fontWeight: "500", color: "#333" }}>
                        Notifications
                      </Text>
                      <Text style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                        Receive trip alerts and updates
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => setNotificationsEnabled(!notificationsEnabled)}
                      style={{
                        width: 50,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: notificationsEnabled ? "#183B5C" : "#D1D5DB",
                        padding: 2,
                      }}
                    >
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          backgroundColor: "#FFF",
                          transform: [{ translateX: notificationsEnabled ? 24 : 0 }],
                        }}
                      />
                    </Pressable>
                  </View>

                  {/* Dark Mode */}
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingVertical: 15,
                      borderBottomWidth: 1,
                      borderBottomColor: "#F3F4F6",
                    }}
                  >
                    <View>
                      <Text style={{ fontSize: 16, fontWeight: "500", color: "#333" }}>
                        Dark Mode
                      </Text>
                      <Text style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                        Use dark theme
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => setDarkModeEnabled(!darkModeEnabled)}
                      style={{
                        width: 50,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: darkModeEnabled ? "#183B5C" : "#D1D5DB",
                        padding: 2,
                      }}
                    >
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          backgroundColor: "#FFF",
                          transform: [{ translateX: darkModeEnabled ? 24 : 0 }],
                        }}
                      />
                    </Pressable>
                  </View>

                  {/* Language Selection */}
                  <View
                    style={{
                      paddingVertical: 15,
                      borderBottomWidth: 1,
                      borderBottomColor: "#F3F4F6",
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: "500", color: "#333", marginBottom: 10 }}>
                      Language
                    </Text>
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      {["english", "tagalog", "cebuano"].map((lang) => (
                        <Pressable
                          key={lang}
                          style={[
                            {
                              flex: 1,
                              padding: 10,
                              borderRadius: 12,
                              borderWidth: 1,
                              alignItems: "center",
                            },
                            language === lang
                              ? { borderColor: "#183B5C", backgroundColor: "#E6E9F0" }
                              : { borderColor: "#E5E7EB" },
                          ]}
                          onPress={() => setLanguage(lang)}
                        >
                          <Text
                            style={{
                              color: language === lang ? "#183B5C" : "#666",
                              fontWeight: language === lang ? "600" : "400",
                              textTransform: "capitalize",
                            }}
                          >
                            {lang}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
                    <Pressable
                      style={{
                        flex: 1,
                        backgroundColor: "#F3F4F6",
                        padding: 14,
                        borderRadius: 12,
                        alignItems: "center",
                      }}
                      onPress={() => setSettingsModal(false)}
                    >
                      <Text style={{ color: "#333", fontWeight: "600" }}>Cancel</Text>
                    </Pressable>

                    <Pressable
                      style={{
                        flex: 1,
                        backgroundColor: "#183B5C",
                        padding: 14,
                        borderRadius: 12,
                        alignItems: "center",
                      }}
                      onPress={updateSettings}
                    >
                      <Text style={{ color: "#FFF", fontWeight: "600" }}>Save Changes</Text>
                    </Pressable>
                  </View>
                </ScrollView>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* QR Modal */}
      <Modal
        visible={qrModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setQrModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.9)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Pressable
            style={{ position: "absolute", top: 50, right: 20, zIndex: 10 }}
            onPress={() => setQrModalVisible(false)}
          >
            <Ionicons name="close-circle" size={40} color="#FFF" />
          </Pressable>

          <View style={{ alignItems: "center", padding: 20 }}>
            <Text
              style={{
                color: "#FFF",
                fontSize: 24,
                fontWeight: "bold",
                marginBottom: 10,
              }}
            >
              My QR Code
            </Text>
            <Text style={{ color: "#CCC", fontSize: 14, marginBottom: 30 }}>
              {driver?.first_name} {driver?.last_name}
            </Text>

            {qrValue ? (
              <View
                style={{
                  padding: 30,
                  backgroundColor: "#FFF",
                  borderRadius: 24,
                }}
              >
                <QRCode
                  value={qrValue}
                  size={300}
                  color="#183B5C"
                  backgroundColor="#FFF"
                />
              </View>
            ) : (
              <ActivityIndicator size="large" color="#FFF" />
            )}

            {!isTestAccount && (
              <View style={{ flexDirection: "row", gap: 20, marginTop: 30 }}>
                <Pressable
                  style={{
                    backgroundColor: "#183B5C",
                    padding: 15,
                    borderRadius: 30,
                    width: 60,
                    height: 60,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                  onPress={refreshQRCode}
                >
                  <Ionicons name="refresh-outline" size={30} color="#FFF" />
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Edit Profile Modal */}
      {!isTestAccount && (
        <Modal
          visible={editProfileModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setEditProfileModal(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
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
                    maxHeight: "90%",
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
                      Edit Contact Information
                    </Text>
                    <Pressable onPress={() => setEditProfileModal(false)}>
                      <Ionicons name="close" size={24} color="#666" />
                    </Pressable>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={true}>
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
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: "#E5E7EB",
                        borderRadius: 12,
                        padding: 12,
                        backgroundColor: "#F9FAFB",
                        marginBottom: 15,
                      }}
                    >
                      <Text style={{ fontSize: 16, color: "#666" }}>
                        {driver ? `${driver.first_name} ${driver.last_name}` : "Loading..."}
                      </Text>
                    </View>

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

                    <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
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
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* Vehicle Modal */}
      {!isTestAccount && (
        <Modal
          visible={vehicleModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setVehicleModal(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
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
                    maxHeight: "90%",
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
                      Vehicle Information
                    </Text>
                    <Pressable onPress={() => setVehicleModal(false)}>
                      <Ionicons name="close" size={24} color="#666" />
                    </Pressable>
                  </View>

                  <ScrollView
                    showsVerticalScrollIndicator={true}
                    keyboardShouldPersistTaps="handled"
                  >
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
                      returnKeyType="done"
                    />

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
                    <View style={{ flexDirection: "row", marginBottom: 15, gap: 10 }}>
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
                              ? { borderColor: "#183B5C", backgroundColor: "#E6E9F0" }
                              : { borderColor: "#E5E7EB" },
                          ]}
                          onPress={() => setEditVehicleType(type)}
                        >
                          <Ionicons
                            name={type === "motorcycle" ? "bicycle" : "car-sport"}
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
                      {["Red", "Blue", "Black", "White", "Silver", "Gray", "Green", "Yellow"].map(
                        (color) => (
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
                                ? { borderColor: "#183B5C", backgroundColor: "#E6E9F0" }
                                : { borderColor: "#E5E7EB" },
                            ]}
                            onPress={() => setEditVehicleColor(color)}
                          >
                            <View style={{ flexDirection: "row", alignItems: "center" }}>
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
                                    editVehicleColor.toLowerCase() === color.toLowerCase()
                                      ? "#183B5C"
                                      : "#666",
                                }}
                              >
                                {color}
                              </Text>
                            </View>
                          </Pressable>
                        )
                      )}
                    </View>

                    <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
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
                        <Text style={{ color: "#333", fontWeight: "600" }}>Cancel</Text>
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
                        <Text style={{ color: "#FFF", fontWeight: "600" }}>Save</Text>
                      </Pressable>
                    </View>
                  </ScrollView>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* Custom Alert */}
      <CustomAlert
        visible={alertVisible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onConfirm={alertConfig.onConfirm || hideAlert}
        onCancel={alertConfig.onCancel}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
      />
    </>
  );
}