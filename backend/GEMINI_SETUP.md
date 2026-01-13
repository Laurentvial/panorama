# Configuration de l'API Gemini pour la génération IA

## Étapes pour configurer la clé API Gemini

### 1. Obtenir une clé API Gemini

1. Allez sur [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Connectez-vous avec votre compte Google
3. Cliquez sur "Create API Key"
4. Copiez la clé API générée

### 2. Ajouter la clé API dans le fichier `.env`

Créez un fichier `.env` à la racine du dossier `backend/` (s'il n'existe pas déjà) et ajoutez :

```env
GEMINI_API_KEY=votre-clé-api-gemini-ici
```

**Important**: Le fichier `.env` est déjà dans `.gitignore` et ne sera pas commité dans Git.

### 3. Installer la dépendance

Installez la bibliothèque Google Generative AI :

```bash
cd backend
pip install google-generativeai
```

Ou avec `requirements.txt` :

```bash
pip install -r requirements.txt
```

### 4. Redémarrer le serveur Django

Après avoir ajouté la clé API, redémarrez votre serveur Django :

```bash
python manage.py runserver
```

## Utilisation

Une fois configuré, les boutons de génération IA dans le formulaire de création de produit utiliseront automatiquement l'API Gemini pour générer :
- Descriptions de produits
- Conditions Générales de Vente (CGV)

## Endpoints API

- `POST /api/products/generate-description/` - Génère une description de produit
- `POST /api/products/generate-cgv/` - Génère des CGV

Ces endpoints nécessitent une authentification JWT.

## Dépannage

Si vous obtenez une erreur "GEMINI_API_KEY not configured", vérifiez que :
1. Le fichier `.env` existe dans le dossier `backend/`
2. La variable `GEMINI_API_KEY` est bien définie dans `.env`
3. Le serveur Django a été redémarré après l'ajout de la variable
