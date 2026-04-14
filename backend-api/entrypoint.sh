#!/bin/sh
# Entrypoint do container da API.
# Aguarda o banco, executa migrations e inicia o servidor.

set -e

MAX_RETRIES=10
RETRY_DELAY=3

echo "⏳ Aguardando banco de dados ficar disponível..."
for i in $(seq 1 $MAX_RETRIES); do
  if npx prisma migrate deploy 2>/dev/null; then
    echo "✅ Migrações aplicadas com sucesso."
    break
  fi
  if [ "$i" -eq "$MAX_RETRIES" ]; then
    echo "❌ Banco de dados indisponível após $MAX_RETRIES tentativas. Abortando."
    exit 1
  fi
  echo "⏳ Tentativa $i/$MAX_RETRIES falhou. Retentando em ${RETRY_DELAY}s..."
  sleep $RETRY_DELAY
done

echo "🚀 Iniciando servidor..."
exec npm start
