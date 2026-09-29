// 62 · kolečko · doplnění revize (B, F): rámec jmenuje KONTRAKT.md „pravidla běhu“; popis VERIFY.kontroly_ok říká, co vrátit
// bez pre-commit hooku.
import { argsKolecko, kontrola, PLUGIN } from '../stuby.mjs'

export default {
  nazev: 'kolečko: pravidla běhu v rámci, kontroly_ok bez hooku',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved: () => null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const bez = (co, f) => { const xs = volani.filter(f).map(x => x.label); k.ok(!xs.length, `${co}: ${xs.join(', ')}`) }
    bez('rámec bez pravidel běhu', x => !x.prompt.includes(`pravidla běhu (soubory, frontmatter PRD, vize-spory): ${PLUGIN}/skills/orchestrate/KONTRAKT.md`))
    bez('KONTRAKT.md jako „kontrakt“', x => x.prompt.includes(` · kontrakt: ${PLUGIN}`))
    const vf = k.s(/^verify:kolečko:/)[0]
    k.ok(!!vf, 'chybí brána kolečka')
    if (vf) k.ok(/true, když projekt pre-commit hook nemá/.test(vf.schema.properties.kontroly_ok.description || ''), `VERIFY.kontroly_ok: ${vf.schema.properties.kontroly_ok.description}`)
    return k.chyby
  },
}
