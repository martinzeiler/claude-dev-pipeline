export const meta = {
  name: 'blok-prd',
  description: 'dev-pipeline blok PRD jednoho řezu: architekt napíše PRD a E2E scénáře (velký řez jako kostru s Kontraktem a Částmi, PRD částí píšou autoři souběžně), kontrola proti kódu a prostředí, zapracování nálezů, delta jen nad blokujícími; režim zapracovani zapracuje nálezy orchestrátora.',
  whenToUse: 'Spouští orchestrátor /dev-pipeline:orchestrate před blokem stavby každého řezu s args {cwd, plugin_root, rez, args_file}; celé args, režim zapracovani a pokračování od_faze autori popisuje KONTRAKT.md pluginu. Bez args nic nedělá.',
  phases: [
    { title: 'PRD', detail: 'PRD architekt píše PRD a E2E scénáře; velký řez rozdělí na části (kostra s Kontraktem a tabulkou Částí), malý řez píše celý' },
    { title: 'Autoři částí', detail: 'jen u řezu s částmi: autor každé části souběžně píše PRD své části ověřené proti kódu své oblasti' },
    { title: 'Kontrola', detail: 'prd-check kolo 1 kostry (u malého řezu celého PRD) a souběžně každé části, plné reporty do souborů' },
    { title: 'Zapracování', detail: 'nejdřív kostra (nálezy, požadavky částí na Kontrakt), pak souběžně části; vrací změněná místa' },
    { title: 'Delta kontrola', detail: 'prd-check jen nad změněnými místy, po dokumentech s aspoň dvěma blokujícími nálezy kola 1; u lehkého profilu a lehkého PRD mini-řezu nikdy' },
    { title: 'Zbylé blokující', detail: 'jen když delta nechá blokující nálezy: jedno zapracování bez další kontroly, přeměří ho refresh ve stavbě' },
  ],
}

// ---------- vstup ----------
let a = args
if (typeof a === 'string') { try { a = JSON.parse(a) } catch { a = null } }
// Args ze souboru (spec 1.6.0 § 1.3): orchestrátor v běhu web-rijen přepsal args bloků ručně 26× (159 k znaků výstupu) a runtime
// je potřetí opsal do notifikace; stavba 8 dostala mapu kostry řezu 7. Skript Workflow soubory číst neumí, proto soubor načte agent.
if (a && typeof a === 'object' && a.args_file) {
  const n = await nactiArgs(a)
  if (!n.ok) { log(`blok-prd: ${n.duvod} – nic se nespustilo`); return { ok: false, rez: n.rez, duvod: n.duvod } }
  a = n.args
}
if (!a || typeof a !== 'object' || !a.cwd || !a.vize || a.rez == null || a.rez === '' || !a.plan_row) {
  log('blok-prd: chybí args (cwd, vize, rez, plan_row) – nic se nespustilo')
  return { ok: false, duvod: 'chybí args: cwd, vize, rez, plan_row' }
}
const S = v => String(v == null ? '' : v)
const NN = String(a.rez).padStart(2, '0')
const cwd = S(a.cwd)
// Pravidla dokumentů běhu (TVAR-DOKUMENTU.md: soubory, frontmatter PRD, vize-spory, společná pravidla agentů). V rámci se
// nejmenují „kontrakt“: architekt a autoři částí pracují se sekcí Kontrakt kostry PRD a dva různé kontrakty v jednom zadání se pletou.
const pravidlaBehu = a.plugin_root ? `${a.plugin_root}/skills/orchestrate/TVAR-DOKUMENTU.md` : null
// Standardy pro review (spec 1.8.0 § 2.14): čte je prd-check, ne PRD agent (ten se řídí jen CLAUDE.md projektu).
const standardy = a.plugin_root ? `Standardy pro review: ${a.plugin_root}/standardy/SLOVNIK-NAVRHU.md a ${a.plugin_root}/standardy/STANDARD-REVIEW.md, plus CODING_STANDARDS.md projektu, když existuje.` : ''
const produkt = a.produkt ? S(a.produkt) : null
const row = a.plan_row
const stavPoMinulem = a.stav_po_minulem ? S(a.stav_po_minulem) : null
const hypotezy = Array.isArray(a.hypotezy) ? a.hypotezy.map(S) : []
const followUps = a.follow_ups ? S(a.follow_ups) : `${cwd}/docs/follow-ups.md`
const spory = `${cwd}/docs/vize-spory.md`
// Pokyny majitele k prostředí (přístup do aplikace, nasazení, doklady): PRD podle nich předepisuje doklad před migrací.
// Celé znění bez useknutí: kontrola PRD prostředí měří; délku hlídá args-bloku.py.
const appPristup = a.app_pristup ? S(a.app_pristup) : ''
// Lehký profil (řádek plánu `profil: lehký`, nebo úsudek orchestrátora u řezu bez runtime dopadu): bez delta kontroly.
const profil = a.profil === 'lehky' ? 'lehky' : 'plny'
// Lehké PRD mini-řezu finální fáze (z validátoru): bez delta kontroly, zbytek jako plný profil (thermo a review stavby zůstávají).
// Mini-řez 11 běhu web-rijen čekal na PRD 49 min na kritické cestě.
const prdLehke = a.prd_lehke === true
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
// Od 1.6.0 nese návrat bloku pole pro stavbu (casti, e2e_sekce, kontrakt_potreba …) v podobjektu stavba: puvodni je celý předchozí
// návrat, pole ze stavba mají přednost; starý tvar (casti nahoře) platí dál.
const pu = puvodni ? { ...puvodni, ...(puvodni.stavba && typeof puvodni.stavba === 'object' ? puvodni.stavba : {}) } : {}
// Pokračování po návrhu rozdělit řez (spec 1.6.0 § 1.8): blok skončil po architektovi, orchestrátor řez nerozdělil a pouští blok
// znovu od autorů částí nad kostrou z disku (cesty a části z puvodni). Rozdělení řezu 10 v běhu web-rijen odmítl, protože by
// zahodilo hotové PRD za $125; stavba pak trvala 309 min na 2 pokusy.
const odFaze = a.od_faze ? S(a.od_faze) : ''
if (odFaze && (odFaze !== 'autori' || rezim === 'zapracovani')) {
  log(`blok-prd: od_faze „${odFaze}“ blok nezná (jen „autori“ mimo režim zapracování) – nic se nespustilo`)
  return { ok: false, rez: NN, duvod: `neznámé od_faze: ${odFaze}` }
}
if (odFaze && !(puvodni && pu.prd_path && Array.isArray(pu.casti) && pu.casti.length)) {
  log('blok-prd: od_faze autori vyžaduje puvodni s prd_path a casti (návrat bloku po architektovi) – nic se nespustilo')
  return { ok: false, rez: NN, duvod: 'od_faze autori vyžaduje puvodni s prd_path a casti' }
}

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
// a předávkou. Nástupce vrací návrat za celé zadání včetně práce předchůdce. Nejvýš 8 předávek, devátá je selhání fáze (strop je
// pojistka proti kroužení, ne měřidlo velikosti).
// Předávka platí jen jako cesta, kterou jmenuje hook (docs/reviews/predavka-<agent_id>.md), a jen nová: v revizi 1.4.0 vyplnil
// agent pole textem „žádná“ a nástupce zopakoval cestu předchůdce; obojí blok bral jako další předávku a po třetí fázi zahodil.
const MAX_PREDAVEK = 8
// Relativní cesta (docs/reviews/predavka-….md) platí také a doplní se o cwd: v běhu web-rijen ji blok stavby odmítl, návrat
// s nedokončenou prací vzal jako konečný a na nehotové části stavěl další (spec 1.6.0 § 1.2).
const PREDAVKA_CESTA = /(^|\/)docs\/reviews\/predavka-[^/\s]+\.md$/
const absPredavka = s => s.startsWith('/') ? s : `${cwd}/${s.replace(/^\.\//, '')}`
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
    const surova = S(r.predavka).trim()
    const soubor = PREDAVKA_CESTA.test(surova) ? absPredavka(surova) : surova
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
// Nejdelší cesta závislostí (součet odhadů architekta po zavisi_na): části na ní stavějí za sebou. V běhu sonnet-5-5 tvořily
// čtyři přerostlé části řezu 03 řetěz K5 → K2 → K4 → K6 a fáze Části trvala 153 min (spec 1.7.0, rozbor-stavba návrh 10).
// Přerostlá je část nad ~800 řádků v odhadu architekta (skutečnost bývá dvojnásobek odhadu; testy 40–55 % změn). Cyklus hlídá cyklusCasti.
// Blok ji po architektovi nechá rozdělit jedním voláním (rozdelPrerostle), než autoři částí začnou psát.
const PREROSTLA = 800
const SKUTECNOST_NASOBEK = 2
const nejdelsiCesta = cs => {
  const memo = new Map()
  const od = (c, videno) => {
    if (memo.has(c.id)) return memo.get(c.id)
    let nej = { cesta: [], soucet: 0 }
    for (const z of c.zavisi_na) {
      const p = cs.find(x => x.id === z)
      if (!p || videno.has(z)) continue
      const r = od(p, new Set([...videno, z]))
      if (r.soucet > nej.soucet) nej = r
    }
    const r = { cesta: [...nej.cesta, c.id], soucet: nej.soucet + (Number(c.odhad_radku) || 0) }
    memo.set(c.id, r)
    return r
  }
  let nej = { cesta: [], soucet: 0 }
  for (const c of cs) { const r = od(c, new Set([c.id])); if (r.soucet > nej.soucet) nej = r }
  return { ...nej, prerostlych: nej.cesta.filter(id => (Number((cs.find(x => x.id === id) || {}).odhad_radku) || 0) > PREROSTLA).length }
}
const cestaText = cs => { const n = nejdelsiCesta(cs); return n.cesta.length ? `${n.cesta.join(' → ')} (součet ~${n.soucet} ř., přerostlých nad ~${PREROSTLA} ř.: ${n.prerostlych})` : '' }
const vadyCasti = (cs, vady = []) => { const cy = cyklusCasti(cs); return [...vady, ...(cy ? [`cyklus v zavisi_na: ${cy.join(' → ')}`] : [])] }
// Zapracování kostry smí přesunout soubory, kritéria a závislosti mezi částmi; počet a id částí drží architekt (nová část by neměla autora ani kontrolu).
const ODEBRANI = /odeb(er|rat|rán)|vyjm|přesu|rozděl|do řezu|vyřaď|vyřad/i
const sloucCasti = (puvodni, nove) => {
  const n = new Map(objekty(nove).map(normCast).map(c => [c.id, c]))
  const cizi = [...n.keys()].filter(id => !puvodni.some(c => c.id === id))
  if (cizi.length) log(`zapracování kostry vrátilo části mimo tabulku architekta (${cizi.join(', ')}): ignoruji, nemají autora ani kontrolu`)
  return puvodni.map(c => n.has(c.id) ? { ...n.get(c.id), nazev: n.get(c.id).nazev || c.nazev, prd_path: c.prd_path } : c)
}
// Sekce E2E s počtem kritérií (§ 1.7), od 1.6.0 i s odhadem minut verifikace a příznakem bez_soubehu (spec 1.6.0 § 1.9): blok stavby
// podle doby skládá souběžné verifikátory (v běhu web-rijen trvala jedna skupina řezu 4 34,5 min, druhá 11,6 min; řez 10 šel
// s 10 kritérii ze 4 oblastí jedním verifikátorem 41 min). Starý tvar (řetězec) přijme také.
const normSekce = v => (Array.isArray(v) ? v : [])
  .map(x => x && typeof x === 'object' ? {
    nazev: S(x.nazev).trim(), kriterii: Math.max(0, Math.round(Number(x.kriterii) || 0)),
    ...(Number(x.doba_min) > 0 ? { doba_min: Math.round(Number(x.doba_min)) } : {}),
    ...(x.bez_soubehu === true ? { bez_soubehu: true } : {}),
    ...(seznam(x.oblasti).length ? { oblasti: seznam(x.oblasti) } : {}),
  } : S(x).trim())
  .filter(x => typeof x === 'string' ? x : x.nazev)
// Rozhodnutí majitele, která mění provoz běhu (spec 1.7.0 § 1.4): orchestrátor je od 1.7.0 zapisuje do docs/.run-args.json, ne do
// hypotéz každé stavby. V běhu sonnet-5-5 dorazilo majitelovo „bez čekání“ jen stavbám a autor scénářů kolečka napsal, že běh spustit nesmí.
const rozhodnutiMajitele = seznam(a.rozhodnuti_majitele)
const ramec = [
  // Hook hlídače kontextu čte číslo řezu z prvního výskytu „Řez NN“ v transkriptu agenta.
  `Řez ${NN}: blok PRD.`,
  `Projekt: ${cwd} (absolutní cesty, git jen na vize větvi).`,
  `Vize: ${a.vize}${produkt ? ` · Produktová severka: ${produkt}` : ''}${pravidlaBehu ? ` · pravidla dokumentů běhu: ${pravidlaBehu}` : ''}.`,
  // Pravidla dokumentů se čtou po sekcích, ne celá (dřív KONTRAKT ~50 kB čtený celý).
  ...(pravidlaBehu ? [`Pravidla dokumentů nečti celá: mapu sekcí dá rg -n '^## ' ${pravidlaBehu}; čti jen sekce PRD a E2E, Vize-spory a Společná pravidla agentů (ta říkají i, jak číst dokumenty běhu po sekcích).`] : []),
  `Vizi nečti celou: přečti Proč, Cíle, Ne-cíle, body vize z řádku plánu, dotčená Povolení a Mantinely a z Provozních poznámek řádek „Čekání na čas“ (grep -n "Čekání na čas" vize)${mapa ? ` (mapa sekcí: ${mapa})` : ' (mapu sekcí dá grep -n "^## " vize)'}; ostatní jen grepem podle potřeby. Kritérium, jehož čekání vize vede jako rozhodnutí majitele s odhadem hodin (řádek „Čekání na čas“), se měří po tom čekání a do cekani nepatří.`,
  ...(rozhodnutiMajitele.length ? [`Rozhodnutí majitele pro tento běh (závazná, mají přednost před vlastním výkladem vize): ${spojCele(rozhodnutiMajitele, 3000)}.`] : []),
  // Konzervativní volba je definovaná v pravidlech dokumentů (spec 1.8.0 § 2.1): menší zásah do kódu a dat, ne menší splnění zadání.
  `Běh je autonomní: uživatele se neptáš. Rozpor nebo chybějící rozhodnutí ve vizi zapiš do docs/vize-spory.md s citací řádku vize (tvar a definice konzervativní volby: ${pravidlaBehu || 'pravidla dokumentů běhu'}, sekce Vize-spory; obsahová, právní a etická rozhodnutí nejsou tvoje: udělej, co vize říká, riziko zapiš jako otázku s návrhem „ponechat“) a pokračuj.`,
  'docs/handoff.md je stav orchestrátora, ne tvůj vstup: nečti ho; co máš vědět, je v tomto zadání.',
  // Monitor v agentovi Workflow nečeká: v běhu web-rijen 0 notifikací za celý běh, verify ho zavolal 308× naprázdno (spec 1.6.0 § 1.10).
  'Tah končí jen strukturovaným návratem. Na proces na pozadí čekáš v tomtéž tahu: spusť ho přes `run_in_background` a kontroluj smyčkou s pevným počtem iterací (`for i in $(seq 1 26); do …; sleep 10; done`). Jedno čekací volání trvá nejvýš 4,5 minuty. Smyčka bez stropu je zakázaná. `Monitor` v agentovi Workflow nečeká (notifikace nedorazí), nepoužívej ho.',
  'Soubor, který pojmenováváš sám, pojmenuj česky podle vzoru rez-NN-<co>.md; Claude Code subagentům blokuje zápis markdownu se jmény summary, findings, analysis a report-….',
  'Tvůj finální výstup je strukturovaný návrat pro orchestrátor (schéma je vynucené), ne zpráva člověku. Do textových polí piš stručně, žádné výpisy souborů ani diffů.',
].join('\n')

