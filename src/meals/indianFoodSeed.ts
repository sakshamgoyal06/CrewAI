/**
 * Starter rows for the food database: everyday Indian foods in the units people log them in
 * (a roti, a katori of dal, a plate of poha), so a new user's first meals resolve instantly and
 * consistently instead of going to the web.
 *
 * Numbers are typical home-style values (IFCT 2017 ingredients, standard home recipes with a
 * normal amount of oil or ghee) and are meant as sensible defaults, not lab values. People can
 * still edit every draft before it's saved. Seeded with ignore-on-conflict, so a row the
 * estimator already learned is never overwritten, and a seed row can be corrected in the table.
 */
import { logger } from "../logger.js";
import { supabase } from "../tools/clients.js";
import { foodKeyFor, type FoodUnit } from "./foodParse.js";
import type { FoodRow } from "./foodStore.js";

/** [display name, unit, grams per unit, kcal, protein g, carbs g, fat g] */
type SeedTuple = [string, FoodUnit, number | null, number, number, number, number];

const SEED: SeedTuple[] = [
  // Breads
  ["Roti", "piece", 40, 110, 3.4, 20, 1.5],
  ["Chapati", "piece", 40, 110, 3.4, 20, 1.5],
  ["Phulka", "piece", 35, 95, 3, 19, 0.5],
  ["Plain paratha", "piece", 80, 260, 5, 36, 10],
  ["Paratha", "piece", 80, 260, 5, 36, 10],
  ["Aloo paratha", "piece", 120, 300, 6, 42, 12],
  ["Gobi paratha", "piece", 120, 280, 6.5, 38, 11],
  ["Paneer paratha", "piece", 120, 330, 11, 36, 15],
  ["Naan", "piece", 90, 260, 8, 45, 5],
  ["Butter naan", "piece", 100, 320, 8.5, 48, 10],
  ["Puri", "piece", 25, 100, 1.8, 11, 5.5],
  ["Bhatura", "piece", 70, 260, 5, 34, 12],
  ["Thepla", "piece", 40, 130, 3, 16, 6],
  ["Missi roti", "piece", 50, 150, 5.5, 23, 4],
  ["Makki roti", "piece", 60, 180, 3.5, 28, 6],
  ["Bajra roti", "piece", 50, 150, 4, 25, 4],
  ["Jowar roti", "piece", 50, 140, 4.5, 26, 2],
  ["Pav", "piece", 40, 110, 3.5, 20, 1.5],
  ["Bread", "slice", 25, 66, 2, 12.5, 0.8],
  ["White bread", "slice", 25, 66, 2, 12.5, 0.8],
  ["Brown bread", "slice", 28, 70, 3.5, 12, 1],
  // Rice
  ["White rice cooked", "per_100g", null, 130, 2.7, 28, 0.3],
  ["Rice", "per_100g", null, 130, 2.7, 28, 0.3],
  ["Rice", "bowl", 150, 195, 4, 42, 0.5],
  ["Rice", "plate", 250, 325, 6.8, 70, 0.8],
  ["Brown rice cooked", "per_100g", null, 112, 2.6, 23.5, 0.9],
  ["Jeera rice", "bowl", 150, 230, 4, 40, 5.5],
  ["Veg pulao", "bowl", 200, 300, 6, 48, 9],
  ["Veg biryani", "plate", 300, 480, 10, 70, 17],
  ["Chicken biryani", "plate", 350, 620, 30, 72, 22],
  ["Mutton biryani", "plate", 350, 680, 30, 70, 28],
  ["Curd rice", "bowl", 200, 240, 7, 36, 7],
  ["Lemon rice", "bowl", 200, 330, 5.5, 54, 10],
  ["Khichdi", "bowl", 200, 240, 8.5, 38, 6],
  ["Veg fried rice", "plate", 300, 450, 9, 70, 15],
  ["Chicken fried rice", "plate", 300, 500, 18, 65, 18],
  // Dals and legumes (one katori ≈ 150 g)
  ["Dal", "bowl", 150, 180, 9, 24, 5],
  ["Toor dal", "bowl", 150, 180, 9, 24, 5],
  ["Dal tadka", "bowl", 150, 190, 9, 24, 6],
  ["Dal fry", "bowl", 150, 190, 9, 24, 6],
  ["Moong dal", "bowl", 150, 160, 10, 22, 3.5],
  ["Masoor dal", "bowl", 150, 170, 10, 23, 4],
  ["Dal makhani", "bowl", 150, 280, 10, 26, 15],
  ["Chole", "bowl", 150, 240, 10, 32, 8],
  ["Chana masala", "bowl", 150, 240, 10, 32, 8],
  ["Rajma", "bowl", 150, 220, 10, 30, 6.5],
  ["Sambar", "bowl", 150, 130, 6, 18, 4],
  ["Rasam", "bowl", 150, 60, 2, 9, 2],
  ["Kadhi", "bowl", 150, 150, 5, 12, 9],
  ["Sprouts", "bowl", 100, 100, 7, 15, 1],
  ["Rajma chawal", "plate", 300, 415, 14, 72, 7],
  ["Dal chawal", "plate", 300, 375, 13, 66, 5.5],
  ["Chole bhature", "plate", 290, 760, 20, 100, 32],
  // Vegetables (one katori ≈ 150 g)
  ["Aloo gobi", "bowl", 150, 160, 4, 18, 8],
  ["Bhindi", "bowl", 150, 150, 3.5, 13, 9],
  ["Bhindi sabzi", "bowl", 150, 150, 3.5, 13, 9],
  ["Baingan bharta", "bowl", 150, 140, 3.5, 13, 8],
  ["Aloo sabzi", "bowl", 150, 180, 3, 24, 8],
  ["Mixed veg", "bowl", 150, 150, 4, 16, 8],
  ["Mix veg sabzi", "bowl", 150, 150, 4, 16, 8],
  ["Lauki sabzi", "bowl", 150, 90, 2, 10, 4.5],
  ["Cabbage sabzi", "bowl", 150, 110, 3, 11, 6],
  ["Palak paneer", "bowl", 150, 280, 13, 10, 21],
  ["Paneer butter masala", "bowl", 150, 360, 13, 14, 28],
  ["Shahi paneer", "bowl", 150, 380, 13, 14, 30],
  ["Matar paneer", "bowl", 150, 280, 13, 15, 19],
  ["Kadai paneer", "bowl", 150, 320, 14, 12, 24],
  ["Paneer bhurji", "bowl", 150, 330, 18, 8, 25],
  ["Paneer tikka", "per_100g", null, 250, 16, 6, 18],
  ["Raita", "bowl", 150, 110, 5, 8, 6],
  ["Salad", "bowl", 100, 25, 1, 5, 0.2],
  ["Pav bhaji", "plate", 350, 520, 12, 70, 21],
  // Non-veg
  ["Chicken curry", "bowl", 150, 260, 24, 7, 15],
  ["Butter chicken", "bowl", 150, 340, 25, 10, 22],
  ["Chicken tikka masala", "bowl", 150, 300, 24, 9, 18],
  ["Chicken tikka", "per_100g", null, 150, 25, 3, 4.5],
  ["Chicken tikka", "piece", 30, 45, 7.5, 1, 1.4],
  ["Tandoori chicken", "per_100g", null, 165, 25, 3, 6],
  ["Chicken breast cooked", "per_100g", null, 165, 31, 0, 3.6],
  ["Chicken breast", "per_100g", null, 165, 31, 0, 3.6],
  ["Egg curry", "bowl", 200, 280, 15, 9, 20],
  ["Fish curry", "bowl", 150, 220, 22, 6, 12],
  ["Mutton curry", "bowl", 150, 320, 24, 6, 22],
  ["Keema", "bowl", 150, 330, 24, 8, 23],
  ["Egg", "piece", 50, 72, 6.3, 0.4, 4.8],
  ["Boiled egg", "piece", 50, 72, 6.3, 0.4, 4.8],
  ["Egg white", "piece", 33, 17, 3.6, 0.2, 0.1],
  ["Omelette", "piece", 120, 190, 13, 2, 14],
  ["Egg bhurji", "bowl", 120, 210, 13, 4, 16],
  // Breakfast and snacks
  ["Poha", "plate", 150, 250, 5, 42, 7],
  ["Upma", "bowl", 150, 250, 6, 36, 9],
  ["Idli", "piece", 40, 58, 2, 12, 0.2],
  ["Dosa", "piece", 80, 170, 4, 28, 4.5],
  ["Plain dosa", "piece", 80, 170, 4, 28, 4.5],
  ["Masala dosa", "piece", 180, 380, 8, 52, 15],
  ["Uttapam", "piece", 120, 220, 6, 36, 6],
  ["Medu vada", "piece", 50, 150, 5, 14, 8],
  ["Coconut chutney", "tbsp", 15, 35, 0.5, 1.5, 3],
  ["Dhokla", "piece", 30, 50, 2, 8, 1.2],
  ["Besan chilla", "piece", 80, 180, 9, 18, 8],
  ["Moong dal chilla", "piece", 80, 150, 9, 18, 4.5],
  ["Aloo tikki", "piece", 60, 130, 2, 17, 6],
  ["Samosa", "piece", 80, 260, 4, 28, 15],
  ["Kachori", "piece", 60, 230, 4, 22, 14],
  ["Vada pav", "piece", 130, 300, 7, 42, 12],
  ["Pani puri", "plate", 120, 220, 4, 34, 8],
  ["Bhel puri", "plate", 150, 280, 7, 45, 8],
  ["Maggi", "serving", 70, 350, 8, 50, 13],
  ["Veg momos", "piece", 30, 40, 1.5, 6, 1.2],
  ["Chicken momos", "piece", 35, 50, 3.5, 5, 1.8],
  ["Hakka noodles", "plate", 300, 480, 10, 70, 18],
  ["Veg manchurian", "bowl", 150, 300, 6, 30, 17],
  ["Oats", "per_100g", null, 389, 17, 66, 7],
  ["Oats porridge", "bowl", 250, 150, 5, 27, 2.7],
  ["Cornflakes", "per_100g", null, 357, 7, 84, 0.4],
  ["Papad", "piece", 12, 40, 3, 7, 0.3],
  ["Pickle", "tsp", 10, 20, 0.1, 0.5, 2],
  // Dairy and protein
  ["Paneer", "per_100g", null, 265, 18, 3.5, 20],
  ["Curd", "per_100g", null, 60, 3.1, 4.7, 3.3],
  ["Curd", "bowl", 150, 90, 4.7, 7, 5],
  ["Dahi", "bowl", 150, 90, 4.7, 7, 5],
  ["Greek yogurt", "per_100g", null, 70, 9, 4, 2],
  ["Milk", "per_100ml", null, 58, 3, 4.6, 3],
  ["Milk", "glass", 250, 145, 7.5, 11.5, 7.5],
  ["Buttermilk", "glass", 250, 50, 2.5, 4, 2],
  ["Chaas", "glass", 250, 50, 2.5, 4, 2],
  ["Sweet lassi", "glass", 250, 220, 7, 32, 7],
  ["Lassi", "glass", 250, 220, 7, 32, 7],
  ["Soya chunks", "per_100g", null, 345, 52, 33, 0.5],
  ["Tofu", "per_100g", null, 80, 8, 2, 4.8],
  ["Whey protein", "scoop", 30, 120, 24, 3, 1.5],
  ["Peanuts", "per_100g", null, 567, 26, 16, 49],
  ["Peanut butter", "tbsp", 16, 95, 3.5, 3.5, 8],
  ["Almonds", "per_100g", null, 579, 21, 22, 50],
  ["Almond", "piece", 1.2, 7, 0.25, 0.25, 0.6],
  ["Ghee", "tbsp", 13, 117, 0, 0, 13],
  ["Ghee", "tsp", 4.5, 40, 0, 0, 4.5],
  ["Oil", "tbsp", 14, 120, 0, 0, 14],
  ["Butter", "tbsp", 14, 100, 0.1, 0, 11.5],
  ["Sugar", "tsp", 4, 16, 0, 4, 0],
  // Drinks and sweets
  ["Chai", "cup", 150, 90, 2.5, 13, 3],
  ["Tea", "cup", 150, 90, 2.5, 13, 3],
  ["Coffee", "cup", 150, 80, 3, 10, 3],
  ["Black coffee", "cup", 150, 2, 0.3, 0, 0],
  ["Gulab jamun", "piece", 40, 150, 2, 23, 6],
  ["Jalebi", "piece", 25, 110, 0.8, 18, 4],
  ["Rasgulla", "piece", 40, 110, 2, 22, 1.5],
  ["Kheer", "bowl", 150, 240, 6, 36, 8],
  ["Besan ladoo", "piece", 40, 190, 4, 22, 10],
  ["Sooji halwa", "bowl", 100, 320, 4, 42, 15],
  // Fruit
  ["Banana", "piece", 118, 105, 1.3, 27, 0.4],
  ["Apple", "piece", 180, 95, 0.5, 25, 0.3],
  ["Mango", "piece", 200, 120, 1.6, 30, 0.8],
  ["Orange", "piece", 130, 60, 1.2, 15, 0.2],
  ["Papaya", "per_100g", null, 43, 0.5, 11, 0.3],
  ["Watermelon", "per_100g", null, 30, 0.6, 7.6, 0.2],
  ["Grapes", "per_100g", null, 69, 0.7, 18, 0.2],
  ["Date", "piece", 8, 22, 0.2, 6, 0],
  // Common outside food
  ["Pizza", "slice", 100, 270, 11, 33, 10],
  ["Veg burger", "piece", 180, 400, 10, 50, 17],
  ["Egg roll", "piece", 200, 380, 14, 40, 18],
];

export function seedRows(): FoodRow[] {
  return SEED.map(([name, unit, grams, kcal, p, c, f]) => ({
    food_key: foodKeyFor(name),
    unit,
    display_name: name,
    grams_per_unit: grams,
    calories: kcal,
    protein_g: p,
    carbs_g: c,
    fat_g: f,
    source: "magnus_seed",
    source_detail: { basis: "typical home-style values (IFCT 2017 ingredients, standard recipes)" },
  }));
}

/** Adds any seed rows the table doesn't have yet. Safe to run on every boot. */
export async function ensureFoodSeed(): Promise<void> {
  const rows = seedRows();
  const unique = new Map(rows.map((r) => [`${r.food_key}|${r.unit}`, r]));
  const { error } = await supabase
    .from("food_nutrition")
    .upsert([...unique.values()], { onConflict: "food_key,unit", ignoreDuplicates: true });
  if (error) logger.warn({ error: error.message }, "food seed failed");
  else logger.info({ rows: unique.size }, "food seed checked");
}
