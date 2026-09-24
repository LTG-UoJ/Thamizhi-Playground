export function Status({ state, message }: { state: "idle" | "busy" | "done" | "error"; message?: string }) {
  if (state === "idle" && !message) return null;
  return (
    <div className={`status status-${state}`} role={state === "error" ? "alert" : "status"}>
      <span className="status-dot" aria-hidden="true" />
      {message}
    </div>
  );
}

