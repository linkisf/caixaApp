// src/pages/Referencias/ClassificacoesBalanco.tsx
import React, { useEffect, useMemo, useState } from "react";
import Modal from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";

/* ================= Tipos ================= */
type GrupoBalanco = "ATIVO" | "PASSIVO" | "PL";

type ClassBal = {
  id: number | string;
  codigo: string;
  nome: string;
  grupo: GrupoBalanco;
  ordem: number;
};

type FieldErrs = { [k: string]: string | null };

/* ================= Consts & Utils ================= */
const API = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL ?? "/api");
const GROUPS: GrupoBalanco[] = ["ATIVO", "PASSIVO", "PL"];
const byString = (k: keyof any) => (a: any, b: any) => String(a[k]).localeCompare(String(b[k]), "pt-BR", { numeric: true });
const trim = (s?: string | null) => (s ?? "").trim();
// padrão contábil: 1.x ATIVO, 2.x PASSIVO, 3.x PL
const CODE_RX = /^\d+(?:\.\d+)*$/;

function sortBal(a: ClassBal, b: ClassBal) {
  // ordem -> grupo -> codigo
  const o = (a.ordem ?? 999) - (b.ordem ?? 999);
  if (o !== 0) return o;
  const g = GROUPS.indexOf(a.grupo) - GROUPS.indexOf(b.grupo);
  if (g !== 0) return g;
  return byString("codigo")(a, b);
}

