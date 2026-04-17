"""
Reorder buried-data / graves.json for a smoother map tour: greedy nearest-neighbor
path starting at a chosen grave (default: Janie Alexander, former point #9).

Run from repo root: python python/reorder_buried_path.py
"""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
GRAVES_JSON = DATA_DIR / "graves.json"
COORDS_JSON = DATA_DIR / "coordinates.json"
BURIED_CSV = ROOT / "buried-data.csv"

# Janie Alexander — user asked to start the new numbering here.
START_ID = 26199196

HEADER = [
    "C1", "C2", "C4", "C6", "C8", "C10", "C12", "C14", "C16", "C18",
    "C20", "C22", "C24", "C26", "C28", "C30", "C32", "C34",
]


def dist2(a, b):
    dlat = a["lat"] - b["lat"]
    dlng = a["lng"] - b["lng"]
    return dlat * dlat + dlng * dlng


def nearest_neighbor_order(records, start_id):
    by_id = {r["id"]: r for r in records}
    if start_id not in by_id:
        raise SystemExit(f"No grave with id={start_id} in {GRAVES_JSON}")
    ordered = [by_id[start_id]]
    remaining = [r for r in records if r["id"] != start_id]
    while remaining:
        last = ordered[-1]
        nxt = min(remaining, key=lambda r: dist2(last, r))
        ordered.append(nxt)
        remaining.remove(nxt)
    return ordered


def fmt_date(d):
    if not d:
        return "NULL"
    return d + " 00:00:00.0000000"


def nz(x):
    if x is None:
        return "NULL"
    return x


def record_to_row(r):
    rid = r["id"]
    raw = f'<a href="//management.webcemeteries.com/649/Deceased/{rid}/Edit">{rid}</a>'
    return [
        raw,
        (r.get("fullName") or "").strip(),
        nz(r.get("firstName")),
        nz(r.get("middleName")),
        nz(r.get("lastName")),
        str(r["lat"]),
        str(r["lng"]),
        fmt_date(r.get("birthDate")),
        fmt_date(r.get("deathDate")),
        fmt_date(r.get("serviceDate")),
        nz(r.get("age")),
        nz(r.get("gender")),
        nz(r.get("locationString")),
        nz(r.get("lot")),
        nz(r.get("space")),
        nz(r.get("vaultType")),
        nz(r.get("graveType")),
        nz(r.get("funeralHome")),
    ]


def main():
    with open(GRAVES_JSON, encoding="utf-8") as f:
        records = json.load(f)

    ordered = nearest_neighbor_order(records, START_ID)

    with open(GRAVES_JSON, "w", encoding="utf-8") as f:
        json.dump(ordered, f, indent=2)

    coords = [
        {"id": r["id"], "lat": r["lat"], "lng": r["lng"]}
        for r in ordered
        if r.get("lat") is not None and r.get("lng") is not None
    ]
    with open(COORDS_JSON, "w", encoding="utf-8") as f:
        json.dump(coords, f, indent=2)

    with open(BURIED_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(HEADER)
        for r in ordered:
            w.writerow(record_to_row(r))

    print("Tour order (map labels 1-%d):" % len(ordered))
    for i, r in enumerate(ordered, 1):
        name = (r.get("fullName") or "").strip()
        print(f"  {i}. {name} (id {r['id']})")


if __name__ == "__main__":
    main()
