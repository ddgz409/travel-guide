import React, { useMemo, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { citiesGrouped } from "../../data/cities";
import { colors } from "../../theme";
import { TRAVEL_MODES, type TravelMode } from "../../utils/travelPortals";
import { styles } from "./styles";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function TravelSearchScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [mode, setMode] = useState<TravelMode>("flight");
  const [modeOpen, setModeOpen] = useState(false);
  const [focusField, setFocusField] = useState<"from" | "to" | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const fromCities = useMemo(() => citiesGrouped(from), [from]);
  const toCities = useMemo(() => citiesGrouped(to), [to]);
  const showPanel = focusField === "from" ? from.trim().length > 0 : focusField === "to" ? to.trim().length > 0 : false;
  const panelGroups = focusField === "from" ? fromCities : toCities;
  const currentMode = TRAVEL_MODES.find((m) => m.key === mode);

  function onSearch() {
    if (!from.trim() || !to.trim()) {
      Alert.alert("提示", "请填写起点和终点");
      return;
    }
    (navigation as any).navigate("PortalSelect", { from: from.trim(), to: to.trim(), mode });
  }

  function scrollToLetter(letter: string) {
    const idx = panelGroups.findIndex(([l]) => l === letter);
    if (idx >= 0) {
      scrollRef.current?.scrollTo({ y: idx * 52, animated: true });
    }
  }

  return (
    <View style={[styles.root, { paddingTop: Math.max(insets.top, 16) }]}>
      <View style={[styles.header, { paddingTop: 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.headerSide}>
          <Text style={styles.backText}>{"<"} 返回</Text>
        </Pressable>
        <Text style={styles.headerTitle}>出行搜索</Text>
        <View style={styles.headerSide} />
      </View>

      <View style={styles.body}>
        <Text style={styles.centerTitle}>✈️</Text>
        <Text style={styles.centerSub}>输入起点和终点，选择出行方式</Text>

        <View style={styles.inputRow}>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="起点"
              placeholderTextColor={colors.muted}
              value={from}
              onChangeText={setFrom}
              onFocus={() => setFocusField("from")}
              onBlur={() => setTimeout(() => setFocusField(null), 200)}
            />
          </View>

          <View>
            <Pressable style={styles.modeBtn} onPress={() => setModeOpen(!modeOpen)}>
              <Text style={styles.modeBtnText}>{currentMode?.emoji}</Text>
            </Pressable>
            {modeOpen && (
              <View style={styles.modePopup}>
                {TRAVEL_MODES.map((m) => {
                  const active = m.key === mode;
                  return (
                    <Pressable
                      key={m.key}
                      style={[styles.modeItem, active && styles.modeItemOn]}
                      onPress={() => { setMode(m.key); setModeOpen(false); }}
                    >
                      <Text style={styles.modeItemEmoji}>{m.emoji}</Text>
                      <Text style={styles.modeItemText}>{m.label}</Text>
                      {active && <View style={styles.modeItemDot} />}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="终点"
              placeholderTextColor={colors.muted}
              value={to}
              onChangeText={setTo}
              onFocus={() => setFocusField("to")}
              onBlur={() => setTimeout(() => setFocusField(null), 200)}
            />
          </View>
        </View>

        {showPanel && panelGroups.length > 0 && (
          <View style={styles.suggestionPanel}>
            <ScrollView ref={scrollRef} style={styles.suggestionScroll} keyboardShouldPersistTaps="always">
              {panelGroups.map(([letter, cities]) => (
                <View key={letter} style={styles.suggestionGroup}>
                  <Text style={styles.suggestionLetter}>{letter}</Text>
                  <View style={styles.suggestionChips}>
                    {cities.map((name) => {
                      const active = (focusField === "from" ? from : to) === name;
                      return (
                        <Pressable
                          key={name}
                          style={[styles.suggestionChip, active && styles.suggestionChipOn]}
                          onPress={() => {
                            if (focusField === "from") setFrom(name);
                            else setTo(name);
                            setFocusField(null);
                            Keyboard.dismiss();
                          }}
                        >
                          <Text style={[styles.suggestionChipText, active && styles.suggestionChipTextOn]}>
                            {name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>
            <View style={styles.alphabetBar}>
              {ALPHABET.map((l) => {
                const has = panelGroups.some(([letter]) => letter === l);
                return (
                  <Pressable key={l} onPress={() => scrollToLetter(l)}>
                    <Text style={[styles.alphabetLetter, has && styles.alphabetLetterOn]}>
                      {has ? l : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <Pressable style={styles.searchBtn} onPress={onSearch}>
          <Text style={styles.searchBtnText}>🔍 搜索</Text>
        </Pressable>

        <Text style={styles.hint}>💡 支持携程、去哪儿、飞猪、12306</Text>
      </View>
    </View>
  );
}
