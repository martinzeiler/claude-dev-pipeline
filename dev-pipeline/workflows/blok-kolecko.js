export const meta = {
  name: 'blok-kolecko',
  description: 'dev-pipeline závěrečné review kolečko vize: thermo, code-review kolo 1, vlna dluhu z follow-ups, bezpečnost dvěma metodikami, deploy a E2E kolečka, závěr; po každé opravné vlně brána a commit, neúspěch vrací fázi pro obnovu, odklad nasazení zastaví s časem nejdriv.',
  whenToUse: 'Spouští orchestrátor /dev-pipeline:orchestrate ve finální fázi vize, nebo uživatel výslovně nad větší sérií změn, s args {cwd, plugin_root, args_file} (soubor docs/.kolecko.json) nebo s celými args; schéma je v KONTRAKT.md pluginu. Bez args nic nedělá, ne na jeden řez.',
  phases: [
    { title: 'Vstup', detail: 'jen s args_file: agent načte args ze souboru' },
    { title: 'Thermo', detail: 'strukturální audit větve, oprava jen BLOCKER/HIGH, brána, commit' },
    { title: 'Code-review 1', detail: 'korektnost celé větve, opravy po balíčcích souběžně, brána, commit' },
    { title: 'Dluh', detail: 'položky [oprava] z docs/follow-ups.md (skript follow-ups.py, nejvýš 40, nejdřív z tohoto běhu) po balíčcích, brána, commit; závěr je přeškrtne' },
    { title: 'Bezpečnost', detail: 'bezpečnostní čočka s checklistem ∥ security-review, opravy bez commitu, brána, samostatný commit fix(security)' },
    { title: 'Deploy a E2E', detail: 'brána (jen když se strom od poslední zelené brány změnil), nasazení se zápisem nasazení, E2E scénáře kolečka a verifikace, jedna oprava (oprava kódu přes bránu)' },
    { title: 'Závěr', detail: 'journal, follow-ups, plné seznamy do docs/.vysledek-kolecko.json, docs/.review-passed, commit docs' },
  ],
}

// ---------- vstup ----------
let a = args
if (typeof a === 'string') { try { a = JSON.parse(a) } catch { a = null } }
const S = v => String(v == null ? '' : v)
// Args ze souboru (1.6.0, jako ve stavbě): orchestrátor předá jen {cwd, plugin_root, args_file}, args načte agent, protože skript
// Workflow soubory číst neumí. Soubor kolečka nese rez „kolecko“: soubor stavby (číslo řezu) blok odmítne dřív, než cokoli spustí.
if (a && typeof a === 'object' && S(a.args_file).trim()) {
  const { args_file: argsFile, ...volani } = a
  if (!volani.cwd) { log('blok-kolecko: args_file bez cwd ve volání – nic se nespustilo'); return { ok: false, duvod: 'args_file: volání musí nést cwd' } }
  const soubor = S(argsFile).trim().startsWith('/') ? S(argsFile).trim() : `${S(volani.cwd)}/${S(argsFile).trim().replace(/^\.\//, '')}`
  // Typy polí jako ve stavbě: kolečko čte jen řetězce a objekt obnovy, typ brání opisu jiné hodnoty než ze souboru.
  const t = (type, d) => ({ type, description: d || 'hodnota opsaná ze souboru beze změny' })
  const ARGS = { type: 'object', properties: {
    chyba: t('string', 'jen když soubor args chybí nebo není platný JSON: důvod; jinak nevyplňuj'),
    ...Object.fromEntries(['cwd', 'plugin_root', 'vize', 'produkt', 'rez', 'base', 'ne_cile', 'runbook', 'deploy_mode', 'deploy_okno', 'app_pristup', 'rychle_kontroly'].map(k => [k, t('string')])),
    // Obnova do souboru nepatří (1.7.0, jako ve stavbě): přichází jen z volání orchestrátora.
    rozhodnuti_majitele: { type: 'array', items: { type: 'string' }, description: 'celé pole beze změny' },
    _pole: { type: 'array', items: { type: 'string' }, description: 'seznam polí souboru (_pole) opsaný přesně' },
  } }
  phase('Vstup')
  const nacti = async doplnek => {
    let r = null
    for (let i = 0; i < 3 && !r; i++) {
      try {
        r = await agent(`Závěrečné kolečko: načtení args bloku. Přečti ${soubor} a ${S(volani.cwd)}/docs/.run-args.json (když existuje). Vrať jejich sloučení, pole souboru kolečka mají přednost. Hodnoty opiš přesně, nic nezkracuj ani nedoplňuj. Když soubor kolečka chybí nebo není platný JSON, vrať jen pole chyba s důvodem.${doplnek}`,
          { label: 'args:kolečko', phase: 'Vstup', agentType: 'dev-pipeline:nacteni-args', schema: ARGS, model: 'sonnet', effort: 'low' })
      } catch (e) { log(`args:kolečko: spuštění selhalo (${S(e && e.message || e).slice(0, 120)})`) }
    }
    return r
  }
  let nactene = await nacti('')
  if (!nactene) return { ok: false, duvod: `args_file: načítací agent nevrátil výsledek (${soubor})` }
  if (S(nactene.chyba).trim()) { log(`blok-kolecko: args_file ${soubor}: ${S(nactene.chyba).slice(0, 200)}`); return { ok: false, duvod: `args_file: ${S(nactene.chyba).trim().slice(0, 400)}` } }
  // Kontrola opisu proti _pole souboru (1.7.0, jako ve stavbě): chybí = pole ze _pole, které schéma bloku zná a návrat nemá
  // (nebo má prázdné).
  // Stálá pole jdou z docs/.run-args.json, které orchestrátor smí změnit po složení souboru bloku (rozhodnutí majitele, změna
  // pokynů k prostředí): _pole souboru je pak nezná. Navíc se proto nepočítají (revize 1.7.0: rozhodnutí zapsané po složení
  // souboru by blok zastavilo, nebo by ho druhé načtení „podle _pole“ vypustilo). Pole volání mají přednost, jejich opis se
  // nekontroluje. Navíc vrácené pole s prázdnou hodnotou se zahodí: soubor ho nemá a blok chybějící pole bere jako prázdné.
  // Stejná sémantika platí ve všech třech blocích.
  const VOLANI_POLE = ['cwd', 'plugin_root', 'rez', 'args_file']
  const STALA_POLE = ['app_pristup', 'runbook', 'deploy_mode', 'deploy_okno', 'ne_cile', 'mapa_vize', 'vize', 'produkt', 'rozhodnuti_majitele', 'rychle_kontroly']
  const prazdne = v => v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)
  const poleVolani = k => VOLANI_POLE.includes(k) || k in volani
  const seznamZ = r => Array.isArray(r._pole) ? r._pole.map(x => S(x).trim()).filter(Boolean) : null
  const opis = (r, seznam) => {
    for (const k of Object.keys(r)) if (k !== '_pole' && k !== 'chyba' && !seznam.includes(k) && prazdne(r[k])) delete r[k]
    const chybi = seznam.filter(k => k in ARGS.properties && !poleVolani(k) && (!(k in r) || prazdne(r[k])))
    const navic = Object.keys(r).filter(k => k !== '_pole' && k !== 'chyba' && !poleVolani(k) && !STALA_POLE.includes(k) && !seznam.includes(k))
    return { chybi, navic }
  }
  const textRozdilu = d => `chybí: ${d.chybi.join(', ') || 'nic'}; navíc: ${d.navic.join(', ') || 'nic'}`
  // Druhé načtení se porovná se _pole z prvního: návrat bez _pole by jinak rozdíl tiše propustil (code-review 1.7.0, N1:
  // s chybějícími hypotézami blok doběhl jako hotovo).
  const seznam = seznamZ(nactene)
  if (!seznam) log(`blok-kolecko: args_file ${soubor} bez _pole (starší skript), opis se nekontroluje`)
  else {
    let rozdil = opis(nactene, seznam)
    if (rozdil.chybi.length || rozdil.navic.length) {
      log(`blok-kolecko: opis args nesedí se _pole (${textRozdilu(rozdil)}), načítám znovu`)
      nactene = await nacti(` Opis nesedí se seznamem _pole souboru; minule chybělo: ${rozdil.chybi.join(', ') || 'nic'}, navíc bylo: ${rozdil.navic.join(', ') || 'nic'}. Vrať všechna pole obou souborů s neprázdnou hodnotou přesně opsaná; pole, které žádný ze souborů nemá, nevymýšlej.`)
      if (!nactene) return { ok: false, duvod: `args_file: načítací agent nevrátil výsledek (${soubor})` }
      if (S(nactene.chyba).trim()) return { ok: false, duvod: `args_file: ${S(nactene.chyba).trim().slice(0, 400)}` }
      rozdil = opis(nactene, seznam)
      if (rozdil.chybi.length || rozdil.navic.length) {
        log(`blok-kolecko: args_file ${soubor}: opis nesedí ani napodruhé (${textRozdilu(rozdil)}) – nic se nespustilo`)
        return { ok: false, duvod: `args_file: opis nesedí (${textRozdilu(rozdil)})` }
      }
    }
  }
  delete nactene._pole
  delete nactene.obnova
  const rezSouboru = S(nactene.rez).trim()
  if ((rezSouboru && rezSouboru !== 'kolecko') || (S(volani.rez).trim() && S(volani.rez).trim() !== 'kolecko')) {
    log(`blok-kolecko: args_file ${soubor} patří řezu ${rezSouboru || '?'}, ne kolečku – nic se nespustilo`)
    return { ok: false, duvod: `args_file patří řezu ${rezSouboru || '?'}` }
  }
  delete nactene.chyba
  a = { ...nactene, ...volani }
}
if (!a || typeof a !== 'object' || !a.cwd || !a.vize) {
  log('blok-kolecko: chybí args (cwd, vize) – nic se nespustilo')
  return { ok: false, duvod: 'chybí args: cwd, vize' }
}
const cwd = S(a.cwd)
const base = a.base ? S(a.base) : 'main'
// Tvar dokumentů a společná pravidla agentů (TVAR-DOKUMENTU.md pluginu): rámec na něj odkazuje jménem sekcí, nic neopisuje.
const tvar = a.plugin_root ? `${a.plugin_root}/skills/orchestrate/TVAR-DOKUMENTU.md` : 'TVAR-DOKUMENTU.md pluginu dev-pipeline'
// Standardy pro review a opravy (§ 2.14): čtou je jen reviewer, thermo a fix.
const standardy = ` Standardy pro review: ${a.plugin_root ? `${a.plugin_root}/standardy/` : 'adresář standardy/ pluginu dev-pipeline'} (STANDARD-REVIEW.md, SLOVNIK-NAVRHU.md) a CODING_STANDARDS.md projektu, když existuje; repo má přednost.`
const produkt = a.produkt ? S(a.produkt) : null
const neCile = a.ne_cile ? S(a.ne_cile).slice(0, 1500) : ''
const runbook = a.runbook ? S(a.runbook) : null
const deployMode = a.deploy_mode === 'commit-only' ? 'commit-only' : 'config'
const runtimeDopad = deployMode !== 'commit-only'
const appPristup = a.app_pristup ? S(a.app_pristup) : null
// Zakázané okno nasazení z runbooku projektu (text), deploy čeká s rezervou.
const deployOkno = a.deploy_okno ? S(a.deploy_okno).slice(0, 300) : ''
const e2ePath = `${cwd}/docs/e2e/kolecko.md`
// Rozhodnutí majitele, která mění provoz běhu (1.7.0, docs/.run-args.json): v běhu sonnet-5-5 autor scénářů kolečka „bez čekání“
// nedostal a kritéria nad populací běhů napsal jako neměřitelná. Jdou do rámce každého agenta kolečka.
const rozhodnutiMajitele = (Array.isArray(a.rozhodnuti_majitele) ? a.rozhodnuti_majitele : (a.rozhodnuti_majitele ? [a.rozhodnuti_majitele] : []))
  .map(x => S(x).trim()).filter(Boolean).join(' | ').slice(0, 2000)
