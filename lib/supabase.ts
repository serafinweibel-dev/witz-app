import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Joke = {
  id: string;
  content: string;
  category_id: string | null;
  author_id: string | null;
  status: 'approved' | 'pending' | 'flagged' | 'duplicate_deactivated';
  original_joke_id: string | null;
  avg_rating: number;
  total_ratings: number;
  created_at: string;
  categories?: { name: string; slug: string } | null;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
};

// Anonymes Nutzer-Kennzeichen (lokal, kein Login noetig fuer MVP)
export function getVisitorId(): string {
  if (typeof window === 'undefined') return 'server';
  let id = localStorage.getItem('visitor_id');
  if (!id) {
    id = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('visitor_id', id);
  }
  return id;
}

export function getNickname(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('nickname') || '';
}

export function setNickname(name: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('nickname', name);
}
