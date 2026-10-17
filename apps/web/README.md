# apps/web

Static bundle for the Sonorant web UI.

## Build

`npm run build -w @sonorant/web` copies `public/` to `dist/`.

## Egress and CSP

The shipped bundle must contain **no external origin**, and its CSP must set
`connect-src 'none'` and `frame-ancestors 'none'` (TDD §12). `npm run check:bundle`
from the repo root enforces both, and CI runs it after the build.

`public/_headers` is the single source of truth for the CSP. Static hosts that read
`_headers` (Cloudflare Pages, Netlify) apply it automatically. Other hosts must set the
same headers — including `frame-ancestors`, which cannot be set from a `<meta>` tag.
