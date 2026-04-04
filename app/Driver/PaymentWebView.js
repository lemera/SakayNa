// Driver/PaymentWebView.js
import React, { useRef } from "react";
import { WebView } from "react-native-webview";
import { View, ActivityIndicator, Alert } from "react-native";

export default function PaymentWebView({ route, navigation }) {
  const { url } = route.params;
  const webViewRef = useRef(null);

  // Ito ang magfo-force sa page na maging responsive sa mobile
  const injectedJavaScript = `
    (function() {
      // Add viewport meta tag for responsive design
      const meta = document.createElement('meta');
      meta.name = 'viewport';
      meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes';
      document.getElementsByTagName('head')[0].appendChild(meta);
      
      // Add responsive CSS
      const style = document.createElement('style');
      style.textContent = \`
        * {
          max-width: 100% !important;
          box-sizing: border-box !important;
        }
        body, html {
          overflow-x: hidden !important;
          width: 100% !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        .container, .checkout-container, .payment-container {
          width: 100% !important;
          max-width: 100% !important;
          padding: 10px !important;
        }
        input, select, button {
          font-size: 16px !important;
        }
        @media only screen and (max-width: 768px) {
          body {
            font-size: 14px !important;
          }
          button, .btn {
            width: 100% !important;
            padding: 12px !important;
          }
          input, select {
            width: 100% !important;
            padding: 10px !important;
          }
        }
      \`;
      document.getElementsByTagName('head')[0].appendChild(style);
      
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
      originWhitelist={['*', 'sakayna://*', 'http://*', 'https://*']}
      startInLoadingState
      injectedJavaScript={injectedJavaScript}
      renderLoading={() => (
        <View style={{ flex:1, justifyContent:'center', alignItems:'center' }}>
          <ActivityIndicator size="large" color="#183B5C" />
        </View>
      )}
      onNavigationStateChange={(navState) => {
        console.log("📍 Navigation to:", navState.url);
        
        // PARA SA CUSTOM URL SCHEME - huwag i-load sa WebView
        if (navState.url.startsWith("sakayna://")) {
          console.log("🔗 Custom URL detected:", navState.url);
          
          if (navState.url === "sakayna://payment-success") {
            console.log("✅ Payment successful, redirecting to success page");
            navigation.replace("PaymentSuccess");
          } else if (navState.url === "sakayna://payment-failed") {
            console.log("❌ Payment failed or cancelled");
            Alert.alert("Payment Failed", "Your payment was not completed. Please try again.");
            navigation.goBack();
          }
          
          // I-STOP ANG WEBVIEW FROM LOADING THE CUSTOM URL
          return false;
        }
      }}
      onError={(syntheticEvent) => {
        const { nativeEvent } = syntheticEvent;
        console.warn("WebView warning:", nativeEvent.description);
        // Huwag magpakita ng error para sa custom URL scheme
        if (!nativeEvent.description?.includes("UNKNOWN_URL_SCHEME")) {
          console.error("WebView error:", nativeEvent);
        }
      }}
      onHttpError={(syntheticEvent) => {
        const { nativeEvent } = syntheticEvent;
        console.error("HTTP error:", nativeEvent);
      }}
    />
  );
}