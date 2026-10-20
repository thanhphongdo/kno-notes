import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { handle } from '@/lib/http';
import { generateQuiz } from '@/lib/services/quiz';

export const runtime = 'nodejs';
export const maxDuration = 30;

const Body = z.object({
  avoid: z.array(z.string().max(1000)).max(50).optional(),
  /** Số câu người dùng chọn. Số câu thật vẫn do service kẹp lại theo bộ đề. */
  count: z.number().int().min(1).max(200).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    // The body is optional: an empty POST is a valid request.
    let avoid: string[] = [];
    let count: number | undefined;
    try {
      const body = Body.parse(await req.json());
      avoid = body.avoid ?? [];
      count = body.count;
    } catch {
      avoid = [];
      count = undefined;
    }
    return generateQuiz(user.id, id, avoid, count);
  });
}
