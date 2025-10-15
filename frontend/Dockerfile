# # DEV (hot-reload)
# FROM node:20-alpine AS dev
# WORKDIR /app
# COPY package.json package-lock.json* ./
# RUN npm ci || npm i
# COPY . .
# EXPOSE 5173
# CMD ["npm","run","dev"]

# # PROD (build + nginx)
# FROM node:20-alpine AS build
# WORKDIR /app
# COPY package.json package-lock.json* ./
# RUN npm ci || npm i
# COPY . .
# ARG VITE_API_URL
# ENV VITE_API_URL=$VITE_API_URL
# RUN npm run build

# FROM nginx:1.27-alpine AS prod
# COPY --from=build /app/dist /usr/share/nginx/html
# EXPOSE 80
# CMD ["nginx","-g","daemon off;"]


# ---- DEV (hot reload) ----
FROM node:20-alpine

WORKDIR /app

# Copia só os manifests para aproveitar cache de dependências
COPY package.json package-lock.json* ./

# Instala dependências (gera node_modules DO CONTAINER)
RUN npm ci || npm i

# Copia o restante do código
COPY . .

EXPOSE 5173

# Vite em modo dev com HMR
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]



