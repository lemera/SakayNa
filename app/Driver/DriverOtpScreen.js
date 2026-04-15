// DriverOtpScreen.js
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
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { registerForPushNotifications } from "../../lib/notifications";

export default function OtpScreen({ route, navigation }) {
  const { phone, userType } = route.params;

  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [otpPressed, setOtpPressed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(60);

  const inputs = useRef([]);
  const hasAutoVerified = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const joined = code.join("");
    if (joined.length === 6 && !code.includes("") && !loading && !hasAutoVerified.current) {
      hasAutoVerified.current = true;
      handleVerify(joined);
    }

    if (joined.length < 6) {
      hasAutoVerified.current = false;
    }
  }, [code, loading]);

  const fillOtpFromString = (value) => {
    const digitsOnly = (value || "").replace(/\D/g, "").slice(0, 6);

    if (!digitsOnly) return;

    const newCode = ["", "", "", "", "", ""];
    for (let i = 0; i < digitsOnly.length; i++) {
      newCode[i] = digitsOnly[i];
    }

    setCode(newCode);

    if (digitsOnly.length < 6) {
      inputs.current[digitsOnly.length]?.focus();
    } else {
      inputs.current[5]?.blur();
    }
  };

  const handleChange = (text, index) => {
    const digitsOnly = text.replace(/\D/g, "");

    // Support full OTP paste into any box
    if (digitsOnly.length > 1) {
      fillOtpFromString(digitsOnly);
      return;
    }

    const newCode = [...code];
    newCode[index] = digitsOnly;
    setCode(newCode);

    if (digitsOnly && index < 5) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = ({ nativeEvent }, index) => {
    if (nativeEvent.key === "Backspace") {
      if (code[index]) {
        const newCode = [...code];
        newCode[index] = "";
        setCode(newCode);
        return;
      }

      if (index > 0) {
        const newCode = [...code];
        newCode[index - 1] = "";
        setCode(newCode);
        inputs.current[index - 1]?.focus();
      }
    }
  };

  const handleVerify = async (overridePin = null) => {
    if (loading) return;

    const pin = overridePin || code.join("");

    if (pin.length !== 6) {
      Alert.alert("Invalid code", "Please enter the 6-digit code.");
      return;
    }

    setLoading(true);

    try {
      const data = await verifyOtp(phone, pin, userType);

      if (!data?.success) {
        throw new Error(data?.error || "OTP verification failed");
      }

      const user = data.user;

      if (!user?.id || !user?.phone || !user?.user_type) {
        throw new Error("Invalid user data returned after OTP verification.");
      }

      await AsyncStorage.setItem("user_id", String(user.id));
      await AsyncStorage.setItem("user_phone", String(user.phone));
      await AsyncStorage.setItem("user_type", String(user.user_type));

      console.log(`✅ OTP Verified - User: ${user.id} (${user.user_type})`);

      if (user.user_type === "driver") {
        try {
          console.log("🚀 Registering Expo Push Token for Driver...");
          const token = await registerForPushNotifications(user.id);

          if (token) {
            console.log("✅ Push token successfully registered for driver");
          } else {
            console.warn("⚠️ Push token registration returned null");
          }
        } catch (pushErr) {
          console.warn("⚠️ Push registration failed:", pushErr?.message || pushErr);
        }
      }

      if (user.user_type === "driver") {
        const { data: driver, error: driverError } = await supabase
          .from("drivers")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();

        if (driverError) throw driverError;

        if (driver) {
          navigation.replace("DriverHomePage");
        } else {
          navigation.replace("DriverDetails");
        }
      } else {
        const { data: commuter, error: commuterError } = await supabase
          .from("commuters")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();

        if (commuterError) throw commuterError;

        if (commuter) {
          navigation.replace("HomePage");
        } else {
          navigation.replace("CommuterDetails");
        }
      }
    } catch (err) {
      hasAutoVerified.current = false;
      Alert.alert("Verification Failed", err?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0 || resending || loading) return;

    try {
      setResending(true);
      await sendOtp(phone, userType);
      setCode(["", "", "", "", "", ""]);
      hasAutoVerified.current = false;
      inputs.current[0]?.focus();
      setCountdown(60);
      Alert.alert("Resent", "A new OTP has been sent to your phone.");
    } catch (err) {
      Alert.alert("Error", err?.message || "Failed to resend OTP.");
    } finally {
      setResending(false);
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
            style={{ position: "absolute", top: 50, left: 20, zIndex: 10 }}
            onPress={() => {
              if (!loading && !resending) navigation.goBack();
            }}
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
                keyboardType={Platform.OS === "ios" ? "number-pad" : "numeric"}
                textContentType="oneTimeCode"
                autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
                importantForAutofill="yes"
                returnKeyType="done"
                maxLength={6}
                value={digit}
                onChangeText={(text) => handleChange(text, index)}
                onKeyPress={(e) => handleKeyPress(e, index)}
                editable={!loading && !resending}
                selectTextOnFocus
              />
            ))}
          </View>

          <Text
            style={{
              fontSize: 13,
              color: "#666",
              textAlign: "center",
              marginTop: 10,
              marginBottom: 18,
            }}
          >
            You can paste the full 6-digit OTP into any box.
          </Text>

          <Pressable
            onPress={() => handleVerify()}
            disabled={loading || resending}
            style={[
              styles.button,
              {
                backgroundColor: otpPressed ? "#E97A3E" : "#183B5C",
                opacity: loading || resending ? 0.7 : 1,
              },
            ]}
            onPressIn={() => setOtpPressed(true)}
            onPressOut={() => setOtpPressed(false)}
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
            ) : (
              <Text
                style={[
                  styles.resendLink,
                  { opacity: resending || loading ? 0.5 : 1 },
                ]}
                onPress={handleResend}
              >
                {resending ? "Sending..." : "Resend"}
              </Text>
            )}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}