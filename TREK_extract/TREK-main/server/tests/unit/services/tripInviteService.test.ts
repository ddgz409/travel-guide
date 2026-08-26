/**
 * Unit tests for tripInviteService — TRIP-INVITE-001..006.
 * Per-trip invite links (#1143): one rotating token, optional expiry, resolve.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';

const { testDb, dbMock } = vi.hoisted(() => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  return { testDb: db, dbMock: { db } };
});
vi.mock('../../../src/db/database', () => dbMock);

import { createTables } from '../../../src/db/schema';
import { runMigrations } from '../../../src/db/migrations';
import { resetTestDb } from '../../helpers/test-db';
import { createUser, createTrip } from '../../helpers/factories';
import {
  getTripInviteLink,
  createOrRotateTripInviteLink,
  deleteTripInviteLink,
  resolveTripInvite,
} from '../../../src/services/tripInviteService';

beforeAll(() => { createTables(testDb); runMigrations(testDb); });
beforeEach(() => resetTestDb(testDb));
afterAll(() => testDb.close());

function setup() {
  const { user: owner } = createUser(testDb);
  const trip = createTrip(testDb, owner.id);
  return { owner, trip };
}

describe('tripInviteService', () => {
  it('TRIP-INVITE-001: no link exists initially', () => {
    const { trip } = setup();
    expect(getTripInviteLink(trip.id)).toBeNull();
  });

  it('TRIP-INVITE-002: create returns a token and get reads it back', () => {
    const { owner, trip } = setup();
    const info = createOrRotateTripInviteLink(trip.id, owner.id);
    expect(info.token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(getTripInviteLink(trip.id)?.token).toBe(info.token);
  });

  it('TRIP-INVITE-003: rotating replaces the token and keeps a single row', () => {
    const { owner, trip } = setup();
    const first = createOrRotateTripInviteLink(trip.id, owner.id);
    const second = createOrRotateTripInviteLink(trip.id, owner.id);
    expect(second.token).not.toBe(first.token);
    const count = testDb.prepare('SELECT COUNT(*) as n FROM trip_invite_tokens WHERE trip_id = ?').get(trip.id) as { n: number };
    expect(count.n).toBe(1);
    // The old token no longer resolves.
    expect(resolveTripInvite(first.token)).toBeNull();
  });

  it('TRIP-INVITE-004: resolve returns the trip for a valid token', () => {
    const { owner, trip } = setup();
    const info = createOrRotateTripInviteLink(trip.id, owner.id);
    expect(resolveTripInvite(info.token)).toEqual({ trip_id: trip.id, title: trip.title });
  });

  it('TRIP-INVITE-005: an expired token does not resolve (ISO expiry, incl. same-day)', () => {
    const { owner, trip } = setup();
    const info = createOrRotateTripInviteLink(trip.id, owner.id);
    // Use the exact ISO-8601 format the service writes, one hour in the past —
    // this catches the lexicographic-SQL-comparison bug where a same-UTC-day
    // expiry would otherwise still resolve.
    testDb.prepare('UPDATE trip_invite_tokens SET expires_at = ? WHERE trip_id = ?')
      .run(new Date(Date.now() - 3600_000).toISOString(), trip.id);
    expect(resolveTripInvite(info.token)).toBeNull();
  });

  it('TRIP-INVITE-005b: a not-yet-expired token still resolves', () => {
    const { owner, trip } = setup();
    const info = createOrRotateTripInviteLink(trip.id, owner.id);
    testDb.prepare('UPDATE trip_invite_tokens SET expires_at = ? WHERE trip_id = ?')
      .run(new Date(Date.now() + 3600_000).toISOString(), trip.id);
    expect(resolveTripInvite(info.token)).toEqual({ trip_id: trip.id, title: trip.title });
  });

  it('TRIP-INVITE-006: delete removes the link', () => {
    const { owner, trip } = setup();
    const info = createOrRotateTripInviteLink(trip.id, owner.id);
    deleteTripInviteLink(trip.id);
    expect(getTripInviteLink(trip.id)).toBeNull();
    expect(resolveTripInvite(info.token)).toBeNull();
  });
});
