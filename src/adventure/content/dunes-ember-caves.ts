/** Sunscar dunes, Ember Basin and Echo Caves: chapters 5 to 9 (the dig, the vent, the dark, the keeper, the choice) and their side quests.
 *
 *  Layout notes (authored against tools/world/map_preview.py):
 *   - dunes: the loop trail; Thornwick sits at the west junction (140.8,104.6); the Sunscar Stalker holds the wide T-junction (the dig) at (163.4,81.3).
 *   - ember: the geyser curve is the north arc of the basin loop (steam vents at ~ (157,15.6), (161,13), (165,15)); Cinder keeps the refuge.
 *   - caves: Hush keeps the east arm off the hub; the Echo Plates are the four stones round the refuge; the Glimmerjaw's lair and the
 *     glow-nursery are the lower end of the inner tunnel on the east-west trunk (39.5,113.4).
 */
import type { NpcDef, QuestDef } from "../quests";
import type { RegionContent } from "./types";

const Thornwick = "Thornwick";
const Cinder = "Cinder";
const Hush = "Hush";
const Jaw = "The Glimmerjaw";
const Narrator = "Narrator";

export const DUNES_EMBER_CAVES_NPCS: NpcDef[] = [
  {
    id: "thornwick",
    name: "Thornwick",
    creature: "elder-kentro",
    home: { x: 140.8, y: 104.6 },
    region: "dunes",
    about: "A kentrosaurus hermit who moved to the dunes for the quiet and has been complaining about the lack of it ever since.",
    chatter: [
      { text: "If one more creature sneezes within my hearing, I am moving to the marsh. No. Too damp. I am moving my opinions to the marsh." },
      { text: "Sand gets everywhere. Into the joints. Into the opinions." },
      { text: "Do you know what a beetle sounds like, walking? No? Good. Keep it that way." },
      { text: "Somebody dug up the Old Ones' dig and left it open and nobody has apologised. Not that I wanted an apology. Loudly.", flag: "dunes-dig-open", notFlag: "glimmerjaw-down" },
      { text: "The ground was humming for years. I got used to it. Last night it changed note, and I haven't slept since.", flag: "glimmerjaw-down", notFlag: "heartstone-sealed" },
      { text: "The sand has gone quiet. Properly quiet. I'm told that's a good thing. I miss the hum a little. Do not repeat that.", flag: "heartstone-sealed" },
      { text: "The nights glow now. Like a festival, but with fewer opinions. Dreadful. I have started to rather like it.", flag: "heartstone-bound" },
    ],
  },
  {
    id: "cinder",
    name: "Cinder",
    creature: "elder-oviraptor",
    tint: 0xffc9a0,
    scale: 1.05,
    home: { x: 171.2, y: 23.6 },
    region: "ember",
    about: "An oviraptor who has hatched her eggs on warm basalt for thirty seasons and is practical to the point of bossiness.",
    chatter: [
      { text: "Mind the steam on the north curve. It breathes on a schedule, and it does not care about yours.", notFlag: "lava-cooled" },
      { text: "Warm rocks make the best nursery. Don't tell the marsh. They'll want some." },
      { text: "Eggs don't care who is in charge of the volcano. Eggs care about the temperature. And so, by extension, do I." },
      { text: "The vents have gone quiet. I miss the warm rocks, but my eggs don't miss the shaking.", flag: "lava-cooled", notFlag: "heartstone-bound" },
      { text: "Funny thing: the stones warm themselves up now. Eggs hatch by lunchtime. I'm not complaining. Mostly.", flag: "heartstone-bound" },
      { text: "Cooler nights. The ground stopped humming. The eggs take their sweet time again. Honest work.", flag: "heartstone-sealed" },
    ],
  },
  {
    id: "hush",
    name: "Hush",
    creature: "scout-compy",
    tint: 0xd9ccff,
    scale: 1.3,
    home: { x: 35.4, y: 89.6 },
    region: "caves",
    about: "The echo-keeper of Echo Caves. A gentle, whispering compy who remembers every sound the walls have ever swallowed.",
    chatter: [
      { text: "...Shh. Listen. The walls are telling the story again." },
      { text: "I keep the echoes. They keep me. We have an arrangement." },
      { text: "Whisper here. The cave likes it. Shout, and it shouts back. Rudely." },
      { text: "A low note, from the deepest part. All day. All night. Like someone humming a lullaby they can't stop.", notFlag: "glimmerjaw-down" },
      { text: "The humming changed. It sounds... tired. Tired is better than angry.", flag: "glimmerjaw-down", notFlag: "heartstone-sealed" },
      { text: "The humming has stopped. The cave sounds like itself again. I did not know I had missed it.", flag: "heartstone-sealed" },
      { text: "The Heartstone still sings. Softer, now. It sings to you, I think. Not to the little ones.", flag: "heartstone-bound" },
    ],
  },
  {
    id: "hush-deep",
    name: "Hush",
    creature: "scout-compy",
    tint: 0xd9ccff,
    scale: 1.3,
    home: { x: 35.2, y: 113.6 },
    region: "caves",
    appears: "glimmerjaw-down",
    about: "Hush, who followed the humming down to the glow-nursery the quiet way.",
    chatter: [
      { text: "The little ones are asleep. Please. Shh. They have had a very long month." },
      { text: "The Heartstone is just there. Don't stare at it too long. It stares back, a bit.", notFlag: "heartstone-sealed" },
      { text: "Quiet now. Truly quiet. The hatchlings are going home.", flag: "heartstone-sealed" },
      { text: "Warm in here. Warm and humming. I could get used to it.", flag: "heartstone-bound" },
    ],
  },
  {
    id: "nursery-hatchlings",
    name: "The hatchlings",
    creature: "hatchling",
    home: { x: 36.0, y: 115.3 },
    region: "caves",
    appears: "glimmerjaw-down",
    about: "Three of the missing hatchlings, warm, glowing faintly and very sleepy in the glow-nursery.",
    chatter: [
      { text: "Peep. (Warm. Warm warm warm.)", notFlag: "heartstone-sealed" },
      { text: "Peep peep. (Is it morning? It is always morning in here.)", notFlag: "heartstone-sealed" },
      { text: "Peep! (Going home! Going home! Going HOME!)", flag: "heartstone-sealed" },
      { text: "Peep. (The big shiny one told us a story. It had no ending. We asked for the ending.)", flag: "glimmerjaw-down" },
    ],
  },
  {
    id: "nursery-hatchling-b",
    name: "Hatchling",
    creature: "hatchling",
    home: { x: 37.2, y: 115.0 },
    region: "caves",
    appears: "glimmerjaw-down",
    about: "A hatchling.",
    chatter: [{ text: "Peep." }, { text: "(Yawns enormously. Falls over. Is delighted.)" }],
  },
  {
    id: "nursery-hatchling-c",
    name: "Hatchling",
    creature: "hatchling",
    home: { x: 35.0, y: 115.4 },
    region: "caves",
    appears: "glimmerjaw-down",
    about: "A hatchling.",
    chatter: [{ text: "Peep peep?" }, { text: "(Tries to bite your toe. Tickles.)" }],
  },
];

