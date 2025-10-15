import React, { useState } from "react";
import ContasGerenciais from "./ContasGerenciais";
import ContaCorrente from "./ContaCorrente";

type Aba = "gerenciais" | "corrente";

export default function PlanoDeContasIndex() {
  const [aba, setAba] = useState<Aba>("gerenciais");

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Cabeçalho */}
      <div className="card" style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <h1 style={{ margin: 0 }}>Plano de Contas</h1>
        <div style={{ display:"flex", gap: 8 }}>
          <button
            className={`btn ${aba === "gerenciais" ? "primary" : ""}`}
            onClick={() => setAba("gerenciais")}
          >
            Contas Gerenciais
          </button>
          <button
            className={`btn ${aba === "corrente" ? "primary" : ""}`}
            onClick={() => setAba("corrente")}
          >
            Conta Corrente
          </button>
        </div>
      </div>

      {/* Corpo dinamicamente alternado */}
      {aba === "gerenciais" ? <ContasGerenciais /> : <ContaCorrente />}
    </div>
  );
}
