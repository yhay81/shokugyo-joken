import { readFile } from "node:fs/promises";

const index = JSON.parse(
  await readFile(new URL("../public/data/index.json", import.meta.url), "utf8"),
);
const records = JSON.parse(
  await readFile(new URL("../public/data/conditions.json", import.meta.url), "utf8"),
);

if (
  index.schemaVersion !== 1 ||
  index.asOf !== "2026-08-02" ||
  index.years.join(",") !== "2023,2024,2025" ||
  index.employmentCount !== 2 ||
  index.groupCount !== 11 ||
  index.occupationCount !== 73 ||
  index.recordCount !== 73 ||
  index.conditionCategoryCount !== 6 ||
  index.sourceValueCount !== 2628 ||
  index.availableSourceValueCount !== 2400 ||
  index.unavailableSourceValueCount !== 228 ||
  index.bonusIndividualCount !== 54 ||
  index.bonusUnavailableCount !== 19 ||
  index.aggregateChecks !== 12 ||
  index.individualChecks !== 324 ||
  index.employmentChecks !== 1200 ||
  index.zeroDenominatorCount.bonus !== 0 ||
  index.zeroDenominatorCount.commute !== 0
)
  throw new Error("Unexpected data dimensions");

if (
  index.sources[0].sha256 !== "681debf8ba2fe795fed4c0e2d8989d58c6fb9bc75e836d6bc5691567dad36167" ||
  index.sources[1].sha256 !== "291b322d53e1650bbc9eb2f8c55c5a8076b704b4426845334be20d4a07230908"
)
  throw new Error("Unexpected source SHA-256");

const occupationIds = new Set(index.occupations.map((item) => item.id));
const unavailableIds = new Set(index.bonusUnavailableIds);
const keys = new Set();
let availableSourceValues = 0;
let unavailableSourceValues = 0;
for (const record of records) {
  if (!occupationIds.has(record.o)) throw new Error(`Unknown occupation: ${record.o}`);
  if (keys.has(record.o)) throw new Error(`Duplicate occupation: ${record.o}`);
  keys.add(record.o);
  if (Object.keys(record).sort().join(",") !== "a,f,o")
    throw new Error(`${record.o}: unexpected record shape`);
  for (const employment of ["a", "f"]) {
    if (!Array.isArray(record[employment]) || record[employment].length !== 3)
      throw new Error(`${record.o}: invalid employment series`);
    for (const values of record[employment]) {
      if (!Array.isArray(values) || values.length !== 6)
        throw new Error(`${record.o}: invalid condition row`);
      for (const [index, value] of values.entries()) {
        if (value === null) {
          unavailableSourceValues += 1;
          if (index > 1 || !unavailableIds.has(record.o))
            throw new Error(`${record.o}: unexpected unavailable value`);
        } else {
          availableSourceValues += 1;
          if (!Number.isInteger(value) || value < 0)
            throw new Error(`${record.o}: invalid published value`);
        }
      }
      if (values[0] !== null && values[0] + values[1] !== values.slice(2).reduce((a, b) => a + b))
        throw new Error(`${record.o}: source totals differ`);
      if (values.slice(2).reduce((a, b) => a + b) === 0)
        throw new Error(`${record.o}: commute denominator is zero`);
    }
  }
  for (let year = 0; year < 3; year += 1) {
    for (let condition = 0; condition < 6; condition += 1) {
      const all = record.a[year][condition];
      const full = record.f[year][condition];
      if (all !== null && full !== null && all < full)
        throw new Error(`${record.o}: employment subset mismatch`);
    }
  }
}
if (keys.size !== 73 || availableSourceValues !== 2400 || unavailableSourceValues !== 228)
  throw new Error("Published source value counts changed");

const find = (id) => records.find((record) => record.o === id);
if (JSON.stringify(find("10").a.at(-1)) !== "[174323,34382,103819,101824,819,2243]")
  throw new Error("IT values changed");
if (JSON.stringify(find("25").a.at(-1)) !== "[392075,210825,431518,131438,10537,29407]")
  throw new Error("Office values changed");
if (JSON.stringify(find("36").f.at(-1)) !== "[398950,36629,357509,69998,3901,4171]")
  throw new Error("Care values changed");
if (JSON.stringify(find("05").a.at(-1)) !== "[null,null,1520,431,7,54]")
  throw new Error("Unavailable individual bonus state changed");

const special = index.bonusAggregate;
if (special.occupationIds.join(",") !== "05,06,17,18,19,20,21,23,24")
  throw new Error("Combined occupation boundary changed");
if (JSON.stringify(special.a.at(-1)) !== "[73217,60262,88568,36280,1922,6709]")
  throw new Error("Combined occupation values changed");
for (const employment of ["a", "f"])
  for (let year = 0; year < 3; year += 1) {
    const combined = special[employment][year];
    const commuteTotal = special.occupationIds
      .map((id) =>
        find(id)
          [employment][year].slice(2)
          .reduce((a, b) => a + b),
      )
      .reduce((a, b) => a + b);
    if (combined[0] + combined[1] !== commuteTotal)
      throw new Error("Combined occupation total changed");
  }

console.log(
  JSON.stringify({
    availableSourceValues,
    bonusIndividual: index.bonusIndividualCount,
    bonusUnavailable: index.bonusUnavailableCount,
    occupations: keys.size,
    sourceValues: index.sourceValueCount,
  }),
);
