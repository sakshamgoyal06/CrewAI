/**
 * How food search and recommendations order the catalog.
 *
 * - `POPULARITY`: how often people in India log a food, 1 (rare) to 5 (eaten most days by
 *   most people). A judged prior from household-consumption patterns, not from our users yet;
 *   once meal logs build up, `searchCatalog` blends in real log counts (catalog/search.ts).
 *   Unlisted entries get 2, or 1 for ingredients that are never eaten on their own.
 * - `CUISINE`: the regional or style group a dish belongs to, used to group results.
 *   Unlisted dishes and whole foods are "everyday" (pan-Indian home food and plain foods).
 *
 * Names must be catalog names; catalog.test.ts checks them.
 */
import type { Cuisine } from "../types.js";

const tier = (score: 1 | 2 | 3 | 4 | 5, names: string[]) => names.map((n) => [n, score] as const);

export const POPULARITY: Record<string, 1 | 2 | 3 | 4 | 5> = Object.fromEntries([
  // Most days, most homes.
  ...tier(5, [
    "Roti", "White rice, cooked", "Dal tadka", "Chai", "Toned milk", "Curd", "Egg, boiled", "Omelette", "Banana",
    "Poha", "Paneer", "Chicken curry", "Aloo sabzi", "Idli", "Masala dosa", "Coffee", "Apple", "Dal chawal",
    "Black coffee", "Water", "White bread", "Rajma chawal", "Upma", "Plain paratha", "Mix veg",
  ]),
  // Several times a week for many people.
  ...tier(4, [
    "Aloo paratha", "Plain dosa", "Sambar", "Coconut chutney", "Chole", "Rajma", "Moong dal", "Masoor dal",
    "Dal makhani", "Kadhi", "Jeera rice", "Veg pulao", "Khichdi", "Curd rice", "Chicken biryani", "Veg biryani",
    "Egg curry", "Egg bhurji", "Bread omelette", "Paneer butter masala", "Palak paneer", "Matar paneer",
    "Kadai paneer", "Paneer bhurji", "Butter chicken", "Aloo gobi", "Bhindi masala", "Baingan bharta",
    "Lauki sabzi", "Cabbage sabzi", "Aloo matar", "Jeera aloo", "Raita", "Buttermilk", "Sweet lassi", "Green salad",
    "Brown bread", "Oats porridge", "Besan chilla", "Moong dal chilla", "Uttapam", "Medu vada", "Idli sambar",
    "Samosa", "Vada pav", "Pav bhaji", "Instant noodles (masala), dry", "Chole bhature", "Kadhi chawal",
    "Chole chawal", "Puri bhaji", "Naan", "Butter naan", "Tandoori roti", "Veg sandwich", "Bread butter",
    "Chicken breast, cooked", "Grilled chicken breast", "Fish curry", "Mutton curry", "Chicken tikka",
    "Tandoori chicken", "Whey protein", "Whey shake", "Peanut butter", "Almonds", "Peanuts", "Roasted chana",
    "Mango", "Orange", "Papaya", "Watermelon", "Guava", "Grapes", "Pomegranate", "Coconut water", "Full cream milk",
    "Double toned milk", "Greek yogurt", "Marie biscuit", "Glucose biscuit", "Rusk", "Namkeen mixture",
    "Aloo bhujia", "Cola", "Cold coffee", "Nimbu pani", "Gulab jamun", "Kheer", "Sprouts chaat", "Moong sprouts",
    "Thepla", "Dhokla", "Pani puri", "Bhel puri", "Veg momos", "Hakka noodles", "Veg fried rice", "Egg fried rice",
    "Chilli paneer", "Veg pizza", "Veg burger", "Paneer tikka", "Onion pakora", "Aloo tikki", "Lemon rice",
    "Mango pickle", "Papad", "Rasam", "Rasam rice", "Pongal", "Dal palak", "Chicken fried rice", "Chicken roll",
  ]),
  // Regular, but not weekly for most.
  ...tier(3, [
    "Paneer paratha", "Gobi paratha", "Onion paratha", "Mooli paratha", "Puri", "Bhatura", "Bajra roti", "Jowar roti",
    "Makki roti", "Garlic naan", "Missi roti", "Kulcha", "Rumali roti", "Egg paratha", "Mutton biryani",
    "Egg pulao", "Tomato rice", "Coconut rice", "Ghee rice", "Tamarind rice", "Bisi bele bath", "Soya pulao",
    "Chicken keema", "Mutton keema", "Chicken korma", "Kadai chicken", "Chicken tikka masala", "Paneer tikka masala",
    "Soya chunk curry", "Chilli chicken", "Veg manchurian", "Mushroom masala", "Matar mushroom", "Dum aloo",
    "Shahi paneer", "Malai kofta", "Sarson ka saag", "Karela sabzi", "Turai sabzi", "Arbi fry", "Beans poriyal",
    "Avial", "Rava dosa", "Appam", "Neer dosa", "Puttu", "Puttu kadala", "Idiyappam", "Paniyaram", "Pesarattu",
    "Ragi dosa", "Vermicelli upma", "Bread upma", "Masala oats", "Sabudana khichdi", "Misal pav", "Misal",
    "Sprouts poha", "Overnight oats", "Peanut butter toast", "Egg sandwich", "Paneer sandwich", "Chicken sandwich",
    "Cheese sandwich", "Egg white omelette", "Egg white bhurji", "Tofu bhurji", "Sattu drink", "Fish fry",
    "Fish tikka", "Prawn masala", "Bengali fish curry", "Seekh kebab", "Chicken seekh kebab", "Shami kebab",
    "Chicken shawarma", "Chicken 65", "Chicken momos", "Egg roll", "Paneer roll", "Kachori", "Dahi vada",
    "Papdi chaat", "Dahi puri", "Sev puri", "Aloo chaat", "Samosa chaat", "Ragda pattice", "Dabeli",
    "Bread pakora", "Paneer pakora", "Masala vada", "Sabudana vada", "Khandvi", "Handvo", "Murukku", "Mathri",
    "Fruit chaat", "Corn chaat", "Chana chaat", "Red sauce pasta", "White sauce pasta", "Banana shake",
    "Mango shake", "Mango lassi", "Badam milk", "Banana smoothie", "Jaljeera", "Aam panna", "Rasgulla", "Jalebi",
    "Besan ladoo", "Rasmalai", "Kaju katli", "Sooji halwa", "Gajar halwa", "Milk barfi", "Peda", "Motichoor ladoo",
    "Shrikhand", "Kulfi", "Seviyan kheer", "Phirni", "Custard", "Cake", "Chocolate chip cookie", "Cream biscuit",
    "Digestive biscuit", "Milk chocolate", "Vanilla ice cream", "Dark chocolate", "French fries", "Potato chips",
    "Banana chips", "Khakhra", "Cornflakes", "Muesli", "Rolled oats", "Brown rice, cooked", "Quinoa, cooked",
    "Pav", "Cheese", "Butter", "Ghee", "Honey", "Jam", "Dates", "Cashews", "Walnuts", "Pistachios", "Makhana",
    "Raisins", "Chikoo", "Pineapple", "Pear", "Muskmelon", "Litchi", "Custard apple", "Jackfruit", "Strawberries",
    "Kiwi", "Sweet corn", "Cucumber", "Carrot", "Tomato", "Orange juice", "Mango drink", "Black tea", "Soy milk",
    "Protein bar", "Tofu", "Soya chunks, dry", "Chickpeas, boiled", "Fried egg", "Egg white", "Salmon", "Beer",
    "Hot chocolate", "Malt drink powder", "Chai without sugar", "Litti chokha", "Varan bhaat", "Haleem",
    "Dal dhokli", "Lauki chana dal", "Moong dal soup", "Vegetable soup", "Chicken soup", "Chicken salad",
    "Paneer salad bowl", "Sprouts bhel", "Boiled chana salad", "Dahi poha", "Soya poha", "Protein upma",
    "Paneer moong chilla", "Vegetable dalia", "Sweet dalia", "Pithla", "Usal",
  ]),
  // Rarely asked for on their own: cooking ingredients and specialty items.
  ...tier(1, [
    "Rice, raw", "Whole wheat flour (atta)", "Refined flour (maida)", "Semolina (sooji)", "Gram flour (besan)",
    "Jowar flour", "Bajra flour", "Ragi flour", "Makki flour", "Poha, raw", "Rice flour", "Buckwheat flour",
    "Dalia, raw", "Vermicelli, dry", "Masala oats, dry", "Sabudana", "Toor dal, raw", "Moong dal, raw",
    "Masoor dal, raw", "Urad dal, raw", "Chana dal, raw", "Rajma, raw", "Lobia, raw", "Moth beans, raw",
    "Chicken breast, raw", "Chicken thigh, raw", "Mutton, raw", "Fish (rohu), raw", "Prawns, raw", "Egg, raw",
    "Ginger", "Garlic", "Green chilli", "Coriander leaves", "Lemon juice", "Tamarind", "Poppy seeds",
    "Vegetable oil", "Mustard oil", "Coconut oil", "Olive oil", "Fresh cream", "Khoya", "Condensed milk",
    "Mozzarella", "Sugar", "Jaggery", "Sattu", "Coconut, fresh", "Moringa drumstick", "Taro root", "Raw banana",
    "Mustard greens", "Ridge gourd", "Bitter gourd", "Bottle gourd", "Okra", "Brinjal", "Cauliflower", "Cabbage",
    "Radish", "Pumpkin", "Green beans", "Capsicum", "Onion", "Potato", "Spinach", "Lettuce", "Mushroom",
    "Ginger chutney", "Tamarind chutney",
  ]),
]);

