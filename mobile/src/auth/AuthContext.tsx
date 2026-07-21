import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { User } from "@travel-guide/shared";
import { ApiError } from "@travel-guide/shared";
import { api, setStoredToken } from "../api";

const GUEST_KEY = "travel_guide_guest";
const GUEST_TRIPS_KEY = "travel_guide_guest_trips";

type AuthState = {
  user: User | null;
  isGuest: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  enterGuest: () => Promise<void>;
  logout: () => Promise<void>;
  /** 游客本次会话生成的攻略 id（本地） */
  rememberGuestTrip: (tripId: string) => Promise<void>;
  guestTripIds: string[];
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [guestTripIds, setGuestTripIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const guestFlag = await AsyncStorage.getItem(GUEST_KEY);
        if (guestFlag === "1") {
          const raw = await AsyncStorage.getItem(GUEST_TRIPS_KEY);
          const ids: string[] = raw ? JSON.parse(raw) : [];
          if (!cancelled) {
            setIsGuest(true);
            setGuestTripIds(Array.isArray(ids) ? ids : []);
            setUser(null);
          }
          return;
        }
        const me = await api.auth.me();
        if (!cancelled) {
          setUser(me);
          setIsGuest(false);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setIsGuest(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enterGuest = useCallback(async () => {
    await setStoredToken(null);
    await AsyncStorage.setItem(GUEST_KEY, "1");
    const raw = await AsyncStorage.getItem(GUEST_TRIPS_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    setGuestTripIds(Array.isArray(ids) ? ids : []);
    setUser(null);
    setIsGuest(true);
  }, []);

  const rememberGuestTrip = useCallback(async (tripId: string) => {
    setGuestTripIds((prev) => {
      const next = [tripId, ...prev.filter((id) => id !== tripId)];
      void AsyncStorage.setItem(GUEST_TRIPS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const token = await api.auth.login(username, password);
    await AsyncStorage.removeItem(GUEST_KEY);
    await setStoredToken(token.access_token);
    setIsGuest(false);
    setGuestTripIds([]);
    setUser(token.user);
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    const token = await api.auth.register(username, password);
    await AsyncStorage.removeItem(GUEST_KEY);
    await setStoredToken(token.access_token);
    setIsGuest(false);
    setGuestTripIds([]);
    setUser(token.user);
  }, []);

  const logout = useCallback(async () => {
    await setStoredToken(null);
    await AsyncStorage.removeItem(GUEST_KEY);
    setIsGuest(false);
    setUser(null);
    // 保留 guestTripIds 在本地，方便下次游客还能看到；若要清空可一并 remove
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isGuest,
        loading,
        login,
        register,
        enterGuest,
        logout,
        rememberGuestTrip,
        guestTripIds,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function formatAuthError(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "操作失败，请稍后重试";
}
