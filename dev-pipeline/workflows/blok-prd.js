export const meta = {
  name: 'blok-prd',
  description: 'dev-pipeline blok PRD jednoho řezu: PRD a E2E scénáře, nezávislá kontrola (měřidla kritérií se spouští už v kole 1), zapracování nálezů, delta kontrola jen nad změněnými místy. Žádné třetí kolo, zbylé nálezy jdou stavbě jako hypotézy. Režim zapracovani: jen zapracování nálezů orchestrátora do hotového PRD + delta kontrola.',
  whenToUse: 'Spouští orchestrátor /dev-pipeline:orchestrate před blokem stavby každého řezu. args: {cwd, plugin_root, vize, produkt, rez, plan_row, stav_po_minulem, hypotezy, follow_ups, app_pristup, profil, kontrakt_prd, kontrakt_rez}; režim zapracování navíc {rezim: "zapracovani", prd_path, e2e_path, nalezy: [...]}. Bez args nic nedělá.',
  phases: [
    { title: 'PRD', detail: 'PRD agent píše PRD a E2E scénáře řezu' },
    { title: 'Kontrola', detail: 'prd-check kolo 1, plný report do souboru' },
    { title: 'Zapracování', detail: 'PRD agent zapracuje nálezy a vrátí změněná místa' },
    { title: 'Delta kontrola', detail: 'prd-check jen nad změněnými místy; jen po blokujících nálezech kola 1, u lehkého profilu nikdy' },
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
const kontrakt = a.plugin_root ? `${a.plugin_root}/skills/orchestrate/KONTRAKT.md` : null
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
// Režim zapracování: orchestrátor odmítl odchylku od plánu nebo chybí pokrytí bodů vize; místo nového PRD (celý blok znovu)
// běží jen PRD agent v režimu zapracování nad hotovým PRD a delta prd-check nad změněnými místy.
const rezim = a.rezim === 'zapracovani' ? 'zapracovani' : 'novy'
const nalezyOrch = (Array.isArray(a.nalezy) ? a.nalezy.map(S) : (a.nalezy ? [S(a.nalezy)] : [])).filter(Boolean)
if (rezim === 'zapracovani' && (!a.prd_path || !nalezyOrch.length)) {
  log('blok-prd: režim zapracovani vyžaduje prd_path a nalezy – nic se nespustilo')
  return { ok: false, duvod: 'režim zapracovani vyžaduje prd_path a nalezy' }
}

// ---------- pomocné ----------
const cekej = ms => (ms > 0 && typeof setTimeout === 'function') ? new Promise(r => setTimeout(r, ms)) : Promise.resolve()
async function run(prompt, opts) {
  const label = opts.label || 'agent'
  for (let i = 0; i <= 2; i++) {
    let r = null
    try { r = await agent(prompt, opts) } catch (e) { log(`${label}: spuštění selhalo (${String(e && e.message || e).slice(0, 120)})`) }
    if (r) return r
    if (i < 2) { log(`${label}: agent nevrátil výsledek, opakuji (${i + 1}/2)`); await cekej(15000 * (i + 1)) }
  }
  return null
}
const ramec = [
  `Projekt: ${cwd} (absolutní cesty, git jen na vize větvi).`,
  `Vize: ${a.vize}${produkt ? ` · Produktová severka: ${produkt}` : ''}${kontrakt ? ` · Kontrakt souborů a agentů: ${kontrakt}` : ''}.`,
  'Běh je autonomní: uživatele se neptáš. Rozpor nebo chybějící rozhodnutí ve vizi zapiš do docs/vize-spory.md (formát v kontraktu), rozhodni konzervativně a pokračuj.',
  'Tvůj finální výstup je strukturovaný návrat pro orchestrátor (schéma je vynucené), ne zpráva člověku. Do textových polí piš stručně, žádné výpisy souborů ani diffů.',
].join('\n')

// ---------- schémata ----------
const PRD_SCHEMA = {
  type: 'object',
  required: ['prd_path', 'e2e_path', 'cil', 'kriteria', 'souhrn', 'lesen', 'zapis_do_ziveho', 'runtime_dopad'],
  properties: {
    prd_path: { type: 'string', description: 'absolutní cesta k docs/prd/rez-NN-<slug>.md' },
    e2e_path: { type: 'string', description: 'absolutní cesta k docs/e2e/rez-NN.md' },
    cil: { type: 'string', description: 'cíl řezu jednou větou' },
    kriteria: { type: 'integer', description: 'počet akceptačních kritérií' },
    souhrn: { type: 'string', description: 'souhrn pro orchestrátora, max 20 řádků: rozsah (co ano / co ne), body vize, dotčené UI plochy, zápisy do živých systémů, rizika, odchylky od plánu' },
    lesen: { type: 'boolean', description: 'řez staví lešení (zkušební UI nebo nástroj mimo produktové plochy vize)' },
    lesen_popis: { type: 'string', description: 'co je lešení, za jakou přístupovou hranicí sedí a kdy se odstraní' },
    zapis_do_ziveho: { type: 'boolean', description: 'řez zapisuje do živého vnějšího systému' },
    zapis_popis: { type: 'string', description: 'do jakého systému, jaké operace a o které Povolení z vize se opírá (doslovně)' },
    runtime_dopad: { type: 'boolean', description: 'false = řez bez runtime dopadu (jen testy, tooling, dokumentace)' },
    nove_ui_plochy: { type: 'array', items: { type: 'string' }, description: 'UI plochy, které PRD zavádí a vize je v seznamu UI ploch nejmenuje (prázdné = žádné)' },
    pokryte_body_vize: { type: 'array', items: { type: 'string' }, description: 'čísla Cílů a požadavků vize, které řez plní (C1, F3, …)' },
    odchylky_od_planu: { type: 'string', description: 'v čem se PRD liší od řádku plánu a proč; prázdné = bez odchylky' },
    spory: { type: 'array', items: { type: 'string' }, description: 'nové záznamy ve vize-spory.md, každý jednou větou' },
    zmenena_mista: { type: 'array', items: { type: 'string' }, description: 'jen při zapracování nálezů: sekce nebo kritéria PRD/E2E, která se změnila' },
    odmitnute: { type: 'array', items: { type: 'object', required: ['id', 'duvod'], properties: { id: { type: 'string' }, duvod: { type: 'string' } } }, description: 'jen při zapracování: nálezy, které jsi po ověření proti kódu nezapracoval, s důvodem' },
    oblasti: { type: 'array', items: { type: 'string' }, description: 'dotčené moduly nebo oblasti kódu (stejný slovník jako návrat stavby: modul, ne soubor); orchestrátor podle nich pozná překryv s uzavřenými řezy' },
    doklad_pred: { type: 'boolean', description: 'true = PRD předepisuje doklad stavu před nasazením (migrace mění, přesouvá nebo maže existující data, nebo je nevratná; nebo pokyny majitele žádají doklad před každou migrací)' },
    doklad_popis: { type: 'string', description: 'co se před migrací zachytí (tabulky, počty, vzorky, dotazy); prázdné bez dokladu' },
    e2e_sekce: { type: 'array', items: { type: 'string' }, description: 'názvy vzájemně nezávislých sekcí E2E scénářů, jen když má řez víc než 12 kritérií (blok stavby je ověří dvěma verifikátory souběžně); jinak prázdné' },
  },
}
const CHECK_SCHEMA = {
  type: 'object',
  required: ['verdikt', 'nalezu', 'blokujicich', 'report_path'],
  properties: {
    verdikt: { type: 'string', enum: ['ready', 'needs-fixes'] },
    nalezu: { type: 'integer' },
    blokujicich: { type: 'integer' },
    osy: { type: 'array', items: { type: 'string' }, description: 'osy, na kterých nález padl (A úplnost vůči vizi, B technická validita, C kritéria, D rozsah, E optimalita)' },
    report_path: { type: 'string', description: 'absolutní cesta k plnému reportu' },
    nalezy_ids: { type: 'array', items: { type: 'string' }, description: 'identifikátory nálezů v reportu (N1, N2, …), blokující první' },
  },
}

// Pravidla kritérií, která se opakovaně vyplatila (důkaz: dva opakované pokusy v běhu uklid-po-sklik padly na kritériích psaných jako výčet jmen a opsané číslo).
const pravidlaKriterii = 'Kritéria: vlastnost + kanál deklarované výjimky + měřidlo v repu (skript nebo dotaz, bere revizi parametrem), nikdy „právě tyto N jmenované soubory/výjimky“ ani opsané číslo bez dotazu; měřitelná nad pracovním stromem před uzavíracím commitem a v prostředí, které E2E má (bez credentialu, který verifikátor nemá); nálezy z minulých řezů a follow-upy nejsou kritéria tohoto řezu, patří do sekce „Pozor na“ nebo mimo rozsah.'

// ---------- 1. PRD ----------
let prd
if (rezim === 'zapracovani') {
  prd = { prd_path: S(a.prd_path), e2e_path: S(a.e2e_path || `${cwd}/docs/e2e/rez-${NN}.md`), cil: '', kriteria: 0, souhrn: '', spory: [] }
  log(`blok PRD řez ${NN}: režim zapracování (${nalezyOrch.length} nálezů orchestrátora)`)
} else {
  phase('PRD')
  log(`blok PRD řez ${NN}: ${S(row.nazev || row.name || '')}`)
  const prdPrompt = `${ramec}

Úkol: napiš PRD a E2E scénáře řezu ${NN} podle přiděleného řádku plánu. Řez vybral orchestrátor, ty ho nevybíráš ani nerozšiřuješ; rozsah je řádek plánu a body vize v něm. Když realita kódu plán nesnese, napiš odchylku do odchylky_od_planu a PRD piš na to, co jde postavit a ověřit.
Řádek plánu: ${JSON.stringify(row)}
${stavPoMinulem ? `Stav po předchozím řezu (fakt, přečti): ${stavPoMinulem}\n` : ''}${hypotezy.length ? `Hypotézy od orchestrátora k ověření (ne fakta): ${hypotezy.join(' | ')}\n` : ''}${kontraktPrd ? `Řez závisí na řezu ${kontraktRez}, který se právě staví; jeho PRD je kontrakt: ${kontraktPrd}. Rozhraní, symboly a data, které z něj potřebuješ, ber jako dané a v PRD je označ „předpoklad podle PRD řezu ${kontraktRez}“; proti kódu je neověřuj, kód je ještě nemá (stavba tvé PRD před implementací přeměří nad dnešním stromem).\n` : ''}${profil === 'lehky' ? 'Profil řezu je lehký (bez runtime dopadu: měřidlo, otisk, dokumentace, skript): PRD krátké, kritéria dokládaná příkazem nebo souborem, žádné E2E v prohlížeči.\n' : ''}${pravidlaKriterii}
Follow-ups a spory: z ${followUps} a ${spory} čti jen záznamy, které se dotýkají bodů vize, modulů a cest tohoto řezu (grep podle F čísel, jmen modulů a cest z řádku plánu), plus posledních 10 záznamů; celé soubory nečti. Dotčené otevřené follow-ups dej do PRD do sekce „Pozor na“ (past se opravuje v řezu, když je ve změněných souborech; jinak zůstane follow-up).
Doklad před nasazením: když řez nese migraci, která mění, přesouvá nebo maže existující data, nebo je nevratná${appPristup ? ', nebo když pokyny majitele k prostředí žádají doklad před každou migrací' : ''}, napiš do PRD sekci „Doklad před nasazením“ (co přesně se před migrací zachytí: tabulky, počty, vzorky, dotazy jen pro čtení) a vrať doklad_pred: true; u aditivní migrace a u řezu bez migrace doklad nepředepisuj.
E2E scénáře piš v sekcích, které jsou na sobě nezávislé (žádná sekce nezávisí na datech, která jiná sekce vytváří nebo maže); když má řez víc než 12 kritérií, vrať názvy sekcí v e2e_sekce, aby je blok stavby ověřil dvěma verifikátory souběžně.
${appPristup ? `Pokyny majitele k prostředí (přístup, nasazení, doklady): ${appPristup}\n` : ''}Soubory: docs/prd/rez-${NN}-<slug>.md a docs/e2e/rez-${NN}.md (frontmatter a pravidla podle kontraktu a tvé instrukce). Nic jiného needituj. Kontrolu PRD dělá jiný agent.`
  prd = await run(prdPrompt, { label: `prd:řez ${NN}`, phase: 'PRD', agentType: 'dev-pipeline:prd', schema: PRD_SCHEMA, model: 'opus', effort: 'high' })
  if (!prd) return { ok: false, rez: NN, duvod: 'PRD agent nevrátil výsledek ani po opakování' }
  log(`PRD: ${prd.kriteria} kritérií${prd.lesen ? ', lešení' : ''}${prd.zapis_do_ziveho ? ', zápis do živého systému' : ''}${prd.doklad_pred ? ', doklad před migrací' : ''}${(prd.e2e_sekce || []).length ? `, E2E sekce ${prd.e2e_sekce.length}` : ''}${(prd.nove_ui_plochy || []).length ? `, nové UI plochy mimo vizi: ${prd.nove_ui_plochy.join(', ')}` : ''}`)
}

// ---------- 2. kontrola ----------
const checkPrompt = (kolo, zmenena) => `${ramec}

Úkol: prd-check kolo ${kolo} pro řez ${NN}.
PRD: ${prd.prd_path} · E2E: ${prd.e2e_path} · řádek plánu: ${JSON.stringify(row)}
Report zapiš do ${cwd}/docs/reviews/rez-${NN}-prd-check-kolo-${kolo}.md a vrať jen verdikt, počty, osy a identifikátory nálezů (N1, N2, …), nálezy samotné nevracej.
${kolo === 1
    ? `Kontroluj úplnost vůči řádku plánu a bodům vize, technickou validitu proti skutečnému kódu (Serena), kvalitu kritérií, rozsah řezu a to, že PRD nezavádí UI plochu, mantinel ani zápis do živého systému, který vize nejmenuje. Na ose C navíc: každé kritérium s měřidlem (rg, počet, skript, dotaz) SPUSŤ teď nad dnešním stromem a výsledek zapiš do reportu; kritérium tvaru „právě tyto N jmenované soubory/výjimky“ nebo opsané číslo bez dotazu je nález „výčet místo vlastnosti“; kritérium závislé na uzavíracím commitu, na credentialu, který E2E prostředí nemá, nebo na nálezu z minulého řezu mimo rozsah tohoto je nález. Doklad před nasazením: PRD ho předepisuje právě tehdy, když migrace mění, přesouvá nebo maže existující data, nebo je nevratná${appPristup ? ', nebo když pokyny majitele žádají doklad před každou migrací' : ''}; chybějící i zbytečný doklad je nález. Sekce E2E scénářů musí být vzájemně nezávislé (žádná nezávisí na datech jiné). Follow-ups a vize-spory čti jen grepem podle bodů vize, modulů a cest řezu, ne celé.${kontraktPrd ? ` Tvrzení označená „předpoklad podle PRD řezu ${kontraktRez}“ ověřuj proti tomu PRD (${kontraktPrd}), ne proti kódu; kód je ještě nemá.` : ''}${appPristup ? ` Pokyny majitele k prostředí: ${appPristup}` : ''}`
    : `Delta kontrola: prověř VÝHRADNĚ tato změněná místa: ${zmenena.join(' | ')}. Co prošlo kolem 1, znovu nekontroluj. Měřidla změněných kritérií spusť. Zbylé nálezy označ; třetí kolo nebude, půjdou stavbě jako hypotézy.`}`
let k1 = null
if (rezim === 'novy') {
  phase('Kontrola')
  k1 = await run(checkPrompt(1), { label: `prd-check:řez ${NN}:1`, phase: 'Kontrola', agentType: 'dev-pipeline:prd-check', schema: CHECK_SCHEMA, model: 'opus', effort: 'high' })
  if (!k1) log('prd-check kolo 1 nevrátil výsledek, pokračuji bez kontroly')
  else log(`prd-check 1: ${k1.verdikt}, ${k1.nalezu} nálezů, ${k1.blokujicich} blokujících`)
}

// ---------- 3. zapracování + 4. delta kontrola ----------
let fix = null, k2 = null
if (rezim === 'zapracovani' || (k1 && k1.verdikt === 'needs-fixes')) {
  phase('Zapracování')
  const zdroj = rezim === 'zapracovani'
    ? `Nálezy orchestrátora (schválení souhrnu PRD): ${nalezyOrch.join(' | ').slice(0, 2000)}.`
    : `Report: ${k1.report_path} (nálezy ${(k1.nalezy_ids || []).join(', ') || 'všechny'}).`
  const fixPrompt = `${ramec}

Úkol: zapracuj nálezy do PRD řezu ${NN}. ${zdroj} PRD: ${prd.prd_path} · E2E: ${prd.e2e_path} · řádek plánu: ${JSON.stringify(row)}
Každý nález je hypotéza: ověř proti kódu a vizi; co míří vedle, nezapracuj a uveď v odmitnute s důvodem. Rozsah řezu nerozšiřuj; nález žádající novou plochu, mantinel nebo zápis mimo vizi zapiš do vize-spory a odmítni. ${pravidlaKriterii} Vrať seznam změněných míst (sekce, kritéria) a aktualizovaný souhrn pro orchestrátora${rezim === 'zapracovani' ? ' včetně cíle, počtu kritérií a všech příznaků (lešení, zápis do živého, runtime dopad, body vize)' : ''}.`
  fix = await run(fixPrompt, { label: `prd-fix:řez ${NN}`, phase: 'Zapracování', agentType: 'dev-pipeline:prd', schema: PRD_SCHEMA, model: 'opus', effort: 'high' })
  if (fix) {
    // Delta kontrola jen po blokujících nálezech kola 1 (nebo v režimu zapracování, kde kolo 1 nebylo); u lehkého profilu nikdy.
    // Zbylé nálezy bez delta kontroly jdou stavbě jako hypotézy (report kola 1). V běhu doplneni-webu stála delta 7 min Opus high u všech 18 bloků.
    const deltaNutna = rezim === 'zapracovani' || (profil !== 'lehky' && k1 && k1.blokujicich > 0)
    if (deltaNutna) {
      const zmenena = (fix.zmenena_mista || []).length ? fix.zmenena_mista : ['celé PRD (agent změněná místa neuvedl)']
      phase('Delta kontrola')
      k2 = await run(checkPrompt(2, zmenena), { label: `prd-check:řez ${NN}:2`, phase: 'Delta kontrola', agentType: 'dev-pipeline:prd-check', schema: CHECK_SCHEMA, model: 'opus', effort: 'high' })
      if (k2) log(`prd-check 2 (delta): ${k2.verdikt}, ${k2.nalezu} nálezů, ${k2.blokujicich} blokujících`)
    } else log(`zapracováno (${(fix.zmenena_mista || []).length} míst); delta kontrola se nekoná (${profil === 'lehky' ? 'lehký profil' : 'kolo 1 bez blokujících nálezů'}), zbylé nálezy jdou stavbě jako hypotézy`)
  } else {
    log(rezim === 'zapracovani' ? 'zapracování nálezů selhalo, PRD zůstává beze změny' : 'zapracování nálezů selhalo, PRD zůstává v podobě po kole 1')
    if (rezim === 'zapracovani') return { ok: false, rez: NN, duvod: 'PRD agent v režimu zapracování nevrátil výsledek' }
  }
}

const posledni = k2 || k1
const fin = fix || prd
return {
  ok: true,
  rez: NN,
  rezim,
  profil,
  oblasti: [...new Set([...(prd.oblasti || []), ...((fix && fix.oblasti) || [])].map(S).map(x => x.trim()).filter(Boolean))],
  doklad_pred: Boolean(fix && fix.doklad_pred != null ? fix.doklad_pred : prd.doklad_pred), doklad_popis: S((fix && fix.doklad_popis) || prd.doklad_popis),
  e2e_sekce: ((fix && (fix.e2e_sekce || []).length) ? fix.e2e_sekce : (prd.e2e_sekce || [])).map(S).filter(Boolean),
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
  spory: [...(prd.spory || []), ...((fix && fix.spory) || [])],
  odmitnute_nalezy: (fix && fix.odmitnute) || [],
  kontrola: posledni ? { kola: k2 ? 2 : 1, verdikt: posledni.verdikt, nalezu: posledni.nalezu, blokujicich: posledni.blokujicich, report: posledni.report_path } : null,
  // Bez delta kontroly jdou stavbě nálezy kola 1 (zapracované, k ověření); s delta kontrolou jen to, co po ní zbylo.
  hypotezy_pro_stavbu: (posledni && posledni.verdikt === 'needs-fixes') ? { report: posledni.report_path, ids: posledni.nalezy_ids || [], zapracovano: Boolean(fix && !k2) } : null,
}
