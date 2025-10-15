import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";

/* ================= Tipos ================= */
type Conta = {
  id: string; // uuid
  codigo: string;
  nome: string;
  nivel: number;
  conta_pai_id: string | null;
  tipo_conta_id: number | string;
  classificacao_dre_id: number | string | null;
  classificacao_balanco_id: number | string | null;
  natureza_id: number | string | null;
  conta_direcao_id: number | string;   // ✅ NOVO (obrigatório)
  ativa: boolean;
};

type TipoConta = { id: number | string; nome: string };
type ClassDRE  = { id: number | string; nome: string; ordem: number };
type ClassBal  = { id: number | string; codigo: string; grupo: "ATIVO"|"PASSIVO"|"PL"; nome: string; ordem: number };
type Natureza  = { id: number | string; nome: string; sinal: number };
type ContaDirecao = { id: number | string; nome: "Entrada" | "Saida" | "Neutra" };

/* ================= Consts & Utils ================= */
const API = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL ?? "/api");
const byString = (k: keyof any) => (a: any, b: any) =>
  String(a[k]).localeCompare(String(b[k]), "pt-BR", { numeric: true });
const trim = (s?: string | null) => (s ?? "").trim();
const isCodigoOk = (s: string) => /^[0-9A-Za-z.\-_/]+$/.test(s);

const StatusPill = ({ active }: { active: boolean }) => (
  <span className={`status-badge ${active ? "status-badge--active" : "status-badge--inactive"}`}>
    {active ? "Ativo" : "Inativo"}
  </span>
);

