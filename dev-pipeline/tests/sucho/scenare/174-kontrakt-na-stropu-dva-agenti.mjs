// 174 · stavba · 1.9.0 (§ 2.4): Kontrakt na stropu předávek nespálí pokus. Poslední návrat řetězu nese zbyvajici_soubory; blok je rozdělí
// na dvě disjunktní poloviny a dva implement agenti (implement:řez NN:kontrakt:N:a, :b) je dokončí souběžně se zápisem stavu
// z poslední předávky; pak jdou Části. Bez zbývajících souborů (174b) platí dnešní selhání fáze.
import { argsStavby, casti, kontrola, stub, hash, parsujLabel, CWD } from '../stuby.mjs'

const predavka = label => `${CWD}/docs/reviews/predavka-${hash(label).slice(0, 8)}.md`
const ZBYVA = ['packages/kontrakt/a.ts', 'packages/kontrakt/b.ts', 'packages/kontrakt/c.ts', 'packages/db/migrace/0006.sql']

export default {
  nazev: 'Kontrakt na stropu předávek: dva agenti nad zbývajícími soubory',
  blok: 'blok-stavby',
  args: argsStavby({ casti: casti([['K1'], ['K2']]), kontrakt_potreba: true, max_pokusu: 1 }),
  odpoved(label) {
    const l = parsujLabel(label)
    // Zbývající soubory jen z posledního článku řetězu (n9): blok je bere z posledního návratu, ne z prvního.
    if (l.typ === 'implement' && l.role === 'kontrakt' && !l.dalsi.length) return stub(label, { stav: 'castecne', predavka: predavka(label), soubory: ['packages/kontrakt/typy.ts'], ...(l.naslednik === 9 ? { zbyvajici_soubory: ZBYVA } : {}) })
    return null
  },
  over(v, volani, logy) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', pokusy: 1 })
    k.jeden('implement:řez 05:kontrakt:1:n9'); k.nic(/^implement:řez 05:kontrakt:1:n10/, 'desátý agent řetězu')
    const a = k.jeden('implement:řez 05:kontrakt:1:a'), b = k.jeden('implement:řez 05:kontrakt:1:b')
    k.soubezne(a, b)
    k.pred(k.jeden('implement:řez 05:kontrakt:1:n9'), a)
    k.agent(a, 'dev-pipeline:implement', 'opus', 'high')
    k.obsahuje(a, 'Polož VÝHRADNĚ tyto soubory: packages/kontrakt/a.ts, packages/kontrakt/b.ts;', 'první polovina souborů')
    k.obsahuje(a, 'soubory packages/kontrakt/c.ts, packages/db/migrace/0006.sql souběžně dokončuje druhý agent', 'druhá polovina jako cizí')
    k.obsahuje(b, 'Polož VÝHRADNĚ tyto soubory: packages/kontrakt/c.ts, packages/db/migrace/0006.sql;', 'druhá polovina souborů')
    k.obsahuje(a, `poslední zápis stavu je ${predavka('implement:řez 05:kontrakt:1:n9')}`, 'zápis stavu z poslední předávky')
    k.pole(k.jeden('implement:řez 05:kontrakt:1'), ['zbyvajici_soubory'], 'IMPL')
    for (const id of ['K1', 'K2']) k.pred(b, k.jeden(`implement:řez 05:část ${id}:1`))
    k.ok(logy.some(l => l.includes('kontrakt na stropu předávek: zbývá 4 souborů, dokončí je dva agenti souběžně (a: 2, b: 2)')), 'log')
    k.ok(logy.some(l => /^kontrakt: hotovo, \d+ souborů/.test(l)), 'log hotového kontraktu')
    k.nic(/^diagnose:/, 'diagnóza')
    return k.chyby
  },
}