// Rychlé kontroly nad celým stromem z projektových fakt (1.7.0, jako ve stavbě): fix agenti je pouštějí s dotčenými testy.
const rychleKontroly = a.rychle_kontroly ? S(a.rychle_kontroly).trim().slice(0, 600) : ''
const rychleText = rychleKontroly ? ` a rychlé kontroly nad celým stromem: ${rychleKontroly}` : ''
const rep = (...casti) => `${cwd}/docs/reviews/kolecko-${casti.filter(Boolean).join('-')}.md`
const rozsah = `git diff ${base}...HEAD plus pracovní strom (opravy předchozích kol kolečka, včetně netrackovaných souborů)`
// Obnova po zastavení (bod 20): orchestrátor obnovuje blok přes resumeFromRunId a nezměněný prompt se vrátí z cache,
// v běhu bez-dluhu i s červenou bránou (třída B1). Značka od dané fáze změní zadání brány, commitu, deploye a E2E,
// takže se přeměří nad dnešním stromem; review a opravy se vrátí z cache (jejich práce už je ve stromu).
// Kolo 2 (pět čoček a triáž) se v 1.7.0 ruší: dva běhy po sobě mělo nejnižší výnos ($21 a 25 min za jednu opravu dokumentace v běhu
// sonnet-5-5, $23 za opravený nález v běhu web-rijen). Obnova od „kolo 2“ (starší orchestrátor) jde od bezpečnosti, další fáze.
const FAZE = [['Thermo', 'thermo'], ['Code-review 1', 'kolo 1'], ['Dluh', 'dluh'], ['Bezpečnost', 'bezpecnost'], ['Deploy a E2E', 'deploy'], ['Závěr', 'zaver']]
const bezDiakritiky = v => S(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
// Obnova platí jen s neprázdným od_faze (1.7.0, jako ve stavbě: prázdný objekt obnovy z načítacího agenta zmařil cache obnovy).
const obnovaIn = a.obnova && typeof a.obnova === 'object' && S(a.obnova.od_faze).trim() ? a.obnova : null
const odFazeIn = obnovaIn ? bezDiakritiky(obnovaIn.od_faze) : ''
const odFaze = odFazeIn === 'kolo 2' ? 'bezpecnost' : odFazeIn
const obnovaOd = obnovaIn ? FAZE.findIndex(([, k]) => k === odFaze) : -1
// Neznámá fáze přeměří brány od thermo: brána navíc stojí minuty, červená brána z cache zmaří celou obnovu.
const obnova = obnovaIn ? { od: Math.max(0, obnovaOd), znacka: S(obnovaIn.znacka).trim() || 'bez značky' } : null
// Commit a deploy po obnově mohou najít commit a fix(security) z přerušeného běhu (pád po commitu): bez věty je commitnou podruhé.
const obnovaVeta = (ph, commitu) => obnova && FAZE.findIndex(([t]) => t === ph) >= obnova.od ? `\nObnova běhu (${obnova.znacka}): výsledek této fáze z přerušeného běhu neplatí; změř a proveď ji znovu nad dnešním stavem.${commitu ? ' Commit kolečka nebo fix(security) z přerušeného běhu může už existovat (git log --grep): nový nedělej, vrať jejich hashe; změny pracovního stromu, které v nich nejsou, commitni dalším commitem.' : ''}` : ''
// Fáze selhání → od_faze obnovy (návrat obnova_od): orchestrátor ji nemusí odvozovat.
const OBNOVA_OD = { thermo: 'thermo', 'code-review kolo 1': 'kolo 1', dluh: 'dluh', 'bezpečnost': 'bezpecnost', deploy: 'deploy', 'deploy-infra': 'deploy', 'deploy-odklad': 'deploy', e2e: 'deploy' }

// ---------- pomocné ----------
const cekej = ms => (ms > 0 && typeof setTimeout === 'function') ? new Promise(r => setTimeout(r, ms)) : Promise.resolve()
// Opakované zadání nezná stav předchůdce (třída C2): strom může nést jeho rozdělanou práci, nový agent ji dřív přepsal od nuly.
const C2 = 'Předchozí běh tohoto zadání skončil bez výsledku a pracovní strom může nést jeho rozdělanou práci: začni inventurou (git status, git diff --stat) a navaž na ni, nezačínej od nuly.'
async function run(prompt, opts) {
  const label = opts.label || 'agent'
  for (let i = 0; i <= 2; i++) {
    let r = null
    try { r = await agent(i >= 1 ? `${prompt}\n\n${C2}` : prompt, opts) } catch (e) { log(`${label}: spuštění selhalo (${String(e && e.message || e).slice(0, 120)})`) }
    if (r) return r
    if (i < 2) { log(`${label}: agent nevrátil výsledek, opakuji (${i + 1}/2)`); await cekej(15000 * (i + 1)) }
  }
  return null
}
// Štafeta: agent, který práci předal (zpráva PŘEDÁVKA z hooku hlídače kontextu), dostane nástupce se stejným zadáním
// a předávkou. Nástupce vrací návrat za celé zadání včetně práce předchůdce. Nejvýš 3 předávky, čtvrtá je selhání fáze.
// Předávka platí jen jako cesta, kterou jmenuje hook (docs/reviews/predavka-<agent_id>.md), a jen nová: v revizi 1.4.0 vyplnil
// agent pole textem „žádná“ a nástupce zopakoval cestu předchůdce; obojí blok bral jako další předávku a po třetí fázi zahodil.
// Relativní cesta platí taky a doplní se na absolutní (1.6.0, běh web-rijen: části řezu 10 vrátily cestu bez úvodního lomítka).
const MAX_PREDAVEK = 3
const PREDAVKA_CESTA = /(^|\/)docs\/reviews\/predavka-[^/\s]+\.md$/
const predavkaCesta = p => { const t = S(p).trim(); return !PREDAVKA_CESTA.test(t) ? '' : t.startsWith('/') ? t : `${cwd}/${t.replace(/^\.\//, '')}` }
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
    const soubor = predavkaCesta(r.predavka)
    if (!soubor || predane.includes(soubor)) {
      log(`${label}${n > 1 ? `:n${n}` : ''}: pole predavka „${S(r.predavka).trim().slice(0, 160)}“ není nová předávka (${soubor ? 'cesta předávky předchůdce' : 'není cesta docs/reviews/predavka-….md'}); návrat beru jako konečný`)
      break
    }
    predane.push(soubor)
    predavekCelkem++
    if (n > MAX_PREDAVEK) { vycerpane.add(label); log(`${label}: předávky vyčerpány (${n}. předávka, strop ${MAX_PREDAVEK}); fáze selhala na stropu předávek, ne na chybějícím výsledku (${soubor})`); return null }
    log(`${label}: předávka ${n}/${MAX_PREDAVEK} (${soubor})`)
    r = await run(`${prompt}\n\nNavazuješ na předchůdce, který zadání předal: nejdřív přečti předávku ${soubor}, hotové neopakuj, ověřené znovu neověřuj, stav stromu si potvrď přes git status; návrat vrať za celé zadání včetně práce předchůdce (počty, seznamy, follow-upy, nálezy).`,
      { ...opts, label: `${label}:n${n + 1}` })
  }
  return r
}
// Rámec každého agenta kolečka (1.8.0, § 3 A1, shodně se stavbou): kontext, args majitele a pět vět: autonomie, vize-spory s definicí
// konzervativní volby odkazem (§ 2.1), návrat strojově, společná pravidla odkazem na TVAR-DOKUMENTU.md, hranice souborů. Každá věta
// pod 40 slov (test sedimentu počítá duplicity řádků mezi bloky). Soubory kolečka se jmenují kolecko-<co>.md (vzor v TVAR-DOKUMENTU).
const ramec = [
  `Projekt: ${cwd} (absolutní cesty; commity jen na vize větvi, nikdy na ${base}).`,
  `Závěrečné kolečko vize ${a.vize}${produkt ? ` · severka ${produkt}` : ''}. Rozsah: ${rozsah}.`,
  'Běh je autonomní: uživatele se neptáš a vykonáváš jen svou fázi, další spouští workflow.',
  `Rozpor s vizí zapiš do docs/vize-spory.md s citací řádku vize a pokračuj; tvar záznamu a definici konzervativní volby má ${tvar}, sekce Vize-spory.`,
  'Obsahová, právní a etická rozhodnutí nejsou tvoje: udělej, co vize říká, a riziko zapiš jako otázku s navrženou odpovědí „ponechat“.',
  neCile ? `Ne-cíle vize platí pro každou fázi včetně oprav: ${neCile}` : '',
  rozhodnutiMajitele ? `Rozhodnutí majitele pro tento běh (závazná, mají přednost před vlastním výkladem vize): ${rozhodnutiMajitele}` : '',
  'Tah končí jen strukturovaným návratem podle schématu: textová pole stručně; co se nevejde, zapiš do souboru v docs/reviews/ (jen .md a .json) a vrať cestu.',
  `Společná pravidla agentů běhu (čekání na proces na pozadí, souběh ve sdíleném stromu, pojmenování souborů, čtení dokumentů po sekcích) a tvar dokumentů: ${tvar}; čti sekci Společná pravidla agentů a sekce své role (PRD a E2E, Vize-spory, Follow-ups, Čekání na čas).`,
  'docs/handoff.md je stav orchestrátora, ne tvůj vstup: nečti ho; co máš vědět, je v tomto zadání.',
  'Hranice: měníš jen soubory své role podle zadání; cizí soubory a rozpracovanou práci jiných agentů nevracíš (git checkout, restore, stash, clean; guard je blokuje) ani neformátuješ.',
].filter(Boolean).join('\n')
const M = { opusH: { model: 'opus', effort: 'high' }, opusM: { model: 'opus', effort: 'medium' }, sonL: { model: 'sonnet', effort: 'low' }, sonM: { model: 'sonnet', effort: 'medium' } }
const cisty = xs => [...new Set((xs || []).map(x => S(x).trim()).filter(Boolean))]
// Rozhodnutí nesou i objekty (prostředí, krok mimo Povolení, 1.8.0): deduplikace podle textu nebo JSON, objekty zůstávají.
const dedupR = xs => { const seen = new Set(); return (xs || []).filter(x => { const k = typeof x === 'string' ? x.trim() : x ? JSON.stringify(x) : ''; if (!k || seen.has(k)) return false; seen.add(k); return true }) }
// Osud položky follow-ups (§ 2.6, shodně se stavbou): rozhodnutí, oprava, jinak nápad; položka s osudem se nemění. Oblast doplní závěr.
const OSUDY = /^\[(rozhodnutí|oprava|nápad|obsah)\]/
const OSUD_ROZHODNUTI = /majitel|Povolení|rozhodnut/i
const OSUD_CESTA = /[\w.@-]+\/[\w.@/-]+\.[a-z0-9]{1,6}\b|\b[\w-]+\.(?:ts|tsx|js|mjs|cjs|py|astro|md|json|css|scss|sql|sh|toml|ya?ml)\b/i
// Tvar položky (review N8): `[kolečko · <oblast>] [<osud>] text`, osud vždy jako druhá značka; položku se značkou kolečka i osudem blok nemění.
const ZNACKA_KOLECKA = /^\[kolečko · [^\]]+\]\s*/
const oblastZ = soubory => { const seg = S(cisty((soubory || []).map(norm))[0]).split('/').filter(Boolean); return seg.length >= 3 ? seg.slice(0, 2).join('/') : seg[0] || '' }
const sOsudem = (text, o = {}) => {
  const t = S(text).trim(); if (!t) return t
  const soubory = o.soubory || []
  const osud = () => o.osud || (OSUD_ROZHODNUTI.test(t) ? 'rozhodnutí' : (soubory.length || OSUD_CESTA.test(t)) ? 'oprava' : 'nápad')
  const m = ZNACKA_KOLECKA.exec(t)
  if (m) { const zbytek = t.slice(m[0].length); return OSUDY.test(zbytek) ? t : `${m[0].trim()} [${osud()}] ${zbytek}` }
  const oblast = o.oblast || oblastZ(soubory) || 'obecné'
  return OSUDY.test(t) ? `[kolečko · ${oblast}] ${t}` : `[kolečko · ${oblast}] [${osud()}] ${t}`
}
const osudy = xs => cisty((xs || []).map(x => sOsudem(x)))
const norm = f => S(f).replace(`${cwd}/`, '')
// Cesty ze „soubor a symbol“ (zmenena_mista): část před dvojtečkou nebo mezerou, jen když vypadá jako cesta (lomítko nebo
// přípona). Commit podle souborů pozná, zda bezpečnostní oprava jde samostatným commitem; v revizi 1.4.0 dostal „soubor: symbol“.
const cestyZ = xs => cisty((xs || []).map(m => norm(S(m).trim()).split(/[\s:,;()]/)[0]).filter(x => /\//.test(x) || /\.[A-Za-z0-9]{1,8}$/.test(x)))

// ---------- schémata ----------
const str = d => ({ type: 'string', description: d })
const arr = d => ({ type: 'array', items: { type: 'string' }, description: d })
const idDuvod = (d, navic) => ({ type: 'array', items: { type: 'object', required: ['id', 'duvod'], properties: { id: { type: 'string' }, duvod: { type: 'string' }, ...navic } }, description: d })
const PREDAVKA = str(`jen absolutní cesta k TVÉ předávce (${cwd}/docs/reviews/predavka-<tvoje agent id>.md), když tě vyzvala zpráva PŘEDÁVKA a práce ještě není hotová; když je zadání hotové, nevyplňuj; cestu předávky předchůdce sem nikdy nevracej`)
const BALICKY = { type: 'array', items: { type: 'object', required: ['soubory', 'nalezy'], properties: { soubory: arr('disjunktní množina souborů'), nalezy: arr('identifikátory nálezů z reportu'), security: { type: 'boolean' } } } }
const THERMO = { type: 'object', required: ['blokeru', 'nalezu', 'report_path', 'soubory'], properties: { blokeru: { type: 'integer', description: 'nálezy, které rubrika označuje za blokující' }, nalezu: { type: 'integer' }, report_path: str('absolutní cesta k reportu'), soubory: arr('soubory s nálezy BLOCKER a HIGH, cesty relativní ke kořeni projektu'), napravy: { type: 'array', items: { type: 'object', required: ['id', 'soubory'], properties: { id: { type: 'string' }, soubory: arr('soubory, které náprava nálezu mění (nemusí to být soubor s nálezem), cesty relativní ke kořeni projektu') } }, description: 'jen nálezy BLOCKER a HIGH: kde leží jejich náprava' }, souhrn: str('max 3 řádky'), predavka: PREDAVKA } }
const FIX = { type: 'object', required: ['opraveno', 'opravene_ids', 'zmenena_mista', 'typecheck', 'testy_zelene'], properties: {
  opraveno: { type: 'integer' },
  // Bez seznamu opravených id blok nepozná, který FOLLOW-UP nález balíčku zůstal (běh web-rijen: follow-upy se ztrácely).
  opravene_ids: arr('identifikátory nálezů ze zadání, které jsi opravil'),
  odmitnuto: idDuvod('nálezy, které jsi po ověření neopravil, s důvodem', { blokuje: { type: 'boolean', description: 'nález byl BLOKUJE' } }),
  jinak_nez_nalez: arr('kde jsi opravil jinou příčinu, než nález tvrdil, a proč'),
  zmenena_mista: arr('soubor a symbol nebo oblast, kde jsi měnil'),
  rozsireny_zasah: { type: 'boolean', description: 'nový plošný mechanismus, sdílený layout či helper, nebo soubory mimo nálezy' },
  rozsireny_popis: str('co přesně a proč'),
  typecheck: { type: 'boolean' }, testy_zelene: { type: 'boolean' },
  follow_ups: arr('nálezy mimo rozsah, které jsi neopravil, jednou větou s kontextem'),
  spory: arr('nové záznamy ve vize-spory'),
  security: { type: 'boolean', description: 'true u bezpečnostní opravy (commitne ji krok commitu po zelené bráně)' },
  // Nový krok nad platformou z opravy po E2E (§ 2.4): bez opory v Povolení se nenasazuje a jde majiteli jako otázka.
  novy_krok_po_nasazeni: { type: 'array', items: { type: 'object', required: ['krok', 'duvod'], properties: { krok: { type: 'string' }, duvod: { type: 'string' }, opora: { type: 'string', description: 'doslovná citace řádku Povolení vize nebo rozhodnutí majitele, které krok dovoluje; bez opory nech prázdné' }, kriterium: { type: 'string', description: 'kritérium (značka s názvem), kvůli kterému krok vznikl' } } }, description: 'operace nad platformou nebo živým systémem, kterou oprava vyžaduje a scénář ji nejmenuje; sám ji neprováděj, nepřipravuj v konfiguraci ani nepiš do scénářů' },
  predavka: PREDAVKA,
} }
const REVIEW = { type: 'object', required: ['nalezu', 'blokujicich', 'balicky', 'report_path'], properties: {
  nalezu: { type: 'integer' }, blokujicich: { type: 'integer' }, report_path: str('absolutní cesta k reportu; prázdné, když nebyl nález'),
  balicky: BALICKY, follow_up_ids: arr('nálezy FOLLOW-UP'), metodika: str('jen bezpečnostní fáze: security-review | vlastní průchod | obojí'),
  predavka: PREDAVKA,
} }
// Brána (bod 5): exit kód a kontroly pre-commitu jsou povinné, zelenou rozhoduje zelena(); měřidla kritérií kolečko nemá.
const VERIFY = { type: 'object', required: ['typecheck', 'proslo', 'selhalo', 'exit_kod', 'kontroly_ok'], properties: {
  typecheck: { type: 'boolean' }, proslo: { type: 'integer' }, selhalo: { type: 'integer' },
  exit_kod: { type: 'integer', description: 'návratový kód příkazu testů' },
  z_cache: { type: 'boolean', description: 'true = runner vrátil výsledek testů nebo typechecku z cache, měření neproběhlo' },
  kontroly: arr('kontroly z pre-commit hooku projektu s výsledkem'), kontroly_ok: { type: 'boolean', description: 'všechny kontroly z pre-commit hooku prošly; true, když projekt pre-commit hook nemá' },
  selhavajici: arr('jména selhávajících testů a chyby typecheck s file:line, max 20'), vystup_path: str('soubor s plným výstupem'), prikazy: arr('spuštěné příkazy'), marker: str('hash stromu z verify-marker.sh při zelené bráně, jinak prázdné'),
  predavka: PREDAVKA,
} }
const DEPLOY = { type: 'object', required: ['stav', 'commit'], properties: {
  // Odklad nasazení (1.7.0, jako ve stavbě): okno nebo podmínka brání víc než ~30 min, kolečko zastaví s časem nejdriv.
  stav: { type: 'string', enum: ['success', 'failed', 'commit-only', 'odlozeno'] },
  nejdriv: str('jen při odlozeno: nejdřívější čas, kdy nasazení smí proběhnout, ISO 8601 s časovou zónou'),
  duvod: str('při failed nebo odlozeno: přesná chyba nebo důvod odkladu'),
  security_radkem: str('hash commitu, do jehož zprávy jsi dal řádek fix(security) (bezpečnostní oprava bez samostatného commitu); jinak prázdné'),
  commit: str('40 znaků: git rev-parse HEAD hned po vytvoření commitu (při stromu beze změn hash HEAD); nikdy dopočítaný ani zkrácený'),
  infra: { type: 'boolean', description: 'true = selhání mimo kód: přihlášení nebo účet CLI, oprávnění, výpadek platformy; opakování bez zásahu člověka nepomůže' },
  security_commity: arr('hashe samostatných commitů fix(security) z git rev-parse, nikdy dopočítané'),
  commit_zapisu: str('hash samostatného commitu zápisu nasazení kolečka'), report_path: str('absolutní cesta k zápisu nasazení kolečka'),
  health: str('první řádek „aplikace: <app>@<verze nebo deployment id> nasazeno | <app> nenasazeno (<důvod z diffu>) | …“ za každou aplikaci, které se diff od báze dotkl; pak doklad, že běží: status platformy + behaviorální doklad'), url: str(''), duvod: str('při failed: přesná chyba; při commit-only beze změn: „beze změn“'),
  // Dveře a dosah nasazení (§ 2.9), jako ve stavbě.
  dvere: { type: 'string', enum: ['jednosměrné', 'obousměrné'], description: 'jednosměrné, když nasazení nese migraci, zápis podle Povolení, odeslání zprávy, mazání nebo cokoli, co jeden revert nevrátí; jinak obousměrné' },
  dosah: str('jedno slovo: web | admin | data | zóna | platforma'),
  predavka: PREDAVKA,
} }
const SESTAV = { type: 'object', required: ['e2e_path', 'kriterii'], properties: { e2e_path: str('absolutní cesta k docs/e2e/kolecko.md'), kriterii: { type: 'integer' }, plochy: arr('plochy a toky, které scénáře pokrývají'), poznamka: str('co se nedalo pokrýt a proč'),
  rozhodnuti: arr('kritéria, která jsi nenapsal, protože Povolení vize výrobu jejich dat nepokrývá: co by měřila, co by bylo potřeba spustit, odhad hodin čekání na organická data (otázka pro majitele: rozšířit Povolení, nebo čekat)'), predavka: PREDAVKA } }
const E2E = { type: 'object', required: ['vysledek', 'celkem', 'pass', 'castecne', 'fail', 'report_path'], properties: {
  vysledek: { type: 'string', enum: ['pass', 'pass-castecne', 'fail', 'vada-kriteria', 'prostredi'] }, celkem: { type: 'integer' }, pass: { type: 'integer' }, castecne: { type: 'integer' }, fail: { type: 'integer' },
  fail_kriteria: { type: 'array', items: { type: 'object', required: ['kriterium', 'selhani'], properties: { kriterium: str('značka kritéria s názvem („AK3 Export bez prázdných řádků“)'), selhani: str('jednou větou co selhalo'), pricina_mimo_rez: { type: 'object', required: ['dukaz'], properties: { dukaz: str('důkaz, že příčina leží mimo kolečko: infrastruktura, cizí služba') } } } }, description: 'skutečná selhání' }, castecna_kriteria: arr('co se ověřilo jen zčásti a čím je nesena druhá půlka'),
  // Kritéria, která nejde změřit kvůli prostředí (§ 2.2), a vada nasazení (dorovnává deploy), jako ve stavbě.
  prostredi: { type: 'array', items: { type: 'object', required: ['kriterium', 'dukaz'], properties: { kriterium: str('značka kritéria s názvem'), sekce: str('sekce scénářů'), dukaz: str('příkaz, chybový text a čas: proč měření nejde provést kvůli prostředí (nestálá síť, chyba cizí služby, stanoviště je tento stroj proti produkci)'), navrh: str('navržená odpověď pro majitele: odkud měřit, nebo přijmout') } }, description: 'kritéria, která nejde změřit kvůli prostředí; do fail se nepočítají; bez důkazu je blok počítá jako FAIL' },
  prostredi_nasazeni: str('prázdné, když je nasazení v pořádku; jinak vada nasazení: nasazená revize není commit kolečka, aplikace nedostupná, přihlášení nefunguje'),
  vadna_kriteria: arr('kritéria (značka s názvem), která nejde poctivě vyhodnotit, s dokladem druhu: nesplnitelné v prostředí E2E / koliduje s jiným kritériem nebo Ne-cílem vize / nález je předřezový a mimo rozsah; do fail se nepočítají'),
  zavazne_mimo_ak: arr('bezpečnostní a datové nálezy mimo kritéria'), kosmeticke: arr('kosmetické regresní postřehy'), report_path: str('absolutní cesta k reportu'),
  predavka: PREDAVKA,
} }
const CLOSE = { type: 'object', required: ['ok', 'review_passed'], properties: {
  vysledek_soubor: str('cesta k docs/.vysledek-kolecko.json, když jsi ho zapsal; jinak prázdné'),
  ok: { type: 'boolean' }, review_passed: { type: 'boolean', description: 'docs/.review-passed existuje' }, poznamka: str('co se nepodařilo zapsat'),
  chybejici_commity: arr('bezpečnostní commity ze zadání, u kterých git cat-file -t nevrátil commit'),
  predavka: PREDAVKA,
} }

// ---------- stav ----------
const st = {
  thermo: null, review: { kolo1: null }, security: { nalezu: 0, blokujicich: 0, commity: [], radkem: [] }, verify: null, deploy: null, e2e: null,
  commity: [], rozhodnuti: [], follow_ups: [], spory: [], odmitnute: [], jinak: [], chybejici: [], reports: [], review_passed: false, vysledekSoubor: '',
  dluh: { polozek: 0, opraveno: 0, odmitnuto: 0 }, dluhOpravene: [], prostredi: [],
}
// Odmítnutý nález BLOKUJE nese značku, ať ho journal odliší od pohodlného odmítnutí drobnosti (třída H).
const sber = r => { if (!r) return; st.follow_ups.push(...(r.follow_ups || [])); st.spory.push(...(r.spory || [])); st.odmitnute.push(...(r.odmitnuto || []).map(o => `${S(o.id)}${o.blokuje ? ' [BLOKUJE]' : ''}: ${S(o.duvod)}`)); st.jinak.push(...(r.jinak_nez_nalez || [])) }
// Commit krok i deploy vracejí hlavní commit a samostatné bezpečnostní commity (bod 19: fix agenti už necommitují).
// Bezpečnostní oprava řádkem fix(security) v commitu kolečka (soubory nesou i jinou změnu): hash jde do návratu (1.7.0, jako ve stavbě).
const sberRadkem = c => { const h = S(c && c.security_radkem).trim(); if (h && !st.security.radkem.includes(h)) st.security.radkem.push(h) }
const sberCommit = c => { if (!c) return; if (c.commit && c.duvod !== 'beze změn') st.commity.push(c.commit); if (S(c.commit_zapisu).trim()) st.commity.push(S(c.commit_zapisu).trim()); st.security.commity.push(...(c.security_commity || [])); sberRadkem(c) }
// Commit nebo deploy, který skončil failed, mohl před pádem vytvořit fix(security) commity: hashe jdou do návratu i z neúspěšného
// kroku, jinak je obnova commitne podruhé (revize 1.4.0). Hlavní commit ne: u failed je to jen HEAD, ne commit kolečka.
const sberSecurity = c => { if (c) { st.security.commity.push(...cisty(c.security_commity)); sberRadkem(c) } }
const zmenilo = f => !!f && (f.opraveno > 0 || (f.zmenena_mista || []).length > 0)
// Kam oprava sáhla: 'kod' (apps, packages, nebo cesty nejdou určit), 'mimo' (jen jiné soubory), 'nic' (bez změny nebo bez výsledku).
// 'kod' (apps, packages, nebo cesty nejdou určit) bránou a nasazením, 'mimo' (jiný kód mimo docs/) bránou a commitem, 'docs' commitem.
// Gitignorovaný report v docs/reviews/ není změna stromu (1.7.0, jako ve stavbě).
const zasahOpravy = f => {
  if (!zmenilo(f)) return 'nic'
  const vse = cestyZ(f.zmenena_mista)
  const c = vse.filter(x => !/^docs\/reviews\//.test(x))
  if (vse.length && !c.length) return 'nic'
  if (!c.length || c.some(x => /^(apps|packages)\//.test(x))) return 'kod'
  return c.every(x => /^docs\//.test(x)) ? 'docs' : 'mimo'
}
const zapisDeploy = d => ({ stav: d.stav, commit: d.commit, ...(S(d.commit_zapisu).trim() ? { commit_zapisu: S(d.commit_zapisu).trim() } : {}), ...(S(d.dvere).trim() ? { dvere: S(d.dvere).trim(), dosah: S(d.dosah).trim().slice(0, 40) } : {}) })
// FOLLOW-UP nálezy review (1.6.0, jako ve stavbě): mimo balíčky jdou rovnou do follow-upů; v balíčcích se opravují a do follow-upů jde
// ten, který fix neopravil ani neodmítl (opravene_ids je povinné, chybějící id = neopraveno), a odmítnutý s důvodem.
const fuMapa = rs => new Map(rs.filter(Boolean).map(r => [S(r.report_path), new Set(cisty(r.follow_up_ids))]))
const followMimoBalicky = rs => {
  for (const r of rs.filter(Boolean)) {
    const vBalicku = new Set((r.balicky || []).flatMap(b => cisty(b.nalezy)))
    for (const id of cisty(r.follow_up_ids)) if (!vBalicku.has(id)) st.follow_ups.push(sOsudem(`${id} (FOLLOW-UP z ${S(r.report_path)})`, { oblast: 'review', osud: 'oprava' }))
  }
}
const followZOprav = (dvojice, fu) => {
  for (const { f, b } of dvojice) for (const z of b.zdroje) {
    const mnozina = fu.get(z.report) || new Set()
    for (const id of z.ids.filter(x => mnozina.has(x))) {
      const odm = f && (f.odmitnuto || []).find(o => o && S(o.id).trim() === id)
      const fu = t => st.follow_ups.push(sOsudem(t, { soubory: b.soubory, oblast: oblastZ(b.soubory) || 'review', osud: 'oprava' }))
      if (!f) fu(`${id} (FOLLOW-UP z ${z.report}; fix balíčku nevrátil výsledek)`)
      else if (odm) fu(`${id} (FOLLOW-UP z ${z.report}; fix odmítl: ${S(odm.duvod).slice(0, 300)})`)
      else if (!cisty(f.opravene_ids || []).includes(id)) fu(`${id} (FOLLOW-UP z ${z.report}; fix ho neopravil)`)
    }
  }
}
// Výsledek pod 6 000 znaků (1.7.0): v běhu sonnet-5-5 měl výsledek kolečka 8,3 k, runtime ho usekl a orchestrátor dočítal .output.
// Po závěru jdou seznamy jen počtem a cestou (plné znění zapsal závěr do docs/.vysledek-kolecko.json); před závěrem celé, a když se
// nevejdou, zkrátí je doLimitu s logem.
const LIMIT_NAVRATU = 5800
// Zkracují se i texty kritérií E2E (vadná a částečná, revize 1.7.0 code-review N5): dlouhé doklady vadných kritérií by jinak nechaly
// návrat nad limitem bez logu. Vadná kritéria E2E se ubírají dřív než rozhodnutí, která nesou totéž s návrhem odpovědi.
const doLimitu = r => {
  const delka = () => JSON.stringify(r).length
  if (delka() <= LIMIT_NAVRATU) return r
  const e2eSez = k => ({ get: () => r.e2e && Array.isArray(r.e2e[k]) ? r.e2e[k] : null, set: v => { r.e2e = { ...r.e2e, [k]: v } } })
  const SEZ = [
    ...['reports', 'odmitnute', 'spory'].map(k => [k, { get: () => Array.isArray(r[k]) ? r[k] : null, set: v => { r[k] = v } }]),
    ['e2e.castecna_kriteria', e2eSez('castecna_kriteria')], ['e2e.vadna_kriteria', e2eSez('vadna_kriteria')],
    ...['follow_ups', 'rozhodnuti'].map(k => [k, { get: () => Array.isArray(r[k]) ? r[k] : null, set: v => { r[k] = v } }]),
  ]
  for (const [, x] of SEZ) { const xs = x.get(); if (xs) x.set(xs.map(y => typeof y === 'string' && y.length > 240 ? `${y.slice(0, 239)}…` : y)) }
  const ubrano = {}
  for (const [k, x] of SEZ) {
    if (delka() <= LIMIT_NAVRATU) break
    const xs = x.get()
    if (!xs || !xs.length) continue
    const zbyva = [...xs], pryc = []
    while (zbyva.length && (x.set(zbyva), delka() > LIMIT_NAVRATU - 80)) pryc.unshift(zbyva.pop())
    x.set(zbyva)
    if (pryc.length) { ubrano[k] = pryc.length; log(`návrat nad limitem: ${k} bez ${pryc.length} položek: ${pryc.join(' | ').slice(0, 1500)}`) }
  }
  if (delka() > LIMIT_NAVRATU && S(r.detail).length > 600) { log(`návrat nad limitem: detail zkrácen na 600 znaků: ${S(r.detail).slice(0, 1500)}`); r.detail = `${S(r.detail).slice(0, 599)}…`; ubrano.detail = 1 }
  if (Object.keys(ubrano).length) r.zkraceno = ubrano
  if (delka() > LIMIT_NAVRATU) log(`návrat kolečka zůstal nad limitem (${delka()} znaků > ${LIMIT_NAVRATU}): runtime ho může useknout, plné seznamy jsou v docs/.vysledek-kolecko.json, když závěr proběhl`)
  return r
}
const navrat = (vysledek, faze, detail, x = {}) => doLimitu({
  ok: true, vysledek, faze: faze || '', detail: S(detail).slice(0, 1500),
  ...(vysledek !== 'hotovo' ? { obnova_od: OBNOVA_OD[faze] || 'thermo' } : {}),
  ...(faze === 'deploy-infra' ? { infra: true } : {}),
  ...x,
  thermo: st.thermo, review: st.review,
  security: { nalezu: st.security.nalezu, blokujicich: st.security.blokujicich, commity: cisty(st.security.commity).filter(h => !st.chybejici.includes(h)) },
  ...(st.security.radkem.length ? { security_radkem: cisty(st.security.radkem) } : {}),
  verify: st.verify, deploy: st.deploy, e2e: st.e2e,
  commity: cisty([...st.commity, ...st.security.commity]).filter(h => !st.chybejici.includes(h)), chybejici_commity: cisty(st.chybejici),
  rozhodnuti: dedupR(st.rozhodnuti), spory: cisty(st.spory), review_passed: st.review_passed, predavky: predavekCelkem, dluh: st.dluh, prostredi: dedupR(st.prostredi),
  ...(st.vysledekSoubor
    ? { follow_ups_pocet: osudy(st.follow_ups).length, odmitnute_pocet: cisty(st.odmitnute).length, reports_pocet: cisty(st.reports).length, vysledek_soubor: st.vysledekSoubor }
    : { follow_ups: osudy(st.follow_ups), odmitnute: cisty(st.odmitnute), reports: cisty(st.reports) }),
})
const selhani = (faze, detail) => { log(`kolečko selhalo ve fázi ${faze}: ${S(detail).slice(0, 200)}`); return navrat('selhalo', faze, detail) }
// Selhání deploye mimo kód (přihlášení CLI, oprávnění, výpadek platformy) zastaví běh jako deploy-infra: oprava kódu nepomůže, čeká se na člověka.
// Odklad nasazení (1.7.0) není selhání: kolečko zastaví s časem nejdriv a orchestrátor ho na nejdriv obnoví od fáze deploy.
const selhaniDeploye = (d, k, pred = '') => {
  sberSecurity(d)
  // Odklad bez platného času nejdriv (revize 1.7.0, jako ve stavbě) nemá na kdy naplánovat obnovu: zastaví jako infra selhání.
  if (d && d.stav === 'odlozeno' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(S(d.nejdriv).trim())) {
    log(`deploy kolečka vrátil odklad bez platného nejdriv („${S(d.nejdriv).trim()}“): zastaví jako infra selhání, obnovu nemá na kdy naplánovat`)
    return selhani('deploy-infra', `${pred}odklad bez platného nejdriv (${S(d.nejdriv).trim() || 'prázdné'}): ${S(d.duvod) || 'bez důvodu'}`)
  }
  if (d && d.stav === 'odlozeno') {
    const nejdriv = S(d.nejdriv).trim()
    log(`kolečko zastaveno: nasazení odloženo${nejdriv ? ` do ${nejdriv}` : ''} (${S(d.duvod).slice(0, 160)}); čeká na obnovu od fáze deploy`)
    return navrat('zastaveno', 'deploy-odklad', `${pred}${S(d.duvod) || 'odklad nasazení'}`, { nejdriv })
  }
  return selhani(d && d.infra ? 'deploy-infra' : 'deploy', `${pred}${d ? S(d.duvod) : nic(`deploy:kolečko:${k}`, 'deploy agent')}`)
}

// ---------- kroky ----------
const thermo = () => runSePredavkou(`${ramec}

Úkol: thermo-nuclear review celé větve vize (rozsah větev, base ${base}; diff si posbírej sám). Report do ${rep('thermo')}. Vrať počty, cestu, soubory s nálezy BLOCKER a HIGH a u každého takového nálezu soubory jeho nápravy v napravy (relativně ke kořeni projektu). Žádné plošné přestavby na konci vize: co je velké jako řez, označ NOTE jako kandidáta na příští vizi.${standardy}`,
  { label: 'thermo:kolečko', phase: 'Thermo', agentType: 'dev-pipeline:thermo-nuclear-review', schema: THERMO, ...M.opusM })

// Soubory s nálezy BLOCKER/HIGH a soubory jejich náprav: náprava strukturálního nálezu často leží jinde než nález (běh web-podzim).
const thermoSoubory = th => cisty([...(th.soubory || []), ...(th.napravy || []).flatMap(x => (x && x.soubory) || [])].map(norm))
const fixThermo = th => runSePredavkou(`${ramec}

Úkol: oprav strukturální nálezy thermo review kolečka: ${th.report_path}. Meze: jen nálezy BLOCKER a HIGH, jen soubory ${thermoSoubory(th).join(', ') || 'z reportu'} (soubory s nálezy a soubory jejich náprav); NOTE a plošné přestavby nech jako follow-up. Nezaváděj nové plošné mechanismy. Spouštěj jen dotčené testy a typecheck${rychleText}; plnou suitu nespouštěj, patří bráně. Každý nález je hypotéza: ověř proti kódu. Necommituj.${standardy}`,
  { label: 'fix-thermo:kolečko', phase: 'Thermo', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

const review1 = () => runSePredavkou(`${ramec}

Úkol: code-review kolečka, kolo 1, rozsah větev (base ${base}), všechny osy. Report do ${rep('code-review', 'kolo-1')}. Vrať počty, disjunktní balíčky po souborech s identifikátory nálezů a cestu; nálezy samotné nevracej. Každý nález v reportu nese BLOKUJE NASAZENÍ nebo FOLLOW-UP a CONFIRMED nebo PLAUSIBLE.${standardy}`,
  { label: 'review:kolečko:1', phase: 'Code-review 1', agentType: 'dev-pipeline:code-review', schema: REVIEW, ...M.opusH })

const secCocka = () => runSePredavkou(`${ramec}

Úkol: bezpečnostní review kolečka nad celou větví (base ${base}) plus pracovní strom, čočka „bezpecnost“ do hloubky, ostatní osy přeskoč. Checklist navíc: (1) u multi-tenant projektu projdi VŠECHNY dotčené routy, joby a nástroje, ne jen nové: autorizace, izolace organizace i přes join na rodiče, soft-delete; (2) jednořádkový sweep \`rg\` na známé rizikové vzory projektu z CLAUDE.md (přímé dotazy mimo kanonický helper, tokeny v logu nebo URL, secrets v kódu, vstupní hranice bez validace) nad celým repem; (3) pre-existing nález mimo diff platí a označ ho. Report do ${rep('security', 'cocka')}. Vrať počty, disjunktní balíčky po souborech (security: true), cestu; metodika: „vlastní průchod“.${standardy}`,
  { label: 'security:kolečko:čočka', phase: 'Bezpečnost', agentType: 'dev-pipeline:code-review', schema: REVIEW, ...M.opusH })

const secSkill = () => runSePredavkou(`${ramec}

Úkol: druhá bezpečnostní metodika kolečka nad \`git diff ${base}...HEAD\` plus pracovní strom. Nejdřív zkus invokovat skill \`security-review\` nástrojem Skill; když není k dispozici nebo je odmítnut (disable-model-invocation), udělej ekvivalentní průchod sám: injekce (SQL, příkazy, šablony), autentizace a autorizace, únik dat a PII, nebezpečná deserializace, SSRF, secrets, závislosti. Každý nález ověř proti kódu a napiš scénář selhání; nejistý nález se scénářem nezahazuj, hlas ho jako PLAUSIBLE. Report do ${rep('security', 'review')} ve tvaru „N1 cesta:řádek — [CONFIRMED|PLAUSIBLE] [BLOKUJE|FOLLOW-UP] [security] popis / Selhání: …“; když nic nenajdeš, report nepiš a vrať nula nálezů. Vrať počty, disjunktní balíčky po souborech (security: true), cestu a metodika: „security-review“ nebo „vlastní průchod“. Kód needituješ, podagenty nespouštíš.${standardy}`,
  { label: 'security:kolečko:security-review', phase: 'Bezpečnost', agentType: 'general-purpose', schema: REVIEW, ...M.opusH })

// Každá opravná vlna kolečka je poslední, po ní už review není (třída B): v neověřené poslední várce deník naměřil nejvyšší chybovost oprav.
const POSLEDNI_VARKA = 'Poslední várka, po ní už review není. Oprav zúžením. Nový mechanismus ani změnu rozhodovací logiky nedělej, nahlas je jako follow-up nebo rozhodnutí. Odložení je plnohodnotný výsledek.'
const fixBalicek = (faze, zdroje, b, i) => runSePredavkou(`${ramec}

Úkol: oprav nálezy kolečka (${faze}). ${zdroje.map(z => `Report ${z.report}: nálezy ${z.ids.join(', ') || 'všechny ve tvých souborech'}`).join(' · ')}. Sahej jen do souborů: ${b.soubory.join(', ')}; jiné soubory mohou souběžně opravovat jiní agenti. Root brána může být červená na cizích souborech, ověř svůj balíček. Spouštěj jen dotčené testy a typecheck${rychleText}; plnou suitu nespouštěj, patří bráně a souběžné agenty by vyhladověla. ${b.security ? 'Jde o bezpečnostní balíček: oprav celý hned, i pre-existing. Necommituj; bezpečnostní opravu commitne krok commitu po zelené bráně samostatně.' : 'Necommituj.'} Každý nález je hypotéza: ověř proti kódu; co míří vedle, oprav skutečnou příčinu a rozdíl uveď v jinak_nez_nalez; co neplatí, odmítni s důvodem. Identifikátory nálezů, které jsi opravil, vrať v opravene_ids. Žádné plošné přestavby na konci vize. Nahlas rozšířený zásah, když překročí nálezy. ${POSLEDNI_VARKA}${standardy}`,
  { label: `fix:kolečko:${faze}:${i + 1}`, phase: fazeTitul(faze), agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })
const fazeTitul = faze => faze === 'thermo' ? 'Thermo' : faze === 'kolo 1' ? 'Code-review 1' : faze === 'dluh' ? 'Dluh' : 'Bezpečnost'

// Zelená jen nad doloženým měřením: exit kód testů 0, aspoň jeden prošlý test, nic z cache a kontroly pre-commitu (v běhu bez-dluhu
// pustila brána zelenou nad neproběhlou suitou a commit pak padl na kontrolu pre-commitu, kterou brána nespustila). Měřidla kolečko nemá.
const zelena = v => !!v && v.typecheck === true && v.selhalo === 0 && v.exit_kod === 0 && v.proslo > 0 && v.z_cache !== true && v.kontroly_ok !== false && v.meridla_ok !== false
// Proč je brána červená, stejným výčtem jako zelena(): jde do logu, do opravy brány i do detailu selhání.
const proc = v => [
  v.typecheck !== true && 'typecheck s chybami',
  v.selhalo !== 0 && `selhalo ${S(v.selhalo) || '?'} testů`,
  v.exit_kod !== 0 && `exit kód testů ${S(v.exit_kod) || '?'}`,
  !(v.proslo > 0) && 'žádný prošlý test',
  v.z_cache === true && 'výsledek z cache (spusť s --force)',
  v.kontroly_ok === false && 'kontroly pre-commitu neprošly',
].filter(Boolean).join(', ')
const verify = (faze, k, ph) => { const vystup = rep('verify', faze.replace(/\s+/g, '-'), k); return runSePredavkou(`${ramec}

Úkol: brána kolečka po fázi „${faze}“, běh ${k}: spusť typecheck a testy projektu podle CLAUDE.md${runbook ? ` (nebo runbooku ${runbook})` : ''}, každý příkaz s výstupem přesměrovaným do souboru a návratovým kódem čteným zvlášť (\`cmd > log 2>&1; echo EXIT=$?\`), nikdy přes rouru; plný výstup ulož do ${vystup}. Spusť i kontroly, které spouští pre-commit hook projektu (.husky/pre-commit, .git/hooks/pre-commit nebo lefthook; seznam si přečti z hooku), kromě plné suity, kterou už spouštíš, a vrať je v kontroly. Vrať skutečné výsledky (exit kód, počty, jména selhávajících testů, chyby s file:line). Nic neopravuj a neinterpretuj.${a.plugin_root ? ` Když je brána zelená (typecheck bez chyb, exit kód testů 0, aspoň jeden prošlý a žádný selhaný test, kontroly pre-commitu prošly), spusť \`bash ${a.plugin_root}/scripts/verify-marker.sh ${cwd} ${vystup}\` a jeho výstup (hash stromu) vrať v poli marker; při červené bráně marker nezapisuj.` : ''}${obnovaVeta(ph)}`,
  { label: `verify:kolečko:${faze}:${k}`, phase: ph, agentType: 'dev-pipeline:verify', schema: VERIFY, ...M.sonL }) }

// Oprava brány patří k bráně: při obnově nese značku i ona, jinak by se nad stejným selháním vrátila z cache bez opravy.
// Hranice opravy (1.6.0): v běhu web-rijen fix brány mini-řezu 12 „opravil“ selhání eslintu na gitignorovaném pomocném skriptu výjimkou
// ve sdíleném eslint.config.js. Kolečko smí jen soubory, které změnila vize nebo kolečko.
const fixBrana = (faze, v, ph) => runSePredavkou(`${ramec}

Úkol: brána kolečka po fázi „${faze}“ je červená (${proc(v)}). Selhává: ${(v.selhavajici || []).slice(0, 20).join(' | ') || 'viz výstup'}${v.kontroly_ok === false ? ` · kontroly pre-commitu: ${(v.kontroly || []).slice(0, 10).join(' | ') || 'viz výstup'}` : ''}${v.vystup_path ? ` · plný výstup: ${v.vystup_path}` : ''}. Hranice opravy: soubory, které změnila vize nebo kolečko (git diff --name-only ${base}...HEAD a pracovní strom), a jejich testy; změnu mimo ni udělej jen tehdy, když bez ní brána nejde opravit, a nahlas ji jako rozšířený zásah. Selhání na gitignorovaném souboru mimo diff vize není vada kolečka: soubor odstav (přejmenuj mimo dosah kontroly nebo smaž, když je to tvůj pomocný soubor), sdílenou konfiguraci (eslint, tsconfig, prettier, CI) neměň. Oprav příčinu (ne test, pokud test není špatně); když suita neproběhla (žádný prošlý test nebo nenulový exit kód bez selhaného testu), hledej příčinu v jejím spuštění, ne v testech. Po opravě spusť dotčené testy a typecheck${rychleText}, plnou suitu pustí znovu brána. Necommituj.${standardy}${obnovaVeta(ph)}`,
  { label: `fix-brana:kolečko:${faze}`, phase: ph, agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

// Bod 19 (třída D1): bezpečnostní opravy commitne až krok commitu po zelené bráně, samostatně a před ostatními změnami.
// Fix agent, který commitoval uprostřed souběžné vlny, narazil v bez-dluhu dvakrát na pre-commit nad rozdělanou prací ostatních.
const bezpecnostniOpravy = xs => (xs || []).length ? ` Bezpečnostní opravy: ${xs.map(o => `${o.popis}${o.soubory.length ? ` (${o.soubory.join(', ')})` : ''}`).join(' · ').slice(0, 2000)}. Před commitem ostatních změn je commitni samostatně zprávou fix(security): …, když jejich soubory nenesou jinou změnu (git diff souboru ukáže jen opravu); jinak přidej do zprávy commitu kolečka řádek fix(security): … a hash toho commitu vrať v security_radkem. Hashe samostatných bezpečnostních commitů vrať v security_commity.` : ''
const commit = (faze, zprava, ph, secOpravy) => runSePredavkou(`${ramec}

Úkol: commit změn kolečka po fázi „${faze}“, režim commit-only.${bezpecnostniOpravy(secOpravy)} Jeden commit na vize větvi se zprávou „${zprava}“ se zbylými změnami kolečka (kód, testy, docs/e2e/kolecko.md, docs/journal.md, docs/follow-ups.md, docs/vize-spory.md). docs/reviews/ a markery jsou gitignorované. Když pracovní strom nemá co commitnout, necommituj a vrať stav commit-only, hash HEAD a duvod „beze změn“. Nenasazuj. Po commitu zkontroluj git status a netrackované soubory kolečka jmenuj v návratu.${obnovaVeta(ph, true)}`,
  { label: `commit:kolečko:${faze}`, phase: ph, agentType: 'dev-pipeline:deploy', schema: DEPLOY, ...M.sonM })

// Kolečko zapisuje nasazení jako stavba (1.6.0): bez zápisu bral další deploy bázi diffu z posledního zápisu řezu a řez 11 v běhu
// web-rijen nasadil API a admin znovu.
const zapisNasazeni = `${cwd}/docs/e2e/kolecko-nasazeni.md`
// Odklad nasazení (1.7.0, shodně s blokem stavby a deploy.md): stav odlozeno s časem nejdriv místo čekání přes noc nebo infra selhání.
const ODKLAD = 'Když nasazení podle zakázaného okna, runbooku nebo pokynů majitele nesmí proběhnout dřív než za ~30 minut (včetně rezervy okna), dál nic nenasazuj a vrať stav odlozeno s nejdriv (ISO 8601 s časovou zónou) a duvod; commit kolečka smí proběhnout (vrať ho v commit). Odklad není infra selhání; kratší čekání počkej.'
const deploy = (k, pozn, secOpravy, noveKroky = []) => runSePredavkou(`${ramec}

Úkol: nasazení kolečka (běh ${k}).${bezpecnostniOpravy(secOpravy)} Nejdřív commit zbylých změn na vize větvi, když nějaké jsou: „kolecko: ${pozn}“. ${!runtimeDopad ? 'Projekt nasazuje uživatel: skonči commitem (nebo hashem HEAD při stromu beze změn), stav commit-only.' : `Deploy podle deploy konfigurace projektu${runbook ? ` (runbook: ${runbook})` : ' (sekce Deploy v CLAUDE.md projektu nebo docs/deploy.md)'}: marker docs/.deploy-unlocked vytvoř samostatným příkazem před deployem, počkej na terminální stav platformy (SUCCESS/FAILED/CRASHED) a vrať dva nezávislé doklady, že běží. Co nasadit, urči podle git diff --stat <báze>..HEAD -- apps packages a importů změněných balíčků, nikdy podle diffu jednoho commitu: báze je poslední commit se zprávou „zápis nasazení“ (git log --grep 'zápis nasazení' -1 --format=%H), když žádný není, git merge-base HEAD ${base}; nasaď každou aplikaci, které se diff dotkl (i tu, kterou řez nenasadil), a pole health začni řádkem „aplikace: <app>@<verze nebo deployment id> nasazeno | <app> nenasazeno (<důvod z diffu>) | …“. Zápis nasazení kolečka (čas, commit, co se nasadilo, doklady; další nasazení kolečka připiš pod předchozí) zapiš do ${zapisNasazeni} a commitni ho samostatně zprávou „kolecko: zápis nasazení“ až po commitu kolečka; vrať report_path a commit_zapisu. Do zápisu přidej řádek „Dveře: jednosměrné | obousměrné · Dosah: <web | admin | data | zóna | platforma>“ (jednosměrné, když nasazení nese migraci, zápis podle Povolení, odeslání zprávy, mazání nebo cokoli, co jeden revert nevrátí) a totéž vrať v dvere a dosah.${noveKroky.length ? ` Oprava po E2E vyžaduje nový krok po nasazení s oporou v Povolení: ${noveKroky.map(kr => `${kr.krok} (důvod: ${kr.duvod}; opora: ${kr.opora})`).join(' | ').slice(0, 1200)}; proveď ho po nasazení v mezích citované opory a uveď ho v zápisu nasazení.` : ''} Pole commit je commit kolečka, ne commit zápisu. ${deployOkno ? `Zakázané okno nasazení: ${deployOkno}; když do něj spadáš, počkej do jeho konce a ještě 10 minut rezervy, jen když to celé trvá nejvýš ~30 minut; jinak odklad (níže).` : 'Zakázané okno nasazení z runbooku respektuj s rezervou deseti minut.'} ${ODKLAD}${appPristup ? ` Pokyny majitele k prostředí a nasazení jsou závazné a mají přednost před skripty repa (skript, který nasazuje jinam nebo jinak, než pokyny říkají, nepoužij nebo doplň o správné parametry): ${appPristup.slice(0, 1200)}.` : ''}`} Formátovací kontrolu pouštěj jen nad soubory, které commituješ. Nikdy si nedomýšlej postup, který projekt nedokumentuje.${obnovaVeta('Deploy a E2E', true)}`,
  { label: `deploy:kolečko:${k}`, phase: 'Deploy a E2E', agentType: 'dev-pipeline:deploy', schema: DEPLOY, ...M.sonM })

// Sdílené pravidlo čekání na čas (spec 1.7.0 § 1.1, doslova): v běhu sonnet-5-5 napsal autor scénářů kolečka K16 a K17 vědomě jako
// neměřitelná („spustit běh zakazuje Ne-cíl“), ačkoli majitel povolil ruční běhy, aby se nečekalo.
const CEKANI_NA_CAS = '**Čekání na čas.** Kritérium, krok nebo scénář, který potřebuje data vznikající časem (provoz, plánované úlohy, činnost uživatelů, den, noc), změří běh nad daty, která sám vyrobí podle Povolení vize (ruční spuštění, testovací data, kratší okno), hned po nasazení. Na organický čas běh čeká jen tam, kde to vize výslovně vede jako rozhodnutí majitele s odhadem, o kolik hodin se běh prodlouží. Když Povolení výrobu dat nepokrývá, kritérium není „nesplnitelné v prostředí E2E“: je to otázka pro majitele (rozšířit Povolení, nebo čekat).'
const sestavE2E = () => runSePredavkou(`${ramec}

Úkol: sestav E2E scénáře kolečka do ${e2ePath}. Zdroje: commity kolečka (\`git log ${base}..HEAD --oneline\`, commity se zprávou „kolecko:“ a „fix(security):“ od začátku kolečka) s jejich \`--stat\`, reporty ${cisty(st.reports).slice(-8).join(', ') || 'kolečka'} (jen sekce opravených nálezů) a tail docs/journal.md. Pravidla kritérií podle ${a.plugin_root ? `${a.plugin_root}/agents/prd.md` : 'agenta prd pluginu dev-pipeline'} (sekce Akceptační kritéria a E2E scénáře): každé kritérium na viditelném chování, záporné kritérium jmenuje šev, u čísel dotaz k přepočtu místo holé hodnoty, žádné výčty jmen souborů ani opsaná čísla, žádné kritérium závislé na commitu. Pokryj: každou opravu kolečka s dopadem na uživatele nebo data (regrese) a smoke průchod ploch, kterých se vize dotkla (z journalu), nejvýš 20 kritérií. Když kolečko nezměnilo kód, napiš jen smoke průchod do 5 kritérií. Kritéria čísluj AK1, AK2 … (nikdy K: K jsou části řezu) a každé začni názvem do 6 slov: „**AKn Název.** …“. ${CEKANI_NA_CAS} Povolení si přečti ze sekce „Mantinely a Povolení“ vize ${a.vize}. Kritérium nad populací, která vzniká časem (běhy plánovaných úloh, provoz, činnost uživatelů), buď vyrobí ve scénáři přípravný krok po nasazení kolečka ručním během podle Povolení (citace Povolení, počet běhů, odhad doby), nebo ho nenapiš a vrať v rozhodnuti s důvodem; za neměřitelné ho nikdy nepiš. Nic jiného needituj.`,
  { label: 'e2e-scénáře:kolečko', phase: 'Deploy a E2E', agentType: 'general-purpose', schema: SESTAV, ...M.opusM })

const e2e = (k, failKola1) => runtimeDopad
  ? runSePredavkou(`${ramec}

Úkol: E2E verifikace kolečka, kolo ${k}: projdi scénáře z ${e2ePath} proti běžící aplikaci${appPristup ? ` (přístup: ${appPristup})` : ' (přístup podle CLAUDE.md projektu)'}${failKola1 ? `. Kolo 2 po opravě: přeměř VÝHRADNĚ kritéria, která v kole 1 selhala: ${failKola1.join(' | ')}; u ostatních jen ověř, že se jejich plocha načte bez chyby (smoke), verdikty z kola 1 nepřeměřuj; celkem = počet přeměřených kritérií, smoke selhání vrať ve fail_kriteria s předponou „smoke:“` : ''}, verdikt per kritérium PASS / PASS-částečně / FAIL s důkazy do reportu ${rep('e2e', k)}. Neověřuješ kód: nezakládej worktree, nic neinstaluj, nespouštěj testy ani typecheck. Prohlížeč bez okna (bez --headed), na konci agent-browser close. Nasazení není tvoje fáze: nic nenasazuješ a handoff nečteš; když nasazená revize není commit kolečka (shodu uznej i u pozdějšího commitu, který od něj mění jen docs/) nebo přihlášení nefunguje, vrať to v prostredi_nasazeni a kritéria neměř. Čísla přepočítej sám dotazem ze scénáře, nikdy je nepřebírej z journalu ani z reportů. Kritérium, které nejde poctivě vyhodnotit (nesplnitelné v prostředí E2E, koliduje s jiným kritériem nebo Ne-cílem vize, nález je předřezový a mimo rozsah), dej do vadna_kriteria s dokladem druhu; do fail ho nepočítej. Kritérium, jehož měření nejde provést kvůli prostředí (nestálá síť, chyba cizí služby, měřicí stanoviště je tento stroj proti produkci), vrať hned v tomto kole v prostredi s důkazem a návrhem (odkud měřit, nebo přijmout), ne jako FAIL. Vrať jen počty, FAIL, částečná a vadná kritéria, závažné nálezy mimo kritéria (bezpečnost, data) zvlášť od kosmetických. Testovací data s prefixem [E2E], po sobě ukliď.${obnovaVeta('Deploy a E2E')}`,
    { label: `e2e:kolečko:${k}`, phase: 'Deploy a E2E', agentType: 'dev-pipeline:e2e-verifier', schema: E2E, ...M.opusM })
  : runSePredavkou(`${ramec}

Úkol: kolečko nemá runtime dopad (projekt nasazuje uživatel). Projdi kritéria z ${e2ePath} bod po bodu a každé dolož konkrétním důkazem (výstup příkazu, existence a obsah souboru, spuštěný test), verdikt per kritérium do ${rep('e2e', k)}. Kritérium, které nejde poctivě vyhodnotit, dej do vadna_kriteria s dokladem druhu, do fail ho nepočítej. Dočasné artefakty po sobě ukliď, pracovní strom nech čistý. Vrať jen počty, FAIL, částečná a vadná kritéria.${obnovaVeta('Deploy a E2E')}`,
    { label: `kriteria:kolečko:${k}`, phase: 'Deploy a E2E', agentType: 'general-purpose', schema: E2E, ...M.opusM })

const fixE2E = (e, k) => runSePredavkou(`${ramec}

Úkol: E2E kolečka selhalo (kolo ${k}): report ${e.report_path}, FAIL kritéria: ${(e.fail_kriteria || []).join(' | ') || `${e.fail} bez jmen, viz report`}. Každý nález je hypotéza: reprodukuj, oprav příčinu, testy a typecheck zelené. Operaci nad platformou nebo živým systémem, kterou oprava vyžaduje a scénář ji nejmenuje, sám neprováděj ani nepřipravuj v konfiguraci: vrať ji v novy_krok_po_nasazeni s důvodem, kritériem a oporou (doslovná citace Povolení vize nebo rozhodnutí majitele; bez opory nech prázdné). Necommituj, commit a deploy dělá další krok.${standardy}`,
  { label: `fix-e2e:kolečko:${k}`, phase: 'Deploy a E2E', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

const fixSecurityE2E = e => runSePredavkou(`${ramec}

Úkol: E2E kolečka našlo závažné nálezy mimo kritéria (bezpečnost/data): ${(e.zavazne_mimo_ak || []).join(' | ')} · report ${e.report_path}. Oprav okamžitě, i když jsou mimo rozsah. Necommituj; po zelené bráně bezpečnostní opravu commitne deploy samostatně. Bez jasného fixu nález nech jako follow-up s důvodem.${standardy}`,
  { label: 'fix-security:kolečko:e2e', phase: 'Deploy a E2E', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

// Seznam do zadání závěru jde celý: položky jednotlivě oříznuté na 600 znaků, nikdy celek uprostřed položky (běh web-rijen: ořez na
// 2 500 znaků ztratil 3 ze 14 follow-upů, mezi nimi HTTP 500 u odmítnutého dotazu segmentu přímo k bezpečnostní opravě).
const celySeznam = xs => JSON.stringify((xs || []).map(x => { const t = typeof x === 'string' ? x : JSON.stringify(x); return t.length > 600 ? `${t.slice(0, 599)}…` : t }))
// Závěr ověří hashe bezpečnostních commitů: v bez-dluhu fix agent hlásil commit, který nevznikl, a blok to nepoznal (řez 23).
const close = souhrn => runSePredavkou(`${ramec}

Úkol: závěr kolečka.${souhrn.security.length ? ` (0) Ověř bezpečnostní commity kolečka ${souhrn.security.join(', ')}: git cat-file -t <hash> musí vrátit commit; který ho nevrátí, vrať v chybejici_commity a v journalu ho uveď jako chybějící; hash nikdy nedopočítávej.` : ''} (1) Připoj do docs/journal.md heredocem záznam „Review kolečko“: datum, nálezy per kolo (${souhrn.kola}), co zásadního se změnilo (commity ${souhrn.commity.join(', ') || 'žádné'}), kolik přinesla která bezpečnostní metodika (${souhrn.metodiky}), odmítnuté nálezy s důvodem: ${celySeznam(souhrn.odmitnute)}${souhrn.jinak.length ? `, opravy jinak, než nález tvrdil: ${celySeznam(souhrn.jinak)}` : ''}, sporné položky a vadná kritéria k rozhodnutí uživatele: ${celySeznam(souhrn.rozhodnuti)}, E2E ${souhrn.e2e}. (2) Připoj do docs/follow-ups.md pod nadpis „## Kolečko“ tyto položky (jedna odrážka = jedna, s kontextem, bez duplicit proti existujícím; každá začíná značkami „[kolečko · <oblast>] [<osud>]“, které položky už nesou: oblast „obecné“ nebo „review“ nahraď modulem nebo plochou ze slovníku projektu, osud (rozhodnutí | oprava | nápad | obsah) nech, chybí-li, doplň podle ${tvar}, sekce Follow-ups): ${celySeznam(souhrn.follow_ups)}.${souhrn.dluh.length ? ` (2b) Položky dluhu opravené vlnou kolečka přeškrtni ve follow-ups tvarem ~~…~~ VYŘEŠENO <dnešní datum>: kolečko (hledej je podle textu): ${celySeznam(souhrn.dluh)}.` : ''} (3) Pusť formátovač projektu na dotčené docs/*.md, když ho projekt má. (4) Vytvoř marker \`touch ${cwd}/docs/.review-passed\` a ověř, že existuje. (5) Smaž docs/.deploy-unlocked, když existuje. (6) Zapiš do ${cwd}/docs/.vysledek-kolecko.json (soubor celý přepiš) přesně tento JSON, beze změny a bez zkracování: ${JSON.stringify({ follow_ups: souhrn.follow_ups, odmitnute: souhrn.odmitnute, reports: souhrn.reports, dluh_opraveno: souhrn.dluh, prostredi: dedupR(st.prostredi) })}; cestu vrať ve vysledek_soubor (když zápis selže, nech pole prázdné). Necommituj (commituje další krok), do kódu nesahej.`,
  { label: 'závěr:kolečko', phase: 'Závěr', agentType: 'general-purpose', schema: CLOSE, ...M.sonM })

// ---------- opravná vlna: opravy → brána → commit ----------
const balickyZ = (r, prefix) => (r && r.balicky || []).map(b => ({ soubory: cisty((b.soubory || []).map(norm)), nalezy: cisty(b.nalezy), security: !!b.security, zdroje: [{ report: S(r.report_path), ids: cisty(b.nalezy) }] })).filter(b => b.soubory.length)
// sloučí balíčky z více zdrojů do disjunktních množin souborů
function sluc(balicky) {
  const out = []
  for (const b of balicky) {
    const hity = out.filter(o => o.soubory.some(f => b.soubory.includes(f)))
    if (!hity.length) { out.push({ ...b, soubory: [...b.soubory], zdroje: [...b.zdroje] }); continue }
    // Balíček, který spojí dva dosavadní, je sloučí oba: výsledek zůstane disjunktní (dřív se přidal jen k prvnímu a balíčky se překryly).
    const [cil, ...dalsi] = hity
    for (const o of [b, ...dalsi]) { cil.soubory = cisty([...cil.soubory, ...o.soubory]); cil.security = cil.security || o.security; cil.zdroje.push(...o.zdroje); if (o.polozky) cil.polozky = [...(cil.polozky || []), ...o.polozky] }
    for (const o of dalsi) out.splice(out.indexOf(o), 1)
  }
  return out
}
async function vlna(faze, ph, zprava, balicky, fu = new Map(), fixer = fixBalicek) {
  if (!balicky.length) { log(`${faze}: žádný balíček k opravě, brána a commit se vynechávají`); return { ok: true, fixAgentu: 0, vysledky: [] } }
  // Nejdelší balíček první: při stropu souběhu Workflow se dlouhý fix agent nesmí řadit na konec dávky (běh web-podzim).
  balicky = [...balicky].sort((x, y) => y.soubory.length - x.soubory.length)
  zelenaBrana = null
  const vysledky = await parallel(balicky.map((b, i) => () => fixer(faze, b.zdroje, b, i)))
  followZOprav(balicky.map((b, i) => ({ f: vysledky[i], b })), fu)
  const opravy = vysledky.filter(Boolean)
  opravy.forEach(sber)
  const zmenil = opravy.some(zmenilo)
  if (opravy.some(f => f.rozsireny_zasah)) log(`${faze}: rozšířený zásah nahlášen (${opravy.filter(f => f.rozsireny_zasah).map(f => S(f.rozsireny_popis).slice(0, 80)).join(' | ')}); zkontroluje ho další kolo`)
  if (!zmenil) { log(`${faze}: opravy nic nezměnily, brána a commit se vynechávají`); return { ok: true, fixAgentu: opravy.length, vysledky } }
  // Bezpečnostní balíčky, které něco změnily: jejich soubory a popis dostane krok commitu až po zelené bráně (bod 19).
  const secOpravy = balicky.map((b, i) => (b.security || (vysledky[i] && vysledky[i].security)) && zmenilo(vysledky[i]) ? { soubory: b.soubory, popis: `${cisty(b.zdroje.flatMap(z => z.ids)).join(', ') || 'bezpečnostní nálezy'}: ${cisty(vysledky[i].zmenena_mista).slice(0, 6).join('; ')}` } : null).filter(Boolean)
  const b = await brana(faze, ph)
  if (!b.ok) return { ok: false, fixAgentu: opravy.length, detail: b.detail }
  const c = await commit(faze, zprava, ph, secOpravy)
  if (!c) return { ok: false, fixAgentu: opravy.length, detail: nic(`commit:kolečko:${faze}`, 'deploy agent (commit)') }
  if (c.stav === 'failed') { sberSecurity(c); return { ok: false, fixAgentu: opravy.length, detail: `commit selhal: ${S(c.duvod)}${cisty(c.security_commity).length ? ` (fix(security) už commitnuté: ${cisty(c.security_commity).join(', ')})` : ''}` } }
  sberCommit(c)
  if (secOpravy.length && !(c.security_commity || []).length) log(`${faze}: bezpečnostní opravy bez samostatného commitu (soubory nesou i jinou změnu), jdou řádkem fix(security) v commitu ${c.commit}`)
  log(`${faze}: ${opravy.length} fix agentů, commit ${c.commit}${(c.security_commity || []).length ? `, fix(security) ${c.security_commity.join(', ')}` : ''}`)
  return { ok: true, fixAgentu: opravy.length, vysledky }
}
const zapisVerify = v => ({ typecheck: v.typecheck, proslo: v.proslo, selhalo: v.selhalo, exit_kod: v.exit_kod, kontroly_ok: v.kontroly_ok })
// Fáze poslední zelené brány, po které žádný fix agent nesahal do stromu (brána před nasazením se pak nepouští).
let zelenaBrana = null
async function brana(faze, ph) {
  zelenaBrana = null
  let v = await verify(faze, 1, ph)
  if (!v) return { ok: false, detail: nic(`verify:kolečko:${faze}:1`, 'verify agent') }
  if (!zelena(v)) {
    log(`brána po ${faze} červená: ${proc(v)}; jedna oprava`)
    const fb = await fixBrana(faze, v, ph); sber(fb)
    v = await verify(faze, 2, ph)
    if (!zelena(v)) { st.verify = v ? zapisVerify(v) : st.verify; return { ok: false, detail: v ? `brána červená po opravě: ${proc(v)}: ${(v.selhavajici || []).slice(0, 10).join(' | ')}` : nic(`verify:kolečko:${faze}:2`, 'verify agent') } }
  }
  st.verify = zapisVerify(v)
  zelenaBrana = ph
  log(`brána po ${faze} zelená: ${v.proslo} testů`)
  return { ok: true }
}

// ---------- 1. thermo ----------
phase('Thermo')
log(`kolečko vize ${S(a.vize)} nad ${base}...HEAD`)
if (a.obnova && typeof a.obnova === 'object' && !obnovaIn) log('obnova bez od_faze ignorována: kolečko běží jako nové, bez značky obnovy')
if (obnova) {
  if (odFazeIn === 'kolo 2') log('obnova: fáze kolo 2 už neexistuje (kolo pěti čoček zrušeno), obnova jde od bezpečnosti')
  if (obnovaOd < 0) log(`obnova: neznámá fáze „${S(a.obnova.od_faze)}“ (platí ${FAZE.map(([, k]) => k).join(', ')}), přeměří se všechno od thermo`)
  if (obnova.znacka === 'bez značky') log('obnova: chybí značka; další obnova bez nové značky vrátí brány této obnovy z cache')
  log(`obnova od fáze ${FAZE[obnova.od][1]} (značka ${obnova.znacka}): brána, commit, deploy a E2E od ní se přeměří, review se vrátí z cache`)
}
const th = await thermo()
if (!th) return selhani('thermo', nic('thermo:kolečko', 'thermo agent'))
st.reports.push(th.report_path)
st.thermo = { nalezu: th.nalezu, blokeru: th.blokeru, opraveno: 0 }
log(`thermo: ${th.nalezu} nálezů, ${th.blokeru} blokujících, soubory BLOCKER/HIGH a jejich náprav: ${thermoSoubory(th).length}`)
if (thermoSoubory(th).length) {
  zelenaBrana = null
  const f = await fixThermo(th); sber(f)
  if (f) {
    st.thermo.opraveno = f.opraveno
    if (zmenilo(f)) {
      const b = await brana('thermo', 'Thermo'); if (!b.ok) return selhani('thermo', b.detail)
      const c = await commit('thermo', 'kolecko: thermo', 'Thermo')
      if (!c || c.stav === 'failed') { sberSecurity(c); return selhani('thermo', c ? `commit selhal: ${S(c.duvod)}` : nic('commit:kolečko:thermo', 'deploy agent (commit)')) }
      sberCommit(c)
    }
  } else log('thermo: fix agent nevrátil výsledek, nálezy zůstávají jako follow-up')
}

// ---------- 2. code-review kolo 1 ----------
phase('Code-review 1')
const r1 = await review1()
if (!r1) return selhani('code-review kolo 1', nic('review:kolečko:1', 'code-review agent'))
if (r1.report_path) st.reports.push(r1.report_path)
const b1 = sluc(balickyZ(r1))
log(`review 1: ${r1.nalezu} nálezů, ${r1.blokujicich} blokujících, ${b1.length} balíčků`)
followMimoBalicky([r1])
const v1 = await vlna('kolo 1', 'Code-review 1', 'kolecko: code-review kolo 1', b1, fuMapa([r1]))
st.review.kolo1 = { nalezu: r1.nalezu, blokujicich: r1.blokujicich, fix_agentu: v1.fixAgentu }
if (!v1.ok) return selhani('code-review kolo 1', v1.detail)

// ---------- 2b. dluh z follow-ups ----------
// Vlna dluhu (§ 2.6): agent sběru vybere skriptem follow-ups.py nejvýš 40 otevřených položek [oprava] (nejdřív z řezů tohoto běhu podle
// tabulky plánu v handoffu), rozdělí je do disjunktních balíčků po souborech; fix agenti je opraví, brána, commit; závěr opravené přeškrtne.
phase('Dluh')
const DLUH = { type: 'object', required: ['balicky'], properties: {
  chyba: str('jen když skript follow-ups.py chybí nebo selhal: důvod; jinak nevyplňuj'),
  celkem: { type: 'integer', description: 'otevřené položky [oprava] ve follow-ups celkem' },
  balicky: { type: 'array', items: { type: 'object', required: ['soubory', 'polozky'], properties: { soubory: arr('disjunktní množina souborů, kterých se položky dotýkají, cesty relativní ke kořeni projektu'), polozky: { type: 'array', items: { type: 'object', required: ['id', 'text'], properties: { id: str('D1, D2, …'), text: str('text položky z follow-ups doslova, včetně značky řezu a oblasti') } } } } } },
  predavka: PREDAVKA,
} }
const sberDluhu = () => runSePredavkou(`${ramec}

Úkol: sběr dluhu z follow-ups (nic neopravuješ, nic neškrtáš). Spusť \`python3 ${a.plugin_root}/scripts/follow-ups.py ${cwd} --osud oprava --json\` a z výstupu vyber nejvýš 40 otevřených položek [oprava]: nejdřív položky řezů tohoto běhu (čísla řezů z tabulky plánu v ${cwd}/docs/handoff.md, který smíš číst jen kvůli tomu), pak starší. Každé dej id D1, D2, … a rozděl je do nejvýš 8 balíčků po disjunktních množinách souborů (podle cesty v položce; položku bez cesty zařaď podle oblasti k balíčku, jehož souborů se týká, jinak ji vynech). Vrať balíčky s texty položek doslova a celkový počet otevřených položek [oprava]. Když skript chybí nebo selže, vrať prázdné balíčky a chyba s důvodem.`,
  { label: 'dluh:kolečko', phase: 'Dluh', agentType: 'general-purpose', schema: DLUH, ...M.sonM })
const fixDluh = (faze, zdroje, b, i) => runSePredavkou(`${ramec}

Úkol: oprav dluh z docs/follow-ups.md (vlna dluhu kolečka). Report ${cwd}/docs/follow-ups.md, tvoje nálezy: ${(b.polozky || []).map(x => x.id).join(', ')}. Položky: ${(b.polozky || []).map(x => `${x.id}: ${x.text}`).join(' · ').slice(0, 4000)}. Sahej jen do souborů: ${b.soubory.join(', ')}; jiné soubory mohou souběžně opravovat jiní agenti. Spouštěj jen dotčené testy a typecheck${rychleText}; plnou suitu nespouštěj, patří bráně. Každá položka je hypotéza: ověř proti kódu; co už neplatí nebo míří vedle, odmítni s důvodem; nový mechanismus ani změnu rozhodovací logiky nedělej, takovou položku odmítni jako kandidáta na řez. Ve follow-ups nic neškrtej (přeškrtne závěr). Identifikátory opravených položek vrať v opravene_ids. Necommituj. ${POSLEDNI_VARKA}${standardy}`,
  { label: `fix:kolečko:dluh:${i + 1}`, phase: 'Dluh', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })
if (!a.plugin_root) log('dluh: bez plugin_root se vlna dluhu nekoná (skript follow-ups.py)')
else {
  const sd = await sberDluhu()
  const polozkyVse = []
  const bal = sd ? (sd.balicky || []).map(b => ({ soubory: cisty((b && b.soubory || []).map(norm)), polozky: (b && b.polozky || []).filter(x => x && S(x.id).trim() && S(x.text).trim()).map(x => ({ id: S(x.id).trim(), text: S(x.text).trim().slice(0, 600) })) })).filter(b => b.soubory.length && b.polozky.length).slice(0, 8) : []
  for (const b of bal) { b.polozky = b.polozky.filter(x => polozkyVse.length < 40 && !polozkyVse.some(y => y.id === x.id) && polozkyVse.push(x)) }
  const balicky = bal.filter(b => b.polozky.length).map(b => ({ soubory: b.soubory, security: false, zdroje: [{ report: `${cwd}/docs/follow-ups.md`, ids: b.polozky.map(x => x.id) }], polozky: b.polozky }))
  if (!sd) log('dluh: agent sběru nevrátil výsledek, vlna se nekoná')
  else if (S(sd.chyba).trim()) log(`dluh: ${S(sd.chyba).slice(0, 200)}; vlna se nekoná`)
  else if (!balicky.length) log('dluh: žádná položka [oprava] k opravě')
  else {
    log(`dluh: ${polozkyVse.length} položek v ${balicky.length} balíčcích (otevřených [oprava] celkem ${Number(sd.celkem) || '?'})`)
    const vd = await vlna('dluh', 'Dluh', 'kolecko: dluh z follow-ups', sluc(balicky), new Map(), fixDluh)
    const opravene = new Set((vd.vysledky || []).flatMap(f => f ? cisty(f.opravene_ids) : []))
    st.dluhOpravene = polozkyVse.filter(x => opravene.has(x.id)).map(x => x.text)
    st.dluh = { polozek: polozkyVse.length, opraveno: st.dluhOpravene.length, odmitnuto: polozkyVse.length - st.dluhOpravene.length }
    log(`dluh: opraveno ${st.dluh.opraveno}, odmítnuto nebo neopraveno ${st.dluh.odmitnuto}`)
    if (!vd.ok) return selhani('dluh', vd.detail)
  }
}

// ---------- 3. bezpečnost ----------
phase('Bezpečnost')
const [sc, ss] = await parallel([() => secCocka(), () => secSkill()])
for (const r of [sc, ss]) if (r && r.report_path) st.reports.push(r.report_path)
if (!sc && !ss) return selhani('bezpečnost', `ani jedna bezpečnostní metodika nevrátila výsledek (${nic('security:kolečko:čočka', 'čočka')}; ${nic('security:kolečko:security-review', 'security-review')})`)
st.security.nalezu = (sc ? sc.nalezu : 0) + (ss ? ss.nalezu : 0)
st.security.blokujicich = (sc ? sc.blokujicich : 0) + (ss ? ss.blokujicich : 0)
const metodiky = `čočka ${sc ? `${sc.nalezu} nálezů` : 'bez výsledku'}; ${ss ? `${S(ss.metodika) || 'security-review'} ${ss.nalezu} nálezů` : 'security-review bez výsledku'}`
log(`bezpečnost: ${metodiky}`)
const bs = sluc([...balickyZ(sc), ...balickyZ(ss)]).map(b => ({ ...b, security: true }))
followMimoBalicky([sc, ss])
const vs = await vlna('bezpečnost', 'Bezpečnost', 'kolecko: bezpečnost', bs, fuMapa([sc, ss]))
if (!vs.ok) return selhani('bezpečnost', vs.detail)

// ---------- 4. deploy a E2E ----------
phase('Deploy a E2E')
// Brána před nasazením jen nad změněným stromem (1.7.0): v běhu sonnet-5-5 běžela minutu po zelené bráně bezpečnosti nad týmž stromem
// (4,7 min). Zelená brána platí, když po ní žádný fix agent nesahal do stromu a při obnově byla přeměřená v tomto běhu (fáze
// od od_faze dál); brána z cache přerušeného běhu strom po zásahu člověka nezná.
const branaPlati = zelenaBrana && (!obnova || FAZE.findIndex(([t]) => t === zelenaBrana) >= obnova.od)
if (branaPlati) log(`brána před nasazením: poslední brána (po fázi ${zelenaBrana}) je zelená a od ní žádná oprava nesahala do stromu, znovu se nepouští`)
else { const bd = await brana('před nasazením', 'Deploy a E2E'); if (!bd.ok) return selhani('deploy', bd.detail) }
let d = await deploy(1, 'nasazení oprav')
if (!d) return selhaniDeploye(d, 1)
if (d.stav === 'failed' || d.stav === 'odlozeno') { st.deploy = zapisDeploy(d); return selhaniDeploye(d, 1) }
sberCommit(d)
st.deploy = zapisDeploy(d)
log(`deploy: ${d.stav}, commit ${d.commit}`)
const se = await sestavE2E()
if (!se) return selhani('e2e', nic('e2e-scénáře:kolečko', 'agent E2E scénářů kolečka'))
log(`E2E scénáře kolečka: ${se.kriterii} kritérií${se.poznamka ? ` (${S(se.poznamka).slice(0, 120)})` : ''}`)
// Kritérium, které nejde změřit bez rozšíření Povolení, jde majiteli jako otázka (1.7.0), ne jako vadné kritérium po E2E.
for (const x of cisty(se.rozhodnuti)) st.rozhodnuti.push(`[E2E kolečka · Povolení] ${x} · otázka: rozšířit Povolení, nebo čekat`)
// Normalizace E2E (1.8.0, § 2.2, jako ve stavbě): fail_kriteria jako objekty {kriterium, selhani} (starší návrat: řetězce) jdou dál jako
// řetězce; prostredi jen s důkazem (bez důkazu FAIL); vada nasazení v prostredi_nasazeni (starší návrat: text v prostredi).
const vadaNasazeni = x => S(typeof (x && x.prostredi) === 'string' ? x.prostredi : x && x.prostredi_nasazeni).trim()
const normE2E = x => {
  const failObj = (x.fail_kriteria || []).filter(f => f && (typeof f === 'string' ? f.trim() : S(f.kriterium).trim()))
  x.fail_kriteria = cisty(failObj.map(f => typeof f === 'string' ? f : `${S(f.kriterium).trim()}${S(f.selhani).trim() ? `: ${S(f.selhani).trim()}` : ''}`.slice(0, 400)))
  x.prostredi_nasazeni = vadaNasazeni(x)
  const pk = (typeof x.prostredi === 'string' ? [] : x.prostredi || []).filter(y => y && typeof y === 'object' && S(y.kriterium).trim())
  const bezDukazu = pk.filter(y => !S(y.dukaz).trim())
  x.prostredi = pk.filter(y => S(y.dukaz).trim()).map(y => ({ kriterium: S(y.kriterium).trim().slice(0, 200), sekce: S(y.sekce).trim().slice(0, 120), dukaz: S(y.dukaz).trim().slice(0, 600), navrh: S(y.navrh).trim().slice(0, 300) }))
  if (bezDukazu.length) { log(`E2E: ${bezDukazu.length} kritérií prostředí bez důkazu, počítají se jako FAIL`); x.fail_kriteria.push(...bezDukazu.map(y => `${S(y.kriterium).trim()} (prostředí bez důkazu)`)); x.fail = (Number(x.fail) || 0) + bezDukazu.length }
  if ((Number(x.fail) || 0) === 0 && x.fail_kriteria.length) x.fail = x.fail_kriteria.length
  return x
}
const verdikt = e => (e.fail > 0 || (e.fail_kriteria || []).length) ? 'fail' : (e.vadna_kriteria || []).length ? 'vada-kriteria' : (e.prostredi || []).length ? 'prostredi' : e.castecne > 0 ? 'pass-castecne' : 'pass'
const zapisE2E = e => { st.e2e = { vysledek: verdikt(e), celkem: e.celkem, pass: e.pass, castecne: e.castecne, fail: e.fail, castecna_kriteria: e.castecna_kriteria || [], vadna_kriteria: e.vadna_kriteria || [], prostredi: (e.prostredi || []).map(x => x.kriterium) } }
const e2eLabel = k => `${runtimeDopad ? 'e2e' : 'kriteria'}:kolečko:${k}`
let e = await e2e(1)
if (!e) return selhani('e2e', nic(e2eLabel(1), 'verifikátor'))
normE2E(e)
// Vada nasazení (nasazená revize není commit kolečka, přihlášení nefunguje) není nález pro fix agenta: kolečko selže ve fázi deploy a obnova jde od ní.
if (vadaNasazeni(e)) { st.reports.push(e.report_path); return selhani('deploy', `E2E hlásí vadu nasazení: ${vadaNasazeni(e).slice(0, 600)}`) }
st.reports.push(e.report_path); zapisE2E(e)
log(`E2E 1: ${verdikt(e)} (${e.pass}/${e.celkem}, částečně ${e.castecne}, fail ${e.fail}, vadná ${(e.vadna_kriteria || []).length}${e.prostredi.length ? `, prostředí ${e.prostredi.length}` : ''})`)
if (verdikt(e) === 'fail') {
  const fe = await fixE2E(e, 1); sber(fe)
  // Nový krok nad platformou z opravy (§ 2.4, jako ve stavbě): s oporou v Povolení jde do nasazení jako další krok; bez opory se
  // oprava nenasadí (jen commit), kritérium jde majiteli jako otázka a kolo 2 ho nepřeměřuje.
  const nove = (fe && fe.novy_krok_po_nasazeni || []).filter(x => x && S(x.krok).trim()).map(x => ({ krok: S(x.krok).trim().slice(0, 300), duvod: S(x.duvod).trim().slice(0, 300), opora: S(x.opora).trim().slice(0, 300), kriterium: S(x.kriterium).trim().slice(0, 160) }))
  const sOporou = nove.filter(x => x.opora), bezOpory = nove.filter(x => !x.opora)
  const kId = t => S(t).trim().split(/[\s:(,;]/)[0].toUpperCase()
  const failKola1 = cisty(e.fail_kriteria)
  const vyjmuta = bezOpory.length ? (bezOpory.some(x => !x.kriterium) ? failKola1 : failKola1.filter(fk => bezOpory.some(x => kId(x.kriterium) === kId(fk)))) : []
  if (bezOpory.length) {
    log(`oprava po E2E vyžaduje krok nad platformou bez opory v Povolení (${bezOpory.map(x => x.krok).join(' | ').slice(0, 200)}): krok se neprovede, kód se nasadí bez něj, ${vyjmuta.length} kritérií jde majiteli jako otázka`)
    for (const x of bezOpory) st.rozhodnuti.push({ typ: 'novy_krok', kriterium: x.kriterium || vyjmuta.join(' | ').slice(0, 300), krok: x.krok, duvod: x.duvod })
  }
  if (sOporou.length) log(`oprava po E2E přidává krok po nasazení s oporou v Povolení: ${sOporou.map(x => x.krok).join(' | ').slice(0, 200)}`)
  // Oprava po E2E, která změnila kód, projde bránou (1.6.0, běh web-rijen: řezy 4 a 10 šly do nasazení bez brány); kód mimo apps
  // a packages bránou a jen commitem bez nasazení, jen docs commitem, oprava bez změny ani commitem. Krok s oporou vynutí nasazení;
  // krok bez opory nasazení nebrání (review N5): kód se nasadí bez něj a kolo 2 přeměří jen kritéria, která ten krok nepotřebují.
  const zasah = zasahOpravy(fe)
  const nasadit = sOporou.length ? 'kod' : zasah
  if (nasadit === 'kod') {
    if (zasah === 'kod' || zasah === 'mimo') { const bo = await brana('oprava po E2E', 'Deploy a E2E'); if (!bo.ok) return selhani('e2e', `oprava po E2E neprošla bránou: ${bo.detail}`) }
    const d2 = await deploy(2, 'oprava po E2E', [], sOporou); if (!d2 || d2.stav === 'failed' || d2.stav === 'odlozeno') return selhaniDeploye(d2, 2)
    sberCommit(d2)
    d = d2; st.deploy = zapisDeploy(d)
  } else if (nasadit === 'mimo' || nasadit === 'docs') {
    if (zasah === 'mimo') { const bo = await brana('oprava po E2E', 'Deploy a E2E'); if (!bo.ok) return selhani('e2e', `oprava po E2E neprošla bránou: ${bo.detail}`) }
    const co = await commit('oprava po E2E', 'kolecko: oprava po E2E', 'Deploy a E2E')
    if (!co || co.stav === 'failed') { sberSecurity(co); return selhani('e2e', co ? `commit opravy po E2E selhal: ${S(co.duvod)}` : nic('commit:kolečko:oprava po E2E', 'deploy agent (commit)')) }
    sberCommit(co)
  } else log('E2E 1: oprava nic nezměnila, kolo 2 bez nového nasazení')
  const e1 = e
  // Kolo 2 přeměří jen jmenovaná FAIL kritéria kola 1 (bez kritérií vyjmutých kvůli kroku mimo Povolení). Když kolo 1 hlásí víc FAIL,
  // než jich jmenuje, nejde říct která, a kolo 2 měří všechna (revize 1.4.0: fail 2 bez jmen dal kolu 2 prázdný seznam a kolečko
  // prošlo bez přeměření). Bez runtime dopadu měří kolo 2 všechna kritéria vždy a skládat ho s kolem 1 by počty zdvojilo.
  const jmenovana = failKola1.filter(fk => !vyjmuta.includes(fk))
  const vse = !runtimeDopad || (Number(e1.fail) || 0) > failKola1.length
  if (vse && runtimeDopad) log(`E2E 1: fail ${e1.fail}, jmenovaných kritérií ${failKola1.length}; kolo 2 přeměří všechna`)
  if (!vse && !jmenovana.length) {
    log('E2E: kolo 2 se nekoná, všechna FAIL kritéria kola 1 čekají na rozhodnutí majitele (krok mimo Povolení)')
    e = { ...e1, fail: 0, fail_kriteria: [] }; zapisE2E(e)
  } else {
    const e2 = await e2e(2, vse ? null : jmenovana)
    if (!e2) return selhani('e2e', `${nic(e2eLabel(2), 'verifikátor')} v kole 2`)
    normE2E(e2)
    if (vadaNasazeni(e2)) return selhani('deploy', `E2E v kole 2 hlásí vadu nasazení: ${vadaNasazeni(e2).slice(0, 600)}`)
    // Plné přeměření, které nezměřilo nic, není pass (neproběhlo není spadlo).
    if (vse && !(Number(e2.celkem) > 0) && Number(e1.celkem) > 0) return selhani('e2e', `kolo 2 mělo přeměřit všechna kritéria (${e1.celkem}) a vrátilo celkem 0`)
    // Kolo 2 měřilo jen FAIL kritéria kola 1: výsledné počty se skládají z obou kol. Závažné nálezy, kosmetika a kritéria prostředí
    // z kola 1 se také nesmí ztratit (kolo 2 je jen smoke), jinak by bezpečnostní nález z kola 1 zmizel bez opravy.
    const zKola1 = { zavazne_mimo_ak: cisty([...(e1.zavazne_mimo_ak || []), ...(e2.zavazne_mimo_ak || [])]), kosmeticke: cisty([...(e1.kosmeticke || []), ...(e2.kosmeticke || [])]), prostredi: [...(e1.prostredi || []), ...(e2.prostredi || [])] }
    if (vse) e = { ...e2, ...zKola1 }
    else {
      const vadna = cisty([...(e1.vadna_kriteria || []), ...(e2.vadna_kriteria || [])])
      const castecne = (Number(e1.castecne) || 0) + (Number(e2.castecne) || 0)
      e = { ...e2, celkem: Number(e1.celkem) || 0, castecne, vadna_kriteria: vadna, castecna_kriteria: [...(e1.castecna_kriteria || []), ...(e2.castecna_kriteria || [])], ...zKola1,
        pass: Math.max(0, (Number(e1.celkem) || 0) - (Number(e2.fail) || 0) - castecne - vadna.length - zKola1.prostredi.length) }
    }
    st.reports.push(e2.report_path); zapisE2E(e)
    log(`E2E 2 (${vse ? 'všechna kritéria' : 'jen FAIL kola 1'}): ${verdikt(e)} (${e.pass}/${e.celkem}, fail ${e.fail})`)
    if (verdikt(e) === 'fail') return selhani('e2e', `FAIL kritéria po opravě: ${(e.fail_kriteria || []).join(' | ') || `${e.fail} bez jmen`}`)
  }
}
if ((e.vadna_kriteria || []).length) {
  log(`E2E: ${e.vadna_kriteria.length} vadných kritérií, bez opravy, jdou k rozhodnutí`)
  st.rozhodnuti.push(...e.vadna_kriteria.map(k => `[vadné kritérium E2E kolečka] ${k} · návrh: kritérium přepsat nebo vyřadit, chování nechat`))
}
// Kritéria prostředí (§ 2.2): bez opravy a bez opakování, majiteli jako otázka s důkazem a návrhem.
if ((e.prostredi || []).length) {
  log(`E2E: ${e.prostredi.length} kritérií nejde změřit kvůli prostředí, jdou majiteli jako otázka`)
  for (const x of e.prostredi) { const r = { typ: 'prostredi', kriterium: x.kriterium, ...(x.sekce ? { sekce: x.sekce } : {}), dukaz: x.dukaz, navrh: x.navrh }; st.prostredi.push(r); st.rozhodnuti.push(r) }
}
st.follow_ups.push(...(e.kosmeticke || []).map(k => `[kolečko · E2E] [oprava] E2E kosmetika: ${k}`))
if ((e.zavazne_mimo_ak || []).length) {
  log(`E2E: ${e.zavazne_mimo_ak.length} závažných nálezů mimo kritéria: oprava bez commitu, brána, deploy se samostatným commitem fix(security)`)
  // Neopravený nebo nenasazený závažný nález jde do follow_ups i do rozhodnuti: v revizi 1.4.0 ho fix-security bez výsledku
  // i selhaný deploy(3) ztratily a kolečko skončilo s review_passed true.
  const neopraveno = proc => cisty(e.zavazne_mimo_ak).forEach(z => {
    st.follow_ups.push(`[kolečko · bezpečnost] [oprava] E2E bezpečnost kolečka, neopraveno: ${z} (${proc})`)
    st.rozhodnuti.push(`[E2E bezpečnost kolečko · neopraveno] ${z} · ${proc}; návrh: opravit a nasadit před uzavřením vize`)
  })
  const fs = await fixSecurityE2E(e); sber(fs)
  if (!fs) { log('fix-security nevrátil výsledek, nálezy jdou do follow-ups a rozhodnutí'); neopraveno(nic('fix-security:kolečko:e2e', 'fix-security')) }
  else if (zmenilo(fs)) {
    const bb = await brana('bezpečnost po E2E', 'Deploy a E2E')
    if (!bb.ok) { neopraveno('oprava neprošla bránou, zůstává v pracovním stromě'); return selhani('e2e', `bezpečnostní oprava neprošla bránou: ${bb.detail}`) }
    const d3 = await deploy(3, 'bezpečnostní oprava po E2E', [{ soubory: cestyZ(fs.zmenena_mista), popis: `závažné nálezy E2E mimo kritéria: ${e.zavazne_mimo_ak.join(' | ').slice(0, 600)}; oprava: ${cisty(fs.zmenena_mista).join('; ').slice(0, 400)}` }])
    // Selhaný deploy bezpečnostní opravy je selhání kolečka i mimo infra: review_passed nesmí vzniknout a commit závěru by opravu
    // smetl do „kolecko: závěr“ bez fix(security) a bez nasazení (revize 1.4.0).
    if (!d3 || d3.stav === 'failed' || d3.stav === 'odlozeno') { neopraveno(d3 && d3.stav === 'odlozeno' ? `nasazení opravy odloženo${S(d3.nejdriv).trim() ? ` do ${S(d3.nejdriv).trim()}` : ''}` : 'oprava je v pracovním stromě necommitnutá a nenasazená'); return selhaniDeploye(d3, 3, 'deploy bezpečnostní opravy po E2E: ') }
    sberCommit(d3); d = d3; st.deploy = zapisDeploy(d)
  } else log('E2E: bezpečnostní oprava nic nezměnila, nálezy zůstávají jako follow-up')
}

// ---------- 5. závěr ----------
phase('Závěr')
const kola = `thermo ${st.thermo.nalezu}/${st.thermo.blokeru} (opraveno ${st.thermo.opraveno}); kolo 1 ${st.review.kolo1.nalezu} nálezů, ${st.review.kolo1.blokujicich} blokujících, ${st.review.kolo1.fix_agentu} fix agentů; dluh ${st.dluh.polozek} položek, opraveno ${st.dluh.opraveno}; bezpečnost ${st.security.nalezu} nálezů, ${st.security.blokujicich} blokujících, commity ${cisty(st.security.commity).length}`
const c = await close({ kola, commity: cisty([...st.commity, ...st.security.commity]), security: cisty(st.security.commity), metodiky, odmitnute: cisty(st.odmitnute), jinak: cisty(st.jinak), rozhodnuti: dedupR(st.rozhodnuti), follow_ups: osudy(st.follow_ups), reports: cisty(st.reports), dluh: cisty(st.dluhOpravene), e2e: `${st.e2e.vysledek} ${st.e2e.pass}/${st.e2e.celkem}${st.e2e.castecne ? ` (částečně ${st.e2e.castecne})` : ''}` })
st.review_passed = !!(c && c.ok && c.review_passed)
st.vysledekSoubor = c && c.ok ? S(c.vysledek_soubor).trim() : ''
if (!st.vysledekSoubor) log('závěr: plné seznamy do docs/.vysledek-kolecko.json nezapsal, návrat je nese celé')
if (!st.review_passed) log(`závěr: marker docs/.review-passed nevznikl${c && c.poznamka ? ` (${S(c.poznamka).slice(0, 120)})` : ''}`)
st.chybejici.push(...cisty(c && c.chybejici_commity))
if (st.chybejici.length) log(`závěr: bezpečnostní commity neexistují: ${st.chybejici.join(', ')} (hlášené, ale git cat-file je neuznal)`)
const cz = await commit('závěr', 'kolecko: závěr', 'Závěr')
if (cz && cz.stav !== 'failed') sberCommit(cz)
else log(`závěr: commit docs selhal (${cz ? S(cz.duvod).slice(0, 120) : 'bez výsledku'}), dokumenty zůstávají v pracovním stromě`)
log(`kolečko hotové: ${cisty([...st.commity, ...st.security.commity]).filter(h => !st.chybejici.includes(h)).length} commitů, ${dedupR(st.rozhodnuti).length} rozhodnutí, dluh opraveno ${st.dluh.opraveno}, review_passed ${st.review_passed}`)
return navrat('hotovo', '', '')
