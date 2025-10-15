import React, { useEffect, useState } from "react";
import Modal from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";

type Funcao = {
  id: string;
  nome: string;
  descricao?: string | null;
};

const API = import.meta.env.DEV ? '/api' : (import.meta.env.VITE_API_BASE_URL ?? '/api');


export default function FuncoesIndex() {
  const [items, setItems] = useState<Funcao[]>([]);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Partial<Funcao> | null>(null);
  const [toDelete, setToDelete] = useState<Funcao | null>(null);
  const [errorNome, setErrorNome] = useState<string | null>(null);
  const [dupTries, setDupTries] = useState(0);
  


  const load = async () => {
    try {
        const res = await fetch(`${API}/funcoes`, { headers: { Accept: 'application/json' } });
        if (!res.ok) {
        // loga o erro do servidor e mantém items como []
        const text = await res.text().catch(() => '');
        console.error('Falha ao carregar /funcoes:', res.status, text);
        setItems([]);
        return;
        }
        // tenta ler json e garantir array
        const data = await res.json().catch(() => []);
        setItems(Array.isArray(data) ? data : []);
    } catch (err) {
        console.error('Network/parse error em /funcoes:', err);
        setItems([]);
    }
};

  useEffect(() => { load(); }, []);

  async function saveFuncao(e: React.FormEvent) {
    e.preventDefault(); 
    if (!current) return;
    const method = current.id ? "PUT" : "POST";
    const url = current.id ? `${API}/funcoes/${current.id}` : `${API}/funcoes`;
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(current),
    });
    if (res.status === 409) {
      const n = current?.nome ?? '';
      const tries = dupTries + 1;
      setErrorNome(getDuplicateNameMessage(tries, n));
      setDupTries(tries);
      return;
    }
    if (!res.ok) return alert(await res.text());
    setOpen(false);
    setCurrent(null);
    await load();
  }

  function getDuplicateNameMessage(tries: number, name: string) {
    const n = (name ?? '').trim();
    if (tries <= 1) {
      return `Já existe uma função chamada “${n}”. Escolha outro nome.`;
    }
    if (tries === 2) {
      return `“${n}” continua em uso. Dica: diferencie com um sufixo (ex.: “${n} - Manhã” ou “${n} (2)”).`;
    }
    return `Ainda não foi possível salvar com “${n}”. Tente um nome único (ex.: “${n} - Setor X” ou um código interno).`;
  }


  async function deleteFuncao(id: string) {
    try {
      const res = await fetch(`${API}/funcoes/${id}`, { method: "DELETE", headers: { Accept: "application/json" } });

      if (res.status === 204) { await load(); return; }
      if (res.status === 409) {
        const data = await res.json().catch(() => null);
        alert(data?.error || "Não é possível excluir: função está associada a funcionário(s).");
        return;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("DELETE /funcoes erro", res.status, text);
        alert(`Erro ao excluir (${res.status}): ${text || "Falha desconhecida"}`);
        return;
      }
      await load();
    } catch (err) {
      console.error("Erro de rede ao excluir função:", err);
      alert("Falha de rede ao excluir. Verifique a conexão/servidor.");
    }
  }


  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Funções</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={load}>Atualizar</button>
          <button className="btn primary" onClick={() => { setCurrent({}); setOpen(true); }}>
            + Adicionar
          </button>
        </div>
      </div>

      <div className="card">
        <table className="table">     
          <colgroup><col style={{width:'40%'}}/><col style={{width:'40%'}}/><col style={{width:'20%'}}/></colgroup>

          <thead>
            <tr>
              <th>Nome</th>
              <th>Descrição</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((f) => (
              <tr key={f.id}>
                <td>{f.nome}</td>
                <td>{f.descricao || "-"}</td>
                <td className="cell-actions">
                  <button type="button" className="btn" onClick={() => { setCurrent(f); setOpen(true); }}>Editar</button>
                  <button type="button" className="btn" onClick={() => setToDelete(f)}>Excluir</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={3} className="empty">Nenhuma função cadastrada.</td>
              </tr>
            )}
          </tbody>
        </table>

      </div>

      {/* <Modal
        open={open}
        title={current?.id ? "Editar Função" : "Nova Função"}
        onClose={() => { setOpen(false); setCurrent(null); }}
        size="md"
      >
        <form className="form-grid" onSubmit={saveFuncao}>
          <label>
            <span className="label">Nome</span>
            <input
              className="input"
              value={current?.nome || ""}
              onChange={(e) => setCurrent({ ...current, nome: e.target.value })}
              required
            />
          </label>
          <label>
            <span className="label">Descrição</span>
            <input
              className="input"
              value={current?.descricao || ""}
              onChange={(e) => setCurrent({ ...current, descricao: e.target.value })}
            />
          </label>
          <div className="modal-footer" style={{ gridColumn: "1 / -1" }}>
            <button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="btn primary">Salvar</button>
          </div>
        </form>
      </Modal> */}

      <Modal
        open={open}
        title={current?.id ? "Editar Função" : "Nova Função"}
        onClose={() => { setOpen(false); setCurrent(null); }}
        size="md"
      >
        <form className="form-grid" onSubmit={saveFuncao}>
          <label>
            <span className="label">Nome</span>
            <input
              className="input"
              value={current?.nome || ""}
              onChange={(e) => {
                const nome = e.target.value;
                setCurrent({ ...current, nome });
                setErrorNome(null);      // limpa a msg ao alterar
                setDupTries(0);          // zera contador
              }}
              aria-invalid={!!errorNome}
              required
            />
            {errorNome && <p className="field-error">{errorNome}</p>}
          </label>

          <label>
            <span className="label">Descrição</span>
            <input
              className="input"
              value={current?.descricao || ""}
              onChange={(e) => setCurrent({ ...current, descricao: e.target.value })}
            />
          </label>

          <div className="modal-footer" style={{ gridColumn: "1 / -1" }}>
            <button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="btn primary">Salvar</button>
          </div>
        </form>
      </Modal>

      
      <Modal
        open={!!toDelete}
        title={toDelete ? `Excluir "${toDelete.nome}"?` : "Excluir"}
        onClose={() => setToDelete(null)}
        size="sm"
      >
        <p>Essa ação não pode ser desfeita.</p>
        <div className="modal-footer" style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button type="button" className="btn" onClick={() => setToDelete(null)}>Cancelar</button>
          <button
            className="btn danger"
            onClick={async () => {
              if (!toDelete) return;
              await deleteFuncao(toDelete.id); // <- sem confirm aqui
              setToDelete(null);
            }}
          >
            Excluir
          </button>
        </div>
      </Modal>


    </div>
  );
}
