// 243 · stavba · 1.12.0 (spec I1 až I3): počty E2E skládá blok ze seznamů kritérií, čísla verifikátora jdou jen do logu rozdílu. V běhu mělo
// 18 ze 44 návratů stavby castecne jiné než délku seznamu a celkem počítalo kritérium za každou sekci znovu. Kritérium jmenované dvěma
// skupinami se počítá jednou s horším verdiktem; přenesená skupina vstupuje svými seznamy; verdikt kola 2 přepisuje FAIL kola 1, ostatní
// verdikty kola 1 platí dál; návrat bez pass_kriteria (obnova z reportu) bere celkem od verifikátora a pass dopočítá; kritérium, jehož
// FAIL blok vyjmul (příčina mimo řez, krok mimo Povolení), zůstává v celkem a není pass.
import { argsStavby, casti, hash, kontrola, e2ePass, oprava, stub } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const SEKCE = [{ nazev: 'Admin', kriterii: 6, doba_min: 15, oblasti: ['admin'] }, { nazev: 'Web', kriterii: 6, doba_min: 15, oblasti: ['web'] }]
const cast = (znacka, co) => `${znacka}: ${co} živě nešlo, druhou půlku nese test`
// Verifikátor a hlásí pass 6 a castecne 0, ale dvě kritéria vede v seznamu částečných; AK1 a AK5 jmenují obě skupiny, AK4 je v a PASS a v b částečně.
const A = e2ePass(6, { pass: 6, castecne: 0, pass_kriteria: ['AK1', 'AK2', 'AK3', 'AK4'], castecna_kriteria: [cast('AK5 Export', 'odeslání'), cast('AK6 Import', 'nahrání')] })
const B = e2ePass(6, { pass: 4, castecne: 2, pass_kriteria: ['AK7', 'AK8', 'AK9', 'AK1'], castecna_kriteria: [cast('AK5 Export', 'stažení'), cast('AK4 Detail', 'mazání')] })
const FAIL_A = e2ePass(4, { vysledek: 'fail', pass: 3, fail: 1, fail_kriteria: [{ kriterium: 'AK1 Seznam v adminu', selhani: 'prázdný' }] })
const pocty = b => { const e = b.vysledek && b.vysledek.e2e; return e ? [e.celkem, e.pass, e.castecne, e.fail, e.vysledek] : null }
const znackyZ = xs => (xs || []).map(x => /^AK\d+/.exec(x)[0])

