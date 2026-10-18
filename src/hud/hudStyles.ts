/** All HUD widget CSS, class prefix `owg-`. Plugins inject this once into a <style> element. */
export const HUD_CSS = `
.owg-status{display:flex;flex-direction:column;gap:4px;width:260px;pointer-events:none;font:12px/1.2 system-ui,sans-serif;color:#f3ead8}
.owg-bar{position:relative;height:12px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.18);border-radius:3px;overflow:hidden}
.owg-bar-fill{height:100%;width:0;transition:width .12s linear}
.owg-bar-health .owg-bar-fill{background:#b3342d}
.owg-bar-lost{position:absolute;right:0;top:0;height:100%;width:0;background:repeating-linear-gradient(45deg,rgba(0,0,0,.6),rgba(0,0,0,.6) 3px,rgba(60,20,20,.6) 3px,rgba(60,20,20,.6) 6px)}
.owg-bar-stamina .owg-bar-fill{background:#5aa65a}
.owg-bar-ember .owg-bar-fill{background:#f08a2c}
.owg-bar-burn{height:8px}
.owg-burn-warm .owg-bar-fill{background:#e0a050}
.owg-burn-blaze .owg-bar-fill{background:#e8601c}
.owg-burn-cinder .owg-bar-fill{background:#8a1f1f;box-shadow:0 0 6px #ff4020}
.owg-bar-xp{height:5px}
.owg-bar-xp .owg-bar-fill{background:#6aa0e0}
.owg-bar-xp .owg-bar-text{position:absolute;right:2px;top:-1px;font-size:9px}
.owg-bar-text{position:absolute;left:4px;top:-1px;font-size:10px;text-shadow:0 1px 2px #000}
.owg-buffs{display:flex;gap:6px;pointer-events:none}
.owg-buff{position:relative;width:34px;height:34px;border-radius:50%;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.25)}
.owg-buff-ring{position:absolute;inset:0;border-radius:50%;opacity:.55}
.owg-buff-time{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:11px system-ui,sans-serif;color:#fff}
.owg-lockon-layer{position:fixed;inset:0;pointer-events:none}
.owg-lockon{position:absolute;width:36px;height:36px;border:2px solid #f0d060;border-radius:50%;box-shadow:0 0 8px rgba(240,208,96,.7)}
.owg-lockon-arrow{width:0;height:0;border:none;border-radius:0;box-shadow:none;border-left:16px solid #f0d060;border-top:9px solid transparent;border-bottom:9px solid transparent}
.owg-quests{display:flex;flex-direction:column;gap:8px;max-width:280px;pointer-events:none;font:13px/1.3 system-ui,sans-serif;color:#f3ead8;text-shadow:0 1px 2px #000}
.owg-quest-title{font-weight:600;color:#f0d890}
.owg-objective{padding-left:10px}
.owg-objective.owg-done{text-decoration:line-through;opacity:.6}
.owg-objective.owg-optional{font-style:italic}
.owg-abilities{display:flex;gap:6px;pointer-events:none}
.owg-slot{position:relative;width:48px;height:48px;border-radius:6px;background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.3);color:#fff;font:12px system-ui,sans-serif}
.owg-slot-empty{opacity:.35}
.owg-slot-dim{opacity:.55;filter:grayscale(.6)}
.owg-slot-ring{position:absolute;inset:0;border-radius:6px}
.owg-slot-glyph{position:absolute;left:3px;bottom:2px;font-weight:700}
.owg-slot-cost{position:absolute;right:3px;top:2px;font-size:10px;color:#f5a84a}
.owg-shake{animation:owg-shake .3s linear}
@keyframes owg-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-4px)}40%{transform:translateX(4px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}
.owg-nextunlock{display:flex;align-items:center;gap:8px;pointer-events:none;font:12px system-ui,sans-serif;color:#d8d0c0;text-shadow:0 1px 2px #000}
.owg-points{padding:1px 8px;border-radius:9px;background:#d8a830;color:#2a1c00;font-weight:700}
`;
