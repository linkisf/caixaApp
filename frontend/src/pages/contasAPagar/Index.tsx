// src/pages/ContasAPagar.tsx
import React, { useEffect, useMemo, useState } from "react";
import "./ContasAPagar.css";

/* ========= Modal ========= */
type ModalProps = {
  open: boolean;
  title?: string;
  size?: "sm" | "md" | "lg";
  onClose: () => void;
  children: React.ReactNode;
};
function Modal({ open, title, size = "md", onClose, children }: ModalProps) {
  if (!open) return null;
  const maxW = size === "sm" ? 520 : size === "lg" ? 980 : 760;
  return (
    <div role="dialog" aria-modal="true" className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: maxW }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h4>{title}</h4>
          <button className="btn" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ========= Tipos ========= */
export type CAP = {
  id: string;
  data_emissao: string | null;
  data_vencimento: string | null;
  data_pagamento: string | null;
  destino_tipo_id: number | null;
  destino_id: number | null;
  destino_tipo_codigo: "funcionario" | "fornecedor" | string;
  destino_nome: string | null;
  tipo_id: number | null;
  valor_centavos: number;
  forma_pagamento_id: number | null;
  status_id: number;
  status_codigo: "aberto" | "pago" | "atrasado" | "cancelado" | null;
  conta_id: number;
  descricao: string | null;
  canal?: "boleto" | "pix" | "dinheiro" | "outros";
};

type ContaCorrente = { id: string; nome: string; ativa: boolean };
type FormaPagamento = { id: number; nome: string };
type TipoSaidaFunc = { id: number; nome: string };
type Pessoa = { id: number; nome: string; ativo?: boolean };
type ContaPlano = { id: number; nome: string; ativo?: boolean; conta_direcao_id?: number };
type DestinoTipo = { id: number; codigo: string; nome: string; ativo: boolean };

type Gran = "mes" | "dia";

const API = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL ?? "/api");

