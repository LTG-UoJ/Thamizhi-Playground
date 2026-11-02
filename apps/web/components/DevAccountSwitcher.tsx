"use client";

import { useEffect, useState } from "react";

const ACCOUNTS = [
  { label: "Normal user", user: "alice" },
  { label: "Admin (admin1)", user: "admin1" },
];

export function DevAccountSwitcher() {
  const [current, setCurrent] = useState("");

  useEffect(() => {
    setCurrent(localStorage.getItem("dev_user") ?? "");
  }, []);

  // Never show in production builds
  if (process.env.NODE_ENV === "production") return null;

  const switchTo = (user: string) => {
    localStorage.setItem("dev_user", user);
    location.reload();
  };

  return (
    <div style={{ padding: 8, fontSize: 12 }}>
      <div style={{ opacity: 0.6, marginBottom: 4 }}>Dev account</div>
      {ACCOUNTS.map((a) => (
        <button
          key={a.user}
          onClick={() => switchTo(a.user)}
          disabled={current === a.user}
          style={{ display: "block", width: "100%", marginBottom: 4 }}
        >
          {a.label}
          {current === a.user ? " (active)" : ""}
        </button>
      ))}
    </div>
  );
}
