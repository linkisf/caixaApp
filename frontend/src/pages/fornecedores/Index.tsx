import React, { useEffect, useState } from "react";
import Modal from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";

type Fornecedor = {
  id: number;
  nome: string;
  documento: string | null;
  contato: string | null;
  ativo: boolean;
  criado_em?: string | null;
  modificado_em?: string | null;
};

const API = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL ?? "/api");

const StatusPill = ({ active }: { active:boolean }) => (
  <span className={`status-badge ${active ? "status-badge--active" : "status-badge--inactive"}`}>
    {active ? "Ativo" : "Inativo"}
  </span>
);

const digits = (s: string) => (s ?? "").replace(/\D/g, "");
function formatCpfCnpj(v: string) {
  const d = digits(v);
  if (d.length === 14) {
    return d
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2}\.\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{2}\.\d{3}\.\d{3})(\d)/, "$1/$2")
      .replace(/(\d{4})(\d{2})$/, "$1-$2");
  }
  if (d.length === 11) {
    return d
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return v;
}

export default function FornecedoresPage() {
  const [items, setItems] = useState<Fornecedor[]>([]);
  const [open, setOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [current, setCurrent] = useState<Partial<Fornecedor> | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetch(`${API}/fornecedores`, { headers: { Accept: "application/json" } });
      const list = r.ok ? await r.json().catch(() => []) : [];
      const norm: Fornecedor[] = (Array.isArray(list) ? list : []).map((x: any) => ({
        id: Number(x.id),
        nome: String(x.nome ?? ""),
        documento: x.documento ?? null,
        contato: x.contato ?? null,
        ativo: Boolean(x.ativo ?? true),
        criado_em: x.criado_em ?? null,
        modificado_em: x.modificado_em ?? null,
      }));
      setItems(norm);
      if (!r.ok) console.error("Falha /fornecedores:", r.status, await r.text().catch(() => ""));
    } catch (e) {
      console.error(e);
      setItems([]);
      alert("Falha ao carregar fornecedores.");
    }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!current) return;
    setError(null);

    const nome = (current.nome ?? "").trim();
    const documento = current.documento ? digits(current.documento) : null;
    const contato = (current.contato ?? "").trim() || null;
    const ativo = current.ativo ?? true;
    if (!nome) { setError("Informe o nome do fornecedor."); return; }

    const method = current.id ? "PUT" : "POST";
    const url = current.id ? `${API}/fornecedores/${current.id}` : `${API}/fornecedores`;

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ nome, documento, contato, ativo }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        try { const j = JSON.parse(txt); setError(j.error || j.detail || `Erro ao salvar (${res.status})`); }
        catch { setError(txt || `Erro ao salvar (${res.status})`); }
        return;
      }
      setOpen(false); setCurrent(null); setIsEditing(false);
      await load();
    } catch (err) {
      console.error("Erro salvar fornecedor:", err);
      setError("Falha de rede ao salvar.");
    }
  }

  async function doDelete(id: number) {
    try {
      const res = await fetch(`${API}/fornecedores/${id}`, { method: "DELETE", headers: { Accept: "application/json" } });
      if (res.status === 204) { await load(); return; }
      const txt = await res.text().catch(() => "");
      alert(txt || `Erro ao excluir (${res.status})`);
    } catch (err) {
      console.error("Erro ao excluir fornecedor:", err);
      alert("Falha de rede ao excluir.");
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Cabeçalho */}
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Fornecedores</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={load}>Atualizar</button>
          <button
            className="btn primary"
            onClick={() => {
              setCurrent({ ativo: true, nome: "", documento: null, contato: null });
              setIsEditing(true);
              setOpen(true);
            }}
          >
            + Adicionar
          </button>
        </div>
      </div>

      {/* Lista (sem coluna de ações; linha é clicável) */}
      <div className="card">
        <table className="table">
          {/* prettier-ignore */}
          <colgroup>
            <col style={{width:'40%'}}/>{/* Nome */}
            <col style={{width:'25%'}}/>{/* Documento */}
            <col style={{width:'25%'}}/>{/* Contato */}
            <col style={{width:'10%'}}/>{/* Status */}
          </colgroup>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Documento</th>
              <th>Contato</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map(f => (
              <tr
                key={f.id}
                onClick={() => { setCurrent(f); setIsEditing(false); setOpen(true); }}
                style={{ cursor: "pointer" }}
                className="row-click"
              >
                <td>{f.nome}</td>
                <td>{f.documento ? formatCpfCnpj(f.documento) : "-"}</td>
                <td>{f.contato || "-"}</td>
                <td><StatusPill active={!!f.ativo} /></td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={4} className="empty">Nenhum fornecedor cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal ver/editar/excluir */}
      <Modal
        open={open}
        title={current?.id ? (isEditing ? "Editar Fornecedor" : "Detalhes do Fornecedor") : "Novo Fornecedor"}
        onClose={() => { setOpen(false); setCurrent(null); setIsEditing(false); setError(null); }}
        size="md"
      >
        {current && (
          <form
            className="form-grid"
            onSubmit={(e) => { e.preventDefault(); if (isEditing) save(); else setIsEditing(true); }}
          >
            <label>
              <span className="label">Nome</span>
              <input
                className="input"
                value={current.nome ?? ""}
                onChange={e => setCurrent({ ...current, nome: e.target.value })}
                disabled={!isEditing}
                required
              />
            </label>

            <label>
              <span className="label">Documento (CPF/CNPJ)</span>
              <input
                className="input"
                value={current.documento ? formatCpfCnpj(current.documento) : ""}
                onChange={e => setCurrent({ ...current, documento: digits(e.target.value) || null })}
                disabled={!isEditing}
                inputMode="numeric"
                placeholder="00.000.000/0000-00 ou 000.000.000-00"
              />
            </label>

            <label>
              <span className="label">Contato</span>
              <input
                className="input"
                value={current.contato ?? ""}
                onChange={e => setCurrent({ ...current, contato: e.target.value || null })}
                disabled={!isEditing}
                placeholder="telefone ou e-mail"
              />
            </label>

            <label>
              <span className="label">Status</span>
              <select
                className="input"
                value={current.ativo ? "true" : "false"}
                onChange={e => setCurrent({ ...current, ativo: e.target.value === "true" })}
                disabled={!isEditing}
              >
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </select>
            </label>

            <div className="modal-footer" style={{ gridColumn: "1 / -1" }}>
              {error && <span className="field-error" style={{ marginRight:"auto" }}>{error}</span>}
              <button type="button" className="btn" onClick={() => { setOpen(false); setCurrent(null); setIsEditing(false); }}>
                Fechar
              </button>
              <button type="submit" className="btn primary">
                {isEditing ? "Salvar" : "Editar"}
              </button>
              {current.id != null && (
                <button type="button" className="btn danger" onClick={() => setConfirmDel(true)}>
                  Excluir
                </button>
              )}
            </div>
          </form>
        )}
      </Modal>

      {/* Confirmação de exclusão */}
      <ConfirmDialog
        open={confirmDel}
        title="Excluir fornecedor?"
        message="Essa ação não pode ser desfeita."
        onClose={() => setConfirmDel(false)}
        onConfirm={async () => {
          if (current?.id != null) await doDelete(current.id);
          setConfirmDel(false);
          setOpen(false);
          setCurrent(null);
        }}
      />

      <style>{`.row-click:hover td{background:rgba(0,0,0,.02)}`}</style>
    </div>
  );
}
