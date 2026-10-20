export const meta = {
  name: 'blok-stavby',
  description: 'dev-pipeline blok stavby řezu: refresh PRD, implementace (malý řez, nebo kontrakt, části souběžně a integrace), thermo a code-review s opravami, brána, doklad, deploy, E2E a uzavření; až tři pokusy s diagnózou před třetím, zastavení při infra selhání nebo odkladu nasazení.',
  whenToUse: 'Spouští orchestrátor /dev-pipeline:orchestrate po schválení PRD řezu s args {cwd, plugin_root, rez, args_file} (soubor docs/.stavba-NN.json) nebo s celými args; schéma args a návratu je v KONTRAKT.md pluginu. Bez args nic nedělá.',
  phases: [
    { title: 'Vstup', detail: 'jen s args_file: agent načte args ze souboru, blok ověří číslo řezu' },
    { title: 'Refresh PRD', detail: 'když od PRD zestárl strom nebo zbyly blokující nálezy delty: delta prd-check kritérií závislých na stromu (kostra i části), zapracování' },
    { title: 'Kontrakt', detail: 'jen řez s částmi a kontraktem: schéma, typy, signatury a registrace; těla částí hlásí „neimplementováno“' },
    { title: 'Implementace', detail: 'malý řez: TDD podle PRD; řez s částmi: oprava po selhání za implementací' },
    { title: 'Části', detail: 'části souběžně, každá startuje hned po svých závislostech a jen ve svých souborech; hotová část se v dalším pokusu neopakuje' },
    { title: 'Integrace', detail: 'typecheck celého repa, švy mezi částmi, požadavky mimo hranici, zbytky „neimplementováno“' },
    { title: 'Review', detail: 'thermo a code-review souběžně (u částí po částech plus integrační review), opravy po sloučených balíčcích (thermo nálezy v téže vlně), nejvýš 2 kola, poslední várka zúžením; lehký profil bez thermo a s jedním kolem' },
    { title: 'Brána', detail: 'typecheck, plná suita jednou, kontroly pre-commitu a měřidla kritérií; zelená jen s exit kódem 0 a prošlými testy, jedna oprava; zelená zapíše marker docs/.verify-passed' },
    { title: 'Doklad', detail: 'jen když PRD předepisuje doklad před migrací: snímek dotčených dat před nasazením' },
    { title: 'Deploy', detail: 'commit řezu (bezpečnostní opravy samostatně), nasazení podle projektu, kroky po nasazení z PRD, zápis nasazení; migrace jen s dokladem; infra selhání a odklad nasazení blok zastaví' },
    { title: 'E2E', detail: 'akceptační kritéria proti běžící aplikaci; skupiny sekcí podle doby (nejvýš 12 kritérií na verifikátor), oprava kódu přes bránu, kolo 2 jen nad FAIL' },
    { title: 'Diagnóza', detail: 'před 3. pokusem: reprodukce a příčina' },
    { title: 'Uzavření', detail: 'ověření commitů, PRD status, journal, follow-ups' },
  ],
}

