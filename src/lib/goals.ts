import type { GoalId, Metric, Reading } from "./types";

export type GoalSuggestion = {
  title: string;
  why: string;
  realistic: string;
  shortTerm: string;
  longTerm: string;
};

export const GOALS: { id: GoalId; label: string }[] = [
  { id: "skin", label: "Clearer, calmer skin" },
  { id: "undereye", label: "Brighter under-eyes" },
  { id: "jaw", label: "A sharper jawline" },
  { id: "symmetry", label: "More balance" },
  { id: "grooming", label: "Brows, lips, grooming" },
  { id: "hair", label: "Hair and framing" },
  { id: "rested", label: "A more rested look" },
  { id: "posture", label: "Posture and camera" },
];

const KEYWORDS: { test: RegExp; id: GoalId }[] = [
  { test: /acne|pimple|breakout|pore|mark|scar|texture|dull/i, id: "skin" },
  { test: /red|flush|rosacea/i, id: "skin" },
  { test: /eye|tired|bag|circle|dark/i, id: "undereye" },
  { test: /jaw|chin|profile|double/i, id: "jaw" },
  { test: /sym|uneven|crooked|balance|asymm/i, id: "symmetry" },
  { test: /brow|eyebrow|lip|beard|stubble|groom/i, id: "grooming" },
  { test: /hair|fringe|bangs|frame|glasses/i, id: "hair" },
  { test: /age|wrinkle|line|old|young|rested|fresh/i, id: "rested" },
  { test: /posture|camera|photo|angle|selfie/i, id: "posture" },
];

export function suggestionsFor(reading: Reading, ids: GoalId[], custom: string): GoalSuggestion[] {
  const note = custom.replace(/\s+/g, " ").trim().slice(0, 280);
  const blocked = note ? blockedSuggestion(note, reading) : null;
  if (blocked) return [blocked];

  const chosen = GOALS.map((goal) => goal.id).filter((id) => ids.includes(id));
  const plans = chosen.map((id) => planFor(id, reading));
  if (!note) return plans;

  const matched = KEYWORDS.find((item) => item.test.test(note));
  if (matched && chosen.includes(matched.id)) {
    return plans.map((plan) =>
      plan.title === planFor(matched.id, reading).title
        ? { ...plan, why: `${plan.why} You wrote: “${note}”.` }
        : plan,
    );
  }

  const base = planFor(matched?.id ?? weakestGoal(reading), reading);
  return [
    ...plans,
    {
      ...base,
      title: note.length > 42 ? `${note.slice(0, 42)}…` : note,
      why: `You asked about “${note}”. ${base.why}`,
    },
  ];
}

function blockedSuggestion(note: string, reading: Reading): GoalSuggestion | null {
  if (/bleach|skin\s*bleach|whiten my skin|lighter skin tone|look white|turn white/i.test(note)) {
    const skin = planFor("skin", reading);
    return {
      title: "Evenness, not a lighter tone",
      why: `I won't help you bleach or lighten your skin. You wrote: “${note}”.`,
      realistic: "Skin tone is not something this plan tries to change. Marks, dryness, and redness are a different question.",
      shortTerm: skin.shortTerm,
      longTerm: skin.longTerm,
    };
  }
  if (/surgery|rhinoplasty|implant|filler|botox|liposuction|buccal/i.test(note)) {
    const safe = planFor(weakestGoal(reading), reading);
    return {
      title: "A non-surgical plan",
      why: `You mentioned a procedure. I don't plan surgery, injections, or implants. You wrote: “${note}”.`,
      realistic: `From this scan, what can still change without a procedure is skin, grooming, hair, light, and camera position. The closest lever is ${safe.title.toLowerCase()}.`,
      shortTerm: safe.shortTerm,
      longTerm: "If you want a medical procedure, ask a board-certified clinician in person. This app will not help you shop for one.",
    };
  }
  if (/starve|stop eating|crash diet|hollow cheeks|as skinny as|anorex/i.test(note)) {
    return {
      title: "Not a diet",
      why: `I won't suggest under-eating or hollowing out a face. You wrote: “${note}”.`,
      realistic: "How defined a jaw looks follows overall health, posture, and light over months. A crash diet is not a face plan.",
      shortTerm: "Eat regular meals. For the next photo, use eye-level light and keep the neckline clean if you wear facial hair.",
      longTerm: "A sustainable training habit can change how the jaw reads. If food or weight is becoming a worry, talk to a clinician. That is more important than a jawline.",
    };
  }
  return null;
}

