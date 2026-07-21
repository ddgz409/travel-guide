/** Web / App 共用的领域类型（与 FastAPI / frontend/lib/types 对齐） */

export interface User {
  id: string;
  username: string;
  created_at: string;
}

export interface LlmProviderOption {
  id: string;
  label: string;
}

export interface LlmSettings {
  provider: string;
  model: string;
  base_url?: string | null;
  has_api_key: boolean;
  api_key_hint?: string | null;
  using_server_default: boolean;
  available_providers: LlmProviderOption[];
  suggested_models: Record<string, string[]>;
  defaults: { provider: string; model: string };
}

export interface LlmSettingsUpdate {
  provider?: string | null;
  model?: string | null;
  api_key?: string | null;
  /** null=不改；""=清除 */
  base_url?: string | null;
}

export interface Token {
  access_token: string;
  token_type: string;
  user: User;
}

/** Android 侧载包版本检查 */
export interface AndroidUpdateInfo {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  notes: string;
  force: boolean;
  apkAvailable: boolean;
}

export type TimeSlot = "morning" | "afternoon" | "evening";
export type ItemType = "attraction" | "meal" | "hotel" | "transport";
export type TripStatus = "generating" | "ready" | "failed";

export interface Location {
  lng: number;
  lat: number;
  address?: string;
}

export interface RouteStep {
  type: "walk" | "bus" | "drive";
  instruction?: string;
  distance_m?: number;
  line_name?: string;
  line_type?: string;
  departure_stop?: string;
  arrival_stop?: string;
  via_stops?: number;
  road?: string;
}

export interface TransportToNext {
  mode: string;
  distance_m: number;
  duration_s: number;
  detail?: RouteStep[] | null;
  departure_time?: string | null;
  arrival_time?: string | null;
  schemes?: Array<{
    distance_m: number;
    duration_s: number;
    cost?: number;
    walking_distance_m?: number;
    detail: RouteStep[];
    polyline?: number[][];
  }> | null;
  scheme_index?: number;
  polyline?: number[][] | null;
  from_location?: { lng: number; lat: number; name?: string } | null;
  to_location?: { lng: number; lat: number; name?: string } | null;
  to_name?: string;
  from_name?: string;
}

export interface Alternative {
  poi_id: string | null;
  name: string;
  location: Location | null;
  rating: number | null;
  address?: string | null;
}

export interface Item {
  id: string;
  seq: number;
  time_slot: TimeSlot;
  type: ItemType;
  name: string;
  poi_id: string | null;
  location: Location | null;
  description: string | null;
  duration_min: number | null;
  cost: number | null;
  rating: number | null;
  selected: boolean;
  alternatives: Alternative[] | null;
  transport_to_next: TransportToNext | null;
}

export interface Day {
  id: string;
  day_index: number;
  date: string;
  summary: string | null;
  items: Item[];
}

export type ExternalSource = "xiaohongshu" | "ctrip";

export interface ExternalTip {
  source: ExternalSource;
  title: string;
  snippet: string;
  url: string;
  meta?: {
    rating?: string;
    price?: string;
    likes?: string;
    portal?: boolean;
    keyword?: string;
    app_url?: string;
  } | null;
}

export interface ExternalRefs {
  xiaohongshu: ExternalTip[];
  ctrip: ExternalTip[];
}

export interface RouteOption {
  id: string;
  title: string;
  theme: string;
  tagline?: string;
  highlights?: string[];
  estimated_cost?: number;
  days?: Day[];
}

export interface TripPreferences {
  interests?: string[];
  budget_level?: string;
  transport?: string;
  selected_route_id?: string;
  route_options?: RouteOption[];
  [key: string]: unknown;
}

export interface HotelCandidate {
  name: string;
  url: string;
  score?: number;
  tags?: string[];
  good_rate?: number | null;
  open_year?: number | null;
  is_huazhu?: boolean;
  metro_distance_m?: number | null;
  avg_dist_m?: number | null;
  /** 最近具体景点名 */
  nearest_attraction?: string | null;
  /** 到最近景点的距离（米） */
  nearest_dist_m?: number | null;
}

export type HotelFetchStatus = "ok" | "amap_only";

export interface Trip {
  id: string;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  travelers: number;
  budget_total: number | null;
  preferences: TripPreferences;
  external_refs?: ExternalRefs;
  hotel_fetch_status?: HotelFetchStatus;
  hotel_candidates?: HotelCandidate[];
  status: TripStatus;
  error_msg: string | null;
  share_token: string | null;
  created_at: string;
  updated_at: string;
  days: Day[];
}

export interface TripListItem {
  id: string;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  travelers: number;
  budget_total: number | null;
  status: TripStatus;
  created_at: string;
}

export interface PoiSearchResult {
  poi_id: string;
  name: string;
  location: Location | null;
  rating: number | null;
  type: string;
  address: string;
}

export interface GenerateRequest {
  destination: string;
  start_date: string;
  end_date: string;
  travelers: number;
  preferences: TripPreferences;
  must_include?: PoiSearchResult[];
  /** 本次生成覆盖：游客/临时自带 LLM Key */
  llm?: {
    provider?: string | null;
    model?: string | null;
    api_key?: string | null;
    base_url?: string | null;
  } | null;
}

export interface QuickRecommendCard {
  id: string;
  title: string;
  tagline: string;
  external_refs: ExternalRefs;
}

export interface QuickRecommendResponse {
  destination: string;
  cards: QuickRecommendCard[];
}

export interface DayRouteSegment {
  from_item_id: string;
  to_item_id: string;
  from_name: string;
  to_name: string;
  mode: string;
  distance_m: number;
  duration_s: number;
  polyline: number[][];
  fallback?: boolean;
}

export interface DayRoutesResult {
  mode: string;
  day_id: string;
  segments: DayRouteSegment[];
  polyline?: number[][];
  stop_count?: number;
  segment_count?: number;
  expected_segments?: number;
  total_duration_s: number;
  total_distance_m: number;
}
