export type FieldOption = { value:string, label:string }
export type FieldConfig = {
  name: string
  label: string
  type?: 'text'|'number'|'date'|'datetime-local'|'select'|'checkbox'
  placeholder?: string
  required?: boolean
  options?: FieldOption[]
  default?: any
}
