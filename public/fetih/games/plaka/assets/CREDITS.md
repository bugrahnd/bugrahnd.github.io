# Credits and licences

Everything in `game/assets/` is CC0 (public domain dedication) or SIL OFL 1.1 (fonts).
No attribution is legally required for CC0, but we credit the authors anyway.
Map data (`game/data/`) comes from Natural Earth (public domain).

Rebuild: `cd tools && npm install && bash fetch-kenney.sh <packs below> && bash fetch-other.sh && node build-assets.mjs && node verify-assets.mjs`

## 3D models, sprites, UI, sound effects: Kenney (kenney.nl), CC0 1.0

| Pack | URL | Used for |
|---|---|---|
| Castle Kit | https://kenney.nl/assets/castle-kit | castle_small/medium/large, tower, tower_square, wall*, flag*, banner, unit_siege (catapult), unit_siege_trebuchet, tree_a, tree_b, rock_a, rock_b |
| Mini Characters | https://kenney.nl/assets/mini-characters | unit_infantry (soldier), unit_knight, cavalry rider, sword, shield, spear, projectile_arrow |
| Pirate Kit | https://kenney.nl/assets/pirate-kit | unit_cannon, projectile_cannonball, ship, ship_small |
| Hexagon Kit | https://kenney.nl/assets/hexagon-kit | mountain_a, forest, house |
| Fantasy Town Kit | https://kenney.nl/assets/fantasy-town-kit | tree_c, tree_d, tree_e, rock_c |
| Nature Kit | https://kenney.nl/assets/nature-kit | tent, tent_small |
| Particle Pack | https://kenney.nl/assets/particle-pack | fx_* single sprites |
| Smoke Particles | https://kenney.nl/assets/smoke-particles | fx_explosion, fx_flash, fx_puff, fx_black_smoke sheets |
| UI Pack - Adventure | https://kenney.nl/assets/ui-pack-adventure | panels, banners, buttons, progress bars, frames |
| Board Game Icons | https://kenney.nl/assets/board-game-icons | icon_sword/shield/crown/heart/flag/skull/arrow/coin/gem/fire/tower/knight/hourglass/dice_sword |
| Game Icons | https://kenney.nl/assets/game-icons | icon_star, icon_trophy, icon_medal |
| Impact Sounds | https://kenney.nl/assets/impact-sounds | sfx_hit*, sfx_wood_hit, sfx_elimination, part of sfx_gift_big |
| Interface Sounds | https://kenney.nl/assets/interface-sounds | sfx_gift_small, sfx_ui_tick, sfx_ui_click, sfx_join |
| Music Jingles | https://kenney.nl/assets/music-jingles | sfx_capture*, sfx_gift_medium, sfx_round_start, sfx_round_end, part of sfx_gift_big |
| RPG Audio | https://kenney.nl/assets/rpg-audio | sfx_coins, sfx_march |
| Sci-fi Sounds | https://kenney.nl/assets/sci-fi-sounds | sfx_explosion, sfx_explosion_big, part of sfx_gift_big |

Licence text: "Creative Commons Zero, CC0" (License.txt in every pack), http://creativecommons.org/publicdomain/zero/1.0/

Modifications: textures embedded into each GLB, castle/unit models assembled from several pieces,
team-colour triangles moved into a "team" material with a grayscale copy of the colormap, unused
animations removed, hex ground tiles removed from hexagon-kit terrain, sprites resized and packed into sheets.

## 3D model: Quaternius, CC0 1.0

- **Horse** (animated) by Quaternius, https://poly.pizza/m/D3hAeqeDBE (Poly Pizza lists it as CC0 / Public Domain; Quaternius releases all models CC0, https://quaternius.com). Used in `unit_cavalry`.

## Audio: OpenGameArt.org, CC0

| Asset | Author | URL | Used for |
|---|---|---|---|
| 20 Sword Sound Effects (Attacks and Clashes) | StarNinjas | https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes | sfx_clash_a..d, sfx_swing, sfx_swing_b |
| War Horns | Eldritch Grim | https://opengameart.org/content/war-horns | sfx_horn, sfx_horn_long (trimmed + faded) |
| Epic March Loop | Eldritch Grim | https://opengameart.org/content/epic-march-loop | music_main |
| Medieval: Battle | RandomMind | https://opengameart.org/content/medieval-battle | music_battle |
| Medieval: Victory Theme | RandomMind | https://opengameart.org/content/medieval-victory-theme | sfx_victory (first phrase), music_victory |

All converted to Ogg Vorbis (44.1 kHz) with ffmpeg.

## Fonts: SIL Open Font License 1.1

- **Paytone One**, Copyright 2011 The Paytone Project Authors, https://fonts.google.com/specimen/Paytone+One, `fonts/PaytoneOne-OFL.txt`
- **Nunito** (variable, wght 200-1000), Copyright 2014 The Nunito Project Authors, https://fonts.google.com/specimen/Nunito, `fonts/Nunito-OFL.txt`

Both verified to contain İ ı Ş ş Ğ ğ Ü ü Ö ö Ç ç.

## Map data (game/data/provinces.json)

- Natural Earth 1:10m Admin 1 – States, Provinces, https://www.naturalearthdata.com (via https://github.com/nvkelso/natural-earth-vector). Public domain.
