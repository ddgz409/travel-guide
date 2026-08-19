/** 收藏夹与收藏地点（本地 AsyncStorage） */

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "travel_guide_favorites:v1";
export const DEFAULT_FOLDER_ID = "default";

export type FavoritePlace = {
  id: string;
  folderId: string;
  name: string;
  city: string;
  address: string;
  lng: number;
  lat: number;
  poiId?: string;
  savedAt: string;
};

export type FavoriteFolder = {
  id: string;
  name: string;
  locked: boolean;
  createdAt: string;
};

type Store = {
  folders: FavoriteFolder[];
  places: FavoritePlace[];
};

const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

export function subscribeFavorites(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function defaultFolder(): FavoriteFolder {
  return {
    id: DEFAULT_FOLDER_ID,
    name: "默认收藏夹",
    locked: true,
    createdAt: new Date(0).toISOString(),
  };
}

async function readStore(): Promise<Store> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { folders: [defaultFolder()], places: [] };
    const parsed = JSON.parse(raw) as Store;
    const folders = Array.isArray(parsed.folders) ? parsed.folders : [];
    const places = Array.isArray(parsed.places) ? parsed.places : [];
    if (!folders.some((f) => f.id === DEFAULT_FOLDER_ID)) {
      folders.unshift(defaultFolder());
    }
    return { folders, places };
  } catch {
    return { folders: [defaultFolder()], places: [] };
  }
}

async function writeStore(store: Store): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(store));
  notify();
}

export async function listFavoriteFolders(): Promise<FavoriteFolder[]> {
  const store = await readStore();
  return store.folders;
}

export async function listFavoritePlaces(folderId?: string): Promise<FavoritePlace[]> {
  const store = await readStore();
  if (!folderId) return store.places;
  return store.places.filter((p) => p.folderId === folderId);
}

export async function createFavoriteFolder(name: string): Promise<FavoriteFolder> {
  const store = await readStore();
  const folder: FavoriteFolder = {
    id: `f_${Date.now()}`,
    name: name.trim() || "未命名收藏夹",
    locked: false,
    createdAt: new Date().toISOString(),
  };
  store.folders.push(folder);
  await writeStore(store);
  return folder;
}

export async function addFavoritePlace(
  folderId: string,
  place: Omit<FavoritePlace, "id" | "folderId" | "savedAt">,
): Promise<FavoritePlace> {
  const store = await readStore();
  const exists = store.places.some(
    (p) =>
      p.folderId === folderId &&
      p.name === place.name &&
      Math.abs(p.lng - place.lng) < 1e-5 &&
      Math.abs(p.lat - place.lat) < 1e-5,
  );
  if (exists) {
    return store.places.find(
      (p) => p.folderId === folderId && p.name === place.name,
    )!;
  }
  const next: FavoritePlace = {
    ...place,
    id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    folderId,
    savedAt: new Date().toISOString(),
  };
  store.places.push(next);
  await writeStore(store);
  return next;
}

export async function removeFavoritePlace(id: string): Promise<void> {
  const store = await readStore();
  store.places = store.places.filter((p) => p.id !== id);
  await writeStore(store);
}

export async function getFavoriteCounts(): Promise<{
  folderCount: number;
  placeCount: number;
}> {
  const store = await readStore();
  return {
    folderCount: store.folders.length,
    placeCount: store.places.length,
  };
}
