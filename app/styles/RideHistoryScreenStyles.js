// RideHistoryScreenStyles.js
import { StyleSheet, Dimensions } from "react-native";

const { width } = Dimensions.get("window");

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FA", padding: 16 },
  title: { fontSize: 28, fontWeight: "bold", color: "#183B5C", marginBottom: 16 },

  rideCard: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  rideHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  rideDate: { fontSize: 14, color: "#E0F2FF" },
  status: { fontSize: 14, fontWeight: "bold" },
  completed: { color: "#4CAF50" },
  cancelled: { color: "#F44336" },
  rideLocations: { flexDirection: "row", alignItems: "center", marginVertical: 4 },
  rideText: { fontSize: 16, color: "#fff", flexShrink: 1 },
  rideFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  rideDetails: { fontSize: 14, color: "#fff", fontWeight: "500" },
  detailButton: {
    marginTop: 10,
    backgroundColor: "#fff",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  detailButtonText: { color: "#183B5C", fontWeight: "600", fontSize: 14 },

  modalBackground: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  modalContainer: { width: width - 40, backgroundColor: "#fff", borderRadius: 20, padding: 24 },
  driverHeader: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  driverAvatar: { width: 60, height: 60, borderRadius: 30 },
  driverName: { fontSize: 20, fontWeight: "bold", color: "#183B5C" },
  driverRating: { fontSize: 14, color: "#FBC02D", marginTop: 2 },
  driverInfo: { marginBottom: 16 },
  modalText: { fontSize: 16, marginBottom: 6 },
  closeButton: { backgroundColor: "#183B5C", paddingVertical: 12, borderRadius: 16, alignItems: "center" },
  closeButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },

  
});