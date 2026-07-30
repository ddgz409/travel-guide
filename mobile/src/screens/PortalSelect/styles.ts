import { StyleSheet } from "react-native";
import { cardShadow, colors } from "../../theme";

export const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  backBtn: {
    paddingRight: 14,
  },
  backText: {
    fontSize: 16,
    color: colors.brand,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.ink,
    flex: 1,
  },
  subtitle: {
    textAlign: "center",
    color: colors.muted,
    fontSize: 15,
    marginTop: 16,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    padding: 20,
    gap: 12,
  },
  card: {
    width: 140,
    height: 100,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    ...cardShadow,
  },
  cardEmoji: {
    fontSize: 32,
  },
  cardName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
    marginTop: 8,
  },
});
