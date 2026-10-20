// 60 · stavba · doplnění revize (B, F), od 1.8.0 § 2.17: rámec odkazuje na TVAR-DOKUMENTU.md jmény sekcí, ne na „kontrakt“ (agent
// kontraktu řezu s částmi by dostal dva kontrakty); popis VERIFY.kontroly_ok říká, co vrátit bez pre-commit hooku.
import { argsStavby, casti, kontrola, PLUGIN } from '../stuby.mjs'

export default {
  nazev: 'stavba: TVAR-DOKUMENTU v rámci, kontroly_ok bez hooku',
  blok: 'blok-stavby',
  args: argsStavby({ casti: casti([['K1'], ['K2']]), kontrakt_potreba: true }),
  odpoved: () => null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const bez = (co, f) => { const xs = volani.filter(f).map(x => x.label); k.ok(!xs.length, `${co}: ${xs.join(', ')}`) }
    bez('rámec bez TVAR-DOKUMENTU a sekcí', x => !x.prompt.includes(`${PLUGIN}/skills/orchestrate/TVAR-DOKUMENTU.md; čti sekci Společná pravidla agentů`))
    bez('rámec s KONTRAKT.md nebo „kontrakt:“', x => /KONTRAKT\.md| · kontrakt: /.test(x.prompt))
    const vf = k.jeden('verify:řez 05:1')
    if (vf) k.ok(/true, když projekt pre-commit hook nemá/.test(vf.schema.properties.kontroly_ok.description || ''), `VERIFY.kontroly_ok: ${vf.schema.properties.kontroly_ok.description}`)
    return k.chyby
  },
}
