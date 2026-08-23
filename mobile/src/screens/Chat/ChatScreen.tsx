import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
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
  type PlanNavigateAction,
} from "../../utils/chatIntent";
import { submitTripGenerate } from "../../utils/submitTripGenerate";
import { ChatFollowUpChoices } from "../../components/ChatFollowUpChoices";
import { ChatDatePickerCard } from "../../components/ChatDatePickerCard";
import { pickPhotoUri, takePhotoUri } from "../../utils/pickPhoto";
import { ApiError } from "@travel-guide/shared";
import type { AppStackParamList } from "../../navigation/types";
import { SmartPlanPanel } from "./SmartPlanPanel";
import { styles } from "./styles";
import {
  genSessionId,
  getChatSession,
  saveChatSession,
  deleteChatSession,
} from "../../utils/chatHistoryStore";
import {
  TripListSheet,
  type AgentTripSummary,
} from "../../components/TripListSheet";

type Props = NativeStackScreenProps<AppStackParamList, "Chat">;

type Msg = {
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  widget?: {
    kind: "choices";
    style: "chips" | "select_list";
    options: { label: string; send: string }[];
    confirmLabel?: string;
  } | {
    kind: "date_picker";
    destination?: string;
    suggestDays: number;
  } | {
    kind: "plan_result";
    action: PlanNavigateAction;
  };
  widgetUsed?: boolean;
};

type PlanAction = PlanNavigateAction;

