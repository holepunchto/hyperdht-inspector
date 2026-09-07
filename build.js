const Hyperschema = require('hyperschema')

const schema = Hyperschema.from('./spec/hyperschema', { versioned: false })
const inspector = schema.namespace('inspector')

// SECURITY: Params are intentionally omitted: initial use cases do not need
// them, and omitting them simplifies security. Consult the author and
// cybersecurity before enabling params.
inspector.register({
  name: 'post-request',
  compact: true,
  fields: [
    {
      name: 'method',
      type: 'string',
      required: true
    }
  ]
})

Hyperschema.toDisk(schema)
