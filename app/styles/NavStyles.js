import { StyleSheet, Platform } from "react-native";

const COLORS = {
  primary: "#183B5C",
  primaryDark: "#10293F",
  accent: "#E97A3E",
  white: "#FFFFFF",
  text: "#183B5C",
  textMuted: "#6B7A8C",
  border: "rgba(24, 59, 92, 0.08)",
  shadow: "#0F172A",
  surface: "#FFFFFF",
};

const scale = (size, width) => {
  const baseWidth = 375;
  return Math.round((width / baseWidth) * size);
};

const navStylesFactory = (width) =>
  StyleSheet.create({
    headerContainer: {
      flexDirection: "row",
      alignItems: "center",
      marginLeft: scale(16, width),
    },

    logo: {
      width: width < 360 ? 40 : 46,
      height: width < 360 ? 40 : 46,
      resizeMode: "contain",
    },

    helpButton: {
      marginRight: scale(14, width),
      width: width < 360 ? 40 : 44,
      height: width < 360 ? 40 : 44,
      borderRadius: 22,
      backgroundColor: "rgba(24, 59, 92, 0.06)",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(24, 59, 92, 0.06)",
    },

    helpText: {
      fontSize: width < 360 ? 9 : 10,
      color: COLORS.textMuted,
      fontWeight: "700",
      marginTop: 1,
      letterSpacing: 0.2,
    },

    tabBar: {
      position: "absolute",
      left: 14,
      right: 14,
      bottom: 10,
      backgroundColor: "rgba(255, 255, 255, 0.96)",
      borderTopWidth: 0,
      borderWidth: 1,
      borderColor: COLORS.border,
      borderRadius: 25,
      paddingTop: 10,
      

      ...Platform.select({
        ios: {
          shadowColor: COLORS.shadow,
          shadowOpacity: 0.08,
          shadowOffset: { width: 0, height: 10 },
          shadowRadius: 20,
        },
        android: {
          elevation: 16,
        },
      }),
    },

    trackRideButton: {
      top: -24,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: COLORS.primary,
      width: width < 360 ? 68 : 74,
      height: width < 360 ? 68 : 74,
      borderRadius: width < 360 ? 34 : 37,
      borderWidth: 5,
      borderColor: COLORS.white,

      ...Platform.select({
        ios: {
          shadowColor: COLORS.primary,
          shadowOpacity: 0.28,
          shadowOffset: { width: 0, height: 10 },
          shadowRadius: 16,
        },
        android: {
          elevation: 12,
        },
      }),
    },
  });

export default navStylesFactory;