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

export default function CommuterDetails({ navigation }) {
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [buttonPressed, setButtonPressed] = useState(false);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        Alert.alert("Error", "You must be logged in to register.");
        navigation.goBack();
      } else {
        setUserId(user.id);
      }
    };
    getUser();
  }, []);

  const handleRegister = async () => {
    if (!firstName || !lastName || !email) {
      Alert.alert("Missing Fields", "Please fill in all required fields.");
      return;
    }

    const emailRegex = /\S+@\S+\.\S+/;
    if (!emailRegex.test(email)) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }

    if (!userId) {
      Alert.alert("Error", "User not authenticated.");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("commuters")
        .insert([
          {
            id: userId,
            first_name: firstName,
            middle_name: middleName,
            last_name: lastName,
            email,
          },
        ]);

      if (error) throw error;

      Alert.alert("Success", "Registration successful!", [
        { text: "OK", onPress: () => navigation.navigate("HomePage") },
      ]);
    } catch (err) {
      Alert.alert(
        "Registration Failed",
        err.message || "Could not register user."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
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
            placeholder="Email Address"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholderTextColor="#999"
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