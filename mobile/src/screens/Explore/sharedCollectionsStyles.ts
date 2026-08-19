import { StyleSheet } from "react-native";
import { colors, cardShadow } from "../../theme";

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
  back: { fontSize: 16, color: colors.brandHot, fontWeight: "700", width: 56 },
  title: { fontSize: 17, fontWeight: "800", color: colors.ink },
  publishLink: { fontSize: 15, color: colors.brandHot, fontWeight: "700", width: 56, textAlign: "right" },
  banner: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 18,
    borderCurve: "continuous",
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.brand,
    ...cardShadow,
  },
  bannerTitle: { fontSize: 16, fontWeight: "800", color: colors.ink },
  bannerSub: { marginTop: 4, fontSize: 13, color: colors.muted },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  empty: { marginTop: 40, textAlign: "center", color: colors.muted, fontSize: 14 },
});
