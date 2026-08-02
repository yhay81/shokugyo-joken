const $ = (selector) => document.querySelector(selector);
const elements = {
  aggregateNote: $("#aggregate-note"),
  compareCount: $("#compare-count"),
  compareList: $("#compare-list"),
  copy: $("#copy-compare"),
  employment: $("#employment"),
  group: $("#group"),
  list: $("#occupation-list"),
  search: $("#search"),
  status: $("#data-status"),
  year: $("#year"),
};

const storageKey = "shokugyo-joken:occupations:v1";
const defaultSelection = ["10", "25", "36"];
const state = {
  index: null,
  records: new Map(),
  metric: "bonus",
  selected: [],
};

const dnt = navigator.doNotTrack === "1" || navigator.globalPrivacyControl === true;
const qa = new URLSearchParams(location.search).get("qa") === "1" || navigator.webdriver === true;
let session = sessionStorage.getItem("shokugyo-joken:session");
if (!session && !dnt) {
  session = crypto.randomUUID();
  sessionStorage.setItem("shokugyo-joken:session", session);
}
const track = (name) => {
  if (!session || dnt) return;
  void fetch("/api/telemetry", {
    body: JSON.stringify({ name }),
    headers: {
      "content-type": "application/json",
      "x-shokugyo-joken-qa": qa ? "1" : "0",
      "x-shokugyo-joken-session": session,
    },
    keepalive: true,
    method: "POST",
  }).catch(() => {});
};

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>'"]/gu,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character],
  );
const normalize = (value) => value.normalize("NFKC").toLocaleLowerCase("ja").trim();
const integer = new Intl.NumberFormat("ja-JP");
const yearIndex = () => state.index.years.indexOf(Number(elements.year.value));
const currentSeries = (record) => record[elements.employment.value][yearIndex()];

const metricValue = (values, metric = state.metric) => {
  if (metric === "bonus") {
    const [present, absent] = values;
    if (present === null || absent === null) return null;
    const total = present + absent;
    return { absent, present, rate: total === 0 ? null : (present / total) * 100, total };
  }
  const [upper, unlimited, fixed, absent] = values.slice(2);
  const present = upper + unlimited + fixed;
  const total = present + absent;
  return {
    absent,
    fixed,
    present,
    rate: total === 0 ? null : (present / total) * 100,
    total,
    unlimited,
    upper,
  };
};
const rateText = (metric) => (metric.rate === null ? "算出なし" : `${metric.rate.toFixed(1)}%`);
const metricLabel = () => (state.metric === "bonus" ? "賞与あり" : "通勤手当あり");

const loadSelected = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (Array.isArray(stored)) return stored.filter((item) => typeof item === "string").slice(0, 4);
  } catch {}
  return [...defaultSelection];
};
const saveSelected = () => localStorage.setItem(storageKey, JSON.stringify(state.selected));

const renderAggregate = () => {
  const special = state.index.bonusAggregate;
  const selectedSpecial = state.selected.filter((id) => special.occupationIds.includes(id));
  if (state.metric !== "bonus" || selectedSpecial.length === 0) {
    elements.aggregateNote.hidden = true;
    elements.aggregateNote.replaceChildren();
    return;
  }
  const values = special[elements.employment.value][yearIndex()];
  const metric = metricValue(values, "bonus");
  const names = selectedSpecial.map(
    (id) => state.index.occupations.find((item) => item.id === id).name,
  );
  elements.aggregateNote.hidden = false;
  elements.aggregateNote.innerHTML = `
    <span aria-hidden="true">9</span>
    <div>
      <strong>個別値の代わりに、9職種合計なら ${rateText(metric)}</strong>
      <p>${escapeHtml(names.join("、"))}を含む公式合算です。選択職種だけの割合ではありません。</p>
      <small>賞与あり ${integer.format(metric.present)}人分 ／ 合計 ${integer.format(metric.total)}人分</small>
    </div>`;
};

const breakdownHtml = (values) => {
  if (state.metric === "bonus") {
    return `<dl class="breakdown"><div><dt>賞与あり</dt><dd>${integer.format(values[0])}</dd></div><div><dt>賞与なし</dt><dd>${integer.format(values[1])}</dd></div></dl>`;
  }
  const labels = ["上限あり", "上限なし", "一定額", "支給なし"];
  return `<dl class="breakdown commute-breakdown">${values
    .slice(2)
    .map((value, index) => `<div><dt>${labels[index]}</dt><dd>${integer.format(value)}</dd></div>`)
    .join("")}</dl>`;
};

const renderCompare = () => {
  elements.compareCount.textContent = `${state.selected.length} / 4`;
  elements.copy.disabled = state.selected.length === 0;
  if (state.selected.length === 0) {
    elements.compareList.innerHTML =
      '<div class="empty-compare">下の職種カードから、比べたい仕事を選んでください。</div>';
    renderAggregate();
    return;
  }
  elements.compareList.innerHTML = state.selected
    .map((id) => {
      const occupation = state.index.occupations.find((item) => item.id === id);
      const values = currentSeries(state.records.get(id));
      const metric = metricValue(values);
      const unavailable = metric === null;
      return `<article class="comparison-card${unavailable ? " is-unavailable" : ""}">
        <div class="comparison-title">
          <span>${occupation.group} · ${occupation.id}</span>
          <button aria-label="${escapeHtml(occupation.name)}を比較から外す" data-remove="${id}" type="button">×</button>
        </div>
        <h3>${escapeHtml(occupation.name)}</h3>
        <div class="rate-display">
          <span>${metricLabel()}</span>
          <strong>${unavailable ? "個別値なし" : rateText(metric)}</strong>
        </div>
        ${
          unavailable
            ? '<p class="unavailable-copy">賞与表にこの職種の個別行がありません。0件として扱いません。</p>'
            : `<div aria-hidden="true" class="rate-track"><i style="width:${Math.min(metric.rate ?? 0, 100).toFixed(2)}%"></i></div>${breakdownHtml(values)}<p class="record-total">新規求人数 合計 ${integer.format(metric.total)}人分</p>`
        }
      </article>`;
    })
    .join("");
  for (const button of elements.compareList.querySelectorAll("[data-remove]")) {
    button.addEventListener("click", () => removeOccupation(button.dataset.remove));
  }
  renderAggregate();
};

