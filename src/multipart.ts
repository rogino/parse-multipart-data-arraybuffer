/**
 * Multipart Parser (Finite State Machine)
 * usage:
 * const multipart = require('./multipart.js');
 * const body = multipart.DemoData(); // raw body
 * const boundary = multipart.getBoundary(event.params.header['content-type']);
 * const parts = multipart.Parse(body,boundary);
 * each part is:
 * { filename: 'A.txt', type: 'text/plain', data: <Uint8Array 41 41 41 41 42 42 42 42> }
 *  or { name: 'key', data: <Uint8Array 41 41 41 41 42 42 42 42> }
 * The data array references the original ArrayBuffer: it is not a copy of the data
 */

type Part = {
  contentDispositionHeader: string
  contentTypeHeader: string
  part: Uint8Array
}

type Input = {
  filename?: string
  name?: string
  type: string
  data: Uint8Array
}

enum ParsingState {
  INIT,
  READING_HEADERS,
  READING_DATA,
  READING_PART_SEPARATOR
}

export function parse(multipartBodyBuffer: ArrayBuffer, boundary: string): Input[] {
  let contentDispositionHeader = ''
  let contentTypeHeader = ''
  let state: ParsingState = ParsingState.INIT
  const allParts: Input[] = []

  let currentPartHeaders: string[] = []

  let textDecoder = new TextDecoder()
  let uint8Buffer = new Uint8Array(multipartBodyBuffer)

  // inclusive
  let bufferRange: { start: number, end: number } = { start: 0, end: 0 }
  let lastlineRange: { start: number, end: number } | undefined

  const lastlineLength = (): number|undefined => {
    if (lastlineRange == undefined) return undefined
      return lastlineRange.end - lastlineRange.start + 1
  }
  const lastline = (): string|undefined => {
    if (lastlineRange == undefined) return undefined
    let subarray = uint8Buffer.subarray(lastlineRange.start, lastlineRange.end + 1)
    return textDecoder.decode(subarray)
  }

  for (let i = 0; i < uint8Buffer.length; i++) {
    const oneByte: number = uint8Buffer[i]
    const prevByte: number | null = i > 0 ? uint8Buffer[i - 1] : null
    // 0x0a => \n
    // 0x0d => \r
    const newLineDetected: boolean = oneByte === 0x0a && prevByte === 0x0d
    const newLineChar: boolean = oneByte === 0x0a || oneByte === 0x0d

    if (!newLineChar) lastlineRange = {
      start: lastlineRange?.start ?? i,
      end: i
    }

    if (ParsingState.INIT === state && newLineDetected) {
      // searching for boundary
      console.log(lastlineLength(), boundary.length + 2)
      if (lastlineLength() == boundary.length + 2 && lastline() == '--' + boundary) {
        state = ParsingState.READING_HEADERS // found boundary. start reading headers
      }
      lastlineRange = undefined
    } else if (ParsingState.READING_HEADERS === state && newLineDetected) {
      // parsing headers. Headers are separated by an empty line from the content. Stop reading headers when the line is empty
      if (lastlineRange != undefined) {
        currentPartHeaders.push(lastline()!)
      } else {
        // found empty line. search for the headers we want and set the values
        for (const h of currentPartHeaders) {
          if (h.toLowerCase().startsWith('content-disposition:')) {
            contentDispositionHeader = h
          } else if (h.toLowerCase().startsWith('content-type:')) {
            contentTypeHeader = h
          }
        }
        state = ParsingState.READING_DATA
        bufferRange = { start: i + 1, end: i + 1 }
      }
      lastlineRange = undefined
    } else if (ParsingState.READING_DATA === state) {
      if (lastlineLength() == boundary.length + 2 && lastline() == '--' + boundary) {
        let part = uint8Buffer.subarray(bufferRange.start, bufferRange.end - lastlineLength()!)
        allParts.push(
          process({ contentDispositionHeader, contentTypeHeader, part })
        )
        bufferRange = { start: i, end: i }
        currentPartHeaders = []
        lastlineRange = undefined
        state = ParsingState.READING_PART_SEPARATOR
        contentDispositionHeader = ''
        contentTypeHeader = ''
      } else {
        bufferRange.end = i
      }
      if (newLineDetected) {
        lastlineRange = undefined
      }
    } else if (ParsingState.READING_PART_SEPARATOR === state) {
      if (newLineDetected) {
        state = ParsingState.READING_HEADERS
      }
    }
  }
  return allParts
}

