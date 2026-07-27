CREATE TABLE public.predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id TEXT NOT NULL UNIQUE,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  league TEXT,
  main_pick TEXT,
  confidence_score NUMERIC,
  risk_level TEXT,
  quick_summary TEXT,
  deep_analysis JSONB,
  best_picks JSONB,
  ml_probabilities JSONB,
  model_used TEXT,
  payload JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.predictions TO anon;
GRANT SELECT ON public.predictions TO authenticated;
GRANT ALL ON public.predictions TO service_role;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "predictions_public_read" ON public.predictions FOR SELECT USING (true);
CREATE INDEX predictions_generated_at_idx ON public.predictions (generated_at DESC);