/* ============================================
   Race Results Visualiser - Main Application
   ============================================ */

(function () {
  "use strict";

  // ─── State ────────────────────────────────
  let currentPanel = "overview";
  let selectedSession = "race1";
  let sortCol = "pos";
  let sortDir = "asc";
  let filterClass = "all";
  let filterSearch = "";
  let compareDriverA = 0;
  let compareDriverB = 1;
  let forcedSessionKey = null;
  let selectedDriverId = null;
  let charts = {};

  // Chart color palette
  const PALETTE = [
    "#e8b84b", "#ff6b35", "#4facfe", "#26de81",
    "#a855f7", "#fc5c65", "#fd9644", "#45aaf2",
    "#20bf6b", "#eb3b5a", "#8854d0", "#2bcbba"
  ];

  // Dynamic y-axis floor for the active round (fastest race lap minus 3 s buffer)
  function chartMinTime() {
    const sessionKey = getPrimarySessionKey();
    const times = RACE_DATA.drivers
      .map((d) => parseTime(d.sessions[sessionKey]?.bestLap))
      .filter(Boolean);
    return times.length ? Math.floor(Math.min(...times)) - 3 : 55;
  }

  function getAvailableSessionKeys() {
    if (!RACE_DATA || !Array.isArray(RACE_DATA.drivers)) return [];
    const keys = new Set();
    RACE_DATA.drivers.forEach((d) => {
      Object.keys(d.sessions || {}).forEach((k) => keys.add(k));
    });
    return [...keys];
  }

  function getPrimarySessionKey() {
    const available = getAvailableSessionKeys();
    if (forcedSessionKey && available.includes(forcedSessionKey)) return forcedSessionKey;
    const preferred = ["race1", "race2", "qualifying", "practice2", "practice1"];
    return preferred.find((k) => available.includes(k)) || available[0] || "race1";
  }

  function normalizeToken(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function resolveSessionKey(token) {
    if (!token) return null;
    const normToken = normalizeToken(token);
    const available = getAvailableSessionKeys();
    return available.find((key) => {
      const normKey = normalizeToken(key);
      const normLabel = normalizeToken(getSessionLabel(key));
      return normKey === normToken || normLabel === normToken;
    }) || null;
  }

  function parseLinkState() {
    const params = new URLSearchParams(window.location.search);
    const panel = params.get("panel") || params.get("view");
    const roundRaw = (params.get("round") || params.get("r") || "").trim();
    const sessionRaw = params.get("session") || params.get("s");

    let roundIndex = 0;
    if (roundRaw) {
      const numeric = Number(roundRaw);
      if (Number.isFinite(numeric)) {
        if (numeric >= 1 && numeric <= ALL_ROUNDS.length) roundIndex = numeric - 1;
        else if (numeric >= 0 && numeric < ALL_ROUNDS.length) roundIndex = numeric;
      } else {
        const target = roundRaw.toLowerCase();
        const byId = ALL_ROUNDS.findIndex((r) => String(r.id || "").toLowerCase() === target);
        const byPhase = ALL_ROUNDS.findIndex((r) => String(r.event?.phaseLabel || "").toLowerCase() === target);
        if (byId >= 0) roundIndex = byId;
        else if (byPhase >= 0) roundIndex = byPhase;
      }
    }

    return {
      panel: panel ? String(panel).toLowerCase() : null,
      roundIndex,
      sessionToken: sessionRaw,
      driverAToken: params.get("driverA") || params.get("a"),
      driverBToken: params.get("driverB") || params.get("b")
    };
  }

  function resolveDriverToken(token) {
    if (!token) return null;
    const raw = String(token).trim();
    const numeric = Number(raw.replace(/^#/, ""));
    if (Number.isFinite(numeric)) {
      return RACE_DATA.drivers.find((d) => d.id === numeric)
        || RACE_DATA.drivers.find((d) => d.car === numeric)
        || null;
    }

    const norm = normalizeToken(raw);
    return RACE_DATA.drivers.find((d) => normalizeToken(d.name) === norm)
      || RACE_DATA.drivers.find((d) => normalizeToken(d.name).includes(norm))
      || null;
  }

  function syncShareUrl(replace = true) {
    if (!window.history || !window.location) return;
    const params = new URLSearchParams();

    const roundSelector = document.getElementById("round-selector");
    let roundIndex = roundSelector ? parseInt(roundSelector.value, 10) : ALL_ROUNDS.findIndex((r) => r === RACE_DATA);
    if (!Number.isFinite(roundIndex) || roundIndex < 0) roundIndex = 0;

    params.set("panel", currentPanel || "overview");
    params.set("round", String(roundIndex + 1));
    params.set("session", getPrimarySessionKey());

    const dA = RACE_DATA.drivers.find((d) => d.id === compareDriverA);
    const dB = RACE_DATA.drivers.find((d) => d.id === compareDriverB);
    if (dA) params.set("driverA", String(dA.car));
    if (dB) params.set("driverB", String(dB.car));

    const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash || ""}`;
    if (replace) window.history.replaceState({}, "", newUrl);
    else window.history.pushState({}, "", newUrl);
  }

  function applyLinkState(state) {
    if (!state) return;

    const resolvedSession = resolveSessionKey(state.sessionToken);
    if (resolvedSession) forcedSessionKey = resolvedSession;

    const wantsCompare = state.panel === "compare" || state.driverAToken || state.driverBToken;
    if (wantsCompare) {
      const selA = document.getElementById("compare-driver-a");
      const selB = document.getElementById("compare-driver-b");
      const driverA = resolveDriverToken(state.driverAToken) || RACE_DATA.drivers[0];
      const fallbackB = RACE_DATA.drivers.find((d) => d.id !== driverA?.id) || RACE_DATA.drivers[1] || driverA;
      const driverB = resolveDriverToken(state.driverBToken) || fallbackB;

      if (driverA) compareDriverA = driverA.id;
      if (driverB) compareDriverB = driverB.id;

      if (selA && compareDriverA) selA.value = String(compareDriverA);
      if (selB && compareDriverB) selB.value = String(compareDriverB);
      refreshComparison();
      activatePanel("compare");
      return;
    }

    const allowedPanels = new Set(["overview", "results", "laps", "classes", "compare", "gaps", "drivers"]);
    if (state.panel && allowedPanels.has(state.panel)) {
      activatePanel(state.panel);
    }
  }

  function getSessionLabel(sessionKey) {
    const found = (RACE_DATA.event.sessions || []).find((s) => s.key === sessionKey);
    return found?.label || RACE_DATA.event.phaseLabel || sessionKey;
  }

  function getTopDriversBySession(limit, sessionKey) {
    const rows = RACE_DATA.drivers
      .filter((d) => d.sessions[sessionKey])
      .slice()
      .sort((a, b) => {
        const pa = a.sessions[sessionKey]?.pos ?? 999;
        const pb = b.sessions[sessionKey]?.pos ?? 999;
        if (pa !== pb) return pa - pb;
        const ta = parseTime(a.sessions[sessionKey]?.bestLap) ?? Number.POSITIVE_INFINITY;
        const tb = parseTime(b.sessions[sessionKey]?.bestLap) ?? Number.POSITIVE_INFINITY;
        return ta - tb;
      });
    return rows.slice(0, limit);
  }

  function getSessionLapObjects(driver, sessionKey) {
    const laps = (driver.sessions[sessionKey]?.lapTimes || [])
      .slice(1)
      .map((lap, i) => ({ lapNo: i + 1, time: parseTime(lap) }))
      .filter((x) => Boolean(x.time));
    if (!laps.length) return [];
    const best = Math.min(...laps.map((x) => x.time));
    const cutoff = best + 20;
    return laps.filter((x) => x.time <= cutoff);
  }

  function getLapTimesSeconds(driver, sessionKey) {
    return getSessionLapObjects(driver, sessionKey).map((x) => x.time);
  }

  function parseGapSeconds(gapText) {
    if (!gapText || gapText === "---" || gapText === "-") return null;
    const cleaned = String(gapText).trim().replace("+", "");
    if (cleaned.startsWith("-")) return null;
    const secs = parseTime(cleaned);
    if (!Number.isFinite(secs) || secs < 0) return null;
    return secs;
  }

  function calcStdDev(values) {
    if (!values || values.length < 2) return null;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  function bestRollingAverage(values, windowSize) {
    if (!values || values.length < windowSize) return null;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i <= values.length - windowSize; i++) {
      const slice = values.slice(i, i + windowSize);
      const avg = slice.reduce((a, b) => a + b, 0) / windowSize;
      if (avg < best) best = avg;
    }
    return Number.isFinite(best) ? best : null;
  }

  function getAttackWindow(driver, sessionKey, windowSize) {
    const laps = getSessionLapObjects(driver, sessionKey);
    if (!laps.length || laps.length < windowSize) return null;
    let bestAvg = Number.POSITIVE_INFINITY;
    let bestStart = 0;
    for (let i = 0; i <= laps.length - windowSize; i++) {
      const slice = laps.slice(i, i + windowSize);
      const avg = slice.reduce((s, x) => s + x.time, 0) / windowSize;
      if (avg < bestAvg) {
        bestAvg = avg;
        bestStart = i;
      }
    }
    if (!Number.isFinite(bestAvg)) return null;
    return {
      avg: bestAvg,
      startLap: laps[bestStart].lapNo,
      endLap: laps[bestStart + windowSize - 1].lapNo,
      size: windowSize
    };
  }

  // ─── Init ──────────────────────────────────
  function init() {
    const linkState = parseLinkState();
    buildRoundSelector(linkState.roundIndex);
    buildResultClassFilterOptions();
    attachResultsEvents();
    attachNavEvents();
    activatePanel("overview");

    // Keep navigation usable even if one panel renderer fails.
    try {
      renderAll();
      applyLinkState(linkState);
      syncShareUrl(true);
    } catch (err) {
      console.error("Render error:", err);
    }
  }

  // Build the round selector dropdown from ALL_ROUNDS
  function buildRoundSelector(initialRoundIndex = 0) {
    const sel = document.getElementById("round-selector");
    if (!sel) return;
    sel.innerHTML = ALL_ROUNDS.map((r, i) => {
      const d = new Date(r.event.date);
      const testName = r.event.name || (r.event.phaseLabel || `Round ${r.event.round}`);
      const label = `${testName} (${d.toLocaleDateString("en-AU", { day: "numeric", month: "short" })})`;
      return `<option value="${i}">${label}</option>`;
    }).join("");
    const safeIndex = Math.min(Math.max(initialRoundIndex, 0), Math.max(ALL_ROUNDS.length - 1, 0));
    sel.value = String(safeIndex);
    if (ALL_ROUNDS[safeIndex]) RACE_DATA = ALL_ROUNDS[safeIndex];
    sel.addEventListener("change", (e) => {
      RACE_DATA = ALL_ROUNDS[parseInt(e.target.value)];
      selectedSession = "race1";
      filterClass = "all";
      filterSearch = "";
      reloadData();
    });
  }

  // Re-render everything (called when round changes)
  function reloadData() {
    // Destroy all existing charts
    Object.values(charts).forEach((c) => { if (c && c.destroy) c.destroy(); });
    charts = {};
    renderAll();
    // Keep this for compatibility if the run selector exists in older markup.
    const sessionSel = document.getElementById("result-session-select");
    if (sessionSel) sessionSel.value = "race1";
    const classFilter = document.getElementById("result-class-filter");
    if (classFilter) classFilter.value = "all";
    buildResultClassFilterOptions();
    const searchInput = document.getElementById("result-search");
    if (searchInput) searchInput.value = "";
    activatePanel(currentPanel);
    syncShareUrl(true);
  }

  function buildResultClassFilterOptions() {
    const filter = document.getElementById("result-class-filter");
    if (!filter || !RACE_DATA || !RACE_DATA.classes) return;

    const classes = Object.keys(RACE_DATA.classes).sort((a, b) => a.localeCompare(b));
    const previous = filter.value || "all";
    filter.innerHTML = [
      '<option value="all">All Classes</option>',
      ...classes.map((cls) => `<option value="${cls}">${cls}</option>`)
    ].join("");

    filter.value = classes.includes(previous) ? previous : "all";
  }

  function renderAll() {
    renderEventHero();
    renderOverview();
    renderResults();
    renderLapAnalysis();
    renderClassAnalysis();
    renderDriverComparison();
    renderGapAnalysis();
    renderDriverProfiles();
  }

  // ─── Navigation ───────────────────────────
  function activatePanel(id) {
    currentPanel = id;
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    document.querySelectorAll(".nav-tab").forEach((t) => t.classList.remove("active"));
    const panel = document.getElementById("panel-" + id);
    const tabs = document.querySelectorAll(`[data-panel="${id}"]`);
    if (panel) panel.classList.add("active");
    tabs.forEach((tab) => tab.classList.add("active"));

    // Trigger chart resize for visibility changes
    setTimeout(() => {
      Object.values(charts).forEach((c) => c && c.resize && c.resize());
    }, 50);

    syncShareUrl(true);
  }

  function attachNavEvents() {
    const closeMobileMenu = () => {
      const mobileBtn = document.getElementById("mobile-menu-btn");
      const mobileMenu = document.getElementById("mobile-menu");
      if (!mobileBtn || !mobileMenu) return;
      mobileMenu.style.display = "none";
      mobileBtn.classList.remove("is-open");
      mobileBtn.setAttribute("aria-expanded", "false");
      mobileBtn.setAttribute("aria-label", "Open menu");
    };

    document.querySelectorAll(".nav-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        activatePanel(tab.dataset.panel);
        if (window.matchMedia("(max-width: 680px)").matches) closeMobileMenu();
      });
    });

    // Mobile menu
    const mobileBtn = document.getElementById("mobile-menu-btn");
    const mobileMenu = document.getElementById("mobile-menu");
    if (mobileBtn && mobileMenu) {
      mobileBtn.addEventListener("click", () => {
        const willOpen = mobileMenu.style.display !== "flex";
        mobileMenu.style.display = willOpen ? "flex" : "none";
        mobileBtn.classList.toggle("is-open", willOpen);
        mobileBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
        mobileBtn.setAttribute("aria-label", willOpen ? "Close menu" : "Open menu");
      });

      document.addEventListener("click", (e) => {
        if (!mobileMenu.contains(e.target) && !mobileBtn.contains(e.target)) closeMobileMenu();
      });
    }

    // Modal close
    document.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal-overlay")) closeModal();
      if (e.target.classList.contains("modal-close")) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeModal();
        closeMobileMenu();
      }
    });
  }

  // ─── Event Hero ───────────────────────────
  function renderEventHero() {
    const d = RACE_DATA;
    const totalLaps = d.drivers.reduce((s, dr) => s + dr.totalLaps, 0);
    const numClasses = Object.keys(d.classes).length;
    document.getElementById("hero-event-name").textContent = d.event.name;
    document.getElementById("hero-venue").textContent = d.event.venue;
    document.getElementById("hero-date").textContent = new Date(d.event.date).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
    const phaseLabel = d.event.phaseLabel || ("Round " + d.event.round);
    document.getElementById("hero-round").textContent = phaseLabel;
    document.getElementById("stat-entries").textContent = d.drivers.length;
    document.getElementById("stat-classes").textContent = numClasses;
    document.getElementById("stat-record").textContent = d.records.fastestRaceLap.time;
    document.getElementById("stat-laps").textContent = totalLaps;
    const badge = document.getElementById("hero-round-badge");
    if (badge) badge.textContent = phaseLabel;
  }

  // ─── Overview Panel ───────────────────────
  function renderOverview() {
    const sessionKey = getPrimarySessionKey();
    renderPodium(sessionKey, "podium-race1");
    renderImprovementPodium(sessionKey, "podium-race2");
    renderMiniLeaderboard();
    renderRecordCards();
    renderDriverPriorityCards(sessionKey);
    renderOverviewCharts();
    renderClassBreakdown();
  }

  function renderPodium(session, targetId) {
    const el = document.getElementById(targetId || `podium-${session}`);
    if (!el) return;

    const top3 = RACE_DATA.drivers
      .filter((d) => d.sessions[session])
      .sort((a, b) => (parseTime(a.sessions[session].bestLap) || 999) - (parseTime(b.sessions[session].bestLap) || 999))
      .slice(0, 3);

    if (top3.length < 3) { el.innerHTML = "<div style='color:var(--text-muted);padding:16px;font-size:13px'>No data</div>"; return; }

    const orderedTop3 = [top3[1], top3[0], top3[2]];
    const positions = [2, 1, 3];

    el.innerHTML = orderedTop3
      .map((d, i) => {
        const pos = positions[i];
        const medal = pos === 1 ? "1" : pos === 2 ? "2" : "3";
        return `
          <div class="podium-step podium-${pos}">
            <div class="podium-driver">
              <div class="podium-car-num">#${d.car}</div>
              <div class="podium-name">${d.name.split(" ")[0]}</div>
              <div class="podium-time">${d.sessions[session].bestLap}</div>
            </div>
            <div class="podium-block">${medal}</div>
          </div>
        `;
      })
      .join("");
  }

  function renderImprovementPodium(session, targetId) {
    const el = document.getElementById(targetId);
    if (!el) return;

    const ranked = RACE_DATA.drivers
      .map((d) => {
        const laps = getLapTimesSeconds(d, session);
        if (!laps.length) return null;
        const first = laps[0];
        const best = Math.min(...laps);
        const gain = first - best;
        if (gain <= 0) return null;
        return { d, gain };
      })
      .filter(Boolean)
      .sort((a, b) => b.gain - a.gain)
      .slice(0, 3);

    if (ranked.length < 3) {
      el.innerHTML = "<div style='color:var(--text-muted);padding:16px;font-size:13px'>No improvement data</div>";
      return;
    }

    const ordered = [ranked[1], ranked[0], ranked[2]];
    const positions = [2, 1, 3];
    el.innerHTML = ordered.map((row, i) => {
      const pos = positions[i];
      return `
        <div class="podium-step podium-${pos}">
          <div class="podium-driver">
            <div class="podium-car-num">#${row.d.car}</div>
            <div class="podium-name">${row.d.name.split(" ")[0]}</div>
            <div class="podium-time">-${row.gain.toFixed(3)}s</div>
          </div>
          <div class="podium-block">${pos}</div>
        </div>
      `;
    }).join("");
  }

  function renderMiniLeaderboard() {
    const el = document.getElementById("mini-leaderboard");
    if (!el) return;
    const sessionKey = getPrimarySessionKey();
    const sorted = [...RACE_DATA.drivers]
      .filter((d) => d.sessions[sessionKey])
      .sort((a, b) => (a.sessions[sessionKey]?.pos ?? 999) - (b.sessions[sessionKey]?.pos ?? 999));
    const lapTimes = sorted.map((d) => parseTime(d.sessions[sessionKey]?.bestLap)).filter(Boolean);
    const minLap = lapTimes.length ? Math.min(...lapTimes) : null;
    const maxLap = lapTimes.length ? Math.max(...lapTimes) : null;
    const range = minLap != null && maxLap != null ? Math.max(maxLap - minLap, 0.001) : 1;
    el.innerHTML = sorted
      .map((d) => {
        const pos = d.sessions[sessionKey]?.pos ?? d.overallPos;
        const posClass = pos <= 3 ? `pos-${pos}` : "";
        const cls = RACE_DATA.classes[d.class];
        const lap = parseTime(d.sessions[sessionKey]?.bestLap);
        const width = lap != null && minLap != null ? 35 + (1 - ((lap - minLap) / range)) * 65 : 35;
        return `
          <div class="session-order-bar" onclick="showDriverModal(${d.id})" style="cursor:pointer">
            <span class="session-order-pos ${posClass}">${pos}</span>
            <span class="session-order-name">
              <span class="driver-name">${d.name}</span>
              <span style="margin-left:8px" class="class-badge" style="border-color:${cls ? cls.color : "#888"};color:${cls ? cls.color : "#888"}">${d.class}</span>
            </span>
            <div class="session-order-track">
              <div class="session-order-fill" style="width:${width}%"></div>
            </div>
            <span class="session-order-value">${d.sessions[sessionKey]?.bestLap || "—"}</span>
          </div>
        `;
      })
      .join("");
  }

  function renderRecordCards() {
    const r = RACE_DATA.records;
    const sessionLabel = getSessionLabel(getPrimarySessionKey());
    const setRecord = (id, icon, color, value, label, driver) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = `
        <div class="record-card">
          <div class="record-icon" style="background:${color}20;color:${color}">${icon}</div>
          <div>
            <div class="record-value" style="color:${color}">${value}</div>
            <div class="record-label">${label}</div>
            <div class="record-driver">${driver}</div>
          </div>
        </div>
      `;
    };
    setRecord("record-fastest-lap", "⚡", "#a855f7", r.fastestLap.time, "Fastest Overall Lap", `#${RACE_DATA.drivers.find(d=>d.car===r.fastestLap.car)?.car} ${r.fastestLap.driver} (${sessionLabel})`);
    setRecord("record-fastest-race", "🏁", "#e8b84b", r.fastestRaceLap.time, "Fastest Race Lap", `#${r.fastestRaceLap.car} ${r.fastestRaceLap.driver} (${sessionLabel})`);
    const p2Gap = (RACE_DATA.race1Gaps || [])[1];
    const gapText = p2Gap?.gap && p2Gap.gap !== "---" ? p2Gap.gap : "-";
    const gapLabel = p2Gap ? `${p2Gap.name} to leader` : "No gap data";
    setRecord("record-most-laps", "⏱", "#4facfe", gapText, "Gap P1 to P2", gapLabel);
    setRecord("record-entries", "👥", "#26de81", RACE_DATA.drivers.length + " Cars", "Total Entries", `Across ${Object.keys(RACE_DATA.classes).length} Classes`);
  }

  function renderDriverPriorityCards(sessionKey) {
    const el = document.getElementById("driver-priority-cards");
    if (!el) return;

    const withLaps = RACE_DATA.drivers
      .map((d) => ({ d, laps: getLapTimesSeconds(d, sessionKey) }))
      .filter((row) => row.laps.length >= 2);

    const improvement = withLaps
      .map((row) => ({
        d: row.d,
        gain: row.laps[0] - Math.min(...row.laps)
      }))
      .filter((row) => row.gain > 0)
      .sort((a, b) => b.gain - a.gain)[0];

    const consistent = withLaps
      .map((row) => ({ d: row.d, stdev: calcStdDev(row.laps) }))
      .filter((row) => row.stdev != null)
      .sort((a, b) => a.stdev - b.stdev)[0];

    const best3 = withLaps
      .map((row) => ({ d: row.d, avg3: bestRollingAverage(row.laps, 3) }))
      .filter((row) => row.avg3 != null)
      .sort((a, b) => a.avg3 - b.avg3)[0];

    const closestBattle = (RACE_DATA.race1Gaps || [])
      .slice(1)
      .map((g) => ({ ...g, intervalSecs: parseGapSeconds(g.interval) }))
      .filter((g) => g.intervalSecs != null)
      .sort((a, b) => a.intervalSecs - b.intervalSecs)[0];

    const cards = [
      {
        icon: "🔁",
        title: "Biggest Improvement",
        value: improvement ? `-${improvement.gain.toFixed(3)}s` : "-",
        detail: improvement ? `#${improvement.d.car} ${improvement.d.name}` : "No valid lap progression",
        color: "#45aaf2"
      },
      {
        icon: "📏",
        title: "Most Consistent",
        value: consistent ? `${consistent.stdev.toFixed(3)}s` : "-",
        detail: consistent ? `#${consistent.d.car} ${consistent.d.name} (std dev)` : "Not enough clean laps",
        color: "#26de81"
      },
      {
        icon: "🧪",
        title: "Best 3-Lap Average",
        value: best3 ? formatTime(best3.avg3) : "-",
        detail: best3 ? `#${best3.d.car} ${best3.d.name}` : "Need 3 clean laps",
        color: "#e8b84b"
      },
      {
        icon: "🤏",
        title: "Closest Battle",
        value: closestBattle ? closestBattle.interval : "-",
        detail: closestBattle ? `${closestBattle.name} to car ahead` : "No interval data",
        color: "#ff6b35"
      }
    ];

    el.innerHTML = cards.map((card) => `
      <div class="record-card">
        <div class="record-icon" style="background:${card.color}20;color:${card.color}">${card.icon}</div>
        <div>
          <div class="record-value" style="color:${card.color}">${card.value}</div>
          <div class="record-label">${card.title}</div>
          <div class="record-driver">${card.detail}</div>
        </div>
      </div>
    `).join("");
  }

  function renderOverviewCharts() {
    // Class distribution pie
    renderClassPie();
    // Session lap times comparison
    renderSessionComparison();
  }

  function renderClassPie() {
    const ctx = document.getElementById("chart-class-pie");
    if (!ctx) return;
    if (charts["class-pie"]) charts["class-pie"].destroy();

    const classCounts = {};
    RACE_DATA.drivers.forEach((d) => {
      classCounts[d.class] = (classCounts[d.class] || 0) + 1;
    });
    const labels = Object.keys(classCounts);
    const data = labels.map((k) => classCounts[k]);
    const colors = labels.map((k) => RACE_DATA.classes[k]?.color || "#888");

    charts["class-pie"] = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: "#161b27" }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "right", labels: { color: "#8892a4", padding: 12, font: { size: 12 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${ctx.parsed} cars`
            }
          }
        },
        cutout: "60%"
      }
    });
  }

  function renderSessionComparison() {
    const ctx = document.getElementById("chart-session-comparison");
    if (!ctx) return;
    if (charts["session-comparison"]) charts["session-comparison"].destroy();

    const isCompact = window.matchMedia("(max-width: 680px)").matches;
    const formatLapAxisTick = (seconds) => {
      if (!Number.isFinite(seconds)) return "";
      const rounded = Math.max(0, Math.round(seconds));
      const mins = Math.floor(rounded / 60);
      const secs = rounded % 60;
      return `${mins}:${String(secs).padStart(2, "0")}`;
    };

    const sessionKey = getPrimarySessionKey();
    const top5 = getTopDriversBySession(5, sessionKey);
    const maxLaps = Math.max(...top5.map((d) => getLapTimesSeconds(d, sessionKey).length), 0);
    if (!top5.length || !maxLaps) return;
    const lapLabels = Array.from({ length: maxLaps }, (_, i) => isCompact ? `L${i + 1}` : `Lap ${i + 1}`);
    const leader = top5[0];
    const attackWindow = leader ? getAttackWindow(leader, sessionKey, 5) : null;

    const datasets = top5.map((d, i) => {
      const laps = getLapTimesSeconds(d, sessionKey);
      const padded = Array.from({ length: maxLaps }, (_, idx) => laps[idx] ?? null);
      const isLeader = i === 0;
      const pointRadius = (isLeader && attackWindow)
        ? padded.map((v, idx) => (v != null && idx >= attackWindow.startLap - 1 && idx <= attackWindow.endLap - 1 ? 6 : 4))
        : 4;
      return {
      label: d.name.split(" ")[0],
      data: padded,
      borderColor: PALETTE[i],
      backgroundColor: PALETTE[i] + "22",
      tension: 0.3,
      fill: false,
      pointRadius,
      pointHoverRadius: 7,
      spanGaps: true
    };
    });

    const attackBandPlugin = {
      id: "attackWindowBand",
      beforeDatasetsDraw(chart) {
        if (!attackWindow) return;
        const { ctx, chartArea, scales } = chart;
        if (!chartArea || !scales?.x) return;
        const x = scales.x;
        const startIndex = Math.max(0, attackWindow.startLap - 1);
        const endIndex = Math.min(lapLabels.length - 1, attackWindow.endLap - 1);
        if (startIndex > endIndex) return;

        const left = x.getPixelForValue(startIndex);
        const right = x.getPixelForValue(endIndex);
        const bandLeft = Math.min(left, right) - 8;
        const bandRight = Math.max(left, right) + 8;

        ctx.save();
        ctx.fillStyle = "rgba(232, 184, 75, 0.10)";
        ctx.strokeStyle = "rgba(232, 184, 75, 0.45)";
        ctx.lineWidth = 1;
        ctx.fillRect(bandLeft, chartArea.top, bandRight - bandLeft, chartArea.bottom - chartArea.top);
        ctx.strokeRect(bandLeft, chartArea.top, bandRight - bandLeft, chartArea.bottom - chartArea.top);
        ctx.fillStyle = "#e8b84b";
        ctx.font = "11px Inter, Segoe UI, sans-serif";
        ctx.textBaseline = "top";
        const label = `${leader.name.split(" ")[0]} attack window (L${attackWindow.startLap}-L${attackWindow.endLap})`;
        ctx.fillText(label, bandLeft + 6, chartArea.top + 6);
        ctx.restore();
      }
    };

    charts["session-comparison"] = new Chart(ctx, {
      type: "line",
      data: { labels: lapLabels, datasets },
      plugins: [attackBandPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { labels: { color: "#8892a4", padding: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${formatTime(ctx.parsed.y)}`,
              afterBody: (items) => {
                if (!attackWindow || !items || !items.length) return "";
                const index = items[0].dataIndex;
                const inWindow = index >= attackWindow.startLap - 1 && index <= attackWindow.endLap - 1;
                return inWindow ? `Attack window: leader L${attackWindow.startLap}-L${attackWindow.endLap}` : "";
              }
            }
          }
        },
        scales: {
          x: { grid: { color: "#252d3d" }, ticks: { color: "#8892a4" } },
          y: {
            grid: { color: "#252d3d" },
            ticks: {
              color: "#8892a4",
              font: { size: isCompact ? 9 : 10 },
              callback: (v) => formatLapAxisTick(v)
            },
            reverse: false,
            min: chartMinTime()
          }
        }
      }
    });
  }

  function renderClassBreakdown() {
    const el = document.getElementById("class-breakdown-list");
    if (!el) return;
    const classCounts = {};
    RACE_DATA.drivers.forEach((d) => {
      if (!classCounts[d.class]) classCounts[d.class] = { count: 0, bestTime: null, bestDriver: "" };
      classCounts[d.class].count++;
      const best = parseTime(d.sessions.race1?.bestLap);
      if (best && (!classCounts[d.class].bestTime || best < classCounts[d.class].bestTime)) {
        classCounts[d.class].bestTime = best;
        classCounts[d.class].bestDriver = d.name;
      }
    });

    el.innerHTML = Object.entries(classCounts).map(([cls, info]) => {
      const clsData = RACE_DATA.classes[cls];
      return `
        <div class="class-row">
          <div class="class-color-dot" style="background:${clsData?.color || '#888'}"></div>
          <div>
            <div class="class-row-name">${cls} <span style="color:${clsData?.color || '#888'}">${clsData?.name || ""}</span></div>
            <div class="class-row-desc">${clsData?.description || ""}</div>
          </div>
          <div style="text-align:right">
            <div class="class-row-count">${info.count} car${info.count > 1 ? "s" : ""}</div>
            <div style="font-size:11px;color:var(--text-muted)">Best: ${info.bestTime ? formatTime(info.bestTime) : "—"}</div>
          </div>
        </div>
      `;
    }).join("");
  }

  // ─── Results Table ─────────────────────────
  // Event listeners are attached once; renderResults only refreshes the data.
  function attachResultsEvents() {
    const sessionSelect = document.getElementById("result-session-select");
    if (sessionSelect) {
      sessionSelect.addEventListener("change", (e) => {
        selectedSession = e.target.value;
        refreshResultsTable();
      });
    }

    const classFilter = document.getElementById("result-class-filter");
    if (classFilter) {
      classFilter.addEventListener("change", (e) => {
        filterClass = e.target.value;
        refreshResultsTable();
      });
    }

    const searchInput = document.getElementById("result-search");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        filterSearch = e.target.value.toLowerCase();
        refreshResultsTable();
      });
    }

    // Sort headers (clone to remove any stale listeners before re-attaching)
    document.querySelectorAll(".results-table thead th[data-sort]").forEach((th) => {
      const fresh = th.cloneNode(true);
      th.parentNode.replaceChild(fresh, th);
      fresh.addEventListener("click", () => {
        const col = fresh.dataset.sort;
        if (sortCol === col) {
          sortDir = sortDir === "asc" ? "desc" : "asc";
        } else {
          sortCol = col;
          sortDir = "asc";
        }
        refreshResultsTable();
      });
    });
  }

  function renderResults() {
    refreshResultsTable();
  }

  function refreshResultsTable() {
    const tbody = document.getElementById("results-tbody");
    if (!tbody) return;

    let data = RACE_DATA.drivers.filter((d) => d.sessions[selectedSession]);

    // Filter
    if (filterClass !== "all") data = data.filter((d) => d.class === filterClass);
    if (filterSearch) {
      data = data.filter(
        (d) =>
          d.name.toLowerCase().includes(filterSearch) ||
          d.vehicle.toLowerCase().includes(filterSearch) ||
          d.club.toLowerCase().includes(filterSearch) ||
          String(d.car).includes(filterSearch)
      );
    }

    // Sort
    data.sort((a, b) => {
      let va, vb;
      switch (sortCol) {
        case "pos":
          va = a.sessions[selectedSession]?.pos ?? 99;
          vb = b.sessions[selectedSession]?.pos ?? 99;
          break;
        case "car": va = a.car; vb = b.car; break;
        case "driver": va = a.name; vb = b.name; break;
        case "vehicle": va = a.vehicle; vb = b.vehicle; break;
        case "class": va = a.class; vb = b.class; break;
        case "laps":
          va = a.sessions[selectedSession]?.laps ?? 0;
          vb = b.sessions[selectedSession]?.laps ?? 0;
          break;
        case "bestlap":
          va = parseTime(a.sessions[selectedSession]?.bestLap) || 999;
          vb = parseTime(b.sessions[selectedSession]?.bestLap) || 999;
          break;
        case "cap": va = a.capacity; vb = b.capacity; break;
        default: va = a.overallPos; vb = b.overallPos;
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    // Find fastest lap in session
    let fastestTime = Infinity;
    data.forEach((d) => {
      const t = parseTime(d.sessions[selectedSession]?.bestLap);
      if (t && t < fastestTime) fastestTime = t;
    });

    // Update sort indicators
    document.querySelectorAll(".results-table thead th[data-sort]").forEach((th) => {
      th.classList.remove("sorted-asc", "sorted-desc");
      if (th.dataset.sort === sortCol) th.classList.add(`sorted-${sortDir}`);
    });

    const isRace = selectedSession.startsWith("race");
    const gapMap = {};
    if (isRace) {
      const gapKey = selectedSession === "race1" ? "race1Gaps" : null;
      if (gapKey && RACE_DATA[gapKey]) {
        RACE_DATA[gapKey].forEach((g) => { gapMap[g.car] = g; });
      }
    }

    tbody.innerHTML = data
      .map((d) => {
        const sess = d.sessions[selectedSession];
        const pos = sess.pos ?? "—";
        const posClass = pos <= 3 ? `pos-${pos}` : "";
        const lapTime = parseTime(sess.bestLap);
        const isFastest = lapTime && Math.abs(lapTime - fastestTime) < 0.001;
        const cls = RACE_DATA.classes[d.class];
        const gapInfo = gapMap[d.car];
        const gap = gapInfo?.gap || "—";

        return `
          <tr onclick="showDriverModal(${d.id})" class="${selectedDriverId === d.id ? "selected" : ""}">
            <td class="pos-cell ${posClass}">${pos === 99 ? "—" : pos}</td>
            <td><span class="car-num">#${d.car}</span></td>
            <td>
              <div class="driver-name">${d.name}</div>
              <div class="driver-club">${d.club}</div>
            </td>
            <td style="color:var(--text-secondary);font-size:12px">${d.vehicle}</td>
            <td><span class="class-badge" style="border-color:${cls?.color || "#888"};color:${cls?.color || "#888"}">${d.class}</span></td>
            <td style="font-family:var(--font-mono)">${d.capacity.toLocaleString()}</td>
            <td style="font-family:var(--font-mono)">${sess.laps}</td>
            <td class="lap-time ${isFastest ? "fastest" : ""}">${sess.bestLap}${isFastest ? ' <span class="badge-fastest">BEST</span>' : ""}</td>
            ${isRace ? `<td class="gap-time">${gap}</td>` : ""}
          </tr>
        `;
      })
      .join("");

    // Show/hide gap column header
    const gapTh = document.getElementById("th-gap");
    if (gapTh) gapTh.style.display = isRace ? "" : "none";
  }

  // ─── Lap Analysis ──────────────────────────
  function renderLapAnalysis() {
    renderFastestLapsBar();
    renderLapTimeDistribution();
    renderTopDriversRadar();
    renderSessionBestComparison();
  }

  function renderFastestLapsBar() {
    const el = document.getElementById("fastest-laps-bar");
    if (!el) return;

    const data = [...RACE_DATA.drivers]
      .map((d) => ({ name: d.name.split(" ")[0], car: d.car, time: parseTime(d.sessions.race1?.bestLap), class: d.class }))
      .filter((d) => d.time)
      .sort((a, b) => a.time - b.time);

    const min = data[0].time;
    const max = data[data.length - 1].time;
    const range = max - min;

    el.innerHTML = data.map((d, i) => {
      const pct = range > 0 ? 30 + 70 * ((d.time - min) / range) : 100;
      const color = RACE_DATA.classes[d.class]?.color || PALETTE[i % PALETTE.length];
      return `
        <div class="lap-bar-row">
          <div class="lap-bar-label">#${d.car} ${d.name}</div>
          <div class="lap-bar-track">
            <div class="lap-bar-fill" style="width:${pct}%;background:${color}44;border-left:3px solid ${color}">
              <span class="lap-bar-value">${formatTime(d.time)}</span>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderLapTimeDistribution() {
    const ctx = document.getElementById("chart-lap-distribution");
    if (!ctx) return;
    if (charts["lap-dist"]) charts["lap-dist"].destroy();

    // Gather all race1 lap times
    const allTimes = [];
    RACE_DATA.drivers.forEach((d) => {
      (d.sessions.race1?.lapTimes || []).forEach((t) => {
        const secs = parseTime(t);
        if (secs) allTimes.push(secs);
      });
    });
    allTimes.sort((a, b) => a - b);

    // Bucket into 0.5s bins
    const minT = Math.floor(allTimes[0] * 2) / 2;
    const maxT = Math.ceil(allTimes[allTimes.length - 1] * 2) / 2;
    const buckets = {};
    for (let t = minT; t <= maxT; t += 0.5) {
      buckets[t.toFixed(1)] = 0;
    }
    allTimes.forEach((t) => {
      const bucket = (Math.floor(t * 2) / 2).toFixed(1);
      buckets[bucket] = (buckets[bucket] || 0) + 1;
    });

    charts["lap-dist"] = new Chart(ctx, {
      type: "bar",
      data: {
        labels: Object.keys(buckets).map((k) => formatTime(parseFloat(k))),
        datasets: [{
          label: "Lap Count",
          data: Object.values(buckets),
          backgroundColor: "#4facfe44",
          borderColor: "#4facfe",
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { title: (ctx) => `~${ctx[0].label}`, label: (ctx) => `${ctx.parsed.y} laps` } }
        },
        scales: {
          x: { grid: { color: "#252d3d" }, ticks: { color: "#8892a4", maxRotation: 45 } },
          y: { grid: { color: "#252d3d" }, ticks: { color: "#8892a4", stepSize: 1 }, title: { display: true, text: "Laps", color: "#8892a4" } }
        }
      }
    });
  }

  function renderTopDriversRadar() {
    const ctx = document.getElementById("chart-radar");
    if (!ctx) return;
    if (charts["radar"]) charts["radar"].destroy();

    const top5 = RACE_DATA.drivers.slice(0, 5);

    // Compute reference (fastest driver's best lap in this round)
    const allBests = RACE_DATA.drivers.map((d) => parseTime(d.sessions.race1?.bestLap)).filter(Boolean);
    const fastestOverall = Math.min(...allBests);

    const datasets = top5.map((d, i) => {
      const r1 = d.sessions.race1;
      const lapTimes = (r1?.lapTimes || []).filter(Boolean).map(parseTime).filter(Boolean);
      const bestLap  = Math.min(...lapTimes);
      const worstLap = Math.max(...lapTimes);
      // Consistency: how tight the lap time spread is within the run (lower spread = better)
      // Multiply by 50 so that a 2-second spread = ~0% and 0-second spread = 100%
      const consistency = Math.max(0, 100 - (worstLap - bestLap) * 50);
      // Speed: proximity to the fastest overall lap; deduct 5 score units per second behind the leader
      const speedScore  = Math.max(0, 100 - (bestLap - fastestOverall) * 5);
      const lapsScore   = (r1?.laps / 3) * 100;
      const classScore  = ["1S3", "2C", "2S4", "1S4"].includes(d.class) ? 90 : 72;
      const avgScore    = (speedScore + consistency) / 2;

      return {
        label: d.name.split(" ")[0],
        data: [
          parseFloat(speedScore.toFixed(1)),
          parseFloat(consistency.toFixed(1)),
          parseFloat(lapsScore.toFixed(1)),
          parseFloat(classScore.toFixed(1)),
          parseFloat(avgScore.toFixed(1))
        ],
        borderColor: PALETTE[i],
        backgroundColor: PALETTE[i] + "22",
        pointBackgroundColor: PALETTE[i],
        pointBorderColor: "#161b27",
        pointHoverBackgroundColor: "#fff",
        borderWidth: 2
      };
    });

    charts["radar"] = new Chart(ctx, {
      type: "radar",
      data: {
        labels: ["Speed", "Consistency", "Laps Completed", "Class Factor", "Avg Performance"],
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#8892a4", padding: 10, font: { size: 11 } } }
        },
        scales: {
          r: {
            grid: { color: "#252d3d" },
            pointLabels: { color: "#8892a4", font: { size: 11 } },
            ticks: { color: "#4a5568", backdropColor: "transparent", stepSize: 25 },
            min: 0, max: 100
          }
        }
      }
    });
  }

  function renderSessionBestComparison() {
    const ctx = document.getElementById("chart-session-best");
    if (!ctx) return;
    if (charts["session-best"]) charts["session-best"].destroy();

    const sessionKey = getPrimarySessionKey();
    const top6 = getTopDriversBySession(6, sessionKey);
    if (!top6.length) return;
    const labels = top6.map((d) => `#${d.car} ${d.name.split(" ")[0]}`);
    const bestLapData = top6.map((d) => parseTime(d.sessions[sessionKey]?.bestLap) || null);
    const avgLapData = top6.map((d) => {
      const laps = getLapTimesSeconds(d, sessionKey);
      if (!laps.length) return null;
      return laps.reduce((a, b) => a + b, 0) / laps.length;
    });

    charts["session-best"] = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Best Lap",
            data: bestLapData,
            backgroundColor: "#e8b84bcc",
            borderColor: "#e8b84b",
            borderWidth: 2,
            borderRadius: 4
          },
          {
            label: "Average Lap",
            data: avgLapData,
            backgroundColor: "#4facfeaa",
            borderColor: "#4facfe",
            borderWidth: 2,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#8892a4", padding: 8, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${formatTime(ctx.parsed.y)}`
            }
          }
        },
        scales: {
          x: { grid: { color: "#252d3d" }, ticks: { color: "#8892a4" } },
          y: {
            grid: { color: "#252d3d" },
            ticks: { color: "#8892a4", callback: (v) => formatTime(v) },
            min: chartMinTime()
          }
        }
      }
    });
  }

  // ─── Class Analysis ────────────────────────
  function renderClassAnalysis() {
    renderClassWinnersTable();
    renderClassLapChart();
    renderCapacityVsLapChart();
  }

  function renderClassWinnersTable() {
    const el = document.getElementById("class-winners-tbody");
    if (!el) return;

    const classBest = {};
    RACE_DATA.drivers.forEach((d) => {
      const t = parseTime(d.sessions.race1?.bestLap);
      if (!t) return;
      if (!classBest[d.class] || t < parseTime(classBest[d.class].sessions.race1?.bestLap)) {
        classBest[d.class] = d;
      }
    });

    el.innerHTML = Object.entries(classBest)
      .sort((a, b) => parseTime(a[1].sessions.race1?.bestLap) - parseTime(b[1].sessions.race1?.bestLap))
      .map(([cls, d], i) => {
        const clsData = RACE_DATA.classes[cls];
        return `
          <tr onclick="showDriverModal(${d.id})" style="cursor:pointer">
            <td class="pos-cell ${i < 3 ? `pos-${i+1}` : ""}">${i + 1}</td>
            <td><span class="class-badge" style="border-color:${clsData?.color || "#888"};color:${clsData?.color || "#888"}">${cls}</span></td>
            <td><div class="driver-name">${d.name}</div><div class="driver-club">${d.club}</div></td>
            <td><span class="car-num">#${d.car}</span></td>
            <td style="font-size:12px;color:var(--text-secondary)">${d.vehicle}</td>
            <td class="lap-time">${d.sessions.race1?.bestLap || "—"}</td>
          </tr>
        `;
      }).join("");
  }

  function renderClassLapChart() {
    const ctx = document.getElementById("chart-class-laps");
    if (!ctx) return;
    if (charts["class-laps"]) charts["class-laps"].destroy();

    const classBestTimes = {};
    RACE_DATA.drivers.forEach((d) => {
      const t = parseTime(d.sessions.race1?.bestLap);
      if (t) {
        if (!classBestTimes[d.class] || t < classBestTimes[d.class]) classBestTimes[d.class] = t;
      }
    });

    const entries = Object.entries(classBestTimes).sort((a, b) => a[1] - b[1]);
    const labels = entries.map(([cls]) => cls);
    const data = entries.map(([, t]) => parseFloat(t.toFixed(3)));
    const colors = labels.map((cls) => RACE_DATA.classes[cls]?.color || "#888");

    charts["class-laps"] = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Best Lap Time (Race 1)",
          data,
          backgroundColor: colors.map((c) => c + "88"),
          borderColor: colors,
          borderWidth: 2,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ${formatTime(ctx.parsed.x)}` } }
        },
        scales: {
          x: {
            grid: { color: "#252d3d" },
            ticks: { color: "#8892a4", callback: (v) => formatTime(v) },
            min: chartMinTime()
          },
          y: { grid: { color: "#252d3d" }, ticks: { color: "#8892a4" } }
        }
      }
    });
  }

  function renderCapacityVsLapChart() {
    const ctx = document.getElementById("chart-capacity-vs-lap");
    if (!ctx) return;
    if (charts["cap-lap"]) charts["cap-lap"].destroy();

    const datasets = RACE_DATA.drivers
      .filter((d) => d.sessions.race1?.bestLap)
      .map((d, i) => ({
        label: `#${d.car} ${d.name.split(" ")[0]}`,
        data: [{ x: d.capacity, y: parseFloat(parseTime(d.sessions.race1?.bestLap).toFixed(3)) }],
        backgroundColor: RACE_DATA.classes[d.class]?.color + "99" || PALETTE[i % PALETTE.length] + "99",
        borderColor: RACE_DATA.classes[d.class]?.color || PALETTE[i % PALETTE.length],
        pointRadius: 8,
        pointHoverRadius: 11
      }));

    charts["cap-lap"] = new Chart(ctx, {
      type: "scatter",
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label} | ${ctx.parsed.x.toLocaleString()}cc → ${formatTime(ctx.parsed.y)}`
            }
          }
        },
        scales: {
          x: {
            grid: { color: "#252d3d" },
            ticks: { color: "#8892a4", callback: (v) => v.toLocaleString() + "cc" },
            title: { display: true, text: "Engine Capacity (cc)", color: "#8892a4" }
          },
          y: {
            grid: { color: "#252d3d" },
            ticks: { color: "#8892a4", callback: (v) => formatTime(v) },
            title: { display: true, text: "Best Lap Time", color: "#8892a4" },
            min: chartMinTime()
          }
        }
      }
    });
  }

  // ─── Driver Comparison ─────────────────────
  function renderDriverComparison() {
    const selA = document.getElementById("compare-driver-a");
    const selB = document.getElementById("compare-driver-b");
    if (!selA || !selB) return;

    const options = RACE_DATA.drivers.map((d) => `<option value="${d.id}">${d.name} (#${d.car})</option>`).join("");
    selA.innerHTML = options;
    selB.innerHTML = options;
    selA.selectedIndex = 0;
    selB.selectedIndex = 1;
    compareDriverA = parseInt(selA.value);
    compareDriverB = parseInt(selB.value);

    // Use onchange to avoid duplicate listeners on reload
    selA.onchange = () => {
      compareDriverA = parseInt(selA.value);
      compareDriverB = parseInt(selB.value);
      refreshComparison();
      syncShareUrl(true);
    };
    selB.onchange = () => {
      compareDriverA = parseInt(selA.value);
      compareDriverB = parseInt(selB.value);
      refreshComparison();
      syncShareUrl(true);
    };
    refreshComparison();
  }

  function refreshComparison() {
    const dA = RACE_DATA.drivers.find((d) => d.id === compareDriverA) || RACE_DATA.drivers[0];
    const dB = RACE_DATA.drivers.find((d) => d.id === compareDriverB) || RACE_DATA.drivers[1];
    const { colorA, colorB } = getCompareDriverColors(dA, dB);

    renderCompareHeaders(dA, dB, colorA, colorB);
    renderCompareStats(dA, dB, colorA, colorB);
    renderCompareLapChart(dA, dB, colorA, colorB);
    renderCompareProgressChart(dA, dB, colorA, colorB);
  }

  function getCompareDriverColors(dA, dB) {
    const fallbackA = PALETTE[0] || "#ff6b35";
    const fallbackB = PALETTE[2] || "#4facfe";
    const normalize = (c) => String(c || "").trim().toLowerCase();

    const colorA = RACE_DATA.classes[dA.class]?.color || fallbackA;
    let colorB = RACE_DATA.classes[dB.class]?.color || fallbackB;

    // Ensure the two compared drivers never render with the same color.
    if (normalize(colorA) === normalize(colorB)) {
      colorB = PALETTE.find((c) => normalize(c) !== normalize(colorA)) || fallbackB;
    }

    return { colorA, colorB };
  }

  function renderCompareHeaders(dA, dB, colorA, colorB) {
    const renderHeader = (id, d, accent) => {
      const el = document.getElementById(id);
      if (!el) return;
      const cls = RACE_DATA.classes[d.class];
      el.innerHTML = `
        <div class="compare-driver-header">
          <div class="driver-avatar" style="background:${accent}22;color:${accent};border:2px solid ${accent}55">
            ${d.car}
          </div>
          <div>
            <div style="font-size:16px;font-weight:700">${d.name}</div>
            <div style="color:var(--text-secondary);font-size:12px">${d.vehicle} • <span style="color:${cls?.color || "#888"}">${d.class}</span></div>
            <div style="color:var(--text-muted);font-size:11px">${d.club}</div>
          </div>
          <div style="margin-left:auto;text-align:right">
            <div style="font-size:24px;font-weight:700;color:${accent}">${d.sessions.race1?.bestLap || "—"}</div>
            <div style="font-size:11px;color:var(--text-muted)">P${d.sessions.race1?.pos || d.overallPos} • ${d.sessions.race1?.laps || d.totalLaps} laps</div>
          </div>
        </div>
      `;
    };
    renderHeader("compare-header-a", dA, colorA);
    renderHeader("compare-header-b", dB, colorB);
  }

  function renderCompareStats(dA, dB, colorA, colorB) {
    const el = document.getElementById("compare-stats");
    if (!el) return;

    const sessionKey = getPrimarySessionKey();
    const sessionLabel = getSessionLabel(sessionKey);
    const avgA = (() => {
      const laps = getLapTimesSeconds(dA, sessionKey);
      return laps.length ? laps.reduce((s, v) => s + v, 0) / laps.length : null;
    })();
    const avgB = (() => {
      const laps = getLapTimesSeconds(dB, sessionKey);
      return laps.length ? laps.reduce((s, v) => s + v, 0) / laps.length : null;
    })();
    const attackA = getAttackWindow(dA, sessionKey, 5);
    const attackB = getAttackWindow(dB, sessionKey, 5);

    const stats = [
      { label: `${sessionLabel} Best Lap`, a: parseTime(dA.sessions[sessionKey]?.bestLap), b: parseTime(dB.sessions[sessionKey]?.bestLap), format: formatTime, lowerBetter: true },
      { label: `${sessionLabel} Position`, a: dA.sessions[sessionKey]?.pos || dA.overallPos, b: dB.sessions[sessionKey]?.pos || dB.overallPos, format: (v) => "P" + v, lowerBetter: true },
      { label: `${sessionLabel} Laps`, a: dA.sessions[sessionKey]?.laps, b: dB.sessions[sessionKey]?.laps, format: (v) => v + " laps", lowerBetter: false },
      { label: `${sessionLabel} Avg Lap`, a: avgA, b: avgB, format: formatTime, lowerBetter: true },
      { label: `${sessionLabel} Best 5-Lap Avg`, a: attackA?.avg ?? null, b: attackB?.avg ?? null, format: formatTime, lowerBetter: true },
      { label: "Engine Capacity", a: dA.capacity, b: dB.capacity, format: (v) => v.toLocaleString() + "cc", lowerBetter: false }
    ];

    const rowsHtml = stats.map(({ label, a, b, format, lowerBetter }) => {
      if (a == null || b == null) return "";
      const maxVal = Math.max(a, b);
      const minVal = Math.min(a, b);
      const range = maxVal - minVal || 1;
      const pctA = 40 + 60 * (lowerBetter ? (maxVal - a) / range : (a - minVal) / range);
      const pctB = 40 + 60 * (lowerBetter ? (maxVal - b) / range : (b - minVal) / range);
      const aWins = lowerBetter ? a <= b : a >= b;
      const bWins = lowerBetter ? b <= a : b >= a;
      const tied = a === b;

      return `
        <div class="compare-stat-row">
          <div class="compare-stat-label">${label}</div>
          <div class="compare-bar-left">
            <div class="compare-bar-fill" style="width:${pctA}%;background:${colorA}55;border-right:2px solid ${colorA};justify-content:flex-end">
              ${format(a)}
            </div>
          </div>
          <div style="width:16px;text-align:center">
            ${!tied && aWins ? '<span style="color:var(--accent-green);font-size:12px">◆</span>' : '<span style="color:var(--text-muted);font-size:8px">·</span>'}
          </div>
          <div class="compare-bar-right">
            <div class="compare-bar-fill" style="width:${pctB}%;background:${colorB}55;border-left:2px solid ${colorB};justify-content:flex-start">
              ${format(b)}
            </div>
          </div>
          <div style="width:16px;text-align:center">
            ${!tied && bWins ? '<span style="color:var(--accent-green);font-size:12px">◆</span>' : '<span style="color:var(--text-muted);font-size:8px">·</span>'}
          </div>
        </div>
      `;
    }).join("");

    const attackDetail = (attackA && attackB)
      ? `<div style="margin-top:10px;font-size:12px;color:var(--text-secondary)">Attack window (best rolling 5): Driver A L${attackA.startLap}-L${attackA.endLap}, Driver B L${attackB.startLap}-L${attackB.endLap}</div>`
      : "";

    el.innerHTML = rowsHtml + attackDetail;
  }

  function renderCompareLapChart(dA, dB, colorA, colorB) {
    const ctx = document.getElementById("chart-compare-laps");
    if (!ctx) return;
    if (charts["compare-laps"]) charts["compare-laps"].destroy();

    const isCompact = window.matchMedia("(max-width: 680px)").matches;
    const formatLapAxisTick = (seconds) => {
      if (!Number.isFinite(seconds)) return "";
      const rounded = Math.max(0, Math.round(seconds));
      const mins = Math.floor(rounded / 60);
      const secs = rounded % 60;
      return `${mins}:${String(secs).padStart(2, "0")}`;
    };

    const lapTimesA = (dA.sessions.race1?.lapTimes || []).slice(1).map(parseTime).filter(Boolean);
    const lapTimesB = (dB.sessions.race1?.lapTimes || []).slice(1).map(parseTime).filter(Boolean);
    const maxLen = Math.max(lapTimesA.length, lapTimesB.length);
    const labels = Array.from({ length: maxLen }, (_, i) => isCompact ? `L${i + 1}` : `Lap ${i + 1}`);

    charts["compare-laps"] = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: dA.name.split(" ")[0] + " (#" + dA.car + ")",
            data: lapTimesA,
            borderColor: colorA,
            backgroundColor: colorA + "18",
            tension: 0.3,
            fill: true,
            pointRadius: 4,
            pointHoverRadius: 7,
            borderWidth: 2.5
          },
          {
            label: dB.name.split(" ")[0] + " (#" + dB.car + ")",
            data: lapTimesB,
            borderColor: colorB,
            backgroundColor: colorB + "18",
            tension: 0.3,
            fill: true,
            pointRadius: 4,
            pointHoverRadius: 7,
            borderWidth: 2.5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { labels: { color: "#8892a4", padding: 12, font: { size: 12 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${formatTime(ctx.parsed.y)}`
            }
          }
        },
        scales: {
          x: { grid: { color: "#252d3d" }, ticks: { color: "#8892a4" } },
          y: {
            grid: { color: "#252d3d" },
            ticks: {
              color: "#8892a4",
              font: { size: isCompact ? 9 : 10 },
              callback: (v) => formatLapAxisTick(v)
            }
          }
        }
      }
    });
  }

  function renderCompareProgressChart(dA, dB, colorA, colorB) {
    const ctx = document.getElementById("chart-compare-progress");
    const summaryEl = document.getElementById("compare-progress-summary");
    const stripEl = document.getElementById("compare-lead-strip");
    if (!ctx) return;
    if (charts["compare-progress"]) charts["compare-progress"].destroy();

    const sessionKey = getPrimarySessionKey();
    const isCompact = window.matchMedia("(max-width: 680px)").matches;
    const axisTickFontSize = isCompact ? 9 : 10;
    const axisTitleFontSize = isCompact ? 10 : 11;
    const formatAxisTime = (seconds, includeSign = false) => {
      if (!Number.isFinite(seconds)) return "";
      const sign = seconds < 0 ? "-" : includeSign ? "+" : "";
      const abs = Math.abs(seconds);
      const rounded = Math.round(abs);
      if (rounded >= 60) {
        const minutes = Math.floor(rounded / 60);
        const secs = rounded % 60;
        return `${sign}${minutes}:${String(secs).padStart(2, "0")}`;
      }
      return `${sign}${rounded}s`;
    };
    const lapTimesA = (dA.sessions[sessionKey]?.lapTimes || []).slice(1).map(parseTime).filter(Boolean);
    const lapTimesB = (dB.sessions[sessionKey]?.lapTimes || []).slice(1).map(parseTime).filter(Boolean);
    const lapCount = Math.min(lapTimesA.length, lapTimesB.length);
    const labels = Array.from({ length: lapCount }, (_, i) => isCompact ? `L${i + 1}` : `Lap ${i + 1}`);

    if (!lapCount) {
      if (summaryEl) summaryEl.innerHTML = `<div style="font-size:12px;color:var(--text-muted)">Not enough overlapping laps to compare in this session.</div>`;
      if (stripEl) stripEl.innerHTML = "";
      return;
    }

    const cumulative = (laps) => {
      let total = 0;
      return laps.map((t) => {
        total += t;
        return total;
      });
    };

    const cumA = cumulative(lapTimesA.slice(0, lapCount));
    const cumB = cumulative(lapTimesB.slice(0, lapCount));

    // Positive values mean Driver A is ahead. Negative values mean Driver B is ahead.
    const advantageA = labels.map((_, i) => cumB[i] - cumA[i]);
    const positiveAdv = advantageA.map((v) => (v >= 0 ? v : null));
    const negativeAdv = advantageA.map((v) => (v <= 0 ? v : null));
    const zeroLine = labels.map(() => 0);

    const epsilon = 0.001;
    let lapsLedA = 0;
    let lapsLedB = 0;
    let leadChanges = 0;
    let lastLeader = null;
    let largestLeadA = 0;
    let largestLeadB = 0;
    let longestStintA = 0;
    let longestStintB = 0;
    let stintA = 0;
    let stintB = 0;
    const leadChangePoints = labels.map(() => null);
    const leaderByLap = labels.map(() => "Level");

    advantageA.forEach((v, i) => {
      let leader = "tie";
      if (v > epsilon) {
        leader = "A";
        lapsLedA++;
        if (v > largestLeadA) largestLeadA = v;
        stintA += 1;
        stintB = 0;
        if (stintA > longestStintA) longestStintA = stintA;
      } else if (v < -epsilon) {
        leader = "B";
        lapsLedB++;
        if (Math.abs(v) > largestLeadB) largestLeadB = Math.abs(v);
        stintB += 1;
        stintA = 0;
        if (stintB > longestStintB) longestStintB = stintB;
      } else {
        stintA = 0;
        stintB = 0;
      }

      leaderByLap[i] = leader === "A" ? dA.name.split(" ")[0] : leader === "B" ? dB.name.split(" ")[0] : "Level";

      if ((leader === "A" || leader === "B") && lastLeader && leader !== lastLeader) {
        leadChanges++;
        leadChangePoints[i] = advantageA[i];
      }
      if (leader === "A" || leader === "B") lastLeader = leader;
    });

    const finalAdv = advantageA[advantageA.length - 1] || 0;
    const finalLeader = finalAdv > epsilon ? dA.name.split(" ")[0] : finalAdv < -epsilon ? dB.name.split(" ")[0] : "Tie";

    if (summaryEl) {
      const chips = [
        { label: "Final Margin", value: `${finalLeader} ${finalLeader === "Tie" ? "" : `by ${formatTime(Math.abs(finalAdv))}`}`.trim() },
        { label: `${dA.name.split(" ")[0]} Laps Ahead`, value: String(lapsLedA) },
        { label: `${dB.name.split(" ")[0]} Laps Ahead`, value: String(lapsLedB) },
        { label: "Lead Changes", value: String(leadChanges) },
        { label: `${dA.name.split(" ")[0]} Max Lead`, value: formatTime(largestLeadA) },
        { label: `${dB.name.split(" ")[0]} Max Lead`, value: formatTime(largestLeadB) },
        { label: `${dA.name.split(" ")[0]} Longest Stint`, value: `${longestStintA} laps` },
        { label: `${dB.name.split(" ")[0]} Longest Stint`, value: `${longestStintB} laps` }
      ];

      const chipsToRender = isCompact
        ? chips.filter((c) => ["Final Margin", `${dA.name.split(" ")[0]} Laps Ahead`, `${dB.name.split(" ")[0]} Laps Ahead`, "Lead Changes"].includes(c.label))
        : chips;

      summaryEl.innerHTML = chipsToRender.map((chip) => `
        <div class="compare-progress-chip">
          <div class="compare-progress-chip-value">${chip.value}</div>
          <div class="compare-progress-chip-label">${chip.label}</div>
        </div>
      `).join("");
    }

    if (stripEl) {
      stripEl.innerHTML = labels.map((label, i) => {
        const v = advantageA[i];
        const leader = v > epsilon ? "A" : v < -epsilon ? "B" : "Tie";
        const bg = leader === "A" ? `${colorA}cc` : leader === "B" ? `${colorB}cc` : "#7f8ca555";
        const tip = leader === "A"
          ? `${label}: ${dA.name} ahead by ${formatTime(Math.abs(v))}`
          : leader === "B"
            ? `${label}: ${dB.name} ahead by ${formatTime(Math.abs(v))}`
            : `${label}: level`;
        return `<span class="compare-lead-segment" style="background:${bg}" title="${tip}"></span>`;
      }).join("");
    }

    const datasets = [
      {
        label: `${dA.name.split(" ")[0]} advantage`,
        data: positiveAdv,
        yAxisID: "yAdv",
        borderColor: colorA,
        backgroundColor: colorA + "2a",
        tension: 0.2,
        fill: "origin",
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        spanGaps: true
      },
      {
        label: `${dB.name.split(" ")[0]} advantage`,
        data: negativeAdv,
        yAxisID: "yAdv",
        borderColor: colorB,
        backgroundColor: colorB + "2a",
        tension: 0.2,
        fill: "origin",
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        spanGaps: true
      },
      {
        label: "Driver A Advantage",
        data: advantageA,
        yAxisID: "yAdv",
        borderColor: "#c2cfdf",
        backgroundColor: "transparent",
        borderDash: [5, 4],
        tension: 0.2,
        borderWidth: 2,
        pointRadius: 1.5,
        pointHoverRadius: 4
      },
      {
        label: "Lead Change",
        data: leadChangePoints,
        yAxisID: "yAdv",
        showLine: false,
        pointStyle: "rectRot",
        pointRadius: 6,
        pointHoverRadius: 7,
        pointBackgroundColor: "#ffffff",
        pointBorderColor: "#101722",
        pointBorderWidth: 2
      },
      {
        label: "Level",
        data: zeroLine,
        yAxisID: "yAdv",
        borderColor: "#7f8ca5",
        borderWidth: 2,
        pointRadius: 0,
        borderDash: [2, 2]
      }
    ];

    if (!isCompact) {
      datasets.push(
        {
          label: `${dA.name.split(" ")[0]} cumulative`,
          data: cumA,
          yAxisID: "yCum",
          borderColor: colorA + "66",
          backgroundColor: "transparent",
          tension: 0.2,
          borderWidth: 1.5,
          pointRadius: 0
        },
        {
          label: `${dB.name.split(" ")[0]} cumulative`,
          data: cumB,
          yAxisID: "yCum",
          borderColor: colorB + "66",
          backgroundColor: "transparent",
          tension: 0.2,
          borderWidth: 1.5,
          pointRadius: 0
        }
      );
    }

    const scales = {
      x: {
        grid: { color: "#252d3d" },
        ticks: {
          color: "#8892a4",
          autoSkip: true,
          maxTicksLimit: isCompact ? 8 : 15,
          font: { size: axisTickFontSize }
        }
      },
      yAdv: {
        position: "left",
        grid: { color: "#252d3d" },
        ticks: {
          color: "#8892a4",
          font: { size: axisTickFontSize },
          callback: (v) => formatAxisTime(v, true)
        },
        title: {
          display: true,
          text: "Driver A Advantage",
          color: "#8892a4",
          font: { size: axisTitleFontSize }
        }
      }
    };

    if (!isCompact) {
      scales.yCum = {
        position: "right",
        grid: { drawOnChartArea: false },
        ticks: {
          color: "#8892a4",
          font: { size: axisTickFontSize },
          callback: (v) => formatAxisTime(v)
        },
        title: {
          display: true,
          text: "Cumulative Time",
          color: "#8892a4",
          font: { size: axisTitleFontSize }
        }
      };
    }

    charts["compare-progress"] = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets
      },
      options: {
        responsive: true,
        // Keep chart constrained to container height on all breakpoints.
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            display: !isCompact,
            labels: {
              color: "#8892a4",
              padding: 12,
              font: { size: 12 },
              filter: (item) => !["Level"].includes(item.text)
            }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                if (ctx.dataset.yAxisID === "yCum") {
                  return ` ${ctx.dataset.label}: ${formatTime(ctx.parsed.y)}`;
                }
                if (ctx.dataset.label === "Lead Change") {
                  const lapNo = ctx.dataIndex + 1;
                  const adv = advantageA[ctx.dataIndex] || 0;
                  const ahead = leaderByLap[ctx.dataIndex] || "Level";
                  return ` Lead changed on Lap ${lapNo}: ${ahead} ahead by ${formatTime(Math.abs(adv))}`;
                }
                if (ctx.dataset.label === "Level") return null;
                const adv = ctx.parsed.y;
                if (!Number.isFinite(adv)) return " Advantage: -";
                const leader = adv > epsilon ? dA.name.split(" ")[0] : adv < -epsilon ? dB.name.split(" ")[0] : "Level";
                return ` Advantage: ${adv >= 0 ? "+" : "-"}${formatTime(Math.abs(adv))} (${leader} ahead)`;
              }
            }
          }
        },
        scales
      }
    });
  }

  // ─── Gap Analysis ─────────────────────────
  function renderGapAnalysis() {
    renderGapBars("race1", "gap", "gap-bars-race1");
    renderGapBars("race1", "interval", "gap-bars-race2");
    renderGapOverTimeChart();
  }

  function renderGapBars(session, mode, targetId) {
    const el = document.getElementById(targetId || `gap-bars-${session}`);
    if (!el) return;

    const gaps = RACE_DATA.race1Gaps;
    if (!Array.isArray(gaps) || !gaps.length) {
      el.innerHTML = "<div style='color:var(--text-muted);font-size:13px;padding:16px'>No gap data available.</div>";
      return;
    }

    const key = mode === "interval" ? "interval" : "gap";

    // Dynamic max gap based on the actual data
    const gapTimes = gaps.slice(1).map((g) => {
      const value = g[key];
      if (!value || value === "---") return 0;
      return parseTime(value.replace("+", "")) || 0;
    }).filter((t) => t > 0 && t < 300);
    const maxGap = gapTimes.length ? Math.max(...gapTimes) * 1.15 : 10;

    el.innerHTML = gaps.map((g, i) => {
      const isLeader = i === 0;
      const value = g[key];
      const gapSecs = isLeader ? 0 : (parseTime((value || "").replace("+", "")) || 0);
      const pct = isLeader ? 2 : Math.min(100, (gapSecs / maxGap) * 100);

      return `
        <div class="gap-bar-item">
          <div class="gap-bar-name">${i + 1}. ${g.name.split(" ")[0]}</div>
          <div class="gap-bar-track">
            <div class="gap-bar-fill ${isLeader ? "gap-bar-leader" : ""}" style="width:${pct}%"></div>
          </div>
          <div class="gap-label">${isLeader ? (mode === "gap" ? "LEADER" : "-") : (value || "-")}</div>
        </div>
      `;
    }).join("");
  }

  function renderGapOverTimeChart() {
    const ctx = document.getElementById("chart-gap-evolution");
    if (!ctx) return;
    if (charts["gap-evo"]) charts["gap-evo"].destroy();

    // Simulate cumulative gap over laps based on lap times
    const top4 = RACE_DATA.drivers.filter((d) => d.sessions.race1).sort((a, b) => a.sessions.race1.pos - b.sessions.race1.pos).slice(0, 4);
    const maxLaps = Math.min(...top4.map((d) => d.sessions.race1.laps));

    // Reference lap time: fastest driver's best lap (used for fallback when a lap time is null)
    const refLapTime = parseTime(top4[0]?.sessions.race1?.bestLap) || 65;

    const isCompact = window.matchMedia("(max-width: 680px)").matches;
    const labels = Array.from({ length: maxLaps }, (_, i) => isCompact ? `L${i + 1}` : `Lap ${i + 1}`);

    const datasets = top4.map((d, i) => {
      let cumulative = 0;
      const cumulatives = (d.sessions.race1.lapTimes || []).slice(1, maxLaps + 1).map((t) => {
        const secs = parseTime(t);
        cumulative += secs || refLapTime;
        return parseFloat(cumulative.toFixed(3));
      });

      // Express as gap to leader
      return { driver: d.name.split(" ")[0], times: cumulatives, color: PALETTE[i] };
    });

    // Calculate gaps relative to leader
    const leaderTimes = datasets[0].times;
    const gapDatasets = datasets.map(({ driver, times, color }, i) => ({
      label: driver,
      data: times.map((t, j) => parseFloat((t - leaderTimes[j]).toFixed(3))),
      borderColor: color,
      backgroundColor: color + "22",
      fill: i === 0,
      tension: 0.3,
      pointRadius: 3,
      borderWidth: 2
    }));

    charts["gap-evo"] = new Chart(ctx, {
      type: "line",
      data: { labels, datasets: gapDatasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { labels: { color: "#8892a4", padding: 12, font: { size: 12 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: +${ctx.parsed.y.toFixed(3)}s`
            }
          }
        },
        scales: {
          x: { grid: { color: "#252d3d" }, ticks: { color: "#8892a4" } },
          y: {
            grid: { color: "#252d3d" },
            ticks: { color: "#8892a4", callback: (v) => "+" + v.toFixed(1) + "s" },
            title: { display: true, text: "Gap to Leader (seconds)", color: "#8892a4" },
            min: 0
          }
        }
      }
    });
  }

  // ─── Driver Profiles ──────────────────────
  function renderDriverProfiles() {
    const el = document.getElementById("driver-profiles-grid");
    if (!el) return;

    el.innerHTML = RACE_DATA.drivers.map((d) => {
      const cls = RACE_DATA.classes[d.class];
      const posClass = d.overallPos <= 3 ? `pos-badge-${d.overallPos}` : "pos-badge-other";
      return `
        <div class="driver-card" onclick="showDriverModal(${d.id})" data-id="${d.id}">
          <div class="driver-card-header">
            <div class="driver-avatar" style="background:${cls?.color || "#888"}22;color:${cls?.color || "#888"};border:2px solid ${cls?.color || "#888"}44">
              ${d.car}
            </div>
            <div class="driver-info">
              <div class="driver-card-name">${d.name}</div>
              <div class="driver-card-car">${d.vehicle}</div>
            </div>
            <div class="driver-pos-badge ${posClass}">P${d.overallPos}</div>
          </div>
          <div class="driver-stats-row">
            <div class="driver-stat">
              <div class="driver-stat-value">${d.sessions.race1?.bestLap || "—"}</div>
              <div class="driver-stat-label">Best Lap</div>
            </div>
            <div class="driver-stat">
              <div class="driver-stat-value" style="color:${cls?.color || "#888"}">${d.class}</div>
              <div class="driver-stat-label">Class</div>
            </div>
            <div class="driver-stat">
              <div class="driver-stat-value" style="color:var(--accent-primary)">${d.sessions.race1?.laps || d.totalLaps || "—"}</div>
              <div class="driver-stat-label">Laps</div>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  // ─── Driver Modal ─────────────────────────
  window.showDriverModal = function (driverId) {
    const d = RACE_DATA.drivers.find((dr) => dr.id === driverId);
    if (!d) return;
    selectedDriverId = driverId;

    const modal = document.getElementById("driver-modal");
    const overlay = document.getElementById("driver-modal-overlay");
    if (!modal || !overlay) return;

    const cls = RACE_DATA.classes[d.class];

    // Header
    document.getElementById("modal-driver-name").textContent = d.name;
    document.getElementById("modal-driver-sub").textContent = `#${d.car} · ${d.vehicle} · ${d.class}`;

    // Lap details
    const lapTableBody = document.getElementById("modal-lap-table");
    const sessionOrder = ["practice1", "practice2", "qualifying", "race1", "race2"];
    const sessions = Object.keys(d.sessions || {}).sort((a, b) => {
      const ai = sessionOrder.indexOf(a);
      const bi = sessionOrder.indexOf(b);
      const ar = ai === -1 ? 999 : ai;
      const br = bi === -1 ? 999 : bi;
      return ar - br || a.localeCompare(b);
    });

    lapTableBody.innerHTML = sessions.map((s) => {
      const sess = d.sessions[s];
      if (!sess) return "";
      const isRace = s.startsWith("race");
      const lapTimes = (sess.lapTimes || []).slice(1);
      if (!lapTimes.length) return "";
      const fastestTime = Math.min(...lapTimes.map(parseTime).filter(Boolean));
      const sessionName = getSessionLabel(s);

      const lapRows = lapTimes.map((t, li) => {
        const secs = parseTime(t);
        const isBest = secs && Math.abs(secs - fastestTime) < 0.001;
        return `
          <tr class="${isBest ? "lap-highlight" : ""}">
            <td>${sessionName}</td>
            <td>${li + 1}</td>
            <td style="color:${isBest ? "#a855f7" : "var(--text-primary)"}">
              ${t || "—"} ${isBest ? "⚡" : ""}
            </td>
            <td>${isRace && li === 0 ? "—" : secs && li > 0 ? (secs - parseTime(lapTimes[li - 1]) >= 0 ? "+" : "") + (secs - parseTime(lapTimes[li - 1])).toFixed(3) + "s" : "—"}</td>
          </tr>
        `;
      }).join("");

      return `
        <tr style="background:var(--bg-secondary)">
          <td colspan="4" style="font-weight:700;color:var(--accent-primary);padding:10px 12px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">${sessionName} — Best: ${sess.bestLap} (${sess.laps || lapTimes.length} laps)</td>
        </tr>
        ${lapRows}
      `;
    }).join("");

    // Mini chart — all runs for this round
    const chartCtx = document.getElementById("modal-lap-chart");
    if (chartCtx) {
      if (charts["modal-chart"]) charts["modal-chart"].destroy();
      const sessionSeries = sessions
        .map((s, i) => {
          const times = (d.sessions[s]?.lapTimes || []).slice(1).map(parseTime).filter(Boolean);
          if (!times.length) return null;
          const color = s === "race1" ? (cls?.color || PALETTE[0]) : PALETTE[i % PALETTE.length];
          return {
            label: getSessionLabel(s),
            data: times,
            borderColor: color,
            backgroundColor: color + "22"
          };
        })
        .filter(Boolean);
      const maxLen = Math.max(...sessionSeries.map((x) => x.data.length), 0);
      if (!sessionSeries.length || !maxLen) return;

      charts["modal-chart"] = new Chart(chartCtx, {
        type: "line",
        data: {
          labels: Array.from({ length: maxLen }, (_, i) => "L" + (i + 1)),
          datasets: sessionSeries.map((series) => ({
            label: series.label,
            data: series.data,
            borderColor: series.borderColor,
            backgroundColor: series.backgroundColor,
            tension: 0.3,
            fill: true,
            pointRadius: 3,
            borderWidth: 2
          }))
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: "#8892a4", padding: 8, font: { size: 11 } } },
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${formatTime(ctx.parsed.y)}` } }
          },
          scales: {
            x: { grid: { color: "#252d3d" }, ticks: { color: "#8892a4", font: { size: 10 } } },
            y: { grid: { color: "#252d3d" }, ticks: { color: "#8892a4", callback: (v) => formatTime(v), font: { size: 10 } } }
          }
        }
      });
    }

    // Summary stats
    const sessionKey = getPrimarySessionKey();
    const sessionLabel = getSessionLabel(sessionKey);
    const attackWindow = getAttackWindow(d, sessionKey, 5);
    document.getElementById("modal-summary").innerHTML = `
      <div class="grid-4" style="gap:12px;margin-bottom:20px">
        ${[
          { icon: "🏆", label: "Overall Pos", value: "P" + d.overallPos, color: "#e8b84b" },
          { icon: "⚡", label: `${sessionLabel} Best Lap`, value: d.sessions[sessionKey]?.bestLap || "—", color: cls?.color || "#888" },
          { icon: "🎯", label: "Best 5-Lap Avg", value: attackWindow ? formatTime(attackWindow.avg) : "—", color: "#4facfe" },
          { icon: "🔢", label: `${sessionLabel} Laps`, value: d.sessions[sessionKey]?.laps || d.totalLaps || "—", color: "#26de81" }
        ].map(({ icon, label, value, color }) => `
          <div style="background:var(--bg-secondary);border-radius:8px;padding:14px;text-align:center;border:1px solid var(--border-color)">
            <div style="font-size:20px">${icon}</div>
            <div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:${color};margin:4px 0">${value}</div>
            <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px">${label}</div>
          </div>
        `).join("")}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;font-size:13px;color:var(--text-secondary)">
        <span>🚗 ${d.vehicle} (${d.year})</span>
        <span>🏎️ ${d.capacity.toLocaleString()}cc</span>
        <span>🔢 ${d.totalLaps} total laps</span>
        ${attackWindow ? `<span>🎯 Attack window L${attackWindow.startLap}-L${attackWindow.endLap}</span>` : ""}
        <span>🏁 ${d.club}</span>
        <span style="color:${cls?.color || '#888'}">📋 ${d.class} — ${cls?.name || ""}</span>
      </div>
    `;

    overlay.classList.add("open");
  };

  window.closeModal = function () {
    const overlay = document.getElementById("driver-modal-overlay");
    if (overlay) overlay.classList.remove("open");
  };

  // ─── Entry Point ──────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
