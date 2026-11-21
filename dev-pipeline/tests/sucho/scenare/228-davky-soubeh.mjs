// 228 · stavba · 1.11.0 (spec I4), od 1.12.0 vlny dávek (spec L1, L2): dávky po nejvýš 6 nálezech se skládají podle příbuznosti souborů
// a do vlny jdou jen dávky bez společného souboru (nejvýš 4). Vlny jdou za sebou, dávky ve vlně souběžně, dávka pozdější vlny navazuje.
// Malé dávky téže vlny se sbalí do jedné. Jedna komponenta přes sdílený soubor (most) už neběží celá sériově: 38 ze 42 balíčků nad
// 6 nálezů tak v běhu čekalo na jeden řetěz dávek. Nález bez souborů, nebo se souborem mimo balíček, vrací sériový režim. Agent dostane
// jen soubory své dávky.
import { argsStavby, kontrola, CWD } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const REPORT = `${CWD}/docs/reviews/rez-05-p1-code-review-kolo-1.md`
const f = c => `apps/sucho/${c}.ts`
const beh = (nalezy, nalezy_soubory, soubory) => spust({ blok: 'blok-stavby', args: argsStavby({ profil: 'lehky' }), odpoved: l => l === 'review:řez 05:1' ? { nalezu: nalezy.length, blokujicich: 0, report_path: REPORT, follow_up_ids: [], balicky: [{ soubory, nalezy }], nalezy_soubory } : null })
const ids = n => Array.from({ length: n }, (_, i) => `N${i + 1}`)
const SOUBORY = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(f)
const MALE = ids(8).map((id, i) => ({ id, soubory: [f(['a', 'a', 'b', 'c', 'd', 'e', 'f', 'g'][i])] }))
const davka = (m, n) => m.jeden(`fix:řez 05:kolo 1:balíček 1:dávka ${n}`)
const logBalicku = b => b.logy.filter(l => /^balíček 1 \(kolo 1\)/.test(l)).join(' | ')
const NAVAZUJE = 'předchozí dávky už své nálezy v těchto souborech opravily'

