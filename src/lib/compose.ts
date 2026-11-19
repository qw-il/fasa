import type { Issue } from "./quality";
import { confidenceFrom, expressionSentence } from "./quality";
import type { SkinReport } from "./skin";
import type { RegionName, StructureReport } from "./structure";
import { MODEL_NAME, type Metric, type Reading } from "./types";

const REGION_LABEL: Record<RegionName, string> = {
  eyes: "eyes",
  brows: "brows",
  mouth: "mouth",
  jaw: "jaw and cheeks",
};

export function composeReading(args: {
  structure: StructureReport;
  skin: SkinReport;
  issues: Issue[];
  blends: Record<string, number>;
  capturedAt?: string;
}): Reading {
  const { structure, skin, issues, blends } = args;
  const confidence = confidenceFrom(issues, blends);
  const expression = expressionSentence(blends);
  const metrics = buildMetrics(structure, skin);
  const structureScore = structure.score;
  const skinScore = skin.score;
  const ageScore = skin.ageScore;
  const overall = Math.round((structureScore + skinScore + ageScore) / 3);
  const ranked = [...metrics].sort((a, b) => b.score - a.score);
  const strengths = ranked.slice(0, 3);
  const focus = [...metrics].sort((a, b) => a.score - b.score).filter((metric) => metric.score < 86).slice(0, 3);
  const plans = buildPlans(metrics, structure, skin, confidence.value);

  return {
    overall,
    structure: structureScore,
    skin: skinScore,
    age: ageScore,
    confidence: confidence.value,
    confidenceNotes: confidence.notes,
    expression,
    metrics,
    strengths,
    focus,
    essay: essay({ overall, structureScore, skinScore, ageScore, structure, skin, expression, focus }),
    realistic: plans.realistic,
    shortTerm: plans.shortTerm,
    longTerm: plans.longTerm,
    capturedAt: args.capturedAt ?? new Date().toISOString(),
    model: MODEL_NAME,
    notes: {
      jaw: structure.jaw.note,
      lips: structure.lips.note,
      shape: structure.shape,
      shapeText: structure.shapeText,
      weakestSymmetry: structure.symmetry.weakest,
    },
  };
}

function buildMetrics(structure: StructureReport, skin: SkinReport): Metric[] {
  const metrics: Metric[] = [
    {
      id: "symmetry",
      group: "structure",
      label: "Symmetry",
      score: structure.symmetry.score,
      detail: `${(structure.symmetry.error * 100).toFixed(1)}% mismatch across the face. ${
        structure.symmetry.weakest
          ? `The largest share is the ${REGION_LABEL[structure.symmetry.weakest]}.`
          : "No single region stands out."
      }`,
    },
  ];
  if (structure.vertical.valid) {
    metrics.push({
      id: "vertical",
      group: "structure",
      label: "Vertical balance",
      score: structure.vertical.score,
      detail: `The lower face is ${structure.vertical.ratio.toFixed(2)}× the midface. Near 1.00 is the even reference; 0.9 to 1.2 is ordinary.`,
    });
  }
  if (structure.eyes.valid) {
    metrics.push({
      id: "eyes",
      group: "structure",
      label: "Eye spacing",
      score: structure.eyes.score,
      detail: `The gap between the eyes is ${structure.eyes.ratio.toFixed(2)}× one eye width. Near 1.00 is the usual reference.`,
    });
    metrics.push({
      id: "tilt",
      group: "structure",
      label: "Eye tilt",
      score: structure.tilt.score,
      detail: `Outer corners: ${structure.tilt.left.toFixed(1)}° on the left of the photo, ${structure.tilt.right.toFixed(1)}° on the right. Positive means the outer corner is higher.`,
    });
  }
  if (structure.nose.valid) {
    metrics.push({
      id: "nose",
      group: "structure",
      label: "Nose width",
      score: structure.nose.score,
      detail: `Nose width is ${structure.nose.ratio.toFixed(2)}× the gap between the eyes. A proportion, not a character grade.`,
    });
  }
  const skinMetrics: [keyof SkinReport, string, "skin" | "age"][] = [
    ["evenness", "Evenness", "skin"],
    ["texture", "Texture", "skin"],
    ["redness", "Redness", "skin"],
    ["shine", "Shine", "skin"],
    ["underEye", "Under-eyes", "skin"],
    ["forehead", "Forehead", "age"],
    ["crows", "Outer eyes", "age"],
    ["folds", "Midface folds", "age"],
  ];
  for (const [key, label, group] of skinMetrics) {
    const value = skin[key];
    if (!value || typeof value === "number") continue;
    if (!value.valid) continue;
    metrics.push({
      id: key === "underEye" ? "undereye" : key,
      group: key === "underEye" ? "skin" : group,
      label,
      score: value.score,
      detail: value.detail,
    });
  }
  return metrics;
}

