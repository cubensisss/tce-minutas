import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: root } = await supabase.storage.from('documentos').list();
  console.log('ROOT ITEMS:', root.length);

  const { data: folder } = await supabase.storage.from('documentos').list('0097c08e-479b-442b-aa30-d1a0d3c1a3a4');
  console.log('FOLDER 0097c08e-479b-442b-aa30-d1a0d3c1a3a4:', folder);
}
check();
