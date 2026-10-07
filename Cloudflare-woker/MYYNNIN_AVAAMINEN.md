# Maksullisen myynnin avaaminen

Nykyinen julkaisu on maksuton testi. `salesOpen: false`, tyhjät maksulinkit
ja pois käytöstä oleva verkkoperuuttamislomake ovat tarkoituksellisia.
Nykyiseen diagnostiikka-Workeriin tai koodien saldoihin ei tehdä muutoksia.

## Ennen myyntiä

1. Vahvista Eezyltä, kuka on asiakkaan sopimuskumppani ja mitkä yritystiedot
   ilmoitetaan. Lisää käyttöehtoihin myyjän nimi, maantieteellinen osoite,
   asiakaspalvelun puhelinnumero, sähköposti ja soveltuvat yritystunnistetiedot.
   Myyjän maantieteellinen osoite tarvitaan myös asetuksen mukaiseen
   peruuttamislomakkeeseen. Älä korvaa omaa osoitetta Eezy-yhtiön osoitteella
   ilman vahvistettua perustetta.
2. Vahvista hinnat ja pakettien sisältö EezyPay-maksusivuille. Kokonaishinta
   sisältää soveltuvat verot. Nykyinen koodin voimassaolo alkaa luomisesta:
   ilmoita tämä ennen ostoa ja toimituksessa, tai muuta toteutus ja ehdot
   samanaikaisesti. Sovi ja kerro toimitusaika ennen tilausta.
3. Varmista maksuvaiheessa tilauksen maksuvelvollisuuden yksiselitteinen
   hyväksyminen, tärkeimmät ennakkotiedot ja käyttöehdot. EezyPayn toiminta
   on tarkistettava oikealla maksulinkillä; sivuston teksti ei varmista sitä.
4. Toimita tilausvahvistus, ennakkotiedot, ostohetken ehdot ja asetuksen
   mukainen peruuttamislomake pysyvällä tavalla esimerkiksi sähköpostin
   tekstinä tai liitteenä. Pelkkä linkki muuttuvaan verkkosivuun ei riitä.
5. Määrittele palvelun oikeudellinen luonne. Jos palvelu aloitetaan
   peruuttamisaikana, hanki lain edellyttämä erillinen nimenomainen pyyntö ja
   hyväksyntä. Älä oleta aktivoinnin tai yleisten ehtojen hyväksymisen
   riittävän. Digitaalisen sisällön ja digitaalisen palvelun poikkeukset ovat
   erilaiset. Älä peri käytöstä vähennystä ilman kaikkien edellytysten
   täyttymistä. Vaihtoehtona on kuluttajalle edullisempi 14 päivän täysi
   palautus myös käytön jälkeen, mutta tämä kaupallinen päätös on tehtävä
   erikseen ennen sen lupaamista.
6. Toteuta ja testaa alla kuvattu verkkoperuuttaminen sekä sen saatavuus
   myös EezyPayn sopimuksentekorajapinnassa. Omalla sivulla oleva lomake ei
   yksin varmista ulkopuolisen maksusivun vaatimusten täyttymistä.
7. Tarkista oikeat maksulinkit ja kaikki yllä olevat kohdat. Avaa myynti
   vasta sen jälkeen muuttamalla `salesOpen`-asetusta. Ehtopäivitys ei
   muuta aiempia sopimuksia takautuvasti.

## Resend Free -liitännän valmistelu

Valmiina ovat `cancellation-worker.js`, erillinen julkaisumääritys
`cancellation.wrangler.jsonc` ja lomake `/peruuttaminen/`-sivulla.
Niitä ei ole kytketty tuotantoon. Lomake näkyy vasta, kun sekä endpoint
että Turnstile-sivustoavain on asetettu `config.js`:ään.

1. Luo Resend Free -tili ja vahvista oma lähetysverkkotunnus, esimerkiksi
   `mail.autosahkoapu.fi`, Resendin antamilla DNS-tietueilla. Älä käytä
   esimerkkilähettäjää tai testiverkkotunnusta tuotannossa. Poista viestien
   avaus- ja linkkiseuranta käytöstä. Älä ota maksullista ylityslaskutusta
   käyttöön. Tarkista tilin todelliset rajat; tarkistushetkellä 7.10.2026
   Free-raja on 100 viestiä päivässä.
2. Tarkista Resendin käsittelysopimus, alikäsittelijät, siirtoperusteet,
   säilytysajat ja oma tiliasetus. Päivitä tietosuojaseloste ennen käyttöä:
   Resend käsittelee peruuttajan nimen, sähköpostin, peruutettavan tilauksen,
   aikaleiman ja vastaanottovahvistuksen. Turnstile käsittelee teknisiä
   tarkistustietoja. Sisältöä ei lähetetä OpenAI:lle.
