"use client";

import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Locale,
  RecordPreferences,
  getThamizhiOCRDocxUrl,
  getThamizhiOCRImageUrl,
  processThamizhiOCR,
} from "../lib/api";

type Props = {
  locale: Locale;
  enabled: boolean;
  preferences: RecordPreferences;
  onUsed: (interactionId?: string) => void;
};

export default function OCRPanel({
  locale,
  enabled,
  preferences,
  onUsed,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [processedImage, setProcessedImage] = useState<string>("");

  const [ocrText, setOcrText] = useState("");
  const [sessionId, setSessionId] = useState("");

  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  const ta = locale === "ta-LK";

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function chooseFile(selected: File | null) {
    if (!selected) return;

    if (!selected.type.startsWith("image/")) {
      setError(
        ta
          ? "தயவுசெய்து ஒரு படக் கோப்பைத் தேர்ந்தெடுக்கவும்."
          : "Please select an image file.",
      );
      return;
    }

    if (preview) URL.revokeObjectURL(preview);

    setFile(selected);
    setPreview(URL.createObjectURL(selected));

    setProcessedImage("");
    setOcrText("");
    setSessionId("");
    setError("");
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    chooseFile(event.target.files?.[0] ?? null);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);

    chooseFile(event.dataTransfer.files?.[0] ?? null);
  }

  async function runOCR() {
    if (!enabled) {
      setError(
        ta
          ? "OCR பயன்படுத்த அமர்வுச் செயலாக்கத்தை இயக்கவும்."
          : "Enable session processing to use OCR.",
      );
      return;
    }

    if (!file) {
      setError(
        ta
          ? "முதலில் ஒரு படத்தை பதிவேற்றவும்."
          : "Upload an image first.",
      );
      return;
    }

    setRunning(true);
    setError("");
    setOcrText("");
    setProcessedImage("");
    setSessionId("");

    try {
      const result = await processThamizhiOCR(file);

      console.log("ThamizhiOCR response:", result);

      // Exact response fields returned by the OCR Docker backend:
      // session_id
      // ocr_text
      // annotated_image_url
      // download_docx_url

      const sid =
        typeof result.session_id === "string"
          ? result.session_id
          : "";

      const text =
        typeof result.ocr_text === "string"
          ? result.ocr_text
          : "";

      console.log("OCR RESULT OBJECT:", result);
      console.log("OCR SESSION:", sid);
      console.log("OCR TEXT LENGTH:", text.length);
      console.log("OCR TEXT:", text);

      setSessionId(sid);
      setOcrText(text);

      if (sid) {
        setProcessedImage(
          `${getThamizhiOCRImageUrl(sid)}?t=${Date.now()}`
        );
      }

      onUsed();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "OCR processing failed.",
      );
    } finally {
      setRunning(false);
    }
  }

  async function copyText() {
    if (!ocrText) return;

    try {
      await navigator.clipboard.writeText(ocrText);
    } catch {
      setError(
        ta
          ? "உரையை நகலெடுக்க முடியவில்லை."
          : "Could not copy the OCR text.",
      );
    }
  }

  function downloadDocx() {
    if (!sessionId) return;

    window.open(
      getThamizhiOCRDocxUrl(sessionId),
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <section className="ocr-workspace">
      <div className="ocr-heading">
        <div className="ocr-logo">த</div>

        <div>
          <h2>ThamizhiOCR</h2>

          <p>
            {ta
              ? "தமிழ் உரைப் படத்தை பதிவேற்றவும். உரையைப் பிரித்தெடுத்து பதிவிறக்கக்கூடிய ஆவணத்தை உருவாக்குவோம்."
              : "Upload a Tamil text image. We'll extract the text and provide a downloadable document."}
          </p>
        </div>
      </div>

      <div className="ocr-grid">
        <div className="ocr-left">
          <section className="ocr-card">
            <div className="ocr-card-title">
              📁 {ta ? "படத்தை பதிவேற்று" : "Upload Image"}
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleInput}
            />

            <div
              className={`ocr-dropzone ${
                dragging ? "dragging" : ""
              }`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" ||
                  event.key === " "
                ) {
                  inputRef.current?.click();
                }
              }}
            >
              {preview ? (
                <img
                  src={preview}
                  alt="Uploaded Tamil document"
                  className="ocr-upload-preview"
                />
              ) : (
                <div className="ocr-drop-content">
                  <div className="ocr-upload-icon">⇧</div>

                  <strong>
                    {ta
                      ? "கோப்பை இங்கே விடவும்"
                      : "Drop File Here"}
                  </strong>

                  <span>- or -</span>

                  <button
                    type="button"
                    className="ocr-link-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      inputRef.current?.click();
                    }}
                  >
                    {ta
                      ? "பதிவேற்ற கிளிக் செய்யவும்"
                      : "Click to Upload"}
                  </button>
                </div>
              )}
            </div>
          </section>

          <button
            type="button"
            className="ocr-run-button"
            disabled={!file || running || !enabled}
            onClick={runOCR}
          >
            {running
              ? ta
                ? "OCR செயலாக்கப்படுகிறது..."
                : "Running OCR..."
              : `🚀 ${ta ? "OCR இயக்கு" : "Run OCR"}`}
          </button>

          <section className="ocr-card">
            <div className="ocr-card-title">
              🖼️ {ta ? "செயலாக்கப்பட்ட படம்" : "Processed Image"}
            </div>

            <div className="ocr-processed">
              {processedImage ? (
                <img
                  src={processedImage}
                  alt="OCR processed result"
                  onError={() => setProcessedImage("")}
                />
              ) : (
                <div className="ocr-placeholder">
                  ▧
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="ocr-right">
          <section className="ocr-card ocr-result-card">
            <div className="ocr-card-title ocr-result-title">
              <span>
                📄 {ta ? "OCR முடிவு" : "OCR Result"}
              </span>

              <button
                type="button"
                className="ocr-copy-button"
                disabled={!ocrText}
                onClick={copyText}
                title="Copy OCR text"
              >
                ⧉
              </button>
            </div>

            <textarea
              value={ocrText}
              onChange={(event) =>
                setOcrText(event.target.value)
              }
              placeholder={
                ta
                  ? "OCR உரை இங்கே தோன்றும்..."
                  : "OCR result will appear here..."
              }
            />
          </section>

          <section className="ocr-card">
            <div className="ocr-card-title">
              📥{" "}
              {ta
                ? "இறுதி DOCX பதிவிறக்கம்"
                : "Download Final DOCX"}
            </div>

            <div className="ocr-download-area">
              <button
                type="button"
                className="ocr-download-button"
                disabled={!sessionId}
                onClick={downloadDocx}
              >
                📄{" "}
                {ta
                  ? "DOCX பதிவிறக்கு"
                  : "Download DOCX"}
              </button>
            </div>
          </section>
        </div>
      </div>

      {file && (
        <div className="ocr-file-name">
          {file.name}
        </div>
      )}

      {error && (
        <div className="ocr-error" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
