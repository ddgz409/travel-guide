import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppStackParamList } from "../../navigation/types";
import {
  listCheckIns,
  subscribeCheckIns,
  type CheckInRecord,
} from "../../utils/checkInStore";
import { listFootprintEntries } from "../../utils/footprintStats";
import { FootprintWeatherCard } from "./FootprintWeatherCard";
import { styles } from "./styles";

type Props = NativeStackScreenProps<AppStackParamList, "FootprintList">;

const TITLES = {
  country: "到过的国家",
  city: "打卡过的城市",
  place: "打卡地点",
} as const;

const SECTIONS = {
  country: "已到过的国家",
  city: "已打卡城市",
  place: "已打卡地点",
} as const;

export function FootprintListScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const kind = route.params?.kind ?? "place";
  const [items, setItems] = useState<CheckInRecord[]>([]);

  const load = useCallback(() => {
    void listCheckIns().then(setItems);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => subscribeCheckIns(load), [load]);

  const entries = useMemo(() => listFootprintEntries(items, kind), [items, kind]);

  return (
    <View style={[styles.overviewRoot, { paddingTop: Math.max(insets.top, 8) }]}>
      <View style={styles.overviewHead}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ 返回</Text>
        </Pressable>
        <Text style={styles.overviewTitle}>{TITLES[kind]}</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.listScroll,
          { paddingBottom: Math.max(insets.bottom, 24) },
        ]}
      >
        {entries.length === 0 ? (
          <Text style={styles.listEmpty}>还没有打卡过哦</Text>
        ) : (
          <>
            <Text style={styles.listSection}>{SECTIONS[kind]}</Text>
            {entries.map((row, i) => (
              <FootprintWeatherCard
                key={row.key}
                kind={kind}
                title={row.title}
                sub={row.sub}
                province={row.province}
                time={row.time}
                tint={i}
              />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}
