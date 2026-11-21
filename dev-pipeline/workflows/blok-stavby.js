export const meta = {
  name: 'blok-stavby',
  description: 'dev-pipeline blok stavby řezu: refresh PRD, implementace (malý řez, nebo kontrakt, části a integrace), thermo, code-review s opravami, brána, doklad, deploy, E2E a uzavření; až tři pokusy s diagnózou před třetím; zastavení bez pokusu: infra, odklad, limit účtu, vadné kritérium.',
  whenToUse: 'Spouští orchestrátor /dev-pipeline:orchestrate po schválení PRD řezu s args {cwd, plugin_root, rez, args_file} (soubor docs/.stavba-NN.json) nebo s celými args; schéma args a návratu je v KONTRAKT.md pluginu. Bez args nic nedělá.',
  phases: [
    { title: 'Vstup', detail: 'jen s args_file: agent načte args ze souboru, blok ověří číslo řezu' },
    { title: 'Refresh PRD', detail: 'když od PRD zestárl strom nebo zbyly blokující nálezy delty: delta prd-check kritérií závislých na stromu (kostra i části), zapracování' },
    { title: 'Kontrakt', detail: 'jen řez s částmi a kontraktem: schéma, typy, signatury a registrace; těla částí hlásí „neimplementováno“' },
    { title: 'Implementace', detail: 'malý řez: TDD podle PRD; řez s částmi: oprava po selhání za implementací; stav vada-kriteria s důkazem zastaví blok před review bez spotřeby pokusu' },
    { title: 'Části', detail: 'části souběžně, každá startuje hned po svých závislostech a jen ve svých souborech; hotová část se v dalším pokusu neopakuje' },
    { title: 'Integrace', detail: 'typecheck celého repa, švy mezi částmi, požadavky mimo hranici, zbytky „neimplementováno“' },
    { title: 'Review', detail: 'thermo a code-review souběžně (u částí po částech plus integrační review), opravy po sloučených balíčcích (thermo nálezy v téže vlně; balíček nad 6 nálezů po dávkách ve vlnách bez společného souboru), nejvýš 2 kola, poslední várka zúžením; lehký profil bez thermo a s jedním kolem' },
    { title: 'Brána', detail: 'typecheck, plná suita jednou, kontroly pre-commitu a měřidla kritérií; zelená jen s exit kódem 0 a prošlými testy, jedna oprava; zelená zapíše marker docs/.verify-passed' },
    { title: 'Doklad', detail: 'jen když PRD předepisuje doklad před migrací: commit řezu bez nasazení a nad ním snímek dotčených dat před nasazením' },
    { title: 'Deploy', detail: 'commit řezu (bezpečnostní opravy samostatně; u řezu s dokladem už existuje), nasazení podle projektu, kroky po nasazení z PRD, zápis nasazení; migrace jen s dokladem; infra selhání a odklad nasazení blok zastaví, podmínka platná jen při zásahu odkládá jen s doloženým zásahem' },
    { title: 'E2E', detail: 'akceptační kritéria proti běžící aplikaci; skupiny sekcí podle doby (nejvýš 12 kritérií na verifikátor), oprava kódu přes jedno kolo review a bránu, kolo 2 jen nad FAIL; čitelnost jde do follow-ups, opraví ji vlna dluhu kolečka' },
    { title: 'Diagnóza', detail: 'před 3. pokusem: reprodukce a příčina; vadné kritérium s důkazem zastaví blok místo třetího pokusu' },
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
    ...Object.fromEntries(['runtime_dopad', 'doklad_pred', 'kontrakt_potreba', 'prd_lehke'].map(k => [k, t('boolean', 'true nebo false jako JSON boolean, ne řetězec')])),
    ...Object.fromEntries(['kriteria', 'max_pokusu'].map(k => [k, t('integer')])),
    kontrakt_odhad_radku: t(['integer', 'null']),
    hypotezy: t(['object', 'array', 'string', 'null'], 'celý objekt beze změny'),
    // Obnova do souboru nepatří (1.7.0): v běhu sonnet-5-5 vrátil načítací agent ve stavbách 01 a 03 „obnova: {}“, blok to vzal
    // jako obnovu s neznámou fází a skutečná obnova řezu 03 se pak nepotkala s cache (62 min, $58, ztracené seznamy).
    ...Object.fromEntries(['prd_stale', 'mazane_pozdeji', 'e2e_sekce', 'casti', 'casti_nad_stropem', 'oblasti', 'deploy_podminky'].map(k => [k, t('array', 'celé pole beze změny')])),
    rozhodnuti_majitele: { type: 'array', items: { type: 'string' }, description: 'celé pole beze změny' },
    rychle_kontroly: t('string'),
    _pole: { type: 'array', items: { type: 'string' }, description: 'seznam polí souboru (_pole) opsaný přesně' },
    _delky: { type: 'object', description: 'objekt _delky ze souboru opsaný přesně' },
  } }
  phase('Vstup')
  // Jeden načítací agent opíše soubor bloku (1.10.0, spec H1): stálá pole z docs/.run-args.json vkládá do souboru už args-bloku.py
  // a _pole jsou klíče sloučeného souboru. Agent, který slučoval dva soubory sám, v běhu zaklad-dat dvakrát vynechal mapa_vize.
  const rezNN = String(volani.rez).padStart(2, '0')
  // Limit účtu už na startu (review N5 kolečka a PRD): načítací agent bez výsledku dostane sondu jako run(), výjimka s textem limitu platí
  // hned. Bez odpovědi blok vrátí zastavení s fází agenti, jaké jde složit bez načtených args, ne obecné ok: false: orchestrátor ho
  // obnoví po resetu limitu s týmiž args. run() a LIMIT_UCTU jsou definované níž a tady by byly v TDZ, proto vlastní kopie.
  let agentiPriNacteni = ''
  const nacti = async doplnek => {
    let r = null
    for (let i = 0; i < 3 && !r && !agentiPriNacteni; i++) {
      try {
        r = await agent(`Řez ${rezNN}: načtení args bloku stavby. Přečti ${soubor} a vrať jeho pole přesně opsaná, pole _pole opiš přesně, nic nezkracuj ani nedoplňuj; jiný soubor nečti. Když soubor chybí nebo není platný JSON, vrať jen pole chyba s důvodem.${doplnek}`,
          { label: `args:řez ${rezNN}`, phase: 'Vstup', agentType: 'dev-pipeline:nacteni-args', schema: ARGS, model: 'sonnet', effort: 'low' })
      } catch (e) {
        const chyba = S(e && e.message || e)
        log(`args:řez ${rezNN}: spuštění selhalo (${chyba.slice(0, 120)})`)
        if (/usage limit|hit your .{0,40}limit|too far out to wait/i.test(chyba)) agentiPriNacteni = `args:řez ${rezNN}: ${chyba.slice(0, 300)}`
      }
    }
    if (!r && !agentiPriNacteni) {
      let sonda = null
      try { sonda = await agent('Sonda dostupnosti agentů: odpověz jedním slovem „ok“. Nic nečti, nespouštěj ani neměň.', { label: `sonda:args:řez ${rezNN}`, phase: 'Vstup', model: 'sonnet', effort: 'low' }) } catch (e) { log(`sonda:args:řez ${rezNN}: spuštění selhalo (${S(e && e.message || e).slice(0, 120)})`) }
      if (sonda) log(`args:řez ${rezNN}: sonda odpověděla, agenti běží; bez výsledku zůstalo jen načtení args`)
      else agentiPriNacteni = `args:řez ${rezNN}: tři volání bez výsledku a sonda bez odpovědi`
    }
    return r
  }
  const bezArgs = () => {
    if (!agentiPriNacteni) return { ok: false, duvod: `args_file: načítací agent nevrátil výsledek (${soubor})` }
    log(`řez ${rezNN} zastaven před pokusem 1: agenti neběží (${agentiPriNacteni.slice(0, 200)}); args se nenačetly, blok čeká na obnovu přes resumeFromRunId se stejnými args`)
    return { ok: true, rez: rezNN, vysledek: 'zastaveno', faze: 'agenti', infra: true, infra_trida: 'ucet', detail: `agenti neběží: ${agentiPriNacteni}`.slice(0, 600), pokusy: 0,
      ...(volani.obnova && typeof volani.obnova === 'object' ? { obnova: volani.obnova } : {}), casti: [], predavky: 0, security_commity: [], bez_review: [],
      follow_ups: [], odchylky: [], pasti_opravene: [], follow_ups_pocet: 0, odchylky_pocet: 0, pasti_pocet: 0, seznamy_zapsane: true, spory: [], reports: [], rozhodnuti: [], nasazeni: [], commit_hlavni: '' }
  }
  let nactene = await nacti('')
  if (!nactene) return bezArgs()
  if (S(nactene.chyba).trim()) { log(`blok-stavby: args_file ${soubor}: ${S(nactene.chyba).slice(0, 200)}`); return { ok: false, duvod: `args_file: ${S(nactene.chyba).trim().slice(0, 400)}` } }
  // Kontrola opisu (1.7.0): skript zapíše do souboru _pole (klíče sloučeného souboru bez prázdných hodnot) a blok porovná návrat
  // s ním. Celá třída vad opisu (obnova: {} ve stavbě, chybějící kontrakt_rez a vymyšlené rezim: "config" v PRD) prošla v běhu
  // sonnet-5-5 bez povšimnutí. Chybí = pole ze _pole, které schéma bloku zná a návrat nemá (nebo má prázdné). Stálé pole mimo _pole
  // (soubor doplněný po složení, rozhodnutí majitele, změna pokynů k prostředí) navíc není. Navíc se proto nepočítají (revize 1.7.0: rozhodnutí zapsané po složení
  // souboru by blok zastavilo, nebo by ho druhé načtení „podle _pole“ vypustilo). Pole volání mají přednost, jejich opis se
  // nekontroluje. Navíc vrácené pole s prázdnou hodnotou se zahodí: soubor ho nemá a blok chybějící pole bere jako prázdné.
  // Stejná sémantika platí ve všech třech blocích. Obsah opisu (1.11.0, spec E2): skript zapíše i _delky (délka kompaktního JSON každého
  // pole v UTF-16 jednotkách) a blok ji porovná s JSON.stringify; v běhu brief-a-provedeni vrátil opis stavby 14a místo rozhodnutí
  // o PV1 „PLACEHOLDER“ a kontrola klíčů to nepoznala. Soubor bez _delky se nekontroluje. Číslo nebo pravdivostní hodnota opsaná
  // jako řetězec rozdílem není, normalizuje je blok níž.
  const VOLANI_POLE = ['cwd', 'plugin_root', 'rez', 'args_file']
  const STALA_POLE = ['app_pristup', 'runbook', 'deploy_mode', 'deploy_okno', 'ne_cile', 'mapa_vize', 'vize', 'produkt', 'rozhodnuti_majitele', 'rychle_kontroly']
  const prazdne = v => v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)
  const poleVolani = k => VOLANI_POLE.includes(k) || k in volani
  const seznamZ = r => Array.isArray(r._pole) ? r._pole.map(x => S(x).trim()).filter(Boolean) : null
  const delkyZ = r => r._delky && typeof r._delky === 'object' && !Array.isArray(r._delky) ? r._delky : null
  const delkaSedi = (v, n) => JSON.stringify(v).length === Number(n) || (typeof v === 'string' && /^(true|false|-?\d+(\.\d+)?)$/.test(v.trim()) && v.trim().length === Number(n))
  const SLUZEBNI = ['_pole', '_delky', 'chyba']
  const opis = (r, seznam, delky) => {
    for (const k of Object.keys(r)) if (!SLUZEBNI.includes(k) && !seznam.includes(k) && prazdne(r[k])) delete r[k]
    const chybi = seznam.filter(k => k in ARGS.properties && !poleVolani(k) && (!(k in r) || prazdne(r[k])))
    const navic = Object.keys(r).filter(k => !SLUZEBNI.includes(k) && !poleVolani(k) && !STALA_POLE.includes(k) && !seznam.includes(k))
    const jinak = Object.keys(delky || {}).filter(k => k in ARGS.properties && !poleVolani(k) && k in r && !prazdne(r[k]) && !delkaSedi(r[k], delky[k]))
    return { chybi, navic, jinak }
  }
  const nesedi = d => d.chybi.length || d.navic.length || d.jinak.length
  const textRozdilu = d => `chybí: ${d.chybi.join(', ') || 'nic'}; navíc: ${d.navic.join(', ') || 'nic'}${d.jinak.length ? `; jiný obsah: ${d.jinak.join(', ')}` : ''}`
  // Druhé načtení se porovná se _pole z prvního: návrat bez _pole by jinak rozdíl tiše propustil (code-review 1.7.0, N1:
  // s chybějícími hypotézami blok doběhl jako hotovo).
  const seznam = seznamZ(nactene)
  if (!seznam) log(`blok-stavby: args_file ${soubor} bez _pole (starší skript), opis se nekontroluje`)
  else {
    const delky = delkyZ(nactene)
    let rozdil = opis(nactene, seznam, delky)
    if (nesedi(rozdil)) {
      log(`blok-stavby: opis args nesedí se _pole (${textRozdilu(rozdil)}), načítám znovu`)
      nactene = await nacti(` Opis nesedí se seznamem _pole souboru; minule chybělo: ${rozdil.chybi.join(', ') || 'nic'}, navíc bylo: ${rozdil.navic.join(', ') || 'nic'}${rozdil.jinak.length ? `, jiný obsah než v souboru měla pole: ${rozdil.jinak.join(', ')}` : ''}. Vrať všechna pole souboru s neprázdnou hodnotou přesně opsaná; pole, které soubor nemá, nevymýšlej.`)
      if (!nactene) return bezArgs()
      if (S(nactene.chyba).trim()) return { ok: false, duvod: `args_file: ${S(nactene.chyba).trim().slice(0, 400)}` }
      rozdil = opis(nactene, seznam, delkyZ(nactene) || delky)
      if (nesedi(rozdil)) {
        log(`blok-stavby: args_file ${soubor}: opis nesedí ani napodruhé (${textRozdilu(rozdil)}) – nic se nespustilo`)
        return { ok: false, duvod: `args_file: opis nesedí (${textRozdilu(rozdil)})` }
      }
    }
  }
  delete nactene._pole
  delete nactene._delky
  delete nactene.obnova
  const rezNorm = x => S(x).trim().padStart(2, '0')
  if (rezNorm(nactene.rez) !== rezNorm(volani.rez)) {
    log(`blok-stavby: args_file ${soubor} patří řezu ${S(nactene.rez) || '?'}, volání je pro řez ${S(volani.rez)} – nic se nespustilo`)
    return { ok: false, duvod: `args_file patří řezu ${S(nactene.rez) || '?'}` }
  }
  delete nactene.chyba
  // Normalizace pro případ, že agent typ přesto opíše jako řetězec.
  for (const k of ['runtime_dopad', 'doklad_pred', 'kontrakt_potreba', 'prd_lehke']) if (typeof nactene[k] === 'string') nactene[k] = nactene[k].trim().toLowerCase() === 'true'
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
// Pokyny majitele k prostředí: celé znění bez useknutí (nasazovací pokyny patří do runbooku projektu, args nesou jen odkaz a tajemství
// prostředí; args-bloku.py délku hlídá). Při obnově je od fáze od_faze přepíše obnova.app_pristup (aktivujObnovu), prompty dřívějších
// fází zůstanou shodné s původním během.
let appPristup = a.app_pristup ? S(a.app_pristup) : null
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
// Po celých položkách se stropem 8 000 znaků (1.11.0, spec E1): řez na 2 000 uprostřed věty vzal v běhu brief-a-provedeni stavbám 22 až 24
// rozhodnutí, kvůli kterým ty řezy vznikly. Vypadnou nejstarší, nejnovější položka zůstává vždy.
const ROZHODNUTI_STROP = 8000
const normRozhodnuti = v => {
  const xs = (Array.isArray(v) ? v : (v ? [v] : [])).map(x => S(x).trim()).filter(Boolean)
  const vybrane = []
  let delka = 0
  for (let i = xs.length - 1; i >= 0; i--) {
    const d = xs[i].length + (vybrane.length ? 3 : 0)
    if (vybrane.length && delka + d > ROZHODNUTI_STROP) break
    vybrane.unshift(xs[i]); delka += d
  }
  const pryc = xs.length - vybrane.length
  if (!pryc) return vybrane.join(' | ')
  log(`rozhodnutí majitele nad strop ${ROZHODNUTI_STROP} znaků: vypadlo ${pryc} nejstarších položek z ${xs.length}, celý seznam je v docs/.run-args.json`)
  return `${vybrane.join(' | ')} … a ${pryc} starších položek: docs/.run-args.json`
}
let rozhodnutiMajitele = normRozhodnuti(a.rozhodnuti_majitele)
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
// Provozní podmínky nasazení z args (1.11.0, spec I2): jdou přímo do zadání deploye, hypotézy tam nedojdou (běh brief-a-provedeni: řezy 09
// a 10 se nasadily během ostrého běhu, ačkoli orchestrátor podmínku napsal). Nepovinné plati (1.12.0, spec E): „vzdy“ (výchozí) je stav
// prostředí, který musí platit před každým nasazením; „pri-zasahu“ je omezení toho, co nasazení smí udělat, a odkládá jen s doloženým
// zásahem (deploy řezu, který do zmrazených tabulek nic nepsal, se odložil o den jen proto, že doměření ještě neproběhlo).
const deployPodminky = pole(a.deploy_podminky).filter(x => x && typeof x === 'object' && S(x.popis).trim()).map(x => ({ popis: S(x.popis).trim().slice(0, 300), kontrola: S(x.kontrola).trim().slice(0, 300), pravidlo: S(x.pravidlo).trim().slice(0, 300), plati: S(x.plati).trim() === 'pri-zasahu' ? 'pri-zasahu' : 'vzdy' }))
// Mini-řez z finální fáze (prd_lehke): blok PRD právě napsal PRD nad týmž stromem, refresh jen kvůli zapracovaným nálezům se nekoná (spec H7).
const prdLehke = a.prd_lehke === true
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
// Části, které kontrola PRD odhadla nad stropem: jen do logu při startu (strop předávek je pro všechny fáze stejný).
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
// Tituly podfází implementace (Kontrakt, Části, Integrace, Diagnóza) jsou implementace, faze deploy-infra ze zastavení je deploy,
// faze vada-kriteria ze zastavení je implementace. Zastavení s fází agenti se obnovuje přes resumeFromRunId s týmiž args, i s obnova (návrat ji nese).
const bezDiakritiky = v => S(v).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
const TITULY_OBNOVY = { 'refresh prd': 'refresh', kontrakt: 'implementace', casti: 'implementace', integrace: 'implementace', diagnoza: 'implementace', 'deploy-infra': 'deploy', 'deploy-odklad': 'deploy', 'deploy-vypadek': 'deploy', 'vada-kriteria': 'implementace' }
// Obnova platí jen s neprázdným od_faze (1.7.0): prázdný objekt obnovy z načítacího agenta pustil v běhu sonnet-5-5 větu obnovy
// do všech zadání staveb 01 a 03 a skutečná obnova řezu 03 pak minula cache a přehrála 40 agentů. Ze souboru obnova nepřichází
// (args_file ji maže), jen z volání orchestrátora.
const obnovaIn = a.obnova && typeof a.obnova === 'object' ? a.obnova : null
if (obnovaIn && !S(obnovaIn.od_faze).trim()) log('obnova bez od_faze ignorována: blok běží jako nový, bez značky obnovy')
const obnova = obnovaIn && S(obnovaIn.od_faze).trim() ? obnovaIn : null
const obnovaFaze = obnova ? FAZE_OBNOVY.indexOf((f => TITULY_OBNOVY[f] || f)(bezDiakritiky(obnova.od_faze))) : -1
const DEPLOY_I = FAZE_OBNOVY.indexOf('deploy')
const obnovaBezCache = Boolean(obnova && obnova.bez_cache === true)
// Neznámá fáze přeměří všechno od refresh: běh bez značky vrátí z cache i červenou bránu (třída B1), přeměření stojí jen čas.
const obnovaOdPuvodni = obnova ? Math.max(0, obnovaFaze) : -1
// Obnova řezu s částmi od deploye, E2E nebo uzavření jde podle stavu (1.10.0), ne podle cache: cache vrací jen nezměněný prefix volání
// a nástupci částí po předávce se při přehrání volají v jiném pořadí (běh zaklad-dat, řez 13: 37 agentů znovu). obnova-stav běží jako
// první volání obnovy; zelená brána nad dnešním pracovním stromem (marker brány = hash stromu i s necommitnutými změnami) přeskočí
// refresh, implementaci, review, bránu i doklad. Od deploye jde obnova na deploy; od E2E a uzavření rovnou na svou fázi, když HEAD je
// doloženě nasazený commit řezu a strom je čistý, jinak na deploy. Bez dokladu běží přerušený pokus celý a živě. Malý řez a dřívější
// od_faze jedou přes cache s líným obnova-stav.
const obnovaPodleStavu = Boolean(obnova && !obnovaBezCache && sCastmi && obnovaOdPuvodni >= DEPLOY_I)
const obnovaHned = obnovaBezCache || obnovaPodleStavu
// Hranice obnovy (značka v promptech) je u obnovy podle stavu deploy; skok rovnou na E2E nebo uzavření ji posune na svou fázi.
let obnovaOd = obnovaPodleStavu ? DEPLOY_I : obnovaOdPuvodni
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
// Číslo pokusu v návratu, v logu a v souboru výsledku hotového nebo selhaného řezu (1.12.0, spec R1): obnova bez bez_cache přehrává pokusy
// před přerušeným od prvního. Když je cache nevrátí (PRD zapracované mezi pádem a obnovou mění zadání), doběhne živě už přehrávaný pokus
// a blok po obnově s pokus 3 hlásil „hotový na pokus 1“ a pokusy 1. Skutečný pokus není nižší než přerušený, který orchestrátor poslal.
// Zastavení vrací dál číslo pokusu smyčky: tím číslem orchestrátor blok obnovuje a od něj platí značka obnovy.
const cisloPokusu = n => obnova ? Math.max(n, obnovaPokus) : n
// Cache Workflow vrací při resumeFromRunId jen nejdelší nezměněný prefix volání agent(): blok proto před fází od_faze nic nového
// nevolá (obnova-stav běží líně až na její hranici, aktivujObnovu) a nic nepřeskakuje sám. obnova.bez_cache: true pošle orchestrátor,
// když cache sedět nemůže (plugin aktualizovaný mezi pádem a obnovou, změněný args_file): blok pak začne rovnou přerušeným pokusem,
// obnova-stav zjistí hned a nad doloženým nasazením implementaci, review a bránu přeskočí. Nové pokyny k prostředí a rozhodnutí
// majitele nese obnova.app_pristup a obnova.rozhodnuti_majitele: platí od fáze od_faze dál, args ani jejich soubor se nemění.
const APP_PRISTUP_STROP = 'obnova.app_pristup nad 1 500 znaků: nasazovací pokyny patří do runbooku projektu, args nesou jen odkaz a tajemství prostředí'
const obnovaAppPristup = obnova && S(obnova.app_pristup).trim() ? S(obnova.app_pristup) : null
// Stejný strop jako args-bloku.py pro app_pristup (obnova přichází jen ve volání, skript ji nevidí).
if (obnovaAppPristup && obnovaAppPristup.length > 1500) { log(`obnova: ${APP_PRISTUP_STROP} (${obnovaAppPristup.length} znaků) – nic se nespustilo`); return { ok: false, duvod: APP_PRISTUP_STROP } }
// Rozhodnutí z obnovy se k seznamu přidávají, nenahrazují ho (1.11.0, spec G2). Provozní pokyn orchestrátora je vlastní pole: netiskne se
// jako rozhodnutí majitele (běh brief-a-provedeni: výběr kritérií pro obnovu šel pod nadpisem závazných rozhodnutí).
const obnovaRozhodnutiNova = obnova ? pole(obnova.rozhodnuti_majitele).map(x => S(x).trim()).filter(Boolean) : []
const obnovaRozhodnuti = obnovaRozhodnutiNova.length ? normRozhodnuti([...pole(a.rozhodnuti_majitele), ...obnovaRozhodnutiNova]) : ''
const obnovaPokyn = obnova ? S(obnova.pokyn_orchestratora).trim().slice(0, 1500) : ''
let pokynOrchestratora = ''
if (obnova && pole(obnova.jen_kriteria).length) log('obnova.jen_kriteria platí jen v kolečku; stavba přeměří E2E podle od_faze')
if (obnovaPodleStavu) log(`obnova od ${S(obnova.od_faze).trim()} podle stavu (řez s částmi): obnova-stav běží hned na začátku pokusu ${obnovaPokus}; ${obnovaOdPuvodni > DEPLOY_I ? 'nasazený HEAD s čistým stromem nebo zelená brána' : 'zelená brána'} nad dnešním pracovním stromem přeskočí refresh, implementaci, review, bránu i doklad, jinak pokus běží celý a živě${obnovaPokus > 1 ? ` (pokusy 1–${obnovaPokus - 1} se nepřehrávají)` : ''}`)
if (obnova && !obnovaHned) log(`obnova: fáze před ${FAZE_OBNOVY[obnovaOd]} (pokusy 1–${obnovaPokus}) se mají vrátit z cache Workflow; ${FAZE_OBNOVY.indexOf('deploy') >= obnovaOd ? `obnova-stav běží až před fází ${FAZE_OBNOVY[obnovaOd]} pokusu ${obnovaPokus}` : 'obnova-stav se nevolá (nasazení se nepřeměřuje)'}`)
if (obnova && obnovaBezCache) log(`obnova bez cache (bez_cache): blok začíná pokusem ${obnovaPokus}${obnovaPokus > 1 ? `, pokusy 1–${obnovaPokus - 1} se nepřehrávají (jejich výsledek nese pracovní strom a zápisy v docs/)` : ''}; obnova-stav běží hned a nad doloženým nasazením se implementace, review a brána nepouští`)
if (obnovaAppPristup || obnovaRozhodnuti) log(`obnova: nové ${[obnovaAppPristup ? 'pokyny k prostředí' : '', obnovaRozhodnuti ? 'rozhodnutí majitele' : ''].filter(Boolean).join(' a ')} platí od fáze ${FAZE_OBNOVY[obnovaOd]}`)
// Číslo pokusu je v názvu reportu: pokus 2 nepřepisuje reporty pokusu 1.
let P = 1
// Štítek pokusu (1.10.0): deploy, verify a E2E nesou od pokusu 2 za řezem :p<n> (dva deploye řezu 18 se dřív jmenovaly stejně „deploy:řez 18:1“).
const pz = () => P > 1 ? `:p${P}` : ''
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
// Vadná kritéria z implementace (1.12.0, spec G1 a G2): agent vrátil stav vada-kriteria s důkazem. Kód je odevzdaný (část, integrace i malý
// řez se počítají jako hotové), blok se po fázi zastaví před integrací, review a bránou a kritérium jde orchestrátorovi jako rozhodnutí.
// Bez důkazu je stav selhalo, stejně jako prostredi bez důkazu.
const vadyKriterii = []
const vadaKriteriaZ = (r, co) => {
  const v = r && r.vada_kriteria && typeof r.vada_kriteria === 'object' ? r.vada_kriteria : {}
  if (!S(v.dukaz).trim()) { log(`${co}: stav vada-kriteria bez důkazu, blok ho bere jako selhalo`); return false }
  const kriterium = S(v.kriterium).trim().slice(0, 200) || `kritérium neuvedeno (${co})`
  if (!vadyKriterii.some(x => klicKrit(x.kriterium) === klicKrit(kriterium))) vadyKriterii.push({ kde: co, kriterium, dukaz: S(v.dukaz).trim().slice(0, 600), navrh: S(v.navrh).trim().slice(0, 300) })
  log(`${co}: vadné kritérium ${kriterium.slice(0, 80)} (${S(v.dukaz).trim().slice(0, 120)}); kód je odevzdaný, blok se po fázi zastaví a pokus se nepočítá`)
  return true
}
const bezDukazuVady = r => ({ ...r, stav: 'selhalo', souhrn: `vadné kritérium bez důkazu: ${S(r.souhrn).slice(0, 500)}` })
// Tvar položky rozhodnutí je stejný jako u vadných kritérií z E2E: řetězec s prefixem řezu.
const vadaText = v => `[řez ${NN} vadné kritérium] ${v.kriterium}: ${v.dukaz}; návrh: ${v.navrh || 'neuveden'}`.slice(0, 1200)
// Vadné kritérium z diagnózy platí jen s důkazem (spec G3); do návratu jde s diagnózou.
const vadaDiagnozy = d => d && d.vada_kriteria && typeof d.vada_kriteria === 'object' && S(d.vada_kriteria.dukaz).trim() ? d.vada_kriteria : null
const diagNavrat = d => !d ? null : { pricina: S(d.pricina).slice(0, 600), doporuceni: S(d.doporuceni).slice(0, 400), repro: S(d.repro_path),
  ...(vadaDiagnozy(d) ? { vada_kriteria: Object.fromEntries(['kriterium', 'druh', 'dukaz', 'navrh'].map(k => [k, S(d.vada_kriteria[k]).trim().slice(0, 400)]).filter(([, v]) => v)) } : {}) }
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
// Commit řezu, nad kterým doklad vznikl (spec J1). Pozdější běh deploye (další pokus, oprava po E2E) ho dostane se zadáním: doklad zachycuje
// stav před prvním zápisem a platí dál, i když řez mezitím dostal další commit.
let dokladCommit = ''
const pridejSec = o => { if (o.popis && !securityOpravy.some(x => x.popis === o.popis)) securityOpravy.push(o) }
// Commity, jejichž kód review neprošlo (1.10.0, od 1.11.0 jen když review nevrátilo výsledek): oprava po E2E a fix(security) po E2E (oprava brány a thermo leží
// v commitu řezu, který review prošel). Zapisují se hned po commitu, i když nasazení potom zastaví, a jdou do všech návratů; obnova je
// převezme ze souboru zastaveného běhu přes obnova-stav. args-bloku.py je sebere z návratů staveb a kolečko je dá svému code-review.
const bezReview = []
const pridejBezReview = (commit, popis) => { const c = S(commit).trim(); if (c && !bezReview.some(x => x.commit === c && x.popis === popis)) bezReview.push({ commit: c, popis: S(popis).slice(0, 200) }) }
// Soubory, které blok změnil (implementace a opravy všech pokusů): hranice opravy brány a seznam pro commit v pokusu 2+ (běh
// web-rijen: deploy pokusu 2 řezu 2 opravy necommitnul, „nevím, čí jsou“, a mini-řez 12 opravil bránu změnou sdílené konfigurace).
const zmenyBloku = new Set()
// Testy nad 70 % limitu už zapsané do follow-ups: za blok každý jednou (spec I6).
const pomaleVidene = new Set()
const oblastiVse = new Set()
// Follow-upy, odchylky a pasti neúspěšných pokusů se drží za celý blok a jdou do uzavření (běh web-rijen: řez 2 jich ztratil 19).
const driveSeznamy = { follow: [], odch: [], pasti: [] }
// Poslední zelená brána bloku: dorovnání deploye malého řezu bránu znovu nepouští a E2E dostane její měřidla.
let posledniBrana = null
// Zelené výsledky skupin E2E z dřívějších pokusů (index skupiny → výsledek): další pokus po opravě je přenese u skupin, jejichž
// sekce se opravy netýkají (§ 2.12).
const e2eZelene = new Map()
// Pasti ověřování (1.12.0, spec K4): FAIL kritéria a kritéria zastavená prostředím z E2E za celý blok, i z pokusu, který na E2E selhal.
// Uzavření z nich dopíše do stránky pastí projektu příčinu, kterou by příští ověřovatel nebo autor PRD objevoval znovu, a stránku založí,
// když ještě není. Zadání uzavření stránku jmenuje: agent uzavření mění jen dokumenty, které zadání jmenuje.
const e2eSelhani = { kriteria: [], reporty: [] }
const zapisSelhaniE2E = (texty, report) => {
  for (const t of trimList(texty).map(x => x.slice(0, 300))) if (!e2eSelhani.kriteria.includes(t) && e2eSelhani.kriteria.length < 20) e2eSelhani.kriteria.push(t)
  for (const r of S(report).split(' + ').map(x => x.trim()).filter(Boolean)) if (!e2eSelhani.reporty.includes(r) && e2eSelhani.reporty.length < 12) e2eSelhani.reporty.push(r)
}
// Osud položky follow-ups (§ 2.6): rozhodnutí (jmenuje majitele, Povolení, rozhodnutí), oprava (cesta k souboru nebo konkrétní místo),
// jinak nápad; položka, která osud už nese, se nemění. Oblast a u rozhodnutí začátek textu „rozhodne majitel:“ nebo „rozhodne
// orchestrátor:“ (TVAR-DOKUMENTU, Follow-ups) doplní uzavření.
const OSUDY = /^\[(rozhodnutí|oprava|nápad|obsah)\]/
const OSUD_ROZHODNUTI = /majitel|Povolení|rozhodnut|rozhodne orchestrátor/i
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
// Limit účtu není selhání řezu (1.12.0, spec F1): při vyčerpaném limitu vrací agent() null bez textu chyby a blok to četl jako funkční
// selhání (stavba spálila tři pokusy a diagnózu za tři minuty). Po třetím volání bez výsledku proto běží sonda: jedno levné volání
// na modelu selhaného volání. Bez odpovědi platí příznak agentiDole a žádné další run() už nic nespouští; blok vrátí zastavení
// s fází agenti a pokus se nepočítá. Sonda běží vždy na stejném místě (za třetím voláním téhož labelu) a nikdy po úspěšném volání,
// takže obnova přes cache ji potká ve stejném pořadí. Výjimka s textem limitu nastaví příznak rovnou, bez opakování.
const LIMIT_UCTU = /usage limit|hit your .{0,40}limit|too far out to wait/i
let agentiDole = ''
async function run(prompt, opts) {
  const label = opts.label || 'agent'
  if (agentiDole) return null
  for (let i = 0; i <= 2; i++) {
    let r = null
    // Restart od nuly nezná stav předchůdce (třída C2: restartovaný agent řezu 16 CK-Go2 našel nevrácenou mutaci jen náhodou).
    const p = i >= 1 ? `${prompt}\n\nPředchozí běh tohoto zadání skončil bez výsledku a pracovní strom může nést jeho rozdělanou práci: začni inventurou (git status, git diff --stat) a navaž na ni, nezačínej od nuly.` : prompt
    try { r = await agent(p, opts) } catch (e) {
      const chyba = String(e && e.message || e)
      log(`${label}: spuštění selhalo (${chyba.slice(0, 120)})`)
      if (LIMIT_UCTU.test(chyba)) { agentiDole = `${label}: ${chyba.slice(0, 300)}`; log(`${label}: limit účtu, agenti neběží; blok nic dalšího nespouští`); return null }
    }
    if (r) return r
    if (agentiDole) return null
    if (i < 2) { log(`${label}: agent nevrátil výsledek, opakuji (${i + 1}/2)`); await cekej(15000 * (i + 1)) }
  }
  let sonda = null
  try { sonda = await agent('Sonda dostupnosti agentů: odpověz jedním slovem „ok“. Nic nečti, nespouštěj ani neměň.', { label: `sonda:${label}`, phase: opts.phase, model: opts.model, effort: 'low' }) } catch (e) { log(`sonda:${label}: spuštění selhalo (${String(e && e.message || e).slice(0, 120)})`) }
  if (sonda) log(`${label}: sonda odpověděla, agenti běží; bez výsledku zůstalo jen toto zadání`)
  else if (!agentiDole) { agentiDole = `${label}: tři volání bez výsledku a sonda bez odpovědi`; log(`${label}: sonda bez odpovědi, agenti neběží (limit účtu?); blok nic dalšího nespouští`) }
  return null
}
// Štafeta: agent, který práci předal (zpráva PŘEDÁVKA z hooku hlídače kontextu), dostane nástupce se stejným zadáním
// a předávkou. Nástupce vrací návrat za celé zadání včetně práce předchůdce. Nejvýš 8 předávek, devátá je selhání fáze: strop je
// pojistka proti kroužení, ne měřidlo velikosti (nástupce stojí ~$1, spálený pokus hodiny); velikost částí hlídá blok PRD.
// Předávka platí jen jako cesta, kterou jmenuje hook (docs/reviews/predavka-<agent_id>.md), a jen nová: v revizi 1.4.0 vyplnil
// agent pole textem „žádná“ a nástupce zopakoval cestu předchůdce; obojí blok bral jako další předávku a po třetí fázi zahodil.
// Relativní cesta platí taky a doplní se na absolutní (1.6.0): v běhu web-rijen vrátily části řezu 10 cestu bez úvodního lomítka
// a blok jejich návrat bral jako konečný.
const MAX_PREDAVEK = 8
const PREDAVKA_CESTA = /(^|\/)docs\/reviews\/predavka-[^/\s]+\.md$/
const predavkaCesta = p => { const t = S(p).trim(); return !PREDAVKA_CESTA.test(t) ? '' : t.startsWith('/') ? t : `${cwd}/${t.replace(/^\.\//, '')}` }
let predavekCelkem = 0
// Labely, jejichž fáze skončila na stropu předávek (se stropem té fáze): důvod selhání je strop, ne „agent nevrátil výsledek“ (to je
// jiná vada). Mezivýsledky řetězu (navratNaStropu) nese Kontrakt na stropu: jeho zbývající soubory dokončí dva agenti souběžně.
const vycerpane = new Map()
const navratNaStropu = new Map()
const nic = (label, kdo) => vycerpane.has(label) ? `${kdo}: strop předávek vyčerpán (${vycerpane.get(label)} předávky, ${label})` : `${kdo} nevrátil výsledek`
// Fáze na stropu předávek: poslední předávka pro další pokus (klíč = label bez čísla pokusu) a seznamy předchůdců, které by se
// jinak ztratily s fází (běh web-rijen: K8 řezu 10 postupovala, pokus 2 začal od nuly a 15 follow-upů řetězu se ztratilo).
const posledniPredavka = new Map()
const klicFaze = label => S(label).replace(/:\d+(:[ab])?$/, '')
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
    // predavky jsou nástupci spuštění tímto voláním, po obnově od obnovené fáze (KONTRAKT, review N4): nástupce fáze před hranicí obnovy
    // vrací cache přerušeného běhu a orchestrátor ho započetl už z jeho návratu. Obnova bez cache a podle stavu běží celá živě.
    if (!obnova || obnovaHned || obnovaAktivni) predavekCelkem++
    if (n > maxPredavek) {
      vycerpane.set(label, maxPredavek)
      navratNaStropu.set(label, [...mezi])
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
// Fáze toku, ve které se právě spouští (pro značku obnovy); await vstup() ji nastaví spolu s fází zobrazení.
let fazeObn = ''
// Hranice obnovy: první fáze ≥ od_faze v pokusu ≥ obnova.pokus. Tady se přepnou pokyny k prostředí a rozhodnutí majitele z obnovy
// (prompty fází před hranicí zůstávají shodné s původním během) a bez bez_cache tu líně proběhne obnova-stav (v pořadí volání až
// za fázemi, které se vrací z cache). Jednou za blok.
let obnovaAktivni = false
async function aktivujObnovu() {
  if (obnovaAktivni) return
  obnovaAktivni = true
  if (obnovaAppPristup || obnovaRozhodnuti || obnovaPokyn) {
    if (obnovaAppPristup) appPristup = obnovaAppPristup
    if (obnovaRozhodnuti) rozhodnutiMajitele = obnovaRozhodnuti
    if (obnovaPokyn) pokynOrchestratora = obnovaPokyn
    ramec = ramecZ()
    log(`obnova: od fáze ${fazeObn} platí ${[obnovaAppPristup ? 'pokyny k prostředí' : '', obnovaRozhodnuti ? 'rozhodnutí majitele' : '', obnovaPokyn ? 'pokyn orchestrátora' : ''].filter(Boolean).join(' a ')} z obnovy`)
  }
  // Výstup obnova-stav čte jen deploy (provedené kroky): při od_faze za deployem se nevolá.
  if (!obnovaBezCache && FAZE_OBNOVY.indexOf('deploy') >= obnovaOd) await zjistiObnovaStav()
}
const vstup = async (titul, faze) => {
  phase(titul); fazeObn = faze
  if (obnova && !obnovaAktivni && P >= obnovaPokus && FAZE_OBNOVY.indexOf(faze) >= obnovaOd) await aktivujObnovu()
}
// Všechna volání agentů jdou přes spust(): předávka a značka obnovy na konci zadání. Deploy po obnově může najít commit řezu
// a fix(security) z přerušeného běhu (infra pád po commitu): bez věty by je commitnul podruhé (revize 1.4.0).
const OBNOVA_COMMITU = ' Commit řezu nebo fix(security) z přerušeného běhu může už existovat (git log --grep): nový nedělej, vrať jejich hashe; změny pracovního stromu, které v nich nejsou, commitni dalším commitem.'
// Odklad nasazení (1.7.0, shodně s deploy.md): stav odlozeno s časem nejdriv místo infra selhání nebo čekání přes noc.
// Práh odkladu ~60 minut (1.12.0, spec Q1; dřív ~30): nasazení opravy po E2E, které padlo do 35minutového nočního okna, blok odložil a obnova
// pak znovu přehrála E2E (46 a 178 min). Kratší okno nebo podmínku přečká agent deploye smyčkou.
const ODKLAD = 'Zakázané okno a podmínky runbooku přečti jako první, před commitem. Když podle nich nasazení nesmí proběhnout dřív než za ~60 minut (včetně rezervy okna), nic necommituj ani nenasazuj a vrať stav odlozeno s nejdriv (ISO 8601 s časovou zónou) a duvod; commit vrať, jen když už existuje. Když se odložit musí jen krok po nasazení (podmínka z PRD), nasaď a kroky, které proběhly, vrať v kroky_po_nasazeni, odložené vynech. Odklad není infra selhání; okno nebo podmínku, které i s rezervou skončí do ~60 minut, přečkej čekací smyčkou.'
// První nasazení pokusu jde před E2E: commit obnovy v běhu sonnet-5-5 (7f6d9723, opravy z druhého review) dostal zprávu „dorovnání
// stavby po E2E“, ačkoli E2E před ním neproběhlo.
const OBNOVA_BEZ_E2E = ' Zprávu dalšího commitu odvoď z jeho obsahu; E2E v tomto pokusu ještě neproběhlo, „po E2E“ do ní nepiš.'
const spust = (prompt, opts) => runSePredavkou(obnovaOd >= 0 && P >= obnovaPokus && FAZE_OBNOVY.indexOf(fazeObn) >= obnovaOd
  ? `${prompt}\nObnova běhu (${obnovaZnacka}): výsledek této fáze z přerušeného běhu neplatí; změř a proveď ji znovu nad dnešním stavem.${opts.agentType === 'dev-pipeline:deploy' ? `${OBNOVA_COMMITU}${/:[01]$/.test(S(opts.label)) ? OBNOVA_BEZ_E2E : ''}` : ''}` : prompt, opts)
// Rámec každého agenta bloku (1.8.0, § 3 A1): kontext řezu, args majitele a pět vět: autonomie, vize-spory s definicí konzervativní
// volby odkazem (§ 2.1), návrat strojově, společná pravidla odkazem na TVAR-DOKUMENTU.md (čekání na proces na pozadí, souběh ve stromu,
// pojmenování souborů, čtení po sekcích; v zadání se neopakují), hranice souborů. Každá věta pod 40 slov (test sedimentu počítá
// duplicity řádků mezi bloky).
const ramecZ = () => [
  `Projekt: ${cwd} (absolutní cesty; commity jen na vize větvi, nikdy na main).`,
  `Řez ${NN}: PRD ${prdPath} · E2E ${e2ePath} · vize ${a.vize}.`,
  'Běh je autonomní: uživatele se neptáš a vykonáváš jen svou fázi, další spouští workflow.',
  `Rozpor s vizí zapiš do docs/vize-spory.md s citací řádku vize a pokračuj; tvar záznamu a definici konzervativní volby má ${tvar}, sekce Vize-spory.`,
  'Obsahová, právní a etická rozhodnutí nejsou tvoje: udělej, co vize říká, a riziko zapiš jako otázku s navrženou odpovědí „ponechat“.',
  ...(neCile ? [`Ne-cíle vize platí pro každou fázi včetně oprav (změna, která je porušuje, se nedělá; nález jde do follow-upu s důvodem): ${neCile}`] : []),
  ...(rozhodnutiMajitele ? [`Rozhodnutí majitele pro tento běh (závazná, mají přednost před vlastním výkladem vize): ${rozhodnutiMajitele}`] : []),
  ...(pokynOrchestratora ? [`Pokyn orchestrátora pro tuto obnovu (provozní, ne rozhodnutí majitele): ${pokynOrchestratora}`] : []),
  ...(mazane.length ? [`Pozdější řádek plánu maže: ${mazane.join(' · ')}. Nepřidávej tam symboly, testy ani závislosti; co tam řez potřebuje, patří jinam.`] : []),
  'Tah končí jen strukturovaným návratem podle schématu: textová pole stručně; co se nevejde, zapiš do souboru v docs/reviews/ (jen .md a .json) a vrať cestu.',
  `Společná pravidla agentů běhu (čekání na proces na pozadí, souběh ve sdíleném stromu, pojmenování souborů, čtení dokumentů po sekcích) a tvar dokumentů: ${tvar}; čti sekci Společná pravidla agentů a sekce své role (PRD a E2E, Vize-spory, Follow-ups, Čekání na čas).`,
  'docs/handoff.md je stav orchestrátora, ne tvůj vstup: nečti ho; co máš vědět, je v tomto zadání.',
  'Hranice: měníš jen soubory své role podle zadání; cizí soubory a rozpracovanou práci jiných agentů nevracíš (git checkout, restore, stash, clean; guard je blokuje) ani neformátuješ.',
].join('\n')
let ramec = ramecZ()
const M = { opusH: { model: 'opus', effort: 'high' }, opusM: { model: 'opus', effort: 'medium' }, sonL: { model: 'sonnet', effort: 'low' }, sonM: { model: 'sonnet', effort: 'medium' } }

// ---------- schémata ----------
const str = d => ({ type: 'string', description: d })
const arr = d => ({ type: 'array', items: { type: 'string' }, description: d })
const PREDAVKA = { predavka: str(`jen absolutní cesta k TVÉ předávce (${cwd}/docs/reviews/predavka-<tvoje agent id>.md), když tě vyzvala zpráva PŘEDÁVKA a práce ještě není hotová; když je zadání hotové, nevyplňuj; cestu předávky předchůdce sem nikdy nevracej`) }
const IMPL = { type: 'object', required: ['stav', 'souhrn', 'typecheck', 'testy_zelene'], properties: {
  stav: { type: 'string', enum: ['hotovo', 'castecne', 'selhalo', 'prostredi', 'vada-kriteria'], description: 'prostredi = kód je odevzdaný, ale kritérium nebo krok nejde změřit kvůli prostředí (síť, cizí služba, měřicí stanoviště), ne kvůli kódu; vyžaduje dukaz. vada-kriteria = kód je odevzdaný, ale kritérium nejde splnit žádným kódem, který PRD dovoluje; vyžaduje vada_kriteria s důkazem. castecne = práce není dokončená' },
  dukaz: str('jen při prostredi: příkaz, chybový text a čas, které vadu prostředí dokládají; bez důkazu blok bere stav jako selhalo'),
  navrh: str('jen při prostredi: navržená odpověď pro majitele (odkud měřit, nebo přijmout)'),
  // Vadné kritérium už z implementace (1.12.0, spec G1): řez spálil tři pokusy, diagnózu a osm nástupců na kritériu, které kód splnit nemohl;
  // agentovi zbývalo jen castecne, které blok čte jako nedokončenou práci.
  vada_kriteria: { type: 'object', required: ['kriterium', 'dukaz'], properties: { kriterium: str('značka kritéria s názvem'), dukaz: str('měření, které dokládá, že kritérium splnit nejde: příkaz, naměřená hodnota proti prahu, i po záložním postupu z PRD'), navrh: str('navržená změna kritéria nebo odpověď pro majitele') }, description: 'jen při vada-kriteria; bez důkazu blok bere stav jako selhalo' },
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
  zbyvajici_soubory: arr('jen když vracíš predavka (práce nedokončená): soubory ze zadání, které ještě nejsou hotové, cesty relativní ke kořeni projektu'),
  ...PREDAVKA,
} }
// Soubory nápravy nálezu BLOCKER/HIGH: náprava strukturálního nálezu často leží jinde než nález (běh web-podzim: ~35 z 53
// odmítnutých nálezů bylo „mimo mé soubory“, protože balíček dostal soubor s nálezem, ne soubor s nápravou).
const NAPRAVY = { type: 'array', items: { type: 'object', required: ['id', 'soubory'], properties: { id: { type: 'string' }, soubory: arr('soubory, které náprava nálezu mění (nemusí to být soubor s nálezem), cesty relativní ke kořeni projektu') } }, description: 'jen nálezy BLOCKER a HIGH: kde leží jejich náprava' }
// Soubory u každého nálezu (1.11.0, spec I4): podle nich blok pustí dávky nad různými soubory souběžně (balíček 1 byl 63 % fáze Review).
const NALEZY_SOUBORY = { type: 'array', items: { type: 'object', required: ['id', 'soubory'], properties: { id: { type: 'string' }, soubory: arr('soubory, které oprava nálezu mění, cesty relativní ke kořeni projektu') } }, description: 'každý nález v balíčcích a jeho soubory' }
const THERMO = { type: 'object', required: ['blokeru', 'nalezu', 'report_path', 'soubory'], properties: { blokeru: { type: 'integer', description: 'nálezy, které rubrika označuje za blokující' }, nalezu: { type: 'integer' }, report_path: str('absolutní cesta k reportu'), soubory: arr('soubory s nálezy BLOCKER a HIGH, cesty relativní ke kořeni projektu'), napravy: NAPRAVY, nalezy_soubory: NALEZY_SOUBORY, souhrn: str('max 3 řádky'),
  napric: arr('jen thermo části: nálezy přes hranici části (duplicita nebo vlastník pojmu v jiné části či kontraktu, modul napříč částmi), každý jednou větou s místy v obou částech; do NOTE je nesnižuj'), ...PREDAVKA } }
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
  // Nový krok nad platformou z opravy po E2E (§ 2.4): bez opory v Povolení se nenasazuje a jde majiteli jako otázka. Opora je účel a hranice
  // Povolení, ne počet zápisů (1.12.0, spec A6).
  novy_krok_po_nasazeni: { type: 'array', items: { type: 'object', required: ['krok', 'duvod'], properties: { krok: { type: 'string' }, duvod: { type: 'string' }, opora: { type: 'string', description: 'doslovná citace Povolení z PRD nebo rozhodnutí majitele, do jehož účelu a hranic krok spadá; krok mimo účel nebo hranice nech bez opory' }, kriterium: { type: 'string', description: 'kritérium (značka s názvem), kvůli kterému krok vznikl' } } }, description: 'operace nad platformou nebo živým systémem, kterou oprava vyžaduje a PRD ji v krocích po nasazení nejmenuje; sám ji neprováděj, nepřipravuj v konfiguraci ani nepiš do PRD' },
  ...PREDAVKA,
} }
const REVIEW = { type: 'object', required: ['nalezu', 'blokujicich', 'balicky', 'report_path'], properties: {
  nalezu: { type: 'integer' }, blokujicich: { type: 'integer' }, report_path: str('absolutní cesta k reportu'),
  balicky: { type: 'array', items: { type: 'object', required: ['soubory', 'nalezy'], properties: { soubory: arr('disjunktní množina souborů'), nalezy: arr('identifikátory nálezů z reportu'), security: { type: 'boolean' } } } },
  nalezy_soubory: NALEZY_SOUBORY,
  follow_up_ids: arr('nálezy, které nejsou k opravě v řezu (FOLLOW-UP)'),
  ...PREDAVKA,
} }
const VERIFY = { type: 'object', required: ['typecheck', 'suity', 'selhalo', 'exit_kod', 'kontroly_ok', 'meridla_ok'], properties: {
  typecheck: { type: 'boolean' }, selhalo: { type: 'integer' },
  // Počty po okruzích (1.11.0, spec C4): součet dělá blok, agent sečetl ručně špatně 3 z 11 návratů kolečka.
  suity: { type: 'array', items: { type: 'object', required: ['nazev', 'testy'], properties: { nazev: str('okruh testů, jak ho jmenuje výstup'), soubory: { type: 'integer', description: 'počet souborů okruhu' }, testy: { type: 'integer', description: 'prošlé testy okruhu z výstupu runneru' } } }, description: 'počty posledního běhu po okruzích testů; nesčítej je, součet dělá blok' },
  proslo: { type: 'integer', description: 'nevyplňuj, když vracíš suity' },
  exit_kod: { type: 'integer', description: 'návratový kód příkazu testů (EXIT=$? čtený zvlášť, ne přes rouru)' },
  z_cache: { type: 'boolean', description: 'true = runner vrátil výsledek testů nebo typechecku z cache, měření neproběhlo' },
  kontroly: arr('kontroly z pre-commit hooku projektu s výsledkem'),
  kontroly_ok: { type: 'boolean', description: 'všechny kontroly z pre-commit hooku prošly; true, když projekt pre-commit hook nemá' },
  meridla: arr('ID · příkaz · výsledek · ok|FAIL'),
  meridla_ok: { type: 'boolean', description: 'všechna měřidla kritérií prošla; true, když PRD žádné měřidlo nemá' },
  selhavajici: arr('jména selhávajících testů a chyby typecheck s file:line, max 20'), vystup_path: str('soubor s plným výstupem'), prikazy: arr('spuštěné příkazy'),
  flaky: arr('testy z prvního běhu, které prošly až opakováním: samostatně po uvolnění fronty těžkých příkazů, nebo v zopakované celé suitě (pak i opakovano: true)'),
  opakovano: { type: 'boolean', description: 'true = první běh suity byl červený podle pravidla agenta a počty jsou ze zopakované celé suity' },
  pomale: { type: 'array', items: { type: 'object', required: ['test'], properties: { test: { type: 'string' }, ms: { type: 'integer' }, limit: { type: 'integer' } } }, description: 'testy nad 70 % limitu podle doby ve výstupu runneru, nejvýš 10; bez doby ve výstupu prázdné' },
  marker: str('hash stromu z verify-marker.sh při zelené bráně, jinak prázdné'),
  pahyly: arr('zbylé pahýly Kontraktu v nasazovaném kódu jako „soubor:řádek text“; prázdné, když žádný není'),
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
  commit: str(`40 znaků: poslední commit „rez ${NN}“ (git log --grep), i když tento běh nový commit řezu nevytvořil (dorovnání prostředí, jen fix(security)); git rev-parse, nikdy commit zápisu nasazení, nikdy dopočítaný ani zkrácený; prázdný jen při odkladu, když žádný ještě není`),
  commit_zapisu: str('hash samostatného commitu zápisu nasazení'),
  // Kroky se párují podle čísla z PRD (1.6.0): deploy agent text kroku parafrázuje a párování podle textu v běhu web-rijen selhalo.
  kroky_po_nasazeni: { type: 'array', items: { type: 'object', required: ['krok', 'stav'], properties: { id: { type: 'integer', description: 'číslo kroku z číslovaného seznamu sekce PRD; vracej vždy' }, krok: { type: 'string', description: 'text kroku z PRD' }, stav: { type: 'string', enum: ['provedeno', 'selhalo', 'nevztahuje-se', 'vynechano', 'pro-majitele'] }, duvod: { type: 'string' } } }, description: `kroky ze sekce PRD „Nasazení a kroky po něm“: ${KROKY_STAVY}` },
  infra: { type: 'boolean', description: 'true = selhání mimo kód řezu: přihlášení nebo účet CLI, oprávnění, výpadek platformy; opakování pokusu bez zásahu člověka nepomůže' },
  // Výpadek platformy (1.10.0) nepotřebuje člověka: blok zastaví s fází deploy-vypadek a orchestrátor obnovu zkusí sám po ~30 min.
  infra_trida: { type: 'string', enum: ['clovek', 'platforma'], description: 'jen při infra: clovek = nápravu udělá člověk (přihlášení, účet, oprávnění, token, limit tarifu); platforma = dočasný výpadek platformy (pauza nasazení, 5xx, incident na status stránce), důkaz v duvod' },
  report_path: str('absolutní cesta k zápisu nasazení'),
  security_commity: arr('hashe samostatných commitů fix(security)'),
  security_radkem: str('hash commitu řezu, do jehož zprávy jsi dal řádek fix(security) (bezpečnostní oprava bez samostatného commitu); jinak prázdné'),
  health: str('první řádek „aplikace: <app>@<verze nebo deployment id> nasazeno | <app> nenasazeno (<důvod z diffu>) | …“ za každou aplikaci, které se diff od báze dotkl; pak doklad, že běží: status platformy + behaviorální doklad (nebo odložený se změřenou baseline, nebo neexistuje s důvodem)'), url: str(''),
  duvod: str('při failed: přesná chyba'),
  podminky: { type: 'array', items: { type: 'object', required: ['popis', 'vysledek'], properties: { popis: { type: 'string', description: 'popis podmínky doslova ze zadání' }, vysledek: { type: 'string', enum: ['splneno', 'nesplneno', 'nevztahuje-se'], description: 'nevztahuje-se jen u podmínky, která platí jen při zásahu, když nasazení nedělá, co její pravidlo zakazuje' }, zmereno: str('naměřená hodnota a čas; u nevztahuje-se co jsi proti diffu, migracím a krokům po nasazení ověřil'), zasah: str('jen u nesplněné podmínky, která platí jen při zásahu: čím nasazení zasahuje (soubor diffu, migrace, tabulka nebo krok po nasazení); bez něj se kvůli ní neodkládá') } }, description: 'vyhodnocení provozních podmínek ze zadání' },
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
  provedene_kroky: { type: 'array', items: { type: 'object', required: ['krok'], properties: { id: { type: 'integer', description: 'číslo kroku z PRD' }, krok: { type: 'string' }, stav: { type: 'string', enum: ['provedeno', 'nevztahuje-se'] } } }, description: 'kroky po nasazení, které přerušený běh vyřídil se stavem provedeno nebo nevztahuje-se (ze zápisu nasazení)' },
  commit_pokusu: str(`40 znaků: poslední commit „rez ${NN}“ (git log --grep, git rev-parse), i bez zápisu nasazení; když žádný není, prázdné; jen informace`),
  brana_nad_head: { type: 'boolean', description: 'true jen když docs/.verify-passed existuje a jeho pole tree se rovná výstupu tree-hash.sh ze zadání (dnešní pracovní strom bez docs/, i s necommitnutými změnami): zelená brána měřila přesně tento strom' },
  strom_cisty: { type: 'boolean', description: 'git status --porcelain mimo docs/ je prázdný (žádná necommitnutá změna kódu)' },
  doklad_pred: str(`cesta k docs/e2e/rez-${NN}-doklad-pred.md, když existuje (doklad před migrací z přerušeného běhu); jinak prázdné`),
  bez_review: { type: 'array', items: { type: 'object', required: ['commit'], properties: { commit: { type: 'string' }, popis: { type: 'string' } } }, description: 'pole bez_review ze souboru zastaveného běhu beze změny; bez souboru prázdné' },
  review: { type: 'object', properties: { kola: { type: 'integer' }, nalezu: { type: 'integer' }, blokujicich: { type: 'integer' }, fix_agentu: { type: 'integer' } }, description: 'pole review ze souboru zastaveného běhu beze změny; bez souboru nevyplňuj' },
  thermo: { type: 'object', properties: { nalezu: { type: 'integer' }, blokeru: { type: 'integer' }, oprava: { type: 'string' }, reporty: arr('cesty k reportům thermo s nálezy') }, description: 'pole thermo ze souboru zastaveného běhu beze změny; bez souboru nevyplňuj' },
  casti: { type: 'array', items: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, hotovo: { type: 'boolean' }, zrevidovano: { type: 'boolean' }, prostredi: { type: 'boolean' } } }, description: 'pole casti ze souboru zastaveného běhu beze změny; bez souboru prázdné' },
  prostredi: { type: 'array', items: { type: 'object' }, description: 'pole prostredi ze souboru zastaveného běhu beze změny; bez souboru prázdné' },
  e2e_selhani: { type: 'object', properties: { kriteria: arr('FAIL a prostředí z E2E přerušeného běhu'), reporty: arr('cesty k jejich reportům') }, description: 'pole e2e_selhani ze souboru zastaveného běhu beze změny; bez souboru nevyplňuj' },
  dvere: { type: 'string', enum: ['jednosměrné', 'obousměrné'], description: 'z řádku „Dveře: … · Dosah: …“ posledního zápisu nasazení; bez zápisu nevyplňuj' },
  dosah: str('z téhož řádku zápisu nasazení; bez zápisu prázdné'),
  e2e: { type: 'object', properties: { vysledek: { type: 'string', enum: ['pass', 'pass-castecne', 'fail', 'vada-kriteria', 'prostredi'] }, celkem: { type: 'integer' }, pass: { type: 'integer' }, castecne: { type: 'integer' }, fail: { type: 'integer' }, vadna_kriteria: arr('vadná kritéria z reportu'), castecna_kriteria: arr('částečná kritéria z reportu'), citelnost: { type: 'array', items: { type: 'object', properties: { plocha: { type: 'string' }, co: { type: 'string' }, proc: { type: 'string' } } }, description: 'vady čitelnosti z reportu' }, k_domereni: { type: 'array', items: { type: 'object', properties: { kriterium: { type: 'string' }, co_bezi: { type: 'string' }, kontrola: { type: 'string' }, nejdriv: { type: 'string' } } }, description: 'kritéria k doměření z reportu' }, report_path: str('absolutní cesta k reportu') }, description: `jen když E2E posledního nasazení řezu ${NN} doběhlo (report docs/reviews/rez-${NN}-p*-e2e*-kolo-*.md po zápisu nasazení): jeho verdikt a počty; jinak nevyplňuj` },
  poznamka: str('co chybí nebo nesedí'),
  ...PREDAVKA,
} }
// Počty skládá blok ze seznamů kritérií (1.12.0, spec I1): čísla od verifikátora jdou jen do logu rozdílu, proto je pass_kriteria povinné.
const E2E = { type: 'object', required: ['vysledek', 'celkem', 'pass', 'castecne', 'fail', 'pass_kriteria', 'report_path'], properties: {
  vysledek: { type: 'string', enum: ['pass', 'pass-castecne', 'fail', 'vada-kriteria', 'prostredi'] }, celkem: { type: 'integer' }, pass: { type: 'integer' }, castecne: { type: 'integer' }, fail: { type: 'integer' },
  pass_kriteria: arr('značky kritérií s verdiktem PASS, každá jednou; každé změřené kritérium patří do právě jednoho seznamu, počty z nich skládá blok'),
  fail_kriteria: { type: 'array', items: { type: 'object', required: ['kriterium', 'selhani'], properties: { kriterium: str('značka kritéria s názvem („AK7 Rozpad útraty podle modelu“)'), selhani: str('jednou větou co selhalo (skutečné selhání implementace)'), pricina_mimo_rez: { type: 'object', required: ['dukaz'], properties: { dukaz: str('důkaz, že příčina leží mimo hranici řezu: jiný modul, infrastruktura, cizí služba') }, description: 'jen když příčina FAIL prokazatelně leží mimo hranici řezu (§ 2.12)' } } }, description: 'skutečná selhání implementace' }, castecna_kriteria: arr('jen kritéria s verdiktem PASS-částečně: značka, co živě nešlo, který test nese druhou půlku; poznámku ke kritériu s PASS sem nepiš; verdikt dáváš za svou sekci, půlku z jiné sekce nehodnoť'),
  // Druh „zdroj spotřebován“ platí jen pro neobnovitelný zdroj (1.12.0, spec K3): verifikátoři jím vraceli i denní mez zápisů, která se druhý
  // den obnoví, a z doměření čtyř kritérií vznikl mini-řez. Vyčerpaná kvóta jde do k_domereni. Zápis mimo účel a hranice Povolení (spec A6)
  // se neprovádí a kritérium jde majiteli jako otázka prvním druhem.
  vadna_kriteria: arr('kritérium (značka s názvem, „AK7 Rozpad útraty podle modelu“) + doklad jednoho z pěti druhů: nesplnitelné v prostředí E2E (credential, měří se až po uzavíracím commitu, potřebuje zápis mimo účel nebo hranice Povolení a zbytek nedokládá žádný test) / koliduje s jiným kritériem nebo Ne-cílem vize / nález je předřezový (existoval před řezem) a řez ho nemá v rozsahu / scénář zastaral po opravě (odporuje odchylce od PRD nebo rozšířenému zásahu opravy ze zadání) / zdroj spotřebován vlastní chybou (jen neobnovitelný zdroj: jednorázový souhlas nebo zdroj spotřeboval dřívější krok běhu a sám se neobnoví, credential nechybí; vyčerpaná kvóta platformy patří do k_domereni); nic jiného sem nepatří'),
  // Čitelnost (1.11.0, spec D1): 19 z 31 selhání E2E byly srozumitelnost a u 6 z 11 řezů jediný spouštěč opravného cyklu (6,8 h, $41).
  // Od 1.12.0 (spec N1) ji stavba neopravuje: položky jdou do follow-ups a opraví je várky čitelnosti ve vlně dluhu kolečka.
  citelnost: { type: 'array', items: { type: 'object', required: ['plocha', 'co'], properties: { plocha: str('obrazovka nebo blok'), co: str('co je nesrozumitelné, jednou větou'), proc: str('proč to uživateli brání') } }, description: 'vady čitelnosti a srozumitelnosti, které kritérium neshazují; do fail se nepočítají' },
  // Dlouhé měření nedrží slot stavby (1.11.0, spec I1): řez 03 držel slot 4 h 33 a stavba 06 čekala 9 h.
  // Obnovitelná mez (1.12.0, spec K3): kritérium nad vyčerpanou kvótou platformy se doměří další den meze, vadné není.
  k_domereni: { type: 'array', items: { type: 'object', required: ['kriterium', 'co_bezi', 'kontrola', 'nejdriv'], properties: { kriterium: str('značka kritéria s názvem'), co_bezi: str('běh nebo čas, na který se čeká, a co už je změřené; u vyčerpané kvóty stav meze a co je změřené'), kontrola: str('čtecí příkaz, který výsledek ověří; u vyčerpané kvóty sekce a kroky scénáře k přeměření'), nejdriv: str('nejdřívější čas ověření, ISO 8601 s časovou zónou; u vyčerpané kvóty začátek dalšího dne meze') } }, description: 'kritéria, která čekají na běh nebo čas déle než ~30 min, se změřeným startem a průběhem, a kritéria, jejichž kvóta platformy (nebo denní pojistka starší vize, kterou majitel potvrdil jako mez) je dnes vyčerpaná; do pass ani fail je nepočítej; bez kontroly nebo platného času je blok počítá jako FAIL' },
  zavazne_mimo_ak: arr('bezpečnostní a datové nálezy mimo kritéria'), kosmeticke: arr('kosmetické regresní postřehy'), report_path: str('absolutní cesta k reportu'),
  prostredi_nasazeni: str('prázdné, když je nasazení v pořádku; jinak vada nasazení, kterou dorovná deploy, ne fix agent: nasazená revize není commit řezu, aplikace nedostupná, přihlášení ze zadání nefunguje'),
  // Kritéria, která nejde změřit kvůli prostředí (§ 2.2): hned v kole 1, s důkazem a návrhem; nestojí pokus, jdou majiteli jako otázka.
  prostredi: { type: 'array', items: { type: 'object', required: ['kriterium', 'dukaz'], properties: { kriterium: str('značka kritéria s názvem'), sekce: str('sekce scénářů'), dukaz: str('příkaz, chybový text a čas: proč měření nejde provést kvůli prostředí (nestálá síť, chyba cizí služby, stanoviště je tento stroj proti produkci)'), navrh: str('navržená odpověď pro majitele: odkud měřit, nebo přijmout') } }, description: 'kritéria, která nejde změřit kvůli prostředí; do fail se nepočítají; bez důkazu je blok počítá jako FAIL' },
  ...PREDAVKA,
} }
const DOKLAD = { type: 'object', required: ['ok', 'path'], properties: { ok: { type: 'boolean', description: 'true jen tehdy, když uspěl každý předepsaný bod dokladu' }, path: str('absolutní cesta k dokladu'), souhrn: str('max 5 řádků: co je zachyceno (tabulky, počty, vzorky) a čím'), duvod: str('při ok false: proč doklad nejde pořídit (chybí přístup, dotaz selhal)'), ...PREDAVKA } }
const DIAG = { type: 'object', required: ['pricina', 'doporuceni', 'smycka_postavena'], properties: { pricina: str('file:line + mechanismus'), doporuceni: str('co má třetí pokus udělat jinak'), smycka_postavena: { type: 'boolean' }, repro_path: str('cesta k reprodukčním artefaktům'),
  // Vadné kritérium kroku po nasazení (1.11.0, spec I5): třetí pokus by nad stejným mechanismem naměřil totéž (řez 09, $36, 4× deploy).
  // Od 1.12.0 (spec G3) se žádá po každém selhání: diagnóza „kód je v pořádku, chyba je v kritériu“ po selhání integrace se dřív zahodila
  // a třetí pokus běžel nadarmo.
  vada_kriteria: { type: 'object', required: ['druh', 'dukaz'], properties: { kriterium: str('značka kritéria s názvem, nebo krok po nasazení'), druh: str('proč kritérium nejde splnit: práh nad mechanismem, který hodnotu omezuje, a podobně'), dukaz: str('měření nebo citace mechanismu, file:line'), navrh: str('navržená změna kritéria nebo odpověď pro majitele') }, description: 'jen když příčinou selhání je samo kritérium (akceptační kritérium nebo kritérium kroku po nasazení), ne kód' }, ...PREDAVKA } }
