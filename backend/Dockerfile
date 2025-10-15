FROM node:20-alpine

WORKDIR /app

# copie ambos os arquivos para permitir npm ci
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY src ./src
COPY knexfile.js ./
# COPY .env ./.env   # (opcional; prefira variáveis de ambiente no compose)
EXPOSE 8000
CMD ["npm", "start"]