// ---------- schémata ----------
const str = d => ({ type: 'string', description: d })
const arr = d => ({ type: 'array', items: { type: 'string' }, description: d })
const predavka = str(`jen absolutní cesta k TVÉ předávce (${cwd}/docs/reviews/predavka-<tvoje agent id>.md), když tě vyzvala zpráva PŘEDÁVKA a práce ještě není hotová; když je zadání hotové, nevyplňuj; cestu předávky předchůdce sem nikdy nevracej`)
const ODMITNUTE = { type: 'array', items: { type: 'object', required: ['id', 'duvod'], properties: { id: { type: 'string' }, duvod: { type: 'string' } } }, description: 'jen při zapracování: nálezy, které jsi po ověření proti kódu nezapracoval, s důvodem' }
const PRD_SCHEMA = {
  type: 'object',
  required: ['prd_path', 'e2e_path', 'cil', 'kriteria', 'souhrn', 'lesen', 'zapis_do_ziveho', 'runtime_dopad', 'odhad_radku', 'casti', 'cekani'],
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
    nove_pojmy: arr('termíny projektu, které PRD zavádí a docs/pojmy.md je nemá (termín: 1 věta); prázdné = žádné'),
    prostredi: { type: 'array', items: { type: 'object', required: ['kriterium', 'duvod'], properties: { kriterium: str('ID a název kritéria'), duvod: str('proč ho běh nezměří: chybí měřicí stanoviště jiné než stroj běhu, cizí služba, síť') } }, description: 'kritéria nad sítí, výkonem nebo cizí službou, která projekt nemá odkud změřit; PRD je vede jako „prostředí“ a orchestrátor se zeptá majitele; prázdné = žádné' },
    zmenena_mista: arr('jen při zapracování nálezů: sekce nebo kritéria PRD/E2E, která se změnila (u kostry místa v Kontraktu a Částech s předponou sekce: „Kontrakt: …“, „Části: …“)'),
    odmitnute: ODMITNUTE,
    casti_odebrane: arr('jen při zapracování nálezů orchestrátora: id částí, které nález výslovně žádá odebrat; jinak prázdné'),
    oblasti: arr('dotčené moduly nebo oblasti kódu (stejný slovník jako návrat stavby: modul, ne soubor); orchestrátor podle nich pozná překryv s uzavřenými řezy'),
    doklad_pred: { type: 'boolean', description: 'true = PRD předepisuje doklad stavu před nasazením (migrace mění, přesouvá nebo maže existující data, nebo je nevratná; kritérium potřebuje jako protějšek stav, který nasazení sdíleného backendu přepíše; populace nad daty, která řez mění, se zmrazí před prvním zápisem; nebo pokyny majitele žádají doklad před každou migrací)' },
    doklad_popis: str('co se před nasazením zachytí (tabulky, počty, vzorky, dotazy, zmrazená populace); prázdné bez dokladu'),
    e2e_sekce: { type: 'array', items: { type: 'object', required: ['nazev', 'kriterii'], properties: { nazev: str('název sekce, jak stojí v nadpisu E2E scénářů'), kriterii: { type: 'integer', description: 'počet kritérií, která sekce ověřuje' }, doba_min: { type: 'integer', description: 'odhad minut verifikace sekce (podle sekce Doba v PRD a kroků scénáře)' }, bez_soubehu: { type: 'boolean', description: 'true = scénář sekci nedovoluje měřit souběžně s jinou sekcí (zátěž produkce, měření výkonu)' }, oblasti: arr('oblasti PRD, kterých se sekce dotýká (stejný slovník jako oblasti řezu); stavba po opravě přeměřuje jen dotčené sekce') } }, description: 'vzájemně nezávislé sekce E2E scénářů s počtem kritérií, odhadem minut verifikace, příznakem bez_soubehu a oblastmi, vždy když scénáře mají aspoň dvě sekce (blok stavby podle nich skládá souběžné verifikátory); jinak prázdné' },
    odhad_radku: { type: 'integer', description: 'odhad změněných řádků celého řezu včetně testů, fixtur a měřidel (přesun a rozdělení souboru dvakrát, data zvlášť)' },
    kontrakt_odhad_radku: { type: 'integer', description: 'jen u řezu s částmi: odhad změněných řádků Kontraktu včetně testů (strop ~800 jako u části)' },
    casti: {
      type: 'array',
      description: 'části implementace podle tabulky Části (každá ~500–800 změněných řádků podle tvého odhadu včetně testů, fixtur a měřidel, s vlastními soubory, kritérii a závislostmi); prázdné = malý řez, PRD celé',
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
    rozdelit_navrh: str('jen když odhad přesahuje ~8 k řádků nebo ~12 částí: jak řez rozdělit na dva podle rizika a závislostí (blok pak skončí po architektovi a rozhodne orchestrátor); jinak prázdné'),
    cekani: { type: 'array', items: { type: 'object', required: ['kriterium', 'potreba', 'odhad_h'], properties: { kriterium: str('ID a název kritéria (AK7 Rozpad útraty podle modelu)'), potreba: str('jaká data vznikající časem kritérium potřebuje a čím by je běh vyrobil, kdyby to Povolení dovolilo'), odhad_h: { type: 'number', description: 'o kolik hodin by se běh prodloužil čekáním na organická data' } } }, description: 'kritéria nad daty vznikajícími časem (provoz, plánované úlohy, den, noc), jejichž výrobu během běhu Povolení vize nepokrývá; PRD je vede se značkou „čeká na rozhodnutí majitele“ a orchestrátor se před stavbou zeptá majitele; prázdné = žádné' },
    kroky_po_nasazeni: { type: 'object', properties: { pocet: { type: 'integer', description: 'počet kroků sekce „Nasazení a kroky po něm“ (0 bez sekce)' }, doba_min: { type: 'integer', description: 'odhad minut všech kroků dohromady' } }, description: 'rozsah kroků po nasazení pro orchestrátora' },
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
    nove_pojmy: arr('termíny projektu, které část zavádí a docs/pojmy.md je nemá; prázdné = žádné'),
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
    odhad_casti: { type: 'integer', description: 'jen kontrola části: tvůj vlastní odhad změněných řádků části včetně testů, fixtur a měřidel (přesun a rozdělení souboru dvakrát, data zvlášť)' },
    regrese: { type: 'integer', description: 'jen delta kolo: počet nálezů, které vznikly až zapracováním (měření, ne verdikt)' },
    overit_prvni: { type: 'array', items: { type: 'object', required: ['id', 'kriterium', 'hypoteza'], properties: { id: str('identifikátor nálezu (N3)'), kriterium: str('ID kritéria (AK5)'), hypoteza: str('co může kritérium shodit a čím to stavba ověří, jednou až dvěma větami') } }, description: 'nejisté nálezy nad kritérii, které jsi spustit nemohl (měřidlo nebo predikát staví až řez): stavba je ověří jako první; mezi blokující je nepočítej' },
    predavka,
  },
}

// Čekání na čas (spec 1.7.0 § 1.1, sdílené pravidlo doslova, platí pro vizi, PRD, kolečko i orchestrátora). Běh sonnet-5-5:
// majitel dovolil spouštět běhy ručně, aby se nečekalo, ale vize jeho pokyn zúžila a kritéria stála na organickém dni a noci:
// pět vadných kritérií řezu 01, plán čekat ~40 h (zrušil ho až zásah majitele) a noční stání 9 h 45 min.
const CEKANI_NA_CAS = 'Čekání na čas (pravidlo v sekci Čekání na čas pravidel dokumentů běhu): kritérium nad daty vznikajícími časem (provoz, plánované úlohy, den, noc) měří běh nad daty, která sám vyrobí podle Povolení vize hned po nasazení; na organický čas čeká jen tam, kde to vize vede jako rozhodnutí majitele s odhadem hodin.'
// Kritéria nad sítí a výkonem (spec 1.8.0 § 2.2, 2.5): model měření a stanoviště jiné než stroj běhu; bez stanoviště je kritérium „prostředí“.
const KRITERIA_SIT = 'Kritérium nad sítí, výkonem stránky nebo cizí službou má v šabloně [měřidlo] povinně N běhů (nejméně 3) střídavě se základem ve stejné chvíli a ze stejného místa, měřicí stanoviště jiné než stroj, na kterém běh běží (CI běžec, API měřicí služby, worker platformy), a toleranci; verdikt je medián kandidáta proti mediánu základu v toleranci. Když projekt stanoviště nemá, kritérium nepiš jako měřitelné: označ ho „prostředí“ a vrať v prostredi (jde majiteli jako otázka). Surové výstupy měřidel (JSON, HAR, snímky) patří do gitignorovaného docs/e2e/rez-NN-vykon/, do dokladu jen souhrn s čísly.'
// Pravidla kritérií, která se opakovaně vyplatila (důkaz: dva opakované pokusy v běhu uklid-po-sklik padly na kritériích psaných jako výčet jmen a opsané číslo).
// Kritérium nad kódem měří brána nad odevzdávaným stromem: pravidlo z 1.2.0 (měřidlo bere revizi parametrem, aby ho E2E spustilo nad nasazenou revizí)
// vedlo v běhu bez-dluhu E2E verifikátory k worktree, instalaci a bráně v nich.
// 1.6.0 (běh web-rijen, všech 6 vadných kritérií ve stavbě vzniklo v bloku PRD): populace dotazem a zmrazená v dokladu (řez 06 to
// udělal sám, plugin to nepředepisoval), protějšek na předchozím nasazení nad sdíleným backendem měřil nový svět (řez 03 AK1),
// rozpor dvou kritérií, absolutní práh bez rezervy a predikát měřidla bez prototypu (mini-řez 11 AK3, AK5, AK6).
const pravidlaKriterii = `Kritéria: vlastnost + kanál deklarované výjimky + měřidlo, nikdy „právě tyto N jmenované soubory/výjimky“ ani opsané číslo bez dotazu; měřitelná nad pracovním stromem před uzavíracím commitem a v prostředí, které E2E má (bez credentialu, který verifikátor nemá). Populaci nad daty, která řez (nebo souběžný řez) mění, urči dotazem (predikát v PRD), spuštěným jednou v dokladu před prvním zápisem a zmrazeným jako seznam identit (ID/slug); kroky i E2E ji berou jen z dokladu a dotaz po zápisu nepřepočítávají; počet z vize je jen kontrola. Kontrolní protějšek na předchozím nasazení smí jen tam, kde rozdíl vzniká v kódu, který to nasazení samo nese; když hodnotu počítá backend nebo data, které řez mění, a předchozí nasazení je čte živě (sdílené API, databáze, keš), ukazuje po nasazení už nový stav: předepiš datový protějšek (dotaz nad dnešními daty, stará logika z git objektů git grep <symbol> <rev>), nebo stav před nasazením v dokladu. Dvě kritéria se nesmí vylučovat a kritérium nestojí na předpokladu, který PRD samo označuje za neověřený; absolutní práh nad stránkami mimo plochu řezu, jehož dnešní rezerva je pod rozptylem měření, se měří A/B proti předchozímu stavu; predikát měřidla, které řez teprve staví, ověř prototypem nad dnešním stavem. Kritérium nad kódem (výčet, počet, vlastnost kódu) má měřidlo v repu (skript nebo dotaz) a v PRD značku [měřidlo]; měří ho brána nad odevzdávaným stromem, E2E ověřuje jen chování běžící aplikace; měřidlo nad starší revizí smí jen přes git objekty (git show, git grep <rev>), nikdy přes worktree ani instalaci. Měřidlo nebo krok po nasazení, který prochází populaci (stránky, záznamy, soubory), má v PRD nebo ve scénáři E2E, na který PRD odkazuje, odhad doby: počet položek × čas na položku; nad ~10 minut ho předepiš souběžně (pool 8–16) nebo na vzorku s důvodem a velikostí vzorku; populace do ~20 položek nebo lokální měřidlo pod minutu je malá a odhad nemá. Nálezy z minulých řezů a follow-upy nejsou kritéria tohoto řezu, patří do sekce „Pozor na“ nebo mimo rozsah. Každé kritérium začíná ID a názvem do 6 slov („**AK7 Rozpad útraty podle modelu.** …“): orchestrátor kritérium uživateli jmenuje názvem, holé ID je pro něj nečitelné. ${KRITERIA_SIT} ${CEKANI_NA_CAS} V PRD to znamená: kritérium nad daty vznikajícími časem má v sekci „Nasazení a kroky po něm“ krok, který data vyrobí podle Povolení (citace Povolení, počet běhů, odhad doby); když Povolení výrobu dat nepokrývá, napiš kritérium se značkou „čeká na rozhodnutí majitele“ a vrať ho v cekani (kritérium s názvem, co by data vyrobilo, odhad hodin čekání). Pojmy kostry ber z docs/pojmy.md, když existuje; nové termíny vrať v nove_pojmy. Standardy pro review (standardy/ pluginu, CODING_STANDARDS.md projektu) nečteš: řídíš se CLAUDE.md projektu.`
// Kroky po nasazení páruje blok stavby mezi nasazeními podle čísla (spec 1.6.0 § 1.1): v běhu web-rijen je deploy přeformuloval
// a párování podle textu shodilo řez 02 na tři pokusy. Podmíněný krok (spec 1.7.0 § 1.6): v běhu sonnet-5-5 vrátil deploy tři
// podmíněné kroky řezu 04 jako vynechano („podmínka nenastala“) a blok to vzal jako selhání nasazení, pokus 2 ze 3.
const krokyCislovane = 'Sekce „Nasazení a kroky po něm“ má kroky jako číslovaný seznam (1., 2., …): číslo kroku je jeho id, podle něj deploy páruje kroky mezi nasazeními; existující kroky nepřečíslovávej, nový krok dostane další číslo. Podmíněný krok (jen když …) formuluj tak, aby obě větve byly jeho provedením: když podmínka nenastala, deploy ho vrátí nevztahuje-se s podmínkou a naměřenou hodnotou; vynechano je jen krok, který provést nejde, a je selhání nasazení.'
// Pole cekani je v PRD_SCHEMA povinné a zapracování ho přebíjí (i prázdné): bez věty by zapracování vrátilo jen svá nová čekání
// a otázka pro majitele z architekta by se ztratila.
const cekaniCele = 'Pole cekani vrať celé: i kritéria, která čekala na rozhodnutí majitele už před zapracováním a zapracování je nevyřešilo.'
// Totéž pro prostredi (review 1.8.0 N10, stejná třída jako dřívější ztráta cekani): prázdné pole od zapracování nepřepíše
// architektovo, pokud změněná místa kritérium nejmenují.
const prostrediCele = 'Pole prostredi vrať celé: i kritéria, která architekt označil „prostředí“ a zapracování je nevyřešilo; kritérium vynech jen tehdy, když ho nález výslovně řeší (dodal stanoviště, nebo kritérium zrušil) a uvedeš ho ve změněných místech.'
// Kroky před nasazením (spec 1.7.0 § 1.2): v běhu sonnet-5-5 pustil deploy dvě základní měření stavu před změnou (2 × 33 min)
// sériově až po bráně, ačkoli na kódu řezu nezávisela a šla pustit hned na začátku stavby.
const krokyPred = `Krok, který má proběhnout před nasazením a nezávisí na kódu řezu (měření stavu před změnou, příprava dat), nepatří deployi (ten ho pustí až po review a bráně): přiděl ho implementaci (malý řez) nebo části (v tabulce Části, přednostně části bez závislostí) s citací Povolení, příkazem, ověřením a výstupem docs/e2e/rez-${NN}-pred.md; implementace ho pustí hned na začátku souběžně se svou prací. V sekci „Nasazení a kroky po něm“ zůstane jen krok „ověř, že docs/e2e/rez-${NN}-pred.md existuje a platí (podmínky z PRD)“.`

