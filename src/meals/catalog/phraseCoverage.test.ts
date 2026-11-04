/**
 * Phrase coverage: how people really type Indian meals (units like plate, packet and peg, joined
 * names like "fish curry rice", regional spellings). Each must be answered by the catalog alone,
 * with no web lookup and no gap logged. A new miss here means a food or alias is missing.
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

/** Known gaps, left to a web lookup on purpose: a bare "roll" could be five different foods, and a bottle of water is a litre. */
const KNOWN_MISSES = new Set(["1 roll", "1 bottle water", "1 subway sandwich"]);

const PHRASES = `2 chapati and sabzi
1 bowl dal chawal
2 phulka
3 rotis with dal and sabzi
half plate chole
1 glass chaas
1 glass lassi
2 glass milk
1 cup chai with biscuit
cutting chai
1 bowl curd rice
2 egg whites
3 egg omelette
2 boiled eggs and 1 toast
1 katori khichdi
1 bowl daliya
oats with milk and banana
1 plate idli sambar
2 plate momos
1 plate chowmein
1 plate pani puri
6 pani puri
1 bowl maggi
1 packet maggi
1 pav bhaji
2 pav
1 slice pizza
2 slice pizza
1 burger
1 cheese sandwich
1 roll
1 chicken roll
1 bowl rajma
1 plate rice
1 cup rice
1 katori paneer sabzi
100g paneer
200g chicken breast
150 g grilled chicken
1 tandoori roti
2 butter naan
1 bowl sambar rice
1 plate dosa
2 uttapam
1 bowl upma
1 bowl poha
1 glass sugarcane juice
1 mango
1 bowl fruit salad
1 apple
10 almonds
1 handful peanuts
5 cashews
2 tbsp peanut butter
1 tsp ghee
1 tbsp oil
1 bowl dal fry
1 bowl sambhar
1 chicken leg piece
2 chicken drumsticks
1 fish fry
1 plate fish curry rice
1 bowl mutton curry
1 plate biryani
1 chicken thali
1 veg thali
1 glass cold coffee
1 bottle water
1 scoop whey
1 scoop whey and 1 banana
1 protein shake
1 serving soya chunks
1 bowl soya chunks curry
1 bowl sprouts
1 cup green tea
1 bowl cornflakes with milk
1 bowl muesli
1 bowl vegetable soup
1 bowl tomato soup
1 bowl sweet corn soup
1 samosa
2 kachori
1 jalebi
2 gulab jamun
1 rasgulla
1 ladoo
1 piece kaju katli
1 bowl kheer
1 slice cake
1 ice cream cup
1 chocolate bar
1 dosa with sambar and chutney
2 paratha with curd
1 stuffed paratha
1 bowl besan chilla
1 bowl sabudana khichdi
1 plate dhokla
1 bowl matar paneer
1 bowl chana masala
1 bowl bhindi
1 cup black coffee
1 glass buttermilk
1 coconut water
1 glass orange juice
1 bowl papaya
1 slice watermelon
1 guava
10 grapes
1 bowl rice kheer
1 ragi roti
1 bajra roti
1 jowar roti
1 missi roti
1 bowl moong dal
1 bowl toor dal
1 bowl arhar dal
1 bowl urad dal
1 bowl palak dal
1 bowl lauki sabzi
1 bowl tinda
1 bowl tori
1 bowl karela
1 bowl gobi sabzi
1 bowl aloo gobi
1 plate chicken fried rice
1 plate egg fried rice
1 plate schezwan rice
1 plate manchurian
1 plate paneer tikka
1 plate tandoori chicken
1 plate seekh kebab
1 plate chicken tikka
2 egg roll
1 vada pav
2 medu vada
1 bowl dahi vada
1 bowl raita
1 bowl boondi raita
1 papad
1 pickle
1 tbsp chutney
1 bowl salad
1 cucumber
1 tomato
1 onion
1 bowl pasta
1 plate pasta white sauce
1 plate french fries
1 plate nachos
1 wrap
1 chicken wrap
1 shawarma
1 subway sandwich
1 mcaloo tikki burger
1 pack lays
1 pack kurkure
1 bowl popcorn
1 protein bar
1 energy bar
1 glass protein shake with milk
1 bowl greek yogurt
1 cup curd
1 tbsp chia seeds
1 tbsp flax seeds
1 date
2 dates
2 dry fig
1 bowl makhana
1 handful makhana
1 handful walnuts
1 bowl thukpa
1 bowl khichdi kadhi
1 plate litti chokha
1 plate chole kulche
1 plate aloo tikki chaat
1 bowl rasam
1 bowl vegetable biryani
1 glass thandai
1 glass badam milk
1 glass jaljeera
1 glass nimbu pani
1 glass aam panna
1 cup filter coffee
1 cup masala chai
1 cup kadha
1 cup haldi doodh
2 slice bread with butter
2 slice bread with jam
1 toast with peanut butter
1 bowl vegetable pulao
1 bowl jeera rice
1 bowl curd
1 bowl chicken curry
1 bowl egg curry
1 bowl keema
1 plate prawn curry
1 plate chicken 65
1 plate fish tikka
3 idli
1 plate pongal
1 plate vada sambar
1 bowl avial
1 bowl sundal
1 plate appam stew
1 bowl payasam
1 piece chikki
1 bowl bhel
1 bowl sev puri
1 plate dabeli
1 bowl misal
1 bowl usal
1 bowl poha jalebi
1 plate kachori sabzi
1 bowl dal baati churma
1 plate ghevar
1 bowl gajar halwa
1 bowl moong dal halwa
1 sandesh
1 mishti doi
1 rasmalai
1 plate puchka
1 bowl muri
1 bowl luchi
1 bowl alu dum
1 bowl chingri malai curry
1 plate hilsa
1 bowl khichuri
1 bowl chicken soup
1 glass sattu
1 bowl overnight oats
1 chicken breast
1 bowl quinoa
1 bowl brown rice
1 bowl millets
1 bowl tofu
1 bowl paneer bhurji
1 bowl rajma chawal
1 bowl chole chawal
1 bowl kadhi pakora
1 bowl lemon rice
1 bowl tamarind rice
1 bowl bisi bele bath
1 bowl sambar vada
1 cup cappuccino
1 cup latte
1 slice banana bread
1 muffin
1 croissant
1 donut
1 brownie
1 bowl cereal
1 bowl chocos
1 egg sandwich
1 bowl egg salad
1 bowl chicken salad
1 bowl tuna salad
1 can tuna
1 sardine
2 slice cheese
1 tbsp butter
1 tbsp mayonnaise
1 tbsp honey
2 tsp sugar
1 beer
1 glass wine
1 peg whisky
1 glass coke
1 bowl chana
1 bowl kala chana
1 bowl lobia
1 bowl matki usal`.split("\n");

