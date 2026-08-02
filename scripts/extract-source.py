from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

import openpyxl


YEARS = [2023, 2024, 2025]
SHEETS = {1: "a", 3: "f"}
BONUS_CATEGORIES = ("賞与あり", "賞与なし")
COMMUTE_CATEGORIES = ("上限あり", "上限なし", "一定額支給", "支給なし")
BONUS_URL = "https://www.mhlw.go.jp/toukei/list/xls/114-1d-14.xlsx"
COMMUTE_URL = "https://www.mhlw.go.jp/toukei/list/xls/114-1d-17.xlsx"
SPECIAL_CODES = ("05", "06", "17", "18", "19", "20", "21", "23", "24")
CODE_PATTERN = re.compile(r"^\s*(\d{2})(.+)$")
GROUP_PATTERN = re.compile(r"^([Ａ-Ｋ])(.+)$")


def number(value: object) -> int | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return int(value)
    return None


def parse_workbook(
    path: Path, categories: tuple[str, ...]
) -> tuple[dict, dict, dict, dict, dict]:
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    values: dict[tuple[str, str, str], list[int | None]] = {}
    occupations: dict[str, dict[str, str]] = {}
    group_names: dict[str, str] = {}
    totals: dict[tuple[str, str], list[int | None]] = {}
    special: dict[tuple[str, str], list[int | None]] = {}
    try:
        for sheet_index, employment in SHEETS.items():
            sheet = workbook.worksheets[sheet_index]
            current_category: str | None = None
            current_group: str | None = None
            for row in sheet.iter_rows(min_row=3, max_col=5, values_only=True):
                if row[0] in categories:
                    current_category = str(row[0])
                    current_group = None
                label = str(row[1] or "").strip()
                if not current_category:
                    continue
                if label == "職業計":
                    totals[(employment, current_category)] = [number(item) for item in row[2:5]]
                    continue
                group_match = GROUP_PATTERN.match(label)
                if group_match:
                    current_group = group_match.group(1)
                    group_names.setdefault(current_group, group_match.group(2))
                    continue
                code_match = CODE_PATTERN.match(label)
                if current_group is None or not code_match:
                    continue
                occupation_id, occupation_name = code_match.groups()
                series = [number(item) for item in row[2:5]]
                if "." in occupation_name[:4]:
                    if tuple(re.findall(r"\d{2}", label)) != (
                        "05",
                        "06",
                        "17",
                        "21",
                        "23",
                        "24",
                    ):
                        raise ValueError(f"unexpected combined occupation row: {label}")
                    special[(employment, current_category)] = series
                    continue
                expected = {
                    "id": occupation_id,
                    "name": occupation_name.strip(),
                    "group": current_group,
                }
                previous = occupations.setdefault(occupation_id, expected)
                if previous != expected:
                    raise ValueError(f"occupation changed across sheets: {label}")
                key = (employment, current_category, occupation_id)
                if key in values:
                    raise ValueError(f"duplicate series: {key}")
                values[key] = series
    finally:
        workbook.close()
    return values, occupations, group_names, totals, special


