// screens/commuter/Support.js
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
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function SupportScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const { bookingId } = route.params || {};

  const [loading, setLoading] = useState(false);
  const [commuterId, setCommuterId] = useState(null);
  const [commuter, setCommuter] = useState(null);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketData, setTicketData] = useState({
    category: "booking_issue",
    subject: "",
    description: "",
    bookingId: bookingId || null,
  });
  const [tickets, setTickets] = useState([]);
  const [faqs, setFaqs] = useState([
    {
      id: 1,
      question: "How do I book a ride?",
      answer: "Open the app, select your pickup and dropoff locations, choose number of passengers, and tap 'Book a Ride'. The system will automatically find a nearby driver for you.",
      open: false,
    },
    {
      id: 2,
      question: "How is the fare calculated?",
      answer: "Fare is calculated based on distance: ₱15 for the first kilometer, and ₱15 for each additional kilometer. The total fare is multiplied by the number of passengers.",
      open: false,
    },
    {
      id: 3,
      question: "How do I pay?",
      answer: "You can pay via cash, GCash, or using your wallet balance. You can set your preferred payment method in the Payment Methods section.",
      open: false,
    },
    {
      id: 4,
      question: "How do I cancel a booking?",
      answer: "Go to your active trip and tap 'Cancel'. Please note that cancellations after driver acceptance may incur a fee.",
      open: false,
    },
    {
      id: 5,
      question: "How do I earn points?",
      answer: "You earn 10 points per ride, 100 points per referral, double points on weekends, and bonus points on your birthday.",
      open: false,
    },
    {
      id: 6,
      question: "How do I contact my driver?",
      answer: "Once a driver accepts your booking, you can call or message them through the app using the buttons in the trip screen.",
      open: false,
    },
  ]);

  const [activeTab, setActiveTab] = useState("faq"); // faq, tickets

  useEffect(() => {
    loadUserData();
    if (commuterId) {
      loadTickets();
    }
  }, [commuterId]);

  const loadUserData = async () => {
    try {
      const id = await AsyncStorage.getItem("user_id");
      setCommuterId(id);

      const { data, error } = await supabase
        .from("commuters")
        .select("first_name, last_name, email, phone")
        .eq("id", id)
        .single();

      if (error) throw error;
      setCommuter(data);

    } catch (err) {
      console.log("Error loading user data:", err);
    }
  };

  const loadTickets = async () => {
    try {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*")
        .eq("user_id", commuterId)
        .eq("user_type", "commuter")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTickets(data || []);

    } catch (err) {
      console.log("Error loading tickets:", err);
    }
  };

  const toggleFaq = (id) => {
    setFaqs(faqs.map(faq =>
      faq.id === id ? { ...faq, open: !faq.open } : faq
    ));
  };

  const handleCreateTicket = async () => {
    if (!ticketData.subject || !ticketData.description) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    setLoading(true);

    try {
      // Generate ticket number
      const ticketNumber = `TKT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const { data, error } = await supabase
        .from("support_tickets")
        .insert([
          {
            ticket_number: ticketNumber,
            user_id: commuterId,
            user_type: "commuter",
            category: ticketData.category,
            subject: ticketData.subject,
            description: ticketData.description,
            related_booking_id: ticketData.bookingId,
            status: "open",
            priority: "medium",
            created_at: new Date(),
          },
        ])
        .select()
        .single();

      if (error) throw error;

      Alert.alert(
        "Ticket Created",
        `Your support ticket has been created. Ticket number: ${ticketNumber}\n\nWe'll get back to you within 24 hours.`,
        [
          {
            text: "OK",
            onPress: () => {
              setShowTicketModal(false);
              setTicketData({
                category: "booking_issue",
                subject: "",
                description: "",
                bookingId: null,
              });
              loadTickets();
            },
          },
        ]
      );

    } catch (err) {
      console.log("Error creating ticket:", err);
      Alert.alert("Error", "Failed to create support ticket");
    } finally {
      setLoading(false);
    }
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case "booking_issue":
        return "car";
      case "payment_problem":
        return "cash";
      case "driver_issue":
        return "person";
      case "app_technical":
        return "phone-portrait";
      case "account_concern":
        return "person-circle";
      default:
        return "help";
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "open":
        return { bg: "#FEF3C7", text: "#F59E0B" };
      case "in_progress":
        return { bg: "#E3F2FD", text: "#3B82F6" };
      case "resolved":
        return { bg: "#D1FAE5", text: "#10B981" };
      case "closed":
        return { bg: "#F3F4F6", text: "#6B7280" };
      default:
        return { bg: "#F3F4F6", text: "#6B7280" };
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Create Ticket Modal
  const TicketModal = () => (
    <Modal
      visible={showTicketModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowTicketModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Create Support Ticket</Text>
            <Pressable onPress={() => setShowTicketModal(false)}>
              <Ionicons name="close" size={24} color="#666" />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.modalLabel}>Category</Text>
            <View style={styles.categorySelector}>
              <Pressable
                style={[
                  styles.categoryOption,
                  ticketData.category === "booking_issue" && styles.categoryOptionSelected,
                ]}
                onPress={() => setTicketData({ ...ticketData, category: "booking_issue" })}
              >
                <Ionicons
                  name="car"
                  size={20}
                  color={ticketData.category === "booking_issue" ? "#FFF" : "#666"}
                />
                <Text
                  style={[
                    styles.categoryText,
                    ticketData.category === "booking_issue" && styles.categoryTextSelected,
                  ]}
                >
                  Booking
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.categoryOption,
                  ticketData.category === "payment_problem" && styles.categoryOptionSelected,
                ]}
                onPress={() => setTicketData({ ...ticketData, category: "payment_problem" })}
              >
                <Ionicons
                  name="cash"
                  size={20}
                  color={ticketData.category === "payment_problem" ? "#FFF" : "#666"}
                />
                <Text
                  style={[
                    styles.categoryText,
                    ticketData.category === "payment_problem" && styles.categoryTextSelected,
                  ]}
                >
                  Payment
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.categoryOption,
                  ticketData.category === "driver_issue" && styles.categoryOptionSelected,
                ]}
                onPress={() => setTicketData({ ...ticketData, category: "driver_issue" })}
              >
                <Ionicons
                  name="person"
                  size={20}
                  color={ticketData.category === "driver_issue" ? "#FFF" : "#666"}
                />
                <Text
                  style={[
                    styles.categoryText,
                    ticketData.category === "driver_issue" && styles.categoryTextSelected,
                  ]}
                >
                  Driver
                </Text>
              </Pressable>
            </View>

            <Text style={styles.modalLabel}>Subject</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Brief summary of your issue"
              value={ticketData.subject}
              onChangeText={(text) => setTicketData({ ...ticketData, subject: text })}
            />

            <Text style={styles.modalLabel}>Description</Text>
            <TextInput
              style={[styles.modalInput, styles.modalTextArea]}
              placeholder="Please provide details about your issue..."
              value={ticketData.description}
              onChangeText={(text) => setTicketData({ ...ticketData, description: text })}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />

            {bookingId && (
              <View style={styles.bookingInfo}>
                <Ionicons name="information-circle" size={20} color="#183B5C" />
                <Text style={styles.bookingInfoText}>
                  This ticket will be linked to Booking #{bookingId}
                </Text>
              </View>
            )}

            <Pressable
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleCreateTicket}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.submitButtonText}>Submit Ticket</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#183B5C" />
        </Pressable>
        <Text style={styles.headerTitle}>Help & Support</Text>
        <Pressable 
          style={styles.newTicketButton}
          onPress={() => setShowTicketModal(true)}
        >
          <Ionicons name="add" size={24} color="#183B5C" />
        </Pressable>
      </View>

      {/* Contact Info */}
      <View style={styles.contactCard}>
        <View style={styles.contactItem}>
          <Ionicons name="call" size={20} color="#183B5C" />
          <Text style={styles.contactText}>0912 345 6789</Text>
        </View>
        <View style={styles.contactDivider} />
        <View style={styles.contactItem}>
          <Ionicons name="mail" size={20} color="#183B5C" />
          <Text style={styles.contactText}>support@joyride.com</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <Pressable
          style={[styles.tab, activeTab === "faq" && styles.tabActive]}
          onPress={() => setActiveTab("faq")}
        >
          <Text style={[styles.tabText, activeTab === "faq" && styles.tabTextActive]}>
            FAQ
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "tickets" && styles.tabActive]}
          onPress={() => setActiveTab("tickets")}
        >
          <Text style={[styles.tabText, activeTab === "tickets" && styles.tabTextActive]}>
            My Tickets
          </Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {activeTab === "faq" ? (
          // FAQ Section
          <View style={styles.faqContainer}>
            {faqs.map((faq) => (
              <View key={faq.id} style={styles.faqItem}>
                <Pressable
                  style={styles.faqQuestion}
                  onPress={() => toggleFaq(faq.id)}
                >
                  <Text style={styles.faqQuestionText}>{faq.question}</Text>
                  <Ionicons
                    name={faq.open ? "chevron-up" : "chevron-down"}
                    size={20}
                    color="#666"
                  />
                </Pressable>
                {faq.open && (
                  <Text style={styles.faqAnswer}>{faq.answer}</Text>
                )}
              </View>
            ))}
          </View>
        ) : (
          // My Tickets Section
          <View style={styles.ticketsContainer}>
            {tickets.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="ticket-outline" size={64} color="#D1D5DB" />
                <Text style={styles.emptyStateTitle}>No Support Tickets</Text>
                <Text style={styles.emptyStateText}>
                  Tap the + button to create a support ticket
                </Text>
              </View>
            ) : (
              tickets.map((ticket) => {
                const status = getStatusColor(ticket.status);
                return (
                  <Pressable
                    key={ticket.id}
                    style={styles.ticketCard}
                    onPress={() => navigation.navigate("TicketDetails", { id: ticket.id })}
                  >
                    <View style={styles.ticketHeader}>
                      <View style={styles.ticketLeft}>
                        <View style={styles.ticketIcon}>
                          <Ionicons
                            name={getCategoryIcon(ticket.category)}
                            size={20}
                            color="#183B5C"
                          />
                        </View>
                        <View>
                          <Text style={styles.ticketNumber}>
                            {ticket.ticket_number}
                          </Text>
                          <Text style={styles.ticketSubject} numberOfLines={1}>
                            {ticket.subject}
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.ticketStatus, { backgroundColor: status.bg }]}>
                        <Text style={[styles.ticketStatusText, { color: status.text }]}>
                          {ticket.status}
                        </Text>
                      </View>
                    </View>
                    
                    <View style={styles.ticketFooter}>
                      <Text style={styles.ticketDate}>
                        {formatDate(ticket.created_at)}
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color="#999" />
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
        )}

        {/* Help Center Link */}
        <Pressable 
          style={styles.helpCenterLink}
          onPress={() => navigation.navigate("HelpCenter")}
        >
          <Text style={styles.helpCenterText}>Visit Help Center</Text>
          <Ionicons name="arrow-forward" size={16} color="#183B5C" />
        </Pressable>

        {/* App Version */}
        <Text style={styles.versionText}>Version 1.0.0</Text>
      </ScrollView>

      {/* Create Ticket Modal */}
      <TicketModal />
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
  newTicketButton: {
    padding: 8,
  },
  contactCard: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    margin: 20,
    padding: 15,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  contactItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  contactDivider: {
    width: 1,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 15,
  },
  contactText: {
    fontSize: 14,
    color: "#333",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: "#183B5C",
  },
  tabText: {
    fontSize: 14,
    color: "#666",
  },
  tabTextActive: {
    color: "#FFF",
    fontWeight: "500",
  },
  faqContainer: {
    paddingHorizontal: 20,
  },
  faqItem: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    marginBottom: 10,
    padding: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  faqQuestion: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  faqQuestionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    marginRight: 10,
  },
  faqAnswer: {
    fontSize: 14,
    color: "#666",
    marginTop: 12,
    lineHeight: 20,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 12,
  },
  ticketsContainer: {
    paddingHorizontal: 20,
  },
  ticketCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  ticketHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  ticketLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  ticketIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  ticketNumber: {
    fontSize: 12,
    color: "#999",
    marginBottom: 2,
  },
  ticketSubject: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    maxWidth: "80%",
  },
  ticketStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  ticketStatusText: {
    fontSize: 10,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  ticketFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  ticketDate: {
    fontSize: 11,
    color: "#999",
  },
  emptyState: {
    alignItems: "center",
    padding: 40,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginTop: 20,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#666",
    marginTop: 8,
    textAlign: "center",
  },
  helpCenterLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    gap: 8,
  },
  helpCenterText: {
    fontSize: 14,
    color: "#183B5C",
    fontWeight: "500",
  },
  versionText: {
    textAlign: "center",
    fontSize: 11,
    color: "#999",
    marginBottom: 20,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#183B5C",
  },
  modalLabel: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
    marginTop: 15,
  },
  categorySelector: {
    flexDirection: "row",
    gap: 10,
  },
  categoryOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
    padding: 12,
    borderRadius: 12,
    gap: 6,
  },
  categoryOptionSelected: {
    backgroundColor: "#183B5C",
  },
  categoryText: {
    fontSize: 12,
    color: "#666",
  },
  categoryTextSelected: {
    color: "#FFF",
  },
  modalInput: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 15,
    fontSize: 14,
    color: "#333",
  },
  modalTextArea: {
    minHeight: 120,
    textAlignVertical: "top",
  },
  bookingInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F7FF",
    padding: 12,
    borderRadius: 12,
    marginTop: 15,
  },
  bookingInfoText: {
    marginLeft: 10,
    fontSize: 12,
    color: "#183B5C",
    flex: 1,
  },
  submitButton: {
    backgroundColor: "#183B5C",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 20,
    marginBottom: 20,
  },
  submitButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  submitButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
});