# Verkkohaku vianetsinnän tueksi

Valmisteltu 8.10.2026. Toiminto on pois käytöstä, kunnes oma Brave-tili,
avain, maksuttomat hyvitykset ja tietosuojakäytännöt on tarkistettu.

## Käyttöönotto

1. Luo Brave Search API -tili ja ota Search-palvelu käyttöön. Tarkista
   omalta tililtä nykyinen maksuton hyvitys. Tarkistushetken hinnasto on
   5 USD / 1 000 hakua ja 5 USD maksuton kuukausihyvitys. Älä osta
   lisäkrediittejä, ota automaattista saldojen lataamista käyttöön tai
   hyväksy maksullista ylitystä. Jos tili ei mahdollista rajattua maksutonta
   käyttöä, jätä toiminto pois käytöstä.
2. Käytä erillistä avainta vain tälle sivustolle. Worker ei voi valvoa
   muiden sovellusten saman tilin kulutusta eikä palveluntarjoajan hintojen
   tai hyvitysten muutoksia. Tilin oma maksujen esto tarvitaan koodirajan
   lisäksi; koodiraja ei yksin ole lupaus siitä, ettei laskua voi syntyä.
3. Tarkista Brave Search API:n käsittelysopimus, siirtosuojat sekä hakudatan
   käyttöehdot. Selvitä erityisesti hakutulosotteiden hyödyntäminen
   tekoälyvastauksen tukena. Lisää tietosuojaselosteeseen todelliset tilin
   käytännöt ennen hakujen avaamista.
4. Lisää Cloudflaren AI-Workerille salaisuus `BRAVE_SEARCH_API_KEY`.
   Älä liitä avainta keskusteluun, GitHubiin tai config.js-tiedostoon.
5. Varmista `WEB_SEARCH_BUDGET`-sidonta ja `v2-web-search-budget`-migraatio.
   Aseta `WEB_SEARCH_ENABLED` arvoksi `true` vasta yllä olevien tarkistusten
   jälkeen. Diagnostiikka toimii myös arvolla `false` tai ilman avainta.
6. Testaa omalla testikoodilla esimerkiksi: Ford Mondeo, 2010,
   2.0 bensiini 145 hv; kylmänä ei vastaa kaasuun, uudelleenkäynnistys
   auttaa. Pyydä lopuksi "Etsi netistä vastaavaa oiretta".
   Varmista, että lähdelinkit toimivat ja epävarmuus näkyy vastauksessa.

## Kulutus ja tiedot

- Enintään yksi Brave-haku käyttäjän nimenomaista hakupyyntöä kohti.
  `/lookup` ei tee verkkohakua. Tavalliset diagnoosiviestit eivät tee sitä.
- Kaikille käyttäjille yhteinen raja on 800 yritystä liukuvan 32 päivän
  aikana: tämä on varovaisempi kuin kalenterikuukausittainen 800 raja.
  Myös epäonnistuneet ja aikakatkaistut yritykset kuluttavat kiintiötä.
- Raja varataan vahvasti konsistentissa Durable Objectissa ennen hakua.
  Sidonnan tai tallennuksen virhe pysäyttää verkkohakuyrityksen.
- Raja ei käytä eikä muuta asiakkaan AI-vaiheiden laskentaa. Tavallinen
  AI-vastaus veloitetaan edelleen nykyisen logiikan mukaisesti.
- Braveen lähetetään vain tunnettu merkki ja malli, vuosimalli,
  moottorin tilavuus/käyttövoima, standardoidut vikakoodit ja ennalta
  määritellyt oiretermit. Sinne ei lähetetä raakaa keskustelua, asiakkaan
  nimeä, sähköpostia, IP-osoitetta, aktivointikoodia, VINiä tai liitteitä.
  Brave näkee normaalit palvelinten välisen yhteyden tekniset tiedot.
- Kiintiötallennuksessa on vain hakuyritysten ajankohtia; ne poistuvat
  liukuvan 32 päivän jakson jälkeen. Hakukyselyjä ja tuloksia ei tallenneta
  tähän rekisteriin. Otteet toimitetaan olemassa olevan AI-vastauksen
  yhteydessä OpenAI:lle ja tuloslinkit selaimeen.
- Hakutuloksista käytetään enintään viittä lyhyttä otetta. Kohdesivuja ei
  avata, ladata kokonaan tai käsitellä suoritettavina ohjeina.
- Tulokset ovat varmentamattomia verkkoväitteitä, eivät OEM-varmennusta.
  Mallin ja moottorin soveltuvuutta ei oleteta. Osan vaihtoa ei pidä
  perustella pelkällä samanlaisella verkkokertomuksella.
- Tämänhetkinen automallin tunnistus käyttää nykyisen Workerisi tunnettua
  malliluetteloa. Tuntemattomasta mallista pyydetään lisätietoa, eikä
  vapaata henkilötietoja mahdollisesti sisältävää tekstikenttää lähetetä
  hakupalveluun.

## Lähteet ja testit

- [Brave Search API:n hinnasto](https://api-dashboard.search.brave.com/app/plans)
- [Brave Search API:n dokumentaatio](https://api-dashboard.search.brave.com/app/documentation/web-search/get-started)

`node tests/web-search.test.cjs` tarkistaa mock-palvelulla Mondeo-kyselyn,
tietojen minimoinnin, promptin lähderajat, linkit, rinnakkaiset haut,
800 yrityksen rajan, tallennusvirheen ja aikaleimojen poistumisen.
Se ei varmista todellisia hakutuloksia, tilin laskutusta tai live-AI:n
vastausten laatua. Käyttöönotto vaatii erillisen live-testin.
