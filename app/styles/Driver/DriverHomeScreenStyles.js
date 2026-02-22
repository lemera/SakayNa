import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F6F9",
    paddingHorizontal: 20,
  },

  /* HEADER */
  header: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  logo: {
    width: 38,
    height: 38,
    resizeMode: "contain",
    marginRight: 12,
  },
  headerContent: {
    flex: 1,
  },
  userName: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 18,
    marginTop: 4,
  },
  onlineBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#27AE60",
    marginRight: 6,
  },
  onlineText: {
    color: "#DFFFE8",
    fontSize: 12,
    fontWeight: "600",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },

  /* BALANCE CARD */
  balanceCard: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 22,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  balanceLabel: {
    color: "#7A7A7A",
    fontSize: 12,
    marginBottom: 6,
    fontWeight: "500",
  },
  balanceValue: {
    fontSize: 22,
    fontWeight: "700",
    color: "#183B5C",
  },
  verticalDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#EEE",
  },

  /* EARNINGS */
  earningsCard: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 22,
    marginBottom: 40,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 16,
    color: "#1A1A1A",
  },

  tabs: {
    flexDirection: "row",
    backgroundColor: "#F1F3F6",
    borderRadius: 14,
    padding: 4,
    marginBottom: 18,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 12,
  },
  activeTab: {
    backgroundColor: "#183B5C",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  activeTabText: {
    color: "#FFF",
  },

  /* TRIP CARD */
  tripCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  tripIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#E8F0FE",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  tripInfo: {
    flex: 1,
  },
  tripRoute: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1A1A1A",
  },
  tripDistance: {
    fontSize: 12,
    color: "#8A8A8A",
    marginTop: 4,
  },
  tripEarnings: {
    fontSize: 14,
    fontWeight: "700",
    color: "#27AE60",
  },

  
});