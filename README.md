## WebResume.tech - Applicant Tracking and Resume Intelligence

WebResume.tech is a Next.js app for candidate-side and recruiter-side intelligence.

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
- NEXT_PUBLIC_SITE_URL (optional, default: https://www.webresume.tech)
- SUPABASE_SERVICE_ROLE_KEY
- GEMINI_API_KEY
- HUGGINGFACE_API_KEY (optional, enables sentence-transformers embedding provider)
- HUGGINGFACE_EMBED_MODEL (optional, default: sentence-transformers/all-MiniLM-L6-v2)
- HUGGINGFACE_FINETUNED_EMBED_MODEL (optional, your custom fine-tuned embedding model id)
- CUSTOM_FINETUNE_ENABLED (optional, default true)
- FINETUNE_DATA_CAPTURE (optional, set false to disable sample logging)
- NEXT_PUBLIC_AUTH_EMAIL_REDIRECT_URL (optional, default: https://www.webresume.tech/login)
- RAZORPAY_KEY_ID
- RAZORPAY_KEY_SECRET

### Notes

- Free tier has basic-only access.
- Pro and Premium subscriptions unlock tier-specific modules.
- Long-term semantic memory uses Supabase `vector_documents` with pgvector hybrid search.
- Run migrations in order:
  - `supabase/migrations/20260413_vector_memory.sql`
  - `supabase/migrations/20260413_vector_memory_hybrid.sql`
  - `supabase/migrations/20260413_finetune_samples.sql`
- Normal analysis and HR batch scoring use multi-query hybrid retrieval (vector + lexical blending) with historical memory fallback.
- Fine-tune samples are captured server-side and can be exported from `GET /api/fine-tune/export?format=jsonl`.
- Legacy buy routes redirect to /billing.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
