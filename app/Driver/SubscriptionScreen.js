//Driver/SubscriptionScreen.js
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
  const [driverData, setDriverData] = useState(null);

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

  // Fetch all data when driverId is available
  useEffect(() => {
    const loadData = async () => {
      if (driverId) {
        setLoading(true);
        try {
          await Promise.all([
            fetchDriverData(),
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

  const fetchDriverData = async () => {
    try {
      console.log("🔍 Fetching driver data for ID:", driverId);
      
      const { data, error } = await supabase
        .from('drivers')
        .select('has_used_trial, is_active, first_name, last_name')
        .eq('id', driverId)
        .single();
        
      if (error) throw error;
      
      console.log("✅ Driver data:", data);
      setDriverData(data);
    } catch (error) {
      console.error("Error fetching driver data:", error);
    }
  };

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

  const processSubscription = async (plan) => {
    if (!driverId) {
      Alert.alert("Error", "Loading user data. Please try again.");
      return;
    }

    setSubscribing(true);
    
    try {
      console.log("🚀 Processing plan:", plan.plan_name, "Price: ₱" + plan.price);

      // ✅ Check kung FREE PLAN (0 pesos)
      if (plan.price === 0) {
        
        // IMPORTANT: Check kung nakagamit na ng free trial
        console.log("🔍 Checking if driver has used trial before...");
        
        const { data: driverCheck, error: driverError } = await supabase
          .from('drivers')
          .select('has_used_trial')
          .eq('id', driverId)
          .single();

        if (driverError) throw driverError;

        // Kung naka-trial na, bawal na ulit
        if (driverCheck?.has_used_trial) {
          Alert.alert(
            "Trial Already Used",
            "You have already used your free trial. Please select a paid plan to continue.",
            [{ text: "OK" }]
          );
          setSubscribing(false);
          return;
        }

        // Check din kung may active subscription pa
        const { data: activeSub } = await supabase
          .from('driver_subscriptions')
          .select('id')
          .eq('driver_id', driverId)
          .eq('status', 'active')
          .gte('end_date', new Date().toISOString())
          .maybeSingle();

        if (activeSub) {
          Alert.alert(
            "Active Subscription",
            "You still have an active subscription. Wait for it to expire before using trial.",
            [{ text: "OK" }]
          );
          setSubscribing(false);
          return;
        }

        console.log("🎉 First-time trial user! Activating free plan...");
        
        // Calculate subscription dates
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(startDate.getDate() + plan.duration_days);
        
        // Insert subscription directly to database
        const { data: subscription, error: subError } = await supabase
          .from('driver_subscriptions')
          .insert([{
            driver_id: driverId,
            plan_id: plan.id,
            status: 'active',
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString(),
            amount_paid: 0,
            payment_method: 'free_trial',
            payment_reference: `free_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          }])
          .select()
          .single();

        if (subError) throw subError;

        // IMPORTANT: Mark driver as used trial
        const { error: updateError } = await supabase
          .from('drivers')
          .update({ 
            is_active: true,
            has_used_trial: true
          })
          .eq('id', driverId);

        if (updateError) {
          console.warn("Driver update failed:", updateError);
        }

        // Update local state
        setDriverData(prev => ({ ...prev, has_used_trial: true }));
        await fetchCurrentSubscription(); // Refresh current subscription
        
        console.log("✅ Free plan activated successfully!");
        
        // Show success message
        Alert.alert(
          "Success! 🎉",
          `Your ${plan.duration_days}-day free trial is now active. Enjoy!`,
          [{ text: "OK", onPress: () => navigation.replace("DriverHomePage") }]
        );
        
        return;
      }

      // 💰 PAID PLAN - Check if may active subscription
      const { data: activeSub } = await supabase
        .from('driver_subscriptions')
        .select('id, end_date')
        .eq('driver_id', driverId)
        .eq('status', 'active')
        .gte('end_date', new Date().toISOString())
        .maybeSingle();

      if (activeSub) {
        const daysLeft = Math.ceil((new Date(activeSub.end_date) - new Date()) / (1000 * 60 * 60 * 24));
        Alert.alert(
          "Active Subscription",
          `You still have an active subscription for ${daysLeft} more days. You can purchase a new plan when it expires.`,
          [{ text: "OK" }]
        );
        setSubscribing(false);
        return;
      }

      // Proceed with PayMongo for paid plans
      console.log("💰 Paid plan detected. Proceeding to payment...");
      
      const { data, error } = await supabase.functions.invoke('paymongo-checkout', {
        body: {
          driverId: driverId,
          planId: plan.id,
          amount: plan.price,
          planName: plan.plan_name,
          durationDays: plan.duration_days
        }
      });

      if (error) throw error;

      const checkoutUrl = data?.data?.attributes?.checkout_url;

      if (checkoutUrl) {
        navigation.navigate("PaymentWebView", { url: checkoutUrl });
      } else {
        throw new Error("Could not retrieve payment URL.");
      }

    } catch (err) {
      console.log("❌ Error:", err.message);
      Alert.alert(
        "Subscription Error", 
        plan.price === 0 
          ? "Hindi ma-activate ang free trial. Pakisubukan ulit."
          : "Hindi ma-generate ang payment link. Pakicheck ang internet connection."
      );
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
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F5F7FA" }}>
        <ActivityIndicator size="large" color="#183B5C" />
        <Text style={{ marginTop: 10, color: "#666" }}>Loading subscription plans...</Text>
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
                {new Date(currentSubscription.end_date).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#666", fontSize: 12 }}>Days Left</Text>
              <Text style={{ fontWeight: "600", fontSize: 16, color: "#4CAF50" }}>
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

        {plans.length === 0 ? (
          <View style={{ alignItems: 'center', padding: 30 }}>
            <Ionicons name="alert-circle-outline" size={50} color="#999" />
            <Text style={{ marginTop: 10, color: '#666', textAlign: 'center' }}>
              No subscription plans available at the moment.
            </Text>
          </View>
        ) : (
          plans.map((plan) => {
            const isFree = plan.price === 0;
            const isCurrentPlan = currentSubscription?.plan_id === plan.id;
            const hasUsedTrial = driverData?.has_used_trial;
            
            // Determine if plan is disabled
            let isDisabled = subscribing || isCurrentPlan;
            
            // For trial plans, disable if already used trial
            if (isFree && hasUsedTrial && !isCurrentPlan) {
              isDisabled = true;
            }
            
            // Get button/text status
            let planStatus = '';
            let statusColor = '';
            
            if (isCurrentPlan) {
              const now = new Date();
              const expiryDate = new Date(currentSubscription.end_date);
              const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
              
              if (expiryDate < now) {
                planStatus = 'EXPIRED';
                statusColor = '#FF4444';
              } else {
                planStatus = `${daysLeft} day${daysLeft > 1 ? 's' : ''} left`;
                statusColor = '#4CAF50';
              }
            } else if (isFree && hasUsedTrial) {
              planStatus = 'USED';
              statusColor = '#999';
            } else if (isFree && !hasUsedTrial) {
              planStatus = 'TRY FOR FREE';
              statusColor = '#4CAF50';
            }

            return (
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
                  opacity: (pressed && !isDisabled) ? 0.9 : (isDisabled ? 0.6 : 1),
                  borderWidth: isCurrentPlan ? 2 : (isFree ? 1 : 0),
                  borderColor: isCurrentPlan 
                    ? getPlanColor(plan.plan_type)
                    : isFree 
                      ? statusColor 
                      : "transparent",
                  backgroundColor: isFree && !isCurrentPlan 
                    ? (hasUsedTrial ? "#FFF5F5" : "#F8FFF8") 
                    : "#FFF",
                })}
                onPress={() => processSubscription(plan)}
                disabled={isDisabled}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View
                    style={{
                      width: 50,
                      height: 50,
                      borderRadius: 25,
                      backgroundColor: (isFree ? statusColor : getPlanColor(plan.plan_type)) + "20",
                      justifyContent: "center",
                      alignItems: "center",
                      marginRight: 15,
                    }}
                  >
                    <Ionicons
                      name={isFree ? "gift-outline" : getPlanIcon(plan.plan_type)}
                      size={28}
                      color={isFree ? statusColor : getPlanColor(plan.plan_type)}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 18, fontWeight: "bold", color: "#333" }}>
                      {plan.plan_name}
                      {isFree && (
                        <Text style={{ 
                          fontSize: 12, 
                          color: statusColor, 
                          marginLeft: 8,
                          fontWeight: "normal" 
                        }}>
                          {" "}({hasUsedTrial ? 'Used' : 'Trial'})
                        </Text>
                      )}
                    </Text>
                    <Text style={{ fontSize: 14, color: "#666", marginTop: 2 }}>
                      {plan.plan_type === "trial"
                        ? `Free for ${plan.duration_days} days`
                        : `${plan.duration_days} days validity`}
                    </Text>
                  </View>

                  <View style={{ alignItems: "flex-end" }}>
                    {isFree ? (
                      <>
                        <Text style={{ fontSize: 22, fontWeight: "bold", color: statusColor }}>
                          FREE
                        </Text>
                        <Text style={{ fontSize: 12, color: "#999" }}>
                          ₱{plan.price} value
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text style={{ fontSize: 22, fontWeight: "bold", color: "#183B5C" }}>
                          ₱{plan.price}
                        </Text>
                        {plan.max_bookings && (
                          <Text style={{ fontSize: 12, color: "#999" }}>
                            {plan.max_bookings} bookings max
                          </Text>
                        )}
                      </>
                    )}
                  </View>
                </View>

                {plan.description && (
                  <Text style={{ 
                    marginTop: 10, 
                    color: isFree ? statusColor : "#666", 
                    fontStyle: "italic" 
                  }}>
                    {plan.description}
                  </Text>
                )}

                {/* Plan Badges */}
                {planStatus && (
                  <View
                    style={{
                      position: "absolute",
                      top: -5,
                      right: 10,
                      backgroundColor: statusColor,
                      paddingHorizontal: 10,
                      paddingVertical: 3,
                      borderRadius: 12,
                      elevation: 2,
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: "bold", color: "#FFF" }}>
                      {planStatus}
                    </Text>
                  </View>
                )}

                {/* Popular Badge (for non-free trial plans) */}
                {plan.plan_type === "trial" && !isFree && !isCurrentPlan && !planStatus && (
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

                {/* Current Plan Badge - only show if not expired */}
                {isCurrentPlan && planStatus !== 'EXPIRED' && (
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
            );
          })
        )}
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