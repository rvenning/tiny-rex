/** Fern Hollow: the opening chapter and the vertical-slice quest (The Missing Hatchlings). */
import type { NpcDef, QuestDef } from "../quests";

export const HOLLOW_NPCS: NpcDef[] = [
  {
    id: "mossback",
    name: "Mossback",
    creature: "elder-trike",
    home: { x: 30.6, y: 37.2 },
    region: "hollow",
    about: "The oldest nest-keeper in Fern Hollow. A Triceratops who speaks slowly and never wastes a fern.",
    chatter: [
      { text: "A steady foot and a patient jaw, little one. The valley rewards both." },
      { text: "Eat when you can, rest when you must. The nest will wait for you.", notFlag: "hollow-restored" },
      { text: "Listen to that. Three little peeps in the grass. Best sound there is.", flag: "hollow-restored" },
      { text: "The creek runs clearer since you came. I do not say that to everyone." },
    ],
  },
  {
    id: "pip",
    name: "Pip",
    creature: "scout-compy",
    home: { x: 26.4, y: 31.6 },
    region: "hollow",
    about: "A compy scout who has seen everything, will tell you twice, and swears the raiders were taller than a tree.",
    chatter: [
      { text: "Don't mind me! I'm scouting. Very quietly. Is it working? It's working." },
      { text: "I counted nine beetles today. Then I counted them again. Still nine!" },
      { text: "Old Scar's been sitting on that perch for a whole season. Doesn't blink. Creepy.", notFlag: "old-scar-down" },
      { text: "No more Old Scar on the perch! I'd cheer, but I'm scouting. Quietly. Hooray. Quietly.", flag: "old-scar-down" },
    ],
  },
  {
    id: "hatchlings",
    name: "The hatchlings",
    creature: "hatchling",
    home: { x: 31.6, y: 64.9 },
    region: "hollow",
    appears: "never-at-start",
    about: "Three very small, very loud dinosaurs who have decided you are in charge.",
    chatter: [{ text: "Peep! Peep peep! (Translation: you are the biggest and we like you.)" }],
  },
  {
    id: "hatchling",
    name: "Hatchling",
    creature: "hatchling",
    home: { x: 28.4, y: 36.0 },
    region: "hollow",
    appears: "never-at-start",
    about: "A hatchling.",
    chatter: [{ text: "Peep!" }, { text: "Peep peep?" }, { text: "(Tries to bite your tail. Is very proud.)" }],
  },
  {
    id: "hatchling-home",
    name: "Hatchling",
    creature: "hatchling",
    home: { x: 25.6, y: 38.4 },
    region: "hollow",
    appears: "hollow-restored",
    about: "Safely home.",
    chatter: [{ text: "Peep! (Home! Home! HOME!)" }, { text: "Peep peep peep. (Tell the other ones about the big brave one!)" }],
  },
];

const Mossback = "Mossback";
const Pip = "Pip";

