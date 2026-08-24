import React, { useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import type { Expense, ExpenseInput, TripMember } from "@travel-guide/shared";
import { styles, modalStyles } from "./styles";
import { MemberDot } from "./MemberDot";

/**
 * 记一笔 / 编辑一笔 的表单弹层。保存失败时 onSave 抛错，弹层保持打开。
 */
export function ExpenseSheet({
  members,
  initial,
  onSave,
  onClose,
}: {
  members: TripMember[];
  initial: Expense | null;
  onSave: (data: ExpenseInput) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [paidBy, setPaidBy] = useState<string | null>(
    initial?.paid_by_member_id ?? null,
  );
  const [splitIds, setSplitIds] = useState<Set<string>>(
    () =>
      new Set(initial ? initial.splits.map((s) => s.member_id) : members.map((m) => m.id)),
  );
  const [saving, setSaving] = useState(false);

  const valid =
    title.trim().length > 0 &&
    Number(amount) > 0 &&
    paidBy != null &&
    splitIds.size > 0;

  function toggleSplit(id: string) {
    setSplitIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        amount: Math.round(Number(amount) * 100) / 100,
        paid_by_member_id: paidBy!,
        paid_at: null,
        splits: [...splitIds].map((mid) => ({ member_id: mid, amount: null })),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={modalStyles.sheet}>
          <View style={modalStyles.grabber} />
          <Text style={modalStyles.sheetTitle}>
            {initial ? "编辑这笔" : "记一笔"}
          </Text>

          <Text style={modalStyles.fieldLabel}>是什么钱</Text>
          <TextInput
            style={modalStyles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="如：晚餐、打车、门票…"
            placeholderTextColor="#B9C2CC"
          />

          <Text style={modalStyles.fieldLabel}>金额（元）</Text>
          <TextInput
            style={modalStyles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor="#B9C2CC"
            keyboardType="decimal-pad"
          />

          <Text style={modalStyles.fieldLabel}>谁付的钱</Text>
          <View style={modalStyles.chips}>
            {members.map((m) => {
              const on = paidBy === m.id;
              return (
                <Pressable
                  key={m.id}
                  style={[modalStyles.chip, on && modalStyles.chipOn]}
                  onPress={() => setPaidBy(m.id)}
                >
                  <MemberDot color={m.color} name={m.name} size={22} />
                  <Text style={[modalStyles.chipText, on && modalStyles.chipTextOn]}>
                    {m.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={modalStyles.fieldLabel}>分摊给谁（默认均摊）</Text>
          <View style={modalStyles.chips}>
            {members.map((m) => {
              const on = splitIds.has(m.id);
              return (
                <Pressable
                  key={m.id}
                  style={[modalStyles.chip, on && modalStyles.chipOn]}
                  onPress={() => toggleSplit(m.id)}
                >
                  <MemberDot color={m.color} name={m.name} size={22} />
                  <Text style={[modalStyles.chipText, on && modalStyles.chipTextOn]}>
                    {m.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={modalStyles.rowBetween}>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={modalStyles.cancelText}>取消</Text>
            </Pressable>
            <Pressable
              style={[modalStyles.saveBtn, !valid && modalStyles.saveBtnDisabled]}
              onPress={save}
              disabled={!valid || saving}
            >
              <Text style={modalStyles.saveText}>{saving ? "保存中…" : "保存"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
