# Nykyinen käyttöpolku: Android 0.14

Hallinnan uudet ASAPP-koodit sisältävät AI-paketin ja appin saman voimassaolon. Pelkkä selain toimii samalla koodilla ilman appia. Vanhoja koodeja, saldoja ja päättymispäiviä ei muuteta; vanhat erilliset testaajakoodit toimivat kuten ennen.

Aktivoi appi, yhdistä autoon ja vahvista auto. Avaa vianetsintä: tarkistettu uusi yhdistelmäkoodi aktivoi sisäisen keskustelun automaattisesti. Paina appin Yhdistä mittaukset ja hyväksy lähetys. OBD-parituskoodi siirtyy muistissa ilman käyttäjän kirjoittamista. Tarkista keskustelussa auto ja valitse Käytä näitä auton tietoja ennen kysymystä. Tavallisessa ulkoisessa selaimessa ja vanhoissa APK-versioissa käsin tehtävä paritus säilyy. Uusi APK: android-obd/artifacts/Autosahkoapu-OBD-0.14.apk.

Appin oikeus ei kuluta AI-vaiheita. Appin oikeus jatkuu paketin loppuun AI-saldon loputtuakin. Appi sitoutuu yhteen asennukseen, selaimen oikeus toimii aiemman käytännön mukaan. Ei tietokantamigraatiota, uusittuja vanhoja koodeja tai uusia salaisuuksia. Alla aiempien versioiden tekniset kuvaukset.

# OBD-mittausten yhdistäminen keskusteluun

Android-koeversio 0.8: Bluetooth Classic SPP / ELM327, Android 8+. Yhdistä autoon, vahvista auto. Automaattinen mittausvalinta on oletuksena päällä; käsin valinta on Lisäasetuksissa. Sovelluksen Avaa vianetsintä avaa sivun saman Activityn sisälle. Foreground-palvelu pitää yhteyden myös selaimeen siirryttäessä. Katkaise lopuksi ilmoituksesta tai sovelluksesta.

Aktivoi sivulla testikoodi. OBD → Luo yhdistämiskoodi. Kopioi koodi sovelluksen Syötä koodi -kohtaan. Tarkista sivulla näkyvä auto ja Käytä näitä auton tietoja. Lähetä seuraava oire tai kysymys: Worker tarkistaa oikean auton ja hakee tuoreet mittaukset juuri tälle viestille. Ei automaattisia AI-kutsuja mittausten tahdissa.

Koodi kelpaa kerran viiden minuutin ajan. Istunto 30 minuuttia, näytteiden tuoreus 30 sekuntia. Lähetys ja sivun päivitys noin 10 sekunnin välein. Monotoniseen kelloon perustuva näyteikä ja palvelimen aika huomioivat myös siirtoviiveen. Ei aikasarjatallennusta, min/max/trendejä tai nopean signaalin analyysiä. Puuttuva/ristiriitainen arvo ei ole kelvollinen lukema. Epäselvä auto tai auton tietojen ristiriita estää mittausten käytön diagnoosissa.

## Käyttöönotto

Worker tarvitsee `OBD_SESSIONS`-sidonnan `ObdSession`-luokkaan ja `v3-obd-sessions`-migraation. Käytä todellista `ready/wrangler.jsonc`-konfiguraatiota aiempine sidontoineen ja salaisuuksineen; repossa olevat KV/D1-tunnukset ovat esimerkkejä. Kopioi worker.js, source-reader.mjs ja obd-parameters.mjs julkaisuun. Julkaise Worker ennen etusivun OBD-ohjaimia. Uusia ulkoisia API-avaimia ei tarvita.

`/obd/create` vaatii voimassa olevan aktivointikoodin, käyttää AccessGate-jonotusta ja enintään 30 luontia/24h per koodi, 30s välein. Muut reitit `/obd/pair`, `/obd/upload`, `/obd/read`, `/obd/close`, `/obd/disconnect` tarvitsevat kertakoodin tai istuntokohtaisen 256-bittisen roolitunnisteen. Luontikoodi on 60 satunnaisbittiä, DO-nimi SHA256 koodista. Tunnisteet vain POST-rungossa, ei queryssä, lokissa tai localStoragessa. Pariin liittäminen on atominen ja kertakäyttöinen. Selaimen tunniste lukee/sulkee; sovelluksen tunniste lähettää/katkaisee, ei lue. Sulkemisen jälkeen myöhäinen paketti ei voi elvyttää mittauksia.

Säilytetään vain viimeinen paketti, enintään 84 omaan standardirekisteriin kuuluvaa arvoa; pyyntöraja 32KiB ja lähetysraja 5s. Nimillä/yksiköillä on palvelimen rekisteri. Asiakkaan näytteet ovat epäluotettavaa dataa, eivät palvelimen todentama fyysinen autoyhteys tai hyväksymisrajoja. Auto on käyttäjän vahvistama. Ei OEM-yksikköskannauksia, komentoja, vikakoodien poistoa tai koodausta tämän rajapinnan kautta. Ei Car Scannerin tietokantaa.

