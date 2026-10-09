// GENERADO por tools/build_variants_js.py desde docs/data/map-manifest.json.
// No editar a mano: se regenera al publicar o actualizar una variante.
// Fuente: manifest del 2026-10-08.
const MAP_DATA_VERSION = {
  "ats": "20260929",
  "ats_c2c": "20261005",
  "ats_promods": "20260929",
  "ats_c2c_promods": "20261005",
  "ats_canada": "20261008",
  "ats_c2c_canada": "20261008",
  "ats_reforma": "20261008",
  "ats_reforma_c2c_promods": "20261005",
  "ets2": "20260929",
  "ets2_promods": "20260929",
  "ets2_promods_rusmap": "20260929",
  "ets2_promods_roex": "20260929",
  "ets2_promods_rusmap_roex": "20260929",
  "ets2_gu": "20261006",
  "ets2_eugu": "20261005",
  "ets2_promods_eugu": "20261005",
  "ets2_tmp": "20260929"
};

// Metadatos por variante: etiqueta, juego, que proyeccion usa, que valor
// le corresponde en el selector manual de Ajustes y que mods incluye.
const VARIANT_META = {
  "ats": {
    "label": "American Truck Simulator",
    "game": "ats",
    "projection": "ats",
    "origin": [
      -96,
      39
    ],
    "manual": "none",
    "mods": []
  },
  "ats_c2c": {
    "label": "American Truck Simulator + Coast to Coast",
    "game": "ats",
    "projection": "ats",
    "origin": [
      -96,
      39
    ],
    "manual": "c2c",
    "mods": [
      "c2c"
    ]
  },
  "ats_promods": {
    "label": "American Truck Simulator + ProMods Canada",
    "game": "ats",
    "projection": "ats",
    "origin": [
      -96,
      39
    ],
    "manual": "promods_canada",
    "mods": [
      "promods_canada"
    ]
  },
  "ats_c2c_promods": {
    "label": "American Truck Simulator + Coast to Coast + ProMods Canada",
    "game": "ats",
    "projection": "ats",
    "origin": [
      -96,
      39
    ],
    "manual": "c2c_promods_canada",
    "mods": [
      "c2c",
      "promods_canada"
    ]
  },
  "ats_canada": {
    "label": "American Truck Simulator + Western/Eastern Canada",
    "game": "ats",
    "projection": "ats",
    "origin": [
      -100,
      45
    ],
    "manual": "canada",
    "mods": [
      "western_canada",
      "eastern_canada"
    ]
  },
  "ats_c2c_canada": {
    "label": "American Truck Simulator + Coast to Coast + Western/Eastern Canada",
    "game": "ats",
    "projection": "ats",
    "origin": [
      -96,
      42
    ],
    "manual": "c2c_canada",
    "mods": [
      "c2c",
      "western_canada",
      "eastern_canada",
      "cnx_canada_c2c"
    ]
  },
  "ats_reforma": {
    "label": "American Truck Simulator + Reforma",
    "game": "ats",
    "projection": "ats",
    "origin": [
      -102,
      33
    ],
    "manual": "reforma",
    "mods": [
      "reforma",
      "reforma_mega_resources",
      "reforma_sierra_nevada"
    ]
  },
  "ats_reforma_c2c_promods": {
    "label": "American Truck Simulator + Coast to Coast + ProMods Canada + Reforma",
    "game": "ats",
    "projection": "ats",
    "origin": [
      -98,
      36
    ],
    "manual": "reforma_c2c_promods_canada",
    "mods": [
      "c2c",
      "promods_canada",
      "reforma",
      "reforma_mega_resources",
      "reforma_sierra_nevada",
      "reforma_othermaps_patch"
    ]
  },
  "ets2": {
    "label": "Euro Truck Simulator 2",
    "game": "ets2",
    "projection": "ets2",
    "origin": [
      15,
      50
    ],
    "manual": "none",
    "mods": []
  },
  "ets2_promods": {
    "label": "Euro Truck Simulator 2 + ProMods (Europe + addons)",
    "game": "ets2",
    "projection": "ets2",
    "origin": [
      15,
      50
    ],
    "manual": "promods",
    "mods": [
      "promods",
      "promods_me",
      "promods_maghreb",
      "promods_tgs"
    ]
  },
  "ets2_promods_rusmap": {
    "label": "Euro Truck Simulator 2 + ProMods + RusMap",
    "game": "ets2",
    "projection": "ets2",
    "origin": [
      15,
      50
    ],
    "manual": "promods_rusmap",
    "mods": [
      "promods",
      "promods_me",
      "promods_maghreb",
      "promods_tgs",
      "rusmap",
      "cnx_promods_rusmap"
    ]
  },
  "ets2_promods_roex": {
    "label": "Euro Truck Simulator 2 + ProMods + Roextended",
    "game": "ets2",
    "projection": "ets2",
    "origin": [
      20,
      47
    ],
    "manual": "promods_roex",
    "mods": [
      "promods",
      "promods_me",
      "promods_maghreb",
      "promods_tgs",
      "roextended"
    ]
  },
  "ets2_promods_rusmap_roex": {
    "label": "Euro Truck Simulator 2 + ProMods + RusMap + Roextended",
    "game": "ets2",
    "projection": "ets2",
    "origin": [
      20,
      47
    ],
    "manual": "promods_rusmap_roex",
    "mods": [
      "promods",
      "promods_me",
      "promods_maghreb",
      "promods_tgs",
      "rusmap",
      "cnx_promods_rusmap",
      "roextended",
      "cnx_roex_rusmap"
    ]
  },
  "ets2_gu": {
    "label": "Euro Truck Simulator 2 + Grand Utopia",
    "game": "ets2",
    "projection": "gu",
    "origin": [
      -44.5,
      42
    ],
    "manual": "gu",
    "mods": [
      "grand_utopia"
    ]
  },
  "ets2_eugu": {
    "label": "Euro Truck Simulator 2 + European Grand Utopia",
    "game": "ets2",
    "projection": "ets2",
    "origin": [
      15,
      50
    ],
    "manual": null,
    "mods": [
      "grand_utopia",
      "eu_grand_utopia"
    ]
  },
  "ets2_promods_eugu": {
    "label": "Euro Truck Simulator 2 + ProMods + European Grand Utopia",
    "game": "ets2",
    "projection": "ets2",
    "origin": [
      15,
      50
    ],
    "manual": null,
    "mods": [
      "promods",
      "promods_me",
      "promods_maghreb",
      "promods_tgs",
      "grand_utopia",
      "eu_grand_utopia"
    ]
  },
  "ets2_tmp": {
    "label": "Euro Truck Simulator 2 + TruckersMP",
    "game": "ets2",
    "projection": "ets2",
    "origin": [
      15,
      50
    ],
    "manual": "tmp",
    "mods": [
      "truckersmp"
    ]
  }
};

