/**
 * seed.ts — Données initiales de la base de données VIVRE
 *
 * Ce script est exécuté via `pnpm db:seed` (alias de `prisma db seed`).
 * Il popule la base avec les données nécessaires pour que l'application
 * soit immédiatement opérationnelle sans configuration manuelle.
 *
 * Données seedées :
 * 1. 10 villes du Burkina Faso avec coordonnées GPS
 * 2. 5 numéros d'urgence nationaux (SAMU, Police, Pompiers, etc.)
 * 3. 13 catégories de services publics (hôpital, pharmacie, police, etc.)
 * 4. Compte administrateur VIVRE (admin@vivre.bf)
 * 5. Données de démo (1 compagnie de transport, 1 hôtel, 1 restaurant) [optionnel]
 *
 * Idempotence : le seed utilise upsert pour être ré-exécutable sans dupliquer les données.
 * On peut lancer `pnpm db:seed` plusieurs fois sans risque.
 */

import { prisma } from "./index.js";

/* ============================================================
 * DONNÉES DES VILLES
 * Source : données officielles ONTB + OpenStreetMap
 * Coordonnées validées manuellement pour les 10 villes cibles
 * ============================================================ */

const CITIES_DATA = [
  {
    name: "Ouagadougou",
    name_en: "Ouagadougou",
    region: "Centre",
    latitude: 12.3647,
    longitude: -1.5338,
    population: 2_200_000,
    has_transport: true,
    has_food: true,
    has_drivers: true,
  },
  {
    name: "Bobo-Dioulasso",
    name_en: "Bobo-Dioulasso",
    region: "Hauts-Bassins",
    latitude: 11.1771,
    longitude: -4.2979,
    population: 800_000,
    has_transport: true,
    has_food: true,
    has_drivers: true,
  },
  {
    name: "Banfora",
    name_en: "Banfora",
    region: "Cascades",
    latitude: 10.6333,
    longitude: -4.7667,
    population: 120_000,
    has_transport: true,
    has_food: false,
    has_drivers: false,
  },
  {
    name: "Koudougou",
    name_en: "Koudougou",
    region: "Centre-Ouest",
    latitude: 12.25,
    longitude: -2.3667,
    population: 130_000,
    has_transport: true,
    has_food: false,
    has_drivers: false,
  },
  {
    name: "Ouahigouya",
    name_en: "Ouahigouya",
    region: "Nord",
    latitude: 13.5667,
    longitude: -2.4167,
    population: 90_000,
    has_transport: true,
    has_food: false,
    has_drivers: false,
  },
  {
    name: "Fada N'Gourma",
    name_en: "Fada N'Gourma",
    region: "Est",
    latitude: 12.0667,
    longitude: 0.35,
    population: 65_000,
    has_transport: true,
    has_food: false,
    has_drivers: false,
  },
  {
    name: "Dédougou",
    name_en: "Dedougou",
    region: "Boucle du Mouhoun",
    latitude: 12.46,
    longitude: -3.46,
    population: 60_000,
    has_transport: true,
    has_food: false,
    has_drivers: false,
  },
  {
    name: "Tenkodogo",
    name_en: "Tenkodogo",
    region: "Centre-Est",
    latitude: 11.7833,
    longitude: -0.3667,
    population: 55_000,
    has_transport: true,
    has_food: false,
    has_drivers: false,
  },
  {
    name: "Kaya",
    name_en: "Kaya",
    region: "Centre-Nord",
    latitude: 13.0833,
    longitude: -1.0833,
    population: 85_000,
    has_transport: true,
    has_food: false,
    has_drivers: false,
  },
  {
    name: "Ziniaré",
    name_en: "Ziniare",
    region: "Plateau-Central",
    latitude: 12.5833,
    longitude: -1.2833,
    population: 30_000,
    has_transport: false,
    has_food: false,
    has_drivers: false,
  },
] as const;

/* ============================================================
 * NUMÉROS D'URGENCE
 * Source : numéros officiels du gouvernement burkinabè
 * ============================================================ */

const EMERGENCY_NUMBERS_DATA = [
  {
    service_name: "SAMU",
    service_name_en: "Emergency Medical Services",
    number: "15",
    icon: "Ambulance",
    color_hex: "#E74C3C",
    sort_order: 1,
  },
  {
    service_name: "Police Nationale",
    service_name_en: "National Police",
    number: "17",
    icon: "Shield",
    color_hex: "#2980B9",
    sort_order: 2,
  },
  {
    service_name: "Pompiers",
    service_name_en: "Fire Department",
    number: "18",
    icon: "Flame",
    color_hex: "#E67E22",
    sort_order: 3,
  },
  {
    service_name: "Gendarmerie",
    service_name_en: "Gendarmerie",
    number: "16",
    icon: "Badge",
    color_hex: "#27AE60",
    sort_order: 4,
  },
  {
    service_name: "Antipoison",
    service_name_en: "Poison Control",
    number: "+226 25 33 40 40",
    icon: "FlaskConical",
    color_hex: "#8E44AD",
    sort_order: 5,
  },
] as const;

