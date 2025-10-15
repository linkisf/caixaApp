import React from 'react'
import { CrudNewPage } from '../../components/CrudScaffold'
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

export default function New(){
  return <CrudNewPage entity="lancamentos" title="Lançamentos" fields={fields} />
}
