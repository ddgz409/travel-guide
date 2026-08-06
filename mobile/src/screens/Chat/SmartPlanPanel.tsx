import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ApiError } from "@travel-guide/shared";
import { api } from "../../api/client";
import { useModelPicker } from "../../components/ModelPicker";
import {
  detectPlanIntent,
  parseSmartPlanKeywords,
  planActionToGenerateParams,
  searchPlanSuggestions,
  type SmartPlanDraft,
} from "../../utils/chatIntent";
import type { AppStackParamList } from "../../navigation/types";
import { colors } from "../../theme";
import { styles } from "./smartPlanStyles";

type Nav = NativeStackNavigationProp<AppStackParamList, "Chat">;

type Props = {
  navigation: Nav;
  onClose: () => void;
  onStepChange?: (step: "search" | "confirm") => void;
  backHandlerRef?: React.MutableRefObject<(() => boolean) | null>;
};

function optimizeLlmPayload(curModel: {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}) {
  const llm: {
    provider: string;
    model: string;
    api_key?: string;
    base_url?: string;
  } = {
    provider: curModel.provider,
    model: curModel.model,
  };
  if (curModel.apiKey?.trim()) llm.api_key = curModel.apiKey.trim();
  if (curModel.baseUrl?.trim()) llm.base_url = curModel.baseUrl.trim();
  return llm;
}

