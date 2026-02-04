
  # Panorama

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Déploiement sur Vercel

  ### Prérequis
  - Un compte Vercel (gratuit)
  - Le projet doit être sur GitHub/GitLab/Bitbucket

  ### Étapes de déploiement

  1. **Connecter le projet à Vercel**
     - Allez sur [vercel.com](https://vercel.com)
     - Cliquez sur "Add New Project"
     - Importez votre dépôt GitHub
     - Sélectionnez le dossier `frontend` comme Root Directory

  2. **Configurer les variables d'environnement**
     Dans les paramètres du projet Vercel, ajoutez les variables suivantes :
     - `VITE_URL` : L'URL de votre backend API (ex: `https://votre-backend.com`)

  3. **Configuration automatique**
     Vercel détectera automatiquement :
     - Framework : Vite
     - Build Command : `npm run build`
     - Output Directory : `dist`
     - Install Command : `npm install`

  4. **Déploiement**
     - Vercel déploiera automatiquement à chaque push sur la branche principale
     - Les pull requests créeront des preview deployments

  ### Configuration

  Le fichier `vercel.json` configure :
  - Le routing SPA (toutes les routes redirigent vers `index.html`)
  - Le cache pour les assets statiques
  - Les commandes de build et de développement

  ### Variables d'environnement

  Créez un fichier `.env.local` pour le développement local :
  ```
  VITE_URL=http://127.0.0.1:8000
  ```

  ⚠️ **Important** : Ne commitez jamais le fichier `.env.local`. Configurez les variables d'environnement directement dans le dashboard Vercel pour la production.
  