/* ============================================================
 * CATÉGORIES DE SERVICES PUBLICS
 * Source : Vivre_DatabaseSchema_v1.3 — Section 11
 * ============================================================ */

const SERVICE_CATEGORIES_DATA = [
  {
    slug: "hospital",
    name_fr: "Hôpitaux",
    name_en: "Hospitals",
    icon: "Hospital",
    color_hex: "#E74C3C",
    is_emergency: true,
    sort_order: 1,
  },
  {
    slug: "pharmacy",
    name_fr: "Pharmacies",
    name_en: "Pharmacies",
    icon: "Pill",
    color_hex: "#27AE60",
    is_emergency: true,
    sort_order: 2,
  },
  {
    slug: "police",
    name_fr: "Police",
    name_en: "Police",
    icon: "Shield",
    color_hex: "#2980B9",
    is_emergency: true,
    sort_order: 3,
  },
  {
    slug: "fire",
    name_fr: "Pompiers",
    name_en: "Fire Station",
    icon: "Flame",
    color_hex: "#E67E22",
    is_emergency: true,
    sort_order: 4,
  },
  {
    slug: "town_hall",
    name_fr: "Mairies",
    name_en: "Town Halls",
    icon: "Building2",
    color_hex: "#8E44AD",
    is_emergency: false,
    sort_order: 5,
  },
  {
    slug: "bank",
    name_fr: "Banques",
    name_en: "Banks",
    icon: "Landmark",
    color_hex: "#16A085",
    is_emergency: false,
    sort_order: 6,
  },
  {
    slug: "atm",
    name_fr: "Distributeurs",
    name_en: "ATMs",
    icon: "CreditCard",
    color_hex: "#F39C12",
    is_emergency: false,
    sort_order: 7,
  },
  {
    slug: "gas_station",
    name_fr: "Stations-service",
    name_en: "Gas Stations",
    icon: "Fuel",
    color_hex: "#C0392B",
    is_emergency: false,
    sort_order: 8,
  },
  {
    slug: "post",
    name_fr: "Bureaux de poste",
    name_en: "Post Offices",
    icon: "Mail",
    color_hex: "#F1C40F",
    is_emergency: false,
    sort_order: 9,
  },
  {
    slug: "embassy",
    name_fr: "Ambassades",
    name_en: "Embassies",
    icon: "Globe",
    color_hex: "#2C3E50",
    is_emergency: false,
    sort_order: 10,
  },
  {
    slug: "university",
    name_fr: "Universités",
    name_en: "Universities",
    icon: "GraduationCap",
    color_hex: "#1A6B3A",
    is_emergency: false,
    sort_order: 11,
  },
  {
    slug: "church",
    name_fr: "Églises",
    name_en: "Churches",
    icon: "ChurchIcon",
    color_hex: "#7F8C8D",
    is_emergency: false,
    sort_order: 12,
  },
  {
    slug: "mosque",
    name_fr: "Mosquées",
    name_en: "Mosques",
    icon: "MoonStar",
    color_hex: "#16A085",
    is_emergency: false,
    sort_order: 13,
  },
] as const;

/* ============================================================
 * FONCTION PRINCIPALE DE SEED
 * ============================================================ */

