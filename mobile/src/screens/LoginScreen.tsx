import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatAuthError, useAuth } from "../auth/AuthContext";
import { FadeSlideIn, PressScale } from "../motion";
import { colors } from "../theme";
import type { AppStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<AppStackParamList, "Login">;

export function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { login, enterGuest } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (!username.trim() || !password) {
      setError("请输入用户名和密码");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
      navigation.popToTop();
    } catch (e) {
      setError(formatAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onGuest() {
    setBusy(true);
    setError(null);
    try {
      await enterGuest();
      navigation.popToTop();
    } catch (e) {
      setError(formatAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <FadeSlideIn delay={0}>
        <PressScale onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>← 返回</Text>
        </PressScale>
      </FadeSlideIn>
      <FadeSlideIn delay={60} style={styles.hero}>
        <Text style={styles.brand}>旅迹</Text>
        <Text style={styles.tagline}>登录后同步你的行程攻略</Text>
      </FadeSlideIn>

      <FadeSlideIn delay={120} style={styles.form}>
        <Text style={styles.label}>用户名</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
          placeholder="输入用户名"
          placeholderTextColor={colors.muted}
        />
        <Text style={styles.label}>密码</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="输入密码"
          placeholderTextColor={colors.muted}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PressScale
          style={[styles.primaryBtn, busy && styles.btnDisabled]}
          onPress={onSubmit}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>登录</Text>
          )}
        </PressScale>
        <PressScale
          style={[styles.guestBtn, busy && styles.btnDisabled]}
          onPress={onGuest}
          disabled={busy}
        >
          <Text style={styles.guestBtnText}>游客体验</Text>
        </PressScale>
        <Text style={styles.guestHint}>无需登录，先生成一份攻略试试</Text>
        <PressScale onPress={() => navigation.navigate("Register")}>
          <Text style={styles.link}>没有账号？去注册</Text>
        </PressScale>
      </FadeSlideIn>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24 },
  back: { marginTop: 8, alignSelf: "flex-start" },
  backText: { color: colors.muted, fontSize: 15 },
  hero: { marginTop: 28, marginBottom: 36 },
  brand: {
    fontSize: 40,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: 2,
  },
  tagline: { marginTop: 8, fontSize: 15, color: colors.muted },
  form: { gap: 8 },
  label: { fontSize: 13, color: colors.muted, marginTop: 8 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  error: { color: colors.danger, marginTop: 8, fontSize: 14 },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  guestBtn: {
    marginTop: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  guestBtnText: { color: colors.brandHot, fontSize: 16, fontWeight: "700" },
  guestHint: {
    marginTop: 8,
    textAlign: "center",
    color: colors.muted,
    fontSize: 12,
  },
  link: {
    marginTop: 18,
    textAlign: "center",
    color: colors.brand,
    fontSize: 15,
  },
});
