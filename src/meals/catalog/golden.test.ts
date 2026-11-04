/**
 * Golden meals: real ways people log Indian meals. Each must be answered entirely from the
 * shipped catalog (no database read, no web lookup) and land in a sensible calorie range.
 * Ranges are wide on purpose: they catch a wrong serving or unit, not small recipe differences.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../foodStore.js", () => ({
  loadFoodTables: vi.fn(async () => ({ foods: new Map(), recipes: new Map() })),
  knownFoodNames: vi.fn(async () => []),
  recipeKey: (k: string, u: string) => `${k}|${u}`,
  saveFoods: vi.fn(),
  saveRecipes: vi.fn(),
  markFoodsUsed: vi.fn(),
}));

import { estimateWithFoodDb } from "../foodDbEstimate.js";
import { loadFoodTables } from "../foodStore.js";

const GOLDEN: [meal: string, minKcal: number, maxKcal: number][] = [
  ["2 roti, 1 katori dal, half plate rice", 400, 560],
  ["2 rotis and a bowl of bhindi", 280, 400],
  ["3 chapati, palak paneer", 470, 620],
  ["aloo paratha with curd", 290, 420],
  ["2 aloo parathas, 1 tbsp butter", 560, 760],
  ["1 large aloo paratha", 280, 400],
  ["poha", 220, 320],
  ["1 plate poha and chai", 300, 420],
  ["upma, coconut chutney", 240, 330],
  ["3 idli, sambar, chutney", 230, 340],
  ["masala dosa", 250, 350],
  ["2 dosa and sambar", 340, 450],
  ["2 medu vada", 230, 320],
  ["chicken biryani", 560, 720],
  ["1 plate veg biryani, raita", 470, 620],
  ["rajma chawal", 360, 480],
  ["chole bhature", 600, 780],
  ["dal makhani, 2 roti", 330, 460],
  ["2 boiled eggs, 2 slices brown bread", 280, 360],
  ["omelette, 2 bread", 300, 380],
  ["egg bhurji with 2 pav", 360, 500],
  ["200g chicken breast, 1 cup rice", 480, 560],
  ["150 g paneer", 370, 430],
  ["100g soya chunks", 320, 370],
  ["1 scoop whey, 1 banana", 190, 250],
  ["a glass of milk", 130, 170],
  ["1 cup chai", 60, 95],
  ["2 cups tea", 130, 180],
  ["black coffee", 0, 10],
  ["handful of almonds", 150, 200],
  ["1 apple, 1 medium banana", 160, 220],
  ["half katori curd", 35, 60],
  ["1 bowl dahi", 70, 110],
  ["2 samosa", 380, 520],
  ["vada pav", 280, 380],
  ["pav bhaji", 460, 600],
  ["2 gulab jamun", 280, 380],
  ["kheer", 220, 300],
  ["sweet lassi", 160, 220],
  ["chaas", 35, 70],
  ["khichdi, 1 tsp ghee", 180, 240],
  ["2 moong dal chilla", 280, 360],
  ["2 besan chilla", 300, 400],
  ["oats with milk", 250, 340],
  ["chicken curry and 2 roti", 400, 520],
  ["butter chicken, 1 cup rice", 420, 520],
  ["fish curry with rice", 340, 460],
  ["mutton curry, jeera rice", 380, 520],
  ["egg curry, 2 roti", 440, 560],
  ["paneer butter masala and 2 roti", 460, 580],
  ["aloo gobi, 2 phulka", 330, 430],
  ["baingan bharta and 2 bajra roti", 360, 480],
  ["kadhi chawal", 320, 440],
  ["sprouts", 20, 50],
  ["1 katori papaya", 50, 80],
  ["coconut water", 35, 60],
  ["maggi", 280, 340],
  ["2 large rotis", 230, 300],
  ["1 small roti", 60, 90],
  ["1 tbsp peanut butter, 2 slices white bread", 210, 270],
  // Batch 3
  ["2 butter naan, paneer butter masala", 860, 1020],
  ["6 veg momos", 210, 300],
  ["1 plate hakka noodles", 320, 430],
  ["2 slices pizza", 410, 520],
  ["pani puri", 230, 320],
  ["sabudana khichdi", 300, 400],
  ["2 jalebi", 180, 240],
  ["cold coffee", 150, 210],
  ["kachori", 160, 220],
  ["bread omelette", 320, 410],
  ["coke", 90, 120],
  ["5 marie biscuits and chai", 190, 260],
  ["chicken roll", 400, 510],
  ["2 onion pakora, 1 cup tea", 160, 220],
  // Batch 3b: protein dishes
  ["soya chunk curry, 2 roti", 300, 420],
  ["tofu bhurji", 130, 190],
  ["egg white omelette", 80, 130],
  ["grilled chicken breast", 190, 260],
  ["chicken keema, 2 roti", 380, 520],
  ["fish tikka", 240, 320],
  ["chana chaat", 180, 260],
  ["sattu drink", 90, 140],
  ["handful of roasted chana", 95, 125],
  ["egg pulao", 400, 560],
  // Batch 4: diet-planner gaps
  ["jain dal tadka, 2 roti", 320, 420],
  ["gatte ki sabzi, 2 roti", 380, 520],
  ["dal dhokli", 250, 360],
  ["egg sandwich", 330, 420],
  ["2 peanut butter toast", 300, 380],
  ["overnight oats", 300, 400],
  ["a glass of soy milk", 65, 90],
  ["tofu tikka", 180, 260],
  ["lobia curry and rice", 330, 450],
  ["misal pav", 520, 680],
  ["puttu kadala", 380, 520],
  ["litti chokha", 440, 600],
  ["vegetable dalia", 140, 220],
  ["chicken soup", 70, 130],
  ["prawn masala, 1 cup rice", 340, 450],
  ["macher jhol with rice", 350, 480],
  ["moong dal soup", 110, 170],
  ["paneer salad bowl", 280, 380],
  ["1 protein bar", 210, 250],
  ["soya bhurji, 2 roti", 300, 420],
  // Batch 5: protein breakfasts
  ["2 paneer moong chilla", 380, 520],
  ["soya poha", 230, 320],
  ["protein upma", 180, 260],
  ["tofu scramble toast", 200, 280],
  ["2 pesarattu with ginger chutney", 300, 420],
  ["2 ragi dosa", 240, 330],
  // Batch 6
  ["rasam rice", 220, 330],
  ["bisi bele bath", 280, 380],
  ["2 appam with kadala curry", 380, 520],
  ["3 neer dosa", 150, 230],
  ["sarson ka saag, 2 makki roti", 380, 520],
  ["shahi paneer, 2 roti", 480, 640],
  ["aloo matar and 2 roti", 300, 420],
  ["mutton keema, 2 pav", 400, 560],
  ["2 sabudana vada", 250, 360],
  ["4 luchi, aloo posto", 500, 680],
  ["gajar halwa", 160, 240],
  ["chicken shawarma", 450, 600],
  ["2 beers", 260, 310],
  ["2 whisky", 130, 150],
  ["glass of red wine", 120, 135],
  ["1 avocado", 210, 240],
  ["handful of banana chips", 120, 140],
  // Batch 7
  ["4 seekh kebab", 250, 360],
  ["chicken korma, 2 roti", 400, 560],
  ["kadai chicken and 1 cup rice", 400, 540],
  ["mushroom masala, 2 roti", 280, 400],
  ["2 onion paratha with curd", 560, 760],
  ["egg paratha", 260, 360],
  ["papdi chaat", 330, 470],
  ["dabeli", 230, 340],
  ["2 bread pakora", 450, 620],
  ["1 slice cake", 190, 230],
  ["5 cream biscuits", 270, 310],
  ["2 slices bread with jam", 170, 240],
  ["whey shake", 230, 290],
  ["1 scoop whey isolate", 100, 125],
  ["1 scoop casein", 105, 135],
  ["banana protein shake", 280, 380],
  ["mass gainer shake", 560, 690],
  ["creatine", 0, 5],
  ["fish oil capsule", 5, 15],
  ["banana smoothie", 330, 440],
  ["masala oats", 140, 180],
  ["glass of milk with bournvita", 190, 240],
  ["2 motichoor ladoo", 300, 420],
  ["mango lassi", 200, 300],
  // Batch 8
  ["veg thali", 480, 620],
  ["mess thali", 480, 620],
  ["2 kerala parotta, egg roast", 650, 850],
  ["chicken chettinad, 1 cup rice", 420, 560],
  ["dal baati churma", 850, 1050],
  ["chole kulche", 600, 760],
  ["masala khichdi", 180, 260],
  ["handful of mixed nuts", 170, 200],
  ["bowl of roasted makhana", 90, 120],
  ["fresh lime soda", 55, 85],
  ["falooda", 330, 450],
  ["thukpa", 200, 300],
  ["2 khakhra", 150, 170],
  // Batch 9
  ["pappu, 1 cup rice", 300, 380],
  ["kappa meen curry", 540, 700],
  ["2 aloo bonda", 180, 240],
  ["beef fry", 340, 450],
  ["pork vindaloo, 1 cup rice", 540, 680],
  ["kosha mangsho, 2 luchi", 400, 510],
  ["1 puran poli", 190, 250],
  ["2 modak", 200, 270],
  ["chicken burger", 450, 580],
  ["2 slices chicken pizza", 430, 550],
  ["1 glass haldi doodh", 120, 160],
  ["manchow soup", 120, 170],
  ["2 egg puffs", 520, 660],
  ["undhiyu, 2 puri", 420, 530],
  ["french toast", 150, 200],
  ["chicken liver fry", 210, 280],
  ["1 glass chocolate milk", 130, 175],
  ["mutton yakhni, 1 cup rice", 320, 420],
  ["squid fry", 190, 245],
  ["ghugni", 150, 200],
  ["kada prasad", 310, 410],
  ["meen curry", 180, 230],
  ["1 packet maggi", 280, 340],
  ["1 plate fish curry rice", 440, 580],
  ["2 ragi roti, 1 katori urad dal", 330, 470],
  ["1 bowl tomato soup", 55, 100],
  ["1 plate schezwan rice", 400, 560],
  ["tinda sabzi, 2 roti", 280, 400],
  ["1 plate appam stew", 340, 500],
  ["bengali khichuri", 150, 230],
  ["1 slice banana bread", 150, 230],
];

describe("golden meals from the catalog", () => {
  it.each(GOLDEN)("%s → %i–%i kcal, all from the catalog", async (meal, min, max) => {
    const web = vi.fn();
    const recordGaps = vi.fn();
    vi.mocked(loadFoodTables).mockClear();
    const r = await estimateWithFoodDb(meal, web, { recordGaps });
    expect(r, `no estimate for "${meal}"`).not.toBeNull();
    expect(web).not.toHaveBeenCalled();
    expect(loadFoodTables).not.toHaveBeenCalled();
    expect(recordGaps).not.toHaveBeenCalled();
    expect(r!.source).toBe("food_db");
    expect(r!.calories!).toBeGreaterThanOrEqual(min);
    expect(r!.calories!).toBeLessThanOrEqual(max);
  });

  it("logs a catalog miss as a gap and only then asks the database", async () => {
    const recordGaps = vi.fn();
    vi.mocked(loadFoodTables).mockClear();
    await estimateWithFoodDb("2 roti and a bowl of zzz unknown curry", null, { recordGaps });
    expect(loadFoodTables).toHaveBeenCalledWith(["zzz unknown curry"]);
    expect(recordGaps.mock.calls[0]![0].map((c: { foodKey: string }) => c.foodKey)).toEqual(["zzz unknown curry"]);
  });

  it("shows the household measure on each line", async () => {
    const r = await estimateWithFoodDb("2 medium roti, half katori dal", null, { recordGaps: vi.fn() });
    expect(r!.items.map((i) => i.name)).toEqual(["Roti · 2 medium roti · 80 g", "Dal tadka · ½ katori · 75 g"]);
  });
});
