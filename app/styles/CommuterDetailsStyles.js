import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  referralBanner: {
  flexDirection: "row",
  backgroundColor: "#FFF8E1",
  borderRadius: 12,
  padding: 16,
  marginBottom: 20,
  marginTop: 10,
  alignItems: "center",
  borderWidth: 1,
  borderColor: "#FFE082",
},
referralBannerContent: {
  flex: 1,
  marginLeft: 12,
},
referralBannerTitle: {
  fontSize: 14,
  fontWeight: "bold",
  color: "#F59E0B",
  marginBottom: 4,
},
referralBannerText: {
  fontSize: 12,
  color: "#666",
},
  container: {
    flex: 1,
    paddingHorizontal: 25,
    paddingTop: 100,
    backgroundColor: "#fff",
    alignItems: "center",
  },
  logo: {
    width: 120,
    height: 120,
    resizeMode: "contain",
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#183B5C",
    marginBottom: 30,
    textAlign: "center",
  },
  subtitle: {
  fontSize: 16,
  color: "#183B5C",
  textAlign: "center",
  marginBottom: 15,
},
  input: {
    width: "100%",
    height: 50,
    borderColor: "#ccc",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 15,
    marginBottom: 15,
    fontSize: 16,
    color: "#183B5C",
  },
  button: {
    width: "100%",
    height: 50,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
});