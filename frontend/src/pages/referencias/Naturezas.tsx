import React, { useEffect, useState } from "react";
import Modal from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";

type Natureza = { id: number; nome: string; sinal: -1|0|1 };
const API = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL ?? "/api");

export default function NaturezasPage() {
  const [items, setItems] = useState<Natureza[]>([]);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Partial<Natureza> | null>(null);
  const [toDelete, setToDelete] = useState<Natureza | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const r = await fetch(`${API}/naturezas`, { headers: { Accept:"application/json" } });
    const list = r.ok ? await r.json().catch(()=>[]) : [];
    setItems(Array.isArray(list) ? list : []);
    if (!r.ok) console.error("Falha /naturezas:", r.status, await r.text().catch(()=> ""));
  }
  useEffect(()=>{ load(); },[]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!current) return;
    setError(null);
    const nome = (current.nome ?? "").trim();
    const sinal = Number(current.sinal);
    if (!nome) { setError("Informe o nome."); return; }
    if (![ -1, 0, 1 ].includes(sinal)) { setError("Sinal inválido."); return; }

    const method = current.id ? "PUT" : "POST";
    const url = current.id ? `${API}/naturezas/${current.id}` : `${API}/naturezas`;
    const res = await fetch(url, { method, headers: { "Content-Type":"application/json", Accept:"application/json" }, body: JSON.stringify({ nome, sinal }) });
    if (!res.ok) {
      const t = await res.text().catch(()=> ""); try { const j=JSON.parse(t); setError(j.error||j.detail||`Erro ao salvar (${res.status})`); } catch { setError(t||`Erro ao salvar (${res.status})`); }
      return;
    }
    setOpen(false); setCurrent(null); await load();
  }

  async function doDelete(id: number) {
    const r = await fetch(`${API}/naturezas/${id}`, { method:"DELETE", headers:{Accept:"application/json"} });
    if (r.status !== 204) alert((await r.text().catch(()=> "")) || `Erro ao excluir (${r.status})`);
    await load();
  }

  return (
    <div style={{ display:"grid", gap:16 }}>
      <div className="card" style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <h1 style={{ margin:0 }}>Naturezas</h1>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn" onClick={load}>Atualizar</button>
          <button className="btn primary" onClick={()=> { setCurrent({ sinal: 1 }); setOpen(true); }}>+ Adicionar</button>
        </div>
      </div>

      <div className="card">
        <table className="table">
          {/* prettier-ignore */}
          <colgroup><col style={{width:'70%'}}/><col style={{width:'10%'}}/><col style={{width:'20%'}}/></colgroup>
          <thead><tr><th>Nome</th><th>Sinal</th><th></th></tr></thead>
          <tbody>
            {items.map(it=>(
              <tr key={it.id}>
                <td>{it.nome}</td>
                <td>{it.sinal}</td>
                <td className="cell-actions">
                  <button className="btn" onClick={()=> { setCurrent(it); setOpen(true); }}>Editar</button>
                  <button className="btn" onClick={()=> setToDelete(it)}>Excluir</button>
                </td>
              </tr>
            ))}
            {items.length===0 && <tr><td colSpan={3} className="empty">Nenhuma natureza cadastrada.</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={open} title={current?.id ? "Editar Natureza" : "Nova Natureza"} onClose={()=> { setOpen(false); setCurrent(null); }} size="md">
        <form className="form-grid" onSubmit={save}>
          <label>
            <span className="label">Nome</span>
            <input className="input" value={current?.nome ?? ""} onChange={e=> setCurrent({ ...current!, nome: e.target.value })} required />
          </label>
          <label>
            <span className="label">Sinal</span>
            <select className="input" value={current?.sinal ?? 1} onChange={e=> setCurrent({ ...current!, sinal: Number(e.target.value) as -1|0|1 })}>
              <option value={1}>Entrada (+1)</option>
              <option value={0}>Neutro (0)</option>
              <option value={-1}>Saída (-1)</option>
            </select>
          </label>
          <div className="modal-footer" style={{ gridColumn:"1/-1" }}>
            {error && <span className="field-error" style={{ marginRight:"auto" }}>{error}</span>}
            <button type="button" className="btn" onClick={()=> setOpen(false)}>Cancelar</button>
            <button className="btn primary">Salvar</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!toDelete} title={toDelete ? `Excluir "${toDelete.nome}"?` : "Excluir"} message="Essa ação não pode ser desfeita." onClose={()=> setToDelete(null)} onConfirm={async ()=> { if (toDelete) await doDelete(toDelete.id); setToDelete(null); }} />
    </div>
  );
}
