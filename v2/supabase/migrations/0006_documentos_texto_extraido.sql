-- Reutiliza na minuta o texto que ja foi extraido na triagem, inclusive OCR.
alter table public.documentos add column if not exists extracted_text text;
alter table public.documentos add column if not exists extracted_via text;
alter table public.documentos add column if not exists extracted_at timestamptz;
