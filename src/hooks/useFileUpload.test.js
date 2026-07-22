import { describe, it, expect } from "vitest";
import { fileError, MAX_FILES, MAX_MB } from "./useFileUpload.js";

// fileError only reads {name, type, size} — plain objects stand in for File.
const f = (name, type, sizeMB = 0.1) => ({ name, type, size: sizeMB * 1024 * 1024 });

describe("fileError", () => {
  it("accepts images and plain text", () => {
    expect(fileError(f("photo.jpg", "image/jpeg"))).toBeNull();
    expect(fileError(f("shot.png", "image/png"))).toBeNull();
    expect(fileError(f("notes.txt", "text/plain"))).toBeNull();
    expect(fileError(f("data.csv", "text/csv"))).toBeNull();
  });

  it("rejects PDFs by MIME type with a friendly message", () => {
    const err = fileError(f("booking.pdf", "application/pdf"));
    expect(err).toMatch(/PDFs aren't supported yet/);
    expect(err).toMatch(/screenshot/);
  });

  it("rejects PDFs by extension even when the MIME type lies", () => {
    // A .pdf reported as text/plain would previously pass the allowlist and
    // get readAsText'd into binary garbage — the exact §13.2 failure.
    expect(fileError(f("itinerary.pdf", "text/plain"))).toMatch(/PDFs aren't supported yet/);
    expect(fileError(f("confirmation.PDF", ""))).toMatch(/PDFs aren't supported yet/);
  });

  it("rejects unsupported types with plain-English copy", () => {
    const err = fileError(f("archive.zip", "application/zip"));
    expect(err).toMatch(/can't read this file type/);
  });

  it("rejects oversize files and names the limit", () => {
    const err = fileError(f("huge.jpg", "image/jpeg", MAX_MB + 0.5));
    expect(err).toMatch(new RegExp(`under ${MAX_MB}MB`));
  });

  it("accepts a file exactly at the size limit", () => {
    expect(fileError(f("edge.jpg", "image/jpeg", MAX_MB))).toBeNull();
  });

  it("never leaks technical jargon in messages", () => {
    // House rule: no HTTP codes, no stack traces, no MIME strings in UI copy.
    const messages = [
      fileError(f("a.pdf", "application/pdf")),
      fileError(f("b.zip", "application/zip")),
      fileError(f("c.jpg", "image/jpeg", MAX_MB + 1)),
    ];
    for (const msg of messages) {
      expect(msg).not.toMatch(/\b(4\d\d|5\d\d)\b/);
      expect(msg).not.toMatch(/application\//);
      expect(msg).not.toMatch(/MIME|readAsText|base64/i);
    }
  });

  it("worst-case payload fits Vercel's 4.5MB serverless body cap", () => {
    // MAX_FILES × MAX_MB inflated 4/3 by base64 must leave headroom for prompt text.
    const worstCaseMB = MAX_FILES * MAX_MB * (4 / 3);
    expect(worstCaseMB).toBeLessThan(4.5);
  });
});
