// 62 · kolečko · doplnění revize (B, F), od 1.8.0 § 2.17: rámec odkazuje na TVAR-DOKUMENTU.md jmény sekcí, ne na KONTRAKT.md;
// popis VERIFY.kontroly_ok říká, co vrátit bez pre-commit hooku.
import { argsKolecko, kontrola, PLUGIN } from '../stuby.mjs'

export default {
  nazev: 'kolečko: TVAR-DOKUMENTU v rámci, kontroly_ok bez hooku',
  blok: 'blok-kolecko',
  args: argsKolecko(),
  odpoved: () => null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true, vysledek: 'hotovo' })
    const bez = (co, f) => { const xs = volani.filter(f).map(x => x.label); k.ok(!xs.length, `${co}: ${xs.join(', ')}`) }
    bez('rámec bez TVAR-DOKUMENTU a sekcí', x => !x.prompt.includes(`${PLUGIN}/skills/orchestrate/TVAR-DOKUMENTU.md; čti sekci Společná pravidla agentů`))
    bez('rámec s KONTRAKT.md nebo „kontrakt:“', x => /KONTRAKT\.md| · kontrakt: /.test(x.prompt))
    const vf = k.s(/^verify:kolečko:/)[0]
    k.ok(!!vf, 'chybí brána kolečka')
    if (vf) k.ok(/true, když projekt pre-commit hook nemá/.test(vf.schema.properties.kontroly_ok.description || ''), `VERIFY.kontroly_ok: ${vf.schema.properties.kontroly_ok.description}`)
    return k.chyby
  },
}
