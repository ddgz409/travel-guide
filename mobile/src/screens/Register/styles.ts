import { StyleSheet } from "react-native";
import { colors } from "../../theme";

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24 },
  hero: { marginTop: 56, marginBottom: 28 },
  brand: { fontSize: 28, fontWeight: "800", color: colors.ink },
  tagline: { marginTop: 8, fontSize: 15, color: colors.muted },
  form: { gap: 8 },
  label: { fontSize: 13, color: colors.muted, marginTop: 8 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  error: { color: colors.danger, marginTop: 8, fontSize: 14 },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  link: {
    marginTop: 18,
    textAlign: "center",
    color: colors.brand,
    fontSize: 15,
  },
});
