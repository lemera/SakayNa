import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";
import { styles } from "../styles/AccountScreenStyles";

export default function AccountScreen({ navigation }) {
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [user, setUser] = useState({
    name: "",
    phone: "",
    avatar: "https://i.pravatar.cc/150?img=5",
  });

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [tempName, setTempName] = useState("");
  const [tempAvatar, setTempAvatar] = useState("");

  // ✅ FETCH USER DATA
  useEffect(() => {
    let isMounted = true;

    const fetchUser = async () => {
      try {
        const storedUserId = await AsyncStorage.getItem("user_id");

        if (!storedUserId) {
          navigation.reset({
            index: 0,
            routes: [{ name: "UserType" }],
          });
          return;
        }

        if (isMounted) setUserId(storedUserId);

        const { data, error } = await supabase
          .from("commuters")
          .select("first_name, middle_name, last_name, phone")
          .eq("id", storedUserId)
          .maybeSingle();

        if (error || !data) throw new Error("User not found");

        const fullName = [
          data.first_name,
          data.middle_name,
          data.last_name,
        ]
          .filter(Boolean)
          .join(" ");

        if (isMounted) {
          setUser({
            name: fullName,
            phone: data.phone,
            avatar: "https://i.pravatar.cc/150?img=5",
          });

          setTempName(fullName);
          setTempAvatar("https://i.pravatar.cc/150?img=5");
        }
      } catch (err) {
        console.log("Fetch error:", err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchUser();

    return () => {
      isMounted = false;
    };
  }, []);

  // ✅ SAVE PROFILE
  const saveProfile = async () => {
    if (!tempName.trim()) {
      Alert.alert("Name required");
      return;
    }

    try {
      setSaving(true);

      const nameParts = tempName.trim().split(" ").filter(Boolean);

      const first_name = nameParts[0] || "";
      const last_name = nameParts[nameParts.length - 1] || "";
      const middle_name =
        nameParts.length > 2
          ? nameParts.slice(1, -1).join(" ")
          : "";

      const { error } = await supabase
        .from("commuters")
        .update({
          first_name,
          middle_name,
          last_name,
        })
        .eq("id", userId);

      if (error) throw error;

      setUser((prev) => ({
        ...prev,
        name: tempName,
        avatar: tempAvatar,
      }));

      setEditModalVisible(false);
      Alert.alert("Success", "Profile Updated");
    } catch (err) {
      Alert.alert("Update Failed", err.message);
    } finally {
      setSaving(false);
    }
  };

  // ✅ IMPROVED LOGOUT
  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            await supabase.auth.signOut(); // important
            await AsyncStorage.multiRemove([
              "user_id",
              "user_phone",
              "user_type",
            ]);

            navigation.reset({
              index: 0,
              routes: [{ name: "UserType" }],
            });
          } catch (error) {
            console.log("Logout error:", error);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#183B5C" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <LinearGradient
        colors={["#183B5C", "#E97A3E"]}
        style={styles.profileCard}
        start={[0, 0]}
        end={[1, 1]}
      >
        <Image source={{ uri: user.avatar }} style={styles.avatar} />
        <Text style={styles.userName}>{user.name}</Text>
        <Text style={styles.userEmail}>{user.phone}</Text>

        <TouchableOpacity
          style={styles.editButton}
          onPress={() => setEditModalVisible(true)}
        >
          <Ionicons name="pencil" size={16} color="#183B5C" />
          <Text style={styles.editButtonText}>Edit Profile</Text>
        </TouchableOpacity>
      </LinearGradient>

      <View style={styles.menuContainer}>
        <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
          <Ionicons name="log-out" size={24} color="red" />
          <Text style={[styles.menuText, { color: "red" }]}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* EDIT MODAL */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalBackground}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Edit Profile</Text>

            <Text style={styles.modalLabel}>Avatar URL</Text>
            <TextInput
              style={styles.modalInput}
              value={tempAvatar}
              onChangeText={setTempAvatar}
            />

            <Text style={styles.modalLabel}>Full Name</Text>
            <TextInput
              style={styles.modalInput}
              value={tempName}
              onChangeText={setTempName}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={saveProfile}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalSaveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}