export const DUNES_EMBER_CAVES_QUESTS: QuestDef[] = [
  // ====================================================================== chapter 5
  {
    id: "sunscar-digs",
    title: "The Sunscar Dig",
    kind: "main",
    region: "dunes",
    level: 16,
    giver: "thornwick",
    requires: { quests: ["marsh-lanterns"] },
    summary: "A windstorm has uncovered the Old Ones' tablet, in four pieces. Gather them, read them, and clear the Sunscar Stalker off the dig.",
    offer: [
      { speaker: Thornwick, text: "You. Yes, you. The stomping one. Do you have any idea how loud a body is on sand? Every step is a drum solo." },
      { speaker: Thornwick, text: "Last week's windstorm blew the top off an old dig. A tablet of the Old Ones, broken in four, scattered around the dune loop. I'd collect them myself, but, well. Sand. Noise. Knees." },
      { speaker: Thornwick, text: "And a Sunscar Stalker has moved onto the dig itself. Hisses all day. Brings its own venom. Gather the pieces, bring them to me, and then we will discuss the Stalker. Quietly if you can." },
    ],
    steps: [
      {
        type: "collect",
        text: "Gather the four tablet pieces along the dune loop",
        label: "Tablet pieces",
        items: [
          { x: 170.5, y: 81.3 },
          { x: 182.1, y: 92.4 },
          { x: 180.6, y: 111.4 },
          { x: 156.8, y: 119.5 },
        ],
        hint: "Pieces glint where the wind has uncovered them. Walk over each one. Watch for hunters on the ridges.",
      },
      {
        type: "talk",
        npc: "thornwick",
        text: "Bring the pieces back to Thornwick",
        dialogue: [
          { speaker: Thornwick, text: "Four pieces. Four! Hold still. No, not you, the tablet. Let me put the corners together. There." },
          { speaker: Thornwick, text: "It says: THE STAR-STONE SLEEPS BELOW. WAKE IT NOT. THE KEEPER DRINKS, AND THE KEEPER IS NEVER FULL." },
          { speaker: Thornwick, text: "Hm. Pleasant. Typical Old Ones: they never wrote a cheerful note in their lives. The dig sits at the crossroads on the north trail. The Stalker's still there. Go and ask it politely to leave." },
        ],
      },
      {
        type: "goto",
        text: "Go to the dig at the ridge crossroads",
        at: { x: 162, y: 75.6 },
        radius: 3.2,
        hint: "The Stalker spits venom in fans from the shade of the ridges. Keep moving, and strike when it recovers.",
      },
      {
        type: "boss",
        rival: "sunscar",
        text: "Drive the Sunscar Stalker off the dig",
        hint: "It spits at range, lunges up close, and fans its crest when hurt. Stay behind rock and punish the recovery.",
        onDone: { flag: ["dunes-dig-open"], toast: "The Stalker flees the dunes · the dig is open" },
      },
      {
        type: "talk",
        npc: "thornwick",
        text: "Tell Thornwick the dig is clear",
        dialogue: [
          { speaker: Thornwick, text: "Quiet. For nearly four whole minutes. It was beautiful. It's gone now. I can hear you breathing." },
          { speaker: Thornwick, text: "The dig is open and the tablet is whole. Everything the Old Ones feared sleeps below: in the Echo Caves, under all that stone. The Keeper drinks, and is never full." },
          { speaker: Thornwick, text: "Take this. It was under the tablet. The Old Ones left it for someone who could bite through a wall. That's you. Don't let it go to your head. Heads are loud." },
        ],
      },
    ],
    reward: { xp: 420, amber: 40, loot: { rarity: "epic", slot: "jaws" }, flags: ["dunes-dig-open", "amber-shard-3"], world: "dunes-dig-open", text: "The Sunscar dig is open · the Old Ones' warning is whole" },
    after: [
      { speaker: Thornwick, text: "North, through the broken basalt, is Ember Basin. Something is feeding the amber from underneath the volcano. Go. Be loud at it. I'll be here, enjoying the silence." },
    ],
  },
  // ====================================================================== dunes side: noise
  {
    id: "thornwick-quiet",
    title: "Peace and Quiet",
    kind: "side",
    region: "dunes",
    level: 14,
    giver: "thornwick",
    requires: { quests: ["marsh-lanterns"] },
    summary: "A gang of compy raiders has moved in beside Thornwick's rock and the squeaking is driving him up the dune.",
    offer: [
      { speaker: Thornwick, text: "A squeaking. Sixteen hours a day. A pack of compies has taken up residence on the marsh trail, and I swear they are giggling." },
      { speaker: Thornwick, text: "I'd drive them off myself, but my tail swipe is a weapon of last resort and they are very, very small. Make them leave. I will pay in grudging respect." },
    ],
    steps: [
      {
        type: "kill",
        creature: "compy-raider",
        tagged: true,
        count: 5,
        region: "dunes",
        text: "Shoo the squeaking compies away from Thornwick's rock",
        at: { x: 134.4, y: 101.4 },
        hint: "They lunge together and rest together. Dodge the lunge, bite while they catch their breath.",
        spawn: [{ id: "compy-raider", at: { x: 134.4, y: 101.4 }, count: 5, spread: 2.2, level: 14 }],
      },
      {
        type: "talk",
        npc: "thornwick",
        text: "Tell Thornwick it is quiet",
        dialogue: [
          { speaker: Thornwick, text: "Silence. Glorious... Wait. That ringing. That faint, high ringing. Are they back?" },
          { speaker: Thornwick, text: "No. It's me. It's just the silence being loud. How inconvenient." },
          { speaker: Thornwick, text: "Thank you. Here: I've been weaving earplugs out of dune moss. They don't work, but they do look distinguished." },
        ],
      },
    ],
    reward: { xp: 110, amber: 12, loot: { rarity: "rare", slot: "hide" }, text: "Thornwick's rock is quiet. Mostly." },
  },
  // ====================================================================== dunes side: the echo of the Old Ones
  {
    id: "old-ones-echo",
    title: "The Old Ones' Echo",
    kind: "side",
    region: "dunes",
    level: 16,
    giver: "thornwick",
    requires: { quests: ["sunscar-digs"] },
    summary: "The tablet was only a corner. Four sandstones around the dune loop carry the rest of the Old Ones' message, to be read in order.",
    offer: [
      { speaker: Thornwick, text: "That tablet was only the corner. The Old Ones carved the rest on four sandstones around the loop. Each is meant to be read after the last." },
      { speaker: Thornwick, text: "Read them out of order and you get gibberish. I know, I tried. Loudly. Start at the south-west bend and walk the loop the way the sun walks." },
    ],
    steps: [
      {
        type: "track",
        text: "Read the four sandstones in order",
        radius: 2.6,
        clues: [
          { x: 143.6, y: 119.5 },
          { x: 163.2, y: 119.1 },
          { x: 173.4, y: 115.6 },
          { x: 184, y: 106.6 },
        ],
        lines: [
          "First stone: THE SAND REMEMBERS WHAT THE STONE FORGETS.",
          "Second stone: A STAR FELL HERE. IT WAS KIND. THEN IT WAS NOT.",
          "Third stone: WE SEALED IT WITH A SONG, AND A KEEPER TO HUM IT ASLEEP.",
          "Fourth stone: IF THE KEEPER WAKES, LOOK WHERE THE BURIED CLAW POINTS. WE LEFT A GIFT.",
        ],
      },
      {
        type: "collect",
        text: "Dig where the Buried Claw points",
        label: "Old Ones' cache",
        items: [{ x: 178.3, y: 85.5 }],
        hint: "The Buried Claw fossil sits on the north-east stretch of the loop.",
        onDone: { loot: { rarity: "epic", slot: "claws" }, toast: "A keeper's fang, wrapped in leather. The Old Ones planned for this." },
      },
      {
        type: "talk",
        npc: "thornwick",
        text: "Show Thornwick what the Old Ones left",
        dialogue: [
          { speaker: Thornwick, text: "A fang. Wrapped in leather, with a note. The note says 'for whoever has a worse temper than the Keeper'." },
          { speaker: Thornwick, text: "It's yours, then. Though I want it noted that I have a perfectly lovely temper. It simply gets provoked. Constantly." },
        ],
      },
    ],
    reward: { xp: 140, amber: 20, text: "The Old Ones' last gift is yours" },
  },
  // ====================================================================== chapter 6
  {
    id: "matriarch-vent",
    title: "The Basalt Matriarch",
    kind: "main",
    region: "ember",
    level: 21,
    giver: null,
    requires: { quests: ["sunscar-digs"] },
    summary: "Something beneath Ember Basin feeds the amber. The Basalt Matriarch sits on the vent that drives it. Read her sweep, strike in the recovery.",
    offer: [],
    steps: [
      {
        type: "goto",
        text: "Break through the basalt into Ember Basin",
        at: { x: 160.2, y: 58.4 },
        radius: 3.6,
        hint: "The fractured basalt at the north end of the dunes needs an Apex bite. Watch for rustling in the rocks ahead.",
      },
      {
        type: "talk",
        npc: "cinder",
        text: "Find Cinder at the Ember refuge",
        dialogue: [
          { speaker: Cinder, text: "Oh, thank the warm stones. A visitor! Mind the steam. It has opinions." },
          { speaker: Cinder, text: "See that shape on the east ridge? The Basalt Matriarch. She's sat on the vent since the amber started seeping. Every day hotter. Every day grumpier." },
          { speaker: Cinder, text: "The vent feeds the glow. Cool the vent, and the amber slows. She won't leave out of politeness. She'll leave for a good bonk." },
          { speaker: Cinder, text: "Read her sweep. It's slow, and then she's tired. Strike in the tired. Follow the scorch marks down the east arm." },
        ],
      },
      {
        type: "track",
        text: "Follow the scorched trail to the Matriarch's vent",
        clues: [
          { x: 165.6, y: 47.2 },
          { x: 171.6, y: 42.2 },
          { x: 175.4, y: 39.3 },
        ],
        lines: [
          "Scorched prints, each as wide as a boulder. Whoever made these was in no hurry.",
          "A smear of amber on the basalt, still warm. The air shimmers.",
          "A low groan from beyond the bend. Under it, a deeper hum. The vent.",
        ],
      },
      {
        type: "boss",
        rival: "basalt-matriarch",
        text: "Calm the Basalt Matriarch on the vent",
        hint: "Her tail sweep is slow. Dodge it, then strike while she recovers. Stay out of her charge lane.",
        onDone: { flag: ["lava-cooled"], toast: "The vent shudders and cools · the steam fades from the Basin" },
      },
      {
        type: "talk",
        npc: "cinder",
        text: "Tell Cinder the vent is quiet",
        dialogue: [
          { speaker: Cinder, text: "I felt the ground go still from here. Not scared-still. Relieved-still. Like a long breath out." },
          { speaker: Cinder, text: "She'll sulk for a week and then go back to sitting on warm rocks like a sensible creature. The vents are quiet. My eggs will sulk at the cold, but I'll take it." },
          { speaker: Cinder, text: "The warm was coming from deeper still, down under Echo Caves. There's a tunnel on the west arm, the deep chamber. If there's an echo-keeper, she'll know." },
        ],
      },
    ],
    reward: { xp: 460, amber: 50, loot: { rarity: "epic", slot: "tail" }, flags: ["lava-cooled", "amber-shard-4"], world: "lava-cooled", text: "Ember Basin cools · the vent is quiet" },
  },
  // ====================================================================== ember side: the stranded egg
  {
    id: "steam-run",
    title: "The Steam Run",
    kind: "side",
    region: "ember",
    level: 19,
    giver: "cinder",
    summary: "An egg rolled off the warm stones and came to rest in the geyser curve. Time the vents and bring it home.",
    offer: [
      { speaker: Cinder, text: "Crisis. An egg rolled off the warm stones in the last tremor and came to rest on the north curve. In the geyser field." },
      { speaker: Cinder, text: "Nobody sane goes in. Hence you. The vents burst on a rhythm: the outer ones together, the middle one in between. Watch the puff, then cross." },
    ],
    steps: [
      {
        type: "collect",
        text: "Cross the geyser curve and fetch the stranded egg",
        label: "Stranded egg",
        items: [{ x: 158.8, y: 13.5 }],
        hint: "A puff of steam warns of each burst. Cross right after a vent bursts, never right before. The egg sits in the safe gap between vents.",
      },
      {
        type: "talk",
        npc: "cinder",
        text: "Bring the egg to Cinder",
        dialogue: [
          { speaker: Cinder, text: "Warm. Whole. Not even a scratch. Oh, you magnificent steamer of a creature." },
          { speaker: Cinder, text: "It's moving. It's... yes, it's definitely moving. Peep! There! Hello! You are very small and extremely loud." },
          { speaker: Cinder, text: "Here: a scale it shed, or possibly a scale I was saving. Either way, it's yours." },
        ],
      },
    ],
    reward: { xp: 150, amber: 25, loot: { rarity: "epic", slot: "legs" }, text: "The egg is home, warm and loud" },
  },
  // ====================================================================== chapter 7
  {
    id: "whispering-dark",
    title: "The Whispering Dark",
    kind: "main",
    region: "caves",
    level: 23,
    giver: null,
    requires: { quests: ["matriarch-vent"] },
    summary: "The Echo Caves hum a single low note. The echo-keeper knows the old song that opens the way to the Heartstone.",
    offer: [],
    steps: [
      {
        type: "talk",
        npc: "hush",
        text: "Find Hush, the echo-keeper of Echo Caves",
        dialogue: [
          { speaker: Hush, text: "...Shh. Walk softly. The walls listen. Yes, even that one." },
          { speaker: Hush, text: "I keep the echoes. Lately they all sing one low note, from the deepest part. A lullaby. Someone down there cannot stop humming." },
          { speaker: Hush, text: "The way down is sealed by an old song. Four stones, in a hall beside the nest, in an order the Old Ones set. Step on them as the song goes, and the way opens." },
          { speaker: Hush, text: "The stones hum back when you are right. When you are wrong they go quiet, and the song starts over. Follow your feet. They know the tune better than I do." },
        ],
      },
      {
        type: "plates",
        text: "Wake the four echo stones in the song's order",
        plates: [
          { x: 30.6, y: 86 },
          { x: 32.8, y: 88.4 },
          { x: 30.4, y: 90.5 },
          { x: 28.2, y: 88.5 },
        ],
        order: [3, 0, 1, 2],
        radius: 1.3,
        clue: "Each stone hums a note. Step on them in the song's order. The guide arrow points to the next one.",
        wrong: "The stone falls silent. The song begins again.",
        onDone: { flag: ["heartstone-path-open"], toast: "A crystal wall dissolves · the inner tunnel hums" },
      },
      {
        type: "goto",
        text: "Follow the opened way down the inner tunnel",
        at: { x: 31.2, y: 111.4 },
        radius: 3.2,
        hint: "A low lullaby rolls up from the deep. The Heartstone chamber is near. Rest at the refuge first if you need to.",
      },
    ],
    reward: { xp: 300, amber: 30, flags: ["heartstone-path-open"], world: "heartstone-path-open", text: "The way to the Heartstone is open" },
  },
  // ====================================================================== caves side: the Keeper's lantern
  {
    id: "keepers-lantern",
    title: "The Keeper's Lantern",
    kind: "side",
    region: "caves",
    level: 22,
    giver: "hush",
    requires: { quests: ["matriarch-vent"] },
    summary: "Hush's glow-moss lantern is gone. Something with shiny taste has carried it down the inner tunnel.",
    offer: [
      { speaker: Hush, text: "...My lantern is gone. A little shell filled with glow-moss. It tells the echoes which paths are safe." },
      { speaker: Hush, text: "I set it down for one moment. Something with very shiny taste took it. Follow the chiming, if you can hear it. I can only whisper." },
    ],
    steps: [
      {
        type: "track",
        text: "Follow the lantern's chime down the inner tunnel",
        radius: 2.6,
        clues: [
          { x: 27.6, y: 91.4 },
          { x: 22.5, y: 99.5 },
          { x: 22.6, y: 104.4 },
        ],
        lines: [
          "A faint chime from the dark, like a tiny bell inside a shell.",
          "The chime again, bumping along as if carried by something in a hurry.",
          "Scratches in the dust, and a glow ahead. Someone has been collecting shiny things.",
        ],
      },
      {
        type: "kill",
        creature: "compy-raider",
        tagged: true,
        count: 4,
        region: "caves",
        text: "Chase off the magpie compies guarding their shiny hoard",
        at: { x: 25, y: 107.6 },
        hint: "Compies love shiny things and share nothing. Dodge the pack lunge and strike on the pause.",
        spawn: [{ id: "compy-raider", at: { x: 25, y: 107.6 }, count: 4, spread: 1.3, level: 22 }],
      },
      {
        type: "collect",
        text: "Take back the Keeper's lantern",
        label: "Keeper's lantern",
        items: [{ x: 25.2, y: 107.5 }],
      },
      {
        type: "talk",
        npc: "hush",
        text: "Return the lantern to Hush",
        dialogue: [
          { speaker: Hush, text: "...Oh. It's humming. It missed me. It always hums when it is happy." },
          { speaker: Hush, text: "Now the echoes will know where to go. I owe you a favour, a whisper and a very shiny thing. Here." },
        ],
      },
    ],
    reward: { xp: 150, amber: 20, loot: { rarity: "rare", slot: "instinct" }, text: "The Keeper's lantern glows again" },
  },
  // ====================================================================== chapter 8
  {
    id: "glimmerjaw",
    title: "The Glimmerjaw",
    kind: "main",
    region: "caves",
    level: 26,
    giver: null,
    requires: { quests: ["whispering-dark"] },
    summary: "The keeper of the Heartstone drank too deeply. Face the Glimmerjaw, read its sweep, and find what it has been guarding.",
    offer: [],
    steps: [
      {
        type: "goto",
        text: "Follow the lullaby into the Heartstone chamber",
        at: { x: 34.5, y: 113.2 },
        radius: 3,
        hint: "Rest at the refuge before you go in. The Glimmerjaw hits hard, and it calls its brood when it blazes.",
        onDone: { toast: "Something vast turns toward you in the amber glow. It is humming." },
      },
      {
        type: "boss",
        rival: "glimmerjaw",
        text: "Calm the Glimmerjaw",
        hint: "It sweeps wide and slow, then recovers. Shards fly in fans. When it calls its brood, thin them out first.",
        onDone: { flag: ["glimmerjaw-down"], toast: "The Glimmerjaw sways, dims, and settles" },
      },
      {
        type: "talk",
        npc: "nursery-hatchlings",
        text: "Look into the glow-nursery",
        dialogue: [
          { speaker: Narrator, text: "Behind the Glimmerjaw's lair there is a nook lit warm gold, and in it, curled in a heap, the missing hatchlings. They are glowing. They are snoring." },
          { speaker: "Hatchling", text: "Peep. (Is it morning? We have been so warm. The big shiny one told us a story. It had no ending.)" },
          { speaker: Jaw, text: "I only kept them warm. The cold took the others, long ago. I would not let it take these. They followed the light. I did not know how to turn it off." },
          { speaker: Jaw, text: "I never meant to be so loud. Is it done? Is the humming done?" },
        ],
      },
    ],
    reward: { xp: 520, amber: 60, loot: { rarity: "epic", slot: "hide" }, flags: ["glimmerjaw-down"], world: "glimmerjaw-down", text: "The Glimmerjaw is calm · the hatchlings are safe" },
  },
  // ====================================================================== chapter 9
  {
    id: "heartstone-choice",
    title: "The Heartstone",
    kind: "main",
    region: "caves",
    level: 26,
    giver: null,
    requires: { quests: ["glimmerjaw"] },
    summary: "The Heartstone made the amber, woke the volcano and gave the Glimmerjaw its glow. Seal it, or bind it. The valley will remember which.",
    offer: [],
    steps: [
      {
        type: "choice",
        npc: "hush-deep",
        text: "Decide the Heartstone's fate",
        prompt: [
          { speaker: Hush, text: "...Oh. You did it. And gently, too. I did not think that was possible." },
          { speaker: Hush, text: "The Heartstone is just there, in the nursery's heart. Warm, humming, so beautiful it hurts. It made the amber. It woke the volcano. It gave the Glimmerjaw its glow." },
          { speaker: Hush, text: "The old song can seal it. The warmth sleeps, the valley goes quiet and safe, and no more raw glow seeps into the world. That is one path." },
          { speaker: Hush, text: "Or you can bind it. The glow stays, and someone with a strong jaw carries it. The valley grows stronger, richer and harder. That is the other." },
          { speaker: Narrator, text: "The Heartstone pulses in time with your heartbeat. Whatever you choose, the hatchlings are safe." },
        ],
        options: [
          { id: "seal", text: "Seal the Heartstone · a quieter valley, no more raw mutagen", flag: "heartstone-sealed" },
          { id: "bind", text: "Bind the Heartstone · the glow stays, the world grows harder and richer", flag: "heartstone-bound" },
        ],
      },
      {
        type: "talk",
        npc: "hush-deep",
        onlyIf: "heartstone-sealed",
        text: "Hush sings the last verse",
        dialogue: [
          { speaker: Narrator, text: "Hush hums the old song. The glow drains from the cave like a tide going out, and the hatchlings stir, yawn, and begin the long, sleepy walk home." },
          { speaker: Jaw, text: "It's quiet. So very quiet. Will they be warm without me?" },
          { speaker: Hush, text: "They will, Glimmerjaw. You were never alone. You were only very, very loud." },
          { speaker: Narrator, text: "The Heartstone gives up one last drop of warmth. It settles in your claw: Glowheart, a warm, borrowed light." },
        ],
        onDone: { loot: { rarity: "legendary", unique: "glowheart" }, toast: "Glowheart · the Heartstone's last warmth" },
      },
      {
        type: "talk",
        npc: "hush-deep",
        onlyIf: "heartstone-bound",
        text: "Hush watches the Heartstone settle",
        dialogue: [
          { speaker: Narrator, text: "The Heartstone's glow folds into a single point of gold, and the hum drops from a lullaby to a purr. The hatchlings curl closer, smiling in their sleep." },
          { speaker: Jaw, text: "You carry it? Then I may rest. I have been awake such a long time." },
          { speaker: Hush, text: "The glow stays. Mind it. It is very proud of you." },
          { speaker: Narrator, text: "The Heartstone offers you its eye. It sees the valley as it was before the valley: Amber Eye." },
        ],
        onDone: { loot: { rarity: "legendary", unique: "amber-eye" }, toast: "Amber Eye · the Heartstone's gaze" },
      },
    ],
    reward: { xp: 400, amber: 100, text: "The Heartstone's story is told · the valley will remember your choice" },
  },
];

