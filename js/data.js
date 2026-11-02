// Exercise library + Sal's program. All weights in this file are in lb unless noted.
// type: 'compound' (2-3 min rest) | 'small' (60-90 s rest)
// equip: barbell | dumbbell | cable | machine | bodyweight | smith
// bw: load = bodyweight + added weight (weight field = added load)
// noLoad: progress by reps, not weight
export const EX = {
  // ── Chest
  incline_bb:   { name: 'Incline Barbell Press', type: 'compound', equip: 'barbell', muscles: 'Upper chest · front delts', alts: ['incline_db', 'smith_incline', 'incline_machine'] },
  incline_db:   { name: 'Incline Dumbbell Press', type: 'compound', equip: 'dumbbell', muscles: 'Upper chest · front delts', alts: ['incline_bb', 'smith_incline', 'incline_machine'], perHand: true },
  smith_incline:{ name: 'Smith Incline Press', type: 'compound', equip: 'smith', muscles: 'Upper chest', alts: ['incline_bb', 'incline_db', 'incline_machine'] },
  incline_machine:{ name: 'Incline Machine Press', type: 'compound', equip: 'machine', muscles: 'Upper chest', alts: ['incline_db', 'smith_incline', 'incline_bb'] },
  flat_db:      { name: 'Flat Dumbbell Press', type: 'compound', equip: 'dumbbell', muscles: 'Chest · triceps', alts: ['flat_bb_bench', 'machine_chest', 'smith_flat'], perHand: true },
  flat_bb_bench:{ name: 'Barbell Bench Press', type: 'compound', equip: 'barbell', muscles: 'Chest · triceps', alts: ['flat_db', 'machine_chest', 'smith_flat'] },
  machine_chest:{ name: 'Machine Chest Press', type: 'compound', equip: 'machine', muscles: 'Chest', alts: ['flat_db', 'flat_bb_bench', 'smith_flat'] },
  smith_flat:   { name: 'Smith Flat Press', type: 'compound', equip: 'smith', muscles: 'Chest', alts: ['flat_db', 'flat_bb_bench', 'machine_chest'] },
  cable_fly_lth:{ name: 'Low-to-High Cable Fly', type: 'small', equip: 'cable', muscles: 'Upper chest', alts: ['incline_db_fly', 'pec_deck', 'band_fly_lth'] },
  incline_db_fly:{ name: 'Incline Dumbbell Fly', type: 'small', equip: 'dumbbell', muscles: 'Upper chest', alts: ['cable_fly_lth', 'pec_deck'], perHand: true },
  pec_deck:     { name: 'Pec Deck Fly', type: 'small', equip: 'machine', muscles: 'Chest', alts: ['cable_fly_lth', 'incline_db_fly'] },
  band_fly_lth: { name: 'Band Low-to-High Fly', type: 'small', equip: 'bodyweight', muscles: 'Upper chest', alts: ['cable_fly_lth', 'incline_db_fly'] },
  dips:         { name: 'Dips', type: 'compound', equip: 'bodyweight', bw: true, muscles: 'Lower chest · triceps', alts: ['assisted_dip', 'machine_dip', 'machine_chest'] },
  assisted_dip: { name: 'Assisted Dip Machine', type: 'compound', equip: 'machine', muscles: 'Chest · triceps', alts: ['dips', 'machine_dip'], note: 'Log the assist weight as a negative number, e.g. -40' },
  machine_dip:  { name: 'Seated Dip Machine', type: 'compound', equip: 'machine', muscles: 'Triceps · chest', alts: ['dips', 'assisted_dip'] },
  // ── Shoulders
  db_shoulder:  { name: 'Seated DB Shoulder Press', type: 'compound', equip: 'dumbbell', muscles: 'Front & side delts', alts: ['machine_shoulder', 'smith_ohp', 'bb_ohp'], perHand: true },
  machine_shoulder:{ name: 'Machine Shoulder Press', type: 'compound', equip: 'machine', muscles: 'Delts', alts: ['db_shoulder', 'smith_ohp', 'bb_ohp'] },
  smith_ohp:    { name: 'Smith Seated Overhead Press', type: 'compound', equip: 'smith', muscles: 'Delts', alts: ['db_shoulder', 'machine_shoulder', 'bb_ohp'] },
  bb_ohp:       { name: 'Barbell Overhead Press', type: 'compound', equip: 'barbell', muscles: 'Delts · triceps', alts: ['db_shoulder', 'machine_shoulder', 'smith_ohp'] },
  cable_lateral:{ name: 'Cable Lateral Raise', type: 'small', equip: 'cable', muscles: 'Side delts', alts: ['db_lateral', 'machine_lateral', 'leanaway_lateral'] },
  db_lateral:   { name: 'Dumbbell Lateral Raise', type: 'small', equip: 'dumbbell', muscles: 'Side delts', alts: ['cable_lateral', 'machine_lateral', 'leanaway_lateral'], perHand: true },
  machine_lateral:{ name: 'Machine Lateral Raise', type: 'small', equip: 'machine', muscles: 'Side delts', alts: ['cable_lateral', 'db_lateral'] },
  leanaway_lateral:{ name: 'Lean-Away DB Lateral', type: 'small', equip: 'dumbbell', muscles: 'Side delts', alts: ['cable_lateral', 'db_lateral'], perHand: true },
  face_pull:    { name: 'Face Pull', type: 'small', equip: 'cable', muscles: 'Rear delts · upper back', alts: ['rear_delt_cable', 'reverse_pec_deck', 'band_pullapart'] },
  rear_delt_cable:{ name: 'Rear-Delt Cable Fly', type: 'small', equip: 'cable', muscles: 'Rear delts', alts: ['reverse_pec_deck', 'face_pull', 'db_rear_fly'] },
  reverse_pec_deck:{ name: 'Reverse Pec Deck', type: 'small', equip: 'machine', muscles: 'Rear delts', alts: ['rear_delt_cable', 'face_pull', 'db_rear_fly'] },
  db_rear_fly:  { name: 'Bent-Over DB Rear-Delt Fly', type: 'small', equip: 'dumbbell', muscles: 'Rear delts', alts: ['rear_delt_cable', 'reverse_pec_deck'], perHand: true },
  band_pullapart:{ name: 'Band Pull-Apart', type: 'small', equip: 'bodyweight', muscles: 'Rear delts', alts: ['face_pull', 'rear_delt_cable'] },
  // ── Back
  pullup_w:     { name: 'Weighted Pull-Up', type: 'compound', equip: 'bodyweight', bw: true, muscles: 'Lats · biceps', alts: ['chinup_w', 'neutral_pullup', 'assisted_pullup'] },
  chinup_w:     { name: 'Weighted Chin-Up', type: 'compound', equip: 'bodyweight', bw: true, muscles: 'Lats · biceps', alts: ['pullup_w', 'neutral_pullup', 'assisted_pullup'] },
  neutral_pullup:{ name: 'Neutral-Grip Pull-Up', type: 'compound', equip: 'bodyweight', bw: true, muscles: 'Lats', alts: ['pullup_w', 'chinup_w', 'assisted_pullup'] },
  assisted_pullup:{ name: 'Assisted Pull-Up Machine', type: 'compound', equip: 'machine', muscles: 'Lats', alts: ['pullup_w', 'neutral_pullup'], note: 'Log the assist weight as a negative number, e.g. -30' },
  cs_row:       { name: 'Chest-Supported Row', type: 'compound', equip: 'machine', muscles: 'Mid back · lats', alts: ['seated_cable_row', 'machine_row', 'sa_db_row'] },
  seated_cable_row:{ name: 'Seated Cable Row', type: 'compound', equip: 'cable', muscles: 'Mid back · lats', alts: ['cs_row', 'machine_row', 'sa_db_row'] },
  machine_row:  { name: 'Machine Row', type: 'compound', equip: 'machine', muscles: 'Mid back', alts: ['cs_row', 'seated_cable_row', 'sa_db_row'] },
  incline_db_row:{ name: 'Chest-Supported Incline DB Row', type: 'compound', equip: 'dumbbell', muscles: 'Mid back · lats', alts: ['cs_row', 'sa_db_row', 'seated_cable_row'], perHand: true },
  sa_db_row:    { name: 'Single-Arm DB Row', type: 'compound', equip: 'dumbbell', muscles: 'Lats · mid back', alts: ['sa_cable_row', 'cs_row', 'seated_cable_row'] },
  sa_cable_row: { name: 'Single-Arm Cable Row', type: 'small', equip: 'cable', muscles: 'Lats', alts: ['sa_db_row', 'seated_cable_row', 'machine_row'] },
  // ── Arms
  rope_pushdown:{ name: 'Rope Triceps Pushdown', type: 'small', equip: 'cable', muscles: 'Triceps', alts: ['bar_pushdown', 'sa_pushdown', 'db_skull'] },
  bar_pushdown: { name: 'Straight-Bar Pushdown', type: 'small', equip: 'cable', muscles: 'Triceps', alts: ['rope_pushdown', 'sa_pushdown', 'db_skull'] },
  sa_pushdown:  { name: 'Single-Arm Cable Pushdown', type: 'small', equip: 'cable', muscles: 'Triceps', alts: ['rope_pushdown', 'bar_pushdown'] },
  db_skull:     { name: 'DB Skull Crusher', type: 'small', equip: 'dumbbell', muscles: 'Triceps', alts: ['rope_pushdown', 'ez_skull'], perHand: true },
  oh_tri_ext:   { name: 'Overhead Cable Triceps Ext.', type: 'small', equip: 'cable', muscles: 'Triceps (long head)', alts: ['db_oh_ext', 'ez_skull', 'rope_pushdown'] },
  db_oh_ext:    { name: 'DB Overhead Triceps Ext.', type: 'small', equip: 'dumbbell', muscles: 'Triceps (long head)', alts: ['oh_tri_ext', 'ez_skull'] },
  ez_skull:     { name: 'EZ-Bar Skull Crusher', type: 'small', equip: 'barbell', muscles: 'Triceps', alts: ['oh_tri_ext', 'db_oh_ext'] },
  ez_curl:      { name: 'EZ-Bar Curl', type: 'small', equip: 'barbell', muscles: 'Biceps', alts: ['db_curl', 'cable_curl', 'bb_curl'] },
  db_curl:      { name: 'Dumbbell Curl', type: 'small', equip: 'dumbbell', muscles: 'Biceps', alts: ['ez_curl', 'cable_curl', 'hammer_curl'], perHand: true },
  cable_curl:   { name: 'Cable Curl', type: 'small', equip: 'cable', muscles: 'Biceps', alts: ['ez_curl', 'db_curl', 'bayesian_curl'] },
  bb_curl:      { name: 'Barbell Curl', type: 'small', equip: 'barbell', muscles: 'Biceps', alts: ['ez_curl', 'db_curl', 'cable_curl'] },
  hammer_curl:  { name: 'Hammer Curl', type: 'small', equip: 'dumbbell', muscles: 'Biceps · forearms', alts: ['db_curl', 'cable_curl'], perHand: true },
  incline_curl: { name: 'Incline DB Curl', type: 'small', equip: 'dumbbell', muscles: 'Biceps (long head)', alts: ['bayesian_curl', 'db_curl', 'preacher_curl'], perHand: true },
  bayesian_curl:{ name: 'Bayesian Cable Curl', type: 'small', equip: 'cable', muscles: 'Biceps (long head)', alts: ['incline_curl', 'cable_curl', 'preacher_curl'] },
  preacher_curl:{ name: 'Preacher Curl', type: 'small', equip: 'machine', muscles: 'Biceps', alts: ['incline_curl', 'bayesian_curl', 'ez_curl'] },
  // ── Legs (squat-focused by design)
  back_squat:   { name: 'Back Squat', type: 'compound', equip: 'barbell', muscles: 'Quads · glutes', alts: ['smith_squat', 'hack_squat', 'front_squat'] },
  smith_squat:  { name: 'Smith Machine Squat', type: 'compound', equip: 'smith', muscles: 'Quads · glutes', alts: ['back_squat', 'hack_squat', 'front_squat'] },
  hack_squat:   { name: 'Hack Squat', type: 'compound', equip: 'machine', muscles: 'Quads', alts: ['back_squat', 'smith_squat', 'front_squat'] },
  front_squat:  { name: 'Front Squat', type: 'compound', equip: 'barbell', muscles: 'Quads · core', alts: ['back_squat', 'smith_squat', 'hack_squat'] },
  bb_bulgarian: { name: 'Barbell Bulgarian Split Squat', type: 'compound', equip: 'barbell', muscles: 'Quads · glutes', alts: ['back_squat', 'smith_squat'], perSide: true },
  deadlift:     { name: 'Deadlift', type: 'compound', equip: 'barbell', muscles: 'Back · glutes · grip', alts: ['trap_bar_dl', 'rack_pull'] },
  trap_bar_dl:  { name: 'Trap-Bar Deadlift', type: 'compound', equip: 'barbell', muscles: 'Back · legs · grip', alts: ['deadlift', 'rack_pull'] },
  rack_pull:    { name: 'Rack Pull', type: 'compound', equip: 'barbell', muscles: 'Back · grip', alts: ['deadlift', 'trap_bar_dl'] },
  // ── Core
  hanging_leg_raise:{ name: 'Hanging Leg Raise', type: 'small', equip: 'bodyweight', noLoad: true, muscles: 'Lower abs', alts: ['captains_chair', 'reverse_crunch', 'lying_leg_raise'] },
  captains_chair:{ name: "Captain's Chair Leg Raise", type: 'small', equip: 'machine', noLoad: true, muscles: 'Lower abs', alts: ['hanging_leg_raise', 'reverse_crunch'] },
  reverse_crunch:{ name: 'Bench Reverse Crunch', type: 'small', equip: 'bodyweight', noLoad: true, muscles: 'Lower abs', alts: ['hanging_leg_raise', 'lying_leg_raise'] },
  lying_leg_raise:{ name: 'Lying Leg Raise', type: 'small', equip: 'bodyweight', noLoad: true, muscles: 'Lower abs', alts: ['hanging_leg_raise', 'reverse_crunch'] },
  woodchop:     { name: 'Cable Woodchop', type: 'small', equip: 'cable', muscles: 'Obliques', alts: ['landmine_rotation', 'russian_twist', 'side_plank_dip'], perSide: true },
  landmine_rotation:{ name: 'Landmine Rotation', type: 'small', equip: 'barbell', muscles: 'Obliques', alts: ['woodchop', 'russian_twist'] },
  russian_twist:{ name: 'Weighted Russian Twist', type: 'small', equip: 'dumbbell', muscles: 'Obliques', alts: ['woodchop', 'side_plank_dip'] },
  side_plank_dip:{ name: 'Side Plank Hip Dip', type: 'small', equip: 'bodyweight', noLoad: true, muscles: 'Obliques', alts: ['woodchop', 'russian_twist'], perSide: true },
  cable_crunch: { name: 'Cable Crunch', type: 'small', equip: 'cable', muscles: 'Upper abs', alts: ['machine_crunch', 'plate_crunch', 'ab_wheel'] },
  machine_crunch:{ name: 'Ab Crunch Machine', type: 'small', equip: 'machine', muscles: 'Abs', alts: ['cable_crunch', 'plate_crunch'] },
  plate_crunch: { name: 'Weighted Plate Crunch', type: 'small', equip: 'bodyweight', muscles: 'Abs', alts: ['cable_crunch', 'machine_crunch'] },
  decline_situp:{ name: 'Weighted Decline Sit-Up', type: 'small', equip: 'bodyweight', muscles: 'Abs', alts: ['plate_crunch', 'ab_wheel', 'machine_crunch'] },
  ab_wheel:     { name: 'Ab Wheel Rollout', type: 'small', equip: 'bodyweight', noLoad: true, muscles: 'Abs · core', alts: ['decline_situp', 'cable_crunch'] },
};

