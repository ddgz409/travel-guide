import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import type { Trip } from "@travel-guide/shared";
import { ApiError } from "@travel-guide/shared";
import { api, absAvatar } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { DayMap } from "../../components/DayMap/DayMap";
import { UserAvatar } from "../../components/UserAvatar";
import { colors } from "../../theme";
import { PressScale } from "../../utils/motion";
import type { AppStackParamList } from "../../navigation/types";
import { SLOT_LABEL, TYPE_LABEL } from "../TripDetail/constants";
import { ShareLinkInput } from "./ShareLinkInput";
import { styles } from "./styles";

type Props = NativeStackScreenProps<AppStackParamList, "Share">;

export function ShareScreen({ navigation, route }: Props) {
  const token = route.params?.token;
  const { user, loading: authLoading } = useAuth();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dayIdx, setDayIdx] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const t = await api.trips.getShared(token);
      setTrip(t);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "分享链接无效");
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setTrip(null);
      setError(null);
      return;
    }
    void load();
  }, [token, load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!trip || trip.share_mode !== "collab") return;
    const id = setInterval(() => void load(), 4000);
    return () => clearInterval(id);
  }, [trip?.share_mode, load]);

  async function onJoin() {
    if (!user) {
      navigation.navigate("Login", { next: { screen: "Share", token } });
      return;
    }
    setBusy(true);
    try {
      const t = await api.trips.joinShare(token);
      setTrip(t);
      if (t.can_edit) {
        navigation.replace("TripDetail", { tripId: t.id });
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "加入失败");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (!token) {
    return (
      <ShareLinkInput navigation={navigation} />
    );
  }

  if (error) {
    return (
      <ShareLinkInput navigation={navigation} error={error} initialValue={token} />
    );
  }
  if (!trip) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const day = trip.days[dayIdx] || trip.days[0];
  const items = (day?.items || []).filter((i) => i.selected);
  const collab = trip.share_mode === "collab";
  const collaborators = trip.collaborators || [];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.badge}>{collab ? "共同编辑邀请" : "分享攻略"}</Text>
      <Text style={styles.title}>{trip.title}</Text>
      <Text style={styles.meta}>
        {trip.destination} · {trip.start_date} → {trip.end_date} ·{" "}
        {trip.travelers} 人
      </Text>

      {collaborators.length > 0 ? (
        <View style={styles.collabBox}>
          <Text style={styles.collabTitle}>协作者</Text>
          <View style={styles.collabAvatarRow}>
            {collaborators.map((c) => (
              <View key={c.user_id} style={styles.collabAvatarChip}>
                <UserAvatar name={c.username} size={30} imageUri={absAvatar(c.avatar)} />
                <Text style={styles.collabAvatarName} numberOfLines={1}>
                  {c.username}
                  {c.role === "owner" ? "（创建者）" : ""}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {collab ? (
        <PressScale
          style={[styles.joinBtn, busy && { opacity: 0.6 }]}
          onPress={() => void onJoin()}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.joinBtnText}>
              {user
                ? trip.can_edit
                  ? "进入编辑"
                  : "登录已确认，加入共同编辑"
                : "登录后加入共同编辑"}
            </Text>
          )}
        </PressScale>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, marginVertical: 14 }}
      >
        {trip.days.map((d, i) => (
          <Pressable
            key={d.id}
            style={[styles.tab, i === dayIdx && styles.tabOn]}
            onPress={() => setDayIdx(i)}
          >
            <Text style={[styles.tabText, i === dayIdx && styles.tabTextOn]}>
              Day {d.day_index}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {day?.summary ? (
        <Text style={styles.summary}>{day.summary}</Text>
      ) : null}

      {items.map((it) => (
        <View key={it.id} style={styles.item}>
          <Text style={styles.itemType}>
            {TYPE_LABEL[it.type]} · {SLOT_LABEL[it.time_slot]}
          </Text>
          <Text style={styles.itemName}>{it.name}</Text>
          {it.description ? (
            <Text style={styles.itemDesc} numberOfLines={3}>
              {it.description}
            </Text>
          ) : null}
        </View>
      ))}

      {day ? (
        <View style={{ marginTop: 16 }}>
          <Text style={styles.mapTitle}>地图</Text>
          <DayMap tripId={trip.id} dayId={day.id} items={items} />
        </View>
      ) : null}
    </ScrollView>
  );
}
