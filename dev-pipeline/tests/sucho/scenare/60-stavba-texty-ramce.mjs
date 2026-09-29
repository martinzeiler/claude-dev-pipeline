// 60 · stavba · doplnění revize (B, F): rámec jmenuje KONTRAKT.md „pravidla běhu“, ne „kontrakt“ (agent kontraktu řezu s částmi by
// dostal dva kontrakty); popis VERIFY.kontroly_ok říká, co vrátit bez pre-commit hooku.
import { argsStavby, casti, kontrola, PLUGIN } from '../stuby.mjs'

export default {
  nazev: 'stavba: pravidla běhu v rámci, kontroly_ok bez hooku',
  blok: 'blok-stavby',
  args: argsStavby({ casti: casti([['K1'], ['K2']]), kontrakt_potreba: true }),
  odpoved: () => null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const bez = (co, f) => { const xs = volani.filter(f).map(x => x.label); k.ok(!xs.length, `${co}: ${xs.join(', ')}`) }
    bez('rámec bez pravidel běhu', x => !x.prompt.includes(`pravidla běhu (soubory, frontmatter PRD, vize-spory): ${PLUGIN}/skills/orchestrate/KONTRAKT.md`))
    bez('KONTRAKT.md jako „kontrakt“', x => x.prompt.includes(` · kontrakt: ${PLUGIN}`))
    const vf = k.jeden('verify:řez 05:1')
    if (vf) k.ok(/true, když projekt pre-commit hook nemá/.test(vf.schema.properties.kontroly_ok.description || ''), `VERIFY.kontroly_ok: ${vf.schema.properties.kontroly_ok.description}`)
    return k.chyby
  },
}