export default function ClassificacoesBalanco() {
  /* ================= State ================= */
  const [items, setItems] = useState<ClassBal[]>([]);
  const [loading, setLoading] = useState(false);

  const [openForm, setOpenForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [current, setCurrent] = useState<Partial<ClassBal> | null>(null);

  const [toDelete, setToDelete] = useState<ClassBal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<FieldErrs>({});

  /* ================= Data ================= */
  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/classificacoes-balanco`, { headers: { Accept: "application/json" } });
      const data = res.ok ? await res.json().catch(() => []) : [];
      setItems(Array.isArray(data) ? data.sort(sortBal) : []);
      if (!res.ok) console.error("Falha /classificacoes-balanco:", res.status, await res.text().catch(() => ""));
    } catch (e) {
      console.error(e);
      setError("Falha ao carregar classificações.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  /* ================= Helpers ================= */
  function validar(): boolean {
    if (!current) return false;
    const errs: FieldErrs = {};
    const codigo = trim(String(current.codigo ?? ""));
    const nome = trim(String(current.nome ?? ""));
    const grupo = String(current.grupo ?? "");
    const ordem = Number(current.ordem);

    if (!nome) errs.nome = "Informe o nome.";
    if (!codigo) errs.codigo = "Informe o código.";
    else if (!CODE_RX.test(codigo)) errs.codigo = "Use formato numérico com pontos (ex.: 1.1, 2.2).";

    if (!grupo || !GROUPS.includes(grupo as GrupoBalanco)) errs.grupo = "Selecione um grupo (ATIVO, PASSIVO ou PL).";
    if (!Number.isFinite(ordem) || ordem <= 0) errs.ordem = "Informe um número inteiro ≥ 1.";

    setFieldErr(errs);
    return Object.values(errs).every(v => !v);
  }

  function sugerirCodigo() {
    if (!current?.grupo) return;
    const prefix =
      current.grupo === "ATIVO" ? "1." :
      current.grupo === "PASSIVO" ? "2." : "3.";
    const doGrupo = items.filter(i => i.grupo === current.grupo);
    // pega o maior sufixo após "X."
    let max = 0;
    for (const it of doGrupo) {
      if (!it.codigo.startsWith(prefix)) continue;
      const resto = it.codigo.slice(prefix.length);
      const primeira = resto.split(".")[0];
      const n = parseInt(primeira, 10);
      if (!Number.isNaN(n)) max = Math.max(max, n);
    }
    setCurrent(c => ({ ...(c || {}), codigo: `${prefix}${max + 1}` }));
  }

  /* ================= Actions ================= */
  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!current) return;
    setError(null);
    if (!validar()) return;

    const payload = {
      codigo: trim(String(current.codigo)),
      nome: trim(String(current.nome)),
      grupo: String(current.grupo) as GrupoBalanco,
      ordem: Number(current.ordem),
    };

    const isUpdate = current.id != null && String(current.id) !== "";
    const url = isUpdate ? `${API}/classificacoes-balanco/${current.id}` : `${API}/classificacoes-balanco`;
    const method = isUpdate ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        try {
          const j = JSON.parse(text);
          if (res.status === 409) {
            // nome é UNIQUE no schema; alguns backends podem tratar código também
            setFieldErr(prev => ({ ...prev, nome: prev.nome ?? "Já existe uma classificação com esse nome.", codigo: prev.codigo ?? null }));
          }
          setError(j.error || j.detail || `Erro ao salvar (${res.status})`);
        } catch {
          if (res.status === 409) setFieldErr(prev => ({ ...prev, nome: prev.nome ?? "Já existe uma classificação com esse nome." }));
          setError(text || `Erro ao salvar (${res.status})`);
        }
        return;
      }

      setOpenForm(false);
      setIsEditing(false);
      setCurrent(null);
      setFieldErr({});
      await load();
    } catch (err) {
      console.error(err);
      setError("Falha de rede ao salvar.");
    }
  }

  async function doDelete(id: number | string) {
    try {
      const res = await fetch(`${API}/classificacoes-balanco/${id}`, { method: "DELETE", headers: { Accept: "application/json" } });
      if (res.status === 204) { await load(); return; }
      const txt = await res.text().catch(() => "");
      alert(txt || `Erro ao excluir (${res.status})`);
    } catch (err) {
      console.error(err);
      alert("Falha de rede ao excluir.");
    }
  }

  /* ================= UI ================= */
  const headers = useMemo(() => (["Código", "Nome", "Grupo", "Ordem"]), []);

  return (
    <>
      <div className="card" style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <h2 style={{ margin: 0 }}>Classificações de Balanço</h2>
        <div style={{ display:"flex", gap: 8 }}>
          <button className="btn" onClick={load}>Atualizar</button>
          <button
            className="btn primary"
            onClick={() => {
              setFieldErr({});
              setError(null);
              setIsEditing(true);
              setCurrent({ codigo: "", nome: "", grupo: "ATIVO", ordem: (items[items.length-1]?.ordem ?? 0) + 1 });
              setOpenForm(true);
            }}
          >
            + Adicionar
          </button>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <colgroup>
            <col style={{width:'18%'}}/>
            <col style={{width:'42%'}}/>
            <col style={{width:'20%'}}/>
            <col style={{width:'20%'}}/>
          </colgroup>

          <thead><tr>{headers.map(h => (<th key={h}>{h}</th>))}</tr></thead>

          <tbody>
            {loading ? (
              <tr><td colSpan={headers.length} className="empty">Carregando…</td></tr>
            ) : (items.length > 0 ? (
              items.map(c => (
                <tr
                  key={String(c.id)}
                  className="row-click"
                  style={{ cursor:"pointer" }}
                  onClick={() => { setCurrent({ ...c }); setIsEditing(false); setOpenForm(true); }}
                >
                  <td>{c.codigo}</td>
                  <td>{c.nome}</td>
                  <td>{c.grupo}</td>
                  <td>{c.ordem}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={headers.length} className="empty" style={{ color:"var(--muted)" }}>Nenhuma classificação cadastrada.</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal de formulário */}
      <Modal
        open={openForm}
        title={current?.id ? (isEditing ? "Editar Classificação" : "Detalhes da Classificação") : "Nova Classificação"}
        onClose={() => { setOpenForm(false); setCurrent(null); setIsEditing(false); setFieldErr({}); setError(null); }}
        size="md"
      >
        {current && (
          <form className="form-grid" onSubmit={(e) => { e.preventDefault(); if (isEditing) save(); else setIsEditing(true); }}>
            <label>
              <span className="label">Grupo</span>
              <select
                className="input"
                value={current.grupo ?? ""}
                onChange={e => setCurrent({ ...current, grupo: e.target.value as GrupoBalanco })}
                aria-invalid={!!fieldErr.grupo}
                required
                disabled={!isEditing}
              >
                {GROUPS.map(g => (<option key={g} value={g}>{g}</option>))}
              </select>
              {fieldErr.grupo && <small className="field-error">{fieldErr.grupo}</small>}
              <small className="hint">ATIVO (1.x), PASSIVO (2.x) ou PL (3.x)</small>
            </label>

            <label>
              <span className="label">Código</span>
              <div style={{ display:"flex", gap: 8 }}>
                <input
                  className="input"
                  value={current.codigo ?? ""}
                  onChange={e => { setCurrent({ ...current, codigo: e.target.value }); setFieldErr(prev => ({ ...prev, codigo: null })); }}
                  placeholder={current.grupo === "ATIVO" ? "1.1" : current.grupo === "PASSIVO" ? "2.1" : "3.1"}
                  aria-invalid={!!fieldErr.codigo}
                  required
                  disabled={!isEditing}
                />
                <button type="button" className="btn" onClick={sugerirCodigo} disabled={!isEditing}>Sugerir</button>
              </div>
              {fieldErr.codigo && <small className="field-error">{fieldErr.codigo}</small>}
            </label>

            <label style={{ gridColumn: "1 / -1" }}>
              <span className="label">Nome</span>
              <input
                className="input"
                value={current.nome ?? ""}
                onChange={e => { setCurrent({ ...current, nome: e.target.value }); setFieldErr(prev => ({ ...prev, nome: null })); }}
                aria-invalid={!!fieldErr.nome}
                required
                disabled={!isEditing}
              />
              {fieldErr.nome && <small className="field-error">{fieldErr.nome}</small>}
            </label>

            <label>
              <span className="label">Ordem</span>
              <input
                className="input"
                type="number"
                min={1}
                value={current.ordem ?? 1}
                onChange={e => { const n = Number(e.target.value); setCurrent({ ...current, ordem: Number.isFinite(n) ? n : (current.ordem ?? 1) }); setFieldErr(prev => ({ ...prev, ordem: null })); }}
                aria-invalid={!!fieldErr.ordem}
                required
                disabled={!isEditing}
              />
              {fieldErr.ordem && <small className="field-error">{fieldErr.ordem}</small>}
            </label>

            <div className="modal-footer" style={{ gridColumn:"1 / -1", display:"flex", gap:8, justifyContent:"flex-end" }}>
              {error && <span className="field-error" style={{ marginRight:"auto" }}>{error}</span>}
              <button type="button" className="btn" onClick={() => { setOpenForm(false); setCurrent(null); setIsEditing(false); setFieldErr({}); setError(null); }}>Fechar</button>
              <button type="submit" className="btn primary">{isEditing ? (current.id ? "Salvar alterações" : "Salvar") : "Editar"}</button>
              {current?.id && <button type="button" className="btn danger" onClick={() => setToDelete(current as ClassBal)}>Excluir</button>}
            </div>
          </form>
        )}
      </Modal>

      {/* Confirmação de exclusão */}
      <ConfirmDialog
        open={!!toDelete}
        title={toDelete ? `Excluir "${toDelete.codigo} — ${toDelete.nome}"?` : "Excluir"}
        message="Essa ação não pode ser desfeita."
        onClose={() => setToDelete(null)}
        onConfirm={async () => { if (toDelete) await doDelete(toDelete.id); setToDelete(null); setOpenForm(false); setCurrent(null); setIsEditing(false); }}
      />

      <style>{`
        .row-click:hover td { background: rgba(0,0,0,.02); }
        .hint{ color: var(--muted,#6b7280); font-size:12px; }
        .field-error{ color:#b91c1c; font-size:12px; }
      `}</style>
    </>
  );
}