const CLOSE = { type: 'object', required: ['ok', 'thermo_nesesouhlaseno', 'chybejici_doklady'], properties: {
  ok: { type: 'boolean' }, poznamka: str('co se nepodařilo zapsat'),
  commit_overeny: str(`40 znaků: commit řezu ověřený git cat-file -t a zprávou „rez ${NN}“ (i když se shoduje se zadáním); nikdy dopočítaný`),
  chybejici_commity: arr('bezpečnostní commity ze zadání, které v repu neexistují'),
  thermo_nesesouhlaseno: { type: 'integer', description: 'nálezy BLOCKER/HIGH z thermo reportů, u kterých v journalu není ani „opraveno“, ani follow-up s odvozením' },
  chybejici_doklady: arr('artefakty, které PRD nebo vize předepisuje jako doklad řezu (měření, export, report v repu) a v commitu nejsou'),
  // Počty předávek do pole kontext nepatří (1.12.0, spec H1): návrat nese predavky (nástupci spuštění tímto voláním bloku: předávka hooku
  // i castecne bez předávky, přes všechny pokusy, po obnově od obnovené fáze); číslo z logu zůstává v journalu.
  kontext: str(`souhrn záznamů řezu ${NN} z docs/.kontext.jsonl: nejvyšší hodnota podle typu agenta, počet compactů, čtení; počty předávek sem nepiš`),
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
  casti_v_kostre: arr('jen řez s částmi: id částí z frontmatteru casti: kostry po tvé úpravě (K1, K2, …)'),
  ...PREDAVKA,
} }