//  read the boundary from the content-type header sent by the http client
//  this value may be similar to:
//  'multipart/form-data; boundary=----WebKitFormBoundaryvm5A9tzU1ONaGP5B',
export function getBoundary(header: string): string {
  const items = header.split(';')
  if (items) {
    for (let i = 0; i < items.length; i++) {
      const item = new String(items[i]).trim()
      if (item.indexOf('boundary') >= 0) {
        const k = item.split('=')
        return new String(k[1]).trim().replace(/^["']|["']$/g, '')
      }
    }
  }
  return ''
}


export function DemoData(): { body: ArrayBuffer; boundary: string } {
  let body = 'trash1\r\n'
  body += '------WebKitFormBoundaryvef1fLxmoUdYZWXp\r\n'
  body += 'Content-Type: text/plain\r\n'
  body +=
    'Content-Disposition: form-data; name="uploads[]"; filename="A.txt"\r\n'
  body += '\r\n'
  body += '@11X'
  body += '111Y\r\n'
  body += '111Z\rCCCC\nCCCC\r\nCCCCC@\r\n\r\n'
  body += '------WebKitFormBoundaryvef1fLxmoUdYZWXp\r\n'
  body += 'Content-Type: text/plain\r\n'
  body +=
    'Content-Disposition: form-data; name="uploads[]"; filename="B.txt"\r\n'
  body += '\r\n'
  body += '@22X'
  body += '222Y\r\n'
  body += '222Z\r222W\n2220\r\n666@\r\n'
  body += '------WebKitFormBoundaryvef1fLxmoUdYZWXp\r\n'
  body += 'Content-Disposition: form-data; name="input1"\r\n'
  body += '\r\n'
  body += 'value1\r\n'
  body += '------WebKitFormBoundaryvef1fLxmoUdYZWXp--\r\n'

  let textEncoder = new TextEncoder()
  let buffer = textEncoder.encode(body)
  return {
    body: buffer.buffer,
    boundary: '----WebKitFormBoundaryvef1fLxmoUdYZWXp'
  }
}

function process(part: Part): Input {
  // will transform this object:
  // { header: 'Content-Disposition: form-data; name="uploads[]"; filename="A.txt"',
  // info: 'Content-Type: text/plain',
  // part: 'AAAABBBB' }
  // into this one:
  // { filename: 'A.txt', type: 'text/plain', data: <Uint8Array 41 41 41 41 42 42 42 42> }
  const obj = function (str: string) {
    const k = str.split('=')
    const a = k[0].trim()

    const b = JSON.parse(k[1].trim())
    const o = {}
    Object.defineProperty(o, a, {
      value: b,
      writable: true,
      enumerable: true,
      configurable: true
    })
    return o
  }
  const header = part.contentDispositionHeader.split(';')

  const filenameData = header[2]
  let input = {}
  if (filenameData) {
    input = obj(filenameData)
    const contentType = part.contentTypeHeader.split(':')[1].trim()
    Object.defineProperty(input, 'type', {
      value: contentType,
      writable: true,
      enumerable: true,
      configurable: true
    })
  }
  // always process the name field
  Object.defineProperty(input, 'name', {
    value: header[1].split('=')[1].replace(/"/g, ''),
    writable: true,
    enumerable: true,
    configurable: true
  })

  Object.defineProperty(input, 'data', {
    value: part.part,
    writable: true,
    enumerable: true,
    configurable: true
  })
  return input as Input
}

