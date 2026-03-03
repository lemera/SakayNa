import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Image,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { Dimensions } from "react-native";

export default function RankingPage({ navigation }) {
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get("window").width - 40;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [driverId, setDriverId] = useState(null);
  const [driver, setDriver] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState("week"); // week, month, all
  
  // Ranking data
  const [driverRank, setDriverRank] = useState({
    currentRank: 0,
    totalDrivers: 0,
    percentile: 0,
    points: 0,
    level: "Bronze",
    nextLevel: "Silver",
    pointsToNextLevel: 0,
  });

  const [leaderboard, setLeaderboard] = useState([]);
  const [topDrivers, setTopDrivers] = useState([]);
  const [nearbyDrivers, setNearbyDrivers] = useState([]);
  
  const [performance, setPerformance] = useState({
    tripsThisWeek: 0,
    earningsThisWeek: 0,
    rating: 0,
    acceptanceRate: 0,
    completionRate: 0,
  });

  const [weeklyPoints, setWeeklyPoints] = useState([0, 0, 0, 0, 0, 0, 0]);

  // Fetch driver ID
  useFocusEffect(
    useCallback(() => {
      const getDriverId = async () => {
        const id = await AsyncStorage.getItem("user_id");
        setDriverId(id);
      };
      getDriverId();
    }, [])
  );

  // Fetch ranking data
  useEffect(() => {
    if (driverId) {
      loadRankingData();
    }
  }, [driverId, selectedPeriod]);

  const loadRankingData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchDriverProfile(),
        fetchDriverRank(),
        fetchLeaderboard(),
        fetchPerformance(),
        fetchWeeklyPoints(),
      ]);
    } catch (err) {
      console.log("Error loading ranking data:", err);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRankingData();
    setRefreshing(false);
  };

  const fetchDriverProfile = async () => {
    try {
      const { data, error } = await supabase
        .from("drivers")
        .select(`
          id,
          first_name,
          last_name,
          profile_picture,
          status
        `)
        .eq("id", driverId)
        .single();

      if (error) throw error;
      setDriver(data);
    } catch (err) {
      console.log("Error fetching profile:", err.message);
    }
  };

  const fetchDriverRank = async () => {
    try {
      // Get all drivers with their stats
      const { data: allDrivers, error } = await supabase
        .from("drivers")
        .select(`
          id,
          first_name,
          last_name,
          profile_picture
        `)
        .eq("status", "approved");

      if (error) throw error;

      // Get trip counts for each driver
      const driverStats = await Promise.all(
        allDrivers.map(async (d) => {
          const { count, error: countError } = await supabase
            .from("bookings")
            .select("*", { count: "exact", head: true })
            .eq("driver_id", d.id)
            .eq("status", "completed");

          if (countError) throw countError;

          // Calculate points (example formula: 10 points per trip)
          const points = (count || 0) * 10;

          return {
            ...d,
            trips: count || 0,
            points: points,
          };
        })
      );

      // Sort by points
      const sortedDrivers = driverStats.sort((a, b) => b.points - a.points);
      
      // Find current driver's rank
      const currentDriverIndex = sortedDrivers.findIndex(d => d.id === driverId);
      const currentRank = currentDriverIndex + 1;
      const totalDrivers = sortedDrivers.length;
      const percentile = ((totalDrivers - currentRank) / totalDrivers) * 100;
      
      // Get current driver's points
      const currentDriverPoints = sortedDrivers[currentDriverIndex]?.points || 0;

      // Determine level based on points
      let level = "Bronze";
      let nextLevel = "Silver";
      let pointsToNextLevel = 500 - currentDriverPoints;

      if (currentDriverPoints >= 2000) {
        level = "Diamond";
        nextLevel = "Legend";
        pointsToNextLevel = 3000 - currentDriverPoints;
      } else if (currentDriverPoints >= 1000) {
        level = "Gold";
        nextLevel = "Diamond";
        pointsToNextLevel = 2000 - currentDriverPoints;
      } else if (currentDriverPoints >= 500) {
        level = "Silver";
        nextLevel = "Gold";
        pointsToNextLevel = 1000 - currentDriverPoints;
      } else {
        pointsToNextLevel = 500 - currentDriverPoints;
      }

      setDriverRank({
        currentRank,
        totalDrivers,
        percentile: Math.round(percentile),
        points: currentDriverPoints,
        level,
        nextLevel,
        pointsToNextLevel: Math.max(0, pointsToNextLevel),
      });

      // Get top 3 drivers
      setTopDrivers(sortedDrivers.slice(0, 3));

      // Get nearby drivers (2 above, 2 below)
      const start = Math.max(0, currentDriverIndex - 2);
      const end = Math.min(totalDrivers, currentDriverIndex + 3);
      setNearbyDrivers(sortedDrivers.slice(start, end));

    } catch (err) {
      console.log("Error fetching rank:", err.message);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      // Get top 10 drivers
      const { data: drivers, error } = await supabase
        .from("drivers")
        .select(`
          id,
          first_name,
          last_name,
          profile_picture
        `)
        .eq("status", "approved")
        .limit(10);

      if (error) throw error;

      // Get stats for each driver
      const leaderboardData = await Promise.all(
        drivers.map(async (d, index) => {
          const { count, error: countError } = await supabase
            .from("bookings")
            .select("*", { count: "exact", head: true })
            .eq("driver_id", d.id)
            .eq("status", "completed");

          if (countError) throw countError;

          // Get average rating
          const { data: ratings, error: ratingError } = await supabase
            .from("bookings")
            .select("commuter_rating")
            .eq("driver_id", d.id)
            .not("commuter_rating", "is", null);

          if (ratingError) throw ratingError;

          const avgRating = ratings?.length > 0
            ? ratings.reduce((sum, r) => sum + r.commuter_rating, 0) / ratings.length
            : 0;

          // Calculate points
          const trips = count || 0;
          const points = trips * 10;

          return {
            ...d,
            rank: index + 1,
            trips,
            points,
            rating: avgRating.toFixed(1),
          };
        })
      );

      // Sort by points
      const sortedLeaderboard = leaderboardData.sort((a, b) => b.points - a.points);
      setLeaderboard(sortedLeaderboard);

    } catch (err) {
      console.log("Error fetching leaderboard:", err.message);
    }
  };

  const fetchPerformance = async () => {
    try {
      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay() + 1);
      startOfWeek.setHours(0, 0, 0, 0);

      // Get this week's trips
      const { data: weeklyBookings, error: weeklyError } = await supabase
        .from("bookings")
        .select("actual_fare, commuter_rating, status")
        .eq("driver_id", driverId)
        .gte("created_at", startOfWeek.toISOString());

      if (weeklyError) throw weeklyError;

      const tripsThisWeek = weeklyBookings?.filter(b => b.status === "completed").length || 0;
      const earningsThisWeek = weeklyBookings
        ?.filter(b => b.status === "completed")
        .reduce((sum, b) => sum + (b.actual_fare || 0), 0) || 0;

      // Get all time ratings
      const { data: allBookings, error: allError } = await supabase
        .from("bookings")
        .select("commuter_rating, status")
        .eq("driver_id", driverId);

      if (allError) throw allError;

      const completedBookings = allBookings?.filter(b => b.status === "completed") || [];
      const totalBookings = allBookings?.length || 0;
      
      // Calculate average rating
      const ratings = completedBookings
        .filter(b => b.commuter_rating)
        .map(b => b.commuter_rating);
      
      const avgRating = ratings.length > 0
        ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
        : 0;

      // Calculate acceptance rate (example: 95%)
      const acceptanceRate = 95;

      // Calculate completion rate
      const completionRate = totalBookings > 0
        ? (completedBookings.length / totalBookings) * 100
        : 0;

      setPerformance({
        tripsThisWeek,
        earningsThisWeek,
        rating: avgRating.toFixed(1),
        acceptanceRate,
        completionRate: Math.round(completionRate),
      });

    } catch (err) {
      console.log("Error fetching performance:", err.message);
    }
  };

  const fetchWeeklyPoints = async () => {
    try {
      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay() + 1);
      startOfWeek.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("bookings")
        .select("created_at")
        .eq("driver_id", driverId)
        .eq("status", "completed")
        .gte("created_at", startOfWeek.toISOString());

      if (error) throw error;

      const dailyPoints = [0, 0, 0, 0, 0, 0, 0];

      data?.forEach(booking => {
        const date = new Date(booking.created_at);
        let dayIndex = date.getDay();
        dayIndex = dayIndex === 0 ? 6 : dayIndex - 1;
        dailyPoints[dayIndex] += 10; // 10 points per trip
      });

      setWeeklyPoints(dailyPoints);

    } catch (err) {
      console.log("Error fetching weekly points:", err.message);
    }
  };

  const getLevelColor = (level) => {
    switch (level) {
      case "Bronze": return "#CD7F32";
      case "Silver": return "#C0C0C0";
      case "Gold": return "#FFD700";
      case "Diamond": return "#B9F2FF";
      default: return "#6B7280";
    }
  };

  const getRankBadge = (rank) => {
    switch (rank) {
      case 1:
        return { icon: "trophy", color: "#FFD700", bg: "#FFF3CD" };
      case 2:
        return { icon: "medal", color: "#C0C0C0", bg: "#F0F0F0" };
      case 3:
        return { icon: "medal", color: "#CD7F32", bg: "#F6E5D1" };
      default:
        return { icon: "ribbon", color: "#6B7280", bg: "#F3F4F6" };
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F5F7FA" }}>
        <ActivityIndicator size="large" color="#183B5C" />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F5F7FA" }}
      contentContainerStyle={{ paddingBottom: 30 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View
        style={{
          backgroundColor: "#183B5C",
          paddingTop: insets.top + 20,
          paddingBottom: 30,
          paddingHorizontal: 20,
          borderBottomLeftRadius: 30,
          borderBottomRightRadius: 30,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Pressable onPress={() => navigation.goBack()} style={{ width: 40 }}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </Pressable>

          <Text style={{ fontSize: 20, fontWeight: "bold", color: "#FFF" }}>
            Rankings
          </Text>

          <View style={{ width: 40 }} />
        </View>

        {/* Period Selector crown */}
        <View style={{ flexDirection: "row", marginTop: 20, gap: 8 }}>
          {[
            { key: "week", label: "This Week" },
            { key: "month", label: "This Month" },
            { key: "all", label: "All Time" },
          ].map((period) => (
            <Pressable
              key={period.key}
              style={[
                {
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 20,
                  alignItems: "center",
                },
                selectedPeriod === period.key
                  ? { backgroundColor: "#FFB37A" }
                  : { backgroundColor: "rgba(255,255,255,0.2)" },
              ]}
              onPress={() => setSelectedPeriod(period.key)}
            >
              <Text
                style={{
                  color: selectedPeriod === period.key ? "#183B5C" : "#FFF",
                  fontWeight: selectedPeriod === period.key ? "bold" : "normal",
                  fontSize: 12,
                }}
              >
                {period.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Rank Card */}
      <View
        style={{
          marginHorizontal: 20,
          marginTop: -20,
          backgroundColor: "#FFF",
          borderRadius: 24,
          padding: 20,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 12,
          elevation: 5,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {/* Rank Badge */}
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: getLevelColor(driverRank.level) + "20",
              justifyContent: "center",
              alignItems: "center",
              marginRight: 15,
              borderWidth: 3,
              borderColor: getLevelColor(driverRank.level),
            }}
          >
            <Text style={{ fontSize: 32, fontWeight: "bold", color: getLevelColor(driverRank.level) }}>
              #{driverRank.currentRank}
            </Text>
          </View>

          {/* Rank Info */}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
              <Text style={{ fontSize: 18, fontWeight: "bold", color: "#333" }}>
                {driverRank.level}
              </Text>
              <View
                style={{
                  backgroundColor: getLevelColor(driverRank.level) + "20",
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 12,
                  marginLeft: 8,
                }}
              >
                <Text style={{ fontSize: 10, color: getLevelColor(driverRank.level) }}>
                  {driverRank.percentile}%
                </Text>
              </View>
            </View>

            <Text style={{ fontSize: 14, color: "#666", marginBottom: 5 }}>
              {driverRank.points} points • Top {driverRank.percentile}%
            </Text>

            {/* Progress to next level */}
            <View style={{ marginTop: 5 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
                <Text style={{ fontSize: 10, color: "#666" }}>Next: {driverRank.nextLevel}</Text>
                <Text style={{ fontSize: 10, color: "#666" }}>{driverRank.pointsToNextLevel} pts needed</Text>
              </View>
              <View
                style={{
                  height: 4,
                  backgroundColor: "#E5E7EB",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    width: `${Math.min(100, (driverRank.points / (driverRank.points + driverRank.pointsToNextLevel)) * 100)}%`,
                    height: "100%",
                    backgroundColor: getLevelColor(driverRank.level),
                  }}
                />
              </View>
            </View>
          </View>
        </View>

        {/* Stats Grid */}
        <View style={{ flexDirection: "row", marginTop: 20, gap: 10 }}>
          <View
            style={{
              flex: 1,
              backgroundColor: "#F9FAFB",
              borderRadius: 16,
              padding: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#183B5C" }}>
              {driverRank.totalDrivers}
            </Text>
            <Text style={{ fontSize: 11, color: "#666", marginTop: 2 }}>Total Drivers</Text>
          </View>

          <View
            style={{
              flex: 1,
              backgroundColor: "#F9FAFB",
              borderRadius: 16,
              padding: 12,
              alignItems: "center",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ fontSize: 18, fontWeight: "bold", color: "#183B5C" }}>
                {performance.rating}
              </Text>
              <Ionicons name="star" size={14} color="#F59E0B" style={{ marginLeft: 2 }} />
            </View>
            <Text style={{ fontSize: 11, color: "#666", marginTop: 2 }}>Rating</Text>
          </View>

          <View
            style={{
              flex: 1,
              backgroundColor: "#F9FAFB",
              borderRadius: 16,
              padding: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#183B5C" }}>
              {performance.tripsThisWeek}
            </Text>
            <Text style={{ fontSize: 11, color: "#666", marginTop: 2 }}>Trips/Week</Text>
          </View>
        </View>
      </View>

      {/* Top 3 Drivers */}
      <View style={{ marginHorizontal: 20, marginTop: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: "bold", color: "#333", marginBottom: 15 }}>
          🏆 Top Performers
        </Text>

        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "center" }}>
          {topDrivers.map((driver, index) => {
            const rank = index + 1;
            const badge = getRankBadge(rank);
            const height = rank === 1 ? 100 : rank === 2 ? 80 : 60;

            return (
              <View
                key={driver.id}
                style={{
                  flex: 1,
                  alignItems: "center",
                  marginHorizontal: 5,
                }}
              >
                {/* Crown for 1st place */}
                {rank === 1 && (
                  <Ionicons name="trophy" size={24} color="#FFD700" style={{ marginBottom: 5 }} />
                )}

                {/* Avatar */}
                <View
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 30,
                    backgroundColor: badge.bg,
                    justifyContent: "center",
                    alignItems: "center",
                    borderWidth: 3,
                    borderColor: badge.color,
                  }}
                >
                  {driver.profile_picture ? (
                    <Image
                      source={{ uri: driver.profile_picture }}
                      style={{ width: 54, height: 54, borderRadius: 27 }}
                    />
                  ) : (
                    <Ionicons name="person" size={30} color={badge.color} />
                  )}
                </View>

                {/* Name */}
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: "#333",
                    marginTop: 8,
                    textAlign: "center",
                  }}
                  numberOfLines={1}
                >
                  {driver.first_name}
                </Text>

                {/* Points */}
                <View
                  style={{
                    backgroundColor: badge.bg,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 12,
                    marginTop: 4,
                  }}
                >
                  <Text style={{ fontSize: 10, color: badge.color, fontWeight: "600" }}>
                    {driver.points} pts
                  </Text>
                </View>

                {/* Rank Badge */}
                <View
                  style={{
                    position: "absolute",
                    top: rank === 1 ? 30 : 25,
                    right: 5,
                    backgroundColor: badge.color,
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    justifyContent: "center",
                    alignItems: "center",
                    borderWidth: 2,
                    borderColor: "#FFF",
                  }}
                >
                  <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "bold" }}>
                    {rank}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Performance Chart */}
      {/* <View
        style={{
          marginHorizontal: 20,
          marginTop: 20,
          backgroundColor: "#FFF",
          borderRadius: 24,
          padding: 20,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "bold", color: "#333", marginBottom: 15 }}>
          📈 Points This Week
        </Text>

        <View style={{ alignItems: "center" }}>
          <LineChart
            data={{
              labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
              datasets: [
                {
                  data: weeklyPoints,
                  color: () => "#FFB37A",
                  strokeWidth: 2,
                },
              ],
            }}
            width={screenWidth - 60}
            height={150}
            yAxisLabel=""
            yAxisSuffix=" pts"
            chartConfig={{
              backgroundGradientFrom: "#FFF",
              backgroundGradientTo: "#FFF",
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(24, 59, 92, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(0,0,0,${opacity})`,
              style: { borderRadius: 16 },
              propsForDots: { r: "4", strokeWidth: "2", stroke: "#183B5C" },
            }}
            style={{ marginVertical: 8, borderRadius: 16 }}
            fromZero={true}
          />
        </View>
      </View> */}

      {/* Nearby Drivers */}
      <View
        style={{
          marginHorizontal: 20,
          marginTop: 20,
          backgroundColor: "#FFF",
          borderRadius: 24,
          padding: 20,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "bold", color: "#333", marginBottom: 15 }}>
          🎯 Nearby in Ranking
        </Text>

        {nearbyDrivers.map((driver, index) => {
          const isCurrentDriver = driver.id === driverId;
          const driverRank = leaderboard.findIndex(d => d.id === driver.id) + 1;

          return (
            <View
              key={driver.id}
              style={[
                {
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 12,
                  borderBottomWidth: index === nearbyDrivers.length - 1 ? 0 : 1,
                  borderBottomColor: "#F3F4F6",
                },
                isCurrentDriver && {
                  backgroundColor: "#F0F9FF",
                  borderRadius: 12,
                  paddingHorizontal: 10,
                  marginHorizontal: -10,
                },
              ]}
            >
              <Text
                style={{
                  width: 30,
                  fontSize: 16,
                  fontWeight: isCurrentDriver ? "bold" : "400",
                  color: isCurrentDriver ? "#183B5C" : "#666",
                }}
              >
                #{driverRank}
              </Text>

              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: "#F3F4F6",
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: 12,
                }}
              >
                {driver.profile_picture ? (
                  <Image
                    source={{ uri: driver.profile_picture }}
                    style={{ width: 36, height: 36, borderRadius: 18 }}
                  />
                ) : (
                  <Ionicons name="person" size={20} color="#9CA3AF" />
                )}
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: isCurrentDriver ? "bold" : "500",
                    color: isCurrentDriver ? "#183B5C" : "#333",
                  }}
                >
                  {driver.first_name} {driver.last_name}
                  {isCurrentDriver && " (You)"}
                </Text>
                <Text style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                  {driver.points} points
                </Text>
              </View>

              {isCurrentDriver && (
                <View
                  style={{
                    backgroundColor: "#183B5C",
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 12,
                  }}
                >
                  <Text style={{ color: "#FFF", fontSize: 10, fontWeight: "bold" }}>
                    Current
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* Performance Metrics */}
      <View
        style={{
          marginHorizontal: 20,
          marginTop: 20,
          backgroundColor: "#FFF",
          borderRadius: 24,
          padding: 20,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "bold", color: "#333", marginBottom: 15 }}>
          📊 Performance Metrics
        </Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 15 }}>
          <View style={{ width: "48%" }}>
            <Text style={{ fontSize: 12, color: "#666", marginBottom: 2 }}>Acceptance Rate</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ fontSize: 18, fontWeight: "bold", color: "#183B5C" }}>
                {performance.acceptanceRate}%
              </Text>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" style={{ marginLeft: 5 }} />
            </View>
          </View>

          <View style={{ width: "48%" }}>
            <Text style={{ fontSize: 12, color: "#666", marginBottom: 2 }}>Completion Rate</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ fontSize: 18, fontWeight: "bold", color: "#183B5C" }}>
                {performance.completionRate}%
              </Text>
              <Ionicons name="flag" size={16} color="#3B82F6" style={{ marginLeft: 5 }} />
            </View>
          </View>

          <View style={{ width: "48%" }}>
            <Text style={{ fontSize: 12, color: "#666", marginBottom: 2 }}>Weekly Earnings</Text>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#183B5C" }}>
              ₱{performance.earningsThisWeek.toFixed(0)}
            </Text>
          </View>

          <View style={{ width: "48%" }}>
            <Text style={{ fontSize: 12, color: "#666", marginBottom: 2 }}>Response Time</Text>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#183B5C" }}>2.5 min</Text>
          </View>
        </View>
      </View>

      {/* Info Card */}
      <View
        style={{
          marginHorizontal: 20,
          marginTop: 20,
          padding: 15,
          backgroundColor: "#F0F9FF",
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "#B2D9FF",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
          <Ionicons name="information-circle" size={20} color="#3B82F6" />
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#183B5C", marginLeft: 8 }}>
            How Rankings Work
          </Text>
        </View>
        <Text style={{ fontSize: 12, color: "#4B5563", marginBottom: 5 }}>
          • Points are earned for completed trips (10 points per trip)
        </Text>
        <Text style={{ fontSize: 12, color: "#4B5563", marginBottom: 5 }}>
          • Higher ratings and completion rates boost your ranking
        </Text>
        <Text style={{ fontSize: 12, color: "#4B5563" }}>
          • Rankings update in real-time based on your performance
        </Text>
      </View>
    </ScrollView>
  );
}