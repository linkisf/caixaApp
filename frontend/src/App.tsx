import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import Home from './pages/Home/Home'

import MovimentacaoIndex from './pages/movimentacao/Index'
import SessoesIndex from './pages/sessoes/Index'
import PlanoDeContasIndex from './pages/planoDeContas/Index'
import UsuariosIndex from './pages/usuarios/Index'
import FuncionariosIndex from './pages/funcionarios/Index'
import FuncoesIndex from './pages/funcoes/Index'
import FornecedoresPage from './pages/fornecedores/Index';
import Dashboard from './pages/Dashboard';
import DREPage from "./pages/dre/Index";
import ClassificacoesBalanco from "./pages/referencias/ClassificacoesBalanco";
import ContasAPagar from "./pages/contasAPagar/Index";

// Novas páginas de referências
import TiposContaPage from './pages/referencias/TiposConta'
import ClassificacoesDREPage from './pages/referencias/ClassificacoesDRE'
import NaturezasPage from './pages/referencias/Naturezas'
import TiposSaidaIndex from "./pages/funcionarios/TiposSaidaIndex";
import FormasPagamentoPage from './pages/referencias/FormasPagamento'
import PessoasPage from './pages/referencias/Pessoas'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path='/' element={<Dashboard />} />

        <Route path="/dashboard" element={<Dashboard />} />

        <Route path="/dre" element={<DREPage/>} />

        <Route path='/movimentacao' element={<MovimentacaoIndex />} />

        <Route path='/sessoes' element={<SessoesIndex />} />

        <Route path='/plano-de-contas' element={<PlanoDeContasIndex />} />

        <Route path='/usuarios' element={<UsuariosIndex />} />

        <Route path='/fornecedores' element={<FornecedoresPage />} />

        <Route path='/funcionarios' element={<FuncionariosIndex />} />

        <Route path="/referencias/classificacoes-balanco" element={<ClassificacoesBalanco/>} />

        <Route path="/contas-a-pagar" element={<ContasAPagar />} />

        <Route path="/funcionarios/tipos-saida" element={<TiposSaidaIndex />} />
        
        <Route path='/funcoes' element={<FuncoesIndex />} />

        {/* Rotas das páginas de referência */}
        <Route path='/referencias/tipos-conta' element={<TiposContaPage />} />
        <Route path='/referencias/classificacoes-dre' element={<ClassificacoesDREPage />} />
        <Route path='/referencias/naturezas' element={<NaturezasPage />} />
        <Route path='/referencias/formas-pagamento' element={<FormasPagamentoPage />} />
        <Route path='/referencias/pessoas' element={<PessoasPage />} />
      </Routes>
    </Layout>
  )
}
