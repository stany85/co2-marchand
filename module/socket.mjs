/**
 * Gestion de la communication MJ ↔ Joueurs pour co2-marchand
 */

import {
  getTotalWealthInCopper, spendWealth, gainWealth, formatWealth,
  getMerchantPurse, spendMerchantPurse, gainMerchantPurse
} from "./wealth.mjs";

const SOCKET_NAME = "module.co2-marchand";

export function registerSocket() {
  game.socket.on(SOCKET_NAME, (data) => _handleSocketData(data));
}

// ────────────────────────────────────────────────────────────────
// DISPATCH
// ────────────────────────────────────────────────────────────────

function _handleSocketData(data) {
  switch (data.action) {
    case "openShop":        if (!game.user.isGM) _onOpenShop(data); break;
    case "closeShop":       if (!game.user.isGM) _onCloseShop(data); break;
    case "requestBuy":      if (game.user.isGM)  _onRequestBuy(data); break;
    case "requestSell":     if (game.user.isGM)  _onRequestSell(data); break;
    case "transactionResult":
      if (data.userId === game.user.id) _onTransactionResult(data);
      break;
  }
}

// ────────────────────────────────────────────────────────────────
// CÔTÉ JOUEUR : ouverture / fermeture
// ────────────────────────────────────────────────────────────────

function _onOpenShop(data) {
  fromUuid(data.actorUuid).then(actor => {
    if (!actor) return;
    import("./shop-app.mjs").then(({ ShopApp }) => {

      // Fermer toutes les anciennes fenêtres
      const windows = ui.windows ?? {};
      for (const app of Object.values(windows)) {
        if (app instanceof ShopApp) {
          app.close({ force: true });
          delete ui.windows[app.appId];
        }
      }

      // Ouvrir une nouvelle fenêtre propre
      new ShopApp(actor, {
        socketItems: data.items ?? null,
        merchantFlags: data.flags ?? {}
      }).render(true);
    });
  });
}

function _onCloseShop(data) {
  import("./shop-app.mjs").then(({ ShopApp }) => {
    const windows = ui.windows ?? {};
    for (const app of Object.values(windows)) {
      if (app instanceof ShopApp && app.merchantActor?.uuid === data.actorUuid) {
        app.close({ force: true });
        delete ui.windows[app.appId];
      }
    }
  });
}

// ────────────────────────────────────────────────────────────────
// CÔTÉ MJ : ACHAT
// ────────────────────────────────────────────────────────────────

async function _onRequestBuy({ merchantUuid, itemId, costCP, playerActorId, userId }) {
  const merchantActor = await fromUuid(merchantUuid);
  const playerActor   = game.actors.get(playerActorId);

  if (!merchantActor || !playerActor)
    return _sendResult(userId, false, "Acteur introuvable.", merchantUuid);

  const merchantItem = merchantActor.items.get(itemId);
  if (!merchantItem)
    return _sendResult(userId, false, "Objet introuvable dans la boutique.", merchantUuid);

  const totalCP = getTotalWealthInCopper(playerActor);
  if (totalCP < costCP)
    return _sendResult(userId, false,
      `Fonds insuffisants ! Vous avez ${formatWealth(totalCP)}, l'objet coûte ${formatWealth(costCP)}.`,
      merchantUuid
    );

  // Le joueur paie
  const ok = await spendWealth(playerActor, costCP);
  if (!ok) return _sendResult(userId, false, "Transaction échouée.", merchantUuid);

  // Le marchand gagne l'argent
  await gainMerchantPurse(merchantActor, costCP);

  // Le joueur reçoit l'objet
  await playerActor.createEmbeddedDocuments("Item", [merchantItem.toObject()]);

  // Gestion du stock
  const flags    = merchantActor.flags?.["co2-marchand"] ?? {};
  const infinite = flags.infinite ?? game.settings.get("co2-marchand", "infiniteStock");

  const qty = merchantItem.system?.quantity?.current;
  if (!infinite) {
    if (typeof qty === "number") {
      if (qty > 1) await merchantItem.update({ "system.quantity.current": qty - 1 });
      else         await merchantActor.deleteEmbeddedDocuments("Item", [itemId]);
    } else {
      await merchantActor.deleteEmbeddedDocuments("Item", [itemId]);
    }
  }

  await ChatMessage.create({
    content: `<div class="co2-marchand chat-purchase">
      <strong>${playerActor.name}</strong> achète <em>${merchantItem.name}</em>
      à <strong>${merchantActor.name}</strong>
      pour <strong>${formatWealth(costCP)}</strong>.
    </div>`,
    speaker: ChatMessage.getSpeaker({ actor: playerActor })
  });

  _sendResult(userId, true, `Achat de ${merchantItem.name} réussi !`, merchantUuid);
}

// ────────────────────────────────────────────────────────────────
// CÔTÉ MJ : VENTE
// ────────────────────────────────────────────────────────────────

