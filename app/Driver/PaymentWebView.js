// Driver/PaymentWebView.js
import React, { useMemo, useRef } from "react";
import {
  View,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Dimensions,
  Platform,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function PaymentWebView({ route, navigation }) {
  const { url } = route.params || {};
  const webViewRef = useRef(null);

  const injectedJavaScript = useMemo(
    () => `
      (function() {
        try {
          // Remove old viewport if any
          var oldViewport = document.querySelector('meta[name="viewport"]');
          if (oldViewport) {
            oldViewport.parentNode.removeChild(oldViewport);
          }

          // Add viewport meta tag
          var meta = document.createElement('meta');
          meta.name = 'viewport';
          meta.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
          document.head.appendChild(meta);

          // Add responsive styles
          var style = document.createElement('style');
          style.innerHTML = \`
            html, body {
              width: 100% !important;
              max-width: 100% !important;
              overflow-x: hidden !important;
              margin: 0 !important;
              padding: 0 !important;
              -webkit-text-size-adjust: 100% !important;
              text-size-adjust: 100% !important;
              box-sizing: border-box !important;
              background: #ffffff !important;
            }

            *, *::before, *::after {
              box-sizing: border-box !important;
              max-width: 100% !important;
              word-wrap: break-word !important;
            }

            img, video, iframe, canvas, svg {
              max-width: 100% !important;
              height: auto !important;
            }

            table {
              width: 100% !important;
              display: block !important;
              overflow-x: auto !important;
              white-space: nowrap !important;
            }

            input, select, textarea, button {
              max-width: 100% !important;
              font-size: 16px !important;
              border-radius: 8px !important;
            }

            form {
              width: 100% !important;
              max-width: 100% !important;
            }

            .container,
            .wrapper,
            .content,
            .main,
            .checkout-container,
            .payment-container,
            .form-container {
              width: 100% !important;
              max-width: 100% !important;
              margin-left: auto !important;
              margin-right: auto !important;
            }

            @media screen and (max-width: 768px) {
              body {
                font-size: 14px !important;
                padding-left: 10px !important;
                padding-right: 10px !important;
              }

              h1, h2, h3, h4, h5, h6 {
                line-height: 1.25 !important;
                word-break: break-word !important;
              }

              button,
              .btn,
              [type="button"],
              [type="submit"] {
                width: 100% !important;
                min-height: 44px !important;
              }

              input,
              select,
              textarea {
                width: 100% !important;
                min-height: 44px !important;
                padding: 10px !important;
              }

              [style*="width: 600px"],
              [style*="width:600px"],
              [style*="width: 500px"],
              [style*="width:500px"],
              [style*="min-width"] {
                width: 100% !important;
                min-width: 0 !important;
              }
            }
          \`;
          document.head.appendChild(style);

          // Force body width correction after render
          setTimeout(function() {
            try {
              document.documentElement.style.width = '100%';
              document.body.style.width = '100%';
              document.body.style.overflowX = 'hidden';
            } catch (e) {}
          }, 300);

          true;
        } catch (error) {
          true;
        }
      })();
    `,
    []
  );

  const handleCustomScheme = (requestUrl) => {
    if (!requestUrl) return false;

    if (requestUrl.startsWith("sakayna://")) {
      console.log("🔗 Custom URL detected:", requestUrl);

      if (requestUrl === "sakayna://payment-success") {
        navigation.replace("PaymentSuccess");
      } else if (requestUrl === "sakayna://payment-failed") {
        Alert.alert(
          "Payment Failed",
          "Your payment was not completed. Please try again."
        );
        navigation.goBack();
      } else {
        navigation.goBack();
      }

      return true;
    }

    return false;
  };

  if (!url) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Alert />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <View style={styles.container}>
        <WebView
          ref={webViewRef}
          source={{ uri: url }}
          style={styles.webview}
          containerStyle={styles.webviewContainer}
          originWhitelist={["*", "sakayna://*", "http://*", "https://*"]}
          startInLoadingState
          injectedJavaScript={injectedJavaScript}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          allowsInlineMediaPlayback
          setBuiltInZoomControls={false}
          scalesPageToFit={Platform.OS === "android"}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
          mixedContentMode="always"
          androidLayerType="hardware"
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#183B5C" />
            </View>
          )}
          onShouldStartLoadWithRequest={(request) => {
            const blocked = handleCustomScheme(request.url);
            return !blocked;
          }}
          onNavigationStateChange={(navState) => {
            console.log("📍 Navigation to:", navState.url);
            handleCustomScheme(navState.url);
          }}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn("WebView warning:", nativeEvent.description);

            if (!nativeEvent.description?.includes("UNKNOWN_URL_SCHEME")) {
              Alert.alert(
                "Page Error",
                "Unable to load the payment page. Please try again."
              );
            }
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error("HTTP error:", nativeEvent);

            Alert.alert(
              "Connection Error",
              "There was a problem loading the payment page."
            );
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  webviewContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  webview: {
    flex: 1,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: "#FFFFFF",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});