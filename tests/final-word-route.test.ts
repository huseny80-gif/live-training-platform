import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
async function main() {
const dir = mkdtempSync(join(tmpdir(), 'final-word-route-'));
const state = { owner: 'trainer', program: { title: 'GIS' } as { title: string } | null, calls: [] as { kind: string; query: any }[] };
(globalThis as any).__wordTest = state;
try {
  const file = join(dir, 'route.cjs');
  await build({ entryPoints: ['src/app/api/final-exam/export/route.ts'], outfile: file, bundle: true, platform: 'node', format: 'cjs', plugins: [{ name: 'auth-db', setup(b) {
    b.onResolve({ filter: /^@\/lib\/(auth|prisma)$/ }, args => ({ path: args.path, namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.path.endsWith('auth') ? 'export async function auth(){const x=globalThis.__wordTest;return x.owner?{user:{id:x.owner}}:null}' : `const x=globalThis.__wordTest; export const prisma={trainingProgram:{async findFirst(query){x.calls.push({kind:'program',query});return x.program}},question:{async findMany(query){x.calls.push({kind:'questions',query});return []}},liveSession:{async findFirst(query){x.calls.push({kind:'exam',query});return null}}}`, loader: 'js' }));
  } }] });
  const { GET } = createRequire(join(process.cwd(), "package.json"))(file);
  const program = '00000000-0000-4000-8000-000000000001'; const exam = '00000000-0000-4000-8000-000000000002';
  const request = (query: string) => new Request('https://test.local/api/final-exam/export?' + query);
  state.owner = ''; assert.equal((await GET(request('programId='+program))).status, 401); assert.equal(state.calls.length, 0);
  state.owner = 'trainer'; assert.equal((await GET(request('programId=invalid'))).status, 400);
  state.program = null; assert.equal((await GET(request('programId='+program))).status, 404); assert.equal(state.calls.at(-1)!.query.where.instructorId, 'trainer');
  state.program = { title: 'GIS' }; assert.equal((await GET(request('programId='+program))).status, 409);
  const bank = state.calls.at(-1)!; assert.equal(bank.query.where.day.dayNumber, 0); assert.equal(bank.query.where.status.not, 'REJECTED');
  assert.equal((await GET(request(`programId=${program}&examId=${exam}`))).status, 404);
  const saved = state.calls.at(-1)!; assert.equal(saved.query.where.programId, program); assert.equal(saved.query.where.instructorId, 'trainer'); assert.equal(saved.query.where.dayNumber, 0);
  console.log('PASS: Word export authentication, owner scope, final-only bank, saved-exam scope and empty bank response (fixture DB).');
} finally { rmSync(dir, { recursive: true, force: true }); delete (globalThis as any).__wordTest; }

}
main().catch(error => { console.error(error); process.exitCode = 1; });
