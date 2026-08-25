import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, Vibration, View } from "react-native";
import {
  Gesture,
  GestureDetector,
  type NativeGesture,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import type { Item } from "@travel-guide/shared";

/** 行卡片之间固定间距（与 ItemListRow feedCard 的 marginBottom 一致） */
const ROW_GAP = 12;

/** 邻居让位：快而不僵，轻微Q弹 */
const PUSH_SPRING = { damping: 20, stiffness: 360, mass: 0.9 };
/** 松手落位 */
const DROP_SPRING = { damping: 18, stiffness: 340, mass: 0.9 };
/** 磁吸换位：跟指但瞬间呈现最终排列 */
const SNAP_SPRING = { damping: 26, stiffness: 520, mass: 0.9 };
/** 长按激活时长 */
const ACTIVATE_MS = 300;
/** 自动滚动边缘/速度 */
const AUTO_EDGE = 72;
const AUTO_SPEED = 7;
/** 震动 ms */
const TICK_MS = 8;

type OrderIds = string[];

/** 拖拽位移 → 目标序号（worklet） */
function computeTarget(
  from: number,
  ty: number,
  orderIds: OrderIds,
  heights: Record<string, number>,
): number {
  "worklet";
  const n = orderIds.length;
  let draggedTop = 0;
  for (let i = 0; i < from; i++) draggedTop += heights[orderIds[i]] || 0;
  const hFrom = heights[orderIds[from]] || 0;
  const draggedCenter = draggedTop + hFrom / 2 + ty;
  let top = 0;
  for (let i = 0; i < n; i++) {
    if (i === from) {
      top += hFrom;
      continue;
    }
    const h = heights[orderIds[i]] || 0;
    const center = top + h / 2;
    if (draggedCenter < center) return i;
    top += h;
  }
  return n - 1;
}

/** 目标槽位相对于原位置的位移（worklet）：负=上移 */
function slotDisplacement(
  from: number,
  to: number,
  orderIds: OrderIds,
  heights: Record<string, number>,
): number {
  "worklet";
  let d = 0;
  if (to > from) {
    for (let i = from + 1; i <= to; i++) d -= heights[orderIds[i]] || 0;
  } else if (to < from) {
    for (let i = to; i < from; i++) d += heights[orderIds[i]] || 0;
  }
  return d;
}

export type ScrollWindow = { top: number; height: number };

type RowProps = {
  item: Item;
  canEdit: boolean;
  dragDisabled: boolean;
  scrollGesture?: NativeGesture;
  renderRow: (item: Item) => React.ReactElement;
  activeIndex: SharedValue<number>;
  /** 手指原始位移 */
  dragTy: SharedValue<number>;
  /** 磁吸基准：最近一次换位时的手指位移 */
  fingerBase: SharedValue<number>;
  targetIndex: SharedValue<number>;
  orderIds: SharedValue<OrderIds>;
  heights: SharedValue<Record<string, number>>;
  scrollWindow: SharedValue<ScrollWindow | null>;
  lastAutoDir: SharedValue<number>;
  onDragBegin: () => void;
  onDragEnd: () => void;
  setAutoDir: (dir: number) => void;
  moveBy: (id: string, delta: number) => void;
  /** 编辑态左侧 ✕ 删除回调（不传则不显示 ✕） */
  onRemove?: (item: Item) => void;
  onMeasure: (id: string, height: number) => void;
  notifyDrag: (active: boolean) => void;
  commitOrder: (ids: OrderIds) => void;
};

function SortableRow({
  item,
  canEdit,
  dragDisabled,
  scrollGesture,
  renderRow,
  activeIndex,
  dragTy,
  fingerBase,
  targetIndex,
  orderIds,
  heights,
  scrollWindow,
  lastAutoDir,
  onDragBegin,
  onDragEnd,
  setAutoDir,
  moveBy,
  onRemove,
  onMeasure,
  notifyDrag,
  commitOrder,
}: RowProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const ids = orderIds.value;
    const idx = ids.indexOf(item.id);
    const from = activeIndex.value;
    if (idx < 0 || from < 0) {
      return { transform: [{ translateY: 0 }, { scale: 1 }], zIndex: 0, elevation: 0 };
    }
    if (idx === from) {
      // 被拖拽卡片：磁吸跟随（dragTy 已含槽位位移），微微放大
      return {
        transform: [{ translateY: dragTy.value }, { scale: 1.02 }],
        zIndex: 100,
        elevation: 12,
        opacity: 0.97,
      };
    }
    let shift = 0;
    const to = targetIndex.value;
    if (to >= 0 && to !== from) {
      const hFrom = heights.value[ids[from]] || 0;
      if (from < to && idx > from && idx <= to) shift = -hFrom;
      else if (from > to && idx >= to && idx < from) shift = hFrom;
    }
    const moving = shift !== 0;
    return {
      transform: [
        { translateY: withSpring(shift, PUSH_SPRING) },
        { scale: withSpring(moving ? 0.98 : 1, PUSH_SPRING) },
      ],
      zIndex: 0,
      elevation: 0,
    };
  });

  const hapticTick = useCallback(() => {
    Vibration.vibrate(TICK_MS);
  }, []);

  /**
   * 编辑态长按任意位置启动拖拽（300ms，震动提示），随后磁吸跟随：
   * 卡片实时吸附到目标槽位，拖动过程中即可看到最终排列。
   */
  const handlePan = useMemo(() => {
    let g = Gesture.Pan()
      .activateAfterLongPress(ACTIVATE_MS)
      .maxPointers(1)
      .enabled(canEdit && !dragDisabled)
      .onStart(() => {
        if (activeIndex.value >= 0) return;
        const idx = orderIds.value.indexOf(item.id);
        if (idx < 0) return;
        activeIndex.value = idx;
        dragTy.value = 0;
        fingerBase.value = 0;
        targetIndex.value = idx;
        runOnJS(notifyDrag)(true);
        runOnJS(onDragBegin)();
      })
      .onUpdate((e) => {
        const from = activeIndex.value;
        if (from < 0) return;
        const t = computeTarget(from, e.translationY, orderIds.value, heights.value);
        if (t !== targetIndex.value) {
          // 换位：重置磁吸基准并轻震一下
          targetIndex.value = t;
          fingerBase.value = e.translationY;
          runOnJS(notifyDrag)(true);
          runOnJS(hapticTick)();
        }
        // 最终位置 = 目标槽位位移 + 基准内的手指微调
        const disp = slotDisplacement(from, t, orderIds.value, heights.value);
        dragTy.value = withSpring(disp + (e.translationY - fingerBase.value), SNAP_SPRING);
        // 边缘自动滚动
        const win = scrollWindow.value;
        if (win) {
          const dir =
            e.absoluteY < win.top + AUTO_EDGE
              ? -1
              : e.absoluteY > win.top + win.height - AUTO_EDGE
                ? 1
                : 0;
          if (dir !== lastAutoDir.value) {
            lastAutoDir.value = dir;
            runOnJS(setAutoDir)(dir);
          }
        }
      })
      .onFinalize(() => {
        lastAutoDir.value = 0;
        runOnJS(setAutoDir)(0);
        runOnJS(notifyDrag)(false);
        runOnJS(onDragEnd)();
        const from = activeIndex.value;
        const to = targetIndex.value;
        if (from < 0) return;
        if (to >= 0 && to !== from) {
          const ids = orderIds.value.slice();
          const [moved] = ids.splice(from, 1);
          ids.splice(to, 0, moved);
          const exact = slotDisplacement(from, to, orderIds.value, heights.value);
          dragTy.value = withSpring(exact, DROP_SPRING, (finished) => {
            if (!finished) return;
            runOnJS(commitOrder)(ids);
          });
        } else {
          dragTy.value = withSpring(0, DROP_SPRING, () => {
            activeIndex.value = -1;
            targetIndex.value = -1;
          });
        }
      });
    if (scrollGesture) {
      g = g.blocksExternalGesture(scrollGesture);
    }
    return g;
  }, [
    canEdit,
    dragDisabled,
    scrollGesture,
    activeIndex,
    dragTy,
    fingerBase,
    targetIndex,
    orderIds,
    heights,
    scrollWindow,
    lastAutoDir,
    setAutoDir,
    onDragBegin,
    onDragEnd,
    notifyDrag,
    commitOrder,
    hapticTick,
  ]);

  const editing = canEdit && !dragDisabled;

  return (
    <GestureDetector gesture={handlePan}>
      <Animated.View
        style={animatedStyle}
        collapsable={false}
        onLayout={(e) => onMeasure(item.id, e.nativeEvent.layout.height)}
      >
        {renderRow(item)}
        {editing ? (
          <>
            {/* 左侧：↑↓ 微调 + ✕ 删除 */}
            <View style={styles.leftControls} pointerEvents="box-none">
              <Pressable
                style={({ pressed }) => [
                  styles.ctrlBtn,
                  pressed && styles.ctrlBtnPressed,
                ]}
                onPress={() => moveBy(item.id, -1)}
              >
                <Text style={styles.ctrlArrow}>↑</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.ctrlBtn,
                  pressed && styles.ctrlBtnPressed,
                ]}
                onPress={() => moveBy(item.id, 1)}
              >
                <Text style={styles.ctrlArrow}>↓</Text>
              </Pressable>
              {onRemove ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.ctrlBtn,
                    styles.ctrlX,
                    pressed && styles.ctrlXPressed,
                  ]}
                  onPress={() => onRemove(item)}
                >
                  <Text style={styles.ctrlXIcon}>✕</Text>
                </Pressable>
              ) : null}
            </View>
            {/* 右侧：☰ 拖拽柄（自绘三道杠，不依赖字体渲染） */}
            <View style={styles.gripWrap} pointerEvents="box-none">
              <GestureDetector gesture={handlePan}>
                <Pressable
                  style={({ pressed }) => [
                    styles.gripBtn,
                    pressed && styles.gripBtnPressed,
                  ]}
                >
                  <View style={styles.gripBar} />
                  <View style={[styles.gripBar, styles.gripBarMid]} />
                  <View style={styles.gripBar} />
                </Pressable>
              </GestureDetector>
            </View>
          </>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