async function _onRequestSell({ merchantUuid, itemId, gainCP, playerActorId, userId }) {
  const merchantActor = await fromUuid(merchantUuid);
  const playerActor   = game.actors.get(playerActorId);

  if (!merchantActor || !playerActor)
    return _sendResult(userId, false, "Acteur introuvable.", merchantUuid);

  const playerItem = playerActor.items.get(itemId);
  if (!playerItem)
    return _sendResult(userId, false, "Objet introuvable dans votre inventaire.", merchantUuid);

  const purse = getMerchantPurse(merchantActor);
  if (purse < gainCP)
    return _sendResult(userId, false,
      `${merchantActor.name} n'a pas assez d'argent pour racheter cet objet.`,
      merchantUuid
    );

  // Le marchand paie
  const ok = await spendMerchantPurse(merchantActor, gainCP);
  if (!ok)
    return _sendResult(userId, false,
      `${merchantActor.name} n'a pas assez d'argent pour racheter cet objet.`,
      merchantUuid
    );

  // Le joueur gagne l'argent
  await gainWealth(playerActor, gainCP);

  // Le marchand reçoit l'objet
  await merchantActor.createEmbeddedDocuments("Item", [playerItem.toObject()]);

  // Gestion quantité joueur
  const qty = playerItem.system?.quantity?.current;
  if (typeof qty === "number" && qty > 1)
    await playerItem.update({ "system.quantity.current": qty - 1 });
  else
    await playerActor.deleteEmbeddedDocuments("Item", [playerItem.id]);

  await ChatMessage.create({
    content: `<div class="co2-marchand chat-purchase">
      <strong>${playerActor.name}</strong> vend <em>${playerItem.name}</em>
      à <strong>${merchantActor.name}</strong>
      pour <strong>${formatWealth(gainCP)}</strong>.
    </div>`,
    speaker: ChatMessage.getSpeaker({ actor: playerActor })
  });

  _sendResult(userId, true, `Vente de ${playerItem.name} réussie !`, merchantUuid);
}

// ────────────────────────────────────────────────────────────────
// CÔTÉ JOUEUR : réception résultat
// ────────────────────────────────────────────────────────────────

function _onTransactionResult({ success, message, merchantUuid, items, flags }) {
  if (success) ui.notifications.info(message);
  else         ui.notifications.warn(message);

  import("./shop-app.mjs").then(({ ShopApp }) => {
    const windows = ui.windows ?? {};

    // 🔥 Fermer toutes les anciennes fenêtres ShopApp
    for (const app of Object.values(windows)) {
      if (app instanceof ShopApp) {
        app.close({ force: true });
        delete ui.windows[app.appId];
      }
    }

    // 🔥 Ouvrir une seule fenêtre propre
    fromUuid(merchantUuid).then(actor => {
      new ShopApp(actor, {
        socketItems: items,
        merchantFlags: flags
      }).render(true);
    });
  });

  // Rafraîchir la fiche MJ
  import("./merchant-sheet.mjs").then(({ MerchantSheet }) => {
    const windows = ui.windows ?? {};
    for (const app of Object.values(windows)) {
      if (app instanceof MerchantSheet && app.actor?.uuid === merchantUuid) {
        app.render({ force: true });
      }
    }
  });
}

// ────────────────────────────────────────────────────────────────
// ENVOI DU RÉSULTAT AU JOUEUR
// ────────────────────────────────────────────────────────────────

function _sendResult(userId, success, message, merchantUuid) {
  const actor = game.actors.get(merchantUuid) || fromUuidSync(merchantUuid);

  const items = actor.items.map(i => i.toObject());
  const flags = actor.flags?.["co2-marchand"] ?? {};

  game.socket.emit(SOCKET_NAME, {
    action: "transactionResult",
    userId,
    success,
    message,
    merchantUuid,
    items,
    flags
  });
}

// ────────────────────────────────────────────────────────────────
// ÉMETTEURS PUBLICS
// ────────────────────────────────────────────────────────────────

export async function broadcastOpenShop(actor) {
  const items = actor.items.map(i => i.toObject());
  const flags = actor.flags?.["co2-marchand"] ?? {};
  game.socket.emit(SOCKET_NAME, { action: "openShop", actorUuid: actor.uuid, items, flags });
}

export async function broadcastCloseShop(actor) {
  game.socket.emit(SOCKET_NAME, { action: "closeShop", actorUuid: actor.uuid });
}

export function requestBuy({ merchantUuid, itemId, costCP, playerActorId }) {
  game.socket.emit(SOCKET_NAME, {
    action: "requestBuy",
    merchantUuid, itemId, costCP, playerActorId,
    userId: game.user.id
  });
}

export function requestSell({ merchantUuid, itemId, gainCP, playerActorId }) {
  game.socket.emit(SOCKET_NAME, {
    action: "requestSell",
    merchantUuid, itemId, gainCP, playerActorId,
    userId: game.user.id
  });
}
