# Data Aggregation Strategy - Live Natsoft Workflow

## Status
This strategy has been updated to match the proven live workflow.
Reference HTML under reference/ is a learning and validation dataset only.
Reference files are not a live fallback and must not be used as a live source.

## What Works Reliably
1. Navigate in a real browser from http://racing.natsoft.com.au/.
2. Click Circuit Racing.
3. Set Year.
4. Open the target meeting row.
5. Extract event Result/Times/Chart links from that page.
6. Save those pages immediately and parse them.

This process is automated in scripts/natsoft-live-browser-scraper.py and documented in docs/LIVE_BROWSER_CRAWL_GUIDE.md.

## What Failed and Must Not Be Primary
1. Hardcoded direct object URLs (for example object_xxxxx paths) are unstable and can return 404.
2. Direct download-only flows that skip browser navigation are not reliable for live crawling.
3. Using reference/ files as runtime fallback for live crawling is not allowed.

## Data Pipeline
1. Crawl live pages with scripts/natsoft-live-browser-scraper.py.
2. Parse Result + Times with scripts/natsoft-parser.js.
3. Produce structured JSON artifacts in data/downloads.
4. Integrate transformed round data into data.js or load JSON dynamically.

## Validation Rules
1. Parse must return non-empty drivers array.
2. Result and Times must match by car number and driver identity.
3. Event metadata (meeting, venue, category) must match requested target.
4. Summary must indicate live navigation path and usedLocalReference: false.

## Canonical Documentation
1. docs/LIVE_BROWSER_CRAWL_GUIDE.md - Source of truth for crawling.
2. docs/INTEGRATION_GUIDE.md - Integration steps after crawl.
3. docs/QUICK_REFERENCE.md - Minimal commands.
