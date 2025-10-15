// src/pages/financeiro/Saidas.tsx
import React, { useEffect, useMemo, useState } from "react";
import Modal from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";

/* ================= Tipagens ================= */
type Movimento = {
  id: string;                // uuid
  data: string;              // "YYYY-MM-DD" ou ISO
  conta_id: number;          // INTEGER
  conta_codigo?: string;
  conta_nome?: string;
  conta_corrente_id: string; // UUID
  conta_corrente_nome?: string;
  valor_centavos: number;
  direcao: "pago" | "recebido" | "entrada";
  forma_pagamento_id: number; // INTEGER
  forma_pagamento_nome?: string;
  descricao: string | null;
  criado_em?: string;
};

type ContaGerencial = {
  id: number;    // INTEGER
  codigo: string;
  nome: string;
  ativa: boolean;
  conta_direcao_id?: number | null;
};

type ContaCorrente = { id: string; nome: string; ativa: boolean }; // UUID
type FormaPagamento = { id: number; nome: string };
type ContaDirecao = { id: number; nome: "Entrada" | "Saida" | "Neutra" | string };

// ✨ Tipos auxiliares para modal e sessões especiais
type PickerItem = { id: string | number; nome: string };
type TipoSaidaFuncionario = { id: number; nome: string; ativo?: boolean };

// linhas enriquecidas retornadas pelas rotas especiais
type LinhaFunc = Movimento & { destino_nome?: string; tipo_saida_nome?: string };
type LinhaForn = Movimento & { destino_nome?: string };

const API = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL ?? "/api");

/* ================= Helpers (tolerantes a datas inválidas) ================= */
const isValidDate = (d: Date) => d instanceof Date && !isNaN(d.getTime());

/** Converte Date|string para "YYYY-MM-DD" no fuso local. Retorna "" se inválido. */
const toLocalISODate = (d: Date | string | null | undefined) => {
  const date =
    typeof d === "string" ? new Date(d) :
    d instanceof Date ? d : null;

  if (!date || !isValidDate(date)) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return isValidDate(local) ? local.toISOString().slice(0, 10) : "";
};

/** Normaliza "YYYY-MM-DD" ou qualquer ISO/date-string para "YYYY-MM-DD" local. Retorna "" se inválido. */
const normalizeISODate = (s?: string | null) => {
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return toLocalISODate(s) || "";
};

/** Mostra a data em pt-BR. Se inválida ou vazia, devolve "—". */
const formatDateBR = (s?: string | null) => {
  const norm = normalizeISODate(s || "");
  if (!norm) return "—";
  const [y, m, d] = norm.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return isValidDate(dt) ? dt.toLocaleDateString("pt-BR") : "—";
};