function essay(args: {
  overall: number;
  structureScore: number;
  skinScore: number;
  ageScore: number;
  structure: StructureReport;
  skin: SkinReport;
  expression: string;
  focus: Metric[];
}): string[] {
  const { overall, structureScore, skinScore, ageScore, structure, skin, expression, focus } = args;
  const lead = characterLine(structureScore, skinScore, ageScore);
  const weak = focus[0];
  const promise = weak
    ? `The number most worth a plan is ${weak.label.toLowerCase()} at ${weak.score}. ${weak.detail}`
    : "Nothing in the measurements is asking for a project. Protect the skin you have, and change the photo setup before you change the routine.";

  return [
    `This photo scores ${overall} overall — structure ${structureScore}, skin ${skinScore}, age ${ageScore}. The overall number is the average of those three. ${lead} ${expression}`,
    structureParagraph(structure),
    skinParagraph(skin),
    `Age ${ageScore} means how calm the texture and shadow look, not a guess of your birthday. Higher is smoother and more rested in this frame. ${ageBand(ageScore)} ${skin.forehead.detail} ${skin.crows.detail} ${skin.underEye.detail} ${promise} What will not move: bone, eye spacing, and the width of the nose. What can move: skin condition, grooming, light, and where the camera sits.`,
  ];
}

