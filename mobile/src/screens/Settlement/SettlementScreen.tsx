import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Expense, SettlementData, TripMember } from "@travel-guide/shared";
import { ApiError } from "@travel-guide/shared";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { PressScale, FadeSlideIn } from "../../utils/motion";
import { colors } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";
import { styles, modalStyles } from "./styles";
import { MemberDot } from "./MemberDot";

type Props = NativeStackScreenProps<AppStackParamList, "Settlement">;

function fmtMoney(n: number): string {
  const v = Math.round(n * 100) / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

/** 添加 / 改名同行人的输入弹层 */
function MemberSheet({
  title,
  initialName,
  onSave,
  onClose,
}: {
  title: string;
  initialName: string;
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const valid = name.trim().length > 0;

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await onSave(name.trim());
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
          <Text style={modalStyles.sheetTitle}>{title}</Text>
          <Text style={modalStyles.fieldLabel}>姓名</Text>
          <TextInput
            style={modalStyles.input}
            value={name}
            onChangeText={setName}
            placeholder="输入同行人姓名"
            placeholderTextColor="#B9C2CC"
            autoFocus
          />
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

export function SettlementScreen({ route, navigation }: Props) {
  const { tripId } = route.params;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [members, setMembers] = useState<TripMember[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlement, setSettlement] = useState<SettlementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [memberSheet, setMemberSheet] = useState<{
    open: boolean;
    mode: "add" | "rename";
    member: TripMember | null;
  }>({ open: false, mode: "add", member: null });

  const canEdit = Boolean(user);

  const loadAll = useCallback(async () => {
    try {
      const [m, e, s] = await Promise.all([
        api.trips.split.members(tripId),
        api.trips.split.expenses(tripId),
        api.trips.split.settlement(tripId),
      ]);
      setMembers(m);
      setExpenses(e);
      setSettlement(s);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // 当前用户对应的同行人：登录用户按 user_id 匹配，否则取创建者（owner）
  const me = useMemo(() => {
    if (user) {
      return (
        members.find((m) => m.user_id === user.id) ??
        members.find((m) => m.is_owner)
      );
    }
    return members.find((m) => m.is_owner);
  }, [members, user]);

  const myBalance =
    me && settlement
      ? (settlement.balances.find((b) => b.member_id === me.id)?.balance ?? 0)
      : 0;
  const owedToMe = myBalance > 0 ? myBalance : 0;
  const iOwe = myBalance < 0 ? -myBalance : 0;
  const myFlows =
    me && settlement ? settlement.flows.filter((f) => f.from_member_id === me.id) : [];
  const needToPay = myFlows.reduce((s, f) => s + f.amount, 0);
  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
  const perPerson = members.length > 0 ? totalSpent / members.length : 0;
  const flowCount = settlement?.flows.length ?? 0;
  const clearStatus =
    expenses.length > 0 && myBalance === 0 ? "已结清" : needToPay > 0 ? "待转账" : "—";

  async function saveMember(name: string, mode: "add" | "rename") {
    try {
      if (mode === "rename" && memberSheet.member) {
        await api.trips.split.renameMember(tripId, memberSheet.member.id, name);
      } else {
        await api.trips.split.addMember(tripId, name);
      }
      await loadAll();
    } catch (e) {
      Alert.alert("保存失败", e instanceof ApiError ? e.message : String(e));
      throw e;
    }
  }

  function deleteMember(member: TripMember) {
    Alert.alert("删除同行人", `确定把「${member.name}」移出本次行程吗？`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          try {
            await api.trips.split.removeMember(tripId, member.id);
            await loadAll();
          } catch (e) {
            Alert.alert(
              "删除失败",
              e instanceof ApiError ? e.message : String(e),
            );
          }
        },
      },
    ]);
  }

  function onMemberLongPress(member: TripMember) {
    if (member.id === me?.id) {
      Alert.alert(member.name, "这是你本人");
      return;
    }
    Alert.alert(member.name, undefined, [
      {
        text: "改名",
        onPress: () => setMemberSheet({ open: true, mode: "rename", member }),
      },
      { text: "删除", style: "destructive", onPress: () => deleteMember(member) },
      { text: "取消", style: "cancel" },
    ]);
  }

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.error}>{error}</Text>
        <PressScale style={styles.retry} onPress={loadAll}>
          <Text style={styles.retryText}>重试</Text>
        </PressScale>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: Math.max(insets.top, 8) }]}>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={styles.back}>‹ 返回</Text>
        </Pressable>
        <Text style={styles.headTitle}>AA 分账</Text>
        <View style={styles.headRight} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 40) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 汇总卡片：别人欠我 / 我欠别人 一行 */}
        <FadeSlideIn delay={30}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>别人欠我</Text>
              <Text style={[styles.summaryValue, styles.sumGreen]}>
                ¥{fmtMoney(owedToMe)}
              </Text>
              <Text style={styles.summarySub}>
                {owedToMe > 0 ? `${myFlows.length} 笔待收` : clearStatus}
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>我欠别人</Text>
              <Text style={[styles.summaryValue, styles.sumRed]}>
                ¥{fmtMoney(iOwe)}
              </Text>
              <Text style={styles.summarySub}>
                {iOwe > 0 ? `${myFlows.length} 笔待付` : clearStatus}
              </Text>
            </View>
          </View>
          {/* 我需要支付：蓝色大框，单独一行 */}
          <View style={styles.summarySingle}>
            <View style={styles.summaryCardSlim}>
              <Text style={styles.slimLabel}>我需要支付</Text>
              <Text style={styles.slimValue}>¥{fmtMoney(needToPay)}</Text>
              <Text style={styles.slimSub}>
                {needToPay > 0
                  ? `转给 ${myFlows.length} 人`
                  : expenses.length > 0
                    ? "无需转账"
                    : "—"}
              </Text>
            </View>
          </View>
        </FadeSlideIn>

        {/* 同行人 */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>同行人 · {members.length}</Text>
            {canEdit ? (
              <PressScale
                style={styles.sectionAdd}
                onPress={() => setMemberSheet({ open: true, mode: "add", member: null })}
              >
                <Text style={styles.sectionAddText}>＋ 添加</Text>
              </PressScale>
            ) : null}
          </View>
          {members.length === 0 ? (
            <Text style={styles.memberEmpty}>还没有同行人</Text>
          ) : (
            <View style={styles.memberWrap}>
              {members.map((m) => {
                const isMe = m.id === me?.id;
                const bal = settlement?.balances.find((b) => b.member_id === m.id)?.balance ?? 0;
                return (
                  <Pressable
                    key={m.id}
                    onLongPress={() => onMemberLongPress(m)}
                    delayLongPress={350}
                  >
                    <View style={[styles.memberChip, isMe && styles.memberChipMe]}>
                      <MemberDot color={m.color} name={m.name} size={24} />
                      <Text style={styles.memberName}>{m.name}</Text>
                      {isMe ? <Text style={styles.memberMeTag}>我</Text> : null}
                      {bal > 0 ? (
                        <Text style={[styles.memberBal, styles.sumGreen]}>+{Math.round(bal)}</Text>
                      ) : bal < 0 ? (
                        <Text style={[styles.memberBal, styles.sumRed]}>{Math.round(bal)}</Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
          {canEdit ? (
            <Text style={styles.sectionHint}>长按同行人可改名 / 删除</Text>
          ) : null}
        </View>

        {/* 两个入口框：结算方案在上，消费明细在下 */}
        <View style={styles.section}>
          <PressScale
            style={styles.cardLink}
            onPress={() => navigation.push("SettlementFlows", { tripId })}
          >
            <Text style={[styles.cardIcon, { backgroundColor: "#E8F5E9" }]}>💸</Text>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>结算方案</Text>
              <Text style={styles.cardSub}>
                {flowCount > 0
                  ? `${flowCount} 笔转账 · 人均 ¥${fmtMoney(perPerson)}`
                  : expenses.length > 0
                    ? "已结清，无需转账"
                    : "记完账后自动生成"}
              </Text>
            </View>
            <Text style={styles.cardArrow}>›</Text>
          </PressScale>

          <PressScale
            style={styles.cardLink}
            onPress={() => navigation.push("SettlementExpenses", { tripId })}
          >
            <Text style={[styles.cardIcon, { backgroundColor: "#E1F5FE" }]}>🧾</Text>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>消费明细</Text>
              <Text style={styles.cardSub}>
                {expenses.length > 0
                  ? `${expenses.length} 笔 · 合计 ¥${fmtMoney(totalSpent)}`
                  : "还没有记账"}
              </Text>
            </View>
            <Text style={styles.cardArrow}>›</Text>
          </PressScale>
        </View>
      </ScrollView>

      {memberSheet.open ? (
        <MemberSheet
          title={memberSheet.mode === "add" ? "添加同行人" : "改名"}
          initialName={memberSheet.member?.name ?? ""}
          onSave={(name) => saveMember(name, memberSheet.mode)}
          onClose={() => setMemberSheet({ open: false, mode: "add", member: null })}
        />
      ) : null}
    </View>
  );
}
