'use client';

import { useEffect, useState } from 'react';
import { supabase, Joke, Category, getVisitorId, getNickname, setNickname } from '@/lib/supabase';

type Tab = 'list' | 'new' | 'leader';

export default function Home() {
  const [tab, setTab] = useState<Tab>('list');
  const [jokes, setJokes] = useState<Joke[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [nickname, setNick] = useState('');
  const [filterCat, setFilterCat] = useState('Alle');
  const [sort, setSort] = useState<'new' | 'top'>('new');
  const [leaderboard, setLeaderboard] = useState<{ username: string; credits: number }[]>([]);

  useEffect(() => {
    setNick(getNickname());
    loadCategories();
    loadJokes();
  }, []);

  async function loadCategories() {
    const { data } = await supabase.from('categories').select('*').order('name');
    if (data) setCategories(data);
  }

  async function loadJokes() {
    setLoading(true);
    const { data } = await supabase
      .from('jokes')
      .select('*, categories(name, slug)')
      .neq('status', 'duplicate_deactivated')
      .neq('status', 'flagged')
      .order('created_at', { ascending: false });
    if (data) setJokes(data as unknown as Joke[]);
    setLoading(false);
  }

  async function loadLeaderboard() {
    const { data } = await supabase
      .from('profiles')
      .select('username, credits')
      .order('credits', { ascending: false })
      .limit(20);
    if (data) setLeaderboard(data as any);
  }

  function handleNickChange(v: string) {
    setNick(v);
    setNickname(v);
  }

  function ensureNick(): boolean {
    if (!nickname.trim()) {
      alert('Bitte zuerst oben rechts einen Namen eingeben.');
      return false;
    }
    return true;
  }

  async function submitJoke(text: string, categoryId: string) {
    if (!ensureNick()) return;
    if (!text.trim()) {
      alert('Witz ist leer.');
      return;
    }
    if (!categoryId) {
      alert('Bitte kurz warten bis die Kategorien geladen sind, dann nochmal versuchen.');
      return;
    }

    // Anonymes Profil sicherstellen (kein Auth-Login im MVP, nickname-basiert)
    const visitorId = getVisitorId();
    let { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', nickname)
      .maybeSingle();

    let authorId = profile?.id;
    if (!authorId) {
      const { data: newProfile } = await supabase
        .from('profiles')
        .insert({ id: crypto.randomUUID(), username: nickname })
        .select('id')
        .single();
      authorId = newProfile?.id;
    }

    const { error } = await supabase.from('jokes').insert({
      content: text.trim(),
      category_id: categoryId,
      author_id: authorId,
    });

    if (error) {
      alert('Fehler beim Einreichen: ' + error.message);
      return;
    }

    await loadJokes();
    setTab('list');
  }

  async function rateJoke(jokeId: string, score: number) {
    if (!ensureNick()) return;
    const visitorId = getVisitorId();
    const { error } = await supabase
      .from('ratings')
      .upsert(
        { joke_id: jokeId, user_id_or_ip: visitorId, score },
        { onConflict: 'joke_id,user_id_or_ip' }
      );
    if (error) {
      alert('Fehler: ' + error.message);
      return;
    }
    await loadJokes();
  }

  async function reportJoke(jokeId: string) {
    if (!ensureNick()) return;
    const visitorId = getVisitorId();
    const { error } = await supabase.from('reports').insert({
      joke_id: jokeId,
      reporter_id_or_ip: visitorId,
      reason: 'under_the_belt',
    });
    if (error) {
      if (error.code === '23505') alert('Bereits gemeldet.');
      else alert('Fehler: ' + error.message);
      return;
    }
    await loadJokes();
  }

  async function reportDuplicate(jokeId: string) {
    if (!ensureNick()) return;
    const others = jokes.filter((j) => j.id !== jokeId);
    if (!others.length) {
      alert('Kein anderer Witz vorhanden.');
      return;
    }
    const list = others.map((j, i) => `${i + 1}: ${j.content.slice(0, 60)}`).join('\n');
    const pick = prompt('Nummer des Original-Witzes eingeben:\n\n' + list);
    const idx = parseInt(pick || '', 10) - 1;
    if (isNaN(idx) || !others[idx]) return;
    const original = others[idx];

    const visitorId = getVisitorId();
    const { error } = await supabase.from('reports').insert({
      joke_id: jokeId,
      reporter_id_or_ip: visitorId,
      reason: 'duplicate',
      suggested_original_id: original.id,
    });
    if (error) {
      if (error.code === '23505') alert('Bereits gemeldet.');
      else alert('Fehler: ' + error.message);
      return;
    }
    await loadJokes();
  }

  async function suggestOptimization(jokeId: string, current: string) {
    if (!ensureNick()) return;
    const text = prompt('Verbesserte Version vorschlagen:', current);
    if (!text || !text.trim() || text.trim() === current) return;

    let { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', nickname)
      .maybeSingle();
    let proposerId = profile?.id;
    if (!proposerId) {
      const { data: newProfile } = await supabase
        .from('profiles')
        .insert({ id: crypto.randomUUID(), username: nickname })
        .select('id')
        .single();
      proposerId = newProfile?.id;
    }

    await supabase.from('joke_optimizations').insert({
      joke_id: jokeId,
      proposer_id: proposerId,
      suggested_text: text.trim(),
    });
    alert('Vorschlag eingereicht.');
  }

  async function shareJoke(joke: Joke) {
    const url = `${window.location.origin}/?joke=${joke.id}`;
    const text = `${joke.content}\n\nMehr Witze: ${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch (e) {
        // Nutzer hat Teilen abgebrochen
      }
    } else {
      await navigator.clipboard.writeText(text);
      alert('In Zwischenablage kopiert.');
    }
  }

  let visibleJokes = filterCat === 'Alle'
    ? jokes
    : jokes.filter((j) => j.categories?.name === filterCat);

  visibleJokes = [...visibleJokes].sort((a, b) =>
    sort === 'new'
      ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      : b.avg_rating - a.avg_rating
  );

  return (
    <main className="max-w-2xl mx-auto px-5 py-6 pb-20">
      <div className="flex justify-between items-baseline border-b-4 border-ink pb-3 mb-5">
        <h1 className="text-3xl font-black uppercase tracking-tight">
          Witz<span className="text-accent">Board</span>
        </h1>
        <div className="text-right text-xs text-gray-500">
          <div>Angemeldet als</div>
          <input
            type="text"
            value={nickname}
            onChange={(e) => handleNickChange(e.target.value)}
            placeholder="Dein Name"
            className="border border-ink bg-transparent px-1.5 py-0.5 text-xs w-28 text-right"
          />
        </div>
      </div>

      <div className="flex border border-ink mb-5">
        {(['list', 'new', 'leader'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              if (t === 'leader') loadLeaderboard();
            }}
            className={`flex-1 text-center py-2 text-xs font-bold uppercase tracking-wide border-r border-ink last:border-r-0 ${
              tab === t ? 'bg-ink text-paper' : ''
            }`}
          >
            {t === 'list' ? 'Alle Witze' : t === 'new' ? 'Neuer Witz' : 'Bestenliste'}
          </button>
        ))}
      </div>

      {tab === 'list' && (
        <>
          <div className="flex gap-2 mb-4 flex-wrap">
            <select
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
              className="border border-ink bg-white px-2 py-1.5 text-xs"
            >
              <option value="Alle">Alle Kategorien</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as 'new' | 'top')}
              className="border border-ink bg-white px-2 py-1.5 text-xs"
            >
              <option value="new">Neueste</option>
              <option value="top">Beste Bewertung</option>
            </select>
          </div>

          {loading ? (
            <div className="text-center text-gray-500 text-sm py-10">Lade...</div>
          ) : visibleJokes.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-10">
              Noch keine Witze. Sei der Erste.
            </div>
          ) : (
            visibleJokes.map((j) => (
              <JokeCard
                key={j.id}
                joke={j}
                onRate={rateJoke}
                onReport={reportJoke}
                onReportDuplicate={reportDuplicate}
                onOptimize={suggestOptimization}
                onShare={shareJoke}
              />
            ))
          )}
        </>
      )}

      {tab === 'new' && (
        <NewJokeForm categories={categories} onSubmit={submitJoke} />
      )}

      {tab === 'leader' && (
        <div className="border border-ink bg-white p-4">
          {leaderboard.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-6">Noch keine Einträge.</div>
          ) : (
            leaderboard.map((r, i) => (
              <div
                key={r.username}
                className="flex justify-between border-b border-ink py-2.5 text-sm"
              >
                <span>
                  <span className="font-black text-accent w-6 inline-block">#{i + 1}</span>
                  {r.username}
                </span>
                <span>{r.credits} Credits</span>
              </div>
            ))
          )}
        </div>
      )}
    </main>
  );
}

function JokeCard({
  joke,
  onRate,
  onReport,
  onReportDuplicate,
  onOptimize,
  onShare,
}: {
  joke: Joke;
  onRate: (id: string, score: number) => void;
  onReport: (id: string) => void;
  onReportDuplicate: (id: string) => void;
  onOptimize: (id: string, current: string) => void;
  onShare: (joke: Joke) => void;
}) {
  return (
    <div className="border border-ink bg-white p-4 mb-3.5">
      <div className="flex justify-between text-[10px] uppercase tracking-wide text-gray-500 mb-2">
        <span className="border border-ink px-1.5 py-0.5 font-bold">
          {joke.categories?.name || 'Sonstige'}
        </span>
      </div>
      <div className="text-base font-medium leading-snug mb-2.5">{joke.content}</div>
      <div className="flex justify-between items-center flex-wrap gap-2 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <span className="font-black text-sm text-ink">
            {joke.total_ratings > 0 ? `${joke.avg_rating.toFixed(1)}/10` : '—'}
          </span>
          <select
            onChange={(e) => e.target.value && onRate(joke.id, Number(e.target.value))}
            className="border border-ink bg-transparent text-xs px-1"
            defaultValue=""
          >
            <option value="">Bewerten</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-3 mt-2.5 flex-wrap text-[11px] uppercase tracking-wide">
        <button onClick={() => onShare(joke)} className="underline text-gray-500">
          Teilen
        </button>
        <button
          onClick={() => onOptimize(joke.id, joke.content)}
          className="underline text-gray-500"
        >
          Optimieren
        </button>
        <button
          onClick={() => onReportDuplicate(joke.id)}
          className="underline text-gray-500"
        >
          Duplikat melden
        </button>
        <button onClick={() => onReport(joke.id)} className="underline text-accent">
          Melden
        </button>
      </div>
    </div>
  );
}

function NewJokeForm({
  categories,
  onSubmit,
}: {
  categories: Category[];
  onSubmit: (text: string, categoryId: string) => void;
}) {
  const [text, setText] = useState('');
  const [catId, setCatId] = useState('');

  useEffect(() => {
    if (categories.length && !catId) setCatId(categories[0].id);
  }, [categories, catId]);

  return (
    <div className="border border-ink bg-white p-4">
      <label className="block text-[11px] uppercase tracking-wide text-gray-500 mt-1 mb-1">
        Witz
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Dein Witz..."
        className="w-full border border-ink p-2 text-sm bg-paper min-h-[80px]"
      />
      <label className="block text-[11px] uppercase tracking-wide text-gray-500 mt-3 mb-1">
        Kategorie
      </label>
      <select
        value={catId}
        onChange={(e) => setCatId(e.target.value)}
        className="w-full border border-ink p-2 text-sm bg-paper"
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <div className="border border-accent bg-accentdim p-2.5 text-xs mt-3">
        Einreichen bringt dir 1 Credit. Wird der Witz als Duplikat bestätigt, verlierst du den
        Credit wieder.
      </div>
      <button
        onClick={() => {
          onSubmit(text, catId);
          setText('');
        }}
        className="mt-4 bg-ink text-paper px-4.5 py-2.5 text-xs font-bold uppercase tracking-wide"
      >
        Einreichen
      </button>
    </div>
  );
}
