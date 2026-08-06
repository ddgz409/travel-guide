import React, { useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Trip } from "@travel-guide/shared";
import { HeroRouteMap } from "../../components/HeroRouteMap";
import { TripDetailSheet } from "../../components/TripDetailSheet";
import { colors } from "../../theme";
import { styles } from "./styles";

const PHASES = [
  { id: "geocode", label: "定位目的地" },
  { id: "poi", label: "检索景点美食" },
  { id: "refs", label: "整理参考链接" },
  { id: "llm", label: "AI 规划路线" },
  { id: "save", label: "整理方案" },
];

type Props = {
  trip: Trip;
  message: string;
  readable: string;
  phase?: string;
  streaming: boolean;
};

export function TripGeneratingView({
  trip,
  message,
  readable,
  phase,
  streaming,
}: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const firstDay = trip.days?.[0];
  const dayItems = useMemo(
    () => firstDay?.items?.filter((it) => it.selected) || [],
    [firstDay?.items],
  );

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [readable, message]);

  const phaseIdx = PHASES.findIndex((p) => p.id === phase);

  return (
    <View style={styles.genRoot}>
      <View style={StyleSheet.absoluteFill}>
        <HeroRouteMap
          fill
          tripId={trip.id}
          dayId={firstDay?.id}
          items={dayItems}
          destination={trip.destination}
          title={`${trip.destination} 路线规划`}
          showCategoryChips
        />
      </View>

      <TripDetailSheet initialRatio={0.48}>
        <ScrollView
          style={styles.genBodyScroll}
          contentContainerStyle={styles.genBody}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.genHero}>AI 正在为你规划行程</Text>
          <View style={styles.genPhaseRow}>
            {PHASES.map((p, i) => {
              const done = phaseIdx > i;
              const active = phaseIdx === i || (phaseIdx < 0 && i === 0);
              return (
                <View key={p.id} style={styles.genPhaseItem}>
                  <View
                    style={[
                      styles.genPhaseDot,
                      done && styles.genPhaseDotDone,
                      active && styles.genPhaseDotActive,
                    ]}
                  />
                  <Text
                    style={[
                      styles.genPhaseLabel,
                      (done || active) && styles.genPhaseLabelOn,
                    ]}
                    numberOfLines={1}
                  >
                    {p.label}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={styles.genStreamBubble}>
            <Text style={styles.genStreamRole}>旅迹 AI</Text>
            <Text style={styles.genStreamStatus}>{message || "准备中…"}</Text>
            {readable ? (
              <ScrollView
                ref={scrollRef}
                style={styles.genStreamScroll}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.genStreamText}>{readable}</Text>
              </ScrollView>
            ) : streaming ? (
              <View style={styles.genStreamTyping}>
                <ActivityIndicator size="small" color={colors.brand} />
                <Text style={styles.genStreamTypingText}>正在输出规划内容…</Text>
              </View>
            ) : null}
            {streaming && readable ? (
              <Text style={styles.genStreamCursor}>▍</Text>
            ) : null}
          </View>
        </ScrollView>
      </TripDetailSheet>
    </View>
  );
}