3. Luo Cloudflare Turnstile -widget autosahkoapu.fi-verkkotunnukselle.
   Tässä lomakkeessa action on `withdrawal`. Julkinen sitekey tulee
   `config.js`:ään, salainen avain vain Cloudflareen. Säilytä sähköpostitse
   peruuttaminen rinnalla saavutettavana vaihtoehtona.
4. Julkaise erillinen Worker tämän hakemiston julkaisumäärityksellä.
   Aseta Cloudflaren salaisuuksina `RESEND_API_KEY`, `TURNSTILE_SECRET`
   ja uusi vahva `ADMIN_SECRET`. Aseta muuttuja `EMAIL_FROM` vahvistetun
   lähettäjän muodossa, esimerkiksi `Autosähköapu AI <peruutukset@OMA-VAHVISTETTU-VERKKOTUNNUS>`.
   Älä käytä AI-Workerin hallintasalaisuutta uudelleen. Älä lisää avaimia
   GitHubiin, selainkoodiin tai keskusteluun.
5. Aseta `config.js`-tiedostoon uuden Workerisi `/withdraw`-osoite
   `cancellationUrl`-arvoksi ja widgetin julkinen `turnstileSiteKey`.
6. Testaa vastaanottovahvistus oikeaan testisähköpostiin ja ilmoitus
   `autosahkoapu@gmail.com`-osoitteeseen. Varmista myös sähköpostin
   virhetilanne: ilmoitus säilyy, käyttöliittymä ei väitä viestiä lähetetyksi
   ja tallennettava kuitti on saatavilla. Testaa toisto ilman uutta ilmoitusta.

## Ilmoitusten käsittely

Vastaanotto ei automaattisesti sulje aktivointikoodia tai palauta rahaa:
ilmoituksen tekijä ja ostos on tarkistettava ennen niitä. Tämä estää
sivullista sulkemasta toisen asiakkaan koodia.

Uusi ilmoitus tallennetaan erillisen Workerisi Durable Objectiin. Asiakas
saa sähköpostikuittauksen ja ylläpitäjä ilmoituksen. API-palvelun hyväksyntä
ei takaa sähköpostin lopullista toimitusta: seuraa Resendissä myös hylättyjä
ja palautuneita viestejä. Sähköpostin lähetyksiä yritetään virhetilanteessa
uudelleen. Resendin idempotenssiavain vähentää toistoviestejä sen tukeman
ajan puitteissa.

Hallintapyyntö `GET /admin/requests` vaatii Authorization Bearer -salaisuuden
ja näyttää vastaanotetut ilmoitukset. Tarkista jono säännöllisesti myös,
jos sähköposti-ilmoitusta ei tullut. Älä tallenna tuloksia julkiseen tiedostoon.

Kun asia on käsitelty loppuun, tee samalla hallintatunnistuksella
`POST /admin/resolve` ja JSON `{"id":"ILMOITUKSEN-TUNNISTE"}`.
Tietue poistuu automaattisesti viimeistään 365 päivässä asian päättymisestä.
Älä merkitse avointa riitaa päättyneeksi. Erillisiin lakisääteisiin tositteisiin
sovelletaan niiden omia säilytysvelvoitteita.

Ilmoituksia voi tulla enintään 40 päivässä ja lähetysyrityksiä enintään
90 päivässä. Raja voi viivästyttää lomaketta tai sähköpostia: sähköpostitse
peruuttamista ei saa poistaa rinnalta. Hallintapyyntöihin ei sisälly
automaattista maksunpalautusta tai uuden sähköpostin lähettämistä.

## Lähteet

- [KKV: peruuttaminen ja verkkoperuuttamistoiminto](https://www.kkv.fi/kuluttaja-asiat/tietoa-ja-ohjeita-yrityksille/verkkokauppiaille/peruuttamisoikeus-ja-peruuttamisaika/)
- [KKV: kuluttajalle annettavat tiedot](https://www.kkv.fi/kuluttaja-asiat/tietoa-ja-ohjeita-yrityksille/verkkokauppiaille/kuluttajalle-annettavat-tiedot-ja-niiden-esittaminen-verkkokaupoissa/)
- [Kuluttajansuojalaki, erityisesti 6 ja 5 a luku](https://www.finlex.fi/fi/lainsaadanto/1978/38)
- [Resendin hinnasto](https://resend.com/pricing)
- [Resend: sähköpostin lähettäminen](https://resend.com/docs/api-reference/emails/send-email)
- [Resend: idempotenssiavaimet](https://resend.com/docs/dashboard/emails/idempotency-keys)

Tekniset mock-testit eivät vahvista lainmukaisuutta tai sähköpostin
todellista toimitusta. Maksuvaihe ja tuotantoviestit on tarkistettava erikseen.
