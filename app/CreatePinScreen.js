import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  StyleSheet,
} from "react-native";

export default function CreatePinScreen({ navigation }) {
  const [pin, setPin] = useState(["", "", "", "", "", ""]);
  const inputs = useRef([]);

  const handleChange = (text, index) => {
    if (!/^\d*$/.test(text)) return;

    const newPin = [...pin];
    newPin[index] = text;
    setPin(newPin);

    if (text && index < 5) {
      inputs.current[index + 1].focus();
    }
  };

  const handleNext = () => {
    const joinedPin = pin.join("");

    if (joinedPin.length !== 6) {
      Alert.alert("Invalid PIN", "PIN must be 6 digits.");
      return;
    }

    navigation.navigate("ConfirmPinScreen", { firstPin: joinedPin });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create 6-Digit PIN</Text>

      <View style={styles.pinContainer}>
        {pin.map((digit, index) => (
          <TextInput
            key={index}
            ref={(ref) => (inputs.current[index] = ref)}
            style={styles.pinInput}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={1}
            value={digit}
            onChangeText={(text) => handleChange(text, index)}
          />
        ))}
      </View>

      <Pressable style={styles.button} onPress={handleNext}>
        <Text style={styles.buttonText}>Continue</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 30 },
  pinContainer: { flexDirection: "row", gap: 10 },
  pinInput: {
    width: 50,
    height: 60,
    borderWidth: 1,
    textAlign: "center",
    fontSize: 22,
    borderRadius: 10,
  },
  button: {
    marginTop: 30,
    backgroundColor: "#183B5C",
    padding: 15,
    borderRadius: 10,
  },
  buttonText: { color: "#fff", fontWeight: "bold" },
});