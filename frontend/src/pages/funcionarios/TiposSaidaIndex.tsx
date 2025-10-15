import React, { useEffect, useRef, useState } from "react";
import Modal from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useNavigate } from "react-router-dom";

type TipoSaida = { id: number; nome: string; ativo: boolean; criado_em?: string; modificado_em?: string };

const API = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL ?? "/api");

export default function TiposSaidaIndex() {
  const [items, setItems] = useState<TipoSaida[]>([]);
  const [open, setOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [current, setCurrent] = useState<Partial<TipoSaida> | null>(null);
  const [toDelete, setToDelete] = useState<TipoSaida | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const navigate = useNavigate();
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/funcionarios/tipos-saida`, { headers: { Accept: "application/json" } });
      const data = res.ok ? await res.json() : [];
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (open && isEditing && firstFieldRef.current) firstFieldRef.current.focus();
  }, [open, isEditing]);

  async function save() {
    if (!current?.nome?.trim()) { alert("Informe o nome."); return; }
    const method = current?.id ? "PUT" : "POST";
    const url = current?.id ? `${API}/funcionarios/tipos-saida/${current.id}` : `${API}/funcionarios/tipos-saida`;
    const body = { nome: current.nome.trim(), ativo: current.ativo ?? true };

    setSaving(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        try { const j = JSON.parse(txt); alert(j.error || `Erro ao salvar (${res.status})`); }
        catch { alert(txt || `Erro ao salvar (${res.status})`); }
        return;
      }
      // FECHA MODAL AO FINALIZAR EDIÇÃO
      setOpen(false);
      setIsEditing(false);
      setCurrent(null);
      await load();
    } catch (err) {
      console.error(err);
      alert("Falha de rede ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    setDeleting(true);
    try {
      const res = await fetch(`${API}/funcionarios/tipos-saida/${id}`, { method: "DELETE", headers: { Accept: "application/json" } });
      if (res.status === 204) {
        // FECHA MODAL AO CONFIRMAR EXCLUSÃO
        setOpen(false);
        setCurrent(null);
        setIsEditing(false);
        setToDelete(null);
        await load();
        return;
      }
      if (res.status === 409) {
        const data = await res.json().catch(() => null);
        alert(data?.error || "Não é possível excluir este tipo (em uso).");
        return;
      }
      alert((await res.text().catch(() => "")) || `Erro ao excluir (${res.status})`);
    } catch (err) {
      console.error(err);
      alert("Falha de rede ao excluir.");
    } finally {
      setDeleting(false);
    }
  }

  // impede fechar modal enquanto edita/salva
  function handleModalClose() {
    if (saving) return;
    if (isEditing) return;
    setOpen(false);
    setCurrent(null);
    setIsEditing(false);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card header-line">
        <h1>Tipos de Saída (Funcionários)</h1>
        <div className="header-actions">
          <button className="btn ghost" onClick={() => navigate(-1)} type="button">Voltar</button>
          <button className="btn" onClick={load} disabled={loading} type="button">{loading ? "Atualizando…" : "Atualizar"}</button>
          <button className="btn primary" type="button" onClick={() => { setCurrent({ ativo: true }); setIsEditing(true); setOpen(true); }}>+ Adicionar</button>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <colgroup>
            <col style={{ width: "70%" }} />
            <col style={{ width: "30%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr
                key={it.id}
                className="row-click"
                style={{ cursor: "pointer" }}
                onClick={() => { setCurrent(it); setIsEditing(false); setOpen(true); }}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") { setCurrent(it); setIsEditing(false); setOpen(true); } }}
              >
                <td>{it.nome}</td>
                <td><span className={`badge ${it.ativo ? "success" : "muted"}`}>{it.ativo ? "Ativo" : "Inativo"}</span></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={2} className="empty" style={{ color: "var(--muted)" }}>Nenhum tipo cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal
        open={open}
        title={current?.id ? (isEditing ? "Editar Tipo de Saída" : "Detalhes do Tipo de Saída") : "Novo Tipo de Saída"}
        onClose={handleModalClose}
      >
        {current && (
          <div onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <form
              className="form-grid"
              onSubmit={(e) => { e.preventDefault(); if (isEditing) save(); }}
            >
              <label>
                <span className="label">Nome</span>
                <input
                  className="input"
                  ref={firstFieldRef}
                  value={current.nome || ""}
                  onChange={(e) => setCurrent({ ...current, nome: e.target.value })}
                  disabled={!isEditing || saving}
                  required
                  placeholder="Ex.: Salário"
                />
              </label>

              <label>
                <span className="label">Status</span>
                <select
                  className="input"
                  value={current.ativo ? "true" : "false"}
                  onChange={(e) => setCurrent({ ...current, ativo: e.target.value === "true" })}
                  disabled={!isEditing || saving}
                >
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>
              </label>

              <div className="modal-footer" style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                {isEditing ? (
                  <>
                    <button type="button" className="btn ghost" onClick={() => setIsEditing(false)} disabled={saving}>Cancelar</button>
                    <button type="submit" className="btn primary" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn ghost" onClick={() => { setOpen(false); setCurrent(null); setIsEditing(false); }}>Fechar</button>
                    <button type="button" className="btn" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsEditing(true); }}>Editar</button>
                    {current.id && (
                      <button type="button" className="btn danger" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setToDelete(current as TipoSaida); }}>
                        Excluir
                      </button>
                    )}
                  </>
                )}
              </div>
            </form>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title={toDelete ? `Excluir "${toDelete.nome}"?` : "Excluir"}
        message={deleting ? "Excluindo…" : "Essa ação não pode ser desfeita."}
        onClose={() => !deleting && setToDelete(null)}
        onConfirm={async () => { if (toDelete) await remove(toDelete.id); }}
        confirmDisabled={deleting}
      />

      <style>{`
        .header-line{ display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .header-line h1{ margin:0; font-size:20px; }
        .header-actions{ display:flex; gap:8px; }
        .row-click:hover td { background: rgba(0,0,0,.02); }
        .badge { display:inline-block; padding:2px 8px; border-radius:999px; font-size:12px; line-height:18px; }
        .badge.success { background:#e7f6ee; color:#137a4b; }
        .badge.muted { background:#f1f3f5; color:#5f6b7a; }
        .btn { appearance:none; border:1px solid #d0d7de; background:#fff; padding:8px 12px; border-radius:8px; cursor:pointer; font-size:14px; line-height:20px; transition:.15s; }
        .btn:hover{ background:#f6f8fa; }
        .btn:disabled{ opacity:.6; cursor:not-allowed; }
        .btn.primary{ background:#1f6feb; color:#fff; border-color:#1f6feb; }
        .btn.primary:hover{ filter:brightness(.95); }
        .btn.ghost{ background:transparent; border-color:transparent; }
        .btn.ghost:hover{ background:#f6f8fa; border-color:#d0d7de; }
        .btn.danger{ border-color:#d93025; color:#d93025; background:#fff; }
        .btn.danger:hover{ background:#fdecea; }
        .form-grid { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:12px; }
        @media (max-width: 720px){ .form-grid{ grid-template-columns: 1fr; } }
        .label{ display:block; margin-bottom:4px; color:#4a5568; font-size:12px; }
        .input{ width:100%; padding:8px 10px; border:1px solid #d0d7de; border-radius:8px; }
        .input:disabled{ background:#f8f9fb; color:#6c757d; }
      `}</style>
    </div>
  );
}
