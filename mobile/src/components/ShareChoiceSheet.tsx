import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import { shareViaApp, type ShareChoicePayload } from "../utils/shareChoice";

type Props = {
  visible: boolean;
  payload: ShareChoicePayload | null;
  onClose: () => void;
};

const OPTIONS = [
  { id: "weixin" as const, label: "微信", hint: "复制链接并打开微信", color: "#07C160" },
  { id: "qq" as const, label: "QQ", hint: "复制链接并打开 QQ", color: "#12B7F5" },
  { id: "copy" as const, label: "复制链接", hint: "复制后可粘贴到任意 App", color: colors.ink },
  { id: "more" as const, label: "更多", hint: "系统分享菜单", color: "#8A94A8" },
];

/** 分享链接：自选微信 / QQ / 复制 / 系统分享 */
export function ShareChoiceSheet({ visible, payload, onClose }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.handle} />
          <Text style={styles.title} numberOfLines={1}>
            {payload?.title || "分享链接"}
          </Text>
          <Text style={styles.sub} numberOfLines={2}>
            {payload?.url || "选择分享方式"}
          </Text>
          {OPTIONS.map((opt) => (
            <Pressable
              key={opt.id}
              style={styles.row}
              onPress={() => {
                if (!payload) return;
                onClose();
                void shareViaApp(opt.id, payload);
              }}
            >
              <View style={[styles.dot, { backgroundColor: opt.color }]} />
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{opt.label}</Text>
                <Text style={styles.rowHint}>{opt.hint}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>取消</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderCurve: "continuous",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E6E6E6",
    alignSelf: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.ink,
  },
  sub: {
    marginTop: 6,
    marginBottom: 12,
    fontSize: 12,
    color: colors.muted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 16, fontWeight: "800", color: colors.ink },
  rowHint: { marginTop: 2, fontSize: 12, color: colors.muted },
  chevron: { fontSize: 20, color: colors.muted },
  cancel: {
    marginTop: 12,
    alignItems: "center",
    paddingVertical: 12,
  },
  cancelText: { fontSize: 15, fontWeight: "700", color: colors.muted },
});
