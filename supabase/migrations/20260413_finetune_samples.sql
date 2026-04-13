create table if not exists public.embedding_finetune_samples (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  namespace text not null,
  job_description text not null,
  resume_text text not null,
  semantic_match_score integer,
  embedding_provider text,
  missing_intents jsonb not null default '[]'::jsonb,
  top_evidence jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_embedding_finetune_samples_user_namespace_created
  on public.embedding_finetune_samples (user_id, namespace, created_at desc);

alter table public.embedding_finetune_samples enable row level security;

drop policy if exists "embedding_finetune_samples_select_own" on public.embedding_finetune_samples;
create policy "embedding_finetune_samples_select_own"
  on public.embedding_finetune_samples
  for select
  using (auth.uid() = user_id);