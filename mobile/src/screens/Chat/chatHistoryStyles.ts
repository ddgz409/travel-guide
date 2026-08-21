import { StyleSheet } from "react-native";
import { colors } from "../../theme";

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  back: { fontSize: 16, color: colors.brandHot, fontWeight: "700" },
  title: { fontSize: 16, fontWeight: "800", color: colors.ink },
  newBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    borderCurve: "continuous",
    backgroundColor: colors.ink,
  },
  newBtnText: { fontSize: 12, color: "#fff", fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: 20, paddingBottom: 32 },
  row: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderCurve: "continuous",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  rowSub: { marginTop: 4, fontSize: 12, color: colors.muted },
  rowDel: { padding: 4 },
  rowDelText: { fontSize: 13, color: colors.danger, fontWeight: "700" },
  empty: { marginTop: 40, textAlign: "center", fontSize: 14, color: colors.muted },
});
