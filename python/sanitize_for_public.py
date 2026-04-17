#!/usr/bin/env python3
"""
Build anonymized, minimal data for public GitHub Pages from an internal JSON file.

- Fake names, dates, gender, section text, funeral home, grave type (deterministic per id).
- Small lat/lng jitter (~15–35 m) so points stay visually in the same area.
- graves.json: only fields the web app reads (no notes, blurb, images, lot/space/vault, etc.).
- coordinates.json: {id, lat, lng} only.
- buried-data.csv: same 18-column shape as the pipeline expects, with placeholder lot/space/vault.

Workflow (keep real data private):
  1. Copy your real export to data/graves.internal.json (gitignored).
  2. Run:  python python/sanitize_for_public.py
  3. Commit data/graves.json, data/coordinates.json, buried-data.csv — not graves.internal.json.

One-time from current graves.json (overwrites public files; back up first):
  python python/sanitize_for_public.py --source data/graves.json
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import random
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

FIRST_NAMES = (
    "James Mary Robert Patricia John Jennifer Michael Linda William Elizabeth David Barbara "
    "Richard Susan Joseph Jessica Thomas Sarah Charles Karen Christopher Nancy Daniel Lisa "
    "Matthew Betty Anthony Margaret Mark Sandra Donald Ashley Steven Kimberly Paul Emily "
    "Andrew Donna Joshua Michelle Kenneth Carol Kevin Deborah Brian Dorothy George Sharon "
    "Edward Cynthia Ronald Kathleen Timothy Amy Jason Angela Jeffrey Brenda Ryan Emma "
    "Jacob Olivia Gary Anna Nicholas Alexis Eric Samantha Stephen Grace Jonathan Hannah "
    "Aaron Madison Benjamin Abigail Scott Sophia".split()
)

LAST_NAMES = (
    "Smith Johnson Williams Brown Jones Garcia Miller Davis Rodriguez Martinez Hernandez "
    "Lopez Gonzalez Wilson Anderson Thomas Taylor Moore Jackson Martin Lee Perez Thompson "
    "White Harris Sanchez Clark Ramirez Lewis Robinson Walker Young Allen King Wright "
    "Scott Torres Nguyen Hill Flores Green Adams Nelson Baker Hall Rivera Campbell "
    "Mitchell Carter Roberts Gomez Phillips Evans Turner Diaz Parker Cruz Edwards Collins "
    "Reyes Stewart Morris Morales Murphy Cook Rogers Gutierrez Ortiz Morgan Cooper Peterson "
    "Bailey Reed Kelly Howard Ramos Kim Cox Ward Richardson Watson Brooks Chavez Wood James "
    "Bennett Gray Mendoza Ruiz Hughes Price Alvarez Castillo Sanders Patel Myers Long Ross "
    "Foster Jimenez Powell Jenkins Perry Russell Sullivan Bell Coleman Butler Henderson "
    "Barnes Gonzales Fisher Vasquez Simmons Romero Jordan Patterson Alexander Hamilton".split()
)

FUNERAL_HOMES = (
    "Riverside Memorial Chapel",
    "Oak Hill Funeral Services",
    "Heritage Family Funeral Home",
    "Pine Grove Memorial",
    "Sunset Hills Funeral Services",
    "Magnolia Chapel",
    "Evergreen Memorial Home",
    "Cedar Lane Funeral Services",
)

GRAVE_TYPES = (
    "Single Adult Grave - Standard Size",
    "Cremains Placed in Niche",
    "Entombment",
    "In-ground Cremation",
)

LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"


def _rng(grave_id: int) -> random.Random:
    h = hashlib.sha256(str(grave_id).encode("utf-8")).hexdigest()
    return random.Random(int(h[:16], 16))


def jitter_lat_lng(lat: float, lng: float, grave_id: int) -> tuple[float, float]:
    """~10–35 m offset, deterministic per id, bearing from hash."""
    rng = _rng(grave_id)
    angle = rng.random() * 2 * math.pi
    dist_m = 10.0 + rng.random() * 25.0
    cos_lat = math.cos(math.radians(lat))
    dlat = (dist_m * math.cos(angle)) / 111_320.0
    dlng = (dist_m * math.sin(angle)) / (111_320.0 * max(cos_lat, 0.2))
    return lat + dlat, lng + dlng


def fake_dates(rng: random.Random) -> tuple[str, str, str, int, int, int]:
    birth_year = 1928 + rng.randint(0, 55)
    age_at_death = rng.randint(45, 92)
    death_year = min(birth_year + age_at_death, 2025)
    if death_year < birth_year + 18:
        death_year = birth_year + 18
    bm, bd = rng.randint(1, 12), rng.randint(1, 28)
    dm, dd = rng.randint(1, 12), rng.randint(1, 28)
    birth_d = date(birth_year, bm, bd)
    death_d = date(death_year, dm, dd)
    if death_d <= birth_d:
        death_d = birth_d + timedelta(days=365 * 20)
        death_year = death_d.year
    svc = death_d + timedelta(days=rng.randint(3, 21))
    age = death_year - birth_year
    b_str = birth_d.isoformat()
    d_str = death_d.isoformat()
    s_str = svc.isoformat()
    return b_str, d_str, s_str, birth_year, death_year, svc.year


def fake_gender(rng: random.Random) -> str | None:
    r = rng.random()
    if r < 0.46:
        return "M"
    if r < 0.92:
        return "F"
    return None


def sanitize_record(raw: dict, grave_id: int) -> dict:
    rng = _rng(grave_id)
    lat = float(raw["lat"])
    lng = float(raw["lng"])
    lat, lng = jitter_lat_lng(lat, lng, grave_id)

    fn = rng.choice(FIRST_NAMES)
    ln = rng.choice(LAST_NAMES)
    if rng.random() < 0.35:
        mn = rng.choice(FIRST_NAMES) if rng.random() < 0.5 else None
    else:
        mn = None
    parts = [fn] + ([mn] if mn else []) + [ln]
    full = " ".join(parts)

    b_str, d_str, s_str, by, dy, sy = fake_dates(rng)
    age = dy - by
    if age < 1:
        age = 1

    section = (
        f"Memorial {LETTERS[rng.randint(0, len(LETTERS) - 1)]}{rng.randint(1, 9)} — "
        f"Garden {rng.randint(1, 40)} · Plot {rng.randint(100, 899)}"
    )

    out = {
        "id": grave_id,
        "firstName": fn,
        "middleName": mn,
        "lastName": ln,
        "fullName": full,
        "lat": round(lat, 10),
        "lng": round(lng, 10),
        "birthDate": b_str,
        "deathDate": d_str,
        "serviceDate": s_str,
        "age": age,
        "gender": fake_gender(rng),
        "locationString": section,
        "funeralHome": rng.choice(FUNERAL_HOMES),
        "graveType": rng.choice(GRAVE_TYPES),
        "birthYear": by,
        "deathYear": dy,
        "serviceYear": sy,
    }
    return out


# CSV shape compatible with python/reorder_buried_path.py / buried_subset pipeline
CSV_HEADER = [
    "C1",
    "C2",
    "C4",
    "C6",
    "C8",
    "C10",
    "C12",
    "C14",
    "C16",
    "C18",
    "C20",
    "C22",
    "C24",
    "C26",
    "C28",
    "C30",
    "C32",
    "C34",
]


def nz(x):
    if x is None:
        return "NULL"
    return x


def fmt_date_csv(d: str | None) -> str:
    if not d:
        return "NULL"
    return d + " 00:00:00.0000000"


def record_to_csv_row(r: dict) -> list:
    rid = r["id"]
    raw = f'<a href="//example.invalid/deceased/{rid}">{rid}</a>'
    return [
        raw,
        (r.get("fullName") or "").strip(),
        nz(r.get("firstName")),
        nz(r.get("middleName")),
        nz(r.get("lastName")),
        str(r["lat"]),
        str(r["lng"]),
        fmt_date_csv(r.get("birthDate")),
        fmt_date_csv(r.get("deathDate")),
        fmt_date_csv(r.get("serviceDate")),
        nz(r.get("age")),
        nz(r.get("gender")),
        nz(r.get("locationString")),
        "1",
        "Demo",
        "0000",
        nz(r.get("graveType")),
        nz(r.get("funeralHome")),
    ]


def main() -> None:
    ap = argparse.ArgumentParser(description="Sanitize grave JSON/CSV for public hosting.")
    ap.add_argument(
        "--source",
        type=Path,
        default=ROOT / "data" / "graves.internal.json",
        help="Authoritative JSON (default: data/graves.internal.json)",
    )
    ap.add_argument(
        "--out-graves",
        type=Path,
        default=ROOT / "data" / "graves.json",
        help="Public graves.json output",
    )
    ap.add_argument(
        "--out-coords",
        type=Path,
        default=ROOT / "data" / "coordinates.json",
        help="Public coordinates.json output",
    )
    ap.add_argument(
        "--out-csv",
        type=Path,
        default=ROOT / "buried-data.csv",
        help="Public buried-data.csv output",
    )
    args = ap.parse_args()
    src = args.source if args.source.is_absolute() else ROOT / args.source

    if not src.is_file():
        raise SystemExit(
            f"Missing source file: {src}\n"
            "  Copy your real data to data/graves.internal.json (see .gitignore), or run with:\n"
            "  python python/sanitize_for_public.py --source data/graves.json"
        )

    with open(src, encoding="utf-8") as f:
        records_in = json.load(f)

    sanitized: list[dict] = []
    for raw in records_in:
        if raw.get("lat") is None or raw.get("lng") is None:
            continue
        gid = raw.get("id")
        if gid is None:
            continue
        sanitized.append(sanitize_record(raw, int(gid)))

    coords = [{"id": r["id"], "lat": r["lat"], "lng": r["lng"]} for r in sanitized]

    args.out_graves.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out_graves, "w", encoding="utf-8") as f:
        json.dump(sanitized, f, indent=2)

    args.out_coords.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out_coords, "w", encoding="utf-8") as f:
        json.dump(coords, f, indent=2)

    out_csv = args.out_csv if args.out_csv.is_absolute() else ROOT / args.out_csv
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(CSV_HEADER)
        for r in sanitized:
            w.writerow(record_to_csv_row(r))

    print(f"Wrote {len(sanitized)} records -> {args.out_graves}")
    print(f"Wrote {len(coords)} coords -> {args.out_coords}")
    print(f"Wrote CSV -> {out_csv}")


if __name__ == "__main__":
    main()
