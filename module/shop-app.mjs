/**
 * ShopApp — Interface de boutique pour les joueurs
 * Foundry VTT v13 — ApplicationV2 + HandlebarsApplicationMixin
 */

import {
  getTotalWealthInCopper, getWealthValues, formatWealth,
  applyModifier, spendWealth, gainWealth,
  gainMerchantPurse, spendMerchantPurse
} from "./wealth.mjs";
import { requestBuy, requestSell } from "./socket.mjs";
import { initGroupCollapse, initItemTooltip } from "./ui-helpers.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const SUBTYPE_LABELS = {
  weapon:     { label: "Armes",        icon: "fa-sword" },
  armor:      { label: "Armures",      icon: "fa-shield-halved" },
  shield:     { label: "Boucliers",    icon: "fa-shield" },
  consumable: { label: "Consommables", icon: "fa-flask" },
  misc:       { label: "Divers",       icon: "fa-bag-shopping" }
};
const SUBTYPE_ORDER = ["weapon", "armor", "shield", "consumable", "misc"];

function _groupBySubtype(items) {
  const grouped = new Map();
  for (const subtype of SUBTYPE_ORDER) {
    const group = items.filter(i => i.subtype === subtype);
    if (group.length === 0) continue;
    const meta = SUBTYPE_LABELS[subtype];
    grouped.set(subtype, { subtype, label: meta.label, icon: meta.icon, items: group });
  }
  for (const item of items) {
    if (!SUBTYPE_ORDER.includes(item.subtype)) {
      if (!grouped.has(item.subtype))
        grouped.set(item.subtype, { subtype: item.subtype, label: item.subtype, icon: "fa-box", items: [] });
      grouped.get(item.subtype).items.push(item);
    }
  }
  return [...grouped.values()];
}

const UNIT_TO_CP = { po: 100, gp: 100, pa: 10, sp: 10, pc: 1, cp: 1 };

function _nativePriceCP(itemData) {
  const val    = itemData.system?.price?.value ?? 0;
  const unit   = (itemData.system?.price?.unit ?? "po").toLowerCase();
  return Math.round(val * (UNIT_TO_CP[unit] ?? 100));
}

function _basePriceCP(itemData) {
  const override = itemData.flags?.["co2-marchand"]?.overridePrice;
  if (override !== undefined && override !== null) return Math.round(override * 100);
  return _nativePriceCP(itemData);
}

function _basePriceCPFromItem(item) {
  const override = item.getFlag?.("co2-marchand", "overridePrice");
  if (override !== undefined && override !== null) return Math.round(override * 100);
  const val  = item.system?.price?.value ?? 0;
  const unit = (item.system?.price?.unit ?? "po").toLowerCase();
  return Math.round(val * (UNIT_TO_CP[unit] ?? 100));
}

export class ShopApp extends HandlebarsApplicationMixin(ApplicationV2) {

  constructor(merchantActor, options = {}) {
    super(options);
    this.merchantActor    = merchantActor;
    this._activeTab       = "buy";
    this._socketItems     = options.socketItems   ?? [];
    this._merchantFlags   = options.merchantFlags ?? {};
    this._collapsedGroups = new Set();
  }

  static DEFAULT_OPTIONS = {
    id: "co2-shop-app-{id}",
    uniqueId: true,
    // "co2-marchand" scope tous nos styles, évite le conflit avec .shop-app de Foundry
    classes: ["co2-marchand", "shop-app-window"],
    window: {
      title: "Boutique",
      icon: "fas fa-shopping-cart",
      resizable: true,
      minimizable: true
    },
    position: { width: 660, height: 600 },
    actions: {
      buyItem:   ShopApp._onBuyItem,
      sellItem:  ShopApp._onSellItem,
      switchTab: ShopApp._onSwitchTab
    }
  };

