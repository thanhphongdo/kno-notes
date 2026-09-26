'use client';

import { Button, Kbd } from '@/components/ui';
import { SectionLabel } from '@/components/shared';

/** The placeholder the user replaces with the key they just copied. */
export const KEY_PLACEHOLDER = 'kn_...';

export interface McpSnippetProps {
  /** Origin of the running app, so a local instance shows localhost. */
  baseUrl: string;
  onCopy: (text: string) => void;
}

/**
 * Ready-to-paste wiring for the MCP server and the REST API. The commands
 * mirror `docs/mcp.md`, which points readers back at this page.
 */
export function McpSnippet({ baseUrl, onCopy }: McpSnippetProps) {
  const blocks = [
    {
      label: 'Claude Code',
      code: `claude mcp add --transport http kno-notes ${baseUrl}/api/mcp --header "Authorization: Bearer ${KEY_PLACEHOLDER}"`,
      hint: 'Chạy trong thư mục dự án, rồi kiểm tra bằng claude mcp list.',
    },
    {
      label: 'Codex, Claude Desktop',
      code: `{
  "mcpServers": {
    "kno-notes": {
      "type": "http",
      "url": "${baseUrl}/api/mcp",
      "headers": { "Authorization": "Bearer ${KEY_PLACEHOLDER}" }
    }
  }
}`,
      hint: 'Thêm vào file cấu hình của ứng dụng rồi khởi động lại.',
    },
    {
      label: 'REST',
      code: `curl -s "${baseUrl}/api/v1/notes?page=1" -H "Authorization: Bearer ${KEY_PLACEHOLDER}"`,
      hint: 'Mọi endpoint /api/v1/* dùng chung một bearer token.',
    },
  ];

  return (
    <section className="flex flex-col gap-14">
      <SectionLabel>Kết nối trợ lý AI</SectionLabel>
      {blocks.map((block) => (
        <div key={block.label} className="flex flex-col gap-6">
          <div className="flex items-center gap-8">
            <span className="text-13 font-medium">{block.label}</span>
            <Button
              variant="ghost"
              size="30"
              icon="copy"
              onClick={() => onCopy(block.code)}
              className="ml-auto px-8"
            >
              Sao chép
            </Button>
          </div>
          <pre className="m-0 overflow-x-auto rounded-10 border border-line bg-surface2 py-12 px-14 font-mono text-12 leading-[1.6]">
            {block.code}
          </pre>
          <span className="text-12 text-faint">
            {block.hint} Thay <Kbd bare>{KEY_PLACEHOLDER}</Kbd> bằng key vừa tạo.
          </span>
        </div>
      ))}
    </section>
  );
}
