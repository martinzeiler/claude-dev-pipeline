// Sdílené stuby suchého běhu: výchozí úspěšné odpovědi agentů podle labelu (§ 1.1 spec 1.4.0), ne podle schématu.
// Label je veřejné rozhraní bloku (čte ho co-dela.sh, hook hlídače i lidé v /workflows); schéma se mění s každou verzí bloku
// a stub podle schématu (vzor z diagnózy řezu 01) by nové pole tiše přijal i tam, kde blok volá jiného agenta, než má.
// Label, který tu neznáme, harness hlásí jako chybu scénáře: odchylka od § 1.1 je nález, ne detail.
import { createHash } from 'node:crypto'

// Scénář vrátí NIC, když má agent „nevrátit výsledek“ (run() bloku pak opakuje); null znamená výchozí stub.
export const NIC = Symbol('agent nevrátil výsledek')
export const S = v => String(v == null ? '' : v)
export const hash = s => createHash('sha1').update(S(s)).digest('hex')

export const CWD = '/sucho/projekt'
export const PLUGIN = '/sucho/plugin'
export const NN = '05'

// ---------- args bloků ----------
export const argsStavby = (extra = {}) => ({
  cwd: CWD, plugin_root: PLUGIN, vize: `${CWD}/docs/vize/sucho.md`, rez: 5,
  prd_path: `${CWD}/docs/prd/rez-${NN}-sucho.md`, e2e_path: `${CWD}/docs/e2e/rez-${NN}.md`,
  runbook: 'docs/dev-runbook.md', deploy_mode: 'config', runtime_dopad: true, kriteria: 8, ...extra,
})
export const argsPrd = (extra = {}) => ({
  cwd: CWD, plugin_root: PLUGIN, vize: `${CWD}/docs/vize/sucho.md`, rez: 5, profil: 'plny',
  plan_row: { rez: 5, nazev: 'Suchý řez', body: ['C1', 'F2'], oblasti: ['sucho'] }, ...extra,
})
export const argsKolecko = (extra = {}) => ({
  cwd: CWD, plugin_root: PLUGIN, vize: `${CWD}/docs/vize/sucho.md`, base: 'main', runbook: 'docs/dev-runbook.md', deploy_mode: 'config', ...extra,
})

// Části podle § 1.6: [id, zavisi_na] → pole objektů s disjunktními soubory a cestou PRD části.
export const souboryCasti = id => [`apps/sucho/${id.toLowerCase()}/modul.ts`, `apps/sucho/${id.toLowerCase()}/modul.test.ts`]
export const prdCasti = id => `${CWD}/docs/prd/rez-${NN}-cast-${id}.md`
export const casti = defs => defs.map(([id, zavisi = []]) => ({
  id, nazev: `část ${id}`, soubory: [`apps/sucho/${id.toLowerCase()}/**`], kriteria: [`AK-${id}`], odhad_radku: 1000, zavisi_na: zavisi, prd_path: prdCasti(id),
}))

// ---------- label ----------
// implement:řez 05:část K1:1:n2 → { typ: 'implement', rez: '05', cast: 'K1', role: 'cast', pokus: 1, naslednik: 2 }
export function parsujLabel(label) {
  const L = S(label)
  const m = /^(.*?)(?::n(\d+))?$/.exec(L)
  const zaklad = m[1]
  const cleny = zaklad.split(':')
  const o = { label: L, zaklad, typ: cleny[0], naslednik: m[2] ? Number(m[2]) : 1, rez: null, kolecko: false, cast: null, role: null, cisla: [], dalsi: [] }
  for (const c of cleny.slice(1)) {
    let x
    if ((x = /^řez (\d+)$/.exec(c))) o.rez = x[1]
    else if (c === 'kolečko') o.kolecko = true
    else if ((x = /^část (.+)$/.exec(c))) o.cast = x[1]
    else if (c === 'kontrakt' || c === 'integrace' || c === 'oprava') o.role = c
    else if (/^\d+$/.test(c)) o.cisla.push(Number(c))
    else o.dalsi.push(c)
  }
  if (o.typ === 'prd-část' && !o.cast) o.cast = o.dalsi.shift() || null
  if (o.typ === 'implement') { o.pokus = o.cisla.length ? o.cisla[o.cisla.length - 1] : null; o.role = o.role || (o.cast ? 'cast' : 'maly') }
  if (o.typ === 'review' || o.typ === 'thermo') o.role = o.role || (o.cast ? 'cast' : null)
  if (o.typ === 'e2e' || o.typ === 'kriteria') { o.kolo = o.cisla[0] || null; o.pismeno = o.dalsi[0] || null }
  return o
}

