// screens/commuter/TransactionDetails.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";

export default function TransactionDetailsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const { transaction } = route.params || {};

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const formatCurrency = (amount) => {
    return `₱${amount?.toFixed(2) || "0.00"}`;
  };

  const getTransactionIcon = (type) => {
    switch (type) {
      case "cash_in":
        return { name: "arrow-down-circle", color: "#10B981", bg: "#D1FAE5", label: "Cash In" };
      case "payment":
        return { name: "arrow-up-circle", color: "#EF4444", bg: "#FEE2E2", label: "Payment" };
      case "refund":
        return { name: "repeat", color: "#F59E0B", bg: "#FEF3C7", label: "Refund" };
      case "bonus":
        return { name: "gift", color: "#8B5CF6", bg: "#EDE9FE", label: "Bonus" };
      default:
        return { name: "swap-horizontal", color: "#6B7280", bg: "#F3F4F6", label: "Transaction" };
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "completed":
        return { bg: "#D1FAE5", text: "#10B981", label: "Completed" };
      case "pending":
        return { bg: "#FEF3C7", text: "#F59E0B", label: "Pending" };
      case "failed":
        return { bg: "#FEE2E2", text: "#EF4444", label: "Failed" };
      default:
        return { bg: "#F3F4F6", text: "#6B7280", label: status };
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Transaction Receipt\n\nTransaction ID: ${transaction.id}\nType: ${transaction.type}\nAmount: ${formatCurrency(transaction.amount)}\nStatus: ${transaction.status}\nDate: ${formatDate(transaction.created_at)}`,
      });
    } catch (err) {
      console.log("Error sharing:", err);
    }
  };

  const handleDownload = () => {
    Alert.alert("Download Receipt", "Receipt has been downloaded to your device.");
  };

  if (!transaction) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#183B5C" />
          </Pressable>
          <Text style={styles.headerTitle}>Transaction Details</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={64} color="#D1D5DB" />
          <Text style={styles.emptyStateTitle}>Transaction Not Found</Text>
        </View>
      </View>
    );
  }

  const icon = getTransactionIcon(transaction.type);
  const status = getStatusColor(transaction.status);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#183B5C" />
        </Pressable>
        <Text style={styles.headerTitle}>Transaction Details</Text>
        <Pressable onPress={handleShare} style={styles.shareButton}>
          <Ionicons name="share-social" size={24} color="#183B5C" />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Status Card */}
        <View style={styles.statusCard}>
          <View style={[styles.iconContainer, { backgroundColor: icon.bg }]}>
            <Ionicons name={icon.name} size={48} color={icon.color} />
          </View>
          <Text style={styles.amount}>{formatCurrency(transaction.amount)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusText, { color: status.text }]}>
              {status.label}
            </Text>
          </View>
        </View>

        {/* Transaction Details */}
        <View style={styles.detailsCard}>
          <Text style={styles.sectionTitle}>Transaction Information</Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Transaction ID</Text>
            <Text style={styles.detailValue}>{transaction.id}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Type</Text>
            <Text style={styles.detailValue}>{icon.label}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Amount</Text>
            <Text style={[styles.detailValue, { color: icon.color }]}>
              {formatCurrency(transaction.amount)}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Date & Time</Text>
            <Text style={styles.detailValue}>{formatDate(transaction.created_at)}</Text>
          </View>

          {transaction.metadata?.reference && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Reference</Text>
              <Text style={styles.detailValue}>{transaction.metadata.reference}</Text>
            </View>
          )}

          {transaction.metadata?.method && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Payment Method</Text>
              <Text style={styles.detailValue}>
                {transaction.metadata.method.toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        {/* Additional Info */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="information-circle" size={20} color="#183B5C" />
            <Text style={styles.infoText}>
              For questions about this transaction, please contact support.
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          <Pressable style={styles.downloadButton} onPress={handleDownload}>
            <Ionicons name="download" size={20} color="#183B5C" />
            <Text style={styles.downloadButtonText}>Download Receipt</Text>
          </Pressable>

          <Pressable
            style={styles.supportButton}
            onPress={() => navigation.navigate("Support", { 
              transactionId: transaction.id 
            })}
          >
            <Ionicons name="help-circle" size={20} color="#EF4444" />
            <Text style={styles.supportButtonText}>Need Help?</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#183B5C",
  },
  shareButton: {
    padding: 8,
  },
  statusCard: {
    alignItems: "center",
    backgroundColor: "#FFF",
    margin: 20,
    padding: 30,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  amount: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 15,
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "600",
  },
  detailsCard: {
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginBottom: 15,
    padding: 20,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 15,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  detailLabel: {
    fontSize: 14,
    color: "#666",
  },
  detailValue: {
    fontSize: 14,
    color: "#333",
    fontWeight: "500",
    maxWidth: "60%",
    textAlign: "right",
  },
  infoCard: {
    backgroundColor: "#F0F7FF",
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 15,
    borderRadius: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: "#183B5C",
    lineHeight: 18,
  },
  actionContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingBottom: 30,
    gap: 10,
  },
  downloadButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  downloadButtonText: {
    color: "#183B5C",
    fontSize: 14,
    fontWeight: "600",
  },
  supportButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEE2E2",
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  supportButtonText: {
    color: "#EF4444",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginTop: 20,
  },
});