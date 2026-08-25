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

/** 拖拽中被挤开卡片的让位动画：欠阻尼带明显回弹，Q 弹不散架 */
const PUSH_SPRING = { damping: 15, stiffness: 230, mass: 0.9 };
/** 松手后的归位动画：更弹一点的落位，像果冻一样墩一下 */
const DROP_SPRING = { damping: 13, stiffness: 320, mass: 0.9 };

/** 指尖进入滚动容器上下这段像素内触发自动滚动 */
const AUTO_EDGE = 72;
/** 自动滚动速度（px/帧） */
const AUTO_SPEED = 7;
/** 换位震动时长 ms */
const TICK_MS = 8;

type OrderIds = string[];

/** 根据拖拽位移，计算应插入的目标序号（UI 线程 worklet）。 */
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

export type ScrollWindow = { top: number; height: number };

type RowProps = {
  item: Item;
  canEdit: boolean;
  dragDisabled: boolean;
  /** 包裹外层竖向 ScrollView 的原生手势，用于与手柄拖拽协调 */
  scrollGesture?: NativeGesture;
  renderRow: (item: Item) => React.ReactElement;
  activeIndex: SharedValue<number>;
  dragTy: SharedValue<number>;
  targetIndex: SharedValue<number>;
  orderIds: SharedValue<OrderIds>;
  heights: SharedValue<Record<string, number>>;
  /** 滚动容器的屏幕位置（拖拽开始时由 JS 线程测量写入） */
  scrollWindow: SharedValue<ScrollWindow | null>;
  lastAutoDir: SharedValue<number>;
  onDragBegin: () => void;
  onDragEnd: () => void;
  setAutoDir: (dir: number) => void;
  moveBy: (id: string, delta: number) => void;
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
  targetIndex,
  orderIds,
  heights,
  scrollWindow,
  lastAutoDir,
  onDragBegin,
  onDragEnd,
  setAutoDir,
  moveBy,
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
      // 被拖拽的卡片跟随手指并轻微放大，强化「拿起来了」的手感
      return {
        transform: [{ translateY: dragTy.value }, { scale: 1.02 }],
        zIndex: 100,
        elevation: 12,
        opacity: 0.97,
      };
    }
    // 其余卡片被挤开/回落：欠阻尼弹簧 + 轻微压扁回弹，Q 弹的果冻手感
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
        { scale: withSpring(moving ? 0.97 : 1, PUSH_SPRING) },
      ],
      zIndex: 0,
      elevation: 0,
    };
  });

  const startDrag = useCallback(() => {
    // 纯 JS 线程函数；手势回调里必须用 runOnJS(startDrag)() 调用，
    // 直接在 worklet 里调用普通 JS 函数会静默失败（拖拽无响应的根因）
    if (activeIndex.value >= 0) return;
    const idx = orderIds.value.indexOf(item.id);
    if (idx < 0) return;
    activeIndex.value = idx;
    dragTy.value = 0;
    targetIndex.value = idx;
    Vibration.vibrate(TICK_MS);
    notifyDrag(true);
    onDragBegin();
  }, [item.id, activeIndex, orderIds, dragTy, targetIndex, notifyDrag, onDragBegin]);

  /**
   * 拖拽只从 ≡ 手柄发起：按住即拖（无长按等待），其余卡片区域保持
   * 正常的滚动与点击，彻底消除「想滚动却触发了拖拽」的手感问题。
   */
  const handlePan = useMemo(() => {
    let g = Gesture.Pan()
      .minDistance(4)
      .maxPointers(1)
      .enabled(canEdit && !dragDisabled)
      .onStart(() => {
        runOnJS(startDrag)();
      })
      .onUpdate((e) => {
        const from = activeIndex.value;
        if (from < 0) return;
        dragTy.value = e.translationY;
        targetIndex.value = computeTarget(
          from,
          e.translationY,
          orderIds.value,
          heights.value,
        );
        // 指尖贴近容器上下边缘时自动滚动（长列表一拖到底）
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
        runOnJS(onDragEnd)();
        const from = activeIndex.value;
        const to = targetIndex.value;
        if (from < 0) return;
        if (to >= 0 && to !== from) {
          // 先把卡片弹簧滑到目标槽位的视觉位置，落位动画结束后再切换数据，
          // 布局与变换同帧交换，消除「松手瞬移」的生硬感。
          const ids = orderIds.value.slice();
          const [moved] = ids.splice(from, 1);
          ids.splice(to, 0, moved);
          const hs = heights.value;
          let land = dragTy.value;
          if (to > from) {
            for (let i = from + 1; i <= to; i++) land -= hs[ids[i]] || 0;
          } else {
            for (let i = to; i < from; i++) land += hs[ids[i]] || 0;
          }
          dragTy.value = withSpring(land, DROP_SPRING, (finished) => {
            if (!finished) return;
            runOnJS(commitOrder)(ids);
          });
        } else {
          // 未跨越阈值：弹回原位
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
    targetIndex,
    orderIds,
    heights,
    scrollWindow,
    lastAutoDir,
    startDrag,
    setAutoDir,
    onDragBegin,
    onDragEnd,
    notifyDrag,
    commitOrder,
  ]);

  const editing = canEdit && !dragDisabled;

  return (
    <Animated.View
      style={animatedStyle}
      collapsable={false}
      onLayout={(e) => onMeasure(item.id, e.nativeEvent.layout.height)}
    >
      {renderRow(item)}
      {editing ? (
        <View style={styles.cluster} pointerEvents="box-none">
          <GestureDetector gesture={handlePan}>
            <Pressable
              style={[styles.clusterBtn, styles.clusterGrip]}
              disabled={dragDisabled}
              hitSlop={4}
            >
              <Text style={styles.clusterIcon}>≡</Text>
            </Pressable>
          </GestureDetector>
          <Pressable
            style={styles.clusterBtn}
            onPress={() => moveBy(item.id, -1)}
            hitSlop={4}
          >
            <Text style={styles.clusterIcon}>↑</Text>
          </Pressable>
          <Pressable
            style={styles.clusterBtn}
            onPress={() => moveBy(item.id, 1)}
            hitSlop={4}
          >
            <Text style={styles.clusterIcon}>↓</Text>
          </Pressable>
        </View>
      ) : null}
    </Animated.View>
  );
}

type Props = {
  items: Item[];
  canEdit: boolean;
  dragDisabled?: boolean;
  /** 包裹外层竖向 ScrollView 的原生手势；传入后行内拖拽会与它协调 */
  scrollGesture?: NativeGesture;
  renderRow: (item: Item) => React.ReactElement;
  onOrderChange: (orderedIds: string[]) => void;
  onDragStateChange?: (dragging: boolean) => void;
  /** 返回滚动容器在窗口中的位置（拖拽开始时调用一次）；不传则无自动滚动 */
  getScrollWindow?: () => ScrollWindow | null;
  /** 自动滚动步进：正数向下滚 */
  onAutoScroll?: (dy: number) => void;
};

/**
 * 当天行程的可排序列表。
 *
 * 编辑模式下每张卡片右侧出现操作条：
 *   ≡ 按住上下拖动（按下即拖，无需长按）
 *   ↑ / ↓ 单击微调一位
 * 拖到容器上下边缘自动滚动；拿起/换位/落下均有震动反馈。
 * 拖动过程中不发请求，松手后统一回调 onOrderChange 触发重新规划。
 */
export function SortableDayList({
  items,
  canEdit,
  dragDisabled = false,
  scrollGesture,
  renderRow,
  onOrderChange,
  onDragStateChange,
  getScrollWindow,
  onAutoScroll,
}: Props) {
  const [order, setOrder] = useState<Item[]>(items);
  const activeIndex = useSharedValue(-1);
  const dragTy = useSharedValue(0);
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

  // ---- 自动滚动（JS 线程驱动） ----
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

  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  const commitOrder = useCallback(
    (ids: OrderIds) => {
      // 同一 JS 任务内先归零全部拖拽变换、再更新顺序数据，
      // 让布局切换与变换清零在同批 UI 更新中生效，避免闪跳。
      activeIndex.value = -1;
      targetIndex.value = -1;
      dragTy.value = 0;
      const map = new Map<string, Item>();
      order.forEach((it) => map.set(it.id, it));
      const next = ids
        .map((id) => map.get(id))
        .filter((it): it is Item => it != null);
      setOrder(next);
      orderIds.value = ids;
      onOrderChangeRef.current?.(ids);
    },
    [order, orderIds, activeIndex, targetIndex, dragTy],
  );

  // ---- ↑↓ 微调 ----
  const moveBy = useCallback(
    (id: string, delta: number) => {
      if (activeIndex.value >= 0) return; // 拖拽进行中忽略
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
          targetIndex={targetIndex}
          orderIds={orderIds}
          heights={heights}
          scrollWindow={scrollWindow}
          lastAutoDir={lastAutoDir}
          onDragBegin={onDragBegin}
          onDragEnd={onDragEnd}
          setAutoDir={setAutoDir}
          moveBy={moveBy}
          onMeasure={onMeasure}
          notifyDrag={notifyDrag}
          commitOrder={commitOrder}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  cluster: {
    position: "absolute",
    right: 8,
    top: "50%",
    transform: [{ translateY: -46 }],
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.08)",
    paddingHorizontal: 2,
    paddingVertical: 3,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  clusterBtn: {
    width: 30,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  clusterGrip: { marginBottom: 1 },
  clusterIcon: { fontSize: 15, lineHeight: 18, color: "#455A64", fontWeight: "700" },
});
