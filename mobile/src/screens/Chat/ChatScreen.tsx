import React, { useEffect, useRef, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../api/client";
import { colors } from "../../theme";
import { useModelPicker } from "../../components/ModelPicker";
import { styles } from "./styles";

type Msg = {
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
};

const WELCOME = `你好！我是「旅迹」AI 旅行助手 🌍

我可以帮你推荐目的地、景点美食、规划行程、回答签证天气等旅行问题。直接告诉我想去哪吧！`;

const QUICK = [
  { label: "🍜 杭州美食", text: "杭州有什么必吃的美食和餐厅？" },
  { label: "🏔️ 西藏攻略", text: "去西藏玩要准备什么？有没有5天行程推荐？" },
  { label: "✈️ 三亚亲子", text: "带3岁孩子去三亚，推荐适合亲子的酒店和景点" },
  { label: "🌸 日本樱花", text: "明年春天想去日本看樱花，什么时候去最好？" },
];

export function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { curModel, openModelPopup, modelModal } = useModelPicker();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<FlatList>(null);

  function scrollToBottom() {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
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

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const llmOverride: { provider: string; model: string; api_key?: string; base_url?: string } = {
        provider: curModel.provider,
        model: curModel.model,
      };
      if (curModel.apiKey) llmOverride.api_key = curModel.apiKey;
      if (curModel.baseUrl) llmOverride.base_url = curModel.baseUrl;
      const res = await api.chat.stream(updated, llmOverride);

      // 真流式读取：用 reader 逐块处理，实现逐字显示
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
        // 保留最后不完整的一行
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
            if (parsed.type === "reasoning") {
              aiReasoning += parsed.content;
            } else if (parsed.type === "content") {
              aiContent += parsed.content;
            } else if (parsed.type === "error") {
              aiContent += parsed.content;
            }
            // 实时更新
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

  function stop() {
    abortRef.current?.abort();
    setLoading(false);
    abortRef.current = null;
  }

  function clear() {
    setMsgs([]);
  }

  const showWelcome = msgs.length === 0;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      {/* 顶部 */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>AI 旅行助手</Text>
          <Text style={styles.headerSub}>智谱 GLM-4 · 联网搜索</Text>
        </View>
        {msgs.length > 0 && (
          <Pressable style={styles.clearBtn} onPress={clear}>
            <Text style={styles.clearText}>清空</Text>
          </Pressable>
        )}
      </View>

      {/* 消息区域 */}
      {showWelcome ? (
        <View style={styles.welcomeWrap}>
          <Text style={styles.welcomeEmoji}>🌍</Text>
          <Text style={styles.welcomeText}>{WELCOME}</Text>
          <View style={styles.quickRow}>
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
                  {/* 思考过程 */}
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
                  {/* 正文 */}
                  <Text style={isUser ? styles.msgUserText : styles.msgAIText}>
                    {item.content}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}

      {loading && !msgs[msgs.length - 1]?.reasoning && (
        <View style={styles.loadingDot}>
          <ActivityIndicator size="small" color={colors.brand} />
        </View>
      )}

      {/* 底部输入区 */}
      <View style={styles.inputBar}>
        {/* 模型按钮 */}
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

      {/* 模型选择弹窗（两级，与专属定制共用） */}
      {modelModal}
    </KeyboardAvoidingView>
  );
}
