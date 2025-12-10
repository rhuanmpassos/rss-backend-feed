import pool from './src/config/database.js';

console.log('🔍 Verificando artigos no banco...\n');

async function checkArticles() {
  // Conta artigos por site
  const result = await pool.query(`
    SELECT 
      site_id,
      COUNT(*) as total,
      s.name as site_name
    FROM articles a
    LEFT JOIN sites s ON a.site_id = s.id
    GROUP BY site_id, s.name
    ORDER BY site_id
  `);

  console.log('📊 Artigos por site:');
  console.table(result.rows);

  // Sites órfãos (artigos sem site)
  const orphans = await pool.query(`
    SELECT COUNT(*) as orphans
    FROM articles a
    WHERE NOT EXISTS (SELECT 1 FROM sites s WHERE s.id = a.site_id)
  `);

  if (parseInt(orphans.rows[0].orphans) > 0) {
    console.log(`\n⚠️ ${orphans.rows[0].orphans} artigos órfãos (site deletado)`);
    console.log('🗑️ Limpando artigos órfãos...');

    const deleted = await pool.query(`
      DELETE FROM articles
      WHERE NOT EXISTS (SELECT 1 FROM sites s WHERE s.id = site_id)
      RETURNING id
    `);

    console.log(`✅ ${deleted.rowCount} artigos órfãos removidos!`);
  } else {
    console.log('\n✅ Sem artigos órfãos');
  }

  process.exit(0);
}

checkArticles().catch(console.error);
