// 61 · PRD · doplnění revize (B, C): rámec jmenuje TVAR-DOKUMENTU.md „pravidla dokumentů běhu“ a formát vize-spory je podle jeho sekce Vize-spory (1.8.0);
// architekt píše sekci „Nasazení a kroky po něm“ do kostry, protože deploy ji čte jen z kostry.
import { argsPrd, kontrola, PLUGIN } from '../stuby.mjs'

export default {
  nazev: 'PRD: pravidla běhu a sekce nasazení v kostře',
  blok: 'blok-prd',
  args: argsPrd(),
  odpoved: () => null,
  over(v, volani) {
    const k = kontrola(volani)
    k.navrat(v, { ok: true })
    const bez = (co, f) => { const xs = volani.filter(f).map(x => x.label); k.ok(!xs.length, `${co}: ${xs.join(', ')}`) }
    bez('rámec bez pravidel dokumentů', x => !x.prompt.includes(`pravidla dokumentů běhu: ${PLUGIN}/skills/orchestrate/TVAR-DOKUMENTU.md`))
    bez('rámec bez formátu vize-spory podle pravidel dokumentů', x => !x.prompt.includes(`tvar a definice konzervativní volby: ${PLUGIN}/skills/orchestrate/TVAR-DOKUMENTU.md, sekce Vize-spory`))
    bez('rámec s KONTRAKT.md (agenti čtou TVAR-DOKUMENTU)', x => x.prompt.includes('KONTRAKT.md'))
    bez('KONTRAKT.md jako „Kontrakt souborů a agentů“', x => x.prompt.includes('Kontrakt souborů a agentů'))
    bez('formát vize-spory „v kontraktu“', x => x.prompt.includes('formát v kontraktu'))
    const ar = k.jeden('prd:řez 05')
    k.obsahuje(ar, 'sekci „Nasazení a kroky po něm“', 'sekci nasazení v obsahu kostry'); k.obsahuje(ar, 'deploy ji čte jen z kostry')
    k.neobsahuje(ar, 'pravidla podle kontraktu', 'frontmatter „podle kontraktu“')
    return k.chyby
  },
}
