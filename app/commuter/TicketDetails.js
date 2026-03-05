// screens/commuter/TicketDetails.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";

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

  useEffect(() => {
    if (id) {
      fetchTicketDetails();
      fetchReplies();
    }
  }, [id]);

  const fetchTicketDetails = async () => {
    try {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setTicket(data);

    } catch (err) {
      console.log("Error fetching ticket:", err);
    }
  };

  const fetchReplies = async () => {
    try {
      const { data, error } = await supabase
        .from("ticket_replies")
        .select("*")
        .eq("ticket_id", id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setReplies(data || []);

    } catch (err) {
      console.log("Error fetching replies:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendReply = async () => {
    if (!newReply.trim()) return;

    setSending(true);

    try {
      const { data, error } = await supabase
        .from("ticket_replies")
        .insert([
          {
            ticket_id: id,
            user_id: ticket.user_id,
            user_type: "commuter",
            message: newReply,
            created_at: new Date(),
          },
        ])
        .select()
        .single();

      if (error) throw error;

      setReplies([...replies, data]);
      setNewReply("");

    } catch (err) {
      console.log("Error sending reply:", err);
      Alert.alert("Error", "Failed to send reply");
    } finally {
      setSending(false);
    }
  };

  const handleCloseTicket = () => {
    Alert.alert(
      "Close Ticket",
      "Are you sure you want to close this ticket?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Close Ticket",
          onPress: async () => {
            try {
              await supabase
                .from("support_tickets")
                .update({ 
                  status: "closed",
                  closed_at: new Date()
                })
                .eq("id", id);

              Alert.alert("Success", "Ticket closed successfully");
              navigation.goBack();

            } catch (err) {
              console.log("Error closing ticket:", err);
              Alert.alert("Error", "Failed to close ticket");
            }
          },
        },
      ]
    );
  };

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
    switch (category) {
      case "booking_issue": return "car";
      case "payment_problem": return "cash";
      case "driver_issue": return "person";
      case "app_technical": return "phone-portrait";
      case "account_concern": return "person-circle";
      default: return "help";
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "open": return { bg: "#FEF3C7", text: "#F59E0B" };
      case "in_progress": return { bg: "#E3F2FD", text: "#3B82F6" };
      case "resolved": return { bg: "#D1FAE5", text: "#10B981" };
      case "closed": return { bg: "#F3F4F6", text: "#6B7280" };
      default: return { bg: "#F3F4F6", text: "#6B7280" };
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
      </View>
    );
  }

  if (!ticket) {
    return (
      <View style={styles.container}>
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
        </View>
      </View>
    );
  }

  const status = getStatusColor(ticket.status);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#183B5C" />
        </Pressable>
        <Text style={styles.headerTitle}>Ticket #{ticket.ticket_number}</Text>
        {ticket.status !== "closed" && (
          <Pressable onPress={handleCloseTicket} style={styles.closeButton}>
            <Ionicons name="close-circle" size={24} color="#EF4444" />
          </Pressable>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Ticket Info */}
        <View style={styles.ticketCard}>
          <View style={styles.ticketHeader}>
            <View style={styles.ticketCategory}>
              <Ionicons 
                name={getCategoryIcon(ticket.category)} 
                size={20} 
                color="#183B5C" 
              />
              <Text style={styles.ticketCategoryText}>
                {ticket.category.replace("_", " ").toUpperCase()}
              </Text>
            </View>
            <View style={[styles.ticketStatus, { backgroundColor: status.bg }]}>
              <Text style={[styles.ticketStatusText, { color: status.text }]}>
                {ticket.status}
              </Text>
            </View>
          </View>

          <Text style={styles.ticketSubject}>{ticket.subject}</Text>
          <Text style={styles.ticketDescription}>{ticket.description}</Text>

          {ticket.related_booking_id && (
            <Pressable
              style={styles.bookingLink}
              onPress={() => navigation.navigate("BookingDetails", { 
                id: ticket.related_booking_id 
              })}
            >
              <Ionicons name="car" size={16} color="#183B5C" />
              <Text style={styles.bookingLinkText}>
                View Related Booking
              </Text>
            </Pressable>
          )}
        </View>

        {/* Replies */}
        <View style={styles.repliesSection}>
          <Text style={styles.repliesTitle}>Conversation</Text>

          {replies.length === 0 ? (
            <View style={styles.noReplies}>
              <Text style={styles.noRepliesText}>
                No replies yet. The support team will respond shortly.
              </Text>
            </View>
          ) : (
            replies.map((reply) => (
              <View
                key={reply.id}
                style={[
                  styles.replyItem,
                  reply.user_type === "admin" && styles.adminReply,
                ]}
              >
                <View style={styles.replyHeader}>
                  <Text style={styles.replyUser}>
                    {reply.user_type === "admin" ? "Support Team" : "You"}
                  </Text>
                  <Text style={styles.replyTime}>{formatDate(reply.created_at)}</Text>
                </View>
                <Text style={styles.replyMessage}>{reply.message}</Text>
              </View>
            ))
          )}
        </View>

        {/* Reply Input - Only if ticket is not closed */}
        {ticket.status !== "closed" && (
          <View style={styles.replyInputContainer}>
            <TextInput
              style={styles.replyInput}
              placeholder="Type your reply..."
              value={newReply}
              onChangeText={setNewReply}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <Pressable
              style={[styles.sendButton, (!newReply || sending) && styles.sendButtonDisabled]}
              onPress={handleSendReply}
              disabled={!newReply || sending}
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
      </ScrollView>
    </View>
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
  closeButton: {
    padding: 8,
  },
  ticketCard: {
    backgroundColor: "#FFF",
    margin: 20,
    padding: 20,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  ticketHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  ticketCategory: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ticketCategoryText: {
    fontSize: 12,
    color: "#666",
  },
  ticketStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  ticketStatusText: {
    fontSize: 11,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  ticketSubject: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 10,
  },
  ticketDescription: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
    marginBottom: 15,
  },
  bookingLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  bookingLinkText: {
    fontSize: 13,
    color: "#183B5C",
    fontWeight: "500",
  },
  repliesSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  repliesTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 15,
  },
  noReplies: {
    backgroundColor: "#FFF",
    padding: 20,
    borderRadius: 12,
    alignItems: "center",
  },
  noRepliesText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  replyItem: {
    backgroundColor: "#FFF",
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  adminReply: {
    backgroundColor: "#F0F7FF",
    borderLeftWidth: 3,
    borderLeftColor: "#183B5C",
  },
  replyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  replyUser: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },
  replyTime: {
    fontSize: 11,
    color: "#999",
  },
  replyMessage: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
  },
  replyInputContainer: {
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginBottom: 30,
    padding: 15,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  replyInput: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 15,
    fontSize: 14,
    color: "#333",
    minHeight: 80,
    marginBottom: 10,
  },
  sendButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#183B5C",
    padding: 14,
    borderRadius: 12,
    gap: 8,
  },
  sendButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  sendButtonText: {
    color: "#FFF",
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