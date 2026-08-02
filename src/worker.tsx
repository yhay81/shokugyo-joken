import { Hono } from "hono";
import type { Context } from "hono";
import { jsxRenderer } from "hono/jsx-renderer";

type Bindings = { ASSETS: Fetcher; DB: D1Database };
type Variables = { requestId: string };
type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403,
  ) {
    super(message);
  }
}

const origin = "https://shokugyo-joken.yhay81.com";
const dataPage = "https://www.mhlw.go.jp/toukei/list/114-1d.html";
const bonusWorkbook = "https://www.mhlw.go.jp/toukei/list/xls/114-1d-14.xlsx";
const commuteWorkbook = "https://www.mhlw.go.jp/toukei/list/xls/114-1d-17.xlsx";
const termsPage = "https://www.mhlw.go.jp/toukei/list/114-1_yougo.html";
const useTerms = "https://www.mhlw.go.jp/chosakuken/index.html";
const sessionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const eventNames = new Set([
  "visited",
  "searched",
  "no_result",
  "group_changed",
  "employment_changed",
  "year_changed",
  "metric_changed",
  "occupation_added",
  "occupation_removed",
  "compared",
  "copied",
]);

const nowSeconds = () => Math.floor(Date.now() / 1000);
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
const sameOrigin = (c: AppContext) => {
  const site = c.req.header("sec-fetch-site");
  if (site && site !== "same-origin") throw new ApiError("cross_site_request", 403);
  const requestOrigin = c.req.header("origin");
  if (requestOrigin && requestOrigin !== new URL(c.req.url).origin)
    throw new ApiError("cross_site_request", 403);
};
const parseJson = async (c: AppContext) => {
  if (Number(c.req.header("content-length") ?? "0") > 512)
    throw new ApiError("invalid_payload", 400);
  try {
    return await c.req.json<unknown>();
  } catch {
    throw new ApiError("invalid_json", 400);
  }
};
const record = async (c: AppContext, name: string) => {
  const session = (c.req.header("x-shokugyo-joken-session") ?? "").toLowerCase();
  if (!sessionPattern.test(session)) return;
  await c.env.DB.prepare(
    "INSERT INTO product_events (session_hash,event_name,is_qa,created_at) VALUES (?,?,?,?)",
  )
    .bind(
      await sha256(session),
      name,
      c.req.header("x-shokugyo-joken-qa") === "1" ? 1 : 0,
      nowSeconds(),
    )
    .run();
};

const nav = [
  { href: "/", label: "職種を比べる" },
  { href: "/guide", label: "数字の見方" },
  { href: "/source", label: "出典" },
  { href: "/privacy", label: "保存" },
];

const Layout = ({
  canonical,
  children,
  description,
  noindex = false,
  title,
}: {
  canonical: string;
  children: unknown;
  description: string;
  noindex?: boolean;
  title: string;
}) => (
  <html lang="ja">
    <head>
      <meta charset="utf-8" />
      <meta content="width=device-width, initial-scale=1" name="viewport" />
      <title>{title}</title>
      <meta content={description} name="description" />
      <link href={canonical} rel="canonical" />
      {noindex ? <meta content="noindex" name="robots" /> : null}
      <meta content="website" property="og:type" />
      <meta content="ja_JP" property="og:locale" />
      <meta content={title} property="og:title" />
      <meta content={description} property="og:description" />
      <meta content={canonical} property="og:url" />
      <meta content={`${origin}/og.svg`} property="og:image" />
      <meta content="summary_large_image" name="twitter:card" />
      <meta content="#19353b" name="theme-color" />
      <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
      <link href="/manifest.webmanifest" rel="manifest" />
      <link href="/styles.css" rel="stylesheet" />
    </head>
    <body>
      <header class="site-header">
        <a aria-label="職種求人条件 ホーム" class="brand" href="/">
          <span aria-hidden="true" class="brand-mark">
            <i />
            <i />
          </span>
          <span>職種求人条件</span>
        </a>
        <nav aria-label="主なページ">
          {nav.map((item) => (
            <a href={item.href}>{item.label}</a>
          ))}
        </nav>
      </header>
      {children}
      <footer>
        <div>
          <strong>職種求人条件</strong>
          <p>厚生労働省「職業安定業務統計 雇用関係指標」を加工して作成</p>
        </div>
        <div class="footer-links">
          <a href="/source">出典と注意</a>
          <a href="/privacy">保存と計測</a>
          <a href="https://github.com/yhay81/shokugyo-joken">ソースコード</a>
        </div>
      </footer>
    </body>
  </html>
);

