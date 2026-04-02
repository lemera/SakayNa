// commuterOtpScreen.js
import React, { useState, useRef, useEffect } from "react";
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
import { verifyOtp, sendOtp } from "../../lib/otp";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function OtpScreen({ route, navigation }) {
  const { phone, userType } = route.params;

  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [otpPressed, setOtpPressed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0); // 👈 Add countdown state

  const inputs = useRef([]);

  // 👇 Countdown effect
  useEffect(() => {
    let timer;
    if (countdown > 0) {
      timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

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
      const data = await verifyOtp(phone, pin, userType);

      if (!data.success) {
        throw new Error(data.error || "OTP verification failed");
      }

      const user = data.user;

      // ✅ SAVE SESSION LOCALLY
      await AsyncStorage.setItem("user_id", user.id);
      await AsyncStorage.setItem("user_phone", user.phone);
      await AsyncStorage.setItem("user_type", user.user_type);

      // 🔥 Navigate based on type
      if (user.user_type === "commuter") {
        navigation.replace("CommuterDetails");
      } else {
        navigation.replace("DriverDetails");
      }
    } catch (err) {
      Alert.alert("Verification Failed", err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return; // 👈 Prevent resend if countdown active

    try {
      await sendOtp(phone, userType);

      // ✅ CLEAR OLD INPUTS
      setCode(["", "", "", "", "", ""]);
      inputs.current[0]?.focus();

      // 👇 Start 60-second countdown
      setCountdown(60);

      Alert.alert("Resent", "OTP has been sent again.");
    } catch (err) {
      Alert.alert("Error", err.message);
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

          <Text style={styles.title}>We sent a code to your phone</Text>
          <Text style={styles.subtitle}>{phone}</Text>

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

          {/* 👇 Updated Resend Text with Countdown */}
          <Text style={styles.resend}>
            Didn't receive code?{" "}
            {countdown > 0 ? (
              <Text style={styles.resendDisabled}>
                Resend available in {countdown}s
              </Text>
            ) : (
              <Text style={styles.resendLink} onPress={handleResend}>
                Resend
              </Text>
            )}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}