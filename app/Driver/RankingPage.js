import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Image,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";

export default function RankingPage({ navigation }) {
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get("window").width - 40;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [driverId, setDriverId] = useState(null);
  const [driver, setDriver] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState("week"); // week, month, all

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
    rating: "0.0",
    acceptanceRate: 0,
    completionRate: 0,
  });

  const [weeklyPoints, setWeeklyPoints] = useState([0, 0, 0, 0, 0, 0, 0]);

  useFocusEffect(
    useCallback(() => {
      const getDriverId = async () => {
        try {
          const id = await AsyncStorage.getItem("user_id");
          setDriverId(id);
        } catch (error) {
          console.log("Error getting driver ID:", error);
        }
      };
      getDriverId();
    }, [])
  );

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
        fetchDriverRankAndLeaderboard(),
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
    try {
      setRefreshing(true);
      await loadRankingData();
    } finally {
      setRefreshing(false);
    }
  };

  const getPeriodStartDate = (period) => {
    const now = new Date();
    let startDate = new Date(now);

    if (period === "week") {
      // Monday start, Sunday-safe
      const day = now.getDay(); // Sun=0, Mon=1 ... Sat=6
      const diffToMonday = day === 0 ? 6 : day - 1;
      startDate.setDate(now.getDate() - diffToMonday);
      startDate.setHours(0, 0, 0, 0);
    } else if (period === "month") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate.setHours(0, 0, 0, 0);
    } else {
      startDate = new Date("2000-01-01T00:00:00");
    }

    return startDate;
  };

  const fetchDriverProfile = async () => {
    try {
      const { data, error } = await supabase
        .from("drivers")
        .select("id, first_name, last_name, profile_picture, status")
        .eq("id", driverId)
        .single();

      if (error) throw error;
      setDriver(data);
    } catch (err) {
      console.log("Error fetching profile:", err.message);
    }
  };

  const fetchDriverRankAndLeaderboard = async () => {
    try {
      const startDate = getPeriodStartDate(selectedPeriod);

      const { data: allDrivers, error: driversError } = await supabase
        .from("drivers")
        .select("id, first_name, last_name, profile_picture")
        .eq("status", "approved");

      if (driversError) throw driversError;

      const leaderboardData = await Promise.all(
        (allDrivers || []).map(async (d) => {
          const { data: bookings, error: bookingsError } = await supabase
            .from("bookings")
            .select("fare, commuter_rating, ride_completed_at, status")
            .eq("driver_id", d.id)
            .eq("status", "completed")
            .not("ride_completed_at", "is", null)
            .gte("ride_completed_at", startDate.toISOString());

          if (bookingsError) throw bookingsError;

          const trips = bookings?.length || 0;
          const points = trips * 10;

          const ratings = (bookings || [])
            .filter((b) => b.commuter_rating != null)
            .map((b) => Number(b.commuter_rating));

          const avgRating =
            ratings.length > 0
              ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
              : 0;

          return {
            ...d,
            trips,
            points,
            rating: avgRating,
          };
        })
      );

      const sortedDrivers = leaderboardData
        .sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          if (b.rating !== a.rating) return b.rating - a.rating;
          return b.trips - a.trips;
        })
        .map((item, index) => ({
          ...item,
          rank: index + 1,
          ratingText: item.rating.toFixed(1),
        }));

      setLeaderboard(sortedDrivers);
      setTopDrivers(sortedDrivers.slice(0, 3));

      const currentDriverIndex = sortedDrivers.findIndex((d) => d.id === driverId);
      const currentRank = currentDriverIndex >= 0 ? currentDriverIndex + 1 : 0;
      const totalDrivers = sortedDrivers.length;

      const percentile =
        currentRank > 0 && totalDrivers > 0
          ? ((totalDrivers - currentRank) / totalDrivers) * 100
          : 0;

      const currentDriverPoints =
        currentDriverIndex >= 0 ? sortedDrivers[currentDriverIndex].points : 0;

      let level = "Bronze";
      let nextLevel = "Silver";
      let pointsToNextLevel = 500 - currentDriverPoints;

      if (currentDriverPoints >= 3000) {
        level = "Legend";
        nextLevel = "Max";
        pointsToNextLevel = 0;
      } else if (currentDriverPoints >= 2000) {
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

      if (currentDriverIndex >= 0) {
        const start = Math.max(0, currentDriverIndex - 2);
        const end = Math.min(totalDrivers, currentDriverIndex + 3);
        setNearbyDrivers(sortedDrivers.slice(start, end));
      } else {
        setNearbyDrivers([]);
      }
    } catch (err) {
      console.log("Error fetching rank/leaderboard:", err.message);
    }
  };

  const fetchPerformance = async () => {
    try {
      const startDate = getPeriodStartDate(selectedPeriod);

      const { data: periodBookings, error: periodError } = await supabase
        .from("bookings")
        .select("fare, commuter_rating, status, ride_completed_at")
        .eq("driver_id", driverId)
        .eq("status", "completed")
        .not("ride_completed_at", "is", null)
        .gte("ride_completed_at", startDate.toISOString());

      if (periodError) throw periodError;

      const tripsCount = periodBookings?.length || 0;
      const earningsTotal =
        periodBookings?.reduce((sum, b) => sum + Number(b.fare || 0), 0) || 0;

      const { data: allBookings, error: allError } = await supabase
        .from("bookings")
        .select("commuter_rating, status")
        .eq("driver_id", driverId);

      if (allError) throw allError;

      const completedBookings =
        allBookings?.filter((b) => b.status === "completed") || [];
      const totalBookings = allBookings?.length || 0;

      const ratings = completedBookings
        .filter((b) => b.commuter_rating != null)
        .map((b) => Number(b.commuter_rating));

      const avgRating =
        ratings.length > 0
          ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
          : 0;

      const acceptanceRate = 95;
      const completionRate =
        totalBookings > 0 ? (completedBookings.length / totalBookings) * 100 : 0;

      setPerformance({
        tripsThisWeek: tripsCount,
        earningsThisWeek: earningsTotal,
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
      const startOfWeek = getPeriodStartDate("week");

      const { data, error } = await supabase
        .from("bookings")
        .select("ride_completed_at")
        .eq("driver_id", driverId)
        .eq("status", "completed")
        .not("ride_completed_at", "is", null)
        .gte("ride_completed_at", startOfWeek.toISOString());

      if (error) throw error;

      const dailyPoints = [0, 0, 0, 0, 0, 0, 0];

      (data || []).forEach((booking) => {
        const date = new Date(booking.ride_completed_at);
        let dayIndex = date.getDay(); // Sun=0
        dayIndex = dayIndex === 0 ? 6 : dayIndex - 1; // Mon=0 ... Sun=6
        dailyPoints[dayIndex] += 10;
      });

      setWeeklyPoints(dailyPoints);
    } catch (err) {
      console.log("Error fetching weekly points:", err.message);
    }
  };

  const getLevelColor = (level) => {
    switch (level) {
      case "Bronze":
        return "#CD7F32";
      case "Silver":
        return "#C0C0C0";
      case "Gold":
        return "#FFD700";
      case "Diamond":
        return "#B9F2FF";
      case "Legend":
        return "#8B5CF6";
      default:
        return "#6B7280";
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

  const tripLabel =
    selectedPeriod === "week"
      ? "Trips/Week"
      : selectedPeriod === "month"
      ? "Trips/Month"
      : "All Trips";

  const earningsLabel =
    selectedPeriod === "week"
      ? "Weekly Earnings"
      : selectedPeriod === "month"
      ? "Monthly Earnings"
      : "Total Earnings";

  const performanceTitle =
    selectedPeriod === "week"
      ? "📊 Weekly Performance"
      : selectedPeriod === "month"
      ? "📊 Monthly Performance"
      : "📊 Overall Performance";

  if (loading && !refreshing) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#F5F7FA",
        }}
      >
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
            <Text
              style={{
                fontSize: 32,
                fontWeight: "bold",
                color: getLevelColor(driverRank.level),
              }}
            >
              #{driverRank.currentRank || 0}
            </Text>
          </View>

          <View style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 5,
              }}
            >
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
                <Text
                  style={{
                    fontSize: 10,
                    color: getLevelColor(driverRank.level),
                  }}
                >
                  {driverRank.percentile}%
                </Text>
              </View>
            </View>

            <Text style={{ fontSize: 14, color: "#666", marginBottom: 5 }}>
              {driverRank.points} points • Top {driverRank.percentile}%
            </Text>

            <View style={{ marginTop: 5 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginBottom: 2,
                }}
              >
                <Text style={{ fontSize: 10, color: "#666" }}>
                  Next: {driverRank.nextLevel}
                </Text>
                <Text style={{ fontSize: 10, color: "#666" }}>
                  {driverRank.pointsToNextLevel} pts needed
                </Text>
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
                    width: `${
                      Math.min(
                        100,
                        driverRank.points + driverRank.pointsToNextLevel > 0
                          ? (driverRank.points /
                              (driverRank.points +
                                driverRank.pointsToNextLevel)) *
                            100
                          : 0
                      )
                    }%`,
                    height: "100%",
                    backgroundColor: getLevelColor(driverRank.level),
                  }}
                />
              </View>
            </View>
          </View>
        </View>

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
            <Text style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
              Total Drivers
            </Text>
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
              <Ionicons
                name="star"
                size={14}
                color="#F59E0B"
                style={{ marginLeft: 2 }}
              />
            </View>
            <Text style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
              Rating
            </Text>
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
            <Text style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
              {tripLabel}
            </Text>
          </View>
        </View>
      </View>

      {/* Top 3 Drivers */}
      <View style={{ marginHorizontal: 20, marginTop: 20 }}>
        <Text
          style={{
            fontSize: 16,
            fontWeight: "bold",
            color: "#333",
            marginBottom: 15,
          }}
        >
          🏆 Top Performers
        </Text>

        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          {topDrivers.map((item, index) => {
            const rank = index + 1;
            const badge = getRankBadge(rank);

            return (
              <View
                key={item.id}
                style={{
                  flex: 1,
                  alignItems: "center",
                  marginHorizontal: 5,
                }}
              >
                {rank === 1 && (
                  <Ionicons
                    name="trophy"
                    size={24}
                    color="#FFD700"
                    style={{ marginBottom: 5 }}
                  />
                )}

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
                  {item.profile_picture ? (
                    <Image
                      source={{ uri: item.profile_picture }}
                      style={{ width: 54, height: 54, borderRadius: 27 }}
                    />
                  ) : (
                    <Ionicons name="person" size={30} color={badge.color} />
                  )}
                </View>

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
                  {item.first_name}
                </Text>

                <View
                  style={{
                    backgroundColor: badge.bg,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 12,
                    marginTop: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      color: badge.color,
                      fontWeight: "600",
                    }}
                  >
                    {item.points} pts
                  </Text>
                </View>

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
                  <Text
                    style={{ color: "#FFF", fontSize: 12, fontWeight: "bold" }}
                  >
                    {rank}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

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
        <Text
          style={{
            fontSize: 16,
            fontWeight: "bold",
            color: "#333",
            marginBottom: 15,
          }}
        >
          🎯 Nearby in Ranking
        </Text>

        {nearbyDrivers.length === 0 ? (
          <Text style={{ fontSize: 13, color: "#666" }}>
            No nearby ranking data yet.
          </Text>
        ) : (
          nearbyDrivers.map((item, index) => {
            const isCurrentDriver = item.id === driverId;

            return (
              <View
                key={item.id}
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
                  #{item.rank}
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
                  {item.profile_picture ? (
                    <Image
                      source={{ uri: item.profile_picture }}
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
                    {item.first_name} {item.last_name}
                    {isCurrentDriver ? " (You)" : ""}
                  </Text>
                  <Text style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                    {item.points} points
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
                    <Text
                      style={{
                        color: "#FFF",
                        fontSize: 10,
                        fontWeight: "bold",
                      }}
                    >
                      Current
                    </Text>
                  </View>
                )}
              </View>
            );
          })
        )}
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
        <Text
          style={{
            fontSize: 16,
            fontWeight: "bold",
            color: "#333",
            marginBottom: 15,
          }}
        >
          {performanceTitle}
        </Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 15 }}>
          <View style={{ width: "48%" }}>
            <Text style={{ fontSize: 12, color: "#666", marginBottom: 2 }}>
              Acceptance Rate
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ fontSize: 18, fontWeight: "bold", color: "#183B5C" }}>
                {performance.acceptanceRate}%
              </Text>
              <Ionicons
                name="checkmark-circle"
                size={16}
                color="#10B981"
                style={{ marginLeft: 5 }}
              />
            </View>
          </View>

          <View style={{ width: "48%" }}>
            <Text style={{ fontSize: 12, color: "#666", marginBottom: 2 }}>
              Completion Rate
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ fontSize: 18, fontWeight: "bold", color: "#183B5C" }}>
                {performance.completionRate}%
              </Text>
              <Ionicons
                name="flag"
                size={16}
                color="#3B82F6"
                style={{ marginLeft: 5 }}
              />
            </View>
          </View>

          <View style={{ width: "48%" }}>
            <Text style={{ fontSize: 12, color: "#666", marginBottom: 2 }}>
              {earningsLabel}
            </Text>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#183B5C" }}>
              ₱{Number(performance.earningsThisWeek || 0).toFixed(0)}
            </Text>
          </View>

          <View style={{ width: "48%" }}>
            <Text style={{ fontSize: 12, color: "#666", marginBottom: 2 }}>
              Response Time
            </Text>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#183B5C" }}>
              2.5 min
            </Text>
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
          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: "#183B5C",
              marginLeft: 8,
            }}
          >
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
          • Rankings update based on the selected period
        </Text>
      </View>
    </ScrollView>
  );
}