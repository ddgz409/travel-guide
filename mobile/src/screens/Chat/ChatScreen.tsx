import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { colors } from "../../theme";
import { useModelPicker } from "../../components/ModelPicker";
import { getChatSearchSubtitle } from "../../utils/chatSearch";
import {
  detectPlanIntent,
  type PlanNavigateAction,
} from "../../utils/chatIntent";
import { submitTripGenerate } from "../../utils/submitTripGenerate";
import { ApiError } from "@travel-guide/shared";
import type { AppStackParamList } from "../../navigation/types";
import { SmartPlanPanel } from "./SmartPlanPanel";
import { styles } from "./styles";

type Props = NativeStackScreenProps<AppStackParamList, "Chat">;

type Msg = {
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
};

type PlanAction = PlanNavigateAction;

const WELCOME = `你好！我是「旅迹」AI 旅行助手 🌍

我可以帮你推荐目的地、景点美食、规划行程、回答签证天气等旅行问题。

需要规划行程？点右上角「智能规划」，输入关键词即可。`;

const QUICK = [
  { label: "🍜 杭州美食", text: "杭州有什么必吃的美食和餐厅？" },
  {
    label: "📋 北京行程",
    text: "帮我规划明天去北京的旅游行程，并建议穿衣搭配",
  },
  { label: "✈️ 三亚亲子", text: "带3岁孩子去三亚，推荐适合亲子的酒店和景点" },
  { label: "🌸 日本樱花", text: "明年春天想去日本看樱花，什么时候去最好？" },
];

