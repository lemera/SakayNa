import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function PrivacyScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const privacySections = [
    {
      title: "1. Information We Collect",
      content:
        "We may collect personal information such as your name, mobile number, email address, profile photo, location data, booking details, driver documents, and other account information necessary to operate the SakayNa platform.",
    },
    {
      title: "2. Location Data",
      content:
        "SakayNa uses location data to provide core ride-booking features such as detecting pickup and drop-off points, matching commuters with nearby drivers, calculating trip routes, and improving service availability.",
    },
    {
      title: "3. Driver Verification Data",
      content:
        "Drivers may be required to submit verification details including driver’s license, vehicle information, OR/CR, profile photo, and other supporting documents to confirm identity and eligibility to provide transport services.",
    },
    {
      title: "4. How We Use Your Information",
      content:
        "We use collected information to create and manage accounts, process ride bookings, verify drivers, improve app performance, send important notifications, maintain safety and security, and support customer service requests.",
    },
    {
      title: "5. Payments, Wallet, and Rewards",
      content:
        "If the platform provides features such as trip earnings records, subscriptions, points, or similar services, related information may be processed to support app operations, user records, and service management.",
    },
    {
      title: "6. Sharing of Information",
      content:
        "We may share limited information when necessary to operate the service, such as sharing commuter pickup details with drivers and sharing relevant trip details between involved users. We do not sell your personal data to third parties.",
    },
    {
      title: "7. Data Storage and Security",
      content:
        "SakayNa applies reasonable technical and organizational measures to protect personal data against unauthorized access, loss, misuse, or alteration. However, no system can guarantee absolute security.",
    },
    {
      title: "8. Data Retention",
      content:
        "We retain personal data only as long as necessary to provide services, comply with legal obligations, resolve disputes, enforce agreements, and maintain safety and platform integrity.",
    },
    {
      title: "9. Your Rights",
      content:
        "You may request access to your personal information, correction of inaccurate information, or account-related assistance, subject to applicable laws, platform procedures, and identity verification requirements.",
    },
    {
      title: "10. Children’s Privacy",
      content:
        "SakayNa is not intended for users who are not legally permitted to use transport booking services under applicable laws or local regulations.",
    },
    {
      title: "11. Third-Party Services",
      content:
        "The application may use third-party services such as maps, notifications, cloud storage, and payment-related tools. These services may process data as needed to support SakayNa features.",
    },
    {
      title: "12. Policy Updates",
      content:
        "We may update this Privacy Policy from time to time. Continued use of SakayNa after updates means you acknowledge and accept the revised policy.",
    },
    {
      title: "13. Contact Us",
      content:
        "If you have any questions or concerns regarding this Privacy Policy or your personal data, you may contact SakayNa support through the contact information available in the application.",
    },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#183B5C" />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.contentContainer,
          { paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>SakayNa Privacy Policy</Text>
          <Text style={styles.heroSubtitle}>
            Effective Date: April 3, 2026
          </Text>
          <Text style={styles.heroText}>
            This Privacy Policy explains how SakayNa collects, uses, stores,
            and protects your personal information.
          </Text>
        </View>

        {privacySections.map((section, index) => (
          <View key={index} style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionText}>{section.content}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const COLORS = {
  navy: "#183B5C",
  orange: "#E97A3E",
  bg: "#F7F8FA",
  white: "#FFFFFF",
  text: "#1F2937",
  subtext: "#6B7280",
  border: "#E5E7EB",
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    backgroundColor: COLORS.navy,
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "700",
  },
  placeholder: {
    width: 42,
    height: 42,
  },
  contentContainer: {
    padding: 16,
  },
  heroCard: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.navy,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 13,
    color: COLORS.orange,
    fontWeight: "600",
    marginBottom: 10,
  },
  heroText: {
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.subtext,
  },
  sectionCard: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 8,
  },
  sectionText: {
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.subtext,
  },
});