# Configuration Heroku Scheduler

## Problème
Le scheduler Heroku retourne l'erreur : `/bin/bash: line 1: python: command not found`

## Diagnostic

Le problème vient du fait que le buildpack Python n'était pas configuré sur Heroku. 
**Le buildpack Python a été ajouté** (`heroku/python`), mais il faut **redéployer l'application** pour qu'il soit actif.

## Solution

### Étape 1 : Redéployer l'application

Le buildpack Python doit être activé via un nouveau déploiement :

```bash
git add runtime.txt
git commit -m "Add Python runtime and buildpack for scheduler"
git push heroku main
```

Ou si vous utilisez une autre branche :
```bash
git push heroku <votre-branche>:main
```

### Étape 2 : Tester la commande

**Important** : Les dynos one-off (`heroku run`) peuvent ne pas avoir accès au code source de la même manière que les dynos web. Le scheduler Heroku s'exécute dans le contexte du dyno web où le code est disponible.

Pour tester, vous pouvez :
1. Configurer la commande dans le scheduler et vérifier les logs
2. Ou utiliser la commande suivante (qui devrait fonctionner dans le contexte du scheduler) :

```bash
cd backend && python manage.py refresh_external_asset_prices --scope product-assets --limit 20 --min-age-seconds 240
```

### Étape 3 : Configurer le scheduler

Dans le dashboard Heroku, configurez la commande du scheduler avec :

```
cd backend && /app/.heroku/python/bin/python manage.py refresh_external_asset_prices --scope product-assets --limit 20 --min-age-seconds 240
```

**Explication** :
- Le Procfile utilise `cd backend`, donc le code est dans `/app/backend/` lors de l'exécution
- Le chemin `/app/.heroku/python/bin/python` est le chemin complet vers Python installé par le buildpack
- Cette commande devrait fonctionner dans le contexte du scheduler

**Alternative (si la commande ci-dessus ne fonctionne pas)** :
```
cd backend && python manage.py refresh_external_asset_prices --scope product-assets --limit 20 --min-age-seconds 240
```

### Étape 4 : Vérifier les logs

Après avoir configuré le scheduler, vérifiez les logs pour confirmer que la commande fonctionne :

```bash
heroku logs --tail --source scheduler
```

Ou dans le dashboard Heroku, allez dans "More" > "View logs" et filtrez par "scheduler".

## Alternative : Utiliser le chemin complet

Si `python` ne fonctionne toujours pas après le redéploiement, utilisez le chemin complet :

```
/app/.heroku/python/bin/python manage.py refresh_external_asset_prices --scope product-assets --limit 20 --min-age-seconds 240
```

## Fréquence recommandée

Toutes les 10 minutes : `*/10 * * * *`
