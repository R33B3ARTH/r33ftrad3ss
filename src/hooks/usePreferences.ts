import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { UserPreferences } from '@/lib/types';

const DEFAULT_PREFERENCES: UserPreferences = {
  default_asset: 'ES',
  es_target_points: 20,
  nq_target_points: 100,
  confluence_threshold: 80,
  price_source: 'live',
  es_manual_price: null,
  nq_manual_price: null,
};

function normalizeRow(data: Record<string, unknown>): UserPreferences {
  return {
    default_asset: data.default_asset as UserPreferences['default_asset'],
    es_target_points: Number(data.es_target_points),
    nq_target_points: Number(data.nq_target_points),
    confluence_threshold: Number(data.confluence_threshold),
    price_source: (data.price_source as 'live' | 'manual') ?? 'live',
    es_manual_price: data.es_manual_price !== null ? Number(data.es_manual_price) : null,
    nq_manual_price: data.nq_manual_price !== null ? Number(data.nq_manual_price) : null,
  };
}

export function usePreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        const { data: inserted } = await supabase
          .from('user_preferences')
          .insert({})
          .select()
          .maybeSingle();

        if (inserted) {
          setPreferences(normalizeRow(inserted));
        }
      } else {
        setPreferences(normalizeRow(data));
      }
      setLoading(false);
    })();
  }, []);

  const updatePreferences = useCallback(async (prefs: Partial<UserPreferences>) => {
    const { data } = await supabase
      .from('user_preferences')
      .update({
        ...prefs,
        updated_at: new Date().toISOString(),
      })
      .order('updated_at', { ascending: false })
      .limit(1)
      .select()
      .maybeSingle();

    if (data) {
      setPreferences(normalizeRow(data));
    }
  }, []);

  return { preferences, loading, updatePreferences };
}