// Pokus, ve kterém blok právě je: číslo posledního implementačního volání (malý řez, kontrakt, část, integrace i oprava ho nesou).
export function pokusZ(stav) {
  for (let i = stav.volani.length - 1; i >= 0; i--) {
    const l = parsujLabel(stav.volani[i].label)
    if (l.typ === 'implement' && l.pokus) return l.pokus
  }
  return 1
}

// ---------- výchozí odpovědi ----------
const rep = (cwd, label) => `${cwd}/docs/reviews/sucho-${S(label).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')}.md`

export const zelenaBrana = (extra = {}) => ({
  typecheck: true, proslo: 120, selhalo: 0, exit_kod: 0, selhavajici: [], vystup_path: `${CWD}/docs/reviews/sucho-verify.log`,
  prikazy: ['pnpm typecheck', 'pnpm test'], kontroly: ['lint · ok'], kontroly_ok: true,
  meridla: ['AK3 · node scripts/pocet.mjs · 7 · ok'], meridla_ok: true, marker: hash('strom'), ...extra,
})

export const e2ePass = (celkem, extra = {}) => ({
  vysledek: 'pass', celkem, pass: celkem, castecne: 0, fail: 0, fail_kriteria: [], castecna_kriteria: [], vadna_kriteria: [],
  zavazne_mimo_ak: [], kosmeticke: [], report_path: `${CWD}/docs/reviews/sucho-e2e.md`, prostredi: '', ...extra,
})

export const oprava = (extra = {}) => ({
  opraveno: 1, zmenena_mista: ['apps/sucho/rez.ts: uloz'], odmitnuto: [], jinak_nez_nalez: [], rozsireny_zasah: false,
  typecheck: true, testy_zelene: true, follow_ups: [], spory: [], ...extra,
})

function impl(l) {
  const soubory = l.role === 'cast' ? souboryCasti(l.cast)
    : l.role === 'kontrakt' ? ['packages/kontrakt/typy.ts', 'packages/db/migrace/0005_sucho.sql']
      : l.role === 'integrace' ? ['apps/sucho/registrace.ts']
        : l.role === 'oprava' ? ['apps/sucho/oprava.ts']
          : ['apps/sucho/rez.ts', 'apps/sucho/rez.test.ts']
  return {
    stav: 'hotovo', souhrn: `stub ${l.zaklad}`, typecheck: true, testy_zelene: true, novych_testu: 2, oblasti: ['sucho'],
    soubory, mimo_hranici: [], zmenena_mista: l.role === 'oprava' ? ['apps/sucho/oprava.ts: opravPricinu'] : soubory,
    odchylky_od_prd: [], pasti_opravene: [], follow_ups: [], spory: [],
  }
}

