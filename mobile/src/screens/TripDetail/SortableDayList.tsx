import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import type { Item } from "@travel-guide/shared";

/** 行卡片之间固定间距（与 ItemListRow feedCard 的 marginBottom 一致） */
const ROW_GAP = 12;

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

type RowProps = {
  item: Item;
  canEdit: boolean;
  dragDisabled: boolean;
  renderRow: (item: Item) => React.ReactElement;
  activeIndex: SharedValue<number>;
  dragTy: SharedValue<number>;
  targetIndex: SharedValue<number>;
  orderIds: SharedValue<OrderIds>;
  heights: SharedValue<Record<string, number>>;
  onMeasure: (id: string, height: number) => void;
  notifyDrag: (active: boolean) => void;
  commitOrder: (ids: OrderIds) => void;
};

function SortableRow({
  item,
  canEdit,
  dragDisabled,
  renderRow,
  activeIndex,
  dragTy,
  targetIndex,
  orderIds,
  heights,
  onMeasure,
  notifyDrag,
  commitOrder,
}: RowProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const ids = orderIds.value;
    const idx = ids.indexOf(item.id);
    const from = activeIndex.value;
    if (idx < 0 || from < 0) {
      return { transform: [{ translateY: 0 }], zIndex: 0, elevation: 0 };
    }
    if (idx === from) {
      return {
        transform: [{ translateY: dragTy.value }],
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
    return { transform: [{ translateY: shift }], zIndex: 0, elevation: 0 };
  });

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(300)
        .enabled(canEdit && !dragDisabled)
        .onStart(() => {
          const idx = orderIds.value.indexOf(item.id);
          if (idx < 0) return;
          activeIndex.value = idx;
          dragTy.value = 0;
          targetIndex.value = idx;
          runOnJS(notifyDrag)(true);
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
        })
        .onFinalize(() => {
          const from = activeIndex.value;
          const to = targetIndex.value;
          activeIndex.value = -1;
          targetIndex.value = -1;
          dragTy.value = 0;
          if (from >= 0 && to >= 0 && to !== from) {
            const ids = orderIds.value.slice();
            const [moved] = ids.splice(from, 1);
            ids.splice(to, 0, moved);
            runOnJS(commitOrder)(ids);
          }
          runOnJS(notifyDrag)(false);
        }),
    [
      item.id,
      canEdit,
      dragDisabled,
      activeIndex,
      dragTy,
      targetIndex,
      orderIds,
      heights,
      notifyDrag,
      commitOrder,
    ],
  );

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={animatedStyle}
        collapsable={false}
        onLayout={(e) => onMeasure(item.id, e.nativeEvent.layout.height)}
      >
        {renderRow(item)}
      </Animated.View>
    </GestureDetector>
  );
}

type Props = {
  items: Item[];
  canEdit: boolean;
  dragDisabled?: boolean;
  renderRow: (item: Item) => React.ReactElement;
  onOrderChange: (orderedIds: string[]) => void;
  onDragStateChange?: (dragging: boolean) => void;
};

/**
 * 当天行程的可排序列表：长按任意行后上下拖动调整顺序。
 * 拖动过程中不发请求，松手(onFinalize)后统一回调 onOrderChange 触发重新规划。
 */
export function SortableDayList({
  items,
  canEdit,
  dragDisabled = false,
  renderRow,
  onOrderChange,
  onDragStateChange,
}: Props) {
  const [order, setOrder] = useState<Item[]>(items);
  const activeIndex = useSharedValue(-1);
  const dragTy = useSharedValue(0);
  const targetIndex = useSharedValue(-1);
  const orderIds = useSharedValue<OrderIds>(items.map((it) => it.id));
  const heights = useSharedValue<Record<string, number>>({});

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

  const commitOrder = useCallback(
    (ids: OrderIds) => {
      const map = new Map<string, Item>();
      order.forEach((it) => map.set(it.id, it));
      const next = ids
        .map((id) => map.get(id))
        .filter((it): it is Item => it != null);
      setOrder(next);
      orderIds.value = ids;
      onOrderChangeRef.current?.(ids);
    },
    [order, orderIds],
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
          renderRow={renderRow}
          activeIndex={activeIndex}
          dragTy={dragTy}
          targetIndex={targetIndex}
          orderIds={orderIds}
          heights={heights}
          onMeasure={onMeasure}
          notifyDrag={notifyDrag}
          commitOrder={commitOrder}
        />
      ))}
    </View>
  );
}
