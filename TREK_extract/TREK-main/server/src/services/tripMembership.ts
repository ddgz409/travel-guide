import { db } from '../db/database';

/**
 * Add an existing user to a trip as a member, by user id.
 *
 * Idempotent and safe: it skips the trip owner and anyone who is already a
 * member, and no-ops if the trip no longer exists. Shared by trip invite-link
 * joins (#1143) and the trip-bound admin invite auto-join (#1402). The caller is
 * responsible for authenticating/creating the user first, so the id always
 * belongs to a real (non-guest) account.
 *
 * Returns whether a new membership row was actually created.
 */
export function joinTripAsMember(
  tripId: number,
  userId: number,
  invitedBy: number | null,
): { joined: boolean; tripId: number } {
  const trip = db.prepare('SELECT id, user_id FROM trips WHERE id = ?').get(tripId) as
    | { id: number; user_id: number }
    | undefined;
  if (!trip) return { joined: false, tripId };
  // The owner already has full access; never add them as a member.
  if (trip.user_id === userId) return { joined: false, tripId };
  const existing = db.prepare('SELECT id FROM trip_members WHERE trip_id = ? AND user_id = ?').get(tripId, userId);
  if (existing) return { joined: false, tripId };
  db.prepare('INSERT INTO trip_members (trip_id, user_id, invited_by) VALUES (?, ?, ?)').run(tripId, userId, invitedBy);
  return { joined: true, tripId };
}