export const HOLLOW_QUESTS: QuestDef[] = [
  {
    id: "quiet-nest",
    title: "A Quiet Nest",
    kind: "main",
    region: "hollow",
    level: 1,
    giver: null,
    summary: "Learn the valley the way every hatchling does: carefully, hungrily and with a good dodge.",
    offer: [],
    steps: [
      {
        type: "kill",
        creature: "beetle",
        count: 1,
        text: "Stalk a beetle and bite it",
        hint: "Creep close (hold Shift, or push the stick gently). Prey bolts when you run.",
      },
      { type: "kill", archetype: "prey", count: 2, text: "Hunt more small prey. Every meal grows your Feast" },
      {
        type: "talk",
        npc: "pip",
        text: "Find Pip, the scout by the creek",
        dialogue: [
          { speaker: Pip, text: "You! Yes, you! Excellent bite back there. I saw it. I see everything. That's my job." },
          { speaker: Pip, text: "Listen. There are raiders by the creek crossing. Little hungry ones. They've been nipping at the nest all morning." },
          { speaker: Pip, text: "Here's the trick: they all lunge at once, then they all stop. Dodge the lunge, bite while they're catching their breath. Space bar dodges. J bites." },
          { speaker: Pip, text: "I'd help, but I'm scouting. Very quietly. Go on! I'll be right here. Scouting." },
        ],
      },
      {
        type: "kill",
        creature: "compy-raider",
        tagged: true,
        count: 3,
        region: "hollow",
        text: "Drive off the compy raiders at the creek",
        at: { x: 31, y: 29.5 },
        hint: "Watch for the red fan on the ground: it shows where a lunge will land. Dodge, then bite.",
        spawn: [{ id: "compy-raider", at: { x: 31, y: 29.2 }, count: 3, spread: 2.4, level: 1 }],
      },
      {
        type: "talk",
        npc: "mossback",
        text: "Report to Mossback at the refuge",
        dialogue: [
          { speaker: Mossback, text: "I heard the commotion. And then I heard the quiet after it. Good." },
          { speaker: Mossback, text: "Take this. It grew on a raider's tooth and it has been waiting for someone with a proper jaw." },
          { speaker: Mossback, text: "Mutations. The valley changes everything it touches, and a clever dinosaur learns to wear the change. Open your mutations menu and put it on." },
        ],
      },
    ],
    reward: { xp: 90, amber: 12, loot: { rarity: "rare" }, text: "Your first mutation! Open the Mutations menu to wear it" },
  },
  {
    id: "missing-hatchlings",
    title: "The Missing Hatchlings",
    kind: "main",
    region: "hollow",
    level: 2,
    giver: "mossback",
    requires: { quests: ["quiet-nest"] },
    summary: "Three hatchlings have vanished from the nest. Something glowing walked off with them.",
    offer: [
      { speaker: Mossback, text: "There is a thing I have not said aloud yet. Three hatchlings are gone from the nest. I counted twice. Then I counted a third time, hoping I was wrong." },
      { speaker: Mossback, text: "No blood. No struggle. Just small prints leading south, and beside them, larger prints with an odd shine to them. Like amber, wet in the sun." },
      { speaker: Mossback, text: "My knees are not what they were. Will you follow the trail south of the refuge? Quietly at first. Then not quietly at all." },
    ],
    steps: [
      {
        type: "track",
        text: "Follow the footprints south of the refuge",
        clues: [
          { x: 23.8, y: 41.4 },
          { x: 24.2, y: 50 },
          { x: 28.6, y: 60 },
        ],
        lines: [
          "Tiny three-toed prints. They set off in a line, in step, the way hatchlings do when they are told to.",
          "The line breaks. The small prints scatter, then bunch together, then stop. Something larger dragged them on.",
          "A puddle of glowing amber slime. The prints end here. Beyond it you can hear peeping.",
        ],
      },
      {
        type: "kill",
        creature: undefined,
        archetype: undefined,
        count: 4,
        region: "hollow",
        text: "Drive off the brood snatchers guarding the hatchlings",
        at: { x: 29.6, y: 62.6 },
        hint: "A venom-spitter keeps its distance. Sidestep the glob, close in, and strike.",
        spawn: [
          { id: "compy-raider", at: { x: 29, y: 61.6 }, count: 3, spread: 1.2, level: 2 },
          { id: "dilo", at: { x: 30, y: 63.2 }, count: 1, level: 3 },
        ],
      },
      {
        type: "choice",
        npc: "hatchlings",
        text: "Speak to the hatchlings",
        at: { x: 31.6, y: 64.9 },
        onEnter: { spawn: [{ id: "hatchling", npc: "hatchlings", at: { x: 31.6, y: 64.9 }, count: 3, spread: 0.7 }] },
        prompt: [
          { speaker: "Hatchling", text: "Peep! PEEP! (You came! We were very brave. We only cried a little.)" },
          { speaker: "Hatchling", text: "Peep peep peeeeep. (The big shiny one went away. Its eyes were like the amber. It said it would come back.)" },
          { speaker: "Narrator", text: "The hatchlings huddle against your side. The trail home is long, and whatever took them knows where the nest is." },
        ],
        options: [
          { id: "escort", text: "Lead them home along the trail", flag: "hatch-escort" },
          { id: "guard", text: "Hold this spot while Mossback fetches them", flag: "hatch-guard" },
        ],
      },
      {
        type: "escort",
        onlyIf: "hatch-escort",
        text: "Lead the hatchlings home to the refuge",
        from: { x: 31.6, y: 64.9 },
        to: { x: 27.5, y: 36.5 },
        radius: 6,
        count: 3,
        hint: "They follow close. Keep moving; if you fight, they hide until it is safe.",
        spawn: [
          { id: "lurker", at: { x: 25.6, y: 52.8 }, count: 2, spread: 1.3, level: 3, dormant: true },
        ],
      },
      {
        type: "protect",
        onlyIf: "hatch-guard",
        text: "Hold the hollow until Mossback arrives",
        at: { x: 30.6, y: 63.8 },
        radius: 8,
        waves: [
          { text: "Raiders are coming back for the hatchlings!", spawn: [{ id: "compy-raider", at: { x: 28.6, y: 60.6 }, count: 4, spread: 1.4, level: 2 }] },
          { text: "A second wave: bigger this time!", spawn: [{ id: "raptor", at: { x: 28.8, y: 59.6 }, count: 2, spread: 1.4, level: 3 }] },
        ],
      },
      {
        type: "boss",
        rival: "old-scar",
        text: "Old Scar has come down from the perch. End this at the refuge",
        hint: "Old Scar guards the perch east of the refuge. Watch the red fans and the screech.",
      },
      {
        type: "talk",
        npc: "mossback",
        onlyIf: "hatch-escort",
        text: "Return to Mossback",
        dialogue: [
          { speaker: Mossback, text: "Three peeps. I would know them anywhere. You carried them the whole way, past the reeds and the rustling things." },
          { speaker: Mossback, text: "Whatever made Old Scar glow is not finished with this valley. But tonight, there are three more sleepers in the nest, and that is enough." },
          { speaker: Mossback, text: "Take these. Brood scales: the hatchlings shed them when they are happy, and you made them very happy." },
        ],
        onDone: { loot: { rarity: "rare", slot: "hide" } },
      },
      {
        type: "talk",
        npc: "mossback",
        onlyIf: "hatch-guard",
        text: "Return to Mossback",
        dialogue: [
          { speaker: Mossback, text: "I came as fast as these knees would carry me. I found you standing in a ring of defeated raiders, and three very smug hatchlings asleep in your shadow." },
          { speaker: Mossback, text: "You did not leave them. A guardian's watch is worth more than a hundred hunts." },
          { speaker: Mossback, text: "Take this. A keeper's old instinct. It will tell you when something wants your nest." },
        ],
        onDone: { loot: { rarity: "rare", slot: "instinct" } },
      },
    ],
    reward: { xp: 240, amber: 30, flags: ["hollow-restored", "old-scar-down", "amber-source-known"], world: "hollow-restored", text: "Fern Hollow is calm again · the hatchlings are home" },
    after: [
      { speaker: Mossback, text: "Old Scar's eyes, the glow, the prints... that amber comes from somewhere. Riverbend is where the creek leads. If you go, go with your claws sharp and your head high." },
    ],
  },
];

