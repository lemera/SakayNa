// screens/commuter/InboxScreen.js
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
  TextInput,
  ScrollView,
  AppState,
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

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function InboxScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState(null);
  const [userType, setUserType] = useState('commuter');
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

  // Load user data on focus
  useFocusEffect(
    useCallback(() => {
      loadUserData();
    }, [])
  );

  // Set up real-time subscription when userId is available
  useEffect(() => {
    if (userId) {
      setupRealtimeSubscription();
    }

    // Cleanup subscriptions on unmount
    return () => {
      if (subscription) {
        supabase.removeChannel(subscription);
      }
      if (updateSubscription) {
        supabase.removeChannel(updateSubscription);
      }
    };
  }, [userId]);

  const setupRealtimeSubscription = async () => {
    try {
      console.log("📡 Setting up real-time subscription for user:", userId);
      
      // Remove existing subscriptions if any
      if (subscription) {
        await supabase.removeChannel(subscription);
      }
      if (updateSubscription) {
        await supabase.removeChannel(updateSubscription);
      }

      // Subscribe to new notifications (INSERT)
      const newChannel = supabase
        .channel('notifications-new-channel')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`
          },
          (payload) => {
            console.log("🔔 New notification received:", payload.new);
            
            // Add the new notification to the list
            setNotifications(prev => [payload.new, ...prev]);
            
            // Update unread count
            setUnreadCount(prev => prev + 1);
            
            // Haptic feedback for withdrawal success
            if (payload.new.type === 'payment' && 
                payload.new.title.toLowerCase().includes('withdrawal')) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          }
        )
        .subscribe();

      // Subscribe to updates (when notifications are marked as read)
      const updateChannel = supabase
        .channel('notifications-update-channel')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`
          },
          (payload) => {
            console.log("📝 Notification updated:", payload.new);
            
            // Don't update the list if this notification is currently being viewed in modal
            if (selectedNotificationRef.current?.id === payload.new.id && showNotificationModal) {
              // Just update the selected notification without closing modal
              setSelectedNotification(prev => prev ? { ...prev, ...payload.new } : null);
              return;
            }
            
            // Update the notification in the list
            setNotifications(prev => 
              prev.map(n => 
                n.id === payload.new.id ? { ...n, ...payload.new } : n
              )
            );
            
            // Recalculate unread count
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

  const loadUserData = async () => {
    try {
      const id = await AsyncStorage.getItem("user_id");
      const type = await AsyncStorage.getItem("user_type") || 'commuter';
      setUserId(id);
      setUserType(type);
      
      if (id) {
        await fetchNotifications(id);
      }
    } catch (err) {
      console.log("Error loading user data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchNotifications = async (id) => {
    try {
      console.log("🔍 Fetching notifications for user:", id);
      
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", id)
        .eq("user_type", userType)
        .order("created_at", { ascending: false });

      if (error) throw error;

      console.log("📊 Notifications fetched:", data?.length || 0);
      setNotifications(data || []);
      
      // Count unread
      const unread = data?.filter(n => !n.is_read).length || 0;
      setUnreadCount(unread);
      console.log("📊 Unread count:", unread);
    } catch (err) {
      console.log("Error fetching notifications:", err);
    }
  };

  const markAsRead = async (notificationId) => {
    // Prevent multiple mark as read calls
    if (isMarkingRead) return;
    
    try {
      setIsMarkingRead(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      console.log("📱 Marking notification as read:", notificationId);
      
      const { error } = await supabase
        .from("notifications")
        .update({ 
          is_read: true,
          read_at: new Date().toISOString()
        })
        .eq("id", notificationId);

      if (error) throw error;

      // Update local state
      setNotifications(prev => 
        prev.map(n => 
          n.id === notificationId ? { ...n, is_read: true } : n
        )
      );
      
      // Update unread count
      setUnreadCount(prev => Math.max(0, prev - 1));
      
      console.log("✅ Notification marked as read");
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

      console.log("📱 Marking all as read:", unreadIds.length);
      
      const { error } = await supabase
        .from("notifications")
        .update({ 
          is_read: true,
          read_at: new Date().toISOString()
        })
        .in("id", unreadIds);

      if (error) throw error;

      // Update local state
      setNotifications(prev => 
        prev.map(n => ({ ...n, is_read: true }))
      );
      
      setUnreadCount(0);
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "All notifications marked as read.");
    } catch (err) {
      console.log("Error marking all as read:", err);
    }
  };

  const handleNotificationPress = (notification) => {
    // Store reference to the notification being viewed
    selectedNotificationRef.current = notification;
    setSelectedNotification(notification);
    showModalWithAnimation();
    
    // Mark as read in the background without affecting the modal
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
  console.log("🎯 Handling notification action:", {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    reference_type: notification.reference_type,
    reference_id: notification.reference_id,
    action_url: notification.action_url
  });
  
  closeModal();
  
  // Small delay to ensure modal closes before navigation
  setTimeout(() => {
    // Check for withdrawal notification first
    if (notification.title && notification.title.toLowerCase().includes('withdrawal')) {
      console.log("💰 Withdrawal notification detected");
      
      // Try to get withdrawal ID from different possible fields
      let withdrawalId = notification.reference_id;
      
      // If reference_id is not available, check data field
      if (!withdrawalId && notification.data) {
        withdrawalId = notification.data.withdrawal_id || notification.data.id;
      }
      
      if (withdrawalId) {
        console.log("🚀 Navigating to WithdrawalDetails with ID:", withdrawalId);
        navigation.navigate("WithdrawalDetails", { withdrawalId: withdrawalId });
        return;
      } else {
        console.log("⚠️ No withdrawal ID found, falling back to Wallet");
        navigation.navigate("Wallet");
        return;
      }
    }
    
    // Handle booking notifications
    if (notification.reference_type === 'booking' && notification.reference_id) {
      console.log("🚗 Navigating to BookingDetails with ID:", notification.reference_id);
      navigation.navigate("BookingDetails", { id: notification.reference_id });
      return;
    }
    
    // Handle promo notifications
    if (notification.reference_type === 'promo') {
      console.log("🎁 Navigating to Promos");
      navigation.navigate("Promos");
      return;
    }
    
    // Handle payment notifications (non-withdrawal)
    if (notification.type === 'payment') {
      console.log("💳 Navigating to Wallet");
      navigation.navigate("Wallet");
      return;
    }
    
    // Handle any other notifications with action_url
    if (notification.action_url) {
      console.log("🔗 Navigating to action_url:", notification.action_url);
      navigation.navigate(notification.action_url);
      return;
    }
    
    // Fallback: if no specific action, just close the modal
    console.log("ℹ️ No specific action for this notification");
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
              
              console.log("🗑️ Deleting notification:", notificationId);
              
              const { error } = await supabase
                .from("notifications")
                .delete()
                .eq("id", notificationId);

              if (error) throw error;

              // Update local state
              const deletedNotification = notifications.find(n => n.id === notificationId);
              setNotifications(prev => prev.filter(n => n.id !== notificationId));
              
              // Update unread count if the deleted notification was unread
              if (deletedNotification && !deletedNotification.is_read) {
                setUnreadCount(prev => Math.max(0, prev - 1));
              }
              
              if (selectedNotification?.id === notificationId) {
                closeModal();
              }
              
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert("Success", "Notification deleted successfully.");
            } catch (err) {
              console.log("Error deleting notification:", err);
              Alert.alert("Error", "Failed to delete notification.");
            }
          }
        }
      ]
    );
  };

  const getNotificationIcon = (type, title = '') => {
    // Check for withdrawal success notification
    if (title.toLowerCase().includes('withdrawal')) {
      return { name: 'cash-outline', color: '#10B981', bg: '#E8F5E9' };
    }
    
    switch (type) {
      case 'booking':
        return { name: 'car', color: '#3B82F6', bg: '#EFF6FF' };
      case 'payment':
        return { name: 'cash', color: '#10B981', bg: '#E8F5E9' };
      case 'referral':
        return { name: 'people', color: '#8B5CF6', bg: '#F3E8FF' };
      case 'promo':
        return { name: 'pricetag', color: '#F59E0B', bg: '#FEF3C7' };
      case 'system':
        return { name: 'information-circle', color: '#6B7280', bg: '#F3F4F6' };
      case 'support':
        return { name: 'chatbubble', color: '#EF4444', bg: '#FEE2E2' };
      case 'mission':
        return { name: 'trophy', color: '#F59E0B', bg: '#FEF3C7' };
      default:
        return { name: 'notifications', color: '#6B7280', bg: '#F3F4F6' };
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

  const formatWithdrawalAmount = (message) => {
    // Extract amount from message if it contains withdrawal information
    const amountMatch = message.match(/₱([\d,]+(?:\.\d{2})?)/);
    if (amountMatch) {
      return amountMatch[1];
    }
    return null;
  };

  const filteredNotifications = notifications.filter(notification => {
    if (filterType === 'all') return true;
    if (filterType === 'unread') return !notification.is_read;
    return notification.type === filterType;
  });

  const renderNotificationItem = ({ item }) => {
    const icon = getNotificationIcon(item.type, item.title);
    const isWithdrawal = item.title.toLowerCase().includes('withdrawal');
    const withdrawalAmount = isWithdrawal ? formatWithdrawalAmount(item.message) : null;
    
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
          
          {isWithdrawal && withdrawalAmount && (
            <View style={styles.withdrawalBadge}>
              <Text style={styles.withdrawalBadgeText}>
                +₱{withdrawalAmount}
              </Text>
            </View>
          )}
          
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

  // Notification Detail Modal
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
                          { backgroundColor: getNotificationIcon(selectedNotification.type, selectedNotification.title).bg }
                        ]}>
                          <Ionicons 
                            name={getNotificationIcon(selectedNotification.type, selectedNotification.title).name} 
                            size={32} 
                            color={getNotificationIcon(selectedNotification.type, selectedNotification.title).color} 
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
                            {Object.entries(selectedNotification.data).map(([key, value]) => (
                              <View key={key} style={styles.detailDataRow}>
                                <Text style={styles.detailDataKey}>{key.replace(/_/g, ' ').toUpperCase()}:</Text>
                                <Text style={styles.detailDataValue}>{String(value)}</Text>
                              </View>
                            ))}
                          </View>
                        )}

                        {/* Enhanced action button for withdrawal success */}
                        {(selectedNotification.reference_type === 'booking' || 
                          selectedNotification.reference_type === 'withdrawal' ||
                          (selectedNotification.type === 'payment' && 
                           selectedNotification.title.toLowerCase().includes('withdrawal'))) && (
                          <Pressable
                            style={styles.detailActionButton}
                            onPress={() => handleNotificationAction(selectedNotification)}
                          >
                            <Text style={styles.detailActionText}>
                              {selectedNotification.title.toLowerCase().includes('withdrawal') 
                                ? 'View Withdrawal Details' 
                                : 'View Details'}
                            </Text>
                            <Ionicons name="arrow-forward" size={20} color="#FFF" />
                          </Pressable>
                        )}
                        
                        {/* Additional success badge for withdrawal */}
                        {selectedNotification.title.toLowerCase().includes('withdrawal') && 
                         selectedNotification.message.toLowerCase().includes('success') && (
                          <View style={styles.successBadge}>
                            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                            <Text style={styles.successBadgeText}>Withdrawal Successful</Text>
                          </View>
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
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#183B5C" />
        </Pressable>
        <View>
          <Text style={styles.headerTitle}></Text>
          {unreadCount > 0 && (
            <Text style={styles.headerSubtitle}>{unreadCount} unread</Text>
          )}
        </View>
        {unreadCount > 0 && (
          <Pressable style={styles.markAllButton} onPress={markAllAsRead}>
            <Ionicons name="checkmark-done" size={22} color="#183B5C" />
          </Pressable>
        )}
      </View>

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
            style={[styles.filterTab, filterType === 'promo' && styles.filterTabActive]}
            onPress={() => setFilterType('promo')}
          >
            <Text style={[styles.filterText, filterType === 'promo' && styles.filterTextActive]}>Promos</Text>
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
          <RefreshControl refreshing={refreshing} onRefresh={loadUserData} tintColor="#183B5C" />
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
    paddingVertical: 15,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#183B5C",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  markAllButton: {
    padding: 8,
  },
  filterTabs: {
    backgroundColor: "#FFF",
    paddingVertical: 10,
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
  withdrawalBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  withdrawalBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#10B981',
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
  successBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 12,
    gap: 8,
  },
  successBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
  },
});