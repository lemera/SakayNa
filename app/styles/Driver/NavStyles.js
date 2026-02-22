import { StyleSheet } from "react-native";

export const navStyles = StyleSheet.create({
  tabBar: {
    backgroundColor: "#FFFFFF",
    height: 90,
    paddingBottom: 30,
    paddingTop: 10,
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
    borderRadius: 0,
    borderTopWidth: 0,
    borderBottomWidth: 0,
    shadowColor: "transparent",
    shadowOpacity: 0,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 0,
    elevation: 0,
  },

  trackRideWrapper: {
    position: "absolute",
    top: -25,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#E97A3E",
    width: 65,
    height: 65,
    borderRadius: 35,
    shadowColor: "#E97A3E",
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 6,
    elevation: 8,
  },
});