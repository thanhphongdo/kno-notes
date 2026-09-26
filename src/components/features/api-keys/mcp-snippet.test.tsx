import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { McpSnippet } from './mcp-snippet';

describe('McpSnippet', () => {
  it('renders the Claude Code command against the current origin', () => {
    render(<McpSnippet baseUrl="https://kno-notes.vercel.app" onCopy={vi.fn()} />);
    expect(screen.getByText(/claude mcp add --transport http kno-notes/)).toHaveTextContent(
      'claude mcp add --transport http kno-notes https://kno-notes.vercel.app/api/mcp --header "Authorization: Bearer kn_..."',
    );
  });

  it('renders the JSON client config and the REST example', () => {
    render(<McpSnippet baseUrl="http://localhost:3000" onCopy={vi.fn()} />);
    expect(screen.getByText(/"mcpServers"/)).toHaveTextContent('http://localhost:3000/api/mcp');
    expect(screen.getByText(/curl/)).toHaveTextContent('/api/v1/notes');
  });

  it('copies a block through the supplied handler', async () => {
    const onCopy = vi.fn();
    const user = userEvent.setup();
    render(<McpSnippet baseUrl="http://localhost:3000" onCopy={onCopy} />);
    await user.click(screen.getAllByRole('button', { name: 'Sao chép' })[0]!);
    expect(onCopy).toHaveBeenCalledWith(expect.stringContaining('claude mcp add'));
  });
});
