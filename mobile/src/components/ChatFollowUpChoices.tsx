import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

export type ChoiceOption = { label: string; send: string };

type Props = {
  style: "chips" | "select_list";
  options: ChoiceOption[];
  confirmLabel?: string;
  disabled?: boolean;
  /** 当前已回填到输入框的卡片 send 值（用于高亮） */
  selectedSend?: string | null;
  /** 点选卡片：回填输入框，不直接发送 */
  onPick: (send: string) => void;
};

/**
 * 规划追问卡片：轻量候选选项。
 * 点击 = 把选项内容回填到自定义输入框（不直接发送），
 * 用户可在输入框里继续修改，改完再点「发」提交。
 */
export function ChatFollowUpChoices({
  style,
  options,
  confirmLabel = "确认",
  disabled,
  selectedSend,
  onPick,
}: Props) {
  if (style === "chips") {
    return (
      <View style={styles.chipsWrap}>
        {options.map((opt, i) => {
          const active = selectedSend === opt.send;
          return (
            <Pressable
              key={`${opt.label}-${i}`}
              style={[styles.chip, active && styles.chipActive, disabled && styles.disabled]}
              disabled={disabled}
              onPress={() => onPick(opt.send)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  const pickedIdx = selectedSend
    ? options.findIndex((o) => o.send === selectedSend)
    : -1;
  const picked = pickedIdx >= 0 ? options[pickedIdx] : null;

  return (
    <View style={styles.listWrap}>
      {options.map((opt, i) => {
        const active = selectedSend === opt.send;
        return (
          <Pressable
            key={`${opt.label}-${i}`}
            style={[styles.listItem, active && styles.listItemActive, disabled && styles.disabled]}
            disabled={disabled}
            onPress={() => onPick(opt.send)}
          >
            <View style={[styles.radio, active && styles.radioActive]}>
              {active ? <View style={styles.radioDot} /> : null}
            </View>
            <Text style={[styles.listLabel, active && styles.listLabelActive]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
      <Pressable
        style={[
          styles.confirmBtn,
          (!picked || disabled) && styles.confirmBtnDisabled,
        ]}
        disabled={!picked || disabled}
        onPress={() => picked && onPick(picked.send)}
      >
        <Text style={styles.confirmBtnText}>{confirmLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  chipsWrap: { marginTop: 10, gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    borderRadius: 22,
    borderCurve: "continuous",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipActive: {
    borderColor: colors.ink,
    backgroundColor: colors.brandSoft,
  },
  chipText: { fontSize: 14, color: colors.ink, fontWeight: "600" },
  chipTextActive: { color: colors.brandHot, fontWeight: "700" },
  listWrap: { marginTop: 10, gap: 6 },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    borderRadius: 16,
    borderCurve: "continuous",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  listItemActive: {
    borderColor: colors.ink,
    backgroundColor: "#f8f8f8",
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: { borderColor: colors.ink },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.ink,
  },
  listLabel: { flex: 1, fontSize: 14, color: colors.ink },
  listLabelActive: { fontWeight: "700" },
  confirmBtn: {
    marginTop: 6,
    backgroundColor: colors.ink,
    borderRadius: 22,
    borderCurve: "continuous",
    paddingVertical: 12,
    alignItems: "center",
  },
  confirmBtnDisabled: { opacity: 0.35 },
  confirmBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.45 },
});
