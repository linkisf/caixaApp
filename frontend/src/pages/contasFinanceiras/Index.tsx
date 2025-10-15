import React from 'react'
import { CrudIndexPage } from '../../components/CrudScaffold'
import type { FieldConfig } from '../../lib/types'

const fields: FieldConfig[] = [
  {
    "name": "banco",
    "label": "Banco"
  },
  {
    "name": "agencia",
    "label": "Agência"
  },
  {
    "name": "numero",
    "label": "Número"
  },
  {
    "name": "tipo",
    "label": "Tipo"
  },
  {
    "name": "apelido",
    "label": "Apelido"
  }
]
const columns = [
  { header: 'Banco', accessor: (row:any)=>row.banco },
  { header: 'Agência', accessor: (row:any)=>row.agencia },
  { header: 'Número', accessor: (row:any)=>row.numero },
  { header: 'Tipo', accessor: (row:any)=>row.tipo },
  { header: 'Apelido', accessor: (row:any)=>row.apelido }
]

export default function Index(){
  return <CrudIndexPage entity="contasFinanceiras" title="Contas Financeiras" fields={fields} columns={columns} />
}
