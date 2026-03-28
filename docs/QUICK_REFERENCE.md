# Natsoft Quick Reference - Live Only

## Rule
For live crawling, do not use reference/ as fallback.
reference/ is learning and validation data only.

## Run Live Crawl
.\.venv\Scripts\python.exe .\scripts\natsoft-live-browser-scraper.py --year 2026 --meeting-text "Victorian Motor Race Championship - Round 1 (VMRC)" --event-text "HERA Excel - Race 1" --event-id 677968176

## Parse Live Outputs
node -e "const fs=require('fs'); const parser=require('./scripts/natsoft-parser'); const r=fs.readFileSync('./data/downloads/677968176_Result_hera-excel-race-1_live.html','utf8'); const t=fs.readFileSync('./data/downloads/677968176_Times_hera-excel-race-1_live.html','utf8'); const race=parser.parseRace(r,t,{round:1,venue:'Winton Motor Raceway',championship:'Victorian Motor Race Championship - Round 1 (VMRC)',category:'HERA Excel'}); console.log(JSON.stringify({drivers:race.drivers.length,leader:race.drivers[0]?.name},null,2));"

## Success Criteria
1. Summary file exists in data/downloads.
2. Result and Times live files exist.
3. Parser returns non-zero drivers.

## Known Failure Modes
1. Hardcoded object URLs return 404.
2. Non-browser direct URL scraping misses dynamic routing/session context.
