// 233 · stavba · 1.11.0 (nálezy review a plan-checku verze): důkaz mimo řez kryje jedno selhání, neopravený blokující nález review opravy nezmizí,
// druhé zastavení neztratí seznamy, obnova převezme prostředí, cesty thermo a skutečnou revizi části, čitelnost přežije selhání i skok na uzavření,
// krok po nasazení opravy čitelnosti se nepočítá jako nenasazení, podmínky nasazení se nesekají a nesplněná neprojde potichu.
import { argsStavby, casti, kontrola, stub, e2ePass, oprava, zelenaBrana, hash, NIC } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const FAIL = (extra = {}) => e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: [{ kriterium: 'AK1 Export', selhani: '500' }], ...extra })
const A = { casti: casti([['K1'], ['K2'], ['K3']]), kontrakt_potreba: true }
const STAV = extra => ({ commit_rezu: hash('r233'), head_shodny: true, nasazeni_dolozeno: true, provedene_kroky: [], brana_nad_head: false, strom_cisty: true, ...extra })
const CIT = [{ plocha: 'Přehled', co: 'zkratka', proc: 'nepozná metriku' }]
const CIT_TEXT = 'čitelnost: Přehled: zkratka (nepozná metriku)'

export default {
  nazev: 'nálezy review verze: stavba',
  blok: 'blok-stavby',
  args: argsStavby({ max_pokusu: 1 }),
  odpoved: () => null,
  async over(v, volani) {
    const k = kontrola(volani)
    const pod = (jmeno, m) => k.chyby.push(...m.chyby.map(x => `${jmeno}: ${x}`))

    // Jeden důkaz nedoloží dvě selhání: ani holý název, ani „S3 …“ nesmí spárovat oba FAIL.
    const D = { pricina_mimo_rez: { dukaz: 'výpadek CDN 12:00' } }
    const parovani = fk => spust({ blok: 'blok-stavby', args: argsStavby({ max_pokusu: 1 }), odpoved: l => /^e2e:řez 05:[12]$/.test(l) ? e2ePass(8, { vysledek: 'fail', pass: 6, fail: 2, fail_kriteria: fk }) : null })
    k.navrat((await parovani([{ kriterium: 'smoke', selhani: 'Přehled', ...D }, { kriterium: 'smoke', selhani: 'Export' }])).vysledek, { vysledek: 'selhalo', faze: 'e2e' })
    k.navrat((await parovani([{ kriterium: 'S3 nahrávání', selhani: 'x', ...D }, { kriterium: 'S3 mazání', selhani: 'y' }])).vysledek, { vysledek: 'selhalo', faze: 'e2e' })
    k.navrat((await parovani([{ kriterium: 'smoke', selhani: 'Přehled', ...D }, { kriterium: 'smoke', selhani: 'Export', ...D }])).vysledek, { vysledek: 'hotovo' })

    // „S3 …“ není značka: krok bez opory u jednoho z nich nevyjme druhé kritérium z kola 2.
    const s3vy = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => l === 'e2e:řez 05:1' ? e2ePass(8, { vysledek: 'fail', pass: 6, fail: 2, fail_kriteria: [{ kriterium: 'S3 nahrávání', selhani: 'x' }, { kriterium: 'S3 mazání', selhani: 'y' }] }) : l === 'fix-e2e:řez 05:1' ? oprava({ novy_krok_po_nasazeni: [{ krok: 'bucket', duvod: 'd', opora: '', kriterium: 'S3 nahrávání' }] }) : null })
    const m3 = kontrola(s3vy.volani)
    m3.obsahuje(m3.jeden('e2e:řez 05:2'), 'S3 mazání', 'druhé kritérium se přeměří')
    pod('S3 bez značky', m3)

    // Blokující nález review opravy, který fix nevyřešil, jde do follow-ups a commit do bez_review.
    const REVIEW = stub('review:řez 05:oprava-e2e', { nalezu: 1, blokujicich: 1, balicky: [{ soubory: ['apps/sucho/rez.ts'], nalezy: ['N1'] }], follow_up_ids: [] })
    const blok = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => l === 'e2e:řez 05:1' ? FAIL() : l === 'fix-e2e:řez 05:1' ? oprava() : l === 'review:řez 05:oprava-e2e' ? REVIEW : l === 'fix:řez 05:E2E.1' ? NIC : null })
    const mb = kontrola(blok.volani)
    mb.obsahuje(mb.jeden('uzavření:řez 05'), 'zůstal neopravený: N1', 'follow-up neopraveného nálezu')
    mb.ok(blok.vysledek && blok.vysledek.bez_review && blok.vysledek.bez_review.length === 1, `bez_review: ${JSON.stringify(blok.vysledek && blok.vysledek.bez_review)}`)
    pod('neopravený blokující', mb)
    const bezBal = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => l === 'e2e:řez 05:1' ? FAIL() : l === 'fix-e2e:řez 05:1' ? oprava() : l === 'review:řez 05:oprava-e2e' ? { ...REVIEW, balicky: [] } : null })
    const mbb = kontrola(bezBal.volani)
    mbb.obsahuje(mbb.jeden('uzavření:řez 05'), 'zůstal neopravený: 1 blokujících bez balíčku', 'blokující bez balíčku')
    pod('blokující bez balíčku', mbb)

    // Druhé zastavení zachová seznamy prvního; soubor nese skutečnou revizi části.
    const zast = await spust({ blok: 'blok-stavby', args: argsStavby({ casti: casti([['K1'], ['K2']]), kontrakt_potreba: true }), odpoved: l => /^(review|thermo):řez 05:část K2/.test(l) ? NIC : l === 'deploy:řez 05:1' ? stub(l, { stav: 'failed', infra: true, duvod: 'token' }) : null })
    const mz = kontrola(zast.volani)
    const uz = mz.jeden('uzavření:řez 05:zastaveno')
    mz.obsahuje(uz, 'jeho follow_ups, odchylky, pasti_opravene a odmitnute zachovej', 'druhé zastavení'); mz.obsahuje(uz, '"odmitnute":[', 'odmítnuté v souboru'); mz.obsahuje(uz, '{"id":"K1","hotovo":true,"zrevidovano":true}', 'zrevidovaná část'); mz.obsahuje(uz, '{"id":"K2","hotovo":true,"zrevidovano":false}', 'část bez výsledku review')
    pod('soubor zastavení', mz)

    // Obnova převezme prostředí a cesty thermo.
    const PR = { typ: 'prostredi', cast: 'K3', kriterium: 'část K3', dukaz: 'výpadek služby' }
    const pre = await spust({ blok: 'blok-stavby', args: argsStavby({ ...A, obnova: { od_faze: 'e2e', znacka: 'Z233', pokus: 1 } }), odpoved: l => l === 'obnova-stav:řez 05' ? STAV({ review: { kola: 1, nalezu: 5, blokujicich: 1, fix_agentu: 1 }, thermo: { nalezu: 3, blokeru: 2, oprava: 've vlně review', reporty: ['/r/thermo-233.md'] }, casti: [{ id: 'K1', hotovo: true, zrevidovano: true }, { id: 'K2', hotovo: true, zrevidovano: true }, { id: 'K3', hotovo: false, prostredi: true }], prostredi: [PR] }) : null })
    const mp = kontrola(pre.volani)
    const cp = mp.jeden('uzavření:řez 05')
    mp.obsahuje(cp, '/r/thermo-233.md', 'cesta thermo v uzavření'); mp.neobsahuje(cp, 'thermo bez nálezů', 'věta o thermo bez nálezů')
    mp.ok(pre.vysledek && (pre.vysledek.rozhodnuti || []).some(x => x && x.typ === 'prostredi' && x.cast === 'K3'), `otázka k části: ${JSON.stringify(pre.vysledek && pre.vysledek.rozhodnuti)}`)

    k.obsahuje(pre.volani.find(x => x.label === 'obnova-stav:řez 05'), 'casti a prostredi ze souboru', 'obnova-stav čte prostředí')
    pod('převzetí', mp)

    // Část, kterou review neposoudilo, se po obnově a selhání posoudí v dalším pokusu; posouzená ne.
    const rev = await spust({ blok: 'blok-stavby', args: argsStavby({ casti: casti([['K1'], ['K2']]), kontrakt_potreba: true, obnova: { od_faze: 'e2e', znacka: 'Z233', pokus: 1 } }), odpoved: l => l === 'obnova-stav:řez 05' ? STAV({ review: { kola: 1, nalezu: 0, blokujicich: 0, fix_agentu: 0 }, casti: [{ id: 'K1', hotovo: true, zrevidovano: true }, { id: 'K2', hotovo: true, zrevidovano: false }] }) : /^e2e:řez 05:[12]$/.test(l) ? FAIL() : null })
    const labely = rev.volani.map(x => x.label)
    k.ok(labely.some(l => /^review:řez 05:(p2:)?část K2/.test(l)), `část bez review se posoudí: ${labely.filter(l => /review|thermo/.test(l)).join(', ')}`)
    k.ok(!labely.some(l => /^review:řez 05:(p2:)?část K1/.test(l)), `posouzená část se neopakuje: ${labely.filter(l => /review/.test(l)).join(', ')}`)

    // Čitelnost přežije selhání pokusu.
    const sel = await spust({ blok: 'blok-stavby', args: argsStavby({ max_pokusu: 1 }), odpoved: l => /^e2e:řez 05:[12]$/.test(l) ? FAIL({ citelnost: CIT }) : null })
    const ms = kontrola(sel.volani)
    ms.obsahuje(ms.jeden('uzavření:řez 05:selhání'), CIT_TEXT, 'čitelnost v uzavření selhání')
    pod('selhání', ms)

    // Skok na uzavření: oprava se nekoná, položky jdou do follow-ups.
    const skok = await spust({ blok: 'blok-stavby', args: argsStavby({ ...A, obnova: { od_faze: 'uzavreni', znacka: 'Z233', pokus: 1 } }), odpoved: l => l === 'obnova-stav:řez 05' ? STAV({ brana_nad_head: true, e2e: { vysledek: 'pass', celkem: 8, pass: 8, castecne: 0, fail: 0, citelnost: CIT } }) : null })
    const msk = kontrola(skok.volani)
    msk.nic(/^fix-citelnost/, 'oprava při skoku na uzavření')
    msk.obsahuje(msk.jeden('uzavření:řez 05'), CIT_TEXT, 'čitelnost při skoku na uzavření')
    pod('skok na uzavření', msk)

    // Selhání kroku po nasazení opravy čitelnosti: oprava je nasazená a návrat nese její commit.
    const cCit = hash('cit-233')
    const kr = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => l === 'e2e:řez 05:1' ? e2ePass(8, { citelnost: CIT }) : l === 'deploy:řez 05:4' ? stub(l, { commit: cCit, kroky_po_nasazeni: [{ id: 9, krok: 'k', stav: 'selhalo', duvod: 'd' }] }) : null })
    const mk = kontrola(kr.volani)
    mk.obsahuje(mk.jeden('uzavření:řez 05'), 'oprava je nasazená, selhal krok po nasazení', 'follow-up')
    mk.rovno(kr.vysledek && kr.vysledek.commit, cCit, 'commit opravy v návratu')
    pod('krok po nasazení', mk)

    // Vrácení čitelnosti se ověřuje proti markeru; nesedí = follow-up to řekne.
    const CERVENA = zelenaBrana({ selhalo: 1, exit_kod: 1, selhavajici: ['x.test.ts'] })
    const vr = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => l === 'e2e:řez 05:1' ? e2ePass(8, { citelnost: CIT }) : /^verify:řez 05:cit(-2)?$/.test(l) ? CERVENA : l === 'fix-citelnost:řez 05:vraceni' ? oprava({ rozsireny_zasah: true, zmenena_mista: ['apps/sucho/rez.ts: zbylo'] }) : null })
    const mv = kontrola(vr.volani)
    mv.obsahuje(mv.jeden('fix-citelnost:řez 05:vraceni'), 'tree-hash.sh', 'kontrola stromu')
    mv.obsahuje(mv.jeden('uzavření:řez 05'), 'vrácení není úplné', 'neúplné vrácení')
    pod('vrácení', mv)

    // Kolo 2 přes všechna kritéria čitelnost nezdvojí.
    const dvoj = await spust({ blok: 'blok-stavby', args: argsStavby({ runtime_dopad: false }), odpoved: l => l === 'kriteria:řez 05:1' ? FAIL({ citelnost: CIT }) : l === 'kriteria:řez 05:2' ? e2ePass(8, { citelnost: CIT }) : null })
    const fcd = dvoj.volani.find(x => x.label === 'fix-citelnost:řez 05')
    k.rovno(fcd ? (fcd.prompt.match(/Přehled: zkratka/g) || []).length : -1, 1, 'položka čitelnosti jednou')
    const zm = await spust({ blok: 'blok-stavby', args: argsStavby({ runtime_dopad: false }), odpoved: l => l === 'kriteria:řez 05:1' ? FAIL({ citelnost: CIT }) : l === 'kriteria:řez 05:2' ? e2ePass(8, { citelnost: [{ plocha: 'Jiná plocha', co: 'nejasné' }] }) : null })
    const fcz = zm.volani.find(x => x.label === 'fix-citelnost:řez 05')
    k.ok(fcz && !fcz.prompt.includes('Přehled: zkratka') && fcz.prompt.includes('Jiná plocha'), 'plné kolo 2: čitelnost jen z něj')

    // Návrat drží limit i s desítkami položek čitelnosti; celý seznam nese soubor výsledku.
    const CIT25 = Array.from({ length: 25 }, (_, i) => ({ plocha: `Plocha ${i}`, co: 'x'.repeat(300), proc: 'y'.repeat(200) }))
    const mn = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => l === 'e2e:řez 05:1' ? e2ePass(8, { citelnost: CIT25 }) : null })
    const ee = mn.vysledek && mn.vysledek.e2e
    k.ok(ee && ee.citelnost.length === 8 && ee.citelnost_pocet === 25 && ee.citelnost.every(t => t.length <= 240), `čitelnost v návratu: ${ee && ee.citelnost && ee.citelnost.length}/${ee && ee.citelnost_pocet}`)

    // Doměřované kritérium není pass ani po složení kol.
    const dom = { kriterium: 'AK9 Noční běh', co_bezi: 'běh', kontrola: 'psql -c x', nejdriv: '2026-11-08T06:00:00+01:00' }
    const sl = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => l === 'e2e:řez 05:1' ? e2ePass(10, { vysledek: 'fail', pass: 8, fail: 1, fail_kriteria: [{ kriterium: 'AK1 Export', selhani: '500' }], k_domereni: [dom] }) : l === 'e2e:řez 05:2' ? e2ePass(1) : null })
    k.rovno(sl.vysledek && sl.vysledek.e2e && [sl.vysledek.e2e.pass, sl.vysledek.e2e.celkem, sl.vysledek.e2e.vysledek], [9, 10, 'pass-castecne'], 'doměření po složení kol')

    // Nesplněná podmínka u úspěšného nasazení neprojde potichu; dlouhé podmínky se nesekají.
    const P = Array.from({ length: 4 }, (_, i) => ({ popis: `podmínka ${i} ${'p'.repeat(280)}`, kontrola: 'k'.repeat(280), pravidlo: `konec-${i} ${'r'.repeat(280)}` }))
    const ps = await spust({ blok: 'blok-stavby', args: argsStavby({ deploy_podminky: P }), odpoved: l => l === 'deploy:řez 05:1' ? stub(l, { podminky: [{ popis: 'podmínka 0', vysledek: 'nesplneno', zmereno: '3 běhy' }] }) : null })
    const mpd = kontrola(ps.volani)
    mpd.obsahuje(mpd.jeden('deploy:řez 05:1'), 'podmínka 3', 'poslední podmínka v zadání'); mpd.obsahuje(mpd.jeden('uzavření:řez 05'), 'nasadil při nesplněné provozní podmínce: podmínka 0 (3 běhy)', 'follow-up')
    pod('podmínky', mpd)

    // pokyn_orchestratora ve stavbě: jen od hranice obnovy, ne jako rozhodnutí majitele.
    const po = await spust({ blok: 'blok-stavby', args: argsStavby({ obnova: { od_faze: 'e2e', znacka: 'Z233', pokus: 1, pokyn_orchestratora: 'POKYN-233' } }), odpoved: () => null })
    const mo = kontrola(po.volani)
    mo.obsahuje(mo.jeden('e2e:řez 05:1'), 'Pokyn orchestrátora pro tuto obnovu (provozní, ne rozhodnutí majitele): POKYN-233', 'pokyn v E2E')
    mo.neobsahuje(mo.jeden('implement:řez 05:1'), 'POKYN-233', 'pokyn před hranicí obnovy')
    pod('pokyn', mo)
    return k.chyby
  },
}
