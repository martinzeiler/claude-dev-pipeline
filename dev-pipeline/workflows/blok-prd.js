export const meta = {
  name: 'blok-prd',
  description: 'dev-pipeline blok PRD jednoho řezu: PRD architekt napíše PRD a E2E scénáře (velký řez jako kostru s Kontraktem a tabulkou Částí, PRD částí souběžně píšou autoři částí), nezávislá kontrola po dokumentech (měřidla kritérií se spouští už v kole 1), zapracování nálezů (kostra, pak části), delta kontrola jen nad změněnými místy. Žádné třetí kolo, zbylé nálezy jdou stavbě jako hypotézy. Režim zapracovani: jen zapracování nálezů orchestrátora do hotového PRD + delta kontrola.',
  whenToUse: 'Spouští orchestrátor /dev-pipeline:orchestrate před blokem stavby každého řezu. args: {cwd, plugin_root, vize, produkt, rez, plan_row, stav_po_minulem, hypotezy, follow_ups, app_pristup, profil, kontrakt_prd, kontrakt_rez, mapa_vize}; režim zapracování navíc {rezim: "zapracovani", prd_path, e2e_path, nalezy: [...], puvodni} (puvodni = předchozí návrat bloku PRD: výchozí casti, e2e_sekce, kontrakt_potreba, doklad_pred, doklad_popis, odhad_radku, kriteria). Bez args nic nedělá.',
  phases: [
    { title: 'PRD', detail: 'PRD architekt píše PRD a E2E scénáře; velký řez rozdělí na části (kostra s Kontraktem a tabulkou Částí), malý řez píše celý' },
    { title: 'Autoři částí', detail: 'jen u řezu s částmi: autor každé části souběžně píše PRD své části ověřené proti kódu své oblasti' },
    { title: 'Kontrola', detail: 'prd-check kolo 1 kostry (u malého řezu celého PRD) a souběžně každé části, plné reporty do souborů' },
    { title: 'Zapracování', detail: 'nejdřív kostra (nálezy, požadavky částí na Kontrakt), pak souběžně části; vrací změněná místa' },
    { title: 'Delta kontrola', detail: 'prd-check jen nad změněnými místy, po dokumentech s aspoň dvěma blokujícími nálezy kola 1; u lehkého profilu nikdy' },
  ],
}

// ---------- vstup ----------
let a = args
if (typeof a === 'string') { try { a = JSON.parse(a) } catch { a = null } }
if (!a || typeof a !== 'object' || !a.cwd || !a.vize || a.rez == null || a.rez === '' || !a.plan_row) {
  log('blok-prd: chybí args (cwd, vize, rez, plan_row) – nic se nespustilo')
  return { ok: false, duvod: 'chybí args: cwd, vize, rez, plan_row' }
}
const S = v => String(v == null ? '' : v)
const NN = String(a.rez).padStart(2, '0')
const cwd = S(a.cwd)
// Pravidla běhu (KONTRAKT.md: soubory, frontmatter PRD, vize-spory). V rámci se nejmenují „kontrakt“: architekt a autoři částí
// pracují se sekcí Kontrakt kostry PRD a dva různé kontrakty v jednom zadání se pletou.
const pravidlaBehu = a.plugin_root ? `${a.plugin_root}/skills/orchestrate/KONTRAKT.md` : null
const produkt = a.produkt ? S(a.produkt) : null
const row = a.plan_row
const stavPoMinulem = a.stav_po_minulem ? S(a.stav_po_minulem) : null
const hypotezy = Array.isArray(a.hypotezy) ? a.hypotezy.map(S) : []
const followUps = a.follow_ups ? S(a.follow_ups) : `${cwd}/docs/follow-ups.md`
const spory = `${cwd}/docs/vize-spory.md`
// Pokyny majitele k prostředí (přístup do aplikace, nasazení, doklady): PRD podle nich předepisuje doklad před migrací.
const appPristup = a.app_pristup ? S(a.app_pristup).slice(0, 1200) : ''
// Lehký profil (řádek plánu `profil: lehký`, nebo úsudek orchestrátora u řezu bez runtime dopadu): bez delta kontroly.
const profil = a.profil === 'lehky' ? 'lehky' : 'plny'
// PRD závislého řezu souběžně se stavbou jeho závislosti: PRD stavěného řezu je kontrakt, rozhraní z něj jsou předpoklady.
const kontraktPrd = a.kontrakt_prd ? S(a.kontrakt_prd) : ''
const kontraktRez = a.kontrakt_rez != null && a.kontrakt_rez !== '' ? String(a.kontrakt_rez).padStart(2, '0') : ''
// Mapa sekcí vize s řádky od–do (setup orchestrátora): agenti bloku čtou výřez vize, ne celou. PRD agent běhu bez-dluhu
// protočil Ø 433 k, z toho 72 k vize (118 kB, čtená celá).
const mapa = a.mapa_vize ? S(a.mapa_vize).slice(0, 2400) : ''
// Režim zapracování: orchestrátor odmítl odchylku od plánu nebo chybí pokrytí bodů vize; místo nového PRD (celý blok znovu)
// běží jen PRD agent v režimu zapracování nad hotovým PRD (kostrou) a delta prd-check nad změněnými místy.
const rezim = a.rezim === 'zapracovani' ? 'zapracovani' : 'novy'
const nalezyOrch = (Array.isArray(a.nalezy) ? a.nalezy.map(S) : (a.nalezy ? [S(a.nalezy)] : [])).filter(Boolean)
if (rezim === 'zapracovani' && (!a.prd_path || !nalezyOrch.length)) {
  log('blok-prd: režim zapracovani vyžaduje prd_path a nalezy – nic se nespustilo')
  return { ok: false, duvod: 'režim zapracovani vyžaduje prd_path a nalezy' }
}
// Předchozí návrat bloku PRD pro režim zapracování (casti, e2e_sekce, kontrakt_potreba, doklad_pred, doklad_popis, odhad_radku,
// kriteria): výchozí hodnoty, které přebije jen to, co zapracování výslovně vrátí. Bez nich návrat ztratil e2e_sekce (stavba
// pustila jednoho verifikátora na 30 kritérií) a přepnul kontrakt_potreba na true a doklad_pred na false (revize 1.4.0).
const puvodni = a.puvodni && typeof a.puvodni === 'object' && !Array.isArray(a.puvodni) ? a.puvodni : null

