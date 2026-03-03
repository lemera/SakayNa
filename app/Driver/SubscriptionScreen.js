import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";

export default function SubscriptionScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [plans, setPlans] = useState([]);
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [driverId, setDriverId] = useState(null);

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

  // Fetch subscription plans and current subscription
useEffect(() => {
  const loadData = async () => {
    if (driverId) {
      setLoading(true);
      try {
        await Promise.all([
          fetchPlans(),
          fetchCurrentSubscription()
        ]);
      } catch (error) {
        console.log("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    }
  };
  
  loadData();
}, [driverId]);

const fetchPlans = async () => {
  try {
    console.log("🔍 Fetching plans for driver:", driverId);
    
    const { data, error } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("is_active", true)
      .order("price", { ascending: true });

    if (error) throw error;
    
    console.log("✅ Plans data from Supabase:", data);
    console.log("📊 Number of plans:", data?.length);
    
    setPlans(data || []);
  } catch (err) {
    console.log("❌ Error fetching plans:", err.message);
    Alert.alert("Error", "Hindi makuha ang subscription plans");
  }
};

const fetchCurrentSubscription = async () => {
  try {
    console.log("🔍 Fetching current subscription for driver:", driverId);
    
    const { data, error } = await supabase
      .from("driver_subscriptions")
      .select(`
        *,
        subscription_plans (
          plan_name,
          plan_type,
          price
        )
      `)
      .eq("driver_id", driverId)
      .eq("status", "active")
      .gte("end_date", new Date().toISOString())
      .order("end_date", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    
    console.log("✅ Current subscription:", data);
    setCurrentSubscription(data);
  } catch (err) {
    console.log("❌ Error fetching subscription:", err.message);
  }
};

  const handleSubscribe = async (plan) => {
    if (!driverId) return;

    Alert.alert(
      "Confirm Subscription",
      `Are you sure you want to subscribe to ${plan.plan_name} for ₱${plan.price}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Subscribe",
          onPress: () => processSubscription(plan),
        },
      ]
    );
  };

  const processSubscription = async (plan) => {
    try {
      setSubscribing(true);

      // Calculate end date based on plan duration
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + plan.duration_days);

      // Insert subscription
      const { data: subscription, error: subError } = await supabase
        .from("driver_subscriptions")
        .insert([
          {
            driver_id: driverId,
            plan_id: plan.id,
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString(),
            amount_paid: plan.price,
            payment_method: "wallet",
            status: "active",
          },
        ])
        .select()
        .single();

      if (subError) throw subError;

      // Deduct from wallet (kung may wallet integration)
      if (plan.price > 0) {
        await supabase
          .from("driver_wallets")
          .update({
            balance: supabase.raw("balance - ?", [plan.price]),
            updated_at: new Date(),
          })
          .eq("driver_id", driverId);
      }

      // Create notification
      await supabase.from("notifications").insert([
        {
          user_id: driverId,
          user_type: "driver",
          type: "subscription",
          title: "Subscription Activated! 🎉",
          message: `Your ${plan.plan_name} is now active until ${endDate.toLocaleDateString()}`,
          data: { plan_id: plan.id, end_date: endDate },
        },
      ]);

      // Log to audit
      await supabase.from("audit_logs").insert([
        {
          user_id: driverId,
          user_type: "driver",
          action: "INSERT",
          table_name: "driver_subscriptions",
          metadata: {
            plan: plan.plan_name,
            amount: plan.price,
            duration: plan.duration_days,
          },
        },
      ]);

      Alert.alert(
        "Success!",
        `You are now subscribed to ${plan.plan_name}!`,
        [
          {
            text: "OK",
            onPress: () => {
              fetchCurrentSubscription();
              navigation.goBack();
            },
          },
        ]
      );
    } catch (err) {
      console.log("Subscription error:", err.message);
      Alert.alert("Error", "Failed to process subscription. Please try again.");
    } finally {
      setSubscribing(false);
    }
  };

  const getPlanIcon = (planType) => {
    switch (planType) {
      case "trial":
        return "gift-outline";
      case "daily":
        return "today-outline";
      case "weekly":
        return "calendar-outline";
      default:
        return "card-outline";
    }
  };

  const getPlanColor = (planType) => {
    switch (planType) {
      case "trial":
        return "#10B981"; // green
      case "daily":
        return "#F59E0B"; // orange
      case "weekly":
        return "#3B82F6"; // blue
      default:
        return "#6B7280"; // gray
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#183B5C" />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F5F7FA" }}
      contentContainerStyle={{ paddingBottom: 30 }}
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
        <Pressable
          onPress={() => navigation.goBack()}
          style={{ position: "absolute", top: insets.top + 10, left: 20, zIndex: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </Pressable>

        <Text style={{ fontSize: 28, fontWeight: "bold", color: "#FFF", marginTop: 20 }}>
          Subscription Plans
        </Text>
        <Text style={{ fontSize: 16, color: "#FFB37A", marginTop: 5 }}>
          Choose a plan that works for you
        </Text>
      </View>

      {/* Current Active Subscription */}
      {currentSubscription && (
        <View
          style={{
            margin: 20,
            padding: 20,
            backgroundColor: "#E6F7E6",
            borderRadius: 16,
            borderWidth: 2,
            borderColor: "#4CAF50",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
            <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
            <Text style={{ fontSize: 18, fontWeight: "bold", marginLeft: 10, color: "#2E7D32" }}>
              Active Subscription
            </Text>
          </View>

          <Text style={{ fontSize: 20, fontWeight: "bold", color: "#183B5C" }}>
            {currentSubscription.subscription_plans?.plan_name}
          </Text>

          <View style={{ flexDirection: "row", marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#666", fontSize: 12 }}>Valid Until</Text>
              <Text style={{ fontWeight: "600", fontSize: 16 }}>
                {new Date(currentSubscription.end_date).toLocaleDateString()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#666", fontSize: 12 }}>Days Left</Text>
              <Text style={{ fontWeight: "600", fontSize: 16 }}>
                {Math.ceil(
                  (new Date(currentSubscription.end_date) - new Date()) /
                    (1000 * 60 * 60 * 24)
                )}{" "}
                days
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Plans List */}
      <View style={{ paddingHorizontal: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 15, color: "#333" }}>
          Available Plans
        </Text>

        {plans.map((plan) => (
          <Pressable
            key={plan.id}
            style={({ pressed }) => ({
              backgroundColor: "#FFF",
              borderRadius: 16,
              padding: 20,
              marginBottom: 15,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 8,
              elevation: 4,
              opacity: pressed ? 0.9 : 1,
              borderWidth: currentSubscription?.plan_id === plan.id ? 2 : 0,
              borderColor: getPlanColor(plan.plan_type),
            })}
            onPress={() => handleSubscribe(plan)}
            disabled={subscribing || currentSubscription?.plan_id === plan.id}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 25,
                  backgroundColor: getPlanColor(plan.plan_type) + "20",
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: 15,
                }}
              >
                <Ionicons
                  name={getPlanIcon(plan.plan_type)}
                  size={28}
                  color={getPlanColor(plan.plan_type)}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: "bold", color: "#333" }}>
                  {plan.plan_name}
                </Text>
                <Text style={{ fontSize: 14, color: "#666", marginTop: 2 }}>
                  {plan.plan_type === "trial"
                    ? `Free for ${plan.duration_days} days`
                    : `${plan.duration_days} days validity`}
                </Text>
              </View>

              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontSize: 22, fontWeight: "bold", color: "#183B5C" }}>
                  ₱{plan.price}
                </Text>
                {plan.max_bookings && (
                  <Text style={{ fontSize: 12, color: "#999" }}>
                    {plan.max_bookings} bookings max
                  </Text>
                )}
              </View>
            </View>

            {plan.description && (
              <Text style={{ marginTop: 10, color: "#666", fontStyle: "italic" }}>
                {plan.description}
              </Text>
            )}

            {plan.plan_type === "trial" && (
              <View
                style={{
                  position: "absolute",
                  top: -5,
                  right: 10,
                  backgroundColor: "#FFB37A",
                  paddingHorizontal: 10,
                  paddingVertical: 3,
                  borderRadius: 12,
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: "bold", color: "#183B5C" }}>
                  POPULAR
                </Text>
              </View>
            )}

            {currentSubscription?.plan_id === plan.id && (
              <View
                style={{
                  position: "absolute",
                  bottom: 10,
                  right: 10,
                  backgroundColor: "#4CAF50",
                  paddingHorizontal: 10,
                  paddingVertical: 3,
                  borderRadius: 12,
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: "bold", color: "#FFF" }}>
                  CURRENT
                </Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      {/* Info Section */}
      <View
        style={{
          margin: 20,
          padding: 20,
          backgroundColor: "#E8F0FE",
          borderRadius: 12,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "bold", marginBottom: 10 }}>
          📋 Important Notes:
        </Text>
        <Text style={{ color: "#555", marginBottom: 5 }}>• Subscriptions are non-refundable</Text>
        <Text style={{ color: "#555", marginBottom: 5 }}>
          • You can only go online if you have an active subscription
        </Text>
        <Text style={{ color: "#555", marginBottom: 5 }}>
          • Unused days will not be credited
        </Text>
        <Text style={{ color: "#555" }}>
          • Subscription auto-expires after the validity period
        </Text>
      </View>

      {/* Loading Overlay */}
      {subscribing && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: "#FFF",
              padding: 20,
              borderRadius: 10,
              alignItems: "center",
            }}
          >
            <ActivityIndicator size="large" color="#183B5C" />
            <Text style={{ marginTop: 10 }}>Processing subscription...</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}