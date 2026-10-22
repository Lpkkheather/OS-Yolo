"""Step 5 — send the counted minutes in data/<date>.csv to Supabase (table minute_counts, supabase/schema.sql).

The counting (bash run.sh count) already stores each new minute in Supabase. This sends the days counted before
Supabase was set up, and the minutes that could not be sent while the internet was down. A minute that is already
there is updated, never stored twice: run it as often as you like. Clips (data/test_*.csv) are never sent.
Needs SUPABASE_URL and SUPABASE_SECRET_KEY in YOLO_Pi/.env (README: Supabase).

Usage:
    python 5_upload_supabase.py                         # every day in data/
    python 5_upload_supabase.py 2026-10-20 2026-10-21   # only these days
"""

import argparse
import csv

from common import load_env
from counting import DATA, csv_minute, post_rows, supabase_row

BATCH = 500  # rows per request (one day = up to 1440 minutes)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dates", nargs="*", help="YYYY-MM-DD (default: every day in data/)")
    args = ap.parse_args()

    env = load_env()
    url, key = env.get("SUPABASE_URL"), env.get("SUPABASE_SECRET_KEY")
    if not url or not key:
        raise SystemExit("no SUPABASE_URL / SUPABASE_SECRET_KEY in YOLO_Pi/.env (README: Supabase)")

    if args.dates:
        files = [DATA / f"{d}.csv" for d in args.dates]
    else:
        files = sorted(p for p in DATA.glob("*.csv") if not p.name.startswith("test_"))
    if not files:
        raise SystemExit(f"no counted days in {DATA} yet (bash run.sh count makes them)")

    total = 0
    for path in files:
        if not path.is_file():
            print(f"{path.name}: not found")
            continue
        with open(path, newline="") as f:
            rows = [supabase_row(csv_minute(r)) for r in csv.DictReader(f)]
        for i in range(0, len(rows), BATCH):
            post_rows(url, key, rows[i:i + BATCH])
        print(f"{path.name}: {len(rows)} minutes")
        total += len(rows)
    print(f"done: {total} minutes in Supabase table minute_counts ({url})")


if __name__ == "__main__":
    main()
