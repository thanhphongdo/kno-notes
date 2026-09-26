import { requireUser } from '@/lib/auth/session';
import { handle, HttpError } from '@/lib/http';
import { uploadImage } from '@/lib/services/images';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();

    const ct = req.headers.get('content-type') || '';
    if (!ct.includes('multipart/form-data')) {
      throw new HttpError(400, 'INVALID_INPUT', 'Yêu cầu phải là multipart/form-data.');
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string' || typeof (file as File).arrayBuffer !== 'function') {
      throw new HttpError(400, 'INVALID_INPUT', 'Thiếu tệp ảnh.');
    }

    return { image: await uploadImage(user.id, file as File) };
  });
}
