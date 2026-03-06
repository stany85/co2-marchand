/**
 * Hooks Foundry VTT v13 pour co2-marchand
 */

import { MerchantSheet } from "./merchant-sheet.mjs";
import { ShopApp }       from "./shop-app.mjs";

export function isMerchant(actor) {
  return actor?.flags?.["co2-marchand"]?.isMerchant === true;
}

export function registerHooks() {

  // ── TOKEN HUD ──────────────────────────────────────────────────────────────
  Hooks.on("renderTokenHUD", (app, element, context, options) => {
    const actor = app.actor;
    if (!actor || actor.type !== "encounter") return;

    const isAlreadyMerchant = isMerchant(actor);
    const isActive          = actor.getFlag("co2-marchand", "isActive") ?? false;
    const isGM              = game.user.isGM;

    if (!isGM && !isAlreadyMerchant) return;

    const disabled = !isGM && isAlreadyMerchant && !isActive;

    const title = isGM && !isAlreadyMerchant ? "Activer comme marchand"
      : isGM                                 ? `Gérer la boutique (${isActive ? "ouverte ✓" : "fermée"})`
      : isActive                             ? "Ouvrir la boutique"
      :                                        "Boutique fermée";

    const btn = document.createElement("button");
    btn.type            = "button";
    btn.className       = `control-icon co2-marchand-hud${disabled ? " inactive" : ""}`;
    btn.dataset.tooltip = title;
    btn.disabled        = disabled;
    btn.innerHTML       = `<i class="fas fa-store"></i>`;

    if (!disabled) {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        app.close();
        if (isGM && !isAlreadyMerchant) {
          await actor.setFlag("co2-marchand", "isMerchant", true);
          ui.notifications.info(`${actor.name} est maintenant un marchand.`);
          new MerchantSheet(actor).render(true);
        } else if (isGM) {
          new MerchantSheet(actor).render(true);
        } else {
          new ShopApp(actor).render(true);
        }
      });
    }

    const col = element.querySelector(".col.right");
    if (col) col.appendChild(btn);
    else element.appendChild(btn);
  });

  // ── REFRESH EN TEMPS RÉEL ──────────────────────────────────────────────────
  // updateActor : ne rafraîchit que si c'est un vrai changement de données
  // (ignore les changements de flags co2-marchand pour éviter tout effet de bord)
  Hooks.on("updateActor", (actor, changes) => {
    // Ignore si seul le flag co2-marchand a changé (ex: showToPlayers)
    const onlyFlagChanged = Object.keys(changes).length === 1 && changes.flags?.["co2-marchand"];
    if (onlyFlagChanged) return;
    _refreshApps(actor);
  });

  for (const hookName of ["createItem", "deleteItem", "updateItem"]) {
    Hooks.on(hookName, (docOrItem) => {
      const actor = docOrItem.parent ?? docOrItem;
      _refreshApps(actor);
    });
  }
}

function _refreshApps(actor) {
  if (!actor || actor.documentName !== "Actor") return;
  const instances = foundry.applications?.instances ?? {};
  for (const app of Object.values(instances)) {
    if (
      (app.merchantActor?.uuid === actor.uuid || app.actor?.uuid === actor.uuid) &&
      (app instanceof ShopApp || app instanceof MerchantSheet)
    ) app.render();
  }
}
