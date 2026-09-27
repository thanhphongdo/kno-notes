// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '@/lib/db';
import { dropUser, makeUser } from '@/lib/services/helpers';
import { pkceChallenge } from './oauth';
import {
  consumeAuthCode,
  getClient,
  issueAuthCode,
  redirectUriAllowed,
  registerClient,
} from './oauth-store';
import { checkAuthorize, readAuthorizeParams, redirectBack } from './oauth-request';

const ORIGIN = 'https://kno-notes.vercel.app';
const CB = 'https://claude.ai/api/mcp/auth_callback';

let userId = '';
beforeAll(async () => {
  userId = await makeUser('oauth_user');
});
afterAll(async () => {
  await dropUser(userId);
  await closeDb();
});

describe('registerClient', () => {
  it('issues a client id and stores the redirect URIs', async () => {
    const client = await registerClient('Claude', [CB]);
    expect(client.clientId).toMatch(/^knc_[0-9a-f]{32}$/);
    expect((await getClient(client.clientId))?.redirectUris).toEqual([CB]);
  });

  it('refuses a redirect URI that would carry the code in the clear', async () => {
    await expect(registerClient('x', ['http://example.com/cb'])).rejects.toThrow();
  });

  it('refuses an empty list', async () => {
    await expect(registerClient('x', [])).rejects.toThrow();
  });

  it('drops duplicates and names an unnamed client', async () => {
    const client = await registerClient('', [CB, CB]);
    expect(client.redirectUris).toEqual([CB]);
    expect((await getClient(client.clientId))?.name).toBe('MCP client');
  });

  it('returns null for a client id nobody registered', async () => {
    expect(await getClient('knc_does_not_exist')).toBeNull();
  });
});

describe('authorization codes', () => {
  const grant = (clientId: string) => ({
    clientId,
    userId,
    redirectUri: CB,
    codeChallenge: pkceChallenge('verifier-'.repeat(6)),
    scope: 'mcp',
    resource: `${ORIGIN}/api/mcp`,
  });

  it('can be exchanged once, and only once', async () => {
    const { clientId } = await registerClient('Claude', [CB]);
    const code = await issueAuthCode(grant(clientId));

    expect(await consumeAuthCode(code, clientId)).toMatchObject({ userId, redirectUri: CB });
    // Lần thứ hai phải trượt: chuẩn bắt mã chỉ dùng được một lần.
    expect(await consumeAuthCode(code, clientId)).toBeNull();
  });

  /** Mã của client này không được để client khác đổi. */
  it('cannot be redeemed by a different client', async () => {
    const mine = await registerClient('Mine', [CB]);
    const other = await registerClient('Other', [CB]);
    const code = await issueAuthCode(grant(mine.clientId));

    expect(await consumeAuthCode(code, other.clientId)).toBeNull();
    // ...và mã vẫn còn nguyên cho chủ thật của nó.
    expect(await consumeAuthCode(code, mine.clientId)).not.toBeNull();
  });

  it('rejects a code that was never issued', async () => {
    const { clientId } = await registerClient('Claude', [CB]);
    expect(await consumeAuthCode('kna_' + '0'.repeat(64), clientId)).toBeNull();
    expect(await consumeAuthCode('', clientId)).toBeNull();
  });

  it('carries the PKCE challenge and the resource through to the exchange', async () => {
    const { clientId } = await registerClient('Claude', [CB]);
    const g = grant(clientId);
    const used = await consumeAuthCode(await issueAuthCode(g), clientId);
    expect(used?.codeChallenge).toBe(g.codeChallenge);
    expect(used?.resource).toBe(g.resource);
  });
});

describe('checkAuthorize', () => {
  const base = readAuthorizeParams(
    new URLSearchParams({
      client_id: 'knc_x',
      redirect_uri: CB,
      response_type: 'code',
      code_challenge: 'abc',
      code_challenge_method: 'S256',
      state: 's1',
    }),
  );
  const client = { clientId: 'knc_x', name: 'Claude', redirectUris: [CB] };

  it('accepts a well-formed request', () => {
    expect(checkAuthorize(base, client, ORIGIN)).toEqual({
      kind: 'ok',
      resource: `${ORIGIN}/api/mcp`,
    });
  });

  /**
   * Hai lỗi này KHÔNG được chuyển hướng: ta không biết cái địa chỉ kia là của
   * ai, chuyển hướng tới đó là tự tay đưa mã cho người lạ.
   */
  it('refuses to redirect when the client is unknown', () => {
    expect(checkAuthorize(base, null, ORIGIN).kind).toBe('fatal');
  });

  it('refuses to redirect to an address the client never registered', () => {
    const evil = { ...base, redirectUri: 'https://evil.test/cb' };
    expect(checkAuthorize(evil, client, ORIGIN).kind).toBe('fatal');
    expect(checkAuthorize({ ...base, redirectUri: '' }, client, ORIGIN).kind).toBe('fatal');
  });

  it('sends every other error back to the client, per the spec', () => {
    expect(checkAuthorize({ ...base, responseType: 'token' }, client, ORIGIN)).toMatchObject({
      kind: 'redirect',
      error: 'unsupported_response_type',
    });
    expect(checkAuthorize({ ...base, codeChallenge: '' }, client, ORIGIN)).toMatchObject({
      kind: 'redirect',
      error: 'invalid_request',
    });
    // `plain` không bảo vệ được gì, nên chỉ nhận S256.
    expect(
      checkAuthorize({ ...base, codeChallengeMethod: 'plain' }, client, ORIGIN),
    ).toMatchObject({ kind: 'redirect', error: 'invalid_request' });
  });

  it('honours an explicit resource indicator', () => {
    const withResource = { ...base, resource: 'https://other.test/api/mcp' };
    expect(checkAuthorize(withResource, client, ORIGIN)).toEqual({
      kind: 'ok',
      resource: 'https://other.test/api/mcp',
    });
  });

  it('matches registered URIs exactly', () => {
    expect(redirectUriAllowed(client, CB)).toBe(true);
    expect(redirectUriAllowed(client, `${CB}/more`)).toBe(false);
  });
});

describe('redirectBack', () => {
  it('keeps the state so the client can detect a forged callback', () => {
    const url = new URL(redirectBack(CB, { code: 'abc' }, 's1'));
    expect(url.searchParams.get('code')).toBe('abc');
    expect(url.searchParams.get('state')).toBe('s1');
  });

  it('keeps query the client already had in its redirect URI', () => {
    const url = new URL(redirectBack('https://claude.ai/cb?keep=1', { code: 'abc' }, ''));
    expect(url.searchParams.get('keep')).toBe('1');
    expect(url.searchParams.get('code')).toBe('abc');
    expect(url.searchParams.has('state')).toBe(false);
  });
});
