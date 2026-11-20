# Halat Çekme: procedural models and animations (`assets/gen/`)

Everything here is generated in three.js at load time: no model files. Import with the page's import map
(`"three"` must resolve to `three.module.js`):

```js
import * as gen from './assets/gen/index.js';
const p = gen.createPuller({ look: 'ayse', teamColor: 0xe63946, ropeSide: 'R' });
scene.add(p.object3D);
const mixer = new THREE.AnimationMixer(p.object3D);
mixer.clipAction(p.clips.pull).play();
p.setExpression('determined');
// each frame: mixer.update(dt); then (optional, pull clips only) p.gripTo(ropeLocalY);
```

## Conventions

- Units: metres. +Y up, models **face +Z**, the character's left is +X, feet / wheels on `y = 0`.
- Height: every puller declares bounds of exactly **1.75** tall (`mesh.boundingBox` is fixed), so
  `Box3.setFromObject()` (as in `js/models.js`) gives the same scale for every look and all hands meet the same
  rope line. Strongman declares 1.72, giant 2.0, tractor 3.2 long.
- One `SkinnedMesh` per model = **one draw call**. Geometry is cached per (kind, look) and shared by all
  instances; clips are cached per (kind, rope side) and shared. Materials are shared per team colour
  (`toonMaterial`, a `MeshToonMaterial` with vertex colours, a soft 4-step ramp, a rim light and a team mask).
- Team colour: vertices with the `team` attribute (shirt, sleeves, headband, cap, armbands, wristbands, belt,
  tractor body) are multiplied by the material's team colour; `setTeamColor(c)` swaps to the shared material
  of that colour (no allocation after the first use of a colour).

## Factories (all in `index.js`)

| factory | returns | triangles | draw calls |
|---|---|---|---|
| `createPuller({ look, teamColor, seed, ropeSide, expression })` | model | 6.1k-7.3k (8 looks) | 1 |
| `createStrongman({ teamColor, ropeSide })` (Pehlivan: oiled wrestler, kispet, team belt/armbands/headband) | model | 7.0k | 1 |
| `createGiant({ teamColor, ropeSide })` (Dev: slate-blue skin, white wild hair and beard, team tunic) | model | 6.6k | 1 |
| `createTractor({ teamColor })` | model | 9.4k | 1 |
| `createArena({ teamColors, visual, title })` | arena (see below) | props 57k + crowds 52k | 12 |
| `createRope({ handY })` | rope (drop-in for js/rope.js) | 1.6k | 2 |
| `createCrowd({ visual, perSide })` | team crowds (drop-in for js/crowd.js) | ~240 per figure | 1 |

`look` = id string (`ahmet, ayse, mehmet, zeynep, can, elif, dede, selin`), index, or a look object
(see `pullerLooks` in `character.js`); default = `seed % 8`.

A model is:

```
{ kind, look, object3D, mesh, skeleton, bones,
  clips,            // { name: THREE.AnimationClip } for the current rope side
  clipsR, clipsL,   // both clip sets (rope on the right / left of the body)
  clipInfo,         // { name: { loop, expression, duration } }
  attach,           // Object3Ds on bones (read world positions after mixer.update)
  grip,             // { x, y, axis: '+z', height } rope line in model units for the current side
  height, triangles, mixerHints: { loopOnce: ['fall'], crossFade, expressions },
  setTeamColor(c), setExpression(name), setRopeSide('L'|'R'), gripTo(y, x?), clone(opts), dispose() }
```

### Skeleton

`root > hips > spine > chest > neck > head`, `chest > shoulderL/R > upperArmL/R > lowerArmL/R > handL/R > fingersL/R`,
`hips > upperLegL/R > lowerLegL/R > footL/R`, face bones on `head` (`eyeL/R, lidL/R, browL/R, mouthSmile,
mouthOpen, mouthGrit`) and secondary bones `hairTip` (ponytail, pigtails, long hair, beard tip) and
`bandTail` (headband knot tails). Limbs are rounded capsules bound rigidly to their bone with ball ends that
coincide at the joint (elbows and knees never collapse); torso and neck are smooth lofts with blended
hips/spine/chest/neck/shoulder weights. All bind rotations are identity.

