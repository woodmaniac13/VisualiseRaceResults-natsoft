#!/usr/bin/env python3
"""
Live Natsoft browser scraper.

This script does not use local reference HTML.
It navigates from http://racing.natsoft.com.au/ in a real browser:
1) Clicks Circuit Racing
2) Sets Year filter
3) Opens a target meeting row
4) Finds a target event row
5) Saves live Result/Times/Chart HTML pages
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from playwright.sync_api import sync_playwright

HOME_URL = "http://racing.natsoft.com.au/"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scrape Natsoft using live browser navigation only")
    parser.add_argument("--year", default="2026", help="Meeting year filter")
    parser.add_argument(
        "--meeting-text",
        default="Victorian Motor Race Championship - Round 1 (VMRC)",
        help="Meeting row text match",
    )
    parser.add_argument("--event-text", default="HERA Excel - Race 1", help="Event row text match")
    parser.add_argument("--output-dir", default="data/downloads", help="Output directory")
    parser.add_argument("--event-id", default="live_nav", help="Prefix for output filenames")
    parser.add_argument("--headful", action="store_true", help="Show browser window")
    parser.add_argument("--timeout-ms", type=int, default=45000, help="Action timeout")
    return parser.parse_args()


def slugify(value: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", value.lower().strip())
    return value.strip("-") or "event"


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip().lower()


def extract_rows(page, prefix: str) -> list[dict[str, str]]:
    return page.evaluate(
                r"""
        (prefix) => {
          const rows = Array.from(document.querySelectorAll(`div[id^="${prefix}#r"]`))
            .filter(d => new RegExp(`^${prefix}#r\\d+$`).test(d.id));
          return rows.map(r => ({
            id: r.id,
            text: (r.textContent || '').replace(/\s+/g, ' ').trim()
          }));
        }
        """,
        prefix,
    )


def choose_row(rows: list[dict[str, str]], desired_text: str) -> dict[str, str] | None:
    needle = normalize(desired_text)
    exact = [row for row in rows if needle in normalize(row.get("text", ""))]
    if exact:
        return exact[0]

    tokens = [token for token in re.split(r"\W+", needle) if token]
    scored: list[tuple[int, dict[str, str]]] = []
    for row in rows:
        txt = normalize(row.get("text", ""))
        score = sum(1 for token in tokens if token in txt)
        if score:
            scored.append((score, row))

    if not scored:
        return None

    scored.sort(key=lambda item: item[0], reverse=True)
    return scored[0][1]


def click_row_view(page, row_id: str) -> None:
    view_id = f'{row_id}c3'
    view_locator = page.locator(f'div[id="{view_id}"]')
    if view_locator.count() > 0:
        view_locator.first.click()
        return

    row_locator = page.locator(f'div[id="{row_id}"]')
    row_locator.first.click()


def extract_event_links(page) -> list[dict[str, str]]:
    return page.evaluate(
                r"""
        () => {
          const links = Array.from(document.querySelectorAll('a[href]'));
          return links
            .map(a => ({
              text: (a.textContent || '').replace(/\s+/g, ' ').trim(),
              href: a.href || ''
            }))
            .filter(l => /\/(Result|Times|Chart)\?/i.test(l.href));
        }
        """
    )


def choose_event_bundle(page, links: list[dict[str, str]], event_text: str) -> dict[str, Any] | None:
    # Prefer EventList row context where event text appears.
    rows = page.evaluate(
                r"""
        () => {
          const rows = Array.from(document.querySelectorAll('div[id^="EventList#r"]'))
            .filter(d => /^EventList#r\d+$/.test(d.id));
          return rows.map(r => {
            const text = (r.textContent || '').replace(/\s+/g, ' ').trim();
            const result = r.querySelector('a[href*="/Result?"]')?.href || null;
            const times = r.querySelector('a[href*="/Times?"]')?.href || null;
            const chart = r.querySelector('a[href*="/Chart?"]')?.href || null;
            return { id: r.id, text, result, times, chart };
          });
        }
        """
    )

    row = choose_row(rows, event_text)
    if row and (row.get("result") or row.get("times") or row.get("chart")):
        return row

    # Fallback: infer by numeric query id from any link set.
    grouped: dict[str, dict[str, Any]] = {}
    for link in links:
        match = re.search(r"/(Result|Times|Chart)\?(\d+)", link.get("href", ""), flags=re.IGNORECASE)
        if not match:
            continue
        page_type = match.group(1).capitalize()
        key = match.group(2)
        grouped.setdefault(key, {"key": key, "result": None, "times": None, "chart": None})
        grouped[key][page_type.lower()] = link.get("href")

    if not grouped:
        return None

    # Pick the bundle with all 3 first, else max link count.
    bundles = list(grouped.values())
    bundles.sort(key=lambda b: sum(1 for k in ["result", "times", "chart"] if b.get(k)), reverse=True)
    return bundles[0]


def fetch_and_save(page, url: str | None, output_path: Path, timeout_ms: int) -> str:
    if not url:
        return "missing"

    response = page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
    page.wait_for_timeout(700)
    status = response.status if response else None
    if status != 200:
        raise RuntimeError(f"HTTP {status} for {url}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(page.content(), encoding="utf-8")
    return "saved"


def open_meeting_context(page, year: str, meeting_text: str) -> dict[str, str]:
        page.goto(HOME_URL, wait_until="networkidle")
        page.click("#Discipline_0")
        page.wait_for_function(
                r"""
                () => Array.from(document.querySelectorAll('select'))
                    .some(s => (s.id || '').trim().toLowerCase().startsWith('year'))
                """
        )
        page.wait_for_timeout(800)

        year_set = page.evaluate(
                r"""
                (desiredYear) => {
                    const year = Array.from(document.querySelectorAll('select')).find(
                        s => (s.id || '').trim().toLowerCase().startsWith('year')
                    );
                    if (!year) return {ok:false, reason:'Year filter not found'};
                    const opt = Array.from(year.options).find(o => o.textContent.trim() === desiredYear);
                    if (!opt) return {ok:false, reason:'Year option not found'};
                    year.value = opt.value;
                    year.dispatchEvent(new Event('change', {bubbles:true}));
                    return {ok:true, value:year.value};
                }
                """,
                year,
        )
        if not year_set.get("ok"):
                reason = year_set.get("reason", "Unknown year filter failure")
                raise RuntimeError(reason)

        page.wait_for_timeout(2500)

        meeting_rows = extract_rows(page, "MeetingList")
        meeting_row = choose_row(meeting_rows, meeting_text)
        if not meeting_row:
                raise RuntimeError(
                        f"Meeting not found: '{meeting_text}' (rows available: {len(meeting_rows)})"
                )

        click_row_view(page, meeting_row["id"])
        page.wait_for_timeout(2800)
        return meeting_row


def run() -> int:
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=not args.headful)
        page = browser.new_page(viewport={"width": 1800, "height": 1400})
        page.set_default_timeout(args.timeout_ms)

        try:
            meeting_row = open_meeting_context(page, args.year, args.meeting_text)
        except Exception as exc:  # noqa: BLE001
            browser.close()
            print(
                json.dumps(
                    {
                        "ok": False,
                        "stage": "meeting-open",
                        "year": args.year,
                        "meetingText": args.meeting_text,
                        "error": str(exc),
                    },
                    indent=2,
                )
            )
            return 3

        has_event_text = args.event_text.lower() in page.inner_text("body").lower()
        links = extract_event_links(page)
        event_bundle = choose_event_bundle(page, links, args.event_text)

        if not event_bundle:
            browser.close()
            print(
                json.dumps(
                    {
                        "ok": False,
                        "stage": "event-search",
                        "eventText": args.event_text,
                        "linkCount": len(links),
                        "hasEventText": has_event_text,
                    },
                    indent=2,
                )
            )
            return 4

        event_slug = slugify(args.event_text)
        result_file = output_dir / f"{args.event_id}_Result_{event_slug}_live.html"
        times_file = output_dir / f"{args.event_id}_Times_{event_slug}_live.html"
        chart_file = output_dir / f"{args.event_id}_Chart_{event_slug}_live.html"

        page_results = {
            "Result": {"url": event_bundle.get("result"), "file": str(result_file), "status": None},
            "Times": {"url": event_bundle.get("times"), "file": str(times_file), "status": None},
            "Chart": {"url": event_bundle.get("chart"), "file": str(chart_file), "status": None},
        }

        for page_kind, payload in page_results.items():
            try:
                payload["status"] = fetch_and_save(page, payload["url"], Path(payload["file"]), args.timeout_ms)
            except Exception as exc:  # noqa: BLE001
                # Natsoft links can go stale quickly. Re-open meeting/event context and retry once.
                retry_error = None
                try:
                    open_meeting_context(page, args.year, args.meeting_text)
                    refreshed_links = extract_event_links(page)
                    refreshed_bundle = choose_event_bundle(page, refreshed_links, args.event_text)
                    if not refreshed_bundle:
                        raise RuntimeError("Event not found during retry refresh")

                    refreshed_url = refreshed_bundle.get(page_kind.lower())
                    payload["retryUrl"] = refreshed_url
                    payload["status"] = fetch_and_save(
                        page,
                        refreshed_url,
                        Path(payload["file"]),
                        args.timeout_ms,
                    )
                    payload["url"] = refreshed_url
                except Exception as retry_exc:  # noqa: BLE001
                    retry_error = retry_exc

                if retry_error is not None:
                    payload["status"] = f"error: {exc}; retry_error: {retry_error}"

        summary = {
            "ok": True,
            "scrapedAt": datetime.now(timezone.utc).isoformat(),
            "homeUrl": HOME_URL,
            "stageUrl": page.url,
            "year": args.year,
            "meetingText": args.meeting_text,
            "meetingRow": meeting_row,
            "eventText": args.event_text,
            "eventBundle": event_bundle,
            "pageResults": page_results,
            "eventLinkCount": len(links),
            "usedLocalReference": False,
        }

        summary_file = output_dir / f"{args.event_id}_{event_slug}_live_summary.json"
        summary_file.write_text(json.dumps(summary, indent=2), encoding="utf-8")
        browser.close()

    print(json.dumps({"ok": True, "summary": str(summary_file), "pageResults": page_results}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
