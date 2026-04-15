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
  Image,
  Linking,
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
import packageJson from "../../package.json";
import { getUserSession } from "../utils/authStorage";
import Constants from "expo-constants";

const { width } = Dimensions.get("window");
const scale = (size) => (width / 375) * size;
const appVersion = packageJson.version;

export default function AccountScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [userId, setUserId] = useState(null);
  const [userType, setUserType] = useState("commuter");
  const [isTestAccount, setIsTestAccount] = useState(false);

  const [profile, setProfile] = useState(null);

  const [stats, setStats] = useState({
    totalTrips: 0,
    totalPoints: 0,
    totalSpent: 0,
  });

  const [helpCenterUrl, setHelpCenterUrl] = useState(
    "https://sakayna-v1.netlify.app/help"
  );
  const [termsUrl, setTermsUrl] = useState(
    "https://sakayna-v1.netlify.app/terms"
  );
  const [privacyUrl, setPrivacyUrl] = useState(
    "https://sakayna-v1.netlify.app/privacy"
  );
  const [urlsLoading, setUrlsLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;

      const init = async () => {
        try {
          const session = await getUserSession();

          if (!isMounted) return;

          if (session && session.isTestAccount) {
            setIsTestAccount(true);
            setUserId(session.phone);
            setUserType(session.userType || "commuter");

            const mockProfile = {
              first_name: "Test",
              last_name:
                session.userType === "driver" ? "Driver" : "Passenger",
              phone: session.phone || "N/A",
              email: `${session.userType || "user"}@test.com`,
              profile_picture: null,
              created_at: new Date().toISOString(),
            };

            setProfile(mockProfile);
            setStats({
              totalTrips: 0,
              totalPoints: 0,
              totalSpent: 0,
            });
            setLoading(false);
            return;
          }

          const id = await AsyncStorage.getItem("user_id");
          const type = (await AsyncStorage.getItem("user_type")) || "commuter";

          if (!isMounted) return;

          setUserId(id);
          setUserType(type);
          setIsTestAccount(false);
        } catch (err) {
          console.log("Init error:", err?.message || err);
        }
      };

      init();
      fetchSystemUrls();

      return () => {
        isMounted = false;
      };
    }, [])
  );

  useEffect(() => {
    if (userId && !isTestAccount) {
      loadUserData();
    }
  }, [userId, isTestAccount]);

  const fetchSystemUrls = async () => {
    try {
      setUrlsLoading(true);

      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", [
          "help_center_url",
          "terms_and_conditions_url",
          "privacy_policy_url",
        ])
        .eq("is_public", true);

      if (error) throw error;

      if (Array.isArray(data)) {
        data.forEach((setting) => {
          if (setting.key === "help_center_url" && setting.value) {
            setHelpCenterUrl(setting.value);
          }
          if (
            setting.key === "terms_and_conditions_url" &&
            setting.value
          ) {
            setTermsUrl(setting.value);
          }
          if (setting.key === "privacy_policy_url" && setting.value) {
            setPrivacyUrl(setting.value);
          }
        });
      }
    } catch (err) {
      console.log("Error fetching URLs:", err?.message || err);
    } finally {
      setUrlsLoading(false);
    }
  };

  const loadUserData = async () => {
    try {
      setLoading(true);
      await Promise.all([fetchProfile(), fetchStats()]);
    } catch (err) {
      console.log("Error loading user data:", err?.message || err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfile = async () => {
    try {
      const table = userType === "driver" ? "drivers" : "commuters";

      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("id", userId)
        .single();

      if (error) throw error;

      const updatedProfile = {
        ...data,
        profile_picture: data?.profile_picture
          ? `${data.profile_picture}?t=${Date.now()}`
          : null,
      };

      setProfile(updatedProfile);
    } catch (err) {
      console.log("Error fetching profile:", err?.message || err);
    }
  };

  const fetchStats = async () => {
    try {
      if (userType === "driver") {
        setStats({
          totalTrips: 0,
          totalPoints: 0,
          totalSpent: 0,
        });
        return;
      }

      const { data: bookings, error: bookingsError } = await supabase
        .from("bookings")
        .select("fare, actual_fare")
        .eq("commuter_id", userId)
        .eq("status", "completed");

      if (bookingsError) throw bookingsError;

      const totalTrips = bookings?.length || 0;
      const totalSpent =
        bookings?.reduce(
          (sum, item) => sum + Number(item.actual_fare || item.fare || 0),
          0
        ) || 0;

      let points = 0;
      try {
        const { data: walletData } = await supabase
          .from("commuter_wallets")
          .select("points")
          .eq("commuter_id", userId)
          .single();

        points = walletData?.points || 0;
      } catch (walletErr) {
        console.log("Wallet fetch info:", walletErr?.message || walletErr);
      }

      setStats({
        totalTrips,
        totalPoints: points,
        totalSpent,
      });
    } catch (err) {
      console.log("Error fetching stats:", err?.message || err);
    }
  };

  const onRefresh = async () => {
    if (isTestAccount) {
      setRefreshing(false);
      return;
    }

    try {
      setRefreshing(true);
      await Promise.all([loadUserData(), fetchSystemUrls()]);
    } finally {
      setRefreshing(false);
    }
  };

  const openUrl = async (url, label) => {
    try {
      if (!url) {
        Alert.alert("Error", `${label} is not available.`);
        return;
      }

      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert("Error", `Cannot open ${label}.`);
        return;
      }

      await Linking.openURL(url);
    } catch (err) {
      console.log(`Open URL error (${label}):`, err?.message || err);
      Alert.alert("Error", `Failed to open ${label}.`);
    }
  };

  const pickImage = async () => {
    if (isTestAccount) {
      Alert.alert(
        "Test Account",
        "Profile picture update is disabled for test accounts."
      );
      return;
    }

    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Please allow photo library access first."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const image = result.assets[0];
      const response = await fetch(image.uri);
      const arrayBuffer = await response.arrayBuffer();

      const fileName = `${Date.now()}.jpg`;
      const filePath = `${userId}/${fileName}`;

      const bucket =
        userType === "driver" ? "driver-profiles" : "commuter-profiles";

      Alert.alert("Uploading", "Please wait...");

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, arrayBuffer, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      const table = userType === "driver" ? "drivers" : "commuters";

      const { error: updateError } = await supabase
        .from(table)
        .update({
          profile_picture: publicUrlData.publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (updateError) throw updateError;

      setProfile((prev) => ({
        ...prev,
        profile_picture: `${publicUrlData.publicUrl}?t=${Date.now()}`,
      }));

      Alert.alert("Success", "Profile picture updated successfully.");
    } catch (err) {
      console.log("Image upload error:", err?.message || err);
      Alert.alert("Upload Failed", err?.message || "Something went wrong.");
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
            const session = await getUserSession();

            if (session && session.isTestAccount) {
              await AsyncStorage.removeItem("@sakayna_user_session");
              await AsyncStorage.removeItem("@sakayna_test_account");
            } else {
              await AsyncStorage.multiRemove(["user_id", "user_type", "session"]);
              await supabase.auth.signOut();
            }

            navigation.replace("UserType");
          } catch (err) {
            console.log("Sign out error:", err?.message || err);
          }
        },
      },
    ]);
  };

  const formatCurrency = (value) => {
    return `₱${Number(value || 0).toFixed(0)}`;
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
      contentContainerStyle={{ paddingBottom: insets.bottom + scale(120) }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        !isTestAccount ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        ) : undefined
      }
    >
      {isTestAccount && (
        <View style={styles.testBanner}>
          <Ionicons name="flask-outline" size={16} color="#E97A3E" />
          <Text style={styles.testBannerText}>Test Account Mode</Text>
        </View>
      )}

      <View style={styles.header}>
        <View style={styles.headerRow}>
       

          

          
        </View>
      </View>

      <View style={styles.profileCard}>
        <Pressable
          onPress={pickImage}
          style={styles.avatarContainer}
          disabled={isTestAccount}
        >
          <View style={styles.avatarWrapper}>
            {profile?.profile_picture ? (
              <Image
                source={{ uri: profile.profile_picture }}
                style={styles.avatar}
              />
            ) : (
              <LinearGradient
                colors={["#183B5C", "#2D5D7B"]}
                style={styles.avatarFallback}
              >
                <Text style={styles.avatarText}>
                  {profile?.first_name?.[0] || "U"}
                  {profile?.last_name?.[0] || ""}
                </Text>
              </LinearGradient>
            )}
          </View>

          {!isTestAccount && (
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={14} color="#FFF" />
            </View>
          )}
        </Pressable>

        <Text style={styles.profileName}>
          {profile
            ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
            : "User"}
        </Text>

        <View style={styles.userTypeBadge}>
          <Ionicons name="person-outline" size={14} color="#183B5C" />
          <Text style={styles.userTypeText}>
            {userType === "driver" ? "Driver" : "Passenger"}
          </Text>
        </View>

        {!isTestAccount && (
          <Text style={styles.profileHint}>Tap photo to change profile picture</Text>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Ionicons name="car-outline" size={18} color="#183B5C" />
          <Text style={styles.statValue}>{stats.totalTrips}</Text>
          <Text style={styles.statLabel}>Total Trips</Text>
        </View>

        {userType !== "driver" && (
          <>
            <View style={styles.statCard}>
              <Ionicons name="star-outline" size={18} color="#F59E0B" />
              <Text style={styles.statValue}>{stats.totalPoints}</Text>
              <Text style={styles.statLabel}>Points</Text>
            </View>

            <View style={styles.statCard}>
              <Ionicons name="wallet-outline" size={18} color="#10B981" />
              <Text style={styles.statValue}>
                {formatCurrency(stats.totalSpent)}
              </Text>
              <Text style={styles.statLabel}>Spent</Text>
            </View>
          </>
        )}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Contact Information</Text>

        <View style={styles.infoItem}>
          <View style={styles.infoLeft}>
            <Ionicons name="call-outline" size={18} color="#183B5C" />
            <Text style={styles.infoLabel}>Phone Number</Text>
          </View>
          <Text style={styles.infoValue}>{profile?.phone || "Not provided"}</Text>
        </View>

        <View style={[styles.infoItem, styles.infoItemLast]}>
          <View style={styles.infoLeft}>
            <Ionicons name="mail-outline" size={18} color="#183B5C" />
            <Text style={styles.infoLabel}>Email Address</Text>
          </View>
          <Text style={styles.infoValue}>{profile?.email || "Not provided"}</Text>
        </View>

        <View style={styles.readOnlyNote}>
          <Ionicons name="lock-closed-outline" size={14} color="#6B7280" />
          <Text style={styles.readOnlyNoteText}>
            Your account information cannot be edited here.
          </Text>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Account Settings</Text>

        {userType !== "driver" && (
          <Pressable
            style={styles.menuItem}
            onPress={() => navigation.navigate("PointsRewards")}
          >
            <View style={styles.menuLeft}>
              <Ionicons name="star-outline" size={20} color="#183B5C" />
              <Text style={styles.menuText}>Points & Rewards</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </Pressable>
        )}

        <Pressable
          style={[styles.menuItem, userType === "driver" && styles.menuItemFirst]}
          onPress={() => navigation.navigate("Support")}
        >
          <View style={styles.menuLeft}>
            <Ionicons name="help-circle-outline" size={20} color="#183B5C" />
            <Text style={styles.menuText}>Help Center</Text>
          </View>
          {urlsLoading ? (
            <ActivityIndicator size="small" color="#9CA3AF" />
          ) : (
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          )}
        </Pressable>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Legal</Text>

        <Pressable
          style={styles.menuItem}
          onPress={() => openUrl(termsUrl, "Terms of Service")}
        >
          <View style={styles.menuLeft}>
            <Ionicons name="document-text-outline" size={20} color="#183B5C" />
            <Text style={styles.menuText}>Terms of Service</Text>
          </View>
          {urlsLoading ? (
            <ActivityIndicator size="small" color="#9CA3AF" />
          ) : (
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          )}
        </Pressable>

        <Pressable
          style={[styles.menuItem, styles.menuItemLast]}
          onPress={() => openUrl(privacyUrl, "Privacy Policy")}
        >
          <View style={styles.menuLeft}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#183B5C" />
            <Text style={styles.menuText}>Privacy Policy</Text>
          </View>
          {urlsLoading ? (
            <ActivityIndicator size="small" color="#9CA3AF" />
          ) : (
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          )}
        </Pressable>
      </View>

      <Pressable style={styles.signOutButton} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={20} color="#EF4444" />
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>

       <View style={{ alignItems: "center", marginTop: 20, marginBottom: 10 }}>
          <Text style={{ fontSize: 12, color: "#9CA3AF" }}>
            SakayNa v
            {Constants.expoConfig?.version ||
              Constants.manifest?.version ||
              "1.0.0"}
          </Text>
          <Text style={{ fontSize: 11, color: "#D1D5DB", marginTop: 2 }}>
                        Developed by: Ian Lemera
                      </Text>
        </View>
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

  testBanner: {
    backgroundColor: "#FFF3E0",
    paddingVertical: scale(8),
    paddingHorizontal: scale(12),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: scale(6),
  },

  testBannerText: {
    fontSize: scale(11),
    color: "#E97A3E",
    fontWeight: "600",
  },

  header: {
    backgroundColor: "#183B5C",
    paddingTop: scale(16),
    paddingBottom: scale(70),
    paddingHorizontal: scale(20),
    borderBottomLeftRadius: scale(28),
    borderBottomRightRadius: scale(28),
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  backButton: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(20),
    justifyContent: "center",
    alignItems: "center",
  },

  headerTitle: {
    fontSize: scale(18),
    fontWeight: "700",
    color: "#FFF",
  },

  headerSpacer: {
    width: scale(40),
    height: scale(40),
  },

  profileCard: {
    marginHorizontal: scale(20),
    marginTop: -scale(42),
    backgroundColor: "#FFF",
    borderRadius: scale(24),
    paddingVertical: scale(22),
    paddingHorizontal: scale(18),
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },

  avatarContainer: {
    position: "relative",
    marginBottom: scale(12),
  },

  avatarWrapper: {
    width: scale(92),
    height: scale(92),
    borderRadius: scale(46),
    overflow: "hidden",
    backgroundColor: "#E5E7EB",
    borderWidth: 3,
    borderColor: "#FFF",
  },

  avatar: {
    width: "100%",
    height: "100%",
  },

  avatarFallback: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },

  avatarText: {
    fontSize: scale(28),
    fontWeight: "700",
    color: "#FFF",
  },

  cameraBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: scale(28),
    height: scale(28),
    borderRadius: scale(14),
    backgroundColor: "#183B5C",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFF",
  },

  profileName: {
    fontSize: scale(18),
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },

  userTypeBadge: {
    marginTop: scale(8),
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EEF4F8",
    paddingHorizontal: scale(12),
    paddingVertical: scale(6),
    borderRadius: scale(20),
  },

  userTypeText: {
    marginLeft: scale(6),
    fontSize: scale(12),
    fontWeight: "600",
    color: "#183B5C",
  },

  profileHint: {
    marginTop: scale(8),
    fontSize: scale(11),
    color: "#6B7280",
  },

  statsRow: {
    marginTop: scale(16),
    marginHorizontal: scale(20),
    flexDirection: "row",
    gap: scale(10),
  },

  statCard: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: scale(18),
    paddingVertical: scale(16),
    paddingHorizontal: scale(10),
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },

  statValue: {
    marginTop: scale(8),
    fontSize: scale(16),
    fontWeight: "700",
    color: "#111827",
  },

  statLabel: {
    marginTop: scale(4),
    fontSize: scale(11),
    color: "#6B7280",
  },

  sectionCard: {
    marginHorizontal: scale(20),
    marginTop: scale(16),
    backgroundColor: "#FFF",
    borderRadius: scale(20),
    padding: scale(16),
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },

  sectionTitle: {
    fontSize: scale(14),
    fontWeight: "700",
    color: "#111827",
    marginBottom: scale(12),
  },

  infoItem: {
    paddingVertical: scale(12),
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },

  infoItemLast: {
    borderBottomWidth: 0,
    paddingBottom: scale(6),
  },

  infoLeft: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: scale(6),
    gap: scale(8),
  },

  infoLabel: {
    fontSize: scale(12),
    color: "#6B7280",
    fontWeight: "600",
  },

  infoValue: {
    fontSize: scale(14),
    color: "#111827",
    marginLeft: scale(26),
  },

  readOnlyNote: {
    marginTop: scale(10),
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: scale(12),
    paddingVertical: scale(10),
    paddingHorizontal: scale(12),
  },

  readOnlyNoteText: {
    marginLeft: scale(8),
    fontSize: scale(11),
    color: "#6B7280",
    flex: 1,
  },

  menuItem: {
    minHeight: scale(52),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    paddingVertical: scale(4),
  },

  menuItemFirst: {
    borderTopWidth: 0,
  },

  menuItemLast: {
    borderBottomWidth: 0,
  },

  menuLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(10),
    flex: 1,
  },

  menuText: {
    fontSize: scale(14),
    color: "#111827",
    fontWeight: "500",
  },

  signOutButton: {
    marginHorizontal: scale(20),
    marginTop: scale(18),
    backgroundColor: "#FEF2F2",
    borderRadius: scale(16),
    paddingVertical: scale(14),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: scale(8),
  },

  signOutText: {
    fontSize: scale(14),
    color: "#EF4444",
    fontWeight: "700",
  },

  footer: {
    marginTop: scale(14),
    alignItems: "center",
    paddingHorizontal: scale(20),
  },

  versionText: {
    fontSize: scale(11),
    color: "#6B7280",
    fontWeight: "600",
  },

  footerText: {
    marginTop: scale(4),
    fontSize: scale(10),
    color: "#9CA3AF",
    textAlign: "center",
  },
});