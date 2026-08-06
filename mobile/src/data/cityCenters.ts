/** 常见城市中心坐标（用于地图即时占位，避免等待 geocode） */

export type CityCenter = { lng: number; lat: number; name: string };

export const CITY_CENTERS: Record<string, CityCenter> = {
  北京: { lng: 116.4074, lat: 39.9042, name: "北京" },
  上海: { lng: 121.4737, lat: 31.2304, name: "上海" },
  广州: { lng: 113.2644, lat: 23.1291, name: "广州" },
  深圳: { lng: 114.0579, lat: 22.5431, name: "深圳" },
  杭州: { lng: 120.1551, lat: 30.2741, name: "杭州" },
  成都: { lng: 104.0665, lat: 30.5723, name: "成都" },
  西安: { lng: 108.9398, lat: 34.3416, name: "西安" },
  南京: { lng: 118.7969, lat: 32.0603, name: "南京" },
  苏州: { lng: 120.5853, lat: 31.299, name: "苏州" },
  重庆: { lng: 106.5516, lat: 29.563, name: "重庆" },
  武汉: { lng: 114.3055, lat: 30.5928, name: "武汉" },
  长沙: { lng: 112.9388, lat: 28.2282, name: "长沙" },
  厦门: { lng: 118.0894, lat: 24.4798, name: "厦门" },
  青岛: { lng: 120.3826, lat: 36.0671, name: "青岛" },
  大连: { lng: 121.6147, lat: 38.914, name: "大连" },
  三亚: { lng: 109.5083, lat: 18.2479, name: "三亚" },
  丽江: { lng: 100.233, lat: 26.8721, name: "丽江" },
  大理: { lng: 100.2257, lat: 25.5894, name: "大理" },
  拉萨: { lng: 91.1322, lat: 29.6604, name: "拉萨" },
  昆明: { lng: 102.8329, lat: 24.8801, name: "昆明" },
  桂林: { lng: 110.299, lat: 25.2742, name: "桂林" },
  哈尔滨: { lng: 126.535, lat: 45.8038, name: "哈尔滨" },
  呼伦贝尔: { lng: 119.7658, lat: 49.2116, name: "呼伦贝尔" },
  海拉尔: { lng: 119.7658, lat: 49.2116, name: "海拉尔" },
  海拉尔区: { lng: 119.7658, lat: 49.2116, name: "海拉尔区" },
};

export function cityCenterFor(destination: string): CityCenter | null {
  const dest = (destination || "").trim();
  if (!dest) return null;
  if (CITY_CENTERS[dest]) return CITY_CENTERS[dest];
  for (const [key, center] of Object.entries(CITY_CENTERS)) {
    if (dest.includes(key) || key.includes(dest)) return center;
  }
  return null;
}
