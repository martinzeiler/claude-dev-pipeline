// 247 · stavba, kolečko a PRD · 1.12.0 (spec A6, K2, K4): věty v zadáních agentů, kteří smějí zapsat do živého systému.
// A6: Povolení je na účel a hranice, ne na počet zápisů (14 z 26 otázek majiteli v jednom běhu se týkalo Povolení nebo zápisů). Agent zapisuje
// jen v účelu a hranicích, počet nehlídá, maže jen to, co běh sám založil nebo co Povolení jmenuje; zápis mimo ně neprovede a vrátí ho jako
// otázku (verifikátor vadným kritériem, deploy blokujícím krokem bez oprávnění, oprava po E2E krokem bez opory). PRD a scénáře strop počtu
// zápisů nenesou a kontrola PRD ho hlásí jako nález.
// K2: rámec nese rozhodnutí majitele ze startu bloku (zvýšení meze zapsané devět minut po startu stavby její E2E o sedm hodin později
// nevidělo). Zadání E2E, opravy po E2E, deploye a implementace, která pouští krok před nasazením, proto posílá agenta pro čerstvá rozhodnutí
// do docs/.run-args.json.
// K4: stránku pastí projektu jmenuje zadání verifikátora E2E a architekta PRD; uzavření řezu ji doplňuje a zakládá, když E2E mělo FAIL
// nebo kritérium zastavené prostředím.
import { argsStavby, argsKolecko, argsPrd, casti, kontrola, e2ePass, oprava, stub, CWD } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const CERSTVA = 'Před prvním zápisem do živého systému přečti pole rozhodnuti_majitele v docs/.run-args.json; novější položka platí a má přednost před zadáním i scénářem.'
const PASTI = `Stránku pastí ověřování ${CWD}/docs/e2e/pasti.md, když existuje, přečti dřív, než začneš.`
// Zápis mimo účel nebo hranice: PASS-částečně, když zbytek dokládá jmenovaný test (e2e-verifier.md bod 4), vadné jen bez testu (review N5 dávky 2b).
const UCEL = ['zapisuj jen v účelu a hranicích Povolení', 'počet zápisů nehlídej', 'maž jen to, co běh sám založil, nebo co Povolení jmenuje', 'Zápis mimo účel nebo hranice neprováděj', 'vrať jako PASS-částečně v castecna_kriteria, když jeho zbytek dokládá jmenovaný test (test jmenuj); jen bez takového testu ho vrať ve vadna_kriteria jako nesplnitelné v prostředí E2E']
const STARE = /v mezích citované opory|zive_kusy|živých kusů|bez opory nech prázdné\)/
const FAIL = e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: [{ kriterium: 'AK1 Export', selhani: 'PAST-247 ukládá do cache starý stav' }] })
const KROK = { krok: 'reseed promptů v produkční DB', duvod: 'oprava mění šablonu', opora: 'PV3: reseed promptů a synchronizace nástrojů', kriterium: 'AK1 Export' }
const stavba = l => l === 'e2e:řez 05:1' ? FAIL : l === 'fix-e2e:řez 05:1' ? oprava({ novy_krok_po_nasazeni: [KROK] }) : l === 'e2e:řez 05:2' ? e2ePass(1) : null

