# parse-multipart-data

A Typescript lib multipart/form-data parser which operates on native JS ArrayBuffers.

Forked from [nachomazzara/parse-multipart-data](https://github.com/nachomazzara/parse-multipart-data)\[\*\], which operates on Node.js `Buffer`s instead of JavaScript's native `ArrayBuffer`.

This version should also have better performance as it does not copy the data, but rather returns `Uint8Array` views into the original `ArrayBuffer`.

\[\*\] which in turn is a fork of [freesoftwarefactory/parse-multipart](https://github.com/freesoftwarefactory/parse-multipart)


# Background

Sometimes you only have access to the raw multipart payload and it needs to be
parsed in order to extract the files or data contained on it. As an example,
if you have a Cloudflare Worker which is parsing a `multipart/form-data` POST
request, the request is provided as either a `ReadableStream` or a promise that
returns an `ArrayBuffer` - this library can operate on the latter.

Note that this means that the full contents of the body must be received by the
server and be loaded into memory.

The raw payload formatted as multipart/form-data will looks like this one:

```bash
------WebKitFormBoundaryDtbT5UpPj83kllfw
Content-Disposition: form-data; name="uploads[]"; filename="somebinary.dat"
Content-Type: application/octet-stream

some binary data...maybe the bits of a image..
------WebKitFormBoundaryDtbT5UpPj83kllfw
Content-Disposition: form-data; name="uploads[]"; filename="sometext.txt"
Content-Type: text/plain

hello how are you

------WebKitFormBoundaryDtbT5UpPj83kllfw
Content-Disposition: form-data; name="input1";

value1
------WebKitFormBoundaryDtbT5UpPj83kllfw--
```

The lines above represents a raw multipart/form-data payload sent by some
HTTP client via form submission containing two files and an input text with id `input1` and value `value1`. We need to extract everything contained inside it. The multipart format allows you to send more
than one file in the same payload, that's why it is called: multipart.

# Usage

In the next lines you can see a implementation. In this case two key values
needs to be present:

* body, which can be:

```bash
------WebKitFormBoundaryDtbT5UpPj83kllfw
Content-Disposition: form-data; name="uploads[]"; filename="sometext.txt"
Content-Type: application/octet-stream

hello how are you
------WebKitFormBoundaryDtbT5UpPj83kllfw--
```

* boundary, the string which serve as a 'separator' between parts, it normally
  comes to you via headers. In this case, the boundary is:

```bash
----WebKitFormBoundaryDtbT5UpPj83kllfw
```

Now, having this two key values then you can implement it:

```typescript
const multipart = require('parse-multipart-data');
const body = "..the multipart raw body..";
const boundary = "----WebKitFormBoundaryDtbT5UpPj83kllfw";
const parts = multipart.parse(body,boundary);

for (let i = 0; i < parts.length; i++) {
  const part = parts[i];
  // will be: { filename: 'A.txt', type: 'text/plain', data: <ArrayBuffer 41 41 41 41 42 42 42 42> }
}
```

The returned data is a `part` array with properties: `filename`, `type` and `data`. `data` is type of `Uint8Array`, which is backed by the original `ArrayBuffer` that was provided as input.
