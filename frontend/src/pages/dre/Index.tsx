// src/pages/relatorios/DREBalanco.tsx
// Tela unificada e revisada para DRE e Balanço
// - Corrige sobreposição do cabeçalho/colunas fixas durante a rolagem
// - Habilita rolagem horizontal com a roda do mouse
// - Mantém UX mais inteligível para leigos e sem libs externas

import React from "react";
import "./dre.css";

const API = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL ?? "/api");

type LinhasDRE = {
  classificacao: string;
  classificacao_ordem: number;
  jan: number; fev: number; mar: number; abr: number; mai: number; jun: number;
  jul: number; ago: number; set: number; out: number; nov: number; dez: number;
  total: number;
};
type DREPayload = { ano: number; linhas: LinhasDRE[] };

type GrupoBalanco = { grupo: string; total_cent: number };
type ContaBalanco = { conta_id: string; tipo_conta_nome: string; conta_nome: string; saldo_cent: number };
type BalancoPayload = { data: string; grupos: GrupoBalanco[]; contas: ContaBalanco[] };

const fmtBRL = (cent: number) =>
  ((cent || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ====== Colunas por modo ======
type ViewMode = "mensal" | "trimestral" | "anual";
const MONTH_KEYS: (keyof LinhasDRE)[] = [
  "jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"
];

// Ajudantes
const toLocalISODate = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function DREBalancoPage() {
  const [tab, setTab] = React.useState<"dre" | "balanco">("dre");
  const [view, setView] = React.useState<ViewMode>("mensal");

  // ===== DRE =====
  const [ano, setAno] = React.useState<number>(new Date().getFullYear());
  const [dre, setDre] = React.useState<DREPayload | null>(null);
  const [loadingDre, setLoadingDre] = React.useState(false);
  const [errDre, setErrDre] = React.useState<string | null>(null);

  // KPIs DRE (para leigos)
  const KPI_LABELS = {
    receita_liquida: "Receita Líquida",
    custos: "Custos",
    despesas_op: "Despesas Operacionais",
    resultado_fin: "Resultado Financeiro",
    lucro_liquido: "Lucro Líquido",
  } as const;

  // ===== Balanço =====
  const [dataBalanco, setDataBalanco] = React.useState<string>(toLocalISODate(new Date(ano, 11, 31))); // 31/12/<ano>
  const [balanco, setBalanco] = React.useState<BalancoPayload | null>(null);
  const [loadingBal, setLoadingBal] = React.useState(false);
  const [errBal, setErrBal] = React.useState<string | null>(null);
  const [debugBal, setDebugBal] = React.useState<string | null>(null); // exibe corpo do erro 500, se houver

  // ========= LOADERS =========
  const loadDRE = async () => {
    setLoadingDre(true);
    setErrDre(null);
    try {
      const r = await fetch(`${API}/relatorios/dre?ano=${encodeURIComponent(String(ano))}`, {
        headers: { Accept: "application/json" },
      });
      if (!r.ok) throw new Error((await r.text().catch(() => "")) || `HTTP ${r.status}`);
      const payload: DREPayload = await r.json();
      setDre(payload);
    } catch (e: any) {
      setErrDre(e?.message || "Falha ao carregar DRE");
    } finally {
      setLoadingDre(false);
    }
  };

  const loadBalanco = async () => {
    setLoadingBal(true);
    setErrBal(null);
    setDebugBal(null);
    try {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataBalanco)) {
        throw new Error("Data inválida. Use o formato AAAA-MM-DD.");
      }
      const url = `${API}/relatorios/balanco?data=${encodeURIComponent(dataBalanco)}`;
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        setDebugBal(`Status: ${r.status}\n${body || "(sem detalhes no corpo da resposta)"}`);
        throw new Error(body || `HTTP ${r.status}`);
      }
      const payload: BalancoPayload = await r.json();
      setBalanco(payload);
    } catch (e: any) {
      setErrBal(e?.message || "Falha ao carregar Balanço");
    } finally {
      setLoadingBal(false);
    }
  };

  // Atualiza DRE ao trocar o ano
  React.useEffect(() => { void loadDRE(); }, [ano]);

  // Atualiza data padrão do Balanço quando ano muda (31/12/<ano>)
  React.useEffect(() => {
    setDataBalanco(toLocalISODate(new Date(ano, 11, 31)));
  }, [ano]);

  // Quando trocar para a aba Balanço, carrega (ou recarrega)
  React.useEffect(() => {
    if (tab === "balanco") { void loadBalanco(); }
  }, [tab, dataBalanco]);

  // ========= TRANSFORMAÇÕES DRE =========
  type AnyRow = Record<string, number | string>;

  const toMensal = (rows: LinhasDRE[]): AnyRow[] =>
    rows
      .slice()
      .sort((a, b) => a.classificacao_ordem - b.classificacao_ordem)
      .map((r) => ({
        classificacao: r.classificacao,
        ...MONTH_KEYS.reduce((acc, k) => {
          acc[k] = r[k];
          return acc;
        }, {} as Record<string, number>),
        total: r.total,
      }));

  const toTrimestral = (rows: LinhasDRE[]): AnyRow[] => {
    const q = (r: LinhasDRE, list: (keyof LinhasDRE)[]) =>
      list.reduce((s, k) => s + (r[k] || 0), 0);
    return rows
      .slice()
      .sort((a, b) => a.classificacao_ordem - b.classificacao_ordem)
      .map((r) => ({
        classificacao: r.classificacao,
        q1: q(r, ["jan", "fev", "mar"]),
        q2: q(r, ["abr", "mai", "jun"]),
        q3: q(r, ["jul", "ago", "set"]),
        q4: q(r, ["out", "nov", "dez"]),
        total: r.total,
      }));
  };

  const toAnual = (rows: LinhasDRE[]): AnyRow[] =>
    rows
      .slice()
      .sort((a, b) => a.classificacao_ordem - b.classificacao_ordem)
      .map((r) => ({ classificacao: r.classificacao, total: r.total }));

  const tableRows: AnyRow[] = React.useMemo(() => {
    if (!dre?.linhas) return [];
    if (view === "mensal") return toMensal(dre.linhas);
    if (view === "trimestral") return toTrimestral(dre.linhas);
    return toAnual(dre.linhas);
  }, [dre, view]);

  const headers: string[] = React.useMemo(() => {
    if (view === "mensal")
      return ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ", "TOTAL"];
    if (view === "trimestral") return ["Q1", "Q2", "Q3", "Q4", "TOTAL"];
    return ["TOTAL"];
  }, [view]);

  const keys: string[] = React.useMemo(() => {
    if (view === "mensal") return [...MONTH_KEYS.map((k) => String(k)), "total"];
    if (view === "trimestral") return ["q1", "q2", "q3", "q4", "total"];
    return ["total"];
  }, [view]);

  const totalCol = (key: string) =>
    tableRows.reduce((s: number, r: AnyRow) => s + Number(r[key] || 0), 0);

  const isHighlight = (label: string) =>
    [
      "Receita Operacional Líquida",
      "Lucro (Prejuízo) Bruto",
      "Lucro (Prejuízo) Operacional",
      "Lucro (Prejuízo) Líquido",
    ].some((t) => t.toLowerCase() === label.toLowerCase());

  // KPIs (pega por label exata, case-insensitive)
  const findTot = (name: string) =>
    dre?.linhas?.find((l) => l.classificacao.toLowerCase() === name.toLowerCase())?.total ?? 0;

  const KPI_VALUES = {
    receita_liquida: findTot("Receita Operacional Líquida"),
    custos: findTot("Custos"),
    despesas_op: findTot("Despesas Operacionais"),
    resultado_fin: findTot("Resultado Financeiro"),
    lucro_liquido: findTot("Lucro (Prejuízo) Líquido"),
  };

  // ========= TRANSFORMAÇÕES BALANÇO =========
  const gruposMap = React.useMemo(() => {
    if (!balanco?.grupos) return { ATIVO: 0, PASSIVO: 0, PL: 0, OUTROS: 0 };
    const acc = { ATIVO: 0, PASSIVO: 0, PL: 0, OUTROS: 0 } as Record<string, number>;
    for (const g of balanco.grupos) {
      const key = (g.grupo || "OUTROS").toUpperCase();
      acc[key] = (acc[key] || 0) + (g.total_cent || 0);
    }
    return acc;
  }, [balanco]);

  const eqAtende = React.useMemo(() => {
    // Checagem simples: ATIVO ≈ PASSIVO + PL (tolerância 1 cent)
    const ativo = gruposMap.ATIVO || 0;
    const passivoMaisPL = (gruposMap.PASSIVO || 0) + (gruposMap.PL || 0);
    return Math.abs(ativo - passivoMaisPL) <= 1;
  }, [gruposMap]);

  // ===== Scroll horizontal com a roda do mouse =====
  const tableScrollRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Se Shift estiver pressionado, o navegador já desloca horizontal; não interceptar
      if (e.shiftKey) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    // precise para conseguir preventDefault
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel as any);
  }, [tab, view]);

  // ======= UI =======
  return (
    <div className="dre-screen">
      <header className="dre-head dre-head--grid">
        <div className="dre-head__title">
          <h1>Relatórios • DRE &amp; Balanço</h1>
          <p className="dre-head__desc muted">
            Esta tela mostra o resultado do período (DRE) e a posição patrimonial (Balanço).
            Use os botões para alternar e os filtros para ajustar o período analisado.
          </p>
        </div>

        <div className="dre-head__tabs">
          <div className="dre-tabs" role="tablist" aria-label="Relatórios">
            <button
              className={`tab ${tab === "dre" ? "active" : ""}`}
              onClick={() => setTab("dre")}
              aria-selected={tab === "dre"}
              role="tab"
            >
              DRE (Resultado)
            </button>
            <button
              className={`tab ${tab === "balanco" ? "active" : ""}`}
              onClick={() => setTab("balanco")}
              aria-selected={tab === "balanco"}
              role="tab"
            >
              Balanço (Patrimônio)
            </button>
          </div>
        </div>
      </header>

      {/* ============ DRE ============ */}
      {tab === "dre" && (
        <section className="dre-card">
          {/* Resumo amigável */}
          <div className="info-banner">
            <strong>Como ler:</strong> Receita Líquida é o que entrou menos impostos/devoluções. Custos e Despesas Operacionais
            são gastos da operação. Resultado Financeiro mostra juros/encargos e ganhos financeiros. O Lucro Líquido é o saldo final.
          </div>

          {/* KPIs anuais */}
          <div className="kpi-grid">
            <div className="kpi"><span>{KPI_LABELS.receita_liquida}</span><strong>{fmtBRL(KPI_VALUES.receita_liquida)}</strong></div>
            <div className="kpi"><span>{KPI_LABELS.custos}</span><strong>{fmtBRL(KPI_VALUES.custos)}</strong></div>
            <div className="kpi"><span>{KPI_LABELS.despesas_op}</span><strong>{fmtBRL(KPI_VALUES.despesas_op)}</strong></div>
            <div className="kpi"><span>{KPI_LABELS.resultado_fin}</span><strong>{fmtBRL(KPI_VALUES.resultado_fin)}</strong></div>
            <div className="kpi hi"><span>{KPI_LABELS.lucro_liquido}</span><strong>{fmtBRL(KPI_VALUES.lucro_liquido)}</strong></div>
          </div>

          <div className="dre-controls">
            <div className="view-toggle" role="group" aria-label="Modo de exibição">
              <button className={`chip ${view === "mensal" ? "active" : ""}`} onClick={() => setView("mensal")} aria-pressed={view === "mensal"}>Mensal</button>
              <button className={`chip ${view === "trimestral" ? "active" : ""}`} onClick={() => setView("trimestral")} aria-pressed={view === "trimestral"}>Trimestral</button>
              <button className={`chip ${view === "anual" ? "active" : ""}`} onClick={() => setView("anual")} aria-pressed={view === "anual"}>Anual</button>
            </div>
            <div className="grow" />
            <label>
              Ano
              <input
                type="number"
                className="input"
                value={ano}
                min={2000}
                max={2100}
                onChange={(e) => setAno(Number(e.target.value || new Date().getFullYear()))}
              />
            </label>
            <button className="btn" onClick={loadDRE}>Atualizar</button>
          </div>

          {loadingDre ? (
            <div className="skeleton" />
          ) : errDre ? (
            <div className="msg-error">{errDre}</div>
          ) : tableRows.length ? (
            <div className="table-card">
              <div
                ref={tableScrollRef}
                className="table-scroll"
                role="region"
                aria-label="Tabela DRE (rolagem horizontal habilitada)"
                aria-live="polite"
              >
                <table className="table-report">
                  <thead>
                    <tr>
                      <th className="sticky-left zhead th-left">Classificação</th>
                      {headers.map((h, i) => (
                        <th
                          key={h}
                          className={`zhead ${i === headers.length - 1 ? "sticky-right th-right" : ""}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row, idx) => {
                      const label = String(row.classificacao || "—");
                      const highlight = isHighlight(label);
                      return (
                        <tr key={idx} className={highlight ? "hi" : ""}>
                          <td className="sticky-left td-left">{label}</td>
                          {keys.map((k, i) => (
                            <td key={`${idx}-${k}`} className={i === keys.length - 1 ? "sticky-right td-right tar" : "tar"}>
                              {fmtBRL(Number(row[k] || 0))}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="tfoot">
                      <td className="sticky-left td-left"><strong>Total</strong></td>
                      {keys.map((k, i) => (
                        <td key={`t-${k}`} className={i === keys.length - 1 ? "sticky-right td-right tar" : "tar"}>
                          <strong>{fmtBRL(totalCol(k))}</strong>
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="hint">
                Dica: você pode usar a <strong>roda do mouse</strong> para rolar a tabela na horizontal.
              </div>
            </div>
          ) : (
            <div className="muted">Sem dados para o ano {ano}.</div>
          )}
        </section>
      )}

      {/* ============ BALANÇO ============ */}
      {tab === "balanco" && (
        <section className="dre-card">
          <div className="info-banner">
            <strong>Como ler:</strong> O Balanço mostra o que a empresa tem (Ativo) e como isso é financiado
            (Passivo e Patrimônio Líquido). A equação deve fechar: <em>Ativo = Passivo + PL</em>.
          </div>

          <div className="dre-controls">
            <label>
              Data de referência
              <input
                type="date"
                className="input"
                value={dataBalanco}
                onChange={(e) => setDataBalanco(e.target.value)}
              />
            </label>
            <button className="btn" onClick={loadBalanco}>Atualizar</button>
          </div>

          {loadingBal ? (
            <div className="skeleton" />
          ) : errBal ? (
            <div className="msg-error">
              {errBal}
              {debugBal && (
                <pre className="debug-box" aria-label="Detalhes do erro">
                  {debugBal}
                </pre>
              )}
              <div className="muted" style={{ marginTop: 8 }}>
                Dica: verifique se as views/funções <code>vw_dre_mensal</code>, <code>fn_balanco</code> e dependências existem, e se a data está no formato AAAA-MM-DD.
              </div>
            </div>
          ) : balanco ? (
            <>
              {/* KPIs do balanço */}
              <div className="kpi-grid">
                <div className="kpi"><span>Ativo</span><strong>{fmtBRL(gruposMap.ATIVO || 0)}</strong></div>
                <div className="kpi"><span>Passivo</span><strong>{fmtBRL(gruposMap.PASSIVO || 0)}</strong></div>
                <div className="kpi"><span>Patrimônio Líquido</span><strong>{fmtBRL(gruposMap.PL || 0)}</strong></div>
                <div className={`kpi ${eqAtende ? "ok" : "warn"}`}>
                  <span>Equação Contábil</span>
                  <strong>{eqAtende ? "Ativo = Passivo + PL" : "⚠ Não fechado"}</strong>
                </div>
              </div>

              {/* Listas: Grupos e Contas */}
              <div className="grid2">
                <div className="card">
                  <h3>Grupos</h3>
                  <ul className="list">
                    {["ATIVO", "PASSIVO", "PL"].map((g) => (
                      <li key={g}><span>{g}</span><strong>{fmtBRL(gruposMap[g] || 0)}</strong></li>
                    ))}
                  </ul>
                  <div className="hint">Ativo: bens e direitos • Passivo: obrigações • PL: capital e resultados acumulados.</div>
                </div>

                <div className="card">
                  <h3>Contas (detalhe)</h3>
                  <div className="list scroll">
                    {balanco.contas?.length ? (
                      balanco.contas.map((c) => (
                        <div className="row" key={c.conta_id}>
                          <div className="row-col">
                            <div className="muted small">{c.tipo_conta_nome}</div>
                            <div>{c.conta_nome}</div>
                          </div>
                          <div className="row-val">{fmtBRL(c.saldo_cent)}</div>
                        </div>
                      ))
                    ) : (
                      <div className="muted">Sem contas na data informada.</div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="muted">Sem dados.</div>
          )}
        </section>
      )}

      {/* CSS mínimo para garantir sticky/header correto e sem sobreposição */}
      <style>{`
        .table-card { display: grid; gap: 8px; }
        .table-scroll {
          overflow: auto;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          background: #fff;
        }
        .table-report {
          border-collapse: separate;
          border-spacing: 0;
          min-width: 720px; /* força rolagem em telas estreitas */
          width: 100%;
        }
        .table-report th, .table-report td {
          padding: 10px 12px;
          border-bottom: 1px solid #f1f5f9;
          white-space: nowrap; /* evita quebra/colisão de cabeçalho ao rolar */
          background: #fff;    /* essencial para não “vazar” texto sob colunas sticky */
        }
        .table-report thead th {
          position: sticky;
          top: 0;
          z-index: 4;               /* acima das células */
          background: #f8fafc;      /* fundo do cabeçalho */
        }
        .zhead { font-weight: 600; color: #1f2937; }
        .sticky-left { position: sticky; left: 0; z-index: 5; }
        .sticky-right { position: sticky; right: 0; z-index: 5; }
        .th-left { background: #f8fafc; box-shadow: inset -1px 0 0 #e5e7eb; }
        .th-right { background: #f8fafc; box-shadow: inset 1px 0 0 #e5e7eb; }
        .td-left { background: #fff; box-shadow: inset -1px 0 0 #f1f5f9; }
        .td-right { background: #fff; box-shadow: inset 1px 0 0 #f1f5f9; }
        .tar { text-align: right; }
        .tfoot td { font-weight: 700; background: #fafafa; }
        .hi td, .hi .sticky-left { background: #fffbeb; }
        /* melhora foco a11y na região rolável */
        .table-scroll:focus-within { outline: 2px solid #93c5fd; outline-offset: 2px; }
      `}</style>
    </div>
  );
}
