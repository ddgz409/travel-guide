/**
 * Trip invite-link e2e — exercises /api/trips/:tripId/invite-link (manage) and
 * /api/trip-invites/:token (preview + accept) through the real JwtAuthGuard
 * against a temp SQLite db. The invite service, permission check and membership
 * join are mocked; this focuses on auth (401), trip-access 404, the share_manage
 * 403, the login-required join, and invalid-token 404s (#1143).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import type { Server } from 'http';
import { Test } from '@nestjs/testing';
import { seedUser, sessionCookie } from './harness';

const { db, canAccessTrip } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3');
  const tmp = new Database(':memory:');
  tmp.exec('PRAGMA journal_mode = WAL');
  tmp.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE, role TEXT NOT NULL DEFAULT 'user', password_version INTEGER NOT NULL DEFAULT 0);`);
  return { db: tmp, canAccessTrip: vi.fn() };
});

vi.mock('../../src/db/database', () => ({ db, canAccessTrip, closeDb: () => {}, reinitialize: () => {} }));

const { checkPermission } = vi.hoisted(() => ({ checkPermission: vi.fn() }));
vi.mock('../../src/services/permissions', () => ({ checkPermission }));

const { inviteSvc } = vi.hoisted(() => ({
  inviteSvc: {
    getTripInviteLink: vi.fn(),
    createOrRotateTripInviteLink: vi.fn(),
    deleteTripInviteLink: vi.fn(),
    resolveTripInvite: vi.fn(),
  },
}));
vi.mock('../../src/services/tripInviteService', () => inviteSvc);

const { joinTripAsMember } = vi.hoisted(() => ({ joinTripAsMember: vi.fn() }));
vi.mock('../../src/services/tripMembership', () => ({ joinTripAsMember }));

vi.mock('../../src/services/auditLog', () => ({ writeAudit: vi.fn(), getClientIp: () => '127.0.0.1' }));

import { TripInviteModule } from '../../src/nest/trip-invite/trip-invite.module';
import { TrekExceptionFilter } from '../../src/nest/common/trek-exception.filter';

describe('Trip invite-link e2e (real auth guard + temp SQLite)', () => {
  let server: Server;
  let app: Awaited<ReturnType<typeof build>>;

  async function build() {
    const moduleRef = await Test.createTestingModule({ imports: [TripInviteModule] }).compile();
    const nest = moduleRef.createNestApplication();
    nest.use(cookieParser());
    nest.useGlobalFilters(new TrekExceptionFilter());
    await nest.init();
    return nest;
  }

  beforeAll(async () => {
    seedUser(db as never, { id: 1 });
    seedUser(db as never, { id: 2, username: 'e2e-user-2', email: 'e2e-2@example.test' });
    app = await build();
    server = app.getHttpServer();
  });

  beforeEach(() => {
    canAccessTrip.mockReturnValue({ user_id: 1 });
    checkPermission.mockReturnValue(true);
    inviteSvc.getTripInviteLink.mockReset();
    inviteSvc.createOrRotateTripInviteLink.mockReset();
    inviteSvc.resolveTripInvite.mockReset();
    joinTripAsMember.mockReset();
  });

  afterAll(async () => { await app.close(); });

  // ── manage ──
  it('401 without a session cookie', async () => {
    expect((await request(server).get('/api/trips/5/invite-link')).status).toBe(401);
  });

  it('GET returns the current link for a trip member', async () => {
    inviteSvc.getTripInviteLink.mockReturnValueOnce({ token: 'abc', expires_at: null, created_at: 'now' });
    const res = await request(server).get('/api/trips/5/invite-link').set('Cookie', sessionCookie(1));
    expect(res.status).toBe(200);
    expect(res.body.token).toBe('abc');
  });

  it('GET returns { token: null } when no link exists', async () => {
    inviteSvc.getTripInviteLink.mockReturnValueOnce(null);
    const res = await request(server).get('/api/trips/5/invite-link').set('Cookie', sessionCookie(1));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ token: null });
  });

  it('POST creates/rotates the link', async () => {
    inviteSvc.createOrRotateTripInviteLink.mockReturnValueOnce({ token: 'new', expires_at: null, created_at: 'now' });
    const res = await request(server).post('/api/trips/5/invite-link').set('Cookie', sessionCookie(1)).send({});
    expect([200, 201]).toContain(res.status);
    expect(res.body.token).toBe('new');
  });

  it('403 to create without share_manage', async () => {
    checkPermission.mockReturnValue(false);
    const res = await request(server).post('/api/trips/5/invite-link').set('Cookie', sessionCookie(1)).send({});
    expect(res.status).toBe(403);
  });

  it('403 to READ the link without share_manage (token grants membership)', async () => {
    checkPermission.mockReturnValue(false);
    const res = await request(server).get('/api/trips/5/invite-link').set('Cookie', sessionCookie(1));
    expect(res.status).toBe(403);
  });

  it('404 when the trip is not accessible', async () => {
    canAccessTrip.mockReturnValue(undefined);
    const res = await request(server).get('/api/trips/5/invite-link').set('Cookie', sessionCookie(1));
    expect(res.status).toBe(404);
  });

  // ── preview + accept (login required) ──
  it('401 to preview an invite without a session (login required, never registration)', async () => {
    expect((await request(server).get('/api/trip-invites/tok')).status).toBe(401);
  });

  it('preview resolves the trip title for an authed user', async () => {
    inviteSvc.resolveTripInvite.mockReturnValueOnce({ trip_id: 9, title: 'Rome 2026' });
    const res = await request(server).get('/api/trip-invites/tok').set('Cookie', sessionCookie(2));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ trip_id: 9, title: 'Rome 2026' });
  });

  it('preview 404 for an invalid/expired token', async () => {
    inviteSvc.resolveTripInvite.mockReturnValueOnce(null);
    const res = await request(server).get('/api/trip-invites/bad').set('Cookie', sessionCookie(2));
    expect(res.status).toBe(404);
  });

  it('accept joins the current user and returns the trip id', async () => {
    inviteSvc.resolveTripInvite.mockReturnValueOnce({ trip_id: 9, title: 'Rome 2026' });
    joinTripAsMember.mockReturnValueOnce({ joined: true, tripId: 9 });
    const res = await request(server).post('/api/trip-invites/tok/accept').set('Cookie', sessionCookie(2));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ trip_id: 9, joined: true });
    expect(joinTripAsMember).toHaveBeenCalledWith(9, 2, null);
  });

  it('accept 404 for an invalid/expired token (no join attempted)', async () => {
    inviteSvc.resolveTripInvite.mockReturnValueOnce(null);
    const res = await request(server).post('/api/trip-invites/bad/accept').set('Cookie', sessionCookie(2));
    expect(res.status).toBe(404);
    expect(joinTripAsMember).not.toHaveBeenCalled();
  });

  it('401 to accept without a session', async () => {
    expect((await request(server).post('/api/trip-invites/tok/accept')).status).toBe(401);
  });
});