function weakestGoal(reading: Reading): GoalId {
  const ranked = [...reading.metrics].sort((a, b) => a.score - b.score);
  const map: Record<string, GoalId> = {
    symmetry: "symmetry",
    vertical: "hair",
    eyes: "hair",
    tilt: "undereye",
    nose: "hair",
    evenness: "skin",
    texture: "skin",
    redness: "skin",
    shine: "skin",
    undereye: "undereye",
    forehead: "rested",
    crows: "rested",
    folds: "rested",
  };
  for (const metric of ranked) {
    const goal = map[metric.id];
    if (goal) return goal;
  }
  return "skin";
}

function find(reading: Reading, id: string): Metric | undefined {
  return reading.metrics.find((metric) => metric.id === id);
}

function planFor(id: GoalId, reading: Reading): GoalSuggestion {
  const m = (metricId: string) => find(reading, metricId);
  if (id === "skin") {
    const focus = [m("evenness"), m("texture"), m("redness"), m("shine")]
      .filter((metric): metric is Metric => Boolean(metric))
      .sort((a, b) => a.score - b.score)[0];
    return {
      title: "Skin",
      why: focus
        ? `${focus.label} is the skin number to aim at (${focus.score}). ${focus.detail}`
        : "Skin samples were limited, so this stays with the basics that help almost every photo.",
      realistic: "Clearer skin is a month-to-month project. Irritating it to speed that up shows up as more redness in the next scan.",
      shortTerm:
        "Sunscreen in the morning. A gentle cleanser. A moisturizer, on damp skin if you feel tight. No scrubs. If you have active breakouts, benzoyl peroxide 2.5% a few nights a week is enough to start. If you are pregnant or unsure, ask a pharmacist before any active.",
      longTerm:
        "Four to six months of a retinoid, if you are not pregnant and you tolerate it, does more for marks and texture than masks. Adapalene is the usual over-the-counter start, twice a week, then more often. Persistent or painful breakouts belong with a dermatologist.",
    };
  }
  if (id === "undereye") {
    const under = m("undereye");
    return {
      title: "Under-eyes",
      why: under
        ? `Under-eyes score ${under.score}. ${under.detail}`
        : "Under-eyes could not be separated from the background in this frame. The advice is still the part that is safe.",
      realistic: "A hollow is shape and shadow. No cream fills it. Sleep, salt, and rubbing the eyes are the part that actually moves.",
      shortTerm: "Sleep, less salt late, and a cool cloth in the morning. If you use makeup, a peach or neutral corrector changes the photo today. Caffeine gels are a small, temporary help.",
      longTerm: "Sun protection and not tugging the skin are the long version. A filler is a medical procedure, not a step here. A sudden one-sided change should be seen by a clinician.",
    };
  }
  if (id === "jaw") {
    return {
      title: "Jawline",
      why: reading.notes.jaw,
      realistic:
        "Chewing gum, mewing, and facial workouts will not reshape the jaw. The evidence for that is poor. What changes the read of a jaw is light, posture, facial hair, and overall body composition over months.",
      shortTerm:
        "For the next photo: camera at eye level, not below the chin; a soft light in front and slightly above; mouth closed. If you wear facial hair, keep the neck clean and the cheek line tidy.",
      longTerm:
        "A steady training habit and enough food, not a crash diet, is the months-long lever if you want the jaw to read more clearly. A dentist is the person to ask about your bite. A medical procedure is a clinician's conversation, not this plan.",
    };
  }
  if (id === "symmetry") {
    const sym = m("symmetry");
    const where = reading.notes.weakestSymmetry ? ` The largest share is the ${reading.notes.weakestSymmetry}.` : "";
    return {
      title: "Balance",
      why: sym
        ? `Symmetry scores ${sym.score}. ${sym.detail}${where}`
        : "Symmetry could not be scored from enough landmarks.",
      realistic: "Bone is not a mirror, and it does not need to be. Side light and a raised brow create more 'asymmetry' in photos than the skull does.",
      shortTerm:
        "Light both sides, or face the window dead on. Shoot from farther away. If the brows are the mismatch, match their endpoints with a pencil or by brushing the higher one flat.",
      longTerm: "You will not exercise a face into a mirror image. If a lid or a brow has dropped suddenly, that is a medical question, not a grooming one.",
    };
  }
  if (id === "grooming") {
    return {
      title: "Grooming",
      why: `${reading.notes.lips} ${reading.notes.weakestSymmetry === "brows" ? "The brows are the least matched region in the mesh." : "Brows are the fastest grooming change in a photo."}`,
      realistic: "Grooming changes the photo this week. It does not change the scan's bone numbers, and it does not need to.",
      shortTerm:
        "Match brow endpoints and the highest point of each brow. Brush them, then fill only the gaps. On the lips, use balm. If you line them, stay a hair inside the edge. Skip anything that stings; stinging is irritation, not volume.",
      longTerm: "A barber or a brow tidy every few weeks beats a drawer of tools. Facial hair, if you want it, can balance a long lower face or a wide jaw. Keep the neck line deliberate.",
    };
  }
  if (id === "hair") {
    return {
      title: "Hair and framing",
      why: `${reading.notes.shapeText} ${reading.notes.jaw}`,
      realistic: "Hair is the realistic way to change how length and width read. The skull underneath stays.",
      shortTerm: cutLine(reading),
      longTerm: "Grow into one cut you like instead of restyling for every photo. Glasses, if you wear them, are part of the frame: wider frames on a narrow face, more height than width on a broad one.",
    };
  }
  if (id === "rested") {
    const ageBits = [m("forehead"), m("crows"), m("undereye"), m("folds")]
      .filter((metric): metric is Metric => Boolean(metric))
      .sort((a, b) => a.score - b.score);
    const top = ageBits[0];
    return {
      title: "A more rested look",
      why: top
        ? `The age score is ${reading.age}. The least calm cue is ${top.label.toLowerCase()} at ${top.score}. ${top.detail}`
        : `The age score is ${reading.age}. It describes texture and shadow in this photo, not your birthday.`,
      realistic: "You cannot sheet-mask backward. You can stop adding sun damage, and you can make this week look less tired with sleep and water on the skin.",
      shortTerm: "Sleep, sunscreen, and a moisturizer so dryness is not piled on top of whatever texture you have. Take the photo in open shade, not under a hard ceiling light.",
      longTerm:
        "A retinoid you tolerate, most nights, for a year, is the evidence-backed texture plan if you are not pregnant. Sunglasses and a hat do the rest. The goal is a calmer photo over time, not a promised age.",
    };
  }
  return {
    title: "Posture and camera",
    why: "A lot of a 'bad' reading is the camera under the chin or a window to one side. This one is free and it shows up on the next scan.",
    realistic: "Posture changes the picture. It does not remodel the jaw. Tongue-on-palate tricks will not either.",
    shortTerm:
      "Camera at eye height, about an arm and a half away. Chin parallel to the floor. Shoulders down so the neck looks longer. Face the light with both cheeks, or face a window straight on.",
    longTerm: "If you sit for photos often, put the lamp in front of you once and leave it. The habit matters more than a pose tutorial.",
  };
}

function cutLine(reading: Reading): string {
  if (reading.notes.shape === "long") {
    return "Ask for width around the ears and a side part. Skip a very tall, narrow shape. Camera at eye level, not below.";
  }
  if (reading.notes.shape === "wide") {
    return "Ask for a little height on top and less width at the ears. A center part with volume at the sides makes a wide cheek wider.";
  }
  return "Your length and width are balanced enough that most cuts work. Choose the one you will keep. Camera at eye level.";
}
