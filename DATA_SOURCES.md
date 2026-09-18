# Autosähköapu AI – avoimet datalähteet

Backend käyttää lähteitä eri tarkoituksiin. DTC-koodi ei yksin ole diagnoosi, eikä avoin lähde korvaa OEM-korjausohjetta.

## NHTSA vPIC
VIN-tunnistus ja ajoneuvon perustiedot. Ei korjaus- tai mittausarvotietokanta.

## Autodiag2
DTC/ECU/ajoneuvometadata Cloudflare D1:ssä. ODbL-1.0 / DbCL-1.0. Säilytä lisenssiehdot ja attribution, jos jaat johdettua tietokantaa.

## OBDex
Worker hakee geneeristen OBD-II-koodien rikastetun kuvauksen sekä tapaukseen liittyviä Mode 01 PID-parametreja suoraan OBDexin julkisesta JSON-jakelusta. Data CC0-1.0, työkalut MIT. Ei API-avainta.

## OBDb
Worker yrittää hakea merkki-malli-repositorion `signalsets/v3/default.json`-tiedoston suoraan OBDb:n GitHubista. Näistä saadaan ajoneuvokohtaisia OBD-signaaleja, yksiköitä, skaalausta ja joissakin tapauksissa kuvattuja vaihteluvälejä. Data on repoissa tyypillisesti CC-BY-SA-4.0, joten lähde pitää näyttää käyttäjälle ja lisenssiehdot säilyttää.

HV-aiheiset OBDb-signaalit suodatetaan pois palvelun HV-rajauksen vuoksi.

## Wal33D/dtc-database (valinnainen)
MIT-lisensoitu SQLite-tietokanta, jossa on geneerisiä ja valmistajakohtaisia DTC-määritelmiä. `Cloudflare-woker/wal33d_to_d1.py` muuntaa sen valinnaiseen D1-tauluun `wal33d_dtc`. Worker käyttää sitä vain jos `OPEN_DTC_DB`-binding on asetettu.

## Turvaraja
Mikään lähde ei oikeuta keksimään tarkkaa pinniä, johdinväriä, momenttia, jännitettä, vastusarvoa tai muuta mallikohtaista arvoa. Jos varmennettua arvoa ei ole lähdedatassa, AI:n pitää sanoa se suoraan.
