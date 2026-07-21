export type AppStackParamList = {
  Home: undefined;
  Trips: undefined;
  TripDetail: { tripId: string };
  Generate: { destination?: string; interests?: string[] } | undefined;
  Login: undefined;
  Register: undefined;
  Settings: undefined;
  Share: { token: string };
  MapFull: {
    title?: string;
    markers: Array<{ lng: number; lat: number; name: string }>;
    polyline?: number[][];
  };
};
