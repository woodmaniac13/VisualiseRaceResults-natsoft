# Live Browser Crawl Guide (Natsoft)

This guide documents the successful method to crawl Natsoft and extract the requested data by navigating the live website in a real browser session.

Scope:
- Starts at the Natsoft home page: http://racing.natsoft.com.au/
- Uses browser navigation only
- Does not use local reference HTML as a source
- Targets meeting: Victorian Motor Race Championship - Round 1 (VMRC)
- Targets event: HERA Excel - Race 1

## Why This Works

Natsoft result links include dynamic object paths that can change between sessions. Hardcoded URLs can fail even when the meeting is still accessible through the UI.

Reliable approach:
1. Open the home page.
2. Click Circuit Racing.
3. Set Year.
4. Open the meeting row.
5. Extract Result/Times/Chart links from the event list shown by the site.
6. Save those pages immediately.

## Script Used

File:
- scripts/natsoft-live-browser-scraper.py

What it does:
1. Opens http://racing.natsoft.com.au/
2. Clicks the Circuit Racing tile.
3. Selects year (default 2026).
4. Finds a meeting row by meeting text.
5. Opens that meeting.
6. Finds event links for the requested event.
7. Saves live Result/Times/Chart HTML.
8. Writes a JSON summary with discovered links and statuses.

## One-Time Setup

1. Configure Python environment in this workspace.
2. Install dependencies:

.\.venv\Scripts\python.exe -m pip install playwright

3. Install Chromium for Playwright:

.\.venv\Scripts\python.exe -m playwright install chromium

## Crawl Command

Run from the repository root:

.\.venv\Scripts\python.exe .\scripts\natsoft-live-browser-scraper.py --year 2026 --meeting-text "Victorian Motor Race Championship - Round 1 (VMRC)" --event-text "HERA Excel - Race 1" --event-id 677968176

Optional:
- Add --headful to watch browser actions.
- Change --output-dir if needed.

## Expected Outputs

By default, files are written to data/downloads.

Expected files:
1. 677968176_Result_hera-excel-race-1_live.html
2. 677968176_Times_hera-excel-race-1_live.html
3. 677968176_Chart_hera-excel-race-1_live.html
4. 677968176_hera-excel-race-1_live_summary.json

The summary JSON includes:
- meeting row selected
- event link bundle discovered
- saved file paths
- save status per page
- usedLocalReference: false

## Data Verification

After crawling, validate parse output:

node -e "const fs=require('fs'); const parser=require('./scripts/natsoft-parser'); const r=fs.readFileSync('./data/downloads/677968176_Result_hera-excel-race-1_live.html','utf8'); const t=fs.readFileSync('./data/downloads/677968176_Times_hera-excel-race-1_live.html','utf8'); const race=parser.parseRace(r,t,{round:1,venue:'Winton Motor Raceway',championship:'Victorian Motor Race Championship - Round 1 (VMRC)',category:'HERA Excel'}); console.log(JSON.stringify({drivers:race.drivers.length,leader:race.drivers[0]?.name,firstCar:race.drivers[0]?.car},null,2));"

Successful validation observed:
- drivers: 33
- leader: Ethan Grigg-Gault
- firstCar: 1

## Operational Notes

1. Dynamic links are expected.
- Object paths like object_XXXXX can change.
- Do not persist old links as authoritative.

2. Always crawl from the homepage path.
- Homepage -> Circuit Racing -> Year -> Meeting -> Event links.

3. If one run fails, rerun.
- A rerun usually produces a fresh object path and succeeds.

4. Keep meeting and event text specific.
- More specific strings reduce false row matches.

## Troubleshooting

1. Year filter not found
- Increase timeout with --timeout-ms 60000.
- Use --headful and confirm the Circuit Racing screen is visible.

2. Meeting not found
- Verify exact meeting text for the selected year.
- Try a broader meeting fragment (for example: "Victorian Motor Race Championship").

3. Event not found
- Verify event text in the opened meeting page.
- Try a broader event fragment (for example: "HERA Excel").

4. Result/Times/Chart page save error
- Rerun the crawl; dynamic links may have expired.
- Keep extraction and save in the same run.

## Recommended Workflow

1. Run scripts/natsoft-live-browser-scraper.py.
2. Check the live summary JSON.
3. Parse Result and Times HTML with scripts/natsoft-parser.js.
4. Generate downstream JSON artifacts for UI integration.

This is the documented successful live crawl method used for the requested VMRC Winton HERA Excel event.
