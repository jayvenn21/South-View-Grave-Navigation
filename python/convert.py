"""
South View Cemetery — CSV → JSON data pipeline.
Loads the interment CSV, strips HTML, normalizes columns, computes age when missing,
outputs data/graves.json and optional data/coordinates.json for fast map loading.

Run from repo root: python python/convert.py
"""
import json
import os
import re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
# Subset of 20 distinctly located records; regenerate via python python/buried_subset.py or set to a full export filename under ROOT.
INPUT_FILE = ROOT / "buried-data.csv"
UPDATES_DIR = ROOT / "data" / "updates"
UPDATES_FILE = "southview-burial-updates.csv"  # Google Form → Sheet → Download CSV → put in data/updates/
DATA_DIR = ROOT / "data"
OUTPUT_GRAVES = DATA_DIR / "graves.json"
OUTPUT_COORDINATES = DATA_DIR / "coordinates.json"

# Map Google Form column names (Sheet export) → our JSON keys
FORM_TO_SCHEMA = {
    "Deceased ID (for edits only)": "id",
    "Deceased ID": "id",
    "First Name": "firstName",
    "Middle Name": "middleName",
    "Last Name": "lastName",
    "Birth Date": "birthDate",
    "Death Date": "deathDate",
    "Service Date": "serviceDate",
    "Age": "age",
    "Gender": "gender",
    "Section": "locationString",
    "Lot": "lot",
    "Space": "space",
    "Vault Type": "vaultType",
    "Grave Type": "graveType",
    "Funeral Home": "funeralHome",
    "Coordinates (lat/lng)": "coordinates_raw",
    "Notes": "notes",
}


def clean_id(html_link):
    """Extract numeric ID from HTML link."""
    if isinstance(html_link, str):
        match = re.search(r">(\d+)<", html_link)
        if match:
            return int(match.group(1))
    return None


def clean_date(x):
    """Return YYYY-MM-DD only; strip 00:00 timestamps."""
    if isinstance(x, str) and len(x) >= 10:
        return x[:10].strip()
    return None


def parse_year(date_val):
    """Extract year from YYYY-MM-DD for age calculation."""
    if date_val is None or pd.isna(date_val):
        return None
    s = str(date_val).strip()
    if len(s) < 4:
        return None
    try:
        return int(s[:4])
    except ValueError:
        return None


def none_if_null(x):
    if pd.isna(x) or str(x).strip().upper() == "NULL":
        return None
    return x


def clean_date_str(s):
    """Normalize date to YYYY-MM-DD from Form or spreadsheet."""
    if not s or (isinstance(s, float) and pd.isna(s)):
        return None
    s = str(s).strip()
    if len(s) >= 10:
        return s[:10]
    return s


def load_form_updates(path):
    """Load Google Form CSV and return list of dicts in our schema."""
    import csv
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rec = {}
            for form_col, val in row.items():
                key = FORM_TO_SCHEMA.get(form_col.strip())
                if key is None:
                    continue
                if key == "coordinates_raw" and val:
                    parts = str(val).replace(" ", "").split(",")
                    if len(parts) >= 2:
                        try:
                            rec["lat"] = float(parts[0])
                            rec["lng"] = float(parts[1])
                        except ValueError:
                            pass
                    continue
                if key == "id" and val:
                    try:
                        rec["id"] = int(float(str(val).strip()))
                    except ValueError:
                        rec["id"] = None
                    continue
                if val is None or str(val).strip() == "":
                    rec[key] = None
                elif key in ("birthDate", "deathDate", "serviceDate"):
                    rec[key] = clean_date_str(val)
                elif key == "age":
                    try:
                        rec["age"] = int(float(val))
                    except (ValueError, TypeError):
                        rec["age"] = None
                elif key in ("lot", "space") and val:
                    try:
                        rec[key] = int(float(val))
                    except (ValueError, TypeError):
                        rec[key] = str(val).strip()
                else:
                    rec[key] = str(val).strip() if val else None
            full = " ".join(filter(None, [rec.get("firstName"), rec.get("middleName"), rec.get("lastName")]))
            rec["fullName"] = full or None
            if rec.get("birthDate"):
                rec["birthYear"] = parse_year(rec["birthDate"])
            if rec.get("deathDate"):
                rec["deathYear"] = parse_year(rec["deathDate"])
            if rec.get("serviceDate"):
                rec["serviceYear"] = parse_year(rec["serviceDate"])
            rows.append(rec)
    return rows


