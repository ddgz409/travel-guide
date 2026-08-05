export type AppStackParamList = {
  Main: undefined;
  Chat: undefined;
  Trips: undefined;
  Explore: undefined;
  CityDetail: { city: string };
  TripDetail: { tripId: string };
  Generate: { destination?: string; interests?: string[] } | undefined;
  Login: undefined;
  Register: undefined;
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
};
