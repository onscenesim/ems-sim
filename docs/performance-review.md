# Performance review — November 2, 2026

The reported pauses have two separate paths: browser rendering can interrupt
motion, and a completed model request is followed by a potentially long sequence
of animations before the response becomes visible.

## Findings and changes

| Finding | Evidence | Action |
| --- | --- | --- |
| Repeated ECG paper generation on routine updates | `TwelveLeadViewer.update()` and `setPatient()` both called `render()` and regenerated the selected SVG, including the open paper. One sample SVG is 155,494 bytes. | Cache the data rendered on each of the two surfaces. Skip unchanged patient and interpretation updates. Changed record data still invalidates the cache. |
| Repeated synchronous transcript layout | Every printed roll and separator immediately read `output.scrollHeight` after DOM writes. A batch or restored call repeated that cycle. | Coalesce scrolling into one animation-frame callback using the final transcript height. |
| Monitor reads layout on every animation frame | `stripFrame()` called `stripSizeCanvas()`, which always read `clientWidth` and `clientHeight`. | Cache dimensions and invalidate through ResizeObserver, window resize and device-pixel-ratio changes. Keep the existing path as fallback when ResizeObserver is unavailable. |
| Dice timing accumulated delayed callbacks | Landing required 13 interval callbacks even when a busy frame or background tab delayed them. | Use elapsed time for landing. Preserve the normal 624 ms spin, outcome sound, hold and fade. |
| Malformed scene repair restarted the model timeout | `Session._send()` passed the original timeout to a second model call. The default could allow roughly 180 seconds across draft and repair. | Share the existing 90-second model budget with the repair, as debrief repair already does. Cancellation and rollback remain intact. |

## Remaining opportunities, in priority order

1. **Overlap model generation and intervention presentation.** Currently the
   `/turn` request must complete before any dice/procedure animation starts, and
   every animation is awaited before the scene reply prints. Suction, OPA, IV
   and BVM together add approximately **18.9 seconds after the API response**
   under the current normal-motion timings. The typing indicator remains visible
   through this interval. This is a deterministic presentation cost, independent
   of model speed. A preparation/event stream could begin presenting confirmed
   rolls while the scene generates. That needs explicit handling of cancellation,
   failed generation and operation replay, since the existing draft commits only
   after a successful model response. An optional accelerated batch presentation
   is another product choice. Neither behavior was changed in this pass.
2. **Measure model time separately from presentation time.** The API sends the
   whole conversation on every turn, including injected roll context. A sampled
   scenario system prompt was 60,780 characters before adding conversation.
   Longer histories, transient provider errors and malformed-output repairs can
   add variability. `requestModel()` permits three attempts, with 2- and 4-second
   backoffs for transient errors, within its deadline. Record queue wait, each
   generation attempt, repair, input/output size, persistence and browser
   animation/render time before choosing context reduction or output limits.
   Retain clinical events, patient identity and crew/transport state when
   evaluating any history compaction.
3. **Reduce growing synchronous persistence work.** Each successful turn writes
   a complete JSON snapshot synchronously. Saved operation results duplicate
   reply/vitals data and include the full ECG archive returned at each turn.
   Larger runs and concurrent players can therefore block the Node event loop.
   Measure snapshot size/write duration, then consider serialized asynchronous
   writes and storing immutable ECG records once. Preserve durable idempotency
   and restart behavior; simply discarding operation results would make lost
   response retries unsafe.

## Verification

- `npm test` passed, including 283 Node test-runner cases plus the roller and
  randomness scripts. New regressions cover coalesced scrolling, cached monitor
  dimensions, shared repair deadlines, unchanged ECG snapshots and delayed dice.
- Compared the baseline viewer from HEAD with the updated viewer using the real
  ECG generator, an open paper, and 30 unchanged update/patient-refresh pairs:
  **120 SVG generations → 0**, **969 ms → 1 ms** on this machine. This benchmark
  measures JavaScript generation in a DOM stub, not total browser latency.
- The same four-intervention detection averaged approximately **0.82 ms** over
  100 warmed local iterations. It does not explain a multi-second delay in this
  fixture.
- In the Codex side browser, the real UI with a synthetic model showed **zero
  SVG replacements for 30 repeated updates** (3 ms including the next frame).
  Appending 60 synthetic transcript turns took 13 ms including the next frame,
  and scrolled to the latest turn. These are local observations, not production
  percentiles.
- Opened and closed the cached ECG paper; inspected the rendered tracing and
  live monitor. Exercised a four-intervention confirmation/animation sequence
  through its starting and ending states; all four results appeared, overlays
  cleared and SEND/input were restored. An intentionally delayed first dice
  tick landed at the first callback after an 800 ms block and completed in
  1,636 ms, instead of replaying the missed ticks.
- No live model latency benchmark was run. The preview uses synthetic replies
  and temporary storage, so it cannot establish provider latency or production
  concurrency behavior. Audible playback level was not independently measured;
  sound mappings and the one-cue landing behavior passed their tests.

Run the isolated preview with `node test/preview-performance.js`, then open
`http://127.0.0.1:3132`. Its diagnostics are fixture-only and are never served by
the production app. The delayed-tick check deliberately blocks the browser for
800 ms to reproduce a stall.
