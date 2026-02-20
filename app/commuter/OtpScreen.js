import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Image,
} from "react-native";
import { styles } from "../styles/OtpStyles";

export default function OtpScreen({ route, navigation }) {
  const { phone } = route.params;
  const [code, setCode] = useState(["", "", "", "", "", ""]);

  const inputs = useRef([]);

  const handleChange = (text, index) => {
    // Only allow numbers
    if (!/^\d*$/.test(text)) return;

    const newCode = [...code];

    // If deleting
    if (text === "") {
      newCode[index] = "";
      setCode(newCode);

      // Move focus to previous box when deleting
      if (index > 0) {
        inputs.current[index - 1].focus();
      }
      return;
    }

    // If typing
    newCode[index] = text;
    setCode(newCode);

    // Move to next box
    if (index < 5) {
      inputs.current[index + 1].focus();
    }
  };

  const handleVerify = () => {
    const finalCode = code.join("");

    if (finalCode.length !== 6) {
      Alert.alert("Invalid Code", "Please enter the 6-digit code.");
      return;
    }

    Alert.alert("Success", "Phone Verified!");
    // navigation.replace('Home');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={styles.container}>
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

          <Pressable style={styles.button} onPress={handleVerify}>
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