// Vrací undefined pro label mimo § 1.1; harness to hlásí jako chybu scénáře.
export function vychozi(label, prompt, opts, stav) {
  const l = parsujLabel(label)
  const a = (stav && stav.args) || {}
  const cwd = S(a.cwd) || CWD
  const nn = l.rez || NN
  const report_path = rep(cwd, label)
  switch (l.typ) {
    case 'prd': return {
      prd_path: `${cwd}/docs/prd/rez-${nn}-sucho.md`, e2e_path: `${cwd}/docs/e2e/rez-${nn}.md`, cil: 'suchý řez', kriteria: 8, souhrn: 'stub',
      lesen: false, zapis_do_ziveho: false, runtime_dopad: true, oblasti: ['sucho'], pokryte_body_vize: ['C1'], spory: [],
      casti: [], odhad_radku: 900, kontrakt_potreba: false, e2e_sekce: [],
    }
    case 'prd-část': return { prd_path: `${cwd}/docs/prd/rez-${nn}-cast-${l.cast}.md`, kriteria: 2, souhrn: `stub část ${l.cast}`, kontrakt_doplnit: [], spory: [] }
    case 'prd-check': case 'prd-refresh': return { verdikt: 'ready', nalezu: 0, blokujicich: 0, osy: [], report_path, nalezy_ids: [] }
    case 'prd-fix': return l.cast
      ? { prd_path: `${cwd}/docs/prd/rez-${nn}-cast-${l.cast}.md`, kriteria: 2, souhrn: 'stub', zmenena_mista: [`část ${l.cast}: postup`], kontrakt_doplnit: [], spory: [] }
      : { prd_path: `${cwd}/docs/prd/rez-${nn}-sucho.md`, e2e_path: `${cwd}/docs/e2e/rez-${nn}.md`, cil: 'suchý řez', kriteria: 8, souhrn: 'stub',
        lesen: false, zapis_do_ziveho: false, runtime_dopad: true, zmenena_mista: ['AK2'], odmitnute: [], spory: [] }
    case 'prd-refresh-fix': return { zmenena_mista: [], odmitnute: [], souhrn: 'stub', spory: [] }
    case 'implement': return impl(l)
    case 'thermo': return { blokeru: 0, nalezu: 0, report_path, soubory: [], souhrn: 'stub' }
    case 'review': case 'security': return { nalezu: 0, blokujicich: 0, balicky: [], report_path, follow_up_ids: [] }
    case 'triáž': return { nalezu: 0, opravit_ted: 0, follow_up: 0, odmitnuto: 0, balicky: [], report_path, follow_ups: [], odmitnute: [], sporne: [] }
    case 'fix': case 'fix-thermo': case 'fix-brana': case 'fix-e2e': case 'fix-security': return oprava()
    // Věrný agent brány vrací jako vystup_path cestu, kam mu zadání výstup uložit (blok ji smí předat E2E místo rep()).
    case 'verify': { const m = /ulož do (\S+?\.md)/.exec(S(prompt)); return zelenaBrana(m ? { vystup_path: m[1] } : {}) }
    case 'doklad': return { ok: true, path: `${cwd}/docs/e2e/rez-${nn}-doklad-pred.md`, souhrn: 'stub' }
    case 'deploy': return {
      stav: 'success', commit: hash(`${label}#${stav ? stav.pocty[label] : 0}`), commit_zapisu: hash(`zápis ${label}`), kroky_po_nasazeni: [],
      infra: false, report_path: `${cwd}/docs/e2e/rez-${nn}-nasazeni.md`, security_commity: [], health: 'SUCCESS + /api/health build', url: 'https://sucho.example',
    }
    case 'commit': return { stav: 'commit-only', commit: hash(`${label}#${stav ? stav.pocty[label] : 0}`), security_commity: [], duvod: '' }
    case 'e2e': case 'kriteria': return e2ePass(l.pismeno ? 4 : (Number(a.kriteria) || 8), { report_path })
    case 'e2e-scénáře': return { e2e_path: `${cwd}/docs/e2e/kolecko.md`, kriterii: 5, plochy: ['sucho'] }
    case 'diagnose': return { pricina: 'stub', doporuceni: 'stub', smycka_postavena: true }
    case 'uzavření': return { ok: true, thermo_nesesouhlaseno: 0, chybejici_doklady: [], commit_overeny: '', chybejici_commity: [], kontext: 'implement 180 k, 0 compactů, 0 předávek' }
    case 'závěr': return { ok: true, review_passed: true, chybejici_commity: [] }
    default: return undefined
  }
}

// Výchozí odpověď pro label s přepsanými poli (scénář mění jen to, na čem jeho větev stojí).
export const stub = (label, extra = {}) => ({ ...vychozi(label, '', {}, null), ...extra })

// ---------- kontroly pro over() ----------
// Souběh se pozná z logických hodin harnessu: dvě volání běží souběžně, když každé začalo dřív, než druhé skončilo.
const konec = v => (v.konec == null ? Infinity : v.konec)
export const soubezne = (a, b) => a.start < konec(b) && b.start < konec(a)

