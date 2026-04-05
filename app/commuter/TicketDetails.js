// screens/commuter/TicketDetails.js
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function TicketDetailsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const { id } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [ticket, setTicket] = useState(null);
  const [replies, setReplies] = useState([]);
  const [newReply, setNewReply] = useState("");
  const [sending, setSending] = useState(false);

  // The current user's UUID from `users` table
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    const init = async () => {
      const uid = await AsyncStorage.getItem("user_id");
      setUserId(uid);
      if (id) {
        await fetchTicketDetails();
        await fetchReplies();
      }
    };
    init();
  }, [id]);

  // ─── Fetch ticket ─────────────────────────────────────────────────────────
  const fetchTicketDetails = async () => {
    try {
      const { data, error } = await supabase
        .from("support_tickets")
        .select(`
          id, ticket_number, user_id, user_type,
          category, sub_category, subject, description,
          priority, status,
          related_booking_id, related_driver_id,
          resolved_at, closed_at,
          satisfaction_rating, satisfaction_feedback,
          created_at, updated_at
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      setTicket(data);
    } catch (err) {
      console.log("Error fetching ticket:", err);
    }
  };

  // ─── Fetch replies ────────────────────────────────────────────────────────
  const fetchReplies = async () => {
    try {
      const { data, error } = await supabase
        .from("ticket_replies")
        .select("id, ticket_id, user_id, user_type, message, is_internal, created_at")
        .eq("ticket_id", id)
        .eq("is_internal", false)        // hide admin-only internal notes from commuter
        .order("created_at", { ascending: true });

      if (error) throw error;
      setReplies(data || []);
    } catch (err) {
      console.log("Error fetching replies:", err);
    } finally {
      setLoading(false);
    }
  };

  // ─── Send reply ───────────────────────────────────────────────────────────
  const handleSendReply = async () => {
    if (!newReply.trim()) return;
    if (!userId) {
      Alert.alert("Error", "User session not found. Please log in again.");
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase
        .from("ticket_replies")
        .insert([
          {
            ticket_id:   id,
            user_id:     userId,       // references users.id
            user_type:   "commuter",
            message:     newReply.trim(),
            is_internal: false,
          },
        ])
        .select("id, ticket_id, user_id, user_type, message, is_internal, created_at")
        .single();

      if (error) throw error;

      setReplies((prev) => [...prev, data]);
      setNewReply("");

      // Also bump the ticket's updated_at so it surfaces at top of list
      await supabase
        .from("support_tickets")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", id);
    } catch (err) {
      console.log("Error sending reply:", err);
      Alert.alert("Error", "Failed to send reply. Please try again.");
    } finally {
      setSending(false);
    }
  };

  // ─── Close ticket ─────────────────────────────────────────────────────────
  const handleCloseTicket = () => {
    Alert.alert(
      "Close Ticket",
      "Are you sure you want to close this ticket? You won't be able to reply after closing.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Close Ticket",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("support_tickets")
                .update({
                  status:     "closed",
                  closed_at:  new Date().toISOString(),
                  closed_by:  userId,   // references users.id
                  updated_at: new Date().toISOString(),
                })
                .eq("id", id);

              if (error) throw error;

              Alert.alert("Ticket Closed", "Your ticket has been closed successfully.", [
                { text: "OK", onPress: () => navigation.goBack() },
              ]);
            } catch (err) {
              console.log("Error closing ticket:", err);
              Alert.alert("Error", "Failed to close ticket. Please try again.");
            }
          },
        },
      ]
    );
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getCategoryIcon = (category) => {
    const MAP = {
      booking_issue:     "car",
      payment_problem:   "cash",
      driver_issue:      "person",
      app_technical:     "phone-portrait",
      account_concern:   "person-circle",
      referral_question: "people",
      mission_bonus:     "trophy",
      verification:      "shield-checkmark",
      other:             "help",
    };
    return MAP[category] || "help";
  };

  const getCategoryLabel = (category) => {
    return (category || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "open":            return { bg: "#FEF3C7", text: "#F59E0B" };
      case "in_progress":     return { bg: "#E3F2FD", text: "#3B82F6" };
      case "waiting_on_user": return { bg: "#FFF3E0", text: "#FF9800" };
      case "resolved":        return { bg: "#D1FAE5", text: "#10B981" };
      case "closed":          return { bg: "#F3F4F6", text: "#6B7280" };
      default:                return { bg: "#F3F4F6", text: "#6B7280" };
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case "waiting_on_user": return "Waiting on You";
      case "in_progress":     return "In Progress";
      default:
        return (status || "").charAt(0).toUpperCase() + (status || "").slice(1);
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case "urgent": return "#EF4444";
      case "high":   return "#F97316";
      case "medium": return "#F59E0B";
      case "low":    return "#10B981";
      default:       return "#6B7280";
    }
  };

  const isClosed = ticket?.status === "closed" || ticket?.status === "resolved";

  // ─── Loading / Not found ──────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
      </View>
    );
  }

  if (!ticket) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#183B5C" />
          </Pressable>
          <Text style={styles.headerTitle}>Ticket Details</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={64} color="#D1D5DB" />
          <Text style={styles.emptyStateTitle}>Ticket Not Found</Text>
          <Text style={styles.emptyStateText}>
            This ticket may have been removed or you don't have access.
          </Text>
        </View>
      </View>
    );
  }

  const statusStyle = getStatusColor(ticket.status);

  // ─── Main render ──────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#183B5C" />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {ticket.ticket_number}
          </Text>
          {!isClosed ? (
            <Pressable onPress={handleCloseTicket} style={styles.closeButton}>
              <Ionicons name="close-circle" size={24} color="#EF4444" />
            </Pressable>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* ── Ticket Info Card ─────────────────────────────────────────── */}
          <View style={styles.ticketCard}>
            {/* Category + Status row */}
            <View style={styles.ticketHeaderRow}>
              <View style={styles.ticketCategory}>
                <Ionicons
                  name={getCategoryIcon(ticket.category)}
                  size={18}
                  color="#183B5C"
                />
                <Text style={styles.ticketCategoryText}>
                  {getCategoryLabel(ticket.category)}
                </Text>
              </View>
              <View style={[styles.ticketStatus, { backgroundColor: statusStyle.bg }]}>
                <Text style={[styles.ticketStatusText, { color: statusStyle.text }]}>
                  {getStatusLabel(ticket.status)}
                </Text>
              </View>
            </View>

            {/* Priority badge */}
            <View style={styles.priorityRow}>
              <View
                style={[
                  styles.priorityBadge,
                  { backgroundColor: getPriorityColor(ticket.priority) + "20" },
                ]}
              >
                <View
                  style={[
                    styles.priorityDot,
                    { backgroundColor: getPriorityColor(ticket.priority) },
                  ]}
                />
                <Text
                  style={[
                    styles.priorityText,
                    { color: getPriorityColor(ticket.priority) },
                  ]}
                >
                  {ticket.priority?.toUpperCase()} PRIORITY
                </Text>
              </View>
              <Text style={styles.createdAt}>
                {formatDate(ticket.created_at)}
              </Text>
            </View>

            {/* Subject */}
            <Text style={styles.ticketSubject}>{ticket.subject}</Text>

            {/* Description */}
            <Text style={styles.ticketDescription}>{ticket.description}</Text>

            {/* Linked booking */}
            {ticket.related_booking_id && (
              <Pressable
                style={styles.bookingLink}
                onPress={() =>
                  navigation.navigate("BookingDetails", {
                    id: ticket.related_booking_id,
                  })
                }
              >
                <Ionicons name="car" size={16} color="#183B5C" />
                <Text style={styles.bookingLinkText}>View Related Booking</Text>
                <Ionicons name="chevron-forward" size={14} color="#183B5C" />
              </Pressable>
            )}

            {/* Resolution note if resolved */}
            {ticket.status === "resolved" && ticket.resolved_at && (
              <View style={styles.resolvedBanner}>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <Text style={styles.resolvedText}>
                  Resolved on {formatDate(ticket.resolved_at)}
                </Text>
              </View>
            )}
          </View>

          {/* ── Conversation ─────────────────────────────────────────────── */}
          <View style={styles.repliesSection}>
            <Text style={styles.repliesTitle}>Conversation</Text>

            {replies.length === 0 ? (
              <View style={styles.noReplies}>
                <Ionicons name="chatbubble-outline" size={40} color="#D1D5DB" />
                <Text style={styles.noRepliesText}>
                  No replies yet. Our support team will respond shortly.
                </Text>
              </View>
            ) : (
              replies.map((reply) => {
                const isAdmin = reply.user_type === "admin";
                const isCurrentUser = reply.user_id === userId;
                return (
                  <View
                    key={reply.id}
                    style={[
                      styles.replyItem,
                      isAdmin && styles.adminReply,
                      !isAdmin && !isCurrentUser && styles.otherReply,
                    ]}
                  >
                    <View style={styles.replyHeader}>
                      <Text style={styles.replyUser}>
                        {isAdmin ? "Support Team" : "You"}
                      </Text>
                      <Text style={styles.replyTime}>
                        {formatDate(reply.created_at)}
                      </Text>
                    </View>
                    <Text style={styles.replyMessage}>{reply.message}</Text>
                  </View>
                );
              })
            )}
          </View>

          {/* ── Reply Input (only if not closed/resolved) ─────────────────── */}
          {!isClosed && (
            <View style={styles.replyInputContainer}>
              <TextInput
                style={styles.replyInput}
                placeholder="Type your reply..."
                placeholderTextColor="#999"
                value={newReply}
                onChangeText={setNewReply}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                maxLength={2000}
              />
              <Pressable
                style={[
                  styles.sendButton,
                  (!newReply.trim() || sending) && styles.sendButtonDisabled,
                ]}
                onPress={handleSendReply}
                disabled={!newReply.trim() || sending}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="send" size={16} color="#FFF" />
                    <Text style={styles.sendButtonText}>Send</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}

          {/* Closed notice */}
          {isClosed && (
            <View style={styles.closedNotice}>
              <Ionicons name="lock-closed" size={16} color="#6B7280" />
              <Text style={styles.closedNoticeText}>
                This ticket is {ticket.status}. No further replies can be sent.
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: "#F5F7FA" },
  loadingContainer:   { flex: 1, justifyContent: "center", alignItems: "center" },
  header:             {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 15, backgroundColor: "#FFF",
    borderBottomWidth: 1, borderBottomColor: "#E5E7EB",
  },
  backButton:         { padding: 8 },
  headerTitle:        { fontSize: 17, fontWeight: "600", color: "#183B5C", flex: 1, textAlign: "center" },
  closeButton:        { padding: 8 },
  ticketCard:         {
    backgroundColor: "#FFF", margin: 20, padding: 20, borderRadius: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  ticketHeaderRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  ticketCategory:     { flexDirection: "row", alignItems: "center", gap: 6 },
  ticketCategoryText: { fontSize: 12, color: "#666", fontWeight: "500" },
  ticketStatus:       { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  ticketStatusText:   { fontSize: 11, fontWeight: "600" },
  priorityRow:        { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  priorityBadge:      { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, gap: 5 },
  priorityDot:        { width: 6, height: 6, borderRadius: 3 },
  priorityText:       { fontSize: 10, fontWeight: "700" },
  createdAt:          { fontSize: 11, color: "#999" },
  ticketSubject:      { fontSize: 18, fontWeight: "700", color: "#1a1a1a", marginBottom: 10 },
  ticketDescription:  { fontSize: 14, color: "#555", lineHeight: 22, marginBottom: 15 },
  bookingLink:        {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingTop: 15, borderTopWidth: 1, borderTopColor: "#F3F4F6",
  },
  bookingLinkText:    { fontSize: 13, color: "#183B5C", fontWeight: "500", flex: 1 },
  resolvedBanner:     {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#D1FAE5", borderRadius: 10, padding: 10, marginTop: 12,
  },
  resolvedText:       { fontSize: 13, color: "#10B981", fontWeight: "500" },
  repliesSection:     { paddingHorizontal: 20, marginBottom: 10 },
  repliesTitle:       { fontSize: 16, fontWeight: "600", color: "#333", marginBottom: 15 },
  noReplies:          { backgroundColor: "#FFF", padding: 30, borderRadius: 12, alignItems: "center", gap: 10 },
  noRepliesText:      { fontSize: 14, color: "#666", textAlign: "center", lineHeight: 20 },
  replyItem:          {
    backgroundColor: "#FFF", padding: 15, borderRadius: 12, marginBottom: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  adminReply:         { backgroundColor: "#F0F7FF", borderLeftWidth: 3, borderLeftColor: "#183B5C" },
  otherReply:         { backgroundColor: "#FFF9F0", borderLeftWidth: 3, borderLeftColor: "#F59E0B" },
  replyHeader:        { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  replyUser:          { fontSize: 13, fontWeight: "600", color: "#333" },
  replyTime:          { fontSize: 11, color: "#999" },
  replyMessage:       { fontSize: 14, color: "#555", lineHeight: 20 },
  replyInputContainer:{
    backgroundColor: "#FFF", marginHorizontal: 20, marginBottom: 30,
    padding: 15, borderRadius: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  replyInput:         {
    backgroundColor: "#F9FAFB", borderRadius: 12, padding: 15,
    fontSize: 14, color: "#333", minHeight: 80, marginBottom: 10,
  },
  sendButton:         {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: "#183B5C", padding: 14, borderRadius: 12, gap: 8,
  },
  sendButtonDisabled: { backgroundColor: "#9CA3AF" },
  sendButtonText:     { color: "#FFF", fontSize: 14, fontWeight: "600" },
  closedNotice:       {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#F3F4F6", marginHorizontal: 20, marginBottom: 30,
    padding: 15, borderRadius: 12,
  },
  closedNoticeText:   { fontSize: 13, color: "#6B7280", flex: 1, lineHeight: 18 },
  emptyState:         { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  emptyStateTitle:    { fontSize: 18, fontWeight: "600", color: "#333", marginTop: 20 },
  emptyStateText:     { fontSize: 14, color: "#666", marginTop: 8, textAlign: "center", lineHeight: 20 },
});