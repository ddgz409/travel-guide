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
  share_mode?: "read" | "collab";
  can_edit?: boolean;
  collaborators?: Collaborator[];
  created_at: string;
  updated_at: string;
  days: Day[];
}

export interface Collaborator {
  user_id: string;
  username: string;
  role: "owner" | "collaborator";
  joined_at?: string | null;
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
  tel?: string;
  opentime?: string;
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

export interface ValidateDestinationResult {
  valid: boolean;
  message: string;
  resolved_name?: string | null;
  suggestions: string[];
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

// ---- AI 聊天助手 ----

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
};

export type ChatLlmOverride = {
  provider?: string;
  model?: string;
  api_key?: string;
  base_url?: string;
  web_search?: boolean | "auto" | "on" | "off";
};

export type ChatRequest = {
  messages: ChatMessage[];
  trip_id?: string | null;
  llm?: ChatLlmOverride | null;
};

export type OptimizePlanQueryRequest = {
  keywords: string;
  destination: string;
  days: number;
  start_date: string;
  end_date: string;
  llm?: ChatLlmOverride | null;
};

export type OptimizePlanQueryResponse = {
  query: string;
};

export type GenerateProgressEvent = {
  status?: string;
  phase?: string;
  message?: string;
  preview?: string;
  readable?: string;
  done?: boolean;
  error_msg?: string | null;
};

// ---- 城市探索 ----

export interface CityFood {
  name: string;
  desc: string;
  /** 小红书笔记封面（列表缩略图） */
  image?: string;
  /** 详情页图集，最多 3 张 */
  images?: string[];
  lng?: number;
  lat?: number;
  address?: string;
}

export interface CitySpot {
  name: string;
  desc: string;
  image?: string;
  images?: string[];
  lng?: number;
  lat?: number;
  address?: string;
}

export interface PlaceImagesResult {
  city: string;
  name: string;
  kind: string;
  image?: string | null;
  images: string[];
}

export interface CityInfo {
  city: string;
  foods: CityFood[];
  spots: CitySpot[];
}

/** 城市真实信息 SSE 流事件 */
export type CityInfoStreamEvent =
  | { type: "status"; phase: string; message: string }
  | { type: "preview"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "result"; data: CityInfo }
  | { type: "error"; message: string };

export interface RegeoResult {
  city: string;
  province: string;
  adcode: string;
}

/** 共享收藏夹地点 */
export interface CollectionPlace {
  name: string;
  city: string;
  address?: string;
  lng?: number | null;
  lat?: number | null;
  poi_id?: string | null;
  note?: string | null;
}

export interface CollectionSummary {
  id: string;
  title: string;
  summary?: string | null;
  emoji: string;
  city?: string | null;
  author_display: string;
  /** 真实注册用户作者的 user_id；系统预置/游客帖子为 null */
  author_id?: string | null;
  place_count: number;
  subscriber_count: number;
  subscribed: boolean;
  is_owner: boolean;
  cover_places: CollectionPlace[];
  created_at: string;
}

export interface CollectionDetail extends CollectionSummary {
  places: CollectionPlace[];
  is_owner: boolean;
}

export interface CollectionListResponse {
  items: CollectionSummary[];
  total: number;
}

/** 用户主页（公开） */
export interface UserProfile {
  id: string;
  username: string;
  follower_count: number;
  following_count: number;
  post_count: number;
  is_following: boolean;
  is_self: boolean;
}

/** 粉丝 / 关注名单里的用户简档 */
export interface UserBrief {
  id: string;
  username: string;
}

export interface FollowListResponse {
  items: UserBrief[];
  total: number;
}

export interface CollectionCreatePayload {
  title: string;
  summary?: string | null;
  emoji?: string;
  city?: string | null;
  places: CollectionPlace[];
}
