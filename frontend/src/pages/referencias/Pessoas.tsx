import React, { useEffect, useMemo, useState } from "react";
import Modal from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";

type TipoPessoa = "Fornecedor" | "Cliente" | "Funcionario";
type Pessoa = {
  id: number;
  tipo: TipoPessoa;
  nome?: string | null;   // backend mantém nome = tipo
  ativo: boolean;
};

const API = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL ?? "/api");
const TIPOS: TipoPessoa[] = ["Fornecedor", "Cliente", "Funcionario"];

export default function PessoasPage() {
  const [items, setItems] = useState<Pessoa[]>([]);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Partial<Pessoa> | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const tiposEmUso = useMemo(() => new Set(items.map(i => i.tipo)), [items]);

  async function load() {
    try {
      const r = await fetch(`${API}/pessoas`, { headers: { Accept: "application/json" } });
      const list = r.ok ? await r.json().catch(() => []) : [];
      const norm: Pessoa[] = (Array.isArray(list) ? list : []).map((x: any) => ({
        id: Number(x.id),
        tipo: x.tipo,
        nome: x.nome,
        ativo: Boolean(x.ativo ?? true),
      }));
      setItems(norm);
      if (!r.ok) console.error("Falha /pessoas:", r.status, await r.text().catch(() => ""));
    } catch (e) {
      console.error(e);
      setItems([]);
      alert("Falha ao carregar tipos de pessoa.");
    }
  }

  useEffect(() => { load(); }, []);

  async function save() {
    if (!current) return;
    if (!current.tipo) { alert("Selecione o tipo."); return; }

    const method = current.id ? "PUT" : "POST";
    const url = current.id ? `${API}/pessoas/${current.id}` : `${API}/pessoas`;
    const payload = {
      tipo: current.tipo,
      ativo: current.ativo ?? true,
    };

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        try {
          const j = JSON.parse(txt);
          alert(j.error || `Erro ao salvar (${res.status})`);
        } catch {
          alert(txt || `Erro ao salvar (${res.status})`);
        }
        return;
      }

      setOpen(false); setCurrent(null); setIsEditing(false);
      await load();
    } catch (err) {
      console.error("Erro salvar pessoa:", err);
      alert("Falha de rede ao salvar.");
    }
  }

  async function doDelete(id: number) {
    try {
      const res = await fetch(`${API}/pessoas/${id}`, { method: "DELETE", headers: { Accept: "application/json" } });
      if (res.status === 204) { await load(); return; }
      const txt = await res.text().catch(() => "");
      alert(txt || `Erro ao excluir (${res.status})`);
    } catch (err) {
      console.error("Erro excluir pessoa:", err);
      alert("Falha de rede ao excluir.");
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Cabeçalho */}
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Pessoas (Tipos)</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={load}>Atualizar</button>
          <button
            className="btn primary"
            onClick={() => {
              setCurrent({ tipo: undefined, ativo: true });
              setIsEditing(true);
              setOpen(true);
            }}
          >
            + Adicionar
          </button>
        </div>
      </div>

      {/* Tabela com colunas separadas: Status | Ações */}
      <div className="card">
        <table className="table">
          {/* prettier-ignore */}
          <colgroup>
            <col style={{width:'60%'}}/>{/* Tipo */}
            <col style={{width:'20%'}}/>{/* Status */}
            <col style={{width:'20%'}}/>{/* Ações */}
          </colgroup>
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td>{p.tipo}</td>
                <td>
                  <span className={`status-badge ${p.ativo ? "status-badge--active" : "status-badge--inactive"}`}>
                    {p.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="cell-actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => { setCurrent(p); setIsEditing(true); setOpen(true); }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => { setCurrent(p); setConfirmDel(true); }}
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={3} className="empty" style={{ color: "var(--muted)" }}>
                  Nenhum tipo cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de criação/edição */}
      <Modal
        open={open}
        title={current?.id ? "Editar Tipo de Pessoa" : "Novo Tipo de Pessoa"}
        onClose={() => { setOpen(false); setCurrent(null); setIsEditing(false); }}
        size="md"
      >
        {current && (
          <form className="form-grid" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <label>
              <span className="label">Tipo</span>
              <select
                className="input"
                value={current.tipo ?? ""}
                onChange={(e) => setCurrent({ ...current, tipo: e.target.value as TipoPessoa })}
                required
              >
                <option value="">Selecione…</option>
                {TIPOS.map(tp => (
                  <option
                    key={tp}
                    value={tp}
                    // ao criar, desabilita tipos já existentes; ao editar, permite o próprio
                    disabled={!current.id && tiposEmUso.has(tp)}
                  >
                    {tp}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="label">Status</span>
              <select
                className="input"
                value={current.ativo ? "true" : "false"}
                onChange={e => setCurrent({ ...current, ativo: e.target.value === "true" })}
              >
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </select>
            </label>

            <div className="modal-footer" style={{ gridColumn: "1 / -1" }}>
              <button type="button" className="btn" onClick={() => { setOpen(false); setCurrent(null); setIsEditing(false); }}>
                Cancelar
              </button>
              <button className="btn primary" type="submit">Salvar</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Confirmação de exclusão */}
      <ConfirmDialog
        open={confirmDel}
        title="Excluir tipo?"
        message="Essa ação não pode ser desfeita."
        onClose={() => setConfirmDel(false)}
        onConfirm={async () => {
          if (current?.id != null) await doDelete(current.id);
          setConfirmDel(false);
        }}
      />
    </div>
  );
}
