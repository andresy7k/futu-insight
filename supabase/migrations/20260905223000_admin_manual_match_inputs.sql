CREATE TABLE public.manual_match_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id TEXT NOT NULL UNIQUE,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  league TEXT NOT NULL,
  markets JSONB NOT NULL DEFAULT '[]'::jsonb,
  note TEXT,
  updated_by UUID NOT NULL REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.manual_match_inputs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_match_inputs TO authenticated;
GRANT ALL ON public.manual_match_inputs TO service_role;

CREATE POLICY "only administrator manages manual match inputs"
ON public.manual_match_inputs FOR ALL TO authenticated
USING ((auth.jwt() ->> 'email') = 'andrescalix00@gmail.com')
WITH CHECK ((auth.jwt() ->> 'email') = 'andrescalix00@gmail.com');

CREATE INDEX manual_match_inputs_updated_at_idx ON public.manual_match_inputs (updated_at DESC);
