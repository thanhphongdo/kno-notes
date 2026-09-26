# Kno-Notes MCP server

**Endpoint:** `https://kno-notes.vercel.app/api/mcp` (MCP Streamable HTTP, stateless)
**Auth:** `Authorization: Bearer <api key>`
**Protocol:** JSON-RPC 2.0 over HTTP POST; responses stream as `text/event-stream`

Everything the server exposes is scoped to the key's owner. A key can never
read, write, or even confirm the existence of another user's note — cross-user
requests return **404**, never 403, so the response cannot leak that a note
exists.

---

## 1. Create an API key

### In the app

1. Sign in at <https://kno-notes.vercel.app> (`bacsi` / `123456` on a fresh seed).
2. Go to **Cài đặt → API keys** (`/settings/api-keys`).
3. **Tạo khoá mới**, give it a name you will recognise later ("Claude Code", "Codex").
4. **Copy the key immediately.** It looks like `kn_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d`
   and is shown **once** — the server stores only its sha256 hash, so it cannot
   be recovered or re-displayed. Lost it? Revoke and create another.

### From the command line

```bash
# against the running app, with a session cookie
curl -s -X POST https://kno-notes.vercel.app/api/api-keys \
  -b cookies.txt -H 'Content-Type: application/json' \
  -d '{"name":"Claude Code"}' | jq -r .key

# or locally, straight against the database
npx tsx scripts/make-key.ts bacsi "Claude Code"
```

Manage keys with `GET /api/api-keys` (list — prefix and `lastUsedAt` only, never
the key) and `DELETE /api/api-keys/:id` (revoke, effective immediately).

---

## 2. Connect a client

### Claude Code

```bash
claude mcp add --transport http kno-notes https://kno-notes.vercel.app/api/mcp \
  --header "Authorization: Bearer kn_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d"
```

Local development:

```bash
claude mcp add --transport http kno-notes-dev http://localhost:3000/api/mcp \
  --header "Authorization: Bearer kn_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d"
```

Verify with `claude mcp list` — it should report `kno-notes: connected`.

### Codex, Claude Desktop and other JSON-configured clients

```json
{
  "mcpServers": {
    "kno-notes": {
      "type": "http",
      "url": "https://kno-notes.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer kn_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d"
      }
    }
  }
}
```

For a client that only speaks stdio, bridge it:

```json
{
  "mcpServers": {
    "kno-notes": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "https://kno-notes.vercel.app/api/mcp",
        "--header", "Authorization: Bearer kn_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d"
      ]
    }
  }
}
```

### Raw HTTP

```bash
curl -s -X POST https://kno-notes.vercel.app/api/mcp \
  -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

The `Accept` header **must** include `text/event-stream`. A missing or invalid
key returns `401` with `WWW-Authenticate: Bearer realm="kno-notes"` and the
standard error envelope.

---

## 3. Tools

Nine tools, in registration order.

### `list_notes`

Paginated note summaries. Summaries come from the Postgres index and carry no
HTML body — use `get_note` for content.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `query` | string | no | Keyword. `#` prefix searches tags only. |
| `tag` | string | no | Exact tag name, e.g. `"Tim mạch"`. |
| `priority` | `"high" \| "medium" \| "low"` | no | |
| `favorite` | boolean | no | Only favourited notes. |
| `sort` | `"updated" \| "priority" \| "title"` | no | Default `"updated"`. `"title"` uses Vietnamese collation. |
| `page` | integer ≥ 1 | no | Default 1. Out-of-range clamps to the last page. |
| `pageSize` | integer 1–100 | no | Default 6. |

Returns `{ notes, total, page, pages, pageSize }`, each note being
`{ id, title, desc, tags, priority, fav, created, updated, latestVersion, imageCount, commentCount, quizCount }`.

### `search_notes`

Same shape as `list_notes` but `query` is **required**. Matching is
accent-insensitive over title, description and tags: `"dai thao duong"` finds
*"Đái tháo đường"*, and `đ`/`Đ` normalise to `d`. A `#` prefix restricts the
match to tags — `"#phac do"` will not match a note that only has *"Phác đồ"* in
its title.

### `get_note`

`{ id: string }` → `{ note }` with the full record: `content` (HTML), `tags`,
`images`, `comments`, `versions` (complete history) and `quizzes` (newest first).

### `create_note`

