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
  Platform,
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
import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

// Add logging helper
const log = {
  info: (message, data = null) => {
    console.log(`[INFO] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  error: (message, error = null) => {
    console.error(`[ERROR] ${message}`, error ? error : '');
  },
  debug: (message, data = null) => {
    if (__DEV__) {
      console.log(`[DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
  },
  warn: (message, data = null) => {
    console.warn(`[WARN] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }
};

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

  // Validation states
  const [validationErrors, setValidationErrors] = useState({});
  const [uploadProgress, setUploadProgress] = useState({});

  useEffect(() => {
    log.info("DriverVerificationScreen mounted");
    fetchStatus();
    checkPermissions();
  }, []);

  // ================= CHECK PERMISSIONS =================
  const checkPermissions = async () => {
    log.debug("Checking permissions");
    try {
      const cameraPermission = await ImagePicker.getCameraPermissionsAsync();
      const mediaPermission = await ImagePicker.getMediaLibraryPermissionsAsync();
      
      log.info("Permission status", {
        camera: cameraPermission.status,
        media: mediaPermission.status
      });
    } catch (err) {
      log.error("Error checking permissions", err);
    }
  };

  // ================= FETCH STATUS =================
  const fetchStatus = async () => {
    log.info("Fetching driver status");
    try {
      const userId = await AsyncStorage.getItem("user_id");
      log.debug("User ID from storage", { userId });
      
      if (!userId) return;

      const { data, error } = await supabase
        .from("drivers")
        .select("status")
        .eq("id", userId)
        .single();

      if (error) {
        log.error("Supabase error fetching status", error);
        return;
      }

      log.info("Driver status fetched", { status: data?.status });
      if (data) setStatus(data.status);
    } catch (err) {
      log.error("Status error:", err.message);
    }
  };

  // ================= IMAGE PICKER WITH COMPRESSION =================
  const compressImage = async (uri) => {
    try {
      log.debug("Compressing image", { uri });
      
      // Compress image to reduce size
      const manipulatedImage = await manipulateAsync(
        uri,
        [{ resize: { width: 1024 } }], // Resize to max width 1024px
        { compress: 0.7, format: SaveFormat.JPEG }
      );
      
      log.debug("Image compressed", { 
        originalUri: uri,
        compressedUri: manipulatedImage.uri
      });
      
      return manipulatedImage.uri;
    } catch (err) {
      log.error("Error compressing image", err);
      return uri; // Return original if compression fails
    }
  };

  const openPickerOptions = (setter, fieldName) => {
    log.debug("Opening picker options", { fieldName });
    Alert.alert("Upload Document", "Choose option", [
      { text: "Take Photo", onPress: () => takePhoto(setter, fieldName) },
      { text: "Upload from Gallery", onPress: () => pickFromGallery(setter, fieldName) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const takePhoto = async (setter, fieldName) => {
    log.debug("Taking photo", { fieldName });
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      
      if (!permission.granted) {
        Alert.alert("Permission required", "Please grant camera permission to take photos");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        allowsEditing: true,
        base64: false,
      });

      if (!result.canceled && result.assets[0]) {
        let uri = result.assets[0].uri;
        
        // Compress the image
        const compressedUri = await compressImage(uri);
        
        log.info("Photo captured", { fieldName, uri: compressedUri });
        setter(compressedUri);
        setValidationErrors(prev => ({ ...prev, [fieldName]: null }));
      }
    } catch (err) {
      log.error("Error taking photo", err);
      Alert.alert("Error", "Failed to take photo: " + err.message);
    }
  };

  const pickFromGallery = async (setter, fieldName) => {
    log.debug("Picking from gallery", { fieldName });
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permission.granted) {
        Alert.alert("Permission required", "Please grant gallery permission to upload photos");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        quality: 0.7,
        allowsEditing: true,
        base64: false,
      });

      if (!result.canceled && result.assets[0]) {
        let uri = result.assets[0].uri;
        
        // Compress the image
        const compressedUri = await compressImage(uri);
        
        log.info("Image selected", { fieldName, uri: compressedUri });
        setter(compressedUri);
        setValidationErrors(prev => ({ ...prev, [fieldName]: null }));
      }
    } catch (err) {
      log.error("Error picking from gallery", err);
      Alert.alert("Error", "Failed to select image: " + err.message);
    }
  };

  // ================= UPLOAD FUNCTION WITH MODERN FILESYSTEM API =================
  const uploadImage = async (uri, path) => {
    log.info("Uploading image", { path });
    
    if (!uri) {
      throw new Error("No image URI provided");
    }
    
    try {
      // Create a File instance from the URI using modern API
      const file = new File(uri);
      
      // Check if file exists
      if (!file.exists) {
        throw new Error("File does not exist");
      }
      
      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("Image too large (max 5MB). Please choose a smaller image.");
      }
      
      log.debug("File info", { 
        size: file.size,
        name: file.name,
        type: file.type,
        exists: file.exists
      });
      
      // Read file as base64 using the modern API
      const base64 = await file.base64();
      
      log.debug("Base64 conversion successful", { 
        length: base64.length,
        sizeKB: Math.round(base64.length / 1024)
      });
      
      // Convert base64 to Uint8Array
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Upload using Uint8Array
      const { error, data } = await supabase.storage
        .from("driver-documents")
        .upload(path, bytes, {
          upsert: true,
          contentType: file.type || "image/jpeg",
        });
      
      if (error) {
        log.error("Storage upload error with base64", error);
        throw error;
      }
      
      log.info("Upload successful, getting public URL", { path });
      const { data: urlData } = supabase.storage
        .from("driver-documents")
        .getPublicUrl(path);
      
      log.debug("Public URL generated", { url: urlData.publicUrl });
      return urlData.publicUrl;
      
    } catch (err) {
      log.error("Error in uploadImage", err);
      
      // Fallback: Try using fetch with blob if base64 fails
      if (err.message.includes("Network request failed") || err.message.includes("base64")) {
        log.warn("Base64 method failed, trying alternative method...");
        
        try {
          const response = await fetch(uri);
          
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
          }
          
          const blob = await response.blob();
          
          const { error } = await supabase.storage
            .from("driver-documents")
            .upload(path, blob, {
              upsert: true,
              contentType: blob.type || "image/jpeg",
            });
          
          if (error) throw error;
          
          const { data: urlData } = supabase.storage
            .from("driver-documents")
            .getPublicUrl(path);
          
          return urlData.publicUrl;
          
        } catch (retryErr) {
          log.error("Retry upload failed", retryErr);
          throw new Error(`Upload failed: ${retryErr.message}`);
        }
      }
      
      throw new Error(`Failed to upload image: ${err.message}`);
    }
  };

  // ================= VALIDATION =================
  const validateForm = () => {
    log.debug("Validating form");
    const errors = {};
    
    if (!licenseNumber || licenseNumber.trim().length < 5) {
      errors.licenseNumber = "Valid license number required (min 5 characters)";
    }
    
    if (!licenseExpiry) {
      errors.licenseExpiry = "License expiry date required";
    } else {
      const expiry = new Date(licenseExpiry);
      const today = new Date();
      if (expiry <= today) {
        errors.licenseExpiry = "License expiry must be in the future";
      }
    }
    
    if (!plateNumber || plateNumber.trim().length < 3) {
      errors.plateNumber = "Valid plate number required (min 3 characters)";
    }
    
    if (!vehicleType) {
      errors.vehicleType = "Vehicle type selection required";
    }
    
    if (!vehicleColor || vehicleColor.trim().length < 2) {
      errors.vehicleColor = "Vehicle color required";
    }
    
    if (!licenseFront) {
      errors.licenseFront = "License front photo required";
    }
    
    if (!licenseBack) {
      errors.licenseBack = "License back photo required";
    }
    
    if (!selfie) {
      errors.selfie = "Selfie with ID required";
    }
    
    if (!orcr) {
      errors.orcr = "OR/CR document required";
    }
    
    setValidationErrors(errors);
    const isValid = Object.keys(errors).length === 0;
    
    log.info("Validation result", { 
      isValid, 
      errorCount: Object.keys(errors).length,
      errors 
    });
    
    return isValid;
  };

  // ================= SUBMIT =================
  const handleSubmit = async () => {
    log.info("Submit initiated");
    
    if (loading) {
      log.debug("Submit skipped - already loading");
      return;
    }

    if (!validateForm()) {
      Alert.alert(
        "Incomplete Information", 
        "Please complete all required fields correctly.",
        [{ text: "OK" }]
      );
      return;
    }

    try {
      setLoading(true);
      log.info("Starting submission process");

      const userId = await AsyncStorage.getItem("user_id");
      log.debug("User ID retrieved", { userId });
      
      if (!userId) {
        throw new Error("User not found. Please log in again.");
      }

      // Upload images with progress tracking
      const timestamp = Date.now();
      
      setUploadProgress(prev => ({ ...prev, licenseFront: false }));
      log.info("Uploading license front");
      const frontUrl = await uploadImage(
        licenseFront,
        `licenses/${userId}_front_${timestamp}.jpg`,
      );
      setUploadProgress(prev => ({ ...prev, licenseFront: true }));
      
      setUploadProgress(prev => ({ ...prev, licenseBack: false }));
      log.info("Uploading license back");
      const backUrl = await uploadImage(
        licenseBack,
        `licenses/${userId}_back_${timestamp}.jpg`,
      );
      setUploadProgress(prev => ({ ...prev, licenseBack: true }));
      
      setUploadProgress(prev => ({ ...prev, selfie: false }));
      log.info("Uploading selfie");
      const selfieUrl = await uploadImage(
        selfie,
        `selfies/${userId}_${timestamp}.jpg`,
      );
      setUploadProgress(prev => ({ ...prev, selfie: true }));
      
      setUploadProgress(prev => ({ ...prev, orcr: false }));
      log.info("Uploading ORCR");
      const orcrUrl = await uploadImage(
        orcr,
        `vehicles/${userId}_orcr_${timestamp}.jpg`,
      );
      setUploadProgress(prev => ({ ...prev, orcr: true }));

      // Save driver documents
      log.info("Saving driver documents to database");
      const { error: docError } = await supabase
        .from("driver_documents")
        .upsert(
          {
            driver_id: userId,
            license_number: licenseNumber.trim(),
            license_expiry_date: licenseExpiry,
            license_front_url: frontUrl,
            license_back_url: backUrl,
            selfie_with_id_url: selfieUrl,
            submitted_at: new Date().toISOString(),
          },
          { onConflict: "driver_id" },
        );

      if (docError) {
        log.error("Error saving driver documents", docError);
        throw new Error(`Failed to save documents: ${docError.message}`);
      }

      log.info("Driver documents saved successfully");

      // Save vehicle details
      log.info("Saving vehicle details to database");
      const { error: vehicleError } = await supabase
        .from("driver_vehicles")
        .upsert(
          {
            driver_id: userId,
            plate_number: plateNumber.trim().toUpperCase(),
            vehicle_type: vehicleType,
            vehicle_color: vehicleColor.trim(),
            orcr_image_url: orcrUrl,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "driver_id" },
        );

      if (vehicleError) {
        log.error("Error saving vehicle details", vehicleError);
        throw new Error(`Failed to save vehicle: ${vehicleError.message}`);
      }

      log.info("Vehicle details saved successfully");

      // Update driver status
      log.info("Updating driver status");
      const { error: statusError } = await supabase
        .from("drivers")
        .update({ 
          status: "under_review",
          updated_at: new Date().toISOString()
        })
        .eq("id", userId);

      if (statusError) {
        log.error("Error updating driver status", statusError);
        throw new Error(`Failed to update status: ${statusError.message}`);
      }

      setStatus("under_review");
      log.info("Submission completed successfully!");

      Alert.alert(
        "Success!", 
        "Your documents have been submitted for review.",
        [{ text: "OK", onPress: () => navigation.navigate("DriverHomePage") }]
      );
      
    } catch (err) {
      log.error("Submission error", err);
      Alert.alert(
        "Submission Failed", 
        err.message || "An error occurred while submitting. Please try again.",
        [{ text: "OK" }]
      );
    } finally {
      setLoading(false);
      log.info("Submission process ended");
    }
  };

  const progress = [
    licenseFront,
    licenseBack,
    selfie,
    orcr,
    licenseNumber,
    licenseExpiry,
    plateNumber,
    vehicleType,
    vehicleColor,
  ].filter(Boolean).length / 9;

  // ================= COMPONENTS =================
  const renderModernInput = (label, value, setter, fieldName) => (
    <View style={styles.inputWrapper}>
      <Text style={styles.inputLabel}>
        {label}
        {validationErrors[fieldName] && (
          <Text style={styles.errorText}> *</Text>
        )}
      </Text>
      <TextInput
        value={value}
        onChangeText={(text) => {
          setter(text);
          if (validationErrors[fieldName]) {
            setValidationErrors(prev => ({ ...prev, [fieldName]: null }));
          }
        }}
        placeholder={label}
        style={[
          styles.input, 
          value?.length > 0 && styles.inputFilled,
          validationErrors[fieldName] && styles.inputError
        ]}
        placeholderTextColor="#9AA4B2"
      />
      {validationErrors[fieldName] && (
        <Text style={styles.errorMessage}>{validationErrors[fieldName]}</Text>
      )}
    </View>
  );

  const renderModernImageCard = (title, image, setter, fieldName) => {
    const isUploading = uploadProgress[fieldName] === false;
    
    return (
      <Pressable
        style={[
          styles.uploadCard, 
          image && styles.uploadCardFilled,
          validationErrors[fieldName] && styles.uploadCardError
        ]}
        onPress={() => openPickerOptions(setter, fieldName)}
        disabled={isUploading}
      >
        {image ? (
          <>
            <Image source={{ uri: image }} style={styles.uploadPreview} />
            {isUploading && (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
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
            {validationErrors[fieldName] && (
              <Text style={styles.uploadErrorText}>Required</Text>
            )}
          </View>
        )}
      </Pressable>
    );
  };

  // ================= UI =================
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { flexDirection: "row", alignItems: "center" }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#183B5C" />
          </Pressable>

          <View style={styles.headerContent}>
            <Text style={styles.title}>Driver verification muna, bes!</Text>
            <Text style={styles.subtitle}>
              Need lang kompletohin lahat ng required fields para ma-activate na yung driver account mo. Go na, saglit lang 'to!
            </Text>
          </View>
        </View>
        
        {status && (
          <View style={styles.statusWrapper}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Status: {status}</Text>
          </View>
        )}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>License Details</Text>

          {renderModernInput("License Number", licenseNumber, setLicenseNumber, "licenseNumber")}

          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>
              License Expiry
              {validationErrors.licenseExpiry && (
                <Text style={styles.errorText}> *</Text>
              )}
            </Text>

            <Pressable
              style={[
                styles.dateInput,
                validationErrors.licenseExpiry && styles.inputError
              ]}
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
            
            {validationErrors.licenseExpiry && (
              <Text style={styles.errorMessage}>{validationErrors.licenseExpiry}</Text>
            )}

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
                    if (validationErrors.licenseExpiry) {
                      setValidationErrors(prev => ({ ...prev, licenseExpiry: null }));
                    }
                  }
                }}
              />
            )}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Vehicle Details</Text>

          {renderModernInput("Plate Number", plateNumber, setPlateNumber, "plateNumber")}
          {renderModernInput("Vehicle Color", vehicleColor, setVehicleColor, "vehicleColor")}

          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>
              Vehicle Type
              {validationErrors.vehicleType && (
                <Text style={styles.errorText}> *</Text>
              )}
            </Text>
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
                  onPress={() => {
                    setVehicleType(item.value);
                    if (validationErrors.vehicleType) {
                      setValidationErrors(prev => ({ ...prev, vehicleType: null }));
                    }
                  }}
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
            {validationErrors.vehicleType && (
              <Text style={styles.errorMessage}>{validationErrors.vehicleType}</Text>
            )}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Required Documents</Text>

          <View style={styles.uploadGrid}>
            {renderModernImageCard(
              "License Front",
              licenseFront,
              setLicenseFront,
              "licenseFront"
            )}
            {renderModernImageCard(
              "License Back",
              licenseBack,
              setLicenseBack,
              "licenseBack"
            )}
            {renderModernImageCard(
              "Selfie with ID",
              selfie,
              setSelfie,
              "selfie"
            )}
            {renderModernImageCard(
              "OR/CR Document",
              orcr,
              setOrcr,
              "orcr"
            )}
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
          style={[styles.button, (progress < 1 || loading) && styles.buttonDisabled]}
          disabled={progress < 1 || loading}
          onPress={handleSubmit}
        >
          {loading ? (
            <>
              <ActivityIndicator color="#fff" />
              <Text style={[styles.buttonText, { marginLeft: 10 }]}>Submitting...</Text>
            </>
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

  backButton: {
    padding: 8,
    marginRight: 8,
  },

  headerContent: {
    flex: 1,
    alignItems: "center",
    marginRight: 32,
  },

  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#111",
    textAlign: "center",
  },

  subtitle: {
    fontSize: 14,
    color: "#666",
    marginTop: 6,
    textAlign: "center",
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
    shadowOffset: { width: 0, height: 2 },
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 14,
    color: "#333",
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
    color: "#111",
  },

  inputFilled: {
    borderColor: "#183B5C",
  },
  
  inputError: {
    borderColor: "#E53E3E",
    borderWidth: 1,
  },
  
  errorText: {
    color: "#E53E3E",
  },
  
  errorMessage: {
    color: "#E53E3E",
    fontSize: 11,
    marginTop: 4,
    marginLeft: 4,
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
    position: "relative",
  },

  uploadCardFilled: {
    borderStyle: "solid",
    borderColor: "#183B5C",
  },
  
  uploadCardError: {
    borderColor: "#E53E3E",
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
  
  uploadErrorText: {
    fontSize: 10,
    color: "#E53E3E",
    marginTop: 4,
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
  },
  
  uploadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },

  progressContainer: {
    marginTop: 10,
    marginBottom: 20,
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
    borderTopWidth: 1,
    borderTopColor: "#E3E8EF",
  },

  button: {
    backgroundColor: "#183B5C",
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    shadowColor: "#183B5C",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    shadowOffset: { width: 0, height: 4 },
  },
  
  buttonDisabled: {
    opacity: 0.6,
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
});