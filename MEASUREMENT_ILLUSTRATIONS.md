# Mittausohjeiden havainnekuvat

AI-vastaus sisältää nyt valinnaisen `illustration`-kentän. Selain näyttää tunnusta vastaavan, paikallisen SVG-kaavion ohjeen yhteydessä. Kuva ja erillinen linkki avaavat kaavion suurempana. Tuntemattomia tunnuksia tai AI:n antamia kuvalinkkejä ei näytetä.

| Tunnus | Kuvan tarkoitus |
| --- | --- |
| `parasitic-current` | 12 V akun lepovirtamittaus yleismittarilla sarjassa miinuspuolella |
| `battery-voltage` | 12 V akun jännitemittaus V DC -asennossa |
| `dc-current-clamp` | Tasavirran mittaus yhden akun johtimen ympäriltä |

Sarjakytkentäkuva vaatii keskustelussa käyttäjän vahvistaman virtaliitännän ja sulakesuojauksen. Työkalun saatavuus yksin ei riitä. Kielteinen tai epävarma vastaus estää kuvan; uusi tieto rikkoutuneesta sulakkeesta peruuttaa vahvistuksen. Vahvistus tulkitaan rajatusta keskusteluhistoriasta, joten pitkän keskustelun jälkeen se voidaan joutua kysymään uudelleen. Havainnekuva ei korvaa mittarin käyttöohjetta, ajoneuvon valmistelua tai virta- ja aikarajojen tarkistamista.

Korkeajänniterajattuun vastaukseen tai tarkentavaan kysymykseen ei lisätä kuvaa. Ohjeen mittalaitteen pitää vastata kuvatyyppiä. AI:ta ohjeistetaan antamaan sama kytkentä tekstinä kuin kuvassa. Kuvat eivät ole automallikohtaisia korjauskaavioita eivätkä esitä ajoneuvon johdinvärejä. Kuvissa punainen ja musta kuvaavat mittajohtoja.

Kaaviot on piirretty tässä projektissa. Virtamittauksen sarjakytkentäperiaate ja sulakesuojaus on tarkistettu valmistajan yleisohjeesta: [Fluke: The ABCs of DMMs](https://media.fluke.com/ade6b718-4577-4b57-903b-b10600664c67_original%20file.pdf). Tämä ei tarkoita ajoneuvokohtaisen menetelmän tai mittarin soveltuvuuden vahvistamista.

## Tarkistus

Suorita repositorion juuresta:

```powershell
node --check script.js
node tests/measurement-illustrations.test.cjs
```

Testit kattavat vahvistukset, kielteiset ja epävarmat vastaukset, korkeajänniterajauksen, mittalaitteiden valinnan, kuvien sallitut tunnukset, HTML-renderöinnin ja vanhat AI-vastaukset ilman uutta kenttää.

## Julkaisu

1. Julkaise `script.js`, `style.css` ja `images/measurements/*.svg` yhdessä sivustolle. GitHub Pages julkaisee repositorion `main`-haaran juuresta.
2. Julkaise `Cloudflare-woker/worker.js` Cloudflareen. Säilytä nykyiset salaisuudet, muuttujat ja KV/D1-sidonnat sekä aiemmin käyttöön otettu `ACCESS_GATE` Durable Object.

Selain toimii edelleen vanhan Worker-vastauksen kanssa. Kuvia alkaa näkyä, kun myös uusi Worker on julkaistu. Pelkkä Worker-päivitys ei saa vanhaa selaimen JavaScriptiä näyttämään kuvia.

Repositorion Worker sisältää myös aiemmin Cloudflareen julkaistut käyttömäärän, auton vaihtumisen, AI-vastausten validoinnin ja moottoritunnistuksen korjaukset. `wrangler.toml`-tiedoston esimerkkitunnukset on korvattava nykyisillä tuotantotunnuksilla, jos julkaisu tehdään sen kautta.
