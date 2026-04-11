import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  Modal,
  BackHandler,
} from "react-native";

export default function ForceUpdateModal({ 
  visible, 
  releaseNotes, 
  updateUrl, 
  currentVersion, 
  minVersion,
}) {
  useEffect(() => {
    if (visible) {
      // Disable back button when modal is visible
      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        () => true // Prevent back navigation
      );
      return () => backHandler.remove();
    }
  }, [visible]);

  const handleUpdate = () => {
    if (updateUrl) {
      Linking.openURL(updateUrl);
    } else {
      const storeUrl = Platform.select({
        ios: "https://apps.apple.com/app/idYOUR_APP_ID", // Replace with your App Store ID
        android: "https://play.google.com/store/apps/details?id=com.lemera.sakayna",
      });
      if (storeUrl) {
        Linking.openURL(storeUrl);
      }
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      statusBarTranslucent={true}
      onRequestClose={() => {}} // Empty function to prevent closing
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>🔄</Text>
          </View>
          
          <Text style={styles.title}>Update Required</Text>
          
          <Text style={styles.message}>
            A new version of SakayNa is available. Please update to continue using the app.
          </Text>
          
          {currentVersion && minVersion && (
            <View style={styles.versionContainer}>
              <Text style={styles.versionText}>
                Your version: v{currentVersion} → Required: v{minVersion}+
              </Text>
            </View>
          )}
          
          {releaseNotes && (
            <View style={styles.releaseNotesContainer}>
              <Text style={styles.releaseNotesTitle}>What's new in this update:</Text>
              <Text style={styles.releaseNotes}>{releaseNotes}</Text>
            </View>
          )}
          
          <TouchableOpacity style={styles.updateButton} onPress={handleUpdate}>
            <Text style={styles.updateButtonText}>Update Now</Text>
          </TouchableOpacity>
          
          <Text style={styles.footerText}>
            You won't be able to use the app until you update to the latest version
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    width: "100%",
    maxWidth: 350,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#183B5C",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 20,
  },
  icon: {
    fontSize: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#183B5C",
    marginBottom: 12,
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 20,
  },
  versionContainer: {
    backgroundColor: "#FFF3E0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 16,
    alignSelf: "center",
  },
  versionText: {
    fontSize: 12,
    color: "#E97A3E",
    fontWeight: "600",
  },
  releaseNotesContainer: {
    backgroundColor: "#F9F9F9",
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#EEEEEE",
  },
  releaseNotesTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 6,
  },
  releaseNotes: {
    fontSize: 13,
    color: "#666",
    lineHeight: 18,
  },
  updateButton: {
    backgroundColor: "#E97A3E",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 12,
  },
  updateButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  footerText: {
    fontSize: 11,
    color: "#999",
    textAlign: "center",
  },
});