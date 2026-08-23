import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
  const [candidates, setCandidates] = useState<PoiSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");

  useEffect(() => {
    if (!visible || !coords) {
      setCandidates([]);
      setCustomOpen(false);
      setCustomName("");
      return;
    }
    setCustomOpen(false);
    setCustomName("");
    let cancelled = false;
    setLoading(true);
    void api.trips
      .nearbyPois(coords.lng, coords.lat, type, 10)
      .then((list) => {
        if (!cancelled) setCandidates(list);
      })
      .catch(() => {
        if (!cancelled) setCandidates([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, coords, type]);

  const confirmCustom = useCallback(() => {
    const name = customName.trim();
    if (!name) return;
    onAddCustom(name, type);
  }, [customName, type, onAddCustom]);

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
        <View
          style={[styles.addSheet, { paddingBottom: Math.max(insets.bottom, 12) }]}
        >
          <View style={styles.addHead}>
            <View style={styles.addHeadMain}>
              <Text style={styles.addTitle}>添加到 {dayLabel}</Text>
              <Text style={styles.addSub}>
                选择地图点击处附近的地点，添加进当天行程
              </Text>
            </View>
            <Pressable style={styles.addClose} onPress={onCancel} hitSlop={12}>
              <Text style={styles.addCloseText}>✕</Text>
            </Pressable>
          </View>

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

          {loading ? (
            <View style={styles.addLoading}>
              <ActivityIndicator color={colors.brand} />
            </View>
          ) : candidates.length ? (
            <ScrollView style={styles.addList} showsVerticalScrollIndicator={false}>
              {candidates.map((poi) => {
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
                该位置附近暂无这类地点，可自定义添加
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
                <Text style={styles.addCustomBtnText}>✚ 自定义该位置</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
