// src/pages/planoDeContas/ContaCorrente.tsx
import React, { useEffect, useMemo, useState } from "react";
import Modal from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";

type ContaCorrente = {
  id: string;
  nome: string;
  banco: string | null;
  agencia: string | null;
  numero: string | null;
  tipo: "interna" | "externa";
  saldo_inicial_centavos: number;     // agora sempre presente
  saldo_atual_centavos: number;
  ativa: boolean;
  criado_em?: string;
  modificado_em?: string;
};

const API = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL ?? "/api");

const formatBRL = (centavos: number) =>
  ((centavos ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// helpers de moeda baseados em dígitos
const digitsToBRL = (digits: string) => {
  const only = digits.replace(/\D/g, "");
  const n = Number(only || "0");
  return ((n ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};
const digitsToCentavos = (digits: string) => {
  const only = digits.replace(/\D/g, "");
  const n = Number(only || "0");
  return n; // já em centavos
};

export default function ContaCorrentePage() {
  const [rows, setRows] = useState<ContaCorrente[]>([]);
  const [loading, setLoading] = useState(false);

  const [openForm, setOpenForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [current, setCurrent] = useState<Partial<ContaCorrente> | null>(null);
  const [toDelete, setToDelete] = useState<ContaCorrente | null>(null);
  const [error, setError] = useState<string | null>(null);

  // input (mascarado) do saldo inicial na CRIAÇÃO
  const [saldoInicialStr, setSaldoInicialStr] = useState<string>("R$ 0,00");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/contas-corrente`, { headers: { Accept: "application/json" } });
      const list = r.ok ? await r.json().catch(() => []) : [];
      setRows(Array.isArray(list) ? list : []);
      if (!r.ok) console.error("Falha /contas-corrente:", r.status, await r.text().catch(() => ""));
    } catch (e) {
      console.error(e);
      setError("Falha ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  function validarConta(): boolean {
    if (!current) return false;
    if (!current.nome || !current.tipo) return false;
    return true;
  }

  async function saveConta(e?: React.FormEvent) {
    e?.preventDefault();
    if (!current) return;
    if (!validarConta()) { setError("Preencha os campos obrigatórios."); return; }

    const payload = {
      nome: String(current.nome ?? "").trim(),
      banco: (current.banco ?? "") || null,
      agencia: (current.agencia ?? "") || null,
      numero: (current.numero ?? "") || null,
      tipo: current.tipo as "interna" | "externa",
      ativa: current.ativa ?? true,
      // somente na criação: manda saldo_inicial_centavos
      ...(current.id ? {} : { saldo_inicial_centavos: Number(current.saldo_inicial_centavos || 0) }),
    };

    const method = current.id ? "PUT" : "POST";
    const url = current.id ? `${API}/contas-corrente/${current.id}` : `${API}/contas-corrente`;

    try {
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        setError(txt || `Erro ao salvar (${r.status})`);
        return;
      }
      // sem criar movimento de abertura aqui — saldo inicial vem direto do backend
      setOpenForm(false);
      setIsEditing(false);
      setCurrent(null);
      await load();
    } catch (err) {
      console.error(err);
      setError("Falha de rede ao salvar.");
    }
  }

  async function removeConta(id: string) {
    try {
      const r = await fetch(`${API}/contas-corrente/${id}`, { method: "DELETE", headers: { Accept: "application/json" } });
      if (r.status === 204) { await load(); return; }
      alert((await r.text().catch(() => "")) || `Erro ao excluir (${r.status})`);
    } catch (e) {
      console.error(e); alert("Falha de rede ao excluir.");
    }
  }

  const cols = useMemo(() => ([
    { w: '22%' }, // Nome
    { w: '26%' }, // Banco/Agência/Número
    { w: '12%' }, // Tipo
    { w: '20%' }, // Saldo Atual
    { w: '12%' }, // Saldo Inicial (novo, visível na tabela para conferência)
    { w: '8%'  }, // Status
  ]), []);

  return (
    <>
      <div className="card" style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <h2 style={{ margin:0 }}>Conta Corrente</h2>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn" onClick={load}>Atualizar</button>
          <button
            className="btn primary"
            onClick={() => {
              setCurrent({
                nome: "", banco: "", agencia: "", numero: "", tipo: "interna",
                saldo_inicial_centavos: 0, ativa: true,
              });
              setSaldoInicialStr("R$ 0,00");
              setIsEditing(true);
              setOpenForm(true);
            }}
          >
            + Adicionar
          </button>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <colgroup>{cols.map((c,i)=><col key={i} style={{width:c.w}}/>)}</colgroup>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Banco / Agência / Nº</th>
              <th>Tipo</th>
              <th>Saldo Atual</th>
              <th>Saldo Inicial</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="empty">Carregando…</td></tr>}
            {!loading && rows.map(r => (
              <tr key={r.id} className="row-click" style={{ cursor:"pointer" }}
                  onClick={() => { setCurrent({ ...r }); setIsEditing(false); setOpenForm(true); }}>
                <td>{r.nome}</td>
                <td>{[r.banco, r.agencia, r.numero].filter(Boolean).join(" / ") || "—"}</td>
                <td>{r.tipo === "interna" ? "Interna" : "Externa"}</td>
                <td>{formatBRL(r.saldo_atual_centavos)}</td>
                <td>{formatBRL(r.saldo_inicial_centavos ?? 0)}</td>
                <td>
                  <span className={`status-badge ${r.ativa ? "status-badge--active" : "status-badge--inactive"}`}>
                    {r.ativa ? "Ativo" : "Inativo"}
                  </span>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="empty" style={{ color:"var(--muted)" }}>Nenhuma conta corrente cadastrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ===== Modal ===== */}
      <Modal
        open={openForm}
        title={current?.id ? (isEditing ? "Editar Conta Corrente" : "Detalhes da Conta Corrente") : "Nova Conta Corrente"}
        onClose={() => { setOpenForm(false); setCurrent(null); setIsEditing(false); setError(null); }}
        size="lg"
      >
        {current && (
          <form
            className="cc-modal-grid"
            onSubmit={(e) => { e.preventDefault(); if (isEditing) saveConta(); else setIsEditing(true); }}
          >
            {/* Nome (2 colunas) */}
            <label className="cc-field cc-col-2">
              <span className="cc-label">Nome</span>
              <input className="input" value={current.nome ?? ""} onChange={e => setCurrent({ ...current, nome: e.target.value })} disabled={!isEditing} required />
            </label>

            {/* Banco / Agência */}
            <label className="cc-field">
              <span className="cc-label">Banco</span>
              <input className="input" value={current.banco ?? ""} onChange={e => setCurrent({ ...current, banco: e.target.value })} disabled={!isEditing} />
            </label>

            <label className="cc-field">
              <span className="cc-label">Agência</span>
              <input className="input" value={current.agencia ?? ""} onChange={e => setCurrent({ ...current, agencia: e.target.value })} disabled={!isEditing} />
            </label>

            {/* Número / Tipo */}
            <label className="cc-field">
              <span className="cc-label">Número</span>
              <input className="input" value={current.numero ?? ""} onChange={e => setCurrent({ ...current, numero: e.target.value })} disabled={!isEditing} />
            </label>

            <label className="cc-field">
              <span className="cc-label">Tipo</span>
              <div className="cc-select-wrap">
                <select className="input cc-select" value={current.tipo ?? "interna"} onChange={e => setCurrent({ ...current, tipo: e.target.value as "interna"|"externa" })} disabled={!isEditing}>
                  <option value="interna">Interna</option>
                  <option value="externa">Externa</option>
                </select>
                <span className="cc-chevron" aria-hidden>▾</span>
              </div>
            </label>

            {/* Saldo inicial */}
            <label className="cc-field">
              <span className="cc-label">Saldo inicial {current.id ? "(informativo)" : "(apenas na criação)"}</span>

              {current.id ? (
                <input className="input" value={formatBRL(current.saldo_inicial_centavos ?? 0)} readOnly disabled />
              ) : (
                <input
                  className="input"
                  value={saldoInicialStr}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "");
                    setSaldoInicialStr(digitsToBRL(digits));
                    setCurrent(c => ({ ...(c || {}), saldo_inicial_centavos: digitsToCentavos(digits) }));
                  }}
                  disabled={!isEditing}
                />
              )}
              {!current.id && <small className="cc-hint">Esse valor será salvo como saldo inicial da conta.</small>}
            </label>

            {/* Saldo atual (read-only) */}
            <label className={`cc-field ${current.id ? "" : "cc-align-bottom"}`}>
              <span className="cc-label">Saldo atual</span>
              <input className="input" value={formatBRL(current.saldo_atual_centavos ?? 0)} readOnly disabled />
            </label>

            {/* Status */}
            <label className="cc-field">
              <span className="cc-label">Status</span>
              <div className="cc-select-wrap">
                <select className="input cc-select" value={current.ativa ? "true" : "false"} onChange={e => setCurrent({ ...current, ativa: e.target.value === "true" })} disabled={!isEditing}>
                  <option value="true">Ativa</option>
                  <option value="false">Inativa</option>
                </select>
                <span className="cc-chevron" aria-hidden>▾</span>
              </div>
            </label>

            <div className="modal-footer cc-col-2" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              {error && <span className="field-error" style={{ marginRight:"auto" }}>{error}</span>}
              <button type="button" className="btn" onClick={() => { setOpenForm(false); setCurrent(null); setIsEditing(false); setError(null); }}>
                Fechar
              </button>
              <button type="submit" className="btn primary">
                {isEditing ? (current.id ? "Salvar alterações" : "Salvar") : "Editar"}
              </button>
              {current.id && <button type="button" className="btn danger" onClick={() => setToDelete(current as any)}>Excluir</button>}
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title={toDelete ? `Excluir "${toDelete.nome}"?` : "Excluir"}
        message="Essa ação não pode ser desfeita."
        onClose={() => setToDelete(null)}
        onConfirm={async () => { if (toDelete) await removeConta(toDelete.id); setToDelete(null); setOpenForm(false); setCurrent(null); setIsEditing(false); }}
      />

      <style>{`
        .row-click:hover td{ background: rgba(0,0,0,.02); }

        .cc-modal-grid{
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap:12px 16px;
        }
        .cc-col-2{ grid-column: 1 / -1; }
        .cc-align-bottom{ align-self:end; }

        .cc-field{ display:flex; flex-direction:column; gap:6px; }
        .cc-label{ font-weight:600; }
        .cc-hint{ color: var(--muted, #6b7280); font-size: 12px; }

        .cc-select-wrap{ position:relative; }
        .cc-select{ appearance:none; padding-right:28px; }
        .cc-chevron{
          position:absolute; right:10px; top:50%;
          transform: translateY(-50%);
          pointer-events:none; color:#6b7280; font-size:14px;
        }

        @media (max-width: 760px){
          .cc-modal-grid{ grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  );
}
