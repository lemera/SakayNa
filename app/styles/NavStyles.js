import { StyleSheet } from "react-native";

export const navStyles = StyleSheet.create({
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 15,
  },
  logo: {
    width: 50,
    height: 50,
    resizeMode: "contain",
    marginRight: 10,
    marginBottom: 20,
  },
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

  trackRideButton: {
    top: -25,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#183B5C",
    width: 70,
    height: 70,
    borderRadius: 35,
    shadowColor: "#183B5C",
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 5,
    elevation: 5,
  },
});

export default navStyles;