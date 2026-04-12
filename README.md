## ResumeIQ - Applicant Tracking and Resume Intelligence

ResumeIQ is a Next.js app for candidate-side and recruiter-side intelligence.

### Core modules

- Resume Lab: ATS diagnostics, rewrite suggestions, and advanced report sections.
- Recruiter Suite: batch screening, ranking, compare view, shortlist export.
- Billing: credit wallet plus Pro/Premium subscription flows.

### Stack

- Next.js App Router + TypeScript
- Supabase auth and data
- Razorpay payment verification routes
- Gemini-backed analysis with fallback-safe server logic

### Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

### Required env vars

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- GEMINI_API_KEY
- RAZORPAY_KEY_ID
- RAZORPAY_KEY_SECRET

### Notes

- Free tier uses credits for Pro unlocks.
- Pro and Premium subscriptions unlock tier-specific modules.
- Legacy buy routes redirect to /billing.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

> > > > > > > master
