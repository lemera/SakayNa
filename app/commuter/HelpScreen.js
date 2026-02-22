// HelpScreen.js
import React from "react";
import { View, Text, StyleSheet, Pressable, Linking, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function HelpScreen({ navigation }) {
  return (
    <ScrollView style={styles.container}>
      {/* Contact Support */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contact Support</Text>
        <Pressable style={styles.button} onPress={() => Linking.openURL("tel:+639123456789")}>
          <Ionicons name="call-outline" size={20} color="#fff" />
          <Text style={styles.buttonText}>Call +63 912 345 6789</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => Linking.openURL("mailto:support@sakayna.com")}>
          <Ionicons name="mail-outline" size={20} color="#fff" />
          <Text style={styles.buttonText}>Email support@sakayna.com</Text>
        </Pressable>
      </View>

      {/* FAQ Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
        <Pressable style={styles.link} onPress={() => navigation.navigate("FAQ")}>
          <Text style={styles.linkText}>View all FAQs</Text>
        </Pressable>
      </View>

      {/* Live Chat */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Live Chat</Text>
        <Pressable
          style={[styles.button, styles.chatButton]}
          onPress={() => Linking.openURL("https://wa.me/639123456789")}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={20} color="#fff" />
          <Text style={styles.buttonText}>Chat on WhatsApp</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#F5F7FA" },
  section: { marginBottom: 30 },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginBottom: 12, color: "#183B5C" },
  button: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E97A3E",
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: "#E97A3E",
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  chatButton: {
    backgroundColor: "#25D366", // WhatsApp green
    shadowColor: "#25D366",
  },
  buttonText: { color: "#fff", fontSize: 16, marginLeft: 12, fontWeight: "600" },
  link: { paddingVertical: 8 },
  linkText: { color: "#E97A3E", fontSize: 16, fontWeight: "600" },
});