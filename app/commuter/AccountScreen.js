// screens/commuter/AccountScreen.js
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
  Linking,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";

const base64ToArrayBuffer = (base64) => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

export default function AccountScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState(null);
  const [userType, setUserType] = useState('commuter');
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({
    totalTrips: 0,
    totalPoints: 0,
    totalSpent: 0,
    memberSince: null,
    referrals: 0,
  });

  // Withdrawal Settings State
  const [withdrawalSettings, setWithdrawalSettings] = useState({
    default_payment_method_id: null,
    auto_withdraw: false,
    auto_withdraw_threshold: null,
    withdrawal_pin: null,
    daily_withdrawal_limit: null,
    weekly_withdrawal_limit: null,
    monthly_withdrawal_limit: null,
    notifications_enabled: true,
  });
  
  // Payout methods for settings
  const [payoutMethods, setPayoutMethods] = useState([]);
  
  // Modal states
  const [editProfileModal, setEditProfileModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  
  // Withdrawal Settings Modal
  const [showWithdrawalSettingsModal, setShowWithdrawalSettingsModal] = useState(false);
  const [tempSettings, setTempSettings] = useState(null);
  
  // PIN Change Modal
  const [showPinChangeModal, setShowPinChangeModal] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [changingPin, setChangingPin] = useState(false);

  // Fetch user ID
  useFocusEffect(
    useCallback(() => {
      const getUserId = async () => {
        const id = await AsyncStorage.getItem("user_id");
        const type = await AsyncStorage.getItem("user_type") || 'commuter';
        setUserId(id);
        setUserType(type);
      };
      getUserId();
    }, [])
  );

  // Fetch all user data
  useEffect(() => {
    if (userId) {
      loadUserData();
      loadWithdrawalSettings();
      loadPayoutMethods();
    }
  }, [userId]);

  const loadUserData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchProfile(),
        fetchStats(),
      ]);
    } catch (err) {
      console.log("Error loading user data:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadWithdrawalSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("withdrawal_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setWithdrawalSettings(data);
        setTempSettings(data);
      } else {
        // Create default settings
        const defaultSettings = {
          user_id: userId,
          user_type: "commuter",
          auto_withdraw: false,
          notifications_enabled: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        const { data: newSettings, error: insertError } = await supabase
          .from("withdrawal_settings")
          .insert(defaultSettings)
          .select()
          .single();
          
        if (!insertError && newSettings) {
          setWithdrawalSettings(newSettings);
          setTempSettings(newSettings);
        }
      }
    } catch (err) {
      console.log("Error loading withdrawal settings:", err.message);
    }
  };

  const loadPayoutMethods = async () => {
    try {
      const { data, error } = await supabase
        .from("user_payment_methods")
        .select("*")
        .eq("user_id", userId)
        .eq("user_type", "commuter")
        .eq("is_active", true);

      if (error) throw error;
      setPayoutMethods(data || []);
    } catch (err) {
      console.log("Error loading payout methods:", err.message);
    }
  };

  const updateWithdrawalSettings = async () => {
    try {
      const { error } = await supabase
        .from("withdrawal_settings")
        .update({
          default_payment_method_id: tempSettings.default_payment_method_id,
          auto_withdraw: tempSettings.auto_withdraw,
          auto_withdraw_threshold: tempSettings.auto_withdraw_threshold,
          daily_withdrawal_limit: tempSettings.daily_withdrawal_limit,
          weekly_withdrawal_limit: tempSettings.weekly_withdrawal_limit,
          monthly_withdrawal_limit: tempSettings.monthly_withdrawal_limit,
          notifications_enabled: tempSettings.notifications_enabled,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", userId);

      if (error) throw error;
      
      setWithdrawalSettings(tempSettings);
      setShowWithdrawalSettingsModal(false);
      Alert.alert("Success", "Withdrawal settings updated successfully!");
    } catch (err) {
      console.log("Error updating withdrawal settings:", err.message);
      Alert.alert("Error", "Failed to update withdrawal settings");
    }
  };

  const changePin = async () => {
    if (newPin.length !== 4) {
      setPinError("PIN must be exactly 4 digits");
      return;
    }
    
    if (!/^\d{4}$/.test(newPin)) {
      setPinError("PIN must contain only numbers");
      return;
    }
    
    if (newPin !== confirmPin) {
      setPinError("PINs do not match");
      return;
    }
    
    // Verify current PIN
    if (withdrawalSettings.withdrawal_pin && withdrawalSettings.withdrawal_pin !== currentPin) {
      setPinError("Current PIN is incorrect");
      return;
    }
    
    setChangingPin(true);
    
    try {
      const { error } = await supabase
        .from("withdrawal_settings")
        .update({
          withdrawal_pin: newPin,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", userId);

      if (error) throw error;
      
      setWithdrawalSettings({ ...withdrawalSettings, withdrawal_pin: newPin });
      setShowPinChangeModal(false);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      setPinError("");
      
      Alert.alert("Success", "Withdrawal PIN changed successfully!");
    } catch (err) {
      console.log("Error changing PIN:", err.message);
      setPinError("Failed to change PIN. Please try again.");
    } finally {
      setChangingPin(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      loadUserData(),
      loadWithdrawalSettings(),
      loadPayoutMethods()
    ]);
    setRefreshing(false);
  };

  const fetchProfile = async () => {
    try {
      const table = userType === 'commuter' ? 'commuters' : 'drivers';
      
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("id", userId)
        .single();

      if (error) throw error;

      if (data.profile_picture) {
        data.profile_picture = data.profile_picture + "?t=" + Date.now();
      }

      setProfile(data);
      setEditName(`${data.first_name || ''} ${data.last_name || ''}`.trim());
      setEditPhone(data.phone || "");
      setEditEmail(data.email || "");
    } catch (err) {
      console.log("Error fetching profile:", err.message);
    }
  };

  const fetchStats = async () => {
    try {
      const { data: bookings, error: bookingsError } = await supabase
        .from("bookings")
        .select("fare, actual_fare, status, created_at")
        .eq("commuter_id", userId)
        .eq("status", "completed");

      if (bookingsError) throw bookingsError;

      const totalTrips = bookings?.length || 0;
      const totalSpent = bookings?.reduce((sum, b) => sum + (b.actual_fare || b.fare || 0), 0) || 0;

      let points = 0;
      try {
        const { data: walletData } = await supabase
          .from("commuter_wallets")
          .select("points")
          .eq("commuter_id", userId)
          .single();
        points = walletData?.points || 0;
      } catch (walletErr) {
        console.log("No wallet found:", walletErr.message);
      }

      let referrals = 0;
      try {
        const { count: referralsCount } = await supabase
          .from("referrals")
          .select("*", { count: "exact", head: true })
          .eq("referrer_id", userId)
          .eq("referrer_type", userType);
        referrals = referralsCount || 0;
      } catch (refErr) {
        console.log("Error fetching referrals:", refErr.message);
      }

      const memberSince = bookings && bookings.length > 0 
        ? bookings[bookings.length - 1]?.created_at 
        : profile?.created_at;

      setStats({
        totalTrips,
        totalPoints: points,
        totalSpent,
        memberSince,
        referrals,
      });
    } catch (err) {
      console.log("Error fetching stats:", err.message);
    }
  };

  const handleUpdateProfile = async () => {
    try {
      const nameParts = editName.split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      const table = userType === 'commuter' ? 'commuters' : 'drivers';
      
      const { error } = await supabase
        .from(table)
        .update({
          first_name: firstName,
          last_name: lastName,
          phone: editPhone,
          email: editEmail,
          updated_at: new Date(),
        })
        .eq("id", userId);

      if (error) throw error;

      Alert.alert("Success", "Profile updated successfully");
      setEditProfileModal(false);
      fetchProfile();
    } catch (err) {
      console.log("Error updating profile:", err.message);
      Alert.alert("Error", "Failed to update profile");
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
            await AsyncStorage.multiRemove(["user_id", "user_type", "session"]);
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
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
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

        Alert.alert("Uploading", "Please wait...");

        const fileName = `${Date.now()}.jpg`;
        const filePath = `${userId}/${fileName}`;

        const response = await fetch(image.uri);
        const arrayBuffer = await response.arrayBuffer();

        const { data, error } = await supabase.storage
          .from("commuter-profiles")
          .upload(filePath, arrayBuffer, {
            contentType: "image/jpeg",
            upsert: true,
          });

        if (error) throw error;

        const { data: urlData } = supabase.storage
          .from("commuter-profiles")
          .getPublicUrl(filePath);

        const table = userType === 'commuter' ? 'commuters' : 'drivers';
        const { error: updateError } = await supabase
          .from(table)
          .update({
            profile_picture: urlData.publicUrl,
            updated_at: new Date(),
          })
          .eq("id", userId);

        if (updateError) throw updateError;

        setProfile(prev => ({
          ...prev,
          profile_picture: urlData.publicUrl + "?t=" + Date.now(),
        }));

        Alert.alert("Success", "Profile picture updated!");
      }
    } catch (err) {
      console.log("Error:", err);
      Alert.alert("Upload Failed", err.message);
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

  const getDefaultPaymentMethod = () => {
    if (!withdrawalSettings.default_payment_method_id) return null;
    return payoutMethods.find(m => m.id === withdrawalSettings.default_payment_method_id);
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 30 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header with Cover */}
      <View style={[styles.headerCover, { paddingTop: insets.top + 20 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} style={styles.headerButton}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </Pressable>

          <Text style={styles.headerTitle}>My Account</Text>

          <View style={{ width: 40 }} />
        </View>
      </View>

      {/* Profile Section - Overlapping Card */}
      <View style={styles.profileCard}>
        <View style={{ alignItems: "center" }}>
          {/* Profile Picture */}
          <Pressable onPress={pickImage} style={styles.avatarContainer}>
            <View style={styles.avatarWrapper}>
              {profile?.profile_picture ? (
                <Image
                  source={{ uri: profile.profile_picture }}
                  style={styles.avatar}
                />
              ) : (
                <LinearGradient
                  colors={["#183B5C", "#2C5A7A"]}
                  style={styles.avatarGradient}
                >
                  <Text style={styles.avatarText}>
                    {profile?.first_name?.[0]}{profile?.last_name?.[0]}
                  </Text>
                </LinearGradient>
              )}
            </View>
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={16} color="#FFF" />
            </View>
          </Pressable>

          <Text style={styles.profileName}>
            {profile ? `${profile.first_name} ${profile.last_name}` : "Loading..."}
          </Text>

          <View style={styles.userTypeBadge}>
            <Ionicons name="person" size={14} color="#666" />
            <Text style={styles.userTypeText}>Passenger</Text>
          </View>

          <Pressable style={styles.editProfileButton} onPress={() => setEditProfileModal(true)}>
            <Ionicons name="create-outline" size={16} color="#183B5C" />
            <Text style={styles.editProfileText}>Edit Profile</Text>
          </Pressable>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.totalTrips}</Text>
            <Text style={styles.statLabel}>Total Trips</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statValue}>₱{stats.totalSpent.toFixed(0)}</Text>
            <Text style={styles.statLabel}>Total Spent</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statRow}>
              <Text style={styles.statValue}>{stats.totalPoints}</Text>
              <Ionicons name="star" size={16} color="#F59E0B" />
            </View>
            <Text style={styles.statLabel}>Points</Text>
          </View>
        </View>
      </View>

      {/* Contact Information */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>📞 Contact Information</Text>

        <View style={styles.contactItem}>
          <Text style={styles.contactLabel}>Phone Number</Text>
          <View style={styles.contactRow}>
            <Ionicons name="call-outline" size={16} color="#183B5C" />
            <Text style={styles.contactValue}>{profile?.phone || "Not provided"}</Text>
          </View>
        </View>

        <View style={styles.contactItem}>
          <Text style={styles.contactLabel}>Email Address</Text>
          <View style={styles.contactRow}>
            <Ionicons name="mail-outline" size={16} color="#183B5C" />
            <Text style={styles.contactValue}>{profile?.email || "Not provided"}</Text>
          </View>
        </View>
      </View>

      {/* Referrals Info */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>🤝 Referrals</Text>

        <View style={styles.referralRow}>
          <View>
            <Text style={styles.referralLabel}>Total Referrals</Text>
            <Text style={styles.referralValue}>{stats.referrals}</Text>
          </View>
          <Pressable
            style={styles.inviteButton}
            onPress={() => navigation.navigate("ReferralScreen")}
          >
            <Text style={styles.inviteButtonText}>Invite</Text>
          </Pressable>
        </View>
      </View>

      {/* Withdrawal Settings Section */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>💰 Withdrawal Settings</Text>

        <Pressable style={styles.menuItem} onPress={() => setShowWithdrawalSettingsModal(true)}>
          <Ionicons name="settings-outline" size={22} color="#183B5C" style={styles.menuIcon} />
          <Text style={styles.menuText}>Withdrawal Preferences</Text>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </Pressable>

        <Pressable style={styles.menuItem} onPress={() => setShowPinChangeModal(true)}>
          <Ionicons name="key-outline" size={22} color="#183B5C" style={styles.menuIcon} />
          <Text style={styles.menuText}>Change Withdrawal PIN</Text>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </Pressable>

        {getDefaultPaymentMethod() && (
          <View style={styles.defaultMethodInfo}>
            <Ionicons name="card-outline" size={16} color="#10B981" />
            <Text style={styles.defaultMethodText}>
              Default: {getDefaultPaymentMethod().payment_type.toUpperCase()} - {getDefaultPaymentMethod().account_number}
            </Text>
          </View>
        )}
      </View>

      {/* Account Settings */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>⚙️ Account Settings</Text>

        <Pressable style={styles.menuItem} onPress={() => navigation.navigate("PointsRewards")}>
          <Ionicons name="star-outline" size={22} color="#183B5C" style={styles.menuIcon} />
          <Text style={styles.menuText}>Points & Rewards</Text>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </Pressable>

        <Pressable style={styles.menuItem} onPress={() => navigation.navigate("PaymentMethods")}>
          <Ionicons name="wallet-outline" size={22} color="#183B5C" style={styles.menuIcon} />
          <Text style={styles.menuText}>Payment Methods</Text>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </Pressable>

        {/* <Pressable style={styles.menuItem} onPress={() => navigation.navigate("RideHistory")}>
          <Ionicons name="time-outline" size={22} color="#183B5C" style={styles.menuIcon} />
          <Text style={styles.menuText}>Ride History</Text>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </Pressable> */}

        <Pressable style={[styles.menuItem, styles.lastMenuItem]} onPress={() => Linking.openURL("https://sakay.ph/help")}>
          <Ionicons name="help-circle-outline" size={22} color="#183B5C" style={styles.menuIcon} />
          <Text style={styles.menuText}>Help Center</Text>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </Pressable>
      </View>

      {/* Legal Links */}
      <View style={styles.sectionCard}>
        <Pressable style={styles.menuItem} onPress={() => Linking.openURL("https://sakay.ph/terms")}>
          <Ionicons name="document-text-outline" size={22} color="#183B5C" style={styles.menuIcon} />
          <Text style={styles.menuText}>Terms of Service</Text>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </Pressable>

        <Pressable style={[styles.menuItem, styles.lastMenuItem]} onPress={() => Linking.openURL("https://sakay.ph/privacy")}>
          <Ionicons name="lock-closed-outline" size={22} color="#183B5C" style={styles.menuIcon} />
          <Text style={styles.menuText}>Privacy Policy</Text>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </Pressable>
      </View>

      {/* Sign Out Button */}
      <Pressable style={styles.signOutButton} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={20} color="#EF4444" />
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>

      {/* App Info */}
      <View style={styles.appInfo}>
        <Text style={styles.appVersion}>SakayNa Passenger v1.0.0</Text>
        <Text style={styles.memberSince}>
          Member since: {formatDate(profile?.created_at || stats.memberSince)}
        </Text>
      </View>

      {/* Edit Profile Modal */}
      <Modal
        visible={editProfileModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setEditProfileModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalContainer}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Profile</Text>
                <Pressable onPress={() => setEditProfileModal(false)}>
                  <Ionicons name="close" size={24} color="#666" />
                </Pressable>
              </View>

              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.inputLabel}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your full name"
                  value={editName}
                  onChangeText={setEditName}
                />

                <Text style={styles.inputLabel}>Phone Number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter phone number"
                  keyboardType="phone-pad"
                  value={editPhone}
                  onChangeText={setEditPhone}
                />

                <Text style={styles.inputLabel}>Email Address</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter email address"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={editEmail}
                  onChangeText={setEditEmail}
                />

                <View style={styles.modalButtons}>
                  <Pressable
                    style={styles.cancelButton}
                    onPress={() => setEditProfileModal(false)}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </Pressable>

                  <Pressable
                    style={styles.saveButton}
                    onPress={handleUpdateProfile}
                  >
                    <Text style={styles.saveButtonText}>Save</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Withdrawal Settings Modal */}
      <Modal
        visible={showWithdrawalSettingsModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowWithdrawalSettingsModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalContainer}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Withdrawal Preferences</Text>
                <Pressable onPress={() => setShowWithdrawalSettingsModal(false)}>
                  <Ionicons name="close" size={24} color="#666" />
                </Pressable>
              </View>

              <ScrollView keyboardShouldPersistTaps="handled">
                {/* Default Payout Method */}
                <Text style={styles.inputLabel}>Default Payout Method</Text>
                <View style={styles.pickerContainer}>
                  <Pressable
                    style={styles.pickerButton}
                  >
                    <Text style={styles.pickerButtonText}>
                      {getDefaultPaymentMethod() 
                        ? `${getDefaultPaymentMethod().payment_type.toUpperCase()} - ${getDefaultPaymentMethod().account_number}`
                        : "Select payout method"}
                    </Text>
                    <Ionicons name="chevron-forward" size={20} color="#666" />
                  </Pressable>
                </View>

                {/* Auto Withdraw Toggle */}
                <View style={styles.toggleContainer}>
                  <View>
                    <Text style={styles.inputLabel}>Auto Withdraw</Text>
                    <Text style={styles.toggleDescription}>
                      Automatically withdraw when balance reaches threshold
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setTempSettings({
                      ...tempSettings,
                      auto_withdraw: !tempSettings.auto_withdraw
                    })}
                  >
                    <View style={[styles.toggle, tempSettings.auto_withdraw && styles.toggleActive]}>
                      <View style={[styles.toggleHandle, tempSettings.auto_withdraw && styles.toggleHandleActive]} />
                    </View>
                  </Pressable>
                </View>

                {/* Auto Withdraw Threshold */}
                {tempSettings.auto_withdraw && (
                  <>
                    <Text style={styles.inputLabel}>Auto Withdraw Threshold (₱)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g., 500"
                      keyboardType="numeric"
                      value={tempSettings.auto_withdraw_threshold?.toString() || ""}
                      onChangeText={(text) => setTempSettings({
                        ...tempSettings,
                        auto_withdraw_threshold: text ? parseFloat(text) : null
                      })}
                    />
                  </>
                )}

                {/* Withdrawal Limits */}
                <Text style={styles.sectionSubtitle}>Withdrawal Limits</Text>
                
                <Text style={styles.inputLabel}>Daily Limit (₱)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 5000"
                  keyboardType="numeric"
                  value={tempSettings.daily_withdrawal_limit?.toString() || ""}
                  onChangeText={(text) => setTempSettings({
                    ...tempSettings,
                    daily_withdrawal_limit: text ? parseFloat(text) : null
                  })}
                />

                <Text style={styles.inputLabel}>Weekly Limit (₱)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 20000"
                  keyboardType="numeric"
                  value={tempSettings.weekly_withdrawal_limit?.toString() || ""}
                  onChangeText={(text) => setTempSettings({
                    ...tempSettings,
                    weekly_withdrawal_limit: text ? parseFloat(text) : null
                  })}
                />

                <Text style={styles.inputLabel}>Monthly Limit (₱)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 50000"
                  keyboardType="numeric"
                  value={tempSettings.monthly_withdrawal_limit?.toString() || ""}
                  onChangeText={(text) => setTempSettings({
                    ...tempSettings,
                    monthly_withdrawal_limit: text ? parseFloat(text) : null
                  })}
                />

                {/* Notification Toggle */}
                <View style={styles.toggleContainer}>
                  <View>
                    <Text style={styles.inputLabel}>Withdrawal Notifications</Text>
                    <Text style={styles.toggleDescription}>
                      Receive notifications about your withdrawals
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setTempSettings({
                      ...tempSettings,
                      notifications_enabled: !tempSettings.notifications_enabled
                    })}
                  >
                    <View style={[styles.toggle, tempSettings.notifications_enabled && styles.toggleActive]}>
                      <View style={[styles.toggleHandle, tempSettings.notifications_enabled && styles.toggleHandleActive]} />
                    </View>
                  </Pressable>
                </View>

                <View style={styles.modalButtons}>
                  <Pressable
                    style={styles.cancelButton}
                    onPress={() => setShowWithdrawalSettingsModal(false)}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </Pressable>

                  <Pressable
                    style={styles.saveButton}
                    onPress={updateWithdrawalSettings}
                  >
                    <Text style={styles.saveButtonText}>Save Settings</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Change PIN Modal */}
      <Modal
        visible={showPinChangeModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPinChangeModal(false)}
      >
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalCenterContent}>
            <View style={styles.modalCenterHeader}>
              <Ionicons name="key" size={48} color="#183B5C" />
              <Text style={styles.modalCenterTitle}>Change Withdrawal PIN</Text>
              <Text style={styles.modalCenterSubtitle}>
                Enter your current PIN and create a new one
              </Text>
            </View>

            {withdrawalSettings.withdrawal_pin && (
              <>
                <Text style={styles.inputLabel}>Current PIN</Text>
                <TextInput
                  style={[styles.pinInput, pinError && styles.pinInputError]}
                  placeholder="****"
                  keyboardType="number-pad"
                  maxLength={4}
                  secureTextEntry
                  value={currentPin}
                  onChangeText={(text) => {
                    setCurrentPin(text);
                    setPinError("");
                  }}
                />
              </>
            )}

            <Text style={styles.inputLabel}>New PIN</Text>
            <TextInput
              style={[styles.pinInput, pinError && styles.pinInputError]}
              placeholder="****"
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              value={newPin}
              onChangeText={(text) => {
                setNewPin(text);
                setPinError("");
              }}
            />

            <Text style={styles.inputLabel}>Confirm New PIN</Text>
            <TextInput
              style={[styles.pinInput, pinError && styles.pinInputError]}
              placeholder="****"
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              value={confirmPin}
              onChangeText={(text) => {
                setConfirmPin(text);
                setPinError("");
              }}
            />

            {pinError ? (
              <Text style={styles.pinErrorText}>{pinError}</Text>
            ) : null}

            <View style={styles.modalCenterActions}>
              <Pressable
                style={styles.modalCenterCancel}
                onPress={() => {
                  setShowPinChangeModal(false);
                  setCurrentPin("");
                  setNewPin("");
                  setConfirmPin("");
                  setPinError("");
                }}
              >
                <Text style={styles.modalCenterCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.modalCenterConfirm}
                onPress={changePin}
                disabled={changingPin}
              >
                {changingPin ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.modalCenterConfirmText}>Change PIN</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
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
  headerCover: {
    backgroundColor: "#183B5C",
    paddingBottom: 60,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFF",
  },
  profileCard: {
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
  },
  avatarContainer: {
    position: "relative",
    marginBottom: 10,
  },
  avatarWrapper: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "#FFF",
  },
  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: 50,
  },
  avatarGradient: {
    width: "100%",
    height: "100%",
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#FFF",
  },
  cameraBadge: {
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
  },
  profileName: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 5,
  },
  userTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 10,
  },
  userTypeText: {
    color: "#666",
    fontWeight: "500",
    marginLeft: 4,
  },
  editProfileButton: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  editProfileText: {
    color: "#183B5C",
    fontWeight: "600",
    marginLeft: 5,
  },
  statsGrid: {
    flexDirection: "row",
    marginTop: 20,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 12,
    alignItems: "center",
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#183B5C",
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  sectionCard: {
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
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 15,
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginTop: 15,
    marginBottom: 10,
  },
  contactItem: {
    marginBottom: 12,
  },
  contactLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  contactValue: {
    fontSize: 16,
    color: "#333",
    marginLeft: 8,
  },
  referralRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  referralLabel: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  referralValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#183B5C",
  },
  inviteButton: {
    backgroundColor: "#183B5C",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  inviteButtonText: {
    color: "#FFF",
    fontWeight: "600",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  lastMenuItem: {
    borderBottomWidth: 0,
  },
  menuIcon: {
    width: 30,
  },
  menuText: {
    flex: 1,
    color: "#333",
  },
  defaultMethodInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    padding: 10,
    backgroundColor: "#F0FDF4",
    borderRadius: 12,
    gap: 8,
  },
  defaultMethodText: {
    fontSize: 12,
    color: "#10B981",
    flex: 1,
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEE2E2",
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 10,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  signOutText: {
    color: "#EF4444",
    fontSize: 16,
    fontWeight: "600",
  },
  appInfo: {
    alignItems: "center",
    marginTop: 10,
    marginBottom: 10,
  },
  appVersion: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  memberSince: {
    fontSize: 11,
    color: "#D1D5DB",
    marginTop: 2,
  },
  modalContainer: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: "90%",
  },
  modalCenterContent: {
    backgroundColor: "#FFF",
    borderRadius: 24,
    padding: 20,
    width: "90%",
    maxWidth: 350,
  },
  modalCenterHeader: {
    alignItems: "center",
    marginBottom: 20,
  },
  modalCenterTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginTop: 10,
  },
  modalCenterSubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginTop: 5,
  },
  modalCenterActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
  },
  modalCenterCancel: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
  },
  modalCenterCancelText: {
    textAlign: "center",
    color: "#666",
  },
  modalCenterConfirm: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#183B5C",
  },
  modalCenterConfirmText: {
    textAlign: "center",
    color: "#FFF",
    fontWeight: "600",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    marginBottom: 15,
  },
  pinInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    fontSize: 24,
    textAlign: "center",
    letterSpacing: 8,
    marginBottom: 15,
  },
  pinInputError: {
    borderColor: "#EF4444",
  },
  pinErrorText: {
    color: "#EF4444",
    fontSize: 12,
    marginBottom: 15,
    textAlign: "center",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#333",
    fontWeight: "600",
  },
  saveButton: {
    flex: 1,
    backgroundColor: "#183B5C",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  saveButtonText: {
    color: "#FFF",
    fontWeight: "600",
  },
  pickerContainer: {
    marginBottom: 15,
  },
  pickerButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#F9FAFB",
  },
  pickerButtonText: {
    fontSize: 16,
    color: "#333",
  },
  toggleContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  toggleDescription: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  toggle: {
    width: 50,
    height: 28,
    backgroundColor: "#E5E7EB",
    borderRadius: 28,
    padding: 2,
  },
  toggleActive: {
    backgroundColor: "#10B981",
  },
  toggleHandle: {
    width: 24,
    height: 24,
    backgroundColor: "#FFF",
    borderRadius: 24,
  },
  toggleHandleActive: {
    transform: [{ translateX: 22 }],
  },
});