// Cyklus v zavisi_na nebo duplicitní id by stavbu zablokovaly (část v cyklu se nespustí nikdy, dvě části se stejným id píšou
// týž soubor a stavba druhou zahodí; revize 1.4.0). Blok je hlídá po architektovi i po zapracování kostry: při vadě jedno
// zapracování kostry s nálezem; když vada trvá, blok končí ok: false (stavba by na ní jen pálila pokusy). prevezmi(o) převezme
// casti z opravy a vrátí vady, které zůstaly; návrat je důvod selhání, nebo prázdný.
async function hlidejCasti(vady, prevezmi, poAutorech) {
  if (!vady.length) return ''
  log(`tabulka Části: ${vady.join('; ')}; zapracování kostry s nálezem`)
  const o = await runSePredavkou(`${ramec}

Úkol: oprav tabulku Části v kostře PRD řezu ${NN} (${prd.prd_path}): ${vady.join(' | ')}. Každá část má jedinečné id (K1, K2, …) a závislosti zavisi_na bez cyklu; co si části potřebují předat oběma směry, patří do Kontraktu (sdílené typy, schéma, signatury rozhraní), ne do vzájemné závislosti. ${poAutorech ? `PRD částí už existují (docs/prd/rez-${NN}-cast-K.md): počet částí neměň, id měň jen u duplicity (soubor části pak přejmenuj podle nového id); soubory, kritéria a závislosti mezi částmi přesunout smíš.` : 'Autoři částí ještě nepsali: části smíš sloučit, rozdělit a přečíslovat.'} Oprav kostru (tabulku Části, Kontrakt, frontmatter casti) a vrať casti podle opravené tabulky a změněná místa; nic jiného neměň. Edituj dotčená místa (Edit); soubor nepřepisuj celý (Write), přepis ztrácí text.${kostraCteni(false)} Na kód odkazuj souborem a jménem symbolu, nikdy číslem řádku.`,
    { label: `prd-fix:řez ${NN}`, phase: poAutorech ? 'Zapracování' : 'PRD', agentType: 'dev-pipeline:prd', schema: PRD_SCHEMA, model: 'opus', effort: 'high' })
  if (o) sporyVse.push(...seznam(o.spory))
  if (!o || !Array.isArray(o.casti)) return `tabulka Části: ${vady.join('; ')}; ${o ? 'zapracování kostry nevrátilo casti' : nic(`prd-fix:řez ${NN}`, 'zapracování kostry')}`
  const zbyva = prevezmi(o)
  if (zbyva.length) return `tabulka Části ani po zapracování kostry: ${zbyva.join('; ')}`
  log(`tabulka Části opravena: ${casti.length ? casti.map(c => `${c.id}${c.zavisi_na.length ? ` (závisí na ${c.zavisi_na.join(', ')})` : ''}`).join(', ') : 'malý řez'}`)
  return ''
}

