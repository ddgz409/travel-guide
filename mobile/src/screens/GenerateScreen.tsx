import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type {
  ExternalTip,
  PoiSearchResult,
  QuickRecommendCard,
} from "@travel-guide/shared";
import { ApiError } from "@travel-guide/shared";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import { landmarksFor } from "../landmarks";
import { localLlmOverride } from "../llmStore";
import { FadeSlideIn, FadeSwitch, PressScale } from "../motion";
import { openExternal } from "../openExternal";
import { cardShadow, colors } from "../theme";
import type { AppStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<AppStackParamList, "Generate">;
type DateField = "start" | "end";
type GenMode = "quick" | "custom";


const INTERESTS = [
  "文化",
  "美食",
  "自然",
  "购物",
  "亲子",
  "摄影",
  "历史",
  "艺术",
];
const BUDGET_LEVELS = [
  { id: "经济", desc: "性价比优先" },
  { id: "中等", desc: "舒适平衡" },
  { id: "豪华", desc: "体验优先" },
];
const TRANSPORTS = ["公共交通", "自驾", "步行", "混合"];
const QUICK_CITIES = ["北京", "成都", "杭州", "大理", "西安", "厦门", "上海", "三亚"];

const MODE_COLORS = { quick: "#FFE8D6", custom: "#E8E4F8" };
const QUICK_CARD_BG: Record<string, string> = {
  classic: "#E8E4F8",
  life: "#FFE8D6",
};
const QUICK_CARD_FALLBACK = ["#D7EAF8", "#E4F0D8", "#F5E0EC"];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function plusDaysISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}
function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function formatDisplayDate(iso: string): string {
  const date = parseISODate(iso);
  if (Number.isNaN(date.getTime())) return iso || "选择日期";
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function pickBestLandmarkMatch(
  query: string,
  results: PoiSearchResult[],
): PoiSearchResult | null {
  if (!results.length) return null;
  const q = query.replace(/\s+/g, "");
  const scored = results.map((r, i) => {
    const name = r.name.replace(/\s+/g, "");
    let score = 0;
    if (name === q) score += 100;
    if (name.includes(q) || q.includes(name)) score += 50;
    if (name.startsWith(q) || q.startsWith(name)) score += 20;
    score -= i;
    return { r, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].r : results[0];
}

export function GenerateScreen({ navigation, route }: Props) {
  const { user, isGuest, enterGuest, rememberGuestTrip } = useAuth();
  const [genMode, setGenMode] = useState<GenMode>("quick");
  const [destination, setDestination] = useState(
    route.params?.destination || "",
  );
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(plusDaysISO(2));
  const [datePicker, setDatePicker] = useState<DateField | null>(null);
  const [travelers, setTravelers] = useState("2");
  const [selected, setSelected] = useState<string[]>(
    route.params?.interests?.length
      ? route.params.interests
      : ["文化", "美食"],
  );
  const [budgetLevel, setBudgetLevel] = useState("中等");
  const [transport, setTransport] = useState("公共交通");
  const [mustInclude, setMustInclude] = useState<PoiSearchResult[]>([]);
  const [poiQuery, setPoiQuery] = useState("");
  const [poiResults, setPoiResults] = useState<PoiSearchResult[]>([]);
  const [poiSearching, setPoiSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quickCards, setQuickCards] = useState<QuickRecommendCard[]>([]);
  const [keyboardPad, setKeyboardPad] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const daysCount = useMemo(() => {
    if (!startDate || !endDate || endDate < startDate) return 0;
    const a = new Date(startDate).getTime();
    const b = new Date(endDate).getTime();
    return Math.floor((b - a) / 86400000) + 1;
  }, [startDate, endDate]);

  const [localLandmarks, setLocalLandmarks] = useState<string[]>(() =>
    landmarksFor(destination).slice(0, 10),
  );

  useEffect(() => {
    const dest = destination.trim();
    if (!dest) {
      setLocalLandmarks([]);
      return;
    }
    setLocalLandmarks(landmarksFor(dest).slice(0, 10));
    let cancelled = false;
    void api.trips
      .suggestLandmarks(dest)
      .then((res) => {
        if (!cancelled && res.landmarks?.length) {
          setLocalLandmarks(res.landmarks.slice(0, 10));
        }
      })
      .catch(() => {
        /* 保留本地精选 */
      });
    return () => {
      cancelled = true;
    };
  }, [destination]);

  function scrollPoiIntoView() {
    // 只轻微滚动，避免把搜索框顶出可视区
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);
  }

  useEffect(() => {
    const showEvt =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvt, (e) => {
      setKeyboardPad(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardPad(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // 输入关键字即搜索地点（防抖）
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = poiQuery.trim();
    if (!q) {
      setPoiResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setPoiSearching(true);
      try {
        const list = await api.trips.searchPois(q, destination.trim(), 8);
        setPoiResults(list);
      } catch {
        setPoiResults([]);
      } finally {
        setPoiSearching(false);
      }
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [poiQuery, destination]);

  function onDateChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === "android") {
      setDatePicker(null);
    }
    if (event.type === "dismissed" || !selected || !datePicker) return;
    const iso = toISODate(selected);
    if (datePicker === "start") {
      setStartDate(iso);
      if (iso > endDate) setEndDate(iso);
    } else {
      setEndDate(iso);
      if (iso < startDate) setStartDate(iso);
    }
  }

  function toggleInterest(name: string) {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
    );
  }

  function addPoi(poi: PoiSearchResult) {
    setMustInclude((prev) =>
      prev.some((p) => p.poi_id === poi.poi_id) ? prev : [...prev, poi],
    );
    setPoiQuery("");
    setPoiResults([]);
    setError(null);
  }

  function isLandmarkAdded(name: string) {
    return mustInclude.some(
      (m) => m.name.includes(name) || name.includes(m.name),
    );
  }

  async function pickSuggestedLandmark(name: string) {
    if (!destination.trim()) {
      setError("请先选择目的地");
      return;
    }
    if (isLandmarkAdded(name)) return;
    setPoiSearching(true);
    setError(null);
    try {
      const list = await api.trips.searchPois(name, destination.trim(), 10);
      const best = pickBestLandmarkMatch(name, list);
      if (best) addPoi(best);
      else setError(`未在${destination}找到「${name}」，请换个关键词`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "搜索失败");
    } finally {
      setPoiSearching(false);
    }
  }

  async function addFromQuery() {
    if (!poiQuery.trim()) return;
    setPoiSearching(true);
    try {
      const list = await api.trips.searchPois(
        poiQuery.trim(),
        destination.trim(),
        8,
      );
      const best = pickBestLandmarkMatch(poiQuery.trim(), list);
      if (best) addPoi(best);
      else setError("未找到匹配景点，请换个关键词");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "搜索失败");
    } finally {
      setPoiSearching(false);
    }
  }

  async function onQuickRecommend() {
    if (!destination.trim()) return setError("请输入目的地");
    setBusy(true);
    setError(null);
    setQuickCards([]);
    try {
      const res = await api.trips.quickRecommend(destination.trim());
      setQuickCards(res.cards || []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "获取推荐失败");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit() {
    if (!destination.trim()) return setError("请输入目的地");
    if (!startDate || !endDate) return setError("请选择日期");
    if (endDate < startDate) return setError("结束日期不能早于开始日期");
    const n = Math.max(1, parseInt(travelers, 10) || 1);
    setBusy(true);
    setError(null);
    try {
      let guest = isGuest;
      if (!user && !guest) {
        await enterGuest();
        guest = true;
      }
      const llm = !user ? await localLlmOverride() : null;
      const payload = {
        destination: destination.trim(),
        start_date: startDate,
        end_date: endDate,
        travelers: n,
        preferences: {
          interests: selected,
          budget_level: budgetLevel,
          transport,
        },
        must_include: mustInclude.length ? mustInclude : undefined,
        llm: llm || undefined,
      };
      const trip = guest
        ? await api.trips.guestGenerate(payload)
        : await api.trips.generate(payload);
      if (guest) await rememberGuestTrip(trip.id);
      navigation.replace("TripDetail", { tripId: trip.id });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "提交失败");
    } finally {
      setBusy(false);
    }
  }

  function renderTipList(title: string, tips: ExternalTip[]) {
    if (!tips?.length) return null;
    return (
      <View style={styles.tipBlock}>
        <Text style={styles.tipBlockTitle}>{title}</Text>
        {tips.map((t) => (
          <PressScale
            key={t.url}
            scaleTo={0.98}
            style={styles.tipRow}
            onPress={() =>
              void openExternal(
                t.url,
                t.title,
                t.meta as { keyword?: string; app_url?: string } | null,
              )
            }
          >
            <Text style={styles.tipTitle} numberOfLines={2}>
              {t.title}
            </Text>
            <Text style={styles.tipGo}>打开 →</Text>
          </PressScale>
        ))}
      </View>
    );
  }

  function quickCardBg(cardId: string, index: number): string {
    return (
      QUICK_CARD_BG[cardId] ||
      QUICK_CARD_FALLBACK[index % QUICK_CARD_FALLBACK.length]
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.root}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 48 + Math.max(keyboardPad - 40, 0) },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.modeLabel}>选择模式</Text>
        <View style={styles.modeRow}>
          <PressScale
            style={[
              styles.modeCard,
              { backgroundColor: MODE_COLORS.quick },
              genMode === "quick" && styles.modeCardOn,
            ]}
            onPress={() => {
              setGenMode("quick");
              setError(null);
            }}
          >
            <Text
              style={[
                styles.modeTitle,
                genMode === "quick" && styles.modeTitleOn,
              ]}
            >
              快速模式
            </Text>
            <Text style={styles.modeDesc}>秒出小红书 / 携程参考链接</Text>
          </PressScale>
          <PressScale
            style={[
              styles.modeCard,
              { backgroundColor: MODE_COLORS.custom },
              genMode === "custom" && styles.modeCardOn,
            ]}
            onPress={() => {
              setGenMode("custom");
              setError(null);
            }}
          >
            <Text
              style={[
                styles.modeTitle,
                genMode === "custom" && styles.modeTitleOn,
              ]}
            >
              专属定制
            </Text>
            <Text style={styles.modeDesc}>AI 生成每日行程与路线</Text>
          </PressScale>
        </View>

        <Text style={styles.label}>目的地</Text>
        <TextInput
          style={styles.input}
          value={destination}
          onChangeText={(t) => {
            setDestination(t);
            setQuickCards([]);
          }}
          placeholder="例如：杭州"
          placeholderTextColor={colors.muted}
        />
        <View style={styles.chips}>
          {QUICK_CITIES.map((c) => (
            <PressScale
              key={c}
              scaleTo={0.96}
              style={[styles.chip, destination === c && styles.chipOn]}
              onPress={() => {
                setDestination(c);
                setQuickCards([]);
              }}
            >
              <Text
                style={[
                  styles.chipText,
                  destination === c && styles.chipTextOn,
                ]}
              >
                {c}
              </Text>
            </PressScale>
          ))}
        </View>

        <FadeSwitch switchKey={genMode}>
          {genMode === "quick" ? (
            <View>
              <Text style={styles.hint}>
                不调用模型，立刻给你两套可打开的攻略入口。
              </Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <PressScale
                style={[styles.primaryBtn, busy && styles.btnDisabled]}
                onPress={onQuickRecommend}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>查看参考</Text>
                )}
              </PressScale>
              {quickCards.map((card, i) => (
                <FadeSlideIn key={card.id} delay={i * 80}>
                  <View
                    style={[
                      styles.quickCard,
                      { backgroundColor: quickCardBg(card.id, i) },
                    ]}
                  >
                    <View style={styles.quickCardBadge}>
                      <View style={styles.quickCardBadgeDot} />
                      <Text style={styles.quickCardBadgeText}>
                        {card.id === "life" ? "吃住出行" : "经典打卡"}
                      </Text>
                    </View>
                    <Text style={styles.quickCardTitle}>{card.title}</Text>
                    {card.tagline ? (
                      <Text style={styles.quickCardTag}>{card.tagline}</Text>
                    ) : null}
                    {renderTipList(
                      "小红书",
                      card.external_refs?.xiaohongshu || [],
                    )}
                    {renderTipList("携程", card.external_refs?.ctrip || [])}
                  </View>
                </FadeSlideIn>
              ))}
            </View>
          ) : (
            <View>
              {user ? (
                <PressScale
                  style={styles.note}
                  onPress={() => navigation.navigate("Settings")}
                >
                  <Text style={styles.noteText}>
                    已登录：生成优先用账号里的 LLM Key。点此管理 →
                  </Text>
                </PressScale>
              ) : (
                <View style={styles.note}>
                  <Text style={styles.noteText}>
                    可在「设置」填写自己的 LLM API Key；未填则用服务器默认模型。
                  </Text>
                  <PressScale onPress={() => navigation.navigate("Settings")}>
                    <Text style={styles.noteLink}>去配置 LLM API →</Text>
                  </PressScale>
                </View>
              )}

              <Text style={styles.label}>开始日期</Text>
              <PressScale
                style={styles.dateBtn}
                onPress={() => setDatePicker("start")}
              >
                <Text style={styles.dateBtnText}>
                  {formatDisplayDate(startDate)}
                </Text>
                <Text style={styles.dateBtnHint}>日历选择</Text>
              </PressScale>
              <Text style={styles.label}>结束日期</Text>
              <PressScale
                style={styles.dateBtn}
                onPress={() => setDatePicker("end")}
              >
                <Text style={styles.dateBtnText}>
                  {formatDisplayDate(endDate)}
                </Text>
                <Text style={styles.dateBtnHint}>日历选择</Text>
              </PressScale>
              {daysCount > 0 ? (
                <Text style={styles.hint}>{daysCount} 天行程</Text>
              ) : null}
              {datePicker ? (
                <View style={styles.pickerWrap}>
                  {Platform.OS === "ios" ? (
                    <View style={styles.pickerHeader}>
                      <Text style={styles.pickerTitle}>
                        {datePicker === "start"
                          ? "选择开始日期"
                          : "选择结束日期"}
                      </Text>
                      <PressScale onPress={() => setDatePicker(null)}>
                        <Text style={styles.pickerDone}>完成</Text>
                      </PressScale>
                    </View>
                  ) : null}
                  <DateTimePicker
                    value={parseISODate(
                      datePicker === "start" ? startDate : endDate,
                    )}
                    mode="date"
                    display={Platform.OS === "ios" ? "inline" : "calendar"}
                    onChange={onDateChange}
                    minimumDate={
                      datePicker === "end"
                        ? parseISODate(startDate)
                        : undefined
                    }
                  />
                </View>
              ) : null}

              <Text style={styles.label}>人数</Text>
              <TextInput
                style={styles.input}
                value={travelers}
                onChangeText={setTravelers}
                keyboardType="number-pad"
                placeholderTextColor={colors.muted}
              />

              <Text style={styles.label}>兴趣偏好</Text>
              <View style={styles.chips}>
                {INTERESTS.map((name) => {
                  const on = selected.includes(name);
                  return (
                    <PressScale
                      key={name}
                      scaleTo={0.96}
                      style={[styles.chip, on && styles.chipOn]}
                      onPress={() => toggleInterest(name)}
                    >
                      <Text
                        style={[styles.chipText, on && styles.chipTextOn]}
                      >
                        {name}
                      </Text>
                    </PressScale>
                  );
                })}
              </View>

              <Text style={styles.label}>预算档位</Text>
              <View style={styles.chips}>
                {BUDGET_LEVELS.map((b) => {
                  const on = budgetLevel === b.id;
                  return (
                    <PressScale
                      key={b.id}
                      scaleTo={0.96}
                      style={[styles.chip, on && styles.chipOn]}
                      onPress={() => setBudgetLevel(b.id)}
                    >
                      <Text
                        style={[styles.chipText, on && styles.chipTextOn]}
                      >
                        {b.id}
                      </Text>
                      <Text style={styles.chipDesc}>{b.desc}</Text>
                    </PressScale>
                  );
                })}
              </View>

              <Text style={styles.label}>交通方式</Text>
              <View style={styles.chips}>
                {TRANSPORTS.map((t) => {
                  const on = transport === t;
                  return (
                    <PressScale
                      key={t}
                      scaleTo={0.96}
                      style={[styles.chip, on && styles.chipOn]}
                      onPress={() => setTransport(t)}
                    >
                      <Text
                        style={[styles.chipText, on && styles.chipTextOn]}
                      >
                        {t}
                      </Text>
                    </PressScale>
                  );
                })}
              </View>

              <View>
                <Text style={styles.label}>必去景点（可选）</Text>
                <Text style={styles.hint}>
                  {destination.trim()
                    ? `点选${destination.trim()}热门，或输入关键字即时搜索`
                    : "先选目的地，再搜索当地景点"}
                </Text>
                {localLandmarks.length > 0 ? (
                  <View style={styles.chips}>
                    {localLandmarks.map((name) => {
                      const added = isLandmarkAdded(name);
                      return (
                        <PressScale
                          key={name}
                          scaleTo={0.96}
                          style={[styles.chip, added && styles.chipOn]}
                          disabled={added || poiSearching}
                          onPress={() => void pickSuggestedLandmark(name)}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              added && styles.chipTextOn,
                            ]}
                          >
                            {added ? `✓ ${name}` : `+ ${name}`}
                          </Text>
                        </PressScale>
                      );
                    })}
                  </View>
                ) : null}

                {mustInclude.length > 0 ? (
                  <View style={[styles.chips, { marginTop: 10, marginBottom: 4 }]}>
                    {mustInclude.map((p, i) => (
                      <FadeSlideIn key={p.poi_id} delay={Math.min(i, 5) * 40}>
                        <PressScale
                          scaleTo={0.96}
                          style={[styles.chip, styles.chipOn]}
                          onPress={() =>
                            setMustInclude((prev) =>
                              prev.filter((x) => x.poi_id !== p.poi_id),
                            )
                          }
                        >
                          <Text style={[styles.chipText, styles.chipTextOn]}>
                            {p.name} ×
                          </Text>
                        </PressScale>
                      </FadeSlideIn>
                    ))}
                  </View>
                ) : null}

                <View
                  style={[
                    styles.poiSearchBlock,
                    poiResults.length > 0 ? { marginBottom: 220 } : null,
                  ]}
                >
                  <View style={styles.poiRow}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginBottom: 0 }]}
                      value={poiQuery}
                      onChangeText={setPoiQuery}
                      onFocus={scrollPoiIntoView}
                      placeholder="输入关键字搜索景点"
                      placeholderTextColor={colors.muted}
                      returnKeyType="search"
                      onSubmitEditing={() => void addFromQuery()}
                    />
                    <PressScale style={styles.poiAdd} onPress={addFromQuery}>
                      {poiSearching ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.poiAddText}>添加</Text>
                      )}
                    </PressScale>
                  </View>

                  {poiQuery.trim() && poiSearching ? (
                    <Text style={styles.searchHint}>正在搜索地点…</Text>
                  ) : null}
                  {poiQuery.trim() &&
                  !poiSearching &&
                  poiResults.length === 0 ? (
                    <Text style={styles.searchHint}>
                      未找到匹配地点，换个词试试
                    </Text>
                  ) : null}

                  {poiResults.length > 0 ? (
                    <View style={styles.poiDropdown}>
                      <ScrollView
                        keyboardShouldPersistTaps="handled"
                        nestedScrollEnabled
                        style={styles.poiDropdownScroll}
                      >
                        {poiResults.map((p) => (
                          <PressScale
                            key={p.poi_id}
                            scaleTo={0.98}
                            style={styles.poiItem}
                            onPress={() => addPoi(p)}
                          >
                            <Text style={styles.poiName}>{p.name}</Text>
                            <Text style={styles.poiAddr} numberOfLines={1}>
                              {p.address || "点击添加"}
                            </Text>
                          </PressScale>
                        ))}
                      </ScrollView>
                    </View>
                  ) : null}
                </View>
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <PressScale
                style={[styles.primaryBtn, busy && styles.btnDisabled]}
                onPress={onSubmit}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>开始专属定制</Text>
                )}
              </PressScale>
            </View>
          )}
        </FadeSwitch>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20 },
  searchHint: {
    marginTop: 8,
    fontSize: 12,
    color: colors.muted,
  },
  modeLabel: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 8,
  },
  modeRow: { flexDirection: "row", gap: 10 },
  modeCard: {
    flex: 1,
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: 18,
    padding: 14,
    ...cardShadow,
  },
  modeCardOn: {
    borderColor: colors.brand,
  },
  modeTitle: { fontSize: 16, fontWeight: "800", color: colors.ink },
  modeTitleOn: { color: colors.brandHot },
  modeDesc: {
    marginTop: 4,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },
  quickCard: {
    marginTop: 14,
    borderRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 14,
    ...cardShadow,
  },
  quickCardBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 10,
  },
  quickCardBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brand,
    marginRight: 6,
  },
  quickCardBadgeText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "600",
  },
  quickCardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.ink,
    lineHeight: 26,
  },
  quickCardTag: {
    marginTop: 4,
    marginBottom: 4,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  tipBlock: { marginTop: 12 },
  tipBlockTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    marginBottom: 8,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: colors.card,
  },
  tipTitle: { flex: 1, fontSize: 14, color: colors.ink, fontWeight: "600" },
  tipGo: {
    marginLeft: 8,
    fontSize: 13,
    color: colors.brandHot,
    fontWeight: "700",
  },
  note: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  noteText: { fontSize: 13, color: colors.ink, lineHeight: 18 },
  noteLink: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "700",
    color: colors.brandHot,
  },
  label: { fontSize: 13, color: colors.muted, marginTop: 14, marginBottom: 6 },
  hint: { fontSize: 12, color: colors.muted, marginTop: 10, marginBottom: 4 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  dateBtn: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateBtnText: { fontSize: 16, color: colors.ink, fontWeight: "600" },
  dateBtnHint: { fontSize: 13, color: colors.brandHot, fontWeight: "600" },
  pickerWrap: {
    marginTop: 10,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 0,
    overflow: "hidden",
    paddingBottom: Platform.OS === "ios" ? 8 : 0,
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  pickerTitle: { fontSize: 14, fontWeight: "600", color: colors.ink },
  pickerDone: { fontSize: 15, fontWeight: "700", color: colors.brandHot },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipOn: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  chipText: { fontSize: 14, color: colors.ink, fontWeight: "600" },
  chipTextOn: { color: colors.brandHot, fontWeight: "700" },
  chipDesc: { fontSize: 11, color: colors.muted, marginTop: 2 },
  poiRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  poiSearchBlock: {
    marginTop: 10,
    position: "relative",
    zIndex: 30,
  },
  poiDropdown: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 56,
    zIndex: 40,
    elevation: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  poiDropdownScroll: { maxHeight: 200 },
  poiAdd: {
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minWidth: 64,
    alignItems: "center",
  },
  poiAddText: { color: "#fff", fontWeight: "700" },
  poiItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  poiName: { fontSize: 14, fontWeight: "600", color: colors.ink },
  poiAddr: { fontSize: 12, color: colors.muted, marginTop: 2 },
  error: { marginTop: 14, color: colors.danger, fontSize: 14 },
  primaryBtn: {
    marginTop: 28,
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
