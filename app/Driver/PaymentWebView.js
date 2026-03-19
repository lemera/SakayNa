// Driver/PaymentWebView.js
import React, { useRef } from "react";
import { WebView } from "react-native-webview";
import { View, ActivityIndicator, Alert } from "react-native";

export default function PaymentWebView({ route, navigation }) {
  const { url } = route.params;
  const webViewRef = useRef(null);

  // Para makita kung auto-filled ang forms
  const injectedJavaScript = `
    (function() {
      setTimeout(function() {
        console.log("🔍 Checking form fields...");
        const nameInputs = document.querySelectorAll('input[name="name"], input[placeholder*="name" i], input[type="text"]');
        const emailInputs = document.querySelectorAll('input[type="email"], input[name="email"]');
        const phoneInputs = document.querySelectorAll('input[type="tel"], input[name="phone"]');
        
        console.log("Found name inputs:", nameInputs.length);
        console.log("Found email inputs:", emailInputs.length);
        console.log("Found phone inputs:", phoneInputs.length);
        
        nameInputs.forEach(input => console.log("Name field value:", input.value));
        emailInputs.forEach(input => console.log("Email field value:", input.value));
        phoneInputs.forEach(input => console.log("Phone field value:", input.value));
      }, 3000);
    })();
  `;

  return (
    <WebView
      ref={webViewRef}
      source={{ uri: url }}
      originWhitelist={['*', 'sakayna://*']}
      startInLoadingState
      injectedJavaScript={injectedJavaScript}
      onMessage={(event) => {
        console.log("Message from WebView:", event.nativeEvent.data);
      }}
      renderLoading={() => (
        <View style={{ flex:1, justifyContent:'center', alignItems:'center' }}>
          <ActivityIndicator size="large" color="#183B5C" />
        </View>
      )}
      onNavigationStateChange={(navState) => {
        console.log("📍 Navigation to:", navState.url);
        
        if (navState.url.startsWith("sakayna://payment-success")) {
          console.log("✅ Payment successful, redirecting to success page");
          navigation.replace("PaymentSuccess");
        }

        if (navState.url.startsWith("sakayna://payment-failed")) {
          console.log("❌ Payment failed or cancelled");
          Alert.alert("Payment Failed", "Your payment was not completed. Please try again.");
          navigation.goBack();
        }
      }}
      onError={(syntheticEvent) => {
        const { nativeEvent } = syntheticEvent;
        console.error("WebView error:", nativeEvent);
      }}
      onHttpError={(syntheticEvent) => {
        const { nativeEvent } = syntheticEvent;
        console.error("HTTP error:", nativeEvent);
      }}
    />
  );
}