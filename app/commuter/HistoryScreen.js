import React, { useState } from "react";
import { View, Text, FlatList, TouchableOpacity, Modal, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { styles } from "../styles/RideHistoryScreenStyles"; // <-- import styles

export default function RideHistoryScreen() {
  const [rides, setRides] = useState([
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
        avatar: "https://i.pravatar.cc/150?img=12"
      }
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
        avatar: "https://i.pravatar.cc/150?img=24"
      }
    }
  ]);

  const [selectedRide, setSelectedRide] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const openDetails = (ride) => {
    setSelectedRide(ride);
    setModalVisible(true);
  };

  const renderItem = ({ item }) => (
    <LinearGradient colors={['#E97A3E', '#183B5C']} start={[0,0]} end={[1,1]} style={styles.rideCard}>
      <View style={styles.rideHeader}>
        <Text style={styles.rideDate}>{item.date} • {item.time}</Text>
        <Text style={[styles.status, item.status === "Completed" ? styles.completed : styles.cancelled]}>
          {item.status}
        </Text>
      </View>

      <View style={styles.rideLocations}>
        <Ionicons name="location" size={20} color="#fff" style={{ marginRight: 8 }} />
        <Text style={styles.rideText}>{item.pickup}</Text>
      </View>
      <View style={styles.rideLocations}>
        <Ionicons name="flag" size={20} color="#fff" style={{ marginRight: 8 }} />
        <Text style={styles.rideText}>{item.dropoff}</Text>
      </View>

      <View style={styles.rideFooter}>
        <Text style={styles.rideDetails}>Distance: {item.distance.toFixed(1)} km</Text>
        <Text style={styles.rideDetails}>Fare: ₱{item.fare.toFixed(2)}</Text>
      </View>

      <TouchableOpacity style={styles.detailButton} onPress={() => openDetails(item)}>
        <Text style={styles.detailButtonText}>See Details</Text>
      </TouchableOpacity>
    </LinearGradient>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ride History</Text>
      <FlatList
        data={rides}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 50 }}
      />

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