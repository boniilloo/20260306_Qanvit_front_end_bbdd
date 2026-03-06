#!/usr/bin/env node

/**
 * Script para generar seed.sql con 100 empresas aleatorias, sus productos, company_revision y vectores
 * desde la base de datos remota de Supabase
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Obtener __dirname en ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Obtener variables de entorno
// Intentar cargar .env.local y .env si existen (sin dotenv, usando fs)
try {
  const envLocalPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envLocalPath)) {
    const envContent = fs.readFileSync(envLocalPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (e) {
  // Ignorar errores al leer .env.local
}

// Intentar obtener variables de entorno (Vite usa VITE_ prefix)
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fukzxedgbszcpakqkrjf.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: Se necesita SUPABASE_SERVICE_ROLE_KEY o SUPABASE_SERVICE_KEY');
  console.error('');
  console.error('Opciones para obtenerla:');
  console.error('1. Añadirla a .env.local:');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=tu_clave_aqui');
  console.error('');
  console.error('2. Obtenerla desde el dashboard:');
  console.error('   https://supabase.com/dashboard/project/fukzxedgbszcpakqkrjf/settings/api');
  console.error('   (Busca "service_role" key, NO la "anon" key)');
  console.error('');
  console.error('3. O pasarla como variable de entorno:');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=tu_clave node scripts/generate-seed.js');
  process.exit(1);
}

console.log(`Usando URL: ${SUPABASE_URL}`);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function escapeSQL(value, columnName = null) {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  
  // Solo tratar como vector si es el campo vector2
  const isVectorField = columnName === 'vector2';
  
  // Lista de columnas JSONB conocidas
  const jsonbColumns = [
    'cities', 'countries', 'gps_coordinates', 'revenues', 'certifications',
    'main_customers', 'contact_emails', 'contact_phones', 'subcategories',
    'target_industries', 'key_features', 'use_cases', 'source_urls'
  ];
  const isJsonbField = columnName && jsonbColumns.includes(columnName);
  
  // Si es un objeto (JSONB fields)
  if (typeof value === 'object' && !Array.isArray(value)) {
    // Convertir objeto a JSON string y escapar comillas
    return "'" + JSON.stringify(value).replace(/'/g, "''") + "'::jsonb";
  }
  
  // Si es un array
  if (Array.isArray(value)) {
    if (isVectorField) {
      // Array numérico para vector
      return "'[" + value.join(',') + "]'::vector";
    } else {
      // Array o array de objetos, convertirlo a JSON string
      return "'" + JSON.stringify(value).replace(/'/g, "''") + "'::jsonb";
    }
  }
  
  // Si es un string
  const strValue = String(value);
  
  // Si es un campo JSONB pero el valor es un string simple, convertirlo a JSON válido
  if (isJsonbField && typeof value === 'string') {
    // Si ya es JSON válido, usarlo tal cual
    try {
      JSON.parse(strValue);
      return "'" + strValue.replace(/'/g, "''") + "'::jsonb";
    } catch (e) {
      // Si no es JSON válido, convertirlo a un array con el string
      return "'" + JSON.stringify([strValue]).replace(/'/g, "''") + "'::jsonb";
    }
  }
  
  // Solo tratar como vector si es el campo vector2 y parece un array numérico
  if (isVectorField && strValue.trim().startsWith('[') && strValue.trim().endsWith(']')) {
    // Verificar si contiene números (no strings)
    const innerContent = strValue.trim().slice(1, -1);
    // Si contiene comillas, es un array de strings, no un vector
    if (!innerContent.includes('"') && !innerContent.includes("'")) {
      // Ya está en formato de array numérico, solo escapar comillas y añadir cast
      return "'" + strValue.replace(/'/g, "''") + "'::vector";
    }
  }
  
  // Escapar comillas simples para SQL
  return "'" + strValue.replace(/'/g, "''") + "'";
}

function generateInsert(table, row, columns) {
  const values = columns.map(col => escapeSQL(row[col], col));
  return `INSERT INTO "public"."${table}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${values.join(', ')});`;
}

async function generateSeed() {
  console.log('Generando seed.sql con 50 empresas aleatorias, productos, company_revision, usuarios auth, agent_prompt_backups_v2 y vectores...\n');

  let output = `-- Seed file: 50 empresas aleatorias, sus productos, company_revision, usuarios auth, agent_prompt_backups_v2 y vectores
-- Generado automáticamente desde la base de datos remota
-- Fecha: ${new Date().toISOString()}

SET session_replication_role = replica;

`;

  try {
    // Variables para el resumen final
    let authUsers = null;
    let agentPromptBackups = null;
    let companyRevisions = null;
    let productRevisions = null;
    let embeddings = null;

    // 1. Obtener 50 empresas aleatorias
    console.log('1. Obteniendo empresas...');
    // Primero obtenemos todas las empresas (o un número grande) para poder seleccionar aleatoriamente
    const { data: allCompanies, error: companiesError } = await supabase
      .from('company')
      .select('*');

    if (companiesError) {
      throw new Error(`Error obteniendo empresas: ${companiesError.message}`);
    }

    if (!allCompanies || allCompanies.length === 0) {
      console.log('No se encontraron empresas en la base de datos.');
      return;
    }

    console.log(`   ✓ Encontradas ${allCompanies.length} empresas en total`);

    // Seleccionar 50 empresas aleatorias usando Fisher-Yates shuffle
    const shuffled = [...allCompanies];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const companies = shuffled.slice(0, 50);

    console.log(`   ✓ Seleccionadas ${companies.length} empresas aleatorias`);

    const companyIds = companies.map(c => c.id);

    // 0. Obtener usuarios de auth.users
    console.log('0. Obteniendo usuarios de auth...');
    // Usar una función RPC para obtener usuarios de auth.users
    const { data: authUsersData, error: authUsersError } = await supabase.rpc('exec_sql', {
      query: `
        SELECT 
          id, 
          instance_id, 
          aud, 
          role, 
          email, 
          encrypted_password, 
          email_confirmed_at, 
          invited_at, 
          confirmation_token, 
          confirmation_sent_at, 
          recovery_token, 
          recovery_sent_at, 
          email_change_token_new, 
          email_change, 
          email_change_sent_at, 
          last_sign_in_at, 
          raw_app_meta_data, 
          raw_user_meta_data, 
          is_super_admin, 
          created_at, 
          updated_at, 
          phone, 
          phone_confirmed_at, 
          phone_change, 
          phone_change_token, 
          phone_change_sent_at, 
          confirmed_at, 
          email_change_token_current, 
          email_change_confirm_status, 
          banned_until, 
          reauthentication_token, 
          reauthentication_sent_at, 
          is_sso_user, 
          deleted_at
        FROM auth.users
        ORDER BY created_at DESC
        LIMIT 1000
      `
    });

    // Si la función RPC no existe, intentar obtener usuarios de otra manera
    if (authUsersError) {
      console.log(`   ⚠️  No se pudo obtener usuarios mediante RPC: ${authUsersError.message}`);
      console.log('   Intentando método alternativo...');
      
      // Intentar usar Admin API si está disponible
      try {
        // Usar fetch directo a la API de Supabase Admin
        const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({
            query: 'SELECT * FROM auth.users ORDER BY created_at DESC LIMIT 1000'
          })
        });

        if (response.ok) {
          authUsers = await response.json();
          console.log(`   ✓ Encontrados ${authUsers?.length || 0} usuarios de auth`);
        } else {
          // Si tampoco funciona, usar una consulta SQL directa mediante PostgREST
          console.log('   Intentando consulta SQL directa...');
          // Crear una función temporal para obtener usuarios
          const { data: usersFromRPC, error: rpcError } = await supabase
            .from('_get_auth_users')
            .select('*')
            .limit(1000);
          
          if (!rpcError && usersFromRPC) {
            authUsers = usersFromRPC;
            console.log(`   ✓ Encontrados ${authUsers.length} usuarios de auth`);
          } else {
            console.log(`   ⚠️  No se pudieron obtener usuarios: ${rpcError?.message || 'Método no disponible'}`);
            authUsers = [];
          }
        }
      } catch (fetchError) {
        console.log(`   ⚠️  Error al obtener usuarios: ${fetchError.message}`);
        authUsers = [];
      }
    } else {
      authUsers = authUsersData;
      console.log(`   ✓ Encontrados ${authUsers?.length || 0} usuarios de auth`);
    }

    // Exportar usuarios de auth si los tenemos
    if (authUsers && authUsers.length > 0) {
      output += `--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: postgres
--

`;
      // Columnas principales de auth.users
      const authUserColumns = [
        'id', 'instance_id', 'aud', 'role', 'email', 'encrypted_password',
        'email_confirmed_at', 'invited_at', 'confirmation_token', 'confirmation_sent_at',
        'recovery_token', 'recovery_sent_at', 'email_change_token_new', 'email_change',
        'email_change_sent_at', 'last_sign_in_at', 'raw_app_meta_data', 'raw_user_meta_data',
        'is_super_admin', 'created_at', 'updated_at', 'phone', 'phone_confirmed_at',
        'phone_change', 'phone_change_token', 'phone_change_sent_at', 'confirmed_at',
        'email_change_token_current', 'email_change_confirm_status', 'banned_until',
        'reauthentication_token', 'reauthentication_sent_at', 'is_sso_user', 'deleted_at'
      ];
      
      // Filtrar solo las columnas que existen en los datos
      const availableColumns = authUserColumns.filter(col => 
        authUsers[0] && authUsers[0].hasOwnProperty(col)
      );
      
      authUsers.forEach(user => {
        // Usar schema auth para la tabla users
        const values = availableColumns.map(col => escapeSQL(user[col], col));
        output += `INSERT INTO "auth"."users" (${availableColumns.map(c => `"${c}"`).join(', ')}) VALUES (${values.join(', ')});\n`;
      });
      output += '\n';
    }

    // Exportar empresas
    output += `--
-- Data for Name: company; Type: TABLE DATA; Schema: public; Owner: postgres
--

`;
    const companyColumns = ['id', 'url_root', 'role', 'created_at', 'processed', 'to_review', 'reviewed', 'processed_v2', 'comment', 'updated_at', 'n_products'];
    companies.forEach(company => {
      output += generateInsert('company', company, companyColumns) + '\n';
    });
    output += '\n';

    // 2. Obtener company_revision de esas empresas
    console.log('2. Obteniendo revisiones de empresas...');
    const { data: companyRevisionsData, error: companyRevisionsError } = await supabase
      .from('company_revision')
      .select('*')
      .in('company_id', companyIds);

    if (companyRevisionsError) {
      throw new Error(`Error obteniendo revisiones de empresas: ${companyRevisionsError.message}`);
    }

    companyRevisions = companyRevisionsData;

    if (companyRevisions && companyRevisions.length > 0) {
      console.log(`   ✓ Encontradas ${companyRevisions.length} revisiones de empresas`);

      // Exportar revisiones de empresas
      output += `--
-- Data for Name: company_revision; Type: TABLE DATA; Schema: public; Owner: postgres
--

`;
      const companyRevisionColumns = [
        'id', 'company_id', 'source', 'created_at', 'is_active', 'nombre_empresa', 'description',
        'main_activities', 'strengths', 'sectors', 'website', 'cities', 'countries', 'gps_coordinates',
        'revenues', 'certifications', 'score', 'score_rationale', 'cost', 'processed', 'slug', 'logo',
        'main_customers', 'comment', 'contact_emails', 'contact_phones', 'embedded', 'created_by', 'youtube_url'
      ];
      companyRevisions.forEach(cr => {
        output += generateInsert('company_revision', cr, companyRevisionColumns) + '\n';
      });
      output += '\n';
    } else {
      console.log('   ✓ No se encontraron revisiones de empresas');
    }

    // 3. Obtener productos de esas empresas
    console.log('3. Obteniendo productos...');
    const { data: products, error: productsError } = await supabase
      .from('product')
      .select('*')
      .in('company_id', companyIds);

    if (productsError) {
      throw new Error(`Error obteniendo productos: ${productsError.message}`);
    }

    if (products && products.length > 0) {
      console.log(`   ✓ Encontrados ${products.length} productos`);

      const productIds = products.map(p => p.id);

      // Exportar productos
      output += `--
-- Data for Name: product; Type: TABLE DATA; Schema: public; Owner: postgres
--

`;
      const productColumns = ['id', 'company_id', 'created_at'];
      products.forEach(product => {
        output += generateInsert('product', product, productColumns) + '\n';
      });
      output += '\n';

      // 4. Obtener revisiones de productos (en lotes para evitar límites)
      console.log('4. Obteniendo revisiones de productos...');
      const BATCH_SIZE = 100;
      let allProductRevisions = [];
      
      for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
        const batch = productIds.slice(i, i + BATCH_SIZE);
        const { data: batchRevisions, error: batchError } = await supabase
          .from('product_revision')
          .select('*')
          .in('product_id', batch);

        if (batchError) {
          throw new Error(`Error obteniendo revisiones de productos (lote ${Math.floor(i/BATCH_SIZE) + 1}): ${batchError.message}`);
        }

        if (batchRevisions) {
          allProductRevisions.push(...batchRevisions);
        }
        
        if ((i / BATCH_SIZE + 1) % 10 === 0) {
          console.log(`   Procesando lote ${Math.floor(i/BATCH_SIZE) + 1}...`);
        }
      }

      productRevisions = allProductRevisions;

      if (productRevisions && productRevisions.length > 0) {
        console.log(`   ✓ Encontradas ${productRevisions.length} revisiones de productos`);

        const productRevisionIds = productRevisions.map(pr => pr.id);

        // Exportar revisiones de productos
        output += `--
-- Data for Name: product_revision; Type: TABLE DATA; Schema: public; Owner: postgres
--

`;
        const productRevisionColumns = [
          'id', 'product_id', 'source', 'created_at', 'is_active', 'product_name', 'product_url',
          'main_category', 'subcategories', 'short_description', 'long_description', 'target_industries',
          'image', 'definition_score', 'improvement_advice', 'key_features', 'use_cases', 'source_urls',
          'embedded', 'comment', 'created_by', 'youtube_url', 'pdf_url'
        ];
        productRevisions.forEach(pr => {
          output += generateInsert('product_revision', pr, productRevisionColumns) + '\n';
        });
        output += '\n';

        // 5. Obtener embeddings (incluyendo vector2) - en lotes
        console.log('5. Obteniendo embeddings (incluyendo vectores)...');
        const EMBEDDING_BATCH_SIZE = 100;
        let allEmbeddings = [];
        
        for (let i = 0; i < productRevisionIds.length; i += EMBEDDING_BATCH_SIZE) {
          const batch = productRevisionIds.slice(i, i + EMBEDDING_BATCH_SIZE);
          const { data: batchEmbeddings, error: batchError } = await supabase
            .from('embedding')
            .select('id, text, is_active, id_company_revision, id_product_revision, chunk_size, vector2, created_at')
            .in('id_product_revision', batch)
            .not('id_product_revision', 'is', null);

          if (batchError) {
            throw new Error(`Error obteniendo embeddings (lote ${Math.floor(i/EMBEDDING_BATCH_SIZE) + 1}): ${batchError.message}`);
          }

          if (batchEmbeddings) {
            allEmbeddings.push(...batchEmbeddings);
          }
          
          if ((i / EMBEDDING_BATCH_SIZE + 1) % 10 === 0) {
            console.log(`   Procesando lote ${Math.floor(i/EMBEDDING_BATCH_SIZE) + 1}...`);
          }
        }

        embeddings = allEmbeddings;

        if (embeddings && embeddings.length > 0) {
          console.log(`   ✓ Encontrados ${embeddings.length} embeddings (con vectores)`);

          // Exportar embeddings
          output += `--
-- Data for Name: embedding; Type: TABLE DATA; Schema: public; Owner: postgres
--

`;
          const embeddingColumns = ['id', 'text', 'is_active', 'id_company_revision', 'id_product_revision', 'chunk_size', 'vector2', 'created_at'];
          embeddings.forEach(embedding => {
            output += generateInsert('embedding', embedding, embeddingColumns) + '\n';
          });
          output += '\n';
        } else {
          console.log('   ✓ No se encontraron embeddings');
        }
      } else {
        console.log('   ✓ No se encontraron revisiones de productos');
      }
    } else {
      console.log('   ✓ No se encontraron productos');
    }

    // 6. Obtener agent_prompt_backups_v2
    console.log('6. Obteniendo agent_prompt_backups_v2...');
    const { data: agentPromptBackupsData, error: agentPromptBackupsError } = await supabase
      .from('agent_prompt_backups_v2')
      .select('*');

    if (agentPromptBackupsError) {
      throw new Error(`Error obteniendo agent_prompt_backups_v2: ${agentPromptBackupsError.message}`);
    }

    agentPromptBackups = agentPromptBackupsData;

    if (agentPromptBackups && agentPromptBackups.length > 0) {
      console.log(`   ✓ Encontrados ${agentPromptBackups.length} registros de agent_prompt_backups_v2`);

      // Exportar agent_prompt_backups_v2
      output += `--
-- Data for Name: agent_prompt_backups_v2; Type: TABLE DATA; Schema: public; Owner: postgres
--

`;
      // Obtener todas las columnas dinámicamente del primer registro
      const allColumns = Object.keys(agentPromptBackups[0]);
      agentPromptBackups.forEach(backup => {
        output += generateInsert('agent_prompt_backups_v2', backup, allColumns) + '\n';
      });
      output += '\n';
    } else {
      console.log('   ✓ No se encontraron registros en agent_prompt_backups_v2');
    }

    output += 'RESET ALL;\n';

    // Guardar archivo
    const seedPath = path.join(__dirname, '..', 'supabase', 'seed.sql');
    fs.writeFileSync(seedPath, output, 'utf8');

    console.log(`\n✓ Seed.sql generado exitosamente en: ${seedPath}`);
    console.log(`\nResumen:`);
    console.log(`  - Usuarios auth: ${authUsers?.length || 0}`);
    console.log(`  - Empresas: ${companies.length}`);
    console.log(`  - Revisiones de empresas: ${companyRevisions?.length || 0}`);
    console.log(`  - Productos: ${products?.length || 0}`);
    console.log(`  - Revisiones de productos: ${productRevisions?.length || 0}`);
    console.log(`  - Embeddings: ${embeddings?.length || 0}`);
    console.log(`  - Agent prompt backups: ${agentPromptBackups?.length || 0}`);

  } catch (error) {
    console.error('Error generando seed.sql:', error);
    process.exit(1);
  }
}

generateSeed();

