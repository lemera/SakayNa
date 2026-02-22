import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  Modal,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { styles } from "../styles/SelectDriverScreenStyles";

export default function SelectDriverScreen({ route, navigation }) {
  const { pickup, dropoff, kilometers, totalPrice } = route.params || {};

  const [currentLocation, setCurrentLocation] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [loadingDriverId, setLoadingDriverId] = useState(null);

  const mapRef = useRef(null);
  const flatListRef = useRef(null);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission denied", "Location permission is required.");
        return;
      }

      let loc = await Location.getCurrentPositionAsync({});
      setCurrentLocation(loc.coords);

      // Simulate nearby drivers with top-up status
      const nearbyDrivers = Array.from({ length: 5 }).map((_, i) => ({
        id: `${i + 1}`,
        name: `Driver ${i + 1}`,
        rating: (4 + Math.random() * 1).toFixed(1),
        plate: `XYZ-${1000 + i}`,
        image: `https://i.pravatar.cc/150?img=${i + 10}`,
        latitude: loc.coords.latitude + (Math.random() - 0.5) * 0.02,
        longitude: loc.coords.longitude + (Math.random() - 0.5) * 0.02,
        vehicle: ["Sedan", "SUV", "Hatchback"][i % 3],
        contact: `0917-000-000${i}`,
        topUp: Math.random() > 0.5, // random top-up status
      }));

      setDrivers(nearbyDrivers);
    })();
  }, []);

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (R * c).toFixed(2);
  };

  const handleSelectDriver = (driver) => {
    setLoadingDriverId(driver.id);

    setTimeout(() => {
      Alert.alert(
        "Ride Accepted",
        `${driver.name} has accepted your ride! Proceed to payment.`,
        [
          {
            text: "OK",
            onPress: () => {
              setLoadingDriverId(null);
              setModalVisible(false);

              navigation.navigate("PaymentScreen", {
                driver,
                pickupAddress: pickup || "Unknown",
                dropoffAddress: dropoff || "Unknown",
                kilometers: kilometers || 0,
                qty: selectedDriver?.qty || 1,
              });
            },
          },
        ],
      );
    }, 2000);
  };

  const selectDriverFromList = (driver, index) => {
    const distance = calculateDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      driver.latitude,
      driver.longitude,
    );
    setSelectedDriver({ ...driver, distance, qty: 1 });
    setModalVisible(true);

    mapRef.current.animateToRegion(
      {
        latitude: driver.latitude,
        longitude: driver.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      500,
    );

    flatListRef.current.scrollToIndex({ index, animated: true });
  };

  const renderDriver = ({ item, index }) => {
    const distance = currentLocation
      ? calculateDistance(
          currentLocation.latitude,
          currentLocation.longitude,
          item.latitude,
          item.longitude,
        )
      : "N/A";

    return (
      <View style={styles.card}>
        <Image source={{ uri: item.image }} style={styles.driverImage} />
        <View style={styles.driverInfo}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={styles.driverName}>{item.name}</Text>
            {item.topUp && (
              <MaterialIcons
                name="paid"
                size={18}
                color="#FFD166"
                style={{ marginLeft: 6 }}
              />
            )}
          </View>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={14} color="#F4C430" />
            <Text style={styles.ratingText}>{item.rating}</Text>
          </View>
          <Text style={styles.distanceText}>📍 {distance} km away</Text>
        </View>
        <TouchableOpacity
          style={styles.detailsButton}
          onPress={() => selectDriverFromList(item, index)}
        >
          <Text style={styles.detailsText}>See</Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (!currentLocation) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#183B5C" />
        <Text style={{ marginTop: 10 }}>Fetching your location...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#183B5C", "#1F5A8C"]} style={styles.header}>
        {/* FIXED Back button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.canGoBack() && navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Available Drivers</Text>

        <View style={styles.rideInfo}>
          <Text style={styles.rideText}>From: {pickup}</Text>
          <Text style={styles.rideText}>To: {dropoff}</Text>
          <Text style={styles.rideText}>
            Distance: {kilometers?.toFixed(2)} km
          </Text>
          <Text style={styles.priceText}>₱{totalPrice?.toFixed(2)}</Text>
        </View>
      </LinearGradient>

      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        showsUserLocation
        showsMyLocationButton
      >
        {drivers.map((driver) => (
          <Marker
            key={driver.id}
            coordinate={{
              latitude: driver.latitude,
              longitude: driver.longitude,
            }}
            title={driver.name}
            description={`Plate: ${driver.plate}`}
            pinColor={selectedDriver?.id === driver.id ? "#FFD166" : "#183B5C"}
            onPress={() => {
              const index = drivers.findIndex((d) => d.id === driver.id);
              selectDriverFromList(driver, index);
            }}
          />
        ))}
      </MapView>

      <FlatList
        ref={flatListRef}
        data={drivers}
        keyExtractor={(item) => item.id}
        renderItem={renderDriver}
        contentContainerStyle={{ padding: 15, paddingTop: 10 }}
      />

      {/* Driver Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {selectedDriver && (
              <>
                <Image
                  source={{ uri: selectedDriver.image }}
                  style={styles.modalImage}
                />
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={styles.modalName}>{selectedDriver.name}</Text>
                  {selectedDriver.topUp && (
                    <MaterialIcons
                      name="paid"
                      size={20}
                      color="#FFD166"
                      style={{ marginLeft: 6 }}
                    />
                  )}
                </View>
                <Text>⭐ {selectedDriver.rating}</Text>
                <Text>Plate: {selectedDriver.plate}</Text>
                {selectedDriver.vehicle && (
                  <Text>Vehicle: {selectedDriver.vehicle}</Text>
                )}
                {selectedDriver.contact && (
                  <Text>Contact: {selectedDriver.contact}</Text>
                )}
                {selectedDriver.distance && (
                  <Text>Distance: {selectedDriver.distance} km</Text>
                )}

                {/* Passenger Qty */}
                <View style={styles.qtyContainer}>
                  <Text style={styles.qtyLabel}>Passengers:</Text>
                  <View style={styles.qtyControls}>
                    <TouchableOpacity
                      style={styles.qtyButton}
                      onPress={() =>
                        setSelectedDriver((prev) => ({
                          ...prev,
                          qty: prev.qty > 1 ? prev.qty - 1 : 1,
                        }))
                      }
                    >
                      <Text style={styles.qtyButtonText}>-</Text>
                    </TouchableOpacity>

                    <Text style={styles.qtyValue}>
                      {selectedDriver?.qty || 1}
                    </Text>

                    <TouchableOpacity
                      style={styles.qtyButton}
                      onPress={() =>
                        setSelectedDriver((prev) => ({
                          ...prev,
                          qty: prev.qty ? prev.qty + 1 : 2,
                        }))
                      }
                    >
                      <Text style={styles.qtyButtonText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.modalActionRow}>
                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      { backgroundColor: "#4CAF50" },
                    ]}
                    onPress={() =>
                      Alert.alert("Call", `Calling ${selectedDriver.contact}`)
                    }
                  >
                    <Ionicons name="call" size={20} color="#FFF" />
                    <Text style={styles.actionText}>Call</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      { backgroundColor: "#2196F3" },
                    ]}
                    onPress={() =>
                      Alert.alert("Chat", `Chat with ${selectedDriver.name}`)
                    }
                  >
                    <Ionicons name="chatbubble" size={20} color="#FFF" />
                    <Text style={styles.actionText}>Chat</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={() => handleSelectDriver(selectedDriver)}
                >
                  {loadingDriverId === selectedDriver.id ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.selectButtonText}>Confirm Driver</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Text style={{ marginTop: 10, color: "#999" }}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
