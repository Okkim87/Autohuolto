# Google Forms -palaute

Sivuston palautekohdan koodi on valmis. Se tulee näkyviin vasta, kun `config.js`-tiedoston `feedbackFormUrl` sisältää lomakkeen vastauslinkin. Ei Worker- tai sähköpostipalvelun avaimia. Lomaketta ei upoteta sivulle eikä Google Forms -pyyntöjä tehdä ennen linkin avaamista.

Käytössä oleva vastauslinkki: https://docs.google.com/forms/d/e/1FAIpQLSfD4YS0g_8NZy2enV93vhkme80OI01lqpoAspL63ziOQz-J5w/viewform . Julkinen vastaajan HTML tarkistettiin 11.10.2026 ilman kirjautumista: otsikko Autosähköapu – palaute, yksi kappalevastauksen kysymys Palaute tai kehitysehdotus, ei nimi-/sähköpostikenttää. Kirjautumista ehdotetaan vain luonnoksen tallentamiseen. Aihekysymys on vapaaehtoinen jatkoparannus, ei käyttöönoton ehto. Testipalautetta ei lähetetty. Omistajan vastauksien vastaanottoa, ilmoituksia, taulukkoa tai vastausten yhteenvedon asetusta ei voida todentaa julkisesta lomakenäkymästä; pidä vastaukset yksityisinä.

## Lomake omalla Google-tilillä

1. Avaa https://forms.new ja nimeä lomake **Autosähköapu – palaute**.
2. Kuvaus: **Kerro mitä palvelussa tai OBD-sovelluksessa pitäisi kehittää. Älä lisää nimiä, yhteystietoja, rekisteritunnusta tai valmistenumeroa. Palautteisiin ei voida vastata henkilökohtaisesti.**
3. **Mitä pitäisi kehittää?**: monivalinta, vaihtoehdot Vianetsinnän vastaukset / OBD-sovellus ja mittaukset / Sivuston käytettävyys / Muu.
4. **Palaute tai kehitysehdotus**: kappalevastauksena, pakollinen.
5. Asetukset: **Kerää sähköpostiosoitteita** pois; **Rajoita yhteen vastaukseen** pois; älä rajoita vastaajia organisaatioon tai vaadi kirjautumista. Älä lisää tiedostolatausta, joka edellyttää kirjautumista.
6. **Näytä tulosten yhteenveto** pois, jotta vastaajat eivät näe muiden palautteita. Vahvistusviesti: **Kiitos palautteesta! Käytämme sitä palvelun kehittämiseen.**
7. Julkaise lomake vastaajien käytettäväksi, käyttöoikeutena linkin saaneet. Kopioi **vastauslinkki**, ei muokkauslinkkiä. Tarkista uloskirjautuneena, että lomake toimii eikä vaadi nimeä/sähköpostia. Julkista vastauslinkkiä ei käytetä vastaustaulukon tai muokkausoikeuden jakamiseen.
8. Halutessasi Vastaukset-välilehdestä luo Google Sheets -taulukko. Älä jaa taulukkoa julkisesti. Vastaukset-välilehden valikosta voi ottaa käyttöön ilmoitukset uusista vastauksista omalle Google-tilille. Osoitteeseen autosahkoapu@gmail.com ilmoitus saadaan käyttämällä tätä tiliä; toiseen tiliin kirjautumista ei oleteta.

## Sivuston kytkentä

Lisää vastauslinkki `config.js` → `feedbackFormUrl`. Hyväksytyt muodot ovat `https://forms.gle/...` ja `https://docs.google.com/forms/d/.../viewform` (myös `/d/e/.../viewform`). Muokkauslinkit ja muut palvelut eivät aktivoi painiketta. Linkistä poistetaan kyselyparametrit ja fragmentti, jotta esimerkiksi esitäytettyjä tunnistetietoja ei lähetetä.

Tietosuojaselosteessa kuvataan Forms-palautteen käsittely ja enintään 12 kuukauden poistokäytäntö. Tämä vaatii ylläpitäjän tekemän poiston Formsista ja mahdollisesta taulukosta; koodi ei tee automaattista poistoa Google-tilillä.

Lomakkeen asetukset ja vastaanotto on tarkistettava ennen linkin kytkemistä ja julkaisua. Pelkkä painikkeen toteutus ei luo Google-lomaketta eikä osoita palautteiden tallentuvan.

Google-ohjeet: https://support.google.com/docs/answer/2839588?hl=fi ja https://support.google.com/docs/answer/139706?hl=fi.

## Toimitettu vastauslinkki, tarkistus 11.10.2026

https://docs.google.com/forms/d/e/1FAIpQLSebJqPaXjastEZ89zhZZiOiME_VS3dymQ5B6TkdG2R6cUX1MA/viewform

Julkinen vastaajan HTML avautui HTTP 200 ilman kirjautumista. Sisältö oli vielä Nimetön lomake ja yksi Nimetön kysymys / 1. vaihtoehto -monivalinta. Kirjoitettavan palautteen kysymys puuttui. Linkkiä ei vielä aktivoitu config.js:ssä eikä muutosta julkaistu. Käyttäjältä pyydettiin lomakkeen kysymysten täyttämistä; tarkista sama vastauslinkki uudelleen käyttäjän valmistumisilmoituksen jälkeen. Google-tilin omistajan asetuksiin tai muokkausnäkymään ei ole yhteyttä.
