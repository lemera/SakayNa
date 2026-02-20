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
import { styles } from "../styles/CommuterDetailsStyles";
import { Ionicons } from "@expo/vector-icons";

export default function CommuterDetails({ navigation }) {
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [buttonPressed, setButtonPressed] = useState(false);

  const handleNext = () => {
    if (!firstName || !lastName || !email) {
      Alert.alert("Missing Fields", "Please fill in all required fields.");
      return;
    }

    const emailRegex = /\S+@\S+\.\S+/;
    if (!emailRegex.test(email)) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }
navigation.navigate("HomePage");
    navigation.navigate("NextScreen", { firstName, middleName, lastName, email });
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
          {/* BACK BUTTON */}
          <Pressable
            style={{ position: "absolute", top: 50, left: 20 }}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={28} color="#183B5C" />
          </Pressable>

          {/* LOGO */}
          <Image
            source={require("../../assets/logo-sakayna.png")}
            style={styles.logo}
          />

          {/* TITLE */}
          <Text style={styles.title}>Enter Your Details</Text>

          {/* SUBTITLE */}
          <Text style={styles.subtitle}>
            Please provide your information to continue.
          </Text>

          {/* INPUT FIELDS */}
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

          {/* NEXT BUTTON WITH HOVER */}
          <Pressable
            onPress={handleNext}
            onPressIn={() => setButtonPressed(true)}
            onPressOut={() => setButtonPressed(false)}
            
            style={[
              styles.button,
              { backgroundColor: buttonPressed ? "#E97A3E" : "#183B5C", marginTop: 20 },
            ]}
          >
            <Text style={styles.buttonText}>Next</Text>
            
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}