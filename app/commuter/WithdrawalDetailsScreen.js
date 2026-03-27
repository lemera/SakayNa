// screens/commuter/WithdrawalDetailsScreen.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Share,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from 'expo-haptics';

export default function WithdrawalDetailsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const { withdrawalId } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [withdrawal, setWithdrawal] = useState(null);
  const [userId, setUserId] = useState(null);
  const [userType, setUserType] = useState('commuter');
  const [paymentMethodDetails, setPaymentMethodDetails] = useState(null);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    loadWithdrawalDetails();
  }, [withdrawalId]);

  const loadWithdrawalDetails = async () => {
    try {
      setLoading(true);
      
      // Get current user
      const id = await AsyncStorage.getItem("user_id");
      const type = await AsyncStorage.getItem("user_type") || 'commuter';
      setUserId(id);
      setUserType(type);

      if (!withdrawalId) {
        Alert.alert("Error", "No withdrawal ID provided");
        navigation.goBack();
        return;
      }

      // Fetch withdrawal details
      const { data: withdrawalData, error: withdrawalError } = await supabase
        .from("withdrawals")
        .select(`
          *,
          user_payment_methods (
            id,
            payment_type,
            account_name,
            account_number,
            account_phone,
            recipient_name,
            is_verified
          )
        `)
        .eq("id", withdrawalId)
        .single();

      if (withdrawalError) throw withdrawalError;

      setWithdrawal(withdrawalData);
      
      // Fetch payment method details if available
      if (withdrawalData.payment_method_id) {
        const { data: paymentData, error: paymentError } = await supabase
          .from("user_payment_methods")
          .select("*")
          .eq("id", withdrawalData.payment_method_id)
          .single();

        if (!paymentError && paymentData) {
          setPaymentMethodDetails(paymentData);
        }
      }

      // Fetch withdrawal logs
      const { data: logsData, error: logsError } = await supabase
        .from("withdrawal_logs")
        .select(`
          *,
          users!withdrawal_logs_user_id_fkey (
            user_type
          )
        `)
        .eq("withdrawal_id", withdrawalId)
        .order("created_at", { ascending: true });

      if (!logsError && logsData) {
        setLogs(logsData);
      }

    } catch (err) {
      console.log("Error loading withdrawal details:", err);
      Alert.alert("Error", "Failed to load withdrawal details");
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'success':
      case 'completed':
        return '#10B981';
      case 'pending':
        return '#F59E0B';
      case 'failed':
      case 'rejected':
        return '#EF4444';
      case 'processing':
        return '#3B82F6';
      default:
        return '#6B7280';
    }
  };

  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'success':
      case 'completed':
        return 'checkmark-circle';
      case 'pending':
        return 'time-outline';
      case 'failed':
      case 'rejected':
        return 'close-circle';
      case 'processing':
        return 'sync-outline';
      default:
        return 'alert-circle-outline';
    }
  };

  const getStatusText = (status) => {
    switch (status?.toLowerCase()) {
      case 'success':
        return 'Successful';
      case 'completed':
        return 'Completed';
      case 'pending':
        return 'Pending';
      case 'failed':
        return 'Failed';
      case 'rejected':
        return 'Rejected';
      case 'processing':
        return 'Processing';
      default:
        return status || 'Unknown';
    }
  };

  const formatAmount = (amount) => {
    return `₱${parseFloat(amount).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatRelativeDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 7) return `${diffDays} days ago`;
    return formatDate(dateString);
  };

  const getPaymentMethodIcon = (paymentType) => {
    switch (paymentType?.toLowerCase()) {
      case 'gcash':
        return 'phone-portrait-outline';
      case 'paymaya':
        return 'card-outline';
      case 'bank':
        return 'business-outline';
      default:
        return 'cash-outline';
    }
  };

  const getPaymentMethodColor = (paymentType) => {
    switch (paymentType?.toLowerCase()) {
      case 'gcash':
        return '#0078FF';
      case 'paymaya':
        return '#FF4D4D';
      case 'bank':
        return '#10B981';
      default:
        return '#6B7280';
    }
  };

  const handleShareReceipt = async () => {
    if (!withdrawal) return;

    try {
      const message = `
Withdrawal Receipt
------------------
Amount: ${formatAmount(withdrawal.amount)}
Status: ${getStatusText(withdrawal.status)}
Reference #: ${withdrawal.reference_number || 'N/A'}
Payment Method: ${withdrawal.payment_method || 'N/A'}
Date: ${formatDate(withdrawal.created_at)}
      `.trim();

      await Share.share({
        message: message,
        title: 'Withdrawal Receipt',
      });
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.log("Error sharing receipt:", err);
    }
  };

  const handleContactSupport = () => {
    Alert.alert(
      "Contact Support",
      "Need help with this withdrawal? Contact our support team.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Chat Support",
          onPress: () => navigation.navigate("Support", { 
            category: "payment_problem",
            referenceId: withdrawalId 
          })
        },
        {
          text: "Email",
          onPress: () => Linking.openURL("mailto:support@tricycleapp.com")
        }
      ]
    );
  };

  const getActionLogMessage = (log) => {
    switch (log.action) {
      case 'requested':
        return 'Withdrawal request submitted';
      case 'viewed':
        return 'Request viewed by admin';
      case 'approved':
        return 'Withdrawal approved';
      case 'rejected':
        return `Withdrawal rejected${log.notes ? `: ${log.notes}` : ''}`;
      case 'completed':
        return 'Withdrawal completed successfully';
      case 'payment_sent':
        return 'Payment sent to your account';
      default:
        return log.notes || `${log.action} action performed`;
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#183B5C" />
          </Pressable>
          <Text style={styles.headerTitle}>Withdrawal Details</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#183B5C" />
          <Text style={styles.loadingText}>Loading withdrawal details...</Text>
        </View>
      </View>
    );
  }

  if (!withdrawal) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#183B5C" />
          </Pressable>
          <Text style={styles.headerTitle}>Withdrawal Details</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#EF4444" />
          <Text style={styles.errorTitle}>Withdrawal Not Found</Text>
          <Text style={styles.errorText}>
            The withdrawal you're looking for doesn't exist or has been removed.
          </Text>
          <Pressable 
            style={styles.goBackButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.goBackButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#183B5C" />
        </Pressable>
        <Text style={styles.headerTitle}>Withdrawal Details</Text>
        <Pressable onPress={handleShareReceipt} style={styles.shareButton}>
          <Ionicons name="share-outline" size={22} color="#183B5C" />
        </Pressable>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Status Card */}
        <View style={styles.statusCard}>
          <View style={[
            styles.statusIconContainer,
            { backgroundColor: `${getStatusColor(withdrawal.status)}15` }
          ]}>
            <Ionicons 
              name={getStatusIcon(withdrawal.status)} 
              size={40} 
              color={getStatusColor(withdrawal.status)} 
            />
          </View>
          <Text style={[styles.statusText, { color: getStatusColor(withdrawal.status) }]}>
            {getStatusText(withdrawal.status)}
          </Text>
          <Text style={styles.amountText}>{formatAmount(withdrawal.amount)}</Text>
          <Text style={styles.referenceText}>
            Ref: {withdrawal.reference_number || 'Pending'}
          </Text>
        </View>

        {/* Payment Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Details</Text>
          <View style={styles.detailCard}>
            <View style={styles.detailRow}>
              <Ionicons 
                name={getPaymentMethodIcon(withdrawal.payment_method)} 
                size={24} 
                color={getPaymentMethodColor(withdrawal.payment_method)} 
              />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Payment Method</Text>
                <Text style={styles.detailValue}>
                  {withdrawal.payment_method?.toUpperCase() || 'N/A'}
                </Text>
              </View>
            </View>

            {paymentMethodDetails && (
              <>
                <View style={styles.divider} />
                <View style={styles.detailRow}>
                  <Ionicons name="person-outline" size={20} color="#666" />
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Account Name</Text>
                    <Text style={styles.detailValue}>
                      {paymentMethodDetails.account_name || paymentMethodDetails.recipient_name || 'N/A'}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Ionicons name="card-outline" size={20} color="#666" />
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Account Number</Text>
                    <Text style={styles.detailValue}>
                      {paymentMethodDetails.account_number || 'N/A'}
                    </Text>
                  </View>
                </View>

                {paymentMethodDetails.account_phone && (
                  <View style={styles.detailRow}>
                    <Ionicons name="call-outline" size={20} color="#666" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Mobile Number</Text>
                      <Text style={styles.detailValue}>
                        {paymentMethodDetails.account_phone}
                      </Text>
                    </View>
                  </View>
                )}
              </>
            )}

            {withdrawal.gcash_sent_to && (
              <>
                <View style={styles.divider} />
                <View style={styles.detailRow}>
                  <Ionicons name="send-outline" size={20} color="#10B981" />
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Sent To</Text>
                    <Text style={styles.detailValue}>
                      {withdrawal.gcash_sent_to}
                    </Text>
                  </View>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Timeline */}
        {logs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Activity Timeline</Text>
            <View style={styles.timelineCard}>
              {logs.map((log, index) => (
                <View key={log.id} style={styles.timelineItem}>
                  <View style={styles.timelineLeft}>
                    <View style={[
                      styles.timelineDot,
                      index === logs.length - 1 && styles.timelineDotLast
                    ]} />
                    {index < logs.length - 1 && <View style={styles.timelineLine} />}
                  </View>
                  <View style={styles.timelineContent}>
                    <View style={styles.timelineHeader}>
                      <Ionicons 
                        name={log.action === 'completed' ? 'checkmark-circle' : 'time-outline'} 
                        size={18} 
                        color="#666" 
                      />
                      <Text style={styles.timelineAction}>
                        {getActionLogMessage(log)}
                      </Text>
                    </View>
                    <Text style={styles.timelineDate}>
                      {formatRelativeDate(log.created_at)}
                    </Text>
                    {log.user_type === 'admin' && (
                      <Text style={styles.timelineAdmin}>
                        Processed by admin
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Additional Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Information</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Request Date</Text>
              <Text style={styles.infoValue}>
                {formatDate(withdrawal.created_at)}
              </Text>
            </View>
            
            {withdrawal.processed_at && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Processed Date</Text>
                <Text style={styles.infoValue}>
                  {formatDate(withdrawal.processed_at)}
                </Text>
              </View>
            )}
            
            {withdrawal.completed_at && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Completed Date</Text>
                <Text style={styles.infoValue}>
                  {formatDate(withdrawal.completed_at)}
                </Text>
              </View>
            )}
            
            {withdrawal.payment_reference && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Payment Reference</Text>
                <Text style={styles.infoValue}>
                  {withdrawal.payment_reference}
                </Text>
              </View>
            )}
            
            {withdrawal.sender_reference && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Sender Reference</Text>
                <Text style={styles.infoValue}>
                  {withdrawal.sender_reference}
                </Text>
              </View>
            )}
            
            {withdrawal.admin_notes && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Admin Notes</Text>
                <Text style={styles.infoValue}>
                  {withdrawal.admin_notes}
                </Text>
              </View>
            )}
            
            {withdrawal.approval_notes && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Approval Notes</Text>
                <Text style={styles.infoValue}>
                  {withdrawal.approval_notes}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Action Buttons */}
        {withdrawal.status === 'pending' && (
          <View style={styles.actionButtons}>
            <Pressable 
              style={styles.contactButton}
              onPress={handleContactSupport}
            >
              <Ionicons name="chatbubble-outline" size={20} color="#183B5C" />
              <Text style={styles.contactButtonText}>Contact Support</Text>
            </Pressable>
          </View>
        )}
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
  shareButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#183B5C",
  },
  scrollContent: {
    padding: 20,
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
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#333",
    marginTop: 20,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
  },
  goBackButton: {
    backgroundColor: "#183B5C",
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 12,
  },
  goBackButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  statusCard: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  statusIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  statusText: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  amountText: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  referenceText: {
    fontSize: 12,
    color: "#999",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  detailCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: "#999",
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
  },
  divider: {
    height: 1,
    backgroundColor: "#F0F0F0",
    marginVertical: 12,
  },
  timelineCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  timelineItem: {
    flexDirection: "row",
    marginBottom: 16,
  },
  timelineLeft: {
    width: 30,
    alignItems: "center",
    position: "relative",
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#183B5C",
    marginTop: 4,
  },
  timelineDotLast: {
    backgroundColor: "#10B981",
  },
  timelineLine: {
    position: "absolute",
    top: 14,
    width: 2,
    height: "100%",
    backgroundColor: "#E5E7EB",
  },
  timelineContent: {
    flex: 1,
    marginLeft: 12,
  },
  timelineHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  timelineAction: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
  },
  timelineDate: {
    fontSize: 12,
    color: "#999",
    marginBottom: 4,
  },
  timelineAdmin: {
    fontSize: 11,
    color: "#10B981",
  },
  infoCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  infoLabel: {
    fontSize: 14,
    color: "#666",
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    textAlign: "right",
    flex: 1,
    marginLeft: 16,
  },
  actionButtons: {
    marginTop: 8,
    marginBottom: 20,
  },
  contactButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: "#183B5C",
  },
  contactButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#183B5C",
  },
});