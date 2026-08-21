import type { CollectionPlace } from "@travel-guide/shared";

export type AppStackParamList = {
  Main: undefined;
  Chat: {
    initialMessage?: string;
    prefillMessage?: string;
    tripId?: string;
    chatSessionId?: string;
  } | undefined;
  Trips: undefined;
  Explore: undefined;
  CityDetail: { city: string };
  TripDetail: { tripId: string };
  TripItemDetail: { tripId: string; itemId: string };
  Generate:
    | {
        destination?: string;
        interests?: string[];
        mode?: "quick" | "custom";
        startDate?: string;
        endDate?: string;
        autoSubmit?: boolean;
        chatHint?: string;
        /** 来自智能规划，侧滑返回应回到 Chat 而非主页 */
        fromSmartPlan?: boolean;
      }
    | undefined;
  Login: { next?: { screen: "Share"; token: string } } | undefined;
  Register: { next?: { screen: "Share"; token: string } } | undefined;
  Settings: undefined;
  Share: { token?: string } | undefined;
  TravelSearch: undefined;
  PortalSelect: { from: string; to: string; mode: string };
  ModelManage: undefined;
  MapFull: {
    title?: string;
    markers: Array<{ lng: number; lat: number; name: string }>;
    polyline?: number[][];
    userLocation?: { lng: number; lat: number; accuracy?: number };
  };
  CheckInMapFull: undefined;
  FootprintOverview: undefined;
  FootprintList: { kind: "country" | "city" | "place" };
  AddFootprint: undefined;
  Favorites: undefined;
  CollectionDetail: { collectionId: string };
  SharedCollections: undefined;
  /** 发帖作者主页（仅真实注册用户） */
  UserProfile: { userId: string; username?: string };
  /** 粉丝 / 关注名单 */
  FollowList: {
    userId: string;
    username: string;
    initialTab: "followers" | "following";
  };
  PublishCollection:
    | {
        collectionId?: string;
        /** 从攻略详情「一键发帖」进入：打开后自动流式填入该攻略的地点 */
        tripId?: string;
        /** AI 助手从已有攻略生成，打开后流式填入地点 */
        prefill?: {
          title: string;
          summary?: string | null;
          emoji?: string;
          destination?: string;
          places: CollectionPlace[];
        };
      }
    | undefined;
  MySubscriptions: undefined;
};
