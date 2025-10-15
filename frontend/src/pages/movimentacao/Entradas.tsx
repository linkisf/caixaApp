// src/pages/entradas/Index.tsx
import React, { useEffect, useMemo, useState } from "react";
import Modal from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";

/* ================= Tipagens ================= */
type Movimento = {
  id: string; // uuid
  data: string; // "YYYY-MM-DD" ou ISO
  conta_id: number;           // INTEGER
  conta_codigo?: string;
  conta_nome?: string;
  conta_corrente_id: string;  // UUID
  conta_corrente_nome?: string;
  valor_centavos: number;
  direcao: "recebido" | "pago" | "entrada";
  forma_pagamento_id: number; // INTEGER
  forma_pagamento_nome?: string;
  descricao: string | null;
  criado_em?: string;
};

type ContaGerencial = {
  id: number;   // INTEGER
  codigo: string;
  nome: string;
  ativa: boolean;
  conta_direcao_id?: number | null;
};

type ContaCorrente = { id: string; nome: string; ativa: boolean }; // UUID
type FormaPagamento = { id: number; nome: string };
type ContaDirecao = { id: number; nome: "Entrada" | "Saida" | "Neutra" | string };

const API = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL ?? "/api");

/* ================= Helpers (corrigidos) ================= */
const pad2 = (n: number) => String(n).padStart(2, "0");

