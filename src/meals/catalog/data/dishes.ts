/**
 * Complete Indian dishes and meals, batch 2 (2026-11-04).
 *
 * Each dish is a standard home recipe: raw ingredients for one batch in grams (ml for milk),
 * including the oil or ghee it is cooked in, and the weight of the finished batch. Its numbers
 * per 100 g are computed from the ingredients (catalog/index.ts), so they always add up.
 * Spices, salt and herbs used by the pinch are left out (under 10 kcal a batch).
 */
import type { CatalogDish } from "../types.js";
import { dish, KATORI, s } from "./helpers.js";

const ATTA = "Whole wheat flour (atta)";
const RICE_RAW = "Rice, raw";
const RICE = "White rice, cooked";
const OIL = "Vegetable oil";
const plate = (grams: number, isDefault = true) => s("plate", grams, null, isDefault);

export const DISHES: CatalogDish[] = [
  // ── Breads ───────────────────────────────────────────────────────────────
  dish("Roti", "bread", "vegan", [[ATTA, 100]], 135,
    [s("piece", 40, "medium", true, "1 medium roti"), s("piece", 30, "small", false, "1 small roti"), s("piece", 55, "large", false, "1 large roti")],
    { aliases: ["chapati", "chapathi", "phulka", "fulka", "rotli", "wheat roti", "tawa roti", "plain roti"], note: "About 30 g atta per medium roti" }),
  dish("Plain paratha", "bread", "vegan", [[ATTA, 100], [OIL, 20]], 150,
    [s("piece", 60, "medium", true), s("piece", 45, "small"), s("piece", 80, "large")],
    { aliases: ["paratha", "tawa paratha", "lachha paratha", "triangle paratha"] }),
  dish("Aloo paratha", "bread", "vegan", [[ATTA, 100], ["Potato", 150], ["Onion", 15], [OIL, 20], ["Coriander leaves", 5]], 300,
    [s("piece", 120, "medium", true), s("piece", 90, "small"), s("piece", 150, "large")], { aliases: ["potato paratha", "aaloo paratha"] }),
  dish("Paneer paratha", "bread", "veg", [[ATTA, 100], ["Paneer", 80], ["Onion", 15], [OIL, 20]], 250,
    [s("piece", 120, "medium", true), s("piece", 90, "small"), s("piece", 150, "large")]),
  dish("Gobi paratha", "bread", "vegan", [[ATTA, 100], ["Cauliflower", 120], [OIL, 20]], 260,
    [s("piece", 120, "medium", true), s("piece", 90, "small"), s("piece", 150, "large")], { aliases: ["cauliflower paratha", "gobhi paratha"] }),
  dish("Puri", "bread", "vegan", [[ATTA, 100], [OIL, 30]], 160, [s("piece", 25, null, true)], { aliases: ["poori"], note: "Oil is what the dough absorbs when deep fried" }),
  dish("Bhatura", "bread", "veg", [["Refined flour (maida)", 100], ["Curd", 20], [OIL, 25]], 170, [s("piece", 70, null, true)], { aliases: ["bhature"] }),
  dish("Thepla", "bread", "veg", [[ATTA, 100], ["Gram flour (besan)", 15], ["Curd", 20], [OIL, 15]], 170, [s("piece", 40, null, true)], { aliases: ["methi thepla"] }),
  dish("Bajra roti", "bread", "vegan", [["Bajra flour", 100]], 140, [s("piece", 50, null, true)], { aliases: ["bajra rotla", "bajre ki roti"] }),
  dish("Jowar roti", "bread", "vegan", [["Jowar flour", 100]], 140, [s("piece", 50, null, true)], { aliases: ["jowar bhakri", "jolada rotti"] }),
  dish("Makki roti", "bread", "vegan", [["Makki flour", 100], [OIL, 10]], 150, [s("piece", 60, null, true)], { aliases: ["makki di roti", "makki ki roti"] }),

  // ── Rice dishes ──────────────────────────────────────────────────────────
  dish("Jeera rice", "rice_dish", "veg", [[RICE_RAW, 100], ["Ghee", 10]], 300, [KATORI(), plate(250, false)], { aliases: ["cumin rice"] }),
  dish("Veg pulao", "rice_dish", "vegan", [[RICE_RAW, 100], ["Green peas", 30], ["Carrot", 30], ["Green beans", 20], ["Onion", 30], [OIL, 15]], 380,
    [KATORI(), plate(250, false)], { aliases: ["pulao", "vegetable pulao", "pulav", "veg pulav"] }),
  dish("Khichdi", "rice_dish", "veg", [[RICE_RAW, 60], ["Moong dal, raw", 40], ["Ghee", 10]], 400, [KATORI(), s("bowl", 250, "large")], { aliases: ["moong dal khichdi", "dal khichdi", "khichri"] }),
  dish("Curd rice", "rice_dish", "veg", [[RICE, 150], ["Curd", 100], [OIL, 5]], 255, [KATORI(200)], { aliases: ["dahi chawal", "thayir sadam", "dahi rice"] }),
  dish("Lemon rice", "rice_dish", "vegan", [[RICE, 200], [OIL, 15], ["Peanuts", 15], ["Lemon juice", 10]], 240, [KATORI()], { aliases: ["chitranna", "nimbu rice"] }),
  dish("Veg biryani", "rice_dish", "veg", [[RICE_RAW, 100], ["Potato", 50], ["Carrot", 40], ["Green beans", 30], ["Green peas", 30], ["Onion", 50], ["Curd", 30], [OIL, 25]], 450,
    [plate(300), KATORI(200, false)], { aliases: ["vegetable biryani", "veg biriyani"] }),
  dish("Chicken biryani", "rice_dish", "nonveg", [[RICE_RAW, 100], ["Chicken thigh, raw", 150], ["Onion", 60], ["Curd", 40], [OIL, 30]], 500,
    [plate(350), KATORI(200, false)], { aliases: ["biryani", "chicken biriyani", "hyderabadi biryani", "dum biryani"] }),
  dish("Mutton biryani", "rice_dish", "nonveg", [[RICE_RAW, 100], ["Mutton, raw", 150], ["Onion", 60], ["Curd", 40], ["Ghee", 15], [OIL, 20]], 500,
    [plate(350), KATORI(200, false)], { aliases: ["mutton biriyani", "gosht biryani"] }),
  dish("Egg fried rice", "rice_dish", "egg", [[RICE, 250], ["Egg, raw", 50], ["Carrot", 20], ["Capsicum", 20], [OIL, 15]], 340, [plate(300), KATORI(200, false)]),
  dish("Veg fried rice", "rice_dish", "vegan", [[RICE, 250], ["Carrot", 30], ["Capsicum", 25], ["Green beans", 25], [OIL, 15]], 340, [plate(300), KATORI(200, false)], { aliases: ["fried rice"] }),

  // ── Dals and curries ─────────────────────────────────────────────────────
  dish("Dal tadka", "dal_curry", "veg", [["Toor dal, raw", 100], ["Tomato", 50], ["Onion", 30], ["Garlic", 5], ["Ghee", 15]], 600,
    [KATORI(), s("ladle", 60), s("bowl", 250, "large")], { aliases: ["dal", "daal", "toor dal", "arhar dal", "tuvar dal", "dal fry", "yellow dal", "tadka dal"] }),
  dish("Moong dal", "dal_curry", "veg", [["Moong dal, raw", 100], ["Tomato", 30], ["Onion", 20], ["Ghee", 10]], 600,
    [KATORI(), s("ladle", 60), s("bowl", 250, "large")], { aliases: ["moong ki dal", "yellow moong dal", "mung dal"] }),
  dish("Masoor dal", "dal_curry", "vegan", [["Masoor dal, raw", 100], ["Tomato", 40], ["Onion", 30], [OIL, 10]], 600,
    [KATORI(), s("ladle", 60), s("bowl", 250, "large")], { aliases: ["red lentil dal", "masoor ki dal"] }),
  dish("Dal makhani", "dal_curry", "veg", [["Urad dal, raw", 70], ["Rajma, raw", 15], ["Tomato", 80], ["Butter", 30], ["Fresh cream", 40]], 500,
    [KATORI(), s("bowl", 250, "large")], { aliases: ["maa ki dal", "dal makhni"] }),
  dish("Chole", "dal_curry", "vegan", [["Chana dal, raw", 100], ["Onion", 60], ["Tomato", 80], [OIL, 20]], 450,
    [KATORI(), s("bowl", 250, "large")], { aliases: ["chana masala", "chhole", "chickpea curry", "kabuli chana", "pindi chole"] }),
  dish("Rajma", "dal_curry", "vegan", [["Rajma, raw", 100], ["Onion", 60], ["Tomato", 100], [OIL, 20]], 500,
    [KATORI(), s("bowl", 250, "large")], { aliases: ["rajma masala", "kidney bean curry", "rajmah"] }),
  dish("Sambar", "dal_curry", "vegan", [["Toor dal, raw", 60], ["Carrot", 50], ["Brinjal", 50], ["Onion", 30], ["Tomato", 50], [OIL, 15]], 700,
    [KATORI(), s("ladle", 60)], { aliases: ["sambhar", "sambaar"] }),
  dish("Kadhi", "dal_curry", "veg", [["Curd", 200], ["Gram flour (besan)", 30], [OIL, 15]], 500, [KATORI()], { aliases: ["kadhi pakora", "punjabi kadhi", "gujarati kadhi", "kadi"] }),

  // ── Sabzis ───────────────────────────────────────────────────────────────
  dish("Aloo gobi", "sabzi", "vegan", [["Potato", 200], ["Cauliflower", 250], ["Onion", 50], ["Tomato", 50], [OIL, 30]], 450, [KATORI()], { aliases: ["gobi aloo", "aloo gobhi", "gobi sabzi"] }),
  dish("Bhindi masala", "sabzi", "vegan", [["Okra", 300], ["Onion", 60], [OIL, 30]], 280, [KATORI(100)], { aliases: ["bhindi", "bhindi sabzi", "bhindi fry", "okra sabzi"] }),
  dish("Baingan bharta", "sabzi", "vegan", [["Brinjal", 400], ["Onion", 60], ["Tomato", 80], [OIL, 25]], 400, [KATORI()], { aliases: ["bharta", "baingan ka bharta", "brinjal bharta"] }),
  dish("Aloo sabzi", "sabzi", "vegan", [["Potato", 300], ["Tomato", 50], [OIL, 25]], 330, [KATORI()], { aliases: ["aloo ki sabzi", "potato sabzi", "aloo bhaji", "batata bhaji"] }),
  dish("Mix veg", "sabzi", "vegan", [["Carrot", 80], ["Green beans", 80], ["Green peas", 60], ["Potato", 80], ["Cauliflower", 80], ["Onion", 40], [OIL, 25]], 400,
    [KATORI()], { aliases: ["mixed veg", "mix veg sabzi", "mixed vegetable", "sabzi", "veg sabzi"] }),
  dish("Lauki sabzi", "sabzi", "vegan", [["Bottle gourd", 400], ["Tomato", 50], ["Onion", 30], [OIL, 15]], 380, [KATORI()], { aliases: ["lauki", "ghiya sabzi", "doodhi sabzi"] }),
  dish("Cabbage sabzi", "sabzi", "vegan", [["Cabbage", 350], ["Green peas", 30], [OIL, 20]], 320, [KATORI()], { aliases: ["patta gobi sabzi", "cabbage matar", "cabbage poriyal"] }),
  dish("Palak paneer", "sabzi", "veg", [["Spinach", 300], ["Paneer", 150], ["Onion", 50], ["Tomato", 50], ["Fresh cream", 20], [OIL, 20]], 450, [KATORI()], { aliases: ["saag paneer"] }),
  dish("Paneer butter masala", "sabzi", "veg", [["Paneer", 200], ["Tomato", 200], ["Onion", 60], ["Cashews", 20], ["Butter", 30], ["Fresh cream", 50]], 500,
    [KATORI()], { aliases: ["paneer makhani", "butter paneer", "shahi paneer"] }),
  dish("Matar paneer", "sabzi", "veg", [["Paneer", 150], ["Green peas", 100], ["Tomato", 120], ["Onion", 60], [OIL, 20]], 450, [KATORI()], { aliases: ["mutter paneer", "paneer matar"] }),
  dish("Kadai paneer", "sabzi", "veg", [["Paneer", 200], ["Capsicum", 100], ["Onion", 80], ["Tomato", 100], [OIL, 25]], 450, [KATORI()], { aliases: ["karahi paneer"] }),
  dish("Paneer bhurji", "sabzi", "veg", [["Paneer", 200], ["Onion", 60], ["Tomato", 60], ["Capsicum", 30], [OIL, 15]], 330, [KATORI(100)]),

  // ── Non-veg ──────────────────────────────────────────────────────────────
  dish("Chicken curry", "dal_curry", "nonveg", [["Chicken thigh, raw", 500], ["Onion", 150], ["Tomato", 150], ["Curd", 50], ["Ginger", 10], ["Garlic", 10], [OIL, 40]], 750,
    [KATORI(), s("bowl", 250, "large")], { aliases: ["chicken masala", "home style chicken curry", "chicken gravy", "murgh curry"] }),
  dish("Butter chicken", "dal_curry", "nonveg", [["Chicken breast, raw", 400], ["Tomato", 250], ["Cashews", 30], ["Butter", 40], ["Fresh cream", 80]], 650,
    [KATORI()], { aliases: ["murgh makhani", "chicken makhani", "chicken tikka masala"] }),
  dish("Chicken tikka", "meal", "nonveg", [["Chicken breast, raw", 500], ["Curd", 100], [OIL, 15]], 420,
    [s("piece", 30, null, false, "1 piece"), s("serving", 180, null, true, "1 serving (6 pieces)"), s("plate", 240)], { aliases: ["chicken tikka dry", "tandoori chicken tikka", "grilled chicken tikka"] }),
  dish("Egg curry", "dal_curry", "egg", [["Egg, boiled", 200], ["Onion", 100], ["Tomato", 100], [OIL, 25]], 450,
    [s("serving", 225, null, true, "1 serving (2 eggs)"), KATORI(150, false)], { aliases: ["anda curry", "egg masala"] }),
  dish("Egg bhurji", "breakfast", "egg", [["Egg, raw", 150], ["Onion", 40], ["Tomato", 40], [OIL, 10]], 200,
    [s("serving", 135, null, true, "2-egg serving"), KATORI(100, false)], { aliases: ["anda bhurji", "scrambled eggs", "egg scramble"] }),
  dish("Omelette", "breakfast", "egg", [["Egg, raw", 100], ["Onion", 20], [OIL, 5]], 115,
    [s("piece", 115, null, true, "1 omelette (2 eggs)")], { aliases: ["omelet", "masala omelette", "egg omelette", "anda omelette"] }),
  dish("Fish curry", "dal_curry", "nonveg", [["Fish (rohu), raw", 400], ["Onion", 80], ["Tomato", 100], ["Mustard oil", 30]], 600,
    [KATORI(), s("serving", 200, null, false, "1 serving (2 pieces)")], { aliases: ["machli curry", "machher jhol", "fish gravy"] }),
  dish("Mutton curry", "dal_curry", "nonveg", [["Mutton, raw", 500], ["Onion", 150], ["Tomato", 100], ["Curd", 50], [OIL, 40]], 700,
    [KATORI(), s("bowl", 250, "large")], { aliases: ["mutton masala", "gosht curry", "mutton gravy", "rogan josh"] }),

  // ── Breakfast and South Indian ───────────────────────────────────────────
  dish("Poha", "breakfast", "vegan", [["Poha, raw", 100], ["Onion", 50], ["Potato", 50], ["Peanuts", 15], [OIL, 15]], 420,
    [plate(180), KATORI(150, false)], { aliases: ["kanda poha", "batata poha", "aloo poha", "pohe"] }),
  dish("Upma", "breakfast", "vegan", [["Semolina (sooji)", 100], ["Onion", 40], ["Green peas", 20], [OIL, 15]], 330, [KATORI(), plate(250, false)], { aliases: ["rava upma", "sooji upma", "uppittu"] }),
  dish("Idli", "breakfast", "vegan", [[RICE_RAW, 100], ["Urad dal, raw", 33]], 330, [s("piece", 40, null, true)], { aliases: ["idly", "rice idli"] }),
  dish("Plain dosa", "breakfast", "vegan", [[RICE_RAW, 100], ["Urad dal, raw", 33], [OIL, 15]], 320, [s("piece", 80, null, true)], { aliases: ["dosa", "sada dosa", "dosai"] }),
  dish("Masala dosa", "breakfast", "vegan", [[RICE_RAW, 100], ["Urad dal, raw", 33], ["Potato", 300], ["Onion", 60], [OIL, 50]], 800,
    [s("piece", 200, null, true)], { aliases: ["masala dose", "masala dosai"], note: "Four dosas with potato filling" }),
  dish("Uttapam", "breakfast", "vegan", [[RICE_RAW, 100], ["Urad dal, raw", 33], ["Onion", 40], ["Tomato", 40], [OIL, 20]], 440, [s("piece", 110, null, true)], { aliases: ["uthappam", "onion uttapam"] }),
  dish("Medu vada", "breakfast", "vegan", [["Urad dal, raw", 100], [OIL, 35]], 220, [s("piece", 45, null, true)], { aliases: ["vada", "medu wada", "uzhunnu vada"] }),
  dish("Coconut chutney", "spice_condiment", "vegan", [["Coconut, fresh", 100], ["Chana dal, raw", 15], [OIL, 5]], 180, [s("tbsp", 15, null, true), s("bowl", 50, null, false, "1 small katori")],
    { aliases: ["chutney", "nariyal chutney"] }),
  dish("Besan chilla", "breakfast", "vegan", [["Gram flour (besan)", 100], ["Onion", 30], ["Tomato", 30], [OIL, 15]], 230, [s("piece", 75, null, true)], { aliases: ["besan cheela", "chilla", "besan ka chilla"] }),
  dish("Moong dal chilla", "breakfast", "vegan", [["Moong dal, raw", 100], ["Onion", 30], [OIL, 15]], 280, [s("piece", 90, null, true)], { aliases: ["moong chilla", "pesarattu", "moong cheela"] }),
  dish("Oats porridge", "breakfast", "veg", [["Rolled oats", 40], ["Toned milk", 200], ["Sugar", 5]], 260, [s("bowl", 260, null, true, "1 bowl")], { aliases: ["oats with milk", "oatmeal", "porridge"] }),
  dish("Veg sandwich", "snack", "veg", [["White bread", 50], ["Butter", 5], ["Cucumber", 30], ["Tomato", 30]], 115, [s("piece", 115, null, true)], { aliases: ["vegetable sandwich", "bread sandwich"] }),

  // ── Snacks and street food ───────────────────────────────────────────────
  dish("Samosa", "snack", "vegan", [["Refined flour (maida)", 100], ["Potato", 200], ["Green peas", 30], [OIL, 65]], 400,
    [s("piece", 80, "medium", true), s("piece", 50, "small"), s("piece", 110, "large")], { aliases: ["aloo samosa", "samosas"] }),
  dish("Bhaji", "snack", "veg", [["Potato", 200], ["Cauliflower", 100], ["Green peas", 60], ["Tomato", 150], ["Onion", 60], ["Capsicum", 50], ["Butter", 40]], 600, [KATORI()], { aliases: ["pav bhaji bhaji"] }),
  dish("Pav bhaji", "snack", "veg", [["Bhaji", 250], ["Pav", 80], ["Butter", 10]], 340, [plate(340)], { note: "One plate = bhaji + 2 buttered pav" }),
  dish("Vada pav", "snack", "vegan", [["Pav", 50], ["Potato", 70], ["Gram flour (besan)", 15], [OIL, 10]], 145, [s("piece", 145, null, true)], { aliases: ["wada pav", "vadapav"] }),
  dish("Aloo tikki", "snack", "vegan", [["Potato", 250], ["Green peas", 30], [OIL, 25]], 280, [s("piece", 60, null, true)], { aliases: ["tikki", "potato tikki", "aloo patty"] }),
  dish("Paneer tikka", "snack", "veg", [["Paneer", 250], ["Curd", 50], ["Capsicum", 50], ["Onion", 50], [OIL, 10]], 360,
    [s("serving", 180, null, true, "1 serving (6 pieces)"), s("piece", 30)], { aliases: ["paneer tikka dry", "tandoori paneer"] }),
  dish("Raita", "dal_curry", "veg", [["Curd", 150], ["Cucumber", 50]], 200, [KATORI(100)], { aliases: ["cucumber raita", "boondi raita", "kheera raita"] }),

  // ── Combos ───────────────────────────────────────────────────────────────
  dish("Rajma chawal", "meal", "vegan", [["Rajma", 150], [RICE, 200]], 350, [plate(350)], { aliases: ["rajma rice"] }),
  dish("Dal chawal", "meal", "veg", [["Dal tadka", 150], [RICE, 200]], 350, [plate(350)], { aliases: ["dal rice", "dal bhaat"] }),
  dish("Chole bhature", "meal", "veg", [["Chole", 150], ["Bhatura", 140]], 290, [plate(290)], { aliases: ["chole bhature plate", "chhole bhature"], note: "One plate = a katori of chole + 2 bhature" }),
  dish("Chole chawal", "meal", "vegan", [["Chole", 150], [RICE, 200]], 350, [plate(350)], { aliases: ["chole rice", "chana chawal"] }),
  dish("Kadhi chawal", "meal", "veg", [["Kadhi", 150], [RICE, 200]], 350, [plate(350)], { aliases: ["kadhi rice"] }),
  dish("Idli sambar", "meal", "vegan", [["Idli", 80], ["Sambar", 150], ["Coconut chutney", 15]], 245, [plate(245)], { aliases: ["idli with sambar"], note: "One plate = 2 idli + a katori of sambar + chutney" }),

  // ── Drinks ───────────────────────────────────────────────────────────────
  dish("Chai", "drink", "veg", [["Toned milk", 75], ["Sugar", 8]], 150, [s("cup", 150, null, true)],
    { basis: "100ml", aliases: ["tea", "masala chai", "milk tea", "adrak chai", "cutting chai", "doodh wali chai"] }),
  dish("Chai without sugar", "drink", "veg", [["Toned milk", 75]], 150, [s("cup", 150, null, true)], { basis: "100ml", aliases: ["tea without sugar", "sugar free chai", "chai no sugar"] }),
  dish("Coffee", "drink", "veg", [["Toned milk", 100], ["Sugar", 8]], 150, [s("cup", 150, null, true)], { basis: "100ml", aliases: ["milk coffee", "filter coffee", "cappuccino", "latte", "nescafe"] }),
  dish("Sweet lassi", "drink", "veg", [["Curd", 150], ["Sugar", 25]], 250, [s("glass", 250, null, true)], { aliases: ["lassi", "meethi lassi"] }),
  dish("Buttermilk", "drink", "veg", [["Curd", 80]], 250, [s("glass", 250, null, true)], { aliases: ["chaas", "chhach", "mattha", "salted lassi", "masala chaas"] }),

  // ── Sweets ───────────────────────────────────────────────────────────────
  dish("Kheer", "sweet", "veg", [["Full cream milk", 500], [RICE_RAW, 30], ["Sugar", 40]], 400, [KATORI()], { aliases: ["rice kheer", "payasam", "chawal ki kheer"] }),
  dish("Sooji halwa", "sweet", "veg", [["Semolina (sooji)", 100], ["Ghee", 60], ["Sugar", 100]], 400, [KATORI(100)], { aliases: ["halwa", "suji halwa", "sheera", "rava kesari"] }),
  dish("Gulab jamun", "sweet", "veg", [["Khoya", 100], ["Refined flour (maida)", 20], [OIL, 20], ["Sugar", 60]], 220, [s("piece", 40, null, true)], { aliases: ["gulabjamun", "gulab jamuns"], note: "Sugar is the syrup each piece soaks up" }),
];
