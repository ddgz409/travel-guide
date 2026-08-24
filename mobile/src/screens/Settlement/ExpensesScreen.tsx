import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Expense, ExpenseInput, TripMember } from "@travel-guide/shared";
import { ApiError } from "@travel-guide/shared";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { PressScale } from "../../utils/motion";
import { colors } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";
import { styles } from "./styles";
import { MemberDot } from "./MemberDot";
import { ExpenseSheet } from "./ExpenseSheet";

type Props = NativeStackScreenProps<AppStackParamList, "SettlementExpenses">;

function fmtMoney(n: number): string {
  const v = Math.round(n * 100) / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

export function ExpensesScreen({ route, navigation }: Props) {
  const { tripId } = route.params;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [members, setMembers] = useState<TripMember[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ open: boolean; expense: Expense | null }>({
    open: false,
    expense: null,
  });

  const canEdit = Boolean(user);
  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);

  const loadAll = useCallback(async () => {
    try {
      const [m, e] = await Promise.all([
        api.trips.split.members(tripId),
        api.trips.split.expenses(tripId),
      ]);
      setMembers(m);
      setExpenses(e);
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

  async function saveExpense(data: ExpenseInput, editing: Expense | null) {
    try {
      if (editing) {
        await api.trips.split.updateExpense(tripId, editing.id, data);
      } else {
        await api.trips.split.addExpense(tripId, data);
      }
      await loadAll();
    } catch (e) {
      Alert.alert("保存失败", e instanceof ApiError ? e.message : String(e));
      throw e;
    }
  }

  function deleteExpense(expense: Expense) {
    Alert.alert("删除这笔", `确定删除「${expense.title}」¥${fmtMoney(expense.amount)} 吗？`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          try {
            await api.trips.split.removeExpense(tripId, expense.id);
            await loadAll();
          } catch (e) {
            Alert.alert("删除失败", e instanceof ApiError ? e.message : String(e));
          }
        },
      },
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
        <Text style={styles.headTitle}>消费明细</Text>
        <View style={styles.headRight} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 40) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.totalBar}>
          <Text style={styles.totalBarCount}>
            共 {expenses.length} 笔
            {totalSpent > 0 ? ` · 合计 ¥${fmtMoney(totalSpent)}` : ""}
          </Text>
        </View>

        {canEdit ? (
          <PressScale
            style={styles.primaryBtn}
            onPress={() => setSheet({ open: true, expense: null })}
          >
            <Text style={styles.primaryBtnText}>＋ 记一笔</Text>
          </PressScale>
        ) : null}

        {expenses.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>还没有记过账</Text>
            {canEdit ? (
              <Text style={styles.emptyHint}>点上方「记一笔」记录第一笔消费吧</Text>
            ) : null}
          </View>
        ) : (
          expenses.map((expense) => (
            <Pressable
              key={expense.id}
              onPress={() =>
                canEdit ? setSheet({ open: true, expense }) : undefined
              }
              onLongPress={() => canEdit && deleteExpense(expense)}
              delayLongPress={400}
            >
              <View style={styles.expenseCard}>
                <View style={styles.expenseHead}>
                  <Text style={styles.expenseTitle} numberOfLines={1}>
                    {expense.title}
                  </Text>
                  <Text style={styles.expenseAmount}>
                    ¥{fmtMoney(expense.amount)}
                  </Text>
                </View>
                <View style={styles.expenseMeta}>
                  <MemberDot
                    color={expense.paid_by_color}
                    name={expense.paid_by_name}
                    size={18}
                  />
                  <Text style={styles.expenseMetaText}>
                    {expense.paid_by_name} 付 · AA 给 {expense.splits.length} 人
                  </Text>
                </View>
                <View style={styles.expenseSplit}>
                  {expense.splits.map((s) => (
                    <View key={s.member_id} style={styles.splitChip}>
                      <MemberDot color={s.color} name={s.member_name} size={14} />
                      <Text style={styles.splitChipText}>{s.member_name}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      {sheet.open ? (
        <ExpenseSheet
          members={members}
          initial={sheet.expense}
          onSave={(data) => saveExpense(data, sheet.expense)}
          onClose={() => setSheet({ open: false, expense: null })}
        />
      ) : null}
    </View>
  );
}