/* ========= Utils ========= */
const CURRENCY = { style: "currency", currency: "BRL" } as const;
const fmtBRL = (cents: number) => ((cents ?? 0) / 100).toLocaleString("pt-BR", CURRENCY);
function ymdOnly(s?: string | null): string {
  return (s && typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s)) ? s.slice(0,10) : "";
}
const fmtBR = (ymd: string) => (ymd ? new Date(`${ymd}T00:00:00`).toLocaleDateString("pt-BR") : "—");
const fmtBRFromDate = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toLocaleDateString("pt-BR");
function toLocalISODate(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const z = new Date(x.getTime() - x.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
const addDays = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
const startOfWeekSunday = (d: Date) => addDays(d, -d.getDay());
const endOfWeekSaturday = (d: Date) => addDays(startOfWeekSunday(d), 6);
const fmtRangeBR = (ini: Date, fim: Date) => `${fmtBRFromDate(ini)} – ${fmtBRFromDate(fim)}`;
function ymdBase(r: CAP): string { return ymdOnly(r.data_vencimento || r.data_emissao); }

/* ========= Página ========= */
export default function ContasAPagar() {
  const todayISO = toLocalISODate(new Date());

  // período + granularidade
  const [periodo, setPeriodo] = useState<{ de: string; ate: string }>({
    de: toLocalISODate(addDays(new Date(), -60)),
    ate: toLocalISODate(addDays(new Date(), 60)),
  });
  const [gran, setGran] = useState<Gran>("mes");

  // dados
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abertas, setAbertas] = useState<CAP[]>([]);
  const [pagas, setPagas] = useState<CAP[]>([]);

  // refs
  const [contasCorrente, setContasCorrente] = useState<ContaCorrente[]>([]);
  const [formas, setFormas] = useState<FormaPagamento[]>([]);
  const [tiposFunc, setTiposFunc] = useState<TipoSaidaFunc[]>([]);
  const [funcionarios, setFuncionarios] = useState<Pessoa[]>([]);
  const [fornecedores, setFornecedores] = useState<Pessoa[]>([]);
  const [contasPlano, setContasPlano] = useState<ContaPlano[]>([]);
  const [destinosTipo, setDestinosTipo] = useState<DestinoTipo[]>([]);

  // modal genérico de lista
  const [listOpen, setListOpen] = useState(false);
  const [listTitle, setListTitle] = useState("");
  const [listItens, setListItens] = useState<CAP[]>([]);

  // modal de pagamento
  const [payOpen, setPayOpen] = useState(false);
  const [payRow, setPayRow] = useState<CAP | null>(null);
  const [payForm, setPayForm] = useState({
    data_pagamento: todayISO,
    conta_corrente_id: "",
    forma_pagamento_id: "",
    funcionario_tipo_saida_id: "",
    descricao_mov: "",
  });

  // modal de criação
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    data_emissao: todayISO,
    data_vencimento: todayISO,
    destino_tipo_id: "" as string,      // agora usamos o ID do domínio
    destino_id: "",
    valor_reais: "",
    forma_pagamento_id: "",
    conta_id: "",
    descricao: "",
  });

  /* === Carregamento === */
  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qp = new URLSearchParams();
      if (periodo.de) qp.set("de", periodo.de);
      if (periodo.ate) qp.set("ate", periodo.ate);

      const [rOpen, rPaid, rCC, rFP, rTS, rFunc, rForn, rConta, rDest] = await Promise.all([
        fetch(`${API}/contas-a-pagar?${qp.toString()}&status=aberto`, { headers: { Accept: "application/json" } }),
        fetch(`${API}/contas-a-pagar?${qp.toString()}&status=pago`,   { headers: { Accept: "application/json" } }),
        fetch(`${API}/contas-corrente`,                               { headers: { Accept: "application/json" } }),
        fetch(`${API}/formas-pagamento`,                              { headers: { Accept: "application/json" } }),
        fetch(`${API}/ref/funcionario-tipos-saida?ativos=true`,       { headers: { Accept: "application/json" } }),
        fetch(`${API}/funcionarios?ativos=true`,                      { headers: { Accept: "application/json" } }),
        fetch(`${API}/fornecedores?ativos=true`,                      { headers: { Accept: "application/json" } }),
        fetch(`${API}/contas?ativas=true`,                            { headers: { Accept: "application/json" } }),
        fetch(`${API}/contas-a-pagar/destinos-tipo?ativos=true`,      { headers: { Accept: "application/json" } }),
      ]);

      setAbertas(rOpen.ok ? await rOpen.json() : []);
      setPagas(rPaid.ok ? await rPaid.json() : []);
      setContasCorrente((rCC.ok ? await rCC.json() : []).filter((x: any) => x?.ativa));
      setFormas(rFP.ok ? await rFP.json() : []);
      setTiposFunc(rTS.ok ? await rTS.json() : []);
      setFuncionarios(rFunc.ok ? await rFunc.json() : []);
      setFornecedores(rForn.ok ? await rForn.json() : []);
      setDestinosTipo(rDest.ok ? await rDest.json() : []);

      // apenas SAÍDA
      const contasResp = rConta.ok ? await rConta.json() : [];
      const contasSaida = (contasResp as any[])
        .filter((x) => (x?.ativo ?? true))
        .filter((x) => Number(x?.conta_direcao_id) === 2);
      setContasPlano(contasSaida);
    } catch (e) {
      console.error(e);
      setError("Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  /* ======= Mapas & Helpers ======= */
  const contaNomeById = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of contasPlano) m.set(Number(c.id), c.nome);
    return m;
  }, [contasPlano]);

  const canalByFormaId = useMemo(() => {
    const m = new Map<number, "boleto" | "pix" | "dinheiro" | "outros">();
    for (const f of formas) {
      const id = Number(f.id);
      const nm = String(f.nome || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "");
      const isBoleto = nm.includes("boleto") || nm.startsWith("bol") || nm.includes(" bol ") || nm.includes(" bol.");
      const isPix = nm.includes("pix");
      const isDinheiro = nm.includes("dinheiro") || nm.includes("cash") || nm.includes("especie");
      if (isBoleto) m.set(id, "boleto");
      else if (isPix) m.set(id, "pix");
      else if (isDinheiro) m.set(id, "dinheiro");
      else m.set(id, "outros");
    }
    return m;
  }, [formas]);

  const abertasValidas = useMemo(
    () => abertas.filter(r => !!ymdBase(r)),
    [abertas]
  );

  // ALERTAS
  const vencemHoje = useMemo(() => {
    const hoje = todayISO;
    return abertasValidas.filter(r => ymdBase(r) === hoje);
  }, [abertasValidas, todayISO]);

  const vencidas = useMemo(() => {
    const hoje = todayISO;
    return abertasValidas.filter(r => {
      const y = ymdBase(r);
      return y !== "" && y < hoje;
    });
  }, [abertasValidas, todayISO]);

  type TotRow = { chave: string; startISO: string; endISO: string; label: string; total_centavos: number; itens: CAP[] };

  const totalAgg = useMemo<TotRow[]>(() => {
    const map = new Map<string, TotRow>();
    for (const r of abertasValidas) {
      const y = ymdBase(r);
      if (!y) continue;
      let key: string, label: string, startISO: string, endISO: string;
      if (gran === "dia") {
        key = y; label = fmtBR(y); startISO = y; endISO = y;
      } else {
        const [Y, M] = y.split("-").map(Number);
        key = `${Y}-${String(M).padStart(2, "0")}`;
        const start = new Date(Y, M - 1, 1);
        const end = new Date(Y, M, 0);
        startISO = toLocalISODate(start);
        endISO = toLocalISODate(end);
        label = `${String(M).padStart(2, "0")}/${Y}`;
      }
      const prev = map.get(key);
      if (prev) { prev.total_centavos += r.valor_centavos; prev.itens.push(r); }
      else { map.set(key, { chave: key, startISO, endISO, label, total_centavos: r.valor_centavos, itens: [r] }); }
    }
    return Array.from(map.values()).sort((a, b) => a.startISO.localeCompare(b.startISO));
  }, [abertasValidas, gran]);

  const canalAgg = useMemo(() => {
    const acc = { boleto: 0, pix: 0, dinheiro: 0, outros: 0 } as Record<string, number>;
    for (const r of abertas) {
      const canal = (r.canal as string) || canalByFormaId.get(Number(r.forma_pagamento_id ?? -1)) || "outros";
      acc[canal] = (acc[canal] || 0) + r.valor_centavos;
    }
    return acc;
  }, [abertas, canalByFormaId]);

  // Semanas (todos os pagamentos)
  const weekBlocks = useMemo(() => {
    const baseSun = startOfWeekSunday(new Date());
    const out: { start: Date; end: Date; startISO: string; endISO: string; label: string; total: number; count: number; itens: CAP[] }[] = [];
    const all = abertasValidas;
    for (let i = 0; i < 5; i++) {
      const start = addDays(baseSun, i * 7);
      const end = endOfWeekSaturday(start);
      const startISO = toLocalISODate(start);
      const endISO = toLocalISODate(end);
      const itens = all.filter(r => {
        const y = ymdBase(r);
        return y !== "" && y >= startISO && y <= endISO;
      });
      const total = itens.reduce((s, x) => s + x.valor_centavos, 0);
      out.push({ start, end, startISO, endISO, label: fmtRangeBR(start, end), total, count: itens.length, itens });
    }
    return out;
  }, [abertasValidas]);

  const maxWeek = useMemo(
    () => weekBlocks.reduce((m, w) => Math.max(m, w.total), 0) || 1,
    [weekBlocks]
  );

  // Grupos
  type GroupRow = { id: number; nome: string; total: number; count: number; itens: CAP[] };
  const gruposFornecedor = useMemo<GroupRow[]>(() => {
    const map = new Map<number, GroupRow>();
    for (const r of abertasValidas) {
      if (r.destino_tipo_codigo !== "fornecedor") continue;
      const id = Number(r.destino_id);
      const g = map.get(id);
      if (g) { g.total += r.valor_centavos; g.count += 1; g.itens.push(r); }
      else { map.set(id, { id, nome: r.destino_nome || `Fornecedor #${id}`, total: r.valor_centavos, count: 1, itens: [r] }); }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [abertasValidas]);

  const gruposFuncionario = useMemo<GroupRow[]>(() => {
    const map = new Map<number, GroupRow>();
    for (const r of abertasValidas) {
      if (r.destino_tipo_codigo !== "funcionario") continue;
      const id = Number(r.destino_id);
      const g = map.get(id);
      if (g) { g.total += r.valor_centavos; g.count += 1; g.itens.push(r); }
      else { map.set(id, { id, nome: r.destino_nome || `Funcionário #${id}`, total: r.valor_centavos, count: 1, itens: [r] }); }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [abertasValidas]);

  /* ======= Ações ======= */
  function openListModal(title: string, itens: CAP[]) {
    setListTitle(title); setListItens(itens); setListOpen(true);
  }

  function openPay(row: CAP) {
    setPayRow(row);
    setPayForm({
      data_pagamento: todayISO,
      conta_corrente_id: "",
      forma_pagamento_id: "",
      funcionario_tipo_saida_id: "",
      descricao_mov: row.descricao || "",
    });
    setPayOpen(true);
  }

  async function confirmarPagamento(e?: React.FormEvent) {
    e?.preventDefault();
    if (!payRow) return;
    try {
      setError(null);
      const payload: any = {
        data_pagamento: payForm.data_pagamento,
        conta_corrente_id: payForm.conta_corrente_id,
        forma_pagamento_id: Number(payForm.forma_pagamento_id),
        descricao_mov: payForm.descricao_mov || null,
      };
      if (payRow.destino_tipo_codigo === "funcionario") {
        if (!payForm.funcionario_tipo_saida_id) {
          setError("Selecione o Tipo de Saída (Funcionário).");
          return;
        }
        payload.funcionario_tipo_saida_id = Number(payForm.funcionario_tipo_saida_id);
      }
      const r = await fetch(`${API}/contas-a-pagar/${payRow.id}/pagar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        setError(t || `Erro ao pagar (${r.status})`);
        return;
      }
      setPayOpen(false);
      setListOpen(false);
      await load();
    } catch (e) {
      console.error(e);
      setError("Falha ao pagar.");
    }
  }

  function openCreate() {
    const primeiraConta = contasPlano[0] ? String(contasPlano[0].id) : "";
    const primeiraForma = formas[0] ? String(formas[0].id) : "";
    setCreateForm({
      data_emissao: todayISO,
      data_vencimento: todayISO,
      destino_tipo_id: "",           // pode ser vazio (Nenhum)
      destino_id: "",
      valor_reais: "",
      forma_pagamento_id: primeiraForma,
      conta_id: primeiraConta,
      descricao: "",
    });
    setCreateError(null);
    setCreateOpen(true);
  }

  // máscara de dinheiro
  function maskMoney(value: string) {
    const onlyNums = String(value).replace(/\D/g, "");
    let num = (parseInt(onlyNums || "0", 10) || 0).toString();
    while (num.length < 3) num = "0" + num;
    const cents = num.slice(-2);
    const intPart = num.slice(0, -2);
    const intFmt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `R$ ${intFmt},${cents}`;
  }
  function handleValorChange(e: React.ChangeEvent<HTMLInputElement>) {
    setCreateForm(f => ({ ...f, valor_reais: maskMoney(e.target.value) }));
  }
  function parseMaskedBRLToCentavos(masked: string): number {
    const digits = (masked || "").replace(/\D/g, "");
    return parseInt(digits || "0", 10);
  }

  // ajuda a decidir se devemos mostrar “Destino (Pessoa)”
  const selectedDestinoTipo = useMemo(() => {
    const id = Number(createForm.destino_tipo_id || -1);
    return destinosTipo.find(d => Number(d.id) === id) || null;
  }, [createForm.destino_tipo_id, destinosTipo]);

  const isFunc = (selectedDestinoTipo?.codigo || "").toLowerCase().startsWith("func");
  const isForn = (selectedDestinoTipo?.codigo || "").toLowerCase().startsWith("forn");
  const mustShowPessoa = Boolean(selectedDestinoTipo && (isFunc || isForn));

  async function submitCreate(e?: React.FormEvent) {
    e?.preventDefault();
    setCreateError(null);
    setCreateLoading(true);
    try {
      if (!createForm.conta_id) {
        setCreateError("Selecione a conta (somente contas de saída aparecem aqui).");
        setCreateLoading(false);
        return;
      }
      const valor_centavos = parseMaskedBRLToCentavos(createForm.valor_reais);
      if (!valor_centavos || valor_centavos <= 0) {
        setCreateError("Informe um valor válido (ex.: R$ 200,00).");
        setCreateLoading(false);
        return;
      }

      const body: any = {
        data_emissao: createForm.data_emissao,
        data_vencimento: createForm.data_vencimento || null,
        valor_centavos,
        forma_pagamento_id: createForm.forma_pagamento_id ? Number(createForm.forma_pagamento_id) : undefined,
        conta_id: createForm.conta_id ? Number(createForm.conta_id) : undefined,
        descricao: createForm.descricao || null,
      };

      // envia destino_tipo_id se selecionado
      if (createForm.destino_tipo_id) {
        body.destino_tipo_id = Number(createForm.destino_tipo_id);
        if (mustShowPessoa) {
          if (!createForm.destino_id) {
            setCreateError("Selecione o destino (pessoa).");
            setCreateLoading(false);
            return;
          }
          body.destino_id = Number(createForm.destino_id);
        }
      }

      const r = await fetch(`${API}/contas-a-pagar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        setCreateError(t || `Erro ao criar (${r.status})`);
        setCreateLoading(false);
        return;
      }
      setCreateOpen(false);
      await load();
    } catch (e) {
      console.error(e);
      setCreateError("Falha ao criar conta a pagar.");
    } finally {
      setCreateLoading(false);
    }
  }

  /* ===== Render ===== */
  return (
    <>
      {/* Cabeçalho */}
      <div className="card head">
        <div className="head-row">
          <div className="head-left">
            <h3>Contas a Pagar</h3>
            <span className="sub">período {periodo.de} → {periodo.ate}</span>
          </div>
          <div className="head-right">
            <label className="label inline">
              <span>De</span>
              <input className="input" type="date" value={periodo.de}
                     onChange={(e) => setPeriodo(p => ({ ...p, de: e.target.value }))} />
            </label>
            <label className="label inline">
              <span>Até</span>
              <input className="input" type="date" value={periodo.ate}
                     onChange={(e) => setPeriodo(p => ({ ...p, ate: e.target.value }))} />
            </label>
            <button className="btn" onClick={load}>Aplicar</button>
            <button className="btn primary" onClick={openCreate}>➕ Nova Conta a Pagar</button>
          </div>
        </div>
        {error && <div className="field-error">{error}</div>}
      </div>

      {/* ALERTAS */}
      <div className="card">
        <div className="title-row">
          <h4>Alertas</h4>
          <span className="hint">Clique para visualizar as contas</span>
        </div>
        <div className="kpi-grid">
          <button className="card kpi clickable alert warn"
                  onClick={() => openListModal("Vencem hoje", vencemHoje)}>
            <div className="kpi-label">Vencem hoje</div>
            <div className="kpi-value neg">{fmtBRL(vencemHoje.reduce((s,i)=>s+i.valor_centavos,0))}</div>
            <div className="hint">{vencemHoje.length} lançamento{vencemHoje.length===1?"":"s"}</div>
          </button>

          <button className="card kpi clickable alert danger"
                  onClick={() => openListModal("Vencidas", vencidas)}>
            <div className="kpi-label">Vencidas</div>
            <div className="kpi-value neg">{fmtBRL(vencidas.reduce((s,i)=>s+i.valor_centavos,0))}</div>
            <div className="hint">{vencidas.length} lançamento{vencidas.length===1?"":"s"}</div>
          </button>
        </div>
      </div>

      {/* Totais por período */}
      <div className="card">
        <div className="title-row">
          <h4>Totais de Abertas — {gran === "mes" ? "Mensal" : "Diária"}</h4>
          <div className="btn-group">
            <button className={`btn ${gran === "mes" ? "primary" : ""}`} onClick={() => setGran("mes")}>Mensal</button>
            <button className={`btn ${gran === "dia" ? "primary" : ""}`} onClick={() => setGran("dia")}>Diária</button>
          </div>
        </div>
        {loading && <div className="empty">Carregando…</div>}
        {!loading && totalAgg.length > 0 && (
          <div className="kpi-grid">
            {totalAgg.map((r) => (
              <button key={r.chave} type="button" className="card kpi clickable"
                      onClick={() => openListModal(`Contas do período — ${r.label}`, r.itens)}>
                <div className="kpi-label">{r.label}</div>
                <div className="kpi-value neg">{fmtBRL(r.total_centavos)}</div>
                <div className="hint">{r.itens.length} lançamento{r.itens.length === 1 ? "" : "s"}</div>
              </button>
            ))}
          </div>
        )}
        {!loading && totalAgg.length === 0 && <div className="empty">Sem lançamentos no período.</div>}
      </div>

      {/* Subtotais por canal */}
      <div className="card">
        <div className="title-row">
          <h4>Abertas por Canal</h4>
          <span className="hint">Clique para ver as contas desse canal</span>
        </div>
        <div className="kpi-grid">
          {(["boleto","pix","dinheiro"] as const).map((k) => {
            const itens = abertas.filter(r => {
              const canal = (r.canal as string) || canalByFormaId.get(Number(r.forma_pagamento_id ?? -1)) || "outros";
              return canal === k;
            });
            const total = itens.reduce((s, x) => s + x.valor_centavos, 0);
            const label = k === "boleto" ? "Boleto" : k === "pix" ? "PIX" : "Dinheiro";
            return (
              <button key={k} type="button" className="card kpi clickable"
                      onClick={() => openListModal(`Contas por Canal — ${label}`, itens)}>
                <div className="kpi-label">Abertas — {label}</div>
                <div className="kpi-value neg">{fmtBRL(total)}</div>
                <div className="hint">{itens.length} lançamento{itens.length === 1 ? "" : "s"}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Semanas */}
      <div className="card nohover">
        <div className="title-row">
          <h4>Contas — Semana atual e próximas 4 (dom–sáb)</h4>
          <span className="hint">Agrupamento por data base (vencimento → emissão) para todas as contas em aberto</span>
        </div>
        <div className="boletos-grid">
          {weekBlocks.map((w, idx) => (
            <button key={idx} type="button" onClick={() => openListModal(w.label, w.itens)} className="card boleto-card clickable">
              <div className="boleto-top">
                <strong>{idx === 0 ? "Semana atual" : `+${idx} semana${idx>1?"s":""}`}</strong>
                <span className="hint">{w.label}</span>
              </div>
              <div className="boleto-total neg">{fmtBRL(w.total)}</div>
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: `${Math.round((w.total / maxWeek) * 100)}%` }} />
              </div>
              <div className="hint">{w.count} lançamento{w.count === 1 ? "" : "s"}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Fornecedor */}
      <div className="card">
        <div className="title-row">
          <h4>Contas por Fornecedor (Abertas)</h4>
          <span className="hint">Totais e quantidade por fornecedor — clique na linha ou em “Ver”</span>
        </div>
        {gruposFornecedor.length === 0 && <div className="empty">Sem lançamentos de fornecedores.</div>}
        {gruposFornecedor.length > 0 && (
          <table className="table">
            <colgroup><col style={{ width: "55%" }} /><col style={{ width: "15%" }} /><col style={{ width: "20%" }} /><col style={{ width: "10%" }} /></colgroup>
            <thead><tr><th>Fornecedor</th><th>Qtde</th><th>Total</th><th>—</th></tr></thead>
            <tbody>
              {gruposFornecedor.map(g => (
                <tr key={g.id} onClick={() => openListModal(`Fornecedor — ${g.nome}`, g.itens)} style={{ cursor: "pointer" }}>
                  <td>{g.nome}</td><td>{g.count}</td><td className="neg">{fmtBRL(g.total)}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn" onClick={(e) => { e.stopPropagation(); openListModal(`Fornecedor — ${g.nome}`, g.itens); }}>Ver</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Funcionário */}
      <div className="card">
        <div className="title-row">
          <h4>Contas por Funcionário (Abertas)</h4>
          <span className="hint">Totais e quantidade por funcionário — clique na linha ou em “Ver”</span>
        </div>
        {gruposFuncionario.length === 0 && <div className="empty">Sem lançamentos de funcionários.</div>}
        {gruposFuncionario.length > 0 && (
          <table className="table">
            <colgroup><col style={{ width: "55%" }} /><col style={{ width: "15%" }} /><col style={{ width: "20%" }} /><col style={{ width: "10%" }} /></colgroup>
            <thead><tr><th>Funcionário</th><th>Qtde</th><th>Total</th><th>—</th></tr></thead>
            <tbody>
              {gruposFuncionario.map(g => (
                <tr key={g.id} onClick={() => openListModal(`Funcionário — ${g.nome}`, g.itens)} style={{ cursor: "pointer" }}>
                  <td>{g.nome}</td><td>{g.count}</td><td className="neg">{fmtBRL(g.total)}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn" onClick={(e) => { e.stopPropagation(); openListModal(`Funcionário — ${g.nome}`, g.itens); }}>Ver</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal: Lista */}
      <Modal open={listOpen} title={listTitle} onClose={() => setListOpen(false)} size="lg">
        {listItens.length === 0 && <div className="empty">Sem lançamentos.</div>}
        {listItens.length > 0 && (
          <table className="table">
            <colgroup>
              <col style={{ width: "22%" }} /><col style={{ width: "26%" }} /><col style={{ width: "12%" }} />
              <col style={{ width: "18%" }} /><col style={{ width: "12%" }} /><col style={{ width: "10%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Destino</th>
                <th>Descrição</th>
                <th>Vencimento</th>
                <th>Conta (Plano)</th>
                <th>Valor</th>
                <th>—</th>
              </tr>
            </thead>
            <tbody>
              {listItens.map(item => (
                <tr key={item.id}>
                  <td>{item.destino_nome || "—"} ({item.destino_tipo_codigo || "—"})</td>
                  <td title={item.descricao || undefined}>{item.descricao || "—"}</td>
                  <td>{fmtBR(ymdOnly(item.data_vencimento || item.data_emissao))}</td>
                  <td>{contaNomeById.get(item.conta_id) || String(item.conta_id)}</td>
                  <td className="neg">{fmtBRL(item.valor_centavos)}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn primary" onClick={() => openPay(item)}>Pagar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>

      {/* Modal: Confirmar Pagamento */}
      <Modal open={payOpen} title="Confirmar Pagamento" onClose={() => setPayOpen(false)} size="md">
        {payRow && (
          <form className="form-grid" onSubmit={confirmarPagamento}>
            <div className="form-grid-span info-bloc">
              <div className="info-title">{payRow.destino_nome || "—"} ({payRow.destino_tipo_codigo || "—"})</div>
              <div className="info-sub">Venc.: {fmtBR(ymdOnly(payRow.data_vencimento || payRow.data_emissao))}</div>
              <div className="info-value neg">{fmtBRL(payRow.valor_centavos)}</div>
              {payRow.descricao && <div className="info-desc">{payRow.descricao}</div>}
            </div>

            <label>
              <span className="label">Data de Pagamento</span>
              <input className="input" type="date" value={payForm.data_pagamento}
                     onChange={(e) => setPayForm(f => ({ ...f, data_pagamento: e.target.value }))} required />
            </label>

            <label>
              <span className="label">Conta Corrente</span>
              <select className="input" value={payForm.conta_corrente_id}
                      onChange={(e) => setPayForm(f => ({ ...f, conta_corrente_id: e.target.value }))} required>
                <option value="">Selecione…</option>
                {contasCorrente.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>

            <label>
              <span className="label">Forma de Pagamento</span>
              <select className="input" value={payForm.forma_pagamento_id}
                      onChange={(e) => setPayForm(f => ({ ...f, forma_pagamento_id: e.target.value }))} required>
                <option value="">Selecione…</option>
                {formas.map(fp => <option key={fp.id} value={String(fp.id)}>{fp.nome}</option>)}
              </select>
            </label>

            {payRow.destino_tipo_codigo === "funcionario" && (
              <label>
                <span className="label">Tipo de Saída (Funcionário)</span>
                <select className="input" value={payForm.funcionario_tipo_saida_id}
                        onChange={(e) => setPayForm(f => ({ ...f, funcionario_tipo_saida_id: e.target.value }))} required>
                  <option value="">Selecione…</option>
                  {tiposFunc.map(t => <option key={t.id} value={String(t.id)}>{t.nome}</option>)}
                </select>
              </label>
            )}

            <label className="form-grid-span">
              <span className="label">Descrição do Movimento (opcional)</span>
              <input className="input" value={payForm.descricao_mov}
                     onChange={(e) => setPayForm(f => ({ ...f, descricao_mov: e.target.value }))} />
            </label>

            <div className="modal-footer">
              <button type="button" className="btn" onClick={() => setPayOpen(false)}>Cancelar</button>
              <button type="submit" className="btn primary">Confirmar Pagamento</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Pagas */}
      <div className="card nohover">
        <h4>Contas Pagas (período)</h4>
        {loading && <div className="empty">Carregando…</div>}
        {!loading && pagas.length > 0 && (
          <table className="table">
            <colgroup>
              <col style={{ width: "14%" }} /><col style={{ width: "22%" }} /><col style={{ width: "34%" }} />
              <col style={{ width: "18%" }} /><col style={{ width: "12%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Pagamento</th>
                <th>Destino</th>
                <th>Descrição</th>
                <th>Vencimento</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {pagas.map(p => (
                <tr key={p.id}>
                  <td>{fmtBR(ymdOnly(p.data_pagamento))}</td>
                  <td>{p.destino_nome || "—"} ({p.destino_tipo_codigo || "—"})</td>
                  <td title={p.descricao || undefined}>{p.descricao || "—"}</td>
                  <td>{fmtBR(ymdOnly(p.data_vencimento || p.data_emissao))}</td>
                  <td className="pos">{fmtBRL(p.valor_centavos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && pagas.length === 0 && <div className="empty">Sem pagamentos no período.</div>}
      </div>

      {/* Modal: Nova Conta a Pagar */}
      <Modal open={createOpen} title="Nova Conta a Pagar" onClose={() => setCreateOpen(false)} size="lg">
        <form className="form-grid" onSubmit={submitCreate}>
          <label>
            <span className="label">Emissão</span>
            <input className="input" type="date" value={createForm.data_emissao}
                   onChange={(e) => setCreateForm(f => ({ ...f, data_emissao: e.target.value }))} required />
          </label>
          <label>
            <span className="label">Vencimento</span>
            <input className="input" type="date" value={createForm.data_vencimento}
                   onChange={(e) => setCreateForm(f => ({ ...f, data_vencimento: e.target.value }))} />
          </label>

          <label>
            <span className="label">Destino (Tipo)</span>
            <select className="input" value={createForm.destino_tipo_id}
                    onChange={(e) => setCreateForm(f => ({ ...f, destino_tipo_id: e.target.value, destino_id: "" }))}>
              <option value="">— Nenhum —</option>
              {destinosTipo.map(d => (
                <option key={d.id} value={String(d.id)}>{d.nome}</option>
              ))}
            </select>
          </label>

          {mustShowPessoa && (
            <label>
              <span className="label">Destino (Pessoa)</span>
              <select className="input" value={createForm.destino_id}
                      onChange={(e) => setCreateForm(f => ({ ...f, destino_id: e.target.value }))} required>
                <option value="">Selecione…</option>
                {(isFunc ? funcionarios : fornecedores).map(p => (
                  <option key={p.id} value={String(p.id)}>{p.nome}</option>
                ))}
              </select>
            </label>
          )}

          <label>
            <span className="label">Classificação (Plano de Contas)</span>
            <select className="input" value={createForm.conta_id}
                    onChange={(e) => setCreateForm(f => ({ ...f, conta_id: e.target.value }))} required>
              <option value="">Selecione…</option>
              {contasPlano.map(c => <option key={c.id} value={String(c.id)}>{c.nome}</option>)}
            </select>
            {contasPlano.length === 0 && (
              <div className="hint" style={{ marginTop: 6 }}>
                Nenhuma conta de saída disponível (conta_direcao_id = 2). Verifique o endpoint /api/contas.
              </div>
            )}
          </label>

          <label>
            <span className="label">Forma de Pagamento (prevista)</span>
            <select className="input" value={createForm.forma_pagamento_id}
                    onChange={(e) => setCreateForm(f => ({ ...f, forma_pagamento_id: e.target.value }))}>
              <option value="">Selecione…</option>
              {formas.map(fp => <option key={fp.id} value={String(fp.id)}>{fp.nome}</option>)}
            </select>
          </label>

          <label>
            <span className="label">Valor</span>
            <input className="input" inputMode="numeric" placeholder="R$ 0,00"
                   value={createForm.valor_reais}
                   onChange={handleValorChange}
                   required />
          </label>

          <label className="form-grid-span">
            <span className="label">Descrição</span>
            <input className="input" value={createForm.descricao}
                   onChange={(e) => setCreateForm(f => ({ ...f, descricao: e.target.value }))}
                   placeholder="Ex.: Energia, salário, serviços…" />
          </label>

          {createError && <div className="field-error">{createError}</div>}

          <div className="modal-footer">
            <button type="button" className="btn" onClick={() => setCreateOpen(false)} disabled={createLoading}>Cancelar</button>
            <button type="submit" className="btn primary" disabled={createLoading}>{createLoading ? "Salvando…" : "Salvar"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
