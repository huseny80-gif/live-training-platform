import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { libraryVideoId, videoReviewUrl } from '../src/lib/exam-material/library-video';
async function run() {
  const id = '10000000-0000-4000-8000-000000000003'; const url = `/api/resources/${id}/file`;
  assert.equal(libraryVideoId(url), id); assert.equal(libraryVideoId(url+'?other=1'), null); assert.equal(libraryVideoId('https://evil.test'+url), null);
  assert.equal(videoReviewUrl(url, 260, 'a'.repeat(48)), `/api/study/${'a'.repeat(48)}/video/${id}#t=260`);
  const state = { batch: null as any, available: true, calls: 0 };
  Object.assign(globalThis, { __videoAccess: state });
  const bundle = await build({ entryPoints: ['src/app/api/study/[token]/video/[resourceId]/route.ts'], bundle: true, platform: 'node', format: 'cjs', write: false, plugins: [{ name: 'fixtures', setup(b) {
    b.onResolve({ filter: /^@\/lib\/(exam-material\/service|prisma|resources\/serve-file)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    b.onLoad({ filter: /./, namespace: 'fixture' }, args => ({ loader: 'js', contents: args.path.endsWith('service') ? 'export async function publishedMaterial(){return globalThis.__videoAccess.batch}' : args.path.endsWith('prisma') ? `export const prisma={resourceFile:{async findFirst({where}){const x=globalThis.__videoAccess;x.calls++; if(where.programId!=='program'||where.status!=='READY'||where.archivedAt!==null)throw Error('wrong scope');return x.available?{storagePath:'private'}:null}}}` : 'export async function serveResourceFile(){return new Response("fixture video",{headers:{"Cache-Control":"private, no-store"}})}' }));
  } }] });
  const module = { exports: {} as any }; new Function('module','exports','require',bundle.outputFiles[0].text)(module,module.exports,createRequire(process.cwd()+'/package.json'));
  const ctx = { params: Promise.resolve({ token:'a'.repeat(48), resourceId:id }) }; const req = new Request('https://test.local/video');
  assert.equal((await module.exports.GET(req,ctx)).status,404); assert.equal(state.calls,0);
  state.batch={programId:'program',sources:[{sourceKind:'VIDEO',mediaUrl:'/api/resources/10000000-0000-4000-8000-000000000004/file'}]};
  assert.equal((await module.exports.GET(req,ctx)).status,404); assert.equal(state.calls,0);
  state.batch.sources[0].mediaUrl=url; state.available=false; assert.equal((await module.exports.GET(req,ctx)).status,404);
  state.available=true; const response=await module.exports.GET(req,ctx);assert.equal(await response.text(),'fixture video'); assert.equal(response.headers.get('cache-control'),'private, no-store');
  delete (globalThis as any).__videoAccess;
  console.log('PASS: exact library URLs; timestamp links; unpublished/unselected/unavailable video denied; published selected resource scoped to batch program (fixture DB).');
}
run().catch(e=>{console.error(e);process.exitCode=1});
