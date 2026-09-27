// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ACCESS_TOKEN_TTL_SEC,
  MCP_SCOPE,
  authorizationServerMetadata,
  hashAuthCode,
  isAllowedRedirectUri,
  matchRedirectUri,
  newAuthCode,
  newClientId,
  originOf,
  pkceChallenge,
  protectedResourceMetadata,
  signAccessToken,
  signRefreshToken,
  verifyPkce,
  verifyToken,
  wwwAuthenticate,
} from './oauth';
import { signSession } from './jwt';

const ORIGIN = 'https://kno-notes.vercel.app';
const claims = {
  userId: 'u1',
  clientId: 'knc_abc',
  resource: `${ORIGIN}/api/mcp`,
  scope: MCP_SCOPE,
};

let savedSecret: string | undefined;
beforeAll(() => {
  savedSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = 'test-secret-for-oauth-unit-tests-0000000';
});
afterAll(() => {
  if (savedSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = savedSecret;
});

describe('PKCE', () => {
  /** Vector trong phụ lục B của RFC 7636. */
  it('matches the S256 example from the RFC', () => {
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('accepts the verifier it was derived from and nothing else', () => {
    const verifier = 'a'.repeat(64);
    expect(verifyPkce(verifier, pkceChallenge(verifier))).toBe(true);
    expect(verifyPkce('b'.repeat(64), pkceChallenge(verifier))).toBe(false);
  });

  it('refuses empty input rather than treating it as a match', () => {
    expect(verifyPkce('', '')).toBe(false);
    expect(verifyPkce('x', '')).toBe(false);
    expect(verifyPkce('', 'y')).toBe(false);
  });
});

describe('redirect URI', () => {
  it('allows https anywhere', () => {
    expect(isAllowedRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true);
  });

  /** Client chạy trên máy người dùng nhận mã qua một cổng cục bộ. */
  it('allows http only on the loopback host', () => {
    expect(isAllowedRedirectUri('http://localhost:6274/oauth/callback')).toBe(true);
    expect(isAllowedRedirectUri('http://127.0.0.1:8080/cb')).toBe(true);
    expect(isAllowedRedirectUri('http://example.com/cb')).toBe(false);
  });

  it('refuses anything that is not http(s), and anything malformed', () => {
    expect(isAllowedRedirectUri('javascript:alert(1)')).toBe(false);
    expect(isAllowedRedirectUri('ftp://example.com/cb')).toBe(false);
    expect(isAllowedRedirectUri('not a url')).toBe(false);
    expect(isAllowedRedirectUri('')).toBe(false);
  });

  it('refuses a fragment, which has no business in a redirect_uri', () => {
    expect(isAllowedRedirectUri('https://claude.ai/cb#x')).toBe(false);
  });

  /**
   * So khớp lỏng là cách kinh điển để mã uỷ quyền bị gửi đi nơi khác, nên
   * phải là so sánh chuỗi tuyệt đối.
   */
  it('matches registered URIs exactly, never by prefix', () => {
    const registered = ['https://claude.ai/api/mcp/auth_callback'];
    expect(matchRedirectUri(registered, 'https://claude.ai/api/mcp/auth_callback')).toBe(true);
    expect(matchRedirectUri(registered, 'https://claude.ai/api/mcp/auth_callback/evil')).toBe(false);
    expect(matchRedirectUri(registered, 'https://claude.ai/api/mcp/auth_callback?x=1')).toBe(false);
    expect(matchRedirectUri(registered, 'https://evil.test/cb')).toBe(false);
  });
});

describe('identifiers', () => {
  it('gives every client and code a distinct value', () => {
    expect(new Set(Array.from({ length: 50 }, newClientId)).size).toBe(50);
    expect(new Set(Array.from({ length: 50 }, newAuthCode)).size).toBe(50);
  });

  it('hashes a code deterministically and does not return the code itself', () => {
    const code = newAuthCode();
    expect(hashAuthCode(code)).toBe(hashAuthCode(code));
    expect(hashAuthCode(code)).not.toContain(code);
    expect(hashAuthCode(code)).toHaveLength(64);
  });
});

describe('tokens', () => {
  it('round-trips an access token', async () => {
    const token = await signAccessToken(claims);
    expect(await verifyToken(token, 'at')).toMatchObject(claims);
  });

  /**
   * Access token và refresh token cùng chữ ký, nên chỉ có trường `typ` ngăn
   * một refresh token được dùng thẳng làm bearer.
   */
  it('refuses a refresh token where an access token is expected, and vice versa', async () => {
    expect(await verifyToken(await signRefreshToken(claims), 'at')).toBeNull();
    expect(await verifyToken(await signAccessToken(claims), 'rt')).toBeNull();
  });

  /** Cookie phiên cũng ký bằng AUTH_SECRET — nó KHÔNG được là bearer token. */
  it('refuses a session cookie presented as a bearer token', async () => {
    const session = await signSession({ id: 'u1', username: 'a', displayName: 'A' });
    expect(await verifyToken(session, 'at')).toBeNull();
  });

  it('refuses a token signed with a different secret', async () => {
    const token = await signAccessToken(claims);
    process.env.AUTH_SECRET = 'a-completely-different-secret-0000000000';
    try {
      expect(await verifyToken(token, 'at')).toBeNull();
    } finally {
      process.env.AUTH_SECRET = 'test-secret-for-oauth-unit-tests-0000000';
    }
  });

  it('refuses rubbish without throwing', async () => {
    expect(await verifyToken('', 'at')).toBeNull();
    expect(await verifyToken('not.a.jwt', 'at')).toBeNull();
    expect(await verifyToken('kn_0123456789abcdef0123456789abcdef', 'at')).toBeNull();
  });

  it('keeps the audience so a token cannot be replayed at another resource', async () => {
    const token = await signAccessToken({ ...claims, resource: 'https://elsewhere.test/api/mcp' });
    expect((await verifyToken(token, 'at'))?.resource).toBe('https://elsewhere.test/api/mcp');
  });

  it('expires access tokens within the hour', () => {
    expect(ACCESS_TOKEN_TTL_SEC).toBeLessThanOrEqual(3600);
  });
});

describe('metadata documents', () => {
  it('points a client at this origin, not a hard-coded one', () => {
    const doc = protectedResourceMetadata('https://preview-123.vercel.app');
    expect(doc.resource).toBe('https://preview-123.vercel.app/api/mcp');
    expect(doc.authorization_servers).toEqual(['https://preview-123.vercel.app']);
  });

  it('advertises only what the server actually implements', () => {
    const doc = authorizationServerMetadata(ORIGIN);
    expect(doc.issuer).toBe(ORIGIN);
    expect(doc.authorization_endpoint).toBe(`${ORIGIN}/oauth/authorize`);
    expect(doc.token_endpoint).toBe(`${ORIGIN}/api/oauth/token`);
    expect(doc.registration_endpoint).toBe(`${ORIGIN}/api/oauth/register`);
    expect(doc.response_types_supported).toEqual(['code']);
    expect(doc.grant_types_supported).toEqual(['authorization_code', 'refresh_token']);
    // PKCE bắt buộc, và chỉ S256: `plain` không bảo vệ được gì.
    expect(doc.code_challenge_methods_supported).toEqual(['S256']);
    expect(doc.token_endpoint_auth_methods_supported).toEqual(['none']);
  });

  it('sends a 401 that tells the client where the metadata lives', () => {
    expect(wwwAuthenticate(ORIGIN)).toContain(
      `resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource"`,
    );
  });
});

describe('originOf', () => {
  it('trusts the proxy headers Vercel sets', () => {
    const req = new Request('http://internal.local/api/mcp', {
      headers: { 'x-forwarded-host': 'kno-notes.vercel.app', 'x-forwarded-proto': 'https' },
    });
    expect(originOf(req)).toBe(ORIGIN);
  });

  it('falls back to the request URL when there is no proxy', () => {
    expect(originOf(new Request('http://127.0.0.1:3000/api/mcp'))).toBe('http://127.0.0.1:3000');
  });
});
