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
    const times = RACE_DATA.drivers
      .map((d) => parseTime(d.sessions.race1?.bestLap))
      .filter(Boolean);
    return times.length ? Math.floor(Math.min(...times)) - 3 : 55;
  }

  // ─── Init ──────────────────────────────────
  function init() {
    buildRoundSelector();
    attachResultsEvents();
    renderAll();
    attachNavEvents();
    activatePanel("overview");
  }

  // Build the round selector dropdown from ALL_ROUNDS
  function buildRoundSelector() {
    const sel = document.getElementById("round-selector");
    if (!sel) return;
    sel.innerHTML = ALL_ROUNDS.map((r, i) => {
      const d = new Date(r.event.date);
      const label = `Round ${r.event.round} — ${r.event.venue.replace("Sydney Motorsport Park — ", "SMSP ")} (${d.toLocaleDateString("en-AU", { day: "numeric", month: "short" })})`;
      return `<option value="${i}">${label}</option>`;
    }).join("");
    sel.value = "0";
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
    // Reset the results session selector to Run 3
    const sessionSel = document.getElementById("result-session-select");
    if (sessionSel) sessionSel.value = "race1";
    const classFilter = document.getElementById("result-class-filter");
    if (classFilter) classFilter.value = "all";
    const searchInput = document.getElementById("result-search");
    if (searchInput) searchInput.value = "";
    activatePanel(currentPanel);
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
    const tab = document.querySelector(`[data-panel="${id}"]`);
    if (panel) panel.classList.add("active");
    if (tab) tab.classList.add("active");

    // Trigger chart resize for visibility changes
    setTimeout(() => {
      Object.values(charts).forEach((c) => c && c.resize && c.resize());
    }, 50);
  }

  function attachNavEvents() {
    document.querySelectorAll(".nav-tab").forEach((tab) => {
      tab.addEventListener("click", () => activatePanel(tab.dataset.panel));
    });

    // Mobile menu
    const mobileBtn = document.getElementById("mobile-menu-btn");
    const mobileMenu = document.getElementById("mobile-menu");
    if (mobileBtn && mobileMenu) {
      mobileBtn.addEventListener("click", () => {
        mobileMenu.style.display = mobileMenu.style.display === "flex" ? "none" : "flex";
      });
    }

    // Modal close
    document.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal-overlay")) closeModal();
      if (e.target.classList.contains("modal-close")) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
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
    document.getElementById("hero-round").textContent = "Round " + d.event.round;
    document.getElementById("stat-entries").textContent = d.drivers.length;
    document.getElementById("stat-classes").textContent = numClasses;
    document.getElementById("stat-record").textContent = d.records.fastestRaceLap.time;
    document.getElementById("stat-laps").textContent = totalLaps;
    const badge = document.getElementById("hero-round-badge");
    if (badge) badge.textContent = "Round " + d.event.round;
  }

  // ─── Overview Panel ───────────────────────
  function renderOverview() {
    renderPodium("race1");
    renderPodium("practice2");
    renderMiniLeaderboard();
    renderRecordCards();
    renderOverviewCharts();
    renderClassBreakdown();
  }

  function renderPodium(session) {
    // podium-race2 is used for the second podium card in HTML
    const id = session === "practice2" ? "podium-race2" : `podium-${session}`;
    const el = document.getElementById(id);
    if (!el) return;

    const top3 = RACE_DATA.drivers
      .filter((d) => d.sessions[session])
      .sort((a, b) => (parseTime(a.sessions[session].bestLap) || 999) - (parseTime(b.sessions[session].bestLap) || 999))
      .slice(0, 3);

    if (top3.length < 3) { el.innerHTML = "<div style='color:var(--text-muted);padding:16px;font-size:13px'>No data</div>"; return; }

    const labels = [2, 1, 3];
    const orderedTop3 = [top3[1], top3[0], top3[2]];
    const positions = [2, 1, 3];

    el.innerHTML = orderedTop3
      .map((d, i) => {
        const pos = positions[i];
        const medal = pos === 1 ? "🥇" : pos === 2 ? "🥈" : "🥉";
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

  function renderMiniLeaderboard() {
    const el = document.getElementById("mini-leaderboard");
    if (!el) return;
    const sorted = [...RACE_DATA.drivers].sort((a, b) => a.overallPos - b.overallPos);
    el.innerHTML = sorted
      .map((d) => {
        const posClass = d.overallPos <= 3 ? `pos-${d.overallPos}` : "";
        const cls = RACE_DATA.classes[d.class];
        return `
          <div class="points-bar" onclick="showDriverModal(${d.id})" style="cursor:pointer">
            <span class="points-pos ${posClass}">${d.overallPos}</span>
            <span class="points-name">
              <span class="driver-name">${d.name}</span>
              <span style="margin-left:8px" class="class-badge" style="border-color:${cls ? cls.color : "#888"};color:${cls ? cls.color : "#888"}">${d.class}</span>
            </span>
            <div class="points-track">
              <div class="points-fill" style="width:${(d.points / 60) * 100}%"></div>
            </div>
            <span class="points-value">${d.points}</span>
          </div>
        `;
      })
      .join("");
  }

  function renderRecordCards() {
    const r = RACE_DATA.records;
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
    setRecord("record-fastest-lap", "⚡", "#a855f7", r.fastestLap.time, "Fastest Overall Lap", `#${RACE_DATA.drivers.find(d=>d.car===r.fastestLap.car)?.car} ${r.fastestLap.driver} (${r.fastestLap.session})`);
    setRecord("record-fastest-race", "🏁", "#e8b84b", r.fastestRaceLap.time, "Fastest Race Lap", `#${r.fastestRaceLap.car} ${r.fastestRaceLap.driver} (${r.fastestRaceLap.session})`);
    setRecord("record-most-laps", "🔢", "#4facfe", r.mostLaps.laps + " Laps", "Most Laps Completed", RACE_DATA.drivers.find(d=>d.car===r.mostLaps.car)?.name + " (#" + r.mostLaps.car + ")");
    setRecord("record-entries", "👥", "#26de81", RACE_DATA.drivers.length + " Cars", "Total Entries", `Across ${Object.keys(RACE_DATA.classes).length} Classes`);
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
        maintainAspectRatio: true,
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

    const sessions = ["practice1", "practice2", "race1"];
    const sessionLabels = ["Run 1", "Run 2", "Run 3"];
    const top5 = RACE_DATA.drivers.slice(0, 5);

    const datasets = top5.map((d, i) => ({
      label: d.name.split(" ")[0],
      data: sessions.map((s) => {
        const t = parseTime(d.sessions[s]?.bestLap);
        return t ? parseFloat(t.toFixed(3)) : null;
      }),
      borderColor: PALETTE[i],
      backgroundColor: PALETTE[i] + "22",
      tension: 0.3,
      fill: false,
      pointRadius: 5,
      pointHoverRadius: 7,
      spanGaps: true
    }));

    charts["session-comparison"] = new Chart(ctx, {
      type: "line",
      data: { labels: sessionLabels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { labels: { color: "#8892a4", padding: 12, font: { size: 11 } } },
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
            reverse: false
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
        maintainAspectRatio: true,
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
      // Consistency: how tight the lap time spread is (lower spread = better)
      const consistency = Math.max(0, 100 - (worstLap - bestLap) * 50);
      // Speed: how close to the round's fastest lap (0% gap = 100, each 1 s gap = -5)
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
        maintainAspectRatio: true,
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

    const sessions = ["practice1", "practice2", "race1"];
    const sessionLabels = ["R1", "R2", "R3"];
    const top6 = RACE_DATA.drivers.slice(0, 6);

    const datasets = top6.map((d, i) => ({
      label: `#${d.car} ${d.name.split(" ")[0]}`,
      data: sessions.map((s) => {
        const t = parseTime(d.sessions[s]?.bestLap);
        return t ? parseFloat(t.toFixed(3)) : null;
      }),
      backgroundColor: PALETTE[i] + "cc",
      borderColor: PALETTE[i],
      borderWidth: 2,
      borderRadius: 4,
      spanGaps: true
    }));

    charts["session-best"] = new Chart(ctx, {
      type: "bar",
      data: { labels: sessionLabels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: true,
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
        maintainAspectRatio: true,
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
        maintainAspectRatio: true,
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
    };
    selB.onchange = () => {
      compareDriverA = parseInt(selA.value);
      compareDriverB = parseInt(selB.value);
      refreshComparison();
    };
    refreshComparison();
  }

  function refreshComparison() {
    const dA = RACE_DATA.drivers.find((d) => d.id === compareDriverA) || RACE_DATA.drivers[0];
    const dB = RACE_DATA.drivers.find((d) => d.id === compareDriverB) || RACE_DATA.drivers[1];

    renderCompareHeaders(dA, dB);
    renderCompareStats(dA, dB);
    renderCompareLapChart(dA, dB);
  }

  function renderCompareHeaders(dA, dB) {
    const renderHeader = (id, d) => {
      const el = document.getElementById(id);
      if (!el) return;
      const cls = RACE_DATA.classes[d.class];
      el.innerHTML = `
        <div class="compare-driver-header">
          <div class="driver-avatar" style="background:${cls?.color || "#888"}22;color:${cls?.color || "#888"};border:2px solid ${cls?.color || "#888"}44">
            ${d.car}
          </div>
          <div>
            <div style="font-size:16px;font-weight:700">${d.name}</div>
            <div style="color:var(--text-secondary);font-size:12px">${d.vehicle} • <span style="color:${cls?.color || "#888"}">${d.class}</span></div>
            <div style="color:var(--text-muted);font-size:11px">${d.club}</div>
          </div>
          <div style="margin-left:auto;text-align:right">
            <div style="font-size:24px;font-weight:700;color:var(--accent-primary)">${d.points}pts</div>
            <div style="font-size:11px;color:var(--text-muted)">Overall P${d.overallPos}</div>
          </div>
        </div>
      `;
    };
    renderHeader("compare-header-a", dA);
    renderHeader("compare-header-b", dB);
  }

  function renderCompareStats(dA, dB) {
    const el = document.getElementById("compare-stats");
    if (!el) return;

    const colorA = RACE_DATA.classes[dA.class]?.color || PALETTE[0];
    const colorB = RACE_DATA.classes[dB.class]?.color || PALETTE[1];

    const stats = [
      { label: "Best Run 2 Lap", a: parseTime(dA.sessions.practice2?.bestLap), b: parseTime(dB.sessions.practice2?.bestLap), format: formatTime, lowerBetter: true },
      { label: "Best Run 3 Lap", a: parseTime(dA.sessions.race1?.bestLap), b: parseTime(dB.sessions.race1?.bestLap), format: formatTime, lowerBetter: true },
      { label: "Run 3 Position", a: dA.sessions.race1?.pos, b: dB.sessions.race1?.pos, format: (v) => "P" + v, lowerBetter: true },
      { label: "Run 2 Position", a: dA.sessions.practice2?.pos || dA.overallPos, b: dB.sessions.practice2?.pos || dB.overallPos, format: (v) => "P" + v, lowerBetter: true },
      { label: "Laps Completed", a: dA.sessions.race1?.laps, b: dB.sessions.race1?.laps, format: (v) => v + " laps", lowerBetter: false },
      { label: "Total Points", a: dA.points, b: dB.points, format: (v) => v + " pts", lowerBetter: false },
      { label: "Engine Capacity", a: dA.capacity, b: dB.capacity, format: (v) => v.toLocaleString() + "cc", lowerBetter: false }
    ];

    el.innerHTML = stats.map(({ label, a, b, format, lowerBetter }) => {
      if (!a || !b) return "";
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
  }

  function renderCompareLapChart(dA, dB) {
    const ctx = document.getElementById("chart-compare-laps");
    if (!ctx) return;
    if (charts["compare-laps"]) charts["compare-laps"].destroy();

    const colorA = RACE_DATA.classes[dA.class]?.color || PALETTE[0];
    const colorB = RACE_DATA.classes[dB.class]?.color || PALETTE[1];

    const lapTimesA = (dA.sessions.race1?.lapTimes || []).slice(1).map(parseTime).filter(Boolean);
    const lapTimesB = (dB.sessions.race1?.lapTimes || []).slice(1).map(parseTime).filter(Boolean);
    const maxLen = Math.max(lapTimesA.length, lapTimesB.length);
    const labels = Array.from({ length: maxLen }, (_, i) => `Lap ${i + 1}`);

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
        maintainAspectRatio: true,
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
          y: { grid: { color: "#252d3d" }, ticks: { color: "#8892a4", callback: (v) => formatTime(v) } }
        }
      }
    });
  }

  // ─── Gap Analysis ─────────────────────────
  function renderGapAnalysis() {
    renderGapBars("race1");
    renderGapBars("practice2");
    renderGapOverTimeChart();
  }

  function renderGapBars(session) {
    // Map session key to the HTML element ID
    const elId = session === "practice2" ? "gap-bars-race2" : `gap-bars-${session}`;
    const el = document.getElementById(elId);
    if (!el) return;

    const gaps = RACE_DATA.race1Gaps;

    // Dynamic max gap based on the actual data
    const gapTimes = gaps.slice(1).map((g) => {
      if (!g.gap || g.gap === "---") return 0;
      return parseTime(g.gap.replace("+", "")) || 0;
    }).filter((t) => t > 0 && t < 300);
    const maxGap = gapTimes.length ? Math.max(...gapTimes) * 1.15 : 10;

    el.innerHTML = gaps.map((g, i) => {
      const isLeader = i === 0;
      const gapSecs = isLeader ? 0 : (parseTime(g.gap.replace("+", "")) || 0);
      const pct = isLeader ? 2 : Math.min(100, (gapSecs / maxGap) * 100);

      return `
        <div class="gap-bar-item">
          <div class="gap-bar-name">${i + 1}. ${g.name.split(" ")[0]}</div>
          <div class="gap-bar-track">
            <div class="gap-bar-fill ${isLeader ? "gap-bar-leader" : ""}" style="width:${pct}%"></div>
          </div>
          <div class="gap-label">${isLeader ? "LEADER" : g.gap}</div>
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

    const labels = Array.from({ length: maxLaps }, (_, i) => `Lap ${i + 1}`);

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
        maintainAspectRatio: true,
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
              <div class="driver-stat-value" style="color:var(--accent-primary)">${d.points}</div>
              <div class="driver-stat-label">Points</div>
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
    const sessions = ["practice1", "practice2", "race1"];
    const sessionNames = ["Run 1", "Run 2", "Run 3 (Best)"];

    lapTableBody.innerHTML = sessions.map((s, si) => {
      const sess = d.sessions[s];
      if (!sess) return "";
      const isRace = s.startsWith("race");
      const lapTimes = (sess.lapTimes || []).slice(1);
      const fastestTime = Math.min(...lapTimes.map(parseTime).filter(Boolean));

      const lapRows = lapTimes.map((t, li) => {
        const secs = parseTime(t);
        const isBest = secs && Math.abs(secs - fastestTime) < 0.001;
        return `
          <tr class="${isBest ? "lap-highlight" : ""}">
            <td>${sessionNames[si]}</td>
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
          <td colspan="4" style="font-weight:700;color:var(--accent-primary);padding:10px 12px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">${sessionNames[si]} — Best: ${sess.bestLap} (${sess.laps} laps)</td>
        </tr>
        ${lapRows}
      `;
    }).join("");

    // Mini chart — all runs for this round
    const chartCtx = document.getElementById("modal-lap-chart");
    if (chartCtx) {
      if (charts["modal-chart"]) charts["modal-chart"].destroy();
      const run1Times = (d.sessions.practice1?.lapTimes || []).slice(1).map(parseTime).filter(Boolean);
      const run2Times = (d.sessions.practice2?.lapTimes || []).slice(1).map(parseTime).filter(Boolean);
      const run3Times = (d.sessions.race1?.lapTimes || []).slice(1).map(parseTime).filter(Boolean);
      const maxLen = Math.max(run1Times.length, run2Times.length, run3Times.length);

      charts["modal-chart"] = new Chart(chartCtx, {
        type: "line",
        data: {
          labels: Array.from({ length: maxLen }, (_, i) => "L" + (i + 1)),
          datasets: [
            { label: "Run 1", data: run1Times, borderColor: "#fd9644", backgroundColor: "#fd964422", tension: 0.3, fill: true, pointRadius: 3, borderWidth: 2 },
            { label: "Run 2", data: run2Times, borderColor: "#4facfe", backgroundColor: "#4facfe22", tension: 0.3, fill: true, pointRadius: 3, borderWidth: 2 },
            { label: "Run 3", data: run3Times, borderColor: cls?.color || PALETTE[0], backgroundColor: (cls?.color || PALETTE[0]) + "22", tension: 0.3, fill: true, pointRadius: 3, borderWidth: 2 }
          ]
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
    document.getElementById("modal-summary").innerHTML = `
      <div class="grid-4" style="gap:12px;margin-bottom:20px">
        ${[
          { icon: "🏆", label: "Overall Pos", value: "P" + d.overallPos, color: "#e8b84b" },
          { icon: "⚡", label: "Best Run 3 Lap", value: d.sessions.race1?.bestLap || "—", color: cls?.color || "#888" },
          { icon: "🔢", label: "Total Laps", value: d.totalLaps, color: "#4facfe" },
          { icon: "🏅", label: "Points", value: d.points, color: "#26de81" }
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
