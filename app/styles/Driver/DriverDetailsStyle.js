import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
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
    backgroundColor: "#fff",
  },
  button: {
    width: "100%",
    height: 50,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#183B5C",
    marginTop: 20,

    // Android shadow
    elevation: 3,

    // iOS shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  helperText: {
    fontSize: 12,
    color: "#999",
    textAlign: "left",
    width: "100%",
    marginTop: 5,
    marginBottom: 10,
  },
});