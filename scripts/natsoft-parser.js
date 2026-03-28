/**
 * Natsoft HTML Parser
 * Extracts race results and lap times from Natsoft pre-formatted HTML tables
 * 
 * Usage in Node.js:
 *   const parser = require('./natsoft-parser.js');
 *   const raceData = parser.parseRace(resultHtml, lapTimesHtml, eventMetadata);
 * 
 * Usage in Browser:
 *   const raceData = parseRace(resultHtml, lapTimesHtml, eventMetadata);
 */

// ─── Utility Functions ─────────────────────────────────────────────────────────

/**
 * Parse time string from Natsoft format (M:SS.SSSS) to seconds
 * @param {string} timeStr - Time in M:SS.SSSS or MM:SS.SSSS format
 * @returns {number|null} - Time in seconds, or null if invalid
 */
function parseTimeToSeconds(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const match = timeStr.match(/^(\d+):(\d{2}\.\d+)$/);
  if (!match) return null;
  const minutes = parseInt(match[1], 10);
  const seconds = parseFloat(match[2]);
  return minutes * 60 + seconds;
}

/**
 * Format seconds to MM:SS.SSSS format
 * @param {number} seconds - Time in seconds
 * @returns {string} - Formatted time
 */
function formatTimeFromSeconds(seconds) {
  if (seconds == null || isNaN(seconds)) return null;
  const m = Math.floor(seconds / 60);
  const s = (seconds - m * 60).toFixed(4);
  return `${m}:${s.padStart(7, '0')}`;
}

function decodeHtmlEntities(text) {
  if (!text || typeof text !== 'string') return '';

  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

function normalizeHtmlText(html) {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?u>/gi, '')
      .replace(/<\/(div|pre|p|h4|tr|td)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ');
}

function extractLines(html) {
  return normalizeHtmlText(html)
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''));
}

/**
 * Extract text content from HTML element
 * @param {string|HTMLElement} html - HTML string or element
 * @returns {string} - Plain text
 */
function getTextContent(html) {
  if (typeof html === 'string') {
    return normalizeHtmlText(html);
  }
  return html.textContent || html.innerText || '';
}

function parseResultRow(line) {
  const baseMatch = line.match(/^\s*(DNF|\d+)\s+(\d+)\s+(.+?)\s+\(([A-Z]{2,3})\)\s+(.*)$/);
  if (!baseMatch) return null;

  const [, posToken, car, name, state, tail] = baseMatch;
  const columns = tail.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);
  if (columns.length < 4) return null;

  const isDnf = posToken === 'DNF';
  const team = columns[0] || '';
  const vehicle = columns[1] || '';
  const capacity = columns[2] || '';
  const raceClass = columns[3] || '';
  const laps = columns[4] || null;
  const raceTime = columns[5] || null;
  const fastestInfo = columns[6] || '';
  const fastestMatch = fastestInfo.match(/^(\d+)\s+([0-9:.]+)\*?$/);

  return {
    car: parseInt(car, 10),
    name: name.trim(),
    state,
    team,
    vehicle,
    capacity: capacity ? parseInt(capacity, 10) : null,
    class: raceClass,
    pos: isDnf ? null : parseInt(posToken, 10),
    dnf: isDnf,
    laps: laps && /^\d+$/.test(laps) ? parseInt(laps, 10) : null,
    raceTime,
    fastestLapNum: fastestMatch ? parseInt(fastestMatch[1], 10) : null,
    fastestLap: fastestMatch ? fastestMatch[2] : null
  };
}

/**
 * Parse Result.html to extract final results and race information
 * @param {string} resultHtml - HTML content of Result.html
 * @returns {object} - { eventMetadata, drivers }
 */
function parseResultsTable(resultHtml) {
  const drivers = [];
  const metadata = { laps: 15, lapsCompleted: 0 };
  const text = normalizeHtmlText(resultHtml);
  
  // Extract event metadata from header
  const headerMatch = text.match(/HERA Excel - Race (\d+)/i);
  if (headerMatch) metadata.raceNumber = parseInt(headerMatch[1], 10);

  const lapsMatch = text.match(/(\d+) Laps/);
  if (lapsMatch) metadata.laps = parseInt(lapsMatch[1], 10);

  // Extract venue
  const venueMatch = text.match(/WINTON MOTOR RACEWAY/i);
  if (venueMatch) metadata.venue = 'WINTON MOTOR RACEWAY';

  // Extract date from format "Start Sat Mar 21   12:07"
  const dateMatch = text.match(/Start\s+\w+\s+(\w+)\s+(\d+)/);
  if (dateMatch) {
    metadata.eventMonth = dateMatch[1];
    metadata.eventDay = parseInt(dateMatch[2], 10);
  }

  extractLines(resultHtml)
    .filter((line) => /^\s*(?:DNF|\d+)\s+\d+\s+/.test(line))
    .forEach((line) => {
      const parsed = parseResultRow(line);
      if (parsed) drivers.push(parsed);
    });

  return { metadata, drivers };
}

