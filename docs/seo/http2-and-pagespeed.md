# HTTP/2+ and Mobile PageSpeed Checklist

## HTTP/2+ Protocol

This cannot be enforced from application code alone. It is controlled by hosting/CDN.

### Vercel

- HTTP/2 and HTTP/3 are enabled automatically.
- Verify with: https://tools.keycdn.com/http2-test

### Custom Nginx (if self-hosting)

Example TLS server line:

- listen 443 ssl http2;

Also ensure Brotli or gzip compression is enabled.

## Mobile PageSpeed Actions Applied in Code

- Homepage animations switched away from Framer Motion runtime to reduce client JS.
- Public metadata tightened to avoid overlong title/description snippets.
- Redirect cleanup: legacy buy URLs permanently redirect to billing.
- Private routes set to noindex to avoid indexing low-value pages.

## Additional High-Impact Opportunities

- Add Open Graph image file in app metadata for richer social previews.
- Run Lighthouse and trim any third-party scripts not required.
- Keep analytics and pixel tags behind env vars to avoid unnecessary script payload in non-production environments.
