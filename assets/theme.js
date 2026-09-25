// Theme: applied in <head> before first paint so there is no flash.
// Priority: ?theme=light|dark in the URL  >  the viewer's saved choice  >  KPI_CONFIG.DEFAULT_THEME.
// "auto" follows the device / OS setting.
(function () {
  const KEY = "kpi_theme";
  const root = document.documentElement;
  const qs = new URLSearchParams(location.search);
  const fromUrl = qs.get("theme");
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  const def = (window.KPI_CONFIG && window.KPI_CONFIG.DEFAULT_THEME) || "dark";

  function apply(mode) {
    if (mode === "light" || mode === "dark") root.setAttribute("data-theme", mode);
    else root.removeAttribute("data-theme");
  }
  function current() {
    const t = root.getAttribute("data-theme");
    if (t) return t;
    return window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  apply(fromUrl || saved || def);
  if (qs.get("kiosk") === "1") root.classList.add("kiosk");

  window.KPITheme = {
    current,
    set(mode) {
      apply(mode);
      try { localStorage.setItem(KEY, mode); } catch (e) {}
      window.dispatchEvent(new CustomEvent("themechange", { detail: current() }));
    },
    toggle() { this.set(current() === "dark" ? "light" : "dark"); },
  };
})();
