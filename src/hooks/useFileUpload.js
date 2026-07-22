import { useState } from "react";

// Limits sized to the smallest real ceiling: Vercel serverless caps request
// bodies at 4.5MB (platform limit, not configurable on Hobby). Worst case here
// is 3 files × 1MB × 4/3 base64 ≈ 4MB + prompt text — fits with headroom.
// Previously 5 × 10MB, which the client accepted and the proxy then rejected.
export const MAX_FILES = 3;
export const MAX_MB    = 1;

const ALLOWED_TYPES = [
  "image/jpeg","image/png","image/webp","image/gif",
  "text/plain","text/csv","application/json",
];
const ALLOWED_EXTS = /\.(txt|csv|json|jpg|jpeg|png|webp|gif)$/i;
const PDF_EXT = /\.pdf$/i;

// Pure validation — returns a friendly rejection message, or null if the file is fine.
// PDFs are rejected explicitly: reader.readAsText() on PDF binary produced mojibake
// that silently polluted the prompt as "trip context" (PHASE2_PLANNING §13.2).
// Checked by both MIME type and extension so a mislabeled file can't slip through.
export function fileError(file) {
  if (file.type === "application/pdf" || PDF_EXT.test(file.name))
    return `${file.name}: PDFs aren't supported yet — a screenshot works great instead`;
  if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTS.test(file.name))
    return `${file.name}: we can't read this file type — images or plain text work best`;
  if (file.size > MAX_MB * 1024 * 1024)
    return `${file.name}: too big — keep each file under ${MAX_MB}MB`;
  return null;
}

export function useFileUpload() {
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploadError, setUploadError]    = useState("");

  async function handleFiles(fileList) {
    setUploadError("");
    const incoming = Array.from(fileList);

    if (uploadedFiles.length + incoming.length > MAX_FILES) {
      setUploadError(`Up to ${MAX_FILES} files per trip.`);
      return;
    }

    const results = await Promise.all(
      incoming.map(
        file =>
          new Promise(resolve => {
            const err = fileError(file);
            if (err) {
              resolve({ error: err });
              return;
            }
            const reader  = new FileReader();
            const isImage = file.type.startsWith("image/");
            reader.onload = e => resolve({
              name:    file.name,
              type:    file.type,
              isImage,
              content: isImage ? e.target.result.split(",")[1] : e.target.result,
              preview: isImage ? e.target.result : null,
              size:    (file.size / 1024).toFixed(0) + " KB",
            });
            reader.onerror = () => resolve({ error: `${file.name}: couldn't be read — try again?` });
            if (isImage) reader.readAsDataURL(file);
            else         reader.readAsText(file);
          })
      )
    );

    const errors = results.filter(r => r.error).map(r => r.error);
    const good   = results.filter(r => !r.error);
    if (errors.length) setUploadError(errors.join(" · "));
    if (good.length)   setUploadedFiles(p => [...p, ...good]);
  }

  function removeFile(i) {
    setUploadedFiles(p => p.filter((_, idx) => idx !== i));
  }

  function resetFiles() {
    setUploadedFiles([]);
    setUploadError("");
  }

  return { uploadedFiles, uploadError, handleFiles, removeFile, resetFiles };
}
