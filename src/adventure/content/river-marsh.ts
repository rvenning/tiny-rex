/** Riverbend and Reed Marsh: chapters 3 and 4 (the River Hunter, the Marsh Lanterns), four side quests, four NPCs, the
 *  designed encounters on the trails and the marsh gas. Positions were picked on the walkable trail ground of the
 *  connected world (see tools/world/map_preview.py) and are checked by tests/arpg-quests.test.ts. */
import type { NpcDef, QuestDef } from "../quests";
import type { RegionContent } from "./types";

const Nibble = "Old Nibble";
const Reed = "Reedwhistle";
const Quill = "Quill";
const Sniffle = "Sniffle";

export const RIVER_MARSH_NPCS: NpcDef[] = [
  {
    id: "old-nibble",
    name: "Old Nibble",
    creature: "elder-hypsi",
    home: { x: 100, y: 62.4 },
    region: "river",
    about: "Keeper of Riverbend ford. A Hypsilophodon who remembers every flood, tells each story twice and has never once lost a hatchling to the current.",
    chatter: [
      { text: "Mind the wet stones. They look friendly. They are not. I have the scars on my tail to prove it." },
      { text: "Forty-one floods I've seen. The forty-second is overdue and I find that rude." },
      { text: "Scarfang has gone quiet. I do not like quiet on a river. Quiet is how things get in." , notFlag: "river-cleared" },
      { text: "The river sounds right again. Hear that? That's the sound of nobody being chased. Lovely.", flag: "river-cleared" },
      { text: "Reedwhistle still has my umbrella. I lent it to her in the year of the third flood. I am not keeping count. It was forty years ago.", flag: "river-cleared" },
      { text: "Fern Hollow's hatchlings are home? Splendid! Nothing crosses a ford like a happy clutch.", flag: "hollow-restored" },
    ],
  },
  {
    id: "quill",
    name: "Quill",
    creature: "elder-oviraptor",
    home: { x: 85.5, y: 57.5 },
    region: "river",
    scale: 0.88,
    tint: 0xf1dcae,
    about: "A shy Oviraptor with a very flat, very suspicious pile of reeds she is sitting on. She says it is nothing.",
    chatter: [
      { text: "Nothing under here. Nothing at all. I am simply... sitting. It's a hobby." },
      { text: "Do not look at the reeds. Look at the sky. Isn't it a lovely sky?" },
      { text: "Everyone thinks I'm a thief. Just because I'm an Oviraptor. The name is a MYTH, you know." },
      { text: "Thank you for what you did. Three little wigglers and not one of them can say my name properly. It is the best week of my life.", flag: "egg-forgiven" },
      { text: "I returned every egg. Every one. I even apologised in a loud voice. It was not a nice day, but it was a fair one.", flag: "egg-punished" },
    ],
  },
  {
    id: "reedwhistle",
    name: "Reedwhistle",
    creature: "elder-oviraptor",
    home: { x: 97.4, y: 72.6 },
    region: "marsh",
    about: "The warden of Reed Marsh. Crisp, stern, and secretly knitting something very small and very warm in the evenings.",
    chatter: [
      { text: "Keep to the trail. The marsh does not forgive wandering. The marsh also does not forgive jokes, so keep those to yourself too." },
      { text: "I do not worry. I observe, closely, with a tense jaw. It is quite different." },
      { text: "If you see a glowing plant, do not touch it, do not smell it, and above all do not tell a hatchling it looks tasty.", notFlag: "marsh-cleared" },
      { text: "The lanterns have gone dark. The nests are quiet. I may even have slept. Do not tell anyone I slept.", flag: "marsh-cleared" },
      { text: "Old Nibble sent word that the river is calm? Good. He may keep his opinions on my crest. And I may keep his umbrella.", flag: "river-cleared" },
    ],
  },
  {
    id: "sniffle",
    name: "Sniffle",
    creature: "trike",
    home: { x: 105.5, y: 95.5 },
    region: "marsh",
    about: "A very large, very sniffly Triceratops. Every sneeze is a small weather event. A gentle soul.",
    chatter: [
      { text: "Hrrrk... AH... ah... no. False alarm. Please wait while I regret that." },
      { text: "I was a magnificent roarer once. Now I sound like a door being politely closed." },
      { text: "Hello! I would shake a claw, but I am saving my energy for the next sneeze." },
      { text: "Listen to that! A clear throat! I have been roaring at the frogs all morning. They are not impressed, but I am.", flag: "cough-cured" },
    ],
  },
];