export default {
  nazev: 'E2E počty ze seznamů kritérií',
  blok: 'blok-stavby',
  args: argsStavby({ e2e_sekce: SEKCE }),
  odpoved: l => l === 'e2e:řez 05:1:a' ? A : l === 'e2e:řez 05:1:b' ? B : null,
  async over(v, volani, logy) {
    const k = kontrola(volani)
    const pod = (jmeno, m) => k.chyby.push(...m.chyby.map(x => `${jmeno}: ${x}`))
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const a = k.jeden('e2e:řez 05:1:a')
    k.pole(a, ['pass_kriteria'], 'E2E'); k.ok(a && a.povinne.includes('pass_kriteria'), 'pass_kriteria je v E2E povinné')

    // Dva verifikátoři: devět různých kritérií, ne součet 12; castecne sedí se seznamem a každé kritérium je v něm jednou.
    k.rovno(pocty({ vysledek: v }), [9, 6, 3, 0, 'pass-castecne'], 'počty dvou verifikátorů ze seznamů')
    k.rovno(znackyZ(v && v.e2e && v.e2e.castecna_kriteria), ['AK5', 'AK6', 'AK4'], 'částečná kritéria bez duplicit')
    k.ok(logy.some(l => l === 'E2E 1 verifikátor a: čísla verifikátora nesedí se seznamy kritérií (pass 6, seznamy 4; castecne 0, seznamy 2); platí seznamy'), `log rozdílu: ${logy.filter(l => /verifikátor/.test(l)).join(' | ')}`)
    k.ok(!logy.some(l => /verifikátor b: čísla/.test(l)), 'verifikátor b se seznamy sedí, log rozdílu nemá')
    k.obsahuje(k.jeden('uzavření:řez 05'), 'pass-castecne 6/9 (částečně 3)', 'počty v zadání uzavření')

    // Přenesená skupina (pokus 2): vstupuje seznamy, ne čísly; rozdíl se loguje jen tam, kde skupinu verifikátor změřil.
    const WEB = e2ePass(4, { pass: 4, castecne: 0, pass_kriteria: ['AK21', 'AK22', 'AK23'], castecna_kriteria: [cast('AK24 Web', 'odeslání')] })
    const prenos = await spust({ blok: 'blok-stavby', args: argsStavby({ e2e_sekce: SEKCE, max_pokusu: 2 }), odpoved: l => l === 'e2e:řez 05:1:a' || l === 'e2e:řez 05:2' ? FAIL_A : l === 'e2e:řez 05:1:b' ? WEB
      : l === 'implement:řez 05:2' ? stub(l, { oblasti: ['admin'], soubory: ['apps/admin/seznam.ts'], zmenena_mista: ['apps/admin/seznam.ts: nacti'] }) : null })
    const p = kontrola(prenos.volani)
    p.navrat(prenos.vysledek, { vysledek: 'hotovo', pokusy: 2, prenesene_sekce: ['Web'] })
    p.pocet(/^e2e:řez 05:(p2:)?1:b$/, 1, 'skupina Web se v pokusu 2 přenese')
    p.rovno(pocty(prenos), [8, 7, 1, 0, 'pass-castecne'], 'počty s přenesenou skupinou')
    p.rovno(znackyZ(prenos.vysledek.e2e && prenos.vysledek.e2e.castecna_kriteria), ['AK24'], 'částečné kritérium přenesené skupiny')
    p.rovno(prenos.logy.filter(l => /verifikátor b: čísla verifikátora nesedí/.test(l)).length, 1, 'log rozdílu přenesené skupiny jen z pokusu, kde se měřila')
    pod('přenesená skupina', p)

    // Jeden verifikátor: čísla proti seznamům stejně (hlásí pass 8, dvě kritéria vede jako částečná).
    const jeden = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => l === 'e2e:řez 05:1' ? e2ePass(8, { pass: 8, castecne: 0, pass_kriteria: ['AK1', 'AK2', 'AK3', 'AK4', 'AK5', 'AK6'], castecna_kriteria: [cast('AK7 Tisk', 'tisk'), cast('AK8 Export', 'odeslání')] }) : null })
    k.rovno(pocty(jeden), [8, 6, 2, 0, 'pass-castecne'], 'jeden verifikátor: počty ze seznamů')
    k.ok(jeden.logy.some(l => l === 'E2E 1: čísla verifikátora nesedí se seznamy kritérií (pass 8, seznamy 6; castecne 0, seznamy 2); platí seznamy'), `jeden verifikátor: log ${jeden.logy.filter(l => /E2E 1:/.test(l)).join(' | ')}`)

    // Kolo 2 nad FAIL kola 1: AK1 přeměřeno na PASS, AK8 na částečně; AK7 zůstává částečně, i když ho kolo 2 po smoke uvedlo mezi PASS.
    // AK8 vedlo kolo 1 i mezi vadnými: FAIL byl horší a po přeměření platí verdikt kola 2, ne vada z kola 1.
    const K1 = e2ePass(8, { vysledek: 'fail', pass: 5, castecne: 1, fail: 2, pass_kriteria: ['AK2', 'AK3', 'AK4', 'AK5', 'AK6'], castecna_kriteria: [cast('AK7 Tisk', 'tisk')], vadna_kriteria: ['AK8 Export: nález je předřezový'],
      fail_kriteria: [{ kriterium: 'AK1 Seznam', selhani: 'prázdný' }, { kriterium: 'AK8 Export', selhani: '500' }] })
    const K2 = e2ePass(2, { pass: 2, castecne: 0, pass_kriteria: ['AK1', 'AK7'], castecna_kriteria: [cast('AK8 Export', 'odeslání')] })
    const kolo2 = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => l === 'e2e:řez 05:1' ? K1 : l === 'e2e:řez 05:2' ? K2 : null })
    const d = kontrola(kolo2.volani)
    d.navrat(kolo2.vysledek, { vysledek: 'hotovo', pokusy: 1 })
    d.rovno(pocty(kolo2), [8, 6, 2, 0, 'pass-castecne'], 'počty složené z kola 1 a 2')
    d.rovno(znackyZ(kolo2.vysledek.e2e && kolo2.vysledek.e2e.castecna_kriteria), ['AK7', 'AK8'], 'částečná kritéria po kole 2')
    d.ok(kolo2.logy.some(l => l === 'E2E 2: čísla verifikátora nesedí se seznamy kritérií (celkem 2, seznamy 3; castecne 0, seznamy 1); platí seznamy'), `log rozdílu kola 2: ${kolo2.logy.filter(l => /E2E 2/.test(l)).join(' | ')}`)
    d.obsahuje(d.jeden('e2e:řez 05:2'), 'do seznamů kritérií dej jen přeměřená', 'pokyn kola 2')
    d.ok(!(kolo2.vysledek.rozhodnuti || []).some(x => /vadné kritérium/.test(JSON.stringify(x))), `vada z kola 1 u přeměřeného kritéria nejde majiteli: ${JSON.stringify(kolo2.vysledek.rozhodnuti)}`)
    pod('kolo 2', d)

    // Kolo 2, které FAIL kola 1 nejmenuje v žádném seznamu a samo FAIL nemá: kritérium se počítá jako pass a log ho jmenuje.
    const mlcky = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => l === 'e2e:řez 05:1' ? e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: [{ kriterium: 'AK1 Seznam', selhani: 'prázdný' }] }) : l === 'e2e:řez 05:2' ? e2ePass(0, { pass_kriteria: [] }) : null })
    k.rovno(pocty(mlcky), [8, 8, 0, 0, 'pass'], 'kolo 2 bez verdiktu: počty')
    k.ok(mlcky.logy.some(l => l.includes('E2E 2: verifikátor nevrátil verdikt u 1 kritérií, která v kole 1 selhala (AK1 Seznam: prázdný); bez FAIL v kole 2 se počítají jako pass')), `kolo 2 bez verdiktu: log ${mlcky.logy.filter(l => /E2E 2/.test(l)).join(' | ')}`)
    // Kolo 2 s čísly bez jmen (review N3): PASS nebo FAIL bez jmen patří nejmenovanému FAIL kola 1, kritérium se nepočítá dvakrát.
    const FAIL_AK1 = e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: [{ kriterium: 'AK1 Seznam', selhani: 'prázdný' }] })
    const cislaK2 = k2 => spust({ blok: 'blok-stavby', args: argsStavby({ max_pokusu: 1 }), odpoved: l => l === 'e2e:řez 05:1' ? FAIL_AK1 : l === 'e2e:řez 05:2' ? k2 : null })
    k.rovno(pocty(await cislaK2(e2ePass(1, { pass_kriteria: [] }))), [8, 8, 0, 0, 'pass'], 'kolo 2 s PASS bez jmen: celkem nepřesáhne počet kritérií')
    const failBez2 = await cislaK2(e2ePass(1, { vysledek: 'fail', pass: 0, fail: 1, pass_kriteria: [], fail_kriteria: [] }))
    k.navrat(failBez2.vysledek, { vysledek: 'selhalo', faze: 'e2e' })
    k.ok(/FAIL kritéria po opravě: 1 bez jmen/.test(failBez2.vysledek && failBez2.vysledek.detail || ''), `kolo 2 s FAIL bez jmen: detail ${failBez2.vysledek && failBez2.vysledek.detail}`)
    k.ok(failBez2.logy.some(l => l.startsWith('E2E 2 (jen FAIL kola 1): fail (7/8, fail 1')), `kolo 2 s FAIL bez jmen: počty ${failBez2.logy.filter(l => /^E2E 2/.test(l)).join(' | ')}`)

    // Návrat bez pass_kriteria (obnova z reportu, skok na uzavření): castecne = různé značky seznamu, pass = celkem bez ostatních.
    const ZREPORTU = { vysledek: 'pass', celkem: 8, pass: 8, castecne: 0, fail: 0, vadna_kriteria: [], castecna_kriteria: ['AK3 půlka v E2E', 'AK3 poznámka z druhé sekce', 'AK5 půlka v E2E'], report_path: '/sucho/projekt/docs/reviews/rez-05-p1-e2e-kolo-1.md' }
    const STAV = { commit_rezu: hash('c243'), head_shodny: true, nasazeni_dolozeno: true, provedene_kroky: [], brana_nad_head: true, strom_cisty: true, e2e: ZREPORTU }
    const obn = await spust({ blok: 'blok-stavby', args: argsStavby({ casti: casti([['K1'], ['K2']]), kontrakt_potreba: true, obnova: { od_faze: 'uzavreni', znacka: 'Z243', pokus: 1 } }), odpoved: l => l === 'obnova-stav:řez 05' ? STAV : null })
    k.rovno(obn.volani.map(x => x.label), ['obnova-stav:řez 05', 'uzavření:řez 05'], 'obnova z reportu: skok na uzavření')
    k.rovno(pocty(obn), [8, 6, 2, 0, 'pass-castecne'], 'obnova z reportu: počty')
    k.rovno(znackyZ(obn.vysledek && obn.vysledek.e2e && obn.vysledek.e2e.castecna_kriteria), ['AK3', 'AK5'], 'obnova z reportu: částečná kritéria bez duplicit')
    k.ok(obn.logy.some(l => l === 'E2E přerušeného běhu: návrat bez pass_kriteria, 6 PASS bez jmen podle čísla celkem'), `obnova z reportu: log ${obn.logy.filter(l => /přerušeného běhu:/.test(l)).join(' | ')}`)

    // Prázdné pass_kriteria při hlášeném pass (verifikátor seznam nevyplnil): počty z čísla celkem, s logem.
    const prazdny = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => l === 'e2e:řez 05:1' ? e2ePass(8, { pass_kriteria: [], castecne: 1, pass: 7, castecna_kriteria: [cast('AK2 Tisk', 'tisk')] }) : null })
    k.rovno(pocty(prazdny), [8, 7, 1, 0, 'pass-castecne'], 'prázdné pass_kriteria: počty')
    k.ok(prazdny.logy.some(l => l === 'E2E 1: návrat bez pass_kriteria, 7 PASS bez jmen podle čísla celkem'), `prázdné pass_kriteria: log ${prazdny.logy.filter(l => /E2E 1:/.test(l)).join(' | ')}`)

    // FAIL s doloženou příčinou mimo řez v posledním pokusu: řez se uzavře s otázkou, kritérium zůstává v celkem a není pass.
    const mimo = await spust({ blok: 'blok-stavby', args: argsStavby({ max_pokusu: 1 }), odpoved: l => l === 'e2e:řez 05:1' ? e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: [{ kriterium: 'AK1 Export', selhani: '500', pricina_mimo_rez: { dukaz: 'výpadek CDN 12:00' } }] }) : null })
    k.rovno(pocty(mimo), [8, 7, 0, 0, 'pass'], 'příčina mimo řez: kritérium v celkem, ne v pass')

    // Krok mimo Povolení: AK1 čeká na majitele (neměří se), AK2 kolo 2 přeměří na PASS.
    const DVA = e2ePass(8, { vysledek: 'fail', pass: 6, fail: 2, fail_kriteria: [{ kriterium: 'AK1 Seznam', selhani: 'prázdný' }, { kriterium: 'AK2 Export', selhani: '500' }] })
    const krok = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => l === 'e2e:řez 05:1' ? DVA : l === 'fix-e2e:řez 05:1' ? oprava({ novy_krok_po_nasazeni: [{ krok: 'založit bucket', duvod: 'chybí', opora: '', kriterium: 'AK1 Seznam' }] })
      : l === 'e2e:řez 05:2' ? e2ePass(1, { pass_kriteria: ['AK2'] }) : null })
    const kk = kontrola(krok.volani)
    kk.navrat(krok.vysledek, { vysledek: 'hotovo' })
    kk.neobsahuje(kk.jeden('e2e:řez 05:2'), 'AK1 Seznam', 'vyjmuté kritérium se v kole 2 neměří')
    kk.rovno(pocty(krok), [8, 7, 0, 0, 'pass'], 'krok mimo Povolení: vyjmuté kritérium v celkem, ne v pass')
    pod('krok mimo Povolení', kk)
    const JEDEN = e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: [{ kriterium: 'AK1 Seznam', selhani: 'prázdný' }] })
    const bezKola = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => l === 'e2e:řez 05:1' ? JEDEN : l === 'fix-e2e:řez 05:1' ? oprava({ novy_krok_po_nasazeni: [{ krok: 'založit bucket', duvod: 'chybí', opora: '', kriterium: 'AK1 Seznam' }] }) : null })
    const bk = kontrola(bezKola.volani)
    bk.nic(/^e2e:řez 05:2/, 'kolo 2 bez jmenovaných FAIL')
    bk.rovno(pocty(bezKola), [8, 7, 0, 0, 'pass'], 'všechna FAIL čekají na majitele: kritérium v celkem, ne v pass')
    pod('kolo 2 se nekoná', bk)

    // FAIL bez jmen vedle kritéria, které jmenují obě skupiny (dva texty, jedna značka): počet jmen sedí s číslem fail, ale jeden FAIL
    // jméno nemá. Kolo 2 proto měří všechna kritéria a příčina mimo řez takový výsledek neuzavře.
    const D = { pricina_mimo_rez: { dukaz: 'výpadek CDN 12:00' } }
    const fa = x => e2ePass(4, { vysledek: 'fail', pass: 3, fail: 1, fail_kriteria: [{ kriterium: 'AK3 Export', selhani: '500', ...x }] })
    const fb = x => e2ePass(4, { vysledek: 'fail', pass: 2, fail: 2, fail_kriteria: [{ kriterium: 'AK3 Export', selhani: 'prázdné', ...x }] }, 21)
    const bezJmen = await spust({ blok: 'blok-stavby', args: argsStavby({ e2e_sekce: SEKCE }), odpoved: l => l === 'e2e:řez 05:1:a' ? fa({}) : l === 'e2e:řez 05:1:b' ? fb({}) : null })
    const bj = kontrola(bezJmen.volani)
    bj.navrat(bezJmen.vysledek, { vysledek: 'hotovo' })
    bj.jeden('e2e:řez 05:2:a'); bj.jeden('e2e:řez 05:2:b'); bj.nic(/^e2e:řez 05:2$/, 'kolo 2 jen nad jmenovanými FAIL')
    bj.ok(bezJmen.logy.some(l => l === 'E2E 1: fail 2, z toho 1 bez jmen; kolo 2 přeměří všechna'), `log: ${bezJmen.logy.filter(l => /kolo 2/.test(l)).join(' | ')}`)
    pod('FAIL bez jmen vedle zdvojeného kritéria', bj)
    // Jeden verifikátor vede AK3 ve dvou sekcích a fail počítá po položkách (review N1): obě selhání jsou jmenovaná, FAIL bez jména není.
    // V pokusu 1 kolo 2 přeměří jen AK3; v posledním pokusu se řez s doloženou příčinou mimo řez uzavře s otázkou, ne jako selhalo.
    const DVE_SEKCE = x => e2ePass(8, { vysledek: 'fail', pass: 6, fail: 2, pass_kriteria: ['AK1', 'AK2', 'AK4', 'AK5', 'AK6', 'AK7', 'AK8'],
      fail_kriteria: [{ kriterium: 'AK3 Export (sekce Admin)', selhani: '500', ...x }, { kriterium: 'AK3 Export (sekce Web)', selhani: '500', ...x }] })
    const zdvojene = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => l === 'e2e:řez 05:1' ? DVE_SEKCE({}) : l === 'e2e:řez 05:2' ? e2ePass(1, { pass_kriteria: ['AK3'] }) : null })
    const zd = kontrola(zdvojene.volani)
    zd.navrat(zdvojene.vysledek, { vysledek: 'hotovo', pokusy: 1 })
    zd.obsahuje(zd.jeden('e2e:řez 05:2'), 'přeměř VÝHRADNĚ kritéria, která v kole 1 selhala', 'zúžení kola 2 na jmenovaná')
    zd.ok(!zdvojene.logy.some(l => /bez jmen; kolo 2 přeměří všechna/.test(l)), `zdvojené kritérium není FAIL bez jména: ${zdvojene.logy.filter(l => /kolo 2/.test(l)).join(' | ')}`)
    zd.rovno(pocty(zdvojene), [8, 8, 0, 0, 'pass'], 'zdvojené kritérium: počty po kole 2')
    pod('jeden verifikátor, kritérium ve dvou sekcích', zd)
    const zdvMimo = await spust({ blok: 'blok-stavby', args: argsStavby({ max_pokusu: 1 }), odpoved: l => /^e2e:řez 05:[12]$/.test(l) ? DVE_SEKCE(D) : null })
    const zm = kontrola(zdvMimo.volani)
    zm.navrat(zdvMimo.vysledek, { vysledek: 'hotovo' })
    zm.rovno((zdvMimo.vysledek.rozhodnuti || []).filter(x => x && x.typ === 'mimo_rez').length, 2, 'obě selhání jdou majiteli jako otázka mimo řez')
    zm.rovno(pocty(zdvMimo), [8, 7, 0, 0, 'pass'], 'příčina mimo řez u zdvojeného kritéria: v celkem, ne v pass')
    pod('zdvojené kritérium s příčinou mimo řez v posledním pokusu', zm)
    // Pořadí síly verdiktů mezi skupinami: fail > vadné, prostředí a doměření > částečně > pass. AK7 je v a PASS a v b částečně; AK2 a AK3
    // jsou v a částečně a v b k doměření a vadné; AK4 až AK6 vede a jako doměření, prostředí a vadné, b jako FAIL.
    const DOM = kriterium => ({ kriterium, co_bezi: 'noční běh', kontrola: 'psql -c x', nejdriv: '2026-11-08T06:00:00+01:00' })
    const SA = e2ePass(7, { pass: 2, castecne: 2, pass_kriteria: ['AK1', 'AK7'], castecna_kriteria: [cast('AK2 Tisk', 'tisk'), cast('AK3 Měna', 'převod')], k_domereni: [DOM('AK4 Noční běh')], prostredi: [{ kriterium: 'AK5 Síť', dukaz: 'timeout 12:00' }], vadna_kriteria: ['AK6 Limit: nesplnitelné v prostředí E2E'] })
    const SB = e2ePass(7, { vysledek: 'fail', pass: 1, castecne: 1, fail: 3, pass_kriteria: ['AK1'], castecna_kriteria: [cast('AK7 Export', 'odeslání')], k_domereni: [DOM('AK2 Tisk')], vadna_kriteria: ['AK3 Měna: koliduje s Ne-cílem'],
      fail_kriteria: [{ kriterium: 'AK4 Noční běh', selhani: 'spadl' }, { kriterium: 'AK5 Síť', selhani: '500' }, { kriterium: 'AK6 Limit', selhani: 'překročen' }] })
    const sila = await spust({ blok: 'blok-stavby', args: argsStavby({ e2e_sekce: SEKCE, max_pokusu: 1 }), odpoved: l => l === 'e2e:řez 05:1:a' ? SA : l === 'e2e:řez 05:1:b' ? SB : null })
    k.ok(sila.logy.some(l => l.startsWith('E2E 1: fail (1/7, částečně 1, fail 3,')), `pořadí síly verdiktů: ${sila.logy.filter(l => /^E2E 1: /.test(l)).join(' | ')}`)

    // Kritérium, které jedna skupina vede jako PASS a druhá jako FAIL, a jeho FAIL čeká na majitele (krok mimo Povolení): není pass.
    const PA = e2ePass(6, { pass_kriteria: ['AK1', 'AK2', 'AK3', 'AK4', 'AK5', 'AK9'] })
    const PB = e2ePass(6, { vysledek: 'fail', pass: 5, fail: 1, fail_kriteria: [{ kriterium: 'AK9 Seznam', selhani: 'prázdný' }] }, 21)
    const dvoji = await spust({ blok: 'blok-stavby', args: argsStavby({ e2e_sekce: SEKCE }), odpoved: l => l === 'e2e:řez 05:1:a' ? PA : l === 'e2e:řez 05:1:b' ? PB : l === 'fix-e2e:řez 05:1' ? oprava({ novy_krok_po_nasazeni: [{ krok: 'založit bucket', duvod: 'chybí', opora: '', kriterium: 'AK9 Seznam' }] }) : null })
    k.rovno(pocty(dvoji), [11, 10, 0, 0, 'pass'], 'PASS v jedné skupině a čekající FAIL v druhé: kritérium není pass')

    // Plné kolo 2 (řez bez runtime dopadu měří vždy všechna kritéria), které nic nezměřilo, není pass; rozhodují seznamy, ne číslo celkem.
    const FAIL1 = e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: [{ kriterium: 'AK1 Seznam', selhani: 'prázdný' }] })
    const plne = k2 => spust({ blok: 'blok-stavby', args: argsStavby({ runtime_dopad: false, max_pokusu: 1 }), odpoved: l => l === 'kriteria:řez 05:1' ? FAIL1 : l === 'kriteria:řez 05:2' ? k2 : null })
    const nic = await plne(e2ePass(0, { pass_kriteria: [] }))
    k.navrat(nic.vysledek, { vysledek: 'selhalo', faze: 'e2e' })
    k.ok(/kolo 2 mělo přeměřit všechna kritéria \(8\) a vrátilo celkem 0/.test(nic.vysledek && nic.vysledek.detail || ''), `prázdné kolo 2: detail ${nic.vysledek && nic.vysledek.detail}`)
    const seSeznamem = await plne(e2ePass(8, { celkem: 0 }))
    k.rovno(seSeznamem.vysledek && [seSeznamem.vysledek.vysledek, seSeznamem.vysledek.e2e && seSeznamem.vysledek.e2e.celkem], ['hotovo', 8], 'kolo 2 s číslem celkem 0 a plným seznamem PASS')

    // Položka FAIL bez jména kritéria není jméno: číslo fail ji drží jako FAIL bez jmen a kolo 2 měří všechna.
    const prazdneJmeno = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => l === 'e2e:řez 05:1' ? e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: [{ kriterium: '', selhani: 'něco padá' }] }) : null })
    const pj = kontrola(prazdneJmeno.volani)
    pj.neobsahuje(pj.jeden('e2e:řez 05:2'), 'přeměř VÝHRADNĚ kritéria, která v kole 1 selhala', 'zúžení kola 2')
    pj.ok(prazdneJmeno.logy.some(l => l === 'E2E 1: fail 1, z toho 1 bez jmen; kolo 2 přeměří všechna'), `log: ${prazdneJmeno.logy.filter(l => /kolo 2/.test(l)).join(' | ')}`)
    pod('FAIL bez jména kritéria', pj)
    const mimoBezJmen = await spust({ blok: 'blok-stavby', args: argsStavby({ e2e_sekce: SEKCE, max_pokusu: 1 }), odpoved: l => /^e2e:řez 05:[12]:a$/.test(l) ? fa(D) : /^e2e:řez 05:[12]:b$/.test(l) ? fb(D) : null })
    k.navrat(mimoBezJmen.vysledek, { vysledek: 'selhalo', faze: 'e2e' })
    return k.chyby
  },
}
