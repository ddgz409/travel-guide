import { StyleSheet } from "react-native";
import { colors } from "../../theme";

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
  body: {
    flex: 1,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.muted,
    marginTop: 20,
    marginBottom: 10,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginBottom: 8,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
  },
  cardSub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  label: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.ink,
  },
  btn: {
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
  },
  btnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});
