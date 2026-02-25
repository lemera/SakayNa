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
import { verifyOtp } from "../../lib/otp";

export default function OtpScreen({ route, navigation }) {
  const { phone } = route.params;
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [otpPressed, setOtpPressed] = useState(false);
  const [loading, setLoading] = useState(false); // <-- loading state
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
    const result = await verifyOtp(phone, pin);

    if (result.success) {
      // ✅ Save logged-in user info if needed 
      const user = result.user || result.user_id || { id: result.user?.id, phone };
      
      // Optional: store user in local storage / context
      // AsyncStorage.setItem('user', JSON.stringify(user));

      Alert.alert("Success", "OTP verified successfully!", [
        {
          text: "OK",
          onPress: () => navigation.navigate("CommuterDetails", { user }),
        },
      ]);
    } else {
      Alert.alert("Verification Failed", result.message || "Incorrect OTP");
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
            disabled={loading} // disable button during loading
            style={[
              styles.button,
              {
                backgroundColor: otpPressed ? "#E97A3E" : "#183B5C",
                opacity: loading ? 0.7 : 1, // dim when loading
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