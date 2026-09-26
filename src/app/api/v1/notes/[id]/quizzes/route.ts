import { requireBearer } from '@/lib/api/bearer';
import { QuizRecordSchema } from '@/lib/api/schemas';
import { handle } from '@/lib/http';
import { addQuizRecord, getNote } from '@/lib/services/notes';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireBearer(req);
    const { id } = await ctx.params;
    return { quizzes: (await getNote(user.id, id)).quizzes };
  });
}

export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireBearer(req);
    const { id } = await ctx.params;
    return addQuizRecord(user.id, id, QuizRecordSchema.parse(await req.json()));
  });
}