/**
 * Parse Lap Times.html to extract individual lap times
 * @param {string} lapTimesHtml - HTML content of Lap Times.html
 * @returns {object} - { drivers: { carNumber: { name, class, lapTimes, fastestLapNum } } }
 */
function parseLapTimesTable(lapTimesHtml) {
  const drivers = {};
  const lines = extractLines(lapTimesHtml);
  let currentDriver = null;
  let currentLapTimes = [];
  let currentClass = null;

  lines.forEach((line) => {
    const classMatch = line.match(/^([A-Z]{3})\s{2,}/);
    if (classMatch) {
      currentClass = classMatch[1];
      return;
    }

    const driverMatch = line.match(/^\s*(\d+)\s+(.+?)\s{2,}((?:\d+:\d{2}\.\d+\s*p?\s*)+)$/);
    if (driverMatch) {
      if (currentDriver) {
        drivers[currentDriver.car] = {
          name: currentDriver.name,
          class: currentClass,
          lapTimes: currentLapTimes,
          fastestLapNum: findFastestLapNumber(currentLapTimes)
        };
      }

      currentDriver = {
        car: parseInt(driverMatch[1], 10),
        name: driverMatch[2].trim()
      };
      currentLapTimes = extractLapTimes(driverMatch[3]);
      return;
    }

    const continuationMatch = line.match(/^\s*\d+\s+((?:\d+:\d{2}\.\d+\s*p?\s*)+)$/);
    if (continuationMatch && currentDriver) {
      currentLapTimes.push(...extractLapTimes(continuationMatch[1]));
    }
  });

  // Save last driver
  if (currentDriver) {
    drivers[currentDriver.car] = {
      name: currentDriver.name,
      class: currentClass,
      lapTimes: currentLapTimes,
      fastestLapNum: findFastestLapNumber(currentLapTimes)
    };
  }

  return drivers;
}

function extractLapTimes(segment) {
  const matches = segment.match(/\d+:\d{2}\.\d+/g);
  return matches ? matches : [];
}

/**
 * Find which lap number had the fastest time
 * @param {array} lapTimes - Array of time strings
 * @returns {number} - Index (1-based) of fastest lap, or null
 */
function findFastestLapNumber(lapTimes) {
  if (!lapTimes || lapTimes.length === 0) return null;

  let fastestIdx = 0;
  let fastestTime = Infinity;

  lapTimes.forEach((time, idx) => {
    const seconds = parseTimeToSeconds(time);
    if (seconds !== null && seconds < fastestTime) {
      fastestTime = seconds;
      fastestIdx = idx;
    }
  });

  return fastestTime === Infinity ? null : fastestIdx + 1;
}

/**
 * Calculate statistics from lap times
 * @param {array} lapTimes - Array of time strings
 * @returns {object} - { avgLap, bestLap, consistency, improvement }
 */
function calculateLapStats(lapTimes) {
  if (!lapTimes || lapTimes.length === 0) {
    return { avgLap: null, bestLap: null, consistency: 0, improvement: 0 };
  }

  const seconds = lapTimes
    .map(t => parseTimeToSeconds(t))
    .filter(s => s !== null && s > 60); // Filter out safety car laps and abnormal times

  if (seconds.length === 0) {
    return { avgLap: null, bestLap: null, consistency: 0, improvement: 0 };
  }

  const bestLap = Math.min(...seconds);
  const avgLap = seconds.reduce((a, b) => a + b, 0) / seconds.length;

  // Consistency: standard deviation
  const sqDiffs = seconds.map(s => Math.pow(s - avgLap, 2));
  const variance = sqDiffs.reduce((a, b) => a + b, 0) / seconds.length;
  const consistency = Math.sqrt(variance);

  // Improvement: trend from first normal lap to last
  const firstNormalLap = seconds[0];
  const lastNormalLap = seconds[seconds.length - 1];
  const improvement = firstNormalLap - lastNormalLap;

  return {
    avgLap: formatTimeFromSeconds(avgLap),
    bestLap: formatTimeFromSeconds(bestLap),
    consistency: Math.round(consistency * 1000) / 1000,
    improvement: Math.round(improvement * 1000) / 1000
  };
}

