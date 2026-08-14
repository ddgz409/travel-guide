import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { ContinentId } from "../../utils/footprintStats";

/**
 * 点阵世界地图（. 海洋 / N北美 S南美 E欧洲 F非洲 A亚洲 O大洋洲）
 * 打卡过的大洲用绿色实心点高亮，其余浅灰。
 */
const WORLD = [
  "............NNNNN.........E.AAAAAAAA.............",
  "........NNNNNNNNNN......EEEAAAAAAAAAAA...........",
  "......NNNNNNNNNNNNN....EEAAAAAAAAAAAAAA..........",
  ".....NNNNNNNNNNNNNN....EAAAAAAAAAAAAAAAA.........",
  "....NNNNNNNNNNNNNN.....AAAAAAAAAAAAAAAAA.A.......",
  "....NNNNNNNNNNNNN.......AAAAAAAAAAAAAAAA.A.......",
  ".....NNNNNNNNNNN........AAAAAAAAAAAAAAAAA........",
  "......NNNNNNNN..........AAAAAAAAAAAAAAAA.........",
  ".......NNNNNN.....FF....AAAAAAAAAAAAAAA..........",
  "........NNNN.....FFFF...AAAAAAAAAAAAAA...........",
  ".........NN.....FFFFFF..AAAAAAAAAAA....OO........",
  ".........S......FFFFFF...AAAAAAAA.......OOO......",
  "........SSS.....FFFFFF....AAAAA..........OOO.....",
  ".......SSSSS....FFFFF......................OO....",
  ".......SSSSSS....FFF.............................",
  "........SSSSS.....FF.............................",
  ".........SSSS....................................",
  "..........SSS....................................",
];

const COLS = Math.max(...WORLD.map((r) => r.length));
const ROWS = WORLD.map((r) => r.padEnd(COLS, "."));

const CHAR_TO_ID: Record<string, ContinentId> = {
  N: "NA",
  S: "SA",
  E: "EU",
  F: "AF",
  A: "AS",
  O: "OC",
};

const ON = "#2F8A52";
const OFF = "#C9D6CE";

type Props = {
  visited: ContinentId[];
};

export function DottedWorldMap({ visited }: Props) {
  const [width, setWidth] = useState(0);
  const key = visited.slice().sort().join(",");
  const on = useMemo(() => new Set(visited), [key]);
  const cols = COLS;
  const rows = ROWS.length;
  const cell = width > 0 ? width / cols : 0;
  const dot = Math.max(2.4, cell * 0.58);

  const dots = useMemo(() => {
    if (cell <= 0) return [];
    const out: React.ReactNode[] = [];
    ROWS.forEach((row, r) => {
      for (let c = 0; c < row.length; c += 1) {
        const id = CHAR_TO_ID[row[c]];
        if (!id) continue;
        const lit = on.has(id);
        out.push(
          <View
            key={`${r}-${c}`}
            style={{
              position: "absolute",
              left: c * cell + (cell - dot) / 2,
              top: r * cell + (cell - dot) / 2,
              width: dot,
              height: dot,
              borderRadius: lit ? 1.6 : 1,
              backgroundColor: lit ? ON : OFF,
            }}
          />,
        );
      }
    });
    return out;
  }, [cell, dot, on]);

  return (
    <View
      style={[styles.box, { height: cell > 0 ? cell * rows : 132 }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {dots}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: "100%", position: "relative" },
});