// ---------- pomocné ----------
const cekej = ms => (ms > 0 && typeof setTimeout === 'function') ? new Promise(r => setTimeout(r, ms)) : Promise.resolve()
const seznam = v => (Array.isArray(v) ? v : (v ? [v] : [])).map(S).map(x => x.trim()).filter(Boolean)
// Seznam do zadání celý po položkách, strop celku jen jako pojistka. Ořez celku uprostřed položky (slice(0, 2000)) ztratil v běhu
// web-podzim 111 ze 197 požadavků autorů na Kontrakt: kontrola ani zapracování kostry je neviděly.
const spojCele = (xs, strop = 20000) => {
  const out = []
  let delka = 0
  for (const x of xs) {
    if (delka + x.length > strop) { out.push(`… a ${xs.length - out.length} dalších položek nad strop zadání`); break }
    out.push(x); delka += x.length + 3
  }
  return out.join(' | ')
}
// Pořadí „nejdelší první“: Workflow pouští souběžně nejvýš min(16, jádra − 2) agentů a zbytek řadí do fronty v pořadí volání.
// Dlouhý agent na konci dávky čeká na volný slot a prodlouží celou fázi (běh web-podzim: PRD řezu 13 +30 min na stropu 6).
// Výsledky vrací v pořadí items.
async function parallelOdNejdelsiho(items, delka, fn) {
  const poradi = items.map((_, i) => i).sort((p, q) => (delka(items[q]) - delka(items[p])) || p - q)
  const vysl = await parallel(poradi.map(i => () => fn(items[i], i)))
  const out = items.map(() => null)
  poradi.forEach((i, j) => { out[i] = vysl[j] || null })
  return out
}
// Opakování po chybě zná stav předchůdce jen z pracovního stromu (třída C2: restart začínal od nuly nad rozdělanou prací).
const poChybe = 'Předchozí běh tohoto zadání skončil bez výsledku a pracovní strom může nést jeho rozdělanou práci: začni inventurou (git status, git diff --stat) a navaž na ni, nezačínej od nuly.'
async function run(prompt, opts) {
  const label = opts.label || 'agent'
  for (let i = 0; i <= 2; i++) {
    let r = null
    try { r = await agent(i >= 1 ? `${prompt}\n\n${poChybe}` : prompt, opts) } catch (e) { log(`${label}: spuštění selhalo (${String(e && e.message || e).slice(0, 120)})`) }
    if (r) return r
    if (i < 2) { log(`${label}: agent nevrátil výsledek, opakuji (${i + 1}/2)`); await cekej(15000 * (i + 1)) }
  }
  return null
}
// Štafeta: agent, který práci předal (zpráva PŘEDÁVKA z hooku hlídače kontextu), dostane nástupce se stejným zadáním
// a předávkou. Nástupce vrací návrat za celé zadání včetně práce předchůdce. Nejvýš 3 předávky, čtvrtá je selhání fáze.
// Předávka platí jen jako cesta, kterou jmenuje hook (docs/reviews/predavka-<agent_id>.md), a jen nová: v revizi 1.4.0 vyplnil
// agent pole textem „žádná“ a nástupce zopakoval cestu předchůdce; obojí blok bral jako další předávku a po třetí fázi zahodil.
const MAX_PREDAVEK = 3
const PREDAVKA_CESTA = /\/docs\/reviews\/predavka-[^/\s]+\.md$/
let predavekCelkem = 0
// Labely, jejichž fáze skončila na stropu předávek: důvod selhání je strop, ne „agent nevrátil výsledek“ (to je jiná vada).
const vycerpane = new Set()
const nic = (label, kdo) => vycerpane.has(label) ? `${kdo}: strop předávek vyčerpán (${MAX_PREDAVEK} předávky, ${label})` : `${kdo} nevrátil výsledek`
async function runSePredavkou(prompt, opts) {
  const label = opts.label || 'agent'
  vycerpane.delete(label)
  let r = await run(prompt, opts)
  const predane = []
  for (let n = 1; r && S(r.predavka).trim(); n++) {
    const soubor = S(r.predavka).trim()
    if (!PREDAVKA_CESTA.test(soubor) || predane.includes(soubor)) {
      log(`${label}${n > 1 ? `:n${n}` : ''}: pole predavka „${soubor.slice(0, 160)}“ není nová předávka (${predane.includes(soubor) ? 'cesta předávky předchůdce' : 'není cesta docs/reviews/predavka-….md'}); návrat beru jako konečný`)
      break
    }
    predane.push(soubor)
    predavekCelkem++
    if (n > MAX_PREDAVEK) { vycerpane.add(label); log(`${label}: předávky vyčerpány (${n}. předávka, strop ${MAX_PREDAVEK}); fáze selhala na stropu předávek, ne na chybějícím výsledku (${soubor})`); return null }
    log(`${label}: předávka ${n}/${MAX_PREDAVEK} (${soubor})`)
    r = await run(`${prompt}\n\nNavazuješ na předchůdce, který práci na tomto zadání předal. Nejdřív přečti předávku ${soubor} a pokračuj od ní: hotové neopakuj, co předávka uvádí jako ověřené, znovu neověřuj, stav stromu si potvrď přes git status. Strukturovaný návrat vrať za celé zadání včetně práce předchůdce (počty, seznamy, follow-upy a nálezy z předávky).`,
      { ...opts, label: `${label}:n${n + 1}` })
  }
  return r
}
// Části implementace (tvar § 1.6 spec 1.4.0). Jedna část není rozdělení: řez s méně než dvěma částmi běží jako malý (jedna implementace, PRD celé).
// zavisi_na se normalizuje stejně jako id: „K 1“ v závislosti by neodpovídalo části K1 a stavba by závislost zahodila jako neznámou.
const normId = v => S(v).replace(/\s+/g, '')
const castPath = id => `${cwd}/docs/prd/rez-${NN}-cast-${id}.md`
const normCast = (x, i) => {
  const id = normId(x.id) || `K${i + 1}`
  return { id, nazev: S(x.nazev).trim(), soubory: seznam(x.soubory), kriteria: seznam(x.kriteria), odhad_radku: Number(x.odhad_radku) || 0, zavisi_na: [...new Set(seznam(x.zavisi_na).map(normId).filter(Boolean))], prd_path: S(x.prd_path).trim() || castPath(id) }
}
const objekty = v => (Array.isArray(v) ? v : []).filter(x => x && typeof x === 'object')
// Duplicitní id (dvakrát K2, nebo část bez id, jejíž výchozí K<n> už má jiná část) blok přečísluje na nejmenší volné K<n>
// se záznamem v logu a ve vady (revize 1.4.0: dva autoři psali týž soubor rez-NN-cast-K2.md a stavba druhou část zahodila).
// Tabulka Části v kostře duplicitu dál nese: vady jdou zapracování kostry (hlidejCasti).
const normCasti = (v, vady = []) => {
  const syrove = objekty(v), c = syrove.map(normCast)
  if (c.length < 2) return []
  const vsechna = new Set(c.map(x => x.id)), videna = new Set()
  c.forEach((x, i) => {
    if (videna.has(x.id)) {
      let n = 1
      while (vsechna.has(`K${n}`)) n++
      const nove = `K${n}`
      const popis = `${normId(syrove[i].id) ? `id ${x.id} dvakrát (část „${x.nazev}“)` : `část „${x.nazev}“ bez id (výchozí ${x.id} už má jiná část)`}: blok ji přečísloval na ${nove}`
      log(`tabulka Části: ${popis}`); vady.push(popis)
      if (x.prd_path === castPath(x.id)) x.prd_path = castPath(nove)
      x.id = nove; vsechna.add(nove)
    }
    videna.add(x.id)
  })
  return c
}
// Cyklus v zavisi_na (DFS jako ve stavbě): cesta cyklu, nebo null. Závislost na neznámé části cyklus netvoří (stavba ji vynechá).
const cyklusCasti = cs => {
  const stavUzlu = new Map(), cesta = []
  const dfs = c => {
    stavUzlu.set(c.id, 'otevreny'); cesta.push(c.id)
    for (const z of c.zavisi_na) {
      if (stavUzlu.get(z) === 'otevreny') return [...cesta.slice(cesta.indexOf(z)), z]
      const dalsi = cs.find(x => x.id === z)
      if (dalsi && !stavUzlu.has(z)) { const r = dfs(dalsi); if (r) return r }
    }
    stavUzlu.set(c.id, 'hotovy'); cesta.pop()
    return null
  }
  for (const c of cs) if (!stavUzlu.has(c.id)) { const r = dfs(c); if (r) return r }
  return null
}
const vadyCasti = (cs, vady = []) => { const cy = cyklusCasti(cs); return [...vady, ...(cy ? [`cyklus v zavisi_na: ${cy.join(' → ')}`] : [])] }
// Zapracování kostry smí přesunout soubory, kritéria a závislosti mezi částmi; počet a id částí drží architekt (nová část by neměla autora ani kontrolu).
const sloucCasti = (puvodni, nove) => {
  const n = new Map(objekty(nove).map(normCast).map(c => [c.id, c]))
  const cizi = [...n.keys()].filter(id => !puvodni.some(c => c.id === id))
  if (cizi.length) log(`zapracování kostry vrátilo části mimo tabulku architekta (${cizi.join(', ')}): ignoruji, nemají autora ani kontrolu`)
  return puvodni.map(c => n.has(c.id) ? { ...n.get(c.id), nazev: n.get(c.id).nazev || c.nazev, prd_path: c.prd_path } : c)
}
// Sekce E2E s počtem kritérií (§ 1.7): blok stavby je rozdělí mezi souběžné verifikátory po skupinách do 12 kritérií. Starý tvar (řetězec) přijme také.
const normSekce = v => (Array.isArray(v) ? v : [])
  .map(x => x && typeof x === 'object' ? { nazev: S(x.nazev).trim(), kriterii: Math.max(0, Math.round(Number(x.kriterii) || 0)) } : S(x).trim())
  .filter(x => typeof x === 'string' ? x : x.nazev)
const ramec = [
  // Hook hlídače kontextu čte číslo řezu z prvního výskytu „Řez NN“ v transkriptu agenta.
  `Řez ${NN}: blok PRD.`,
  `Projekt: ${cwd} (absolutní cesty, git jen na vize větvi).`,
  `Vize: ${a.vize}${produkt ? ` · Produktová severka: ${produkt}` : ''}${pravidlaBehu ? ` · pravidla běhu (soubory, frontmatter PRD, vize-spory): ${pravidlaBehu}` : ''}.`,
  `Vizi nečti celou: přečti Proč, Cíle, Ne-cíle, body vize z řádku plánu, dotčená Povolení a Mantinely${mapa ? ` (mapa sekcí: ${mapa})` : ' (mapu sekcí dá grep -n "^## " vize)'}; ostatní jen grepem podle potřeby.`,
  'Běh je autonomní: uživatele se neptáš. Rozpor nebo chybějící rozhodnutí ve vizi zapiš do docs/vize-spory.md (formát podle pravidel běhu), rozhodni konzervativně a pokračuj.',
  'docs/handoff.md je stav orchestrátora, ne tvůj vstup: nečti ho; co máš vědět, je v tomto zadání.',
  'Tah končí jen strukturovaným návratem. Na proces, který jsi pustil na pozadí, nečekáš ukončením tahu: počkej na něj v tomtéž tahu (vlastní dlouhý příkaz přes `Monitor`, vnější stav smyčkou s pevným počtem iterací), nebo ho ukonči. Jedno čekací volání trvá nejvýš 4,5 minuty: cache agenta žije 5 minut a delší pauza zapíše celý kontext znovu. Dlouhý proces kontroluj opakovaně kratšími voláními se stropem iterací, ne jednou smyčkou na 10 minut. Smyčka bez stropu je zakázaná: po timeoutu se přesune na pozadí a přežije tě.',
  'Soubor, který pojmenováváš sám, pojmenuj česky podle vzoru rez-NN-<co>.md; Claude Code subagentům blokuje zápis markdownu se jmény summary, findings, analysis a report-….',
  'Tvůj finální výstup je strukturovaný návrat pro orchestrátor (schéma je vynucené), ne zpráva člověku. Do textových polí piš stručně, žádné výpisy souborů ani diffů.',
].join('\n')

