/**
 * MerchantSheet — Version ApplicationV2 (Foundry V13+)
 * Compatible COF2 + flags isMerchant / isActive
 */

import { broadcastOpenShop, broadcastCloseShop } from "./socket.mjs";
import {
  getItemNativePriceInCopper, getItemPriceInCopper,
  applyModifier, formatWealth
} from "./wealth.mjs";
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

export class MerchantSheet extends HandlebarsApplicationMixin(ApplicationV2) {

  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    this._collapsedGroups = new Set();
  }

  static DEFAULT_OPTIONS = {
    id: "co2-marchand-sheet-{id}",
    uniqueId: true,
    // "co2-marchand" est la classe CSS racine qui scope tous nos styles
    classes: ["co2-marchand", "merchant-sheet"],
    window: {
      title: "Marchand",
      icon: "fas fa-store",
      resizable: true,
      minimizable: true
    },
    position: { width: 720, height: 660 },
    actions: {
      openShop:     MerchantSheet._onOpenShop,
      showPlayers:  MerchantSheet._onShowPlayers,
      toggleActive: MerchantSheet._onToggleActive,
      saveSettings: MerchantSheet._onSaveSettings,
      editPrice:    MerchantSheet._onEditPrice,
      removeItem:   MerchantSheet._onRemoveItem
    }
  };

  static PARTS = {
    main: {
      template: "modules/co2-marchand/templates/merchant-sheet.hbs",
      scrollable: [".co2m-inventory-body"]
    }
  };

  // ── RENDER ──────────────────────────────────────────────────────

  _onRender(context, options) {
    super._onRender?.(context, options);
    initGroupCollapse(this);
    initItemTooltip(this);
    this._initDragDrop();
  }

  _initDragDrop() {
    const zone = this.element.querySelector(".co2m-inventory-body");
    if (!zone || zone.dataset.dropInited) return;
    zone.dataset.dropInited = "1";

    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      zone.classList.add("drag-over");
    });

    zone.addEventListener("dragleave", (e) => {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove("drag-over");
    });

    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("drag-over");
      this._onDrop(e);
    });
  }

  async _onDrop(event) {
    let data;
    try { data = JSON.parse(event.dataTransfer.getData("text/plain")); }
    catch { return; }

    if (data.type !== "Item") return;

    let item;
    try { item = await fromUuid(data.uuid); }
    catch { return; }
    if (!item) return;

    const slug     = item.system?.slug;
    const existing = this.actor.items.find(i =>
      (slug && i.system?.slug === slug) || i.name === item.name
    );

    if (existing) {
      const qty = existing.system?.quantity?.current ?? 1;
      await existing.update({ "system.quantity.current": qty + 1 });
      ui.notifications.info(`${item.name} : quantité portée à ${qty + 1}.`);
    } else {
      const itemData = item.toObject();
      if (itemData.system?.quantity?.current !== undefined) itemData.system.quantity.current = 1;
      await this.actor.createEmbeddedDocuments("Item", [itemData]);
      ui.notifications.info(`${item.name} ajouté à l'inventaire.`);
    }
  }

  // ── ACTIONS ─────────────────────────────────────────────────────

  static async _onOpenShop(event, target) {
    broadcastOpenShop(this.actor);
    ui.notifications.info("Boutique affichée aux joueurs.");
  }

  static async _onShowPlayers(event, target) {
    broadcastOpenShop(this.actor);
    ui.notifications.info("Boutique affichée aux joueurs.");
  }

  static async _onToggleActive(event, target) {
    const current = this.actor.getFlag("co2-marchand", "isActive") ?? false;
    await this.actor.setFlag("co2-marchand", "isActive", !current);
    this.render({ force: true });
  }

  static async _onSaveSettings(event, target) {
    const form = target.closest("form");
    const fd   = new FormData(form);

    await this.actor.update({
      "flags.co2-marchand.modifier":  Number(fd.get("modifier")) || 0,
      "flags.co2-marchand.buyback":   Number(fd.get("buyback"))  || 0,
      "flags.co2-marchand.infinite":  fd.get("infinite")  === "on",
      "flags.co2-marchand.purse":     Math.round((Number(fd.get("purse")) || 0) * 100),
      "flags.co2-marchand.showPurse": fd.get("showPurse") === "on"
    });

    ui.notifications.info("Paramètres sauvegardés.");
    this.render({ force: true });
  }

  static async _onEditPrice(event, target) {
    const row    = target.closest("[data-item-id]");
    const itemId = row?.dataset.itemId;
    if (!itemId) return;

    const item = this.actor.items.get(itemId);
    if (!item) return;

    const current = item.getFlag("co2-marchand", "overridePrice") ?? "";

    const newPrice = await Dialog.prompt({
      title: "Modifier le prix de référence",
      content: `<p>Prix personnalisé (en PO) :</p>
                <input type="number" step="0.01" value="${current}" id="override-price">`,
      label: "Valider",
      callback: html => html.find("#override-price").val()
    });

    if (newPrice !== null) {
      await item.setFlag("co2-marchand", "overridePrice", Number(newPrice));
      this.render({ force: true });
    }
  }

  static async _onRemoveItem(event, target) {
    const row    = target.closest("[data-item-id]");
    const itemId = row?.dataset.itemId;
    if (!itemId) return;

    await this.actor.deleteEmbeddedDocuments("Item", [itemId]);
    this.render({ force: true });
  }

  // ── CONTEXT ─────────────────────────────────────────────────────

  async _prepareContext(options) {
    const flags    = this.actor.flags["co2-marchand"] ?? {};
    const purse    = flags.purse    ?? 0;
    const modifier = flags.modifier ?? 0;
    const buyback  = flags.buyback  ?? game.settings.get("co2-marchand", "defaultBuyback");

    const allItems = this.actor.items.map(i => {
      const nativeCP = getItemNativePriceInCopper(i);
      const baseCP   = getItemPriceInCopper(i);
      const sellCP   = applyModifier(baseCP, modifier);
      const buyCP    = Math.max(0, Math.round(baseCP * buyback / 100));

      return {
        id:             i.id,
        name:           i.name,
        img:            i.img,
        subtype:        i.system?.subtype ?? "misc",
        description:    i.system?.description ?? "",
        quantity:       i.system?.quantity?.current ?? 1,
        nativePriceStr: formatWealth(nativeCP),
        basePriceStr:   formatWealth(baseCP),
        finalSellStr:   formatWealth(sellCP),
        finalBuyStr:    formatWealth(buyCP),
        hasOverride:    i.getFlag("co2-marchand", "overridePrice") != null
      };
    });

    const grouped = new Map();
    for (const subtype of SUBTYPE_ORDER) {
      const items = allItems.filter(i => i.subtype === subtype);
      if (items.length === 0) continue;
      const meta = SUBTYPE_LABELS[subtype];
      grouped.set(subtype, { subtype, label: meta.label, icon: meta.icon, items });
    }
    for (const item of allItems) {
      if (!SUBTYPE_ORDER.includes(item.subtype)) {
        if (!grouped.has(item.subtype))
          grouped.set(item.subtype, { subtype: item.subtype, label: item.subtype, icon: "fa-box", items: [] });
        grouped.get(item.subtype).items.push(item);
      }
    }

    return {
      actor:           this.actor,
      isActive:        flags.isActive  ?? false,
      modifier,
      buyback,
      infinite:        flags.infinite  ?? false,
      showPurse:       flags.showPurse ?? false,
      purseGP:         purse / 100,
      inventoryGroups: [...grouped.values()],
      itemCount:       allItems.length
    };
  }
}

Hooks.once("init", () => {
  Actors.registerSheet("co2-marchand", MerchantSheet, { types: ["npc"], makeDefault: false });
});

Hooks.on("renderActorSheet", (app, html, data) => {
  const actor = app.actor;
  if (!actor) return;
  if (!actor.getFlag("co2-marchand", "isMerchant")) return;
  if (!(app instanceof MerchantSheet)) {
    actor.sheet.close();
    new MerchantSheet(actor).render(true);
  }
});
