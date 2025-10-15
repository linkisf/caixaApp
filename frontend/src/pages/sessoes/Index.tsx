import React, { useEffect, useMemo, useState } from "react";
import Modal from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";

type Sessao = {
  id: number;
  caixa: string;              // texto livre
  hora_inicio: string | null; // "HH:MM"
  hora_fim: string | null;    // "HH:MM" | null
  ativo: boolean;             // <- novo
  criado_em?: string | null;
  modificado_em?: string | null;
};

const API = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL ?? "/api");

/* utils */
const pad = (n: number) => String(n).padStart(2, "0");
const nowHHMM = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
function fmtBRDateTime(iso?: string | null) {
  return iso ? new Date(iso).toLocaleString("pt-BR") : "-";
}

export default function SessoesIndex() {
  const [items, setItems] = useState<Sessao[]>([]);
  const [open, setOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [current, setCurrent] = useState<Partial<Sessao> | null>(null);
  const [confirmDel, setConfirmDel] = useState<boolean>(false);

  async function load() {
    try {
      const r = await fetch(`${API}/sessoes-caixa`, { headers: { Accept: "application/json" } });
      const list = r.ok ? await r.json().catch(() => []) : [];
      const norm: Sessao[] = (Array.isArray(list) ? list : []).map((x: any) => ({
        id: Number(x.id),
        caixa: String(x.caixa ?? ""),
        hora_inicio: x.hora_inicio ?? null,
        hora_fim: x.hora_fim ?? null,
        ativo: Boolean(x.ativo ?? true),
        criado_em: x.criado_em ?? null,
        modificado_em: x.modificado_em ?? null,
      }));
      setItems(norm);
      if (!r.ok) console.error("Falha /sessoes-caixa:", r.status, await r.text().catch(() => ""));
    } catch (e) {
      console.error(e);
      setItems([]);
      alert("Falha ao carregar sessões.");
    }
  }

  useEffect(() => { load(); }, []);

  async function saveSessao() {
    if (!current) return;

    const hhmm = /^(\d{2}):(\d{2})(?::\d{2})?$/;
    if (!current.caixa?.trim()) { alert("Informe o nome do caixa."); return; }
    if (!current.hora_inicio || !hhmm.test(current.hora_inicio)) { alert("Hora de início inválida."); return; }
    if (current.hora_fim && !hhmm.test(current.hora_fim)) { alert("Hora de fim inválida."); return; }

    const method = current.id ? "PUT" : "POST";
    const url = current.id ? `${API}/sessoes-caixa/${current.id}` : `${API}/sessoes-caixa`;

    const payload = {
      caixa: current.caixa.trim(),
      hora_inicio: current.hora_inicio,
      hora_fim: current.hora_fim ?? null,
      ativo: current.ativo ?? true,   // <- envia status
    };

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        try { const j = JSON.parse(text); alert(j.error || `Erro ao salvar (${res.status})`); }
        catch { alert(text || `Erro ao salvar (${res.status})`); }
        return;
      }
      setIsEditing(false);
      setOpen(false);
      setCurrent(null);
      await load();
    } catch (err) {
      console.error("Erro de rede ao salvar:", err);
      alert("Falha de rede ao salvar.");
    }
  }

  async function deleteSessao(id: number) {
    try {
      const res = await fetch(`${API}/sessoes-caixa/${id}`, { method: "DELETE", headers: { Accept: "application/json" } });
      if (res.status === 204) {
        setOpen(false); setCurrent(null);
        await load(); return;
      }
      const text = await res.text().catch(() => "");
      alert(text || `Erro ao excluir (${res.status})`);
    } catch (err) {
      console.error("Erro de rede ao excluir:", err);
      alert("Falha de rede ao excluir.");
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Cabeçalho */}
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Sessões de Caixa</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={load}>Atualizar</button>
          <button
            className="btn primary"
            onClick={() => {
              setCurrent({
                caixa: "",
                hora_inicio: nowHHMM(),
                hora_fim: null,
                ativo: true,                 // <- novo registro começa ativo
              });
              setIsEditing(true);
              setOpen(true);
            }}
          >
            + Adicionar
          </button>
        </div>
      </div>

      {/* Tabela: mostra Status (Ativo/Inativo) como em Funcionários */}
      <div className="card">
        <table className="table">
          {/* prettier-ignore */}
          <colgroup>
            <col style={{width:'30%'}}/>{/* Caixa */}
            <col style={{width:'25%'}}/>{/* Início */}
            <col style={{width:'25%'}}/>{/* Fim */}
            <col style={{width:'20%'}}/>{/* Status */}
          </colgroup>
          <thead>
            <tr>
              <th>Caixa</th>
              <th>Início</th>
              <th>Fim</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map(s => (
              <tr
                key={s.id}
                onClick={() => { setCurrent(s); setIsEditing(false); setOpen(true); }}
                style={{ cursor: "pointer" }}
                className="row-click"
              >
                <td>{s.caixa || "-"}</td>
                <td>{s.hora_inicio || "-"}</td>
                <td>{s.hora_fim || "-"}</td>
                <td>
                  <span className={`status-badge ${s.ativo ? "status-badge--active" : "status-badge--inactive"}`}>
                    {s.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={4} className="empty" style={{ color: "var(--muted)" }}>Nenhuma sessão encontrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: visualização → editar/salvar e excluir */}
      <Modal
        open={open}
        title={current?.id ? (isEditing ? "Editar Sessão" : "Detalhes da Sessão") : "Nova Sessão"}
        onClose={() => { setOpen(false); setCurrent(null); setIsEditing(false); }}
        size="md"
      >
        {current && (
          <form
            className="form-grid"
            onSubmit={(e) => { e.preventDefault(); if (isEditing) saveSessao(); else setIsEditing(true); }}
          >
            <label>
              <span className="label">Caixa</span>
              <input
                className="input"
                value={current.caixa ?? ""}
                onChange={e => setCurrent({ ...current, caixa: e.target.value })}
                disabled={!isEditing}
                required
                placeholder="Ex.: Caixa Principal, PDV 1, etc."
              />
            </label>

            <label>
              <span className="label">Hora de Início</span>
              <input
                type="time"
                className="input"
                value={current.hora_inicio ?? ""}
                onChange={e => setCurrent({ ...current, hora_inicio: e.target.value })}
                disabled={!isEditing}
                required
                step={60}
              />
            </label>

            <label>
              <span className="label">Hora de Fim</span>
              <input
                type="time"
                className="input"
                value={current.hora_fim ?? ""}
                onChange={e => setCurrent({ ...current, hora_fim: e.target.value || null })}
                disabled={!isEditing}
                step={60}
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

            
            <div className="modal-footer" style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={() => { setOpen(false); setCurrent(null); setIsEditing(false); }}>
                Fechar
              </button>

              <button type="submit" className="btn primary">
                {isEditing ? "Salvar" : "Editar"}
              </button>

              {current.id != null && (
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => setConfirmDel(true)}
                >
                  Excluir
                </button>
              )}
            </div>
          </form>
        )}
      </Modal>
      <ConfirmDialog
        open={confirmDel}
        title="Excluir sessão?"
        message={`Essa ação não pode ser desfeita.`}
        onClose={() => setConfirmDel(false)}
        onConfirm={async () => {
          if (current?.id != null) {
            await deleteSessao(current.id);
          }
          setConfirmDel(false);
        }}
      />

      <style>{`.row-click:hover td { background: rgba(0,0,0,.02); }`}</style>
    </div>
  );

  

}
