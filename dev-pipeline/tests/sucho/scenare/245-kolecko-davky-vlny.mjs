// 245 · kolečko · 1.12.0 (spec L3, dvojče scénáře 228): balíček review kolečka nad 6 nálezů jde dávkami po nejvýš 6 nálezech; dávky se
// skládají podle příbuznosti souborů (review vrací nalezy_soubory) a do vlny jdou jen dávky bez společného souboru, nejvýš 4. Dosud šel
// každý balíček kolečka jedním agentem bez ohledu na počet nálezů. Bez souborů nálezů, nebo se zdrojem bez identifikátorů, jdou dávky
// sériově nad celým balíčkem. Stejně jde oprava po review opravy po E2E; vlna dluhu dávky nemá.
import { argsKolecko, kontrola, e2ePass, stub, CWD } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const REPORT = `${CWD}/docs/reviews/kolecko-code-review-kolo-1.md`
const f = c => `apps/sucho/${c}.ts`
const ids = n => Array.from({ length: n }, (_, i) => `N${i + 1}`)
// Most: N1–N6 nad společným souborem, N7–N11 každý nad vlastním, N12 nad vlastním a společným.
const MOST = [...ids(6).map(id => ({ id, soubory: [f('s')] })), ...[7, 8, 9, 10, 11].map(n => ({ id: `N${n}`, soubory: [f(`x${n}`)] })), { id: 'N12', soubory: [f('x12'), f('s')] }]
const SOUBORY = [f('s'), ...[7, 8, 9, 10, 11, 12].map(n => f(`x${n}`))]
const review = (extra = {}) => ({ nalezu: 12, blokujicich: 0, report_path: REPORT, follow_up_ids: [], balicky: [{ soubory: SOUBORY, nalezy: ids(12) }], nalezy_soubory: MOST, ...extra })
const beh = r => spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => l === 'review:kolečko:1' ? r : null })
const davka = (m, n, faze = 'kolo 1') => m.jeden(`fix:kolečko:${faze}:1:dávka ${n}`)
const NAVAZUJE = 'předchozí dávky už své nálezy v těchto souborech opravily'

