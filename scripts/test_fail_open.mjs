import worker from '../src/_worker.js';

class FakeStmt {
  constructor(sql){ this.sql=sql; }
  bind(){ return this; }
  async all(){ return {results:[]}; }
  async first(){
    if(this.sql.includes('SELECT id FROM users LIMIT 1')) return null;
    return null;
  }
  async run(){ throw new Error('SIMULATED_D1_MAINTENANCE_FAILURE'); }
}
class FakeDB {
  prepare(sql){ return new FakeStmt(sql); }
  async exec(){ throw new Error('SIMULATED_D1_SCHEMA_EXEC_FAILURE'); }
  async batch(){ throw new Error('SIMULATED_D1_BATCH_FAILURE'); }
}
class FakeKV {
  async get(){ return null; }
  async put(){ return; }
  async delete(){ return; }
}
const env={JOB_DB:new FakeDB(), JOB_KV:new FakeKV(), ASSETS:{fetch:async()=>new Response('asset')}};
const req=new Request('https://example.test/api/session');
const res=await worker.fetch(req,env);
const body=await res.json();
if(res.status!==401 || body.error!=='Authentification requise'){
  console.error('FAIL',res.status,body);
  process.exit(1);
}
console.log('FAIL-OPEN OK: simulated D1 schema/maintenance errors no longer turn /api/session into HTTP 500');
