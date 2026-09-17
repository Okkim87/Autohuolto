# Autosähköapu AI – vPIC + Autodiag2 + OpenAI

Tämä paketti sisältää GitHub Pages -frontendin ja Cloudflare Worker -backendin.

## Mitä uusi versio tekee

1. Käyttäjä syöttää auton, valinnaisen VINin, vikakoodit, oireen ja työkalut.
2. Worker hakee VIN-tiedot NHTSA vPIC API:sta, jos VIN on annettu.
3. Worker hakee vikakoodien määritelmät Autodiag2-tietokannasta Cloudflare D1:stä.
4. Nämä lähdetiedot annetaan AI:lle yhdessä käyttäjän mittaustulosten kanssa.
5. AI antaa yhden seuraavan mittauksen kerrallaan.
6. AI:ta on nimenomaisesti kielletty keksimästä ajoneuvokohtaisia pinnejä, johdinvärejä, momentteja tai tarkkoja vertailuarvoja, jos niitä ei ole lähdedatassa.

## Julkaisu

### 1. GitHub Pages

Vie juuren tiedostot GitHub-repoon:

- index.html
- style.css
- script.js
- config.js
- CNAME
- favicon.svg
- robots.txt
- sitemap.xml
- admin.html

GitHub Pages: Settings -> Pages -> Deploy from branch -> main / root.

### 2. Cloudflare Worker

Asenna Node.js ja Wrangler:

```bash
npm install -g wrangler
wrangler login
```

Siirry `cloudflare-worker`-hakemistoon.

Luo KV aktivointikoodeille:

```bash
wrangler kv namespace create ACCESS_CODES
```

Lisää saatu namespace ID `wrangler.toml`-tiedostoon.

Luo D1 Autodiag2:lle:

```bash
wrangler d1 create autosahkoapu-autodiag
```

Lisää saatu database_id `wrangler.toml`-tiedostoon.

Lisää salaisuudet:

```bash
wrangler secret put OPENAI_API_KEY
wrangler secret put ADMIN_SECRET
```

Lisää Cloudflare Workerin Variables-kohtaan:

- `ALLOWED_ORIGIN` = `https://autosahkoapu.fi`
- `OPENAI_MODEL` = `gpt-5.6-luna`

### 3. Autodiag2-data D1:een

Autodiag2 julkaisee käännetyn SQLite-tietokannan GitHub Releasesissa nimellä `ad_database.sqlite`.

Lataa uusin virallinen release:

https://github.com/autodiag2/database/releases

Tämän paketin työkalu muuntaa tietokannasta vain AI:n tarvitsemat DTC-taulut D1:een sopivaksi SQL:ksi:

```bash
python tools/autodiag_to_d1.py /polku/ad_database.sqlite autodiag_d1.sql
```

Tuo SQL D1:een:

```bash
wrangler d1 execute autosahkoapu-autodiag --remote --file=autodiag_d1.sql
```

Autodiag2:n tietokantadata on ODbL-1.0 / DbCL-1.0 -lisensoitua. Säilytä lähde- ja lisenssimaininta palvelussa ja tarkista lisenssin velvoitteet ennen kaupallista julkaisua.

### 4. Deploy Worker

```bash
wrangler deploy
```

Saat osoitteen tyyliin:

`https://autosahkoapu-ai.<tili>.workers.dev`

Lisää se juuren `config.js`-tiedostoon `workerUrl`-arvoksi.

### 5. EezyPay-linkit

Lisää `config.js`-tiedostoon omat maksulinkit:

```js
paymentLinks: {
  single: "OMA_EEZYPAY_LINKKI",
  five: "OMA_EEZYPAY_LINKKI",
  month: "OMA_EEZYPAY_LINKKI"
}
```

## Datalähteiden roolit

### NHTSA vPIC

Käytetään VIN-tunnistukseen. Se ei ole korjaus- eikä mittausarvotietokanta. USA-markkinoiden ulkopuolisissa autoissa data voi olla rajallista.

### Autodiag2

Käytetään DTC-koodin määritelmän ja mahdollisen valmistaja-/ECU-kontekstin hakemiseen. DTC-määritelmä ei yksin todista juurisyytä.

### OpenAI

AI valitsee seuraavan diagnostisen mittauksen lähdedatan, oireen, vikakoodien ja aiempien mittaustulosten perusteella.

## Tärkeä turvallisuusraja

Frontend ei sisällä OpenAI API -avainta. Avaimen pitää olla vain Cloudflare Workerissa secret-muuttujana.

AI:n promptissa on myös pakotettu sääntö: tarkkoja ajoneuvokohtaisia pinnejä tai mittausarvoja ei saa keksiä, jos niitä ei ole varmennetussa lähdedatassa.
