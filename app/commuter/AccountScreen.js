import React, { useState } from "react";
import { View, Text, TouchableOpacity, Image, ScrollView, TextInput, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { styles } from "../styles/AccountScreenStyles"; // <-- import styles

export default function AccountScreen() {
  const [user, setUser] = useState({
    name: "Juan Dela Cruz",
    email: "juan.delacruz@example.com",
    avatar: "https://i.pravatar.cc/150?img=5"
  });

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [tempName, setTempName] = useState(user.name);
  const [tempEmail, setTempEmail] = useState(user.email);
  const [tempAvatar, setTempAvatar] = useState(user.avatar);

  const menuItems = [
    { id: "1", title: "Wallet", icon: "wallet", screen: "WalletScreen" },
    { id: "2", title: "Ride History", icon: "car", screen: "RideHistoryScreen" },
    { id: "3", title: "Settings", icon: "settings", screen: "SettingsScreen" },
    { id: "4", title: "Logout", icon: "log-out", screen: null },
  ];

  const handleMenuPress = (item) => {
    if(item.screen) console.log(`Navigate to ${item.screen}`);
    else console.log("Logging out...");
  };

  const saveProfile = () => {
    setUser({ name: tempName, email: tempEmail, avatar: tempAvatar });
    setEditModalVisible(false);
  };

  return (
    <ScrollView style={styles.container}>
      <LinearGradient colors={["#183B5C", "#E97A3E"]} style={styles.profileCard} start={[0,0]} end={[1,1]}>
        <Image source={{ uri: user.avatar }} style={styles.avatar} />
        <Text style={styles.userName}>{user.name}</Text>
        <Text style={styles.userEmail}>{user.email}</Text>

        <TouchableOpacity style={styles.editButton} onPress={() => setEditModalVisible(true)}>
          <Ionicons name="pencil" size={16} color="#183B5C" style={{ marginRight: 6 }} />
          <Text style={styles.editButtonText}>Edit Profile</Text>
        </TouchableOpacity>
      </LinearGradient>

      <View style={styles.menuContainer}>
        {menuItems.map((item) => (
          <TouchableOpacity key={item.id} style={styles.menuItem} onPress={() => handleMenuPress(item)}>
            <Ionicons name={item.icon} size={24} color="#183B5C" style={{ marginRight: 16 }} />
            <Text style={styles.menuText}>{item.title}</Text>
            <Ionicons name="chevron-forward" size={20} color="#999" style={{ marginLeft: "auto" }} />
          </TouchableOpacity>
        ))}
      </View>

      <Modal visible={editModalVisible} animationType="slide" transparent onRequestClose={() => setEditModalVisible(false)}>
        <View style={styles.modalBackground}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Edit Profile</Text>

            <Text style={styles.modalLabel}>Avatar URL</Text>
            <TextInput style={styles.modalInput} value={tempAvatar} onChangeText={setTempAvatar} placeholder="Enter avatar URL" />

            <Text style={styles.modalLabel}>Name</Text>
            <TextInput style={styles.modalInput} value={tempName} onChangeText={setTempName} placeholder="Enter name" />

            <Text style={styles.modalLabel}>Email</Text>
            <TextInput style={styles.modalInput} value={tempEmail} onChangeText={setTempEmail} placeholder="Enter email" keyboardType="email-address" />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setEditModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveButton} onPress={saveProfile}>
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}