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
  const [phone, setPhone] = useState("");

  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  const [loading, setLoading] = useState(false);

  // ✅ Load user_id safely
  useEffect(() => {
    const loadUser = async () => {
      try {
        const id = await AsyncStorage.getItem("user_id");

        if (!id) {
          Alert.alert("Session Expired", "Please login again.");
          navigation.reset({
            index: 0,
            routes: [{ name: "UserType" }],
          });
          return;
        }

        setUserId(id);
        
        // Also fetch the user's phone number
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("phone")
          .eq("id", id)
          .single();

        if (userError || !userData) {
          throw new Error("User not found.");
        }

        setPhone(userData.phone || "");
        
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
      !email.trim()
    ) {
      Alert.alert("Missing Fields", "Please fill all required fields.");
      return;
    }

    try {
      setLoading(true);

      // Check if driver record already exists
      const { data: existingDriver, error: checkError } = await supabase
        .from("drivers")
        .select("id")
        .eq("id", userId)
        .single();

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 means no rows returned
        console.log("Check error:", checkError);
      }

      let error;
      
      if (existingDriver) {
        // Update existing driver
        const { error: updateError } = await supabase
          .from("drivers")
          .update({
            first_name: firstName.trim(),
            middle_name: middleName.trim() || null,
            last_name: lastName.trim(),
            phone: phone,
            email: email.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);
        
        error = updateError;
      } else {
        // Insert new driver
        const { error: insertError } = await supabase
          .from("drivers")
          .insert({
            id: userId,
            first_name: firstName.trim(),
            middle_name: middleName.trim() || null,
            last_name: lastName.trim(),
            phone: phone,
            email: email.trim(),
            status: "pending",
            is_active: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        
        error = insertError;
      }

      if (error) throw error;

      // Update user type in users table if needed (optional)
      const { error: userUpdateError } = await supabase
        .from("users")
        .update({ 
          user_type: "driver",
          updated_at: new Date().toISOString()
        })
        .eq("id", userId);

      if (userUpdateError) {
        console.log("User type update error:", userUpdateError);
        // Don't throw, continue with navigation
      }

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
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            
            <TextInput
              style={[styles.input, { backgroundColor: "#eee" }]}
              placeholder="Phone Number"
              value={phone}
              editable={false}
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