  static PARTS = {
    main: {
      template: "modules/co2-marchand/templates/shop-app.hbs",
      scrollable: [".co2m-shop-table-wrapper"]
    }
  };

  get title() { return `Boutique — ${this.merchantActor.name}`; }

  get playerActor() {
    if (game.user.character) return game.user.character;
    const controlled = canvas?.tokens?.controlled ?? [];
    if (controlled.length > 0) return controlled[0].actor ?? null;
    const owned = game.actors.filter(a =>
      a.type === "character" &&
      a.getUserLevel(game.user) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
    );
    if (owned.length === 1) return owned[0];
    return null;
  }

  // ── RENDER ──────────────────────────────────────────────────────

  _onRender(context, options) {
    super._onRender?.(context, options);
    initGroupCollapse(this);
    initItemTooltip(this);
  }

  // ── CONTEXT ─────────────────────────────────────────────────────

  async _prepareContext(options) {
    const flags     = this._merchantFlags ?? {};
    const modifier  = flags.modifier  ?? 0;
    const buyback   = flags.buyback   ?? game.settings.get("co2-marchand", "defaultBuyback");
    const showPurse = flags.showPurse ?? false;

    const purseCP = flags.purse ?? 0;
    const merchantPurse = {
      gp: Math.floor(purseCP / 100),
      sp: Math.floor((purseCP % 100) / 10),
      cp: purseCP % 10
    };

    const playerActor = this.playerActor;
    const rawItems    = this._socketItems ?? [];

    const shopFlat = rawItems.map(itemData => {
      const baseCP      = _basePriceCP(itemData);
      const sellPriceCP = applyModifier(baseCP, modifier);
      const qty         = itemData.system?.quantity?.current;

      return {
        id:           itemData._id,
        name:         itemData.name,
        img:          itemData.img,
        subtype:      itemData.system?.subtype ?? "misc",
        description:  itemData.system?.description ?? "",
        quantity:     qty ?? "∞",
        hasStock:     qty === undefined || qty > 0,
        sellPriceCP,
        sellPriceStr: formatWealth(sellPriceCP)
      };
    }).filter(i => i.hasStock);

    const shopGroups = _groupBySubtype(shopFlat);

    const playerFlat = playerActor?.items.map(item => {
      const baseCP         = _basePriceCPFromItem(item);
      const buybackPriceCP = Math.max(0, Math.round(baseCP * buyback / 100));
      return {
        id:              item.id,
        name:            item.name,
        img:             item.img,
        subtype:         item.system?.subtype ?? "misc",
        description:     item.system?.description ?? "",
        quantity:        item.system?.quantity?.current ?? 1,
        buybackPriceCP,
        buybackPriceStr: buybackPriceCP > 0 ? formatWealth(buybackPriceCP) : "Sans valeur",
        hasValue:        buybackPriceCP > 0
      };
    }) ?? [];

    const playerGroups = _groupBySubtype(playerFlat);

    let playerWealth = null;
    if (playerActor) {
      const total = getTotalWealthInCopper(playerActor);
      const wv    = getWealthValues(playerActor);
      playerWealth = { gp: wv.gp, sp: wv.sp, cp: wv.cp, total, str: formatWealth(total) };
    }

    const modifierLabel = modifier === 0 ? null
      : modifier > 0 ? `Majoration : +${modifier}%`
      : `Remise : ${modifier}%`;

    return {
      merchantActor:  this.merchantActor,
      shopGroups,
      playerGroups,
      playerActor,
      playerWealth,
      canInteract:    !!playerActor,
      activeTab:      this._activeTab,
      modifierLabel,
      modifier,
      merchantPurse,
      showPurse
    };
  }

  // ── ACTIONS ─────────────────────────────────────────────────────

  static async _onSwitchTab(event, target) {
    this._activeTab = target.dataset.tab;
    this.render({ force: true });
  }

