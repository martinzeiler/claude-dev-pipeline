// 181 · stavba · 1.10.0 (spec C1; třída N2, review N1): Kontrakt předepisuje přesnou značku „neimplementováno: řez NN část Kx“ a brána
// hledá jen ji. Pahýl části ve stavbě je červená brána s jednou opravou; pahýl části, kterou stavba nestaví, oprava nedopíše a řez končí
// (faze brana, detail „pahýl části mimo stavbu“) bez dalšího pokusu a diagnózy. Pahýl jiného řezu, pahýl ve starém tvaru bez čísla řezu
// a pahýl části zastavené prostředím se nepočítají. Malý řez pahýly nehledá (nemá Kontrakt).
import { argsStavby, casti, kontrola, stub, zelenaBrana } from '../stuby.mjs'
import { spust } from '../harness.mjs'

const ARGS = { casti: casti([['K1'], ['K2']]), kontrakt_potreba: true }

export default {
  nazev: 'pahýl Kontraktu v bráně: část ve stavbě opraví brána, část mimo stavbu řez ukončí',
  blok: 'blok-stavby',
  args: argsStavby(ARGS),
  odpoved(label, p, o, stav) {
    if (label === 'verify:řez 05:1') return zelenaBrana({ pahyly: ['apps/sucho/k2/modul.ts:12 throw new Error("neimplementováno: řez 05 část K2")'] })
    return null
  },
  async over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    const b1 = k.jeden('verify:řez 05:1')
    k.obsahuje(b1, "rg -n 'neimplementováno: řez 05 část K'", 'hledání přesné značky řezu v zadání brány'); k.pole(b1, ['pahyly'], 'VERIFY')
    k.obsahuje(k.jeden('implement:řez 05:kontrakt:1'), 'značkou „neimplementováno: řez 05 část K<číslo>“ doslova', 'přesná značka v zadání Kontraktu')
    k.obsahuje(k.jeden('implement:řez 05:integrace:1'), 'odstraň zbylé pahýly se značkou „neimplementováno: řez 05 část K…“', 'přesná značka v zadání integrace')
    k.obsahuje(k.jeden('fix-brana:řez 05'), 'pahýly Kontraktu: apps/sucho/k2/modul.ts:12', 'pahýl v zadání opravy brány')
    // Pahýl dřívějšího řezu (K8 řezu 11) a pahýl ve starém tvaru bez čísla řezu bránu nečerví.
    const cizi = await spust({ blok: 'blok-stavby', args: argsStavby(ARGS), odpoved: l => /^verify:/.test(l) ? zelenaBrana({ pahyly: ['apps/sucho/routes/admin.ts:40 neimplementováno: řez 11 část K8', 'apps/sucho/k1/stary.ts:3 neimplementováno: část K1'] }) : null })
    k.ok(cizi.vysledek && cizi.vysledek.vysledek === 'hotovo' && !cizi.volani.some(x => /^fix-brana:/.test(x.label)), `pahýl cizího řezu a starý tvar: ${JSON.stringify(cizi.vysledek && [cizi.vysledek.vysledek, cizi.vysledek.detail])}`)
    k.jeden('verify:řez 05:2')
    // Pahýl části K8, kterou stavba nestaví.
    const mimo = await spust({ blok: 'blok-stavby', args: argsStavby(ARGS), odpoved: l => /^verify:/.test(l) ? zelenaBrana({ pahyly: ['apps/sucho/routes/admin.ts:40 neimplementováno: řez 05 část K8'] }) : null })
    const m = kontrola(mimo.volani)
    m.navrat(mimo.vysledek, { ok: true, vysledek: 'selhalo', faze: 'brana', pokusy: 1 })
    m.ok(mimo.vysledek && /^pahýl části mimo stavbu: K8 \(stavba: K1, K2\)/.test(mimo.vysledek.detail || ''), `detail: ${mimo.vysledek && mimo.vysledek.detail}`)
    m.nic(/^(fix-brana|diagnose|deploy):/, 'oprava brány, diagnóza ani nasazení')
    m.nic(/:2$/, 'druhý pokus')
    k.chyby.push(...m.chyby.map(x => `mimo stavbu: ${x}`))
    // Pahýl části zastavené prostředím (K2 závisí na K1, která nejde změřit kvůli prostředí) bránu nečerví.
    const pr = await spust({ blok: 'blok-stavby', args: argsStavby({ ...ARGS, casti: casti([['K1'], ['K2', ['K1']]]) }), odpoved: l => {
      if (l === 'implement:řez 05:část K1:1') return stub(l, { stav: 'prostredi', dukaz: 'curl: síť nedostupná 10:00', navrh: 'měřit odjinud' })
      if (/^verify:/.test(l)) return zelenaBrana({ pahyly: ['apps/sucho/k2/modul.ts:3 neimplementováno: řez 5 část K2'] })
      return null
    } })
    k.ok(pr.vysledek && pr.vysledek.vysledek === 'hotovo' && !pr.volani.some(x => /^fix-brana:/.test(x.label)), `zastavená část: ${JSON.stringify(pr.vysledek && [pr.vysledek.vysledek, pr.vysledek.detail])}`)
    k.ok(pr.volani.some(x => /^verify:/.test(x.label) && x.prompt.includes('kromě částí K2 zastavených prostředím')), 'zastavená část vyjmutá ze zadání brány')
    // Malý řez pahýly nehledá.
    const maly = await spust({ blok: 'blok-stavby', args: argsStavby(), odpoved: () => null })
    k.ok(maly.volani.some(x => /^verify:/.test(x.label)) && !maly.volani.some(x => /^verify:/.test(x.label) && x.prompt.includes('neimplementováno: řez')), 'malý řez bez hledání pahýlů')
    return k.chyby
  },
}