// ---------- 1. PRD ----------
let prd
// Část nad PREROSTLA řádků odhadu architekta: jedno volání rozdělí přerostlé části na části do ~PREROSTLA ř. s disjunktními soubory
// dřív, než autoři začnou psát; druhé kolo není, část nad stropem i po rozdělení jde dál s logem (a při odhadu nad STROP_CASTI
// stavbě v casti_nad_stropem). Návrat se slučuje s tabulkou architekta (review 1.9.0 N1): část, kterou agent nevrátil, zůstává
// (i přerostlá, s logem), vrácená původní část se přebírá, nová id se připojí; kontrakt_potreba smí rozdělení jen zapnout
// (přesun do Kontraktu), odhady přebírá jen kladné. Nezměněná tabulka nechá architektovu.
async function rozdelPrerostle() {
  const prerostle = casti.filter(c => c.odhad_radku > PREROSTLA)
  if (!prerostle.length) return
  log(`části nad ~${PREROSTLA} ř. odhadu: ${prerostle.map(c => `${c.id} ${c.odhad_radku} ř.`).join(', ')}; jedno rozdělení před autory`)
  const o = await runSePredavkou(`${ramec}

Úkol: rozděl v kostře PRD řezu ${NN} (${prd.prd_path}) části ${prerostle.map(c => `${c.id} (${c.nazev}, ~${c.odhad_radku} ř.)`).join(', ')} na části do ~${PREROSTLA} řádků odhadu včetně testů, fixtur a měřidel (skutečnost bývá ${SKUTECNOST_NASOBEK}× odhad); každá nová část má vlastní id (další volné K<n>), disjunktní soubory (žádný soubor ve dvou částech; sdílené věci do Kontraktu), vlastní kritéria a závislosti bez cyklu. Ostatní části neměň. Oprav tabulku Části, frontmatter casti a Kontrakt, když se do něj něco přesouvá, a vrať celou tabulku casti a změněná místa; nic jiného neměň. Edituj dotčená místa (Edit); soubor nepřepisuj celý (Write), přepis ztrácí text.${kostraCteni(false)} Na kód odkazuj souborem a jménem symbolu, nikdy číslem řádku.`,
    { label: `prd-fix:řez ${NN}:rozdělit-části`, phase: 'PRD', agentType: 'dev-pipeline:prd', schema: PRD_SCHEMA, model: 'opus', effort: 'high' })
  if (!o) { log(`rozdělení částí: ${nic(`prd-fix:řez ${NN}:rozdělit-části`, 'agent')}; tabulka architekta zůstává`); return }
  sporyVse.push(...seznam(o.spory))
  const v = []
  const vracene = objekty(o.casti).length >= 2 ? normCasti(o.casti, v) : objekty(o.casti).map(normCast)
  const mapa = new Map(vracene.map(c => [c.id, c]))
  const sloucene = [...casti.map(c => (mapa.has(c.id) ? { ...mapa.get(c.id), prd_path: c.prd_path } : c)), ...vracene.filter(c => !casti.some(p => p.id === c.id))]
  const otisk = cs => JSON.stringify(cs.map(c => [c.id, c.nazev, c.soubory, c.kriteria, c.odhad_radku, c.zavisi_na]))
  if (otisk(sloucene) === otisk(casti)) { log('rozdělení částí tabulku nezměnilo; tabulka architekta zůstává'); return }
  const nevracene = prerostle.filter(c => !mapa.has(c.id)).map(c => c.id)
  casti = sloucene
  if (o.kontrakt_potreba === true && prd.kontrakt_potreba !== true) { prd.kontrakt_potreba = true; log('rozdělení částí přesunulo sdílené věci do Kontraktu: kontrakt_potreba true') }
  if (Number(o.kontrakt_odhad_radku) > 0) prd.kontrakt_odhad_radku = Number(o.kontrakt_odhad_radku)
  if (Number(o.odhad_radku) > 0) prd.odhad_radku = Number(o.odhad_radku)
  const stale = casti.filter(c => c.odhad_radku > PREROSTLA)
  log(`části po rozdělení: ${casti.map(c => `${c.id} ${c.odhad_radku || '?'} ř.${c.zavisi_na.length ? ` ← ${c.zavisi_na.join(',')}` : ''}`).join(' · ')}${nevracene.length ? `; ${nevracene.join(', ')} agent nevrátil, zůstávají podle architekta` : ''}${stale.length ? `; nad ~${PREROSTLA} ř. zůstávají ${stale.map(c => c.id).join(', ')} (druhé kolo není, jdou dál)` : ''}${v.length ? `; vady: ${v.join('; ')}` : ''}`)
  return v
}
// Části implementace (§ 1.6); prázdné = malý řez. V režimu zapracování je vrací zapracování kostry.
let casti = []
const sporyVse = []
// Nové termíny projektu (spec 1.8.0 § 2.13): sklizeň je připíše do docs/pojmy.md.
const pojmyVse = []
const pridejPojmy = r => { if (r) pojmyVse.push(...seznam(r.nove_pojmy)) }
// Kostru čtou čtenáři po sekcích, ne celou (v běhu web-podzim se kostra 35–84 kB četla 92× celá). Mapu sekcí si od 1.6.0 dělá
// každý čtenář sám jedním rg: mapa předávaná v args se v běhu web-rijen spletla s mapou jiného řezu (stejné nadpisy, jiné řádky)
// a šetřila pod $5 (spec 1.6.0 § 1.3). Čtenář části čte ze sekce kritérií jen svá kritéria podle ID (pokrytí kostry 70 %,
// kritéria jsou 20–30 % kostry).
const reEsc = s => S(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const kostraCteni = (jenSvoje, kriteria = []) => ` Kostru čti po sekcích (Read s offset/limit), ne celou: mapu sekcí si udělej sám (rg -n '^## ' ${prd.prd_path})${jenSvoje ? ' a čti jen sekce, které potřebuješ' : ''}.${kriteria.length ? ` Ze sekce akceptačních kritérií čti jen svá kritéria podle ID (rg -n '\\b(${kriteria.map(reEsc).join('|')})\\b' ${prd.prd_path}).` : ''}`
// Strop velikosti části a Kontraktu (řádky včetně testů, fixtur a měřidel), nad kterým kontrola část vrací stavbě jmenovitě (casti_nad_stropem).
const STROP_CASTI = 1200
// Rozdělení řezu před autory (spec 1.8.0 § 2.11): skutečnost bývá 1,5× odhad architekta; blok to spočítá sám a při překročení
// skončí po architektovi i bez rozdelit_navrh (jedno levné volání jen pro návrh), aby nezaplatil autory, kontroly a zapracování.
const ROZDELIT_RADKU = 8000
const ROZDELIT_CASTI = 12
const ODHAD_NASOBEK = 1.5
const ROZDELIT_SCHEMA = { type: 'object', required: ['rozdelit_navrh'], properties: { rozdelit_navrh: str('jak řez rozdělit na dva podle rizika a závislostí (které části do kterého řezu, co zůstane v Kontraktu)'), predavka } }

// Návrat bloku (spec 1.6.0 § 1.4): runtime useká výsledek v notifikaci na ~8,1 k znaků (v běhu web-rijen 15 z 25 notifikací)
// a orchestrátor ho 20× dočítal z .output. Část pro orchestrátora (souhrn pro schválení, příznaky, počty) drží pod 6 000 znaků;
// seznamy jdou počtem a cestou. Pole pro stavbu nese podobjekt stavba až na konci návratu: scripts/args-bloku.py ho čte ze souboru
// běhu Workflow, takže useknutí notifikace mu nevadí; useknout smí runtime jen tuhle strojovou část. Odmítnuté nálezy zapracování
// jdou jen počtem a identifikátory (důvody zůstávají v návratu agenta zapracování, vidět v /workflows).
const kratce = (v, n) => { const t = S(v).trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t }
// Strop části pro orchestrátora i v nejhorším případě (plan-check 1.6.0): souhrn, deset sporů, odchylky, návrh rozdělení a popisy
// dohromady dávaly až ~7,5 k. Když se celek nevejde pod 5 800 znaků, blok zkracuje texty a seznamy po stupních; celé znění
// zůstává v PRD, vize-spory a reportech. pokryte_body_vize se nekrátí počtem (orchestrátor podle nich kontroluje pokrytí řádku).
const STROP_NAVRATU = 5800
const STUPNE = [
  { souhrn: 1200, cil: 300, popis: 400, odchylky: 600, spory: 10, spor: 240, prehled: 600, rozdelit: 800, polozka: 160, pocet: 40 },
  { souhrn: 900, cil: 200, popis: 250, odchylky: 400, spory: 6, spor: 200, prehled: 400, rozdelit: 500, polozka: 120, pocet: 20 },
  { souhrn: 650, cil: 160, popis: 160, odchylky: 250, spory: 3, spor: 160, prehled: 250, rozdelit: 300, polozka: 80, pocet: 10 },
  { souhrn: 450, cil: 120, popis: 120, odchylky: 160, spory: 0, spor: 0, prehled: 160, rozdelit: 200, polozka: 60, pocet: 5 },
]
const sporyKratce = (xs, L) => {
  const u = [...new Set(seznam(xs).map(x => kratce(x, L.spor)))]
  if (!u.length) return []
  if (!L.spory) return [`${u.length} záznamů v docs/vize-spory.md`]
  return u.length > L.spory ? [...u.slice(0, L.spory), `… a ${u.length - L.spory} dalších v docs/vize-spory.md`] : u
}
const omez = (xs, L, pocet = true) => {
  const u = seznam(xs).map(x => kratce(x, L.polozka))
  return pocet && u.length > L.pocet ? [...u.slice(0, L.pocet), `… a ${u.length - L.pocet} dalších`] : u
}
const navratBloku = args => {
  let out = null
  for (const L of STUPNE) {
    out = navratStupen(args, L)
    const { stavba, ...ridici } = out
    if (JSON.stringify(ridici).length <= STROP_NAVRATU) return out
  }
  log(`návrat bloku pro orchestrátora i po zkrácení nad ${STROP_NAVRATU} znaků; runtime ho v notifikaci může useknout`)
  return out
}
// Prostředí po zapracování (N10): neprázdné pole od zapracování platí; prázdné nebo chybějící nepřepíše architektovo, jen z něj
// vyřadí kritéria, která změněná místa jmenují (nález je výslovně řešil).
const idKriteria = x => (/\b(AK\d+)\b/.exec(S(x && x.kriterium)) || [])[1] || ''
const prostrediPo = fix => {
  const odFixu = objekty(fix && fix.prostredi)
  if (odFixu.length) return odFixu
  const zmenena = seznam(fix && fix.zmenena_mista)
  return objekty(prd.prostredi).filter(x => { const id = idKriteria(x); return !(id && zmenena.some(m => new RegExp(`\\b${reEsc(id)}\\b`).test(m))) })
}
const navratStupen = ({ fin, fix = null, faze = '', kontrola = null, hypotezy = null, odmitnute = [], castiNad = [] }, L) => {
  const e2eFix = normSekce(fix && fix.e2e_sekce)
  const kontraktPotreba = fix && typeof fix.kontrakt_potreba === 'boolean' ? fix.kontrakt_potreba : prd.kontrakt_potreba
  const kontraktOdhad = Number(fix && fix.kontrakt_odhad_radku != null ? fix.kontrakt_odhad_radku : prd.kontrakt_odhad_radku) || null
  const dokladPred = Boolean(fix && fix.doklad_pred != null ? fix.doklad_pred : prd.doklad_pred)
  const oblasti = [...new Set([...seznam(prd.oblasti), ...seznam(fix && fix.oblasti)])]
  const kriteria = fin.kriteria || prd.kriteria
  const runtimeDopad = fin.runtime_dopad !== false
  const sKontraktem = casti.length > 0 && kontraktPotreba !== false
  // Čekání na rozhodnutí majitele (spec 1.7.0 § 1.1) a rozsah kroků po nasazení (§ 1.12): pro orchestrátora, ne pro stavbu.
  // Zapracování, které pole vrátí (i prázdné), přebije architekta. Nad strop počtu zůstane souhrnná položka: celý výčet nese PRD
  // značkou „čeká na rozhodnutí majitele“.
  const cekaniVse = objekty(fix && Array.isArray(fix.cekani) ? fix.cekani : prd.cekani)
    .map(c => ({ kriterium: kratce(c.kriterium, 120), potreba: kratce(c.potreba, L.popis), odhad_h: Number(c.odhad_h) || null }))
  const cekani = cekaniVse.length > L.pocet
    ? [...cekaniVse.slice(0, L.pocet), { kriterium: `… a ${cekaniVse.length - L.pocet} dalších`, potreba: 'v PRD se značkou „čeká na rozhodnutí majitele“', odhad_h: null }]
    : cekaniVse
  const kroky = [fix && fix.kroky_po_nasazeni, prd.kroky_po_nasazeni].find(x => x && typeof x === 'object' && !Array.isArray(x))
  return {
    ok: true,
    rez: NN,
    ...(faze ? { faze } : {}),
    rezim,
    profil,
    ...(prdLehke ? { prd_lehke: true } : {}),
    prd_path: prd.prd_path,
    e2e_path: prd.e2e_path,
    cil: kratce(fin.cil || prd.cil, L.cil),
    kriteria,
    souhrn: kratce(fin.souhrn, L.souhrn),
    lesen: Boolean(fin.lesen), lesen_popis: kratce(fin.lesen_popis, L.popis),
    zapis_do_ziveho: Boolean(fin.zapis_do_ziveho), zapis_popis: kratce(fin.zapis_popis, L.popis),
    runtime_dopad: runtimeDopad,
    nove_ui_plochy: omez(fin.nove_ui_plochy, L),
    pokryte_body_vize: omez(fin.pokryte_body_vize || prd.pokryte_body_vize, L, false),
    odchylky_od_planu: kratce(fin.odchylky_od_planu || prd.odchylky_od_planu, L.odchylky),
    spory: sporyKratce(sporyVse, L),
    oblasti: omez(oblasti, L),
    doklad_pred: dokladPred, doklad_popis: kratce((fix && fix.doklad_popis) || prd.doklad_popis, L.popis),
    kontrakt_rez: kontraktRez || null,
    odhad_radku: Number(fix && fix.odhad_radku != null ? fix.odhad_radku : prd.odhad_radku) || null,
    kontrakt_potreba: sKontraktem,
    // Části jen přehledem (id, odhad, závislosti); celé jsou ve stavba.casti.
    casti_pocet: casti.length,
    casti_prehled: kratce(casti.map(c => `${c.id} ${c.odhad_radku || '?'} ř.${c.zavisi_na.length ? ` ← ${c.zavisi_na.join(',')}` : ''}`).join(' · '), L.prehled),
    casti_nad_stropem: castiNad,
    rozdelit_navrh: kratce((fix && fix.rozdelit_navrh) || prd.rozdelit_navrh, L.rozdelit),
    cekani,
    // Kritéria, která projekt nemá odkud změřit (spec 1.8.0 § 2.2): orchestrátor se zeptá majitele, stavba je nedostane jako měřitelná.
    prostredi: prostrediPo(fix).slice(0, L.pocet).map(x => ({ kriterium: kratce(x.kriterium, 120), duvod: kratce(x.duvod, L.popis) })),
    nove_pojmy: omez([...new Set(pojmyVse)], L),
    kroky_po_nasazeni: kroky ? { pocet: Math.max(0, Math.round(Number(kroky.pocet) || 0)), doba_min: Math.max(0, Math.round(Number(kroky.doba_min) || 0)) } : null,
    kontrola: kontrola ? { ...kontrola, bez_kontroly: omez(kontrola.bez_kontroly, L) } : kontrola,
    odmitnute_nalezy: odmitnute.length,
    odmitnute_ids: omez(odmitnute.map(o => o.id), L),
    predavky: predavekCelkem,
    // Pole pro stavbu: vždy celé a poslední (useknout smí runtime jen tuhle strojovou část, args-bloku.py ji čte ze souboru běhu).
    stavba: {
      rez: NN,
      // Profil jde stavbě odsud: args-bloku.py přenáší jen stavba a lehký řez by jinak dostal thermo a druhé kolo review.
      profil,
      prd_path: prd.prd_path,
      e2e_path: prd.e2e_path,
      kriteria,
      runtime_dopad: runtimeDopad,
      doklad_pred: dokladPred,
      // Části pro blok stavby (§ 1.6 spec 1.4.0): prázdné = malý řez, jedna implementace.
      casti,
      kontrakt_potreba: sKontraktem,
      kontrakt_odhad_radku: casti.length ? kontraktOdhad : null,
      e2e_sekce: e2eFix.length ? e2eFix : normSekce(prd.e2e_sekce),
      hypotezy,
      oblasti,
      casti_nad_stropem: castiNad,
      nove_pojmy: [...new Set(pojmyVse)],
    },
  }
}

if (rezim === 'zapracovani') {
  prd = { prd_path: S(a.prd_path), e2e_path: S(a.e2e_path || `${cwd}/docs/e2e/rez-${NN}.md`), cil: '', kriteria: Number(pu.kriteria) || 0, souhrn: '', spory: [],
    e2e_sekce: pu.e2e_sekce, kontrakt_potreba: pu.kontrakt_potreba, kontrakt_odhad_radku: pu.kontrakt_odhad_radku, doklad_pred: pu.doklad_pred, doklad_popis: pu.doklad_popis, odhad_radku: pu.odhad_radku,
    cekani: pu.cekani, kroky_po_nasazeni: pu.kroky_po_nasazeni }
  casti = normCasti(pu.casti)
  log(`blok PRD řez ${NN}: režim zapracování (${nalezyOrch.length} nálezů orchestrátora)${puvodni ? `; výchozí hodnoty z předchozího návratu (${casti.length ? `části ${casti.map(c => c.id).join(', ')}` : 'malý řez'})` : '; bez puvodni: e2e_sekce, kontrakt_potreba a doklad_pred jen z toho, co zapracování vrátí'}`)
} else if (odFaze === 'autori') {
  // Kostra a scénáře leží na disku z běhu, který skončil po architektovi; pole návratu architekta nese puvodni.
  prd = { prd_path: S(pu.prd_path), e2e_path: S(pu.e2e_path || `${cwd}/docs/e2e/rez-${NN}.md`), cil: S(pu.cil), kriteria: Number(pu.kriteria) || 0, souhrn: S(pu.souhrn), spory: [],
    lesen: pu.lesen, lesen_popis: pu.lesen_popis, zapis_do_ziveho: pu.zapis_do_ziveho, zapis_popis: pu.zapis_popis, runtime_dopad: pu.runtime_dopad,
    nove_ui_plochy: pu.nove_ui_plochy, pokryte_body_vize: pu.pokryte_body_vize, odchylky_od_planu: pu.odchylky_od_planu, oblasti: pu.oblasti,
    e2e_sekce: pu.e2e_sekce, kontrakt_potreba: pu.kontrakt_potreba, kontrakt_odhad_radku: pu.kontrakt_odhad_radku, doklad_pred: pu.doklad_pred, doklad_popis: pu.doklad_popis, odhad_radku: pu.odhad_radku,
    cekani: pu.cekani, kroky_po_nasazeni: pu.kroky_po_nasazeni, rozdelit_navrh: '' }
  const vadyPu = []
  casti = normCasti(pu.casti, vadyPu)
  log(`blok PRD řez ${NN}: pokračování od autorů částí (orchestrátor řez nerozdělil; části ${casti.map(c => c.id).join(', ')})`)
  vadyPu.push(...(await rozdelPrerostle() || []))
  const chybaCasti = await hlidejCasti(vadyCasti(casti, vadyPu), o => {
    const v = []
    casti = normCasti(o.casti, v)
    if (typeof o.kontrakt_potreba === 'boolean') prd.kontrakt_potreba = o.kontrakt_potreba
    if (o.odhad_radku != null) prd.odhad_radku = o.odhad_radku
    return vadyCasti(casti, v)
  }, false)
  if (chybaCasti) return { ok: false, rez: NN, duvod: chybaCasti, prd_path: prd.prd_path, predavky: predavekCelkem }
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
Doklad před nasazením: když řez nese migraci, která mění, přesouvá nebo maže existující data, nebo je nevratná, když kritérium potřebuje jako protějšek stav, který nasazení sdíleného backendu přepíše, nebo když populaci nad daty, která řez mění, je třeba zmrazit před prvním zápisem${appPristup ? ', nebo když pokyny majitele k prostředí žádají doklad před každou migrací' : ''}, napiš do PRD sekci „Doklad před nasazením“ (co přesně se před nasazením zachytí: tabulky, počty, vzorky, zmrazená populace, dotazy jen pro čtení) a vrať doklad_pred: true; u aditivní migrace a u řezu, který nic z toho nepotřebuje, doklad nepředepisuj.
${krokyCislovane} ${krokyPred}
E2E scénáře piš v sekcích, které jsou na sobě nezávislé (žádná sekce nezávisí na datech, která jiná sekce vytváří nebo maže); když scénáře mají aspoň dvě sekce, vrať v e2e_sekce každou sekci s počtem kritérií, která ověřuje, odhadem minut verifikace (doba_min, podle sekce Doba a kroků scénáře), bez_soubehu: true, když ji scénář nedovoluje měřit souběžně s jinou sekcí (zátěž produkce, měření výkonu), a oblasti (oblasti PRD, kterých se sekce dotýká; stavba po opravě přeměřuje jen dotčené sekce); blok stavby podle nich skládá souběžné verifikátory.
Části: odhadni změněné řádky celého řezu včetně testů, fixtur a měřidel (odhad_radku); přesun a rozdělení souboru počítej dvakrát (smazání i přidání), data (JSON, překlady) počítej zvlášť a do velikosti části jen tehdy, když je část píše ručně. Řez do ~2 k řádků je malý: napiš PRD celé jako dosud a vrať casti: [] (jedna část není rozdělení). Větší řez rozděl na části, každou ~500–${PREROSTLA} změněných řádků podle tvého odhadu včetně testů, fixtur a měřidel (skutečnost bývá ${SKUTECNOST_NASOBEK}× tvůj odhad: část nad ~${PREROSTLA} řádků v tvém odhadu rozděl; část pod ~500 řádků nezakládej: přidej ji k části se stejnými soubory nebo do Kontraktu), s vlastními soubory (disjunktními: žádný soubor ve dvou částech, sdílené věci patří do Kontraktu), vlastními kritérii a závislostmi (zavisi_na, bez cyklu), a napiš kostru: frontmatter navíc s casti: K1,K2,…; cíl, rozsah, všechna kritéria s ID (AK1, AK2, …), zákazy, UI plochu, doklad, „Pozor na“, sekci „Nasazení a kroky po něm“, když řez po nasazení něco potřebuje (patří do kostry, ne do části: deploy ji čte jen z kostry); sekci „## Kontrakt“ (sdílené typy, schéma a migrace, signatury rozhraní mezi částmi, registrace tras; kontrakt_potreba: true, když z ní vzniká kód, který musí stát před částmi) a sekci „## Části“ s tabulkou | část | název | soubory a oblasti | kritéria | odhad řádků vč. testů | závisí na | poznámka | a pod ní nejdelší cestou závislostí se součtem odhadů na ní (Nejdelší cesta: K1 → K3 → K4, ~2 800 ř.): části na ní stavějí za sebou, a cesta přes 3 a víc částí nad ~${PREROSTLA} ř. je vada, posuň rozhraní do Kontraktu, ať části jdou souběžně. Kontrakt nese typy, rozhraní, schéma a migrace a sdílené konstanty, chování (logika, validace, skripty) patří částem; odhadni i jeho řádky (kontrakt_odhad_radku), strop ~${PREROSTLA} jako u části: Kontrakt staví jeden agent před všemi částmi. Technický postup, precedent, pasti a mapu symbolů jednotlivých částí do kostry nepiš: napíšou je souběžně autoři částí do docs/prd/rez-${NN}-cast-K.md, každý nad kostrou a kódem své oblasti; kód proto čti jen tolik, kolik potřebuješ na rozdělení a Kontrakt. Postup u řezu s částmi: hned po rozdělení zapiš osnovu kostry (nadpisy, tabulka Části s odhady, Kontrakt, kritéria) dřív, než začneš číst kód částí, teprve pak doplňuj ostatní sekce a E2E scénáře; přílohy vize (docs/vize/<slug>/) čti jen grepem podle bodů řezu. Když 1,5 × součet odhadů částí přesahuje ~${ROZDELIT_RADKU} řádků nebo částí je přes ${ROZDELIT_CASTI}, vrať rozdelit_navrh (jak řez rozdělit na dva podle rizika a závislostí) a kostru přesto napiš: blok skončí po tobě a orchestrátor rozhodne, jestli řez rozdělí, nebo pokračuje autory částí nad tvou kostrou.
Na kód odkazuj souborem a jménem symbolu, nikdy číslem řádku.
${appPristup ? `Pokyny majitele k prostředí (přístup, nasazení, doklady): ${appPristup}\n` : ''}Soubory: docs/prd/rez-${NN}-<slug>.md a docs/e2e/rez-${NN}.md (frontmatter a formát podle pravidel běhu a tvé instrukce). Nic jiného needituj. Kontrolu PRD dělá jiný agent.`
  prd = await runSePredavkou(prdPrompt, { label: `prd:řez ${NN}`, phase: 'PRD', agentType: 'dev-pipeline:prd', schema: PRD_SCHEMA, model: 'opus', effort: 'high' })
  if (!prd) return { ok: false, rez: NN, duvod: vycerpane.has(`prd:řez ${NN}`) ? nic(`prd:řez ${NN}`, 'PRD agent') : 'PRD agent nevrátil výsledek ani po opakování', predavky: predavekCelkem }
  sporyVse.push(...seznam(prd.spory)); pridejPojmy(prd)
  const vadyArch = []
  casti = normCasti(prd.casti, vadyArch)

  if (objekty(prd.casti).length === 1) log('PRD architekt vrátil jednu část: jedna část není rozdělení, řez běží jako malý')
  const odhad = Number(prd.odhad_radku) || '?'
  if (casti.length && Number(prd.kontrakt_odhad_radku) > PREROSTLA) log(`PRD architekt odhaduje Kontrakt na ${prd.kontrakt_odhad_radku} ř. (strop ~${PREROSTLA}): posoudí kontrola kostry`)
  log(`PRD: ${prd.kriteria} kritérií, ${casti.length ? `části ${casti.map(c => c.id).join(', ')}, odhad ${odhad} ř.${prd.kontrakt_potreba === false ? ', bez kontraktu v kódu' : ''}` : `malý řez (odhad ${odhad} ř.)`}${S(prd.rozdelit_navrh).trim() ? ', návrh rozdělit řez' : ''}${prd.lesen ? ', lešení' : ''}${prd.zapis_do_ziveho ? ', zápis do živého systému' : ''}${prd.doklad_pred ? ', doklad před migrací' : ''}${normSekce(prd.e2e_sekce).length ? `, E2E sekce ${normSekce(prd.e2e_sekce).length}` : ''}${(prd.nove_ui_plochy || []).length ? `, nové UI plochy mimo vizi: ${prd.nove_ui_plochy.join(', ')}` : ''}${objekty(prd.cekani).length ? `, čeká na rozhodnutí majitele: ${objekty(prd.cekani).length} kritérií` : ''}`)
  if (casti.length) log(`nejdelší cesta závislostí: ${cestaText(casti) || 'bez závislostí'}`)
  // Návrh rozdělit řez ukončí blok hned po architektovi (spec 1.6.0 § 1.8): orchestrátor rozhodne dřív, než zaplatí autory,
  // kontroly a zapracování (~$110 u řezu 10 běhu web-rijen, rozdělení pak odmítl, aby PRD nezahodil). Při nerozdělení pustí blok
  // znovu s od_faze „autori“ a puvodni = tento návrat; tabulku Části pohlídá až pokračování.
  const odhadCasti = casti.reduce((n, c) => n + (Number(c.odhad_radku) || 0), 0)
  const odhadSkutecnost = Math.round(odhadCasti * ODHAD_NASOBEK)
  const rozdelitNutne = casti.length > 0 && (odhadSkutecnost > ROZDELIT_RADKU || casti.length > ROZDELIT_CASTI)
  if (rozdelitNutne) log(`rozdělení před autory: ${ODHAD_NASOBEK} × odhad částí ${odhadCasti} ř. = ${odhadSkutecnost} ř. (strop ${ROZDELIT_RADKU}), částí ${casti.length} (strop ${ROZDELIT_CASTI})`)
  if (rozdelitNutne && !S(prd.rozdelit_navrh).trim()) {
    const n = await runSePredavkou(`${ramec}

Úkol: navrhni rozdělení řezu ${NN} na dva řezy. Kostru PRD ${prd.prd_path} napsal architekt s částmi ${casti.map(c => `${c.id} (~${c.odhad_radku} ř.${c.zavisi_na.length ? `, závisí na ${c.zavisi_na.join(', ')}` : ''})`).join(', ')}; skutečnost bývá ${ODHAD_NASOBEK}× odhad, takže řez vychází na ~${odhadSkutecnost} řádků (strop ~${ROZDELIT_RADKU}) ${casti.length > ROZDELIT_CASTI ? `a ${casti.length} částí (strop ${ROZDELIT_CASTI})` : ''}. Vrať jen rozdelit_navrh: které části do kterého řezu podle rizika a závislostí a co zůstane v Kontraktu; kostru needituj.${kostraCteni(true)}`,
      { label: `prd-fix:řez ${NN}:rozdělit`, phase: 'PRD', agentType: 'dev-pipeline:prd', schema: ROZDELIT_SCHEMA, model: 'opus', effort: 'high' })
    prd.rozdelit_navrh = S(n && n.rozdelit_navrh).trim() || `blok: ${ODHAD_NASOBEK} × odhad částí = ${odhadSkutecnost} ř. (strop ${ROZDELIT_RADKU}), částí ${casti.length}; architekt návrh rozdělení nevrátil`
  }
  if (S(prd.rozdelit_navrh).trim() && casti.length) {
    log('návrh rozdělit řez: blok končí po architektovi, rozhodne orchestrátor (při nerozdělení pokračuje od_faze „autori“ nad touto kostrou)')
    return navratBloku({ fin: prd, faze: 'architekt', castiNad: casti.filter(c => c.odhad_radku > STROP_CASTI).map(c => ({ id: c.id, odhad: c.odhad_radku })) })
  }
  // Přerostlé části rozdělí jedno volání před autory; tabulku Části (cyklus, duplicitní id) pak opraví architekt dřív, než autoři
  // napíšou soubory podle vadné tabulky.
  vadyArch.push(...(await rozdelPrerostle() || []))
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
// Režim zapracování autory nepouští (spec 1.7.0, rozbor-prd návrh 1a): v běhu sonnet-5-5 stáli autoři obou zapracování $25,8 (67 %),
// dva přepsali PRD části Writem a delta jejich změny nekontrolovala. Části mění zapracování kostry, které to v tom režimu smí.
let kontraktDoplnit = []
if (casti.length && rezim === 'novy') {
  phase('Autoři částí')
  const castPrompt = c => `${ramec}

Úkol: napiš PRD části ${c.id} (${c.nazev}) řezu ${NN}. Kostru PRD napsal PRD architekt: ${prd.prd_path}; z ní přečti Kontrakt, svůj řádek v tabulce Části, svá kritéria (${c.kriteria.join(', ') || 'podle řádku části'}) a společné sekce (cíl, rozsah, zákazy, „Pozor na“, doklad); sekce a soubory jiných částí nečti.${kostraCteni(true, c.kriteria)} Kód čti jen ve své oblasti (${c.soubory.join(', ')}), mimo ni jen Kontrakt a rozhraní, na která část navazuje${c.zavisi_na.length ? ` (závisí na ${c.zavisi_na.join(', ')})` : ''}.
Napiš ${c.prd_path}: technický postup ověřený proti kódu, precedent v kódu (jak týž problém řeší repo a proč se část odchyluje, nebo neodchyluje), pasti, testy k chování (ne k řezu) a mapu souborů a symbolů, které část mění; na kód odkazuj souborem a jménem symbolu, nikdy číslem řádku.${kontraktPrd ? ` Rozhraní z PRD řezu ${kontraktRez} (${kontraktPrd}), který se právě staví, ber jako dané a označ je „předpoklad podle PRD řezu ${kontraktRez}“; proti kódu je neověřuj, kód je ještě nemá.` : ''}
Kostru ani soubory jiných částí needituj: co část potřebuje sdílet a Kontrakt to nepokrývá, vrať v kontrakt_doplnit; nové termíny projektu vrať v nove_pojmy. Rozsah části nerozšiřuj. Nic jiného needituj. Kontrolu dělá jiný agent.`
  const autori = await parallelOdNejdelsiho(casti, c => c.odhad_radku, c => runSePredavkou(castPrompt(c), { label: `prd-část:řez ${NN}:${c.id}`, phase: 'Autoři částí', agentType: 'dev-pipeline:prd', schema: CAST_SCHEMA, model: 'opus', effort: 'high' }))
  const chybi = casti.filter((c, i) => !autori[i]).map(c => c.id)
  if (chybi.length) return { ok: false, rez: NN, duvod: chybi.map(id => nic(`prd-část:řez ${NN}:${id}`, `autor části ${id}`)).join('; '), prd_path: prd.prd_path, predavky: predavekCelkem }
  casti = casti.map((c, i) => ({ ...c, prd_path: S(autori[i].prd_path).trim() || c.prd_path }))
  autori.forEach(r => { sporyVse.push(...seznam(r.spory)); pridejPojmy(r) })
  kontraktDoplnit = autori.flatMap((r, i) => seznam(r.kontrakt_doplnit).map(x => `${casti[i].id}: ${x}`))
  log(`autoři částí: ${casti.map((c, i) => `${c.id} ${Number(autori[i].kriteria) || 0} krit.`).join(', ')}${kontraktDoplnit.length ? `; Kontrakt doplnit ${kontraktDoplnit.length}×` : ''}`)
}

// ---------- 3. kontrola ----------
// Po dokumentech: kostra (u malého řezu celé PRD jako dřív) a každá část zvlášť, souběžně. Kontrola kostry s částmi nese osy A, C, D, E
// a strukturu Částí; kontrola části osu B nad kódem své oblasti a kritéria části.
// Delta v režimu zapracování píše do vlastního reportu: report kola 2 původního běhu nese hypotézy, které režim zapracování převezme
// (spec 1.7.0, rozbor-prd návrh 1), a přepsáním by se ztratily.
const reportCesta = (kolo, c) => `${cwd}/docs/reviews/rez-${NN}-prd-check-${c ? `cast-${c.id}-` : ''}${rezim === 'zapracovani' ? 'zapr-' : ''}kolo-${kolo}.md`
const vratJen = 'a vrať jen verdikt, počty, osy a identifikátory nálezů (N1, N2, …), nálezy samotné nevracej.'
const predpokladKontrakt = kontraktPrd ? ` Tvrzení označená „předpoklad podle PRD řezu ${kontraktRez}“ ověřuj proti tomu PRD (${kontraktPrd}), ne proti kódu; kód je ještě nemá.` : ''
// 1.6.0 (běh web-rijen): protějšek nad sdíleným backendem „potvrdily“ tři kontroly měřením před nasazením (řez 03 AK1); nejistý
// nález nad kritériem přesně předpověděl vadné kritérium mini-řezu 11 (AK6), ale nikdo ho nespustil. Nespustitelný nejistý nález jde
// stavbě v overit_prvni, ne mezi blokující: nafoukl by deltu a zapracování by ho stejně nespustilo (Martin 6. 10.).
const vadnaKriteria = 'kritérium tvaru „právě tyto N jmenované soubory/výjimky“ nebo opsané číslo bez dotazu je nález „výčet místo vlastnosti“; kritérium nad kódem bez měřidla v repu a značky [měřidlo] je nález; kritérium závislé na uzavíracím commitu, na credentialu, který E2E prostředí nemá, nebo na nálezu z minulého řezu mimo rozsah tohoto je nález; měřidlo nebo krok po nasazení nad populací (stránky, záznamy, soubory) bez odhadu doby (počet položek × čas na položku, v PRD nebo ve scénáři E2E, na který PRD odkazuje; populace do ~20 položek nebo lokální měřidlo pod minutu odhad nemá), nebo s odhadem nad ~10 minut bez souběhu (pool 8–16) či vzorku s důvodem a velikostí, je nález; populace zadaná počtem nebo výčtem bez dotazu, nebo dotaz přepočítávaný po krocích, které mění data jeho predikátu, je nález; kontrolní protějšek na předchozím nasazení, jehož hodnotu počítá backend nebo data, které řez mění, je nález „protějšek měří nový svět“ (posuď ho proti přechodnému stavu „starý frontend nad novým backendem“ v sekci Nasazení, ne měřením dnešní produkce); dvě kritéria, která nejde splnit současně, a kritérium stojící na předpokladu, který PRD samo označuje za neověřený, jsou nález; absolutní práh nad stránkami mimo plochu řezu, jehož dnešní rezerva je pod rozptylem měření a který se neměří A/B proti předchozímu stavu, je nález; predikát měřidla, které řez teprve staví, bez ověření prototypem nad dnešním stavem je nález; kritérium nad daty vznikajícími časem bez kroku, který je vyrobí podle Povolení (citace, počet běhů, odhad doby), je nález „neměřitelné v okně E2E“, pokud ho PRD nevede se značkou „čeká na rozhodnutí majitele“ (a v cekani) a pokud jeho čekání nevede vize jako rozhodnutí majitele s odhadem hodin (Provozní poznámky, řádek „Čekání na čas“; takové kritérium se měří po čekání a nález není; ' + CEKANI_NA_CAS + '); kritérium nad sítí, výkonem stránky nebo cizí službou bez N běhů střídavě se základem, bez stanoviště jiného než stroj běhu nebo bez tolerance je BLOKUJE, a kritérium, které má měřit z tohoto stroje proti produkci, má být vedené jako „prostředí“ (otázka pro majitele), ne jako měřitelné; kritérium, krok nebo scénář, který zapisuje do živého systému bez doslova citovaného Povolení, je BLOKUJE. Nejistý nález nad kritériem spusť; když to nejde (měřidlo nebo predikát staví až řez), vrať ho v overit_prvni s kritériem a hypotézou (stavba ho ověří jako první) a mezi blokující ho nepočítej'
const spolecneK1 = `Spor nebo předpoklad (Odchylky, Rizika, záznam vize-spory, který PRD jmenuje) bez citace řádku vize, podle kterého autor jel, je BLOKUJE: nález řekne, co má autor ve vizi najít. doklad_pred: true bez sekce „Doklad před nasazením“ s dotazy je BLOKUJE. Doklad před nasazením: PRD ho předepisuje právě tehdy, když migrace mění, přesouvá nebo maže existující data, nebo je nevratná, když kritérium potřebuje jako protějšek stav, který nasazení sdíleného backendu přepíše, nebo když populaci nad daty, která řez mění, je třeba zmrazit před prvním zápisem${appPristup ? ', nebo když pokyny majitele žádají doklad před každou migrací' : ''}; chybějící i zbytečný doklad je nález. Kroky sekce „Nasazení a kroky po něm“ jsou číslovaný seznam (číslo kroku je jeho id, podle něj deploy páruje kroky mezi nasazeními); nečíslovaný krok je nález; podmíněný krok bez větve „nevztahuje se“ (co deploy vrátí, když podmínka nenastala) je nález; krok před nasazením nezávislý na kódu řezu (měření stavu před změnou, příprava dat), který PRD dává deployi místo implementaci nebo části, je nález. Sekce E2E scénářů musí být vzájemně nezávislé (žádná nezávisí na datech jiné) a každá nese počet kritérií, odhad minut, bez_soubehu a oblasti. Follow-ups a vize-spory čti jen grepem podle bodů vize, modulů a cest řezu, ne celé.${predpokladKontrakt}${appPristup ? ` Pokyny majitele k prostředí: ${appPristup}` : ''}${standardy ? ` ${standardy}` : ''}`
// Kolo 1 jen proti kódu a prostředí (spec 1.8.0 § 2.11, experiment): osy úplnosti, rozsahu a optimality patří refreshi ve stavbě;
// návrat jen BLOKUJE a OVĚŘIT PRVNÍ; u blokujícího nálezu navržené znění, které zapracování aplikuje.
const vystupK1 = 'Osy úplnosti vůči vizi, rozsahu a optimality v kole 1 nekontroluj (patří refreshi ve stavbě). Vracíš jen BLOKUJE a OVĚŘIT PRVNÍ; formulační a stylové nálezy nepiš ani do reportu. U každého BLOKUJE napiš do reportu navržené znění (text, který má v PRD stát, ne popis změny); do hlavičky reportu počet nálezů podle osy.'
// Návrh ověřuje ten, kdo ho píše (spec 1.7.0, rozbor-prd návrh 3): v běhu sonnet-5-5 bylo 6 z 8 blokujících regresí zapracování
// převzatým návrhem kontroly, který kontrola sama nespustila (r04 K3 N1, N2; „další pokus řezu“ jako krok nasazení; AK36).
const navrhKontroly = 'Návrh, který mění znění kritéria, příkaz měřidla, regex, predikát, rozhraní nebo zavádí krok, pokus či větev, spusť nad dnešním stromem (predikát nad každým typem dat, kterého se týká) a výsledek uveď u návrhu; mechanismus běhu (pokus, krok nasazení, pořadí E2E) ověř proti pravidlům běhu. Nespuštěný návrh označ „návrh neověřen: <proč>“: zapracování ho převezme doslova.'
// V režimu zapracování mění zapracování kostry i soubory částí (předpona „K2: …“); delta je musí hledat tam (rozbor-prd návrh 11).
const deltaCasti = () => rezim === 'zapracovani' && casti.length ? ` Místa s předponou části (K2: …) leží v souboru té části (${casti.map(c => `${c.id} ${c.prd_path}`).join(', ')}): prověř je tam.` : ''
// Delta jen nad blokujícími (spec 1.8.0 § 2.11): změněná místa, která řeší blokující nálezy kola 1; nález vzniklý zapracováním je regrese (měří se).
// V režimu zapracování kolo 1 neproběhlo: změny řeší nálezy orchestrátora ze zadání (včetně odebrání části), ne blokující nálezy kola 1 (N12).
const delta = (zmenena, blok = []) => `Delta kontrola: prověř VÝHRADNĚ změněná místa, která řeší ${rezim === 'zapracovani' ? `nálezy orchestrátora ze zadání zapracování (včetně odebrání části; nálezy: ${spojCele(nalezyOrch, 3000)})` : `blokující nálezy kola 1${blok.length ? ` (${blok.join(', ')})` : ''}`}: ${zmenena.join(' | ')}; ostatní změny${rezim === 'zapracovani' ? '' : ' a co prošlo kolem 1'} znovu nekontroluj.${deltaCasti()} Měřidla změněných kritérií spusť; místo se značkou „neověřeno“ (návrh, který zapracování nespustilo) ber jako hypotézu a spusť, co jde. Nález, který vznikl až zapracováním, počítej jako regresi a jejich počet vrať v regrese. ${vystupK1} Zbylé nálezy označ; třetí kolo kontroly nebude: blokující zapracuje blok ještě jednou bez kontroly a stavba je přeměří, ostatní půjdou stavbě jako hypotézy.`
const checkPrompt = (kolo, zmenena, blok) => `${ramec}

Úkol: prd-check kolo ${kolo} pro řez ${NN}${casti.length ? ' (kostra PRD s částmi)' : ''}.
PRD: ${prd.prd_path} · E2E: ${prd.e2e_path} · řádek plánu: ${JSON.stringify(row)}${casti.length ? ` · soubory částí: ${casti.map(c => `${c.id} ${c.prd_path}`).join(', ')}` : ''}
Report zapiš do ${reportCesta(kolo)} ${vratJen} ${navrhKontroly}
${kolo !== 1 ? delta(zmenena, blok) : !casti.length
    ? `Kolo 1 kontroluje jen to, co jde ověřit proti kódu a prostředí: osa B technická validita proti skutečnému kódu (Serena: symboly, trasy, schéma existují, postup sedí s architekturou a doktrínou CLAUDE.md, precedent v repu) a osa C měřitelnost a splnitelnost kritérií: každé kritérium s měřidlem (rg, počet, skript, dotaz) SPUSŤ teď nad dnešním stromem a výsledek zapiš do reportu; ${vadnaKriteria}. ${vystupK1} ${spolecneK1}`
    : `Kostra nese kritéria, Kontrakt a tabulku Části; technický postup částí je v jejich souborech a kontrolují ho souběžně kontroly částí (osa B není tvoje). Kolo 1 kontroluje jen to, co jde ověřit proti kódu a prostředí: osu C (měřitelnost a splnitelnost všech kritérií: ${vadnaKriteria}; měřidla SPUSŤ teď nad dnešním stromem jen u kritérií, která žádná část nemá, kritéria částí změří kontroly částí) a dělení částí: tabulku Části a Kontrakt, žádný soubor ve dvou částech (sdílený soubor patří do Kontraktu), každé kritérium má svou část, Kontrakt pokrývá, co části potřebují sdílet (sdílené typy, schéma a migrace, signatury rozhraní mezi částmi, registrace tras), odhad každé části ~500–${PREROSTLA} změněných řádků včetně testů, fixtur a měřidel v odhadu architekta (část nad ~${PREROSTLA} je nález „rozděl část“: skutečnost bývá ${SKUTECNOST_NASOBEK}× odhad), závislosti bez cyklu; nejdelší cesta závislostí podle tabulky je ${cestaText(casti) || 'bez závislostí'}: cesta přes 3 a víc částí nad ~${PREROSTLA} ř. v odhadu architekta je nález „posuň rozhraní do Kontraktu“ (části na ní stavějí za sebou); Kontrakt nese typy, rozhraní, schéma a sdílené konstanty do ~${PREROSTLA} řádků (odhad architekta ${Number(prd.kontrakt_odhad_radku) || 'chybí'}), přerostlý Kontrakt nebo Kontrakt s chováním (logika, validace, skripty), které patří částem, je nález. Soubory částí čti jen tam, kde to potřebuješ k úplnosti Kontraktu.${kontraktDoplnit.length ? ` Autoři částí hlásí, co Kontrakt nepokrývá (hypotézy, ověř): ${spojCele(kontraktDoplnit)}.` : ''} ${vystupK1} ${spolecneK1}`}${casti.length ? kostraCteni(false) : ''}`
const checkCastPrompt = (kolo, c, zmenena, blok) => `${ramec}

Úkol: prd-check kolo ${kolo} části ${c.id} (${c.nazev}) řezu ${NN}.
Kostra PRD: ${prd.prd_path} · PRD části: ${c.prd_path} · soubory a oblasti části: ${c.soubory.join(', ')} · kritéria části: ${c.kriteria.join(', ')}
Report zapiš do ${reportCesta(kolo, c)} ${vratJen} ${navrhKontroly}
${kolo !== 1 ? delta(zmenena, blok) : `Z kostry čti Kontrakt, řádek části v tabulce Části, kritéria části a společné sekce; sekce a soubory jiných částí ne. Kontroluj osu B: technickou validitu PRD části proti skutečnému kódu (Serena): jmenované soubory a symboly existují, postup sedí s architekturou a doktrínou CLAUDE.md, precedent v repu a důvod odchylky, pasti; osu C nad kritérii části: každé kritérium s měřidlem (rg, počet, skript, dotaz) SPUSŤ teď nad dnešním stromem a výsledek zapiš do reportu, ${vadnaKriteria}; a soulad s Kontraktem: část mění jen své soubory, sdílené věci bere z Kontraktu a nic sdíleného mimo Kontrakt nezavádí. Kontrakt a tabulku Části posuzuj jen v tom, co tvoje část z Kontraktu používá nebo co jí chybí; obecnou úplnost a strukturu Kontraktu kontroluje kostra. Osy úplnosti, rozsahu a optimality nekontroluj (patří refreshi ve stavbě). ${vystupK1}${standardy ? ` ${standardy}` : ''} Nálezy, jejichž oprava patří do kostry (text kritéria, Kontrakt, řádek části v tabulce Části), vrať navíc v nalezy_kostra: část kostru needituje, zapracuje je zapracování kostry. Odhadni sám změněné řádky části včetně testů, fixtur a měřidel (přesun a rozdělení souboru dvakrát, data zvlášť) a vrať je v odhad_casti: část nad ~${STROP_CASTI} řádků jde stavbě i při verdiktu ready.${predpokladKontrakt}`}${kostraCteni(true, c.kriteria)}`
const CHECK = { agentType: 'dev-pipeline:prd-check', schema: CHECK_SCHEMA, model: 'opus', effort: 'high' }
const logCheck = (kdo, k) => { if (k) log(`${kdo}: ${k.verdikt}, ${k.nalezu} nálezů, ${k.blokujicich} blokujících${Number(k.regrese) > 0 ? `, regresí ${k.regrese}` : ''}`) }
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
// Běh web-rijen: 92 ze 128 nálezů delty (72 %) zavedlo samo zapracování (64 nový text, 28 převzatý návrh, z toho 20 nespuštěných);
// 3 ze 6 vadných kritérií ve stavbě vznikla převzetím návrhu. Přepis Write zmizel, ale 217 přepisů sekcí skriptem v Bashi zůstalo.
// Návrh, který spustit nejde, se zapíše se značkou a delta ho dostane jako hypotézu (Martin 6. 10.: zákaz zápisu by nález ztratil).
const navrhHypoteza = 'U blokujícího nálezu aplikuj navržené znění z reportu a ověř ho proti kódu. Oprav nejmenší změnou, která nález řeší. Nové pravidlo, rozhraní, kritérium ani krok, který report nenavrhuje, nezaváděj; když oprava jinak nejde, uveď ho ve změněných místech se značkou „nové“. Návrh v reportu je hypotéza stejně jako nález: převzaté znění (kritérium, příkaz měřidla, regex, formát, rozhraní, cesta, číslo) spusť nad dnešním stromem nebo ověř čtením kódu dřív, než ho zapíšeš, a výsledek uveď ve změněných místech; návrh, který spustit nejde, zapiš se značkou „neověřeno: <proč>“ ve změněných místech (delta kontrola ho dostane jako hypotézu). Edituj dotčená místa (Edit); soubor nepřepisuj celý (Write) a sekci nepřepisuj skriptem celou (python open(…, \'w\')), přepis ztrácí text.'
const doKostry = casti.map(c => ({ c, k: k1C[c.id], ids: seznam(k1C[c.id] && k1C[c.id].nalezy_kostra) })).filter(x => x.k && x.ids.length)
let kostraZmenena = []
// doklad_pred: true bez popisu dokladu (spec 1.8.0 § 2.11, návrh 16): blok to bere jako nález k zapracování, stavba by na dokladu bez sekce spálila pokus.
const dokladBezSekce = rezim === 'novy' && prd.doklad_pred === true && !S(prd.doklad_popis).trim()
if (dokladBezSekce) log('PRD vrací doklad_pred: true bez popisu dokladu; zapracování kostry s nálezem')
const kostraFixNutny = rezim === 'zapracovani' || (k1 && k1.verdikt === 'needs-fixes') || kontraktDoplnit.length > 0 || doKostry.length > 0 || dokladBezSekce
if (kostraFixNutny) {
  phase('Zapracování')
  const zdroje = [
    rezim === 'zapracovani' ? `Nálezy orchestrátora (schválení souhrnu PRD): ${spojCele(nalezyOrch)}.` : '',
    dokladBezSekce ? 'Nález bloku: PRD vrací doklad_pred: true, ale nemá sekci „Doklad před nasazením“ s dotazy (vráceno bez doklad_popis); doplň ji (co se před nasazením zachytí: tabulky, počty, vzorky, dotazy jen pro čtení) a vrať doklad_popis, nebo vrať doklad_pred: false s důvodem.' : '',
    k1 && k1.verdikt === 'needs-fixes' ? `Report: ${k1.report_path} (nálezy ${seznam(k1.nalezy_ids).join(', ') || 'všechny'}).` : '',
    doKostry.length ? `Nálezy kontrol částí, jejichž oprava patří do kostry: ${doKostry.map(x => `${x.c.id}: ${x.k.report_path} (${x.ids.join(', ')})`).join(' | ')}.` : '',
    kontraktDoplnit.length ? `Autoři částí hlásí, co Kontrakt nepokrývá a část to potřebuje sdílet (každé ověř, co platí, doplň do Kontraktu): ${spojCele(kontraktDoplnit)}.` : '',
  ].filter(Boolean).join(' ')
  const castiPravidla = rezim === 'zapracovani'
    ? `Má-li PRD části (tabulka Části, soubory docs/prd/rez-${NN}-cast-K.md), smíš upravit i soubory částí, kterých se nález týká; změněná místa v souboru části uveď s předponou části (K2: …). Část odeber (vrať její id v casti_odebrane a vyjmi ji z tabulky) jen tehdy, když to nález orchestrátora výslovně žádá; jinak počet a id částí neměň. Když po odebrání zbývá jediná část, řez je bez částí: technický postup té části přenes do kostry, tabulku Části a sekci Kontrakt zruš, frontmatter casti vyprázdni, vrať casti prázdné a odhad_radku celého řezu přepočítej.`
    : casti.length
      ? 'Soubory částí needituj, sjednotí je jejich zapracování. Počet a id částí neměň (nová část by neměla autora ani kontrolu); soubory, kritéria a závislosti mezi částmi přesunout smíš. Změněná místa v Kontraktu a Částech uveď s předponou sekce (Kontrakt: …, Části: …), podle nich se části sjednotí s kostrou.'
      : 'Řez bez částí na části nedělej (části by neměly autora ani kontrolu); casti vrať prázdné.'
  const fixPrompt = `${ramec}

Úkol: zapracuj nálezy do ${casti.length ? 'kostry PRD' : 'PRD'} řezu ${NN}. ${zdroje} PRD: ${prd.prd_path} · E2E: ${prd.e2e_path} · řádek plánu: ${JSON.stringify(row)}
Každý nález je hypotéza: ověř proti kódu a vizi; co míří vedle, nezapracuj a uveď v odmitnute s důvodem. ${navrhHypoteza} Rozsah řezu nerozšiřuj; nález žádající novou plochu, mantinel nebo zápis mimo vizi zapiš do vize-spory a odmítni. ${pravidlaKriterii}
${castiPravidla}${casti.length ? kostraCteni(false) : ''} ${krokyCislovane} ${krokyPred} Na kód odkazuj souborem a jménem symbolu, nikdy číslem řádku. Vrať seznam změněných míst (sekce, kritéria), casti podle tabulky Části (bez částí prázdné) a aktualizovaný souhrn pro orchestrátora${rezim === 'zapracovani' ? ' včetně cíle, počtu kritérií a všech příznaků (lešení, zápis do živého, runtime dopad, body vize)' : ''}. ${cekaniCele} ${prostrediCele}`
  fix = await runSePredavkou(fixPrompt, { label: `prd-fix:řez ${NN}`, phase: 'Zapracování', agentType: 'dev-pipeline:prd', schema: PRD_SCHEMA, model: 'opus', effort: 'high' })
  if (fix) {
    sporyVse.push(...seznam(fix.spory)); pridejPojmy(fix)
    if (rezim === 'zapracovani') {
      // Odebrání části: jen id, která zapracování vrátí v casti_odebrane, a každé jen když ho nějaký nález orchestrátora jmenuje
      // spolu se slovem odebrání (odebrat, vyjmout, přesunout, rozdělit, „do řezu“, vyřadit). Odebrání bez takového nálezu je ok: false
      // (orchestrátor rozhodne), ne tichá stavba částí, které zapracování už z tabulky vyňalo.
      const odebrane = seznam(fix.casti_odebrane).map(normId).filter(id => casti.some(c => c.id === id))
      const jmenuje = (n, id) => new RegExp(`(?<![\\p{L}\\p{N}])${reEsc(id)}(?![\\p{L}\\p{N}])`, 'u').test(n)
      const bezNalezu = odebrane.filter(id => !nalezyOrch.some(n => ODEBRANI.test(n) && jmenuje(n, id)))
      if (bezNalezu.length) {
        log(`zapracování odebralo části ${bezNalezu.join(', ')}, které žádný nález orchestrátora nežádá odebrat; blok končí, rozhodne orchestrátor`)
        return { ok: false, rez: NN, duvod: `zapracování odebralo části ${bezNalezu.join(', ')}, které žádný nález nežádá (nálezy: ${spojCele(nalezyOrch, 600)})`, prd_path: prd.prd_path, casti_odebrane: bezNalezu, predavky: predavekCelkem }
      }
      if (odebrane.length) {
        const odebranyOdhad = casti.filter(c => odebrane.includes(c.id)).reduce((n, c) => n + (Number(c.odhad_radku) || 0), 0)
        casti = casti.filter(c => !odebrane.includes(c.id))
        log(`části odebrané na žádost nálezu orchestrátora: ${odebrane.join(', ')}; zbývají ${casti.map(c => c.id).join(', ') || 'žádné (malý řez)'}`)
        // Jediná zbylá část není rozdělení (N11, jako normCasti): řez jde stavbě bez částí, bez kontraktu a integrace.
        if (casti.length === 1) { log(`zbývá jediná část ${casti[0].id}: řez je bez částí, stavba ho staví jednou implementací`); casti = [] }
        // Odhad řádků bez odebraných částí, když ho zapracování samo nepřepočítalo.
        if (fix.odhad_radku == null && Number(prd.odhad_radku) > 0) prd.odhad_radku = Math.max(0, Number(prd.odhad_radku) - odebranyOdhad)
      }
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
Z kostry čti Kontrakt, svůj řádek v Částech, svá kritéria a společné sekce; sekce a soubory jiných částí nečti.${kostraCteni(true, c.kriteria)} Každý nález je hypotéza: ověř proti kódu a kostře; co míří vedle, nezapracuj a uveď v odmitnute s důvodem. ${navrhHypoteza} Rozsah části nerozšiřuj. Kostru ani soubory jiných částí needituj: co Kontrakt nepokrývá, vrať v kontrakt_doplnit. Na kód odkazuj souborem a jménem symbolu, nikdy číslem řádku. Vrať seznam změněných míst (sekce PRD části) a aktualizovaný souhrn části.`
    const vysl = await parallelOdNejdelsiho(kFix, x => x.vlastni.length || Number(x.k && x.k.nalezu) || 0, x => runSePredavkou(fixCastPrompt(x), { label: `prd-fix:řez ${NN}:část ${x.c.id}`, phase: 'Zapracování', agentType: 'dev-pipeline:prd', schema: CAST_SCHEMA, model: 'opus', effort: 'high' }))
    kFix.forEach((x, i) => {
      const r = vysl[i]
      if (!r) { log(`zapracování části ${x.c.id} selhalo, část zůstává v podobě po kole 1`); return }
      fixC[x.c.id] = r
      sporyVse.push(...seznam(r.spory)); pridejPojmy(r)
      // Třetí kolo kostry není: požadavek vrátí implementace části v mimo_hranici a provede ho integrace stavby.
      if (seznam(r.kontrakt_doplnit).length) log(`zapracování části ${x.c.id} hlásí, co Kontrakt nepokrývá: ${seznam(r.kontrakt_doplnit).join(' | ').slice(0, 300)} (kostra se už nezapracovává)`)
    })
    log(`zapracování částí: ${kFix.map(x => `${x.c.id} ${fixC[x.c.id] ? `změněná místa ${seznam(fixC[x.c.id].zmenena_mista).length}` : 'selhalo'}`).join(', ')}`)
  }
}

