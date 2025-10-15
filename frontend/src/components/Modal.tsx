import React, { useEffect } from 'react'

type ModalProps = {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  /** largura máx.: 'sm' | 'md' | 'lg' */
  size?: 'sm' | 'md' | 'lg'
}

export default function Modal({ open, title, onClose, children, size = 'md' }: ModalProps){
  // Fecha com ESC
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent){ if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const maxW = { sm: 440, md: 720, lg: 960 }[size]

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onMouseDown={(e) => {
        // clique fora fecha
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="modal-panel"
        style={{ maxWidth: maxW }}
      >
        <div className="modal-header">
          <h3 id="modal-title" className="modal-title">{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar modal">✕</button>
        </div>

        <div className="modal-body">
          {children}
        </div>

        {/* Exemplo opcional de footer padrão:
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary">Salvar</button>
        </div>
        */}
      </div>
    </div>
  )
}
