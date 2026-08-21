import React, { useState } from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { extractShareToken } from "../../utils/shareLink";
import type { AppStackParamList } from "../../navigation/types";
import { styles } from "./styles";

type Nav = NativeStackNavigationProp<AppStackParamList>;

type Props = {
  navigation: Nav;
  error?: string | null;
  initialValue?: string;
};

export function ShareLinkInput({ navigation, error, initialValue = "" }: Props) {
  const [link, setLink] = useState(initialValue);

  function openShare() {
    const token = extractShareToken(link);
    if (!token) {
      return;
    }
    navigation.replace("Share", { token });
  }

  function askAi() {
    const token = extractShareToken(link);
    const url = link.trim();
    const msg = token
      ? `请帮我分析这个分享行程：${url.includes("/share/") ? url : `http://81.71.159.218:8000/share/${token}`}`
      : url;
    if (!msg.trim()) return;
    navigation.navigate("Chat", {
      initialMessage: msg,
      chatSessionId: `share-${Date.now()}`,
    });
  }

  const token = extractShareToken(link);

  return (
    <View style={styles.pasteWrap}>
      <Text style={styles.pasteTitle}>打开分享链接</Text>
      <Text style={styles.pasteSub}>
        粘贴好友发来的行程链接，或在聊天里把链接发给 AI 助手分析
      </Text>
      <TextInput
        style={styles.pasteInput}
        value={link}
        onChangeText={setLink}
        placeholder="粘贴链接，如 http://81.71.159.218:8000/share/..."
        placeholderTextColor="#9E9E9E"
        autoCapitalize="none"
        autoCorrect={false}
        multiline
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={[styles.pasteBtn, !token && styles.pasteBtnDisabled]}
        onPress={openShare}
        disabled={!token}
      >
        <Text style={styles.pasteBtnText}>打开行程</Text>
      </Pressable>
      <Pressable
        style={[styles.pasteBtnOutline, !link.trim() && styles.pasteBtnDisabled]}
        onPress={askAi}
        disabled={!link.trim()}
      >
        <Text style={styles.pasteBtnOutlineText}>发给 AI 分析</Text>
      </Pressable>
    </View>
  );
}