// ---------- schémata ----------
const str = d => ({ type: 'string', description: d })
const arr = d => ({ type: 'array', items: { type: 'string' }, description: d })
const predavka = str('jen cesta k TVÉ předávce (docs/reviews/predavka-<tvoje agent id>.md), když tě vyzvala zpráva PŘEDÁVKA a práce ještě není hotová; když je zadání hotové, nevyplňuj; cestu předávky předchůdce sem nikdy nevracej')
const ODMITNUTE = { type: 'array', items: { type: 'object', required: ['id', 'duvod'], properties: { id: { type: 'string' }, duvod: { type: 'string' } } }, description: 'jen při zapracování: nálezy, které jsi po ověření proti kódu nezapracoval, s důvodem' }
const PRD_SCHEMA = {
  type: 'object',
  required: ['prd_path', 'e2e_path', 'cil', 'kriteria', 'souhrn', 'lesen', 'zapis_do_ziveho', 'runtime_dopad', 'odhad_radku', 'casti'],
  properties: {
    prd_path: str('absolutní cesta k docs/prd/rez-NN-<slug>.md (u řezu s částmi kostra)'),
    e2e_path: str('absolutní cesta k docs/e2e/rez-NN.md'),
    cil: str('cíl řezu jednou větou'),
    kriteria: { type: 'integer', description: 'počet akceptačních kritérií celého řezu' },
    souhrn: str('souhrn pro orchestrátora, max 20 řádků: rozsah (co ano / co ne), body vize, dotčené UI plochy, zápisy do živých systémů, rizika, odchylky od plánu'),
    lesen: { type: 'boolean', description: 'řez staví lešení (zkušební UI nebo nástroj mimo produktové plochy vize)' },
    lesen_popis: str('co je lešení, za jakou přístupovou hranicí sedí a kdy se odstraní'),
    zapis_do_ziveho: { type: 'boolean', description: 'řez zapisuje do živého vnějšího systému' },
    zapis_popis: str('do jakého systému, jaké operace a o které Povolení z vize se opírá (doslovně)'),
    runtime_dopad: { type: 'boolean', description: 'false = řez bez runtime dopadu (jen testy, tooling, dokumentace)' },
    nove_ui_plochy: arr('UI plochy, které PRD zavádí a vize je v seznamu UI ploch nejmenuje (prázdné = žádné)'),
    pokryte_body_vize: arr('čísla Cílů a požadavků vize, které řez plní (C1, F3, …)'),
    odchylky_od_planu: str('v čem se PRD liší od řádku plánu a proč; prázdné = bez odchylky'),
    spory: arr('nové záznamy ve vize-spory.md, každý jednou větou'),
    zmenena_mista: arr('jen při zapracování nálezů: sekce nebo kritéria PRD/E2E, která se změnila (u kostry místa v Kontraktu a Částech s předponou sekce: „Kontrakt: …“, „Části: …“)'),
    odmitnute: ODMITNUTE,
    oblasti: arr('dotčené moduly nebo oblasti kódu (stejný slovník jako návrat stavby: modul, ne soubor); orchestrátor podle nich pozná překryv s uzavřenými řezy'),
    doklad_pred: { type: 'boolean', description: 'true = PRD předepisuje doklad stavu před nasazením (migrace mění, přesouvá nebo maže existující data, nebo je nevratná; nebo pokyny majitele žádají doklad před každou migrací)' },
    doklad_popis: str('co se před migrací zachytí (tabulky, počty, vzorky, dotazy); prázdné bez dokladu'),
    e2e_sekce: { type: 'array', items: { type: 'object', required: ['nazev', 'kriterii'], properties: { nazev: str('název sekce, jak stojí v nadpisu E2E scénářů'), kriterii: { type: 'integer', description: 'počet kritérií, která sekce ověřuje' } } }, description: 'vzájemně nezávislé sekce E2E scénářů s počtem kritérií, jen když má řez víc než 12 kritérií (blok stavby je rozdělí mezi souběžné verifikátory po skupinách do 12 kritérií); jinak prázdné' },
    odhad_radku: { type: 'integer', description: 'odhad změněných řádků celého řezu včetně testů, fixtur a měřidel' },
    mapa_kostry: str('jen u řezu s částmi: mapa sekcí kostry PRD, řádek na sekci ve tvaru „od-do ## Sekce“ (čísla řádků souboru kostry, jako mapa vize); po změně kostry aktuální; u malého řezu prázdné'),
    casti: {
      type: 'array',
      description: 'části implementace podle tabulky Části (každá ~600–1 500 změněných řádků včetně testů, fixtur a měřidel, s vlastními soubory, kritérii a závislostmi); prázdné = malý řez, PRD celé',
      items: {
        type: 'object',
        required: ['id', 'nazev', 'soubory', 'kriteria', 'odhad_radku', 'zavisi_na'],
        properties: {
          id: str('K1, K2, …'),
          nazev: str('název části'),
          soubory: arr('soubory a oblasti části (cesty nebo globy), disjunktní s ostatními částmi; sdílené věci patří do Kontraktu'),
          kriteria: arr('ID kritérií, která část plní (AK3, …)'),
          odhad_radku: { type: 'integer', description: 'odhad změněných řádků části včetně testů, fixtur a měřidel' },
          zavisi_na: arr('id částí, které musí být hotové dřív (prázdné = nezávislá)'),
        },
      },
    },
    kontrakt_potreba: { type: 'boolean', description: 'jen u řezu s částmi: true = Kontrakt pokládá do kódu společné věci (schéma a migrace, typy, signatury rozhraní, registrace tras), které se implementují před částmi' },
    rozdelit_navrh: str('jen když odhad přesahuje ~12 k řádků nebo ~10 částí: jak řez rozdělit na dva podle rizika a závislostí; jinak prázdné'),
    predavka,
  },
}
const CAST_SCHEMA = {
  type: 'object',
  required: ['prd_path', 'kriteria', 'souhrn'],
  properties: {
    prd_path: str('absolutní cesta k docs/prd/rez-NN-cast-K.md'),
    kriteria: { type: 'integer', description: 'počet kritérií části' },
    souhrn: str('souhrn části, max 10 řádků: postup, precedent, pasti, rizika'),
    kontrakt_doplnit: arr('co Kontrakt v kostře nepokrývá a část to přitom potřebuje sdílet (typ, schéma, signatura, trasa), každé jednou větou'),
    spory: arr('nové záznamy ve vize-spory.md, každý jednou větou'),
    zmenena_mista: arr('jen při zapracování nálezů: sekce PRD části, které se změnily'),
    odmitnute: ODMITNUTE,
    predavka,
  },
}
const CHECK_SCHEMA = {
  type: 'object',
  required: ['verdikt', 'nalezu', 'blokujicich', 'report_path'],
  properties: {
    verdikt: { type: 'string', enum: ['ready', 'needs-fixes'] },
    nalezu: { type: 'integer' },
    blokujicich: { type: 'integer' },
    osy: arr('osy, na kterých nález padl (A úplnost vůči vizi, B technická validita, C kritéria, D rozsah, E optimalita)'),
    report_path: str('absolutní cesta k plnému reportu'),
    nalezy_ids: arr('identifikátory nálezů v reportu (N1, N2, …), blokující první'),
    nalezy_kostra: arr('jen kontrola části: identifikátory nálezů, jejichž oprava patří do kostry (text kritéria, Kontrakt, řádek části v tabulce Části)'),
    predavka,
  },
}

