// screens/ReferralsScreen.js
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Alert,
  Share,
  Modal,
  TextInput,
  Animated,
  Dimensions,
  Linking,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";

const { width } = Dimensions.get("window");

const COLORS = {
  primary: "#183B5C",
  primaryDark: "#10293F",
  accent: "#E97A3E",
  accentSoft: "rgba(233, 122, 62, 0.14)",
  white: "#FFFFFF",
  text: "#183B5C",
  textDark: "#1F2937",
  textMuted: "#64748B",
  bg: "#F5F7FA",
  card: "#FFFFFF",
  border: "#E5E7EB",
  warning: "#F59E0B",
  success: "#10B981",
  info: "#3B82F6",
  danger: "#EF4444",
  purple: "#8B5CF6",
};

export default function ReferralsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.96)).current;
  const phoneInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState(null);
  const [userType, setUserType] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [referralCode, setReferralCode] = useState(null);
  const [referralLink, setReferralLink] = useState(null);
  const [referralStats, setReferralStats] = useState({
    totalReferrals: 0,
    activeReferrals: 0,
    rewardEarned: 0,
  });
  const [referralsList, setReferralsList] = useState([]);
  const [referralSettings, setReferralSettings] = useState({
    referral_points: 100,
    referral_bonus_points: 50,
    referral_expiry_days: 90,
    app_download_url: "https://play.google.com/apps/testing/com.lemera.sakayna",
  });
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [invitePhone, setInvitePhone] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);

  const rewardMeta = useMemo(() => {
    const isCommuter = userType === "commuter";

    return {
      label: isCommuter ? "Points" : "Credits",
      singular: isCommuter ? "point" : "credit",
      plural: isCommuter ? "points" : "credits",
      shortLabel: isCommuter ? "pts" : "cr",
      earnVerb: isCommuter ? "Earn Points" : "Earn Credits",
      balanceTitle: isCommuter ? "Referral Points" : "Referral Credits",
      rewardValue: Number(referralSettings.referral_points || 0),
      bonusValue: Number(referralSettings.referral_bonus_points || 0),
      explanation: isCommuter
        ? "Points can be used for future commuter rewards or discounts."
        : "Credits can be used for driver subscription rewards.",
      shareRoleText: isCommuter ? "rider" : "driver",
    };
  }, [userType, referralSettings]);

  useFocusEffect(
    useCallback(() => {
      loadReferralData();
    }, [])
  );

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const normalizePhone = (value) => value.replace(/\D/g, "");

  const isValidPHPhone = (value) => {
    const clean = normalizePhone(value);
    return /^(09\d{9}|639\d{9})$/.test(clean);
  };

  const formatDisplayPhone = (value) => {
    const clean = normalizePhone(value).slice(0, 11);
    if (clean.length <= 4) return clean;
    if (clean.length <= 7) return `${clean.slice(0, 4)} ${clean.slice(4)}`;
    return `${clean.slice(0, 4)} ${clean.slice(4, 7)} ${clean.slice(7, 11)}`;
  };

  const loadReferralData = async () => {
    try {
      const id = await AsyncStorage.getItem("user_id");
      const type = await AsyncStorage.getItem("user_type");

      setUserId(id);
      setUserType(type);

      if (!id || !type) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      await fetchReferralSettings();

      const profile = await fetchUserProfile(id, type);
      const code = await fetchReferralCode(id, profile);
      await generateReferralLink(id, type, code);

      await Promise.all([
        fetchReferralStats(id, type),
        fetchReferralsList(id),
      ]);
    } catch (err) {
      console.log("Error loading referral data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchUserProfile = async (id, type) => {
    try {
      const table = type === "commuter" ? "commuters" : "drivers";

      const { data, error } = await supabase
        .from(table)
        .select("first_name, last_name, profile_picture")
        .eq("id", id)
        .single();

      if (error) throw error;

      setUserProfile(data);
      return data;
    } catch (err) {
      console.log("Error fetching user profile:", err.message);
      setUserProfile(null);
      return null;
    }
  };

  const generateCodeFromName = (profile) => {
    const firstName = (profile?.first_name || "USER").trim().toUpperCase();
    const prefix = firstName.replace(/[^A-Z0-9]/g, "").slice(0, 3) || "USR";
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}${randomPart}`;
  };

  const fetchReferralCode = async (id, profile) => {
    try {
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("referral_code")
        .eq("id", id)
        .single();

      if (userError) throw userError;

      if (userData?.referral_code) {
        setReferralCode(userData.referral_code);
        return userData.referral_code;
      }

      let newCode = generateCodeFromName(profile);

      for (let i = 0; i < 5; i++) {
        const { data: existingCode } = await supabase
          .from("users")
          .select("id")
          .eq("referral_code", newCode)
          .maybeSingle();

        if (!existingCode) break;
        newCode = generateCodeFromName(profile);
      }

      const { error: updateError } = await supabase
        .from("users")
        .update({ referral_code: newCode })
        .eq("id", id);

      if (updateError) throw updateError;

      setReferralCode(newCode);
      return newCode;
    } catch (err) {
      console.log("Error fetching referral code:", err.message);
      return null;
    }
  };

  const generateReferralLink = async (id, type, code) => {
    try {
      if (!code) {
        setReferralLink(null);
        return;
      }

      const { data: urlSetting, error: urlError } = await supabase
        .from("referral_settings")
        .select("value")
        .eq("key", "app_download_url")
        .maybeSingle();

      let baseUrl = "https://play.google.com/apps/testing/com.lemera.sakayna";

      if (!urlError && urlSetting?.value) {
        baseUrl = urlSetting.value;
      }

      const separator = baseUrl.includes("?") ? "&" : "?";
      const link = `${baseUrl}${separator}ref=${encodeURIComponent(code)}`;

      setReferralLink(link);

      const { data: existing, error: checkError } = await supabase
        .from("referral_links")
        .select("id")
        .eq("user_id", id)
        .eq("user_type", type)
        .maybeSingle();

      if (checkError) {
        console.log("Error checking referral link:", checkError.message);
        return;
      }

      if (existing) {
        await supabase
          .from("referral_links")
          .update({
            referral_code: code,
            link_url: link,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("referral_links")
          .insert({
            user_id: id,
            user_type: type,
            referral_code: code,
            link_url: link,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
      }
    } catch (err) {
      console.log("Error generating referral link:", err.message);
      if (code) {
        setReferralLink(
          `https://play.google.com/apps/testing/com.lemera.sakayna?ref=${encodeURIComponent(code)}`
        );
      }
    }
  };

  const fetchReferralStats = async (id, type) => {
    try {
      const { data: referrals, error } = await supabase
        .from("referrals")
        .select("status, points_awarded")
        .eq("referrer_id", id)
        .eq("referrer_type", type);

      if (error) throw error;

      const totalReferrals = referrals?.length || 0;
      const activeReferrals =
        referrals?.filter((r) => r.status === "active").length || 0;

      const rewardEarned =
        referrals
          ?.filter((r) => r.status === "completed")
          .reduce((sum, r) => sum + Number(r.points_awarded || 0), 0) || 0;

      setReferralStats({
        totalReferrals,
        activeReferrals,
        rewardEarned,
      });
    } catch (err) {
      console.log("Error fetching referral stats:", err.message);
    }
  };

  const fetchReferralsList = async (id) => {
    try {
      const { data, error } = await supabase
        .from("referrals")
        .select(`
          id,
          referred_id,
          status,
          referred_at,
          first_ride_completed_at,
          points_awarded,
          referred_user:users!referred_id (
            phone,
            user_type,
            created_at
          )
        `)
        .eq("referrer_id", id)
        .order("referred_at", { ascending: false });

      if (error) throw error;

      const enhancedData =
        (await Promise.all(
          (data || []).map(async (item) => {
            let referredName = "User";
            const referredUserType = item.referred_user?.user_type;

            try {
              if (referredUserType === "commuter") {
                const { data: commuter } = await supabase
                  .from("commuters")
                  .select("first_name, last_name")
                  .eq("id", item.referred_id)
                  .maybeSingle();

                if (commuter) {
                  referredName =
                    `${commuter.first_name || ""} ${commuter.last_name || ""}`.trim() ||
                    "User";
                }
              } else if (referredUserType === "driver") {
                const { data: driver } = await supabase
                  .from("drivers")
                  .select("first_name, last_name")
                  .eq("id", item.referred_id)
                  .maybeSingle();

                if (driver) {
                  referredName =
                    `${driver.first_name || ""} ${driver.last_name || ""}`.trim() ||
                    "User";
                }
              }
            } catch (nameErr) {
              console.log("Name lookup error:", nameErr.message);
            }

            return {
              ...item,
              referred_name: referredName,
              referred_phone: item.referred_user?.phone || "N/A",
              referred_type: referredUserType,
            };
          })
        )) || [];

      setReferralsList(enhancedData);
    } catch (err) {
      console.log("Error fetching referrals list:", err.message);
      setReferralsList([]);
    }
  };

  const fetchReferralSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("referral_settings")
        .select("*")
        .eq("is_active", true);

      if (error) throw error;

      const settings = {};
      data?.forEach((item) => {
        let value = item.value;
        if (item.data_type === "integer") value = parseInt(value, 10);
        if (item.data_type === "float") value = parseFloat(value);
        settings[item.key] = value;
      });

      setReferralSettings((prev) => ({ ...prev, ...settings }));
    } catch (err) {
      console.log("Error fetching referral settings:", err.message);
    }
  };

  const buildShareMessage = () => {
    return `🎉 Join me on SakayNa as a ${rewardMeta.shareRoleText}! Use my referral code ${referralCode} to get ${rewardMeta.bonusValue} bonus ${rewardMeta.plural}!\n\nDownload the app: ${referralLink}`;
  };

  const handleShare = async () => {
    if (!referralLink || !referralCode) {
      Alert.alert("Error", "Referral info is still loading. Please wait.");
      return;
    }

    try {
      const result = await Share.share({
        message: buildShareMessage(),
        title: "Invite Friends to SakayNa",
      });

      if (result.action === Share.sharedAction) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        await supabase.from("referral_share_logs").insert({
          user_id: userId,
          user_type: userType,
          referral_code: referralCode,
          shared_via: Platform.OS === "ios" ? "ios_share" : "android_share",
          shared_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.log("Error sharing:", err.message);
      Alert.alert("Error", "Failed to share referral link.");
    }
  };

  const handleCopyCode = async () => {
    if (!referralCode) {
      Alert.alert("Error", "Referral code is still loading.");
      return;
    }

    await Clipboard.setStringAsync(referralCode);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("Copied!", "Referral code copied to clipboard.");
  };

  const handleCopyLink = async () => {
    if (!referralLink) {
      Alert.alert("Error", "Referral link is still loading.");
      return;
    }

    await Clipboard.setStringAsync(referralLink);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("Copied!", "Referral link copied to clipboard.");
  };

  const handleSendInvite = async () => {
    const cleanPhone = normalizePhone(invitePhone);

    if (!isValidPHPhone(cleanPhone)) {
      Alert.alert(
        "Invalid Number",
        "Please enter a valid Philippine mobile number like 09171234567."
      );
      return;
    }

    if (!referralCode || !referralLink) {
      Alert.alert("Error", "Referral info is still loading.");
      return;
    }

    Keyboard.dismiss();
    setSendingInvite(true);

    try {
      const message = buildShareMessage();

      const smsUrl = Platform.select({
        ios: `sms:${cleanPhone}&body=${encodeURIComponent(message)}`,
        android: `sms:${cleanPhone}?body=${encodeURIComponent(message)}`,
        default: `sms:${cleanPhone}?body=${encodeURIComponent(message)}`,
      });

      const canOpen = await Linking.canOpenURL(smsUrl);

      if (!canOpen) {
        Alert.alert("SMS Not Available", "SMS service is not available on this device.");
        return;
      }

      await Linking.openURL(smsUrl);

      await supabase.from("referral_share_logs").insert({
        user_id: userId,
        user_type: userType,
        referral_code: referralCode,
        shared_via: "sms_opened",
        recipient: cleanPhone,
        shared_at: new Date().toISOString(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Invite Ready!", `Your SMS app has been opened for ${cleanPhone}.`);

      setInvitePhone("");
      setShowInviteModal(false);
    } catch (err) {
      console.log("Error sending invite:", err.message);
      Alert.alert("Error", "Failed to open SMS app.");
    } finally {
      setSendingInvite(false);
    }
  };

  const openExternalShare = async (url, appName) => {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert("Not Available", `${appName} is not installed.`);
        return;
      }
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert("Error", `Unable to open ${appName}.`);
    }
  };

  const handleWhatsAppShare = async () => {
    if (!referralLink || !referralCode) {
      Alert.alert("Error", "Referral info is still loading.");
      return;
    }
    await openExternalShare(
      `whatsapp://send?text=${encodeURIComponent(buildShareMessage())}`,
      "WhatsApp"
    );
  };

  const handleMessengerShare = async () => {
    if (!referralLink || !referralCode) {
      Alert.alert("Error", "Referral info is still loading.");
      return;
    }
    await openExternalShare(
      `fb-messenger://share/?text=${encodeURIComponent(buildShareMessage())}`,
      "Messenger"
    );
  };

  const handleTelegramShare = async () => {
    if (!referralLink || !referralCode) {
      Alert.alert("Error", "Referral info is still loading.");
      return;
    }
    await openExternalShare(
      `tg://msg?text=${encodeURIComponent(buildShareMessage())}`,
      "Telegram"
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
    });
  };

  const getReferralStatusColor = (status) => {
    switch (status) {
      case "active":
        return COLORS.success;
      case "completed":
        return COLORS.info;
      case "expired":
        return COLORS.danger;
      default:
        return COLORS.warning;
    }
  };

  const getReferralStatusText = (status) => {
    switch (status) {
      case "active":
        return "Active";
      case "completed":
        return "Completed";
      case "expired":
        return "Expired";
      default:
        return "Pending";
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadReferralData();
  };

  const closeModal = () => {
    Keyboard.dismiss();
    setShowInviteModal(false);
    setInvitePhone("");
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading referral info...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>Refer & Earn</Text>
          <View style={{ width: 40 }} />
        </View>

        <Animated.View
          style={[
            styles.heroCard,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <LinearGradient
            colors={[COLORS.primary, "#2C5A7A"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            <Text style={styles.heroTitle}>
              Invite Friends, Earn {rewardMeta.label}!
            </Text>

            <Text style={styles.heroSubtitle}>
              Get {rewardMeta.rewardValue} {rewardMeta.plural} for every friend who joins and completes their first ride.
            </Text>

            <View style={styles.rewardTypePill}>
              <Ionicons
                name={userType === "commuter" ? "star-outline" : "wallet-outline"}
                size={16}
                color={COLORS.accent}
              />
              <Text style={styles.rewardTypePillText}>
                {userType === "commuter"
                  ? "Commuter referrals reward Points"
                  : "Driver referrals reward Credits"}
              </Text>
            </View>

            <View style={styles.referralCodeContainer}>
              <Text style={styles.referralCodeLabel}>Your Referral Code</Text>
              <View style={styles.codeBox}>
                <Text style={styles.referralCode}>{referralCode || "Loading..."}</Text>
                <Pressable onPress={handleCopyCode} style={styles.copyButton}>
                  <Ionicons name="copy-outline" size={20} color={COLORS.white} />
                </Pressable>
              </View>
            </View>

            <View style={styles.referralLinkContainer}>
              <Text style={styles.referralCodeLabel}>Your Referral Link</Text>
              <View style={styles.linkBox}>
                <Text style={styles.referralLink} numberOfLines={1}>
                  {referralLink || "Loading..."}
                </Text>
                <Pressable onPress={handleCopyLink} style={styles.copyButton}>
                  <Ionicons name="copy-outline" size={20} color={COLORS.white} />
                </Pressable>
              </View>
            </View>

            <View style={styles.heroActions}>
              <Pressable style={styles.shareButton} onPress={handleShare}>
                <Ionicons name="share-social" size={20} color={COLORS.white} />
                <Text style={styles.shareButtonText}>Share Link</Text>
              </Pressable>

              <Pressable
                style={styles.inviteButton}
                onPress={() => setShowInviteModal(true)}
              >
                <Ionicons name="person-add" size={20} color={COLORS.white} />
                <Text style={styles.inviteButtonText}>Invite Friend</Text>
              </Pressable>
            </View>
          </LinearGradient>
        </Animated.View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Ionicons name="people" size={24} color={COLORS.primary} />
            </View>
            <Text style={styles.statValue}>{referralStats.totalReferrals}</Text>
            <Text style={styles.statLabel}>Total Referrals</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Ionicons
                name={userType === "commuter" ? "star" : "wallet"}
                size={24}
                color={userType === "commuter" ? COLORS.warning : COLORS.purple}
              />
            </View>
            <Text style={styles.statValue}>{referralStats.rewardEarned}</Text>
            <Text style={styles.statLabel}>{rewardMeta.label} Earned</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Ionicons name="people-circle" size={24} color={COLORS.purple} />
            </View>
            <Text style={styles.statValue}>{referralStats.activeReferrals}</Text>
            <Text style={styles.statLabel}>Active Referrals</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>✨ How It Works</Text>

          <View style={styles.stepContainer}>
            <View style={styles.step}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>1</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Share Your Code or Link</Text>
                <Text style={styles.stepDesc}>
                  Share your unique referral code or invite link with friends.
                </Text>
              </View>
            </View>

            <View style={styles.step}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>2</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Friend Signs Up</Text>
                <Text style={styles.stepDesc}>
                  Your friend joins SakayNa using your code or link.
                </Text>
              </View>
            </View>

            <View style={styles.step}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>3</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>{rewardMeta.earnVerb}</Text>
                <Text style={styles.stepDesc}>
                  You get {rewardMeta.rewardValue} {rewardMeta.plural} once your friend completes their first ride.
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>📱 Quick Share</Text>

          <View style={styles.shareOptions}>
            <Pressable style={styles.shareOption} onPress={handleWhatsAppShare}>
              <LinearGradient
                colors={["#25D366", "#128C7E"]}
                style={styles.shareOptionIcon}
              >
                <Ionicons name="logo-whatsapp" size={28} color={COLORS.white} />
              </LinearGradient>
              <Text style={styles.shareOptionText}>WhatsApp</Text>
            </Pressable>

            <Pressable style={styles.shareOption} onPress={handleMessengerShare}>
              <LinearGradient
                colors={["#0084FF", "#0066CC"]}
                style={styles.shareOptionIcon}
              >
                <Ionicons name="logo-facebook" size={28} color={COLORS.white} />
              </LinearGradient>
              <Text style={styles.shareOptionText}>Messenger</Text>
            </Pressable>

            <Pressable style={styles.shareOption} onPress={handleTelegramShare}>
              <LinearGradient
                colors={["#0088CC", "#006699"]}
                style={styles.shareOptionIcon}
              >
                <Ionicons name="paper-plane" size={28} color={COLORS.white} />
              </LinearGradient>
              <Text style={styles.shareOptionText}>Telegram</Text>
            </Pressable>

            <Pressable style={styles.shareOption} onPress={handleShare}>
              <LinearGradient
                colors={["#6366F1", "#4F46E5"]}
                style={styles.shareOptionIcon}
              >
                <Ionicons name="share-social" size={28} color={COLORS.white} />
              </LinearGradient>
              <Text style={styles.shareOptionText}>More</Text>
            </Pressable>
          </View>
        </View>

        {referralsList.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>👥 Your Referrals</Text>

            {referralsList.map((referral, index) => (
              <View
                key={referral.id}
                style={[
                  styles.referralItem,
                  index === referralsList.length - 1 && styles.lastReferralItem,
                ]}
              >
                <View style={styles.referralAvatar}>
                  <Text style={styles.referralAvatarText}>
                    {(referral.referred_name || "U").charAt(0).toUpperCase()}
                  </Text>
                </View>

                <View style={styles.referralInfo}>
                  <Text style={styles.referralName}>{referral.referred_name}</Text>
                  <Text style={styles.referralPhone}>{referral.referred_phone}</Text>

                  <View style={styles.referralBadge}>
                    <Text style={styles.referralBadgeText}>
                      {referral.referred_type === "driver" ? "🚗 Driver" : "👤 Rider"}
                    </Text>
                  </View>

                  <Text style={styles.referralDate}>
                    Joined {formatDate(referral.referred_at)}
                  </Text>
                </View>

                <View style={styles.referralPoints}>
                  <Text style={styles.referralPointsText}>
                    {referral.points_awarded ? `+${referral.points_awarded}` : "0"} {rewardMeta.shortLabel}
                  </Text>
                </View>

                <View
                  style={[
                    styles.referralStatus,
                    {
                      backgroundColor:
                        getReferralStatusColor(referral.status) + "20",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.referralStatusText,
                      { color: getReferralStatusColor(referral.status) },
                    ]}
                  >
                    {getReferralStatusText(referral.status)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={20} color={COLORS.primary} />
          <Text style={styles.infoText}>
            Terms: You will receive {rewardMeta.rewardValue} {rewardMeta.plural} when your referred friend completes their first ride. {rewardMeta.explanation} Referral codes expire after {referralSettings.referral_expiry_days} days of inactivity.
          </Text>
        </View>
      </ScrollView>

      <Modal
        visible={showInviteModal}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Invite a Friend</Text>
                    <Pressable onPress={closeModal} style={styles.modalCloseButton}>
                      <Ionicons name="close" size={24} color="#666" />
                    </Pressable>
                  </View>

                  <Text style={styles.modalSubtitle}>
                    Enter your friend's phone number to open an SMS invitation.
                  </Text>

                  <TextInput
                    ref={phoneInputRef}
                    style={styles.phoneInput}
                    placeholder="0917 123 4567"
                    keyboardType="phone-pad"
                    value={formatDisplayPhone(invitePhone)}
                    onChangeText={(text) => setInvitePhone(normalizePhone(text))}
                    maxLength={13}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />

                  <View style={styles.modalButtonContainer}>
                    <Pressable style={styles.cancelButton} onPress={closeModal}>
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </Pressable>

                    <Pressable
                      style={[
                        styles.sendInviteButton,
                        sendingInvite && styles.sendInviteButtonDisabled,
                      ]}
                      onPress={handleSendInvite}
                      disabled={sendingInvite}
                    >
                      {sendingInvite ? (
                        <ActivityIndicator size="small" color={COLORS.white} />
                      ) : (
                        <>
                          <Ionicons name="send" size={20} color={COLORS.white} />
                          <Text style={styles.sendInviteButtonText}>Send</Text>
                        </>
                      )}
                    </Pressable>
                  </View>

                  <Text style={styles.modalNote}>
                    Your friend will receive your referral code: {referralCode || "-"}
                  </Text>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.bg,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textMuted,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  heroCard: {
    margin: 20,
    marginTop: 16,
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  heroGradient: {
    padding: 24,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 14,
    color: "#FFD2AF",
    marginBottom: 16,
    lineHeight: 20,
  },
  rewardTypePill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 20,
  },
  rewardTypePillText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: "700",
  },
  referralCodeContainer: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  referralLinkContainer: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  referralCodeLabel: {
    fontSize: 12,
    color: "#FFD2AF",
    marginBottom: 8,
  },
  codeBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  linkBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  referralCode: {
    fontSize: 28,
    fontWeight: "bold",
    color: COLORS.white,
    letterSpacing: 1,
  },
  referralLink: {
    fontSize: 14,
    color: COLORS.white,
    flex: 1,
    marginRight: 8,
  },
  copyButton: {
    padding: 8,
  },
  heroActions: {
    flexDirection: "row",
    gap: 12,
  },
  shareButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  shareButtonText: {
    color: COLORS.white,
    fontWeight: "600",
  },
  inviteButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accent,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  inviteButtonText: {
    color: COLORS.white,
    fontWeight: "700",
  },
  statsGrid: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: "center",
  },
  sectionCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 20,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.textDark,
    marginBottom: 16,
  },
  stepContainer: {
    gap: 16,
  },
  step: {
    flexDirection: "row",
    gap: 12,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  stepNumberText: {
    color: COLORS.white,
    fontWeight: "bold",
    fontSize: 14,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textDark,
    marginBottom: 4,
  },
  stepDesc: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  shareOptions: {
    flexDirection: "row",
    justifyContent: "space-around",
    flexWrap: "wrap",
    gap: 12,
  },
  shareOption: {
    alignItems: "center",
    width: (width - 80) / 4,
  },
  shareOptionIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  shareOptionText: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: "center",
  },
  referralItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  lastReferralItem: {
    borderBottomWidth: 0,
  },
  referralAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  referralAvatarText: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  referralInfo: {
    flex: 1,
  },
  referralName: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textDark,
    marginBottom: 2,
  },
  referralPhone: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  referralBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: "flex-start",
    marginTop: 2,
    marginBottom: 2,
  },
  referralBadgeText: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  referralDate: {
    fontSize: 11,
    color: "#999",
  },
  referralPoints: {
    marginRight: 12,
  },
  referralPointsText: {
    fontSize: 14,
    fontWeight: "bold",
    color: COLORS.warning,
  },
  referralStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  referralStatusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  infoCard: {
    flexDirection: "row",
    backgroundColor: "#FFF3E0",
    marginHorizontal: 20,
    marginBottom: 30,
    padding: 16,
    borderRadius: 16,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.warning,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.textDark,
  },
  modalCloseButton: {
    padding: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 20,
  },
  phoneInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 20,
    backgroundColor: "#F9FAFB",
  },
  modalButtonContainer: {
    flexDirection: "row",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelButtonText: {
    color: COLORS.textMuted,
    fontWeight: "600",
    fontSize: 16,
  },
  sendInviteButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  sendInviteButtonDisabled: {
    opacity: 0.7,
  },
  sendInviteButtonText: {
    color: COLORS.white,
    fontWeight: "600",
    fontSize: 16,
  },
  modalNote: {
    fontSize: 11,
    color: "#999",
    textAlign: "center",
    marginTop: 16,
  },
});