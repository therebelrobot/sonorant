import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "sonorant-react/styles.css";
import "./styles.css";
import { App } from "./App";

// Apply the saved theme before React renders, so there is no flash. Kept here
// (not inline in index.html) so the built page's `script-src 'self'` policy holds.
try {
  const saved = localStorage.getItem("sonorant-docs-theme");
  if (saved === "light" || saved === "dark") document.documentElement.dataset.theme = saved;
} catch {
  /* storage may be unavailable; the default theme stands. */
}

const root = document.getElementById("root");
if (!root) throw new Error("sonorant docs: #root is missing");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
