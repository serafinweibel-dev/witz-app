'use client';

import { useEffect, useState } from 'react';
import { supabase, Joke, Category, getVisitorId, getNickname, setNickname } from '@/lib/supabase';

type Tab = 'list' | 'new' | 'leader' | 'changes';
type RatingRow = { joke_id: string; user_id_or_ip: string; score: number };
type OptimizationRow = {
  id: string;
  joke_id: string;
  suggested_text: string;
  status: string;
  votes: number;
  created_at: string;
};

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export default function Home() {
  const [tab, setTab] = useState<Tab>('list');
  const [jokes, setJokes] = useState<Joke[]>([]);
  const [allRatings, setAllRatings] = useState<RatingRow[]>([]);
  const [allOptimizations, setAllOptimizations] = useState<OptimizationRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [nickname, setNick] = useState('');
  const [filterCat, setFilterCat] = useState('Alle');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'new' | 'top' | 'random'>('random');
  const [excludeOwn, setExcludeOwn] = useState(false);
  const [randomSeed, setRandomSeed] = useState(() => Math.random());
  const [leaderboard, setLeaderboard] = useState<{ username: string; credits: number }[]>([]);

  useEffect(() => {
    setNick(getNickname());
    loadCategories();
    loadJokes();
    loadAllRatings();
    loadAllOptimizations();
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

  async function loadAllRatings() {
    const { data } = await supabase.from('ratings').select('joke_id, user_id_or_ip, score');
    if (data) setAllRatings(data as RatingRow[]);
  }

  async function loadAllOptimizations() {
    const { data } = await supabase
      .from('joke_optimizations')
      .select('id, joke_id, suggested_text, status, created_at')
      .order('created_at', { ascending: false });
    if (!data) return;
    const { data: votes } = await supabase.from('optimization_votes').select('optimization_id');
    const voteCounts: Record<string, number> = {};
    (votes || []).forEach((v: any) => {
      voteCounts[v.optimization_id] = (voteCounts[v.optimization_id] || 0) + 1;
    });
    setAllOptimizations(
      (data as any[]).map((o) => ({ ...o, votes: voteCounts[o.id] || 0 }))
    );
  }

  // Eigene Bewertungen = dieses Geraet ODER die urspruenglichen Excel-Bewertungen
  const OWN_MARKER = 'excel_import_serafin';

  // Durchschnitt und Anzahl fuer einen Witz berechnen - je nachdem ob eigene
  // Bewertungen (dieses Geraet + Excel-Import) ausgeschlossen werden sollen
  function computeRating(jokeId: string): { avg: number; count: number } {
    const myId = getVisitorId();
    const relevant = allRatings.filter(
      (r) =>
        r.joke_id === jokeId &&
        (!excludeOwn || (r.user_id_or_ip !== myId && r.user_id_or_ip !== OWN_MARKER))
    );
    if (!relevant.length) return { avg: 0, count: 0 };
    const sum = relevant.reduce((a, r) => a + r.score, 0);
    return { avg: sum / relevant.length, count: relevant.length };
  }

  // Eigene bereits abgegebene Bewertung fuer einen Witz finden (fuer Hervorhebung)
  function getMyRating(jokeId: string): number | null {
    const myId = getVisitorId();
    const mine = allRatings.find((r) => r.joke_id === jokeId && r.user_id_or_ip === myId);
    return mine ? mine.score : null;
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
    await loadAllRatings();
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
    await loadAllOptimizations();
    alert('Vorschlag eingereicht.');
  }

  async function voteOptimization(optimizationId: string) {
    if (!ensureNick()) return;
    const visitorId = getVisitorId();
    const { error } = await supabase.from('optimization_votes').insert({
      optimization_id: optimizationId,
      voter_id_or_ip: visitorId,
    });
    if (error) {
      if (error.code === '23505') alert('Du hast bereits dafuer gestimmt.');
      else alert('Fehler: ' + error.message);
      return;
    }
    await loadAllOptimizations();
  }

  async function applyOptimization(jokeId: string, optimizationId: string, newText: string) {
    if (!confirm('Diesen Witz-Text durch den Vorschlag ersetzen?')) return;
    await supabase.from('jokes').update({ content: newText }).eq('id', jokeId);
    await supabase
      .from('joke_optimizations')
      .update({ status: 'accepted' })
      .eq('id', optimizationId);
    await loadJokes();
    await loadAllOptimizations();
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

  if (search.trim()) {
    const q = search.trim().toLowerCase();
    visibleJokes = visibleJokes.filter((j) => j.content.toLowerCase().includes(q));
  }

  if (sort === 'new') {
    visibleJokes = [...visibleJokes].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  } else if (sort === 'top') {
    visibleJokes = [...visibleJokes].sort(
      (a, b) => computeRating(b.id).avg - computeRating(a.id).avg
    );
  } else if (sort === 'random') {
    // Seed sorgt dafuer, dass "Neu mischen" eine andere Reihenfolge ergibt,
    // aber innerhalb eines Ladevorgangs stabil bleibt
    visibleJokes = [...visibleJokes].sort((a, b) => {
      const ha = hashCode(a.id + randomSeed);
      const hb = hashCode(b.id + randomSeed);
      return ha - hb;
    });
  }

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
        {(['list', 'new', 'leader', 'changes'] as Tab[]).map((t) => (
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
            {t === 'list'
              ? 'Alle Witze'
              : t === 'new'
              ? 'Neuer Witz'
              : t === 'leader'
              ? 'Bestenliste'
              : 'Änderungen'}
          </button>
        ))}
      </div>

      {tab === 'list' && (
        <>
          <div className="flex gap-2 mb-4 flex-wrap items-center">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Witze durchsuchen..."
              className="border border-ink bg-white px-2 py-1.5 text-xs flex-1 min-w-[160px]"
            />
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
              onChange={(e) => setSort(e.target.value as 'new' | 'top' | 'random')}
              className="border border-ink bg-white px-2 py-1.5 text-xs"
            >
              <option value="top">Beste Bewertung</option>
              <option value="new">Neueste</option>
              <option value="random">Zufällig</option>
            </select>
            {sort === 'random' && (
              <button
                onClick={() => setRandomSeed(Math.random())}
                className="border border-ink bg-white px-2 py-1.5 text-xs"
              >
                Neu mischen
              </button>
            )}
            <label className="flex items-center gap-1.5 text-xs text-gray-600 ml-1">
              <input
                type="checkbox"
                checked={excludeOwn}
                onChange={(e) => setExcludeOwn(e.target.checked)}
              />
              Eigene Bewertungen ausschliessen
            </label>
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
                rating={computeRating(j.id)}
                myRating={getMyRating(j.id)}
                optimizations={allOptimizations.filter(
                  (o) => o.joke_id === j.id && o.status === 'pending'
                )}
                onRate={rateJoke}
                onReport={reportJoke}
                onReportDuplicate={reportDuplicate}
                onOptimize={suggestOptimization}
                onVoteOptimization={voteOptimization}
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

      {tab === 'changes' && (
        <div>
          {allOptimizations.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-10">
              Noch keine Vorschläge eingereicht.
            </div>
          ) : (
            allOptimizations.map((o) => {
              const relatedJoke = jokes.find((j) => j.id === o.joke_id);
              return (
                <div key={o.id} className="border border-ink bg-white p-4 mb-3.5">
                  <div className="flex justify-between items-center mb-2">
                    <span
                      className={`text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 border ${
                        o.status === 'accepted'
                          ? 'border-accent text-accent'
                          : 'border-ink text-gray-500'
                      }`}
                    >
                      {o.status === 'accepted' ? 'Übernommen' : `${o.votes}/10 Stimmen`}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {new Date(o.created_at).toLocaleDateString('de-CH')}
                    </span>
                  </div>
                  {relatedJoke && (
                    <div className="text-xs text-gray-500 mb-1.5">
                      {o.status === 'accepted' ? 'Witz (jetzt aktuell)' : 'Aktueller Witz'}:{' '}
                      {o.status === 'accepted' ? (
                        relatedJoke.content
                      ) : (
                        <span className="line-through">{relatedJoke.content}</span>
                      )}
                    </div>
                  )}
                  <div className="text-sm font-medium">Vorschlag: {o.suggested_text}</div>
                </div>
              );
            })
          )}
        </div>
      )}
    </main>
  );
}

function JokeCard({
  joke,
  rating,
  myRating,
  optimizations,
  onRate,
  onReport,
  onReportDuplicate,
  onOptimize,
  onVoteOptimization,
  onShare,
}: {
  joke: Joke;
  rating: { avg: number; count: number };
  myRating: number | null;
  optimizations: OptimizationRow[];
  onRate: (id: string, score: number) => void;
  onReport: (id: string) => void;
  onReportDuplicate: (id: string) => void;
  onOptimize: (id: string, current: string) => void;
  onVoteOptimization: (optimizationId: string) => void;
  onShare: (joke: Joke) => void;
}) {
  const sortedOptimizations = [...optimizations].sort((a, b) => b.votes - a.votes);

  return (
    <div className="border border-ink bg-white p-4 mb-3.5">
      <div className="flex justify-between text-[10px] uppercase tracking-wide text-gray-500 mb-2">
        <span className="border border-ink px-1.5 py-0.5 font-bold">
          {joke.categories?.name || 'Sonstige'}
        </span>
      </div>
      <div className="text-base font-medium leading-snug mb-2.5">{joke.content}</div>
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
        <span className="font-black text-sm text-ink">
          {rating.count > 0 ? `${rating.avg.toFixed(1)}/10` : '—'}
        </span>
        <span className="text-gray-400">({rating.count})</span>
      </div>
      <div className="flex gap-1 flex-wrap mb-2.5">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <button
            key={n}
            onClick={() => onRate(joke.id, n)}
            className={`w-7 h-7 text-xs font-bold border border-ink ${
              myRating === n ? 'bg-ink text-paper' : 'bg-white text-ink hover:bg-gray-100'
            }`}
          >
            {n}
          </button>
        ))}
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
      {sortedOptimizations.length > 0 && (
        <div className="border-t border-dashed border-gray-400 mt-2.5 pt-2.5">
          {sortedOptimizations.slice(0, 3).map((o) => (
            <div key={o.id} className="flex justify-between items-center gap-2 text-xs mb-1.5">
              <span className="flex-1">
                "{o.suggested_text}" — {o.votes}/10 Stimmen
              </span>
              <button
                onClick={() => onVoteOptimization(o.id)}
                className="border border-ink px-1.5 py-0.5 text-[10px] uppercase"
              >
                +1
              </button>
            </div>
          ))}
        </div>
      )}
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
