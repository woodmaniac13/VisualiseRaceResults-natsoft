# Natsoft Race Data Aggregation - Current Method

## Summary
The current supported method is live browser navigation and extraction.
Use scripts/natsoft-live-browser-scraper.py to discover dynamic links at runtime.

Reference files in reference/ are retained only for parser development and regression checks.
They are not a fallback for live crawling.

## Architecture
1. Live crawl: scripts/natsoft-live-browser-scraper.py
2. Parse: scripts/natsoft-parser.js
3. Outputs: data/downloads/*_live.html + summary + parsed JSON
4. Integration: append mapped round data to data.js or load from generated JSON

## Proven Live Sequence
1. Open http://racing.natsoft.com.au/
2. Click Circuit Racing
3. Set Year (for example 2026)
4. Select meeting row (for example VMRC Round 1)
5. Extract EventList links for Result/Times/Chart
6. Save pages and parse

## Explicitly Deprecated for Live Use
1. Hardcoding object links such as /object_XXXXX/Result?N.
2. Treating reference/ HTML as runtime source.
3. Assuming direct URL fetch without browser navigation will stay valid.

## Command Reference
See docs/LIVE_BROWSER_CRAWL_GUIDE.md for full commands and verification.