export default {
  nazev: 'dávky balíčku ve vlnách podle souborů',
  blok: 'blok-stavby',
  args: argsStavby({ profil: 'lehky' }),
  odpoved: l => l === 'review:řez 05:1' ? { nalezu: 8, blokujicich: 0, report_path: REPORT, follow_up_ids: [], balicky: [{ soubory: SOUBORY, nalezy: ids(8) }], nalezy_soubory: MALE } : null,
  async over(v, volani, logy) {
    const k = kontrola(volani)
    const pod = (jmeno, m) => k.chyby.push(...m.chyby.map(x => `${jmeno}: ${x}`))
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    k.pole(k.jeden('review:řez 05:1'), ['nalezy_soubory'], 'REVIEW')

    // Sedm malých skupin bez společného souboru: jedna vlna, malé dávky sbalené do dvou agentů.
    const d1 = davka(k, 1), d2 = davka(k, 2)
    k.pocet(/^fix:řez 05:kolo 1:balíček 1:dávka/, 2, 'sbalené dávky')
    k.soubezne(d1, d2)
    k.obsahuje(d1, 'tvoje nálezy: N1, N2, N3, N4, N5, N6.', 'sbalené dávky do 6 nálezů'); k.obsahuje(d2, 'tvoje nálezy: N7, N8.', 'zbytek')
    k.obsahuje(d1, `Sahej jen do souborů: ${['a', 'b', 'c', 'd', 'e'].map(f).join(', ')};`, 'soubory dávky 1'); k.obsahuje(d2, `Sahej jen do souborů: ${['f', 'g'].map(f).join(', ')};`, 'soubory dávky 2')
    k.obsahuje(d1, 'mimo tento seznam', 'přesah do rozsireny_zasah'); k.obsahuje(d1, 'dávka 1 z 2 nad svou částí balíčku souborů; tvoje jsou jen nálezy níže', 'věta dávky')
    k.neobsahuje(d1, NAVAZUJE, 'navázání v první vlně'); k.neobsahuje(d2, NAVAZUJE, 'navázání v první vlně')
    k.ok(logy.some(l => l === `balíček 1 (kolo 1): 8 nálezů, 2 dávek v 1 vlně, nejvíc 2 souběžně; soubor ${f('a')} sdílí 2 nálezů`), `log: ${logy.filter(l => /balíček 1/.test(l)).join(' | ')}`)
    k.rovno(v && v.review && v.review.fix_agentu, 2, 'fix_agentu počítá dávky')

    // Osm nálezů nad jedním souborem a devátý jinde: druhá dávka nad týmž souborem čeká na první, devátý nález běží hned s první vlnou.
    const velka = await beh(ids(9), [...ids(8).map(id => ({ id, soubory: [f('a')] })), { id: 'N9', soubory: [f('x')] }], [f('a'), f('x')])
    const m = kontrola(velka.volani)
    const v1 = davka(m, 1), v2 = davka(m, 2), v3 = davka(m, 3)
    m.obsahuje(v1, 'tvoje nálezy: N1, N2, N3, N4, N5, N6.', 'první dávka'); m.obsahuje(v2, 'tvoje nálezy: N9.', 'nález nad jiným souborem v první vlně'); m.obsahuje(v3, 'tvoje nálezy: N7, N8.', 'zbytek nad sdíleným souborem')
    m.soubezne(v1, v2); m.pred(v1, v3); m.pred(v2, v3)
    m.obsahuje(v3, NAVAZUJE, 'navázání dávky druhé vlny'); m.neobsahuje(v2, NAVAZUJE, 'dávka první vlny nenavazuje')
    m.ok(velka.logy.some(l => l === `balíček 1 (kolo 1): 9 nálezů, 3 dávek ve 2 vlnách, nejvíc 2 souběžně; soubor ${f('a')} sdílí 8 nálezů`), `log: ${logBalicku(velka)}`)
    pod('sdílený soubor', m)

    // Most (spec L, testy): N1–N6 nad společným souborem, N7–N11 každý nad vlastním, N12 nad vlastním a společným. Dřív jedna komponenta
    // a dvě dávky za sebou; teď dávka N1–N6 souběžně s dávkou N7–N11 a N12 až po dávce N1–N6.
    const MOST = [...ids(6).map(id => ({ id, soubory: [f('s')] })), ...[7, 8, 9, 10, 11].map(n => ({ id: `N${n}`, soubory: [f(`x${n}`)] })), { id: 'N12', soubory: [f('x12'), f('s')] }]
    const most = await beh(ids(12), MOST, [f('s'), ...[7, 8, 9, 10, 11, 12].map(n => f(`x${n}`))])
    const b = kontrola(most.volani)
    const m1 = davka(b, 1), m2 = davka(b, 2), m3 = davka(b, 3)
    b.pocet(/^fix:řez 05:kolo 1:balíček 1:dávka/, 3, 'dávky mostu')
    b.obsahuje(m1, 'tvoje nálezy: N1, N2, N3, N4, N5, N6.', 'dávka nad společným souborem'); b.obsahuje(m2, 'tvoje nálezy: N7, N8, N9, N10, N11.', 'dávka nad vlastními soubory'); b.obsahuje(m3, 'tvoje nálezy: N12.', 'nález nad mostem')
    b.soubezne(m1, m2); b.pred(m1, m3); b.pred(m2, m3)
    b.obsahuje(m1, `Sahej jen do souborů: ${f('s')};`, 'soubory dávky 1'); b.obsahuje(m2, `Sahej jen do souborů: ${[7, 8, 9, 10, 11].map(n => f(`x${n}`)).join(', ')};`, 'soubory dávky 2'); b.obsahuje(m3, `Sahej jen do souborů: ${f('x12')}, ${f('s')};`, 'soubory dávky 3')
    b.obsahuje(m3, `dávka 3 z 3 nad svou částí balíčku souborů: ${NAVAZUJE} a pracovní strom to nese; tvoje jsou jen nálezy níže`, 'navázání dávky pozdější vlny'); b.neobsahuje(m1, NAVAZUJE, 'první vlna nenavazuje'); b.neobsahuje(m2, NAVAZUJE, 'první vlna nenavazuje')
    b.ok(most.logy.some(l => l === `balíček 1 (kolo 1): 12 nálezů, 3 dávek ve 2 vlnách, nejvíc 2 souběžně; soubor ${f('s')} sdílí 7 nálezů`), `log: ${logBalicku(most)}`)
    b.ok(!most.logy.some(l => /běží sériově/.test(l)), 'most není záložní režim')
    b.rovno(most.vysledek && most.vysledek.review && most.vysledek.review.fix_agentu, 3, 'fix_agentu počítá dávky')
    pod('most', b)

    // Thermo soubor bez nápravy (zdroj bez identifikátorů) jde k dávce, která jeho soubor nese, a jen k jedné.
    const TH = `${CWD}/docs/reviews/rez-05-p1-thermo.md`
    const sThermo = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => l === 'review:řez 05:1' ? { nalezu: 12, blokujicich: 0, report_path: REPORT, follow_up_ids: [], balicky: [{ soubory: [f('s'), ...[7, 8, 9, 10, 11, 12].map(n => f(`x${n}`))], nalezy: ids(12) }], nalezy_soubory: MOST }
      : l === 'thermo:řez 05' ? { blokeru: 1, nalezu: 1, report_path: TH, soubory: [f('s')], souhrn: 'x' } : null })
    const t = kontrola(sThermo.volani)
    const sTh = t.s(/^fix:řez 05:kolo 1:balíček 1:dávka/).filter(x => x.prompt.includes(`Thermo report ${TH}`))
    t.rovno(sTh.map(x => x.label), ['fix:řez 05:kolo 1:balíček 1:dávka 1'], 'thermo soubor jen v dávce nad jeho souborem')
    t.obsahuje(davka(t, 1), 'tvoje nálezy: N1, N2, N3, N4, N5, N6.', 'dávka nad společným souborem')
    pod('thermo bez nápravy', t)

    // Dávka začíná nálezem nad nejsdílenějším souborem (B1 nad s a t), ne prvním v pořadí (P1), a přibírá nálezy s největším překryvem
    // (N nad s i t před P1 nad p): P1 a zbylý N6 jdou sbalené do druhé vlny.
    const STRED = [{ id: 'P1', soubory: [f('p')] }, { id: 'B1', soubory: [f('p'), f('s'), f('t')] }, ...ids(6).map(id => ({ id, soubory: [f('s'), f('t')] }))]
    const stred = await beh(STRED.map(x => x.id), STRED, [f('p'), f('s'), f('t')])
    const c = kontrola(stred.volani)
    c.pocet(/^fix:řez 05:kolo 1:balíček 1:dávka/, 2, 'dávky')
    c.obsahuje(davka(c, 1), 'tvoje nálezy: B1, N1, N2, N3, N4, N5.', 'dávka od nejsdílenějšího souboru podle překryvu'); c.obsahuje(davka(c, 2), 'tvoje nálezy: P1, N6.', 'zbytek sbalený do druhé vlny')
    c.pred(davka(c, 1), davka(c, 2))
    c.ok(stred.logy.some(l => l === `balíček 1 (kolo 1): 8 nálezů, 2 dávek ve 2 vlnách, nejvíc 1 souběžně; soubor ${f('s')} sdílí 7 nálezů`), `log: ${logBalicku(stred)}`)
    pod('nejsdílenější soubor', c)

    // Strop šířky vlny: pět plných dávek bez společného souboru jde ve dvou vlnách, nejvýš čtyři souběžně.
    const PET = Array.from({ length: 30 }, (_, i) => ({ id: `N${i + 1}`, soubory: [f(`g${Math.floor(i / 6)}`)] }))
    const pet = await beh(ids(30), PET, [0, 1, 2, 3, 4].map(g => f(`g${g}`)))
    const s = kontrola(pet.volani)
    const p = [1, 2, 3, 4, 5].map(n => davka(s, n))
    s.vsechnySoubezne(p.slice(0, 4), 'první vlna čtyř dávek'); for (const x of p.slice(0, 4)) s.pred(x, p[4])
    s.obsahuje(p[4], NAVAZUJE, 'dávka druhé vlny navazuje')
    s.ok(pet.logy.some(l => l === `balíček 1 (kolo 1): 30 nálezů, 5 dávek ve 2 vlnách, nejvíc 4 souběžně; soubor ${f('g0')} sdílí 6 nálezů`), `log: ${logBalicku(pet)}`)
    pod('strop vlny', s)

    // Záložní režimy: dávky sériově nad celým balíčkem.
    const bez = await beh(ids(8), MALE.slice(0, 7), SOUBORY)
    const n = kontrola(bez.volani)
    n.pred(davka(n, 1), davka(n, 2))
    n.obsahuje(davka(n, 2), `dávka 2 z 2 nad týmž balíčkem souborů: ${NAVAZUJE}`, 'věta sériové dávky'); n.obsahuje(davka(n, 2), `Sahej jen do souborů: ${SOUBORY.join(', ')};`, 'celý balíček souborů')
    n.ok(bez.logy.some(l => /běží sériově: nález bez souborů/.test(l)), 'log záložního režimu')
    n.ok(bez.logy.some(l => l === 'balíček 1 (kolo 1): 8 nálezů, 2 dávek ve 2 vlnách, nejvíc 1 souběžně'), `log: ${logBalicku(bez)}`)
    pod('bez souborů', n)
    const mimo = await beh(ids(8), MALE.map((x, i) => i === 0 ? { ...x, soubory: [f('cizi')] } : x), SOUBORY)
    const o = kontrola(mimo.volani)
    o.pred(davka(o, 1), davka(o, 2))
    o.ok(mimo.logy.some(l => /běží sériově: nález se souborem mimo balíček/.test(l)), 'log souboru mimo balíček')
    pod('mimo balíček', o)
    return k.chyby
  },
}
