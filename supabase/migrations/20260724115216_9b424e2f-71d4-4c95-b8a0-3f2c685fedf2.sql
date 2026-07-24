
CREATE TABLE public.bets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  match_id TEXT NOT NULL,
  home_team TEXT,
  away_team TEXT,
  competition TEXT,
  match_date TIMESTAMPTZ,
  market TEXT NOT NULL,
  stake NUMERIC(12,2) NOT NULL,
  odds NUMERIC(8,2) NOT NULL,
  profit_loss NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','won','lost','void')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bets TO authenticated;
GRANT ALL ON public.bets TO service_role;
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bets" ON public.bets FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.match_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  match_id TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_notes TO authenticated;
GRANT ALL ON public.match_notes TO service_role;
ALTER TABLE public.match_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own notes" ON public.match_notes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
