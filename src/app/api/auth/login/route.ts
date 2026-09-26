import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { verifyPassword } from '@/lib/auth/password';
import { setSessionCookie } from '@/lib/auth/session';
import { db, users } from '@/lib/db';
import { handle, HttpError } from '@/lib/http';

export const runtime = 'nodejs';

const Body = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

/** Bản sao chính xác của thông báo lỗi trong prototype. */
const BAD_CREDENTIALS = 'Sai tên đăng nhập hoặc mật khẩu.';

/** Hash giả để so sánh khi user không tồn tại, giữ thời gian phản hồi đều nhau. */
const DUMMY_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.0nH7cM3P4.2JzZ9OdV4rK1a5Hb3C';

export async function POST(req: Request) {
  return handle(async () => {
    const { username, password } = Body.parse(await req.json());

    const [row] = await db.select().from(users).where(eq(users.username, username.trim())).limit(1);

    const ok = await verifyPassword(password, row?.passwordHash ?? DUMMY_HASH);
    if (!row || !ok) throw new HttpError(401, 'INVALID_CREDENTIALS', BAD_CREDENTIALS);

    const user = { id: row.id, username: row.username, displayName: row.displayName };
    await setSessionCookie(user);
    return { user };
  });
}
