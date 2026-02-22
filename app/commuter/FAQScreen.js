// FAQScreen.js
import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, LayoutAnimation, Platform, UIManager } from "react-native";
import { Ionicons } from "@expo/vector-icons";

// Enable LayoutAnimation on Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const faqData = [
  { question: "How do I book a ride?", answer: "Go to the Home tab, select pickup & dropoff locations, then choose a driver." },
  { question: "How do I pay for my ride?", answer: "Pay via the Wallet tab using your saved payment methods." },
  { question: "How do I report a driver?", answer: "Go to Track Ride, tap the driver profile, and select 'Report'." },
  { question: "How do I contact support?", answer: "Call +63 912 345 6789, email support@sakayna.com, or chat via WhatsApp." }
];

export default function FAQScreen() {
  const [expandedIndex, setExpandedIndex] = useState(null);

  const toggleExpand = (index) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <ScrollView style={styles.container}>
      {faqData.map((item, index) => (
        <Pressable key={index} onPress={() => toggleExpand(index)} style={[styles.faqItem, expandedIndex === index && styles.faqItemExpanded]}>
          <View style={styles.questionRow}>
            <Text style={styles.question}>{item.question}</Text>
            <Ionicons
              name={expandedIndex === index ? "chevron-up-outline" : "chevron-down-outline"}
              size={24}
              color="#E97A3E"
            />
          </View>
          {expandedIndex === index && <Text style={styles.answer}>{item.answer}</Text>}
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#F5F7FA",
  },
  faqItem: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  faqItemExpanded: {
    backgroundColor: "#FFF7F0",
  },
  questionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  question: {
    fontSize: 16,
    fontWeight: "600",
    color: "#183B5C",
    flex: 1,
    paddingRight: 10,
  },
  answer: {
    marginTop: 10,
    fontSize: 14,
    color: "#555",
    lineHeight: 20,
  },
});