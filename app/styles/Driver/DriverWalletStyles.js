import { StyleSheet, Dimensions } from "react-native";

const { width } = Dimensions.get("window");

export default StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
    padding: 16,
  },
  walletCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    width: width - 32,
    alignSelf: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
    position: "relative",
  },
  linesContainer: {
    position: "absolute",
    top: 16,
    left: 160,
    flexDirection: "column",
    justifyContent: "space-between",
    height: 40,
    alignItems: "flex-end",
  },
  line: {
    height: 3,
    backgroundColor: "#fff",
    borderRadius: 2,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 18,
    color: "#fff",
    fontWeight: "600",
    marginTop: 16,
  },
  pointsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 12,
  },
  pointsValue: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#fff",
  },
  rewardText: {
    color: "#E0F2FF",
    fontSize: 14,
  },
  redeemButton: {
    backgroundColor: "#183B5C",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  transactionsTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#183B5C",
    marginBottom: 12,
  },
  transactionRow: {
    flexDirection: "row",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  transactionText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
  },
  transactionDate: {
    fontSize: 12,
    color: "#999",
  },
  // Add to existing styles
withdrawButton: {
  backgroundColor: "#fff",
  paddingVertical: 10,
  paddingHorizontal: 20,
  borderRadius: 16,
  alignItems: "center",
  justifyContent: "center",
},
withdrawButtonText: {
  fontSize: 16,
  fontWeight: "600",
  color: "#183B5C",
},
modalOverlay: {
  flex: 1,
  backgroundColor: "rgba(0,0,0,0.5)",
  justifyContent: "center",
  alignItems: "center",
},
modalContent: {
  width: width - 60,
  backgroundColor: "#fff",
  borderRadius: 16,
  padding: 24,
},
modalTitle: {
  fontSize: 18,
  fontWeight: "bold",
  marginBottom: 16,
},
input: {
  borderWidth: 1,
  borderColor: "#ccc",
  borderRadius: 12,
  padding: 12,
  marginBottom: 20,
  fontSize: 16,
},
modalButtons: {
  flexDirection: "row",
  justifyContent: "space-between",
},
cancelButton: {
  backgroundColor: "#ccc",
  paddingVertical: 12,
  paddingHorizontal: 24,
  borderRadius: 12,
},
cancelButtonText: {
  fontWeight: "bold",
  color: "#333",
},
confirmButton: {
  backgroundColor: "#183B5C",
  paddingVertical: 12,
  paddingHorizontal: 24,
  borderRadius: 12,
},
confirmButtonText: {
  fontWeight: "bold",
  color: "#fff",
},
});