// Credito de cada mod de mapa: nombre, autor (si se sabe) y pagina oficial.
// La app lo muestra en el cartel del mapa y en la ventana de mods.
const MAP_MOD_CREDITS = {
  "c2c": {
    "name": "Coast to Coast",
    "author": "Homburg",
    "homepage": "https://truckymods.io/american-truck-simulator/maps/coast-to-coast"
  },
  "promods_canada": {
    "name": "ProMods Canada",
    "author": null,
    "homepage": "https://www.promods.net/setup.php"
  },
  "promods": {
    "name": "ProMods Europe",
    "author": null,
    "homepage": "https://www.promods.net/setup.php"
  },
  "promods_me": {
    "name": "ProMods Middle East",
    "author": null,
    "homepage": "https://www.promods.net/setup.php"
  },
  "promods_maghreb": {
    "name": "ProMods The Maghreb",
    "author": null,
    "homepage": "https://www.promods.net/setup.php"
  },
  "promods_tgs": {
    "name": "ProMods The Great Steppe",
    "author": null,
    "homepage": "https://www.promods.net/setup.php"
  },
  "rusmap": {
    "name": "RusMap",
    "author": null,
    "homepage": "https://forum.scssoft.com/viewtopic.php?t=332124"
  },
  "reforma": {
    "name": "Reforma",
    "author": null,
    "homepage": "https://www.teamreforma.com/"
  },
  "roextended": {
    "name": "Roextended (Hybrid, ed. ProMods+ME)",
    "author": null,
    "homepage": "https://roextended.ro/"
  },
  "cnx_promods_rusmap": {
    "name": "ProMods–RusMap connector",
    "author": null,
    "homepage": "https://truckymods.io/euro-truck-simulator-2/map-patches/promods-rusmap-connector-626771"
  },
  "reforma_mega_resources": {
    "name": "Reforma Mega Resources",
    "author": null,
    "homepage": "https://www.teamreforma.com/"
  },
  "reforma_sierra_nevada": {
    "name": "Reforma Sierra Nevada Remake",
    "author": null,
    "homepage": "https://www.teamreforma.com/"
  },
  "reforma_othermaps_patch": {
    "name": "Reforma OtherMaps Compatibility Patch",
    "author": null,
    "homepage": "https://www.teamreforma.com/"
  },
  "cnx_roex_rusmap": {
    "name": "Roextended-RusMap connector",
    "author": null,
    "homepage": "https://roextended.ro/"
  },
  "grand_utopia": {
    "name": "Grand Utopia",
    "author": null,
    "homepage": "https://grandutopia.fr/"
  },
  "eu_grand_utopia": {
    "name": "European Grand Utopia",
    "author": null,
    "homepage": "https://truckymods.io/euro-truck-simulator-2/maps/european-grand-utopia"
  },
  "truckersmp": {
    "name": "TruckersMP (map additions)",
    "author": null,
    "homepage": "https://truckersmp.com/"
  },
  "western_canada": {
    "name": "Western Canada Expansion (JacobKazias)",
    "author": null,
    "homepage": null
  },
  "eastern_canada": {
    "name": "Eastern Canada Expansion (JacobKazias)",
    "author": null,
    "homepage": null
  },
  "cnx_canada_c2c": {
    "name": "Western/Eastern Canada C2C Only Connections",
    "author": null,
    "homepage": null
  }
};
