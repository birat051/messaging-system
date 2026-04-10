function normalize(s: string | null | undefined): string {
  return (s ?? '').trim();
}

export type BuildProfileFormDataArgs = {
  file: File | null;
  displayName: string;
  status: string;
  previousDisplayName: string | null | undefined;
  previousStatus: string | null | undefined;
};

/**
 * Builds **`multipart/form-data`** for **`PATCH /users/me`** — **`file`**, **`displayName`**, **`status`**
 * only when changed or file selected.
 */
export function buildProfileFormData(
  args: BuildProfileFormDataArgs,
): { formData: FormData; hasPart: boolean } {
  const fd = new FormData();
  let hasPart = false;

  if (args.file && args.file.size > 0) {
    fd.append('file', args.file);
    hasPart = true;
  }

  const dn = normalize(args.displayName);
  const st = normalize(args.status);
  const initialDn = normalize(args.previousDisplayName);
  const initialSt = normalize(args.previousStatus);

  if (dn !== initialDn) {
    fd.append('displayName', dn);
    hasPart = true;
  }
  if (st !== initialSt) {
    fd.append('status', st);
    hasPart = true;
  }

  return { formData: fd, hasPart };
}
