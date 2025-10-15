# Caixa Backend (Express + Knex + PostgreSQL)

## Configuração
1. Copie `.env.example` para `.env` e ajuste variáveis de conexão com Postgres.
2. Instale dependências:
   ```bash
   npm ci
   ```
3. Rode em dev:
   ```bash
   npm run dev
   ```

## Endpoints
- `GET /api/contas` — lista contas ativas (id, nome)
- `GET /api/funcionarios` — lista funcionários ativos (id, nome)
- `POST /api/sessoes-caixa` — insere sessão (abertura **ou** fechamento)

## Observação
Este backend assume que **as tabelas já existem** no banco conforme seu schema SQL anterior:
- `ent_contas_corrente(id UUID, nome TEXT, ativo BOOLEAN, ...)`
- `ent_funcionarios(id UUID, nome TEXT, ativo BOOLEAN, ...)`
- `sessoes_caixa(id UUID default gen_random_uuid(), conta_corrente_id UUID, aberto_por_id UUID NULL, fechado_por_id UUID NULL, aberto_em timestamptz NULL, fechado_em timestamptz NULL, saldo_abertura_centavos BIGINT NULL, saldo_fechamento_centavos BIGINT NULL, observacao TEXT NULL)`