/** Data local -> "YYYY-MM-DD" sem conversões de fuso/DST */
const ymdLocal = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const formatBRL = (c: number) =>
  ((c ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const digitsToBRL = (digits: string) =>
  (Number(digits.replace(/\D/g, "") || "0") / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const digitsToCentavos = (digits: string) => Number(digits.replace(/\D/g, "") || "0");

/** Normaliza "YYYY-MM-DD" ou ISO -> "YYYY-MM-DD" sem deslocar fuso */
const normalizeISODate = (s: string) => {
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // se vier "2025-10-13T00:00:00.000Z" ou similar, pegamos só a parte da data
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  // fallback: constrói por componentes locais
  const d = new Date(s);
  return ymdLocal(d);
};

/** Exibe dd/mm/aaaa a partir de "YYYY-MM-DD" sem deslocar */
const formatDateBR = (s: string) => {
  const [y, m, d] = normalizeISODate(s).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("pt-BR");
};

/* ================= Componente ================= */
const defaultEnd = ymdLocal(new Date());
const defaultStart = ymdLocal(new Date(Date.now() - 19 * 24 * 60 * 60 * 1000)); // 20 dias

export default function Entradas() {
  const [rows, setRows] = useState<Movimento[]>([]);
  const [loading, setLoading] = useState(false);

  const [contas, setContas] = useState<ContaGerencial[]>([]);
  const [contasCorrente, setContasCorrente] = useState<ContaCorrente[]>([]);
  const [formas, setFormas] = useState<FormaPagamento[]>([]);
  const [direcoes, setDirecoes] = useState<ContaDirecao[]>([]);

  const [openForm, setOpenForm] = useState(false);
  const [toDelete, setToDelete] = useState<Movimento | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [periodo, setPeriodo] = useState<{ de: string; ate: string }>({ de: defaultStart, ate: defaultEnd });

  // Inicia na visão DIÁRIA
  const [isPeriodView, setIsPeriodView] = useState(false);

  const [form, setForm] = useState({
    data: ymdLocal(new Date()),
    conta_id: 0 as number,            // INTEGER
    conta_corrente_id: "" as string,  // UUID
    valor_centavos: 0,
    forma_pagamento_id: 0 as number,  // INTEGER
    descricao: "",
  });
  const [valorStr, setValorStr] = useState("R$ 0,00");

  // Recarrega ao mudar visão / período
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPeriodView, periodo.de, periodo.ate]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qp = new URLSearchParams();
      // Só aplica filtro quando a visão por período está ativa
      if (isPeriodView) {
        if (periodo.de) qp.set("de", periodo.de);
        if (periodo.ate) qp.set("ate", periodo.ate);
      }

      const [rMov, rC, rCC, rFP, rDir] = await Promise.all([
        fetch(`${API}/entradas?${qp.toString()}`, { headers: { Accept: "application/json" } }),
        fetch(`${API}/contas`, { headers: { Accept: "application/json" } }),
        fetch(`${API}/contas-corrente`, { headers: { Accept: "application/json" } }),
        fetch(`${API}/formas-pagamento`, { headers: { Accept: "application/json" } }),
        fetch(`${API}/ref/contas-direcao`, { headers: { Accept: "application/json" } }),
      ]);

      const listMov = rMov.ok ? await rMov.json().catch(() => []) : [];
      const listC = rC.ok ? await rC.json().catch(() => []) : [];
      const listCC = rCC.ok ? await rCC.json().catch(() => []) : [];
      const listFP = rFP.ok ? await rFP.json().catch(() => []) : [];
      const listDir = rDir.ok ? await rDir.json().catch(() => []) : [];

      setRows(
        (Array.isArray(listMov) ? listMov : []).map((m: any) => ({
          ...m,
          conta_id: Number(m.conta_id),
          forma_pagamento_id: Number(m.forma_pagamento_id),
          valor_centavos: Number(m.valor_centavos),
        }))
      );

      setContas((Array.isArray(listC) ? listC : [])
        .filter((c: any) => c?.ativa)
        .map((c: any) => ({
          ...c,
          id: Number(c.id),
          conta_direcao_id: c.conta_direcao_id == null ? null : Number(c.conta_direcao_id),
        })));

      setContasCorrente((Array.isArray(listCC) ? listCC : []).filter((c: any) => c?.ativa));
      setFormas((Array.isArray(listFP) ? listFP : []).map((f: any) => ({ id: Number(f.id), nome: f.nome })));
      setDirecoes((Array.isArray(listDir) ? listDir : []).map((d: any) => ({ id: Number(d.id), nome: d.nome })));

      if (!rMov.ok) console.error("Falha ao carregar /entradas:", rMov.status, await rMov.text().catch(() => ""));
    } catch (e) {
      console.error(e);
      setError("Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  const findByName = (name: string) =>
    direcoes.find((d) => String(d.nome).toLowerCase() === name.toLowerCase())?.id;

  const idEntrada = findByName("Entrada");
  const idNeutra = findByName("Neutra");

  const contasEntrada = useMemo(() => {
    if (!contas?.length) return [];
    return contas.filter((c) => {
      const id = c.conta_direcao_id == null ? "" : String(c.conta_direcao_id);
      return (
        (idEntrada != null && id === String(idEntrada)) ||
        (idNeutra != null && id === String(idNeutra))
      );
    });
  }, [contas, idEntrada, idNeutra]);

  const cols = useMemo(
    () => [
      { w: "12%" }, // Data
      { w: "32%" }, // Classificação
      { w: "24%" }, // Conta corrente
      { w: "14%" }, // Forma pagamento
      { w: "10%" }, // Valor
      { w: "8%" },  // Ações
    ],
    []
  );

  const todayStr = ymdLocal(new Date());
  const { hoje, anteriores } = useMemo(() => {
    const h: Movimento[] = [];
    const a: Movimento[] = [];
    const today = new Date(todayStr + "T00:00:00");
    const start20 = new Date(today.getTime() - 20 * 24 * 60 * 60 * 1000);

    for (const r of rows) {
      const dStr = normalizeISODate(r.data);
      const d = new Date(dStr + "T00:00:00");
      if (dStr === todayStr) h.push(r);
      else if (d >= start20 && d < today) a.push(r);
    }
    return { hoje: h, anteriores: a };
  }, [rows, todayStr]);

  async function applyFilter() {
    if (!isPeriodView) setIsPeriodView(true);
  }

  async function last7days() {
    setPeriodo({
      de: ymdLocal(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)),
      ate: ymdLocal(new Date()),
    });
    if (!isPeriodView) setIsPeriodView(true);
  }

  async function resetDailyView() {
    setIsPeriodView(false);
  }

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);

    if (!form.conta_id || !form.conta_corrente_id || !form.forma_pagamento_id || !form.valor_centavos) {
      setError("Preencha todos os campos obrigatórios.");
      return;
    }

    try {
      const payload = {
        data: form.data,
        conta_id: Number(form.conta_id),
        conta_corrente_id: form.conta_corrente_id,
        valor_centavos: Number(form.valor_centavos || 0),
        direcao: "recebido" as const,
        forma_pagamento_id: Number(form.forma_pagamento_id),
        descricao: form.descricao || null,
      };

      const r = await fetch(`${API}/entradas`, {
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
        data: ymdLocal(new Date()),
        conta_id: 0,
        conta_corrente_id: "",
        valor_centavos: 0,
        forma_pagamento_id: 0,
        descricao: "",
      });
      setValorStr("R$ 0,00");
      await load();
    } catch (e) {
      console.error(e);
      setError("Falha de rede.");
    }
  }

  async function remove(id: string) {
    const r = await fetch(`${API}/entradas/${id}`, { method: "DELETE", headers: { Accept: "application/json" } });
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
        <h1 style={{ margin: 0, marginRight: "auto", fontSize: 20 }}>Entradas</h1>
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
        <button className="btn primary" onClick={() => { setOpenForm(true); setError(null); }}>+ Nova Entrada</button>
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
                <tr><td colSpan={6} className="empty">Sem entradas no período selecionado.</td></tr>
              )}
            </tbody>
          </table>
          {error && <div style={{ color: "#d93025", marginTop: 8 }}>{error}</div>}
        </div>
      ) : (
        <>
          {/* Hoje */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h4 style={{ margin: 0 }}>Hoje ({formatDateBR(todayStr)})</h4>
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
                {!loading && hoje.length === 0 && <tr><td colSpan={6} className="empty">Sem entradas hoje.</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Anteriores (20 dias) */}
          <div className="card">
            <h4 style={{ margin: 0 }}>Anteriores (até 20 dias)</h4>
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
                {!loading && anteriores.length === 0 && <tr><td colSpan={6} className="empty">Sem entradas anteriores (20 dias).</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal de criação */}
      <Modal open={openForm} title="Nova Entrada" onClose={() => setOpenForm(false)} size="md">
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
              {contasEntrada.map(c => (
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

          <div className="modal-footer" style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            {error && <span className="field-error" style={{ marginRight: "auto", color: "#d93025" }}>{error}</span>}
            <button type="button" className="btn" onClick={() => setOpenForm(false)}>Cancelar</button>
            <button type="submit" className="btn primary">Salvar</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title={toDelete ? `Excluir entrada de ${formatBRL(toDelete.valor_centavos)}?` : "Excluir"}
        message="Essa ação não pode ser desfeita."
        onClose={() => setToDelete(null)}
        onConfirm={async () => { if (toDelete) await remove(toDelete.id); }}
      />

      {/* Estilo harmônico */}
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
