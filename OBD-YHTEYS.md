# OBD-mittausten yhdistäminen keskusteluun

Android-koeversio 0.7: Bluetooth Classic SPP / ELM327, Android 8+. Yhdistä autoon, vahvista auto ja valitse mittaukset. Sovelluksen Avaa vianetsintä avaa sivun saman Activityn sisälle. Vaihto puhelimen toiseen sovellukseen katkaisee autoyhteyden.

Aktivoi sivulla testikoodi. OBD → Luo yhdistämiskoodi. Kopioi koodi sovelluksen Syötä koodi -kohtaan. Tarkista sivulla näkyvä auto ja Käytä näitä auton tietoja. Lähetä seuraava oire tai kysymys: Worker tarkistaa oikean auton ja hakee tuoreet mittaukset juuri tälle viestille. Ei automaattisia AI-kutsuja mittausten tahdissa.

Koodi kelpaa kerran viiden minuutin ajan. Istunto 30 minuuttia, näytteiden tuoreus 30 sekuntia. Lähetys ja sivun päivitys noin 10 sekunnin välein. Monotoniseen kelloon perustuva näyteikä ja palvelimen aika huomioivat myös siirtoviiveen. Ei aikasarjatallennusta, min/max/trendejä tai nopean signaalin analyysiä. Puuttuva/ristiriitainen arvo ei ole kelvollinen lukema. Epäselvä auto tai auton tietojen ristiriita estää mittausten käytön diagnoosissa.

## Käyttöönotto

Worker tarvitsee `OBD_SESSIONS`-sidonnan `ObdSession`-luokkaan ja `v3-obd-sessions`-migraation. Käytä todellista `ready/wrangler.jsonc`-konfiguraatiota aiempine sidontoineen ja salaisuuksineen; repossa olevat KV/D1-tunnukset ovat esimerkkejä. Kopioi worker.js, source-reader.mjs ja obd-parameters.mjs julkaisuun. Julkaise Worker ennen etusivun OBD-ohjaimia. Uusia ulkoisia API-avaimia ei tarvita.

`/obd/create` vaatii voimassa olevan aktivointikoodin, käyttää AccessGate-jonotusta ja enintään 30 luontia/24h per koodi, 30s välein. Muut reitit `/obd/pair`, `/obd/upload`, `/obd/read`, `/obd/close`, `/obd/disconnect` tarvitsevat kertakoodin tai istuntokohtaisen 256-bittisen roolitunnisteen. Luontikoodi on 60 satunnaisbittiä, DO-nimi SHA256 koodista. Tunnisteet vain POST-rungossa, ei queryssä, lokissa tai localStoragessa. Pariin liittäminen on atominen ja kertakäyttöinen. Selaimen tunniste lukee/sulkee; sovelluksen tunniste lähettää/katkaisee, ei lue. Sulkemisen jälkeen myöhäinen paketti ei voi elvyttää mittauksia.

Säilytetään vain viimeinen paketti, enintään 84 omaan standardirekisteriin kuuluvaa arvoa; pyyntöraja 32KiB ja lähetysraja 5s. Nimillä/yksiköillä on palvelimen rekisteri. Asiakkaan näytteet ovat epäluotettavaa dataa, eivät palvelimen todentama fyysinen autoyhteys tai hyväksymisrajoja. Auto on käyttäjän vahvistama. Ei OEM-yksikköskannauksia, komentoja, vikakoodien poistoa tai koodausta tämän rajapinnan kautta. Ei Car Scannerin tietokantaa.

## Tarkistus oikeassa autossa

Auto turvallisesti paikallaan. Yhdistä koe-APK omalla adapterilla ja vahvista tarkistustulos sekä muutama lukema. Koodilla liittäminen, oikean auton vahvistus ja seuraava kysymys testataan samalla puhelimella sovelluksen sisäisessä keskustelussa. Kokeile myös Bluetooth-katkos, internet-katkos ja lopetus: vanhoja lukemia ei saa merkitä tuoreiksi. Mittauslähetys ei saa vähentää AI-vaiheita. Vain viestipyyntö käyttää normaalia käyttömäärää. Fyysinen koe on vielä tekemättä; Node/Java-testit sekä Android-käännös eivät korvaa sitä.
