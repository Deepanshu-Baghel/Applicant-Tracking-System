create extension if not exists vector;

create or replace function public.jsonb_to_vector_fixed(
  p_embedding jsonb,
  p_dims integer default 1536
)
returns vector
language plpgsql
immutable
as $$
declare
  values_array double precision[];
  current_dims integer;
  pad_count integer;
  vector_literal text;
begin
  if p_embedding is null or jsonb_typeof(p_embedding) <> 'array' then
    return null;
  end if;

  select array_agg(value::double precision)
  into values_array
  from jsonb_array_elements_text(p_embedding) as value;

  if values_array is null then
    return null;
  end if;

  current_dims := coalesce(array_length(values_array, 1), 0);

  if current_dims > p_dims then
    values_array := values_array[1:p_dims];
  elsif current_dims < p_dims then
    pad_count := p_dims - current_dims;
    values_array := values_array || array_fill(0::double precision, array[pad_count]);
  end if;

  vector_literal := '[' || array_to_string(values_array, ',') || ']';
  return vector_literal::vector;
end;
$$;

alter table if exists public.vector_documents
  add column if not exists embedding_vector vector(1536);

alter table if exists public.vector_documents
  add column if not exists search_tsv tsvector
  generated always as (to_tsvector('english', coalesce(content, ''))) stored;

update public.vector_documents
set embedding_vector = public.jsonb_to_vector_fixed(embedding, 1536)
where embedding_vector is null
  and embedding is not null;

create index if not exists idx_vector_documents_embedding_hnsw
  on public.vector_documents
  using hnsw (embedding_vector vector_cosine_ops);

create index if not exists idx_vector_documents_search_tsv
  on public.vector_documents
  using gin (search_tsv);

create or replace function public.hybrid_search_vector_documents(
  p_namespace text,
  p_user_id uuid,
  p_query_embedding vector(1536),
  p_match_count integer default 5,
  p_min_similarity real default 0.35,
  p_query_text text default null,
  p_exclude_document_key text default null,
  p_blend_alpha real default 0.78
)
returns table(
  document_key text,
  chunk_index integer,
  content text,
  similarity real,
  lexical_rank real,
  hybrid_score real,
  metadata jsonb,
  created_at timestamptz
)
language sql
stable
as $$
with candidates as (
  select
    vd.document_key,
    vd.chunk_index,
    vd.content,
    1 - (vd.embedding_vector <=> p_query_embedding) as similarity,
    case
      when p_query_text is null or btrim(p_query_text) = '' then 0
      else ts_rank_cd(vd.search_tsv, plainto_tsquery('english', p_query_text))
    end as lexical_rank,
    vd.metadata,
    vd.created_at
  from public.vector_documents vd
  where vd.namespace = p_namespace
    and vd.user_id = p_user_id
    and vd.embedding_vector is not null
    and (
      p_exclude_document_key is null
      or vd.document_key <> p_exclude_document_key
    )
  order by vd.embedding_vector <=> p_query_embedding
  limit greatest(p_match_count * 8, 40)
), ranked as (
  select
    document_key,
    chunk_index,
    content,
    similarity,
    lexical_rank,
    (similarity * greatest(0, least(1, p_blend_alpha))) +
      (lexical_rank * (1 - greatest(0, least(1, p_blend_alpha)))) as hybrid_score,
    metadata,
    created_at
  from candidates
  where similarity >= p_min_similarity
)
select
  document_key,
  chunk_index,
  content,
  similarity::real,
  lexical_rank::real,
  hybrid_score::real,
  coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'retrieval_mode', 'pgvector-hybrid',
    'lexical_rank', lexical_rank,
    'hybrid_score', hybrid_score
  ) as metadata,
  created_at
from ranked
order by hybrid_score desc, similarity desc
limit p_match_count;
$$;