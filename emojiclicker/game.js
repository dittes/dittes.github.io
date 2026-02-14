/* game.js — Emoji Clicker Engine */
"use strict";

/* ════════════════════════════════════════════
   §0  UTILITY HELPERS
   ════════════════════════════════════════════ */
const $ = (s, p) => (p || document).querySelector(s);
const $$ = (s, p) => [...(p || document).querySelectorAll(s)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (lo, hi) => Math.random() * (hi - lo) + lo;
const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const uid = () => Math.random().toString(36).slice(2, 10);

const SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc",
  "UDc", "DDc", "TDc", "QaDc", "QiDc", "SxDc", "SpDc", "OcDc", "NoDc", "Vg"];

function fmtNum(n, sci) {
  if (n === Infinity) return "∞";
  if (isNaN(n)) return "0";
  if (n < 0) return "-" + fmtNum(-n, sci);
  if (n < 1000) return n < 10 ? n.toFixed(1) : Math.floor(n).toString();
  if (sci && n >= 1e66) return n.toExponential(3);
  let i = 0;
  let v = n;
  while (v >= 1000 && i < SUFFIXES.length - 1) { v /= 1000; i++; }
  return (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.floor(v)) + " " + SUFFIXES[i];
}

function fmtTime(s) {
  if (s < 60) return Math.floor(s) + "s";
  if (s < 3600) return Math.floor(s / 60) + "m " + Math.floor(s % 60) + "s";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h + "h " + m + "m";
}

/* ════════════════════════════════════════════
   §1  GAME DATA DEFINITIONS
   ════════════════════════════════════════════ */

/* ── 1A: Buildings ── */
const BUILDINGS = [
  { id: "tap_buddy",     name: "Tap Buddy",           icon: "👆", baseCost: 15,         baseEps: 0.1,    desc: "A tiny friend who taps once in a while." },
  { id: "auto_tapper",   name: "Auto Tapper",         icon: "🖱️", baseCost: 100,        baseEps: 1,      desc: "Clicks automatically, forever." },
  { id: "kb_gremlin",    name: "Keyboard Gremlin",    icon: "⌨️", baseCost: 1100,       baseEps: 8,      desc: "Mashes keys to produce emojis." },
  { id: "sticker_print", name: "Sticker Printer",     icon: "🖨️", baseCost: 12000,      baseEps: 47,     desc: "Prints sheets of emoji stickers." },
  { id: "emoji_farm",    name: "Emoji Farm",          icon: "🌾", baseCost: 130000,     baseEps: 260,    desc: "Grow emojis organically." },
  { id: "mood_lab",      name: "Mood Lab",            icon: "🧪", baseCost: 1400000,    baseEps: 1400,   desc: "Synthesizes new emotions." },
  { id: "meme_factory",  name: "Meme Factory",        icon: "🏭", baseCost: 20000000,   baseEps: 7800,   desc: "Mass-produce viral emoji memes." },
  { id: "react_bank",    name: "Reaction Bank",       icon: "🏦", baseCost: 330000000,  baseEps: 44000,  desc: "Stores and compounds reactions." },
  { id: "temple_feels",  name: "Temple of Feels",     icon: "🛕", baseCost: 5100000000, baseEps: 260000, desc: "Ancient monks meditate on emoji." },
  { id: "gc_portal",     name: "Group Chat Portal",   icon: "🌀", baseCost: 75000000000,   baseEps: 1600000,  desc: "Opens portals to group chats." },
  { id: "time_machine",  name: "Unicode Time Machine", icon: "🕰️", baseCost: 1e12,      baseEps: 10000000,  desc: "Harvests emoji from all timelines." },
  { id: "multiverse",    name: "Multiverse Emulator", icon: "🌌", baseCost: 1.7e13,    baseEps: 65000000,  desc: "Simulates infinite emoji realities." },
];

/* ── 1B: Upgrades ── */
function makeUpgrades() {
  const ups = [];
  let uid = 0;
  const u = (name, icon, desc, cost, type, data, req) => {
    ups.push({ id: uid++, name, icon, desc, cost, type, data, req });
  };

  // Click power upgrades
  u("Stronger Fingers", "💪", "Clicks give +1 emoji.", 100, "click_flat", { add: 1 }, { clicks: 10 });
  u("Iron Thumbs", "🦾", "Clicks give +5 emojis.", 500, "click_flat", { add: 5 }, { clicks: 100 });
  u("Diamond Hands", "💎", "Clicks give +50 emojis.", 10000, "click_flat", { add: 50 }, { clicks: 500 });
  u("Quantum Tap", "⚛️", "Clicks give +500 emojis.", 1e6, "click_flat", { add: 500 }, { clicks: 2000 });
  u("Cosmic Press", "🌠", "Clicks give +5000 emojis.", 1e9, "click_flat", { add: 5000 }, { clicks: 10000 });

  // Click multipliers
  u("Double Tap", "✌️", "Clicks are worth 2x.", 1000, "click_mult", { mult: 2 }, { clicks: 200 });
  u("Triple Tap", "🤟", "Clicks are worth 3x.", 50000, "click_mult", { mult: 3 }, { clicks: 1000 });
  u("Mega Tap", "🖐️", "Clicks are worth 5x.", 5e6, "click_mult", { mult: 5 }, { clicks: 5000 });

  // Building-specific multipliers (per building, 3 tiers = 36 upgrades)
  BUILDINGS.forEach((b, i) => {
    const t1cost = b.baseCost * 10;
    const t2cost = b.baseCost * 500;
    const t3cost = b.baseCost * 50000;
    u(`Better ${b.name}`, b.icon, `${b.name} produces 2x more.`, t1cost, "bld_mult", { bld: b.id, mult: 2 }, { building: b.id, count: 1 });
    u(`Super ${b.name}`, b.icon, `${b.name} produces 3x more.`, t2cost, "bld_mult", { bld: b.id, mult: 3 }, { building: b.id, count: 25 });
    u(`Ultra ${b.name}`, b.icon, `${b.name} produces 5x more.`, t3cost, "bld_mult", { bld: b.id, mult: 5 }, { building: b.id, count: 50 });
  });

  // Synergy upgrades
  u("Farm-to-Factory Pipeline", "🚜", "Each Emoji Farm boosts Meme Factory by +5%.", 5e7, "synergy", { from: "emoji_farm", to: "meme_factory", pct: 0.05 }, { building: "emoji_farm", count: 10 });
  u("Lab Reactions", "⚗️", "Each Mood Lab boosts Reaction Bank by +5%.", 5e8, "synergy", { from: "mood_lab", to: "react_bank", pct: 0.05 }, { building: "mood_lab", count: 10 });
  u("Temporal Portals", "⏳", "Each Time Machine boosts Group Chat Portal by +3%.", 5e12, "synergy", { from: "time_machine", to: "gc_portal", pct: 0.03 }, { building: "time_machine", count: 5 });
  u("Multiverse Farming", "🪐", "Each Multiverse Emulator boosts Emoji Farm by +10%.", 1e14, "synergy", { from: "multiverse", to: "emoji_farm", pct: 0.10 }, { building: "multiverse", count: 1 });

  // Global EPS multipliers
  u("Optimism", "☀️", "All production +10%.", 5000, "global_mult", { mult: 1.10 }, { totalEmojis: 1000 });
  u("Viral Growth", "📈", "All production +25%.", 500000, "global_mult", { mult: 1.25 }, { totalEmojis: 100000 });
  u("Exponential Joy", "🎉", "All production +50%.", 5e7, "global_mult", { mult: 1.50 }, { totalEmojis: 1e7 });
  u("Singularity", "🔮", "All production doubles.", 5e10, "global_mult", { mult: 2.0 }, { totalEmojis: 1e10 });

  // Achievement scaling upgrades ("Hype Pets")
  u("Hype Puppy 🐕", "🐕", "Each achievement gives +0.5% EPS.", 10000, "ach_scale", { pct: 0.005 }, { achievements: 5 });
  u("Hype Kitten 🐈", "🐈", "Each achievement gives +0.5% EPS.", 1e6, "ach_scale", { pct: 0.005 }, { achievements: 20 });
  u("Hype Parrot 🦜", "🦜", "Each achievement gives +0.5% EPS.", 1e9, "ach_scale", { pct: 0.005 }, { achievements: 40 });
  u("Hype Dragon 🐉", "🐉", "Each achievement gives +1% EPS.", 1e12, "ach_scale", { pct: 0.01 }, { achievements: 60 });

  return ups;
}
const UPGRADES = makeUpgrades();

