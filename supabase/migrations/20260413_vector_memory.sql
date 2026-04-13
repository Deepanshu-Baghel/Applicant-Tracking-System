create table if not exists public.vector_documents (
  id bigserial primary key,
  namespace text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  document_key text not null,
  chunk_index integer not null default 0,
  content text not null,
  embedding jsonb not null,
  embedding_provider text,
  embedding_model text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (namespace, user_id, document_key, chunk_index)
);

create index if not exists idx_vector_documents_namespace_user_created
  on public.vector_documents (namespace, user_id, created_at desc);

create index if not exists idx_vector_documents_namespace_user_doc
  on public.vector_documents (namespace, user_id, document_key);

alter table public.vector_documents enable row level security;

drop policy if exists "vector_documents_select_own" on public.vector_documents;
create policy "vector_documents_select_own"
  on public.vector_documents
  for select
  using (auth.uid() = user_id);
