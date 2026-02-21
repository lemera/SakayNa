import { StyleSheet, Dimensions } from "react-native";

const { width } = Dimensions.get("window");

export const screenStyles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },

  map: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },

  locationContainer: {
    position: "absolute",
    top: 50,
    left: 15,
    right: 15,
    backgroundColor: "rgba(255,255,255,0.8)",
    borderRadius: 20,
    overflow: "hidden",
    paddingVertical: 20,
    paddingHorizontal: 15,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 3,
    zIndex: 40,
  },

  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 10,
  },

  swapButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "rgba(24, 59, 92, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  locationTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#183B5C",
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  input: {
    flex: 1,
    height: 45,
    fontSize: 16,
    color: "#183B5C",
    fontWeight: "500",
  },

  divider: {
    height: 1,
    backgroundColor: "#E0E0E0",
    marginVertical: 8,
  },

  iconButton: {
    paddingHorizontal: 5,
  },

  rideIndicatorContainer: {
    backgroundColor: "#27AE60",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  rideIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFF",
  },

  rideIndicatorText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600",
  },

  rideButton: {
    position: "absolute",
    bottom: 20,
    left: 15,
    right: 15,
    paddingVertical: 14,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },

  rideButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "bold",
  },

  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#999",
    marginBottom: 2,
  },

  // ===== Revised distance & price row =====
  distancePriceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 5,
    marginBottom: 5,
  },

  kmSection: {
    flex: 1,
    backgroundColor: "rgba(24, 59, 92, 0.08)",
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8, // space between km and price
  },

  priceSection: {
    flex: 1,
    backgroundColor: "rgba(24, 59, 92, 0.08)",
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8, // space between km and price
  },

  kmInput: {
    fontSize: 18, // slightly bigger to match price
    fontWeight: "bold",
    color: "#183B5C",
  },

  priceLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#999",
    marginBottom: 2,
  },

  priceValue: {
    fontSize: 18, // match km font size
    fontWeight: "bold",
    color: "#E97A3E",
  },
});