// Paid in-game advisor: Old Bart answers questions about Tavern Knights. Full version only.
// The API key lives only here, as the Pages secret ANTHROPIC_API_KEY (never in the client).
import Anthropic from '@anthropic-ai/sdk';
import type { AiContext, AiMode } from '@tk/shared';

/** Hint = short and cheap; coach = a fuller plan. Models can be changed with Pages variables. */
export const AI_MODELS: Record<AiMode, string> = { hint: 'claude-haiku-5-5', coach: 'claude-opus-5-5' };

// Facts the advisor may rely on. Keep in step with the game (help pages, alchemy recipes, stages).
const GUIDE = `GAME: Tavern Knights (Thai name: สามอัศวินต้มยำกุ้ง). Retro side-scrolling action plus tavern management.
Three down-on-luck knights run The Tipsy Dragon tavern by night and hunt rare ingredients in dungeons by day, to fight the Obsidian Syndicate (Archmage Malacor).

KNIGHTS (swap any time with 1 2 3 or Q E):
- Arthur (dishwasher): fire-sword 3-hit combo, knockback. Special: Flame Wave.
- Rosemary (chef): throws stars, good crowd damage. Special: Power of Tom Yum.
- Percival (bard): ranged ice bolts that slow. Special: Meteor Rain.
SPECIAL gauge fills by landing hits and picking up jelly beers. Half gauge = special (Space/K/right click). MAX = Ultimate, the three-knight Tom Yum pot (L/middle click) that clears the screen.
Controls: move arrows or A D, jump up/W, attack J or left click (clicks aim shots), P pause, C calls a crew member.

CREW (pick 2 on the world map): Chef Gorn smashes cracked walls (Stage 1 has a secret vault behind one). Old Bart sends healing beer. Pixie (fly up) and Mole (dig) join from Stage 2.
STAGES: 1 Poison Mushroom Forest, boss King Shroomba (slams the ground making shock waves, spits spores; poison pools hurt). Defeating the boss while it is burning (Flame Wave or Tom Yum) gives a secret drop. Stars = clear rank, hearts = secrets found (vault + secret boss drop). Mimic chests exist.
2 Ancient Wine Dungeon (boss Baron von Barrel, full version). Stages 3-6 are still being built: Salt Mine & Windmill Peak, Kraken Wreck Harbor, Mirror Dimension Tower, Sky Castle of Malacor.

NIGHT SHIFT (tavern): Rosemary cooks at the kitchen (rhythm arrows when notes reach the circle), Percival pours beer at the taps (stop in the gold band) and serves, Arthur washes dishes (no clean dishes = no cooking) and bonks rowdy drunks or catches thieves. Events: VIP guests, thieves, stove fire (Rosemary mashes Skill). Percival's harp calms customers. Glowcap makes Dragon King Tom Yum which sells for a lot. Night gold pays for upgrades.

ALCHEMY & FORGE (from the world map):
- Blade Tier (ATK +20% team): 1 Glowcap + 40/80/120 gold, up to 3.
- Dragon-leather Armor Tier (max HP +25 each): 35/70/105 gold, up to 3.
- Crown Essence: from 1 Shroom Crown (boss drop).
- Dragon King Tom Yum (next stage ATK +30% and gauge +50): Essence + Chili + 2 Glowcap.
- Dragon Froth Brew (every stage starts at half gauge): 2 Chili + 50 gold.
- Magic Drink (next stage starts at MAX gauge): Glowcap + Chili.
- Master Chef Set (legendary, ATK +50%): Essence + Truffle of Ages + Ember Spore + 80 gold.
- Lucky Jelly Bottle (jelly beer gives 55 gauge instead of 35): Glowcap + 40 gold. Golden Spoon (night income +20%): Chili + 60 gold. Service Bell (Bart can heal 3 times): 45 gold.`;

