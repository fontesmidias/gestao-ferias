FROM node:22-alpine AS builder

WORKDIR /app

# OpenSSL é requerido pelo Prisma no Alpine
RUN apk add --no-cache openssl

# Copia dependências e instala todas (incluindo as de desenvolvimento)
COPY package*.json ./
RUN npm install

# Copia o restante do código
COPY . .

# Roda o gerador do Prisma e constrói o TypeScript
RUN npx prisma generate
RUN npm run build 

FROM node:22-alpine

WORKDIR /app

# Mantém a dependência do Prisma
RUN apk add --no-cache openssl

# Copia e instala apenas arquivos necessários para produção
COPY package*.json ./
RUN npm install --omit=dev

# Copia a pasta de código compilado e a pasta Prisma do Estágio 1
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.js ./

# Copia o Prisma Client gerado previamente no Estágio 1
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Expõe a porta que sua API usa
EXPOSE 2000

ENV NODE_ENV=production

# Copia o script de entrypoint que roda as migrations antes de iniciar
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# O entrypoint roda "prisma migrate deploy" e depois "npm start"
CMD ["./entrypoint.sh"]
