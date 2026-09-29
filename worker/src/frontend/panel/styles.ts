export const panelStyles = `
:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f8f9fc;
  color: #0a0e1c;
  --bg: #f8f9fc;
  --surface: #ffffff;
  --border: #e5e7eb;
  --muted: #667085;
  --text: #0a0e1c;
  --mint: #70ffaf;
  --mint-strong: #147a4c;
  --blue: #2457d6;
  --red: #b42318;
  --amber: #9a6700;
  --shadow: 0 8px 24px rgba(16, 42, 77, .06);
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; min-width: 320px; background: var(--bg); }
body.drawer-open { overflow: hidden; }
a { color: var(--blue); }
button, input, select { font: inherit; }
button { cursor: pointer; }
button:disabled { cursor: wait; opacity: .65; }
:focus-visible { outline: 3px solid #1f7a56; outline-offset: 2px; }

.app-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 68px;
  padding: 12px 32px;
  background: rgba(255, 255, 255, .96);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(12px);
}
.brand-lockup { display: flex; align-items: center; gap: 12px; }
.brand-mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  color: #073b29;
  background: var(--mint);
  border-radius: 9px;
  font-weight: 800;
}
.brand-name { font-weight: 800; letter-spacing: -.02em; }
.brand-context { color: var(--muted); border-left: 1px solid var(--border); padding-left: 12px; }
.app-nav { display: flex; align-items: center; gap: 4px; }
.app-nav a { padding: 9px 12px; color: #344054; text-decoration: none; border-radius: 6px; font-size: 14px; }
.app-nav a:hover { background: #f1f3f7; color: var(--text); }

.page { max-width: 1320px; margin: 0 auto; padding: 36px 32px 64px; }
.page-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 28px; }
.eyebrow { margin: 0 0 7px; color: var(--mint-strong); font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
h1, h2, h3, p { margin-top: 0; }
h1 { margin-bottom: 8px; font-size: clamp(26px, 3vw, 34px); letter-spacing: -.04em; }
h2 { margin-bottom: 5px; font-size: 18px; letter-spacing: -.02em; }
h3 { margin-bottom: 4px; font-size: 15px; }
.page-heading p, .section-heading p, .muted { color: var(--muted); }
.page-heading p, .section-heading p { margin-bottom: 0; line-height: 1.5; }
.section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; margin-bottom: 20px; }
.section-heading > div:first-child { min-width: 0; }

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  gap: 8px;
  padding: 9px 14px;
  color: #1d2939;
  background: var(--surface);
  border: 1px solid #cbd2dc;
  border-radius: 6px;
  font-weight: 650;
  text-decoration: none;
  white-space: nowrap;
}
.button:hover { background: #f5f6f8; border-color: #98a2b3; }
.button.primary { color: #073b29; background: var(--mint); border-color: #42dc8a; }
.button.primary:hover { background: #58ed9a; }
.button.danger { color: var(--red); border-color: #f0b5ae; }
.button.tertiary { min-height: 36px; padding: 7px 10px; font-size: 13px; }
.button.small { min-height: 34px; padding: 6px 10px; font-size: 13px; }

.kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 24px; }
.kpi { display: flex; min-height: 116px; flex-direction: column; align-items: flex-start; gap: 6px; padding: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; box-shadow: var(--shadow); }
.kpi-label { color: var(--muted); font-size: 13px; font-weight: 650; }
.kpi-value { display: block; margin: 2px 0 0; font-size: 30px; font-weight: 780; line-height: 1.05; letter-spacing: -.05em; }
.kpi-help { color: var(--muted); font-size: 12px; }

.overview-grid { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(290px, 1fr); gap: 16px; align-items: start; }
.surface { min-width: 0; padding: 24px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; box-shadow: var(--shadow); }
.activity-surface { min-height: 100%; }
.full-width { grid-column: 1 / -1; margin-top: 16px; }
.section-link { display: inline-flex; align-items: center; min-height: 36px; font-size: 13px; font-weight: 700; text-decoration: none; }

.data-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.table-wrap { overflow-x: auto; }
.data-table th { padding: 0 12px 11px; color: var(--muted); font-size: 11px; font-weight: 750; letter-spacing: .06em; text-align: left; text-transform: uppercase; }
.data-table td { padding: 15px 12px; border-top: 1px solid var(--border); vertical-align: middle; }
.data-table th:first-child, .data-table td:first-child { padding-left: 0; }
.data-table th:last-child, .data-table td:last-child { padding-right: 0; text-align: right; }
.table-primary { display: block; max-width: 240px; overflow: hidden; font-weight: 720; text-overflow: ellipsis; white-space: nowrap; }
.table-secondary { display: block; max-width: 240px; margin-top: 3px; color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.table-empty { padding: 28px 0; color: var(--muted); text-align: center; }
.nowrap { white-space: nowrap; }

.status-badge, .event-dot { display: inline-flex; align-items: center; gap: 6px; }
.status-badge { padding: 5px 9px; border-radius: 999px; font-size: 12px; font-weight: 700; white-space: nowrap; }
.status-badge::before { width: 7px; height: 7px; border-radius: 50%; background: currentColor; content: ""; }
.status-badge.positive { color: #087443; background: #e9f9ef; }
.status-badge.warning { color: #8a5a00; background: #fff6d8; }
.status-badge.negative { color: #b42318; background: #ffebe8; }
.status-badge.neutral { color: #475467; background: #f0f2f5; }

.action-menu { position: relative; display: inline-block; }
.action-menu summary { display: inline-grid; place-items: center; width: 38px; height: 38px; color: #344054; border: 1px solid transparent; border-radius: 6px; cursor: pointer; font-size: 21px; list-style: none; }
.action-menu summary::-webkit-details-marker { display: none; }
.action-menu summary:hover { background: #f2f4f7; border-color: var(--border); }
.action-menu[open] summary { background: #f2f4f7; }
.menu-items { position: absolute; right: 0; z-index: 4; display: grid; min-width: 176px; padding: 5px; background: white; border: 1px solid var(--border); border-radius: 6px; box-shadow: 0 12px 28px rgba(16, 24, 40, .13); }
.menu-items button { padding: 10px; color: #344054; background: transparent; border: 0; border-radius: 4px; text-align: left; }
.menu-items button:hover { background: #f2f4f7; }
.menu-items button.danger { color: var(--red); }

.activity-list { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
.activity-item { display: grid; grid-template-columns: 12px minmax(0, 1fr); gap: 11px; padding: 13px 0; border-bottom: 1px solid var(--border); }
.activity-item:last-child { border-bottom: 0; }
.event-dot { align-self: start; width: 10px; height: 10px; margin-top: 5px; border: 2px solid currentColor; border-radius: 50%; }
.event-dot.positive { color: #087443; }
.event-dot.warning { color: #a26b00; }
.event-dot.negative { color: var(--red); }
.activity-title { margin-bottom: 4px; font-size: 13px; font-weight: 700; }
.activity-meta { color: var(--muted); font-size: 12px; line-height: 1.45; }
.activity-empty { padding: 20px 0; color: var(--muted); }

.ticket-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
.search-field { flex: 1 1 280px; min-width: 180px; }
.field, .search-field { min-height: 42px; padding: 9px 12px; color: var(--text); background: white; border: 1px solid #cbd2dc; border-radius: 6px; }
.field:focus, .search-field:focus { border-color: #1f7a56; outline: 3px solid rgba(31, 122, 86, .18); }
.ticket-results { color: var(--muted); font-size: 13px; white-space: nowrap; }
.ticket-row.is-hidden { display: none; }
.ticket-title-button { max-width: 260px; padding: 0; color: var(--text); background: transparent; border: 0; font-weight: 720; text-align: left; }
.ticket-title-button:hover { color: var(--blue); text-decoration: underline; }
.ticket-preview { display: block; max-width: 300px; margin-top: 4px; overflow: hidden; color: var(--muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.ticket-detail-button { color: var(--blue); background: transparent; border: 0; font-size: 13px; font-weight: 700; }
.ticket-detail-button:hover { text-decoration: underline; }

.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.toast { position: fixed; right: 24px; bottom: 24px; z-index: 50; max-width: min(380px, calc(100vw - 48px)); padding: 13px 16px; color: white; background: #101828; border-radius: 6px; box-shadow: 0 12px 28px rgba(16, 24, 40, .2); opacity: 0; transform: translateY(10px); transition: opacity .18s ease, transform .18s ease; pointer-events: none; }
.toast.is-visible { opacity: 1; transform: translateY(0); }
.toast.success { background: #087443; }
.toast.error { background: #b42318; }

dialog { width: min(520px, calc(100vw - 32px)); padding: 0; color: var(--text); background: white; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 24px 70px rgba(16, 24, 40, .24); }
dialog::backdrop { background: rgba(10, 14, 28, .48); }
.dialog-content { padding: 24px; }
.dialog-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
.dialog-header h2 { margin-bottom: 4px; }
.dialog-close { display: inline-grid; place-items: center; width: 36px; height: 36px; color: var(--muted); background: transparent; border: 0; border-radius: 6px; font-size: 22px; }
.dialog-close:hover { background: #f2f4f7; }
.form-field { display: grid; gap: 7px; margin-bottom: 18px; }
.form-field label { font-size: 13px; font-weight: 700; }
.form-help { color: var(--muted); font-size: 12px; line-height: 1.45; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 14px; }
.form-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.admin-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.admin-card { min-width: 0; padding: 18px; background: #fbfcfe; border: 1px solid var(--border); border-radius: 6px; }
.admin-card h3 { margin-bottom: 16px; }
.admin-card-wide { grid-column: 1 / -1; }
.admin-list { display: grid; gap: 8px; margin: 18px 0 0; padding: 0; list-style: none; }
.admin-list li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 10px; border-top: 1px solid var(--border); }
.admin-list li span { min-width: 0; display: grid; gap: 3px; }
.admin-list strong, .admin-list small { overflow-wrap: anywhere; }
.admin-list small { color: var(--muted); }
.dialog-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px; }
.code-result { display: none; padding: 16px; background: #f2fff7; border: 1px solid #b5eac9; border-radius: 6px; }
.code-result.is-visible { display: block; }
.generated-code { margin: 8px 0 4px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 20px; font-weight: 800; letter-spacing: .08em; word-break: break-all; }
.equipment-detail { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 0; }
.equipment-detail div { min-width: 0; padding: 12px; background: #f8f9fc; border-radius: 6px; }
.equipment-detail dt { color: var(--muted); font-size: 11px; font-weight: 750; letter-spacing: .06em; text-transform: uppercase; }
.equipment-detail dd { margin: 6px 0 0; overflow-wrap: anywhere; }

.drawer-backdrop { position: fixed; inset: 0; z-index: 20; background: rgba(10, 14, 28, .38); opacity: 0; transition: opacity .18s ease; pointer-events: none; }
.drawer { position: fixed; top: 0; right: 0; z-index: 21; display: flex; flex-direction: column; width: min(500px, 100vw); height: 100dvh; padding: 28px; background: white; box-shadow: -12px 0 32px rgba(16, 24, 40, .15); transform: translateX(100%); transition: transform .2s ease; }
.drawer.is-open { transform: translateX(0); }
.drawer.is-open + .drawer-backdrop { opacity: 1; pointer-events: auto; }
.drawer-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
.drawer-body { flex: 1; overflow: auto; padding: 22px 0; }
.drawer-description { white-space: pre-wrap; line-height: 1.55; }
.detail-list { display: grid; gap: 14px; margin: 22px 0 0; }
.detail-list div { display: grid; gap: 4px; }
.detail-list dt { color: var(--muted); font-size: 12px; font-weight: 700; }
.detail-list dd { margin: 0; overflow-wrap: anywhere; }
.drawer-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 18px; border-top: 1px solid var(--border); }
.drawer-feedback { color: var(--muted); font-size: 12px; }

@media (max-width: 980px) {
  .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .overview-grid { grid-template-columns: 1fr; }
  .activity-surface { min-height: 0; }
  .admin-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 700px) {
  .app-header { align-items: flex-start; flex-direction: column; gap: 10px; padding: 14px 18px; }
  .app-nav { width: 100%; overflow-x: auto; }
  .app-nav a { padding-left: 8px; padding-right: 8px; white-space: nowrap; }
  .page { padding: 26px 18px 48px; }
  .page-heading, .section-heading { align-items: flex-start; flex-direction: column; }
  .kpi-grid { gap: 10px; }
  .kpi { min-height: 102px; padding: 15px; }
  .kpi-value { margin-top: 8px; font-size: 24px; }
  .surface { padding: 18px; }
  .data-table thead { display: none; }
  .data-table, .data-table tbody, .data-table tr, .data-table td { display: block; width: 100%; }
  .data-table tr { padding: 14px 0; border-top: 1px solid var(--border); }
  .data-table td, .data-table td:first-child, .data-table td:last-child { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 5px 0; border: 0; text-align: right; }
  .data-table td::before { flex: 0 0 auto; color: var(--muted); content: attr(data-label); font-size: 11px; font-weight: 750; letter-spacing: .05em; text-align: left; text-transform: uppercase; }
  .data-table td:first-child { display: block; padding-bottom: 10px; text-align: left; }
  .data-table td:first-child::before { display: none; }
  .data-table td:last-child { justify-content: flex-end; padding-top: 10px; }
  .data-table td:last-child::before { display: none; }
  .table-primary, .table-secondary, .ticket-title-button, .ticket-preview { max-width: 62vw; }
  .ticket-toolbar { align-items: stretch; flex-direction: column; }
  .search-field { width: 100%; }
  .ticket-results { align-self: flex-end; }
  .equipment-detail { grid-template-columns: 1fr; }
  .form-grid, .admin-grid { grid-template-columns: 1fr; }
  .admin-card-wide { grid-column: auto; }
  .drawer { padding: 20px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; }
}
@media print {
  @page { margin: 12mm; }
  :root { color-scheme: light; }
  body { background: white; }
  .app-header, .button, .action-menu, .ticket-toolbar, dialog, .drawer, .drawer-backdrop, .toast, .admin-grid { display: none !important; }
  .page { max-width: none; padding: 0; }
  .surface { box-shadow: none; break-inside: avoid; }
  .overview-grid { display: block; }
  .overview-grid > .surface { margin: 0 0 12px; }
  .full-width { margin-top: 0; }
  .data-table { font-size: 10px; }
  .data-table td { padding: 7px 5px; }
}
`;
