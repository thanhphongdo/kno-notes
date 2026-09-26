// scripts/reindex.ts
//
// Dựng lại `note_index` từ nguồn sự thật là các file ghi chú trong storage.
//
//   npx tsx scripts/reindex.ts            # mọi user
//   npx tsx scripts/reindex.ts hongloan   # một user
//
// Cần chạy sau khi thêm cột dẫn xuất mới: migration chỉ tạo cột với giá trị
// mặc định, còn giá trị THẬT nằm trong nội dung ghi chú. Ví dụ `highlights`:
// nếu không chạy, các đoạn đã đánh dấu từ trước sẽ không tìm được cho tới lần
// sửa ghi chú kế tiếp.
//
// An toàn khi chạy lại: chỉ UPSERT các giá trị dẫn xuất, không đụng file.
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { closeDb, db, noteIndex, users } from '../src/lib/db';
import { getStorage } from '../src/lib/storage';
import { upsertIndex } from '../src/lib/services/index-sync';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

  const [username] = process.argv.slice(2);
  const all = await db.select({ id: users.id, username: users.username }).from(users);
  const targets = username ? all.filter((u) => u.username === username) : all;
  if (!targets.length) throw new Error(username ? `Không có user "${username}".` : 'Chưa có user nào.');

  const storage = getStorage();
  let indexed = 0;
  let missing = 0;

  for (const user of targets) {
    const rows = await db
      .select({ noteId: noteIndex.noteId })
      .from(noteIndex)
      .where(eq(noteIndex.userId, user.id));

    for (const row of rows) {
      const note = await storage.readNote(user.id, row.noteId);
      if (!note) {
        // Hàng chỉ mục còn nhưng file đã mất — báo ra chứ không tự xoá.
        console.warn(`  ! ${user.username}/${row.noteId}: không đọc được file, bỏ qua`);
        missing += 1;
        continue;
      }
      await upsertIndex(user.id, note);
      indexed += 1;
    }
    console.log(`${user.username}: ${rows.length} ghi chú`);
  }

  console.log(`reindexed: ${indexed} ghi chú${missing ? `, bỏ qua ${missing}` : ''}`);
}

main()
  .then(() => closeDb())
  .catch(async (error: unknown) => {
    console.error('failed:', error instanceof Error ? error.message : error);
    await closeDb().catch(() => {});
    process.exit(1);
  });