const renderCatalogue = () => {
  const query = normalize(elements.search.value);
  const group = elements.group.value;
  const occupations = state.index.occupations.filter(
    (occupation) =>
      (group === "all" || occupation.group === group) &&
      (!query || normalize(`${occupation.id} ${occupation.name}`).includes(query)),
  );
  elements.status.textContent = `${occupations.length} / ${state.index.occupationCount} 職種`;
  elements.list.innerHTML = occupations
    .map((occupation) => {
      const selected = state.selected.includes(occupation.id);
      const full = state.selected.length >= 4 && !selected;
      const values = currentSeries(state.records.get(occupation.id));
      const metric = metricValue(values);
      return `<article class="occupation-card${selected ? " is-selected" : ""}">
        <div class="occupation-code"><span>${occupation.group}</span><b>${occupation.id}</b></div>
        <h3>${escapeHtml(occupation.name)}</h3>
        <p>${metric === null ? "賞与の個別値なし" : `${metricLabel()} ${rateText(metric)}`}</p>
        <button aria-pressed="${selected}" ${full ? "disabled" : ""} data-select="${occupation.id}" type="button">
          ${selected ? "比較中" : "比較に追加"}
        </button>
      </article>`;
    })
    .join("");
  for (const button of elements.list.querySelectorAll("[data-select]")) {
    button.addEventListener("click", () => toggleOccupation(button.dataset.select));
  }
  if (occupations.length === 0) track("no_result");
};

const toggleOccupation = (id) => {
  if (state.selected.includes(id)) return removeOccupation(id);
  if (state.selected.length >= 4) return;
  state.selected.push(id);
  saveSelected();
  track("occupation_added");
  if (state.selected.length >= 2) track("compared");
  renderCompare();
  renderCatalogue();
};
const removeOccupation = (id) => {
  state.selected = state.selected.filter((item) => item !== id);
  saveSelected();
  track("occupation_removed");
  renderCompare();
  renderCatalogue();
};

const copyComparison = async () => {
  const context = `${elements.year.value}年度・${elements.employment.selectedOptions[0].textContent}`;
  const lines = state.selected.map((id) => {
    const occupation = state.index.occupations.find((item) => item.id === id);
    const metric = metricValue(currentSeries(state.records.get(id)));
    if (metric === null) return `${occupation.name}: ${metricLabel()} 個別値なし`;
    return `${occupation.name}: ${metricLabel()} ${rateText(metric)}（${integer.format(metric.present)} / ${integer.format(metric.total)}人分）`;
  });
  const text = [`職種求人条件｜${context}`, ...lines, location.origin].join("\n");
  try {
    await navigator.clipboard.writeText(text);
    const old = elements.copy.textContent;
    elements.copy.textContent = "コピーしました";
    setTimeout(() => (elements.copy.textContent = old), 1600);
    track("copied");
  } catch {
    elements.copy.textContent = "コピーできませんでした";
  }
};

const refresh = () => {
  renderCompare();
  renderCatalogue();
};

const start = async () => {
  const [indexResponse, dataResponse] = await Promise.all([
    fetch("/data/index.json"),
    fetch("/data/conditions.json"),
  ]);
  if (!indexResponse.ok || !dataResponse.ok) throw new Error("data_fetch_failed");
  const [index, records] = await Promise.all([indexResponse.json(), dataResponse.json()]);
  state.index = index;
  state.records = new Map(records.map((record) => [record.o, record]));
  const validIds = new Set(index.occupations.map((item) => item.id));
  state.selected = loadSelected()
    .filter((id) => validIds.has(id))
    .slice(0, 4);
  for (const group of index.groups) {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = `${group.id} ${group.name}`;
    elements.group.append(option);
  }
  refresh();
  track("visited");
};

let searchTimer;
elements.search.addEventListener("input", () => {
  renderCatalogue();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (elements.search.value.trim()) track("searched");
  }, 500);
});
elements.group.addEventListener("change", () => {
  track("group_changed");
  renderCatalogue();
});
elements.employment.addEventListener("change", () => {
  track("employment_changed");
  refresh();
});
elements.year.addEventListener("change", () => {
  track("year_changed");
  refresh();
});
for (const input of document.querySelectorAll('input[name="metric"]')) {
  input.addEventListener("change", () => {
    state.metric = input.value;
    track("metric_changed");
    refresh();
  });
}
elements.copy.addEventListener("click", copyComparison);

start().catch(() => {
  elements.status.textContent =
    "データを読み込めませんでした。時間をおいて再読み込みしてください。";
  elements.list.innerHTML = '<p class="load-error">公式表データの読み込みに失敗しました。</p>';
});
