import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

const COLORS = {
  navy: "#183B5C",
  navyLight: "#1E4A73",
  orange: "#E97A3E",
  gray500: "#6B7A8A",
  gray300: "#BEC8D2",
  gray100: "#EEF1F4",
  gray50: "#F6F8FA",
  white: "#FFFFFF",
  green: "#16A34A",
  greenLight: "#DCFCE7",
  red: "#DC2626",
};

const PAGE_SIZE = 10;

function TripCard({ item, navigation }) {
  const paymentMethod = item.payment_method || item.payment_type || "cash";
  const pmColor =
    paymentMethod === "gcash"
      ? COLORS.navy
      : paymentMethod === "cash"
      ? COLORS.green
      : COLORS.gray500;

  const pmBg =
    paymentMethod === "gcash"
      ? "#EBF2FA"
      : paymentMethod === "cash"
      ? COLORS.greenLight
      : COLORS.gray100;

  const fareValue =
    item.actual_fare !== null && item.actual_fare !== undefined
      ? Number(item.actual_fare)
      : Number(item.fare || 0);

  return (
    <Pressable
      onPress={() => navigation.navigate("TripDetailsScreen", { tripId: item.id })}
      style={({ pressed }) => ({
        backgroundColor: COLORS.white,
        borderRadius: 16,
        padding: 14,
        marginBottom: 10,
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: COLORS.gray100,
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: pmBg,
          justifyContent: "center",
          alignItems: "center",
          marginRight: 12,
        }}
      >
        <Ionicons
          name={
            paymentMethod === "gcash"
              ? "logo-paypal"
              : paymentMethod === "cash"
              ? "cash-outline"
              : "wallet-outline"
          }
          size={18}
          color={pmColor}
        />
      </View>

      <View style={{ flex: 1, marginRight: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: COLORS.green,
              marginRight: 6,
            }}
          />
          <Text style={{ fontSize: 12, color: "#3D4D5C", flex: 1 }} numberOfLines={1}>
            {item.pickup_location?.split(",")[0] || "Pickup"}
          </Text>
        </View>

        <View
          style={{
            width: 1,
            height: 8,
            backgroundColor: COLORS.gray300,
            marginLeft: 2.5,
            marginBottom: 4,
          }}
        />

        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: COLORS.red,
              marginRight: 6,
            }}
          />
          <Text style={{ fontSize: 12, color: "#3D4D5C", flex: 1 }} numberOfLines={1}>
            {item.dropoff_location?.split(",")[0] || "Dropoff"}
          </Text>
        </View>

        <Text style={{ fontSize: 10, color: COLORS.gray500, marginTop: 6 }}>
          {item.ride_completed_at
            ? new Date(item.ride_completed_at).toLocaleString([], {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—"}
        </Text>
      </View>

      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: COLORS.navy }}>
          ₱{fareValue.toFixed(2)}
        </Text>
        <Text style={{ fontSize: 10, color: COLORS.gray500, marginTop: 2 }}>
          {item.distance_km ? `${Number(item.distance_km).toFixed(1)} km` : "—"}
        </Text>
      </View>
    </Pressable>
  );
}

export default function AllTripsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [driverId, setDriverId] = useState(null);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  const fetchTrips = useCallback(async (pageToLoad = 0, isRefresh = false) => {
    try {
      if (!driverId) return;

      if (pageToLoad === 0 && !isRefresh) setLoading(true);
      if (isRefresh) setRefreshing(true);
      if (pageToLoad > 0) setLoadingMore(true);

      const from = pageToLoad * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, pickup_location, dropoff_location, fare, actual_fare, distance_km, ride_completed_at, payment_method, payment_type, status"
        )
        .eq("driver_id", driverId)
        .eq("status", "completed")
        .order("ride_completed_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      const safeData = data || [];

      if (pageToLoad === 0) {
        setTrips(safeData);
      } else {
        setTrips((prev) => [...prev, ...safeData]);
      }

      setHasMore(safeData.length === PAGE_SIZE);
      setPage(pageToLoad);
    } catch (error) {
      console.log("Error fetching all trips:", error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [driverId]);

  useEffect(() => {
    const init = async () => {
      try {
        const storedUserId = await AsyncStorage.getItem("user_id");
        if (!storedUserId) {
          setLoading(false);
          return;
        }
        setDriverId(storedUserId);
      } catch (error) {
        console.log("Error reading user_id:", error.message);
        setLoading(false);
      }
    };

    init();
  }, []);

  useEffect(() => {
    if (driverId) {
      fetchTrips(0);
    }
  }, [driverId, fetchTrips]);

  useFocusEffect(
    useCallback(() => {
      if (driverId) {
        fetchTrips(0);
      }
    }, [driverId, fetchTrips])
  );

  const handleRefresh = () => {
    fetchTrips(0, true);
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore && !loading && trips.length > 0) {
      fetchTrips(page + 1);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.white, justifyContent: "center", alignItems: "center" }}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
        <ActivityIndicator size="large" color={COLORS.navy} />
        <Text style={{ marginTop: 12, color: COLORS.gray500 }}>Loading trips…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.gray50 }}>
      <StatusBar barStyle="light-content" />

      <View
        style={{
          backgroundColor: COLORS.navy,
          paddingTop: insets.top + 12,
          paddingBottom: 18,
          paddingHorizontal: 20,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            backgroundColor: "rgba(255,255,255,0.12)",
            justifyContent: "center",
            alignItems: "center",
            marginRight: 12,
          }}
        >
          <Ionicons name="arrow-back" size={20} color={COLORS.white} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: COLORS.white }}>
            All Trips
          </Text>
          <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
            Completed trip history
          </Text>
        </View>
      </View>

      <FlatList
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
          flexGrow: trips.length === 0 ? 1 : 0,
        }}
        data={trips}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => <TripCard item={item} navigation={navigation} />}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.navy}
            colors={[COLORS.navy]}
          />
        }
        ListEmptyComponent={
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: COLORS.gray50,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: COLORS.gray100,
              paddingVertical: 48,
            }}
          >
            <Ionicons name="bicycle-outline" size={40} color={COLORS.gray300} />
            <Text style={{ marginTop: 12, color: COLORS.gray500, fontSize: 14 }}>
              No trips found
            </Text>
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={{ paddingVertical: 16 }}>
              <ActivityIndicator size="small" color={COLORS.navy} />
            </View>
          ) : null
        }
      />
    </View>
  );
}