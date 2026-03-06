/**
 * co2-marchand — Module marchand pour Foundry VTT v13 + système CO2
 */

import { MerchantSheet } from "./module/merchant-sheet.mjs";
import { ShopApp }       from "./module/shop-app.mjs";
import { registerHooks } from "./module/hooks.mjs";
import { registerSocket } from "./module/socket.mjs";

Hooks.once("init", () => {
  // Paramètres globaux
  game.settings.register("co2-marchand", "defaultMarkup", {
    name: "Majoration par défaut (%)",
    scope: "world", config: true, type: Number, default: 0,
    range: { min: -50, max: 200, step: 5 }
  });
  game.settings.register("co2-marchand", "defaultBuyback", {
    name: "Taux de rachat par défaut (%)",
    scope: "world", config: true, type: Number, default: 50,
    range: { min: 0, max: 100, step: 5 }
  });
  game.settings.register("co2-marchand", "infiniteStock", {
    name: "Stock infini par défaut",
    scope: "world", config: true, type: Boolean, default: false
  });

  registerHooks();
});

Hooks.once("ready", () => {
  registerSocket();

  // API publique
  game.co2marchand = {
    openShop:    (actorOrId) => {
      const actor = typeof actorOrId === "string"
        ? game.actors.get(actorOrId) : actorOrId;
      if (!actor) return;
      if (game.user.isGM) new MerchantSheet(actor).render(true);
      else                new ShopApp(actor).render(true);
    },
    setMerchant: async (actorOrId, value = true) => {
      const actor = typeof actorOrId === "string"
        ? game.actors.get(actorOrId) : actorOrId;
      if (actor) await actor.setFlag("co2-marchand", "isMerchant", value);
    }
  };

  console.log("co2-marchand | Prêt. API disponible via game.co2marchand");
});
