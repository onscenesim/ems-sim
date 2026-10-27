# Toxicology draws

The toxicology pool contains 75 independent cases, arranged into 37 parent
choices. A family gets one ticket regardless of its number of variants; each
ungrouped case also gets one ticket. After selecting a family, a second draw
selects one of its eligible variants uniformly.

The 12 chemical eye exposures therefore occupy one parent choice, rather than
12 of 75 choices. With empty history and the current compatible pool, their
combined probability within toxicology is 1/37 (about 2.7%), versus 12/75
(about 16.0%) under flat selection. This does not change toxicology's category
weight or turn any variants into a combined scenario.

Other explicit families include cleaner/irritant fumes, chemical skin exposure,
fuels, inhalant/solvent poisoning, toxic alcohols, lead, caustic ingestion, CO,
opioids, ibuprofen, ethanol, stimulants, serotonergic toxicity, toxic plants/mushrooms, cholinergic exposures,
insulin, tear gas/pepper spray, and the paired toxicology frequent caller.
Clinically distinct cases outside these families retain independent tickets.

## Eligibility, history and reproducibility

- Existing compatibility, difficulty and exact-presentation history filters run
  before grouping. Seeing one eye variant does not remove the entire family.
- A family with no eligible variants has no ticket. A family with fewer remaining
  variants still has one ticket.
- If history exhausts the eligible pool, the existing compatible-pool fallback
  also uses grouped selection rather than reverting to flat weighting.
- Both stages use the existing seeded random generator. Ungrouped categories
  retain their previous single-draw behavior and consume no additional randomness.
- Instructor selection bypasses natural draws and can still select every case
  by its unchanged case ID. Saved scenarios retain the selected case as before.

Families are assigned explicitly in
`src/data/scenarios/toxicology-groups.js`; the reusable selection mechanism is
`src/engine/presentation-selection.js`. Add variants to an existing family to
increase variety without increasing that family's parent weight.

## Verification

Run `npm test` for catalog, clinical contract, detection, grouped probability,
eligibility, fallback and reproducibility checks. Run
`node test/preview-chemical-exposures.js` and open `/draw-preview` on port 3133
for interactive parent/variant draws and a 5,000-call sample. `/chemical-preview`
provides real model scene checks for the 28 chemical exposure cases, with
explicitly staged safe arrival for care checks.

Each new chemical case retains its clinical reference URLs in its private
`chemical_exposure.sources` metadata. These support the exposure-specific
distinctions; local protocols, provider scope and actual equipment still govern
care. No fixed simulation timing is presented as a universal toxicity deadline.

Intentional spray-paint inhalant poisoning shares the inhalant/solvent parent
choice with occupational solvent inhalation. Severe alcohol withdrawal already
has distinct delirium and seizure cases in the behavioral pool; these are not
variants of intoxication. Run `node test/preview-inhalants-withdrawal.js` and open
`/inhalant-withdrawal-preview` on port 3134 for live checks of these cases.
