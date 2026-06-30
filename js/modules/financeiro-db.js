/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/modules/financeiro-db.js
   FinDb: persistência financeira no Supabase (tabela financeiro_dados)
   Depende de: supabase.js (_sb)
   Tabela: financeiro_dados (unidade_id, chave, dados JSONB)
   — Não usa user_id: dados compartilhados entre todos os usuários da clínica
═══════════════════════════════════════════════════════════════════════ */

const FinDb = (function () {
  'use strict';

  var TABLE = 'financeiro_dados';
  var _loading = false;

  /* ── Mapeamento: chave Supabase → chave localStorage ── */
  function _toLsKey(chave, unidadeId) {
    switch (chave) {
      case 'servicos':    return 'tabelaPrecos_'  + unidadeId;
      case 'lancamentos': return 'cfv4_lanc_'      + unidadeId;
      case 'kpis':        return 'cfv4_data_'      + unidadeId;
      case 'agenda_cfg':  return 'agendaCfg_'      + unidadeId;
      case 'agenda_fixa': return 'agendaFixa_'     + unidadeId;
      case 'meta_abs':    return 'cfv4_meta_abs';
      default: return null;
    }
  }

  /* ── Mapeamento inverso: chave localStorage → chave Supabase ── */
  function _toDbChave(lsKey) {
    if (lsKey.startsWith('tabelaPrecos_'))  return 'servicos';
    if (lsKey.startsWith('cfv4_lanc_'))     return 'lancamentos';
    if (lsKey.startsWith('cfv4_data_'))     return 'kpis';
    if (lsKey.startsWith('agendaCfg_'))     return 'agenda_cfg';
    if (lsKey.startsWith('agendaFixa_'))    return 'agenda_fixa';
    if (lsKey === 'cfv4_meta_abs')          return 'meta_abs';
    return null;
  }

  /* ── Extrai unidade_id da chave localStorage ── */
  function _unidadeFromLsKey(lsKey) {
    var m = lsKey.match(/_(u\d+)$/);
    return m ? m[1] : 'global';
  }

  /* ── Salvar um registro ── */
  async function _save(unidadeId, chave, dados) {
    if (!_sb) return;
    try {
      var { error } = await _sb.from(TABLE).upsert(
        { unidade_id: unidadeId, chave: chave, dados: dados,
          atualizado_em: new Date().toISOString() },
        { onConflict: 'unidade_id,chave' }
      );
      if (error) console.error('[FinDb] save error:', error.message);
    } catch (e) {
      console.error('[FinDb] exception:', e);
    }
  }

  /* ── Carregar todos os dados financeiros do Supabase → localStorage ── */
  async function loadAll() {
    if (!_sb || _loading) return;
    _loading = true;
    try {
      var { data, error } = await _sb.from(TABLE).select('unidade_id,chave,dados');
      if (error) { console.error('[FinDb] loadAll error:', error.message); return; }
      if (!data || !data.length) {
        console.log('[FinDb] nenhum dado financeiro no Supabase ainda.');
        return;
      }
      data.forEach(function (row) {
        var lsKey = _toLsKey(row.chave, row.unidade_id);
        if (lsKey && row.dados !== undefined && row.dados !== null) {
          try { localStorage.setItem(lsKey, JSON.stringify(row.dados)); } catch (e) {}
        }
      });
      console.log('[FinDb] ' + data.length + ' registros financeiros carregados.');
    } catch (e) {
      console.error('[FinDb] loadAll exception:', e);
    } finally {
      _loading = false;
    }
  }

  /* ── Migração inicial: lê localStorage atual e sobe para Supabase ──
     Só executa se o Supabase ainda estiver vazio (primeira vez).        */
  async function migrarSeVazio() {
    if (!_sb) return;
    try {
      var { data, error } = await _sb.from(TABLE).select('id').limit(1);
      if (error || (data && data.length > 0)) return; /* já tem dados */

      console.log('[FinDb] Supabase vazio — migrando dados do localStorage...');
      var prefixes = [
        'tabelaPrecos_', 'cfv4_lanc_', 'cfv4_data_',
        'agendaCfg_', 'agendaFixa_', 'cfv4_meta_abs'
      ];
      var ops = [];
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (!key) continue;
        var matched = prefixes.some(function (p) { return key.startsWith(p); });
        if (!matched) continue;
        var chave = _toDbChave(key);
        if (!chave) continue;
        var unidade = _unidadeFromLsKey(key);
        var valor;
        try { valor = JSON.parse(localStorage.getItem(key)); } catch (e) { continue; }
        if (valor === null || valor === undefined) continue;
        ops.push({ unidade_id: unidade, chave: chave, dados: valor,
          atualizado_em: new Date().toISOString() });
      }
      if (!ops.length) { console.log('[FinDb] localStorage vazio, nada a migrar.'); return; }
      var { error: e2 } = await _sb.from(TABLE).upsert(ops, { onConflict: 'unidade_id,chave' });
      if (e2) console.error('[FinDb] migração error:', e2.message);
      else console.log('[FinDb] migração concluída: ' + ops.length + ' registros.');
    } catch (e) {
      console.error('[FinDb] migrarSeVazio exception:', e);
    }
  }

  /* ── API pública de salvamento ── */
  async function saveServicos(unidadeId, arr) {
    await _save(unidadeId, 'servicos', arr);
  }

  async function saveLancamentos(unidadeId, obj) {
    await _save(unidadeId, 'lancamentos', obj);
  }

  async function saveKpis(unidadeId, obj) {
    await _save(unidadeId, 'kpis', obj);
  }

  async function saveMeta(meta) {
    await _save('global', 'meta_abs', meta);
  }

  async function saveAgendaConfig(unidadeId, cfg) {
    await _save(unidadeId, 'agenda_cfg', cfg);
  }

  async function saveAgendaFixa(unidadeId, dados) {
    await _save(unidadeId, 'agenda_fixa', dados);
  }

  return {
    loadAll, migrarSeVazio,
    saveServicos, saveLancamentos, saveKpis,
    saveMeta, saveAgendaConfig, saveAgendaFixa
  };
})();
