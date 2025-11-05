import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from './supabase/info';

const supabase = createClient(
  `https://${projectId}.supabase.co`,
  publicAnonKey
);

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  
  if (error) throw error;
  
  if (data.session) {
    localStorage.setItem('access_token', data.session.access_token);
  }
  
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
  localStorage.removeItem('access_token');
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  
  if (error) throw error;
  
  if (data.session) {
    localStorage.setItem('access_token', data.session.access_token);
  }
  
  return data.session;
}

export { supabase };