/** Extra Hollow encounters (levels 2–5): a raider pack on the east trail, a caller behind a raptor, a lurker on the south trail. */
export const HOLLOW_SPAWNS: [string, number, number, number?][] = [
  ["compy-raider", 52, 34, 2],
  ["compy-raider", 53.2, 33.2, 2],
  ["compy-raider", 52.6, 35, 2],
  ["raptor", 59, 33.4, 4],
  ["caller", 62.5, 33.6, 4],
  ["lurker", 24, 47, 3],
  ["oviraptor", 44.8, 41.2, 4],
];

export const HOLLOW_SIDE_QUESTS: QuestDef[] = [
  {
    id: "pip-count",
    title: "Pip’s Very Important Count",
    kind: "side",
    region: "hollow",
    level: 2,
    giver: "pip",
    requires: { quests: ["quiet-nest"] },
    summary: "Pip is writing the first Complete Map of Fern Hollow and needs a big dinosaur to check the corners.",
    offer: [
      { speaker: "Pip", text: "Big news. I'm making a MAP. Of everything. The complete valley, in my head, which is where the best maps live." },
      { speaker: "Pip", text: "Problem: I got scared at the ford, and again at the fossil shelf, and a third time at the egg nest, and I may have made up some of it. Would you go check? Walk to each place. Report back. Don't tell the beetles." },
    ],
    steps: [
      {
        type: "collect",
        text: "Check Pip's landmarks: the old perch, the fossil shelf, the egg nest",
        label: "Landmark confirmed",
        items: [
          { x: 42.5, y: 35.2 },
          { x: 46.2, y: 15.6 },
          { x: 46.6, y: 40.2 },
        ],
      },
      {
        type: "talk",
        npc: "pip",
        text: "Tell Pip what you found",
        dialogue: [
          { speaker: "Pip", text: "The ford is where I said it was? And the shelf? And the nest has EGGS in it? Incredible. I was right about three whole things." },
          { speaker: "Pip", text: "Here. Payment. It's from the bottom of my pocket, which is also where I keep the good stuff. Scout's honour. Quietly." },
        ],
      },
    ],
    reward: { xp: 90, amber: 25, loot: { rarity: "common" }, text: "Pip's map is complete (mostly)" },
    after: [{ speaker: "Pip", text: "I've added you to the map. Right in the middle. Slightly too big. Tell nobody." }],
  },
];