export function SmartPlanPanel({
  navigation,
  onClose,
  onStepChange,
  backHandlerRef,
}: Props) {
  const { curModel, openModelPopup, modelModal } = useModelPicker();
  const [keywords, setKeywords] = useState("");
  const [draft, setDraft] = useState<SmartPlanDraft | null>(null);
  const [editableQuery, setEditableQuery] = useState("");
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeError, setOptimizeError] = useState<string | null>(null);
  const optimizeSeqRef = useRef(0);

  const suggestions = useMemo(
    () => searchPlanSuggestions(keywords),
    [keywords],
  );

  const fetchOptimizedQuery = useCallback(
    async (next: SmartPlanDraft) => {
      const seq = ++optimizeSeqRef.current;
      setOptimizing(true);
      setOptimizeError(null);
      try {
        const res = await api.chat.optimizePlanQuery(
          {
            keywords: next.keywords,
            destination: next.destination,
            days: next.days,
            start_date: next.start_date,
            end_date: next.end_date,
          },
          optimizeLlmPayload(curModel),
        );
        if (seq !== optimizeSeqRef.current) return;
        const query = res.query.trim();
        setEditableQuery(query);
        setDraft((prev) =>
          prev && prev.keywords === next.keywords
            ? { ...prev, expandedQuery: query, action: { ...prev.action, chat_hint: query } }
            : prev,
        );
      } catch (e) {
        if (seq !== optimizeSeqRef.current) return;
        const msg =
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "AI 优化失败，请手动编辑或重试";
        setOptimizeError(msg);
        setEditableQuery(next.keywords);
      } finally {
        if (seq === optimizeSeqRef.current) setOptimizing(false);
      }
    },
    [curModel],
  );

  useEffect(() => {
    onStepChange?.(draft ? "confirm" : "search");
  }, [draft, onStepChange]);

  useEffect(() => {
    if (!backHandlerRef) return;
    backHandlerRef.current = () => {
      if (draft) {
        optimizeSeqRef.current += 1;
        setOptimizing(false);
        setDraft(null);
        setEditableQuery("");
        setOptimizeError(null);
        return true;
      }
      return false;
    };
    return () => {
      backHandlerRef.current = null;
    };
  }, [backHandlerRef, draft]);

  function openDraft(next: SmartPlanDraft) {
    Keyboard.dismiss();
    setDraft(next);
    setEditableQuery("");
    setOptimizeError(null);
    setKeywords(next.keywords);
    void fetchOptimizedQuery(next);
  }

  function applyAiExpanded() {
    if (!draft || optimizing) return;
    void fetchOptimizedQuery(draft);
  }

  function editKeywords() {
    optimizeSeqRef.current += 1;
    setOptimizing(false);
    setDraft(null);
    setEditableQuery("");
    setOptimizeError(null);
  }

  function confirmPlan() {
    if (!draft || optimizing) return;
    const query = (editableQuery.trim() || draft.expandedQuery || draft.keywords).trim();
    if (!query) return;
    const reparsed = detectPlanIntent(query);
    const base = parseSmartPlanKeywords(draft.keywords) ?? draft;
    const action = reparsed ?? {
      ...base.action,
      chat_hint: query,
    };
    navigation.navigate("Generate", {
      ...planActionToGenerateParams({ ...action, chat_hint: query }),
      fromSmartPlan: true,
    });
  }

  function selectCity(city: string) {
    Keyboard.dismiss();
    const next = parseSmartPlanKeywords(city);
    if (!next) return;
    navigation.navigate("Generate", {
      ...planActionToGenerateParams(next.action),
      fromSmartPlan: true,
    });
  }

  if (draft) {
    const planQuery = editableQuery.trim() || draft.expandedQuery || draft.keywords;
    return (
      <View style={styles.panel}>
        {modelModal}
        <Text style={styles.heroTitle}>
          试试说你「想去哪、几天」{"\n"}我来帮你智能规划
        </Text>
        <View style={styles.confirmCard}>
          <View style={styles.confirmHead}>
            <Pressable onPress={editKeywords} hitSlop={8} style={styles.confirmLabelWrap}>
              <Text style={styles.confirmLabel}>你的输入：{draft.keywords}</Text>
            </Pressable>
            <Pressable onPress={applyAiExpanded} hitSlop={8} disabled={optimizing}>
              <Text style={[styles.replaceBtn, optimizing && styles.replaceBtnDisabled]}>
                {optimizing ? "优化中…" : "替换"}
              </Text>
            </Pressable>
          </View>
          <View style={styles.expandedHead}>
            <Text style={styles.expandedLabel}>规划描述（可修改）</Text>
            <Pressable onPress={openModelPopup} hitSlop={8}>
              <Text style={styles.modelLink}>{curModel.label} ▾</Text>
            </Pressable>
          </View>
          {optimizing ? (
            <View style={styles.optimizeLoading}>
              <ActivityIndicator size="small" color={colors.brand} />
              <Text style={styles.optimizeLoadingText}>AI 正在优化你的描述…</Text>
            </View>
          ) : null}
          <TextInput
            key={draft.keywords}
            style={styles.expandedQueryInput}
            value={editableQuery}
            onChangeText={setEditableQuery}
            multiline
            editable={!optimizing}
            placeholder={optimizing ? "AI 优化中…" : "描述你想怎么玩…"}
            placeholderTextColor="#9ca3af"
          />
          {optimizeError ? (
            <Text style={styles.optimizeError}>{optimizeError}</Text>
          ) : null}
          <Text style={styles.confirmMeta}>
            {draft.start_date} → {draft.end_date} · {draft.days} 天
          </Text>
          <Pressable
            style={[styles.confirmBtn, (!planQuery || optimizing) && styles.confirmBtnDisabled]}
            onPress={confirmPlan}
            disabled={!planQuery || optimizing}
          >
            <Text style={styles.confirmBtnText}>开始智能规划 →</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      {modelModal}
      <Text style={styles.heroTitle}>
        试试说你「想去哪、几天」{"\n"}我来帮你智能规划
      </Text>
      <Text style={styles.heroHint}>输入目的地和时间，开始检索</Text>

      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>✦</Text>
        <TextInput
          style={styles.searchInput}
          value={keywords}
          onChangeText={setKeywords}
          placeholder="你想去哪里？"
          placeholderTextColor="#9ca3af"
          autoFocus
          returnKeyType="search"
        />
        {keywords.length > 0 ? (
          <Pressable
            style={styles.clearChip}
            onPress={() => {
              setKeywords("");
              setDraft(null);
              setEditableQuery("");
              setOptimizeError(null);
            }}
          >
            <Text style={styles.clearChipText}>×</Text>
          </Pressable>
        ) : null}
      </View>

      {keywords.trim().length > 0 ? (
        <ScrollView
          style={styles.suggestList}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {suggestions.smartPlan ? (
            <Pressable
              style={styles.smartRow}
              onPress={() => openDraft(suggestions.smartPlan!)}
            >
              <View style={styles.smartRowMain}>
                <Text style={styles.smartRowTitle}>{keywords.trim()}</Text>
                <Text style={styles.smartRowSub}>点击体验智能规划</Text>
              </View>
              <View style={styles.smartRowGo}>
                <Text style={styles.smartRowGoText}>→</Text>
              </View>
            </Pressable>
          ) : null}

          {suggestions.cities.map((city) => (
            <Pressable
              key={city}
              style={styles.cityRow}
              onPress={() => selectCity(city)}
            >
              <View style={styles.cityRowMain}>
                <Text style={styles.cityRowTitle}>{city}</Text>
                <Text style={styles.cityRowSub}>点击开始智能规划</Text>
              </View>
              <View style={styles.cityRowGo}>
                <Text style={styles.cityRowGoText}>→</Text>
              </View>
            </Pressable>
          ))}

          {!suggestions.smartPlan && suggestions.cities.length === 0 ? (
            <Text style={styles.emptyHint}>未找到匹配结果，请换个关键词</Text>
          ) : null}
        </ScrollView>
      ) : null}
    </View>
  );
}
