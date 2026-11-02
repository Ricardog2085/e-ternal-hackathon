import { supabase } from './supabase';

export interface Recipient {
  id: string;
  name: string;
  relation: string | null;
  phone: string | null;
}

export async function fetchRecipients(
  userId: string
): Promise<{ recipients: Recipient[]; schemaReady: boolean }> {
  try {
    const { data, error } = await supabase
      .from('recipients')
      .select('id, name, relation, phone')
      .eq('user_id', userId)
      .order('name');
    if (error) {
      if (/relation|does not exist|schema/i.test(error.message || '')) {
        console.warn('Tabla recipients ausente (aplica supabase/vault-delivery-setup.sql).');
        return { recipients: [], schemaReady: false };
      }
      console.error('Error al consultar destinatarios:', error);
      return { recipients: [], schemaReady: true };
    }
    return { recipients: ((data || []) as unknown) as Recipient[], schemaReady: true };
  } catch (err) {
    console.error('Error de conexión (destinatarios):', err);
    return { recipients: [], schemaReady: true };
  }
}
