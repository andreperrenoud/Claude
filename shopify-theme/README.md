# Club du Vin – Mitgliederbereich im Shopify-Theme

Dateien für das Theme „Lively“ von bouiboui.vin.

- `sections/club-members.liquid` – Abschnitt „Club du Vin – Mitglieder“
- `templates/page.club-du-vin.json` – Club-Seite mit dem Abschnitt direkt unter dem Seitentext

## So funktioniert es

| Besucher | sieht |
|---|---|
| nicht eingeloggt | Formular „Mitglied werden“ (Vorname, E-Mail, Einwilligung) + Link „Schon Mitglied? Hier anmelden“ |
| eingeloggt, ohne Tag `club` | Ein-Klick-Knopf „Jetzt Mitglied werden“ |
| eingeloggt mit Tag `club` | Angebote (Kollektion `club-du-vin-angebote`) und News (Blog `bouiboui-news`, Tag `club`) |

## Ein Angebot erstellen (pro Wein eigener Rabatt)

1. Produkt zur Kollektion **„Club du Vin – Angebote“** hinzufügen.
2. Im Produkt das Feld **„Clubrabatt (%)“** ausfüllen → Clubpreis wird auf der Seite angezeigt.
3. **Rabatte → Rabatt erstellen → „Betrag von Produkten“ → Automatischer Rabatt**,
   gleicher Prozentsatz, nur dieses Produkt, Berechtigung: Kundensegment **„Club du Vin“**.
   → Der Rabatt wird im Warenkorb nur bei Mitgliedern abgezogen.

## News veröffentlichen

Blogbeitrag in „Bouiboui.news“ schreiben und das Tag `club` setzen.

## Selbstanmeldung

Das Formular „Mitglied werden“ legt den Kunden in Shopify an (bzw. ergänzt ein bestehendes Konto)
und setzt die Tags `newsletter` und `club`. Danach meldet man sich mit der E-Mail an
(Shopify schickt einen Code, kein Passwort).

Im Theme-Editor lässt sich „Selbstanmeldung schaltet sofort frei“ ausschalten. Dann erhalten neue
Anmeldungen das Tag `club-anfrage`, und Sie schalten sie frei, indem Sie das Tag `club` setzen.

## Mitglied von Hand freischalten

Kunden → Kunde öffnen → Tag `club` hinzufügen.
