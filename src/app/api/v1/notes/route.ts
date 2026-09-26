import { requireBearer } from '@/lib/api/bearer';
import { parseNoteFilters } from '@/lib/api/query';
import { NoteWriteSchema } from '@/lib/api/schemas';
import { handle } from '@/lib/http';
import { createNote, listNotes } from '@/lib/services/notes';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireBearer(req);
    return listNotes(user.id, parseNoteFilters(new URL(req.url).searchParams));
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireBearer(req);
    return createNote(user.id, NoteWriteSchema.parse(await req.json()));
  });
}
