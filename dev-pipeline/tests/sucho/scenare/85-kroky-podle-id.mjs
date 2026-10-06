// 85 · stavba · 1.6.0 (spec § 1.1, § 2 A1 oprava po E2E): kroky po nasazení se párují podle čísla z PRD, ne podle textu (běh web-rijen:
// deploy text kroku parafrázoval a řez 2 kvůli tomu potřeboval tři pokusy). Oprava po E2E, která změnila apps/, projde bránou dřív,
// než se nasadí (řezy 4 a 10 šly do nasazení bez brány).
import { argsStavby, kontrola, stub, e2ePass } from '../stuby.mjs'

const FAIL = e2ePass(8, { vysledek: 'fail', pass: 7, fail: 1, fail_kriteria: ['AK2: import nic nezapsal'] })

export default {
  nazev: 'kroky po nasazení podle id, oprava po E2E přes bránu',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label) {
    if (label === 'e2e:řez 05:1') return FAIL
    if (label === 'deploy:řez 05:1') return stub(label, { kroky_po_nasazeni: [{ id: 1, krok: 'IMPORT-85 knihy.py --zapis', stav: 'provedeno', duvod: '' }] })
    if (label === 'deploy:řez 05:2') return stub(label, { kroky_po_nasazeni: [{ id: 1, krok: 'spuštění importu knih se zápisem', stav: 'vynechano', duvod: 'provedeno v předchozím nasazení' }] })
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    const d1 = k.jeden('deploy:řez 05:1'), d2 = k.jeden('deploy:řez 05:2'), ve = k.jeden('verify:řez 05:e2e'), fe = k.jeden('fix-e2e:řez 05:1')
    k.ok(d1 && d1.schema.properties.kroky_po_nasazeni.items.properties.id && d1.schema.properties.kroky_po_nasazeni.items.properties.id.type === 'integer', 'DEPLOY.kroky_po_nasazeni bez id')
    k.obsahuje(d2, 'Předchozí nasazení tohoto řezu už provedlo: 1. IMPORT-85', 'krok s číslem z nasazení 1')
    k.obsahuje(d2, 'Změny pracovního stromu z oprav tohoto bloku', 'opravy patří řezu')
    k.pred(fe, ve); k.pred(ve, d2)
    k.nic(/^implement:řez 05:2$/, 'pokus 2 kvůli kroku s jiným textem')
    return k.chyby
  },
}
