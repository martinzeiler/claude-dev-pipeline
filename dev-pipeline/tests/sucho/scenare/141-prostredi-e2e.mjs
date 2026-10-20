// 141 · stavba · 1.8.0 (spec § 2.2): E2E vrátí kritérium v prostredi s důkazem a návrhem: žádná oprava, žádné kolo 2, žádný další pokus;
// verdikt prostredi, řez hotovo s otázkou (rozhodnuti typ prostredi), uzavření zapíše PROSTŘEDÍ a vize-spory.
import { argsStavby, kontrola, e2ePass } from '../stuby.mjs'

const PR = { kriterium: 'AK5 Rychlost detailu', sekce: 'Výkon', dukaz: 'DUKAZ-141: měřicí služba vrací 503 ve třech bězích', navrh: 'měřit z CI běžce, nebo přijmout' }

export default {
  nazev: 'E2E prostredi s důkazem: hotovo s otázkou bez opravy',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'e2e:řez 05:1') return e2ePass(8, { pass: 7, prostredi: [PR] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    k.nic(/^(fix-e2e|e2e:řez 05:2|diagnose)/, 'prostředí nespouští opravu, kolo 2 ani diagnózu')
    k.rovno(v && v.e2e && v.e2e.vysledek, 'prostredi', 'návrat.e2e.vysledek')
    k.rovno(v && v.e2e && v.e2e.prostredi, ['AK5 Rychlost detailu'], 'návrat.e2e.prostredi')
    const pr = (v && v.rozhodnuti || []).filter(x => x && typeof x === 'object' && x.typ === 'prostredi')
    k.ok(pr.length === 1 && pr[0].kriterium === PR.kriterium && pr[0].navrh === PR.navrh, `rozhodnuti typ prostredi: ${JSON.stringify(pr)}`)
    const e = k.jeden('e2e:řez 05:1')
    k.pole(e, ['prostredi', 'prostredi_nasazeni'], 'E2E')
    if (e) k.ok((e.schema.properties.vysledek.enum || []).includes('prostredi'), 'E2E.vysledek bez hodnoty prostredi')
    k.obsahuje(e, 'v prostredi s důkazem a návrhem', 'pokyn k prostředí v zadání E2E')
    const uz = k.jeden('uzavření:řez 05')
    k.obsahuje(uz, 'PROSTŘEDÍ: <důkaz>'); k.obsahuje(uz, 'DUKAZ-141'); k.obsahuje(uz, 'otázky s navrženou odpovědí', 'záznam vize-spory jako otázka')
    return k.chyby
  },
}
