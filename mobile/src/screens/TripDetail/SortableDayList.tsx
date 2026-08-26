import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Vibration,
  View,
} from "react-native";
import { useAnimatedRef } from "react-native-reanimated";
import Sortable, { type SortableFlexDragEndParams } from "react-native-sortables";
import type { Item } from "@travel-guide/shared";

/** 震动时长 ms */
const TICK_MS = 8;
/** 长按多久进入拖拽态（库默认 200） */
const ACTIVATE_DELAY = 250;

type Props = {
  items: Item[];
  canEdit: boolean;
  /** 禁用拖拽（AI 规划中等忙碌态），不影响排序视图渲染 */
  dragDisabled?: boolean;
  /** 编辑态：组件自带 ScrollView 独占滚动区（flex:1）。
   *  排序列表挂在唯一滚动容器上（money_planner 同构架构），
   *  绝不与外层 ScrollView 嵌套，否则手势打架卡死 */
  fill?: boolean;
  renderRow: (item: Item) => React.ReactElement;
  onOrderChange: (orderedIds: string[]) => void;
  /** 编辑态删除单条（右上 ✕） */
  onRemove?: (item: Item) => void;
};

/**
 * 当天行程可排序列表 —— 基于 react-native-sortables（Sortable.Flex）。
 *
 * 与 money_planner（sh.calvin.reorderable）同构的拖拽架构：
 * - 滚动由外部唯一 ScrollView 承担，Sortable.Flex 通过 scrollableRef
 *   接管贴边自动滚动，自身不参与滚动手势协商；
 * - 拖拽中只改库内部顺序，松手才用 order() 重排数据提交父级落库；
 * - 拖拽进行中外部数据回推不覆盖本地顺序（isDragging 守卫），
 *   避免拖到一半被重置；
 * - 拖拽只能由右侧 ≡ 手柄（Sortable.Handle）长按触发，卡片其余区域不响应。
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
  const [rows, setRows] = useState<Item[]>(items);
  /** 拖拽进行中：屏蔽外部数据对本地顺序的覆盖 */
  const draggingRef = useRef(false);
  /** 松手时 order() 需要最新行数据（回调闭包不重建） */
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const scrollRef = useAnimatedRef<ScrollView>();

  // 外部数据变化（切天/删改/接口回包）时以外部为准；拖拽中跳过
  useEffect(() => {
    if (draggingRef.current) return;
    setRows(items);
  }, [items]);

  const onOrderChangeRef = useRef(onOrderChange);
  onOrderChangeRef.current = onOrderChange;

  const handleDragStart = useCallback(() => {
    draggingRef.current = true;
    Vibration.vibrate(TICK_MS);
  }, []);

  const handleDragEnd = useCallback(
    ({ order }: SortableFlexDragEndParams) => {
      draggingRef.current = false;
      Vibration.vibrate(TICK_MS);
      const next = order(rowsRef.current);
      setRows(next);
      onOrderChangeRef.current?.(next.map((it) => it.id));
    },
    [],
  );

  /** 上/下按钮点移一位（不依赖拖拽，稳态兜底交互） */
  const moveBy = useCallback((id: string, delta: number) => {
    const prev = rowsRef.current;
    const i = prev.findIndex((it) => it.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= prev.length) return;
    const next = prev.slice();
    const [moved] = next.splice(i, 1);
    next.splice(j, 0, moved);
    setRows(next);
    onOrderChangeRef.current?.(next.map((it) => it.id));
    Vibration.vibrate(TICK_MS);
  }, []);

  if (!fill) {
    // 非编辑态：纯展示，直接平铺，不参与任何手势
    return (
      <View>
        {items.map((item) => (
          <View key={item.id} style={rowStyles.row}>
            <View style={rowStyles.cardSlot}>{renderRow(item)}</View>
          </View>
        ))}
      </View>
    );
  }

  // 编辑态排序视图：ScrollView 是唯一滚动容器，Sortable.Flex 借它自动滚动
  return (
    <View style={rowStyles.listWrapFill}>
      <ScrollView
        ref={scrollRef}
        style={rowStyles.scrollBody}
        contentContainerStyle={rowStyles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Sortable.Flex
          flexDirection="column"
          rowGap={12}
          customHandle
          dragActivationDelay={ACTIVATE_DELAY}
          activeItemScale={1.02}
          activationAnimationDuration={150}
          dropAnimationDuration={200}
          sortEnabled={canEdit && !dragDisabled}
          scrollableRef={scrollRef}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {rows.map((item) => (
            <View key={item.id} style={rowStyles.row}>
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

              <View style={rowStyles.cardSlot}>{renderRow(item)}</View>

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
                {/* 仅此手柄可发起拖拽（longPress 250ms），卡片其余区域不响应 */}
                <Sortable.Handle style={rowStyles.gripBtn}>
                  <View style={rowStyles.gripBar} />
                  <View style={[rowStyles.gripBar, rowStyles.gripBarMid]} />
                  <View style={rowStyles.gripBar} />
                </Sortable.Handle>
              </View>
            </View>
          ))}
        </Sortable.Flex>
      </ScrollView>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  /** 编辑态：独占父级全部高度，内部 ScrollView 作为唯一滚动容器 */
  listWrapFill: {
    flex: 1,
    minHeight: 0,
  },
  scrollBody: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
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
  gripBar: {
    width: 16,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#1B7A43",
  },
  gripBarMid: { marginVertical: 2.5 },
});
