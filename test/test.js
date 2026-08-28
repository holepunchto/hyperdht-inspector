const test = require('brittle')
const HyperDHT = require('hyperdht')
const createTestnet = require('hyperdht/testnet')
const ProtomuxRpcRouter = require('protomux-rpc-router')
const { Client, Server } = require('..')

test('simple integration', async (t) => {
  const { client, inspector } = await setup(t, {
    allowMethods: ['Runtime.evaluate']
  })

  t.alike(inspector.stats, { attempted: 0, failed: 0, success: 0 }, 'starts empty')

  const evaluation = await client.post('Runtime.evaluate', {
    expression: '1 + 1',
    returnByValue: true
  })

  t.is(evaluation.result.value, 2, 'posts a CDP request')

  await t.exception(
    () => client.post('Runtime.getIsolateId'),
    'rejects methods outside the allowlist'
  )
  t.alike(inspector.stats, { attempted: 2, failed: 1, success: 1 }, 'classifies posts')
})

test('heapdump', async (t) => {
  const { client } = await setup(t)
  const heapChunks = []
  client.on('HeapProfiler.addHeapSnapshotChunk', ({ params }) => {
    heapChunks.push(params.chunk)
  })

  await client.post('HeapProfiler.takeHeapSnapshot')

  const heapSnapshot = heapChunks.join('')
  t.ok(heapSnapshot.length > 0, 'receives a heap snapshot')
  t.ok(JSON.parse(heapSnapshot).snapshot, 'heap snapshot is valid')
})

test('cpuprofile', async (t) => {
  const { client } = await setup(t)
  await client.post('Profiler.enable')
  await client.post('Profiler.start')

  const { profile } = await client.post('Profiler.stop')
  t.ok(profile.nodes.length > 0, 'receives a CPU profile')
  t.ok(profile.endTime >= profile.startTime, 'CPU profile has a valid time range')
})

test('event allowlist', async (t) => {
  const { client } = await setup(t, {
    allowEvents: []
  })
  client.on('HeapProfiler.addHeapSnapshotChunk', () => {
    t.fail('no event would be received')
  })

  await client.post('HeapProfiler.takeHeapSnapshot')

  // wait a bit to ensure no event happen
  await new Promise((resolve) => setTimeout(resolve, 500))
})

async function setup(t, options) {
  const { bootstrap } = await createTestnet(3, t.teardown)
  const serverDht = new HyperDHT({ bootstrap })
  const router = new ProtomuxRpcRouter()
  const inspector = new Server(router, options)
  const server = serverDht.createServer((stream) => inspector.handleConnection(stream))
  const clientDht = new HyperDHT({ bootstrap })

  t.teardown(() => clientDht.destroy())
  t.teardown(() => router.close())
  t.teardown(() => serverDht.destroy())

  await Promise.all([router.ready(), server.listen()])

  const client = new Client(clientDht, server.publicKey)
  t.teardown(() => client.close())

  return { client, inspector }
}
