import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

export type ChoiceOption = { label: string; send: string };

type Props = {
  style: "chips" | "select_list";
  options: ChoiceOption[];
  confirmLabel?: string;
  disabled?: boolean;
  onSelect: (send: string) => void;
};

/** 规划追问：快捷 chips 或列表 + 确认 */
export function ChatFollowUpChoices({
  style,
  options,
  confirmLabel = "确认",
  disabled,
  onSelect,
}: Props) {
  const [selected, setSelected] = useState<number | null>(null);

  if (style === "chips") {
    return (
      <View style={styles.chipsWrap}>
        {options.map((opt, i) => (
          <Pressable
            key={`${opt.label}-${i}`}
            style={[styles.chip, disabled && styles.disabled]}
            disabled={disabled}
            onPress={() => onSelect(opt.send)}
          >
            <Text style={styles.chipText}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>
    );
  }

  const picked = selected != null ? options[selected] : null;

  return (
    <View style={styles.listWrap}>
      {options.map((opt, i) => {
        const active = selected === i;
        return (
          <Pressable
            key={`${opt.label}-${i}`}
            style={[styles.listItem, active && styles.listItemActive, disabled && styles.disabled]}
            disabled={disabled}
            onPress={() => setSelected(i)}
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
        onPress={() => picked && onSelect(picked.send)}
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
  chipText: { fontSize: 14, color: colors.ink, fontWeight: "600" },
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
