import React from 'react'

export type Column<T> = { header: string, accessor: (row:T)=>React.ReactNode, width?: string }
export default function Table<T>({ columns, data, onRowClick } : { columns: Column<T>[], data: T[], onRowClick?:(row:T)=>void }){
  return (
    <table className='table'>
      <thead>
        <tr className='tr'>
          {columns.map((c,i)=>(<th className='th' key={i} style={{textAlign:'left', width:c.width}}>{c.header}</th>))}
        </tr>
      </thead>
      <tbody>
        {data.map((row:any, i)=>(
          <tr className='tr' key={row.id || i} onClick={()=>onRowClick?.(row)}>
            {columns.map((c,ci)=>(<td className='td' key={ci}>{c.accessor(row)}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