  static async _onBuyItem(event, target) {
    const row    = target.closest("[data-item-id]");
    const itemId = row?.dataset.itemId;
    const costCP = Number(row?.dataset.costCp ?? 0);
    if (!itemId) return;

    const playerActor = this.playerActor;
    if (!playerActor) return ui.notifications.warn("Aucun personnage trouvé.");

    const itemData = this._socketItems.find(i => i._id === itemId);
    if (!itemData) return ui.notifications.warn("Objet introuvable.");

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Confirmer l'achat" },
      content: `<p>Acheter <strong>${itemData.name}</strong> pour <strong>${formatWealth(costCP)}</strong> ?</p>`,
      rejectClose: false
    });
    if (!confirmed) return;

    if (game.user.isGM) {
      await _executeBuyDirect(this.merchantActor, itemId, costCP, playerActor);
      this.render({ force: true });
    } else {
      requestBuy({ merchantUuid: this.merchantActor.uuid, itemId, costCP, playerActorId: playerActor.id });
    }
  }

  static async _onSellItem(event, target) {
    const row    = target.closest("[data-item-id]");
    const itemId = row?.dataset.itemId;
    const gainCP = Number(row?.dataset.gainCp ?? 0);
    if (!itemId) return;

    const playerActor = this.playerActor;
    if (!playerActor) return;

    const playerItem = playerActor.items.get(itemId);
    if (!playerItem) return;

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Confirmer la vente" },
      content: `<p>Vendre <strong>${playerItem.name}</strong> pour <strong>${formatWealth(gainCP)}</strong> ?</p>`,
      rejectClose: false
    });
    if (!confirmed) return;

    if (game.user.isGM) {
      await _executeSellDirect(this.merchantActor, playerActor, itemId, gainCP);
      this.render({ force: true });
    } else {
      requestSell({ merchantUuid: this.merchantActor.uuid, itemId, gainCP, playerActorId: playerActor.id });
    }
  }
}

// ── EXÉCUTION DIRECTE MJ ────────────────────────────────────────

async function _executeBuyDirect(merchantActor, itemId, costCP, playerActor) {
  const merchantItem = merchantActor.items.get(itemId);
  if (!merchantItem) return;

  const ok = await spendWealth(playerActor, costCP);
  if (!ok) { ui.notifications.error("Fonds insuffisants."); return; }

  await gainMerchantPurse(merchantActor, costCP);
  await playerActor.createEmbeddedDocuments("Item", [merchantItem.toObject()]);

  const flags    = merchantActor.flags?.["co2-marchand"] ?? {};
  const infinite = flags.infinite ?? game.settings.get("co2-marchand", "infiniteStock");
  const qty      = merchantItem.system?.quantity?.current;

  if (!infinite) {
    if (typeof qty === "number") {
      if (qty > 1) await merchantItem.update({ "system.quantity.current": qty - 1 });
      else         await merchantActor.deleteEmbeddedDocuments("Item", [itemId]);
    } else {
      await merchantActor.deleteEmbeddedDocuments("Item", [itemId]);
    }
  }
  ui.notifications.info(`Achat de ${merchantItem.name} réussi !`);
}

async function _executeSellDirect(merchantActor, playerActor, itemId, gainCP) {
  const playerItem = playerActor.items.get(itemId);
  if (!playerItem) return;

  const ok = await spendMerchantPurse(merchantActor, gainCP);
  if (!ok) { ui.notifications.error(`${merchantActor.name} n'a pas assez d'argent.`); return; }

  await gainWealth(playerActor, gainCP);
  await merchantActor.createEmbeddedDocuments("Item", [playerItem.toObject()]);

  const qty = playerItem.system?.quantity?.current;
  if (typeof qty === "number" && qty > 1)
    await playerItem.update({ "system.quantity.current": qty - 1 });
  else
    await playerActor.deleteEmbeddedDocuments("Item", [playerItem.id]);

  ui.notifications.info(`Vente de ${playerItem.name} réussie !`);
}
