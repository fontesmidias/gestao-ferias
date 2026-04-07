#!/bin/sh
# Entrypoint do container da API.
# Executa as migrations pendentes antes de iniciar o servidor.
# Isso garante que o banco de dados esteja sempre atualizado sem intervenção manual.

set -e

echo "⏳ Rodando migrações do Prisma..."
npx prisma migrate deploy

echo "✅ Migrações aplicadas. Iniciando servidor..."
exec npm start