// ---------- 5. delta kontrola ----------
// Delta po dokumentech jen tam, kde kolo 1 mělo aspoň dva blokující nálezy (v režimu zapracování vždy, kolo 1 nebylo; jedním prd-checkem
// nad kostrou i dotčenými soubory částí); u lehkého profilu a lehkého PRD mini-řezu nikdy. Zbylé nálezy bez delta kontroly jdou stavbě jako hypotézy (report kola 1).
// Běh web-podzim: blokující nález mělo v kole 1 69 ze 74 dokumentů, dokument s jediným dal v deltě 0,33 blokujícího, se dvěma a víc 0,62.
const DELTA_OD = 2
const bezDeltyProfil = profil === 'lehky' || prdLehke
const bezDelty = n => profil === 'lehky' ? 'lehký profil' : prdLehke ? 'lehké PRD mini-řezu' : n === 1 ? `kolo 1 s jediným blokujícím nálezem, delta od ${DELTA_OD}` : 'kolo 1 bez blokujících nálezů'
const delty = []
if (fix) {
  const blokKostra = (k1 ? Number(k1.blokujicich) || 0 : 0) + doKostry.reduce((s, x) => s + x.ids.filter(id => blokujiciIds(x.k).includes(id)).length, 0)
  if (rezim === 'zapracovani' || (!bezDeltyProfil && blokKostra >= DELTA_OD)) delty.push({ c: null, zmenena: seznam(fix.zmenena_mista), blok: rezim === 'zapracovani' ? [] : [...blokujiciIds(k1), ...doKostry.flatMap(x => x.ids.filter(id => blokujiciIds(x.k).includes(id)).map(id => `${x.c.id}/${id}`))] })
  else log(`zapracováno (${seznam(fix.zmenena_mista).length} míst); delta kontrola ${casti.length ? 'kostry ' : ''}se nekoná (${bezDelty(blokKostra)}), zbylé nálezy jdou stavbě jako hypotézy`)
}
for (const c of casti) {
  const f = fixC[c.id], k = k1C[c.id]
  if (!f) continue
  const blok = k ? Number(k.blokujicich) || 0 : 0
  if (!bezDeltyProfil && blok >= DELTA_OD) delty.push({ c, zmenena: seznam(f.zmenena_mista), blok: blokujiciIds(k) })
  else log(`část ${c.id} zapracována; delta kontrola se nekoná (${bezDelty(blok)})`)
}
if (delty.length) {
  phase('Delta kontrola')
  // Kostra první, části od největšího počtu nálezů kola 1.
  const vysl = await parallelOdNejdelsiho(delty, d => d.c ? Number(k1C[d.c.id] && k1C[d.c.id].nalezu) || 0 : 1e12, d => d.c
    ? runSePredavkou(checkCastPrompt(2, d.c, d.zmenena.length ? d.zmenena : ['celé PRD části (agent změněná místa neuvedl)'], d.blok), { ...CHECK, label: `prd-check:řez ${NN}:část ${d.c.id}:2`, phase: 'Delta kontrola' })
    : runSePredavkou(checkPrompt(2, d.zmenena.length ? d.zmenena : ['celé PRD (agent změněná místa neuvedl)'], d.blok), { ...CHECK, label: `prd-check:řez ${NN}:2`, phase: 'Delta kontrola' }))
  delty.forEach((d, i) => {
    if (d.c) k2C[d.c.id] = vysl[i] || null
    else k2 = vysl[i] || null
    logCheck(`prd-check 2 (delta)${d.c ? ` část ${d.c.id}` : ''}`, vysl[i])
  })
}

