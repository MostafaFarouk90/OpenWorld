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
.owg-points-num{order:-1;align-self:flex-start;width:20px;flex:none;height:20px;line-height:20px;text-align:center;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ffe9a0,#d8a830 70%);color:#2a1c00;font-weight:800;box-shadow:0 0 8px #f0c040}
.owg-points{padding:1px 8px;border-radius:9px;background:#d8a830;color:#2a1c00;font-weight:700}
.owg-prompts{display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none}
.owg-prompt{padding:4px 12px;border-radius:4px;background:rgba(0,0,0,.6);color:#f2ead8;font:14px system-ui,sans-serif;white-space:pre-line;text-align:center;transition:opacity .4s linear}
.owg-toasts{display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none}
.owg-toast{padding:4px 12px;border-radius:4px;background:rgba(0,0,0,.65);color:#f2ead8;font:13px system-ui,sans-serif}
.owg-menu{min-width:520px;max-width:90vw;max-height:80vh;overflow:auto;padding:16px;border-radius:8px;background:rgba(20,16,12,.94);border:1px solid #6a5a3a;color:#e8dfc8;font:14px system-ui,sans-serif;pointer-events:auto}
.owg-menu-head{display:flex;align-items:center;gap:16px;margin-bottom:12px}
.owg-menu-title{margin:0;flex:1;font-size:18px}
.owg-btn{padding:3px 10px;border:1px solid #8a7440;border-radius:4px;background:#3a2f1c;color:#f0e4c0;cursor:pointer;font:inherit}
.owg-btn:hover{background:#4d3f24}
.owg-equip-slots{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px}
.owg-equip-slot{display:flex;align-items:center;gap:8px;padding:4px 8px;background:rgba(255,255,255,.05);border-radius:4px}
.owg-slot-name{opacity:.7;min-width:64px}
.owg-slot-item{flex:1}
.owg-item{display:flex;align-items:center;gap:10px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.08)}
.owg-item-name{min-width:200px;font-weight:600}
.owg-item-desc{flex:1;opacity:.75}
.owg-empty{opacity:.6}
.owg-branches{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.owg-branch-title{margin:0 0 6px;font-size:15px;color:#f0d890}
.owg-skill{display:flex;flex-direction:column;gap:2px;padding:6px;margin-bottom:6px;border-radius:4px;background:rgba(255,255,255,.05)}
.owg-skill-learned{border:1px solid #d8a830}
.owg-skill-unavailable{opacity:.45}
.owg-skill-name{font-weight:600}
.owg-skill-meta{font-size:11px;opacity:.7}
.owg-skill-desc{font-size:12px;opacity:.85}
.owg-skill-state{font-size:12px;color:#d8a830}
.owg-scar{display:flex;align-items:center;gap:4px;color:#f0a070;font-weight:700;text-shadow:0 1px 2px #000}
.owg-scar-pulse{animation:owg-pulse .6s ease-out}
@keyframes owg-pulse{0%{transform:scale(1)}40%{transform:scale(1.5)}100%{transform:scale(1)}}
.owg-leap{position:relative;width:34px;height:34px;margin-left:6px;border-radius:6px;background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.3);color:#fff;font:12px system-ui,sans-serif}
.owg-leap-warn{border-color:#f5a84a;box-shadow:0 0 6px #f5a84a}
.owg-leap-ring{position:absolute;inset:0;border-radius:6px}
.owg-leap-glyph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:700}
.owg-boss{display:flex;flex-direction:column;align-items:center;gap:3px;width:480px;max-width:80vw;pointer-events:none;font:14px system-ui,sans-serif;color:#f3ead8;text-shadow:0 1px 2px #000;transition:opacity 1.5s linear}
.owg-boss-active .owg-controls-hint{display:none}
.owg-boss-name{font-weight:700;letter-spacing:.05em}
.owg-boss-bar{position:relative;width:100%;height:14px;background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.25);border-radius:3px;overflow:hidden}
.owg-boss-fill{height:100%;width:0;background:#a8302a;transition:width .12s linear}
.owg-boss-shielded .owg-boss-fill{background:#5a8fc0}
.owg-boss-release .owg-boss-bar{box-shadow:0 0 10px #f0d060;border-color:#f0d060}
.owg-boss-tick{position:absolute;top:0;width:2px;height:100%;background:rgba(255,255,255,.7)}
.owg-boss-pips{display:flex;gap:4px;height:8px}
.owg-boss-pip{width:8px;height:8px;border-radius:50%;border:1px solid #c8b890;background:transparent}
.owg-boss-pip-on{background:#f0d060}
.owg-boss-flag{font-size:11px;color:#f0d060}
.owg-companion{display:flex;flex-direction:column;gap:3px;width:180px;margin-top:4px;pointer-events:none;font:12px system-ui,sans-serif;color:#f3ead8;text-shadow:0 1px 2px #000}
.owg-companion-head{display:flex;align-items:center;gap:6px}
.owg-companion-name{font-weight:600}
.owg-aura-pip{width:8px;height:8px;border-radius:50%;background:#444;border:1px solid #888}
.owg-aura-on{background:#f0d060;border-color:#f0d060;box-shadow:0 0 6px #f0d060}
.owg-companion-bar{height:6px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.18);border-radius:3px;overflow:hidden}
.owg-companion-fill{height:100%;width:0;background:#5aa65a}
.owg-card{max-width:420px;padding:20px 28px;text-align:center;border-radius:8px;background:rgba(20,16,12,.92);border:1px solid #6a5a3a;color:#e8dfc8;font:14px system-ui,sans-serif;pointer-events:none}
.owg-card-title{margin:0 0 8px;font-size:22px;color:#f0d890}
.owg-card-hint{margin-top:10px;font-size:11px;opacity:.6}
.owg-respec{min-width:320px;padding:16px;border-radius:8px;background:rgba(20,16,12,.94);border:1px solid #6a5a3a;color:#e8dfc8;font:14px system-ui,sans-serif;pointer-events:auto}
.owg-respec-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}
.owg-btn[disabled]{opacity:.4;cursor:default}
.owg-respec-warn{color:#f5a84a}
.owg-respec-options{display:flex;flex-direction:column;gap:4px;margin-top:10px}
.owg-respec-option{padding:6px 10px;border:1px solid rgba(255,255,255,.2);border-radius:4px;cursor:pointer}
.owg-respec-option.owg-selected{border-color:#f0d890;background:rgba(240,216,144,.15)}
.owg-stealth{display:flex;flex-direction:column;align-items:center;pointer-events:none}
.owg-eye{position:relative;width:44px;height:22px;border-radius:50% / 100%;border:2px solid #c9c2b0;background:rgba(0,0,0,.55);overflow:hidden}
.owg-eye-lid{position:absolute;inset:0;background:#c9c2b0;transform-origin:top;transition:transform .1s linear}
.owg-eye-pupil{position:absolute;left:50%;top:50%;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:#111}
.owg-eye-calm{border-color:#9aa8a0}
.owg-eye-suspicious{border-color:#e8b84a;box-shadow:0 0 6px #e8b84a}
.owg-eye-alerted{border-color:#d8362c;box-shadow:0 0 8px #d8362c}
.owg-noise{pointer-events:none}
.owg-noise-ring{pointer-events:none;position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);border:2px solid rgba(240,216,144,.45);border-radius:50%;transition:width .1s linear,height .1s linear}
.owg-chase{display:flex;align-items:center;gap:8px;min-width:220px;pointer-events:none;font:13px system-ui,sans-serif;color:#f3ead8;text-shadow:0 1px 2px #000}
.owg-chase-bar{flex:1;height:8px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.18);border-radius:3px;overflow:hidden}
.owg-chase-fill{height:100%;width:0;background:#e0a050}
.owg-chase-red .owg-chase-fill{background:#d8362c}
.owg-chase-red .owg-chase-secs{color:#ff6a5a}
.owg-chase-again .owg-chase-fill{width:100%!important;background:#f0d890}
.owg-chase-again{animation:owg-chase-pulse 1s ease-in-out infinite}
.owg-chase-gap:before{content:"\\00BB\\00A0"}
@keyframes owg-chase-pulse{50%{opacity:.55}}
.owg-mount{width:260px;pointer-events:none}
.owg-bar-mount{height:6px}
.owg-bolts{pointer-events:none;color:#e8d9b5;font-size:12px;text-shadow:0 1px 2px #000}
.owg-bar-mount .owg-bar-fill{background:#c9a063}
.owg-classlabel{display:flex;flex-direction:column;gap:2px;margin-top:4px;pointer-events:none;font:12px system-ui,sans-serif;color:#f3ead8;text-shadow:0 1px 2px #000}
.owg-class-name{font-weight:600}
.owg-gold{display:flex;align-items:center;gap:5px}
.owg-gold-icon{width:10px;height:10px;border-radius:50%;background:#e8c64a;border:1px solid #8a6a10}
.owg-ending{pointer-events:auto;cursor:pointer}
.owg-ending-body{max-height:200px;overflow-y:auto;text-align:left}
.owg-ending-line{margin:4px 0}
@media (prefers-reduced-motion:reduce){.owg-chase-again{animation:none}.owg-eye-lid,.owg-noise-ring{transition:none}}
.interaction-prompt__mercy{color:#f2ead8}
body.owg-burn-scar .interaction-prompt__mercy{color:#f5a84a}
`;
