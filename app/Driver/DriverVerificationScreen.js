import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  Alert,
  ActivityIndicator,
  TextInput,
  StyleSheet,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

export default function DriverVerificationScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  const [expiryDate, setExpiryDate] = useState(null);
  const [showPicker, setShowPicker] = useState(false);

  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");

  const [licenseFront, setLicenseFront] = useState(null);
  const [licenseBack, setLicenseBack] = useState(null);
  const [selfie, setSelfie] = useState(null);
  const [orcr, setOrcr] = useState(null);

  useEffect(() => {
    fetchStatus();
  }, []);

  // ================= FETCH STATUS =================
  const fetchStatus = async () => {
    try {
      const userId = await AsyncStorage.getItem("user_id");
      if (!userId) return;

      const { data } = await supabase
        .from("drivers")
        .select("status")
        .eq("id", userId)
        .single();

      if (data) setStatus(data.status);
    } catch (err) {
      console.log("Status error:", err.message);
    }
  };

  // ================= IMAGE PICKER =================
  const openPickerOptions = (setter) => {
    Alert.alert("Upload Document", "Choose option", [
      { text: "Take Photo", onPress: () => takePhoto(setter) },
      { text: "Upload from Gallery", onPress: () => pickFromGallery(setter) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const takePhoto = async (setter) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: true,
    });

    if (!result.canceled) setter(result.assets[0].uri);
  };

  const pickFromGallery = async (setter) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.7,
      allowsEditing: true,
    });

    if (!result.canceled) setter(result.assets[0].uri);
  };

  // ================= UPLOAD =================
  const uploadImage = async (uri, path) => {
    const response = await fetch(uri);
    const blob = await response.blob();

    const { error } = await supabase.storage
      .from("driver-documents")
      .upload(path, blob, {
        upsert: true,
        contentType: "image/jpeg",
      });

    if (error) throw error;

    const { data } = supabase.storage
      .from("driver-documents")
      .getPublicUrl(path);

    return data.publicUrl;
  };

  // ================= SUBMIT =================
  const handleSubmit = async () => {
    if (loading) return;

    if (
      !licenseNumber ||
      !licenseExpiry ||
      !plateNumber ||
      !vehicleType ||
      !licenseFront ||
      !licenseBack ||
      !selfie ||
      !orcr
    ) {
      Alert.alert("Incomplete", "Please complete all fields.");
      return;
    }

    try {
      setLoading(true);

      const userId = await AsyncStorage.getItem("user_id");
      if (!userId) throw new Error("User not found");

      const frontUrl = await uploadImage(
        licenseFront,
        `licenses/${userId}_front.jpg`,
      );

      const backUrl = await uploadImage(
        licenseBack,
        `licenses/${userId}_back.jpg`,
      );

      const selfieUrl = await uploadImage(selfie, `selfies/${userId}.jpg`);

      const orcrUrl = await uploadImage(orcr, `vehicles/${userId}_orcr.jpg`);

      await supabase.from("driver_documents").upsert(
        {
          driver_id: userId,
          license_number: licenseNumber.trim(),
          license_expiry_date: licenseExpiry,
          license_front_url: frontUrl,
          license_back_url: backUrl,
          selfie_with_id_url: selfieUrl,
          submitted_at: new Date(),
        },
        { onConflict: "driver_id" },
      );

      await supabase.from("driver_vehicles").upsert(
        {
          driver_id: userId,
          plate_number: plateNumber.trim().toUpperCase(),
          vehicle_type: vehicleType,
          vehicle_color: vehicleColor,
          orcr_image_url: orcrUrl,
          updated_at: new Date(),
        },
        { onConflict: "driver_id" },
      );

      await supabase
        .from("drivers")
        .update({ status: "under_review" })
        .eq("id", userId);

      setStatus("under_review");

      Alert.alert("Success", "Submitted for review.");
      navigation.navigate("DriverHomePage");
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  const progress =
    [
      licenseFront,
      licenseBack,
      selfie,
      orcr,
      licenseNumber,
      licenseExpiry,
      plateNumber,
      vehicleType,
    ].filter(Boolean).length / 8;

  // ================= COMPONENTS =================
  const renderModernInput = (label, value, setter) => (
    <View style={styles.inputWrapper}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={setter}
        placeholder={label}
        style={[styles.input, value?.length > 0 && styles.inputFilled]}
      />
    </View>
  );

  const renderModernImageCard = (title, image, setter) => (
    <Pressable
      style={[styles.uploadCard, image && styles.uploadCardFilled]}
      onPress={() => openPickerOptions(setter)}
    >
      {image ? (
        <>
          <Image source={{ uri: image }} style={styles.uploadPreview} />
          <View style={styles.overlay}>
            <Text style={styles.overlayText}>Replace</Text>
          </View>
          <View style={styles.checkBadge}>
            <Text style={styles.checkText}>✓</Text>
          </View>
        </>
      ) : (
        <View style={styles.uploadPlaceholder}>
          <Text style={styles.uploadIcon}>＋</Text>
          <Text style={styles.uploadLabel}>{title}</Text>
        </View>
      )}
    </Pressable>
  );

  // ================= UI =================
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.header,
            { flexDirection: "row", alignItems: "center" },
          ]}
        >
          <Pressable onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} paddingBottom={40} color="#183B5C" />
          </Pressable>

          <View style={{ flex: 1, alignItems: "center", marginRight: 24 }}>
            <Text style={styles.title}>Driver verification muna, bes!</Text>
            <Text style={styles.subtitle}>
              Need lang kompletohin lahat ng required fields para ma-activate na yung driver account mo. Go na, saglit lang 'to!
            </Text>
          </View>
        </View>
        {status && (
          <View style={styles.statusWrapper}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>{status}</Text>
          </View>
        )}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>License Details</Text>

          {renderModernInput("License Number", licenseNumber, setLicenseNumber)}

          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>License Expiry</Text>

            <Pressable
              style={styles.dateInput}
              onPress={() => setShowPicker(true)}
            >
              <Text
                style={[styles.dateText, !expiryDate && { color: "#9AA4B2" }]}
              >
                {expiryDate
                  ? expiryDate.toISOString().split("T")[0]
                  : "Select expiry date"}
              </Text>
            </Pressable>

            {showPicker && (
              <DateTimePicker
                value={expiryDate || new Date()}
                mode="date"
                minimumDate={new Date()}
                onChange={(event, selectedDate) => {
                  setShowPicker(false);
                  if (selectedDate) {
                    setExpiryDate(selectedDate);
                    setLicenseExpiry(selectedDate.toISOString().split("T")[0]);
                  }
                }}
              />
            )}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Vehicle Details</Text>

          {renderModernInput("Plate Number", plateNumber, setPlateNumber)}
          {renderModernInput("Vehicle Color", vehicleColor, setVehicleColor)}

          <View style={styles.segmentedControl}>
  {[
    { label: "2-Wheel (Motorcycle)", value: "2wheel" },
    { label: "3-Wheel (Tricycle)", value: "3wheel" },
  ].map((item) => (
    <Pressable
      key={item.value}
      style={[
        styles.segmentButton,
        vehicleType === item.value && styles.segmentActive,
      ]}
      onPress={() => setVehicleType(item.value)}
    >
      <Text
        style={[
          styles.segmentText,
          vehicleType === item.value && styles.segmentTextActive,
        ]}
      >
        {item.label}
      </Text>
    </Pressable>
  ))}
