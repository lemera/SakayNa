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
  Clipboard,
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
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(60);

  const inputs = useRef([]);

  // FIX 1: Countdown no longer depends on `countdown` in deps array.
  // Using a ref-based interval so it doesn't restart every second.
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []); // runs only once on mount

  // FIX 2: Paste support — checks clipboard on focus of the first input
  const handlePaste = async () => {
    try {
      const text = await Clipboard.getString();
      const digits = text.replace(/\D/g, "").slice(0, 6);

      if (digits.length === 6) {
        const newCode = digits.split("");
        setCode(newCode);
        // Focus last input after paste
        inputs.current[5]?.focus();
      }
    } catch (_) {
      // Clipboard access failed silently
    }
  };

  // FIX 3: Improved handleChange — correctly handles backspace and auto-advance
  const handleChange = (text, index) => {
    // Strip non-digits
    const digit = text.replace(/\D/g, "");

    // Handle paste: if more than 1 character comes in (some Android keyboards do this)
    if (digit.length > 1) {
      const digits = digit.slice(0, 6);
      const newCode = [...code];
      for (let i = 0; i < digits.length && index + i < 6; i++) {
        newCode[index + i] = digits[i];
      }
      setCode(newCode);
      const nextIndex = Math.min(index + digits.length, 5);
      inputs.current[nextIndex]?.focus();
      return;
    }

    const newCode = [...code];

    if (digit === "") {
      // Backspace: clear current field and move back
      newCode[index] = "";
      setCode(newCode);
      if (index > 0) inputs.current[index - 1]?.focus();
      return;
    }

    newCode[index] = digit;
    setCode(newCode);

    if (index < 5) inputs.current[index + 1]?.focus();
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

      await AsyncStorage.setItem("user_id", user.id);
      await AsyncStorage.setItem("user_phone", user.phone);
      await AsyncStorage.setItem("user_type", user.user_type);

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
    if (countdown > 0 || resending) return;

    setResending(true);

    try {
      await sendOtp(phone, userType);

      setCode(["", "", "", "", "", ""]);
      inputs.current[0]?.focus();
      setCountdown(60);

      Alert.alert("Resent", "OTP has been sent again.");
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setResending(false);
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

          <View style={styles.otpContainer}>
            {code.map((digit, index) => (
              <TextInput
                key={index}
                ref={(ref) => (inputs.current[index] = ref)}
                style={styles.otpInput}
                keyboardType="number-pad"
                maxLength={6} // Allow 6 so paste works on Android; handleChange trims it
                value={digit}
                onChangeText={(text) => handleChange(text, index)}
                // FIX 2: Trigger paste check when first input is focused
                onFocus={index === 0 ? handlePaste : undefined}
                selectTextOnFocus
              />
            ))}
          </View>

          {/* Paste button for manual paste */}
          <Pressable
            onPress={handlePaste}
            style={{
              marginBottom: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Ionicons name="clipboard-outline" size={16} color="#183B5C" />
            <Text style={{ color: "#183B5C", fontSize: 13, fontWeight: "600" }}>
              Paste from clipboard
            </Text>
          </Pressable>

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
            Didn't receive code?{" "}
            {countdown > 0 ? (
              <Text style={styles.resendDisabled}>
                Resend available in {countdown}s
              </Text>
            ) : resending ? (
              <Text style={styles.resendDisabled}>Resending...</Text>
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