/** 旅行地图：省级区域（Albers 中国投影） */

import { CHINA_PROVINCE_PATHS } from "../assets/chinaProvincePaths";

export const PROVINCE_LABELS: Record<string, string> = Object.fromEntries(
  CHINA_PROVINCE_PATHS.map((p) => [p.key, p.label]),
);

export type ProvinceRegion = (typeof CHINA_PROVINCE_PATHS)[number] & {
  paths: string[];
};

export function provinceKeyFromPrefectureId(id: string): string {
  return id.slice(0, 2);
}

export function getProvinceRegions(): ProvinceRegion[] {
  return CHINA_PROVINCE_PATHS.map((p) => ({
    ...p,
    paths: [p.path],
  }));
}