### Clips (`THREE.AnimationClip`, baked at 30 fps from code poses: FK + IK, eased, with overlap)

| clip | puller | strongman | giant | loop | expression hint |
|---|---|---|---|---|---|
| `idle` | 3.2 s | 3.2 | 3.2 | yes | neutral |
| `run` | 0.6 | 0.6 | 0.6 | yes | determined |
| `pull` | 1.2 | 1.38 | 1.98 | yes | determined |
| `pull_hard` | 0.8 | 0.92 | 1.32 | yes | strain |
| `pull_slip` | 0.9 | 1.04 | 1.49 | yes | worried |
| `cheer` | 0.75 | 0.75 | 0.75 | yes | happy |
| `fall` | 1.0 | 1.0 | 1.0 | **once** (clamp) | shock |
| `sit_dazed` | 2.4 | 2.4 | 2.4 | yes | dazed |
| `flex` | | 1.8 | 1.8 | yes | happy |
| `stomp` | | | 1.4 | yes (slam at phase 0.58) | strain |

- `pull`: anticipation lean-in, explosive heave (hips drop back, knees drive, spine and head follow 0.05 / 0.11
  of a cycle later), short hold, slow recovery. Feet stay planted (2-bone leg IK); both fists stay closed on the
  rope line while the hands travel ~0.3 m along it with the body.
- `pull_hard`: deeper, faster, trembling, chin tucked. `pull_slip`: stutter-skidding feet toward the pit,
  shoulders yanked forward on a jerk, arms locked. `fall`: forward tumble in place (the game flies and spins
  the figure; root motion is small). `sit_dazed`: sitting with the butt at `y ≈ 0` (put the origin at the mud
  surface), leaning back on the hands, head wobbling.
- Face bones are never keyed: call `setExpression()` freely while any clip plays.

### Expressions

`neutral, determined, strain (>< eyes, gritted teeth), happy / joy (^^ eyes, open grin), worried, shock (wide
eyes, O mouth), dazed (uneven eyes), sad`. Unknown names fall back to neutral. All names used by
`js/models.js` (`EXPRESSION_FOR`) exist.

### Rope grip and side

- `GRIP = { x: -0.24, y: 0.62 }` (`gen.GRIP`, `gen.ROPE_Y = 0.62`): in every pull clip both fists sit on the line
  `x = grip.x, y = grip.y` running along local Z (fist centres within 1-2 cm). Default clips hold the rope on the
  character's **right** side; `ropeSide: 'L'` / `setRopeSide('L')` / `clipsL` is the mirrored set (`grip.x = +0.24`).
- Strongman / giant grips are expressed in their own model units so that at the game's default scales
  (1.38 and 3.0, after the 1.75 normalisation) their fists land on the same world rope height `ROPE_Y`:
  `gen.gripFor('strongman')`, `gen.gripFor('giant')`.
- `model.gripTo(y, x = model.grip.x)`: optional runtime arm IK (no allocations) that bends both arms after
  `mixer.update()` so the fists land exactly on a rope at model-local height `y` (use it when the rope sags or
  the figure is scaled: `y = (ropeWorldY - figureY) / scale`).

### Attach points (`model.attach`)

Characters: `handL`, `handR` (fist centres), `head` (top of head: name tags, crowns, stars), `face`, `chest`,
`hips`, `footL`, `footR`. Tractor: `hitch` (rope ring at the rear), `exhaust` (puff anchor at the stack tip),
`seat`, `wheelRL/RR/FL/FR` (bones).

### Tractor

