import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const index = JSON.parse(readFileSync(resolve(root, "public/data/index.json"), "utf8"));
const records = JSON.parse(readFileSync(resolve(root, "public/data/conditions.json"), "utf8"));
const find = (id: string) => records.find((record: { o: string }) => record.o === id);

describe("official occupation-condition tables", () => {
  it("retains verified sources and dimensions", () => {
    expect(index).toMatchObject({
      asOf: "2026-08-02",
      edition: "2023〜2025年度（現行表）",
      years: [2023, 2024, 2025],
      employmentCount: 2,
      groupCount: 11,
      occupationCount: 73,
      recordCount: 73,
      sourceValueCount: 2628,
      availableSourceValueCount: 2400,
      unavailableSourceValueCount: 228,
      bonusIndividualCount: 54,
      bonusUnavailableCount: 19,
    });
    expect(index.sources.map((source: { sha256: string }) => source.sha256)).toEqual([
      "681debf8ba2fe795fed4c0e2d8989d58c6fb9bc75e836d6bc5691567dad36167",
      "291b322d53e1650bbc9eb2f8c55c5a8076b704b4426845334be20d4a07230908",
    ]);
  });

  it("contains 73 unique occupations with six condition values", () => {
    expect(records).toHaveLength(73);
    expect(new Set(records.map((record: { o: string }) => record.o)).size).toBe(73);
    for (const record of records)
      for (const employment of ["a", "f"])
        for (const values of record[employment]) expect(values).toHaveLength(6);
  });

  it("retains representative 2025 counts", () => {
    expect(find("10").a.at(-1)).toEqual([174323, 34382, 103819, 101824, 819, 2243]);
    expect(find("25").a.at(-1)).toEqual([392075, 210825, 431518, 131438, 10537, 29407]);
    expect(find("36").f.at(-1)).toEqual([398950, 36629, 357509, 69998, 3901, 4171]);
    expect(find("05").a.at(-1)).toEqual([null, null, 1520, 431, 7, 54]);
  });

  it("keeps source totals aligned without filling unavailable bonus values", () => {
    let unavailable = 0;
    for (const record of records)
      for (const employment of ["a", "f"])
        for (const values of record[employment]) {
          const commuteTotal = values
            .slice(2)
            .reduce((sum: number, value: number) => sum + value, 0);
          expect(commuteTotal).toBeGreaterThan(0);
          if (values[0] === null) {
            expect(values[1]).toBeNull();
            unavailable += 2;
          } else {
            expect(values[0] + values[1]).toBe(commuteTotal);
          }
        }
    expect(unavailable).toBe(228);
  });

  it("isolates and verifies the official nine-occupation aggregate", () => {
    const special = index.bonusAggregate;
    expect(special.occupationIds).toEqual(["05", "06", "17", "18", "19", "20", "21", "23", "24"]);
    expect(special.a.at(-1)).toEqual([73217, 60262, 88568, 36280, 1922, 6709]);
    for (const employment of ["a", "f"])
      for (let year = 0; year < 3; year += 1) {
        const values = special[employment][year];
        const commuteTotal = special.occupationIds
          .map((id: string) =>
            find(id)
              [employment][year].slice(2)
              .reduce((sum: number, value: number) => sum + value, 0),
          )
          .reduce((sum: number, value: number) => sum + value, 0);
        expect(values[0] + values[1]).toBe(commuteTotal);
      }
  });

  it("stays within the static delivery budget", () => {
    expect(statSync(resolve(root, "public/data/conditions.json")).size).toBeLessThan(25000);
  });
});
