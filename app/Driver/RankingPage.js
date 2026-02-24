import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, Image, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase"; // adjust path

export default function RankingPage({ navigation }) {
  const [drivers, setDrivers] = useState([]);

  // Fetch drivers with average rating from Supabase
  const fetchDriverRanking = async () => {
    const { data, error } = await supabase
      .from("drivers")
      .select(`
        id,
        first_name,
        last_name,
        profile_picture,
        driver_reviews (
          rating
        )
      `);

    if (error) {
      console.log("Error fetching drivers:", error.message);
      return;
    }

    // Calculate average rating
    const rankedDrivers = data.map((driver) => {
      const ratings = driver.driver_reviews.map((r) => r.rating);
      const average_rating =
        ratings.length > 0
          ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
          : 0;

      return {
        id: driver.id,
        name: `${driver.first_name} ${driver.last_name}`,
        avatar: driver.profile_picture
          ? { uri: driver.profile_picture }
          : require("../../assets/driver-avatar.jpg"),
        average_rating,
      };
    });

    // Sort by highest rating
    rankedDrivers.sort((a, b) => b.average_rating - a.average_rating);

    // Assign rank based on order
    const withRank = rankedDrivers.map((driver, index) => ({
      ...driver,
      rank: index + 1,
    }));

    setDrivers(withRank);
  };

  useEffect(() => {
    fetchDriverRanking();
  }, []);

  const getRankColor = (rank) => {
    switch (rank) {
      case 1:
        return "#FFD700"; // Gold
      case 2:
        return "#C0C0C0"; // Silver
      case 3:
        return "#CD7F32"; // Bronze
      default:
        return "#1E3A8A"; // Default
    }
  };

  const getMedalIcon = (rank) => {
    switch (rank) {
      case 1:
        return <Ionicons name="trophy" size={20} color="#FFD700" style={{ marginLeft: 5 }} />;
      case 2:
        return <Ionicons name="trophy" size={20} color="#C0C0C0" style={{ marginLeft: 5 }} />;
      case 3:
        return <Ionicons name="trophy" size={20} color="#CD7F32" style={{ marginLeft: 5 }} />;
      default:
        return null;
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.itemContainer}>
      <View style={[styles.rankCircle, { backgroundColor: getRankColor(item.rank) }]}>
        <Text style={styles.rankText}>{item.rank}</Text>
      </View>
      <Image source={item.avatar} style={styles.avatar} />
      <View style={styles.nameContainer}>
        <Text style={styles.nameText}>
          {item.name} ({item.average_rating.toFixed(1)}⭐)
        </Text>
        {getMedalIcon(item.rank)}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header with Back Button */}
      <View style={styles.headerContainer}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </Pressable>
        <Text style={styles.header}>Top Rankings</Text>
      </View>

      {/* Ranking List */}
      <FlatList
        data={drivers}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContainer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
    paddingTop: 50,
    paddingHorizontal: 20,
  },
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  backButton: {
    marginRight: 10,
    padding: 5,
  },
  header: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1E3A8A",
    flex: 1,
    textAlign: "center",
  },
  listContainer: {
    paddingBottom: 20,
  },
  itemContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    marginVertical: 5,
    backgroundColor: "#FFF",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  rankCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  rankText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFF",
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginHorizontal: 10,
  },
  nameContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  nameText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
  },
});