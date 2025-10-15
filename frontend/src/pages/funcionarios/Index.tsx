// src/pages/funcionarios/Index.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import Modal from "../../components/Modal";
import { useNavigate } from "react-router-dom";
import ConfirmDialog from "../../components/ConfirmDialog";

/* ================= Tipos ================= */
type FuncaoOption = { id: number; nome: string };
type Funcionario = {
  id: string; // UUID
  nome: string;
  funcao_id: number | null;
  funcao_nome?: string | null;
  cpf?: string | null;
  rg?: string | null;
  contato?: string | null;
  end_rua?: string | null;
  end_bairro?: string | null;
  end_numero?: string | null;
  salario_base?: number | null; // CENTAVOS
  ativo: boolean;
};

const API = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL ?? "/api");

/* ============== Helpers de máscara/validação ============== */
const digits = (s: string) => (s ?? "").replace(/\D/g, "");
function formatCPF(v: string) {
  const d = digits(v).slice(0, 11);
  return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}
function isValidCPF(v: string) {
  const s = digits(v);
  if (s.length !== 11 || /^(\d)\1{10}$/.test(s)) return false;
  const calc = (slice: number) => {
    let sum = 0;
    for (let i = 0; i < slice; i++) sum += Number(s[i]) * (slice + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(s[9]) && calc(10) === Number(s[10]);
}
function formatRG(v: string) {
  const d = digits(v).slice(0, 9);
  return d.replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{2}\.\d{3})(\d)/, "$1.$2").replace(/(\d{2}\.\d{3}\.\d{3})(\d)/, "$1-$2");
}
function formatPhone(v: string) {
  const d = digits(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{0,2})(\d{0,4})(\d{0,4})/, (_, a, b, c) => [a && `(${a})`, b, c && `-${c}`].filter(Boolean).join(" "));
  return d.replace(/(\d{0,2})(\d{0,5})(\d{0,4})/, (_, a, b, c) => [a && `(${a})`, b, c && `-${c}`].filter(Boolean).join(" "));
}
function parseBrlToCentavos(input: string): number | null {
  const d = digits(input);
  if (!d) return null;
  return parseInt(d, 10); // centavos
}
function brlInputFromCentavos(c: number | null | undefined) {
  if (c == null) return "";
  return (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ======================== Componente ======================= */
export default function FuncionariosIndex() {
  const [items, setItems] = useState<Funcionario[]>([]);
  const [funcoes, setFuncoes] = useState<FuncaoOption[]>([]);
  const [open, setOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [current, setCurrent] = useState<Partial<Funcionario> | null>(null);
  const [toDelete, setToDelete] = useState<Funcionario | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  const mapFuncaoNome = useMemo(() => {
    const m = new Map<number, string>();
    for (const f of funcoes) m.set(f.id, f.nome);
    return m;
  }, [funcoes]);

  async function load() {
    setLoading(true);
    try {
      const [rf, rfun] = await Promise.all([
        fetch(`${API}/funcionarios`, { headers: { Accept: "application/json" } }),
        fetch(`${API}/funcoes`, { headers: { Accept: "application/json" } }),
      ]);
      const listF = rf.ok ? await rf.json().catch(() => []) : [];
      const listFun = rfun.ok ? await rfun.json().catch(() => []) : [];

      const normFuncoes: FuncaoOption[] = (Array.isArray(listFun) ? listFun : []).map((x: any) => ({
        id: Number(x.id),
        nome: x.nome,
      }));
      const normFuncionarios: Funcionario[] = (Array.isArray(listF) ? listF : []).map((x: any) => ({
        ...x,
        funcao_id: x.funcao_id == null ? null : Number(x.funcao_id),
        salario_base: x.salario_base == null ? null : Number(x.salario_base),
      }));

      setItems(normFuncionarios);
      setFuncoes(normFuncoes);
      if (!rf.ok) console.error("Falha ao carregar /funcionarios:", rf.status, await rf.text().catch(() => ""));
      if (!rfun.ok) console.error("Falha ao carregar /funcoes:", rfun.status, await rfun.text().catch(() => ""));
    } catch (err) {
      console.error("Network/parse error em load:", err);
      setItems([]);
      setFuncoes([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (open && isEditing && firstFieldRef.current) firstFieldRef.current.focus();
  }, [open, isEditing]);

  /* =================== CRUD helpers =================== */
  async function saveFuncionario() {
    if (!current) return;
    if (!current.nome?.trim()) { alert("Informe o nome."); return; }
    if (current.funcao_id == null) { alert("Selecione a função."); return; }

    if (current.cpf && !isValidCPF(current.cpf)) {
      alert("CPF inválido."); return;
    }

    const method = current.id ? "PUT" : "POST";
    const url = current.id ? `${API}/funcionarios/${current.id}` : `${API}/funcionarios`;
    const payload = {
      nome: current.nome?.trim(),
      funcao_id: current.funcao_id ?? null,
      cpf: current.cpf ? digits(current.cpf) : null,
      rg: current.rg ? digits(current.rg) : null,
      contato: current.contato ? digits(current.contato) : null,
      end_rua: current.end_rua || null,
      end_bairro: current.end_bairro || null,
      end_numero: current.end_numero || null,
      salario_base: current.salario_base ?? 0,
      ativo: current.ativo ?? true,
    };

    setSaving(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        try { const j = JSON.parse(text); alert(j.error || `Erro ao salvar (${res.status})`);}
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
    } finally {
      setSaving(false);
    }
  }

  async function deleteFuncionario(id: string) {
    setDeleting(true);
    try {
      const res = await fetch(`${API}/funcionarios/${id}`, { method: "DELETE", headers: { Accept: "application/json" } });
      if (res.status === 204) {
        setOpen(false); setCurrent(null);
        await load(); return;
      }
      if (res.status === 409) {
        const data = await res.json().catch(() => null);
        alert(data?.error || "Não é possível excluir este funcionário."); return;
      }
      const text = await res.text().catch(() => "");
      alert(text || `Erro ao excluir (${res.status})`);
    } catch (err) {
      console.error("Erro de rede ao excluir:", err);
      alert("Falha de rede ao excluir.");
    } finally {
      setDeleting(false);
    }
  }

  /* =================== Render =================== */
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Cabeçalho */}
      <div className="card header-line">
        <h1>Funcionários</h1>
        <div className="header-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => navigate('/funcionarios/tipos-saida')}
            title="Gerenciar Tipos de Saída de Funcionários"
            aria-label="Gerenciar Tipos de Saída de Funcionários"
          >
            Tipos de Saída
          </button>
          <button
            className="btn"
            onClick={load}
            disabled={loading}
            title="Recarregar a lista"
            aria-label="Recarregar a lista"
          >
            {loading ? "Atualizando…" : "Atualizar"}
          </button>
          <button
            className="btn primary"
            onClick={() => {
              setCurrent({ ativo: true, funcao_id: null, salario_base: null });
              setIsEditing(true);
              setOpen(true);
            }}
            title="Adicionar novo funcionário"
            aria-label="Adicionar novo funcionário"
          >
            + Adicionar
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="card">
        <table className="table">
          <colgroup>
            <col style={{width:'28%'}}/>
            <col style={{width:'20%'}}/>
            <col style={{width:'16%'}}/>
            <col style={{width:'20%'}}/>
            <col style={{width:'16%'}}/>
          </colgroup>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Função</th>
              <th>CPF</th>
              <th>Contato</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((f) => {
              const funcaoNome = f.funcao_nome || (f.funcao_id != null ? mapFuncaoNome.get(f.funcao_id) : undefined) || "-";
              return (
                <tr
                  key={f.id}
                  onClick={() => { setCurrent(f); setIsEditing(false); setOpen(true); }}
                  style={{ cursor: "pointer" }}
                  className="row-click"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") { setCurrent(f); setIsEditing(false); setOpen(true); } }}
                >
                  <td>{f.nome}</td>
                  <td>{funcaoNome}</td>
                  <td>{f.cpf ? formatCPF(f.cpf) : "-"}</td>
                  <td>{f.contato ? formatPhone(f.contato) : "-"}</td>
                  <td><span className={`badge ${f.ativo ? 'success' : 'muted'}`}>{f.ativo ? 'Ativo' : 'Inativo'}</span></td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr><td colSpan={5} className="empty" style={{ color: "var(--muted)" }}>Nenhum funcionário encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <Modal
        open={open}
        title={current?.id ? (isEditing ? "Editar Funcionário" : "Detalhes do Funcionário") : "Novo Funcionário"}
        onClose={() => { setOpen(false); setCurrent(null); setIsEditing(false); }}
        size="lg"
      >
        {current && (
          <form
            className="form-grid"
            onSubmit={(e) => { e.preventDefault(); isEditing ? saveFuncionario() : setIsEditing(true); }}
          >
            <label>
              <span className="label">Nome</span>
              <input
                className="input"
                ref={firstFieldRef}
                value={current.nome || ""}
                onChange={e => setCurrent({ ...current, nome: e.target.value })}
                disabled={!isEditing || saving}
                required
                placeholder="Ex.: Maria Silva"
              />
            </label>

            <label>
              <span className="label">Função</span>
              <select
                className="input"
                value={current.funcao_id ?? ""}
                onChange={e => setCurrent({ ...current, funcao_id: e.target.value ? Number(e.target.value) : null })}
                disabled={!isEditing || saving}
                required
              >
                <option value="">Selecione…</option>
                {funcoes.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </label>

            <label>
              <span className="label">CPF</span>
              <input
                className="input"
                value={current.cpf ? formatCPF(current.cpf) : ""}
                onChange={e => setCurrent({ ...current, cpf: digits(e.target.value) || null })}
                disabled={!isEditing || saving}
                inputMode="numeric"
                placeholder="000.000.000-00"
                aria-invalid={!!current.cpf && !isValidCPF(current.cpf)}
                title={current.cpf && !isValidCPF(current.cpf) ? "CPF inválido" : ""}
              />
            </label>

            <label>
              <span className="label">RG</span>
              <input
                className="input"
                value={current.rg ? formatRG(current.rg) : ""}
                onChange={e => setCurrent({ ...current, rg: digits(e.target.value) || null })}
                disabled={!isEditing || saving}
                inputMode="numeric"
                placeholder="00.000.000-0"
              />
            </label>

            <label>
              <span className="label">Contato</span>
              <input
                className="input"
                value={current.contato ? formatPhone(current.contato) : ""}
                onChange={e => setCurrent({ ...current, contato: digits(e.target.value) || null })}
                disabled={!isEditing || saving}
                inputMode="tel"
                placeholder="(00) 00000-0000"
              />
            </label>

            <label><span className="label">Rua</span>
              <input className="input" value={current.end_rua || ""} onChange={e => setCurrent({ ...current, end_rua: e.target.value })} disabled={!isEditing || saving} />
            </label>
            <label><span className="label">Número</span>
              <input className="input" value={current.end_numero || ""} onChange={e => setCurrent({ ...current, end_numero: e.target.value })} disabled={!isEditing || saving} />
            </label>
            <label><span className="label">Bairro</span>
              <input className="input" value={current.end_bairro || ""} onChange={e => setCurrent({ ...current, end_bairro: e.target.value })} disabled={!isEditing || saving} />
            </label>

            <label>
              <span className="label">Salário Base (R$)</span>
              <input
                type="text"
                inputMode="decimal"
                value={brlInputFromCentavos(current.salario_base ?? null)}
                onChange={(e) => setCurrent({ ...current, salario_base: parseBrlToCentavos(e.target.value) })}
                disabled={!isEditing || saving}
                placeholder="0,00"
              />
            </label>

            <label>
              <span className="label">Status</span>
              <select
                className="input"
                value={current.ativo ? "true" : "false"}
                onChange={e => setCurrent({ ...current, ativo: e.target.value === "true" })}
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
                  <button type="button" className="btn ghost" onClick={() => { setOpen(false); setCurrent(null); setIsEditing(false); }}>
                    Fechar
                  </button>
                  <button type="button" className="btn" onClick={() => setIsEditing(true)}>Editar</button>
                  {current.id && (
                    <button type="button" className="btn danger" onClick={() => current && setToDelete(current as Funcionario)}>
                      Excluir
                    </button>
                  )}
                </>
              )}
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title={toDelete ? `Excluir "${toDelete.nome}"?` : "Excluir"}
        message={deleting ? "Excluindo…" : "Essa ação não pode ser desfeita."}
        onClose={() => !deleting && setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) await deleteFuncionario(toDelete.id);
          setToDelete(null);
        }}
        confirmDisabled={deleting}
      />

      {/* Estilo adicional para harmonia visual */}
      <style>{`
        .header-line{ display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .header-line h1{ margin:0; font-size:20px; }
        .header-actions{ display:flex; gap:8px; }

        .row-click:hover td { background: rgba(0,0,0,.02); }
        .badge { display:inline-block; padding:2px 8px; border-radius:999px; font-size:12px; line-height:18px; }
        .badge.success { background:#e7f6ee; color:#137a4b; }
        .badge.muted { background:#f1f3f5; color:#5f6b7a; }

        .btn { appearance:none; border:1px solid #d0d7de; background:#fff; padding:8px 12px; border-radius:8px; cursor:pointer;
               font-size:14px; line-height:20px; transition:.15s; }
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
