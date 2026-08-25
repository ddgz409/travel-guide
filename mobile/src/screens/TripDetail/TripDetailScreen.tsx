import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { GenerateProgressEvent } from "@travel-guide/shared";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import type {
  Item,
  PoiSearchResult,
  RouteOption,
  Trip,
} from "@travel-guide/shared";
import { ApiError } from "@travel-guide/shared";
import { api, apiBase, getStoredToken } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { HeroRouteMap } from "../../components/HeroRouteMap";
import { SegmentBubbleBar } from "../../components/SegmentBubbleBar";
import { DraggableBottomSheet } from "../CityDetail/DraggableBottomSheet";
import { PoiDetailSheet } from "../CityDetail/PoiDetailSheet";
import { FadeSwitch, PressScale } from "../../utils/motion";
import { getDeviceLocation, peekCachedLocation } from "../../utils/location";
import type { LatLng } from "../../utils/geo";
import {
  enrichPoiSheetData,
  poiSheetFromTripItem,
  type PoiSheetData,
} from "../../utils/poiDetailHelpers";
import { colors } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";
import { arrayBufferToBase64 } from "../../utils/base64";
import { shareUrlForToken } from "../../utils/shareUrl";
import { ShareChoiceSheet } from "../../components/ShareChoiceSheet";
import type { ShareChoicePayload } from "../../utils/shareChoice";
import { SLOT_LABEL, TYPE_LABEL } from "./constants";
import { ItemListRow } from "./ItemListRow";
import { HotelNotesRow } from "./HotelNotesRow";
import { CollaboratorsRow } from "./CollaboratorsRow";
import { AddSpotSheet, type PoiAddType } from "./AddSpotSheet";
import { AddCitySheet } from "./AddCitySheet";
import { SortableDayList } from "./SortableDayList";
import { readGenerateSSE } from "../../utils/sseClient";
import { routeModeForTrip } from "../../utils/routeMode";
import { TripGeneratingView } from "./TripGeneratingView";
import { routeOptionLabel } from "./routeLabels";
import { styles } from "./styles";

type Props = NativeStackScreenProps<AppStackParamList, "TripDetail">;

function hasCoords(loc: { lng?: number | null; lat?: number | null } | null | undefined): boolean {
  return loc != null && loc.lng != null && loc.lat != null;
}

