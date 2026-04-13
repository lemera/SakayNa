import { StyleSheet, Platform } from "react-native";

const COLORS = {
  primary: "#183B5C",
  primaryDark: "#10293F",
  accent: "#E97A3E",
  accentSoft: "rgba(233, 122, 62, 0.12)",
  white: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceSoft: "#F8FAFC",
  text: "#183B5C",
  textMuted: "#6B7A8C",
  textLight: "#94A3B8",
  border: "rgba(24, 59, 92, 0.08)",
  borderStrong: "rgba(24, 59, 92, 0.14)",
  shadow: "#0F172A",
  danger: "#FF4D4F",
};

const scale = (size, width) => {
  const baseWidth = 375;
  return Math.round((width / baseWidth) * size);
};

const isSmallDevice = (width) => width < 360;

const navStylesFactory = (width) => {
  const small = isSmallDevice(width);

  return StyleSheet.create({
    headerStyle: {
      backgroundColor: COLORS.white,
      elevation: 0,
      shadowOpacity: 0,
      borderBottomWidth: 0,
    },

    headerTitleStyle: {
      fontWeight: "800",
      fontSize: small ? 17 : 20,
      color: COLORS.text,
      letterSpacing: 0.3,
    },

    headerContainer: {
      flexDirection: "row",
      alignItems: "center",
      marginLeft: scale(14, width),
    },

    logo: {
      width: small ? 40 : 46,
      height: small ? 40 : 46,
      resizeMode: "contain",
    },

    helpButton: {
      marginRight: scale(14, width),
      width: small ? 42 : 46,
      height: small ? 42 : 46,
      borderRadius: 999,
      backgroundColor: COLORS.surface,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: COLORS.border,
      ...Platform.select({
        ios: {
          shadowColor: COLORS.shadow,
          shadowOpacity: 0.06,
          shadowOffset: { width: 0, height: 6 },
          shadowRadius: 12,
        },
        android: {
          elevation: 4,
        },
      }),
    },

    helpText: {
      fontSize: small ? 9 : 10,
      color: COLORS.textMuted,
      fontWeight: "800",
      marginTop: 1,
      letterSpacing: 0.2,
    },

    tabBar: {
      position: "absolute",
      backgroundColor: "rgba(255,255,255,0.98)",
      borderTopWidth: 0,
      borderWidth: 1,
      borderColor: COLORS.border,
      borderRadius: 30,
      paddingHorizontal: small ? 8 : 10,
      overflow: "visible",
      ...Platform.select({
        ios: {
          shadowColor: COLORS.shadow,
          shadowOpacity: 0.1,
          shadowOffset: { width: 0, height: 10 },
          shadowRadius: 22,
        },
        android: {
          elevation: 16,
        },
      }),
    },

    tabBarLabel: {
      fontSize: small ? 10 : 11,
      fontWeight: "800",
      marginBottom: Platform.OS === "ios" ? 2 : 4,
      letterSpacing: 0.2,
    },

    trackRideButton: {
      top: small ? -20 : -24,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: COLORS.primary,
      width: small ? 68 : 76,
      height: small ? 68 : 76,
      borderRadius: 999,
      borderWidth: 5,
      borderColor: COLORS.white,
      ...Platform.select({
        ios: {
          shadowColor: COLORS.primary,
          shadowOpacity: 0.22,
          shadowOffset: { width: 0, height: 10 },
          shadowRadius: 18,
        },
        android: {
          elevation: 12,
        },
      }),
    },

    trackRideButtonActive: {
      backgroundColor: COLORS.accent,
    },

    buttonLabel: {
      color: COLORS.white,
      fontSize: small ? 9 : 10,
      marginTop: 3,
      fontWeight: "800",
      letterSpacing: 0.2,
    },

    iconWrapper: {
      position: "relative",
      width: 30,
      height: 30,
      alignItems: "center",
      justifyContent: "center",
    },

    badge: {
      position: "absolute",
      top: -4,
      right: -10,
      backgroundColor: COLORS.danger,
      borderRadius: 999,
      minWidth: 18,
      height: 18,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 4,
      borderWidth: 1.5,
      borderColor: COLORS.white,
      ...Platform.select({
        ios: {
          shadowColor: COLORS.shadow,
          shadowOpacity: 0.15,
          shadowOffset: { width: 0, height: 4 },
          shadowRadius: 8,
        },
        android: {
          elevation: 6,
        },
      }),
    },

    badgeText: {
      color: COLORS.white,
      fontSize: 10,
      fontWeight: "800",
    },
  });
};

export default navStylesFactory;
