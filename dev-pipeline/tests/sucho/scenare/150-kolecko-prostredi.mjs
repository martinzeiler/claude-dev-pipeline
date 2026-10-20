// 150 · kolečko · 1.8.0 (spec § 2.2, § 3 A1): E2E kolečka vrátí kritérium v prostredi s důkazem: žádná oprava, rozhodnuti typ prostredi,
// kolečko hotovo; fail_kriteria jako objekty se v bloku převedou na text.
import { argsKolecko, kontrola, e2ePass } from '../stuby.mjs'

export default {
  nazev: 'kolečko: E2E prostredi jde majiteli jako otázka',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved(label) {
    if (label === 'e2e:kolečko:1') return e2ePass(5, { pass: 4, prostredi: [{ kriterium: 'AK2 Rychlost', dukaz: 'DUKAZ-150: měřicí služba 503', navrh: 'měřit z CI' }] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', review_passed: true })
    k.nic(/^fix-e2e:kolečko/, 'prostředí nespouští opravu')
    k.rovno(v && v.e2e && v.e2e.vysledek, 'prostredi', 'návrat.e2e.vysledek')
    const r = (v && v.rozhodnuti || []).filter(x => x && typeof x === 'object' && x.typ === 'prostredi')
    k.ok(r.length === 1 && r[0].kriterium === 'AK2 Rychlost' && /DUKAZ-150/.test(r[0].dukaz), `rozhodnuti typ prostredi: ${JSON.stringify(r)}`)
    k.ok((v && v.prostredi || []).length === 1, 'návrat.prostredi')
    const e = k.jeden('e2e:kolečko:1')
    k.pole(e, ['prostredi', 'prostredi_nasazeni'], 'E2E kolečka')
    k.obsahuje(e, 'vrať to v prostredi_nasazeni', 'vada nasazení do prostredi_nasazeni')
    return k.chyby
  },
}
