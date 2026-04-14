# Google Search Console Checklist

Use this checklist after each production deployment.

## 1) Property setup

1. Open Google Search Console.
2. Add property for `https://www.webresume.tech`.
3. Complete DNS or HTML verification.

## 2) Canonical and redirect checks

1. Confirm `https://webresume.tech` redirects to `https://www.webresume.tech` with HTTP 301.
2. Confirm homepage canonical tag resolves to `https://www.webresume.tech/`.

## 3) Sitemap submission

1. Open Sitemaps tab.
2. Submit: `https://www.webresume.tech/sitemap.xml`.
3. Confirm status changes to Success.

## 4) robots.txt validation

1. Visit `https://www.webresume.tech/robots.txt`.
2. Confirm sitemap line is present.
3. Confirm private routes remain disallowed.

## 5) URL inspection

Inspect these URLs and request indexing if needed:

1. `https://www.webresume.tech/`
2. `https://www.webresume.tech/overview`

## 6) Coverage and enhancements

1. Review Indexing > Pages for errors and exclusions.
2. Review Core Web Vitals (mobile first).
3. Fix high-impact issues before next content push.

## 7) Weekly monitoring

Track weekly in Search Console:

1. Impressions
2. Clicks
3. Average position
4. Top queries
5. Top pages

## 8) Monthly hygiene

1. Re-check redirect integrity (www vs non-www).
2. Re-submit sitemap after major page changes.
3. Review metadata quality for top landing pages.
