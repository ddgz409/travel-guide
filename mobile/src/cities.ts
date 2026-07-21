/** 常用旅游城市（按拼音首字母排序） */

export type CityEntry = { name: string; letter: string };

export const CITIES: CityEntry[] = [
  { name: "北京", letter: "B" },
  { name: "成都", letter: "C" },
  { name: "重庆", letter: "C" },
  { name: "长沙", letter: "C" },
  { name: "大连", letter: "D" },
  { name: "大理", letter: "D" },
  { name: "福州", letter: "F" },
  { name: "广州", letter: "G" },
  { name: "桂林", letter: "G" },
  { name: "贵阳", letter: "G" },
  { name: "杭州", letter: "H" },
  { name: "哈尔滨", letter: "H" },
  { name: "合肥", letter: "H" },
  { name: "黄山", letter: "H" },
  { name: "济南", letter: "J" },
  { name: "昆明", letter: "K" },
  { name: "丽江", letter: "L" },
  { name: "兰州", letter: "L" },
  { name: "拉萨", letter: "L" },
  { name: "南京", letter: "N" },
  { name: "南昌", letter: "N" },
  { name: "宁波", letter: "N" },
  { name: "青岛", letter: "Q" },
  { name: "泉州", letter: "Q" },
  { name: "上海", letter: "S" },
  { name: "深圳", letter: "S" },
  { name: "苏州", letter: "S" },
  { name: "三亚", letter: "S" },
  { name: "沈阳", letter: "S" },
  { name: "天津", letter: "T" },
  { name: "太原", letter: "T" },
  { name: "武汉", letter: "W" },
  { name: "无锡", letter: "W" },
  { name: "乌鲁木齐", letter: "W" },
  { name: "厦门", letter: "X" },
  { name: "西安", letter: "X" },
  { name: "西宁", letter: "X" },
  { name: "郑州", letter: "Z" },
  { name: "珠海", letter: "Z" },
].sort((a, b) =>
  a.letter === b.letter
    ? a.name.localeCompare(b.name, "zh-CN")
    : a.letter.localeCompare(b.letter),
);

/** 按首字母分组；可按名称 / 字母过滤 */
export function citiesGrouped(filter = ""): Array<[string, string[]]> {
  const f = filter.trim().toLowerCase();
  const list = !f
    ? CITIES
    : CITIES.filter(
        (c) =>
          c.name.includes(filter.trim()) ||
          c.letter.toLowerCase() === f ||
          c.name.toLowerCase().startsWith(f),
      );
  const map = new Map<string, string[]>();
  for (const c of list) {
    const arr = map.get(c.letter) || [];
    arr.push(c.name);
    map.set(c.letter, arr);
  }
  return [...map.entries()];
}
