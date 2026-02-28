import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  StyleSheet,
} from "react-native";
import * as SecureStore from "expo-secure-store";

export default function ConfirmPinScreen({ route, navigation }) {
  const { firstPin } = route.params;

  const [pin, setPin] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const inputs = useRef([]);

  const handleChange = (text, index) => {
    if (!/^\d*$/.test(text)) return;

    const newPin = [...pin];

    if (text === "") {
      newPin[index] = "";
      setPin(newPin);
      if (index > 0) inputs.current[index - 1]?.focus();
      return;
    }

    newPin[index] = text;
    setPin(newPin);

    if (index < 5) {
      inputs.current[index + 1]?.focus();
    }
  };

const handleConfirm = async () => {
  const joinedPin = pin.join("");

  if (joinedPin.length !== 6) {
    Alert.alert("Invalid PIN");
    return;
  }

  if (joinedPin !== firstPin) {
    Alert.alert("PIN does not match");
    return;
  }

  try {
    await SecureStore.setItemAsync("user_pin", joinedPin, {
      requireAuthentication: false,
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });

    // VERY IMPORTANT
    const check = await SecureStore.getItemAsync("user_pin");
    console.log("Saved PIN:", check);

    navigation.replace("Splash");

  } catch (err) {
    console.log(err);
  }
};

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Confirm PIN</Text>

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

      <Pressable
        style={[
          styles.button,
          { opacity: loading ? 0.6 : 1 }
        ]}
        onPress={handleConfirm}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? "Saving..." : "Confirm"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 30,
  },
  pinContainer: {
    flexDirection: "row",
    gap: 10,
  },
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
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
  },
});