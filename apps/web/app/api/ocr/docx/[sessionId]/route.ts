import { NextRequest, NextResponse } from "next/server";

const OCR_BACKEND =
  process.env.OCR_BACKEND_URL ?? "http://127.0.0.1:8768";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{ sessionId: string }>;
  }
) {
  try {
    const { sessionId } = await context.params;

    const response = await fetch(
      `${OCR_BACKEND}/download-docx/${encodeURIComponent(sessionId)}`,
      {
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        {
          detail: `DOCX request failed (${response.status}).`,
        },
        { status: response.status }
      );
    }

    const data = await response.arrayBuffer();

    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type":
          response.headers.get("content-type") ??
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition":
          response.headers.get("content-disposition") ??
          'attachment; filename="ThamizhiOCR.docx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("OCR DOCX proxy error:", error);

    return NextResponse.json(
      { detail: "Could not retrieve OCR DOCX." },
      { status: 500 }
    );
  }
}
