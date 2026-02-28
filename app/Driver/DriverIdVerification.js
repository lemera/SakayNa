import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Alert,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system";
import { supabase } from "../../lib/supabase";
import { styles } from "../styles/Driver/DriverCameraVerificationStyles";

export default function DriverIdVerification({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  const [side, setSide] = useState("front");
  const [frontPhoto, setFrontPhoto] = useState(null);
  const [backPhoto, setBackPhoto] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    requestPermission();
  }, []);

  const takePicture = async () => {
    const result = await cameraRef.current.takePictureAsync({ quality: 0.7 });
    side === "front"
      ? setFrontPhoto(result.uri)
      : setBackPhoto(result.uri);
  };

  const uploadImage = async (uri, filePath) => {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const { error } = await supabase.storage
      .from("driver-documents")
      .upload(filePath, Buffer.from(base64, "base64"), {
        contentType: "image/jpeg",
      });

    if (error) throw error;

    const { data } = supabase.storage
      .from("driver-documents")
      .getPublicUrl(filePath);

    return data.publicUrl;
  };

  const handleConfirmAll = async () => {
    if (!frontPhoto || !backPhoto) {
      Alert.alert("Incomplete", "Please capture both sides.");
      return;
    }

    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();

      const frontUrl = await uploadImage(frontPhoto, `${user.id}/front.jpg`);
      const backUrl = await uploadImage(backPhoto, `${user.id}/back.jpg`);

      await supabase.from("drivers").update({
        license_front_url: frontUrl,
        license_back_url: backUrl,
        status: "id_submitted",
        submitted_at: new Date(),
      }).eq("id", user.id);

      navigation.navigate("DriverCameraVerification");

    } catch (err) {
      Alert.alert("Upload Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!permission?.granted) {
    return (
      <View style={styles.center}>
        <Text>Camera permission required.</Text>
        <Pressable onPress={requestPermission}>
          <Text>Allow Camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Capture Driver License</Text>

      <View style={styles.cameraWrapper}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />
      </View>

      <Pressable style={styles.captureButton} onPress={takePicture}>
        <View style={styles.innerCircle} />
      </Pressable>

      {frontPhoto && side === "front" && (
        <Pressable onPress={() => setSide("back")}>
          <Text>Next: Back</Text>
        </Pressable>
      )}

      {backPhoto && (
        <Pressable onPress={handleConfirmAll}>
          <Text>{loading ? "Uploading..." : "Confirm & Upload"}</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}