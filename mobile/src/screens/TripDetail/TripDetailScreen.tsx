import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  Linking,
  Platform,
  ScrollView,
  Share as RnShare,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import type {
  RouteOption,
  Trip,
} from "@travel-guide/shared";
import { ApiError } from "@travel-guide/shared";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { DayMap } from "../../components/DayMap/DayMap";
import { FadeSlideIn, FadeSwitch, PressScale } from "../../utils/motion";
import { colors } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";
import { arrayBufferToBase64 } from "../../utils/base64";
import { SLOT_LABEL, TYPE_LABEL } from "./constants";
import { ItemBlock } from "./ItemBlock";
import { HotelNotesRow } from "./HotelNotesRow";
import { styles } from "./styles";

type Props = NativeStackScreenProps<AppStackParamList, "TripDetail">;

function hasCoords(loc: { lng?: number | null; lat?: number | null } | null | undefined): boolean {
  return loc != null && loc.lng != null && loc.lat != null;
}

export function TripDetailScreen({ route, navigation }: Props) {
  const { tripId } = route.params;
  const { user, isGuest } = useAuth();
  const canEdit = Boolean(user) || isGuest;
  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeDay, setActiveDay] = useState(0);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.trips.get(tripId);
      setTrip((prev) => {
        if (
          prev &&
          prev.status === data.status &&
          prev.updated_at === data.updated_at &&
          prev.status === "generating"
        ) {
          return prev;
        }
        return data;
      });
      setError(null);
      return data;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "加载失败");
      return null;
    }
  }, [tripId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await load();
      if (cancelled || !data) return;
      if (data.status === "generating") {
        pollRef.current = setInterval(async () => {
          const next = await load();
          if (next && next.status !== "generating" && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }, 4000);
      }
    })();
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  const days = trip?.days || [];
  const currentDay = days[activeDay] || days[0];
  const dayItems = currentDay?.items || [];
  const selectedItems = useMemo(
    () => dayItems.filter((it) => it.selected),
    [dayItems],
  );

  useEffect(() => {
    setMapReady(false);
    let cleared = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const handle = InteractionManager.runAfterInteractions(() => {
      timeoutId = setTimeout(() => {
        if (!cleared) setMapReady(true);
      }, 280);
    });
    return () => {
      cleared = true;
      handle.cancel?.();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [currentDay?.id]);

  const budgetByType = useMemo(() => {
    const map: Record<string, number> = {};
    days.forEach((d) =>
      d.items.forEach((it) => {
        if (!it.selected) return;
        map[it.type] = (map[it.type] || 0) + (it.cost || 0);
      }),
    );
    return map;
  }, [days]);

  const totalCost = Object.values(budgetByType).reduce((a, b) => a + b, 0);
  const totalBudget =
    trip?.budget_total ?? (trip ? totalCost * trip.travelers : 0);
  const routeOptions = (trip?.preferences?.route_options ||
    []) as RouteOption[];
  const selectedRouteId =
    (trip?.preferences?.selected_route_id as string | undefined) ||
    routeOptions[0]?.id;

  async function onShare() {
    if (!trip || !user) {
      Alert.alert("提示", "登录后才能创建分享链接");
      return;
    }
    setActionBusy(true);
    try {
      const t = await api.trips.createShare(trip.id);
      setTrip(t);
      const token = t.share_token;
      if (!token) throw new Error("未返回分享令牌");
      const url = `http://localhost:3000/share/${token}`;
      await Clipboard.setStringAsync(url);
      setShareMsg(url);
      await RnShare.share({ message: `旅迹攻略：${t.title}\n${url}`, url });
    } catch (e) {
      Alert.alert("分享失败", e instanceof ApiError ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  }

  async function onPdf() {
    if (!trip || !user) {
      Alert.alert("提示", "登录后才能导出 PDF");
      return;
    }
    setActionBusy(true);
    try {
      const buf = await api.trips.exportPdf(trip.id);
      if (Platform.OS === "web") {
        const blob = new Blob([buf], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        Linking.openURL(url);
        return;
      }
      const { File, Paths, EncodingType } = await import("expo-file-system");
      const safe = (trip.title || "trip").replace(/[^\w\u4e00-\u9fff-]+/g, "_");
      const file = new File(Paths.cache, `${safe}.pdf`);
      if (file.exists) file.delete();
      file.create();
      file.write(arrayBufferToBase64(buf), { encoding: EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: "application/pdf" });
      } else {
        Alert.alert("已保存", file.uri);
      }
    } catch (e) {
      Alert.alert("导出失败", e instanceof ApiError ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  }

  async function onSelectRoute(routeId: string) {
    if (!trip) return;
    if (!canEdit) {
      Alert.alert("提示", "当前无法切换路线");
      return;
    }
    if (routeId === selectedRouteId || actionBusy) return;
    setActionBusy(true);
    try {
      setTrip(await api.trips.selectRoute(trip.id, routeId));
      setActiveDay(0);
    } catch (e) {
      Alert.alert("失败", e instanceof ApiError ? e.message : "切换失败");
    } finally {
      setActionBusy(false);
    }
  }

  async function onRegenDay() {
    if (!canEdit || !currentDay || !trip) return;
    setActionBusy(true);
    try {
      setTrip(await api.trips.regenerateDay(trip.id, currentDay.day_index));
    } catch (e) {
      Alert.alert("失败", e instanceof ApiError ? e.message : "重新生成失败");
    } finally {
      setActionBusy(false);
    }
  }

  if (error && !trip) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <PressScale style={styles.retry} onPress={load}>
          <Text style={styles.retryText}>重试</Text>
        </PressScale>
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (trip.status === "generating") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} size="large" />
        <Text style={styles.generating}>正在生成攻略…</Text>
        <Text style={styles.hint}>通常需要一两分钟</Text>
      </View>
    );
  }

  if (trip.status === "failed") {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>生成失败</Text>
        <Text style={styles.hint}>{trip.error_msg || "请返回重试"}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{trip.title}</Text>
      <Text style={styles.meta}>
        {trip.destination} · {trip.start_date} → {trip.end_date} ·{" "}
        {trip.travelers} 人
        {trip.budget_total != null
          ? ` · 约 ¥${Math.round(trip.budget_total)}`
          : ""}
      </Text>

      <View style={styles.actions}>
        <PressScale
          style={[styles.actionBtn, styles.actionPrimary]}
          onPress={onShare}
          disabled={actionBusy}
        >
          <Text style={styles.actionPrimaryText}>分享</Text>
        </PressScale>
        <PressScale
          style={styles.actionBtn}
          onPress={onPdf}
          disabled={actionBusy}
        >
          <Text style={styles.actionText}>导出 PDF</Text>
        </PressScale>
        {trip.share_token ? (
          <PressScale
            style={styles.actionBtn}
            onPress={() =>
              navigation.navigate("Share", { token: trip.share_token! })
            }
          >
            <Text style={styles.actionText}>打开分享页</Text>
          </PressScale>
        ) : null}
      </View>
      {shareMsg ? (
        <Text style={styles.shareMsg} selectable>
          已复制：{shareMsg}
        </Text>
      ) : null}

      {routeOptions.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>路线方案</Text>
          {routeOptions.map((opt) => {
            const on = opt.id === selectedRouteId;
            return (
              <PressScale
                key={opt.id}
                disabled={!canEdit || actionBusy}
                onPress={() => onSelectRoute(opt.id)}
                style={[styles.routeCard, on && styles.routeCardOn]}
              >
                <Text style={styles.routeTitle}>{opt.title}</Text>
                <Text style={styles.routeTheme}>{opt.theme}</Text>
                {opt.tagline ? (
                  <Text style={styles.routeTag}>{opt.tagline}</Text>
                ) : null}
                {on ? (
                  <Text style={styles.routeOnHint}>当前方案</Text>
                ) : null}
              </PressScale>
            );
          })}
        </View>
      ) : null}

      <FadeSwitch
        switchKey={`${selectedRouteId || "default"}-${activeDay}-${currentDay?.id || "d"}`}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.dayTabs}
          contentContainerStyle={{ gap: 8 }}
        >
          {days.map((d, i) => (
            <PressScale
              key={d.id}
              scaleTo={0.96}
              onPress={() => setActiveDay(i)}
              style={[styles.dayTab, i === activeDay && styles.dayTabOn]}
            >
              <Text
                style={[
                  styles.dayTabText,
                  i === activeDay && styles.dayTabTextOn,
                ]}
              >
                Day {d.day_index} · {d.date.slice(5)}
              </Text>
            </PressScale>
          ))}
        </ScrollView>

        {canEdit && currentDay ? (
          <PressScale
            style={styles.regen}
            onPress={onRegenDay}
            disabled={actionBusy}
          >
            <Text style={styles.regenText}>
              {actionBusy ? "处理中…" : "重新生成当天"}
            </Text>
          </PressScale>
        ) : null}

        {currentDay?.summary ? (
          <FadeSlideIn delay={40} style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>当日亮点</Text>
            <Text style={styles.summaryText}>{currentDay.summary}</Text>
          </FadeSlideIn>
        ) : null}

        <Text style={styles.sectionTitle}>
          精选行程 · {selectedItems.length} 个安排
        </Text>
        {dayItems.map((item, i) => {
          const hasNextRoute = dayItems
            .slice(i + 1)
            .some((n) => n.selected && hasCoords(n.location));
          return (
            <FadeSlideIn key={item.id} delay={Math.min(i, 6) * 45}>
              <ItemBlock
                item={item}
                tripId={trip.id}
                canEdit={canEdit}
                onChanged={setTrip}
                hasNextRoute={hasNextRoute}
              />
            </FadeSlideIn>
          );
        })}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>当日路线地图</Text>
          {mapReady ? (
            <DayMap
              tripId={trip.id}
              dayId={currentDay?.id}
              items={selectedItems}
              title={`第 ${currentDay?.day_index ?? activeDay + 1} 天路线`}
            />
          ) : (
            <View style={styles.mapPlaceholder}>
              <ActivityIndicator color={colors.brand} />
              <Text style={styles.mapPlaceholderText}>地图加载中…</Text>
            </View>
          )}
        </View>

        <View style={styles.budget}>
          <Text style={styles.sectionTitle}>预算估算</Text>
          {Object.entries(budgetByType).map(([type, cost]) => (
            <View key={type} style={styles.budgetRow}>
              <Text style={styles.budgetLabel}>{TYPE_LABEL[type] || type}</Text>
              <Text style={styles.budgetVal}>¥{cost}</Text>
            </View>
          ))}
          <View style={[styles.budgetRow, styles.budgetTotal]}>
            <Text style={styles.budgetHint}>
              人均 ¥{Math.round(totalCost)} × {trip.travelers}
            </Text>
            <Text style={styles.budgetTotalVal}>
              ¥{Math.round(totalBudget)}
            </Text>
          </View>
        </View>

        <HotelNotesRow
          destination={trip.destination}
          status={trip.hotel_fetch_status}
          candidates={trip.hotel_candidates}
          refs={trip.external_refs}
        />
      </FadeSwitch>
    </ScrollView>
  );
}
