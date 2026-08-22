import { ApiError, type ApiClient } from "@travel-guide/shared";
import type { PoiSearchResult } from "@travel-guide/shared";

export type TripGenerateInput = {
  destination: string;
  startDate: string;
  endDate: string;
  interests?: string[];
  chatHint?: string;
  travelers?: number;
  budgetLevel?: string;
  transport?: string;
  route?: string[];
  mustInclude?: PoiSearchResult[];
  llm: {
    provider: string;
    model: string;
    api_key?: string;
    base_url?: string;
  };
};

type AuthCtx = {
  user: unknown;
  isGuest: boolean;
  enterGuest: () => Promise<void>;
  rememberGuestTrip: (id: string) => Promise<void>;
};

/** 校验目的地并创建生成中的行程，返回 tripId */
export async function submitTripGenerate(
  api: ApiClient,
  auth: AuthCtx,
  input: TripGenerateInput,
): Promise<{ tripId: string; destination: string }> {
  const dest = input.destination.trim();
  if (!dest) throw new ApiError("请输入目的地", 400);

  const check = await api.trips.validateDestination(dest);
  if (!check.valid) {
    throw new ApiError(check.message || `未找到「${dest}」`, 400);
  }
  const resolved = (check.resolved_name || dest).trim();

  let guest = auth.isGuest;
  if (!auth.user && !guest) {
    await auth.enterGuest();
    guest = true;
  }

  const payload = {
    destination: resolved,
    start_date: input.startDate,
    end_date: input.endDate,
    travelers: input.travelers ?? 2,
    ...(input.route?.length ? { route: input.route } : {}),
    preferences: {
      interests: input.interests?.length ? input.interests : ["文化", "美食"],
      budget_level: input.budgetLevel ?? "中等",
      transport: input.transport ?? "公共交通",
      ...(input.chatHint ? { chat_hint: input.chatHint } : {}),
    },
    must_include: input.mustInclude?.length ? input.mustInclude : undefined,
    llm: input.llm,
  };

  const trip = guest
    ? await api.trips.guestGenerate(payload)
    : await api.trips.generate(payload);
  if (guest) await auth.rememberGuestTrip(trip.id);
  return { tripId: trip.id, destination: resolved };
}