/* ── 1C: Achievements ── */
function makeAchievements() {
  const achs = [];
  let id = 0;
  const a = (name, icon, desc, req) => { achs.push({ id: id++, name, icon, desc, req }); };

  // Click milestones
  [1,10,50,100,500,1000,5000,10000,50000,100000,500000,1000000].forEach((n, i) => {
    a(`${n} Taps`, "👆", `Click ${fmtNum(n)} times.`, { clicks: n });
  });

  // Total emojis earned
  [100,1000,1e4,1e5,1e6,1e7,1e8,1e9,1e10,1e11,1e12,1e13,1e14,1e15].forEach(n => {
    a(`${fmtNum(n)} Emojis Earned`, "🪙", `Earn ${fmtNum(n)} total emojis.`, { totalEmojis: n });
  });

  // EPS milestones
  [1,10,100,1000,1e4,1e5,1e6,1e7,1e8,1e9,1e10].forEach(n => {
    a(`${fmtNum(n)} EPS`, "⚡", `Reach ${fmtNum(n)} emojis per second.`, { eps: n });
  });

  // Building milestones (per building)
  BUILDINGS.forEach(b => {
    [1, 25, 50, 100].forEach(n => {
      a(`${n} ${b.name}`, b.icon, `Own ${n} ${b.name}(s).`, { building: b.id, count: n });
    });
  });

  // Event milestones
  [1, 5, 10, 25, 50, 100].forEach(n => {
    a(`${n} Golden Catches`, "✨", `Click ${n} golden emojis.`, { goldenClicks: n });
  });

  // Prestige milestones
  [1, 2, 5, 10, 25].forEach(n => {
    a(`Reboot ${n}x`, "🔄", `Reboot ${n} time(s).`, { reboots: n });
  });

  // Secret achievements
  a("Night Owl 🦉", "🦉", "Play at midnight.", { secret: "midnight" });
  a("Patience 🧘", "🧘", "Do nothing for 60 seconds.", { secret: "idle60" });
  a("Speed Demon 👹", "👹", "50 clicks in 5 seconds.", { secret: "speed50" });
  a("Diamond Finder 💎", "💎", "Find a rare diamond.", { secret: "diamond" });
  a("Konami Master 🎮", "🎮", "Enter the code.", { secret: "konami" });
  a("Overcharger ⚡", "⚡", "Hold the big emoji for 3s.", { secret: "overcharge" });
  a("Dev Spy 🔍", "🔍", "Open the dev notes.", { secret: "devnotes" });
  a("Retro Gamer 👾", "👾", "Enable retro mode.", { secret: "retro" });
  a("Name Game 🏷️", "🏷️", "Set a special save name.", { secret: "namegame" });
  a("Void Walker 🕳️", "🕳️", "Accept a Void Emoji offer.", { secret: "void" });

  return achs;
}
const ACHIEVEMENTS = makeAchievements();

/* ── 1D: Aura Tree (Prestige) ── */
const AURA_TREE = [
  { id: "aura_prod1",   name: "Aura Boost I",     icon: "✨", desc: "+5% global production.",    cost: 1,  type: "global_mult", data: { mult: 1.05 } },
  { id: "aura_prod2",   name: "Aura Boost II",    icon: "✨", desc: "+10% global production.",   cost: 3,  type: "global_mult", data: { mult: 1.10 } },
  { id: "aura_prod3",   name: "Aura Boost III",   icon: "✨", desc: "+25% global production.",   cost: 10, type: "global_mult", data: { mult: 1.25 } },
  { id: "aura_click1",  name: "Aura Tap I",       icon: "👆", desc: "+50% click power.",         cost: 2,  type: "click_mult",  data: { mult: 1.5 } },
  { id: "aura_click2",  name: "Aura Tap II",      icon: "👆", desc: "+100% click power.",        cost: 5,  type: "click_mult",  data: { mult: 2 } },
  { id: "aura_gold1",   name: "Lucky Aura I",     icon: "🍀", desc: "Golden emojis last 50% longer.", cost: 3,  type: "golden_dur",  data: { mult: 1.5 } },
  { id: "aura_gold2",   name: "Lucky Aura II",    icon: "🍀", desc: "Golden emojis 2x more common.", cost: 5,  type: "golden_freq", data: { mult: 2 } },
  { id: "aura_offline", name: "Offline Boost",     icon: "😴", desc: "Offline progress capped at 8 hours.", cost: 4, type: "offline_cap", data: { hours: 8 } },
  { id: "aura_offline2",name: "Deep Sleep",        icon: "💤", desc: "Offline progress 50% more.", cost: 8,  type: "offline_mult", data: { mult: 1.5 } },
  { id: "aura_season",  name: "Seasons Unlock",    icon: "🗓️", desc: "Unlock the Seasons system.", cost: 10, type: "unlock_seasons", data: {} },
  { id: "aura_skin",    name: "Skin Collector I",  icon: "🎭", desc: "Unlock 3 extra emoji skins.", cost: 2,  type: "unlock_skins", data: { skins: ["🤯","👻","🤖"] } },
  { id: "aura_skin2",   name: "Skin Collector II", icon: "🎭", desc: "Unlock 3 more emoji skins.", cost: 5,  type: "unlock_skins", data: { skins: ["🦄","😈","🥳"] } },
  { id: "aura_pet",     name: "Companion Egg",     icon: "🥚", desc: "Hatch a companion pet!",   cost: 3,  type: "unlock_pet",   data: {} },
  { id: "aura_start",   name: "Head Start",        icon: "🚀", desc: "Start reboots with 100 emojis.", cost: 2, type: "start_bonus", data: { amount: 100 } },
  { id: "aura_start2",  name: "Mega Start",        icon: "🚀", desc: "Start reboots with 10000.", cost: 8,  type: "start_bonus", data: { amount: 10000 } },
  { id: "aura_crit",    name: "Critical Tap I",    icon: "💥", desc: "5% chance of 10x click.",   cost: 4,  type: "crit_chance", data: { chance: 0.05, mult: 10 } },
  { id: "aura_crit2",   name: "Critical Tap II",   icon: "💥", desc: "10% chance of 10x click.", cost: 12, type: "crit_chance", data: { chance: 0.10, mult: 10 } },
  { id: "aura_bulk",    name: "Bulk Discount",     icon: "🏷️", desc: "Buildings cost 5% less.",   cost: 6,  type: "cost_reduce", data: { pct: 0.05 } },
  { id: "aura_bulk2",   name: "Mega Discount",     icon: "🏷️", desc: "Buildings cost 10% less.",  cost: 15, type: "cost_reduce", data: { pct: 0.10 } },
  { id: "aura_achbonus", name: "Trophy Polish",    icon: "🏆", desc: "Achievements give 2x bonus.", cost: 7, type: "ach_double", data: {} },
];

/* ── 1E: Seasons ── */
const SEASONS = [
  { id: "spooky",  name: "Spooky Week",  icon: "🎃", bg: "linear-gradient(135deg,#1a0a2e,#2d1b4e)", emojis: ["🎃","👻","🦇","💀","🕷️","🧟","🕸️"], color: "#ff6b00" },
  { id: "festive", name: "Festive Time",  icon: "🎁", bg: "linear-gradient(135deg,#1a2e0a,#0a1a0a)", emojis: ["🎁","🎄","⭐","🔔","❄️","🧦","🎅"], color: "#ff2233" },
  { id: "love",    name: "Love Season",   icon: "💘", bg: "linear-gradient(135deg,#2e0a1a,#1a0a0a)", emojis: ["💘","💝","💖","💗","💕","🌹","😍"], color: "#ff4488" },
  { id: "party",   name: "Party Mode",    icon: "🎆", bg: "linear-gradient(135deg,#0a1a2e,#1a0a2e)", emojis: ["🎆","🎇","🥳","🎊","🎈","🪩","🎵"], color: "#ffcc00" },
];

