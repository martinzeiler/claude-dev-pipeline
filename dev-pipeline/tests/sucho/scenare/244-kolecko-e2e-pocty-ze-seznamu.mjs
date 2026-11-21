// 244 · kolečko · 1.12.0 (spec I1 až I3, dvojče scénáře 243): počty E2E kolečka skládá blok ze seznamů kritérií, čísla verifikátora jdou jen
// do logu rozdílu. Kritérium jmenované dvěma skupinami se počítá jednou s horším verdiktem; verdikt kola 2 přepisuje FAIL kola 1, ostatní
// verdikty kola 1 platí dál; kritérium vyjmuté kvůli kroku mimo Povolení zůstává v celkem a není pass. Složení s verdikty minulého kola
// (obnova.jen_kriteria) měří scénář 225.
import { argsKolecko, kontrola, e2ePass, odSkupiny, oprava, parsujLabel } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const SESTAV = { e2e_path: '/x', kriterii: 12, plochy: [], e2e_sekce: [{ nazev: 'Admin', kriterii: 6, doba_min: 15 }, { nazev: 'Web', kriterii: 6, doba_min: 15 }] }
const cast = (znacka, co) => `${znacka}: ${co} živě nešlo, druhou půlku nese test`
const A = e2ePass(6, { pass: 6, castecne: 0, pass_kriteria: ['AK1', 'AK2', 'AK3', 'AK4'], castecna_kriteria: [cast('AK5 Export', 'odeslání'), cast('AK6 Import', 'nahrání')] })
const B = e2ePass(6, { pass: 4, castecne: 2, pass_kriteria: ['AK7', 'AK8', 'AK9', 'AK1'], castecna_kriteria: [cast('AK5 Export', 'stažení'), cast('AK4 Detail', 'mazání')] })
const pocty = b => { const e = b.vysledek && b.vysledek.e2e; return e ? [e.celkem, e.pass, e.castecne, e.fail, e.vysledek] : null }
const znackyZ = xs => (xs || []).map(x => /^AK\d+/.exec(x)[0])

