import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  TouchableWithoutFeedback,
  Keyboard,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";
import { styles } from "../styles/Driver/DriverDetailsStyle";

export default function DriverDetails({ navigation }) {
  const [userId, setUserId] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ Load user_id safely
  useEffect(() => {
    const loadUser = async () => {
      try {
        const id = await AsyncStorage.getItem("user_id"); // make sure this matches login

        if (!id) {
          Alert.alert("Session Expired", "Please login again.");
          navigation.reset({
            index: 0,
            routes: [{ name: "UserType" }],
          });
          return;
        }

        setUserId(id);
      } catch (error) {
        console.log("Error loading user:", error);
        navigation.reset({
          index: 0,
          routes: [{ name: "UserType" }],
        });
      } finally {
        setLoadingUser(false);
      }
    };

    loadUser();
  }, []);

  const handleNext = async () => {
    if (!userId) {
      Alert.alert("Error", "User session not found.");
      return;
    }

    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !plateNumber.trim() ||
      !vehicleType.trim() ||
      !licenseNumber.trim() ||
      !licenseExpiry.trim()
    ) {
      Alert.alert("Missing Fields", "Please fill all required fields.");
      return;
    }

    try {
      setLoading(true);

      // 🔹 Get phone from users table
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("phone")
        .eq("id", userId)
        .single();

      if (userError || !userData) {
        throw new Error("User not found.");
      }

      // 🔹 Upsert driver record
      const { error } = await supabase.from("drivers").upsert(
        {
          id: userId, // important: same as users.id
          first_name: firstName.trim(),
          middle_name: middleName.trim() || null,
          last_name: lastName.trim(),
          phone: userData.phone,
          email: `${userData.phone}@sakayna.app`,
          license_number: licenseNumber.trim(),
          license_expiry_date: licenseExpiry,
          plate_number: plateNumber.toUpperCase().trim(),
          vehicle_type: vehicleType.trim(),
          status: "pending",
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

      if (error) throw error;

      // ✅ Navigate to DriverHomePage and remove registration from stack
      navigation.reset({
        index: 0,
        routes: [{ name: "DriverHomePage" }],
      });

    } catch (err) {
      console.log("Driver Insert Error:", err);
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loadingUser) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#183B5C" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.container, { paddingBottom: 30 }]}>

            <Pressable
              style={{ position: "absolute", top: 60, left: 20, zIndex: 10 }}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="arrow-back" size={28} color="#183B5C" />
            </Pressable>

            <Image
              source={require("../../assets/logo-sakayna.png")}
              style={styles.logo}
            />

            <Text style={styles.title}>Driver Registration</Text>

            <TextInput
              style={styles.input}
              placeholder="First Name"
              value={firstName}
              onChangeText={setFirstName}
            />

            <TextInput
              style={styles.input}
              placeholder="Middle Name (Optional)"
              value={middleName}
              onChangeText={setMiddleName}
            />

            <TextInput
              style={styles.input}
              placeholder="Last Name"
              value={lastName}
              onChangeText={setLastName}
            />

            <TextInput
              style={styles.input}
              placeholder="License Number"
              value={licenseNumber}
              onChangeText={setLicenseNumber}
            />

            <TextInput
              style={styles.input}
              placeholder="License Expiry (YYYY-MM-DD)"
              value={licenseExpiry}
              onChangeText={setLicenseExpiry}
            />

            <TextInput
              style={styles.input}
              placeholder="Plate Number"
              value={plateNumber}
              onChangeText={setPlateNumber}
              autoCapitalize="characters"
            />

            <TextInput
              style={styles.input}
              placeholder="Vehicle Type (Motorcycle, Car)"
              value={vehicleType}
              onChangeText={setVehicleType}
            />

            <Pressable
              style={[
                styles.button,
                { marginTop: 20, opacity: loading ? 0.7 : 1 },
              ]}
              onPress={handleNext}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Submit</Text>
              )}
            </Pressable>

          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}