Faces +Z (drives forward), 3.1 long x 2.0 wide x 2.42 tall, rear wheels r = 0.72, front r = 0.36. Clips:
`idle` (engine shake, stack cap flutter), `drive` (rear wheels 1 turn / front 2 turns per 1.6 s, bounce),
`pull` (wheels spin faster, nose lifts, heavy shake). Hitch at `(0, 0.56, -1.52)`, exhaust tip at
`(0.3, 2.18, 0.42)`.

## Integration with `js/models.js` (what has to change)

The adapter works as-is (factories, `clips` by name, `setTeamColor`, `setExpression`, `dispose`, height
normalisation). To get hands exactly on the rope:

1. **Rope height**: `scene.js` sets `rope.handY` to 0.98 while playing; use `gen.ROPE_Y` (0.62) when the
   generators are active (the generated pullers are cartoon-proportioned; 0.98 is head height when leaning back).
2. **Lateral offset**: slots are at `z = ±0.36` (`scene.js _slotPos`); use `±0.24 * scale` (`|grip.x|`), or keep
   0.36 and pass `x` to `gripTo`.
3. **Rope side per slot**: team 1 faces +x, so a puller at `z > 0` has the rope on its left. In
   `GenFigures.draw`: `const side = (fig.team === 1) === (fig.z > 0) ? 'L' : 'R'`; when it differs from the
   instance's side call `inst.model.setRopeSide(side)`, rebuild `inst.clips` from `inst.model.clips`,
   `inst.mixer.stopAllAction(); inst.actions.clear(); inst.curName = ''` (rare: only when a figure changes slot).
4. **Grip fix-up** (optional): after `inst.mixer.update(dt)` in pull modes:
   `inst.model.gripTo((fig.ropeY - fig.y) / k)` where `k` is the applied scale.
5. `CLIP_FOR.flex` → `['flex', 'cheer', 'idle']` (strongman/giant have a real flex); giant arrival can play `stomp`.
6. **Tractor** (`createTractorVisual`): play `clips.pull` while `tr.state === 'pull'`, `drive` while entering /
   leaving, `idle` when parked (currently it always plays `drive`); use `attach.exhaust.getWorldPosition()` for
   smoke and `attach.hitch.getWorldPosition()` for the rope end instead of the fixed offsets. `fitModel` scales
   it to 3.0 long (k ≈ 0.94) and turns it to drive away from the pit: correct for this model.

## Environment

### `createArena({ teamColors: [c1, c2], visual: config.visual, title })`

Returns `{ object3D, update(dt), setTeamColors(c1, c2), cheer(k), setDust(k), pitHalf, pitZ: 2.7, waterY: -0.42,
background, fog, lights: { hemi, sun }, palette, ready, meshes, dispose() }`, the same layout as `js/arena.js`:
pit `±pitHalf x ±2.7` at the origin, water at -0.42, start lines at `±(frontX - 0.45)`, lanes to
`frontX + slotGap * pullersPerSide + 4.2`, back fence at z = -6.6, stands from z = -8.6 back, front fence at z = 5.4.

- Ground (one shader-painted mesh): soft colour patches, mowing stripes, worn lanes, wet pit rim, footpath,
  tractor tyre marks, team-tinted lanes, chalk start lines / lane borders / centre marks, darkening along the
  fences and toward the foreground, distance haze.
- Pit: mud walls, plank edging with end grain, corner posts, team pennants, warning sign, bucket. Animated
  water: two scrolling normal maps, vertex waves, a waterline foam band, a sheen at grazing angles.
- Props (one merged toon mesh, vertex colours + a `team` attribute tinted by two uniforms + a `wave`
  attribute swayed in the vertex shader): rope barriers keeping the crowds back, fences, team banners,
  4-row stands with a muted awning, team flags, bunting, hay bales, drums, a referee table, a rope coil, a chalk
  cart, team gazebos with benches (bottles, towels), a scoreboard, market tents, a çay stand with a semaver and
  balloons, an ice-cream cart, picnic blankets, a hay cart, flowers / tufts / stones in clusters, a picket
  fence with a flowering hedge, trees, cypresses, hills with tree clumps and a village with a mosque. The
  shader adds baked contact darkening at the base of upright surfaces, background desaturation / haze and a
  soft rim light.
