import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PoiSearchResult } from "@travel-guide/shared";
import { api } from "../../api/client";
import { distanceLabel } from "../../utils/geo";
import { colors } from "../../theme";
import { styles } from "./styles";

export type PoiAddType = "attraction" | "meal" | "hotel";

const TYPE_OPTIONS: { id: PoiAddType; label: string }[] = [
  { id: "attraction", label: "景点" },
  { id: "meal", label: "美食" },
  { id: "hotel", label: "住宿" },
];

type Props = {
  visible: boolean;
  /** 有坐标=地图选点模式（展示附近）；无坐标=搜索模式 */
  coords: { lng: number; lat: number } | null;
  city: string;
  dayLabel: string;
  busy: boolean;
  onSelectPoi: (poi: PoiSearchResult, type: PoiAddType) => void;
  onAddCustom: (name: string, type: PoiAddType) => void;
  onCancel: () => void;
};

export function AddSpotSheet({
  visible,
  coords,
  city,
  dayLabel,
  busy,
  onSelectPoi,
  onAddCustom,
  onCancel,
}: Props) {
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<PoiAddType>("attraction");
  const [nearby, setNearby] = useState<PoiSearchResult[]>([]);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PoiSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const seqRef = useRef(0);

  // 打开时复位
  useEffect(() => {
    if (!visible) return;
    setQuery("");
    setResults([]);
    setCustomOpen(false);
    setCustomName("");
  }, [visible]);

  // 地图选点模式：加载附近候选
  useEffect(() => {
    if (!visible || !coords) {
      setNearby([]);
      setLoadingNearby(false);
      return;
    }
    let cancelled = false;
    setLoadingNearby(true);
    void api.trips
      .nearbyPois(coords.lng, coords.lat, type, 10)
      .then((list) => {
        if (!cancelled) setNearby(list);
      })
      .catch(() => {
        if (!cancelled) setNearby([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingNearby(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, coords, type]);

  // 关键字即时搜索（防抖）
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      seqRef.current += 1;
      setResults([]);
      setSearching(false);
      return;
    }
    const seq = ++seqRef.current;
    setSearching(true);
    const timer = setTimeout(() => {
      void api.trips
        .searchPois(q, city.trim() || q, 8)
        .then((list) => {
          if (seq === seqRef.current) setResults(list);
        })
        .catch(() => {
          if (seq === seqRef.current) setResults([]);
        })
        .finally(() => {
          if (seq === seqRef.current) setSearching(false);
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [query, city]);

  const confirmCustom = useCallback(() => {
    const name = customName.trim();
    if (!name) return;
    onAddCustom(name, type);
  }, [customName, type, onAddCustom]);

  const q = query.trim();
  const list = q ? results : nearby;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View style={styles.addRoot}>
        <Pressable style={styles.addBackdrop} onPress={onCancel} />
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.spotKav}
          pointerEvents="box-none"
        >
          <View
            style={[styles.addSheet, { paddingBottom: Math.max(insets.bottom, 12) }]}
          >
            <View style={styles.addHead}>
              <View style={styles.addHeadMain}>
                <Text style={styles.addTitle}>添加到 {dayLabel}</Text>
                <Text style={styles.addSub}>
                  {coords
                    ? "选择附近或搜索地点，添加进当天行程"
                    : "输入关键字搜索地点，添加进当天行程"}
                </Text>
              </View>
              <Pressable style={styles.addClose} onPress={onCancel} hitSlop={12}>
                <Text style={styles.addCloseText}>✕</Text>
              </Pressable>
            </View>

            <TextInput
              style={styles.spotSearchInput}
              placeholder={city.trim() ? `在${city.trim()}搜索地点` : "输入关键字搜索地点"}
              placeholderTextColor={colors.muted}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
            />

            <View style={styles.addTypeRow}>
              {TYPE_OPTIONS.map((o) => {
                const on = o.id === type;
                return (
                  <Pressable
                    key={o.id}
                    style={[styles.addTypeChip, on && styles.addTypeChipOn]}
                    onPress={() => setType(o.id)}
                  >
                    <Text style={[styles.addTypeText, on && styles.addTypeTextOn]}>
                      {o.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {q && searching ? (
              <View style={styles.addLoading}>
                <ActivityIndicator color={colors.brand} />
              </View>
            ) : q && !searching && results.length === 0 ? (
              <View style={styles.addEmpty}>
                <Text style={styles.addEmptyText}>
                  未找到匹配地点，换个词试试，或用下方自定义添加
                </Text>
              </View>
            ) : loadingNearby && !q ? (
              <View style={styles.addLoading}>
                <ActivityIndicator color={colors.brand} />
              </View>
            ) : list.length ? (
              <ScrollView
                style={[styles.addList, { maxHeight: 300 }]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                {list.map((poi) => {
                  const dist =
                    coords && poi.location
                      ? distanceLabel(coords, poi.location)
                      : null;
                  return (
                    <Pressable
                      key={poi.poi_id || poi.name}
                      style={styles.addRow}
                      onPress={() => onSelectPoi(poi, type)}
                      disabled={busy}
                    >
                      <View style={styles.addRowBody}>
                        <Text style={styles.addRowName} numberOfLines={1}>
                          {poi.name}
                        </Text>
                        <Text style={styles.addRowSub} numberOfLines={1}>
                          {poi.address ||
                            (city ? `${city} · ${poi.name}` : poi.name)}
                        </Text>
                      </View>
                      {dist ? (
                        <Text style={styles.addRowDist}>
                          {dist.replace("距我 ", "")}
                        </Text>
                      ) : null}
                      <Text style={styles.addRowArrow}>＋</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={styles.addEmpty}>
                <Text style={styles.addEmptyText}>
                  {coords
                    ? "该位置附近暂无这类地点，可搜索或自定义添加"
                    : "输入关键字开始搜索，或用下方自定义添加"}
                </Text>
              </View>
            )}

            <View style={styles.addCustom}>
              {customOpen ? (
                <View style={styles.addCustomForm}>
                  <TextInput
                    style={styles.addCustomInput}
                    placeholder="输入地点名称"
                    placeholderTextColor={colors.muted}
                    value={customName}
                    onChangeText={setCustomName}
                    maxLength={40}
                    autoFocus
                  />
                  <Pressable
                    style={styles.addCustomConfirm}
                    onPress={confirmCustom}
                    disabled={busy || !customName.trim()}
                  >
                    <Text style={styles.addCustomConfirmText}>确定</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={styles.addCustomBtn}
                  onPress={() => setCustomOpen(true)}
                  disabled={busy}
                >
                  <Text style={styles.addCustomBtnText}>✚ 自定义名称添加</Text>
                </Pressable>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