// ---------- vstup ----------
let a = args
if (typeof a === 'string') { try { a = JSON.parse(a) } catch { a = null } }
const S = v => String(v == null ? '' : v)
// Args ze souboru (1.6.0): orchestrátor předá jen {cwd, plugin_root, rez, args_file}, args složí skript pluginu a načte je agent,
// protože skript Workflow soubory číst neumí. Ruční přepis args stál v běhu web-rijen 159 k znaků kontextu orchestrátora a stavba 8
// dostala mapu kostry řezu 7. Číslo řezu ze souboru musí sedět s voláním: záměnu souboru blok pozná dřív, než cokoli spustí.
if (a && typeof a === 'object' && S(a.args_file).trim()) {
  const { args_file: argsFile, ...volani } = a
  if (!volani.cwd || volani.rez == null || volani.rez === '') {
    log('blok-stavby: args_file bez cwd nebo rez ve volání – nic se nespustilo')
    return { ok: false, duvod: 'args_file: volání musí nést cwd a rez' }
  }
  const soubor = S(argsFile).trim().startsWith('/') ? S(argsFile).trim() : `${S(volani.cwd)}/${S(argsFile).trim().replace(/^\.\//, '')}`
  // Typy polí: pravdivostní a číselné hodnoty blok čte striktně (runtime_dopad !== false), řetězec „false“ by přepnul řez bez
  // runtime dopadu na nasazení a E2E. Po načtení se navíc normalizují (viz normArgs).
  const t = (type, d) => ({ type, description: d || 'hodnota opsaná ze souboru beze změny' })
  const ARGS = { type: 'object', properties: {
    chyba: t('string', 'jen když soubor args chybí nebo není platný JSON: důvod; jinak nevyplňuj'),
    ...Object.fromEntries(['cwd', 'plugin_root', 'vize', 'prd_path', 'e2e_path', 'ne_cile', 'deploy_okno', 'runbook', 'deploy_mode', 'app_pristup', 'profil'].map(k => [k, t('string')])),
    rez: t(['string', 'integer'], 'číslo řezu přesně jako v souboru'),
    ...Object.fromEntries(['runtime_dopad', 'doklad_pred', 'kontrakt_potreba'].map(k => [k, t('boolean', 'true nebo false jako JSON boolean, ne řetězec')])),
    ...Object.fromEntries(['kriteria', 'max_pokusu'].map(k => [k, t('integer')])),
    kontrakt_odhad_radku: t(['integer', 'null']),
    hypotezy: t(['object', 'array', 'string', 'null'], 'celý objekt beze změny'),
    // Obnova do souboru nepatří (1.7.0): v běhu sonnet-5-5 vrátil načítací agent ve stavbách 01 a 03 „obnova: {}“, blok to vzal
    // jako obnovu s neznámou fází a skutečná obnova řezu 03 se pak nepotkala s cache (62 min, $58, ztracené seznamy).
    ...Object.fromEntries(['prd_stale', 'mazane_pozdeji', 'e2e_sekce', 'casti', 'casti_nad_stropem', 'oblasti'].map(k => [k, t('array', 'celé pole beze změny')])),
    rozhodnuti_majitele: { type: 'array', items: { type: 'string' }, description: 'celé pole beze změny' },
    rychle_kontroly: t('string'),
    _pole: { type: 'array', items: { type: 'string' }, description: 'seznam polí souboru (_pole) opsaný přesně' },
  } }
  phase('Vstup')
  const nacti = async doplnek => {
    let r = null
    for (let i = 0; i < 3 && !r; i++) {
      try {
        r = await agent(`Řez ${String(volani.rez).padStart(2, '0')}: načtení args bloku stavby. Přečti ${soubor} a ${S(volani.cwd)}/docs/.run-args.json (když existuje). Vrať jejich sloučení, pole souboru řezu mají přednost. Hodnoty opiš přesně, nic nezkracuj ani nedoplňuj. Když soubor řezu chybí nebo není platný JSON, vrať jen pole chyba s důvodem.${doplnek}`,
          { label: `args:řez ${String(volani.rez).padStart(2, '0')}`, phase: 'Vstup', agentType: 'dev-pipeline:nacteni-args', schema: ARGS, model: 'sonnet', effort: 'low' })
      } catch (e) { log(`args:řez ${S(volani.rez)}: spuštění selhalo (${S(e && e.message || e).slice(0, 120)})`) }
    }
    return r
  }
  let nactene = await nacti('')
  if (!nactene) return { ok: false, duvod: `args_file: načítací agent nevrátil výsledek (${soubor})` }
  if (S(nactene.chyba).trim()) { log(`blok-stavby: args_file ${soubor}: ${S(nactene.chyba).slice(0, 200)}`); return { ok: false, duvod: `args_file: ${S(nactene.chyba).trim().slice(0, 400)}` } }
  // Kontrola opisu (1.7.0): skript zapíše do souboru _pole (klíče souboru a docs/.run-args.json bez prázdných hodnot) a blok
  // porovná návrat s ním. Celá třída vad opisu (obnova: {} ve stavbě, chybějící kontrakt_rez a vymyšlené rezim: "config" v PRD)
  // prošla v běhu sonnet-5-5 bez povšimnutí. Chybí = pole ze _pole, které schéma bloku zná a návrat nemá (nebo má prázdné).
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
  if (!seznam) log(`blok-stavby: args_file ${soubor} bez _pole (starší skript), opis se nekontroluje`)
  else {
    let rozdil = opis(nactene, seznam)
    if (rozdil.chybi.length || rozdil.navic.length) {
      log(`blok-stavby: opis args nesedí se _pole (${textRozdilu(rozdil)}), načítám znovu`)
      nactene = await nacti(` Opis nesedí se seznamem _pole souboru; minule chybělo: ${rozdil.chybi.join(', ') || 'nic'}, navíc bylo: ${rozdil.navic.join(', ') || 'nic'}. Vrať všechna pole obou souborů s neprázdnou hodnotou přesně opsaná; pole, které žádný ze souborů nemá, nevymýšlej.`)
      if (!nactene) return { ok: false, duvod: `args_file: načítací agent nevrátil výsledek (${soubor})` }
      if (S(nactene.chyba).trim()) return { ok: false, duvod: `args_file: ${S(nactene.chyba).trim().slice(0, 400)}` }
      rozdil = opis(nactene, seznam)
      if (rozdil.chybi.length || rozdil.navic.length) {
        log(`blok-stavby: args_file ${soubor}: opis nesedí ani napodruhé (${textRozdilu(rozdil)}) – nic se nespustilo`)
        return { ok: false, duvod: `args_file: opis nesedí (${textRozdilu(rozdil)})` }
      }
    }
  }
  delete nactene._pole
  delete nactene.obnova
  const rezNorm = x => S(x).trim().padStart(2, '0')
  if (rezNorm(nactene.rez) !== rezNorm(volani.rez)) {
    log(`blok-stavby: args_file ${soubor} patří řezu ${S(nactene.rez) || '?'}, volání je pro řez ${S(volani.rez)} – nic se nespustilo`)
    return { ok: false, duvod: `args_file patří řezu ${S(nactene.rez) || '?'}` }
  }
  delete nactene.chyba
  // Normalizace pro případ, že agent typ přesto opíše jako řetězec.
  for (const k of ['runtime_dopad', 'doklad_pred', 'kontrakt_potreba']) if (typeof nactene[k] === 'string') nactene[k] = nactene[k].trim().toLowerCase() === 'true'
  for (const k of ['kriteria', 'max_pokusu']) if (typeof nactene[k] === 'string' && nactene[k].trim() !== '' && Number.isFinite(Number(nactene[k]))) nactene[k] = Number(nactene[k])
  a = { ...nactene, ...volani }
}
if (!a || typeof a !== 'object' || !a.cwd || a.rez == null || a.rez === '' || !a.prd_path || !a.vize) {
  log('blok-stavby: chybí args (cwd, vize, rez, prd_path) – nic se nespustilo')
  return { ok: false, duvod: 'chybí args: cwd, vize, rez, prd_path' }
}
const pole = x => Array.isArray(x) ? x : (x == null || x === '' ? [] : [x])
const trimList = xs => [...new Set(pole(xs).map(x => S(x).trim()).filter(Boolean))]
const NN = String(a.rez).padStart(2, '0')
const cwd = S(a.cwd)
const norm = f => S(f).trim().replace(`${cwd}/`, '')
const cesty = xs => trimList(pole(xs).map(norm))
// Cesty ze „soubor a symbol“ (zmenena_mista): část před dvojtečkou nebo mezerou, jen když vypadá jako cesta (lomítko nebo
// přípona). Deploy podle souborů pozná, zda bezpečnostní oprava jde samostatným commitem; v revizi 1.4.0 dostal „soubor: symbol“.
const cestyZ = xs => cesty(pole(xs).map(m => norm(m).split(/[\s:,;()]/)[0]).filter(x => /\//.test(x) || /\.[A-Za-z0-9]{1,8}$/.test(x)))
// Tvar dokumentů a společná pravidla agentů (TVAR-DOKUMENTU.md pluginu): rámec na něj odkazuje jménem sekcí, nic z něj neopisuje.
// V rámci se nejmenuje „kontrakt“: agent v roli kontrakt řezu s částmi by dostal dva různé kontrakty (soubor a sekci Kontrakt kostry PRD).
const tvar = a.plugin_root ? `${a.plugin_root}/skills/orchestrate/TVAR-DOKUMENTU.md` : 'TVAR-DOKUMENTU.md pluginu dev-pipeline'
// Standardy pro review a opravy (§ 2.14): sdílený standard pluginu a projektový CODING_STANDARDS.md čtou jen reviewer, thermo a fix.
const standardy = ` Standardy pro review: ${a.plugin_root ? `${a.plugin_root}/standardy/` : 'adresář standardy/ pluginu dev-pipeline'} (STANDARD-REVIEW.md, SLOVNIK-NAVRHU.md) a CODING_STANDARDS.md projektu, když existuje; repo má přednost.`
const prdPath = S(a.prd_path), e2ePath = S(a.e2e_path || `${cwd}/docs/e2e/rez-${NN}.md`)
const runtimeDopad = a.runtime_dopad !== false
const deployMode = a.deploy_mode === 'commit-only' ? 'commit-only' : 'config'
const runbook = a.runbook ? S(a.runbook) : null
const appPristup = a.app_pristup ? S(a.app_pristup) : null
const hypIn = a.hypotezy
const hypObj = hypIn && typeof hypIn === 'object' && !Array.isArray(hypIn) ? hypIn : null
// Blokující nálezy delty jdou zvlášť (1.6.0): refresh je přeměří i bez prd_stale (běh web-rijen: 3 blokující šly jen implementaci).
// Blokující nálezy, které blok PRD zapracoval bez další kontroly (1.7.0, zapracovano_bez_kontroly): refresh ověří zapracování. Patří mezi
// blokující i tehdy, když je blok PRD do blokujici nedal.
const hyp = hypObj && hypObj.report ? { report: S(hypObj.report), ids: trimList(hypObj.ids), blokujici: trimList([...pole(hypObj.blokujici), ...pole(hypObj.zapracovano_bez_kontroly)]), bezKontroly: trimList(hypObj.zapracovano_bez_kontroly) } : null
// Nejistý nález nad kritériem, který kontrola PRD nemohla spustit: stavba ho ověří jako první (běh web-rijen: řez 11 AK6 předpověděl
// nespuštěný nejistý nález kontroly a vadné kritérium pak stálo mini-řez).
const overitPrvni = pole(hypObj && hypObj.overit_prvni).filter(x => x && typeof x === 'object' && S(x.hypoteza || x.id).trim())
  .map(x => ({ id: S(x.id).trim(), kriterium: S(x.kriterium).trim(), hypoteza: S(x.hypoteza).trim().slice(0, 600) })).slice(0, 20)
// Volný text orchestrátora (stav stromu po předchozím řezu, rozhodnutí uživatele): string, pole vět, nebo hypotezy.text
const hypText = !hypIn ? '' : typeof hypIn === 'string' ? hypIn : (t => Array.isArray(t) ? t.map(S).filter(Boolean).join(' | ') : (t ? S(t) : ''))(Array.isArray(hypIn) ? hypIn : hypIn.text)
// Ne-cíle vize (text) vidí každá fáze, ne jen implementace: fix, thermo, code-review i E2E soudí i proti nim.
const neCile = a.ne_cile ? S(a.ne_cile).slice(0, 1500) : ''
// Rozhodnutí majitele, která mění provoz běhu (1.7.0, docs/.run-args.json): v běhu sonnet-5-5 je orchestrátor opisoval do hypotéz
// každé stavby a kolečko „bez čekání, ruční běhy podle Povolení“ nedostalo. Jdou do rámce každého agenta bloku.
const rozhodnutiMajitele = (Array.isArray(a.rozhodnuti_majitele) ? a.rozhodnuti_majitele : (a.rozhodnuti_majitele ? [a.rozhodnuti_majitele] : []))
  .map(x => S(x).trim()).filter(Boolean).join(' | ').slice(0, 2000)
// Rychlé kontroly nad celým stromem z projektových fakt (1.7.0): první brána byla v běhu sonnet-5-5 červená ve 4 ze 6 staveb, vždy
// na stráži nad celým stromem, kterou fix agenti nespustili (pouštějí jen dotčené testy). Řez 02 z toho měl pokus 2.
const rychleKontroly = a.rychle_kontroly ? S(a.rychle_kontroly).trim().slice(0, 600) : ''
const rychleText = rychleKontroly ? ` a rychlé kontroly nad celým stromem: ${rychleKontroly}` : ''
// Řezy uzavřené od startu bloku PRD tohoto řezu (každý s oblastmi): neprázdné = PRD vzniklo nad starším stromem.
const prdStale = (Array.isArray(a.prd_stale) ? a.prd_stale.map(S).filter(Boolean) : (a.prd_stale ? [S(a.prd_stale)] : [])).slice(0, 12)
// Co maže pozdější řádek plánu: implementace tam nepřidává symboly ani testy.
const mazane = (Array.isArray(a.mazane_pozdeji) ? a.mazane_pozdeji.map(S).filter(Boolean) : []).slice(0, 12)
// Zakázané okno nasazení z runbooku projektu (text), deploy čeká s rezervou.
const deployOkno = a.deploy_okno ? S(a.deploy_okno).slice(0, 300) : ''
// Lehký profil (řádek plánu `profil: lehký`, nebo orchestrátor u řezu bez runtime dopadu): bez thermo, jedno kolo review.
const profil = a.profil === 'lehky' ? 'lehky' : 'plny'
// Doklad před nasazením: PRD ho předepsalo (migrace mění nebo maže existující data, nebo je nevratná); má smysl jen když blok nasazuje.
const dokladPred = Boolean(a.doklad_pred) && runtimeDopad && deployMode !== 'commit-only'
const dokladPath = `${cwd}/docs/e2e/rez-${NN}-doklad-pred.md`
const nasazeniPath = `${cwd}/docs/e2e/rez-${NN}-nasazeni.md`
const kriteria = Number(a.kriteria) || 0
// Sekce E2E scénářů z bloku PRD s počtem kritérií, od 1.6.0 i s odhadem doby ({nazev, kriterii, doba_min, bez_soubehu});
// staré pole řetězců počty nenese.
const cislo = v => v != null && v !== '' && Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : null
// Oblasti sekce (1.8.0, § 2.12): oblasti PRD, kterých se sekce dotýká; v dalším pokusu po opravě se přeměřují jen sekce, jejichž
// oblasti protínají opravu, ostatní se přenesou z posledního zeleného kola. Bez oblastí se přeměřuje vše.
const e2eSekce = pole(a.e2e_sekce).map(x => {
  if (!x || typeof x !== 'object') return { nazev: S(x).trim(), kriterii: null, doba: null, bezSoubehu: false, oblasti: [] }
  const k = cislo(x.kriterii)
  return { nazev: S(x.nazev).trim(), kriterii: k == null ? null : Math.floor(k), doba: cislo(x.doba_min), bezSoubehu: x.bez_soubehu === true, oblasti: trimList(x.oblasti).map(o => o.toLowerCase()) }
}).filter(s => s.nazev).slice(0, 26)
const PISMENA = 'abcdefghijklmnopqrstuvwxyz'
// Skupiny podle doby (1.6.0): v běhu web-rijen trvala jedna ze dvou skupin řezu 4 34,5 min a druhá 11,6 min a řez 10 šel s deseti
// kritérii ze čtyř oblastí jedním verifikátorem 41 min, protože se skládalo jen podle počtu. Sekce, které scénář nedovoluje měřit
// souběžně (zátěž produkce, měření výkonu), jdou jednou skupinou za sebou a ta běží sama až po doběhu ostatních (e2eBezSoubehu):
// v řezu 10 průchod AK26 zatěžoval produkci měřenou PSI. Ostatní od nejdelší do skupin s cílem ~20 min a nejvýš 12 kritérii.
const CIL_SKUPINY_MIN = 20
let e2eBezSoubehu = -1
const skupinyPodleDoby = () => {
  const out = []
  const doba = s => s.doba || 0
  const bez = e2eSekce.filter(s => s.bezSoubehu)
  if (bez.length) out.push({ sekce: bez.map(s => s.nazev), doba: bez.reduce((n, s) => n + doba(s), 0), kriterii: bez.reduce((n, s) => n + s.kriterii, 0), pevna: true })
  for (const s of e2eSekce.filter(x => !x.bezSoubehu).sort((x, y) => doba(y) - doba(x))) {
    const g = out.filter(x => !x.pevna && x.doba + doba(s) <= CIL_SKUPINY_MIN && x.kriterii + s.kriterii <= 12).sort((x, y) => x.doba - y.doba)[0]
    if (g) { g.sekce.push(s.nazev); g.doba += doba(s); g.kriterii += s.kriterii }
    else out.push({ sekce: [s.nazev], doba: doba(s), kriterii: s.kriterii })
  }
  if (out.length < 2) return []
  const serazene = out.sort((x, y) => y.doba - x.doba)
  e2eBezSoubehu = serazene.findIndex(g => g.pevna)
  return serazene.map(g => g.sekce)
}
// Verifikátoři E2E: sekce hladově v pořadí do skupin po nejvýš 12 kritériích, sekce nad 12 kritérií jde sama; kolik skupin,
// tolik souběžných verifikátorů (v běhu doplneni-webu stály velké řezy 49–70 min v jednom verifikátorovi). Bez počtů (staré
// pole řetězců) jako dřív dvě půlky, jen nad 12 kritérií a s aspoň dvěma sekcemi. Jedna skupina = jeden verifikátor bez sekcí.
// S odhadem doby u všech sekcí skládá skupiny skupinyPodleDoby().
const e2eSkupiny = (() => {
  if (!runtimeDopad || e2eSekce.length < 2) return []
  // Blok PRD posílá doba_min jen kladnou: chybějící odhad je 0. Bez jediného odhadu a sekce bez souběhu platí skládání podle počtu.
  if (e2eSekce.every(s => s.kriterii != null) && e2eSekce.some(s => s.doba != null || s.bezSoubehu)) return skupinyPodleDoby()
  if (e2eSekce.some(s => s.kriterii == null)) {
    if (kriteria <= 12) return []
    const pul = Math.ceil(e2eSekce.length / 2)
    return [e2eSekce.slice(0, pul), e2eSekce.slice(pul)].map(g => g.map(s => s.nazev))
  }
  const out = []
  let cur = null
  for (const s of e2eSekce) {
    if (s.kriterii > 12) { out.push({ sekce: [s.nazev], soucet: s.kriterii }); cur = null }
    else if (cur && cur.soucet + s.kriterii <= 12) { cur.sekce.push(s.nazev); cur.soucet += s.kriterii }
    else { cur = { sekce: [s.nazev], soucet: s.kriterii }; out.push(cur) }
  }
  // Nejdelší skupina první: při stropu souběhu Workflow se dlouhý verifikátor nesmí řadit na konec dávky (běh web-podzim).
  return out.length >= 2 ? [...out].sort((x, y) => y.soucet - x.soucet).map(g => g.sekce) : []
})()
// Části řezu z bloku PRD (kostra + PRD části, každá s vlastními soubory, kritérii a závislostmi); prázdné pole = malý řez,
// jedna implementace jako dřív. Řez 18 běhu bez-dluhu (15 k řádků) stavěl jeden implement agent 258 min a zkompaktoval se 8×;
// část do ~1,5 k řádků unese jeden agent a nezávislé části běží souběžně.
const casti = []
for (const c of pole(a.casti)) {
  const id = c && typeof c === 'object' ? S(c.id).trim() : ''
  // Zahozená část je nález: řez postaví méně, než PRD slibuje, a bez záznamu v logu to nikdo nepozná.
  if (!id) { log(`část bez id zahozena (${S(c && c.nazev).trim().slice(0, 80) || 'bez názvu'})`); continue }
  if (casti.some(x => x.id === id)) { log(`duplicitní část ${id} zahozena (${S(c.nazev).trim().slice(0, 80) || 'bez názvu'}); platí první část s tímto id`); continue }
  casti.push({ id, nazev: S(c.nazev).trim() || id, soubory: cesty(c.soubory), kriteria: trimList(c.kriteria), prd_path: S(c.prd_path).trim(), zavisi_na: trimList(c.zavisi_na), odhad: Math.max(0, Number(c.odhad_radku) || 0) })
}
// Závislost na neznámé části (nebo na sobě) by část navždy zablokovala: vypadne s poznámkou v logu.
// „Kontrakt“ v zavisi_na je samozřejmost (kontrakt běží vždy před částmi), ne neznámá část: tiše pryč (běh web-podzim, řez 04
// měl Kontrakt u všech částí a log hlásil čtyři „neznámé závislosti“).
for (const c of casti) {
  c.zavisi_na = c.zavisi_na.filter(z => !/^kontrakt$/i.test(z) || casti.some(x => x.id === z))
  const nezname = c.zavisi_na.filter(z => z === c.id || !casti.some(x => x.id === z))
  if (nezname.length) { log(`část ${c.id}: neznámé závislosti ${nezname.join(', ')} vynechány`); c.zavisi_na = c.zavisi_na.filter(z => !nezname.includes(z)) }
}
// Topologické řazení (DFS) před prvním pokusem: cyklus v zavisi_na je vada vstupu, žádná část cyklu se nikdy nespustí a každý
// pokus skončí stejně (revize 1.4.0: K1 ↔ K2 spotřebovalo tři pokusy i diagnózu). Blok skončí hned, oprava patří do tabulky Části.
const cyklus = (() => {
  const stavUzlu = new Map(), cesta = []
  const dfs = c => {
    stavUzlu.set(c.id, 'otevreny'); cesta.push(c.id)
    for (const z of c.zavisi_na) {
      if (stavUzlu.get(z) === 'otevreny') return [...cesta.slice(cesta.indexOf(z)), z]
      if (!stavUzlu.has(z)) { const r = dfs(casti.find(x => x.id === z)); if (r) return r }
    }
    stavUzlu.set(c.id, 'hotovy'); cesta.pop()
    return null
  }
  for (const c of casti) if (!stavUzlu.has(c.id)) { const r = dfs(c); if (r) return r }
  return null
})()
if (cyklus) {
  const detail = `cyklus v zavisi_na: ${cyklus.join(' → ')}`
  log(`${detail}; blok nic nespustil (pokus ani diagnóza cyklus neodstraní, oprava patří do tabulky Části v kostře PRD)`)
  return { ok: true, rez: NN, vysledek: 'selhalo', pokusy: 0, faze: 'implementace', detail, diagnoza: null, follow_ups: [], spory: [], reports: [], rozhodnuti: [], odmitnute: [], security_commity: [], casti: casti.map(c => ({ id: c.id, hotovo: false })), predavky: 0 }
}
const sCastmi = casti.length > 0
// Mapa sekcí kostry (1.6.0): blok ji už nedostává, agent si ji udělá sám jedním rg. Ruční přepis args přenesl v běhu web-rijen
// do stavby 8 mapu kostry řezu 7 (stejné nadpisy, jiné řádky) a záměna se při čtení nepozná.
const mapaText = sCastmi ? `Mapu sekcí kostry si udělej sám: \`rg -n '^## ' ${prdPath}\`; kostru pak čti po sekcích (Read s offset/limit), ne celou.\n` : ''
// Části, které kontrola PRD odhadla nad stropem (~1 500 řádků), dostanou víc předávek: řez 10 K8 v běhu web-rijen měřitelně
// postupovala a pokus 1 padl na její čtvrté předávce, ačkoli delta kontrola velikost předpověděla.
const nadStropem = new Set(pole(a.casti_nad_stropem).map(x => S(x && typeof x === 'object' ? x.id : x).trim()).filter(Boolean))
const kontraktPotreba = sCastmi && Boolean(a.kontrakt_potreba)
const prdCasti = casti.map(c => c.prd_path).filter(Boolean)
const prdVse = sCastmi ? `kostra ${prdPath} a části ${prdCasti.join(', ') || '(cesty v kostře)'}` : prdPath
// Mini-řez z finální fáze vize posílá max_pokusu 1 (v běhu bez-dluhu běžel řez 24 dvakrát, protože strop 3 byl natvrdo).
const MAX_POKUSU = Math.floor(Math.min(3, Math.max(1, Number(a.max_pokusu) || 3)))
// Obnova po zastavení: orchestrátor obnovuje blok přes resumeFromRunId a nezměněný prompt se vrátí z cache (v kolečku
// běhu bez-dluhu se tak z cache vrátila i červená brána). Fáze od od_faze dál proto dostanou značku a přeměří dnešní stav.
// Nepovinné obnova.pokus omezí značku na pokusy od přerušeného dál: dřívější pokusy se vrátí z cache.
const FAZE_OBNOVY = ['refresh', 'implementace', 'review', 'brana', 'doklad', 'deploy', 'e2e', 'uzavreni']
// od_faze přijde i s diakritikou nebo jako titul fáze z /workflows („Brána“, „Uzavření“, „Refresh PRD“): normalizace jako
// bezDiakritiky v kolečku (revize 1.4.0: „brána“ blok nepoznal a běžel bez značky, brána i deploy by se vrátily z cache).
// Tituly podfází implementace (Kontrakt, Části, Integrace, Diagnóza) jsou implementace, faze deploy-infra ze zastavení je deploy.
const bezDiakritiky = v => S(v).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
const TITULY_OBNOVY = { 'refresh prd': 'refresh', kontrakt: 'implementace', casti: 'implementace', integrace: 'implementace', diagnoza: 'implementace', 'deploy-infra': 'deploy', 'deploy-odklad': 'deploy' }
// Obnova platí jen s neprázdným od_faze (1.7.0): prázdný objekt obnovy z načítacího agenta pustil v běhu sonnet-5-5 větu obnovy
// do všech zadání staveb 01 a 03 a skutečná obnova řezu 03 pak minula cache a přehrála 40 agentů. Ze souboru obnova nepřichází
// (args_file ji maže), jen z volání orchestrátora.
const obnovaIn = a.obnova && typeof a.obnova === 'object' ? a.obnova : null
if (obnovaIn && !S(obnovaIn.od_faze).trim()) log('obnova bez od_faze ignorována: blok běží jako nový, bez značky obnovy')
const obnova = obnovaIn && S(obnovaIn.od_faze).trim() ? obnovaIn : null
const obnovaFaze = obnova ? FAZE_OBNOVY.indexOf((f => TITULY_OBNOVY[f] || f)(bezDiakritiky(obnova.od_faze))) : -1
// Neznámá fáze přeměří všechno od refresh: běh bez značky vrátí z cache i červenou bránu (třída B1), přeměření stojí jen čas.
const obnovaOd = obnova ? Math.max(0, obnovaFaze) : -1
const obnovaZnacka = obnova ? S(obnova.znacka).trim() || 'obnova' : ''
const obnovaPokus = obnova ? Math.max(1, Math.floor(Number(obnova.pokus)) || 1) : 1
if (obnova && obnovaFaze < 0) log(`obnova: neznámá fáze „${S(obnova.od_faze)}“ (platí ${FAZE_OBNOVY.join(', ')}); značka platí od refresh, přeměří se všechno`)
// Bez pokusu blok neví, ve kterém pokusu běh spadl: značku dostanou i pokusy, které v přerušeném běhu doběhly, a přehrají se
// znovu místo z cache (E2E, oprava a deploy navíc). Hlasitě, ať to orchestrátor v logu vidí a příště pokus pošle.
if (obnova && !(Math.floor(Number(obnova.pokus)) >= 1)) log(`obnova bez pokusu: značka platí od pokusu 1, pokusy doběhlé v přerušeném běhu se přehrají znovu místo z cache; pošli obnova.pokus (číslo přerušeného pokusu)`)
// obnova.pokus je číslo PŘERUŠENÉHO pokusu (§ 2.3, review N1 a N2): blok jím pokračuje. Pokusy před ním se přehrají z cache (stejné labely
// i prompty jako v původním běhu, nic se v nich nemění), v přerušeném pokusu dostanou značku jen fáze od od_faze a jeho reporty se dopíšou;
// pokusy v návratu jsou absolutní. Pokus nad stropem není co obnovovat: chyba args (N3), ne tiché oříznutí.
if (obnova && obnovaPokus > MAX_POKUSU) { log(`obnova: pokus ${obnovaPokus} je nad stropem max_pokusu ${MAX_POKUSU} – nic se nespustilo`); return { ok: false, duvod: `obnova: pokus ${obnovaPokus} je nad stropem max_pokusu ${MAX_POKUSU}` } }
// Číslo pokusu je v názvu reportu: pokus 2 nepřepisuje reporty pokusu 1.
let P = 1
const rep = (typ, kolo) => `${cwd}/docs/reviews/rez-${NN}-p${P}-${typ}-kolo-${kolo}.md`

// ---------- stav napříč pokusy ----------
// Pracovní strom nese práci hotových částí dál, takže hotová část se v dalším pokusu neopakuje: v pokusu 2 běží jen
// selhaná část a ty, které na ní čekají. Kontrakt a integrace se stejně tak dělají, dokud jednou neuspějí.
const castiStav = new Map(casti.map(c => [c.id, { hotovo: false, zrevidovano: false, soubory: [], mimo: [], selhani: '', vysledek: null, prostredi: false }]))
// Části zastavené prostředím (§ 2.2): část ve stavu prostredi zastaví i části, které na ní závisí; nestaví se a jdou majiteli jako otázka.
const zastavene = new Map()
// Položky prostředí (části i kritéria) přežívají pokusy (review N4): drží se za celý blok, jdou do rozhodnutí každého pokusu i selhání a do uzavření.
const prostrediStav = []
const pridejProstredi = x => { const klic = `${x.cast || ''}|${x.kriterium || ''}`; if (!prostrediStav.some(y => `${y.cast || ''}|${y.kriterium || ''}` === klic)) prostrediStav.push(x) }
const sProstredim = xs => [...xs, ...prostrediStav.filter(x => !xs.includes(x))]
// Selhání kontraktu jde dalšímu pokusu stejně jako selhání integrace (revize 1.4.0: kontrakt pokusu 2 o pádu pokusu 1 nevěděl).
let kontraktHotovo = false, kontraktVysledek = null, kontraktSelhani = ''
let integraceHotovo = false, integraceVysledek = null, integraceSelhani = ''
// Selhání za implementací (brána, doklad, deploy, E2E), které má další pokus řezu s částmi opravit; hotové části se znovu nestaví.
let opravaZ = null
// Revize řezu s částmi z pokusů, které padly až za review: část projde review jednou a další pokus ji znovu neposoudí, takže
// její thermo report, odmítnuté nálezy, opravy jinou příčinou a počty patří i do uzavření pozdějšího pokusu (revize 1.4.0:
// uzavření pokusu 2 nedostalo thermo report části K1 ani blokující nález odmítnutý v pokusu 1 a návrat hlásil thermo null).
const revizeDrive = []

// Bezpečnostní opravy čekají na commit deployem napříč pokusy: oprava z pokusu, který padl před deployem, leží necommitnutá
// v pracovním stromě a commitne ji až deploy dalšího pokusu (revize 1.4.0: v pokusu 2 se ztratila). Deduplikace podle popisu:
// výsledky hotových částí se sbírají v každém pokusu znovu a deploy pokusu 2 dostal tutéž opravu podruhé.
const securityOpravy = [], securityCommity = [], securityRadkem = []
let secOdeslano = 0
// Historie nasazení bloku napříč pokusy (běh web-podzim: návrat nesl jen health posledního nasazení, takže orchestrátor u řezu 03
// neviděl, že první nasazení admin nasadilo) a doklad před migrací pořízený jednou za blok (řez 04: pokus 2 doklad přepsal).
const nasazeniHist = []
let dokladCesta = ''
const pridejSec = o => { if (o.popis && !securityOpravy.some(x => x.popis === o.popis)) securityOpravy.push(o) }
// Soubory, které blok změnil (implementace a opravy všech pokusů): hranice opravy brány a seznam pro commit v pokusu 2+ (běh
// web-rijen: deploy pokusu 2 řezu 2 opravy necommitnul, „nevím, čí jsou“, a mini-řez 12 opravil bránu změnou sdílené konfigurace).
const zmenyBloku = new Set()
const oblastiVse = new Set()
// Follow-upy, odchylky a pasti neúspěšných pokusů se drží za celý blok a jdou do uzavření (běh web-rijen: řez 2 jich ztratil 19).
const driveSeznamy = { follow: [], odch: [], pasti: [] }
// Poslední zelená brána bloku: dorovnání deploye malého řezu bránu znovu nepouští a E2E dostane její měřidla.
let posledniBrana = null
// Zelené výsledky skupin E2E z dřívějších pokusů (index skupiny → výsledek): další pokus po opravě je přenese u skupin, jejichž
// sekce se opravy netýkají (§ 2.12).
const e2eZelene = new Map()
// Osud položky follow-ups (§ 2.6): rozhodnutí (jmenuje majitele, Povolení, rozhodnutí), oprava (cesta k souboru nebo konkrétní místo),
// jinak nápad; položka, která osud už nese, se nemění. Oblast doplní uzavření.
const OSUDY = /^\[(rozhodnutí|oprava|nápad|obsah)\]/
const OSUD_ROZHODNUTI = /majitel|Povolení|rozhodnut/i
const OSUD_CESTA = /[\w.@-]+\/[\w.@/-]+\.[a-z0-9]{1,6}\b|\b[\w-]+\.(?:ts|tsx|js|mjs|cjs|py|astro|md|json|css|scss|sql|sh|toml|ya?ml)\b/i
// Tvar položky (review N8): `[řez NN · <oblast>] [<osud>] text`, osud vždy jako druhá značka. Oblast z prvního souboru (apps/<x>) nebo z oblastí
// řezu; položku, která obě značky nese, blok nemění, položce jen s osudem doplní značku řezu, položce jen se značkou řezu doplní osud.
const ZNACKA_REZU = /^\[řez \d+ · [^\]]+\]\s*/
const oblastZ = soubory => { const seg = S(cesty(soubory)[0]).split('/').filter(Boolean); return seg.length >= 3 ? seg.slice(0, 2).join('/') : seg[0] || '' }
const oblastVychozi = () => [...oblastiVse][0] || 'obecné'
const sOsudem = (text, o = {}) => {
  const t = S(text).trim(); if (!t) return t
  const soubory = o.soubory || []
  const osud = () => o.osud || (OSUD_ROZHODNUTI.test(t) ? 'rozhodnutí' : (soubory.length || OSUD_CESTA.test(t)) ? 'oprava' : 'nápad')
  const mRez = ZNACKA_REZU.exec(t)
  if (mRez) { const zbytek = t.slice(mRez[0].length); return OSUDY.test(zbytek) ? t : `${mRez[0].trim()} [${osud()}] ${zbytek}` }
  const oblast = o.oblast || oblastZ(soubory) || oblastVychozi()
  return OSUDY.test(t) ? `[řez ${NN} · ${oblast}] ${t}` : `[řez ${NN} · ${oblast}] [${osud()}] ${t}`
}
const osudy = xs => trimList(pole(xs).map(x => sOsudem(x)))

// ---------- pomocné ----------
const cekej = ms => (ms > 0 && typeof setTimeout === 'function') ? new Promise(r => setTimeout(r, ms)) : Promise.resolve()
async function run(prompt, opts) {
  const label = opts.label || 'agent'
  for (let i = 0; i <= 2; i++) {
    let r = null
    // Restart od nuly nezná stav předchůdce (třída C2: restartovaný agent řezu 16 CK-Go2 našel nevrácenou mutaci jen náhodou).
    const p = i >= 1 ? `${prompt}\n\nPředchozí běh tohoto zadání skončil bez výsledku a pracovní strom může nést jeho rozdělanou práci: začni inventurou (git status, git diff --stat) a navaž na ni, nezačínej od nuly.` : prompt
    try { r = await agent(p, opts) } catch (e) { log(`${label}: spuštění selhalo (${String(e && e.message || e).slice(0, 120)})`) }
    if (r) return r
    if (i < 2) { log(`${label}: agent nevrátil výsledek, opakuji (${i + 1}/2)`); await cekej(15000 * (i + 1)) }
  }
  return null
}
// Štafeta: agent, který práci předal (zpráva PŘEDÁVKA z hooku hlídače kontextu), dostane nástupce se stejným zadáním
// a předávkou. Nástupce vrací návrat za celé zadání včetně práce předchůdce. Nejvýš 3 předávky, čtvrtá je selhání fáze.
// Předávka platí jen jako cesta, kterou jmenuje hook (docs/reviews/predavka-<agent_id>.md), a jen nová: v revizi 1.4.0 vyplnil
// agent pole textem „žádná“ a nástupce zopakoval cestu předchůdce; obojí blok bral jako další předávku a po třetí fázi zahodil.
// Relativní cesta platí taky a doplní se na absolutní (1.6.0): v běhu web-rijen vrátily části řezu 10 cestu bez úvodního lomítka
// a blok jejich návrat bral jako konečný.
const MAX_PREDAVEK = 3
const PREDAVKA_CESTA = /(^|\/)docs\/reviews\/predavka-[^/\s]+\.md$/
const predavkaCesta = p => { const t = S(p).trim(); return !PREDAVKA_CESTA.test(t) ? '' : t.startsWith('/') ? t : `${cwd}/${t.replace(/^\.\//, '')}` }
let predavekCelkem = 0
// Labely, jejichž fáze skončila na stropu předávek (se stropem té fáze; část nad stropem má 5): důvod selhání je strop, ne „agent
// nevrátil výsledek“ (to je jiná vada).
const vycerpane = new Map()
const nic = (label, kdo) => vycerpane.has(label) ? `${kdo}: strop předávek vyčerpán (${vycerpane.get(label)} předávky, ${label})` : `${kdo} nevrátil výsledek`
// Fáze na stropu předávek: poslední předávka pro další pokus (klíč = label bez čísla pokusu) a seznamy předchůdců, které by se
// jinak ztratily s fází (běh web-rijen: K8 řezu 10 postupovala, pokus 2 začal od nuly a 15 follow-upů řetězu se ztratilo).
const posledniPredavka = new Map()
const klicFaze = label => S(label).replace(/:\d+$/, '')
const zeStropu = { follow: [], odch: [], pasti: [] }
const SPOLECNE_SEZNAMY = [['follow_ups', 'follow'], ['odchylky_od_prd', 'odch'], ['pasti_opravene', 'pasti']]
// Implementační agent, který vrátil castecne bez platné předávky, práci nedokončil (běh web-rijen: K3 řezu 10 hotová ze dvou třetin,
// K4 „není hotová“, a na obou stavěly K8 a K9). Dostane nástupce, který se počítá do stropu; druhé castecne bez předávky je selhání.
const NASLEDNIK_CASTECNE = 'Předchůdce práci nedokončil a předávku nezapsal. Stav zjisti z `git diff` a `git status` nad soubory svého zadání a z PRD. Dodělej, co chybí; hotové neopakuj. Strukturovaný návrat vrať za celé zadání.'
async function runSePredavkou(prompt, opts) {
  const { maxPredavek = MAX_PREDAVEK, ...o } = opts
  const label = o.label || 'agent'
  vycerpane.delete(label)
  let r = await run(prompt, o)
  const predane = [], mezi = [], nesene = []
  let castecneBez = 0
  for (let n = 1; r; n++) {
    const surova = S(r.predavka).trim()
    const soubor = predavkaCesta(surova)
    let navaz
    if (soubor && !predane.includes(soubor)) {
      predane.push(soubor)
      // Platná předávka je postup: castecne bez předávky se počítá jen dvakrát za sebou, ne kdekoli v řetězu.
      castecneBez = 0
      navaz = `Navazuješ na předchůdce, který práci na tomto zadání předal. Nejdřív přečti předávku ${soubor} a pokračuj od ní: hotové neopakuj, co předávka uvádí jako ověřené, znovu neověřuj, stav stromu si potvrď přes git status. Strukturovaný návrat vrať za celé zadání včetně práce předchůdce (počty, seznamy, follow-upy a nálezy z předávky).`
    } else {
      if (surova) log(`${label}${n > 1 ? `:n${n}` : ''}: pole predavka „${surova.slice(0, 160)}“ není nová předávka (${predane.includes(soubor) ? 'cesta předávky předchůdce' : 'není cesta docs/reviews/predavka-….md'})${r.stav === 'castecne' ? '' : '; návrat beru jako konečný'}`)
      if (r.stav !== 'castecne') break
      if (++castecneBez > 1) {
        log(`${label}: nástupce vrátil znovu castecne bez předávky; fáze selhala`)
        r = { ...r, stav: 'selhalo', souhrn: `práce nedokončená ani nástupcem (castecne bez předávky dvakrát za sebou): ${S(r.souhrn).slice(0, 600)}` }
        break
      }
      // Seznamy předchůdce bez předávky nese blok: nástupce je bez předávky nezná.
      nesene.push(r)
      navaz = NASLEDNIK_CASTECNE
    }
    mezi.push(r)
    predavekCelkem++
    if (n > maxPredavek) {
      vycerpane.set(label, maxPredavek)
      if (predane.length) posledniPredavka.set(klicFaze(label), predane[predane.length - 1])
      for (const x of mezi) for (const [pole_, kam] of SPOLECNE_SEZNAMY) zeStropu[kam].push(...pole(x[pole_]))
      log(`${label}: předávky vyčerpány (${n}. předávka, strop ${maxPredavek}); fáze selhala na stropu předávek, ne na chybějícím výsledku (${soubor || 'castecne bez předávky'})`)
      return null
    }
    log(`${label}: ${soubor && navaz !== NASLEDNIK_CASTECNE ? `předávka ${n}/${maxPredavek} (${soubor})` : `castecne bez předávky, nástupce ${n}/${maxPredavek}`}`)
    r = await run(`${prompt}\n\n${navaz}`, { ...o, label: `${label}:n${n + 1}` })
  }
  if (r && nesene.length) for (const [pole_] of SPOLECNE_SEZNAMY) r[pole_] = [...nesene.flatMap(x => pole(x[pole_])), ...pole(r[pole_])]
  // Fáze doběhla: zápis stavu ze stropu v dřívějším pokusu je zastaralý a pozdější pokus na něj nenavazuje.
  if (r) posledniPredavka.delete(klicFaze(label))
  return r
}
// Zápis stavu fáze, která v minulém pokusu skončila na stropu: další pokus na něj naváže, nezačíná od nuly.
const navazText = klic => posledniPredavka.has(klic) ? `Minulý pokus této fáze nedoběhl na stropu štafety; jeho poslední zápis stavu je ${posledniPredavka.get(klic)}: nejdřív ho přečti a pokračuj od něj, hotové neopakuj, stav stromu si potvrď přes git status.\n` : ''
// Fáze toku, ve které se právě spouští (pro značku obnovy); vstup() ji nastaví spolu s fází zobrazení.
let fazeObn = ''
const vstup = (titul, faze) => { phase(titul); fazeObn = faze }
// Všechna volání agentů jdou přes spust(): předávka a značka obnovy na konci zadání. Deploy po obnově může najít commit řezu
// a fix(security) z přerušeného běhu (infra pád po commitu): bez věty by je commitnul podruhé (revize 1.4.0).
const OBNOVA_COMMITU = ' Commit řezu nebo fix(security) z přerušeného běhu může už existovat (git log --grep): nový nedělej, vrať jejich hashe; změny pracovního stromu, které v nich nejsou, commitni dalším commitem.'
// Odklad nasazení (1.7.0, shodně s deploy.md): stav odlozeno s časem nejdriv místo infra selhání nebo čekání přes noc.
const ODKLAD = 'Když nasazení nebo krok po něm nesmí podle zakázaného okna, runbooku nebo podmínky z PRD proběhnout dřív než za ~30 minut (včetně rezervy okna), dál nic nenasazuj ani nespouštěj a vrať stav odlozeno s nejdriv (ISO 8601 s časovou zónou) a duvod; commit řezu smí proběhnout (vrať ho v commit) a kroky, které už proběhly, vrať v kroky_po_nasazeni, odložené vynech. Odklad není infra selhání; kratší čekání počkej.'
// První nasazení pokusu jde před E2E: commit obnovy v běhu sonnet-5-5 (7f6d9723, opravy z druhého review) dostal zprávu „dorovnání
// stavby po E2E“, ačkoli E2E před ním neproběhlo.
const OBNOVA_BEZ_E2E = ' Zprávu dalšího commitu odvoď z jeho obsahu; E2E v tomto pokusu ještě neproběhlo, „po E2E“ do ní nepiš.'
const spust = (prompt, opts) => runSePredavkou(obnovaOd >= 0 && P >= obnovaPokus && FAZE_OBNOVY.indexOf(fazeObn) >= obnovaOd
  ? `${prompt}\nObnova běhu (${obnovaZnacka}): výsledek této fáze z přerušeného běhu neplatí; změř a proveď ji znovu nad dnešním stavem.${opts.agentType === 'dev-pipeline:deploy' ? `${OBNOVA_COMMITU}${/:1$/.test(S(opts.label)) ? OBNOVA_BEZ_E2E : ''}` : ''}` : prompt, opts)
// Rámec každého agenta bloku (1.8.0, § 3 A1): kontext řezu, args majitele a pět vět: autonomie, vize-spory s definicí konzervativní
// volby odkazem (§ 2.1), návrat strojově, společná pravidla odkazem na TVAR-DOKUMENTU.md (čekání na proces na pozadí, souběh ve stromu,
// pojmenování souborů, čtení po sekcích; v zadání se neopakují), hranice souborů. Každá věta pod 40 slov (test sedimentu počítá
// duplicity řádků mezi bloky).
const ramec = [
  `Projekt: ${cwd} (absolutní cesty; commity jen na vize větvi, nikdy na main).`,
  `Řez ${NN}: PRD ${prdPath} · E2E ${e2ePath} · vize ${a.vize}.`,
  'Běh je autonomní: uživatele se neptáš a vykonáváš jen svou fázi, další spouští workflow.',
  `Rozpor s vizí zapiš do docs/vize-spory.md s citací řádku vize a pokračuj; tvar záznamu a definici konzervativní volby má ${tvar}, sekce Vize-spory.`,
  'Obsahová, právní a etická rozhodnutí nejsou tvoje: udělej, co vize říká, a riziko zapiš jako otázku s navrženou odpovědí „ponechat“.',
  ...(neCile ? [`Ne-cíle vize platí pro každou fázi včetně oprav (změna, která je porušuje, se nedělá; nález jde do follow-upu s důvodem): ${neCile}`] : []),
  ...(rozhodnutiMajitele ? [`Rozhodnutí majitele pro tento běh (závazná, mají přednost před vlastním výkladem vize): ${rozhodnutiMajitele}`] : []),
  ...(mazane.length ? [`Pozdější řádek plánu maže: ${mazane.join(' · ')}. Nepřidávej tam symboly, testy ani závislosti; co tam řez potřebuje, patří jinam.`] : []),
  'Tah končí jen strukturovaným návratem podle schématu: textová pole stručně; co se nevejde, zapiš do souboru v docs/reviews/ (jen .md a .json) a vrať cestu.',
  `Společná pravidla agentů běhu (čekání na proces na pozadí, souběh ve sdíleném stromu, pojmenování souborů, čtení dokumentů po sekcích) a tvar dokumentů: ${tvar}; čti sekci Společná pravidla agentů a sekce své role (PRD a E2E, Vize-spory, Follow-ups, Čekání na čas).`,
  'docs/handoff.md je stav orchestrátora, ne tvůj vstup: nečti ho; co máš vědět, je v tomto zadání.',
  'Hranice: měníš jen soubory své role podle zadání; cizí soubory a rozpracovanou práci jiných agentů nevracíš (git checkout, restore, stash, clean; guard je blokuje) ani neformátuješ.',
].join('\n')
const M = { opusH: { model: 'opus', effort: 'high' }, opusM: { model: 'opus', effort: 'medium' }, sonL: { model: 'sonnet', effort: 'low' }, sonM: { model: 'sonnet', effort: 'medium' } }

// ---------- schémata ----------
const str = d => ({ type: 'string', description: d })
const arr = d => ({ type: 'array', items: { type: 'string' }, description: d })
const PREDAVKA = { predavka: str(`jen absolutní cesta k TVÉ předávce (${cwd}/docs/reviews/predavka-<tvoje agent id>.md), když tě vyzvala zpráva PŘEDÁVKA a práce ještě není hotová; když je zadání hotové, nevyplňuj; cestu předávky předchůdce sem nikdy nevracej`) }
const IMPL = { type: 'object', required: ['stav', 'souhrn', 'typecheck', 'testy_zelene'], properties: {
  stav: { type: 'string', enum: ['hotovo', 'castecne', 'selhalo', 'prostredi'], description: 'prostredi = kód je odevzdaný, ale kritérium nebo krok nejde změřit kvůli prostředí (síť, cizí služba, měřicí stanoviště), ne kvůli kódu; vyžaduje dukaz' },
  dukaz: str('jen při prostredi: příkaz, chybový text a čas, které vadu prostředí dokládají; bez důkazu blok bere stav jako selhalo'),
  navrh: str('jen při prostredi: navržená odpověď pro majitele (odkud měřit, nebo přijmout)'),
  souhrn: str('max 10 řádků: co je postavené, čím je to ověřené'),
  oblasti: arr('změněné oblasti nebo moduly (ne výčet souborů)'),
  soubory: arr('změněné a nové soubory, cesty relativní ke kořeni projektu'),
  mimo_hranici: { type: 'array', items: { type: 'object', required: ['soubor', 'co'], properties: { soubor: { type: 'string' }, co: { type: 'string', description: 'co a proč' } } }, description: 'jen část řezu: potřebné změny mimo tvé soubory (jiná část, kontrakt, sdílený soubor); provede je integrace' },
  zmenena_mista: arr('soubor a symbol nebo oblast, kde jsi měnil'),
  typecheck: { type: 'boolean' }, testy_zelene: { type: 'boolean' }, novych_testu: { type: 'integer' },
  odchylky_od_prd: arr('vědomé odchylky od PRD a proč'),
  pasti_opravene: arr('pasti v kódu, které jsi místo dokumentování opravil'),
  follow_ups: arr('resty mimo rozsah řezu, každý jednou větou s kontextem'),
  spory: arr('nové záznamy ve vize-spory'),
  souhrn_path: str('cesta k delšímu souhrnu v docs/reviews/, když byl potřeba'),
  ...PREDAVKA,
} }
// Soubory nápravy nálezu BLOCKER/HIGH: náprava strukturálního nálezu často leží jinde než nález (běh web-podzim: ~35 z 53
// odmítnutých nálezů bylo „mimo mé soubory“, protože balíček dostal soubor s nálezem, ne soubor s nápravou).
const NAPRAVY = { type: 'array', items: { type: 'object', required: ['id', 'soubory'], properties: { id: { type: 'string' }, soubory: arr('soubory, které náprava nálezu mění (nemusí to být soubor s nálezem), cesty relativní ke kořeni projektu') } }, description: 'jen nálezy BLOCKER a HIGH: kde leží jejich náprava' }
const THERMO = { type: 'object', required: ['blokeru', 'nalezu', 'report_path', 'soubory'], properties: { blokeru: { type: 'integer', description: 'nálezy, které rubrika označuje za blokující' }, nalezu: { type: 'integer' }, report_path: str('absolutní cesta k reportu'), soubory: arr('soubory s nálezy BLOCKER a HIGH, cesty relativní ke kořeni projektu'), napravy: NAPRAVY, souhrn: str('max 3 řádky'), ...PREDAVKA } }
const FIX = { type: 'object', required: ['opraveno', 'opravene_ids', 'zmenena_mista', 'typecheck', 'testy_zelene'], properties: {
  opraveno: { type: 'integer' },
  // Bez seznamu opravených id blok nepozná, který FOLLOW-UP nález balíčku zůstal (běh web-rijen: 0 z 60 do follow-upů).
  opravene_ids: arr('identifikátory nálezů ze zadání, které jsi opravil'),
  odmitnuto: { type: 'array', items: { type: 'object', required: ['id', 'duvod'], properties: { id: { type: 'string' }, duvod: { type: 'string' }, blokuje: { type: 'boolean', description: 'nález byl BLOKUJE' } } }, description: 'nálezy, které jsi po ověření neopravil, s důvodem' },
  jinak_nez_nalez: arr('kde jsi opravil jinou příčinu, než nález tvrdil, a proč'),
  zmenena_mista: arr('soubor a symbol nebo oblast, kde jsi měnil'),
  rozsireny_zasah: { type: 'boolean', description: 'nový plošný mechanismus, sdílený layout či helper, nebo soubory mimo nálezy' },
  rozsireny_popis: str('co přesně a proč'),
  typecheck: { type: 'boolean' }, testy_zelene: { type: 'boolean' },
  follow_ups: arr('nálezy mimo rozsah řezu, které jsi neopravil'),
  security: { type: 'boolean', description: 'true = bezpečnostní oprava; necommituješ ji, commitne ji deploy samostatně' },
  // Nový krok nad platformou z opravy po E2E (§ 2.4): bez opory v Povolení se nenasazuje a jde majiteli jako otázka.
  novy_krok_po_nasazeni: { type: 'array', items: { type: 'object', required: ['krok', 'duvod'], properties: { krok: { type: 'string' }, duvod: { type: 'string' }, opora: { type: 'string', description: 'doslovná citace řádku Povolení z PRD nebo rozhodnutí majitele, které krok dovoluje; bez opory nech prázdné' }, kriterium: { type: 'string', description: 'kritérium (značka s názvem), kvůli kterému krok vznikl' } } }, description: 'operace nad platformou nebo živým systémem, kterou oprava vyžaduje a PRD ji v krocích po nasazení nejmenuje; sám ji neprováděj, nepřipravuj v konfiguraci ani nepiš do PRD' },
  ...PREDAVKA,
} }
const REVIEW = { type: 'object', required: ['nalezu', 'blokujicich', 'balicky', 'report_path'], properties: {
  nalezu: { type: 'integer' }, blokujicich: { type: 'integer' }, report_path: str('absolutní cesta k reportu'),
  balicky: { type: 'array', items: { type: 'object', required: ['soubory', 'nalezy'], properties: { soubory: arr('disjunktní množina souborů'), nalezy: arr('identifikátory nálezů z reportu'), security: { type: 'boolean' } } } },
  follow_up_ids: arr('nálezy, které nejsou k opravě v řezu (FOLLOW-UP)'),
  ...PREDAVKA,
} }
const VERIFY = { type: 'object', required: ['typecheck', 'proslo', 'selhalo', 'exit_kod', 'kontroly_ok', 'meridla_ok'], properties: {
  typecheck: { type: 'boolean' }, proslo: { type: 'integer' }, selhalo: { type: 'integer' },
  exit_kod: { type: 'integer', description: 'návratový kód příkazu testů (EXIT=$? čtený zvlášť, ne přes rouru)' },
  z_cache: { type: 'boolean', description: 'true = runner vrátil výsledek testů nebo typechecku z cache, měření neproběhlo' },
  kontroly: arr('kontroly z pre-commit hooku projektu s výsledkem'),
  kontroly_ok: { type: 'boolean', description: 'všechny kontroly z pre-commit hooku prošly; true, když projekt pre-commit hook nemá' },
  meridla: arr('ID · příkaz · výsledek · ok|FAIL'),
  meridla_ok: { type: 'boolean', description: 'všechna měřidla kritérií prošla; true, když PRD žádné měřidlo nemá' },
  selhavajici: arr('jména selhávajících testů a chyby typecheck s file:line, max 20'), vystup_path: str('soubor s plným výstupem'), prikazy: arr('spuštěné příkazy'),
  marker: str('hash stromu z verify-marker.sh při zelené bráně, jinak prázdné'),
  ...PREDAVKA,
} }
// Taxonomie stavů kroků po nasazení (1.7.0, shodně s deploy.md bod 7): podmíněný krok, jehož podmínka nenastala, vrátil deploy řezu
// 04 v běhu sonnet-5-5 jako vynechano a blok to vzal jako selhání nasazení (pokus 2, 11 min).
const KROKY_STAVY = 'provedeno (proběhl a jeho ověření z PRD prošlo), selhalo (proběhl a ověření neprošlo, nebo šel provést a neproběhl), nevztahuje-se (podmínka kroku z PRD je vyhodnocená a nenastala; v důvodu podmínka a naměřená hodnota), vynechano (jen krok, který provést nejde, například cíl neexistuje; s důvodem; je selhání nasazení) nebo pro-majitele (jen krok, který PRD výslovně vede jako ruční nebo neblokující krok majitele; blokující krok bez oprávnění je infra selhání)'
const DEPLOY = { type: 'object', required: ['stav', 'commit'], properties: {
  // Odklad (1.7.0) není infra selhání: v běhu sonnet-5-5 vrátil deploy řezu 03 odklad jako infra a orchestrátor naplánoval obnovu
  // na 07:07, ačkoli nasadit šlo od ~02:30. Blok zastaví s časem nejdriv a obnovu orchestrátor plánuje přesně na něj.
  stav: { type: 'string', enum: ['success', 'failed', 'commit-only', 'odlozeno'] },
  nejdriv: str('jen při odlozeno: nejdřívější čas, kdy nasazení nebo odložený krok smí proběhnout, ISO 8601 s časovou zónou'),
  commit: str(`40 znaků: poslední commit „rez ${NN}“ (git log --grep), i když tento běh nový commit řezu nevytvořil (dorovnání prostředí, jen fix(security)); git rev-parse, nikdy commit zápisu nasazení, nikdy dopočítaný ani zkrácený`),
  commit_zapisu: str('hash samostatného commitu zápisu nasazení'),
  // Kroky se párují podle čísla z PRD (1.6.0): deploy agent text kroku parafrázuje a párování podle textu v běhu web-rijen selhalo.
  kroky_po_nasazeni: { type: 'array', items: { type: 'object', required: ['krok', 'stav'], properties: { id: { type: 'integer', description: 'číslo kroku z číslovaného seznamu sekce PRD; vracej vždy' }, krok: { type: 'string', description: 'text kroku z PRD' }, stav: { type: 'string', enum: ['provedeno', 'selhalo', 'nevztahuje-se', 'vynechano', 'pro-majitele'] }, duvod: { type: 'string' } } }, description: `kroky ze sekce PRD „Nasazení a kroky po něm“: ${KROKY_STAVY}` },
  infra: { type: 'boolean', description: 'true = selhání mimo kód řezu: přihlášení nebo účet CLI, oprávnění, výpadek platformy; opakování pokusu bez zásahu člověka nepomůže' },
  report_path: str('absolutní cesta k zápisu nasazení'),
  security_commity: arr('hashe samostatných commitů fix(security)'),
  security_radkem: str('hash commitu řezu, do jehož zprávy jsi dal řádek fix(security) (bezpečnostní oprava bez samostatného commitu); jinak prázdné'),
  health: str('první řádek „aplikace: <app>@<verze nebo deployment id> nasazeno | <app> nenasazeno (<důvod z diffu>) | …“ za každou aplikaci, které se diff od báze dotkl; pak doklad, že běží: status platformy + behaviorální doklad (nebo odložený se změřenou baseline, nebo neexistuje s důvodem)'), url: str(''),
  duvod: str('při failed: přesná chyba'),
  // Dveře a dosah řezu (§ 2.9): závěrečná zpráva podle nich ukáže, kde se dívat pečlivě.
  dvere: { type: 'string', enum: ['jednosměrné', 'obousměrné'], description: 'jednosměrné, když nasazení nese doklad před nasazením, migraci, zápis podle Povolení, odeslání zprávy, mazání nebo cokoli, co jeden revert nevrátí; jinak obousměrné' },
  dosah: str('jedno slovo: web | admin | data | zóna | platforma'),
  ...PREDAVKA,
} }
// Stav přerušeného běhu při obnově (§ 2.3): deploy agent v režimu obnova-stav čte zápis nasazení, nic nemění.
const OBNOVA_STAV = { type: 'object', required: ['head_shodny', 'nasazeni_dolozeno'], properties: {
  commit_rezu: str('40 znaků: commit řezu ze zápisu nasazení (git rev-parse, nikdy dopočítaný); bez zápisu prázdné'),
  head_shodny: { type: 'boolean', description: 'git rev-parse HEAD je commit řezu, nebo pozdější commit, který od něj mění jen docs/' },
  nasazeni_dolozeno: { type: 'boolean', description: 'zápis nasazení dokládá úspěšné nasazení commitu řezu' },
  provedene_kroky: { type: 'array', items: { type: 'object', required: ['krok'], properties: { id: { type: 'integer', description: 'číslo kroku z PRD' }, krok: { type: 'string' } } }, description: 'kroky po nasazení, které v přerušeném běhu proběhly se stavem provedeno (ze zápisu nasazení)' },
  poznamka: str('co chybí nebo nesedí'),
  ...PREDAVKA,
} }
const E2E = { type: 'object', required: ['vysledek', 'celkem', 'pass', 'castecne', 'fail', 'report_path'], properties: {
  vysledek: { type: 'string', enum: ['pass', 'pass-castecne', 'fail', 'vada-kriteria', 'prostredi'] }, celkem: { type: 'integer' }, pass: { type: 'integer' }, castecne: { type: 'integer' }, fail: { type: 'integer' },
  fail_kriteria: { type: 'array', items: { type: 'object', required: ['kriterium', 'selhani'], properties: { kriterium: str('značka kritéria s názvem („AK7 Rozpad útraty podle modelu“)'), selhani: str('jednou větou co selhalo (skutečné selhání implementace)'), pricina_mimo_rez: { type: 'object', required: ['dukaz'], properties: { dukaz: str('důkaz, že příčina leží mimo hranici řezu: jiný modul, infrastruktura, cizí služba') }, description: 'jen když příčina FAIL prokazatelně leží mimo hranici řezu (§ 2.12)' } } }, description: 'skutečná selhání implementace' }, castecna_kriteria: arr('co se ověřilo jen zčásti a čím je nesena druhá půlka'),
  vadna_kriteria: arr('kritérium (značka s názvem, „AK7 Rozpad útraty podle modelu“) + doklad jednoho ze čtyř druhů: nesplnitelné v prostředí E2E (credential, měří se až po uzavíracím commitu) / koliduje s jiným kritériem nebo Ne-cílem vize / nález je předřezový (existoval před řezem) a řez ho nemá v rozsahu / scénář zastaral po opravě (odporuje odchylce od PRD nebo rozšířenému zásahu opravy ze zadání); nic jiného sem nepatří'),
  zavazne_mimo_ak: arr('bezpečnostní a datové nálezy mimo kritéria'), kosmeticke: arr('kosmetické regresní postřehy'), report_path: str('absolutní cesta k reportu'),
  prostredi_nasazeni: str('prázdné, když je nasazení v pořádku; jinak vada nasazení, kterou dorovná deploy, ne fix agent: nasazená revize není commit řezu, aplikace nedostupná, přihlášení ze zadání nefunguje'),
  // Kritéria, která nejde změřit kvůli prostředí (§ 2.2): hned v kole 1, s důkazem a návrhem; nestojí pokus, jdou majiteli jako otázka.
  prostredi: { type: 'array', items: { type: 'object', required: ['kriterium', 'dukaz'], properties: { kriterium: str('značka kritéria s názvem'), sekce: str('sekce scénářů'), dukaz: str('příkaz, chybový text a čas: proč měření nejde provést kvůli prostředí (nestálá síť, chyba cizí služby, stanoviště je tento stroj proti produkci)'), navrh: str('navržená odpověď pro majitele: odkud měřit, nebo přijmout') } }, description: 'kritéria, která nejde změřit kvůli prostředí; do fail se nepočítají; bez důkazu je blok počítá jako FAIL' },
  ...PREDAVKA,
} }
const DOKLAD = { type: 'object', required: ['ok', 'path'], properties: { ok: { type: 'boolean', description: 'true jen tehdy, když uspěl každý předepsaný bod dokladu' }, path: str('absolutní cesta k dokladu'), souhrn: str('max 5 řádků: co je zachyceno (tabulky, počty, vzorky) a čím'), duvod: str('při ok false: proč doklad nejde pořídit (chybí přístup, dotaz selhal)'), ...PREDAVKA } }
const DIAG = { type: 'object', required: ['pricina', 'doporuceni', 'smycka_postavena'], properties: { pricina: str('file:line + mechanismus'), doporuceni: str('co má třetí pokus udělat jinak'), smycka_postavena: { type: 'boolean' }, repro_path: str('cesta k reprodukčním artefaktům'), ...PREDAVKA } }
const CLOSE = { type: 'object', required: ['ok', 'thermo_nesesouhlaseno', 'chybejici_doklady'], properties: {
  ok: { type: 'boolean' }, poznamka: str('co se nepodařilo zapsat'),
  commit_overeny: str(`40 znaků: commit řezu ověřený git cat-file -t a zprávou „rez ${NN}“ (i když se shoduje se zadáním); nikdy dopočítaný`),
  chybejici_commity: arr('bezpečnostní commity ze zadání, které v repu neexistují'),
  thermo_nesesouhlaseno: { type: 'integer', description: 'nálezy BLOCKER/HIGH z thermo reportů, u kterých v journalu není ani „opraveno“, ani follow-up s odvozením' },
  chybejici_doklady: arr('artefakty, které PRD nebo vize předepisuje jako doklad řezu (měření, export, report v repu) a v commitu nejsou'),
  kontext: str(`souhrn záznamů řezu ${NN} z docs/.kontext.jsonl: nejvyšší hodnota podle typu agenta, počet compactů a předávek`),
  vysledek_soubor: str(`cesta k docs/.vysledek-stavba-${NN}.json, když jsi ho zapsal; jinak prázdné`),
  ...PREDAVKA,
} }
// Uzavření zastaveného bloku (1.7.0) jen zapíše seznamy do souboru: výsledek přerušeného běhu runtime při obnově přepíše a v běhu
// sonnet-5-5 se tak ze stavby 03 ztratilo 87 follow-upů, 37 odchylek a 29 pastí (do follow-ups a journalu došly jen zčásti).
const ZASTAVENO = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, vysledek_soubor: str(`cesta k docs/.vysledek-stavba-${NN}-zastaveno.json, když jsi ho zapsal; jinak prázdné`), poznamka: str('co se nepodařilo zapsat'), ...PREDAVKA } }
const CHECK = { type: 'object', required: ['verdikt', 'nalezu', 'blokujicich', 'report_path'], properties: {
  verdikt: { type: 'string', enum: ['ready', 'needs-fixes'] }, nalezu: { type: 'integer' }, blokujicich: { type: 'integer' },
  report_path: str('absolutní cesta k reportu'), nalezy_ids: arr('identifikátory nálezů v reportu (N1, N2, …), blokující první'),
  ...PREDAVKA,
} }
const PRD_FIX = { type: 'object', required: ['zmenena_mista'], properties: {
  zmenena_mista: arr('sekce nebo kritéria PRD/E2E, která se změnila'), odmitnute: { type: 'array', items: { type: 'object', required: ['id', 'duvod'], properties: { id: { type: 'string' }, duvod: { type: 'string' } } } },
  souhrn: str('max 5 řádků: co se v PRD změnilo a proč'), spory: arr('nové záznamy ve vize-spory'),
  ...PREDAVKA,
} }