</View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Required Documents</Text>

          <View style={styles.uploadGrid}>
            {renderModernImageCard(
              "License Front",
              licenseFront,
              setLicenseFront,
            )}
            {renderModernImageCard("License Back", licenseBack, setLicenseBack)}
            {renderModernImageCard("Selfie with ID", selfie, setSelfie)}
            {renderModernImageCard("OR/CR Document", orcr, setOrcr)}
          </View>
        </View>

        <View style={styles.progressContainer}>
          <Text style={styles.progressLabel}>
            Completion {Math.round(progress * 100)}%
          </Text>

          <View style={styles.progressBar}>
            <View
              style={[styles.progressFill, { width: `${progress * 100}%` }]}
            />
          </View>
        </View>
      </ScrollView>

      <View style={[styles.ctaWrapper, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={[styles.button, progress < 1 && { opacity: 0.6 }]}
          disabled={progress < 1 || loading}
          onPress={handleSubmit}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Ready na? Submit!</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F2F4F8",
  },

  scroll: {
    padding: 20,
    paddingBottom: 150,
  },

  header: {
    marginBottom: 24,
  },

  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#111",
  },

  subtitle: {
    fontSize: 14,
    color: "#666",
    marginTop: 6,
  },

  sectionCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 18,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 4,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 14,
    color: "#333",
  },

  input: {
    backgroundColor: "#F7F9FC",
    padding: 16,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E3E8EF",
    fontSize: 14,
  },

  segmentedControl: {
    flexDirection: "row",
    backgroundColor: "#F0F3F7",
    borderRadius: 12,
    padding: 4,
    marginTop: 10,
  },

  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },

  segmentActive: {
    backgroundColor: "#183B5C",
  },

  segmentText: {
    fontSize: 13,
    color: "#555",
  },

  segmentTextActive: {
    color: "#fff",
    fontWeight: "600",
  },

  progressContainer: {
    marginTop: 10,
  },

  progressLabel: {
    fontSize: 13,
    color: "#555",
    marginBottom: 8,
  },

  progressBar: {
    height: 10,
    backgroundColor: "#E3E8EF",
    borderRadius: 20,
    overflow: "hidden",
  },

  progressFill: {
    height: 10,
    backgroundColor: "#183B5C",
  },

  ctaWrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    backgroundColor: "rgba(255,255,255,0.95)",
  },

  button: {
    backgroundColor: "#183B5C",
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: "center",
    shadowColor: "#183B5C",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },

  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },

  statusWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF6E5",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 50,
    alignSelf: "flex-start",
    marginBottom: 20,
  },

  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 8,
    backgroundColor: "#FFA500",
    marginRight: 8,
  },

  statusText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#A15C00",
  },
  inputWrapper: {
    marginBottom: 16,
  },

  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#667085",
    marginBottom: 6,
  },

  input: {
    backgroundColor: "#F7F9FC",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E3E8EF",
    fontSize: 14,
  },

  inputFilled: {
    borderColor: "#183B5C",
  },
  dateInput: {
    backgroundColor: "#F7F9FC",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E3E8EF",
  },

  dateText: {
    fontSize: 14,
    color: "#111",
  },
  uploadGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },

  uploadCard: {
    width: "48%",
    height: 140,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#D0D5DD",
    backgroundColor: "#FAFBFC",
    marginBottom: 15,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },

  uploadCardFilled: {
    borderStyle: "solid",
    borderColor: "#183B5C",
  },

  uploadPlaceholder: {
    alignItems: "center",
  },

  uploadIcon: {
    fontSize: 26,
    color: "#98A2B3",
    marginBottom: 6,
  },

  uploadLabel: {
    fontSize: 12,
    textAlign: "center",
    color: "#667085",
  },

  uploadPreview: {
    width: "100%",
    height: "100%",
  },

  overlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
    padding: 6,
    alignItems: "center",
  },

  overlayText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },

  checkBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#12B76A",
    width: 22,
    height: 22,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },

  checkText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",

}
});
