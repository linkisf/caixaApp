// src/pages/transferencias/Index.tsx
import React, { useEffect, useMemo, useState } from "react";
import Modal from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";

type ContaCorrente = { id: string; nome: string; ativa: boolean };
type TransferListItem = {
  id: string;             // id da tabela transferencias
  data: string;           // YYYY-MM-DD ou ISO
  origem_nome: string;
  destino_nome: string;
  valor_centavos: number;
  descricao: string | null;
};

const API = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL ?? "/api");
const formatBRL = (c: number) => ((c ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const digitsToBRL = (digits: string) => (Number(digits.replace(/\D/g, "") || "0") / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const digitsToCentavos = (digits: string) => Number(digits.replace(/\D/g, "") || "0");

// Date -> "YYYY-MM-DD" local
const toLocalISODate = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
// Normaliza "YYYY-MM-DD" ou ISO -> "YYYY-MM-DD" local
const normalizeISODate = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : toLocalISODate(new Date(s)));
// Exibe "dd/mm/aaaa"
const formatDateBR = (s: string) => {
  const [y, m, d] = normalizeISODate(s).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("pt-BR");
};

export default function Transferencias() {
  const [rows, setRows] = useState<TransferListItem[]>([]);
  const [contasCorrente, setContasCorrente] = useState<ContaCorrente[]>([]);
  const [loading, setLoading] = useState(false);

  const [openForm, setOpenForm] = useState(false);
  const [toDelete, setToDelete] = useState<TransferListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    data: toLocalISODate(new Date()),
    origem_conta_corrente_id: "",
    destino_conta_corrente_id: "",
    valor_centavos: 0,
    descricao: "",
  });
  const [valorStr, setValorStr] = useState("R$ 0,00");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [rCC, rList] = await Promise.all([
        fetch(`${API}/contas-corrente`, { headers: { Accept: "application/json" } }),
        fetch(`${API}/transferencias`, { headers: { Accept: "application/json" } }),
      ]);
      const listCC = rCC.ok ? await rCC.json().catch(() => []) : [];
      const listTr = rList.ok ? await rList.json().catch(() => []) : [];
      setContasCorrente((Array.isArray(listCC) ? listCC : []).filter((c: any) => c?.ativa));
      setRows(Array.isArray(listTr) ? listTr : []);
    } catch (e) {
      console.error(e);
      setError("Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const cols = useMemo(() => ([
    { w: "16%" }, // Data
    { w: "30%" }, // Origem
    { w: "30%" }, // Destino
    { w: "16%" }, // Valor
    { w: "8%"  }, // Ações
  ]), []);

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (saving) return;

    setError(null);

    if (!form.origem_conta_corrente_id || !form.destino_conta_corrente_id) {
      setError("Selecione as contas de origem e destino.");
      return;
    }
    if (form.origem_conta_corrente_id === form.destino_conta_corrente_id) {
      setError("Origem e destino devem ser diferentes.");
      return;
    }
    if (!form.valor_centavos || form.valor_centavos <= 0) {
      setError("Informe um valor válido.");
      return;
    }

    setSaving(true);
    try {
      const r = await fetch(`${API}/transferencias`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          data: form.data,
          origem_conta_corrente_id: form.origem_conta_corrente_id,
          destino_conta_corrente_id: form.destino_conta_corrente_id,
          valor_centavos: Number(form.valor_centavos),
          descricao: form.descricao || null,
        }),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        console.error("Falha ao salvar transferência:", r.status, t);
        setError(t || `Erro ao salvar (${r.status})`);
        return;
      }
      setOpenForm(false);
      setForm({
        data: toLocalISODate(new Date()),
        origem_conta_corrente_id: "",
        destino_conta_corrente_id: "",
        valor_centavos: 0,
        descricao: "",
      });
      setValorStr("R$ 0,00");
      await load();
    } catch (e) {
      console.error(e);
      setError("Falha de rede.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const r = await fetch(`${API}/transferencias/${id}`, { method: "DELETE", headers: { Accept: "application/json" } });
    if (r.status === 204) await load();
    else {
      const t = await r.text().catch(() => "");
      setError(t || `Erro ao excluir (${r.status})`);
    }
  }

  return (
    <>
      <div className="card" style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <h3 style={{ margin: 0 }}>Transferências entre Contas</h3>
        <div style={{ display:"flex", gap: 8 }}>
          <button className="btn" onClick={load}>Atualizar</button>
          <button className="btn primary" onClick={() => setOpenForm(true)}>+ Nova Transferência</button>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <colgroup>{cols.map((c,i)=><col key={i} style={{width:c.w}}/>)}</colgroup>
          <thead>
            <tr>
              <th>Data</th>
              <th>Origem</th>
              <th>Destino</th>
              <th>Valor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="empty">Carregando…</td></tr>}
            {!loading && rows.map(r => (
              <tr key={r.id}>
                <td>{formatDateBR(r.data)}</td>
                <td>{r.origem_nome}</td>
                <td>{r.destino_nome}</td>
                <td>{formatBRL(r.valor_centavos)}</td>
                <td>
                  <button className="btn danger" onClick={() => setToDelete(r)}>Excluir</button>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="empty">Nenhuma transferência.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={openForm} title="Nova Transferência" onClose={() => setOpenForm(false)} size="md">
        <form className="form-grid" onSubmit={save}>
          <label>
            <span className="label">Data</span>
            <input className="input" type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} required/>
          </label>

          <label>
            <span className="label">Conta Origem</span>
            <select
              className="input"
              value={form.origem_conta_corrente_id}
              onChange={e => setForm({ ...form, origem_conta_corrente_id: e.target.value })}
              required
            >
              <option value="">Selecione…</option>
              {contasCorrente.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>

          <label>
            <span className="label">Conta Destino</span>
            <select
              className="input"
              value={form.destino_conta_corrente_id}
              onChange={e => setForm({ ...form, destino_conta_corrente_id: e.target.value })}
              required
            >
              <option value="">Selecione…</option>
              {contasCorrente.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>

          <label>
            <span className="label">Valor</span>
            <input
              className="input"
              value={valorStr}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setValorStr(digitsToBRL(digits));
                setForm({ ...form, valor_centavos: digitsToCentavos(digits) });
              }}
              required
            />
          </label>

          <label className="form-grid-span">
            <span className="label">Descrição (opcional)</span>
            <input className="input" value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })}/>
          </label>

          <div className="modal-footer" style={{ gridColumn:"1 / -1", display:"flex", gap:8, justifyContent:"flex-end" }}>
            {error && <span className="field-error" style={{ marginRight:"auto" }}>{error}</span>}
            <button type="button" className="btn" onClick={() => setOpenForm(false)}>Cancelar</button>
            <button type="submit" className="btn primary" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title={toDelete ? `Excluir transferência de ${formatBRL(toDelete.valor_centavos)}?` : "Excluir"}
        message="Isso excluirá a transferência e seus lançamentos vinculados."
        onClose={() => setToDelete(null)}
        onConfirm={async () => { if (toDelete) await remove(toDelete.id); setToDelete(null); }}
      />
    </>
  );
}