export default {
  nazev: 'kolečko: E2E počty ze seznamů kritérií',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved: l => l === 'e2e-scénáře:kolečko' ? SESTAV : l === 'e2e:kolečko:1:a' ? A : l === 'e2e:kolečko:1:b' ? B : null,
  async over(v, volani, logy) {
    const k = kontrola(volani)
    const pod = (jmeno, m) => k.chyby.push(...m.chyby.map(x => `${jmeno}: ${x}`))
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const a = k.jeden('e2e:kolečko:1:a')
    k.pole(a, ['pass_kriteria'], 'E2E'); k.ok(a && a.povinne.includes('pass_kriteria'), 'pass_kriteria je v E2E povinné')
    k.rovno(pocty({ vysledek: v }), [9, 6, 3, 0, 'pass-castecne'], 'počty dvou verifikátorů ze seznamů')
    k.rovno(znackyZ(v && v.e2e && v.e2e.castecna_kriteria), ['AK5', 'AK6', 'AK4'], 'částečná kritéria bez duplicit')
    k.ok(logy.some(l => l === 'E2E 1 verifikátor a: čísla verifikátora nesedí se seznamy kritérií (pass 6, seznamy 4; castecne 0, seznamy 2); platí seznamy'), `log rozdílu: ${logy.filter(l => /verifikátor/.test(l)).join(' | ')}`)
    k.ok(!logy.some(l => /verifikátor b: čísla/.test(l)), 'verifikátor b se seznamy sedí, log rozdílu nemá')

    // Kolo 2 nad FAIL kola 1: AK1 přeměřeno na PASS, AK8 na částečně; AK7 zůstává částečně, i když ho kolo 2 po smoke uvedlo mezi PASS.
    // AK8 vedlo kolo 1 i mezi vadnými: FAIL byl horší a po přeměření platí verdikt kola 2, ne vada z kola 1.
    const K1 = e2ePass(8, { vysledek: 'fail', pass: 5, castecne: 1, fail: 2, pass_kriteria: ['AK2', 'AK3', 'AK4', 'AK5', 'AK6'], castecna_kriteria: [cast('AK7 Tisk', 'tisk')], vadna_kriteria: ['AK8 Export: nález je předřezový'],
      fail_kriteria: [{ kriterium: 'AK1 Seznam', selhani: 'prázdný' }, { kriterium: 'AK8 Export', selhani: '500' }] })
    const K2 = e2ePass(2, { pass: 2, castecne: 0, pass_kriteria: ['AK1', 'AK7'], castecna_kriteria: [cast('AK8 Export', 'odeslání')] })
    const kolo2 = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => l === 'e2e:kolečko:1' ? K1 : l === 'e2e:kolečko:2' ? K2 : null })
    const d = kontrola(kolo2.volani)
    d.navrat(kolo2.vysledek, { vysledek: 'hotovo' })
    d.rovno(pocty(kolo2), [8, 6, 2, 0, 'pass-castecne'], 'počty složené z kola 1 a 2')
    d.rovno(znackyZ(kolo2.vysledek.e2e && kolo2.vysledek.e2e.castecna_kriteria), ['AK7', 'AK8'], 'částečná kritéria po kole 2')
    d.ok(kolo2.logy.some(l => l === 'E2E 2: čísla verifikátora nesedí se seznamy kritérií (celkem 2, seznamy 3; castecne 0, seznamy 1); platí seznamy'), `log rozdílu kola 2: ${kolo2.logy.filter(l => /E2E 2/.test(l)).join(' | ')}`)
    d.obsahuje(d.jeden('e2e:kolečko:2'), 'do seznamů kritérií dej jen přeměřená', 'pokyn kola 2')
    d.ok(!(kolo2.vysledek.rozhodnuti || []).some(x => /vadné kritérium/.test(JSON.stringify(x))), `vada z kola 1 u přeměřeného kritéria nejde majiteli: ${JSON.stringify(kolo2.vysledek.rozhodnuti)}`)
    pod('kolo 2', d)

    // Kolo 2, které FAIL kola 1 nejmenuje v žádném seznamu a samo FAIL nemá: kritérium se počítá jako pass a log ho jmenuje.
    const mlcky = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => l === 'e2e:kolečko:1' ? e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: [{ kriterium: 'AK1 Seznam', selhani: 'prázdný' }] }) : l === 'e2e:kolečko:2' ? e2ePass(0, { pass_kriteria: [] }) : null })
    k.rovno(pocty(mlcky), [8, 8, 0, 0, 'pass'], 'kolo 2 bez verdiktu: počty')
    k.ok(mlcky.logy.some(l => l.includes('E2E 2: verifikátor nevrátil verdikt u 1 kritérií, která v kole 1 selhala (AK1 Seznam: prázdný); bez FAIL v kole 2 se počítají jako pass')), `kolo 2 bez verdiktu: log ${mlcky.logy.filter(l => /E2E 2/.test(l)).join(' | ')}`)
    // Kolo 2 s čísly bez jmen (review N3 stavby): PASS nebo FAIL bez jmen patří nejmenovanému FAIL kola 1, kritérium se nepočítá dvakrát.
    const FAIL_AK1 = e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: [{ kriterium: 'AK1 Seznam', selhani: 'prázdný' }] })
    const cislaK2 = k2 => spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => l === 'e2e:kolečko:1' ? FAIL_AK1 : l === 'e2e:kolečko:2' ? k2 : null })
    k.rovno(pocty(await cislaK2(e2ePass(1, { pass_kriteria: [] }))), [8, 8, 0, 0, 'pass'], 'kolo 2 s PASS bez jmen: celkem nepřesáhne počet kritérií')
    const failBez2 = await cislaK2(e2ePass(1, { vysledek: 'fail', pass: 0, fail: 1, pass_kriteria: [], fail_kriteria: [] }))
    k.navrat(failBez2.vysledek, { vysledek: 'selhalo', faze: 'e2e' })
    k.ok(failBez2.logy.some(l => l.startsWith('E2E 2 (jen FAIL kola 1): fail (7/8, fail 1')), `kolo 2 s FAIL bez jmen: počty ${failBez2.logy.filter(l => /^E2E 2/.test(l)).join(' | ')}`)

    // Plné kolo 2 (FAIL bez jmen v kole 1) změří kritérium prostředí z kola 1 jako PASS (review N1): z prostředí zmizí, majitel otázku nedostane.
    const PROSTR = e2ePass(8, { vysledek: 'fail', pass: 5, fail: 2, pass_kriteria: ['AK2', 'AK3', 'AK5', 'AK6', 'AK7'], fail_kriteria: [{ kriterium: 'AK1 Seznam', selhani: 'x' }], prostredi: [{ kriterium: 'AK4 Síť', dukaz: 'timeout 12:00' }] })
    const plne = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => l === 'e2e:kolečko:1' ? PROSTR : l === 'e2e:kolečko:2' ? e2ePass(8, { pass_kriteria: ['AK1', 'AK2', 'AK3', 'AK4', 'AK5', 'AK6', 'AK7', 'AK8'] }) : null })
    const pl = kontrola(plne.volani)
    pl.navrat(plne.vysledek, { vysledek: 'hotovo' })
    pl.rovno(pocty(plne), [8, 8, 0, 0, 'pass'], 'plné kolo 2 s PASS u kritéria prostředí: počty a verdikt')
    pl.rovno((plne.vysledek.prostredi || []).length, 0, 'kritérium prostředí změřené v kole 2 jako PASS není v prostředí')
    pl.ok(!JSON.stringify(plne.vysledek.rozhodnuti || []).includes('AK4'), `AK4 nejde majiteli jako otázka: ${JSON.stringify(plne.vysledek.rozhodnuti)}`)
    pod('plné kolo 2 po prostředí z kola 1', pl)

    // Prázdné pass_kriteria při hlášeném pass: počty z čísla celkem, s logem.
    const prazdny = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => l === 'e2e:kolečko:1' ? e2ePass(8, { pass_kriteria: [], castecne: 1, pass: 7, castecna_kriteria: [cast('AK2 Tisk', 'tisk')] }) : null })
    k.rovno(pocty(prazdny), [8, 7, 1, 0, 'pass-castecne'], 'prázdné pass_kriteria: počty')
    k.ok(prazdny.logy.some(l => l === 'E2E 1: návrat bez pass_kriteria, 7 PASS bez jmen podle čísla celkem'), `prázdné pass_kriteria: log ${prazdny.logy.filter(l => /E2E 1:/.test(l)).join(' | ')}`)

    // Krok mimo Povolení: AK1 čeká na majitele (neměří se), AK2 kolo 2 přeměří na PASS; bez jmenovaných FAIL se kolo 2 nekoná.
    const DVA = e2ePass(8, { vysledek: 'fail', pass: 6, fail: 2, fail_kriteria: [{ kriterium: 'AK1 Seznam', selhani: 'prázdný' }, { kriterium: 'AK2 Export', selhani: '500' }] })
    const KROK = oprava({ novy_krok_po_nasazeni: [{ krok: 'založit bucket', duvod: 'chybí', opora: '', kriterium: 'AK1 Seznam' }] })
    const krok = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => l === 'e2e:kolečko:1' ? DVA : l === 'fix-e2e:kolečko:1' ? KROK : l === 'e2e:kolečko:2' ? e2ePass(1, { pass_kriteria: ['AK2'] }) : null })
    const kk = kontrola(krok.volani)
    kk.navrat(krok.vysledek, { vysledek: 'hotovo' })
    kk.neobsahuje(kk.jeden('e2e:kolečko:2'), 'AK1 Seznam', 'vyjmuté kritérium se v kole 2 neměří')
    kk.rovno(pocty(krok), [8, 7, 0, 0, 'pass'], 'krok mimo Povolení: vyjmuté kritérium v celkem, ne v pass')
    pod('krok mimo Povolení', kk)
    const JEDEN = e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: [{ kriterium: 'AK1 Seznam', selhani: 'prázdný' }] })
    const bezKola = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => l === 'e2e:kolečko:1' ? JEDEN : l === 'fix-e2e:kolečko:1' ? KROK : null })
    const bk = kontrola(bezKola.volani)
    bk.nic(/^e2e:kolečko:2/, 'kolo 2 bez jmenovaných FAIL')
    bk.rovno(pocty(bezKola), [8, 7, 0, 0, 'pass'], 'všechna FAIL čekají na majitele: kritérium v celkem, ne v pass')
    pod('kolo 2 se nekoná', bk)

    // Jeden verifikátor: čísla proti seznamům stejně (hlásí pass 8, dvě kritéria vede jako částečná).
    const jeden = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => l === 'e2e:kolečko:1' ? e2ePass(8, { pass: 8, castecne: 0, pass_kriteria: ['AK1', 'AK2', 'AK3', 'AK4', 'AK5', 'AK6'], castecna_kriteria: [cast('AK7 Tisk', 'tisk'), cast('AK8 Export', 'odeslání')] }) : null })
    k.rovno(pocty(jeden), [8, 6, 2, 0, 'pass-castecne'], 'jeden verifikátor: počty ze seznamů')
    k.ok(jeden.logy.some(l => l === 'E2E 1: čísla verifikátora nesedí se seznamy kritérií (pass 8, seznamy 6; castecne 0, seznamy 2); platí seznamy'), `jeden verifikátor: log ${jeden.logy.filter(l => /E2E 1:/.test(l)).join(' | ')}`)

    // FAIL bez jmen vedle kritéria, které jmenují obě skupiny (dva texty, jedna značka): jeden FAIL jméno nemá, kolo 2 měří všechna kritéria.
    const FA = e2ePass(6, { vysledek: 'fail', pass: 5, fail: 1, fail_kriteria: [{ kriterium: 'AK3 Export', selhani: '500' }] })
    const FB = e2ePass(6, { vysledek: 'fail', pass: 4, fail: 2, fail_kriteria: [{ kriterium: 'AK3 Export', selhani: 'prázdné' }] }, 21)
    const bezJmen = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => l === 'e2e-scénáře:kolečko' ? SESTAV : l === 'e2e:kolečko:1:a' ? FA : l === 'e2e:kolečko:1:b' ? FB : null })
    const bj = kontrola(bezJmen.volani)
    bj.navrat(bezJmen.vysledek, { vysledek: 'hotovo' })
    bj.jeden('e2e:kolečko:2:a'); bj.jeden('e2e:kolečko:2:b'); bj.nic(/^e2e:kolečko:2$/, 'kolo 2 jen nad jmenovanými FAIL')
    pod('FAIL bez jmen vedle zdvojeného kritéria', bj)
    // Jeden verifikátor vede AK3 dvakrát (dvě selhání) a fail počítá po položkách (review N4): FAIL bez jména není, kolo 2 přeměří jen AK3.
    const DVE = e2ePass(8, { vysledek: 'fail', pass: 7, fail: 2, pass_kriteria: ['AK1', 'AK2', 'AK4', 'AK5', 'AK6', 'AK7', 'AK8'],
      fail_kriteria: [{ kriterium: 'AK3 Export', selhani: 'krok 2: 500' }, { kriterium: 'AK3 Export', selhani: 'krok 4: prázdné' }] })
    const zdvojene = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => l === 'e2e:kolečko:1' ? DVE : l === 'e2e:kolečko:2' ? e2ePass(1, { pass_kriteria: ['AK3'] }) : null })
    const zd = kontrola(zdvojene.volani)
    zd.navrat(zdvojene.vysledek, { vysledek: 'hotovo' })
    zd.obsahuje(zd.jeden('e2e:kolečko:2'), 'přeměř VÝHRADNĚ kritéria, která v kole 1 selhala', 'zúžení kola 2 na jmenovaná')
    zd.ok(!zdvojene.logy.some(l => /bez jmen; kolo 2 přeměří všechna/.test(l)), `zdvojené kritérium není FAIL bez jména: ${zdvojene.logy.filter(l => /kolo 2|E2E 1:/.test(l)).join(' | ')}`)
    zd.ok(zdvojene.logy.some(l => l.startsWith('E2E 1: fail (7/8,')), `kolo 1 počítá AK3 jednou: ${zdvojene.logy.filter(l => /^E2E 1:/.test(l)).join(' | ')}`)
    zd.rovno(pocty(zdvojene), [8, 8, 0, 0, 'pass'], 'zdvojené kritérium: počty po kole 2')
    pod('jeden verifikátor, kritérium dvakrát', zd)

    // Pořadí síly verdiktů mezi skupinami: fail > vadné a prostředí > částečně > pass. AK7 je v a PASS a v b částečně; AK2 a AK3 jsou v a
    // částečně a v b prostředí a vadné; AK5 a AK6 vede a jako prostředí a vadné, b jako FAIL.
    const SA = e2ePass(6, { pass: 2, castecne: 2, pass_kriteria: ['AK1', 'AK7'], castecna_kriteria: [cast('AK2 Tisk', 'tisk'), cast('AK3 Měna', 'převod')], prostredi: [{ kriterium: 'AK5 Síť', dukaz: 'timeout 12:00' }], vadna_kriteria: ['AK6 Limit: nesplnitelné v prostředí E2E'] })
    const SB = e2ePass(6, { vysledek: 'fail', pass: 1, castecne: 1, fail: 2, pass_kriteria: ['AK1'], castecna_kriteria: [cast('AK7 Export', 'odeslání')], prostredi: [{ kriterium: 'AK2 Tisk', dukaz: 'tiskárna offline 12:00' }], vadna_kriteria: ['AK3 Měna: koliduje s Ne-cílem'],
      fail_kriteria: [{ kriterium: 'AK5 Síť', selhani: '500' }, { kriterium: 'AK6 Limit', selhani: 'překročen' }] })
    const sila = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => l === 'e2e-scénáře:kolečko' ? SESTAV : l === 'e2e:kolečko:1:a' ? SA : l === 'e2e:kolečko:1:b' ? SB : null })
    k.ok(sila.logy.some(l => l.startsWith('E2E 1: fail (1/6, částečně 1, fail 2,')), `pořadí síly verdiktů: ${sila.logy.filter(l => /^E2E 1: /.test(l)).join(' | ')}`)

    // Kritérium, které jedna skupina vede jako PASS a druhá jako FAIL, a jeho FAIL čeká na majitele (krok mimo Povolení): není pass.
    const PA = e2ePass(6, { pass_kriteria: ['AK1', 'AK2', 'AK3', 'AK4', 'AK5', 'AK9'] })
    const PB = e2ePass(6, { vysledek: 'fail', pass: 5, fail: 1, fail_kriteria: [{ kriterium: 'AK9 Seznam', selhani: 'prázdný' }] }, 21)
    const dvoji = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => l === 'e2e-scénáře:kolečko' ? SESTAV : l === 'e2e:kolečko:1:a' ? PA : l === 'e2e:kolečko:1:b' ? PB : l === 'fix-e2e:kolečko:1' ? oprava({ novy_krok_po_nasazeni: [{ krok: 'založit bucket', duvod: 'chybí', opora: '', kriterium: 'AK9 Seznam' }] }) : null })
    k.rovno(pocty(dvoji), [11, 10, 0, 0, 'pass'], 'PASS v jedné skupině a čekající FAIL v druhé: kritérium není pass')

    // Přenesená skupina (plné kolo 2 po FAIL bez jmen, oprava mimo její oblast): vstupuje seznamy a rozdíl proti číslům se loguje jen tam,
    // kde ji verifikátor změřil.
    const SEKCE2 = { e2e_path: '/x', kriterii: 14, plochy: [], e2e_sekce: [{ nazev: 'Sekce A', kriterii: 8, doba_min: 20, oblasti: ['apps/a'] }, { nazev: 'Sekce B', kriterii: 6, doba_min: 15, oblasti: ['apps/b'] }] }
    const TB = e2ePass(6, { pass: 6, castecne: 0, pass_kriteria: ['AK21', 'AK22', 'AK23', 'AK24', 'AK25'], castecna_kriteria: [cast('AK26 Web', 'odeslání')], report_path: '/r/1-b.md' })
    const prenos = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => {
      const p = parsujLabel(l)
      if (l === 'e2e-scénáře:kolečko') return SEKCE2
      if (l === 'e2e:kolečko:1:a') return e2ePass(8, { vysledek: 'fail', pass: 6, fail: 2, fail_kriteria: [{ kriterium: 'AK1 A', selhani: 'x' }], report_path: '/r/1-a.md' })
      if (l === 'e2e:kolečko:1:b') return TB
      if (l === 'fix-e2e:kolečko:1') return oprava({ zmenena_mista: ['apps/a/x.ts: f'] })
      return p.typ === 'e2e' && p.pismeno ? e2ePass(8, { report_path: `/r/${p.kolo}-${p.pismeno}.md` }, odSkupiny(p.pismeno)) : null
    } })
    const pr = kontrola(prenos.volani)
    pr.navrat(prenos.vysledek, { vysledek: 'hotovo' })
    pr.jeden('e2e:kolečko:2:a'); pr.nic(/^e2e:kolečko:2:b$/, 'přenesená skupina se nepouští')
    pr.rovno(pocty(prenos), [14, 13, 1, 0, 'pass-castecne'], 'počty s přenesenou skupinou')
    pr.rovno(prenos.logy.filter(l => /verifikátor b: čísla verifikátora nesedí/.test(l)).length, 1, 'log rozdílu přenesené skupiny jen z kola, kde se měřila')
    pod('přenesená skupina', pr)

    // Položka FAIL bez jména kritéria není jméno: číslo fail ji drží jako FAIL bez jmen a kolo 2 měří všechna.
    const prazdneJmeno = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => l === 'e2e:kolečko:1' ? e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: [{ kriterium: '', selhani: 'něco padá' }] }) : null })
    const pj = kontrola(prazdneJmeno.volani)
    pj.neobsahuje(pj.jeden('e2e:kolečko:2'), 'přeměř VÝHRADNĚ kritéria, která v kole 1 selhala', 'zúžení kola 2')
    pj.ok(prazdneJmeno.logy.some(l => l === 'E2E 1: fail 1, z toho 1 bez jmen; kolo 2 přeměří všechna'), `log: ${prazdneJmeno.logy.filter(l => /kolo 2/.test(l)).join(' | ')}`)
    pod('FAIL bez jména kritéria', pj)
    return k.chyby
  },
}