const S = (n, min, max, extra = {}) => Array.from({ length: n }, () => ({ min, max, ...extra }));

// Workouts. blocks: an array of groups; a group with >1 item is a superset.
export const WORKOUTS = {
  A: {
    id: 'A', name: 'Upper Chest & Shoulders', est: 50, hue: ['#0A84FF', '#5E5CE6'],
    blocks: [
      [{ slot: 'A1', ex: 'incline_bb', sets: [{ min: 5, max: 8, label: 'Top' }, { min: 8, max: 10, label: 'Back-off', pct: 0.88 }, { min: 8, max: 10, label: 'Back-off', pct: 0.88 }] }],
      [{ slot: 'A2', ex: 'db_shoulder', sets: S(3, 8, 10) }],
      [{ slot: 'A3', ex: 'cable_fly_lth', sets: S(3, 12, 15) }, { slot: 'A4', ex: 'rope_pushdown', sets: S(3, 10, 15) }],
      [{ slot: 'A5', ex: 'cable_lateral', sets: S(3, 15, 20) }, { slot: 'A6', ex: 'face_pull', sets: S(3, 12, 15) }],
    ],
  },
  B1: {
    id: 'B1', name: 'Heavy Legs', est: 40, hue: ['#FF9F0A', '#FF453A'],
    blocks: [
      [{ slot: 'B1a', ex: 'back_squat', sets: S(4, 5, 6) }],
      [{ slot: 'B1b', ex: 'deadlift', sets: S(2, 5, 5), optional: true, tip: 'Optional · moderate weight, not all-out' }],
      [{ slot: 'B1c', ex: 'hanging_leg_raise', sets: S(3, 10, 15) }, { slot: 'B1d', ex: 'woodchop', sets: S(3, 10, 15) }],
    ],
  },
  B2: {
    id: 'B2', name: 'Volume Legs', est: 40, hue: ['#FF375F', '#FF9F0A'],
    blocks: [
      [{ slot: 'B2a', ex: 'back_squat', sets: S(3, 10, 12), extraAlts: ['bb_bulgarian'], tip: '~65–70% of your heavy-day weight' }],
      [{ slot: 'B2b', ex: 'cable_crunch', sets: S(3, 10, 15) }, { slot: 'B2c', ex: 'decline_situp', sets: S(3, 10, 15) }],
      [{ slot: 'B2d', ex: 'cable_lateral', sets: S(2, 15, 20), bonus: true }, { slot: 'B2e', ex: 'db_curl', sets: S(2, 8, 12), bonus: true }],
    ],
  },
  C: {
    id: 'C', name: 'Back & Arms', est: 50, hue: ['#30D158', '#64D2FF'],
    blocks: [
      [{ slot: 'C1', ex: 'pullup_w', sets: S(3, 5, 8) }],
      [{ slot: 'C2', ex: 'incline_db', sets: S(3, 8, 12) }],
      [{ slot: 'C3', ex: 'cs_row', sets: S(3, 8, 12) }],
      [{ slot: 'C4', ex: 'cable_lateral', sets: S(3, 15, 20) }, { slot: 'C5', ex: 'ez_curl', sets: S(3, 8, 12) }],
    ],
  },
  D: {
    id: 'D', name: 'Shoulders & Arms', est: 45, hue: ['#BF5AF2', '#FF375F'],
    blocks: [
      [{ slot: 'D1', ex: 'flat_db', sets: S(3, 6, 10) }],
      [{ slot: 'D2', ex: 'sa_cable_row', sets: S(3, 10, 12) }],
      [{ slot: 'D3', ex: 'dips', sets: S(3, 8, 12) }],
      [{ slot: 'D4', ex: 'cable_lateral', sets: S(3, 15, 20) }, { slot: 'D5', ex: 'rear_delt_cable', sets: S(3, 12, 15) }],
      [{ slot: 'D6', ex: 'incline_curl', sets: S(3, 10, 12) }, { slot: 'D7', ex: 'oh_tri_ext', sets: S(3, 10, 15) }],
    ],
  },
};