type Props = {
  items: Item[];
  canEdit: boolean;
  dragDisabled?: boolean;
  scrollGesture?: NativeGesture;
  renderRow: (item: Item) => React.ReactElement;
  onOrderChange: (orderedIds: string[]) => void;
  onDragStateChange?: (dragging: boolean) => void;
  /** 编辑态删除单条（左上 ✕） */
  onRemove?: (item: Item) => void;
  getScrollWindow?: () => ScrollWindow | null;
  onAutoScroll?: (dy: number) => void;
};

/**
 * 当天行程可排序列表。
 *
 * 编辑态：长按卡片 300ms 开始拖拽（震动反馈），卡片磁吸到目标槽位，
 * 拖动全程可见最终排列；右上角 ↑↓ 可单击微调。
 * 松手统一回调 onOrderChange 触发重新规划。
 */
export function SortableDayList({
  items,
  canEdit,
  dragDisabled = false,
  scrollGesture,
  renderRow,
  onOrderChange,
  onDragStateChange,
  onRemove,
  getScrollWindow,
  onAutoScroll,
}: Props) {
  const [order, setOrder] = useState<Item[]>(items);
  const activeIndex = useSharedValue(-1);
  const dragTy = useSharedValue(0);
  const fingerBase = useSharedValue(0);
  const targetIndex = useSharedValue(-1);
  const orderIds = useSharedValue<OrderIds>(items.map((it) => it.id));
  const heights = useSharedValue<Record<string, number>>({});
  const scrollWindow = useSharedValue<ScrollWindow | null>(null);
  const lastAutoDir = useSharedValue(0);

  const onDragStateChangeRef = useRef(onDragStateChange);
  onDragStateChangeRef.current = onDragStateChange;
  const onOrderChangeRef = useRef(onOrderChange);
  onOrderChangeRef.current = onOrderChange;

  useEffect(() => {
    setOrder(items);
    orderIds.value = items.map((it) => it.id);
  }, [items, orderIds]);

  const notifyDrag = useCallback((active: boolean) => {
    onDragStateChangeRef.current?.(active);
  }, []);

  // ---- 自动滚动 ----
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoDirRef = useRef(0);

  const stopAutoScroll = useCallback(() => {
    if (autoTimer.current) {
      clearInterval(autoTimer.current);
      autoTimer.current = null;
    }
    autoDirRef.current = 0;
  }, []);

  const setAutoDir = useCallback(
    (dir: number) => {
      if (!onAutoScroll) return;
      if (autoDirRef.current === dir) return;
      if (autoTimer.current) {
        clearInterval(autoTimer.current);
        autoTimer.current = null;
      }
      autoDirRef.current = dir;
      if (dir !== 0) {
        autoTimer.current = setInterval(() => onAutoScroll(dir * AUTO_SPEED), 16);
      }
    },
    [onAutoScroll],
  );

  const onDragBegin = useCallback(() => {
    const win = getScrollWindow?.() ?? null;
    if (win) scrollWindow.value = win;
  }, [getScrollWindow, scrollWindow]);

  const onDragEnd = useCallback(() => {
    stopAutoScroll();
    Vibration.vibrate(TICK_MS);
  }, [stopAutoScroll]);

  // 卸载兜底：务必把外层滚动解锁
  useEffect(
    () => () => {
      stopAutoScroll();
      onDragStateChangeRef.current?.(false);
    },
    [stopAutoScroll],
  );

  const commitOrder = useCallback(
    (ids: OrderIds) => {
      activeIndex.value = -1;
      targetIndex.value = -1;
      dragTy.value = 0;
      fingerBase.value = 0;
      const map = new Map<string, Item>();
      order.forEach((it) => map.set(it.id, it));
      const next = ids
        .map((id) => map.get(id))
        .filter((it): it is Item => it != null);
      setOrder(next);
      orderIds.value = ids;
      onOrderChangeRef.current?.(ids);
    },
    [order, orderIds, activeIndex, targetIndex, dragTy, fingerBase],
  );

  const moveBy = useCallback(
    (id: string, delta: number) => {
      if (activeIndex.value >= 0) return;
      const ids = orderIds.value.slice();
      const i = ids.indexOf(id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      Vibration.vibrate(TICK_MS);
      commitOrder(ids);
    },
    [orderIds, activeIndex, commitOrder],
  );

  const onMeasure = useCallback(
    (id: string, h: number) => {
      const layoutH = h + ROW_GAP;
      if (layoutH > 0 && heights.value[id] !== layoutH) {
        heights.value = { ...heights.value, [id]: layoutH };
      }
    },
    [heights],
  );

  return (
    <View>
      {order.map((item) => (
        <SortableRow
          key={item.id}
          item={item}
          canEdit={canEdit}
          dragDisabled={dragDisabled}
          scrollGesture={scrollGesture}
          renderRow={renderRow}
          activeIndex={activeIndex}
          dragTy={dragTy}
          fingerBase={fingerBase}
          targetIndex={targetIndex}
          orderIds={orderIds}
          heights={heights}
          scrollWindow={scrollWindow}
          lastAutoDir={lastAutoDir}
          onDragBegin={onDragBegin}
          onDragEnd={onDragEnd}
          setAutoDir={setAutoDir}
          moveBy={moveBy}
          onRemove={onRemove}
          onMeasure={onMeasure}
          notifyDrag={notifyDrag}
          commitOrder={commitOrder}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // 左上：↑↓ 微调 + ✕ 删除
  leftControls: {
    position: "absolute",
    top: 6,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  ctrlBtn: {
    width: 32,
    height: 27,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(33,84,63,0.20)",
    shadowColor: "#0a2540",
    shadowOpacity: 0.14,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  ctrlBtnPressed: { backgroundColor: "#DEF2E4" },
  ctrlArrow: {
    fontSize: 14,
    lineHeight: 16,
    fontWeight: "900",
    color: "#1B7A43",
    textAlign: "center",
    includeFontPadding: false,
  },
  ctrlX: { borderColor: "rgba(198,40,40,0.30)" },
  ctrlXPressed: { backgroundColor: "#FDEBEB" },
  ctrlXIcon: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "800",
    color: "#C62828",
    includeFontPadding: false,
  },
  // 右侧：☰ 拖拽柄
  gripWrap: {
    position: "absolute",
    top: 6,
    right: 8,
  },
  gripBtn: {
    width: 36,
    height: 27,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DEF2E4",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(27,122,67,0.35)",
    shadowColor: "#0a2540",
    shadowOpacity: 0.14,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
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