// Hypotézy původního běhu v režimu zapracování (spec 1.7.0, rozbor-prd návrh 1b): v běhu sonnet-5-5 je 04 zapr. zahodilo a stavba 04
// nedostala pět blokujících nálezů PRD 04; jeden z nich se splnil a stál pokus 2. Identifikátory delty zapracování nesou předponu
// zapr/, jinak by se N1 nového reportu slilo s N1 původního.
const puH = rezim !== 'zapracovani' ? null
  : [pu.hypotezy, pu.hypotezy_pro_stavbu].find(h => h && typeof h === 'object' && !Array.isArray(h)) || null
const hId = (castId, id) => `${puH ? 'zapr/' : ''}${castId ? `${castId}/` : ''}${id}`

// ---------- 6. zbylé blokující ----------
// Rozhodnutí majitele 9. 10. 2026 (spec 1.7.0 § 1.11): blokující nálezy, které delta nechá, zapracuje blok ještě jednou bez další
// kontroly; nálezy zůstávají v hypotezy.blokujici a zapracovano_bez_kontroly je označí, refresh stavby je přeměří. V běhu sonnet-5-5
// zapracovával refresh řezu 03 přenesené nálezy 21 min na kritické cestě, ačkoli PRD 03 skončilo 34 min před stavbou.
const zbyleBlok = [{ c: null, k: k2 }, ...casti.map(c => ({ c, k: k2C[c.id] }))].filter(x => x.k && x.k.verdikt === 'needs-fixes' && blokujiciIds(x.k).length)
const zapracovanoBezKontroly = []
let fixZbyle = null
if (zbyleBlok.length) {
  phase('Zbylé blokující')
  const kde = c => c ? `PRD části ${c.id} (${c.nazev}) řezu ${NN}` : `${casti.length ? 'kostře PRD' : 'PRD'} řezu ${NN}`
  const zbylePrompt = ({ c, k }) => `${ramec}

Úkol: zapracuj blokující nálezy, které po delta kontrole zbyly v ${kde(c)}: report ${k.report_path} (nálezy ${blokujiciIds(k).join(', ')}; ostatní nálezy reportu nech, půjdou stavbě jako hypotézy). ${c ? `Kostra PRD: ${prd.prd_path} · PRD části: ${c.prd_path} · soubory a oblasti části: ${c.soubory.join(', ')} · kritéria části: ${c.kriteria.join(', ')}` : `PRD: ${prd.prd_path} · E2E: ${prd.e2e_path} · řádek plánu: ${JSON.stringify(row)}`}
Další kontrola nebude: zapracování přeměří refresh PRD ve stavbě nad tehdejším stromem. Každý nález je hypotéza: ověř proti kódu a vizi; co míří vedle, nezapracuj a uveď v odmitnute s důvodem. ${navrhHypoteza} ${c
    ? `Kostru ani soubory jiných částí needituj: co Kontrakt nepokrývá, vrať v kontrakt_doplnit.${kostraCteni(true, c.kriteria)}`
    : `${casti.length ? `Počet, id, soubory, kritéria ani závislosti částí neměň (tabulka Části zůstává, části se už nesjednotí); když oprava změnu tabulky Části vyžaduje, nález odmítni s důvodem.${rezim === 'zapracovani' ? ' Soubory částí (docs/prd/rez-NN-cast-K.md), kterých se nález týká, upravit smíš; změněná místa v nich uveď s předponou části (K2: …).' : ''}${kostraCteni(false)} ` : ''}${krokyCislovane}`} Rozsah řezu nerozšiřuj. Na kód odkazuj souborem a jménem symbolu, nikdy číslem řádku. Vrať seznam změněných míst${c ? '.' : ` a aktualizovaný souhrn pro orchestrátora. ${cekaniCele} ${prostrediCele}`}`
  const vysl = await parallelOdNejdelsiho(zbyleBlok, x => x.c ? blokujiciIds(x.k).length : 1e12, x => runSePredavkou(zbylePrompt(x), x.c
    ? { label: `prd-fix:řez ${NN}:část ${x.c.id}:zbylé`, phase: 'Zbylé blokující', agentType: 'dev-pipeline:prd', schema: CAST_SCHEMA, model: 'opus', effort: 'high' }
    : { label: `prd-fix:řez ${NN}:zbylé`, phase: 'Zbylé blokující', agentType: 'dev-pipeline:prd', schema: PRD_SCHEMA, model: 'opus', effort: 'high' }))
  zbyleBlok.forEach((x, i) => {
    const r = vysl[i]
    const kdo = x.c ? `části ${x.c.id}` : (casti.length ? 'kostry' : 'PRD')
    if (!r) { log(`zapracování zbylých blokujících ${kdo} selhalo; nálezy jdou stavbě jako blokující hypotézy`); return }
    if (!x.c) fixZbyle = r
    sporyVse.push(...seznam(r.spory))
    const odm = new Set(objekty(r.odmitnute).map(o => S(o.id).trim()))
    const ids = blokujiciIds(x.k).filter(id => !odm.has(id))
    zapracovanoBezKontroly.push(...ids.map(id => hId(x.c && x.c.id, id)))
    log(`zbylé blokující ${kdo}: zapracováno bez kontroly ${ids.join(', ') || 'nic'}${odm.size ? `, odmítnuto ${[...odm].join(', ')}` : ''} (${seznam(r.zmenena_mista).length} změněných míst; přeměří refresh stavby)`)
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
const sId = (d, id) => hId(d.id, id)
// Blokující nálezy delty, které zbyly, zvlášť (spec 1.6.0 § 1.5): blok stavby nad nimi pustí refresh i bez prd_stale. V běhu web-rijen
// šly 3 takové nálezy (řez 01 N1, N2; řez 11 N1) jen implementaci, protože se refresh bez prd_stale nekonal.
const blokujici = dokumenty.filter(d => d.k2 && d.k2.verdikt === 'needs-fixes').flatMap(d => blokujiciIds(d.k2).map(id => sId(d, id)))
// Nespustitelné nejisté nálezy nad kritérii z obou kol (delta přebije kolo 1 u téhož id): stavba je ověří jako první.
const overitMapa = new Map()
for (const d of dokumenty) for (const k of [d.k1, d.k2]) for (const o of objekty(k && k.overit_prvni)) {
  const id = sId(d, S(o.id).trim() || `?${overitMapa.size + 1}`)
  overitMapa.set(id, { id, kriterium: kratce(o.kriterium, 120), hypoteza: kratce(o.hypoteza, 600) })
}
const overitPrvni = [...overitMapa.values()]
// Bez delta kontroly jdou stavbě nálezy kola 1 (zapracované, k ověření); s delta kontrolou jen to, co po ní zbylo.
const noveHypotezy = zbyle.length || overitPrvni.length ? {
  report: zbyle.map(d => posl(d).report_path).join(' + '),
  ids: zbyle.flatMap(d => seznam(posl(d).nalezy_ids).map(id => sId(d, id))),
  blokujici,
  overit_prvni: overitPrvni,
  zapracovano: zbyle.some(d => d.zapr && !d.k2),
  zapracovano_bez_kontroly: zapracovanoBezKontroly,
} : null
// Sloučení s hypotézami původního běhu: report spojit, id sjednotit, zapracovano z původního. Vynechá se jen id, které nález
// orchestrátora ruší výslovným tvarem „ruší: N2, K1/N3“. Volný text („N1 neplatí“, „poruší AK5“) nic neruší: dřívější regex nad
// slovy zrušit/neplatí shodil i hypotézu, kterou orchestrátor jen zmínil, a stavba ji nepřeměřila (review 1.7.0, N8).
const ZRUSENI = /(?<!\p{L})ruší:\s*([^\n;]+)/giu
const zruseneIds = new Set(nalezyOrch.flatMap(n => [...S(n).matchAll(ZRUSENI)].flatMap(m => m[1].split(/[,\s]+/).map(x => x.replace(/[.:)]+$/, '').trim()).filter(Boolean))))
const zrusene = id => zruseneIds.has(S(id))
const sjednot = (...xs) => [...new Set(xs.flatMap(seznam))]
const hypotezyStavby = (() => {
  if (!puH) return noveHypotezy
  const n = noveHypotezy || { report: '', ids: [], blokujici: [], overit_prvni: [], zapracovano: false, zapracovano_bez_kontroly: [] }
  const zruseno = sjednot(puH.ids, puH.blokujici, objekty(puH.overit_prvni).map(o => o.id)).filter(zrusene)
  const ponech = xs => seznam(xs).filter(id => !zruseno.includes(id))
  const overit = new Map(objekty(puH.overit_prvni).filter(o => !zruseno.includes(S(o.id).trim())).map(o => [S(o.id).trim(), o]))
  for (const o of n.overit_prvni) overit.set(o.id, o)
  const h = {
    report: sjednot(S(puH.report).split(' + '), S(n.report).split(' + ')).join(' + '),
    ids: sjednot(ponech(puH.ids), n.ids),
    blokujici: sjednot(ponech(puH.blokujici), n.blokujici),
    overit_prvni: [...overit.values()],
    zapracovano: Boolean(puH.zapracovano) || n.zapracovano,
    zapracovano_bez_kontroly: sjednot(ponech(puH.zapracovano_bez_kontroly), n.zapracovano_bez_kontroly),
  }
  log(`hypotézy z původního běhu převzaty: ${ponech(puH.ids).length} id, ${ponech(puH.blokujici).length} blokujících${zruseno.length ? `; zrušené nálezem orchestrátora: ${zruseno.join(', ')}` : ''}`)
  return h.report || h.ids.length || h.overit_prvni.length ? h : null
})()
// Část, kterou kontrola odhadla nad strop (spec 1.6.0 § 1.8), jde stavbě i při verdiktu ready: delta K8 řezu 10 v běhu web-rijen
// předpověděla 1 650–1 800 řádků, K8 skončila ready a pokus 1 padl na stropu předávek právě na ní.
const castiNad = casti.map(c => ({ id: c.id, odhad: Math.max(Number(c.odhad_radku) || 0, ...[k1C[c.id], k2C[c.id]].map(k => Number(k && k.odhad_casti) || 0)) }))
  .filter(x => x.odhad > STROP_CASTI)
if (castiNad.length) log(`části nad stropem ~${STROP_CASTI} ř.: ${castiNad.map(x => `${x.id} ${x.odhad} ř.`).join(', ')} (jdou stavbě)`)
// Delta v režimu zapracování kontroluje i místa v souborech částí; nezměněné části zkontroloval původní běh (rozbor-prd návrh 11:
// výsledek dřív hlásil bez_kontroly K1–K4, i když delta jejich změny viděla).
if (rezim === 'zapracovani' && k2 && casti.length) {
  const vDelte = casti.filter(c => seznam(fix && fix.zmenena_mista).some(m => new RegExp(`^\\s*${reEsc(c.id)}\\s*:`).test(m))).map(c => c.id)
  log(`delta zapracování pokryla ${vDelte.length ? `změny v částech ${vDelte.join(', ')}` : 'jen kostru (části beze změny)'}`)
}
// Zapracování zbylých blokujících smí změnit, na co se orchestrátor ptá (cekani) a rozsah kroků po nasazení.
const fixNavrat = fixZbyle ? { ...(fix || {}), ...Object.fromEntries(['cekani', 'kroky_po_nasazeni', 'prostredi'].filter(k => fixZbyle[k] != null).map(k => [k, fixZbyle[k]])) } : fix
return navratBloku({
  fin,
  fix: fixNavrat,
  // Nejhorší verdikt a součty přes poslední kolo každého dokumentu; reporty jen počtem a vzorem cesty.
  kontrola: zkontrolovane.length ? {
    kola: dokumenty.some(d => d.k2) ? 2 : 1,
    verdikt: zbyle.length ? 'needs-fixes' : 'ready',
    nalezu: zkontrolovane.reduce((s, d) => s + (Number(posl(d).nalezu) || 0), 0),
    blokujicich: zkontrolovane.reduce((s, d) => s + (Number(posl(d).blokujicich) || 0), 0),
    reporty_pocet: zkontrolovane.length,
    regrese: dokumenty.reduce((n, d) => n + (d.k2 ? Number(d.k2.regrese) || 0 : 0), 0),
    reporty: `${cwd}/docs/reviews/rez-${NN}-prd-check-*kolo-*.md`,
    bez_kontroly: dokumenty.filter(d => !posl(d) && !(rezim === 'zapracovani' && d.id)).map(d => d.id || (casti.length ? 'kostra' : 'PRD')),
    ...(zapracovanoBezKontroly.length ? { zapracovano_bez_kontroly: zapracovanoBezKontroly.length } : {}),
  } : null,
  hypotezy: hypotezyStavby,
  odmitnute: dokumenty.flatMap(d => objekty(d.fix && d.fix.odmitnute).map(o => ({ id: sId(d, S(o.id)) }))),
  castiNad,
})

// ---------- args ze souboru ----------
// Deklarace funkce: volá se na začátku skriptu, proto nesmí sahat na konstanty definované níž (stavy TDZ). Agent opisuje hodnoty
// ze dvou souborů; skript hlídá číslo řezu (stavba 8 běhu web-rijen dostala args řezu 7 a nikdo to nepoznal) a povinná pole.
async function nactiArgs(volani) {
  const T = v => String(v == null ? '' : v)
  const nnVolani = T(volani.rez).trim() ? T(volani.rez).trim().padStart(2, '0') : ''
  if (!volani.cwd || !nnVolani) return { ok: false, rez: nnVolani || null, duvod: 'args_file bez cwd nebo rez ve volání' }
  const soubor = T(volani.args_file).startsWith('/') ? T(volani.args_file) : `${volani.cwd}/${T(volani.args_file).replace(/^\.\//, '')}`
  const s = d => ({ type: 'string', description: d })
  const schema = {
    type: 'object',
    required: ['cwd', 'rez'],
    properties: {
      cwd: s('kořen projektu'), plugin_root: s('kořen pluginu'), vize: s('cesta k vizi'), produkt: s('cesta k produktové severce'),
      rez: s('číslo řezu přesně jako v souboru'), plan_row: { type: 'object', description: 'řádek plánu, celý objekt beze změny' },
      stav_po_minulem: s(''), hypotezy: { type: 'array', items: { type: 'string' } }, follow_ups: s(''), app_pristup: s('pokyny majitele k prostředí'),
      profil: s(''), prd_lehke: { type: 'boolean' }, kontrakt_prd: s(''), kontrakt_rez: s(''), mapa_vize: s('mapa sekcí vize'),
      rezim: s(''), prd_path: s(''), e2e_path: s(''), nalezy: { type: 'array', items: { type: 'string' } },
      puvodni: { type: 'object', description: 'předchozí návrat bloku PRD, celý objekt beze změny' }, od_faze: s(''),
      rozhodnuti_majitele: { type: 'array', items: { type: 'string' }, description: 'rozhodnutí majitele z .run-args.json, celé pole beze změny' },
      _pole: { type: 'array', items: { type: 'string' }, description: 'seznam polí ze souboru řezu (pole _pole), opsaný přesně' },
      chyba: s('jen když soubor args chybí nebo není platný JSON: proč; jinak nevyplňuj'),
    },
  }
  const prompt = `Řez ${nnVolani}: načtení args bloku PRD.
Přečti ${soubor} a ${volani.cwd}/docs/.run-args.json (když existuje). Vrať jejich sloučení: pole souboru řezu mají přednost před .run-args.json. Hodnoty opiš přesně, nic nezkracuj, nepřeformuluj ani nedoplňuj; pole, které v souborech není, vynech. Pole, které schéma nemá, vynech; hodnotu nikdy nepřesouvej do jiného pole; pole _pole opiš přesně. Když ${soubor} chybí nebo není platný JSON, vyplň jen cwd, rez a chyba. Jiné soubory nečti, nic nespouštěj ani needituj.`
  const nacti = async p => {
    let x = null
    for (let i = 0; i <= 2 && !x; i++) {
      try { x = await agent(p, { label: `args:řez ${nnVolani}`, phase: 'PRD', agentType: 'dev-pipeline:nacteni-args', schema, model: 'sonnet', effort: 'low' }) }
      catch (e) { log(`args:řez ${nnVolani}: spuštění selhalo (${T(e && e.message || e).slice(0, 120)})`) }
    }
    return x
  }
  // Kontrola opisu (spec 1.7.0 § 1.4): skript zapíše do souboru _pole (klíče souboru a .run-args.json bez prázdných hodnot). Načítací
  // agent v běhu sonnet-5-5 ztratil kontrakt_rez (PRD 03), vymyslel rezim „config“ z deploy_mode (PRD 06) a ve stavbě obnova: {}.
  // Sémantika je ve všech třech blocích stejná (review 1.7.0, N4 a plan-check 7): pole volání se nekontrolují; prázdná hodnota je
  // chybějící pole; stálé pole mimo _pole není navíc, protože .run-args.json smí orchestrátor změnit po složení souboru bloku
  // (args-bloku.py rozhodnuti, změna pokynů k prostředí); druhé načtení se měří proti _pole prvního.
  const VOLANI = ['cwd', 'plugin_root', 'rez', 'args_file']
  const STALA = ['app_pristup', 'runbook', 'deploy_mode', 'deploy_okno', 'ne_cile', 'mapa_vize', 'vize', 'produkt', 'rozhodnuti_majitele', 'rychle_kontroly']
  const prazdne = v => v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)
  const rozdil = (x, pole) => {
    const ocek = pole.filter(k => !VOLANI.includes(k) && Object.prototype.hasOwnProperty.call(schema.properties, k))
    const vraceno = Object.keys(x).filter(k => k !== '_pole' && k !== 'chyba' && !VOLANI.includes(k) && !prazdne(x[k]))
    return { chybi: ocek.filter(k => !vraceno.includes(k)), navic: vraceno.filter(k => !pole.includes(k) && !STALA.includes(k)) }
  }
  const bezPrazdnych = x => Object.fromEntries(Object.entries(x).filter(([k, v]) => VOLANI.includes(k) || !prazdne(v)))
  let r = await nacti(prompt)
  if (!r) return { ok: false, rez: nnVolani, duvod: `načtení ${volani.args_file} nevrátilo výsledek` }
  if (T(r.chyba).trim()) return { ok: false, rez: nnVolani, duvod: `args_file: ${T(r.chyba).trim().slice(0, 300)}` }
  const nnSoubor = T(r.rez).trim() ? T(r.rez).trim().padStart(2, '0') : ''
  if (nnSoubor !== nnVolani) return { ok: false, rez: nnVolani, duvod: `args_file patří řezu ${nnSoubor || '(bez rez)'}, volání je pro řez ${nnVolani}` }
  const pole1 = Array.isArray(r._pole) ? r._pole.map(T) : null
  if (!pole1) log(`args:řez ${nnVolani}: soubor bez _pole (starší skript), kontrola opisu se nekoná`)
  else {
    let d = rozdil(r, pole1)
    if (d.chybi.length || d.navic.length) {
      log(`args:řez ${nnVolani}: opis nesedí (chybí: ${d.chybi.join(', ') || '–'}; navíc: ${d.navic.join(', ') || '–'}), načítám znovu`)
      const r2 = await nacti(`${prompt}\nMinule chybělo: ${d.chybi.join(', ') || 'nic'}, navíc bylo: ${d.navic.join(', ') || 'nic'}. Chybějící pole opiš ze souboru; pole navíc vrať jen tehdy, když v souborech opravdu je. Pole z .run-args.json opiš i tehdy, když v _pole nejsou. Hodnotu nikdy nepřesouvej do jiného pole a nic nedoplňuj.`)
      if (!r2 || T(r2.chyba).trim()) return { ok: false, rez: nnVolani, duvod: `args_file: opis nesedí (chybí: ${d.chybi.join(', ') || '–'}; navíc: ${d.navic.join(', ') || '–'}) a nové načtení nevrátilo platný výsledek` }
      r = r2
      d = rozdil(r, pole1)
      if (d.chybi.length || d.navic.length) return { ok: false, rez: nnVolani, duvod: `args_file: opis nesedí (chybí: ${d.chybi.join(', ') || '–'}; navíc: ${d.navic.join(', ') || '–'})` }
    }
  }
  const zVolani = { ...volani }
  delete zVolani.args_file
  const { chyba, _pole, ...zeSouboru } = bezPrazdnych(r)
  log(`args:řez ${nnVolani}: načteno ${Object.keys(zeSouboru).length} polí z ${volani.args_file}${pole1 ? ', opis sedí s _pole' : ''}`)
  return { ok: true, args: { ...zeSouboru, ...zVolani } }
}
