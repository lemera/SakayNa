// InboxScreen.js
import React, { useState } from "react";
import { View, Text, FlatList, StyleSheet, Pressable, TouchableOpacity, Modal, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const rideHistoryData = [
  {
    id: "1",
    pickup: "Main St, Zamboanga",
    dropoff: "Ateneo Campus",
    date: "2026-02-20",
    time: "10:30 AM",
    distance: 5.2,
    fare: 62.4,
    status: "Completed",
    driver: {
      name: "Juan Dela Cruz",
      vehicle: "Toyota Vios",
      plateNumber: "1234 AB",
      contact: "+63 912 345 6789",
      rating: 4.8,
      avatar: "https://i.pravatar.cc/150?img=12",
    },
  },
  {
    id: "2",
    pickup: "Salimbao",
    dropoff: "Market St.",
    date: "2026-02-18",
    time: "2:00 PM",
    distance: 3.1,
    fare: 37.2,
    status: "Completed",
    driver: {
      name: "Maria Santos",
      vehicle: "Honda City",
      plateNumber: "5678 CD",
      contact: "+63 987 654 3210",
      rating: 4.9,
      avatar: "https://i.pravatar.cc/150?img=24",
    },
  },
];

const chatData = [
  { id: "1", rideId: "1", message: "Driver is arriving soon", time: "2 min ago" },
  { id: "2", rideId: "2", message: "Driver is nearby", time: "5 min ago" },
  { id: "3", rideId: null, message: "New message from support", time: "10 min ago" },
];

const notificationData = [
  { id: "1", message: "Your payment is confirmed", time: "1 hour ago" },
  { id: "2", message: "Promo: 20% off your next ride", time: "2 days ago" },
];

export default function InboxScreen() {
  const [activeTab, setActiveTab] = useState("Chat");
  const [selectedRide, setSelectedRide] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const openDetails = (ride) => {
    setSelectedRide(ride);
    setModalVisible(true);
  };

  const renderChatItem = ({ item }) => {
    const driver = rideHistoryData.find((ride) => ride.id === item.rideId)?.driver;

    return (
      <View style={styles.card}>
        {driver ? (
          <Image source={{ uri: driver.avatar }} style={styles.chatAvatar} />
        ) : (
          <Ionicons name="chatbubble-ellipses-outline" size={24} color="#E97A3E" />
        )}
        <View style={styles.cardText}>
          {driver && <Text style={styles.driverNameChat}>{driver.name}</Text>}
          <Text style={styles.message}>{item.message}</Text>
          <Text style={styles.time}>{item.time}</Text>
        </View>
      </View>
    );
  };

  const renderNotificationItem = ({ item }) => (
    <View style={styles.card}>
      <Ionicons name="notifications-outline" size={24} color="#FFA500" />
      <View style={styles.cardText}>
        <Text style={styles.message}>{item.message}</Text>
        <Text style={styles.time}>{item.time}</Text>
      </View>
    </View>
  );

  const renderRideItem = ({ item }) => (
    <View style={styles.rideCard}>
      <View style={styles.rideHeader}>
        <Text style={styles.rideDate}>{item.date} • {item.time}</Text>
        <Text style={[styles.status, item.status === "Completed" ? styles.completed : styles.cancelled]}>
          {item.status}
        </Text>
      </View>

      <View style={styles.rideLocations}>
        <Ionicons name="location" size={20} color="#183B5C" style={{ marginRight: 8 }} />
        <Text style={styles.rideText}>{item.pickup}</Text>
      </View>
      <View style={styles.rideLocations}>
        <Ionicons name="flag" size={20} color="#183B5C" style={{ marginRight: 8 }} />
        <Text style={styles.rideText}>{item.dropoff}</Text>
      </View>

      <View style={styles.rideFooter}>
        <Text style={styles.rideDetails}>Distance: {item.distance.toFixed(1)} km</Text>
        <Text style={styles.rideDetails}>Fare: ₱{item.fare.toFixed(2)}</Text>
      </View>

      <TouchableOpacity style={styles.detailButton} onPress={() => openDetails(item)}>
        <Text style={styles.detailButtonText}>See Details</Text>
      </TouchableOpacity>
    </View>
  );

  const getData = () => {
    switch (activeTab) {
      case "Chat":
        return chatData;
      case "Notification":
        return notificationData;
      case "Ride History":
        return rideHistoryData;
      default:
        return [];
    }
  };

  const renderItem = ({ item }) => {
    if (activeTab === "Chat") return renderChatItem({ item });
    if (activeTab === "Notification") return renderNotificationItem({ item });
    if (activeTab === "Ride History") return renderRideItem({ item });
  };

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabsContainer}>
        {["Chat", "Notification", "Ride History"].map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Content */}
      <FlatList
        data={getData()}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 50 }}
      />

      {/* Modal for ride details */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalBackground}>
          <View style={styles.modalContainer}>
            {selectedRide && (
              <>
                <View style={styles.driverHeader}>
                  <Image source={{ uri: selectedRide.driver.avatar }} style={styles.driverAvatar} />
                  <View style={{ marginLeft: 12 }}>
                    <Text style={styles.driverName}>{selectedRide.driver.name}</Text>
                    <Text style={styles.driverRating}>{selectedRide.driver.rating} ⭐</Text>
                  </View>
                </View>
                
                <View style={styles.driverInfo}>
                  <Text style={styles.modalText}>Vehicle: {selectedRide.driver.vehicle}</Text>
                  <Text style={styles.modalText}>Plate Number: {selectedRide.driver.plateNumber}</Text>
                  <Text style={styles.modalText}>Contact: {selectedRide.driver.contact}</Text>
                  <Text style={styles.modalText}>Distance: {selectedRide.distance.toFixed(1)} km</Text>
                  <Text style={styles.modalText}>Fare: ₱{selectedRide.fare.toFixed(2)}</Text>
                </View>

                <TouchableOpacity style={styles.closeButton} onPress={() => setModalVisible(false)}>
                  <Text style={styles.closeButtonText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F6F6F6", paddingHorizontal: 15, paddingTop: 15 },
  tabsContainer: { flexDirection: "row", backgroundColor: "#fff", borderRadius: 12, marginBottom: 15, overflow: "hidden" },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  activeTab: { backgroundColor: "#E97A3E" },
  tabText: { fontSize: 16, fontWeight: "500", color: "#183B5C" },
  activeTabText: { color: "#fff", fontWeight: "700" },

  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", padding: 15, marginVertical: 6, borderRadius: 12, shadowColor: "#000", shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 5, elevation: 3 },
  cardText: { marginLeft: 12 },
  message: { fontSize: 16, fontWeight: "500", color: "#183B5C" },
  time: { fontSize: 12, color: "#888", marginTop: 2 },
  driverNameChat: { fontSize: 14, fontWeight: "600", color: "#183B5C", marginBottom: 2 },
  chatAvatar: { width: 40, height: 40, borderRadius: 20 },

  rideCard: { 
    padding: 15, 
    borderRadius: 12, 
    marginVertical: 6, 
    backgroundColor: "#FFFFFF", 
    shadowColor: "#000", 
    shadowOpacity: 0.05, 
    shadowOffset: { width: 0, height: 2 }, 
    shadowRadius: 5, 
    elevation: 3 
  },
  rideHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  rideDate: { color: "#183B5C", fontWeight: "600" },
  status: { fontWeight: "700"},
  completed: { color: "#17813C" },
  cancelled: { color: "#f00" },
  rideLocations: { flexDirection: "row", alignItems: "center", marginVertical: 2 },
  rideText: { color: "#183B5C", fontSize: 15 },
  rideFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  rideDetails: { color: "#183B5C", fontSize: 14 },
  detailButton: { marginTop: 10, backgroundColor: "#E97A3E", paddingVertical: 6, borderRadius: 8, alignItems: "center" },
  detailButtonText: { color: "#fff", fontWeight: "700" },

  modalBackground: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  modalContainer: { width: "90%", backgroundColor: "#fff", borderRadius: 12, padding: 20 },
  driverHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  driverAvatar: { width: 50, height: 50, borderRadius: 25 },
  driverName: { fontSize: 16, fontWeight: "700", color: "#183B5C" },
  driverRating: { fontSize: 14, color: "#E97A3E" },
  driverInfo: { marginBottom: 15 },
  modalText: { fontSize: 14, color: "#183B5C", marginVertical: 2 },
  closeButton: { backgroundColor: "#E97A3E", paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  closeButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});