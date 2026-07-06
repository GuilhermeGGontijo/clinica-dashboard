-- =====================================================================
-- MIGRAÇÃO: Módulos DRE e Laboratório
-- Execute no Supabase SQL Editor: https://app.supabase.com/project/yigqjrfmrgegwqbxotgc/sql
-- =====================================================================

-- 1. CUSTOS OPERACIONAIS
-- Lança custos fixos e variáveis da clínica (aluguel, material, equip, etc.)
CREATE TABLE IF NOT EXISTS custos_operacionais (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id       uuid REFERENCES unidades(id) ON DELETE CASCADE,
  data_lancamento  date NOT NULL,
  categoria        text NOT NULL CHECK (categoria IN ('aluguel','material','equipamento','pessoal','marketing','outros')),
  descricao        text,
  valor            numeric(12,2) NOT NULL CHECK (valor >= 0),
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custos_unidade_data
  ON custos_operacionais(unidade_id, data_lancamento);

-- 2. REPASSES A PROFISSIONAIS
-- Percentual de produção que a clínica repassa ao profissional
CREATE TABLE IF NOT EXISTS repasses_profissionais (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id          uuid REFERENCES unidades(id) ON DELETE CASCADE,
  profissional_id     uuid REFERENCES perfis_usuarios(id),
  periodo_ini         date NOT NULL,
  periodo_fim         date NOT NULL,
  valor_faturado      numeric(12,2) DEFAULT 0,
  percentual_repasse  numeric(5,2)  DEFAULT 0 CHECK (percentual_repasse BETWEEN 0 AND 100),
  valor_repasse       numeric(12,2) GENERATED ALWAYS AS (
                        ROUND(valor_faturado * percentual_repasse / 100, 2)
                      ) STORED,
  status              text DEFAULT 'pendente' CHECK (status IN ('pendente','pago')),
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_repasses_unidade_periodo
  ON repasses_profissionais(unidade_id, periodo_ini, periodo_fim);

-- 3. RECEPÇÃO LABORATORIAL
-- Controla envio e retorno de trabalhos ao laboratório de prótese
CREATE TABLE IF NOT EXISTS recepcao_lab (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id       uuid REFERENCES unidades(id) ON DELETE CASCADE,
  paciente_id      uuid REFERENCES pacientes(id),
  profissional_id  uuid REFERENCES perfis_usuarios(id),
  laboratorio      text,
  tipo_trabalho    text,  -- coroa, protese_total, aparelho, faceta, implante, etc.
  data_entrada     date NOT NULL,
  data_prevista    date,
  data_retorno     date,
  status           text DEFAULT 'em_producao' CHECK (status IN ('em_producao','aguardando_laudo','entregue','refeito')),
  valor            numeric(12,2),
  observacoes      text,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lab_unidade_data
  ON recepcao_lab(unidade_id, data_entrada);

-- 4. LAUDOS
-- Laudos clínicos (radiologia, periodontia, etc.) vinculados a trabalhos de lab ou avulsos
CREATE TABLE IF NOT EXISTS laudos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id       uuid REFERENCES unidades(id) ON DELETE CASCADE,
  recepcao_lab_id  uuid REFERENCES recepcao_lab(id) ON DELETE SET NULL,
  profissional_id  uuid REFERENCES perfis_usuarios(id),
  tipo             text,  -- laudo_rx, laudo_tomo, laudo_perio, laudo_oclusao, etc.
  descricao        text,
  data_emissao     date,
  data_entrega     date,
  status           text DEFAULT 'pendente' CHECK (status IN ('pendente','emitido','entregue')),
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_laudos_unidade
  ON laudos(unidade_id, data_emissao);

-- =====================================================================
-- RLS (Row Level Security) — habilite conforme sua política existente
-- Exemplo: apenas usuários autenticados da mesma unidade leem/escrevem
-- ALTER TABLE custos_operacionais    ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE repasses_profissionais ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE recepcao_lab           ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE laudos                 ENABLE ROW LEVEL SECURITY;
-- =====================================================================
