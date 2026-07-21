# WitzBoard

## Was fertig ist
- Next.js-App mit Supabase-Anbindung (Schema bereits eingespielt)
- Alle Kernfeatures: Einreichen, Bewerten (1-10), Melden, Duplikat-Melden, Optimierungsvorschlaege, Kategorien, Teilen, Bestenliste
- PWA-faehig (installierbar auf Home-Bildschirm, iOS + Android)
- Kein ABaum-Branding

## Lokal testen

```bash
npm install
npm run dev
```
Dann `http://localhost:3000` oeffnen.

## Live schalten (Vercel, kostenlos)

1. Auf github.com ein neues Repository erstellen, diesen Ordner hochladen
   (oder: `npx vercel` direkt aus diesem Ordner ausfuehren, ohne GitHub)
2. Auf vercel.com mit GitHub einloggen, Repository importieren
3. Bei "Environment Variables" die beiden Werte aus `.env.local` eintragen
4. Deploy klicken

Nach 1-2 Minuten ist die App unter einer `*.vercel.app`-URL live.
Diesen Link kannst du direkt teilen. Auf dem Handy: Link oeffnen ->
Browser-Menue -> "Zum Home-Bildschirm hinzufuegen" -> App-Icon erscheint.

## Deine 750 Witze importieren

1. Deine Witze als CSV exportieren (Excel: "Speichern unter" -> CSV)
   mit Spalten fuer Text, Kategorie, Bewertung
2. In `scripts/import-jokes.ts` ganz oben unter COLUMN MAPPING die
   Spaltennamen an deine CSV anpassen, falls sie anders heissen
3. Den Secret Key (aus Supabase: Project Settings -> API Keys -> Secret keys)
   temporaer als Umgebungsvariable setzen -- NIEMALS committen:
   ```bash
   export SUPABASE_SERVICE_ROLE_KEY="dein_secret_key"
   npm run import-jokes -- pfad/zu/deine-witze.csv
   ```

## Naechster Schritt: Store-Submission
Sobald die PWA getestet ist: Capacitor-Wrapper fuer native
iOS/Android-Builds. Separater Schritt, brauche dann deine
Apple Developer + Google Play Console Zugaenge (nur zum
Hochladen, Code bleibt derselbe).
