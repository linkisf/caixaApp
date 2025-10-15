import React from 'react'
import Modal from './Modal'

export default function Confirm({ open, title='Confirmar', description, onCancel, onConfirm } : {
  open:boolean, title?:string, description:string, onCancel:()=>void, onConfirm:()=>void
}){
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <p style={{color:'var(--muted)'}}>{description}</p>
      <div className='modal-footer'>
        <button className='btn' onClick={onCancel}>Cancelar</button>
        <button className='btn primary' onClick={onConfirm}>Confirmar</button>
      </div>
    </Modal>
  )
}
