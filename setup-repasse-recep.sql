-- =====================================================================
-- MIGRAÇÃO: Repasses de Recepcionistas
-- Execute no Supabase SQL Editor
-- =====================================================================

CREATE TABLE IF NOT EXISTS repasses_recepcionistas (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  unidade_id       TEXT,
  recepcionista_id UUID,
  competencia      DATE NOT NULL,
  valor            NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
  status           TEXT DEFAULT 'pendente' CHECK (status IN ('pendente','pago')),
  observacoes      TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_repasse_recep_unidade
  ON repasses_recepcionistas(unidade_id, competencia);

ALTER TABLE repasses_recepcionistas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autenticados_repasse_recep" ON repasses_recepcionistas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
