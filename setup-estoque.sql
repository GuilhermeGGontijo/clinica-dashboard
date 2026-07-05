-- ═══════════════════════════════════════════════════════════════════
-- MÓDULO DE ESTOQUE — Executar UMA VEZ no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- 1. Categorias
CREATE TABLE IF NOT EXISTS estoque_categorias (
  id        UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nome      TEXT NOT NULL,
  descricao TEXT,
  ativo     BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now()
);
INSERT INTO estoque_categorias (nome) VALUES
  ('Descartáveis'),('Perecíveis / Reagentes'),
  ('Máquinas / Equipamentos'),('Medicamentos'),('Material de Limpeza')
ON CONFLICT DO NOTHING;

-- 2. Produtos
CREATE TABLE IF NOT EXISTS estoque_produtos (
  id                     UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  unidade_id             INTEGER REFERENCES unidades(id),
  categoria_id           UUID REFERENCES estoque_categorias(id),
  nome                   TEXT NOT NULL,
  descricao              TEXT,
  unidade_medida         TEXT DEFAULT 'unidade',
  unidades_por_embalagem NUMERIC(10,4) DEFAULT 1,
  estoque_minimo         NUMERIC(10,4) DEFAULT 0,
  custo_unitario         NUMERIC(10,2) DEFAULT 0,
  data_validade          DATE,
  ativo                  BOOLEAN DEFAULT true,
  criado_em              TIMESTAMPTZ DEFAULT now(),
  atualizado_em          TIMESTAMPTZ DEFAULT now()
);

-- 3. Saldo atual
CREATE TABLE IF NOT EXISTS estoque_saldo (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  produto_id UUID REFERENCES estoque_produtos(id) ON DELETE CASCADE,
  unidade_id INTEGER REFERENCES unidades(id),
  quantidade NUMERIC(10,4) DEFAULT 0,
  UNIQUE(produto_id, unidade_id)
);

-- 4. Movimentações
CREATE TABLE IF NOT EXISTS estoque_movimentacoes (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  produto_id      UUID REFERENCES estoque_produtos(id) ON DELETE CASCADE,
  unidade_id      INTEGER REFERENCES unidades(id),
  tipo            TEXT NOT NULL CHECK (tipo IN ('ENTRADA','SAIDA','AJUSTE','TRANSFERENCIA')),
  quantidade      NUMERIC(10,4) NOT NULL,
  custo_unitario  NUMERIC(10,2),
  referencia_tipo TEXT,
  referencia_id   UUID,
  observacoes     TEXT,
  criado_por      UUID REFERENCES perfis_usuarios(id),
  criado_em       TIMESTAMPTZ DEFAULT now()
);

-- 5. Pedidos de Compra
CREATE TABLE IF NOT EXISTS estoque_pedidos (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  unidade_id     INTEGER REFERENCES unidades(id),
  solicitante_id UUID REFERENCES perfis_usuarios(id),
  status         TEXT DEFAULT 'PENDENTE'
                 CHECK (status IN ('PENDENTE','APROVADO','REJEITADO','RECEBIDO','CANCELADO')),
  observacoes    TEXT,
  aprovado_por   UUID REFERENCES perfis_usuarios(id),
  aprovado_em    TIMESTAMPTZ,
  criado_em      TIMESTAMPTZ DEFAULT now()
);

-- 6. Itens dos Pedidos
CREATE TABLE IF NOT EXISTS estoque_pedidos_itens (
  id                    UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  pedido_id             UUID REFERENCES estoque_pedidos(id) ON DELETE CASCADE,
  produto_id            UUID REFERENCES estoque_produtos(id),
  quantidade_solicitada NUMERIC(10,4) NOT NULL,
  quantidade_recebida   NUMERIC(10,4) DEFAULT 0,
  custo_unitario        NUMERIC(10,2)
);

-- 7. Vínculo procedimento → materiais
CREATE TABLE IF NOT EXISTS procedimento_materiais (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  procedimento_id UUID REFERENCES odonto_procedimentos(id) ON DELETE CASCADE,
  produto_id      UUID REFERENCES estoque_produtos(id) ON DELETE CASCADE,
  quantidade      NUMERIC(10,4) NOT NULL DEFAULT 1,
  UNIQUE(procedimento_id, produto_id)
);

-- 8. Contas a Pagar (sub-módulo Financeiro)
CREATE TABLE IF NOT EXISTS financeiro_contas_pagar (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  unidade_id      INTEGER REFERENCES unidades(id),
  descricao       TEXT NOT NULL,
  valor           NUMERIC(10,2) NOT NULL,
  data_vencimento DATE,
  fornecedor      TEXT,
  status          TEXT DEFAULT 'PENDENTE'
                  CHECK (status IN ('PENDENTE','PAGO','CANCELADO')),
  pedido_id       UUID REFERENCES estoque_pedidos(id) ON DELETE SET NULL,
  data_pagamento  DATE,
  comprovante_url TEXT,
  observacoes     TEXT,
  criado_por      UUID REFERENCES perfis_usuarios(id),
  aprovado_por    UUID REFERENCES perfis_usuarios(id),
  criado_em       TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE estoque_categorias      ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_produtos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_saldo           ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_movimentacoes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_pedidos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_pedidos_itens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE procedimento_materiais  ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_contas_pagar ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='estoque_categorias'     AND policyname='unit_access') THEN CREATE POLICY "unit_access" ON estoque_categorias      USING (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='estoque_produtos'        AND policyname='unit_access') THEN CREATE POLICY "unit_access" ON estoque_produtos        USING (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='estoque_saldo'           AND policyname='unit_access') THEN CREATE POLICY "unit_access" ON estoque_saldo           USING (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='estoque_movimentacoes'   AND policyname='unit_access') THEN CREATE POLICY "unit_access" ON estoque_movimentacoes   USING (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='estoque_pedidos'         AND policyname='unit_access') THEN CREATE POLICY "unit_access" ON estoque_pedidos         USING (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='estoque_pedidos_itens'   AND policyname='unit_access') THEN CREATE POLICY "unit_access" ON estoque_pedidos_itens   USING (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='procedimento_materiais'  AND policyname='unit_access') THEN CREATE POLICY "unit_access" ON procedimento_materiais  USING (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='financeiro_contas_pagar' AND policyname='unit_access') THEN CREATE POLICY "unit_access" ON financeiro_contas_pagar USING (true); END IF;
END $$;
