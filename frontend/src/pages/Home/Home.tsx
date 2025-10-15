import React from 'react'
export default function Home(){
  return (
    <div className='grid grid-3'>
      <div className='card'><h3 style={{marginTop:0}}>Bem-vindo</h3><p>Use os botões centrais para acessar o Dashboard e a Movimentação de Caixa. Outras configurações estão no menu <strong>Configuração</strong> (topo direito).</p></div>
      <div className='card'><h4 style={{marginTop:0}}>Atalhos</h4><ul><li>Movimentação de Caixa</li><li>Sessões</li><li>Plano de Contas</li></ul></div>
      <div className='card'><h4 style={{marginTop:0}}>Dicas</h4><p>Arquitetura modular: páginas por domínio e componentes reutilizáveis.</p></div>
    </div>
  )
}
