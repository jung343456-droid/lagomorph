#!/usr/bin/env python
"""Directional sprite preparation pipeline for LAGOMORPH enemy/character art.

Does the scriptable parts of the workflow: mirror, resize, background removal,
and an optional visual inspection composite. Identifying which raw image faces
which direction needs human/Claude eyes and is NOT done here -- name the base
files `<name>-<dir>.png` first, then run this.

Usage:
    python process_sprites.py <folder> [options]

Common cases:
    # Full pipeline on a folder of already-direction-named PNGs:
    python process_sprites.py ./badger --mirror --size 60 --inspect

    # Just remove backgrounds, nothing else:
    python process_sprites.py ./badger --no-resize --bg-only

Options:
    --size N          Target square size in px (default 60). Use 0 / --no-resize to skip.
    --no-resize       Skip resizing.
    --mirror          For each *-e/*-ne/*-se file, create the mirrored *-w/*-nw/*-sw.
    --no-bg           Skip background removal.
    --bg-only         Only run background removal (implies --no-resize, no mirror).
    --method M        Background removal: 'color' (default) or 'flood'.
    --bg-sat S        Max chroma (max-min channel) counted as background (default 16).
    --bg-bright B     Min brightness counted as background, 'color' method (default 200).
    --flood-tol T     Color distance tolerance for 'flood' method (default 45).
    --inspect         Write _inspect_<name>.png (4x NEAREST on magenta) for review.

Background removal -- why two methods:
    'color'  removes every neutral light pixel (low chroma AND bright). This is the
             right default for sprites on a solid light-gray/white card, because it
             also clears background pockets trapped between legs/under the belly that
             a flood fill can't reach. Risk: a character whose BODY has large neutral
             white/gray areas can get holes punched in it -- check the --inspect output.
    'flood'  clears only background connected to the image border. Safer for
             white-bodied characters, but leaves enclosed background pockets behind.
"""
import sys
import os
import glob
import argparse
from collections import deque

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: pip install Pillow")

MIRROR_PAIRS = [("-e", "-w"), ("-ne", "-nw"), ("-se", "-sw")]


def list_pngs(folder):
    return sorted(glob.glob(os.path.join(folder, "*.png")))


def corner_sample(img):
    w, h = img.size
    px = img.load()
    pts = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    return [px[x, y] for x, y in pts]


def do_mirror(folder):
    made = []
    for src in list_pngs(folder):
        stem, ext = os.path.splitext(src)
        for e_suf, w_suf in MIRROR_PAIRS:
            if stem.endswith(e_suf):
                dst = stem[: -len(e_suf)] + w_suf + ext
                Image.open(src).transpose(Image.FLIP_LEFT_RIGHT).save(dst)
                made.append(os.path.basename(dst))
    return made


def do_resize(folder, size):
    for f in list_pngs(folder):
        img = Image.open(f).convert("RGBA")
        if img.size != (size, size):
            img.resize((size, size), Image.LANCZOS).save(f)


def remove_bg_color(img, max_sat, min_bright):
    px = img.load()
    w, h = img.size
    cleared = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if not a:
                continue
            sat = max(r, g, b) - min(r, g, b)
            bright = (r + g + b) // 3
            if sat < max_sat and bright >= min_bright:
                px[x, y] = (r, g, b, 0)
                cleared += 1
    return cleared


def remove_bg_flood(img, tol):
    px = img.load()
    w, h = img.size
    # reference background = average of the four corners
    corners = corner_sample(img)
    ref = tuple(sum(c[i] for c in corners) // 4 for i in range(3))
    seen = [[False] * w for _ in range(h)]
    dq = deque()
    for x in range(w):
        dq.append((x, 0)); dq.append((x, h - 1))
    for y in range(h):
        dq.append((0, y)); dq.append((w - 1, y))
    cleared = 0
    while dq:
        x, y = dq.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y][x]:
            continue
        seen[y][x] = True
        r, g, b, a = px[x, y]
        if a and abs(r - ref[0]) + abs(g - ref[1]) + abs(b - ref[2]) <= tol:
            px[x, y] = (r, g, b, 0)
            cleared += 1
            dq.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    return cleared


def do_bg(folder, method, max_sat, min_bright, flood_tol):
    results = {}
    for f in list_pngs(folder):
        if os.path.basename(f).startswith("_inspect_"):
            continue
        img = Image.open(f).convert("RGBA")
        if method == "flood":
            cleared = remove_bg_flood(img, flood_tol)
        else:
            cleared = remove_bg_color(img, max_sat, min_bright)
        img.save(f)
        results[os.path.basename(f)] = cleared
    return results


def do_inspect(folder):
    for f in list_pngs(folder):
        base = os.path.basename(f)
        if base.startswith("_inspect_"):
            continue
        img = Image.open(f).convert("RGBA")
        w, h = img.size
        big = img.resize((w * 4, h * 4), Image.NEAREST)
        bg = Image.new("RGBA", big.size, (255, 0, 255, 255))
        bg.alpha_composite(big)
        out = os.path.join(folder, "_inspect_" + base)
        bg.convert("RGB").save(out)


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("folder")
    ap.add_argument("--size", type=int, default=60)
    ap.add_argument("--no-resize", action="store_true")
    ap.add_argument("--mirror", action="store_true")
    ap.add_argument("--no-bg", action="store_true")
    ap.add_argument("--bg-only", action="store_true")
    ap.add_argument("--method", choices=["color", "flood"], default="color")
    ap.add_argument("--bg-sat", type=int, default=16)
    ap.add_argument("--bg-bright", type=int, default=200)
    ap.add_argument("--flood-tol", type=int, default=45)
    ap.add_argument("--inspect", action="store_true")
    args = ap.parse_args()

    folder = args.folder
    if not os.path.isdir(folder):
        sys.exit(f"Not a folder: {folder}")

    if args.bg_only:
        args.no_resize = True
        args.mirror = False
        args.no_bg = False

    if args.mirror:
        made = do_mirror(folder)
        print(f"[mirror] created {len(made)}: {', '.join(made) if made else '(none matched -e/-ne/-se)'}")

    if not args.no_resize and args.size > 0:
        do_resize(folder, args.size)
        print(f"[resize] all PNGs -> {args.size}x{args.size}")

    if not args.no_bg:
        # report what the background looks like so the operator can sanity-check
        sample = list_pngs(folder)
        if sample:
            c = corner_sample(Image.open(sample[0]).convert("RGBA"))
            print(f"[bg] {os.path.basename(sample[0])} corners: {c}")
        res = do_bg(folder, args.method, args.bg_sat, args.bg_bright, args.flood_tol)
        for name, n in res.items():
            print(f"[bg:{args.method}] {name}: cleared {n}px")

    if args.inspect:
        do_inspect(folder)
        print("[inspect] wrote _inspect_*.png (magenta bg, 4x). Delete these when done.")


if __name__ == "__main__":
    main()
