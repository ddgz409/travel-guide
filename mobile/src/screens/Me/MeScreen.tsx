import React, { useCallback, useEffect, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../auth/AuthContext";
import { useMainTab } from "../../navigation/MainTabContext";
import { UserAvatar } from "../../components/UserAvatar";
import { SettingsGear } from "../../components/SettingsGear";
import { AvatarCropSheet } from "../../components/AvatarCropSheet";
import { api, absAvatar } from "../../api/client";
import { listCheckIns, subscribeCheckIns, getCheckedPrefectureIds, type CheckInRecord } from "../../utils/checkInStore";
import { buildFootprintStats } from "../../utils/footprintStats";
import { subscribeAvatars } from "../../utils/avatarStore";
import type { AvatarCropRect } from "../../utils/avatarImage";
import {
  guestAvatarUserId,
  loadAvatarUri,
  pickAvatarSourceUri,
  removeAvatar,
  saveAvatarFromSource,
} from "../../utils/pickAvatar";
import { CheckInMapCard } from "../Trips/CheckInMapCard";
import { TAB_BAR_BODY } from "../../components/CustomTabBar";
import {
  getFavoriteCounts,
  subscribeFavorites,
} from "../../utils/favoriteStore";
import { colors } from "../../theme";
import { styles } from "./styles";

export function MeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { tab } = useMainTab();
  const { user, isGuest } = useAuth();
  const [checkIns, setCheckIns] = useState<CheckInRecord[]>([]);
  const [favCounts, setFavCounts] = useState({ folderCount: 1, placeCount: 0 });
  const [checkedPrefectures, setCheckedPrefectures] = useState<string[]>([]);
  const [mapLoading, setMapLoading] = useState(true);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [cropUri, setCropUri] = useState<string | null>(null);
  const [cropBusy, setCropBusy] = useState(false);

  const avatarUserId = user?.id ?? (isGuest ? guestAvatarUserId() : null);

  const refreshAvatar = useCallback(async () => {
    // 登录用户优先显示服务器头像（跨设备），无则回退本机
    if (user?.id) {
      const server = absAvatar(user.avatar);
      if (server) {
        setAvatarUri(server);
        return;
      }
    }
    setAvatarUri(await loadAvatarUri(user?.id, isGuest));
  }, [user?.id, isGuest, user?.avatar]);

  const load = useCallback(async () => {
    try {
      const [items, prefectures, fav] = await Promise.all([
        listCheckIns(),
        getCheckedPrefectureIds(),
        getFavoriteCounts(),
      ]);
      setCheckIns(items);
      setCheckedPrefectures(prefectures);
      setFavCounts(fav);
    } finally {
      setMapLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      void refreshAvatar();
    }, [load, refreshAvatar]),
  );

  useEffect(() => {
    if (tab === "Me") {
      void load();
      void refreshAvatar();
    }
  }, [tab, load, refreshAvatar]);

  useEffect(() => subscribeCheckIns(() => { void load(); }), [load]);
  useEffect(() => subscribeFavorites(() => { void load(); }), [load]);
  useEffect(() => subscribeAvatars(() => { void refreshAvatar(); }), [refreshAvatar]);

  const stats = buildFootprintStats(checkIns);
  const name = user?.username || (isGuest ? "游客" : "未登录");
  const latest = stats.latest;

  const onPickAvatar = () => {
    if (!avatarUserId) {
      Alert.alert("请先登录", "登录后可设置头像");
      return;
    }
    void pickAvatarSourceUri().then((uri) => {
      if (uri) setCropUri(uri);
    });
  };

  const onConfirmCrop = (crop: AvatarCropRect) => {
    if (!cropUri || !avatarUserId) return;
    setCropBusy(true);
    void (async () => {
      try {
        const localUri = await saveAvatarFromSource(avatarUserId, cropUri, crop);
        let display = localUri;
        // 登录用户同步到服务器，跨设备/被他人可见
        if (user?.id) {
          try {
            const { avatar } = await api.users.uploadAvatar(localUri);
            display = absAvatar(avatar) ?? localUri;
          } catch (e) {
            Alert.alert("头像已保存", "上传到服务器失败，仅本机可见");
          }
        }
        setAvatarUri(display);
        setCropUri(null);
      } catch {
        /* alert in saveAvatarFromSource */
      } finally {
        setCropBusy(false);
      }
    })();
  };

  const onAvatarLongPress = () => {
    if (!avatarUri || !avatarUserId) return;
    Alert.alert("恢复默认头像", "将改回昵称首字显示", [
      { text: "取消", style: "cancel" },
      {
        text: "恢复",
        style: "destructive",
        onPress: () => {
          void (async () => {
            await removeAvatar(user?.id, isGuest);
            if (user?.id) {
              try {
                await api.users.removeAvatar();
              } catch {
                /* ignore */
              }
            }
            setAvatarUri(null);
          })();
        },
      },
    ]);
  };

  return (
    <View style={[styles.root, { paddingTop: Math.max(insets.top, 10) }]}>
      <AvatarCropSheet
        visible={cropUri != null}
        imageUri={cropUri}
        busy={cropBusy}
        onCancel={() => {
          if (!cropBusy) setCropUri(null);
        }}
        onConfirm={onConfirmCrop}
      />
      <Pressable
        style={[styles.menuBtn, { top: Math.max(insets.top, 10) + 4 }]}
        accessibilityLabel="设置"
        onPress={() => (navigation as any).navigate("Settings")}
      >
        <SettingsGear size={20} color={colors.ink} holeColor="#fff" />
      </Pressable>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: TAB_BAR_BODY + Math.max(insets.bottom, 12) + 24,
        }}
      >
        <Pressable
          style={styles.addBubble}
          onPress={() => (navigation as any).navigate("AddFootprint")}
        >
          <Text style={styles.addBubbleText}>添加足迹</Text>
        </Pressable>

        <View style={styles.profile}>
          <Pressable
            onPress={onPickAvatar}
            onLongPress={onAvatarLongPress}
            accessibilityRole="button"
            accessibilityLabel="更换头像"
          >
            <UserAvatar
              name={name}
              size={168}
              variant="card"
              imageUri={avatarUri}
            />
          </Pressable>
          {avatarUserId ? (
            <Text style={styles.avatarHint}>点击相册选图 · 长按恢复默认</Text>
          ) : null}
          <Text style={styles.username}>{name}</Text>
          {!user ? (
            <Pressable onPress={() => (navigation as any).navigate("Login")}>
              <Text style={styles.hint}>点击登录账号</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.grid}>
          <Pressable
            style={styles.miniCard}
            onPress={() => (navigation as any).navigate("Favorites")}
          >
            <Text style={styles.miniIcon}>⭐</Text>
            <Text style={styles.miniTitle}>我的收藏</Text>
            <Text style={styles.miniSub}>
              收藏夹 · {favCounts.folderCount}{"  "}地点 · {favCounts.placeCount}
            </Text>
          </Pressable>
          <Pressable
            style={styles.miniCard}
            onPress={() => (navigation as any).navigate("MySubscriptions")}
          >
            <Text style={styles.miniIcon}>🔔</Text>
            <Text style={styles.miniTitle}>我的订阅</Text>
            <Text style={styles.miniSub}>探索页共享收藏夹</Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.footCard}
          onPress={() => (navigation as any).navigate("FootprintOverview")}
        >
          <View style={styles.footDeco} />
          <Text style={styles.footTitle}>我的足迹</Text>
          {stats.placeCount > 0 ? (
            <>
              <Text style={styles.footMeta}>
                国家/地区 · {stats.countryCount}{"  "}城市 · {stats.cityCount}
              </Text>
              {latest ? (
                <Text style={styles.footLoc} numberOfLines={1}>
                  {latest.address || latest.name}
                </Text>
              ) : null}
              <View style={styles.checkDot}>
                <Text style={styles.checkDotText}>✓</Text>
              </View>
            </>
          ) : (
            <Text
              style={[
                styles.artEmpty,
                Platform.OS === "android" ? { fontFamily: "serif" } : null,
              ]}
            >
              这里空空如也~
            </Text>
          )}
        </Pressable>

        <View style={{ marginTop: 12 }}>
          <CheckInMapCard
            checkedPrefectureIds={checkedPrefectures}
            checkInCount={checkIns.length}
            loading={mapLoading}
            onPress={() => (navigation as any).navigate("CheckInMapFull")}
          />
        </View>
      </ScrollView>
    </View>
  );
}
