import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "travel_guide_location_consent";

export type LocationConsent = "granted" | "denied" | null;

export async function loadLocationConsent(): Promise<LocationConsent> {
  const v = await AsyncStorage.getItem(KEY);
  if (v === "granted" || v === "denied") return v;
  return null;
}

export async function saveLocationConsent(
  value: "granted" | "denied",
): Promise<void> {
  await AsyncStorage.setItem(KEY, value);
}