function characterLine(structure: number, skin: number, age: number): string {
  const entries: [string, number][] = [
    ["structure", structure],
    ["skin", skin],
    ["age signals", age],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries[0];
  const bottom = entries[2];
  if (bottom[1] >= 86) return "All three sit in a strong band. The honest plan is maintenance.";
  if (top[1] - bottom[1] < 8) return "The three scores sit close together. There is no single dramatic gap in this photo.";
  const name = `${bottom[0][0].toUpperCase()}${bottom[0].slice(1)}`;
  const verb = bottom[0] === "age signals" ? "are" : "is";
  return `The stronger side of this photo is ${top[0]}. ${name} ${verb} the part a plan can aim at.`;
}

function structureParagraph(structure: StructureReport): string {
  const where = structure.symmetry.weakest
    ? `The largest mismatch is the ${REGION_LABEL[structure.symmetry.weakest]}.`
    : "The mismatch is spread evenly, which usually means a straight photo of an ordinary face.";
  const vertical = structure.vertical.valid
    ? `The lower face is ${structure.vertical.ratio.toFixed(2)}× the midface, measured from the brow line to the base of the nose, then on to the chin.`
    : "Vertical thirds were not reliable in this frame, so they were left out of the score.";
  const eyes = structure.eyes.valid
    ? `Eye spacing is ${structure.eyes.ratio.toFixed(2)}× one eye width, and the outer corners sit at ${structure.tilt.left.toFixed(1)}° and ${structure.tilt.right.toFixed(1)}°. Level to gently positive looks open. A negative tilt is often just a squint or the hour.`
    : "";
  const nose = structure.nose.valid
    ? `Nose width is ${structure.nose.ratio.toFixed(2)}× the eye gap.`
    : "";
  const jaw = structure.jaw.valid ? structure.jaw.note : "";
  return `Symmetry mismatch averages ${(structure.symmetry.error * 100).toFixed(1)}% of face width. ${where} ${vertical} ${eyes} ${nose} ${jaw} ${structure.lips.valid ? structure.lips.note : ""} ${structure.shapeText}`
    .replace(/\s+/g, " ")
    .trim();
}

function skinParagraph(skin: SkinReport): string {
  return `${skin.evenness.detail} ${skin.texture.detail} ${skin.redness.detail} ${skin.shine.detail} ${skin.underEye.detail} ${skin.folds.detail}`
    .replace(/\s+/g, " ")
    .trim();
}

function ageBand(age: number): string {
  if (age >= 90) return "Very little texture or shadow shows. Soft light can do that on its own, and so can a younger face.";
  if (age >= 80) return "Smooth overall, with small cues around the eyes or forehead.";
  if (age >= 70) return "Ordinary adult texture. Sleep, sun, and a dry week move this band either way.";
  if (age >= 60) return "Texture and shadow are visible enough to be the main age cue in this photo.";
  return "Texture, creasing, or shadow is strong here. Light and dryness can exaggerate it. So can years of sun.";
}

function buildPlans(metrics: Metric[], structure: StructureReport, skin: SkinReport, confidence: number): {
  realistic: string[];
  shortTerm: string[];
  longTerm: string[];
} {
  const score = (id: string) => metrics.find((metric) => metric.id === id)?.score ?? 100;
  const low = (id: string, below = 82) => score(id) < below;
  const lowest = Math.min(...metrics.map((metric) => metric.score));

  if (lowest >= 84) {
    const realistic = [
      "This photo is already in a strong band. A long routine will not beat leaving a simple one alone.",
      "Bone and spacing are settled. What you can still change is sun over the years, and grooming if you want it.",
    ];
    if (confidence < 0.72) {
      realistic.unshift(
        "Retake this straight on, with both cheeks in the same light, before you trust the high numbers. The scores are already strong, and a cleaner photo will tell you if they hold.",
      );
    }
    return {
      realistic,
      shortTerm: [
        "Sunscreen on any morning you go outside, including a cloudy walk.",
        "Keep the cleanser and moisturizer you already use. Don't add an active just to have a plan.",
        "If a brow or a haircut is the thing that bothers you, fix that. It shows in a photo more than a new serum.",
      ],
      longTerm: [
        "Sun protection most days, for years, is the long plan. A hat counts.",
        "If a mark is new and still there after a month, take it to a dermatologist. Otherwise keep the simple routine.",
      ],
    };
  }

  const realistic = [
    "Bone shape, eye spacing, and nose width do not change with a routine. Skin, grooming, light, and camera position do. This plan stays on that side of the line.",
  ];
  if (confidence < 0.72) {
    realistic.unshift(
      "Retake this straight on, with both cheeks in the same light and your face filling more of the frame, before you treat a low number as a project. Angle and light are in this score.",
    );
  }
  if (low("symmetry", 80)) {
    realistic.push(
      "Most of what a photo calls asymmetry is expression, brows trained differently, or light from one side. Chasing a perfect mirror is a waste of the weeks that would change your skin.",
    );
  }
  if (low("undereye", 80)) {
    realistic.push(
      "A hollow under the eye is anatomy and light. Creams do not fill it. Puffiness and a gray cast from short sleep can change within a week.",
    );
  }
  if (low("texture", 80) || low("evenness", 80)) {
    realistic.push(
      "Evening tone and texture is real and slow. A week will not do it. Scrubs and a stack of acids make the next photo worse.",
    );
  }
  if (low("vertical", 78)) {
    const ratio = structure.vertical.ratio;
    realistic.push(
      ratio >= 1
        ? "A longer lower face is a proportion you dress with hair, collar, and camera height. It is not a chin to shorten at home."
        : "A shorter lower face is a proportion you dress. Nothing healthy lengthens a chin.",
    );
  }
  if (low("redness", 80)) {
    realistic.push("Diffuse redness can calm down. It rarely vanishes because of a serum. Heat, fragrance, alcohol, and over-exfoliating make it louder.");
  }

  const shortTerm = ["Sunscreen every morning you are outside. It is the one habit this week that still matters next year."];
  if (low("shine", 82) && skin.shine.detail.includes("blown out")) {
    shortTerm.push("Blot the T-zone before a photo. Moisturizer can still go on the cheeks. Don't strip the skin with alcohol; it rebounds oilier.");
  }
  if (low("texture", 74) || low("evenness", 74)) {
    shortTerm.push(
      "Stop physical scrubs. Use a gentle cleanser and a plain moisturizer. If the skin feels tight, put the moisturizer on while it is damp and wait two weeks before any active.",
    );
  }
  if (low("redness", 84)) {
    shortTerm.push("Switch to a fragrance-free moisturizer and lukewarm water. Azelaic acid 10% is a reasonable over-the-counter option if the skin is not broken.");
  }
  if (low("undereye", 84) || low("forehead", 80) || low("crows", 80)) {
    shortTerm.push(
      "Give it a week of real sleep and less salt at night. A cool cloth in the morning changes puffiness. If you use makeup, a peach or neutral corrector changes the photo today. Caffeine gels are mild and temporary.",
    );
  }
  if (low("symmetry", 84)) {
    shortTerm.push(
      "Face the window straight on, or light both sides. Take the photo from about 1.5 to 2 meters, not at arm's length, so the nose does not loom. If the brows are the mismatch, brush the higher one down and match the endpoints.",
    );
  }
  if (low("vertical", 82) || structure.shape !== "balanced") {
    shortTerm.push(cameraAndHair(structure));
  }
  if (shortTerm.length < 3) {
    shortTerm.push("Keep the rest of the routine boring. A new product every night is how skin gets irritated, and irritated skin photographs worse.");
  }

  const longTerm = [];
  if (low("texture", 74) || low("evenness", 74) || low("forehead", 74) || low("crows", 74)) {
    longTerm.push(
      "If you are not pregnant and your skin tolerates it, a retinoid most nights for six to twelve months is the long game for texture and marks. Start twice a week. Adapalene is the common over-the-counter choice. If you are pregnant, skip retinoids and ask a clinician what is safe.",
    );
  }
  longTerm.push(
    "See a dermatologist if redness, a mark, or a swelling is new and still there after a month, or if it hurts. This reading cannot tell those apart.",
  );
  if (low("symmetry", 86) || low("vertical", 86) || low("eyes", 86) || low("nose", 86)) {
    longTerm.push(
      "You will not train bone into a different shape. Chewing, mewing, and facial yoga are not supported as symmetry or jaw treatments. A haircut, facial hair if you wear it, and glasses are the long-term tools. A medical procedure is a conversation with a clinician, not a step in this plan.",
    );
  }
  if (low("undereye", 86)) {
    longTerm.push("Sun protection and not rubbing the eyes is the long version of the under-eye plan. A sudden one-sided change should be seen by a clinician.");
  }
  if (longTerm.length < 3) {
    longTerm.push("Sun protection most days is still the year-long lever, even when the rest of the plan is small.");
  }

  return {
    realistic: realistic.slice(0, 4),
    shortTerm: shortTerm.slice(0, 5),
    longTerm: longTerm.slice(0, 4),
  };
}

function cameraAndHair(structure: StructureReport): string {
  const hair =
    structure.shape === "long"
      ? "Width around the ears and a side part shorten a longer face. A very tall, narrow shape makes it longer."
      : structure.shape === "wide"
        ? "A little height on top, and less width at the ears, balances a wider cheek. Volume at the sides does the opposite."
        : "Most cuts work on this balance. Pick one you will actually wear.";
  const camera =
    structure.vertical.valid && structure.vertical.ratio > 1.15
      ? "Hold the camera at eye level, not below the chin."
      : "Hold the camera at eye level.";
  return `${camera} ${hair}`;
}
