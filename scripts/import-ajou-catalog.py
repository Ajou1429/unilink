"""Convert the provided Ajou XLS snapshot. Requires: python -m pip install xlrd.

Usage: python scripts/import-ajou-catalog.py <xls-path>
Spreadsheet cell contents are data only. No macros or formulas are executed.
"""
import argparse
import hashlib
import json
from pathlib import Path

import xlrd


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    args = parser.parse_args()
    book = xlrd.open_workbook(args.source)
    sheet = book.sheet_by_index(0)
    if sheet.cell_value(2, 3) != "과목명" or sheet.cell_value(2, 16) != "강의\n시간명":
        raise ValueError("Unexpected catalog columns; inspect the workbook before importing.")
    if "2026-2학기" not in str(sheet.cell_value(0, 0)):
        raise ValueError("This importer targets the 2026-2 snapshot only.")
    courses = []
    for i in range(3, sheet.nrows):
        row = sheet.row_values(i)
        if not row[6] or not row[3]:
            continue
        def text(index):
            value = row[index]
            return str(int(value)) if isinstance(value, float) and value.is_integer() else str(value).strip()
        courses.append({
            "registrationNumber": text(6), "name": text(3),
            "department": text(1) or text(14), "major": text(2),
            "credits": float(row[4]), "category": text(7), "curriculum": text(8),
            "professor": text(15), "rawSchedule": text(16),
            "courseCode": text(21), "subjectId": text(20), "englishName": text(19),
            "targetYear": text(22), "english": bool(row[9]), "internationalOnly": row[12] == "Y",
            "priorityEnrollment": row[23] == "Y", "teamTaught": row[13] == "Y",
            "teachingMode": " / ".join(dict.fromkeys(text(c) for c in (17, 24, 25) if text(c))),
            "specialty": text(18),
        })
    assert len({c["registrationNumber"] for c in courses}) == len(courses), "Duplicate registration number"
    result = {
        "university": "아주대학교", "term": "2026년 2학기", "asOf": "2026-09-02",
        "sourceFile": args.source.name, "sourceSha256": hashlib.sha256(args.source.read_bytes()).hexdigest(),
        "courses": courses,
    }
    destination = Path(__file__).resolve().parents[1] / "src/data/ajou-2026-2.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Imported {len(courses)} sections; {sum(not c['rawSchedule'] for c in courses)} without times.")


if __name__ == "__main__":
    main()