// Pravidla kritérií, která se opakovaně vyplatila (důkaz: dva opakované pokusy v běhu uklid-po-sklik padly na kritériích psaných jako výčet jmen a opsané číslo).
// Kritérium nad kódem měří brána nad odevzdávaným stromem: pravidlo z 1.2.0 (měřidlo bere revizi parametrem, aby ho E2E spustilo nad nasazenou revizí)
// vedlo v běhu bez-dluhu E2E verifikátory k worktree, instalaci a bráně v nich.
const pravidlaKriterii = 'Kritéria: vlastnost + kanál deklarované výjimky + měřidlo, nikdy „právě tyto N jmenované soubory/výjimky“ ani opsané číslo bez dotazu; měřitelná nad pracovním stromem před uzavíracím commitem a v prostředí, které E2E má (bez credentialu, který verifikátor nemá). Kritérium nad kódem (výčet, počet, vlastnost kódu) má měřidlo v repu (skript nebo dotaz) a v PRD značku [měřidlo]; měří ho brána nad odevzdávaným stromem, E2E ověřuje jen chování běžící aplikace; měřidlo nad starší revizí smí jen přes git objekty (git show, git grep <rev>), nikdy přes worktree ani instalaci. Měřidlo nebo krok po nasazení, který prochází populaci (stránky, záznamy, soubory), má v PRD odhad doby: počet položek × čas na položku; nad ~10 minut ho předepiš souběžně (pool 8–16) nebo na vzorku s důvodem a velikostí vzorku. Nálezy z minulých řezů a follow-upy nejsou kritéria tohoto řezu, patří do sekce „Pozor na“ nebo mimo rozsah.'

// Cyklus v zavisi_na nebo duplicitní id by stavbu zablokovaly (část v cyklu se nespustí nikdy, dvě části se stejným id píšou
// týž soubor a stavba druhou zahodí; revize 1.4.0). Blok je hlídá po architektovi i po zapracování kostry: při vadě jedno
// zapracování kostry s nálezem; když vada trvá, blok končí ok: false (stavba by na ní jen pálila pokusy). prevezmi(o) převezme
// casti z opravy a vrátí vady, které zůstaly; návrat je důvod selhání, nebo prázdný.
async function hlidejCasti(vady, prevezmi, poAutorech) {
  if (!vady.length) return ''
  log(`tabulka Části: ${vady.join('; ')}; zapracování kostry s nálezem`)
  const o = await runSePredavkou(`${ramec}

Úkol: oprav tabulku Části v kostře PRD řezu ${NN} (${prd.prd_path}): ${vady.join(' | ')}. Každá část má jedinečné id (K1, K2, …) a závislosti zavisi_na bez cyklu; co si části potřebují předat oběma směry, patří do Kontraktu (sdílené typy, schéma, signatury rozhraní), ne do vzájemné závislosti. ${poAutorech ? `PRD částí už existují (docs/prd/rez-${NN}-cast-K.md): počet částí neměň, id měň jen u duplicity (soubor části pak přejmenuj podle nového id); soubory, kritéria a závislosti mezi částmi přesunout smíš.` : 'Autoři částí ještě nepsali: části smíš sloučit, rozdělit a přečíslovat.'} Oprav kostru (tabulku Části, Kontrakt, frontmatter casti) a vrať casti podle opravené tabulky, změněná místa a aktuální mapa_kostry; nic jiného neměň. Edituj dotčená místa (Edit); soubor nepřepisuj celý (Write), přepis ztrácí text.${kostraCteni(false)} Na kód odkazuj souborem a jménem symbolu, nikdy číslem řádku.`,
    { label: `prd-fix:řez ${NN}`, phase: poAutorech ? 'Zapracování' : 'PRD', agentType: 'dev-pipeline:prd', schema: PRD_SCHEMA, model: 'opus', effort: 'high' })
  if (o) { sporyVse.push(...seznam(o.spory)); if (normMapa(o.mapa_kostry)) mapaKostry = normMapa(o.mapa_kostry) }
  if (!o || !Array.isArray(o.casti)) return `tabulka Části: ${vady.join('; ')}; ${o ? 'zapracování kostry nevrátilo casti' : nic(`prd-fix:řez ${NN}`, 'zapracování kostry')}`
  const zbyva = prevezmi(o)
  if (zbyva.length) return `tabulka Části ani po zapracování kostry: ${zbyva.join('; ')}`
  log(`tabulka Části opravena: ${casti.length ? casti.map(c => `${c.id}${c.zavisi_na.length ? ` (závisí na ${c.zavisi_na.join(', ')})` : ''}`).join(', ') : 'malý řez'}`)
  return ''
}

// ---------- 1. PRD ----------
let prd
// Části implementace (§ 1.6); prázdné = malý řez. V režimu zapracování je vrací zapracování kostry.
let casti = []
const sporyVse = []
// Mapa sekcí kostry (řádky „od-do ## Sekce“) od architekta, po změně kostry od toho, kdo ji změnil: čtenáři kostry čtou sekce,
// ne celý soubor. V běhu web-podzim se kostra (35–84 kB) četla 92× celá a 295 výstupů `sed`/`cat` kostry a částí přeteklo limit.
let mapaKostry = ''
function normMapa(v) { return S(v).trim().slice(0, 2400) }
const kostraCteni = jenSvoje => mapaKostry ? ` Mapa sekcí kostry: ${mapaKostry}. Kostru čti po sekcích podle mapy (Read s offset/limit)${jenSvoje ? ', jen sekce, které potřebuješ' : ''}, ne celou; když mapa nesedí, sekce najdi přes grep -n "^## ".` : ''

