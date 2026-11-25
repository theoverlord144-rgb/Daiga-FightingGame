# Combo damage table

Measured by `node scripts/combo-damage.mjs`: every combo is played through the real game rules with real button
presses, against a defender who does nothing. Health is 10,000. "Touches" = how many times that same combo has
to land to win a round (the comeback rule makes the last part of a life bar tougher). Devotion: 100 = one bar.

## Avner

| Combo | Presses | Bars | Hits | Damage | Life bar | Touches | Devotion earned | Victim earns |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Throw | 6H | 0 | 1 | 1000 | 10.0% | 12 | 30 | 20 |
| Light, medium, heavy | 5L > 5M > 5H | 0 | 3 | 1382 | 13.8% | 9 | 41 | 28 |
| Basic into Lunar Halo | 5L > 5M > 5H > 623H | 0 | 4 | 2129 | 21.3% | 6 | 69 | 43 |
| Heavy into Lunar Halo | 5H > 623H | 0 | 2 | 1904 | 19.0% | 6 | 62 | 38 |
| Launcher, air string | 5L > 5M > 5H > 5S > 9 > j.M > j.H > j.S | 0 | 7 | 3018 | 30.2% | 4 | 91 | 60 |
| Medium start: launcher, air string | 5M > 5H > 5S > 9 > j.M > j.H > j.S | 0 | 6 | 3263 | 32.6% | 4 | 98 | 65 |
| Heavy start: launcher, air string | 5H > 5S > 9 > j.M > j.H > j.S | 0 | 5 | 3217 | 32.2% | 4 | 97 | 64 |
| Jump-in heavy, launcher, air string | 9 > j.H > 5H > 5S > 9 > j.M > j.H > j.S | 0 | 6 | 3474 | 34.7% | 4 | 104 | 69 |
| Launcher, air string, Air Crescent | 5L > 5M > 5H > 5S > 9 > j.M > j.H > j.236H | 0 | | | | | does not connect: drops at "j.236H" | |
| Launcher, air string, EX Air Crescent | 5L > 5M > 5H > 5S > 9 > j.M > j.H > j.236HS | 1 | | | | | does not connect: drops at "j.236HS" | |
| Launcher into New Moon | 5L > 5M > 5H > 5S > 236236S | 1 | 5 | 3078 | 30.8% | 4 | 92 | 62 |
| Launcher into Lunar Halo | 5L > 5M > 5H > 5S > 623H | 0 | 5 | 2505 | 25.1% | 5 | 80 | 50 |
| Basic into EX Halo | 5L > 5M > 5H > 623HS | 1 | 4 | 2191 | 21.9% | 6 | 66 | 44 |
| Basic into New Moon | 5L > 5M > 5H > 236236S | 1 | 4 | 2752 | 27.5% | 5 | 83 | 55 |
| Heavy into New Moon | 5H > 236236S | 1 | 2 | 2824 | 28.2% | 4 | 85 | 56 |
| New Moon alone | 236236S | 1 | 1 | 2200 | 22.0% | 6 | 66 | 44 |
| Heavy into Full Moon | 5H > 214214S | 4 | | | | | does not connect: drops at "214214S" | |
| Full Moon alone | 214214S | 4 | 1 | 4500 | 45.0% | 3 | 135 | 90 |
| Counter hit: launcher, air string | (counter hit) 5H > 5S > 9 > j.M > j.H > j.S | 0 | 5 | 3217 | 32.2% | 4 | 97 | 64 |
| Witness: launcher, air string | (witness hit) 5H > 5S > 9 > j.M > j.H > j.S | 0 | 5 | 3463 | 34.6% | 4 | 104 | 69 |
| Perfect Links into New Moon | 5L > link:5M > link:5H > link:236236S | 1 | 4 | 3048 | 30.5% | 4 | 97 | 61 |
| Heavy start, Perfect Links, air string | 5H > link:5S > 9 > j.M > link:j.H > link:j.S | 0 | 5 | 3434 | 34.3% | 4 | 109 | 69 |
| Heavy, Perfect Link into New Moon | 5H > link:236236S | 1 | 2 | 2824 | 28.2% | 4 | 87 | 56 |
| Counter hit, Perfect Links, air string | (counter hit) 5H > link:5S > 9 > j.M > link:j.H > link:j.S | 0 | 5 | 3434 | 34.3% | 4 | 109 | 69 |
| Witness, Perfect Links, air string | (witness hit) 5H > link:5S > 9 > j.M > link:j.H > link:j.S | 0 | 5 | 3614 | 36.1% | 4 | 114 | 72 |
| Witness, heavy, Perfect Link New Moon | (witness hit) 5H > link:236236S | 1 | 2 | 2912 | 29.1% | 4 | 89 | 58 |
| Sweep, floor pickup, Lunar Halo | 5L > 5M > 2H > 2L > 623H | 0 | 5 | 2178 | 21.8% | 6 | 70 | 44 |
| Air string, slam, floor pickup, Lunar Halo | 5M > 5H > 5S > 9 > j.M > j.H > j.S > 66 > 2L > 623H | 0 | | | | | does not connect: drops at "66 > 2L" | |
| Air string, slam, floor pickup, New Moon | 5M > 5H > 5S > 9 > j.M > j.H > j.S > 66 > 2L > 236236S | 1 | | | | | does not connect: drops at "66 > 2L" | |
| Your example route | 5M > 5H > 5S > 9 > j.L > j.M > j.S > 2L > 236236S | 1 | 8 | 4287 | 42.9% | 3 | 131 | 86 |
| Counter-hit heavy (crumple), full route, New Moon | (counter hit) 5H > 5M > 5H > 5S > 9 > j.M > j.H > j.S > 2L > 236236S | 1 | 8 | 5356 | 53.6% | 3 | 139 | 107 |
| Witness, Perfect Links, slam, pickup, New Moon | (witness hit) 5H > link:5S > 9 > j.M > link:j.H > link:j.S > 66 > 2L > 236236S | 1 | | | | | does not connect: drops at "66 > 2L" | |

