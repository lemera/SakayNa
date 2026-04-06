import { StyleSheet, Platform } from "react-native";

const scale = (size, width) => {
  const baseWidth = 375;
  return Math.round((width / baseWidth) * size);
};

const navStylesFactory = (width) =>
  StyleSheet.create({
    headerContainer: {
      flexDirection: "row",
      alignItems: "center",
      marginLeft: scale(14, width),
    },

    logo: {
      width: width < 360 ? 38 : 44,
      height: width < 360 ? 38 : 44,
      resizeMode: "contain",
    },

    helpButton: {
      marginRight: scale(14, width),
      alignItems: "center",
      justifyContent: "center",
    },

    helpText: {
      fontSize: width < 360 ? 10 : 11,
      color: "#183B5C",
      fontWeight: "600",
      marginTop: 2,
    },

    tabBar: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "#FFFFFF",
      paddingTop: 8,
      borderTopWidth: 0,
      elevation: 12,
      shadowColor: "#000",
      shadowOpacity: 0.06,
      shadowOffset: { width: 0, height: -2 },
      shadowRadius: 8,
    },

    trackRideButton: {
  top: -20,
  justifyContent: "center",
  alignItems: "center",
  backgroundColor: "#183B5C",
  width: 65,
  height: 65,
  borderRadius: 32.5,

  shadowColor: "#183B5C",
  shadowOpacity: 0.3,
  shadowOffset: { width: 0, height: 5 },
  shadowRadius: 5,
  elevation: 8,
},
  });

export default navStylesFactory;