/**
 * Fill recipes.json nutrition_per_serving and verified_claims from CoFID 2021
 * plus content/food/nutrition-extras.json. Does not guess missing foods.
 *
 * Usage:
 *   node scripts/nutrition-calc.mjs
 * Optional:
 *   set COFID_XLSX to the McCance spreadsheet path
 */
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const XLSX =
  process.env.COFID_XLSX ||
  "C:\\Users\\alexr\\Downloads\\McCance_Widdowsons_Composition_of_Foods_Integrated_Dataset_2021..xlsx";
const TMP = path.join(ROOT, "tmp_cofid_xlsx");

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

function decodeXml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseNumber(raw) {
  const text = String(raw ?? "").trim();
  if (!text || /^(n|tr|trace)$/i.test(text)) return 0;
  const value = Number(text);
  return Number.isFinite(value) ? value : 0;
}

function loadSharedStrings(xml) {
  const strings = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let match;
  while ((match = siRe.exec(xml))) {
    const texts = [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((item) => decodeXml(item[1]));
    strings.push(texts.join(""));
  }
  return strings;
}

function loadCofidFoods() {
  const zip = path.join(TMP, "cofid.zip");
  const unzipped = path.join(TMP, "unzipped");
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  fs.copyFileSync(XLSX, zip);
  execFileSync("powershell.exe", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${unzipped}' -Force`]);
  const xl = path.join(unzipped, "xl");
  const strings = loadSharedStrings(fs.readFileSync(path.join(xl, "sharedStrings.xml"), "utf8"));
  const sheet = fs.readFileSync(path.join(xl, "worksheets", "sheet4.xml"), "utf8");
  const foods = new Map();
  const rowRe = /<row [^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let match;
  while ((match = rowRe.exec(sheet))) {
    if (Number(match[1]) < 4) continue;
    const cells = {};
    const cellRe = /<c r="([A-Z]+)(\d+)"([^>]*)>(?:<v>([\s\S]*?)<\/v>)?/g;
    let cell;
    while ((cell = cellRe.exec(match[2]))) {
      const raw = cell[4] ?? "";
      cells[cell[1]] = (cell[3] || "").includes('t="s"') ? strings[Number(raw)] ?? "" : raw;
    }
    const code = (cells.A || "").trim();
    if (!code) continue;
    const aoac = String(cells.Z ?? "").trim();
    const nsp = String(cells.Y ?? "").trim();
    const fibreRaw = aoac && !/^(n|tr|trace)?$/i.test(aoac) ? aoac : nsp;
    foods.set(code, {
      kcal: parseNumber(cells.M),
      protein_g: parseNumber(cells.J),
      fat_g: parseNumber(cells.K),
      carbs_g: parseNumber(cells.L),
      fibre_g: parseNumber(fibreRaw),
    });
  }
  fs.rmSync(TMP, { recursive: true, force: true });
  return foods;
}

function gramsFor(ingredient, weights) {
  const lookup = ingredient.nutrition_lookup;
  const unit = ingredient.unit;
  const qty = Number(ingredient.quantity);
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  if (unit === "g") return qty;
  if (unit === "ml") return qty * (weights.density_g_per_ml[lookup] ?? 1);
  if (unit === "tsp") {
    if (weights.tsp_g[lookup] != null) return qty * weights.tsp_g[lookup];
    const density = weights.density_g_per_ml[lookup];
    if (density != null) return qty * weights.tsp_ml * density;
    return qty * 2;
  }
  if (unit === "tbsp") {
    if (weights.tbsp_g[lookup] != null) return qty * weights.tbsp_g[lookup];
    const density = weights.density_g_per_ml[lookup];
    if (density != null) return qty * weights.tbsp_ml * density;
    return qty * 15;
  }
  if (unit === "pinch") return qty * weights.pinch_g;
  if (unit === "slice") return qty * (weights.piece_g[lookup] ?? 0);
  if (unit === "handful") return qty * (weights.handful_g[lookup] ?? 0);
  if (unit === "thumb") return qty * (weights.thumb_g[lookup] ?? 0);
  if (!unit) return qty * (weights.piece_g[lookup] ?? 0);
  return 0;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function main() {
  if (!fs.existsSync(XLSX)) {
    console.error("CoFID spreadsheet not found:", XLSX);
    process.exit(1);
  }
  const recipesFile = readJson("content/food/recipes.json");
  const extrasFile = readJson("content/food/nutrition-extras.json");
  const weights = readJson("content/food/ingredient-weights.json");
  const matchesFile = readJson("content/food/cofid-matches.json");
  const extras = new Map(extrasFile.foods.map((food) => [food.id, food]));
  const extraByLookup = new Map(extrasFile.foods.map((food) => [food.lookup, food]));
  const cofid = loadCofidFoods();

  const problems = [];
  let withNutrition = 0;
  let highProtein = 0;
  let highFibre = 0;

  for (const recipe of recipesFile.recipes) {
    let kcal = 0;
    let protein = 0;
    let fat = 0;
    let carbs = 0;
    let fibre = 0;
    let grams = 0;
    let ok = true;
    for (const ingredient of recipe.ingredients) {
      const extra = extraByLookup.get(ingredient.nutrition_lookup);
      if (extra) ingredient.food_id = extra.id;
      const id = ingredient.food_id;
      const per100 = id && extras.has(id) ? extras.get(id).per_100g : id && cofid.has(id) ? cofid.get(id) : null;
      const weight = gramsFor(ingredient, weights);
      if (!per100 || weight <= 0) {
        ok = false;
        problems.push(`${recipe.slug}: ${ingredient.nutrition_lookup} (${ingredient.quantity} ${ingredient.unit || "piece"})`);
        continue;
      }
      const factor = weight / 100;
      kcal += per100.kcal * factor;
      protein += per100.protein_g * factor;
      fat += per100.fat_g * factor;
      carbs += per100.carbs_g * factor;
      fibre += per100.fibre_g * factor;
      grams += weight;
    }
    if (!ok || recipe.servings < 1) {
      recipe.nutrition_per_serving = null;
      recipe.verified_claims = [];
      continue;
    }
    const perServing = {
      calories: Math.round(kcal / recipe.servings),
      protein_g: round1(protein / recipe.servings),
      fat_g: round1(fat / recipe.servings),
      carbs_g: round1(carbs / recipe.servings),
      fibre_g: round1(fibre / recipe.servings),
    };
    recipe.nutrition_per_serving = perServing;
    withNutrition += 1;

    const proteinEnergy = protein * 4;
    const highProteinOk = kcal > 0 && proteinEnergy / kcal >= 0.2;
    const fibrePer100g = grams > 0 ? (fibre / grams) * 100 : 0;
    const fibrePer100kcal = kcal > 0 ? (fibre / kcal) * 100 : 0;
    const highFibreOk = fibrePer100g >= 6 || fibrePer100kcal >= 3;
    const intended = new Set(recipe.intended_claims || []);
    const verified = [];
    if (intended.has("high_protein") && highProteinOk) verified.push("high_protein");
    if (intended.has("high_fibre") && highFibreOk) verified.push("high_fibre");
    recipe.verified_claims = verified;
    if (verified.includes("high_protein")) highProtein += 1;
    if (verified.includes("high_fibre")) highFibre += 1;
  }

  recipesFile._loader_notes = [
    "Recipes (AGENTS.md v2.4 F2 and F3). Draft for review by a Registered Dietitian (HCPC) or Registered Nutritionist (AfN). Fill reviewed_by and reviewed_at before publishing.",
    "nutrition_per_serving is calculated by scripts/nutrition-calc.mjs from CoFID 2021 plus content/food/nutrition-extras.json. Never let an AI estimate it.",
    "Each ingredient has nutrition_lookup and food_id (a CoFID code, or ext-... for extras). Household measures use content/food/ingredient-weights.json.",
    "intended_claims are what the recipe is designed for. verified_claims is filled only when the calculated recipe meets UK high-protein or high-fibre rules.",
    "Allergens are worked out from each ingredient and list the 14 UK major allergens. check_label_notes cover ingredients whose allergens vary by brand. The dietitian should check every recipe.",
    "dietary_tags are calculated: vegetarian (no meat or fish), vegan (no animal products; optional honey ignored), gluten_free (no gluten-containing cereals), dairy_free (no milk).",
    "Servings stepper: scale quantity linearly; round counts sensibly (eggs to whole numbers, spices to the nearest pinch).",
    "Shopping list: group by ingredient aisle; combine the same ingredient_key across recipes.",
    "Food never appears as a reward for training. No calorie counts in titles, collections or filters. Macros only on the recipe page, and hidden when profiles.hide_macros is on.",
    "Covers: every recipe needs its own real, matching, licensed photo (cover_image_slug).",
  ];
  matchesFile._notes = [
    "Maps recipe nutrition_lookup strings to CoFID 2021 food codes from sheet 1.3 Proximates, plus nutrition-extras.json for foods CoFID does not list.",
    "food_id is written onto each ingredient in recipes.json. nutrition_per_serving is calculated by scripts/nutrition-calc.mjs.",
    "status: exact = same CoFID name; likely = clear CoFID equivalent; proxy = nearest CoFID food; extra = not in CoFID, values from nutrition-extras.json.",
  ];
  for (const row of matchesFile.matches) {
    const extra = extraByLookup.get(row.lookup);
    if (!extra) continue;
    row.food_id = extra.id;
    row.cofid_name = extra.name;
    row.status = "extra";
    row.note = extra.source;
  }
  const summary = { exact: 0, likely: 0, proxy: 0, extra: 0, unmatched: 0 };
  for (const row of matchesFile.matches) summary[row.status] = (summary[row.status] || 0) + 1;
  matchesFile.summary = summary;

  fs.writeFileSync(path.join(ROOT, "content/food/recipes.json"), JSON.stringify(recipesFile, null, 2) + "\n");
  fs.writeFileSync(path.join(ROOT, "content/food/cofid-matches.json"), JSON.stringify(matchesFile, null, 2) + "\n");

  console.log("recipes with nutrition", withNutrition, "of", recipesFile.recipes.length);
  console.log("verified high_protein", highProtein);
  console.log("verified high_fibre", highFibre);
  if (problems.length) {
    console.log("skipped ingredients:");
    for (const line of problems) console.log(" ", line);
  }
}

main();
