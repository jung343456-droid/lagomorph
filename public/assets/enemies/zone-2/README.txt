LAGOMORPH — Enemy Sprite Assets · ZONE 02 (Deeper Forest)
=========================================================

Generated from enemies-zone2.html.

Folders : one per enemy (bat/, boar/, spider/, bear/, toad/, blackbear/, owlking/)

Naming convention :
  {enemy}-{n|ne|e|se|s|sw|w|nw}.png  — individual 8-direction idle sprites
  {enemy}-walk-sheet.png             — 8-direction sheet (4 cols × 2 rows : N NE E SE / S SW W NW)
  {enemy}-{idle|chase|rush|…}.png   — action / state frames
  {enemy}-actions-sheet.png          — action frames in a single row
  spider-web.png                     — 110×110 web ground texture (slow zone)
  toad-puddle.png                    — 120×120 acid puddle ground texture (DoT zone)
  owlking-feather.png                — 16×16 feather projectile

All PNGs have transparent background and use a limited palette.
Pixel art — use image-rendering: pixelated when displaying scaled up.
