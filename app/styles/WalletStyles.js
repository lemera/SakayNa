// WalletStyles.js
import { StyleSheet, Dimensions } from "react-native";

const { width } = Dimensions.get("window");

export default StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
    padding: 16,
  },
  pointsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 8,
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
  pointsValue: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#fff",
    marginVertical: 8,
  },
  rewardText: {
    color: "#E0F2FF",
    fontSize: 14,
  },
  redeemButton: {
    flexDirection: "row",
    backgroundColor: "#183B5C",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
    alignItems: "center",
  },
  redeemButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
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
});