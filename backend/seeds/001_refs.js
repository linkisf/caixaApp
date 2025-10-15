/** Seed reference tables with basic values */
export async function seed(knex) {
  await knex('ref_papel').insert([
    { nome: 'admin', descricao: 'Acesso total ao sistema' },
    { nome: 'gerente', descricao: 'Gestão financeira e operacional' },
    { nome: 'operador', descricao: 'Opera o caixa e lança movimentos' },
    { nome: 'visualizador', descricao: 'Somente leitura' },
  ]).onConflict('nome').ignore();

  await knex('ref_tipo_conta_corrente').insert([
    { nome: 'caixa_fisico', descricao: 'Dinheiro em espécie' },
    { nome: 'conta_bancaria', descricao: 'Conta corrente bancária' },
    { nome: 'carteira_digital', descricao: 'PSPs / carteiras digitais' },
    { nome: 'outro', descricao: 'Outro tipo de conta' },
  ]).onConflict('nome').ignore();

  await knex('ref_tipo_conta_gerencial').insert([
    { nome: 'entrada', descricao: 'Contas de receita/entrada' },
    { nome: 'saida', descricao: 'Contas de despesa/custo/saída' },
  ]).onConflict('nome').ignore();

  await knex('ref_meio_pagamento').insert([
    { nome: 'Dinheiro', descricao: 'Espécie' },
    { nome: 'PIX', descricao: 'Pagamento instantâneo' },
    { nome: 'Cartão Crédito', descricao: 'Operadora de crédito' },
    { nome: 'Cartão Débito', descricao: 'Operadora de débito' },
    { nome: 'Boleto', descricao: 'Cobrança por boleto' },
    { nome: 'TED', descricao: 'Transferência TED' },
    { nome: 'DOC', descricao: 'Transferência DOC' },
    { nome: 'Outros', descricao: 'Outros meios' },
  ]).onConflict('nome').ignore();

  await knex('ref_sessao_caixa').insert([
    { nome: 'funcionario', descricao: 'Movimento associado a funcionário' },
    { nome: 'entrada_caixa', descricao: 'Classificação de entrada de caixa' },
    { nome: 'saida_caixa', descricao: 'Classificação de saída de caixa' },
  ]).onConflict('nome').ignore();
}
