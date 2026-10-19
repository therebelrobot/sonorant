import { useEffect, useState, type ReactNode } from "react";

import { Home } from "./pages/Home";
import { Guide } from "./pages/Guide";
import { Visualizations } from "./pages/Visualizations";
import { Packages } from "./pages/Packages";

export interface Route {
  path: string;
  label: string;
  element: ReactNode;
}

export const ROUTES: Route[] = [
  { path: "/", label: "Home", element: <Home /> },
  { path: "/guide", label: "Developer guide", element: <Guide /> },
  { path: "/visualizations", label: "Visualizations", element: <Visualizations /> },
  { path: "/packages", label: "Packages", element: <Packages /> },
];

/** Hash routing keeps deep links working on GitHub Pages without a 404 shim. */
function currentPath(): string {
  const hash = window.location.hash.replace(/^#/, "");
  return hash === "" ? "/" : hash;
}

export function Link({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a className="site-nav__link" href={`#${to}`}>
      {children}
    </a>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<string>(() => document.documentElement.dataset.theme ?? "dark");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("sonorant-docs-theme", theme);
    } catch {
      /* storage may be unavailable; the toggle still works for this page. */
    }
  }, [theme]);
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-pressed={theme === "dark"}
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      {theme === "dark" ? "Light" : "Dark"} theme
    </button>
  );
}

export function App() {
  const [path, setPath] = useState<string>(currentPath);
  useEffect(() => {
    const onHash = () => setPath(currentPath());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const route = ROUTES.find((r) => r.path === path) ?? ROUTES[0];
  const page = route as Route;

  return (
    <div className="site">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <Link to="/">Sonorant</Link>
        <nav className="site-nav" aria-label="Primary">
          {ROUTES.map((r) => (
            <Link key={r.path} to={r.path}>
              {r.label}
            </Link>
          ))}
        </nav>
        <ThemeToggle />
      </header>
      <main id="main" className="site-main">
        {page.element}
      </main>
      <footer className="site-footer">
        <p>
          Sonorant is public domain (<a href="https://unlicense.org">Unlicense</a>). It has no
          backend, makes no network requests, and stores nothing on a server.
        </p>
      </footer>
    </div>
  );
}
