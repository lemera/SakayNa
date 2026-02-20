import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Alert,
  Image,
  SafeAreaView,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "../styles/Driver/DriverCameraVerificationStyles";

export default function DriverCameraVerification({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [photo, setPhoto] = useState(null);
  const cameraRef = useRef(null);

  useEffect(() => {
    requestPermission();
  }, []);

  const takePicture = async () => {
    if (cameraRef.current) {
      const result = await cameraRef.current.takePictureAsync();
      setPhoto(result.uri);
    }
  };

  const handleConfirm = () => {
    Alert.alert("Verification Complete", "Your selfie has been securely saved.");
    navigation.navigate("DriverHomePage");
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <Text>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text>Camera access is required for verification.</Text>
        <Pressable style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionText}>Allow Camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={26} color="#183B5C" />
      </Pressable>

      <Text style={styles.title}>Driver Face ID Verification</Text>

      <Text style={styles.subtitle}>
        1. Take a clear selfie while holding your driver’s license.
        {"\n"}2. Align your face within the guide and ensure your ID is visible in the frame.
        {"\n"}3. This helps us verify your identity and protect passenger safety.
      </Text>

      {/* CAMERA SECTION */}
      <View style={styles.cameraWrapper}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.camera} />
        ) : (
          <>
            <CameraView
              style={styles.camera}
              ref={cameraRef}
              facing="front"
            />
            <View style={styles.faceGuide} />
            {/* ID GUIDE */}
            <View style={styles.idGuide}>
              <Text style={styles.idText}>Driver's License</Text>
            </View>
          </>
        )}
      </View>

      {/* SAFETY NOTE */}
      <View style={styles.securityBox}>
        <Ionicons name="shield-checkmark-outline" size={18} color="#2E7D32" />
        <Text style={styles.securityText}>
          Your photo is encrypted and securely stored. We do not share your data.
        </Text>
      </View>

      {/* BUTTONS */}
      <View style={styles.buttonContainer}>
        {photo ? (
          <>
            <Pressable style={styles.secondaryBtn} onPress={() => setPhoto(null)}>
              <Text style={styles.secondaryText}>Retake</Text>
            </Pressable>

            <Pressable style={styles.primaryBtn} onPress={handleConfirm}>
              <Text style={styles.primaryText}>Confirm</Text>
            </Pressable>
          </>
        ) : (
          <Pressable style={styles.captureButton} onPress={takePicture}>
            <View style={styles.innerCircle} />
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}