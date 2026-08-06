import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  Share as RnShare,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeViewGestureHandler, ScrollView } from "react-native-gesture-handler";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { GenerateProgressEvent } from "@travel-guide/shared";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import type {
  RouteOption,
  Trip,
} from "@travel-guide/shared";
import { ApiError } from "@travel-guide/shared";
import { api, apiBase, getStoredToken } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { HeroRouteMap } from "../../components/HeroRouteMap";
import { TripDetailSheet } from "../../components/TripDetailSheet";
import { FadeSlideIn, FadeSwitch, PressScale } from "../../utils/motion";
import { colors } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";
import { arrayBufferToBase64 } from "../../utils/base64";
import { SLOT_LABEL, TYPE_LABEL } from "./constants";
import { ItemListRow } from "./ItemListRow";
import { HotelNotesRow } from "./HotelNotesRow";
import { readGenerateSSE } from "../../utils/sseClient";
import { TripGeneratingView } from "./TripGeneratingView";
import { styles } from "./styles";

type Props = NativeStackScreenProps<AppStackParamList, "TripDetail">;

function hasCoords(loc: { lng?: number | null; lat?: number | null } | null | undefined): boolean {
  return loc != null && loc.lng != null && loc.lat != null;
}

function buildTripChatPrompt(trip: Trip): string {
  const hint = (trip.preferences as Record<string, unknown> | undefined)?.chat_hint;
  const extra =
    typeof hint === "string" && hint.trim()
      ? `另外请回答：${hint.trim()}`
      : "请帮我看看有没有可以优化的地方。";
  return `关于这次${trip.destination}旅行（${trip.start_date} 至 ${trip.end_date}，${trip.travelers} 人），${extra}`;
}

export function TripDetailScreen({ route, navigation }: Props) {
  const { tripId } = route.params;
  const insets = useSafeAreaInsets();
  const { user, isGuest } = useAuth();
  const canEdit = Boolean(user) || isGuest;
  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeDay, setActiveDay] = useState(0);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [pageScrollEnabled, setPageScrollEnabled] = useState(true);
  const heroMapRef = useRef<NativeViewGestureHandler>(null);
  const [genMessage, setGenMessage] = useState("正在启动生成…");
  const [genReadable, setGenReadable] = useState("");
  const [genPhase, setGenPhase] = useState("");
  const [genStreaming, setGenStreaming] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.trips.get(tripId);
      setTrip((prev) => {
        if (
          data.status === "generating" ||
          !prev ||
          prev.status !== data.status ||
          prev.updated_at !== data.updated_at
        ) {
          return data;
        }
        return prev;
      });
      setError(null);
      return data;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "加载失败");
      return null;
    }
  }, [tripId]);

  const applyProgress = useCallback((evt: GenerateProgressEvent) => {
    if (evt.phase) setGenPhase(evt.phase);
    if (evt.message) setGenMessage(evt.message.replace(/\*\*/g, ""));
    if (evt.readable) {
      setGenReadable(evt.readable);
      setGenStreaming(true);
    }
    if (evt.done || evt.status === "ready" || evt.status === "failed") {
      setGenStreaming(false);
    }
  }, []);

  const subscribeGenerateStream = useCallback(async () => {
    streamAbortRef.current?.abort();
    if (progressPollRef.current) {
      clearInterval(progressPollRef.current);
      progressPollRef.current = null;
    }

    const ctrl = new AbortController();
    streamAbortRef.current = ctrl;
    setGenStreaming(true);

    const token = await getStoredToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const url = `${apiBase}/trips/${tripId}/generate-stream`;
    const sseOk = await readGenerateSSE(
      url,
      headers,
      (evt) => {
        applyProgress(evt);
        if (evt.done || evt.status === "ready" || evt.status === "failed") {
          void load();
        }
      },
      ctrl.signal,
    );

    if (!sseOk && !ctrl.signal.aborted) {
      progressPollRef.current = setInterval(async () => {
        try {
          const evt = await api.trips.generateProgress(tripId);
          applyProgress(evt);
          if (evt.done) {
            if (progressPollRef.current) clearInterval(progressPollRef.current);
            progressPollRef.current = null;
            await load();
          }
        } catch {
          /* ignore */
        }
      }, 450);
    }
  }, [applyProgress, load, tripId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await load();
      if (cancelled || !data) return;
      if (data.status === "generating") {
        void subscribeGenerateStream();
        pollRef.current = setInterval(async () => {
          const next = await load();
          if (next && next.status !== "generating" && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }, 5000);
      }
    })();
    return () => {
      cancelled = true;
      streamAbortRef.current?.abort();
      if (pollRef.current) clearInterval(pollRef.current);
      if (progressPollRef.current) clearInterval(progressPollRef.current);
    };
  }, [load, tripId, subscribeGenerateStream]);

  const days = trip?.days || [];
  const currentDay = days[activeDay] || days[0];
  const dayItems = currentDay?.items || [];
  const selectedItems = useMemo(
    () => dayItems.filter((it) => it.selected),
    [dayItems],
  );

  useEffect(() => {
    setPageScrollEnabled(true);
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
      <TripGeneratingView
        trip={trip}
        message={genMessage}
        readable={genReadable}
        phase={genPhase}
        streaming={genStreaming}
      />
    );
  }

  if (trip.status === "failed") {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>生成失败</Text>
        <Text style={styles.hint}>
          {trip.error_msg ||
            "目的地可能不存在或暂无法生成，请返回修改后重试"}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={StyleSheet.absoluteFill}>
        <Pressable
          style={[styles.mapBackBtn, { top: Math.max(insets.top, 8) + 4 }]}
          onPress={() => navigation.goBack()}
          hitSlop={8}
        >
          <Text style={styles.mapBackText}>‹ 返回</Text>
        </Pressable>
        <FadeSwitch
          switchKey={`${selectedRouteId || "default"}-${activeDay}-${currentDay?.id || "d"}`}
        >
          <HeroRouteMap
            ref={heroMapRef}
            fill
            tripId={trip.id}
            dayId={currentDay?.id}
            items={selectedItems}
            destination={trip.destination}
            title={`第 ${currentDay?.day_index ?? activeDay + 1} 天路线`}
            showCategoryChips
            onMapGestureChange={(active) => setPageScrollEnabled(!active)}
          />
        </FadeSwitch>
      </View>

      <TripDetailSheet>
        <ScrollView
          style={styles.scrollBody}
          contentContainerStyle={styles.content}
          nestedScrollEnabled
          scrollEnabled={pageScrollEnabled}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
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
          style={[styles.actionBtn, styles.actionAi]}
          onPress={() =>
            navigation.push("Chat", {
              tripId: trip.id,
              prefillMessage: buildTripChatPrompt(trip),
              chatSessionId: String(Date.now()),
            })
          }
        >
          <Text style={[styles.actionText, { color: colors.brandHot }]}>
            问 AI 助手
          </Text>
        </PressScale>
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
        switchKey={`day-${selectedRouteId || "default"}-${activeDay}-${currentDay?.id || "d"}`}
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
              <ItemListRow
                item={item}
                tripId={trip.id}
                destination={trip.destination}
                hasNextRoute={hasNextRoute}
              />
            </FadeSlideIn>
          );
        })}

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
      </TripDetailSheet>
    </View>
  );
}