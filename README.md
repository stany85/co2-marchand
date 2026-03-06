# co2-marchand — Module Marchand pour Chroniques Oubliées 2

Module **Foundry VTT v13+** compatible avec le système **co2** (Chroniques Oubliées 2, Black Book Éditions).

> Version `1.1.0` — ApplicationV2 · Socket · Drag & Drop · Groupes par sous-type

---

## Fonctionnalités

### Côté MJ
- **Fiche marchand** dédiée (ApplicationV2) : inventaire, prix, paramètres globaux
- **Glisser-déposer** d'objets depuis n'importe quel compendium ou le monde
- Fusion automatique des doublons (incrémente la quantité si l'objet existe déjà)
- **Prix personnalisé** par objet (override du prix natif du système)
- **Modificateur global** de prix (majoration ou remise en %)
- **Taux de rachat** configurable (% du prix de référence)
- **Bourse du marchand** : plafond de liquidités pour les rachats
- **Stock infini** optionnel (les objets achetés ne sont pas retirés)
- Bouton **"Afficher aux joueurs"** : ouvre la boutique sur tous les clients connectés
- Aperçu joueur instantané depuis la fiche MJ

### Côté joueur
- **Interface boutique** en deux onglets : Acheter / Vendre
- Affichage de la richesse du personnage actif
- Confirmation avant chaque transaction
- Mise à jour en temps réel après chaque achat ou vente

### Commun
- **Inventaire groupé par sous-type** : Armes · Armures · Boucliers · Consommables · Divers
- **Collapse / expand** de chaque groupe d'un clic sur son en-tête
- **Tooltip de description** au survol de l'icône d'un objet
- **Bouton HUD token** : accès rapide à la boutique depuis le token sur la scène
- **Messages de chat** tracant toutes les transactions
- Monnaie 3 tiers (PO / PA / PC) avec conversion automatique

---

## Installation

1. Copier le dossier `co2-marchand/` dans `{userData}/Data/modules/`
2. Activer le module dans Foundry : **Paramètres → Modules → CO2 Merchant**

---

## Structure du projet

```
co2-marchand/
├── co2-marchand.mjs          Point d'entrée, paramètres globaux, API publique
├── module.json
├── css/
│   └── co2-marchand.css
├── lang/
│   └── fr.json
├── assets/
│   └── parchemin.webp        Texture de fond
├── templates/
│   ├── merchant-sheet.hbs    Fiche MJ
│   └── shop-app.hbs          Interface joueur
└── module/
    ├── merchant-sheet.mjs    ApplicationV2 — fiche de gestion MJ
    ├── shop-app.mjs          ApplicationV2 — boutique joueur
    ├── socket.mjs            Communication MJ ↔ Joueurs
    ├── hooks.mjs             Hooks Foundry (HUD token, refresh temps réel)
    ├── wealth.mjs            Utilitaires monnaie CO2
    └── ui-helpers.mjs        Collapse groupes + tooltip description
```

---

## Guide d'utilisation

### Créer un marchand (MJ)

1. Créer ou sélectionner un acteur de type **encounter**
2. Cliquer sur l'icône 🏪 dans le **HUD token** de cet acteur
3. La fiche de gestion s'ouvre — glisser des objets depuis le compendium ou le monde
4. Ajuster les prix avec le bouton **✏️** sur chaque objet (optionnel, le prix natif est utilisé par défaut)
5. Configurer les paramètres globaux puis cliquer **Sauvegarder**
6. Cliquer **"Boutique fermée"** pour basculer en **"Boutique ouverte"**
7. Cliquer **"Afficher aux joueurs"** pour ouvrir la fenêtre boutique sur tous les clients

### Utiliser la boutique (joueur)

1. Le MJ ouvre la boutique, ou le joueur clique sur 🏪 dans le HUD token du marchand
2. Onglet **Acheter** : parcourir les objets disponibles, cliquer 🛒 pour acheter
3. Onglet **Vendre** : parcourir son inventaire, cliquer 🤲 pour vendre
4. La richesse du personnage est affichée et mise à jour en temps réel

### Collapse des groupes

Cliquer sur l'en-tête d'un groupe (Armes, Armures, etc.) pour le replier ou le déplier. L'état est conservé pendant toute la session.

### Tooltip de description

Survoler l'icône d'un objet pendant un court instant affiche sa description complète dans une infobulle.

---

## Paramètres globaux (Paramètres → Modules)

| Paramètre | Description | Défaut |
|---|---|---|
| Majoration par défaut | % appliqué au prix de base à la vente | 0 % |
| Taux de rachat par défaut | % du prix de base proposé au joueur qui vend | 50 % |
| Stock infini par défaut | Les achats ne retirent pas les objets de l'inventaire | Non |

Ces valeurs sont les valeurs initiales d'un nouveau marchand. Chaque marchand peut les surcharger depuis sa fiche.

---

## Paramètres par marchand (fiche MJ)

| Champ | Description |
|---|---|
| Modificateur global | Majoration (+) ou remise (−) en % sur tous les prix de vente |
| Taux de rachat | % du prix de référence proposé pour les rachats |
| Bourse | Liquidités du marchand en PO (plafond pour les rachats) |
| Stock infini | Override local du paramètre global |
| Afficher la bourse | Affiche ou non les liquidités du marchand côté joueur |

---

## Structure de la monnaie CO2

```
actor.system.wealth.gp.value  → Pièces d'Or   (1 PO = 10 PA = 100 PC)
actor.system.wealth.sp.value  → Pièces d'Argent
actor.system.wealth.cp.value  → Pièces de Cuivre
```

Les prix des objets sont lus depuis `system.price.value` (en PA par défaut dans CO2) et convertis automatiquement.

---

## API publique (console / macro)

```js
// Marquer un acteur comme marchand
await game.co2marchand.setMerchant("ID_ACTEUR");

// Retirer le statut marchand
await game.co2marchand.setMerchant("ID_ACTEUR", false);

// Ouvrir la boutique d'un acteur (fiche MJ si GM, boutique joueur sinon)
game.co2marchand.openShop("ID_ACTEUR");

// Utiliser un objet Actor directement
game.co2marchand.openShop(game.actors.getName("Bork le Marchand"));
```

---

## Compatibilité

| Logiciel | Version minimale |
|---|---|
| Foundry VTT | v13 |
| Système co2 | v1.5 |
