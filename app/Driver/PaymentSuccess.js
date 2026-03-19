// Driver/PaymentSuccess.js
import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { supabase } from "../../lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function PaymentSuccess({ navigation }) {
  const [status, setStatus] = useState("Verifying your payment...");
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    let checkInterval;
    let timeoutId;
    
    const verifyPayment = async () => {
      const driverId = await AsyncStorage.getItem("user_id");
      console.log("🔍 Verifying payment for driver:", driverId);
      
      // I-check ang DB bawat 2 seconds
      checkInterval = setInterval(async () => {
        setAttempts(prev => {
          const newAttempts = prev + 1;
          console.log(`📊 Verification attempt ${newAttempts}/15`);
          
          // Update status message
          if (newAttempts === 3) {
            setStatus("Still verifying... this may take a few moments");
          } else if (newAttempts === 7) {
            setStatus("Almost done! Finalizing your subscription...");
          }
          
          return newAttempts;
        });

        const { data, error } = await supabase
          .from("driver_subscriptions")
          .select("id, status, end_date, plan_id")
          .eq("driver_id", driverId)
          .eq("status", "active")
          .gte("end_date", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(1);

        if (error) {
          console.error("❌ Error checking subscription:", error);
        }

        if (data && data.length > 0) {
          console.log("✅ Subscription found!", data[0]);
          clearInterval(checkInterval);
          clearTimeout(timeoutId);
          setStatus("Payment Verified! Redirecting to dashboard...");
          setTimeout(() => navigation.replace("DriverHomePage"), 1500);
        }
      }, 2000);
    };

    verifyPayment();

    // Timeout after 30 seconds (15 attempts)
    timeoutId = setTimeout(() => {
      clearInterval(checkInterval);
      console.log("⏰ Verification timeout reached");
      setStatus("Taking longer than expected. Please check your dashboard for confirmation.");
      setTimeout(() => navigation.replace("DriverHomePage"), 3000);
    }, 30000);

    return () => {
      clearInterval(checkInterval);
      clearTimeout(timeoutId);
    };
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#183B5C" />
      <Text style={styles.text}>{status}</Text>
      <Text style={styles.attempts}>Attempt {attempts}/15</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: '#FFF' 
  },
  text: { 
    marginTop: 20, 
    fontSize: 16, 
    color: '#183B5C', 
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 20
  },
  attempts: {
    marginTop: 10,
    fontSize: 12,
    color: '#666'
  }
});