import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { ContinentId } from "../../utils/footprintStats";

/**
 * 点阵世界地图（方格像素）
 * . 海洋  N北美  S南美  E欧洲  F非洲  A亚洲  O大洋洲  T南极
 */
const WORLD = [
  "..............NN.NN.........................AAAAAAAAAA.................",
  "...........NNNNNNNNNN.........NN.........AAAAAAAAAAAAAAA...............",
  ".........NNNNNNNNNNNNN......NNNNN.......AAAAAAAAAAAAAAAAA..............",
  ".......NNNNNNNN..NNNNNN.....NNNNN......AAAAAAAAAAAAAAAAAAA.............",
  "......NNNNNNNNN...NNNNN.....NNNN.......AAAAAAAAAAAAAAAAAAAA............",
  ".....NNNNNNNNNNN..NNNN......NNN.E......AAAAAAAAAAAAAAAAAAAAA...........",
  ".....NNNNNNNNNNNN.NNN........EEEE......AAAAAAAAAAAAAAAAAAAAAA..........",
  ".....NNNNNNNNNNNNNNN........EEEEE......AAAAAAAAAAAAAAAAAAAAAAA.........",
  ".....NNNNNNNNNNNNNN.........EEEEE......AAAAAAAAAAAAAAAAAAAAAAA.AA......",
  "......NNNNNNNNNNNN..........EEEEE.......AAAAAAAAAAAAAAAAAAAAAAA.A......",
  ".......NNNNNNNNNNN..........EEEE........AAAAAAAAAAAAAAAAAAAAAAA........",
  "........NNNNNNNNN...........EEE.F.......AAAAAAAAAAAAAAAAAAAAAA.........",
  ".........NNNNNNN.............FFFFF......A.AAAAAAAAAAAAAAAAAAAA.........",
  "..........NNNNN..............FFFFFF.....AAAAAAAAAAAAAAAAAAAAA..........",
  "...........NNNN.............FFFFFFFF....AAAAAAAAAAAAAAAAAAAA...........",
  "............NN..............FFFFFFFFF...AAAAAAAAAAAAAAAAAAA............",
  "............N...............FFFFFFFFFF..AAAAAAAAAAAAAAA................",
  "...........N.N..............FFFFFFFFFF...AAAAAAAAAAAAA......A..........",
  "............S...............FFFFFFFFFF....AAAAAAAAAAA......AAA.........",
  "...........SSS..............FFFFFFFFF......AAAAAAAAA......AAAAA........",
  "..........SSSSS.............FFFFFFFF........AAAAAAA.......AAAAA........",
  ".........SSSSSS.............FFFFFFF..........AAAAA.........AAA.........",
  "........SSSSSSS.............FFFFFF............AA..........OO...........",
  "........SSSSSSS..............FFFFF.......................OOOO..........",
  ".......SSSSSSSS...............FFFF......................OOOOOO.........",
  ".......SSSSSSS.................FFF.........F............OOOOOOO........",
  "........SSSSSS..................FF.........F.............OOOOOO........",
  ".........SSSSS............................................OOOO.........",
  "..........SSSS.............................................OOO.....O...",
  "...........SSS..............................................O......OO..",
  "............SS.........................................................",
  ".............S.........................................................",
  ".......................................................................",
  "...TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT.....",
  "..TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT....",
  "...TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT.....",
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
  T: "AN",
};

const ON = "#3D9A5C";
const OFF = "#C2C2C2";

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
  const gap = Math.max(0.55, cell * 0.2);
  const dot = Math.max(2, cell - gap);

  const dots = useMemo(() => {
    if (cell <= 0) return [];
    const out: React.ReactNode[] = [];
    ROWS.forEach((row, r) => {
      for (let c = 0; c < row.length; c += 1) {
        const id = CHAR_TO_ID[row[c]];
        if (!id) continue;
        out.push(
          <View
            key={`${r}-${c}`}
            style={{
              position: "absolute",
              left: c * cell + (cell - dot) / 2,
              top: r * cell + (cell - dot) / 2,
              width: dot,
              height: dot,
              borderRadius: 0.5,
              backgroundColor: on.has(id) ? ON : OFF,
            }}
          />,
        );
      }
    });
    return out;
  }, [cell, dot, on]);

  return (
    <View
      style={[styles.box, { height: cell > 0 ? cell * rows : 156 }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {dots}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: "100%", position: "relative" },
});