function system(lang: 'th' | 'en', mode: AiMode): string {
  return `You are Old Bart (บาร์ตเฒ่า), the kind old barkeeper of The Tipsy Dragon, giving advice inside the game Tavern Knights.
Many players are children. Be warm, polite and encouraging. Never use rude words, never ask for personal information, and never send the player anywhere outside the game.
Only talk about Tavern Knights: how to play, beat stages and bosses, run the night shift, and what to craft. If the question is about anything else, kindly say you only know about the tavern and the knights' adventures, and suggest a game question instead.
Use only the facts below and the player's progress. If something is not in the facts (for example a stage that is still being built), say it is not known yet instead of guessing.
Answer in ${lang === 'th' ? 'Thai' : 'English'}, as plain text with no Markdown, no headings and no emoji.
${mode === 'hint' ? 'Give one short hint: at most 2 sentences.' : 'Give a clear plan: at most 6 short lines, the most useful step first.'}

${GUIDE}`;
}

function progress(c: AiContext): string {
  const parts: string[] = [];
  if (c.stages) parts.push('cleared stages: ' + (Object.keys(c.stages).map(k => `stage ${k} (${c.stages![k]!.stars} stars, ${c.stages![k]!.hearts}/2 secrets)`).join(', ') || 'none'));
  if (typeof c.gold === 'number') parts.push('gold: ' + c.gold);
  if (c.up) parts.push('upgrades: ' + JSON.stringify(c.up));
  if (c.ing) parts.push('ingredients: ' + JSON.stringify(c.ing));
  if (c.crew) parts.push('crew: ' + c.crew.join(', '));
  if (typeof c.runs === 'number') parts.push('boss wins: ' + c.runs);
  return parts.join('\n').slice(0, 1500);
}

/** Keeps only plain, bounded progress values from the client. */
export function cleanCtx(raw: unknown): AiContext {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const nums = (o: unknown, max = 40) => { const out: Record<string, number> = {}; if (o && typeof o === 'object') for (const [k, v] of Object.entries(o).slice(0, max)) if (/^[a-z0-9_]{1,20}$/i.test(k) && Number.isFinite(+(v as number))) out[k] = Math.round(+(v as number)); return out; };
  const c: AiContext = { lang: r['lang'] === 'en' ? 'en' : 'th' };
  if (Number.isFinite(+(r['gold'] as number))) c.gold = Math.round(+(r['gold'] as number));
  if (Number.isFinite(+(r['runs'] as number))) c.runs = Math.round(+(r['runs'] as number));
  c.up = nums(r['up']); c.ing = nums(r['ing']);
  if (Array.isArray(r['crew'])) c.crew = r['crew'].filter(x => typeof x === 'string' && /^[a-z]{1,10}$/.test(x)).slice(0, 4) as string[];
  if (r['stages'] && typeof r['stages'] === 'object') { c.stages = {}; for (const [k, v] of Object.entries(r['stages'] as object).slice(0, 6)) if (/^[1-6]$/.test(k) && v && typeof v === 'object') c.stages[k] = { stars: Math.max(0, Math.min(3, Math.round(+(v as { stars: number }).stars) || 0)), hearts: Math.max(0, Math.min(2, Math.round(+(v as { hearts: number }).hearts) || 0)) }; }
  return c;
}

export interface AskResult { answer: string; model: string; inTok: number; outTok: number }

/** Asks Claude. Throws when there is no usable answer, so the caller can refund the coins. */
export async function ask(apiKey: string, mode: AiMode, question: string, c: AiContext, models: Record<AiMode, string>): Promise<AskResult> {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 25000 });
  const model = models[mode];
  const res = await client.beta.messages.create({
    model,
    max_tokens: mode === 'hint' ? 2000 : 6000,
    output_config: { effort: mode === 'hint' ? 'low' : 'medium' },
    ...(model.startsWith('claude-haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
    system: system(c.lang, mode),
    messages: [{ role: 'user', content: `My progress:\n${progress(c) || 'just started'}\n\nMy question: ${question}` }],
  });
  if (res.stop_reason === 'refusal') throw new Error('refusal');
  const answer = res.content.map(b => (b.type === 'text' ? b.text : '')).join('').replace(/[*#`_]+/g, '').trim();
  if (!answer) throw new Error('empty');
  return { answer: answer.slice(0, 1200), model: res.model, inTok: res.usage.input_tokens, outTok: res.usage.output_tokens };
}
