---
name: sprite-directional-prep
description: >-
  Prepare generated enemy/character sprite images for LAGOMORPH: gather raw
  images out of generator subfolders, name them by facing direction
  (n/s/e/w + diagonals), mirror east-facing frames into west-facing ones,
  resize to the in-game size, and strip the solid background to transparency.
  Use this whenever the user has a folder of freshly generated sprite images
  (e.g. under public/assets/enemies/.../<name>/, often in subfolders like
  stitch_*/.../screen.png) and wants them turned into game-ready directional
  PNGs -- even if they only mention one step like "remove the background",
  "resize these to 60px", "make the west-facing versions", or "rename these
  by direction". Trigger on sprite/spritesheet directional asset prep, sprite
  background removal, and sprite mirroring/resizing for this project.
---

# Directional Sprite Prep

Turns a pile of freshly generated sprite images into game-ready directional PNGs
for LAGOMORPH enemies/characters. The pipeline is:

1. **Gather & name by direction** (needs your eyes — not scriptable)
2. **Mirror** east-facing frames → west-facing
3. **Resize** to the in-game size (default 60×60)
4. **Remove background** → transparent
5. **Inspect** the result before declaring done

Steps 2–5 are handled by `scripts/process_sprites.py`. Step 1 is the only part
that needs visual judgement, so you do it yourself.

## Conventions (match the existing assets)

- Sprites live in `public/assets/enemies/{zone}/{name}/` (or `characters/...`).
- Final filenames: `{name}-{dir}.png` where `dir` ∈ `n, s, e, w, ne, nw, se, sw`
  (north/south/east/west + diagonals). Not every sprite has all 8 — only make
  the directions you actually have art for.
- Direction = where the character **faces**: front view (toward camera) = `s`,
  back view = `n`, profile facing right = `e`, profile facing left = `w`.
- In-game display size is small (the badger set is 60×60). Default to **60×60**
  unless the user says otherwise.
- Generators often dump images in nested subfolders (e.g.
  `stitch_*/.../screen.png`). Those raw folders are kept around; leave them in
  place and copy out of them.

## Step 1 — Gather & name by direction (do this yourself)

1. Find the raw images:
   `find <folder> -type f \( -iname "*.png" -o -iname "*.jpg" \)`
2. **Read each image** and decide which way the character faces. Map to a
   direction suffix using the rule above. If several images face the same way,
   that's fine — keep the clearest, or number duplicates (`-e`, `-e-2`) and ask
   the user which to keep.
3. Copy each into the target `{name}/` folder as `{name}-{dir}.png`.
4. If the set is missing a `w/nw/sw` but has the matching `e/ne/se`, you don't
   need to hand-make them — the mirror step does that.

If the user has already named the base files (common — they may have tidied up
themselves), skip to step 2.

## Steps 2–5 — Run the script

From the project root (Pillow must be installed — it is in this repo's env):

```bash
python .claude/skills/sprite-directional-prep/scripts/process_sprites.py \
  public/assets/enemies/zone-3/badger --mirror --size 60 --inspect
```

What the flags do:
- `--mirror` — for every `*-e.png` / `*-ne.png` / `*-se.png`, write the flipped
  `*-w.png` / `*-nw.png` / `*-sw.png`. Run this once; re-running just overwrites.
- `--size 60` — resize every PNG to 60×60 with LANCZOS (good for downscaling).
  Use `--no-resize` to leave sizes alone.
- `--inspect` — also write `_inspect_<name>.png`: a 4× nearest-neighbour blow-up
  composited on **magenta** so transparency and any accidental holes are obvious.

Then **Read the `_inspect_*.png` files** to verify: background fully magenta,
body intact, no holes punched in light stripes. When satisfied, delete them:
`rm <folder>/_inspect_*.png`.

## Background removal — pick the right method

This is the step that bites, so understand the trade-off:

- **`color` (default)** removes every neutral light pixel (low chroma **and**
  bright). It clears the background *and* the pockets trapped between legs or
  under the belly that are cut off from the image border. This is what the
  badger set needed. Tunables: `--bg-sat` (max chroma, default 16) and
  `--bg-bright` (min brightness, default 200).
  - **Risk:** a character with large neutral **white/gray body areas** can get
    holes punched in it. The badger's white face stripe survived because it sits
    inside the brown silhouette and its tone differed enough — but always check
    `--inspect`. If the body is getting eaten, raise `--bg-bright` or lower
    `--bg-sat`, or switch methods.
- **`flood`** (`--method flood`) clears only background connected to the border,
  so it never touches the interior. Safer for white-bodied characters, but it
  leaves enclosed background pockets behind. Tune with `--flood-tol`.

First, sanity-check the actual background: the script prints the corner pixels of
the first file. If they're a solid light neutral (~`(234,234,234,255)`), `color`
is the right call. If the corners are already transparent (`a == 0`), background
removal may be unnecessary — confirm before clearing anything.

## After processing

- If you changed the entity's art/size, remember the project rule: update the
  file-top comment in the matching `src/entities/{Name}.js`, and `BootScene.js`
  if it loads these as a spritesheet vs. individual frames.
- Don't touch `dead/` folders — those are an unused-image archive (project rule).
