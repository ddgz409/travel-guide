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
  Share: { token: string };
  TravelSearch: undefined;
  PortalSelect: { from: string; to: string; mode: string };
  ModelManage: undefined;
  MapFull: {
    title?: string;
    markers: Array<{ lng: number; lat: number; name: string }>;
    polyline?: number[][];
  };
  CheckInMapFull: undefined;
  FootprintOverview: undefined;
  AddFootprint: undefined;
};
