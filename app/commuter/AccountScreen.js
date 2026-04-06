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
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import packageJson from '../../package.json';
import { getUserSession } from '../utils/authStorage'; // ✅ Import test account session

const base64ToArrayBuffer = (base64) => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};
const { width } = Dimensions.get("window");

// scaling function (same sa ginawa natin kanina)
const scale = (size) => (width / 375) * size;
const appVersion = packageJson.version;

export default function AccountScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState(null);
  const [userType, setUserType] = useState('commuter');
  const [isTestAccount, setIsTestAccount] = useState(false); // ✅ Track if test account
  const [profile, setProfile] = useState(null);
  
  // URLs from database
  const [helpCenterUrl, setHelpCenterUrl] = useState(null);
  const [termsUrl, setTermsUrl] = useState(null);
  const [privacyUrl, setPrivacyUrl] = useState(null);
  const [urlsLoading, setUrlsLoading] = useState(true);
  
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
  
  // Modal states - REMOVED editName since name is not editable
  const [editProfileModal, setEditProfileModal] = useState(false);
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

  // Helper function to open URLs with validation
  const openUrl = async (url, name) => {
    if (!url) {
      Alert.alert("Error", `${name} URL is not configured. Please contact support.`);
      return;
    }

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Error", `Cannot open ${name.toLowerCase()} URL.`);
      }
    } catch (err) {
      console.log(`Error opening ${name}:`, err);
      Alert.alert("Error", `Failed to open ${name.toLowerCase()}.`);
    }
  };

  // Fetch user ID and check if test account
  useFocusEffect(
    useCallback(() => {
      const getUserId = async () => {
        // ✅ Check test account session first
        const session = await getUserSession();
        
        if (session && session.isTestAccount) {
          console.log("✅ Test account detected in AccountScreen");
          setIsTestAccount(true);
          setUserId(session.phone); // Use phone as identifier for test accounts
          setUserType(session.userType);
          
          // Create mock profile for test account
          const mockProfile = {
            first_name: session.userType === 'commuter' ? 'Test' : 'Test',
            last_name: session.userType === 'commuter' ? 'Commuter' : 'Driver',
            phone: session.phone,
            email: `${session.userType}@test.com`,
            profile_picture: null,
            created_at: new Date().toISOString(),
          };
          setProfile(mockProfile);
          setEditPhone(mockProfile.phone);
          setEditEmail(mockProfile.email);
          setLoading(false);
        } else {
          // Normal user flow
          const id = await AsyncStorage.getItem("user_id");
          const type = await AsyncStorage.getItem("user_type") || 'commuter';
          setUserId(id);
          setUserType(type);
          setIsTestAccount(false);
        }
      };
      getUserId();
      fetchSystemUrls(); // Fetch URLs from database
    }, [])
  );

  // Fetch all user data (only for normal users)
  useEffect(() => {
    if (userId && !isTestAccount) {
      loadUserData();
      loadWithdrawalSettings();
      loadPayoutMethods();
    }
  }, [userId, isTestAccount]);

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
    if (isTestAccount) return; // Skip for test accounts
    
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
    if (isTestAccount) return; // Skip for test accounts
    
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
    if (isTestAccount) {
      Alert.alert("Test Account", "This feature is disabled for test accounts.");
      return;
    }
    
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
    if (isTestAccount) {
      Alert.alert("Test Account", "This feature is disabled for test accounts.");
      return;
    }
    
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
    if (isTestAccount) {
      setRefreshing(false);
      return;
    }
    
    setRefreshing(true);
    await Promise.all([
      loadUserData(),
      loadWithdrawalSettings(),
      loadPayoutMethods(),
      fetchSystemUrls() // Refresh URLs on pull-to-refresh
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
      setEditPhone(data.phone || "");
      setEditEmail(data.email || "");
    } catch (err) {
      console.log("Error fetching profile:", err.message);
    }
  };

  const fetchStats = async () => {
    if (isTestAccount) {
      // Set mock stats for test account
      setStats({
        totalTrips: 0,
        totalPoints: 0,
        totalSpent: 0,
        memberSince: new Date().toISOString(),
        referrals: 0,
      });
      return;
    }
    
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
    if (isTestAccount) {
      Alert.alert("Test Account", "Profile updates are disabled for test accounts.");
      return;
    }
    
    try {
      const table = userType === 'commuter' ? 'commuters' : 'drivers';
      
      const { error } = await supabase
        .from(table)
        .update({
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
            // Clear test account session if exists
            const session = await getUserSession();
            if (session && session.isTestAccount) {
              await AsyncStorage.removeItem('@sakayna_user_session');
              await AsyncStorage.removeItem('@sakayna_test_account');
            } else {
              await AsyncStorage.multiRemove(["user_id", "user_type", "session"]);
              await supabase.auth.signOut();
            }
            navigation.replace("UserType");
          } catch (err) {
            console.log("Error signing out:", err.message);
          }
        },
      },
    ]);
  };

  const pickImage = async () => {
    if (isTestAccount) {
      Alert.alert("Test Account", "Profile picture updates are disabled for test accounts.");
      return;
    }
    
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
    if (isTestAccount) return null;
    if (!withdrawalSettings.default_payment_method_id) return null;
    return payoutMethods.find(m => m.id === withdrawalSettings.default_payment_method_id);
  };

  // Show loading only for normal users who are still loading
  if (loading && !isTestAccount && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
      </View>
    );
  }

  return (
    <ScrollView
  style={styles.container}
  contentContainerStyle={{
    paddingBottom: insets.bottom + 120,
  }}
  showsVerticalScrollIndicator={false}
  refreshControl={
    !isTestAccount ? (
      <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
    ) : undefined
  }
>
      {/* Test Account Banner */}
      {isTestAccount && (
        <View style={styles.testBanner}>
          <Ionicons name="flask" size={20} color="#E97A3E" />
          <Text style={styles.testBannerText}>Test Account Mode </Text>
        </View>
      )}

      {/* Header with Cover */}
      <View style={[styles.headerCover]}> 
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} style={styles.headerButton}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </Pressable>
          <View style={{ width: 40 }} />
        </View>
      </View>

      {/* Profile Section - Overlapping Card */}
      <View style={styles.profileCard}>
        <View style={{ alignItems: "center" }}>
          {/* Profile Picture */}
          <Pressable onPress={pickImage} style={styles.avatarContainer} disabled={isTestAccount}>
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
            {!isTestAccount && (
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={16} color="#FFF" />
              </View>
            )}
          </Pressable>

          <Text style={styles.profileName}>
            {profile ? `${profile.first_name} ${profile.last_name}` : "Loading..."}
          </Text>

          <View style={styles.userTypeBadge}>
            <Ionicons name="person" size={14} color="#666" />
            <Text style={styles.userTypeText}>
              {userType === 'commuter' ? 'Passenger' : 'Driver'}
            </Text>
          </View>

          {!isTestAccount && (
            <Pressable style={styles.editProfileButton} onPress={() => setEditProfileModal(true)}>
              <Ionicons name="create-outline" size={16} color="#183B5C" />
              <Text style={styles.editProfileText}>Edit Contact Info</Text>
            </Pressable>
          )}
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
          {!isTestAccount && (
            <Pressable
              style={styles.inviteButton}
              onPress={() => navigation.navigate("ReferralScreen")}
            >
              <Text style={styles.inviteButtonText}>Invite</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Withdrawal Settings Section - Hide for test accounts
      {!isTestAccount && (
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
      )} */}

      {/* Account Settings */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>⚙️ Account Settings</Text>

        <Pressable style={styles.menuItem} onPress={() => navigation.navigate("PointsRewards")}>
          <Ionicons name="star-outline" size={22} color="#183B5C" style={styles.menuIcon} />
          <Text style={styles.menuText}>Points & Rewards</Text>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </Pressable>

        {/* <Pressable style={styles.menuItem} onPress={() => navigation.navigate("PaymentMethods")}>
          <Ionicons name="wallet-outline" size={22} color="#183B5C" style={styles.menuIcon} />
          <Text style={styles.menuText}>Payment Methods</Text>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </Pressable> */}

        {/* Help Center - Using URL from database */}
        <Pressable 
          style={styles.menuItem} 
          onPress={() => navigation.navigate("Support")}
        >
          <Ionicons name="help-circle-outline" size={22} color="#183B5C" style={styles.menuIcon} />
          <Text style={styles.menuText}>Help Center</Text>
          {urlsLoading ? (
            <ActivityIndicator size="small" color="#9CA3AF" />
          ) : (
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          )}
        </Pressable>
      </View>

      {/* Legal Links - Using URLs from database */}
      <View style={styles.sectionCard}>
        <Pressable 
          style={styles.menuItem} 
          onPress={() => openUrl(termsUrl, "Terms of Service")}
        >
          <Ionicons name="document-text-outline" size={22} color="#183B5C" style={styles.menuIcon} />
          <Text style={styles.menuText}>Terms of Service</Text>
          {urlsLoading ? (
            <ActivityIndicator size="small" color="#9CA3AF" />
          ) : (
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          )}
        </Pressable>

        <Pressable 
          style={[styles.menuItem, styles.lastMenuItem]} 
          onPress={() => openUrl(privacyUrl, "Privacy Policy")}
        >
          <Ionicons name="lock-closed-outline" size={22} color="#183B5C" style={styles.menuIcon} />
          <Text style={styles.menuText}>Privacy Policy</Text>
          {urlsLoading ? (
            <ActivityIndicator size="small" color="#9CA3AF" />
          ) : (
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          )}
        </Pressable>
      </View>

      {/* Sign Out Button */}
      <Pressable style={styles.signOutButton} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={20} color="#EF4444" />
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>

      {/* App Info */}
      <View style={styles.appInfo}>
        <Text style={styles.appVersion}>
          SakayNa Passenger v{appVersion}
        </Text>
        <Text style={styles.memberSince}>
          © 2026 SakayNa. Developed by Ian Dave Lemera. All rights reserved.
        </Text>
      </View>

      {/* Edit Profile Modal - Only show for normal users */}
      {!isTestAccount && (
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
                  <Text style={styles.modalTitle}>Edit Contact Information</Text>
                  <Pressable onPress={() => setEditProfileModal(false)}>
                    <Ionicons name="close" size={24} color="#666" />
                  </Pressable>
                </View>

                <ScrollView keyboardShouldPersistTaps="handled">
                  {/* Name Display (Read-only) */}
                  <Text style={styles.inputLabel}>Full Name</Text>
                  <View style={styles.readOnlyField}>
                    <Text style={styles.readOnlyText}>
                      {profile ? `${profile.first_name} ${profile.last_name}` : "Loading..."}
                    </Text>
                  </View>

                  {/* Phone Number */}
                  <Text style={styles.inputLabel}>Phone Number</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter phone number"
                    keyboardType="phone-pad"
                    value={editPhone}
                    onChangeText={setEditPhone}
                  />

                  {/* Email Address */}
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
      )}

      {/* Withdrawal Settings Modal - Only show for normal users */}
      {!isTestAccount && (
        <Modal
          visible={showWithdrawalSettingsModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowWithdrawalSettingsModal(false)}
        >
          {/* ... existing withdrawal settings modal code ... */}
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
                    <Pressable style={styles.pickerButton}>
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
      )}

      {/* Change PIN Modal - Only show for normal users */}
      {!isTestAccount && (
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
      )}
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
    paddingBottom: scale(60),
    paddingHorizontal: scale(20),
    borderBottomLeftRadius: scale(30),
    borderBottomRightRadius: scale(30),
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  headerButton: {
    width: scale(40),
    height: scale(40),
    justifyContent: "center",
  },

  profileCard: {
    marginHorizontal: scale(20),
    marginTop: -scale(40),
    backgroundColor: "#FFF",
    borderRadius: scale(24),
    padding: scale(20),
    elevation: 5,
  },

  avatarContainer: {
    position: "relative",
    marginBottom: scale(10),
  },

  avatarWrapper: {
    width: scale(90),
    height: scale(90),
    borderRadius: scale(45),
    backgroundColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#FFF",
  },

  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: scale(45),
  },

  avatarGradient: {
    width: "100%",
    height: "100%",
    borderRadius: scale(45),
    justifyContent: "center",
    alignItems: "center",
  },

  avatarText: {
    fontSize: scale(28),
    fontWeight: "bold",
    color: "#FFF",
  },

  cameraBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#183B5C",
    width: scale(26),
    height: scale(26),
    borderRadius: scale(13),
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFF",
  },

  profileName: {
    fontSize: scale(18),
    fontWeight: "bold",
    color: "#333",
  },

  userTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: scale(10),
    paddingVertical: scale(4),
    borderRadius: scale(20),
    marginTop: scale(5),
  },

  userTypeText: {
    fontSize: scale(12),
    color: "#666",
    marginLeft: 4,
  },

  editProfileButton: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: scale(14),
    paddingVertical: scale(6),
    borderRadius: scale(20),
    flexDirection: "row",
    alignItems: "center",
    marginTop: scale(8),
  },

  editProfileText: {
    fontSize: scale(12),
    color: "#183B5C",
    marginLeft: 5,
  },

  statsGrid: {
    flexDirection: "row",
    marginTop: scale(16),
    gap: scale(8),
  },

  statCard: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: scale(14),
    padding: scale(10),
    alignItems: "center",
  },

  statValue: {
    fontSize: scale(16),
    fontWeight: "bold",
    color: "#183B5C",
  },

  statLabel: {
    fontSize: scale(10),
    color: "#666",
  },

  sectionCard: {
    marginHorizontal: scale(20),
    marginTop: scale(16),
    backgroundColor: "#FFF",
    borderRadius: scale(20),
    padding: scale(16),
    elevation: 2,
  },

  sectionTitle: {
    fontSize: scale(14),
    fontWeight: "bold",
    color: "#333",
    marginBottom: scale(12),
  },

  contactValue: {
    fontSize: scale(14),
    marginLeft: scale(6),
  },

  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: scale(12),
  },

  menuText: {
    flex: 1,
    fontSize: scale(14),
  },

  signOutButton: {
    flexDirection: "row",
    justifyContent: "center",
    backgroundColor: "#FEE2E2",
    marginHorizontal: scale(20),
    marginTop: scale(16),
    padding: scale(14),
    borderRadius: scale(12),
  },

  signOutText: {
    fontSize: scale(14),
    color: "#EF4444",
    fontWeight: "600",
  },

  appInfo: {
  alignItems: "center",
  marginTop: scale(10),
  marginBottom: scale(20),
},

  appVersion: {
    fontSize: scale(10),
    color: "#9CA3AF",
  },

  memberSince: {
    fontSize: scale(10),
    color: "#D1D5DB",
    textAlign: "center",
  },

  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: scale(24),
    borderTopRightRadius: scale(24),
    padding: scale(16),
    maxHeight: "85%",
  },

  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: scale(10),
    padding: scale(10),
    fontSize: scale(14),
  },

  pinInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: scale(10),
    padding: scale(12),
    fontSize: scale(20),
    textAlign: "center",
    letterSpacing: 6,
  },

  modalButtons: {
    flexDirection: "row",
    gap: scale(8),
    marginTop: scale(10),
  },

  saveButton: {
    flex: 1,
    backgroundColor: "#183B5C",
    padding: scale(12),
    borderRadius: scale(10),
    alignItems: "center",
  },

  cancelButton: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    padding: scale(12),
    borderRadius: scale(10),
    alignItems: "center",
  },

  testBanner: {
    backgroundColor: "#FFF3E0",
    padding: scale(8),
    flexDirection: "row",
    justifyContent: "center",
  },

  testBannerText: {
    fontSize: scale(11),
    color: "#E97A3E",
  },
});