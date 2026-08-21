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
  headerSpacer: { width: 48 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabs: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: 6,
    marginBottom: 10,
    backgroundColor: colors.bgSurface,
    borderRadius: 14,
    borderCurve: "continuous",
    padding: 3,
  },
  tab: {
    flex: 1,
    height: 36,
    borderRadius: 11,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  tabOn: { backgroundColor: "#fff" },
  tabText: { fontSize: 14, fontWeight: "700", color: colors.muted },
  tabTextOn: { color: colors.ink },
  scroll: { paddingHorizontal: 20, paddingBottom: 32 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  name: { fontSize: 15, fontWeight: "700", color: colors.ink, flex: 1 },
  empty: {
    marginTop: 32,
    textAlign: "center",
    fontSize: 14,
    color: colors.muted,
  },
});