export function TripDetailScreen({ route, navigation }: Props) {
  const { tripId } = route.params;
  const insets = useSafeAreaInsets();
  const { user, isGuest } = useAuth();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeDay, setActiveDay] = useState(0);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [sharePayload, setSharePayload] = useState<ShareChoicePayload | null>(
    null,
  );
  const [actionBusy, setActionBusy] = useState(false);
  const [genMessage, setGenMessage] = useState("正在启动生成…");
  const [genReadable, setGenReadable] = useState("");
  const [genPhase, setGenPhase] = useState("");
  const [genStreaming, setGenStreaming] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const [poiSheet, setPoiSheet] = useState<PoiSheetData | null>(null);
  const [userLocation, setUserLocation] = useState<LatLng | null>(() =>
    peekCachedLocation(),
  );
  // 地图选点新增地点
  const [pickMode, setPickMode] = useState(false);
  const [addCoords, setAddCoords] = useState<{ lng: number; lat: number } | null>(
    null,
  );
  const [addSheetVisible, setAddSheetVisible] = useState(false);
  // 城市管理弹层（添加/删除城市）
  const [citySheetVisible, setCitySheetVisible] = useState(false);
  // 编辑态：显示删除按钮
  const [editingDay, setEditingDay] = useState(false);
  // 长按拖拽中禁用外层滚动，避免与排序手势冲突
  const [listScrollEnabled, setListScrollEnabled] = useState(true);
  // 外层竖向 ScrollView 的原生手势：行内拖拽 Pan 与其 blocksExternalGesture，
  // 避免编辑模式启用大量长按拖拽手势时与原生滚动死锁（页面卡死）。
  const sheetScrollGesture = useMemo(() => Gesture.Native(), []);
  // 排序自动滚动：记录列表滚动位置与容器屏幕范围
  const sheetListRef = useRef<ScrollView>(null);
  const sheetOffsetY = useRef(0);
  const sheetWindowRef = useRef<{ top: number; height: number } | null>(null);
  // 地图选点：注入是否成功
  const pickInjectedRef = useRef(false);
  const pickInjectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const measureSheetWindow = useCallback(() => {
    // RN 的 ScrollView 实例运行时带 measureInWindow（类型层未暴露，做安全收窄）
    const node = sheetListRef.current as unknown as {
      measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
    } | null;
    node?.measureInWindow?.((_x, y, _w, h) => {
      sheetWindowRef.current = { top: y, height: h };
    });
  }, []);
  const autoScrollStep = useCallback((dy: number) => {
    sheetListRef.current?.scrollTo({
      y: Math.max(0, sheetOffsetY.current + dy),
      animated: false,
    });
  }, []);

  const openPoiDetail = useCallback(
    (base: PoiSheetData) => {
      setPoiSheet(base);
      const city = trip?.destination?.trim() || "";
      if (!city) return;
      void enrichPoiSheetData(base, city).then((enriched) => {
        setPoiSheet((prev) => {
          if (!prev || prev.name !== enriched.name) return prev;
          return {
            ...enriched,
            tripItemId: prev.tripItemId,
            selected: prev.selected,
            alternatives: prev.alternatives,
          };
        });
      });
    },
    [trip?.destination],
  );

  const syncPoiSheetFromTrip = useCallback((updated: Trip) => {
    setTrip(updated);
    setPoiSheet((prev) => {
      if (!prev?.tripItemId) return prev;
      for (const day of updated.days || []) {
        const item = day.items.find((it) => it.id === prev.tripItemId);
        if (!item) return prev;
        return {
          ...prev,
          name: item.name,
          desc: item.description?.trim() || prev.desc,
          lng: item.location?.lng ?? prev.lng,
          lat: item.location?.lat ?? prev.lat,
          address: item.location?.address ?? prev.address,
          category:
            item.type === "meal"
              ? "foods"
              : item.type === "hotel"
                ? "hotels"
                : "spots",
          selected: item.selected,
          alternatives: item.alternatives,
        };
      }
      return prev;
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await api.trips.get(tripId);
      setTrip((prev) => {
        if (
          data.share_mode === "collab" ||
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
    void getDeviceLocation()
      .then(setUserLocation)
      .catch(() => {});
  }, []);

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

  useEffect(() => {
    if (!trip || trip.status === "generating" || trip.share_mode !== "collab") {
      return;
    }
    const id = setInterval(() => void load(), 4000);
    return () => clearInterval(id);
  }, [trip?.id, trip?.status, trip?.share_mode, load]);

  const days = trip?.days || [];
  const currentDay = days[activeDay] || days[0];
  const dayItems = currentDay?.items || [];
  const selectedItems = useMemo(
    () => dayItems.filter((it) => it.selected),
    [dayItems],
  );

  const allTripItems = useMemo(
    () => days.flatMap((d) => d.items),
    [days],
  );

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
  const canEdit = trip ? Boolean(trip.can_edit) : Boolean(user) || isGuest;

  useEffect(() => {
    setActiveDay(0);
  }, [selectedRouteId]);

  const topPad = Math.max(insets.top, 8);
  const filterTop = topPad + 56;
  const categoryBarTop = filterTop + (days.length > 1 ? 48 : 0);
  const pickBarTop = categoryBarTop + 52;
  const dayLabel = currentDay
    ? `第 ${currentDay.day_index} 天${currentDay.city ? ` · ${currentDay.city}` : ""}`
    : "行程";

  async function onShare() {
    if (!trip || !user) {
      Alert.alert("提示", "登录后才能分享，邀请好友一起编辑");
      return;
    }
    void createAndShare("collab");
  }

  async function createAndShare(mode: "read" | "collab") {
    if (!trip) return;
    setActionBusy(true);
    try {
      const t = await api.trips.createShare(trip.id, mode);
      setTrip(t);
      const token = t.share_token;
      if (!token) throw new Error("未返回分享令牌");
      const url = shareUrlForToken(token);
      await Clipboard.setStringAsync(url);
      setShareMsg(url);
      const prefix =
        mode === "collab"
          ? `邀请你一起编辑知径攻略「${t.title}」（需登录）`
          : `知径攻略：${t.title}`;
      setSharePayload({
        url,
        title: t.title,
        message: `${prefix}\n${url}`,
      });
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
      setPickMode(false);
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

  async function onReplanDay() {
    if (!canEdit || !currentDay || !trip) return;
    setActionBusy(true);
    try {
      setTrip(await api.trips.replanDay(trip.id, currentDay.id));
    } catch (e) {
      Alert.alert("失败", e instanceof ApiError ? e.message : "重排失败");
    } finally {
      setActionBusy(false);
    }
  }

  async function onAddCity(city: string, position: number) {
    if (!trip) return;
    setCitySheetVisible(false);
    setActionBusy(true);
    try {
      const t = await api.trips.addCity(trip.id, { city, position });
      setTrip(t);
      const len = t.days?.length || 1;
      setActiveDay(Math.max(0, Math.min(position - 1, len - 1)));
    } catch (e) {
      Alert.alert("添加失败", e instanceof ApiError ? e.message : "操作失败");
    } finally {
      setActionBusy(false);
    }
  }

  function confirmDeleteCity(city: string) {
    Alert.alert(
      "删除城市",
      `确定从路线中移除「${city}」吗？该城市出现的所有天都会被删除。`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: () => void doDeleteCity(city),
        },
      ],
    );
  }

  async function doDeleteCity(city: string) {
    if (!trip) return;
    setActionBusy(true);
    try {
      const t = await api.trips.deleteCity(trip.id, city);
      setTrip(t);
      const len = t.days?.length || 1;
      setActiveDay((prev) => Math.min(prev, len - 1));
    } catch (e) {
      Alert.alert("删除失败", e instanceof ApiError ? e.message : "操作失败");
    } finally {
      setActionBusy(false);
    }
  }

  function startPickMode() {
    if (!canEdit || !currentDay) return;
    setPoiSheet(null);
    pickInjectedRef.current = false;
    setPickMode(true);
    // 地图 WebView 未就绪时选点指令注入不了，用户会以为按钮坏了；
    // 超时未注入则明确提示并退出选点模式
    if (pickInjectTimer.current) clearTimeout(pickInjectTimer.current);
    pickInjectTimer.current = setTimeout(() => {
      if (!pickInjectedRef.current && !actionBusy) {
        setPickMode(false);
        Alert.alert("地图还在加载", "地图尚未就绪，请等几秒后再点「添加地点」。");
      }
    }, 1500);
  }

  function cancelPick() {
    setPickMode(false);
  }

  const onMapPick = useCallback((lng: number, lat: number) => {
    setPickMode(false);
    setAddCoords({ lng, lat });
    setAddSheetVisible(true);
  }, []);

  async function addItemPayload(
    payload: Parameters<typeof api.trips.addItem>[2],
  ) {
    if (!trip || !currentDay) return;
    setAddSheetVisible(false);
    setAddCoords(null);
    setActionBusy(true);
    try {
      setTrip(await api.trips.addItem(trip.id, currentDay.id, payload));
    } catch (e) {
      Alert.alert("添加失败", e instanceof ApiError ? e.message : "操作失败");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleAddPoi(poi: PoiSearchResult, type: PoiAddType) {
    await addItemPayload({
      name: poi.name,
      poi_id: poi.poi_id,
      location: poi.location,
      type,
      time_slot: null,
    });
  }

  async function handleAddCustom(name: string, type: PoiAddType) {
    if (!addCoords) return;
    const coords = addCoords;
    await addItemPayload({
      name,
      type,
      location: { lng: coords.lng, lat: coords.lat, address: "" },
      time_slot: null,
    });
  }

  function confirmDelete(item: Item) {
    Alert.alert(
      "删除地点",
      `确定从当天行程中删除「${item.name}」吗？`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: () => void doDelete(item),
        },
      ],
    );
  }

  async function doDelete(item: Item) {
    if (!trip) return;
    setActionBusy(true);
    try {
      setTrip(await api.trips.deleteItem(trip.id, item.id));
    } catch (e) {
      Alert.alert("删除失败", e instanceof ApiError ? e.message : "操作失败");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleReorder(orderedIds: string[]) {
    if (!trip || !currentDay) return;
    const items = orderedIds.map((id, seq) => ({ item_id: id, new_seq: seq }));
    setActionBusy(true);
    try {
      setTrip(await api.trips.reorderItems(trip.id, currentDay.id, items));
    } catch (e) {
      Alert.alert("排序失败", e instanceof ApiError ? e.message : "操作失败");
      void load();
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
      <FadeSwitch
        switchKey={`${selectedRouteId || "default"}-${activeDay}-${currentDay?.id || "d"}`}
        style={styles.mapLayer}
      >
        <HeroRouteMap
          fill
          tripId={trip.id}
          dayId={currentDay?.id}
          items={dayItems}
          categoryItems={allTripItems}
          destination={trip.destination}
          title={`第 ${currentDay?.day_index ?? activeDay + 1} 天路线${currentDay?.city ? ` · ${currentDay.city}` : ""}`}
          showCategoryChips
          categoryBarTop={categoryBarTop}
          onPoiPress={openPoiDetail}
          pickMode={pickMode}
          onMapPick={onMapPick}
          onPickModeInjected={() => {
            pickInjectedRef.current = true;
            if (pickInjectTimer.current) {
              clearTimeout(pickInjectTimer.current);
              pickInjectTimer.current = null;
            }
          }}
          routeMode={routeModeForTrip(trip)}
        />
      </FadeSwitch>

      {pickMode ? (
        <View style={[styles.pickBar, { top: pickBarTop }]}>
          <Text style={styles.pickBarText}>
            点击地图选择要添加的地点，选好后在此列表确认
          </Text>
          <Pressable onPress={cancelPick} hitSlop={10}>
            <Text style={styles.pickCancelText}>取消</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.topOverlay, { paddingTop: topPad }]}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={styles.topCityBlock}>
          <Text style={styles.topCityName} numberOfLines={1}>
            {trip.title}
          </Text>
          <Text style={styles.topCitySub} numberOfLines={1}>
            {trip.destination} · {trip.start_date} → {trip.end_date} ·{" "}
            {trip.travelers} 人
            {trip.budget_total != null
              ? ` · 约 ¥${Math.round(trip.budget_total)}`
              : ""}
          </Text>
        </View>
        {canEdit ? (
          <PressScale
            style={styles.shareHeadBtn}
            onPress={() => setCitySheetVisible(true)}
            disabled={actionBusy}
          >
            <Text style={styles.shareHeadText}>＋ 城市</Text>
          </PressScale>
        ) : null}
      </View>

      {days.length > 1 ? (
        <View style={[styles.filterBar, { top: filterTop }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            {days.map((d, i) => {
              const on = i === activeDay;
              return (
                <Pressable
                  key={d.id}
                  style={[styles.filterChip, on && styles.filterChipOn]}
                  onPress={() => {
                    setActiveDay(i);
                    setPickMode(false);
                  }}
                >
                  <Text style={[styles.filterLabel, on && styles.filterLabelOn]}>
                    Day {d.day_index} · {d.city || d.date.slice(5)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <DraggableBottomSheet
        bottomInset={Math.max(insets.bottom, 8)}
        topOffset={topPad + 56}
        footer={
          (trip.collaborators?.length ?? 0) > 0 ? (
            <CollaboratorsRow collaborators={trip.collaborators || []} />
          ) : undefined
        }
      >
        <View style={styles.sheetMain}>
          <Pressable
            style={styles.shareBanner}
            onPress={onShare}
            disabled={actionBusy}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.shareBannerTitle}>分享链接</Text>
              <Text style={styles.shareBannerSub} numberOfLines={2}>
                {shareMsg || "邀请好友一起编辑这条行程 · 微信 / QQ / 复制"}
              </Text>
            </View>
            <Text style={styles.shareBannerCta}>
              {actionBusy ? "…" : "分享"}
            </Text>
          </Pressable>
          <View style={styles.actions}>
            <PressScale
              style={[styles.actionBtn, styles.actionAi]}
              onPress={() =>
                navigation.push("Chat", {
                  tripId: trip.id,
                  chatSessionId: String(Date.now()),
                })
              }
            >
              <Text style={[styles.actionText, { color: colors.brandHot }]}>
                问 AI 助手
              </Text>
            </PressScale>
            <PressScale
              style={styles.actionBtn}
              onPress={onPdf}
              disabled={actionBusy}
            >
              <Text style={styles.actionText}>导出 PDF</Text>
            </PressScale>
            <PressScale
              style={[styles.actionBtn, styles.actionPost]}
              onPress={() =>
                navigation.navigate("PublishCollection", { tripId: trip.id })
              }
            >
              <Text style={[styles.actionText, { color: "#fff" }]}>一键发帖</Text>
            </PressScale>
            <PressScale
              style={styles.actionBtn}
              onPress={() =>
                navigation.push("Settlement", {
                  tripId: trip.id,
                  title: trip.title,
                  startDate: trip.start_date,
                  endDate: trip.end_date,
                })
              }
            >
              <Text style={styles.actionText}>AA 分账</Text>
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

          <GestureDetector gesture={sheetScrollGesture}>
            <ScrollView
              ref={sheetListRef}
              style={styles.sheetScroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetList}
              nestedScrollEnabled
              scrollEnabled={listScrollEnabled}
              scrollEventThrottle={16}
              onScroll={(e) => {
                sheetOffsetY.current = e.nativeEvent.contentOffset.y;
              }}
            >
            {routeOptions.length > 0 ? (
            <View style={styles.routeSection}>
              <Text style={styles.sectionTitle}>路线方案</Text>
              <SegmentBubbleBar
                options={routeOptions.map((opt) => ({
                  id: opt.id,
                  label: routeOptionLabel(opt, trip.destination),
                }))}
                selectedId={selectedRouteId || routeOptions[0]?.id || ""}
                onSelect={onSelectRoute}
                disabled={!canEdit || actionBusy}
              />
            </View>
          ) : null}

          <View style={styles.daySection}>
            {canEdit && currentDay ? (
              <View style={styles.dayHead}>
                <PressScale
                  style={styles.dayHeadLink}
                  onPress={onRegenDay}
                  disabled={actionBusy}
                >
                  <Text style={styles.regenText}>
                    {actionBusy ? "处理中…" : "重新生成当天"}
                  </Text>
                </PressScale>
                <PressScale
                  style={styles.dayHeadLink}
                  onPress={onReplanDay}
                  disabled={actionBusy}
                >
                  <Text style={styles.regenText}>AI 重新规划</Text>
                </PressScale>
                <View style={styles.dayHeadSpacer} />
                <PressScale
                  style={styles.dayHeadBtn}
                  onPress={startPickMode}
                  disabled={actionBusy || pickMode}
                >
                  <Text style={styles.dayHeadBtnText}>＋ 添加地点</Text>
                </PressScale>
                <PressScale
                  style={[styles.dayHeadBtn, editingDay && styles.dayHeadBtnOn]}
                  onPress={() => setEditingDay((v) => !v)}
                  disabled={actionBusy}
                >
                  <Text
                    style={[
                      styles.dayHeadBtnText,
                      editingDay && styles.dayHeadBtnTextOn,
                    ]}
                  >
                    {editingDay ? "完成" : "编辑"}
                  </Text>
                </PressScale>
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>
              精选行程 · {selectedItems.length} 个安排
            </Text>

            {canEdit ? (
              <Text style={styles.dragHint}>
                {editingDay
                  ? "点击卡片右上角 ✕ 删除 · 长按景点可上下拖动排序"
                  : "点「编辑」可删除或长按拖动调整景点顺序"}
              </Text>
            ) : null}

            <FadeSwitch
              switchKey={`day-${selectedRouteId || "default"}-${activeDay}-${currentDay?.id || "d"}`}
            >
              <SortableDayList
                items={dayItems}
                canEdit={canEdit}
                dragDisabled={actionBusy || !editingDay}
                scrollGesture={sheetScrollGesture}
                getScrollWindow={() => {
                  // 容器在窗口中的位置拖拽期间不变；每次开拖刷新一次，
                  // 返回上一帧的缓存值（异步测量下一帧生效）
                  measureSheetWindow();
                  return sheetWindowRef.current;
                }}
                onAutoScroll={autoScrollStep}
                renderRow={(item) => {
                  const idx = dayItems.indexOf(item);
                  const hasNextRoute = dayItems
                    .slice(idx + 1)
                    .some((n) => n.selected && hasCoords(n.location));
                  return (
                    <ItemListRow
                      item={item}
                      tripId={trip.id}
                      destination={trip.destination}
                      hasNextRoute={hasNextRoute}
                      compact={editingDay}
                      onPoiPress={
                        item.type === "attraction" ||
                        item.type === "meal" ||
                        item.type === "hotel"
                          ? () => openPoiDetail(poiSheetFromTripItem(item))
                          : undefined
                      }
                      onDelete={
                        canEdit && editingDay && item.type !== "transport"
                          ? () => void confirmDelete(item)
                          : undefined
                      }
                    />
                  );
                }}
                onOrderChange={(ids) => void handleReorder(ids)}
                onDragStateChange={setListScrollEnabled}
              />
            </FadeSwitch>

            <View style={styles.budget}>
              <Text style={styles.sectionTitle}>预算估算</Text>
              {Object.entries(budgetByType).map(([type, cost]) => (
                <View key={type} style={styles.budgetRow}>
                  <Text style={styles.budgetLabel}>
                    {TYPE_LABEL[type] || type}
                  </Text>
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
          </View>

          <HotelNotesRow
            destination={trip.destination}
            status={trip.hotel_fetch_status}
            candidates={trip.hotel_candidates}
            refs={trip.external_refs}
          />
          </ScrollView>
          </GestureDetector>
        </View>
      </DraggableBottomSheet>
      <ShareChoiceSheet
        visible={sharePayload != null}
        payload={sharePayload}
        onClose={() => setSharePayload(null)}
      />
      <AddSpotSheet
        visible={addSheetVisible}
        coords={addCoords}
        city={trip.destination}
        dayLabel={dayLabel}
        busy={actionBusy}
        onSelectPoi={(poi, type) => void handleAddPoi(poi, type)}
        onAddCustom={(name, type) => void handleAddCustom(name, type)}
        onCancel={() => {
          setAddSheetVisible(false);
          setAddCoords(null);
        }}
      />
      <AddCitySheet
        visible={citySheetVisible}
        trip={trip}
        busy={actionBusy}
        onAddCity={(city, position) => void onAddCity(city, position)}
        onDeleteCity={(city) => confirmDeleteCity(city)}
        onCancel={() => setCitySheetVisible(false)}
      />
      <PoiDetailSheet
        visible={poiSheet != null}
        item={
          poiSheet
            ? {
                name: poiSheet.name,
                desc: poiSheet.desc,
                lng: poiSheet.lng,
                lat: poiSheet.lat,
                address: poiSheet.address,
                image: poiSheet.image,
                images: poiSheet.images,
              }
            : null
        }
        category={poiSheet?.category ?? "spots"}
        city={trip.destination}
        userLocation={userLocation}
        tripId={trip.id}
        tripItemId={poiSheet?.tripItemId}
        tripItemSelected={poiSheet?.selected ?? true}
        tripAlternatives={poiSheet?.alternatives}
        tripCanEdit={canEdit}
        onTripUpdated={syncPoiSheetFromTrip}
        onClose={() => setPoiSheet(null)}
      />
    </View>
  );
}