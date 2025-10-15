// src/pages/movimentacaoCaixa/Index.tsx
import React, { useState } from "react";
import EntradasPage from "./Entradas";
import SaidasPage from "./Saidas";
import TransferenciasPage from "./Transferencias";

type Tab = "entradas" | "saidas" | "transferencias";

export default function MovimentacaoCaixaIndex() {
  const [tab, setTab] = useState<Tab>("entradas");

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Cabeçalho + botões */}
      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Movimentação de Caixa</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={`btn ${tab === "entradas" ? "primary" : ""}`} onClick={() => setTab("entradas")}>
            Entradas
          </button>
          <button className={`btn ${tab === "saidas" ? "primary" : ""}`} onClick={() => setTab("saidas")}>
            Saídas
          </button>
          <button className={`btn ${tab === "transferencias" ? "primary" : ""}`} onClick={() => setTab("transferencias")}>
            Transferências
          </button>
        </div>
      </div>

      {/* Corpo alternável */}
      {tab === "entradas" && <EntradasPage />}
      {tab === "saidas" && <SaidasPage />}
      {tab === "transferencias" && <TransferenciasPage />}

      <style>{`
        .row-click:hover td{ background: rgba(0,0,0,.02); }
        .status-badge{ padding: 2px 8px; border-radius: 999px; font-size: 12px; }
        .status-badge--active{ background:#e7f7ec; color:#166534; }
        .status-badge--inactive{ background:#fee2e2; color:#7f1d1d; }

        .mc-modal-grid{
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap:12px 16px;
        }
        .mc-col-2{ grid-column: 1 / -1; }
        .mc-align-bottom{ align-self:end; }
        .mc-field{ display:flex; flex-direction:column; gap:6px; }
        .mc-label{ font-weight:600; }
        .mc-hint{ color: var(--muted, #6b7280); font-size: 12px; }
        .mc-select-wrap{ position:relative; }
        .mc-select{ appearance:none; padding-right:28px; }
        .mc-chevron{
          position:absolute; right:10px; top:50%;
          transform: translateY(-50%); pointer-events:none; color:#6b7280; font-size:14px;
        }

        @media (max-width: 760px){
          .mc-modal-grid{ grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
