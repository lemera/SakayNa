// UserTypeScreen.js
import React, { useState } from "react";
import { View, Text, Image, Pressable } from "react-native";
import { styles } from "./styles/UserTypeStyles.js";

export default function UserTypeScreen({ navigation }) {
  const [selectedType, setSelectedType] = useState(null);

  const handleSelect = (type) => {
    setSelectedType(type);

    // Small delay for visual feedback
    setTimeout(() => {
      if (type === "commuter") {
        navigation.navigate("CommuterLogin", { userType: "commuter" });
      } else if (type === "driver") {
        navigation.navigate("DriverLoginScreen", { userType: "driver" });
      }
    }, 150);
  };

  return (
    <View style={styles.container}>
      <Image
        source={require("../assets/logo-sakayna.png")}
        style={[styles.logo, { marginBottom: 20 }]}
        resizeMode="contain"
      />

      <Text style={styles.title}>
        Welcome to{" "}
        <Text style={{ color: "#E97A3E", fontWeight: "bold" }}>
          SakayNa
        </Text>
      </Text>

      <Text style={styles.subtitle}>
        Select a user type to continue
      </Text>

      <View style={styles.buttonRow}>
        {/* Commuter Button */}
        <Pressable
          onPress={() => handleSelect("commuter")}
          style={[
            styles.button,
            {
              backgroundColor:
                selectedType === "commuter" ? "#E97A3E" : "#183B5C",
              marginRight: 10,
            },
          ]}
        >
          <Text style={styles.buttonText}>Commuter</Text>
        </Pressable>

        {/* Driver Button */}
        <Pressable
          onPress={() => handleSelect("driver")}
          style={[
            styles.button,
            {
              backgroundColor:
                selectedType === "driver" ? "#183B5C" : "#E97A3E",
              marginLeft: 10,
            },
          ]}
        >
          <Text style={styles.buttonText}>Driver</Text>
        </Pressable>
      </View>
    </View>
  );
}