## Tarkistus oikeassa autossa

Auto turvallisesti paikallaan. Yhdistä koe-APK omalla adapterilla ja vahvista tarkistustulos sekä muutama lukema. Koodilla liittäminen, oikean auton vahvistus ja seuraava kysymys testataan samalla puhelimella sovelluksen sisäisessä keskustelussa. Kokeile myös Bluetooth-katkos, internet-katkos ja lopetus: vanhoja lukemia ei saa merkitä tuoreiksi. Mittauslähetys ei saa vähentää AI-vaiheita. Vain viestipyyntö käyttää normaalia käyttömäärää. Fyysinen koe on vielä tekemättä; Node/Java-testit sekä Android-käännös eivät korvaa sitä.

## 0.8: automaattinen mittausvalinta

Sovellus lähettää /obd/pair-pyynnössä auton tukeman oman standardirekisterin tunnistejoukon. Worker valitsee enintään kuusi toteutettua ja tuettua arvoa keskustelun nykyisen kysymyksen, tarvittaessa vastauksen seuraavan mittauksen tai aiemman oireen mukaan. Ensimmäinen versio käyttää rajattuja, testattavia sääntöryhmiä, ei mallin vapaasti generoimia ELM-komentoja. Mukana perusseuranta, kylmäkäynti, jäähdytysneste, öljylämpö, seossäätö, sytytyskatkoksen olosuhteet, kaasupoljin/läppä, polttoainepaine, EGR, happianturi, imuilma sekä polttoainehöyryt. ABS/airbag/väylämittaukset eivät saa korvikkeeksi moottorin jännitelukemaa: standardivalinta tyhjennetään ja tavallinen lähteistetty vianetsintä jatkuu.

Mittauspyyntö tallentuu nykyiseen määräaikaiseen istuntoon. /obd/upload-vastaus palauttaa plan(revision, ids, reason, names, unavailableNames); ei ylimääräisiä AI-kutsuja. Sovellus validoi yksilölliset olemassa olevat tunnisteet, auton tuen ja kuuden arvon rajan. Se vaihtaa valintaa atomisesti ja ilmoittaa appliedPlanRevision:n sekä samplingMode:n seuraavassa paketissa. Vanha tai virheellinen pyyntö ei korvaa nykyistä valintaa. Worker ei väitä uusia mittauksia saaduiksi pelkän pyynnön tai kuittauksen perusteella: tarvitaan tuore oikea näyte. Käsin tilassa pyyntö jää ehdotukseksi ja käyttäjä määrää valinnan; paluu automaattiseen käyttää viimeistä validoitua suunnitelmaa. Uusi paritus nollaa suunnitelmaversiot.

Vanhemmat APK:t toimivat edelleen käsin valituilla arvoilla, mutta eivät tue automaattista valintaa. Tukilista puuttuu niistä, eikä Worker päättele tukea havaittujen näytteiden perusteella. Ei uusia palvelinmigraatioita tai API-avaimia. Fyysinen 0.8 koe on vielä tehtävä. Testaa keskustelun aiheen vaihtaminen kylmäkäynnistä lämpötilaan, odota noin 10 sekuntia ja varmista uudet tuetut valinnat. Pyynnön vaihtaminen ei itsessään vähennä AI-vaiheita; tavallinen keskusteluviesti vähentää normaalisti.


## Android-appin käyttöoikeus0.13
Hallinnassa /admin.html luodaan erikseen ASAPP-appikoodi ja ASAI-AI-koodi. Appikoodi antaa paikallisten toimintojen käyttöoikeuden1/7/30/365 päiväksi yhdelle asennukselle; se ei anna AI-vaiheita. Voimassaolo alkaa luontihetkestä. /app/activate on AccessGate:n serialisoima asennussidonta/verkkotarkistus; se ei kuluta AI-saldoa. Appin satunnaisesta asennustunnisteesta tallennetaan vain SHA256-tiiviste DO:hon, sidonta poistuu ajastetusti päättymiseen. /admin/reset-app-device tarvitsee admin-salaisuuden ja mahdollistaa puhelimenvaihdon. Backend-palvelin vastaa no-store, käyttöoikeus enintään15min/koodinexpiry, appi uusii5min ja katkaisee päättymisessä. Ei pysyvästi tallennettua offline-lupaa. Vanhoja koe-APK:ita ei voida tällä lukita; muokatun clientin paikallistoimintojen täydellistä suojausta ei luvata. AI-koodi ja nykyinen kertakäyttöinen OBD-parituskoodi ovat erilliset oikeudet. Omat havaintotallenteet voi katsella/jakaa/poistaa myös ilman appilupaa.
