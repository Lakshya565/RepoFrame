-- Count actual OpenAI requests rather than treating one multi-turn verification
-- run as one paid call. Existing rows were all single-shot accounting records.
alter table usage_metrics
  add column if not exists model_calls int not null default 1;

alter table usage_metrics
  drop constraint if exists usage_metrics_model_calls_nonnegative;

alter table usage_metrics
  add constraint usage_metrics_model_calls_nonnegative
  check (model_calls >= 0);
