// TrackRideScreen.js
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  SafeAreaView,
  TouchableOpacity,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";

const { width, height } = Dimensions.get("window");

export default function TrackRideScreen({ route, navigation }) {
  // Ride data passed from PaymentScreen
  const rideData = route.params || null;

  // If rideData exists, user has booked
  const [booked, setBooked] = useState(!!rideData);
  const [rideLocation, setRideLocation] = useState(
    booked
      ? {
          latitude: rideData.pickupCoordinates?.latitude || 14.5995,
          longitude: rideData.pickupCoordinates?.longitude || 120.9842,
        }
      : null
  );
  const [status, setStatus] = useState("Driver is on the way");
  const [eta, setEta] = useState(5); // minutes remaining
  const mapRef = useRef();

  // Fallback coordinates if not provided
  const pickupLocation = rideData?.pickupCoordinates || { latitude: 14.5995, longitude: 120.9842 };
  const dropoffLocation = rideData?.dropoffCoordinates || { latitude: 14.601, longitude: 120.99 };

  const driver = rideData?.driver || { name: "Juan Dela Cruz", vehicle: "Toyota Vios", plate: "XYZ123" };
  const pickupAddress = rideData?.pickupAddress || "Manila City";
  const dropoffAddress = rideData?.dropoffAddress || "Intramuros";

  // Simulate driver moving toward dropoff if booked
  useEffect(() => {
    if (!booked) return;

    const interval = setInterval(() => {
      setRideLocation((prev) => {
        const latDiff = dropoffLocation.latitude - prev.latitude;
        const lonDiff = dropoffLocation.longitude - prev.longitude;
        const step = 0.0002;

        const newLat =
          Math.abs(latDiff) < step ? dropoffLocation.latitude : prev.latitude + Math.sign(latDiff) * step;
        const newLon =
          Math.abs(lonDiff) < step ? dropoffLocation.longitude : prev.longitude + Math.sign(lonDiff) * step;

        setEta((old) => (old > 0 ? old - 0.02 : 0));

        if (Math.abs(latDiff) < 0.0003 && Math.abs(lonDiff) < 0.0003) {
          setStatus("Ride completed");
          clearInterval(interval);
        } else if (Math.abs(latDiff) < 0.002 && Math.abs(lonDiff) < 0.002) {
          setStatus("Almost there");
        } else {
          setStatus("Driver is on the way");
        }

        if (mapRef.current) {
          mapRef.current.animateToRegion(
            {
              latitude: newLat,
              longitude: newLon,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            },
            1000
          );
        }

        return { latitude: newLat, longitude: newLon };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [booked]);

  // Show booking prompt if user hasn't booked
  if (!booked) {
    return (
      <SafeAreaView style={styles.bookingContainer}>
        <Text style={styles.bookingTitle}>No active ride</Text>
        <Text style={styles.bookingSubtitle}>
          You have not booked a ride yet. Please book a ride to track the driver.
        </Text>
        <TouchableOpacity style={styles.bookButton} onPress={() => navigation.navigate("Home")}>
          <Text style={styles.bookButtonText}>Book a Ride</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Coordinates for polyline route
  const routeCoordinates = [pickupLocation, rideLocation, dropoffLocation];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          ...rideLocation,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
      >
        <Polyline coordinates={routeCoordinates} strokeColor="#1F5A8C" strokeWidth={4} />
        <Marker coordinate={rideLocation} title="Driver" description={driver.name} />
        <Marker coordinate={pickupLocation} title="Pickup" pinColor="blue" />
        <Marker coordinate={dropoffLocation} title="Dropoff" pinColor="green" />
      </MapView>

      <View style={styles.infoCard}>
        <Text style={styles.sectionTitle}>Driver Info</Text>
        <Text style={styles.infoText}>Name: {driver.name}</Text>
        <Text style={styles.infoText}>Vehicle: {driver.vehicle}</Text>
        <Text style={styles.infoText}>Plate: {driver.plate}</Text>

        <Text style={styles.sectionTitle}>Ride Details</Text>
        <Text style={styles.infoText}>From: {pickupAddress}</Text>
        <Text style={styles.infoText}>To: {dropoffAddress}</Text>

        <Text style={styles.statusText}>{status}</Text>
        <Text style={styles.etaText}>ETA: {Math.ceil(eta)} min</Text>
      </View>
    </SafeAreaView>
  );
}

// Styles remain the same
const styles = StyleSheet.create({
  map: { width, height: height * 0.5 },

  infoCard: {
    flex: 1,
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 100,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: -3 },
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 6,
    color: "#183B5C",
  },
  infoText: { fontSize: 14, marginBottom: 4 },
  statusText: {
    fontSize: 14,
    marginTop: 8,
    fontWeight: "bold",
    color: "#E97A3E",
  },
  etaText: { fontSize: 14, marginTop: 4, color: "#183B5C" },

  bookingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  bookingTitle: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 12,
    color: "#183B5C",
  },
  bookingSubtitle: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
    color: "#555",
  },
  bookButton: {
    backgroundColor: "#E97A3E",
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 25,
  },
  bookButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "bold",
  },
});