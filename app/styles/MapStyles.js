import { StyleSheet } from "react-native";

export const mapStyles = StyleSheet.create({
  // Modal Container
  mapModalContainer: {
    flex: 1,
    backgroundColor: "#FFF",
  },

  // Header
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

  // Form Container
  mapFormScrollContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  mapFormSection: {
    marginBottom: 24,
  },

  // Marker Position Display
  markerPositionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#183B5C",
    marginBottom: 8,
  },
  markerPositionBox: {
    backgroundColor: "#F5F5F5",
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  coordLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  coordValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#183B5C",
    marginBottom: 12,
  },
  coordValueLast: {
    fontSize: 14,
    fontWeight: "500",
    color: "#183B5C",
  },

  // Move Location Controls
  moveLocationLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#183B5C",
    marginBottom: 8,
  },
  moveButtonsContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  moveButton: {
    flex: 1,
    backgroundColor: "#183B5C",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  // Reset Button
  resetButton: {
    backgroundColor: "#E97A3E",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 24,
  },
  resetButtonText: {
    color: "#FFF",
    fontWeight: "600",
  },

  // Control Buttons
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

  // Map Placeholder
  mapPlaceholderContainer: {
    backgroundColor: "#F5F5F5",
    justifyContent: "center",
    alignItems: "center",
  },
  mapPlaceholderText: {
    marginTop: 16,
    color: "#999",
  },
  mapPlaceholderSubText: {
    color: "#BBB",
    fontSize: 12,
    marginTop: 8,
  },
  mapPlaceholderCoordText: {
    color: "#888",
    fontSize: 10,
    marginTop: 12,
  },

  // Location Name Display
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

  // Center Marker
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
});