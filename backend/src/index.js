import express from 'express';
import cors from 'cors';
import 'dotenv/config';

import contasRouter from './routes/contas.js';
import funcionariosRouter from './routes/funcionarios.js';
import sessoesRouter from './routes/sessoes-caixa.js';
import entradasRouter from './routes/entradas.js';
import saidasRouter from './routes/saidas.js';
import transferenciasRouter from './routes/transferencias.js';
import funcionariosFuncoesRouter from './routes/funcionarios_funcoes.js';
import fornecedoresRouter from './routes/fornecedores.js';
import contasCorrenteRouter from './routes/contasCorrente.js';
import contasCorrenteMovsRouter from './routes/contasCorrenteMovimentos.js';
import dashboardRouter from './routes/dashboard.js';
import relatoriosRoutes from './routes/relatorios.js';
import classBal from "./routes/classificacoesBalanco.js";
import contasAPagarRouter from "./routes/contasAPagar.js";
import funcionarioTiposSaida from "./routes/funcionarioTiposSaida.js"; // << ADICIONADO

import tiposContaRouter from './routes/ref/tiposConta.js';
import classifDreRouter from './routes/ref/classificacoesDre.js';
import naturezasRouter from './routes/ref/naturezas.js';
import formasPagtoRouter from './routes/ref/formasPagamento.js';
import pessoasRouter from './routes/ref/pessoas.js';
import refContasDirecao from './routes/ref/contasDirecao.js';
import funcionarioTiposSaidaRouter from "./routes/ref/funcionarioTipoSaida.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// FUNCIONARIOS (ordem importa: a rota específica vem antes da geral)
app.use("/api/funcionarios/tipos-saida", funcionarioTiposSaida);   // << ADICIONADO E POSICIONADO ANTES
app.use('/api/funcionarios', funcionariosRouter);
app.use("/api/ref/funcionario-tipos-saida", funcionarioTiposSaidaRouter);
app.use('/api/funcoes', funcionariosFuncoesRouter);

// CONTAS
app.use('/api/tipos-conta', tiposContaRouter);
app.use('/api/contas', contasRouter);
app.use('/api/ref/contas-direcao', refContasDirecao);
app.use('/api/contas-corrente', contasCorrenteRouter);

// MOVIMENTOS
app.use('/api/classificacoes-dre', classifDreRouter);
app.use('/api/contas-dre', classifDreRouter);
app.use("/api/classificacoes-balanco", classBal);
app.use('/api/contas-corrente/:contaId/movimentos', contasCorrenteMovsRouter);

app.use('/api/sessoes-caixa', sessoesRouter);
app.use('/api/entradas', entradasRouter);
app.use('/api/saidas', saidasRouter);
app.use('/api/transferencias', transferenciasRouter);

app.use('/api/fornecedores', fornecedoresRouter);

app.use('/api/naturezas', naturezasRouter);
app.use('/api/formas-pagamento', formasPagtoRouter);
app.use('/api/pessoas', pessoasRouter);

app.use('/api/dashboard', dashboardRouter);
app.use('/api/relatorios', relatoriosRoutes);

app.use("/api/contas-a-pagar", contasAPagarRouter);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.use((err, req, res, _next) => {
  console.error('ERR:', {
    message: err?.message,
    code: err?.code,        // p.ex. 42P01 (tabela não existe), 42703 (coluna), 23505 (unique)
    detail: err?.detail,
    stack: err?.stack,
  });

  if (process.env.NODE_ENV !== 'production') {
    return res.status(500).json({
      error: 'Internal Server Error',
      code: err?.code,
      detail: err?.detail ?? err?.message,
    });
  }
  return res.status(500).json({ error: 'Internal Server Error' });
});

const port = Number(process.env.PORT || 8000);
app.listen(port, () => console.log(`API on http://0.0.0.0:${port}`));
