import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../auth/AuthContext";
import { colors } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";
import {
  deleteChatSession,
  genSessionId,
  listChatSessions,
  type ChatHistorySession,
} from "../../utils/chatHistoryStore";
import { styles } from "./chatHistoryStyles";

type Props = NativeStackScreenProps<AppStackParamList, "ChatHistory">;

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `今天 ${hh}:${mm}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`;
}

export function ChatHistoryScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, isGuest } = useAuth();
  const userKey = user?.id || (isGuest ? "guest" : "guest");
  const [items, setItems] = useState<ChatHistorySession[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listChatSessions(userKey));
    } finally {
      setLoading(false);
    }
  }, [userKey]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openSession = (id: string) => {
    navigation.navigate("Chat", { chatSessionId: id });
  };

  const remove = (s: ChatHistorySession) => {
    Alert.alert("删除记录", "确定删除这条对话记录吗？", [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          await deleteChatSession(userKey, s.id);
          void load();
        },
      },
    ]);
  };

  const newChat = () => {
    navigation.navigate("Chat", { chatSessionId: genSessionId() });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={styles.back}>‹ 返回</Text>
        </Pressable>
        <Text style={styles.title}>对话历史</Text>
        <Pressable style={styles.newBtn} onPress={newChat} hitSlop={6}>
          <Text style={styles.newBtnText}>新对话</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : items.length === 0 ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.empty}>还没有对话记录，去和 AI 助手聊聊吧</Text>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {items.map((s) => (
            <Pressable
              key={s.id}
              style={styles.row}
              onPress={() => openSession(s.id)}
            >
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {s.title || "新对话"}
                </Text>
                <Text style={styles.rowSub}>
                  {fmtTime(s.updatedAt)} · {s.msgs.length} 条消息
                </Text>
              </View>
              <Pressable
                onPress={() => remove(s)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="删除这条对话"
              >
                <Text style={styles.rowDelText}>删除</Text>
              </Pressable>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
