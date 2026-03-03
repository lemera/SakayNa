import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { Swipeable } from "react-native-gesture-handler";

export default function DriverInboxScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [driverId, setDriverId] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [filter, setFilter] = useState("all"); // all, unread, read

  // Fetch driver ID
  useFocusEffect(
    useCallback(() => {
      const getDriverId = async () => {
        const id = await AsyncStorage.getItem("user_id");
        setDriverId(id);
      };
      getDriverId();
    }, [])
  );

  // Fetch notifications
  useEffect(() => {
    if (driverId) {
      fetchNotifications();
    }
  }, [driverId]);

  // Real-time subscription for new notifications
  useEffect(() => {
    if (!driverId) return;

    const subscription = supabase
      .channel('driver-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${driverId}`,
        },
        (payload) => {
          console.log("New notification received:", payload);
          // Add new notification to the list
          setNotifications(prev => [payload.new, ...prev]);
          if (!payload.new.is_read) {
            setUnreadCount(prev => prev + 1);
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [driverId]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", driverId)
        .eq("user_type", "driver")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      setNotifications(data || []);
      
      // Count unread
      const unread = data?.filter(n => !n.is_read).length || 0;
      setUnreadCount(unread);
      
      console.log(`📬 Fetched ${data?.length} notifications, ${unread} unread`);
    } catch (err) {
      console.log("Error fetching notifications:", err.message);
      Alert.alert("Error", "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };

  const markAsRead = async (notificationId) => {
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ 
          is_read: true, 
          read_at: new Date() 
        })
        .eq("id", notificationId);

      if (error) throw error;

      // Update local state
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, is_read: true, read_at: new Date() } : n
        )
      );
      
      // Update unread count
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.log("Error marking as read:", err.message);
    }
  };

  const markAllAsRead = async () => {
    try {
      const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
      
      if (unreadIds.length === 0) return;

      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date() })
        .in("id", unreadIds);

      if (error) throw error;

      // Update local state
      setNotifications(prev =>
        prev.map(n => ({ ...n, is_read: true, read_at: new Date() }))
      );
      
      setUnreadCount(0);
      
      Alert.alert("Success", "All notifications marked as read");
    } catch (err) {
      console.log("Error marking all as read:", err.message);
    }
  };

  const deleteNotification = async (notificationId) => {
    try {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", notificationId);

      if (error) throw error;

      // Update local state
      const deleted = notifications.find(n => n.id === notificationId);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      
      if (deleted && !deleted.is_read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.log("Error deleting notification:", err.message);
      Alert.alert("Error", "Failed to delete notification");
    }
  };

  const handleNotificationPress = (notification) => {
    // Mark as read
    if (!notification.is_read) {
      markAsRead(notification.id);
    }

    // Show details modal
    setSelectedNotification(notification);
    setModalVisible(true);
  };

  const handleActionPress = (notification) => {
    if (!notification.data?.action) return;

    // Close modal
    setModalVisible(false);

    // Navigate based on action
    switch (notification.data.action) {
      case "view_trip":
        navigation.navigate("TripDetailsScreen", { tripId: notification.data.trip_id });
        break;
      case "view_subscription":
        navigation.navigate("SubscriptionScreen");
        break;
      case "view_mission":
        // Navigate to mission screen
        break;
      case "view_payment":
        navigation.navigate("Wallet");
        break;
      default:
        break;
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case "booking":
        return { name: "bicycle", color: "#3B82F6", bg: "#DBEAFE" };
      case "payment":
        return { name: "cash", color: "#10B981", bg: "#D1FAE5" };
      case "referral":
        return { name: "people", color: "#8B5CF6", bg: "#EDE9FE" };
      case "mission":
        return { name: "trophy", color: "#F59E0B", bg: "#FEF3C7" };
      case "system":
        return { name: "information-circle", color: "#6B7280", bg: "#F3F4F6" };
      case "promo":
        return { name: "gift", color: "#EC4899", bg: "#FCE7F3" };
      case "support":
        return { name: "headset", color: "#6366F1", bg: "#E0E7FF" };
      default:
        return { name: "notifications", color: "#6B7280", bg: "#F3F4F6" };
    }
  };

  const getTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  };

  const filteredNotifications = notifications.filter(notification => {
    if (filter === "unread") return !notification.is_read;
    if (filter === "read") return notification.is_read;
    return true;
  });

  const renderRightActions = (notification) => {
    return (
      <View style={{ flexDirection: "row" }}>
        {!notification.is_read && (
          <Pressable
            style={{
              backgroundColor: "#3B82F6",
              width: 70,
              justifyContent: "center",
              alignItems: "center",
            }}
            onPress={() => markAsRead(notification.id)}
          >
            <Ionicons name="checkmark" size={24} color="#FFF" />
            <Text style={{ color: "#FFF", fontSize: 10, marginTop: 2 }}>Mark Read</Text>
          </Pressable>
        )}
        <Pressable
          style={{
            backgroundColor: "#EF4444",
            width: 70,
            justifyContent: "center",
            alignItems: "center",
          }}
          onPress={() => {
            Alert.alert(
              "Delete Notification",
              "Are you sure you want to delete this notification?",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", onPress: () => deleteNotification(notification.id), style: "destructive" }
              ]
            );
          }}
        >
          <Ionicons name="trash" size={24} color="#FFF" />
          <Text style={{ color: "#FFF", fontSize: 10, marginTop: 2 }}>Delete</Text>
        </Pressable>
      </View>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F5F7FA" }}>
        <ActivityIndicator size="large" color="#183B5C" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#F5F7FA" }}>
      {/* Header */}
      <View
        style={{
          backgroundColor: "#183B5C",
          paddingTop: insets.top + 20,
          paddingBottom: 20,
          paddingHorizontal: 20,
          borderBottomLeftRadius: 30,
          borderBottomRightRadius: 30,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={{ width: 40 }}
          >
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </Pressable>

          <View style={{ alignItems: "center" }}>
            <Text style={{ fontSize: 20, fontWeight: "bold", color: "#FFF" }}>
              Inbox
            </Text>
            {unreadCount > 0 && (
              <View style={{
                backgroundColor: "#FF3B30",
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 12,
                marginTop: 2,
              }}>
                <Text style={{ color: "#FFF", fontSize: 10, fontWeight: "bold" }}>
                  {unreadCount} unread
                </Text>
              </View>
            )}
          </View>

          {unreadCount > 0 && (
            <Pressable onPress={markAllAsRead}>
              <Text style={{ color: "#FFB37A", fontSize: 14 }}>Mark all read</Text>
            </Pressable>
          )}
        </View>

        {/* Filter Tabs */}
        <View style={{ flexDirection: "row", marginTop: 15, gap: 8 }}>
          {["all", "unread", "read"].map((filterType) => (
            <Pressable
              key={filterType}
              style={[
                {
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 20,
                  alignItems: "center",
                },
                filter === filterType 
                  ? { backgroundColor: "#FFB37A" } 
                  : { backgroundColor: "rgba(255,255,255,0.2)" }
              ]}
              onPress={() => setFilter(filterType)}
            >
              <Text style={{ 
                color: filter === filterType ? "#183B5C" : "#FFF",
                fontWeight: filter === filterType ? "bold" : "normal",
                textTransform: "capitalize"
              }}>
                {filterType}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Notifications List */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {filteredNotifications.length === 0 ? (
          <View style={{ 
            padding: 40, 
            alignItems: "center",
            backgroundColor: "#FFF",
            borderRadius: 24,
            marginTop: 10,
          }}>
            <View style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: "#F3F4F6",
              justifyContent: "center",
              alignItems: "center",
              marginBottom: 16,
            }}>
              <Ionicons name="notifications-off-outline" size={40} color="#9CA3AF" />
            </View>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#333", marginBottom: 8 }}>
              No notifications
            </Text>
            <Text style={{ fontSize: 14, color: "#666", textAlign: "center" }}>
              {filter === "all" 
                ? "You don't have any notifications yet"
                : filter === "unread" 
                  ? "You've read all notifications"
                  : "No read notifications"}
            </Text>
          </View>
        ) : (
          filteredNotifications.map((notification) => {
            const icon = getNotificationIcon(notification.type);
            return (
              <Swipeable
                key={notification.id}
                renderRightActions={() => renderRightActions(notification)}
              >
                <Pressable
                  style={({ pressed }) => ({
                    backgroundColor: pressed 
                      ? "#F3F4F6" 
                      : notification.is_read ? "#FFF" : "#F0F9FF",
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: notification.is_read ? "#E5E7EB" : "#B2D9FF",
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.05,
                    shadowRadius: 4,
                    elevation: 2,
                  })}
                  onPress={() => handleNotificationPress(notification)}
                >
                  <View style={{ flexDirection: "row" }}>
                    {/* Icon */}
                    <View style={{
                      width: 50,
                      height: 50,
                      borderRadius: 12,
                      backgroundColor: icon.bg,
                      justifyContent: "center",
                      alignItems: "center",
                      marginRight: 12,
                    }}>
                      <Ionicons name={icon.name} size={24} color={icon.color} />
                    </View>

                    {/* Content */}
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <Text style={{ 
                          fontSize: 16, 
                          fontWeight: notification.is_read ? "600" : "bold",
                          color: "#333",
                          flex: 1,
                          marginRight: 8,
                        }}>
                          {notification.title}
                        </Text>
                        <Text style={{ fontSize: 11, color: "#9CA3AF" }}>
                          {getTimeAgo(notification.created_at)}
                        </Text>
                      </View>

                      <Text style={{ 
                        fontSize: 13, 
                        color: notification.is_read ? "#666" : "#4B5563",
                        marginTop: 4,
                        lineHeight: 18,
                      }} numberOfLines={2}>
                        {notification.message}
                      </Text>

                      {!notification.is_read && (
                        <View style={{
                          flexDirection: "row",
                          marginTop: 8,
                          alignItems: "center",
                        }}>
                          <View style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: "#3B82F6",
                            marginRight: 4,
                          }} />
                          <Text style={{ fontSize: 10, color: "#3B82F6" }}>
                            New
                          </Text>
                        </View>
                      )}

                      {notification.data?.action && (
                        <View style={{
                          flexDirection: "row",
                          marginTop: 8,
                          alignItems: "center",
                        }}>
                          <Ionicons name="arrow-forward-circle" size={14} color="#183B5C" />
                          <Text style={{ fontSize: 11, color: "#183B5C", marginLeft: 4 }}>
                            Tap to {notification.data.action}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </Pressable>
              </Swipeable>
            );
          })
        )}
      </ScrollView>

      {/* Notification Details Modal */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "flex-end",
        }}>
          <View style={{
            backgroundColor: "#FFF",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 20,
            maxHeight: "80%",
          }}>
            {selectedNotification && (
              <>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <Text style={{ fontSize: 20, fontWeight: "bold", color: "#333" }}>
                    Notification Details
                  </Text>
                  <Pressable onPress={() => setModalVisible(false)}>
                    <Ionicons name="close" size={24} color="#666" />
                  </Pressable>
                </View>

                <ScrollView>
                  {/* Header with icon */}
                  <View style={{ alignItems: "center", marginBottom: 20 }}>
                    <View style={{
                      width: 70,
                      height: 70,
                      borderRadius: 20,
                      backgroundColor: getNotificationIcon(selectedNotification.type).bg,
                      justifyContent: "center",
                      alignItems: "center",
                      marginBottom: 12,
                    }}>
                      <Ionicons 
                        name={getNotificationIcon(selectedNotification.type).name} 
                        size={36} 
                        color={getNotificationIcon(selectedNotification.type).color} 
                      />
                    </View>
                    <Text style={{ fontSize: 18, fontWeight: "bold", color: "#333", textAlign: "center" }}>
                      {selectedNotification.title}
                    </Text>
                    <Text style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>
                      {new Date(selectedNotification.created_at).toLocaleString()}
                    </Text>
                  </View>

                  {/* Message */}
                  <View style={{
                    backgroundColor: "#F9FAFB",
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 20,
                  }}>
                    <Text style={{ fontSize: 16, color: "#333", lineHeight: 24 }}>
                      {selectedNotification.message}
                    </Text>
                  </View>

                  {/* Additional Data */}
                  {selectedNotification.data && (
                    <View style={{ marginBottom: 20 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 8 }}>
                        Additional Information
                      </Text>
                      <View style={{
                        backgroundColor: "#F9FAFB",
                        borderRadius: 12,
                        padding: 12,
                      }}>
                        {Object.entries(selectedNotification.data).map(([key, value]) => {
                          if (key === 'action') return null;
                          return (
                            <View key={key} style={{ flexDirection: "row", marginBottom: 6 }}>
                              <Text style={{ fontSize: 13, color: "#666", width: 100, textTransform: "capitalize" }}>
                                {key.replace(/_/g, ' ')}:
                              </Text>
                              <Text style={{ fontSize: 13, color: "#333", flex: 1, fontWeight: "500" }}>
                                {String(value)}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* Action Buttons */}
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    {selectedNotification.data?.action && (
                      <Pressable
                        style={{
                          flex: 1,
                          backgroundColor: "#183B5C",
                          padding: 14,
                          borderRadius: 12,
                          alignItems: "center",
                        }}
                        onPress={() => handleActionPress(selectedNotification)}
                      >
                        <Text style={{ color: "#FFF", fontWeight: "600" }}>
                          {selectedNotification.data.action === "view_trip" ? "View Trip" :
                           selectedNotification.data.action === "view_subscription" ? "View Subscription" :
                           selectedNotification.data.action === "view_payment" ? "View Payment" :
                           "Take Action"}
                        </Text>
                      </Pressable>
                    )}
                    <Pressable
                      style={{
                        flex: selectedNotification.data?.action ? 0.5 : 1,
                        backgroundColor: "#F3F4F6",
                        padding: 14,
                        borderRadius: 12,
                        alignItems: "center",
                      }}
                      onPress={() => setModalVisible(false)}
                    >
                      <Text style={{ color: "#333", fontWeight: "600" }}>Close</Text>
                    </Pressable>
                  </View>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}