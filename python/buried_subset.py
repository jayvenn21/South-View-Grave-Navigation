#!/usr/bin/env python3
"""
Stdlib-only: Write data/graves.json and data/coordinates.json from buried-data.csv.

Optional: if a full cemetery export CSV exists (see FULL_CSV), rebuild buried-data.csv
with 20 distinct-coordinate rows first.

Run from repo root: python python/buried_subset.py
"""
import csv
import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FULL_CSV = ROOT / "southview-daily-interment-all-time (1).csv"
BURIED_CSV = ROOT / "buried-data.csv"
DATA_DIR = ROOT / "data"
OUTPUT_GRAVES = DATA_DIR / "graves.json"
OUTPUT_COORDS = DATA_DIR / "coordinates.json"


def clean_id(html_link):
    if isinstance(html_link, str):
        m = re.search(r">(\d+)<", html_link)
        if m:
            return int(m.group(1))
    return None


def clean_date(x):
    if isinstance(x, str) and len(x) >= 10:
        return x[:10].strip()
    return None


def parse_year(date_val):
    if not date_val or not isinstance(date_val, str) or len(date_val) < 4:
        return None
    try:
        return int(date_val[:4])
    except ValueError:
        return None


def none_if_null(x):
    if x is None:
        return None
    s = str(x).strip()
    if s == "" or s.upper() == "NULL":
        return None
    return x


def to_float(x):
    if x is None:
        return None
    s = str(x).strip()
    if s == "" or s.upper() == "NULL":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def fill_age(age_raw, birth_date, death_date):
    if age_raw is not None and str(age_raw).strip() != "" and str(age_raw).strip().upper() != "NULL":
        try:
            return int(float(str(age_raw).strip()))
        except (ValueError, TypeError):
            pass
    birth = parse_year(birth_date) if birth_date else None
    death = parse_year(death_date) if death_date else None
    if birth and death and death >= birth:
        return death - birth
    return None


def extract_buried_csv():
    with open(FULL_CSV, newline="", encoding="utf-8") as f:
        rdr = csv.reader(f)
        header = next(rdr)
        seen = set()
        picked = []
        for row in rdr:
            if len(row) < 7:
                continue
            lat, lng = to_float(row[5]), to_float(row[6])
            if lat is None or lng is None:
                continue
            key = (round(lat, 5), round(lng, 5))
            if key in seen:
                continue
            seen.add(key)
            picked.append(row)
            if len(picked) >= 20:
                break

    if len(picked) < 20:
        raise SystemExit(f"Only found {len(picked)} distinct coordinate rows with lat/lng.")

    with open(BURIED_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        w.writerow(header)
        w.writerows(picked)
    print(f"Wrote {BURIED_CSV} ({len(picked)} rows).")


def row_to_record(row):
    raw_id = row[0] if len(row) > 0 else None
    rec = {
        "id": clean_id(raw_id),
        "firstName": none_if_null(row[2]) if len(row) > 2 else None,
        "middleName": none_if_null(row[3]) if len(row) > 3 else None,
        "lastName": none_if_null(row[4]) if len(row) > 4 else None,
        "fullName": (row[1].strip() if len(row) > 1 and row[1] else None),
        "lat": to_float(row[5]) if len(row) > 5 else None,
        "lng": to_float(row[6]) if len(row) > 6 else None,
        "birthDate": clean_date(row[7]) if len(row) > 7 else None,
        "deathDate": clean_date(row[8]) if len(row) > 8 else None,
        "serviceDate": clean_date(row[9]) if len(row) > 9 else None,
        "age": fill_age(row[10] if len(row) > 10 else None, clean_date(row[7]) if len(row) > 7 else None, clean_date(row[8]) if len(row) > 8 else None),
        "gender": none_if_null(row[11]) if len(row) > 11 else None,
        "locationString": none_if_null(row[12]) if len(row) > 12 else None,
        "lot": none_if_null(row[13]) if len(row) > 13 else None,
        "space": none_if_null(row[14]) if len(row) > 14 else None,
        "vaultType": none_if_null(row[15]) if len(row) > 15 else None,
        "graveType": none_if_null(row[16]) if len(row) > 16 else None,
        "funeralHome": none_if_null(row[17]) if len(row) > 17 else None,
    }
    bd, dd, sd = rec["birthDate"], rec["deathDate"], rec["serviceDate"]
    rec["birthYear"] = parse_year(bd) if bd else None
    rec["deathYear"] = parse_year(dd) if dd else None
    rec["serviceYear"] = parse_year(sd) if sd else None
    for k in ("firstName", "middleName", "lastName", "fullName", "gender", "locationString", "vaultType", "graveType", "funeralHome"):
        if rec[k] is not None and isinstance(rec[k], str) and rec[k].strip() == "":
            rec[k] = None
    if rec["lot"] is not None:
        try:
            rec["lot"] = int(float(rec["lot"]))
        except (ValueError, TypeError):
            rec["lot"] = str(rec["lot"]).strip()
    if rec["space"] is not None:
        try:
            rec["space"] = int(float(rec["space"]))
        except (ValueError, TypeError):
            rec["space"] = str(rec["space"]).strip()
    return rec


def export_json():
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(BURIED_CSV, newline="", encoding="utf-8") as f:
        rdr = csv.reader(f)
        next(rdr)  # header
        records = [row_to_record(row) for row in rdr if row]

    with open(OUTPUT_GRAVES, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2)

    coords = [
        {"id": r["id"], "lat": r["lat"], "lng": r["lng"]}
        for r in records
        if r.get("lat") is not None and r.get("lng") is not None
    ]
    with open(OUTPUT_COORDS, "w", encoding="utf-8") as f:
        json.dump(coords, f, indent=2)

    print(f"Wrote {OUTPUT_GRAVES} ({len(records)} records).")
    print(f"Wrote {OUTPUT_COORDS} ({len(coords)} coordinates).")


if __name__ == "__main__":
    if FULL_CSV.is_file():
        extract_buried_csv()
    else:
        print("Full export CSV not found; using existing", BURIED_CSV)
    export_json()
