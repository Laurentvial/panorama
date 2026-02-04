# Guide de déploiement Vercel

## Configuration effectuée

✅ Fichier `vercel.json` créé avec la configuration optimale
✅ Fichier `.vercelignore` créé pour exclure les fichiers inutiles
✅ README mis à jour avec les instructions

## Étapes pour déployer

### 1. Préparer le dépôt Git
Assurez-vous que tous les fichiers sont commités :
```bash
git add .
git commit -m "Prepare Vercel deployment"
git push
```

### 2. Connecter à Vercel

1. Allez sur [vercel.com](https://vercel.com) et connectez-vous
2. Cliquez sur **"Add New Project"**
3. Importez votre dépôt GitHub/GitLab/Bitbucket
4. **Important** : Dans les paramètres du projet :
   - **Root Directory** : Sélectionnez `frontend`
   - **Framework Preset** : Vite (détecté automatiquement)

### 3. Configurer les variables d'environnement

Dans les paramètres du projet Vercel → **Environment Variables**, ajoutez :

| Variable | Valeur | Environnements |
|----------|--------|----------------|
| `VITE_URL` | `https://votre-backend-api.com` | Production, Preview, Development |

**Exemple** :
- Production : `https://api.panorama.com`
- Preview : `https://api-staging.panorama.com`
- Development : `http://127.0.0.1:8000` (pour les previews locales)

### 4. Déployer

- **Premier déploiement** : Cliquez sur "Deploy"
- **Déploiements automatiques** : Vercel déploiera automatiquement à chaque push sur la branche principale
- **Preview deployments** : Créés automatiquement pour chaque pull request

## Configuration Vercel

Le fichier `vercel.json` configure :

- ✅ **Routing SPA** : Toutes les routes redirigent vers `index.html` (nécessaire pour React Router)
- ✅ **Cache des assets** : Les fichiers statiques sont mis en cache pour 1 an
- ✅ **Build optimisé** : Utilise `npm run build` avec sortie dans `dist/`

## Vérification

Après le déploiement, vérifiez :

1. ✅ Le site est accessible
2. ✅ Les routes React Router fonctionnent (testez `/admin`, `/login`, etc.)
3. ✅ Les appels API fonctionnent (vérifiez la console du navigateur)
4. ✅ Les assets statiques se chargent correctement

## Dépannage

### Erreur : "Cannot find module"
- Vérifiez que `package.json` contient toutes les dépendances
- Exécutez `npm install` localement pour vérifier

### Erreur : "404 Not Found" sur les routes
- Vérifiez que `vercel.json` contient la règle de rewrite `"source": "/(.*)", "destination": "/index.html"`

### Les appels API échouent
- Vérifiez que la variable `VITE_URL` est correctement configurée dans Vercel
- Vérifiez que votre backend autorise les requêtes depuis le domaine Vercel (CORS)

### Build échoue
- Vérifiez les logs de build dans Vercel
- Testez le build localement : `cd frontend && npm run build`

## Commandes utiles

```bash
# Build local pour tester
cd frontend
npm run build

# Vérifier la configuration Vercel
vercel --version  # Si vous avez installé Vercel CLI

# Déployer depuis la ligne de commande (optionnel)
npm install -g vercel
cd frontend
vercel
```

## Support

Pour plus d'informations :
- [Documentation Vercel](https://vercel.com/docs)
- [Documentation Vite](https://vitejs.dev/guide/static-deploy.html#vercel)
