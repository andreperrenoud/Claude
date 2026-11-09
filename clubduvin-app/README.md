# Le Club du Vin · Bouiboui.vin – Mitglieder-App

*traffiquant d'amour.* Eine kleine Web-App (installierbar aufs Handy als PWA) für die Mitglieder des Club du Vin.

## Funktionen

- **Mitglieder-Login** mit E-Mail und Passwort (Sitzung 30 Tage, Passwörter sicher mit scrypt gespeichert)
- **Angebote**: Titel, Text, Preis, „gültig bis“, Bild und Link direkt zum Produkt im Shop
- **News** aus dem Club (Degustationen, neue Lieferungen …)
- **Verwaltung** (nur Admins): Beiträge erstellen, bearbeiten, anheften, löschen; Mitglieder hinzufügen,
  sperren und neue Passwörter erzeugen
- Neue Mitglieder erhalten ein Startpasswort und müssen beim ersten Login ein eigenes wählen
- Aufs Handy installierbar („Zum Home-Bildschirm hinzufügen“), funktioniert ohne App Store

## Starten

Voraussetzung: Node.js 22.5 oder neuer. Keine weiteren Pakete nötig.

```bash
cd clubduvin-app
ADMIN_EMAIL=mail@bouiboui.vin ADMIN_PASSWORD='ein-sicheres-passwort' npm start
# → http://localhost:3000
```

Ohne `ADMIN_PASSWORD` wird beim ersten Start ein zufälliges Passwort erzeugt und in der Konsole angezeigt.

| Variable | Zweck | Standard |
|---|---|---|
| `PORT` | Port des Servers | `3000` |
| `DB_FILE` | Pfad zur SQLite-Datenbank | `data/club.db` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | erstes Admin-Konto (nur beim ersten Start) | `mail@bouiboui.vin` / zufällig |
| `NODE_ENV=production` | setzt das Cookie nur über HTTPS | – |

Tests: `npm test`

## Online stellen

Die App braucht einen kleinen Server mit dauerhaftem Speicher (für die Datenbank-Datei), z. B. Render, Railway,
Fly.io oder ein Schweizer Hoster wie Infomaniak. Unter einer Subdomain wie `club.bouiboui.vin` mit HTTPS betreiben
und `NODE_ENV=production` setzen. Die Datei `data/club.db` regelmässig sichern.

Auf der Shopify-Seite `/pages/club-du-vin` kann dann ein Button „Zum Mitgliederbereich“ auf die App verlinken.

## Mögliche nächste Schritte

- Login mit dem bestehenden Shopify-Kundenkonto statt eigener Passwörter (Mitglieder z. B. per Kunden-Tag `club`)
- Bilder direkt hochladen statt per URL
- Push-Benachrichtigung oder E-Mail bei neuen Angeboten
