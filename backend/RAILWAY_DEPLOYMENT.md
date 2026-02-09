# Guide de déploiement Railway

Ce guide explique comment déployer le backend Django sur Railway.

## Prérequis

- Un compte Railway (gratuit sur [railway.app](https://railway.app))
- Un dépôt Git (GitHub, GitLab, ou Bitbucket)
- Les variables d'environnement nécessaires

## Étapes de déploiement

### 1. Créer un nouveau projet sur Railway

1. Allez sur [railway.app](https://railway.app) et connectez-vous
2. Cliquez sur **"New Project"**
3. Sélectionnez **"Deploy from GitHub repo"** (ou votre dépôt Git)
4. Sélectionnez votre dépôt `panorama`

### 2. Configurer le service backend

1. Railway détectera automatiquement le projet Django
2. **Important** : Dans les paramètres du service :
   - **Root Directory** : Sélectionnez `backend`
   - **Build Command** : Railway détectera automatiquement (ou utilise `pip install -r requirements.txt`)
   - **Start Command** : `gunicorn backend.wsgi:application --bind 0.0.0.0:$PORT`

### 3. Ajouter une base de données PostgreSQL

1. Dans votre projet Railway, cliquez sur **"+ New"**
2. Sélectionnez **"Database"** → **"PostgreSQL"**
3. Railway créera automatiquement une base de données PostgreSQL
4. La variable `DATABASE_URL` sera automatiquement ajoutée à votre service backend

### 4. Configurer les variables d'environnement

Dans les paramètres du service backend → **Variables**, ajoutez les variables suivantes :

#### Variables requises

| Variable | Description | Exemple |
|----------|-------------|---------|
| `SECRET_KEY` | Clé secrète Django (générez-en une nouvelle pour la production) | `django-insecure-...` |
| `DEBUG` | Mode debug (désactivé en production) | `False` |
| `DATABASE_URL` | URL de la base de données (ajoutée automatiquement si vous utilisez Railway PostgreSQL) | `postgresql://...` |
| `CLOUDINARY_CLOUD_NAME` | Nom du cloud Cloudinary | Votre nom Cloudinary |
| `CLOUDINARY_API_KEY` | Clé API Cloudinary | Votre clé API |
| `CLOUDINARY_API_SECRET` | Secret API Cloudinary | Votre secret API |
| `GEMINI_API_KEY` | Clé API Google Gemini (optionnel) | Votre clé API Gemini |

#### Variables optionnelles

| Variable | Description | Valeur par défaut |
|----------|-------------|-------------------|
| `DB_CONN_MAX_AGE` | Durée max des connexions DB (secondes) | `0` |
| `PORT` | Port d'écoute (géré automatiquement par Railway) | Automatique |

### 5. Générer une nouvelle SECRET_KEY

Pour la production, générez une nouvelle clé secrète :

```python
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

Copiez la clé générée et ajoutez-la comme variable `SECRET_KEY` dans Railway.

### 6. Migrations de base de données

Railway exécutera automatiquement les migrations lors du déploiement grâce au `Procfile` qui contient :
```
release: python manage.py migrate
```

Si vous avez besoin d'exécuter manuellement les migrations :
1. Ouvrez le terminal Railway (onglet "Deployments" → "View Logs")
2. Ou utilisez Railway CLI : `railway run python manage.py migrate`

### 7. Déploiement

1. Railway déploiera automatiquement à chaque push sur la branche principale
2. Vous pouvez aussi déclencher un déploiement manuel depuis le dashboard
3. Surveillez les logs dans l'onglet **"Deployments"** → **"View Logs"**

### 8. Obtenir l'URL de votre API

1. Dans les paramètres du service backend
2. Activez **"Generate Domain"** pour obtenir une URL publique
3. Ou configurez un domaine personnalisé dans **"Settings"** → **"Networking"**

L'URL sera au format : `https://votre-service.up.railway.app`

## Configuration CORS

Le backend est configuré pour accepter toutes les origines (`CORS_ALLOW_ALL_ORIGINS = True`). 

Pour restreindre aux domaines spécifiques en production, modifiez `backend/backend/settings.py` :

```python
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = [
    "https://votre-frontend.vercel.app",
    "https://votre-domaine.com",
]
```

## Mise à jour du frontend

Après avoir déployé le backend sur Railway, mettez à jour la variable d'environnement `VITE_URL` dans Vercel (ou votre plateforme frontend) :

```
VITE_URL=https://votre-backend.up.railway.app
```

## Vérification

Après le déploiement, vérifiez :

1. ✅ Le service démarre sans erreur (voir les logs)
2. ✅ Les migrations sont exécutées (`python manage.py migrate`)
3. ✅ L'endpoint de santé répond : `https://votre-backend.up.railway.app/health/`
4. ✅ Les appels API fonctionnent depuis le frontend

## Commandes utiles Railway CLI

Si vous installez Railway CLI (`npm i -g @railway/cli`) :

```bash
# Se connecter
railway login

# Lier le projet
railway link

# Voir les logs
railway logs

# Exécuter une commande
railway run python manage.py migrate
railway run python manage.py createsuperuser

# Ouvrir le shell Django
railway run python manage.py shell
```

## Dépannage

### Le service ne démarre pas

- Vérifiez les logs dans Railway
- Assurez-vous que `SECRET_KEY` est défini
- Vérifiez que toutes les variables d'environnement requises sont présentes

### Erreurs de connexion à la base de données

- Vérifiez que `DATABASE_URL` est correctement configuré
- Assurez-vous que le service PostgreSQL est démarré
- Vérifiez les logs de la base de données

### Erreurs CORS

- Vérifiez que `CORS_ALLOW_ALL_ORIGINS = True` ou que vos domaines sont dans `CORS_ALLOWED_ORIGINS`
- Vérifiez que le middleware CORS est bien configuré

### Erreurs Cloudinary

- Vérifiez que `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, et `CLOUDINARY_API_SECRET` sont définis
- Vérifiez vos identifiants Cloudinary

## Avantages de Railway vs Heroku

- ✅ **Gratuit** : Plan gratuit généreux avec 500$ de crédit par mois
- ✅ **Plus fiable** : Infrastructure moderne et stable
- ✅ **Déploiements automatiques** : À chaque push Git
- ✅ **Base de données incluse** : PostgreSQL facile à ajouter
- ✅ **Logs en temps réel** : Monitoring intégré
- ✅ **Variables d'environnement** : Gestion simple depuis le dashboard
