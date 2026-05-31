import { useState } from "react";

const MAX_FILES = 5;
const MAX_MB    = 10;
const ALLOWED_TYPES = [
  "image/jpeg","image/png","image/webp","image/gif",
  "application/pdf","text/plain","text/csv","application/json",
];
const ALLOWED_EXTS = /\.(txt|pdf|csv|json|jpg|jpeg|png|webp|gif)$/i;

export function useFileUpload() {
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploadError, setUploadError]    = useState("");

  async function handleFiles(fileList) {
    setUploadError("");
    const incoming = Array.from(fileList);

    if (uploadedFiles.length + incoming.length > MAX_FILES) {
      setUploadError(`Max ${MAX_FILES} files.`);
      return;
    }

    const results = await Promise.all(
      incoming.map(
        file =>
          new Promise(resolve => {
            if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTS.test(file.name)) {
              resolve({ error: `${file.name}: unsupported type` });
              return;
            }
            if (file.size > MAX_MB * 1024 * 1024) {
              resolve({ error: `${file.name}: exceeds ${MAX_MB}MB` });
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
            reader.onerror = () => resolve({ error: `${file.name}: failed to read` });
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
