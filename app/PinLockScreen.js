import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  StyleSheet,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import * as LocalAuthentication from "expo-local-authentication";

export default function PinLockScreen({ navigation }) {
  const [pin, setPin] = useState("");
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    handleBiometric();
  }, []);

  const handleBiometric = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return;

    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) return;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock SakayNa",
      fallbackLabel: "Use PIN",
    });

    if (result.success) {
      navigation.replace("Splash");
    }
  };

  const verifyPin = async () => {
    const savedPin = await SecureStore.getItemAsync("user_pin");

    if (pin === savedPin) {
      navigation.replace("Splash");
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);

      if (newAttempts >= 3) {
        await SecureStore.deleteItemAsync("user_pin");
        await SecureStore.deleteItemAsync("pin_enabled");
        Alert.alert("Too many attempts", "Please login again.");
        navigation.replace("UserType");
      } else {
        Alert.alert("Wrong PIN");
      }
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter PIN</Text>

      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={6}
        value={pin}
        onChangeText={setPin}
      />

      <Pressable style={styles.button} onPress={verifyPin}>
        <Text style={styles.buttonText}>Unlock</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 30 },
  input: {
    width: 200,
    height: 60,
    borderWidth: 1,
    textAlign: "center",
    fontSize: 22,
    borderRadius: 10,
    marginBottom: 20,
  },
  button: {
    backgroundColor: "#183B5C",
    padding: 15,
    borderRadius: 10,
  },
  buttonText: { color: "#fff", fontWeight: "bold" },
});