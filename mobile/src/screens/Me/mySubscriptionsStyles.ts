import { StyleSheet } from "react-native";
import { colors } from "../../theme";

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  back: { fontSize: 16, color: colors.brandHot, fontWeight: "700", width: 48 },
  title: { fontSize: 17, fontWeight: "800", color: colors.ink },
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  empty: {
    marginTop: 60,
    textAlign: "center",
    color: colors.muted,
    fontSize: 14,
  },
});