// V: optional bonus "Vanity" day (v1.7). Not part of ROTATION: done as a bonus it never moves the pointer;
// done "instead of B2" (only offered when B2 is next) it takes B2's place and advances past it.
// Exercise ids are the same as on other days, so starting weights come from Sal's history for those lifts.
WORKOUTS.V = {
  id: 'V', name: 'Vanity: Delts, Arms & Abs', est: 45, estShort: 30, hue: ['#FFD60A', '#FF9F0A'], bonus: true, rest: 90, shortBlocks: 3,
  blocks: [
    [{ slot: 'V1', ex: 'smith_incline', sets: [{ min: 8, max: 12 }, { min: 8, max: 12 }, { min: 8, max: 12, label: '~1 RIR' }], tip: 'Bench at ~30°. Last set to ~1 rep in reserve.' }],
    [{ slot: 'V2', ex: 'cable_lateral', sets: S(4, 12, 20), tip: 'Behind-the-body: cable low and behind you. Finish each set with lengthened partials (bottom half) to failure.' },
     { slot: 'V3', ex: 'rear_delt_cable', sets: S(3, 15, 20), tip: 'Reverse cable fly for rear delts. Arms long, sweep out wide.' }],
    [{ slot: 'V4', ex: 'bayesian_curl', sets: S(3, 10, 15), tip: 'Face away from the cable, arm behind the body: long-head stretch.' },
     { slot: 'V5', ex: 'oh_tri_ext', sets: S(3, 10, 15), tip: 'Overhead: long-head stretch. Full lockout.' }],
    [{ slot: 'V6', ex: 'cable_fly_lth', sets: S(3, 12, 15) }, { slot: 'V7', ex: 'hammer_curl', sets: S(2, 10, 12) }],
    [{ slot: 'V8', ex: 'cable_crunch', sets: S(3, 10, 15) }, { slot: 'V9', ex: 'hanging_leg_raise', sets: S(2, 8, 15), rir: [1, 2], tip: 'Two sets to 1–2 reps in reserve. Curl the pelvis up, no swinging.' }],
  ],
};
// v1.9: 3-session full-body rotation for 2–3 sessions/week, ~50–55 min, laid out by STATION.
// Barbell lifts (squat rack, incline bench rack) are straight sets, never supersetted. Supersets only
// pair moves at ONE station: a bench + dumbbells, the pull-up bar, or one cable crossover. Every session
// trains back, chest, side delts, arms and legs. Short mode (shortKeep) drops the barbell work and keeps
// the press/row superset + delts (~25 min). A–D are retired (kept so old sessions still render).
WORKOUTS.F1 = {
  id: 'F1', name: 'Full Body 1 · Squat', est: 52, estShort: 25, shortKeep: [2, 4], hue: ['#0A84FF', '#30D158'],
  blocks: [
    [{ slot: 'F1a', ex: 'back_squat', sets: S(3, 5, 6), tip: 'Squat rack. Straight sets, ~2.5 min rest.' }],
    [{ slot: 'F1b', ex: 'incline_db', sets: S(3, 8, 12), tip: 'Station: one incline bench at ~30° + dumbbells. Press, then lie chest-down on the same bench and row.' },
     { slot: 'F1c', ex: 'incline_db_row', sets: S(3, 8, 12) }],
    [{ slot: 'F1h', ex: 'pullup_w', sets: S(3, 5, 8), tip: 'Station: pull-up bar. Pull-ups, then leg raises on the same bar.' }, { slot: 'F1i', ex: 'hanging_leg_raise', sets: S(2, 10, 15) }],
    [{ slot: 'F1d', ex: 'db_lateral', sets: S(4, 12, 20), tip: 'Dumbbells. Slow 3-s lowering, lead with the weaker arm.' }, { slot: 'F1e', ex: 'db_rear_fly', sets: S(3, 12, 15) }],
    [{ slot: 'F1f', ex: 'db_curl', sets: S(3, 8, 12) }, { slot: 'F1g', ex: 'db_oh_ext', sets: S(3, 10, 15) }],
  ],
};
WORKOUTS.F2 = {
  id: 'F2', name: 'Full Body 2 · Incline Bar', est: 54, estShort: 25, shortKeep: [1, 4], hue: ['#BF5AF2', '#FF9F0A'],
  blocks: [
    [{ slot: 'F2a', ex: 'incline_bb', sets: [{ min: 5, max: 8, label: 'Top' }, { min: 8, max: 10, label: 'Back-off', pct: 0.88 }, { min: 8, max: 10, label: 'Back-off', pct: 0.88 }], tip: 'Incline bench rack at ~30°. Straight sets, ~2.5 min rest.' }],
    [{ slot: 'F2h', ex: 'back_squat', sets: S(3, 8, 10), extraAlts: ['bb_bulgarian'], tip: 'Squat rack. Lighter day: ~70% of your heavy squat, 2 min rest.' }],
    [{ slot: 'F2b', ex: 'pullup_w', sets: S(3, 5, 8), tip: 'Station: pull-up bar. Pull-ups, then leg raises on the same bar.' }, { slot: 'F2c', ex: 'hanging_leg_raise', sets: S(2, 10, 15) }],
    [{ slot: 'F2d', ex: 'cable_lateral', sets: S(4, 12, 20), tip: 'Station: cable crossover, low pulleys. Behind-the-body laterals.' }, { slot: 'F2e', ex: 'rear_delt_cable', sets: S(3, 12, 15) }],
    [{ slot: 'F2f', ex: 'cable_fly_lth', sets: S(3, 12, 15), tip: 'Same crossover, pulleys stay low.' }, { slot: 'F2g', ex: 'bayesian_curl', sets: S(3, 10, 15) }],
  ],
};
WORKOUTS.F3 = {
  id: 'F3', name: 'Full Body 3 · Deadlift', est: 50, estShort: 25, shortKeep: [3, 4], hue: ['#FF375F', '#64D2FF'],
  blocks: [
    [{ slot: 'F3a', ex: 'deadlift', sets: S(2, 5, 5), tip: 'Two crisp sets, 1–2 reps in reserve. Not a grinder.' }],
    [{ slot: 'F3b', ex: 'neutral_pullup', sets: S(3, 6, 10), tip: 'Station: pull-up bar.' }, { slot: 'F3c', ex: 'hanging_leg_raise', sets: S(2, 10, 15) }],
    [{ slot: 'F3d', ex: 'flat_db', sets: S(3, 6, 10), tip: 'Station: one flat bench + dumbbells. Press, then row on the same bench.' }, { slot: 'F3e', ex: 'sa_db_row', sets: S(3, 8, 12) }],
    [{ slot: 'F3f', ex: 'cable_lateral', sets: S(4, 12, 20), tip: 'Station: cable crossover. Laterals on the low pulley, triceps on the other side.' }, { slot: 'F3g', ex: 'oh_tri_ext', sets: S(3, 10, 15) }],
    [{ slot: 'F3h', ex: 'incline_curl', sets: S(3, 10, 12), tip: 'Grab dumbbells and an incline bench.' }],
  ],
};
for (const id of ['A', 'B1', 'B2', 'C', 'D']) WORKOUTS[id].retired = true;

