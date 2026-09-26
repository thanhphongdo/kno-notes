// src/app/api/mcp/route.ts
// MCP Streamable HTTP endpoint. Auth = `Authorization: Bearer <api key>`
// (the same keys `/api/v1` uses), so rate limiting and user scoping are shared.
import type { ZodRawShape } from 'zod';
import { createMcpHandler } from 'mcp-handler';
import { requireBearer } from '@/lib/api/bearer';
import { HttpError, jsonError } from '@/lib/http';
import { TOOLS, type McpTool } from '@/lib/mcp/tools';
import type { SessionUser } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Người dùng hiện tại cho lần gọi này. AsyncLocalStorage là quá mức cần thiết:
 * handler được dựng lại cho MỖI request nên biến đóng là đủ và an toàn.
 */
function buildHandler(user: SessionUser) {
  return createMcpHandler(
    (server) => {
      for (const tool of TOOLS as McpTool[]) {
        const shape = (tool.inputSchema as unknown as { shape?: ZodRawShape }).shape ?? {};
        server.registerTool(
          tool.name,
          { description: tool.description, inputSchema: shape },
          async (args: unknown) => {
            try {
              const input = tool.inputSchema.parse(args ?? {});
              const out = await tool.run(user.id, input);
              return {
                content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }],
              };
            } catch (e) {
              const message =
                e instanceof HttpError ? e.message : 'Đã có lỗi xảy ra. Vui lòng thử lại.';
              if (!(e instanceof HttpError)) console.error('[mcp]', e);
              return { content: [{ type: 'text' as const, text: message }], isError: true };
            }
          },
        );
      }
    },
    { serverInfo: { name: 'kno-notes', version: '1.0.0' } },
    {
      basePath: '/api',
      maxDuration: 60,
      verboseLogs: false,
      // SSE would need Redis (a paid service); Streamable HTTP is stateless.
      disableSse: true,
    },
  );
}

async function withAuth(req: Request): Promise<Response> {
  let user: SessionUser;
  try {
    user = await requireBearer(req);
  } catch (e) {
    if (e instanceof HttpError) {
      const res = jsonError(e.status, e.code, e.message);
      if (e.status === 401) {
        res.headers.set('WWW-Authenticate', 'Bearer realm="kno-notes"');
      }
      return res;
    }
    return jsonError(500, 'INTERNAL', 'Đã có lỗi xảy ra.');
  }
  return buildHandler(user)(req);
}

export const GET = withAuth;
export const POST = withAuth;
export const DELETE = withAuth;