// ---------- vyhodnocení ----------
// Zelená jen nad doloženým měřením: exit kód testů 0, aspoň jeden prošlý test, nic z cache, kontroly pre-commitu a měřidla kritérií
// (v běhu bez-dluhu pustila brána zelenou nad neproběhlou suitou a řez 20 padl na verify:arch, který brána nespustila).
const zelena = v => !!v && v.typecheck === true && v.selhalo === 0 && v.exit_kod === 0 && v.proslo > 0 && v.z_cache !== true && v.kontroly_ok !== false && v.meridla_ok !== false
const meridlaFail = v => { const m = trimList(v && v.meridla); const f = m.filter(x => /FAIL/.test(x)); return f.length ? f : m }
const branaDuvod = v => !v ? 'verify bez výsledku' : [
  v.typecheck !== true ? 'typecheck červený' : '',
  v.selhalo !== 0 ? `selhalo ${v.selhalo} testů` : '',
  v.exit_kod !== 0 ? `testy skončily kódem ${v.exit_kod}` : '',
  !(v.proslo > 0) ? 'žádný prošlý test (suita neproběhla)' : '',
  v.z_cache === true ? 'výsledek z cache (spusť s --force)' : '',
  v.kontroly_ok === false ? `kontroly pre-commitu: ${trimList(v.kontroly).slice(0, 8).join(' | ') || 'červené'}` : '',
  v.meridla_ok === false ? `měřidla: ${meridlaFail(v).slice(0, 8).join(' | ') || 'červená'}` : '',
].filter(Boolean).join('; ') || 'červená'
const normMimo = xs => pole(xs).map(m => m && typeof m === 'object' ? { soubor: norm(m.soubor), co: S(m.co).trim().slice(0, 400) } : { soubor: '', co: S(m).trim().slice(0, 400) }).filter(m => m.soubor || m.co)
// Krok po nasazení se stavem selhalo (proběhl, ověření z PRD neprošlo) nebo vynechano je selhání nasazení, když blok nasazoval
// (stav success): v řezu 1 běhu bez-dluhu deploy kroky z PRD vědomě vynechal a E2E pak dvakrát hlásilo vadu prostředí.
// Výjimky z běhu web-podzim: krok, který předchozí nasazení téhož řezu v tomto bloku provedlo, se nepouští znovu (řez 04 padl na
// krocích „provedeno v nasazení 1“ a pokus 2 přepsal doklad před migrací), a krok pro majitele (ruční nebo neblokující krok
// z PRD; blokující krok bez oprávnění je infra selhání) jde do rozhodnutí (řez 11 padl na ručním kroku, zatímco skutečné selhání ověření prošlo jako
// „provedeno“). Při commit-only nasazuje majitel a kroky po nasazení jsou jeho práce (revize 1.4.0).
// Párování kroků mezi nasazeními podle čísla kroku z PRD (1.6.0), bez čísla podle textu (malá písmena, bez mezer na krajích):
// v běhu web-rijen deploy text kroku parafrázoval a řez 2 kvůli tomu potřeboval tři pokusy. Provedený krok se zapisuje z každého
// nasazení, ve kterém proběhl, i když nasazení jako celek selhalo na jiném kroku.
const normKrok = s => S(s).trim().toLowerCase()
const idKroku = k => k && k.id != null && S(k.id).trim() !== '' && Number.isFinite(Number(k.id)) ? Math.floor(Number(k.id)) : null
const provedeneKroky = new Map()
const krokyStav = (d, stav) => pole(d && d.kroky_po_nasazeni).filter(k => k && k.stav === stav)
const fmtKrok = k => `${idKroku(k) != null ? `${idKroku(k)}. ` : ''}${S(k.krok)}${k.duvod ? ` (${S(k.duvod)})` : ''}`
const zapisProvedene = d => {
  for (const k of krokyStav(d, 'provedeno')) {
    const t = `${idKroku(k) != null ? `${idKroku(k)}. ` : ''}${S(k.krok).trim()}`
    if (idKroku(k) != null) provedeneKroky.set(`#${idKroku(k)}`, t)
    provedeneKroky.set(`t:${normKrok(k.krok)}`, t)
  }
}
const bylProveden = k => (idKroku(k) != null && provedeneKroky.has(`#${idKroku(k)}`)) || provedeneKroky.has(`t:${normKrok(k.krok)}`)
const vynechane = d => krokyStav(d, 'vynechano').map(fmtKrok)
const chybneKroky = d => [...krokyStav(d, 'selhalo').map(k => `selhal ${fmtKrok(k)}`), ...krokyStav(d, 'vynechano').filter(k => !bylProveden(k)).map(k => `vynechán ${fmtKrok(k)}`)]
// Krok nevztahuje-se (podmínka z PRD vyhodnocená a nenastala, 1.7.0) chybou není; chybneKroky bere jen selhalo a vynechano.
const chybaNasazeni = (d, k) => !d ? nic(`deploy:řez ${NN}:${k}`, 'deploy agent') : d.stav === 'failed' ? S(d.duvod) || 'deploy selhal' : d.stav === 'odlozeno' ? `nasazení odloženo${S(d.nejdriv).trim() ? ` do ${S(d.nejdriv).trim()}` : ''}: ${S(d.duvod) || 'bez důvodu'}` : d.stav === 'success' && chybneKroky(d).length ? `krok po nasazení: ${chybneKroky(d).join(' | ').slice(0, 600)}` : ''
// Odklad bez platného času nejdriv (revize 1.7.0, plan-check 6, code-review N6) nemá na kdy naplánovat obnovu: orchestrátor by
// tiše stál. Bere se proto jako infra zastavení (g) s otázkou, ne jako odklad.
const platnyCas = v => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(S(v).trim())
const odkladBezCasu = d => !!(d && d.stav === 'odlozeno' && !platnyCas(d.nejdriv))
const infra = d => !!(d && ((d.stav === 'failed' && d.infra) || odkladBezCasu(d)))
const odlozeno = d => !!(d && d.stav === 'odlozeno' && platnyCas(d.nejdriv))
// Zastavení bloku bez spotřeby pokusu: infra selhání čeká na člověka, odklad na čas nejdriv.
const zastavit = d => infra(d) || odlozeno(d)

// ---------- balíčky oprav ----------
// Balíčky z více review (u částí review každé části, integrační review a review opravy) se sloučí do disjunktních množin
// souborů jako v kolečku (třída L: nesloučený balíček rozbil bránu, která má jen jednu opravu, a pokus padl).
const balickyZ = r => (r && r.balicky || []).map(b => ({ soubory: cesty(b.soubory), security: !!b.security, zdroje: [{ report: S(r.report_path), ids: trimList(b.nalezy) }] })).filter(b => b.soubory.length)
function sluc(balicky) {
  const out = []
  for (const b of balicky) {
    const hity = out.filter(o => o.soubory.some(f => b.soubory.includes(f)))
    if (!hity.length) { out.push({ ...b, soubory: [...b.soubory], zdroje: [...b.zdroje] }); continue }
    // Balíček, který spojí dva dosavadní, je sloučí oba: výsledek zůstane disjunktní.
    const [cil, ...dalsi] = hity
    for (const o of [b, ...dalsi]) { cil.soubory = trimList([...cil.soubory, ...o.soubory]); cil.security = cil.security || o.security; cil.zdroje.push(...o.zdroje) }
    for (const o of dalsi) out.splice(out.indexOf(o), 1)
  }
  return out
}
// Thermo nálezy jdou do téže vlny. Nález s nápravou (napravy) je malý balíček se soubory nápravy, soubor s nálezem bez nápravy
// balíček o jednom souboru; sluc() je připojí k balíčkům, kterých se dotýkají. Náprava napříč dvěma balíčky je spojí do jednoho:
// fix agent smí jen soubory svého balíčku a tentýž nález nesmí opravovat dva agenti (běh web-podzim: řez 13 opravovali dva
// souběžně, ~35 nálezů fix odmítl jako „mimo mé soubory“). Vrací nové pole balíčků, vstup nemění.
const thermoSoubory = th => trimList([...cesty(th.soubory), ...pole(th.napravy).flatMap(x => cesty(x && x.soubory))])
function pridejThermo(balicky, th) {
  const report = S(th.report_path)
  const napravy = pole(th.napravy).filter(x => x && cesty(x.soubory).length)
  const sNapravou = new Set(napravy.flatMap(x => cesty(x.soubory)))
  const mini = [
    ...napravy.map(x => ({ soubory: cesty(x.soubory), security: false, zdroje: [{ report, ids: trimList([x.id]), thermo: true }] })),
    ...cesty(th.soubory).filter(f => !sNapravou.has(f)).map(f => ({ soubory: [f], security: false, zdroje: [{ report, ids: [], thermo: true }] })),
  ]
  return sluc([...balicky, ...mini])
}
// Thermo nálezy s nápravou přidělené jiným balíčkům se jmenují (1.6.0): „ostatní BLOCKER a HIGH ve tvých souborech“ vzal v běhu
// web-rijen i nález, který opravoval jiný balíček, a tentýž nález dva fix agenti odmítli dvakrát.
const thermoIdsVsech = balicky => {
  const m = new Map()
  for (const b of balicky) for (const z of b.zdroje) if (z.thermo) m.set(z.report, trimList([...(m.get(z.report) || []), ...z.ids]))
  return m
}
const zdrojeText = (zdroje, vsechnyThermo = new Map()) => {
  const cr = new Map(), th = new Map()
  for (const z of zdroje) {
    if (z.thermo) th.set(z.report, trimList([...(th.get(z.report) || []), ...z.ids]))
    else cr.set(z.report, trimList([...(cr.get(z.report) || []), ...z.ids]))
  }
  return [...cr].map(([r, ids]) => ` Code-review report ${r}, tvoje nálezy: ${ids.join(', ') || 'všechny ve tvých souborech'}.`).join('')
    + [...th].map(([r, ids]) => {
      const cizi = (vsechnyThermo.get(r) || []).filter(x => !ids.includes(x))
      return ` Thermo report ${r}: ${ids.length ? `nálezy ${ids.join(', ')} (náprava je ve tvých souborech) a ostatní ` : 'nálezy '}BLOCKER a HIGH ve tvých souborech, které nejsou přidělené jinému balíčku${cizi.length ? ` (jiným balíčkům patří ${cizi.join(', ')})` : ''} (NOTE jen když leží na místě, které stejně měníš); nezaváděj nové plošné mechanismy, sporné nech jako follow-up.`
    }).join('')
}