/* ── 1F: News Ticker Lines ── */
const NEWS_LINES = [
  "Breaking: Local emoji achieves sentience, demands PTO.",
  "Scientists discover emojis are 97% pure vibes.",
  "Tap Buddies unionize; demand dental plan.",
  "Emoji Farm reports record turnip yields! 🌾",
  "Meme Factory investigated for producing too many memes.",
  "Group Chat Portal opens; 47 unread messages immediately.",
  "Unicode Time Machine accidentally invents 🦤 in 1987.",
  "Reaction Bank stock up 420%, analysts confused.",
  "Temple of Feels monk achieves inner 😊.",
  "Multiverse Emulator discovers universe made entirely of 🍕.",
  "Your tap is in the top 0.001% of tappers!",
  "This just in: you're doing great! Keep tapping!",
  "Keyboard Gremlin caught sleeping on the job.",
  "Mood Lab creates new emotion: 'Tapisfied'.",
  "Sticker Printer jammed. Sticky situation.",
  "News: clicking things is surprisingly rewarding.",
  "Today's forecast: 100% chance of emojis.",
  "Experts agree: one more tap can't hurt.",
  "Your emojis are the envy of the multiverse.",
  "Fun fact: this ticker is 100% artisanal.",
];

/* ── 1G: Emoji skins ── */
const ALL_SKINS = ["😀","😂","😎","🤯","👻","🤖","🦄","😈","🥳"];
const DEFAULT_SKINS = ["😀","😂","😎"];

/* ════════════════════════════════════════════
   §2  GAME STATE
   ════════════════════════════════════════════ */
function freshState() {
  const blds = {};
  BUILDINGS.forEach(b => { blds[b.id] = 0; });
  return {
    version: 4,
    emojis: 0,
    totalEmojis: 0,
    totalClicks: 0,
    clickPower: 1,
    eps: 0,
    bestEps: 0,
    buildings: blds,
    upgrades: [],       // purchased upgrade ids
    achievements: [],   // earned achievement ids
    aura: 0,
    auraSpent: 0,
    auraUpgrades: [],   // purchased aura node ids
    totalAuraEarned: 0,
    reboots: 0,
    goldenClicks: 0,
    diamondCount: 0,
    activeSkin: "😀",
    unlockedSkins: [...DEFAULT_SKINS],
    season: null,
    seasonCollected: {},
    saveName: "",
    settings: {
      reducedMotion: false,
      sound: true,
      soundVol: 0.5,
      haptics: true,
      highContrast: false,
      largeText: false,
      sciNotation: false,
      bulkBuy: 1,
    },
    secretsFound: [],
    petHatched: false,
    startTime: Date.now(),
    lastTick: Date.now(),
    lastSave: Date.now(),
    totalTimePlayed: 0,
    milestones: [],
    // runtime (not saved fully)
    _buffs: [],
  };
}

let G = freshState();

/* ════════════════════════════════════════════
   §3  PRODUCTION CALCULATIONS
   ════════════════════════════════════════════ */
function calcEps() {
  let total = 0;
  const bldMults = {};
  const synergyBonuses = {};

  // Base building multipliers from upgrades
  BUILDINGS.forEach(b => { bldMults[b.id] = 1; synergyBonuses[b.id] = 0; });

  G.upgrades.forEach(uid => {
    const up = UPGRADES[uid];
    if (!up) return;
    if (up.type === "bld_mult") bldMults[up.data.bld] *= up.data.mult;
    if (up.type === "synergy") {
      const fromCount = G.buildings[up.data.from] || 0;
      synergyBonuses[up.data.to] += fromCount * up.data.pct;
    }
  });

  // Aura building multipliers
  G.auraUpgrades.forEach(aid => {
    const node = AURA_TREE.find(n => n.id === aid);
    if (!node) return;
    // handled in global below
  });

  BUILDINGS.forEach(b => {
    const count = G.buildings[b.id];
    if (count <= 0) return;
    let eps = b.baseEps * count * bldMults[b.id];
    eps *= (1 + (synergyBonuses[b.id] || 0));
    total += eps;
  });

  // Global multipliers from upgrades
  let globalMult = 1;
  G.upgrades.forEach(uid => {
    const up = UPGRADES[uid];
    if (up && up.type === "global_mult") globalMult *= up.data.mult;
  });

  // Achievement scaling
  let achPct = 0;
  G.upgrades.forEach(uid => {
    const up = UPGRADES[uid];
    if (up && up.type === "ach_scale") achPct += up.data.pct;
  });
  // Aura: ach_double
  const achDouble = G.auraUpgrades.includes("aura_achbonus") ? 2 : 1;
  const achBonus = 1 + G.achievements.length * achPct * achDouble;

  // Achievement base bonus (+0.1% per ach)
  const achBase = 1 + G.achievements.length * 0.001 * achDouble;

  // Aura global mult
  let auraMult = 1 + G.aura * 0.01; // +1% per aura
  G.auraUpgrades.forEach(aid => {
    const node = AURA_TREE.find(n => n.id === aid);
    if (node && node.type === "global_mult") auraMult *= node.data.mult;
  });

  // Buff multipliers
  let buffMult = 1;
  G._buffs.forEach(b => { if (b.type === "eps_mult") buffMult *= b.value; });

  total *= globalMult * achBonus * achBase * auraMult * buffMult;
  G.eps = total;
  G.bestEps = Math.max(G.bestEps, total);
  return total;
}

function calcClickValue() {
  let base = G.clickPower;

  // Flat additions
  G.upgrades.forEach(uid => {
    const up = UPGRADES[uid];
    if (up && up.type === "click_flat") base += up.data.add;
  });

  // Multipliers
  let mult = 1;
  G.upgrades.forEach(uid => {
    const up = UPGRADES[uid];
    if (up && up.type === "click_mult") mult *= up.data.mult;
  });

  // Aura click mults
  G.auraUpgrades.forEach(aid => {
    const node = AURA_TREE.find(n => n.id === aid);
    if (node && node.type === "click_mult") mult *= node.data.mult;
  });

  // Buffs
  G._buffs.forEach(b => { if (b.type === "click_mult") mult *= b.value; });

  // Crit
  let crit = 1;
  G.auraUpgrades.forEach(aid => {
    const node = AURA_TREE.find(n => n.id === aid);
    if (node && node.type === "crit_chance") {
      if (Math.random() < node.data.chance) crit = Math.max(crit, node.data.mult);
    }
  });

  return base * mult * crit * (1 + G.aura * 0.01);
}

function getBuildingCost(bIdx, qty) {
  const b = BUILDINGS[bIdx];
  const owned = G.buildings[b.id];
  let discount = 1;
  G.auraUpgrades.forEach(aid => {
    const node = AURA_TREE.find(n => n.id === aid);
    if (node && node.type === "cost_reduce") discount -= node.data.pct;
  });
  discount = Math.max(0.5, discount);

  let total = 0;
  for (let i = 0; i < qty; i++) {
    total += Math.ceil(b.baseCost * Math.pow(1.15, owned + i) * discount);
  }
  return total;
}

function getMaxAffordable(bIdx) {
  const b = BUILDINGS[bIdx];
  const owned = G.buildings[b.id];
  let discount = 1;
  G.auraUpgrades.forEach(aid => {
    const node = AURA_TREE.find(n => n.id === aid);
    if (node && node.type === "cost_reduce") discount -= node.data.pct;
  });
  discount = Math.max(0.5, discount);
  let spent = 0;
  let count = 0;
  while (true) {
    const next = Math.ceil(b.baseCost * Math.pow(1.15, owned + count) * discount);
    if (spent + next > G.emojis) break;
    spent += next;
    count++;
    if (count > 10000) break;
  }
  return Math.max(1, count);
}

/* ════════════════════════════════════════════
   §4  AUDIO (WebAudio)
   ════════════════════════════════════════════ */
let audioCtx = null;
function getAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  return audioCtx;
}

