export type Item = { id: string } & Record<string, any>

function keyFor(entity: string){ return `crud:${entity}` }

export function listItems(entity: string): Item[] {
  const raw = localStorage.getItem(keyFor(entity))
  return raw ? JSON.parse(raw) : []
}

export function createItem(entity: string, data: Record<string, any>): Item {
  const items = listItems(entity)
  const item = { id: crypto.randomUUID(), ...data }
  items.unshift(item)
  localStorage.setItem(keyFor(entity), JSON.stringify(items))
  return item
}

export function deleteItem(entity: string, id: string): boolean {
  const items = listItems(entity)
  const next = items.filter(i => i.id !== id)
  localStorage.setItem(keyFor(entity), JSON.stringify(next))
  return next.length !== items.length
}