export function ChatScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const tripId = route.params?.tripId;
  const { user, isGuest, enterGuest, rememberGuestTrip } = useAuth();
  const { curModel, openModelPopup, modelModal } = useModelPicker();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [smartPlanMode, setSmartPlanMode] = useState(false);
  const smartPlanBackRef = useRef<(() => boolean) | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<FlatList>(null);
  const initialSentRef = useRef(false);

  function scrollToBottom() {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }

  const startPlanFromAction = useCallback(
    async (action: PlanAction) => {
      try {
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

        const { tripId: newTripId } = await submitTripGenerate(
          api,
          { user, isGuest, enterGuest, rememberGuestTrip },
          {
            destination: action.destination,
            startDate: action.start_date,
            endDate: action.end_date,
            interests: action.interests,
            chatHint: action.chat_hint,
            llm,
          },
        );
        navigation.navigate("TripDetail", { tripId: newTripId });
      } catch (e) {
        const msg =
          e instanceof ApiError ? e.message : "规划失败，请重试";
        setMsgs((prev) => [
          ...prev,
          { role: "assistant", content: `❌ ${msg}` },
        ]);
      }
    },
    [
      curModel,
      enterGuest,
      isGuest,
      navigation,
      rememberGuestTrip,
      user,
    ],
  );

  function handlePlanIntent(content: string, updated: Msg[]): boolean {
    if (tripId) return false;
    const action = detectPlanIntent(content);
    if (!action) return false;
    setMsgs([
      ...updated,
      {
        role: "assistant",
        content: `好的，我来帮你规划 **${action.destination}** 的行程，正在生成中…\n\n（${action.start_date} → ${action.end_date}）`,
      },
    ]);
    setLoading(false);
    void startPlanFromAction(action);
    return true;
  }

  async function send(text?: string) {
    const content = (text || input).trim();
    if (!content || loading) return;

    setInput("");
    const userMsg: Msg = { role: "user", content };
    const updated = [...msgs, userMsg];
    setMsgs(updated);
    setLoading(true);
    scrollToBottom();

    if (handlePlanIntent(content, updated)) return;

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const llmOverride: {
        provider: string;
        model: string;
        api_key?: string;
        base_url?: string;
        web_search?: "auto";
      } = {
        provider: curModel.provider,
        model: curModel.model,
        web_search: "auto",
      };
      if (curModel.apiKey) llmOverride.api_key = curModel.apiKey;
      if (curModel.baseUrl) llmOverride.base_url = curModel.baseUrl;
      const res = await api.chat.stream(updated, llmOverride, tripId);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("不支持流式读取");

      const decoder = new TextDecoder();
      let aiContent = "";
      let aiReasoning = "";
      const msgsWithAI: Msg[] = [
        ...updated,
        { role: "assistant", content: "", reasoning: "" },
      ];

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") {
            reader.cancel();
            break;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "action" && parsed.payload?.action === "navigate_generate") {
              if (tripId) break;
              setLoading(false);
              void startPlanFromAction(parsed.payload as PlanAction);
              return;
            } else if (parsed.type === "reasoning") {
              aiReasoning += parsed.content;
            } else if (parsed.type === "content") {
              aiContent += parsed.content;
            } else if (parsed.type === "error") {
              aiContent += parsed.content;
            }
            msgsWithAI[msgsWithAI.length - 1] = {
              role: "assistant",
              content: aiContent,
              reasoning: aiReasoning || undefined,
            };
            setMsgs([...msgsWithAI]);
          } catch {
            /* skip non-JSON */
          }
        }
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : "请求失败";
      setMsgs((prev) => [...prev, { role: "assistant", content: `❌ ${errMsg}` }]);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  useEffect(() => {
    setMsgs([]);
    setInput("");
    setLoading(false);
    initialSentRef.current = false;
  }, [route.params?.chatSessionId, route.params?.tripId]);

  useEffect(() => {
    const prefill = route.params?.prefillMessage?.trim();
    if (prefill) {
      setInput(prefill);
      return;
    }
    const initial = route.params?.initialMessage?.trim();
    if (!initial || initialSentRef.current) return;
    initialSentRef.current = true;
    void send(initial);
  }, [
    route.params?.prefillMessage,
    route.params?.initialMessage,
    route.params?.chatSessionId,
  ]);

  function stop() {
    abortRef.current?.abort();
    setLoading(false);
    abortRef.current = null;
  }

  const handleSmartPlanBack = useCallback(() => {
    if (smartPlanBackRef.current?.()) return;
    setSmartPlanMode(false);
  }, []);

  useEffect(() => {
    if (!smartPlanMode) return;
    const unsub = navigation.addListener("beforeRemove", (e) => {
      if (smartPlanBackRef.current?.()) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      setSmartPlanMode(false);
    });
    return unsub;
  }, [navigation, smartPlanMode]);

  function clear() {
    setMsgs([]);
  }

  const showWelcome = msgs.length === 0;
  const headerSub = getChatSearchSubtitle(curModel.provider, curModel.label);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) }]}>
        <View style={styles.headerLeft}>
          {smartPlanMode ? (
            <Pressable onPress={handleSmartPlanBack} hitSlop={8}>
              <Text style={styles.backLink}>‹ 返回</Text>
            </Pressable>
          ) : null}
          <Text style={styles.headerTitle}>
            {smartPlanMode ? "智能规划" : "AI 旅行助手"}
          </Text>
          {!smartPlanMode ? (
            <Text style={styles.headerSub}>
              {tripId ? `${headerSub} · 已关联行程` : headerSub}
            </Text>
          ) : (
            <Text style={styles.headerSub}>输入关键词，一键生成行程</Text>
          )}
        </View>
        <View style={styles.headerActions}>
          {!smartPlanMode ? (
            <Pressable
              style={styles.smartPlanBtn}
              onPress={() => setSmartPlanMode(true)}
            >
              <Text style={styles.smartPlanBtnText}>智能规划</Text>
            </Pressable>
          ) : null}
          {!smartPlanMode && msgs.length > 0 ? (
            <Pressable style={styles.clearBtn} onPress={clear}>
              <Text style={styles.clearText}>清空</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {smartPlanMode ? (
        <SmartPlanPanel
          navigation={navigation}
          onClose={() => setSmartPlanMode(false)}
          backHandlerRef={smartPlanBackRef}
        />
      ) : showWelcome ? (
        <View style={styles.welcomeWrap}>
          <Text style={styles.welcomeEmoji}>🌍</Text>
          <Text style={styles.welcomeText}>{WELCOME}</Text>
          <View style={styles.quickRow}>
            <Pressable
              style={styles.smartPlanEntry}
              onPress={() => setSmartPlanMode(true)}
            >
              <Text style={styles.smartPlanEntryText}>✦ 体验智能规划</Text>
            </Pressable>
            {QUICK.map((q) => (
              <Pressable
                key={q.label}
                style={styles.quickChip}
                onPress={() => send(q.text)}
              >
                <Text style={styles.quickChipText}>{q.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={msgs}
          keyExtractor={(_, i) => String(i)}
          style={styles.list}
          contentContainerStyle={{ paddingBottom: 16 }}
          onContentSizeChange={scrollToBottom}
          renderItem={({ item }) => {
            const isUser = item.role === "user";
            return (
              <View style={[styles.msgRow, isUser && styles.msgUserRow]}>
                <View
                  style={[
                    styles.msgBubble,
                    isUser ? styles.msgUser : styles.msgAI,
                  ]}
                >
                  {item.reasoning ? (
                    <View style={styles.reasoningBox}>
                      <Text style={styles.reasoningLabel}>
                        {loading && item === msgs[msgs.length - 1]
                          ? "思考中…"
                          : "思考过程"}
                      </Text>
                      <Text style={styles.reasoningText}>{item.reasoning}</Text>
                    </View>
                  ) : null}
                  <Text style={isUser ? styles.msgUserText : styles.msgAIText}>
                    {item.content}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}

      {!smartPlanMode && loading && !msgs[msgs.length - 1]?.reasoning && (
        <View style={styles.loadingDot}>
          <ActivityIndicator size="small" color={colors.brand} />
        </View>
      )}

      {!smartPlanMode ? (
      <View style={styles.inputBar}>
        <Pressable style={styles.modelBtn} onPress={openModelPopup}>
          <Text style={styles.modelBtnText}>{curModel.label} ▲</Text>
        </Pressable>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="输入旅行问题…"
          placeholderTextColor={colors.muted}
          multiline
          editable={!loading}
          returnKeyType="send"
          blurOnSubmit
          onSubmitEditing={() => send()}
        />
        {loading ? (
          <Pressable style={styles.stopBtn} onPress={stop}>
            <Text style={styles.stopText}>停</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.sendBtn, !input.trim() && styles.sendDisabled]}
            onPress={() => send()}
            disabled={!input.trim()}
          >
            <Text style={styles.sendText}>发</Text>
          </Pressable>
        )}
      </View>
      ) : null}

      {modelModal}
    </KeyboardAvoidingView>
  );
}
