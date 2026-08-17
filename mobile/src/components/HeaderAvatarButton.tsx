import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../auth/AuthContext";
import { useMainTab } from "../navigation/MainTabContext";
import { subscribeAvatars } from "../utils/avatarStore";
import { loadAvatarUri } from "../utils/pickAvatar";
import { HEADER_AVATAR_SIZE } from "../utils/avatarConfig";
import { UserAvatar } from "./UserAvatar";

/** 顶栏左上角头像：点击进入「我的」，无图则昵称首字 */
export function HeaderAvatarButton() {
  const navigation = useNavigation();
  const { setTab } = useMainTab();
  const { user, isGuest } = useAuth();
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const name = user?.username || (isGuest ? "游客" : "游");

  const refresh = useCallback(async () => {
    setAvatarUri(await loadAvatarUri(user?.id, isGuest));
  }, [user?.id, isGuest]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => subscribeAvatars(() => { void refresh(); }), [refresh]);

  return (
    <Pressable
      onPress={() => {
        if (user || isGuest) {
          setTab("Me");
          return;
        }
        (navigation as any).navigate("Login");
      }}
      style={styles.hit}
      accessibilityRole="button"
      accessibilityLabel="我的"
    >
      <UserAvatar
        name={name}
        size={HEADER_AVATAR_SIZE}
        variant="circle"
        imageUri={avatarUri}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    marginRight: 12,
    flexShrink: 0,
  },
});