async function main(): Promise<void> {
  console.log("🌱 Démarrage du seed de la base de données VIVRE...\n");

  /* --- 1. Seed des villes --- */
  console.log("📍 Seed des 10 villes du Burkina Faso...");
  const createdCities: Record<string, string> = {}; /* name → id */

  for (const cityData of CITIES_DATA) {
    const city = await prisma.city.upsert({
      where: { name: cityData.name } as { name: string }, /* Workaround: upsert by name */
      update: {
        latitude: cityData.latitude,
        longitude: cityData.longitude,
        has_transport: cityData.has_transport,
        has_food: cityData.has_food,
        has_drivers: cityData.has_drivers,
      },
      create: {
        ...cityData,
        country_code: "BFA",
        is_active: true,
      },
    });
    createdCities[cityData.name] = city.id;
    console.log(`  ✓ ${cityData.name} (${city.id})`);
  }

  /* --- 2. Seed des numéros d'urgence --- */
  console.log("\n🆘 Seed des numéros d'urgence...");
  for (const emergency of EMERGENCY_NUMBERS_DATA) {
    await prisma.emergencyNumber.upsert({
      where: { service_name: emergency.service_name },
      update: { number: emergency.number, sort_order: emergency.sort_order },
      create: {
        ...emergency,
        country_code: "BFA",
        is_active: true,
      },
    });
    console.log(`  ✓ ${emergency.service_name} → ${emergency.number}`);
  }

  /* --- 3. Seed des catégories de services publics --- */
  console.log("\n🏥 Seed des 13 catégories de services publics...");
  for (const category of SERVICE_CATEGORIES_DATA) {
    await prisma.publicServiceCategory.upsert({
      where: { slug: category.slug },
      update: {
        name_fr: category.name_fr,
        name_en: category.name_en,
        sort_order: category.sort_order,
      },
      create: {
        ...category,
        is_active: true,
      },
    });
    console.log(`  ✓ ${category.name_fr} (slug: ${category.slug})`);
  }

  /* --- 4. Compte administrateur VIVRE --- */
  console.log("\n👤 Création du compte administrateur...");
  const adminUser = await prisma.user.upsert({
    where: { phone: "+22600000000" },
    update: {},
    create: {
      phone: "+22600000000",
      email: "admin@vivre.bf",
      first_name: "Admin",
      last_name: "VIVRE",
      preferred_language: "fr",
      is_verified: true,
      is_active: true,
    },
  });

  /* Attribuer le rôle admin */
  await prisma.userRole.upsert({
    where: {
      user_id_role: {
        user_id: adminUser.id,
        role: "admin",
      },
    },
    update: { is_approved: true },
    create: {
      user_id: adminUser.id,
      role: "admin",
      is_approved: true,
      approved_at: new Date(),
    },
  });
  console.log(`  ✓ Admin créé : ${adminUser.email} (ID: ${adminUser.id})`);

  /* ============================================================
   * ATTRACTIONS TOURISTIQUES
   * ============================================================ */
  console.log("\n🗺️ Création des attractions touristiques...");

  const ouagaId = createdCities["Ouagadougou"];
  const boboDjoulassoId = createdCities["Bobo-Dioulasso"];
  const banforaId = createdCities["Banfora"];

  const attractionsData = [
    {
      city_id:              ouagaId,
      name:                 "Mémorial Thomas Sankara",
      category:             "heritage",
      description:          "Mémorial dédié au président révolutionnaire Thomas Sankara, érigé à Ouagadougou. Un lieu de mémoire incontournable pour comprendre l'histoire contemporaine du Burkina Faso.",
      address:              "Avenue de l'Unité Africaine, Ouagadougou",
      latitude:             12.3703,
      longitude:            -1.5247,
      entry_fee_fcfa:       0,
      visit_duration_hours: 1.0,
      best_season:          "Novembre à Mars",
      is_featured:          true,
      is_active:            true,
    },
    {
      city_id:              ouagaId,
      name:                 "Grand Marché Rood-Woko",
      category:             "urban",
      description:          "Le plus grand marché de Ouagadougou, véritable cœur économique de la ville. Tissus bogolan, artisanat local, épices et vie authentique burkinabè.",
      address:              "Centre-ville, Ouagadougou",
      latitude:             12.3659,
      longitude:            -1.5218,
      entry_fee_fcfa:       0,
      visit_duration_hours: 2.0,
      best_season:          "Toute l'année",
      is_featured:          true,
      is_active:            true,
    },
    {
      city_id:              ouagaId,
      name:                 "FESPACO — Festival Panafricain du Cinéma",
      category:             "culture",
      description:          "Le plus grand festival de cinéma d'Afrique, organisé à Ouagadougou tous les deux ans. Des centaines de films africains projetés dans toute la ville pendant une semaine.",
      address:              "CENASA, Avenue Babanguida, Ouagadougou",
      latitude:             12.3612,
      longitude:            -1.5332,
      entry_fee_fcfa:       1000,
      visit_duration_hours: 3.0,
      best_season:          "Février (années impaires)",
      is_featured:          true,
      is_active:            true,
    },
    {
      city_id:              boboDjoulassoId ?? null,
      name:                 "Mosquée de Dioulassoba",
      category:             "heritage",
      description:          "L'une des plus belles mosquées soudano-sahéliennes du Burkina Faso, construite en banco (argile) au cœur du vieux quartier de Bobo-Dioulasso. Architecture remarquable classée.",
      address:              "Quartier Dioulassoba, Bobo-Dioulasso",
      latitude:             11.1771,
      longitude:            -4.2979,
      entry_fee_fcfa:       500,
      visit_duration_hours: 1.0,
      best_season:          "Novembre à Février",
      is_unesco:            false,
      is_featured:          true,
      is_active:            true,
    },
    {
      city_id:              banforaId ?? null,
      name:                 "Cascades de Karfiguela",
      category:             "nature",
      description:          "Chutes d'eau spectaculaires en pleine brousse burkinabè, à quelques kilomètres de Banfora. Un havre de fraîcheur entouré de bambous géants et de manguiers. Site naturel emblématique.",
      address:              "Karfiguela, à 12km de Banfora",
      latitude:             10.7027,
      longitude:            -4.6856,
      entry_fee_fcfa:       500,
      entry_fee_tourist:    1000,
      visit_duration_hours: 2.5,
      best_season:          "Août à Novembre (saison des pluies)",
      is_featured:          true,
      is_active:            true,
    },
    {
      city_id:              banforaId ?? null,
      name:                 "Dômes de Fabédougou",
      category:             "nature",
      description:          "Formations rocheuses naturelles uniques ressemblant à des dômes, sculptées par l'érosion sur des millions d'années. Paysage lunaire au cœur du Burkina Faso.",
      address:              "Fabédougou, à 10km de Banfora",
      latitude:             10.6891,
      longitude:            -4.7156,
      entry_fee_fcfa:       500,
      visit_duration_hours: 1.5,
      best_season:          "Novembre à Avril",
      is_featured:          false,
      is_active:            true,
    },
    {
      city_id:              ouagaId,
      name:                 "SIAO — Salon International de l'Artisanat",
      category:             "culture",
      description:          "Le plus grand salon d'artisanat d'Afrique subsaharienne, tenu à Ouagadougou tous les deux ans. Tissage, sculpture, bijouterie, maroquinerie de toute l'Afrique.",
      address:              "SIAO, Ouagadougou",
      latitude:             12.3450,
      longitude:            -1.5122,
      entry_fee_fcfa:       500,
      visit_duration_hours: 4.0,
      best_season:          "Octobre-Novembre (années paires)",
      is_featured:          false,
      is_active:            true,
    },
  ];

  for (const attraction of attractionsData) {
    if (!attraction.city_id) continue;
    await prisma.attraction.upsert({
      where: { id: `seed-${attraction.name.toLowerCase().replace(/\s+/g, "-").slice(0, 30)}` },
      update: {},
      create: {
        id:                   `seed-${attraction.name.toLowerCase().replace(/\s+/g, "-").slice(0, 30)}`,
        city_id:              attraction.city_id,
        name:                 attraction.name,
        category:             attraction.category,
        description:          attraction.description,
        address:              attraction.address ?? null,
        latitude:             attraction.latitude,
        longitude:            attraction.longitude,
        entry_fee_fcfa:       attraction.entry_fee_fcfa,
        entry_fee_tourist:    "entry_fee_tourist" in attraction ? (attraction.entry_fee_tourist ?? null) : null,
        visit_duration_hours: attraction.visit_duration_hours,
        best_season:          attraction.best_season ?? null,
        is_unesco:            "is_unesco" in attraction ? (attraction.is_unesco ?? false) : false,
        is_featured:          attraction.is_featured,
        is_active:            attraction.is_active,
      },
    });
  }
  console.log(`  ✓ ${attractionsData.filter((a) => a.city_id).length} attractions créées`);

  /* ============================================================
   * LIGNES DE BUS URBAIN (SOTRACO — Ouagadougou)
   * ============================================================ */
  console.log("\n🚌 Création des lignes SOTRACO...");

  if (ouagaId) {
    const sotractoLines = [
      {
        id:                "sotraco-01",
        city_id:           ouagaId,
        line_number:       "01",
        line_name:         "Gounghin — Zogona",
        operator_name:     "SOTRACO",
        color_hex:         "#1A6B3A",
        fare_fcfa:         200,
        frequency_minutes: 20,
        is_active:         true,
        stops: [
          { name: "Gare de Ouagadougou",     sequence_order: 1, latitude: 12.3588, longitude: -1.5266 },
          { name: "Rond-point des Nations",  sequence_order: 2, latitude: 12.3621, longitude: -1.5214 },
          { name: "Place de la Révolution",  sequence_order: 3, latitude: 12.3659, longitude: -1.5218 },
          { name: "Hôpital Yalgado",         sequence_order: 4, latitude: 12.3701, longitude: -1.5135 },
          { name: "Quartier Gounghin",       sequence_order: 5, latitude: 12.3750, longitude: -1.5050 },
          { name: "Terminus Zogona",         sequence_order: 6, latitude: 12.3812, longitude: -1.4980 },
        ],
      },
      {
        id:                "sotraco-02",
        city_id:           ouagaId,
        line_number:       "02",
        line_name:         "Patte d'Oie — Dapoya",
        operator_name:     "SOTRACO",
        color_hex:         "#EF2B2D",
        fare_fcfa:         200,
        frequency_minutes: 25,
        is_active:         true,
        stops: [
          { name: "Terminus Patte d'Oie",    sequence_order: 1, latitude: 12.3412, longitude: -1.5580 },
          { name: "Rond-point de l'Europe",  sequence_order: 2, latitude: 12.3480, longitude: -1.5500 },
          { name: "Avenue Kwamé N'Krumah",   sequence_order: 3, latitude: 12.3560, longitude: -1.5400 },
          { name: "Marché Central Rood-Woko",sequence_order: 4, latitude: 12.3659, longitude: -1.5218 },
          { name: "Quartier Dapoya",         sequence_order: 5, latitude: 12.3720, longitude: -1.5160 },
          { name: "Terminus Dapoya",         sequence_order: 6, latitude: 12.3780, longitude: -1.5100 },
        ],
      },
      {
        id:                "sotraco-03",
        city_id:           ouagaId,
        line_number:       "03",
        line_name:         "Tampouy — Pissy",
        operator_name:     "SOTRACO",
        color_hex:         "#F5A623",
        fare_fcfa:         200,
        frequency_minutes: 30,
        is_active:         true,
        stops: [
          { name: "Terminus Tampouy",        sequence_order: 1, latitude: 12.4010, longitude: -1.5320 },
          { name: "Secteur 17",              sequence_order: 2, latitude: 12.3900, longitude: -1.5310 },
          { name: "Université de Ouaga",     sequence_order: 3, latitude: 12.3820, longitude: -1.5290 },
          { name: "Centre médical CHU-SS",   sequence_order: 4, latitude: 12.3730, longitude: -1.5270 },
          { name: "Carrefour Pissy",         sequence_order: 5, latitude: 12.3540, longitude: -1.5480 },
          { name: "Terminus Pissy",          sequence_order: 6, latitude: 12.3450, longitude: -1.5580 },
        ],
      },
    ];

    for (const line of sotractoLines) {
      const { stops, ...lineData } = line;
      const createdLine = await prisma.urbanLine.upsert({
        where: { id: lineData.id },
        update: {},
        create: lineData,
      });

      for (const stop of stops) {
        await prisma.urbanStop.upsert({
          where: { id: `${createdLine.id}-stop-${stop.sequence_order}` },
          update: {},
          create: {
            id:             `${createdLine.id}-stop-${stop.sequence_order}`,
            line_id:        createdLine.id,
            name:           stop.name,
            sequence_order: stop.sequence_order,
            latitude:       stop.latitude,
            longitude:      stop.longitude,
          },
        });
      }
    }
    console.log(`  ✓ 3 lignes SOTRACO créées (${sotractoLines.reduce((acc, l) => acc + l.stops.length, 0)} arrêts)`);
  }

  /* --- Résumé final --- */
  console.log("\n✅ Seed terminé avec succès !");
  console.log("📊 Résumé :");
  console.log(`  - ${CITIES_DATA.length} villes créées`);
  console.log(`  - ${EMERGENCY_NUMBERS_DATA.length} numéros d'urgence créés`);
  console.log(`  - ${SERVICE_CATEGORIES_DATA.length} catégories de services créées`);
  console.log(`  - 1 compte administrateur créé`);
  console.log(`  - 7 attractions touristiques créées`);
  console.log(`  - 3 lignes SOTRACO créées`);
  console.log("\n🔑 Compte admin :");
  console.log(`  Phone  : +226 00 00 00 00`);
  console.log(`  Email  : admin@vivre.bf`);
  console.log(`  OTP    : utiliser POST /auth/send-otp pour se connecter`);

  /* Afficher l'UUID de Ouagadougou pour le mettre dans .env.local */
  if (ouagaId) {
    console.log(`\n📌 Mettre à jour .env.local :`);
    console.log(`  NEXT_PUBLIC_DEFAULT_CITY="${ouagaId}"`);
  }
}

/* Exécution du seed avec gestion des erreurs */
main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error("❌ Erreur lors du seed :", error);
    await prisma.$disconnect();
    process.exit(1);
  });