export const BONUS = ['V'];
export const PROGRAM = 'fb3-v2';
export const ROTATION = ['F1', 'F2', 'F3'];
// V is now a pure bonus (a 4th session on a good week); it never replaces a rotation slot.
export const V_REPLACES = null;
// Workouts you can pick to start/log (retired ones only render in history).
export const ACTIVE_WORKOUTS = () => Object.values(WORKOUTS).filter((w) => !w.retired);

// Starting points from Sal's estimated old 1RMs (lb). Only these are seeded; every
// other lift starts blank so the first session sets a real baseline.
export const SEED_E1RM = { back_squat: 260, deadlift: 265, flat_bb_bench: 160 };
// Starting working weights (~70% e1RM, 2–3 RIR for the first two weeks)
export const SEED_SLOTS = {
  'B1a|back_squat': { w: 175, unit: 'lb' },
  'B2a|back_squat': { w: 120, unit: 'lb' },
  'B1b|deadlift':   { w: 185, unit: 'lb' },
  'D1|flat_bb_bench': { w: 115, unit: 'lb' },
  'F1a|back_squat': { w: 175, unit: 'lb' },
  'F3a|deadlift':   { w: 185, unit: 'lb' },
  'F2h|back_squat': { w: 125, unit: 'lb' },
};

export const EQUIP_LABEL = { barbell: 'Barbell', dumbbell: 'Dumbbell', cable: 'Cable', machine: 'Machine', bodyweight: 'Bodyweight', smith: 'Smith' };
