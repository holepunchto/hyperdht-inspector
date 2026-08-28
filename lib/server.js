const c = require('compact-encoding')
const ReadyResource = require('ready-resource')
const inspector = require('inspector/promises')
const { isBare } = require('which-runtime')
const DhtInspectorError = require('./errors')
const NotificationMuxer = require('./notification-muxer')

const SESSION = Symbol('inspector session')
const DEFAULT_ALLOW_METHODS = [
  'HeapProfiler.takeHeapSnapshot',
  'Profiler.enable',
  'Profiler.start',
  'Profiler.stop'
]
const DEFAULT_ALLOW_EVENTS = ['HeapProfiler.addHeapSnapshotChunk']

module.exports = class HyperdhtInspectorServer {
  /**
   * @param {import('protomux-rpc-router')} router
   * @param {{ allowMethods?: string[], allowEvents?: string[] }} [options]
   */
  constructor(
    router,
    { allowMethods = DEFAULT_ALLOW_METHODS, allowEvents = DEFAULT_ALLOW_EVENTS } = {}
  ) {
    this.stats = {
      attempted: 0,
      failed: 0,
      success: 0
    }

    this._router = router
    this.allowMethods = allowMethods
    this.allowEvents = allowEvents
    this._router.method(
      'inspector:post',
      {
        requestEncoding: c.json,
        responseEncoding: c.json
      },
      (request, { connection }) => this._post(connection[SESSION], request)
    )
  }

  /**
   *
   * @param {import('stream').Duplex} connection
   */
  handleConnection(connection) {
    const inspectorSession = new InspectorSession(connection, this.allowEvents)
    connection[SESSION] = inspectorSession

    connection.once('close', async () => {
      await inspectorSession.close()
    })

    this._router.handleConnection(connection, Buffer.from('hyperdht-inspector-rpc'))
  }

  async _post(session, request) {
    this.stats.attempted++

    try {
      if (!this.allowMethods.includes(request.method)) {
        throw DhtInspectorError.METHOD_NOT_ALLOWED(request.method)
      }

      await session.ready()

      const result =
        request.params === undefined
          ? await session.session.post(request.method)
          : await session.session.post(request.method, request.params)

      this.stats.success++
      return result === undefined ? {} : result
    } catch (error) {
      this.stats.failed++
      throw error
    }
  }
}

class InspectorSession extends ReadyResource {
  constructor(connection, allowEvents) {
    super()

    this.connection = connection
    this.allowEvents = allowEvents
    this.muxer = null
    this.session = null
  }

  async _open() {
    this.muxer = new NotificationMuxer(this.connection)
    await this.muxer.channel.fullyOpened()

    try {
      const session = new inspector.Session()
      session.on('inspectorNotification', (message) => {
        if (this.allowEvents.includes(message.method)) {
          this.muxer.sendNotification(message)
        }
      })

      this.session = session
      session.connect()
    } catch (error) {
      this._close()
      throw error
    }
  }

  _close() {
    const muxer = this.muxer
    const session = this.session

    this.muxer = null
    this.session = null

    try {
      if (session !== null) {
        if (isBare) {
          session.destroy()
        } else {
          session.disconnect()
        }
      }
    } finally {
      if (muxer !== null && !muxer.channel.closed) {
        muxer.close()
      }
    }
  }
}
