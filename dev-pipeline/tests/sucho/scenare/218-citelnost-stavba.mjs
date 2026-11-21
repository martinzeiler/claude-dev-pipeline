// 218 · stavba · 1.12.0 (spec N1): vada čitelnosti není FAIL, nestojí pokus a stavba ji neopravuje. Položky jdou do follow-ups ve tvaru
// „[řez NN · E2E] [oprava] čitelnost: <plocha>: <co> (<proč>)“ (sbírají je várky čitelnosti ve vlně dluhu kolečka), jmenovitě do návratu
// a celé do souboru výsledku. Opravná cesta z 1.11.0 (oprava, její review, brány cit a cit-2, nasazení „čitelnost po E2E“, vrácení opravy)
// zmizela celá i s polem citelnost_stav: běžela u 38 ze 44 řezů, stála 22 h a polovinu jejího času dělala plná brána.
import fs from 'node:fs'
import path from 'node:path'
import { argsStavby, kontrola, e2ePass, oprava, stub } from '../stuby.mjs'
import { spust, BLOKY } from '../harness.mjs'

const CIT = [{ plocha: 'Přehled', co: 'zkratka CPC bez vysvětlení', proc: 'uživatel nepozná metriku' }]
const TEXT = 'Přehled: zkratka CPC bez vysvětlení (uživatel nepozná metriku)'
const FOLLOW = `"[řez 05 · E2E] [oprava] čitelnost: ${TEXT}"`
const OPRAVNA = /^(fix-citelnost|review:řez 05:(p\d+:)?citelnost|verify:řez 05:(p\d+:)?cit(-2)?$|deploy:řez 05:(p\d+:)?4$)/
const FAIL = extra => e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: [{ kriterium: 'AK1 Export', selhani: '500' }], ...extra })
const pocet = (text, co) => text.split(co).length - 1
const zadani = v => (v && v.prompt) || ''

