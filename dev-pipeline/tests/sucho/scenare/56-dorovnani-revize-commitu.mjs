// 56 · stavba · doplnění revize (A): po nasazení je HEAD commit zápisu nasazení a dorovnání prostředí nový commit řezu obvykle
// nevytvoří. Pole commit deploye je poslední commit „rez NN“ (git log --grep), i bez nového commitu, a E2E uzná jako shodu
// i pozdější commit, který mění jen docs/ (zápis nasazení); dorovnané E2E dostane commit z dorovnání.
import { argsStavby, kontrola, stub, e2ePass } from '../stuby.mjs'

const C1 = '1'.repeat(40)

export default {
  nazev: 'dorovnání prostředí: E2E proti poslednímu commitu řezu',
  blok: 'blok-stavby',
  args: argsStavby(),
  odpoved(label, prompt, opts, stav) {
    if (label === 'deploy:řez 05:1' || label === 'deploy:řez 05:2') return stub(label, { commit: C1 })
    if (label === 'e2e:řez 05:1') return stav.pocty[label] === 1 ? e2ePass(8, { prostredi: 'nasazená revize je commit zápisu nasazení' }) : e2ePass(8)
    return null
  },
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo', commit: C1 })
    const d = k.jeden('deploy:řez 05:1')
    k.obsahuje(d, 'Pole commit je poslední commit „rez 05“ (git log --grep', 'pole commit jako poslední commit řezu')
    if (d) k.ok(/poslední commit „rez 05“ \(git log --grep\), i když tento běh nový commit řezu nevytvořil/.test(d.schema.properties.commit.description), `DEPLOY.commit: ${d.schema.properties.commit.description}`)
    const e = k.s(/^e2e:řez 05:1$/)
    k.ok(e.length === 2, `E2E kolo 1 dvakrát (před a po dorovnání), je ${e.length}`)
    for (const x of e) { k.obsahuje(x, 'mění jen docs/', 'shodu i s pozdějším commitem jen v docs/'); k.obsahuje(x, C1, 'commit řezu') }
    return k.chyby
  },
}
