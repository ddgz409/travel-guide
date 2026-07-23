import { StyleSheet } from "react-native";
import { colors } from "../../theme";

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  badge: { color: colors.brand, fontWeight: "700", fontSize: 12 },
  title: { marginTop: 6, fontSize: 24, fontWeight: "800", color: colors.ink },
  meta: { marginTop: 8, color: colors.muted, fontSize: 14 },
  tab: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tabOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { fontWeight: "600", color: colors.ink, fontSize: 13 },
  tabTextOn: { color: "#fff" },
  summary: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    color: colors.ink,
    marginBottom: 12,
    lineHeight: 20,
  },
  item: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    marginBottom: 8,
  },
  itemType: { fontSize: 12, color: colors.brand, fontWeight: "600" },
  itemName: { marginTop: 2, fontSize: 16, fontWeight: "700", color: colors.ink },
  itemDesc: { marginTop: 4, fontSize: 13, color: colors.muted },
  mapTitle: { fontWeight: "800", color: colors.ink, marginBottom: 8 },
  error: { color: colors.danger },
});
