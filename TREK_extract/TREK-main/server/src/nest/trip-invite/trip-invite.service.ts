import { Injectable } from '@nestjs/common';
import { canAccessTrip } from '../../db/database';
import { checkPermission } from '../../services/permissions';
import { joinTripAsMember } from '../../services/tripMembership';
import type { User } from '../../types';
import * as svc from '../../services/tripInviteService';

type Trip = NonNullable<ReturnType<typeof canAccessTrip>>;

/**
 * Thin Nest wrapper around the trip invite-link service. Trip access and the
 * 'share_manage' permission mirror the public share link exactly (the invite
 * link lives next to it in the Share area).
 */
@Injectable()
export class TripInviteService {
  verifyTripAccess(tripId: string, userId: number) {
    return canAccessTrip(tripId, userId);
  }

  canManage(trip: Trip, user: User): boolean {
    return checkPermission('share_manage', user.role, trip.user_id, user.id, trip.user_id !== user.id);
  }

  get(tripId: string) { return svc.getTripInviteLink(tripId); }
  createOrRotate(tripId: string, userId: number, expiresInDays?: number | null) {
    return svc.createOrRotateTripInviteLink(tripId, userId, expiresInDays ?? null);
  }
  remove(tripId: string) { return svc.deleteTripInviteLink(tripId); }

  resolve(token: string) { return svc.resolveTripInvite(token); }
  /** Join the resolved trip as the current (authenticated, non-guest) user.
   *  invited_by is null — they joined via a link, not a personal invite. */
  join(tripId: number, userId: number) { return joinTripAsMember(tripId, userId, null); }
}