function playTone(freq, dur, vol, type) {
  if (!G.settings.sound) return;
  const ctx = getAudio();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    gain.gain.value = (vol || 0.3) * G.settings.soundVol;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (dur || 0.1));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (dur || 0.1));
  } catch (e) {}
}

function popSound() { playTone(880 + Math.random() * 200, 0.06, 0.15, "sine"); }
function blingSound() { playTone(1200, 0.15, 0.25, "triangle"); setTimeout(() => playTone(1600, 0.2, 0.2, "triangle"), 80); }
function achieveSound() { playTone(523, 0.1, 0.2, "square"); setTimeout(() => playTone(659, 0.1, 0.2, "square"), 100); setTimeout(() => playTone(784, 0.15, 0.25, "square"), 200); }

function haptic(ms) {
  if (G.settings.haptics && navigator.vibrate) navigator.vibrate(ms || 10);
}

/* ════════════════════════════════════════════
   §5  SAVE / LOAD
   ════════════════════════════════════════════ */
const SAVE_KEY = "emoji_clicker_save_v4";

function saveGame() {
  try {
    const s = { ...G };
    delete s._buffs;
    s.totalTimePlayed += (Date.now() - s.lastTick);
    s.lastSave = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch (e) { console.warn("Save failed:", e); }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (!s || !s.version) return false;
    const fresh = freshState();
    // Merge carefully
    Object.keys(fresh).forEach(k => {
      if (k === "_buffs") return;
      if (k === "settings" && s.settings) {
        Object.keys(fresh.settings).forEach(sk => {
          if (s.settings[sk] !== undefined) fresh.settings[sk] = s.settings[sk];
        });
        G.settings = fresh.settings;
      } else if (s[k] !== undefined) {
        G[k] = s[k];
      }
    });
    // Ensure buildings have all keys
    BUILDINGS.forEach(b => { if (G.buildings[b.id] === undefined) G.buildings[b.id] = 0; });
    G._buffs = [];
    return true;
  } catch (e) { console.warn("Load failed:", e); return false; }
}

function exportSave() {
  saveGame();
  const raw = localStorage.getItem(SAVE_KEY);
  return btoa(raw);
}

function importSave(str) {
  try {
    const raw = atob(str);
    const obj = JSON.parse(raw);
    if (!obj || !obj.version) throw new Error("Invalid save");
    localStorage.setItem(SAVE_KEY, raw);
    location.reload();
  } catch (e) {
    alert("Invalid save data. Please check and try again.");
  }
}

function hardReset() {
  localStorage.removeItem(SAVE_KEY);
  location.reload();
}

/* ════════════════════════════════════════════
   §6  GOLDEN EMOJI EVENTS
   ════════════════════════════════════════════ */
let goldenTimeout = null;
let goldenEl = null;

function scheduleGolden() {
  let baseDelay = rand(60000, 180000); // 1-3 minutes
  let freqMult = 1;
  G.auraUpgrades.forEach(aid => {
    const node = AURA_TREE.find(n => n.id === aid);
    if (node && node.type === "golden_freq") freqMult *= node.data.mult;
  });
  baseDelay /= freqMult;
  goldenTimeout = setTimeout(spawnGolden, baseDelay);
}

function spawnGolden() {
  if (goldenEl) return;
  const isVoid = Math.random() < 0.05; // 5% chance void
  const game = $("#game-area");
  if (!game) return;

  const el = document.createElement("button");
  el.className = "golden-emoji" + (isVoid ? " void-emoji" : "");
  el.setAttribute("aria-label", isVoid ? "Void emoji - risky choice" : "Golden emoji - click for bonus");
  el.textContent = isVoid ? "🕳️" : "✨";
  el.style.left = rand(10, 80) + "%";
  el.style.top = rand(10, 70) + "%";
  game.appendChild(el);
  goldenEl = el;

  let durMult = 1;
  G.auraUpgrades.forEach(aid => {
    const node = AURA_TREE.find(n => n.id === aid);
    if (node && node.type === "golden_dur") durMult *= node.data.mult;
  });
  const lifespan = rand(8000, 12000) * durMult;

  const removeTimer = setTimeout(() => removeGolden(), lifespan);

  el.addEventListener("click", () => {
    clearTimeout(removeTimer);
    if (isVoid) {
      showVoidChoice();
    } else {
      triggerGoldenEffect();
    }
    G.goldenClicks++;
    removeGolden();
    blingSound();
    haptic(30);
  });

  // Wiggle animation class
  requestAnimationFrame(() => el.classList.add("wiggle"));
}

function removeGolden() {
  if (goldenEl) {
    goldenEl.remove();
    goldenEl = null;
  }
  scheduleGolden();
}

function triggerGoldenEffect() {
  const effects = [
    { name: "Hype Rush", desc: "+700% EPS for 20s", weight: 30, fn: () => addBuff("eps_mult", 8, 20000, "Hype Rush 🔥") },
    { name: "Tap Frenzy", desc: "Clicks 20x for 10s", weight: 30, fn: () => addBuff("click_mult", 20, 10000, "Tap Frenzy 👆") },
    { name: "Emoji Rain", desc: "Clickable emojis fall for 10s!", weight: 25, fn: () => startEmojiRain() },
    { name: "Instant Bonus", desc: "Get 10 minutes of EPS!", weight: 10, fn: () => { G.emojis += G.eps * 600; G.totalEmojis += G.eps * 600; } },
    { name: "Glitch!", desc: "Something weird happens...", weight: 5, fn: () => triggerGlitch() },
  ];

  const totalW = effects.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * totalW;
  let chosen = effects[0];
  for (const e of effects) {
    r -= e.weight;
    if (r <= 0) { chosen = e; break; }
  }

  chosen.fn();
  showNotification(`✨ ${chosen.name}: ${chosen.desc}`);
}

function addBuff(type, value, durationMs, label) {
  const buff = { id: uid(), type, value, label, expires: Date.now() + durationMs };
  G._buffs.push(buff);
  renderBuffs();
}

function showVoidChoice() {
  const modal = $("#modal");
  const content = $("#modal-content");
  content.innerHTML = `
    <h2>🕳️ Void Emoji</h2>
    <p>A rift in emoji-space opens before you...</p>
    <p><strong>Choose wisely:</strong></p>
    <div class="modal-choices">
      <button class="btn btn-gold" id="void-accept">Accept the Void<br><small>50% chance: +5000% EPS for 30s<br>50% chance: lose 10% emojis</small></button>
      <button class="btn" id="void-decline">Walk Away<br><small>Nothing happens</small></button>
    </div>
  `;
  modal.classList.add("open");
  $("#void-accept").onclick = () => {
    modal.classList.remove("open");
    unlockSecret("void");
    if (Math.random() < 0.5) {
      addBuff("eps_mult", 51, 30000, "VOID POWER 🕳️");
      showNotification("🕳️ The Void empowers you! +5000% EPS for 30s!");
    } else {
      const loss = G.emojis * 0.1;
      G.emojis -= loss;
      showNotification(`🕳️ The Void takes ${fmtNum(loss)} emojis from you!`);
    }
  };
  $("#void-decline").onclick = () => { modal.classList.remove("open"); };
}

/* ── Emoji Rain ── */
let rainInterval = null;
function startEmojiRain() {
  const area = $("#game-area");
  let count = 0;
  rainInterval = setInterval(() => {
    if (count++ > 40) { clearInterval(rainInterval); rainInterval = null; return; }
    const e = document.createElement("button");
    e.className = "rain-emoji";
    e.textContent = pick(["😀","😂","😎","🥳","💛","⭐","🎉","🪙"]);
    e.style.left = rand(5, 90) + "%";
    e.setAttribute("aria-label", "Falling emoji - click for bonus");
    e.onclick = () => {
      const val = calcClickValue() * 2;
      G.emojis += val;
      G.totalEmojis += val;
      spawnClickFeedback(e, val);
      e.remove();
      popSound();
    };
    area.appendChild(e);
    setTimeout(() => e.remove(), 3000);
  }, 250);
}

function triggerGlitch() {
  document.body.classList.add("glitch-mode");
  setTimeout(() => document.body.classList.remove("glitch-mode"), 5000);
}

