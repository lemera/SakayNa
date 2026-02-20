import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { styles } from "../styles/LoginStyles";
import { Ionicons } from "@expo/vector-icons";

export default function CommuterLogin({ navigation }) {
  const [phone, setPhone] = useState("");
  const [otpPressed, setOtpPressed] = useState(false);

  const formatPhoneNumber = (input) => {
    let cleaned = input.replace(/\D/g, "");

    if (cleaned.startsWith("0")) {
      cleaned = cleaned.substring(1);
    }

    cleaned = cleaned.substring(0, 10);

    if (cleaned.length >= 7) {
      return cleaned.replace(/(\d{3})(\d{3})(\d{0,4})/, "$1 $2 $3");
    } else if (cleaned.length >= 4) {
      return cleaned.replace(/(\d{3})(\d{0,3})/, "$1 $2");
    }

    return cleaned;
  };

  const handleChange = (text) => {
    setPhone(formatPhoneNumber(text));
  };

  const handleLogin = () => {
    const raw = phone.replace(/\s/g, "");

    if (raw.length !== 10) {
      Alert.alert("Invalid Number", "Please enter a valid PH number.");
      return;
    }

    navigation.navigate("OtpScreen", {
      phone: `+63${raw}`,
    });
  };

  const rawNumber = phone.replace(/\s/g, "");
  const isValid = rawNumber.length === 10;

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

          <Image
            source={require("../../assets/logo-sakayna.png")}
            style={styles.logo}
          />

          <Text style={styles.title}>Log in using your phone number</Text>

          {/* PHONE INPUT */}
          <View style={styles.phoneContainer}>
            <Text style={styles.countryCode}>+63</Text>

            <TextInput
              style={styles.phoneInput}
              placeholder="9XX XXX XXXX"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={handleChange}
              placeholderTextColor="#999"
            />
          </View>

          {/* VERIFY BUTTON */}
          <Pressable
            onPress={() =>
              navigation.navigate("OtpScreen", {
                phone: "+639709946945", // temporary dummy number
              })
            }
            onPressIn={() => setOtpPressed(true)}
            onPressOut={() => setOtpPressed(false)}
            style={[
              styles.button,
              {
                backgroundColor: otpPressed ? "#E97A3E" : "#183B5C",
              },
            ]}
          >
            <Text style={styles.buttonText}>Verify Number</Text>
          </Pressable>

          <Text style={styles.terms}>
            By verifying my phone number, I accept SakayNa{" "}
            <Text
              style={styles.link}
              onPress={() => navigation.navigate("TermsScreen")}
            >
              Terms of Service
            </Text>{" "}
            and the{" "}
            <Text
              style={styles.link}
              onPress={() => navigation.navigate("PrivacyScreen")}
            >
              Personal Data Processing Policy
            </Text>
            .
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
