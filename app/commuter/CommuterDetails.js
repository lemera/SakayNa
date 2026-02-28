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
  ActivityIndicator,
} from "react-native";
import { styles } from "../styles/CommuterDetailsStyles";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function CommuterDetails({ navigation }) {
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [userId, setUserId] = useState(null);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [buttonPressed, setButtonPressed] = useState(false);

  // 🔥 INITIAL LOAD
  useEffect(() => {
    const init = async () => {
      try {
        const storedUserId = await AsyncStorage.getItem("user_id");
        const storedPhone = await AsyncStorage.getItem("user_phone");

        if (!storedUserId) {
          Alert.alert("Session Expired", "Please login again.");
          navigation.replace("UserTypeScreen");
          return;
        }

        setUserId(storedUserId);
        setPhone(storedPhone);

        // ✅ Check if already registered
        const { data: existing, error } = await supabase
          .from("commuters")
          .select("id")
          .eq("id", storedUserId)
          .maybeSingle();

        if (error) throw error;

        if (existing) {
          navigation.replace("HomePage");
        }

      } catch (err) {
        Alert.alert("Error", err.message);
      } finally {
        setInitializing(false);
      }
    };

    init();
  }, []);

  // 🔥 REGISTER COMMUTER
  const handleRegister = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert("Missing Fields", "First and Last name are required.");
      return;
    }

    if (!userId) {
      Alert.alert("Error", "User not authenticated.");
      return;
    }

    setLoading(true);

    try {
      // 1️⃣ Insert commuter
      const { error } = await supabase.from("commuters").insert([
        {
          id: userId,
          phone: phone,
          first_name: firstName.trim(),
          middle_name: middleName.trim(),
          last_name: lastName.trim(),
        },
      ]);

      if (error) throw error;

      // 2️⃣ Create wallet automatically (recommended)
      await supabase.from("commuter_wallets").insert([
        {
          commuter_id: userId,
          balance: 0,
          points: 0,
        },
      ]);

      navigation.replace("HomePage");

    } catch (err) {
      Alert.alert("Registration Failed", err.message);
    } finally {
      setLoading(false);
    }
  };

  if (initializing) {
    return (
      <View style={{ flex:1, justifyContent:"center", alignItems:"center" }}>
        <ActivityIndicator size="large" color="#183B5C" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={styles.container}>
          <Pressable
            style={{ position: "absolute", top: 50, left: 20 }}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={28} color="#183B5C" />
          </Pressable>

          <Image
            source={require("../../assets/logo-sakayna.png")}
            style={styles.logo}
          />

          <Text style={styles.title}>Enter Your Details</Text>
          <Text style={styles.subtitle}>
            Please provide your information to continue.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="First Name"
            value={firstName}
            onChangeText={setFirstName}
            placeholderTextColor="#999"
          />

          <TextInput
            style={styles.input}
            placeholder="Middle Name"
            value={middleName}
            onChangeText={setMiddleName}
            placeholderTextColor="#999"
          />

          <TextInput
            style={styles.input}
            placeholder="Last Name"
            value={lastName}
            onChangeText={setLastName}
            placeholderTextColor="#999"
          />

          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            placeholderTextColor="#999"
          />

          <TextInput
            style={[styles.input, { backgroundColor: "#eee" }]}
            value={phone}
            editable={false}
          />

          <Pressable
            onPress={handleRegister}
            onPressIn={() => setButtonPressed(true)}
            onPressOut={() => setButtonPressed(false)}
            disabled={loading}
            style={[
              styles.button,
              {
                backgroundColor: buttonPressed ? "#E97A3E" : "#183B5C",
                marginTop: 20,
                opacity: loading ? 0.7 : 1,
              },
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Register</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}