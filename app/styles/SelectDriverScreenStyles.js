import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FA" },

  map: { width: "100%", height: 200 },

  header: {
    paddingTop: 55,
    paddingHorizontal: 20,
    paddingBottom: 25,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },

  backButton: { position: "absolute", top: 55, left: 20, zIndex: 10 },

  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFF",
    textAlign: "center",
    marginBottom: 15,
  },

  rideInfo: {
    backgroundColor: "rgba(255,255,255,0.15)",
    padding: 15,
    borderRadius: 15,
  },

  rideText: { color: "#FFF", fontSize: 13 },
  priceText: { marginTop: 6, fontSize: 18, fontWeight: "bold", color: "#FFD166" },

  card: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 15,
    marginBottom: 15,
    alignItems: "center",
    elevation: 4,
  },

  driverImage: { width: 65, height: 65, borderRadius: 32.5, marginRight: 15 },
  driverInfo: { flex: 1 },
  driverName: { fontSize: 16, fontWeight: "bold", color: "#183B5C" },

  ratingRow: { flexDirection: "row", alignItems: "center", marginVertical: 4 },
  ratingText: { marginLeft: 4, fontSize: 13 },
  distanceText: { fontSize: 12, color: "#777" },

  detailsButton: {
    backgroundColor: "#183B5C",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  detailsText: { color: "#FFF", fontWeight: "600" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },

  modalContainer: {
    backgroundColor: "#FFF",
    width: "85%",
    borderRadius: 25,
    padding: 20,
    alignItems: "center",
  },

  modalImage: { width: 90, height: 90, borderRadius: 45, marginBottom: 10 },
  modalName: { fontSize: 18, fontWeight: "bold", marginBottom: 5 },

  modalActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 15,
  },

  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    marginHorizontal: 5,
    borderRadius: 12,
  },

  actionText: { color: "#FFF", fontWeight: "bold", marginLeft: 6 },

  qtyContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 15,
    width: "100%",
    justifyContent: "space-between",
  },

  qtyLabel: { fontSize: 16, fontWeight: "bold", color: "#183B5C" },
  qtyControls: { flexDirection: "row", alignItems: "center" },

  qtyButton: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    backgroundColor: "#183B5C",
    justifyContent: "center",
    alignItems: "center",
  },

  qtyButtonText: { color: "#FFF", fontSize: 18, fontWeight: "bold" },

  qtyValue: { marginHorizontal: 12, fontSize: 16, fontWeight: "bold", color: "#183B5C" },

  selectButton: {
    backgroundColor: "#183B5C",
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 15,
    marginTop: 15,
  },
  

  selectButtonText: { color: "#FFF", fontWeight: "bold" },
});