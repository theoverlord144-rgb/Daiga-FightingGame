# Sprite templates

Drawing templates: paint on top of one, keep the magenta, and `scripts/sprite-prep.mjs` removes it.

## template_air.png

For air poses (jumps, air attacks, air dashes) where the chain needs room.

- 2048 x 2048, flat magenta `#FF00FF`. No ground line: he is in the air.
- A dashed box (`#D600D6`, 3 px) in the upper left quarter, 236 x 531 px: the size of Avner's standing body. Draw his
  body to fill it.
- A small cross at the box's centre (512, 512): his body centre.
- Everything else is empty on purpose, for the chain.

**Scale:** taken from the first drawing of `data/characters/avner/Avner_Idle.png` (236 px wide, 531 px tall).

Rebuild it with `node tools/sprites/make-template-air.mjs`. The numbers are at the top of that file.