/* ════════════════════════════════════════════
   §7  PRESTIGE / REBOOT
   ════════════════════════════════════════════ */
function calcAuraGain() {
  if (G.totalEmojis < 1e9) return 0;
  return Math.max(1, Math.floor(Math.pow(G.totalEmojis / 1e9, 0.5)));
}

function doReboot() {
  const gain = calcAuraGain();
  if (gain <= 0) return;

  G.aura += gain;
  G.totalAuraEarned += gain;
  G.reboots++;

  // Reset
  G.emojis = 0;
  G.totalEmojis = 0;
  G.totalClicks = 0;
  G.eps = 0;
  G.clickPower = 1;
  BUILDINGS.forEach(b => { G.buildings[b.id] = 0; });
  G.upgrades = [];
  G._buffs = [];

  // Start bonus
  let startBonus = 0;
  G.auraUpgrades.forEach(aid => {
    const node = AURA_TREE.find(n => n.id === aid);
    if (node && node.type === "start_bonus") startBonus += node.data.amount;
  });
  G.emojis = startBonus;
  G.totalEmojis = startBonus;

  addMilestone(`Reboot #${G.reboots} (+${gain} ✨ Aura)`);
  saveGame();
  showNotification(`🔄 Rebooted! Gained ${gain} ✨ Aura!`);
  blingSound();
  renderAll();
}

/* ════════════════════════════════════════════
   §8  ACHIEVEMENTS ENGINE
   ════════════════════════════════════════════ */
function checkAchievements() {
  let newAch = false;
  ACHIEVEMENTS.forEach(ach => {
    if (G.achievements.includes(ach.id)) return;
    const r = ach.req;
    let earned = false;
    if (r.clicks && G.totalClicks >= r.clicks) earned = true;
    if (r.totalEmojis && G.totalEmojis >= r.totalEmojis) earned = true;
    if (r.eps && G.eps >= r.eps) earned = true;
    if (r.building && G.buildings[r.building] >= r.count) earned = true;
    if (r.goldenClicks && G.goldenClicks >= r.goldenClicks) earned = true;
    if (r.reboots && G.reboots >= r.reboots) earned = true;
    if (r.achievements && G.achievements.length >= r.achievements) earned = true;
    if (r.secret && G.secretsFound.includes(r.secret)) earned = true;

    if (earned) {
      G.achievements.push(ach.id);
      newAch = true;
      showAchievementPopup(ach);
      achieveSound();
    }
  });
  if (newAch) renderAchievements();
}

