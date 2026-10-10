# Paired frequent-caller encounters

The random pools and instructor catalog include twelve encounter families with
two variants apiece. Search **Frequent caller —** in instructor mode to find all
24. Variant names and keys are instructor information; dispatch and first
impression are shared within each pair.

| Catalog pool | Potentially sick variant | Stable variant |
| --- | --- | --- |
| Cardiac | ACS amid familiar chest-pain demands | Baseline chest-wall pain |
| Respiratory | Infective COPD exacerbation | Baseline COPD on prescribed oxygen |
| Trauma | Anticoagulated head injury with evolving changes | Controlled slide without new injury |
| Neuro | Breakthrough epileptic seizure | Familiar functional event and baseline symptoms |
| Medical | Missed dialysis with hyperkalemic electrical changes | Post-dialysis baseline symptoms |
| Toxicology | Lithium toxicity after dehydration | Usual fine tremor and chronic nausea |
| Behavioral | Hypoglycemia behind agitation | Conflict-driven distress without acute danger |
| OB | New severe pregnancy-related hypertension and symptoms | Baseline pregnancy discomfort and migraine |
| Pediatric | Interrupted pump delivery with evolving DKA | Chronic symptoms during family conflict |
| Arrest dispatch | True hyperkalemic PEA arrest | Non-arrest collapse followed by hostile interaction |
| Apparent DOA dispatch | Profound hypoglycemia mistaken for death | Awake patient ignoring a neighbor |
| Curveballs | Adrenal crisis after interrupted prednisone | Baseline chronic pain and functional symptoms |

Apparent arrest/death dispatches begin with an unverified report. Immediate
assessment can distinguish them quickly; never delay assessment to prolong
ambiguity. Living patients use a medical/behavioral runtime category, while
`dispatch_category` preserves the source pool. True arrest uses the existing
arrest rules and a seeded rhythm. No new case has irreversible death signs.

Histories are case-specific and persist into gameplay, saved seeds/replay and
debrief context. They replace random comorbidity bundles. Stable variants have
no deterioration clock; generic medical curveballs are replaced by equipment
trouble so they stay stable even on Black Cloud. Explicit instructor overrides
can still change the teaching setup. Unsafe actions can cause realistic harm.

The shared portrayal contract creates friction in both variants, including
skepticism in enthusiastic partners and in captains when contacted/present.
It preserves character differences, accurately measured findings, crew scope,
procedure rolls and hidden-case boundaries. Rudeness may persist after effective
treatment. Debrief judges the recorded assessment and proportionate care,
including crew-bias management, without requiring the hidden diagnosis.

Psychiatric histories vary by case. Bipolar disorder and borderline personality
disorder are not assigned from rude behavior. Documented factitious disorder
coexists with genuine chronic illness in selected adult encounters. Functional
symptoms are involuntary and distinct from fabrication. The adolescent has an
age-appropriate established history without an automatically assigned
personality or factitious diagnosis.

Clinical references used for the overlapping conditions:

- [NICE: borderline personality disorder recommendations](https://www.nice.org.uk/guidance/cg78/chapter/Recommendations): assess and treat coexisting physical and mental conditions.
- [NICE: bipolar disorder recommendations](https://www.nice.org.uk/guidance/cg185/chapter/recommendations): consider physical causes and comorbid conditions during assessment.
- [NHS Specialist Pharmacy Service: lithium monitoring](https://sps.nhs.uk/monitorings/lithium-monitoring/): vomiting, tremor, mental-state changes and falls can accompany toxicity.
- [Society for Endocrinology: adrenal crisis](https://www.endocrinology.org/clinical-practice/clinical-guidance/adrenal-crisis/): glucocorticoid interruption can precipitate a life-threatening emergency.
- [Functional Neurological Disorder: New Phenotypes, Common Mechanisms](https://pmc.ncbi.nlm.nih.gov/articles/PMC9107510/): functional symptoms and other neurologic/physical conditions can coexist.

Treatment details remain governed by the learner's scope and local protocols.