export const CUISINE: Record<string, Cuisine> = Object.fromEntries([
  ...[
    "Plain paratha", "Aloo paratha", "Paneer paratha", "Gobi paratha", "Onion paratha", "Mooli paratha", "Bhatura",
    "Makki roti", "Missi roti", "Sattu paratha", "Kulcha", "Rajma", "Rajma chawal", "Chole", "Chole chawal",
    "Chole bhature", "Kadhi", "Kadhi chawal", "Dal makhani", "Palak paneer", "Matar paneer", "Kadai paneer",
    "Paneer butter masala", "Shahi paneer", "Malai kofta", "Butter chicken", "Sarson ka saag", "Dum aloo",
    "Aloo gobi", "Baingan bharta", "Bajra roti", "Puri bhaji", "Aloo matar", "Jeera aloo", "Karela sabzi",
    "Turai sabzi", "Arbi fry", "Paneer tikka masala", "Chicken tikka masala", "Kadai chicken", "Dal palak",
    "Sweet lassi", "Gajar halwa", "Kuttu puri", "Litti", "Chokha", "Litti chokha",
  ].map((n) => [n, "north_indian" as const]),
  ...[
    "Idli", "Plain dosa", "Masala dosa", "Uttapam", "Medu vada", "Sambar", "Idli sambar", "Coconut chutney",
    "Peanut chutney", "Ginger chutney", "Curd rice", "Lemon rice", "Pongal", "Rasam", "Rasam rice", "Avial",
    "Tamarind rice", "Bisi bele bath", "Rava dosa", "Appam", "Neer dosa", "Beans poriyal", "Puttu",
    "Kadala curry", "Puttu kadala", "Akki roti", "Ragi dosa", "Pesarattu", "Idiyappam", "Paniyaram",
    "Vermicelli upma", "Tomato rice", "Coconut rice", "Ghee rice", "Murukku", "Masala vada", "Mysore pak",
    "Upma",
  ].map((n) => [n, "south_indian" as const]),
  ...[
    "Thepla", "Dhokla", "Handvo", "Khandvi", "Dal dhokli", "Khakhra", "Thalipeeth", "Sabudana khichdi",
    "Sabudana vada", "Pithla", "Varan bhaat", "Misal", "Misal pav", "Usal", "Poha", "Shrikhand", "Besan gatte ki sabzi",
    "Jowar roti",
  ].map((n) => [n, "west_indian" as const]),
  ...["Luchi", "Aloo posto", "Mishti doi", "Sandesh", "Rasgulla", "Bengali fish curry", "Fish fry"].map((n) => [n, "east_indian" as const]),
  ...[
    "Chicken biryani", "Mutton biryani", "Veg biryani", "Prawn biryani", "Chicken korma", "Mutton rogan josh",
    "Seekh kebab", "Chicken seekh kebab", "Shami kebab", "Haleem", "Tandoori chicken", "Chicken tikka",
    "Paneer tikka", "Fish tikka", "Tofu tikka", "Naan", "Butter naan", "Garlic naan", "Tandoori roti",
    "Rumali roti", "Phirni", "Rabri", "Kulfi",
  ].map((n) => [n, "mughlai" as const]),
  ...[
    "Hakka noodles", "Veg manchurian", "Chilli paneer", "Chilli chicken", "Veg fried rice", "Egg fried rice",
    "Chicken fried rice", "Veg momos", "Chicken momos", "Chicken 65",
  ].map((n) => [n, "indo_chinese" as const]),
  ...[
    "Samosa", "Kachori", "Bhaji", "Onion pakora", "Bread pakora", "Paneer pakora", "Vada pav", "Pav bhaji",
    "Aloo tikki", "Pani puri", "Bhel puri", "Sev puri", "Dahi puri", "Papdi chaat", "Aloo chaat", "Samosa chaat",
    "Ragda pattice", "Dabeli", "Dahi vada", "Egg roll", "Paneer roll", "Chicken roll", "Chicken shawarma",
    "Corn chaat", "Fruit chaat", "Chana chaat", "Sprouts chaat", "Sprouts bhel", "Jalebi", "Nimbu pani",
    "Jaljeera", "Aam panna", "Sugarcane juice",
  ].map((n) => [n, "street_food" as const]),
  ...[
    "Veg pizza", "Veg burger", "Red sauce pasta", "White sauce pasta", "Veg sandwich", "Cheese sandwich",
    "Egg sandwich", "Paneer sandwich", "Chicken sandwich", "Peanut butter toast", "Tofu scramble toast",
    "Overnight oats", "Oats porridge", "Bread butter", "Bread omelette", "Grilled chicken breast", "Chicken salad",
    "Egg salad", "Paneer salad bowl", "Tofu salad bowl", "Chicken soup", "Vegetable soup", "Cold coffee",
    "Banana shake", "Mango shake", "Banana smoothie", "Hot chocolate", "Custard", "Pasta, cooked", "Rolled oats",
    "Granola", "Muesli", "Cornflakes", "Quinoa, cooked", "Avocado", "Hummus", "Croissant", "Cake", "Doughnut",
    "Muffin", "Brownie", "French fries", "Chicken nuggets", "Chicken sausage", "Chicken salami", "Mozzarella",
    "Cheese", "Peanut butter", "Chocolate spread", "Jam", "Salmon", "Tuna, canned", "Edamame", "Zucchini",
    "Broccoli", "Lettuce",
  ].map((n) => [n, "western" as const]),
  ...[
    "Instant noodles (masala), dry", "Aloo bhujia", "Namkeen mixture", "Potato chips", "Banana chips",
    "Marie biscuit", "Glucose biscuit", "Digestive biscuit", "Cream biscuit", "Chocolate chip cookie", "Rusk",
    "Milk chocolate", "Dark chocolate", "Vanilla ice cream", "Cola", "Diet cola", "Mango drink", "Apple juice",
    "Energy drink", "Malt drink powder", "Masala oats, dry", "Masala oats", "Protein bar", "Whey protein",
    "Whey shake", "Ketchup", "Mayonnaise", "Mango pickle", "Beer", "Wine", "Whisky",
  ].map((n) => [n, "packaged" as const]),
]);
