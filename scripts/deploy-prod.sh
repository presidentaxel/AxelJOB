#!/usr/bin/env bash
# Déploiement production AxeL Job depuis la branche `prod`.
#
# Chemin nominal : appelé par .github/workflows/deploy-prod.yml (SSH après
# `git checkout -f -B prod origin/prod`).
# Fallback si le CD GitHub est down :
#   cd /opt/cv-bot && git fetch origin && git checkout -f -B prod origin/prod
#   bash scripts/deploy-prod.sh --skip-pull
#
# Ne jamais lancer ce script sur `main` ni une feature.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SKIP_PULL=0
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: bash scripts/deploy-prod.sh [--skip-pull] [--dry-run]

  --skip-pull     Ne pas git fetch/pull (le CD a déjà aligné HEAD sur origin/prod).
  --dry-run       Vérifie que HEAD est `prod`, n'exécute ni Docker ni le smoke.
EOF
}

die() {
  echo "deploy-prod.sh: $*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-pull) SKIP_PULL=1 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      die "argument inconnu: $1"
      ;;
  esac
  shift
done

branch="$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
[[ "$branch" == "prod" ]] || die "refuse (HEAD=${branch:-?}, besoin prod)"

if [[ "$SKIP_PULL" -eq 0 ]]; then
  git fetch origin
  git pull --ff-only origin prod
  branch="$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --abbrev-ref HEAD)"
  [[ "$branch" == "prod" ]] || die "refuse après pull (HEAD=$branch, besoin prod)"
fi

dirty="$(git status --porcelain --untracked-files=no || true)"
if [[ -n "$dirty" ]]; then
  echo "$dirty" >&2
  die "working tree tracked dirty — refuser un deploy ambigu"
fi

export SENTRY_RELEASE="${SENTRY_RELEASE:-$(git rev-parse HEAD)}"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "dry-run: HEAD=prod SHA=$SENTRY_RELEASE smoke=http://127.0.0.1:8000/health"
  echo "dry-run: docker compose build && docker compose up -d --wait"
  exit 0
fi

echo "deploy-prod: SHA=$SENTRY_RELEASE"
docker compose build
docker compose up -d --wait

body="$(docker compose exec -T backend python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=5).read().decode())")"
if [[ "$body" != *'"status":"ok"'* && "$body" != *'"status": "ok"'* ]]; then
  echo "$body" >&2
  die "smoke /health KO dans le conteneur backend"
fi

echo "deploy-prod: smoke OK (/health) SHA=$SENTRY_RELEASE"
