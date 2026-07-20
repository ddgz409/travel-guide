// 与后端对应的类型定义

export interface User {
  id: string;
  username: string;
  created_at: string;
}

export interface Token {
  access_token: string;
  token_type: string;
  user: User;
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
  type: "walk" | "bus";
  instruction?: string;
  distance_m?: number;
  line_name?: string;
  line_type?: string;
  departure_stop?: string;
  arrival_stop?: string;
  via_stops?: number;
}

export interface TransportToNext {
  mode: string;
  distance_m: number;
  duration_s: number;
  detail?: RouteStep[] | null;
  departure_time?: string | null;
  arrival_time?: string | null;
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
  } | null;
}

export interface ExternalRefs {
  xiaohongshu: ExternalTip[];
  ctrip: ExternalTip[];
}

export interface TripPreferences {
  interests?: string[];
  budget_level?: string;
  transport?: string;
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
}
