import React from "react";
import "./dashboard.css";

const API = import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL ?? "/api");

/* ===== Tipos ===== */
type SerieDia = { data: string; entradas_cent: number; saidas_cent: number };
type DistForma = { nome: string; entradas_cent?: number; saidas_cent?: number; total_cent?: number };
type DistConta = { id?: string; nome: string; entradas_cent: number; saidas_cent: number };
type HojePorConta = { id: string; nome: string; entradas_cent: number; saidas_cent: number; net_cent: number };
type DashboardPayload = {
  periodo: { de: string; ate: string };
  saldos: {
    total_centavos: number;
    por_conta: { id: string; nome: string; saldo_atual_centavos: number; ativa: boolean }[];
    alertas: {
      negativos: { id: string; nome: string; saldo_atual_centavos: number }[];
      inativas_com_saldo: { id: string; nome: string; saldo_atual_centavos: number }[];
    };
  };
  hoje: { data: string; entradas_cent: number; saidas_cent: number; net_cent: number };
  serie_diaria: SerieDia[];
  formas_pagamento: DistForma[];
  por_conta_corrente: DistConta[];
  hoje_por_conta?: HojePorConta[];
  saidas_por_fornecedor?: DistForma[];
  saidas_por_funcionario?: DistForma[];
};

/* ===== Utils ===== */
const toLocalISODate = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const todayStr = toLocalISODate(new Date());
const thirtyDaysAgo = toLocalISODate(new Date(Date.now() - 29 * 86400000));
const fmtBRL = (cents: number) =>
  ((cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDateBR = (iso: string) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("pt-BR");
};

/* ===== Hint discreto “?” ===== */
function InfoHint({ text }: { text: string }) {
  return (
    <span className="infohint" tabIndex={0} aria-label="Ajuda" role="button">
      ?
      <span className="infohint-tip" role="tooltip">{text}</span>
    </span>
  );
}

/* ===== Gráfico de linhas (robusto a 1 ponto e trocas rápidas) ===== */
function MiniLines({
  data,
  k1,
  k2,
  h = 180,
}: { data: SerieDia[]; k1: keyof SerieDia; k2: keyof SerieDia; h?: number }) {
  const C_SAIDAS = "#ef4444";
  const C_ENTRAD = "#10B981";
  const GRID = "#E5E7EB";
  const TXT = "#6B7280";
  const M = { top: 16, right: 24, bottom: 28, left: 64 };

  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [wrapW, setWrapW] = React.useState<number>(0);

  React.useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const w = Math.max(
        0,
        r.width - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)
      );
      setWrapW(w);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, []);

  const safe = React.useMemo(
    () => (Array.isArray(data) ? [...data].sort((a, b) => a.data.localeCompare(b.data)) : []),
    [data]
  );

  const n = safe.length;
  const innerW = Math.max(1, Math.floor((wrapW || 0) - M.left - M.right));
  const W = innerW + M.left + M.right;
  const H = h + M.top + M.bottom;

  const maxYVal = Math.max(
    1,
    ...safe.flatMap(d => [Number(d[k1] || 0), Number(d[k2] || 0)])
  );
  const YMAX = maxYVal + Math.ceil(maxYVal * 0.08);

  const stepX = n > 1 ? innerW / Math.max(1, (n - 1)) : innerW; // segura n=1
  const x = (i: number) => M.left + (n > 1 ? i * stepX : innerW / 2);
  const y = (v: number) => M.top + (h - (Math.min(v, YMAX) / YMAX) * h);

  const pts = (k: keyof SerieDia) => safe.map((d, i) => [x(i), y(Number(d[k] || 0))] as const);
  const p1 = pts(k1);
  const p2 = pts(k2);

  function smooth(points: readonly (readonly [number, number])[]) {
    if (!points.length) return "";
    if (points.length === 1) {
      const [px, py] = points[0];
      return `M ${px - 0.0001} ${py} L ${px + 0.0001} ${py}`;
    }
    let d = `M ${points[0][0]} ${points[0][1]}`;
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      const [xm1, ym1] = points[i - 2] ?? [x0, y0];
      const [xp1, yp1] = points[i + 1] ?? [x1, y1];
      const cp1x = x0 + (x1 - xm1) / 6;
      const cp1y = y0 + (y1 - ym1) / 6;
      const cp2x = x1 - (xp1 - x0) / 6;
      const cp2y = y1 - (yp1 - y0) / 6;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x1} ${y1}`;
    }
    return d;
  }

  const tickIdxs = n <= 1 ? [0] : n === 2 ? [0, 1] : [0, Math.floor((n - 1) / 2), n - 1];
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((g) => ({
    y: M.top + g * h,
    val: Math.round((1 - g) * YMAX),
  }));

  const [hover, setHover] = React.useState<{ i: number; px: number } | null>(null);
  function onMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const idx = n > 1 ? Math.max(0, Math.min(n - 1, Math.round(relX / Math.max(stepX, 1)))) : 0;
    setHover({ i: idx, px: x(idx) });
  }

  React.useEffect(() => { setHover(null); }, [data, W, H]);
  React.useEffect(() => { if (n === 1) setHover({ i: 0, px: x(0) }); }, [n, W]);

  return (
    <div ref={wrapRef} className="chart-wrap chart-card" style={{ width: "100%" }}>
      <svg width={W} height={H} className="chart" role="img" aria-label="Fluxo diário de entradas e saídas">
        {yTicks.map((t, i) => (
          <g key={`y-${i}`}>
            <line x1={M.left} x2={W - M.right} y1={t.y} y2={t.y} stroke={GRID} />
            <text x={M.left - 6} y={t.y + 4} textAnchor="end" fontSize="11" fill={TXT}>
              {fmtBRL(t.val)}
            </text>
          </g>
        ))}
        {tickIdxs.map((i, k) => (
          <g key={k} transform={`translate(${x(i)}, ${H - M.bottom + 14})`}>
            <text textAnchor="middle" fontSize="11" fill={TXT}>
              {fmtDateBR(safe[i]?.data || "")}
            </text>
          </g>
        ))}

        <path d={smooth(p1)} fill="none" strokeWidth={2.5} stroke={C_SAIDAS} />
        <path d={smooth(p2)} fill="none" strokeWidth={2.5} stroke={C_ENTRAD} />

        {p1.map(([px, py], i) => <circle key={`s-${i}`} cx={px} cy={py} r={3.5} fill="#fff" stroke={C_SAIDAS} />)}
        {p2.map(([px, py], i) => <circle key={`e-${i}`} cx={px} cy={py} r={3.5} fill="#fff" stroke={C_ENTRAD} />)}

        <rect
          x={M.left}
          y={M.top}
          width={innerW}
          height={h}
          fill="transparent"
          onMouseMove={onMove}
          onMouseEnter={onMove}
          onMouseLeave={() => setHover(n === 1 ? { i: 0, px: x(0) } : null)}
        />
        {hover && n > 0 && (
          <>
            <line x1={hover.px} x2={hover.px} y1={M.top} y2={M.top + h} stroke={GRID} strokeDasharray="4 4" />
            <circle cx={hover.px} cy={p1[hover.i][1]} r={5.5} fill="#fff" stroke={C_SAIDAS} />
            <circle cx={hover.px} cy={p2[hover.i][1]} r={5.5} fill="#fff" stroke={C_ENTRAD} />
          </>
        )}
      </svg>

      {hover && (
        <div
          className="chart-tooltip"
          style={{
            left: Math.min(Math.max(hover.px - 80, M.left), W - M.right - 170),
            top: 10,
          }}
        >
          <div className="t-date">{fmtDateBR(safe[hover.i]?.data || "")}</div>
          <div className="t-row">
            <span className="dot dot-out" />
            <span>Saídas</span>
            <strong>{fmtBRL(Number(safe[hover.i]?.[k1] || 0))}</strong>
          </div>
          <div className="t-row">
            <span className="dot dot-in" />
            <span>Entradas</span>
            <strong>{fmtBRL(Number(safe[hover.i]?.[k2] || 0))}</strong>
          </div>
        </div>
      )}

      {n === 1 && (
        <div className="chart-single-labels">
          <span><span className="dot dot-in" /> Entradas: <strong>{fmtBRL(Number(safe[0]?.[k2] || 0))}</strong></span>
          <span><span className="dot dot-out" /> Saídas: <strong>{fmtBRL(Number(safe[0]?.[k1] || 0))}</strong></span>
        </div>
      )}
    </div>
  );
}

/* ===== Tabela Por Forma de Pagamento (melhor legibilidade) ===== */
function FormaPagamentoTable({ rows }: { rows: DistForma[] }) {
  const enriched = (rows || []).map(r => {
    const entradas = r.entradas_cent || 0;
    const saidas = r.saidas_cent || 0;
    const total = (r.total_cent ?? (entradas + saidas)) || 0;
    const net = entradas - saidas;
    return { nome: r.nome, entradas, saidas, total, net };
  });
  const volumeTotal = enriched.reduce((s, r) => s + r.total, 0);
  const maxLinha = Math.max(0, ...enriched.map(r => r.total));

  return (
    <div className="forma-wrap">
      <table className="forma-table">
        <colgroup>
          <col style={{ width: "36%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "16%" }} />
        </colgroup>
        <thead>
          <tr>
            <th>Forma</th>
            <th className="num">Entradas</th>
            <th className="num">Saídas</th>
            <th className="num">Net</th>
            <th className="num">% do volume</th>
          </tr>
        </thead>
        <tbody>
          {enriched.map((r) => {
            const pct = volumeTotal > 0 ? (r.total / volumeTotal) * 100 : 0;
            const barPct = maxLinha > 0 ? (r.total / maxLinha) * 100 : 0;
            return (
              <tr key={r.nome}>
                <td className="forma-col">
                  <div className="forma-nome">{r.nome}</div>
                  <div className="bar slim"><div className="bar-fill" style={{ width: `${barPct}%` }} /></div>
                </td>
                <td className="num good sep">{fmtBRL(r.entradas)}</td>
                <td className="num bad sep">{fmtBRL(r.saidas)}</td>
                <td className={`num sep ${r.net >= 0 ? "good" : "bad"}`}>{fmtBRL(r.net)}</td>
                <td className="num sep">{pct.toFixed(1)}%</td>
              </tr>
            );
          })}
          {enriched.length === 0 && (
            <tr><td colSpan={5} className="muted">Sem dados.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ===== Barrinha simples ===== */
function BarCell({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="barcell">
      <span className="barcell-label" title={label}>{label}</span>
      <div className="bar"><div className="bar-fill" style={{ width: `${pct}%` }} /></div>
      <span className="barcell-value">{fmtBRL(value)}</span>
    </div>
  );
}

/* ===== Página ===== */
export default function Dashboard() {
  const [periodo, setPeriodo] = React.useState({ de: thirtyDaysAgo, ate: todayStr });
  const [mostrarPeriodo, setMostrarPeriodo] = React.useState(false);
  const [openReports, setOpenReports] = React.useState(false);
  const [data, setData] = React.useState<DashboardPayload | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = React.useState<string>("");

  // fallbacks locais quando o dashboard não traz as distribuições
  const [fbFornecedores, setFbFornecedores] = React.useState<DistForma[]>([]);
  const [fbFuncionarios, setFbFuncionarios] = React.useState<DistForma[]>([]);

  const canApply = Boolean(periodo.de && periodo.ate && periodo.de <= periodo.ate);

  // controle de concorrência das requisições
  const abortRef = React.useRef<AbortController | null>(null);
  const reqIdRef = React.useRef(0);

  function aggregateByNome(rows: any[]) {
    const map = new Map<string, number>();
    for (const r of Array.isArray(rows) ? rows : []) {
      const nome: string = r?.destino_nome || r?.nome || "";
      const v: number = Number(r?.valor_centavos || r?.total_cent || 0);
      if (!nome || !v) continue;
      map.set(nome, (map.get(nome) || 0) + v);
    }
    return Array.from(map.entries()).map(([nome, total_cent]) => ({ nome, total_cent }));
  }

  const load = React.useCallback(async () => {
    const thisReq = ++reqIdRef.current;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      if (periodo.de) qs.set("de", periodo.de);
      if (periodo.ate) qs.set("ate", periodo.ate);

      const r = await fetch(`${API}/dashboard?${qs.toString()}`, {
        headers: { Accept: "application/json" },
        signal: ctrl.signal,
      });
      if (!r.ok) throw new Error((await r.text().catch(() => "")) || `HTTP ${r.status}`);
      const json = (await r.json()) as DashboardPayload;

      let fornList: DistForma[] = json.saidas_por_fornecedor ?? [];
      let funcList: DistForma[] = json.saidas_por_funcionario ?? [];

      if (!fornList?.length || !funcList?.length) {
        const [rf, rfu] = await Promise.all([
          fetch(`${API}/saidas/fornecedores?${qs.toString()}`, { headers: { Accept: "application/json" }, signal: ctrl.signal }).catch(() => null),
          fetch(`${API}/saidas/funcionarios?${qs.toString()}`, { headers: { Accept: "application/json" }, signal: ctrl.signal }).catch(() => null),
        ]);

        if (rf?.ok) fornList = aggregateByNome(await rf.json().catch(() => []));
        if (rfu?.ok) funcList = aggregateByNome(await rfu.json().catch(() => []));
      }

      if (thisReq !== reqIdRef.current) return;

      setData(json);
      setFbFornecedores(fornList || []);
      setFbFuncionarios(funcList || []);
      setUpdatedAt(new Date().toLocaleTimeString("pt-BR"));
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      console.error(e);
      setErr(e?.message || "Falha ao carregar");
    } finally {
      if (thisReq === reqIdRef.current) setLoading(false);
    }
  }, [periodo.de, periodo.ate]);

  React.useEffect(() => { void load(); }, [load]);

  const setHoje = () => { setMostrarPeriodo(false); setPeriodo({ de: todayStr, ate: todayStr }); };
  const set7d = () => { setMostrarPeriodo(false); setPeriodo({ de: toLocalISODate(new Date(Date.now() - 6 * 86400000)), ate: todayStr }); };
  const setMesAtual = () => {
    setMostrarPeriodo(false);
    const d = new Date();
    setPeriodo({ de: toLocalISODate(new Date(d.getFullYear(), d.getMonth(), 1)), ate: toLocalISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0)) });
  };
  const togglePeriodo = () => setMostrarPeriodo(v => !v);

  const netPer = React.useMemo(
    () => (data?.serie_diaria ?? []).reduce((s, r) => s + (r.entradas_cent || 0) - (r.saidas_cent || 0), 0),
    [data]
  );

  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest?.(".reports-dropdown")) setOpenReports(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const normSaida = (r: DistForma) => r.total_cent ?? r.saidas_cent ?? 0;

  const totalEntradasPeriodo = React.useMemo(
    () => (data?.serie_diaria ?? []).reduce((s, r) => s + (r.entradas_cent || 0), 0),
    [data]
  );
  const totalSaidasPeriodo = React.useMemo(
    () => (data?.serie_diaria ?? []).reduce((s, r) => s + (r.saidas_cent || 0), 0),
    [data]
  );

  const topN = 6;
  const baseFornecedores = (data?.saidas_por_fornecedor?.length ? data.saidas_por_fornecedor : fbFornecedores) ?? [];
  const baseFuncionarios = (data?.saidas_por_funcionario?.length ? data.saidas_por_funcionario : fbFuncionarios) ?? [];

  const topFornecedores = React.useMemo(() => {
    const arr = baseFornecedores.slice();
    arr.sort((a, b) => (normSaida(b) - normSaida(a)));
    return arr.slice(0, topN);
  }, [baseFornecedores]);

  const topFuncionarios = React.useMemo(() => {
    const arr = baseFuncionarios.slice();
    arr.sort((a, b) => (normSaida(b) - normSaida(a)));
    return arr.slice(0, topN);
  }, [baseFuncionarios]);

  return (
    <div className="dash">
      {/* Header / Filtros */}
      <section className="card head">
        <div className="head-row">
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            <div className="today-stamp"><span className="dot" /> {fmtDateBR(todayStr)}</div>
            <h1 className="title" style={{ marginTop: 2 }}>Dashboard</h1>
          </div>

          <div className="filters-row">
            <div className="filters">
              <div className="preset">
                <button className="btn soft" onClick={setHoje}>Hoje</button>
                <button className="btn soft" onClick={set7d}>7d</button>
                <button className="btn soft" onClick={setMesAtual}>Mês atual</button>
                <button className={`btn ${mostrarPeriodo ? "primary" : "soft"}`} onClick={togglePeriodo}>Período</button>
              </div>

              {mostrarPeriodo && (
                <div className="period-controls">
                  <label className="filter">
                    <span>De</span>
                    <input className="input" type="date" value={periodo.de}
                      onChange={(e) => setPeriodo((p) => ({ ...p, de: e.target.value }))} />
                  </label>
                  <label className="filter">
                    <span>Até</span>
                    <input className="input" type="date" value={periodo.ate}
                      onChange={(e) => setPeriodo((p) => ({ ...p, ate: e.target.value }))} />
                  </label>
                  <button
                    className="btn primary"
                    disabled={!canApply || loading}
                    onClick={load}
                    aria-disabled={!canApply || loading}
                  >
                    {loading ? "Aplicando…" : "Aplicar"}
                  </button>
                </div>
              )}
            </div>

            {/* Dropdown Relatórios */}
            <div className="reports-dropdown">
              <button
                className="btn btn-ghost"
                onClick={(e) => { e.stopPropagation(); setOpenReports(v => !v); }}
                aria-haspopup="true"
                aria-expanded={openReports}
              >
                Relatórios ▾
              </button>
              {openReports && (
                <div className="dropdown-menu" role="menu">
                  <a className="dropdown-item" href="/dre" role="menuitem">DRE</a>
                  <a className="dropdown-item" href="/balanco" role="menuitem">Balanço</a>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="updated">{loading ? "Carregando…" : updatedAt ? `Atualizado às ${updatedAt}` : ""}</div>
      </section>

      {/* Entradas x Saídas */}
      <section className="grid2">
        <div className="card flow-card flow-in">
          <div className="flow-head">
            <h3>Entradas</h3>
            <div className="flow-head-right">
              <InfoHint text="Entradas de caixa: tudo que aumentou o saldo no período. O valor principal mostra quanto entrou HOJE; abaixo, a média diária e o total do período." />
              <span className="pill pill-in">+</span>
            </div>
          </div>
          <div className="flow-amount green">{fmtBRL(data?.hoje?.entradas_cent ?? 0)}</div>
          <div className="flow-subdate">{fmtDateBR(data?.hoje?.data ?? "")}</div>
          <div className="flow-metrics">
            <div className="metric">
              <span className="metric-label">Média diária</span>
              <span className="metric-val green">
                {fmtBRL(Math.round(((data?.serie_diaria ?? []).reduce((s, r) => s + (r.entradas_cent || 0), 0)) / Math.max(1, (data?.serie_diaria?.length ?? 1))))}
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">Total no período: {fmtDateBR(data?.periodo?.de || "")} – {fmtDateBR(data?.periodo?.ate || "")}</span>
              <span className="metric-val green">
                {fmtBRL((data?.serie_diaria ?? []).reduce((s, r) => s + (r.entradas_cent || 0), 0))}
              </span>
            </div>
          </div>
        </div>

        <div className="card flow-card flow-out">
          <div className="flow-head">
            <h3>Saídas</h3>
            <div className="flow-head-right">
              <InfoHint text="Saídas de caixa: tudo que reduziu o saldo no período. O valor principal mostra quanto saiu HOJE; abaixo, a média diária e o total do período." />
              <span className="pill pill-out">–</span>
            </div>
          </div>
          <div className="flow-amount red">{fmtBRL(data?.hoje?.saidas_cent ?? 0)}</div>
          <div className="flow-subdate">{fmtDateBR(data?.hoje?.data ?? "")}</div>
          <div className="flow-metrics">
            <div className="metric">
              <span className="metric-label">Média diária</span>
              <span className="metric-val red">
                {fmtBRL(Math.round(((data?.serie_diaria ?? []).reduce((s, r) => s + (r.saidas_cent || 0), 0)) / Math.max(1, (data?.serie_diaria?.length ?? 1))))}
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">Total no período: {fmtDateBR(data?.periodo?.de || "")} – {fmtDateBR(data?.periodo?.ate || "")}</span>
              <span className="metric-val red">
                {fmtBRL((data?.serie_diaria ?? []).reduce((s, r) => s + (r.saidas_cent || 0), 0))}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* KPIs resumidos */}
      <section className="kpis">
        <div className="card kpi small">
          <div className="kpi-title-wrap">
            <div className="kpi-title">Saldo Total</div>
            <InfoHint text="Somatório dos saldos das contas correntes (agora)." />
          </div>
          <div className="kpi-value brand">{fmtBRL(data?.saldos?.total_centavos ?? 0)}</div>
        </div>
        <div className="card kpi small">
          <div className="kpi-title-wrap">
            <div className="kpi-title">Net Hoje</div>
            <InfoHint text="Entradas de hoje menos saídas de hoje." />
          </div>
          <div className={`kpi-value ${ (data?.hoje?.net_cent ?? 0) >= 0 ? "good" : "bad"}`}>{fmtBRL(data?.hoje?.net_cent ?? 0)}</div>
        </div>
        <div className="card kpi small">
          <div className="kpi-title-wrap">
            <div className="kpi-title">Net do Período</div>
            <InfoHint text="Entradas totais do período menos as saídas totais do período selecionado." />
          </div>
          <div className={`kpi-value ${netPer >= 0 ? "good" : "bad"}`}>{fmtBRL(netPer)}</div>
          <div className="kpi-sub">{fmtDateBR(data?.periodo?.de || "")} – {fmtDateBR(data?.periodo?.ate || "")}</div>
        </div>
      </section>

      {/* Série diária */}
      <section className="card">
        <div className="section-head">
          <h3>Fluxo diário (Entradas × Saídas)</h3>
          <div className="muted">{fmtDateBR(data?.periodo?.de || "")} – {fmtDateBR(data?.periodo?.ate || "")}</div>
        </div>
        {loading ? <div className="skeleton" /> :
          (data?.serie_diaria?.length ? (
            <MiniLines key={`${periodo.de}-${periodo.ate}`} data={data.serie_diaria} k1="saidas_cent" k2="entradas_cent" />
          ) : <div className="muted">Sem dados no período.</div>)}
      </section>

      {/* Distribuições + Por Conta (saldo/hoje) */}
      <section className="grid2">
        <div className="card">
          <div className="section-head">
            <h3>Por Forma de Pagamento</h3>
            <span className="tag">Entradas / Saídas / Net</span>
            <InfoHint text="Veja entradas, saídas, net e % do volume por forma de pagamento no período." />
          </div>
          <FormaPagamentoTable rows={data?.formas_pagamento ?? []} />
        </div>

        <div className="card">
          <div className="section-head">
            <h3>Por Conta Corrente</h3>
            <span className="tag">Saldo atual + hoje</span>
          </div>

          <div className="account-table-wrap">
            <table className="account-table">
              <thead>
                <tr>
                  <th>Conta</th>
                  <th className="num">Saldo Atual</th>
                  <th className="num">Entradas (hoje)</th>
                  <th className="num">Saídas (hoje)</th>
                  <th className="num">Net (hoje)</th>
                </tr>
              </thead>
              <tbody>
                {(data?.saldos?.por_conta ?? []).map((c) => {
                  const h = (data?.hoje_por_conta ?? []).find(x => x.id === c.id) || null;
                  return (
                    <tr key={c.id}>
                      <td>{c.nome}</td>
                      <td className="num strong">{fmtBRL(c.saldo_atual_centavos)}</td>
                      <td className="num good">{h ? fmtBRL(h.entradas_cent) : "—"}</td>
                      <td className="num bad">{h ? fmtBRL(h.saidas_cent) : "—"}</td>
                      <td className={`num ${h && h.net_cent >= 0 ? "good" : "bad"}`}>{h ? fmtBRL(h.net_cent) : "—"}</td>
                    </tr>
                  );
                })}
                {(!data?.saldos?.por_conta || data.saldos.por_conta.length === 0) && (
                  <tr><td colSpan={5} className="muted">Sem contas correntes ativas.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Visões reduzidas – Saídas por Fornecedor / Funcionário (top 6) */}
      <section className="grid2">
        <div className="card">
          <div className="section-head">
            <h3>Saídas por Fornecedor (top 6)</h3>
            <span className="tag red">Saídas</span>
          </div>
          <div className="grid-list">
            {topFornecedores.map((r, i, arr) => {
              const value = normSaida(r);
              const max = Math.max(0, ...arr.map(a => normSaida(a)));
              return <BarCell key={`${r.nome}-${i}`} label={r.nome} value={value} max={max} />;
            })}
            {topFornecedores.length === 0 && <div className="muted">Sem dados.</div>}
          </div>
          <div className="section-foot">
            <a className="link" href="/financeiro/saidas">Ver todas as saídas</a>
          </div>
        </div>

        <div className="card">
          <div className="section-head">
            <h3>Saídas por Funcionário (top 6)</h3>
            <span className="tag red">Saídas</span>
          </div>
          <div className="grid-list">
            {topFuncionarios.map((r, i, arr) => {
              const value = normSaida(r);
              const max = Math.max(0, ...arr.map(a => normSaida(a)));
              return <BarCell key={`${r.nome}-${i}`} label={r.nome} value={value} max={max} />;
            })}
            {topFuncionarios.length === 0 && <div className="muted">Sem dados.</div>}
          </div>
          <div className="section-foot">
            <a className="link" href="/financeiro/saidas">Ver todas as saídas</a>
          </div>
        </div>
      </section>

      {err && <div className="msg-error">{err}</div>}

      {/* 👇 estilos locais para melhorar a legibilidade da seção Por Forma de Pagamento */}
      <style>{`
        .forma-table{ width:100%; border-collapse:separate; border-spacing:0; }
        .forma-table thead th{ padding:10px 12px; font-weight:600; color:#111827; border-bottom:1px solid #E5E7EB; }
        .forma-table tbody td{ padding:10px 12px; vertical-align:middle; border-bottom:1px solid #F1F5F9; }
        .forma-table .num{ text-align:right; white-space:nowrap; font-variant-numeric: tabular-nums; }
        .forma-table .sep{ border-left:1px solid #EEF2F7; }
        .forma-col .forma-nome{ font-weight:600; color:#111827; margin-bottom:6px; }
        .bar.slim{ height:8px; background:#F3F4F6; border-radius:6px; overflow:hidden; }
        .bar.slim .bar-fill{ height:100%; background:#86efac; }
      `}</style>
    </div>
  );
}