const ConditionSlipFigure = () => (
  <div
    aria-label="求人票に賞与と通勤手当の条件印を押して職種別に仕分ける図"
    class="condition-desk"
    role="img"
  >
    <div class="desk-tabs" aria-hidden="true">
      <i>Ｃ</i>
      <i>Ｅ</i>
      <i>Ｂ</i>
    </div>
    <div class="job-slip" aria-hidden="true">
      <span class="slip-number">25</span>
      <strong>一般事務従事者</strong>
      <div class="slip-rule" />
      <div class="condition-stamps">
        <span class="stamp bonus-stamp">
          <small>賞与あり</small>
          <b>65.0%</b>
        </span>
        <span class="stamp commute-stamp">
          <small>通勤手当あり</small>
          <b>95.1%</b>
        </span>
      </div>
      <small>2025年度 · パートを含む常用</small>
    </div>
    <div class="desk-pocket" aria-hidden="true">
      <i />
      <i />
      <i />
    </div>
  </div>
);

const HomePage = () => (
  <Layout
    canonical={`${origin}/`}
    description="ハローワークの新規求人数から、73職種の賞与・通勤手当の明示状況を2023〜2025年度、2つの雇用区分で最大4職種まで比較できます。"
    title="職種別に賞与・通勤手当の求人割合を比較 | 職種求人条件"
  >
    <main>
      <section class="hero-shell">
        <div class="hero-copy">
          <p class="period-label">2023—2025年度 · ハローワーク新規求人</p>
          <h1>求人票の条件を、職種ごとに仕分ける。</h1>
          <p class="lead">賞与と通勤手当が明示された新規求人数を、元の件数まで並べて比べます。</p>
          <div aria-label="収録内容" class="hero-facts">
            <span>
              <b>73</b> 職種
            </span>
            <span>
              <b>2</b> 条件
            </span>
            <span>
              <b>最大4</b> 職種比較
            </span>
          </div>
        </div>
        <ConditionSlipFigure />
      </section>

      <section aria-labelledby="compare-title" class="compare-workbench">
        <div class="section-heading">
          <div>
            <p class="section-kicker">比較台</p>
            <h2 id="compare-title">選んだ職種の求人票</h2>
          </div>
          <div class="compare-tools">
            <span id="compare-count">0 / 4</span>
            <button disabled id="copy-compare" type="button">
              比較をコピー
            </button>
          </div>
        </div>
        <div class="metric-controls">
          <fieldset class="metric-switch">
            <legend>表示する条件</legend>
            <label>
              <input checked name="metric" type="radio" value="bonus" />
              <span>賞与</span>
            </label>
            <label>
              <input name="metric" type="radio" value="commute" />
              <span>通勤手当</span>
            </label>
          </fieldset>
          <label>
            <span>雇用区分</span>
            <select id="employment">
              <option value="a">パートを含む常用</option>
              <option value="f">パートを除く常用</option>
            </select>
          </label>
          <label>
            <span>年度</span>
            <select id="year">
              <option value="2025">2025年度</option>
              <option value="2024">2024年度</option>
              <option value="2023">2023年度</option>
            </select>
          </label>
        </div>
        <div class="comparison-grid" id="compare-list">
          <div class="empty-compare">下の職種カードから、比べたい仕事を選んでください。</div>
        </div>
        <div hidden id="aggregate-note" class="aggregate-note" />
      </section>

      <section aria-labelledby="catalogue-title" class="catalogue">
        <div class="section-heading">
          <div>
            <p class="section-kicker">職種カード</p>
            <h2 id="catalogue-title">比べる仕事を選ぶ</h2>
          </div>
          <p id="data-status" role="status">
            公式表を読み込んでいます
          </p>
        </div>
        <div class="catalogue-controls">
          <label class="search-field">
            <span>職種名</span>
            <input
              autocomplete="off"
              id="search"
              placeholder="例：事務、介護、情報"
              type="search"
            />
          </label>
          <label>
            <span>分類</span>
            <select id="group">
              <option value="all">すべての分類</option>
            </select>
          </label>
        </div>
        <div class="occupation-grid" id="occupation-list" />
      </section>

      <aside class="boundary">
        <span aria-hidden="true" class="boundary-mark">
          票
        </span>
        <div>
          <strong>求人票で条件が明示された新規求人数の割合です</strong>
          <p>
            賞与額・回数、通勤手当額、実際の支給、応募数、採用確率、仕事の質は示しません。同じ求人が複数人募集なら人数分を含みます。
          </p>
        </div>
      </aside>
    </main>
    <script defer src="/app.js" />
  </Layout>
);

