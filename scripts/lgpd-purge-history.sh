#!/usr/bin/env bash
# Purga retroativa LGPD do historico git.
# Remove os 3 arquivos sensiveis (Colaboradores, Postos de Servico, Trabalhadores)
# de TODOS os commits do repo.
#
# Pre-requisitos:
#   pip install git-filter-repo
#
# Execucao:
#   bash scripts/lgpd-purge-history.sh
#
# Apos rodar, exige force-push (operacao destrutiva — alinhar com qualquer
# clone existente, incluindo a VPS):
#   git push --force-with-lease
#
# Na VPS:
#   git fetch --all && git reset --hard origin/main
#
# Backup automatico: branch `backup-pre-lgpd-purge` foi criada antes da purga.

set -euo pipefail

# Verifica filter-repo
if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "ERRO: git-filter-repo nao encontrado. Instale com: pip install git-filter-repo"
  exit 1
fi

# Garante branch de backup
if ! git show-ref --verify --quiet refs/heads/backup-pre-lgpd-purge; then
  git branch backup-pre-lgpd-purge
  echo "Branch backup-pre-lgpd-purge criada (commit atual)."
fi

# Lista arquivos sensiveis no historico
FILES=(
  "docs/exemplo/Colaboradores, para fins de validação.xlsx"
  "docs/exemplo/Postos de Serviço.xlsx"
  "docs/exemplo/Trabalhadores, de 10-05-2026.XLS"
)

ARGS=()
for f in "${FILES[@]}"; do
  ARGS+=(--path "$f")
done

echo "Arquivos a remover do historico:"
printf '  %s\n' "${FILES[@]}"
echo
echo "Confirmar? (digite YES para continuar)"
read -r ans
if [ "$ans" != "YES" ]; then
  echo "Abortado."
  exit 0
fi

git filter-repo --invert-paths "${ARGS[@]}" --force

echo
echo "Purga concluida localmente."
echo "Proximos passos:"
echo "  1. git remote add origin <URL>  # filter-repo remove o remote por seguranca"
echo "  2. git push --force-with-lease origin main"
echo "  3. Na VPS: git fetch --all && git reset --hard origin/main"
echo
echo "Backup disponivel em: branch 'backup-pre-lgpd-purge'"
