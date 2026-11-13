# Templates e-mail Supabase Auth

Les e-mails de confirmation, de mot de passe oublié et d'invitation sont envoyés par Supabase, pas par le backend. Ces fichiers reprennent le gabarit des e-mails Resend (`backend/services/email_layout.py`).

**Ne pas les modifier à la main** : ils sont générés.

```bash
python scripts/build_supabase_email_templates.py          # régénère
python scripts/build_supabase_email_templates.py --check  # vérifie (lancé par les tests)
```

Le contenu vient de `backend/services/auth_email_templates.py`.

## Les appliquer

Dashboard Supabase > Authentication > Emails (Templates). Pour chaque ligne : coller le fichier dans « Message body » (mode source HTML), puis renseigner « Subject ».

| Template Supabase | Fichier | Subject |
|---|---|---|
| Confirm sign up | `confirmation.html` | Confirme ton adresse e-mail - AxeL Job |
| Reset password | `recovery.html` | Réinitialise ton mot de passe - AxeL Job |
| Invite user | `invite.html` | Tu es invité(e) sur AxeL Job |

Les variables `{{ .ConfirmationURL }}` et `{{ .Email }}` sont celles de Supabase : elles sont remplacées à l'envoi.

Pas de déploiement automatique : après un changement du gabarit, régénérer, puis recoller dans le Dashboard (prod, puis staging si présent).
