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

Une fois redéployé, testez la commande :

```bash
heroku run python manage.py refresh_external_asset_prices --scope product-assets --limit 20 --min-age-seconds 240
```

### Étape 3 : Configurer le scheduler

Dans le dashboard Heroku, configurez la commande du scheduler :

```
python manage.py refresh_external_asset_prices --scope product-assets --limit 20 --min-age-seconds 240
```

**Note** : Après le redéploiement avec le buildpack Python, la commande `python` devrait fonctionner directement (pas besoin de `python3`).

## Alternative : Utiliser le chemin complet

Si `python` ne fonctionne toujours pas après le redéploiement, utilisez le chemin complet :

```
/app/.heroku/python/bin/python manage.py refresh_external_asset_prices --scope product-assets --limit 20 --min-age-seconds 240
```

## Fréquence recommandée

Toutes les 10 minutes : `*/10 * * * *`