| Field | Type | Required | Meaning |
|---|---|---|---|
| `title` | string 1–300 | **yes** | |
| `desc` | string ≤ 1000 | no | Short summary on the note card. |
| `tags` | string[] ≤ 20 | no | e.g. `["Tim mạch", "Phác đồ"]`. |
| `priority` | `"high" \| "medium" \| "low"` | no | Default `"medium"`. |
| `content` | string ≤ 400 000 | no | HTML: `h2`, `h3`, `p`, `ul`/`ol`/`li`, `blockquote`, `table`, `strong`, `em`. |
| `changeNote` | string ≤ 200 | no | Default `"Tạo ghi chú"`. |

Creates at **v1** and returns `{ note, version }`.

> Use `<h2>` headings generously. The offline quiz generator builds its
> questions from `<h2>`/`<h3>` sections, so a note with no headings and no tags
> cannot produce a quiz at all.

### `update_note`

`{ id }` plus any of `title`, `desc`, `tags`, `priority`, `content`,
`changeNote`. **Only the fields you pass change**; everything else is carried
over from the current note. Returns `{ note, version }`.

The version number increments **only when `title` or `content` actually
changes.** Editing the description, tags, priority or image list updates
`updated` but creates no new version. Default change note: `"Cập nhật nội dung"`.

### `delete_note`

`{ id }` → `{ ok: true }`. Permanent: removes the stored JSON, the index row,
and with them every version, comment and quiz record.

### `list_tags`

No arguments. Returns `{ tags: [{ name, slug, count }] }`, most-used first, then
Vietnamese alphabetical. `slug` is the accent-free form (`"Tim mạch"` →
`"tim-mach"`).

### `create_quiz`

`{ id }` → `{ quiz, source }`. Generates questions from the note's content and
**stores them in the note's quiz history**. `source` is `"ai"` when Gemini
answered and `"offline"` when the built-in generator did (no API key, or Gemini
failed or returned fewer than three valid questions).

The stored record has `score: 0` and `picks: [null, …]` because nobody has
answered yet — it is a generated paper, not a result. A human answering it in
the web UI creates a separate record with real picks and a computed score.

Errors with *"Ghi chú chưa đủ nội dung để tạo câu hỏi"* when the note has no
headings to build from and fewer than three foreign tags to fall back on.

### `list_quizzes`

`{ id }` → `{ quizzes }`, newest first. Each is
`{ id, date, score, total, source, picks, questions }`, where each question is
`{ q, options (exactly 4), answer (0–3), explain }`.

---

## 4. Worked example: create a note, then attach a quiz

Told *"save my hypertension protocol and quiz me on it"*, an agent does this.

**Step 1 — create the note.** Structure it with `<h2>` sections so the quiz
generator has material:

```json
{
  "name": "create_note",
  "arguments": {
    "title": "Phác đồ điều trị tăng huyết áp ở người lớn",
    "desc": "Ngưỡng chẩn đoán, mục tiêu huyết áp và trình tự lựa chọn thuốc.",
    "tags": ["Tim mạch", "Phác đồ"],
    "priority": "high",
    "content": "<h2>Ngưỡng chẩn đoán</h2><ul><li>HA phòng khám ≥ 140/90 mmHg</li><li>HA tại nhà trung bình ≥ 135/85 mmHg</li><li>Holter 24 giờ trung bình ≥ 130/80 mmHg</li></ul><h2>Mục tiêu điều trị</h2><ul><li>Đa số bệnh nhân: &lt; 130/80 mmHg nếu dung nạp tốt</li><li>Người ≥ 80 tuổi: chấp nhận 140–150 mmHg tâm thu</li></ul><h2>Lựa chọn thuốc khởi đầu</h2><ol><li>Phối hợp hai thuốc liều thấp: ACEi/ARB + CCB hoặc lợi tiểu</li><li>Chưa đạt mục tiêu: tăng lên liều đầy đủ</li><li>Kháng trị: thêm spironolacton 25–50 mg</li></ol>"
  }
}
```

Result — note the returned `id`, you need it for every following call:

```json
{ "note": { "id": "nmui4b2x8k1a", "title": "Phác đồ điều trị tăng huyết áp ở người lớn", "...": "..." }, "version": 1 }
```

**Step 2 — generate and attach the quiz:**

```json
{ "name": "create_quiz", "arguments": { "id": "nmui4b2x8k1a" } }
```