export function kontrola(volani) {
  const chyby = []
  const k = {
    chyby,
    ok(podminka, zprava) { if (!podminka) chyby.push(zprava); return !!podminka },
    s(re) { return volani.filter(v => re.test(v.label)) },
    // Volání s přesným labelem (první výskyt); chybějící je chyba a další kontroly nad ním se přeskočí.
    jeden(label) { const v = volani.find(x => x.label === label); if (!v) chyby.push(`chybí volání ${label}`); return v },
    nic(re, proc) { const xs = volani.filter(v => re.test(v.label)); if (xs.length) chyby.push(`${proc}: nečekané volání ${xs.map(v => v.label).join(', ')}`) },
    pocet(re, n, proc) { const xs = volani.filter(v => re.test(v.label)); if (xs.length !== n) chyby.push(`${proc}: čekáno ${n} volání ${re}, je ${xs.length} (${xs.map(v => v.label).join(', ') || 'žádné'})`); return xs },
    soubezne(a, b) { if (a && b && !soubezne(a, b)) chyby.push(`${a.label} a ${b.label} neběží souběžně`) },
    vsechnySoubezne(xs, proc) {
      xs = xs.filter(Boolean); if (xs.length < 2) return
      const pozdniStart = xs.reduce((m, v) => (v.start > m.start ? v : m)), ranyKonec = xs.reduce((m, v) => (konec(v) < konec(m) ? v : m))
      if (!(pozdniStart.start < konec(ranyKonec))) chyby.push(`${proc}: ${pozdniStart.label} začalo až po skončení ${ranyKonec.label}`)
    },
    pred(a, b) { if (a && b && !(konec(a) < b.start)) chyby.push(`${a.label} neskončilo před startem ${b.label}`) },
    obsahuje(v, text, proc) { if (v && !v.prompt.includes(text)) chyby.push(`${v.label}: zadání neobsahuje ${proc || JSON.stringify(text)}`) },
    neobsahuje(v, text, proc) { if (v && v.prompt.includes(text)) chyby.push(`${v.label}: zadání nemá obsahovat ${proc || JSON.stringify(text)}`) },
    // Požadavek, který spec dovoluje vyjádřit více slovy (pojem ze spec nebo jeho výklad v závorce).
    shoda(v, re, proc) { if (v && !re.test(v.prompt)) chyby.push(`${v.label}: zadání neobsahuje ${proc || re}`) },
    rovno(skutecne, cekane, co) { if (JSON.stringify(skutecne) !== JSON.stringify(cekane)) chyby.push(`${co}: čekáno ${JSON.stringify(cekane)}, je ${JSON.stringify(skutecne)}`) },
    // Podmnožina polí návratu bloku: { ok: true, vysledek: 'hotovo' } a podobně.
    navrat(v, pole) { for (const [kl, h] of Object.entries(pole)) k.rovno(v ? v[kl] : undefined, h, `návrat.${kl}`) },
    // Volání s agentType, modelem a effortem podle spec.
    agent(v, agentType, model, effort) { if (v && (v.agentType !== agentType || v.model !== model || v.effort !== effort)) chyby.push(`${v.label}: čekáno ${agentType} ${model}/${effort}, je ${v.agentType} ${v.model}/${v.effort}`) },
    pole(v, pole, co) { if (v) for (const p of pole) if (!v.klice.includes(p)) chyby.push(`${v.label}: schéma ${co || ''} bez pole ${p}`) },
  }
  return k
}

// Společné kontroly rozhraní § 0.13, § 1.2 a § 1.8, které platí pro každé volání každého bloku.
export const RAMEC = {
  K: 'docs/handoff.md je stav orchestrátora, ne tvůj vstup',
  C1: 'Tah končí jen strukturovaným návratem',
  J12: 'summary, findings, analysis',
}
// Porušení se sčítají po pravidlech (jedna chyba = pravidlo + labely), aby výpis nezahltil stejný nedostatek u každého volání.
export function rozhrani(k, volani, { vyjimky = /^(uzavření|závěr):/ } = {}) {
  const porus = {}
  const pridej = (pravidlo, v) => { (porus[pravidlo] = porus[pravidlo] || []).push(v.label) }
  for (const v of volani) {
    if (!v.klice.includes('predavka')) pridej('schéma bez pole predavka (§ 1.2)', v)
    for (const [id, veta] of Object.entries(RAMEC)) if (!v.prompt.includes(veta)) pridej(`rámec bez věty ${id} „${veta}…“ (§ 1.8)`, v)
    // Agenti o limitu kontextu nevědí (§ 0.13); uzavření a závěr kontext jen vykazují z docs/.kontext.jsonl (§ 3 CLOSE).
    if (!vyjimky.test(v.label)) {
      if (/compact|smart zone|limit kontextu/i.test(v.prompt)) pridej('zadání zmiňuje kontext nebo compact (§ 0.13)', v)
      if (parsujLabel(v.label).naslednik === 1 && /předávk/i.test(v.prompt)) pridej('zadání zmiňuje předávku, kterou zná jen nástupce (§ 0.13)', v)
    }
  }
  for (const [pravidlo, labely] of Object.entries(porus)) {
    const u = [...new Set(labely)]
    k.chyby.push(`${pravidlo}: ${u.slice(0, 6).join(', ')}${u.length > 6 ? ` a ${u.length - 6} dalších` : ''}`)
  }
}
