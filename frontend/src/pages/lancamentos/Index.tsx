import React from 'react'
import { CrudIndexPage } from '../../components/CrudScaffold'
import type { FieldConfig } from '../../lib/types'

const fields: FieldConfig[] = [
  {
    "name": "tipo",
    "label": "Tipo",
    "type": "select",
    "options": [
      {
        "value": "ENTRADA",
        "label": "ENTRADA"
      },
      {
        "value": "SAIDA",
        "label": "SAÍDA"
      },
      {
        "value": "TRANSFERENCIA",
        "label": "TRANSFERÊNCIA"
      }
    ]
  },
  {
    "name": "dataHora",
    "label": "Data/Hora",
    "type": "datetime-local"
  },
  {
    "name": "valor",
    "label": "Valor",
    "type": "number"
  },
  {
    "name": "plano",
    "label": "Plano de Contas"
  },
  {
    "name": "meioPagamento",
    "label": "Meio de Pagamento"
  },
  {
    "name": "contraparte",
    "label": "Contraparte"
  },
  {
    "name": "descricao",
    "label": "Descrição"
  }
]
const columns = [
  { header: 'Tipo', accessor: (row:any)=>row.tipo },
  { header: 'Data/Hora', accessor: (row:any)=>row.dataHora },
  { header: 'Valor', accessor: (row:any)=>row.valor },
  { header: 'Plano', accessor: (row:any)=>row.plano },
  { header: 'Meio', accessor: (row:any)=>row.meioPagamento },
  { header: 'Contraparte', accessor: (row:any)=>row.contraparte }
]

export default function Index(){
  return <CrudIndexPage entity="lancamentos" title="Lançamentos" fields={fields} columns={columns} />
}
