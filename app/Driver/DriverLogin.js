// DriverLogin.js
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
  ActivityIndicator,
} from "react-native";
import { styles } from "../styles/LoginStyles";
import { Ionicons } from "@expo/vector-icons";
import { TEST_ACCOUNTS, isTestAccount, getUserTypeFromTestAccount } from "../config/testAccounts";
import { saveUserSession } from "../utils/authStorage";

export default function DriverLogin({ navigation }) {
  const [phone, setPhone] = useState("");
  const [otpPressed, setOtpPressed] = useState(false);
  const [loading, setLoading] = useState(false);

  const formatPhoneNumber = (input) => {
    let cleaned = input.replace(/\D/g, "");
    if (cleaned.startsWith("0")) cleaned = cleaned.substring(1);
    cleaned = cleaned.substring(0, 10);

    if (cleaned.length >= 7)
      return cleaned.replace(/(\d{3})(\d{3})(\d{0,4})/, "$1 $2 $3");
    else if (cleaned.length >= 4)
      return cleaned.replace(/(\d{3})(\d{0,3})/, "$1 $2");

    return cleaned;
  };

  const handleChange = (text) => setPhone(formatPhoneNumber(text));

  const handleLogin = async () => {
    const raw = phone.replace(/\s/g, "");

    if (raw.length !== 10) {
      Alert.alert("Invalid Number", "Please enter a valid PH number.");
      return;
    }

    setLoading(true);

    try {
      const formattedPhone = `+63${raw}`;

      // ✅ Check if test account using centralized function
      if (isTestAccount(formattedPhone)) {
        console.log("✅ Test account detected, skipping OTP");
        
        const userType = getUserTypeFromTestAccount(formattedPhone);
        
        // ✅ Save session for test account
        const userData = {
          phone: formattedPhone,
          userType: userType,
          isTestAccount: true,
          loggedInAt: new Date().toISOString(),
        };
        
        await saveUserSession(userData, true);
        
        setTimeout(() => {
          if (userType === "driver") {
            navigation.replace("DriverHomePage");
          } else if (userType === "commuter") {
            navigation.replace("HomePage");
          }
        }, 500);
        
        setLoading(false);
        return;
      }

      // ✅ Normal flow for non-test accounts
      const response = await fetch(
        "https://riseunullhczomqxkcbn.supabase.co/functions/v1/send_otp",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            phone: formattedPhone,
            role: "driver",
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        Alert.alert("Login Failed", result.error || "Something went wrong.");
        return;
      }

      navigation.navigate("DriverOtpScreen", {
        phone: formattedPhone,
        userType: "driver",
        action: "login",
      });

    } catch (err) {
      Alert.alert("Error", "Failed to connect to server.");
    } finally {
      setLoading(false);
    }
  };

  const rawNumber = phone.replace(/\s/g, "");
  const isValid = rawNumber.length === 10;
  const isTest = isTestAccount(`+63${rawNumber}`);

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

          <Text style={styles.title}>
            Driver Login
          </Text>

          <View style={styles.phoneContainer}>
            <Text style={styles.countryCode}>+63</Text>
            <TextInput
              style={styles.phoneInput}
              placeholder="9XX XXX XXXX"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={handleChange}
              placeholderTextColor="#999"
              maxLength={12}
            />
          </View>

          {/* ✅ Test account indicator */}
          {isTest && rawNumber.length === 10 && (
            <Text style={{ color: '#E97A3E', fontSize: 12, marginTop: 5, marginBottom: 10 }}>
              🔧 Test account detected: OTP will be skipped
            </Text>
          )}

          <Pressable
            onPress={handleLogin}
            onPressIn={() => setOtpPressed(true)}
            onPressOut={() => setOtpPressed(false)}
            disabled={loading || !isValid}
            style={[
              styles.button,
              {
                backgroundColor: otpPressed ? "#E97A3E" : "#183B5C",
                opacity: loading || !isValid ? 0.6 : 1,
              },
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>
                {isTest ? "Login (Test Mode)" : "Verify Number"}
              </Text>
            )}
          </Pressable>

          <Text style={styles.terms}>
            By verifying my phone number, I accept SakayNa{" "}
            <Text
              style={styles.link}
              onPress={() => navigation.navigate("TermsScreen")}
            >
              Terms of Service
            </Text>{" "}
            and{" "}
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