/**
 * Scheduler - Cron Jobs
 * Agenda execução automática dos workers
 */

import cron from 'node-cron';
import ScrapingWorker from '../workers/scrapingWorker.js';
import ClassifierWorker from '../workers/classifierWorker.js';
import CleanupWorker from '../workers/cleanupWorker.js';

const Scheduler = {
  /**
   * Inicia todos os cron jobs
   */
  start() {
    console.log('\n⏰ Iniciando Scheduler...\n');

    // 1. SCRAPING - A cada 3 minutos (sites já existentes no DB)
    cron.schedule('*/3 * * * *', async () => {
      console.log('\n⏰ [CRON] Executando Scraping Worker...');
      try {
        await ScrapingWorker.run();
      } catch (error) {
        console.error('❌ Erro no scraping automático:', error.message);
      }
    });
    console.log('✅ Scraping agendado: a cada 3 minutos');

    // 2. CLASSIFICAÇÃO - A cada 2 minutos (artigos na fila)
    cron.schedule('*/2 * * * *', async () => {
      console.log('\n⏰ [CRON] Executando Classifier Worker...');
      try {
        await ClassifierWorker.run();
      } catch (error) {
        console.error('❌ Erro na classificação automática:', error.message);
      }
    });
    console.log('✅ Classificação agendada: a cada 2 minutos');

    // 3. LIMPEZA - Todo dia às 03:00
    cron.schedule('0 3 * * *', async () => {
      console.log('\n⏰ [CRON] Executando Cleanup Worker...');
      try {
        await CleanupWorker.run();
      } catch (error) {
        console.error('❌ Erro na limpeza automática:', error.message);
      }
    });
    console.log('✅ Limpeza agendada: todo dia às 03:00');

    console.log('\n🚀 Scheduler ativo! Workers rodando em background.\n');
  },

  /**
   * Executa workers manualmente (teste)
   */
  async runNow() {
    console.log('\n🧪 Executando workers manualmente...\n');

    try {
      // 1. Scraping
      console.log('1️⃣ Scraping Worker');
      await ScrapingWorker.run();

      // 2. Classificação
      console.log('\n2️⃣ Classifier Worker');
      await ClassifierWorker.run();

      // 3. Limpeza
      console.log('\n3️⃣ Cleanup Worker');
      await CleanupWorker.run();

      console.log('\n✅ Todos os workers executados com sucesso!\n');
    } catch (error) {
      console.error('\n❌ Erro:', error);
    }
  }
};

export default Scheduler;
