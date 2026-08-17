import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  fullRoot: { flex: 1, backgroundColor: "#FFFFFF" },
  fullBack: {
    position: "absolute",
    left: 12,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderCurve: "continuous",
    backgroundColor: "rgba(255,255,255,0.88)",
    alignItems: "center",
    justifyContent: "center",
  },
  fullBackText: { fontSize: 28, color: "#7A6A9E", lineHeight: 32 },
  fullBody: { flex: 1, backgroundColor: "#FFFFFF" },
  fullWeb: { flex: 1, backgroundColor: "transparent" },
  fullLoading: { flex: 1, alignItems: "center", justifyContent: "center" },
  fullHint: {
    position: "absolute",
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: "rgba(196,179,228,0.92)",
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    overflow: "hidden",
  },
});
