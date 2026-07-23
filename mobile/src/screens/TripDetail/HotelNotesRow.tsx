import React from "react";
import { Pressable, Text, View } from "react-native";
import type { ExternalRefs, HotelCandidate } from "@travel-guide/shared";
import { openExternal } from "../../utils/openExternal";
import { styles } from "./styles";

function hotelOpenUrl(h: HotelCandidate, destination: string): string {
  const raw = (h.url || "").trim();
  if (raw) return raw;
  const q = encodeURIComponent(`${destination} ${h.name}`.trim());
  return `https://hotels.ctrip.com/hotels/list?keyword=${q}`;
}

export function HotelNotesRow({
  destination,
  status,
  candidates,
  refs,
}: {
  destination: string;
  status?: string;
  candidates?: HotelCandidate[];
  refs?: ExternalRefs;
}) {
  const hotels = (candidates || []).slice(0, 6);
  const tips = [...(refs?.xiaohongshu || []), ...(refs?.ctrip || [])].slice(0, 6);
  if (!hotels.length && !tips.length) return null;

  return (
    <View style={styles.section}>
      <View style={styles.parallelRow}>
        <View style={styles.parallelCol}>
          <Text style={styles.parallelTitle}>酒店候选</Text>
          {status === "amap_only" && hotels.length ? (
            <Text style={styles.parallelHint}>地图检索结果</Text>
          ) : null}
          {hotels.length ? (
            hotels.map((h, i) => (
              <Pressable
                key={`${h.name}-${i}`}
                style={styles.compactCard}
                onPress={() => {
                  void openExternal(hotelOpenUrl(h, destination));
                }}
              >
                <Text style={styles.compactTitle} numberOfLines={2}>
                  {i + 1}. {h.name}
                </Text>
                {h.nearest_attraction && typeof h.nearest_dist_m === "number" ? (
                  <Text style={styles.compactAccent} numberOfLines={1}>
                    距{h.nearest_attraction}{" "}
                    {(h.nearest_dist_m / 1000).toFixed(1)}km
                  </Text>
                ) : typeof h.avg_dist_m === "number" ? (
                  <Text style={styles.compactAccent}>
                    距景点 {(h.avg_dist_m / 1000).toFixed(1)}km
                  </Text>
                ) : null}
              </Pressable>
            ))
          ) : (
            <Text style={styles.parallelEmpty}>暂无酒店</Text>
          )}
        </View>

        <View style={styles.parallelCol}>
          <Text style={styles.parallelTitle}>参考笔记</Text>
          {tips.length ? (
            tips.map((t, i) => {
              const isXhs = (refs?.xiaohongshu || []).some((x) => x.url === t.url);
              return (
                <Pressable
                  key={`${t.url}-${i}`}
                  style={styles.compactCard}
                  onPress={() => {
                    if (t.url)
                      void openExternal(t.url, t.title, t.meta as {
                        keyword?: string;
                        app_url?: string;
                      } | null);
                  }}
                >
                  <Text style={styles.compactSource}>
                    {isXhs ? "小红书" : "携程"}
                  </Text>
                  <Text style={styles.compactTitle} numberOfLines={2}>
                    {t.title}
                  </Text>
                </Pressable>
              );
            })
          ) : (
            <Text style={styles.parallelEmpty}>暂无笔记</Text>
          )}
        </View>
      </View>
    </View>
  );
}