// ---------- kroky ----------
// Refresh PRD: PRD vzniklo souběžně se stavbou předchozích řezů, tedy nad starším stromem. Delta prd-check jen nad
// kritérii a tvrzeními závislými na stavu stromu; při needs-fixes zapracování PRD agentem. Levnější než pokus navíc.
// Refresh i bez zestárlého PRD, když blok PRD vrátil blokující nálezy delty (1.6.0): v běhu web-rijen šly 3 blokující nálezy
// (řezy 01 a 11) jen implementaci, protože bez prd_stale se refresh nekonal. Pak přeměří jen je. Blokující se jmenují zvlášť
// od FORMULACÍ: agenti refreshe si je dřív dohledávali v reportech sami.
// Osy A (úplnost vůči řádku plánu a vizi), D a E (rozsah, optimalita) od 1.8.0 (§ 2.11) kontroluje až refresh: kolo 1 v bloku PRD
// ověřuje jen validitu proti kódu a kritéria.
const OSY_REFRESHE = ` Kontrola v bloku PRD ověřila jen technickou validitu proti kódu a kritéria; nad dnešním stromem proto zkontroluj i osy A (úplnost vůči řádku plánu a vizi), D a E (rozsah a optimalita), nálezy z nich jen BLOKUJE nebo OVĚŘIT PRVNÍ.${standardy}`
const hypBlokujici = hyp ? hyp.blokujici : []
const hypOstatni = hyp ? hyp.ids.filter(x => !hypBlokujici.includes(x)) : []
const hypVeta = () => !hyp ? '' : ` Zbylé nálezy kontroly PRD, které blok PRD neopravil (${hyp.report}), přeměř jako hypotézy nad dnešním stromem: ${hypBlokujici.length ? `blokující ${hypBlokujici.join(', ')} jako první, ` : ''}${hypOstatni.length ? `ostatní (formulace a zbytek) ${hypOstatni.join(', ')}` : hypBlokujici.length ? 'jiné nejsou' : 'všechny'}. Platný blokující zapiš do svého reportu jako nález (zapracování ho opraví), neplatný jmenuj v reportu jako ověřeně neplatný.${hyp.bezKontroly.length ? ` Tyto nálezy zapracoval blok PRD bez kontroly: ověř, že zapracování platí, a nové chyby v něm hlas jako blokující. Nálezy: ${hyp.bezKontroly.join(', ')}.` : ''}`
const refreshCheck = () => spust(`${ramec}

${prdStale.length
    ? `Úkol: delta prd-check PRD řezu ${NN} nad DNEŠNÍM stromem${sCastmi ? ` (${prdVse}; přeměř kostru a jen ty části, kterých se změny stromu týkají)` : ''}. PRD vzniklo před uzavřením těchto řezů: ${prdStale.join(' | ')}. Prověř VÝHRADNĚ kritéria a tvrzení PRD a E2E scénářů, která závisí na stavu stromu: výčty souborů a míst, počty, existence a jediné použití symbolů, premisy „jediný konzument“, cesty; každé takové kritérium přeměř spuštěním (rg, Serena, skript v repu), ne úsudkem.${OSY_REFRESHE}`
    : `Úkol: přeměř nad DNEŠNÍM stromem blokující nálezy kontroly PRD řezu ${NN}${sCastmi ? ` (${prdVse})` : ''}, které blok PRD neopravil${hyp && hyp.bezKontroly.length ? ' nebo zapracoval bez kontroly' : ''}; jiná kritéria nekontroluj. Každý nález přeměř spuštěním (rg, Serena, skript v repu), ne úsudkem.${OSY_REFRESHE}`}
${mapaText}${hypVeta()} Report do ${rep('prd-refresh', 1)}, vrať verdikt, počty a identifikátory nálezů.`,
  { label: `prd-refresh:řez ${NN}`, phase: 'Refresh PRD', agentType: 'dev-pipeline:prd-check', schema: CHECK, ...M.opusM })

const refreshFix = k => spust(`${ramec}

Úkol: zapracuj do PRD řezu ${NN}${sCastmi ? ` (${prdVse})` : ''} nálezy delta kontroly nad dnešním stromem: ${k.report_path} (${(k.nalezy_ids || []).join(', ') || 'všechny'}). Každý nález je hypotéza: ověř proti kódu; co platí, oprav v PRD a E2E scénářích tak, aby kritéria měřila dnešní strom (výčet nahraď vlastností a měřidlem, počet přepočítej a uveď dotaz); co míří vedle, odmítni s důvodem. Rozsah řezu nerozšiřuj ani nezužuj; když nález žádá změnu rozsahu, zapiš do vize-spory a odmítni. Needituj nic jiného než PRD${sCastmi ? ' (kostru a části)' : ''} a E2E soubory řezu.`,
  { label: `prd-refresh-fix:řez ${NN}`, phase: 'Refresh PRD', agentType: 'dev-pipeline:prd', schema: PRD_FIX, ...M.opusH })

