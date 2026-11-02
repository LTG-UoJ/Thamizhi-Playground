import { NextRequest, NextResponse } from "next/server";

const OCR_BACKEND =
  process.env.OCR_BACKEND_URL ?? "http://127.0.0.1:8768";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
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
