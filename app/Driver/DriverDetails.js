import React, { useState } from "react";
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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { styles } from "../styles/CommuterDetailsStyles";

export default function DriverDetails({ navigation }) {
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [loading, setLoading] = useState(false);

  const handleNext = async () => {
    if (!firstName || !lastName || !plateNumber || !vehicleType) {
      Alert.alert("Missing Fields", "Please fill all required fields.");
      return;
    }

    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.from("drivers").upsert({
        id: user.id,
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName,
        plate_number: plateNumber,
        vehicle_type: vehicleType,
        status: "pending",
      });

      if (error) throw error;

      navigation.navigate("DriverIdVerification");

    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={styles.container}>

          <Pressable
            style={{ position: "absolute", top: 60, left: 20 }}
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
            placeholder="Middle Name"
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
            placeholder="Plate Number"
            value={plateNumber}
            onChangeText={setPlateNumber}
          />

          <TextInput
            style={styles.input}
            placeholder="Vehicle Type (Motorcycle, Car)"
            value={vehicleType}
            onChangeText={setVehicleType}
          />

          <Pressable
            style={styles.button}
            onPress={handleNext}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? "Saving..." : "Next"}
            </Text>
          </Pressable>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}