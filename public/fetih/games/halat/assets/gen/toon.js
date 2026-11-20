// Shared stylised materials: MeshToonMaterial (3-step soft ramp) + vertex colours + rim light + optional
// team-colour mask. One material instance per (kind, team colour) so every character of a team shares it.
//
// Vertex attributes used:  color (rgb), team (float 0..1). Where team = 1 the final albedo is
// vertexColor * teamColor, so team areas are authored in grey shades (1.0 = main, 0.8 = trim).
import * as THREE from 'three';

let RAMP = null;
/** Soft 4-step ramp (dark side is not black; keeps the cartoon look readable on phones). */
export function toonRamp() {
  if (RAMP) return RAMP;
  const data = new Uint8Array([120, 120, 120, 255, 175, 175, 175, 255, 225, 225, 225, 255, 255, 255, 255, 255]);
  RAMP = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  RAMP.minFilter = RAMP.magFilter = THREE.LinearFilter; // linear = soft band edges
  RAMP.generateMipmaps = false; RAMP.needsUpdate = true;
  return RAMP;
}

const cache = new Map();

/**
 * @param {object} o
 * @param {number|string} [o.team]   team colour (default white = no change)
 * @param {number} [o.rim=0.35]      rim light strength
 * @param {number|string} [o.rimColor=0xffffff]
 * @param {boolean} [o.skinned]      kept for clarity; three detects skinning from the mesh
 * @param {string} [o.kind='char']   cache bucket
 */
export function toonMaterial({ team = 0xffffff, rim = 0.35, rimColor = 0xffffff, kind = 'char', flat = false } = {}) {
  const key = `${kind}|${new THREE.Color(team).getHexString()}|${rim}|${new THREE.Color(rimColor).getHexString()}|${flat}`;
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonRamp() });
  m.flatShading = flat;
  m.name = 'halat-toon-' + kind;
  m.userData.teamColor = new THREE.Color(team);
  m.userData.rim = { value: rim };
  m.userData.rimColor = { value: new THREE.Color(rimColor) };
  m.userData.teamUniform = { value: m.userData.teamColor };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTeam = m.userData.teamUniform;
    sh.uniforms.uRim = m.userData.rim;
    sh.uniforms.uRimColor = m.userData.rimColor;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float team;\nvarying float vTeam;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTeam = team;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTeam; uniform float uRim; uniform vec3 uRimColor; varying float vTeam;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uTeam, vTeam);')
      .replace('#include <opaque_fragment>', `
        float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
        rimF = smoothstep(0.55, 0.95, rimF);
        outgoingLight += uRimColor * rimF * uRim * (0.55 + 0.45 * diffuseColor.rgb);
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'halat-toon';
  cache.set(key, m);
  return m;
}

/** Plain toon material for props without vertex-colour/team needs. */
export function propMaterial(color, opts = {}) {
  return toonMaterial({ ...opts, kind: 'prop-' + new THREE.Color(color).getHexString() });
}

export function disposeMaterials() { for (const m of cache.values()) m.dispose(); cache.clear(); }
