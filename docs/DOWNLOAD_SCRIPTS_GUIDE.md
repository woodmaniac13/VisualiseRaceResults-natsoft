# Natsoft Download Scripts Guide - Current Status

## Status Summary
Primary method for live crawling is natsoft-live-browser-scraper.py.

Deprecated for live crawling:
1. Legacy direct downloader flows as primary live source.
2. Hardcoded direct object URL downloads.
3. Any fallback that reads reference/ as live input.

reference/ remains useful only for parser learning and regression testing.

## Recommended Script
scripts/natsoft-live-browser-scraper.py

What it does:
1. Opens Natsoft home page.
2. Navigates Circuit Racing in-browser.
3. Selects year and meeting.
4. Extracts live event Result/Times/Chart links.
5. Saves live pages and summary.

## Setup
1. Configure Python env in workspace.
2. Install Playwright:

.\.venv\Scripts\python.exe -m pip install playwright

3. Install Chromium:

.\.venv\Scripts\python.exe -m playwright install chromium

## Run
.\.venv\Scripts\python.exe .\scripts\natsoft-live-browser-scraper.py --year 2026 --meeting-text "Victorian Motor Race Championship - Round 1 (VMRC)" --event-text "HERA Excel - Race 1" --event-id 677968176

## Outputs
1. *_Result_*_live.html
2. *_Times_*_live.html
3. *_Chart_*_live.html
4. *_live_summary.json

All files are saved to data/downloads unless --output-dir is provided.

## Verify
node -e "const fs=require('fs'); const parser=require('./scripts/natsoft-parser'); const r=fs.readFileSync('./data/downloads/677968176_Result_hera-excel-race-1_live.html','utf8'); const t=fs.readFileSync('./data/downloads/677968176_Times_hera-excel-race-1_live.html','utf8'); const race=parser.parseRace(r,t,{round:1,venue:'Winton Motor Raceway',championship:'Victorian Motor Race Championship - Round 1 (VMRC)',category:'HERA Excel'}); console.log(JSON.stringify({drivers:race.drivers.length,leader:race.drivers[0]?.name},null,2));"

## See Also
1. LIVE_BROWSER_CRAWL_GUIDE.md
2. INTEGRATION_GUIDE.md
3. QUICK_REFERENCE.md