export const RIVER_MARSH_QUESTS: QuestDef[] = [
  // ---------------------------------------------------------------- chapter 3
  {
    id: "river-hunter",
    title: "Scarfang of the River",
    kind: "main",
    region: "river",
    level: 8,
    giver: null,
    requires: { quests: ["missing-hatchlings"] },
    summary: "A glow-eyed raptor the ford keeper calls Scarfang has the east bank. Follow the stained prints and bring Old Nibble proof.",
    offer: [],
    steps: [
      {
        type: "talk",
        npc: "old-nibble",
        text: "Find Old Nibble, the ford keeper, at Riverbend",
        hint: "Follow the creek east into Riverbend. The ford keeper's post is at the south end, by the water.",
        dialogue: [
          { speaker: Nibble, text: "Well, well. A little thing with Fern Hollow dust on its claws. I am Old Nibble. I've kept this ford longer than the reeds have had names." },
          { speaker: Nibble, text: "Scarfang used to hunt quietly. A quick pounce, a polite nod, off she went. Then the amber came. Now she glows and snaps at the wind, and nobody can use the east trail." },
          { speaker: Nibble, text: "Her prints run amber-stained from the water up the east bank, round to her old perch. Follow them. Bring me something of hers, for proof. I will not send a hatchling after a rumour." },
        ],
      },
      {
        type: "track",
        text: "Follow the amber-stained prints up the east bank",
        clues: [
          { x: 105.5, y: 56.5 },
          { x: 107.5, y: 51.5 },
          { x: 110.5, y: 44.5 },
          { x: 113.5, y: 37.5 },
          { x: 106, y: 32.5 },
        ],
        lines: [
          "A large print, three-toed, with a faint amber shine in the mud. It stepped here this morning.",
          "The prints speed up. Something startled her. Or something is chasing her. Or she is chasing everything.",
          "Scratches on a tree trunk. Taller than you. Very, very annoyed.",
          "The amber is thicker here: a glowing puddle, with a puff of mist hanging over it like a bad idea.",
          "Her perch is just ahead, at the head of the creek. The prints end in a ring of torn reeds.",
        ],
      },
      {
        type: "kill",
        creature: "raptor",
        tagged: true,
        count: 2,
        region: "river",
        text: "Drive off the Hunter's glow-eyed guards",
        at: { x: 98.5, y: 26 },
        hint: "They lunge in a pair. Dodge the first, bite the second while it recovers.",
        spawn: [{ id: "raptor", at: { x: 98.5, y: 26.4 }, count: 2, spread: 1.3, level: 8 }],
      },
      {
        type: "boss",
        rival: "river-hunter",
        text: "Face Scarfang, the River Hunter, at her perch",
        hint: "Scarfang lunges, leaps and calls her pack. When she calls, ignore the little ones and hit her in the recovery.",
        onDone: { toast: "Scarfang limps off the perch. She leaves a glowing, amber-stained tooth in the reeds. You pick it up" },
      },
      {
        type: "talk",
        npc: "old-nibble",
        text: "Show the amber tooth to Old Nibble",
        dialogue: [
          { speaker: Nibble, text: "That's her tooth. And that is amber, not a trick of the light. I've seen it before, at the bottom of the creek, upstream from your Hollow." },
          { speaker: Nibble, text: "Scarfang will recover, I think. The glow was driving her, not the other way round. She is lying in the shade right now, being a very embarrassed raptor." },
          { speaker: Nibble, text: "The ford is yours to cross. Go south, into the Reed Marsh, and find Reedwhistle. Tell her Old Nibble says: the amber is not just in the Hollow. It's in everything the creek touches." },
        ],
      },
    ],
    reward: { xp: 230, amber: 36, loot: { rarity: "rare" }, flags: ["river-cleared", "amber-shard-1"], world: "river-cleared", text: "Riverbend is quiet again · the ford is open" },
    after: [
      { speaker: Nibble, text: "Reedwhistle is the marsh warden. Crisp as a dry reed and about as flexible. She will pretend she does not need help. She does." },
    ],
  },

  // ---------------------------------------------------------------- chapter 4
  {
    id: "marsh-lanterns",
    title: "The Marsh Lanterns",
    kind: "main",
    region: "marsh",
    level: 12,
    giver: "reedwhistle",
    requires: { quests: ["river-hunter"] },
    summary: "Glowing lantern-plants are drawing hatchlings into the marsh. Find them, bring a lost clutch home, and put a stop to the Reed Stalkers' pack.",
    offer: [
      { speaker: Reed, text: "Old Nibble sent you? Good. Then you can walk in a straight line, which is more than the hatchlings can." },
      { speaker: Reed, text: "Glowing lanterns are sprouting along the west trail. Amber-fed plants. Hatchlings see the glow, think it's a snack, and wander off into the reeds. I have counted. It is not a pleasant number." },
      { speaker: Reed, text: "Find the lanterns. Bring home what the lanterns took. And whatever has been sitting among them: the Reed Stalkers are not here to admire the scenery." },
    ],
    steps: [
      {
        type: "track",
        text: "Find the glowing lanterns along the west trail",
        clues: [
          { x: 90.5, y: 78.5 },
          { x: 81.5, y: 84.5 },
          { x: 80.5, y: 95 },
        ],
        lines: [
          "A bulb the size of a melon, humming amber, with tiny hatchling prints circling it. Round and round, like moths.",
          "A second lantern, brighter. The reeds around it are bigger than reeds should be. They are leaning towards it.",
          "A third lantern at the bend. Beyond it, you can hear peeping. A lot of peeping.",
        ],
      },
      {
        type: "kill",
        tagged: true,
        count: 3,
        region: "marsh",
        text: "Drive off the glow-eyed raiders around the lanterns",
        at: { x: 82, y: 99 },
        hint: "A raptor pair guards the bend and a spitter lurks behind. Dodge the venom, then take the raptors in recovery.",
        spawn: [
          { id: "raptor", at: { x: 81.5, y: 98.6 }, count: 2, spread: 1, level: 11 },
          { id: "dilo", at: { x: 82.2, y: 101.2 }, count: 1, level: 12 },
        ],
      },
      {
        type: "escort",
        text: "Bring the lost clutch to Reedwhistle",
        from: { x: 83.5, y: 104.5 },
        to: { x: 95.5, y: 75.5 },
        radius: 6,
        count: 3,
        hint: "The hatchlings follow close. Keep to the trail, and keep moving; they hide when a fight starts.",
        spawn: [{ id: "lurker", at: { x: 82, y: 81.5 }, count: 2, spread: 1.2, level: 10, dormant: true }],
      },
      {
        type: "talk",
        npc: "reedwhistle",
        text: "Tell Reedwhistle the clutch is safe",
        dialogue: [
          { speaker: Reed, text: "Three. I counted three. It is a very good number. I will not be crying. It is dusty in the marsh today." },
          { speaker: Reed, text: "The pack that set the lanterns is the Reed Stalkers. They den on the east trail, past the nest. They hoard whatever glitters. They are a pair, and they like to take turns." },
          { speaker: Reed, text: "Watch the first, then the second. They lunge in turns. Draw one away from the other if you can. Go. I will keep the clutch." },
        ],
      },
      {
        type: "boss",
        rival: "marsh-pack",
        text: "Break the Reed Stalkers' den on the east trail",
        hint: "Two stalkers lunge in turns. Draw one away from the other, then fight them one at a time.",
      },
      {
        type: "goto",
        text: "Find the Reed Stalkers' hoard further down the east trail",
        at: { x: 123.5, y: 99.5 },
        radius: 3.2,
        onDone: { toast: "A heap of glitter: shells, a brass bell, one very shiny rock and a note: 'THIS IS OURS. SIGNED, THE MARSH'" },
      },
      {
        type: "talk",
        npc: "reedwhistle",
        text: "Return to Reedwhistle with the hoard",
        dialogue: [
          { speaker: Reed, text: "The bell! My bell! I lost that in the year of the third flood. The Stalkers took it. All these years I blamed Old Nibble." },
          { speaker: Reed, text: "You have done what the marsh has needed for a long time. The lanterns are going dark, and the gas will thin out. The hatchlings will find the right glow now: the safe kind, in a nest." },
          { speaker: Reed, text: "Take the rest of it. I have no use for a shiny rock. It is a very ugly rock. Keep it. I mean: it is yours." },
        ],
        onDone: { loot: { rarity: "epic" } },
      },
    ],
    reward: { xp: 320, amber: 52, flags: ["marsh-cleared", "amber-shard-2"], world: "marsh-cleared", text: "The marsh is clear · the lanterns have gone dark" },
    after: [
      { speaker: Reed, text: "East of the den the trail ends at a rotten log. A Hunter-sized body could break it. What lies past it is dry, hot and very, very loud, I'm told. Thornwick is the one to ask." },
    ],
  },

  // ---------------------------------------------------------------- side quests
  {
    id: "ford-stones",
    title: "The Ford-Keeper's Riddle",
    kind: "side",
    region: "river",
    level: 6,
    giver: "old-nibble",
    requires: { quests: ["missing-hatchlings"] },
    summary: "Old Nibble's grandfather laid four stepping stones, each carved with a print. Step them smallest to largest to wake the hidden cache.",
    offer: [
      { speaker: Nibble, text: "Ah. You look like a clever one. My grandfather laid four stepping-stones across the shallows, each one carved with the print of someone who crossed first." },
      { speaker: Nibble, text: "The proper way over is smallest to largest: so the little ones are never trampled. Step in the wrong order and the stones sulk. Step in the right order and, I'm told, a cache rises from the mud." },
      { speaker: Nibble, text: "I have never got past the second stone. My knees are older than the stones. Would you try?" },
    ],
    steps: [
      {
        type: "plates",
        text: "Step on the stones from smallest print to largest",
        at: { x: 97, y: 59.5 },
        plates: [
          { x: 92, y: 58.8 },
          { x: 95.5, y: 59.8 },
          { x: 99, y: 58.8 },
          { x: 102.5, y: 59.8 },
        ],
        order: [1, 3, 0, 2],
        wrong: "Thunk. The stone sulks. Wrong foot",
        clue: "The prints from the bank: a raptor, a hatchling, a trike, a hypsi. Smallest to largest: hatchling, hypsi, raptor, trike",
        hint: "The prints, west to east: raptor, hatchling, trike, hypsi. Hatchling first. Then work upward.",
      },
      {
        type: "talk",
        npc: "old-nibble",
        text: "Tell Old Nibble what the stones gave up",
        dialogue: [
          { speaker: Nibble, text: "It hummed? The third stone hummed, then the fourth, and the mud gave up a box? My grandfather's box! Let's see..." },
          { speaker: Nibble, text: "One pair of reading spectacles. One medal: 'Ford Keeper, Third Place'. And a very old fern sandwich. I will not be eating that. I will be framing it." },
          { speaker: Nibble, text: "And these. His wading legs: the best ford-walking gait in the valley. They've waited for a clever foot. Take them. Go on. Don't thank me, thank the sandwich." },
        ],
        onDone: { loot: { rarity: "epic", slot: "legs" } },
      },
    ],
    reward: { xp: 110, amber: 14, text: "The ford stones hum · a ford-keeper's gift" },
    after: [{ speaker: Nibble, text: "My grandfather always said: the small cross first, so the large can follow without trampling. Wise dinosaur. Terrible cook." }],
  },
  {
    id: "egg-thief",
    title: "Who Took the Eggs?",
    kind: "side",
    region: "river",
    level: 7,
    giver: "old-nibble",
    requires: { quests: ["missing-hatchlings"] },
    summary: "Three eggs have vanished from a riverside nest, and everyone says the Oviraptor did it. Follow the tracks and decide what to do with the truth.",
    offer: [
      { speaker: Nibble, text: "A nest by the west bend has been emptied. Three eggs, gone. Everybody says it was Quill. She's an Oviraptor, you see, and everyone thinks that's an explanation." },
      { speaker: Nibble, text: "I would like to know before I accuse an honest dinosaur of anything. Follow the tracks from the nest. Be fair. Be quiet. Bring the truth." },
    ],
    steps: [
      {
        type: "track",
        text: "Follow the tracks from the empty nest",
        clues: [
          { x: 85.5, y: 38.5 },
          { x: 82.5, y: 43.5 },
          { x: 82.5, y: 48.5 },
          { x: 83.5, y: 55.5 },
        ],
        lines: [
          "An empty nest, a ring of cold sand and a scrap of paper-thin eggshell. Small, narrow prints lead away. Very careful ones.",
          "The prints are all on the left side of the trail. Whoever made them was carrying something in both arms. And not dropping it.",
          "A single feather, stuck on a branch. An Oviraptor's. And a dent in the reeds where something large sat down to rest. Gently.",
          "The prints end at a flat, suspicious heap of reeds. There is a warm, rhythmic sound coming from underneath. Tick, tick, tick. Eggs.",
        ],
      },
      {
        type: "choice",
        npc: "quill",
        text: "Speak to Quill about the eggs",
        prompt: [
          { speaker: Quill, text: "Oh no. It's you. Look, I can explain. They were in a shallow nest, and the sun went down, and their parents were arguing about names. For three weeks. THREE WEEKS." },
          { speaker: Quill, text: "The eggs got cold. Somebody had to sit on them. I am an Oviraptor. It is practically a professional obligation." },
          { speaker: Quill, text: "I should have asked. I know I should have asked. But I couldn't find the parents, and they were very cold, and... what happens now?" },
        ],
        options: [
          { id: "punish", text: "Make Quill carry the eggs back and apologise to everyone", flag: "egg-punish" },
          { id: "forgive", text: "Forgive her. Let her hatch them, and the parents can visit", flag: "egg-forgive" },
        ],
      },
      {
        type: "talk",
        onlyIf: "egg-punish",
        npc: "old-nibble",
        text: "Tell Old Nibble how Quill made it right",
        dialogue: [
          { speaker: Nibble, text: "She carried them back? Every one? And apologised in a loud voice to the entire ford? Well. That's what I call a lesson." },
          { speaker: Nibble, text: "The parents have finally agreed on names. 'Splash', 'Splosh' and 'Gravel'. I cannot say I approve of Gravel. But they are warm and loud and alive. Justice is a dish best served lukewarm." },
          { speaker: Nibble, text: "Take this. The parents wanted to give you something. It is a ford-scale. Do not ask how they got it. They were very emotional." },
        ],
        onDone: { flag: ["egg-punished"], loot: { rarity: "rare", slot: "hide" } },
      },
      {
        type: "talk",
        onlyIf: "egg-forgive",
        npc: "quill",
        text: "Go back to Quill with the good news",
        dialogue: [
          { speaker: Quill, text: "You told them? And they WEREN'T cross? I am going to cry. Quietly. Under the reeds. Don't look." },
          { speaker: Quill, text: "The parents came by this morning. They stood at a respectful distance and watched me sit on their eggs. Then they said: 'could we have the second shift?'. I am a family now." },
          { speaker: Quill, text: "Here. A brooder's patience: I have more than I need. Take it. It will sit through anything." },
        ],
        onDone: { flag: ["egg-forgiven"], loot: { rarity: "rare", slot: "instinct" } },
      },
    ],
    reward: { xp: 100, amber: 12, text: "The eggs are warm and nobody is in trouble. Almost nobody" },
  },
  {
    id: "guard-clutch",
    title: "Two Nests, One Warden",
    kind: "side",
    region: "marsh",
    level: 12,
    giver: "reedwhistle",
    requires: { quests: ["marsh-lanterns"] },
    summary: "Raiders are circling two nests and Reedwhistle can only guard one. Choose which to defend, then hold it.",
    offer: [
      { speaker: Reed, text: "Raiders. Two nests. One warden, with an excellent crest but only one pair of legs." },
      { speaker: Reed, text: "The big nest on the west bend is noisy and obvious. The small one near the middle trail is quiet and well hidden. I can take one. You take the other. Tell me which is which." },
    ],
    steps: [
      {
        type: "choice",
        npc: "reedwhistle",
        text: "Choose which nest to defend first",
        prompt: [
          { speaker: Reed, text: "The big west nest has the loudest clutch and the most to lose. The small reed nest has only a few eggs, but they are very new." },
          { speaker: Reed, text: "Which do you take? I will guard the other, with dignity and a stern face." },
        ],
        options: [
          { id: "west", text: "Defend the big west nest", flag: "cl-west" },
          { id: "reed", text: "Defend the small reed nest", flag: "cl-reed" },
        ],
      },
      {
        type: "protect",
        onlyIf: "cl-west",
        text: "Hold the big west nest",
        at: { x: 83, y: 81.5 },
        radius: 7,
        hint: "Stay near the nest. Raiders come in waves, and you can win by being stubborn.",
        waves: [
          { text: "Compy raiders swarm the big nest!", spawn: [{ id: "compy-raider", at: { x: 88.5, y: 77.8 }, count: 4, spread: 1.5, level: 10 }] },
          { text: "Raptors come in behind the swarm!", spawn: [{ id: "raptor", at: { x: 88.8, y: 77.8 }, count: 2, spread: 1.4, level: 11 }] },
        ],
      },
      {
        type: "protect",
        onlyIf: "cl-reed",
        text: "Hold the small reed nest",
        at: { x: 98.5, y: 82.5 },
        radius: 7,
        hint: "Stay near the nest. A spitter will try to keep its distance. Close in and break its rhythm.",
        waves: [
          { text: "Compy raiders creep towards the reed nest!", spawn: [{ id: "compy-raider", at: { x: 96.5, y: 77.2 }, count: 3, spread: 1.4, level: 10 }] },
          { text: "A spitter and a raptor join the raid!", spawn: [{ id: "dilo", at: { x: 95.5, y: 76.5 }, count: 1, level: 12 }, { id: "raptor", at: { x: 97.5, y: 77.5 }, count: 1, level: 11 }] },
        ],
      },
      {
        type: "talk",
        onlyIf: "cl-west",
        npc: "reedwhistle",
        text: "Report to Reedwhistle",
        dialogue: [
          { speaker: Reed, text: "The raiders at the reed nest went round it three times and gave up. I did not even have to lift my crest." },
          { speaker: Reed, text: "Do you know why? There was nothing in it. Those were river stones. Gravel the Hypsi has been sitting on them for a week and refuses to be told. He's very proud." },
          { speaker: Reed, text: "A real nest is a real nest and you guarded it. Take this: a warden's old habit. It will help you notice what is coming." },
        ],
        onDone: { loot: { rarity: "rare", slot: "instinct" } },
      },
      {
        type: "talk",
        onlyIf: "cl-reed",
        npc: "reedwhistle",
        text: "Report to Reedwhistle",
        dialogue: [
          { speaker: Reed, text: "You took the hidden nest? Good. Because the big west nest is not a real nest." },
          { speaker: Reed, text: "It is a heap of old shells and painted rocks. I built it to draw the raiders away from the real one. They have been attacking it for three days. It is the best decoy in the marsh and I am rather proud." },
          { speaker: Reed, text: "You guarded the real one without being told. That is a warden's instinct. Take this. A small sharp thing: for the next time a decoy is not enough." },
        ],
        onDone: { loot: { rarity: "rare", slot: "claws" } },
      },
    ],
    reward: { xp: 130, amber: 18, text: "Both nests are safe. One of them was a pile of rocks" },
  },
  {
    id: "reed-cough",
    title: "The Reed Cough",
    kind: "side",
    region: "marsh",
    level: 11,
    giver: "sniffle",
    requires: { quests: ["river-hunter"] },
    summary: "A giant sniffly Triceratops needs four marsh herbs. Some grow inside pockets of marsh gas, so hold your breath and be quick.",
    offer: [
      { speaker: Sniffle, text: "Hrrrk... AH... ahh... no. False alarm. Hello. I'm Sniffle. I have a cough. It is a very large cough. It has knocked three trees over and a frog out of a lily." },
      { speaker: Sniffle, text: "Reedwhistle says the cure is four marsh herbs: grey-green, soft, they smell like toothpaste. They grow on the islands. Some of them are inside the yellow gas." },
      { speaker: Sniffle, text: "I would go myself, but the gas makes me sneeze, and when I sneeze, things... move. Would you fetch them?" },
    ],
    steps: [
      {
        type: "collect",
        text: "Gather the four marsh herbs (some are in the gas)",
        label: "Marsh herbs",
        items: [
          { x: 80.5, y: 89.5 },
          { x: 87.5, y: 110.5 },
          { x: 99, y: 114.5 },
          { x: 106, y: 90.5 },
        ],
        hint: "The yellow marsh gas hurts a little each second. Grab the herb and step out. Do not dawdle.",
      },
      {
        type: "talk",
        npc: "sniffle",
        text: "Bring the herbs to Sniffle",
        dialogue: [
          { speaker: Sniffle, text: "Marsh mint! Oh, it smells like a clean cave. Hrmm... chew... chew. Oh. Oh!" },
          { speaker: Sniffle, text: "A clear throat! Listen: ROAAAAR! ...Oh. Oh no. That's much louder than I remembered. A bird just fell out of a tree. I'm so sorry!" },
          { speaker: Sniffle, text: "For you: a horn tip I shed when I sneezed. It's ever so sharp. It's the first thing I've ever managed to give someone and not sneeze on." },
        ],
        onDone: { flag: ["cough-cured"], loot: { rarity: "rare", slot: "horns" } },
      },
    ],
    reward: { xp: 105, amber: 14, text: "Sniffle's cough is gone. The frogs are nervous" },
  },
];