- Crowds: seated stands (~150), standing foreground groups (~85), picnic sitters; all bounce and wave in the
  vertex shader; `cheer(k)` makes them jump (decays like `js/arena.js`).
- Life: clouds drift; pollen motes float; `setDust(0..1)` sets the dust rising off the lanes.
- `lights`: warm key `DirectionalLight` (casts soft PCF shadows over x ±17, z ±13; 2048 map) and a warm
  hemisphere fill, meant to replace the scene's own sun/hemi. With shadows: set
  `renderer.shadowMap.enabled = true` and `castShadow = true` on the figure meshes.

### `createRope({ handY = ROPE_Y })`

Drop-in for `js/rope.js` `Rope`: same `update(dt, o)` input (`offset, tension, vel, front, left, right`),
`heightAt(x)`, `jerk(a)`, `handY`. Braided `tex_rope` + `tex_rope_normal` tube (96 x 8) rebuilt in place each
frame (no allocations), strands slide with the rope, tension-dependent radius and sag, travelling wobble,
centre marker (knot + flag swinging with the rope speed).

### `createCrowd({ visual: config.visual, perSide })`

Drop-in for `js/crowd.js` `Crowd` without the counter sprites (keep those from crowd.js): `setColors`,
`setCounts(a, b)`, `likes(teamId, count)`, `update(dt)`, `ending`. One InstancedMesh for both teams; figures
pop in by count in the vertex shader; groups stand behind the rope barriers (|z| 3.1-5.4).

### Scene mapping (fallback -> generator)

| `scene.js` today | replace with |
|---|---|
| `new Arena(scene, assets, config)` | `const arena = gen.createArena({ teamColors, visual: config.visual, title: config.title }); scene.add(arena.object3D)`; keep calling `arena.update(dt)`, `arena.cheer(k)`, `arena.setTeamColors(c1, c2)`; `pitZ`/`waterY` are the same |
| `scene.background = skyTexture(); scene.fog = ...` | `scene.background = arena.background`; keep the fog object but colour it `arena.palette.haze` (camera code sets near/far) |
| hemisphere + sun in the constructor | `scene.add(arena.lights.hemi, arena.lights.sun, arena.lights.sun.target)` (optional shadows, see above) |
| `new Rope(scene, assets)` | `const rope = gen.createRope({ handY: gen.ROPE_Y }); scene.add(rope.object3D)`; update calls unchanged; `handTarget` 0.98 -> `gen.ROPE_Y` |
| `new Crowd(scene, config)` | `gen.createCrowd({ visual: config.visual })` + the counter sprites from crowd.js |
| `rand(-1.6, 1.6)` spawn z / dust along lanes | optional: `arena.setDust(intensity)` while pulling |

A mild vignette (CSS radial gradient over the canvas, see `tools/halat/viewer.html`) helps the eye go to the
rope; it belongs to the HUD layer.

## Performance

Test scene (`viewer.html?mode=perf&specials=1&tractor=1&crowd=160`): 20 pullers, 2 strongmen, giant,
tractor, rope, arena, 320 team crowd + ~250 arena spectators, game camera at 1080x1920. Headless Chrome with GPU
ANGLE (laptop with Intel UHD + RTX 4050; adapter not pinned):

| | draw calls | triangles | avg frame (CPU submit + mixers) |
|---|---|---|---|
| scene lights, no shadows | 39 | 360k | ~2 ms |
| arena key light with shadows | 63 | 604k (incl. shadow pass) | ~1.4-2 ms |

Characters are one draw call each (skinned, 6.1k-7.3k triangles); crowds, flags, bunting and water animate on the
GPU; the rope is the only per-frame buffer upload (~6 KB). For weak integrated GPUs: disable the shadow-casting
light, lower `crowdPerSide`, or set `visual.maxPixelRatio` to 1.