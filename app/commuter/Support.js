// screens/commuter/Support.js
import React, { useState, useEffect, useRef } from "react";
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
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, useFocusEffect } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getUserSession } from "../utils/authStorage";

export default function SupportScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const { bookingId } = route.params || {};

  const [loading, setLoading] = useState(false);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [userId, setUserId] = useState(null);
  const [isTestAccount, setIsTestAccount] = useState(false);
  const [commuter, setCommuter] = useState(null);
  const [showTicketModal, setShowTicketModal] = useState(false);

  const [ticketData, setTicketData] = useState({
    category: "booking_issue",
    subject: "",
    description: "",
    bookingId: bookingId || null,
  });

  const [tickets, setTickets] = useState([]);
  const [activeTab, setActiveTab] = useState("faq");

  const subjectInputRef = useRef(null);
  const descriptionInputRef = useRef(null);

  const CATEGORIES = [
    { value: "booking_issue", label: "Booking", icon: "car" },
    { value: "payment_problem", label: "Payment", icon: "cash" },
    { value: "driver_issue", label: "Driver", icon: "person" },
    { value: "app_technical", label: "App", icon: "phone-portrait" },
    { value: "account_concern", label: "Account", icon: "person-circle" },
    { value: "referral_question", label: "Referral", icon: "people" },
    { value: "mission_bonus", label: "Mission", icon: "trophy" },
    { value: "verification", label: "Verification", icon: "shield-checkmark" },
    { value: "other", label: "Other", icon: "help" },
  ];

  const [faqs] = useState([
    {
      id: 1,
      question: "How do I book a ride?",
      answer:
        "Open the app, select your pickup and dropoff locations, choose number of passengers, and tap 'Book a Ride'. The system will automatically find a nearby driver for you.",
      open: false,
    },
    {
      id: 2,
      question: "How is the fare calculated?",
      answer:
        "Fare is calculated based on distance: ₱15 for the first kilometer, and ₱15 for each additional kilometer. The total fare is multiplied by the number of passengers.",
      open: false,
    },
    {
      id: 3,
      question: "How do I pay?",
      answer:
        "You can pay via cash, GCash, or using your wallet balance. You can set your preferred payment method in the Payment Methods section.",
      open: false,
    },
    {
      id: 4,
      question: "How do I cancel a booking?",
      answer:
        "Go to your active trip and tap 'Cancel'. Please note that cancellations after driver acceptance may incur a fee.",
      open: false,
    },
    {
      id: 5,
      question: "How do I earn points?",
      answer:
        "You earn 10 points per ride, 100 points per referral, double points on weekends, and bonus points on your birthday.",
      open: false,
    },
    {
      id: 6,
      question: "How do I contact my driver?",
      answer:
        "Once a driver accepts your booking, you can call or message them through the app using the buttons in the trip screen.",
      open: false,
    },
  ]);

  const [faqList, setFaqList] = useState(faqs);

  useEffect(() => {
    loadUserData();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      if (userId && activeTab === "tickets" && !isTestAccount) {
        loadTickets(userId);
      }
    }, [userId, activeTab, isTestAccount])
  );

  const loadUserData = async () => {
    try {
      const session = await getUserSession();

      if (session && session.isTestAccount) {
        console.log("Test account detected in SupportScreen");
        setIsTestAccount(true);
        setUserId(null);
        return;
      }

      const id = await AsyncStorage.getItem("user_id");

      if (!id) {
        console.log("No user ID found.");
        return;
      }

      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      if (!uuidRegex.test(id)) {
        Alert.alert(
          "Invalid Account",
          "Your account session is invalid. Please log out and log in again.",
          [{ text: "OK", onPress: () => navigation.replace("UserType") }]
        );
        return;
      }

      setUserId(id);

      const { data: userExists, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("id", id)
        .single();

      if (userError || !userExists) {
        Alert.alert("Error", "Account not found. Please log in again.");
        return;
      }

      const { data, error } = await supabase
        .from("commuters")
        .select("first_name, last_name, email, phone")
        .eq("id", id)
        .single();

      if (error) console.log("Error fetching commuter:", error);

      if (data) setCommuter(data);
    } catch (err) {
      console.log("Error loading user data:", err);
    }
  };

  const loadTickets = async (uid) => {
    if (!uid || isTestAccount) return;

    setTicketsLoading(true);

    try {
      const { data, error } = await supabase
        .from("support_tickets")
        .select(
          "id, ticket_number, category, subject, status, priority, created_at, updated_at"
        )
        .eq("user_id", uid)
        .eq("user_type", "commuter")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setTickets(data || []);
    } catch (err) {
      console.log("Error loading tickets:", err);
      Alert.alert("Error", "Failed to load your tickets. Please try again.");
    } finally {
      setTicketsLoading(false);
    }
  };

  const toggleFaq = (id) => {
    setFaqList((prev) =>
      prev.map((faq) => (faq.id === id ? { ...faq, open: !faq.open } : faq))
    );
  };

  // ✅ FIXED CREATE TICKET FUNCTION
const handleCreateTicket = async () => {
  if (!ticketData.subject.trim() || !ticketData.description.trim()) {
    Alert.alert("Missing Fields", "Please fill in both Subject and Description.");
    return;
  }

  if (!userId) {
    Alert.alert("Error", "User session not found. Please log in again.");
    return;
  }

  setLoading(true);

  try {
    const ticketNumber = `TKT-${Date.now()}`;

    const { data, error } = await supabase
      .from("support_tickets")
      .insert([
        {
          user_id: userId,
          user_type: "commuter",
          ticket_number: ticketNumber,
          category: ticketData.category,
          subject: ticketData.subject.trim(),
          description: ticketData.description.trim(),

          // ✅ FIXED COLUMN NAME HERE
          related_booking_id: ticketData.bookingId || null,

          status: "open",
          priority: "medium",
        },
      ])
      .select()
      .single();

    if (error) {
      console.log("Create ticket error:", error);
      Alert.alert("Error", error.message);
      return;
    }

    Alert.alert(
      "Ticket Created",
      `Your support ticket has been created.\n\nTicket #: ${data.ticket_number}`,
      [
        {
          text: "OK",
          onPress: () => {
            setShowTicketModal(false);
            setTicketData({
              category: "booking_issue",
              subject: "",
              description: "",
              bookingId: bookingId || null,
            });

            loadTickets(userId);
            setActiveTab("tickets");
          },
        },
      ]
    );
  } catch (err) {
    console.log("Error creating ticket:", err);
    Alert.alert("Error", "Failed to create support ticket.");
  } finally {
    setLoading(false);
  }
};

  const getCategoryIcon = (category) => {
    const found = CATEGORIES.find((c) => c.value === category);
    return found ? found.icon : "help";
  };

  const getCategoryLabel = (category) => {
    const found = CATEGORIES.find((c) => c.value === category);
    return found ? found.label : category;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "open":
        return { bg: "#FEF3C7", text: "#F59E0B" };
      case "in_progress":
        return { bg: "#E3F2FD", text: "#3B82F6" };
      case "waiting_on_user":
        return { bg: "#FFF3E0", text: "#FF9800" };
      case "resolved":
        return { bg: "#D1FAE5", text: "#10B981" };
      case "closed":
        return { bg: "#F3F4F6", text: "#6B7280" };
      default:
        return { bg: "#F3F4F6", text: "#6B7280" };
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case "waiting_on_user":
        return "Waiting on You";
      case "in_progress":
        return "In Progress";
      case "resolved":
        return "Resolved";
      case "closed":
        return "Closed";
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleViewTicket = (ticketId) => {
    try {
      navigation.navigate("TicketDetails", { id: ticketId });
    } catch (error) {
      Alert.alert("Info", "Ticket details view will be available soon.");
    }
  };

  // Render for test accounts
  if (isTestAccount) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#183B5C" />
          </Pressable>
          <Text style={styles.headerTitle}>Help & Support</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.testAccountContainer}>
          <Ionicons name="information-circle" size={64} color="#FFA500" />
          <Text style={styles.testAccountTitle}>Test Account Mode</Text>
          <Text style={styles.testAccountMessage}>
            Support tickets are only available for registered accounts. Please sign up
            or log in with a real account to access support features.
          </Text>
          <Pressable
            style={styles.backToAccountButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backToAccountButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ✅ MODAL CONTENT (NO useCallback BUG)
  const renderModalContent = () => (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.modalContainer}
      keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Create Support Ticket</Text>
            <Pressable onPress={() => setShowTicketModal(false)}>
              <Ionicons name="close" size={24} color="#666" />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalLabel}>Category</Text>

            <View style={styles.categoryRow}>
              {CATEGORIES.slice(0, 3).map((cat) => (
                <Pressable
                  key={cat.value}
                  style={[
                    styles.categoryOption,
                    ticketData.category === cat.value && styles.categoryOptionSelected,
                  ]}
                  onPress={() => setTicketData((prev) => ({ ...prev, category: cat.value }))}
                >
                  <Ionicons
                    name={cat.icon}
                    size={18}
                    color={ticketData.category === cat.value ? "#FFF" : "#666"}
                  />
                  <Text
                    style={[
                      styles.categoryText,
                      ticketData.category === cat.value && styles.categoryTextSelected,
                    ]}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={[styles.categoryRow, { marginTop: 8 }]}>
              {CATEGORIES.slice(3, 6).map((cat) => (
                <Pressable
                  key={cat.value}
                  style={[
                    styles.categoryOption,
                    ticketData.category === cat.value && styles.categoryOptionSelected,
                  ]}
                  onPress={() => setTicketData((prev) => ({ ...prev, category: cat.value }))}
                >
                  <Ionicons
                    name={cat.icon}
                    size={18}
                    color={ticketData.category === cat.value ? "#FFF" : "#666"}
                  />
                  <Text
                    style={[
                      styles.categoryText,
                      ticketData.category === cat.value && styles.categoryTextSelected,
                    ]}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={[styles.categoryRow, { marginTop: 8 }]}>
              {CATEGORIES.slice(6).map((cat) => (
                <Pressable
                  key={cat.value}
                  style={[
                    styles.categoryOption,
                    ticketData.category === cat.value && styles.categoryOptionSelected,
                  ]}
                  onPress={() => setTicketData((prev) => ({ ...prev, category: cat.value }))}
                >
                  <Ionicons
                    name={cat.icon}
                    size={18}
                    color={ticketData.category === cat.value ? "#FFF" : "#666"}
                  />
                  <Text
                    style={[
                      styles.categoryText,
                      ticketData.category === cat.value && styles.categoryTextSelected,
                    ]}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.modalLabel}>Subject</Text>
            <TextInput
              ref={subjectInputRef}
              style={styles.modalInput}
              placeholder="Brief summary of your issue"
              placeholderTextColor="#999"
              value={ticketData.subject}
              onChangeText={(text) => setTicketData((prev) => ({ ...prev, subject: text }))}
              maxLength={200}
              returnKeyType="next"
              onSubmitEditing={() => descriptionInputRef.current?.focus()}
              blurOnSubmit={false}
            />

            <Text style={styles.modalLabel}>Description</Text>
            <TextInput
              ref={descriptionInputRef}
              style={[styles.modalInput, styles.modalTextArea]}
              placeholder="Please provide details about your issue..."
              placeholderTextColor="#999"
              value={ticketData.description}
              onChangeText={(text) =>
                setTicketData((prev) => ({ ...prev, description: text }))
              }
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />

            {(bookingId || ticketData.bookingId) && (
              <View style={styles.bookingInfo}>
                <Ionicons name="information-circle" size={20} color="#183B5C" />
                <Text style={styles.bookingInfoText}>
                  This ticket will be linked to Booking #{bookingId || ticketData.bookingId}
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
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#183B5C" />
        </Pressable>

        <Text style={styles.headerTitle}>Help & Support</Text>

        <Pressable style={styles.newTicketButton} onPress={() => setShowTicketModal(true)}>
          <Ionicons name="add" size={24} color="#183B5C" />
        </Pressable>
      </View>

      <View style={styles.contactCard}>
        <View style={styles.contactItem}>
          <Ionicons name="call" size={20} color="#183B5C" />
          <Text style={styles.contactText}>+63 9318152351</Text>
        </View>
        <View style={styles.contactDivider} />
        <View style={styles.contactItem}>
          <Ionicons name="mail" size={20} color="#183B5C" />
          <Text style={styles.contactText}>sakayna2026@gmail.com</Text>
        </View>
      </View>

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
          <View style={styles.faqContainer}>
            {faqList.map((faq) => (
              <View key={faq.id} style={styles.faqItem}>
                <Pressable style={styles.faqQuestion} onPress={() => toggleFaq(faq.id)}>
                  <Text style={styles.faqQuestionText}>{faq.question}</Text>
                  <Ionicons
                    name={faq.open ? "chevron-up" : "chevron-down"}
                    size={20}
                    color="#666"
                  />
                </Pressable>
                {faq.open && <Text style={styles.faqAnswer}>{faq.answer}</Text>}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.ticketsContainer}>
            {ticketsLoading ? (
              <ActivityIndicator size="large" color="#183B5C" style={{ marginTop: 40 }} />
            ) : tickets.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="ticket-outline" size={64} color="#D1D5DB" />
                <Text style={styles.emptyStateTitle}>No Support Tickets</Text>
                <Text style={styles.emptyStateText}>
                  Tap the + button to create a support ticket
                </Text>
              </View>
            ) : (
              tickets.map((ticket) => {
                const statusStyle = getStatusColor(ticket.status);

                return (
                  <Pressable
                    key={ticket.id}
                    style={styles.ticketCard}
                    onPress={() => handleViewTicket(ticket.id)}
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

                        <View style={{ flex: 1 }}>
                          <Text style={styles.ticketNumber}>{ticket.ticket_number}</Text>
                          <Text style={styles.ticketSubject} numberOfLines={1}>
                            {ticket.subject}
                          </Text>
                          <Text style={styles.ticketCategory}>
                            {getCategoryLabel(ticket.category)}
                          </Text>
                        </View>
                      </View>

                      <View style={[styles.ticketStatus, { backgroundColor: statusStyle.bg }]}>
                        <Text style={[styles.ticketStatusText, { color: statusStyle.text }]}>
                          {getStatusLabel(ticket.status)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.ticketFooter}>
                      <Text style={styles.ticketDate}>{formatDate(ticket.created_at)}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#999" />
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
        )}

        <Pressable
          style={styles.helpCenterLink}
          onPress={() => {
            try {
              navigation.navigate("HelpCenter");
            } catch (error) {
              Alert.alert("Info", "Help Center will be available soon.");
            }
          }}
        >
          <Text style={styles.helpCenterText}>Visit Help Center</Text>
          <Ionicons name="arrow-forward" size={16} color="#183B5C" />
        </Pressable>

        <Text style={styles.versionText}>Version 1.0.0</Text>
      </ScrollView>

      <Modal
        visible={showTicketModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowTicketModal(false)}
      >
        {renderModalContent()}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FA" },

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

  backButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: "600", color: "#183B5C" },
  newTicketButton: { padding: 8 },

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

  contactText: { fontSize: 13, color: "#333" },

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

  tabActive: { backgroundColor: "#183B5C" },
  tabText: { fontSize: 14, color: "#666" },
  tabTextActive: { color: "#FFF", fontWeight: "500" },

  faqContainer: { paddingHorizontal: 20 },

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

  ticketsContainer: { paddingHorizontal: 20 },

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
    alignItems: "flex-start",
    marginBottom: 12,
  },

  ticketLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
    marginRight: 8,
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

  ticketNumber: { fontSize: 11, color: "#999", marginBottom: 2 },
  ticketSubject: { fontSize: 14, fontWeight: "500", color: "#333" },
  ticketCategory: { fontSize: 11, color: "#999", marginTop: 2 },

  ticketStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
  },

  ticketStatusText: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "capitalize",
  },

  ticketFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  ticketDate: { fontSize: 11, color: "#999" },

  emptyState: { alignItems: "center", padding: 40 },
  emptyStateTitle: { fontSize: 18, fontWeight: "600", color: "#333", marginTop: 20 },
  emptyStateText: { fontSize: 14, color: "#666", marginTop: 8, textAlign: "center" },

  helpCenterLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    gap: 8,
  },

  helpCenterText: { fontSize: 14, color: "#183B5C", fontWeight: "500" },
  versionText: { textAlign: "center", fontSize: 11, color: "#999", marginBottom: 20 },

  modalContainer: { flex: 1, justifyContent: "flex-end" },

  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
    maxHeight: "90%",
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },

  modalTitle: { fontSize: 20, fontWeight: "bold", color: "#183B5C" },
  modalLabel: { fontSize: 14, color: "#666", marginBottom: 8, marginTop: 16 },

  categoryRow: { flexDirection: "row", gap: 8 },

  categoryOption: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    gap: 4,
  },

  categoryOptionSelected: { backgroundColor: "#183B5C" },
  categoryText: { fontSize: 11, color: "#666", textAlign: "center" },
  categoryTextSelected: { color: "#FFF" },

  modalInput: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 15,
    fontSize: 14,
    color: "#333",
  },

  modalTextArea: { minHeight: 120, textAlignVertical: "top" },

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

  submitButtonDisabled: { backgroundColor: "#9CA3AF" },

  submitButtonText: { color: "#FFF", fontSize: 16, fontWeight: "600" },

  testAccountContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    backgroundColor: "#FFF8F0",
  },

  testAccountTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#FFA500",
    marginTop: 20,
    marginBottom: 10,
  },

  testAccountMessage: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 30,
  },

  backToAccountButton: {
    backgroundColor: "#183B5C",
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
  },

  backToAccountButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
});