export default {
  nazev: 'čitelnost: do follow-ups a návratu, bez opravné cesty',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved: l => l === 'e2e:řez 05:1' ? e2ePass(8, { citelnost: CIT }) : null,
  async over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    // Sled volání je stejný jako u řezu bez vad čitelnosti: žádná oprava, review, brána ani nasazení navíc.
    const bez = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: () => null })
    k.rovno(volani.map(x => x.label), bez.volani.map(x => x.label), 'volání jako u řezu bez vad čitelnosti')
    k.nic(OPRAVNA, 'opravná cesta čitelnosti')
    k.nic(/^(e2e:řez 05:2|fix-e2e:|implement:řez 05:2)/, 'druhé kolo E2E ani další pokus')
    k.pocet(/^verify:řez 05/, 1, 'jediná brána'); k.pocet(/^deploy:řez 05/, 1, 'jediné nasazení')
    // Follow-up ve tvaru, který sbírá kolečko (text za značkami začíná „čitelnost:“), bez dovětku o osudu opravy.
    const u = k.jeden('uzavření:řez 05')
    k.obsahuje(u, FOLLOW, 'follow-up v zadání uzavření')
    k.obsahuje(u, '"citelnost":[{"plocha":"Přehled","co":"zkratka CPC bez vysvětlení","proc":"uživatel nepozná metriku"}]', 'celá položka v souboru výsledku')
    // Návrat: verdikt beze změny, položka jmenovitě a počtem.
    const e = (v && v.e2e) || {}
    k.rovno([e.vysledek, e.fail, e.citelnost, e.citelnost_pocet], ['pass', 0, [TEXT], 1], 'návrat.e2e')
    k.pole(k.jeden('e2e:řez 05:1'), ['citelnost'], 'E2E'); k.obsahuje(k.jeden('e2e:řez 05:1'), 'vrať v citelnost, ne jako FAIL', 'pravidlo v zadání E2E')
    k.ok(logy.some(l => /E2E: 1 vad čitelnosti jde do follow-ups, opraví je vlna dluhu kolečka/.test(l)), `log: ${logy.filter(l => /čitelnost/.test(l)).join(' | ')}`)
    // Pole citelnost_stav zmizelo z návratu, ze souboru výsledku, ze schémat i ze zadání.
    k.ok(!JSON.stringify(v).includes('citelnost_stav'), 'návrat bez citelnost_stav')
    k.ok(!volani.some(x => x.prompt.includes('citelnost_stav') || JSON.stringify(x.schema).includes('citelnost_stav')), 'zadání a schémata bez citelnost_stav')
    // Zdroj bloku nenese labely ani pole zrušené cesty a detail fáze E2E v meta říká, kam čitelnost jde.
    const src = fs.readFileSync(path.join(BLOKY, 'blok-stavby.js'), 'utf8')
    for (const t of ['fix-citelnost', 'code-review-citelnost', 'E2E-cit', "verify('cit", 'čitelnost po E2E`', 'citelnost_stav', 'fixCitelnost']) k.ok(!src.includes(t), `zdroj bloku nese zrušené „${t}“`)
    k.ok(/title: 'E2E', detail: '[^']*čitelnost jde do follow-ups, opraví ji vlna dluhu kolečka'/.test(src), 'detail fáze E2E v meta')

    // FAIL kola 1 s vadou čitelnosti: oprava po E2E a kolo 2 běží jako vždy, čitelnost se neopravuje a položka je ve follow-ups jednou.
    const sFail = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: l => l === 'e2e:řez 05:1' ? FAIL({ citelnost: CIT }) : l === 'fix-e2e:řez 05:1' ? oprava() : l === 'e2e:řez 05:2' ? e2ePass(1) : null })
    const f = kontrola(sFail.volani)
    f.navrat(sFail.vysledek, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    f.jeden('fix-e2e:řez 05:1'); f.jeden('e2e:řez 05:2'); f.nic(OPRAVNA, 'opravná cesta čitelnosti po opravě E2E')
    f.neobsahuje(f.jeden('fix-e2e:řez 05:1'), 'zkratka CPC', 'vada čitelnosti v zadání opravy po E2E')
    f.rovno(pocet(zadani(f.jeden('uzavření:řez 05')), FOLLOW), 1, 'follow-up jednou')
    f.rovno(sFail.vysledek && sFail.vysledek.e2e && sFail.vysledek.e2e.citelnost, [TEXT], 'návrat po kole 2')
    k.chyby.push(...f.chyby.map(x => `FAIL kola 1: ${x}`))

    // Pokus 1 selže na E2E i po opravě, pokus 2 projde se stejnou vadou: follow-up nese uzavření jednou, opravná cesta neběží ani v jednom pokusu.
    const dva = await spust({ blok: 'blok-stavby', args: argsStavby({ max_pokusu: 2 }), odpoved: l => /^e2e:řez 05:[12]$/.test(l) ? FAIL({ citelnost: CIT }) : l === 'e2e:řez 05:p2:1' ? e2ePass(8, { citelnost: CIT }) : null })
    const d = kontrola(dva.volani)
    d.navrat(dva.vysledek, { ok: true, vysledek: 'hotovo', pokusy: 2 })
    d.nic(OPRAVNA, 'opravná cesta čitelnosti ve dvou pokusech')
    d.rovno(pocet(zadani(d.jeden('uzavření:řez 05')), FOLLOW), 1, 'follow-up jednou přes dva pokusy')
    k.chyby.push(...d.chyby.map(x => `dva pokusy: ${x}`))

    // Poslední pokus: nasazení opravy po E2E selže (review N2). Vada čitelnosti z kola 1 jde do follow-ups uzavření selhaného bloku.
    const nas = await spust({ blok: 'blok-stavby', args: argsStavby({ max_pokusu: 1 }), odpoved: l => l === 'e2e:řez 05:1' ? FAIL({ citelnost: CIT }) : l === 'fix-e2e:řez 05:1' ? oprava() : l === 'deploy:řez 05:2' ? stub(l, { stav: 'failed', duvod: 'build opravy spadl' }) : null })
    const n = kontrola(nas.volani)
    n.navrat(nas.vysledek, { ok: true, vysledek: 'selhalo', faze: 'deploy' })
    n.obsahuje(n.jeden('uzavření:řez 05:selhání'), FOLLOW, 'follow-up čitelnosti v uzavření selhaného bloku')
    k.chyby.push(...n.chyby.map(x => `selhané nasazení opravy: ${x}`))
    return k.chyby
  },
}
