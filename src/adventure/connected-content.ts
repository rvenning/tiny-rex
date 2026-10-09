/** Authored connected-world gameplay content. Generated from tools/world/regions.py. */
export const CONNECTED = {
  "regions": [
    {
      "id": "hollow",
      "name": "Fern Hollow",
      "bounds": [
        -2,
        -2,
        66,
        66
      ],
      "nest": {
        "x": 27,
        "y": 35
      },
      "required": 0,
      "built": true,
      "blurb": "Learn the hunt. Follow the creek."
    },
    {
      "id": "river",
      "name": "Riverbend",
      "bounds": [
        66,
        -2,
        130,
        66
      ],
      "nest": {
        "x": 100,
        "y": 30
      },
      "required": 0,
      "built": true,
      "blurb": "Read the river hunter's lunge; grow to cross the ford."
    },
    {
      "id": "marsh",
      "name": "Reed Marsh",
      "bounds": [
        66,
        66,
        130,
        130
      ],
      "nest": {
        "x": 102,
        "y": 91
      },
      "required": 1,
      "built": true,
      "blurb": "Dry islands and reed lanes let you divide the pack."
    },
    {
      "id": "dunes",
      "name": "Sunscar dunes",
      "bounds": [
        130,
        66,
        194,
        130
      ],
      "nest": {
        "x": 153,
        "y": 102
      },
      "required": 2,
      "built": true,
      "blurb": "Use rock shade and recovery windows in the open sand."
    },
    {
      "id": "ember",
      "name": "Ember Basin",
      "bounds": [
        130,
        -2,
        194,
        66
      ],
      "nest": {
        "x": 173,
        "y": 23
      },
      "required": 3,
      "built": true,
      "blurb": "Cross cooled basalt and claim the volcanic nest."
    },
    {
      "id": "caves",
      "name": "Echo Caves",
      "bounds": [
        -2,
        66,
        66,
        130
      ],
      "nest": {
        "x": 30,
        "y": 88
      },
      "required": 0,
      "built": true,
      "blurb": "Follow pools and fossils; deeper tunnels open as you grow."
    }
  ],
  "gates": [
    {
      "id": "river-ford",
      "kind": "growth",
      "x": 100,
      "y": 66,
      "requiredStage": 1,
      "width": 6,
      "normal": [
        0,
        1
      ],
      "fromRegion": "river",
      "toRegion": "marsh",
      "name": "Shallow ford",
      "blurb": "Juvenile Rex can wade the river ford."
    },
    {
      "id": "marsh-log",
      "kind": "breakable",
      "x": 130,
      "y": 100,
      "requiredStage": 2,
      "width": 6,
      "normal": [
        1,
        0
      ],
      "fromRegion": "marsh",
      "toRegion": "dunes",
      "action": "bite",
      "prop": "log_fallen_gy",
      "name": "Rotten log",
      "blurb": "Hunter Rex breaks the rotten log with a heavy bite."
    },
    {
      "id": "ember-basalt",
      "kind": "breakable",
      "x": 162,
      "y": 66,
      "requiredStage": 3,
      "width": 7,
      "normal": [
        0,
        1
      ],
      "fromRegion": "dunes",
      "toRegion": "ember",
      "action": "bite",
      "prop": "rock_outcrop",
      "name": "Fractured basalt",
      "blurb": "Apex Rex can break the fractured basalt."
    },
    {
      "id": "raptor-roots",
      "kind": "species",
      "x": 64,
      "y": 78,
      "species": "raptor",
      "requiredStage": 0,
      "width": 2,
      "normal": [
        1,
        0
      ],
      "optional": true,
      "name": "Root passage",
      "blurb": "Raptor's optional shortcut joins the Marsh edge to the cave refuge."
    },
    {
      "id": "trike-rubble",
      "kind": "species",
      "x": 180,
      "y": 109,
      "species": "trike",
      "requiredStage": 0,
      "width": 3,
      "normal": [
        1,
        0
      ],
      "optional": true,
      "name": "Rubble secret",
      "blurb": "Triceratops charge opens a fossil alcove, not the main road."
    }
  ],
  "portals": [
    {
      "id": "cave-dunes",
      "kind": "portal",
      "x": 55,
      "y": 111,
      "to": {
        "x": 140,
        "y": 116
      },
      "requiredStage": 2,
      "bidirectional": true,
      "optional": true,
      "name": "Sunscar tunnel",
      "blurb": "Hunter's inner passage joins Echo Caves to the dunes loop."
    },
    {
      "id": "cave-ember",
      "kind": "portal",
      "x": 23,
      "y": 105,
      "to": {
        "x": 146,
        "y": 44
      },
      "requiredStage": 3,
      "bidirectional": true,
      "optional": true,
      "name": "Deep chamber",
      "blurb": "Apex's deep tunnel reaches cooled basalt below the basin."
    },
    {
      "id": "raptor-roots-shortcut",
      "kind": "portal",
      "x": 64,
      "y": 78,
      "to": {
        "x": 28,
        "y": 57
      },
      "species": "raptor",
      "requiredStage": 0,
      "bidirectional": true,
      "optional": true,
      "name": "Root return"
    }
  ],
  "rivals": [
    {
      "id": "river-hunter",
      "name": "River Hunter",
      "species": "raptor",
      "region": "river",
      "home": {
        "x": 96,
        "y": 26
      }
    },
    {
      "id": "marsh-pack",
      "name": "Reed Stalkers",
      "species": "raptor",
      "region": "marsh",
      "home": {
        "x": 112,
        "y": 100
      },
      "companions": [
        {
          "x": 116,
          "y": 104
        }
      ],
      "pattern": "alternating-lunges"
    },
    {
      "id": "basalt-matriarch",
      "name": "Basalt Matriarch",
      "species": "gigano",
      "region": "ember",
      "home": {
        "x": 179,
        "y": 36
      },
      "pattern": "sweep-then-recover"
    }
  ],
  "discoveries": [
    {
      "id": "fossil-hollow-roots",
      "region": "hollow",
      "kind": "fossil",
      "name": "Root-bound vertebra",
      "x": 28,
      "y": 57,
      "blurb": "A vertebra caught beside the south trail.",
      "reward": 3
    },
    {
      "id": "fossil-hollow-cave",
      "region": "hollow",
      "kind": "fossil",
      "name": "Stone fern imprint",
      "x": 29,
      "y": 63,
      "blurb": "Leaf veins point toward the cave mouth.",
      "reward": 3
    },
    {
      "id": "fossil-river-shell",
      "region": "river",
      "kind": "fossil",
      "name": "Spiral shell",
      "x": 82,
      "y": 45,
      "blurb": "Study the fossil and mark this side trail.",
      "reward": 3
    },
    {
      "id": "fossil-river-tooth",
      "region": "river",
      "kind": "fossil",
      "name": "River hunter tooth",
      "x": 113,
      "y": 36,
      "blurb": "Study the fossil and mark this side trail.",
      "reward": 3
    },
    {
      "id": "fossil-river-footprint",
      "region": "river",
      "kind": "fossil",
      "name": "Mudstone footprint",
      "x": 86,
      "y": 57,
      "blurb": "Study the fossil and mark this side trail.",
      "reward": 3
    },
    {
      "id": "fossil-marsh-wing",
      "region": "marsh",
      "kind": "fossil",
      "name": "Ancient wing print",
      "x": 82,
      "y": 83,
      "blurb": "Study the fossil and mark this side trail.",
      "reward": 3
    },
    {
      "id": "fossil-marsh-spine",
      "region": "marsh",
      "kind": "fossil",
      "name": "Reed-bed spine",
      "x": 99,
      "y": 116,
      "blurb": "Study the fossil and mark this side trail.",
      "reward": 3
    },
    {
      "id": "fossil-marsh-scale",
      "region": "marsh",
      "kind": "fossil",
      "name": "Armoured scale",
      "x": 118,
      "y": 110,
      "blurb": "Study the fossil and mark this side trail.",
      "reward": 3
    },
    {
      "id": "fossil-dunes-ribs",
      "region": "dunes",
      "kind": "fossil",
      "name": "Sun-bleached ribs",
      "x": 160,
      "y": 120,
      "blurb": "Study the fossil and mark this side trail.",
      "reward": 3
    },
    {
      "id": "fossil-dunes-claw",
      "region": "dunes",
      "kind": "fossil",
      "name": "Buried claw",
      "x": 179,
      "y": 86,
      "blurb": "Study the fossil and mark this side trail.",
      "reward": 3
    },
    {
      "id": "fossil-dunes-frill",
      "region": "dunes",
      "kind": "fossil",
      "name": "Frill fragment",
      "x": 184,
      "y": 109,
      "blurb": "Study the fossil and mark this side trail.",
      "reward": 3
    },
    {
      "id": "fossil-ember-horn",
      "region": "ember",
      "kind": "fossil",
      "name": "Basalt horn cast",
      "x": 149,
      "y": 27,
      "blurb": "Study the fossil and mark this side trail.",
      "reward": 3
    },
    {
      "id": "fossil-ember-track",
      "region": "ember",
      "kind": "fossil",
      "name": "Ash-bound track",
      "x": 161,
      "y": 13,
      "blurb": "Study the fossil and mark this side trail.",
      "reward": 3
    },
    {
      "id": "fossil-ember-jaw",
      "region": "ember",
      "kind": "fossil",
      "name": "Volcanic jaw",
      "x": 189,
      "y": 35,
      "blurb": "Study the fossil and mark this side trail.",
      "reward": 3
    },
    {
      "id": "fossil-caves-ammonite",
      "region": "caves",
      "kind": "fossil",
      "name": "Pool ammonite",
      "x": 13,
      "y": 88,
      "blurb": "Study the fossil and mark this side trail.",
      "reward": 3
    },
    {
      "id": "fossil-caves-skull",
      "region": "caves",
      "kind": "fossil",
      "name": "Echo skull",
      "x": 12,
      "y": 111,
      "blurb": "Study the fossil and mark this side trail.",
      "reward": 3
    },
    {
      "id": "fossil-caves-slab",
      "region": "caves",
      "kind": "fossil",
      "name": "Layered fossil slab",
      "x": 49,
      "y": 95,
      "blurb": "Study the fossil and mark this side trail.",
      "reward": 3
    },
    {
      "id": "nest-river",
      "region": "river",
      "kind": "nest",
      "name": "Riverbend refuge",
      "x": 100,
      "y": 30,
      "blurb": "Rest, bank discoveries and choose an unlocked species.",
      "reward": 0
    },
    {
      "id": "forage-river",
      "region": "river",
      "kind": "forage",
      "name": "Refuge forage",
      "x": 102,
      "y": 31,
      "blurb": "Healing food in the safe clearing.",
      "reward": 0
    },
    {
      "id": "nest-marsh",
      "region": "marsh",
      "kind": "nest",
      "name": "Reed Marsh refuge",
      "x": 102,
      "y": 91,
      "blurb": "Rest, bank discoveries and choose an unlocked species.",
      "reward": 0
    },
    {
      "id": "forage-marsh",
      "region": "marsh",
      "kind": "forage",
      "name": "Refuge forage",
      "x": 104,
      "y": 92,
      "blurb": "Healing food in the safe clearing.",
      "reward": 0
    },
    {
      "id": "nest-dunes",
      "region": "dunes",
      "kind": "nest",
      "name": "Sunscar dunes refuge",
      "x": 153,
      "y": 102,
      "blurb": "Rest, bank discoveries and choose an unlocked species.",
      "reward": 0
    },
    {
      "id": "forage-dunes",
      "region": "dunes",
      "kind": "forage",
      "name": "Refuge forage",
      "x": 155,
      "y": 103,
      "blurb": "Healing food in the safe clearing.",
      "reward": 0
    },
    {
      "id": "nest-ember",
      "region": "ember",
      "kind": "nest",
      "name": "Ember Basin refuge",
      "x": 173,
      "y": 23,
      "blurb": "Rest, bank discoveries and choose an unlocked species.",
      "reward": 0
    },
    {
      "id": "forage-ember",
      "region": "ember",
      "kind": "forage",
      "name": "Refuge forage",
      "x": 175,
      "y": 24,
      "blurb": "Healing food in the safe clearing.",
      "reward": 0
    },
    {
      "id": "nest-caves",
      "region": "caves",
      "kind": "nest",
      "name": "Echo Caves refuge",
      "x": 30,
      "y": 88,
      "blurb": "Rest, bank discoveries and choose an unlocked species.",
      "reward": 0
    },
    {
      "id": "forage-caves",
      "region": "caves",
      "kind": "forage",
      "name": "Refuge forage",
      "x": 32,
      "y": 89,
      "blurb": "Healing food in the safe clearing.",
      "reward": 0
    },
    {
      "id": "tracks-river",
      "region": "river",
      "kind": "tracks",
      "name": "Hunter tracks",
      "x": 90,
      "y": 34,
      "blurb": "Watch the lunge before committing to the fight.",
      "reward": 2
    },
    {
      "id": "tracks-marsh",
      "region": "marsh",
      "kind": "tracks",
      "name": "Two sets of prints",
      "x": 111,
      "y": 98,
      "blurb": "Reed lanes let you separate the coordinated hunters.",
      "reward": 2
    },
    {
      "id": "egg-marsh",
      "region": "marsh",
      "kind": "egg",
      "name": "Lost clutch",
      "x": 84,
      "y": 105,
      "blurb": "Bring the clutch back to the Marsh refuge.",
      "reward": 3
    },
    {
      "id": "tracks-ember",
      "region": "ember",
      "kind": "tracks",
      "name": "Territorial marks",
      "x": 168,
      "y": 45,
      "blurb": "The matriarch sweeps a wide arc; give her room.",
      "reward": 2
    }
  ],
  "objectives": [
    {
      "id": "stalk-first",
      "region": "hollow",
      "name": "Quiet paws",
      "kind": "slow-hunt",
      "target": "beetle",
      "count": 3,
      "reward": 3
    },
    {
      "id": "read-river",
      "region": "river",
      "name": "Read the river hunter",
      "kind": "clean-rival",
      "target": "river-hunter",
      "maxHits": 0,
      "reward": 8
    },
    {
      "id": "reed-watch",
      "region": "river",
      "name": "Wait for a wingbeat",
      "kind": "settled-hunt",
      "target": "dragonfly",
      "count": 3,
      "reward": 5
    },
    {
      "id": "lost-clutch",
      "region": "marsh",
      "name": "The lost clutch",
      "kind": "deliver-discovery",
      "target": "egg-marsh",
      "destination": "nest-marsh",
      "reward": 8
    },
    {
      "id": "split-pack",
      "region": "marsh",
      "name": "One hunter at a time",
      "kind": "separated-rival",
      "target": "marsh-pack",
      "reward": 10
    },
    {
      "id": "hatchling-escort",
      "region": "marsh",
      "name": "A safe path home",
      "kind": "escort",
      "to": {
        "x": 102,
        "y": 91
      },
      "reward": 8,
      "from": {
        "x": 82,
        "y": 83
      }
    },
    {
      "id": "sunscar-flank",
      "region": "dunes",
      "name": "Shade and flank",
      "kind": "recovery-hunt",
      "target": "dilo",
      "count": 2,
      "reward": 10
    },
    {
      "id": "leave-herd",
      "region": "dunes",
      "name": "Respect the herd",
      "kind": "observe-neutral",
      "target": "trike",
      "seconds": 15,
      "reward": 5
    },
    {
      "id": "echo-trail",
      "region": "caves",
      "name": "Read the rock record",
      "kind": "regional-fossils",
      "target": "caves",
      "count": 3,
      "reward": 8
    },
    {
      "id": "basalt-mastery",
      "region": "ember",
      "name": "The clean claim",
      "kind": "clean-rival",
      "target": "basalt-matriarch",
      "maxHits": 0,
      "reward": 20
    }
  ],
  "spawns": {
    "river": [
      [
        "beetle",
        80,
        32
      ],
      [
        "beetle",
        88,
        35
      ],
      [
        "dragonfly",
        82,
        45
      ],
      [
        "dragonfly",
        105,
        57
      ],
      [
        "compy",
        90,
        34
      ],
      [
        "compy",
        92,
        35
      ],
      [
        "hypsi",
        108,
        49
      ],
      [
        "oviraptor",
        113,
        37
      ],
      [
        "raptor",
        96,
        26
      ]
    ],
    "marsh": [
      [
        "dragonfly",
        96,
        76
      ],
      [
        "dragonfly",
        84,
        105
      ],
      [
        "beetle",
        101,
        93
      ],
      [
        "compy",
        82,
        83
      ],
      [
        "hypsi",
        99,
        116
      ],
      [
        "raptor",
        112,
        100
      ],
      [
        "raptor",
        116,
        104
      ],
      [
        "oviraptor",
        118,
        110
      ],
      [
        "trike",
        85,
        90
      ]
    ],
    "dunes": [
      [
        "compy",
        141,
        104
      ],
      [
        "compy",
        142,
        106
      ],
      [
        "hypsi",
        160,
        120
      ],
      [
        "dilo",
        170,
        96
      ],
      [
        "raptor",
        179,
        86
      ],
      [
        "trike",
        184,
        109
      ],
      [
        "beetle",
        153,
        103
      ]
    ],
    "ember": [
      [
        "dilo",
        168,
        45
      ],
      [
        "raptor",
        149,
        27
      ],
      [
        "hypsi",
        161,
        13
      ],
      [
        "gigano",
        179,
        36
      ],
      [
        "beetle",
        173,
        24
      ],
      [
        "oviraptor",
        143,
        47
      ]
    ],
    "caves": [
      [
        "beetle",
        30,
        89
      ],
      [
        "beetle",
        13,
        88
      ],
      [
        "compy",
        22,
        103
      ],
      [
        "dragonfly",
        49,
        95
      ],
      [
        "oviraptor",
        37,
        114
      ],
      [
        "dilo",
        14,
        113
      ]
    ]
  }
} as const;