if (rezim === 'zapracovani') {
  const pu = puvodni || {}
  prd = { prd_path: S(a.prd_path), e2e_path: S(a.e2e_path || `${cwd}/docs/e2e/rez-${NN}.md`), cil: '', kriteria: Number(pu.kriteria) || 0, souhrn: '', spory: [],
    e2e_sekce: pu.e2e_sekce, kontrakt_potreba: pu.kontrakt_potreba, doklad_pred: pu.doklad_pred, doklad_popis: pu.doklad_popis, odhad_radku: pu.odhad_radku }
  casti = normCasti(pu.casti)
  if (casti.length) mapaKostry = normMapa(pu.mapa_kostry)
  log(`blok PRD řez ${NN}: režim zapracování (${nalezyOrch.length} nálezů orchestrátora)${puvodni ? `; výchozí hodnoty z předchozího návratu (${casti.length ? `části ${casti.map(c => c.id).join(', ')}` : 'malý řez'})` : '; bez puvodni: e2e_sekce, kontrakt_potreba a doklad_pred jen z toho, co zapracování vrátí'}`)
} else {
  phase('PRD')
  log(`blok PRD řez ${NN}: ${S(row.nazev || row.name || '')}`)
  // Velký řez: architekt píše kostru (kritéria, Kontrakt, tabulka Části), technický postup částí píšou autoři částí. PRD agent
  // běhu bez-dluhu protočil Ø 433 k (vlastní výstup 125 k, čtení kódu 119 k) a 22 z 25 přes 300 k; malý řez jede jako dřív.
  const prdPrompt = `${ramec}

Úkol: napiš PRD a E2E scénáře řezu ${NN} podle přiděleného řádku plánu. Řez vybral orchestrátor, ty ho nevybíráš ani nerozšiřuješ; rozsah je řádek plánu a body vize v něm. Když realita kódu plán nesnese, napiš odchylku do odchylky_od_planu a PRD piš na to, co jde postavit a ověřit.
Řádek plánu: ${JSON.stringify(row)}
${stavPoMinulem ? `Stav po předchozím řezu (fakt, přečti): ${stavPoMinulem}\n` : ''}${hypotezy.length ? `Hypotézy od orchestrátora k ověření (ne fakta): ${hypotezy.join(' | ')}\n` : ''}${kontraktPrd ? `Řez závisí na řezu ${kontraktRez}, který se právě staví; jeho PRD je kontrakt: ${kontraktPrd}. Rozhraní, symboly a data, které z něj potřebuješ, ber jako dané a v PRD je označ „předpoklad podle PRD řezu ${kontraktRez}“; proti kódu je neověřuj, kód je ještě nemá (stavba tvé PRD před implementací přeměří nad dnešním stromem).\n` : ''}${profil === 'lehky' ? 'Profil řezu je lehký (bez runtime dopadu: měřidlo, otisk, dokumentace, skript): PRD krátké, kritéria dokládaná příkazem nebo souborem, žádné E2E v prohlížeči.\n' : ''}${pravidlaKriterii}
Follow-ups a spory: z ${followUps} a ${spory} čti jen záznamy, které se dotýkají bodů vize, modulů a cest tohoto řezu (grep podle F čísel, jmen modulů a cest z řádku plánu), plus posledních 10 záznamů; celé soubory nečti. Dotčené otevřené follow-ups dej do PRD do sekce „Pozor na“ (past se opravuje v řezu, když je ve změněných souborech; jinak zůstane follow-up).
Doklad před nasazením: když řez nese migraci, která mění, přesouvá nebo maže existující data, nebo je nevratná${appPristup ? ', nebo když pokyny majitele k prostředí žádají doklad před každou migrací' : ''}, napiš do PRD sekci „Doklad před nasazením“ (co přesně se před migrací zachytí: tabulky, počty, vzorky, dotazy jen pro čtení) a vrať doklad_pred: true; u aditivní migrace a u řezu bez migrace doklad nepředepisuj.
E2E scénáře piš v sekcích, které jsou na sobě nezávislé (žádná sekce nezávisí na datech, která jiná sekce vytváří nebo maže); když má řez víc než 12 kritérií, vrať v e2e_sekce každou sekci s počtem kritérií, která ověřuje, aby je blok stavby rozdělil mezi souběžné verifikátory.
Části: odhadni změněné řádky celého řezu včetně testů, fixtur a měřidel (odhad_radku); skutečnost bývá 1,2–2× naivního odhadu, počítej s ní. Řez do ~1,5 k řádků je malý: napiš PRD celé jako dosud a vrať casti: [] (jedna část není rozdělení). Větší řez rozděl na části, každou ~600–1 500 změněných řádků včetně testů, fixtur a měřidel (část pod ~600 řádků nezakládej: přidej ji k části se stejnými soubory nebo do Kontraktu), s vlastními soubory (disjunktními: žádný soubor ve dvou částech, sdílené věci patří do Kontraktu), vlastními kritérii a závislostmi (zavisi_na, bez cyklu), a napiš kostru: frontmatter navíc s casti: K1,K2,…; cíl, rozsah, všechna kritéria s ID (AK1, AK2, …), zákazy, UI plochu, doklad, „Pozor na“, sekci „Nasazení a kroky po něm“, když řez po nasazení něco potřebuje (patří do kostry, ne do části: deploy ji čte jen z kostry); sekci „## Kontrakt“ (sdílené typy, schéma a migrace, signatury rozhraní mezi částmi, registrace tras; kontrakt_potreba: true, když z ní vzniká kód, který musí stát před částmi) a sekci „## Části“ s tabulkou | část | název | soubory a oblasti | kritéria | odhad řádků vč. testů | závisí na | poznámka |. Technický postup, precedent, pasti a mapu symbolů jednotlivých částí do kostry nepiš: napíšou je souběžně autoři částí do docs/prd/rez-${NN}-cast-K.md, každý nad kostrou a kódem své oblasti; kód proto čti jen tolik, kolik potřebuješ na rozdělení a Kontrakt. U řezu s částmi vrať v mapa_kostry mapu sekcí hotové kostry (řádek na sekci „od-do ## Sekce“, z grep -n "^## " a počtu řádků souboru): autoři, kontroly a zapracování podle ní čtou sekce, ne celou kostru. Při odhadu nad ~12 k řádků nebo ~10 částí vrať rozdelit_navrh (jak řez rozdělit na dva podle rizika a závislostí) a PRD přesto napiš.
Na kód odkazuj souborem a jménem symbolu, nikdy číslem řádku.
${appPristup ? `Pokyny majitele k prostředí (přístup, nasazení, doklady): ${appPristup}\n` : ''}Soubory: docs/prd/rez-${NN}-<slug>.md a docs/e2e/rez-${NN}.md (frontmatter a formát podle pravidel běhu a tvé instrukce). Nic jiného needituj. Kontrolu PRD dělá jiný agent.`
  prd = await runSePredavkou(prdPrompt, { label: `prd:řez ${NN}`, phase: 'PRD', agentType: 'dev-pipeline:prd', schema: PRD_SCHEMA, model: 'opus', effort: 'high' })
  if (!prd) return { ok: false, rez: NN, duvod: vycerpane.has(`prd:řez ${NN}`) ? nic(`prd:řez ${NN}`, 'PRD agent') : 'PRD agent nevrátil výsledek ani po opakování', predavky: predavekCelkem }
  sporyVse.push(...seznam(prd.spory))
  const vadyArch = []
  casti = normCasti(prd.casti, vadyArch)
  mapaKostry = casti.length ? normMapa(prd.mapa_kostry) : ''

  if (objekty(prd.casti).length === 1) log('PRD architekt vrátil jednu část: jedna část není rozdělení, řez běží jako malý')
  const odhad = Number(prd.odhad_radku) || '?'
  log(`PRD: ${prd.kriteria} kritérií, ${casti.length ? `části ${casti.map(c => c.id).join(', ')}, odhad ${odhad} ř.${prd.kontrakt_potreba === false ? ', bez kontraktu v kódu' : ''}` : `malý řez (odhad ${odhad} ř.)`}${S(prd.rozdelit_navrh).trim() ? ', návrh rozdělit řez' : ''}${prd.lesen ? ', lešení' : ''}${prd.zapis_do_ziveho ? ', zápis do živého systému' : ''}${prd.doklad_pred ? ', doklad před migrací' : ''}${normSekce(prd.e2e_sekce).length ? `, E2E sekce ${normSekce(prd.e2e_sekce).length}` : ''}${(prd.nove_ui_plochy || []).length ? `, nové UI plochy mimo vizi: ${prd.nove_ui_plochy.join(', ')}` : ''}`)
  // Tabulka Části před autory: cyklus nebo duplicitní id opraví architekt dřív, než autoři napíšou soubory podle vadné tabulky.
  const chybaCasti = await hlidejCasti(vadyCasti(casti, vadyArch), o => {
    const v = []
    casti = normCasti(o.casti, v)
    // Oprava tabulky smí změnit i potřebu kontraktu a odhad (sdílené věci přesunuté do Kontraktu, sloučené části).
    if (typeof o.kontrakt_potreba === 'boolean') prd.kontrakt_potreba = o.kontrakt_potreba
    if (o.odhad_radku != null) prd.odhad_radku = o.odhad_radku
    return vadyCasti(casti, v)
  }, false)
  if (chybaCasti) return { ok: false, rez: NN, duvod: chybaCasti, prd_path: prd.prd_path, predavky: predavekCelkem }
}

// ---------- 2. autoři částí ----------
// Autor části čte z kostry Kontrakt, svůj řádek v Částech, svá kritéria a společné sekce, kód jen ve své oblasti. Kostru needituje:
// co Kontrakt nepokrývá, vrátí v kontrakt_doplnit a zapracuje to zapracování kostry.
let kontraktDoplnit = []
if (casti.length) {
  phase('Autoři částí')
  const castPrompt = c => `${ramec}

Úkol: napiš PRD části ${c.id} (${c.nazev}) řezu ${NN}. Kostru PRD napsal PRD architekt: ${prd.prd_path}; z ní přečti Kontrakt, svůj řádek v tabulce Části, svá kritéria (${c.kriteria.join(', ') || 'podle řádku části'}) a společné sekce (cíl, rozsah, zákazy, „Pozor na“, doklad); sekce a soubory jiných částí nečti.${kostraCteni(true)} Kód čti jen ve své oblasti (${c.soubory.join(', ')}), mimo ni jen Kontrakt a rozhraní, na která část navazuje${c.zavisi_na.length ? ` (závisí na ${c.zavisi_na.join(', ')})` : ''}.
Napiš ${c.prd_path}: technický postup ověřený proti kódu, precedent v kódu (jak týž problém řeší repo a proč se část odchyluje, nebo neodchyluje), pasti, testy k chování (ne k řezu) a mapu souborů a symbolů, které část mění; na kód odkazuj souborem a jménem symbolu, nikdy číslem řádku.${kontraktPrd ? ` Rozhraní z PRD řezu ${kontraktRez} (${kontraktPrd}), který se právě staví, ber jako dané a označ je „předpoklad podle PRD řezu ${kontraktRez}“; proti kódu je neověřuj, kód je ještě nemá.` : ''}
Kostru ani soubory jiných částí needituj: co část potřebuje sdílet a Kontrakt to nepokrývá, vrať v kontrakt_doplnit. Rozsah části nerozšiřuj. Nic jiného needituj. Kontrolu dělá jiný agent.`
  const autori = await parallelOdNejdelsiho(casti, c => c.odhad_radku, c => runSePredavkou(castPrompt(c), { label: `prd-část:řez ${NN}:${c.id}`, phase: 'Autoři částí', agentType: 'dev-pipeline:prd', schema: CAST_SCHEMA, model: 'opus', effort: 'high' }))
  const chybi = casti.filter((c, i) => !autori[i]).map(c => c.id)
  if (chybi.length) return { ok: false, rez: NN, duvod: chybi.map(id => nic(`prd-část:řez ${NN}:${id}`, `autor části ${id}`)).join('; '), prd_path: prd.prd_path, predavky: predavekCelkem }
  casti = casti.map((c, i) => ({ ...c, prd_path: S(autori[i].prd_path).trim() || c.prd_path }))
  autori.forEach(r => sporyVse.push(...seznam(r.spory)))
  kontraktDoplnit = autori.flatMap((r, i) => seznam(r.kontrakt_doplnit).map(x => `${casti[i].id}: ${x}`))
  log(`autoři částí: ${casti.map((c, i) => `${c.id} ${Number(autori[i].kriteria) || 0} krit.`).join(', ')}${kontraktDoplnit.length ? `; Kontrakt doplnit ${kontraktDoplnit.length}×` : ''}`)
}