export default {
  nazev: 'zadání: účel a hranice Povolení, čerstvá rozhodnutí, stránka pastí',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved: stavba,
  async over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    const pod = (jmeno, m) => k.chyby.push(...m.chyby.map(x => `${jmeno}: ${x}`))
    const e1 = k.jeden('e2e:řez 05:1'), e2 = k.jeden('e2e:řez 05:2'), fe = k.jeden('fix-e2e:řez 05:1'), d1 = k.jeden('deploy:řez 05:1'), d2 = k.jeden('deploy:řez 05:2'), im = k.jeden('implement:řez 05:1'), uz = k.jeden('uzavření:řez 05')

    // K2: věta o čerstvých rozhodnutích právě v zadáních, která zápis do živého systému připouštějí.
    for (const x of [e1, e2, fe, d1, d2, im]) k.obsahuje(x, CERSTVA, 'věta o čerstvých rozhodnutích')
    k.rovno(volani.filter(x => x.prompt.includes('docs/.run-args.json')).map(x => x.label).sort(), [e1, e2, fe, d1, d2, im].filter(Boolean).map(x => x.label).sort(), 'docs/.run-args.json jen v zadáních se zápisem do živého systému')

    // A6: verifikátor zapisuje v účelu a hranicích, zápis mimo ně vrací jako vadné kritérium.
    for (const x of [e1, e2]) { for (const t of UCEL) k.obsahuje(x, t); k.obsahuje(x, 'Povolení, které PRD cituje', 'Povolení z PRD') }
    const popisVadnych = e1 ? e1.schema.properties.vadna_kriteria.description : ''
    k.ok(/potřebuje zápis mimo účel nebo hranice Povolení a zbytek nedokládá žádný test/.test(popisVadnych), `popis vadných kritérií: ${popisVadnych}`)
    // A6: deploy provádí krok v účelu a hranicích, krok mimo ně je blokující krok bez oprávnění.
    for (const x of [d1, d2]) for (const t of ['proveď jen v účelu a hranicích Povolení', 'počet zápisů nehlídej', 'maž jen to, co běh sám založil, nebo co Povolení jmenuje', 'Krok mimo účel nebo hranice (jiný systém, účet nebo objekt, mazání cizího) neprováděj', 'vrať ho jako blokující krok bez oprávnění']) k.obsahuje(x, t)
    k.obsahuje(d2, 'Oprava po E2E vyžaduje nový krok po nasazení s oporou v Povolení: reseed promptů v produkční DB', 'nový krok s oporou'); k.obsahuje(d2, 'Proveď ho po nasazení v účelu a hranicích citované opory', 'krok v účelu a hranicích opory')
    // A6: oprava po E2E vrací krok s oporou v účelu a hranicích, krok mimo ně bez opory (jde majiteli).
    for (const t of ['do jehož účelu a hranic krok spadá', 'počet zápisů oporu neruší', 'krok mimo účel nebo hranice nech bez opory a rozhodne o něm majitel']) k.obsahuje(fe, t)
    const opora = fe ? fe.schema.properties.novy_krok_po_nasazeni.items.properties.opora.description : ''
    k.ok(/do jehož účelu a hranic krok spadá; krok mimo účel nebo hranice nech bez opory/.test(opora), `popis opory: ${opora}`)
    // A6 a K2: implementace malého řezu pouští krok před nasazením jen v účelu a hranicích Povolení citovaného u kroku.
    k.obsahuje(im, 'Krok před nasazením, který ti PRD přiděluje, smí do živého systému jen v účelu a hranicích Povolení citovaného u kroku.', 'krok před nasazením')
    k.ok(!volani.some(x => STARE.test(x.prompt) || STARE.test(JSON.stringify(x.schema))), `staré znění o mezích a kusech: ${volani.filter(x => STARE.test(x.prompt) || STARE.test(JSON.stringify(x.schema))).map(x => x.label).join(', ')}`)

    // K4: stránku pastí čte verifikátor E2E; uzavření ji po FAIL doplňuje a zakládá.
    for (const x of [e1, e2]) k.obsahuje(x, PASTI, 'stránka pastí v zadání E2E')
    for (const x of [fe, d1, im]) k.neobsahuje(x, 'pasti.md', 'stránka pastí mimo verifikátora')
    for (const t of ['(6b) Pasti ověřování: E2E řezu mělo FAIL nebo kritéria zastavená prostředím', 'AK1 Export: PAST-247 ukládá do cache starý stav', `dopiš do ${CWD}/docs/e2e/pasti.md jedním řádkem „příznak → co s tím [řez 05]“`, 'jednorázovou vadu kódu nepiš, u opakované pasti jen připiš řez', 'Když stránka neexistuje a máš co zapsat, založ ji.']) k.obsahuje(uz, t)
    k.ok(uz && e1 && uz.prompt.includes(`reporty ${e1.odpoved.report_path}`), 'report E2E s FAIL v zadání uzavření')

    // Čistý řez: uzavření stránku pastí nejmenuje (není co zapsat), zadání E2E a deploye věty nesou stejně.
    const cisty = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: () => null })
    const c = kontrola(cisty.volani)
    c.neobsahuje(c.jeden('uzavření:řez 05'), 'pasti.md', 'stránka pastí u řezu bez FAIL'); c.neobsahuje(c.jeden('uzavření:řez 05'), 'Pasti ověřování', 'krok pastí u řezu bez FAIL')
    c.obsahuje(c.jeden('e2e:řez 05:1'), CERSTVA); c.obsahuje(c.jeden('e2e:řez 05:1'), PASTI); c.obsahuje(c.jeden('deploy:řez 05:1'), CERSTVA)
    pod('čistý řez', c)

    // Kritérium zastavené prostředím je past stejně jako FAIL.
    const PR = { kriterium: 'AK7 Rychlost stránky', sekce: 'Výkon', dukaz: 'PAST-247 měření z tohoto stroje kolísá o 40 %', navrh: 'měřit z CI' }
    const pr = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => l === 'e2e:řez 05:1' ? e2ePass(8, { pass: 7, prostredi: [PR] }) : null })
    const p = kontrola(pr.volani)
    p.obsahuje(p.jeden('uzavření:řez 05'), 'prostředí: AK7 Rychlost stránky (PAST-247 měření z tohoto stroje kolísá o 40 %)', 'prostředí mezi pastmi'); p.obsahuje(p.jeden('uzavření:řez 05'), `${CWD}/docs/e2e/pasti.md`)
    pod('prostředí', p)

    // FAIL pokusu 1 (kolo 1 i jiné kritérium v kole 2 po opravě) nese uzavření úspěšného pokusu 2: seznam se drží za celý blok.
    const FAIL2 = e2ePass(1, { vysledek: 'fail', pass: 0, fail: 1, fail_kriteria: [{ kriterium: 'AK2 Import', selhani: 'PAST-247-B po opravě padá import' }], report_path: '/r/247-kolo-2.md' })
    const dva = await spust({ blok: 'blok-stavby', args: argsStavby({ max_pokusu: 2 }), odpoved: l => l === 'e2e:řez 05:1' ? FAIL : l === 'e2e:řez 05:2' ? FAIL2 : null })
    const dv = kontrola(dva.volani)
    dv.navrat(dva.vysledek, { ok: true, vysledek: 'hotovo', pokusy: 2 })
    dv.obsahuje(dv.jeden('uzavření:řez 05'), 'AK1 Export: PAST-247 ukládá do cache starý stav', 'FAIL kola 1 dřívějšího pokusu mezi pastmi')
    dv.obsahuje(dv.jeden('uzavření:řez 05'), 'AK2 Import: PAST-247-B po opravě padá import', 'FAIL kola 2 dřívějšího pokusu mezi pastmi'); dv.obsahuje(dv.jeden('uzavření:řez 05'), '/r/247-kolo-2.md', 'report kola 2 mezi reporty pastí')
    pod('dva pokusy', dv)

    // Selhaný blok (review N4 dávky 2b): FAIL ve všech pokusech, uzavření selhání nese krok pastí, i bez jiných seznamů.
    const sel = await spust({ blok: 'blok-stavby', args: argsStavby({ max_pokusu: 1 }), odpoved: l => /^e2e:řez 05:[12]$/.test(l) ? FAIL : null })
    const se = kontrola(sel.volani)
    se.navrat(sel.vysledek, { ok: true, vysledek: 'selhalo', faze: 'e2e' })
    for (const t of ['(2b) Pasti ověřování: E2E řezu mělo FAIL nebo kritéria zastavená prostředím', 'AK1 Export: PAST-247 ukládá do cache starý stav', `dopiš do ${CWD}/docs/e2e/pasti.md`]) se.obsahuje(se.jeden('uzavření:řez 05:selhání'), t)
    pod('selhaný blok', se)

    // Obnova (review N3 dávky 2b): FAIL kola 1, nasazení opravy odložené; soubor zastavení nese e2e_selhani a obnova od deploye ho přes
    // obnova-stav vrátí, takže uzavření po zeleném E2E krok pastí má.
    const KDY = '2026-10-07T02:30:00+02:00'
    const zast = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => l === 'deploy:řez 05:2' ? stub(l, { stav: 'odlozeno', nejdriv: KDY, duvod: 'okno' }) : stavba(l) })
    const zs = kontrola(zast.volani)
    zs.navrat(zast.vysledek, { ok: true, vysledek: 'zastaveno', faze: 'deploy-odklad' })
    zs.obsahuje(zs.jeden('uzavření:řez 05:zastaveno'), '"e2e_selhani":{"kriteria":["AK1 Export: PAST-247 ukládá do cache starý stav"]', 'e2e_selhani v souboru zastavení')
    pod('zastavení', zs)
    const ES = { kriteria: ['AK1 Export: PAST-247 ukládá do cache starý stav'], reporty: ['/r/247-zastaveno.md'] }
    const obn = await spust({ blok: 'blok-stavby', args: argsStavby({ obnova: { od_faze: 'deploy', znacka: 'Z247', pokus: 1 } }), odpoved: l => l === 'obnova-stav:řez 05' ? stub(l, { head_shodny: false, nasazeni_dolozeno: false, e2e_selhani: ES }) : null })
    const ob = kontrola(obn.volani)
    ob.navrat(obn.vysledek, { ok: true, vysledek: 'hotovo' })
    ob.ok(ob.jeden('obnova-stav:řez 05') && ob.jeden('obnova-stav:řez 05').klice.includes('e2e_selhani'), 'obnova-stav vrací e2e_selhani')
    for (const t of ['(6b) Pasti ověřování', 'AK1 Export: PAST-247 ukládá do cache starý stav', 'reporty /r/247-zastaveno.md']) ob.obsahuje(ob.jeden('uzavření:řez 05'), t)
    pod('obnova po zastavení', ob)

    // Commit-only: deploy do živého systému nezapisuje a věty nenese; E2E a implementace ano.
    const co = await spust({ blok: 'blok-stavby', args: argsStavby({ deploy_mode: 'commit-only' }), odpoved: () => null })
    const m = kontrola(co.volani)
    m.neobsahuje(m.jeden('deploy:řez 05:1'), 'docs/.run-args.json', 'čerstvá rozhodnutí u commit-only'); m.neobsahuje(m.jeden('deploy:řez 05:1'), 'Krok mimo účel nebo hranice', 'věta o kroku u commit-only')
    pod('commit-only', m)

    // Řez s částmi: krok před nasazením pouští část, kontrakt a integrace ne.
    const sc = await spust({ blok: 'blok-stavby', args: argsStavby({ casti: casti([['K1'], ['K2']]), kontrakt_potreba: true }), odpoved: () => null })
    const s = kontrola(sc.volani)
    for (const id of ['K1', 'K2']) { s.obsahuje(s.jeden(`implement:řez 05:část ${id}:1`), CERSTVA, 'čerstvá rozhodnutí v zadání části'); s.obsahuje(s.jeden(`implement:řez 05:část ${id}:1`), 'smí do živého systému jen v účelu a hranicích Povolení citovaného u kroku') }
    for (const l of ['implement:řez 05:kontrakt:1', 'implement:řez 05:integrace:1']) s.neobsahuje(s.jeden(l), 'docs/.run-args.json', 'čerstvá rozhodnutí mimo agenta kroku před nasazením')
    pod('části', s)

    // Kolečko: verifikátor, oprava po E2E, deploy a autor scénářů.
    const kol = await spust({ blok: 'blok-kolecko', args: argsKolecko(), odpoved: l => l === 'e2e:kolečko:1' ? e2ePass(5, { vysledek: 'fail', pass: 4, fail: 1, fail_kriteria: [{ kriterium: 'AK1 Export', selhani: 'x' }] }) : l === 'fix-e2e:kolečko:1' ? oprava({ novy_krok_po_nasazeni: [KROK] }) : l === 'e2e:kolečko:2' ? e2ePass(1) : null })
    const q = kontrola(kol.volani)
    q.navrat(kol.vysledek, { ok: true, vysledek: 'hotovo' })
    const ke1 = q.jeden('e2e:kolečko:1'), ke2 = q.jeden('e2e:kolečko:2'), kf = q.jeden('fix-e2e:kolečko:1'), kd1 = q.jeden('deploy:kolečko:1'), kd2 = q.jeden('deploy:kolečko:2'), ks = q.jeden('e2e-scénáře:kolečko')
    for (const x of [ke1, ke2, kf, kd1, kd2]) q.obsahuje(x, CERSTVA, 'věta o čerstvých rozhodnutích')
    q.rovno(kol.volani.filter(x => x.prompt.includes('docs/.run-args.json')).map(x => x.label).sort(), [ke1, ke2, kf, kd1, kd2].filter(Boolean).map(x => x.label).sort(), 'docs/.run-args.json jen v zadáních se zápisem do živého systému')
    for (const x of [ke1, ke2]) { for (const t of UCEL) q.obsahuje(x, t); q.obsahuje(x, 'v účelu a hranicích Povolení vize', 'Povolení vize'); q.obsahuje(x, PASTI, 'stránka pastí v zadání E2E') }
    q.ok(ke1 && /i když potřebuje zápis mimo účel nebo hranice Povolení a zbytek nedokládá žádný test/.test(ke1.schema.properties.vadna_kriteria.description), 'popis vadných kritérií kolečka')
    for (const t of ['do jehož účelu a hranic krok spadá', 'krok mimo účel nebo hranice nech bez opory a rozhodne o něm majitel']) q.obsahuje(kf, t)
    q.obsahuje(kd2, 'proveď ho po nasazení v účelu a hranicích citované opory a uveď ho v zápisu nasazení', 'krok v účelu a hranicích opory')
    q.obsahuje(ks, 'Zápis do živého systému piš do scénářů jen v účelu a hranicích Povolení citovaného doslova (systém, účet, účel, hranice); strop počtu zápisů do scénářů nepiš.', 'autor scénářů bez stropu počtu')
    q.ok(ks && /nespadá do účelu a hranic žádného Povolení vize/.test(ks.schema.properties.rozhodnuti.description), 'popis rozhodnuti autora scénářů')
    q.ok(!kol.volani.some(x => STARE.test(x.prompt) || STARE.test(JSON.stringify(x.schema))), `staré znění o mezích a kusech v kolečku: ${kol.volani.filter(x => STARE.test(x.prompt) || STARE.test(JSON.stringify(x.schema))).map(x => x.label).join(', ')}`)
    pod('kolečko', q)
    const kco = await spust({ blok: 'blok-kolecko', args: argsKolecko({ deploy_mode: 'commit-only' }), odpoved: () => null })
    k.ok(!kco.volani.some(x => x.prompt.includes('docs/.run-args.json')), `kolečko commit-only: čerstvá rozhodnutí v ${kco.volani.filter(x => x.prompt.includes('docs/.run-args.json')).map(x => x.label).join(', ')}`)

    // PRD: architekt čte stránku pastí a nepíše strop počtu zápisů; kontrola hlásí zápis mimo účel a hranice a strop počtu.
    const prd = await spust({ blok: 'blok-prd', args: argsPrd(), odpoved: () => null })
    const r = kontrola(prd.volani)
    const ar = r.jeden('prd:řez 05'), ch = r.jeden('prd-check:řez 05:1')
    r.obsahuje(ar, PASTI, 'stránka pastí v zadání architekta')
    r.obsahuje(ar, 'Zápis do živého systému (kritérium, krok, scénář) piš jen v účelu a hranicích Povolení z vize a cituj z něj doslova systém, účet, účel a hranice; strop počtu zápisů do PRD ani scénářů nepiš, ani když ho starší vize nese.', 'architekt bez stropu počtu')
    const zp = ar ? ar.schema.properties.zapis_popis.description : ''
    r.ok(/k jakému účelu a v jakých hranicích/.test(zp) && /počet zápisů neuváděj/.test(zp) && !/jaké operace/.test(zp), `popis zapis_popis: ${zp}`)
    r.obsahuje(ch, 'bez doslova citovaného Povolení nebo mimo jeho účel a hranice, je BLOKUJE; strop počtu zápisů v PRD nebo scénáři je nález', 'kontrola PRD')
    pod('PRD', r)
    return k.chyby
  },
}