describe("common phrases resolve from the catalog", () => {
  it("answers all of them without the web", async () => {
    const misses: string[] = [];
    for (const p of PHRASES) {
      const web = vi.fn();
      const gaps: unknown[] = [];
      const r = await estimateWithFoodDb(p, web, { recordGaps: (g: unknown) => { gaps.push(g); } } as never).catch(() => null);
      if (!r || web.mock.calls.length || gaps.length) misses.push(p);
    }
    expect(misses.filter((m) => !KNOWN_MISSES.has(m))).toEqual([]);
  });

  it("a plate of a piece food is two pieces, of a katori food one and a half katori", async () => {
    const dosa = await estimateWithFoodDb("1 plate dosa", vi.fn(), { recordGaps() {} } as never);
    const one = await estimateWithFoodDb("1 dosa", vi.fn(), { recordGaps() {} } as never);
    expect(dosa!.calories! / one!.calories!).toBeCloseTo(2, 0);
    const chole = await estimateWithFoodDb("1 katori chole", vi.fn(), { recordGaps() {} } as never);
    const plate = await estimateWithFoodDb("1 plate chole", vi.fn(), { recordGaps() {} } as never);
    expect(plate!.calories! / chole!.calories!).toBeCloseTo(1.5, 1);
  });

  it("splits two foods typed together, and keeps a known whole dish whole", async () => {
    const split = await estimateWithFoodDb("1 plate fish curry rice", vi.fn(), { recordGaps() {} } as never);
    expect(split!.items.length).toBe(2);
    const whole = await estimateWithFoodDb("dal chawal", vi.fn(), { recordGaps() {} } as never);
    expect(whole!.items.length).toBe(1);
  });
});
