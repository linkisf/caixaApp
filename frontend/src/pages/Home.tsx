import React from 'react'
export default function Home(){
  return (
    <div className='grid grid-3'>
      <div className='card'><h3 style={{marginTop:0}}>Bem-vindo</h3><p>Use o menu para navegar entre os módulos do sistema de caixa.</p></div>
      <div className='card'><h4 style={{marginTop:0}}>Atalhos</h4><ul><li>Lançamentos</li><li>Parcelas</li><li>Conciliação</li></ul></div>
      <div className='card'><h4 style={{marginTop:0}}>Dicas</h4><p>Esta UI usa tema neutro com foco em desempenho e escalabilidade.</p></div>
    </div>
  )
}
