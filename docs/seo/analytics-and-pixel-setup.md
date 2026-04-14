# Analytics and Facebook Pixel Setup

Tracking scripts are wired in app layout and only activate when env vars are present.

## Google Analytics 4

Set environment variable:

- NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX

## Facebook Pixel

Set environment variable:

- NEXT_PUBLIC_FB_PIXEL_ID=123456789012345

## Validation

After deploy:

- GA4 Realtime should show active users.
- Facebook Pixel Helper extension should detect PageView events.

## Privacy

- Add/update cookie consent and privacy policy before enabling tracking in production.
