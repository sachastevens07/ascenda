# Movement families for genuine swaps (decided 21 Nov 2026). Order inside a family = closeness:
# neighbours in the list are the closest swaps. An exercise alone in its family has no swaps.
FAMILIES = {
 "squat": ["barbell-back-squat","smith-machine-squat","hack-squat","leg-press","goblet-squat","dumbbell-box-squat","bodyweight-box-squat"],
 "knee_extension": ["leg-extension"],
 "hinge_deadlift": ["barbell-romanian-deadlift","trap-bar-deadlift","dumbbell-romanian-deadlift","kettlebell-deadlift","cable-pull-through"],
 "hinge_single_leg": ["single-leg-romanian-deadlift"],
 "hip_thrust": ["barbell-hip-thrust","hip-thrust-machine","dumbbell-hip-thrust","dumbbell-glute-bridge","bodyweight-glute-bridge","single-leg-glute-bridge"],
 "leg_curl": ["seated-leg-curl","lying-leg-curl"],
 "glute_kickback": ["cable-glute-kickback"],
 "hip_abduction": ["hip-abduction-machine","cable-hip-abduction","side-lying-hip-abduction"],
 "lunge_split": ["bulgarian-split-squat","dumbbell-split-squat","dumbbell-reverse-lunge","walking-lunge","bodyweight-reverse-lunge","dumbbell-step-up"],
 "calf_raise": ["calf-raise-machine","dumbbell-calf-raise"],
 "horizontal_press": ["barbell-bench-press","dumbbell-bench-press","chest-press-machine","dumbbell-floor-press","incline-dumbbell-press","push-up","incline-push-up"],
 "chest_fly": ["pec-deck","dumbbell-chest-fly"],
 "overhead_press": ["shoulder-press-machine","seated-dumbbell-shoulder-press","standing-dumbbell-shoulder-press"],
 "lateral_raise": ["cable-lateral-raise","dumbbell-lateral-raise"],
 "row": ["seated-cable-row","single-arm-cable-row","chest-supported-dumbbell-row","one-arm-dumbbell-row","bent-over-dumbbell-row","barbell-bent-over-row"],
 "vertical_pull": ["lat-pulldown","assisted-pull-up"],
 "rear_delt": ["reverse-pec-deck","face-pull","dumbbell-reverse-fly"],
 "biceps_curl": ["cable-biceps-curl","dumbbell-biceps-curl","hammer-curl"],
 "triceps_extension": ["triceps-pushdown","overhead-dumbbell-triceps-extension","dumbbell-triceps-kickback"],
 "core_bracing": ["forearm-plank","dead-bug","bird-dog"],
 "core_anti_rotation": ["pallof-press","side-plank"],
 "core_flexion": ["cable-crunch","reverse-crunch","hanging-knee-raise"],
 "carry": ["farmer-carry","suitcase-carry"],
}
MAX_SWAPS = 3
FAMILY_OF = {s: f for f, ms in FAMILIES.items() for s in ms}
def swaps(slug):
    ms = FAMILIES[FAMILY_OF[slug]]; i = ms.index(slug)
    others = sorted((m for m in ms if m != slug), key=lambda m: (abs(ms.index(m) - i), ms.index(m)))
    return others[:MAX_SWAPS]
