// G1: the pause menu's look, on top of the HUD's shared card and button styles (src/hud/hudStyles.ts).
export const PAUSE_CSS = `
.owg-card.owg-pause{min-width:380px;max-width:640px;max-height:86vh;overflow-y:auto;pointer-events:auto;text-align:left}
.owg-pause .owg-card-title{text-align:center}
.owg-pause-list{display:flex;flex-direction:column;gap:8px;align-items:stretch;margin:6px auto 0;max-width:260px}
.owg-pause-list .owg-btn{width:100%;padding:8px 12px;font-size:15px}
.owg-pause-head{margin:14px 0 6px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#c9a64a}
.owg-pause-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:3px 0;border-bottom:1px solid rgba(106,90,58,.35)}
.owg-pause-label{flex:1 1 auto}
.owg-pause-ctrl{display:flex;align-items:center;gap:6px;flex:0 0 auto}
.owg-pause-ctrl .owg-btn{min-width:34px}
.owg-pause-value{min-width:34px;text-align:center;font-variant-numeric:tabular-nums}
.owg-pause-controls .owg-pause-ctrl .owg-btn{min-width:64px}
.owg-btn.owg-btn-on{background:#6a5a3a;color:#fff3cf;border-color:#c9a64a}
.owg-pause-note{margin:8px 0;font-size:13px;opacity:.85}
.owg-pause-status{margin-top:10px;min-height:1.2em;color:#f0d890;text-align:center}
.owg-pause-actions{display:flex;gap:8px;justify-content:center;margin-top:14px}
@media (max-width:520px){.owg-card.owg-pause{min-width:0;width:calc(100vw - 32px);padding:16px}}
`;
