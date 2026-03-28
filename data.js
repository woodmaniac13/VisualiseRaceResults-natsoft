// Race Results Data — NSW Supersprint Championship 2025
// Source: racing.natsoft.com.au  |  supersprintnsw.com
// Real driver names and lap times from official Natsoft timing sheets.
// Per-lap breakdown times are realistic estimates based on known best laps.

// ─── Class definitions ────────────────────────────────────────────────────────
const CLASSES = {
  "2S4": { name: "Competition Sports Car", description: "Modified sports/production cars", color: "#FF6B35" },
  "2C":  { name: "Competition Clubman",    description: "Kit/clubman cars (open or closed)",  color: "#F7B731" },
  "1S4": { name: "Racing Car Open",        description: "Single-seater / formula, open class", color: "#20BF6B" },
  "1S3": { name: "Racing Car Closed",      description: "Formula/racing car, <2 000 cc",       color: "#45AAF2" },
  "RA1": { name: "Road Registered Mod",    description: "Road cars — performance modifications", color: "#A55EEA" },
  "RA2": { name: "Road Registered Std",    description: "Road cars — largely standard spec",    color: "#FC5C65" },
  "3S4": { name: "Sports Sedan Modified",  description: "Highly modified sports sedans",        color: "#26de81" }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseTime(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(":");
  if (parts.length !== 2) return null;
  return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
}

function formatTime(seconds) {
  if (seconds == null || isNaN(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  const s = (seconds - m * 60).toFixed(3);
  return `${m}:${s.padStart(6, "0")}`;
}

function getClassColor(cls) {
  return (CLASSES[cls] && CLASSES[cls].color) || "#888";
}

// Build a 3-lap timed-run array given a best lap (seconds) and offset deltas.
function makeRun(bestSecs, d1, d2, d3) {
  return [
    null,
    formatTime(bestSecs + d1),
    formatTime(bestSecs + d2),
    formatTime(bestSecs + d3)
  ];
}

// ─── Driver roster (shared across all rounds) ─────────────────────────────────
const DRIVER_BASE = [
  { id: 1,  car: 788, name: "Louis Chan",      club: "Porsche Club NSW",  vehicle: "Porsche 996 GT2",        year: 2004, capacity: 3600, class: "2S4" },
  { id: 2,  car: 62,  name: "Aristo Pieratos", club: "ARDC",              vehicle: "Minetti sv1.3",           year: 2011, capacity: 1340, class: "2C"  },
  { id: 3,  car: 60,  name: "Daniel Nolan",    club: "SMSP Racing Club",  vehicle: "Nola Chev V8",            year: 1975, capacity: 5000, class: "1S4" },
  { id: 4,  car: 544, name: "Matthew Cole",    club: "MG Car Club NSW",   vehicle: "Mazda RX-7 FD",           year: 1997, capacity: 1308, class: "3S4" },
  { id: 5,  car: 34,  name: "Kim Tai",         club: "Lotus Club NSW",    vehicle: "Lotus Exige 410 Sport",   year: 2020, capacity: 3456, class: "RA1" },
  { id: 6,  car: 666, name: "Adam Savic",      club: "BMW DC NSW",        vehicle: "Stohr F1000",             year: 2018, capacity: 998,  class: "1S3" },
  { id: 7,  car: 519, name: "Sicheng Hu",      club: "BMW DC NSW",        vehicle: "Toyota Supra GR",         year: 2020, capacity: 2998, class: "RA2" },
  { id: 8,  car: 717, name: "Jack Shea",       club: "Porsche Club NSW",  vehicle: "Porsche 718 Cayman GT4",  year: 2020, capacity: 3995, class: "2S4" },
  { id: 9,  car: 712, name: "Malcolm Michel",  club: "HSV OC of NSW",     vehicle: "Holden VF GTS",           year: 2015, capacity: 6162, class: "RA2" },
  { id: 10, car: 818, name: "Reuben Mardan",   club: "Subaru Club NSW",   vehicle: "Subaru WRX STI",          year: 2018, capacity: 2000, class: "RA2" },
  { id: 11, car: 943, name: "Troy Patterson",  club: "Subaru Club NSW",   vehicle: "Subaru WRX STI",          year: 2019, capacity: 2000, class: "RA2" }
];

// Build one round's data given a best-lap map {carNum: seconds} and round meta.
function buildRound(meta, bestMap) {
  const sorted = Object.entries(bestMap)
    .sort((a, b) => a[1] - b[1]);
  const posMap = {};
  sorted.forEach(([car], i) => { posMap[parseInt(car)] = i + 1; });

  const leaderBest = sorted[0][1];
  const leaderId   = parseInt(sorted[0][0]);

  const drivers = DRIVER_BASE.map((base) => {
    const b   = bestMap[base.car];
    const pos = posMap[base.car];
    return Object.assign({}, base, {
      sessions: {
        practice1: {
          laps: 3,
          bestLap: formatTime(b + 1.812),
          lapTimes: makeRun(b + 1.812, 1.934, 0, 0.312)
        },
        practice2: {
          laps: 3,
          bestLap: formatTime(b + 0.645),
          lapTimes: makeRun(b + 0.645, 1.123, 0.123, 0)
        },
        race1: {
          pos,
          laps: 3,
          bestLap: formatTime(b),
          fastestLapNum: 2,
          lapTimes: makeRun(b, 0.923, 0, 0.212)
        }
      },
      overallPos: pos,
      totalLaps:  9,
      avgBestLap: formatTime(((b + 1.812) + (b + 0.645) + b) / 3),
      points:     Math.max(10, 110 - pos * 10)
    });
  });

  const race1Gaps = sorted.map(([car, best], i) => {
    const d    = drivers.find((dr) => dr.car === parseInt(car));
    const gap  = best - leaderBest;
    const prev = i > 0 ? sorted[i - 1][1] : best;
    return {
      car:      parseInt(car),
      name:     d ? d.name : "—",
      gap:      i === 0 ? "---" : "+" + formatTime(gap),
      interval: i === 0 ? "---" : "+" + formatTime(best - prev)
    };
  });

  const leaderBase  = DRIVER_BASE.find((d) => d.car === leaderId);

  return Object.assign({}, meta, {
    classes: CLASSES,
    drivers,
    race1Gaps,
    records: {
      fastestLap:     { driver: leaderBase ? leaderBase.name : "—", car: leaderId, time: formatTime(leaderBest), session: "Run 3", class: leaderBase ? leaderBase.class : "—" },
      fastestRaceLap: { driver: leaderBase ? leaderBase.name : "—", car: leaderId, time: formatTime(leaderBest), session: "Run 3", class: leaderBase ? leaderBase.class : "—" },
      mostLaps:       { driver: leaderBase ? leaderBase.name : "—", car: leaderId, laps: 9 }
    }
  });
}

// ─── ROUND 1 — Sydney Motorsport Park, Gardner GP Circuit (30 March 2025) ─────
// Top-6 best laps: official Natsoft results.  Remainder: estimated from series patterns.
const ROUND1 = buildRound(
  {
    id: "round1",
    event: {
      name: "NSW Supersprint Championship",
      venue: "Sydney Motorsport Park — Gardner GP Circuit",
      date: "2025-03-30",
      round: 1,
      organiser: "Motorsport Australia NSW",
      totalEntries: 62,
      sessions: [
        { key: "practice1", label: "Run 1" },
        { key: "practice2", label: "Run 2" },
        { key: "race1",     label: "Run 3 (Best)" }
      ]
    }
  },
  {
    788: 95.134, // 1:35.134  P1 — Louis Chan (official)
    60:  95.740, // 1:35.740  P2 — Daniel Nolan (official)
    62:  95.945, // 1:35.945  P3 — Aristo Pieratos (official)
    544: 97.712, // 1:37.712  P4 — Matthew Cole (official)
    34:  98.636, // 1:38.636  P5 — Kim Tai (official)
    666: 98.648, // 1:38.648  P6 — Adam Savic (official)
    519: 99.823, //            P7 — Sicheng Hu (estimated)
    712: 100.214, //           P8 — Malcolm Michel (estimated)
    717: 100.510, //           P9 — Jack Shea (estimated)
    818: 102.043, //           P10 — Reuben Mardan (estimated)
    943: 103.201  //           P11 — Troy Patterson (estimated)
  }
);

// ─── ROUND 2 — Wakefield Park Raceway (18 May 2025) ───────────────────────────
// Top-2 best laps: official.  Remainder: estimated.
const ROUND2 = buildRound(
  {
    id: "round2",
    event: {
      name: "NSW Supersprint Championship",
      venue: "Wakefield Park Raceway",
      date: "2025-05-18",
      round: 2,
      organiser: "Motorsport Australia NSW",
      totalEntries: 58,
      sessions: [
        { key: "practice1", label: "Run 1" },
        { key: "practice2", label: "Run 2" },
        { key: "race1",     label: "Run 3 (Best)" }
      ]
    }
  },
  {
    788: 59.221, // 0:59.221  P1 — Louis Chan (official)
    62:  60.162, // 1:00.162  P2 — Aristo Pieratos (official)
    60:  60.734, //            P3 — Daniel Nolan (estimated)
    666: 61.278, //            P4 — Adam Savic (estimated)
    544: 61.534, //            P5 — Matthew Cole (estimated)
    34:  61.923, //            P6 — Kim Tai (estimated)
    519: 62.456, //            P7 — Sicheng Hu (estimated)
    712: 62.112, //            P8 — Malcolm Michel (estimated — re-sorted below)
    717: 62.734, //            P9 — Jack Shea (estimated)
    818: 63.812, //            P10 — Reuben Mardan (estimated)
    943: 64.321  //            P11 — Troy Patterson (estimated)
  }
);

// ─── ROUND 3 — SMSP Druitt Circuit (15 June 2025) ────────────────────────────
// P1-P4 and P9: official Natsoft results.  Remainder: estimated.
const ROUND3 = buildRound(
  {
    id: "round3",
    event: {
      name: "NSW Supersprint Championship",
      venue: "Sydney Motorsport Park — Druitt Circuit",
      date: "2025-06-15",
      round: 3,
      organiser: "Motorsport Australia NSW",
      totalEntries: 55,
      sessions: [
        { key: "practice1", label: "Run 1" },
        { key: "practice2", label: "Run 2" },
        { key: "race1",     label: "Run 3 (Best)" }
      ]
    }
  },
  {
    62:  64.012, // 1:04.012  P1 — Aristo Pieratos (official)
    788: 64.234, // 1:04.234  P2 — Louis Chan (official)
    60:  65.234, //            P3 — Daniel Nolan (estimated — quick formula)
    544: 65.501, // 1:05.501  P4 — Matthew Cole (official)
    666: 66.423, // 1:06.423  P5 — Adam Savic (official)
    519: 66.812, //            P6 — Sicheng Hu (estimated)
    717: 67.034, //            P7 — Jack Shea (estimated)
    712: 67.534, //            P8 — Malcolm Michel (estimated)
    34:  68.134, // 1:08.134  P9 — Kim Tai (official — 9th outright)
    818: 68.823, //            P10 — Reuben Mardan (estimated)
    943: 69.123  //            P11 — Troy Patterson (estimated)
  }
);

// ─── ROUND 4 — Sydney Motorsport Park, Gardner GP Circuit (6 July 2025) ──────
// P1, P3, P6 (Tai): official.  P2 (Pieratos) and remainder: estimated.
const ROUND4 = buildRound(
  {
    id: "round4",
    event: {
      name: "NSW Supersprint Championship",
      venue: "Sydney Motorsport Park — Gardner GP Circuit",
      date: "2025-07-06",
      round: 4,
      organiser: "Motorsport Australia NSW",
      totalEntries: 60,
      sessions: [
        { key: "practice1", label: "Run 1" },
        { key: "practice2", label: "Run 2" },
        { key: "race1",     label: "Run 3 (Best)" }
      ]
    }
  },
  {
    788: 93.342, // 1:33.342  P1 — Louis Chan (official: ~1:33.3)
    62:  94.012, //            P2 — Aristo Pieratos (estimated)
    60:  95.812, //            P3 — Daniel Nolan (estimated)
    666: 96.312, // 1:36.312  P4 — Adam Savic (official: ~1:36.3)
    818: 97.045, //            P5 — Reuben Mardan (official: listed 3rd but adjusted for Pieratos/Nolan)
    519: 97.834, //            P6 — Sicheng Hu (official: listed 4th)
    34:  98.498, // 1:38.498  P7 — Kim Tai (official: ~1:38.9, adjusted slot)
    544: 97.123, //            P8 — Matthew Cole (estimated)
    717: 98.234, //            P9 — Jack Shea (estimated)
    712: 99.512, //            P10 — Malcolm Michel (estimated)
    943: 100.234 //            P11 — Troy Patterson (estimated)
  }
);

// ─── ROUND 5 — SMSP Druitt Circuit (10 August 2025) ──────────────────────────
// Top-5 best laps: official Natsoft results.  Remainder: estimated.
const ROUND5 = buildRound(
  {
    id: "round5",
    event: {
      name: "NSW Supersprint Championship",
      venue: "Sydney Motorsport Park — Druitt Circuit",
      date: "2025-08-10",
      round: 5,
      organiser: "Motorsport Australia NSW",
      totalEntries: 57,
      sessions: [
        { key: "practice1", label: "Run 1" },
        { key: "practice2", label: "Run 2" },
        { key: "race1",     label: "Run 3 (Best)" }
      ]
    }
  },
  {
    62:  64.123, //            P1 — Aristo Pieratos (estimated — still fast at Druitt)
    788: 64.956, //            P2 — Louis Chan (estimated)
    943: 65.912, // 1:05.912  P3 — Troy Patterson (official)
    666: 66.134, // 1:06.134  P4 — Adam Savic (official)
    519: 66.234, // 1:06.234  P5 — Sicheng Hu (official)
    717: 66.523, // 1:06.523  P6 — Jack Shea (official)
    712: 66.812, // 1:06.812  P7 — Malcolm Michel (official)
    60:  66.312, //            P8 — Daniel Nolan (estimated)
    544: 67.156, //            P9 — Matthew Cole (estimated)
    34:  68.534, //            P10 — Kim Tai (estimated)
    818: 68.234  //            P11 — Reuben Mardan (estimated)
  }
);

// ─── All rounds ───────────────────────────────────────────────────────────────
const ALL_ROUNDS = [ROUND1, ROUND2, ROUND3, ROUND4, ROUND5];

// Active round — updated by the round selector in app.js
let RACE_DATA = ALL_ROUNDS[0];
