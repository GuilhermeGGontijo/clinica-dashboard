-- ═══════════════════════════════════════════════════════════════════
-- ODONTOGRAMA VISUAL — Executar UMA VEZ no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- 1. Tipo de símbolo visual em cada procedimento odontológico
ALTER TABLE odonto_procedimentos
  ADD COLUMN IF NOT EXISTS tipo_visual TEXT DEFAULT 'nenhum';

-- 2. Status visual de cada item de orçamento
ALTER TABLE orcamento_itens
  ADD COLUMN IF NOT EXISTS status_visual TEXT DEFAULT 'a_realizar';