function showAchievementPopup(ach) {
  const el = document.createElement("div");
  el.className = "achievement-popup";
  el.innerHTML = `<span class="ach-icon">${ach.icon}</span> <span>${ach.name}</span>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 500); }, 3000);
}

/* ════════════════════════════════════════════
   §9  SECRETS / EASTER EGGS
   ════════════════════════════════════════════ */
function unlockSecret(id) {
  if (!G.secretsFound.includes(id)) {
    G.secretsFound.push(id);
    checkAchievements();
  }
}

// Konami code
let konamiSeq = [];
const KONAMI = [38,38,40,40,37,39,37,39,66,65];
document.addEventListener("keydown", e => {
  konamiSeq.push(e.keyCode);
  if (konamiSeq.length > 10) konamiSeq.shift();
  if (konamiSeq.join(",") === KONAMI.join(",")) {
    unlockSecret("konami");
    if (!G.unlockedSkins.includes("🤯")) G.unlockedSkins.push("🤯");
    showNotification("🎮 Konami Code! Unlocked 🤯 skin!");
    blingSound();
  }
});

// Rapid clicks tracker
let rapidClicks = [];
function trackRapidClick() {
  const now = Date.now();
  rapidClicks.push(now);
  rapidClicks = rapidClicks.filter(t => now - t < 5000);
  if (rapidClicks.length >= 50) {
    unlockSecret("speed50");
    // Bonus event
    triggerGoldenEffect();
    rapidClicks = [];
  }
}

// Idle tracker
let lastActivity = Date.now();
let idleChecked = false;
function checkIdle() {
  if (!idleChecked && Date.now() - lastActivity > 60000) {
    unlockSecret("idle60");
    idleChecked = true;
  }
}

// Midnight check
function checkMidnight() {
  const h = new Date().getHours();
  const m = new Date().getMinutes();
  if (h === 0 && m === 0) {
    unlockSecret("midnight");
    document.body.classList.add("midnight-mode");
    setTimeout(() => document.body.classList.remove("midnight-mode"), 60000);
  }
}

/* ════════════════════════════════════════════
   §10  OFFLINE PROGRESS
   ════════════════════════════════════════════ */
function calcOfflineProgress() {
  const now = Date.now();
  const away = (now - G.lastTick) / 1000;
  if (away < 30) return; // less than 30s, ignore

  let maxHours = 4;
  G.auraUpgrades.forEach(aid => {
    const node = AURA_TREE.find(n => n.id === aid);
    if (node && node.type === "offline_cap") maxHours = Math.max(maxHours, node.data.hours);
  });

  let offlineMult = 0.5; // 50% efficiency
  G.auraUpgrades.forEach(aid => {
    const node = AURA_TREE.find(n => n.id === aid);
    if (node && node.type === "offline_mult") offlineMult *= node.data.mult;
  });

  const cappedAway = Math.min(away, maxHours * 3600);
  calcEps();
  const earned = G.eps * cappedAway * offlineMult;

  if (earned > 0) {
    G.emojis += earned;
    G.totalEmojis += earned;
    showNotification(`😴 Welcome back! Earned ${fmtNum(earned)} emojis while away (${fmtTime(cappedAway)}).`);
  }
}

/* ════════════════════════════════════════════
   §11  MILESTONES
   ════════════════════════════════════════════ */
function addMilestone(text) {
  G.milestones.push({ text, time: Date.now() });
  if (G.milestones.length > 100) G.milestones = G.milestones.slice(-100);
}

/* ════════════════════════════════════════════
   §12  RENDERING
   ════════════════════════════════════════════ */
let currentTab = "store";
let newsIdx = 0;

function renderAll() {
  renderHeader();
  renderStore();
  renderUpgrades();
  renderAchievements();
  renderStats();
  renderBuffs();
  renderSettings();
  renderAuraTree();
  updateBgTier();
}

function renderHeader() {
  const hEmojis = $("#h-emojis");
  const hEps = $("#h-eps");
  if (hEmojis) hEmojis.textContent = fmtNum(G.emojis, G.settings.sciNotation);
  if (hEps) hEps.textContent = fmtNum(G.eps, G.settings.sciNotation) + " EPS";
}

function renderStore() {
  const cont = $("#store-list");
  if (!cont) return;
  const qty = G.settings.bulkBuy === -1 ? 1 : G.settings.bulkBuy;

  let html = "";
  BUILDINGS.forEach((b, i) => {
    const owned = G.buildings[b.id];
    const buyQty = G.settings.bulkBuy === -1 ? getMaxAffordable(i) : qty;
    const cost = getBuildingCost(i, buyQty);
    const canAfford = G.emojis >= cost;
    html += `<button class="building-row ${canAfford ? "" : "locked"}" data-idx="${i}" data-qty="${buyQty}" aria-label="Buy ${buyQty} ${b.name} for ${fmtNum(cost)} emojis. Owned: ${owned}. ${b.desc}">
      <span class="bld-icon">${b.icon}</span>
      <span class="bld-info">
        <span class="bld-name">${b.name}</span>
        <span class="bld-cost">🪙 ${fmtNum(cost)}${buyQty > 1 ? " (×" + buyQty + ")" : ""}</span>
      </span>
      <span class="bld-count">${owned}</span>
    </button>`;
  });
  cont.innerHTML = html;

  // Attach events
  $$(".building-row", cont).forEach(el => {
    el.onclick = () => buyBuilding(+el.dataset.idx, +el.dataset.qty);
  });
}

function renderUpgrades() {
  const cont = $("#upgrade-list");
  if (!cont) return;
  let html = "";
  UPGRADES.forEach(up => {
    const bought = G.upgrades.includes(up.id);
    const visible = isUpgradeVisible(up);
    if (!visible && !bought) return;
    const canAfford = G.emojis >= up.cost && !bought;
    html += `<button class="upgrade-cell ${bought ? "bought" : ""} ${canAfford ? "affordable" : ""}" data-id="${up.id}" title="${up.name}: ${up.desc} (${fmtNum(up.cost)} 🪙)" aria-label="${up.name}: ${up.desc}. Cost: ${fmtNum(up.cost)} emojis. ${bought ? "Purchased." : ""}">
      <span class="up-icon">${up.icon}</span>
    </button>`;
  });
  cont.innerHTML = html;

  $$(".upgrade-cell:not(.bought)", cont).forEach(el => {
    el.onclick = () => buyUpgrade(+el.dataset.id);
  });
}

function isUpgradeVisible(up) {
  const r = up.req;
  if (r.clicks && G.totalClicks < r.clicks * 0.5) return false;
  if (r.totalEmojis && G.totalEmojis < r.totalEmojis * 0.5) return false;
  if (r.building) {
    const count = G.buildings[r.building] || 0;
    if (count < (r.count || 1) * 0.5) return false;
  }
  if (r.achievements && G.achievements.length < r.achievements * 0.5) return false;
  return true;
}

function renderAchievements() {
  const cont = $("#ach-list");
  if (!cont) return;
  const earned = new Set(G.achievements);
  let html = `<div class="ach-summary">${G.achievements.length}/${ACHIEVEMENTS.length} (${(G.achievements.length / ACHIEVEMENTS.length * 100).toFixed(1)}%)</div>`;
  ACHIEVEMENTS.forEach(ach => {
    const got = earned.has(ach.id);
    if (ach.req.secret && !got) {
      html += `<span class="ach-badge locked" title="???" aria-label="Secret achievement, not yet earned">❓</span>`;
    } else {
      html += `<span class="ach-badge ${got ? "earned" : "locked"}" title="${ach.name}: ${ach.desc}" aria-label="${ach.name}: ${ach.desc}. ${got ? "Earned" : "Not earned"}">${got ? ach.icon : "🔒"}</span>`;
    }
  });
  cont.innerHTML = html;
}

function renderStats() {
  const cont = $("#stats-content");
  if (!cont) return;
  const elapsed = (Date.now() - G.startTime) / 1000 + G.totalTimePlayed / 1000;
  cont.innerHTML = `
    <div class="stat-row"><span>Total Emojis Earned</span><span>${fmtNum(G.totalEmojis)}</span></div>
    <div class="stat-row"><span>Current Emojis</span><span>${fmtNum(G.emojis)}</span></div>
    <div class="stat-row"><span>EPS</span><span>${fmtNum(G.eps)}</span></div>
    <div class="stat-row"><span>Best EPS</span><span>${fmtNum(G.bestEps)}</span></div>
    <div class="stat-row"><span>Total Clicks</span><span>${fmtNum(G.totalClicks)}</span></div>
    <div class="stat-row"><span>Click Power</span><span>${fmtNum(calcClickValue())}</span></div>
    <div class="stat-row"><span>Golden Emojis Clicked</span><span>${G.goldenClicks}</span></div>
    <div class="stat-row"><span>💎 Diamonds Found</span><span>${G.diamondCount}</span></div>
    <div class="stat-row"><span>✨ Aura (Prestige)</span><span>${G.aura}</span></div>
    <div class="stat-row"><span>Reboots</span><span>${G.reboots}</span></div>
    <div class="stat-row"><span>Achievements</span><span>${G.achievements.length}/${ACHIEVEMENTS.length}</span></div>
    <div class="stat-row"><span>Time Played</span><span>${fmtTime(elapsed)}</span></div>
    <h3 class="stat-heading">Buildings</h3>
    ${BUILDINGS.map(b => `<div class="stat-row"><span>${b.icon} ${b.name}</span><span>${G.buildings[b.id]}</span></div>`).join("")}
    <h3 class="stat-heading">Milestones</h3>
    <div class="milestones">${G.milestones.slice(-20).reverse().map(m => `<div class="milestone">${m.text}</div>`).join("")}</div>
  `;
}

function renderBuffs() {
  const cont = $("#buff-bar");
  if (!cont) return;
  const now = Date.now();
  G._buffs = G._buffs.filter(b => b.expires > now);
  if (G._buffs.length === 0) { cont.innerHTML = ""; return; }
  cont.innerHTML = G._buffs.map(b => {
    const rem = Math.ceil((b.expires - now) / 1000);
    return `<span class="buff-pill" title="${b.label}">${b.label} ${rem}s</span>`;
  }).join("");
}

function renderSettings() {
  // Only render when settings panel is open
}

function renderAuraTree() {
  const cont = $("#aura-tree-list");
  if (!cont) return;
  const available = G.aura - G.auraSpent;
  let html = `<div class="aura-header">✨ Aura Available: ${available} (Total earned: ${G.totalAuraEarned})</div>`;
  AURA_TREE.forEach(node => {
    const bought = G.auraUpgrades.includes(node.id);
    const canBuy = available >= node.cost && !bought;
    html += `<button class="aura-node ${bought ? "bought" : ""} ${canBuy ? "affordable" : ""}" data-id="${node.id}" aria-label="${node.name}: ${node.desc}. Cost: ${node.cost} aura.${bought ? " Purchased." : ""}">
      <span class="an-icon">${node.icon}</span>
      <span class="an-info"><strong>${node.name}</strong><br>${node.desc}</span>
      <span class="an-cost">${bought ? "✓" : node.cost + " ✨"}</span>
    </button>`;
  });
  cont.innerHTML = html;

  $$(".aura-node:not(.bought)", cont).forEach(el => {
    el.onclick = () => {
      const nid = el.dataset.id;
      const node = AURA_TREE.find(n => n.id === nid);
      if (!node) return;
      const avail = G.aura - G.auraSpent;
      if (avail >= node.cost) {
        G.auraSpent += node.cost;
        G.auraUpgrades.push(node.id);
        // Unlock skins if applicable
        if (node.type === "unlock_skins") {
          node.data.skins.forEach(s => { if (!G.unlockedSkins.includes(s)) G.unlockedSkins.push(s); });
        }
        if (node.type === "unlock_pet") {
          G.petHatched = true;
          renderPet();
        }
        blingSound();
        renderAuraTree();
        renderAll();
      }
    };
  });
}

function updateBgTier() {
  const eps = G.eps;
  let tier = 0;
  if (eps >= 1) tier = 1;
  if (eps >= 100) tier = 2;
  if (eps >= 10000) tier = 3;
  if (eps >= 1e6) tier = 4;
  if (eps >= 1e9) tier = 5;
  document.body.dataset.tier = tier;

  if (G.season) {
    const s = SEASONS.find(s => s.id === G.season);
    if (s) document.body.style.setProperty("--season-bg", s.bg);
  } else {
    document.body.style.removeProperty("--season-bg");
  }
}

/* ── News Ticker ── */
function tickNews() {
  const el = $("#news-text");
  if (!el) return;
  el.classList.remove("news-slide");
  void el.offsetWidth;
  el.textContent = NEWS_LINES[newsIdx % NEWS_LINES.length];
  el.classList.add("news-slide");
  newsIdx++;
}

/* ── Pet ── */
function renderPet() {
  let pet = $("#pet");
  if (!G.petHatched) { if (pet) pet.style.display = "none"; return; }
  if (!pet) return;
  pet.style.display = "block";
  pet.textContent = "🐣";
}

/* ════════════════════════════════════════════
   §13  GAME ACTIONS
   ════════════════════════════════════════════ */
function doClick(e) {
  lastActivity = Date.now();
  idleChecked = false;
  const val = calcClickValue();
  G.emojis += val;
  G.totalEmojis += val;
  G.totalClicks++;

  // Visual feedback
  const target = $("#big-emoji");
  if (target) {
    target.classList.remove("squish");
    void target.offsetWidth;
    target.classList.add("squish");
  }

  // Spawn floating number
  spawnClickFeedback(target, val, e);

  // Diamond chance
  if (Math.random() < 0.001) {
    G.diamondCount++;
    unlockSecret("diamond");
    showNotification("💎 Rare diamond found!");
    blingSound();
  }

  popSound();
  haptic(8);
  trackRapidClick();
}

function spawnClickFeedback(anchor, value, e) {
  if (G.settings.reducedMotion) return;
  const area = $("#game-area");
  if (!area) return;

  const el = document.createElement("div");
  el.className = "click-float";
  el.textContent = "+" + fmtNum(value);

  let x, y;
  if (e && e.clientX) {
    const rect = area.getBoundingClientRect();
    x = e.clientX - rect.left;
    y = e.clientY - rect.top;
  } else if (anchor) {
    const rect = anchor.getBoundingClientRect();
    const areaRect = area.getBoundingClientRect();
    x = rect.left - areaRect.left + rect.width / 2 + rand(-20, 20);
    y = rect.top - areaRect.top + rand(-10, 10);
  } else {
    x = area.clientWidth / 2;
    y = area.clientHeight / 2;
  }

  el.style.left = x + "px";
  el.style.top = y + "px";
  area.appendChild(el);
  setTimeout(() => el.remove(), 800);

  // Spawn small emoji particle
  const p = document.createElement("div");
  p.className = "click-particle";
  p.textContent = pick(["✨","💛","⭐","🪙", G.activeSkin]);
  p.style.left = x + rand(-30, 30) + "px";
  p.style.top = y + "px";
  area.appendChild(p);
  setTimeout(() => p.remove(), 600);
}

function buyBuilding(idx, qty) {
  const b = BUILDINGS[idx];
  const buyQty = G.settings.bulkBuy === -1 ? getMaxAffordable(idx) : qty;
  const cost = getBuildingCost(idx, buyQty);
  if (G.emojis < cost) return;

  G.emojis -= cost;
  G.buildings[b.id] += buyQty;

  if (G.buildings[b.id] === buyQty) {
    addMilestone(`First ${b.name}!`);
  }

  popSound();
  haptic(15);
  calcEps();
  renderStore();
  renderHeader();
}

function buyUpgrade(id) {
  const up = UPGRADES[id];
  if (!up || G.upgrades.includes(id)) return;
  if (G.emojis < up.cost) return;

  G.emojis -= up.cost;
  G.upgrades.push(id);
  blingSound();
  haptic(20);
  calcEps();
  renderUpgrades();
  renderHeader();
}

/* ════════════════════════════════════════════
   §14  NOTIFICATION SYSTEM
   ════════════════════════════════════════════ */
const notifQueue = [];
let notifShowing = false;

function showNotification(text) {
  notifQueue.push(text);
  if (!notifShowing) drainNotifQueue();
}

function drainNotifQueue() {
  if (notifQueue.length === 0) { notifShowing = false; return; }
  notifShowing = true;
  const text = notifQueue.shift();
  const el = $("#notification");
  if (!el) { notifShowing = false; return; }
  el.textContent = text;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(drainNotifQueue, 300);
  }, 3500);
}

/* ════════════════════════════════════════════
   §15  MAIN LOOP
   ════════════════════════════════════════════ */
let lastFrame = performance.now();
let saveTimer = 0;
let achTimer = 0;
let newsTimer = 0;

function gameLoop(now) {
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;
  if (dt > 0 && dt < 10) {
    // Production
    const earned = G.eps * dt;
    G.emojis += earned;
    G.totalEmojis += earned;
  }

  calcEps();
  renderHeader();
  renderBuffs();

  // Periodic checks
  saveTimer += dt;
  achTimer += dt;
  newsTimer += dt;
  if (saveTimer > 10) { saveTimer = 0; saveGame(); }
  if (achTimer > 1) { achTimer = 0; checkAchievements(); checkIdle(); }
  if (newsTimer > 8) { newsTimer = 0; tickNews(); }

  G.lastTick = Date.now();
  requestAnimationFrame(gameLoop);
}

/* ════════════════════════════════════════════
   §16  UI INITIALIZATION
   ════════════════════════════════════════════ */
function initUI() {
  // Big emoji click
  const bigEmoji = $("#big-emoji");
  if (bigEmoji) {
    bigEmoji.addEventListener("click", doClick);
    bigEmoji.addEventListener("touchstart", e => { e.preventDefault(); }, { passive: false });
    bigEmoji.textContent = G.activeSkin;

    // Hold detection for overcharge
    let holdTimer = null;
    bigEmoji.addEventListener("pointerdown", () => {
      holdTimer = setTimeout(() => {
        unlockSecret("overcharge");
        addBuff("click_mult", 5, 5000, "Overcharge ⚡");
        showNotification("⚡ Overcharge! 5x clicks for 5s!");
        blingSound();
        holdTimer = null;
      }, 3000);
    });
    bigEmoji.addEventListener("pointerup", () => { if (holdTimer) clearTimeout(holdTimer); });
    bigEmoji.addEventListener("pointerleave", () => { if (holdTimer) clearTimeout(holdTimer); });
  }

  // Tabs
  $$(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      currentTab = tab;
      $$(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
      $$(".tab-panel").forEach(p => p.classList.toggle("active", p.id === "panel-" + tab));
      if (tab === "store") renderStore();
      if (tab === "upgrades") renderUpgrades();
      if (tab === "achievements") renderAchievements();
      if (tab === "stats") renderStats();
      if (tab === "aura") renderAuraTree();
    });
  });

  // Bulk buy buttons
  $$(".bulk-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const val = btn.dataset.bulk;
      G.settings.bulkBuy = val === "max" ? -1 : parseInt(val);
      $$(".bulk-btn").forEach(b => b.classList.toggle("active", b === btn));
      renderStore();
    });
  });

  // Settings toggles
  initSettings();

  // Skin selector
  initSkins();

  // Title triple-tap
  let titleTaps = 0;
  let titleTapTimer = null;
  const titleEl = $("h1");
  if (titleEl) {
    titleEl.addEventListener("click", () => {
      titleTaps++;
      if (titleTapTimer) clearTimeout(titleTapTimer);
      titleTapTimer = setTimeout(() => { titleTaps = 0; }, 600);
      if (titleTaps >= 3) {
        titleTaps = 0;
        unlockSecret("devnotes");
        showDevNotes();
      }
    });
  }

  // Prestige button
  const prestigeBtn = $("#prestige-btn");
  if (prestigeBtn) {
    prestigeBtn.addEventListener("click", () => {
      const gain = calcAuraGain();
      if (gain <= 0) {
        showNotification("Need at least 1 billion total emojis to reboot.");
        return;
      }
      const modal = $("#modal");
      const content = $("#modal-content");
      content.innerHTML = `
        <h2>🔄 Reboot</h2>
        <p>Reset your buildings, upgrades, and emojis to gain <strong>${gain} ✨ Aura</strong>.</p>
        <p>Aura gives permanent +1% production per point and unlocks the Aura Tree.</p>
        <p>Your achievements, aura, and aura upgrades are kept.</p>
        <div class="modal-choices">
          <button class="btn btn-gold" id="confirm-reboot">Reboot (+${gain} ✨)</button>
          <button class="btn" id="cancel-reboot">Cancel</button>
        </div>
      `;
      modal.classList.add("open");
      $("#confirm-reboot").onclick = () => { modal.classList.remove("open"); doReboot(); };
      $("#cancel-reboot").onclick = () => { modal.classList.remove("open"); };
    });
  }

  // Settings button
  $("#settings-btn")?.addEventListener("click", () => {
    const modal = $("#modal");
    const content = $("#modal-content");
    content.innerHTML = buildSettingsHTML();
    modal.classList.add("open");
    initSettingsModal();
  });

  // Close modal
  $("#modal-close")?.addEventListener("click", () => { $("#modal").classList.remove("open"); });
  $("#modal")?.addEventListener("click", e => { if (e.target.id === "modal") $("#modal").classList.remove("open"); });

  // Keyboard shortcut
  document.addEventListener("keydown", e => {
    if (e.code === "Space" && document.activeElement?.tagName !== "INPUT") {
      e.preventDefault();
      doClick(e);
    }
  });

  // Season selector
  initSeasons();

  // Pet
  renderPet();

  // Check midnight
  checkMidnight();
  setInterval(checkMidnight, 60000);
}

function initSkins() {
  const cont = $("#skin-selector");
  if (!cont) return;
  const updateSkins = () => {
    let html = "";
    ALL_SKINS.forEach(s => {
      const unlocked = G.unlockedSkins.includes(s);
      const active = G.activeSkin === s;
      html += `<button class="skin-btn ${active ? "active" : ""} ${unlocked ? "" : "locked"}" data-skin="${s}" ${unlocked ? "" : 'disabled'} aria-label="Emoji skin ${s}${active ? " (active)" : ""}${unlocked ? "" : " (locked)"}">${s}</button>`;
    });
    cont.innerHTML = html;
    $$(".skin-btn:not(.locked)", cont).forEach(btn => {
      btn.onclick = () => {
        G.activeSkin = btn.dataset.skin;
        const bigEmoji = $("#big-emoji");
        if (bigEmoji) bigEmoji.textContent = G.activeSkin;
        updateSkins();
        popSound();
      };
    });
  };
  updateSkins();
  // Re-render when skins change
  const obs = new MutationObserver(updateSkins);
  // We'll just call updateSkins on render
  window._updateSkins = updateSkins;
}

function initSeasons() {
  const cont = $("#season-selector");
  if (!cont) return;
  const unlocked = G.auraUpgrades.includes("aura_season");
  if (!unlocked) { cont.innerHTML = `<p class="locked-text">🔒 Unlock Seasons in the Aura Tree</p>`; return; }

  let html = `<button class="season-btn ${!G.season ? "active" : ""}" data-season="">None</button>`;
  SEASONS.forEach(s => {
    html += `<button class="season-btn ${G.season === s.id ? "active" : ""}" data-season="${s.id}">${s.icon} ${s.name}</button>`;
  });
  cont.innerHTML = html;

  $$(".season-btn", cont).forEach(btn => {
    btn.onclick = () => {
      G.season = btn.dataset.season || null;
      initSeasons();
      updateBgTier();
      blingSound();
    };
  });
}

function buildSettingsHTML() {
  return `
    <h2>⚙️ Settings</h2>
    <label class="toggle-row"><span>Reduced Motion</span><input type="checkbox" id="s-motion" ${G.settings.reducedMotion ? "checked" : ""}></label>
    <label class="toggle-row"><span>Sound</span><input type="checkbox" id="s-sound" ${G.settings.sound ? "checked" : ""}></label>
    <label class="toggle-row"><span>Sound Volume</span><input type="range" id="s-vol" min="0" max="1" step="0.1" value="${G.settings.soundVol}"></label>
    <label class="toggle-row"><span>Haptics (mobile)</span><input type="checkbox" id="s-haptics" ${G.settings.haptics ? "checked" : ""}></label>
    <label class="toggle-row"><span>High Contrast</span><input type="checkbox" id="s-contrast" ${G.settings.highContrast ? "checked" : ""}></label>
    <label class="toggle-row"><span>Large Text</span><input type="checkbox" id="s-large" ${G.settings.largeText ? "checked" : ""}></label>
    <label class="toggle-row"><span>Scientific Notation</span><input type="checkbox" id="s-sci" ${G.settings.sciNotation ? "checked" : ""}></label>
    <h3>Save Data</h3>
    <label class="toggle-row"><span>Save Name</span><input type="text" id="s-savename" value="${G.saveName}" placeholder="Name your save" maxlength="30"></label>
    <div class="settings-actions">
      <button class="btn" id="s-export">📤 Export Save</button>
      <button class="btn" id="s-import">📥 Import Save</button>
      <button class="btn btn-danger" id="s-reset">🗑️ Hard Reset</button>
    </div>
    <div id="s-export-area" style="display:none"><textarea id="s-export-text" rows="3" readonly></textarea></div>
    <div id="s-import-area" style="display:none"><textarea id="s-import-text" rows="3" placeholder="Paste save string..."></textarea><button class="btn" id="s-import-go">Load</button></div>
    <h3>About</h3>
    <p>Emoji Clicker v1.0 — A fun incremental game.</p>
    <button class="btn" id="s-retro">🕹️ Toggle Retro Mode</button>
  `;
}

function initSettingsModal() {
  $("#s-motion")?.addEventListener("change", e => {
    G.settings.reducedMotion = e.target.checked;
    document.body.classList.toggle("reduced-motion", e.target.checked);
  });
  $("#s-sound")?.addEventListener("change", e => { G.settings.sound = e.target.checked; });
  $("#s-vol")?.addEventListener("input", e => { G.settings.soundVol = parseFloat(e.target.value); });
  $("#s-haptics")?.addEventListener("change", e => { G.settings.haptics = e.target.checked; });
  $("#s-contrast")?.addEventListener("change", e => {
    G.settings.highContrast = e.target.checked;
    document.body.classList.toggle("high-contrast", e.target.checked);
  });
  $("#s-large")?.addEventListener("change", e => {
    G.settings.largeText = e.target.checked;
    document.body.classList.toggle("large-text", e.target.checked);
  });
  $("#s-sci")?.addEventListener("change", e => { G.settings.sciNotation = e.target.checked; });
  $("#s-savename")?.addEventListener("change", e => {
    G.saveName = e.target.value;
    if (G.saveName.toLowerCase() === "emoji" || G.saveName.toLowerCase() === "clicker") {
      unlockSecret("namegame");
      showNotification("🏷️ Special name detected!");
    }
  });

  $("#s-export")?.addEventListener("click", () => {
    const area = $("#s-export-area");
    area.style.display = "block";
    $("#s-export-text").value = exportSave();
    $("#s-export-text").select();
  });
  $("#s-import")?.addEventListener("click", () => {
    const area = $("#s-import-area");
    area.style.display = "block";
  });
  $("#s-import-go")?.addEventListener("click", () => {
    const val = $("#s-import-text")?.value?.trim();
    if (val) importSave(val);
  });
  $("#s-reset")?.addEventListener("click", () => {
    if (confirm("Are you sure? This will permanently delete all progress!")) {
      if (confirm("Really? There's no undo!")) hardReset();
    }
  });
  $("#s-retro")?.addEventListener("click", () => {
    document.body.classList.toggle("retro-mode");
    unlockSecret("retro");
    showNotification("👾 Retro mode toggled!");
  });
}

function initSettings() {
  if (G.settings.reducedMotion) document.body.classList.add("reduced-motion");
  if (G.settings.highContrast) document.body.classList.add("high-contrast");
  if (G.settings.largeText) document.body.classList.add("large-text");
}

function showDevNotes() {
  const modal = $("#modal");
  const content = $("#modal-content");
  content.innerHTML = `
    <h2>🔍 Dev Notes</h2>
    <p>Hey! You found the secret dev panel.</p>
    <p>Emoji Clicker was built with ❤️ as a love letter to incremental games.</p>
    <p>Some tips: try the Konami code, hold the big emoji for 3 seconds, play at midnight, or tap really fast...</p>
    <p>Thanks for playing! 🎮</p>
    <button class="btn" onclick="document.getElementById('modal').classList.remove('open')">Close</button>
  `;
  modal.classList.add("open");
}

/* ════════════════════════════════════════════
   §17  BOOT
   ════════════════════════════════════════════ */
function boot() {
  const loaded = loadGame();
  if (loaded) {
    calcOfflineProgress();
  } else {
    addMilestone("Game started!");
  }

  initUI();
  calcEps();
  renderAll();
  tickNews();
  scheduleGolden();

  // Apply settings
  initSettings();

  // Autosave on visibility change
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) saveGame();
    else {
      calcOfflineProgress();
      calcEps();
    }
  });

  // Save before unload
  window.addEventListener("beforeunload", saveGame);

  // Start loop
  requestAnimationFrame(gameLoop);

  // PWA install
  let deferredPrompt;
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = $("#install-btn");
    if (installBtn) {
      installBtn.style.display = "inline-flex";
      installBtn.onclick = () => {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(() => { deferredPrompt = null; installBtn.style.display = "none"; });
      };
    }
  });

  console.log("🎮 Emoji Clicker loaded! Have fun.");
}

// Start when DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