/* ================= Helpers financeiros ================= */
const formatBRL = (c: number) =>
  ((c ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const digitsToBRL = (digits: string) =>
  (Number(digits.replace(/\D/g, "") || "0") / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const digitsToCentavos = (digits: string) => Number(digits.replace(/\D/g, "") || "0");

/* ================= Componente ================= */
const now = new Date();
const defaultEnd = toLocalISODate(now);
const defaultStart = toLocalISODate(new Date(now.getTime() - 19 * 24 * 60 * 60 * 1000)); // 20 dias

export default function Saidas() {
  const [rows, setRows] = useState<Movimento[]>([]);
  const [rowsFunc, setRowsFunc] = useState<LinhaFunc[]>([]);
  const [rowsForn, setRowsForn] = useState<LinhaForn[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingFuncRows, setLoadingFuncRows] = useState(false);
  const [loadingFornRows, setLoadingFornRows] = useState(false);

  const [contas, setContas] = useState<ContaGerencial[]>([]);
  const [contasCorrente, setContasCorrente] = useState<ContaCorrente[]>([]);
  const [formas, setFormas] = useState<FormaPagamento[]>([]);
  const [direcoes, setDirecoes] = useState<ContaDirecao[]>([]);

  const [openForm, setOpenForm] = useState(false);
  const [toDelete, setToDelete] = useState<Movimento | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Destino
  const [destinoTipo, setDestinoTipo] = useState<"nenhum" | "funcionario" | "fornecedor">("nenhum");
  const [destinoId, setDestinoId] = useState<string | number | null>(null);

  // Listas para o modal (carregadas sob demanda)
  const [funcionarios, setFuncionarios] = useState<PickerItem[]>([]);
  const [fornecedores, setFornecedores] = useState<PickerItem[]>([]);
  const [loadingFunc, setLoadingFunc] = useState(false);
  const [loadingForn, setLoadingForn] = useState(false);

  // Tipos de saída de funcionário
  const [tiposSaidaFunc, setTiposSaidaFunc] = useState<TipoSaidaFuncionario[]>([]);
  const [funcionarioTipoSaidaId, setFuncionarioTipoSaidaId] = useState<number | null>(null);
  const [loadingTipos, setLoadingTipos] = useState(false);

  // Filtro de período (✅ corrigido: removido parêntese extra)
  const [periodo, setPeriodo] = useState<{ de: string; ate: string }>({
    de: defaultStart || toLocalISODate(new Date()),
    ate: defaultEnd || toLocalISODate(new Date()),
  });

  // Visão diária (default) x por período
  const [isPeriodView, setIsPeriodView] = useState(false);

  const [form, setForm] = useState({
    data: toLocalISODate(new Date()),
    conta_id: 0 as number,            // INTEGER
    conta_corrente_id: "" as string,  // UUID
    valor_centavos: 0,
    forma_pagamento_id: 0 as number,  // INTEGER
    descricao: "",
  });
  const [valorStr, setValorStr] = useState("R$ 0,00");

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPeriodView, periodo.de, periodo.ate]);

  async function loadFuncionarios() {
    if (loadingFunc) return;
    try {
      setLoadingFunc(true);
      const r = await fetch(`${API}/funcionarios?ativos=true`, { headers: { Accept: "application/json" } });
      const list = r.ok ? await r.json().catch(() => []) : [];
      setFuncionarios((Array.isArray(list) ? list : []).map((f: any) => ({ id: f.id, nome: f.nome })));
    } finally { setLoadingFunc(false); }
  }

  async function loadFornecedores() {
    if (loadingForn) return;
    try {
      setLoadingForn(true);
      const r = await fetch(`${API}/fornecedores?ativos=true`, { headers: { Accept: "application/json" } });
      const list = r.ok ? await r.json().catch(() => []) : [];
      setFornecedores((Array.isArray(list) ? list : []).map((f: any) => ({ id: f.id, nome: f.nome })));
    } finally { setLoadingForn(false); }
  }

  async function loadTiposSaidaFuncionario() {
    if (loadingTipos) return;
    try {
      setLoadingTipos(true);
      const r = await fetch(`${API}/funcionarios/tipos-saida`, { headers: { Accept: "application/json" } });
      const list = r.ok ? await r.json().catch(() => []) : [];
      setTiposSaidaFunc(
        (Array.isArray(list) ? list : [])
          .filter((t: any) => t?.ativo !== false)
          .map((t: any) => ({ id: Number(t.id), nome: t.nome }))
      );
    } finally { setLoadingTipos(false); }
  }

  useEffect(() => {
    setDestinoId(null);
    setFuncionarioTipoSaidaId(null);
    if (destinoTipo === "funcionario") { void loadFuncionarios(); void loadTiposSaidaFuncionario(); }
    if (destinoTipo === "fornecedor") { void loadFornecedores(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinoTipo]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qp = new URLSearchParams();
      if (isPeriodView) {
        if (periodo.de) qp.set("de", periodo.de);
        if (periodo.ate) qp.set("ate", periodo.ate);
      }

      const baseUrl = `${API}/saidas?${qp.toString()}`;
      const urlFunc = `${API}/saidas/funcionarios?${qp.toString()}`;
      const urlForn = `${API}/saidas/fornecedores?${qp.toString()}`;

      const [rMov, rFunc, rForn, rC, rCC, rFP, rDir] = await Promise.all([
        fetch(baseUrl, { headers: { Accept: "application/json" } }),
        fetch(urlFunc, { headers: { Accept: "application/json" } }),
        fetch(urlForn, { headers: { Accept: "application/json" } }),
        fetch(`${API}/contas`, { headers: { Accept: "application/json" } }),
        fetch(`${API}/contas-corrente`, { headers: { Accept: "application/json" } }),
        fetch(`${API}/formas-pagamento`, { headers: { Accept: "application/json" } }),
        fetch(`${API}/ref/contas-direcao`, { headers: { Accept: "application/json" } }),
      ]);

      // Movimentos gerais
      const listMov = rMov.ok ? await rMov.json().catch(() => []) : [];
      const normMov: Movimento[] = (Array.isArray(listMov) ? listMov : []).map((m: any) => ({
        ...m,
        conta_id: Number(m.conta_id),
        forma_pagamento_id: Number(m.forma_pagamento_id),
        valor_centavos: Number(m.valor_centavos),
      }));

      // Sessões especiais
      const listFunc = rFunc.ok ? await rFunc.json().catch(() => []) : [];
      const listForn = rForn.ok ? await rForn.json().catch(() => []) : [];

      const normFunc: LinhaFunc[] = (Array.isArray(listFunc) ? listFunc : []).map((m: any) => ({
        ...m,
        conta_id: Number(m.conta_id),
        forma_pagamento_id: Number(m.forma_pagamento_id),
        valor_centavos: Number(m.valor_centavos),
      }));

      const normForn: LinhaForn[] = (Array.isArray(listForn) ? listForn : []).map((m: any) => ({
        ...m,
        conta_id: Number(m.conta_id),
        forma_pagamento_id: Number(m.forma_pagamento_id),
        valor_centavos: Number(m.valor_centavos),
      }));

      setRows(normMov);
      setRowsFunc(normFunc);
      setRowsForn(normForn);
      setLoadingFuncRows(false);
      setLoadingFornRows(false);

      // dados auxiliares
      const [listC, listCC, listFP, listDir] = [
        rC.ok ? await rC.json().catch(() => []) : [],
        rCC.ok ? await rCC.json().catch(() => []) : [],
        rFP.ok ? await rFP.json().catch(() => []) : [],
        rDir.ok ? await rDir.json().catch(() => []) : [],
      ];

      setContas((Array.isArray(listC) ? listC : [])
        .filter((c: any) => c?.ativa)
        .map((c: any) => ({
          ...c,
          id: Number(c.id),
          conta_direcao_id: c.conta_direcao_id == null ? null : Number(c.conta_direcao_id),
        }))
      );

      setContasCorrente((Array.isArray(listCC) ? listCC : []).filter((c: any) => c?.ativa));
      setFormas((Array.isArray(listFP) ? listFP : []).map((f: any) => ({ id: Number(f.id), nome: f.nome })));
      setDirecoes((Array.isArray(listDir) ? listDir : []).map((d: any) => ({ id: Number(d.id), nome: d.nome })));

      if (!rMov.ok) console.error("Falha ao carregar /saidas:", rMov.status, await rMov.text().catch(() => ""));
      if (!rFunc.ok) console.error("Falha ao carregar /saidas/funcionarios:", rFunc.status, await rFunc.text().catch(() => ""));
      if (!rForn.ok) console.error("Falha ao carregar /saidas/fornecedores:", rForn.status, await rForn.text().catch(() => ""));
    } catch (e) {
      console.error(e);
      setError("Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  const findByName = (name: string) =>
    direcoes.find((d) => String(d.nome).toLowerCase() === name.toLowerCase())?.id;

  const idSaida = findByName("Saida");
  const idNeutra = findByName("Neutra");

  // Contas de SAÍDA (Saida ou Neutra)
  const contasSaida = useMemo(() => {
    if (!contas?.length) return [];
    return contas.filter((c) => {
      const id = c.conta_direcao_id == null ? "" : String(c.conta_direcao_id);
      return (
        (idSaida != null && id === String(idSaida)) ||
        (idNeutra != null && id === String(idNeutra))
      );
    });
  }, [contas, idSaida, idNeutra]);

  const cols = useMemo(
    () => [
      { w: "12%" }, // Data
      { w: "32%" }, // Classificação / Destino
      { w: "24%" }, // Conta corrente
      { w: "14%" }, // Forma pagamento
      { w: "10%" }, // Valor
      { w: "8%" },  // Ações
    ],
    []
  );

  const todayStr = toLocalISODate(new Date());

  // IDs reservados: movimentos exibidos nas sessões especiais não aparecem em Hoje/Anteriores
  const idsFunc = useMemo(() => new Set(rowsFunc.map(r => r.id)), [rowsFunc]);
  const idsForn = useMemo(() => new Set(rowsForn.map(r => r.id)), [rowsForn]);
  const idsReservados = useMemo(() => new Set<string>([...idsFunc, ...idsForn]), [idsFunc, idsForn]);

  const { hoje, anteriores } = useMemo(() => {
    const h: Movimento[] = [];
    const a: Movimento[] = [];
    const baseToday = todayStr || toLocalISODate(new Date());
    const today = new Date((baseToday || "1970-01-01") + "T00:00:00");
    const start20 = new Date(today.getTime() - 20 * 24 * 60 * 60 * 1000);

    for (const r of rows) {
      if (idsReservados.has(r.id)) continue;

      const dStr = normalizeISODate(r?.data as any);
      if (!dStr) continue;
      const d = new Date(dStr + "T00:00:00");
      if (!isValidDate(d)) continue;

      if (dStr === baseToday) h.push(r);
      else if (d >= start20 && d < today) a.push(r);
    }
    return { hoje: h, anteriores: a };
  }, [rows, todayStr, idsReservados]);

  async function applyFilter() {
    if (!isPeriodView) setIsPeriodView(true);
  }
  async function last7days() {
    const end = new Date();
    const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
    setPeriodo({
      de: toLocalISODate(start),
      ate: toLocalISODate(end),
    });
    if (!isPeriodView) setIsPeriodView(true);
  }
  function resetDailyView() {
    setIsPeriodView(false);
  }

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);

    if (!form.conta_id || !form.conta_corrente_id || !form.forma_pagamento_id || !form.valor_centavos) {
      setError("Preencha todos os campos obrigatórios.");
      return;
    }
    if (destinoTipo !== "nenhum" && !destinoId) {
      setError("Selecione o destino.");
      return;
    }
    if (destinoTipo === "funcionario" && !funcionarioTipoSaidaId) {
      setError("Selecione o Tipo de Saída do Funcionário.");
      return;
    }

    try {
      const payload: any = {
        data: form.data,
        conta_id: Number(form.conta_id),
        conta_corrente_id: form.conta_corrente_id,
        valor_centavos: Number(form.valor_centavos || 0),
        direcao: "pago" as const,
        forma_pagamento_id: Number(form.forma_pagamento_id),
        descricao: form.descricao || null,
        destino_tipo: destinoTipo,
      };
      if (destinoTipo !== "nenhum") payload.destino_id = destinoId as any;
      if (destinoTipo === "funcionario") payload.funcionario_tipo_saida_id = Number(funcionarioTipoSaidaId);

      const r = await fetch(`${API}/saidas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        setError(t || `Erro ao salvar (${r.status})`);
        return;
      }

      setOpenForm(false);
      setIsPeriodView(false);
      setForm({
        data: toLocalISODate(new Date()),
        conta_id: 0,
        conta_corrente_id: "",
        valor_centavos: 0,
        forma_pagamento_id: 0,
        descricao: "",
      });
      setValorStr("R$ 0,00");
      setDestinoTipo("nenhum");
      setDestinoId(null);
      setFuncionarioTipoSaidaId(null);
      await load();
    } catch (e) {
      console.error(e);
      setError("Falha de rede.");
    }
  }

  async function remove(id: string) {
    const r = await fetch(`${API}/saidas/${id}`, { method: "DELETE", headers: { Accept: "application/json" } });
    if (r.status === 204) {
      setToDelete(null);
      await load();
    } else if (!r.ok) {
      const t = await r.text().catch(() => "");
      setError(t || `Erro ao excluir (${r.status})`);
    }
  }

  return (
    <>
      {/* Cabeçalho / Filtros */}
      <div className="card header-line" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, marginRight: "auto", fontSize: 20 }}>Saídas</h1>
        <label className="label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>De</span>
          <input className="input" type="date" value={periodo.de}
            onChange={(e) => setPeriodo((p) => ({ ...p, de: e.target.value }))} />
        </label>
        <label className="label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>Até</span>
          <input className="input" type="date" value={periodo.ate}
            onChange={(e) => setPeriodo((p) => ({ ...p, ate: e.target.value }))} />
        </label>
        <button className="btn" onClick={applyFilter}>Aplicar</button>
        <button className="btn" onClick={last7days}>Últimos 7 dias</button>
        {isPeriodView ? (
          <button className="btn" onClick={resetDailyView}>Visão diária</button>
        ) : (
          <button className="btn" onClick={applyFilter}>Visão por período</button>
        )}
        <button className="btn primary" onClick={() => { setOpenForm(true); setError(null); }}>+ Nova Saída</button>
      </div>

      {/* Visão por período */}
      {isPeriodView ? (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h4 style={{ margin: 0 }}>
              Período: {formatDateBR(periodo.de)} – {formatDateBR(periodo.ate)}
            </h4>
            <button className="btn" onClick={load}>{loading ? "Atualizando…" : "Atualizar"}</button>
          </div>

          <table className="table">
            <colgroup>{[{w:"12%"},{w:"32%"},{w:"24%"},{w:"14%"},{w:"10%"},{w:"8%"}].map((c, i) => <col key={i} style={{ width: c.w }} />)}</colgroup>
            <thead>
              <tr>
                <th>Data</th>
                <th>Classificação</th>
                <th>Conta Corrente</th>
                <th>Forma Pagamento</th>
                <th>Valor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="empty">Carregando…</td></tr>}
              {!loading && rows.map((m) => (
                <tr key={m.id}>
                  <td>{formatDateBR(m.data)}</td>
                  <td>{m.conta_codigo ? `${m.conta_codigo} — ${m.conta_nome}` : (m.conta_nome || "—")}</td>
                  <td>{m.conta_corrente_nome || "—"}</td>
                  <td>{m.forma_pagamento_nome || "—"}</td>
                  <td>{formatBRL(m.valor_centavos)}</td>
                  <td><button className="btn danger" onClick={() => setToDelete(m)}>Excluir</button></td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={6} className="empty">Sem saídas no período selecionado.</td></tr>
              )}
            </tbody>
          </table>
          {error && <div style={{ color: "#d93025", marginTop: 8 }}>{error}</div>}
        </div>
      ) : (
        <>
          {/* HOJE */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h4 style={{ margin: 0 }}>Hoje ({formatDateBR(todayStr)})</h4>
              <button className="btn" onClick={load}>{loading ? "Atualizando…" : "Atualizar"}</button>
            </div>
            <table className="table">
              <colgroup>{cols.map((c, i) => <col key={i} style={{ width: c.w }} />)}</colgroup>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Classificação</th>
                  <th>Conta Corrente</th>
                  <th>Forma Pagamento</th>
                  <th>Valor</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={6} className="empty">Carregando…</td></tr>}
                {!loading && hoje.map((m) => (
                  <tr key={m.id}>
                    <td>{formatDateBR(m.data)}</td>
                    <td>{m.conta_codigo ? `${m.conta_codigo} — ${m.conta_nome}` : (m.conta_nome || "—")}</td>
                    <td>{m.conta_corrente_nome || "—"}</td>
                    <td>{m.forma_pagamento_nome || "—"}</td>
                    <td>{formatBRL(m.valor_centavos)}</td>
                    <td><button className="btn danger" onClick={() => setToDelete(m)}>Excluir</button></td>
                  </tr>
                ))}
                {!loading && hoje.length === 0 && <tr><td colSpan={6} className="empty">Sem saídas hoje.</td></tr>}
              </tbody>
            </table>
          </div>

          {/* 🔹 Saídas por Funcionários */}
          {rowsFunc.length > 0 && (
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <h4 style={{ margin: 0 }}>Saídas por Funcionários</h4>
                <button className="btn" onClick={load}>{loadingFuncRows ? "Atualizando…" : "Atualizar"}</button>
              </div>
              <table className="table">
                <colgroup>{cols.map((c, i) => <col key={i} style={{ width: c.w }} />)}</colgroup>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Funcionário / Tipo de Saída</th>
                    <th>Conta Corrente</th>
                    <th>Forma Pagamento</th>
                    <th>Valor</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rowsFunc.map((m) => (
                    <tr key={m.id}>
                      <td>{formatDateBR(m.data)}</td>
                      <td>
                        {(m.destino_nome || "—")}
                        {m.tipo_saida_nome ? ` — ${m.tipo_saida_nome}` : ""}
                      </td>
                      <td>{m.conta_corrente_nome || "—"}</td>
                      <td>{m.forma_pagamento_nome || "—"}</td>
                      <td>{formatBRL(m.valor_centavos)}</td>
                      <td><button className="btn danger" onClick={() => setToDelete(m)}>Excluir</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 🔹 Saídas por Fornecedores */}
          {rowsForn.length > 0 && (
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <h4 style={{ margin: 0 }}>Saídas por Fornecedores</h4>
                <button className="btn" onClick={load}>{loadingFornRows ? "Atualizando…" : "Atualizar"}</button>
              </div>
              <table className="table">
                <colgroup>{cols.map((c, i) => <col key={i} style={{ width: c.w }} />)}</colgroup>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Fornecedor</th>
                    <th>Conta Corrente</th>
                    <th>Forma Pagamento</th>
                    <th>Valor</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rowsForn.map((m) => (
                    <tr key={m.id}>
                      <td>{formatDateBR(m.data)}</td>
                      <td>{m.destino_nome || "—"}</td>
                      <td>{m.conta_corrente_nome || "—"}</td>
                      <td>{m.forma_pagamento_nome || "—"}</td>
                      <td>{formatBRL(m.valor_centavos)}</td>
                      <td><button className="btn danger" onClick={() => setToDelete(m)}>Excluir</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Anteriores */}
          <div className="card">
            <h4 style={{ margin: 0 }}>Anteriores (até 20 dias)</h4>
            <table className="table">
              <colgroup>{cols.map((c, i) => <col key={i} style={{ width: c.w }} />)}</colgroup>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Classificação</th>
                  <th>Conta Corrente</th>
                  <th>Forma Pagamento</th>
                  <th>Valor</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={6} className="empty">Carregando…</td></tr>}
                {!loading && anteriores.map((m) => (
                  <tr key={m.id}>
                    <td>{formatDateBR(m.data)}</td>
                    <td>{m.conta_codigo ? `${m.conta_codigo} — ${m.conta_nome}` : (m.conta_nome || "—")}</td>
                    <td>{m.conta_corrente_nome || "—"}</td>
                    <td>{m.forma_pagamento_nome || "—"}</td>
                    <td>{formatBRL(m.valor_centavos)}</td>
                    <td><button className="btn danger" onClick={() => setToDelete(m)}>Excluir</button></td>
                  </tr>
                ))}
                {!loading && anteriores.length === 0 && <tr><td colSpan={6} className="empty">Sem saídas anteriores (20 dias).</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal Nova Saída */}
      <Modal open={openForm} title="Nova Saída" onClose={() => setOpenForm(false)} size="md">
        <form className="form-grid" onSubmit={save}>
          <label>
            <span className="label">Data</span>
            <input className="input" type="date" value={form.data}
              onChange={e => setForm({ ...form, data: e.target.value })} required />
          </label>

          <label>
            <span className="label">Classificação</span>
            <select
              className="input"
              value={form.conta_id || ""}
              onChange={e => setForm({ ...form, conta_id: e.target.value ? Number(e.target.value) : 0 })}
              required
            >
              <option value="">Selecione…</option>
              {contasSaida.map(c => (
                <option key={c.id} value={c.id}>
                  {c.codigo ? `${c.codigo} — ${c.nome}` : c.nome}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="label">Conta Corrente</span>
            <select
              className="input"
              value={form.conta_corrente_id}
              onChange={e => setForm({ ...form, conta_corrente_id: e.target.value })}
              required
            >
              <option value="">Selecione…</option>
              {contasCorrente.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>

          <label>
            <span className="label">Forma de Pagamento</span>
            <select
              className="input"
              value={form.forma_pagamento_id || ""}
              onChange={e => setForm({ ...form, forma_pagamento_id: e.target.value ? Number(e.target.value) : 0 })}
              required
            >
              <option value="">Selecione…</option>
              {formas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </label>

          <label>
            <span className="label">Valor</span>
            <input
              className="input"
              value={valorStr}
              onChange={(e) => {
                const d = e.target.value.replace(/\D/g, "");
                setValorStr(digitsToBRL(d));
                setForm({ ...form, valor_centavos: digitsToCentavos(d) });
              }}
              required
            />
          </label>

          <label className="form-grid-span">
            <span className="label">Descrição (opcional)</span>
            <input className="input" value={form.descricao}
              onChange={e => setForm({ ...form, descricao: e.target.value })} />
          </label>

          {/* Destino opcional */}
          <label>
            <span className="label">Tipo de Destino</span>
            <select className="input" value={destinoTipo} onChange={(e) => setDestinoTipo(e.target.value as any)}>
              <option value="nenhum">Nenhum</option>
              <option value="funcionario">Funcionário</option>
              <option value="fornecedor">Fornecedor</option>
            </select>
          </label>

          {destinoTipo === "funcionario" && (
            <>
              <label>
                <span className="label">Funcionário</span>
                <select
                  className="input"
                  value={destinoId ?? ""}
                  onChange={(e) => setDestinoId(e.target.value || null)}
                  required
                >
                  <option value="">{loadingFunc ? "Carregando…" : "Selecione…"}</option>
                  {funcionarios.map(f => <option key={String(f.id)} value={String(f.id)}>{f.nome}</option>)}
                </select>
              </label>

              <label>
                <span className="label">Tipo de Saída (Funcionário)</span>
                <select
                  className="input"
                  value={funcionarioTipoSaidaId ?? ""}
                  onChange={(e) => setFuncionarioTipoSaidaId(e.target.value ? Number(e.target.value) : null)}
                  required
                >
                  <option value="">{loadingTipos ? "Carregando…" : "Selecione…"}</option>
                  {tiposSaidaFunc.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </label>
            </>
          )}

          {destinoTipo === "fornecedor" && (
            <label className="form-grid-span">
              <span className="label">Fornecedor</span>
              <select
                className="input"
                value={destinoId ?? ""}
                onChange={(e) => setDestinoId(e.target.value || null)}
                required
              >
                <option value="">{loadingForn ? "Carregando…" : "Selecione…"}</option>
                {fornecedores.map(f => <option key={String(f.id)} value={String(f.id)}>{f.nome}</option>)}
              </select>
            </label>
          )}

          <div className="modal-footer" style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            {error && <span className="field-error" style={{ marginRight: "auto", color: "#d93025" }}>{error}</span>}
            <button type="button" className="btn" onClick={() => setOpenForm(false)}>Cancelar</button>
            <button type="submit" className="btn primary">Salvar</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title={toDelete ? `Excluir saída de ${formatBRL(toDelete.valor_centavos)}?` : "Excluir"}
        message="Essa ação não pode ser desfeita."
        onClose={() => setToDelete(null)}
        onConfirm={async () => { if (toDelete) await remove(toDelete.id); }}
      />

      {/* Estilo */}
      <style>{`
        .header-line{ gap:12px; }
        .btn { appearance:none; border:1px solid #d0d7de; background:#fff; padding:8px 12px; border-radius:8px; cursor:pointer;
               font-size:14px; line-height:20px; transition:.15s; }
        .btn:hover{ background:#f6f8fa; }
        .btn:disabled{ opacity:.6; cursor:not-allowed; }
        .btn.primary{ background:#1f6feb; color:#fff; border-color:#1f6feb; }
        .btn.primary:hover{ filter:brightness(.95); }
        .btn.danger{ border-color:#d93025; color:#d93025; background:#fff; }
        .btn.danger:hover{ background:#fdecea; }

        .table .empty{ color:#5f6b7a; text-align:center; padding:16px 0; }
        .form-grid { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:12px; }
        .form-grid-span { grid-column: 1 / -1; }
        @media (max-width: 720px){ .form-grid{ grid-template-columns: 1fr; } }
        .label{ display:flex; align-items:center; gap:8px; color:#4a5568; font-size:12px; }
        .input{ width:100%; padding:8px 10px; border:1px solid #d0d7de; border-radius:8px; }
      `}</style>
    </>
  );
}