const GuidePage = () => (
  <Layout
    canonical={`${origin}/guide`}
    description="職種求人条件の賞与あり率、通勤手当あり率、新規求人数、雇用区分、個別値なしの読み方を説明します。"
    title="数字の見方 | 職種求人条件"
  >
    <main class="text-page">
      <div class="page-intro">
        <p class="section-kicker">数字の見方</p>
        <h1>6つの箱を、そのまま数える。</h1>
        <p>公式表にある新規求人数の区分を合計し、条件を明示した割合を算出します。</p>
      </div>
      <section class="formula-sheet" aria-label="求人条件割合の計算方法">
        <div>
          <span>賞与あり</span>
          <strong>392,075</strong>
        </div>
        <b>÷</b>
        <div>
          <span>あり ＋ なし</span>
          <strong>602,900</strong>
        </div>
        <i>=</i>
        <div class="formula-result">
          <span>賞与あり率</span>
          <strong>65.0%</strong>
        </div>
      </section>
      <section class="guide-grid">
        <article>
          <span>賞与</span>
          <h2>あり ÷ 全求人</h2>
          <p>
            「賞与あり」と「賞与なし」の新規求人数を分母にします。金額や支給回数は分かりません。
          </p>
        </article>
        <article>
          <span>通勤手当</span>
          <h2>支給3区分 ÷ 全求人</h2>
          <p>上限あり・上限なし・一定額支給を「あり」とし、支給なしを含む4区分を分母にします。</p>
        </article>
        <article>
          <span>求人の単位</span>
          <h2>求人票ではなく求人数</h2>
          <p>
            1件の求人で3人を募集する場合は3人として集計されます。年度値は月ごとの新規求人数の合計です。
          </p>
        </article>
        <article>
          <span>雇用区分</span>
          <h2>2つの公式値</h2>
          <p>「パートを含む常用」と「パートを除く常用」を切り替えます。差分値は表示しません。</p>
        </article>
      </section>
      <section class="note-panel">
        <h2>賞与の個別値がない19職種</h2>
        <p>
          賞与表は54職種を個別掲載し、研究者など9職種は合算、管理・保安・農林漁業の10職種は個別掲載していません。0件とみなさず「個別値なし」と表示します。
        </p>
        <a href={dataPage}>厚生労働省 雇用関係指標</a>
      </section>
    </main>
  </Layout>
);

const SourcePage = () => (
  <Layout
    canonical={`${origin}/source`}
    description="職種求人条件が使う厚生労働省の第14表・第17表、収録範囲、欠測の扱い、確認日、利用条件を示します。"
    title="出典と注意 | 職種求人条件"
  >
    <main class="text-page">
      <div class="page-intro">
        <p class="section-kicker">出典</p>
        <h1>2つの公式表を、職種と年度で照合。</h1>
        <p>2026年8月2日に取得した現行Excelを、職種コード・雇用区分・年度で対応づけました。</p>
      </div>
      <section class="source-grid">
        <article>
          <span>第14表</span>
          <h2>賞与の有無別・職業別</h2>
          <p>賞与あり・賞与なしの新規求人数。54職種の個別行と、9職種をまとめた1行を収録します。</p>
          <a href={bonusWorkbook}>原表Excel</a>
        </article>
        <article>
          <span>第17表</span>
          <h2>通勤手当の有無別・職業別</h2>
          <p>上限あり・上限なし・一定額支給・支給なしの新規求人数。73職種を個別収録します。</p>
          <a href={commuteWorkbook}>原表Excel</a>
        </article>
      </section>
      <section class="source-detail">
        <h2>照合と欠測</h2>
        <dl>
          <div>
            <dt>収録</dt>
            <dd>
              2023〜2025年度、73職種、2雇用区分、6条件区分。2,628値のうち2,400値を原表から収録。
            </dd>
          </div>
          <div>
            <dt>照合</dt>
            <dd>職業計12組、個別職種324組、9職種合算6組で条件区分の合計が一致。</dd>
          </div>
          <div>
            <dt>個別値なし</dt>
            <dd>賞与表に個別行がない19職種の228セルはnullで保持し、0や周辺値で補完しません。</dd>
          </div>
          <div>
            <dt>範囲</dt>
            <dd>公共職業安定所が扱った新規求人です。民間求人を含む労働市場全体ではありません。</dd>
          </div>
        </dl>
      </section>
      <section class="link-row">
        <a href={dataPage}>雇用関係指標（年度）</a>
        <a href={termsPage}>用語の解説</a>
        <a href={useTerms}>厚生労働省の利用条件</a>
      </section>
    </main>
  </Layout>
);