const WELCOME = `你好！我是「知径」AI 旅行助手 🌍

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

const INPUT_MIN_H = 48;
const INPUT_MAX_H_RATIO = 0.32;
const INPUT_MAX_H_CAP = 220;

export function ChatScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const maxInputH = Math.min(
    INPUT_MAX_H_CAP,
    Math.round(windowH * INPUT_MAX_H_RATIO),
  );
  const tripId = route.params?.tripId;
  const { user, isGuest, enterGuest, rememberGuestTrip } = useAuth();
  const { curModel, openModelPopup, modelModal } = useModelPicker();
  // 当前会话 id：路由给了就用（恢复历史），否则新建
  const sessionIdRef = useRef<string>(
    route.params?.chatSessionId || genSessionId(),
  );
  const userKey = user?.id || (isGuest ? "guest" : "guest");
  const msgsRef = useRef<Msg[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  msgsRef.current = msgs;
  const [input, setInput] = useState("");
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_H);
  const [loading, setLoading] = useState(false);
  const [smartPlanMode, setSmartPlanMode] = useState(false);
  // 当前从 AI 选项卡片回填到输入框的内容；手动编辑输入框会清空它（自定义覆盖卡片）
  const [selectedCardSend, setSelectedCardSend] = useState<string | null>(null);
  const [tripListSheet, setTripListSheet] = useState<{
    trips: AgentTripSummary[];
    message?: string | null;
  } | null>(null);
  const smartPlanBackRef = useRef<(() => boolean) | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<FlatList>(null);
  const initialSentRef = useRef(false);
  // 免费模型被限流（429）时提示切换更稳定的模型
  const [rateLimited, setRateLimited] = useState(false);
  // Agent 确认弹窗产生的结果消息（删除成功/取消等），流式更新时会被合并保留
  const agentNoticesRef = useRef<Msg[]>([]);

  const pushAgentNotice = useCallback((content: string) => {
    const notice: Msg = { role: "assistant", content };
    agentNoticesRef.current.push(notice);
    setMsgs((prev) => [...prev, notice]);
    scrollToBottom();
  }, []);

  const showTripList = useCallback(
    (trips: AgentTripSummary[], message?: string | null) => {
      setTripListSheet({ trips, message });
    },
    [],
  );

  const showDeleteConfirm = useCallback(
    (p: { trip_id: string; title: string; destination?: string; start_date?: string; end_date?: string }) => {
      const meta = [p.destination, p.start_date && p.end_date ? `${p.start_date} → ${p.end_date}` : null]
        .filter(Boolean)
        .join(" · ");
      Alert.alert(
        "确认删除行程",
        `确定删除「${p.title}」吗？${meta ? `\n${meta}` : ""}\n\n此操作不可恢复。`,
        [
          {
            text: "取消",
            style: "cancel",
            onPress: () => pushAgentNotice("🚫 已取消删除。"),
          },
          {
            text: "删除",
            style: "destructive",
            onPress: async () => {
              try {
                await api.trips.remove(p.trip_id);
                pushAgentNotice(`✅ 已删除行程「${p.title}」。`);
              } catch (e) {
                const msg = e instanceof ApiError ? e.message : "删除失败，请重试";
                pushAgentNotice(`❌ ${msg}`);
              }
            },
          },
        ],
      );
    },
    [pushAgentNotice],
  );

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
            travelers: action.travelers,
            transport: action.transport,
            route: action.route,
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

  // 生成攻略前二次确认：任何跳转都由用户确认，不自动跳转
  const generatingPlanRef = useRef(false);
  const openPlanFromAction = useCallback(
    (action: PlanAction) => {
      if (generatingPlanRef.current) return;
      const days = Math.max(
        1,
        Math.round(
          (new Date(action.end_date).getTime() -
            new Date(action.start_date).getTime()) /
            (24 * 3600 * 1000),
        ) + 1,
      );
      const title = `${action.destination} ${days}日攻略`;
      Alert.alert("确认", `是否生成并打开攻略「${title}」？`, [
        { text: "取消", style: "cancel" },
        {
          text: "生成并打开",
          onPress: () => {
            generatingPlanRef.current = true;
            void startPlanFromAction(action).finally(() => {
              generatingPlanRef.current = false;
            });
          },
        },
      ]);
    },
    [startPlanFromAction],
  );

  /** 拍照识景：相机按钮弹窗选「拍照 / 相册」，选中后进入识别页 */
  function openCameraAction() {
    if (loading) return;
    Alert.alert(
      "拍照识景",
      "拍一张景点 / 美食照片，或选择酒店、车票、地图的截图，AI 帮你识别。",
      [
        { text: "取消", style: "cancel" },
        {
          text: "拍照",
          onPress: async () => {
            const uri = await takePhotoUri();
            if (uri) navigation.navigate("PhotoRecognize", { uri });
          },
        },
        {
          text: "从相册选择",
          onPress: async () => {
            const uri = await pickPhotoUri();
            if (uri) navigation.navigate("PhotoRecognize", { uri });
          },
        },
      ],
    );
  }

  async function send(text?: string, baseMsgs?: Msg[]) {
    const content = (text || input).trim();
    if (!content || loading) return;

    setInput("");
    setInputHeight(INPUT_MIN_H);
    setSelectedCardSend(null);
    const userMsg: Msg = { role: "user", content };
    const updated = [...(baseMsgs ?? msgs), userMsg];
    setMsgs(updated);
    setLoading(true);
    setRateLimited(false);
    scrollToBottom();

    // 规划走服务端逐步追问，不在客户端直接跳转生成页

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    agentNoticesRef.current = [];

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
            if (parsed.type === "action") {
              const actionPayload = parsed.payload;
              if (actionPayload?.action === "navigate_generate") {
                // 生成后不自动跳转：把规划参数挂在最后一条消息上，
                // 由用户点击「查看攻略」并二次确认后再生成/打开攻略页
                msgsWithAI[msgsWithAI.length - 1] = {
                  ...msgsWithAI[msgsWithAI.length - 1],
                  widget: {
                    kind: "plan_result",
                    action: actionPayload as PlanNavigateAction,
                  },
                };
                setMsgs([...msgsWithAI, ...agentNoticesRef.current]);
                reader.cancel();
                break;
              }
              if (actionPayload?.action === "open_trip") {
                // 跳转攻略详情前先弹窗确认；聊天流继续，取消则留在当前对话
                Alert.alert(
                  "确认跳转",
                  `是否打开攻略「${actionPayload.title || "该攻略"}」？`,
                  [
                    { text: "取消", style: "cancel" },
                    {
                      text: "打开",
                      onPress: () =>
                        navigation.navigate("TripDetail", {
                          tripId: actionPayload.trip_id,
                        }),
                    },
                  ],
                );
                continue;
              }
              if (actionPayload?.action === "open_share" && actionPayload.token) {
                setLoading(false);
                navigation.navigate("Share", { token: actionPayload.token });
                return;
              }
              if (actionPayload?.action === "open_collection_editor") {
                setLoading(false);
                navigation.navigate("PublishCollection", {
                  prefill: {
                    title: actionPayload.title || "",
                    summary: actionPayload.summary || "",
                    emoji: actionPayload.emoji || "📁",
                    destination: actionPayload.destination || "",
                    places: (actionPayload.places as any[]) || [],
                  },
                });
                return;
              }
              if (actionPayload?.action === "show_trip_list") {
                showTripList(
                  (actionPayload.trips as AgentTripSummary[]) || [],
                  actionPayload.message,
                );
                continue;
              }
              if (actionPayload?.action === "show_choices") {
                const last = msgsWithAI[msgsWithAI.length - 1];
                msgsWithAI[msgsWithAI.length - 1] = {
                  ...last,
                  widget: {
                    kind: "choices",
                    style: actionPayload.style === "select_list" ? "select_list" : "chips",
                    options: actionPayload.options || [],
                    confirmLabel: actionPayload.confirm_label,
                  },
                };
                setMsgs([...msgsWithAI, ...agentNoticesRef.current]);
                continue;
              }
              if (actionPayload?.action === "show_date_picker") {
                const last = msgsWithAI[msgsWithAI.length - 1];
                msgsWithAI[msgsWithAI.length - 1] = {
                  ...last,
                  widget: {
                    kind: "date_picker",
                    destination: actionPayload.destination,
                    suggestDays: actionPayload.suggest_days || 3,
                  },
                };
                setMsgs([...msgsWithAI, ...agentNoticesRef.current]);
                continue;
              }
            } else if (parsed.type === "tool_result" && parsed.tool === "list_trips") {
              try {
                const data = JSON.parse(parsed.result);
                if (Array.isArray(data?.trips)) {
                  showTripList(data.trips, data.message);
                }
              } catch {
                /* ignore */
              }
              continue;
            } else if (parsed.type === "confirmation_required") {
              const p = parsed.payload;
              if (p?.tool === "delete_trip" && p.trip_id) {
                showDeleteConfirm(p);
              }
              continue;
            } else if (parsed.type === "reasoning") {
              aiReasoning += parsed.content;
            } else if (parsed.type === "content") {
              aiContent += parsed.content;
            } else if (parsed.type === "error") {
              aiContent += parsed.content;
              if (parsed.rate_limited) setRateLimited(true);
            }
            msgsWithAI[msgsWithAI.length - 1] = {
              role: "assistant",
              content: aiContent,
              reasoning: aiReasoning || undefined,
            };
            setMsgs([...msgsWithAI, ...agentNoticesRef.current]);
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
    agentNoticesRef.current = [];
    setTripListSheet(null);
  }, [route.params?.chatSessionId, route.params?.tripId]);

  // 历史记录：挂载时按会话 id 恢复消息
  useEffect(() => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    let alive = true;
    void (async () => {
      const sess = await getChatSession(userKey, sid);
      if (alive && sess && sess.msgs.length > 0) {
        setMsgs(sess.msgs as Msg[]);
        agentNoticesRef.current = [];
        scrollToBottom();
      }
    })();
    return () => {
      alive = false;
    };
    // 仅按会话 id / 用户加载一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIdRef.current, userKey]);

  // 历史记录：消息变化时防抖保存
  useEffect(() => {
    const sid = sessionIdRef.current;
    if (!sid || msgs.length === 0) return;
    const slim = msgs.map((m) => ({
      role: m.role,
      content: m.content,
      reasoning: m.reasoning,
      // 只持久化「查看攻略」按钮，选择题/日期卡片不复活
      ...(m.widget?.kind === "plan_result" ? { widget: m.widget } : {}),
    }));
    const title =
      msgs.find((m) => m.role === "user")?.content || "新对话";
    const t = setTimeout(() => {
      void saveChatSession(userKey, {
        id: sid,
        title: title.slice(0, 30),
        msgs: slim,
        updatedAt: Date.now(),
      });
    }, 400);
    return () => clearTimeout(t);
  }, [msgs, userKey]);

  // 历史记录：离开时兜底保存一次
  useEffect(() => {
    const sid = sessionIdRef.current;
    return () => {
      const m = msgsRef.current;
      if (!sid || m.length === 0) return;
      const title = m.find((x) => x.role === "user")?.content || "新对话";
      void saveChatSession(userKey, {
        id: sid,
        title: title.slice(0, 30),
        msgs: m.map((x) => ({
          role: x.role,
          content: x.content,
          reasoning: x.reasoning,
          ...(x.widget?.kind === "plan_result" ? { widget: x.widget } : {}),
        })),
        updatedAt: Date.now(),
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userKey]);

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
    agentNoticesRef.current = [];
    setTripListSheet(null);
    const sid = sessionIdRef.current;
    if (sid) void deleteChatSession(userKey, sid);
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
          {!smartPlanMode ? (
            <Pressable
              style={styles.historyBtn}
              onPress={() => navigation.navigate("ChatHistory")}
              hitSlop={6}
            >
              <Text style={styles.historyBtnText}>历史</Text>
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
          renderItem={({ item, index }) => {
            const isUser = item.role === "user";
            const widgetDisabled = loading;
            // 点击 AI 选项卡片：把内容回填进输入框，不直接发送。
            // 卡片始终可点（不标记 widgetUsed），清空输入框后可重新点选回填。
            const pickCard = (sendText: string) => {
              if (widgetDisabled) return;
              setInput(sendText);
              setSelectedCardSend(sendText);
            };
            // date picker 仍走原逻辑（选择日期后直接作为回复发送）
            const markWidgetAndSend = (sendText: string) => {
              const marked = msgs.map((m, i) =>
                i === index ? { ...m, widgetUsed: true } : m,
              );
              setMsgs(marked);
              void send(sendText, marked);
            };
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
                  {!isUser && item.widget ? (
                    item.widget.kind === "choices" ? (
                      <ChatFollowUpChoices
                        style={item.widget.style}
                        options={item.widget.options}
                        confirmLabel={item.widget.confirmLabel}
                        disabled={widgetDisabled}
                        selectedSend={selectedCardSend}
                        onPick={pickCard}
                      />
                    ) : item.widget.kind === "date_picker" ? (
                      <ChatDatePickerCard
                        destination={item.widget.destination}
                        suggestDays={item.widget.suggestDays}
                        disabled={widgetDisabled}
                        onConfirm={markWidgetAndSend}
                        onSkip={markWidgetAndSend}
                      />
                    ) : (
                      <Pressable
                        style={[
                          styles.planResultBtn,
                          widgetDisabled && styles.planResultBtnDisabled,
                        ]}
                        disabled={widgetDisabled}
                        onPress={() => openPlanFromAction(item.widget.action)}
                      >
                        <Text style={styles.planResultText}>
                          📋 查看攻略 →
                        </Text>
                      </Pressable>
                    )
                  ) : null}
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

      {rateLimited && !smartPlanMode ? (
        <View style={styles.rateLimitBanner}>
          <Text style={styles.rateLimitText}>
            ⚠️ 免费模型暂时繁忙（被限流），建议切换到更稳定的免费模型
          </Text>
          <Pressable
            style={styles.rateLimitBtn}
            onPress={() => navigation.navigate("ModelManage")}
          >
            <Text style={styles.rateLimitBtnText}>切换模型</Text>
          </Pressable>
        </View>
      ) : null}

      {!smartPlanMode ? (
      <View
        style={[
          styles.inputBar,
          { paddingBottom: Math.max(insets.bottom, 10) },
        ]}
      >
        <Pressable style={styles.modelBtn} onPress={openModelPopup}>
          <Text style={styles.modelBtnText}>{curModel.label} ▲</Text>
        </Pressable>
        <View style={styles.inputRow}>
          <Pressable
            style={[styles.cameraBtn, loading && styles.sendDisabled]}
            onPress={openCameraAction}
            disabled={loading}
            hitSlop={6}
          >
            <Text style={styles.cameraBtnText}>📷</Text>
          </Pressable>
          <TextInput
            style={[
              styles.input,
              {
                height: Math.max(
                  INPUT_MIN_H,
                  Math.min(maxInputH, inputHeight),
                ),
              },
            ]}
            value={input}
            onChangeText={(t) => {
              setInput(t);
              // 手动编辑输入框即解除与卡片的关联（自定义覆盖一切）。
              // 注意：清空后 selectedCardSend 也置空，用户可重新点卡片回填（需求 4）。
              if (selectedCardSend !== null) setSelectedCardSend(null);
            }}
            placeholder="输入旅行问题…"
            placeholderTextColor={colors.muted}
            multiline
            editable={!loading}
            returnKeyType="default"
            blurOnSubmit={false}
            textAlignVertical="top"
            scrollEnabled={inputHeight >= maxInputH}
            onContentSizeChange={(e) => {
              setInputHeight(e.nativeEvent.contentSize.height);
            }}
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
      </View>
      ) : null}

      {modelModal}

      <TripListSheet
        visible={tripListSheet != null}
        trips={tripListSheet?.trips ?? []}
        message={tripListSheet?.message}
        onClose={() => setTripListSheet(null)}
        onSelect={(tripId) => navigation.navigate("TripDetail", { tripId })}
      />
    </KeyboardAvoidingView>
  );
}
