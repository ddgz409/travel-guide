import React, { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Trip } from "@travel-guide/shared";
import { colors } from "../../theme";
import { citiesGrouped } from "../../data/cities";
import { styles } from "./styles";

type Props = {
  visible: boolean;
  trip: Trip | null;
  busy: boolean;
  onAddCity: (city: string, position: number) => void;
  onDeleteCity: (city: string) => void;
  onCancel: () => void;
};

export function AddCitySheet({
  visible,
  trip,
  busy,
  onAddCity,
  onDeleteCity,
  onCancel,
}: Props) {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState("");
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  // null = 末尾追加
  const [position, setPosition] = useState<number | null>(null);

  const days = trip?.days || [];
  const totalDays = days.length;

  // 当前路线城市（含重复出现次数，如青甘环线起点西宁出现两次）
  const routeCities = useMemo(() => {
    const route =
      trip?.route && trip.route.length
        ? trip.route
        : trip?.destination
          ? [trip.destination]
          : [];
    const counts: { name: string; count: number }[] = [];
    for (const c of route) {
      const hit = counts.find((x) => x.name === c);
      if (hit) hit.count += 1;
      else counts.push({ name: c, count: 1 });
    }
    return counts;
  }, [trip]);

  const groups = useMemo(() => citiesGrouped(filter.trim()), [filter]);

  useEffect(() => {
    if (visible) {
      setFilter("");
      setSelectedCity(null);
      setPosition(null);
    }
  }, [visible]);

  const activePosition = position ?? totalDays + 1;

  const confirmAdd = () => {
    if (!selectedCity || busy) return;
    onAddCity(selectedCity, activePosition);
  };

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
        {/* 键盘避让：statusBarTranslucent 的 Modal 在 Android 上不会触发
            adjustResize，必须手动把面板顶到键盘上方（iOS 同样需要 padding） */}
        <KeyboardAvoidingView behavior="padding" style={styles.addKavWrap}>
          <View
            style={[
              styles.addSheet,
              { paddingBottom: Math.max(insets.bottom, 12) },
            ]}
          >
          <View style={styles.addHead}>
            <View style={styles.addHeadMain}>
              <Text style={styles.addTitle}>管理城市</Text>
              <Text style={styles.addSub}>
                添加新城市到路线，或移除已有城市
              </Text>
            </View>
            <Pressable style={styles.addClose} onPress={onCancel} hitSlop={12}>
              <Text style={styles.addCloseText}>✕</Text>
            </Pressable>
          </View>

          {/* 当前路线城市 + 删除 */}
          {routeCities.length > 0 ? (
            <View style={styles.citySection}>
              <Text style={styles.citySectionLabel}>当前路线</Text>
              {routeCities.map((c) => (
                <View key={c.name} style={styles.cityManageRow}>
                  <Text style={styles.cityManageName} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={styles.cityManageSub}>
                    {c.count > 1 ? `${c.count} 天` : "1 天"}
                  </Text>
                  <Pressable
                    style={styles.cityManageDel}
                    onPress={() => onDeleteCity(c.name)}
                    disabled={busy}
                    hitSlop={8}
                  >
                    <Text style={styles.cityManageDelText}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {/* 选择要添加的城市 */}
          <View style={styles.citySection}>
            <Text style={styles.citySectionLabel}>选择要添加的城市</Text>
            <TextInput
              style={styles.citySearchInput}
              placeholder="搜索城市…"
              placeholderTextColor={colors.muted}
              value={filter}
              onChangeText={setFilter}
              maxLength={20}
            />
            <ScrollView
              style={styles.citySheetScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {filter.trim().length === 0 ? (
                // 未输入关键字时不展示全量列表（避免长列表把下方内容顶出屏幕），
                // 等用户输入后再做补全
                <View style={styles.cityEmpty}>
                  <Text style={styles.cityEmptyText}>
                    输入城市名关键字搜索；未收录的地名也可直接添加
                  </Text>
                </View>
              ) : groups.length === 0 ? (
                <View style={styles.cityEmpty}>
                  {filter.trim().length >= 2 ? (
                    <>
                      <Text style={styles.cityEmptyText}>
                        本地列表未收录该城市，可直接添加：
                      </Text>
                      <Pressable
                        style={[
                          styles.cityChip,
                          selectedCity === filter.trim() && styles.cityChipOn,
                        ]}
                        onPress={() =>
                          setSelectedCity(
                            selectedCity === filter.trim() ? null : filter.trim(),
                          )
                        }
                      >
                        <Text
                          style={[
                            styles.cityChipText,
                            selectedCity === filter.trim() &&
                              styles.cityChipTextOn,
                          ]}
                          numberOfLines={1}
                        >
                          添加「{filter.trim()}」
                        </Text>
                      </Pressable>
                    </>
                  ) : (
                    <Text style={styles.cityEmptyText}>未找到匹配的城市</Text>
                  )}
                </View>
              ) : (
                groups.map(([letter, cities]) => (
                  <View key={letter} style={styles.cityGroup}>
                    <Text style={styles.cityLetter}>{letter}</Text>
                    <View style={styles.cityChips}>
                      {cities.map((name) => {
                        const on = name === selectedCity;
                        return (
                          <Pressable
                            key={name}
                            style={[styles.cityChip, on && styles.cityChipOn]}
                            onPress={() => setSelectedCity(on ? null : name)}
                          >
                            <Text
                              style={[
                                styles.cityChipText,
                                on && styles.cityChipTextOn,
                              ]}
                            >
                              {name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>

          {/* 插入到第几天 */}
          {totalDays > 0 ? (
            <View style={styles.citySection}>
              <Text style={styles.citySectionLabel}>插入到第几天</Text>
              <View style={styles.cityDayWrap}>
                {days.map((d) => {
                  const on = d.day_index === activePosition;
                  return (
                    <Pressable
                      key={d.id}
                      style={[styles.cityChip, on && styles.cityChipOn]}
                      onPress={() => setPosition(d.day_index)}
                    >
                      <Text
                        style={[
                          styles.cityChipText,
                          on && styles.cityChipTextOn,
                        ]}
                      >
                        第 {d.day_index} 天 · {d.city || d.date.slice(5)}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  style={[
                    styles.cityChip,
                    activePosition === totalDays + 1 && styles.cityChipOn,
                  ]}
                  onPress={() => setPosition(null)}
                >
                  <Text
                    style={[
                      styles.cityChipText,
                      activePosition === totalDays + 1 && styles.cityChipTextOn,
                    ]}
                  >
                    末尾
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <Pressable
            style={[
              styles.cityConfirm,
              (busy || !selectedCity) && styles.cityConfirmDisabled,
            ]}
            onPress={confirmAdd}
            disabled={busy || !selectedCity}
          >
            <Text style={styles.cityConfirmText}>
              {busy ? "处理中…" : "确认添加"}
            </Text>
          </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
