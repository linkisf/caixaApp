import React, { useEffect, useState } from "react";
import Modal from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";

type TipoConta = { id: number; nome: string };
const API = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL ?? "/api");

export default function TiposContaPage() {
  const [items, setItems] = useState<TipoConta[]>([]);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Partial<TipoConta> | null>(null);
  const [toDelete, setToDelete] = useState<TipoConta | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetch(`${API}/tipos-conta`, { headers: { Accept: "application/json" } });
      const list = r.ok ? await r.json().catch(() => []) : [];
      setItems(Array.isArray(list) ? list : []);
      if (!r.ok) console.error("Falha /tipos-conta:", r.status, await r.text().catch(() => ""));
    } catch (e) { console.error(e); setItems([]); }
  }
  useEffect(() => { load(); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!current) return;
    setError(null);

    const payload = { nome: (current.nome ?? "").trim() };
    if (!payload.nome) { setError("Informe o nome."); return; }

    const method = current.id ? "PUT" : "POST";
    const url = current.id ? `${API}/tipos-conta/${current.id}` : `${API}/tipos-conta`;

    const res = await fetch(url, { method, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      try { const j = JSON.parse(txt); setError(j.error || j.detail || `Erro ao salvar (${res.status})`); }
      catch { setError(txt || `Erro ao salvar (${res.status})`); }
      return;
    }
    setOpen(false); setCurrent(null);
    await load();
  }

  async function doDelete(id: number) {
    const r = await fetch(`${API}/tipos-conta/${id}`, { method: "DELETE", headers: { Accept: "application/json" } });
    if (r.status !== 204) alert((await r.text().catch(() => "")) || `Erro ao excluir (${r.status})`);
    await load();
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card" style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <h1 style={{ margin:0 }}>Tipos de Conta</h1>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn" onClick={load}>Atualizar</button>
          <button className="btn primary" onClick={() => { setCurrent({}); setOpen(true); }}>+ Adicionar</button>
        </div>
      </div>

      <div className="card">
        <table className="table">
          {/* prettier-ignore */}
          <colgroup><col style={{width:'80%'}}/><col style={{width:'20%'}}/></colgroup>
          <thead><tr><th>Nome</th><th></th></tr></thead>
          <tbody>
            {items.map(it => (
              <tr key={it.id}>
                <td>{it.nome}</td>
                <td className="cell-actions">
                  <button className="btn" onClick={() => { setCurrent(it); setOpen(true); }}>Editar</button>
                  <button className="btn" onClick={() => setToDelete(it)}>Excluir</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={2} className="empty">Nenhum tipo cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={open} title={current?.id ? "Editar Tipo" : "Novo Tipo"} onClose={() => { setOpen(false); setCurrent(null); }} size="md">
        <form className="form-grid" onSubmit={save}>
          <label>
            <span className="label">Nome</span>
            <input className="input" value={current?.nome ?? ""} onChange={e => setCurrent({ ...current!, nome: e.target.value })} required />
          </label>
          <div className="modal-footer" style={{ gridColumn:"1/-1" }}>
            {error && <span className="field-error" style={{ marginRight:"auto" }}>{error}</span>}
            <button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="btn primary">Salvar</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title={toDelete ? `Excluir "${toDelete.nome}"?` : "Excluir"}
        message="Essa ação não pode ser desfeita."
        onClose={() => setToDelete(null)}
        onConfirm={async () => { if (toDelete) await doDelete(toDelete.id); setToDelete(null); }}
      />
    </div>
  );
}
