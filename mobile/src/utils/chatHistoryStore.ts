/** AI 对话历史（本地持久化，按用户隔离） */
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ChatHistoryMsg = {
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
};

export type ChatHistorySession = {
  id: string;
  title: string;
  msgs: ChatHistoryMsg[];
  updatedAt: number;
};

const PREFIX = "chat_history_v1_";
const MAX_SESSIONS = 30;

function key(userKey: string): string {
  return `${PREFIX}${userKey}`;
}

async function readAll(userKey: string): Promise<ChatHistorySession[]> {
  try {
    const raw = await AsyncStorage.getItem(key(userKey));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as ChatHistorySession[]) : [];
  } catch {
    return [];
  }
}

export async function listChatSessions(
  userKey: string,
): Promise<ChatHistorySession[]> {
  const all = await readAll(userKey);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getChatSession(
  userKey: string,
  id: string,
): Promise<ChatHistorySession | null> {
  const all = await readAll(userKey);
  return all.find((s) => s.id === id) ?? null;
}

export async function saveChatSession(
  userKey: string,
  session: ChatHistorySession,
): Promise<void> {
  const all = await readAll(userKey);
  const idx = all.findIndex((s) => s.id === session.id);
  if (idx >= 0) all[idx] = session;
  else all.push(session);
  all.sort((a, b) => b.updatedAt - a.updatedAt);
  const trimmed = all.slice(0, MAX_SESSIONS);
  await AsyncStorage.setItem(key(userKey), JSON.stringify(trimmed));
}

export async function deleteChatSession(
  userKey: string,
  id: string,
): Promise<void> {
  const all = await readAll(userKey);
  await AsyncStorage.setItem(
    key(userKey),
    JSON.stringify(all.filter((s) => s.id !== id)),
  );
}

export function genSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
