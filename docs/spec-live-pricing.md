# Spécification — Génération de positions Live Pricing

**Projet :** Panorama  
**Version :** 1.0 (spec finale)  
**Statut :** Implémenté (v1)

## Résumé

Feature **complémentaire** au mode anticipé existant. Les positions sont créées **jour par jour** à **23:00 UTC** à partir des cours intraday réels des actifs alloués au produit.

## Décisions produit

| Sujet | Décision |
|-------|----------|
| Mode | Opt-in via « Passer en génération Live Pricing » |
| Taux | Réutilisés depuis le modal classique (`generate-rates`) |
| Timing | 1 exécution/jour à **23:00 UTC** (crypto incluse) |
| Date session | `trading_session_date` = date UTC du jour civil |
| Positions/mois | Fourchette min/max + `_distribute_positions_across_days` |
| Report P&L | Max **3 jours ouvrés**, puis étalement |
| Fin période | Étalement sur **5 derniers jours ouvrés** |
| Bascule anticipé | **v1.5** (hors scope v1) |

## Parcours CRM

1. `PositionGenerationModal` — review taux
2. Bouton « Passer en génération Live Pricing »
3. `LivePricingGenerationModal` — activation
4. Badge « Live Pricing actif » sur la transaction
5. Job `process_live_pricing_positions` à 23h UTC

## API

- `POST .../activate-live-pricing/`
- `GET .../live-pricing-status/`

## Job

- `python manage.py process_live_pricing_positions`
- Cron: `POST /api/cron/process-live-pricing/?token=...`

## Garde-fous

- Live actif → bloque `generate-positions` / `save-positions`
- Positions anticipées existantes → bloque activation live

## Structure history

Voir `live_config` dans `position_generation_history` avec `mode: "live_pricing"`.
