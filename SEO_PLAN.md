# Orgaanisen näkyvyyden työlista

Lähtötilanne tarkistettu 4.10.2026. Sivusto julkaistaan GitHub Pagesilla repositorion main-haarasta. Käyttäjän mukaan Google Search Console on käytössä. Search Consolen verkkohakuvienti ajalta 2.–29.9.2026 on analysoitu. Sen perusteella ensimmäinen sisältöprioriteetti on olemassa oleva P0171-opas. Paikallisten hakujen sisältö edellyttää palvelun todellisen tarjonnan vahvistamista. Indeksointitila tarkistetaan erikseen URL-tarkastuksesta.

## Ensimmäinen toteutettu muutospaketti

- Tuotannon `/autodiagnostiikka/` palautti 404:n ja `/Autodiagnostiikka/` 200:n. Sivukartta, sisäiset linkit ja oppaan canonical-, hreflang-, Open Graph- sekä strukturoitujen tietojen osoitteet korjataan vastaamaan olemassa olevaa isolla alkukirjaimella julkaistua sivua. Julkaistua sivua ei siirretä.
- Lisätään yksi oireeseen vastaava opas: `/akku-tyhjenee-yon-aikana/`. Se erottaa akun kunnon, latausvajauksen ja lepovirrankulutuksen, sisältää oman DC-virtapihtikuvan, tulkintaesimerkin, tarkentavat tiedot ja valmistajien lähdeviitteet.
- Etusivun oppaisiin lisätään linkki uuteen oppaaseen ja opas lisätään sivukarttaan.
- Uutta opasta ei esitetä oikeana korjaamokokemuksena tai tietyn asiantuntijan tarkistamana, koska tällaisia tietoja ei ole annettu.

## Seuraavat 6 viikkoa

| Järjestys | Työ | Valmistumisen näyttö |
| --- | --- | --- |
| 1 | Tarkista Search Consolen verkkohaku viimeiseltä 28 päivältä: kyselyt, sivut, klikkaukset ja näyttökerrat. Pienellä aineistolla katso myös 3 kuukautta. | Tallennettu lähtötilanne ja tärkeimmät nykyiset hakukyselyt. |
| 2 | Julkaise korjaukset ja uusi akkuopas. Tarkista uuden oppaan ja `/Autodiagnostiikka/`-sivun URL-tarkastuksessa Googlen valitsema canonical ja indeksointitila. Tarkista sivukartan tila. | Molemmat URL:t latautuvat, sivukartassa ei ole vääriä osoitteita. Indeksointi voi valmistua myöhemmin. |
| 3 | Täydennä tekijätiedot oikealla nimellä, osaamisella ja palvelun toimintatavalla. Sivujen footer-linkki `/#tekijasta` ei tällä hetkellä osu olemassa olevaan osioon. | Lukija näkee, kuka palvelua ylläpitää ja mitä tietoa AI käyttää. Ei keksittyjä pätevyyksiä. |
| 4 | Paranna ensin hakunäyttökertoja jo saavia oppaita. Vastaa niiden todellisiin kysymyksiin ja lisää käyttäjän omia, anonymisoituja mittaus- tai korjausesimerkkejä. | Jokaisessa parannetussa oppaassa selkeä vastaus, näyttö ja seuraava askel. |
| 5 | Valitse seuraava uusi opas Search Consolen havaintojen ja todellisten asiakaskysymysten perusteella. Alustavia ehdokkaita: auton akun jännitemittaus ja akun latautumisen ongelmat. Uuden akkuoppaan kysyntä on vielä hypoteesi; P0171:n parantaminen asetetaan sen edelle. | Yksi laadukas opas kerrallaan. Ei samasta aiheesta useita lähes identtisiä sivuja. |
| 6 | Tee omasta, varmennetusta mittaustapauksesta lyhyt kuva- tai videomuotoinen julkaisu ja linkitä siihen liittyvään oppaaseen. Jakelu vain käyttäjän hyväksymissä kanavissa. | Aito tapaus, selkeä mittaustulos ja hyödyllinen opas. Ei ostettuja linkkejä tai massakommentointia. |

## Mitä seurataan

Vertaa samaa ajanjaksoa edelliseen vastaavan pituiseen jaksoon. Aloita 28 päivästä; pienillä määrillä pidempi jakso auttaa. Erota brändikyselyt, kuten Autosähköapu, muista hauista.

1. Googlen klikkaukset ja näyttökerrat ilman brändihakua.
2. Mitkä oppaat saavat hakuliikennettä ja millä kyselyillä.
3. Onko oikea sivu indeksoitu ja vastaako Googlen canonical tarkoitettua osoitetta.
4. Kuinka moni oppaan lukija siirtyy diagnoosiin. Nykyisen analytiikan tapahtumaseurantaa ei ole tässä muutospaketissa tarkistettu; tapahtumaa tai konversiomäärää ei pidä olettaa olevan käytettävissä.

Keskimääräinen sijoitus ja klikkausprosentti ovat tukimittareita. Niitä tulkitaan kysely- ja sivukohtaisesti. Sivujen määrää tai yksittäisen avainsanan sijoitusta ei käytetä ainoana onnistumisen mittarina. Hakutuloksiin pääsyä tai tiettyä kävijämäärää ei voida luvata.

## Julkaisuperiaate

Oppaan pitää vastata lukijan kysymykseen jo ennen AI-kokeiluun ohjaamista. Oikeat mittaustapaukset, itse tehdyt kuvat ja lähteet tukevat luotettavuutta. Mallikohtaisia tyyppivikoja, raja-arvoja, sulaketietoja tai tekijän kokemuksia ei keksitä. AI voi auttaa luonnostelussa, mutta tekninen sisältö tarkistetaan ennen julkaisemista. Päivämäärää päivitetään vain todellisen muutoksen yhteydessä.

Ohjeiden pohja: [Googlen hyödyllisen sisällön ohje](https://developers.google.com/search/docs/fundamentals/creating-helpful-content), [AI-avusteisen sisällön ohje](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content), [sivukartan ohje](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).
