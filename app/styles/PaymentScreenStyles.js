import { StyleSheet, Dimensions } from "react-native";

const { width } = Dimensions.get("window");
export const CARD_WIDTH = 110; // width of each card including margin

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FA" },

  header: {
    paddingTop: 55,
    paddingHorizontal: 20,
    paddingBottom: 25,
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "bold",
    marginLeft: 20,
  },

  card: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 20,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#183B5C",
  },
  infoText: { fontSize: 14, marginBottom: 6 },
  totalText: {
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 10,
    color: "#FFD166",
  },

  platformCard: {
    width: CARD_WIDTH - 10,
    backgroundColor: "#F0F4F8",
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 10,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  platformCardSelected: {
    borderWidth: 2,
    borderColor: "#183B5C",
    backgroundColor: "#DDE6F0",
  },
  platformCardDisabled: {
    backgroundColor: "#EEE",
    opacity: 0.6,
  },

  platformLogo: { width: 48, height: 48, resizeMode: "contain" },
  platformText: {
    marginTop: 8,
    fontWeight: "bold",
    color: "#183B5C",
    textAlign: "center",
  },
  comingSoonText: {
    fontSize: 10,
    color: "#AAA",
    marginTop: 4,
    textAlign: "center",
  },

  payButton: {
    backgroundColor: "#183B5C",
    paddingVertical: 15,
    marginHorizontal: 20,
    borderRadius: 20,
    marginTop: 30,
    alignItems: "center",
  },
  payButtonText: { color: "#FFF", fontWeight: "bold", fontSize: 16 },
});