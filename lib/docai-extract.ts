// lib/docai-extract.ts
import { DocumentProcessorServiceClient } from "@google-cloud/documentai";

/**
 * Sanitizes text output from Document AI to avoid Gemini crashes.
 * Removes control chars, null bytes, weird unicode, double spaces, etc.
 */
function sanitizeText(text: string): string {
  if (!text) return "";

  return text
    .normalize("NFKC")                           // unicode normalize
    .replace(/[\u0000-\u0008]/g, "")             // null + control chars
    .replace(/[\u000B\u000C]/g, "")              // vertical tab / form feed
    .replace(/[\u000E-\u001F]/g, "")             // other ASCII control chars
    .replace(/\uFFFD/g, "")                      // � replacement chars
    .replace(/[^\S\r\n]+/g, " ")                 // collapse weird whitespace
    .replace(/\n\s*\n\s*\n+/g, "\n\n")           // reduce excessive blank lines
    .trim();
}

export async function extractResumeText(base64Pdf: string): Promise<string> {
  try {
    const projectId = process.env.GOOGLE_PROJECT_ID!;
    const location = process.env.GOOGLE_LOCATION!;
    const processorId = process.env.GOOGLE_PROCESSOR_ID!;

    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL!;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, "\n");

    const client = new DocumentProcessorServiceClient({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
    });

    const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;

    const request = {
      name,
      rawDocument: {
        content: base64Pdf,
        mimeType: "application/pdf",
      },
    };

    const [result] = await client.processDocument(request);
    const rawText = result.document?.text || "";

    // ⭐ CRITICAL FIX: sanitize before returning
    const cleanText = sanitizeText(rawText);

    return cleanText;

  } catch (err) {
    console.error("❌ Document AI error:", err);
    return "";
  }
}