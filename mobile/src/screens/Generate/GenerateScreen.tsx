import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
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
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { landmarksFor } from "../../data/landmarks";
import { localLlmOverride } from "../../utils/llmStore";
import { FadeSlideIn, FadeSwitch, PressScale } from "../../utils/motion";
import { openExternal } from "../../utils/openExternal";
import { colors } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";
import {
  BUDGET_LEVELS,
  INTERESTS,
  MODE_COLORS,
  QUICK_CITIES,
  TRANSPORTS,
} from "./constants";
import { pickBestLandmarkMatch, quickCardBg } from "./helpers";
import { styles } from "./styles";
import {
  formatDisplayDate,
  parseISODate,
  plusDaysISO,
  todayISO,
  toISODate,
} from "../../utils/date";

type Props = NativeStackScreenProps<AppStackParamList, "Generate">;
type DateField = "start" | "end";
type GenMode = "quick" | "custom";

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
            <Text style={styles.tipGo}>打开 {'→'}</Text>
          </PressScale>
        ))}
      </View>
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
                    已登录：生成优先用账号里的 LLM Key。点此管理 {'→'}
                  </Text>
                </PressScale>
              ) : (
                <View style={styles.note}>
                  <Text style={styles.noteText}>
                    可在「设置」填写自己的 LLM API Key；未填则用服务器默认模型。
                  </Text>
                  <PressScale onPress={() => navigation.navigate("Settings")}>
                    <Text style={styles.noteLink}>去配置 LLM API {'→'}</Text>
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
