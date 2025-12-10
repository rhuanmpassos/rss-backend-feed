/**
 * Test Workers Manually
 * Executa workers manualmente para teste
 */

import Scheduler from './src/scheduler/jobs.js';

console.log('🧪 Testando Workers...\n');

// Executa todos os workers
await Scheduler.runNow();

process.exit(0);
