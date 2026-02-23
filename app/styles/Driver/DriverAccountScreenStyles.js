// AccountScreenStyles.js
import { StyleSheet, Dimensions } from "react-native";

const { width } = Dimensions.get("window");

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FA" },

  profileCard: {
    width: width - 32,
    alignSelf: "center",
    borderRadius: 20,
    padding: 24,
    marginTop: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  avatar: { width: 80, height: 80, borderRadius: 40, marginBottom: 12, borderWidth: 2, borderColor: "#fff" },
  userName: { fontSize: 22, fontWeight: "bold", color: "#fff", marginBottom: 4 },
  userEmail: { fontSize: 14, color: "#E0F2FF" },
  editButton: {
    flexDirection: "row",
    marginTop: 12,
    backgroundColor: "#fff",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignItems: "center",
  },
  editButtonText: { fontSize: 14, fontWeight: "600", color: "#183B5C" },

  menuContainer: { marginTop: 24, paddingHorizontal: 16 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  menuText: { fontSize: 16, fontWeight: "500", color: "#183B5C" },

  modalBackground: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  modalContainer: { width: width - 40, backgroundColor: "#fff", borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: "bold", marginBottom: 16, color: "#183B5C" },
  modalLabel: { fontSize: 14, marginBottom: 6, color: "#333", fontWeight: "500" },
  modalInput: { backgroundColor: "#F5F7FA", borderRadius: 12, padding: 12, marginBottom: 12, fontSize: 14 },

  modalButtons: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  modalCancelButton: { flex: 1, marginRight: 8, paddingVertical: 12, borderRadius: 16, backgroundColor: "#E0E0E0", alignItems: "center" },
  modalCancelText: { color: "#333", fontWeight: "600", fontSize: 16 },
  modalSaveButton: { flex: 1, marginLeft: 8, paddingVertical: 12, borderRadius: 16, backgroundColor: "#183B5C", alignItems: "center" },
  modalSaveText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});