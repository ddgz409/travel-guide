import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { SettlementData } from "@travel-guide/shared";
import { ApiError } from "@travel-guide/shared";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { PressScale, FadeSlideIn } from "../../utils/motion";
import { colors } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";
import { styles } from "./styles";
import { MemberDot } from "./MemberDot";

type Props = NativeStackScreenProps<AppStackParamList, "SettlementFlows">;

function fmtMoney(n: number): string {
  const v = Math.round(n * 100) / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

export function FlowsScreen({ route, navigation }: Props) {
  const { tripId } = route.params;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [settlement, setSettlement] = useState<SettlementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 已支付的转账（本地标记，按 flow 序号；再点可取消）
  const [paidSet, setPaidSet] = useState<Set<number>>(new Set());

  const meId = user?.id ?? null;

  function togglePaid(i: number) {
    setPaidSet((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  const load = useCallback(async () => {
    try {
      setSettlement(await api.trips.split.settlement(tripId));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

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
        <PressScale style={styles.retry} onPress={load}>
          <Text style={styles.retryText}>重试</Text>
        </PressScale>
      </View>
    );
  }

  const flows = settlement?.flows ?? [];
  const balances = settlement?.balances ?? [];
  const nonZero = balances.filter((b) => Math.abs(b.balance) > 0.01);

  return (
    <View style={[styles.root, { paddingTop: Math.max(insets.top, 8) }]}>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={styles.back}>‹ 返回</Text>
        </Pressable>
        <Text style={styles.headTitle}>结算方案</Text>
        <View style={styles.headRight} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 40) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 谁该转给谁 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitleRowTitle}>
            谁该转给谁
            {flows.length > 0 ? ` · 最少转账 ${flows.length} 笔` : ""}
          </Text>
          {flows.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                大家都已结清，不用互相转账 🎉
              </Text>
            </View>
          ) : (
            flows.map((flow, i) => (
              <FadeSlideIn key={i} delay={Math.min(i, 5) * 50}>
                <View style={styles.flowCard}>
                  <View style={styles.flowPerson}>
                    <MemberDot color={flow.from_color} name={flow.from_name} size={34} />
                    <Text style={styles.flowName} numberOfLines={1}>
                      {flow.from_name}
                    </Text>
                  </View>
                  <View style={styles.flowArrow}>
                    <Text style={styles.flowAmount}>¥{fmtMoney(flow.amount)}</Text>
                    <Text style={styles.flowUnit}>→</Text>
                  </View>
                  <View style={styles.flowPerson}>
                    <MemberDot color={flow.to_color} name={flow.to_name} size={34} />
                    <Text style={styles.flowName} numberOfLines={1}>
                      {flow.to_name}
                    </Text>
                  </View>
                  <Pressable
                    style={[styles.paidBtn, paidSet.has(i) && styles.paidBtnDone]}
                    onPress={() => togglePaid(i)}
                    hitSlop={8}
                  >
                    <Text
                      style={[styles.paidBtnText, paidSet.has(i) && styles.paidBtnTextDone]}
                    >
                      ✓
                    </Text>
                  </Pressable>
                </View>
              </FadeSlideIn>
            ))
          )}
          {flows.length > 0 ? (
            <Text style={styles.sectionHint}>转完账后点右侧 ✓ 标记为已支付</Text>
          ) : null}
        </View>

        {/* 成员结余 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitleRowTitle}>成员结余 · 正 = 别人欠 TA</Text>
          <View style={styles.balanceCard}>
            {nonZero.length === 0 ? (
              <Text style={styles.balanceEmpty}>暂无结余</Text>
            ) : (
              nonZero.map((b) => {
                const positive = b.balance > 0;
                return (
                  <View key={b.member_id} style={styles.balanceRow}>
                    <MemberDot color={b.color} name={b.name} size={26} />
                    <Text style={styles.balanceName} numberOfLines={1}>
                      {b.name}
                      {b.member_id === meId ? <Text style={styles.balanceMeTag}> 我</Text> : null}
                    </Text>
                    <Text
                      style={[
                        styles.balanceVal,
                        positive ? styles.sumGreen : styles.sumRed,
                      ]}
                    >
                      {positive ? "+" : ""}¥{fmtMoney(Math.abs(b.balance))}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
