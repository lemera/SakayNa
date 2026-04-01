import { StyleSheet } from "react-native";

export const navStyles = StyleSheet.create({
  tabBar: {
    backgroundColor: "#FFFCFC",
    borderTopWidth: 0,
    borderBottomWidth: 0,
    borderRadius: 0,
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
    shadowColor: "transparent",
    shadowOpacity: 0,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 0,
    elevation: 0,
  },

  trackRideWrapper: {
    position: "absolute",
    top: -18,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#E97A3E",
    width: 64,
    height: 64,
    borderRadius: 32,
    shadowColor: "#E97A3E",
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 6,
    elevation: 8,
  },
});