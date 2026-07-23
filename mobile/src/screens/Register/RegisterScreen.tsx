import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { formatAuthError, useAuth } from "../../auth/AuthContext";
import { colors } from "../../theme";
import type { AppStackParamList } from "../../navigation/types";
import { styles } from "./styles";

type Props = NativeStackScreenProps<AppStackParamList, "Register">;

export function RegisterScreen({ navigation }: Props) {
  const { register } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (!username.trim() || password.length < 6) {
      setError("用户名必填，密码至少 6 位");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await register(username.trim(), password);
      navigation.popToTop();
    } catch (e) {
      setError(formatAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.hero}>
        <Text style={styles.brand}>创建账号</Text>
        <Text style={styles.tagline}>注册后即可生成并保存攻略</Text>
      </View>

      <View style={styles.form}>
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
          placeholder="至少 6 位"
          placeholderTextColor={colors.muted}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          style={[styles.primaryBtn, busy && styles.btnDisabled]}
          onPress={onSubmit}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>注册</Text>
          )}
        </Pressable>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.link}>已有账号？去登录</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