## Malik

| Combo | Presses | Bars | Hits | Damage | Life bar | Touches | Devotion earned | Victim earns |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Throw | 6H | 0 | 1 | 1000 | 10.0% | 12 | 18 | 20 |
| Light, medium, heavy | 5L > 5M > 5H | 0 | 4 | 1352 | 13.5% | 9 | 24 | 27 |
| Basic into Pillar | 5L > 5M > 5H > 623H | 0 | | | | | does not connect: drops at "623H" | |
| Basic into Lariat | 5L > 5M > 5H > 214H | 0 | | | | | does not connect: drops at "214H" | |
| Heavy into Pillar | 5H > 623H | 0 | | | | | does not connect: drops at "623H" | |
| Basic into Pillar (L) | 5L > 5M > 5H > 623L | 0 | 5 | 1810 | 18.1% | 7 | 36 | 36 |
| Basic into Lariat (L) | 5L > 5M > 5H > 214L | 0 | 5 | 1867 | 18.7% | 7 | 37 | 37 |
| Heavy into Lariat (L) | 5H > 214L | 0 | 2 | 1628 | 16.3% | 7 | 32 | 33 |
| Basic into Spirit Orb | 5L > 5M > 5H > 236H | 0 | | | | | does not connect: drops at "236H" | |
| Heavy start: launcher, air string | 5H > 5S > 9 > j.M > j.H > j.S | 0 | 5 | 3217 | 32.2% | 4 | 58 | 64 |
| Jump-in heavy, launcher, air string | 9 > j.H > 5H > 5S > 9 > j.M > j.H > j.S | 0 | 6 | 3474 | 34.7% | 4 | 63 | 69 |
| Launcher, air string | 5L > 5M > 5H > 5S > 9 > j.M > j.H > j.S | 0 | 8 | 2857 | 28.6% | 5 | 51 | 57 |
| Basic into EX Lariat | 5L > 5M > 5H > 214HS | 1 | 5 | 2096 | 21.0% | 6 | 38 | 42 |
| Counter hit: launcher, air string | (counter hit) 5H > 5S > 9 > j.M > j.H > j.S | 0 | 5 | 3217 | 32.2% | 4 | 58 | 64 |
| Heavy start, Perfect Links, air string | 5H > link:5S > 9 > j.M > link:j.H > link:j.S | 0 | 5 | 3434 | 34.3% | 4 | 65 | 69 |
| Witness, Perfect Links, air string | (witness hit) 5H > link:5S > 9 > j.M > link:j.H > link:j.S | 0 | 5 | 3614 | 36.1% | 4 | 69 | 72 |
| Sweep, floor pickup, Lariat (L) | 5L > 5M > 2H > 2L > 214L | 0 | 6 | 1926 | 19.3% | 6 | 38 | 39 |
| Air string, slam, floor pickup, Pillar (L) | 5M > 5H > 5S > 9 > j.M > j.H > j.S > 2L > 623L | 0 | 9 | 3574 | 35.7% | 4 | 67 | 71 |
| EX Lariat (slide), pickup | 5L > 5M > 5H > 214HS > 66 > 5M > 5H | 1 | | | | | does not connect: drops at "66 > 5M" | |
| Counter-hit heavy (crumple), full route | (counter hit) 5H > 5M > 5H > 5S > 9 > j.M > j.H > j.S > 2L > 623L | 0 | 8 | 4304 | 43.0% | 3 | 66 | 86 |