// ---------- vyhodnocení ----------
// Zelená jen nad doloženým měřením: exit kód testů 0, aspoň jeden prošlý test, nic z cache, kontroly pre-commitu a měřidla kritérií
// (v běhu bez-dluhu pustila brána zelenou nad neproběhlou suitou a řez 20 padl na verify:arch, který brána nespustila).
const MAX_FLAKY = 3
const flakyZ = v => trimList(v && v.flaky)
// Pahýly Kontraktu (1.10.0): stavba řezu 11 v běhu zaklad-dat nasadila trasy, které vracely „neimplementováno: část K8“, a brána
// ani review to nezastavily. Kontrakt předepisuje přesnou značku „neimplementováno: řez NN část Kx“: brána počítá jen pahýly svého
// řezu (pahýl dřívějšího řezu, ani ve starém tvaru bez čísla řezu, tento řez neshodí) a pahýl části zastavené prostředím (její šev
// zůstává záměrně, § 2.2) se nepočítá.
const znackaPahylu = p => { const m = /neimplementováno:\s*řez\s*0*(\d+)\s+část\s+(K\d+)/i.exec(S(p)); return m ? { rez: Number(m[1]), cast: m[2].toUpperCase() } : null }
const castZPahylu = p => { const z = znackaPahylu(p); return z ? z.cast : '' }
const pahylyZ = v => trimList(v && v.pahyly).filter(p => { const z = znackaPahylu(p); return !!z && z.rez === Number(NN) && !zastavene.has(z.cast) })
// Pahýl části, kterou stavba vůbec nestaví (tabulka Částí se rozešla se seznamem stavby): fix brány ji nedopíše, řez končí.
const pahylyMimo = v => pahylyZ(v).filter(p => !casti.some(c => c.id.toUpperCase() === castZPahylu(p)))
// Strop flaky platí pro samostatné běhy; celá zelená suita po opakování je zelená i nad ním (1.11.0, spec C2): ze 6 pokusů spálených na bráně
// byla vada kódu řezu jen u jednoho, strop nekryl asertaci pod zátěží ani exit 1 bez červeného testu.
const flakyVPoradku = v => flakyZ(v).length <= MAX_FLAKY || v.opakovano === true
const zelena = v => !!v && v.typecheck === true && v.selhalo === 0 && v.exit_kod === 0 && v.proslo > 0 && v.z_cache !== true && v.kontroly_ok !== false && v.meridla_ok !== false && flakyVPoradku(v) && !pahylyZ(v).length
// Počty po okruzích sečte blok (spec C4); bez suity platí proslo agenta.
const normBrana = v => {
  if (!v) return v
  const su = pole(v.suity).filter(x => x && typeof x === 'object')
  if (!su.length) return v
  const soucet = su.reduce((n, x) => n + (Number(x.testy) || 0), 0)
  if (Number.isFinite(Number(v.proslo)) && v.proslo != null && Number(v.proslo) !== soucet) log(`brána: agent hlásil ${v.proslo} prošlých testů, součet okruhů je ${soucet}; platí součet`)
  v.proslo = soucet
  v.souboru = su.reduce((n, x) => n + (Number(x.soubory) || 0), 0)
  return v
}
const meridlaFail = v => { const m = trimList(v && v.meridla); const f = m.filter(x => /FAIL/.test(x)); return f.length ? f : m }
const branaDuvod = v => !v ? 'verify bez výsledku' : [
  v.typecheck !== true ? 'typecheck červený' : '',
  v.selhalo !== 0 ? `selhalo ${v.selhalo} testů` : '',
  v.exit_kod !== 0 ? `testy skončily kódem ${v.exit_kod}` : '',
  !(v.proslo > 0) ? 'žádný prošlý test (suita neproběhla)' : '',
  v.z_cache === true ? 'výsledek z cache (spusť s --force)' : '',
  v.kontroly_ok === false ? `kontroly pre-commitu: ${trimList(v.kontroly).slice(0, 8).join(' | ') || 'červené'}` : '',
  v.meridla_ok === false ? `měřidla: ${meridlaFail(v).slice(0, 8).join(' | ') || 'červená'}` : '',
  !flakyVPoradku(v) ? `${flakyZ(v).length} testů prošlo až samostatně po timeoutu (strop ${MAX_FLAKY})` : '',
  pahylyZ(v).length ? `pahýly Kontraktu: ${pahylyZ(v).slice(0, 6).join(' | ')}` : '',
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
// Vyřízený je i krok nevztahuje-se (1.11.0, spec B1): nasazení po obnově ho vrátilo jako vynechano „provedeno v předchozím nasazení“, blok
// to bral jako selhání a řez 13 tak přehrál 54 agentů za $89.
const zapisProvedene = d => {
  const zapis = (k, pripona) => {
    const t = `${idKroku(k) != null ? `${idKroku(k)}. ` : ''}${S(k.krok).trim()}${pripona}`
    const klice = [...(idKroku(k) != null ? [`#${idKroku(k)}`] : []), `t:${normKrok(k.krok)}`]
    for (const x of klice) if (!pripona || !provedeneKroky.has(x)) provedeneKroky.set(x, t)
  }
  for (const k of krokyStav(d, 'provedeno')) zapis(k, '')
  for (const k of krokyStav(d, 'nevztahuje-se')) zapis(k, ' (nevztahuje se)')
}
const bylProveden = k => (idKroku(k) != null && provedeneKroky.has(`#${idKroku(k)}`)) || provedeneKroky.has(`t:${normKrok(k.krok)}`)
const vynechane = d => krokyStav(d, 'vynechano').map(fmtKrok)
const chybneKroky = d => [...krokyStav(d, 'selhalo').map(k => `selhal ${fmtKrok(k)}`), ...krokyStav(d, 'vynechano').filter(k => !bylProveden(k)).map(k => `vynechán ${fmtKrok(k)}`)]
// Krok nevztahuje-se (podmínka z PRD vyhodnocená a nenastala, 1.7.0) chybou není; chybneKroky bere jen selhalo a vynechano.
const chybaNasazeni = (d, k) => !d ? nic(`deploy:řez ${NN}${pz()}:${k}`, 'deploy agent') : d.stav === 'failed' ? S(d.duvod) || 'deploy selhal' : d.stav === 'odlozeno' ? `nasazení odloženo${S(d.nejdriv).trim() ? ` do ${S(d.nejdriv).trim()}` : ''}: ${S(d.duvod) || 'bez důvodu'}` : d.stav === 'success' && chybneKroky(d).length ? `krok po nasazení: ${chybneKroky(d).join(' | ').slice(0, 600)}` : ''
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
const mapaNalezu = r => Object.fromEntries(pole(r && r.nalezy_soubory).filter(x => x && S(x.id).trim() && cesty(x.soubory).length).map(x => [S(x.id).trim(), cesty(x.soubory)]))
const balickyZ = r => { const nalezy_soubory = mapaNalezu(r); return (r && r.balicky || []).map(b => ({ soubory: cesty(b.soubory), security: !!b.security, zdroje: [{ report: S(r.report_path), ids: trimList(b.nalezy), nalezy_soubory }] })).filter(b => b.soubory.length) }
// Jeden balíček ze všech balíčků review kola 2 nebo opravy po E2E: opravuje ho jeden řetěz dávek, soubory nálezů zůstávají.
const celyBalicek = r => ({ soubory: cesty(pole(r.balicky).flatMap(b => b.soubory || [])), security: pole(r.balicky).some(b => b.security), zdroje: [{ report: S(r.report_path), ids: trimList(pole(r.balicky).flatMap(b => b.nalezy || [])), nalezy_soubory: mapaNalezu(r) }] })
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
  const mapa = mapaNalezu(th)
  const mini = [
    ...napravy.map(x => { const id = S(x.id).trim(), soubory = trimList([...cesty(x.soubory), ...(mapa[id] || [])]); return { soubory, security: false, zdroje: [{ report, ids: trimList([id]), thermo: true, nalezy_soubory: { [id]: soubory } }] } }),
    ...cesty(th.soubory).filter(f => !sNapravou.has(f)).map(f => ({ soubory: [f], security: false, zdroje: [{ report, ids: [], thermo: true, soubory: [f] }] })),
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
// Mini-řez nad týmž stromem (spec H7): blok PRD právě skončil a strom se nezměnil, další kontrola PRD by jen přeměřila totéž ($3,57, 13 min u řezu 23).
// Ostatní řezy refresh dál mají: v běhu brief-a-provedeni našel 49 blokujících nálezů.
const bezRefreshe = prdLehke && !prdStale.length
const hypVeta = () => !hyp ? '' : ` Zbylé nálezy kontroly PRD, které blok PRD neopravil (${hyp.report}), přeměř jako hypotézy nad dnešním stromem: ${hypBlokujici.length ? `blokující ${hypBlokujici.join(', ')} jako první, ` : ''}${hypOstatni.length ? `ostatní (formulace a zbytek) ${hypOstatni.join(', ')}` : hypBlokujici.length ? 'jiné nejsou' : 'všechny'}. Platný blokující zapiš do svého reportu jako nález (zapracování ho opraví), neplatný jmenuj v reportu jako ověřeně neplatný.${hyp.bezKontroly.length ? ` Tyto nálezy zapracoval blok PRD bez kontroly: ověř, že zapracování platí, a nové chyby v něm hlas jako blokující. Nálezy: ${hyp.bezKontroly.join(', ')}.` : ''}`
const refreshCheck = () => spust(`${ramec}

${prdStale.length
    ? `Úkol: delta prd-check PRD řezu ${NN} nad DNEŠNÍM stromem${sCastmi ? ` (${prdVse}; přeměř kostru a jen ty části, kterých se změny stromu týkají)` : ''}. PRD vzniklo před uzavřením těchto řezů: ${prdStale.join(' | ')}. Prověř VÝHRADNĚ kritéria a tvrzení PRD a E2E scénářů, která závisí na stavu stromu: výčty souborů a míst, počty, existence a jediné použití symbolů, premisy „jediný konzument“, cesty; každé takové kritérium přeměř spuštěním (rg, Serena, skript v repu), ne úsudkem.${OSY_REFRESHE}`
    : `Úkol: přeměř nad DNEŠNÍM stromem blokující nálezy kontroly PRD řezu ${NN}${sCastmi ? ` (${prdVse})` : ''}, které blok PRD neopravil${hyp && hyp.bezKontroly.length ? ' nebo zapracoval bez kontroly' : ''}; jiná kritéria nekontroluj. Každý nález přeměř spuštěním (rg, Serena, skript v repu), ne úsudkem.${OSY_REFRESHE}`}
${mapaText}${hypVeta()} Report do ${rep('prd-refresh', 1)}, vrať verdikt, počty a identifikátory nálezů.`,
  { label: `prd-refresh:řez ${NN}`, phase: 'Refresh PRD', agentType: 'dev-pipeline:prd-check', schema: CHECK, ...M.opusM })

const refreshFix = k => spust(`${ramec}

Úkol: zapracuj do PRD řezu ${NN}${sCastmi ? ` (${prdVse})` : ''} nálezy delta kontroly nad dnešním stromem: ${k.report_path} (${(k.nalezy_ids || []).join(', ') || 'všechny'}). Každý nález je hypotéza: ověř proti kódu; co platí, oprav v PRD a E2E scénářích tak, aby kritéria měřila dnešní strom (výčet nahraď vlastností a měřidlem, počet přepočítej a uveď dotaz); co míří vedle, odmítni s důvodem. Rozsah řezu nerozšiřuj ani nezužuj; když nález žádá změnu rozsahu, zapiš do vize-spory a odmítni.${sCastmi ? ` Počet ani id částí neměň (frontmatter casti:, tabulka Části a soubory PRD částí zůstávají): stavba staví části ${casti.map(c => c.id).join(', ')} a část navíc by zůstala pahýlem až do produkce; nález, který žádá rozdělit, přidat nebo ubrat část, odmítni s důvodem „mění tabulku Částí“. Vrať casti_v_kostre: id částí z frontmatteru casti: kostry po své úpravě.` : ''} Needituj nic jiného než PRD${sCastmi ? ' (kostru a části)' : ''} a E2E soubory řezu.`,
  { label: `prd-refresh-fix:řez ${NN}`, phase: 'Refresh PRD', agentType: 'dev-pipeline:prd', schema: PRD_FIX, ...M.opusH })

// Vstupy implementace společné malému řezu i částem: hypotézy (prd-check, refresh, orchestrátor) a diagnóza.
const hypotezyText = (refresh, jenSvoje) => `${hyp ? `Zbylé nálezy prd-checku jako hypotézy k ověření, ne fakta${jenSvoje ? ' (jen ty, které se týkají tvé práce; z reportu čti jen nálezy podle id)' : ''}: ${hyp.report} (${trimList([...hypBlokujici, ...hyp.ids]).join(', ') || 'všechny'}).\n${bezRefreshe && hyp.bezKontroly.length ? `Tyto nálezy zapracoval blok PRD bez další kontroly a refresh se u mini-řezu nekoná; ověř, že zapracování platí: ${hyp.bezKontroly.join(', ')}.\n` : ''}` : ''}${refresh ? `PRD bylo před stavbou přeměřeno nad dnešním stromem (${refresh.report_path}); zbylé nálezy (${(refresh.nalezy_ids || []).join(', ') || 'žádné'}) ber jako hypotézy.\n` : ''}${hypText ? `Hypotézy od orchestrátora k ověření, ne fakta (stav stromu po předchozím řezu, rozhodnutí uživatele): ${hypText.slice(0, 1500)}\n` : ''}`
// Hypotézy kontroly PRD, které kontrola nemohla spustit (overit_prvni): malý řez je dostane celé, řez s částmi po kritériích k části,
// zbytek kontrakt (bez kontraktu integrace). Ověřit je jde až nad stavěným kódem, proto hned na začátku stavby.
const kId = s => S(s).trim().split(/[\s:(,;]/)[0].toUpperCase()
// Párování kritéria s důkazem (1.11.0, spec D4): kId vrátí z „čitelnost: …“ i „smoke: …“ jen předponu a jeden důkaz by spároval víc FAIL. Klíč je
// značka kritéria (AK12; „S3 nahrávání“ značku nemá), jinak celý normalizovaný text; text FAIL smí navíc nést „: selhání“ za názvem kritéria.
const textKrit = s => S(s).trim().replace(/\s+/g, ' ').toLowerCase()
const znackaKrit = s => { const m = /^\W*(AK\d+[a-z]?)\b/i.exec(S(s)); return m ? m[1].toUpperCase() : '' }
const klicKrit = s => znackaKrit(s) || textKrit(s)
const stejneKrit = (x, y) => klicKrit(x) === klicKrit(y) || (!znackaKrit(x) && !znackaKrit(y) && (textKrit(x).startsWith(`${textKrit(y)}:`) || textKrit(y).startsWith(`${textKrit(x)}:`)))
const overitPro = c => overitPrvni.filter(h => c.kriteria.some(k => kId(k) === kId(h.kriterium)))
const overitZbytek = overitPrvni.filter(h => !casti.some(c => overitPro(c).includes(h)))
const overitText = xs => xs.length ? `Hypotézy kontroly PRD, které kontrola nemohla spustit (ověř jako první, než začneš stavět; výsledek uveď v souhrnu; potvrdí-li se, že kritérium splnit nejde, vrať stav vada-kriteria): ${xs.map(h => `${h.id || '?'}${h.kriterium ? ` (${h.kriterium})` : ''}: ${h.hypoteza}`).join(' | ').slice(0, 1500)}\n` : ''
const diagText = diag => diag ? `Diagnóza po dvou neúspěších (doložená příčina): ${S(diag.pricina).slice(0, 500)} · doporučení: ${S(diag.doporuceni).slice(0, 400)}\n` : ''
const pravidlaImpl = 'Hypotézy a follow-upy nikdy nerozšiřují rozsah PRD: co PRD nebo jeho kritéria zakazují, neděláš, i když to hypotéza navrhuje. Past v kódu, na kterou narazíš ve změněných souborech, oprav; mimo ně ji vrať jako follow-up „odstranit past X“. Testy piš k chování, ne k řezu; nepřidávej testovací soubory pojmenované po řezu. Měřidlo, které PRD předepisuje (skript v repu), spusť nad odevzdávaným stromem až na konci, ne uprostřed práce.'
// Stav prostredi (§ 2.2): kód odevzdaný, měření nejde kvůli prostředí; bez důkazu je to selhalo.
const PROSTREDI_IMPL = ' Když kritérium nebo krok nejde změřit kvůli prostředí (síť, cizí služba, stanoviště), kód odevzdej hotový a vrať stav prostredi s důkazem (příkaz, chybový text, čas) a návrhem pro majitele; není to selhání ani důvod k opakování.'
// Stav vada-kriteria (spec G1): kód odevzdaný, kritérium splnit nejde; bez důkazu je to selhalo. castecne zůstává nedokončenou prací.
const VADA_IMPL = ' Když kritérium nejde splnit žádným kódem, který PRD dovoluje, a máš to změřené i po záložním postupu z PRD, kód odevzdej hotový, test kritéria nech červený (práh ani test neměň) a vrať stav vada-kriteria s vada_kriteria (kritérium, důkaz měřením, návrh); castecne je jen nedokončená práce.'
// Živý systém (1.12.0, spec A6): Povolení se dává na účel a hranice, ne na počet zápisů (14 z 26 otázek majiteli se týkalo Povolení nebo zápisů
// a čtyři kritéria se vrátila jako vadná kvůli denní mezi). Zápis mimo účel nebo hranice agent neprovede: verifikátor vrátí kritérium jako
// PASS-částečně, když zbytek dokládá jmenovaný test (e2e-verifier.md bod 4, review N5 dávky 2b), a jen bez testu jako vadné kritérium (otázka);
// deploy blokujícím krokem bez oprávnění, oprava po E2E krokem bez opory.
// Čerstvá rozhodnutí (spec K2): rámec nese rozhodnutí majitele ze startu bloku; zvýšení meze zapsané devět minut po startu stavby její E2E
// o sedm hodin později nevidělo. Agent, který smí zapsat do živého systému, je proto čte ze souboru.
const CERSTVA_ROZHODNUTI = 'Před prvním zápisem do živého systému přečti pole rozhodnuti_majitele v docs/.run-args.json; novější položka platí a má přednost před zadáním i scénářem.'
const ZIVY_E2E = 'V živém systému zapisuj jen v účelu a hranicích Povolení, které PRD cituje, a počet zápisů nehlídej; maž jen to, co běh sám založil, nebo co Povolení jmenuje. Zápis mimo účel nebo hranice neprováděj: kritérium, které ho potřebuje, vrať jako PASS-částečně v castecna_kriteria, když jeho zbytek dokládá jmenovaný test (test jmenuj); jen bez takového testu ho vrať ve vadna_kriteria jako nesplnitelné v prostředí E2E a napiš, který zápis Povolení nepokrývá (otázka pro majitele).'
const ZIVY_DEPLOY = 'Krok po nasazení, který zapisuje do živého systému, proveď jen v účelu a hranicích Povolení (PRD ho u kroku cituje) a počet zápisů nehlídej; maž jen to, co běh sám založil, nebo co Povolení jmenuje. Krok mimo účel nebo hranice (jiný systém, účet nebo objekt, mazání cizího) neprováděj: vrať ho jako blokující krok bez oprávnění s důvodem, rozhodne majitel.'
// Krok před nasazením (měření stavu před změnou, příprava dat) pouští implementace malého řezu nebo část souběžně se svou prací (implement.md).
const KROK_PRED_IMPL = ` Krok před nasazením, který ti PRD přiděluje, smí do živého systému jen v účelu a hranicích Povolení citovaného u kroku. ${CERSTVA_ROZHODNUTI}`
// Stránka pastí projektu (spec K4): v běhu ji četlo 24 % verifikátorů a zadání ji nejmenovalo ani jednou. Doplňuje ji uzavření řezu.
const PASTI_PATH = `${cwd}/docs/e2e/pasti.md`
const PASTI_CTI = `Stránku pastí ověřování ${PASTI_PATH}, když existuje, přečti dřív, než začneš.`
const buildVerze = runbook ? ` Když postup nasazení (${runbook}) vyžaduje zvednutí build verze nebo markeru, udělej to teď jako součást řezu.` : ''
// Jediná cesta k build verzi po bráně (1.11.0, spec A2): sed měnil strom a marker přestal sedět, git commit pak pustil plnou suitu znovu
// (8,5 h z 15,2 h agentů deploye, 54 suit, 20 červených).
const ZVEDNI = `Build verzi zvedni jen příkazem \`bash ${a.plugin_root ? `${a.plugin_root}/scripts/verify-marker.sh` : 'scripts/verify-marker.sh pluginu dev-pipeline'} --zvedni ${cwd} <soubor> <stará> <nová>\`, nikdy sedem: přenese marker zelené brány.`

const impl = (n, predchozi, diag, refresh) => spust(`${ramec}

Úkol: implementuj řez ${NN} podle PRD (TDD červená až zelená, doktrína CLAUDE.md projektu, Serena na hledání symbolů). Pokus ${n} z ${MAX_POKUSU}.
${hypotezyText(refresh)}${overitText(overitPrvni)}${predchozi ? `Předchozí pokus selhal ve fázi „${predchozi.faze}“: ${S(predchozi.detail).slice(0, 600)}. Pracovní strom obsahuje jeho stav; navaž na něj, nezačínej od nuly.\n` : ''}${navazText(`implement:řez ${NN}`)}${diagText(diag)}${pravidlaImpl} Průběžně spouštěj jen dotčené testy; plnou suitu a typecheck celého projektu jednou, na konci.${buildVerze}${KROK_PRED_IMPL}${PROSTREDI_IMPL}${VADA_IMPL}`,
  { label: `implement:řez ${NN}:${n}`, phase: 'Implementace', agentType: 'dev-pipeline:implement', schema: IMPL, ...M.opusH })

// Kontrakt řezu s částmi: společné věci položí jeden agent před částmi, aby souběžní autoři nesahali na tentýž soubor.
const implKontrakt = (n, diag, refresh) => spust(`${ramec}

Úkol: kontrakt řezu ${NN}: polož společné věci ze sekce Kontrakt kostry PRD ${prdPath} (schéma a migrace, typy, signatury rozhraní mezi částmi, registrace tras); těla, která patří částem, nech vyhodit chybu se značkou „neimplementováno: řez ${NN} část K<číslo>“ doslova (ani v jiném jazyce projektu ji nepřekládej: podle ní brána najde zbylý pahýl); typecheck zelený; testy jen tam, kde kontrakt nese chování (migrace, validace); části neimplementuj; vrať změněné soubory. Z kostry čti jen sekci Kontrakt a společné sekce, na které odkazuje; sekce částí přeskoč. Pokus ${n} z ${MAX_POKUSU}.
${mapaText}${hypotezyText(refresh, true)}${overitText(kontraktPotreba ? overitZbytek : [])}${kontraktSelhani ? `Kontrakt v minulém pokusu selhal: ${kontraktSelhani.slice(0, 600)}. Pracovní strom nese jeho rozdělanou práci; navaž na ni, nezačínej od nuly.\n` : ''}${navazText(`implement:řez ${NN}:kontrakt`)}${diagText(diag)}Plnou suitu nespouštěj, pustí ji brána.`,
  { label: `implement:řez ${NN}:kontrakt:${n}`, phase: 'Kontrakt', agentType: 'dev-pipeline:implement', schema: IMPL, ...M.opusH })

// Kontrakt na stropu předávek: místo selhání fáze vezme blok z posledního návratu řetězu zbývající soubory (zbyvajici_soubory, které
// předávající agent vrací spolu s předávkou), rozdělí je na dvě disjunktní poloviny a dva agenti je dokončí souběžně; části čekají.
// Bez seznamu zbývajících souborů platí selhání fáze. Část nad stropem se takhle nedělí: části jsou už disjunktní jednotka.
const implKontraktDil = (n, diag, refresh, pismeno, moje, cizi, zapis) => spust(`${ramec}

Úkol: dokonči kontrakt řezu ${NN} (sekce Kontrakt kostry PRD ${prdPath}): řetěz agentů před tebou vyčerpal štafetu${zapis ? ` a jeho poslední zápis stavu je ${zapis}: nejdřív ho přečti` : ''}; hotové je v pracovním stromě (git status), neopakuj ho. Polož VÝHRADNĚ tyto soubory: ${moje.join(', ')}${cizi.length ? `; soubory ${cizi.join(', ')} souběžně dokončuje druhý agent, nesahej na ně` : ''}. Těla, která patří částem, nech vyhodit chybu se značkou „neimplementováno: řez ${NN} část K<číslo>“ doslova (ani v jiném jazyce projektu ji nepřekládej: podle ní brána najde zbylý pahýl); typecheck filtrovaný na své soubory (celý repo měří integrace); testy jen tam, kde kontrakt nese chování; části neimplementuj; vrať změněné soubory. Z kostry čti jen sekci Kontrakt a společné sekce, na které odkazuje. Pokus ${n} z ${MAX_POKUSU}.
${mapaText}${hypotezyText(refresh, true)}${overitText(kontraktPotreba ? overitZbytek : [])}${diagText(diag)}Plnou suitu nespouštěj, pustí ji brána.`,
  { label: `implement:řez ${NN}:kontrakt:${n}:${pismeno}`, phase: 'Kontrakt', agentType: 'dev-pipeline:implement', schema: IMPL, ...M.opusH })
// Seznamy ze všech návratů řetězu i dílů (dedup), počty a typecheck jen z návratů v pocty (nástupce vrací kumulativně za předchůdce,
// částečné návraty mají typecheck červený).
const slozImpl = (xs, souhrn, pocty = xs) => ({
  stav: 'hotovo', souhrn, typecheck: pocty.every(x => x.typecheck === true), testy_zelene: pocty.every(x => x.testy_zelene === true),
  novych_testu: pocty.reduce((s, x) => s + (Number(x.novych_testu) || 0), 0), oblasti: trimList(xs.flatMap(x => pole(x.oblasti))),
  soubory: trimList(xs.flatMap(x => cesty(x.soubory))), mimo_hranici: xs.flatMap(x => pole(x.mimo_hranici)), zmenena_mista: trimList(xs.flatMap(x => pole(x.zmenena_mista))),
  odchylky_od_prd: trimList(xs.flatMap(x => pole(x.odchylky_od_prd))), pasti_opravene: trimList(xs.flatMap(x => pole(x.pasti_opravene))),
  follow_ups: trimList(xs.flatMap(x => pole(x.follow_ups))), spory: trimList(xs.flatMap(x => pole(x.spory))),
})
const kontraktPoStropu = async (n, diag, refresh) => {
  const label = `implement:řez ${NN}:kontrakt:${n}`
  const mezi = navratNaStropu.get(label) || []
  const posledni = mezi[mezi.length - 1]
  const zbyva = cesty(posledni && posledni.zbyvajici_soubory)
  if (!zbyva.length) { log('kontrakt na stropu předávek: poslední návrat řetězu zbývající soubory nenese; fáze zůstává selhaná'); return null }
  // Jediný zbývající soubor dokončí jeden agent (dělení na poloviny by pokus spálilo zbytečně).
  const pul = Math.ceil(zbyva.length / 2)
  const dily = zbyva.length === 1 ? [zbyva] : [zbyva.slice(0, pul), zbyva.slice(pul)]
  log(`kontrakt na stropu předávek: zbývá ${zbyva.length} ${zbyva.length === 1 ? 'soubor, dokončí ho jeden agent' : `souborů, dokončí je dva agenti souběžně (a: ${dily[0].length}, b: ${dily[1].length})`}`)
  let vys = await parallel(dily.map((d, i) => () => implKontraktDil(n, diag, refresh, PISMENA[i], d, zbyva.filter(f => !d.includes(f)), posledniPredavka.get(klicFaze(label)) || '')))
  // Stav vada-kriteria dílčího agenta (spec G1) se složením nesmí ztratit: slozImpl skládá stav hotovo a řez by šel dál na části, review
  // a bránu nad kritériem, které kód splnit nemůže. S důkazem se vada zapíše a složený kontrakt ji nese, bez důkazu je díl selhaný.
  vys = vys.map((r, i) => r && r.stav === 'vada-kriteria' && !vadaKriteriaZ(r, `kontrakt (agent ${PISMENA[i]})`) ? bezDukazuVady(r) : r)
  const chybi = vys.map((r, i) => (!r ? nic(`${label}:${PISMENA[i]}`, `agent ${PISMENA[i]}`) : r.stav === 'selhalo' ? `agent ${PISMENA[i]}: ${S(r.souhrn).slice(0, 300)}` : '')).filter(Boolean)
  if (chybi.length) return { ...slozImpl(vys.filter(Boolean), ''), stav: 'selhalo', souhrn: `kontrakt po stropu předávek nedokončen (${chybi.join(' | ')})` }
  posledniPredavka.delete(klicFaze(label))
  const slozeny = slozImpl([...mezi, ...vys], `kontrakt dokončen po stropu předávek: ${vys.map((r, i) => `${PISMENA[i]}) ${S(r.souhrn).slice(0, 400)}`).join(' ')}`, [posledni, ...vys])
  const vada = vys.find(r => r.stav === 'vada-kriteria')
  return vada ? { ...slozeny, stav: 'vada-kriteria', vada_kriteria: vada.vada_kriteria } : slozeny
}

const implCast = (c, n, diag, refresh) => {
  const st = castiStav.get(c.id)
  return spust(`${ramec}

Úkol: implementuj část ${c.id} (${c.nazev}) řezu ${NN} podle PRD části ${c.prd_path || '(cesta v kostře)'} a kostry ${prdPath} (z kostry čti Kontrakt, svůj řádek v Částech, ze sekce kritérií jen svá kritéria podle ID${c.kriteria.length ? ` ${c.kriteria.join(', ')} (rg -n nad kostrou)` : ''} a společné sekce; sekce jiných částí přeskoč). ${kontraktPotreba ? 'Kontrakt už je v kódu.' : 'Řez samostatný kontrakt nemá.'} Hranice: měníš jen soubory a oblasti své části: ${c.soubory.join(', ') || '(podle PRD části)'}; souběžně s tebou pracují ve stejném stromu jiné části. Změnu jinde (jiná část, kontrakt, sdílený soubor) neprováděj, vrať ji v mimo_hranici (soubor, co a proč), provede ji integrace. Testy piš a pouštěj jen své (TDD); typecheck jen filtrovaný na svůj balíček nebo soubory; plnou suitu ani typecheck celého repa nespouštěj, patří integraci a bráně. Pokus ${n} z ${MAX_POKUSU}.
${mapaText}${hypotezyText(refresh, true)}${overitText(overitPro(c))}${st.selhani ? `Tvoje část v minulém pokusu selhala: ${st.selhani.slice(0, 600)}. Pracovní strom nese její rozdělanou práci; navaž na ni, nezačínej od nuly.\n` : ''}${navazText(`implement:řez ${NN}:část ${c.id}`)}${diagText(diag)}${pravidlaImpl}${runbook ? ' Build verzi ani marker v části nezvedáš, zvedne je integrace jednou za řez.' : ''}${KROK_PRED_IMPL}${PROSTREDI_IMPL}${VADA_IMPL}`,
    { label: `implement:řez ${NN}:část ${c.id}:${n}`, phase: 'Části', agentType: 'dev-pipeline:implement', schema: IMPL, ...M.opusH })
}

const implIntegrace = (n, diag) => {
  // Integrace jen nad hotovými částmi (§ 2.2): část zastavená prostředím se nestaví a její šev zůstává „neimplementováno“ s otázkou majiteli.
  const ids = casti.filter(c => castiStav.get(c.id).hotovo).map(c => c.id)
  const zast = [...zastavene.keys()]
  const mimo = casti.filter(c => castiStav.get(c.id).hotovo).flatMap(c => castiStav.get(c.id).mimo.map(m => ({ cast: c.id, ...m }))).slice(0, 40)
  return spust(`${ramec}

Úkol: integrace řezu ${NN} po částech ${ids.join(', ')}: spusť typecheck celého repa a testy dotčené všemi částmi (ne plnou suitu)${rychleText}, a kontroly pre-commit hooku projektu nad celým stromem (.husky/pre-commit, .git/hooks/pre-commit nebo lefthook; tytéž, které měří brána, kromě plné suity) a oprav, co části rozbily; sešij švy mezi částmi a kontraktem; proveď požadavky mimo hranici ${JSON.stringify(mimo)}, každý nejdřív ověř (je potřeba, neduplikuje existující); odstraň zbylé pahýly se značkou „neimplementováno: řez ${NN} část K…“${zast.length ? ` kromě částí ${zast.join(', ')}, které zastavilo prostředí (nestaví se, jejich šev nech s touto značkou a nic za ně nedomýšlej)` : ''}; nové chování nepřidávej; požadavek, který mění rozsah PRD, neprováděj a vrať jako odchylku. PRD: ${prdVse}. Pokus ${n} z ${MAX_POKUSU}.
${mapaText}${overitText(kontraktPotreba ? [] : overitZbytek)}${integraceSelhani ? `Integrace v minulém pokusu selhala: ${integraceSelhani.slice(0, 600)}. Pracovní strom nese její rozdělanou práci; navaž na ni.\n` : ''}${navazText(`implement:řez ${NN}:integrace`)}${diagText(diag)}${buildVerze}${VADA_IMPL}`,
    { label: `implement:řez ${NN}:integrace:${n}`, phase: 'Integrace', agentType: 'dev-pipeline:implement', schema: IMPL, ...M.opusM })
}

// Oprava řezu s částmi po selhání za implementací: části jsou hotové a prošly review, znovu se nestaví.
const implOprava = (n, z, predchozi, diag) => spust(`${ramec}

Úkol: pokus ${n} řezu ${NN} po selhání ve fázi ${z.faze}: ${S(z.detail).slice(0, 800)}${diag ? ` · diagnóza: ${S(diag.pricina).slice(0, 500)} · doporučení: ${S(diag.doporuceni).slice(0, 400)}` : ''}; kód řezu je v pracovním stromě (kontrakt a všechny části hotové a prošly review); oprav příčinu, rozsah PRD nerozšiřuj; dotčené testy a typecheck, plnou suitu pustí brána; vrať zmenena_mista a soubory. PRD: ${prdVse}. ${mapaText.trim()}${predchozi && predchozi !== z ? ` Předchozí oprava skončila bez úspěchu: ${S(predchozi.detail).slice(0, 400)}; pracovní strom nese její stav, navaž na něj.` : ''}${PROSTREDI_IMPL}${VADA_IMPL}`,
  { label: `implement:řez ${NN}:oprava:${n}`, phase: 'Implementace', agentType: 'dev-pipeline:implement', schema: IMPL, ...M.opusH })

// Thermo bez části = celý pracovní strom (malý řez); s částí jen její soubory.
const thermo = (c, soubory) => spust(`${ramec}

Úkol: thermo-nuclear review ${c ? `části ${c.id} (${c.nazev}) řezu ${NN}: rozsah VÝHRADNĚ soubory části: ${soubory.join(', ')} (PRD části ${c.prd_path || 'v kostře'}); kontrakt a jiné části neposuzuj; nález přes hranici části (duplicita nebo vlastník pojmu v jiné části či kontraktu, modul, který patří napříč částmi) vrať v napric a do NOTE ho nesnižuj, posoudí ho thermo integrace` : `změn řezu ${NN} v pracovním stromě (diff si posbírej sám včetně netrackovaných souborů)`}. Suď proti rubrice, doktríně projektu a Ne-cílům vize z rámce, ne jen proti PRD: nový produkční kód, který PRD nežádá, nebo šev přidaný jen pro testy, je nález. Report do ${c ? rep(`thermo-cast-${c.id}`, 1) : rep('thermo', 1)}. Vrať počty, cestu, soubory s nálezy BLOCKER a HIGH a u každého takového nálezu soubory jeho nápravy v napravy (relativně ke kořeni projektu). Souběžně běží code-review téhož stromu; kód se nemění.${standardy}`,
  { label: c ? `thermo:řez ${NN}:část ${c.id}` : `thermo:řez ${NN}`, phase: 'Review', agentType: 'dev-pipeline:thermo-nuclear-review', schema: THERMO, ...M.opusM })

// Thermo celého řezu po integraci (1.10.0): thermo části vidí jen své soubory a hloubku modulů, vlastníka pojmu a duplicitu napříč
// částmi v běhu zaklad-dat poprvé posoudilo až kolečko (dva z jeho HIGH nálezů thermo části vidělo a snížilo na NOTE).
const thermoIntegrace = (ig, napric) => spust(`${ramec}

Úkol: thermo-nuclear review integrace řezu ${NN}: strukturální audit celého řezu po integraci nad kontraktem (${cesty(kontraktVysledek && kontraktVysledek.soubory).join(', ') || 'řez samostatný kontrakt nemá'}), změnami integrace (${cesty(ig.soubory).join(', ') || trimList(ig.zmenena_mista).join(' | ') || 'viz pracovní strom'}) a švy mezi částmi ${casti.map(c => c.id).join(', ')}. Posuď, co thermo jedné části nevidí: hloubku modulů a vlastníka pojmu napříč částmi a kontraktem, duplicitu mezi částmi (dva podobné helpery, typy nebo konstanty), mělká rozhraní a průchozí vrstvy mezi částmi; uvnitř jedné části neposuzuj, to udělalo thermo části.${napric.length ? ` Nálezy přes hranici části z thermo částí posuď jako první: ${napric.join(' | ').slice(0, 2000)}.` : ''} Suď proti rubrice, doktríně projektu a Ne-cílům vize z rámce. Report do ${rep('thermo-integrace', 1)}. Vrať počty, cestu, soubory s nálezy BLOCKER a HIGH a u každého takového nálezu soubory jeho nápravy v napravy (relativně ke kořeni projektu). Souběžně běží integrační code-review téhož stromu; kód se nemění.${standardy}`,
  { label: `thermo:řez ${NN}:integrace`, phase: 'Review', agentType: 'dev-pipeline:thermo-nuclear-review', schema: THERMO, ...M.opusM })

const fixThermo = ths => spust(`${ramec}

Úkol: oprav strukturální nálezy thermo review řezu ${NN}: ${ths.map(t => t.report_path).join(', ')}. Meze: jen soubory tohoto řezu (pracovní strom), jen nálezy, které rubrika označuje za blokující nebo které máš po ověření za jisté; sporné a cizí nech jako follow-up. Nezaváděj nové plošné mechanismy. Spouštěj jen dotčené testy a typecheck${rychleText}; plnou suitu nespouštěj, patří bráně. Necommituj.${standardy}`,
  { label: `fix-thermo:řez ${NN}`, phase: 'Review', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

const review = (zadani, report, label) => spust(`${ramec}

Úkol: ${zadani} Report do ${report}. Vrať počty, disjunktní balíčky po souborech s identifikátory nálezů a cestu; nálezy samotné nevracej. Každý nález v reportu nese BLOKUJE NASAZENÍ nebo FOLLOW-UP; nad plochou, která zapisuje do produkce (migrace, deploy a datové skripty, mazání), je práh přísnější: i PLAUSIBLE nález tam BLOKUJE.${standardy}`,
  { label, phase: 'Review', agentType: 'dev-pipeline:code-review', schema: REVIEW, ...M.opusH })
const reviewRez = () => review(`code-review řezu ${NN}, kolo 1. Rozsah: pracovní strom (celá změna řezu včetně netrackovaných souborů).`, rep('code-review', 1), `review:řez ${NN}:1`)
const reviewCast = (c, soubory) => review(`code-review části ${c.id} (${c.nazev}) řezu ${NN}, kolo 1. Rozsah: VÝHRADNĚ soubory části: ${soubory.join(', ')} (PRD části ${c.prd_path || 'v kostře'}${c.kriteria.length ? `; z kostry ${prdPath} čti ze sekce kritérií jen kritéria části podle ID ${c.kriteria.join(', ')}` : ''}); kontrakt a jiné části neposuzuj, švy a duplicity mezi částmi posoudí integrační review.`,
  rep(`code-review-cast-${c.id}`, 1), `review:řez ${NN}:část ${c.id}:1`)
const reviewIntegrace = ig => review(`integrační code-review řezu ${NN}: kontrakt (${cesty(kontraktVysledek && kontraktVysledek.soubory).join(', ') || 'řez samostatný kontrakt nemá'}), změny integrace (${cesty(ig.soubory).join(', ') || trimList(ig.zmenena_mista).join(' | ') || 'viz pracovní strom'}) a švy mezi částmi ${casti.map(c => c.id).join(', ')}; hledej hlavně rozpor mezi částmi a kontraktem, duplicity mezi částmi (dva podobné helpery, typy nebo konstanty; souběžní autoři je snadno napíšou dvakrát), nesešité švy a zbytky značky „neimplementováno: řez ${NN} část K…“ (zbytek v kódu, který jde do nasazení, je vždy BLOKUJE NASAZENÍ, i když patří části, která v této integraci není: v produkci vrací chybu); uvnitř jedné části neposuzuj, to dělá review části.`,
  rep('code-review-integrace', 1), `review:řez ${NN}:integrace:1`)
// Oprava kódu po E2E (1.11.0, spec F1): jedno kolo jednoho reviewera vždy. Mez 300 řádků z 1.10.0 pustila v běhu brief-a-provedeni 16 commitů
// bez review a kolečko v nich našlo 2 blokující nálezy; review malé opravy trvá ~1 min.
const reviewPoE2E = (f, co, stitek, typ) => review(`code-review ${co} řezu ${NN} v pokusu ${P}. Rozsah: VÝHRADNĚ změny opravy: ${trimList(f.zmenena_mista).join(' | ') || 'viz pracovní strom (git diff proti poslednímu commitu řezu)'}; nový soubor posuď celý, co prošlo review řezu, znovu nekontroluj.`,
  rep(typ, 1), `review:řez ${NN}${pz()}:${stitek}`)
const reviewOprava = (o, n) => review(`code-review opravy řezu ${NN} v pokusu ${n}. Rozsah: VÝHRADNĚ změny opravy: ${trimList(o.zmenena_mista).join(' | ') || cesty(o.soubory).join(', ') || 'viz pracovní strom'}; co prošlo review částí, znovu nekontroluj.`,
  rep('code-review-oprava', 1), `review:řez ${NN}:oprava:${n}`)
const review2 = (rozsah, odmBlok, reporty) => review(`code-review řezu ${NN}, kolo 2. Rozsah: VÝHRADNĚ opravná várka: ${rozsah.join(' | ')}${odmBlok.length ? `; odmítnuté blokující nálezy: ${odmBlok.join(' | ')}; obstojí odmítnutí? přeměř proti kódu (nálezy jsou v reportech kola 1: ${reporty.join(', ')})` : ''}. Co prošlo kolem 1, znovu nekontroluj.`,
  rep('code-review', 2), `review:řez ${NN}:2`)

// Poslední várka (kolo 2) jde zúžením: po ní už review není a deník vad u neověřené poslední várky naměřil nejvyšší chybovost oprav (třída B).
const fixBalicek = (b, i, kolo, vsechnyThermo, dv = null) => spust(`${ramec}

Úkol: oprav nálezy řezu ${NN} (kolo ${kolo}${dv ? `, dávka ${dv.davka} z ${dv.davek} ${dv.soubeh ? 'nad svou částí balíčku souborů' : 'nad týmž balíčkem souborů'}${dv.navazuje ? ': předchozí dávky už své nálezy v těchto souborech opravily a pracovní strom to nese' : ''}; tvoje jsou jen nálezy níže` : ''}).${zdrojeText(b.zdroje, vsechnyThermo)} Sahej jen do souborů: ${b.soubory.join(', ')}; jiné soubory mohou souběžně opravovat jiní agenti.${dv && dv.soubeh ? ' Když oprava potřebuje soubor mimo tento seznam, nesahej na něj: nález vrať v odmitnuto a přesah nahlas v rozsireny_zasah.' : ''} Root brána může být červená na cizích souborech, ověř svůj balíček. Spouštěj jen dotčené testy a typecheck${rychleText}; plnou suitu nespouštěj, patří bráně a souběžné agenty by vyhladověla. ${b.security ? 'Jde o bezpečnostní balíček. Necommituj; bezpečnostní opravu commitne deploy samostatně. Vrať security: true a v zmenena_mista, co oprava mění.' : 'Necommituj.'} Každý nález je hypotéza: ověř proti kódu; co míří vedle, oprav skutečnou příčinu a rozdíl uveď v jinak_nez_nalez; nález, který neopravíš, vrať v odmitnuto s důvodem (u nálezu BLOKUJE s blokuje: true). Nahlas rozšířený zásah, když překročí nálezy. Identifikátory nálezů, které jsi opravil, vrať v opravene_ids.${kolo === 2 || /^E2E/.test(S(kolo)) ? ' Poslední várka, po ní už review není. Oprav zúžením. Nový mechanismus ani změnu rozhodovací logiky nedělej, nahlas je jako follow-up nebo rozhodnutí. Odložení je plnohodnotný výsledek.' : ''}${standardy}`,
  { label: dv ? `fix:řez ${NN}:kolo ${kolo}:balíček ${i + 1}:dávka ${dv.davka}` : `fix:řez ${NN}:${kolo}.${i + 1}`, phase: 'Review', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })
// Balíček nad DAVKA_NALEZU nálezů jde dávkami po nejvýš DAVKA_NALEZU nálezech (nikdy dva agenti souběžně nad týmž souborem): jeden
// agent s desítkou nálezů nad desítkami souborů řetězil nástupce z předávek; dávka se vejde do jednoho. Návraty dávek se sčítají jako
// jeden balíček. Sériové dávky nad celým balíčkem (davkyBalicku) jsou záložní režim; zdroje bez identifikátorů v něm jdou do první dávky.
const DAVKA_NALEZU = 6
const VLNA_DAVEK = 4
const pocetNalezu = b => b.zdroje.reduce((s, z) => s + z.ids.length, 0)
const davkyZ = (polozky, zaklad) => {
  const poId = polozky.filter(z => z.ids.length), bezId = polozky.filter(z => !z.ids.length)
  const davky = []
  for (let i = 0; i < poId.length; i += DAVKA_NALEZU) davky.push(poId.slice(i, i + DAVKA_NALEZU))
  if (!davky.length) davky.push([])
  davky[0] = [...bezId, ...davky[0]]
  return davky.map(zdroje => ({ ...zaklad, zdroje }))
}
const davkyBalicku = b => pocetNalezu(b) <= DAVKA_NALEZU ? [b] : davkyZ(b.zdroje.flatMap(z => z.ids.length ? z.ids.map(id => ({ ...z, ids: [id] })) : [z]), b)
// Vlny dávek (1.12.0, spec L): komponenty podle sdílených souborů (1.11.0) pustily souběžně jen 4 ze 42 balíčků nad 6 nálezů, protože pár
// středových souborů spojí celý balíček do jedné komponenty a ta šla sériově. Položka je nález se svými soubory {z, n, soubory}; zdroj bez
// identifikátorů (thermo soubor bez nápravy) má n 0. Vrací vlny dávek {polozky, soubory}: vlny jdou za sebou, dávky jedné vlny souběžně.
const vlnyDavek = polozky => {
  const pocet = d => d.polozky.reduce((s, p) => s + p.n, 0)
  const prekryv = (p, d) => p.soubory.filter(f => d.soubory.includes(f)).length
  const pridej = (d, p) => { d.polozky.push(p); d.soubory = trimList([...d.soubory, ...p.soubory]) }
  // 1. Dávky podle příbuznosti: začíná nález nad souborem, který sdílí nejvíc zbylých nálezů, a přibírá nálezy s největším překryvem souborů.
  const zbyva = polozky.filter(p => p.n), davky = []
  while (zbyva.length) {
    const sdili = new Map()
    for (const p of zbyva) for (const f of p.soubory) sdili.set(f, (sdili.get(f) || 0) + 1)
    const vaha = p => Math.max(...p.soubory.map(f => sdili.get(f)))
    const d = { polozky: [], soubory: [] }
    pridej(d, zbyva.splice(zbyva.indexOf(zbyva.reduce((m, p) => vaha(p) > vaha(m) ? p : m)), 1)[0])
    while (pocet(d) < DAVKA_NALEZU) {
      const dalsi = zbyva.reduce((m, p) => prekryv(p, d) > (m ? prekryv(m, d) : 0) ? p : m, null)
      if (!dalsi) break
      pridej(d, zbyva.splice(zbyva.indexOf(dalsi), 1)[0])
    }
    davky.push(d)
  }
  // Zdroj bez identifikátorů jde k dávce, která nese nejvíc jeho souborů, jinak k nejmenší.
  for (const p of polozky.filter(x => !x.n)) {
    const cil = davky.reduce((m, d) => prekryv(p, d) > prekryv(p, m) || (!prekryv(p, m) && !prekryv(p, d) && pocet(d) < pocet(m)) ? d : m)
    cil.polozky.unshift(p); cil.soubory = trimList([...cil.soubory, ...p.soubory])
  }
  // 2. Vlna = dávky bez společného souboru, hladově od největší dávky.
  const doVln = (ds, strop) => {
    const vlny = []
    for (const d of [...ds].sort((x, y) => pocet(y) - pocet(x))) {
      const v = vlny.find(w => w.length < strop && !w.some(o => o.soubory.some(f => d.soubory.includes(f))))
      if (v) v.push(d); else vlny.push([d])
    }
    return vlny
  }
  // 3. Malé dávky téže vlny se sbalí do jedné do stropu nálezů (dvacet samostatných nálezů nesmí spustit dvacet agentů); počet vln to
  // nemění, společný soubor nemají. Až sbalené dávky se rozdělí do vln se stropem šířky.
  const sbalene = []
  for (const v of doVln(davky, Infinity)) {
    const od = sbalene.length
    for (const d of v) {
      const g = sbalene.slice(od).find(s => pocet(s) + pocet(d) <= DAVKA_NALEZU)
      if (g) { g.polozky.push(...d.polozky); g.soubory = trimList([...g.soubory, ...d.soubory]) } else sbalene.push({ polozky: [...d.polozky], soubory: [...d.soubory] })
    }
  }
  return doVln(sbalene, VLNA_DAVEK)
}
// Dávka dostane jen soubory svých nálezů. Nález bez souborů, nebo se souborem mimo balíček (ten smí opravovat jiný balíček), vrací sériové
// dávky nad celým balíčkem. sdileny = soubor, kterého se dotýká nejvíc nálezů: důvod, proč balíček nejde jednou vlnou.
const vlnyBalicku = b => {
  if (pocetNalezu(b) <= DAVKA_NALEZU) return { vlny: [[b]], soubeh: false, sdileny: null }
  const seriove = duvod => { log(`balíček nad ${DAVKA_NALEZU} nálezů běží sériově: ${duvod}`); return { vlny: davkyBalicku(b).map(d => [d]), soubeh: false, sdileny: null } }
  const polozky = b.zdroje.flatMap(z => z.ids.length ? z.ids.map(id => ({ z: { ...z, ids: [id] }, n: 1, soubory: cesty((z.nalezy_soubory || {})[id]) })) : [{ z, n: 0, soubory: cesty(z.soubory) }])
  if (polozky.some(p => !p.soubory.length)) return seriove('nález bez souborů')
  if (polozky.some(p => p.soubory.some(f => !b.soubory.includes(f)))) return seriove('nález se souborem mimo balíček')
  const sdili = new Map()
  for (const p of polozky.filter(x => x.n)) for (const f of p.soubory) sdili.set(f, (sdili.get(f) || 0) + 1)
  const [soubor, nalezu] = [...sdili].reduce((m, x) => x[1] > m[1] ? x : m)
  return { vlny: vlnyDavek(polozky).map(v => v.map(d => ({ ...b, soubory: d.soubory, zdroje: d.polozky.map(p => p.z) }))), soubeh: true, sdileny: nalezu > 1 ? { soubor, nalezu } : null }
}
const slozOpravy = xs => !xs.length ? null : {
  opraveno: xs.reduce((s, x) => s + (Number(x.opraveno) || 0), 0), opravene_ids: trimList(xs.flatMap(x => pole(x.opravene_ids))),
  odmitnuto: xs.flatMap(x => pole(x.odmitnuto)), jinak_nez_nalez: trimList(xs.flatMap(x => pole(x.jinak_nez_nalez))),
  zmenena_mista: trimList(xs.flatMap(x => pole(x.zmenena_mista))), rozsireny_zasah: xs.some(x => x.rozsireny_zasah === true),
  rozsireny_popis: trimList(xs.map(x => S(x.rozsireny_popis).trim())).join(' | '), typecheck: xs.every(x => x.typecheck === true), testy_zelene: xs.every(x => x.testy_zelene === true),
  follow_ups: trimList(xs.flatMap(x => pole(x.follow_ups))), spory: trimList(xs.flatMap(x => pole(x.spory))), security: xs.some(x => x.security === true),
  novy_krok_po_nasazeni: xs.flatMap(x => pole(x.novy_krok_po_nasazeni)), davek: xs.length,
}
const fixBalicekDavkami = async (b, i, kolo, vsechnyThermo) => {
  const { vlny, soubeh, sdileny } = vlnyBalicku(b)
  const davek = vlny.flat().length
  if (davek === 1) return fixBalicek(vlny[0][0], i, kolo, vsechnyThermo)
  log(`balíček ${i + 1} (kolo ${kolo}): ${pocetNalezu(b)} nálezů, ${davek} dávek ${vlny.length === 1 ? 'v 1 vlně' : `ve ${vlny.length} vlnách`}, nejvíc ${Math.max(...vlny.map(v => v.length))} souběžně${sdileny ? `; soubor ${sdileny.soubor} sdílí ${sdileny.nalezu} nálezů` : ''}`)
  // Vlny za sebou, dávky jedné vlny souběžně; dávka pozdější vlny navazuje na strom po předchozích vlnách.
  let cislo = 0
  const vys = []
  for (const [j, v] of vlny.entries()) {
    const zadani = v.map(d => ({ d, dv: { davka: ++cislo, davek, navazuje: j > 0, soubeh } }))
    vys.push(...await parallel(zadani.map(x => () => fixBalicek(x.d, i, kolo, vsechnyThermo, x.dv))))
  }
  if (vys.some(x => !x)) log(`balíček ${i + 1} (kolo ${kolo}): ${vys.filter(x => !x).length} z ${davek} dávek bez výsledku`)
  const r = slozOpravy(vys.filter(Boolean))
  if (r) r.davek = davek
  return r
}

const verify = k => spust(`${ramec}

Úkol: brána řezu ${NN}, běh ${k}: spusť typecheck a testy projektu podle CLAUDE.md${runbook ? ` (nebo runbooku ${runbook})` : ''}, každý příkaz s výstupem přesměrovaným do souboru a návratovým kódem čteným zvlášť (\`cmd > log 2>&1; echo EXIT=$?\`), nikdy přes rouru; plný výstup ulož do ${rep('verify', k)}. Spusť i kontroly, které spouští pre-commit hook projektu (.husky/pre-commit, .git/hooks/pre-commit nebo lefthook; seznam si přečti z hooku), kromě plné suity, kterou už spouštíš, a kromě kontrol nad dokumenty běhu v docs/ (follow-ups, journal), které spouští až uzavření řezu; vrať je v kontroly. Spusť měřidla kritérií, která PRD označuje [měřidlo] (${sCastmi ? prdVse : prdPath}), nad odevzdávaným stromem a výsledek každého vrať v meridla.${sCastmi ? ` Najdi zbylé pahýly Kontraktu tohoto řezu: přesnou značku „neimplementováno: řez ${NN} část K“ (\`rg -n 'neimplementováno: řez ${NN} část K'\`) v kódu, který jde do nasazení (bez testů a docs/)${zastavene.size ? `, kromě částí ${[...zastavene.keys()].join(', ')} zastavených prostředím` : ''}; značky jiných řezů a jiný tvar nehledej; každý výskyt vrať v pahyly jako „soubor:řádek text“.` : ''} Vrať skutečné výsledky (exit kód, počty, jména selhávajících testů, chyby s file:line). Nic neopravuj a neinterpretuj.${a.plugin_root ? ` Když je typecheck zelený, testy skončily kódem 0 s aspoň jedním prošlým a žádným selhaným testem a prošly kontroly i měřidla, spusť \`bash ${a.plugin_root}/scripts/verify-marker.sh ${cwd} ${rep('verify', k)}\` a jeho výstup (hash stromu) vrať v poli marker; jinak marker nezapisuj.` : ''}`,
  { label: `verify:řez ${NN}${pz()}:${k}`, phase: 'Brána', agentType: 'dev-pipeline:verify', schema: VERIFY, ...M.sonL }).then(normBrana)

// Hranice opravy brány (1.6.0): v běhu web-rijen fix brány mini-řezu 12 „opravil“ selhání eslintu na gitignorovaném pomocném skriptu
// výjimkou ve sdíleném eslint.config.js a měřidlo rozsahu změn pak řez shodilo. Hranice = soubory částí z PRD a soubory, které blok změnil.
const hraniceRezu = () => trimList([...casti.flatMap(c => c.soubory), ...zmenyBloku])
const HRANICE_BRANY = 'Selhání na gitignorovaném souboru mimo diff řezu není vada řezu: soubor odstav (přejmenuj mimo dosah kontroly nebo smaž, když je to tvůj pomocný soubor), sdílenou konfiguraci (eslint, tsconfig, prettier, CI) neměň.'
const fixBrana = (v, hranice = hraniceRezu()) => spust(`${ramec}

Úkol: brána řezu ${NN} je červená (${branaDuvod(v)}). Selhává: ${(v.selhavajici || []).slice(0, 20).join(' | ') || 'viz výstup'}${v.kontroly_ok === false ? ` · kontroly pre-commitu: ${trimList(v.kontroly).slice(0, 12).join(' | ') || 'viz výstup'}` : ''}${v.meridla_ok === false ? ` · měřidla kritérií: ${meridlaFail(v).slice(0, 12).join(' | ') || 'viz výstup'}` : ''}${flakyZ(v).length ? ` · testy nad limitem pod zátěží (${flakyZ(v).length}, strop ${MAX_FLAKY}): ${flakyZ(v).slice(0, 12).join(' | ')}; u nich zlevni měření (menší fixtury, méně iterací, bez čekání na čas), limit nezvedej` : ''}${v.vystup_path ? ` · plný výstup: ${v.vystup_path}` : ''}. Hranice opravy: soubory řezu ${hranice.length ? `(${hranice.slice(0, 60).join(', ')}${hranice.length > 60 ? ` a dalších ${hranice.length - 60}` : ''})` : '(git status: soubory, které řez změnil)'} a jejich testy; změnu mimo ni udělej jen tehdy, když bez ní brána nejde opravit, a nahlas ji jako rozšířený zásah. ${HRANICE_BRANY} Oprav příčinu (ne test ani měřidlo, pokud nejsou špatně; suita, která skončila nenulovým kódem bez selhaného testu nebo bez jediného prošlého, neproběhla: zjisti proč); po opravě spusť dotčené testy, kontroly, typecheck a měřidla řezu ([měřidlo] v PRD ${prdVse})${rychleText}, plnou suitu pustí znovu brána. Necommituj.${standardy}`,
  { label: `fix-brana:řez ${NN}`, phase: 'Brána', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

// Deploy: commit řezu doslova (v běhu bez-dluhu pole commit 16× z 24 neslo commit zápisu nasazení a pět hashů si agent
// dopočítal), kroky po nasazení z PRD, zápis nasazení samostatným commitem, bezpečnostní opravy před commitem řezu.
const secText = xs => xs.map(s => `${s.popis} (soubory: ${s.soubory.join(', ') || 'viz popis'})`).join(' | ').slice(0, 1500)
// Provozní podmínky v zadání deploye. Podmínka, která platí jen při zásahu (spec E2), nese dovětek: obecná věta o odkladu by jinak
// přebila její pravidlo a agent by odložil podle stavu, který ještě nenastal, aniž ověřil, jestli se ho nasazení vůbec dotýká.
const PRI_ZASAHU = ' (platí jen při zásahu: ověř proti diffu řezu od báze, migracím a krokům po nasazení z PRD, jestli nasazení dělá, co pravidlo zakazuje; bez zásahu vrať nevztahuje-se se zmereno, co jsi ověřil, a nasazuj; odklad jen s doloženým zasah)'
const podminkyVeta = x => x.jenCommit || deployMode === 'commit-only' || !runtimeDopad || !deployPodminky.length ? '' : `Provozní podmínky nasazení: ${deployPodminky.map(p => `${p.popis}${p.kontrola ? ` (kontrola: ${p.kontrola})` : ''}${p.pravidlo ? ` (pravidlo: ${p.pravidlo})` : ''}${p.plati === 'pri-zasahu' ? PRI_ZASAHU : ''}`).join(' | ')}. Vyhodnoť je čtením jako první, před commitem; nesplněná podmínka, která platí vždy, znamená odklad, každou vrať v podminky (popis, vysledek, zmereno) a uveď v zápisu nasazení. ${x.bezZasahu ? `Minulý běh nasazení vrátil odklad bez doloženého zásahu (${x.bezZasahu}): podmínka, která platí jen při zásahu, odkládá jen se zásahem doloženým v poli zasah; ověř zásah teď a bez něj vrať nevztahuje-se a nasaď. ` : ''}`
// Odklad, jehož nesplněné podmínky platí všechny jen při zásahu a žádná zásah nedokládá (spec E3): deploy běží jednou znovu. Vrácená
// podmínka se páruje s podmínkou ze zadání podle popisu, při stejném počtu podle pořadí; nespárovaná platí vždy (odklad zůstává).
const platiPodminky = (p, i, pocet) => (deployPodminky.find(q => textKrit(q.popis) === textKrit(p.popis)) || (pocet === deployPodminky.length ? deployPodminky[i] : null) || { plati: 'vzdy' }).plati
const podminkySPlatnosti = d => { const vse = pole(d && d.podminky).filter(p => p && typeof p === 'object'); return vse.map((p, i) => ({ ...p, plati: platiPodminky(p, i, vse.length) })) }
const odkladBezZasahu = d => {
  if (!d || d.stav !== 'odlozeno') return []
  const nesplnene = podminkySPlatnosti(d).filter(p => p.vysledek === 'nesplneno')
  return nesplnene.length && nesplnene.every(p => p.plati === 'pri-zasahu' && !S(p.zasah).trim()) ? nesplnene : []
}
const deploy = (k, pozn, x = {}) => spust(`${ramec}

Úkol: commit a nasazení řezu ${NN} (běh ${k}). ${podminkyVeta(x)}${x.commitRezu ? `Commit řezu už existuje (${x.commitRezu}): vznikl před dokladem, který nese jeho hash. Nový commit řezu nedělej, pokyny ke commitu řezu níže jsou splněné; v poli commit vrať tento hash a doklad (jen docs/) commitni se zápisem nasazení. ` : ''}Jeden commit na vize větvi: „rez ${NN}: <shrnutí z PRD>“${pozn ? ` (${pozn})` : ''}. Do commitu patří kód řezu, docs/prd/rez-${NN}* a docs/e2e/rez-${NN}* (kromě zápisu nasazení) a sdílené dokumenty běhu (handoff, journal, follow-ups, vize-spory, docs/mereni); rozpracované PRD a scénáře jiných řezů (rez-MM s jiným číslem) nech netrackované, commituje je jejich řez. Build verzi ani marker samostatným commitem nezvedáš (patří do řezu před bránou); když chybí a postup ji vyžaduje, commitni ji spolu s obsahem. ${ZVEDNI} Pole commit je poslední commit „rez ${NN}“ (git log --grep, hash z git rev-parse), i když tento běh nový commit řezu nevytvořil (dorovnání prostředí, jen fix(security)); nikdy commit zápisu nasazení, nikdy dopočítaný ani zkrácený.${x.security && x.security.length ? ` Bezpečnostní opravy řezu: ${secText(x.security)}. Před commitem řezu je commitni samostatně zprávou fix(security): …, když jejich soubory nenesou jinou změnu řezu (git diff souboru ukáže jen opravu); jinak přidej do zprávy commitu řezu řádek fix(security): … a hash toho commitu vrať v security_radkem. Hashe samostatných commitů vrať v security_commity (i když nasazení potom selže).` : ''}${x.predchozi ? ` Předchozí pokus selhal ve fázi „${x.predchozi.faze}“: ${S(x.predchozi.detail).slice(0, 600)}${x.diag ? ` · diagnóza: ${S(x.diag.pricina).slice(0, 400)} · doporučení: ${S(x.diag.doporuceni).slice(0, 300)}` : ''}; nasazení tomu přizpůsob.` : ''}${x.prostredi ? ` E2E hlásí vadu prostředí: ${S(x.prostredi).slice(0, 800)}; dorovnej nasazení tak, aby ji odstranilo (typicky kroky po nasazení z PRD).` : ''} ${x.predDokladem ? 'Řez nese doklad před nasazením: teď jen commitni řez, doklad vznikne nad tímto commitem a nasazení přijde potom; nic nenasazuj, migraci neaplikuj, kroky po nasazení nespouštěj, zápis nasazení nepiš; stav commit-only.' : x.jenCommit ? `Oprava po E2E se nedotkla apps ani packages: jen commitni, nic nenasazuj, kroky po nasazení nespouštěj, zápis nasazení nepiš; stav commit-only.` : deployMode === 'commit-only' || !runtimeDopad ? 'Projekt nasazuje uživatel nebo řez nemá runtime dopad: skonči commitem, stav commit-only.' : `Deploy podle deploy konfigurace projektu${runbook ? ` (runbook: ${runbook})` : ' (sekce Deploy v CLAUDE.md projektu nebo docs/deploy.md)'}: marker docs/.deploy-unlocked vytvoř samostatným příkazem před deployem, počkej na doložený stav platformy (SUCCESS/FAILED) a vrať dva nezávislé doklady, že běží (druhý smí být odložený se změřenou baseline před nasazením, nebo neexistuje s důvodem; pozorovatelný rozdíl nevyráběj akcí v produkci).${deployOkno ? ` Zakázané okno nasazení: ${deployOkno}; když do něj spadáš, počkej do jeho konce a ještě 10 minut rezervy, jen když to celé trvá nejvýš ~60 minut; jinak odklad (níže).` : ''}${appPristup ? ` Pokyny majitele k prostředí a nasazení jsou závazné a mají přednost před skripty repa (skript, který nasazuje jinam nebo jinak, než pokyny říkají, nepoužij nebo doplň o správné parametry): ${appPristup}.` : ''}${dokladPred ? ` Řez nese migraci s dokladem před nasazením: migraci aplikuj jen když existuje ${x.doklad || dokladPath}; bez něj migraci neaplikuj, nic nenasazuj a vrať failed s důvodem „chybí doklad před migrací“.${x.doklad && !x.commitRezu ? ` Doklad vznikl dřív${x.dokladCommit ? ` nad commitem řezu ${x.dokladCommit}` : ' v přerušeném běhu'} a zachycuje stav před prvním zápisem: platí dál, i když řez od té doby dostal další commit.` : ''}` : ''} Co nasadit, urči podle git diff --stat <báze>..HEAD -- apps packages a importů změněných balíčků, nikdy podle diffu jednoho commitu: báze je poslední commit se zprávou „zápis nasazení“ (git log --grep 'zápis nasazení' -1 --format=%H), když žádný není, git merge-base HEAD main; nasaď každou aplikaci, které se diff dotkl, a pole health začni řádkem „aplikace: <app>@<verze nebo deployment id> nasazeno | <app> nenasazeno (<důvod z diffu>) | …“. Když PRD (kostra ${prdPath}) má sekci „Nasazení a kroky po něm“, proveď po nasazení každý krok a vrať ho v kroky_po_nasazeni s číslem kroku z PRD (id), textem kroku a se stavem ${KROKY_STAVY}. ${ZIVY_DEPLOY} ${CERSTVA_ROZHODNUTI}${x.provedene && x.provedene.length ? ` Předchozí nasazení tohoto řezu už provedlo: ${x.provedene.join(' | ').slice(0, 1200)}. Krok, jehož vstup tvoje změna neovlivňuje, znovu nespouštěj a vrať ho jako vynechano s důvodem „provedeno v předchozím nasazení“; krok, kterého se změna týká, proveď znovu.` : ''}${x.dorovnani ? ' Dorovnání: minulý pokus selhal jen na krocích po nasazení a strom se od minulého nasazení nezměnil; nasaď jen to, co diff od báze žádá, a proveď znovu kroky, které selhaly nebo byly vynechány.' : ''}${x.noveKroky && x.noveKroky.length ? ` Oprava po E2E vyžaduje nový krok po nasazení s oporou v Povolení: ${x.noveKroky.map(kr => `${kr.krok} (důvod: ${kr.duvod}; opora: ${kr.opora})`).join(' | ').slice(0, 1200)}. Proveď ho po nasazení v účelu a hranicích citované opory a vrať v kroky_po_nasazeni bez id, s textem kroku a stavem.` : ''} Zápis nasazení zapiš do ${nasazeniPath} (čas, commit řezu, co se nasadilo, doklady, kroky po nasazení; další nasazení téhož řezu připiš pod předchozí) a commitni ho samostatně až po commitu řezu; vrať report_path a commit_zapisu. Do zápisu přidej řádek „Dveře: jednosměrné | obousměrné · Dosah: <web | admin | data | zóna | platforma>“ (jednosměrné, když řez nese doklad před nasazením, migraci, zápis podle Povolení, odeslání zprávy, mazání nebo cokoli, co jeden revert nevrátí) a totéž vrať v dvere a dosah. Pole commit je commit řezu, ne commit zápisu. Selhání mimo kód řezu vrať jako failed s infra: true a infra_trida: clovek, když nápravu udělá jen člověk (přihlášení nebo účet CLI, oprávnění, token, limit tarifu), nebo platforma, když jde o dočasný výpadek platformy (pauza nasazení, 5xx, incident na status stránce; důkaz do duvod). ${ODKLAD}`}${x.zmenyOprav && x.zmenyOprav.length ? ` Změny pracovního stromu z oprav tohoto bloku (soubory: ${x.zmenyOprav.slice(0, 80).join(', ')}${x.zmenyOprav.length > 80 ? ` a dalších ${x.zmenyOprav.length - 80}` : ''}) patří řezu a commitují se s ním. Cizí jsou jen rozpracované soubory jiných řezů (rez-MM).` : ''} Formátovací kontrolu pouštěj jen nad soubory řezu, ne nad celým repem. Nikdy si nedomýšlej postup, který projekt nedokumentuje.`,
  { label: `deploy:řez ${NN}${pz()}:${k}`, phase: x.predDokladem ? 'Doklad' : 'Deploy', agentType: 'dev-pipeline:deploy', schema: DEPLOY, ...M.sonM })

// Doklad před nasazením (jen když ho PRD předepsalo): Sonnet agent pořídí snímek dotčených dat dotazy jen pro čtení
// do docs/e2e/rez-NN-doklad-pred.md; deploy bez toho souboru migraci neaplikuje. V běhu doplneni-webu doklad dvakrát chyběl a dodatečně nešel.
// Doklad vzniká nad commitem řezu (1.12.0, spec J1): dřív běžel před commitem a jeho hlavička nesla commit předchozího řezu a necommitnutý
// strom; u řezu, kde doklad vyrábí kód řezu, ho pak deploy ani E2E nemohly vzít jako doklad commitu řezu.
const doklad = commitRezu => spust(`${ramec}

Úkol: doklad stavu před nasazením řezu ${NN}. PRD (${prdPath}) má sekci „Doklad před nasazením“: pořiď přesně to, co předepisuje (tabulky, počty řádků, vzorky záznamů, kontrolní součty), výhradně dotazy jen pro čtení nad prostředím, do kterého se bude nasazovat${appPristup ? ` (pokyny majitele k prostředí: ${appPristup})` : runbook ? ` (přístup podle runbooku ${runbook})` : ' (přístup podle CLAUDE.md projektu)'}. Pokus ${P}. Doklad vzniká nad commitem řezu ${commitRezu}: git rev-parse HEAD se s ním musí shodovat a git status --porcelain mimo docs/ musí být prázdný; když ne, doklad nepiš a vrať ok: false s důvodem. Zapiš do ${dokladPath}: čas, revize (commit řezu ${commitRezu}), každý dotaz doslova a jeho výsledek; když soubor už existuje (dřívější pokus nebo přerušený běh), nepřepisuj ho (je to stav před prvním zápisem, po migraci ho nikdo nedopočítá) a zapiš vedle ${dokladPath.replace(/\.md$/, '')}-p${P}.md. Cestu, kam jsi zapsal, vrať v path. Nic neměň, nic nemaž, migraci nespouštěj. Když přístup chybí nebo dotaz selže, vrať ok: false s důvodem; doklad si nedomýšlej. Když kterýkoli předepsaný bod dokladu selže, vrať ok: false; text a pole se nesmí rozcházet.`,
  { label: `doklad:řez ${NN}`, phase: 'Doklad', agentType: 'dev-pipeline:doklad', schema: DOKLAD, ...M.sonM })

// E2E kolo 1: skupiny sekcí souběžně (e2eSkupiny). Kolo 2 po opravě přeměřuje jen FAIL kritéria kola 1, ostatní jen smoke.
// Verifikátor kód neověřuje: kritéria [měřidlo] změřila brána (v běhu bez-dluhu si verifikátoři zakládali worktree
// s instalací a pouštěli suitu vedle běžící stavby). Odchylky a rozšířené zásahy oprav dostane předem, protože scénář
// zastaralý po opravě jinak vyrobí FAIL a oprava FAILu chování vrátí (třída J3). Výsledky měřidel brány dostane doslova,
// ne jen cestu k výstupu brány: kritérium [měřidlo] tak nemusí hledat v logu ani měřit znovu.
const meridlaText = o => (o.meridla || []).length ? `; výsledky měřidel: ${o.meridla.join(' | ').slice(0, 800)}` : ''
const e2eProhlizec = (k, o) => spust(`${ramec}

Úkol: E2E verifikace řezu ${NN}, kolo ${k}${o.sekce ? ` (verifikátor ${o.cast} z ${o.pocet}${o.samostatne ? '' : ' souběžných'})` : ''}: projdi scénáře z ${e2ePath} proti běžící aplikaci${appPristup ? ` (přístup: ${appPristup})` : ' (přístup podle CLAUDE.md projektu)'}${o.sekce ? `, ale VÝHRADNĚ sekce: ${o.sekce.join(' | ')}; ${o.samostatne ? 'ostatní sekce už ověřili ostatní verifikátoři a nad aplikací teď běžíš sám' : 'ostatní verifikátoři souběžně ověřují ostatní sekce nad touž aplikací'}, do jejich dat nesahej` : ''}${o.fail ? `. Kolo 2 po opravě: přeměř VÝHRADNĚ kritéria, která v kole 1 selhala: ${o.fail.join(' | ')}; u ostatních kritérií jen ověř, že se jejich plocha načte bez chyby (smoke, jeden krok na plochu), verdikty z kola 1 nepřeměřuj a do seznamů kritérií dej jen přeměřená; smoke selhání vrať ve fail_kriteria s předponou „smoke:“` : ''}, verdikt per kritérium PASS / PASS-částečně / FAIL s důkazy do reportu ${o.report}. ${PASTI_CTI} Nejdřív ověř prostředí: nasazená revize je commit řezu${o.commit ? ` (${o.commit})` : ''} nebo pozdější commit, který od něj mění jen docs/ (zápis nasazení)${o.nasazeni ? `, zápis nasazení ${o.nasazeni},` : ''} a přihlášení ze zadání funguje; když ne, vrať to v poli prostredi_nasazeni a kritéria neměř, nic nenasazuj (nasazení není tvoje fáze) a handoff nečti. Neověřuješ kód: nezakládej worktree, nic neinstaluj, nespouštěj testy ani typecheck. Kritéria označená [měřidlo] změřila brána (report ${o.brana || 'brány tohoto pokusu'}${meridlaText(o)}); do seznamů kritérií je nedávej. Prohlížeč bez okna (bez --headed), na konci agent-browser close.${o.zmeny ? ` Odchylky od PRD a rozšířené zásahy oprav tohoto pokusu: ${o.zmeny}; scénář, který jim odporuje, vrať ve vadna_kriteria s druhem „scénář zastaral po opravě“, ne jako FAIL.` : ''} Čísla a výčty v chování aplikace přepočítej sám dotazem nad nasazenou revizí; hodnotu z PRD, journalu ani souhrnu implementace nepřebírej. Kritérium, které nejde splnit (chybí ti credential, měří se až po uzavíracím commitu), koliduje s jiným kritériem nebo Ne-cílem vize, padá na nálezu, který prokazatelně existoval před řezem a řez ho nemá v rozsahu, nebo jeho neobnovitelný jednorázový zdroj spotřeboval dřívější krok běhu (druh „zdroj spotřebován vlastní chybou“, credential nechybí; zdroj, který se sám obnoví, sem nepatří), vrať ve vadna_kriteria s dokladem druhu, ne jako FAIL; FAIL je jen skutečné selhání implementace. Kritérium, které čeká na běh nebo čas déle než ~30 minut, neměř do konce: změř start a průběh a vrať ho v k_domereni s čtecí kontrolou a časem nejdriv. Stejně kritérium, jehož kvóta platformy (nebo denní pojistka starší vize, kterou majitel potvrdil jako mez) je dnes vyčerpaná: vrať ho v k_domereni (co_bezi = stav meze a co je změřené, kontrola = sekce a kroky scénáře k přeměření, nejdriv = začátek dalšího dne meze), ne ve vadna_kriteria. Vadu čitelnosti, která kritérium neshazuje, vrať v citelnost, ne jako FAIL. Kritérium, jehož měření nejde provést kvůli prostředí (nestálá síť, chyba cizí služby, měřicí stanoviště je tento stroj proti produkci), vrať hned v tomto kole v prostredi s důkazem a návrhem (odkud měřit, nebo přijmout), ne jako FAIL po opakování. FAIL, jehož příčina prokazatelně leží mimo hranici řezu (jiný modul, infrastruktura, cizí služba), nech ve fail_kriteria a připoj k němu pricina_mimo_rez s důkazem. Každé změřené kritérium vrať v právě jednom seznamu (pass_kriteria jen značky, částečná, FAIL, vadná, prostředí, k doměření), počty z nich skládá blok; závažné nálezy mimo kritéria (bezpečnost, data) vrať zvlášť od kosmetických. ${ZIVY_E2E} ${CERSTVA_ROZHODNUTI} Testovací data s prefixem ${o.sekce ? `[E2E-${o.cast}]` : '[E2E]'}, po sobě ukliď.`,
  { label: `e2e:řez ${NN}${pz()}:${k}${o.sekce ? `:${o.cast}` : ''}`, phase: 'E2E', agentType: 'dev-pipeline:e2e-verifier', schema: E2E, ...M.opusM })

// Počty E2E ze seznamů (1.12.0, spec I2, I3): verifikátor vracel čísla celkem, pass, castecne a fail vedle seznamů a blok je sčítal; 18 ze
// 44 návratů stavby mělo castecne jiné než délku seznamu a celkem počítalo kritérium za každou sekci znovu. Zdroj pravdy jsou seznamy:
// každé kritérium (klicKrit) má jeden verdikt a mezi seznamy vyhrává horší. Čísla verifikátora jdou jen do logu rozdílu.
// bez_verdiktu = kritéria, jejichž FAIL blok vyjmul (příčina mimo řez, krok mimo Povolení): čekají na majitele, do celkem patří, do pass ne.
const failText = x => typeof x === 'string' ? x : x && typeof x === 'object' && S(x.kriterium).trim() ? `${S(x.kriterium).trim()}${S(x.selhani).trim() ? `: ${S(x.selhani).trim()}` : ''}` : ''
// Seznamy se zapisují od nejslabšího verdiktu k nejsilnějšímu a pozdější zápis přepisuje: kritérium ve dvou seznamech má horší verdikt
// (fail > vadné > prostředí > doměření > částečně > pass > bez verdiktu).
const mapaE2E = e => {
  const m = new Map()
  const pridej = (xs, verdikt, text = x => x) => { for (const x of pole(xs)) { const k = klicKrit(text(x)); if (k) m.set(k, verdikt) } }
  pridej(e.bez_verdiktu, 'otazka'); pridej(e.pass_kriteria, 'pass'); pridej(e.castecna_kriteria, 'castecne'); pridej(e.k_domereni, 'domereni', x => x && x.kriterium)
  pridej(typeof e.prostredi === 'string' ? [] : e.prostredi, 'prostredi', x => x && x.kriterium); pridej(e.vadna_kriteria, 'vadne'); pridej(e.fail_kriteria, 'fail', failText)
  return m
}
const pocetVerdiktu = (m, v) => [...m.values()].filter(x => x === v).length
// Dvě čísla seznamy nenesou a berou se z návratu verifikátora, jednou a dřív, než blok seznamy upraví: FAIL bez jmen (fail nad počet
// jmenovaných; kolo 2 pak měří všechna) a PASS bez jmen (spec I3: návrat bez pass_kriteria z obnovy z reportu, nebo prázdný seznam při
// hlášeném pass, bere celkem od verifikátora a pass je zbytek po ostatních seznamech).
// FAIL bez jmen se odečítá od počtu jmenovaných položek, ne různých značek: verifikátor, který jedno kritérium vede ve dvou sekcích,
// hlásí fail za každou položku, a odečet značek vyrobil FAIL bez jména (review N1), který zrušil zúžené kolo 2 i uzavření mimo řez.
const bezJmenE2E = e => {
  if (e.fail_bez_jmen != null && e.pass_bez_jmen != null) return e
  const m = mapaE2E(e)
  const failBez = Math.max(0, (Number(e.fail) || 0) - pole(e.fail_kriteria).filter(x => klicKrit(failText(x))).length)
  const bezSeznamu = !Array.isArray(e.pass_kriteria) || (!e.pass_kriteria.length && Number(e.pass) > 0)
  return Object.assign(e, { fail_bez_jmen: failBez, pass_bez_jmen: bezSeznamu ? Math.max(0, (Number(e.celkem) || 0) - m.size - failBez) : 0 })
}
// Přepočítá celkem, pass, castecne a fail ze seznamů; castecna_kriteria a pass_kriteria nechá bez duplicit a jen s kritérii, kterým verdikt
// zůstal. S kdo zaloguje rozdíl proti číslům verifikátora (jen u návratu, který blok ještě nepočítal).
const spoctiE2E = (e, kdo = '') => {
  const hlaseno = kdo && !e.spocteno ? ['celkem', 'pass', 'castecne', 'fail'].map(f => [f, Number(e[f]) || 0]) : []
  bezJmenE2E(e)
  const m = mapaE2E(e)
  const pocty = { celkem: m.size + e.fail_bez_jmen + e.pass_bez_jmen, pass: pocetVerdiktu(m, 'pass') + e.pass_bez_jmen, castecne: pocetVerdiktu(m, 'castecne'), fail: pocetVerdiktu(m, 'fail') + e.fail_bez_jmen }
  const rozdil = hlaseno.filter(([f, n]) => n !== pocty[f]).map(([f, n]) => `${f} ${n}, seznamy ${pocty[f]}`)
  if (rozdil.length) log(`${kdo}: čísla verifikátora nesedí se seznamy kritérií (${rozdil.join('; ')}); platí seznamy`)
  if (hlaseno.length && e.pass_bez_jmen) log(`${kdo}: návrat bez pass_kriteria, ${e.pass_bez_jmen} PASS bez jmen podle čísla celkem`)
  const jen = (xs, verdikt) => bezDuplicit(trimList(xs), klicKrit).filter(x => m.get(klicKrit(x)) === verdikt)
  return Object.assign(e, pocty, { castecna_kriteria: jen(e.castecna_kriteria, 'castecne'), ...(Array.isArray(e.pass_kriteria) ? { pass_kriteria: jen(e.pass_kriteria, 'pass') } : {}), spocteno: true })
}
// Každý návrat se spočítá zvlášť (log rozdílu, FAIL a PASS bez jmen); kritérium jmenované dvěma skupinami se ve složeném výsledku počítá
// jednou, s horším verdiktem.
const mergeE2E = (parts, report, kdo = 'E2E') => {
  const ps = parts.filter(Boolean)
  if (!ps.length) return null
  const sp = parts.map((p, i) => p ? spoctiE2E({ ...p }, p.preneseno ? '' : `${kdo} verifikátor ${PISMENA[i]}`) : null).filter(Boolean)
  const sum = f => sp.reduce((n, p) => n + (Number(p[f]) || 0), 0)
  const cat = f => ps.flatMap(p => p[f] || [])
  return spoctiE2E({ vysledek: 'fail', fail_bez_jmen: sum('fail_bez_jmen'), pass_bez_jmen: sum('pass_bez_jmen'), spocteno: true,
    fail_kriteria: cat('fail_kriteria'), castecna_kriteria: cat('castecna_kriteria'), pass_kriteria: cat('pass_kriteria'), vadna_kriteria: cat('vadna_kriteria'),
    prostredi: cat('prostredi'), mimo_rez: cat('mimo_rez'), citelnost: cat('citelnost'), k_domereni: cat('k_domereni'),
    zavazne_mimo_ak: cat('zavazne_mimo_ak'), kosmeticke: cat('kosmeticke'), report_path: report, prostredi_nasazeni: ps.map(vadaNasazeni).filter(Boolean).join(' | ') })
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
    if (chybi.length) return { chybi: chybi.map(i => nic(`e2e:řez ${NN}${pz()}:${k}:${PISMENA[i]}`, `verifikátor ${PISMENA[i]}`)).join('; ') }
    vys.forEach((r, i) => { if (!r.preneseno && zeleny(r)) e2eZelene.set(i, r) })
    return { ...mergeE2E(vys, vys.map(x => x.report_path).filter(Boolean).join(' + '), `E2E ${k}`), prenesene_sekce: [...prenos].flatMap(i => e2eSkupiny[i]) }
  }
  return e2eProhlizec(k, { ...o, report: rep('e2e', k) })
}
// Proč E2E nemá výsledek (prázdné = má): celé bez výsledku, skupina bez výsledku, nebo strop předávek.
const e2eNic = (e, k) => e && !e.chybi ? '' : e ? e.chybi : nic(`${runtimeDopad ? 'e2e' : 'kriteria'}:řez ${NN}${pz()}:${k}`, 'verifikátor')

const e2eKriteria = (k, o) => spust(`${ramec}

Úkol: řez ${NN} nemá runtime dopad. Projdi akceptační kritéria z PRD (${prdVse}) bod po bodu a každé dolož konkrétním důkazem (výstup příkazu, existence a obsah souboru, spuštěný test), verdikt per kritérium do ${rep('e2e', k)}. Kritéria označená [měřidlo] změřila brána (report ${o.brana || 'brány tohoto pokusu'}${meridlaText(o)}): znovu je nespouštěj a do seznamů kritérií je nedávej. Čísla a výčty přepočítej sám nad odevzdávaným stromem; hodnotu ze souhrnu implementace nepřebírej. Kritérium nesplnitelné před uzavíracím commitem, kolidující s jiným kritériem nebo Ne-cílem vize, nebo padající na předřezovém nálezu mimo rozsah řezu vrať ve vadna_kriteria s dokladem druhu, ne jako FAIL.${o.zmeny ? ` Odchylky od PRD a rozšířené zásahy oprav tohoto pokusu: ${o.zmeny}; kritérium, které jim odporuje, vrať ve vadna_kriteria s druhem „scénář zastaral po opravě“, ne jako FAIL.` : ''} Dočasné artefakty po sobě ukliď, pracovní strom nech čistý. Každé kritérium vrať v právě jednom seznamu (pass_kriteria jen značky, částečná, FAIL, vadná), počty z nich skládá blok.`,
  { label: `kriteria:řez ${NN}${pz()}:${k}`, phase: 'E2E', agentType: 'general-purpose', schema: E2E, ...M.opusM })

// Kolo 2 měřilo jen FAIL kritéria kola 1 (+ smoke): výsledné počty se skládají z obou kol. Závažné nálezy a kosmetika kola 1
// se nesmí ztratit (kolo 2 je jen smoke), jinak bezpečnostní nález z kola 1 zmizí bez opravy; kolečko je skládá stejně.
const bezDuplicit = (xs, klic) => { const v = new Map(); for (const x of xs) v.set(klic(x), x); return [...v.values()] }
// Návrat bloku drží limit i s desítkami položek čitelnosti (seznamy doLimitu by jinak ustoupily první rozhodnutí); celé jsou v souboru výsledku.
const MAX_CITELNOST_NAVRAT = 8
const citelnostZ = (e1, e2) => bezDuplicit([...pole(e1.citelnost), ...pole(e2.citelnost)], x => textKrit(`${S(x && x.plocha)}|${S(x && x.co)}`))
const domereniZ = (e1, e2) => bezDuplicit([...pole(e1.k_domereni), ...pole(e2.k_domereni)], x => klicKrit(x && x.kriterium))
const zKola1 = (e1, e2) => ({ zavazne_mimo_ak: trimList([...(e1.zavazne_mimo_ak || []), ...(e2.zavazne_mimo_ak || [])]), kosmeticke: trimList([...(e1.kosmeticke || []), ...(e2.kosmeticke || [])]), citelnost: citelnostZ(e1, e2), k_domereni: domereniZ(e1, e2) })
// Verdikt kola 2 přepisuje FAIL kola 1 (spec I2); ostatní verdikty kola 1 platí dál (kolo 2 u nich dělá jen smoke) a mezi koly u nich
// vyhrává horší. Seznamy kola 1 proto jdou dál bez kritérií, která v něm selhala, a FAIL nese jen kolo 2. FAIL kola 1, který kolo 2
// nejmenuje v žádném seznamu, se bez FAIL v kole 2 počítá jako pass (jako dřív podle čísla fail kola 2) a log ho jmenuje; kritérium
// vyjmuté kvůli kroku mimo Povolení se neměřilo a čeká na majitele (bez_verdiktu).
const slozE2E = (e1, e2, vyjmuta = []) => {
  const k2 = spoctiE2E({ ...e2 }, 'E2E 2')
  const m1 = mapaE2E(e1), klice2 = [...mapaE2E(k2).keys()]
  const vKole2 = fk => klice2.some(x => stejneKrit(x, fk))
  const neFail = t => m1.get(klicKrit(t)) !== 'fail'
  const fail1 = trimList(e1.fail_kriteria)
  const mlcky0 = fail1.filter(fk => !vyjmuta.includes(fk) && !vKole2(fk))
  // Čísla kola 2 bez jmen patří kritériím, která kolo 2 nejmenuje, tedy mlčky přeměřeným FAIL kola 1 (ostatní kritéria nesou verdikt
  // kola 1). Přičíst k nim ještě mlčky jako pass počítalo totéž kritérium dvakrát (review N3: 9/9 pro 8 kritérií). FAIL bez jmen kola 2
  // platí celý (FAIL se neztratí), PASS bez jmen jen do počtu mlčky přeměřených, které FAIL nepokryl; zbytek mlčky je pass jako dřív.
  const failKryje = Math.min(k2.fail_bez_jmen, mlcky0.length), passKryje = Math.min(k2.pass_bez_jmen, mlcky0.length - failKryje)
  const mlcky = mlcky0.slice(failKryje + passKryje)
  if (failKryje + passKryje) log(`E2E 2: ${mlcky0.length} kritérií, která v kole 1 selhala, kolo 2 nejmenuje; ${failKryje + passKryje} z nich nesou čísla kola 2 bez jmen (fail ${failKryje}, pass ${passKryje})`)
  if (mlcky.length) log(`E2E 2: verifikátor nevrátil verdikt u ${mlcky.length} kritérií, která v kole 1 selhala (${mlcky.join(' | ').slice(0, 300)}); bez FAIL v kole 2 se počítají jako pass`)
  // Kritéria prostředí a doměření z kola 1 se v kole 2 neměří (nestojí pokus), nesou se dál.
  return spoctiE2E({ ...e2, ...zKola1(e1, e2), fail_bez_jmen: k2.fail_bez_jmen, pass_bez_jmen: (Number(e1.pass_bez_jmen) || 0) + passKryje, spocteno: true,
    vadna_kriteria: trimList([...pole(e1.vadna_kriteria).filter(neFail), ...pole(e2.vadna_kriteria)]), prostredi: [...pole(e1.prostredi).filter(x => neFail(x && x.kriterium)), ...pole(e2.prostredi)],
    k_domereni: domereniZ({ k_domereni: pole(e1.k_domereni).filter(x => neFail(x && x.kriterium)) }, e2), castecna_kriteria: [...pole(e1.castecna_kriteria), ...pole(e2.castecna_kriteria)],
    pass_kriteria: [...pole(e1.pass_kriteria), ...mlcky.map(fk => znackaKrit(fk) || fk), ...pole(e2.pass_kriteria)], bez_verdiktu: [...pole(e1.bez_verdiktu), ...fail1.filter(fk => vyjmuta.includes(fk) && !vKole2(fk))],
    mimo_rez: pole(e2.mimo_rez), prostredi_nasazeni: vadaNasazeni(e2), prenesene_sekce: trimList([...pole(e1.prenesene_sekce), ...pole(e2.prenesene_sekce)]),
    report_path: [e1.report_path, e2.report_path].filter(Boolean).join(' + ') })
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

Úkol: E2E řezu ${NN} selhalo (kolo ${k}): report ${e.report_path}, FAIL kritéria: ${(e.fail_kriteria || []).join(' | ') || `${e.fail} bez jmen, viz report`}. Každý nález je hypotéza: reprodukuj, oprav příčinu, testy a typecheck zelené${rychleText ? `; spusť i rychlé kontroly nad celým stromem: ${rychleKontroly}` : ''}. Operaci nad platformou nebo živým systémem, kterou oprava vyžaduje a PRD ji v krocích po nasazení nejmenuje, sám neprováděj ani nepřipravuj v konfiguraci: vrať ji v novy_krok_po_nasazeni s důvodem, kritériem a oporou (doslovná citace Povolení z PRD nebo rozhodnutí majitele, do jehož účelu a hranic krok spadá; počet zápisů oporu neruší, krok mimo účel nebo hranice nech bez opory a rozhodne o něm majitel). ${CERSTVA_ROZHODNUTI} Necommituj, commit a deploy dělá další krok; oprava jde před nasazením přes review.${standardy}`,
  { label: `fix-e2e:řez ${NN}:${k}`, phase: 'E2E', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

// Bezpečnostní fix agent necommituje: v běhu bez-dluhu (řez 23) tvrdil commit, který nevznikl, a blok to nepoznal.
// Opravu projde brána a commitne ji deploy samostatně.
const fixSecurity = e => spust(`${ramec}

Úkol: E2E řezu ${NN} našlo závažné nálezy mimo kritéria (bezpečnost/data): ${(e.zavazne_mimo_ak || []).join(' | ')} · report ${e.report_path}. Oprav je, i když jsou mimo rozsah řezu. Necommituj; bezpečnostní opravu commitne deploy samostatně. Vrať security: true a v zmenena_mista, co oprava mění. Bez jasného fixu nález nech jako follow-up s důvodem.${standardy}`,
  { label: `fix-security:řez ${NN}`, phase: 'E2E', agentType: 'dev-pipeline:fix', schema: FIX, ...M.opusM })

// Čitelnost z E2E (1.11.0, spec D1) stavba od 1.12.0 neopravuje (spec N1): opravná cesta bez pokusu běžela u 38 ze 44 řezů, stála 22 h a polovinu
// jejího času dělala plná brána kvůli pár větám. Položky jdou do follow-ups ve tvaru „čitelnost: <plocha>: <co> (<proč>)“ a opraví je várky
// čitelnosti ve vlně dluhu kolečka, které je podle začátku textu „čitelnost:“ sbírají.
const citelnostText = xs => pole(xs).map(x => `${S(x.plocha).trim()}: ${S(x.co).trim()}${S(x.proc).trim() ? ` (${S(x.proc).trim()})` : ''}`)

const diagnose = last => spust(`${ramec}

Úkol: řez ${NN} dvakrát funkčně selhal, naposledy ve fázi „${last.faze}“: ${S(last.detail).slice(0, 800)}. Postav těsnou reprodukční smyčku a najdi doloženou příčinu; nic neopravuj, pracovní strom vrať do stavu, v jakém jsi ho našel. Vrať příčinu (file:line + mechanismus) a doporučení pro třetí pokus. Když příčinou je samo kritérium, ne kód (nejde splnit žádným kódem, který PRD dovoluje; například práh nad celou populací nebo nad mechanismem, který hodnotu omezuje), vrať i vada_kriteria s kritériem, druhem, důkazem a návrhem: třetí pokus pak ${last.krokSelhal ? 'nenasazuje' : 'neběží'} a kritérium jde majiteli.`,
  { label: `diagnose:řez ${NN}`, phase: 'Diagnóza', agentType: 'dev-pipeline:diagnose', schema: DIAG, ...M.opusH })

// Seznam do zadání uzavření jde celý: položky jednotlivě oříznuté na 600 znaků, nikdy celek uprostřed položky (běh web-podzim:
// follow-upy useknuté na 2 500 znaků, do docs/follow-ups.md se dostala čtvrtina; odchylky useknuté ve 13 ze 14 řezů).
const celySeznam = xs => JSON.stringify(pole(xs).map(x => { const t = typeof x === 'string' ? x : JSON.stringify(x); return t.length > 600 ? `${t.slice(0, 599)}…` : t }))
// Uzavření ověří commit řezu a bezpečnostní commity podle gitu (pole commit bylo v běhu bez-dluhu jen 4× z 24 commitem řezu).
// Seznamy zastaveného běhu téhož bloku (1.7.0): uzavření obnovy je připojí, jinak by se ztratily s přepsaným výsledkem.
const zastavenoPath = `docs/.vysledek-stavba-${NN}-zastaveno.json`
const ZASTAVENE_SEZNAMY = `Když existuje ${zastavenoPath}, připoj jeho seznamy ke svým s deduplikací podle textu.`
// Krok pastí ověřování v uzavření (spec K4): běžné uzavření i uzavření selhaného bloku (review N4 dávky 2b), když blok zaznamenal FAIL nebo
// prostředí z E2E. Past, kvůli které řez spadl na E2E ve všech pokusech, by jinak příští ověřovatel objevoval znovu.
const krokPasti = (sel, bod) => sel.kriteria.length ? ` (${bod}) Pasti ověřování: E2E řezu mělo FAIL nebo kritéria zastavená prostředím (${celySeznam(sel.kriteria)}${sel.reporty.length ? `; reporty ${sel.reporty.join(', ')}` : ''}). Příčinu, kterou by příští ověřovatel nebo autor PRD objevoval znovu, dopiš do ${PASTI_PATH} jedním řádkem „příznak → co s tím [řez ${NN}]“; jednorázovou vadu kódu nepiš, u opakované pasti jen připiš řez. Když stránka neexistuje a máš co zapsat, založ ji.` : ''
const closeZastaveno = s => spust(`${ramec}

Úkol: uzavření ZASTAVENÉHO bloku řezu ${NN} (režim zastaveno): blok se zastavil ve fázi ${s.faze} (${S(s.detail).slice(0, 400)}) a čeká na obnovu. Zapiš do ${cwd}/${zastavenoPath} tento JSON, beze změny a bez zkracování: ${JSON.stringify({ rez: NN, vysledek: 'zastaveno', pokusy: P, faze: s.faze, ...dvereDosah(), follow_ups: s.follow_ups, odchylky: s.odchylky, pasti_opravene: s.pasti, odmitnute: s.odmitnute, bez_review: bezReview.slice(0, 8), review: s.review, thermo: s.thermo, casti: stavCasti().map(c => ({ ...c, zrevidovano: castiStav.get(c.id).zrevidovano })), prostredi: prostrediStav, e2e_selhani: e2eSelhani })}. Když soubor už existuje (blok se zastavil podruhé), jeho follow_ups, odchylky, pasti_opravene a odmitnute zachovej a položky z JSON k nim připoj s deduplikací podle textu; ostatní pole přepiš z JSON. Cestu vrať ve vysledek_soubor (když zápis selže, nech pole prázdné a důvod napiš do poznamka). Nic jiného nedělej: journal, follow-ups, PRD ani kód neměň, necommituj.`,
  { label: `uzavření:řez ${NN}:zastaveno`, phase: 'Uzavření', agentType: 'dev-pipeline:uzavreni', schema: ZASTAVENO, ...M.sonL })

const close = s => spust(`${ramec}

Úkol: uzavření řezu ${NN}. (0) Ověř commit řezu: git cat-file -t ${s.commit} musí vrátit commit a zpráva commitu nese „rez ${NN}“; když ne, najdi skutečný commit řezu (git log --grep) a vrať ho v commit_overeny; hash nikdy nedopočítávej.${s.security.length ? ` Totéž pro bezpečnostní commity ${s.security.join(', ')}: neexistující vrať v chybejici_commity.` : ''} (1) PRD frontmatter${sCastmi ? ' kostry' : ''}: status: done, commit: ověřený commit řezu z bodu 0. (2) Srovnej PRD (${prdVse}) a E2E scénáře s tím, co se skutečně postavilo; odchylky: ${celySeznam(s.odchylky)}. Dokument nesmí tvrdit něco jiného než kód; uprav dotčené věty.${s.vadna.length ? ` Vadná kritéria podle E2E (${celySeznam(s.vadna)}): u každého nech text kritéria, připiš „VADNÉ KRITÉRIUM: <doklad>; čeká na rozhodnutí majitele“ a zapiš záznam do docs/vize-spory.md s navrženou odpovědí.` : ''}${s.prostredi.length ? ` Kritéria a části zastavené prostředím (${celySeznam(s.prostredi)}): u každého kritéria nech text, připiš „PROSTŘEDÍ: <důkaz>; čeká na rozhodnutí majitele (návrh: <návrh>)“ a zapiš do docs/vize-spory.md záznam ve tvaru otázky s navrženou odpovědí (tvar: ${tvar}, sekce Vize-spory); pokus to nestojí.` : ''}${s.mimoRez.length ? ` FAIL kritéria s příčinou mimo hranici řezu (${celySeznam(s.mimoRez)}): u každého nech text, připiš „MIMO ŘEZ: <důkaz>; čeká na rozhodnutí majitele“ a zapiš do docs/vize-spory.md otázku s navrženou odpovědí.` : ''}${s.prenesene.length ? ` Sekce E2E přenesené z dřívějšího kola bez přeměření (oprava se jich netýkala): ${celySeznam(s.prenesene)}; uveď je v journalu.` : ''}${s.kDomereni.length ? ` Kritéria čekající na doměření (${celySeznam(s.kDomereni)}): u každého nech text, připiš „K DOMĚŘENÍ: <co běží>; ověří orchestrátor od <nejdriv> příkazem <kontrola>“ a uveď je v journalu.` : ''} (3) Doklady: když PRD nebo vize předepisuje artefakt v repu jako doklad řezu (měření, export, report), ověř, že existuje a je v ověřeném commitu řezu (git show --stat); chybějící vrať v chybejici_doklady. (4) Thermo: ${s.thermo_paths.length ? `projdi v ${s.thermo_paths.join(', ')} nálezy BLOCKER a HIGH a u každého urči podle kódu, zda je opraven, nebo zůstává; neopravený zapiš do follow-ups s odvozením (nález, proč zůstal); počet bez obojího vrať v thermo_nesesouhlaseno.` : 'thermo bez nálezů, thermo_nesesouhlaseno: 0.'} (5) Připoj do docs/journal.md heredocem záznam: datum, řez, co je hotové, odchylky, pokusy ${s.pokusy}, E2E ${s.e2e}, review ${s.review}, thermo ${s.thermo}; odmítnuté nálezy s důvodem: ${s.odmitnute.length ? celySeznam(s.odmitnute) : 'žádné'}${s.jinak.length ? `; opravy jinou příčinou, než nález tvrdil: ${celySeznam(s.jinak)}` : ''}; výsledky měřidel brány: ${s.meridla.length ? celySeznam(s.meridla) : 'žádná měřidla'}; kroky po nasazení: ${s.kroky.length ? celySeznam(s.kroky) : 'žádné'}; předávky bloku stavby: ${s.predavky} (ze zadání); z docs/.kontext.jsonl (když existuje) záznamy řezu ${NN}: nejvyšší hodnota podle typu agenta, počet compactů a předávky řezu ve všech blocích (záznamy udalost „predavka“, log); obě čísla předávek zapiš do journalu s popiskem a nesrovnávej je (log počítá i blok PRD a obnovu); v poli kontext vrať jen nejvyšší hodnotu podle typu agenta, počet compactů a čtení, počty předávek sem nepiš. (6) Připoj do docs/follow-ups.md pod nadpis „## Řez ${NN} <název řezu z PRD>“ (založ ho jen pro tento řez, cizí nadpisy neměň) tyto položky (jedna odrážka = jedna, s kontextem; každá začíná značkami „[řez ${NN} · <oblast>] [<osud>]“, které položky už nesou: oblast „obecné“ nebo „review“ nahraď modulem nebo plochou ze slovníku projektu, osud (rozhodnutí | oprava | nápad | obsah) nech, chybí-li, doplň a text položky s osudem rozhodnutí začni „rozhodne majitel:“ nebo „rozhodne orchestrátor:“, když ho nenese, obojí podle ${tvar}, sekce Follow-ups): ${celySeznam(s.follow_ups)}. Položka „<id> (FOLLOW-UP z <report>)“ je nález code-review k odložení: text a kontext vezmi z reportu. Položku „zlevnit stráž: <test>“ vynech, když ji follow-ups pro tentýž test už otevřenou nesou. ${ZASTAVENE_SEZNAMY}${krokPasti(s.e2eSelhani, '6b')} (7) Po zápisu spusť kontroly pre-commit hooku projektu, které míří na dokumenty běhu v docs/ (follow-ups, journal)${rychleKontroly ? `, a rychlé kontroly nad celým stromem: ${rychleKontroly}` : ''}; text oprav, dokud neprojdou. Smaž docs/.deploy-unlocked, když existuje. (8) Pusť formátovač projektu na dotčené docs/*.md, když ho projekt má. (9) Zapiš do ${cwd}/docs/.vysledek-stavba-${NN}.json (soubor celý přepiš) přesně tento JSON, beze změny a bez zkracování: ${JSON.stringify(s.vysledek)}; cestu vrať ve vysledek_soubor (když zápis selže, nech pole prázdné). Necommituj (commituje další řez), do kódu nesahej.`,
  { label: `uzavření:řez ${NN}`, phase: 'Uzavření', agentType: 'dev-pipeline:uzavreni', schema: CLOSE, ...M.sonM })
// Uzavření selhaného bloku (režim selhání, 1.6.0): seznamy všech pokusů zapíše agent uzavření, ne orchestrátor z notifikace, která
// by je useknula (review 1.6.0 N3). Commit řezu se neověřuje, PRD status se nemění.
const closeSelhani = s => spust(`${ramec}

Úkol: uzavření SELHANÉHO bloku řezu ${NN} (režim selhání): řez selhal ve fázi ${s.faze} po ${s.pokusy} pokusech: ${S(s.detail).slice(0, 600)}${s.diag ? ` · diagnóza: ${S(s.diag).slice(0, 400)}` : ''}. Commit řezu neověřuj, PRD status neměň, thermo nesesouhlasuj, do kódu nesahej. (1) Připoj do docs/journal.md heredocem záznam: datum, řez ${NN}, „selhal ve fázi ${s.faze}“ s detailem, pokusy ${s.pokusy}; odchylky od PRD: ${celySeznam(s.odchylky)}; opravené pasti: ${celySeznam(s.pasti)}; odmítnuté nálezy s důvodem: ${s.odmitnute.length ? celySeznam(s.odmitnute) : 'žádné'}.${s.prostredi.length ? ` Kritéria a části zastavené prostředím (${celySeznam(s.prostredi)}): zapiš do docs/vize-spory.md otázku s navrženou odpovědí (tvar: ${tvar}, sekce Vize-spory).` : ''} (2) Připoj do docs/follow-ups.md pod nadpis „## Řez ${NN} <název řezu z PRD>“ (založ ho jen pro tento řez) tyto položky (jedna odrážka = jedna, s kontextem; každá začíná značkami „[řez ${NN} · <oblast>] [<osud>]“, které položky už nesou: oblast „obecné“ nebo „review“ nahraď modulem nebo plochou ze slovníku projektu, osud (rozhodnutí | oprava | nápad | obsah) nech, chybí-li, doplň a text položky s osudem rozhodnutí začni „rozhodne majitel:“ nebo „rozhodne orchestrátor:“, když ho nenese, obojí podle ${tvar}, sekce Follow-ups): ${celySeznam(s.follow_ups)}. Položka „<id> (FOLLOW-UP z <report>)“ je nález code-review k odložení: text a kontext vezmi z reportu. ${ZASTAVENE_SEZNAMY}${krokPasti(s.e2eSelhani, '2b')} (3) Po zápisu spusť kontroly pre-commit hooku projektu nad dokumenty běhu v docs/ (follow-ups, journal)${rychleKontroly ? `, a rychlé kontroly nad celým stromem: ${rychleKontroly}` : ''}; text oprav, dokud neprojdou. Pusť formátovač projektu na dotčené docs/*.md, když ho projekt má. (4) Zapiš do ${cwd}/docs/.vysledek-stavba-${NN}.json (soubor celý přepiš) přesně tento JSON, beze změny a bez zkracování: ${JSON.stringify(s.vysledek)}; cestu vrať ve vysledek_soubor (když zápis selže, nech pole prázdné). Necommituj. commit_overeny nech prázdné, thermo_nesesouhlaseno 0, chybejici_doklady prázdné; kontext z docs/.kontext.jsonl pro řez ${NN} jako u běžného uzavření (bez počtů předávek).`,
  { label: `uzavření:řez ${NN}:selhání`, phase: 'Uzavření', agentType: 'dev-pipeline:uzavreni', schema: CLOSE, ...M.sonM })

// ---------- obnova: stav přerušeného běhu ----------
// Deploy agent v režimu obnova-stav: provedené kroky po nasazení a shoda HEAD s commitem řezu ze zápisu nasazení. Běží jednou za blok:
// bez bez_cache líně na hranici obnovy (aktivujObnovu), aby nezlomil prefix cache; s bez_cache hned na začátku přerušeného pokusu
// a nad nasazeným commitem s doloženým nasazením se implementace, review a brána toho pokusu přeskočí (preskoc). Obnova podle stavu
// (řez s částmi od deploye a dál, 1.10.0) ho volá taky hned a přeskakuje nad zelenou bránou nad dnešním pracovním stromem.
let obnovaStavOk = false, obnovaStavBezi = null
// Kam obnova podle stavu skočí (deploy, e2e, uzavreni) a stav, ze kterého blok skok skládá (commit řezu, E2E přerušeného běhu).
let skokObnovy = '', stavZObnovy = null
// Review, thermo a části zastaveného běhu (1.11.0, spec B5): pokus, který je přeskočí, je převezme, jinak řez 19a vypadal jako bez review.
let revizeZObnovy = null
function prevezmiRevizi() {
  if (!revizeZObnovy) return
  const x = revizeZObnovy, r = x.review || {}, t = x.thermo
  revizeZObnovy = null
  const c = k => Number(r[k]) || 0
  revizeDrive.push({ ths: t ? [{ nalezu: Number(t.nalezu) || 0, blokeru: Number(t.blokeru) || 0, report_path: trimList(t.reporty).join(', ') }] : [], kola: c('kola'), nalezu: c('nalezu'), blokujicich: c('blokujicich'), fixAgentu: c('fix_agentu'), thermoFix: !!t && t.oprava === 'samostatně', odmitnute: [], jinak: [] })
  // Část zastavená prostředím se ani po obnově nestaví a její otázka pro majitele nesmí zmizet; revize jen u části, kterou review opravdu posoudilo.
  for (const y of pole(x.prostredi)) if (y && typeof y === 'object') pridejProstredi(y)
  for (const y of pole(x.casti)) {
    const st = y && castiStav.get(S(y.id))
    if (st && y.hotovo === true) { st.hotovo = true; st.zrevidovano = y.zrevidovano === true; st.prostredi = y.prostredi === true }
    else if (st && y.prostredi === true) { st.prostredi = true; zastavene.set(S(y.id), S(y.id)) }
  }
  if (sCastmi && casti.every(y => castiStav.get(y.id).hotovo)) { kontraktHotovo = true; integraceHotovo = true }
  log(`obnova: revize zastaveného běhu převzata (${c('kola')} kol, ${c('nalezu')} nálezů${t ? `, thermo ${Number(t.nalezu) || 0}` : ''}${pole(x.casti).length ? `, ${pole(x.casti).filter(y => y && y.hotovo === true).length} hotových částí` : ''})`)
}
function zjistiObnovaStav() {
  if (!obnovaStavBezi) obnovaStavBezi = zjistiObnovaStavTed()
  return obnovaStavBezi
}
async function zjistiObnovaStavTed() {
  const os = await runSePredavkou(`${ramec}

Úkol: stav obnovy řezu ${NN}, značka ${obnovaZnacka} (režim obnova-stav, nic neměníš, nic nenasazuješ): přečti zápisy nasazení ${cwd}/docs/e2e/rez-${NN}-nasazeni*.md a ${cwd}/${zastavenoPath}, když existují. Vrať commit řezu ze zápisu nasazení (git rev-parse, nikdy dopočítaný), zda git rev-parse HEAD je tento commit nebo pozdější commit měnící jen docs/, zda zápis dokládá úspěšné nasazení tohoto commitu, a kroky po nasazení, které přerušený běh vyřídil se stavem provedeno nebo nevztahuje-se (s číslem kroku z PRD a se stavem). Bez zápisu vrať head_shodny false a nasazeni_dolozeno false. Nezávisle na zápisu vrať commit_pokusu (poslední commit „rez ${NN}“ podle git log --grep, git rev-parse; když žádný není, prázdné), brana_nad_head: true jen když ${cwd}/docs/.verify-passed existuje a jeho pole tree se rovná výstupu \`bash ${a.plugin_root ? `${a.plugin_root}/scripts/tree-hash.sh` : 'scripts/tree-hash.sh pluginu dev-pipeline'} ${cwd}\` (dnešní pracovní strom i s necommitnutými změnami), strom_cisty (git status --porcelain mimo docs/ prázdný), doklad_pred (cesta k ${cwd}/docs/e2e/rez-${NN}-doklad-pred.md, když existuje), bez_review, review, thermo, casti a prostredi ze souboru zastaveného běhu beze změny, dvere a dosah z řádku „Dveře: … · Dosah: …“ posledního zápisu nasazení a e2e: verdikt a počty E2E posledního nasazení řezu, jen když jeho report existuje, i s jeho vadami čitelnosti v citelnost.`,
    { label: `obnova-stav:řez ${NN}`, phase: 'Vstup', agentType: 'dev-pipeline:deploy', schema: OBNOVA_STAV, ...M.sonL })
  if (os) {
    // Provedené kroky jen když se deploy přeměřuje (od_faze ≤ deploy): jinak jde deploy přerušeného pokusu z cache a jeho prompt se nesmí změnit.
    if (FAZE_OBNOVY.indexOf('deploy') >= obnovaOd) zapisProvedene({ kroky_po_nasazeni: pole(os.provedene_kroky).filter(k => k && S(k.krok).trim()).map(k => ({ ...k, stav: k.stav === 'nevztahuje-se' ? 'nevztahuje-se' : 'provedeno' })) })
    // Doklad před migrací z přerušeného běhu platí dál (pokus po obnově by jinak pořídil nový doklad až po migraci); commity bez review
    // zastaveného běhu jdou do návratu obnovy.
    if (dokladPred && !dokladCesta && S(os.doklad_pred).trim()) { dokladCesta = S(os.doklad_pred).trim(); log(`obnova: doklad před migrací z přerušeného běhu platí (${dokladCesta}), znovu se nepořizuje`) }
    for (const x of pole(os.bez_review)) if (x && typeof x === 'object') pridejBezReview(x.commit, S(x.popis))
    // FAIL a prostředí z E2E přerušeného běhu pro krok pastí v uzavření (review N3 dávky 2b): stav modulu obnovu nepřežije.
    if (os.e2e_selhani && typeof os.e2e_selhani === 'object') zapisSelhaniE2E(pole(os.e2e_selhani.kriteria), pole(os.e2e_selhani.reporty).join(' + '))
    if ((os.review && typeof os.review === 'object' && Object.keys(os.review).length) || (os.thermo && typeof os.thermo === 'object' && Object.keys(os.thermo).length) || pole(os.casti).length || pole(os.prostredi).length) revizeZObnovy = { review: os.review, thermo: os.thermo && Object.keys(os.thermo).length ? os.thermo : null, casti: os.casti, prostredi: os.prostredi }
    const nasazenoHead = os.head_shodny === true && os.nasazeni_dolozeno === true
    // Doklad pro přeskočení fází před deployem: bez_cache nasazený commit řezu (jako 1.9.0), obnova podle stavu zelená brána nad dnešním
    // pracovním stromem (commit k tomu potřeba není; deploy commitne, co chybí). Od E2E a uzavření stačí nasazený HEAD a čistý strom
    // (1.11.0, spec B3): marker přestal sedět po uzavření předchozího řezu a řez 16 přehrál review (20 agentů, $22).
    obnovaStavOk = obnovaPodleStavu ? os.brana_nad_head === true || (obnovaOdPuvodni > DEPLOY_I && nasazenoHead && os.strom_cisty === true) : nasazenoHead
    if (obnovaPodleStavu && obnovaStavOk) {
      const puvodni = FAZE_OBNOVY[obnovaOdPuvodni]
      // Rovnou na uzavření jen nad čistým E2E (pass nebo pass-castecne, bez FAIL a bez vadných kritérií): vadné kritérium nebo prostředí musí
      // jít majiteli jako otázka a to zajistí jen nové E2E.
      const e2eHotove = !!(os.e2e && typeof os.e2e === 'object' && ['pass', 'pass-castecne'].includes(os.e2e.vysledek) && Number(os.e2e.celkem) > 0 && !(Number(os.e2e.fail) > 0) && !trimList(os.e2e.vadna_kriteria).length)
      skokObnovy = puvodni === 'deploy' || !(nasazenoHead && os.strom_cisty === true) ? 'deploy' : puvodni === 'uzavreni' && e2eHotove ? 'uzavreni' : 'e2e'
      if (skokObnovy !== 'deploy') { obnovaOd = FAZE_OBNOVY.indexOf(skokObnovy); stavZObnovy = os }
    }
    const provedeno = new Set(provedeneKroky.values()).size
    log(`obnova: stav přerušeného běhu: ${provedeno ? `${provedeno} provedených kroků po nasazení` : 'žádné provedené kroky po nasazení'}, HEAD ${os.head_shodny === true ? 'je' : 'není'} commit řezu${S(os.commit_rezu).trim() ? ` (${S(os.commit_rezu).trim().slice(0, 12)})` : ''}, nasazení ${os.nasazeni_dolozeno === true ? 'doložené' : 'nedoložené'}${obnovaPodleStavu ? `, strom ${os.strom_cisty === true ? 'čistý' : 's necommitnutými změnami'}, brána nad dnešním stromem ${os.brana_nad_head === true ? 'doložená' : 'nedoložená'}${S(os.commit_pokusu).trim() ? `, commit pokusu ${S(os.commit_pokusu).trim().slice(0, 12)}` : ''}` : ''}${obnovaStavOk && obnovaHned ? `; ${obnovaPodleStavu ? `refresh, implementace, review, brána ani doklad se v pokusu ${obnovaPokus} nepouští, obnova jde ${skokObnovy === 'deploy' ? 'od deploye' : skokObnovy === 'e2e' ? 'rovnou na E2E' : 'rovnou na uzavření'}` : `implementace, review a brána se v pokusu ${obnovaPokus} nepouští`}` : ''}`)
  } else log(`obnova: stav přerušeného běhu nezjištěn (agent nevrátil výsledek)${obnovaHned ? ', pokus běží celý' : ''}`)
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
    await vstup('Kontrakt', 'implementace')
    let k = await implKontrakt(n, diag, refresh)
    if (!k && vycerpane.has(`implement:řez ${NN}:kontrakt:${n}`)) k = await kontraktPoStropu(n, diag, refresh)
    if (k && k.stav === 'vada-kriteria' && !vadaKriteriaZ(k, 'kontrakt')) k = bezDukazuVady(k)
    if (!k || k.stav === 'selhalo') {
      kontraktSelhani = k ? S(k.souhrn).trim() || 'stav selhalo' : nic(`implement:řez ${NN}:kontrakt:${n}`, 'agent')
      ted.chyba = `kontrakt: ${kontraktSelhani.slice(0, 800)}`; if (k) sberImpl(k); return ted
    }
    kontraktHotovo = true; kontraktSelhani = ''; kontraktVysledek = k; ted.kontrakt = k; sberImpl(k)
    log(`kontrakt: ${k.stav}, ${cesty(k.soubory).length} souborů, typecheck ${k.typecheck ? 'ok' : 'červený'}`)
    if (vadyKriterii.length) return ted
  }

  if (opravaZ) {
    await vstup('Implementace', 'implementace')
    let o = await implOprava(n, opravaZ, predchozi, diag)
    if (o && o.stav === 'vada-kriteria' && !vadaKriteriaZ(o, `oprava (pokus ${n})`)) o = bezDukazuVady(o)
    if (!o || o.stav === 'selhalo') { ted.chyba = `oprava po selhání ve fázi ${opravaZ.faze}: ${o ? S(o.souhrn).slice(0, 800) : nic(`implement:řez ${NN}:oprava:${n}`, 'agent')}`; if (o) sberImpl(o); return ted }
    opravaZ = null; ted.oprava = o; sberImpl(o)
    log(`oprava (pokus ${n}): ${o.stav}, ${trimList(o.zmenena_mista).length} míst, typecheck ${o.typecheck ? 'ok' : 'červený'}`)
    if (vadyKriterii.length) return ted
  }

  const hotova = id => castiStav.get(id).hotovo
  const selhaloTed = new Set()
  const bezi = new Map()
  // Po vadném kritériu (spec G2) se nové části nespouštějí: běžící doběhnou a blok se zastaví, o kritériu rozhodne orchestrátor.
  const pripravene = () => vadyKriterii.length ? [] : casti.filter(c => !hotova(c.id) && !selhaloTed.has(c.id) && !bezi.has(c.id) && !zastavene.has(c.id) && c.zavisi_na.every(hotova))
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
      await vstup('Části', 'implementace')
      log(`část ${c.id} start${c.zavisi_na.length ? ` (závislosti hotové: ${c.zavisi_na.join(', ')})` : ''}${nadStropem.has(c.id) ? ' (odhad nad stropem)' : ''}`)
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
    // Stav vada-kriteria bez důkazu je selhalo (spec G1); s důkazem je část hotová (kód odevzdaný) a blok se po fázi zastaví.
    if (r && r.stav === 'vada-kriteria' && !vadaKriteriaZ(r, `část ${c.id}`)) r = bezDukazuVady(r)
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
  if (vadyKriterii.length) return ted
  const nehotove = casti.filter(c => !hotova(c.id) && !zastavene.has(c.id))
  if (nehotove.length) {
    ted.chyba = `části nedokončené: ${nehotove.map(c => `${c.id} (${selhaloTed.has(c.id) ? castiStav.get(c.id).selhani.slice(0, 200) : `čeká na ${c.zavisi_na.filter(z => !hotova(z)).join(', ')}`})`).join(', ')}`
    return ted
  }

  if ((ted.kontrakt || ted.casti.length || !integraceHotovo) && casti.some(c => hotova(c.id))) {
    await vstup('Integrace', 'implementace')
    let ig = await implIntegrace(n, diag)
    if (ig) sberImpl(ig)
    if (ig && ig.stav === 'vada-kriteria' && !vadaKriteriaZ(ig, 'integrace')) ig = bezDukazuVady(ig)
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
// Od 1.12.0 (spec K1): log nese položky v původním znění, ne zkrácené na 240 znaků (ubraná rozhodnutí pro majitele se dřív nedala
// dočíst nikde). Vadná kritéria v e2e, která rozhodnuti opakuje s prefixem, se zkrátí dřív, než se cokoli ubere, a rozhodnuti se krátí
// a ubírá až po oblastech: nesený text snědl rozpočet a ubrala se rozhodnutí. Celé rozhodnuti a spory nese i soubor výsledku.
const LIMIT_NAVRATU = 5800
const doLimitu = r => {
  const delka = () => JSON.stringify(r).length
  if (delka() <= LIMIT_NAVRATU) return r
  const SEZ = ['reports', 'nasazeni', 'prenesene_sekce', 'odmitnute', 'pasti_opravene', 'odchylky', 'spory', 'follow_ups', 'prostredi', 'oblasti', 'rozhodnuti', 'k_domereni']
  const POSLEDNI = ['rozhodnuti', 'k_domereni']
  const kratce = x => typeof x === 'string' ? (x.length > 240 ? `${x.slice(0, 239)}…` : x) : x && typeof x === 'object' ? { ...x, ...('health' in x ? { health: S(x.health).slice(0, 120) } : {}), ...(Array.isArray(x.kroky_po_nasazeni) ? { kroky_po_nasazeni: x.kroky_po_nasazeni.length } : {}) } : x
  const cele = Object.fromEntries(SEZ.filter(k => Array.isArray(r[k])).map(k => [k, [...r[k]]]))
  const text = x => typeof x === 'string' ? x : JSON.stringify(x)
  // Položky do logu po řádcích do ~5 500 znaků, aby dlouhý seznam nezůstal useknutý.
  const zaloguj = (hlavicka, xs) => {
    const radky = [[]]
    for (const x of xs.map(text)) { const posl = radky[radky.length - 1]; if (posl.length && posl.join(' | ').length + x.length > 5500) radky.push([x]); else posl.push(x) }
    radky.forEach((xs2, i) => log(`${hlavicka}${radky.length > 1 ? ` (${i + 1}/${radky.length})` : ''}: ${xs2.join(' | ')}`))
  }
  for (const k of SEZ) if (Array.isArray(r[k]) && !POSLEDNI.includes(k)) r[k] = r[k].map(kratce)
  if (delka() > LIMIT_NAVRATU && r.e2e && Array.isArray(r.e2e.vadna_kriteria) && r.e2e.vadna_kriteria.some(x => S(x).length > 160)) {
    zaloguj('návrat nad limitem: e2e.vadna_kriteria zkrácena na 160 znaků, celé znění', r.e2e.vadna_kriteria.filter(x => S(x).length > 160))
    r.e2e = { ...r.e2e, vadna_kriteria: r.e2e.vadna_kriteria.map(x => S(x).length > 160 ? `${S(x).slice(0, 159)}…` : x) }
  }
  // Rozhodnutí se krátí až tady (do té chvíle je návrat nese celá), ale dřív, než se z kteréhokoli seznamu ubírá. Do zkraceno jde u nich
  // počet položek, které návrat nenese celé (zkrácené i ubrané); u ostatních seznamů počet ubraných jako dřív.
  const dlouhe = {}
  for (const k of POSLEDNI) {
    dlouhe[k] = delka() > LIMIT_NAVRATU && Array.isArray(r[k]) ? cele[k].filter(x => typeof x === 'string' && x.length > 240) : []
    if (dlouhe[k].length) { r[k] = r[k].map(kratce); zaloguj(`návrat nad limitem: ${k} zkrácené na 240 znaků, celé znění`, dlouhe[k]) }
  }
  const ubrano = {}
  for (const k of SEZ) {
    if (!Array.isArray(r[k])) continue
    let pryc = 0
    if (delka() > LIMIT_NAVRATU) while (r[k].length && delka() > LIMIT_NAVRATU - 80) { r[k].pop(); pryc++ }
    if (pryc) zaloguj(`návrat nad limitem: ${k} bez ${pryc} položek`, cele[k].slice(cele[k].length - pryc))
    const necele = pryc + cele[k].slice(0, cele[k].length - pryc).filter(x => (dlouhe[k] || []).includes(x)).length
    if (necele) ubrano[k] = necele
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
  // Vadné kritérium kroku po nasazení z diagnózy (1.11.0, spec I5): pokus 3 nenasazuje ani neměří znovu, kritérium jde majiteli a řez pokračuje
  // na E2E a uzavření nad nasazeným commitem.
  const vadaKroku = vadaDiagnozy(diag) && predchozi && predchozi.krokSelhal ? diag.vada_kriteria : null
  // Vadné kritérium z diagnózy mimo krok po nasazení (1.12.0, spec G3): třetí pokus by nad stejným kritériem selhal stejně, blok se zastaví
  // jako u vadného kritéria z implementace. Obnova do tohoto pokusu (orchestrátor kritérium rozhodl a PRD zapracoval) diagnózu přehraje
  // z cache a pokus pustí: jinak by se blok zastavil znovu na téže diagnóze.
  const vadaDiag = !vadaKroku && vadaDiagnozy(diag) && !(obnova && n === obnovaPokus) ? vadaDiagnozy(diag) : null
  // Po obnově nad přeskočenou bránou se dorovnává taky (1.11.0, spec B2): posledniBrana tam chybí, strom se ale nezměnil.
  const dorovnani = !vadaKroku && dorovnaniMozne(predchozi)
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
  // Test, který v bráně prošel až opakováním (flaky): zelená platí, test jde do follow-ups k zlevnění měření. Testy nad 70 % limitu (spec I6) jdou
  // do follow-ups taky, za blok každý jednou.
  const zapisFlaky = v => {
    const f = flakyZ(v)
    if (f.length) {
      log(v.opakovano === true ? `brána: první běh suity byl červený, zopakovaná celá suita je zelená; testy z prvního běhu (${f.length}) jdou do follow-ups: ${f.join(', ').slice(0, 200)}` : `brána: ${f.length} ${f.length === 1 ? 'test prošel' : 'testy prošly'} až samostatně po timeoutu pod zátěží (${f.join(', ').slice(0, 200)}); jdou do follow-ups`)
      for (const t of f) followUps.push(v.opakovano === true ? `[řez ${NN} · testy] [oprava] test ${t} padl v prvním běhu suity a v zopakované prošel, prošetři nestabilitu` : `[řez ${NN} · testy] [oprava] test ${t} přesáhl limit pod zátěží, zlevni měření (nezvedej limit)`)
    }
    const pomale = pole(v && v.pomale).filter(x => x && S(x.test).trim() && !pomaleVidene.has(S(x.test).trim())).slice(0, 10)
    for (const x of pomale) {
      pomaleVidene.add(S(x.test).trim())
      followUps.push(`[řez ${NN} · testy] [oprava] zlevnit stráž: ${S(x.test).trim()}${Number(x.ms) > 0 ? ` (${Number(x.ms)} ms${Number(x.limit) > 0 ? ` z limitu ${Number(x.limit)} ms` : ''})` : ''}`)
    }
    if (pomale.length) log(`brána: ${pomale.length} testů nad 70 % limitu, jdou do follow-ups: ${pomale.map(x => S(x.test).trim()).join(', ').slice(0, 200)}`)
  }
  const zmenyPokusu = () => trimList([...odchylky, ...rozsirene]).join(' | ').slice(0, 1500)
  // Kroky po nasazení a zápis nasazení z posledního úspěšného deploye; bezpečnostní opravy a commity jsou stav bloku.
  let krokyPo = [], commitZapisu = '', nasazeniReport = ''
  const nasad = async (k, pozn, x = {}) => {
    const posilam = securityOpravy.length
    // Pokus 2+ a druhé nasazení v pokusu nesou soubory, které blok změnil: patří řezu a commitují se (běh web-rijen: deploy pokusu 2
    // řezu 2 opravy necommitnul a E2E by měřilo strom bez nich).
    const zmenyOprav = n >= 2 || k > 1 ? [...zmenyBloku] : []
    const volby = { ...x, security: securityOpravy.slice(secOdeslano), provedene: [...new Set(provedeneKroky.values())], doklad: dokladCesta, dokladCommit, zmenyOprav }
    let d = await deploy(k, pozn, volby)
    // Odklad bez doloženého zásahu (spec E3): jedno opakování s větou v zadání; když ani to nevrátí výsledek, platí první odklad.
    const bezZasahu = x.jenCommit ? [] : odkladBezZasahu(d)
    if (bezZasahu.length) {
      const ktere = bezZasahu.map(p => S(p.popis).trim()).join(' | ').slice(0, 300)
      log(`deploy běh ${k}: odklad bez doloženého zásahu (${ktere}); podmínky platí jen při zásahu, deploy běží jednou znovu`)
      d = await deploy(k, pozn, { ...volby, bezZasahu: ktere }) || d
    }
    // Commit řezu před dokladem (spec J1) má v historii vlastní stav: nasazený není a do commit_hlavni nesmí, dokud ho nenasadí běh 1.
    nasazeniHist.push({ pokus: n, k, pozn: S(pozn), stav: !d ? 'bez výsledku' : x.predDokladem && d.stav !== 'failed' ? 'commit-pred-dokladem' : S(d.stav), commit: d ? S(d.commit).trim() : '', health: d ? S(d.health) : '',
      ...(d && S(d.dvere).trim() && !x.predDokladem ? { dvere: S(d.dvere).trim(), dosah: S(d.dosah).trim().slice(0, 40) } : {}),
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
    if (!chyba && !x.predDokladem) {
      if (pole(d.kroky_po_nasazeni).length && !x.jenCommit) krokyPo = pole(d.kroky_po_nasazeni).filter(Boolean).map(x => `${fmtKrok({ ...x, duvod: '' })}: ${S(x.stav)}${x.duvod ? ` (${S(x.duvod)})` : ''}`)
      if (S(d.commit_zapisu).trim()) commitZapisu = S(d.commit_zapisu).trim()
      if (S(d.report_path).trim()) { nasazeniReport = S(d.report_path).trim(); if (!reports.includes(nasazeniReport)) reports.push(nasazeniReport) }
    }
    // Commit-only: nasazuje majitel, vynechané kroky po nasazení jsou jeho práce po nasazení (rozhodnutí), ne selhání. Neplatí
    // pro commit opravy po E2E mimo kód aplikace (jenCommit): řez je nasazený a kroky se nespouštěly, úkol pro majitele by byl falešný.
    if (d && d.stav === 'commit-only' && !x.jenCommit) for (const kr of vynechane(d)) { const t = `[řez ${NN} · krok po nasazení pro majitele] ${kr}: proveď po svém nasazení`; if (!rozhodnuti.includes(t)) rozhodnuti.push(t) }
    // Krok pro majitele (krok, který PRD vede jako ruční nebo neblokující) není selhání nasazení, jde do rozhodnutí.
    if (d && d.stav !== 'failed') for (const kr of krokyStav(d, 'pro-majitele').map(fmtKrok)) { const t = `[řez ${NN} · krok po nasazení pro majitele] ${kr}`; if (!rozhodnuti.includes(t)) rozhodnuti.push(t) }
    // Podmínka bez vyhodnocení (spec I2): nasazení proběhlo, ale nikdo neví, zda směl.
    if (d && deployPodminky.length && !x.jenCommit && d.stav === 'success' && !pole(d.podminky).length) { log(`deploy běh ${k} nevrátil vyhodnocení ${deployPodminky.length} provozních podmínek`); followUps.push(`[řez ${NN} · nasazení] [oprava] deploy běh ${k} nevrátil vyhodnocení provozních podmínek: ${deployPodminky.map(p => p.popis).join(' | ').slice(0, 300)}`) }
    // Nesplněná podmínka je odklad (spec I2): deploy, který přesto nasadil, nesmí projít potichu.
    const nesplnene = d && d.stav === 'success' ? pole(d.podminky).filter(p => p && p.vysledek === 'nesplneno') : []
    if (nesplnene.length) { log(`deploy běh ${k} nasadil při nesplněné provozní podmínce: ${nesplnene.map(p => S(p.popis)).join(' | ').slice(0, 300)}`); followUps.push(`[řez ${NN} · nasazení] [oprava] deploy běh ${k} nasadil při nesplněné provozní podmínce: ${nesplnene.map(p => `${S(p.popis)}${S(p.zmereno).trim() ? ` (${S(p.zmereno).trim()})` : ''}`).join(' | ').slice(0, 400)}`) }
    // nevztahuje-se patří jen podmínce, která platí jen při zásahu (spec E3); u podmínky, která platí vždy, je to nevyhodnocená podmínka.
    const mimoZasah = d && d.stav === 'success' && !x.jenCommit ? podminkySPlatnosti(d).filter(p => p.vysledek === 'nevztahuje-se' && p.plati === 'vzdy') : []
    if (mimoZasah.length) { log(`deploy běh ${k} vrátil nevztahuje-se u provozní podmínky, která platí vždy: ${mimoZasah.map(p => S(p.popis)).join(' | ').slice(0, 300)}`); followUps.push(`[řez ${NN} · nasazení] [oprava] deploy běh ${k} nasadil a podmínku, která platí vždy, vrátil jako nevztahuje-se: ${mimoZasah.map(p => `${S(p.popis)}${S(p.zmereno).trim() ? ` (${S(p.zmereno).trim()})` : ''}`).join(' | ').slice(0, 400)}`) }
    return d
  }
  // Review, thermo a části za celý blok: uzavření i zastavení je skládají stejně.
  const driveRevize = () => sCastmi || dorovnani || vadaKroku || preskoc ? revizeDrive : []
  const soucet = (xs, f) => xs.reduce((s, x) => s + (Number(x[f]) || 0), 0)
  const souhrnRevize = () => {
    const drive = driveRevize()
    const thsVse = [...drive.flatMap(r => r.ths), ...ths]
    const thNalezuVse = soucet(thsVse, 'nalezu'), thBlokeruVse = soucet(thsVse, 'blokeru')
    const kolaVse = Math.max(kola, ...drive.map(r => r.kola))
    const nalezuVse = nalezu + soucet(drive, 'nalezu'), blokujicichVse = blokujicich + soucet(drive, 'blokujicich'), fixAgentuVse = fixAgentu + soucet(drive, 'fixAgentu')
    const thermoOprava = !thsVse.length ? 'bez výsledku' : thNalezuVse === 0 ? 'nic' : (thermoFix || drive.some(r => r.thermoFix) ? 'samostatně' : 've vlně review')
    return { drive, thsVse, thNalezuVse, thBlokeruVse, kolaVse, nalezuVse, blokujicichVse, fixAgentuVse, thermoOprava,
      review: { kola: kolaVse, nalezu: nalezuVse, blokujicich: blokujicichVse, fix_agentu: fixAgentuVse }, thermo: thsVse.length ? { nalezu: thNalezuVse, blokeru: thBlokeruVse, oprava: thermoOprava, reporty: thsVse.filter(t => t.nalezu > 0).map(t => t.report_path).filter(Boolean) } : null }
  }
  // Jedno kolo review nad diffem opravy po E2E (spec F1): blokující opraví dávky balíčku, ostatní jdou do follow-ups. Vrací, zda review proběhlo.
  const revizeOpravy = async (f, co, stitek, typ, kolo, vynutit = false) => {
    await vstup('Review', 'review')
    const re = await reviewPoE2E(f, co, stitek, typ)
    if (!re) { log(`review ${co} nevrátilo výsledek; oprava jde dál bez review a návrat ji nese v bez_review`); return false }
    reports.push(re.report_path)
    nalezu += Number(re.nalezu) || 0; blokujicich += Number(re.blokujicich) || 0
    log(`review ${co}: ${re.nalezu} nálezů, ${re.blokujicich} blokujících`)
    const kOprave = new Set(pole(re.balicky).flatMap(b => trimList(b && b.nalezy)))
    const opravit = re.blokujicich > 0 && kOprave.size
    let fr = null
    if (opravit) {
      const vsechny = celyBalicek(re)
      fr = await fixBalicekDavkami(vsechny, 0, kolo); fixAgentu += fr ? (Number(fr.davek) || 1) : 0
      sber(fr, { vynutit: vynutit || vsechny.security, soubory: vsechny.soubory, zdroj: [...kOprave].join(', ') || `review ${co}` })
    }
    // FOLLOW-UP nálezy: bez opravy všechny, s opravou ty mimo balíčky a ty, které fix neopravil.
    for (const id of trimList(re.follow_up_ids)) if (!opravit || !kOprave.has(id) || !(fr && trimList(fr.opravene_ids).includes(id))) followUps.push(sOsudem(`${id} (FOLLOW-UP z ${S(re.report_path)})`, { oblast: 'review', osud: 'oprava' }))
    // Blokující nález, který oprava nevyřešila (fix bez výsledku, neopravený, blokující bez balíčku), nesmí zůstat jen v gitignorovaném reportu:
    // jde do follow-ups a commit do bez_review, ať ho kolečko posoudí znovu.
    const resene = new Set([...trimList(fr && fr.opravene_ids), ...pole(fr && fr.odmitnuto).map(o => S(o && o.id).trim())])
    const followIds = new Set(trimList(re.follow_up_ids))
    const zbyla = [...kOprave].filter(id => !followIds.has(id) && !resene.has(id))
    if (re.blokujicich > 0 && (!kOprave.size || zbyla.length)) {
      const ktere = zbyla.join(', ') || `${re.blokujicich} blokujících bez balíčku`
      log(`review ${co}: blokující nález zůstal neopravený (${ktere}); jde do follow-ups a commit do bez_review`)
      followUps.push(sOsudem(`blokující nález review ${co} zůstal neopravený: ${ktere} (${S(re.report_path)})`, { oblast: 'review', osud: 'oprava' }))
      return false
    }
    return true
  }
  // Seznamy, review, thermo a části zastaveného běhu (zastavení nasazení i vadné kritérium) zapíše levné uzavření do souboru zastaveného běhu.
  const zapisZastaveni = async (faze, detail) => {
    const sezn = { follow_ups: osudy([...driveSeznamy.follow, ...zeStropu.follow, ...followUps]), odchylky: trimList([...driveSeznamy.odch, ...zeStropu.odch, ...odchylky]), pasti: trimList([...driveSeznamy.pasti, ...zeStropu.pasti, ...pasti]) }
    // Review, thermo a části jdou do návratu i souboru (spec B5): obnova je převezme, řez jinak vypadá jako bez review.
    const rv = souhrnRevize()
    const maRevizi = rv.review.kola > 0 || !!rv.thermo || stavCasti().some(c => c.hotovo)
    let zapsano = ''
    // FAIL a prostředí z E2E přerušeného běhu (review N3 dávky 2b) jdou do souboru taky: obnova je přes obnova-stav vrátí a krok pastí
    // v uzavření je zná, i když E2E po obnově projde.
    if (sezn.follow_ups.length || sezn.odchylky.length || sezn.pasti.length || bezReview.length || maRevizi || e2eSelhani.kriteria.length) {
      await vstup('Uzavření', 'uzavreni')
      const cz = await closeZastaveno({ faze, detail, ...sezn, odmitnute: [...rv.drive.flatMap(r => r.odmitnute || []), ...odmitnute], review: rv.review, thermo: rv.thermo })
      zapsano = cz && cz.ok ? S(cz.vysledek_soubor).trim() || `${cwd}/${zastavenoPath}` : ''
      log(zapsano ? `zastavení: seznamy přerušeného běhu zapsané (${sezn.follow_ups.length} follow-upů, ${sezn.odchylky.length} odchylek, ${sezn.pasti.length} pastí) do ${zapsano}` : `zastavení: seznamy přerušeného běhu se nepodařilo zapsat, návrat je nese celé (${sezn.follow_ups.length} follow-upů, ${sezn.odchylky.length} odchylek, ${sezn.pasti.length} pastí)`)
    }
    // Návrat nese seznamy celého bloku (dřívější pokusy, strop předávek i tento pokus), ne jen aktuálního pokusu (plan-check 1.7.0,
    // nález 9). seznamy_zapsane: true = blok je zapsal do zastaveno_soubor (nebo žádné nejsou) a orchestrátor je neopisuje;
    // false = zápis selhal a orchestrátor je zapíše do docs/.vysledek-stavba-NN-zastaveno.json sám.
    // bez_review je seznam jako ostatní: když zápis selže, návrat nesmí hlásit zapsané seznamy jen proto, že nesl jen commity bez review.
    const mame = sezn.follow_ups.length || sezn.odchylky.length || sezn.pasti.length || bezReview.length
    return { sezn, rv, zapsano, mame }
  }
  // Infra selhání nasazení (přihlášení CLI, účet, výpadek platformy) pokus nespotřebuje: blok zastaví a orchestrátor ho po
  // nápravě obnoví od fáze deploy. V běhu bez-dluhu padl pokus 3 řezu 1 na přihlášení wrangleru, předem ztracený.
  // Commit řezu a fix(security), které deploy stihl před pádem, jdou do návratu: obnova je jinak commitne podruhé (revize 1.4.0).
  // Odklad (1.7.0) zastaví stejně jako infra, jen s fází deploy-odklad a časem nejdriv; pokus se nepočítá ani u něj.
  // Seznamy přerušeného běhu zapíše levné uzavření do docs/.vysledek-stavba-NN-zastaveno.json (§ 1.5 spec 1.7.0).
  const zastav = async d => {
    const odklad = odlozeno(d)
    // Výpadek platformy (1.10.0) nečeká na člověka: orchestrátor obnovu zkusí sám po ~30 min (běh zaklad-dat čekal na pauze nasazení
    // Railway 5 h na odpověď majitele).
    const vypadek = !odklad && !!d && d.stav === 'failed' && d.infra === true && d.infra_trida === 'platforma'
    const faze = odklad ? 'deploy-odklad' : vypadek ? 'deploy-vypadek' : 'deploy-infra'
    const detail = (odkladBezCasu(d) ? `odklad bez platného nejdriv (${S(d.nejdriv).trim() || 'prázdné'}): ${S(d.duvod) || 'bez důvodu'}` : S(d.duvod)).slice(0, 1500)
    if (odkladBezCasu(d)) log(`deploy vrátil odklad bez platného nejdriv („${S(d.nejdriv).trim()}“): blok zastaví jako infra selhání, obnovu nemá na kdy naplánovat`)
    const { sezn, rv, zapsano, mame } = await zapisZastaveni(faze, detail)
    return { vysledek: 'zastaveno', faze, ...(odklad ? { nejdriv: S(d.nejdriv).trim() } : { infra: true, ...(vypadek ? { infra_trida: 'platforma' } : {}) }), detail, pokusy: n, commit: S(d.commit).trim(), security_commity: trimList(securityCommity), ...(securityRadkem.length ? { security_radkem: [...securityRadkem] } : {}), bez_review: bezReview.slice(0, 8), review: rv.review, thermo: rv.thermo, ...seznamy(sezn.follow_ups, sezn.odchylky, sezn.pasti, !!zapsano || !mame), ...(zapsano ? { zastaveno_soubor: zapsano } : {}), spory, reports, rozhodnuti: [], ...historie(true) }
  }
  // Vadné kritérium z implementace nebo z diagnózy (spec G2 a G3): blok se zastaví před integrací, review a bránou, pokus se nepočítá a strom
  // zůstává. Orchestrátor kritérium rozhodne nebo se zeptá majitele, zapracuje ho do PRD a blok obnoví od fáze implementace.
  const zastavVadou = async (vady, x = {}) => {
    const detail = `vadné kritérium: ${vady.map(v => `${v.kriterium} (${v.kde})`).join(' | ')}`.slice(0, 1500)
    const { sezn, rv, zapsano, mame } = await zapisZastaveni('vada-kriteria', detail)
    return { vysledek: 'zastaveno', faze: 'vada-kriteria', detail, pokusy: n, commit: '', security_commity: trimList(securityCommity), ...(securityRadkem.length ? { security_radkem: [...securityRadkem] } : {}), bez_review: bezReview.slice(0, 8), review: rv.review, thermo: rv.thermo, ...seznamy(sezn.follow_ups, sezn.odchylky, sezn.pasti, !!zapsano || !mame), ...(zapsano ? { zastaveno_soubor: zapsano } : {}), spory, reports, rozhodnuti: vady.map(vadaText), ...historie(true), ...x }
  }

  // bez_cache: stav přerušeného běhu hned na začátku přerušeného pokusu (rozhoduje o přeskočení implementace, review a brány).
  if (obnovaHned && n === obnovaPokus) await zjistiObnovaStav()
  let refresh = null
  // Obnova podle stavu s doloženou bránou nepřeměřuje PRD: kód je hotový a brána ho změřila (refresh by jen zbytečně zapracovával PRD).
  if (bezRefreshe && hypBlokujici.length && n === 1) log(`refresh PRD se u mini-řezu nekoná (strom se od bloku PRD nezměnil): ${hypBlokujici.length} blokujících nálezů jde implementaci jako hypotézy`)
  if (n === 1 && (prdStale.length || (hypBlokujici.length && !bezRefreshe)) && !(obnovaPodleStavu && obnovaStavOk && n === obnovaPokus)) {
    await vstup('Refresh PRD', 'refresh')
    refresh = await refreshCheck()
    if (!refresh) log('refresh PRD: prd-check nevrátil výsledek, stavím podle původního PRD')
    else {
      reports.push(refresh.report_path)
      log(`refresh PRD (${prdStale.length ? `${prdStale.length} řezů od PRD` : `jen ${hypBlokujici.length} blokujících nálezů delty`}): ${refresh.verdikt}, ${refresh.nalezu} nálezů, ${refresh.blokujicich} blokujících`)
      if (refresh.verdikt === 'needs-fixes') {
        const rf = await refreshFix(refresh)
        if (rf) { spory.push(...(rf.spory || [])); log(`refresh PRD: zapracováno (${(rf.zmenena_mista || []).length} míst, ${(rf.odmitnute || []).length} odmítnuto)`) }
        else log('refresh PRD: zapracování selhalo, nálezy jdou implementaci jako hypotézy')
        // Tabulka Částí po refreshi (1.10.0): fix refreshe v běhu zaklad-dat rozdělil dvě části řezu 11 na čtyři, stavba postavila jen
        // části z args a K7 a K8 šly do produkce jako pahýl. Rozdíl je chyba vstupu: další pokus ani diagnóza ho neopraví.
        // Množiny id: položka smí nést víc id („K1,K2“ jako frontmatter), mezery a malá písmena rozdílem nejsou.
        const vKostre = rf && sCastmi ? [...new Set(pole(rf.casti_v_kostre).flatMap(x => S(x).split(/[\s,]+/)).map(x => x.trim().toUpperCase()).filter(Boolean))] : []
        const idsStavby = new Set(casti.map(c => c.id.toUpperCase()))
        if (rf && sCastmi && !vKostre.length) log('refresh PRD: fix nevrátil casti_v_kostre, soulad tabulky Částí se stavbou nejde ověřit (pahýly hlídá brána)')
        if (vKostre.length && (vKostre.length !== idsStavby.size || vKostre.some(x => !idsStavby.has(x)))) {
          const detail = `refresh změnil tabulku Částí (kostra: ${vKostre.join(', ')}, stavba: ${casti.map(c => c.id).join(', ')})`
          log(`${detail}; implementace se nespouští, tabulku a PRD nových částí srovná nový blok PRD od architekta`)
          return { vysledek: 'selhalo', faze: 'refresh', detail, tabulka: true, spory, reports }
        }
      }
    }
  }

  // ---- implementace ----
  let ted = null, branaReport = '', meridla = []
  // Commit řezu, který vznikl před dokladem v tomto pokusu (spec J1): běh 1 deploye ho dostane jako hotový.
  let commitPredDokladem = ''
  // Obnova bez cache nad nasazeným commitem řezu: HEAD je commit řezu a nasazení je doložené, implementace, review a brána se
  // v přerušeném pokusu nepouští; zestárlé PRD přeměřil jen refresh výše. Bez bez_cache blok cache důvěřuje a nic nepřeskakuje.
  const preskoc = obnovaHned && obnovaStavOk && n === obnovaPokus && !dorovnani
  if (preskoc) prevezmiRevizi()
  if (vadaDiag) {
    const v = { kde: 'diagnóza', kriterium: S(vadaDiag.kriterium).trim().slice(0, 200) || S(vadaDiag.druh).trim().slice(0, 200) || 'kritérium z diagnózy', dukaz: S(vadaDiag.dukaz).trim().slice(0, 600), navrh: (S(vadaDiag.navrh).trim() || S(diag.doporuceni).trim()).slice(0, 300) }
    log(`pokus ${n}: diagnóza určila vadu kritéria (${v.kriterium.slice(0, 120)}); pokus neběží, kritérium jde orchestrátorovi jako rozhodnutí`)
    return zastavVadou([v], { diagnoza: diagNavrat(diag) })
  }
  if (vadaKroku) {
    log(`pokus ${n}: diagnóza určila vadu kritéria kroku po nasazení (${S(vadaKroku.druh).slice(0, 160)}); implementace, review, brána ani nasazení se nepouští`)
    if (posledniBrana) { branaReport = posledniBrana.report; meridla = posledniBrana.meridla }
  } else if (dorovnani) {
    log(`pokus ${n}: jen dorovnání deploye po selhání kroku po nasazení (${S(predchozi.detail).slice(0, 160)}); implementace, review a brána se nepouští, strom je stejný`)
    if (posledniBrana) { branaReport = posledniBrana.report; meridla = posledniBrana.meridla }
  } else if (preskoc) {
    log(`pokus ${n}: ${obnovaPodleStavu ? `obnova podle stavu nad doloženým stavem dnešního pracovního stromu: refresh, implementace, review, brána ani doklad se nepouští, obnova jde ${skokObnovy === 'e2e' ? 'rovnou na E2E' : skokObnovy === 'uzavreni' ? 'rovnou na uzavření' : 'od deploye'}` : `obnova bez cache nad doloženým commitem řezu: implementace, review a brána se nepouští${prdStale.length || hypBlokujici.length ? ', PRD přeměřil jen refresh' : ''}`}`)
  } else {
    if (!sCastmi) {
      await vstup('Implementace', 'implementace')
      const im = await impl(n, predchozi, diag, refresh)
      if (!im) return fail('implementace', nic(`implement:řez ${NN}:${n}`, 'implementační agent'))
      sberImpl(im)
      log(`implementace (pokus ${n}): ${im.stav}, typecheck ${im.typecheck ? 'ok' : 'červený'}, testy ${im.testy_zelene ? 'zelené' : 'červené'}`)
      if (im.stav === 'prostredi' && !prostrediZ(im, `řez ${NN}`)) im.stav = 'selhalo'
      if (im.stav === 'vada-kriteria' && !vadaKriteriaZ(im, `řez ${NN}`)) { im.stav = 'selhalo'; im.souhrn = `vadné kritérium bez důkazu: ${S(im.souhrn).slice(0, 500)}` }
      if (im.stav === 'selhalo') return fail('implementace', im.souhrn)
    } else {
      ted = await implementaceCasti(n, predchozi, diag, refresh, sberImpl, prostrediZ)
      // Vadné kritérium má přednost před selháním jiné části: blok stojí bez spotřeby pokusu a obnova selhanou část pustí znovu.
      if (ted.chyba && !vadyKriterii.length) return fail('implementace', ted.chyba)
    }
    if (vadyKriterii.length) return zastavVadou(vadyKriterii)

    // ---- review ----
    await vstup('Review', 'review')
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
      // Thermo integrace jde poslední ve vlně a čeká na thermo částí (jejich napric je jeho vstup); integrační code-review je delší, takže
      // kritickou cestu review prakticky neprodlouží.
      const thermoCasti = []
      if (profil !== 'lehky') for (const c of podleVelikosti) {
        let hotovo
        thermoCasti.push(new Promise(r => { hotovo = r }))
        ulohy.push({ th: true, cast: c.id, f: () => thermo(c, rozsah(c)).then(r => { hotovo(r); return r }) })
      }
      if (profil !== 'lehky' && ted.integrace) {
        const ig = ted.integrace
        ulohy.push({ th: true, f: () => Promise.all(thermoCasti).then(tc => {
          const napric = trimList(tc.filter(Boolean).flatMap(t => pole(t.napric)))
          if (napric.length) log(`thermo integrace: ${napric.length} nálezů přes hranici části z thermo částí`)
          return thermoIntegrace(ig, napric)
        }) })
      }
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
      const vysledkyOprav = await parallel(balicky.map((b, i) => () => fixBalicekDavkami(b, i, 1, vsechnyThermo).then(f => ({ f, b }))))
      followZOprav(vysledkyOprav.filter(Boolean), fuMapa(r1s))
      const opravy = vysledkyOprav.filter(x => x && x.f)
      fixAgentu += opravy.reduce((s, x) => s + (Number(x.f.davek) || 1), 0)
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
            const vsechny = celyBalicek(r2)
            const f2 = await fixBalicekDavkami(vsechny, 0, 2); fixAgentu += f2 ? (Number(f2.davek) || 1) : 0
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
    await vstup('Brána', 'brana')
    let v = await verify(1)
    if (!v) return fail('brána', nic(`verify:řez ${NN}${pz()}:1`, 'verify agent'))
    let vk = 1
    if (pahylyMimo(v).length) {
      const mimo = trimList(pahylyMimo(v).map(castZPahylu))
      log(`brána: pahýl ${mimo.length === 1 ? 'části' : 'částí'} ${mimo.join(', ')}, ${mimo.length === 1 ? 'která není' : 'které nejsou'} ve stavbě; fix brány ji nedopíše, řez končí bez dalšího pokusu`)
      // Fáze „brana“ bez diakritiky a detail „pahýl části mimo stavbu“ jsou rozhraní: orchestrátor podle nich pustí nový blok PRD bez ohledu na pokusy.
      return fail('brana', `pahýl části mimo stavbu: ${mimo.join(', ')} (stavba: ${casti.map(c => c.id).join(', ')}): ${pahylyMimo(v).slice(0, 6).join(' | ')}`, { konecny: true })
    }
    if (!zelena(v)) {
      log(`brána červená: ${branaDuvod(v).slice(0, 200)}; jedna oprava`)
      const fb = await fixBrana(v); sber(fb, { zdroj: 'oprava brány' }); fixAgentu += fb ? 1 : 0
      v = await verify(2); vk = 2
      if (!zelena(v)) return fail('brána', v ? `${branaDuvod(v)}: ${(v.selhavajici || []).slice(0, 10).join(' | ')}` : nic(`verify:řez ${NN}${pz()}:2`, 'verify agent'))
    }
    zapisFlaky(v)
    branaReport = S(v.vystup_path).trim() || rep('verify', vk)
    meridla = trimList(v.meridla)
    posledniBrana = { report: branaReport, meridla }
    log(`brána zelená: ${v.proslo} testů${v.souboru ? ` v ${v.souboru} souborech` : ''}${v.opakovano === true ? ' (po zopakování celé suity)' : ''}${meridla.length ? `, ${meridla.length} měřidel` : ''}${trimList(v.kontroly).length ? `, ${trimList(v.kontroly).length} kontrol pre-commitu` : ''}`)

    // Doklad před migrací se pořizuje jednou za blok: pokus 2 a dál dostane doklad z dřívějšího pokusu (stav před prvním zápisem;
    // nový doklad by zachytil stav po zápisech, běh web-podzim řez 04). Cestu bere blok z návratu agenta (při existujícím souboru
    // zapisuje doklad vedle s příponou -p<pokus>).
    if (dokladPred && dokladCesta) log(`doklad před nasazením: platí doklad z dřívějšího pokusu (${dokladCesta}), znovu se nepořizuje`)
    else if (dokladPred) {
      await vstup('Doklad', 'doklad')
      // Nejdřív commit řezu bez nasazení (spec J1): doklad vzniká nad ním a nese jeho hash, běh 1 deploye pak commit řezu už nedělá.
      // Selhání commitu je selhání fáze doklad (ne zastavení): obnova od deploye by commit i doklad přeskočila.
      const dc = await nasad(0, 'commit řezu před dokladem', { jenCommit: true, predDokladem: true })
      commitPredDokladem = dc ? S(dc.commit).trim() : ''
      if (chybaNasazeni(dc, 0) || !commitPredDokladem) return fail('doklad', `commit řezu před dokladem selhal: ${chybaNasazeni(dc, 0) || 'deploy agent nevrátil hash commitu'}`)
      log(`doklad před nasazením: commit řezu ${commitPredDokladem.slice(0, 12)} bez nasazení, doklad vzniká nad ním`)
      let dk = await doklad(commitPredDokladem)
      if (!dk || !dk.ok) { log(`doklad před nasazením: ${dk ? S(dk.duvod).slice(0, 160) : nic(`doklad:řez ${NN}`, 'agent')}; jeden pokus navíc`); dk = await doklad(commitPredDokladem) }
      if (!dk || !dk.ok) return fail('doklad', dk ? `doklad před migrací nejde pořídit: ${S(dk.duvod).slice(0, 600)}` : nic(`doklad:řez ${NN}`, 'doklad agent'))
      dokladCesta = S(dk.path).trim() || dokladPath
      dokladCommit = commitPredDokladem
      reports.push(dokladCesta); log(`doklad před nasazením: ${S(dk.souhrn).slice(0, 160) || dokladCesta}`)
    }
  }

  // ---- deploy ----
  // Obnova podle stavu rovnou na E2E nebo uzavření (HEAD je doloženě nasazený commit řezu, strom je čistý): deploy se nepouští, nasazení
  // a u uzavření i výsledek E2E jsou z přerušeného běhu (obnova-stav).
  const skok = preskoc && obnovaPodleStavu ? skokObnovy : ''
  const zNasazeni = skok === 'e2e' || skok === 'uzavreni'
  const nasazeniZObnovy = () => {
    const commit = S(stavZObnovy && stavZObnovy.commit_rezu).trim()
    const health = 'nasazení doložené zápisem přerušeného běhu (obnova podle stavu, deploy se nepouštěl)'
    const dd = stavZObnovy && S(stavZObnovy.dvere).trim() ? { dvere: S(stavZObnovy.dvere).trim(), dosah: S(stavZObnovy.dosah).trim().slice(0, 40) } : {}
    nasazeniHist.push({ pokus: n, k: 0, pozn: 'doloženo z přerušeného běhu', stav: 'success', commit, health, ...dd, kroky_po_nasazeni: [] })
    nasazeniReport = nasazeniPath
    log(`pokus ${n}: nasazení commitu ${commit.slice(0, 12)} doložené z přerušeného běhu, deploy se nepouští`)
    return { stav: 'success', commit, kroky_po_nasazeni: [], health, report_path: nasazeniPath }
  }
  const zPredchoziho = vadaKroku ? [...nasazeniHist].reverse().find(x => S(x.commit).trim() && x.stav !== 'odlozeno' && x.stav !== 'commit-pred-dokladem') : null
  if (vadaKroku && !zPredchoziho) log(`pokus ${n}: vadné kritérium kroku bez doloženého nasazení v bloku; nasazení běží`)
  if (zPredchoziho) {
    const t = `[řez ${NN} vadné kritérium] krok po nasazení, ${S(vadaKroku.druh).trim()}: ${S(vadaKroku.dukaz).trim()}`.slice(0, 900)
    if (!rozhodnuti.includes(t)) rozhodnuti.push(t)
    nasazeniReport = nasazeniPath
  }
  if (!zNasazeni && !zPredchoziho) await vstup('Deploy', 'deploy')
  // Pokus 2+ po selhání v deployi nebo E2E: deploy dostane příčinu a diagnózu (v řezu 1 běhu bez-dluhu dostal deploy v každém
  // pokusu stejné zadání a zopakoval tutéž chybu).
  const predDeploy = predchozi && ['deploy', 'e2e'].includes(predchozi.faze) ? predchozi : null
  let d = zNasazeni ? nasazeniZObnovy() : zPredchoziho ? { stav: 'success', commit: zPredchoziho.commit, kroky_po_nasazeni: [], health: zPredchoziho.health, report_path: nasazeniPath } : await nasad(1, dorovnani ? 'dorovnání kroků po nasazení' : '', { predchozi: predDeploy, diag, dorovnani, ...(commitPredDokladem ? { commitRezu: commitPredDokladem } : {}) })
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
  // Čisté E2E přerušeného běhu (pass nebo pass-castecne, bez FAIL a vadných kritérií) při skoku rovnou na uzavření: počty z jeho reportu.
  const e2eZObnovy = () => {
    const x = (stavZObnovy && stavZObnovy.e2e) || {}
    log(`pokus ${n}: E2E přerušeného běhu platí (${S(x.vysledek)} ${Number(x.pass) || 0}/${Number(x.celkem) || 0}), obnova jde rovnou na uzavření`)
    // Vady čitelnosti z reportu přerušeného běhu jdou dál jako z živého E2E (follow-ups, návrat, soubor výsledku): uzavření je ještě nezapsalo.
    return { vysledek: S(x.vysledek), celkem: Number(x.celkem) || 0, pass: Number(x.pass) || 0, castecne: Number(x.castecne) || 0, fail: 0, fail_kriteria: [], castecna_kriteria: trimList(x.castecna_kriteria), vadna_kriteria: trimList(x.vadna_kriteria), zavazne_mimo_ak: [], kosmeticke: [], prostredi: [], prostredi_nasazeni: '', citelnost: pole(x.citelnost), k_domereni: pole(x.k_domereni), report_path: S(x.report_path) }
  }
  if (skok !== 'uzavreni') await vstup('E2E', 'e2e')
  // Verdikt se odvozuje z počtů, ne z textu verifikátora: fail > 0 je fail, ať verifikátor napsal cokoli.
  // Vadné kritérium (nesplnitelné, kolidující, předřezový nález, scénář zastaralý po opravě) není selhání implementace:
  // žádná oprava ani další pokus, řez se uzavře a kritérium jde orchestrátorovi jako rozhodnutí pro majitele.
  // Kritéria prostředí (§ 2.2) jen s důkazem; bez důkazu jsou FAIL. FAIL mimo hranici řezu (§ 2.12) jen s důkazem. Verdikt z počtů.
  const normE2E = (e, kdo = 'E2E') => {
    // Čísla bez jmen (FAIL nad počet jmenovaných, PASS bez seznamu) se berou z návratu dřív, než normalizace seznamy změní.
    bezJmenE2E(e)
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
    }
    e.mimo_rez = [...pole(e.mimo_rez).filter(x => x && typeof x === 'object' && S(x.kriterium).trim() && S(x.dukaz).trim()).map(x => ({ kriterium: S(x.kriterium).trim().slice(0, 200), dukaz: S(x.dukaz).trim().slice(0, 600) })), ...mimoZ]
    e.citelnost = pole(e.citelnost).filter(x => x && typeof x === 'object' && S(x.co).trim()).map(x => ({ plocha: S(x.plocha).trim().slice(0, 160), co: S(x.co).trim().slice(0, 400), proc: S(x.proc).trim().slice(0, 300) }))
    // Doměření jen s čtecí kontrolou a platným časem (spec I1); bez nich by uzavřený řez nikdo neověřil a jde to jako FAIL, stejně jako prostředí bez důkazu.
    const dom = pole(e.k_domereni).filter(x => x && typeof x === 'object' && S(x.kriterium).trim())
    const domVadne = dom.filter(x => !S(x.kontrola).trim() || !platnyCas(x.nejdriv))
    e.k_domereni = dom.filter(x => !domVadne.includes(x)).map(x => ({ kriterium: S(x.kriterium).trim().slice(0, 200), co_bezi: S(x.co_bezi).trim().slice(0, 300), kontrola: S(x.kontrola).trim().slice(0, 400), nejdriv: S(x.nejdriv).trim() }))
    if (domVadne.length) {
      log(`E2E: ${domVadne.length} kritérií k doměření bez kontroly nebo platného času, počítají se jako FAIL`)
      e.fail_kriteria = [...pole(e.fail_kriteria), ...domVadne.map(x => `${S(x.kriterium).trim()} (doměření bez kontroly nebo platného času)`)]
    }
    // Počty až z normalizovaných seznamů (spec I2): prostředí bez důkazu a doměření bez kontroly už jsou mezi FAIL.
    spoctiE2E(e, kdo)
    e.vysledek = (e.fail > 0 || (e.fail_kriteria || []).length) ? 'fail' : vadna.length ? 'vada-kriteria' : e.prostredi.length ? 'prostredi' : e.castecne > 0 || e.k_domereni.length ? 'pass-castecne' : 'pass'
    return e
  }
  // Všechna FAIL kritéria mají doloženou příčinu mimo hranici řezu: v posledním pokusu se řez uzavře s otázkou, ne jako selhalo.
  // Důkaz kryje jedno selhání: dva FAIL „smoke“ s jedním důkazem nejsou doložené oba.
  const mimoRezVse = x => {
    const f = trimList(x.fail_kriteria), dukazy = [...pole(x.mimo_rez)]
    if (!f.length || (Number(x.fail_bez_jmen) || 0) > 0) return false
    return f.every(fk => { const i = dukazy.findIndex(mr => stejneKrit(mr.kriterium, fk)); if (i < 0) return false; dukazy.splice(i, 1); return true })
  }
  const uzavritMimoRez = x => {
    log(`E2E: všechna FAIL kritéria (${trimList(x.fail_kriteria).length}) mají doloženou příčinu mimo hranici řezu; poslední pokus, řez se uzavře s otázkou pro majitele`)
    for (const mr of x.mimo_rez) rozhodnuti.push({ typ: 'mimo_rez', kriterium: mr.kriterium, dukaz: mr.dukaz })
    return normE2E({ ...x, fail: 0, fail_bez_jmen: 0, fail_kriteria: [], bez_verdiktu: [...pole(x.bez_verdiktu), ...trimList(x.fail_kriteria)] })
  }
  // Přenos sekcí E2E (§ 2.12): v dalším pokusu po opravě jen skupiny, jejichž sekce mají oblasti protínající opravu.
  const prenos = n > 1 && !dorovnani ? skupinyKPrenosu(oblastiTed) : new Set()
  if (prenos.size) log(`E2E: ${prenos.size} ${prenos.size === 1 ? 'skupina sekcí se přenáší' : 'skupiny sekcí se přenášejí'} z posledního zeleného kola (oblasti mimo opravu): ${[...prenos].flatMap(i => e2eSkupiny[i]).join(' | ')}`)
  const e2eOpts = () => ({ commit: nasazeny, nasazeni: nasazeniReport, brana: branaReport, meridla, zmeny: zmenyPokusu(), prenos })
  let e = skok === 'uzavreni' ? e2eZObnovy() : await e2e(1, e2eOpts())
  // Tvar položky čte sběr várek čitelnosti v kolečku (follow-ups.py --text 'čitelnost:'): text za značkami musí začínat „čitelnost:“.
  const citelnostDoFollow = () => { for (const t of citelnostText(e.citelnost)) followUps.push(`[řez ${NN} · E2E] [oprava] čitelnost: ${t}`) }
  // I pokus, který selže za E2E, zapíše položky čitelnosti do follow-ups, jinak by zůstaly jen v reportu.
  const failE2E = detail => { citelnostDoFollow(); return fail('e2e', detail) }
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
    if (vadaNasazeni(e)) return failE2E(`vada nasazení trvá: ${vadaNasazeni(e).slice(0, 600)}`)
  }
  normE2E(e, skok === 'uzavreni' ? 'E2E přerušeného běhu' : 'E2E 1'); reports.push(e.report_path)
  const preneseneSekce = trimList(e.prenesene_sekce)
  log(`E2E 1: ${e.vysledek} (${e.pass}/${e.celkem}, částečně ${e.castecne}, fail ${e.fail}${e.vadna_kriteria.length ? `, vadná kritéria ${e.vadna_kriteria.length}` : ''}${e.prostredi.length ? `, prostředí ${e.prostredi.length}` : ''}${e.citelnost.length ? `, čitelnost ${e.citelnost.length}` : ''}${e.k_domereni.length ? `, k doměření ${e.k_domereni.length}` : ''}${e2eSkupiny.length >= 2 ? `, ${e2eSkupiny.length} verifikátoři` : ''}${preneseneSekce.length ? `, přeneseno sekcí ${preneseneSekce.length}` : ''})`)
  if (e.vysledek === 'fail') zapisSelhaniE2E(trimList(e.fail_kriteria).length ? e.fail_kriteria : [`${e.fail} FAIL bez jmen`], e.report_path)
  if (e.vysledek === 'fail' && n === MAX_POKUSU && mimoRezVse(e)) e = uzavritMimoRez(e)
  if (e.vysledek === 'fail') {
    const fe = await fixE2E(e, 1); sber(fe, { zdroj: 'oprava po E2E' }); fixAgentu += fe ? 1 : 0
    // Nový krok nad platformou z opravy (§ 2.4): s oporou v Povolení jde do nasazení jako další krok (vynutí nasazení); bez opory se
    // oprava nenasadí (jen commit), kritérium jde majiteli jako otázka a kolo 2 ho nepřeměřuje.
    const nove = pole(fe && fe.novy_krok_po_nasazeni).filter(x => x && S(x.krok).trim()).map(x => ({ krok: S(x.krok).trim().slice(0, 300), duvod: S(x.duvod).trim().slice(0, 300), opora: S(x.opora).trim().slice(0, 300), kriterium: S(x.kriterium).trim().slice(0, 160) }))
    const sOporou = nove.filter(x => x.opora), bezOpory = nove.filter(x => !x.opora)
    const failKola1 = trimList(e.fail_kriteria)
    const vyjmuta = bezOpory.length ? (bezOpory.some(x => !x.kriterium) ? failKola1 : failKola1.filter(fk => bezOpory.some(x => stejneKrit(x.kriterium, fk)))) : []
    if (bezOpory.length) {
      log(`oprava po E2E vyžaduje krok nad platformou bez opory v Povolení (${bezOpory.map(x => x.krok).join(' | ').slice(0, 200)}): krok se neprovede, kód se nasadí bez něj, ${vyjmuta.length} kritérií jde majiteli jako otázka a pokus se kvůli nim nepočítá`)
      for (const x of bezOpory) rozhodnuti.push({ typ: 'novy_krok', kriterium: x.kriterium || vyjmuta.join(' | ').slice(0, 300), krok: x.krok, duvod: x.duvod })
    }
    if (sOporou.length) log(`oprava po E2E přidává krok po nasazení s oporou v Povolení: ${sOporou.map(x => x.krok).join(' | ').slice(0, 200)}`)
    // Oprava po E2E, která změnila kód, projde bránou jako bezpečnostní oprava (běh web-rijen: řezy 4 a 10 šly do nasazení bez
    // brány). Kód mimo apps a packages (měřicí nástroj, skript) bránou a jen commitem bez nasazení, jen docs commitem, bez změny nic.
    const zasah = zasahOpravy(fe)
    let e2eZrevidovano = false
    if (zasah === 'kod' || zasah === 'mimo') e2eZrevidovano = await revizeOpravy(fe, 'opravy po E2E', 'oprava-e2e', 'code-review-oprava-e2e', 'E2E')
    if (zasah === 'kod' || zasah === 'mimo') {
      await vstup('Brána', 'brana')
      let ve = await verify('e2e')
      if (!zelena(ve)) {
        log(`brána po opravě E2E červená: ${branaDuvod(ve).slice(0, 200)}; jedna oprava`)
        const fb = ve ? await fixBrana(ve) : null; sber(fb, { zdroj: 'oprava brány' }); fixAgentu += fb ? 1 : 0
        ve = await verify('e2e-2')
        if (!zelena(ve)) return failE2E(`oprava po E2E neprošla bránou: ${branaDuvod(ve)}${ve ? `: ${(ve.selhavajici || []).slice(0, 10).join(' | ')}` : ''}`)
      }
      zapisFlaky(ve)
      branaReport = S(ve.vystup_path).trim() || rep('verify', 'e2e'); meridla = trimList(ve.meridla); posledniBrana = { report: branaReport, meridla }
      await vstup('Deploy', 'deploy')
    }
    // Krok s oporou vynutí nasazení i u opravy mimo kód aplikace; krok bez opory nasazení nebrání (review N5): kód se nasadí normálně bez
    // něj a kolo 2 přeměří jen kritéria, která ten krok nepotřebují.
    const nasadit = sOporou.length ? 'kod' : zasah
    if (nasadit !== 'nic') {
      const predOpravou = S(d.commit).trim()
      const d2 = await nasad(2, nasadit === 'kod' ? 'oprava po E2E' : 'oprava po E2E bez nasazení', nasadit === 'kod' ? { noveKroky: sOporou } : { jenCommit: true })
      // Commit opravy bez review hned po commitu, ještě před případným zastavením; commit shodný s předchozím znamená, že oprava commitnutá není.
      if ((zasah === 'kod' || zasah === 'mimo') && !e2eZrevidovano && d2 && S(d2.commit).trim() && S(d2.commit).trim() !== predOpravou) pridejBezReview(d2.commit, `oprava po E2E (pokus ${n}) bez review: ${trimList(fe && fe.zmenena_mista).slice(0, 4).join('; ') || 'viz journal'}`)
      if (zastavit(d2)) return zastav(d2)
      // Vady čitelnosti z kola 1 jdou do follow-ups i při selhaném nasazení opravy (review N2): jinak v posledním pokusu zůstaly jen v reportu.
      if (chybaNasazeni(d2, 2)) { citelnostDoFollow(); return fail('deploy', chybaNasazeni(d2, 2)) }
      // Commit opravy mimo kód aplikace řez nenasazuje: stav a health zůstávají z posledního nasazení, mění se jen commit řezu.
      if (nasadit === 'kod') { d = d2; nasazeny = S(d2.commit).trim() }
      else d = { ...d, commit: S(d2.commit).trim() || d.commit }
    } else log('E2E 1: oprava nic nezměnila, kolo 2 bez nového nasazení')
    await vstup('E2E', 'e2e')
    const e1 = e
    // Kolo 2 přeměří jen jmenovaná FAIL kritéria kola 1 (bez kritérií vyjmutých kvůli kroku mimo Povolení). Když kolo 1 hlásí víc
    // FAIL, než jich jmenuje, nejde říct která, a kolo 2 měří všechna (revize 1.4.0: fail 2 bez jmen dal kolu 2 prázdný seznam a řez
    // prošel bez přeměření). Bez runtime dopadu měří kolo 2 všechna kritéria vždy a skládat ho s kolem 1 by počty zdvojilo.
    const jmenovana = failKola1.filter(fk => !vyjmuta.includes(fk))
    const vse = !runtimeDopad || (Number(e1.fail_bez_jmen) || 0) > 0
    if (vse && runtimeDopad) log(`E2E 1: fail ${e1.fail}, z toho ${e1.fail_bez_jmen} bez jmen; kolo 2 přeměří všechna`)
    if (!vse && !jmenovana.length) {
      log('E2E: kolo 2 se nekoná, všechna FAIL kritéria kola 1 čekají na rozhodnutí majitele (krok mimo Povolení)')
      e = normE2E({ ...e1, fail: 0, fail_bez_jmen: 0, fail_kriteria: [], bez_verdiktu: [...pole(e1.bez_verdiktu), ...failKola1] })
    } else {
      const e2 = await e2e(2, { ...e2eOpts(), fail: vse ? null : jmenovana })
      if (e2eNic(e2, 2)) return failE2E(`${e2eNic(e2, 2)} v kole 2`)
      if (vadaNasazeni(e2)) return failE2E(`vada nasazení v kole 2: ${vadaNasazeni(e2).slice(0, 600)}`)
      // Plné přeměření, které nezměřilo nic, není pass: kolo 1 mělo kritéria, kolo 2 je vrátilo nula (neproběhlo není spadlo).
      if (vse && !(spoctiE2E({ ...e2 }).celkem > 0) && Number(e1.celkem) > 0) return failE2E(`kolo 2 mělo přeměřit všechna kritéria (${e1.celkem}) a vrátilo celkem 0`)
      // Kolo 2 přes všechna kritéria bez přenesených sekcí: čitelnost a doměření platí jen z něj, kolo 1 by je zdvojilo.
      e = normE2E(vse ? { ...e2, ...zKola1(e1, e2), ...(prenos.size ? {} : { citelnost: pole(e2.citelnost), k_domereni: pole(e2.k_domereni) }), report_path: [e1.report_path, e2.report_path].filter(Boolean).join(' + ') } : slozE2E(e1, e2, vyjmuta), 'E2E 2'); reports.push(e2.report_path)
      log(`E2E 2 (${vse ? 'všechna kritéria' : 'jen FAIL kola 1'}): ${e.vysledek} (${e.pass}/${e.celkem}, fail ${e.fail}${e.vadna_kriteria.length ? `, vadná kritéria ${e.vadna_kriteria.length}` : ''})`)
      if (e.vysledek === 'fail') zapisSelhaniE2E(trimList(e.fail_kriteria).length ? e.fail_kriteria : [`${e.fail} FAIL bez jmen`], e2.report_path)
      if (e.vysledek === 'fail' && n === MAX_POKUSU && mimoRezVse(e)) e = uzavritMimoRez(e)
      if (e.vysledek === 'fail') return failE2E(`FAIL kritéria po opravě: ${(e.fail_kriteria || []).join(' | ') || `${e.fail} bez jmen`}`)
    }
  }
  if (e.vadna_kriteria.length) {
    log(`E2E: ${e.vadna_kriteria.length} vadných kritérií, bez opravy; řez se uzavře a jdou jako rozhodnutí pro majitele`)
    rozhodnuti.push(...e.vadna_kriteria.map(k => `[řez ${NN} vadné kritérium] ${k}`))
  }
  if (e.prostredi.length) {
    log(`E2E: ${e.prostredi.length} kritérií nejde změřit kvůli prostředí; bez opravy a bez dalšího pokusu, jdou majiteli jako otázka`)
    for (const x of e.prostredi) pridejProstredi({ typ: 'prostredi', kriterium: x.kriterium, ...(x.sekce ? { sekce: x.sekce } : {}), dukaz: x.dukaz, navrh: x.navrh })
    zapisSelhaniE2E(e.prostredi.map(x => `prostředí: ${x.kriterium} (${x.dukaz})`), e.report_path)
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
      const secZrevidovano = await revizeOpravy(fs, 'bezpečnostní opravy po E2E', 'fix-security', 'code-review-fix-security', 'E2E-sec', true)
      await vstup('Brána', 'brana')
      let vs = await verify('sec')
      if (!zelena(vs)) {
        log(`brána po bezpečnostní opravě červená: ${branaDuvod(vs).slice(0, 200)}; jedna oprava`)
        const fb = vs ? await fixBrana(vs) : null; sber(fb, { zdroj: 'oprava brány' }); fixAgentu += fb ? 1 : 0
        vs = await verify('sec-2')
        if (!zelena(vs)) return failE2E(`bezpečnostní oprava neprošla bránou: ${branaDuvod(vs)}`)
      }
      zapisFlaky(vs)
      await vstup('Deploy', 'deploy')
      const d3 = await nasad(3, 'bezpečnostní oprava')
      // fix(security), jehož review nevrátilo výsledek: samostatné commity, nebo commit řezu s řádkem fix(security), hned po commitu.
      if (!secZrevidovano) for (const h of trimList([...pole(d3 && d3.security_commity), S(d3 && d3.security_radkem).trim()])) pridejBezReview(h, `fix(security) po E2E (pokus ${n}) bez review: ${trimList(fs.zmenena_mista).slice(0, 4).join('; ')}`)
      if (zastavit(d3)) return zastav(d3)
      if (!chybaNasazeni(d3, 3)) { d = d3; nasazeny = S(d3.commit).trim() }
      else { log(`deploy bezpečnostní opravy selhal (${chybaNasazeni(d3, 3).slice(0, 160)}), zůstává v pracovním stromě jako follow-up`); followUps.push(`[řez ${NN} · bezpečnost] [oprava] bezpečnostní oprava po E2E zůstala nenasazená v pracovním stromě: ${chybaNasazeni(d3, 3).slice(0, 300)}`) }
    }
  }

  // ---- čitelnost po E2E ----
  // Spec N1: vady čitelnosti stavba neopravuje. Jdou do follow-ups (opraví je várky čitelnosti kolečka), jmenovitě do návratu a celé do
  // souboru výsledku; žádná oprava, review, brána ani nasazení.
  if (e.citelnost.length) {
    log(`E2E: ${e.citelnost.length} vad čitelnosti jde do follow-ups, opraví je vlna dluhu kolečka`)
    citelnostDoFollow()
  }
  if (e.k_domereni.length) log(`E2E: ${e.k_domereni.length} kritérií k doměření, řez se uzavře a uvolní slot; ověří je orchestrátor od ${e.k_domereni.map(x => x.nejdriv).sort()[0]}`)

  // ---- uzavření ----
  await vstup('Uzavření', 'uzavreni')
  // Řez s částmi skládá revizi pokusů, které padly až za review (revizeDrive), s tímto pokusem; malý řez reviduje každý pokus celý,
  // kromě dorovnání deploye, obnovy nad přeskočenou bránou a vadného kritéria z diagnózy, které review nepouští a berou revizi předchozích pokusů.
  const { drive, thsVse, thNalezuVse, thBlokeruVse, kolaVse, nalezuVse, blokujicichVse, fixAgentuVse, thermoOprava } = souhrnRevize()
  const e2eText = `${e.vysledek} ${e.pass}/${e.celkem}${e.castecne ? ` (částečně ${e.castecne})` : ''}${e.vadna_kriteria.length ? ` (vadná kritéria ${e.vadna_kriteria.length})` : ''}`
  const reviewText = `${kolaVse} kol, ${nalezuVse} nálezů, ${fixAgentuVse} fix agentů`
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
  // Od 1.12.0 (spec K1) nese i rozhodnuti a spory celé: návrat je nad limitem krátí a ubírá (zkraceno) a soubor je dřív neměl vůbec.
  const plne = { vysledek: 'hotovo', pokusy: cisloPokusu(n), faze: 'uzavreni', reports: reportsVse, odmitnute: odmitnuteSeznam, meridla, nasazeni: historie().nasazeni, kroky_po_nasazeni: krokyPo, dvere, dosah, prostredi: prostrediPolozky, mimo_rez: mimoRez, prenesene_sekce: preneseneSekce, bez_review: bezReview.slice(0, 8), k_domereni: e.k_domereni, citelnost: e.citelnost, rozhodnuti, spory }
  const c = await close({ commit: d.commit, security: trimList(securityCommity), odchylky, pokusy: cisloPokusu(n), e2e: e2eText, review: reviewText, thermo: thermoText,
    thermo_paths: thsVse.filter(t => t.nalezu > 0).map(t => t.report_path).filter(Boolean), follow_ups: followVse, vadna: e.vadna_kriteria, prostredi: prostrediPolozky, mimoRez, prenesene: preneseneSekce, kDomereni: e.k_domereni,
    odmitnute: odmitnuteSeznam, jinak: trimList([...drive.flatMap(r => r.jinak), ...jinak]), meridla, kroky: krokyPo, predavky: predavekCelkem, e2eSelhani,
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
    vysledek: 'hotovo', pokusy: cisloPokusu(n), profil, commit: commitOvereny || d.commit, commit_zapisu: commitZapisu, deploy: d.stav, health: S(d.health).slice(0, 800), doklad_pred: dokladPred ? (dokladCesta || dokladPath) : null,
    dvere, dosah, oblasti: [...oblastiVse], prostredi: prostrediPolozky, prenesene_sekce: preneseneSekce, k_domereni: e.k_domereni,
    e2e: { vysledek: e.vysledek, celkem: e.celkem, pass: e.pass, castecne: e.castecne, fail: e.fail, castecna_kriteria: e.castecna_kriteria || [], vadna_kriteria: e.vadna_kriteria, prostredi: e.prostredi.map(x => x.kriterium), ...(e.citelnost.length ? { citelnost: citelnostText(e.citelnost).slice(0, MAX_CITELNOST_NAVRAT).map(t => t.slice(0, 240)), citelnost_pocet: e.citelnost.length } : {}) },
    review: { kola: kolaVse, nalezu: nalezuVse, blokujicich: blokujicichVse, fix_agentu: fixAgentuVse, security_commity: secCommity },
    thermo: thsVse.length ? { nalezu: thNalezuVse, blokeru: thBlokeruVse, oprava: thermoOprava, nesesouhlaseno: c ? (c.thermo_nesesouhlaseno || 0) : null } : null,
    rozhodnuti, ...seznamy(followVse, odchylky, pastiVse, Boolean(c && c.ok)), spory,
    uzavreni: c ? c.ok : false, chybejici_doklady: c ? (c.chybejici_doklady || []) : [], chybejici_commity: chybejiciCommity,
    security_commity: secCommity, ...(securityRadkem.length ? { security_radkem: [...securityRadkem] } : {}), bez_review: bezReview.slice(0, 8), kontext: c ? S(c.kontext).slice(0, 600) : '', commit_hlavni: historie().commit_hlavni, ...seznamyVysledku,
  }
}

// ---------- pokusy ----------
const stavCasti = () => casti.map(c => ({ id: c.id, hotovo: castiStav.get(c.id).hotovo, ...(castiStav.get(c.id).prostredi || zastavene.has(c.id) ? { prostredi: true } : {}) }))
let last = null, diag = null
// Dorovnání jen deploye (spec B2): z poslední brány bloku, nebo z obnovy nad doloženým stavem, kde se brána nepouštěla.
function dorovnaniMozne(x) { return Boolean(x && x.krokSelhal && !x.dorovnani && (posledniBrana || obnovaStavOk)) }
// Selhání, které další pokus neopraví (pahýl části mimo stavbu), ukončí blok hned: pokusy v návratu jsou ty, které proběhly.
let pokusuBylo = MAX_POKUSU
// Pokusy od 1: při obnově se pokusy před přerušeným vrátí z cache (stejné prompty). S bez_cache by se přehrály živě nad hotovým
// stromem, proto blok začne rovnou přerušeným pokusem (jeho předchůdce nezná: zadání bez „předchozí pokus selhal“).
// Agenti neodpovídají ani na sondu (1.12.0, spec F2): limit účtu není selhání řezu. Blok vrátí zastavení s fází agenti, pokus se nepočítá,
// diagnóza ani uzavření neběží. Obnova jde přes resumeFromRunId se stejnými args včetně obnova přerušeného běhu: volání před prvním
// selhaným se vrátí z cache i se svými seznamy, proto je návrat nenese a orchestrátor nic nezapisuje. Běh, který sám byl obnovou, vrací
// svou obnova (review N2): obnova bez ní změnila prompty od hranice obnovy, minula cache a přehrála živě deploy a kroky po nasazení
// podruhé, bez obnova-stav, a v pokusu 3 znovu zastavila blok na rozhodnuté vadě z diagnózy. Čas resetu blok nezná, čte ho z notifikace.
const zastavAgenti = n => {
  log(`řez ${NN} zastaven v pokusu ${n}: agenti neběží (${agentiDole.slice(0, 200)}); pokus se nepočítá, diagnóza ani uzavření neběží, blok čeká na obnovu přes resumeFromRunId se stejnými args${obnovaIn ? ' včetně obnova' : ''}`)
  return doLimitu({ ok: true, rez: NN, vysledek: 'zastaveno', faze: 'agenti', infra: true, infra_trida: 'ucet', detail: `agenti neběží: ${agentiDole}`.slice(0, 600), pokusy: n, ...(obnovaIn ? { obnova: obnovaIn } : {}),
    casti: stavCasti(), predavky: predavekCelkem, security_commity: trimList(securityCommity), ...(securityRadkem.length ? { security_radkem: [...securityRadkem] } : {}), bez_review: bezReview.slice(0, 8),
    ...seznamy([], [], [], true), spory: [], reports: [], rozhodnuti: [], ...historie(true) })
}
const duvodZastaveni = res => res.faze === 'vada-kriteria' ? 'vadné kritérium' : res.faze === 'deploy-odklad' ? `nasazení odloženo${res.nejdriv ? ` do ${res.nejdriv}` : ''}` : res.faze === 'deploy-vypadek' ? 'výpadek platformy (obnova bez člověka)' : 'infra selhání nasazení'
for (let n = obnovaHned ? obnovaPokus : 1; n <= MAX_POKUSU; n++) {
  P = n
  // Diagnóza jen před třetím pokusem a jen po známém selhání: při max_pokusu 1 by `n === MAX_POKUSU` spustil diagnózu bez předchozího
  // selhání a obnova od třetího pokusu selhání přerušeného běhu nezná.
  if (n === 3 && last) { await vstup('Diagnóza', ''); diag = await diagnose(last); log(diag ? `diagnóza: ${S(diag.pricina).slice(0, 160)}` : 'diagnóza bez výsledku') }
  if (agentiDole) return zastavAgenti(n)
  const res = await pokus(n, last, diag)
  if (agentiDole) return zastavAgenti(n)
  if (res.tabulka) return { ok: true, rez: NN, vysledek: 'selhalo', pokusy: 0, faze: 'refresh', detail: res.detail, diagnoza: null, follow_ups: [], spory: res.spory, reports: res.reports, rozhodnuti: [], odmitnute: [], security_commity: [], casti: stavCasti(), predavky: predavekCelkem }
  if (res.vysledek === 'hotovo') { log(`řez ${NN} hotový na pokus ${res.pokusy}${res.pokusy > n ? ` (obnova s pokusem ${obnovaPokus}: úspěšně doběhl už přehrávaný pokus ${n}, cache dřívějších pokusů neplatila)` : ''}, commit ${res.commit}`); return doLimitu({ ok: true, rez: NN, ...res, casti: stavCasti(), predavky: predavekCelkem }) }
  if (res.vysledek === 'zastaveno') { log(`řez ${NN} zastaven v pokusu ${n}: ${duvodZastaveni(res)} (${res.detail.slice(0, 160)}); pokus se nepočítá, blok čeká na obnovu od fáze ${res.faze === 'vada-kriteria' ? 'implementace' : 'deploy'}`); return doLimitu({ ok: true, rez: NN, ...res, casti: stavCasti(), predavky: predavekCelkem }) }
  log(`pokus ${n} selhal ve fázi ${res.faze}${dorovnaniMozne(res) && n < MAX_POKUSU ? ' (krok po nasazení: další pokus jen dorovná deploy)' : ''}`)
  if (sCastmi && res.faze !== 'implementace') opravaZ = res
  // Revize malého řezu jde dál jen do dorovnání deploye (to review nepouští); celý pokus malého řezu reviduje znovu sám.
  if (sCastmi || res.krokSelhal) revizeDrive.push(res.revize)
  driveSeznamy.follow.push(...pole(res.follow_ups)); driveSeznamy.odch.push(...pole(res.odchylky)); driveSeznamy.pasti.push(...pole(res.pasti_opravene))
  last = res
  if (res.konecny) { pokusuBylo = cisloPokusu(n); log(`pokus ${n}: selhání, které další pokus neopraví; blok končí bez dalšího pokusu a bez diagnózy`); break }
}
// Selhaný blok nese seznamy všech pokusů a fází na stropu předávek, ne jen posledního pokusu. Zapíše je uzavření v režimu selhání
// (návrat pak nese počty); když neproběhlo, jdou do návratu a zapíše je orchestrátor.
const vseSel = { follow: osudy([...driveSeznamy.follow, ...zeStropu.follow]), odch: trimList([...driveSeznamy.odch, ...zeStropu.odch]), pasti: trimList([...driveSeznamy.pasti, ...zeStropu.pasti]) }
const odmitnuteSel = sCastmi ? trimList(revizeDrive.flatMap(r => r.odmitnute)) : (last.odmitnute || [])
const reportsSel = trimList(last.reports)
let cSel = null
// Uzavření selhání běží i kvůli samotnému kroku pastí (review N4 dávky 2b): FAIL nebo prostředí z E2E bez jiných seznamů.
if (vseSel.follow.length || vseSel.odch.length || vseSel.pasti.length || e2eSelhani.kriteria.length) {
  await vstup('Uzavření', 'uzavreni')
  cSel = await closeSelhani({ faze: last.faze, detail: last.detail, pokusy: pokusuBylo, diag: diag && diag.pricina, follow_ups: vseSel.follow, odchylky: vseSel.odch, pasti: vseSel.pasti, odmitnute: odmitnuteSel, prostredi: prostrediStav, e2eSelhani,
    vysledek: { rez: NN, vysledek: 'selhalo', pokusy: pokusuBylo, faze: last.faze, ...dvereDosah(), follow_ups: vseSel.follow, odchylky: vseSel.odch, pasti_opravene: vseSel.pasti, reports: reportsSel, odmitnute: odmitnuteSel, nasazeni: historie().nasazeni, rozhodnuti: last.rozhodnuti || [], spory: pole(last.spory) } })
  log(cSel && cSel.ok ? `uzavření selhání: seznamy zapsané (${vseSel.follow.length} follow-upů)` : 'uzavření selhání neprošlo: seznamy jdou v návratu, zapíše je orchestrátor')
}
const zapsanoSel = Boolean(cSel && cSel.ok)
const souborSel = zapsanoSel ? S(cSel.vysledek_soubor).trim() : ''
// Podstatná pole první (při useknutí se ztratí jen konec seznamů); hashe fix(security) z deployů všech pokusů jdou i do selhaného
// návratu: commity v repu existují, orchestrátor je nesmí ztratit.
return doLimitu({ ok: true, rez: NN, vysledek: 'selhalo', pokusy: pokusuBylo, faze: last.faze, detail: S(last.detail).slice(0, 1000),
  diagnoza: diagNavrat(diag),
  casti: stavCasti(), predavky: predavekCelkem, security_commity: trimList(securityCommity), ...(securityRadkem.length ? { security_radkem: [...securityRadkem] } : {}), bez_review: bezReview.slice(0, 8), commit_hlavni: historie().commit_hlavni,
  rozhodnuti: last.rozhodnuti || [], spory: last.spory, ...seznamy(vseSel.follow, vseSel.odch, vseSel.pasti, zapsanoSel),
  ...(souborSel ? { reports_pocet: reportsSel.length, odmitnute_pocet: odmitnuteSel.length, nasazeni_pocet: historie().nasazeni.length, journal: 'docs/journal.md', vysledek_soubor: souborSel }
    : { reports: reportsSel, odmitnute: odmitnuteSel, nasazeni: historie(true).nasazeni }) })
