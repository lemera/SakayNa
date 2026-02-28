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

export default function DriverCameraVerification({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [photo, setPhoto] = useState(null);
  const cameraRef = useRef(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    requestPermission();
  }, []);

  const takePicture = async () => {
    const result = await cameraRef.current.takePictureAsync({ quality: 0.7 });
    setPhoto(result.uri);
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

  const handleConfirm = async () => {
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();

      const selfieUrl = await uploadImage(photo, `${user.id}/selfie.jpg`);

      await supabase.from("drivers").update({
        selfie_with_id_url: selfieUrl,
        status: "under_review",
      }).eq("id", user.id);

      Alert.alert("Submitted", "Your documents are under review.");
      navigation.navigate("DriverHomePage");

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
      <Text style={styles.title}>Selfie with ID</Text>

      <View style={styles.cameraWrapper}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.camera} />
        ) : (
          <CameraView ref={cameraRef} style={styles.camera} facing="front" />
        )}
      </View>

      {photo ? (
        <>
          <Pressable onPress={() => setPhoto(null)}>
            <Text>Retake</Text>
          </Pressable>

          <Pressable onPress={handleConfirm}>
            <Text>{loading ? "Uploading..." : "Confirm"}</Text>
          </Pressable>
        </>
      ) : (
        <Pressable style={styles.captureButton} onPress={takePicture}>
          <View style={styles.innerCircle} />
        </Pressable>
      )}
    </SafeAreaView>
  );
}