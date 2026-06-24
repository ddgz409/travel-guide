// 与后端对应的类型定义

export interface User {
  id: string;
  email: string;
  nickname: string;
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

export interface TransportToNext {
  mode: string;
  distance_m: number;
  duration_s: number;
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

export interface TripPreferences {
  interests?: string[];
  budget_level?: string;
  transport?: string;
  [key: string]: unknown;
}

export interface Trip {
  id: string;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  travelers: number;
  budget_total: number | null;
  preferences: TripPreferences;
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

export interface GenerateRequest {
  destination: string;
  start_date: string;
  end_date: string;
  travelers: number;
  preferences: TripPreferences;
}
