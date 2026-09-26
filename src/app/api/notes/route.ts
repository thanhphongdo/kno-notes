import { parseNoteFilters } from '@/lib/api/query';
import { NoteWriteSchema } from '@/lib/api/schemas';
import { requireUser } from '@/lib/auth/session';
import { handle } from '@/lib/http';
import { createNote, listNotes } from '@/lib/services/notes';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const filters = parseNoteFilters(new URL(req.url).searchParams);
    return listNotes(user.id, filters);
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const input = NoteWriteSchema.parse(await req.json());
    return createNote(user.id, input);
  });
}
