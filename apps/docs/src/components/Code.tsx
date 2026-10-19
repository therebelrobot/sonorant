import type { ReactNode } from "react";

/** A preformatted code sample. No highlighting dependency; legible is enough. */
export function Code({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <figure className="code">
      {label && <figcaption className="code__label">{label}</figcaption>}
      <pre className="code__pre">
        <code>{children}</code>
      </pre>
    </figure>
  );
}
