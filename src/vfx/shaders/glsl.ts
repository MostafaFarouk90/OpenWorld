// GLSL snippets for the VFX layer (design 11.1 and 11.6). The actor chunks are injected into a cloned
// MeshStandardMaterial through onBeforeCompile (see ActorMaterials.ts) so lighting and skinning stay
// intact; the shell and ring programs are standalone ShaderMaterials.

/** Small hash-based value noise, result in [0, 1). */
export const FX_NOISE = /* glsl */ `
float fxHash3(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float fxNoise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = fxHash3(i);
  float n100 = fxHash3(i + vec3(1.0, 0.0, 0.0));
  float n010 = fxHash3(i + vec3(0.0, 1.0, 0.0));
  float n110 = fxHash3(i + vec3(1.0, 1.0, 0.0));
  float n001 = fxHash3(i + vec3(0.0, 0.0, 1.0));
  float n101 = fxHash3(i + vec3(1.0, 0.0, 1.0));
  float n011 = fxHash3(i + vec3(0.0, 1.0, 1.0));
  float n111 = fxHash3(i + vec3(1.0, 1.0, 1.0));
  float v = mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
                mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
  return clamp(v, 0.0, 0.9999);
}
float fxNoise2(vec2 p) {
  return fxNoise3(vec3(p, 0.37));
}
`;

/** Vertex side of the actor patch: the object-space position the dissolve noise is sampled at. */
export const ACTOR_VERTEX_DECL = /* glsl */ `
varying vec3 vFxPos;
`;
export const ACTOR_VERTEX_MAIN = /* glsl */ `
  vFxPos = position;
`;

/** Fragment declarations for both effects. */
export const ACTOR_FRAGMENT_DECL = /* glsl */ `
uniform float uTelegraph;
uniform vec3 uTelegraphColor;
uniform float uDissolve;
uniform vec3 uDissolveTint;
uniform float uTime;
varying vec3 vFxPos;
${FX_NOISE}
`;

/** First statement of the fragment main: computes the noise and discards below the threshold. */
export const DISSOLVE_DISCARD = /* glsl */ `
  float fxDissolveNoise = fxNoise3(vFxPos * 3.5 + vec3(0.0, uTime * 0.05, 0.0));
  if (fxDissolveNoise < uDissolve) discard;
`;

/** Emissive edge band of width 0.06 above the threshold. */
export const DISSOLVE_EMISSIVE = /* glsl */ `
  if (uDissolve > 0.0) {
    float fxEdge = 1.0 - smoothstep(0.0, 0.06, fxDissolveNoise - uDissolve);
    totalEmissiveRadiance += uDissolveTint * fxEdge * 2.0;
  }
`;

/** Telegraph wind-up flash, additive on the emissive term. */
export const TELEGRAPH_EMISSIVE = /* glsl */ `
  totalEmissiveRadiance += uTelegraphColor * uTelegraph * 1.5;
`;

/** Fresnel rim glow shell (additive). Uniforms: uColor, uIntensity, uProgress. */
export const FRESNEL_VERTEX = /* glsl */ `
uniform float uProgress;
varying vec3 vFxNormal;
varying vec3 vFxView;
void main() {
  float s = 1.0 + uProgress * 0.2;
  vec4 mv = modelViewMatrix * vec4(position * s, 1.0);
  vFxNormal = normalize(normalMatrix * normal);
  vFxView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;
export const FRESNEL_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uProgress;
varying vec3 vFxNormal;
varying vec3 vFxView;
void main() {
  float rim = pow(1.0 - clamp(abs(dot(normalize(vFxNormal), normalize(vFxView))), 0.0, 1.0), 3.0);
  float fade = 1.0 - clamp(uProgress, 0.0, 1.0);
  float a = rim * uIntensity * fade;
  gl_FragColor = vec4(uColor * a, a);
}
`;

/** Shockwave ring: radius expands with uProgress, a travelling sine bumps the height. */
export const SHOCK_VERTEX = /* glsl */ `
uniform float uProgress;
uniform float uInner;
uniform float uOuter;
uniform float uExpand;
varying float vBand;
varying float vRadial;
void main() {
  float r = length(position.xz);
  vec2 dir = r > 0.0001 ? position.xz / r : vec2(0.0);
  float p = clamp(uProgress, 0.0, 1.0);
  float newR = r * (1.0 + p * uExpand);
  float bump = sin((newR - p * uExpand * uOuter) * 6.0) * 0.12 * (1.0 - p);
  vec3 pos = vec3(dir.x * newR, position.y + bump, dir.y * newR);
  vBand = clamp((r - uInner) / max(uOuter - uInner, 0.0001), 0.0, 1.0);
  vRadial = newR / (uOuter * (1.0 + uExpand));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;
export const SHOCK_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uProgress;
varying float vBand;
varying float vRadial;
void main() {
  float p = clamp(uProgress, 0.0, 1.0);
  float edge = sin(vBand * 3.14159265);
  float a = edge * (1.0 - p) * (1.0 - p) * (1.0 - clamp(vRadial, 0.0, 1.0));
  gl_FragColor = vec4(uColor * a, a);
}
`;

export const ALL_GLSL: Record<string, string> = {
  FX_NOISE,
  ACTOR_VERTEX_DECL,
  ACTOR_VERTEX_MAIN,
  ACTOR_FRAGMENT_DECL,
  DISSOLVE_DISCARD,
  DISSOLVE_EMISSIVE,
  TELEGRAPH_EMISSIVE,
  FRESNEL_VERTEX,
  FRESNEL_FRAGMENT,
  SHOCK_VERTEX,
  SHOCK_FRAGMENT,
};
