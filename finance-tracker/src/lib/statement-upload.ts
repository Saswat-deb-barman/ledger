// Shared validation for endpoints that accept a bank-statement file.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED = /\.(csv|xls|xlsx|xml|txt)$/i;

export class UploadError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

// Reads the multipart body and returns the validated file + raw form.
export async function readStatementUpload(req: Request): Promise<{ form: FormData; file: File; buf: Buffer }> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) throw new UploadError("file too large (max 10 MB)", 413);

  let form: FormData;
  try { form = await req.formData(); } catch { throw new UploadError("invalid upload", 400); }
  const file = form.get("file");
  if (!(file instanceof File)) throw new UploadError("no file", 400);
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError("file too large (max 10 MB)", 413);
  if (!ALLOWED.test(file.name)) throw new UploadError("unsupported file type (use .csv, .xls or .xlsx)", 415);
  return { form, file, buf: Buffer.from(await file.arrayBuffer()) };
}
