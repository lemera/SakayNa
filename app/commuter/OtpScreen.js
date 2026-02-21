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
} from "react-native";
import { styles } from "../styles/OtpStyles";
import { Ionicons } from "@expo/vector-icons";

export default function OtpScreen({ route, navigation }) {
  const { phone } = route.params;
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [otpPressed, setOtpPressed] = useState(false);
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

  // ✅ TEMPORARY NAVIGATION
  const handleVerify = () => {
    navigation.navigate("CommuterDetails"); // <-- Temporary screen
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

          {/* TEMPORARY VERIFY BUTTON */}
          <Pressable
            onPress={handleVerify}
            onPressIn={() => setOtpPressed(true)}
            onPressOut={() => setOtpPressed(false)}
            style={[
              styles.button,
              {
                backgroundColor: otpPressed ? "#E97A3E" : "#183B5C",
              },
            ]}
          >
            <Text style={styles.buttonText}>Verify</Text>
          </Pressable>

          <Text style={styles.resend}>
            Didn’t receive code? <Text style={styles.resendLink}>Resend</Text>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