export default {
  nazev: 'kolečko: dávky balíčku ve vlnách podle souborů',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved: l => l === 'review:kolečko:1' ? review() : null,
  async over(v, volani, logy) {
    const k = kontrola(volani)
    const pod = (jmeno, m) => k.chyby.push(...m.chyby.map(x => `${jmeno}: ${x}`))
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.pole(k.jeden('review:kolečko:1'), ['nalezy_soubory'], 'REVIEW')
    k.nic(/^fix:kolečko:kolo 1:1$/, 'jeden agent nad balíčkem 12 nálezů')
    k.pocet(/^fix:kolečko:kolo 1:1:dávka/, 3, 'dávky mostu')
    const d1 = davka(k, 1), d2 = davka(k, 2), d3 = davka(k, 3)
    k.obsahuje(d1, `Report ${REPORT}: nálezy N1, N2, N3, N4, N5, N6.`, 'dávka nad společným souborem'); k.obsahuje(d2, `Report ${REPORT}: nálezy N7, N8, N9, N10, N11.`, 'dávka nad vlastními soubory'); k.obsahuje(d3, `Report ${REPORT}: nálezy N12.`, 'nález nad mostem')
    k.soubezne(d1, d2); k.pred(d1, d3); k.pred(d2, d3)
    k.obsahuje(d1, `Sahej jen do souborů: ${f('s')};`, 'soubory dávky 1'); k.obsahuje(d3, `Sahej jen do souborů: ${f('x12')}, ${f('s')};`, 'soubory dávky 3')
    k.obsahuje(d1, 'dávka 1 z 3 nad svou částí balíčku souborů; tvoje jsou jen nálezy níže', 'věta dávky'); k.obsahuje(d1, 'mimo tento seznam', 'přesah do rozsireny_zasah')
    k.obsahuje(d3, `dávka 3 z 3 nad svou částí balíčku souborů: ${NAVAZUJE} a pracovní strom to nese`, 'navázání dávky pozdější vlny'); k.neobsahuje(d1, NAVAZUJE, 'první vlna nenavazuje'); k.neobsahuje(d2, NAVAZUJE, 'první vlna nenavazuje')
    k.ok(logy.some(l => l === `balíček 1 (kolo 1): 12 nálezů, 3 dávek ve 2 vlnách, nejvíc 2 souběžně; soubor ${f('s')} sdílí 7 nálezů`), `log: ${logy.filter(l => /^balíček/.test(l)).join(' | ')}`)
    k.rovno(v && v.review && v.review.kolo1 && v.review.kolo1.fix_agentu, 3, 'review.kolo1.fix_agentu počítá dávky')
    k.pocet(/^verify:kolečko:kolo 1:/, 1, 'jedna brána po celé vlně'); k.pred(d3, k.s(/^verify:kolečko:kolo 1:/)[0])

    // Dávka začíná nálezem nad nejsdílenějším souborem (B1 nad s a t), ne prvním v pořadí (P1), a přibírá nálezy s největším překryvem
    // (N nad s i t před P1 nad p): P1 a zbylý N6 jdou sbalené do druhé vlny.
    const STRED = [{ id: 'P1', soubory: [f('p')] }, { id: 'B1', soubory: [f('p'), f('s'), f('t')] }, ...ids(6).map(id => ({ id, soubory: [f('s'), f('t')] }))]
    const stred = await beh(review({ nalezu: 8, balicky: [{ soubory: [f('p'), f('s'), f('t')], nalezy: STRED.map(x => x.id) }], nalezy_soubory: STRED }))
    const c = kontrola(stred.volani)
    c.pocet(/^fix:kolečko:kolo 1:1:dávka/, 2, 'dávky')
    c.obsahuje(davka(c, 1), `Report ${REPORT}: nálezy B1, N1, N2, N3, N4, N5.`, 'dávka od nejsdílenějšího souboru podle překryvu'); c.obsahuje(davka(c, 2), `Report ${REPORT}: nálezy P1, N6.`, 'zbytek sbalený do druhé vlny')
    c.pred(davka(c, 1), davka(c, 2))
    pod('nejsdílenější soubor', c)

    // Strop šířky vlny: pět plných dávek bez společného souboru jde ve dvou vlnách, nejvýš čtyři souběžně.
    const PET = Array.from({ length: 30 }, (_, i) => ({ id: `N${i + 1}`, soubory: [f(`g${Math.floor(i / 6)}`)] }))
    const pet = await beh(review({ nalezu: 30, balicky: [{ soubory: [0, 1, 2, 3, 4].map(g => f(`g${g}`)), nalezy: ids(30) }], nalezy_soubory: PET }))
    const s = kontrola(pet.volani)
    const p = [1, 2, 3, 4, 5].map(n => davka(s, n))
    s.vsechnySoubezne(p.slice(0, 4), 'první vlna čtyř dávek'); for (const x of p.slice(0, 4)) s.pred(x, p[4])
    s.ok(pet.logy.some(l => l === `balíček 1 (kolo 1): 30 nálezů, 5 dávek ve 2 vlnách, nejvíc 4 souběžně; soubor ${f('g0')} sdílí 6 nálezů`), `log: ${pet.logy.filter(l => /^balíček/.test(l)).join(' | ')}`)
    pod('strop vlny', s)

    // Review bez souborů nálezů: dávky sériově nad celým balíčkem.
    const bez = await beh(review({ nalezy_soubory: undefined }))
    const n = kontrola(bez.volani)
    n.pocet(/^fix:kolečko:kolo 1:1:dávka/, 2, 'sériové dávky'); n.pred(davka(n, 1), davka(n, 2))
    n.obsahuje(davka(n, 2), `dávka 2 z 2 nad týmž balíčkem souborů: ${NAVAZUJE}`, 'věta sériové dávky'); n.obsahuje(davka(n, 2), `Sahej jen do souborů: ${SOUBORY.join(', ')};`, 'celý balíček souborů'); n.obsahuje(davka(n, 2), `Report ${REPORT}: nálezy N7, N8, N9, N10, N11, N12.`, 'nálezy dávky 2')
    n.neobsahuje(davka(n, 2), 'mimo tento seznam', 'věta o přesahu v sériovém režimu')
    n.ok(bez.logy.some(l => /běží sériově: nález bez souborů/.test(l)), 'log záložního režimu')
    n.ok(bez.logy.some(l => l === 'balíček 1 (kolo 1): 12 nálezů, 2 dávek ve 2 vlnách, nejvíc 1 souběžně'), `log: ${bez.logy.filter(l => /^balíček/.test(l)).join(' | ')}`)
    pod('bez souborů', n)

    // Zdroj bez identifikátorů (druhý balíček review nálezy nejmenuje a sdílí soubor): sériově, zdroj jde do první dávky a jen do ní.
    const bezId = await beh(review({ balicky: [{ soubory: SOUBORY, nalezy: ids(12) }, { soubory: [f('s'), f('y')], nalezy: [] }] }))
    const z = kontrola(bezId.volani)
    z.pred(davka(z, 1), davka(z, 2))
    z.obsahuje(davka(z, 1), 'nálezy všechny ve tvých souborech', 'zdroj bez identifikátorů v první dávce'); z.neobsahuje(davka(z, 2), 'nálezy všechny ve tvých souborech', 'zdroj bez identifikátorů v druhé dávce')
    z.ok(bezId.logy.some(l => /běží sériově: zdroj bez identifikátorů nálezů/.test(l)), 'log zdroje bez identifikátorů')
    pod('zdroj bez identifikátorů', z)

    // Balíček do 6 nálezů jde dál jedním agentem s původním labelem.
    const maly = await beh(review({ nalezu: 6, balicky: [{ soubory: SOUBORY, nalezy: ids(6) }] }))
    const m = kontrola(maly.volani)
    m.jeden('fix:kolečko:kolo 1:1'); m.nic(/dávka/, 'dávky u balíčku do 6 nálezů')
    pod('malý balíček', m)

    // Oprava po review opravy po E2E jde stejnými dávkami.
    const OSM = [...ids(6).map(id => ({ id, soubory: [f('a')] })), { id: 'N7', soubory: [f('b')] }, { id: 'N8', soubory: [f('b')] }]
    const poE2E = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => l === 'e2e:kolečko:1' ? e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: [{ kriterium: 'AK1 Export', selhani: '500' }] })
      : l === 'review:kolečko:oprava-e2e' ? stub(l, { nalezu: 8, blokujicich: 2, balicky: [{ soubory: [f('a'), f('b')], nalezy: ids(8) }], nalezy_soubory: OSM, follow_up_ids: [] }) : null })
    const e = kontrola(poE2E.volani)
    e.navrat(poE2E.vysledek, { vysledek: 'hotovo' })
    e.soubezne(davka(e, 1, 'opravy po E2E'), davka(e, 2, 'opravy po E2E'))
    e.obsahuje(davka(e, 2, 'opravy po E2E'), 'nálezy N7, N8.', 'nálezy druhé dávky')
    e.ok(poE2E.logy.some(l => l === `balíček 1 (opravy po E2E): 8 nálezů, 2 dávek v 1 vlně, nejvíc 2 souběžně; soubor ${f('a')} sdílí 6 nálezů`), `log: ${poE2E.logy.filter(l => /^balíček/.test(l)).join(' | ')}`)
    e.ok(!(poE2E.vysledek.follow_ups || []).some(x => /zůstal neopravený/.test(x)), 'dávky vrátily opravené nálezy, nic nezůstalo neopravené')
    pod('oprava po E2E', e)
    return k.chyby
  },
}
