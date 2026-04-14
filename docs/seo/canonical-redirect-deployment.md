# Canonical Host Redirect Deployment

This project enforces canonical host redirects using Next.js proxy logic in `src/proxy.ts`.

## Current behavior

- Requests to `webresume.tech` are redirected with HTTP 301 to `https://www.webresume.tech`.
- Canonical host remains `www.webresume.tech` for SEO consistency.

## Why this matters

- Consolidates ranking signals to one host.
- Avoids duplicate indexing between www and non-www variants.
- Keeps canonical URL strategy aligned with metadata and sitemap.

## Production checklist

1. Ensure both DNS records exist:
   - `webresume.tech`
   - `www.webresume.tech`
2. Keep `NEXT_PUBLIC_SITE_URL=https://www.webresume.tech` in production env.
3. Deploy app changes containing `src/proxy.ts`.
4. Verify with terminal:
   - `curl -I https://webresume.tech`
   - Expected: `301` and `Location: https://www.webresume.tech/...`
5. Verify canonical metadata on homepage points to `https://www.webresume.tech/`.

## Notes

- Local development host-header behavior can vary by tooling and local DNS.
- Final canonical verification should be done on deployed HTTPS URLs.
