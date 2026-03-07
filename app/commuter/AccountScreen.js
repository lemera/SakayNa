// screens/commuter/AccountScreen.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Image,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from 'expo-haptics';

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState(null);
  const [userType, setUserType] = useState('commuter');
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({
    totalTrips: 0,
    totalPoints: 0,
    memberSince: null,
    referrals: 0,
  });

  // Edit profile modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [updating, setUpdating] = useState(false);

  // Settings
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const [language, setLanguage] = useState('english');

  // Security
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useFocusEffect(
    React.useCallback(() => {
      loadUserData();
    }, [])
  );

  const loadUserData = async () => {
    try {
      const id = await AsyncStorage.getItem("user_id");
      const type = await AsyncStorage.getItem("user_type") || 'commuter';
      setUserId(id);
      setUserType(type);
      
      if (id) {
        await Promise.all([
          fetchProfile(id, type),
          fetchStats(id, type),
          fetchSettings(id, type)
        ]);
      }
    } catch (err) {
      console.log("Error loading user data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchProfile = async (id, type) => {
    try {
      const table = type === 'commuter' ? 'commuters' : 'drivers';
      
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (err) {
      console.log("Error fetching profile:", err);
    }
  };

  const fetchStats = async (id, type) => {
    try {
      // Get total trips
      const { count: tripsCount, error: tripsError } = await supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq(type === 'commuter' ? "commuter_id" : "driver_id", id)
        .eq("status", "completed");

      if (tripsError) throw tripsError;

      // Get total points (for commuters)
      let points = 0;
      if (type === 'commuter') {
        const { data: walletData } = await supabase
          .from("commuter_wallets")
          .select("points")
          .eq("commuter_id", id)
          .single();

        points = walletData?.points || 0;
      }

      // Get member since (first booking or created_at)
      const { data: firstBooking } = await supabase
        .from("bookings")
        .select("created_at")
        .eq(type === 'commuter' ? "commuter_id" : "driver_id", id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      // Get referrals count
      const { count: referralsCount } = await supabase
        .from("referrals")
        .select("*", { count: "exact", head: true })
        .eq("referrer_id", id)
        .eq("referrer_type", type);

      setStats({
        totalTrips: tripsCount || 0,
        totalPoints: points,
        memberSince: firstBooking?.created_at || profile?.created_at,
        referrals: referralsCount || 0,
      });
    } catch (err) {
      console.log("Error fetching stats:", err);
    }
  };

  const fetchSettings = async (id, type) => {
    try {
      const table = type === 'commuter' ? 'commuter_settings' : 'driver_settings';
      
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq(type === 'commuter' ? "commuter_id" : "driver_id", id)
        .maybeSingle();

      if (data) {
        setNotificationsEnabled(data.notifications_enabled ?? true);
        setDarkModeEnabled(data.dark_mode_enabled ?? false);
        setLanguage(data.language || 'english');
      }
    } catch (err) {
      console.log("Error fetching settings:", err);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadUserData();
  };

  const handleEditField = (field, currentValue) => {
    setEditingField(field);
    setEditValue(currentValue || '');
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editValue.trim()) {
      Alert.alert("Error", "Please enter a value");
      return;
    }

    setUpdating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const table = userType === 'commuter' ? 'commuters' : 'drivers';
      const updates = { [editingField]: editValue };

      const { error } = await supabase
        .from(table)
        .update(updates)
        .eq("id", userId);

      if (error) throw error;

      // Update local state
      setProfile(prev => ({ ...prev, [editingField]: editValue }));
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Profile updated successfully!");
      setShowEditModal(false);
      setEditingField(null);
      setEditValue('');
    } catch (err) {
      console.log("Error updating profile:", err);
      Alert.alert("Error", "Failed to update profile.");
    } finally {
      setUpdating(false);
    }
  };

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert("Permission Required", "Please grant camera roll permissions to change your profile picture.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        
        // Upload image to Supabase Storage
        const fileName = `profiles/${userId}/${Date.now()}.jpg`;
        const response = await fetch(result.assets[0].uri);
        const blob = await response.blob();
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("profiles")
          .upload(fileName, blob);

        if (uploadError) throw uploadError;

        const profileUrl = supabase.storage.from("profiles").getPublicUrl(fileName).data.publicUrl;

        // Update profile with new image URL
        const table = userType === 'commuter' ? 'commuters' : 'drivers';
        const { error: updateError } = await supabase
          .from(table)
          .update({ profile_picture: profileUrl })
          .eq("id", userId);

        if (updateError) throw updateError;

        setProfile(prev => ({ ...prev, profile_picture: profileUrl }));
        
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Success", "Profile picture updated!");
      }
    } catch (err) {
      console.log("Error updating profile picture:", err);
      Alert.alert("Error", "Failed to update profile picture.");
    }
  };

  const handleToggleNotification = async (value) => {
    setNotificationsEnabled(value);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const table = userType === 'commuter' ? 'commuter_settings' : 'driver_settings';
      const idField = userType === 'commuter' ? 'commuter_id' : 'driver_id';
      
      // Check if settings exist
      const { data: existing } = await supabase
        .from(table)
        .select("id")
        .eq(idField, userId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from(table)
          .update({ notifications_enabled: value })
          .eq(idField, userId);
      } else {
        await supabase
          .from(table)
          .insert({ [idField]: userId, notifications_enabled: value });
      }
    } catch (err) {
      console.log("Error updating settings:", err);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }

    setUpdating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // In a real app, you would verify the current password
      // For now, we'll just update
      
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Password updated successfully!");
      setShowChangePasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.log("Error changing password:", err);
      Alert.alert("Error", "Failed to change password.");
    } finally {
      setUpdating(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          style: "destructive",
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            
            await AsyncStorage.multiRemove(["user_id", "user_type", "session"]);
            navigation.reset({
              index: 0,
              routes: [{ name: "Login" }],
            });
          }
        }
      ]
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  // Edit Profile Modal
  const EditModal = () => (
    <Modal
      visible={showEditModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => {
        setShowEditModal(false);
        setEditingField(null);
        setEditValue('');
      }}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              Edit {editingField === 'first_name' ? 'First Name' :
                     editingField === 'last_name' ? 'Last Name' :
                     editingField === 'phone' ? 'Phone Number' :
                     editingField === 'email' ? 'Email' : 'Profile'}
            </Text>
            <Pressable 
              style={styles.modalCloseButton}
              onPress={() => {
                setShowEditModal(false);
                setEditingField(null);
                setEditValue('');
              }}
            >
              <Ionicons name="close" size={24} color="#666" />
            </Pressable>
          </View>

          <TextInput
            style={styles.modalInput}
            value={editValue}
            onChangeText={setEditValue}
            placeholder={`Enter your ${editingField?.replace('_', ' ')}`}
            keyboardType={editingField === 'phone' ? 'phone-pad' : 'default'}
            autoCapitalize={editingField === 'email' ? 'none' : 'words'}
          />

          <View style={styles.modalActions}>
            <Pressable
              style={styles.modalCancelButton}
              onPress={() => {
                setShowEditModal(false);
                setEditingField(null);
                setEditValue('');
              }}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalSaveButton, updating && styles.modalSaveButtonDisabled]}
              onPress={handleSaveEdit}
              disabled={updating}
            >
              {updating ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.modalSaveText}>Save</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  // Change Password Modal
  const ChangePasswordModal = () => (
    <Modal
      visible={showChangePasswordModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => {
        setShowChangePasswordModal(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Change Password</Text>
            <Pressable 
              style={styles.modalCloseButton}
              onPress={() => {
                setShowChangePasswordModal(false);
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
              }}
            >
              <Ionicons name="close" size={24} color="#666" />
            </Pressable>
          </View>

          <View style={styles.passwordInputContainer}>
            <Text style={styles.inputLabel}>Current Password</Text>
            <TextInput
              style={styles.passwordInput}
              secureTextEntry
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Enter current password"
            />
          </View>

          <View style={styles.passwordInputContainer}>
            <Text style={styles.inputLabel}>New Password</Text>
            <TextInput
              style={styles.passwordInput}
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Enter new password"
            />
          </View>

          <View style={styles.passwordInputContainer}>
            <Text style={styles.inputLabel}>Confirm New Password</Text>
            <TextInput
              style={styles.passwordInput}
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm new password"
            />
          </View>

          <View style={styles.modalActions}>
            <Pressable
              style={styles.modalCancelButton}
              onPress={() => {
                setShowChangePasswordModal(false);
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
              }}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalSaveButton, updating && styles.modalSaveButtonDisabled]}
              onPress={handleChangePassword}
              disabled={updating}
            >
              {updating ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.modalSaveText}>Update</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#183B5C" />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#183B5C" />
          </Pressable>
          <Text style={styles.headerTitle}>Account</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Profile Section */}
        <View style={styles.profileSection}>
          <Pressable onPress={handlePickImage} style={styles.avatarContainer}>
            {profile?.profile_picture ? (
              <Image source={{ uri: profile.profile_picture }} style={styles.avatar} />
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
            <View style={styles.editAvatarBadge}>
              <Ionicons name="camera" size={14} color="#FFF" />
            </View>
          </Pressable>

          <Text style={styles.profileName}>
            {profile?.first_name} {profile?.last_name}
          </Text>
          <Text style={styles.profileType}>
            {userType === 'commuter' ? 'Passenger' : 'Driver'}
          </Text>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Ionicons name="car" size={24} color="#3B82F6" />
            <Text style={styles.statValue}>{stats.totalTrips}</Text>
            <Text style={styles.statLabel}>Total Trips</Text>
          </View>
          {userType === 'commuter' && (
            <View style={styles.statCard}>
              <Ionicons name="star" size={24} color="#F59E0B" />
              <Text style={styles.statValue}>{stats.totalPoints}</Text>
              <Text style={styles.statLabel}>Points</Text>
            </View>
          )}
          <View style={styles.statCard}>
            <Ionicons name="people" size={24} color="#10B981" />
            <Text style={styles.statValue}>{stats.referrals}</Text>
            <Text style={styles.statLabel}>Referrals</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="calendar" size={24} color="#8B5CF6" />
            <Text style={styles.statValue}>
              {stats.memberSince ? new Date(stats.memberSince).getFullYear() : 'N/A'}
            </Text>
            <Text style={styles.statLabel}>Member Since</Text>
          </View>
        </View>

        {/* Personal Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          
          <Pressable 
            style={styles.infoRow}
            onPress={() => handleEditField('first_name', profile?.first_name)}
          >
            <View style={styles.infoLeft}>
              <Ionicons name="person-outline" size={20} color="#666" />
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoLabel}>First Name</Text>
                <Text style={styles.infoValue}>{profile?.first_name || 'Not set'}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </Pressable>

          <Pressable 
            style={styles.infoRow}
            onPress={() => handleEditField('last_name', profile?.last_name)}
          >
            <View style={styles.infoLeft}>
              <Ionicons name="person-outline" size={20} color="#666" />
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoLabel}>Last Name</Text>
                <Text style={styles.infoValue}>{profile?.last_name || 'Not set'}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </Pressable>

          <Pressable 
            style={styles.infoRow}
            onPress={() => handleEditField('phone', profile?.phone)}
          >
            <View style={styles.infoLeft}>
              <Ionicons name="call-outline" size={20} color="#666" />
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoLabel}>Phone Number</Text>
                <Text style={styles.infoValue}>{profile?.phone || 'Not set'}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </Pressable>

          <Pressable 
            style={[styles.infoRow, styles.lastInfoRow]}
            onPress={() => handleEditField('email', profile?.email)}
          >
            <View style={styles.infoLeft}>
              <Ionicons name="mail-outline" size={20} color="#666" />
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue}>{profile?.email || 'Not set'}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </Pressable>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>
          
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Ionicons name="notifications-outline" size={20} color="#666" />
              <Text style={styles.settingLabel}>Push Notifications</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleToggleNotification}
              trackColor={{ false: "#D1D5DB", true: "#183B5C" }}
              thumbColor="#FFF"
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Ionicons name="moon-outline" size={20} color="#666" />
              <Text style={styles.settingLabel}>Dark Mode</Text>
            </View>
            <Switch
              value={darkModeEnabled}
              onValueChange={setDarkModeEnabled}
              trackColor={{ false: "#D1D5DB", true: "#183B5C" }}
              thumbColor="#FFF"
            />
          </View>

          <Pressable 
            style={[styles.settingRow, styles.lastSettingRow]}
            onPress={() => setShowChangePasswordModal(true)}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="lock-closed-outline" size={20} color="#666" />
              <Text style={styles.settingLabel}>Change Password</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </Pressable>
        </View>

        {/* Support */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>
          
          <Pressable style={styles.supportRow}>
            <View style={styles.supportLeft}>
              <Ionicons name="help-circle-outline" size={20} color="#666" />
              <Text style={styles.supportLabel}>Help Center</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </Pressable>

          <Pressable style={styles.supportRow}>
            <View style={styles.supportLeft}>
              <Ionicons name="document-text-outline" size={20} color="#666" />
              <Text style={styles.supportLabel}>Terms of Service</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </Pressable>

          <Pressable style={[styles.supportRow, styles.lastSupportRow]}>
            <View style={styles.supportLeft}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#666" />
              <Text style={styles.supportLabel}>Privacy Policy</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </Pressable>
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appVersion}>Version 1.0.0</Text>
          <Text style={styles.appCopyright}>© 2024 SakayNA. All rights reserved.</Text>
        </View>

        {/* Logout Button */}
        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#EF4444" />
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </ScrollView>

      {/* Modals */}
      <EditModal />
      <ChangePasswordModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
    marginTop: -40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#666",
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
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#183B5C",
  },
  profileSection: {
    alignItems: "center",
    paddingVertical: 20,
    backgroundColor: "#FFF",
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#FFF",
  },
  editAvatarBadge: {
    position: 'absolute',
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
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  profileType: {
    fontSize: 14,
    color: "#666",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 15,
    gap: 10,
    backgroundColor: "#FFF",
    marginTop: 1,
  },
  statCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#F9FAFB",
    padding: 15,
    borderRadius: 16,
    alignItems: "center",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginTop: 8,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
  },
  section: {
    backgroundColor: "#FFF",
    marginTop: 15,
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 15,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  lastInfoRow: {
    borderBottomWidth: 0,
  },
  infoLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  infoTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: "#999",
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    color: "#333",
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  lastSettingRow: {
    borderBottomWidth: 0,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingLabel: {
    fontSize: 14,
    color: "#333",
  },
  supportRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  lastSupportRow: {
    borderBottomWidth: 0,
  },
  supportLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  supportLabel: {
    fontSize: 14,
    color: "#333",
  },
  appInfo: {
    alignItems: "center",
    paddingVertical: 20,
  },
  appVersion: {
    fontSize: 12,
    color: "#999",
    marginBottom: 4,
  },
  appCopyright: {
    fontSize: 11,
    color: "#999",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEE2E2",
    marginHorizontal: 20,
    marginVertical: 20,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  logoutText: {
    color: "#EF4444",
    fontSize: 16,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  modalInput: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  modalCancelText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
  },
  modalSaveButton: {
    flex: 1,
    backgroundColor: "#183B5C",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  modalSaveButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  modalSaveText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  passwordInputContainer: {
    marginBottom: 15,
  },
  inputLabel: {
    fontSize: 13,
    color: "#666",
    marginBottom: 6,
  },
  passwordInput: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
});