// Vstupy implementace společné malému řezu i částem: hypotézy (prd-check, refresh, orchestrátor) a diagnóza.
const hypotezyText = (refresh, jenSvoje) => `${hyp ? `Zbylé nálezy prd-checku jako hypotézy k ověření, ne fakta${jenSvoje ? ' (jen ty, které se týkají tvé práce; z reportu čti jen nálezy podle id)' : ''}: ${hyp.report} (${trimList([...hypBlokujici, ...hyp.ids]).join(', ') || 'všechny'}).\n` : ''}${refresh ? `PRD bylo před stavbou přeměřeno nad dnešním stromem (${refresh.report_path}); zbylé nálezy (${(refresh.nalezy_ids || []).join(', ') || 'žádné'}) ber jako hypotézy.\n` : ''}${hypText ? `Hypotézy od orchestrátora k ověření, ne fakta (stav stromu po předchozím řezu, rozhodnutí uživatele): ${hypText.slice(0, 1500)}\n` : ''}`
// Hypotézy kontroly PRD, které kontrola nemohla spustit (overit_prvni): malý řez je dostane celé, řez s částmi po kritériích k části,
// zbytek kontrakt (bez kontraktu integrace). Ověřit je jde až nad stavěným kódem, proto hned na začátku stavby.
const kId = s => S(s).trim().split(/[\s:(,;]/)[0].toUpperCase()
const overitPro = c => overitPrvni.filter(h => c.kriteria.some(k => kId(k) === kId(h.kriterium)))
const overitZbytek = overitPrvni.filter(h => !casti.some(c => overitPro(c).includes(h)))
const overitText = xs => xs.length ? `Hypotézy kontroly PRD, které kontrola nemohla spustit (ověř jako první, než začneš stavět; výsledek uveď v souhrnu): ${xs.map(h => `${h.id || '?'}${h.kriterium ? ` (${h.kriterium})` : ''}: ${h.hypoteza}`).join(' | ').slice(0, 1500)}\n` : ''
const diagText = diag => diag ? `Diagnóza po dvou neúspěších (doložená příčina): ${S(diag.pricina).slice(0, 500)} · doporučení: ${S(diag.doporuceni).slice(0, 400)}\n` : ''
const pravidlaImpl = 'Hypotézy a follow-upy nikdy nerozšiřují rozsah PRD: co PRD nebo jeho kritéria zakazují, neděláš, i když to hypotéza navrhuje. Past v kódu, na kterou narazíš ve změněných souborech, oprav; mimo ně ji vrať jako follow-up „odstranit past X“. Testy piš k chování, ne k řezu; nepřidávej testovací soubory pojmenované po řezu. Měřidlo, které PRD předepisuje (skript v repu), spusť nad odevzdávaným stromem až na konci, ne uprostřed práce.'
// Stav prostredi (§ 2.2): kód odevzdaný, měření nejde kvůli prostředí; bez důkazu je to selhalo.
const PROSTREDI_IMPL = ' Když kritérium nebo krok nejde změřit kvůli prostředí (síť, cizí služba, stanoviště), kód odevzdej hotový a vrať stav prostredi s důkazem (příkaz, chybový text, čas) a návrhem pro majitele; není to selhání ani důvod k opakování.'
const buildVerze = runbook ? ` Když postup nasazení (${runbook}) vyžaduje zvednutí build verze nebo markeru, udělej to teď jako součást řezu; při commitu se už nic nezvedá.` : ''

const impl = (n, predchozi, diag, refresh) => spust(`${ramec}

Úkol: implementuj řez ${NN} podle PRD (TDD červená až zelená, doktrína CLAUDE.md projektu, Serena na hledání symbolů). Pokus ${n} z ${MAX_POKUSU}.
${hypotezyText(refresh)}${overitText(overitPrvni)}${predchozi ? `Předchozí pokus selhal ve fázi „${predchozi.faze}“: ${S(predchozi.detail).slice(0, 600)}. Pracovní strom obsahuje jeho stav; navaž na něj, nezačínej od nuly.\n` : ''}${navazText(`implement:řez ${NN}`)}${diagText(diag)}${pravidlaImpl} Průběžně spouštěj jen dotčené testy; plnou suitu a typecheck celého projektu jednou, na konci.${buildVerze}${PROSTREDI_IMPL}`,
  { label: `implement:řez ${NN}:${n}`, phase: 'Implementace', agentType: 'dev-pipeline:implement', schema: IMPL, ...M.opusH })

// Kontrakt řezu s částmi: společné věci položí jeden agent před částmi, aby souběžní autoři nesahali na tentýž soubor.
const implKontrakt = (n, diag, refresh) => spust(`${ramec}

Úkol: kontrakt řezu ${NN}: polož společné věci ze sekce Kontrakt kostry PRD ${prdPath} (schéma a migrace, typy, signatury rozhraní mezi částmi, registrace tras); těla, která patří částem, nech vyhodit chybu „neimplementováno: část K“ (nebo ekvivalent v jazyce projektu); typecheck zelený; testy jen tam, kde kontrakt nese chování (migrace, validace); části neimplementuj; vrať změněné soubory. Z kostry čti jen sekci Kontrakt a společné sekce, na které odkazuje; sekce částí přeskoč. Pokus ${n} z ${MAX_POKUSU}.
${mapaText}${hypotezyText(refresh, true)}${overitText(kontraktPotreba ? overitZbytek : [])}${kontraktSelhani ? `Kontrakt v minulém pokusu selhal: ${kontraktSelhani.slice(0, 600)}. Pracovní strom nese jeho rozdělanou práci; navaž na ni, nezačínej od nuly.\n` : ''}${navazText(`implement:řez ${NN}:kontrakt`)}${diagText(diag)}Plnou suitu nespouštěj, pustí ji brána.`,
  { label: `implement:řez ${NN}:kontrakt:${n}`, phase: 'Kontrakt', agentType: 'dev-pipeline:implement', schema: IMPL, ...M.opusH })

const implCast = (c, n, diag, refresh) => {
  const st = castiStav.get(c.id)
  return spust(`${ramec}

Úkol: implementuj část ${c.id} (${c.nazev}) řezu ${NN} podle PRD části ${c.prd_path || '(cesta v kostře)'} a kostry ${prdPath} (z kostry čti Kontrakt, svůj řádek v Částech, ze sekce kritérií jen svá kritéria podle ID${c.kriteria.length ? ` ${c.kriteria.join(', ')} (rg -n nad kostrou)` : ''} a společné sekce; sekce jiných částí přeskoč). ${kontraktPotreba ? 'Kontrakt už je v kódu.' : 'Řez samostatný kontrakt nemá.'} Hranice: měníš jen soubory a oblasti své části: ${c.soubory.join(', ') || '(podle PRD části)'}; souběžně s tebou pracují ve stejném stromu jiné části. Změnu jinde (jiná část, kontrakt, sdílený soubor) neprováděj, vrať ji v mimo_hranici (soubor, co a proč), provede ji integrace. Testy piš a pouštěj jen své (TDD); typecheck jen filtrovaný na svůj balíček nebo soubory; plnou suitu ani typecheck celého repa nespouštěj, patří integraci a bráně. Pokus ${n} z ${MAX_POKUSU}.
${mapaText}${hypotezyText(refresh, true)}${overitText(overitPro(c))}${st.selhani ? `Tvoje část v minulém pokusu selhala: ${st.selhani.slice(0, 600)}. Pracovní strom nese její rozdělanou práci; navaž na ni, nezačínej od nuly.\n` : ''}${navazText(`implement:řez ${NN}:část ${c.id}`)}${diagText(diag)}${pravidlaImpl}${runbook ? ' Build verzi ani marker v části nezvedáš, zvedne je integrace jednou za řez.' : ''}${PROSTREDI_IMPL}`,
    { label: `implement:řez ${NN}:část ${c.id}:${n}`, phase: 'Části', agentType: 'dev-pipeline:implement', schema: IMPL, ...M.opusH, ...(nadStropem.has(c.id) ? { maxPredavek: 5 } : {}) })
}

const implIntegrace = (n, diag) => {
  // Integrace jen nad hotovými částmi (§ 2.2): část zastavená prostředím se nestaví a její šev zůstává „neimplementováno“ s otázkou majiteli.
  const ids = casti.filter(c => castiStav.get(c.id).hotovo).map(c => c.id)
  const zast = [...zastavene.keys()]
  const mimo = casti.filter(c => castiStav.get(c.id).hotovo).flatMap(c => castiStav.get(c.id).mimo.map(m => ({ cast: c.id, ...m }))).slice(0, 40)
  return spust(`${ramec}

Úkol: integrace řezu ${NN} po částech ${ids.join(', ')}: spusť typecheck celého repa a testy dotčené všemi částmi (ne plnou suitu)${rychleText}; sešij švy mezi částmi a kontraktem; proveď požadavky mimo hranici ${JSON.stringify(mimo)}, každý nejdřív ověř (je potřeba, neduplikuje existující); odstraň zbylé „neimplementováno: část“${zast.length ? ` kromě částí ${zast.join(', ')}, které zastavilo prostředí (nestaví se, jejich šev nech s chybou „neimplementováno“ a nic za ně nedomýšlej)` : ''}; nové chování nepřidávej; požadavek, který mění rozsah PRD, neprováděj a vrať jako odchylku. PRD: ${prdVse}. Pokus ${n} z ${MAX_POKUSU}.
${mapaText}${overitText(kontraktPotreba ? [] : overitZbytek)}${integraceSelhani ? `Integrace v minulém pokusu selhala: ${integraceSelhani.slice(0, 600)}. Pracovní strom nese její rozdělanou práci; navaž na ni.\n` : ''}${navazText(`implement:řez ${NN}:integrace`)}${diagText(diag)}${buildVerze}`,
    { label: `implement:řez ${NN}:integrace:${n}`, phase: 'Integrace', agentType: 'dev-pipeline:implement', schema: IMPL, ...M.opusM })
}

// Oprava řezu s částmi po selhání za implementací: části jsou hotové a prošly review, znovu se nestaví.
const implOprava = (n, z, predchozi, diag) => spust(`${ramec}

Úkol: pokus ${n} řezu ${NN} po selhání ve fázi ${z.faze}: ${S(z.detail).slice(0, 800)}${diag ? ` · diagnóza: ${S(diag.pricina).slice(0, 500)} · doporučení: ${S(diag.doporuceni).slice(0, 400)}` : ''}; kód řezu je v pracovním stromě (kontrakt a všechny části hotové a prošly review); oprav příčinu, rozsah PRD nerozšiřuj; dotčené testy a typecheck, plnou suitu pustí brána; vrať zmenena_mista a soubory. PRD: ${prdVse}. ${mapaText.trim()}${predchozi && predchozi !== z ? ` Předchozí oprava skončila bez úspěchu: ${S(predchozi.detail).slice(0, 400)}; pracovní strom nese její stav, navaž na něj.` : ''}${PROSTREDI_IMPL}`,
  { label: `implement:řez ${NN}:oprava:${n}`, phase: 'Implementace', agentType: 'dev-pipeline:implement', schema: IMPL, ...M.opusH })

// Thermo bez části = celý pracovní strom (malý řez); s částí jen její soubory.
const thermo = (c, soubory) => spust(`${ramec}

Úkol: thermo-nuclear review ${c ? `části ${c.id} (${c.nazev}) řezu ${NN}: rozsah VÝHRADNĚ soubory části: ${soubory.join(', ')} (PRD části ${c.prd_path || 'v kostře'}); kontrakt a jiné části neposuzuj, strukturu napříč částmi posoudí integrační review` : `změn řezu ${NN} v pracovním stromě (diff si posbírej sám včetně netrackovaných souborů)`}. Suď proti rubrice, doktríně projektu a Ne-cílům vize z rámce, ne jen proti PRD: nový produkční kód, který PRD nežádá, nebo šev přidaný jen pro testy, je nález. Report do ${c ? rep(`thermo-cast-${c.id}`, 1) : rep('thermo', 1)}. Vrať počty, cestu, soubory s nálezy BLOCKER a HIGH a u každého takového nálezu soubory jeho nápravy v napravy (relativně ke kořeni projektu). Souběžně běží code-review téhož stromu; kód se nemění.${standardy}`,
  { label: c ? `thermo:řez ${NN}:část ${c.id}` : `thermo:řez ${NN}`, phase: 'Review', agentType: 'dev-pipeline:thermo-nuclear-review', schema: THERMO, ...M.opusM })

const fixThermo = ths => spust(`${ramec}

Úkol: oprav strukturální nálezy thermo review řezu ${NN}: ${ths.map(t => t.report_path).join(', ')}. Meze: jen soubory tohoto řezu (pracovní strom), jen nálezy, které rubrika označuje za blokující nebo které máš po ověření za jisté; sporné a cizí nech jako follow-up. Nezaváděj nové plošné mechanismy. Spouštěj jen dotčené testy a typecheck${rychleText}; plnou suitu nespouštěj, patří bráně. Necommituj.${standardy}`,
  { label: `fix-thermo:řez ${NN}`, phase: 'Review', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

const review = (zadani, report, label) => spust(`${ramec}

Úkol: ${zadani} Report do ${report}. Vrať počty, disjunktní balíčky po souborech s identifikátory nálezů a cestu; nálezy samotné nevracej. Každý nález v reportu nese BLOKUJE NASAZENÍ nebo FOLLOW-UP; nad plochou, která zapisuje do produkce (migrace, deploy a datové skripty, mazání), je práh přísnější: i PLAUSIBLE nález tam BLOKUJE.${standardy}`,
  { label, phase: 'Review', agentType: 'dev-pipeline:code-review', schema: REVIEW, ...M.opusH })
const reviewRez = () => review(`code-review řezu ${NN}, kolo 1. Rozsah: pracovní strom (celá změna řezu včetně netrackovaných souborů).`, rep('code-review', 1), `review:řez ${NN}:1`)
const reviewCast = (c, soubory) => review(`code-review části ${c.id} (${c.nazev}) řezu ${NN}, kolo 1. Rozsah: VÝHRADNĚ soubory části: ${soubory.join(', ')} (PRD části ${c.prd_path || 'v kostře'}${c.kriteria.length ? `; z kostry ${prdPath} čti ze sekce kritérií jen kritéria části podle ID ${c.kriteria.join(', ')}` : ''}); kontrakt a jiné části neposuzuj, švy a duplicity mezi částmi posoudí integrační review.`,
  rep(`code-review-cast-${c.id}`, 1), `review:řez ${NN}:část ${c.id}:1`)
const reviewIntegrace = ig => review(`integrační code-review řezu ${NN}: kontrakt (${cesty(kontraktVysledek && kontraktVysledek.soubory).join(', ') || 'řez samostatný kontrakt nemá'}), změny integrace (${cesty(ig.soubory).join(', ') || trimList(ig.zmenena_mista).join(' | ') || 'viz pracovní strom'}) a švy mezi částmi ${casti.map(c => c.id).join(', ')}; hledej hlavně rozpor mezi částmi a kontraktem, duplicity mezi částmi (dva podobné helpery, typy nebo konstanty; souběžní autoři je snadno napíšou dvakrát), nesešité švy a zbytky „neimplementováno“; uvnitř jedné části neposuzuj, to dělá review části.`,
  rep('code-review-integrace', 1), `review:řez ${NN}:integrace:1`)
const reviewOprava = (o, n) => review(`code-review opravy řezu ${NN} v pokusu ${n}. Rozsah: VÝHRADNĚ změny opravy: ${trimList(o.zmenena_mista).join(' | ') || cesty(o.soubory).join(', ') || 'viz pracovní strom'}; co prošlo review částí, znovu nekontroluj.`,
  rep('code-review-oprava', 1), `review:řez ${NN}:oprava:${n}`)
const review2 = (rozsah, odmBlok, reporty) => review(`code-review řezu ${NN}, kolo 2. Rozsah: VÝHRADNĚ opravná várka: ${rozsah.join(' | ')}${odmBlok.length ? `; odmítnuté blokující nálezy: ${odmBlok.join(' | ')}; obstojí odmítnutí? přeměř proti kódu (nálezy jsou v reportech kola 1: ${reporty.join(', ')})` : ''}. Co prošlo kolem 1, znovu nekontroluj.`,
  rep('code-review', 2), `review:řez ${NN}:2`)

// Poslední várka (kolo 2) jde zúžením: po ní už review není a deník vad u neověřené poslední várky naměřil nejvyšší chybovost oprav (třída B).
const fixBalicek = (b, i, kolo, vsechnyThermo) => spust(`${ramec}

Úkol: oprav nálezy řezu ${NN} (kolo ${kolo}).${zdrojeText(b.zdroje, vsechnyThermo)} Sahej jen do souborů: ${b.soubory.join(', ')}; jiné soubory mohou souběžně opravovat jiní agenti. Root brána může být červená na cizích souborech, ověř svůj balíček. Spouštěj jen dotčené testy a typecheck${rychleText}; plnou suitu nespouštěj, patří bráně a souběžné agenty by vyhladověla. ${b.security ? 'Jde o bezpečnostní balíček. Necommituj; bezpečnostní opravu commitne deploy samostatně. Vrať security: true a v zmenena_mista, co oprava mění.' : 'Necommituj.'} Každý nález je hypotéza: ověř proti kódu; co míří vedle, oprav skutečnou příčinu a rozdíl uveď v jinak_nez_nalez; nález, který neopravíš, vrať v odmitnuto s důvodem (u nálezu BLOKUJE s blokuje: true). Nahlas rozšířený zásah, když překročí nálezy. Identifikátory nálezů, které jsi opravil, vrať v opravene_ids.${kolo === 2 ? ' Poslední várka, po ní už review není. Oprav zúžením. Nový mechanismus ani změnu rozhodovací logiky nedělej, nahlas je jako follow-up nebo rozhodnutí. Odložení je plnohodnotný výsledek.' : ''}${standardy}`,
  { label: `fix:řez ${NN}:${kolo}.${i + 1}`, phase: 'Review', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

const verify = k => spust(`${ramec}

Úkol: brána řezu ${NN}, běh ${k}: spusť typecheck a testy projektu podle CLAUDE.md${runbook ? ` (nebo runbooku ${runbook})` : ''}, každý příkaz s výstupem přesměrovaným do souboru a návratovým kódem čteným zvlášť (\`cmd > log 2>&1; echo EXIT=$?\`), nikdy přes rouru; plný výstup ulož do ${rep('verify', k)}. Spusť i kontroly, které spouští pre-commit hook projektu (.husky/pre-commit, .git/hooks/pre-commit nebo lefthook; seznam si přečti z hooku), kromě plné suity, kterou už spouštíš, a kromě kontrol nad dokumenty běhu v docs/ (follow-ups, journal), které spouští až uzavření řezu; vrať je v kontroly. Spusť měřidla kritérií, která PRD označuje [měřidlo] (${sCastmi ? prdVse : prdPath}), nad odevzdávaným stromem a výsledek každého vrať v meridla. Vrať skutečné výsledky (exit kód, počty, jména selhávajících testů, chyby s file:line). Nic neopravuj a neinterpretuj.${a.plugin_root ? ` Když je typecheck zelený, testy skončily kódem 0 s aspoň jedním prošlým a žádným selhaným testem a prošly kontroly i měřidla, spusť \`bash ${a.plugin_root}/scripts/verify-marker.sh ${cwd} ${rep('verify', k)}\` a jeho výstup (hash stromu) vrať v poli marker; jinak marker nezapisuj.` : ''}`,
  { label: `verify:řez ${NN}:${k}`, phase: 'Brána', agentType: 'dev-pipeline:verify', schema: VERIFY, ...M.sonL })

// Hranice opravy brány (1.6.0): v běhu web-rijen fix brány mini-řezu 12 „opravil“ selhání eslintu na gitignorovaném pomocném skriptu
// výjimkou ve sdíleném eslint.config.js a měřidlo rozsahu změn pak řez shodilo. Hranice = soubory částí z PRD a soubory, které blok změnil.
const hraniceRezu = () => trimList([...casti.flatMap(c => c.soubory), ...zmenyBloku])
const HRANICE_BRANY = 'Selhání na gitignorovaném souboru mimo diff řezu není vada řezu: soubor odstav (přejmenuj mimo dosah kontroly nebo smaž, když je to tvůj pomocný soubor), sdílenou konfiguraci (eslint, tsconfig, prettier, CI) neměň.'
const fixBrana = (v, hranice = hraniceRezu()) => spust(`${ramec}

Úkol: brána řezu ${NN} je červená (${branaDuvod(v)}). Selhává: ${(v.selhavajici || []).slice(0, 20).join(' | ') || 'viz výstup'}${v.kontroly_ok === false ? ` · kontroly pre-commitu: ${trimList(v.kontroly).slice(0, 12).join(' | ') || 'viz výstup'}` : ''}${v.meridla_ok === false ? ` · měřidla kritérií: ${meridlaFail(v).slice(0, 12).join(' | ') || 'viz výstup'}` : ''}${v.vystup_path ? ` · plný výstup: ${v.vystup_path}` : ''}. Hranice opravy: soubory řezu ${hranice.length ? `(${hranice.slice(0, 60).join(', ')}${hranice.length > 60 ? ` a dalších ${hranice.length - 60}` : ''})` : '(git status: soubory, které řez změnil)'} a jejich testy; změnu mimo ni udělej jen tehdy, když bez ní brána nejde opravit, a nahlas ji jako rozšířený zásah. ${HRANICE_BRANY} Oprav příčinu (ne test ani měřidlo, pokud nejsou špatně; suita, která skončila nenulovým kódem bez selhaného testu nebo bez jediného prošlého, neproběhla: zjisti proč); po opravě spusť dotčené testy, kontroly, typecheck a měřidla řezu ([měřidlo] v PRD ${prdVse})${rychleText}, plnou suitu pustí znovu brána. Necommituj.${standardy}`,
  { label: `fix-brana:řez ${NN}`, phase: 'Brána', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

// Deploy: commit řezu doslova (v běhu bez-dluhu pole commit 16× z 24 neslo commit zápisu nasazení a pět hashů si agent
// dopočítal), kroky po nasazení z PRD, zápis nasazení samostatným commitem, bezpečnostní opravy před commitem řezu.
const secText = xs => xs.map(s => `${s.popis} (soubory: ${s.soubory.join(', ') || 'viz popis'})`).join(' | ').slice(0, 1500)
const deploy = (k, pozn, x = {}) => spust(`${ramec}

Úkol: commit a nasazení řezu ${NN} (běh ${k}). Jeden commit na vize větvi: „rez ${NN}: <shrnutí z PRD>“${pozn ? ` (${pozn})` : ''}. Do commitu patří kód řezu, docs/prd/rez-${NN}* a docs/e2e/rez-${NN}* (kromě zápisu nasazení) a sdílené dokumenty běhu (handoff, journal, follow-ups, vize-spory, docs/mereni); rozpracované PRD a scénáře jiných řezů (rez-MM s jiným číslem) nech netrackované, commituje je jejich řez. Build verzi ani marker samostatným commitem nezvedáš (patří do řezu před bránou); když chybí a postup ji vyžaduje, zvedni ji a commitni spolu s obsahem. Pole commit je poslední commit „rez ${NN}“ (git log --grep, hash z git rev-parse), i když tento běh nový commit řezu nevytvořil (dorovnání prostředí, jen fix(security)); nikdy commit zápisu nasazení, nikdy dopočítaný ani zkrácený.${x.security && x.security.length ? ` Bezpečnostní opravy řezu: ${secText(x.security)}. Před commitem řezu je commitni samostatně zprávou fix(security): …, když jejich soubory nenesou jinou změnu řezu (git diff souboru ukáže jen opravu); jinak přidej do zprávy commitu řezu řádek fix(security): … a hash toho commitu vrať v security_radkem. Hashe samostatných commitů vrať v security_commity (i když nasazení potom selže).` : ''}${x.predchozi ? ` Předchozí pokus selhal ve fázi „${x.predchozi.faze}“: ${S(x.predchozi.detail).slice(0, 600)}${x.diag ? ` · diagnóza: ${S(x.diag.pricina).slice(0, 400)} · doporučení: ${S(x.diag.doporuceni).slice(0, 300)}` : ''}; nasazení tomu přizpůsob.` : ''}${x.prostredi ? ` E2E hlásí vadu prostředí: ${S(x.prostredi).slice(0, 800)}; dorovnej nasazení tak, aby ji odstranilo (typicky kroky po nasazení z PRD).` : ''} ${x.jenCommit ? `Oprava po E2E se nedotkla apps ani packages: jen commitni, nic nenasazuj, kroky po nasazení nespouštěj, zápis nasazení nepiš; stav commit-only.` : deployMode === 'commit-only' || !runtimeDopad ? 'Projekt nasazuje uživatel nebo řez nemá runtime dopad: skonči commitem, stav commit-only.' : `Deploy podle deploy konfigurace projektu${runbook ? ` (runbook: ${runbook})` : ' (sekce Deploy v CLAUDE.md projektu nebo docs/deploy.md)'}: marker docs/.deploy-unlocked vytvoř samostatným příkazem před deployem, počkej na doložený stav platformy (SUCCESS/FAILED) a vrať dva nezávislé doklady, že běží (druhý smí být odložený se změřenou baseline před nasazením, nebo neexistuje s důvodem; pozorovatelný rozdíl nevyráběj akcí v produkci).${deployOkno ? ` Zakázané okno nasazení: ${deployOkno}; když do něj spadáš, počkej do jeho konce a ještě 10 minut rezervy, jen když to celé trvá nejvýš ~30 minut; jinak odklad (níže).` : ''}${appPristup ? ` Pokyny majitele k prostředí a nasazení jsou závazné a mají přednost před skripty repa (skript, který nasazuje jinam nebo jinak, než pokyny říkají, nepoužij nebo doplň o správné parametry): ${appPristup.slice(0, 1200)}.` : ''}${dokladPred ? ` Řez nese migraci s dokladem před nasazením: migraci aplikuj jen když existuje ${x.doklad || dokladPath}; bez něj migraci neaplikuj, nic nenasazuj a vrať failed s důvodem „chybí doklad před migrací“.` : ''} Co nasadit, urči podle git diff --stat <báze>..HEAD -- apps packages a importů změněných balíčků, nikdy podle diffu jednoho commitu: báze je poslední commit se zprávou „zápis nasazení“ (git log --grep 'zápis nasazení' -1 --format=%H), když žádný není, git merge-base HEAD main; nasaď každou aplikaci, které se diff dotkl, a pole health začni řádkem „aplikace: <app>@<verze nebo deployment id> nasazeno | <app> nenasazeno (<důvod z diffu>) | …“. Když PRD (kostra ${prdPath}) má sekci „Nasazení a kroky po něm“, proveď po nasazení každý krok a vrať ho v kroky_po_nasazeni s číslem kroku z PRD (id), textem kroku a se stavem ${KROKY_STAVY}.${x.provedene && x.provedene.length ? ` Předchozí nasazení tohoto řezu už provedlo: ${x.provedene.join(' | ').slice(0, 1200)}. Krok, jehož vstup tvoje změna neovlivňuje, znovu nespouštěj a vrať ho jako vynechano s důvodem „provedeno v předchozím nasazení“; krok, kterého se změna týká, proveď znovu.` : ''}${x.dorovnani ? ' Dorovnání: minulý pokus selhal jen na krocích po nasazení a strom se od minulého nasazení nezměnil; nasaď jen to, co diff od báze žádá, a proveď znovu kroky, které selhaly nebo byly vynechány.' : ''}${x.noveKroky && x.noveKroky.length ? ` Oprava po E2E vyžaduje nový krok po nasazení s oporou v Povolení: ${x.noveKroky.map(kr => `${kr.krok} (důvod: ${kr.duvod}; opora: ${kr.opora})`).join(' | ').slice(0, 1200)}. Proveď ho po nasazení v mezích citované opory a vrať v kroky_po_nasazeni bez id, s textem kroku a stavem.` : ''} Zápis nasazení zapiš do ${nasazeniPath} (čas, commit řezu, co se nasadilo, doklady, kroky po nasazení; další nasazení téhož řezu připiš pod předchozí) a commitni ho samostatně až po commitu řezu; vrať report_path a commit_zapisu. Do zápisu přidej řádek „Dveře: jednosměrné | obousměrné · Dosah: <web | admin | data | zóna | platforma>“ (jednosměrné, když řez nese doklad před nasazením, migraci, zápis podle Povolení, odeslání zprávy, mazání nebo cokoli, co jeden revert nevrátí) a totéž vrať v dvere a dosah. Pole commit je commit řezu, ne commit zápisu. Selhání mimo kód řezu (přihlášení nebo účet CLI, oprávnění, výpadek platformy) vrať jako failed s infra: true. ${ODKLAD}`}${x.zmenyOprav && x.zmenyOprav.length ? ` Změny pracovního stromu z oprav tohoto bloku (soubory: ${x.zmenyOprav.slice(0, 80).join(', ')}${x.zmenyOprav.length > 80 ? ` a dalších ${x.zmenyOprav.length - 80}` : ''}) patří řezu a commitují se s ním. Cizí jsou jen rozpracované soubory jiných řezů (rez-MM).` : ''} Formátovací kontrolu pouštěj jen nad soubory řezu, ne nad celým repem. Nikdy si nedomýšlej postup, který projekt nedokumentuje.`,
  { label: `deploy:řez ${NN}:${k}`, phase: 'Deploy', agentType: 'dev-pipeline:deploy', schema: DEPLOY, ...M.sonM })

// Doklad před nasazením (jen když ho PRD předepsalo): Sonnet agent pořídí snímek dotčených dat dotazy jen pro čtení
// do docs/e2e/rez-NN-doklad-pred.md; deploy bez toho souboru migraci neaplikuje. V běhu doplneni-webu doklad dvakrát chyběl a dodatečně nešel.
const doklad = () => spust(`${ramec}

Úkol: doklad stavu před nasazením řezu ${NN}. PRD (${prdPath}) má sekci „Doklad před nasazením“: pořiď přesně to, co předepisuje (tabulky, počty řádků, vzorky záznamů, kontrolní součty), výhradně dotazy jen pro čtení nad prostředím, do kterého se bude nasazovat${appPristup ? ` (pokyny majitele k prostředí: ${appPristup.slice(0, 1200)})` : runbook ? ` (přístup podle runbooku ${runbook})` : ' (přístup podle CLAUDE.md projektu)'}. Pokus ${P}. Zapiš do ${dokladPath}: čas, revize (git rev-parse HEAD), každý dotaz doslova a jeho výsledek; když soubor už existuje (dřívější pokus nebo přerušený běh), nepřepisuj ho (je to stav před prvním zápisem, po migraci ho nikdo nedopočítá) a zapiš vedle ${dokladPath.replace(/\.md$/, '')}-p${P}.md. Cestu, kam jsi zapsal, vrať v path. Nic neměň, nic nemaž, migraci nespouštěj. Když přístup chybí nebo dotaz selže, vrať ok: false s důvodem; doklad si nedomýšlej. Když kterýkoli předepsaný bod dokladu selže, vrať ok: false; text a pole se nesmí rozcházet.`,
  { label: `doklad:řez ${NN}`, phase: 'Doklad', agentType: 'dev-pipeline:doklad', schema: DOKLAD, ...M.sonM })

// E2E kolo 1: skupiny sekcí souběžně (e2eSkupiny). Kolo 2 po opravě přeměřuje jen FAIL kritéria kola 1, ostatní jen smoke.
// Verifikátor kód neověřuje: kritéria [měřidlo] změřila brána (v běhu bez-dluhu si verifikátoři zakládali worktree
// s instalací a pouštěli suitu vedle běžící stavby). Odchylky a rozšířené zásahy oprav dostane předem, protože scénář
// zastaralý po opravě jinak vyrobí FAIL a oprava FAILu chování vrátí (třída J3). Výsledky měřidel brány dostane doslova,
// ne jen cestu k výstupu brány: kritérium [měřidlo] tak nemusí hledat v logu ani měřit znovu.
const meridlaText = o => (o.meridla || []).length ? `; výsledky měřidel: ${o.meridla.join(' | ').slice(0, 800)}` : ''
const e2eProhlizec = (k, o) => spust(`${ramec}

Úkol: E2E verifikace řezu ${NN}, kolo ${k}${o.sekce ? ` (verifikátor ${o.cast} z ${o.pocet}${o.samostatne ? '' : ' souběžných'})` : ''}: projdi scénáře z ${e2ePath} proti běžící aplikaci${appPristup ? ` (přístup: ${appPristup})` : ' (přístup podle CLAUDE.md projektu)'}${o.sekce ? `, ale VÝHRADNĚ sekce: ${o.sekce.join(' | ')}; ${o.samostatne ? 'ostatní sekce už ověřili ostatní verifikátoři a nad aplikací teď běžíš sám' : 'ostatní verifikátoři souběžně ověřují ostatní sekce nad touž aplikací'}, do jejich dat nesahej` : ''}${o.fail ? `. Kolo 2 po opravě: přeměř VÝHRADNĚ kritéria, která v kole 1 selhala: ${o.fail.join(' | ')}; u ostatních kritérií jen ověř, že se jejich plocha načte bez chyby (smoke, jeden krok na plochu), verdikty z kola 1 nepřeměřuj; celkem = počet přeměřených kritérií, smoke selhání vrať ve fail_kriteria s předponou „smoke:“` : ''}, verdikt per kritérium PASS / PASS-částečně / FAIL s důkazy do reportu ${o.report}. Nejdřív ověř prostředí: nasazená revize je commit řezu${o.commit ? ` (${o.commit})` : ''} nebo pozdější commit, který od něj mění jen docs/ (zápis nasazení)${o.nasazeni ? `, zápis nasazení ${o.nasazeni},` : ''} a přihlášení ze zadání funguje; když ne, vrať to v poli prostredi_nasazeni a kritéria neměř, nic nenasazuj (nasazení není tvoje fáze) a handoff nečti. Neověřuješ kód: nezakládej worktree, nic neinstaluj, nespouštěj testy ani typecheck. Kritéria označená [měřidlo] změřila brána (report ${o.brana || 'brány tohoto pokusu'}${meridlaText(o)}); do celkem je nepočítej. Prohlížeč bez okna (bez --headed), na konci agent-browser close.${o.zmeny ? ` Odchylky od PRD a rozšířené zásahy oprav tohoto pokusu: ${o.zmeny}; scénář, který jim odporuje, vrať ve vadna_kriteria s druhem „scénář zastaral po opravě“, ne jako FAIL.` : ''} Čísla a výčty v chování aplikace přepočítej sám dotazem nad nasazenou revizí; hodnotu z PRD, journalu ani souhrnu implementace nepřebírej. Kritérium, které nejde splnit (chybí ti credential, měří se až po uzavíracím commitu), koliduje s jiným kritériem nebo Ne-cílem vize, nebo padá na nálezu, který prokazatelně existoval před řezem a řez ho nemá v rozsahu, vrať ve vadna_kriteria s dokladem druhu, ne jako FAIL; FAIL je jen skutečné selhání implementace. Kritérium, jehož měření nejde provést kvůli prostředí (nestálá síť, chyba cizí služby, měřicí stanoviště je tento stroj proti produkci), vrať hned v tomto kole v prostredi s důkazem a návrhem (odkud měřit, nebo přijmout), ne jako FAIL po opakování. FAIL, jehož příčina prokazatelně leží mimo hranici řezu (jiný modul, infrastruktura, cizí služba), nech ve fail_kriteria a připoj k němu pricina_mimo_rez s důkazem. Vrať jen počty, FAIL, částečná a vadná kritéria, závažné nálezy mimo kritéria (bezpečnost, data) zvlášť od kosmetických. Testovací data s prefixem ${o.sekce ? `[E2E-${o.cast}]` : '[E2E]'}, po sobě ukliď.`,
  { label: `e2e:řez ${NN}:${k}${o.sekce ? `:${o.cast}` : ''}`, phase: 'E2E', agentType: 'dev-pipeline:e2e-verifier', schema: E2E, ...M.opusM })

const mergeE2E = (parts, report) => {
  const ps = parts.filter(Boolean)
  if (!ps.length) return null
  const sum = f => ps.reduce((n, p) => n + (Number(p[f]) || 0), 0)
  const cat = f => ps.flatMap(p => p[f] || [])
  return { vysledek: 'fail', celkem: sum('celkem'), pass: sum('pass'), castecne: sum('castecne'), fail: sum('fail'),
    fail_kriteria: cat('fail_kriteria'), castecna_kriteria: cat('castecna_kriteria'), vadna_kriteria: cat('vadna_kriteria'),
    prostredi: cat('prostredi'), mimo_rez: cat('mimo_rez'),
    zavazne_mimo_ak: cat('zavazne_mimo_ak'), kosmeticke: cat('kosmeticke'), report_path: report, prostredi_nasazeni: ps.map(vadaNasazeni).filter(Boolean).join(' | ') }
}

// Skupiny sekcí jdou souběžně v kole 1 a v kole 2, které přeměřuje všechna kritéria; kolo 2 nad jmenovanými FAIL jde jedním verifikátorem.
// Skupina bez výsledku není pass: mergeE2E by sečetl jen ostatní skupiny a řez by se uzavřel s neověřenou sekcí (revize 1.4.0:
// 20 z 30 kritérií a hotovo). Chybějící skupina jde ještě jednou samostatně, po doběhu ostatních; bez výsledku je E2E selhané.
// Skupiny k přenosu (§ 2.12): v dalším pokusu po opravě se přeměřují jen skupiny, jejichž sekce mají oblasti protínající opravu;
// skupina, jejíž všechny sekce mají oblasti mimo opravu a má zelený výsledek z dřívějšího pokusu, se přenese. Bez oblastí nebo
// bez zeleného výsledku se přeměřuje. Riziko (oprava rozbije nepřeměřenou sekci) kryje kolečko.
const protina = (oblastiSekce, oprava) => oblastiSekce.some(o => [...oprava].some(t => t === o || t.startsWith(o) || o.startsWith(t)))
const skupinyKPrenosu = oprava => {
  const out = new Set()
  if (!oprava.size || e2eSkupiny.length < 2) return out
  e2eSkupiny.forEach((sekce, i) => {
    const s = sekce.map(n => e2eSekce.find(x => x.nazev === n)).filter(Boolean)
    if (s.length === sekce.length && s.every(x => x.oblasti.length) && !s.some(x => protina(x.oblasti, oprava)) && e2eZelene.has(i)) out.add(i)
  })
  return out
}
// Vada nasazení z E2E (dorovná ji deploy): pole prostredi_nasazeni; starší návrat nese text v prostredi.
const vadaNasazeni = e => S(typeof (e && e.prostredi) === 'string' ? e.prostredi : e && e.prostredi_nasazeni).trim()
const zeleny = r => !!r && (Number(r.fail) || 0) === 0 && !pole(r.fail_kriteria).length && !vadaNasazeni(r)
const e2e = async (k, o = {}) => {
  if (!runtimeDopad) return e2eKriteria(k, o)
  if (!o.fail && e2eSkupiny.length >= 2) {
    const pocet = e2eSkupiny.length
    const prenos = o.prenos || new Set()
    const skupina = (i, samostatne) => e2eProhlizec(k, { ...o, cast: PISMENA[i], sekce: e2eSkupiny[i], pocet, samostatne, report: rep(`e2e-${PISMENA[i]}`, k) })
    // Skupina bez souběhu (měření výkonu, zátěž produkce) běží sama až po doběhu ostatních skupin; přenesená skupina se nepouští.
    const vys = await parallel(e2eSkupiny.map((_, i) => i === e2eBezSoubehu || prenos.has(i) ? null : () => skupina(i, false)).filter(Boolean))
    for (let i = 0; i < pocet; i++) if (i === e2eBezSoubehu || prenos.has(i)) vys.splice(i, 0, null)
    if (e2eBezSoubehu >= 0 && !prenos.has(e2eBezSoubehu)) vys[e2eBezSoubehu] = await skupina(e2eBezSoubehu, true)
    for (const i of prenos) vys[i] = { ...e2eZelene.get(i), preneseno: true }
    for (let i = 0; i < pocet; i++) {
      if (vys[i]) continue
      log(`E2E ${k}: verifikátor ${PISMENA[i]} nevrátil výsledek, pouštím ho ještě jednou samostatně`)
      vys[i] = await skupina(i, true)
    }
    const chybi = e2eSkupiny.map((_, i) => i).filter(i => !vys[i])
    if (chybi.length) return { chybi: chybi.map(i => nic(`e2e:řez ${NN}:${k}:${PISMENA[i]}`, `verifikátor ${PISMENA[i]}`)).join('; ') }
    vys.forEach((r, i) => { if (!r.preneseno && zeleny(r)) e2eZelene.set(i, r) })
    return { ...mergeE2E(vys, vys.map(x => x.report_path).filter(Boolean).join(' + ')), prenesene_sekce: [...prenos].flatMap(i => e2eSkupiny[i]) }
  }
  return e2eProhlizec(k, { ...o, report: rep('e2e', k) })
}
// Proč E2E nemá výsledek (prázdné = má): celé bez výsledku, skupina bez výsledku, nebo strop předávek.
const e2eNic = (e, k) => e && !e.chybi ? '' : e ? e.chybi : nic(`${runtimeDopad ? 'e2e' : 'kriteria'}:řez ${NN}:${k}`, 'verifikátor')

const e2eKriteria = (k, o) => spust(`${ramec}

Úkol: řez ${NN} nemá runtime dopad. Projdi akceptační kritéria z PRD (${prdVse}) bod po bodu a každé dolož konkrétním důkazem (výstup příkazu, existence a obsah souboru, spuštěný test), verdikt per kritérium do ${rep('e2e', k)}. Kritéria označená [měřidlo] změřila brána (report ${o.brana || 'brány tohoto pokusu'}${meridlaText(o)}): znovu je nespouštěj a do celkem je nepočítej. Čísla a výčty přepočítej sám nad odevzdávaným stromem; hodnotu ze souhrnu implementace nepřebírej. Kritérium nesplnitelné před uzavíracím commitem, kolidující s jiným kritériem nebo Ne-cílem vize, nebo padající na předřezovém nálezu mimo rozsah řezu vrať ve vadna_kriteria s dokladem druhu, ne jako FAIL.${o.zmeny ? ` Odchylky od PRD a rozšířené zásahy oprav tohoto pokusu: ${o.zmeny}; kritérium, které jim odporuje, vrať ve vadna_kriteria s druhem „scénář zastaral po opravě“, ne jako FAIL.` : ''} Dočasné artefakty po sobě ukliď, pracovní strom nech čistý. Vrať jen počty, FAIL a vadná kritéria.`,
  { label: `kriteria:řez ${NN}:${k}`, phase: 'E2E', agentType: 'general-purpose', schema: E2E, ...M.opusM })

// Kolo 2 měřilo jen FAIL kritéria kola 1 (+ smoke): výsledné počty se skládají z obou kol. Závažné nálezy a kosmetika kola 1
// se nesmí ztratit (kolo 2 je jen smoke), jinak bezpečnostní nález z kola 1 zmizí bez opravy; kolečko je skládá stejně.
const zKola1 = (e1, e2) => ({ zavazne_mimo_ak: trimList([...(e1.zavazne_mimo_ak || []), ...(e2.zavazne_mimo_ak || [])]), kosmeticke: trimList([...(e1.kosmeticke || []), ...(e2.kosmeticke || [])]) })
const slozE2E = (e1, e2) => {
  const vadna = trimList([...(e1.vadna_kriteria || []), ...(e2.vadna_kriteria || [])])
  const castecne = (Number(e1.castecne) || 0) + (Number(e2.castecne) || 0)
  const fail = Number(e2.fail) || 0
  const celkem = Number(e1.celkem) || 0
  // Kritéria prostředí z kola 1 se v kole 2 neměří (nestojí pokus), nesou se dál.
  const prostr = [...pole(e1.prostredi), ...pole(e2.prostredi)]
  return { ...e2, celkem, fail, castecne, pass: Math.max(0, celkem - fail - castecne - vadna.length - prostr.length), vadna_kriteria: vadna, prostredi: prostr,
    mimo_rez: pole(e2.mimo_rez), prostredi_nasazeni: vadaNasazeni(e2), prenesene_sekce: trimList([...pole(e1.prenesene_sekce), ...pole(e2.prenesene_sekce)]),
    castecna_kriteria: [...(e1.castecna_kriteria || []), ...(e2.castecna_kriteria || [])], report_path: [e1.report_path, e2.report_path].filter(Boolean).join(' + '),
    ...zKola1(e1, e2) }
}

// Kam oprava sáhla: 'kod' (apps, packages, nebo cesty nejdou určit) jde přes bránu a nasazuje se; 'mimo' (jiný kód mimo docs/:
// skript, měřicí nástroj, konfigurace) jde přes bránu a jen commitem; 'docs' jen commitem; 'nic' (bez změny nebo bez výsledku).
// Gitignorovaný report v docs/reviews/ není změna stromu (1.7.0): v běhu sonnet-5-5 pustil zbytečného deploy agenta.
const zasahOpravy = f => {
  if (!f || !(f.opraveno > 0 || trimList(f.zmenena_mista).length)) return 'nic'
  const vse = cestyZ(f.zmenena_mista)
  const c = vse.filter(x => !/^docs\/reviews\//.test(x))
  if (vse.length && !c.length) return 'nic'
  if (!c.length || c.some(x => /^(apps|packages)\//.test(x))) return 'kod'
  return c.every(x => /^docs\//.test(x)) ? 'docs' : 'mimo'
}
const fixE2E = (e, k) => spust(`${ramec}

Úkol: E2E řezu ${NN} selhalo (kolo ${k}): report ${e.report_path}, FAIL kritéria: ${(e.fail_kriteria || []).join(' | ') || `${e.fail} bez jmen, viz report`}. Každý nález je hypotéza: reprodukuj, oprav příčinu, testy a typecheck zelené${rychleText ? `; spusť i rychlé kontroly nad celým stromem: ${rychleKontroly}` : ''}. Operaci nad platformou nebo živým systémem, kterou oprava vyžaduje a PRD ji v krocích po nasazení nejmenuje, sám neprováděj ani nepřipravuj v konfiguraci: vrať ji v novy_krok_po_nasazeni s důvodem, kritériem a oporou (doslovná citace řádku Povolení z PRD nebo rozhodnutí majitele; bez opory nech prázdné). Necommituj, commit a deploy dělá další krok.${standardy}`,
  { label: `fix-e2e:řez ${NN}:${k}`, phase: 'E2E', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

// Bezpečnostní fix agent necommituje: v běhu bez-dluhu (řez 23) tvrdil commit, který nevznikl, a blok to nepoznal.
// Opravu projde brána a commitne ji deploy samostatně.
const fixSecurity = e => spust(`${ramec}

Úkol: E2E řezu ${NN} našlo závažné nálezy mimo kritéria (bezpečnost/data): ${(e.zavazne_mimo_ak || []).join(' | ')} · report ${e.report_path}. Oprav je, i když jsou mimo rozsah řezu. Necommituj; bezpečnostní opravu commitne deploy samostatně. Vrať security: true a v zmenena_mista, co oprava mění. Bez jasného fixu nález nech jako follow-up s důvodem.${standardy}`,
  { label: `fix-security:řez ${NN}`, phase: 'E2E', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

const diagnose = last => spust(`${ramec}

Úkol: řez ${NN} dvakrát funkčně selhal, naposledy ve fázi „${last.faze}“: ${S(last.detail).slice(0, 800)}. Postav těsnou reprodukční smyčku a najdi doloženou příčinu; nic neopravuj, pracovní strom vrať do stavu, v jakém jsi ho našel. Vrať příčinu (file:line + mechanismus) a doporučení pro třetí pokus.`,
  { label: `diagnose:řez ${NN}`, phase: 'Diagnóza', agentType: 'dev-pipeline:diagnose', schema: DIAG, ...M.opusH })

// Seznam do zadání uzavření jde celý: položky jednotlivě oříznuté na 600 znaků, nikdy celek uprostřed položky (běh web-podzim:
// follow-upy useknuté na 2 500 znaků, do docs/follow-ups.md se dostala čtvrtina; odchylky useknuté ve 13 ze 14 řezů).
const celySeznam = xs => JSON.stringify(pole(xs).map(x => { const t = typeof x === 'string' ? x : JSON.stringify(x); return t.length > 600 ? `${t.slice(0, 599)}…` : t }))
// Uzavření ověří commit řezu a bezpečnostní commity podle gitu (pole commit bylo v běhu bez-dluhu jen 4× z 24 commitem řezu).
// Seznamy zastaveného běhu téhož bloku (1.7.0): uzavření obnovy je připojí, jinak by se ztratily s přepsaným výsledkem.
const zastavenoPath = `docs/.vysledek-stavba-${NN}-zastaveno.json`
const ZASTAVENE_SEZNAMY = `Když existuje ${zastavenoPath}, připoj jeho seznamy ke svým s deduplikací podle textu.`
const closeZastaveno = s => spust(`${ramec}

Úkol: uzavření ZASTAVENÉHO bloku řezu ${NN} (režim zastaveno): blok se zastavil ve fázi ${s.faze} (${S(s.detail).slice(0, 400)}) a čeká na obnovu. Zapiš do ${cwd}/${zastavenoPath} (soubor celý přepiš) přesně tento JSON, beze změny a bez zkracování: ${JSON.stringify({ rez: NN, vysledek: 'zastaveno', pokusy: P, faze: s.faze, ...dvereDosah(), follow_ups: s.follow_ups, odchylky: s.odchylky, pasti_opravene: s.pasti })}; cestu vrať ve vysledek_soubor (když zápis selže, nech pole prázdné a důvod napiš do poznamka). Nic jiného nedělej: journal, follow-ups, PRD ani kód neměň, necommituj.`,
  { label: `uzavření:řez ${NN}:zastaveno`, phase: 'Uzavření', agentType: 'dev-pipeline:uzavreni', schema: ZASTAVENO, ...M.sonL })

const close = s => spust(`${ramec}

Úkol: uzavření řezu ${NN}. (0) Ověř commit řezu: git cat-file -t ${s.commit} musí vrátit commit a zpráva commitu nese „rez ${NN}“; když ne, najdi skutečný commit řezu (git log --grep) a vrať ho v commit_overeny; hash nikdy nedopočítávej.${s.security.length ? ` Totéž pro bezpečnostní commity ${s.security.join(', ')}: neexistující vrať v chybejici_commity.` : ''} (1) PRD frontmatter${sCastmi ? ' kostry' : ''}: status: done, commit: ověřený commit řezu z bodu 0. (2) Srovnej PRD (${prdVse}) a E2E scénáře s tím, co se skutečně postavilo; odchylky: ${celySeznam(s.odchylky)}. Dokument nesmí tvrdit něco jiného než kód; uprav dotčené věty.${s.vadna.length ? ` Vadná kritéria podle E2E (${celySeznam(s.vadna)}): u každého nech text kritéria, připiš „VADNÉ KRITÉRIUM: <doklad>; čeká na rozhodnutí majitele“ a zapiš záznam do docs/vize-spory.md s navrženou odpovědí.` : ''}${s.prostredi.length ? ` Kritéria a části zastavené prostředím (${celySeznam(s.prostredi)}): u každého kritéria nech text, připiš „PROSTŘEDÍ: <důkaz>; čeká na rozhodnutí majitele (návrh: <návrh>)“ a zapiš do docs/vize-spory.md záznam ve tvaru otázky s navrženou odpovědí (tvar: ${tvar}, sekce Vize-spory); pokus to nestojí.` : ''}${s.mimoRez.length ? ` FAIL kritéria s příčinou mimo hranici řezu (${celySeznam(s.mimoRez)}): u každého nech text, připiš „MIMO ŘEZ: <důkaz>; čeká na rozhodnutí majitele“ a zapiš do docs/vize-spory.md otázku s navrženou odpovědí.` : ''}${s.prenesene.length ? ` Sekce E2E přenesené z dřívějšího kola bez přeměření (oprava se jich netýkala): ${celySeznam(s.prenesene)}; uveď je v journalu.` : ''} (3) Doklady: když PRD nebo vize předepisuje artefakt v repu jako doklad řezu (měření, export, report), ověř, že existuje a je v ověřeném commitu řezu (git show --stat); chybějící vrať v chybejici_doklady. (4) Thermo: ${s.thermo_paths.length ? `projdi v ${s.thermo_paths.join(', ')} nálezy BLOCKER a HIGH a u každého urči podle kódu, zda je opraven, nebo zůstává; neopravený zapiš do follow-ups s odvozením (nález, proč zůstal); počet bez obojího vrať v thermo_nesesouhlaseno.` : 'thermo bez nálezů, thermo_nesesouhlaseno: 0.'} (5) Připoj do docs/journal.md heredocem záznam: datum, řez, co je hotové, odchylky, pokusy ${s.pokusy}, E2E ${s.e2e}, review ${s.review}, thermo ${s.thermo}; odmítnuté nálezy s důvodem: ${s.odmitnute.length ? celySeznam(s.odmitnute) : 'žádné'}${s.jinak.length ? `; opravy jinou příčinou, než nález tvrdil: ${celySeznam(s.jinak)}` : ''}; výsledky měřidel brány: ${s.meridla.length ? celySeznam(s.meridla) : 'žádná měřidla'}; kroky po nasazení: ${s.kroky.length ? celySeznam(s.kroky) : 'žádné'}; předávky bloku stavby: ${s.predavky} (ze zadání); z docs/.kontext.jsonl (když existuje) záznamy řezu ${NN}: nejvyšší hodnota podle typu agenta, počet compactů a předávky řezu ve všech blocích (záznamy udalost „predavka“, log); obě čísla předávek zapiš s popiskem a nesrovnávej je (log počítá i blok PRD a obnovu); tentýž souhrn vrať v poli kontext. (6) Připoj do docs/follow-ups.md pod nadpis „## Řez ${NN} <název řezu z PRD>“ (založ ho jen pro tento řez, cizí nadpisy neměň) tyto položky (jedna odrážka = jedna, s kontextem; každá začíná značkami „[řez ${NN} · <oblast>] [<osud>]“, které položky už nesou: oblast „obecné“ nebo „review“ nahraď modulem nebo plochou ze slovníku projektu, osud (rozhodnutí | oprava | nápad | obsah) nech, chybí-li, doplň podle ${tvar}, sekce Follow-ups): ${celySeznam(s.follow_ups)}. Položka „<id> (FOLLOW-UP z <report>)“ je nález code-review k odložení: text a kontext vezmi z reportu. ${ZASTAVENE_SEZNAMY} (7) Po zápisu spusť kontroly pre-commit hooku projektu, které míří na dokumenty běhu v docs/ (follow-ups, journal)${rychleKontroly ? `, a rychlé kontroly nad celým stromem: ${rychleKontroly}` : ''}; text oprav, dokud neprojdou. Smaž docs/.deploy-unlocked, když existuje. (8) Pusť formátovač projektu na dotčené docs/*.md, když ho projekt má. (9) Zapiš do ${cwd}/docs/.vysledek-stavba-${NN}.json (soubor celý přepiš) přesně tento JSON, beze změny a bez zkracování: ${JSON.stringify(s.vysledek)}; cestu vrať ve vysledek_soubor (když zápis selže, nech pole prázdné). Necommituj (commituje další řez), do kódu nesahej.`,
  { label: `uzavření:řez ${NN}`, phase: 'Uzavření', agentType: 'dev-pipeline:uzavreni', schema: CLOSE, ...M.sonM })
// Uzavření selhaného bloku (režim selhání, 1.6.0): seznamy všech pokusů zapíše agent uzavření, ne orchestrátor z notifikace, která
// by je useknula (review 1.6.0 N3). Commit řezu se neověřuje, PRD status se nemění.
const closeSelhani = s => spust(`${ramec}

Úkol: uzavření SELHANÉHO bloku řezu ${NN} (režim selhání): řez selhal ve fázi ${s.faze} po ${s.pokusy} pokusech: ${S(s.detail).slice(0, 600)}${s.diag ? ` · diagnóza: ${S(s.diag).slice(0, 400)}` : ''}. Commit řezu neověřuj, PRD status neměň, thermo nesesouhlasuj, do kódu nesahej. (1) Připoj do docs/journal.md heredocem záznam: datum, řez ${NN}, „selhal ve fázi ${s.faze}“ s detailem, pokusy ${s.pokusy}; odchylky od PRD: ${celySeznam(s.odchylky)}; opravené pasti: ${celySeznam(s.pasti)}; odmítnuté nálezy s důvodem: ${s.odmitnute.length ? celySeznam(s.odmitnute) : 'žádné'}.${s.prostredi.length ? ` Kritéria a části zastavené prostředím (${celySeznam(s.prostredi)}): zapiš do docs/vize-spory.md otázku s navrženou odpovědí (tvar: ${tvar}, sekce Vize-spory).` : ''} (2) Připoj do docs/follow-ups.md pod nadpis „## Řez ${NN} <název řezu z PRD>“ (založ ho jen pro tento řez) tyto položky (jedna odrážka = jedna, s kontextem; každá začíná značkami „[řez ${NN} · <oblast>] [<osud>]“, které položky už nesou: oblast „obecné“ nebo „review“ nahraď modulem nebo plochou ze slovníku projektu, osud (rozhodnutí | oprava | nápad | obsah) nech, chybí-li, doplň podle ${tvar}, sekce Follow-ups): ${celySeznam(s.follow_ups)}. Položka „<id> (FOLLOW-UP z <report>)“ je nález code-review k odložení: text a kontext vezmi z reportu. ${ZASTAVENE_SEZNAMY} (3) Po zápisu spusť kontroly pre-commit hooku projektu nad dokumenty běhu v docs/ (follow-ups, journal)${rychleKontroly ? `, a rychlé kontroly nad celým stromem: ${rychleKontroly}` : ''}; text oprav, dokud neprojdou. Pusť formátovač projektu na dotčené docs/*.md, když ho projekt má. (4) Zapiš do ${cwd}/docs/.vysledek-stavba-${NN}.json (soubor celý přepiš) přesně tento JSON, beze změny a bez zkracování: ${JSON.stringify(s.vysledek)}; cestu vrať ve vysledek_soubor (když zápis selže, nech pole prázdné). Necommituj. commit_overeny nech prázdné, thermo_nesesouhlaseno 0, chybejici_doklady prázdné; kontext z docs/.kontext.jsonl pro řez ${NN} jako u běžného uzavření.`,
  { label: `uzavření:řez ${NN}:selhání`, phase: 'Uzavření', agentType: 'dev-pipeline:uzavreni', schema: CLOSE, ...M.sonM })

// ---------- obnova: stav přerušeného běhu ----------
// Při obnově je první krok po args deploy agent v režimu obnova-stav (§ 2.3): provedené kroky po nasazení a shoda HEAD s commitem
// řezu ze zápisu nasazení. Nad nasazeným commitem s doloženým nasazením se implementace, review a brána přeskočí bez ohledu na cache.
let obnovaStavOk = false
if (obnova) {
  vstup('Vstup', '')
  const os = await runSePredavkou(`${ramec}

Úkol: stav obnovy řezu ${NN} (režim obnova-stav, nic neměníš, nic nenasazuješ): přečti zápisy nasazení ${cwd}/docs/e2e/rez-${NN}-nasazeni*.md a ${cwd}/${zastavenoPath}, když existují. Vrať commit řezu ze zápisu nasazení (git rev-parse, nikdy dopočítaný), zda git rev-parse HEAD je tento commit nebo pozdější commit měnící jen docs/, zda zápis dokládá úspěšné nasazení tohoto commitu, a kroky po nasazení, které v přerušeném běhu proběhly se stavem provedeno (s číslem kroku z PRD). Bez zápisu vrať head_shodny false a nasazeni_dolozeno false.`,
    { label: `obnova-stav:řez ${NN}`, phase: 'Vstup', agentType: 'dev-pipeline:deploy', schema: OBNOVA_STAV, ...M.sonL })
  if (os) {
    // Provedené kroky jen když se deploy přeměřuje (od_faze ≤ deploy): jinak jde deploy přerušeného pokusu z cache a jeho prompt se nesmí změnit.
    if (FAZE_OBNOVY.indexOf('deploy') >= obnovaOd) zapisProvedene({ kroky_po_nasazeni: pole(os.provedene_kroky).filter(k => k && S(k.krok).trim()).map(k => ({ ...k, stav: 'provedeno' })) })
    obnovaStavOk = os.head_shodny === true && os.nasazeni_dolozeno === true
    const provedeno = new Set(provedeneKroky.values()).size
    log(`obnova: stav přerušeného běhu: ${provedeno ? `${provedeno} provedených kroků po nasazení` : 'žádné provedené kroky po nasazení'}, HEAD ${os.head_shodny === true ? 'je' : 'není'} commit řezu${S(os.commit_rezu).trim() ? ` (${S(os.commit_rezu).trim().slice(0, 12)})` : ''}, nasazení ${os.nasazeni_dolozeno === true ? 'doložené' : 'nedoložené'}${obnovaStavOk ? '; implementace, review a brána se v prvním pokusu obnovy nepouští' : ''}`)
  } else log('obnova: stav přerušeného běhu nezjištěn (agent nevrátil výsledek), pokus běží celý')
}

// ---------- implementace řezu s částmi ----------
// Pokus n: kontrakt (dokud jednou neuspěje), oprava po selhání za implementací, části souběžně bez stropu (myšlení běží na
// serverech, místní těžké příkazy řadí fronta), integrace. Část startuje hned, jak jsou hotové její závislosti, ne až po celé
// předchozí vlně (běh web-podzim: řez 12 K2 čekal 112 min na nesouvisející K4, bariéra vln stála 150 min). Nezávislé části
// pokračují i po selhání jiné, závislé na selhané se nespustí. Připravené části startují od největšího odhadu (strop souběhu).
async function implementaceCasti(n, predchozi, diag, refresh, sberImpl, prostrediZ) {
  const ted = { kontrakt: null, oprava: null, casti: [], integrace: null, chyba: '' }
  // Hotové kroky z dřívějších pokusů se znovu nespustí: jejich follow-upy a odchylky jdou do sběru tohoto pokusu. Bezpečnostní
  // odchylky z nich jsou v securityOpravy už z pokusu, který je sebral (deduplikace podle popisu), deploy je nedostane dvakrát.
  // Jsou to výsledky dřívějších pokusů: do oblastí opravy tohoto pokusu (přenos sekcí E2E) se nepočítají.
  for (const r of [kontraktVysledek, ...casti.map(c => castiStav.get(c.id).vysledek), integraceVysledek]) sberImpl(r, true)

  if (kontraktPotreba && !kontraktHotovo) {
    vstup('Kontrakt', 'implementace')
    const k = await implKontrakt(n, diag, refresh)
    if (!k || k.stav === 'selhalo') {
      kontraktSelhani = k ? S(k.souhrn).trim() || 'stav selhalo' : nic(`implement:řez ${NN}:kontrakt:${n}`, 'agent')
      ted.chyba = `kontrakt: ${kontraktSelhani.slice(0, 800)}`; if (k) sberImpl(k); return ted
    }
    kontraktHotovo = true; kontraktSelhani = ''; kontraktVysledek = k; ted.kontrakt = k; sberImpl(k)
    log(`kontrakt: ${k.stav}, ${cesty(k.soubory).length} souborů, typecheck ${k.typecheck ? 'ok' : 'červený'}`)
  }

  if (opravaZ) {
    vstup('Implementace', 'implementace')
    const o = await implOprava(n, opravaZ, predchozi, diag)
    if (!o || o.stav === 'selhalo') { ted.chyba = `oprava po selhání ve fázi ${opravaZ.faze}: ${o ? S(o.souhrn).slice(0, 800) : nic(`implement:řez ${NN}:oprava:${n}`, 'agent')}`; if (o) sberImpl(o); return ted }
    opravaZ = null; ted.oprava = o; sberImpl(o)
    log(`oprava (pokus ${n}): ${o.stav}, ${trimList(o.zmenena_mista).length} míst, typecheck ${o.typecheck ? 'ok' : 'červený'}`)
  }

  const hotova = id => castiStav.get(id).hotovo
  const selhaloTed = new Set()
  const bezi = new Map()
  const pripravene = () => casti.filter(c => !hotova(c.id) && !selhaloTed.has(c.id) && !bezi.has(c.id) && !zastavene.has(c.id) && c.zavisi_na.every(hotova))
    .sort((x, y) => y.odhad - x.odhad)
  // Část zastavená prostředím zastaví i části, které na ní (i nepřímo) závisí: nestaví se, jdou majiteli se stejným důvodem.
  const zastavZavisle = (id, dukaz) => {
    for (const c of casti.filter(c => c.zavisi_na.includes(id) && !hotova(c.id) && !zastavene.has(c.id))) {
      zastavene.set(c.id, id)
      castiStav.get(c.id).prostredi = true
      prostrediZ({ stav: 'prostredi', dukaz: `závisí na části ${id}: ${dukaz}`, navrh: '' }, `část ${c.id}`)
      zastavZavisle(c.id, dukaz)
    }
  }
  for (;;) {
    for (const c of pripravene()) {
      vstup('Části', 'implementace')
      log(`část ${c.id} start${c.zavisi_na.length ? ` (závislosti hotové: ${c.zavisi_na.join(', ')})` : ''}`)
      bezi.set(c.id, implCast(c, n, diag, refresh).then(r => ({ c, r }), () => ({ c, r: null })))
    }
    if (!bezi.size) break
    let { c, r } = await Promise.race(bezi.values())
    bezi.delete(c.id)
    const st = castiStav.get(c.id)
    ted.casti.push(c.id)
    if (r) sberImpl(r)
    // Stav prostredi bez důkazu je selhalo (§ 2.2); s důkazem je část hotová (kód odevzdaný) a nestojí pokus.
    if (r && r.stav === 'prostredi' && !prostrediZ(r, `část ${c.id}`)) r = { ...r, stav: 'selhalo', souhrn: `prostředí bez důkazu: ${S(r.souhrn).slice(0, 500)}` }
    if (r && r.stav !== 'selhalo') {
      Object.assign(st, { hotovo: true, soubory: cesty(r.soubory), mimo: normMimo(r.mimo_hranici), selhani: '', vysledek: r, prostredi: r.stav === 'prostredi' })
      log(`část ${c.id}: ${r.stav}, ${st.soubory.length} souborů${st.mimo.length ? `, ${st.mimo.length} požadavků mimo hranici` : ''}`)
      if (r.stav === 'prostredi') zastavZavisle(c.id, S(r.dukaz).trim().slice(0, 300))
    } else {
      st.selhani = r ? S(r.souhrn).trim() || 'stav selhalo' : nic(`implement:řez ${NN}:část ${c.id}:${n}`, 'agent')
      selhaloTed.add(c.id)
      log(`část ${c.id} selhala: ${st.selhani.slice(0, 160)}`)
    }
  }
  const nehotove = casti.filter(c => !hotova(c.id) && !zastavene.has(c.id))
  if (nehotove.length) {
    ted.chyba = `části nedokončené: ${nehotove.map(c => `${c.id} (${selhaloTed.has(c.id) ? castiStav.get(c.id).selhani.slice(0, 200) : `čeká na ${c.zavisi_na.filter(z => !hotova(z)).join(', ')}`})`).join(', ')}`
    return ted
  }

  if ((ted.kontrakt || ted.casti.length || !integraceHotovo) && casti.some(c => hotova(c.id))) {
    vstup('Integrace', 'implementace')
    const ig = await implIntegrace(n, diag)
    if (ig) sberImpl(ig)
    if (!ig || ig.stav === 'selhalo') {
      integraceSelhani = ig ? S(ig.souhrn).trim() || 'stav selhalo' : nic(`implement:řez ${NN}:integrace:${n}`, 'agent')
      ted.chyba = `integrace: ${integraceSelhani.slice(0, 800)}`
      return ted
    }
    integraceHotovo = true; integraceSelhani = ''; integraceVysledek = ig; ted.integrace = ig
    log(`integrace: ${ig.stav}, typecheck ${ig.typecheck ? 'ok' : 'červený'}, testy ${ig.testy_zelene ? 'zelené' : 'červené'}`)
  }
  return ted
}

// Štíhlý návrat (běh web-podzim: follow-upy, odchylky a pasti tvořily 80 % návratu stavby a orchestrátor je četl dvakrát,
// v notifikaci i ze souboru): když uzavření prošlo, jsou zapsané v docs/follow-ups.md, journalu a PRD a orchestrátor dostane
// počty; při selhání nebo zastavení jdou celé, zapíše je orchestrátor.
const seznamy = (follow, odch, pasti, zapsano) => ({ follow_ups: zapsano ? [] : follow, odchylky: zapsano ? [] : odch, pasti_opravene: zapsano ? [] : pasti,
  follow_ups_pocet: follow.length, odchylky_pocet: odch.length, pasti_pocet: pasti.length, seznamy_zapsane: zapsano })
// Všechna nasazení bloku a commit řezu z prvního úspěšného nasazení (u řezu s opravou po E2E je poslední commit jen oprava).
// Do návratu (kratka) jde health zkrácený: celé health každého nasazení dělalo návrat selhání nad limit runtime (review 1.6.0 N3).
const historie = kratka => ({ nasazeni: nasazeniHist.map(x => ({ ...x, ...(kratka ? { health: S(x.health).slice(0, 200) } : {}) })), commit_hlavni: (nasazeniHist.find(x => (x.stav === 'success' || x.stav === 'commit-only') && x.commit) || {}).commit || '' })
// Dveře a dosah z posledního nasazení, které je vrátilo (§ 2.9): do souboru výsledku i selhaného a zastaveného bloku.
const dvereDosah = () => { const x = [...nasazeniHist].reverse().find(y => y.dvere) || {}; return { dvere: x.dvere || '', dosah: x.dosah || '' } }
// Návrat pod 6 000 znaků (1.6.0): runtime notifikace useká výsledek kolem 8,1 k a konec návratu by se ztratil (review 1.6.0 N3:
// selhání po třech pokusech mělo 13,4 k a fix(security) hashe stály až na konci). Podstatná pole jdou na začátek návratu; když se
// seznamy přesto nevejdou (uzavření je nezapsalo), zkrátí se položky a ubírá se od konce méně důležitých seznamů. Ubrané položky
// jdou celé do logu bloku (soubor běhu Workflow), počet do návratu.
const LIMIT_NAVRATU = 5800
const doLimitu = r => {
  const delka = () => JSON.stringify(r).length
  if (delka() <= LIMIT_NAVRATU) return r
  const SEZ = ['reports', 'nasazeni', 'prenesene_sekce', 'odmitnute', 'pasti_opravene', 'odchylky', 'spory', 'follow_ups', 'prostredi', 'rozhodnuti']
  const kratce = x => typeof x === 'string' ? (x.length > 240 ? `${x.slice(0, 239)}…` : x) : x && typeof x === 'object' ? { ...x, ...('health' in x ? { health: S(x.health).slice(0, 120) } : {}), ...(Array.isArray(x.kroky_po_nasazeni) ? { kroky_po_nasazeni: x.kroky_po_nasazeni.length } : {}) } : x
  for (const k of SEZ) if (Array.isArray(r[k])) r[k] = r[k].map(kratce)
  const ubrano = {}
  for (const k of SEZ) {
    if (delka() <= LIMIT_NAVRATU) break
    if (!Array.isArray(r[k]) || !r[k].length) continue
    const pryc = []
    while (r[k].length && delka() > LIMIT_NAVRATU - 80) pryc.unshift(r[k].pop())
    if (pryc.length) { ubrano[k] = pryc.length; log(`návrat nad limitem: ${k} bez ${pryc.length} položek: ${pryc.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' | ').slice(0, 6000)}`) }
  }
  if (Object.keys(ubrano).length) r.zkraceno = ubrano
  return r
}

// ---------- jeden pokus ----------
async function pokus(n, predchozi, diag) {
  const followUps = [], odchylky = [], spory = [], pasti = [], reports = [], rozhodnuti = [], odmitnute = [], jinak = [], rozsirene = []
  // Výsledky review pokusu; fail() je předá dalšímu pokusu řezu s částmi (revizeDrive), úspěšný pokus je složí s dřívějšími.
  let ths = [], kola = 0, nalezu = 0, blokujicich = 0, fixAgentu = 0, thermoFix = null
  const revize = () => ({ ths, kola, nalezu, blokujicich, fixAgentu, thermoFix: Boolean(thermoFix), odmitnute: [...odmitnute], jinak: [...jinak] })
  // Malý řez po selhání jen na kroku po nasazení (ne infra, deploy commitnul a nasadil) jen dorovná deploy se stejným stromem
  // (běh web-rijen: řez 2 opakoval celý pokus, review sáhlo mimo rozsah a pokus 3 to vracel; 32 min a $11). Selže-li i dorovnání,
  // další pokus jde celý.
  // Dorovnání jen deploye platí od 1.7.0 i pro řez s částmi: strom se od nasazení nezměnil a v běhu sonnet-5-5 by řez 04 jinak
  // znovu pouštěl opravu, review a bránu nad hotovým kódem.
  const dorovnani = Boolean(predchozi && predchozi.krokSelhal && !predchozi.dorovnani && posledniBrana)
  const fail = (faze, detail, x = {}) => ({ vysledek: 'selhalo', faze, detail: S(detail).slice(0, 1500), ...seznamy(followUps, odchylky, pasti, false), spory, reports, rozhodnuti: sProstredim(rozhodnuti), odmitnute, revize: revize(), dorovnani, ...x })
  // Odmítnuté nálezy se sbírají do journalu (třída H: odmítnutý nález fix agenta nikdo neověřil ani nezapsal).
  // Každá oprava s security: true (review, thermo, brána, E2E) jde deployi jako fix(security), když něco změnila; balíček, který
  // review označilo security, i bez příznaku (vynutit). V revizi 1.4.0 se oprava brány nebo E2E se security: true ke commitu nedostala.
  // Oblasti a soubory změněné v tomto pokusu (§ 2.12): podle nich se v dalším pokusu po opravě přenášejí sekce E2E mimo opravu.
  const oblastiTed = new Set()
  // Položky prostředí (§ 2.2): části a kritéria, které nejde změřit kvůli prostředí; jdou majiteli jako otázka, pokus nestojí.
  const prostrediPolozky = prostrediStav
  const prostrediZ = (r, co) => {
    if (!S(r.dukaz).trim()) { log(`${co}: stav prostredi bez důkazu, blok ho bere jako selhalo`); return false }
    pridejProstredi({ typ: 'prostredi', cast: co, dukaz: S(r.dukaz).trim().slice(0, 600), navrh: S(r.navrh).trim().slice(0, 300) })
    log(`${co}: prostředí (${S(r.dukaz).trim().slice(0, 120)}); pokus se nepočítá, jde majiteli jako otázka`)
    return true
  }
  const sber = (r, sec = {}, stare = false) => {
    if (!r) return
    followUps.push(...(r.follow_ups || [])); odchylky.push(...(r.odchylky_od_prd || [])); spory.push(...(r.spory || [])); pasti.push(...(r.pasti_opravene || []))
    for (const f of [...cesty(r.soubory), ...cestyZ(r.zmenena_mista)]) { zmenyBloku.add(f); if (!stare) oblastiTed.add(f.toLowerCase()) }
    for (const o of trimList(r.oblasti)) { oblastiVse.add(o); if (!stare) oblastiTed.add(o.toLowerCase()) }
    // Bezpečnostní oprava z implementace (implement.md: odchylka s předponou „security:“) jde deployi jako fix(security) stejně jako z review.
    for (const o of trimList(r.odchylky_od_prd)) if (/^security:/i.test(o)) pridejSec({ soubory: [], popis: o.replace(/^security:\s*/i, '').slice(0, 400) })
    if ((r.security === true || sec.vynutit) && (r.opraveno > 0 || trimList(r.zmenena_mista).length)) {
      pridejSec({ soubory: sec.soubory || cestyZ(r.zmenena_mista), popis: `${sec.zdroj || 'bezpečnostní oprava'}: ${trimList(r.zmenena_mista).join('; ').slice(0, 400) || 'viz report'}` })
    }
    odmitnute.push(...pole(r.odmitnuto).filter(Boolean).map(o => `${S(o.id)}: ${S(o.duvod)}`)); jinak.push(...trimList(r.jinak_nez_nalez))
    if (r.rozsireny_zasah && S(r.rozsireny_popis).trim()) rozsirene.push(S(r.rozsireny_popis).trim())
  }
  const sberImpl = (r, stare = false) => { if (!r) return; sber(r, {}, stare); if (r.souhrn_path && !reports.includes(r.souhrn_path)) reports.push(r.souhrn_path) }
  const zmenyPokusu = () => trimList([...odchylky, ...rozsirene]).join(' | ').slice(0, 1500)
  // Kroky po nasazení a zápis nasazení z posledního úspěšného deploye; bezpečnostní opravy a commity jsou stav bloku.
  let krokyPo = [], commitZapisu = '', nasazeniReport = ''
  const nasad = async (k, pozn, x = {}) => {
    const posilam = securityOpravy.length
    // Pokus 2+ a druhé nasazení v pokusu nesou soubory, které blok změnil: patří řezu a commitují se (běh web-rijen: deploy pokusu 2
    // řezu 2 opravy necommitnul a E2E by měřilo strom bez nich).
    const zmenyOprav = n >= 2 || k !== 1 ? [...zmenyBloku] : []
    const d = await deploy(k, pozn, { ...x, security: securityOpravy.slice(secOdeslano), provedene: [...new Set(provedeneKroky.values())], doklad: dokladCesta, zmenyOprav })
    nasazeniHist.push({ pokus: n, k, pozn: S(pozn), stav: d ? S(d.stav) : 'bez výsledku', commit: d ? S(d.commit).trim() : '', health: d ? S(d.health) : '',
      ...(d && S(d.dvere).trim() ? { dvere: S(d.dvere).trim(), dosah: S(d.dosah).trim().slice(0, 40) } : {}),
      kroky_po_nasazeni: d ? pole(d.kroky_po_nasazeni).filter(Boolean).map(kr => ({ ...(idKroku(kr) != null ? { id: idKroku(kr) } : {}), krok: S(kr.krok), stav: S(kr.stav), duvod: S(kr.duvod) })) : [] })
    // Hashe fix(security) bere blok z každého návratu, i z neúspěšného: deploy, který commitnul a pak padl (infra), je vytvořil
    // (revize 1.4.0: po zastavení se ztratily a obnova poslala tytéž opravy ke commitu znovu). Opravy s commitem jsou odeslané.
    if (d) securityCommity.push(...trimList(d.security_commity))
    // Bezpečnostní oprava v souboru, který řez sám vytvořil, nejde samostatným commitem: deploy dá řádek fix(security) do zprávy
    // commitu řezu (1.7.0, běh sonnet-5-5 řez 04). Blok to zaloguje a opravy jsou odeslané, jinak by je pokus 2 dostal znovu.
    const radkem = d ? S(d.security_radkem).trim() : ''
    if (radkem) {
      if (!securityRadkem.includes(radkem)) securityRadkem.push(radkem)
      log(`bezpečnostní oprava bez samostatného commitu (soubor řezu), řádkem v ${radkem}`)
    }
    const chyba = chybaNasazeni(d, k)
    if (!chyba || (d && (trimList(d.security_commity).length || radkem))) secOdeslano = posilam
    // Provedené kroky z každého nasazení, i z toho, které padlo na jiném kroku (řez 2 v běhu web-rijen je opakoval).
    if (d) zapisProvedene(d)
    if (!chyba) {
      if (pole(d.kroky_po_nasazeni).length && !x.jenCommit) krokyPo = pole(d.kroky_po_nasazeni).filter(Boolean).map(x => `${fmtKrok({ ...x, duvod: '' })}: ${S(x.stav)}${x.duvod ? ` (${S(x.duvod)})` : ''}`)
      if (S(d.commit_zapisu).trim()) commitZapisu = S(d.commit_zapisu).trim()
      if (S(d.report_path).trim()) { nasazeniReport = S(d.report_path).trim(); if (!reports.includes(nasazeniReport)) reports.push(nasazeniReport) }
    }
    // Commit-only: nasazuje majitel, vynechané kroky po nasazení jsou jeho práce po nasazení (rozhodnutí), ne selhání. Neplatí
    // pro commit opravy po E2E mimo kód aplikace (jenCommit): řez je nasazený a kroky se nespouštěly, úkol pro majitele by byl falešný.
    if (d && d.stav === 'commit-only' && !x.jenCommit) for (const kr of vynechane(d)) { const t = `[řez ${NN} · krok po nasazení pro majitele] ${kr}: proveď po svém nasazení`; if (!rozhodnuti.includes(t)) rozhodnuti.push(t) }
    // Krok pro majitele (krok, který PRD vede jako ruční nebo neblokující) není selhání nasazení, jde do rozhodnutí.
    if (d && d.stav !== 'failed') for (const kr of krokyStav(d, 'pro-majitele').map(fmtKrok)) { const t = `[řez ${NN} · krok po nasazení pro majitele] ${kr}`; if (!rozhodnuti.includes(t)) rozhodnuti.push(t) }
    return d
  }
  // Infra selhání nasazení (přihlášení CLI, účet, výpadek platformy) pokus nespotřebuje: blok zastaví a orchestrátor ho po
  // nápravě obnoví od fáze deploy. V běhu bez-dluhu padl pokus 3 řezu 1 na přihlášení wrangleru, předem ztracený.
  // Commit řezu a fix(security), které deploy stihl před pádem, jdou do návratu: obnova je jinak commitne podruhé (revize 1.4.0).
  // Odklad (1.7.0) zastaví stejně jako infra, jen s fází deploy-odklad a časem nejdriv; pokus se nepočítá ani u něj.
  // Seznamy přerušeného běhu zapíše levné uzavření do docs/.vysledek-stavba-NN-zastaveno.json (§ 1.5 spec 1.7.0).
  const zastav = async d => {
    const odklad = odlozeno(d)
    const sezn = { follow_ups: osudy([...driveSeznamy.follow, ...zeStropu.follow, ...followUps]), odchylky: trimList([...driveSeznamy.odch, ...zeStropu.odch, ...odchylky]), pasti: trimList([...driveSeznamy.pasti, ...zeStropu.pasti, ...pasti]) }
    const faze = odklad ? 'deploy-odklad' : 'deploy-infra'
    const detail = (odkladBezCasu(d) ? `odklad bez platného nejdriv (${S(d.nejdriv).trim() || 'prázdné'}): ${S(d.duvod) || 'bez důvodu'}` : S(d.duvod)).slice(0, 1500)
    if (odkladBezCasu(d)) log(`deploy vrátil odklad bez platného nejdriv („${S(d.nejdriv).trim()}“): blok zastaví jako infra selhání, obnovu nemá na kdy naplánovat`)
    let zapsano = ''
    if (sezn.follow_ups.length || sezn.odchylky.length || sezn.pasti.length) {
      vstup('Uzavření', 'uzavreni')
      const cz = await closeZastaveno({ faze, detail, ...sezn })
      zapsano = cz && cz.ok ? S(cz.vysledek_soubor).trim() || `${cwd}/${zastavenoPath}` : ''
      log(zapsano ? `zastavení: seznamy přerušeného běhu zapsané (${sezn.follow_ups.length} follow-upů, ${sezn.odchylky.length} odchylek, ${sezn.pasti.length} pastí) do ${zapsano}` : `zastavení: seznamy přerušeného běhu se nepodařilo zapsat, návrat je nese celé (${sezn.follow_ups.length} follow-upů, ${sezn.odchylky.length} odchylek, ${sezn.pasti.length} pastí)`)
    }
    // Návrat nese seznamy celého bloku (dřívější pokusy, strop předávek i tento pokus), ne jen aktuálního pokusu (plan-check 1.7.0,
    // nález 9). seznamy_zapsane: true = blok je zapsal do zastaveno_soubor (nebo žádné nejsou) a orchestrátor je neopisuje;
    // false = zápis selhal a orchestrátor je zapíše do docs/.vysledek-stavba-NN-zastaveno.json sám.
    const mame = sezn.follow_ups.length || sezn.odchylky.length || sezn.pasti.length
    return { vysledek: 'zastaveno', faze, ...(odklad ? { nejdriv: S(d.nejdriv).trim() } : { infra: true }), detail, pokusy: n, commit: S(d.commit).trim(), security_commity: trimList(securityCommity), ...(securityRadkem.length ? { security_radkem: [...securityRadkem] } : {}), ...seznamy(sezn.follow_ups, sezn.odchylky, sezn.pasti, !!zapsano || !mame), ...(zapsano ? { zastaveno_soubor: zapsano } : {}), spory, reports, rozhodnuti: [], ...historie(true) }
  }

  let refresh = null
  if (n === 1 && (prdStale.length || hypBlokujici.length)) {
    vstup('Refresh PRD', 'refresh')
    refresh = await refreshCheck()
    if (!refresh) log('refresh PRD: prd-check nevrátil výsledek, stavím podle původního PRD')
    else {
      reports.push(refresh.report_path)
      log(`refresh PRD (${prdStale.length ? `${prdStale.length} řezů od PRD` : `jen ${hypBlokujici.length} blokujících nálezů delty`}): ${refresh.verdikt}, ${refresh.nalezu} nálezů, ${refresh.blokujicich} blokujících`)
      if (refresh.verdikt === 'needs-fixes') {
        const rf = await refreshFix(refresh)
        if (rf) { spory.push(...(rf.spory || [])); log(`refresh PRD: zapracováno (${(rf.zmenena_mista || []).length} míst, ${(rf.odmitnute || []).length} odmítnuto)`) }
        else log('refresh PRD: zapracování selhalo, nálezy jdou implementaci jako hypotézy')
      }
    }
  }

  // ---- implementace ----
  let ted = null, branaReport = '', meridla = []
  // Obnova nad nasazeným commitem řezu (§ 2.3): HEAD je commit řezu a nasazení je doložené, implementace, review a brána se v prvním
  // pokusu obnovy nepouští bez ohledu na cache; zestárlé PRD přeměřil jen refresh výše.
  const preskoc = obnovaStavOk && n === obnovaPokus && !dorovnani
  if (dorovnani) {
    log(`pokus ${n}: jen dorovnání deploye po selhání kroku po nasazení (${S(predchozi.detail).slice(0, 160)}); implementace, review a brána se nepouští, strom je stejný`)
    branaReport = posledniBrana.report; meridla = posledniBrana.meridla
  } else if (preskoc) {
    log(`pokus ${n}: obnova nad nasazeným commitem řezu (HEAD je commit řezu, nasazení doložené): implementace, review a brána se nepouští${prdStale.length || hypBlokujici.length ? ', PRD přeměřil jen refresh' : ''}`)
  } else {
    if (!sCastmi) {
      vstup('Implementace', 'implementace')
      const im = await impl(n, predchozi, diag, refresh)
      if (!im) return fail('implementace', nic(`implement:řez ${NN}:${n}`, 'implementační agent'))
      sberImpl(im)
      log(`implementace (pokus ${n}): ${im.stav}, typecheck ${im.typecheck ? 'ok' : 'červený'}, testy ${im.testy_zelene ? 'zelené' : 'červené'}`)
      if (im.stav === 'prostredi' && !prostrediZ(im, `řez ${NN}`)) im.stav = 'selhalo'
      if (im.stav === 'selhalo') return fail('implementace', im.souhrn)
    } else {
      ted = await implementaceCasti(n, predchozi, diag, refresh, sberImpl, prostrediZ)
      if (ted.chyba) return fail('implementace', ted.chyba)
    }

    // ---- review ----
    vstup('Review', 'review')
    // Lehký profil: bez thermo a bez kola 2 (řez bez runtime dopadu; v běhu doplneni-webu stálo review řezu 0 víc než jeho implementace).
    if (profil === 'lehky') log('lehký profil: thermo se nekoná, review má jedno kolo')
    // U částí jde review po částech (jen soubory části) a integrační review nad kontraktem a švy; každá hotová část projde
    // review jednou, i když byla hotová už v pokusu, který padl dřív, než review začalo.
    const ulohy = []
    const kRevizi = sCastmi ? casti.filter(c => castiStav.get(c.id).hotovo && !castiStav.get(c.id).zrevidovano) : []
    // Pořadí nejdelší první: při stropu souběhu Workflow čekal nejdelší agent dávky (integrační review) ve frontě až nakonec
    // (běh web-podzim: fronta review ~1 h za běh). Integrační review a review opravy, pak review částí od největší, pak thermo.
    if (!sCastmi) {
      ulohy.push({ f: () => reviewRez() })
      if (profil !== 'lehky') ulohy.push({ th: true, f: () => thermo(null) })
    } else {
      if (ted.integrace) ulohy.push({ f: () => reviewIntegrace(ted.integrace) })
      if (ted.oprava) ulohy.push({ f: () => reviewOprava(ted.oprava, n) })
      const rozsah = c => { const st = castiStav.get(c.id); return st.soubory.length ? st.soubory : c.soubory }
      const podleVelikosti = [...kRevizi].sort((x, y) => rozsah(y).length - rozsah(x).length)
      for (const c of podleVelikosti) ulohy.push({ cast: c.id, f: () => reviewCast(c, rozsah(c)) })
      if (profil !== 'lehky') for (const c of podleVelikosti) ulohy.push({ th: true, cast: c.id, f: () => thermo(c, rozsah(c)) })
    }
    const vysReview = ulohy.length ? await parallel(ulohy.map(u => u.f)) : []
    // Část je zrevidovaná, až když její review (v plném profilu i thermo) vrátilo výsledek; jinak ji posoudí další pokus
    // (revize 1.4.0: review části K2 bez výsledku ji označilo za zrevidovanou a pokus 2 ji už nikdo neposoudil).
    for (const c of kRevizi) {
      const bez = ulohy.filter((u, i) => u.cast === c.id && !vysReview[i]).map(u => (u.th ? 'thermo' : 'review'))
      if (bez.length) log(`část ${c.id}: ${bez.join(' a ')} bez výsledku, část posoudí další pokus`)
      else castiStav.get(c.id).zrevidovano = true
    }
    ths = vysReview.filter((r, i) => r && ulohy[i].th)
    const r1s = vysReview.filter((r, i) => r && !ulohy[i].th)
    const thNalezu = ths.reduce((s, t) => s + (Number(t.nalezu) || 0), 0), thBlokeru = ths.reduce((s, t) => s + (Number(t.blokeru) || 0), 0)
    if (ths.length) { ths.forEach(t => reports.push(t.report_path)); log(`thermo: ${thNalezu} nálezů, ${thBlokeru} blokujících${ths.length > 1 ? ` (${ths.length} reportů)` : ''}`) }
    const sThermoNalezy = ths.filter(t => t.nalezu > 0)
    // Thermo bez souborů BLOCKER/HIGH, nebo když žádné review nevrátilo výsledek, opravuje samostatný agent (jako dřív). Report jen
    // s NOTE (žádný blokující ani soubor BLOCKER/HIGH) opravu nedostane: v běhu web-rijen stálo 6 takových agentů $1,49 a opravili 2 věci.
    const jenNote = t => !thermoSoubory(t).length && !(Number(t.blokeru) > 0)
    const thermoZbyva = sThermoNalezy.filter(t => !jenNote(t) && (!r1s.length || !thermoSoubory(t).length))
    if (sThermoNalezy.some(jenNote)) log(`thermo: ${sThermoNalezy.filter(jenNote).length} reportů jen s NOTE, samostatná oprava se nekoná`)
    // FOLLOW-UP nálezy review zůstávají v balíčcích k opravě; do follow-upů jde ten, který fix balíčku neopravil ani neodmítl,
    // a odmítnutý s důvodem (běh web-rijen: 0 z 60 follow_up_ids došlo do follow-upů, cesta byla mrtvá). opravene_ids je povinné:
    // nález, který v něm není, fix neopravil (dřívější výjimka „bez pole = opraveno“ by mrtvou cestu vrátila).
    const followZOprav = (opravy, fuIds) => {
      for (const { f, b } of opravy) for (const z of b.zdroje.filter(x => !x.thermo)) {
        const fu = fuIds.get(z.report) || new Set()
        for (const id of z.ids.filter(x => fu.has(x))) {
          const odm = f && pole(f.odmitnuto).find(o => o && S(o.id).trim() === id)
          const fu = t => followUps.push(sOsudem(t, { soubory: b.soubory, oblast: oblastZ(b.soubory) || 'review', osud: 'oprava' }))
          if (!f) fu(`${id} (FOLLOW-UP z ${z.report}; fix balíčku nevrátil výsledek)`)
          else if (odm) fu(`${id} (FOLLOW-UP z ${z.report}; fix odmítl: ${S(odm.duvod).slice(0, 300)})`)
          else if (!trimList(f.opravene_ids).includes(id)) fu(`${id} (FOLLOW-UP z ${z.report}; fix ho neopravil)`)
        }
      }
    }
    const fuMapa = rs => new Map(rs.map(r => [S(r.report_path), new Set(trimList(r.follow_up_ids))]))
    if (r1s.length) {
      kola = 1
      nalezu = r1s.reduce((s, r) => s + (Number(r.nalezu) || 0), 0); blokujicich = r1s.reduce((s, r) => s + (Number(r.blokujicich) || 0), 0)
      r1s.forEach(r => reports.push(r.report_path))
      let balicky = sluc(r1s.flatMap(balickyZ))
      for (const t of sThermoNalezy.filter(t => thermoSoubory(t).length)) balicky = pridejThermo(balicky, t)
      // Nejdelší balíček první (strop souběhu Workflow): podle počtu souborů, pak počtu nálezů.
      const vaha = b => [b.soubory.length, b.zdroje.reduce((s, z) => s + z.ids.length, 0)]
      balicky.sort((x, y) => vaha(y)[0] - vaha(x)[0] || vaha(y)[1] - vaha(x)[1])
      // FOLLOW-UP nálezy review, které nejdou opravě, jdou do follow-upů s odkazem na report (dosud se ztrácely v gitignorovaných reportech).
      const kOprave = new Set(r1s.flatMap(r => pole(r.balicky).flatMap(b => trimList(b && b.nalezy).map(id => `${S(r.report_path)}#${id}`))))
      for (const r of r1s) for (const id of trimList(r.follow_up_ids)) if (!kOprave.has(`${S(r.report_path)}#${id}`)) followUps.push(sOsudem(`${id} (FOLLOW-UP z ${S(r.report_path)})`, { oblast: 'review', osud: 'oprava' }))
      log(`review 1: ${nalezu} nálezů, ${blokujicich} blokujících${r1s.length > 1 ? ` (${r1s.length} review)` : ''}, ${balicky.length} balíčků${balicky.some(b => b.zdroje.some(z => z.thermo)) ? ' (thermo v téže vlně)' : ''}`)
      const vsechnyThermo = thermoIdsVsech(balicky)
      const vysledkyOprav = await parallel(balicky.map((b, i) => () => fixBalicek(b, i, 1, vsechnyThermo).then(f => ({ f, b }))))
      followZOprav(vysledkyOprav.filter(Boolean), fuMapa(r1s))
      const opravy = vysledkyOprav.filter(x => x && x.f)
      fixAgentu += opravy.length
      const odmBlok = []
      for (const { f, b } of opravy) {
        sber(f, { vynutit: b.security, soubory: b.soubory, zdroj: b.zdroje.flatMap(z => z.ids).join(', ') || 'bezpečnostní balíček' })
        odmBlok.push(...pole(f.odmitnuto).filter(o => o && o.blokuje).map(o => `${S(o.id)} — ${S(o.duvod).slice(0, 300)}`))
      }
      const rozsireni = opravy.filter(x => x.f.rozsireny_zasah)
      const varka = trimList(opravy.flatMap(x => x.f.zmenena_mista || []))
      // Kolo 2 i nad odmítnutým blokujícím nálezem: obstojí odmítnutí? (třída H)
      if (profil !== 'lehky' && opravy.length && (rozsireni.length || blokujicich > 0 || thBlokeru > 0 || odmBlok.length)) {
        if (odmBlok.length) log(`review 1: ${odmBlok.length} blokujících nálezů odmítnuto, kolo 2 přeměří odmítnutí`)
        const r2 = await review2(varka.length ? varka : ['celá opravná várka'], odmBlok, r1s.map(r => r.report_path))
        if (r2) {
          kola = 2; nalezu += r2.nalezu; blokujicich = r2.blokujicich; reports.push(r2.report_path)
          log(`review 2 (opravná várka): ${r2.nalezu} nálezů, ${r2.blokujicich} blokujících`)
          if (r2.blokujicich > 0 && (r2.balicky || []).length) {
            const kOprave2 = new Set(pole(r2.balicky).flatMap(b => trimList(b && b.nalezy)))
            for (const id of trimList(r2.follow_up_ids)) if (!kOprave2.has(id)) followUps.push(sOsudem(`${id} (FOLLOW-UP z ${S(r2.report_path)})`, { oblast: 'review', osud: 'oprava' }))
            const vsechny = { soubory: cesty(r2.balicky.flatMap(b => b.soubory || [])), security: r2.balicky.some(b => b.security), zdroje: [{ report: S(r2.report_path), ids: trimList(r2.balicky.flatMap(b => b.nalezy || [])) }] }
            const f2 = await fixBalicek(vsechny, 0, 2); fixAgentu += f2 ? 1 : 0
            sber(f2, { vynutit: vsechny.security, soubory: vsechny.soubory, zdroj: vsechny.zdroje[0].ids.join(', ') || 'bezpečnostní balíček' })
            followZOprav([{ f: f2, b: vsechny }], fuMapa([r2]))
            log('review: třetí kolo se nekoná, zbylé nálezy jdou do follow-ups')
          } else {
            // Bez blokujících se kolo 2 neopravuje: jeho FOLLOW-UP nálezy jdou do follow-upů všechny, i ty v balíčcích (běh web-rijen:
            // 2 CONFIRMED nálezy kola 2 se při blokujicich 0 nezapsaly nikam).
            for (const id of trimList(r2.follow_up_ids)) followUps.push(sOsudem(`${id} (FOLLOW-UP z ${S(r2.report_path)})`, { oblast: 'review', osud: 'oprava' }))
          }
        }
      }
    } else log(ulohy.length ? 'review nevrátilo výsledek, pokračuji bránou' : 'review: v tomto pokusu není co posoudit')
    if (thermoZbyva.length) {
      thermoFix = await fixThermo(thermoZbyva); sber(thermoFix, { zdroj: 'oprava thermo' }); fixAgentu += thermoFix ? 1 : 0
      if (thermoFix) log(`thermo oprava samostatně: ${thermoFix.opraveno} opraveno, ${(thermoFix.odmitnuto || []).length} odmítnuto`)
    }

    // ---- brána ----
    vstup('Brána', 'brana')
    let v = await verify(1)
    if (!v) return fail('brána', nic(`verify:řez ${NN}:1`, 'verify agent'))
    let vk = 1
    if (!zelena(v)) {
      log(`brána červená: ${branaDuvod(v).slice(0, 200)}; jedna oprava`)
      const fb = await fixBrana(v); sber(fb, { zdroj: 'oprava brány' }); fixAgentu += fb ? 1 : 0
      v = await verify(2); vk = 2
      if (!zelena(v)) return fail('brána', v ? `${branaDuvod(v)}: ${(v.selhavajici || []).slice(0, 10).join(' | ')}` : nic(`verify:řez ${NN}:2`, 'verify agent'))
    }
    branaReport = S(v.vystup_path).trim() || rep('verify', vk)
    meridla = trimList(v.meridla)
    posledniBrana = { report: branaReport, meridla }
    log(`brána zelená: ${v.proslo} testů${meridla.length ? `, ${meridla.length} měřidel` : ''}${trimList(v.kontroly).length ? `, ${trimList(v.kontroly).length} kontrol pre-commitu` : ''}`)

    // Doklad před migrací se pořizuje jednou za blok: pokus 2 a dál dostane doklad z dřívějšího pokusu (stav před prvním zápisem;
    // nový doklad by zachytil stav po zápisech, běh web-podzim řez 04). Cestu bere blok z návratu agenta (při existujícím souboru
    // zapisuje doklad vedle s příponou -p<pokus>).
    if (dokladPred && dokladCesta) log(`doklad před nasazením: platí doklad z dřívějšího pokusu (${dokladCesta}), znovu se nepořizuje`)
    else if (dokladPred) {
      vstup('Doklad', 'doklad')
      let dk = await doklad()
      if (!dk || !dk.ok) { log(`doklad před nasazením: ${dk ? S(dk.duvod).slice(0, 160) : nic(`doklad:řez ${NN}`, 'agent')}; jeden pokus navíc`); dk = await doklad() }
      if (!dk || !dk.ok) return fail('doklad', dk ? `doklad před migrací nejde pořídit: ${S(dk.duvod).slice(0, 600)}` : nic(`doklad:řez ${NN}`, 'doklad agent'))
      dokladCesta = S(dk.path).trim() || dokladPath
      reports.push(dokladCesta); log(`doklad před nasazením: ${S(dk.souhrn).slice(0, 160) || dokladCesta}`)
    }
  }

  // ---- deploy ----
  vstup('Deploy', 'deploy')
  // Pokus 2+ po selhání v deployi nebo E2E: deploy dostane příčinu a diagnózu (v řezu 1 běhu bez-dluhu dostal deploy v každém
  // pokusu stejné zadání a zopakoval tutéž chybu).
  const predDeploy = predchozi && ['deploy', 'e2e'].includes(predchozi.faze) ? predchozi : null
  let d = await nasad(1, dorovnani ? 'dorovnání kroků po nasazení' : '', { predchozi: predDeploy, diag, dorovnani })
  if (zastavit(d)) return zastav(d)
  // Selhání jen na kroku po nasazení (deploy commitnul a nasadil): malý řez v dalším pokusu jen dorovná deploy. Deploy uspěl
  // (success), nebo vrátil failed bez infra, ale commitnul a nese vadné kroky (podle deploy.md hlásí success; starší výklad
  // „nasazení selhalo“ vracel failed a dorovnání by se nespustilo).
  const jenKrok = x => !!x && (x.stav === 'success' || (x.stav === 'failed' && !x.infra && !!S(x.commit).trim() && chybneKroky(x).length > 0))
  if (chybaNasazeni(d, 1)) return fail('deploy', chybaNasazeni(d, 1), jenKrok(d) ? { krokSelhal: true } : {})
  // Commit, který běží v prostředí: E2E ho ověřuje jako nasazenou revizi (commit opravy bez nasazení ho nemění).
  let nasazeny = S(d.commit).trim()
  log(`deploy: ${d.stav}, commit ${d.commit}${krokyPo.length ? `, ${krokyPo.length} kroků po nasazení` : ''}${securityCommity.length ? `, ${securityCommity.length} bezpečnostních commitů` : ''}`)

  // ---- E2E ----
  vstup('E2E', 'e2e')
  // Verdikt se odvozuje z počtů, ne z textu verifikátora: fail > 0 je fail, ať verifikátor napsal cokoli.
  // Vadné kritérium (nesplnitelné, kolidující, předřezový nález, scénář zastaralý po opravě) není selhání implementace:
  // žádná oprava ani další pokus, řez se uzavře a kritérium jde orchestrátorovi jako rozhodnutí pro majitele.
  // Kritéria prostředí (§ 2.2) jen s důkazem; bez důkazu jsou FAIL. FAIL mimo hranici řezu (§ 2.12) jen s důkazem. Verdikt z počtů.
  const normE2E = e => {
    const vadna = trimList(e.vadna_kriteria)
    e.vadna_kriteria = vadna
    // FAIL kritéria jako objekty {kriterium, selhani, pricina_mimo_rez} (starší návrat: řetězce): v bloku dál jako řetězce, příčina mimo řez do mimo_rez.
    const failObj = pole(e.fail_kriteria).filter(x => x && (typeof x === 'string' ? x.trim() : S(x.kriterium).trim()))
    const mimoZ = failObj.filter(x => typeof x === 'object' && x.pricina_mimo_rez && S(x.pricina_mimo_rez.dukaz).trim()).map(x => ({ kriterium: S(x.kriterium).trim().slice(0, 200), dukaz: S(x.pricina_mimo_rez.dukaz).trim().slice(0, 600) }))
    e.fail_kriteria = trimList(failObj.map(x => typeof x === 'string' ? x : `${S(x.kriterium).trim()}${S(x.selhani).trim() ? `: ${S(x.selhani).trim()}` : ''}`.slice(0, 400)))
    e.prostredi_nasazeni = vadaNasazeni(e)
    const pk = pole(typeof e.prostredi === 'string' ? [] : e.prostredi).filter(x => x && typeof x === 'object' && S(x.kriterium).trim())
    const bezDukazu = pk.filter(x => !S(x.dukaz).trim())
    e.prostredi = pk.filter(x => S(x.dukaz).trim()).map(x => ({ kriterium: S(x.kriterium).trim().slice(0, 200), sekce: S(x.sekce).trim().slice(0, 120), dukaz: S(x.dukaz).trim().slice(0, 600), navrh: S(x.navrh).trim().slice(0, 300) }))
    if (bezDukazu.length) {
      log(`E2E: ${bezDukazu.length} kritérií prostředí bez důkazu, počítají se jako FAIL`)
      e.fail_kriteria = [...pole(e.fail_kriteria), ...bezDukazu.map(x => `${S(x.kriterium).trim()} (prostředí bez důkazu)`)]
      e.fail = (Number(e.fail) || 0) + bezDukazu.length
    }
    e.mimo_rez = [...pole(e.mimo_rez).filter(x => x && typeof x === 'object' && S(x.kriterium).trim() && S(x.dukaz).trim()).map(x => ({ kriterium: S(x.kriterium).trim().slice(0, 200), dukaz: S(x.dukaz).trim().slice(0, 600) })), ...mimoZ]
    e.vysledek = (e.fail > 0 || (e.fail_kriteria || []).length) ? 'fail' : vadna.length ? 'vada-kriteria' : e.prostredi.length ? 'prostredi' : e.castecne > 0 ? 'pass-castecne' : 'pass'
    if (e.fail === 0 && (e.fail_kriteria || []).length) e.fail = e.fail_kriteria.length
    return e
  }
  // Všechna FAIL kritéria mají doloženou příčinu mimo hranici řezu: v posledním pokusu se řez uzavře s otázkou, ne jako selhalo.
  const mimoRezVse = x => { const f = trimList(x.fail_kriteria); return f.length > 0 && (Number(x.fail) || 0) <= f.length && f.every(fk => pole(x.mimo_rez).some(mr => kId(mr.kriterium) === kId(fk))) }
  const uzavritMimoRez = x => {
    log(`E2E: všechna FAIL kritéria (${trimList(x.fail_kriteria).length}) mají doloženou příčinu mimo hranici řezu; poslední pokus, řez se uzavře s otázkou pro majitele`)
    for (const mr of x.mimo_rez) rozhodnuti.push({ typ: 'mimo_rez', kriterium: mr.kriterium, dukaz: mr.dukaz })
    return normE2E({ ...x, fail: 0, fail_kriteria: [] })
  }
  // Přenos sekcí E2E (§ 2.12): v dalším pokusu po opravě jen skupiny, jejichž sekce mají oblasti protínající opravu.
  const prenos = n > 1 && !dorovnani ? skupinyKPrenosu(oblastiTed) : new Set()
  if (prenos.size) log(`E2E: ${prenos.size} ${prenos.size === 1 ? 'skupina sekcí se přenáší' : 'skupiny sekcí se přenášejí'} z posledního zeleného kola (oblasti mimo opravu): ${[...prenos].flatMap(i => e2eSkupiny[i]).join(' | ')}`)
  const e2eOpts = () => ({ commit: nasazeny, nasazeni: nasazeniReport, brana: branaReport, meridla, zmeny: zmenyPokusu(), prenos })
  let e = await e2e(1, e2eOpts())
  if (e2eNic(e, 1)) return fail('e2e', e2eNic(e, 1))
  // Vada prostředí (nasazená revize není commit řezu, aplikace nedostupná) není nález pro fix agenta: jednou dorovnat nasazení
  // s popisem vady od E2E a přeměřit.
  if (vadaNasazeni(e)) {
    log(`E2E 1: vada nasazení (${vadaNasazeni(e).slice(0, 160)}); dorovnání nasazení a jedno přeměření`)
    const dp = await nasad(2, 'dorovnání prostředí po E2E', { prostredi: vadaNasazeni(e) })
    if (zastavit(dp)) return zastav(dp)
    if (chybaNasazeni(dp, 2)) return fail('deploy', chybaNasazeni(dp, 2))
    d = dp; nasazeny = S(dp.commit).trim()
    e = await e2e(1, e2eOpts())
    if (e2eNic(e, 1)) return fail('e2e', `${e2eNic(e, 1)} po dorovnání prostředí`)
    if (vadaNasazeni(e)) return fail('e2e', `vada nasazení trvá: ${vadaNasazeni(e).slice(0, 600)}`)
  }
  normE2E(e); reports.push(e.report_path)
  const preneseneSekce = trimList(e.prenesene_sekce)
  log(`E2E 1: ${e.vysledek} (${e.pass}/${e.celkem}, částečně ${e.castecne}, fail ${e.fail}${e.vadna_kriteria.length ? `, vadná kritéria ${e.vadna_kriteria.length}` : ''}${e.prostredi.length ? `, prostředí ${e.prostredi.length}` : ''}${e2eSkupiny.length >= 2 ? `, ${e2eSkupiny.length} verifikátoři` : ''}${preneseneSekce.length ? `, přeneseno sekcí ${preneseneSekce.length}` : ''})`)
  if (e.vysledek === 'fail' && n === MAX_POKUSU && mimoRezVse(e)) e = uzavritMimoRez(e)
  if (e.vysledek === 'fail') {
    const fe = await fixE2E(e, 1); sber(fe, { zdroj: 'oprava po E2E' }); fixAgentu += fe ? 1 : 0
    // Nový krok nad platformou z opravy (§ 2.4): s oporou v Povolení jde do nasazení jako další krok (vynutí nasazení); bez opory se
    // oprava nenasadí (jen commit), kritérium jde majiteli jako otázka a kolo 2 ho nepřeměřuje.
    const nove = pole(fe && fe.novy_krok_po_nasazeni).filter(x => x && S(x.krok).trim()).map(x => ({ krok: S(x.krok).trim().slice(0, 300), duvod: S(x.duvod).trim().slice(0, 300), opora: S(x.opora).trim().slice(0, 300), kriterium: S(x.kriterium).trim().slice(0, 160) }))
    const sOporou = nove.filter(x => x.opora), bezOpory = nove.filter(x => !x.opora)
    const failKola1 = trimList(e.fail_kriteria)
    const vyjmuta = bezOpory.length ? (bezOpory.some(x => !x.kriterium) ? failKola1 : failKola1.filter(fk => bezOpory.some(x => kId(x.kriterium) === kId(fk)))) : []
    if (bezOpory.length) {
      log(`oprava po E2E vyžaduje krok nad platformou bez opory v Povolení (${bezOpory.map(x => x.krok).join(' | ').slice(0, 200)}): krok se neprovede, kód se nasadí bez něj, ${vyjmuta.length} kritérií jde majiteli jako otázka a pokus se kvůli nim nepočítá`)
      for (const x of bezOpory) rozhodnuti.push({ typ: 'novy_krok', kriterium: x.kriterium || vyjmuta.join(' | ').slice(0, 300), krok: x.krok, duvod: x.duvod })
    }
    if (sOporou.length) log(`oprava po E2E přidává krok po nasazení s oporou v Povolení: ${sOporou.map(x => x.krok).join(' | ').slice(0, 200)}`)
    // Oprava po E2E, která změnila kód, projde bránou jako bezpečnostní oprava (běh web-rijen: řezy 4 a 10 šly do nasazení bez
    // brány). Kód mimo apps a packages (měřicí nástroj, skript) bránou a jen commitem bez nasazení, jen docs commitem, bez změny nic.
    const zasah = zasahOpravy(fe)
    if (zasah === 'kod' || zasah === 'mimo') {
      vstup('Brána', 'brana')
      let ve = await verify('e2e')
      if (!zelena(ve)) {
        log(`brána po opravě E2E červená: ${branaDuvod(ve).slice(0, 200)}; jedna oprava`)
        const fb = ve ? await fixBrana(ve) : null; sber(fb, { zdroj: 'oprava brány' }); fixAgentu += fb ? 1 : 0
        ve = await verify('e2e-2')
        if (!zelena(ve)) return fail('e2e', `oprava po E2E neprošla bránou: ${branaDuvod(ve)}${ve ? `: ${(ve.selhavajici || []).slice(0, 10).join(' | ')}` : ''}`)
      }
      branaReport = S(ve.vystup_path).trim() || rep('verify', 'e2e'); meridla = trimList(ve.meridla); posledniBrana = { report: branaReport, meridla }
      vstup('Deploy', 'deploy')
    }
    // Krok s oporou vynutí nasazení i u opravy mimo kód aplikace; krok bez opory nasazení nebrání (review N5): kód se nasadí normálně bez
    // něj a kolo 2 přeměří jen kritéria, která ten krok nepotřebují.
    const nasadit = sOporou.length ? 'kod' : zasah
    if (nasadit !== 'nic') {
      const d2 = await nasad(2, nasadit === 'kod' ? 'oprava po E2E' : 'oprava po E2E bez nasazení', nasadit === 'kod' ? { noveKroky: sOporou } : { jenCommit: true })
      if (zastavit(d2)) return zastav(d2)
      if (chybaNasazeni(d2, 2)) return fail('deploy', chybaNasazeni(d2, 2))
      // Commit opravy mimo kód aplikace řez nenasazuje: stav a health zůstávají z posledního nasazení, mění se jen commit řezu.
      if (nasadit === 'kod') { d = d2; nasazeny = S(d2.commit).trim() }
      else d = { ...d, commit: S(d2.commit).trim() || d.commit }
    } else log('E2E 1: oprava nic nezměnila, kolo 2 bez nového nasazení')
    vstup('E2E', 'e2e')
    const e1 = e
    // Kolo 2 přeměří jen jmenovaná FAIL kritéria kola 1 (bez kritérií vyjmutých kvůli kroku mimo Povolení). Když kolo 1 hlásí víc
    // FAIL, než jich jmenuje, nejde říct která, a kolo 2 měří všechna (revize 1.4.0: fail 2 bez jmen dal kolu 2 prázdný seznam a řez
    // prošel bez přeměření). Bez runtime dopadu měří kolo 2 všechna kritéria vždy a skládat ho s kolem 1 by počty zdvojilo.
    const jmenovana = failKola1.filter(fk => !vyjmuta.includes(fk))
    const vse = !runtimeDopad || (Number(e1.fail) || 0) > failKola1.length
    if (vse && runtimeDopad) log(`E2E 1: fail ${e1.fail}, jmenovaných kritérií ${failKola1.length}; kolo 2 přeměří všechna`)
    if (!vse && !jmenovana.length) {
      log('E2E: kolo 2 se nekoná, všechna FAIL kritéria kola 1 čekají na rozhodnutí majitele (krok mimo Povolení)')
      e = normE2E({ ...e1, fail: 0, fail_kriteria: [], pass: Math.max(0, (Number(e1.pass) || 0)) })
    } else {
      const e2 = await e2e(2, { ...e2eOpts(), fail: vse ? null : jmenovana })
      if (e2eNic(e2, 2)) return fail('e2e', `${e2eNic(e2, 2)} v kole 2`)
      if (vadaNasazeni(e2)) return fail('e2e', `vada nasazení v kole 2: ${vadaNasazeni(e2).slice(0, 600)}`)
      // Plné přeměření, které nezměřilo nic, není pass: kolo 1 mělo kritéria, kolo 2 je vrátilo nula (neproběhlo není spadlo).
      if (vse && !(Number(e2.celkem) > 0) && Number(e1.celkem) > 0) return fail('e2e', `kolo 2 mělo přeměřit všechna kritéria (${e1.celkem}) a vrátilo celkem 0`)
      e = normE2E(vse ? { ...e2, ...zKola1(e1, e2), report_path: [e1.report_path, e2.report_path].filter(Boolean).join(' + ') } : slozE2E(e1, e2)); reports.push(e2.report_path)
      log(`E2E 2 (${vse ? 'všechna kritéria' : 'jen FAIL kola 1'}): ${e.vysledek} (${e.pass}/${e.celkem}, fail ${e.fail}${e.vadna_kriteria.length ? `, vadná kritéria ${e.vadna_kriteria.length}` : ''})`)
      if (e.vysledek === 'fail' && n === MAX_POKUSU && mimoRezVse(e)) e = uzavritMimoRez(e)
      if (e.vysledek === 'fail') return fail('e2e', `FAIL kritéria po opravě: ${(e.fail_kriteria || []).join(' | ') || `${e.fail} bez jmen`}`)
    }
  }
  if (e.vadna_kriteria.length) {
    log(`E2E: ${e.vadna_kriteria.length} vadných kritérií, bez opravy; řez se uzavře a jdou jako rozhodnutí pro majitele`)
    rozhodnuti.push(...e.vadna_kriteria.map(k => `[řez ${NN} vadné kritérium] ${k}`))
  }
  if (e.prostredi.length) {
    log(`E2E: ${e.prostredi.length} kritérií nejde změřit kvůli prostředí; bez opravy a bez dalšího pokusu, jdou majiteli jako otázka`)
    for (const x of e.prostredi) pridejProstredi({ typ: 'prostredi', kriterium: x.kriterium, ...(x.sekce ? { sekce: x.sekce } : {}), dukaz: x.dukaz, navrh: x.navrh })
  }
  for (const x of prostrediStav) if (!rozhodnuti.includes(x)) rozhodnuti.push(x)
  followUps.push(...(e.kosmeticke || []).map(k => `[řez ${NN} · E2E] [oprava] E2E kosmetika: ${k}`))
  // Závažné nálezy mimo kritéria: oprava bez commitu, brána nad ní a nasazení se samostatným commitem fix(security).
  if ((e.zavazne_mimo_ak || []).length) {
    log(`E2E: ${e.zavazne_mimo_ak.length} závažných nálezů mimo kritéria, oprava, brána a samostatný commit`)
    const fs = await fixSecurity(e); fixAgentu += fs ? 1 : 0
    sber(fs, { vynutit: true, zdroj: `E2E ${trimList(e.zavazne_mimo_ak).join('; ').slice(0, 300)}` })
    if (!fs) { log('fix-security nevrátil výsledek, nálezy jdou do follow-ups'); followUps.push(...e.zavazne_mimo_ak.map(z => `[řez ${NN} · bezpečnost] [oprava] E2E bezpečnost, neopraveno: ${z}`)) }
    else if (!(fs.opraveno > 0 || trimList(fs.zmenena_mista).length)) log('fix-security nic nezměnil, nálezy zůstávají ve follow-ups')
    else {
      let vs = await verify('sec')
      if (!zelena(vs)) {
        log(`brána po bezpečnostní opravě červená: ${branaDuvod(vs).slice(0, 200)}; jedna oprava`)
        const fb = vs ? await fixBrana(vs) : null; sber(fb, { zdroj: 'oprava brány' }); fixAgentu += fb ? 1 : 0
        vs = await verify('sec-2')
        if (!zelena(vs)) return fail('e2e', `bezpečnostní oprava neprošla bránou: ${branaDuvod(vs)}`)
      }
      const d3 = await nasad(3, 'bezpečnostní oprava')
      if (zastavit(d3)) return zastav(d3)
      if (!chybaNasazeni(d3, 3)) { d = d3; nasazeny = S(d3.commit).trim() }
      else { log(`deploy bezpečnostní opravy selhal (${chybaNasazeni(d3, 3).slice(0, 160)}), zůstává v pracovním stromě jako follow-up`); followUps.push(`[řez ${NN} · bezpečnost] [oprava] bezpečnostní oprava po E2E zůstala nenasazená v pracovním stromě: ${chybaNasazeni(d3, 3).slice(0, 300)}`) }
    }
  }

  // ---- uzavření ----
  vstup('Uzavření', 'uzavreni')
  // Řez s částmi skládá revizi pokusů, které padly až za review (revizeDrive), s tímto pokusem; malý řez reviduje každý pokus celý,
  // kromě dorovnání deploye, které review nepouští a bere revizi předchozích pokusů.
  const drive = sCastmi || dorovnani ? revizeDrive : []
  const soucet = (xs, f) => xs.reduce((s, x) => s + (Number(x[f]) || 0), 0)
  const thsVse = [...drive.flatMap(r => r.ths), ...ths]
  const thNalezuVse = soucet(thsVse, 'nalezu'), thBlokeruVse = soucet(thsVse, 'blokeru')
  const kolaVse = Math.max(kola, ...drive.map(r => r.kola))
  const nalezuVse = nalezu + soucet(drive, 'nalezu'), blokujicichVse = blokujicich + soucet(drive, 'blokujicich'), fixAgentuVse = fixAgentu + soucet(drive, 'fixAgentu')
  const e2eText = `${e.vysledek} ${e.pass}/${e.celkem}${e.castecne ? ` (částečně ${e.castecne})` : ''}${e.vadna_kriteria.length ? ` (vadná kritéria ${e.vadna_kriteria.length})` : ''}`
  const reviewText = `${kolaVse} kol, ${nalezuVse} nálezů, ${fixAgentuVse} fix agentů`
  const thermoOprava = !thsVse.length ? 'bez výsledku' : thNalezuVse === 0 ? 'nic' : (thermoFix || drive.some(r => r.thermoFix) ? 'samostatně' : 've vlně review')
  const thermoText = thsVse.length ? `${thNalezuVse} nálezů, ${thBlokeruVse} blokujících, oprava ${thermoOprava}` : 'bez výsledku'
  const odmitnuteSeznam = trimList([...drive.flatMap(r => r.odmitnute), ...odmitnute])
  // Seznamy neúspěšných pokusů a fází na stropu předávek jdou do uzavření s tímto pokusem (běh web-rijen: řez 2 ztratil 19 follow-upů,
  // řetěz K8 15). Pole se plní na místě: chybějící doklady z uzavření se připisují do odchylek a počty v návratu je musí vidět.
  const followVse = osudy([...driveSeznamy.follow, ...zeStropu.follow, ...followUps])
  const odchVse = trimList([...driveSeznamy.odch, ...zeStropu.odch, ...odchylky]); odchylky.splice(0, odchylky.length, ...odchVse)
  const pastiVse = trimList([...driveSeznamy.pasti, ...zeStropu.pasti, ...pasti])
  const reportsVse = trimList([...reports, ...drive.flatMap(r => r.ths.map(t => t.report_path))])
  // Dveře a dosah z posledního úspěšného nasazení (§ 2.9), položky prostředí a kritéria mimo řez do souboru výsledku i návratu.
  const { dvere, dosah } = dvereDosah()
  const mimoRez = rozhodnuti.filter(x => x && typeof x === 'object' && x.typ === 'mimo_rez')
  // Soubor výsledku (docs/.vysledek-stavba-NN.json) nese i rez, vysledek, pokusy, faze, dvere a dosah: závěrečná zpráva (zprava.py) z něj skládá tabulku řezů.
  const plne = { vysledek: 'hotovo', pokusy: n, faze: 'uzavreni', reports: reportsVse, odmitnute: odmitnuteSeznam, meridla, nasazeni: historie().nasazeni, kroky_po_nasazeni: krokyPo, dvere, dosah, prostredi: prostrediPolozky, mimo_rez: mimoRez, prenesene_sekce: preneseneSekce }
  const c = await close({ commit: d.commit, security: trimList(securityCommity), odchylky, pokusy: n, e2e: e2eText, review: reviewText, thermo: thermoText,
    thermo_paths: thsVse.filter(t => t.nalezu > 0).map(t => t.report_path).filter(Boolean), follow_ups: followVse, vadna: e.vadna_kriteria, prostredi: prostrediPolozky, mimoRez, prenesene: preneseneSekce,
    odmitnute: odmitnuteSeznam, jinak: trimList([...drive.flatMap(r => r.jinak), ...jinak]), meridla, kroky: krokyPo, predavky: predavekCelkem,
    vysledek: { rez: NN, ...plne } })
  // commit_overeny platí jen jako plný hash: zkrácený nebo text by šel do návratu jako commit řezu (revize 1.4.0).
  const coVraceny = S(c && c.commit_overeny).trim()
  const commitOvereny = /^[0-9a-f]{40}$/.test(coVraceny) ? coVraceny : ''
  if (coVraceny && !commitOvereny) log(`uzavření: commit_overeny „${coVraceny.slice(0, 60)}“ není 40znakový hash, platí commit z deploye ${d.commit}`)
  if (c) {
    if ((c.chybejici_doklady || []).length) { odchylky.push(...c.chybejici_doklady.map(x => `chybí doklad předepsaný PRD/vizí: ${x}`)); log(`uzavření: ${c.chybejici_doklady.length} chybějících dokladů`) }
    if (c.thermo_nesesouhlaseno > 0) log(`uzavření: ${c.thermo_nesesouhlaseno} thermo nálezů BLOCKER/HIGH bez sesouhlasení`)
    if (commitOvereny && commitOvereny !== S(d.commit).trim()) log(`uzavření: commit řezu je ${commitOvereny}, deploy hlásil ${d.commit}`)
    if ((c.chybejici_commity || []).length) log(`uzavření: bezpečnostní commity neexistují: ${c.chybejici_commity.join(', ')}`)
  }
  const chybejiciCommity = c ? trimList(c.chybejici_commity) : []
  const secCommity = trimList(securityCommity).filter(h => !chybejiciCommity.includes(h))
  // Výsledek pod 6 000 znaků (1.6.0): runtime notifikace useká výsledek na ~8 k a orchestrátor ho v běhu web-rijen 20× dočítal ze
  // souboru. Seznamy, které zapsalo uzavření do docs/.vysledek-stavba-NN.json, jdou jen počtem; bez souboru zůstávají celé.
  const vysledekSoubor = c && c.ok ? S(c.vysledek_soubor).trim() : ''
  const seznamyVysledku = vysledekSoubor
    ? { reports_pocet: plne.reports.length, odmitnute_pocet: plne.odmitnute.length, meridla_pocet: plne.meridla.length, nasazeni_pocet: plne.nasazeni.length, kroky_pocet: plne.kroky_po_nasazeni.length, journal: 'docs/journal.md', vysledek_soubor: vysledekSoubor }
    : plne
  return {
    vysledek: 'hotovo', pokusy: n, profil, commit: commitOvereny || d.commit, commit_zapisu: commitZapisu, deploy: d.stav, health: S(d.health).slice(0, 800), doklad_pred: dokladPred ? (dokladCesta || dokladPath) : null,
    dvere, dosah, oblasti: [...oblastiVse], prostredi: prostrediPolozky, prenesene_sekce: preneseneSekce,
    e2e: { vysledek: e.vysledek, celkem: e.celkem, pass: e.pass, castecne: e.castecne, fail: e.fail, castecna_kriteria: e.castecna_kriteria || [], vadna_kriteria: e.vadna_kriteria, prostredi: e.prostredi.map(x => x.kriterium) },
    review: { kola: kolaVse, nalezu: nalezuVse, blokujicich: blokujicichVse, fix_agentu: fixAgentuVse, security_commity: secCommity },
    thermo: thsVse.length ? { nalezu: thNalezuVse, blokeru: thBlokeruVse, oprava: thermoOprava, nesesouhlaseno: c ? (c.thermo_nesesouhlaseno || 0) : null } : null,
    rozhodnuti, ...seznamy(followVse, odchylky, pastiVse, Boolean(c && c.ok)), spory,
    uzavreni: c ? c.ok : false, chybejici_doklady: c ? (c.chybejici_doklady || []) : [], chybejici_commity: chybejiciCommity,
    security_commity: secCommity, ...(securityRadkem.length ? { security_radkem: [...securityRadkem] } : {}), kontext: c ? S(c.kontext).slice(0, 600) : '', commit_hlavni: historie().commit_hlavni, ...seznamyVysledku,
  }
}

// ---------- pokusy ----------
const stavCasti = () => casti.map(c => ({ id: c.id, hotovo: castiStav.get(c.id).hotovo, ...(castiStav.get(c.id).prostredi || zastavene.has(c.id) ? { prostredi: true } : {}) }))
let last = null, diag = null
// Pokusy vždy od 1: při obnově se pokusy před přerušeným vrátí z cache (stejné prompty), § 2.3.
for (let n = 1; n <= MAX_POKUSU; n++) {
  P = n
  // Diagnóza jen před třetím pokusem a jen po známém selhání: při max_pokusu 1 by `n === MAX_POKUSU` spustil diagnózu bez předchozího
  // selhání a obnova od třetího pokusu selhání přerušeného běhu nezná.
  if (n === 3 && last) { vstup('Diagnóza', ''); diag = await diagnose(last); log(diag ? `diagnóza: ${S(diag.pricina).slice(0, 160)}` : 'diagnóza bez výsledku') }
  const res = await pokus(n, last, diag)
  if (res.vysledek === 'hotovo') { log(`řez ${NN} hotový na pokus ${n}, commit ${res.commit}`); return doLimitu({ ok: true, rez: NN, ...res, casti: stavCasti(), predavky: predavekCelkem }) }
  if (res.vysledek === 'zastaveno') { log(`řez ${NN} zastaven v pokusu ${n}: ${res.faze === 'deploy-odklad' ? `nasazení odloženo${res.nejdriv ? ` do ${res.nejdriv}` : ''}` : 'infra selhání nasazení'} (${res.detail.slice(0, 160)}); pokus se nepočítá, blok čeká na obnovu od fáze deploy`); return doLimitu({ ok: true, rez: NN, ...res, casti: stavCasti(), predavky: predavekCelkem }) }
  log(`pokus ${n} selhal ve fázi ${res.faze}${res.krokSelhal && !res.dorovnani && n < MAX_POKUSU ? ' (krok po nasazení: další pokus jen dorovná deploy)' : ''}`)
  if (sCastmi && res.faze !== 'implementace') opravaZ = res
  // Revize malého řezu jde dál jen do dorovnání deploye (to review nepouští); celý pokus malého řezu reviduje znovu sám.
  if (sCastmi || res.krokSelhal) revizeDrive.push(res.revize)
  driveSeznamy.follow.push(...pole(res.follow_ups)); driveSeznamy.odch.push(...pole(res.odchylky)); driveSeznamy.pasti.push(...pole(res.pasti_opravene))
  last = res
}
// Selhaný blok nese seznamy všech pokusů a fází na stropu předávek, ne jen posledního pokusu. Zapíše je uzavření v režimu selhání
// (návrat pak nese počty); když neproběhlo, jdou do návratu a zapíše je orchestrátor.
const vseSel = { follow: osudy([...driveSeznamy.follow, ...zeStropu.follow]), odch: trimList([...driveSeznamy.odch, ...zeStropu.odch]), pasti: trimList([...driveSeznamy.pasti, ...zeStropu.pasti]) }
const odmitnuteSel = sCastmi ? trimList(revizeDrive.flatMap(r => r.odmitnute)) : (last.odmitnute || [])
const reportsSel = trimList(last.reports)
let cSel = null
if (vseSel.follow.length || vseSel.odch.length || vseSel.pasti.length) {
  vstup('Uzavření', 'uzavreni')
  cSel = await closeSelhani({ faze: last.faze, detail: last.detail, pokusy: MAX_POKUSU, diag: diag && diag.pricina, follow_ups: vseSel.follow, odchylky: vseSel.odch, pasti: vseSel.pasti, odmitnute: odmitnuteSel, prostredi: prostrediStav,
    vysledek: { rez: NN, vysledek: 'selhalo', pokusy: MAX_POKUSU, faze: last.faze, ...dvereDosah(), follow_ups: vseSel.follow, odchylky: vseSel.odch, pasti_opravene: vseSel.pasti, reports: reportsSel, odmitnute: odmitnuteSel, nasazeni: historie().nasazeni } })
  log(cSel && cSel.ok ? `uzavření selhání: seznamy zapsané (${vseSel.follow.length} follow-upů)` : 'uzavření selhání neprošlo: seznamy jdou v návratu, zapíše je orchestrátor')
}
const zapsanoSel = Boolean(cSel && cSel.ok)
const souborSel = zapsanoSel ? S(cSel.vysledek_soubor).trim() : ''
// Podstatná pole první (při useknutí se ztratí jen konec seznamů); hashe fix(security) z deployů všech pokusů jdou i do selhaného
// návratu: commity v repu existují, orchestrátor je nesmí ztratit.
return doLimitu({ ok: true, rez: NN, vysledek: 'selhalo', pokusy: MAX_POKUSU, faze: last.faze, detail: S(last.detail).slice(0, 1000),
  diagnoza: diag ? { pricina: S(diag.pricina).slice(0, 600), doporuceni: S(diag.doporuceni).slice(0, 400), repro: S(diag.repro_path) } : null,
  casti: stavCasti(), predavky: predavekCelkem, security_commity: trimList(securityCommity), ...(securityRadkem.length ? { security_radkem: [...securityRadkem] } : {}), commit_hlavni: historie().commit_hlavni,
  rozhodnuti: last.rozhodnuti || [], spory: last.spory, ...seznamy(vseSel.follow, vseSel.odch, vseSel.pasti, zapsanoSel),
  ...(souborSel ? { reports_pocet: reportsSel.length, odmitnute_pocet: odmitnuteSel.length, nasazeni_pocet: historie().nasazeni.length, journal: 'docs/journal.md', vysledek_soubor: souborSel }
    : { reports: reportsSel, odmitnute: odmitnuteSel, nasazeni: historie(true).nasazeni }) })
