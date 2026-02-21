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
  marginBottom: 40,
},

  tabBar: {
    backgroundColor: "transparent",
    height: 70,
    paddingBottom: 15,
    paddingTop: 10,
    marginBottom: 20,
    marginLeft: 10,
    marginRight: 10,
    borderRadius: 25,
    borderTopWidth: 0,
    borderBottomWidth: 0,
    shadowColor: "transparent",
    shadowOpacity: 0,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 0,
    elevation: 0,
  },
});
export default navStyles;