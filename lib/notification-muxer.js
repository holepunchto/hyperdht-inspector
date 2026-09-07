const c = require('compact-encoding')
const Protomux = require('protomux')

const PROTOCOL = 'hyperdht-inspector'
const ID = Buffer.from('hyperdht-notification')

module.exports = class NotificationMuxer {
  constructor(stream, { onnotification = noop, onopen = noop, onclose = noop } = {}) {
    this.muxer = Protomux.from(stream)
    this.channel = this.muxer.createChannel({
      protocol: PROTOCOL,
      id: ID,
      messages: [{ encoding: c.json, onmessage: onnotification }],
      onopen,
      onclose
    })
    this.wireNotification = this.channel.messages[0]
    this.channel.open()
  }

  get stream() {
    return this.muxer.stream
  }

  sendNotification(notification) {
    return this.wireNotification.send(notification)
  }

  close() {
    return this.channel.close()
  }

  static pair(stream, notify) {
    const muxer = Protomux.from(stream)
    muxer.pair({ protocol: PROTOCOL, id: ID }, notify)
  }
}

function noop() {}
