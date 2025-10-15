import React, { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

export function Layout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const { pathname } = useLocation()

  // Fecha o menu ao trocar de rota
  useEffect(() => { setOpen(false) }, [pathname])

  // Fecha ao clicar fora / tecla ESC
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!open) return
      const t = e.target as Node
      if (menuRef.current?.contains(t)) return
      if (btnRef.current?.contains(t)) return
      setOpen(false)
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <div>
      <header className="header">
        <div className="header-inner">
          {/* Esquerda – Marca */}
          <Link to="/" className="brand">Fluxo &amp; Caixa</Link>

          {/* Centro – Botões principais */}
          <nav className="nav-center">
            <Link to="/" className="nav-btn">Dashboard</Link>
            <Link to="/movimentacao" className="nav-btn">Movimentação de Caixa</Link>
            <Link to="/contas-a-pagar" className="nav-btn">Contas a Pagar</Link>
            <Link to="/funcionarios" className="nav-btn">Funcionários</Link>
            <Link to="/fornecedores" className="nav-btn">Fornecedores</Link>
            

          </nav>

          {/* Direita – Menu de configuração */}
          <div className="nav-right">
            <button
              className="menu-btn"
              ref={btnRef}
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => setOpen(v => !v)}
            >
              Configuração
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
                <path fill="currentColor" d="M7 10l5 5 5-5z" />
              </svg>
            </button>

            {open && (
              <div ref={menuRef} role="menu" className="dropdown">
                {/* <Link role="menuitem" to="/funcoes">Funções</Link> */}
                <Link role="menuitem" to="/sessoes">Sessões de Caixa</Link>
                <Link role="menuitem" to="/plano-de-contas">Plano de Contas</Link>
                {/* movido para o menu suspenso */}
                <Link role="menuitem" to="/referencias/formas-pagamento">Formas de Pagamento</Link>
                <Link role="menuitem" to="/usuarios">Usuários</Link>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container">
        {children}
      </main>

      {/* <footer className="container footer">
        © {new Date().getFullYear()} – Demo
      </footer> */}
    </div>
  )
}