def add_series(series: list[list[int | None]]) -> list[int | None]:
    result: list[int | None] = []
    for items in zip(*series, strict=True):
        result.append(sum(items) if all(item is not None for item in items) else None)
    return result


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("usage: extract-source.py BONUS.xlsx COMMUTE.xlsx OUTPUT_DIRECTORY")
    bonus_path = Path(sys.argv[1])
    commute_path = Path(sys.argv[2])
    output_directory = Path(sys.argv[3])

    bonus, bonus_occupations, _, bonus_totals, bonus_special = parse_workbook(
        bonus_path, BONUS_CATEGORIES
    )
    commute, occupations, group_names, commute_totals, commute_special = parse_workbook(
        commute_path, COMMUTE_CATEGORIES
    )
    if commute_special:
        raise ValueError("commute workbook unexpectedly contains a combined occupation row")
    if len(occupations) != 73 or len(group_names) != 11:
        raise ValueError(
            f"unexpected catalogue: {len(occupations)} occupations, {len(group_names)} groups"
        )
    if len(bonus_occupations) != 54:
        raise ValueError(f"unexpected individual bonus coverage: {len(bonus_occupations)}")
    if set(bonus_occupations) - set(occupations):
        raise ValueError("bonus workbook contains an unknown occupation")
    for occupation_id, item in bonus_occupations.items():
        if item != occupations[occupation_id]:
            raise ValueError(f"occupation differs between sources: {occupation_id}")

    expected_bonus_keys = len(SHEETS) * len(BONUS_CATEGORIES) * len(bonus_occupations)
    expected_commute_keys = len(SHEETS) * len(COMMUTE_CATEGORIES) * len(occupations)
    if len(bonus) != expected_bonus_keys or len(commute) != expected_commute_keys:
        raise ValueError(
            f"unexpected source dimensions: bonus={len(bonus)}, commute={len(commute)}"
        )
    if len(bonus_special) != len(SHEETS) * len(BONUS_CATEGORIES):
        raise ValueError("combined bonus row is incomplete")

    aggregate_checks = 0
    individual_checks = 0
    employment_checks = 0
    zero_denominators = {"bonus": 0, "commute": 0}
    for employment in SHEETS.values():
        for year_index, year in enumerate(YEARS):
            bonus_total = sum(
                bonus_totals[(employment, category)][year_index]
                for category in BONUS_CATEGORIES
            )
            commute_total = sum(
                commute_totals[(employment, category)][year_index]
                for category in COMMUTE_CATEGORIES
            )
            aggregate_checks += 1
            if bonus_total != commute_total:
                raise ValueError(f"workbook total mismatch: {employment} {year}")

            special_bonus_total = sum(
                bonus_special[(employment, category)][year_index]
                for category in BONUS_CATEGORIES
            )
            special_commute_total = sum(
                commute[(employment, category, occupation_id)][year_index]
                for category in COMMUTE_CATEGORIES
                for occupation_id in SPECIAL_CODES
            )
            aggregate_checks += 1
            if special_bonus_total != special_commute_total:
                raise ValueError(f"combined occupation mismatch: {employment} {year}")

        for occupation_id in occupations:
            for year_index, year in enumerate(YEARS):
                commute_values = [
                    commute[(employment, category, occupation_id)][year_index]
                    for category in COMMUTE_CATEGORIES
                ]
                if any(value is None or value < 0 for value in commute_values):
                    raise ValueError(f"invalid commute value: {employment} {occupation_id} {year}")
                if sum(commute_values) == 0:
                    zero_denominators["commute"] += 1
                if occupation_id in bonus_occupations:
                    bonus_values = [
                        bonus[(employment, category, occupation_id)][year_index]
                        for category in BONUS_CATEGORIES
                    ]
                    if any(value is None or value < 0 for value in bonus_values):
                        raise ValueError(
                            f"invalid bonus value: {employment} {occupation_id} {year}"
                        )
                    individual_checks += 1
                    if sum(bonus_values) != sum(commute_values):
                        raise ValueError(
                            f"individual source total mismatch: {employment} {occupation_id} {year}"
                        )
                    if sum(bonus_values) == 0:
                        zero_denominators["bonus"] += 1

    for metric, values, categories, catalogue in (
        ("bonus", bonus, BONUS_CATEGORIES, bonus_occupations),
        ("commute", commute, COMMUTE_CATEGORIES, occupations),
    ):
        for category in categories:
            for occupation_id in catalogue:
                all_series = values[("a", category, occupation_id)]
                full_series = values[("f", category, occupation_id)]
                for year_index, year in enumerate(YEARS):
                    employment_checks += 1
                    if all_series[year_index] < full_series[year_index]:
                        raise ValueError(
                            f"employment subset mismatch: {metric} {category} {occupation_id} {year}"
                        )

    records = []
    for occupation_id in sorted(occupations):
        item: dict[str, object] = {"o": occupation_id}
        for employment in SHEETS.values():
            series = []
            for year_index in range(len(YEARS)):
                if occupation_id in bonus_occupations:
                    bonus_values: list[int | None] = [
                        bonus[(employment, category, occupation_id)][year_index]
                        for category in BONUS_CATEGORIES
                    ]
                else:
                    bonus_values = [None, None]
                commute_values = [
                    commute[(employment, category, occupation_id)][year_index]
                    for category in COMMUTE_CATEGORIES
                ]
                series.append(bonus_values + commute_values)
            item[employment] = series
        records.append(item)

    special_record: dict[str, object] = {
        "id": "professional-combined",
        "name": "研究者ほか9職種（公式合算）",
        "occupationIds": list(SPECIAL_CODES),
    }
    for employment in SHEETS.values():
        commute_sum = {
            category: add_series(
                [commute[(employment, category, occupation_id)] for occupation_id in SPECIAL_CODES]
            )
            for category in COMMUTE_CATEGORIES
        }
        special_record[employment] = [
            [
                bonus_special[(employment, BONUS_CATEGORIES[0])][year_index],
                bonus_special[(employment, BONUS_CATEGORIES[1])][year_index],
                *[
                    commute_sum[category][year_index] for category in COMMUTE_CATEGORIES
                ],
            ]
            for year_index in range(len(YEARS))
        ]

    unavailable_ids = sorted(set(occupations) - set(bonus_occupations))
    index = {
        "schemaVersion": 1,
        "asOf": "2026-08-02",
        "edition": "2023〜2025年度（現行表）",
        "years": YEARS,
        "employmentCount": len(SHEETS),
        "groupCount": len(group_names),
        "occupationCount": len(occupations),
        "recordCount": len(records),
        "conditionCategoryCount": len(BONUS_CATEGORIES) + len(COMMUTE_CATEGORIES),
        "sourceValueCount": len(records) * len(SHEETS) * len(YEARS) * 6,
        "availableSourceValueCount": len(commute) * len(YEARS) + len(bonus) * len(YEARS),
        "unavailableSourceValueCount": len(unavailable_ids) * len(SHEETS) * len(YEARS) * 2,
        "bonusIndividualCount": len(bonus_occupations),
        "bonusUnavailableCount": len(unavailable_ids),
        "bonusUnavailableIds": unavailable_ids,
        "aggregateChecks": aggregate_checks,
        "individualChecks": individual_checks,
        "employmentChecks": employment_checks,
        "zeroDenominatorCount": zero_denominators,
        "groups": [
            {"id": group_id, "name": group_names[group_id]}
            for group_id in sorted(group_names)
        ],
        "occupations": [occupations[key] for key in sorted(occupations)],
        "bonusAggregate": special_record,
        "sources": [
            {
                "kind": "bonus",
                "url": BONUS_URL,
                "bytes": bonus_path.stat().st_size,
                "sha256": hashlib.sha256(bonus_path.read_bytes()).hexdigest(),
            },
            {
                "kind": "commute",
                "url": COMMUTE_URL,
                "bytes": commute_path.stat().st_size,
                "sha256": hashlib.sha256(commute_path.read_bytes()).hexdigest(),
            },
        ],
    }
    output_directory.mkdir(parents=True, exist_ok=True)
    (output_directory / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    (output_directory / "conditions.json").write_text(
        json.dumps(records, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "available_source_values": index["availableSourceValueCount"],
                "bonus_individual": index["bonusIndividualCount"],
                "bonus_unavailable": index["bonusUnavailableCount"],
                "occupations": index["occupationCount"],
                "source_values": index["sourceValueCount"],
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
