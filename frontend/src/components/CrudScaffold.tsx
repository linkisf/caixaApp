import React, { useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Modal from './Modal'
import Confirm from './Confirm'
import Table, { Column } from './Table'
import type { FieldConfig } from '../lib/types'
import { listItems, createItem, updateItem, deleteItem } from '../lib/crudService'

function FieldInput({ cfg, value, onChange } : { cfg: FieldConfig, value:any, onChange:(v:any)=>void }){
  if (cfg.type === 'select'){
    return (
      <label>
        <span className='label'>{cfg.label}</span>
        <select className='input' value={value ?? ''} onChange={e=>onChange(e.target.value)} required={cfg.required}>
          <option value='' disabled>Selecione…</option>
          {cfg.options?.map(opt=>(<option key={opt.value} value={opt.value}>{opt.label}</option>))}
        </select>
      </label>
    )
  }
  if (cfg.type === 'checkbox'){
    return (
      <label>
        <span className='label'>{cfg.label}</span>
        <input type='checkbox' checked={!!value} onChange={e=>onChange(e.target.checked)} />
      </label>
    )
  }
  return (
    <label>
      <span className='label'>{cfg.label}</span>
      <input className='input' type={cfg.type || 'text'} placeholder={cfg.placeholder} value={value ?? ''} required={cfg.required} onChange={e=>onChange(e.target.value)} />
    </label>
  )
}

export function CrudNewPage({ entity, title, fields } : { entity:string, title:string, fields: FieldConfig[] }){
  const navigate = useNavigate()
  const initial = useMemo(()=>Object.fromEntries(fields.map(f=>[f.name, f.default ?? (f.type==='checkbox'? false : '')])), [fields])
  const [form, setForm] = useState<any>(initial)

  function submit(e: React.FormEvent){
    e.preventDefault()
    createItem(entity, form)
    navigate('..')
  }

  return (
    <div className='grid' style={{gap:16}}>
      <div className='card'>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <h1 style={{margin:0}}>{title} – Inserir</h1>
          <Link to='..' className='btn'>Voltar</Link>
        </div>
        <form onSubmit={submit} className='grid form-grid cols-3' style={{marginTop:12}}>
          {fields.map(f=>(
            <FieldInput key={f.name} cfg={f} value={form[f.name]} onChange={(v)=>setForm({...form, [f.name]: v})} />
          ))}
          <div style={{gridColumn:'1 / -1', display:'flex', justifyContent:'flex-end', gap:8, marginTop:8}}>
            <button type='button' className='btn' onClick={()=>setForm(initial)}>Limpar</button>
            <button className='btn primary' type='submit'>Salvar</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function CrudIndexPage({ entity, title, fields, columns } : {
  entity:string, title:string, fields: FieldConfig[], columns: Column<any>[]
}){
  const [items, setItems] = useState<any[]>(listItems(entity))
  const [editing, setEditing] = useState<any|null>(null) // item
  const [confirm, setConfirm] = useState<any|null>(null) // item

  function refresh(){ setItems(listItems(entity)) }

  function onEditSave(){
    if (!editing) return
    updateItem(entity, editing.id, editing)
    setEditing(null); refresh()
  }

  function onDeleteConfirm(){
    if (!confirm) return
    deleteItem(entity, confirm.id); setConfirm(null); refresh()
  }

  return (
    <div className='grid' style={{gap:16}}>
      <div className='card'>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <h1 style={{margin:0}}>{title}</h1>
          <Link to='new' className='btn primary'>+ Inserir</Link>
        </div>
      </div>
      <div className='card'>
        <Table columns={[
          ...columns,
          { header:'Ações', accessor:(row:any)=> (
            <div className='row-actions'>
              <button className='btn' onClick={()=>setEditing(row)}>Editar</button>
              <button className='btn' onClick={()=>setConfirm(row)}>Excluir</button>
            </div>
          ), width:'180px'}
        ]} data={items} />
      </div>

      <Modal open={!!editing} title={`Editar – ${title}`} onClose={()=>setEditing(null)}>
        {editing && (
          <form onSubmit={(e)=>{e.preventDefault(); onEditSave()}} className='grid form-grid cols-3'>
            {fields.map(f=>(
              <FieldInput key={f.name} cfg={f} value={editing[f.name]} onChange={(v)=>setEditing({...editing, [f.name]: v})} />
            ))}
            <div style={{gridColumn:'1 / -1', display:'flex', justifyContent:'flex-end', gap:8, marginTop:8}}>
              <button type='button' className='btn' onClick={()=>setEditing(null)}>Cancelar</button>
              <button className='btn primary' type='submit'>Salvar</button>
            </div>
          </form>
        )}
      </Modal>

      <Confirm open={!!confirm} title='Excluir registro' description='Tem certeza que deseja excluir este item?' onCancel={()=>setConfirm(null)} onConfirm={onDeleteConfirm} />
    </div>
  )
}
