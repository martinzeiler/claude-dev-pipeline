export const meta = {
  name: 'blok-prd',
  description: 'dev-pipeline blok PRD jednoho řezu: PRD a E2E scénáře, nezávislá kontrola, zapracování nálezů, delta kontrola jen nad změněnými místy. Žádné třetí kolo, zbylé nálezy jdou stavbě jako hypotézy.',
  whenToUse: 'Spouští orchestrátor /dev-pipeline:orchestrate před blokem stavby každého řezu. args: {cwd, plugin_root, vize, produkt, rez, plan_row, stav_po_minulem, hypotezy, follow_ups}. Bez args nic nedělá.',
  phases: [
    { title: 'PRD', detail: 'PRD agent píše PRD a E2E scénáře řezu' },
    { title: 'Kontrola', detail: 'prd-check kolo 1, plný report do souboru' },
    { title: 'Zapracování', detail: 'PRD agent zapracuje nálezy a vrátí změněná místa' },
    { title: 'Delta kontrola', detail: 'prd-check jen nad změněnými místy' },
  ],
}

// ---------- vstup ----------
let a = args
if (typeof a === 'string') { try { a = JSON.parse(a) } catch { a = null } }
if (!a || typeof a !== 'object' || !a.cwd || !a.vize || !a.rez || !a.plan_row) {
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

// ---------- 1. PRD ----------
phase('PRD')
log(`blok PRD řez ${NN}: ${S(row.nazev || row.name || '')}`)
const prdPrompt = `${ramec}

Úkol: napiš PRD a E2E scénáře řezu ${NN} podle přiděleného řádku plánu. Řez vybral orchestrátor, ty ho nevybíráš ani nerozšiřuješ; rozsah je řádek plánu a body vize v něm. Když realita kódu plán nesnese, napiš odchylku do odchylky_od_planu a PRD piš na to, co jde postavit a ověřit.
Řádek plánu: ${JSON.stringify(row)}
${stavPoMinulem ? `Stav po předchozím řezu (fakt, přečti): ${stavPoMinulem}\n` : ''}${hypotezy.length ? `Hypotézy od orchestrátora k ověření (ne fakta): ${hypotezy.join(' | ')}\n` : ''}Projdi ${followUps} a otevřené položky, které se dotýkají oblastí tohoto řezu, dej do PRD do sekce „Pozor na“ (past se opravuje v řezu, když je ve změněných souborech; jinak zůstane follow-up).
Soubory: docs/prd/rez-${NN}-<slug>.md a docs/e2e/rez-${NN}.md (frontmatter a pravidla podle kontraktu a tvé instrukce). Nic jiného needituj. Kontrolu PRD dělá jiný agent.`
const prd = await run(prdPrompt, { label: `prd:řez ${NN}`, phase: 'PRD', agentType: 'dev-pipeline:prd', schema: PRD_SCHEMA, model: 'opus', effort: 'high' })
if (!prd) return { ok: false, rez: NN, duvod: 'PRD agent nevrátil výsledek ani po opakování' }
log(`PRD: ${prd.kriteria} kritérií${prd.lesen ? ', lešení' : ''}${prd.zapis_do_ziveho ? ', zápis do živého systému' : ''}${(prd.nove_ui_plochy || []).length ? `, nové UI plochy mimo vizi: ${prd.nove_ui_plochy.join(', ')}` : ''}`)

// ---------- 2. kontrola ----------
const checkPrompt = (kolo, zmenena) => `${ramec}

Úkol: prd-check kolo ${kolo} pro řez ${NN}.
PRD: ${prd.prd_path} · E2E: ${prd.e2e_path} · řádek plánu: ${JSON.stringify(row)}
Report zapiš do ${cwd}/docs/reviews/rez-${NN}-prd-check-kolo-${kolo}.md a vrať jen verdikt, počty, osy a identifikátory nálezů (N1, N2, …), nálezy samotné nevracej.
${kolo === 1
    ? 'Kontroluj úplnost vůči řádku plánu a bodům vize, technickou validitu proti skutečnému kódu (Serena), kvalitu kritérií, rozsah řezu a to, že PRD nezavádí UI plochu, mantinel ani zápis do živého systému, který vize nejmenuje.'
    : `Delta kontrola: prověř VÝHRADNĚ tato změněná místa: ${zmenena.join(' | ')}. Co prošlo kolem 1, znovu nekontroluj. Zbylé nálezy označ; třetí kolo nebude, půjdou stavbě jako hypotézy.`}`
phase('Kontrola')
const k1 = await run(checkPrompt(1), { label: `prd-check:řez ${NN}:1`, phase: 'Kontrola', agentType: 'dev-pipeline:prd-check', schema: CHECK_SCHEMA, model: 'opus', effort: 'high' })
if (!k1) log('prd-check kolo 1 nevrátil výsledek, pokračuji bez kontroly')
else log(`prd-check 1: ${k1.verdikt}, ${k1.nalezu} nálezů, ${k1.blokujicich} blokujících`)

// ---------- 3. zapracování + 4. delta kontrola ----------
let fix = null, k2 = null
if (k1 && k1.verdikt === 'needs-fixes') {
  phase('Zapracování')
  const fixPrompt = `${ramec}

Úkol: zapracuj nálezy prd-checku do PRD řezu ${NN}. Report: ${k1.report_path} (nálezy ${(k1.nalezy_ids || []).join(', ') || 'všechny'}). PRD: ${prd.prd_path} · E2E: ${prd.e2e_path} · řádek plánu: ${JSON.stringify(row)}
Každý nález je hypotéza: ověř proti kódu a vizi; co míří vedle, nezapracuj a uveď v odmitnute s důvodem. Rozsah řezu nerozšiřuj; nález žádající novou plochu, mantinel nebo zápis mimo vizi zapiš do vize-spory a odmítni. Vrať seznam změněných míst (sekce, kritéria) a aktualizovaný souhrn pro orchestrátora.`
  fix = await run(fixPrompt, { label: `prd-fix:řez ${NN}`, phase: 'Zapracování', agentType: 'dev-pipeline:prd', schema: PRD_SCHEMA, model: 'opus', effort: 'high' })
  if (fix) {
    const zmenena = (fix.zmenena_mista || []).length ? fix.zmenena_mista : ['celé PRD (agent změněná místa neuvedl)']
    phase('Delta kontrola')
    k2 = await run(checkPrompt(2, zmenena), { label: `prd-check:řez ${NN}:2`, phase: 'Delta kontrola', agentType: 'dev-pipeline:prd-check', schema: CHECK_SCHEMA, model: 'opus', effort: 'high' })
    if (k2) log(`prd-check 2 (delta): ${k2.verdikt}, ${k2.nalezu} nálezů, ${k2.blokujicich} blokujících`)
  } else log('zapracování nálezů selhalo, PRD zůstává v podobě po kole 1')
}

const posledni = k2 || k1
const fin = fix || prd
return {
  ok: true,
  rez: NN,
  prd_path: prd.prd_path,
  e2e_path: prd.e2e_path,
  cil: prd.cil,
  kriteria: prd.kriteria,
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
  hypotezy_pro_stavbu: (posledni && posledni.verdikt === 'needs-fixes') ? { report: posledni.report_path, ids: posledni.nalezy_ids || [] } : null,
}