const PrivacyPage = () => (
  <Layout
    canonical={`${origin}/privacy`}
    description="職種求人条件の端末保存、匿名利用計測、保持期間、追跡拒否への対応を示します。"
    title="保存と計測 | 職種求人条件"
  >
    <main class="text-page">
      <div class="page-intro">
        <p class="section-kicker">保存</p>
        <h1>選んだ職種は、端末に。</h1>
        <p>検索語、職種名、年度、雇用区分、件数、割合をサーバーへ記録しません。</p>
      </div>
      <section class="privacy-grid">
        <article>
          <h2>端末に保存</h2>
          <p>比較に選んだ公開職種IDを最大4件だけブラウザへ保存します。アカウントは不要です。</p>
        </article>
        <article>
          <h2>操作名だけを計測</h2>
          <p>訪問、検索、0件、条件変更、比較への追加・削除、コピーの操作名だけを計測します。</p>
        </article>
        <article>
          <h2>35日で削除</h2>
          <p>
            ランダムなセッションIDをSHA-256で変換し、操作名、QA区分、時刻とともにD1へ保存します。
          </p>
        </article>
        <article>
          <h2>追跡拒否を尊重</h2>
          <p>
            Do Not TrackまたはGlobal Privacy
            Controlが有効な場合は計測しません。広告・外部解析・Cookieは使いません。
          </p>
        </article>
      </section>
    </main>
  </Layout>
);

export const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  await next();
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
  );
  c.header("Cross-Origin-Opener-Policy", "same-origin");
  c.header("Cross-Origin-Resource-Policy", "same-origin");
  c.header("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-Request-Id", c.get("requestId"));
});
app.use(
  "*",
  jsxRenderer(({ children }) => <>{children}</>),
);
app.get("/", (c) => c.html(<HomePage />));
app.get("/guide", (c) => c.html(<GuidePage />));
app.get("/source", (c) => c.html(<SourcePage />));
app.get("/privacy", (c) => c.html(<PrivacyPage />));
app.post("/api/telemetry", async (c) => {
  sameOrigin(c);
  const body = await parseJson(c);
  if (
    typeof body !== "object" ||
    body === null ||
    !("name" in body) ||
    typeof body.name !== "string" ||
    !eventNames.has(body.name)
  )
    throw new ApiError("invalid_event", 400);
  await record(c, body.name);
  return c.body(null, 202);
});
app.get("/health", async (c) => {
  const row = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
  return c.json({
    asOf: "2026-08-02",
    ok: row?.ok === 1,
    records: 73,
    service: "shokugyo-joken",
  });
});
app.get("/sitemap.xml", (c) => {
  const paths = ["/", "/guide", "/source", "/privacy"];
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${origin}${path}</loc></url>`).join("")}</urlset>`;
  c.header("Cache-Control", "public,max-age=300,s-maxage=300");
  c.header("Content-Type", "application/xml; charset=utf-8");
  return c.body(xml);
});
app.notFound((c) => {
  c.status(404);
  return c.html(
    <Layout
      canonical={`${origin}/404`}
      description="指定されたページは見つかりません。"
      noindex
      title="ページが見つかりません | 職種求人条件"
    >
      <main class="text-page">
        <div class="page-intro">
          <p class="section-kicker">404</p>
          <h1>この求人票は見つかりません。</h1>
          <p>
            <a href="/">職種の比較へ戻る</a>
          </p>
        </div>
      </main>
    </Layout>,
  );
});
app.onError((error, c) => {
  if (error instanceof ApiError)
    return c.json({ error: error.message, requestId: c.get("requestId") }, error.status);
  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      requestId: c.get("requestId"),
    }),
  );
  return c.json({ error: "internal_error", requestId: c.get("requestId") }, 500);
});

export const scheduled = async (_event: ScheduledEvent, env: Bindings, _ctx: ExecutionContext) => {
  await env.DB.prepare("DELETE FROM product_events WHERE created_at < ?")
    .bind(nowSeconds() - 35 * 86400)
    .run();
};

export default app;
