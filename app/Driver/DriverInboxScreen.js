import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  ScrollView,
  TouchableWithoutFeedback,
  Animated,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from 'expo-haptics';
import { LinearGradient } from "expo-linear-gradient";

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function DriverInboxScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [driverId, setDriverId] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [subscription, setSubscription] = useState(null);
  const [updateSubscription, setUpdateSubscription] = useState(null);
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const [modalAnimation] = useState(new Animated.Value(SCREEN_HEIGHT));
  
  const modalAnimationRef = useRef(null);
  const selectedNotificationRef = useRef(null);

  // Load driver data on focus
  useFocusEffect(
    useCallback(() => {
      loadDriverData();
    }, [])
  );

  // Set up real-time subscription when driverId is available
  useEffect(() => {
    if (driverId) {
      setupRealtimeSubscription();
    }

    return () => {
      if (subscription) {
        supabase.removeChannel(subscription);
      }
      if (updateSubscription) {
        supabase.removeChannel(updateSubscription);
      }
    };
  }, [driverId]);

  const setupRealtimeSubscription = async () => {
    try {
      console.log("📡 Setting up real-time subscription for driver:", driverId);
      
      if (subscription) {
        await supabase.removeChannel(subscription);
      }
      if (updateSubscription) {
        await supabase.removeChannel(updateSubscription);
      }

      // Subscribe to new notifications (INSERT)
      const newChannel = supabase
        .channel('driver-notifications-new')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${driverId}`
          },
          (payload) => {
            console.log("🔔 New notification received:", payload.new);
            setNotifications(prev => [payload.new, ...prev]);
            setUnreadCount(prev => prev + 1);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        )
        .subscribe();

      // Subscribe to updates
      const updateChannel = supabase
        .channel('driver-notifications-update')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${driverId}`
          },
          (payload) => {
            console.log("📝 Notification updated:", payload.new);
            
            if (selectedNotificationRef.current?.id === payload.new.id && showNotificationModal) {
              setSelectedNotification(prev => prev ? { ...prev, ...payload.new } : null);
              return;
            }
            
            setNotifications(prev => 
              prev.map(n => n.id === payload.new.id ? { ...n, ...payload.new } : n)
            );
            
            const newUnreadCount = notifications.filter(n => !n.is_read).length;
            setUnreadCount(newUnreadCount);
          }
        )
        .subscribe();

      setSubscription(newChannel);
      setUpdateSubscription(updateChannel);
      
      console.log("✅ Real-time subscription established");
    } catch (err) {
      console.log("Error setting up real-time subscription:", err);
    }
  };

  const loadDriverData = async () => {
    try {
      const id = await AsyncStorage.getItem("user_id");
      setDriverId(id);
      
      if (id) {
        await fetchNotifications(id);
      }
    } catch (err) {
      console.log("Error loading driver data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchNotifications = async (id) => {
    try {
      console.log("🔍 Fetching notifications for driver:", id);
      
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", id)
        .eq("user_type", "driver")
        .order("created_at", { ascending: false });

      if (error) throw error;

      console.log("📊 Notifications fetched:", data?.length || 0);
      setNotifications(data || []);
      
      const unread = data?.filter(n => !n.is_read).length || 0;
      setUnreadCount(unread);
    } catch (err) {
      console.log("Error fetching notifications:", err);
    }
  };

  const markAsRead = async (notificationId) => {
    if (isMarkingRead) return;
    
    try {
      setIsMarkingRead(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      const { error } = await supabase
        .from("notifications")
        .update({ 
          is_read: true,
          read_at: new Date().toISOString()
        })
        .eq("id", notificationId);

      if (error) throw error;

      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.log("Error marking as read:", err);
    } finally {
      setIsMarkingRead(false);
    }
  };

  const markAllAsRead = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
      
      if (unreadIds.length === 0) {
        Alert.alert("All Caught Up", "You have no unread notifications.");
        return;
      }

      const { error } = await supabase
        .from("notifications")
        .update({ 
          is_read: true,
          read_at: new Date().toISOString()
        })
        .in("id", unreadIds);

      if (error) throw error;

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "All notifications marked as read.");
    } catch (err) {
      console.log("Error marking all as read:", err);
    }
  };

  const handleNotificationPress = (notification) => {
    selectedNotificationRef.current = notification;
    setSelectedNotification(notification);
    showModalWithAnimation();
    
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
  };

  const showModalWithAnimation = () => {
    setShowNotificationModal(true);
    Animated.spring(modalAnimation, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  const closeModal = () => {
    Animated.timing(modalAnimation, {
      toValue: SCREEN_HEIGHT,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setShowNotificationModal(false);
      setSelectedNotification(null);
      selectedNotificationRef.current = null;
    });
  };

  const handleNotificationAction = (notification) => {
    console.log("🎯 Handling notification action:", notification);
    
    closeModal();
    
    setTimeout(() => {
      if (notification.data?.action === "view_trip" && notification.data?.trip_id) {
        navigation.navigate("TripDetailsScreen", { tripId: notification.data.trip_id });
        return;
      }
      
      if (notification.data?.action === "view_subscription") {
        navigation.navigate("SubscriptionScreen");
        return;
      }
      
      if (notification.data?.action === "view_payment") {
        navigation.navigate("Wallet");
        return;
      }
      
      if (notification.data?.action === "view_mission") {
        navigation.navigate("MissionsScreen");
        return;
      }
      
      Alert.alert("Info", "No action available for this notification");
    }, 100);
  };

  const deleteNotification = async (notificationId) => {
    Alert.alert(
      "Delete Notification",
      "Are you sure you want to delete this notification?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              
              const { error } = await supabase
                .from("notifications")
                .delete()
                .eq("id", notificationId);

              if (error) throw error;

              const deletedNotification = notifications.find(n => n.id === notificationId);
              setNotifications(prev => prev.filter(n => n.id !== notificationId));
              
              if (deletedNotification && !deletedNotification.is_read) {
                setUnreadCount(prev => Math.max(0, prev - 1));
              }
              
              if (selectedNotification?.id === notificationId) {
                closeModal();
              }
              
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (err) {
              console.log("Error deleting notification:", err);
              Alert.alert("Error", "Failed to delete notification.");
            }
          }
        }
      ]
    );
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case "booking":
        return { name: "bicycle", color: "#3B82F6", bg: "#EFF6FF" };
      case "payment":
        return { name: "cash", color: "#10B981", bg: "#E8F5E9" };
      case "referral":
        return { name: "people", color: "#8B5CF6", bg: "#F3E8FF" };
      case "mission":
        return { name: "trophy", color: "#F59E0B", bg: "#FEF3C7" };
      case "system":
        return { name: "information-circle", color: "#6B7280", bg: "#F3F4F6" };
      case "promo":
        return { name: "gift", color: "#EC4899", bg: "#FCE7F3" };
      case "support":
        return { name: "chatbubble", color: "#EF4444", bg: "#FEE2E2" };
      default:
        return { name: "notifications", color: "#6B7280", bg: "#F3F4F6" };
    }
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const filteredNotifications = notifications.filter(notification => {
    if (filterType === 'all') return true;
    if (filterType === 'unread') return !notification.is_read;
    return notification.type === filterType;
  });

  const renderNotificationItem = ({ item }) => {
    const icon = getNotificationIcon(item.type);
    
    return (
      <Pressable
        style={[styles.notificationItem, !item.is_read && styles.unreadItem]}
        onPress={() => handleNotificationPress(item)}
      >
        <View style={[styles.notificationIcon, { backgroundColor: icon.bg }]}>
          <Ionicons name={icon.name} size={24} color={icon.color} />
        </View>
        
        <View style={styles.notificationContent}>
          <View style={styles.notificationHeader}>
            <Text style={styles.notificationTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.notificationTime}>{formatTime(item.created_at)}</Text>
          </View>
          
          <Text style={styles.notificationMessage} numberOfLines={2}>
            {item.message}
          </Text>
          
          {!item.is_read && (
            <View style={styles.unreadDot} />
          )}
        </View>
      </Pressable>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIcon}>
        <Ionicons name="notifications-off-outline" size={64} color="#D1D5DB" />
      </View>
      <Text style={styles.emptyTitle}>No Notifications</Text>
      <Text style={styles.emptyText}>
        You're all caught up! Check back later for updates.
      </Text>
    </View>
  );

  const NotificationModal = () => (
    <Modal
      visible={showNotificationModal}
      transparent={true}
      animationType="none"
      onRequestClose={closeModal}
      statusBarTranslucent={true}
    >
      <TouchableWithoutFeedback onPress={closeModal}>
        <View style={styles.modalOverlay}>
          <Animated.View 
            style={[
              styles.modalContent,
              {
                transform: [{ translateY: modalAnimation }]
              }
            ]}
          >
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View>
                {selectedNotification && (
                  <>
                    <View style={styles.modalHeader}>
                      <Pressable 
                        style={styles.modalCloseButton}
                        onPress={closeModal}
                      >
                        <Ionicons name="close" size={24} color="#666" />
                      </Pressable>
                      <Text style={styles.modalTitle}>Notification</Text>
                      <Pressable 
                        style={styles.modalDeleteButton}
                        onPress={() => deleteNotification(selectedNotification.id)}
                      >
                        <Ionicons name="trash-outline" size={20} color="#EF4444" />
                      </Pressable>
                    </View>

                    <ScrollView 
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={styles.modalScrollContent}
                    >
                      <View style={styles.notificationDetail}>
                        <View style={[
                          styles.detailIcon,
                          { backgroundColor: getNotificationIcon(selectedNotification.type).bg }
                        ]}>
                          <Ionicons 
                            name={getNotificationIcon(selectedNotification.type).name} 
                            size={32} 
                            color={getNotificationIcon(selectedNotification.type).color} 
                          />
                        </View>

                        <Text style={styles.detailTitle}>{selectedNotification.title}</Text>
                        <Text style={styles.detailTime}>
                          {new Date(selectedNotification.created_at).toLocaleString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </Text>

                        <View style={styles.detailMessageContainer}>
                          <Text style={styles.detailMessage}>{selectedNotification.message}</Text>
                        </View>

                        {selectedNotification.data && Object.keys(selectedNotification.data).length > 0 && (
                          <View style={styles.detailData}>
                            {Object.entries(selectedNotification.data).map(([key, value]) => {
                              if (key === "action") return null;
                              return (
                                <View key={key} style={styles.detailDataRow}>
                                  <Text style={styles.detailDataKey}>{key.replace(/_/g, ' ').toUpperCase()}:</Text>
                                  <Text style={styles.detailDataValue}>{String(value)}</Text>
                                </View>
                              );
                            })}
                          </View>
                        )}

                        {selectedNotification.data?.action && (
                          <Pressable
                            style={styles.detailActionButton}
                            onPress={() => handleNotificationAction(selectedNotification)}
                          >
                            <Text style={styles.detailActionText}>
                              {selectedNotification.data.action === "view_trip" ? "View Trip Details" :
                               selectedNotification.data.action === "view_subscription" ? "View Subscription" :
                               selectedNotification.data.action === "view_payment" ? "View Payment" :
                               "Take Action"}
                            </Text>
                            <Ionicons name="arrow-forward" size={20} color="#FFF" />
                          </Pressable>
                        )}
                      </View>
                    </ScrollView>
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </Animated.View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#183B5C" />
        <Text style={styles.loadingText}>Loading inbox...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={["#183B5C", "#0F2A40"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 15 }]}
      >
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </Pressable>
        
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Inbox</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount} unread</Text>
            </View>
          )}
        </View>
        
        {unreadCount > 0 && (
          <Pressable style={styles.markAllButton} onPress={markAllAsRead}>
            <Ionicons name="checkmark-done" size={22} color="#FFB37A" />
          </Pressable>
        )}
      </LinearGradient>

      {/* Filter Tabs */}
      <View style={styles.filterTabs}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Pressable
            style={[styles.filterTab, filterType === 'all' && styles.filterTabActive]}
            onPress={() => setFilterType('all')}
          >
            <Text style={[styles.filterText, filterType === 'all' && styles.filterTextActive]}>
              All {notifications.length > 0 && `(${notifications.length})`}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.filterTab, filterType === 'unread' && styles.filterTabActive]}
            onPress={() => setFilterType('unread')}
          >
            <Text style={[styles.filterText, filterType === 'unread' && styles.filterTextActive]}>
              Unread {unreadCount > 0 && `(${unreadCount})`}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.filterTab, filterType === 'booking' && styles.filterTabActive]}
            onPress={() => setFilterType('booking')}
          >
            <Text style={[styles.filterText, filterType === 'booking' && styles.filterTextActive]}>Bookings</Text>
          </Pressable>
          <Pressable
            style={[styles.filterTab, filterType === 'payment' && styles.filterTabActive]}
            onPress={() => setFilterType('payment')}
          >
            <Text style={[styles.filterText, filterType === 'payment' && styles.filterTextActive]}>Payments</Text>
          </Pressable>
          <Pressable
            style={[styles.filterTab, filterType === 'mission' && styles.filterTabActive]}
            onPress={() => setFilterType('mission')}
          >
            <Text style={[styles.filterText, filterType === 'mission' && styles.filterTextActive]}>Missions</Text>
          </Pressable>
          <Pressable
            style={[styles.filterTab, filterType === 'system' && styles.filterTabActive]}
            onPress={() => setFilterType('system')}
          >
            <Text style={[styles.filterText, filterType === 'system' && styles.filterTextActive]}>System</Text>
          </Pressable>
        </ScrollView>
      </View>

      {/* Notifications List */}
      <FlatList
        data={filteredNotifications}
        renderItem={renderNotificationItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={loadDriverData} tintColor="#183B5C" />
        }
        ListEmptyComponent={renderEmptyState}
      />

      {/* Notification Modal */}
      <NotificationModal />
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
    backgroundColor: "#F5F7FA",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#666",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backButton: {
    padding: 8,
  },
  headerCenter: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFF",
  },
  unreadBadge: {
    backgroundColor: "#FF3B30",
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 12,
    marginTop: 4,
  },
  unreadBadgeText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
  },
  markAllButton: {
    padding: 8,
  },
  filterTabs: {
    backgroundColor: "#FFF",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
  },
  filterTabActive: {
    backgroundColor: "#183B5C",
  },
  filterText: {
    fontSize: 13,
    color: "#666",
    fontWeight: "500",
  },
  filterTextActive: {
    color: "#FFF",
  },
  listContent: {
    padding: 15,
    flexGrow: 1,
  },
  notificationItem: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 15,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  unreadItem: {
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  notificationIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
    position: 'relative',
  },
  notificationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
    flex: 1,
    marginRight: 8,
  },
  notificationTime: {
    fontSize: 11,
    color: "#999",
  },
  notificationMessage: {
    fontSize: 13,
    color: "#666",
    lineHeight: 18,
  },
  unreadDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#3B82F6",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
    minHeight: 400,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
  },
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
  modalScrollContent: {
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  modalDeleteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FEE2E2",
    justifyContent: "center",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  notificationDetail: {
    alignItems: "center",
    paddingBottom: 20,
  },
  detailIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 6,
    textAlign: "center",
  },
  detailTime: {
    fontSize: 13,
    color: "#666",
    marginBottom: 20,
  },
  detailMessageContainer: {
    backgroundColor: "#F9FAFB",
    padding: 20,
    borderRadius: 16,
    width: "100%",
    marginBottom: 20,
  },
  detailMessage: {
    fontSize: 15,
    color: "#333",
    lineHeight: 22,
    textAlign: "center",
  },
  detailData: {
    width: "100%",
    backgroundColor: "#F3F4F6",
    padding: 15,
    borderRadius: 12,
    marginBottom: 20,
  },
  detailDataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  detailDataKey: {
    fontSize: 13,
    color: "#666",
    fontWeight: "500",
  },
  detailDataValue: {
    fontSize: 13,
    color: "#333",
  },
  detailActionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#183B5C",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    width: "100%",
    gap: 8,
  },
  detailActionText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
});