def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    df = pd.read_csv(INPUT_FILE, header=0)
    df.columns = [
        "rawId", "fullName", "firstName", "middleName", "lastName",
        "lat", "lng", "birthDate", "deathDate", "serviceDate",
        "age", "gender", "locationString", "lot", "space",
        "vaultType", "graveType", "funeralHome",
    ]

    df["id"] = df["rawId"].apply(clean_id)
    df["birthDate"] = df["birthDate"].apply(clean_date)
    df["deathDate"] = df["deathDate"].apply(clean_date)
    df["serviceDate"] = df["serviceDate"].apply(clean_date)

    # Compute age from birth/death if missing
    def fill_age(row):
        a = row.get("age")
        if a is not None and not pd.isna(a):
            try:
                return int(float(a))
            except (ValueError, TypeError):
                pass
        birth = parse_year(row["birthDate"])
        death = parse_year(row["deathDate"])
        if birth and death and death >= birth:
            return death - birth
        return None

    df["age"] = df.apply(fill_age, axis=1)

    def extract_year(val):
        if isinstance(val, str) and len(val) >= 4:
            try:
                return int(val[:4])
            except ValueError:
                return None
        return None

    df["birthYear"] = df["birthDate"].apply(extract_year)
    df["deathYear"] = df["deathDate"].apply(extract_year)
    df["serviceYear"] = df["serviceDate"].apply(extract_year)

    for col in df.columns:
        df[col] = df[col].apply(none_if_null)

    output_df = df[
        [
            "id", "firstName", "middleName", "lastName", "fullName",
            "lat", "lng", "age", "gender",
            "birthDate", "deathDate", "serviceDate",
            "birthYear", "deathYear", "serviceYear",
            "locationString", "lot", "space",
            "vaultType", "graveType", "funeralHome",
        ]
    ]

    raw = output_df.to_dict(orient="records")
    records = []
    for row in raw:
        rec = {}
        for k, v in row.items():
            if pd.isna(v):
                rec[k] = None
            elif k == "age" and isinstance(v, (int, float)):
                try:
                    rec[k] = int(v) if v == v else None
                except (ValueError, TypeError):
                    rec[k] = None
            elif k in ("birthYear", "deathYear", "serviceYear") and isinstance(v, (int, float)):
                try:
                    rec[k] = int(v) if v == v else None
                except (ValueError, TypeError):
                    rec[k] = None
            else:
                rec[k] = v
        records.append(rec)

    updates_path = UPDATES_DIR / UPDATES_FILE if UPDATES_FILE else None
    if updates_path and updates_path.is_file():
        try:
            form_rows = load_form_updates(updates_path)
            if form_rows:
                all_keys = list(output_df.columns)
                by_id = {r["id"]: dict(r) for r in records if r.get("id") is not None}
                for r in form_rows:
                    rid = r.get("id")
                    if rid is not None and rid in by_id:
                        for k, v in r.items():
                            if k != "id" and v is not None:
                                by_id[rid][k] = v
                    elif rid is not None:
                        new_rec = {k: None for k in all_keys}
                        new_rec["id"] = rid
                        for k, v in r.items():
                            if k in all_keys and v is not None:
                                new_rec[k] = v
                        by_id[rid] = new_rec
                    else:
                        new_id = max(by_id.keys(), default=0) + 1
                        new_rec = {k: None for k in all_keys}
                        new_rec["id"] = new_id
                        for k, v in r.items():
                            if k in all_keys and v is not None:
                                new_rec[k] = v
                        by_id[new_id] = new_rec
                records = list(by_id.values())
                print(f"Merged {len(form_rows)} update(s) from {UPDATES_FILE} into graves.")
        except Exception as e:
            print(f"Warning: could not merge updates CSV: {e}")

    with open(OUTPUT_GRAVES, "w") as f:
        json.dump(records, f, indent=2)

    # Optional: coordinates-only for faster map loading
    coords = [
        {"id": r["id"], "lat": r["lat"], "lng": r["lng"]}
        for r in records
        if r.get("lat") is not None and r.get("lng") is not None
    ]
    with open(OUTPUT_COORDINATES, "w") as f:
        json.dump(coords, f, indent=2)

    print(f"JSON exported → {OUTPUT_GRAVES} ({len(records)} records)")
    print(f"Coordinates   → {OUTPUT_COORDINATES} ({len(coords)} with lat/lng)")


if __name__ == "__main__":
    main()