```json
{
  "source": "offline",
  "quiz": {
    "id": "qmui4b45a188",
    "date": "2026-09-26T08:20:14.882Z",
    "score": 0,
    "total": 4,
    "source": "offline",
    "picks": [null, null, null, null],
    "questions": [
      {
        "q": "Theo ghi chú, nội dung nào dưới đây thuộc mục “Mục tiêu điều trị”?",
        "options": [
          "Đa số bệnh nhân: < 130/80 mmHg nếu dung nạp tốt",
          "Holter 24 giờ trung bình ≥ 130/80 mmHg",
          "Kháng trị: thêm spironolacton 25–50 mg",
          "HA phòng khám ≥ 140/90 mmHg"
        ],
        "answer": 0,
        "explain": "Mục “Mục tiêu điều trị” ghi: Đa số bệnh nhân: < 130/80 mmHg nếu dung nạp tốt"
      }
    ]
  }
}
```

**Step 3 — read it back later:**

```json
{ "name": "list_quizzes", "arguments": { "id": "nmui4b2x8k1a" } }
```

**Step 4 — revise the note.** Only the fields you pass change, and because
`content` differs the note goes to v2 while `title`, `tags` and `priority`
survive untouched:

```json
{
  "name": "update_note",
  "arguments": {
    "id": "nmui4b2x8k1a",
    "content": "<h2>Ngưỡng chẩn đoán</h2><p>…bản cập nhật…</p>",
    "changeNote": "Cập nhật theo khuyến cáo mới"
  }
}
```

---

## 5. REST fallback — `/api/v1`

Clients without MCP support use the same API keys against a plain REST surface.
Identical auth, identical rate limit, identical error envelope, same services
underneath.

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET` | `/api/v1/notes?q&tag&priority&fav&sort&page&pageSize` | — | `{ notes, total, page, pages, pageSize }` |
| `POST` | `/api/v1/notes` | `{ title, desc, tags, priority, content, images, changeNote? }` | `{ note, version }` |
| `GET` | `/api/v1/notes/:id` | — | `{ note }` |
| `PATCH` | `/api/v1/notes/:id` | same as POST | `{ note, version }` |
| `DELETE` | `/api/v1/notes/:id` | — | `{ ok: true }` |
| `GET` | `/api/v1/notes/:id/quizzes` | — | `{ quizzes }` |
| `POST` | `/api/v1/notes/:id/quizzes` | `{ score, total, source, picks, questions }` | `{ quiz, note }` |
| `POST` | `/api/v1/notes/:id/comments` | `{ text }` | `{ comment, note }` |
| `GET` | `/api/v1/tags` | — | `{ tags }` |

```bash
KEY=kn_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d

# accent-insensitive search
curl -s -H "Authorization: Bearer $KEY" \
  'https://kno-notes.vercel.app/api/v1/notes?q=dai%20thao%20duong'

# create a note
curl -s -X POST -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Ghi chú mới","desc":"","tags":["Tim mạch"],"priority":"medium","content":"<h2>A</h2><p>một</p>","images":[]}' \
  https://kno-notes.vercel.app/api/v1/notes
```

`PATCH /api/v1/notes/:id` takes the **whole** note body, unlike the MCP
`update_note` tool, which merges. Send every field you want to keep.

Note that `/api/v1` has no `create_quiz` equivalent: quiz *generation* lives on
the cookie-session route `POST /api/notes/:id/quiz/generate`. Over `/api/v1` you
can read and record quizzes, but generating one is MCP-only.

---

## 6. Errors

Every non-2xx response uses one envelope:

```json
{ "error": { "code": "NOT_FOUND", "message": "Không tìm thấy ghi chú." } }
```

| Code | Status | When |
|---|---|---|
| `UNAUTHORIZED` | 401 | missing, malformed or revoked key |
| `INVALID_INPUT` | 400 | body failed schema validation |
| `NOT_FOUND` | 404 | no such note **or the caller does not own it** |
| `CONFLICT` | 409 | concurrent write to the same note lost three retries |
| `NOT_ENOUGH_CONTENT` | 422 | the note has nothing to build a quiz from |
| `RATE_LIMITED` | 429 | see below |
| `INTERNAL` | 500 | unexpected; the real message is never echoed back |

Inside MCP, a tool failure comes back as a normal `tools/call` result with
`isError: true` and the Vietnamese message as its text content, rather than a
JSON-RPC error — that is what lets the model read and react to it.

---

## 7. Rate limits

**60 requests per minute per key**, as a token bucket with capacity 60 refilling
at 1 token/second, so short bursts are fine.

This is deliberately **best effort**. The bucket lives in each serverless
instance's memory, so a burst spread across several warm instances can exceed
the nominal limit. It exists to stop a runaway agent loop, not to meter usage —
enforcing a hard quota would need Redis, and this project is committed to
costing nothing. Exceeding it returns `429` with a message naming the number of
seconds to wait.
