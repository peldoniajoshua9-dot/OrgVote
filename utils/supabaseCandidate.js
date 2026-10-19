import { supabase } from './supabaseClient';

async function getCandidates() {
  const { data, error } = await supabase
    .from('candidates')
    .select('*');

  if (error) {
    console.error('Error fetching candidates:', error);
    return [];
  }

  return data;
}