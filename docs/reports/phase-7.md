# Phase 7: rollback netcode and the sync test

## What I built
- **Rollback netcode.** Each player runs the whole game on their own machine:
  - Your own inputs play 2 frames late (input delay, adjustable). That hides small lag completely.
  - The opponent's inputs, until they arrive, are guessed: "still doing what they were doing". That guess is right
    most of the time.
  - When the guess was wrong, the game rewinds to that frame and replays up to now with the real input. You see the
    opponent's move start a few frames in, but the result is exactly as if there had been no lag.
  - It never rewinds more than 8 frames. If the connection falls further behind, the game waits a moment instead of
    guessing wildly.
  - If one side runs ahead, it holds back a frame now and then, so both stay level.
  - Every 10 frames, the two machines compare a fingerprint of the game. If they ever disagree, which should never
    happen, the screen says "DESYNC at frame N" so we know exactly where to look.
- **Netplay in two browser tabs**, so you can feel it without a server:
  - Open `http://localhost:5300/?mode=netplay&side=1` in one tab and the same address with `side=2` in another.
  - Add `&lag=6` to both for 100 ms of fake ping each way (lag=12 is 200 ms).
  - Each tab is played with Player 1's controls. The screen shows ping, the number of rollbacks and the longest one.
- **Sync test**, the standard safety check for rollback games:
  - Every single frame, the game rewinds 8 frames, replays them and checks the result is identical.
  - It's an automated test, and also a live mode, `?mode=synctest`: play normally, and it says "SYNC TEST OK" or the
    frame where it failed.

## What I decided and why
- **Input delay 2 by default**, the usual modern compromise: small lag needs no rollback at all, and big lag rolls
  back less.
- **8 frames of rollback at most.** Beyond that, rollback starts to look like teleporting. Waiting briefly is better.
- **The netcode doesn't care what carries the packets.** Today it's the simulated network (tests) and two browser
  tabs. Real internet play needs a matchmaking/relay server, which is a hosting decision, not engine code. When you
  want it, it plugs into the same two functions.
- **Every packet re-sends everything the other side hasn't confirmed yet**, so lost packets don't matter. Even while
  waiting, the game keeps sending, so the two sides can never end up waiting on each other forever.

## Tests
- 112 tests, all passing. New:
  - **The sync test over 6,000 frames of real fighting** (over 50 hits and blocks), rewinding 8 frames every frame:
    never differs.
  - The same at every rewind distance from 1 to 12 frames.
  - **The sync test is not a rubber stamp:** a deliberately broken game that keeps a hidden counter outside the game
    state gets caught, and the report names the field that went wrong.
  - Two simulated players at 3 frames of lag each way:
    - more than 20 rollbacks, none longer than 8 frames;
    - both screens end on the identical game;
    - both agree on every input;
    - the final game equals replaying those inputs offline with no network at all.
  - A bad connection (jitter plus 15% packet loss) converges with no desync.
  - A very laggy link (20 frames each way, about 670 ms of ping, plus loss) still converges. It just waits more.
  - Low lag with input delay 2 needs zero rollbacks.
  - A 1.5-second connection cut: the game waits instead of guessing, then catches up with no desync.
  - A deliberately corrupted game on one side is detected as a desync near the right frame.
  - The same match over the same simulated network plays out identically every time.
  - The core-purity check now covers the netcode folder too.
- **The tests caught two real bugs, both fixed:**
  - While waiting, a side stopped sending. After a connection cut, both sides waited on each other forever.
  - On a very laggy link, the oldest unconfirmed inputs could fall out of the re-send window, causing the same freeze.
- **Speed:** one frame is about 1.8 microseconds. The worst-case rollback (rewind and replay 8 frames, plus saving
  states) costs about 0.16 ms of the 16.7 ms frame budget, roughly 1%.
- **In a real browser:** I ran two tabs at 100 ms fake lag. They connected and showed the same game. The headless
  test browser runs the tabs at uneven, low speeds, so it can't show how it feels at full speed. That part is yours.
  The live sync test ran clean through walking, hits and a combo.

## What to play-test first
1. Two tabs, `?mode=netplay&side=1&lag=6` and `?mode=netplay&side=2&lag=6`. Play against yourself, or with someone
   on a second keyboard or pad if the tabs are side by side.
2. Try `lag=0`, `lag=6` and `lag=12`. Tell me where it starts to feel bad.
3. Try `&delay=0` and `&delay=3` against the default 2. Some players prefer more delay and fewer rollbacks.
4. `?mode=synctest` and play anything. It should only ever say OK.
