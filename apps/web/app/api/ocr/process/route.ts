import { NextRequest, NextResponse } from "next/server";

const OCR_BACKEND =
  process.env.OCR_BACKEND_URL ?? "http://127.0.0.1:8768";

const OCR_AUDIT_URL =
  process.env.OCR_AUDIT_URL ??
  "http://127.0.0.1:8002/api/v1/ocr/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const started = Date.now();

  async function audit(
    filename: string,
    outputText: string | null,
    statusCode: number,
  ) {
    try {
      await fetch(OCR_AUDIT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": request.headers.get("authorization") ?? "",
          "X-Consent-Granted": request.headers.get("x-consent-granted") ?? "false",
          "X-Save-History": request.headers.get("x-save-history") ?? "false",
          "X-Improvement-Consent":
            request.headers.get("x-improvement-consent") ?? "false",
          "X-Admin-History-Consent":
            request.headers.get("x-admin-history-consent") ?? "false",
          "X-Admin-Consent-Version":
            request.headers.get("x-admin-consent-version") ?? "",
        },
        body: JSON.stringify({
          filename,
          output_text: outputText,
          status_code: statusCode,
          latency_ms: Date.now() - started,
        }),
      });
    } catch (error) {
      console.error("OCR audit failed:", error);
    }
  }

  try {
    const incoming = await request.formData();
    const file = incoming.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { detail: "Missing OCR image file." },
        { status: 400 }
      );
    }

    const body = new FormData();
    body.append("file", file, file.name);

    const response = await fetch(
      `${OCR_BACKEND}/process-ocr`,
      {
        method: "POST",
        body,
        cache: "no-store",
      }
    );

    const text = await response.text();

    if (!response.ok) {
      await audit(file.name, null, response.status);
      return new NextResponse(text, {
        status: response.status,
        headers: {
          "content-type":
            response.headers.get("content-type") ??
            "application/json",
        },
      });
    }

    const result = JSON.parse(text);

    if (result.session_id) {
      const sid = encodeURIComponent(result.session_id);

      result.annotated_image_url =
        `/playground/api/ocr/image/${sid}`;

      result.download_docx_url =
        `/playground/api/ocr/docx/${sid}`;
    }

    await audit(file.name, result.ocr_text ?? null, response.status);
    return NextResponse.json(result);
  } catch (error) {
    console.error("OCR proxy error:", error);

    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "OCR proxy failed.",
      },
      { status: 500 }
    );
  }
}