// ---------- 3. kontrola ----------
// Po dokumentech: kostra (u malého řezu celé PRD jako dřív) a každá část zvlášť, souběžně. Kontrola kostry s částmi nese osy A, C, D, E
// a strukturu Částí; kontrola části osu B nad kódem své oblasti a kritéria části.
const reportCesta = (kolo, c) => `${cwd}/docs/reviews/rez-${NN}-prd-check-${c ? `cast-${c.id}-` : ''}kolo-${kolo}.md`
const vratJen = 'a vrať jen verdikt, počty, osy a identifikátory nálezů (N1, N2, …), nálezy samotné nevracej.'
const predpokladKontrakt = kontraktPrd ? ` Tvrzení označená „předpoklad podle PRD řezu ${kontraktRez}“ ověřuj proti tomu PRD (${kontraktPrd}), ne proti kódu; kód je ještě nemá.` : ''
const vadnaKriteria = 'kritérium tvaru „právě tyto N jmenované soubory/výjimky“ nebo opsané číslo bez dotazu je nález „výčet místo vlastnosti“; kritérium nad kódem bez měřidla v repu a značky [měřidlo] je nález; kritérium závislé na uzavíracím commitu, na credentialu, který E2E prostředí nemá, nebo na nálezu z minulého řezu mimo rozsah tohoto je nález; měřidlo nebo krok po nasazení nad populací (stránky, záznamy, soubory) bez odhadu doby (počet položek × čas na položku), nebo s odhadem nad ~10 minut bez souběhu (pool 8–16) či vzorku s důvodem a velikostí, je nález'
const spolecneK1 = `Doklad před nasazením: PRD ho předepisuje právě tehdy, když migrace mění, přesouvá nebo maže existující data, nebo je nevratná${appPristup ? ', nebo když pokyny majitele žádají doklad před každou migrací' : ''}; chybějící i zbytečný doklad je nález. Sekce E2E scénářů musí být vzájemně nezávislé (žádná nezávisí na datech jiné). Follow-ups a vize-spory čti jen grepem podle bodů vize, modulů a cest řezu, ne celé.${predpokladKontrakt}${appPristup ? ` Pokyny majitele k prostředí: ${appPristup}` : ''}`
const delta = zmenena => `Delta kontrola: prověř VÝHRADNĚ tato změněná místa: ${zmenena.join(' | ')}. Co prošlo kolem 1, znovu nekontroluj. Měřidla změněných kritérií spusť. Zbylé nálezy označ; třetí kolo nebude, půjdou stavbě jako hypotézy.`
const checkPrompt = (kolo, zmenena) => `${ramec}

Úkol: prd-check kolo ${kolo} pro řez ${NN}${casti.length ? ' (kostra PRD s částmi)' : ''}.
PRD: ${prd.prd_path} · E2E: ${prd.e2e_path} · řádek plánu: ${JSON.stringify(row)}${casti.length ? ` · soubory částí: ${casti.map(c => `${c.id} ${c.prd_path}`).join(', ')}` : ''}
Report zapiš do ${reportCesta(kolo)} ${vratJen}
${kolo !== 1 ? delta(zmenena) : !casti.length
    ? `Kontroluj úplnost vůči řádku plánu a bodům vize, technickou validitu proti skutečnému kódu (Serena), kvalitu kritérií, rozsah řezu a to, že PRD nezavádí UI plochu, mantinel ani zápis do živého systému, který vize nejmenuje. Na ose C navíc: každé kritérium s měřidlem (rg, počet, skript, dotaz) SPUSŤ teď nad dnešním stromem a výsledek zapiš do reportu; ${vadnaKriteria}. ${spolecneK1}`
    : `Kostra nese kritéria, Kontrakt a tabulku Části; technický postup částí je v jejich souborech a kontrolují ho souběžně kontroly částí (osa B není tvoje). Kontroluj osy A (úplnost vůči řádku plánu a bodům vize; PRD nezavádí UI plochu, mantinel ani zápis do živého systému, který vize nejmenuje), C (kvalita všech kritérií: ${vadnaKriteria}; měřidla SPUSŤ teď nad dnešním stromem jen u kritérií, která žádná část nemá, kritéria částí změří kontroly částí), D (rozsah řezu) a E (optimalita rozdělení a Kontraktu). Navíc tabulku Části a Kontrakt: žádný soubor ve dvou částech (sdílený soubor patří do Kontraktu), každé kritérium má svou část, Kontrakt pokrývá, co části potřebují sdílet (sdílené typy, schéma a migrace, signatury rozhraní mezi částmi, registrace tras), odhad každé části ~600–1 500 změněných řádků včetně testů, fixtur a měřidel, závislosti bez cyklu. Soubory částí čti jen tam, kde to potřebuješ k úplnosti Kontraktu.${kontraktDoplnit.length ? ` Autoři částí hlásí, co Kontrakt nepokrývá (hypotézy, ověř): ${spojCele(kontraktDoplnit)}.` : ''} ${spolecneK1}`}${casti.length ? kostraCteni(false) : ''}`
const checkCastPrompt = (kolo, c, zmenena) => `${ramec}

Úkol: prd-check kolo ${kolo} části ${c.id} (${c.nazev}) řezu ${NN}.
Kostra PRD: ${prd.prd_path} · PRD části: ${c.prd_path} · soubory a oblasti části: ${c.soubory.join(', ')} · kritéria části: ${c.kriteria.join(', ')}
Report zapiš do ${reportCesta(kolo, c)} ${vratJen}
${kolo !== 1 ? delta(zmenena) : `Z kostry čti Kontrakt, řádek části v tabulce Části, kritéria části a společné sekce; sekce a soubory jiných částí ne. Kontroluj osu B: technickou validitu PRD části proti skutečnému kódu (Serena): jmenované soubory a symboly existují, postup sedí s architekturou a doktrínou CLAUDE.md, precedent v repu a důvod odchylky, pasti; osu C nad kritérii části: každé kritérium s měřidlem (rg, počet, skript, dotaz) SPUSŤ teď nad dnešním stromem a výsledek zapiš do reportu, ${vadnaKriteria}; a soulad s Kontraktem: část mění jen své soubory, sdílené věci bere z Kontraktu a nic sdíleného mimo Kontrakt nezavádí. Kontrakt a tabulku Části posuzuj jen v tom, co tvoje část z Kontraktu používá nebo co jí chybí; obecnou úplnost a strukturu Kontraktu kontroluje kostra. Osy A, D a E nekontroluj, patří kontrole kostry. Nálezy, jejichž oprava patří do kostry (text kritéria, Kontrakt, řádek části v tabulce Části), vrať navíc v nalezy_kostra: část kostru needituje, zapracuje je zapracování kostry.${predpokladKontrakt}`}${kostraCteni(true)}`
const CHECK = { agentType: 'dev-pipeline:prd-check', schema: CHECK_SCHEMA, model: 'opus', effort: 'high' }
const logCheck = (kdo, k) => { if (k) log(`${kdo}: ${k.verdikt}, ${k.nalezu} nálezů, ${k.blokujicich} blokujících`) }
let k1 = null, k2 = null
const k1C = {}, k2C = {}
if (rezim === 'novy') {
  phase('Kontrola')
  // Kostra první (čte nejvíc), pak části od největšího odhadu.
  const [kk, ...kc] = await parallelOdNejdelsiho([null, ...casti], c => c ? c.odhad_radku : 1e12, c => c
    ? runSePredavkou(checkCastPrompt(1, c), { ...CHECK, label: `prd-check:řez ${NN}:část ${c.id}:1`, phase: 'Kontrola' })
    : runSePredavkou(checkPrompt(1), { ...CHECK, label: `prd-check:řez ${NN}:1`, phase: 'Kontrola' }))
  k1 = kk || null
  casti.forEach((c, i) => { k1C[c.id] = kc[i] || null })
  if (!k1) log(`prd-check kolo 1 ${casti.length ? 'kostry ' : ''}nevrátil výsledek, pokračuji bez kontroly`)
  else logCheck(`prd-check 1${casti.length ? ' kostra' : ''}`, k1)
  for (const c of casti) k1C[c.id] ? logCheck(`prd-check 1 část ${c.id}`, k1C[c.id]) : log(`prd-check kolo 1 části ${c.id} nevrátil výsledek, pokračuji bez kontroly části`)
}