/** [creature, x, y, level]: designed encounters on the trail ground. */
const SPAWNS: [string, number, number, number][] = [
  // river: a compy pack waiting at the reed bend where the west corridor meets the fork
  ["compy-raider", 86.5, 32.5, 5],
  ["compy-raider", 88, 33.2, 5],
  ["compy-raider", 85.2, 33.6, 5],
  // river: a Reed lurker waiting in the grass on the way to the east bank
  ["lurker", 108.5, 34.5, 6],
  // river: a kentrosaurus blocking the side path down the west bank
  ["kentro", 81.5, 51.5, 7],
  // river: a caller hiding behind two raptors on the east bank
  ["raptor", 113.2, 38.5, 7],
  ["raptor", 112.2, 40.6, 7],
  ["caller", 110.8, 43.4, 7],
  // river: a dilo that guards the log crossing on the lower east bank
  ["dilo", 108.5, 49, 8],
  // marsh: a caller behind two raptors on the west trail
  ["raptor", 81.5, 96.4, 11],
  ["raptor", 82.5, 98, 11],
  ["caller", 82.2, 102.4, 11],
  // marsh: a kentrosaurus blocking the central road to the nest
  ["kentro", 97.5, 83, 12],
  // marsh: a dilo guarding the bottom log bridge
  ["dilo", 104.5, 114.5, 12],
  // marsh: an ambusher in the reeds beside the nest road
  ["lurker", 94, 77.8, 10],
];

export const RIVER_MARSH: RegionContent = {
  npcs: RIVER_MARSH_NPCS,
  quests: RIVER_MARSH_QUESTS,
  spawns: SPAWNS,
  rivals: [],
  hazards: [
    { id: "marsh-gas-west", kind: "toxic", x: 80.5, y: 89.5, r: 2.4, dmg: 0.03, offFlag: "marsh-cleared", region: "marsh" },
    { id: "marsh-gas-nest", kind: "toxic", x: 106, y: 90.5, r: 2.4, dmg: 0.03, offFlag: "marsh-cleared", region: "marsh" },
    { id: "marsh-gas-south", kind: "toxic", x: 99, y: 114.5, r: 2.1, dmg: 0.035, offFlag: "marsh-cleared", region: "marsh" },
    { id: "marsh-gas-east", kind: "toxic", x: 117, y: 109, r: 2.2, dmg: 0.03, offFlag: "marsh-cleared", region: "marsh" },
  ],
};
