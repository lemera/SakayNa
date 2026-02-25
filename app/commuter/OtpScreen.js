// OtpScreen.js
import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from "react-native";
import { styles } from "../styles/OtpStyles";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase"; // Make sure supabase client is initialized

export default function OtpScreen({ route, navigation }) {
  const { phone } = route.params;
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [otpPressed, setOtpPressed] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputs = useRef([]);

  const handleChange = (text, index) => {
    if (!/^\d*$/.test(text)) return;

    const newCode = [...code];

    if (text === "") {
      newCode[index] = "";
      setCode(newCode);
      if (index > 0) inputs.current[index - 1].focus();
      return;
    }

    newCode[index] = text;
    setCode(newCode);

    if (index < 5) inputs.current[index + 1].focus();
  };

  const handleVerify = async () => {
    const pin = code.join("");
    if (pin.length !== 6) {
      Alert.alert("Invalid code", "Please enter the 6-digit code.");
      return;
    }

    setLoading(true);

    try {
      // ✅ Call Edge Function to verify OTP
      const res = await fetch("https://your-edge-function-url/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp: pin }),
      });

      const result = await res.json();

      if (!result.success) {
        Alert.alert("Verification Failed", result.message || "Incorrect OTP");
        return;
      }

      const userId = result.user?.id;
      if (!userId) {
        Alert.alert("Error", "Could not get user ID after OTP verification");
        return;
      }

      // ✅ Check if the user is already registered in `commuters`
      const { data: commuter, error: commuterError } = await supabase
        .from("commuters")
        .select("*")
        .eq("id", userId)
        .single();

      if (commuterError && commuterError.code !== "PGRST116") {
        throw commuterError;
      }

      if (commuter) {
        // Already registered → navigate to HomePage
        Alert.alert("Welcome Back!", "You are logged in successfully.", [
          { text: "OK", onPress: () => navigation.replace("HomePage") },
        ]);
      } else {
        // Not registered → navigate to CommuterDetails
        navigation.replace("CommuterDetails", { userId, phone });
      }
    } catch (err) {
      Alert.alert("Verification Error", err.message || "Something went wrong");
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
            style={{ position: "absolute", top: 50, left: 20 }}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={28} color="#183B5C" />
          </Pressable>

          <Image
            source={require("../../assets/logo-sakayna.png")}
            style={styles.logo}
          />

          <Text style={styles.title}>We sent a message with a code</Text>
          <Text style={styles.subtitle}>to {phone}</Text>

          {/* OTP Inputs */}
          <View style={styles.otpContainer}>
            {code.map((digit, index) => (
              <TextInput
                key={index}
                ref={(ref) => (inputs.current[index] = ref)}
                style={styles.otpInput}
                keyboardType="number-pad"
                maxLength={1}
                value={digit}
                onChangeText={(text) => handleChange(text, index)}
              />
            ))}
          </View>

          <Pressable
            onPress={handleVerify}
            onPressIn={() => setOtpPressed(true)}
            onPressOut={() => setOtpPressed(false)}
            disabled={loading}
            style={[
              styles.button,
              {
                backgroundColor: otpPressed ? "#E97A3E" : "#183B5C",
                opacity: loading ? 0.7 : 1,
              },
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Verify</Text>
            )}
          </Pressable>

          <Text style={styles.resend}>
            Didn’t receive code? <Text style={styles.resendLink}>Resend</Text>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}