// ---------- 4. zapracování ----------
// Nejdřív kostra (její nálezy, nálezy kontrol částí patřící do kostry, požadavky autorů na Kontrakt), potom souběžně části.
let fix = null
const fixC = {}
const blokujiciIds = k => seznam(k && k.nalezy_ids).slice(0, Number(k && k.blokujicich) || 0)
// V běhu web-podzim zavedlo 151 z 239 nálezů delta kontroly samo zapracování: aspoň 23 doslovným převzetím chybného návrhu
// z reportu kola 1, 10 ztrátou textu při přepisu celého souboru.
const navrhHypoteza = 'Návrh v reportu je hypotéza stejně jako nález: nové znění (kritérium, příkaz měřidla, cesta, verze, číslo) ověř spuštěním nebo čtením kódu dřív, než ho zapíšeš. Edituj dotčená místa (Edit); soubor nepřepisuj celý (Write), přepis ztrácí text.'
const doKostry = casti.map(c => ({ c, k: k1C[c.id], ids: seznam(k1C[c.id] && k1C[c.id].nalezy_kostra) })).filter(x => x.k && x.ids.length)
let kostraZmenena = []
const kostraFixNutny = rezim === 'zapracovani' || (k1 && k1.verdikt === 'needs-fixes') || kontraktDoplnit.length > 0 || doKostry.length > 0
if (kostraFixNutny) {
  phase('Zapracování')
  const zdroje = [
    rezim === 'zapracovani' ? `Nálezy orchestrátora (schválení souhrnu PRD): ${spojCele(nalezyOrch)}.` : '',
    k1 && k1.verdikt === 'needs-fixes' ? `Report: ${k1.report_path} (nálezy ${seznam(k1.nalezy_ids).join(', ') || 'všechny'}).` : '',
    doKostry.length ? `Nálezy kontrol částí, jejichž oprava patří do kostry: ${doKostry.map(x => `${x.c.id}: ${x.k.report_path} (${x.ids.join(', ')})`).join(' | ')}.` : '',
    kontraktDoplnit.length ? `Autoři částí hlásí, co Kontrakt nepokrývá a část to potřebuje sdílet (každé ověř, co platí, doplň do Kontraktu): ${spojCele(kontraktDoplnit)}.` : '',
  ].filter(Boolean).join(' ')
  const castiPravidla = rezim === 'zapracovani'
    ? `Má-li PRD části (tabulka Části, soubory docs/prd/rez-${NN}-cast-K.md), smíš upravit i soubory částí, kterých se nález týká; počet a id částí neměň a změněná místa v souboru části uveď s předponou části (K2: …).`
    : casti.length
      ? 'Soubory částí needituj, sjednotí je jejich zapracování. Počet a id částí neměň (nová část by neměla autora ani kontrolu); soubory, kritéria a závislosti mezi částmi přesunout smíš. Změněná místa v Kontraktu a Částech uveď s předponou sekce (Kontrakt: …, Části: …), podle nich se části sjednotí s kostrou.'
      : 'Řez bez částí na části nedělej (části by neměly autora ani kontrolu); casti vrať prázdné.'
  const fixPrompt = `${ramec}

Úkol: zapracuj nálezy do ${casti.length ? 'kostry PRD' : 'PRD'} řezu ${NN}. ${zdroje} PRD: ${prd.prd_path} · E2E: ${prd.e2e_path} · řádek plánu: ${JSON.stringify(row)}
Každý nález je hypotéza: ověř proti kódu a vizi; co míří vedle, nezapracuj a uveď v odmitnute s důvodem. ${navrhHypoteza} Rozsah řezu nerozšiřuj; nález žádající novou plochu, mantinel nebo zápis mimo vizi zapiš do vize-spory a odmítni. ${pravidlaKriterii}
${castiPravidla}${casti.length ? kostraCteni(false) : ''} Na kód odkazuj souborem a jménem symbolu, nikdy číslem řádku. Vrať seznam změněných míst (sekce, kritéria), casti podle tabulky Části (bez částí prázdné)${casti.length ? ', aktuální mapa_kostry' : ''} a aktualizovaný souhrn pro orchestrátora${rezim === 'zapracovani' ? ' včetně cíle, počtu kritérií a všech příznaků (lešení, zápis do živého, runtime dopad, body vize)' : ''}.`
  fix = await runSePredavkou(fixPrompt, { label: `prd-fix:řez ${NN}`, phase: 'Zapracování', agentType: 'dev-pipeline:prd', schema: PRD_SCHEMA, model: 'opus', effort: 'high' })
  if (fix) {
    sporyVse.push(...seznam(fix.spory))
    if (casti.length && normMapa(fix.mapa_kostry)) mapaKostry = normMapa(fix.mapa_kostry)
    if (rezim === 'zapracovani') {
      // S předchozím návratem drží počet a id částí sloucCasti (zadání je měnit nedovoluje); bez něj vrací části zapracování.
      const sPuvodnimi = casti.length > 0
      const prevezmi = o => { const v = []; casti = sPuvodnimi ? sloucCasti(casti, o.casti) : normCasti(o.casti, v); return vadyCasti(casti, v) }
      const chyba = await hlidejCasti(prevezmi(fix), prevezmi, true)
      if (chyba) return { ok: false, rez: NN, duvod: chyba, prd_path: prd.prd_path, predavky: predavekCelkem }
    } else if (casti.length) {
      // Změnilo-li zapracování Kontrakt nebo Části, sjednotí se s kostrou všechny části, ne jen ty s nálezy.
      const pred = JSON.stringify(casti)
      let opravaZmenena = []
      casti = sloucCasti(casti, fix.casti)
      // Zapracování smí přesunout závislosti mezi částmi: cyklus hlídá blok i tady (autoři už psali, id a počet zůstávají).
      const chyba = await hlidejCasti(vadyCasti(casti), o => { opravaZmenena = seznam(o.zmenena_mista); casti = sloucCasti(casti, o.casti); return vadyCasti(casti) }, true)
      if (chyba) return { ok: false, rez: NN, duvod: chyba, prd_path: prd.prd_path, predavky: predavekCelkem }
      kostraZmenena = seznam([...seznam(fix.zmenena_mista), ...opravaZmenena]).filter(x => /kontrakt|části/i.test(x))
      if (!kostraZmenena.length && JSON.stringify(casti) !== pred) kostraZmenena = ['tabulka Části (soubory, kritéria nebo závislosti částí)']
    } else if (objekty(fix.casti).length) log('zapracování vrátilo části u malého řezu: ignoruji, nemají autora ani kontrolu')
  } else {
    log(rezim === 'zapracovani' ? 'zapracování nálezů selhalo, PRD zůstává beze změny' : `zapracování ${casti.length ? 'kostry' : 'nálezů'} selhalo, ${casti.length ? 'kostra zůstává' : 'PRD zůstává'} v podobě po kole 1`)
    if (rezim === 'zapracovani') return { ok: false, rez: NN, duvod: nic(`prd-fix:řez ${NN}`, 'PRD agent v režimu zapracování'), predavky: predavekCelkem }
  }
}
if (rezim === 'novy' && casti.length) {
  const kFix = casti.map(c => {
    const k = k1C[c.id]
    const vadna = Boolean(k && k.verdikt === 'needs-fixes')
    const kostrou = seznam(k && k.nalezy_kostra)
    const vlastni = seznam(k && k.nalezy_ids).filter(id => !kostrou.includes(id))
    // needs-fixes bez identifikátorů: všechny nálezy bere část sama.
    const sNalezy = vadna && (vlastni.length > 0 || !seznam(k.nalezy_ids).length)
    return { c, k, kostrou, vlastni, sNalezy }
  }).filter(x => x.sNalezy || kostraZmenena.length)
  if (kFix.length) {
    if (!kostraFixNutny) phase('Zapracování')
    const fixCastPrompt = ({ c, k, kostrou, vlastni, sNalezy }) => `${ramec}

Úkol: zapracování PRD části ${c.id} (${c.nazev}) řezu ${NN}. ${sNalezy ? `Nálezy kontroly části: report ${k.report_path} (nálezy ${vlastni.join(', ') || 'všechny'}${kostrou.length ? `; ${kostrou.join(', ')} zapracovává kostra, ty přeskoč` : ''}). ` : ''}${kostraZmenena.length ? `Kostra se při zapracování změnila v místech: ${spojCele(kostraZmenena, 6000)}; sjednoť svou část s kostrou (Kontrakt, řádek části v tabulce Části, kritéria části). ` : ''}Kostra PRD: ${prd.prd_path} · PRD části: ${c.prd_path} · soubory a oblasti části: ${c.soubory.join(', ')} · kritéria části: ${c.kriteria.join(', ')}
Z kostry čti Kontrakt, svůj řádek v Částech, svá kritéria a společné sekce; sekce a soubory jiných částí nečti.${kostraCteni(true)} Každý nález je hypotéza: ověř proti kódu a kostře; co míří vedle, nezapracuj a uveď v odmitnute s důvodem. ${navrhHypoteza} Rozsah části nerozšiřuj. Kostru ani soubory jiných částí needituj: co Kontrakt nepokrývá, vrať v kontrakt_doplnit. Na kód odkazuj souborem a jménem symbolu, nikdy číslem řádku. Vrať seznam změněných míst (sekce PRD části) a aktualizovaný souhrn části.`
    const vysl = await parallelOdNejdelsiho(kFix, x => x.vlastni.length || Number(x.k && x.k.nalezu) || 0, x => runSePredavkou(fixCastPrompt(x), { label: `prd-fix:řez ${NN}:část ${x.c.id}`, phase: 'Zapracování', agentType: 'dev-pipeline:prd', schema: CAST_SCHEMA, model: 'opus', effort: 'high' }))
    kFix.forEach((x, i) => {
      const r = vysl[i]
      if (!r) { log(`zapracování části ${x.c.id} selhalo, část zůstává v podobě po kole 1`); return }
      fixC[x.c.id] = r
      sporyVse.push(...seznam(r.spory))
      // Třetí kolo kostry není: požadavek vrátí implementace části v mimo_hranici a provede ho integrace stavby.
      if (seznam(r.kontrakt_doplnit).length) log(`zapracování části ${x.c.id} hlásí, co Kontrakt nepokrývá: ${seznam(r.kontrakt_doplnit).join(' | ').slice(0, 300)} (kostra se už nezapracovává)`)
    })
    log(`zapracování částí: ${kFix.map(x => `${x.c.id} ${fixC[x.c.id] ? `změněná místa ${seznam(fixC[x.c.id].zmenena_mista).length}` : 'selhalo'}`).join(', ')}`)
  }
}

