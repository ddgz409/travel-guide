import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, Vibration, View } from "react-native";
import DraggableFlatList, {
  ScaleDecorator,
  type DragEndParams,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import type { Item } from "@travel-guide/shared";

/** 震动时长 ms */
const TICK_MS = 8;
/** 长按多久进入拖拽态 */
const ACTIVATE_DELAY = 250;
/** 拖拽贴边自动滚动速度（越大越快） */
const AUTOSCROLL_SPEED = 32;
/** 列表可视高度估算：编辑态单行（紧凑卡片+行距），用于 autoscroll 视窗 */
const EST_ROW_HEIGHT = 96;

type Props = {
  items: Item[];
  canEdit: boolean;
  dragDisabled?: boolean;
  renderRow: (item: Item) => React.ReactElement;
  onOrderChange: (orderedIds: string[]) => void;
  /** 编辑态删除单条（右上 ✕） */
  onRemove?: (item: Item) => void;
};

/**
 * 当天行程可排序列表 —— 基于 react-native-draggable-flatlist。
 *
 * 长按卡片进入拖拽：被拖卡片跟手移动、其余行自动让位，
 * 松手时经 onDragEnd 拿到最终顺序，一次性通知父级落库。
 * 列表自身可滚动，拖到边缘自动滚动，无需外层 ScrollView 参与手势协调。
 */
export function SortableDayList({
  items,
  canEdit,
  dragDisabled = false,
  renderRow,
  onOrderChange,
  onRemove,
}: Props) {
  const [order, setOrder] = useState<Item[]>(items);
  const editing = canEdit && !dragDisabled;

  // 外部数据变化（切天/删改/接口回包）时以外部为准
  useEffect(() => {
    setOrder(items);
  }, [items]);

  const onOrderChangeRef = useRef(onOrderChange);
  onOrderChangeRef.current = onOrderChange;

  const handleDragBegin = useCallback(() => {
    Vibration.vibrate(TICK_MS);
  }, []);

  const handleDragEnd = useCallback(
    ({ data }: DragEndParams<Item>) => {
      Vibration.vibrate(TICK_MS);
      setOrder(data);
      onOrderChangeRef.current?.(data.map((it) => it.id));
    },
    [],
  );

  /** 上/下按钮点移一位（不依赖拖拽，稳态兜底交互） */
  const moveBy = useCallback(
    (id: string, delta: number) => {
      setOrder((prev) => {
        const i = prev.findIndex((it) => it.id === id);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= prev.length) return prev;
        const next = prev.slice();
        const [moved] = next.splice(i, 1);
        next.splice(j, 0, moved);
        onOrderChangeRef.current?.(next.map((it) => it.id));
        return next;
      });
      Vibration.vibrate(TICK_MS);
    },
    [],
  );

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<Item>) => {
      return (
        <ScaleDecorator activeScale={1.02}>
          <View style={[rowStyles.row, isActive && rowStyles.rowActive]}>
            {editing ? (
              <View style={rowStyles.railLeft}>
                <Pressable
                  style={({ pressed }) => [
                    rowStyles.railBtn,
                    pressed && rowStyles.railBtnPressed,
                  ]}
                  onPress={() => moveBy(item.id, -1)}
                >
                  <Text style={rowStyles.railUp}>↑</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    rowStyles.railBtn,
                    pressed && rowStyles.railBtnPressed,
                  ]}
                  onPress={() => moveBy(item.id, 1)}
                >
                  <Text style={rowStyles.railDown}>↓</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={rowStyles.cardSlot}>
              {/* 长按整卡即可拖拽；drag 由库托管手势，这里仅作兜底入口 */}
              <Pressable onLongPress={drag} delayLongPress={ACTIVATE_DELAY}>
                {renderRow(item)}
              </Pressable>
            </View>

            {editing ? (
              <View style={rowStyles.railRight}>
                {onRemove ? (
                  <Pressable
                    style={({ pressed }) => [
                      rowStyles.railX,
                      pressed && rowStyles.railXPressed,
                    ]}
                    onPress={() => onRemove(item)}
                  >
                    <Text style={rowStyles.railXIcon}>✕</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={({ pressed }) => [
                    rowStyles.gripBtn,
                    pressed && rowStyles.gripBtnPressed,
                  ]}
                  onLongPress={drag}
                  delayLongPress={ACTIVATE_DELAY}
                >
                  <View style={rowStyles.gripBar} />
                  <View style={[rowStyles.gripBar, rowStyles.gripBarMid]} />
                  <View style={rowStyles.gripBar} />
                </Pressable>
              </View>
            ) : null}
          </View>
        </ScaleDecorator>
      );
    },
    [editing, moveBy, onRemove, renderRow],
  );

  const keyExtractor = useCallback((item: Item) => item.id, []);

  // 编辑态可视窗口估算，交给库做贴边自动滚动
  const windowSize = useMemo(
    () => Math.max(3, Math.round(640 / EST_ROW_HEIGHT)),
    [],
  );

  if (!editing) {
    // 非编辑态：纯展示，直接平铺，避免 FlatList 与外层滚动嵌套
    return (
      <View>
        {order.map((item) => (
          <View key={item.id} style={rowStyles.row}>
            <View style={rowStyles.cardSlot}>{renderRow(item)}</View>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={rowStyles.listWrap}>
      <DraggableFlatList<Item>
        data={order}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        onDragBegin={handleDragBegin}
        onDragEnd={handleDragEnd}
        activationDistance={8}
        autoscrollSpeed={AUTOSCROLL_SPEED}
        windowSize={windowSize}
        initialNumToRender={order.length}
        maxToRenderPerBatch={order.length}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        removeClippedSubviews={false}
        contentContainerStyle={rowStyles.listContent}
      />
    </View>
  );
}

const rowStyles = StyleSheet.create({
  listWrap: {
    // 编辑态列表自身承担滚动：给一个有界高度，拖到边缘可自动滚动
    maxHeight: 480,
    flexGrow: 0,
  },
  listContent: { paddingBottom: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  rowActive: { zIndex: 10, elevation: 12 },
  cardSlot: { flex: 1, minWidth: 0 },
  railLeft: {
    width: 36,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginRight: 8,
  },
  railBtn: {
    width: 32,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(33,84,63,0.22)",
  },
  railBtnPressed: { backgroundColor: "#DEF2E4" },
  railUp: {
    fontSize: 14,
    lineHeight: 16,
    fontWeight: "900",
    color: "#1B7A43",
    includeFontPadding: false,
  },
  railDown: {
    fontSize: 14,
    lineHeight: 16,
    fontWeight: "900",
    color: "#45605A",
    includeFontPadding: false,
  },
  railRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: 8,
  },
  railX: {
    width: 32,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(198,40,40,0.32)",
  },
  railXPressed: { backgroundColor: "#FDEBEB" },
  railXIcon: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "800",
    color: "#C62828",
    includeFontPadding: false,
  },
  gripBtn: {
    width: 36,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DEF2E4",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(27,122,67,0.35)",
  },
  gripBtnPressed: { backgroundColor: "#C4E7CF" },
  gripBar: {
    width: 16,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#1B7A43",
  },
  gripBarMid: { marginVertical: 2.5 },
});
