/**
 * ui-helpers.mjs
 * Collapse/expand des groupes + tooltip description
 * Utilise les classes préfixées co2m- pour éviter les conflits Foundry.
 */

// ────────────────────────────────────────────────────────────────
// COLLAPSE / EXPAND
// ────────────────────────────────────────────────────────────────

export function initGroupCollapse(app) {
  if (!app._collapsedGroups) app._collapsedGroups = new Set();

  const el = app.element;

  // Restaurer l'état visuel après chaque render
  for (const subtype of app._collapsedGroups) {
    _applyCollapse(el, subtype, true);
  }

  // Attacher les listeners sur les headers cliquables
  el.querySelectorAll(".co2m-group-toggle").forEach(header => {
    if (header.dataset.collapseInited) return;
    header.dataset.collapseInited = "1";

    header.addEventListener("click", () => {
      const subtype   = header.dataset.group;
      const collapsed = app._collapsedGroups.has(subtype);

      if (collapsed) {
        app._collapsedGroups.delete(subtype);
        _applyCollapse(el, subtype, false);
      } else {
        app._collapsedGroups.add(subtype);
        _applyCollapse(el, subtype, true);
      }
    });
  });
}

function _applyCollapse(el, subtype, collapsed) {
  const group   = el.querySelector(`.co2m-group[data-subtype="${subtype}"]`);
  if (!group) return;

  const body    = group.querySelector(".co2m-group-body");
  const chevron = group.querySelector(".co2m-group-chevron");

  if (body)    body.style.display       = collapsed ? "none" : "";
  if (chevron) chevron.style.transform  = collapsed ? "rotate(-90deg)" : "";
  group.classList.toggle("is-collapsed", collapsed);
}

// ────────────────────────────────────────────────────────────────
// TOOLTIP DESCRIPTION
// ────────────────────────────────────────────────────────────────

export function initItemTooltip(app) {
  const el      = app.element;
  const tooltip = el.querySelector(".co2m-tooltip");
  if (!tooltip) return;

  let showTimer = null;

  el.querySelectorAll(".co2m-info-trigger").forEach(trigger => {
    if (trigger.dataset.tooltipInited) return;
    trigger.dataset.tooltipInited = "1";

    trigger.addEventListener("mouseenter", (e) => {
      const name        = trigger.dataset.itemName        ?? "";
      const description = trigger.dataset.itemDescription ?? "";

      const stripped = description.replace(/<[^>]*>/g, "").trim();
      if (!stripped) return;

      showTimer = setTimeout(() => {
        tooltip.innerHTML = `
          <div class="co2m-tooltip-title">${name}</div>
          <div class="co2m-tooltip-desc">${description}</div>
        `;
        _positionTooltip(tooltip, e, el);
        tooltip.style.display = "block";
      }, 280);
    });

    trigger.addEventListener("mousemove", (e) => {
      if (tooltip.style.display === "block") {
        _positionTooltip(tooltip, e, el);
      }
    });

    trigger.addEventListener("mouseleave", () => {
      clearTimeout(showTimer);
      tooltip.style.display = "none";
    });
  });
}

function _positionTooltip(tooltip, mouseEvent, appEl) {
  const appRect = appEl.getBoundingClientRect();
  const MARGIN  = 12;

  let x = mouseEvent.clientX - appRect.left + MARGIN;
  let y = mouseEvent.clientY - appRect.top  + MARGIN;

  tooltip.style.display = "block";
  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;

  if (x + tw > appRect.width  - MARGIN) x = (mouseEvent.clientX - appRect.left) - tw - MARGIN;
  if (y + th > appRect.height - MARGIN) y = (mouseEvent.clientY - appRect.top)  - th - MARGIN;

  tooltip.style.left = `${Math.max(0, x)}px`;
  tooltip.style.top  = `${Math.max(0, y)}px`;
}