// ---------- 5. delta kontrola ----------
// Delta po dokumentech jen tam, kde kolo 1 mělo aspoň dva blokující nálezy (v režimu zapracování vždy, kolo 1 nebylo; jedním prd-checkem
// nad kostrou i dotčenými soubory částí); u lehkého profilu nikdy. Zbylé nálezy bez delta kontroly jdou stavbě jako hypotézy (report kola 1).
// Běh web-podzim: blokující nález mělo v kole 1 69 ze 74 dokumentů, dokument s jediným dal v deltě 0,33 blokujícího, se dvěma a víc 0,62.
const DELTA_OD = 2
const bezDelty = n => profil === 'lehky' ? 'lehký profil' : n === 1 ? `kolo 1 s jediným blokujícím nálezem, delta od ${DELTA_OD}` : 'kolo 1 bez blokujících nálezů'
const delty = []
if (fix) {
  const blokKostra = (k1 ? Number(k1.blokujicich) || 0 : 0) + doKostry.reduce((s, x) => s + x.ids.filter(id => blokujiciIds(x.k).includes(id)).length, 0)
  if (rezim === 'zapracovani' || (profil !== 'lehky' && blokKostra >= DELTA_OD)) delty.push({ c: null, zmenena: seznam(fix.zmenena_mista) })
  else log(`zapracováno (${seznam(fix.zmenena_mista).length} míst); delta kontrola ${casti.length ? 'kostry ' : ''}se nekoná (${bezDelty(blokKostra)}), zbylé nálezy jdou stavbě jako hypotézy`)
}
for (const c of casti) {
  const f = fixC[c.id], k = k1C[c.id]
  if (!f) continue
  const blok = k ? Number(k.blokujicich) || 0 : 0
  if (profil !== 'lehky' && blok >= DELTA_OD) delty.push({ c, zmenena: seznam(f.zmenena_mista) })
  else log(`část ${c.id} zapracována; delta kontrola se nekoná (${bezDelty(blok)})`)
}
if (delty.length) {
  phase('Delta kontrola')
  // Kostra první, části od největšího počtu nálezů kola 1.
  const vysl = await parallelOdNejdelsiho(delty, d => d.c ? Number(k1C[d.c.id] && k1C[d.c.id].nalezu) || 0 : 1e12, d => d.c
    ? runSePredavkou(checkCastPrompt(2, d.c, d.zmenena.length ? d.zmenena : ['celé PRD části (agent změněná místa neuvedl)']), { ...CHECK, label: `prd-check:řez ${NN}:část ${d.c.id}:2`, phase: 'Delta kontrola' })
    : runSePredavkou(checkPrompt(2, d.zmenena.length ? d.zmenena : ['celé PRD (agent změněná místa neuvedl)']), { ...CHECK, label: `prd-check:řez ${NN}:2`, phase: 'Delta kontrola' }))
  delty.forEach((d, i) => {
    if (d.c) k2C[d.c.id] = vysl[i] || null
    else k2 = vysl[i] || null
    logCheck(`prd-check 2 (delta)${d.c ? ` část ${d.c.id}` : ''}`, vysl[i])
  })
}

// ---------- návrat ----------
const fin = fix || prd
// Dokumenty řezu s posledním kolem kontroly: kostra (u malého řezu celé PRD) a části. Identifikátory nálezů částí nesou předponu části (K1/N3).
// zapr: nálezy dokumentu prošly zapracováním (u části i ty, které za ni zapracovala kostra).
const dokumenty = [{ id: '', k1, k2, fix, zapr: Boolean(fix) },
  ...casti.map(c => ({ id: c.id, k1: k1C[c.id], k2: k2C[c.id], fix: fixC[c.id], zapr: Boolean(fixC[c.id] || (fix && doKostry.some(x => x.c.id === c.id))) }))]
const posl = d => d.k2 || d.k1
const zkontrolovane = dokumenty.filter(posl)
const zbyle = zkontrolovane.filter(d => posl(d).verdikt === 'needs-fixes')
const sId = (d, id) => d.id ? `${d.id}/${id}` : id
const e2eFix = normSekce(fix && fix.e2e_sekce)
const kontraktPotreba = fix && typeof fix.kontrakt_potreba === 'boolean' ? fix.kontrakt_potreba : prd.kontrakt_potreba
return {
  ok: true,
  rez: NN,
  rezim,
  profil,
  oblasti: [...new Set([...(prd.oblasti || []), ...((fix && fix.oblasti) || [])].map(S).map(x => x.trim()).filter(Boolean))],
  doklad_pred: Boolean(fix && fix.doklad_pred != null ? fix.doklad_pred : prd.doklad_pred), doklad_popis: S((fix && fix.doklad_popis) || prd.doklad_popis),
  e2e_sekce: e2eFix.length ? e2eFix : normSekce(prd.e2e_sekce),
  kontrakt_rez: kontraktRez || null,
  prd_path: prd.prd_path,
  e2e_path: prd.e2e_path,
  cil: fin.cil || prd.cil,
  kriteria: fin.kriteria || prd.kriteria,
  souhrn: fin.souhrn,
  lesen: Boolean(fin.lesen), lesen_popis: S(fin.lesen_popis),
  zapis_do_ziveho: Boolean(fin.zapis_do_ziveho), zapis_popis: S(fin.zapis_popis),
  runtime_dopad: fin.runtime_dopad !== false,
  nove_ui_plochy: fin.nove_ui_plochy || [],
  pokryte_body_vize: fin.pokryte_body_vize || prd.pokryte_body_vize || [],
  odchylky_od_planu: S(fin.odchylky_od_planu || prd.odchylky_od_planu),
  spory: sporyVse,
  odmitnute_nalezy: dokumenty.flatMap(d => objekty(d.fix && d.fix.odmitnute).map(o => ({ ...o, id: sId(d, S(o.id)) }))),
  // Části pro blok stavby (§ 1.6): prázdné = malý řez, jedna implementace.
  casti,
  kontrakt_potreba: casti.length > 0 && kontraktPotreba !== false,
  // Mapa sekcí kostry pro režim zapracování (puvodni) a pro čtenáře kostry ve stavbě; u malého řezu prázdná.
  mapa_kostry: casti.length ? mapaKostry : '',
  odhad_radku: Number(fix && fix.odhad_radku != null ? fix.odhad_radku : prd.odhad_radku) || null,
  rozdelit_navrh: S((fix && fix.rozdelit_navrh) || prd.rozdelit_navrh).trim(),
  // Nejhorší verdikt a součty přes poslední kolo každého dokumentu; report = cesty spojené „ + “ (dřív jediná cesta).
  kontrola: zkontrolovane.length ? {
    kola: dokumenty.some(d => d.k2) ? 2 : 1,
    verdikt: zbyle.length ? 'needs-fixes' : 'ready',
    nalezu: zkontrolovane.reduce((s, d) => s + (Number(posl(d).nalezu) || 0), 0),
    blokujicich: zkontrolovane.reduce((s, d) => s + (Number(posl(d).blokujicich) || 0), 0),
    report: zkontrolovane.map(d => posl(d).report_path).join(' + '),
    reporty: zkontrolovane.map(d => posl(d).report_path),
    bez_kontroly: dokumenty.filter(d => !posl(d)).map(d => d.id || (casti.length ? 'kostra' : 'PRD')),
  } : null,
  // Bez delta kontroly jdou stavbě nálezy kola 1 (zapracované, k ověření); s delta kontrolou jen to, co po ní zbylo.
  hypotezy_pro_stavbu: zbyle.length ? {
    report: zbyle.map(d => posl(d).report_path).join(' + '),
    ids: zbyle.flatMap(d => seznam(posl(d).nalezy_ids).map(id => sId(d, id))),
    zapracovano: zbyle.some(d => d.zapr && !d.k2),
  } : null,
  predavky: predavekCelkem,
}
