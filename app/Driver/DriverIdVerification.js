import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Alert,
  Image,
  SafeAreaView,
  StyleSheet,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "../styles/Driver/DriverCameraVerificationStyles";

export default function DriverIdVerification({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  const [side, setSide] = useState("front");
  const [frontPhoto, setFrontPhoto] = useState(null);
  const [backPhoto, setBackPhoto] = useState(null);

  useEffect(() => {
    requestPermission();
  }, []);

  const takePicture = async () => {
    try {
      if (cameraRef.current) {
        const result = await cameraRef.current.takePictureAsync({ quality: 0.8 });
        if (side === "front") setFrontPhoto(result.uri);
        else setBackPhoto(result.uri);
      }
    } catch (err) {
      console.warn("takePicture error", err);
      Alert.alert("Camera error", "Unable to take picture. Please try again.");
    }
  };

  const handleNextAfterFront = () => {
    setSide("back");
  };

  const handleConfirmAll = () => {
    Alert.alert("ID Captured", "Front and back of your ID have been saved.", [
      { text: "OK", onPress: () => navigation.navigate("DriverCameraVerification") },
    ]);
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
        <Text>Camera access is required for ID verification.</Text>
        <Pressable style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionText}>Allow Camera</Text>
        </Pressable>
      </View>
    );
  }

  const renderCameraOrPreview = () => {
    const currentPhoto = side === "front" ? frontPhoto : backPhoto;

    return (
      <View style={styles.cameraWrapper}>
        {currentPhoto ? (
          <Image
            source={{ uri: currentPhoto }}
            style={styles.camera}
            resizeMode="cover"
          />
        ) : (
          <>
            <CameraView style={styles.camera} ref={cameraRef} facing={"back"} />
            <View style={localStyles.idFrame} pointerEvents="none">
              <Text style={styles.idText}>
                {side === "front" ? "Front of ID" : "Back of ID"}
              </Text>
            </View>
          </>
        )}
      </View>
    );
  };

  const renderButtons = () => {
    if (side === "front" && frontPhoto) {
      return (
        <View style={styles.buttonContainer}>
          <Pressable style={styles.secondaryBtn} onPress={() => setFrontPhoto(null)}>
            <Text style={styles.secondaryText}>Retake Front</Text>
          </Pressable>
          <Pressable style={styles.primaryBtn} onPress={handleNextAfterFront}>
            <Text style={styles.primaryText}>Next: Capture Back</Text>
          </Pressable>
        </View>
      );
    }

    if (side === "back" && backPhoto) {
      return (
        <View style={styles.buttonContainer}>
          <Pressable style={styles.secondaryBtn} onPress={() => setBackPhoto(null)}>
            <Text style={styles.secondaryText}>Retake Back</Text>
          </Pressable>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => {
              setSide("review");
            }}
          >
            <Text style={styles.primaryText}>Review</Text>
          </Pressable>
        </View>
      );
    }

    if (side === "review") {
      return (
        <View style={{ alignItems: "center", marginTop: 10 }}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Image source={{ uri: frontPhoto }} style={{ width: 150, height: 100, borderRadius: 8 }} resizeMode="contain" />
            <Image source={{ uri: backPhoto }} style={{ width: 150, height: 100, borderRadius: 8 }} resizeMode="contain" />
          </View>

          <View style={[styles.buttonContainer, { marginTop: 12 }]}>
            <Pressable style={styles.secondaryBtn} onPress={() => setSide("front")}>
              <Text style={styles.secondaryText}>Retake Front</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => setSide("back")}>
              <Text style={styles.secondaryText}>Retake Back</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={handleConfirmAll}>
              <Text style={styles.primaryText}>Confirm All</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.buttonContainer}>
        <Pressable style={styles.captureButton} onPress={takePicture}>
          <View style={styles.innerCircle} />
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={26} color="#183B5C" />
      </Pressable>

      <Text style={styles.title}>Driver ID Verification</Text>

      <Text style={styles.subtitle}>
        Please capture the front and back of your Drivers License ID. Ensure the text and photo are
        clear and readable.
      </Text>

      {/* Reference Section */}
      <View style={localStyles.referenceRow}>
        <View style={localStyles.referenceItem}>
          <View style={localStyles.refImageContainer}>
            <Image
              source={require("../../assets/correct id.png")}
              style={localStyles.refImage}
            />
          </View>
          <Text style={localStyles.refLabel}>Correct</Text>
        </View>

        <View style={localStyles.referenceItem}>
          <View style={localStyles.refImageContainer}>
            <Image
              source={require("../../assets/wrong id.png")}
              style={localStyles.refImage}
            />
          </View>
          <Text style={localStyles.refLabel}>Wrong</Text>
        </View>
      </View>

      {side === "review" ? (
        <View style={{ marginTop: 18 }} />
      ) : (
        renderCameraOrPreview()
      )}

      {renderButtons()}
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  idFrame: {
    position: "absolute",
    width: 280,
    height: 170,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: "#FFD700",
    alignSelf: "center",
    top: 95,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.15)",
  },

  referenceRow: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },

  referenceItem: {
    alignItems: "center",
    width: 140,
  },

  refImageContainer: {
    width: 120,
    height: 70,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    // No border, no background
  },

  refImage: {
    width: "100%",
    height: "100%",
    resizeMode: "contain", // 🔥 prevents stretching
  },

  refLabel: {
    marginTop: 6,
    fontSize: 12,
    color: "#333",
    fontWeight: "600",
    backgroundColor: "transparent",
  },
});