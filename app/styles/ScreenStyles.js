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
    color: "#999",
    marginBottom: 4,
  },

  distancePriceRow: {
    flexDirection: "row",
    gap: 15,
    marginTop: 12,
    marginBottom: 12,
  },

  kmSection: {
    flex: 1,
  },

  kmInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(233, 122, 62, 0.08)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  kmInput: {
    flex: 1,
    height: 35,
    fontSize: 14,
    color: "#183B5C",
    fontWeight: "500",
  },

  priceSection: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(24, 59, 92, 0.08)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "flex-end",
  },

  priceContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(24, 59, 92, 0.08)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
    marginBottom: 12,
  },

  priceLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#999",
    marginBottom: 2,
  },

  priceValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#E97A3E",
  },

  mapControlsContainer: {
    position: "absolute",
    bottom: 20,
    left: 15,
    right: 15,
    flexDirection: "row",
    gap: 10,
  },

  mapCancelButton: {
    flex: 1,
    backgroundColor: "#999",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  mapConfirmButton: {
    flex: 1,
    backgroundColor: "#E97A3E",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  mapButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "bold",
  },

  centerMarkerContainer: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginLeft: -20,
    marginTop: -40,
    zIndex: 100,
    alignItems: "center",
    justifyContent: "center",
  },

  mapHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    paddingHorizontal: 20,
    paddingVertical: 15,
    paddingTop: 50,
    zIndex: 50,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 3,
    elevation: 5,
  },

  mapHeaderText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#183B5C",
    marginBottom: 5,
  },

  mapHeaderSubText: {
    fontSize: 13,
    color: "#999",
  },

  locationNameContainer: {
    position: "absolute",
    bottom: 120,
    left: 15,
    right: 15,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    zIndex: 40,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 3,
    elevation: 5,
  },

  locationNameText: {
    fontSize: 14,
    color: "#183B5C",
    fontWeight: "600",
    flex: 1,
  },
});