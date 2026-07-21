// Import-Script fuer bestehende Witze aus einer CSV-Datei.
//
// Erwartetes CSV-Format (Header-Zeile erforderlich), Spalten flexibel benennbar
// -- unten unter COLUMN MAPPING anpassen falls deine Spaltennamen abweichen:
//
//   text,kategorie,bewertung
//   "Warum ...", "Arbeit", 7.5
//
// Ausfuehren mit:  npm run import-jokes -- pfad/zu/deiner-datei.csv

import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import fs from 'fs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Secret Key noetig fuer Bulk-Import, NUR lokal verwenden

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Fehlt: NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY als Umgebungsvariablen setzen.');
  console.error('Den Secret Key NIE ins Repo committen - nur temporaer lokal exportieren.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---- COLUMN MAPPING: hier anpassen an deine tatsaechlichen Spaltennamen ----
const COL_TEXT = 'text';
const COL_CATEGORY = 'kategorie';
const COL_RATING = 'bewertung';
// -----------------------------------------------------------------------------

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Nutzung: npm run import-jokes -- pfad/zu/datei.csv');
    process.exit(1);
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const records: Record<string, string>[] = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`${records.length} Zeilen gefunden.`);

  // Kategorien-Cache aufbauen
  const { data: existingCats } = await supabase.from('categories').select('id, name, slug');
  const catMap = new Map<string, string>();
  (existingCats || []).forEach((c) => catMap.set(c.name.toLowerCase(), c.id));

  async function getCategoryId(name: string): Promise<string> {
    const key = name.trim().toLowerCase();
    if (catMap.has(key)) return catMap.get(key)!;
    const slug = key.replace(/[^a-z0-9]+/g, '-');
    const { data, error } = await supabase
      .from('categories')
      .insert({ name: name.trim(), slug })
      .select('id')
      .single();
    if (error) throw error;
    catMap.set(key, data.id);
    return data.id;
  }

  let imported = 0;
  let failed = 0;

  for (const row of records) {
    const text = row[COL_TEXT];
    const category = row[COL_CATEGORY] || 'Sonstige';
    const rating = parseFloat(row[COL_RATING] || '0');

    if (!text) {
      failed++;
      continue;
    }

    try {
      const categoryId = await getCategoryId(category);
      const { error } = await supabase.from('jokes').insert({
        content: text,
        category_id: categoryId,
        author_id: null,
        status: 'approved',
        avg_rating: isNaN(rating) ? 0 : rating,
        total_ratings: isNaN(rating) || rating === 0 ? 0 : 1,
      });
      if (error) throw error;
      imported++;
      if (imported % 50 === 0) console.log(`${imported} importiert...`);
    } catch (e) {
      console.error('Fehler bei Zeile:', text.slice(0, 40), e);
      failed++;
    }
  }

  console.log(`Fertig. Importiert: ${imported}, Fehlgeschlagen: ${failed}`);
}

main();
