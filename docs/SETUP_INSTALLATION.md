# Complete Setup and Installation - Live Natsoft Crawl

## Status
This setup reflects the currently successful live method.
reference/ is a learning dataset only and not for live fallback.

## Prerequisites
1. Python 3.12+ in this workspace virtual environment.
2. Node.js for parser validation commands.

## Install
1. Configure workspace Python environment.
2. Install Playwright package:

.\.venv\Scripts\python.exe -m pip install playwright

3. Install Chromium browser:

.\.venv\Scripts\python.exe -m playwright install chromium

## Live Crawl
.\.venv\Scripts\python.exe .\scripts\natsoft-live-browser-scraper.py --year 2026 --meeting-text "Victorian Motor Race Championship - Round 1 (VMRC)" --event-text "HERA Excel - Race 1" --event-id 677968176

## Validate Parse
node -e "const fs=require('fs'); const parser=require('./scripts/natsoft-parser'); const r=fs.readFileSync('./data/downloads/677968176_Result_hera-excel-race-1_live.html','utf8'); const t=fs.readFileSync('./data/downloads/677968176_Times_hera-excel-race-1_live.html','utf8'); const race=parser.parseRace(r,t,{round:1,venue:'Winton Motor Raceway',championship:'Victorian Motor Race Championship - Round 1 (VMRC)',category:'HERA Excel'}); console.log(JSON.stringify({drivers:race.drivers.length,leader:race.drivers[0]?.name},null,2));"

## Output Location
data/downloads/

## Explicitly Not Supported as Primary Live Method
1. Legacy direct URL downloader flows.
2. Hardcoded object URL lists.
3. Using reference/ files as runtime source.

## Related Documentation
1. LIVE_BROWSER_CRAWL_GUIDE.md
2. DOWNLOAD_SCRIPTS_GUIDE.md
3. INTEGRATION_GUIDE.md
4. QUICK_REFERENCE.md