export const DUNES_EMBER_CAVES: RegionContent = {
  npcs: DUNES_EMBER_CAVES_NPCS,
  quests: DUNES_EMBER_CAVES_QUESTS,
  // extra ordinary creatures [id, x, y, level]: encounters, not scatter
  spawns: [
    // dunes (13-19): a ridge ambush above the dig, a tank blocking the south branch, a caller behind a dilo pair, a swarm on the south bend
    ["lurker", 166.2, 86.6, 15],
    ["lurker", 168.6, 90.8, 15],
    ["kentro", 137.4, 110.4, 16],
    ["dilo", 183.8, 99.4, 17],
    ["dilo", 184, 102, 17],
    ["caller", 183, 107.6, 16],
    ["compy-raider", 159.4, 119.6, 14],
    ["compy-raider", 161.4, 119.8, 14],
    ["raptor", 176.6, 113.8, 17],
    // ember (17-24): an ambush at the fork, a dilo pair with a caller behind on the west arm, a tank in the back door to the Matriarch's arm
    ["lurker", 158.2, 57.2, 19],
    ["lurker", 159.8, 58.9, 19],
    ["dilo", 142, 45.4, 21],
    ["dilo", 143, 39.4, 21],
    ["caller", 144, 36.2, 20],
    ["kentro", 177.8, 30.6, 22],
    ["raptor", 153, 19.4, 20],
    // caves (20-28): the east trunk gauntlet, a tank in the slab tunnel, an ambush on the inner path, a raptor on the north trunk
    ["dilo", 44.4, 113.2, 24],
    ["dilo", 47.2, 112.8, 24],
    ["caller", 52, 111.8, 23],
    ["kentro", 41.2, 90.3, 25],
    ["lurker", 24.2, 96.8, 22],
    ["lurker", 22.8, 101.4, 22],
    ["raptor", 32, 77.5, 21],
  ],
  rivals: [
    // the Sunscar Stalker holds the dig at the wide crossroads on the north trail
    { id: "sunscar", name: "Sunscar Stalker", species: "sunscar", region: "dunes", home: { x: 163.4, y: 81.3 }, pattern: "venom-fans" },
    // the Glimmerjaw sleeps lightly at the lower end of the inner tunnel, beside the glow-nursery
    { id: "glimmerjaw", name: "The Glimmerjaw", species: "glimmerjaw", region: "caves", home: { x: 39.5, y: 113.4 }, pattern: "sweep-then-recover" },
  ],
  hazards: [
    // the geyser curve: outer vents burst together, the middle one in between; the egg sits in the gap between the west and middle vents
    { id: "ember-steam-west", kind: "steam", x: 156.8, y: 15.6, r: 1.8, dmg: 0.2, period: 5, warn: 1.3, phase: 0, offFlag: "lava-cooled", region: "ember" },
    { id: "ember-steam-mid", kind: "steam", x: 161.2, y: 12.9, r: 1.8, dmg: 0.2, period: 5, warn: 1.3, phase: 2.5, offFlag: "lava-cooled", region: "ember" },
    { id: "ember-steam-east", kind: "steam", x: 165.3, y: 15, r: 1.8, dmg: 0.2, period: 5, warn: 1.3, phase: 0, offFlag: "lava-cooled", region: "ember" },
    // loose sand on the south bend
    { id: "dunes-quicksand", kind: "quicksand", x: 147.4, y: 119.6, r: 1.8, dmg: 0, region: "dunes" },
    // raw mutagen seeps until the Heartstone is sealed
    { id: "caves-mutagen-hall", kind: "mutagen", x: 26.4, y: 93.4, r: 1.3, dmg: 0.03, offFlag: "heartstone-sealed", region: "caves" },
    { id: "caves-mutagen-lair", kind: "mutagen", x: 41.4, y: 113.6, r: 1.5, dmg: 0.03, offFlag: "heartstone-sealed", region: "caves" },
  ],
};
