import React from 'react'
import { CrudNewPage } from '../../components/CrudScaffold'
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

export default function New(){
  return <CrudNewPage entity="contasFinanceiras" title="Contas Financeiras" fields={fields} />
}
