import { db } from '../db/database';
import crypto from 'crypto';

/**
 * Per-trip invite links (#1143).
 *
 * A trip has at most ONE invite token (mirrors the public share link: one
 * rotating token per trip). Unlike the share link, this one is NOT public —
 * opening it only does something for a logged-in user with an existing account,
 * who is then added to the trip as a member. Rotating or disabling the link
 * immediately invalidates the old URL.
 */

export interface TripInviteInfo {
  token: string;
  expires_at: string | null;
  created_at: string;
}

/** The current invite link for a trip, or null if none exists. */
export function getTripInviteLink(tripId: string | number): TripInviteInfo | null {
  const row = db
    .prepare('SELECT token, expires_at, created_at FROM trip_invite_tokens WHERE trip_id = ?')
    .get(tripId) as { token: string; expires_at: string | null; created_at: string } | undefined;
  return row ? { token: row.token, expires_at: row.expires_at, created_at: row.created_at } : null;
}

/**
 * Create the trip's invite link, or rotate it to a fresh token (there is only
 * ever one row per trip). An optional expiry (days) can bound the link's life.
 */
export function createOrRotateTripInviteLink(
  tripId: string | number,
  createdBy: number,
  expiresInDays?: number | null,
): TripInviteInfo {
  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt =
    expiresInDays && expiresInDays > 0
      ? new Date(Date.now() + expiresInDays * 86400000).toISOString()
      : null;

  const existing = db.prepare('SELECT id FROM trip_invite_tokens WHERE trip_id = ?').get(tripId);
  if (existing) {
    db.prepare(
      'UPDATE trip_invite_tokens SET token = ?, expires_at = ?, created_by = ?, created_at = CURRENT_TIMESTAMP WHERE trip_id = ?',
    ).run(token, expiresAt, createdBy, tripId);
  } else {
    db.prepare(
      'INSERT INTO trip_invite_tokens (trip_id, token, created_by, expires_at) VALUES (?, ?, ?, ?)',
    ).run(tripId, token, createdBy, expiresAt);
  }
  return getTripInviteLink(tripId)!;
}

/** Remove the trip's invite link entirely (disable). */
export function deleteTripInviteLink(tripId: string | number): void {
  db.prepare('DELETE FROM trip_invite_tokens WHERE trip_id = ?').run(tripId);
}

/**
 * Resolve an invite token to its (still-existing, unexpired) trip. Returns null
 * for unknown/expired tokens. Only ever called for an authenticated user, so the
 * trip title is safe to return for the join confirmation screen; an anonymous
 * caller never reaches this (the endpoint is JWT-guarded).
 */
export function resolveTripInvite(token: string): { trip_id: number; title: string } | null {
  const row = db
    .prepare(
      `SELECT t.id AS trip_id, t.title AS title, ti.expires_at AS expires_at
       FROM trip_invite_tokens ti
       JOIN trips t ON ti.trip_id = t.id
       WHERE ti.token = ?`,
    )
    .get(token) as { trip_id: number; title: string; expires_at: string | null } | undefined;
  if (!row) return null;
  // Check expiry in JS, not SQL: expires_at is stored as an ISO-8601 string
  // (…T…Z) which does not compare lexicographically against SQLite's
  // space-separated datetime('now'), so a SQL `>` would keep an expired link
  // alive until the end of the day. Mirrors the admin-invite validation.
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
  return { trip_id: row.trip_id, title: row.title };
}
