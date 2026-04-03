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

export default function TermsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const termsSections = [
    {
      title: "1. Acceptance of Terms",
      content:
        "By creating an account, accessing, or using the SakayNa mobile application, you agree to be bound by these Terms and Conditions. If you do not agree, please do not use the application.",
    },
    {
      title: "2. Description of Service",
      content:
        "SakayNa is a transportation booking platform that connects commuters with registered drivers. The application allows users to request rides, view trip details, track bookings, and manage their accounts within the platform.",
    },
    {
      title: "3. User Eligibility",
      content:
        "You must provide accurate and complete information when registering for SakayNa. By using the platform, you confirm that the information you submit is true and updated.",
    },
    {
      title: "4. User Responsibilities",
      content:
        "Users agree to use SakayNa responsibly and lawfully. Commuters must provide accurate pickup and drop-off details. Drivers must maintain valid documents, licenses, and comply with all road safety and legal requirements.",
    },
    {
      title: "5. Driver Verification",
      content:
        "Drivers are required to submit valid documents such as driver’s license, vehicle information, and other supporting verification requirements before being approved to accept bookings on the platform.",
    },
    {
      title: "6. Booking and Ride Rules",
      content:
        "All bookings made through SakayNa are subject to driver availability, location coverage, and platform rules. SakayNa reserves the right to cancel, reject, or limit access to bookings in cases of suspicious, abusive, or fraudulent activity.",
    },
    {
      title: "7. Payments and Fees",
      content:
        "Fare estimates shown in the app may vary depending on trip details, rates, and service conditions. Drivers may also be subject to subscription or platform-related charges based on the current SakayNa business model.",
    },
    {
      title: "8. Points and Rewards",
      content:
        "Any points, rewards, or incentives provided to users are subject to SakayNa policies and may be modified, suspended, or removed at any time without prior notice.",
    },
    {
      title: "9. Prohibited Activities",
      content:
        "Users must not misuse the platform, submit false information, harass other users, commit fraud, attempt unauthorized access, or use the app for illegal activities.",
    },
    {
      title: "10. Account Suspension or Termination",
      content:
        "SakayNa reserves the right to suspend, restrict, or terminate accounts that violate these Terms, submit false documents, engage in misconduct, or create security and safety risks for the platform and its users.",
    },
    {
      title: "11. Limitation of Liability",
      content:
        "SakayNa provides the platform on an 'as is' and 'as available' basis. While we strive to provide reliable service, we do not guarantee uninterrupted access, perfect accuracy, or that the service will always be error-free.",
    },
    {
      title: "12. Privacy",
      content:
        "Your use of SakayNa is also governed by our Privacy Policy, which explains how we collect, use, and protect your personal information.",
    },
    {
      title: "13. Changes to Terms",
      content:
        "SakayNa may update these Terms and Conditions from time to time. Continued use of the application after changes take effect means you accept the revised Terms.",
    },
    {
      title: "14. Contact Us",
      content:
        "For questions, concerns, or reports regarding these Terms and Conditions, you may contact the SakayNa support team through the contact details provided in the application.",
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

        <Text style={styles.headerTitle}>Terms & Conditions</Text>
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
          <Text style={styles.heroTitle}>SakayNa Terms & Conditions</Text>
          <Text style={styles.heroSubtitle}>
            Effective Date: April 3, 2026
          </Text>
          <Text style={styles.heroText}>
            Please read these terms carefully before using the SakayNa
            application.
          </Text>
        </View>

        {termsSections.map((section, index) => (
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