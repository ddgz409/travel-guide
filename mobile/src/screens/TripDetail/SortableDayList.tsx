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
  /** 编辑态独占滚动区域（flex:1）：列表必须挂在唯一滚动容器上，
   *  嵌套在 ScrollView 里会和父级抢垂直手势导致卡死 */
  fill?: boolean;
  renderRow: (item: Item) => React.ReactElement;
  onOrderChange: (orderedIds: string[]) => void;
  /** 编辑态删除单条（右上 ✕） */
  onRemove?: (item: Item) => void;
};

/**
 * 当天行程可排序列表 —— 基于 react-native-draggable-flatlist。
 *
 * 参考 money_planner（sh.calvin.reorderable）的拖拽架构：
 * - 拖拽中只改本地顺序，松手才提交父级落库；
 * - 拖拽进行中外部数据回推不覆盖本地顺序（isDragging 守卫），
 *   避免拖到一半被重置；
 * - 拖拽只能由右侧 ≡ 手柄长按触发，卡片其余区域不响应；
 * - 列表必须作为唯一滚动容器（fill 模式），不嵌套进 ScrollView。
 */
export function SortableDayList({
  items,
  canEdit,
  dragDisabled = false,
  fill = false,
  renderRow,
  onOrderChange,
  onRemove,
}: Props) {
  const [order, setOrder] = useState<Item[]>(items);
  const editing = canEdit && !dragDisabled;
  /** 拖拽进行中：屏蔽外部数据对本地顺序的覆盖 */
  const draggingRef = useRef(false);

  // 外部数据变化（切天/删改/接口回包）时以外部为准；拖拽中跳过
  useEffect(() => {
    if (draggingRef.current) return;
    setOrder(items);
  }, [items]);

  const onOrderChangeRef = useRef(onOrderChange);
  onOrderChangeRef.current = onOrderChange;

  const handleDragBegin = useCallback(() => {
    draggingRef.current = true;
    Vibration.vibrate(TICK_MS);
  }, []);

  const handleDragEnd = useCallback(
    ({ data }: DragEndParams<Item>) => {
      draggingRef.current = false;
      Vibration.vibrate(TICK_MS);
      setOrder(data);
      onOrderChangeRef.current?.(data.map((it) => it.id));
    },
    [],
  );

  /** 松手兜底：即使 onDragEnd 未触发也解除拖拽守卫 */
  const handleRelease = useCallback(() => {
    draggingRef.current = false;
  }, []);

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

            <View style={rowStyles.cardSlot}>{renderRow(item)}</View>

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
    <View style={[rowStyles.listWrap, fill && rowStyles.listWrapFill]}>
      <DraggableFlatList<Item>
        data={order}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        onDragBegin={handleDragBegin}
        onDragEnd={handleDragEnd}
        onRelease={handleRelease}
        activationDistance={8}
        autoscrollSpeed={AUTOSCROLL_SPEED}
        windowSize={windowSize}
        initialNumToRender={order.length}
        maxToRenderPerBatch={order.length}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
        contentContainerStyle={[
          rowStyles.listContent,
          fill && rowStyles.listContentFill,
        ]}
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
  /** fill 模式：独占父级全部高度，作为唯一滚动容器（不嵌套） */
  listWrapFill: {
    flex: 1,
    maxHeight: undefined,
  },
  listContent: { paddingBottom: 4 },
  /** fill 模式内容至少铺满视口，少量条目时拖拽区域也够大 */
  listContentFill: { flexGrow: 1, paddingBottom: 24 },
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
