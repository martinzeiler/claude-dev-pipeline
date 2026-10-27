// 174c · stavba · 1.9.0 (§ 2.4, review N5): jediný zbývající soubor Kontraktu na stropu předávek dokončí jeden agent (:a) bez souběhu.
import { argsStavby, casti, kontrola, stub, hash, parsujLabel, CWD } from '../stuby.mjs'

export default {
  nazev: 'Kontrakt na stropu předávek s jediným zbývajícím souborem: jeden agent',
  blok: 'blok-stavby',
  args: argsStavby({ casti: casti([['K1']]), kontrakt_potreba: true, max_pokusu: 1 }),
  odpoved(label) {
    const l = parsujLabel(label)
    if (l.typ === 'implement' && l.role === 'kontrakt' && !l.dalsi.length) return stub(label, { stav: 'castecne', predavka: `${CWD}/docs/reviews/predavka-${hash(label).slice(0, 8)}.md`, ...(l.naslednik === 9 ? { zbyvajici_soubory: ['packages/kontrakt/posledni.ts'] } : {}) })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    const a = k.jeden('implement:řez 05:kontrakt:1:a')
    k.nic(/^implement:řez 05:kontrakt:1:b$/, 'druhý agent nad jediným souborem')
    k.obsahuje(a, 'Polož VÝHRADNĚ tyto soubory: packages/kontrakt/posledni.ts.', 'jediný soubor'); k.neobsahuje(a, 'druhý agent', 'věta o druhém agentovi')
    k.ok(logy.some(l => l.includes('kontrakt na stropu předávek: zbývá 1 soubor, dokončí ho jeden agent')), 'log')
    return k.chyby
  },
}
