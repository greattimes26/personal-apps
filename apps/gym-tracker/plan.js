/* Default plan. Changes to the plan are made in chat and brought in with
   More → Import plan (a JSON file with the same shape and "type": "gym-tracker-plan"). */
window.DEFAULT_PLAN = {
  type: 'gym-tracker-plan',
  version: 1,
  name: '5-week plan to 24 Dec',
  startDate: '2026-11-18',
  goalDate: '2026-12-24',
  goalLabel: '24 Dec',
  // JavaScript weekday numbers: 0 = Sunday … 6 = Saturday
  schedule: { '6': 'upperA', '0': 'lower', '2': 'upperB', '3': 'lowerFin' },

  exercises: {
    warmup: { name: 'Warm-up', machine: 'Stationary bike or treadmill', anim: 'bike',
      tips: ['Easy pace: you should still be able to talk.', 'Keep it to 5–10 minutes and save your energy for the weights.'] },
    chestPress: { name: 'Chest press', machine: 'Chest press machine', anim: 'chestPress',
      tips: ['Set the seat so the handles line up with the middle of your chest.', 'Keep your back and shoulder blades against the pad.', 'Push out in about 1 second, come back slowly in 2–3 seconds.'] },
    inclinePress: { name: 'Incline chest press', machine: 'Incline chest press machine', anim: 'inclinePress',
      tips: ['Works the upper chest, which gives the chest its fuller shape.', 'Start with the handles at your upper chest.', 'Press up and forward; don\'t slam your elbows straight at the top.'] },
    pecDeck: { name: 'Pec deck fly', machine: 'Pec deck machine', anim: 'pecDeck',
      tips: ['Keep a slight, fixed bend in your elbows.', 'Squeeze your chest for 1 second when the handles meet.', 'Open only until you feel a stretch across the chest.'] },
    latPulldown: { name: 'Lat pulldown', machine: 'Lat pulldown machine', anim: 'latPulldown',
      tips: ['Lock your thighs under the pad.', 'Pull the bar to your upper chest, driving the elbows down.', 'Lean back slightly; no swinging.'] },
    dbCurl: { name: 'Biceps curl', machine: 'Dumbbells', anim: 'dbCurl',
      tips: ['Palms facing up, elbows pinned to your sides.', 'Only the forearms move.', 'Lower slowly all the way down; that half builds muscle too.'] },
    ropePushdown: { name: 'Triceps rope pushdown', machine: 'Cable machine — rope, high pulley', anim: 'ropePushdown',
      tips: ['Elbows stay glued to your sides.', 'Push down and spread the rope apart at the bottom.', 'Let the rope come up only to chest height.'] },
    preacherCurl: { name: 'Preacher curl', machine: 'Preacher curl machine', anim: 'preacherCurl',
      tips: ['Upper arms flat on the pad, armpits at the top edge.', 'Don\'t lift your elbows off the pad.', 'Lower slowly until the arms are almost straight.'] },
    overheadExt: { name: 'Overhead triceps extension', machine: 'Cable machine — rope, low pulley', anim: 'overheadExt',
      tips: ['Elbows point up and stay close to your head.', 'Let the rope go down behind your head for a stretch, then extend up.', 'Only the forearms move; this works the biggest part of the triceps.'] },
    hammerCurl: { name: 'Hammer curl', machine: 'Dumbbells', anim: 'hammerCurl',
      tips: ['Palms facing each other the whole time.', 'Elbows stay at your sides.', 'Builds the outer biceps and forearm, which makes the arm look thicker.'] },
    seatedDip: { name: 'Seated dip', machine: 'Seated dip machine (triceps dip)', anim: 'seatedDip',
      tips: ['Sit tall with your chest up.', 'Push the handles down until your arms are straight.', 'Keep your shoulders down, away from your ears.'] },
    cableFly: { name: 'Cable fly (low to high)', machine: 'Cable machine — handles, low pulleys', anim: 'cableFly',
      tips: ['Arms slightly bent and fixed.', 'Sweep the handles up and in to chest or chin height.', 'Squeeze the upper chest at the top.'] },
    seatedRow: { name: 'Seated row', machine: 'Seated row machine', anim: 'seatedRow',
      tips: ['Chest up, back straight.', 'Pull to your lower ribs and squeeze your shoulder blades together.', 'Don\'t rock your body back and forth.'] },
    legPress: { name: 'Leg press', machine: 'Leg press machine', anim: 'legPress',
      tips: ['Feet shoulder-width, in the middle of the platform.', 'Lower until your knees are around 90°.', 'Don\'t lock your knees at the top.'] },
    legExtension: { name: 'Leg extension', machine: 'Leg extension machine', anim: 'legExtension',
      tips: ['Line your knee up with the machine\'s pivot.', 'Pad sits on the lower shin.', 'Pause 1 second at the top, lower slowly.'] },
    legCurl: { name: 'Lying leg curl', machine: 'Lying leg curl machine', anim: 'legCurl',
      tips: ['Keep your hips pressed into the pad.', 'Curl your heels toward your glutes.', 'Lower slowly; don\'t let the weight drop.'] },
    calfRaise: { name: 'Standing calf raise', machine: 'Standing calf raise machine', anim: 'calfRaise',
      tips: ['Balls of your feet on the edge of the step.', 'Drop the heels for a full stretch, then rise as high as you can.', 'Pause 1 second at the top.'] },
    machineCrunch: { name: 'Machine crunch', machine: 'Ab crunch machine', anim: 'machineCrunch',
      tips: ['Curl your chest toward your hips; round the back.', 'Breathe out as you crunch.', 'Use your abs, not your arms.'] },
    plank: { name: 'Plank', machine: 'Floor / mat', anim: 'plank',
      tips: ['Elbows under your shoulders.', 'One straight line from head to heels.', 'Squeeze glutes and abs, and keep breathing.'] },
    cableCurl: { name: 'Cable curl', machine: 'Cable machine — bar, low pulley', anim: 'cableCurl',
      tips: ['Elbows pinned to your sides.', 'Squeeze the biceps at the top.', 'Go straight into the pushdown with no rest.'] },
    pushdownFin: { name: 'Rope pushdown', machine: 'Cable machine — rope, high pulley', anim: 'ropePushdown',
      tips: ['Elbows stay at your sides.', 'Spread the rope at the bottom.', 'Rest 60–90 seconds after this, then start the next round.'] },
    inclineWalk: { name: 'Incline walk', machine: 'Treadmill', anim: 'inclineWalk',
      tips: ['Incline about 8–12%, brisk pace.', 'Don\'t hold the rails.', 'This is your main belly-fat burner of the week.'] }
  },

  sessions: [
    { id: 'upperA', name: 'Upper A', focus: 'Chest first, then arms', items: [
      { ex: 'warmup', kind: 'cardio', minutes: '5–10' },
      { ex: 'chestPress', sets: 3, reps: [8, 12] },
      { ex: 'inclinePress', sets: 3, reps: [10, 12] },
      { ex: 'pecDeck', sets: 2, reps: [12, 15] },
      { ex: 'latPulldown', sets: 3, reps: [10, 12] },
      { ex: 'dbCurl', sets: 3, reps: [10, 12] },
      { ex: 'ropePushdown', sets: 3, reps: [10, 12] }
    ] },
    { id: 'lower', name: 'Lower + Core', focus: 'Legs, abs, walking', items: [
      { ex: 'warmup', kind: 'cardio', minutes: '5–10' },
      { ex: 'legPress', sets: 3, reps: [12, 15] },
      { ex: 'legExtension', sets: 2, reps: [12, 15] },
      { ex: 'legCurl', sets: 2, reps: [12, 15] },
      { ex: 'calfRaise', sets: 2, reps: [15, 15] },
      { ex: 'machineCrunch', sets: 3, reps: [12, 15] },
      { ex: 'plank', kind: 'time', sets: 3, reps: [30, 45] },
      { ex: 'inclineWalk', kind: 'cardio', minutes: '15–20' }
    ] },
    { id: 'upperB', name: 'Upper B', focus: 'Arms first, then chest', items: [
      { ex: 'warmup', kind: 'cardio', minutes: '5–10' },
      { ex: 'preacherCurl', sets: 3, reps: [10, 12] },
      { ex: 'overheadExt', sets: 3, reps: [10, 12] },
      { ex: 'hammerCurl', sets: 2, reps: [10, 12] },
      { ex: 'seatedDip', sets: 2, reps: [10, 12] },
      { ex: 'inclinePress', sets: 3, reps: [8, 12] },
      { ex: 'cableFly', sets: 2, reps: [12, 15] },
      { ex: 'seatedRow', sets: 3, reps: [10, 12] }
    ] },
    { id: 'lowerFin', name: 'Lower + Finisher', focus: 'Legs, abs, arm finisher, walking', items: [
      { ex: 'warmup', kind: 'cardio', minutes: '5–10' },
      { ex: 'legPress', sets: 3, reps: [12, 15] },
      { ex: 'legExtension', sets: 2, reps: [12, 15] },
      { ex: 'legCurl', sets: 2, reps: [12, 15] },
      { ex: 'calfRaise', sets: 2, reps: [15, 15] },
      { ex: 'machineCrunch', sets: 3, reps: [12, 15] },
      { ex: 'plank', kind: 'time', sets: 3, reps: [30, 45] },
      { ex: 'cableCurl', sets: 3, reps: [12, 15], group: 'Arm finisher: do these two back to back, 3 rounds' },
      { ex: 'pushdownFin', sets: 3, reps: [12, 15], group: 'Arm finisher: do these two back to back, 3 rounds' },
      { ex: 'inclineWalk', kind: 'cardio', minutes: '15–20' }
    ] }
  ]
};
