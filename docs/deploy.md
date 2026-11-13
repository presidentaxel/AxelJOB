# Guide de deploiement (production)

Reference de deploiement `cv-bot` avec Docker.

## Sommaire

1. Prerequis
2. Installation initiale
3. Verification post-deploiement
4. Mise a jour
5. Configuration critique
6. Checklist production

## 1) Prerequis

- Serveur Linux (2 Go RAM minimum recommande).
- Nom de domaine et DNS.
- Projet Supabase configure.
- Cle API Gemini.
- Docker + plugin Docker Compose.

## 2) Installation initiale

```bash
cd /opt
git clone <repo-url> cv-bot
cd cv-bot
cp .env.example .env
# renseigner les valeurs production dans .env
docker compose build
docker compose up -d
```

## 3) Verification post-deploiement

```bash
docker compose ps
docker compose logs --tail 200 backend
curl http://localhost/health
```

Resultat attendu :

- backend sain ;
- frontend actif ;
- endpoint `/health` sur statut `ok`.

## 4) Mise a jour

Le chemin nominal est le CD : un push sur `prod` lance `.github/workflows/deploy-prod.yml` dans l'Environment GitHub `production`. Secrets : `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`. Le script est `scripts/deploy-prod.sh`. Il aligne `/opt/cv-bot` sur `origin/prod`, reconstruit les images et vérifie `/health` dans le conteneur backend.

Un push sur `main` ne déploie pas.

Fallback si le CD est down :

```bash
cd /opt/cv-bot
git fetch origin
git checkout -f -B prod origin/prod
bash scripts/deploy-prod.sh
```

## 5) Configuration critique

- Configurer un reverse proxy HTTPS (Caddy, nginx ou Cloudflare).
- Definir un `METRICS_AUTH_TOKEN` robuste.
- Laisser Swagger/ReDoc desactive en production.
- Garder les buckets Supabase prives par defaut.
- Aligner `CV_BOT_API_BASE_URL` et `CV_BOT_FRONTEND_URL` sur les URLs publiques reelles.

> [!WARNING]
> Ne pas deployer sans valider les variables d'environnement et le healthcheck.

## 6) Checklist production

- [ ] Variables d'environnement completees et verifiees.
- [ ] Build Docker ok.
- [ ] Healthcheck valide.
- [ ] Logs backend sans erreur bloquante.
- [ ] Workflow securite CI vert.

Pour les commandes d'exploitation quotidiennes, voir `docs/ops-commands.md`.
