# Hit states (Nov 24, 2026)

Jay's idea, borrowed from BlazBlue: every move also says which STATE the opponent goes into. The state changes the
rules (gravity, untechable time, push, whether they can be hit on the floor). Built as he approved it, with one cut:
there is no stagger state. Vow keeps its crumple strikes exactly as they were.

## What exists now

| State | What it is |
| --- | --- |
| normal | Plain ground or air hitstun. Every move that names nothing. |
| slide | Slammed down, the fighter skids away along the ground, slowing. Still airborne for combos, so follow-ups do full damage and are not OTGs. When the skid ends it becomes a soft knockdown. One per combo. |
| spin | An air state with its own arc, untechable time and gravity. |
| tumble | The same kind of air state with different numbers. Both pop a grounded fighter up. |
| crumple | The slow fall forward Vow's strikes already had. Any move can use it now, once per combo. |
| softKD | A knockdown they can get up from early: after 6 frames on the floor any button gets them up. Nothing can hit them. |
| hardKD | They lie still for the whole knockdown and cannot get up early. Only an OTG move can touch them. |
| OTG | A move flagged OTG can hit a fighter lying in a hard knockdown: half damage, a small lift back into air hitstun, once per combo. |

## How a move uses it (data only)

- `hitReaction`: normal, slide, spin, tumble, crumple, softKD or hardKD.
- `airReaction`: the reaction when the opponent is already in the air. Added because a jumping slam must be a hard
  knockdown in the air and plain hitstun on a standing opponent, or the jump-in stops comboing.
- `counterReaction`: the reaction when the hit is a counter hit or a Witness counter.
- `otg`: true or false.

Every state's numbers live in one table: `data/system/combo.json`, section `hitStates`. A move's own launch, air hit
and untechable time still win over the table. The four settings are on the box editor's HIT SETTINGS page (T), and
training mode's readout shows the state the opponent is in and whether the OTG has been used.

## Rules that stop loops

- One OTG per combo. After it, every later knockdown in that combo is the soft one.
- One slide and one crumple per combo; one more is plain hitstun.
- The OTG lift costs 3 juggle points and starting a slide costs 2. Past the juggle limit every reaction becomes plain
  hitstun and a hard knockdown becomes soft.
- Hitstun decay, the repeat penalty, heavier gravity per hit and the 8-second tech-out apply to all of it.
- A test plays the strongest follow-up every time (slide, slams, pickup) and checks the combo ends by itself.

## What changed in how the game plays

- **Falls end in the soft knockdown now.** Before, every fall was a 40-frame invincible knockdown. Now the fighter
  can get up after 6 frames with a button, unless the last hit asked for the hard one. One word in the table
  (`landing`) switches it back.
- **Throws and sweeps** still knock down hard. After a sweep the attacker can pick up with an OTG. After a throw
  they cannot (`afterThrow` in the table switches that on).
- **Absolve** works in slide, spin and tumble, not while lying on the floor.

## First reactions on the cast (a starting point, all editable)

| Move | Setting |
| --- | --- |
| Both 5S launchers | tumble (look only for now: tumble uses normal gravity so the launch arc is unchanged) |
| Both j.S | hard knockdown on an airborne opponent |
| Both 2L | OTG |
| Both 5H | crumple on counter hit |
| Malik's heavy Lariat (and its EX) | slide, in place of its knockdown |
| Avner's Lantern Drag (3H) | slide |
| Avner's Waning Hop (6M) | hard knockdown on an airborne opponent |

Avner's slide move is **Lantern Drag** (3H, added Nov 24 from the owner's drawings): a low slide dragging the lantern, 13 startup, 6 active, 22 recovery, 850 damage, about 150 px of travel, chained from 5M and 5H, sparks (`dragSparks`) and dust (`dragDust`) as timeline effects.

**Waning Hop** (6M, added Nov 24 from the owner's drawings) is his overhead: a short hop (his lower body cannot be hit from frame 6 to 20) into a downward lantern swing, 22 startup, 4 active, 16 recovery, 800 damage, chained from 5M and 5H, effect `hopCrescent`. With Lantern Drag (low) from the same two moves it is his high / low mix-up. It does not combo from 5H on hit; it cancels into Halo (1,904) or New Moon (2,824), and after the launcher it slams into the floor pickup (3,178, or 3,771 with New Moon). Forward + M is now this move, and down-forward + H is Lantern Drag: 5M and the sweep need the stick off those directions.

**Moonfall** (down + M in the air, added Nov 24 from the owner's drawings) is his dive kick: he stops in the air and dives down-forward, 12 startup, active until he lands, 700 damage, overhead, once per jump, chained from j.L and j.M. On hit he pops up off the opponent and can attack again in the air from frame 5 (measured: Moonfall into j.H = 1,436; launcher, j.L, j.M, Moonfall, j.H, j.S slam, pickup, Halo = 4,433 with no meter). Blocked or missed, he lands with 14 frames of recovery. It does not lead to a grounded combo by itself: after the rebound he lands too late to link 5L.

Slide tuning (owner, Nov 24): the slide lasts 46 frames (was 34) and the sliding body is 90 px tall (was 50). Before that nothing could follow a slide: the attacker was free with about 6 frames left and standing moves passed over the body. Now, measured in the real rules: Avner 5M, 5H, Lantern Drag, dash, launcher, air string, slam, pickup, Halo = 4,389 with no meter (4,851 with New Moon); Malik heavy Lariat, dash, launcher, air string = 3,517, and his EX Lariat route with a pickup = 3,888. A second slide move in the same combo does not slide again.

## Art

No new drawings were needed to build it. The new states use copies of drawings each character already has: spin
uses the air-hit drawings, tumble the tumbling fall, slide and soft knockdown the knockdown. To give them their own
look: 2 slide drawings, 4 spin drawings, and tumble drawings if the existing ones are not enough.

## Checks

- With the table set to the old rule and no move using a reaction, the recorded baseline match replayed identically
  on all 3,000 frames. So the rebuild itself changed nothing.
- 444 tests, 441 pass. The 3 failures are the standing ones (Back Heavy 4H, Vigil M crescent, Malik j.R).
- Two older tests were updated for the new knockdown rule: the ground-bounce test now expects the soft knockdown, and
  the random-fight sanity test uses a different seed (its old seed no longer produced a block).
- The baseline match and frame data were re-recorded under the new rules.
- Not checked: nothing was watched on screen. The editor rows and the training readout line are untested in a browser.

## Measured routes

See `docs/reports/combo-damage.md` (re-run with `node scripts/combo-damage.mjs`).