export default function ContasGerenciais() {
  const navigate = useNavigate();

  const [contas, setContas] = useState<Conta[]>([]);
  const [tipos, setTipos] = useState<TipoConta[]>([]);
  const [classesDRE, setClassesDRE] = useState<ClassDRE[]>([]);
  const [classesBAL, setClassesBAL] = useState<ClassBal[]>([]);
  const [naturezas, setNaturezas] = useState<Natureza[]>([]);
  const [direcoes, setDirecoes] = useState<ContaDirecao[]>([]); // ✅ NOVO

  const [loading, setLoading] = useState(false);
  const [openForm, setOpenForm] = useState(false);
  const [openConfig, setOpenConfig] = useState(false);
  const [current, setCurrent] = useState<Partial<Conta> | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [toDelete, setToDelete] = useState<Conta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<{ [k: string]: string | null }>({});

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [rC, rT, rD, rB, rN, rDir] = await Promise.all([
        fetch(`${API}/contas`, { headers: { Accept: "application/json" } }),
        fetch(`${API}/tipos-conta`, { headers: { Accept: "application/json" } }),
        fetch(`${API}/classificacoes-dre`, { headers: { Accept: "application/json" } }),
        fetch(`${API}/classificacoes-balanco`, { headers: { Accept: "application/json" } }),
        fetch(`${API}/naturezas`, { headers: { Accept: "application/json" } }),
        fetch(`${API}/ref/contas-direcao`, { headers: { Accept: "application/json" } }), // ✅ NOVO (endpoint de domínio)
      ]);

      const listC = rC.ok ? await rC.json().catch(() => []) : [];
      const listT = rT.ok ? await rT.json().catch(() => []) : [];
      const listD = rD.ok ? await rD.json().catch(() => []) : [];
      const listB = rB.ok ? await rB.json().catch(() => []) : [];
      const listN = rN.ok ? await rN.json().catch(() => []) : [];
      const listDir = rDir.ok ? await rDir.json().catch(() => []) : [];

      setContas(Array.isArray(listC) ? listC.sort(byString("codigo")) : []);
      setTipos(Array.isArray(listT) ? listT.sort(byString("nome")) : []);
      setClassesDRE(Array.isArray(listD)
        ? listD.sort((a: any, b: any) => (a.ordem ?? 999) - (b.ordem ?? 999) || byString("nome")(a, b))
        : []);
      setClassesBAL(Array.isArray(listB)
        ? listB.sort((a: any, b: any) => (a.ordem ?? 999) - (b.ordem ?? 999) || byString("nome")(a, b))
        : []);
      setNaturezas(Array.isArray(listN) ? listN.sort(byString("nome")) : []);
      setDirecoes(Array.isArray(listDir) ? listDir : []); // nomes: Entrada | Saida | Neutra

      if (!rC.ok) console.error("Falha /contas:", rC.status, await rC.text().catch(() => ""));
      if (!rT.ok) console.error("Falha /tipos-conta:", rT.status, await rT.text().catch(() => ""));
      if (!rD.ok) console.error("Falha /classificacoes-dre:", rD.status, await rD.text().catch(() => ""));
      if (!rB.ok) console.error("Falha /classificacoes-balanco:", rB.status, await rB.text().catch(() => ""));
      if (!rN.ok) console.error("Falha /naturezas:", rN.status, await rN.text().catch(() => ""));
      if (!rDir.ok) console.error("Falha /ref/contas-direcao:", rDir.status, await rDir.text().catch(() => ""));
    } catch (e) {
      console.error(e);
      setError("Falha ao carregar dados.");
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const mapTipoById = useMemo(() => {
    const m = new Map<string, string>();
    tipos.forEach(t => m.set(String(t.id), t.nome));
    return m;
  }, [tipos]);

  const mapClassById = useMemo(() => {
    const m = new Map<string, string>();
    classesDRE.forEach(c => m.set(String(c.id), c.nome));
    return m;
  }, [classesDRE]);

  const mapBalById = useMemo(() => {
    const m = new Map<string, string>();
    classesBAL.forEach(c => m.set(String(c.id), `${c.codigo} — ${c.nome}`));
    return m;
  }, [classesBAL]);

  const mapNaturezaById = useMemo(() => {
    const m = new Map<string, string>();
    naturezas.forEach(n => m.set(String(n.id), n.nome));
    return m;
  }, [naturezas]);

  const optionsContaPai = useMemo(() => {
    const sorted = [...contas].sort(byString("codigo"));
    return sorted.map(c => {
      const lvl = Math.max(0, (c.nivel ?? 1) - 1);
      const prefix = " ".repeat(lvl) + (lvl > 0 ? "• " : "");
      return { value: c.id, label: `${prefix}${c.codigo} — ${c.nome}` };
    });
  }, [contas]);

  const parent = useMemo(
    () => (current?.conta_pai_id ? contas.find(c => c.id === current.conta_pai_id) || null : null),
    [current?.conta_pai_id, contas]
  );
  const nivel = useMemo(() => (parent?.nivel ?? 0) + 1, [parent]);

  function validar(): boolean {
    if (!current) return false;
    const errs: { [k: string]: string | null } = {};
    const _codigo = trim(current.codigo);
    const _nome = trim(current.nome);
    if (!_codigo) errs.codigo = "Informe um código.";
    else if (!isCodigoOk(_codigo)) errs.codigo = "Use letras/números e (., -, _, /).";
    if (!_nome) errs.nome = "Informe o nome da conta.";
    if (!current.tipo_conta_id && current.tipo_conta_id !== 0) errs.tipo = "Selecione o tipo de conta.";
    if (current.natureza_id == null || current.natureza_id === "") errs.natureza = "Selecione a natureza.";
    if (current.conta_direcao_id == null || current.conta_direcao_id === "") errs.direcao = "Selecione a direção da conta."; // ✅ NOVO
    setFieldErr(errs);
    return Object.values(errs).every(v => !v);
  }

  async function saveConta(e?: React.FormEvent) {
    e?.preventDefault();
    if (!current) return;
    setError(null);
    if (!validar()) return;

    const payload = {
      codigo: trim(current.codigo!),
      nome: trim(current.nome!),
      nivel,
      conta_pai_id: current.conta_pai_id || null,
      tipo_conta_id: Number(current.tipo_conta_id),
      classificacao_dre_id: current.classificacao_dre_id != null && current.classificacao_dre_id !== "" ? Number(current.classificacao_dre_id) : null,
      classificacao_balanco_id: current.classificacao_balanco_id != null && current.classificacao_balanco_id !== "" ? Number(current.classificacao_balanco_id) : null,
      natureza_id: current.natureza_id != null && current.natureza_id !== "" ? Number(current.natureza_id) : null,
      conta_direcao_id: Number(current.conta_direcao_id), // ✅ NOVO (obrigatório)
      ativa: current.ativa ?? true,
    };

    const method = current.id ? "PUT" : "POST";
    const url = current.id ? `${API}/contas/${current.id}` : `${API}/contas`;

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
          if (res.status === 409) setFieldErr(prev => ({ ...prev, codigo: "Já existe uma conta com esse código." }));
          setError(j.error || j.detail || `Erro ao salvar (${res.status})`);
        } catch {
          if (res.status === 409) setFieldErr(prev => ({ ...prev, codigo: "Já existe uma conta com esse código." }));
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

  async function doDeleteConta(id: string) {
    try {
      const res = await fetch(`${API}/contas/${id}`, { method: "DELETE", headers: { Accept: "application/json" } });
      if (res.status === 204) { await load(); return; }
      const txt = await res.text().catch(() => "");
      alert(txt || `Erro ao excluir (${res.status})`);
    } catch (err) {
      console.error(err);
      alert("Falha de rede ao excluir.");
    }
  }

  return (
    <>
      <div className="card" style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <h2 style={{ margin: 0 }}>Contas Gerenciais</h2>
        <div style={{ display:"flex", gap: 8 }}>
          <button className="btn" onClick={load}>Atualizar</button>
          <button className="btn" onClick={() => setOpenConfig(true)}>Configurações</button>
          <button
            className="btn primary"
            onClick={() => {
              setFieldErr({});
              setError(null);
              setIsEditing(true);
              setCurrent({
                conta_pai_id: null, codigo: "", nome: "",
                tipo_conta_id: "" as any,
                classificacao_dre_id: null,
                classificacao_balanco_id: null,
                natureza_id: "",
                conta_direcao_id: "" as any, // ✅ NOVO
                ativa: true,
              });
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
            <col style={{width:'14%'}}/>
            <col style={{width:'26%'}}/>
            <col style={{width:'12%'}}/>
            <col style={{width:'18%'}}/>
            <col style={{width:'18%'}}/>
            <col style={{width:'12%'}}/>
          </colgroup>
          <thead>
            <tr>
              <th>Código</th>
              <th>Nome</th>
              <th>Tipo</th>
              <th>Classificação DRE</th>
              <th>Classificação Balanço</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="empty">Carregando…</td></tr>}
            {!loading && contas.map(c => (
              <tr key={c.id} className="row-click" style={{ cursor:"pointer" }}
                  onClick={() => { setCurrent({ ...c }); setIsEditing(false); setOpenForm(true); }}>
                <td>{c.codigo}</td>
                <td>{c.nome}</td>
                <td>{mapTipoById.get(String(c.tipo_conta_id)) ?? "-"}</td>
                <td>{c.classificacao_dre_id != null ? (mapClassById.get(String(c.classificacao_dre_id)) ?? "—") : "—"}</td>
                <td>{c.classificacao_balanco_id != null ? (mapBalById.get(String(c.classificacao_balanco_id)) ?? "—") : "—"}</td>
                <td><StatusPill active={!!c.ativa} /></td>
              </tr>
            ))}
            {!loading && contas.length === 0 && (
              <tr><td colSpan={6} className="empty" style={{ color:"var(--muted)" }}>Nenhuma conta cadastrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal conta */}
      <Modal
        open={openForm}
        title={current?.id ? (isEditing ? "Editar Conta" : "Detalhes da Conta") : "Nova Conta"}
        onClose={() => { setOpenForm(false); setCurrent(null); setIsEditing(false); setFieldErr({}); setError(null); }}
        size="lg"
      >
        {current && (
          <form className="form-grid" onSubmit={(e) => { e.preventDefault(); if (isEditing) saveConta(); else setIsEditing(true); }}>
            <label>
              <span className="label">Conta Pai (opcional)</span>
              <select className="input" value={current.conta_pai_id ?? ""}
                onChange={e => setCurrent({ ...current, conta_pai_id: e.target.value || null })}
                disabled={!isEditing}>
                <option value="">— Raiz —</option>
                {optionsContaPai.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <small className="hint">Contas com filhas não podem receber lançamentos.</small>
            </label>

            <label>
              <span className="label">Código</span>
              <div style={{ display:"flex", gap: 8 }}>
                <input className="input" value={current.codigo ?? ""}
                  onChange={e => { setCurrent({ ...current, codigo: e.target.value }); setFieldErr(prev => ({ ...prev, codigo: null })); }}
                  placeholder={`${(contas.find(c => c.id===current?.conta_pai_id)?.codigo ? (contas.find(c => c.id===current?.conta_pai_id)!.codigo + ".") : "")}1`}
                  aria-invalid={!!fieldErr.codigo} required disabled={!isEditing} />
                <button
                  type="button" className="btn"
                  onClick={() => {
                    const parent = contas.find(c => c.id === current?.conta_pai_id);
                    const parentCode = parent ? `${parent.codigo}.` : "";
                    const siblings = contas.filter(c => (c.conta_pai_id ?? "") === (current?.conta_pai_id || null));
                    let max = 0;
                    siblings.forEach(s => {
                      if (!s.codigo.startsWith(parentCode)) return;
                      const resto = s.codigo.slice(parentCode.length);
                      const primeira = resto.split(".")[0];
                      const n = parseInt(primeira, 10);
                      if (!Number.isNaN(n)) max = Math.max(max, n);
                    });
                    setCurrent(c => ({ ...(c||{}), codigo: `${parentCode}${max + 1}` }));
                  }}
                  disabled={!isEditing}
                >
                  Sugerir
                </button>
              </div>
              {fieldErr.codigo && <small className="field-error">{fieldErr.codigo}</small>}
              <small className="hint">Ex.: 3, 3.1, 3.1.2 (permitido: letras/números . - _ /).</small>
            </label>

            <label>
              <span className="label">Nome</span>
              <input className="input" value={current.nome ?? ""}
                onChange={e => { setCurrent({ ...current, nome: e.target.value }); setFieldErr(prev => ({ ...prev, nome: null })); }}
                aria-invalid={!!fieldErr.nome} required disabled={!isEditing} />
              {fieldErr.nome && <small className="field-error">{fieldErr.nome}</small>}
            </label>

            <label>
              <span className="label">Tipo de Conta</span>
              <select className="input"
                value={current.tipo_conta_id != null ? String(current.tipo_conta_id) : ""}
                onChange={e => { const v = e.target.value || ""; setCurrent({ ...current, tipo_conta_id: v }); setFieldErr(prev => ({ ...prev, tipo: null })); }}
                aria-invalid={!!fieldErr.tipo} required disabled={!isEditing}>
                <option value="">Selecione…</option>
                {tipos.map(t => (<option key={String(t.id)} value={String(t.id)}>{t.nome}</option>))}
              </select>
              {fieldErr.tipo && <small className="field-error">{fieldErr.tipo}</small>}
            </label>

            <label>
              <span className="label">Classificação DRE (opcional)</span>
              <select className="input"
                value={current.classificacao_dre_id != null ? String(current.classificacao_dre_id) : ""}
                onChange={e => setCurrent({ ...current, classificacao_dre_id: e.target.value ? e.target.value : null })}
                disabled={!isEditing}>
                <option value="">—</option>
                {classesDRE.map(c => (<option key={String(c.id)} value={String(c.id)}>{c.nome}</option>))}
              </select>
            </label>

            <label>
              <span className="label">Classificação Balanço (opcional)</span>
              <select className="input"
                value={current.classificacao_balanco_id != null ? String(current.classificacao_balanco_id) : ""}
                onChange={e => setCurrent({ ...current, classificacao_balanco_id: e.target.value ? e.target.value : null })}
                disabled={!isEditing}>
                <option value="">—</option>
                {classesBAL.map(c => (
                  <option key={String(c.id)} value={String(c.id)}>
                    {c.codigo} — {c.nome} ({c.grupo})
                  </option>
                ))}
              </select>
              <small className="hint">Preencha para não cair em OUTROS no Balanço.</small>
            </label>

            <label>
              <span className="label">Natureza</span>
              <select className="input"
                value={current.natureza_id != null ? String(current.natureza_id) : ""}
                onChange={e => setCurrent({ ...current, natureza_id: e.target.value ? e.target.value : null })}
                disabled={!isEditing} required>
                <option value="">Selecione…</option>
                {naturezas.map(n => (<option key={String(n.id)} value={String(n.id)}>{n.nome}</option>))}
              </select>
              {fieldErr.natureza && <small className="field-error">{fieldErr.natureza}</small>}
            </label>

            {/* ✅ NOVO CAMPO: Direção da Conta */}
            <label>
              <span className="label">Direção da Conta</span>
              <select
                className="input"
                value={current.conta_direcao_id != null ? String(current.conta_direcao_id) : ""}
                onChange={e => setCurrent({ ...current, conta_direcao_id: e.target.value ? e.target.value : "" })}
                disabled={!isEditing}
                required
              >
                <option value="">Selecione…</option>
                {direcoes.map(d => (
                  <option key={String(d.id)} value={String(d.id)}>{d.nome}</option>
                ))}
              </select>
              {fieldErr.direcao && <small className="field-error">{fieldErr.direcao}</small>}
              <small className="hint">
                Entrada / Saída engessam a conta para o formulário. Relatórios continuam usando a direção do <i>lançamento</i> (recebido/pago) para o sinal.
              </small>
            </label>

            <label>
              <span className="label">Nível</span>
              <input className="input" value={(parent?.nivel ?? 0) + 1} readOnly disabled />
            </label>

            <label>
              <span className="label">Status</span>
              <select className="input"
                value={current.ativa ? "true" : "false"}
                onChange={e => setCurrent({ ...current, ativa: e.target.value === "true" })}
                disabled={!isEditing}>
                <option value="true">Ativa</option>
                <option value="false">Inativa</option>
              </select>
            </label>

            <div className="modal-footer" style={{ gridColumn:"1 / -1", display:"flex", gap:8, justifyContent:"flex-end" }}>
              {error && <span className="field-error" style={{ marginRight:"auto" }}>{error}</span>}
              <button type="button" className="btn" onClick={() => { setOpenForm(false); setCurrent(null); setIsEditing(false); setFieldErr({}); setError(null); }}>
                Fechar
              </button>
              <button type="submit" className="btn primary">
                {isEditing ? (current.id ? "Salvar alterações" : "Salvar") : "Editar"}
              </button>
              {current?.id && <button type="button" className="btn danger" onClick={() => setToDelete(current as Conta)}>Excluir</button>}
            </div>
          </form>
        )}
      </Modal>

      {/* Modal Configurações */}
      <Modal open={openConfig} title="Configurações do Plano" onClose={() => setOpenConfig(false)} size="md">
        <div style={{ display:"grid", gap:12 }}>
          <p style={{ marginTop:0, color:"var(--muted)" }}>Ajuste as tabelas de referência usadas nos lançamentos e relatórios.</p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:8 }}>
            <button className="btn" onClick={() => navigate("/referencias/tipos-conta")}>Tipos de Conta</button>
            <button className="btn" onClick={() => navigate("/referencias/classificacoes-dre")}>Classificações DRE</button>
            <button className="btn" onClick={() => navigate("/referencias/classificacoes-balanco")}>Classificações Balanço</button>
            <button className="btn" onClick={() => navigate("/referencias/naturezas")}>Naturezas</button>
            <button className="btn" onClick={() => navigate("/referencias/pessoas")}>Pessoas</button>
          </div>
        </div>
        <div className="modal-footer" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => setOpenConfig(false)}>Fechar</button>
        </div>
      </Modal>

      {/* Confirmação de exclusão */}
      <ConfirmDialog
        open={!!toDelete}
        title={toDelete ? `Excluir "${toDelete.codigo} — ${toDelete.nome}"?` : "Excluir"}
        message="Essa ação não pode ser desfeita."
        onClose={() => setToDelete(null)}
        onConfirm={async () => { if (toDelete) await doDeleteConta(toDelete.id); setToDelete(null); setOpenForm(false); setCurrent(null); setIsEditing(false); }}
      />

      <style>{`.row-click:hover td{ background: rgba(0,0,0,.02); } .hint{ color: var(--muted,#6b7280); font-size:12px; }`}</style>
    </>
  );
}
