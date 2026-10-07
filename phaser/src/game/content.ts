import type {Species,Level,World} from './types';
export const SPECIES: Species[] = [
  {
    "id": "fern",
    "name": "Fern",
    "kind": "plant",
    "shape": "fern",
    "body": "#3f9e52",
    "trim": "#7fd08a",
    "fact": "Ferns fed half the valley. They were old news even to dinosaurs."
  },
  {
    "id": "berries",
    "name": "Berry Bush",
    "kind": "plant",
    "shape": "bush",
    "body": "#4a8f4a",
    "trim": "#e8556d",
    "fact": "Berries are a small snack — but there is always another one."
  },
  {
    "id": "dragonfly",
    "name": "Meganeura",
    "tier": 0,
    "shape": "flyer",
    "speed": 92,
    "aggression": 0,
    "caution": 0.75,
    "body": "#3fc7c0",
    "trim": "#bff7f2",
    "fact": "A dragonfly with wings as wide as a seagull's."
  },
  {
    "id": "beetle",
    "name": "Giant Beetle",
    "tier": 0,
    "shape": "bug",
    "speed": 46,
    "aggression": 0,
    "caution": 0.35,
    "body": "#8a6b3a",
    "trim": "#d8b271",
    "fact": "Shiny, slow, and quite happy to be eaten."
  },
  {
    "id": "compy",
    "name": "Compsognathus",
    "tier": 1,
    "shape": "biped",
    "speed": 96,
    "aggression": 0.3,
    "caution": 0.6,
    "body": "#c8d452",
    "trim": "#f2f7b0",
    "fact": "Chicken-sized, and never anywhere on its own."
  },
  {
    "id": "dimorph",
    "name": "Dimorphodon",
    "tier": 1,
    "shape": "flyer",
    "speed": 100,
    "aggression": 0,
    "caution": 0.8,
    "body": "#d68ad0",
    "trim": "#f7d9f5",
    "fact": "A flyer with a big head and a very long tail."
  },
  {
    "id": "hypsi",
    "name": "Hypsilophodon",
    "tier": 2,
    "shape": "runner",
    "speed": 88,
    "aggression": 0,
    "caution": 0.85,
    "body": "#d9b06a",
    "trim": "#f6e2b4",
    "fact": "A little plant-eater built entirely for running away."
  },
  {
    "id": "ovi",
    "name": "Oviraptor",
    "tier": 2,
    "shape": "biped",
    "speed": 84,
    "aggression": 0.5,
    "caution": 0.45,
    "body": "#e08a4a",
    "trim": "#ffd9a8",
    "fact": "Its name means egg thief — and it was a mix-up. It was guarding them."
  },
  {
    "id": "raptor",
    "name": "Velociraptor",
    "tier": 3,
    "shape": "runner",
    "speed": 100,
    "aggression": 0.9,
    "caution": 0.2,
    "body": "#b5613a",
    "trim": "#f0b07a",
    "fact": "Turkey-sized, covered in feathers, one hooked claw on each foot."
  },
  {
    "id": "kentro",
    "name": "Kentrosaurus",
    "tier": 3,
    "shape": "quad",
    "spiky": true,
    "speed": 40,
    "aggression": 0,
    "caution": 0.2,
    "body": "#77839a",
    "trim": "#c3cddd",
    "fact": "Spikes all the way down its back and tail. Nobody bites this one."
  },
  {
    "id": "galli",
    "name": "Gallimimus",
    "tier": 4,
    "shape": "runner",
    "speed": 106,
    "aggression": 0,
    "caution": 0.95,
    "body": "#c9c6bb",
    "trim": "#f2f0e8",
    "fact": "The ostrich of the dinosaurs, and about as easy to catch."
  },
  {
    "id": "dilo",
    "name": "Dilophosaurus",
    "tier": 4,
    "shape": "crested",
    "speed": 98,
    "aggression": 0.85,
    "caution": 0.2,
    "body": "#5aa05e",
    "trim": "#ffe07a",
    "fact": "Two thin crests on its head, like a pair of dinner plates."
  },
  {
    "id": "anky",
    "name": "Ankylosaurus",
    "tier": 4,
    "shape": "club",
    "spiky": true,
    "speed": 34,
    "aggression": 0,
    "caution": 0.1,
    "body": "#7f7346",
    "trim": "#c2b077",
    "fact": "A walking tank with a great bony club on the end of its tail."
  },
  {
    "id": "trike",
    "name": "Triceratops",
    "tier": 5,
    "shape": "frilled",
    "speed": 74,
    "aggression": 0.35,
    "caution": 0.2,
    "body": "#a3714b",
    "trim": "#e2c08c",
    "fact": "Three horns and a frill like a shield. It did not run from much."
  },
  {
    "id": "stego",
    "name": "Stegosaurus",
    "tier": 5,
    "shape": "plated",
    "spiky": true,
    "speed": 46,
    "aggression": 0,
    "caution": 0.15,
    "body": "#6d84a8",
    "trim": "#b9cbe6",
    "fact": "Plates along its back and four long spikes on its tail."
  },
  {
    "id": "rex",
    "name": "Tyrannosaurus",
    "tier": 6,
    "shape": "rex",
    "speed": 96,
    "aggression": 1,
    "caution": 0,
    "body": "#3f6b48",
    "trim": "#8fc48e",
    "fact": "The one everybody knows. Teeth the size of bananas."
  },
  {
    "id": "gigano",
    "name": "Giganotosaurus",
    "tier": 6,
    "shape": "rex",
    "speed": 100,
    "aggression": 0.9,
    "caution": 0.9,
    "body": "#8a3b46",
    "trim": "#e08a8a",
    "fact": "Even longer than a T. rex, and it never learned to share."
  }
];
export const TIER_R = [
  9,
  12,
  16,
  21,
  27,
  34,
  43
];
export const TIER_VALUE = [
  2,
  3,
  5,
  8,
  12,
  17,
  24
];
export const PLAYER_R = [
  0,
  12,
  16,
  21,
  27,
  34,
  43,
  54
];
export const PLAYER_SPEED = [
  0,
  158,
  154,
  150,
  145,
  139,
  132,
  124
];
export const STAGE_NAME = [
  "",
  "Hatchling",
  "Nipper",
  "Scamper",
  "Stomper",
  "Prowler",
  "Big Rex",
  "Mighty Rex"
];
export const NEED = [
  0,
  6,
  10,
  16,
  24,
  34,
  46
];
export const WORLDS: World[] = [
  {
    "id": "hollow",
    "name": "Fern Hollow",
    "icon": "🌿",
    "sky": [
      "#8fd8e8",
      "#cdeecb"
    ],
    "ground": "#5f9e57",
    "groundDark": "#4a8046",
    "rock": "#7d9c6b",
    "scrub": "#3f7f45",
    "blurb": "Warm, green and full of bugs. Nothing here wants to eat you."
  },
  {
    "id": "gulch",
    "name": "Bone Gulch",
    "icon": "🦴",
    "sky": [
      "#f4c98a",
      "#f6e2b8"
    ],
    "ground": "#c99a5f",
    "groundDark": "#a87d47",
    "rock": "#d8bd90",
    "scrub": "#9c7c3f",
    "blurb": "Dry, open and busy. Things in the gulch have noticed you."
  },
  {
    "id": "ridge",
    "name": "Spike Ridge",
    "icon": "⛰️",
    "sky": [
      "#9a94d8",
      "#d3cbe9"
    ],
    "ground": "#7a7192",
    "groundDark": "#615a77",
    "rock": "#9b93b4",
    "scrub": "#4f4a63",
    "blurb": "Cold stone, and armour everywhere. Some things you just cannot bite."
  },
  {
    "id": "basin",
    "name": "Thunder Basin",
    "icon": "🌋",
    "sky": [
      "#e08a63",
      "#f3bb8e"
    ],
    "ground": "#8c5340",
    "groundDark": "#6d3f31",
    "rock": "#a86a4f",
    "scrub": "#5c3427",
    "blurb": "Ash on the wind and the ground shaking. The big ones live here."
  }
];
export const LEVELS: Level[] = [
  {
    "world": 0,
    "name": "First Light",
    "start": 1,
    "target": 2,
    "time": 100,
    "plants": 14,
    "hint": "Eat anything SMALLER than you. Drag or tap to run there.",
    "spawn": [
      [
        "beetle",
        6
      ],
      [
        "dragonfly",
        3
      ],
      [
        "hypsi",
        2
      ]
    ],
    "idx": 0
  },
  {
    "world": 0,
    "name": "Bug Hunt",
    "start": 1,
    "target": 3,
    "time": 115,
    "plants": 12,
    "hint": "Something the same size as you is safe — you just bump noses.",
    "spawn": [
      [
        "beetle",
        5
      ],
      [
        "dragonfly",
        4
      ],
      [
        "compy",
        4
      ],
      [
        "hypsi",
        2
      ]
    ],
    "idx": 1
  },
  {
    "world": 0,
    "name": "The Long Grass",
    "start": 1,
    "target": 3,
    "time": 115,
    "plants": 11,
    "hint": "Grow one size and yesterday's bully is today's dinner.",
    "spawn": [
      [
        "beetle",
        4
      ],
      [
        "dragonfly",
        3
      ],
      [
        "compy",
        5
      ],
      [
        "ovi",
        2
      ],
      [
        "hypsi",
        2
      ]
    ],
    "idx": 2
  },
  {
    "world": 0,
    "name": "Nipper's Run",
    "start": 2,
    "target": 4,
    "time": 125,
    "plants": 11,
    "hint": "That rusty one with the feathers hunts. Keep an eye on it.",
    "spawn": [
      [
        "compy",
        5
      ],
      [
        "dimorph",
        3
      ],
      [
        "hypsi",
        4
      ],
      [
        "ovi",
        3
      ],
      [
        "raptor",
        1
      ]
    ],
    "idx": 3
  },
  {
    "world": 0,
    "name": "Old Claw",
    "start": 2,
    "target": 4,
    "time": 145,
    "plants": 12,
    "beast": {
      "id": "raptor",
      "name": "Old Claw"
    },
    "hint": "Old Claw is hunting you. Grow past him and it is his turn to run.",
    "spawn": [
      [
        "compy",
        5
      ],
      [
        "dragonfly",
        3
      ],
      [
        "hypsi",
        4
      ],
      [
        "ovi",
        3
      ]
    ],
    "idx": 4
  },
  {
    "world": 1,
    "name": "Dry Bones",
    "start": 2,
    "target": 4,
    "time": 125,
    "plants": 10,
    "hint": "Two hunters now. Eat with one eye behind you.",
    "spawn": [
      [
        "compy",
        5
      ],
      [
        "hypsi",
        4
      ],
      [
        "ovi",
        4
      ],
      [
        "raptor",
        2
      ]
    ],
    "idx": 5
  },
  {
    "world": 1,
    "name": "The Wide Open",
    "start": 2,
    "target": 5,
    "time": 140,
    "plants": 10,
    "hint": "The pale runners are quick, but they tire before you do.",
    "spawn": [
      [
        "compy",
        6
      ],
      [
        "hypsi",
        5
      ],
      [
        "ovi",
        4
      ],
      [
        "raptor",
        2
      ],
      [
        "galli",
        2
      ]
    ],
    "idx": 6
  },
  {
    "world": 1,
    "name": "Crested Trouble",
    "start": 3,
    "target": 5,
    "time": 135,
    "plants": 10,
    "hint": "The green one with the fans on its head is trouble. Give it room.",
    "spawn": [
      [
        "compy",
        5
      ],
      [
        "hypsi",
        5
      ],
      [
        "ovi",
        4
      ],
      [
        "raptor",
        2
      ],
      [
        "galli",
        2
      ],
      [
        "dilo",
        1
      ]
    ],
    "idx": 7
  },
  {
    "world": 1,
    "name": "Pack Country",
    "start": 3,
    "target": 5,
    "time": 135,
    "plants": 9,
    "hint": "When two come at once, run to open ground — never into a corner.",
    "spawn": [
      [
        "compy",
        5
      ],
      [
        "hypsi",
        4
      ],
      [
        "ovi",
        4
      ],
      [
        "raptor",
        3
      ],
      [
        "galli",
        2
      ],
      [
        "dilo",
        1
      ]
    ],
    "idx": 8
  },
  {
    "world": 1,
    "name": "Hiss",
    "start": 3,
    "target": 5,
    "time": 155,
    "plants": 10,
    "beast": {
      "id": "dilo",
      "name": "Hiss"
    },
    "hint": "Hiss is faster than you — until he runs out of puff. Keep after him.",
    "spawn": [
      [
        "compy",
        5
      ],
      [
        "hypsi",
        5
      ],
      [
        "ovi",
        4
      ],
      [
        "raptor",
        2
      ],
      [
        "galli",
        2
      ]
    ],
    "idx": 9
  },
  {
    "world": 2,
    "name": "Sharp Company",
    "start": 3,
    "target": 5,
    "time": 140,
    "plants": 10,
    "hint": "SPIKY ones can never be eaten — however small they look. Leave them be.",
    "spawn": [
      [
        "compy",
        5
      ],
      [
        "hypsi",
        4
      ],
      [
        "ovi",
        3
      ],
      [
        "raptor",
        2
      ],
      [
        "galli",
        2
      ],
      [
        "kentro",
        3
      ]
    ],
    "idx": 10
  },
  {
    "world": 2,
    "name": "Armour Plated",
    "start": 3,
    "target": 5,
    "time": 140,
    "plants": 9,
    "hint": "Biting a spiky one costs you a mouthful. Pick something soft instead.",
    "spawn": [
      [
        "compy",
        5
      ],
      [
        "hypsi",
        4
      ],
      [
        "ovi",
        3
      ],
      [
        "raptor",
        2
      ],
      [
        "galli",
        3
      ],
      [
        "kentro",
        3
      ],
      [
        "anky",
        2
      ]
    ],
    "idx": 11
  },
  {
    "world": 2,
    "name": "The Stone Bowl",
    "start": 4,
    "target": 6,
    "time": 155,
    "plants": 9,
    "hint": "Big and horned is dinner. Big and spiky is not.",
    "spawn": [
      [
        "hypsi",
        4
      ],
      [
        "ovi",
        3
      ],
      [
        "raptor",
        2
      ],
      [
        "galli",
        3
      ],
      [
        "dilo",
        2
      ],
      [
        "kentro",
        3
      ],
      [
        "anky",
        2
      ],
      [
        "trike",
        2
      ]
    ],
    "idx": 12
  },
  {
    "world": 2,
    "name": "Plates and Spikes",
    "start": 4,
    "target": 6,
    "time": 155,
    "plants": 9,
    "hint": "Half the ridge is armoured today. Hunt what you can actually swallow.",
    "spawn": [
      [
        "hypsi",
        4
      ],
      [
        "galli",
        3
      ],
      [
        "dilo",
        2
      ],
      [
        "raptor",
        2
      ],
      [
        "kentro",
        4
      ],
      [
        "anky",
        3
      ],
      [
        "stego",
        3
      ],
      [
        "trike",
        2
      ]
    ],
    "idx": 13
  },
  {
    "world": 2,
    "name": "Bramble",
    "start": 4,
    "target": 6,
    "time": 170,
    "plants": 10,
    "beast": {
      "id": "trike",
      "name": "Bramble"
    },
    "hint": "Bramble has three horns and no manners. Out-grow her first.",
    "spawn": [
      [
        "hypsi",
        4
      ],
      [
        "galli",
        3
      ],
      [
        "dilo",
        2
      ],
      [
        "raptor",
        2
      ],
      [
        "kentro",
        3
      ],
      [
        "anky",
        2
      ],
      [
        "trike",
        1
      ]
    ],
    "idx": 14
  },
  {
    "world": 3,
    "name": "Ashfall",
    "start": 4,
    "target": 6,
    "time": 160,
    "plants": 9,
    "hint": "There is a full-grown Tyrannosaurus in here. Stay small and quiet, then grow.",
    "spawn": [
      [
        "compy",
        4
      ],
      [
        "hypsi",
        4
      ],
      [
        "ovi",
        3
      ],
      [
        "raptor",
        2
      ],
      [
        "galli",
        3
      ],
      [
        "dilo",
        2
      ],
      [
        "kentro",
        2
      ],
      [
        "anky",
        2
      ],
      [
        "trike",
        2
      ],
      [
        "rex",
        1
      ]
    ],
    "idx": 15
  },
  {
    "world": 3,
    "name": "The Shaking Ground",
    "start": 5,
    "target": 6,
    "time": 145,
    "plants": 8,
    "hint": "Horned ones are worth a lot. Three of them and you are a Big Rex.",
    "spawn": [
      [
        "galli",
        4
      ],
      [
        "dilo",
        3
      ],
      [
        "anky",
        2
      ],
      [
        "stego",
        3
      ],
      [
        "trike",
        4
      ],
      [
        "rex",
        1
      ]
    ],
    "idx": 16
  },
  {
    "world": 3,
    "name": "Two Giants",
    "start": 5,
    "target": 7,
    "time": 175,
    "plants": 8,
    "hint": "One more size after Big Rex — and then nothing in the valley can touch you.",
    "spawn": [
      [
        "galli",
        4
      ],
      [
        "dilo",
        3
      ],
      [
        "stego",
        3
      ],
      [
        "trike",
        4
      ],
      [
        "rex",
        2
      ]
    ],
    "idx": 17
  },
  {
    "world": 3,
    "name": "Last Light",
    "start": 5,
    "target": 7,
    "time": 180,
    "plants": 8,
    "hint": "Keep moving. Two of them are hunting and neither one gives up.",
    "spawn": [
      [
        "galli",
        4
      ],
      [
        "dilo",
        3
      ],
      [
        "kentro",
        2
      ],
      [
        "stego",
        3
      ],
      [
        "trike",
        5
      ],
      [
        "rex",
        1
      ],
      [
        "gigano",
        1
      ]
    ],
    "idx": 18
  },
  {
    "world": 3,
    "name": "Giganto",
    "start": 5,
    "target": 7,
    "time": 200,
    "plants": 9,
    "beast": {
      "id": "gigano",
      "name": "Giganto"
    },
    "hint": "Giganto rules this basin. Become a Mighty Rex and take it from him.",
    "spawn": [
      [
        "galli",
        4
      ],
      [
        "dilo",
        3
      ],
      [
        "stego",
        3
      ],
      [
        "trike",
        5
      ],
      [
        "rex",
        1
      ]
    ],
    "idx": 19
  }
];
export const FEAST = {
  "name": "Endless Feast",
  "start": 1,
  "maxTier": 5,
  "plants": 12,
  "waveEvery": 24,
  "hunger": 0.03,
  "hungerPerWave": 0.0042,
  "thicken": 0.16,
  "waves": [
    [
      [
        "beetle",
        5
      ],
      [
        "dragonfly",
        4
      ],
      [
        "compy",
        5
      ],
      [
        "hypsi",
        4
      ]
    ],
    [
      [
        "ovi",
        3
      ],
      [
        "raptor",
        1
      ]
    ],
    [
      [
        "galli",
        2
      ],
      [
        "kentro",
        2
      ]
    ],
    [
      [
        "raptor",
        2
      ],
      [
        "dilo",
        1
      ]
    ],
    [
      [
        "anky",
        2
      ],
      [
        "trike",
        2
      ]
    ],
    [
      [
        "dilo",
        2
      ],
      [
        "stego",
        2
      ]
    ],
    [
      [
        "rex",
        1
      ],
      [
        "galli",
        2
      ]
    ],
    [
      [
        "raptor",
        2
      ],
      [
        "trike",
        2
      ]
    ],
    [
      [
        "rex",
        1
      ],
      [
        "gigano",
        1
      ]
    ]
  ]
};
export const species=(id:string)=>SPECIES.find(s=>s.id===id)!;
export const relation=(s:Species,t:number):'food'|'bump'|'danger'|'spiky'=>s.kind==='plant'?'food':s.spiky?'spiky':s.tier!<t?'food':s.tier===t?'bump':'danger';
export const radius=(s:Species)=>s.kind==='plant'?8:TIER_R[s.tier!];
export const value=(s:Species)=>s.kind==='plant'?1:TIER_VALUE[s.tier!];