/**
 * Merge results and lap times data
 * @param {object} resultsData - Output from parseResultsTable
 * @param {object} lapTimesData - Output from parseLapTimesTable
 * @returns {array} - Merged driver array with all data
 */
function mergeDriverData(resultsData, lapTimesData) {
  const { drivers: resultDrivers } = resultsData;

  return resultDrivers.map(driver => {
    const lapData = lapTimesData[driver.car];

    const mergedDriver = { ...driver };

    if (lapData) {
      mergedDriver.lapTimes = lapData.lapTimes;
      const stats = calculateLapStats(lapData.lapTimes);
      mergedDriver.stats = stats;

      // Verify fastest lap consistency
      if (!driver.dnf && driver.fastestLapNum && lapData.lapTimes[driver.fastestLapNum - 1]) {
        const verifiedFastestLap = lapData.lapTimes[driver.fastestLapNum - 1];
        if (verifiedFastestLap !== driver.fastestLap) {
          console.warn(
            `Fastest lap mismatch for ${driver.name}: ` +
            `Result says lap ${driver.fastestLapNum} (${driver.fastestLap}), ` +
            `but lap times show ${verifiedFastestLap}`
          );
        }
      }
    }

    return mergedDriver;
  });
}

/**
 * Main parser function - Combine results and lap times
 * @param {string} resultHtml - Content of Result.html
 * @param {string} lapTimesHtml - Content of Lap Times.html
 * @param {object} eventMetadata - Event details: { date, venue, round, championship, category }
 * @returns {object} - Complete race data ready for integration into data.js
 */
function parseRace(resultHtml, lapTimesHtml, eventMetadata = {}) {
  if (!resultHtml || !lapTimesHtml) {
    throw new Error('Both resultHtml and lapTimesHtml are required');
  }

  // Parse both documents
  const resultsData = parseResultsTable(resultHtml);
  const lapTimesData = parseLapTimesTable(lapTimesHtml);

  // Merge driver data
  const drivers = mergeDriverData(resultsData, lapTimesData);

  // Combine metadata
  const fullMetadata = {
    date: eventMetadata.date || new Date().toISOString().split('T')[0],
    venue: eventMetadata.venue || resultsData.metadata.venue || 'Unknown Venue',
    round: eventMetadata.round || 1,
    laps: eventMetadata.laps || resultsData.metadata.laps || 15,
    championship: eventMetadata.championship || 'Victorian Motor Race Championship',
    category: eventMetadata.category || 'HERA Excel',
    ...resultsData.metadata,
    ...eventMetadata
  };

  // Calculate gap to leader
  const finisher = drivers.find(d => !d.dnf && d.raceTime);
  if (finisher) {
    const leaderTime = parseTimeToSeconds(finisher.raceTime);
    drivers.forEach(driver => {
      if (!driver.dnf && driver.raceTime) {
        const driverTime = parseTimeToSeconds(driver.raceTime);
        driver.gap = formatTimeFromSeconds(driverTime - leaderTime);
      } else {
        driver.gap = '—';
      }
    });
  }

  return {
    event: fullMetadata,
    drivers: drivers
  };
}

/**
 * Format race data into data.js structure
 * @param {object} raceData - Output from parseRace()
 * @returns {object} - Ready to push into ALL_ROUNDS array
 */
function formatForDataJs(raceData) {
  return {
    event: raceData.event,
    drivers: raceData.drivers.map(driver => ({
      car: driver.car,
      name: driver.name,
      state: driver.state,
      team: driver.team,
      vehicle: driver.vehicle,
      capacity: driver.capacity,
      class: driver.class,
      sessions: {
        race1: {
          pos: driver.pos,
          laps: driver.laps,
          time: driver.raceTime,
          bestLap: driver.fastestLap,
          fastestLapNum: driver.fastestLapNum,
          gap: driver.gap,
          dnf: driver.dnf,
          lapTimes: driver.lapTimes,
          stats: driver.stats
        }
      }
    }))
  };
}

// ─── Export (for Node.js) ──────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseRace,
    parseResultsTable,
    parseLapTimesTable,
    formatForDataJs,
    parseTimeToSeconds,
    formatTimeFromSeconds
  };
}
