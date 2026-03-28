# Natsoft Data Integration Guide - Live Workflow

## Policy
1. Live data acquisition must use browser navigation.
2. reference/ is a learning and validation dataset only.
3. reference/ is never a live fallback source.

## Source of Truth
Use LIVE_BROWSER_CRAWL_GUIDE.md for crawl steps.

## End-to-End Steps
1. Run live crawl with scripts/natsoft-live-browser-scraper.py.
2. Confirm *_live_summary.json shows usedLocalReference: false.
3. Parse live Result and Times files with scripts/natsoft-parser.js.
4. Transform parser output to app schema.
5. Add round to data.js or load generated JSON.

## Live Crawl Command
.\.venv\Scripts\python.exe .\scripts\natsoft-live-browser-scraper.py --year 2026 --meeting-text "Victorian Motor Race Championship - Round 1 (VMRC)" --event-text "HERA Excel - Race 1" --event-id 677968176

## Parse Command
node -e "const fs=require('fs'); const parser=require('./scripts/natsoft-parser'); const r=fs.readFileSync('./data/downloads/677968176_Result_hera-excel-race-1_live.html','utf8'); const t=fs.readFileSync('./data/downloads/677968176_Times_hera-excel-race-1_live.html','utf8'); const race=parser.parseRace(r,t,{round:1,venue:'Winton Motor Raceway',championship:'Victorian Motor Race Championship - Round 1 (VMRC)',category:'HERA Excel'}); console.log(JSON.stringify({drivers:race.drivers.length,leader:race.drivers[0]?.name,event:race.event},null,2));"

## Integration Targets
1. Event metadata: date, venue, round, championship, category.
2. Driver records: car, name, state, class, position, raceTime, fastestLap, lapTimes.
3. Session mapping: store under sessions.race1 in data.js-compatible structure.

## Deprecated or Failed Methods
1. Hardcoded direct object URLs for Result/Times/Chart.
2. Direct downloader-only flows as primary live crawler.
3. Any method that uses reference/ files to recover live crawl failures.

## Validation Checklist
1. Live summary exists and reports link bundle from current run.
2. Result and Times live files were saved in same run.
3. parseRace returns expected driver count (>0).
4. Parsed leader and key metadata match expected meeting/event.
