(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["bitcoin-ef/bsv"] = {}));
})(this, (function (exports) { 'use strict';

  var global$1 = (typeof global !== "undefined" ? global :
    typeof self !== "undefined" ? self :
    typeof window !== "undefined" ? window : {});

  var lookup = [];
  var revLookup = [];
  var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array;
  var inited = false;
  function init () {
    inited = true;
    var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    for (var i = 0, len = code.length; i < len; ++i) {
      lookup[i] = code[i];
      revLookup[code.charCodeAt(i)] = i;
    }

    revLookup['-'.charCodeAt(0)] = 62;
    revLookup['_'.charCodeAt(0)] = 63;
  }

  function toByteArray (b64) {
    if (!inited) {
      init();
    }
    var i, j, l, tmp, placeHolders, arr;
    var len = b64.length;

    if (len % 4 > 0) {
      throw new Error('Invalid string. Length must be a multiple of 4')
    }

    // the number of equal signs (place holders)
    // if there are two placeholders, than the two characters before it
    // represent one byte
    // if there is only one, then the three characters before it represent 2 bytes
    // this is just a cheap hack to not do indexOf twice
    placeHolders = b64[len - 2] === '=' ? 2 : b64[len - 1] === '=' ? 1 : 0;

    // base64 is 4/3 + up to two characters of the original data
    arr = new Arr(len * 3 / 4 - placeHolders);

    // if there are placeholders, only get up to the last complete 4 chars
    l = placeHolders > 0 ? len - 4 : len;

    var L = 0;

    for (i = 0, j = 0; i < l; i += 4, j += 3) {
      tmp = (revLookup[b64.charCodeAt(i)] << 18) | (revLookup[b64.charCodeAt(i + 1)] << 12) | (revLookup[b64.charCodeAt(i + 2)] << 6) | revLookup[b64.charCodeAt(i + 3)];
      arr[L++] = (tmp >> 16) & 0xFF;
      arr[L++] = (tmp >> 8) & 0xFF;
      arr[L++] = tmp & 0xFF;
    }

    if (placeHolders === 2) {
      tmp = (revLookup[b64.charCodeAt(i)] << 2) | (revLookup[b64.charCodeAt(i + 1)] >> 4);
      arr[L++] = tmp & 0xFF;
    } else if (placeHolders === 1) {
      tmp = (revLookup[b64.charCodeAt(i)] << 10) | (revLookup[b64.charCodeAt(i + 1)] << 4) | (revLookup[b64.charCodeAt(i + 2)] >> 2);
      arr[L++] = (tmp >> 8) & 0xFF;
      arr[L++] = tmp & 0xFF;
    }

    return arr
  }

  function tripletToBase64 (num) {
    return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F]
  }

  function encodeChunk (uint8, start, end) {
    var tmp;
    var output = [];
    for (var i = start; i < end; i += 3) {
      tmp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2]);
      output.push(tripletToBase64(tmp));
    }
    return output.join('')
  }

  function fromByteArray (uint8) {
    if (!inited) {
      init();
    }
    var tmp;
    var len = uint8.length;
    var extraBytes = len % 3; // if we have 1 byte left, pad 2 bytes
    var output = '';
    var parts = [];
    var maxChunkLength = 16383; // must be multiple of 3

    // go through the array every three bytes, we'll deal with trailing stuff later
    for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
      parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)));
    }

    // pad the end with zeros, but make sure to not forget the extra bytes
    if (extraBytes === 1) {
      tmp = uint8[len - 1];
      output += lookup[tmp >> 2];
      output += lookup[(tmp << 4) & 0x3F];
      output += '==';
    } else if (extraBytes === 2) {
      tmp = (uint8[len - 2] << 8) + (uint8[len - 1]);
      output += lookup[tmp >> 10];
      output += lookup[(tmp >> 4) & 0x3F];
      output += lookup[(tmp << 2) & 0x3F];
      output += '=';
    }

    parts.push(output);

    return parts.join('')
  }

  function read (buffer, offset, isLE, mLen, nBytes) {
    var e, m;
    var eLen = nBytes * 8 - mLen - 1;
    var eMax = (1 << eLen) - 1;
    var eBias = eMax >> 1;
    var nBits = -7;
    var i = isLE ? (nBytes - 1) : 0;
    var d = isLE ? -1 : 1;
    var s = buffer[offset + i];

    i += d;

    e = s & ((1 << (-nBits)) - 1);
    s >>= (-nBits);
    nBits += eLen;
    for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

    m = e & ((1 << (-nBits)) - 1);
    e >>= (-nBits);
    nBits += mLen;
    for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

    if (e === 0) {
      e = 1 - eBias;
    } else if (e === eMax) {
      return m ? NaN : ((s ? -1 : 1) * Infinity)
    } else {
      m = m + Math.pow(2, mLen);
      e = e - eBias;
    }
    return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
  }

  function write (buffer, value, offset, isLE, mLen, nBytes) {
    var e, m, c;
    var eLen = nBytes * 8 - mLen - 1;
    var eMax = (1 << eLen) - 1;
    var eBias = eMax >> 1;
    var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0);
    var i = isLE ? 0 : (nBytes - 1);
    var d = isLE ? 1 : -1;
    var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

    value = Math.abs(value);

    if (isNaN(value) || value === Infinity) {
      m = isNaN(value) ? 1 : 0;
      e = eMax;
    } else {
      e = Math.floor(Math.log(value) / Math.LN2);
      if (value * (c = Math.pow(2, -e)) < 1) {
        e--;
        c *= 2;
      }
      if (e + eBias >= 1) {
        value += rt / c;
      } else {
        value += rt * Math.pow(2, 1 - eBias);
      }
      if (value * c >= 2) {
        e++;
        c /= 2;
      }

      if (e + eBias >= eMax) {
        m = 0;
        e = eMax;
      } else if (e + eBias >= 1) {
        m = (value * c - 1) * Math.pow(2, mLen);
        e = e + eBias;
      } else {
        m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
        e = 0;
      }
    }

    for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

    e = (e << mLen) | m;
    eLen += mLen;
    for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

    buffer[offset + i - d] |= s * 128;
  }

  var toString = {}.toString;

  var isArray$1 = Array.isArray || function (arr) {
    return toString.call(arr) == '[object Array]';
  };

  /*!
   * The buffer module from node.js, for the browser.
   *
   * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
   * @license  MIT
   */

  var INSPECT_MAX_BYTES = 50;

  /**
   * If `Buffer.TYPED_ARRAY_SUPPORT`:
   *   === true    Use Uint8Array implementation (fastest)
   *   === false   Use Object implementation (most compatible, even IE6)
   *
   * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
   * Opera 11.6+, iOS 4.2+.
   *
   * Due to various browser bugs, sometimes the Object implementation will be used even
   * when the browser supports typed arrays.
   *
   * Note:
   *
   *   - Firefox 4-29 lacks support for adding new properties to `Uint8Array` instances,
   *     See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
   *
   *   - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
   *
   *   - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
   *     incorrect length in some situations.

   * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they
   * get the Object implementation, which is slower but behaves correctly.
   */
  Buffer$1.TYPED_ARRAY_SUPPORT = global$1.TYPED_ARRAY_SUPPORT !== undefined
    ? global$1.TYPED_ARRAY_SUPPORT
    : true;

  /*
   * Export kMaxLength after typed array support is determined.
   */
  var _kMaxLength = kMaxLength();

  function kMaxLength () {
    return Buffer$1.TYPED_ARRAY_SUPPORT
      ? 0x7fffffff
      : 0x3fffffff
  }

  function createBuffer (that, length) {
    if (kMaxLength() < length) {
      throw new RangeError('Invalid typed array length')
    }
    if (Buffer$1.TYPED_ARRAY_SUPPORT) {
      // Return an augmented `Uint8Array` instance, for best performance
      that = new Uint8Array(length);
      that.__proto__ = Buffer$1.prototype;
    } else {
      // Fallback: Return an object instance of the Buffer class
      if (that === null) {
        that = new Buffer$1(length);
      }
      that.length = length;
    }

    return that
  }

  /**
   * The Buffer constructor returns instances of `Uint8Array` that have their
   * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
   * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
   * and the `Uint8Array` methods. Square bracket notation works as expected -- it
   * returns a single octet.
   *
   * The `Uint8Array` prototype remains unmodified.
   */

  function Buffer$1 (arg, encodingOrOffset, length) {
    if (!Buffer$1.TYPED_ARRAY_SUPPORT && !(this instanceof Buffer$1)) {
      return new Buffer$1(arg, encodingOrOffset, length)
    }

    // Common case.
    if (typeof arg === 'number') {
      if (typeof encodingOrOffset === 'string') {
        throw new Error(
          'If encoding is specified then the first argument must be a string'
        )
      }
      return allocUnsafe(this, arg)
    }
    return from(this, arg, encodingOrOffset, length)
  }

  Buffer$1.poolSize = 8192; // not used by this implementation

  // TODO: Legacy, not needed anymore. Remove in next major version.
  Buffer$1._augment = function (arr) {
    arr.__proto__ = Buffer$1.prototype;
    return arr
  };

  function from (that, value, encodingOrOffset, length) {
    if (typeof value === 'number') {
      throw new TypeError('"value" argument must not be a number')
    }

    if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
      return fromArrayBuffer(that, value, encodingOrOffset, length)
    }

    if (typeof value === 'string') {
      return fromString(that, value, encodingOrOffset)
    }

    return fromObject(that, value)
  }

  /**
   * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
   * if value is a number.
   * Buffer.from(str[, encoding])
   * Buffer.from(array)
   * Buffer.from(buffer)
   * Buffer.from(arrayBuffer[, byteOffset[, length]])
   **/
  Buffer$1.from = function (value, encodingOrOffset, length) {
    return from(null, value, encodingOrOffset, length)
  };

  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
    Buffer$1.prototype.__proto__ = Uint8Array.prototype;
    Buffer$1.__proto__ = Uint8Array;
  }

  function assertSize (size) {
    if (typeof size !== 'number') {
      throw new TypeError('"size" argument must be a number')
    } else if (size < 0) {
      throw new RangeError('"size" argument must not be negative')
    }
  }

  function alloc (that, size, fill, encoding) {
    assertSize(size);
    if (size <= 0) {
      return createBuffer(that, size)
    }
    if (fill !== undefined) {
      // Only pay attention to encoding if it's a string. This
      // prevents accidentally sending in a number that would
      // be interpretted as a start offset.
      return typeof encoding === 'string'
        ? createBuffer(that, size).fill(fill, encoding)
        : createBuffer(that, size).fill(fill)
    }
    return createBuffer(that, size)
  }

  /**
   * Creates a new filled Buffer instance.
   * alloc(size[, fill[, encoding]])
   **/
  Buffer$1.alloc = function (size, fill, encoding) {
    return alloc(null, size, fill, encoding)
  };

  function allocUnsafe (that, size) {
    assertSize(size);
    that = createBuffer(that, size < 0 ? 0 : checked(size) | 0);
    if (!Buffer$1.TYPED_ARRAY_SUPPORT) {
      for (var i = 0; i < size; ++i) {
        that[i] = 0;
      }
    }
    return that
  }

  /**
   * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
   * */
  Buffer$1.allocUnsafe = function (size) {
    return allocUnsafe(null, size)
  };
  /**
   * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
   */
  Buffer$1.allocUnsafeSlow = function (size) {
    return allocUnsafe(null, size)
  };

  function fromString (that, string, encoding) {
    if (typeof encoding !== 'string' || encoding === '') {
      encoding = 'utf8';
    }

    if (!Buffer$1.isEncoding(encoding)) {
      throw new TypeError('"encoding" must be a valid string encoding')
    }

    var length = byteLength(string, encoding) | 0;
    that = createBuffer(that, length);

    var actual = that.write(string, encoding);

    if (actual !== length) {
      // Writing a hex string, for example, that contains invalid characters will
      // cause everything after the first invalid character to be ignored. (e.g.
      // 'abxxcd' will be treated as 'ab')
      that = that.slice(0, actual);
    }

    return that
  }

  function fromArrayLike (that, array) {
    var length = array.length < 0 ? 0 : checked(array.length) | 0;
    that = createBuffer(that, length);
    for (var i = 0; i < length; i += 1) {
      that[i] = array[i] & 255;
    }
    return that
  }

  function fromArrayBuffer (that, array, byteOffset, length) {
    array.byteLength; // this throws if `array` is not a valid ArrayBuffer

    if (byteOffset < 0 || array.byteLength < byteOffset) {
      throw new RangeError('\'offset\' is out of bounds')
    }

    if (array.byteLength < byteOffset + (length || 0)) {
      throw new RangeError('\'length\' is out of bounds')
    }

    if (byteOffset === undefined && length === undefined) {
      array = new Uint8Array(array);
    } else if (length === undefined) {
      array = new Uint8Array(array, byteOffset);
    } else {
      array = new Uint8Array(array, byteOffset, length);
    }

    if (Buffer$1.TYPED_ARRAY_SUPPORT) {
      // Return an augmented `Uint8Array` instance, for best performance
      that = array;
      that.__proto__ = Buffer$1.prototype;
    } else {
      // Fallback: Return an object instance of the Buffer class
      that = fromArrayLike(that, array);
    }
    return that
  }

  function fromObject (that, obj) {
    if (internalIsBuffer(obj)) {
      var len = checked(obj.length) | 0;
      that = createBuffer(that, len);

      if (that.length === 0) {
        return that
      }

      obj.copy(that, 0, 0, len);
      return that
    }

    if (obj) {
      if ((typeof ArrayBuffer !== 'undefined' &&
          obj.buffer instanceof ArrayBuffer) || 'length' in obj) {
        if (typeof obj.length !== 'number' || isnan(obj.length)) {
          return createBuffer(that, 0)
        }
        return fromArrayLike(that, obj)
      }

      if (obj.type === 'Buffer' && isArray$1(obj.data)) {
        return fromArrayLike(that, obj.data)
      }
    }

    throw new TypeError('First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.')
  }

  function checked (length) {
    // Note: cannot use `length < kMaxLength()` here because that fails when
    // length is NaN (which is otherwise coerced to zero.)
    if (length >= kMaxLength()) {
      throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                           'size: 0x' + kMaxLength().toString(16) + ' bytes')
    }
    return length | 0
  }

  function SlowBuffer (length) {
    if (+length != length) { // eslint-disable-line eqeqeq
      length = 0;
    }
    return Buffer$1.alloc(+length)
  }
  Buffer$1.isBuffer = isBuffer$1;
  function internalIsBuffer (b) {
    return !!(b != null && b._isBuffer)
  }

  Buffer$1.compare = function compare (a, b) {
    if (!internalIsBuffer(a) || !internalIsBuffer(b)) {
      throw new TypeError('Arguments must be Buffers')
    }

    if (a === b) return 0

    var x = a.length;
    var y = b.length;

    for (var i = 0, len = Math.min(x, y); i < len; ++i) {
      if (a[i] !== b[i]) {
        x = a[i];
        y = b[i];
        break
      }
    }

    if (x < y) return -1
    if (y < x) return 1
    return 0
  };

  Buffer$1.isEncoding = function isEncoding (encoding) {
    switch (String(encoding).toLowerCase()) {
      case 'hex':
      case 'utf8':
      case 'utf-8':
      case 'ascii':
      case 'latin1':
      case 'binary':
      case 'base64':
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return true
      default:
        return false
    }
  };

  Buffer$1.concat = function concat (list, length) {
    if (!isArray$1(list)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }

    if (list.length === 0) {
      return Buffer$1.alloc(0)
    }

    var i;
    if (length === undefined) {
      length = 0;
      for (i = 0; i < list.length; ++i) {
        length += list[i].length;
      }
    }

    var buffer = Buffer$1.allocUnsafe(length);
    var pos = 0;
    for (i = 0; i < list.length; ++i) {
      var buf = list[i];
      if (!internalIsBuffer(buf)) {
        throw new TypeError('"list" argument must be an Array of Buffers')
      }
      buf.copy(buffer, pos);
      pos += buf.length;
    }
    return buffer
  };

  function byteLength (string, encoding) {
    if (internalIsBuffer(string)) {
      return string.length
    }
    if (typeof ArrayBuffer !== 'undefined' && typeof ArrayBuffer.isView === 'function' &&
        (ArrayBuffer.isView(string) || string instanceof ArrayBuffer)) {
      return string.byteLength
    }
    if (typeof string !== 'string') {
      string = '' + string;
    }

    var len = string.length;
    if (len === 0) return 0

    // Use a for loop to avoid recursion
    var loweredCase = false;
    for (;;) {
      switch (encoding) {
        case 'ascii':
        case 'latin1':
        case 'binary':
          return len
        case 'utf8':
        case 'utf-8':
        case undefined:
          return utf8ToBytes(string).length
        case 'ucs2':
        case 'ucs-2':
        case 'utf16le':
        case 'utf-16le':
          return len * 2
        case 'hex':
          return len >>> 1
        case 'base64':
          return base64ToBytes(string).length
        default:
          if (loweredCase) return utf8ToBytes(string).length // assume utf8
          encoding = ('' + encoding).toLowerCase();
          loweredCase = true;
      }
    }
  }
  Buffer$1.byteLength = byteLength;

  function slowToString (encoding, start, end) {
    var loweredCase = false;

    // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
    // property of a typed array.

    // This behaves neither like String nor Uint8Array in that we set start/end
    // to their upper/lower bounds if the value passed is out of range.
    // undefined is handled specially as per ECMA-262 6th Edition,
    // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
    if (start === undefined || start < 0) {
      start = 0;
    }
    // Return early if start > this.length. Done here to prevent potential uint32
    // coercion fail below.
    if (start > this.length) {
      return ''
    }

    if (end === undefined || end > this.length) {
      end = this.length;
    }

    if (end <= 0) {
      return ''
    }

    // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
    end >>>= 0;
    start >>>= 0;

    if (end <= start) {
      return ''
    }

    if (!encoding) encoding = 'utf8';

    while (true) {
      switch (encoding) {
        case 'hex':
          return hexSlice(this, start, end)

        case 'utf8':
        case 'utf-8':
          return utf8Slice(this, start, end)

        case 'ascii':
          return asciiSlice(this, start, end)

        case 'latin1':
        case 'binary':
          return latin1Slice(this, start, end)

        case 'base64':
          return base64Slice(this, start, end)

        case 'ucs2':
        case 'ucs-2':
        case 'utf16le':
        case 'utf-16le':
          return utf16leSlice(this, start, end)

        default:
          if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
          encoding = (encoding + '').toLowerCase();
          loweredCase = true;
      }
    }
  }

  // The property is used by `Buffer.isBuffer` and `is-buffer` (in Safari 5-7) to detect
  // Buffer instances.
  Buffer$1.prototype._isBuffer = true;

  function swap (b, n, m) {
    var i = b[n];
    b[n] = b[m];
    b[m] = i;
  }

  Buffer$1.prototype.swap16 = function swap16 () {
    var len = this.length;
    if (len % 2 !== 0) {
      throw new RangeError('Buffer size must be a multiple of 16-bits')
    }
    for (var i = 0; i < len; i += 2) {
      swap(this, i, i + 1);
    }
    return this
  };

  Buffer$1.prototype.swap32 = function swap32 () {
    var len = this.length;
    if (len % 4 !== 0) {
      throw new RangeError('Buffer size must be a multiple of 32-bits')
    }
    for (var i = 0; i < len; i += 4) {
      swap(this, i, i + 3);
      swap(this, i + 1, i + 2);
    }
    return this
  };

  Buffer$1.prototype.swap64 = function swap64 () {
    var len = this.length;
    if (len % 8 !== 0) {
      throw new RangeError('Buffer size must be a multiple of 64-bits')
    }
    for (var i = 0; i < len; i += 8) {
      swap(this, i, i + 7);
      swap(this, i + 1, i + 6);
      swap(this, i + 2, i + 5);
      swap(this, i + 3, i + 4);
    }
    return this
  };

  Buffer$1.prototype.toString = function toString () {
    var length = this.length | 0;
    if (length === 0) return ''
    if (arguments.length === 0) return utf8Slice(this, 0, length)
    return slowToString.apply(this, arguments)
  };

  Buffer$1.prototype.equals = function equals (b) {
    if (!internalIsBuffer(b)) throw new TypeError('Argument must be a Buffer')
    if (this === b) return true
    return Buffer$1.compare(this, b) === 0
  };

  Buffer$1.prototype.inspect = function inspect () {
    var str = '';
    var max = INSPECT_MAX_BYTES;
    if (this.length > 0) {
      str = this.toString('hex', 0, max).match(/.{2}/g).join(' ');
      if (this.length > max) str += ' ... ';
    }
    return '<Buffer ' + str + '>'
  };

  Buffer$1.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
    if (!internalIsBuffer(target)) {
      throw new TypeError('Argument must be a Buffer')
    }

    if (start === undefined) {
      start = 0;
    }
    if (end === undefined) {
      end = target ? target.length : 0;
    }
    if (thisStart === undefined) {
      thisStart = 0;
    }
    if (thisEnd === undefined) {
      thisEnd = this.length;
    }

    if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
      throw new RangeError('out of range index')
    }

    if (thisStart >= thisEnd && start >= end) {
      return 0
    }
    if (thisStart >= thisEnd) {
      return -1
    }
    if (start >= end) {
      return 1
    }

    start >>>= 0;
    end >>>= 0;
    thisStart >>>= 0;
    thisEnd >>>= 0;

    if (this === target) return 0

    var x = thisEnd - thisStart;
    var y = end - start;
    var len = Math.min(x, y);

    var thisCopy = this.slice(thisStart, thisEnd);
    var targetCopy = target.slice(start, end);

    for (var i = 0; i < len; ++i) {
      if (thisCopy[i] !== targetCopy[i]) {
        x = thisCopy[i];
        y = targetCopy[i];
        break
      }
    }

    if (x < y) return -1
    if (y < x) return 1
    return 0
  };

  // Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
  // OR the last index of `val` in `buffer` at offset <= `byteOffset`.
  //
  // Arguments:
  // - buffer - a Buffer to search
  // - val - a string, Buffer, or number
  // - byteOffset - an index into `buffer`; will be clamped to an int32
  // - encoding - an optional encoding, relevant is val is a string
  // - dir - true for indexOf, false for lastIndexOf
  function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
    // Empty buffer means no match
    if (buffer.length === 0) return -1

    // Normalize byteOffset
    if (typeof byteOffset === 'string') {
      encoding = byteOffset;
      byteOffset = 0;
    } else if (byteOffset > 0x7fffffff) {
      byteOffset = 0x7fffffff;
    } else if (byteOffset < -0x80000000) {
      byteOffset = -0x80000000;
    }
    byteOffset = +byteOffset;  // Coerce to Number.
    if (isNaN(byteOffset)) {
      // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
      byteOffset = dir ? 0 : (buffer.length - 1);
    }

    // Normalize byteOffset: negative offsets start from the end of the buffer
    if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
    if (byteOffset >= buffer.length) {
      if (dir) return -1
      else byteOffset = buffer.length - 1;
    } else if (byteOffset < 0) {
      if (dir) byteOffset = 0;
      else return -1
    }

    // Normalize val
    if (typeof val === 'string') {
      val = Buffer$1.from(val, encoding);
    }

    // Finally, search either indexOf (if dir is true) or lastIndexOf
    if (internalIsBuffer(val)) {
      // Special case: looking for empty string/buffer always fails
      if (val.length === 0) {
        return -1
      }
      return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
    } else if (typeof val === 'number') {
      val = val & 0xFF; // Search for a byte value [0-255]
      if (Buffer$1.TYPED_ARRAY_SUPPORT &&
          typeof Uint8Array.prototype.indexOf === 'function') {
        if (dir) {
          return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
        } else {
          return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
        }
      }
      return arrayIndexOf(buffer, [ val ], byteOffset, encoding, dir)
    }

    throw new TypeError('val must be string, number or Buffer')
  }

  function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
    var indexSize = 1;
    var arrLength = arr.length;
    var valLength = val.length;

    if (encoding !== undefined) {
      encoding = String(encoding).toLowerCase();
      if (encoding === 'ucs2' || encoding === 'ucs-2' ||
          encoding === 'utf16le' || encoding === 'utf-16le') {
        if (arr.length < 2 || val.length < 2) {
          return -1
        }
        indexSize = 2;
        arrLength /= 2;
        valLength /= 2;
        byteOffset /= 2;
      }
    }

    function read (buf, i) {
      if (indexSize === 1) {
        return buf[i]
      } else {
        return buf.readUInt16BE(i * indexSize)
      }
    }

    var i;
    if (dir) {
      var foundIndex = -1;
      for (i = byteOffset; i < arrLength; i++) {
        if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
          if (foundIndex === -1) foundIndex = i;
          if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
        } else {
          if (foundIndex !== -1) i -= i - foundIndex;
          foundIndex = -1;
        }
      }
    } else {
      if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
      for (i = byteOffset; i >= 0; i--) {
        var found = true;
        for (var j = 0; j < valLength; j++) {
          if (read(arr, i + j) !== read(val, j)) {
            found = false;
            break
          }
        }
        if (found) return i
      }
    }

    return -1
  }

  Buffer$1.prototype.includes = function includes (val, byteOffset, encoding) {
    return this.indexOf(val, byteOffset, encoding) !== -1
  };

  Buffer$1.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
    return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
  };

  Buffer$1.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
    return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
  };

  function hexWrite (buf, string, offset, length) {
    offset = Number(offset) || 0;
    var remaining = buf.length - offset;
    if (!length) {
      length = remaining;
    } else {
      length = Number(length);
      if (length > remaining) {
        length = remaining;
      }
    }

    // must be an even number of digits
    var strLen = string.length;
    if (strLen % 2 !== 0) throw new TypeError('Invalid hex string')

    if (length > strLen / 2) {
      length = strLen / 2;
    }
    for (var i = 0; i < length; ++i) {
      var parsed = parseInt(string.substr(i * 2, 2), 16);
      if (isNaN(parsed)) return i
      buf[offset + i] = parsed;
    }
    return i
  }

  function utf8Write (buf, string, offset, length) {
    return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
  }

  function asciiWrite (buf, string, offset, length) {
    return blitBuffer(asciiToBytes(string), buf, offset, length)
  }

  function latin1Write (buf, string, offset, length) {
    return asciiWrite(buf, string, offset, length)
  }

  function base64Write (buf, string, offset, length) {
    return blitBuffer(base64ToBytes(string), buf, offset, length)
  }

  function ucs2Write (buf, string, offset, length) {
    return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
  }

  Buffer$1.prototype.write = function write (string, offset, length, encoding) {
    // Buffer#write(string)
    if (offset === undefined) {
      encoding = 'utf8';
      length = this.length;
      offset = 0;
    // Buffer#write(string, encoding)
    } else if (length === undefined && typeof offset === 'string') {
      encoding = offset;
      length = this.length;
      offset = 0;
    // Buffer#write(string, offset[, length][, encoding])
    } else if (isFinite(offset)) {
      offset = offset | 0;
      if (isFinite(length)) {
        length = length | 0;
        if (encoding === undefined) encoding = 'utf8';
      } else {
        encoding = length;
        length = undefined;
      }
    // legacy write(string, encoding, offset, length) - remove in v0.13
    } else {
      throw new Error(
        'Buffer.write(string, encoding, offset[, length]) is no longer supported'
      )
    }

    var remaining = this.length - offset;
    if (length === undefined || length > remaining) length = remaining;

    if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
      throw new RangeError('Attempt to write outside buffer bounds')
    }

    if (!encoding) encoding = 'utf8';

    var loweredCase = false;
    for (;;) {
      switch (encoding) {
        case 'hex':
          return hexWrite(this, string, offset, length)

        case 'utf8':
        case 'utf-8':
          return utf8Write(this, string, offset, length)

        case 'ascii':
          return asciiWrite(this, string, offset, length)

        case 'latin1':
        case 'binary':
          return latin1Write(this, string, offset, length)

        case 'base64':
          // Warning: maxLength not taken into account in base64Write
          return base64Write(this, string, offset, length)

        case 'ucs2':
        case 'ucs-2':
        case 'utf16le':
        case 'utf-16le':
          return ucs2Write(this, string, offset, length)

        default:
          if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
          encoding = ('' + encoding).toLowerCase();
          loweredCase = true;
      }
    }
  };

  Buffer$1.prototype.toJSON = function toJSON () {
    return {
      type: 'Buffer',
      data: Array.prototype.slice.call(this._arr || this, 0)
    }
  };

  function base64Slice (buf, start, end) {
    if (start === 0 && end === buf.length) {
      return fromByteArray(buf)
    } else {
      return fromByteArray(buf.slice(start, end))
    }
  }

  function utf8Slice (buf, start, end) {
    end = Math.min(buf.length, end);
    var res = [];

    var i = start;
    while (i < end) {
      var firstByte = buf[i];
      var codePoint = null;
      var bytesPerSequence = (firstByte > 0xEF) ? 4
        : (firstByte > 0xDF) ? 3
        : (firstByte > 0xBF) ? 2
        : 1;

      if (i + bytesPerSequence <= end) {
        var secondByte, thirdByte, fourthByte, tempCodePoint;

        switch (bytesPerSequence) {
          case 1:
            if (firstByte < 0x80) {
              codePoint = firstByte;
            }
            break
          case 2:
            secondByte = buf[i + 1];
            if ((secondByte & 0xC0) === 0x80) {
              tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F);
              if (tempCodePoint > 0x7F) {
                codePoint = tempCodePoint;
              }
            }
            break
          case 3:
            secondByte = buf[i + 1];
            thirdByte = buf[i + 2];
            if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
              tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F);
              if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
                codePoint = tempCodePoint;
              }
            }
            break
          case 4:
            secondByte = buf[i + 1];
            thirdByte = buf[i + 2];
            fourthByte = buf[i + 3];
            if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
              tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F);
              if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
                codePoint = tempCodePoint;
              }
            }
        }
      }

      if (codePoint === null) {
        // we did not generate a valid codePoint so insert a
        // replacement char (U+FFFD) and advance only 1 byte
        codePoint = 0xFFFD;
        bytesPerSequence = 1;
      } else if (codePoint > 0xFFFF) {
        // encode to utf16 (surrogate pair dance)
        codePoint -= 0x10000;
        res.push(codePoint >>> 10 & 0x3FF | 0xD800);
        codePoint = 0xDC00 | codePoint & 0x3FF;
      }

      res.push(codePoint);
      i += bytesPerSequence;
    }

    return decodeCodePointsArray(res)
  }

  // Based on http://stackoverflow.com/a/22747272/680742, the browser with
  // the lowest limit is Chrome, with 0x10000 args.
  // We go 1 magnitude less, for safety
  var MAX_ARGUMENTS_LENGTH = 0x1000;

  function decodeCodePointsArray (codePoints) {
    var len = codePoints.length;
    if (len <= MAX_ARGUMENTS_LENGTH) {
      return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
    }

    // Decode in chunks to avoid "call stack size exceeded".
    var res = '';
    var i = 0;
    while (i < len) {
      res += String.fromCharCode.apply(
        String,
        codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
      );
    }
    return res
  }

  function asciiSlice (buf, start, end) {
    var ret = '';
    end = Math.min(buf.length, end);

    for (var i = start; i < end; ++i) {
      ret += String.fromCharCode(buf[i] & 0x7F);
    }
    return ret
  }

  function latin1Slice (buf, start, end) {
    var ret = '';
    end = Math.min(buf.length, end);

    for (var i = start; i < end; ++i) {
      ret += String.fromCharCode(buf[i]);
    }
    return ret
  }

  function hexSlice (buf, start, end) {
    var len = buf.length;

    if (!start || start < 0) start = 0;
    if (!end || end < 0 || end > len) end = len;

    var out = '';
    for (var i = start; i < end; ++i) {
      out += toHex$1(buf[i]);
    }
    return out
  }

  function utf16leSlice (buf, start, end) {
    var bytes = buf.slice(start, end);
    var res = '';
    for (var i = 0; i < bytes.length; i += 2) {
      res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256);
    }
    return res
  }

  Buffer$1.prototype.slice = function slice (start, end) {
    var len = this.length;
    start = ~~start;
    end = end === undefined ? len : ~~end;

    if (start < 0) {
      start += len;
      if (start < 0) start = 0;
    } else if (start > len) {
      start = len;
    }

    if (end < 0) {
      end += len;
      if (end < 0) end = 0;
    } else if (end > len) {
      end = len;
    }

    if (end < start) end = start;

    var newBuf;
    if (Buffer$1.TYPED_ARRAY_SUPPORT) {
      newBuf = this.subarray(start, end);
      newBuf.__proto__ = Buffer$1.prototype;
    } else {
      var sliceLen = end - start;
      newBuf = new Buffer$1(sliceLen, undefined);
      for (var i = 0; i < sliceLen; ++i) {
        newBuf[i] = this[i + start];
      }
    }

    return newBuf
  };

  /*
   * Need to make sure that buffer isn't trying to write out of bounds.
   */
  function checkOffset (offset, ext, length) {
    if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
    if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
  }

  Buffer$1.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) checkOffset(offset, byteLength, this.length);

    var val = this[offset];
    var mul = 1;
    var i = 0;
    while (++i < byteLength && (mul *= 0x100)) {
      val += this[offset + i] * mul;
    }

    return val
  };

  Buffer$1.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) {
      checkOffset(offset, byteLength, this.length);
    }

    var val = this[offset + --byteLength];
    var mul = 1;
    while (byteLength > 0 && (mul *= 0x100)) {
      val += this[offset + --byteLength] * mul;
    }

    return val
  };

  Buffer$1.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 1, this.length);
    return this[offset]
  };

  Buffer$1.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 2, this.length);
    return this[offset] | (this[offset + 1] << 8)
  };

  Buffer$1.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 2, this.length);
    return (this[offset] << 8) | this[offset + 1]
  };

  Buffer$1.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length);

    return ((this[offset]) |
        (this[offset + 1] << 8) |
        (this[offset + 2] << 16)) +
        (this[offset + 3] * 0x1000000)
  };

  Buffer$1.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length);

    return (this[offset] * 0x1000000) +
      ((this[offset + 1] << 16) |
      (this[offset + 2] << 8) |
      this[offset + 3])
  };

  Buffer$1.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) checkOffset(offset, byteLength, this.length);

    var val = this[offset];
    var mul = 1;
    var i = 0;
    while (++i < byteLength && (mul *= 0x100)) {
      val += this[offset + i] * mul;
    }
    mul *= 0x80;

    if (val >= mul) val -= Math.pow(2, 8 * byteLength);

    return val
  };

  Buffer$1.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) checkOffset(offset, byteLength, this.length);

    var i = byteLength;
    var mul = 1;
    var val = this[offset + --i];
    while (i > 0 && (mul *= 0x100)) {
      val += this[offset + --i] * mul;
    }
    mul *= 0x80;

    if (val >= mul) val -= Math.pow(2, 8 * byteLength);

    return val
  };

  Buffer$1.prototype.readInt8 = function readInt8 (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 1, this.length);
    if (!(this[offset] & 0x80)) return (this[offset])
    return ((0xff - this[offset] + 1) * -1)
  };

  Buffer$1.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 2, this.length);
    var val = this[offset] | (this[offset + 1] << 8);
    return (val & 0x8000) ? val | 0xFFFF0000 : val
  };

  Buffer$1.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 2, this.length);
    var val = this[offset + 1] | (this[offset] << 8);
    return (val & 0x8000) ? val | 0xFFFF0000 : val
  };

  Buffer$1.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length);

    return (this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16) |
      (this[offset + 3] << 24)
  };

  Buffer$1.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length);

    return (this[offset] << 24) |
      (this[offset + 1] << 16) |
      (this[offset + 2] << 8) |
      (this[offset + 3])
  };

  Buffer$1.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length);
    return read(this, offset, true, 23, 4)
  };

  Buffer$1.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 4, this.length);
    return read(this, offset, false, 23, 4)
  };

  Buffer$1.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 8, this.length);
    return read(this, offset, true, 52, 8)
  };

  Buffer$1.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
    if (!noAssert) checkOffset(offset, 8, this.length);
    return read(this, offset, false, 52, 8)
  };

  function checkInt (buf, value, offset, ext, max, min) {
    if (!internalIsBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
    if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
    if (offset + ext > buf.length) throw new RangeError('Index out of range')
  }

  Buffer$1.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
    value = +value;
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) {
      var maxBytes = Math.pow(2, 8 * byteLength) - 1;
      checkInt(this, value, offset, byteLength, maxBytes, 0);
    }

    var mul = 1;
    var i = 0;
    this[offset] = value & 0xFF;
    while (++i < byteLength && (mul *= 0x100)) {
      this[offset + i] = (value / mul) & 0xFF;
    }

    return offset + byteLength
  };

  Buffer$1.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
    value = +value;
    offset = offset | 0;
    byteLength = byteLength | 0;
    if (!noAssert) {
      var maxBytes = Math.pow(2, 8 * byteLength) - 1;
      checkInt(this, value, offset, byteLength, maxBytes, 0);
    }

    var i = byteLength - 1;
    var mul = 1;
    this[offset + i] = value & 0xFF;
    while (--i >= 0 && (mul *= 0x100)) {
      this[offset + i] = (value / mul) & 0xFF;
    }

    return offset + byteLength
  };

  Buffer$1.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0);
    if (!Buffer$1.TYPED_ARRAY_SUPPORT) value = Math.floor(value);
    this[offset] = (value & 0xff);
    return offset + 1
  };

  function objectWriteUInt16 (buf, value, offset, littleEndian) {
    if (value < 0) value = 0xffff + value + 1;
    for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; ++i) {
      buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
        (littleEndian ? i : 1 - i) * 8;
    }
  }

  Buffer$1.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
    if (Buffer$1.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value & 0xff);
      this[offset + 1] = (value >>> 8);
    } else {
      objectWriteUInt16(this, value, offset, true);
    }
    return offset + 2
  };

  Buffer$1.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
    if (Buffer$1.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value >>> 8);
      this[offset + 1] = (value & 0xff);
    } else {
      objectWriteUInt16(this, value, offset, false);
    }
    return offset + 2
  };

  function objectWriteUInt32 (buf, value, offset, littleEndian) {
    if (value < 0) value = 0xffffffff + value + 1;
    for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; ++i) {
      buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff;
    }
  }

  Buffer$1.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
    if (Buffer$1.TYPED_ARRAY_SUPPORT) {
      this[offset + 3] = (value >>> 24);
      this[offset + 2] = (value >>> 16);
      this[offset + 1] = (value >>> 8);
      this[offset] = (value & 0xff);
    } else {
      objectWriteUInt32(this, value, offset, true);
    }
    return offset + 4
  };

  Buffer$1.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
    if (Buffer$1.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value >>> 24);
      this[offset + 1] = (value >>> 16);
      this[offset + 2] = (value >>> 8);
      this[offset + 3] = (value & 0xff);
    } else {
      objectWriteUInt32(this, value, offset, false);
    }
    return offset + 4
  };

  Buffer$1.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) {
      var limit = Math.pow(2, 8 * byteLength - 1);

      checkInt(this, value, offset, byteLength, limit - 1, -limit);
    }

    var i = 0;
    var mul = 1;
    var sub = 0;
    this[offset] = value & 0xFF;
    while (++i < byteLength && (mul *= 0x100)) {
      if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
        sub = 1;
      }
      this[offset + i] = ((value / mul) >> 0) - sub & 0xFF;
    }

    return offset + byteLength
  };

  Buffer$1.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) {
      var limit = Math.pow(2, 8 * byteLength - 1);

      checkInt(this, value, offset, byteLength, limit - 1, -limit);
    }

    var i = byteLength - 1;
    var mul = 1;
    var sub = 0;
    this[offset + i] = value & 0xFF;
    while (--i >= 0 && (mul *= 0x100)) {
      if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
        sub = 1;
      }
      this[offset + i] = ((value / mul) >> 0) - sub & 0xFF;
    }

    return offset + byteLength
  };

  Buffer$1.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80);
    if (!Buffer$1.TYPED_ARRAY_SUPPORT) value = Math.floor(value);
    if (value < 0) value = 0xff + value + 1;
    this[offset] = (value & 0xff);
    return offset + 1
  };

  Buffer$1.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000);
    if (Buffer$1.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value & 0xff);
      this[offset + 1] = (value >>> 8);
    } else {
      objectWriteUInt16(this, value, offset, true);
    }
    return offset + 2
  };

  Buffer$1.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000);
    if (Buffer$1.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value >>> 8);
      this[offset + 1] = (value & 0xff);
    } else {
      objectWriteUInt16(this, value, offset, false);
    }
    return offset + 2
  };

  Buffer$1.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000);
    if (Buffer$1.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value & 0xff);
      this[offset + 1] = (value >>> 8);
      this[offset + 2] = (value >>> 16);
      this[offset + 3] = (value >>> 24);
    } else {
      objectWriteUInt32(this, value, offset, true);
    }
    return offset + 4
  };

  Buffer$1.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
    value = +value;
    offset = offset | 0;
    if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000);
    if (value < 0) value = 0xffffffff + value + 1;
    if (Buffer$1.TYPED_ARRAY_SUPPORT) {
      this[offset] = (value >>> 24);
      this[offset + 1] = (value >>> 16);
      this[offset + 2] = (value >>> 8);
      this[offset + 3] = (value & 0xff);
    } else {
      objectWriteUInt32(this, value, offset, false);
    }
    return offset + 4
  };

  function checkIEEE754 (buf, value, offset, ext, max, min) {
    if (offset + ext > buf.length) throw new RangeError('Index out of range')
    if (offset < 0) throw new RangeError('Index out of range')
  }

  function writeFloat (buf, value, offset, littleEndian, noAssert) {
    if (!noAssert) {
      checkIEEE754(buf, value, offset, 4);
    }
    write(buf, value, offset, littleEndian, 23, 4);
    return offset + 4
  }

  Buffer$1.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
    return writeFloat(this, value, offset, true, noAssert)
  };

  Buffer$1.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
    return writeFloat(this, value, offset, false, noAssert)
  };

  function writeDouble (buf, value, offset, littleEndian, noAssert) {
    if (!noAssert) {
      checkIEEE754(buf, value, offset, 8);
    }
    write(buf, value, offset, littleEndian, 52, 8);
    return offset + 8
  }

  Buffer$1.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
    return writeDouble(this, value, offset, true, noAssert)
  };

  Buffer$1.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
    return writeDouble(this, value, offset, false, noAssert)
  };

  // copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
  Buffer$1.prototype.copy = function copy (target, targetStart, start, end) {
    if (!start) start = 0;
    if (!end && end !== 0) end = this.length;
    if (targetStart >= target.length) targetStart = target.length;
    if (!targetStart) targetStart = 0;
    if (end > 0 && end < start) end = start;

    // Copy 0 bytes; we're done
    if (end === start) return 0
    if (target.length === 0 || this.length === 0) return 0

    // Fatal error conditions
    if (targetStart < 0) {
      throw new RangeError('targetStart out of bounds')
    }
    if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
    if (end < 0) throw new RangeError('sourceEnd out of bounds')

    // Are we oob?
    if (end > this.length) end = this.length;
    if (target.length - targetStart < end - start) {
      end = target.length - targetStart + start;
    }

    var len = end - start;
    var i;

    if (this === target && start < targetStart && targetStart < end) {
      // descending copy from end
      for (i = len - 1; i >= 0; --i) {
        target[i + targetStart] = this[i + start];
      }
    } else if (len < 1000 || !Buffer$1.TYPED_ARRAY_SUPPORT) {
      // ascending copy from start
      for (i = 0; i < len; ++i) {
        target[i + targetStart] = this[i + start];
      }
    } else {
      Uint8Array.prototype.set.call(
        target,
        this.subarray(start, start + len),
        targetStart
      );
    }

    return len
  };

  // Usage:
  //    buffer.fill(number[, offset[, end]])
  //    buffer.fill(buffer[, offset[, end]])
  //    buffer.fill(string[, offset[, end]][, encoding])
  Buffer$1.prototype.fill = function fill (val, start, end, encoding) {
    // Handle string cases:
    if (typeof val === 'string') {
      if (typeof start === 'string') {
        encoding = start;
        start = 0;
        end = this.length;
      } else if (typeof end === 'string') {
        encoding = end;
        end = this.length;
      }
      if (val.length === 1) {
        var code = val.charCodeAt(0);
        if (code < 256) {
          val = code;
        }
      }
      if (encoding !== undefined && typeof encoding !== 'string') {
        throw new TypeError('encoding must be a string')
      }
      if (typeof encoding === 'string' && !Buffer$1.isEncoding(encoding)) {
        throw new TypeError('Unknown encoding: ' + encoding)
      }
    } else if (typeof val === 'number') {
      val = val & 255;
    }

    // Invalid ranges are not set to a default, so can range check early.
    if (start < 0 || this.length < start || this.length < end) {
      throw new RangeError('Out of range index')
    }

    if (end <= start) {
      return this
    }

    start = start >>> 0;
    end = end === undefined ? this.length : end >>> 0;

    if (!val) val = 0;

    var i;
    if (typeof val === 'number') {
      for (i = start; i < end; ++i) {
        this[i] = val;
      }
    } else {
      var bytes = internalIsBuffer(val)
        ? val
        : utf8ToBytes(new Buffer$1(val, encoding).toString());
      var len = bytes.length;
      for (i = 0; i < end - start; ++i) {
        this[i + start] = bytes[i % len];
      }
    }

    return this
  };

  // HELPER FUNCTIONS
  // ================

  var INVALID_BASE64_RE = /[^+\/0-9A-Za-z-_]/g;

  function base64clean (str) {
    // Node strips out invalid characters like \n and \t from the string, base64-js does not
    str = stringtrim(str).replace(INVALID_BASE64_RE, '');
    // Node converts strings with length < 2 to ''
    if (str.length < 2) return ''
    // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
    while (str.length % 4 !== 0) {
      str = str + '=';
    }
    return str
  }

  function stringtrim (str) {
    if (str.trim) return str.trim()
    return str.replace(/^\s+|\s+$/g, '')
  }

  function toHex$1 (n) {
    if (n < 16) return '0' + n.toString(16)
    return n.toString(16)
  }

  function utf8ToBytes (string, units) {
    units = units || Infinity;
    var codePoint;
    var length = string.length;
    var leadSurrogate = null;
    var bytes = [];

    for (var i = 0; i < length; ++i) {
      codePoint = string.charCodeAt(i);

      // is surrogate component
      if (codePoint > 0xD7FF && codePoint < 0xE000) {
        // last char was a lead
        if (!leadSurrogate) {
          // no lead yet
          if (codePoint > 0xDBFF) {
            // unexpected trail
            if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
            continue
          } else if (i + 1 === length) {
            // unpaired lead
            if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
            continue
          }

          // valid lead
          leadSurrogate = codePoint;

          continue
        }

        // 2 leads in a row
        if (codePoint < 0xDC00) {
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
          leadSurrogate = codePoint;
          continue
        }

        // valid surrogate pair
        codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000;
      } else if (leadSurrogate) {
        // valid bmp char, but last char was a lead
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
      }

      leadSurrogate = null;

      // encode utf8
      if (codePoint < 0x80) {
        if ((units -= 1) < 0) break
        bytes.push(codePoint);
      } else if (codePoint < 0x800) {
        if ((units -= 2) < 0) break
        bytes.push(
          codePoint >> 0x6 | 0xC0,
          codePoint & 0x3F | 0x80
        );
      } else if (codePoint < 0x10000) {
        if ((units -= 3) < 0) break
        bytes.push(
          codePoint >> 0xC | 0xE0,
          codePoint >> 0x6 & 0x3F | 0x80,
          codePoint & 0x3F | 0x80
        );
      } else if (codePoint < 0x110000) {
        if ((units -= 4) < 0) break
        bytes.push(
          codePoint >> 0x12 | 0xF0,
          codePoint >> 0xC & 0x3F | 0x80,
          codePoint >> 0x6 & 0x3F | 0x80,
          codePoint & 0x3F | 0x80
        );
      } else {
        throw new Error('Invalid code point')
      }
    }

    return bytes
  }

  function asciiToBytes (str) {
    var byteArray = [];
    for (var i = 0; i < str.length; ++i) {
      // Node's code seems to be doing this and not & 0x7F..
      byteArray.push(str.charCodeAt(i) & 0xFF);
    }
    return byteArray
  }

  function utf16leToBytes (str, units) {
    var c, hi, lo;
    var byteArray = [];
    for (var i = 0; i < str.length; ++i) {
      if ((units -= 2) < 0) break

      c = str.charCodeAt(i);
      hi = c >> 8;
      lo = c % 256;
      byteArray.push(lo);
      byteArray.push(hi);
    }

    return byteArray
  }


  function base64ToBytes (str) {
    return toByteArray(base64clean(str))
  }

  function blitBuffer (src, dst, offset, length) {
    for (var i = 0; i < length; ++i) {
      if ((i + offset >= dst.length) || (i >= src.length)) break
      dst[i + offset] = src[i];
    }
    return i
  }

  function isnan (val) {
    return val !== val // eslint-disable-line no-self-compare
  }


  // the following is from is-buffer, also by Feross Aboukhadijeh and with same lisence
  // The _isBuffer check is for Safari 5-7 support, because it's missing
  // Object.prototype.constructor. Remove this eventually
  function isBuffer$1(obj) {
    return obj != null && (!!obj._isBuffer || isFastBuffer(obj) || isSlowBuffer(obj))
  }

  function isFastBuffer (obj) {
    return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
  }

  // For Node v0.10 support. Remove this eventually.
  function isSlowBuffer (obj) {
    return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isFastBuffer(obj.slice(0, 0))
  }

  var _polyfillNode_buffer = /*#__PURE__*/Object.freeze({
    __proto__: null,
    Buffer: Buffer$1,
    INSPECT_MAX_BYTES: INSPECT_MAX_BYTES,
    SlowBuffer: SlowBuffer,
    isBuffer: isBuffer$1,
    kMaxLength: _kMaxLength
  });

  var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

  function getAugmentedNamespace(n) {
    var f = n.default;
  	if (typeof f == "function") {
  		var a = function () {
  			return f.apply(this, arguments);
  		};
  		a.prototype = f.prototype;
    } else a = {};
    Object.defineProperty(a, '__esModule', {value: true});
  	Object.keys(n).forEach(function (k) {
  		var d = Object.getOwnPropertyDescriptor(n, k);
  		Object.defineProperty(a, k, d.get ? d : {
  			enumerable: true,
  			get: function () {
  				return n[k];
  			}
  		});
  	});
  	return a;
  }

  var bsv$2 = {exports: {}};

  var name$1 = "@vaionex/bsv";
  var version$2 = "1.5.9";
  var description$1 = "A pure and powerful JavaScript Bitcoin SV (BSV) library.";
  var author$1 = "Ryan X. Charles <ryan@moneybutton.com>";
  var main$1 = "index.js";
  var scripts$1 = {
  	lint: "standard",
  	"lint:fix": "standard --fix",
  	test: "standard && mocha",
  	coverage: "nyc --reporter=text npm run test",
  	"build-bsv": "webpack index.js --config webpack.config.js",
  	"build-ecies": "webpack ecies/index.js --config webpack.subproject.config.js --output-library bsvEcies -o bsv-ecies.min.js",
  	"build-message": "webpack message/index.js --config webpack.subproject.config.js --output-library bsvMessage -o bsv-message.min.js",
  	"build-mnemonic": "webpack mnemonic/index.js --config webpack.subproject.config.js --output-library bsvMnemonic -o bsv-mnemonic.min.js",
  	build: "yarn build-bsv && yarn build-ecies && yarn build-message && yarn build-mnemonic",
  	prepublishOnly: "yarn build"
  };
  var unpkg = "bsv.min.js";
  var keywords$1 = [
  	"bitcoin",
  	"transaction",
  	"address",
  	"p2p",
  	"ecies",
  	"cryptocurrency",
  	"blockchain",
  	"payment",
  	"bip21",
  	"bip32",
  	"bip37",
  	"bip69",
  	"bip70",
  	"multisig"
  ];
  var repository$1 = {
  	type: "git",
  	url: "https://github.com/moneybutton/bsv"
  };
  var browser$2 = {
  	request: "browser-request"
  };
  var dependencies$1 = {
  	"aes-js": "^3.1.2",
  	"bn.js": "=4.11.9",
  	bs58: "=4.0.1",
  	"clone-deep": "^4.0.1",
  	elliptic: "6.5.4",
  	"hash.js": "^1.1.7",
  	inherits: "2.0.3",
  	unorm: "1.4.1"
  };
  var devDependencies$1 = {
  	brfs: "2.0.1",
  	chai: "4.2.0",
  	mocha: "^8.4.0",
  	nyc: "^14.1.1",
  	sinon: "7.2.3",
  	standard: "12.0.1",
  	webpack: "4.29.3",
  	"webpack-cli": "^3.3.12"
  };
  var license$1 = "MIT";
  var standard = {
  	globals: [
  		"afterEach",
  		"beforeEach",
  		"describe",
  		"it"
  	],
  	ignore: [
  		"dist/**"
  	]
  };
  var require$$0$5 = {
  	name: name$1,
  	version: version$2,
  	description: description$1,
  	author: author$1,
  	main: main$1,
  	scripts: scripts$1,
  	unpkg: unpkg,
  	keywords: keywords$1,
  	repository: repository$1,
  	browser: browser$2,
  	dependencies: dependencies$1,
  	devDependencies: devDependencies$1,
  	license: license$1,
  	standard: standard
  };

  var bn$2 = {exports: {}};

  var require$$0$4 = /*@__PURE__*/getAugmentedNamespace(_polyfillNode_buffer);

  (function (module) {
  	(function (module, exports) {

  	  // Utils
  	  function assert (val, msg) {
  	    if (!val) throw new Error(msg || 'Assertion failed');
  	  }

  	  // Could use `inherits` module, but don't want to move from single file
  	  // architecture yet.
  	  function inherits (ctor, superCtor) {
  	    ctor.super_ = superCtor;
  	    var TempCtor = function () {};
  	    TempCtor.prototype = superCtor.prototype;
  	    ctor.prototype = new TempCtor();
  	    ctor.prototype.constructor = ctor;
  	  }

  	  // BN

  	  function BN (number, base, endian) {
  	    if (BN.isBN(number)) {
  	      return number;
  	    }

  	    this.negative = 0;
  	    this.words = null;
  	    this.length = 0;

  	    // Reduction context
  	    this.red = null;

  	    if (number !== null) {
  	      if (base === 'le' || base === 'be') {
  	        endian = base;
  	        base = 10;
  	      }

  	      this._init(number || 0, base || 10, endian || 'be');
  	    }
  	  }
  	  if (typeof module === 'object') {
  	    module.exports = BN;
  	  } else {
  	    exports.BN = BN;
  	  }

  	  BN.BN = BN;
  	  BN.wordSize = 26;

  	  var Buffer;
  	  try {
  	    Buffer = require$$0$4.Buffer;
  	  } catch (e) {
  	  }

  	  BN.isBN = function isBN (num) {
  	    if (num instanceof BN) {
  	      return true;
  	    }

  	    return num !== null && typeof num === 'object' &&
  	      num.constructor.wordSize === BN.wordSize && Array.isArray(num.words);
  	  };

  	  BN.max = function max (left, right) {
  	    if (left.cmp(right) > 0) return left;
  	    return right;
  	  };

  	  BN.min = function min (left, right) {
  	    if (left.cmp(right) < 0) return left;
  	    return right;
  	  };

  	  BN.prototype._init = function init (number, base, endian) {
  	    if (typeof number === 'number') {
  	      return this._initNumber(number, base, endian);
  	    }

  	    if (typeof number === 'object') {
  	      return this._initArray(number, base, endian);
  	    }

  	    if (base === 'hex') {
  	      base = 16;
  	    }
  	    assert(base === (base | 0) && base >= 2 && base <= 36);

  	    number = number.toString().replace(/\s+/g, '');
  	    var start = 0;
  	    if (number[0] === '-') {
  	      start++;
  	    }

  	    if (base === 16) {
  	      this._parseHex(number, start);
  	    } else {
  	      this._parseBase(number, base, start);
  	    }

  	    if (number[0] === '-') {
  	      this.negative = 1;
  	    }

  	    this.strip();

  	    if (endian !== 'le') return;

  	    this._initArray(this.toArray(), base, endian);
  	  };

  	  BN.prototype._initNumber = function _initNumber (number, base, endian) {
  	    if (number < 0) {
  	      this.negative = 1;
  	      number = -number;
  	    }
  	    if (number < 0x4000000) {
  	      this.words = [ number & 0x3ffffff ];
  	      this.length = 1;
  	    } else if (number < 0x10000000000000) {
  	      this.words = [
  	        number & 0x3ffffff,
  	        (number / 0x4000000) & 0x3ffffff
  	      ];
  	      this.length = 2;
  	    } else {
  	      assert(number < 0x20000000000000); // 2 ^ 53 (unsafe)
  	      this.words = [
  	        number & 0x3ffffff,
  	        (number / 0x4000000) & 0x3ffffff,
  	        1
  	      ];
  	      this.length = 3;
  	    }

  	    if (endian !== 'le') return;

  	    // Reverse the bytes
  	    this._initArray(this.toArray(), base, endian);
  	  };

  	  BN.prototype._initArray = function _initArray (number, base, endian) {
  	    // Perhaps a Uint8Array
  	    assert(typeof number.length === 'number');
  	    if (number.length <= 0) {
  	      this.words = [ 0 ];
  	      this.length = 1;
  	      return this;
  	    }

  	    this.length = Math.ceil(number.length / 3);
  	    this.words = new Array(this.length);
  	    for (var i = 0; i < this.length; i++) {
  	      this.words[i] = 0;
  	    }

  	    var j, w;
  	    var off = 0;
  	    if (endian === 'be') {
  	      for (i = number.length - 1, j = 0; i >= 0; i -= 3) {
  	        w = number[i] | (number[i - 1] << 8) | (number[i - 2] << 16);
  	        this.words[j] |= (w << off) & 0x3ffffff;
  	        this.words[j + 1] = (w >>> (26 - off)) & 0x3ffffff;
  	        off += 24;
  	        if (off >= 26) {
  	          off -= 26;
  	          j++;
  	        }
  	      }
  	    } else if (endian === 'le') {
  	      for (i = 0, j = 0; i < number.length; i += 3) {
  	        w = number[i] | (number[i + 1] << 8) | (number[i + 2] << 16);
  	        this.words[j] |= (w << off) & 0x3ffffff;
  	        this.words[j + 1] = (w >>> (26 - off)) & 0x3ffffff;
  	        off += 24;
  	        if (off >= 26) {
  	          off -= 26;
  	          j++;
  	        }
  	      }
  	    }
  	    return this.strip();
  	  };

  	  function parseHex (str, start, end) {
  	    var r = 0;
  	    var len = Math.min(str.length, end);
  	    for (var i = start; i < len; i++) {
  	      var c = str.charCodeAt(i) - 48;

  	      r <<= 4;

  	      // 'a' - 'f'
  	      if (c >= 49 && c <= 54) {
  	        r |= c - 49 + 0xa;

  	      // 'A' - 'F'
  	      } else if (c >= 17 && c <= 22) {
  	        r |= c - 17 + 0xa;

  	      // '0' - '9'
  	      } else {
  	        r |= c & 0xf;
  	      }
  	    }
  	    return r;
  	  }

  	  BN.prototype._parseHex = function _parseHex (number, start) {
  	    // Create possibly bigger array to ensure that it fits the number
  	    this.length = Math.ceil((number.length - start) / 6);
  	    this.words = new Array(this.length);
  	    for (var i = 0; i < this.length; i++) {
  	      this.words[i] = 0;
  	    }

  	    var j, w;
  	    // Scan 24-bit chunks and add them to the number
  	    var off = 0;
  	    for (i = number.length - 6, j = 0; i >= start; i -= 6) {
  	      w = parseHex(number, i, i + 6);
  	      this.words[j] |= (w << off) & 0x3ffffff;
  	      // NOTE: `0x3fffff` is intentional here, 26bits max shift + 24bit hex limb
  	      this.words[j + 1] |= w >>> (26 - off) & 0x3fffff;
  	      off += 24;
  	      if (off >= 26) {
  	        off -= 26;
  	        j++;
  	      }
  	    }
  	    if (i + 6 !== start) {
  	      w = parseHex(number, start, i + 6);
  	      this.words[j] |= (w << off) & 0x3ffffff;
  	      this.words[j + 1] |= w >>> (26 - off) & 0x3fffff;
  	    }
  	    this.strip();
  	  };

  	  function parseBase (str, start, end, mul) {
  	    var r = 0;
  	    var len = Math.min(str.length, end);
  	    for (var i = start; i < len; i++) {
  	      var c = str.charCodeAt(i) - 48;

  	      r *= mul;

  	      // 'a'
  	      if (c >= 49) {
  	        r += c - 49 + 0xa;

  	      // 'A'
  	      } else if (c >= 17) {
  	        r += c - 17 + 0xa;

  	      // '0' - '9'
  	      } else {
  	        r += c;
  	      }
  	    }
  	    return r;
  	  }

  	  BN.prototype._parseBase = function _parseBase (number, base, start) {
  	    // Initialize as zero
  	    this.words = [ 0 ];
  	    this.length = 1;

  	    // Find length of limb in base
  	    for (var limbLen = 0, limbPow = 1; limbPow <= 0x3ffffff; limbPow *= base) {
  	      limbLen++;
  	    }
  	    limbLen--;
  	    limbPow = (limbPow / base) | 0;

  	    var total = number.length - start;
  	    var mod = total % limbLen;
  	    var end = Math.min(total, total - mod) + start;

  	    var word = 0;
  	    for (var i = start; i < end; i += limbLen) {
  	      word = parseBase(number, i, i + limbLen, base);

  	      this.imuln(limbPow);
  	      if (this.words[0] + word < 0x4000000) {
  	        this.words[0] += word;
  	      } else {
  	        this._iaddn(word);
  	      }
  	    }

  	    if (mod !== 0) {
  	      var pow = 1;
  	      word = parseBase(number, i, number.length, base);

  	      for (i = 0; i < mod; i++) {
  	        pow *= base;
  	      }

  	      this.imuln(pow);
  	      if (this.words[0] + word < 0x4000000) {
  	        this.words[0] += word;
  	      } else {
  	        this._iaddn(word);
  	      }
  	    }
  	  };

  	  BN.prototype.copy = function copy (dest) {
  	    dest.words = new Array(this.length);
  	    for (var i = 0; i < this.length; i++) {
  	      dest.words[i] = this.words[i];
  	    }
  	    dest.length = this.length;
  	    dest.negative = this.negative;
  	    dest.red = this.red;
  	  };

  	  BN.prototype.clone = function clone () {
  	    var r = new BN(null);
  	    this.copy(r);
  	    return r;
  	  };

  	  BN.prototype._expand = function _expand (size) {
  	    while (this.length < size) {
  	      this.words[this.length++] = 0;
  	    }
  	    return this;
  	  };

  	  // Remove leading `0` from `this`
  	  BN.prototype.strip = function strip () {
  	    while (this.length > 1 && this.words[this.length - 1] === 0) {
  	      this.length--;
  	    }
  	    return this._normSign();
  	  };

  	  BN.prototype._normSign = function _normSign () {
  	    // -0 = 0
  	    if (this.length === 1 && this.words[0] === 0) {
  	      this.negative = 0;
  	    }
  	    return this;
  	  };

  	  BN.prototype.inspect = function inspect () {
  	    return (this.red ? '<BN-R: ' : '<BN: ') + this.toString(16) + '>';
  	  };

  	  /*

  	  var zeros = [];
  	  var groupSizes = [];
  	  var groupBases = [];

  	  var s = '';
  	  var i = -1;
  	  while (++i < BN.wordSize) {
  	    zeros[i] = s;
  	    s += '0';
  	  }
  	  groupSizes[0] = 0;
  	  groupSizes[1] = 0;
  	  groupBases[0] = 0;
  	  groupBases[1] = 0;
  	  var base = 2 - 1;
  	  while (++base < 36 + 1) {
  	    var groupSize = 0;
  	    var groupBase = 1;
  	    while (groupBase < (1 << BN.wordSize) / base) {
  	      groupBase *= base;
  	      groupSize += 1;
  	    }
  	    groupSizes[base] = groupSize;
  	    groupBases[base] = groupBase;
  	  }

  	  */

  	  var zeros = [
  	    '',
  	    '0',
  	    '00',
  	    '000',
  	    '0000',
  	    '00000',
  	    '000000',
  	    '0000000',
  	    '00000000',
  	    '000000000',
  	    '0000000000',
  	    '00000000000',
  	    '000000000000',
  	    '0000000000000',
  	    '00000000000000',
  	    '000000000000000',
  	    '0000000000000000',
  	    '00000000000000000',
  	    '000000000000000000',
  	    '0000000000000000000',
  	    '00000000000000000000',
  	    '000000000000000000000',
  	    '0000000000000000000000',
  	    '00000000000000000000000',
  	    '000000000000000000000000',
  	    '0000000000000000000000000'
  	  ];

  	  var groupSizes = [
  	    0, 0,
  	    25, 16, 12, 11, 10, 9, 8,
  	    8, 7, 7, 7, 7, 6, 6,
  	    6, 6, 6, 6, 6, 5, 5,
  	    5, 5, 5, 5, 5, 5, 5,
  	    5, 5, 5, 5, 5, 5, 5
  	  ];

  	  var groupBases = [
  	    0, 0,
  	    33554432, 43046721, 16777216, 48828125, 60466176, 40353607, 16777216,
  	    43046721, 10000000, 19487171, 35831808, 62748517, 7529536, 11390625,
  	    16777216, 24137569, 34012224, 47045881, 64000000, 4084101, 5153632,
  	    6436343, 7962624, 9765625, 11881376, 14348907, 17210368, 20511149,
  	    24300000, 28629151, 33554432, 39135393, 45435424, 52521875, 60466176
  	  ];

  	  BN.prototype.toString = function toString (base, padding) {
  	    base = base || 10;
  	    padding = padding | 0 || 1;

  	    var out;
  	    if (base === 16 || base === 'hex') {
  	      out = '';
  	      var off = 0;
  	      var carry = 0;
  	      for (var i = 0; i < this.length; i++) {
  	        var w = this.words[i];
  	        var word = (((w << off) | carry) & 0xffffff).toString(16);
  	        carry = (w >>> (24 - off)) & 0xffffff;
  	        if (carry !== 0 || i !== this.length - 1) {
  	          out = zeros[6 - word.length] + word + out;
  	        } else {
  	          out = word + out;
  	        }
  	        off += 2;
  	        if (off >= 26) {
  	          off -= 26;
  	          i--;
  	        }
  	      }
  	      if (carry !== 0) {
  	        out = carry.toString(16) + out;
  	      }
  	      while (out.length % padding !== 0) {
  	        out = '0' + out;
  	      }
  	      if (this.negative !== 0) {
  	        out = '-' + out;
  	      }
  	      return out;
  	    }

  	    if (base === (base | 0) && base >= 2 && base <= 36) {
  	      // var groupSize = Math.floor(BN.wordSize * Math.LN2 / Math.log(base));
  	      var groupSize = groupSizes[base];
  	      // var groupBase = Math.pow(base, groupSize);
  	      var groupBase = groupBases[base];
  	      out = '';
  	      var c = this.clone();
  	      c.negative = 0;
  	      while (!c.isZero()) {
  	        var r = c.modn(groupBase).toString(base);
  	        c = c.idivn(groupBase);

  	        if (!c.isZero()) {
  	          out = zeros[groupSize - r.length] + r + out;
  	        } else {
  	          out = r + out;
  	        }
  	      }
  	      if (this.isZero()) {
  	        out = '0' + out;
  	      }
  	      while (out.length % padding !== 0) {
  	        out = '0' + out;
  	      }
  	      if (this.negative !== 0) {
  	        out = '-' + out;
  	      }
  	      return out;
  	    }

  	    assert(false, 'Base should be between 2 and 36');
  	  };

  	  BN.prototype.toNumber = function toNumber () {
  	    var ret = this.words[0];
  	    if (this.length === 2) {
  	      ret += this.words[1] * 0x4000000;
  	    } else if (this.length === 3 && this.words[2] === 0x01) {
  	      // NOTE: at this stage it is known that the top bit is set
  	      ret += 0x10000000000000 + (this.words[1] * 0x4000000);
  	    } else if (this.length > 2) {
  	      assert(false, 'Number can only safely store up to 53 bits');
  	    }
  	    return (this.negative !== 0) ? -ret : ret;
  	  };

  	  BN.prototype.toJSON = function toJSON () {
  	    return this.toString(16);
  	  };

  	  BN.prototype.toBuffer = function toBuffer (endian, length) {
  	    assert(typeof Buffer !== 'undefined');
  	    return this.toArrayLike(Buffer, endian, length);
  	  };

  	  BN.prototype.toArray = function toArray (endian, length) {
  	    return this.toArrayLike(Array, endian, length);
  	  };

  	  BN.prototype.toArrayLike = function toArrayLike (ArrayType, endian, length) {
  	    var byteLength = this.byteLength();
  	    var reqLength = length || Math.max(1, byteLength);
  	    assert(byteLength <= reqLength, 'byte array longer than desired length');
  	    assert(reqLength > 0, 'Requested array length <= 0');

  	    this.strip();
  	    var littleEndian = endian === 'le';
  	    var res = new ArrayType(reqLength);

  	    var b, i;
  	    var q = this.clone();
  	    if (!littleEndian) {
  	      // Assume big-endian
  	      for (i = 0; i < reqLength - byteLength; i++) {
  	        res[i] = 0;
  	      }

  	      for (i = 0; !q.isZero(); i++) {
  	        b = q.andln(0xff);
  	        q.iushrn(8);

  	        res[reqLength - i - 1] = b;
  	      }
  	    } else {
  	      for (i = 0; !q.isZero(); i++) {
  	        b = q.andln(0xff);
  	        q.iushrn(8);

  	        res[i] = b;
  	      }

  	      for (; i < reqLength; i++) {
  	        res[i] = 0;
  	      }
  	    }

  	    return res;
  	  };

  	  if (Math.clz32) {
  	    BN.prototype._countBits = function _countBits (w) {
  	      return 32 - Math.clz32(w);
  	    };
  	  } else {
  	    BN.prototype._countBits = function _countBits (w) {
  	      var t = w;
  	      var r = 0;
  	      if (t >= 0x1000) {
  	        r += 13;
  	        t >>>= 13;
  	      }
  	      if (t >= 0x40) {
  	        r += 7;
  	        t >>>= 7;
  	      }
  	      if (t >= 0x8) {
  	        r += 4;
  	        t >>>= 4;
  	      }
  	      if (t >= 0x02) {
  	        r += 2;
  	        t >>>= 2;
  	      }
  	      return r + t;
  	    };
  	  }

  	  BN.prototype._zeroBits = function _zeroBits (w) {
  	    // Short-cut
  	    if (w === 0) return 26;

  	    var t = w;
  	    var r = 0;
  	    if ((t & 0x1fff) === 0) {
  	      r += 13;
  	      t >>>= 13;
  	    }
  	    if ((t & 0x7f) === 0) {
  	      r += 7;
  	      t >>>= 7;
  	    }
  	    if ((t & 0xf) === 0) {
  	      r += 4;
  	      t >>>= 4;
  	    }
  	    if ((t & 0x3) === 0) {
  	      r += 2;
  	      t >>>= 2;
  	    }
  	    if ((t & 0x1) === 0) {
  	      r++;
  	    }
  	    return r;
  	  };

  	  // Return number of used bits in a BN
  	  BN.prototype.bitLength = function bitLength () {
  	    var w = this.words[this.length - 1];
  	    var hi = this._countBits(w);
  	    return (this.length - 1) * 26 + hi;
  	  };

  	  function toBitArray (num) {
  	    var w = new Array(num.bitLength());

  	    for (var bit = 0; bit < w.length; bit++) {
  	      var off = (bit / 26) | 0;
  	      var wbit = bit % 26;

  	      w[bit] = (num.words[off] & (1 << wbit)) >>> wbit;
  	    }

  	    return w;
  	  }

  	  // Number of trailing zero bits
  	  BN.prototype.zeroBits = function zeroBits () {
  	    if (this.isZero()) return 0;

  	    var r = 0;
  	    for (var i = 0; i < this.length; i++) {
  	      var b = this._zeroBits(this.words[i]);
  	      r += b;
  	      if (b !== 26) break;
  	    }
  	    return r;
  	  };

  	  BN.prototype.byteLength = function byteLength () {
  	    return Math.ceil(this.bitLength() / 8);
  	  };

  	  BN.prototype.toTwos = function toTwos (width) {
  	    if (this.negative !== 0) {
  	      return this.abs().inotn(width).iaddn(1);
  	    }
  	    return this.clone();
  	  };

  	  BN.prototype.fromTwos = function fromTwos (width) {
  	    if (this.testn(width - 1)) {
  	      return this.notn(width).iaddn(1).ineg();
  	    }
  	    return this.clone();
  	  };

  	  BN.prototype.isNeg = function isNeg () {
  	    return this.negative !== 0;
  	  };

  	  // Return negative clone of `this`
  	  BN.prototype.neg = function neg () {
  	    return this.clone().ineg();
  	  };

  	  BN.prototype.ineg = function ineg () {
  	    if (!this.isZero()) {
  	      this.negative ^= 1;
  	    }

  	    return this;
  	  };

  	  // Or `num` with `this` in-place
  	  BN.prototype.iuor = function iuor (num) {
  	    while (this.length < num.length) {
  	      this.words[this.length++] = 0;
  	    }

  	    for (var i = 0; i < num.length; i++) {
  	      this.words[i] = this.words[i] | num.words[i];
  	    }

  	    return this.strip();
  	  };

  	  BN.prototype.ior = function ior (num) {
  	    assert((this.negative | num.negative) === 0);
  	    return this.iuor(num);
  	  };

  	  // Or `num` with `this`
  	  BN.prototype.or = function or (num) {
  	    if (this.length > num.length) return this.clone().ior(num);
  	    return num.clone().ior(this);
  	  };

  	  BN.prototype.uor = function uor (num) {
  	    if (this.length > num.length) return this.clone().iuor(num);
  	    return num.clone().iuor(this);
  	  };

  	  // And `num` with `this` in-place
  	  BN.prototype.iuand = function iuand (num) {
  	    // b = min-length(num, this)
  	    var b;
  	    if (this.length > num.length) {
  	      b = num;
  	    } else {
  	      b = this;
  	    }

  	    for (var i = 0; i < b.length; i++) {
  	      this.words[i] = this.words[i] & num.words[i];
  	    }

  	    this.length = b.length;

  	    return this.strip();
  	  };

  	  BN.prototype.iand = function iand (num) {
  	    assert((this.negative | num.negative) === 0);
  	    return this.iuand(num);
  	  };

  	  // And `num` with `this`
  	  BN.prototype.and = function and (num) {
  	    if (this.length > num.length) return this.clone().iand(num);
  	    return num.clone().iand(this);
  	  };

  	  BN.prototype.uand = function uand (num) {
  	    if (this.length > num.length) return this.clone().iuand(num);
  	    return num.clone().iuand(this);
  	  };

  	  // Xor `num` with `this` in-place
  	  BN.prototype.iuxor = function iuxor (num) {
  	    // a.length > b.length
  	    var a;
  	    var b;
  	    if (this.length > num.length) {
  	      a = this;
  	      b = num;
  	    } else {
  	      a = num;
  	      b = this;
  	    }

  	    for (var i = 0; i < b.length; i++) {
  	      this.words[i] = a.words[i] ^ b.words[i];
  	    }

  	    if (this !== a) {
  	      for (; i < a.length; i++) {
  	        this.words[i] = a.words[i];
  	      }
  	    }

  	    this.length = a.length;

  	    return this.strip();
  	  };

  	  BN.prototype.ixor = function ixor (num) {
  	    assert((this.negative | num.negative) === 0);
  	    return this.iuxor(num);
  	  };

  	  // Xor `num` with `this`
  	  BN.prototype.xor = function xor (num) {
  	    if (this.length > num.length) return this.clone().ixor(num);
  	    return num.clone().ixor(this);
  	  };

  	  BN.prototype.uxor = function uxor (num) {
  	    if (this.length > num.length) return this.clone().iuxor(num);
  	    return num.clone().iuxor(this);
  	  };

  	  // Not ``this`` with ``width`` bitwidth
  	  BN.prototype.inotn = function inotn (width) {
  	    assert(typeof width === 'number' && width >= 0);

  	    var bytesNeeded = Math.ceil(width / 26) | 0;
  	    var bitsLeft = width % 26;

  	    // Extend the buffer with leading zeroes
  	    this._expand(bytesNeeded);

  	    if (bitsLeft > 0) {
  	      bytesNeeded--;
  	    }

  	    // Handle complete words
  	    for (var i = 0; i < bytesNeeded; i++) {
  	      this.words[i] = ~this.words[i] & 0x3ffffff;
  	    }

  	    // Handle the residue
  	    if (bitsLeft > 0) {
  	      this.words[i] = ~this.words[i] & (0x3ffffff >> (26 - bitsLeft));
  	    }

  	    // And remove leading zeroes
  	    return this.strip();
  	  };

  	  BN.prototype.notn = function notn (width) {
  	    return this.clone().inotn(width);
  	  };

  	  // Set `bit` of `this`
  	  BN.prototype.setn = function setn (bit, val) {
  	    assert(typeof bit === 'number' && bit >= 0);

  	    var off = (bit / 26) | 0;
  	    var wbit = bit % 26;

  	    this._expand(off + 1);

  	    if (val) {
  	      this.words[off] = this.words[off] | (1 << wbit);
  	    } else {
  	      this.words[off] = this.words[off] & ~(1 << wbit);
  	    }

  	    return this.strip();
  	  };

  	  // Add `num` to `this` in-place
  	  BN.prototype.iadd = function iadd (num) {
  	    var r;

  	    // negative + positive
  	    if (this.negative !== 0 && num.negative === 0) {
  	      this.negative = 0;
  	      r = this.isub(num);
  	      this.negative ^= 1;
  	      return this._normSign();

  	    // positive + negative
  	    } else if (this.negative === 0 && num.negative !== 0) {
  	      num.negative = 0;
  	      r = this.isub(num);
  	      num.negative = 1;
  	      return r._normSign();
  	    }

  	    // a.length > b.length
  	    var a, b;
  	    if (this.length > num.length) {
  	      a = this;
  	      b = num;
  	    } else {
  	      a = num;
  	      b = this;
  	    }

  	    var carry = 0;
  	    for (var i = 0; i < b.length; i++) {
  	      r = (a.words[i] | 0) + (b.words[i] | 0) + carry;
  	      this.words[i] = r & 0x3ffffff;
  	      carry = r >>> 26;
  	    }
  	    for (; carry !== 0 && i < a.length; i++) {
  	      r = (a.words[i] | 0) + carry;
  	      this.words[i] = r & 0x3ffffff;
  	      carry = r >>> 26;
  	    }

  	    this.length = a.length;
  	    if (carry !== 0) {
  	      this.words[this.length] = carry;
  	      this.length++;
  	    // Copy the rest of the words
  	    } else if (a !== this) {
  	      for (; i < a.length; i++) {
  	        this.words[i] = a.words[i];
  	      }
  	    }

  	    return this;
  	  };

  	  // Add `num` to `this`
  	  BN.prototype.add = function add (num) {
  	    var res;
  	    if (num.negative !== 0 && this.negative === 0) {
  	      num.negative = 0;
  	      res = this.sub(num);
  	      num.negative ^= 1;
  	      return res;
  	    } else if (num.negative === 0 && this.negative !== 0) {
  	      this.negative = 0;
  	      res = num.sub(this);
  	      this.negative = 1;
  	      return res;
  	    }

  	    if (this.length > num.length) return this.clone().iadd(num);

  	    return num.clone().iadd(this);
  	  };

  	  // Subtract `num` from `this` in-place
  	  BN.prototype.isub = function isub (num) {
  	    // this - (-num) = this + num
  	    if (num.negative !== 0) {
  	      num.negative = 0;
  	      var r = this.iadd(num);
  	      num.negative = 1;
  	      return r._normSign();

  	    // -this - num = -(this + num)
  	    } else if (this.negative !== 0) {
  	      this.negative = 0;
  	      this.iadd(num);
  	      this.negative = 1;
  	      return this._normSign();
  	    }

  	    // At this point both numbers are positive
  	    var cmp = this.cmp(num);

  	    // Optimization - zeroify
  	    if (cmp === 0) {
  	      this.negative = 0;
  	      this.length = 1;
  	      this.words[0] = 0;
  	      return this;
  	    }

  	    // a > b
  	    var a, b;
  	    if (cmp > 0) {
  	      a = this;
  	      b = num;
  	    } else {
  	      a = num;
  	      b = this;
  	    }

  	    var carry = 0;
  	    for (var i = 0; i < b.length; i++) {
  	      r = (a.words[i] | 0) - (b.words[i] | 0) + carry;
  	      carry = r >> 26;
  	      this.words[i] = r & 0x3ffffff;
  	    }
  	    for (; carry !== 0 && i < a.length; i++) {
  	      r = (a.words[i] | 0) + carry;
  	      carry = r >> 26;
  	      this.words[i] = r & 0x3ffffff;
  	    }

  	    // Copy rest of the words
  	    if (carry === 0 && i < a.length && a !== this) {
  	      for (; i < a.length; i++) {
  	        this.words[i] = a.words[i];
  	      }
  	    }

  	    this.length = Math.max(this.length, i);

  	    if (a !== this) {
  	      this.negative = 1;
  	    }

  	    return this.strip();
  	  };

  	  // Subtract `num` from `this`
  	  BN.prototype.sub = function sub (num) {
  	    return this.clone().isub(num);
  	  };

  	  function smallMulTo (self, num, out) {
  	    out.negative = num.negative ^ self.negative;
  	    var len = (self.length + num.length) | 0;
  	    out.length = len;
  	    len = (len - 1) | 0;

  	    // Peel one iteration (compiler can't do it, because of code complexity)
  	    var a = self.words[0] | 0;
  	    var b = num.words[0] | 0;
  	    var r = a * b;

  	    var lo = r & 0x3ffffff;
  	    var carry = (r / 0x4000000) | 0;
  	    out.words[0] = lo;

  	    for (var k = 1; k < len; k++) {
  	      // Sum all words with the same `i + j = k` and accumulate `ncarry`,
  	      // note that ncarry could be >= 0x3ffffff
  	      var ncarry = carry >>> 26;
  	      var rword = carry & 0x3ffffff;
  	      var maxJ = Math.min(k, num.length - 1);
  	      for (var j = Math.max(0, k - self.length + 1); j <= maxJ; j++) {
  	        var i = (k - j) | 0;
  	        a = self.words[i] | 0;
  	        b = num.words[j] | 0;
  	        r = a * b + rword;
  	        ncarry += (r / 0x4000000) | 0;
  	        rword = r & 0x3ffffff;
  	      }
  	      out.words[k] = rword | 0;
  	      carry = ncarry | 0;
  	    }
  	    if (carry !== 0) {
  	      out.words[k] = carry | 0;
  	    } else {
  	      out.length--;
  	    }

  	    return out.strip();
  	  }

  	  // TODO(indutny): it may be reasonable to omit it for users who don't need
  	  // to work with 256-bit numbers, otherwise it gives 20% improvement for 256-bit
  	  // multiplication (like elliptic secp256k1).
  	  var comb10MulTo = function comb10MulTo (self, num, out) {
  	    var a = self.words;
  	    var b = num.words;
  	    var o = out.words;
  	    var c = 0;
  	    var lo;
  	    var mid;
  	    var hi;
  	    var a0 = a[0] | 0;
  	    var al0 = a0 & 0x1fff;
  	    var ah0 = a0 >>> 13;
  	    var a1 = a[1] | 0;
  	    var al1 = a1 & 0x1fff;
  	    var ah1 = a1 >>> 13;
  	    var a2 = a[2] | 0;
  	    var al2 = a2 & 0x1fff;
  	    var ah2 = a2 >>> 13;
  	    var a3 = a[3] | 0;
  	    var al3 = a3 & 0x1fff;
  	    var ah3 = a3 >>> 13;
  	    var a4 = a[4] | 0;
  	    var al4 = a4 & 0x1fff;
  	    var ah4 = a4 >>> 13;
  	    var a5 = a[5] | 0;
  	    var al5 = a5 & 0x1fff;
  	    var ah5 = a5 >>> 13;
  	    var a6 = a[6] | 0;
  	    var al6 = a6 & 0x1fff;
  	    var ah6 = a6 >>> 13;
  	    var a7 = a[7] | 0;
  	    var al7 = a7 & 0x1fff;
  	    var ah7 = a7 >>> 13;
  	    var a8 = a[8] | 0;
  	    var al8 = a8 & 0x1fff;
  	    var ah8 = a8 >>> 13;
  	    var a9 = a[9] | 0;
  	    var al9 = a9 & 0x1fff;
  	    var ah9 = a9 >>> 13;
  	    var b0 = b[0] | 0;
  	    var bl0 = b0 & 0x1fff;
  	    var bh0 = b0 >>> 13;
  	    var b1 = b[1] | 0;
  	    var bl1 = b1 & 0x1fff;
  	    var bh1 = b1 >>> 13;
  	    var b2 = b[2] | 0;
  	    var bl2 = b2 & 0x1fff;
  	    var bh2 = b2 >>> 13;
  	    var b3 = b[3] | 0;
  	    var bl3 = b3 & 0x1fff;
  	    var bh3 = b3 >>> 13;
  	    var b4 = b[4] | 0;
  	    var bl4 = b4 & 0x1fff;
  	    var bh4 = b4 >>> 13;
  	    var b5 = b[5] | 0;
  	    var bl5 = b5 & 0x1fff;
  	    var bh5 = b5 >>> 13;
  	    var b6 = b[6] | 0;
  	    var bl6 = b6 & 0x1fff;
  	    var bh6 = b6 >>> 13;
  	    var b7 = b[7] | 0;
  	    var bl7 = b7 & 0x1fff;
  	    var bh7 = b7 >>> 13;
  	    var b8 = b[8] | 0;
  	    var bl8 = b8 & 0x1fff;
  	    var bh8 = b8 >>> 13;
  	    var b9 = b[9] | 0;
  	    var bl9 = b9 & 0x1fff;
  	    var bh9 = b9 >>> 13;

  	    out.negative = self.negative ^ num.negative;
  	    out.length = 19;
  	    /* k = 0 */
  	    lo = Math.imul(al0, bl0);
  	    mid = Math.imul(al0, bh0);
  	    mid = (mid + Math.imul(ah0, bl0)) | 0;
  	    hi = Math.imul(ah0, bh0);
  	    var w0 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w0 >>> 26)) | 0;
  	    w0 &= 0x3ffffff;
  	    /* k = 1 */
  	    lo = Math.imul(al1, bl0);
  	    mid = Math.imul(al1, bh0);
  	    mid = (mid + Math.imul(ah1, bl0)) | 0;
  	    hi = Math.imul(ah1, bh0);
  	    lo = (lo + Math.imul(al0, bl1)) | 0;
  	    mid = (mid + Math.imul(al0, bh1)) | 0;
  	    mid = (mid + Math.imul(ah0, bl1)) | 0;
  	    hi = (hi + Math.imul(ah0, bh1)) | 0;
  	    var w1 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w1 >>> 26)) | 0;
  	    w1 &= 0x3ffffff;
  	    /* k = 2 */
  	    lo = Math.imul(al2, bl0);
  	    mid = Math.imul(al2, bh0);
  	    mid = (mid + Math.imul(ah2, bl0)) | 0;
  	    hi = Math.imul(ah2, bh0);
  	    lo = (lo + Math.imul(al1, bl1)) | 0;
  	    mid = (mid + Math.imul(al1, bh1)) | 0;
  	    mid = (mid + Math.imul(ah1, bl1)) | 0;
  	    hi = (hi + Math.imul(ah1, bh1)) | 0;
  	    lo = (lo + Math.imul(al0, bl2)) | 0;
  	    mid = (mid + Math.imul(al0, bh2)) | 0;
  	    mid = (mid + Math.imul(ah0, bl2)) | 0;
  	    hi = (hi + Math.imul(ah0, bh2)) | 0;
  	    var w2 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w2 >>> 26)) | 0;
  	    w2 &= 0x3ffffff;
  	    /* k = 3 */
  	    lo = Math.imul(al3, bl0);
  	    mid = Math.imul(al3, bh0);
  	    mid = (mid + Math.imul(ah3, bl0)) | 0;
  	    hi = Math.imul(ah3, bh0);
  	    lo = (lo + Math.imul(al2, bl1)) | 0;
  	    mid = (mid + Math.imul(al2, bh1)) | 0;
  	    mid = (mid + Math.imul(ah2, bl1)) | 0;
  	    hi = (hi + Math.imul(ah2, bh1)) | 0;
  	    lo = (lo + Math.imul(al1, bl2)) | 0;
  	    mid = (mid + Math.imul(al1, bh2)) | 0;
  	    mid = (mid + Math.imul(ah1, bl2)) | 0;
  	    hi = (hi + Math.imul(ah1, bh2)) | 0;
  	    lo = (lo + Math.imul(al0, bl3)) | 0;
  	    mid = (mid + Math.imul(al0, bh3)) | 0;
  	    mid = (mid + Math.imul(ah0, bl3)) | 0;
  	    hi = (hi + Math.imul(ah0, bh3)) | 0;
  	    var w3 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w3 >>> 26)) | 0;
  	    w3 &= 0x3ffffff;
  	    /* k = 4 */
  	    lo = Math.imul(al4, bl0);
  	    mid = Math.imul(al4, bh0);
  	    mid = (mid + Math.imul(ah4, bl0)) | 0;
  	    hi = Math.imul(ah4, bh0);
  	    lo = (lo + Math.imul(al3, bl1)) | 0;
  	    mid = (mid + Math.imul(al3, bh1)) | 0;
  	    mid = (mid + Math.imul(ah3, bl1)) | 0;
  	    hi = (hi + Math.imul(ah3, bh1)) | 0;
  	    lo = (lo + Math.imul(al2, bl2)) | 0;
  	    mid = (mid + Math.imul(al2, bh2)) | 0;
  	    mid = (mid + Math.imul(ah2, bl2)) | 0;
  	    hi = (hi + Math.imul(ah2, bh2)) | 0;
  	    lo = (lo + Math.imul(al1, bl3)) | 0;
  	    mid = (mid + Math.imul(al1, bh3)) | 0;
  	    mid = (mid + Math.imul(ah1, bl3)) | 0;
  	    hi = (hi + Math.imul(ah1, bh3)) | 0;
  	    lo = (lo + Math.imul(al0, bl4)) | 0;
  	    mid = (mid + Math.imul(al0, bh4)) | 0;
  	    mid = (mid + Math.imul(ah0, bl4)) | 0;
  	    hi = (hi + Math.imul(ah0, bh4)) | 0;
  	    var w4 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w4 >>> 26)) | 0;
  	    w4 &= 0x3ffffff;
  	    /* k = 5 */
  	    lo = Math.imul(al5, bl0);
  	    mid = Math.imul(al5, bh0);
  	    mid = (mid + Math.imul(ah5, bl0)) | 0;
  	    hi = Math.imul(ah5, bh0);
  	    lo = (lo + Math.imul(al4, bl1)) | 0;
  	    mid = (mid + Math.imul(al4, bh1)) | 0;
  	    mid = (mid + Math.imul(ah4, bl1)) | 0;
  	    hi = (hi + Math.imul(ah4, bh1)) | 0;
  	    lo = (lo + Math.imul(al3, bl2)) | 0;
  	    mid = (mid + Math.imul(al3, bh2)) | 0;
  	    mid = (mid + Math.imul(ah3, bl2)) | 0;
  	    hi = (hi + Math.imul(ah3, bh2)) | 0;
  	    lo = (lo + Math.imul(al2, bl3)) | 0;
  	    mid = (mid + Math.imul(al2, bh3)) | 0;
  	    mid = (mid + Math.imul(ah2, bl3)) | 0;
  	    hi = (hi + Math.imul(ah2, bh3)) | 0;
  	    lo = (lo + Math.imul(al1, bl4)) | 0;
  	    mid = (mid + Math.imul(al1, bh4)) | 0;
  	    mid = (mid + Math.imul(ah1, bl4)) | 0;
  	    hi = (hi + Math.imul(ah1, bh4)) | 0;
  	    lo = (lo + Math.imul(al0, bl5)) | 0;
  	    mid = (mid + Math.imul(al0, bh5)) | 0;
  	    mid = (mid + Math.imul(ah0, bl5)) | 0;
  	    hi = (hi + Math.imul(ah0, bh5)) | 0;
  	    var w5 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w5 >>> 26)) | 0;
  	    w5 &= 0x3ffffff;
  	    /* k = 6 */
  	    lo = Math.imul(al6, bl0);
  	    mid = Math.imul(al6, bh0);
  	    mid = (mid + Math.imul(ah6, bl0)) | 0;
  	    hi = Math.imul(ah6, bh0);
  	    lo = (lo + Math.imul(al5, bl1)) | 0;
  	    mid = (mid + Math.imul(al5, bh1)) | 0;
  	    mid = (mid + Math.imul(ah5, bl1)) | 0;
  	    hi = (hi + Math.imul(ah5, bh1)) | 0;
  	    lo = (lo + Math.imul(al4, bl2)) | 0;
  	    mid = (mid + Math.imul(al4, bh2)) | 0;
  	    mid = (mid + Math.imul(ah4, bl2)) | 0;
  	    hi = (hi + Math.imul(ah4, bh2)) | 0;
  	    lo = (lo + Math.imul(al3, bl3)) | 0;
  	    mid = (mid + Math.imul(al3, bh3)) | 0;
  	    mid = (mid + Math.imul(ah3, bl3)) | 0;
  	    hi = (hi + Math.imul(ah3, bh3)) | 0;
  	    lo = (lo + Math.imul(al2, bl4)) | 0;
  	    mid = (mid + Math.imul(al2, bh4)) | 0;
  	    mid = (mid + Math.imul(ah2, bl4)) | 0;
  	    hi = (hi + Math.imul(ah2, bh4)) | 0;
  	    lo = (lo + Math.imul(al1, bl5)) | 0;
  	    mid = (mid + Math.imul(al1, bh5)) | 0;
  	    mid = (mid + Math.imul(ah1, bl5)) | 0;
  	    hi = (hi + Math.imul(ah1, bh5)) | 0;
  	    lo = (lo + Math.imul(al0, bl6)) | 0;
  	    mid = (mid + Math.imul(al0, bh6)) | 0;
  	    mid = (mid + Math.imul(ah0, bl6)) | 0;
  	    hi = (hi + Math.imul(ah0, bh6)) | 0;
  	    var w6 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w6 >>> 26)) | 0;
  	    w6 &= 0x3ffffff;
  	    /* k = 7 */
  	    lo = Math.imul(al7, bl0);
  	    mid = Math.imul(al7, bh0);
  	    mid = (mid + Math.imul(ah7, bl0)) | 0;
  	    hi = Math.imul(ah7, bh0);
  	    lo = (lo + Math.imul(al6, bl1)) | 0;
  	    mid = (mid + Math.imul(al6, bh1)) | 0;
  	    mid = (mid + Math.imul(ah6, bl1)) | 0;
  	    hi = (hi + Math.imul(ah6, bh1)) | 0;
  	    lo = (lo + Math.imul(al5, bl2)) | 0;
  	    mid = (mid + Math.imul(al5, bh2)) | 0;
  	    mid = (mid + Math.imul(ah5, bl2)) | 0;
  	    hi = (hi + Math.imul(ah5, bh2)) | 0;
  	    lo = (lo + Math.imul(al4, bl3)) | 0;
  	    mid = (mid + Math.imul(al4, bh3)) | 0;
  	    mid = (mid + Math.imul(ah4, bl3)) | 0;
  	    hi = (hi + Math.imul(ah4, bh3)) | 0;
  	    lo = (lo + Math.imul(al3, bl4)) | 0;
  	    mid = (mid + Math.imul(al3, bh4)) | 0;
  	    mid = (mid + Math.imul(ah3, bl4)) | 0;
  	    hi = (hi + Math.imul(ah3, bh4)) | 0;
  	    lo = (lo + Math.imul(al2, bl5)) | 0;
  	    mid = (mid + Math.imul(al2, bh5)) | 0;
  	    mid = (mid + Math.imul(ah2, bl5)) | 0;
  	    hi = (hi + Math.imul(ah2, bh5)) | 0;
  	    lo = (lo + Math.imul(al1, bl6)) | 0;
  	    mid = (mid + Math.imul(al1, bh6)) | 0;
  	    mid = (mid + Math.imul(ah1, bl6)) | 0;
  	    hi = (hi + Math.imul(ah1, bh6)) | 0;
  	    lo = (lo + Math.imul(al0, bl7)) | 0;
  	    mid = (mid + Math.imul(al0, bh7)) | 0;
  	    mid = (mid + Math.imul(ah0, bl7)) | 0;
  	    hi = (hi + Math.imul(ah0, bh7)) | 0;
  	    var w7 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w7 >>> 26)) | 0;
  	    w7 &= 0x3ffffff;
  	    /* k = 8 */
  	    lo = Math.imul(al8, bl0);
  	    mid = Math.imul(al8, bh0);
  	    mid = (mid + Math.imul(ah8, bl0)) | 0;
  	    hi = Math.imul(ah8, bh0);
  	    lo = (lo + Math.imul(al7, bl1)) | 0;
  	    mid = (mid + Math.imul(al7, bh1)) | 0;
  	    mid = (mid + Math.imul(ah7, bl1)) | 0;
  	    hi = (hi + Math.imul(ah7, bh1)) | 0;
  	    lo = (lo + Math.imul(al6, bl2)) | 0;
  	    mid = (mid + Math.imul(al6, bh2)) | 0;
  	    mid = (mid + Math.imul(ah6, bl2)) | 0;
  	    hi = (hi + Math.imul(ah6, bh2)) | 0;
  	    lo = (lo + Math.imul(al5, bl3)) | 0;
  	    mid = (mid + Math.imul(al5, bh3)) | 0;
  	    mid = (mid + Math.imul(ah5, bl3)) | 0;
  	    hi = (hi + Math.imul(ah5, bh3)) | 0;
  	    lo = (lo + Math.imul(al4, bl4)) | 0;
  	    mid = (mid + Math.imul(al4, bh4)) | 0;
  	    mid = (mid + Math.imul(ah4, bl4)) | 0;
  	    hi = (hi + Math.imul(ah4, bh4)) | 0;
  	    lo = (lo + Math.imul(al3, bl5)) | 0;
  	    mid = (mid + Math.imul(al3, bh5)) | 0;
  	    mid = (mid + Math.imul(ah3, bl5)) | 0;
  	    hi = (hi + Math.imul(ah3, bh5)) | 0;
  	    lo = (lo + Math.imul(al2, bl6)) | 0;
  	    mid = (mid + Math.imul(al2, bh6)) | 0;
  	    mid = (mid + Math.imul(ah2, bl6)) | 0;
  	    hi = (hi + Math.imul(ah2, bh6)) | 0;
  	    lo = (lo + Math.imul(al1, bl7)) | 0;
  	    mid = (mid + Math.imul(al1, bh7)) | 0;
  	    mid = (mid + Math.imul(ah1, bl7)) | 0;
  	    hi = (hi + Math.imul(ah1, bh7)) | 0;
  	    lo = (lo + Math.imul(al0, bl8)) | 0;
  	    mid = (mid + Math.imul(al0, bh8)) | 0;
  	    mid = (mid + Math.imul(ah0, bl8)) | 0;
  	    hi = (hi + Math.imul(ah0, bh8)) | 0;
  	    var w8 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w8 >>> 26)) | 0;
  	    w8 &= 0x3ffffff;
  	    /* k = 9 */
  	    lo = Math.imul(al9, bl0);
  	    mid = Math.imul(al9, bh0);
  	    mid = (mid + Math.imul(ah9, bl0)) | 0;
  	    hi = Math.imul(ah9, bh0);
  	    lo = (lo + Math.imul(al8, bl1)) | 0;
  	    mid = (mid + Math.imul(al8, bh1)) | 0;
  	    mid = (mid + Math.imul(ah8, bl1)) | 0;
  	    hi = (hi + Math.imul(ah8, bh1)) | 0;
  	    lo = (lo + Math.imul(al7, bl2)) | 0;
  	    mid = (mid + Math.imul(al7, bh2)) | 0;
  	    mid = (mid + Math.imul(ah7, bl2)) | 0;
  	    hi = (hi + Math.imul(ah7, bh2)) | 0;
  	    lo = (lo + Math.imul(al6, bl3)) | 0;
  	    mid = (mid + Math.imul(al6, bh3)) | 0;
  	    mid = (mid + Math.imul(ah6, bl3)) | 0;
  	    hi = (hi + Math.imul(ah6, bh3)) | 0;
  	    lo = (lo + Math.imul(al5, bl4)) | 0;
  	    mid = (mid + Math.imul(al5, bh4)) | 0;
  	    mid = (mid + Math.imul(ah5, bl4)) | 0;
  	    hi = (hi + Math.imul(ah5, bh4)) | 0;
  	    lo = (lo + Math.imul(al4, bl5)) | 0;
  	    mid = (mid + Math.imul(al4, bh5)) | 0;
  	    mid = (mid + Math.imul(ah4, bl5)) | 0;
  	    hi = (hi + Math.imul(ah4, bh5)) | 0;
  	    lo = (lo + Math.imul(al3, bl6)) | 0;
  	    mid = (mid + Math.imul(al3, bh6)) | 0;
  	    mid = (mid + Math.imul(ah3, bl6)) | 0;
  	    hi = (hi + Math.imul(ah3, bh6)) | 0;
  	    lo = (lo + Math.imul(al2, bl7)) | 0;
  	    mid = (mid + Math.imul(al2, bh7)) | 0;
  	    mid = (mid + Math.imul(ah2, bl7)) | 0;
  	    hi = (hi + Math.imul(ah2, bh7)) | 0;
  	    lo = (lo + Math.imul(al1, bl8)) | 0;
  	    mid = (mid + Math.imul(al1, bh8)) | 0;
  	    mid = (mid + Math.imul(ah1, bl8)) | 0;
  	    hi = (hi + Math.imul(ah1, bh8)) | 0;
  	    lo = (lo + Math.imul(al0, bl9)) | 0;
  	    mid = (mid + Math.imul(al0, bh9)) | 0;
  	    mid = (mid + Math.imul(ah0, bl9)) | 0;
  	    hi = (hi + Math.imul(ah0, bh9)) | 0;
  	    var w9 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w9 >>> 26)) | 0;
  	    w9 &= 0x3ffffff;
  	    /* k = 10 */
  	    lo = Math.imul(al9, bl1);
  	    mid = Math.imul(al9, bh1);
  	    mid = (mid + Math.imul(ah9, bl1)) | 0;
  	    hi = Math.imul(ah9, bh1);
  	    lo = (lo + Math.imul(al8, bl2)) | 0;
  	    mid = (mid + Math.imul(al8, bh2)) | 0;
  	    mid = (mid + Math.imul(ah8, bl2)) | 0;
  	    hi = (hi + Math.imul(ah8, bh2)) | 0;
  	    lo = (lo + Math.imul(al7, bl3)) | 0;
  	    mid = (mid + Math.imul(al7, bh3)) | 0;
  	    mid = (mid + Math.imul(ah7, bl3)) | 0;
  	    hi = (hi + Math.imul(ah7, bh3)) | 0;
  	    lo = (lo + Math.imul(al6, bl4)) | 0;
  	    mid = (mid + Math.imul(al6, bh4)) | 0;
  	    mid = (mid + Math.imul(ah6, bl4)) | 0;
  	    hi = (hi + Math.imul(ah6, bh4)) | 0;
  	    lo = (lo + Math.imul(al5, bl5)) | 0;
  	    mid = (mid + Math.imul(al5, bh5)) | 0;
  	    mid = (mid + Math.imul(ah5, bl5)) | 0;
  	    hi = (hi + Math.imul(ah5, bh5)) | 0;
  	    lo = (lo + Math.imul(al4, bl6)) | 0;
  	    mid = (mid + Math.imul(al4, bh6)) | 0;
  	    mid = (mid + Math.imul(ah4, bl6)) | 0;
  	    hi = (hi + Math.imul(ah4, bh6)) | 0;
  	    lo = (lo + Math.imul(al3, bl7)) | 0;
  	    mid = (mid + Math.imul(al3, bh7)) | 0;
  	    mid = (mid + Math.imul(ah3, bl7)) | 0;
  	    hi = (hi + Math.imul(ah3, bh7)) | 0;
  	    lo = (lo + Math.imul(al2, bl8)) | 0;
  	    mid = (mid + Math.imul(al2, bh8)) | 0;
  	    mid = (mid + Math.imul(ah2, bl8)) | 0;
  	    hi = (hi + Math.imul(ah2, bh8)) | 0;
  	    lo = (lo + Math.imul(al1, bl9)) | 0;
  	    mid = (mid + Math.imul(al1, bh9)) | 0;
  	    mid = (mid + Math.imul(ah1, bl9)) | 0;
  	    hi = (hi + Math.imul(ah1, bh9)) | 0;
  	    var w10 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w10 >>> 26)) | 0;
  	    w10 &= 0x3ffffff;
  	    /* k = 11 */
  	    lo = Math.imul(al9, bl2);
  	    mid = Math.imul(al9, bh2);
  	    mid = (mid + Math.imul(ah9, bl2)) | 0;
  	    hi = Math.imul(ah9, bh2);
  	    lo = (lo + Math.imul(al8, bl3)) | 0;
  	    mid = (mid + Math.imul(al8, bh3)) | 0;
  	    mid = (mid + Math.imul(ah8, bl3)) | 0;
  	    hi = (hi + Math.imul(ah8, bh3)) | 0;
  	    lo = (lo + Math.imul(al7, bl4)) | 0;
  	    mid = (mid + Math.imul(al7, bh4)) | 0;
  	    mid = (mid + Math.imul(ah7, bl4)) | 0;
  	    hi = (hi + Math.imul(ah7, bh4)) | 0;
  	    lo = (lo + Math.imul(al6, bl5)) | 0;
  	    mid = (mid + Math.imul(al6, bh5)) | 0;
  	    mid = (mid + Math.imul(ah6, bl5)) | 0;
  	    hi = (hi + Math.imul(ah6, bh5)) | 0;
  	    lo = (lo + Math.imul(al5, bl6)) | 0;
  	    mid = (mid + Math.imul(al5, bh6)) | 0;
  	    mid = (mid + Math.imul(ah5, bl6)) | 0;
  	    hi = (hi + Math.imul(ah5, bh6)) | 0;
  	    lo = (lo + Math.imul(al4, bl7)) | 0;
  	    mid = (mid + Math.imul(al4, bh7)) | 0;
  	    mid = (mid + Math.imul(ah4, bl7)) | 0;
  	    hi = (hi + Math.imul(ah4, bh7)) | 0;
  	    lo = (lo + Math.imul(al3, bl8)) | 0;
  	    mid = (mid + Math.imul(al3, bh8)) | 0;
  	    mid = (mid + Math.imul(ah3, bl8)) | 0;
  	    hi = (hi + Math.imul(ah3, bh8)) | 0;
  	    lo = (lo + Math.imul(al2, bl9)) | 0;
  	    mid = (mid + Math.imul(al2, bh9)) | 0;
  	    mid = (mid + Math.imul(ah2, bl9)) | 0;
  	    hi = (hi + Math.imul(ah2, bh9)) | 0;
  	    var w11 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w11 >>> 26)) | 0;
  	    w11 &= 0x3ffffff;
  	    /* k = 12 */
  	    lo = Math.imul(al9, bl3);
  	    mid = Math.imul(al9, bh3);
  	    mid = (mid + Math.imul(ah9, bl3)) | 0;
  	    hi = Math.imul(ah9, bh3);
  	    lo = (lo + Math.imul(al8, bl4)) | 0;
  	    mid = (mid + Math.imul(al8, bh4)) | 0;
  	    mid = (mid + Math.imul(ah8, bl4)) | 0;
  	    hi = (hi + Math.imul(ah8, bh4)) | 0;
  	    lo = (lo + Math.imul(al7, bl5)) | 0;
  	    mid = (mid + Math.imul(al7, bh5)) | 0;
  	    mid = (mid + Math.imul(ah7, bl5)) | 0;
  	    hi = (hi + Math.imul(ah7, bh5)) | 0;
  	    lo = (lo + Math.imul(al6, bl6)) | 0;
  	    mid = (mid + Math.imul(al6, bh6)) | 0;
  	    mid = (mid + Math.imul(ah6, bl6)) | 0;
  	    hi = (hi + Math.imul(ah6, bh6)) | 0;
  	    lo = (lo + Math.imul(al5, bl7)) | 0;
  	    mid = (mid + Math.imul(al5, bh7)) | 0;
  	    mid = (mid + Math.imul(ah5, bl7)) | 0;
  	    hi = (hi + Math.imul(ah5, bh7)) | 0;
  	    lo = (lo + Math.imul(al4, bl8)) | 0;
  	    mid = (mid + Math.imul(al4, bh8)) | 0;
  	    mid = (mid + Math.imul(ah4, bl8)) | 0;
  	    hi = (hi + Math.imul(ah4, bh8)) | 0;
  	    lo = (lo + Math.imul(al3, bl9)) | 0;
  	    mid = (mid + Math.imul(al3, bh9)) | 0;
  	    mid = (mid + Math.imul(ah3, bl9)) | 0;
  	    hi = (hi + Math.imul(ah3, bh9)) | 0;
  	    var w12 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w12 >>> 26)) | 0;
  	    w12 &= 0x3ffffff;
  	    /* k = 13 */
  	    lo = Math.imul(al9, bl4);
  	    mid = Math.imul(al9, bh4);
  	    mid = (mid + Math.imul(ah9, bl4)) | 0;
  	    hi = Math.imul(ah9, bh4);
  	    lo = (lo + Math.imul(al8, bl5)) | 0;
  	    mid = (mid + Math.imul(al8, bh5)) | 0;
  	    mid = (mid + Math.imul(ah8, bl5)) | 0;
  	    hi = (hi + Math.imul(ah8, bh5)) | 0;
  	    lo = (lo + Math.imul(al7, bl6)) | 0;
  	    mid = (mid + Math.imul(al7, bh6)) | 0;
  	    mid = (mid + Math.imul(ah7, bl6)) | 0;
  	    hi = (hi + Math.imul(ah7, bh6)) | 0;
  	    lo = (lo + Math.imul(al6, bl7)) | 0;
  	    mid = (mid + Math.imul(al6, bh7)) | 0;
  	    mid = (mid + Math.imul(ah6, bl7)) | 0;
  	    hi = (hi + Math.imul(ah6, bh7)) | 0;
  	    lo = (lo + Math.imul(al5, bl8)) | 0;
  	    mid = (mid + Math.imul(al5, bh8)) | 0;
  	    mid = (mid + Math.imul(ah5, bl8)) | 0;
  	    hi = (hi + Math.imul(ah5, bh8)) | 0;
  	    lo = (lo + Math.imul(al4, bl9)) | 0;
  	    mid = (mid + Math.imul(al4, bh9)) | 0;
  	    mid = (mid + Math.imul(ah4, bl9)) | 0;
  	    hi = (hi + Math.imul(ah4, bh9)) | 0;
  	    var w13 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w13 >>> 26)) | 0;
  	    w13 &= 0x3ffffff;
  	    /* k = 14 */
  	    lo = Math.imul(al9, bl5);
  	    mid = Math.imul(al9, bh5);
  	    mid = (mid + Math.imul(ah9, bl5)) | 0;
  	    hi = Math.imul(ah9, bh5);
  	    lo = (lo + Math.imul(al8, bl6)) | 0;
  	    mid = (mid + Math.imul(al8, bh6)) | 0;
  	    mid = (mid + Math.imul(ah8, bl6)) | 0;
  	    hi = (hi + Math.imul(ah8, bh6)) | 0;
  	    lo = (lo + Math.imul(al7, bl7)) | 0;
  	    mid = (mid + Math.imul(al7, bh7)) | 0;
  	    mid = (mid + Math.imul(ah7, bl7)) | 0;
  	    hi = (hi + Math.imul(ah7, bh7)) | 0;
  	    lo = (lo + Math.imul(al6, bl8)) | 0;
  	    mid = (mid + Math.imul(al6, bh8)) | 0;
  	    mid = (mid + Math.imul(ah6, bl8)) | 0;
  	    hi = (hi + Math.imul(ah6, bh8)) | 0;
  	    lo = (lo + Math.imul(al5, bl9)) | 0;
  	    mid = (mid + Math.imul(al5, bh9)) | 0;
  	    mid = (mid + Math.imul(ah5, bl9)) | 0;
  	    hi = (hi + Math.imul(ah5, bh9)) | 0;
  	    var w14 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w14 >>> 26)) | 0;
  	    w14 &= 0x3ffffff;
  	    /* k = 15 */
  	    lo = Math.imul(al9, bl6);
  	    mid = Math.imul(al9, bh6);
  	    mid = (mid + Math.imul(ah9, bl6)) | 0;
  	    hi = Math.imul(ah9, bh6);
  	    lo = (lo + Math.imul(al8, bl7)) | 0;
  	    mid = (mid + Math.imul(al8, bh7)) | 0;
  	    mid = (mid + Math.imul(ah8, bl7)) | 0;
  	    hi = (hi + Math.imul(ah8, bh7)) | 0;
  	    lo = (lo + Math.imul(al7, bl8)) | 0;
  	    mid = (mid + Math.imul(al7, bh8)) | 0;
  	    mid = (mid + Math.imul(ah7, bl8)) | 0;
  	    hi = (hi + Math.imul(ah7, bh8)) | 0;
  	    lo = (lo + Math.imul(al6, bl9)) | 0;
  	    mid = (mid + Math.imul(al6, bh9)) | 0;
  	    mid = (mid + Math.imul(ah6, bl9)) | 0;
  	    hi = (hi + Math.imul(ah6, bh9)) | 0;
  	    var w15 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w15 >>> 26)) | 0;
  	    w15 &= 0x3ffffff;
  	    /* k = 16 */
  	    lo = Math.imul(al9, bl7);
  	    mid = Math.imul(al9, bh7);
  	    mid = (mid + Math.imul(ah9, bl7)) | 0;
  	    hi = Math.imul(ah9, bh7);
  	    lo = (lo + Math.imul(al8, bl8)) | 0;
  	    mid = (mid + Math.imul(al8, bh8)) | 0;
  	    mid = (mid + Math.imul(ah8, bl8)) | 0;
  	    hi = (hi + Math.imul(ah8, bh8)) | 0;
  	    lo = (lo + Math.imul(al7, bl9)) | 0;
  	    mid = (mid + Math.imul(al7, bh9)) | 0;
  	    mid = (mid + Math.imul(ah7, bl9)) | 0;
  	    hi = (hi + Math.imul(ah7, bh9)) | 0;
  	    var w16 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w16 >>> 26)) | 0;
  	    w16 &= 0x3ffffff;
  	    /* k = 17 */
  	    lo = Math.imul(al9, bl8);
  	    mid = Math.imul(al9, bh8);
  	    mid = (mid + Math.imul(ah9, bl8)) | 0;
  	    hi = Math.imul(ah9, bh8);
  	    lo = (lo + Math.imul(al8, bl9)) | 0;
  	    mid = (mid + Math.imul(al8, bh9)) | 0;
  	    mid = (mid + Math.imul(ah8, bl9)) | 0;
  	    hi = (hi + Math.imul(ah8, bh9)) | 0;
  	    var w17 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w17 >>> 26)) | 0;
  	    w17 &= 0x3ffffff;
  	    /* k = 18 */
  	    lo = Math.imul(al9, bl9);
  	    mid = Math.imul(al9, bh9);
  	    mid = (mid + Math.imul(ah9, bl9)) | 0;
  	    hi = Math.imul(ah9, bh9);
  	    var w18 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w18 >>> 26)) | 0;
  	    w18 &= 0x3ffffff;
  	    o[0] = w0;
  	    o[1] = w1;
  	    o[2] = w2;
  	    o[3] = w3;
  	    o[4] = w4;
  	    o[5] = w5;
  	    o[6] = w6;
  	    o[7] = w7;
  	    o[8] = w8;
  	    o[9] = w9;
  	    o[10] = w10;
  	    o[11] = w11;
  	    o[12] = w12;
  	    o[13] = w13;
  	    o[14] = w14;
  	    o[15] = w15;
  	    o[16] = w16;
  	    o[17] = w17;
  	    o[18] = w18;
  	    if (c !== 0) {
  	      o[19] = c;
  	      out.length++;
  	    }
  	    return out;
  	  };

  	  // Polyfill comb
  	  if (!Math.imul) {
  	    comb10MulTo = smallMulTo;
  	  }

  	  function bigMulTo (self, num, out) {
  	    out.negative = num.negative ^ self.negative;
  	    out.length = self.length + num.length;

  	    var carry = 0;
  	    var hncarry = 0;
  	    for (var k = 0; k < out.length - 1; k++) {
  	      // Sum all words with the same `i + j = k` and accumulate `ncarry`,
  	      // note that ncarry could be >= 0x3ffffff
  	      var ncarry = hncarry;
  	      hncarry = 0;
  	      var rword = carry & 0x3ffffff;
  	      var maxJ = Math.min(k, num.length - 1);
  	      for (var j = Math.max(0, k - self.length + 1); j <= maxJ; j++) {
  	        var i = k - j;
  	        var a = self.words[i] | 0;
  	        var b = num.words[j] | 0;
  	        var r = a * b;

  	        var lo = r & 0x3ffffff;
  	        ncarry = (ncarry + ((r / 0x4000000) | 0)) | 0;
  	        lo = (lo + rword) | 0;
  	        rword = lo & 0x3ffffff;
  	        ncarry = (ncarry + (lo >>> 26)) | 0;

  	        hncarry += ncarry >>> 26;
  	        ncarry &= 0x3ffffff;
  	      }
  	      out.words[k] = rword;
  	      carry = ncarry;
  	      ncarry = hncarry;
  	    }
  	    if (carry !== 0) {
  	      out.words[k] = carry;
  	    } else {
  	      out.length--;
  	    }

  	    return out.strip();
  	  }

  	  function jumboMulTo (self, num, out) {
  	    var fftm = new FFTM();
  	    return fftm.mulp(self, num, out);
  	  }

  	  BN.prototype.mulTo = function mulTo (num, out) {
  	    var res;
  	    var len = this.length + num.length;
  	    if (this.length === 10 && num.length === 10) {
  	      res = comb10MulTo(this, num, out);
  	    } else if (len < 63) {
  	      res = smallMulTo(this, num, out);
  	    } else if (len < 1024) {
  	      res = bigMulTo(this, num, out);
  	    } else {
  	      res = jumboMulTo(this, num, out);
  	    }

  	    return res;
  	  };

  	  // Cooley-Tukey algorithm for FFT
  	  // slightly revisited to rely on looping instead of recursion

  	  function FFTM (x, y) {
  	    this.x = x;
  	    this.y = y;
  	  }

  	  FFTM.prototype.makeRBT = function makeRBT (N) {
  	    var t = new Array(N);
  	    var l = BN.prototype._countBits(N) - 1;
  	    for (var i = 0; i < N; i++) {
  	      t[i] = this.revBin(i, l, N);
  	    }

  	    return t;
  	  };

  	  // Returns binary-reversed representation of `x`
  	  FFTM.prototype.revBin = function revBin (x, l, N) {
  	    if (x === 0 || x === N - 1) return x;

  	    var rb = 0;
  	    for (var i = 0; i < l; i++) {
  	      rb |= (x & 1) << (l - i - 1);
  	      x >>= 1;
  	    }

  	    return rb;
  	  };

  	  // Performs "tweedling" phase, therefore 'emulating'
  	  // behaviour of the recursive algorithm
  	  FFTM.prototype.permute = function permute (rbt, rws, iws, rtws, itws, N) {
  	    for (var i = 0; i < N; i++) {
  	      rtws[i] = rws[rbt[i]];
  	      itws[i] = iws[rbt[i]];
  	    }
  	  };

  	  FFTM.prototype.transform = function transform (rws, iws, rtws, itws, N, rbt) {
  	    this.permute(rbt, rws, iws, rtws, itws, N);

  	    for (var s = 1; s < N; s <<= 1) {
  	      var l = s << 1;

  	      var rtwdf = Math.cos(2 * Math.PI / l);
  	      var itwdf = Math.sin(2 * Math.PI / l);

  	      for (var p = 0; p < N; p += l) {
  	        var rtwdf_ = rtwdf;
  	        var itwdf_ = itwdf;

  	        for (var j = 0; j < s; j++) {
  	          var re = rtws[p + j];
  	          var ie = itws[p + j];

  	          var ro = rtws[p + j + s];
  	          var io = itws[p + j + s];

  	          var rx = rtwdf_ * ro - itwdf_ * io;

  	          io = rtwdf_ * io + itwdf_ * ro;
  	          ro = rx;

  	          rtws[p + j] = re + ro;
  	          itws[p + j] = ie + io;

  	          rtws[p + j + s] = re - ro;
  	          itws[p + j + s] = ie - io;

  	          /* jshint maxdepth : false */
  	          if (j !== l) {
  	            rx = rtwdf * rtwdf_ - itwdf * itwdf_;

  	            itwdf_ = rtwdf * itwdf_ + itwdf * rtwdf_;
  	            rtwdf_ = rx;
  	          }
  	        }
  	      }
  	    }
  	  };

  	  FFTM.prototype.guessLen13b = function guessLen13b (n, m) {
  	    var N = Math.max(m, n) | 1;
  	    var odd = N & 1;
  	    var i = 0;
  	    for (N = N / 2 | 0; N; N = N >>> 1) {
  	      i++;
  	    }

  	    return 1 << i + 1 + odd;
  	  };

  	  FFTM.prototype.conjugate = function conjugate (rws, iws, N) {
  	    if (N <= 1) return;

  	    for (var i = 0; i < N / 2; i++) {
  	      var t = rws[i];

  	      rws[i] = rws[N - i - 1];
  	      rws[N - i - 1] = t;

  	      t = iws[i];

  	      iws[i] = -iws[N - i - 1];
  	      iws[N - i - 1] = -t;
  	    }
  	  };

  	  FFTM.prototype.normalize13b = function normalize13b (ws, N) {
  	    var carry = 0;
  	    for (var i = 0; i < N / 2; i++) {
  	      var w = Math.round(ws[2 * i + 1] / N) * 0x2000 +
  	        Math.round(ws[2 * i] / N) +
  	        carry;

  	      ws[i] = w & 0x3ffffff;

  	      if (w < 0x4000000) {
  	        carry = 0;
  	      } else {
  	        carry = w / 0x4000000 | 0;
  	      }
  	    }

  	    return ws;
  	  };

  	  FFTM.prototype.convert13b = function convert13b (ws, len, rws, N) {
  	    var carry = 0;
  	    for (var i = 0; i < len; i++) {
  	      carry = carry + (ws[i] | 0);

  	      rws[2 * i] = carry & 0x1fff; carry = carry >>> 13;
  	      rws[2 * i + 1] = carry & 0x1fff; carry = carry >>> 13;
  	    }

  	    // Pad with zeroes
  	    for (i = 2 * len; i < N; ++i) {
  	      rws[i] = 0;
  	    }

  	    assert(carry === 0);
  	    assert((carry & ~0x1fff) === 0);
  	  };

  	  FFTM.prototype.stub = function stub (N) {
  	    var ph = new Array(N);
  	    for (var i = 0; i < N; i++) {
  	      ph[i] = 0;
  	    }

  	    return ph;
  	  };

  	  FFTM.prototype.mulp = function mulp (x, y, out) {
  	    var N = 2 * this.guessLen13b(x.length, y.length);

  	    var rbt = this.makeRBT(N);

  	    var _ = this.stub(N);

  	    var rws = new Array(N);
  	    var rwst = new Array(N);
  	    var iwst = new Array(N);

  	    var nrws = new Array(N);
  	    var nrwst = new Array(N);
  	    var niwst = new Array(N);

  	    var rmws = out.words;
  	    rmws.length = N;

  	    this.convert13b(x.words, x.length, rws, N);
  	    this.convert13b(y.words, y.length, nrws, N);

  	    this.transform(rws, _, rwst, iwst, N, rbt);
  	    this.transform(nrws, _, nrwst, niwst, N, rbt);

  	    for (var i = 0; i < N; i++) {
  	      var rx = rwst[i] * nrwst[i] - iwst[i] * niwst[i];
  	      iwst[i] = rwst[i] * niwst[i] + iwst[i] * nrwst[i];
  	      rwst[i] = rx;
  	    }

  	    this.conjugate(rwst, iwst, N);
  	    this.transform(rwst, iwst, rmws, _, N, rbt);
  	    this.conjugate(rmws, _, N);
  	    this.normalize13b(rmws, N);

  	    out.negative = x.negative ^ y.negative;
  	    out.length = x.length + y.length;
  	    return out.strip();
  	  };

  	  // Multiply `this` by `num`
  	  BN.prototype.mul = function mul (num) {
  	    var out = new BN(null);
  	    out.words = new Array(this.length + num.length);
  	    return this.mulTo(num, out);
  	  };

  	  // Multiply employing FFT
  	  BN.prototype.mulf = function mulf (num) {
  	    var out = new BN(null);
  	    out.words = new Array(this.length + num.length);
  	    return jumboMulTo(this, num, out);
  	  };

  	  // In-place Multiplication
  	  BN.prototype.imul = function imul (num) {
  	    return this.clone().mulTo(num, this);
  	  };

  	  BN.prototype.imuln = function imuln (num) {
  	    assert(typeof num === 'number');
  	    assert(num < 0x4000000);

  	    // Carry
  	    var carry = 0;
  	    for (var i = 0; i < this.length; i++) {
  	      var w = (this.words[i] | 0) * num;
  	      var lo = (w & 0x3ffffff) + (carry & 0x3ffffff);
  	      carry >>= 26;
  	      carry += (w / 0x4000000) | 0;
  	      // NOTE: lo is 27bit maximum
  	      carry += lo >>> 26;
  	      this.words[i] = lo & 0x3ffffff;
  	    }

  	    if (carry !== 0) {
  	      this.words[i] = carry;
  	      this.length++;
  	    }

  	    return this;
  	  };

  	  BN.prototype.muln = function muln (num) {
  	    return this.clone().imuln(num);
  	  };

  	  // `this` * `this`
  	  BN.prototype.sqr = function sqr () {
  	    return this.mul(this);
  	  };

  	  // `this` * `this` in-place
  	  BN.prototype.isqr = function isqr () {
  	    return this.imul(this.clone());
  	  };

  	  // Math.pow(`this`, `num`)
  	  BN.prototype.pow = function pow (num) {
  	    var w = toBitArray(num);
  	    if (w.length === 0) return new BN(1);

  	    // Skip leading zeroes
  	    var res = this;
  	    for (var i = 0; i < w.length; i++, res = res.sqr()) {
  	      if (w[i] !== 0) break;
  	    }

  	    if (++i < w.length) {
  	      for (var q = res.sqr(); i < w.length; i++, q = q.sqr()) {
  	        if (w[i] === 0) continue;

  	        res = res.mul(q);
  	      }
  	    }

  	    return res;
  	  };

  	  // Shift-left in-place
  	  BN.prototype.iushln = function iushln (bits) {
  	    assert(typeof bits === 'number' && bits >= 0);
  	    var r = bits % 26;
  	    var s = (bits - r) / 26;
  	    var carryMask = (0x3ffffff >>> (26 - r)) << (26 - r);
  	    var i;

  	    if (r !== 0) {
  	      var carry = 0;

  	      for (i = 0; i < this.length; i++) {
  	        var newCarry = this.words[i] & carryMask;
  	        var c = ((this.words[i] | 0) - newCarry) << r;
  	        this.words[i] = c | carry;
  	        carry = newCarry >>> (26 - r);
  	      }

  	      if (carry) {
  	        this.words[i] = carry;
  	        this.length++;
  	      }
  	    }

  	    if (s !== 0) {
  	      for (i = this.length - 1; i >= 0; i--) {
  	        this.words[i + s] = this.words[i];
  	      }

  	      for (i = 0; i < s; i++) {
  	        this.words[i] = 0;
  	      }

  	      this.length += s;
  	    }

  	    return this.strip();
  	  };

  	  BN.prototype.ishln = function ishln (bits) {
  	    // TODO(indutny): implement me
  	    assert(this.negative === 0);
  	    return this.iushln(bits);
  	  };

  	  // Shift-right in-place
  	  // NOTE: `hint` is a lowest bit before trailing zeroes
  	  // NOTE: if `extended` is present - it will be filled with destroyed bits
  	  BN.prototype.iushrn = function iushrn (bits, hint, extended) {
  	    assert(typeof bits === 'number' && bits >= 0);
  	    var h;
  	    if (hint) {
  	      h = (hint - (hint % 26)) / 26;
  	    } else {
  	      h = 0;
  	    }

  	    var r = bits % 26;
  	    var s = Math.min((bits - r) / 26, this.length);
  	    var mask = 0x3ffffff ^ ((0x3ffffff >>> r) << r);
  	    var maskedWords = extended;

  	    h -= s;
  	    h = Math.max(0, h);

  	    // Extended mode, copy masked part
  	    if (maskedWords) {
  	      for (var i = 0; i < s; i++) {
  	        maskedWords.words[i] = this.words[i];
  	      }
  	      maskedWords.length = s;
  	    }

  	    if (s === 0) ; else if (this.length > s) {
  	      this.length -= s;
  	      for (i = 0; i < this.length; i++) {
  	        this.words[i] = this.words[i + s];
  	      }
  	    } else {
  	      this.words[0] = 0;
  	      this.length = 1;
  	    }

  	    var carry = 0;
  	    for (i = this.length - 1; i >= 0 && (carry !== 0 || i >= h); i--) {
  	      var word = this.words[i] | 0;
  	      this.words[i] = (carry << (26 - r)) | (word >>> r);
  	      carry = word & mask;
  	    }

  	    // Push carried bits as a mask
  	    if (maskedWords && carry !== 0) {
  	      maskedWords.words[maskedWords.length++] = carry;
  	    }

  	    if (this.length === 0) {
  	      this.words[0] = 0;
  	      this.length = 1;
  	    }

  	    return this.strip();
  	  };

  	  BN.prototype.ishrn = function ishrn (bits, hint, extended) {
  	    // TODO(indutny): implement me
  	    assert(this.negative === 0);
  	    return this.iushrn(bits, hint, extended);
  	  };

  	  // Shift-left
  	  BN.prototype.shln = function shln (bits) {
  	    return this.clone().ishln(bits);
  	  };

  	  BN.prototype.ushln = function ushln (bits) {
  	    return this.clone().iushln(bits);
  	  };

  	  // Shift-right
  	  BN.prototype.shrn = function shrn (bits) {
  	    return this.clone().ishrn(bits);
  	  };

  	  BN.prototype.ushrn = function ushrn (bits) {
  	    return this.clone().iushrn(bits);
  	  };

  	  // Test if n bit is set
  	  BN.prototype.testn = function testn (bit) {
  	    assert(typeof bit === 'number' && bit >= 0);
  	    var r = bit % 26;
  	    var s = (bit - r) / 26;
  	    var q = 1 << r;

  	    // Fast case: bit is much higher than all existing words
  	    if (this.length <= s) return false;

  	    // Check bit and return
  	    var w = this.words[s];

  	    return !!(w & q);
  	  };

  	  // Return only lowers bits of number (in-place)
  	  BN.prototype.imaskn = function imaskn (bits) {
  	    assert(typeof bits === 'number' && bits >= 0);
  	    var r = bits % 26;
  	    var s = (bits - r) / 26;

  	    assert(this.negative === 0, 'imaskn works only with positive numbers');

  	    if (this.length <= s) {
  	      return this;
  	    }

  	    if (r !== 0) {
  	      s++;
  	    }
  	    this.length = Math.min(s, this.length);

  	    if (r !== 0) {
  	      var mask = 0x3ffffff ^ ((0x3ffffff >>> r) << r);
  	      this.words[this.length - 1] &= mask;
  	    }

  	    return this.strip();
  	  };

  	  // Return only lowers bits of number
  	  BN.prototype.maskn = function maskn (bits) {
  	    return this.clone().imaskn(bits);
  	  };

  	  // Add plain number `num` to `this`
  	  BN.prototype.iaddn = function iaddn (num) {
  	    assert(typeof num === 'number');
  	    assert(num < 0x4000000);
  	    if (num < 0) return this.isubn(-num);

  	    // Possible sign change
  	    if (this.negative !== 0) {
  	      if (this.length === 1 && (this.words[0] | 0) < num) {
  	        this.words[0] = num - (this.words[0] | 0);
  	        this.negative = 0;
  	        return this;
  	      }

  	      this.negative = 0;
  	      this.isubn(num);
  	      this.negative = 1;
  	      return this;
  	    }

  	    // Add without checks
  	    return this._iaddn(num);
  	  };

  	  BN.prototype._iaddn = function _iaddn (num) {
  	    this.words[0] += num;

  	    // Carry
  	    for (var i = 0; i < this.length && this.words[i] >= 0x4000000; i++) {
  	      this.words[i] -= 0x4000000;
  	      if (i === this.length - 1) {
  	        this.words[i + 1] = 1;
  	      } else {
  	        this.words[i + 1]++;
  	      }
  	    }
  	    this.length = Math.max(this.length, i + 1);

  	    return this;
  	  };

  	  // Subtract plain number `num` from `this`
  	  BN.prototype.isubn = function isubn (num) {
  	    assert(typeof num === 'number');
  	    assert(num < 0x4000000);
  	    if (num < 0) return this.iaddn(-num);

  	    if (this.negative !== 0) {
  	      this.negative = 0;
  	      this.iaddn(num);
  	      this.negative = 1;
  	      return this;
  	    }

  	    this.words[0] -= num;

  	    if (this.length === 1 && this.words[0] < 0) {
  	      this.words[0] = -this.words[0];
  	      this.negative = 1;
  	    } else {
  	      // Carry
  	      for (var i = 0; i < this.length && this.words[i] < 0; i++) {
  	        this.words[i] += 0x4000000;
  	        this.words[i + 1] -= 1;
  	      }
  	    }

  	    return this.strip();
  	  };

  	  BN.prototype.addn = function addn (num) {
  	    return this.clone().iaddn(num);
  	  };

  	  BN.prototype.subn = function subn (num) {
  	    return this.clone().isubn(num);
  	  };

  	  BN.prototype.iabs = function iabs () {
  	    this.negative = 0;

  	    return this;
  	  };

  	  BN.prototype.abs = function abs () {
  	    return this.clone().iabs();
  	  };

  	  BN.prototype._ishlnsubmul = function _ishlnsubmul (num, mul, shift) {
  	    var len = num.length + shift;
  	    var i;

  	    this._expand(len);

  	    var w;
  	    var carry = 0;
  	    for (i = 0; i < num.length; i++) {
  	      w = (this.words[i + shift] | 0) + carry;
  	      var right = (num.words[i] | 0) * mul;
  	      w -= right & 0x3ffffff;
  	      carry = (w >> 26) - ((right / 0x4000000) | 0);
  	      this.words[i + shift] = w & 0x3ffffff;
  	    }
  	    for (; i < this.length - shift; i++) {
  	      w = (this.words[i + shift] | 0) + carry;
  	      carry = w >> 26;
  	      this.words[i + shift] = w & 0x3ffffff;
  	    }

  	    if (carry === 0) return this.strip();

  	    // Subtraction overflow
  	    assert(carry === -1);
  	    carry = 0;
  	    for (i = 0; i < this.length; i++) {
  	      w = -(this.words[i] | 0) + carry;
  	      carry = w >> 26;
  	      this.words[i] = w & 0x3ffffff;
  	    }
  	    this.negative = 1;

  	    return this.strip();
  	  };

  	  BN.prototype._wordDiv = function _wordDiv (num, mode) {
  	    var shift = this.length - num.length;

  	    var a = this.clone();
  	    var b = num;

  	    // Normalize
  	    var bhi = b.words[b.length - 1] | 0;
  	    var bhiBits = this._countBits(bhi);
  	    shift = 26 - bhiBits;
  	    if (shift !== 0) {
  	      b = b.ushln(shift);
  	      a.iushln(shift);
  	      bhi = b.words[b.length - 1] | 0;
  	    }

  	    // Initialize quotient
  	    var m = a.length - b.length;
  	    var q;

  	    if (mode !== 'mod') {
  	      q = new BN(null);
  	      q.length = m + 1;
  	      q.words = new Array(q.length);
  	      for (var i = 0; i < q.length; i++) {
  	        q.words[i] = 0;
  	      }
  	    }

  	    var diff = a.clone()._ishlnsubmul(b, 1, m);
  	    if (diff.negative === 0) {
  	      a = diff;
  	      if (q) {
  	        q.words[m] = 1;
  	      }
  	    }

  	    for (var j = m - 1; j >= 0; j--) {
  	      var qj = (a.words[b.length + j] | 0) * 0x4000000 +
  	        (a.words[b.length + j - 1] | 0);

  	      // NOTE: (qj / bhi) is (0x3ffffff * 0x4000000 + 0x3ffffff) / 0x2000000 max
  	      // (0x7ffffff)
  	      qj = Math.min((qj / bhi) | 0, 0x3ffffff);

  	      a._ishlnsubmul(b, qj, j);
  	      while (a.negative !== 0) {
  	        qj--;
  	        a.negative = 0;
  	        a._ishlnsubmul(b, 1, j);
  	        if (!a.isZero()) {
  	          a.negative ^= 1;
  	        }
  	      }
  	      if (q) {
  	        q.words[j] = qj;
  	      }
  	    }
  	    if (q) {
  	      q.strip();
  	    }
  	    a.strip();

  	    // Denormalize
  	    if (mode !== 'div' && shift !== 0) {
  	      a.iushrn(shift);
  	    }

  	    return {
  	      div: q || null,
  	      mod: a
  	    };
  	  };

  	  // NOTE: 1) `mode` can be set to `mod` to request mod only,
  	  //       to `div` to request div only, or be absent to
  	  //       request both div & mod
  	  //       2) `positive` is true if unsigned mod is requested
  	  BN.prototype.divmod = function divmod (num, mode, positive) {
  	    assert(!num.isZero());

  	    if (this.isZero()) {
  	      return {
  	        div: new BN(0),
  	        mod: new BN(0)
  	      };
  	    }

  	    var div, mod, res;
  	    if (this.negative !== 0 && num.negative === 0) {
  	      res = this.neg().divmod(num, mode);

  	      if (mode !== 'mod') {
  	        div = res.div.neg();
  	      }

  	      if (mode !== 'div') {
  	        mod = res.mod.neg();
  	        if (positive && mod.negative !== 0) {
  	          mod.iadd(num);
  	        }
  	      }

  	      return {
  	        div: div,
  	        mod: mod
  	      };
  	    }

  	    if (this.negative === 0 && num.negative !== 0) {
  	      res = this.divmod(num.neg(), mode);

  	      if (mode !== 'mod') {
  	        div = res.div.neg();
  	      }

  	      return {
  	        div: div,
  	        mod: res.mod
  	      };
  	    }

  	    if ((this.negative & num.negative) !== 0) {
  	      res = this.neg().divmod(num.neg(), mode);

  	      if (mode !== 'div') {
  	        mod = res.mod.neg();
  	        if (positive && mod.negative !== 0) {
  	          mod.isub(num);
  	        }
  	      }

  	      return {
  	        div: res.div,
  	        mod: mod
  	      };
  	    }

  	    // Both numbers are positive at this point

  	    // Strip both numbers to approximate shift value
  	    if (num.length > this.length || this.cmp(num) < 0) {
  	      return {
  	        div: new BN(0),
  	        mod: this
  	      };
  	    }

  	    // Very short reduction
  	    if (num.length === 1) {
  	      if (mode === 'div') {
  	        return {
  	          div: this.divn(num.words[0]),
  	          mod: null
  	        };
  	      }

  	      if (mode === 'mod') {
  	        return {
  	          div: null,
  	          mod: new BN(this.modn(num.words[0]))
  	        };
  	      }

  	      return {
  	        div: this.divn(num.words[0]),
  	        mod: new BN(this.modn(num.words[0]))
  	      };
  	    }

  	    return this._wordDiv(num, mode);
  	  };

  	  // Find `this` / `num`
  	  BN.prototype.div = function div (num) {
  	    return this.divmod(num, 'div', false).div;
  	  };

  	  // Find `this` % `num`
  	  BN.prototype.mod = function mod (num) {
  	    return this.divmod(num, 'mod', false).mod;
  	  };

  	  BN.prototype.umod = function umod (num) {
  	    return this.divmod(num, 'mod', true).mod;
  	  };

  	  // Find Round(`this` / `num`)
  	  BN.prototype.divRound = function divRound (num) {
  	    var dm = this.divmod(num);

  	    // Fast case - exact division
  	    if (dm.mod.isZero()) return dm.div;

  	    var mod = dm.div.negative !== 0 ? dm.mod.isub(num) : dm.mod;

  	    var half = num.ushrn(1);
  	    var r2 = num.andln(1);
  	    var cmp = mod.cmp(half);

  	    // Round down
  	    if (cmp < 0 || r2 === 1 && cmp === 0) return dm.div;

  	    // Round up
  	    return dm.div.negative !== 0 ? dm.div.isubn(1) : dm.div.iaddn(1);
  	  };

  	  BN.prototype.modn = function modn (num) {
  	    assert(num <= 0x3ffffff);
  	    var p = (1 << 26) % num;

  	    var acc = 0;
  	    for (var i = this.length - 1; i >= 0; i--) {
  	      acc = (p * acc + (this.words[i] | 0)) % num;
  	    }

  	    return acc;
  	  };

  	  // In-place division by number
  	  BN.prototype.idivn = function idivn (num) {
  	    assert(num <= 0x3ffffff);

  	    var carry = 0;
  	    for (var i = this.length - 1; i >= 0; i--) {
  	      var w = (this.words[i] | 0) + carry * 0x4000000;
  	      this.words[i] = (w / num) | 0;
  	      carry = w % num;
  	    }

  	    return this.strip();
  	  };

  	  BN.prototype.divn = function divn (num) {
  	    return this.clone().idivn(num);
  	  };

  	  BN.prototype.egcd = function egcd (p) {
  	    assert(p.negative === 0);
  	    assert(!p.isZero());

  	    var x = this;
  	    var y = p.clone();

  	    if (x.negative !== 0) {
  	      x = x.umod(p);
  	    } else {
  	      x = x.clone();
  	    }

  	    // A * x + B * y = x
  	    var A = new BN(1);
  	    var B = new BN(0);

  	    // C * x + D * y = y
  	    var C = new BN(0);
  	    var D = new BN(1);

  	    var g = 0;

  	    while (x.isEven() && y.isEven()) {
  	      x.iushrn(1);
  	      y.iushrn(1);
  	      ++g;
  	    }

  	    var yp = y.clone();
  	    var xp = x.clone();

  	    while (!x.isZero()) {
  	      for (var i = 0, im = 1; (x.words[0] & im) === 0 && i < 26; ++i, im <<= 1);
  	      if (i > 0) {
  	        x.iushrn(i);
  	        while (i-- > 0) {
  	          if (A.isOdd() || B.isOdd()) {
  	            A.iadd(yp);
  	            B.isub(xp);
  	          }

  	          A.iushrn(1);
  	          B.iushrn(1);
  	        }
  	      }

  	      for (var j = 0, jm = 1; (y.words[0] & jm) === 0 && j < 26; ++j, jm <<= 1);
  	      if (j > 0) {
  	        y.iushrn(j);
  	        while (j-- > 0) {
  	          if (C.isOdd() || D.isOdd()) {
  	            C.iadd(yp);
  	            D.isub(xp);
  	          }

  	          C.iushrn(1);
  	          D.iushrn(1);
  	        }
  	      }

  	      if (x.cmp(y) >= 0) {
  	        x.isub(y);
  	        A.isub(C);
  	        B.isub(D);
  	      } else {
  	        y.isub(x);
  	        C.isub(A);
  	        D.isub(B);
  	      }
  	    }

  	    return {
  	      a: C,
  	      b: D,
  	      gcd: y.iushln(g)
  	    };
  	  };

  	  // This is reduced incarnation of the binary EEA
  	  // above, designated to invert members of the
  	  // _prime_ fields F(p) at a maximal speed
  	  BN.prototype._invmp = function _invmp (p) {
  	    assert(p.negative === 0);
  	    assert(!p.isZero());

  	    var a = this;
  	    var b = p.clone();

  	    if (a.negative !== 0) {
  	      a = a.umod(p);
  	    } else {
  	      a = a.clone();
  	    }

  	    var x1 = new BN(1);
  	    var x2 = new BN(0);

  	    var delta = b.clone();

  	    while (a.cmpn(1) > 0 && b.cmpn(1) > 0) {
  	      for (var i = 0, im = 1; (a.words[0] & im) === 0 && i < 26; ++i, im <<= 1);
  	      if (i > 0) {
  	        a.iushrn(i);
  	        while (i-- > 0) {
  	          if (x1.isOdd()) {
  	            x1.iadd(delta);
  	          }

  	          x1.iushrn(1);
  	        }
  	      }

  	      for (var j = 0, jm = 1; (b.words[0] & jm) === 0 && j < 26; ++j, jm <<= 1);
  	      if (j > 0) {
  	        b.iushrn(j);
  	        while (j-- > 0) {
  	          if (x2.isOdd()) {
  	            x2.iadd(delta);
  	          }

  	          x2.iushrn(1);
  	        }
  	      }

  	      if (a.cmp(b) >= 0) {
  	        a.isub(b);
  	        x1.isub(x2);
  	      } else {
  	        b.isub(a);
  	        x2.isub(x1);
  	      }
  	    }

  	    var res;
  	    if (a.cmpn(1) === 0) {
  	      res = x1;
  	    } else {
  	      res = x2;
  	    }

  	    if (res.cmpn(0) < 0) {
  	      res.iadd(p);
  	    }

  	    return res;
  	  };

  	  BN.prototype.gcd = function gcd (num) {
  	    if (this.isZero()) return num.abs();
  	    if (num.isZero()) return this.abs();

  	    var a = this.clone();
  	    var b = num.clone();
  	    a.negative = 0;
  	    b.negative = 0;

  	    // Remove common factor of two
  	    for (var shift = 0; a.isEven() && b.isEven(); shift++) {
  	      a.iushrn(1);
  	      b.iushrn(1);
  	    }

  	    do {
  	      while (a.isEven()) {
  	        a.iushrn(1);
  	      }
  	      while (b.isEven()) {
  	        b.iushrn(1);
  	      }

  	      var r = a.cmp(b);
  	      if (r < 0) {
  	        // Swap `a` and `b` to make `a` always bigger than `b`
  	        var t = a;
  	        a = b;
  	        b = t;
  	      } else if (r === 0 || b.cmpn(1) === 0) {
  	        break;
  	      }

  	      a.isub(b);
  	    } while (true);

  	    return b.iushln(shift);
  	  };

  	  // Invert number in the field F(num)
  	  BN.prototype.invm = function invm (num) {
  	    return this.egcd(num).a.umod(num);
  	  };

  	  BN.prototype.isEven = function isEven () {
  	    return (this.words[0] & 1) === 0;
  	  };

  	  BN.prototype.isOdd = function isOdd () {
  	    return (this.words[0] & 1) === 1;
  	  };

  	  // And first word and num
  	  BN.prototype.andln = function andln (num) {
  	    return this.words[0] & num;
  	  };

  	  // Increment at the bit position in-line
  	  BN.prototype.bincn = function bincn (bit) {
  	    assert(typeof bit === 'number');
  	    var r = bit % 26;
  	    var s = (bit - r) / 26;
  	    var q = 1 << r;

  	    // Fast case: bit is much higher than all existing words
  	    if (this.length <= s) {
  	      this._expand(s + 1);
  	      this.words[s] |= q;
  	      return this;
  	    }

  	    // Add bit and propagate, if needed
  	    var carry = q;
  	    for (var i = s; carry !== 0 && i < this.length; i++) {
  	      var w = this.words[i] | 0;
  	      w += carry;
  	      carry = w >>> 26;
  	      w &= 0x3ffffff;
  	      this.words[i] = w;
  	    }
  	    if (carry !== 0) {
  	      this.words[i] = carry;
  	      this.length++;
  	    }
  	    return this;
  	  };

  	  BN.prototype.isZero = function isZero () {
  	    return this.length === 1 && this.words[0] === 0;
  	  };

  	  BN.prototype.cmpn = function cmpn (num) {
  	    var negative = num < 0;

  	    if (this.negative !== 0 && !negative) return -1;
  	    if (this.negative === 0 && negative) return 1;

  	    this.strip();

  	    var res;
  	    if (this.length > 1) {
  	      res = 1;
  	    } else {
  	      if (negative) {
  	        num = -num;
  	      }

  	      assert(num <= 0x3ffffff, 'Number is too big');

  	      var w = this.words[0] | 0;
  	      res = w === num ? 0 : w < num ? -1 : 1;
  	    }
  	    if (this.negative !== 0) return -res | 0;
  	    return res;
  	  };

  	  // Compare two numbers and return:
  	  // 1 - if `this` > `num`
  	  // 0 - if `this` == `num`
  	  // -1 - if `this` < `num`
  	  BN.prototype.cmp = function cmp (num) {
  	    if (this.negative !== 0 && num.negative === 0) return -1;
  	    if (this.negative === 0 && num.negative !== 0) return 1;

  	    var res = this.ucmp(num);
  	    if (this.negative !== 0) return -res | 0;
  	    return res;
  	  };

  	  // Unsigned comparison
  	  BN.prototype.ucmp = function ucmp (num) {
  	    // At this point both numbers have the same sign
  	    if (this.length > num.length) return 1;
  	    if (this.length < num.length) return -1;

  	    var res = 0;
  	    for (var i = this.length - 1; i >= 0; i--) {
  	      var a = this.words[i] | 0;
  	      var b = num.words[i] | 0;

  	      if (a === b) continue;
  	      if (a < b) {
  	        res = -1;
  	      } else if (a > b) {
  	        res = 1;
  	      }
  	      break;
  	    }
  	    return res;
  	  };

  	  BN.prototype.gtn = function gtn (num) {
  	    return this.cmpn(num) === 1;
  	  };

  	  BN.prototype.gt = function gt (num) {
  	    return this.cmp(num) === 1;
  	  };

  	  BN.prototype.gten = function gten (num) {
  	    return this.cmpn(num) >= 0;
  	  };

  	  BN.prototype.gte = function gte (num) {
  	    return this.cmp(num) >= 0;
  	  };

  	  BN.prototype.ltn = function ltn (num) {
  	    return this.cmpn(num) === -1;
  	  };

  	  BN.prototype.lt = function lt (num) {
  	    return this.cmp(num) === -1;
  	  };

  	  BN.prototype.lten = function lten (num) {
  	    return this.cmpn(num) <= 0;
  	  };

  	  BN.prototype.lte = function lte (num) {
  	    return this.cmp(num) <= 0;
  	  };

  	  BN.prototype.eqn = function eqn (num) {
  	    return this.cmpn(num) === 0;
  	  };

  	  BN.prototype.eq = function eq (num) {
  	    return this.cmp(num) === 0;
  	  };

  	  //
  	  // A reduce context, could be using montgomery or something better, depending
  	  // on the `m` itself.
  	  //
  	  BN.red = function red (num) {
  	    return new Red(num);
  	  };

  	  BN.prototype.toRed = function toRed (ctx) {
  	    assert(!this.red, 'Already a number in reduction context');
  	    assert(this.negative === 0, 'red works only with positives');
  	    return ctx.convertTo(this)._forceRed(ctx);
  	  };

  	  BN.prototype.fromRed = function fromRed () {
  	    assert(this.red, 'fromRed works only with numbers in reduction context');
  	    return this.red.convertFrom(this);
  	  };

  	  BN.prototype._forceRed = function _forceRed (ctx) {
  	    this.red = ctx;
  	    return this;
  	  };

  	  BN.prototype.forceRed = function forceRed (ctx) {
  	    assert(!this.red, 'Already a number in reduction context');
  	    return this._forceRed(ctx);
  	  };

  	  BN.prototype.redAdd = function redAdd (num) {
  	    assert(this.red, 'redAdd works only with red numbers');
  	    return this.red.add(this, num);
  	  };

  	  BN.prototype.redIAdd = function redIAdd (num) {
  	    assert(this.red, 'redIAdd works only with red numbers');
  	    return this.red.iadd(this, num);
  	  };

  	  BN.prototype.redSub = function redSub (num) {
  	    assert(this.red, 'redSub works only with red numbers');
  	    return this.red.sub(this, num);
  	  };

  	  BN.prototype.redISub = function redISub (num) {
  	    assert(this.red, 'redISub works only with red numbers');
  	    return this.red.isub(this, num);
  	  };

  	  BN.prototype.redShl = function redShl (num) {
  	    assert(this.red, 'redShl works only with red numbers');
  	    return this.red.shl(this, num);
  	  };

  	  BN.prototype.redMul = function redMul (num) {
  	    assert(this.red, 'redMul works only with red numbers');
  	    this.red._verify2(this, num);
  	    return this.red.mul(this, num);
  	  };

  	  BN.prototype.redIMul = function redIMul (num) {
  	    assert(this.red, 'redMul works only with red numbers');
  	    this.red._verify2(this, num);
  	    return this.red.imul(this, num);
  	  };

  	  BN.prototype.redSqr = function redSqr () {
  	    assert(this.red, 'redSqr works only with red numbers');
  	    this.red._verify1(this);
  	    return this.red.sqr(this);
  	  };

  	  BN.prototype.redISqr = function redISqr () {
  	    assert(this.red, 'redISqr works only with red numbers');
  	    this.red._verify1(this);
  	    return this.red.isqr(this);
  	  };

  	  // Square root over p
  	  BN.prototype.redSqrt = function redSqrt () {
  	    assert(this.red, 'redSqrt works only with red numbers');
  	    this.red._verify1(this);
  	    return this.red.sqrt(this);
  	  };

  	  BN.prototype.redInvm = function redInvm () {
  	    assert(this.red, 'redInvm works only with red numbers');
  	    this.red._verify1(this);
  	    return this.red.invm(this);
  	  };

  	  // Return negative clone of `this` % `red modulo`
  	  BN.prototype.redNeg = function redNeg () {
  	    assert(this.red, 'redNeg works only with red numbers');
  	    this.red._verify1(this);
  	    return this.red.neg(this);
  	  };

  	  BN.prototype.redPow = function redPow (num) {
  	    assert(this.red && !num.red, 'redPow(normalNum)');
  	    this.red._verify1(this);
  	    return this.red.pow(this, num);
  	  };

  	  // Prime numbers with efficient reduction
  	  var primes = {
  	    k256: null,
  	    p224: null,
  	    p192: null,
  	    p25519: null
  	  };

  	  // Pseudo-Mersenne prime
  	  function MPrime (name, p) {
  	    // P = 2 ^ N - K
  	    this.name = name;
  	    this.p = new BN(p, 16);
  	    this.n = this.p.bitLength();
  	    this.k = new BN(1).iushln(this.n).isub(this.p);

  	    this.tmp = this._tmp();
  	  }

  	  MPrime.prototype._tmp = function _tmp () {
  	    var tmp = new BN(null);
  	    tmp.words = new Array(Math.ceil(this.n / 13));
  	    return tmp;
  	  };

  	  MPrime.prototype.ireduce = function ireduce (num) {
  	    // Assumes that `num` is less than `P^2`
  	    // num = HI * (2 ^ N - K) + HI * K + LO = HI * K + LO (mod P)
  	    var r = num;
  	    var rlen;

  	    do {
  	      this.split(r, this.tmp);
  	      r = this.imulK(r);
  	      r = r.iadd(this.tmp);
  	      rlen = r.bitLength();
  	    } while (rlen > this.n);

  	    var cmp = rlen < this.n ? -1 : r.ucmp(this.p);
  	    if (cmp === 0) {
  	      r.words[0] = 0;
  	      r.length = 1;
  	    } else if (cmp > 0) {
  	      r.isub(this.p);
  	    } else {
  	      if (r.strip !== undefined) {
  	        // r is BN v4 instance
  	        r.strip();
  	      } else {
  	        // r is BN v5 instance
  	        r._strip();
  	      }
  	    }

  	    return r;
  	  };

  	  MPrime.prototype.split = function split (input, out) {
  	    input.iushrn(this.n, 0, out);
  	  };

  	  MPrime.prototype.imulK = function imulK (num) {
  	    return num.imul(this.k);
  	  };

  	  function K256 () {
  	    MPrime.call(
  	      this,
  	      'k256',
  	      'ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff fffffffe fffffc2f');
  	  }
  	  inherits(K256, MPrime);

  	  K256.prototype.split = function split (input, output) {
  	    // 256 = 9 * 26 + 22
  	    var mask = 0x3fffff;

  	    var outLen = Math.min(input.length, 9);
  	    for (var i = 0; i < outLen; i++) {
  	      output.words[i] = input.words[i];
  	    }
  	    output.length = outLen;

  	    if (input.length <= 9) {
  	      input.words[0] = 0;
  	      input.length = 1;
  	      return;
  	    }

  	    // Shift by 9 limbs
  	    var prev = input.words[9];
  	    output.words[output.length++] = prev & mask;

  	    for (i = 10; i < input.length; i++) {
  	      var next = input.words[i] | 0;
  	      input.words[i - 10] = ((next & mask) << 4) | (prev >>> 22);
  	      prev = next;
  	    }
  	    prev >>>= 22;
  	    input.words[i - 10] = prev;
  	    if (prev === 0 && input.length > 10) {
  	      input.length -= 10;
  	    } else {
  	      input.length -= 9;
  	    }
  	  };

  	  K256.prototype.imulK = function imulK (num) {
  	    // K = 0x1000003d1 = [ 0x40, 0x3d1 ]
  	    num.words[num.length] = 0;
  	    num.words[num.length + 1] = 0;
  	    num.length += 2;

  	    // bounded at: 0x40 * 0x3ffffff + 0x3d0 = 0x100000390
  	    var lo = 0;
  	    for (var i = 0; i < num.length; i++) {
  	      var w = num.words[i] | 0;
  	      lo += w * 0x3d1;
  	      num.words[i] = lo & 0x3ffffff;
  	      lo = w * 0x40 + ((lo / 0x4000000) | 0);
  	    }

  	    // Fast length reduction
  	    if (num.words[num.length - 1] === 0) {
  	      num.length--;
  	      if (num.words[num.length - 1] === 0) {
  	        num.length--;
  	      }
  	    }
  	    return num;
  	  };

  	  function P224 () {
  	    MPrime.call(
  	      this,
  	      'p224',
  	      'ffffffff ffffffff ffffffff ffffffff 00000000 00000000 00000001');
  	  }
  	  inherits(P224, MPrime);

  	  function P192 () {
  	    MPrime.call(
  	      this,
  	      'p192',
  	      'ffffffff ffffffff ffffffff fffffffe ffffffff ffffffff');
  	  }
  	  inherits(P192, MPrime);

  	  function P25519 () {
  	    // 2 ^ 255 - 19
  	    MPrime.call(
  	      this,
  	      '25519',
  	      '7fffffffffffffff ffffffffffffffff ffffffffffffffff ffffffffffffffed');
  	  }
  	  inherits(P25519, MPrime);

  	  P25519.prototype.imulK = function imulK (num) {
  	    // K = 0x13
  	    var carry = 0;
  	    for (var i = 0; i < num.length; i++) {
  	      var hi = (num.words[i] | 0) * 0x13 + carry;
  	      var lo = hi & 0x3ffffff;
  	      hi >>>= 26;

  	      num.words[i] = lo;
  	      carry = hi;
  	    }
  	    if (carry !== 0) {
  	      num.words[num.length++] = carry;
  	    }
  	    return num;
  	  };

  	  // Exported mostly for testing purposes, use plain name instead
  	  BN._prime = function prime (name) {
  	    // Cached version of prime
  	    if (primes[name]) return primes[name];

  	    var prime;
  	    if (name === 'k256') {
  	      prime = new K256();
  	    } else if (name === 'p224') {
  	      prime = new P224();
  	    } else if (name === 'p192') {
  	      prime = new P192();
  	    } else if (name === 'p25519') {
  	      prime = new P25519();
  	    } else {
  	      throw new Error('Unknown prime ' + name);
  	    }
  	    primes[name] = prime;

  	    return prime;
  	  };

  	  //
  	  // Base reduction engine
  	  //
  	  function Red (m) {
  	    if (typeof m === 'string') {
  	      var prime = BN._prime(m);
  	      this.m = prime.p;
  	      this.prime = prime;
  	    } else {
  	      assert(m.gtn(1), 'modulus must be greater than 1');
  	      this.m = m;
  	      this.prime = null;
  	    }
  	  }

  	  Red.prototype._verify1 = function _verify1 (a) {
  	    assert(a.negative === 0, 'red works only with positives');
  	    assert(a.red, 'red works only with red numbers');
  	  };

  	  Red.prototype._verify2 = function _verify2 (a, b) {
  	    assert((a.negative | b.negative) === 0, 'red works only with positives');
  	    assert(a.red && a.red === b.red,
  	      'red works only with red numbers');
  	  };

  	  Red.prototype.imod = function imod (a) {
  	    if (this.prime) return this.prime.ireduce(a)._forceRed(this);
  	    return a.umod(this.m)._forceRed(this);
  	  };

  	  Red.prototype.neg = function neg (a) {
  	    if (a.isZero()) {
  	      return a.clone();
  	    }

  	    return this.m.sub(a)._forceRed(this);
  	  };

  	  Red.prototype.add = function add (a, b) {
  	    this._verify2(a, b);

  	    var res = a.add(b);
  	    if (res.cmp(this.m) >= 0) {
  	      res.isub(this.m);
  	    }
  	    return res._forceRed(this);
  	  };

  	  Red.prototype.iadd = function iadd (a, b) {
  	    this._verify2(a, b);

  	    var res = a.iadd(b);
  	    if (res.cmp(this.m) >= 0) {
  	      res.isub(this.m);
  	    }
  	    return res;
  	  };

  	  Red.prototype.sub = function sub (a, b) {
  	    this._verify2(a, b);

  	    var res = a.sub(b);
  	    if (res.cmpn(0) < 0) {
  	      res.iadd(this.m);
  	    }
  	    return res._forceRed(this);
  	  };

  	  Red.prototype.isub = function isub (a, b) {
  	    this._verify2(a, b);

  	    var res = a.isub(b);
  	    if (res.cmpn(0) < 0) {
  	      res.iadd(this.m);
  	    }
  	    return res;
  	  };

  	  Red.prototype.shl = function shl (a, num) {
  	    this._verify1(a);
  	    return this.imod(a.ushln(num));
  	  };

  	  Red.prototype.imul = function imul (a, b) {
  	    this._verify2(a, b);
  	    return this.imod(a.imul(b));
  	  };

  	  Red.prototype.mul = function mul (a, b) {
  	    this._verify2(a, b);
  	    return this.imod(a.mul(b));
  	  };

  	  Red.prototype.isqr = function isqr (a) {
  	    return this.imul(a, a.clone());
  	  };

  	  Red.prototype.sqr = function sqr (a) {
  	    return this.mul(a, a);
  	  };

  	  Red.prototype.sqrt = function sqrt (a) {
  	    if (a.isZero()) return a.clone();

  	    var mod3 = this.m.andln(3);
  	    assert(mod3 % 2 === 1);

  	    // Fast case
  	    if (mod3 === 3) {
  	      var pow = this.m.add(new BN(1)).iushrn(2);
  	      return this.pow(a, pow);
  	    }

  	    // Tonelli-Shanks algorithm (Totally unoptimized and slow)
  	    //
  	    // Find Q and S, that Q * 2 ^ S = (P - 1)
  	    var q = this.m.subn(1);
  	    var s = 0;
  	    while (!q.isZero() && q.andln(1) === 0) {
  	      s++;
  	      q.iushrn(1);
  	    }
  	    assert(!q.isZero());

  	    var one = new BN(1).toRed(this);
  	    var nOne = one.redNeg();

  	    // Find quadratic non-residue
  	    // NOTE: Max is such because of generalized Riemann hypothesis.
  	    var lpow = this.m.subn(1).iushrn(1);
  	    var z = this.m.bitLength();
  	    z = new BN(2 * z * z).toRed(this);

  	    while (this.pow(z, lpow).cmp(nOne) !== 0) {
  	      z.redIAdd(nOne);
  	    }

  	    var c = this.pow(z, q);
  	    var r = this.pow(a, q.addn(1).iushrn(1));
  	    var t = this.pow(a, q);
  	    var m = s;
  	    while (t.cmp(one) !== 0) {
  	      var tmp = t;
  	      for (var i = 0; tmp.cmp(one) !== 0; i++) {
  	        tmp = tmp.redSqr();
  	      }
  	      assert(i < m);
  	      var b = this.pow(c, new BN(1).iushln(m - i - 1));

  	      r = r.redMul(b);
  	      c = b.redSqr();
  	      t = t.redMul(c);
  	      m = i;
  	    }

  	    return r;
  	  };

  	  Red.prototype.invm = function invm (a) {
  	    var inv = a._invmp(this.m);
  	    if (inv.negative !== 0) {
  	      inv.negative = 0;
  	      return this.imod(inv).redNeg();
  	    } else {
  	      return this.imod(inv);
  	    }
  	  };

  	  Red.prototype.pow = function pow (a, num) {
  	    if (num.isZero()) return new BN(1).toRed(this);
  	    if (num.cmpn(1) === 0) return a.clone();

  	    var windowSize = 4;
  	    var wnd = new Array(1 << windowSize);
  	    wnd[0] = new BN(1).toRed(this);
  	    wnd[1] = a;
  	    for (var i = 2; i < wnd.length; i++) {
  	      wnd[i] = this.mul(wnd[i - 1], a);
  	    }

  	    var res = wnd[0];
  	    var current = 0;
  	    var currentLen = 0;
  	    var start = num.bitLength() % 26;
  	    if (start === 0) {
  	      start = 26;
  	    }

  	    for (i = num.length - 1; i >= 0; i--) {
  	      var word = num.words[i];
  	      for (var j = start - 1; j >= 0; j--) {
  	        var bit = (word >> j) & 1;
  	        if (res !== wnd[0]) {
  	          res = this.sqr(res);
  	        }

  	        if (bit === 0 && current === 0) {
  	          currentLen = 0;
  	          continue;
  	        }

  	        current <<= 1;
  	        current |= bit;
  	        currentLen++;
  	        if (currentLen !== windowSize && (i !== 0 || j !== 0)) continue;

  	        res = this.mul(res, wnd[current]);
  	        currentLen = 0;
  	        current = 0;
  	      }
  	      start = 26;
  	    }

  	    return res;
  	  };

  	  Red.prototype.convertTo = function convertTo (num) {
  	    var r = num.umod(this.m);

  	    return r === num ? r.clone() : r;
  	  };

  	  Red.prototype.convertFrom = function convertFrom (num) {
  	    var res = num.clone();
  	    res.red = null;
  	    return res;
  	  };

  	  //
  	  // Montgomery method engine
  	  //

  	  BN.mont = function mont (num) {
  	    return new Mont(num);
  	  };

  	  function Mont (m) {
  	    Red.call(this, m);

  	    this.shift = this.m.bitLength();
  	    if (this.shift % 26 !== 0) {
  	      this.shift += 26 - (this.shift % 26);
  	    }

  	    this.r = new BN(1).iushln(this.shift);
  	    this.r2 = this.imod(this.r.sqr());
  	    this.rinv = this.r._invmp(this.m);

  	    this.minv = this.rinv.mul(this.r).isubn(1).div(this.m);
  	    this.minv = this.minv.umod(this.r);
  	    this.minv = this.r.sub(this.minv);
  	  }
  	  inherits(Mont, Red);

  	  Mont.prototype.convertTo = function convertTo (num) {
  	    return this.imod(num.ushln(this.shift));
  	  };

  	  Mont.prototype.convertFrom = function convertFrom (num) {
  	    var r = this.imod(num.mul(this.rinv));
  	    r.red = null;
  	    return r;
  	  };

  	  Mont.prototype.imul = function imul (a, b) {
  	    if (a.isZero() || b.isZero()) {
  	      a.words[0] = 0;
  	      a.length = 1;
  	      return a;
  	    }

  	    var t = a.imul(b);
  	    var c = t.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
  	    var u = t.isub(c).iushrn(this.shift);
  	    var res = u;

  	    if (u.cmp(this.m) >= 0) {
  	      res = u.isub(this.m);
  	    } else if (u.cmpn(0) < 0) {
  	      res = u.iadd(this.m);
  	    }

  	    return res._forceRed(this);
  	  };

  	  Mont.prototype.mul = function mul (a, b) {
  	    if (a.isZero() || b.isZero()) return new BN(0)._forceRed(this);

  	    var t = a.mul(b);
  	    var c = t.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
  	    var u = t.isub(c).iushrn(this.shift);
  	    var res = u;
  	    if (u.cmp(this.m) >= 0) {
  	      res = u.isub(this.m);
  	    } else if (u.cmpn(0) < 0) {
  	      res = u.iadd(this.m);
  	    }

  	    return res._forceRed(this);
  	  };

  	  Mont.prototype.invm = function invm (a) {
  	    // (AR)^-1 * R^2 = (A^-1 * R^-1) * R^2 = A^-1 * R
  	    var res = this.imod(a._invmp(this.m).mul(this.r2));
  	    return res._forceRed(this);
  	  };
  	})(module, commonjsGlobal);
  } (bn$2));

  var errors$2 = {exports: {}};

  var _$d = {};

  _$d.isArray = t => Array.isArray(t);
  _$d.isNumber = t => typeof t === 'number';
  _$d.isObject = t => t && typeof t === 'object';
  _$d.isString = t => typeof t === 'string';
  _$d.isUndefined = t => typeof t === 'undefined';
  _$d.isFunction = t => typeof t === 'function';
  _$d.isNull = t => t === null;
  _$d.isDate = t => t instanceof Date;
  _$d.extend = (a, b) => Object.assign(a, b);
  _$d.noop = () => { };
  _$d.every = (a, f) => a.every(f || (t => t));
  _$d.map = (a, f) => Array.from(a).map(f || (t => t));
  _$d.includes = (a, e) => a.includes(e);
  _$d.each = (a, f) => a.forEach(f);
  _$d.clone = o => Object.assign({}, o);
  _$d.pick = (object, keys) => {
    const obj = {};
    keys.forEach(key => {
      if (typeof object[key] !== 'undefined') { obj[key] = object[key]; }
    });
    return obj
  };
  _$d.values = o => Object.values(o);
  _$d.filter = (a, f) => a.filter(f);
  _$d.reduce = (a, f, s) => a.reduce(f, s);
  _$d.without = (a, n) => a.filter(t => t !== n);
  _$d.shuffle = a => {
    const result = a.slice(0);
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result
  };
  _$d.difference = (a, b) => a.filter(t => !b.includes(t));
  _$d.findIndex = (a, f) => a.findIndex(f);
  _$d.some = (a, f) => a.some(f);
  _$d.range = n => [...Array(n).keys()];

  var __1 = _$d;

  var spec;
  var hasRequiredSpec;

  function requireSpec () {
  	if (hasRequiredSpec) return spec;
  	hasRequiredSpec = 1;

  	var docsURL = 'https://docs.moneybutton.com/';

  	spec = [{
  	  name: 'InvalidB58Char',
  	  message: 'Invalid Base58 character: {0} in {1}'
  	}, {
  	  name: 'InvalidB58Checksum',
  	  message: 'Invalid Base58 checksum for {0}'
  	}, {
  	  name: 'InvalidNetwork',
  	  message: 'Invalid version for network: got {0}'
  	}, {
  	  name: 'InvalidState',
  	  message: 'Invalid state: {0}'
  	}, {
  	  name: 'NotImplemented',
  	  message: 'Function {0} was not implemented yet'
  	}, {
  	  name: 'InvalidNetworkArgument',
  	  message: 'Invalid network: must be "livenet" or "testnet", got {0}'
  	}, {
  	  name: 'InvalidArgument',
  	  message: function () {
  	    return 'Invalid Argument' + (arguments[0] ? (': ' + arguments[0]) : '') +
  	      (arguments[1] ? (' Documentation: ' + docsURL + arguments[1]) : '')
  	  }
  	}, {
  	  name: 'AbstractMethodInvoked',
  	  message: 'Abstract Method Invocation: {0}'
  	}, {
  	  name: 'InvalidArgumentType',
  	  message: function () {
  	    return 'Invalid Argument for ' + arguments[2] + ', expected ' + arguments[1] + ' but got ' + typeof arguments[0]
  	  }
  	}, {
  	  name: 'Unit',
  	  message: 'Internal Error on Unit {0}',
  	  errors: [{
  	    'name': 'UnknownCode',
  	    'message': 'Unrecognized unit code: {0}'
  	  }, {
  	    'name': 'InvalidRate',
  	    'message': 'Invalid exchange rate: {0}'
  	  }]
  	}, {
  	  name: 'MerkleBlock',
  	  message: 'Internal Error on MerkleBlock {0}',
  	  errors: [{
  	    'name': 'InvalidMerkleTree',
  	    'message': 'This MerkleBlock contain an invalid Merkle Tree'
  	  }]
  	}, {
  	  name: 'Transaction',
  	  message: 'Internal Error on Transaction {0}',
  	  errors: [{
  	    name: 'Input',
  	    message: 'Internal Error on Input {0}',
  	    errors: [{
  	      name: 'MissingScript',
  	      message: 'Need a script to create an input'
  	    }, {
  	      name: 'UnsupportedScript',
  	      message: 'Unsupported input script type: {0}'
  	    }, {
  	      name: 'MissingPreviousOutput',
  	      message: 'No previous output information.'
  	    }]
  	  }, {
  	    name: 'NeedMoreInfo',
  	    message: '{0}'
  	  }, {
  	    name: 'InvalidSorting',
  	    message: 'The sorting function provided did not return the change output as one of the array elements'
  	  }, {
  	    name: 'InvalidOutputAmountSum',
  	    message: '{0}'
  	  }, {
  	    name: 'MissingSignatures',
  	    message: 'Some inputs have not been fully signed'
  	  }, {
  	    name: 'InvalidIndex',
  	    message: 'Invalid index: {0} is not between 0, {1}'
  	  }, {
  	    name: 'UnableToVerifySignature',
  	    message: 'Unable to verify signature: {0}'
  	  }, {
  	    name: 'DustOutputs',
  	    message: 'Dust amount detected in one output'
  	  }, {
  	    name: 'InvalidSatoshis',
  	    message: 'Output satoshis are invalid'
  	  }, {
  	    name: 'FeeError',
  	    message: 'Internal Error on Fee {0}',
  	    errors: [{
  	      name: 'TooSmall',
  	      message: 'Fee is too small: {0}'
  	    }, {
  	      name: 'TooLarge',
  	      message: 'Fee is too large: {0}'
  	    }, {
  	      name: 'Different',
  	      message: 'Unspent value is different from specified fee: {0}'
  	    }]
  	  }, {
  	    name: 'ChangeAddressMissing',
  	    message: 'Change address is missing'
  	  }, {
  	    name: 'BlockHeightTooHigh',
  	    message: 'Block Height can be at most 2^32 -1'
  	  }, {
  	    name: 'NLockTimeOutOfRange',
  	    message: 'Block Height can only be between 0 and 499 999 999'
  	  }, {
  	    name: 'LockTimeTooEarly',
  	    message: 'Lock Time can\'t be earlier than UNIX date 500 000 000'
  	  }, {
  	    name: 'TransactionAlreadySealed',
  	    message: 'Cannot update sealed transaction'
  	  }]
  	}, {
  	  name: 'Script',
  	  message: 'Internal Error on Script {0}',
  	  errors: [{
  	    name: 'UnrecognizedAddress',
  	    message: 'Expected argument {0} to be an address'
  	  }, {
  	    name: 'CantDeriveAddress',
  	    message: 'Can\'t derive address associated with script {0}, needs to be p2pkh in, p2pkh out, p2sh in, or p2sh out.'
  	  }, {
  	    name: 'InvalidBuffer',
  	    message: 'Invalid script buffer: can\'t parse valid script from given buffer {0}'
  	  }]
  	}, {
  	  name: 'HDPrivateKey',
  	  message: 'Internal Error on HDPrivateKey {0}',
  	  errors: [{
  	    name: 'InvalidDerivationArgument',
  	    message: 'Invalid derivation argument {0}, expected string, or number and boolean'
  	  }, {
  	    name: 'InvalidEntropyArgument',
  	    message: 'Invalid entropy: must be an hexa string or binary buffer, got {0}',
  	    errors: [{
  	      name: 'TooMuchEntropy',
  	      message: 'Invalid entropy: more than 512 bits is non standard, got "{0}"'
  	    }, {
  	      name: 'NotEnoughEntropy',
  	      message: 'Invalid entropy: at least 128 bits needed, got "{0}"'
  	    }]
  	  }, {
  	    name: 'InvalidLength',
  	    message: 'Invalid length for xprivkey string in {0}'
  	  }, {
  	    name: 'InvalidPath',
  	    message: 'Invalid derivation path: {0}'
  	  }, {
  	    name: 'UnrecognizedArgument',
  	    message: 'Invalid argument: creating a HDPrivateKey requires a string, buffer, json or object, got "{0}"'
  	  }]
  	}, {
  	  name: 'HDPublicKey',
  	  message: 'Internal Error on HDPublicKey {0}',
  	  errors: [{
  	    name: 'ArgumentIsPrivateExtended',
  	    message: 'Argument is an extended private key: {0}'
  	  }, {
  	    name: 'InvalidDerivationArgument',
  	    message: 'Invalid derivation argument: got {0}'
  	  }, {
  	    name: 'InvalidLength',
  	    message: 'Invalid length for xpubkey: got "{0}"'
  	  }, {
  	    name: 'InvalidPath',
  	    message: 'Invalid derivation path, it should look like: "m/1/100", got "{0}"'
  	  }, {
  	    name: 'InvalidIndexCantDeriveHardened',
  	    message: 'Invalid argument: creating a hardened path requires an HDPrivateKey'
  	  }, {
  	    name: 'MustSupplyArgument',
  	    message: 'Must supply an argument to create a HDPublicKey'
  	  }, {
  	    name: 'UnrecognizedArgument',
  	    message: 'Invalid argument for creation, must be string, json, buffer, or object'
  	  }]
  	}];
  	return spec;
  }

  var _$c = __1;

  function format$1 (message, args) {
    return message
      .replace('{0}', args[0])
      .replace('{1}', args[1])
      .replace('{2}', args[2])
  }
  var traverseNode = function (parent, errorDefinition) {
    var NodeError = function () {
      if (_$c.isString(errorDefinition.message)) {
        this.message = format$1(errorDefinition.message, arguments);
      } else if (_$c.isFunction(errorDefinition.message)) {
        this.message = errorDefinition.message.apply(null, arguments);
      } else {
        throw new Error('Invalid error definition for ' + errorDefinition.name)
      }
      this.stack = this.message + '\n' + (new Error()).stack;
    };
    NodeError.prototype = Object.create(parent.prototype);
    NodeError.prototype.name = parent.prototype.name + errorDefinition.name;
    parent[errorDefinition.name] = NodeError;
    if (errorDefinition.errors) {
      childDefinitions(NodeError, errorDefinition.errors);
    }
    return NodeError
  };

  var childDefinitions = function (parent, childDefinitions) {
    _$c.each(childDefinitions, function (childDefinition) {
      traverseNode(parent, childDefinition);
    });
  };

  var traverseRoot = function (parent, errorsDefinition) {
    childDefinitions(parent, errorsDefinition);
    return parent
  };

  var bsv$1 = {};
  bsv$1.Error = function () {
    this.message = 'Internal error';
    this.stack = this.message + '\n' + (new Error()).stack;
  };
  bsv$1.Error.prototype = Object.create(Error.prototype);
  bsv$1.Error.prototype.name = 'bsv.Error';

  var data = requireSpec();
  traverseRoot(bsv$1.Error, data);

  errors$2.exports = bsv$1.Error;

  errors$2.exports.extend = function (spec) {
    return traverseNode(bsv$1.Error, spec)
  };

  var errors$1 = errors$2.exports;
  var _$b = __1;

  var preconditions = {
    checkState: function (condition, message) {
      if (!condition) {
        throw new errors$1.InvalidState(message)
      }
    },
    checkArgument: function (condition, argumentName, message, docsPath) {
      if (!condition) {
        throw new errors$1.InvalidArgument(argumentName, message, docsPath)
      }
    },
    checkArgumentType: function (argument, type, argumentName) {
      argumentName = argumentName || '(unknown name)';
      if (_$b.isString(type)) {
        if (type === 'Buffer') {
          var buffer = require$$0$4; // './buffer' fails on cordova & RN
          if (!buffer.Buffer.isBuffer(argument)) {
            throw new errors$1.InvalidArgumentType(argument, type, argumentName)
          }
        } else if (typeof argument !== type) { // eslint-disable-line
          throw new errors$1.InvalidArgumentType(argument, type, argumentName)
        }
      } else {
        if (!(argument instanceof type)) {
          throw new errors$1.InvalidArgumentType(argument, type.name, argumentName)
        }
      }
    }
  };

  var BN$f = bn$2.exports;
  var $$7 = preconditions;
  var _$a = __1;

  var reversebuf = function (buf) {
    var buf2 = Buffer$1.alloc(buf.length);
    for (var i = 0; i < buf.length; i++) {
      buf2[i] = buf[buf.length - 1 - i];
    }
    return buf2
  };

  BN$f.Zero = new BN$f(0);
  BN$f.One = new BN$f(1);
  BN$f.Minus1 = new BN$f(-1);

  /**
   * Convert a number into a big number.
   *
   * @param {number} n Any positive or negative integer.
   */
  BN$f.fromNumber = function (n) {
    $$7.checkArgument(_$a.isNumber(n));
    return new BN$f(n)
  };

  /**
   * Convert a string number into a big number.
   *
   * @param {string} str Any positive or negative integer formatted as a string.
   * @param {number} base The base of the number, defaults to 10.
   */
  BN$f.fromString = function (str, base) {
    $$7.checkArgument(_$a.isString(str));
    return new BN$f(str, base)
  };

  /**
   * Convert a buffer (such as a 256 bit binary private key) into a big number.
   * Sometimes these numbers can be formatted either as 'big endian' or 'little
   * endian', and so there is an opts parameter that lets you specify which
   * endianness is specified.
   *
   * @param {Buffer} buf A buffer number, such as a 256 bit hash or key.
   * @param {Object} opts With a property 'endian' that can be either 'big' or 'little'. Defaults big endian (most significant digit first).
   */
  BN$f.fromBuffer = function (buf, opts) {
    if (typeof opts !== 'undefined' && opts.endian === 'little') {
      buf = reversebuf(buf);
    }
    var hex = buf.toString('hex');
    var bn = new BN$f(hex, 16);
    return bn
  };

  /**
   * Instantiate a BigNumber from a "signed magnitude buffer". (a buffer where the
   * most significant bit represents the sign (0 = positive, 1 = negative)
   *
   * @param {Buffer} buf A buffer number, such as a 256 bit hash or key.
   * @param {Object} opts With a property 'endian' that can be either 'big' or 'little'. Defaults big endian (most significant digit first).
   */
  BN$f.fromSM = function (buf, opts) {
    var ret;
    if (buf.length === 0) {
      return BN$f.fromBuffer(Buffer$1.from([0]))
    }

    var endian = 'big';
    if (opts) {
      endian = opts.endian;
    }
    if (endian === 'little') {
      buf = reversebuf(buf);
    }

    if (buf[0] & 0x80) {
      buf[0] = buf[0] & 0x7f;
      ret = BN$f.fromBuffer(buf);
      ret.neg().copy(ret);
    } else {
      ret = BN$f.fromBuffer(buf);
    }
    return ret
  };

  /**
   * Convert a big number into a number.
   */
  BN$f.prototype.toNumber = function () {
    return parseInt(this.toString(10), 10)
  };

  /**
   * Convert a big number into a buffer. This is somewhat ambiguous, so there is
   * an opts parameter that let's you specify the endianness or the size.
   * opts.endian can be either 'big' or 'little' and opts.size can be any
   * sufficiently large number of bytes. If you always want to create a 32 byte
   * big endian number, then specify opts = { endian: 'big', size: 32 }
   *
   * @param {Object} opts Defaults to { endian: 'big', size: 32 }
   */
  BN$f.prototype.toBuffer = function (opts) {
    var buf, hex;
    if (opts && opts.size) {
      hex = this.toString(16, 2);
      var natlen = hex.length / 2;
      buf = Buffer$1.from(hex, 'hex');

      if (natlen === opts.size) ; else if (natlen > opts.size) {
        buf = BN$f.trim(buf, natlen);
      } else if (natlen < opts.size) {
        buf = BN$f.pad(buf, natlen, opts.size);
      }
    } else {
      hex = this.toString(16, 2);
      buf = Buffer$1.from(hex, 'hex');
    }

    if (typeof opts !== 'undefined' && opts.endian === 'little') {
      buf = reversebuf(buf);
    }

    return buf
  };

  /**
   * For big numbers that are either positive or negative, you can convert to
   * "sign magnitude" format whereby the first bit specifies whether the number is
   * positive or negative.
   */
  BN$f.prototype.toSMBigEndian = function () {
    var buf;
    if (this.cmp(BN$f.Zero) === -1) {
      buf = this.neg().toBuffer();
      if (buf[0] & 0x80) {
        buf = Buffer$1.concat([Buffer$1.from([0x80]), buf]);
      } else {
        buf[0] = buf[0] | 0x80;
      }
    } else {
      buf = this.toBuffer();
      if (buf[0] & 0x80) {
        buf = Buffer$1.concat([Buffer$1.from([0x00]), buf]);
      }
    }

    if (buf.length === 1 & buf[0] === 0) {
      buf = Buffer$1.from([]);
    }
    return buf
  };

  /**
   * For big numbers that are either positive or negative, you can convert to
   * "sign magnitude" format whereby the first bit specifies whether the number is
   * positive or negative.
   *
   * @param {Object} opts Defaults to { endian: 'big' }
   */
  BN$f.prototype.toSM = function (opts) {
    var endian = opts ? opts.endian : 'big';
    var buf = this.toSMBigEndian();

    if (endian === 'little') {
      buf = reversebuf(buf);
    }
    return buf
  };

  /**
   * Create a BN from a "ScriptNum": This is analogous to the constructor for
   * CScriptNum in bitcoind. Many ops in bitcoind's script interpreter use
   * CScriptNum, which is not really a proper bignum. Instead, an error is thrown
   * if trying to input a number bigger than 4 bytes. We copy that behavior here.
   * A third argument, `size`, is provided to extend the hard limit of 4 bytes, as
   * some usages require more than 4 bytes.
   *
   * @param {Buffer} buf A buffer of a number.
   * @param {boolean} fRequireMinimal Whether to require minimal size encoding.
   * @param {number} size The maximum size.
   */
  BN$f.fromScriptNumBuffer = function (buf, fRequireMinimal, size) {
    // don't limit numSize default
    var nMaxNumSize = size || Number.MAX_SAFE_INTEGER;
    $$7.checkArgument(buf.length <= nMaxNumSize, new Error('script number overflow'));
    if (fRequireMinimal && buf.length > 0) {
      // Check that the number is encoded with the minimum possible
      // number of bytes.
      //
      // If the most-significant-byte - excluding the sign bit - is zero
      // then we're not minimal. Note how this test also rejects the
      // negative-zero encoding, 0x80.
      if ((buf[buf.length - 1] & 0x7f) === 0) {
        // One exception: if there's more than one byte and the most
        // significant bit of the second-most-significant-byte is set
        // it would conflict with the sign bit. An example of this case
        // is +-255, which encode to 0xff00 and 0xff80 respectively.
        // (big-endian).
        if (buf.length <= 1 || (buf[buf.length - 2] & 0x80) === 0) {
          throw new Error('non-minimally encoded script number')
        }
      }
    }
    return BN$f.fromSM(buf, {
      endian: 'little'
    })
  };

  /**
   * The corollary to the above, with the notable exception that we do not throw
   * an error if the output is larger than four bytes. (Which can happen if
   * performing a numerical operation that results in an overflow to more than 4
   * bytes).
   */
  BN$f.prototype.toScriptNumBuffer = function () {
    return this.toSM({
      endian: 'little'
    })
  };

  /**
   * Trims a buffer if it starts with zeros.
   *
   * @param {Buffer} buf A buffer formatted number.
   * @param {number} natlen The natural length of the number.
   */
  BN$f.trim = function (buf, natlen) {
    return buf.slice(natlen - buf.length, buf.length)
  };

  /**
   * Adds extra zeros to the start of a number.
   *
   * @param {Buffer} buf A buffer formatted number.
   * @param {number} natlen The natural length of the number.
   * @param {number} size How big to pad the number in bytes.
   */
  BN$f.pad = function (buf, natlen, size) {
    var rbuf = Buffer$1.alloc(size);
    for (var i = 0; i < buf.length; i++) {
      rbuf[rbuf.length - 1 - i] = buf[buf.length - 1 - i];
    }
    for (i = 0; i < size - natlen; i++) {
      rbuf[i] = 0;
    }
    return rbuf
  };
  /**
   * Convert a big number into a hex string. This is somewhat ambiguous, so there
   * is an opts parameter that let's you specify the endianness or the size.
   * opts.endian can be either 'big' or 'little' and opts.size can be any
   * sufficiently large number of bytes. If you always want to create a 32 byte
   * big endian number, then specify opts = { endian: 'big', size: 32 }
   *
   * @param {Object} opts Defaults to { endian: 'big', size: 32 }
   */
  BN$f.prototype.toHex = function (...args) {
    return this.toBuffer(...args).toString('hex')
  };

  /**
   * Convert a hex string (such as a 256 bit binary private key) into a big
   * number. Sometimes these numbers can be formatted either as 'big endian' or
   * 'little endian', and so there is an opts parameter that lets you specify
   * which endianness is specified.
   *
   * @param {Buffer} buf A buffer number, such as a 256 bit hash or key.
   * @param {Object} opts With a property 'endian' that can be either 'big' or 'little'. Defaults big endian (most significant digit first).
   */
  BN$f.fromHex = function (hex, ...args) {
    return BN$f.fromBuffer(Buffer$1.from(hex, 'hex'), ...args)
  };

  var bn$1 = BN$f;

  var elliptic = {};

  var name = "elliptic";
  var version$1 = "6.5.4";
  var description = "EC cryptography";
  var main = "lib/elliptic.js";
  var files = [
  	"lib"
  ];
  var scripts = {
  	lint: "eslint lib test",
  	"lint:fix": "npm run lint -- --fix",
  	unit: "istanbul test _mocha --reporter=spec test/index.js",
  	test: "npm run lint && npm run unit",
  	version: "grunt dist && git add dist/"
  };
  var repository = {
  	type: "git",
  	url: "git@github.com:indutny/elliptic"
  };
  var keywords = [
  	"EC",
  	"Elliptic",
  	"curve",
  	"Cryptography"
  ];
  var author = "Fedor Indutny <fedor@indutny.com>";
  var license = "MIT";
  var bugs = {
  	url: "https://github.com/indutny/elliptic/issues"
  };
  var homepage = "https://github.com/indutny/elliptic";
  var devDependencies = {
  	brfs: "^2.0.2",
  	coveralls: "^3.1.0",
  	eslint: "^7.6.0",
  	grunt: "^1.2.1",
  	"grunt-browserify": "^5.3.0",
  	"grunt-cli": "^1.3.2",
  	"grunt-contrib-connect": "^3.0.0",
  	"grunt-contrib-copy": "^1.0.0",
  	"grunt-contrib-uglify": "^5.0.0",
  	"grunt-mocha-istanbul": "^5.0.2",
  	"grunt-saucelabs": "^9.0.1",
  	istanbul: "^0.4.5",
  	mocha: "^8.0.1"
  };
  var dependencies = {
  	"bn.js": "^4.11.9",
  	brorand: "^1.1.0",
  	"hash.js": "^1.0.0",
  	"hmac-drbg": "^1.0.1",
  	inherits: "^2.0.4",
  	"minimalistic-assert": "^1.0.1",
  	"minimalistic-crypto-utils": "^1.0.1"
  };
  var require$$0$3 = {
  	name: name,
  	version: version$1,
  	description: description,
  	main: main,
  	files: files,
  	scripts: scripts,
  	repository: repository,
  	keywords: keywords,
  	author: author,
  	license: license,
  	bugs: bugs,
  	homepage: homepage,
  	devDependencies: devDependencies,
  	dependencies: dependencies
  };

  var utils$m = {};

  var minimalisticAssert = assert$h;

  function assert$h(val, msg) {
    if (!val)
      throw new Error(msg || 'Assertion failed');
  }

  assert$h.equal = function assertEqual(l, r, msg) {
    if (l != r)
      throw new Error(msg || ('Assertion failed: ' + l + ' != ' + r));
  };

  var utils$l = {};

  (function (exports) {

  	var utils = exports;

  	function toArray(msg, enc) {
  	  if (Array.isArray(msg))
  	    return msg.slice();
  	  if (!msg)
  	    return [];
  	  var res = [];
  	  if (typeof msg !== 'string') {
  	    for (var i = 0; i < msg.length; i++)
  	      res[i] = msg[i] | 0;
  	    return res;
  	  }
  	  if (enc === 'hex') {
  	    msg = msg.replace(/[^a-z0-9]+/ig, '');
  	    if (msg.length % 2 !== 0)
  	      msg = '0' + msg;
  	    for (var i = 0; i < msg.length; i += 2)
  	      res.push(parseInt(msg[i] + msg[i + 1], 16));
  	  } else {
  	    for (var i = 0; i < msg.length; i++) {
  	      var c = msg.charCodeAt(i);
  	      var hi = c >> 8;
  	      var lo = c & 0xff;
  	      if (hi)
  	        res.push(hi, lo);
  	      else
  	        res.push(lo);
  	    }
  	  }
  	  return res;
  	}
  	utils.toArray = toArray;

  	function zero2(word) {
  	  if (word.length === 1)
  	    return '0' + word;
  	  else
  	    return word;
  	}
  	utils.zero2 = zero2;

  	function toHex(msg) {
  	  var res = '';
  	  for (var i = 0; i < msg.length; i++)
  	    res += zero2(msg[i].toString(16));
  	  return res;
  	}
  	utils.toHex = toHex;

  	utils.encode = function encode(arr, enc) {
  	  if (enc === 'hex')
  	    return toHex(arr);
  	  else
  	    return arr;
  	};
  } (utils$l));

  (function (exports) {

  	var utils = exports;
  	var BN = bn$2.exports;
  	var minAssert = minimalisticAssert;
  	var minUtils = utils$l;

  	utils.assert = minAssert;
  	utils.toArray = minUtils.toArray;
  	utils.zero2 = minUtils.zero2;
  	utils.toHex = minUtils.toHex;
  	utils.encode = minUtils.encode;

  	// Represent num in a w-NAF form
  	function getNAF(num, w, bits) {
  	  var naf = new Array(Math.max(num.bitLength(), bits) + 1);
  	  naf.fill(0);

  	  var ws = 1 << (w + 1);
  	  var k = num.clone();

  	  for (var i = 0; i < naf.length; i++) {
  	    var z;
  	    var mod = k.andln(ws - 1);
  	    if (k.isOdd()) {
  	      if (mod > (ws >> 1) - 1)
  	        z = (ws >> 1) - mod;
  	      else
  	        z = mod;
  	      k.isubn(z);
  	    } else {
  	      z = 0;
  	    }

  	    naf[i] = z;
  	    k.iushrn(1);
  	  }

  	  return naf;
  	}
  	utils.getNAF = getNAF;

  	// Represent k1, k2 in a Joint Sparse Form
  	function getJSF(k1, k2) {
  	  var jsf = [
  	    [],
  	    [],
  	  ];

  	  k1 = k1.clone();
  	  k2 = k2.clone();
  	  var d1 = 0;
  	  var d2 = 0;
  	  var m8;
  	  while (k1.cmpn(-d1) > 0 || k2.cmpn(-d2) > 0) {
  	    // First phase
  	    var m14 = (k1.andln(3) + d1) & 3;
  	    var m24 = (k2.andln(3) + d2) & 3;
  	    if (m14 === 3)
  	      m14 = -1;
  	    if (m24 === 3)
  	      m24 = -1;
  	    var u1;
  	    if ((m14 & 1) === 0) {
  	      u1 = 0;
  	    } else {
  	      m8 = (k1.andln(7) + d1) & 7;
  	      if ((m8 === 3 || m8 === 5) && m24 === 2)
  	        u1 = -m14;
  	      else
  	        u1 = m14;
  	    }
  	    jsf[0].push(u1);

  	    var u2;
  	    if ((m24 & 1) === 0) {
  	      u2 = 0;
  	    } else {
  	      m8 = (k2.andln(7) + d2) & 7;
  	      if ((m8 === 3 || m8 === 5) && m14 === 2)
  	        u2 = -m24;
  	      else
  	        u2 = m24;
  	    }
  	    jsf[1].push(u2);

  	    // Second phase
  	    if (2 * d1 === u1 + 1)
  	      d1 = 1 - d1;
  	    if (2 * d2 === u2 + 1)
  	      d2 = 1 - d2;
  	    k1.iushrn(1);
  	    k2.iushrn(1);
  	  }

  	  return jsf;
  	}
  	utils.getJSF = getJSF;

  	function cachedProperty(obj, name, computer) {
  	  var key = '_' + name;
  	  obj.prototype[name] = function cachedProperty() {
  	    return this[key] !== undefined ? this[key] :
  	      this[key] = computer.call(this);
  	  };
  	}
  	utils.cachedProperty = cachedProperty;

  	function parseBytes(bytes) {
  	  return typeof bytes === 'string' ? utils.toArray(bytes, 'hex') :
  	    bytes;
  	}
  	utils.parseBytes = parseBytes;

  	function intFromLE(bytes) {
  	  return new BN(bytes, 'hex', 'le');
  	}
  	utils.intFromLE = intFromLE;
  } (utils$m));

  var brorand = {exports: {}};

  var _polyfillNode_crypto = {};

  var _polyfillNode_crypto$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    'default': _polyfillNode_crypto
  });

  var require$$0$2 = /*@__PURE__*/getAugmentedNamespace(_polyfillNode_crypto$1);

  var r$1;

  brorand.exports = function rand(len) {
    if (!r$1)
      r$1 = new Rand(null);

    return r$1.generate(len);
  };

  function Rand(rand) {
    this.rand = rand;
  }
  brorand.exports.Rand = Rand;

  Rand.prototype.generate = function generate(len) {
    return this._rand(len);
  };

  // Emulate crypto API using randy
  Rand.prototype._rand = function _rand(n) {
    if (this.rand.getBytes)
      return this.rand.getBytes(n);

    var res = new Uint8Array(n);
    for (var i = 0; i < res.length; i++)
      res[i] = this.rand.getByte();
    return res;
  };

  if (typeof self === 'object') {
    if (self.crypto && self.crypto.getRandomValues) {
      // Modern browsers
      Rand.prototype._rand = function _rand(n) {
        var arr = new Uint8Array(n);
        self.crypto.getRandomValues(arr);
        return arr;
      };
    } else if (self.msCrypto && self.msCrypto.getRandomValues) {
      // IE
      Rand.prototype._rand = function _rand(n) {
        var arr = new Uint8Array(n);
        self.msCrypto.getRandomValues(arr);
        return arr;
      };

    // Safari's WebWorkers do not have `crypto`
    } else if (typeof window === 'object') {
      // Old junk
      Rand.prototype._rand = function() {
        throw new Error('Not implemented yet');
      };
    }
  } else {
    // Node.js or Web worker with no crypto support
    try {
      var crypto = require$$0$2;
      if (typeof crypto.randomBytes !== 'function')
        throw new Error('Not supported');

      Rand.prototype._rand = function _rand(n) {
        return crypto.randomBytes(n);
      };
    } catch (e) {
    }
  }

  var curve = {};

  var BN$e = bn$2.exports;
  var utils$k = utils$m;
  var getNAF = utils$k.getNAF;
  var getJSF = utils$k.getJSF;
  var assert$g = utils$k.assert;

  function BaseCurve(type, conf) {
    this.type = type;
    this.p = new BN$e(conf.p, 16);

    // Use Montgomery, when there is no fast reduction for the prime
    this.red = conf.prime ? BN$e.red(conf.prime) : BN$e.mont(this.p);

    // Useful for many curves
    this.zero = new BN$e(0).toRed(this.red);
    this.one = new BN$e(1).toRed(this.red);
    this.two = new BN$e(2).toRed(this.red);

    // Curve configuration, optional
    this.n = conf.n && new BN$e(conf.n, 16);
    this.g = conf.g && this.pointFromJSON(conf.g, conf.gRed);

    // Temporary arrays
    this._wnafT1 = new Array(4);
    this._wnafT2 = new Array(4);
    this._wnafT3 = new Array(4);
    this._wnafT4 = new Array(4);

    this._bitLength = this.n ? this.n.bitLength() : 0;

    // Generalized Greg Maxwell's trick
    var adjustCount = this.n && this.p.div(this.n);
    if (!adjustCount || adjustCount.cmpn(100) > 0) {
      this.redN = null;
    } else {
      this._maxwellTrick = true;
      this.redN = this.n.toRed(this.red);
    }
  }
  var base$1 = BaseCurve;

  BaseCurve.prototype.point = function point() {
    throw new Error('Not implemented');
  };

  BaseCurve.prototype.validate = function validate() {
    throw new Error('Not implemented');
  };

  BaseCurve.prototype._fixedNafMul = function _fixedNafMul(p, k) {
    assert$g(p.precomputed);
    var doubles = p._getDoubles();

    var naf = getNAF(k, 1, this._bitLength);
    var I = (1 << (doubles.step + 1)) - (doubles.step % 2 === 0 ? 2 : 1);
    I /= 3;

    // Translate into more windowed form
    var repr = [];
    var j;
    var nafW;
    for (j = 0; j < naf.length; j += doubles.step) {
      nafW = 0;
      for (var l = j + doubles.step - 1; l >= j; l--)
        nafW = (nafW << 1) + naf[l];
      repr.push(nafW);
    }

    var a = this.jpoint(null, null, null);
    var b = this.jpoint(null, null, null);
    for (var i = I; i > 0; i--) {
      for (j = 0; j < repr.length; j++) {
        nafW = repr[j];
        if (nafW === i)
          b = b.mixedAdd(doubles.points[j]);
        else if (nafW === -i)
          b = b.mixedAdd(doubles.points[j].neg());
      }
      a = a.add(b);
    }
    return a.toP();
  };

  BaseCurve.prototype._wnafMul = function _wnafMul(p, k) {
    var w = 4;

    // Precompute window
    var nafPoints = p._getNAFPoints(w);
    w = nafPoints.wnd;
    var wnd = nafPoints.points;

    // Get NAF form
    var naf = getNAF(k, w, this._bitLength);

    // Add `this`*(N+1) for every w-NAF index
    var acc = this.jpoint(null, null, null);
    for (var i = naf.length - 1; i >= 0; i--) {
      // Count zeroes
      for (var l = 0; i >= 0 && naf[i] === 0; i--)
        l++;
      if (i >= 0)
        l++;
      acc = acc.dblp(l);

      if (i < 0)
        break;
      var z = naf[i];
      assert$g(z !== 0);
      if (p.type === 'affine') {
        // J +- P
        if (z > 0)
          acc = acc.mixedAdd(wnd[(z - 1) >> 1]);
        else
          acc = acc.mixedAdd(wnd[(-z - 1) >> 1].neg());
      } else {
        // J +- J
        if (z > 0)
          acc = acc.add(wnd[(z - 1) >> 1]);
        else
          acc = acc.add(wnd[(-z - 1) >> 1].neg());
      }
    }
    return p.type === 'affine' ? acc.toP() : acc;
  };

  BaseCurve.prototype._wnafMulAdd = function _wnafMulAdd(defW,
    points,
    coeffs,
    len,
    jacobianResult) {
    var wndWidth = this._wnafT1;
    var wnd = this._wnafT2;
    var naf = this._wnafT3;

    // Fill all arrays
    var max = 0;
    var i;
    var j;
    var p;
    for (i = 0; i < len; i++) {
      p = points[i];
      var nafPoints = p._getNAFPoints(defW);
      wndWidth[i] = nafPoints.wnd;
      wnd[i] = nafPoints.points;
    }

    // Comb small window NAFs
    for (i = len - 1; i >= 1; i -= 2) {
      var a = i - 1;
      var b = i;
      if (wndWidth[a] !== 1 || wndWidth[b] !== 1) {
        naf[a] = getNAF(coeffs[a], wndWidth[a], this._bitLength);
        naf[b] = getNAF(coeffs[b], wndWidth[b], this._bitLength);
        max = Math.max(naf[a].length, max);
        max = Math.max(naf[b].length, max);
        continue;
      }

      var comb = [
        points[a], /* 1 */
        null, /* 3 */
        null, /* 5 */
        points[b], /* 7 */
      ];

      // Try to avoid Projective points, if possible
      if (points[a].y.cmp(points[b].y) === 0) {
        comb[1] = points[a].add(points[b]);
        comb[2] = points[a].toJ().mixedAdd(points[b].neg());
      } else if (points[a].y.cmp(points[b].y.redNeg()) === 0) {
        comb[1] = points[a].toJ().mixedAdd(points[b]);
        comb[2] = points[a].add(points[b].neg());
      } else {
        comb[1] = points[a].toJ().mixedAdd(points[b]);
        comb[2] = points[a].toJ().mixedAdd(points[b].neg());
      }

      var index = [
        -3, /* -1 -1 */
        -1, /* -1 0 */
        -5, /* -1 1 */
        -7, /* 0 -1 */
        0, /* 0 0 */
        7, /* 0 1 */
        5, /* 1 -1 */
        1, /* 1 0 */
        3,  /* 1 1 */
      ];

      var jsf = getJSF(coeffs[a], coeffs[b]);
      max = Math.max(jsf[0].length, max);
      naf[a] = new Array(max);
      naf[b] = new Array(max);
      for (j = 0; j < max; j++) {
        var ja = jsf[0][j] | 0;
        var jb = jsf[1][j] | 0;

        naf[a][j] = index[(ja + 1) * 3 + (jb + 1)];
        naf[b][j] = 0;
        wnd[a] = comb;
      }
    }

    var acc = this.jpoint(null, null, null);
    var tmp = this._wnafT4;
    for (i = max; i >= 0; i--) {
      var k = 0;

      while (i >= 0) {
        var zero = true;
        for (j = 0; j < len; j++) {
          tmp[j] = naf[j][i] | 0;
          if (tmp[j] !== 0)
            zero = false;
        }
        if (!zero)
          break;
        k++;
        i--;
      }
      if (i >= 0)
        k++;
      acc = acc.dblp(k);
      if (i < 0)
        break;

      for (j = 0; j < len; j++) {
        var z = tmp[j];
        if (z === 0)
          continue;
        else if (z > 0)
          p = wnd[j][(z - 1) >> 1];
        else if (z < 0)
          p = wnd[j][(-z - 1) >> 1].neg();

        if (p.type === 'affine')
          acc = acc.mixedAdd(p);
        else
          acc = acc.add(p);
      }
    }
    // Zeroify references
    for (i = 0; i < len; i++)
      wnd[i] = null;

    if (jacobianResult)
      return acc;
    else
      return acc.toP();
  };

  function BasePoint(curve, type) {
    this.curve = curve;
    this.type = type;
    this.precomputed = null;
  }
  BaseCurve.BasePoint = BasePoint;

  BasePoint.prototype.eq = function eq(/*other*/) {
    throw new Error('Not implemented');
  };

  BasePoint.prototype.validate = function validate() {
    return this.curve.validate(this);
  };

  BaseCurve.prototype.decodePoint = function decodePoint(bytes, enc) {
    bytes = utils$k.toArray(bytes, enc);

    var len = this.p.byteLength();

    // uncompressed, hybrid-odd, hybrid-even
    if ((bytes[0] === 0x04 || bytes[0] === 0x06 || bytes[0] === 0x07) &&
        bytes.length - 1 === 2 * len) {
      if (bytes[0] === 0x06)
        assert$g(bytes[bytes.length - 1] % 2 === 0);
      else if (bytes[0] === 0x07)
        assert$g(bytes[bytes.length - 1] % 2 === 1);

      var res =  this.point(bytes.slice(1, 1 + len),
        bytes.slice(1 + len, 1 + 2 * len));

      return res;
    } else if ((bytes[0] === 0x02 || bytes[0] === 0x03) &&
                bytes.length - 1 === len) {
      return this.pointFromX(bytes.slice(1, 1 + len), bytes[0] === 0x03);
    }
    throw new Error('Unknown point format');
  };

  BasePoint.prototype.encodeCompressed = function encodeCompressed(enc) {
    return this.encode(enc, true);
  };

  BasePoint.prototype._encode = function _encode(compact) {
    var len = this.curve.p.byteLength();
    var x = this.getX().toArray('be', len);

    if (compact)
      return [ this.getY().isEven() ? 0x02 : 0x03 ].concat(x);

    return [ 0x04 ].concat(x, this.getY().toArray('be', len));
  };

  BasePoint.prototype.encode = function encode(enc, compact) {
    return utils$k.encode(this._encode(compact), enc);
  };

  BasePoint.prototype.precompute = function precompute(power) {
    if (this.precomputed)
      return this;

    var precomputed = {
      doubles: null,
      naf: null,
      beta: null,
    };
    precomputed.naf = this._getNAFPoints(8);
    precomputed.doubles = this._getDoubles(4, power);
    precomputed.beta = this._getBeta();
    this.precomputed = precomputed;

    return this;
  };

  BasePoint.prototype._hasDoubles = function _hasDoubles(k) {
    if (!this.precomputed)
      return false;

    var doubles = this.precomputed.doubles;
    if (!doubles)
      return false;

    return doubles.points.length >= Math.ceil((k.bitLength() + 1) / doubles.step);
  };

  BasePoint.prototype._getDoubles = function _getDoubles(step, power) {
    if (this.precomputed && this.precomputed.doubles)
      return this.precomputed.doubles;

    var doubles = [ this ];
    var acc = this;
    for (var i = 0; i < power; i += step) {
      for (var j = 0; j < step; j++)
        acc = acc.dbl();
      doubles.push(acc);
    }
    return {
      step: step,
      points: doubles,
    };
  };

  BasePoint.prototype._getNAFPoints = function _getNAFPoints(wnd) {
    if (this.precomputed && this.precomputed.naf)
      return this.precomputed.naf;

    var res = [ this ];
    var max = (1 << wnd) - 1;
    var dbl = max === 1 ? null : this.dbl();
    for (var i = 1; i < max; i++)
      res[i] = res[i - 1].add(dbl);
    return {
      wnd: wnd,
      points: res,
    };
  };

  BasePoint.prototype._getBeta = function _getBeta() {
    return null;
  };

  BasePoint.prototype.dblp = function dblp(k) {
    var r = this;
    for (var i = 0; i < k; i++)
      r = r.dbl();
    return r;
  };

  var inherits$7 = {exports: {}};

  // shim for using process in browser
  // based off https://github.com/defunctzombie/node-process/blob/master/browser.js

  function defaultSetTimout() {
      throw new Error('setTimeout has not been defined');
  }
  function defaultClearTimeout () {
      throw new Error('clearTimeout has not been defined');
  }
  var cachedSetTimeout = defaultSetTimout;
  var cachedClearTimeout = defaultClearTimeout;
  if (typeof global$1.setTimeout === 'function') {
      cachedSetTimeout = setTimeout;
  }
  if (typeof global$1.clearTimeout === 'function') {
      cachedClearTimeout = clearTimeout;
  }

  function runTimeout(fun) {
      if (cachedSetTimeout === setTimeout) {
          //normal enviroments in sane situations
          return setTimeout(fun, 0);
      }
      // if setTimeout wasn't available but was latter defined
      if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
          cachedSetTimeout = setTimeout;
          return setTimeout(fun, 0);
      }
      try {
          // when when somebody has screwed with setTimeout but no I.E. maddness
          return cachedSetTimeout(fun, 0);
      } catch(e){
          try {
              // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
              return cachedSetTimeout.call(null, fun, 0);
          } catch(e){
              // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
              return cachedSetTimeout.call(this, fun, 0);
          }
      }


  }
  function runClearTimeout(marker) {
      if (cachedClearTimeout === clearTimeout) {
          //normal enviroments in sane situations
          return clearTimeout(marker);
      }
      // if clearTimeout wasn't available but was latter defined
      if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
          cachedClearTimeout = clearTimeout;
          return clearTimeout(marker);
      }
      try {
          // when when somebody has screwed with setTimeout but no I.E. maddness
          return cachedClearTimeout(marker);
      } catch (e){
          try {
              // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
              return cachedClearTimeout.call(null, marker);
          } catch (e){
              // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
              // Some versions of I.E. have different rules for clearTimeout vs setTimeout
              return cachedClearTimeout.call(this, marker);
          }
      }



  }
  var queue = [];
  var draining = false;
  var currentQueue;
  var queueIndex = -1;

  function cleanUpNextTick() {
      if (!draining || !currentQueue) {
          return;
      }
      draining = false;
      if (currentQueue.length) {
          queue = currentQueue.concat(queue);
      } else {
          queueIndex = -1;
      }
      if (queue.length) {
          drainQueue();
      }
  }

  function drainQueue() {
      if (draining) {
          return;
      }
      var timeout = runTimeout(cleanUpNextTick);
      draining = true;

      var len = queue.length;
      while(len) {
          currentQueue = queue;
          queue = [];
          while (++queueIndex < len) {
              if (currentQueue) {
                  currentQueue[queueIndex].run();
              }
          }
          queueIndex = -1;
          len = queue.length;
      }
      currentQueue = null;
      draining = false;
      runClearTimeout(timeout);
  }
  function nextTick(fun) {
      var args = new Array(arguments.length - 1);
      if (arguments.length > 1) {
          for (var i = 1; i < arguments.length; i++) {
              args[i - 1] = arguments[i];
          }
      }
      queue.push(new Item(fun, args));
      if (queue.length === 1 && !draining) {
          runTimeout(drainQueue);
      }
  }
  // v8 likes predictible objects
  function Item(fun, array) {
      this.fun = fun;
      this.array = array;
  }
  Item.prototype.run = function () {
      this.fun.apply(null, this.array);
  };
  var title = 'browser';
  var platform = 'browser';
  var browser = true;
  var env = {};
  var argv = [];
  var version = ''; // empty string to avoid regexp issues
  var versions = {};
  var release = {};
  var config = {};

  function noop() {}

  var on = noop;
  var addListener = noop;
  var once = noop;
  var off = noop;
  var removeListener = noop;
  var removeAllListeners = noop;
  var emit = noop;

  function binding(name) {
      throw new Error('process.binding is not supported');
  }

  function cwd () { return '/' }
  function chdir (dir) {
      throw new Error('process.chdir is not supported');
  }function umask() { return 0; }

  // from https://github.com/kumavis/browser-process-hrtime/blob/master/index.js
  var performance = global$1.performance || {};
  var performanceNow =
    performance.now        ||
    performance.mozNow     ||
    performance.msNow      ||
    performance.oNow       ||
    performance.webkitNow  ||
    function(){ return (new Date()).getTime() };

  // generate timestamp or delta
  // see http://nodejs.org/api/process.html#process_process_hrtime
  function hrtime(previousTimestamp){
    var clocktime = performanceNow.call(performance)*1e-3;
    var seconds = Math.floor(clocktime);
    var nanoseconds = Math.floor((clocktime%1)*1e9);
    if (previousTimestamp) {
      seconds = seconds - previousTimestamp[0];
      nanoseconds = nanoseconds - previousTimestamp[1];
      if (nanoseconds<0) {
        seconds--;
        nanoseconds += 1e9;
      }
    }
    return [seconds,nanoseconds]
  }

  var startTime = new Date();
  function uptime() {
    var currentTime = new Date();
    var dif = currentTime - startTime;
    return dif / 1000;
  }

  var browser$1 = {
    nextTick: nextTick,
    title: title,
    browser: browser,
    env: env,
    argv: argv,
    version: version,
    versions: versions,
    on: on,
    addListener: addListener,
    once: once,
    off: off,
    removeListener: removeListener,
    removeAllListeners: removeAllListeners,
    emit: emit,
    binding: binding,
    cwd: cwd,
    chdir: chdir,
    umask: umask,
    hrtime: hrtime,
    platform: platform,
    release: release,
    config: config,
    uptime: uptime
  };

  var inherits$5;
  if (typeof Object.create === 'function'){
    inherits$5 = function inherits(ctor, superCtor) {
      // implementation from standard node.js 'util' module
      ctor.super_ = superCtor;
      ctor.prototype = Object.create(superCtor.prototype, {
        constructor: {
          value: ctor,
          enumerable: false,
          writable: true,
          configurable: true
        }
      });
    };
  } else {
    inherits$5 = function inherits(ctor, superCtor) {
      ctor.super_ = superCtor;
      var TempCtor = function () {};
      TempCtor.prototype = superCtor.prototype;
      ctor.prototype = new TempCtor();
      ctor.prototype.constructor = ctor;
    };
  }
  var inherits$6 = inherits$5;

  var formatRegExp = /%[sdj%]/g;
  function format(f) {
    if (!isString(f)) {
      var objects = [];
      for (var i = 0; i < arguments.length; i++) {
        objects.push(inspect$1(arguments[i]));
      }
      return objects.join(' ');
    }

    var i = 1;
    var args = arguments;
    var len = args.length;
    var str = String(f).replace(formatRegExp, function(x) {
      if (x === '%%') return '%';
      if (i >= len) return x;
      switch (x) {
        case '%s': return String(args[i++]);
        case '%d': return Number(args[i++]);
        case '%j':
          try {
            return JSON.stringify(args[i++]);
          } catch (_) {
            return '[Circular]';
          }
        default:
          return x;
      }
    });
    for (var x = args[i]; i < len; x = args[++i]) {
      if (isNull(x) || !isObject(x)) {
        str += ' ' + x;
      } else {
        str += ' ' + inspect$1(x);
      }
    }
    return str;
  }

  // Mark that a method should not be used.
  // Returns a modified function which warns once by default.
  // If --no-deprecation is set, then it is a no-op.
  function deprecate(fn, msg) {
    // Allow for deprecating things in the process of starting up.
    if (isUndefined(global$1.process)) {
      return function() {
        return deprecate(fn, msg).apply(this, arguments);
      };
    }

    if (browser$1.noDeprecation === true) {
      return fn;
    }

    var warned = false;
    function deprecated() {
      if (!warned) {
        if (browser$1.throwDeprecation) {
          throw new Error(msg);
        } else if (browser$1.traceDeprecation) {
          console.trace(msg);
        } else {
          console.error(msg);
        }
        warned = true;
      }
      return fn.apply(this, arguments);
    }

    return deprecated;
  }

  var debugs = {};
  var debugEnviron;
  function debuglog(set) {
    if (isUndefined(debugEnviron))
      debugEnviron = browser$1.env.NODE_DEBUG || '';
    set = set.toUpperCase();
    if (!debugs[set]) {
      if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
        var pid = 0;
        debugs[set] = function() {
          var msg = format.apply(null, arguments);
          console.error('%s %d: %s', set, pid, msg);
        };
      } else {
        debugs[set] = function() {};
      }
    }
    return debugs[set];
  }

  /**
   * Echos the value of a value. Trys to print the value out
   * in the best way possible given the different types.
   *
   * @param {Object} obj The object to print out.
   * @param {Object} opts Optional options object that alters the output.
   */
  /* legacy: obj, showHidden, depth, colors*/
  function inspect$1(obj, opts) {
    // default options
    var ctx = {
      seen: [],
      stylize: stylizeNoColor
    };
    // legacy...
    if (arguments.length >= 3) ctx.depth = arguments[2];
    if (arguments.length >= 4) ctx.colors = arguments[3];
    if (isBoolean(opts)) {
      // legacy...
      ctx.showHidden = opts;
    } else if (opts) {
      // got an "options" object
      _extend(ctx, opts);
    }
    // set default options
    if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
    if (isUndefined(ctx.depth)) ctx.depth = 2;
    if (isUndefined(ctx.colors)) ctx.colors = false;
    if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
    if (ctx.colors) ctx.stylize = stylizeWithColor;
    return formatValue(ctx, obj, ctx.depth);
  }

  // http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
  inspect$1.colors = {
    'bold' : [1, 22],
    'italic' : [3, 23],
    'underline' : [4, 24],
    'inverse' : [7, 27],
    'white' : [37, 39],
    'grey' : [90, 39],
    'black' : [30, 39],
    'blue' : [34, 39],
    'cyan' : [36, 39],
    'green' : [32, 39],
    'magenta' : [35, 39],
    'red' : [31, 39],
    'yellow' : [33, 39]
  };

  // Don't use 'blue' not visible on cmd.exe
  inspect$1.styles = {
    'special': 'cyan',
    'number': 'yellow',
    'boolean': 'yellow',
    'undefined': 'grey',
    'null': 'bold',
    'string': 'green',
    'date': 'magenta',
    // "name": intentionally not styling
    'regexp': 'red'
  };


  function stylizeWithColor(str, styleType) {
    var style = inspect$1.styles[styleType];

    if (style) {
      return '\u001b[' + inspect$1.colors[style][0] + 'm' + str +
             '\u001b[' + inspect$1.colors[style][1] + 'm';
    } else {
      return str;
    }
  }


  function stylizeNoColor(str, styleType) {
    return str;
  }


  function arrayToHash(array) {
    var hash = {};

    array.forEach(function(val, idx) {
      hash[val] = true;
    });

    return hash;
  }


  function formatValue(ctx, value, recurseTimes) {
    // Provide a hook for user-specified inspect functions.
    // Check that value is an object with an inspect function on it
    if (ctx.customInspect &&
        value &&
        isFunction(value.inspect) &&
        // Filter out the util module, it's inspect function is special
        value.inspect !== inspect$1 &&
        // Also filter out any prototype objects using the circular check.
        !(value.constructor && value.constructor.prototype === value)) {
      var ret = value.inspect(recurseTimes, ctx);
      if (!isString(ret)) {
        ret = formatValue(ctx, ret, recurseTimes);
      }
      return ret;
    }

    // Primitive types cannot have properties
    var primitive = formatPrimitive(ctx, value);
    if (primitive) {
      return primitive;
    }

    // Look up the keys of the object.
    var keys = Object.keys(value);
    var visibleKeys = arrayToHash(keys);

    if (ctx.showHidden) {
      keys = Object.getOwnPropertyNames(value);
    }

    // IE doesn't make error fields non-enumerable
    // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
    if (isError(value)
        && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
      return formatError(value);
    }

    // Some type of object without properties can be shortcutted.
    if (keys.length === 0) {
      if (isFunction(value)) {
        var name = value.name ? ': ' + value.name : '';
        return ctx.stylize('[Function' + name + ']', 'special');
      }
      if (isRegExp(value)) {
        return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
      }
      if (isDate(value)) {
        return ctx.stylize(Date.prototype.toString.call(value), 'date');
      }
      if (isError(value)) {
        return formatError(value);
      }
    }

    var base = '', array = false, braces = ['{', '}'];

    // Make Array say that they are Array
    if (isArray(value)) {
      array = true;
      braces = ['[', ']'];
    }

    // Make functions say that they are functions
    if (isFunction(value)) {
      var n = value.name ? ': ' + value.name : '';
      base = ' [Function' + n + ']';
    }

    // Make RegExps say that they are RegExps
    if (isRegExp(value)) {
      base = ' ' + RegExp.prototype.toString.call(value);
    }

    // Make dates with properties first say the date
    if (isDate(value)) {
      base = ' ' + Date.prototype.toUTCString.call(value);
    }

    // Make error with message first say the error
    if (isError(value)) {
      base = ' ' + formatError(value);
    }

    if (keys.length === 0 && (!array || value.length == 0)) {
      return braces[0] + base + braces[1];
    }

    if (recurseTimes < 0) {
      if (isRegExp(value)) {
        return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
      } else {
        return ctx.stylize('[Object]', 'special');
      }
    }

    ctx.seen.push(value);

    var output;
    if (array) {
      output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
    } else {
      output = keys.map(function(key) {
        return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
      });
    }

    ctx.seen.pop();

    return reduceToSingleString(output, base, braces);
  }


  function formatPrimitive(ctx, value) {
    if (isUndefined(value))
      return ctx.stylize('undefined', 'undefined');
    if (isString(value)) {
      var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                               .replace(/'/g, "\\'")
                                               .replace(/\\"/g, '"') + '\'';
      return ctx.stylize(simple, 'string');
    }
    if (isNumber(value))
      return ctx.stylize('' + value, 'number');
    if (isBoolean(value))
      return ctx.stylize('' + value, 'boolean');
    // For some reason typeof null is "object", so special case here.
    if (isNull(value))
      return ctx.stylize('null', 'null');
  }


  function formatError(value) {
    return '[' + Error.prototype.toString.call(value) + ']';
  }


  function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
    var output = [];
    for (var i = 0, l = value.length; i < l; ++i) {
      if (hasOwnProperty(value, String(i))) {
        output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
            String(i), true));
      } else {
        output.push('');
      }
    }
    keys.forEach(function(key) {
      if (!key.match(/^\d+$/)) {
        output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
            key, true));
      }
    });
    return output;
  }


  function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
    var name, str, desc;
    desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
    if (desc.get) {
      if (desc.set) {
        str = ctx.stylize('[Getter/Setter]', 'special');
      } else {
        str = ctx.stylize('[Getter]', 'special');
      }
    } else {
      if (desc.set) {
        str = ctx.stylize('[Setter]', 'special');
      }
    }
    if (!hasOwnProperty(visibleKeys, key)) {
      name = '[' + key + ']';
    }
    if (!str) {
      if (ctx.seen.indexOf(desc.value) < 0) {
        if (isNull(recurseTimes)) {
          str = formatValue(ctx, desc.value, null);
        } else {
          str = formatValue(ctx, desc.value, recurseTimes - 1);
        }
        if (str.indexOf('\n') > -1) {
          if (array) {
            str = str.split('\n').map(function(line) {
              return '  ' + line;
            }).join('\n').substr(2);
          } else {
            str = '\n' + str.split('\n').map(function(line) {
              return '   ' + line;
            }).join('\n');
          }
        }
      } else {
        str = ctx.stylize('[Circular]', 'special');
      }
    }
    if (isUndefined(name)) {
      if (array && key.match(/^\d+$/)) {
        return str;
      }
      name = JSON.stringify('' + key);
      if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
        name = name.substr(1, name.length - 2);
        name = ctx.stylize(name, 'name');
      } else {
        name = name.replace(/'/g, "\\'")
                   .replace(/\\"/g, '"')
                   .replace(/(^"|"$)/g, "'");
        name = ctx.stylize(name, 'string');
      }
    }

    return name + ': ' + str;
  }


  function reduceToSingleString(output, base, braces) {
    var length = output.reduce(function(prev, cur) {
      if (cur.indexOf('\n') >= 0) ;
      return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
    }, 0);

    if (length > 60) {
      return braces[0] +
             (base === '' ? '' : base + '\n ') +
             ' ' +
             output.join(',\n  ') +
             ' ' +
             braces[1];
    }

    return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
  }


  // NOTE: These type checking functions intentionally don't use `instanceof`
  // because it is fragile and can be easily faked with `Object.create()`.
  function isArray(ar) {
    return Array.isArray(ar);
  }

  function isBoolean(arg) {
    return typeof arg === 'boolean';
  }

  function isNull(arg) {
    return arg === null;
  }

  function isNullOrUndefined(arg) {
    return arg == null;
  }

  function isNumber(arg) {
    return typeof arg === 'number';
  }

  function isString(arg) {
    return typeof arg === 'string';
  }

  function isSymbol(arg) {
    return typeof arg === 'symbol';
  }

  function isUndefined(arg) {
    return arg === void 0;
  }

  function isRegExp(re) {
    return isObject(re) && objectToString(re) === '[object RegExp]';
  }

  function isObject(arg) {
    return typeof arg === 'object' && arg !== null;
  }

  function isDate(d) {
    return isObject(d) && objectToString(d) === '[object Date]';
  }

  function isError(e) {
    return isObject(e) &&
        (objectToString(e) === '[object Error]' || e instanceof Error);
  }

  function isFunction(arg) {
    return typeof arg === 'function';
  }

  function isPrimitive(arg) {
    return arg === null ||
           typeof arg === 'boolean' ||
           typeof arg === 'number' ||
           typeof arg === 'string' ||
           typeof arg === 'symbol' ||  // ES6 symbol
           typeof arg === 'undefined';
  }

  function isBuffer(maybeBuf) {
    return Buffer$1.isBuffer(maybeBuf);
  }

  function objectToString(o) {
    return Object.prototype.toString.call(o);
  }


  function pad(n) {
    return n < 10 ? '0' + n.toString(10) : n.toString(10);
  }


  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
                'Oct', 'Nov', 'Dec'];

  // 26 Feb 16:19:34
  function timestamp() {
    var d = new Date();
    var time = [pad(d.getHours()),
                pad(d.getMinutes()),
                pad(d.getSeconds())].join(':');
    return [d.getDate(), months[d.getMonth()], time].join(' ');
  }


  // log is just a thin wrapper to console.log that prepends a timestamp
  function log() {
    console.log('%s - %s', timestamp(), format.apply(null, arguments));
  }

  function _extend(origin, add) {
    // Don't do anything if add isn't an object
    if (!add || !isObject(add)) return origin;

    var keys = Object.keys(add);
    var i = keys.length;
    while (i--) {
      origin[keys[i]] = add[keys[i]];
    }
    return origin;
  }
  function hasOwnProperty(obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
  }

  var _polyfillNode_util = {
    inherits: inherits$6,
    _extend: _extend,
    log: log,
    isBuffer: isBuffer,
    isPrimitive: isPrimitive,
    isFunction: isFunction,
    isError: isError,
    isDate: isDate,
    isObject: isObject,
    isRegExp: isRegExp,
    isUndefined: isUndefined,
    isSymbol: isSymbol,
    isString: isString,
    isNumber: isNumber,
    isNullOrUndefined: isNullOrUndefined,
    isNull: isNull,
    isBoolean: isBoolean,
    isArray: isArray,
    inspect: inspect$1,
    deprecate: deprecate,
    format: format,
    debuglog: debuglog
  };

  var _polyfillNode_util$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    format: format,
    deprecate: deprecate,
    debuglog: debuglog,
    inspect: inspect$1,
    isArray: isArray,
    isBoolean: isBoolean,
    isNull: isNull,
    isNullOrUndefined: isNullOrUndefined,
    isNumber: isNumber,
    isString: isString,
    isSymbol: isSymbol,
    isUndefined: isUndefined,
    isRegExp: isRegExp,
    isObject: isObject,
    isDate: isDate,
    isError: isError,
    isFunction: isFunction,
    isPrimitive: isPrimitive,
    isBuffer: isBuffer,
    log: log,
    inherits: inherits$6,
    _extend: _extend,
    'default': _polyfillNode_util
  });

  var require$$0$1 = /*@__PURE__*/getAugmentedNamespace(_polyfillNode_util$1);

  var inherits_browser$1 = {exports: {}};

  var hasRequiredInherits_browser$1;

  function requireInherits_browser$1 () {
  	if (hasRequiredInherits_browser$1) return inherits_browser$1.exports;
  	hasRequiredInherits_browser$1 = 1;
  	if (typeof Object.create === 'function') {
  	  // implementation from standard node.js 'util' module
  	  inherits_browser$1.exports = function inherits(ctor, superCtor) {
  	    if (superCtor) {
  	      ctor.super_ = superCtor;
  	      ctor.prototype = Object.create(superCtor.prototype, {
  	        constructor: {
  	          value: ctor,
  	          enumerable: false,
  	          writable: true,
  	          configurable: true
  	        }
  	      });
  	    }
  	  };
  	} else {
  	  // old school shim for old browsers
  	  inherits_browser$1.exports = function inherits(ctor, superCtor) {
  	    if (superCtor) {
  	      ctor.super_ = superCtor;
  	      var TempCtor = function () {};
  	      TempCtor.prototype = superCtor.prototype;
  	      ctor.prototype = new TempCtor();
  	      ctor.prototype.constructor = ctor;
  	    }
  	  };
  	}
  	return inherits_browser$1.exports;
  }

  (function (module) {
  	try {
  	  var util = require$$0$1;
  	  /* istanbul ignore next */
  	  if (typeof util.inherits !== 'function') throw '';
  	  module.exports = util.inherits;
  	} catch (e) {
  	  /* istanbul ignore next */
  	  module.exports = requireInherits_browser$1();
  	}
  } (inherits$7));

  var utils$j = utils$m;
  var BN$d = bn$2.exports;
  var inherits$4 = inherits$7.exports;
  var Base$2 = base$1;

  var assert$f = utils$j.assert;

  function ShortCurve(conf) {
    Base$2.call(this, 'short', conf);

    this.a = new BN$d(conf.a, 16).toRed(this.red);
    this.b = new BN$d(conf.b, 16).toRed(this.red);
    this.tinv = this.two.redInvm();

    this.zeroA = this.a.fromRed().cmpn(0) === 0;
    this.threeA = this.a.fromRed().sub(this.p).cmpn(-3) === 0;

    // If the curve is endomorphic, precalculate beta and lambda
    this.endo = this._getEndomorphism(conf);
    this._endoWnafT1 = new Array(4);
    this._endoWnafT2 = new Array(4);
  }
  inherits$4(ShortCurve, Base$2);
  var short = ShortCurve;

  ShortCurve.prototype._getEndomorphism = function _getEndomorphism(conf) {
    // No efficient endomorphism
    if (!this.zeroA || !this.g || !this.n || this.p.modn(3) !== 1)
      return;

    // Compute beta and lambda, that lambda * P = (beta * Px; Py)
    var beta;
    var lambda;
    if (conf.beta) {
      beta = new BN$d(conf.beta, 16).toRed(this.red);
    } else {
      var betas = this._getEndoRoots(this.p);
      // Choose the smallest beta
      beta = betas[0].cmp(betas[1]) < 0 ? betas[0] : betas[1];
      beta = beta.toRed(this.red);
    }
    if (conf.lambda) {
      lambda = new BN$d(conf.lambda, 16);
    } else {
      // Choose the lambda that is matching selected beta
      var lambdas = this._getEndoRoots(this.n);
      if (this.g.mul(lambdas[0]).x.cmp(this.g.x.redMul(beta)) === 0) {
        lambda = lambdas[0];
      } else {
        lambda = lambdas[1];
        assert$f(this.g.mul(lambda).x.cmp(this.g.x.redMul(beta)) === 0);
      }
    }

    // Get basis vectors, used for balanced length-two representation
    var basis;
    if (conf.basis) {
      basis = conf.basis.map(function(vec) {
        return {
          a: new BN$d(vec.a, 16),
          b: new BN$d(vec.b, 16),
        };
      });
    } else {
      basis = this._getEndoBasis(lambda);
    }

    return {
      beta: beta,
      lambda: lambda,
      basis: basis,
    };
  };

  ShortCurve.prototype._getEndoRoots = function _getEndoRoots(num) {
    // Find roots of for x^2 + x + 1 in F
    // Root = (-1 +- Sqrt(-3)) / 2
    //
    var red = num === this.p ? this.red : BN$d.mont(num);
    var tinv = new BN$d(2).toRed(red).redInvm();
    var ntinv = tinv.redNeg();

    var s = new BN$d(3).toRed(red).redNeg().redSqrt().redMul(tinv);

    var l1 = ntinv.redAdd(s).fromRed();
    var l2 = ntinv.redSub(s).fromRed();
    return [ l1, l2 ];
  };

  ShortCurve.prototype._getEndoBasis = function _getEndoBasis(lambda) {
    // aprxSqrt >= sqrt(this.n)
    var aprxSqrt = this.n.ushrn(Math.floor(this.n.bitLength() / 2));

    // 3.74
    // Run EGCD, until r(L + 1) < aprxSqrt
    var u = lambda;
    var v = this.n.clone();
    var x1 = new BN$d(1);
    var y1 = new BN$d(0);
    var x2 = new BN$d(0);
    var y2 = new BN$d(1);

    // NOTE: all vectors are roots of: a + b * lambda = 0 (mod n)
    var a0;
    var b0;
    // First vector
    var a1;
    var b1;
    // Second vector
    var a2;
    var b2;

    var prevR;
    var i = 0;
    var r;
    var x;
    while (u.cmpn(0) !== 0) {
      var q = v.div(u);
      r = v.sub(q.mul(u));
      x = x2.sub(q.mul(x1));
      var y = y2.sub(q.mul(y1));

      if (!a1 && r.cmp(aprxSqrt) < 0) {
        a0 = prevR.neg();
        b0 = x1;
        a1 = r.neg();
        b1 = x;
      } else if (a1 && ++i === 2) {
        break;
      }
      prevR = r;

      v = u;
      u = r;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
    }
    a2 = r.neg();
    b2 = x;

    var len1 = a1.sqr().add(b1.sqr());
    var len2 = a2.sqr().add(b2.sqr());
    if (len2.cmp(len1) >= 0) {
      a2 = a0;
      b2 = b0;
    }

    // Normalize signs
    if (a1.negative) {
      a1 = a1.neg();
      b1 = b1.neg();
    }
    if (a2.negative) {
      a2 = a2.neg();
      b2 = b2.neg();
    }

    return [
      { a: a1, b: b1 },
      { a: a2, b: b2 },
    ];
  };

  ShortCurve.prototype._endoSplit = function _endoSplit(k) {
    var basis = this.endo.basis;
    var v1 = basis[0];
    var v2 = basis[1];

    var c1 = v2.b.mul(k).divRound(this.n);
    var c2 = v1.b.neg().mul(k).divRound(this.n);

    var p1 = c1.mul(v1.a);
    var p2 = c2.mul(v2.a);
    var q1 = c1.mul(v1.b);
    var q2 = c2.mul(v2.b);

    // Calculate answer
    var k1 = k.sub(p1).sub(p2);
    var k2 = q1.add(q2).neg();
    return { k1: k1, k2: k2 };
  };

  ShortCurve.prototype.pointFromX = function pointFromX(x, odd) {
    x = new BN$d(x, 16);
    if (!x.red)
      x = x.toRed(this.red);

    var y2 = x.redSqr().redMul(x).redIAdd(x.redMul(this.a)).redIAdd(this.b);
    var y = y2.redSqrt();
    if (y.redSqr().redSub(y2).cmp(this.zero) !== 0)
      throw new Error('invalid point');

    // XXX Is there any way to tell if the number is odd without converting it
    // to non-red form?
    var isOdd = y.fromRed().isOdd();
    if (odd && !isOdd || !odd && isOdd)
      y = y.redNeg();

    return this.point(x, y);
  };

  ShortCurve.prototype.validate = function validate(point) {
    if (point.inf)
      return true;

    var x = point.x;
    var y = point.y;

    var ax = this.a.redMul(x);
    var rhs = x.redSqr().redMul(x).redIAdd(ax).redIAdd(this.b);
    return y.redSqr().redISub(rhs).cmpn(0) === 0;
  };

  ShortCurve.prototype._endoWnafMulAdd =
      function _endoWnafMulAdd(points, coeffs, jacobianResult) {
        var npoints = this._endoWnafT1;
        var ncoeffs = this._endoWnafT2;
        for (var i = 0; i < points.length; i++) {
          var split = this._endoSplit(coeffs[i]);
          var p = points[i];
          var beta = p._getBeta();

          if (split.k1.negative) {
            split.k1.ineg();
            p = p.neg(true);
          }
          if (split.k2.negative) {
            split.k2.ineg();
            beta = beta.neg(true);
          }

          npoints[i * 2] = p;
          npoints[i * 2 + 1] = beta;
          ncoeffs[i * 2] = split.k1;
          ncoeffs[i * 2 + 1] = split.k2;
        }
        var res = this._wnafMulAdd(1, npoints, ncoeffs, i * 2, jacobianResult);

        // Clean-up references to points and coefficients
        for (var j = 0; j < i * 2; j++) {
          npoints[j] = null;
          ncoeffs[j] = null;
        }
        return res;
      };

  function Point$3(curve, x, y, isRed) {
    Base$2.BasePoint.call(this, curve, 'affine');
    if (x === null && y === null) {
      this.x = null;
      this.y = null;
      this.inf = true;
    } else {
      this.x = new BN$d(x, 16);
      this.y = new BN$d(y, 16);
      // Force redgomery representation when loading from JSON
      if (isRed) {
        this.x.forceRed(this.curve.red);
        this.y.forceRed(this.curve.red);
      }
      if (!this.x.red)
        this.x = this.x.toRed(this.curve.red);
      if (!this.y.red)
        this.y = this.y.toRed(this.curve.red);
      this.inf = false;
    }
  }
  inherits$4(Point$3, Base$2.BasePoint);

  ShortCurve.prototype.point = function point(x, y, isRed) {
    return new Point$3(this, x, y, isRed);
  };

  ShortCurve.prototype.pointFromJSON = function pointFromJSON(obj, red) {
    return Point$3.fromJSON(this, obj, red);
  };

  Point$3.prototype._getBeta = function _getBeta() {
    if (!this.curve.endo)
      return;

    var pre = this.precomputed;
    if (pre && pre.beta)
      return pre.beta;

    var beta = this.curve.point(this.x.redMul(this.curve.endo.beta), this.y);
    if (pre) {
      var curve = this.curve;
      var endoMul = function(p) {
        return curve.point(p.x.redMul(curve.endo.beta), p.y);
      };
      pre.beta = beta;
      beta.precomputed = {
        beta: null,
        naf: pre.naf && {
          wnd: pre.naf.wnd,
          points: pre.naf.points.map(endoMul),
        },
        doubles: pre.doubles && {
          step: pre.doubles.step,
          points: pre.doubles.points.map(endoMul),
        },
      };
    }
    return beta;
  };

  Point$3.prototype.toJSON = function toJSON() {
    if (!this.precomputed)
      return [ this.x, this.y ];

    return [ this.x, this.y, this.precomputed && {
      doubles: this.precomputed.doubles && {
        step: this.precomputed.doubles.step,
        points: this.precomputed.doubles.points.slice(1),
      },
      naf: this.precomputed.naf && {
        wnd: this.precomputed.naf.wnd,
        points: this.precomputed.naf.points.slice(1),
      },
    } ];
  };

  Point$3.fromJSON = function fromJSON(curve, obj, red) {
    if (typeof obj === 'string')
      obj = JSON.parse(obj);
    var res = curve.point(obj[0], obj[1], red);
    if (!obj[2])
      return res;

    function obj2point(obj) {
      return curve.point(obj[0], obj[1], red);
    }

    var pre = obj[2];
    res.precomputed = {
      beta: null,
      doubles: pre.doubles && {
        step: pre.doubles.step,
        points: [ res ].concat(pre.doubles.points.map(obj2point)),
      },
      naf: pre.naf && {
        wnd: pre.naf.wnd,
        points: [ res ].concat(pre.naf.points.map(obj2point)),
      },
    };
    return res;
  };

  Point$3.prototype.inspect = function inspect() {
    if (this.isInfinity())
      return '<EC Point Infinity>';
    return '<EC Point x: ' + this.x.fromRed().toString(16, 2) +
        ' y: ' + this.y.fromRed().toString(16, 2) + '>';
  };

  Point$3.prototype.isInfinity = function isInfinity() {
    return this.inf;
  };

  Point$3.prototype.add = function add(p) {
    // O + P = P
    if (this.inf)
      return p;

    // P + O = P
    if (p.inf)
      return this;

    // P + P = 2P
    if (this.eq(p))
      return this.dbl();

    // P + (-P) = O
    if (this.neg().eq(p))
      return this.curve.point(null, null);

    // P + Q = O
    if (this.x.cmp(p.x) === 0)
      return this.curve.point(null, null);

    var c = this.y.redSub(p.y);
    if (c.cmpn(0) !== 0)
      c = c.redMul(this.x.redSub(p.x).redInvm());
    var nx = c.redSqr().redISub(this.x).redISub(p.x);
    var ny = c.redMul(this.x.redSub(nx)).redISub(this.y);
    return this.curve.point(nx, ny);
  };

  Point$3.prototype.dbl = function dbl() {
    if (this.inf)
      return this;

    // 2P = O
    var ys1 = this.y.redAdd(this.y);
    if (ys1.cmpn(0) === 0)
      return this.curve.point(null, null);

    var a = this.curve.a;

    var x2 = this.x.redSqr();
    var dyinv = ys1.redInvm();
    var c = x2.redAdd(x2).redIAdd(x2).redIAdd(a).redMul(dyinv);

    var nx = c.redSqr().redISub(this.x.redAdd(this.x));
    var ny = c.redMul(this.x.redSub(nx)).redISub(this.y);
    return this.curve.point(nx, ny);
  };

  Point$3.prototype.getX = function getX() {
    return this.x.fromRed();
  };

  Point$3.prototype.getY = function getY() {
    return this.y.fromRed();
  };

  Point$3.prototype.mul = function mul(k) {
    k = new BN$d(k, 16);
    if (this.isInfinity())
      return this;
    else if (this._hasDoubles(k))
      return this.curve._fixedNafMul(this, k);
    else if (this.curve.endo)
      return this.curve._endoWnafMulAdd([ this ], [ k ]);
    else
      return this.curve._wnafMul(this, k);
  };

  Point$3.prototype.mulAdd = function mulAdd(k1, p2, k2) {
    var points = [ this, p2 ];
    var coeffs = [ k1, k2 ];
    if (this.curve.endo)
      return this.curve._endoWnafMulAdd(points, coeffs);
    else
      return this.curve._wnafMulAdd(1, points, coeffs, 2);
  };

  Point$3.prototype.jmulAdd = function jmulAdd(k1, p2, k2) {
    var points = [ this, p2 ];
    var coeffs = [ k1, k2 ];
    if (this.curve.endo)
      return this.curve._endoWnafMulAdd(points, coeffs, true);
    else
      return this.curve._wnafMulAdd(1, points, coeffs, 2, true);
  };

  Point$3.prototype.eq = function eq(p) {
    return this === p ||
           this.inf === p.inf &&
               (this.inf || this.x.cmp(p.x) === 0 && this.y.cmp(p.y) === 0);
  };

  Point$3.prototype.neg = function neg(_precompute) {
    if (this.inf)
      return this;

    var res = this.curve.point(this.x, this.y.redNeg());
    if (_precompute && this.precomputed) {
      var pre = this.precomputed;
      var negate = function(p) {
        return p.neg();
      };
      res.precomputed = {
        naf: pre.naf && {
          wnd: pre.naf.wnd,
          points: pre.naf.points.map(negate),
        },
        doubles: pre.doubles && {
          step: pre.doubles.step,
          points: pre.doubles.points.map(negate),
        },
      };
    }
    return res;
  };

  Point$3.prototype.toJ = function toJ() {
    if (this.inf)
      return this.curve.jpoint(null, null, null);

    var res = this.curve.jpoint(this.x, this.y, this.curve.one);
    return res;
  };

  function JPoint(curve, x, y, z) {
    Base$2.BasePoint.call(this, curve, 'jacobian');
    if (x === null && y === null && z === null) {
      this.x = this.curve.one;
      this.y = this.curve.one;
      this.z = new BN$d(0);
    } else {
      this.x = new BN$d(x, 16);
      this.y = new BN$d(y, 16);
      this.z = new BN$d(z, 16);
    }
    if (!this.x.red)
      this.x = this.x.toRed(this.curve.red);
    if (!this.y.red)
      this.y = this.y.toRed(this.curve.red);
    if (!this.z.red)
      this.z = this.z.toRed(this.curve.red);

    this.zOne = this.z === this.curve.one;
  }
  inherits$4(JPoint, Base$2.BasePoint);

  ShortCurve.prototype.jpoint = function jpoint(x, y, z) {
    return new JPoint(this, x, y, z);
  };

  JPoint.prototype.toP = function toP() {
    if (this.isInfinity())
      return this.curve.point(null, null);

    var zinv = this.z.redInvm();
    var zinv2 = zinv.redSqr();
    var ax = this.x.redMul(zinv2);
    var ay = this.y.redMul(zinv2).redMul(zinv);

    return this.curve.point(ax, ay);
  };

  JPoint.prototype.neg = function neg() {
    return this.curve.jpoint(this.x, this.y.redNeg(), this.z);
  };

  JPoint.prototype.add = function add(p) {
    // O + P = P
    if (this.isInfinity())
      return p;

    // P + O = P
    if (p.isInfinity())
      return this;

    // 12M + 4S + 7A
    var pz2 = p.z.redSqr();
    var z2 = this.z.redSqr();
    var u1 = this.x.redMul(pz2);
    var u2 = p.x.redMul(z2);
    var s1 = this.y.redMul(pz2.redMul(p.z));
    var s2 = p.y.redMul(z2.redMul(this.z));

    var h = u1.redSub(u2);
    var r = s1.redSub(s2);
    if (h.cmpn(0) === 0) {
      if (r.cmpn(0) !== 0)
        return this.curve.jpoint(null, null, null);
      else
        return this.dbl();
    }

    var h2 = h.redSqr();
    var h3 = h2.redMul(h);
    var v = u1.redMul(h2);

    var nx = r.redSqr().redIAdd(h3).redISub(v).redISub(v);
    var ny = r.redMul(v.redISub(nx)).redISub(s1.redMul(h3));
    var nz = this.z.redMul(p.z).redMul(h);

    return this.curve.jpoint(nx, ny, nz);
  };

  JPoint.prototype.mixedAdd = function mixedAdd(p) {
    // O + P = P
    if (this.isInfinity())
      return p.toJ();

    // P + O = P
    if (p.isInfinity())
      return this;

    // 8M + 3S + 7A
    var z2 = this.z.redSqr();
    var u1 = this.x;
    var u2 = p.x.redMul(z2);
    var s1 = this.y;
    var s2 = p.y.redMul(z2).redMul(this.z);

    var h = u1.redSub(u2);
    var r = s1.redSub(s2);
    if (h.cmpn(0) === 0) {
      if (r.cmpn(0) !== 0)
        return this.curve.jpoint(null, null, null);
      else
        return this.dbl();
    }

    var h2 = h.redSqr();
    var h3 = h2.redMul(h);
    var v = u1.redMul(h2);

    var nx = r.redSqr().redIAdd(h3).redISub(v).redISub(v);
    var ny = r.redMul(v.redISub(nx)).redISub(s1.redMul(h3));
    var nz = this.z.redMul(h);

    return this.curve.jpoint(nx, ny, nz);
  };

  JPoint.prototype.dblp = function dblp(pow) {
    if (pow === 0)
      return this;
    if (this.isInfinity())
      return this;
    if (!pow)
      return this.dbl();

    var i;
    if (this.curve.zeroA || this.curve.threeA) {
      var r = this;
      for (i = 0; i < pow; i++)
        r = r.dbl();
      return r;
    }

    // 1M + 2S + 1A + N * (4S + 5M + 8A)
    // N = 1 => 6M + 6S + 9A
    var a = this.curve.a;
    var tinv = this.curve.tinv;

    var jx = this.x;
    var jy = this.y;
    var jz = this.z;
    var jz4 = jz.redSqr().redSqr();

    // Reuse results
    var jyd = jy.redAdd(jy);
    for (i = 0; i < pow; i++) {
      var jx2 = jx.redSqr();
      var jyd2 = jyd.redSqr();
      var jyd4 = jyd2.redSqr();
      var c = jx2.redAdd(jx2).redIAdd(jx2).redIAdd(a.redMul(jz4));

      var t1 = jx.redMul(jyd2);
      var nx = c.redSqr().redISub(t1.redAdd(t1));
      var t2 = t1.redISub(nx);
      var dny = c.redMul(t2);
      dny = dny.redIAdd(dny).redISub(jyd4);
      var nz = jyd.redMul(jz);
      if (i + 1 < pow)
        jz4 = jz4.redMul(jyd4);

      jx = nx;
      jz = nz;
      jyd = dny;
    }

    return this.curve.jpoint(jx, jyd.redMul(tinv), jz);
  };

  JPoint.prototype.dbl = function dbl() {
    if (this.isInfinity())
      return this;

    if (this.curve.zeroA)
      return this._zeroDbl();
    else if (this.curve.threeA)
      return this._threeDbl();
    else
      return this._dbl();
  };

  JPoint.prototype._zeroDbl = function _zeroDbl() {
    var nx;
    var ny;
    var nz;
    // Z = 1
    if (this.zOne) {
      // hyperelliptic.org/EFD/g1p/auto-shortw-jacobian-0.html
      //     #doubling-mdbl-2007-bl
      // 1M + 5S + 14A

      // XX = X1^2
      var xx = this.x.redSqr();
      // YY = Y1^2
      var yy = this.y.redSqr();
      // YYYY = YY^2
      var yyyy = yy.redSqr();
      // S = 2 * ((X1 + YY)^2 - XX - YYYY)
      var s = this.x.redAdd(yy).redSqr().redISub(xx).redISub(yyyy);
      s = s.redIAdd(s);
      // M = 3 * XX + a; a = 0
      var m = xx.redAdd(xx).redIAdd(xx);
      // T = M ^ 2 - 2*S
      var t = m.redSqr().redISub(s).redISub(s);

      // 8 * YYYY
      var yyyy8 = yyyy.redIAdd(yyyy);
      yyyy8 = yyyy8.redIAdd(yyyy8);
      yyyy8 = yyyy8.redIAdd(yyyy8);

      // X3 = T
      nx = t;
      // Y3 = M * (S - T) - 8 * YYYY
      ny = m.redMul(s.redISub(t)).redISub(yyyy8);
      // Z3 = 2*Y1
      nz = this.y.redAdd(this.y);
    } else {
      // hyperelliptic.org/EFD/g1p/auto-shortw-jacobian-0.html
      //     #doubling-dbl-2009-l
      // 2M + 5S + 13A

      // A = X1^2
      var a = this.x.redSqr();
      // B = Y1^2
      var b = this.y.redSqr();
      // C = B^2
      var c = b.redSqr();
      // D = 2 * ((X1 + B)^2 - A - C)
      var d = this.x.redAdd(b).redSqr().redISub(a).redISub(c);
      d = d.redIAdd(d);
      // E = 3 * A
      var e = a.redAdd(a).redIAdd(a);
      // F = E^2
      var f = e.redSqr();

      // 8 * C
      var c8 = c.redIAdd(c);
      c8 = c8.redIAdd(c8);
      c8 = c8.redIAdd(c8);

      // X3 = F - 2 * D
      nx = f.redISub(d).redISub(d);
      // Y3 = E * (D - X3) - 8 * C
      ny = e.redMul(d.redISub(nx)).redISub(c8);
      // Z3 = 2 * Y1 * Z1
      nz = this.y.redMul(this.z);
      nz = nz.redIAdd(nz);
    }

    return this.curve.jpoint(nx, ny, nz);
  };

  JPoint.prototype._threeDbl = function _threeDbl() {
    var nx;
    var ny;
    var nz;
    // Z = 1
    if (this.zOne) {
      // hyperelliptic.org/EFD/g1p/auto-shortw-jacobian-3.html
      //     #doubling-mdbl-2007-bl
      // 1M + 5S + 15A

      // XX = X1^2
      var xx = this.x.redSqr();
      // YY = Y1^2
      var yy = this.y.redSqr();
      // YYYY = YY^2
      var yyyy = yy.redSqr();
      // S = 2 * ((X1 + YY)^2 - XX - YYYY)
      var s = this.x.redAdd(yy).redSqr().redISub(xx).redISub(yyyy);
      s = s.redIAdd(s);
      // M = 3 * XX + a
      var m = xx.redAdd(xx).redIAdd(xx).redIAdd(this.curve.a);
      // T = M^2 - 2 * S
      var t = m.redSqr().redISub(s).redISub(s);
      // X3 = T
      nx = t;
      // Y3 = M * (S - T) - 8 * YYYY
      var yyyy8 = yyyy.redIAdd(yyyy);
      yyyy8 = yyyy8.redIAdd(yyyy8);
      yyyy8 = yyyy8.redIAdd(yyyy8);
      ny = m.redMul(s.redISub(t)).redISub(yyyy8);
      // Z3 = 2 * Y1
      nz = this.y.redAdd(this.y);
    } else {
      // hyperelliptic.org/EFD/g1p/auto-shortw-jacobian-3.html#doubling-dbl-2001-b
      // 3M + 5S

      // delta = Z1^2
      var delta = this.z.redSqr();
      // gamma = Y1^2
      var gamma = this.y.redSqr();
      // beta = X1 * gamma
      var beta = this.x.redMul(gamma);
      // alpha = 3 * (X1 - delta) * (X1 + delta)
      var alpha = this.x.redSub(delta).redMul(this.x.redAdd(delta));
      alpha = alpha.redAdd(alpha).redIAdd(alpha);
      // X3 = alpha^2 - 8 * beta
      var beta4 = beta.redIAdd(beta);
      beta4 = beta4.redIAdd(beta4);
      var beta8 = beta4.redAdd(beta4);
      nx = alpha.redSqr().redISub(beta8);
      // Z3 = (Y1 + Z1)^2 - gamma - delta
      nz = this.y.redAdd(this.z).redSqr().redISub(gamma).redISub(delta);
      // Y3 = alpha * (4 * beta - X3) - 8 * gamma^2
      var ggamma8 = gamma.redSqr();
      ggamma8 = ggamma8.redIAdd(ggamma8);
      ggamma8 = ggamma8.redIAdd(ggamma8);
      ggamma8 = ggamma8.redIAdd(ggamma8);
      ny = alpha.redMul(beta4.redISub(nx)).redISub(ggamma8);
    }

    return this.curve.jpoint(nx, ny, nz);
  };

  JPoint.prototype._dbl = function _dbl() {
    var a = this.curve.a;

    // 4M + 6S + 10A
    var jx = this.x;
    var jy = this.y;
    var jz = this.z;
    var jz4 = jz.redSqr().redSqr();

    var jx2 = jx.redSqr();
    var jy2 = jy.redSqr();

    var c = jx2.redAdd(jx2).redIAdd(jx2).redIAdd(a.redMul(jz4));

    var jxd4 = jx.redAdd(jx);
    jxd4 = jxd4.redIAdd(jxd4);
    var t1 = jxd4.redMul(jy2);
    var nx = c.redSqr().redISub(t1.redAdd(t1));
    var t2 = t1.redISub(nx);

    var jyd8 = jy2.redSqr();
    jyd8 = jyd8.redIAdd(jyd8);
    jyd8 = jyd8.redIAdd(jyd8);
    jyd8 = jyd8.redIAdd(jyd8);
    var ny = c.redMul(t2).redISub(jyd8);
    var nz = jy.redAdd(jy).redMul(jz);

    return this.curve.jpoint(nx, ny, nz);
  };

  JPoint.prototype.trpl = function trpl() {
    if (!this.curve.zeroA)
      return this.dbl().add(this);

    // hyperelliptic.org/EFD/g1p/auto-shortw-jacobian-0.html#tripling-tpl-2007-bl
    // 5M + 10S + ...

    // XX = X1^2
    var xx = this.x.redSqr();
    // YY = Y1^2
    var yy = this.y.redSqr();
    // ZZ = Z1^2
    var zz = this.z.redSqr();
    // YYYY = YY^2
    var yyyy = yy.redSqr();
    // M = 3 * XX + a * ZZ2; a = 0
    var m = xx.redAdd(xx).redIAdd(xx);
    // MM = M^2
    var mm = m.redSqr();
    // E = 6 * ((X1 + YY)^2 - XX - YYYY) - MM
    var e = this.x.redAdd(yy).redSqr().redISub(xx).redISub(yyyy);
    e = e.redIAdd(e);
    e = e.redAdd(e).redIAdd(e);
    e = e.redISub(mm);
    // EE = E^2
    var ee = e.redSqr();
    // T = 16*YYYY
    var t = yyyy.redIAdd(yyyy);
    t = t.redIAdd(t);
    t = t.redIAdd(t);
    t = t.redIAdd(t);
    // U = (M + E)^2 - MM - EE - T
    var u = m.redIAdd(e).redSqr().redISub(mm).redISub(ee).redISub(t);
    // X3 = 4 * (X1 * EE - 4 * YY * U)
    var yyu4 = yy.redMul(u);
    yyu4 = yyu4.redIAdd(yyu4);
    yyu4 = yyu4.redIAdd(yyu4);
    var nx = this.x.redMul(ee).redISub(yyu4);
    nx = nx.redIAdd(nx);
    nx = nx.redIAdd(nx);
    // Y3 = 8 * Y1 * (U * (T - U) - E * EE)
    var ny = this.y.redMul(u.redMul(t.redISub(u)).redISub(e.redMul(ee)));
    ny = ny.redIAdd(ny);
    ny = ny.redIAdd(ny);
    ny = ny.redIAdd(ny);
    // Z3 = (Z1 + E)^2 - ZZ - EE
    var nz = this.z.redAdd(e).redSqr().redISub(zz).redISub(ee);

    return this.curve.jpoint(nx, ny, nz);
  };

  JPoint.prototype.mul = function mul(k, kbase) {
    k = new BN$d(k, kbase);

    return this.curve._wnafMul(this, k);
  };

  JPoint.prototype.eq = function eq(p) {
    if (p.type === 'affine')
      return this.eq(p.toJ());

    if (this === p)
      return true;

    // x1 * z2^2 == x2 * z1^2
    var z2 = this.z.redSqr();
    var pz2 = p.z.redSqr();
    if (this.x.redMul(pz2).redISub(p.x.redMul(z2)).cmpn(0) !== 0)
      return false;

    // y1 * z2^3 == y2 * z1^3
    var z3 = z2.redMul(this.z);
    var pz3 = pz2.redMul(p.z);
    return this.y.redMul(pz3).redISub(p.y.redMul(z3)).cmpn(0) === 0;
  };

  JPoint.prototype.eqXToP = function eqXToP(x) {
    var zs = this.z.redSqr();
    var rx = x.toRed(this.curve.red).redMul(zs);
    if (this.x.cmp(rx) === 0)
      return true;

    var xc = x.clone();
    var t = this.curve.redN.redMul(zs);
    for (;;) {
      xc.iadd(this.curve.n);
      if (xc.cmp(this.curve.p) >= 0)
        return false;

      rx.redIAdd(t);
      if (this.x.cmp(rx) === 0)
        return true;
    }
  };

  JPoint.prototype.inspect = function inspect() {
    if (this.isInfinity())
      return '<EC JPoint Infinity>';
    return '<EC JPoint x: ' + this.x.toString(16, 2) +
        ' y: ' + this.y.toString(16, 2) +
        ' z: ' + this.z.toString(16, 2) + '>';
  };

  JPoint.prototype.isInfinity = function isInfinity() {
    // XXX This code assumes that zero is always zero in red
    return this.z.cmpn(0) === 0;
  };

  var BN$c = bn$2.exports;
  var inherits$3 = inherits$7.exports;
  var Base$1 = base$1;

  var utils$i = utils$m;

  function MontCurve(conf) {
    Base$1.call(this, 'mont', conf);

    this.a = new BN$c(conf.a, 16).toRed(this.red);
    this.b = new BN$c(conf.b, 16).toRed(this.red);
    this.i4 = new BN$c(4).toRed(this.red).redInvm();
    this.two = new BN$c(2).toRed(this.red);
    this.a24 = this.i4.redMul(this.a.redAdd(this.two));
  }
  inherits$3(MontCurve, Base$1);
  var mont = MontCurve;

  MontCurve.prototype.validate = function validate(point) {
    var x = point.normalize().x;
    var x2 = x.redSqr();
    var rhs = x2.redMul(x).redAdd(x2.redMul(this.a)).redAdd(x);
    var y = rhs.redSqrt();

    return y.redSqr().cmp(rhs) === 0;
  };

  function Point$2(curve, x, z) {
    Base$1.BasePoint.call(this, curve, 'projective');
    if (x === null && z === null) {
      this.x = this.curve.one;
      this.z = this.curve.zero;
    } else {
      this.x = new BN$c(x, 16);
      this.z = new BN$c(z, 16);
      if (!this.x.red)
        this.x = this.x.toRed(this.curve.red);
      if (!this.z.red)
        this.z = this.z.toRed(this.curve.red);
    }
  }
  inherits$3(Point$2, Base$1.BasePoint);

  MontCurve.prototype.decodePoint = function decodePoint(bytes, enc) {
    return this.point(utils$i.toArray(bytes, enc), 1);
  };

  MontCurve.prototype.point = function point(x, z) {
    return new Point$2(this, x, z);
  };

  MontCurve.prototype.pointFromJSON = function pointFromJSON(obj) {
    return Point$2.fromJSON(this, obj);
  };

  Point$2.prototype.precompute = function precompute() {
    // No-op
  };

  Point$2.prototype._encode = function _encode() {
    return this.getX().toArray('be', this.curve.p.byteLength());
  };

  Point$2.fromJSON = function fromJSON(curve, obj) {
    return new Point$2(curve, obj[0], obj[1] || curve.one);
  };

  Point$2.prototype.inspect = function inspect() {
    if (this.isInfinity())
      return '<EC Point Infinity>';
    return '<EC Point x: ' + this.x.fromRed().toString(16, 2) +
        ' z: ' + this.z.fromRed().toString(16, 2) + '>';
  };

  Point$2.prototype.isInfinity = function isInfinity() {
    // XXX This code assumes that zero is always zero in red
    return this.z.cmpn(0) === 0;
  };

  Point$2.prototype.dbl = function dbl() {
    // http://hyperelliptic.org/EFD/g1p/auto-montgom-xz.html#doubling-dbl-1987-m-3
    // 2M + 2S + 4A

    // A = X1 + Z1
    var a = this.x.redAdd(this.z);
    // AA = A^2
    var aa = a.redSqr();
    // B = X1 - Z1
    var b = this.x.redSub(this.z);
    // BB = B^2
    var bb = b.redSqr();
    // C = AA - BB
    var c = aa.redSub(bb);
    // X3 = AA * BB
    var nx = aa.redMul(bb);
    // Z3 = C * (BB + A24 * C)
    var nz = c.redMul(bb.redAdd(this.curve.a24.redMul(c)));
    return this.curve.point(nx, nz);
  };

  Point$2.prototype.add = function add() {
    throw new Error('Not supported on Montgomery curve');
  };

  Point$2.prototype.diffAdd = function diffAdd(p, diff) {
    // http://hyperelliptic.org/EFD/g1p/auto-montgom-xz.html#diffadd-dadd-1987-m-3
    // 4M + 2S + 6A

    // A = X2 + Z2
    var a = this.x.redAdd(this.z);
    // B = X2 - Z2
    var b = this.x.redSub(this.z);
    // C = X3 + Z3
    var c = p.x.redAdd(p.z);
    // D = X3 - Z3
    var d = p.x.redSub(p.z);
    // DA = D * A
    var da = d.redMul(a);
    // CB = C * B
    var cb = c.redMul(b);
    // X5 = Z1 * (DA + CB)^2
    var nx = diff.z.redMul(da.redAdd(cb).redSqr());
    // Z5 = X1 * (DA - CB)^2
    var nz = diff.x.redMul(da.redISub(cb).redSqr());
    return this.curve.point(nx, nz);
  };

  Point$2.prototype.mul = function mul(k) {
    var t = k.clone();
    var a = this; // (N / 2) * Q + Q
    var b = this.curve.point(null, null); // (N / 2) * Q
    var c = this; // Q

    for (var bits = []; t.cmpn(0) !== 0; t.iushrn(1))
      bits.push(t.andln(1));

    for (var i = bits.length - 1; i >= 0; i--) {
      if (bits[i] === 0) {
        // N * Q + Q = ((N / 2) * Q + Q)) + (N / 2) * Q
        a = a.diffAdd(b, c);
        // N * Q = 2 * ((N / 2) * Q + Q))
        b = b.dbl();
      } else {
        // N * Q = ((N / 2) * Q + Q) + ((N / 2) * Q)
        b = a.diffAdd(b, c);
        // N * Q + Q = 2 * ((N / 2) * Q + Q)
        a = a.dbl();
      }
    }
    return b;
  };

  Point$2.prototype.mulAdd = function mulAdd() {
    throw new Error('Not supported on Montgomery curve');
  };

  Point$2.prototype.jumlAdd = function jumlAdd() {
    throw new Error('Not supported on Montgomery curve');
  };

  Point$2.prototype.eq = function eq(other) {
    return this.getX().cmp(other.getX()) === 0;
  };

  Point$2.prototype.normalize = function normalize() {
    this.x = this.x.redMul(this.z.redInvm());
    this.z = this.curve.one;
    return this;
  };

  Point$2.prototype.getX = function getX() {
    // Normalize coordinates
    this.normalize();

    return this.x.fromRed();
  };

  var utils$h = utils$m;
  var BN$b = bn$2.exports;
  var inherits$2 = inherits$7.exports;
  var Base = base$1;

  var assert$e = utils$h.assert;

  function EdwardsCurve(conf) {
    // NOTE: Important as we are creating point in Base.call()
    this.twisted = (conf.a | 0) !== 1;
    this.mOneA = this.twisted && (conf.a | 0) === -1;
    this.extended = this.mOneA;

    Base.call(this, 'edwards', conf);

    this.a = new BN$b(conf.a, 16).umod(this.red.m);
    this.a = this.a.toRed(this.red);
    this.c = new BN$b(conf.c, 16).toRed(this.red);
    this.c2 = this.c.redSqr();
    this.d = new BN$b(conf.d, 16).toRed(this.red);
    this.dd = this.d.redAdd(this.d);

    assert$e(!this.twisted || this.c.fromRed().cmpn(1) === 0);
    this.oneC = (conf.c | 0) === 1;
  }
  inherits$2(EdwardsCurve, Base);
  var edwards = EdwardsCurve;

  EdwardsCurve.prototype._mulA = function _mulA(num) {
    if (this.mOneA)
      return num.redNeg();
    else
      return this.a.redMul(num);
  };

  EdwardsCurve.prototype._mulC = function _mulC(num) {
    if (this.oneC)
      return num;
    else
      return this.c.redMul(num);
  };

  // Just for compatibility with Short curve
  EdwardsCurve.prototype.jpoint = function jpoint(x, y, z, t) {
    return this.point(x, y, z, t);
  };

  EdwardsCurve.prototype.pointFromX = function pointFromX(x, odd) {
    x = new BN$b(x, 16);
    if (!x.red)
      x = x.toRed(this.red);

    var x2 = x.redSqr();
    var rhs = this.c2.redSub(this.a.redMul(x2));
    var lhs = this.one.redSub(this.c2.redMul(this.d).redMul(x2));

    var y2 = rhs.redMul(lhs.redInvm());
    var y = y2.redSqrt();
    if (y.redSqr().redSub(y2).cmp(this.zero) !== 0)
      throw new Error('invalid point');

    var isOdd = y.fromRed().isOdd();
    if (odd && !isOdd || !odd && isOdd)
      y = y.redNeg();

    return this.point(x, y);
  };

  EdwardsCurve.prototype.pointFromY = function pointFromY(y, odd) {
    y = new BN$b(y, 16);
    if (!y.red)
      y = y.toRed(this.red);

    // x^2 = (y^2 - c^2) / (c^2 d y^2 - a)
    var y2 = y.redSqr();
    var lhs = y2.redSub(this.c2);
    var rhs = y2.redMul(this.d).redMul(this.c2).redSub(this.a);
    var x2 = lhs.redMul(rhs.redInvm());

    if (x2.cmp(this.zero) === 0) {
      if (odd)
        throw new Error('invalid point');
      else
        return this.point(this.zero, y);
    }

    var x = x2.redSqrt();
    if (x.redSqr().redSub(x2).cmp(this.zero) !== 0)
      throw new Error('invalid point');

    if (x.fromRed().isOdd() !== odd)
      x = x.redNeg();

    return this.point(x, y);
  };

  EdwardsCurve.prototype.validate = function validate(point) {
    if (point.isInfinity())
      return true;

    // Curve: A * X^2 + Y^2 = C^2 * (1 + D * X^2 * Y^2)
    point.normalize();

    var x2 = point.x.redSqr();
    var y2 = point.y.redSqr();
    var lhs = x2.redMul(this.a).redAdd(y2);
    var rhs = this.c2.redMul(this.one.redAdd(this.d.redMul(x2).redMul(y2)));

    return lhs.cmp(rhs) === 0;
  };

  function Point$1(curve, x, y, z, t) {
    Base.BasePoint.call(this, curve, 'projective');
    if (x === null && y === null && z === null) {
      this.x = this.curve.zero;
      this.y = this.curve.one;
      this.z = this.curve.one;
      this.t = this.curve.zero;
      this.zOne = true;
    } else {
      this.x = new BN$b(x, 16);
      this.y = new BN$b(y, 16);
      this.z = z ? new BN$b(z, 16) : this.curve.one;
      this.t = t && new BN$b(t, 16);
      if (!this.x.red)
        this.x = this.x.toRed(this.curve.red);
      if (!this.y.red)
        this.y = this.y.toRed(this.curve.red);
      if (!this.z.red)
        this.z = this.z.toRed(this.curve.red);
      if (this.t && !this.t.red)
        this.t = this.t.toRed(this.curve.red);
      this.zOne = this.z === this.curve.one;

      // Use extended coordinates
      if (this.curve.extended && !this.t) {
        this.t = this.x.redMul(this.y);
        if (!this.zOne)
          this.t = this.t.redMul(this.z.redInvm());
      }
    }
  }
  inherits$2(Point$1, Base.BasePoint);

  EdwardsCurve.prototype.pointFromJSON = function pointFromJSON(obj) {
    return Point$1.fromJSON(this, obj);
  };

  EdwardsCurve.prototype.point = function point(x, y, z, t) {
    return new Point$1(this, x, y, z, t);
  };

  Point$1.fromJSON = function fromJSON(curve, obj) {
    return new Point$1(curve, obj[0], obj[1], obj[2]);
  };

  Point$1.prototype.inspect = function inspect() {
    if (this.isInfinity())
      return '<EC Point Infinity>';
    return '<EC Point x: ' + this.x.fromRed().toString(16, 2) +
        ' y: ' + this.y.fromRed().toString(16, 2) +
        ' z: ' + this.z.fromRed().toString(16, 2) + '>';
  };

  Point$1.prototype.isInfinity = function isInfinity() {
    // XXX This code assumes that zero is always zero in red
    return this.x.cmpn(0) === 0 &&
      (this.y.cmp(this.z) === 0 ||
      (this.zOne && this.y.cmp(this.curve.c) === 0));
  };

  Point$1.prototype._extDbl = function _extDbl() {
    // hyperelliptic.org/EFD/g1p/auto-twisted-extended-1.html
    //     #doubling-dbl-2008-hwcd
    // 4M + 4S

    // A = X1^2
    var a = this.x.redSqr();
    // B = Y1^2
    var b = this.y.redSqr();
    // C = 2 * Z1^2
    var c = this.z.redSqr();
    c = c.redIAdd(c);
    // D = a * A
    var d = this.curve._mulA(a);
    // E = (X1 + Y1)^2 - A - B
    var e = this.x.redAdd(this.y).redSqr().redISub(a).redISub(b);
    // G = D + B
    var g = d.redAdd(b);
    // F = G - C
    var f = g.redSub(c);
    // H = D - B
    var h = d.redSub(b);
    // X3 = E * F
    var nx = e.redMul(f);
    // Y3 = G * H
    var ny = g.redMul(h);
    // T3 = E * H
    var nt = e.redMul(h);
    // Z3 = F * G
    var nz = f.redMul(g);
    return this.curve.point(nx, ny, nz, nt);
  };

  Point$1.prototype._projDbl = function _projDbl() {
    // hyperelliptic.org/EFD/g1p/auto-twisted-projective.html
    //     #doubling-dbl-2008-bbjlp
    //     #doubling-dbl-2007-bl
    // and others
    // Generally 3M + 4S or 2M + 4S

    // B = (X1 + Y1)^2
    var b = this.x.redAdd(this.y).redSqr();
    // C = X1^2
    var c = this.x.redSqr();
    // D = Y1^2
    var d = this.y.redSqr();

    var nx;
    var ny;
    var nz;
    var e;
    var h;
    var j;
    if (this.curve.twisted) {
      // E = a * C
      e = this.curve._mulA(c);
      // F = E + D
      var f = e.redAdd(d);
      if (this.zOne) {
        // X3 = (B - C - D) * (F - 2)
        nx = b.redSub(c).redSub(d).redMul(f.redSub(this.curve.two));
        // Y3 = F * (E - D)
        ny = f.redMul(e.redSub(d));
        // Z3 = F^2 - 2 * F
        nz = f.redSqr().redSub(f).redSub(f);
      } else {
        // H = Z1^2
        h = this.z.redSqr();
        // J = F - 2 * H
        j = f.redSub(h).redISub(h);
        // X3 = (B-C-D)*J
        nx = b.redSub(c).redISub(d).redMul(j);
        // Y3 = F * (E - D)
        ny = f.redMul(e.redSub(d));
        // Z3 = F * J
        nz = f.redMul(j);
      }
    } else {
      // E = C + D
      e = c.redAdd(d);
      // H = (c * Z1)^2
      h = this.curve._mulC(this.z).redSqr();
      // J = E - 2 * H
      j = e.redSub(h).redSub(h);
      // X3 = c * (B - E) * J
      nx = this.curve._mulC(b.redISub(e)).redMul(j);
      // Y3 = c * E * (C - D)
      ny = this.curve._mulC(e).redMul(c.redISub(d));
      // Z3 = E * J
      nz = e.redMul(j);
    }
    return this.curve.point(nx, ny, nz);
  };

  Point$1.prototype.dbl = function dbl() {
    if (this.isInfinity())
      return this;

    // Double in extended coordinates
    if (this.curve.extended)
      return this._extDbl();
    else
      return this._projDbl();
  };

  Point$1.prototype._extAdd = function _extAdd(p) {
    // hyperelliptic.org/EFD/g1p/auto-twisted-extended-1.html
    //     #addition-add-2008-hwcd-3
    // 8M

    // A = (Y1 - X1) * (Y2 - X2)
    var a = this.y.redSub(this.x).redMul(p.y.redSub(p.x));
    // B = (Y1 + X1) * (Y2 + X2)
    var b = this.y.redAdd(this.x).redMul(p.y.redAdd(p.x));
    // C = T1 * k * T2
    var c = this.t.redMul(this.curve.dd).redMul(p.t);
    // D = Z1 * 2 * Z2
    var d = this.z.redMul(p.z.redAdd(p.z));
    // E = B - A
    var e = b.redSub(a);
    // F = D - C
    var f = d.redSub(c);
    // G = D + C
    var g = d.redAdd(c);
    // H = B + A
    var h = b.redAdd(a);
    // X3 = E * F
    var nx = e.redMul(f);
    // Y3 = G * H
    var ny = g.redMul(h);
    // T3 = E * H
    var nt = e.redMul(h);
    // Z3 = F * G
    var nz = f.redMul(g);
    return this.curve.point(nx, ny, nz, nt);
  };

  Point$1.prototype._projAdd = function _projAdd(p) {
    // hyperelliptic.org/EFD/g1p/auto-twisted-projective.html
    //     #addition-add-2008-bbjlp
    //     #addition-add-2007-bl
    // 10M + 1S

    // A = Z1 * Z2
    var a = this.z.redMul(p.z);
    // B = A^2
    var b = a.redSqr();
    // C = X1 * X2
    var c = this.x.redMul(p.x);
    // D = Y1 * Y2
    var d = this.y.redMul(p.y);
    // E = d * C * D
    var e = this.curve.d.redMul(c).redMul(d);
    // F = B - E
    var f = b.redSub(e);
    // G = B + E
    var g = b.redAdd(e);
    // X3 = A * F * ((X1 + Y1) * (X2 + Y2) - C - D)
    var tmp = this.x.redAdd(this.y).redMul(p.x.redAdd(p.y)).redISub(c).redISub(d);
    var nx = a.redMul(f).redMul(tmp);
    var ny;
    var nz;
    if (this.curve.twisted) {
      // Y3 = A * G * (D - a * C)
      ny = a.redMul(g).redMul(d.redSub(this.curve._mulA(c)));
      // Z3 = F * G
      nz = f.redMul(g);
    } else {
      // Y3 = A * G * (D - C)
      ny = a.redMul(g).redMul(d.redSub(c));
      // Z3 = c * F * G
      nz = this.curve._mulC(f).redMul(g);
    }
    return this.curve.point(nx, ny, nz);
  };

  Point$1.prototype.add = function add(p) {
    if (this.isInfinity())
      return p;
    if (p.isInfinity())
      return this;

    if (this.curve.extended)
      return this._extAdd(p);
    else
      return this._projAdd(p);
  };

  Point$1.prototype.mul = function mul(k) {
    if (this._hasDoubles(k))
      return this.curve._fixedNafMul(this, k);
    else
      return this.curve._wnafMul(this, k);
  };

  Point$1.prototype.mulAdd = function mulAdd(k1, p, k2) {
    return this.curve._wnafMulAdd(1, [ this, p ], [ k1, k2 ], 2, false);
  };

  Point$1.prototype.jmulAdd = function jmulAdd(k1, p, k2) {
    return this.curve._wnafMulAdd(1, [ this, p ], [ k1, k2 ], 2, true);
  };

  Point$1.prototype.normalize = function normalize() {
    if (this.zOne)
      return this;

    // Normalize coordinates
    var zi = this.z.redInvm();
    this.x = this.x.redMul(zi);
    this.y = this.y.redMul(zi);
    if (this.t)
      this.t = this.t.redMul(zi);
    this.z = this.curve.one;
    this.zOne = true;
    return this;
  };

  Point$1.prototype.neg = function neg() {
    return this.curve.point(this.x.redNeg(),
      this.y,
      this.z,
      this.t && this.t.redNeg());
  };

  Point$1.prototype.getX = function getX() {
    this.normalize();
    return this.x.fromRed();
  };

  Point$1.prototype.getY = function getY() {
    this.normalize();
    return this.y.fromRed();
  };

  Point$1.prototype.eq = function eq(other) {
    return this === other ||
           this.getX().cmp(other.getX()) === 0 &&
           this.getY().cmp(other.getY()) === 0;
  };

  Point$1.prototype.eqXToP = function eqXToP(x) {
    var rx = x.toRed(this.curve.red).redMul(this.z);
    if (this.x.cmp(rx) === 0)
      return true;

    var xc = x.clone();
    var t = this.curve.redN.redMul(this.z);
    for (;;) {
      xc.iadd(this.curve.n);
      if (xc.cmp(this.curve.p) >= 0)
        return false;

      rx.redIAdd(t);
      if (this.x.cmp(rx) === 0)
        return true;
    }
  };

  // Compatibility with BaseCurve
  Point$1.prototype.toP = Point$1.prototype.normalize;
  Point$1.prototype.mixedAdd = Point$1.prototype.add;

  (function (exports) {

  	var curve = exports;

  	curve.base = base$1;
  	curve.short = short;
  	curve.mont = mont;
  	curve.edwards = edwards;
  } (curve));

  var curves$2 = {};

  var hash$3 = {};

  var utils$g = {};

  var assert$d = minimalisticAssert;
  var inherits$1 = inherits$7.exports;

  utils$g.inherits = inherits$1;

  function isSurrogatePair(msg, i) {
    if ((msg.charCodeAt(i) & 0xFC00) !== 0xD800) {
      return false;
    }
    if (i < 0 || i + 1 >= msg.length) {
      return false;
    }
    return (msg.charCodeAt(i + 1) & 0xFC00) === 0xDC00;
  }

  function toArray(msg, enc) {
    if (Array.isArray(msg))
      return msg.slice();
    if (!msg)
      return [];
    var res = [];
    if (typeof msg === 'string') {
      if (!enc) {
        // Inspired by stringToUtf8ByteArray() in closure-library by Google
        // https://github.com/google/closure-library/blob/8598d87242af59aac233270742c8984e2b2bdbe0/closure/goog/crypt/crypt.js#L117-L143
        // Apache License 2.0
        // https://github.com/google/closure-library/blob/master/LICENSE
        var p = 0;
        for (var i = 0; i < msg.length; i++) {
          var c = msg.charCodeAt(i);
          if (c < 128) {
            res[p++] = c;
          } else if (c < 2048) {
            res[p++] = (c >> 6) | 192;
            res[p++] = (c & 63) | 128;
          } else if (isSurrogatePair(msg, i)) {
            c = 0x10000 + ((c & 0x03FF) << 10) + (msg.charCodeAt(++i) & 0x03FF);
            res[p++] = (c >> 18) | 240;
            res[p++] = ((c >> 12) & 63) | 128;
            res[p++] = ((c >> 6) & 63) | 128;
            res[p++] = (c & 63) | 128;
          } else {
            res[p++] = (c >> 12) | 224;
            res[p++] = ((c >> 6) & 63) | 128;
            res[p++] = (c & 63) | 128;
          }
        }
      } else if (enc === 'hex') {
        msg = msg.replace(/[^a-z0-9]+/ig, '');
        if (msg.length % 2 !== 0)
          msg = '0' + msg;
        for (i = 0; i < msg.length; i += 2)
          res.push(parseInt(msg[i] + msg[i + 1], 16));
      }
    } else {
      for (i = 0; i < msg.length; i++)
        res[i] = msg[i] | 0;
    }
    return res;
  }
  utils$g.toArray = toArray;

  function toHex(msg) {
    var res = '';
    for (var i = 0; i < msg.length; i++)
      res += zero2(msg[i].toString(16));
    return res;
  }
  utils$g.toHex = toHex;

  function htonl(w) {
    var res = (w >>> 24) |
              ((w >>> 8) & 0xff00) |
              ((w << 8) & 0xff0000) |
              ((w & 0xff) << 24);
    return res >>> 0;
  }
  utils$g.htonl = htonl;

  function toHex32(msg, endian) {
    var res = '';
    for (var i = 0; i < msg.length; i++) {
      var w = msg[i];
      if (endian === 'little')
        w = htonl(w);
      res += zero8(w.toString(16));
    }
    return res;
  }
  utils$g.toHex32 = toHex32;

  function zero2(word) {
    if (word.length === 1)
      return '0' + word;
    else
      return word;
  }
  utils$g.zero2 = zero2;

  function zero8(word) {
    if (word.length === 7)
      return '0' + word;
    else if (word.length === 6)
      return '00' + word;
    else if (word.length === 5)
      return '000' + word;
    else if (word.length === 4)
      return '0000' + word;
    else if (word.length === 3)
      return '00000' + word;
    else if (word.length === 2)
      return '000000' + word;
    else if (word.length === 1)
      return '0000000' + word;
    else
      return word;
  }
  utils$g.zero8 = zero8;

  function join32(msg, start, end, endian) {
    var len = end - start;
    assert$d(len % 4 === 0);
    var res = new Array(len / 4);
    for (var i = 0, k = start; i < res.length; i++, k += 4) {
      var w;
      if (endian === 'big')
        w = (msg[k] << 24) | (msg[k + 1] << 16) | (msg[k + 2] << 8) | msg[k + 3];
      else
        w = (msg[k + 3] << 24) | (msg[k + 2] << 16) | (msg[k + 1] << 8) | msg[k];
      res[i] = w >>> 0;
    }
    return res;
  }
  utils$g.join32 = join32;

  function split32(msg, endian) {
    var res = new Array(msg.length * 4);
    for (var i = 0, k = 0; i < msg.length; i++, k += 4) {
      var m = msg[i];
      if (endian === 'big') {
        res[k] = m >>> 24;
        res[k + 1] = (m >>> 16) & 0xff;
        res[k + 2] = (m >>> 8) & 0xff;
        res[k + 3] = m & 0xff;
      } else {
        res[k + 3] = m >>> 24;
        res[k + 2] = (m >>> 16) & 0xff;
        res[k + 1] = (m >>> 8) & 0xff;
        res[k] = m & 0xff;
      }
    }
    return res;
  }
  utils$g.split32 = split32;

  function rotr32$1(w, b) {
    return (w >>> b) | (w << (32 - b));
  }
  utils$g.rotr32 = rotr32$1;

  function rotl32$2(w, b) {
    return (w << b) | (w >>> (32 - b));
  }
  utils$g.rotl32 = rotl32$2;

  function sum32$3(a, b) {
    return (a + b) >>> 0;
  }
  utils$g.sum32 = sum32$3;

  function sum32_3$1(a, b, c) {
    return (a + b + c) >>> 0;
  }
  utils$g.sum32_3 = sum32_3$1;

  function sum32_4$2(a, b, c, d) {
    return (a + b + c + d) >>> 0;
  }
  utils$g.sum32_4 = sum32_4$2;

  function sum32_5$2(a, b, c, d, e) {
    return (a + b + c + d + e) >>> 0;
  }
  utils$g.sum32_5 = sum32_5$2;

  function sum64$1(buf, pos, ah, al) {
    var bh = buf[pos];
    var bl = buf[pos + 1];

    var lo = (al + bl) >>> 0;
    var hi = (lo < al ? 1 : 0) + ah + bh;
    buf[pos] = hi >>> 0;
    buf[pos + 1] = lo;
  }
  utils$g.sum64 = sum64$1;

  function sum64_hi$1(ah, al, bh, bl) {
    var lo = (al + bl) >>> 0;
    var hi = (lo < al ? 1 : 0) + ah + bh;
    return hi >>> 0;
  }
  utils$g.sum64_hi = sum64_hi$1;

  function sum64_lo$1(ah, al, bh, bl) {
    var lo = al + bl;
    return lo >>> 0;
  }
  utils$g.sum64_lo = sum64_lo$1;

  function sum64_4_hi$1(ah, al, bh, bl, ch, cl, dh, dl) {
    var carry = 0;
    var lo = al;
    lo = (lo + bl) >>> 0;
    carry += lo < al ? 1 : 0;
    lo = (lo + cl) >>> 0;
    carry += lo < cl ? 1 : 0;
    lo = (lo + dl) >>> 0;
    carry += lo < dl ? 1 : 0;

    var hi = ah + bh + ch + dh + carry;
    return hi >>> 0;
  }
  utils$g.sum64_4_hi = sum64_4_hi$1;

  function sum64_4_lo$1(ah, al, bh, bl, ch, cl, dh, dl) {
    var lo = al + bl + cl + dl;
    return lo >>> 0;
  }
  utils$g.sum64_4_lo = sum64_4_lo$1;

  function sum64_5_hi$1(ah, al, bh, bl, ch, cl, dh, dl, eh, el) {
    var carry = 0;
    var lo = al;
    lo = (lo + bl) >>> 0;
    carry += lo < al ? 1 : 0;
    lo = (lo + cl) >>> 0;
    carry += lo < cl ? 1 : 0;
    lo = (lo + dl) >>> 0;
    carry += lo < dl ? 1 : 0;
    lo = (lo + el) >>> 0;
    carry += lo < el ? 1 : 0;

    var hi = ah + bh + ch + dh + eh + carry;
    return hi >>> 0;
  }
  utils$g.sum64_5_hi = sum64_5_hi$1;

  function sum64_5_lo$1(ah, al, bh, bl, ch, cl, dh, dl, eh, el) {
    var lo = al + bl + cl + dl + el;

    return lo >>> 0;
  }
  utils$g.sum64_5_lo = sum64_5_lo$1;

  function rotr64_hi$1(ah, al, num) {
    var r = (al << (32 - num)) | (ah >>> num);
    return r >>> 0;
  }
  utils$g.rotr64_hi = rotr64_hi$1;

  function rotr64_lo$1(ah, al, num) {
    var r = (ah << (32 - num)) | (al >>> num);
    return r >>> 0;
  }
  utils$g.rotr64_lo = rotr64_lo$1;

  function shr64_hi$1(ah, al, num) {
    return ah >>> num;
  }
  utils$g.shr64_hi = shr64_hi$1;

  function shr64_lo$1(ah, al, num) {
    var r = (ah << (32 - num)) | (al >>> num);
    return r >>> 0;
  }
  utils$g.shr64_lo = shr64_lo$1;

  var common$5 = {};

  var utils$f = utils$g;
  var assert$c = minimalisticAssert;

  function BlockHash$4() {
    this.pending = null;
    this.pendingTotal = 0;
    this.blockSize = this.constructor.blockSize;
    this.outSize = this.constructor.outSize;
    this.hmacStrength = this.constructor.hmacStrength;
    this.padLength = this.constructor.padLength / 8;
    this.endian = 'big';

    this._delta8 = this.blockSize / 8;
    this._delta32 = this.blockSize / 32;
  }
  common$5.BlockHash = BlockHash$4;

  BlockHash$4.prototype.update = function update(msg, enc) {
    // Convert message to array, pad it, and join into 32bit blocks
    msg = utils$f.toArray(msg, enc);
    if (!this.pending)
      this.pending = msg;
    else
      this.pending = this.pending.concat(msg);
    this.pendingTotal += msg.length;

    // Enough data, try updating
    if (this.pending.length >= this._delta8) {
      msg = this.pending;

      // Process pending data in blocks
      var r = msg.length % this._delta8;
      this.pending = msg.slice(msg.length - r, msg.length);
      if (this.pending.length === 0)
        this.pending = null;

      msg = utils$f.join32(msg, 0, msg.length - r, this.endian);
      for (var i = 0; i < msg.length; i += this._delta32)
        this._update(msg, i, i + this._delta32);
    }

    return this;
  };

  BlockHash$4.prototype.digest = function digest(enc) {
    this.update(this._pad());
    assert$c(this.pending === null);

    return this._digest(enc);
  };

  BlockHash$4.prototype._pad = function pad() {
    var len = this.pendingTotal;
    var bytes = this._delta8;
    var k = bytes - ((len + this.padLength) % bytes);
    var res = new Array(k + this.padLength);
    res[0] = 0x80;
    for (var i = 1; i < k; i++)
      res[i] = 0;

    // Append length
    len <<= 3;
    if (this.endian === 'big') {
      for (var t = 8; t < this.padLength; t++)
        res[i++] = 0;

      res[i++] = 0;
      res[i++] = 0;
      res[i++] = 0;
      res[i++] = 0;
      res[i++] = (len >>> 24) & 0xff;
      res[i++] = (len >>> 16) & 0xff;
      res[i++] = (len >>> 8) & 0xff;
      res[i++] = len & 0xff;
    } else {
      res[i++] = len & 0xff;
      res[i++] = (len >>> 8) & 0xff;
      res[i++] = (len >>> 16) & 0xff;
      res[i++] = (len >>> 24) & 0xff;
      res[i++] = 0;
      res[i++] = 0;
      res[i++] = 0;
      res[i++] = 0;

      for (t = 8; t < this.padLength; t++)
        res[i++] = 0;
    }

    return res;
  };

  var sha = {};

  var common$4 = {};

  var utils$e = utils$g;
  var rotr32 = utils$e.rotr32;

  function ft_1$1(s, x, y, z) {
    if (s === 0)
      return ch32$1(x, y, z);
    if (s === 1 || s === 3)
      return p32(x, y, z);
    if (s === 2)
      return maj32$1(x, y, z);
  }
  common$4.ft_1 = ft_1$1;

  function ch32$1(x, y, z) {
    return (x & y) ^ ((~x) & z);
  }
  common$4.ch32 = ch32$1;

  function maj32$1(x, y, z) {
    return (x & y) ^ (x & z) ^ (y & z);
  }
  common$4.maj32 = maj32$1;

  function p32(x, y, z) {
    return x ^ y ^ z;
  }
  common$4.p32 = p32;

  function s0_256$1(x) {
    return rotr32(x, 2) ^ rotr32(x, 13) ^ rotr32(x, 22);
  }
  common$4.s0_256 = s0_256$1;

  function s1_256$1(x) {
    return rotr32(x, 6) ^ rotr32(x, 11) ^ rotr32(x, 25);
  }
  common$4.s1_256 = s1_256$1;

  function g0_256$1(x) {
    return rotr32(x, 7) ^ rotr32(x, 18) ^ (x >>> 3);
  }
  common$4.g0_256 = g0_256$1;

  function g1_256$1(x) {
    return rotr32(x, 17) ^ rotr32(x, 19) ^ (x >>> 10);
  }
  common$4.g1_256 = g1_256$1;

  var utils$d = utils$g;
  var common$3 = common$5;
  var shaCommon$1 = common$4;

  var rotl32$1 = utils$d.rotl32;
  var sum32$2 = utils$d.sum32;
  var sum32_5$1 = utils$d.sum32_5;
  var ft_1 = shaCommon$1.ft_1;
  var BlockHash$3 = common$3.BlockHash;

  var sha1_K = [
    0x5A827999, 0x6ED9EBA1,
    0x8F1BBCDC, 0xCA62C1D6
  ];

  function SHA1() {
    if (!(this instanceof SHA1))
      return new SHA1();

    BlockHash$3.call(this);
    this.h = [
      0x67452301, 0xefcdab89, 0x98badcfe,
      0x10325476, 0xc3d2e1f0 ];
    this.W = new Array(80);
  }

  utils$d.inherits(SHA1, BlockHash$3);
  var _1 = SHA1;

  SHA1.blockSize = 512;
  SHA1.outSize = 160;
  SHA1.hmacStrength = 80;
  SHA1.padLength = 64;

  SHA1.prototype._update = function _update(msg, start) {
    var W = this.W;

    for (var i = 0; i < 16; i++)
      W[i] = msg[start + i];

    for(; i < W.length; i++)
      W[i] = rotl32$1(W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16], 1);

    var a = this.h[0];
    var b = this.h[1];
    var c = this.h[2];
    var d = this.h[3];
    var e = this.h[4];

    for (i = 0; i < W.length; i++) {
      var s = ~~(i / 20);
      var t = sum32_5$1(rotl32$1(a, 5), ft_1(s, b, c, d), e, W[i], sha1_K[s]);
      e = d;
      d = c;
      c = rotl32$1(b, 30);
      b = a;
      a = t;
    }

    this.h[0] = sum32$2(this.h[0], a);
    this.h[1] = sum32$2(this.h[1], b);
    this.h[2] = sum32$2(this.h[2], c);
    this.h[3] = sum32$2(this.h[3], d);
    this.h[4] = sum32$2(this.h[4], e);
  };

  SHA1.prototype._digest = function digest(enc) {
    if (enc === 'hex')
      return utils$d.toHex32(this.h, 'big');
    else
      return utils$d.split32(this.h, 'big');
  };

  var utils$c = utils$g;
  var common$2 = common$5;
  var shaCommon = common$4;
  var assert$b = minimalisticAssert;

  var sum32$1 = utils$c.sum32;
  var sum32_4$1 = utils$c.sum32_4;
  var sum32_5 = utils$c.sum32_5;
  var ch32 = shaCommon.ch32;
  var maj32 = shaCommon.maj32;
  var s0_256 = shaCommon.s0_256;
  var s1_256 = shaCommon.s1_256;
  var g0_256 = shaCommon.g0_256;
  var g1_256 = shaCommon.g1_256;

  var BlockHash$2 = common$2.BlockHash;

  var sha256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function SHA256$1() {
    if (!(this instanceof SHA256$1))
      return new SHA256$1();

    BlockHash$2.call(this);
    this.h = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];
    this.k = sha256_K;
    this.W = new Array(64);
  }
  utils$c.inherits(SHA256$1, BlockHash$2);
  var _256 = SHA256$1;

  SHA256$1.blockSize = 512;
  SHA256$1.outSize = 256;
  SHA256$1.hmacStrength = 192;
  SHA256$1.padLength = 64;

  SHA256$1.prototype._update = function _update(msg, start) {
    var W = this.W;

    for (var i = 0; i < 16; i++)
      W[i] = msg[start + i];
    for (; i < W.length; i++)
      W[i] = sum32_4$1(g1_256(W[i - 2]), W[i - 7], g0_256(W[i - 15]), W[i - 16]);

    var a = this.h[0];
    var b = this.h[1];
    var c = this.h[2];
    var d = this.h[3];
    var e = this.h[4];
    var f = this.h[5];
    var g = this.h[6];
    var h = this.h[7];

    assert$b(this.k.length === W.length);
    for (i = 0; i < W.length; i++) {
      var T1 = sum32_5(h, s1_256(e), ch32(e, f, g), this.k[i], W[i]);
      var T2 = sum32$1(s0_256(a), maj32(a, b, c));
      h = g;
      g = f;
      f = e;
      e = sum32$1(d, T1);
      d = c;
      c = b;
      b = a;
      a = sum32$1(T1, T2);
    }

    this.h[0] = sum32$1(this.h[0], a);
    this.h[1] = sum32$1(this.h[1], b);
    this.h[2] = sum32$1(this.h[2], c);
    this.h[3] = sum32$1(this.h[3], d);
    this.h[4] = sum32$1(this.h[4], e);
    this.h[5] = sum32$1(this.h[5], f);
    this.h[6] = sum32$1(this.h[6], g);
    this.h[7] = sum32$1(this.h[7], h);
  };

  SHA256$1.prototype._digest = function digest(enc) {
    if (enc === 'hex')
      return utils$c.toHex32(this.h, 'big');
    else
      return utils$c.split32(this.h, 'big');
  };

  var utils$b = utils$g;
  var SHA256 = _256;

  function SHA224() {
    if (!(this instanceof SHA224))
      return new SHA224();

    SHA256.call(this);
    this.h = [
      0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939,
      0xffc00b31, 0x68581511, 0x64f98fa7, 0xbefa4fa4 ];
  }
  utils$b.inherits(SHA224, SHA256);
  var _224 = SHA224;

  SHA224.blockSize = 512;
  SHA224.outSize = 224;
  SHA224.hmacStrength = 192;
  SHA224.padLength = 64;

  SHA224.prototype._digest = function digest(enc) {
    // Just truncate output
    if (enc === 'hex')
      return utils$b.toHex32(this.h.slice(0, 7), 'big');
    else
      return utils$b.split32(this.h.slice(0, 7), 'big');
  };

  var utils$a = utils$g;
  var common$1 = common$5;
  var assert$a = minimalisticAssert;

  var rotr64_hi = utils$a.rotr64_hi;
  var rotr64_lo = utils$a.rotr64_lo;
  var shr64_hi = utils$a.shr64_hi;
  var shr64_lo = utils$a.shr64_lo;
  var sum64 = utils$a.sum64;
  var sum64_hi = utils$a.sum64_hi;
  var sum64_lo = utils$a.sum64_lo;
  var sum64_4_hi = utils$a.sum64_4_hi;
  var sum64_4_lo = utils$a.sum64_4_lo;
  var sum64_5_hi = utils$a.sum64_5_hi;
  var sum64_5_lo = utils$a.sum64_5_lo;

  var BlockHash$1 = common$1.BlockHash;

  var sha512_K = [
    0x428a2f98, 0xd728ae22, 0x71374491, 0x23ef65cd,
    0xb5c0fbcf, 0xec4d3b2f, 0xe9b5dba5, 0x8189dbbc,
    0x3956c25b, 0xf348b538, 0x59f111f1, 0xb605d019,
    0x923f82a4, 0xaf194f9b, 0xab1c5ed5, 0xda6d8118,
    0xd807aa98, 0xa3030242, 0x12835b01, 0x45706fbe,
    0x243185be, 0x4ee4b28c, 0x550c7dc3, 0xd5ffb4e2,
    0x72be5d74, 0xf27b896f, 0x80deb1fe, 0x3b1696b1,
    0x9bdc06a7, 0x25c71235, 0xc19bf174, 0xcf692694,
    0xe49b69c1, 0x9ef14ad2, 0xefbe4786, 0x384f25e3,
    0x0fc19dc6, 0x8b8cd5b5, 0x240ca1cc, 0x77ac9c65,
    0x2de92c6f, 0x592b0275, 0x4a7484aa, 0x6ea6e483,
    0x5cb0a9dc, 0xbd41fbd4, 0x76f988da, 0x831153b5,
    0x983e5152, 0xee66dfab, 0xa831c66d, 0x2db43210,
    0xb00327c8, 0x98fb213f, 0xbf597fc7, 0xbeef0ee4,
    0xc6e00bf3, 0x3da88fc2, 0xd5a79147, 0x930aa725,
    0x06ca6351, 0xe003826f, 0x14292967, 0x0a0e6e70,
    0x27b70a85, 0x46d22ffc, 0x2e1b2138, 0x5c26c926,
    0x4d2c6dfc, 0x5ac42aed, 0x53380d13, 0x9d95b3df,
    0x650a7354, 0x8baf63de, 0x766a0abb, 0x3c77b2a8,
    0x81c2c92e, 0x47edaee6, 0x92722c85, 0x1482353b,
    0xa2bfe8a1, 0x4cf10364, 0xa81a664b, 0xbc423001,
    0xc24b8b70, 0xd0f89791, 0xc76c51a3, 0x0654be30,
    0xd192e819, 0xd6ef5218, 0xd6990624, 0x5565a910,
    0xf40e3585, 0x5771202a, 0x106aa070, 0x32bbd1b8,
    0x19a4c116, 0xb8d2d0c8, 0x1e376c08, 0x5141ab53,
    0x2748774c, 0xdf8eeb99, 0x34b0bcb5, 0xe19b48a8,
    0x391c0cb3, 0xc5c95a63, 0x4ed8aa4a, 0xe3418acb,
    0x5b9cca4f, 0x7763e373, 0x682e6ff3, 0xd6b2b8a3,
    0x748f82ee, 0x5defb2fc, 0x78a5636f, 0x43172f60,
    0x84c87814, 0xa1f0ab72, 0x8cc70208, 0x1a6439ec,
    0x90befffa, 0x23631e28, 0xa4506ceb, 0xde82bde9,
    0xbef9a3f7, 0xb2c67915, 0xc67178f2, 0xe372532b,
    0xca273ece, 0xea26619c, 0xd186b8c7, 0x21c0c207,
    0xeada7dd6, 0xcde0eb1e, 0xf57d4f7f, 0xee6ed178,
    0x06f067aa, 0x72176fba, 0x0a637dc5, 0xa2c898a6,
    0x113f9804, 0xbef90dae, 0x1b710b35, 0x131c471b,
    0x28db77f5, 0x23047d84, 0x32caab7b, 0x40c72493,
    0x3c9ebe0a, 0x15c9bebc, 0x431d67c4, 0x9c100d4c,
    0x4cc5d4be, 0xcb3e42b6, 0x597f299c, 0xfc657e2a,
    0x5fcb6fab, 0x3ad6faec, 0x6c44198c, 0x4a475817
  ];

  function SHA512$1() {
    if (!(this instanceof SHA512$1))
      return new SHA512$1();

    BlockHash$1.call(this);
    this.h = [
      0x6a09e667, 0xf3bcc908,
      0xbb67ae85, 0x84caa73b,
      0x3c6ef372, 0xfe94f82b,
      0xa54ff53a, 0x5f1d36f1,
      0x510e527f, 0xade682d1,
      0x9b05688c, 0x2b3e6c1f,
      0x1f83d9ab, 0xfb41bd6b,
      0x5be0cd19, 0x137e2179 ];
    this.k = sha512_K;
    this.W = new Array(160);
  }
  utils$a.inherits(SHA512$1, BlockHash$1);
  var _512 = SHA512$1;

  SHA512$1.blockSize = 1024;
  SHA512$1.outSize = 512;
  SHA512$1.hmacStrength = 192;
  SHA512$1.padLength = 128;

  SHA512$1.prototype._prepareBlock = function _prepareBlock(msg, start) {
    var W = this.W;

    // 32 x 32bit words
    for (var i = 0; i < 32; i++)
      W[i] = msg[start + i];
    for (; i < W.length; i += 2) {
      var c0_hi = g1_512_hi(W[i - 4], W[i - 3]);  // i - 2
      var c0_lo = g1_512_lo(W[i - 4], W[i - 3]);
      var c1_hi = W[i - 14];  // i - 7
      var c1_lo = W[i - 13];
      var c2_hi = g0_512_hi(W[i - 30], W[i - 29]);  // i - 15
      var c2_lo = g0_512_lo(W[i - 30], W[i - 29]);
      var c3_hi = W[i - 32];  // i - 16
      var c3_lo = W[i - 31];

      W[i] = sum64_4_hi(
        c0_hi, c0_lo,
        c1_hi, c1_lo,
        c2_hi, c2_lo,
        c3_hi, c3_lo);
      W[i + 1] = sum64_4_lo(
        c0_hi, c0_lo,
        c1_hi, c1_lo,
        c2_hi, c2_lo,
        c3_hi, c3_lo);
    }
  };

  SHA512$1.prototype._update = function _update(msg, start) {
    this._prepareBlock(msg, start);

    var W = this.W;

    var ah = this.h[0];
    var al = this.h[1];
    var bh = this.h[2];
    var bl = this.h[3];
    var ch = this.h[4];
    var cl = this.h[5];
    var dh = this.h[6];
    var dl = this.h[7];
    var eh = this.h[8];
    var el = this.h[9];
    var fh = this.h[10];
    var fl = this.h[11];
    var gh = this.h[12];
    var gl = this.h[13];
    var hh = this.h[14];
    var hl = this.h[15];

    assert$a(this.k.length === W.length);
    for (var i = 0; i < W.length; i += 2) {
      var c0_hi = hh;
      var c0_lo = hl;
      var c1_hi = s1_512_hi(eh, el);
      var c1_lo = s1_512_lo(eh, el);
      var c2_hi = ch64_hi(eh, el, fh, fl, gh);
      var c2_lo = ch64_lo(eh, el, fh, fl, gh, gl);
      var c3_hi = this.k[i];
      var c3_lo = this.k[i + 1];
      var c4_hi = W[i];
      var c4_lo = W[i + 1];

      var T1_hi = sum64_5_hi(
        c0_hi, c0_lo,
        c1_hi, c1_lo,
        c2_hi, c2_lo,
        c3_hi, c3_lo,
        c4_hi, c4_lo);
      var T1_lo = sum64_5_lo(
        c0_hi, c0_lo,
        c1_hi, c1_lo,
        c2_hi, c2_lo,
        c3_hi, c3_lo,
        c4_hi, c4_lo);

      c0_hi = s0_512_hi(ah, al);
      c0_lo = s0_512_lo(ah, al);
      c1_hi = maj64_hi(ah, al, bh, bl, ch);
      c1_lo = maj64_lo(ah, al, bh, bl, ch, cl);

      var T2_hi = sum64_hi(c0_hi, c0_lo, c1_hi, c1_lo);
      var T2_lo = sum64_lo(c0_hi, c0_lo, c1_hi, c1_lo);

      hh = gh;
      hl = gl;

      gh = fh;
      gl = fl;

      fh = eh;
      fl = el;

      eh = sum64_hi(dh, dl, T1_hi, T1_lo);
      el = sum64_lo(dl, dl, T1_hi, T1_lo);

      dh = ch;
      dl = cl;

      ch = bh;
      cl = bl;

      bh = ah;
      bl = al;

      ah = sum64_hi(T1_hi, T1_lo, T2_hi, T2_lo);
      al = sum64_lo(T1_hi, T1_lo, T2_hi, T2_lo);
    }

    sum64(this.h, 0, ah, al);
    sum64(this.h, 2, bh, bl);
    sum64(this.h, 4, ch, cl);
    sum64(this.h, 6, dh, dl);
    sum64(this.h, 8, eh, el);
    sum64(this.h, 10, fh, fl);
    sum64(this.h, 12, gh, gl);
    sum64(this.h, 14, hh, hl);
  };

  SHA512$1.prototype._digest = function digest(enc) {
    if (enc === 'hex')
      return utils$a.toHex32(this.h, 'big');
    else
      return utils$a.split32(this.h, 'big');
  };

  function ch64_hi(xh, xl, yh, yl, zh) {
    var r = (xh & yh) ^ ((~xh) & zh);
    if (r < 0)
      r += 0x100000000;
    return r;
  }

  function ch64_lo(xh, xl, yh, yl, zh, zl) {
    var r = (xl & yl) ^ ((~xl) & zl);
    if (r < 0)
      r += 0x100000000;
    return r;
  }

  function maj64_hi(xh, xl, yh, yl, zh) {
    var r = (xh & yh) ^ (xh & zh) ^ (yh & zh);
    if (r < 0)
      r += 0x100000000;
    return r;
  }

  function maj64_lo(xh, xl, yh, yl, zh, zl) {
    var r = (xl & yl) ^ (xl & zl) ^ (yl & zl);
    if (r < 0)
      r += 0x100000000;
    return r;
  }

  function s0_512_hi(xh, xl) {
    var c0_hi = rotr64_hi(xh, xl, 28);
    var c1_hi = rotr64_hi(xl, xh, 2);  // 34
    var c2_hi = rotr64_hi(xl, xh, 7);  // 39

    var r = c0_hi ^ c1_hi ^ c2_hi;
    if (r < 0)
      r += 0x100000000;
    return r;
  }

  function s0_512_lo(xh, xl) {
    var c0_lo = rotr64_lo(xh, xl, 28);
    var c1_lo = rotr64_lo(xl, xh, 2);  // 34
    var c2_lo = rotr64_lo(xl, xh, 7);  // 39

    var r = c0_lo ^ c1_lo ^ c2_lo;
    if (r < 0)
      r += 0x100000000;
    return r;
  }

  function s1_512_hi(xh, xl) {
    var c0_hi = rotr64_hi(xh, xl, 14);
    var c1_hi = rotr64_hi(xh, xl, 18);
    var c2_hi = rotr64_hi(xl, xh, 9);  // 41

    var r = c0_hi ^ c1_hi ^ c2_hi;
    if (r < 0)
      r += 0x100000000;
    return r;
  }

  function s1_512_lo(xh, xl) {
    var c0_lo = rotr64_lo(xh, xl, 14);
    var c1_lo = rotr64_lo(xh, xl, 18);
    var c2_lo = rotr64_lo(xl, xh, 9);  // 41

    var r = c0_lo ^ c1_lo ^ c2_lo;
    if (r < 0)
      r += 0x100000000;
    return r;
  }

  function g0_512_hi(xh, xl) {
    var c0_hi = rotr64_hi(xh, xl, 1);
    var c1_hi = rotr64_hi(xh, xl, 8);
    var c2_hi = shr64_hi(xh, xl, 7);

    var r = c0_hi ^ c1_hi ^ c2_hi;
    if (r < 0)
      r += 0x100000000;
    return r;
  }

  function g0_512_lo(xh, xl) {
    var c0_lo = rotr64_lo(xh, xl, 1);
    var c1_lo = rotr64_lo(xh, xl, 8);
    var c2_lo = shr64_lo(xh, xl, 7);

    var r = c0_lo ^ c1_lo ^ c2_lo;
    if (r < 0)
      r += 0x100000000;
    return r;
  }

  function g1_512_hi(xh, xl) {
    var c0_hi = rotr64_hi(xh, xl, 19);
    var c1_hi = rotr64_hi(xl, xh, 29);  // 61
    var c2_hi = shr64_hi(xh, xl, 6);

    var r = c0_hi ^ c1_hi ^ c2_hi;
    if (r < 0)
      r += 0x100000000;
    return r;
  }

  function g1_512_lo(xh, xl) {
    var c0_lo = rotr64_lo(xh, xl, 19);
    var c1_lo = rotr64_lo(xl, xh, 29);  // 61
    var c2_lo = shr64_lo(xh, xl, 6);

    var r = c0_lo ^ c1_lo ^ c2_lo;
    if (r < 0)
      r += 0x100000000;
    return r;
  }

  var utils$9 = utils$g;

  var SHA512 = _512;

  function SHA384() {
    if (!(this instanceof SHA384))
      return new SHA384();

    SHA512.call(this);
    this.h = [
      0xcbbb9d5d, 0xc1059ed8,
      0x629a292a, 0x367cd507,
      0x9159015a, 0x3070dd17,
      0x152fecd8, 0xf70e5939,
      0x67332667, 0xffc00b31,
      0x8eb44a87, 0x68581511,
      0xdb0c2e0d, 0x64f98fa7,
      0x47b5481d, 0xbefa4fa4 ];
  }
  utils$9.inherits(SHA384, SHA512);
  var _384 = SHA384;

  SHA384.blockSize = 1024;
  SHA384.outSize = 384;
  SHA384.hmacStrength = 192;
  SHA384.padLength = 128;

  SHA384.prototype._digest = function digest(enc) {
    if (enc === 'hex')
      return utils$9.toHex32(this.h.slice(0, 12), 'big');
    else
      return utils$9.split32(this.h.slice(0, 12), 'big');
  };

  sha.sha1 = _1;
  sha.sha224 = _224;
  sha.sha256 = _256;
  sha.sha384 = _384;
  sha.sha512 = _512;

  var ripemd = {};

  var utils$8 = utils$g;
  var common = common$5;

  var rotl32 = utils$8.rotl32;
  var sum32 = utils$8.sum32;
  var sum32_3 = utils$8.sum32_3;
  var sum32_4 = utils$8.sum32_4;
  var BlockHash = common.BlockHash;

  function RIPEMD160() {
    if (!(this instanceof RIPEMD160))
      return new RIPEMD160();

    BlockHash.call(this);

    this.h = [ 0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0 ];
    this.endian = 'little';
  }
  utils$8.inherits(RIPEMD160, BlockHash);
  ripemd.ripemd160 = RIPEMD160;

  RIPEMD160.blockSize = 512;
  RIPEMD160.outSize = 160;
  RIPEMD160.hmacStrength = 192;
  RIPEMD160.padLength = 64;

  RIPEMD160.prototype._update = function update(msg, start) {
    var A = this.h[0];
    var B = this.h[1];
    var C = this.h[2];
    var D = this.h[3];
    var E = this.h[4];
    var Ah = A;
    var Bh = B;
    var Ch = C;
    var Dh = D;
    var Eh = E;
    for (var j = 0; j < 80; j++) {
      var T = sum32(
        rotl32(
          sum32_4(A, f(j, B, C, D), msg[r[j] + start], K(j)),
          s[j]),
        E);
      A = E;
      E = D;
      D = rotl32(C, 10);
      C = B;
      B = T;
      T = sum32(
        rotl32(
          sum32_4(Ah, f(79 - j, Bh, Ch, Dh), msg[rh[j] + start], Kh(j)),
          sh[j]),
        Eh);
      Ah = Eh;
      Eh = Dh;
      Dh = rotl32(Ch, 10);
      Ch = Bh;
      Bh = T;
    }
    T = sum32_3(this.h[1], C, Dh);
    this.h[1] = sum32_3(this.h[2], D, Eh);
    this.h[2] = sum32_3(this.h[3], E, Ah);
    this.h[3] = sum32_3(this.h[4], A, Bh);
    this.h[4] = sum32_3(this.h[0], B, Ch);
    this.h[0] = T;
  };

  RIPEMD160.prototype._digest = function digest(enc) {
    if (enc === 'hex')
      return utils$8.toHex32(this.h, 'little');
    else
      return utils$8.split32(this.h, 'little');
  };

  function f(j, x, y, z) {
    if (j <= 15)
      return x ^ y ^ z;
    else if (j <= 31)
      return (x & y) | ((~x) & z);
    else if (j <= 47)
      return (x | (~y)) ^ z;
    else if (j <= 63)
      return (x & z) | (y & (~z));
    else
      return x ^ (y | (~z));
  }

  function K(j) {
    if (j <= 15)
      return 0x00000000;
    else if (j <= 31)
      return 0x5a827999;
    else if (j <= 47)
      return 0x6ed9eba1;
    else if (j <= 63)
      return 0x8f1bbcdc;
    else
      return 0xa953fd4e;
  }

  function Kh(j) {
    if (j <= 15)
      return 0x50a28be6;
    else if (j <= 31)
      return 0x5c4dd124;
    else if (j <= 47)
      return 0x6d703ef3;
    else if (j <= 63)
      return 0x7a6d76e9;
    else
      return 0x00000000;
  }

  var r = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
    3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
    1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
    4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13
  ];

  var rh = [
    5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
    6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
    15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
    8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
    12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11
  ];

  var s = [
    11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
    7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
    11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
    11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
    9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6
  ];

  var sh = [
    8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
    9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
    9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
    15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
    8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11
  ];

  var utils$7 = utils$g;
  var assert$9 = minimalisticAssert;

  function Hmac(hash, key, enc) {
    if (!(this instanceof Hmac))
      return new Hmac(hash, key, enc);
    this.Hash = hash;
    this.blockSize = hash.blockSize / 8;
    this.outSize = hash.outSize / 8;
    this.inner = null;
    this.outer = null;

    this._init(utils$7.toArray(key, enc));
  }
  var hmac = Hmac;

  Hmac.prototype._init = function init(key) {
    // Shorten key, if needed
    if (key.length > this.blockSize)
      key = new this.Hash().update(key).digest();
    assert$9(key.length <= this.blockSize);

    // Add padding to key
    for (var i = key.length; i < this.blockSize; i++)
      key.push(0);

    for (i = 0; i < key.length; i++)
      key[i] ^= 0x36;
    this.inner = new this.Hash().update(key);

    // 0x36 ^ 0x5c = 0x6a
    for (i = 0; i < key.length; i++)
      key[i] ^= 0x6a;
    this.outer = new this.Hash().update(key);
  };

  Hmac.prototype.update = function update(msg, enc) {
    this.inner.update(msg, enc);
    return this;
  };

  Hmac.prototype.digest = function digest(enc) {
    this.outer.update(this.inner.digest());
    return this.outer.digest(enc);
  };

  (function (exports) {
  	var hash = exports;

  	hash.utils = utils$g;
  	hash.common = common$5;
  	hash.sha = sha;
  	hash.ripemd = ripemd;
  	hash.hmac = hmac;

  	// Proxy hash functions to the main object
  	hash.sha1 = hash.sha.sha1;
  	hash.sha256 = hash.sha.sha256;
  	hash.sha224 = hash.sha.sha224;
  	hash.sha384 = hash.sha.sha384;
  	hash.sha512 = hash.sha.sha512;
  	hash.ripemd160 = hash.ripemd.ripemd160;
  } (hash$3));

  var secp256k1;
  var hasRequiredSecp256k1;

  function requireSecp256k1 () {
  	if (hasRequiredSecp256k1) return secp256k1;
  	hasRequiredSecp256k1 = 1;
  	secp256k1 = {
  	  doubles: {
  	    step: 4,
  	    points: [
  	      [
  	        'e60fce93b59e9ec53011aabc21c23e97b2a31369b87a5ae9c44ee89e2a6dec0a',
  	        'f7e3507399e595929db99f34f57937101296891e44d23f0be1f32cce69616821',
  	      ],
  	      [
  	        '8282263212c609d9ea2a6e3e172de238d8c39cabd5ac1ca10646e23fd5f51508',
  	        '11f8a8098557dfe45e8256e830b60ace62d613ac2f7b17bed31b6eaff6e26caf',
  	      ],
  	      [
  	        '175e159f728b865a72f99cc6c6fc846de0b93833fd2222ed73fce5b551e5b739',
  	        'd3506e0d9e3c79eba4ef97a51ff71f5eacb5955add24345c6efa6ffee9fed695',
  	      ],
  	      [
  	        '363d90d447b00c9c99ceac05b6262ee053441c7e55552ffe526bad8f83ff4640',
  	        '4e273adfc732221953b445397f3363145b9a89008199ecb62003c7f3bee9de9',
  	      ],
  	      [
  	        '8b4b5f165df3c2be8c6244b5b745638843e4a781a15bcd1b69f79a55dffdf80c',
  	        '4aad0a6f68d308b4b3fbd7813ab0da04f9e336546162ee56b3eff0c65fd4fd36',
  	      ],
  	      [
  	        '723cbaa6e5db996d6bf771c00bd548c7b700dbffa6c0e77bcb6115925232fcda',
  	        '96e867b5595cc498a921137488824d6e2660a0653779494801dc069d9eb39f5f',
  	      ],
  	      [
  	        'eebfa4d493bebf98ba5feec812c2d3b50947961237a919839a533eca0e7dd7fa',
  	        '5d9a8ca3970ef0f269ee7edaf178089d9ae4cdc3a711f712ddfd4fdae1de8999',
  	      ],
  	      [
  	        '100f44da696e71672791d0a09b7bde459f1215a29b3c03bfefd7835b39a48db0',
  	        'cdd9e13192a00b772ec8f3300c090666b7ff4a18ff5195ac0fbd5cd62bc65a09',
  	      ],
  	      [
  	        'e1031be262c7ed1b1dc9227a4a04c017a77f8d4464f3b3852c8acde6e534fd2d',
  	        '9d7061928940405e6bb6a4176597535af292dd419e1ced79a44f18f29456a00d',
  	      ],
  	      [
  	        'feea6cae46d55b530ac2839f143bd7ec5cf8b266a41d6af52d5e688d9094696d',
  	        'e57c6b6c97dce1bab06e4e12bf3ecd5c981c8957cc41442d3155debf18090088',
  	      ],
  	      [
  	        'da67a91d91049cdcb367be4be6ffca3cfeed657d808583de33fa978bc1ec6cb1',
  	        '9bacaa35481642bc41f463f7ec9780e5dec7adc508f740a17e9ea8e27a68be1d',
  	      ],
  	      [
  	        '53904faa0b334cdda6e000935ef22151ec08d0f7bb11069f57545ccc1a37b7c0',
  	        '5bc087d0bc80106d88c9eccac20d3c1c13999981e14434699dcb096b022771c8',
  	      ],
  	      [
  	        '8e7bcd0bd35983a7719cca7764ca906779b53a043a9b8bcaeff959f43ad86047',
  	        '10b7770b2a3da4b3940310420ca9514579e88e2e47fd68b3ea10047e8460372a',
  	      ],
  	      [
  	        '385eed34c1cdff21e6d0818689b81bde71a7f4f18397e6690a841e1599c43862',
  	        '283bebc3e8ea23f56701de19e9ebf4576b304eec2086dc8cc0458fe5542e5453',
  	      ],
  	      [
  	        '6f9d9b803ecf191637c73a4413dfa180fddf84a5947fbc9c606ed86c3fac3a7',
  	        '7c80c68e603059ba69b8e2a30e45c4d47ea4dd2f5c281002d86890603a842160',
  	      ],
  	      [
  	        '3322d401243c4e2582a2147c104d6ecbf774d163db0f5e5313b7e0e742d0e6bd',
  	        '56e70797e9664ef5bfb019bc4ddaf9b72805f63ea2873af624f3a2e96c28b2a0',
  	      ],
  	      [
  	        '85672c7d2de0b7da2bd1770d89665868741b3f9af7643397721d74d28134ab83',
  	        '7c481b9b5b43b2eb6374049bfa62c2e5e77f17fcc5298f44c8e3094f790313a6',
  	      ],
  	      [
  	        '948bf809b1988a46b06c9f1919413b10f9226c60f668832ffd959af60c82a0a',
  	        '53a562856dcb6646dc6b74c5d1c3418c6d4dff08c97cd2bed4cb7f88d8c8e589',
  	      ],
  	      [
  	        '6260ce7f461801c34f067ce0f02873a8f1b0e44dfc69752accecd819f38fd8e8',
  	        'bc2da82b6fa5b571a7f09049776a1ef7ecd292238051c198c1a84e95b2b4ae17',
  	      ],
  	      [
  	        'e5037de0afc1d8d43d8348414bbf4103043ec8f575bfdc432953cc8d2037fa2d',
  	        '4571534baa94d3b5f9f98d09fb990bddbd5f5b03ec481f10e0e5dc841d755bda',
  	      ],
  	      [
  	        'e06372b0f4a207adf5ea905e8f1771b4e7e8dbd1c6a6c5b725866a0ae4fce725',
  	        '7a908974bce18cfe12a27bb2ad5a488cd7484a7787104870b27034f94eee31dd',
  	      ],
  	      [
  	        '213c7a715cd5d45358d0bbf9dc0ce02204b10bdde2a3f58540ad6908d0559754',
  	        '4b6dad0b5ae462507013ad06245ba190bb4850f5f36a7eeddff2c27534b458f2',
  	      ],
  	      [
  	        '4e7c272a7af4b34e8dbb9352a5419a87e2838c70adc62cddf0cc3a3b08fbd53c',
  	        '17749c766c9d0b18e16fd09f6def681b530b9614bff7dd33e0b3941817dcaae6',
  	      ],
  	      [
  	        'fea74e3dbe778b1b10f238ad61686aa5c76e3db2be43057632427e2840fb27b6',
  	        '6e0568db9b0b13297cf674deccb6af93126b596b973f7b77701d3db7f23cb96f',
  	      ],
  	      [
  	        '76e64113f677cf0e10a2570d599968d31544e179b760432952c02a4417bdde39',
  	        'c90ddf8dee4e95cf577066d70681f0d35e2a33d2b56d2032b4b1752d1901ac01',
  	      ],
  	      [
  	        'c738c56b03b2abe1e8281baa743f8f9a8f7cc643df26cbee3ab150242bcbb891',
  	        '893fb578951ad2537f718f2eacbfbbbb82314eef7880cfe917e735d9699a84c3',
  	      ],
  	      [
  	        'd895626548b65b81e264c7637c972877d1d72e5f3a925014372e9f6588f6c14b',
  	        'febfaa38f2bc7eae728ec60818c340eb03428d632bb067e179363ed75d7d991f',
  	      ],
  	      [
  	        'b8da94032a957518eb0f6433571e8761ceffc73693e84edd49150a564f676e03',
  	        '2804dfa44805a1e4d7c99cc9762808b092cc584d95ff3b511488e4e74efdf6e7',
  	      ],
  	      [
  	        'e80fea14441fb33a7d8adab9475d7fab2019effb5156a792f1a11778e3c0df5d',
  	        'eed1de7f638e00771e89768ca3ca94472d155e80af322ea9fcb4291b6ac9ec78',
  	      ],
  	      [
  	        'a301697bdfcd704313ba48e51d567543f2a182031efd6915ddc07bbcc4e16070',
  	        '7370f91cfb67e4f5081809fa25d40f9b1735dbf7c0a11a130c0d1a041e177ea1',
  	      ],
  	      [
  	        '90ad85b389d6b936463f9d0512678de208cc330b11307fffab7ac63e3fb04ed4',
  	        'e507a3620a38261affdcbd9427222b839aefabe1582894d991d4d48cb6ef150',
  	      ],
  	      [
  	        '8f68b9d2f63b5f339239c1ad981f162ee88c5678723ea3351b7b444c9ec4c0da',
  	        '662a9f2dba063986de1d90c2b6be215dbbea2cfe95510bfdf23cbf79501fff82',
  	      ],
  	      [
  	        'e4f3fb0176af85d65ff99ff9198c36091f48e86503681e3e6686fd5053231e11',
  	        '1e63633ad0ef4f1c1661a6d0ea02b7286cc7e74ec951d1c9822c38576feb73bc',
  	      ],
  	      [
  	        '8c00fa9b18ebf331eb961537a45a4266c7034f2f0d4e1d0716fb6eae20eae29e',
  	        'efa47267fea521a1a9dc343a3736c974c2fadafa81e36c54e7d2a4c66702414b',
  	      ],
  	      [
  	        'e7a26ce69dd4829f3e10cec0a9e98ed3143d084f308b92c0997fddfc60cb3e41',
  	        '2a758e300fa7984b471b006a1aafbb18d0a6b2c0420e83e20e8a9421cf2cfd51',
  	      ],
  	      [
  	        'b6459e0ee3662ec8d23540c223bcbdc571cbcb967d79424f3cf29eb3de6b80ef',
  	        '67c876d06f3e06de1dadf16e5661db3c4b3ae6d48e35b2ff30bf0b61a71ba45',
  	      ],
  	      [
  	        'd68a80c8280bb840793234aa118f06231d6f1fc67e73c5a5deda0f5b496943e8',
  	        'db8ba9fff4b586d00c4b1f9177b0e28b5b0e7b8f7845295a294c84266b133120',
  	      ],
  	      [
  	        '324aed7df65c804252dc0270907a30b09612aeb973449cea4095980fc28d3d5d',
  	        '648a365774b61f2ff130c0c35aec1f4f19213b0c7e332843967224af96ab7c84',
  	      ],
  	      [
  	        '4df9c14919cde61f6d51dfdbe5fee5dceec4143ba8d1ca888e8bd373fd054c96',
  	        '35ec51092d8728050974c23a1d85d4b5d506cdc288490192ebac06cad10d5d',
  	      ],
  	      [
  	        '9c3919a84a474870faed8a9c1cc66021523489054d7f0308cbfc99c8ac1f98cd',
  	        'ddb84f0f4a4ddd57584f044bf260e641905326f76c64c8e6be7e5e03d4fc599d',
  	      ],
  	      [
  	        '6057170b1dd12fdf8de05f281d8e06bb91e1493a8b91d4cc5a21382120a959e5',
  	        '9a1af0b26a6a4807add9a2daf71df262465152bc3ee24c65e899be932385a2a8',
  	      ],
  	      [
  	        'a576df8e23a08411421439a4518da31880cef0fba7d4df12b1a6973eecb94266',
  	        '40a6bf20e76640b2c92b97afe58cd82c432e10a7f514d9f3ee8be11ae1b28ec8',
  	      ],
  	      [
  	        '7778a78c28dec3e30a05fe9629de8c38bb30d1f5cf9a3a208f763889be58ad71',
  	        '34626d9ab5a5b22ff7098e12f2ff580087b38411ff24ac563b513fc1fd9f43ac',
  	      ],
  	      [
  	        '928955ee637a84463729fd30e7afd2ed5f96274e5ad7e5cb09eda9c06d903ac',
  	        'c25621003d3f42a827b78a13093a95eeac3d26efa8a8d83fc5180e935bcd091f',
  	      ],
  	      [
  	        '85d0fef3ec6db109399064f3a0e3b2855645b4a907ad354527aae75163d82751',
  	        '1f03648413a38c0be29d496e582cf5663e8751e96877331582c237a24eb1f962',
  	      ],
  	      [
  	        'ff2b0dce97eece97c1c9b6041798b85dfdfb6d8882da20308f5404824526087e',
  	        '493d13fef524ba188af4c4dc54d07936c7b7ed6fb90e2ceb2c951e01f0c29907',
  	      ],
  	      [
  	        '827fbbe4b1e880ea9ed2b2e6301b212b57f1ee148cd6dd28780e5e2cf856e241',
  	        'c60f9c923c727b0b71bef2c67d1d12687ff7a63186903166d605b68baec293ec',
  	      ],
  	      [
  	        'eaa649f21f51bdbae7be4ae34ce6e5217a58fdce7f47f9aa7f3b58fa2120e2b3',
  	        'be3279ed5bbbb03ac69a80f89879aa5a01a6b965f13f7e59d47a5305ba5ad93d',
  	      ],
  	      [
  	        'e4a42d43c5cf169d9391df6decf42ee541b6d8f0c9a137401e23632dda34d24f',
  	        '4d9f92e716d1c73526fc99ccfb8ad34ce886eedfa8d8e4f13a7f7131deba9414',
  	      ],
  	      [
  	        '1ec80fef360cbdd954160fadab352b6b92b53576a88fea4947173b9d4300bf19',
  	        'aeefe93756b5340d2f3a4958a7abbf5e0146e77f6295a07b671cdc1cc107cefd',
  	      ],
  	      [
  	        '146a778c04670c2f91b00af4680dfa8bce3490717d58ba889ddb5928366642be',
  	        'b318e0ec3354028add669827f9d4b2870aaa971d2f7e5ed1d0b297483d83efd0',
  	      ],
  	      [
  	        'fa50c0f61d22e5f07e3acebb1aa07b128d0012209a28b9776d76a8793180eef9',
  	        '6b84c6922397eba9b72cd2872281a68a5e683293a57a213b38cd8d7d3f4f2811',
  	      ],
  	      [
  	        'da1d61d0ca721a11b1a5bf6b7d88e8421a288ab5d5bba5220e53d32b5f067ec2',
  	        '8157f55a7c99306c79c0766161c91e2966a73899d279b48a655fba0f1ad836f1',
  	      ],
  	      [
  	        'a8e282ff0c9706907215ff98e8fd416615311de0446f1e062a73b0610d064e13',
  	        '7f97355b8db81c09abfb7f3c5b2515888b679a3e50dd6bd6cef7c73111f4cc0c',
  	      ],
  	      [
  	        '174a53b9c9a285872d39e56e6913cab15d59b1fa512508c022f382de8319497c',
  	        'ccc9dc37abfc9c1657b4155f2c47f9e6646b3a1d8cb9854383da13ac079afa73',
  	      ],
  	      [
  	        '959396981943785c3d3e57edf5018cdbe039e730e4918b3d884fdff09475b7ba',
  	        '2e7e552888c331dd8ba0386a4b9cd6849c653f64c8709385e9b8abf87524f2fd',
  	      ],
  	      [
  	        'd2a63a50ae401e56d645a1153b109a8fcca0a43d561fba2dbb51340c9d82b151',
  	        'e82d86fb6443fcb7565aee58b2948220a70f750af484ca52d4142174dcf89405',
  	      ],
  	      [
  	        '64587e2335471eb890ee7896d7cfdc866bacbdbd3839317b3436f9b45617e073',
  	        'd99fcdd5bf6902e2ae96dd6447c299a185b90a39133aeab358299e5e9faf6589',
  	      ],
  	      [
  	        '8481bde0e4e4d885b3a546d3e549de042f0aa6cea250e7fd358d6c86dd45e458',
  	        '38ee7b8cba5404dd84a25bf39cecb2ca900a79c42b262e556d64b1b59779057e',
  	      ],
  	      [
  	        '13464a57a78102aa62b6979ae817f4637ffcfed3c4b1ce30bcd6303f6caf666b',
  	        '69be159004614580ef7e433453ccb0ca48f300a81d0942e13f495a907f6ecc27',
  	      ],
  	      [
  	        'bc4a9df5b713fe2e9aef430bcc1dc97a0cd9ccede2f28588cada3a0d2d83f366',
  	        'd3a81ca6e785c06383937adf4b798caa6e8a9fbfa547b16d758d666581f33c1',
  	      ],
  	      [
  	        '8c28a97bf8298bc0d23d8c749452a32e694b65e30a9472a3954ab30fe5324caa',
  	        '40a30463a3305193378fedf31f7cc0eb7ae784f0451cb9459e71dc73cbef9482',
  	      ],
  	      [
  	        '8ea9666139527a8c1dd94ce4f071fd23c8b350c5a4bb33748c4ba111faccae0',
  	        '620efabbc8ee2782e24e7c0cfb95c5d735b783be9cf0f8e955af34a30e62b945',
  	      ],
  	      [
  	        'dd3625faef5ba06074669716bbd3788d89bdde815959968092f76cc4eb9a9787',
  	        '7a188fa3520e30d461da2501045731ca941461982883395937f68d00c644a573',
  	      ],
  	      [
  	        'f710d79d9eb962297e4f6232b40e8f7feb2bc63814614d692c12de752408221e',
  	        'ea98e67232d3b3295d3b535532115ccac8612c721851617526ae47a9c77bfc82',
  	      ],
  	    ],
  	  },
  	  naf: {
  	    wnd: 7,
  	    points: [
  	      [
  	        'f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9',
  	        '388f7b0f632de8140fe337e62a37f3566500a99934c2231b6cb9fd7584b8e672',
  	      ],
  	      [
  	        '2f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4',
  	        'd8ac222636e5e3d6d4dba9dda6c9c426f788271bab0d6840dca87d3aa6ac62d6',
  	      ],
  	      [
  	        '5cbdf0646e5db4eaa398f365f2ea7a0e3d419b7e0330e39ce92bddedcac4f9bc',
  	        '6aebca40ba255960a3178d6d861a54dba813d0b813fde7b5a5082628087264da',
  	      ],
  	      [
  	        'acd484e2f0c7f65309ad178a9f559abde09796974c57e714c35f110dfc27ccbe',
  	        'cc338921b0a7d9fd64380971763b61e9add888a4375f8e0f05cc262ac64f9c37',
  	      ],
  	      [
  	        '774ae7f858a9411e5ef4246b70c65aac5649980be5c17891bbec17895da008cb',
  	        'd984a032eb6b5e190243dd56d7b7b365372db1e2dff9d6a8301d74c9c953c61b',
  	      ],
  	      [
  	        'f28773c2d975288bc7d1d205c3748651b075fbc6610e58cddeeddf8f19405aa8',
  	        'ab0902e8d880a89758212eb65cdaf473a1a06da521fa91f29b5cb52db03ed81',
  	      ],
  	      [
  	        'd7924d4f7d43ea965a465ae3095ff41131e5946f3c85f79e44adbcf8e27e080e',
  	        '581e2872a86c72a683842ec228cc6defea40af2bd896d3a5c504dc9ff6a26b58',
  	      ],
  	      [
  	        'defdea4cdb677750a420fee807eacf21eb9898ae79b9768766e4faa04a2d4a34',
  	        '4211ab0694635168e997b0ead2a93daeced1f4a04a95c0f6cfb199f69e56eb77',
  	      ],
  	      [
  	        '2b4ea0a797a443d293ef5cff444f4979f06acfebd7e86d277475656138385b6c',
  	        '85e89bc037945d93b343083b5a1c86131a01f60c50269763b570c854e5c09b7a',
  	      ],
  	      [
  	        '352bbf4a4cdd12564f93fa332ce333301d9ad40271f8107181340aef25be59d5',
  	        '321eb4075348f534d59c18259dda3e1f4a1b3b2e71b1039c67bd3d8bcf81998c',
  	      ],
  	      [
  	        '2fa2104d6b38d11b0230010559879124e42ab8dfeff5ff29dc9cdadd4ecacc3f',
  	        '2de1068295dd865b64569335bd5dd80181d70ecfc882648423ba76b532b7d67',
  	      ],
  	      [
  	        '9248279b09b4d68dab21a9b066edda83263c3d84e09572e269ca0cd7f5453714',
  	        '73016f7bf234aade5d1aa71bdea2b1ff3fc0de2a887912ffe54a32ce97cb3402',
  	      ],
  	      [
  	        'daed4f2be3a8bf278e70132fb0beb7522f570e144bf615c07e996d443dee8729',
  	        'a69dce4a7d6c98e8d4a1aca87ef8d7003f83c230f3afa726ab40e52290be1c55',
  	      ],
  	      [
  	        'c44d12c7065d812e8acf28d7cbb19f9011ecd9e9fdf281b0e6a3b5e87d22e7db',
  	        '2119a460ce326cdc76c45926c982fdac0e106e861edf61c5a039063f0e0e6482',
  	      ],
  	      [
  	        '6a245bf6dc698504c89a20cfded60853152b695336c28063b61c65cbd269e6b4',
  	        'e022cf42c2bd4a708b3f5126f16a24ad8b33ba48d0423b6efd5e6348100d8a82',
  	      ],
  	      [
  	        '1697ffa6fd9de627c077e3d2fe541084ce13300b0bec1146f95ae57f0d0bd6a5',
  	        'b9c398f186806f5d27561506e4557433a2cf15009e498ae7adee9d63d01b2396',
  	      ],
  	      [
  	        '605bdb019981718b986d0f07e834cb0d9deb8360ffb7f61df982345ef27a7479',
  	        '2972d2de4f8d20681a78d93ec96fe23c26bfae84fb14db43b01e1e9056b8c49',
  	      ],
  	      [
  	        '62d14dab4150bf497402fdc45a215e10dcb01c354959b10cfe31c7e9d87ff33d',
  	        '80fc06bd8cc5b01098088a1950eed0db01aa132967ab472235f5642483b25eaf',
  	      ],
  	      [
  	        '80c60ad0040f27dade5b4b06c408e56b2c50e9f56b9b8b425e555c2f86308b6f',
  	        '1c38303f1cc5c30f26e66bad7fe72f70a65eed4cbe7024eb1aa01f56430bd57a',
  	      ],
  	      [
  	        '7a9375ad6167ad54aa74c6348cc54d344cc5dc9487d847049d5eabb0fa03c8fb',
  	        'd0e3fa9eca8726909559e0d79269046bdc59ea10c70ce2b02d499ec224dc7f7',
  	      ],
  	      [
  	        'd528ecd9b696b54c907a9ed045447a79bb408ec39b68df504bb51f459bc3ffc9',
  	        'eecf41253136e5f99966f21881fd656ebc4345405c520dbc063465b521409933',
  	      ],
  	      [
  	        '49370a4b5f43412ea25f514e8ecdad05266115e4a7ecb1387231808f8b45963',
  	        '758f3f41afd6ed428b3081b0512fd62a54c3f3afbb5b6764b653052a12949c9a',
  	      ],
  	      [
  	        '77f230936ee88cbbd73df930d64702ef881d811e0e1498e2f1c13eb1fc345d74',
  	        '958ef42a7886b6400a08266e9ba1b37896c95330d97077cbbe8eb3c7671c60d6',
  	      ],
  	      [
  	        'f2dac991cc4ce4b9ea44887e5c7c0bce58c80074ab9d4dbaeb28531b7739f530',
  	        'e0dedc9b3b2f8dad4da1f32dec2531df9eb5fbeb0598e4fd1a117dba703a3c37',
  	      ],
  	      [
  	        '463b3d9f662621fb1b4be8fbbe2520125a216cdfc9dae3debcba4850c690d45b',
  	        '5ed430d78c296c3543114306dd8622d7c622e27c970a1de31cb377b01af7307e',
  	      ],
  	      [
  	        'f16f804244e46e2a09232d4aff3b59976b98fac14328a2d1a32496b49998f247',
  	        'cedabd9b82203f7e13d206fcdf4e33d92a6c53c26e5cce26d6579962c4e31df6',
  	      ],
  	      [
  	        'caf754272dc84563b0352b7a14311af55d245315ace27c65369e15f7151d41d1',
  	        'cb474660ef35f5f2a41b643fa5e460575f4fa9b7962232a5c32f908318a04476',
  	      ],
  	      [
  	        '2600ca4b282cb986f85d0f1709979d8b44a09c07cb86d7c124497bc86f082120',
  	        '4119b88753c15bd6a693b03fcddbb45d5ac6be74ab5f0ef44b0be9475a7e4b40',
  	      ],
  	      [
  	        '7635ca72d7e8432c338ec53cd12220bc01c48685e24f7dc8c602a7746998e435',
  	        '91b649609489d613d1d5e590f78e6d74ecfc061d57048bad9e76f302c5b9c61',
  	      ],
  	      [
  	        '754e3239f325570cdbbf4a87deee8a66b7f2b33479d468fbc1a50743bf56cc18',
  	        '673fb86e5bda30fb3cd0ed304ea49a023ee33d0197a695d0c5d98093c536683',
  	      ],
  	      [
  	        'e3e6bd1071a1e96aff57859c82d570f0330800661d1c952f9fe2694691d9b9e8',
  	        '59c9e0bba394e76f40c0aa58379a3cb6a5a2283993e90c4167002af4920e37f5',
  	      ],
  	      [
  	        '186b483d056a033826ae73d88f732985c4ccb1f32ba35f4b4cc47fdcf04aa6eb',
  	        '3b952d32c67cf77e2e17446e204180ab21fb8090895138b4a4a797f86e80888b',
  	      ],
  	      [
  	        'df9d70a6b9876ce544c98561f4be4f725442e6d2b737d9c91a8321724ce0963f',
  	        '55eb2dafd84d6ccd5f862b785dc39d4ab157222720ef9da217b8c45cf2ba2417',
  	      ],
  	      [
  	        '5edd5cc23c51e87a497ca815d5dce0f8ab52554f849ed8995de64c5f34ce7143',
  	        'efae9c8dbc14130661e8cec030c89ad0c13c66c0d17a2905cdc706ab7399a868',
  	      ],
  	      [
  	        '290798c2b6476830da12fe02287e9e777aa3fba1c355b17a722d362f84614fba',
  	        'e38da76dcd440621988d00bcf79af25d5b29c094db2a23146d003afd41943e7a',
  	      ],
  	      [
  	        'af3c423a95d9f5b3054754efa150ac39cd29552fe360257362dfdecef4053b45',
  	        'f98a3fd831eb2b749a93b0e6f35cfb40c8cd5aa667a15581bc2feded498fd9c6',
  	      ],
  	      [
  	        '766dbb24d134e745cccaa28c99bf274906bb66b26dcf98df8d2fed50d884249a',
  	        '744b1152eacbe5e38dcc887980da38b897584a65fa06cedd2c924f97cbac5996',
  	      ],
  	      [
  	        '59dbf46f8c94759ba21277c33784f41645f7b44f6c596a58ce92e666191abe3e',
  	        'c534ad44175fbc300f4ea6ce648309a042ce739a7919798cd85e216c4a307f6e',
  	      ],
  	      [
  	        'f13ada95103c4537305e691e74e9a4a8dd647e711a95e73cb62dc6018cfd87b8',
  	        'e13817b44ee14de663bf4bc808341f326949e21a6a75c2570778419bdaf5733d',
  	      ],
  	      [
  	        '7754b4fa0e8aced06d4167a2c59cca4cda1869c06ebadfb6488550015a88522c',
  	        '30e93e864e669d82224b967c3020b8fa8d1e4e350b6cbcc537a48b57841163a2',
  	      ],
  	      [
  	        '948dcadf5990e048aa3874d46abef9d701858f95de8041d2a6828c99e2262519',
  	        'e491a42537f6e597d5d28a3224b1bc25df9154efbd2ef1d2cbba2cae5347d57e',
  	      ],
  	      [
  	        '7962414450c76c1689c7b48f8202ec37fb224cf5ac0bfa1570328a8a3d7c77ab',
  	        '100b610ec4ffb4760d5c1fc133ef6f6b12507a051f04ac5760afa5b29db83437',
  	      ],
  	      [
  	        '3514087834964b54b15b160644d915485a16977225b8847bb0dd085137ec47ca',
  	        'ef0afbb2056205448e1652c48e8127fc6039e77c15c2378b7e7d15a0de293311',
  	      ],
  	      [
  	        'd3cc30ad6b483e4bc79ce2c9dd8bc54993e947eb8df787b442943d3f7b527eaf',
  	        '8b378a22d827278d89c5e9be8f9508ae3c2ad46290358630afb34db04eede0a4',
  	      ],
  	      [
  	        '1624d84780732860ce1c78fcbfefe08b2b29823db913f6493975ba0ff4847610',
  	        '68651cf9b6da903e0914448c6cd9d4ca896878f5282be4c8cc06e2a404078575',
  	      ],
  	      [
  	        '733ce80da955a8a26902c95633e62a985192474b5af207da6df7b4fd5fc61cd4',
  	        'f5435a2bd2badf7d485a4d8b8db9fcce3e1ef8e0201e4578c54673bc1dc5ea1d',
  	      ],
  	      [
  	        '15d9441254945064cf1a1c33bbd3b49f8966c5092171e699ef258dfab81c045c',
  	        'd56eb30b69463e7234f5137b73b84177434800bacebfc685fc37bbe9efe4070d',
  	      ],
  	      [
  	        'a1d0fcf2ec9de675b612136e5ce70d271c21417c9d2b8aaaac138599d0717940',
  	        'edd77f50bcb5a3cab2e90737309667f2641462a54070f3d519212d39c197a629',
  	      ],
  	      [
  	        'e22fbe15c0af8ccc5780c0735f84dbe9a790badee8245c06c7ca37331cb36980',
  	        'a855babad5cd60c88b430a69f53a1a7a38289154964799be43d06d77d31da06',
  	      ],
  	      [
  	        '311091dd9860e8e20ee13473c1155f5f69635e394704eaa74009452246cfa9b3',
  	        '66db656f87d1f04fffd1f04788c06830871ec5a64feee685bd80f0b1286d8374',
  	      ],
  	      [
  	        '34c1fd04d301be89b31c0442d3e6ac24883928b45a9340781867d4232ec2dbdf',
  	        '9414685e97b1b5954bd46f730174136d57f1ceeb487443dc5321857ba73abee',
  	      ],
  	      [
  	        'f219ea5d6b54701c1c14de5b557eb42a8d13f3abbcd08affcc2a5e6b049b8d63',
  	        '4cb95957e83d40b0f73af4544cccf6b1f4b08d3c07b27fb8d8c2962a400766d1',
  	      ],
  	      [
  	        'd7b8740f74a8fbaab1f683db8f45de26543a5490bca627087236912469a0b448',
  	        'fa77968128d9c92ee1010f337ad4717eff15db5ed3c049b3411e0315eaa4593b',
  	      ],
  	      [
  	        '32d31c222f8f6f0ef86f7c98d3a3335ead5bcd32abdd94289fe4d3091aa824bf',
  	        '5f3032f5892156e39ccd3d7915b9e1da2e6dac9e6f26e961118d14b8462e1661',
  	      ],
  	      [
  	        '7461f371914ab32671045a155d9831ea8793d77cd59592c4340f86cbc18347b5',
  	        '8ec0ba238b96bec0cbdddcae0aa442542eee1ff50c986ea6b39847b3cc092ff6',
  	      ],
  	      [
  	        'ee079adb1df1860074356a25aa38206a6d716b2c3e67453d287698bad7b2b2d6',
  	        '8dc2412aafe3be5c4c5f37e0ecc5f9f6a446989af04c4e25ebaac479ec1c8c1e',
  	      ],
  	      [
  	        '16ec93e447ec83f0467b18302ee620f7e65de331874c9dc72bfd8616ba9da6b5',
  	        '5e4631150e62fb40d0e8c2a7ca5804a39d58186a50e497139626778e25b0674d',
  	      ],
  	      [
  	        'eaa5f980c245f6f038978290afa70b6bd8855897f98b6aa485b96065d537bd99',
  	        'f65f5d3e292c2e0819a528391c994624d784869d7e6ea67fb18041024edc07dc',
  	      ],
  	      [
  	        '78c9407544ac132692ee1910a02439958ae04877151342ea96c4b6b35a49f51',
  	        'f3e0319169eb9b85d5404795539a5e68fa1fbd583c064d2462b675f194a3ddb4',
  	      ],
  	      [
  	        '494f4be219a1a77016dcd838431aea0001cdc8ae7a6fc688726578d9702857a5',
  	        '42242a969283a5f339ba7f075e36ba2af925ce30d767ed6e55f4b031880d562c',
  	      ],
  	      [
  	        'a598a8030da6d86c6bc7f2f5144ea549d28211ea58faa70ebf4c1e665c1fe9b5',
  	        '204b5d6f84822c307e4b4a7140737aec23fc63b65b35f86a10026dbd2d864e6b',
  	      ],
  	      [
  	        'c41916365abb2b5d09192f5f2dbeafec208f020f12570a184dbadc3e58595997',
  	        '4f14351d0087efa49d245b328984989d5caf9450f34bfc0ed16e96b58fa9913',
  	      ],
  	      [
  	        '841d6063a586fa475a724604da03bc5b92a2e0d2e0a36acfe4c73a5514742881',
  	        '73867f59c0659e81904f9a1c7543698e62562d6744c169ce7a36de01a8d6154',
  	      ],
  	      [
  	        '5e95bb399a6971d376026947f89bde2f282b33810928be4ded112ac4d70e20d5',
  	        '39f23f366809085beebfc71181313775a99c9aed7d8ba38b161384c746012865',
  	      ],
  	      [
  	        '36e4641a53948fd476c39f8a99fd974e5ec07564b5315d8bf99471bca0ef2f66',
  	        'd2424b1b1abe4eb8164227b085c9aa9456ea13493fd563e06fd51cf5694c78fc',
  	      ],
  	      [
  	        '336581ea7bfbbb290c191a2f507a41cf5643842170e914faeab27c2c579f726',
  	        'ead12168595fe1be99252129b6e56b3391f7ab1410cd1e0ef3dcdcabd2fda224',
  	      ],
  	      [
  	        '8ab89816dadfd6b6a1f2634fcf00ec8403781025ed6890c4849742706bd43ede',
  	        '6fdcef09f2f6d0a044e654aef624136f503d459c3e89845858a47a9129cdd24e',
  	      ],
  	      [
  	        '1e33f1a746c9c5778133344d9299fcaa20b0938e8acff2544bb40284b8c5fb94',
  	        '60660257dd11b3aa9c8ed618d24edff2306d320f1d03010e33a7d2057f3b3b6',
  	      ],
  	      [
  	        '85b7c1dcb3cec1b7ee7f30ded79dd20a0ed1f4cc18cbcfcfa410361fd8f08f31',
  	        '3d98a9cdd026dd43f39048f25a8847f4fcafad1895d7a633c6fed3c35e999511',
  	      ],
  	      [
  	        '29df9fbd8d9e46509275f4b125d6d45d7fbe9a3b878a7af872a2800661ac5f51',
  	        'b4c4fe99c775a606e2d8862179139ffda61dc861c019e55cd2876eb2a27d84b',
  	      ],
  	      [
  	        'a0b1cae06b0a847a3fea6e671aaf8adfdfe58ca2f768105c8082b2e449fce252',
  	        'ae434102edde0958ec4b19d917a6a28e6b72da1834aff0e650f049503a296cf2',
  	      ],
  	      [
  	        '4e8ceafb9b3e9a136dc7ff67e840295b499dfb3b2133e4ba113f2e4c0e121e5',
  	        'cf2174118c8b6d7a4b48f6d534ce5c79422c086a63460502b827ce62a326683c',
  	      ],
  	      [
  	        'd24a44e047e19b6f5afb81c7ca2f69080a5076689a010919f42725c2b789a33b',
  	        '6fb8d5591b466f8fc63db50f1c0f1c69013f996887b8244d2cdec417afea8fa3',
  	      ],
  	      [
  	        'ea01606a7a6c9cdd249fdfcfacb99584001edd28abbab77b5104e98e8e3b35d4',
  	        '322af4908c7312b0cfbfe369f7a7b3cdb7d4494bc2823700cfd652188a3ea98d',
  	      ],
  	      [
  	        'af8addbf2b661c8a6c6328655eb96651252007d8c5ea31be4ad196de8ce2131f',
  	        '6749e67c029b85f52a034eafd096836b2520818680e26ac8f3dfbcdb71749700',
  	      ],
  	      [
  	        'e3ae1974566ca06cc516d47e0fb165a674a3dabcfca15e722f0e3450f45889',
  	        '2aeabe7e4531510116217f07bf4d07300de97e4874f81f533420a72eeb0bd6a4',
  	      ],
  	      [
  	        '591ee355313d99721cf6993ffed1e3e301993ff3ed258802075ea8ced397e246',
  	        'b0ea558a113c30bea60fc4775460c7901ff0b053d25ca2bdeee98f1a4be5d196',
  	      ],
  	      [
  	        '11396d55fda54c49f19aa97318d8da61fa8584e47b084945077cf03255b52984',
  	        '998c74a8cd45ac01289d5833a7beb4744ff536b01b257be4c5767bea93ea57a4',
  	      ],
  	      [
  	        '3c5d2a1ba39c5a1790000738c9e0c40b8dcdfd5468754b6405540157e017aa7a',
  	        'b2284279995a34e2f9d4de7396fc18b80f9b8b9fdd270f6661f79ca4c81bd257',
  	      ],
  	      [
  	        'cc8704b8a60a0defa3a99a7299f2e9c3fbc395afb04ac078425ef8a1793cc030',
  	        'bdd46039feed17881d1e0862db347f8cf395b74fc4bcdc4e940b74e3ac1f1b13',
  	      ],
  	      [
  	        'c533e4f7ea8555aacd9777ac5cad29b97dd4defccc53ee7ea204119b2889b197',
  	        '6f0a256bc5efdf429a2fb6242f1a43a2d9b925bb4a4b3a26bb8e0f45eb596096',
  	      ],
  	      [
  	        'c14f8f2ccb27d6f109f6d08d03cc96a69ba8c34eec07bbcf566d48e33da6593',
  	        'c359d6923bb398f7fd4473e16fe1c28475b740dd098075e6c0e8649113dc3a38',
  	      ],
  	      [
  	        'a6cbc3046bc6a450bac24789fa17115a4c9739ed75f8f21ce441f72e0b90e6ef',
  	        '21ae7f4680e889bb130619e2c0f95a360ceb573c70603139862afd617fa9b9f',
  	      ],
  	      [
  	        '347d6d9a02c48927ebfb86c1359b1caf130a3c0267d11ce6344b39f99d43cc38',
  	        '60ea7f61a353524d1c987f6ecec92f086d565ab687870cb12689ff1e31c74448',
  	      ],
  	      [
  	        'da6545d2181db8d983f7dcb375ef5866d47c67b1bf31c8cf855ef7437b72656a',
  	        '49b96715ab6878a79e78f07ce5680c5d6673051b4935bd897fea824b77dc208a',
  	      ],
  	      [
  	        'c40747cc9d012cb1a13b8148309c6de7ec25d6945d657146b9d5994b8feb1111',
  	        '5ca560753be2a12fc6de6caf2cb489565db936156b9514e1bb5e83037e0fa2d4',
  	      ],
  	      [
  	        '4e42c8ec82c99798ccf3a610be870e78338c7f713348bd34c8203ef4037f3502',
  	        '7571d74ee5e0fb92a7a8b33a07783341a5492144cc54bcc40a94473693606437',
  	      ],
  	      [
  	        '3775ab7089bc6af823aba2e1af70b236d251cadb0c86743287522a1b3b0dedea',
  	        'be52d107bcfa09d8bcb9736a828cfa7fac8db17bf7a76a2c42ad961409018cf7',
  	      ],
  	      [
  	        'cee31cbf7e34ec379d94fb814d3d775ad954595d1314ba8846959e3e82f74e26',
  	        '8fd64a14c06b589c26b947ae2bcf6bfa0149ef0be14ed4d80f448a01c43b1c6d',
  	      ],
  	      [
  	        'b4f9eaea09b6917619f6ea6a4eb5464efddb58fd45b1ebefcdc1a01d08b47986',
  	        '39e5c9925b5a54b07433a4f18c61726f8bb131c012ca542eb24a8ac07200682a',
  	      ],
  	      [
  	        'd4263dfc3d2df923a0179a48966d30ce84e2515afc3dccc1b77907792ebcc60e',
  	        '62dfaf07a0f78feb30e30d6295853ce189e127760ad6cf7fae164e122a208d54',
  	      ],
  	      [
  	        '48457524820fa65a4f8d35eb6930857c0032acc0a4a2de422233eeda897612c4',
  	        '25a748ab367979d98733c38a1fa1c2e7dc6cc07db2d60a9ae7a76aaa49bd0f77',
  	      ],
  	      [
  	        'dfeeef1881101f2cb11644f3a2afdfc2045e19919152923f367a1767c11cceda',
  	        'ecfb7056cf1de042f9420bab396793c0c390bde74b4bbdff16a83ae09a9a7517',
  	      ],
  	      [
  	        '6d7ef6b17543f8373c573f44e1f389835d89bcbc6062ced36c82df83b8fae859',
  	        'cd450ec335438986dfefa10c57fea9bcc521a0959b2d80bbf74b190dca712d10',
  	      ],
  	      [
  	        'e75605d59102a5a2684500d3b991f2e3f3c88b93225547035af25af66e04541f',
  	        'f5c54754a8f71ee540b9b48728473e314f729ac5308b06938360990e2bfad125',
  	      ],
  	      [
  	        'eb98660f4c4dfaa06a2be453d5020bc99a0c2e60abe388457dd43fefb1ed620c',
  	        '6cb9a8876d9cb8520609af3add26cd20a0a7cd8a9411131ce85f44100099223e',
  	      ],
  	      [
  	        '13e87b027d8514d35939f2e6892b19922154596941888336dc3563e3b8dba942',
  	        'fef5a3c68059a6dec5d624114bf1e91aac2b9da568d6abeb2570d55646b8adf1',
  	      ],
  	      [
  	        'ee163026e9fd6fe017c38f06a5be6fc125424b371ce2708e7bf4491691e5764a',
  	        '1acb250f255dd61c43d94ccc670d0f58f49ae3fa15b96623e5430da0ad6c62b2',
  	      ],
  	      [
  	        'b268f5ef9ad51e4d78de3a750c2dc89b1e626d43505867999932e5db33af3d80',
  	        '5f310d4b3c99b9ebb19f77d41c1dee018cf0d34fd4191614003e945a1216e423',
  	      ],
  	      [
  	        'ff07f3118a9df035e9fad85eb6c7bfe42b02f01ca99ceea3bf7ffdba93c4750d',
  	        '438136d603e858a3a5c440c38eccbaddc1d2942114e2eddd4740d098ced1f0d8',
  	      ],
  	      [
  	        '8d8b9855c7c052a34146fd20ffb658bea4b9f69e0d825ebec16e8c3ce2b526a1',
  	        'cdb559eedc2d79f926baf44fb84ea4d44bcf50fee51d7ceb30e2e7f463036758',
  	      ],
  	      [
  	        '52db0b5384dfbf05bfa9d472d7ae26dfe4b851ceca91b1eba54263180da32b63',
  	        'c3b997d050ee5d423ebaf66a6db9f57b3180c902875679de924b69d84a7b375',
  	      ],
  	      [
  	        'e62f9490d3d51da6395efd24e80919cc7d0f29c3f3fa48c6fff543becbd43352',
  	        '6d89ad7ba4876b0b22c2ca280c682862f342c8591f1daf5170e07bfd9ccafa7d',
  	      ],
  	      [
  	        '7f30ea2476b399b4957509c88f77d0191afa2ff5cb7b14fd6d8e7d65aaab1193',
  	        'ca5ef7d4b231c94c3b15389a5f6311e9daff7bb67b103e9880ef4bff637acaec',
  	      ],
  	      [
  	        '5098ff1e1d9f14fb46a210fada6c903fef0fb7b4a1dd1d9ac60a0361800b7a00',
  	        '9731141d81fc8f8084d37c6e7542006b3ee1b40d60dfe5362a5b132fd17ddc0',
  	      ],
  	      [
  	        '32b78c7de9ee512a72895be6b9cbefa6e2f3c4ccce445c96b9f2c81e2778ad58',
  	        'ee1849f513df71e32efc3896ee28260c73bb80547ae2275ba497237794c8753c',
  	      ],
  	      [
  	        'e2cb74fddc8e9fbcd076eef2a7c72b0ce37d50f08269dfc074b581550547a4f7',
  	        'd3aa2ed71c9dd2247a62df062736eb0baddea9e36122d2be8641abcb005cc4a4',
  	      ],
  	      [
  	        '8438447566d4d7bedadc299496ab357426009a35f235cb141be0d99cd10ae3a8',
  	        'c4e1020916980a4da5d01ac5e6ad330734ef0d7906631c4f2390426b2edd791f',
  	      ],
  	      [
  	        '4162d488b89402039b584c6fc6c308870587d9c46f660b878ab65c82c711d67e',
  	        '67163e903236289f776f22c25fb8a3afc1732f2b84b4e95dbda47ae5a0852649',
  	      ],
  	      [
  	        '3fad3fa84caf0f34f0f89bfd2dcf54fc175d767aec3e50684f3ba4a4bf5f683d',
  	        'cd1bc7cb6cc407bb2f0ca647c718a730cf71872e7d0d2a53fa20efcdfe61826',
  	      ],
  	      [
  	        '674f2600a3007a00568c1a7ce05d0816c1fb84bf1370798f1c69532faeb1a86b',
  	        '299d21f9413f33b3edf43b257004580b70db57da0b182259e09eecc69e0d38a5',
  	      ],
  	      [
  	        'd32f4da54ade74abb81b815ad1fb3b263d82d6c692714bcff87d29bd5ee9f08f',
  	        'f9429e738b8e53b968e99016c059707782e14f4535359d582fc416910b3eea87',
  	      ],
  	      [
  	        '30e4e670435385556e593657135845d36fbb6931f72b08cb1ed954f1e3ce3ff6',
  	        '462f9bce619898638499350113bbc9b10a878d35da70740dc695a559eb88db7b',
  	      ],
  	      [
  	        'be2062003c51cc3004682904330e4dee7f3dcd10b01e580bf1971b04d4cad297',
  	        '62188bc49d61e5428573d48a74e1c655b1c61090905682a0d5558ed72dccb9bc',
  	      ],
  	      [
  	        '93144423ace3451ed29e0fb9ac2af211cb6e84a601df5993c419859fff5df04a',
  	        '7c10dfb164c3425f5c71a3f9d7992038f1065224f72bb9d1d902a6d13037b47c',
  	      ],
  	      [
  	        'b015f8044f5fcbdcf21ca26d6c34fb8197829205c7b7d2a7cb66418c157b112c',
  	        'ab8c1e086d04e813744a655b2df8d5f83b3cdc6faa3088c1d3aea1454e3a1d5f',
  	      ],
  	      [
  	        'd5e9e1da649d97d89e4868117a465a3a4f8a18de57a140d36b3f2af341a21b52',
  	        '4cb04437f391ed73111a13cc1d4dd0db1693465c2240480d8955e8592f27447a',
  	      ],
  	      [
  	        'd3ae41047dd7ca065dbf8ed77b992439983005cd72e16d6f996a5316d36966bb',
  	        'bd1aeb21ad22ebb22a10f0303417c6d964f8cdd7df0aca614b10dc14d125ac46',
  	      ],
  	      [
  	        '463e2763d885f958fc66cdd22800f0a487197d0a82e377b49f80af87c897b065',
  	        'bfefacdb0e5d0fd7df3a311a94de062b26b80c61fbc97508b79992671ef7ca7f',
  	      ],
  	      [
  	        '7985fdfd127c0567c6f53ec1bb63ec3158e597c40bfe747c83cddfc910641917',
  	        '603c12daf3d9862ef2b25fe1de289aed24ed291e0ec6708703a5bd567f32ed03',
  	      ],
  	      [
  	        '74a1ad6b5f76e39db2dd249410eac7f99e74c59cb83d2d0ed5ff1543da7703e9',
  	        'cc6157ef18c9c63cd6193d83631bbea0093e0968942e8c33d5737fd790e0db08',
  	      ],
  	      [
  	        '30682a50703375f602d416664ba19b7fc9bab42c72747463a71d0896b22f6da3',
  	        '553e04f6b018b4fa6c8f39e7f311d3176290d0e0f19ca73f17714d9977a22ff8',
  	      ],
  	      [
  	        '9e2158f0d7c0d5f26c3791efefa79597654e7a2b2464f52b1ee6c1347769ef57',
  	        '712fcdd1b9053f09003a3481fa7762e9ffd7c8ef35a38509e2fbf2629008373',
  	      ],
  	      [
  	        '176e26989a43c9cfeba4029c202538c28172e566e3c4fce7322857f3be327d66',
  	        'ed8cc9d04b29eb877d270b4878dc43c19aefd31f4eee09ee7b47834c1fa4b1c3',
  	      ],
  	      [
  	        '75d46efea3771e6e68abb89a13ad747ecf1892393dfc4f1b7004788c50374da8',
  	        '9852390a99507679fd0b86fd2b39a868d7efc22151346e1a3ca4726586a6bed8',
  	      ],
  	      [
  	        '809a20c67d64900ffb698c4c825f6d5f2310fb0451c869345b7319f645605721',
  	        '9e994980d9917e22b76b061927fa04143d096ccc54963e6a5ebfa5f3f8e286c1',
  	      ],
  	      [
  	        '1b38903a43f7f114ed4500b4eac7083fdefece1cf29c63528d563446f972c180',
  	        '4036edc931a60ae889353f77fd53de4a2708b26b6f5da72ad3394119daf408f9',
  	      ],
  	    ],
  	  },
  	};
  	return secp256k1;
  }

  (function (exports) {

  	var curves = exports;

  	var hash = hash$3;
  	var curve$1 = curve;
  	var utils = utils$m;

  	var assert = utils.assert;

  	function PresetCurve(options) {
  	  if (options.type === 'short')
  	    this.curve = new curve$1.short(options);
  	  else if (options.type === 'edwards')
  	    this.curve = new curve$1.edwards(options);
  	  else
  	    this.curve = new curve$1.mont(options);
  	  this.g = this.curve.g;
  	  this.n = this.curve.n;
  	  this.hash = options.hash;

  	  assert(this.g.validate(), 'Invalid curve');
  	  assert(this.g.mul(this.n).isInfinity(), 'Invalid curve, G*N != O');
  	}
  	curves.PresetCurve = PresetCurve;

  	function defineCurve(name, options) {
  	  Object.defineProperty(curves, name, {
  	    configurable: true,
  	    enumerable: true,
  	    get: function() {
  	      var curve = new PresetCurve(options);
  	      Object.defineProperty(curves, name, {
  	        configurable: true,
  	        enumerable: true,
  	        value: curve,
  	      });
  	      return curve;
  	    },
  	  });
  	}

  	defineCurve('p192', {
  	  type: 'short',
  	  prime: 'p192',
  	  p: 'ffffffff ffffffff ffffffff fffffffe ffffffff ffffffff',
  	  a: 'ffffffff ffffffff ffffffff fffffffe ffffffff fffffffc',
  	  b: '64210519 e59c80e7 0fa7e9ab 72243049 feb8deec c146b9b1',
  	  n: 'ffffffff ffffffff ffffffff 99def836 146bc9b1 b4d22831',
  	  hash: hash.sha256,
  	  gRed: false,
  	  g: [
  	    '188da80e b03090f6 7cbf20eb 43a18800 f4ff0afd 82ff1012',
  	    '07192b95 ffc8da78 631011ed 6b24cdd5 73f977a1 1e794811',
  	  ],
  	});

  	defineCurve('p224', {
  	  type: 'short',
  	  prime: 'p224',
  	  p: 'ffffffff ffffffff ffffffff ffffffff 00000000 00000000 00000001',
  	  a: 'ffffffff ffffffff ffffffff fffffffe ffffffff ffffffff fffffffe',
  	  b: 'b4050a85 0c04b3ab f5413256 5044b0b7 d7bfd8ba 270b3943 2355ffb4',
  	  n: 'ffffffff ffffffff ffffffff ffff16a2 e0b8f03e 13dd2945 5c5c2a3d',
  	  hash: hash.sha256,
  	  gRed: false,
  	  g: [
  	    'b70e0cbd 6bb4bf7f 321390b9 4a03c1d3 56c21122 343280d6 115c1d21',
  	    'bd376388 b5f723fb 4c22dfe6 cd4375a0 5a074764 44d58199 85007e34',
  	  ],
  	});

  	defineCurve('p256', {
  	  type: 'short',
  	  prime: null,
  	  p: 'ffffffff 00000001 00000000 00000000 00000000 ffffffff ffffffff ffffffff',
  	  a: 'ffffffff 00000001 00000000 00000000 00000000 ffffffff ffffffff fffffffc',
  	  b: '5ac635d8 aa3a93e7 b3ebbd55 769886bc 651d06b0 cc53b0f6 3bce3c3e 27d2604b',
  	  n: 'ffffffff 00000000 ffffffff ffffffff bce6faad a7179e84 f3b9cac2 fc632551',
  	  hash: hash.sha256,
  	  gRed: false,
  	  g: [
  	    '6b17d1f2 e12c4247 f8bce6e5 63a440f2 77037d81 2deb33a0 f4a13945 d898c296',
  	    '4fe342e2 fe1a7f9b 8ee7eb4a 7c0f9e16 2bce3357 6b315ece cbb64068 37bf51f5',
  	  ],
  	});

  	defineCurve('p384', {
  	  type: 'short',
  	  prime: null,
  	  p: 'ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ' +
  	     'fffffffe ffffffff 00000000 00000000 ffffffff',
  	  a: 'ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ' +
  	     'fffffffe ffffffff 00000000 00000000 fffffffc',
  	  b: 'b3312fa7 e23ee7e4 988e056b e3f82d19 181d9c6e fe814112 0314088f ' +
  	     '5013875a c656398d 8a2ed19d 2a85c8ed d3ec2aef',
  	  n: 'ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff c7634d81 ' +
  	     'f4372ddf 581a0db2 48b0a77a ecec196a ccc52973',
  	  hash: hash.sha384,
  	  gRed: false,
  	  g: [
  	    'aa87ca22 be8b0537 8eb1c71e f320ad74 6e1d3b62 8ba79b98 59f741e0 82542a38 ' +
  	    '5502f25d bf55296c 3a545e38 72760ab7',
  	    '3617de4a 96262c6f 5d9e98bf 9292dc29 f8f41dbd 289a147c e9da3113 b5f0b8c0 ' +
  	    '0a60b1ce 1d7e819d 7a431d7c 90ea0e5f',
  	  ],
  	});

  	defineCurve('p521', {
  	  type: 'short',
  	  prime: null,
  	  p: '000001ff ffffffff ffffffff ffffffff ffffffff ffffffff ' +
  	     'ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ' +
  	     'ffffffff ffffffff ffffffff ffffffff ffffffff',
  	  a: '000001ff ffffffff ffffffff ffffffff ffffffff ffffffff ' +
  	     'ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff ' +
  	     'ffffffff ffffffff ffffffff ffffffff fffffffc',
  	  b: '00000051 953eb961 8e1c9a1f 929a21a0 b68540ee a2da725b ' +
  	     '99b315f3 b8b48991 8ef109e1 56193951 ec7e937b 1652c0bd ' +
  	     '3bb1bf07 3573df88 3d2c34f1 ef451fd4 6b503f00',
  	  n: '000001ff ffffffff ffffffff ffffffff ffffffff ffffffff ' +
  	     'ffffffff ffffffff fffffffa 51868783 bf2f966b 7fcc0148 ' +
  	     'f709a5d0 3bb5c9b8 899c47ae bb6fb71e 91386409',
  	  hash: hash.sha512,
  	  gRed: false,
  	  g: [
  	    '000000c6 858e06b7 0404e9cd 9e3ecb66 2395b442 9c648139 ' +
  	    '053fb521 f828af60 6b4d3dba a14b5e77 efe75928 fe1dc127 ' +
  	    'a2ffa8de 3348b3c1 856a429b f97e7e31 c2e5bd66',
  	    '00000118 39296a78 9a3bc004 5c8a5fb4 2c7d1bd9 98f54449 ' +
  	    '579b4468 17afbd17 273e662c 97ee7299 5ef42640 c550b901 ' +
  	    '3fad0761 353c7086 a272c240 88be9476 9fd16650',
  	  ],
  	});

  	defineCurve('curve25519', {
  	  type: 'mont',
  	  prime: 'p25519',
  	  p: '7fffffffffffffff ffffffffffffffff ffffffffffffffff ffffffffffffffed',
  	  a: '76d06',
  	  b: '1',
  	  n: '1000000000000000 0000000000000000 14def9dea2f79cd6 5812631a5cf5d3ed',
  	  hash: hash.sha256,
  	  gRed: false,
  	  g: [
  	    '9',
  	  ],
  	});

  	defineCurve('ed25519', {
  	  type: 'edwards',
  	  prime: 'p25519',
  	  p: '7fffffffffffffff ffffffffffffffff ffffffffffffffff ffffffffffffffed',
  	  a: '-1',
  	  c: '1',
  	  // -121665 * (121666^(-1)) (mod P)
  	  d: '52036cee2b6ffe73 8cc740797779e898 00700a4d4141d8ab 75eb4dca135978a3',
  	  n: '1000000000000000 0000000000000000 14def9dea2f79cd6 5812631a5cf5d3ed',
  	  hash: hash.sha256,
  	  gRed: false,
  	  g: [
  	    '216936d3cd6e53fec0a4e231fdd6dc5c692cc7609525a7b2c9562d608f25d51a',

  	    // 4/5
  	    '6666666666666666666666666666666666666666666666666666666666666658',
  	  ],
  	});

  	var pre;
  	try {
  	  pre = requireSecp256k1();
  	} catch (e) {
  	  pre = undefined;
  	}

  	defineCurve('secp256k1', {
  	  type: 'short',
  	  prime: 'k256',
  	  p: 'ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff fffffffe fffffc2f',
  	  a: '0',
  	  b: '7',
  	  n: 'ffffffff ffffffff ffffffff fffffffe baaedce6 af48a03b bfd25e8c d0364141',
  	  h: '1',
  	  hash: hash.sha256,

  	  // Precomputed endomorphism
  	  beta: '7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee',
  	  lambda: '5363ad4cc05c30e0a5261c028812645a122e22ea20816678df02967c1b23bd72',
  	  basis: [
  	    {
  	      a: '3086d221a7d46bcde86c90e49284eb15',
  	      b: '-e4437ed6010e88286f547fa90abfe4c3',
  	    },
  	    {
  	      a: '114ca50f7a8e2f3f657c1108d9d44cfd8',
  	      b: '3086d221a7d46bcde86c90e49284eb15',
  	    },
  	  ],

  	  gRed: false,
  	  g: [
  	    '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
  	    '483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8',
  	    pre,
  	  ],
  	});
  } (curves$2));

  var hash$2 = hash$3;
  var utils$6 = utils$l;
  var assert$8 = minimalisticAssert;

  function HmacDRBG$1(options) {
    if (!(this instanceof HmacDRBG$1))
      return new HmacDRBG$1(options);
    this.hash = options.hash;
    this.predResist = !!options.predResist;

    this.outLen = this.hash.outSize;
    this.minEntropy = options.minEntropy || this.hash.hmacStrength;

    this._reseed = null;
    this.reseedInterval = null;
    this.K = null;
    this.V = null;

    var entropy = utils$6.toArray(options.entropy, options.entropyEnc || 'hex');
    var nonce = utils$6.toArray(options.nonce, options.nonceEnc || 'hex');
    var pers = utils$6.toArray(options.pers, options.persEnc || 'hex');
    assert$8(entropy.length >= (this.minEntropy / 8),
           'Not enough entropy. Minimum is: ' + this.minEntropy + ' bits');
    this._init(entropy, nonce, pers);
  }
  var hmacDrbg = HmacDRBG$1;

  HmacDRBG$1.prototype._init = function init(entropy, nonce, pers) {
    var seed = entropy.concat(nonce).concat(pers);

    this.K = new Array(this.outLen / 8);
    this.V = new Array(this.outLen / 8);
    for (var i = 0; i < this.V.length; i++) {
      this.K[i] = 0x00;
      this.V[i] = 0x01;
    }

    this._update(seed);
    this._reseed = 1;
    this.reseedInterval = 0x1000000000000;  // 2^48
  };

  HmacDRBG$1.prototype._hmac = function hmac() {
    return new hash$2.hmac(this.hash, this.K);
  };

  HmacDRBG$1.prototype._update = function update(seed) {
    var kmac = this._hmac()
                   .update(this.V)
                   .update([ 0x00 ]);
    if (seed)
      kmac = kmac.update(seed);
    this.K = kmac.digest();
    this.V = this._hmac().update(this.V).digest();
    if (!seed)
      return;

    this.K = this._hmac()
                 .update(this.V)
                 .update([ 0x01 ])
                 .update(seed)
                 .digest();
    this.V = this._hmac().update(this.V).digest();
  };

  HmacDRBG$1.prototype.reseed = function reseed(entropy, entropyEnc, add, addEnc) {
    // Optional entropy enc
    if (typeof entropyEnc !== 'string') {
      addEnc = add;
      add = entropyEnc;
      entropyEnc = null;
    }

    entropy = utils$6.toArray(entropy, entropyEnc);
    add = utils$6.toArray(add, addEnc);

    assert$8(entropy.length >= (this.minEntropy / 8),
           'Not enough entropy. Minimum is: ' + this.minEntropy + ' bits');

    this._update(entropy.concat(add || []));
    this._reseed = 1;
  };

  HmacDRBG$1.prototype.generate = function generate(len, enc, add, addEnc) {
    if (this._reseed > this.reseedInterval)
      throw new Error('Reseed is required');

    // Optional encoding
    if (typeof enc !== 'string') {
      addEnc = add;
      add = enc;
      enc = null;
    }

    // Optional additional data
    if (add) {
      add = utils$6.toArray(add, addEnc || 'hex');
      this._update(add);
    }

    var temp = [];
    while (temp.length < len) {
      this.V = this._hmac().update(this.V).digest();
      temp = temp.concat(this.V);
    }

    var res = temp.slice(0, len);
    this._update(add);
    this._reseed++;
    return utils$6.encode(res, enc);
  };

  var BN$a = bn$2.exports;
  var utils$5 = utils$m;
  var assert$7 = utils$5.assert;

  function KeyPair$3(ec, options) {
    this.ec = ec;
    this.priv = null;
    this.pub = null;

    // KeyPair(ec, { priv: ..., pub: ... })
    if (options.priv)
      this._importPrivate(options.priv, options.privEnc);
    if (options.pub)
      this._importPublic(options.pub, options.pubEnc);
  }
  var key$1 = KeyPair$3;

  KeyPair$3.fromPublic = function fromPublic(ec, pub, enc) {
    if (pub instanceof KeyPair$3)
      return pub;

    return new KeyPair$3(ec, {
      pub: pub,
      pubEnc: enc,
    });
  };

  KeyPair$3.fromPrivate = function fromPrivate(ec, priv, enc) {
    if (priv instanceof KeyPair$3)
      return priv;

    return new KeyPair$3(ec, {
      priv: priv,
      privEnc: enc,
    });
  };

  KeyPair$3.prototype.validate = function validate() {
    var pub = this.getPublic();

    if (pub.isInfinity())
      return { result: false, reason: 'Invalid public key' };
    if (!pub.validate())
      return { result: false, reason: 'Public key is not a point' };
    if (!pub.mul(this.ec.curve.n).isInfinity())
      return { result: false, reason: 'Public key * N != O' };

    return { result: true, reason: null };
  };

  KeyPair$3.prototype.getPublic = function getPublic(compact, enc) {
    // compact is optional argument
    if (typeof compact === 'string') {
      enc = compact;
      compact = null;
    }

    if (!this.pub)
      this.pub = this.ec.g.mul(this.priv);

    if (!enc)
      return this.pub;

    return this.pub.encode(enc, compact);
  };

  KeyPair$3.prototype.getPrivate = function getPrivate(enc) {
    if (enc === 'hex')
      return this.priv.toString(16, 2);
    else
      return this.priv;
  };

  KeyPair$3.prototype._importPrivate = function _importPrivate(key, enc) {
    this.priv = new BN$a(key, enc || 16);

    // Ensure that the priv won't be bigger than n, otherwise we may fail
    // in fixed multiplication method
    this.priv = this.priv.umod(this.ec.curve.n);
  };

  KeyPair$3.prototype._importPublic = function _importPublic(key, enc) {
    if (key.x || key.y) {
      // Montgomery points only have an `x` coordinate.
      // Weierstrass/Edwards points on the other hand have both `x` and
      // `y` coordinates.
      if (this.ec.curve.type === 'mont') {
        assert$7(key.x, 'Need x coordinate');
      } else if (this.ec.curve.type === 'short' ||
                 this.ec.curve.type === 'edwards') {
        assert$7(key.x && key.y, 'Need both x and y coordinate');
      }
      this.pub = this.ec.curve.point(key.x, key.y);
      return;
    }
    this.pub = this.ec.curve.decodePoint(key, enc);
  };

  // ECDH
  KeyPair$3.prototype.derive = function derive(pub) {
    if(!pub.validate()) {
      assert$7(pub.validate(), 'public point not validated');
    }
    return pub.mul(this.priv).getX();
  };

  // ECDSA
  KeyPair$3.prototype.sign = function sign(msg, enc, options) {
    return this.ec.sign(msg, this, enc, options);
  };

  KeyPair$3.prototype.verify = function verify(msg, signature) {
    return this.ec.verify(msg, signature, this);
  };

  KeyPair$3.prototype.inspect = function inspect() {
    return '<Key priv: ' + (this.priv && this.priv.toString(16, 2)) +
           ' pub: ' + (this.pub && this.pub.inspect()) + ' >';
  };

  var BN$9 = bn$2.exports;

  var utils$4 = utils$m;
  var assert$6 = utils$4.assert;

  function Signature$4(options, enc) {
    if (options instanceof Signature$4)
      return options;

    if (this._importDER(options, enc))
      return;

    assert$6(options.r && options.s, 'Signature without r or s');
    this.r = new BN$9(options.r, 16);
    this.s = new BN$9(options.s, 16);
    if (options.recoveryParam === undefined)
      this.recoveryParam = null;
    else
      this.recoveryParam = options.recoveryParam;
  }
  var signature$3 = Signature$4;

  function Position() {
    this.place = 0;
  }

  function getLength(buf, p) {
    var initial = buf[p.place++];
    if (!(initial & 0x80)) {
      return initial;
    }
    var octetLen = initial & 0xf;

    // Indefinite length or overflow
    if (octetLen === 0 || octetLen > 4) {
      return false;
    }

    var val = 0;
    for (var i = 0, off = p.place; i < octetLen; i++, off++) {
      val <<= 8;
      val |= buf[off];
      val >>>= 0;
    }

    // Leading zeroes
    if (val <= 0x7f) {
      return false;
    }

    p.place = off;
    return val;
  }

  function rmPadding(buf) {
    var i = 0;
    var len = buf.length - 1;
    while (!buf[i] && !(buf[i + 1] & 0x80) && i < len) {
      i++;
    }
    if (i === 0) {
      return buf;
    }
    return buf.slice(i);
  }

  Signature$4.prototype._importDER = function _importDER(data, enc) {
    data = utils$4.toArray(data, enc);
    var p = new Position();
    if (data[p.place++] !== 0x30) {
      return false;
    }
    var len = getLength(data, p);
    if (len === false) {
      return false;
    }
    if ((len + p.place) !== data.length) {
      return false;
    }
    if (data[p.place++] !== 0x02) {
      return false;
    }
    var rlen = getLength(data, p);
    if (rlen === false) {
      return false;
    }
    var r = data.slice(p.place, rlen + p.place);
    p.place += rlen;
    if (data[p.place++] !== 0x02) {
      return false;
    }
    var slen = getLength(data, p);
    if (slen === false) {
      return false;
    }
    if (data.length !== slen + p.place) {
      return false;
    }
    var s = data.slice(p.place, slen + p.place);
    if (r[0] === 0) {
      if (r[1] & 0x80) {
        r = r.slice(1);
      } else {
        // Leading zeroes
        return false;
      }
    }
    if (s[0] === 0) {
      if (s[1] & 0x80) {
        s = s.slice(1);
      } else {
        // Leading zeroes
        return false;
      }
    }

    this.r = new BN$9(r);
    this.s = new BN$9(s);
    this.recoveryParam = null;

    return true;
  };

  function constructLength(arr, len) {
    if (len < 0x80) {
      arr.push(len);
      return;
    }
    var octets = 1 + (Math.log(len) / Math.LN2 >>> 3);
    arr.push(octets | 0x80);
    while (--octets) {
      arr.push((len >>> (octets << 3)) & 0xff);
    }
    arr.push(len);
  }

  Signature$4.prototype.toDER = function toDER(enc) {
    var r = this.r.toArray();
    var s = this.s.toArray();

    // Pad values
    if (r[0] & 0x80)
      r = [ 0 ].concat(r);
    // Pad values
    if (s[0] & 0x80)
      s = [ 0 ].concat(s);

    r = rmPadding(r);
    s = rmPadding(s);

    while (!s[0] && !(s[1] & 0x80)) {
      s = s.slice(1);
    }
    var arr = [ 0x02 ];
    constructLength(arr, r.length);
    arr = arr.concat(r);
    arr.push(0x02);
    constructLength(arr, s.length);
    var backHalf = arr.concat(s);
    var res = [ 0x30 ];
    constructLength(res, backHalf.length);
    res = res.concat(backHalf);
    return utils$4.encode(res, enc);
  };

  var BN$8 = bn$2.exports;
  var HmacDRBG = hmacDrbg;
  var utils$3 = utils$m;
  var curves$1 = curves$2;
  var rand = brorand.exports;
  var assert$5 = utils$3.assert;

  var KeyPair$2 = key$1;
  var Signature$3 = signature$3;

  function EC$1(options) {
    if (!(this instanceof EC$1))
      return new EC$1(options);

    // Shortcut `elliptic.ec(curve-name)`
    if (typeof options === 'string') {
      assert$5(Object.prototype.hasOwnProperty.call(curves$1, options),
        'Unknown curve ' + options);

      options = curves$1[options];
    }

    // Shortcut for `elliptic.ec(elliptic.curves.curveName)`
    if (options instanceof curves$1.PresetCurve)
      options = { curve: options };

    this.curve = options.curve.curve;
    this.n = this.curve.n;
    this.nh = this.n.ushrn(1);
    this.g = this.curve.g;

    // Point on curve
    this.g = options.curve.g;
    this.g.precompute(options.curve.n.bitLength() + 1);

    // Hash for function for DRBG
    this.hash = options.hash || options.curve.hash;
  }
  var ec$1 = EC$1;

  EC$1.prototype.keyPair = function keyPair(options) {
    return new KeyPair$2(this, options);
  };

  EC$1.prototype.keyFromPrivate = function keyFromPrivate(priv, enc) {
    return KeyPair$2.fromPrivate(this, priv, enc);
  };

  EC$1.prototype.keyFromPublic = function keyFromPublic(pub, enc) {
    return KeyPair$2.fromPublic(this, pub, enc);
  };

  EC$1.prototype.genKeyPair = function genKeyPair(options) {
    if (!options)
      options = {};

    // Instantiate Hmac_DRBG
    var drbg = new HmacDRBG({
      hash: this.hash,
      pers: options.pers,
      persEnc: options.persEnc || 'utf8',
      entropy: options.entropy || rand(this.hash.hmacStrength),
      entropyEnc: options.entropy && options.entropyEnc || 'utf8',
      nonce: this.n.toArray(),
    });

    var bytes = this.n.byteLength();
    var ns2 = this.n.sub(new BN$8(2));
    for (;;) {
      var priv = new BN$8(drbg.generate(bytes));
      if (priv.cmp(ns2) > 0)
        continue;

      priv.iaddn(1);
      return this.keyFromPrivate(priv);
    }
  };

  EC$1.prototype._truncateToN = function _truncateToN(msg, truncOnly) {
    var delta = msg.byteLength() * 8 - this.n.bitLength();
    if (delta > 0)
      msg = msg.ushrn(delta);
    if (!truncOnly && msg.cmp(this.n) >= 0)
      return msg.sub(this.n);
    else
      return msg;
  };

  EC$1.prototype.sign = function sign(msg, key, enc, options) {
    if (typeof enc === 'object') {
      options = enc;
      enc = null;
    }
    if (!options)
      options = {};

    key = this.keyFromPrivate(key, enc);
    msg = this._truncateToN(new BN$8(msg, 16));

    // Zero-extend key to provide enough entropy
    var bytes = this.n.byteLength();
    var bkey = key.getPrivate().toArray('be', bytes);

    // Zero-extend nonce to have the same byte size as N
    var nonce = msg.toArray('be', bytes);

    // Instantiate Hmac_DRBG
    var drbg = new HmacDRBG({
      hash: this.hash,
      entropy: bkey,
      nonce: nonce,
      pers: options.pers,
      persEnc: options.persEnc || 'utf8',
    });

    // Number of bytes to generate
    var ns1 = this.n.sub(new BN$8(1));

    for (var iter = 0; ; iter++) {
      var k = options.k ?
        options.k(iter) :
        new BN$8(drbg.generate(this.n.byteLength()));
      k = this._truncateToN(k, true);
      if (k.cmpn(1) <= 0 || k.cmp(ns1) >= 0)
        continue;

      var kp = this.g.mul(k);
      if (kp.isInfinity())
        continue;

      var kpX = kp.getX();
      var r = kpX.umod(this.n);
      if (r.cmpn(0) === 0)
        continue;

      var s = k.invm(this.n).mul(r.mul(key.getPrivate()).iadd(msg));
      s = s.umod(this.n);
      if (s.cmpn(0) === 0)
        continue;

      var recoveryParam = (kp.getY().isOdd() ? 1 : 0) |
                          (kpX.cmp(r) !== 0 ? 2 : 0);

      // Use complement of `s`, if it is > `n / 2`
      if (options.canonical && s.cmp(this.nh) > 0) {
        s = this.n.sub(s);
        recoveryParam ^= 1;
      }

      return new Signature$3({ r: r, s: s, recoveryParam: recoveryParam });
    }
  };

  EC$1.prototype.verify = function verify(msg, signature, key, enc) {
    msg = this._truncateToN(new BN$8(msg, 16));
    key = this.keyFromPublic(key, enc);
    signature = new Signature$3(signature, 'hex');

    // Perform primitive values validation
    var r = signature.r;
    var s = signature.s;
    if (r.cmpn(1) < 0 || r.cmp(this.n) >= 0)
      return false;
    if (s.cmpn(1) < 0 || s.cmp(this.n) >= 0)
      return false;

    // Validate signature
    var sinv = s.invm(this.n);
    var u1 = sinv.mul(msg).umod(this.n);
    var u2 = sinv.mul(r).umod(this.n);
    var p;

    if (!this.curve._maxwellTrick) {
      p = this.g.mulAdd(u1, key.getPublic(), u2);
      if (p.isInfinity())
        return false;

      return p.getX().umod(this.n).cmp(r) === 0;
    }

    // NOTE: Greg Maxwell's trick, inspired by:
    // https://git.io/vad3K

    p = this.g.jmulAdd(u1, key.getPublic(), u2);
    if (p.isInfinity())
      return false;

    // Compare `p.x` of Jacobian point with `r`,
    // this will do `p.x == r * p.z^2` instead of multiplying `p.x` by the
    // inverse of `p.z^2`
    return p.eqXToP(r);
  };

  EC$1.prototype.recoverPubKey = function(msg, signature, j, enc) {
    assert$5((3 & j) === j, 'The recovery param is more than two bits');
    signature = new Signature$3(signature, enc);

    var n = this.n;
    var e = new BN$8(msg);
    var r = signature.r;
    var s = signature.s;

    // A set LSB signifies that the y-coordinate is odd
    var isYOdd = j & 1;
    var isSecondKey = j >> 1;
    if (r.cmp(this.curve.p.umod(this.curve.n)) >= 0 && isSecondKey)
      throw new Error('Unable to find sencond key candinate');

    // 1.1. Let x = r + jn.
    if (isSecondKey)
      r = this.curve.pointFromX(r.add(this.curve.n), isYOdd);
    else
      r = this.curve.pointFromX(r, isYOdd);

    var rInv = signature.r.invm(n);
    var s1 = n.sub(e).mul(rInv).umod(n);
    var s2 = s.mul(rInv).umod(n);

    // 1.6.1 Compute Q = r^-1 (sR -  eG)
    //               Q = r^-1 (sR + -eG)
    return this.g.mulAdd(s1, r, s2);
  };

  EC$1.prototype.getKeyRecoveryParam = function(e, signature, Q, enc) {
    signature = new Signature$3(signature, enc);
    if (signature.recoveryParam !== null)
      return signature.recoveryParam;

    for (var i = 0; i < 4; i++) {
      var Qprime;
      try {
        Qprime = this.recoverPubKey(e, signature, i);
      } catch (e) {
        continue;
      }

      if (Qprime.eq(Q))
        return i;
    }
    throw new Error('Unable to find valid recovery factor');
  };

  var utils$2 = utils$m;
  var assert$4 = utils$2.assert;
  var parseBytes$2 = utils$2.parseBytes;
  var cachedProperty$1 = utils$2.cachedProperty;

  /**
  * @param {EDDSA} eddsa - instance
  * @param {Object} params - public/private key parameters
  *
  * @param {Array<Byte>} [params.secret] - secret seed bytes
  * @param {Point} [params.pub] - public key point (aka `A` in eddsa terms)
  * @param {Array<Byte>} [params.pub] - public key point encoded as bytes
  *
  */
  function KeyPair$1(eddsa, params) {
    this.eddsa = eddsa;
    this._secret = parseBytes$2(params.secret);
    if (eddsa.isPoint(params.pub))
      this._pub = params.pub;
    else
      this._pubBytes = parseBytes$2(params.pub);
  }

  KeyPair$1.fromPublic = function fromPublic(eddsa, pub) {
    if (pub instanceof KeyPair$1)
      return pub;
    return new KeyPair$1(eddsa, { pub: pub });
  };

  KeyPair$1.fromSecret = function fromSecret(eddsa, secret) {
    if (secret instanceof KeyPair$1)
      return secret;
    return new KeyPair$1(eddsa, { secret: secret });
  };

  KeyPair$1.prototype.secret = function secret() {
    return this._secret;
  };

  cachedProperty$1(KeyPair$1, 'pubBytes', function pubBytes() {
    return this.eddsa.encodePoint(this.pub());
  });

  cachedProperty$1(KeyPair$1, 'pub', function pub() {
    if (this._pubBytes)
      return this.eddsa.decodePoint(this._pubBytes);
    return this.eddsa.g.mul(this.priv());
  });

  cachedProperty$1(KeyPair$1, 'privBytes', function privBytes() {
    var eddsa = this.eddsa;
    var hash = this.hash();
    var lastIx = eddsa.encodingLength - 1;

    var a = hash.slice(0, eddsa.encodingLength);
    a[0] &= 248;
    a[lastIx] &= 127;
    a[lastIx] |= 64;

    return a;
  });

  cachedProperty$1(KeyPair$1, 'priv', function priv() {
    return this.eddsa.decodeInt(this.privBytes());
  });

  cachedProperty$1(KeyPair$1, 'hash', function hash() {
    return this.eddsa.hash().update(this.secret()).digest();
  });

  cachedProperty$1(KeyPair$1, 'messagePrefix', function messagePrefix() {
    return this.hash().slice(this.eddsa.encodingLength);
  });

  KeyPair$1.prototype.sign = function sign(message) {
    assert$4(this._secret, 'KeyPair can only verify');
    return this.eddsa.sign(message, this);
  };

  KeyPair$1.prototype.verify = function verify(message, sig) {
    return this.eddsa.verify(message, sig, this);
  };

  KeyPair$1.prototype.getSecret = function getSecret(enc) {
    assert$4(this._secret, 'KeyPair is public only');
    return utils$2.encode(this.secret(), enc);
  };

  KeyPair$1.prototype.getPublic = function getPublic(enc) {
    return utils$2.encode(this.pubBytes(), enc);
  };

  var key = KeyPair$1;

  var BN$7 = bn$2.exports;
  var utils$1 = utils$m;
  var assert$3 = utils$1.assert;
  var cachedProperty = utils$1.cachedProperty;
  var parseBytes$1 = utils$1.parseBytes;

  /**
  * @param {EDDSA} eddsa - eddsa instance
  * @param {Array<Bytes>|Object} sig -
  * @param {Array<Bytes>|Point} [sig.R] - R point as Point or bytes
  * @param {Array<Bytes>|bn} [sig.S] - S scalar as bn or bytes
  * @param {Array<Bytes>} [sig.Rencoded] - R point encoded
  * @param {Array<Bytes>} [sig.Sencoded] - S scalar encoded
  */
  function Signature$2(eddsa, sig) {
    this.eddsa = eddsa;

    if (typeof sig !== 'object')
      sig = parseBytes$1(sig);

    if (Array.isArray(sig)) {
      sig = {
        R: sig.slice(0, eddsa.encodingLength),
        S: sig.slice(eddsa.encodingLength),
      };
    }

    assert$3(sig.R && sig.S, 'Signature without R or S');

    if (eddsa.isPoint(sig.R))
      this._R = sig.R;
    if (sig.S instanceof BN$7)
      this._S = sig.S;

    this._Rencoded = Array.isArray(sig.R) ? sig.R : sig.Rencoded;
    this._Sencoded = Array.isArray(sig.S) ? sig.S : sig.Sencoded;
  }

  cachedProperty(Signature$2, 'S', function S() {
    return this.eddsa.decodeInt(this.Sencoded());
  });

  cachedProperty(Signature$2, 'R', function R() {
    return this.eddsa.decodePoint(this.Rencoded());
  });

  cachedProperty(Signature$2, 'Rencoded', function Rencoded() {
    return this.eddsa.encodePoint(this.R());
  });

  cachedProperty(Signature$2, 'Sencoded', function Sencoded() {
    return this.eddsa.encodeInt(this.S());
  });

  Signature$2.prototype.toBytes = function toBytes() {
    return this.Rencoded().concat(this.Sencoded());
  };

  Signature$2.prototype.toHex = function toHex() {
    return utils$1.encode(this.toBytes(), 'hex').toUpperCase();
  };

  var signature$2 = Signature$2;

  var hash$1 = hash$3;
  var curves = curves$2;
  var utils = utils$m;
  var assert$2 = utils.assert;
  var parseBytes = utils.parseBytes;
  var KeyPair = key;
  var Signature$1 = signature$2;

  function EDDSA(curve) {
    assert$2(curve === 'ed25519', 'only tested with ed25519 so far');

    if (!(this instanceof EDDSA))
      return new EDDSA(curve);

    curve = curves[curve].curve;
    this.curve = curve;
    this.g = curve.g;
    this.g.precompute(curve.n.bitLength() + 1);

    this.pointClass = curve.point().constructor;
    this.encodingLength = Math.ceil(curve.n.bitLength() / 8);
    this.hash = hash$1.sha512;
  }

  var eddsa = EDDSA;

  /**
  * @param {Array|String} message - message bytes
  * @param {Array|String|KeyPair} secret - secret bytes or a keypair
  * @returns {Signature} - signature
  */
  EDDSA.prototype.sign = function sign(message, secret) {
    message = parseBytes(message);
    var key = this.keyFromSecret(secret);
    var r = this.hashInt(key.messagePrefix(), message);
    var R = this.g.mul(r);
    var Rencoded = this.encodePoint(R);
    var s_ = this.hashInt(Rencoded, key.pubBytes(), message)
      .mul(key.priv());
    var S = r.add(s_).umod(this.curve.n);
    return this.makeSignature({ R: R, S: S, Rencoded: Rencoded });
  };

  /**
  * @param {Array} message - message bytes
  * @param {Array|String|Signature} sig - sig bytes
  * @param {Array|String|Point|KeyPair} pub - public key
  * @returns {Boolean} - true if public key matches sig of message
  */
  EDDSA.prototype.verify = function verify(message, sig, pub) {
    message = parseBytes(message);
    sig = this.makeSignature(sig);
    var key = this.keyFromPublic(pub);
    var h = this.hashInt(sig.Rencoded(), key.pubBytes(), message);
    var SG = this.g.mul(sig.S());
    var RplusAh = sig.R().add(key.pub().mul(h));
    return RplusAh.eq(SG);
  };

  EDDSA.prototype.hashInt = function hashInt() {
    var hash = this.hash();
    for (var i = 0; i < arguments.length; i++)
      hash.update(arguments[i]);
    return utils.intFromLE(hash.digest()).umod(this.curve.n);
  };

  EDDSA.prototype.keyFromPublic = function keyFromPublic(pub) {
    return KeyPair.fromPublic(this, pub);
  };

  EDDSA.prototype.keyFromSecret = function keyFromSecret(secret) {
    return KeyPair.fromSecret(this, secret);
  };

  EDDSA.prototype.makeSignature = function makeSignature(sig) {
    if (sig instanceof Signature$1)
      return sig;
    return new Signature$1(this, sig);
  };

  /**
  * * https://tools.ietf.org/html/draft-josefsson-eddsa-ed25519-03#section-5.2
  *
  * EDDSA defines methods for encoding and decoding points and integers. These are
  * helper convenience methods, that pass along to utility functions implied
  * parameters.
  *
  */
  EDDSA.prototype.encodePoint = function encodePoint(point) {
    var enc = point.getY().toArray('le', this.encodingLength);
    enc[this.encodingLength - 1] |= point.getX().isOdd() ? 0x80 : 0;
    return enc;
  };

  EDDSA.prototype.decodePoint = function decodePoint(bytes) {
    bytes = utils.parseBytes(bytes);

    var lastIx = bytes.length - 1;
    var normed = bytes.slice(0, lastIx).concat(bytes[lastIx] & ~0x80);
    var xIsOdd = (bytes[lastIx] & 0x80) !== 0;

    var y = utils.intFromLE(normed);
    return this.curve.pointFromY(y, xIsOdd);
  };

  EDDSA.prototype.encodeInt = function encodeInt(num) {
    return num.toArray('le', this.encodingLength);
  };

  EDDSA.prototype.decodeInt = function decodeInt(bytes) {
    return utils.intFromLE(bytes);
  };

  EDDSA.prototype.isPoint = function isPoint(val) {
    return val instanceof this.pointClass;
  };

  (function (exports) {

  	var elliptic = exports;

  	elliptic.version = require$$0$3.version;
  	elliptic.utils = utils$m;
  	elliptic.rand = brorand.exports;
  	elliptic.curve = curve;
  	elliptic.curves = curves$2;

  	// Protocols
  	elliptic.ec = ec$1;
  	elliptic.eddsa = eddsa;
  } (elliptic));

  var BN$6 = bn$1;

  var EC = elliptic.ec;
  var ec = new EC('secp256k1');
  var ecPoint = ec.curve.point.bind(ec.curve);
  var ecPointFromX = ec.curve.pointFromX.bind(ec.curve);

  /**
   * Instantiate a valid secp256k1 Point from the X and Y coordinates. This class
   * is just an extension of the secp256k1 code from the library "elliptic" by
   * Fedor Indutny. It includes a few extra features that are useful in Bitcoin.
   *
   * @param {BN|String} x - The X coordinate
   * @param {BN|String} y - The Y coordinate
   * @link https://github.com/indutny/elliptic
   * @augments elliptic.curve.point
   * @throws {Error} A validation error if exists
   * @returns {Point} An instance of Point
   * @constructor
   */
  var Point = function Point (x, y, isRed) {
    try {
      var point = ecPoint(x, y, isRed);
    } catch (e) {
      throw new Error('Invalid Point')
    }
    point.validate();
    return point
  };

  Point.prototype = Object.getPrototypeOf(ec.curve.point());

  /**
   *
   * Instantiate a valid secp256k1 Point from only the X coordinate. This is
   * useful to rederive a full point from the compressed form of a point.
   *
   * @param {boolean} odd - If the Y coordinate is odd
   * @param {BN|String} x - The X coordinate
   * @throws {Error} A validation error if exists
   * @returns {Point} An instance of Point
   */
  Point.fromX = function fromX (odd, x) {
    try {
      var point = ecPointFromX(x, odd);
    } catch (e) {
      throw new Error('Invalid X')
    }
    point.validate();
    return point
  };

  /**
   *
   * Will return a secp256k1 ECDSA base point.
   *
   * @link https://en.bitcoin.it/wiki/Secp256k1
   * @returns {Point} An instance of the base point.
   */
  Point.getG = function getG () {
    return ec.curve.g
  };

  /**
   *
   * Will return the max of range of valid private keys as governed by the
   * secp256k1 ECDSA standard.
   *
   * @link https://en.bitcoin.it/wiki/Private_key#Range_of_valid_ECDSA_private_keys
   * @returns {BN} A BN instance of the number of points on the curve
   */
  Point.getN = function getN () {
    return new BN$6(ec.curve.n.toArray())
  };

  if (!Point.prototype._getX) { Point.prototype._getX = Point.prototype.getX; }

  /**
   * Will return the X coordinate of the Point.
   *
   * @returns {BN} A BN instance of the X coordinate
   */
  Point.prototype.getX = function getX () {
    return new BN$6(this._getX().toArray())
  };

  if (!Point.prototype._getY) { Point.prototype._getY = Point.prototype.getY; }

  /**
   * Will return the Y coordinate of the Point.
   *
   * @returns {BN} A BN instance of the Y coordinate
   */
  Point.prototype.getY = function getY () {
    return new BN$6(this._getY().toArray())
  };

  /**
   * Will determine if the point is valid.
   *
   * @link https://www.iacr.org/archive/pkc2003/25670211/25670211.pdf
   * @throws {Error} A validation error if exists
   * @returns {Point} An instance of the same Point
   */
  Point.prototype.validate = function validate () {
    if (this.isInfinity()) {
      throw new Error('Point cannot be equal to Infinity')
    }

    var p2;
    try {
      p2 = ecPointFromX(this.getX(), this.getY().isOdd());
    } catch (e) {
      throw new Error('Point does not lie on the curve')
    }

    if (p2.y.cmp(this.y) !== 0) {
      throw new Error('Invalid y value for curve.')
    }

    // todo: needs test case
    if (!(this.mul(Point.getN()).isInfinity())) {
      throw new Error('Point times N must be infinity')
    }

    return this
  };

  /**
   * A "compressed" format point is the X part of the (X, Y) point plus an extra
   * bit (which takes an entire byte) to indicate whether the Y value is odd or
   * not. Storing points this way takes a bit less space, but requires a bit more
   * computation to rederive the full point.
   *
   * @param {Point} point An instance of Point.
   * @returns {Buffer} A compressed point in the form of a buffer.
   */
  Point.pointToCompressed = function pointToCompressed (point) {
    var xbuf = point.getX().toBuffer({ size: 32 });
    var ybuf = point.getY().toBuffer({ size: 32 });

    var prefix;
    var odd = ybuf[ybuf.length - 1] % 2;
    if (odd) {
      prefix = Buffer$1.from([0x03]);
    } else {
      prefix = Buffer$1.from([0x02]);
    }
    return Buffer$1.concat([prefix, xbuf])
  };

  /**
   * Converts a compressed buffer into a point.
   *
   * @param {Buffer} buf A compressed point.
   * @returns {Point} A Point.
   */
  Point.pointFromCompressed = function (buf) {
    if (buf.length !== 33) {
      throw new Error('invalid buffer length')
    }
    let prefix = buf[0];
    let odd;
    if (prefix === 0x03) {
      odd = true;
    } else if (prefix === 0x02) {
      odd = false;
    } else {
      throw new Error('invalid value of compressed prefix')
    }

    let xbuf = buf.slice(1, 33);
    let x = BN$6.fromBuffer(xbuf);
    return Point.fromX(odd, x)
  };

  /**
   * Convert point to a compressed buffer.
   *
   * @returns {Buffer} A compressed point.
   */
  Point.prototype.toBuffer = function () {
    return Point.pointToCompressed(this)
  };

  /**
   * Convert point to a compressed hex string.
   *
   * @returns {string} A compressed point as a hex string.
   */
  Point.prototype.toHex = function () {
    return this.toBuffer().toString('hex')
  };

  /**
   * Converts a compressed buffer into a point.
   *
   * @param {Buffer} buf A compressed point.
   * @returns {Point} A Point.
   */
  Point.fromBuffer = function (buf) {
    return Point.pointFromCompressed(buf)
  };

  /**
   * Converts a compressed buffer into a point.
   *
   * @param {Buffer} hex A compressed point as a hex string.
   * @returns {Point} A Point.
   */
  Point.fromHex = function (hex) {
    return Point.fromBuffer(Buffer$1.from(hex, 'hex'))
  };

  var point = Point;

  var _$9 = __1;
  var $$6 = preconditions;

  /**
   * Determines whether a string contains only hexadecimal values
   *
   * @name JSUtil.isHexa
   * @param {string} value
   * @return {boolean} true if the string is the hexa representation of a number
   */
  var isHexa = function isHexa (value) {
    if (!_$9.isString(value)) {
      return false
    }
    return /^[0-9a-fA-F]+$/.test(value)
  };

  /**
   * @namespace JSUtil
   */
  var js = {
    /**
     * Test if an argument is a valid JSON object. If it is, returns a truthy
     * value (the json object decoded), so no double JSON.parse call is necessary
     *
     * @param {string} arg
     * @return {Object|boolean} false if the argument is not a JSON string.
     */
    isValidJSON: function isValidJSON (arg) {
      var parsed;
      if (!_$9.isString(arg)) {
        return false
      }
      try {
        parsed = JSON.parse(arg);
      } catch (e) {
        return false
      }
      if (typeof (parsed) === 'object') {
        return true
      }
      return false
    },
    isHexa: isHexa,
    isHexaString: isHexa,

    /**
     * Define immutable properties on a target object
     *
     * @param {Object} target - An object to be extended
     * @param {Object} values - An object of properties
     * @return {Object} The target object
     */
    defineImmutable: function defineImmutable (target, values) {
      Object.keys(values).forEach(function (key) {
        Object.defineProperty(target, key, {
          configurable: false,
          enumerable: true,
          value: values[key]
        });
      });
      return target
    },
    /**
     * Checks that a value is a natural number, a positive integer or zero.
     *
     * @param {*} value
     * @return {Boolean}
     */
    isNaturalNumber: function isNaturalNumber (value) {
      return typeof value === 'number' &&
        isFinite(value) &&
        Math.floor(value) === value &&
        value >= 0
    },

    /**
     * Transform a 4-byte integer (unsigned value) into a Buffer of length 4 (Big Endian Byte Order)
     *
     * @param {number} integer
     * @return {Buffer}
     */
    integerAsBuffer: function integerAsBuffer (integer) {
      $$6.checkArgumentType(integer, 'number', 'integer');
      const buf = Buffer$1.allocUnsafe(4);
      buf.writeUInt32BE(integer, 0);
      return buf
    }
  };

  var BN$5 = bn$1;
  var _$8 = __1;
  var $$5 = preconditions;
  var JSUtil$2 = js;

  var Signature = function Signature (r, s) {
    if (!(this instanceof Signature)) {
      return new Signature(r, s)
    }
    if (r instanceof BN$5) {
      this.set({
        r: r,
        s: s
      });
    } else if (r) {
      var obj = r;
      this.set(obj);
    }
  };

  Signature.prototype.set = function (obj) {
    this.r = obj.r || this.r || undefined;
    this.s = obj.s || this.s || undefined;

    this.i = typeof obj.i !== 'undefined' ? obj.i : this.i; // public key recovery parameter in range [0, 3]
    this.compressed = typeof obj.compressed !== 'undefined'
      ? obj.compressed : this.compressed; // whether the recovered pubkey is compressed
    this.nhashtype = obj.nhashtype || this.nhashtype || undefined;
    return this
  };

  Signature.fromCompact = function (buf) {
    $$5.checkArgument(Buffer$1.isBuffer(buf), 'Argument is expected to be a Buffer');

    var sig = new Signature();

    var compressed = true;
    var i = buf.slice(0, 1)[0] - 27 - 4;
    if (i < 0) {
      compressed = false;
      i = i + 4;
    }

    var b2 = buf.slice(1, 33);
    var b3 = buf.slice(33, 65);

    $$5.checkArgument(i === 0 || i === 1 || i === 2 || i === 3, new Error('i must be 0, 1, 2, or 3'));
    $$5.checkArgument(b2.length === 32, new Error('r must be 32 bytes'));
    $$5.checkArgument(b3.length === 32, new Error('s must be 32 bytes'));

    sig.compressed = compressed;
    sig.i = i;
    sig.r = BN$5.fromBuffer(b2);
    sig.s = BN$5.fromBuffer(b3);

    return sig
  };

  Signature.fromDER = Signature.fromBuffer = function (buf, strict) {
    var obj = Signature.parseDER(buf, strict);
    var sig = new Signature();

    sig.r = obj.r;
    sig.s = obj.s;

    return sig
  };

  // The format used in a tx
  Signature.fromTxFormat = function (buf) {
    var nhashtype = buf.readUInt8(buf.length - 1);
    var derbuf = buf.slice(0, buf.length - 1);
    var sig = Signature.fromDER(derbuf, false);
    sig.nhashtype = nhashtype;
    return sig
  };

  Signature.fromString = function (str) {
    var buf = Buffer$1.from(str, 'hex');
    return Signature.fromDER(buf)
  };

  /**
   * In order to mimic the non-strict DER encoding of OpenSSL, set strict = false.
   */
  Signature.parseDER = function (buf, strict) {
    $$5.checkArgument(Buffer$1.isBuffer(buf), new Error('DER formatted signature should be a buffer'));
    if (_$8.isUndefined(strict)) {
      strict = true;
    }

    var header = buf[0];
    $$5.checkArgument(header === 0x30, new Error('Header byte should be 0x30'));

    var length = buf[1];
    var buflength = buf.slice(2).length;
    $$5.checkArgument(!strict || length === buflength, new Error('Length byte should length of what follows'));

    length = length < buflength ? length : buflength;

    var rheader = buf[2 + 0];
    $$5.checkArgument(rheader === 0x02, new Error('Integer byte for r should be 0x02'));

    var rlength = buf[2 + 1];
    var rbuf = buf.slice(2 + 2, 2 + 2 + rlength);
    var r = BN$5.fromBuffer(rbuf);
    var rneg = buf[2 + 1 + 1] === 0x00;
    $$5.checkArgument(rlength === rbuf.length, new Error('Length of r incorrect'));

    var sheader = buf[2 + 2 + rlength + 0];
    $$5.checkArgument(sheader === 0x02, new Error('Integer byte for s should be 0x02'));

    var slength = buf[2 + 2 + rlength + 1];
    var sbuf = buf.slice(2 + 2 + rlength + 2, 2 + 2 + rlength + 2 + slength);
    var s = BN$5.fromBuffer(sbuf);
    var sneg = buf[2 + 2 + rlength + 2 + 2] === 0x00;
    $$5.checkArgument(slength === sbuf.length, new Error('Length of s incorrect'));

    var sumlength = 2 + 2 + rlength + 2 + slength;
    $$5.checkArgument(length === sumlength - 2, new Error('Length of signature incorrect'));

    var obj = {
      header: header,
      length: length,
      rheader: rheader,
      rlength: rlength,
      rneg: rneg,
      rbuf: rbuf,
      r: r,
      sheader: sheader,
      slength: slength,
      sneg: sneg,
      sbuf: sbuf,
      s: s
    };

    return obj
  };

  Signature.prototype.toCompact = function (i, compressed) {
    i = typeof i === 'number' ? i : this.i;
    compressed = typeof compressed === 'boolean' ? compressed : this.compressed;

    if (!(i === 0 || i === 1 || i === 2 || i === 3)) {
      throw new Error('i must be equal to 0, 1, 2, or 3')
    }

    var val = i + 27 + 4;
    if (compressed === false) {
      val = val - 4;
    }
    var b1 = Buffer$1.from([val]);
    var b2 = this.r.toBuffer({
      size: 32
    });
    var b3 = this.s.toBuffer({
      size: 32
    });
    return Buffer$1.concat([b1, b2, b3])
  };

  Signature.prototype.toBuffer = Signature.prototype.toDER = function () {
    var rnbuf = this.r.toBuffer();
    var snbuf = this.s.toBuffer();

    var rneg = !!(rnbuf[0] & 0x80);
    var sneg = !!(snbuf[0] & 0x80);

    var rbuf = rneg ? Buffer$1.concat([Buffer$1.from([0x00]), rnbuf]) : rnbuf;
    var sbuf = sneg ? Buffer$1.concat([Buffer$1.from([0x00]), snbuf]) : snbuf;

    var rlength = rbuf.length;
    var slength = sbuf.length;
    var length = 2 + rlength + 2 + slength;
    var rheader = 0x02;
    var sheader = 0x02;
    var header = 0x30;

    var der = Buffer$1.concat([Buffer$1.from([header, length, rheader, rlength]), rbuf, Buffer$1.from([sheader, slength]), sbuf]);
    return der
  };

  Signature.prototype.toString = function () {
    var buf = this.toDER();
    return buf.toString('hex')
  };

  /**
   * This function is translated from bitcoind's IsDERSignature and is used in
   * the script interpreter.  This "DER" format actually includes an extra byte,
   * the nhashtype, at the end. It is really the tx format, not DER format.
   *
   * A canonical signature exists of: [30] [total len] [02] [len R] [R] [02] [len S] [S] [hashtype]
   * Where R and S are not negative (their first byte has its highest bit not set), and not
   * excessively padded (do not start with a 0 byte, unless an otherwise negative number follows,
   * in which case a single 0 byte is necessary and even required).
   *
   * See https://bitcointalk.org/index.php?topic=8392.msg127623#msg127623
   */
  Signature.isTxDER = function (buf) {
    if (buf.length < 9) {
      //  Non-canonical signature: too short
      return false
    }
    if (buf.length > 73) {
      // Non-canonical signature: too long
      return false
    }
    if (buf[0] !== 0x30) {
      //  Non-canonical signature: wrong type
      return false
    }
    if (buf[1] !== buf.length - 3) {
      //  Non-canonical signature: wrong length marker
      return false
    }
    var nLenR = buf[3];
    if (5 + nLenR >= buf.length) {
      //  Non-canonical signature: S length misplaced
      return false
    }
    var nLenS = buf[5 + nLenR];
    if ((nLenR + nLenS + 7) !== buf.length) {
      //  Non-canonical signature: R+S length mismatch
      return false
    }

    var R = buf.slice(4);
    if (buf[4 - 2] !== 0x02) {
      //  Non-canonical signature: R value type mismatch
      return false
    }
    if (nLenR === 0) {
      //  Non-canonical signature: R length is zero
      return false
    }
    if (R[0] & 0x80) {
      //  Non-canonical signature: R value negative
      return false
    }
    if (nLenR > 1 && (R[0] === 0x00) && !(R[1] & 0x80)) {
      //  Non-canonical signature: R value excessively padded
      return false
    }

    var S = buf.slice(6 + nLenR);
    if (buf[6 + nLenR - 2] !== 0x02) {
      //  Non-canonical signature: S value type mismatch
      return false
    }
    if (nLenS === 0) {
      //  Non-canonical signature: S length is zero
      return false
    }
    if (S[0] & 0x80) {
      //  Non-canonical signature: S value negative
      return false
    }
    if (nLenS > 1 && (S[0] === 0x00) && !(S[1] & 0x80)) {
      //  Non-canonical signature: S value excessively padded
      return false
    }
    return true
  };

  /**
   * Compares to bitcoind's IsLowDERSignature
   * See also ECDSA signature algorithm which enforces this.
   * See also BIP 62, "low S values in signatures"
   */
  Signature.prototype.hasLowS = function () {
    if (this.s.lt(new BN$5(1)) ||
      this.s.gt(new BN$5('7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0', 'hex'))) {
      return false
    }
    return true
  };

  /**
   * @returns true if the nhashtype is exactly equal to one of the standard options or combinations thereof.
   * Translated from bitcoind's IsDefinedHashtypeSignature
   */
  Signature.prototype.hasDefinedHashtype = function () {
    if (!JSUtil$2.isNaturalNumber(this.nhashtype)) {
      return false
    }
    // accept with or without Signature.SIGHASH_ANYONECANPAY by ignoring the bit
    var temp = this.nhashtype & 0x1F;
    if (temp < Signature.SIGHASH_ALL || temp > Signature.SIGHASH_SINGLE) {
      return false
    }
    return true
  };

  Signature.prototype.toTxFormat = function () {
    var derbuf = this.toDER();
    var buf = Buffer$1.alloc(1);
    buf.writeUInt8(this.nhashtype, 0);
    return Buffer$1.concat([derbuf, buf])
  };

  Signature.SIGHASH_ALL = 0x01;
  Signature.SIGHASH_NONE = 0x02;
  Signature.SIGHASH_SINGLE = 0x03;
  Signature.SIGHASH_FORKID = 0x40;
  Signature.SIGHASH_ANYONECANPAY = 0x80;

  var signature$1 = Signature;

  var hash = {exports: {}};

  var hash_browser = {exports: {}};

  var hasRequiredHash_browser;

  function requireHash_browser () {
  	if (hasRequiredHash_browser) return hash_browser.exports;
  	hasRequiredHash_browser = 1;
  	(function (module) {

  		var hash = hash$3;
  		var $ = preconditions;

  		var Hash = module.exports;

  		/**
  		 * A SHA or SHA1 hash, which is always 160 bits or 20 bytes long.
  		 *
  		 * See:
  		 * https://en.wikipedia.org/wiki/SHA-1
  		 *
  		 * @param {Buffer} buf Data, a.k.a. pre-image, which can be any size.
  		 * @returns {Buffer} The hash in the form of a buffer.
  		 */
  		Hash.sha1 = function (buf) {
  		  $.checkArgument(Buffer$1.isBuffer(buf));
  		  return Buffer$1.from(hash.sha1().update(buf).digest('hex'), 'hex')
  		};

  		Hash.sha1.blocksize = 512;

  		/**
  		 * A SHA256 hash, which is always 256 bits or 32 bytes long.
  		 *
  		 * See:
  		 * https://www.movable-type.co.uk/scripts/sha256.html
  		 *
  		 * @param {Buffer} buf Data, a.k.a. pre-image, which can be any size.
  		 * @returns {Buffer} The hash in the form of a buffer.
  		 */
  		Hash.sha256 = function (buf) {
  		  $.checkArgument(Buffer$1.isBuffer(buf));
  		  return Buffer$1.from(hash.sha256().update(buf).digest('hex'), 'hex')
  		};

  		Hash.sha256.blocksize = 512;

  		/**
  		 * A double SHA256 hash, which is always 256 bits or 32 bytes bytes long. This
  		 * hash function is commonly used inside Bitcoin, particularly for the hash of a
  		 * block and the hash of a transaction.
  		 *
  		 * See:
  		 * https://www.movable-type.co.uk/scripts/sha256.html
  		 *
  		 * @param {Buffer} buf Data, a.k.a. pre-image, which can be any size.
  		 * @returns {Buffer} The hash in the form of a buffer.
  		 */
  		Hash.sha256sha256 = function (buf) {
  		  $.checkArgument(Buffer$1.isBuffer(buf));
  		  return Hash.sha256(Hash.sha256(buf))
  		};

  		/**
  		 * A RIPEMD160 hash, which is always 160 bits or 20 bytes long.
  		 *
  		 * See:
  		 * https://en.wikipedia.org/wiki/RIPEMD
  		 *
  		 * @param {Buffer} buf Data, a.k.a. pre-image, which can be any size.
  		 * @returns {Buffer} The hash in the form of a buffer.
  		 */
  		Hash.ripemd160 = function (buf) {
  		  $.checkArgument(Buffer$1.isBuffer(buf));
  		  return Buffer$1.from(hash.ripemd160().update(buf).digest('hex'), 'hex')
  		};
  		/**
  		 * A RIPEMD160 hash of a SHA256 hash, which is always 160 bits or 20 bytes long.
  		 * This value is commonly used inside Bitcoin, particularly for Bitcoin
  		 * addresses.
  		 *
  		 * See:
  		 * https://en.wikipedia.org/wiki/RIPEMD
  		 *
  		 * @param {Buffer} buf Data, a.k.a. pre-image, which can be any size.
  		 * @returns {Buffer} The hash in the form of a buffer.
  		 */
  		Hash.sha256ripemd160 = function (buf) {
  		  $.checkArgument(Buffer$1.isBuffer(buf));
  		  return Hash.ripemd160(Hash.sha256(buf))
  		};

  		/**
  		 * A SHA512 hash, which is always 512 bits or 64 bytes long.
  		 *
  		 * See:
  		 * https://en.wikipedia.org/wiki/SHA-2
  		 *
  		 * @param {Buffer} buf Data, a.k.a. pre-image, which can be any size.
  		 * @returns {Buffer} The hash in the form of a buffer.
  		 */
  		Hash.sha512 = function (buf) {
  		  $.checkArgument(Buffer$1.isBuffer(buf));
  		  return Buffer$1.from(hash.sha512().update(buf).digest('hex'), 'hex')
  		};

  		Hash.sha512.blocksize = 1024;

  		/**
  		 * A way to do HMAC using any underlying hash function. If you ever find that
  		 * you want to hash two pieces of data together, you should use HMAC instead of
  		 * just using a hash function. Rather than doing hash(data1 + data2) you should
  		 * do HMAC(data1, data2). Actually, rather than use HMAC directly, we recommend
  		 * you use either sha256hmac or sha515hmac provided below.
  		 *
  		 * See:
  		 * https://en.wikipedia.org/wiki/Length_extension_attack
  		 * https://blog.skullsecurity.org/2012/everything-you-need-to-know-about-hash-length-extension-attacks
  		 *
  		 * @param {function} hashf Which hash function to use.
  		 * @param {Buffer} data Data, which can be any size.
  		 * @param {Buffer} key Key, which can be any size.
  		 * @returns {Buffer} The HMAC in the form of a buffer.
  		 */
  		Hash.hmac = function (hashf, data, key) {
  		  // http://en.wikipedia.org/wiki/Hash-based_message_authentication_code
  		  // http://tools.ietf.org/html/rfc4868#section-2
  		  $.checkArgument(Buffer$1.isBuffer(data));
  		  $.checkArgument(Buffer$1.isBuffer(key));
  		  $.checkArgument(hashf.blocksize);

  		  var blocksize = hashf.blocksize / 8;

  		  if (key.length > blocksize) {
  		    key = hashf(key);
  		  } else if (key < blocksize) {
  		    var fill = Buffer$1.alloc(blocksize);
  		    fill.fill(0);
  		    key.copy(fill);
  		    key = fill;
  		  }

  		  var oKey = Buffer$1.alloc(blocksize);
  		  oKey.fill(0x5c);

  		  var iKey = Buffer$1.alloc(blocksize);
  		  iKey.fill(0x36);

  		  var oKeyPad = Buffer$1.alloc(blocksize);
  		  var iKeyPad = Buffer$1.alloc(blocksize);
  		  for (var i = 0; i < blocksize; i++) {
  		    oKeyPad[i] = oKey[i] ^ key[i];
  		    iKeyPad[i] = iKey[i] ^ key[i];
  		  }

  		  return hashf(Buffer$1.concat([oKeyPad, hashf(Buffer$1.concat([iKeyPad, data]))]))
  		};

  		/**
  		 * A SHA256 HMAC.
  		 *
  		 * @param {Buffer} data Data, which can be any size.
  		 * @param {Buffer} key Key, which can be any size.
  		 * @returns {Buffer} The HMAC in the form of a buffer.
  		 */
  		Hash.sha256hmac = function (data, key) {
  		  return Hash.hmac(Hash.sha256, data, key)
  		};

  		/**
  		 * A SHA512 HMAC.
  		 *
  		 * @param {Buffer} data Data, which can be any size.
  		 * @param {Buffer} key Key, which can be any size.
  		 * @returns {Buffer} The HMAC in the form of a buffer.
  		 */
  		Hash.sha512hmac = function (data, key) {
  		  return Hash.hmac(Hash.sha512, data, key)
  		};
  } (hash_browser));
  	return hash_browser.exports;
  }

  var hash_node = {exports: {}};

  var hasRequiredHash_node;

  function requireHash_node () {
  	if (hasRequiredHash_node) return hash_node.exports;
  	hasRequiredHash_node = 1;
  	(function (module) {

  		var crypto = require$$0$2;
  		var $ = preconditions;

  		var Hash = module.exports;

  		/**
  		 * A SHA or SHA1 hash, which is always 160 bits or 20 bytes long.
  		 *
  		 * See:
  		 * https://en.wikipedia.org/wiki/SHA-1
  		 *
  		 * @param {Buffer} buf Data, a.k.a. pre-image, which can be any size.
  		 * @returns {Buffer} The hash in the form of a buffer.
  		 */
  		Hash.sha1 = function (buf) {
  		  $.checkArgument(Buffer$1.isBuffer(buf));
  		  return crypto.createHash('sha1').update(buf).digest()
  		};

  		Hash.sha1.blocksize = 512;

  		/**
  		 * A SHA256 hash, which is always 256 bits or 32 bytes long.
  		 *
  		 * See:
  		 * https://www.movable-type.co.uk/scripts/sha256.html
  		 *
  		 * @param {Buffer} buf Data, a.k.a. pre-image, which can be any size.
  		 * @returns {Buffer} The hash in the form of a buffer.
  		 */
  		Hash.sha256 = function (buf) {
  		  $.checkArgument(Buffer$1.isBuffer(buf));
  		  return crypto.createHash('sha256').update(buf).digest()
  		};

  		Hash.sha256.blocksize = 512;

  		/**
  		 * A double SHA256 hash, which is always 256 bits or 32 bytes bytes long. This
  		 * hash function is commonly used inside Bitcoin, particularly for the hash of a
  		 * block and the hash of a transaction.
  		 *
  		 * See:
  		 * https://www.movable-type.co.uk/scripts/sha256.html
  		 *
  		 * @param {Buffer} buf Data, a.k.a. pre-image, which can be any size.
  		 * @returns {Buffer} The hash in the form of a buffer.
  		 */
  		Hash.sha256sha256 = function (buf) {
  		  $.checkArgument(Buffer$1.isBuffer(buf));
  		  return Hash.sha256(Hash.sha256(buf))
  		};

  		/**
  		 * A RIPEMD160 hash, which is always 160 bits or 20 bytes long.
  		 *
  		 * See:
  		 * https://en.wikipedia.org/wiki/RIPEMD
  		 *
  		 * @param {Buffer} buf Data, a.k.a. pre-image, which can be any size.
  		 * @returns {Buffer} The hash in the form of a buffer.
  		 */
  		Hash.ripemd160 = function (buf) {
  		  $.checkArgument(Buffer$1.isBuffer(buf));
  		  return crypto.createHash('ripemd160').update(buf).digest()
  		};
  		/**
  		 * A RIPEMD160 hash of a SHA256 hash, which is always 160 bits or 20 bytes long.
  		 * This value is commonly used inside Bitcoin, particularly for Bitcoin
  		 * addresses.
  		 *
  		 * See:
  		 * https://en.wikipedia.org/wiki/RIPEMD
  		 *
  		 * @param {Buffer} buf Data, a.k.a. pre-image, which can be any size.
  		 * @returns {Buffer} The hash in the form of a buffer.
  		 */
  		Hash.sha256ripemd160 = function (buf) {
  		  $.checkArgument(Buffer$1.isBuffer(buf));
  		  return Hash.ripemd160(Hash.sha256(buf))
  		};

  		/**
  		 * A SHA512 hash, which is always 512 bits or 64 bytes long.
  		 *
  		 * See:
  		 * https://en.wikipedia.org/wiki/SHA-2
  		 *
  		 * @param {Buffer} buf Data, a.k.a. pre-image, which can be any size.
  		 * @returns {Buffer} The hash in the form of a buffer.
  		 */
  		Hash.sha512 = function (buf) {
  		  $.checkArgument(Buffer$1.isBuffer(buf));
  		  return crypto.createHash('sha512').update(buf).digest()
  		};

  		Hash.sha512.blocksize = 1024;

  		/**
  		 * A way to do HMAC using any underlying hash function. If you ever find that
  		 * you want to hash two pieces of data together, you should use HMAC instead of
  		 * just using a hash function. Rather than doing hash(data1 + data2) you should
  		 * do HMAC(data1, data2). Actually, rather than use HMAC directly, we recommend
  		 * you use either sha256hmac or sha515hmac provided below.
  		 *
  		 * See:
  		 * https://en.wikipedia.org/wiki/Length_extension_attack
  		 * https://blog.skullsecurity.org/2012/everything-you-need-to-know-about-hash-length-extension-attacks
  		 *
  		 * @param {function} hashf Which hash function to use.
  		 * @param {Buffer} data Data, which can be any size.
  		 * @param {Buffer} key Key, which can be any size.
  		 * @returns {Buffer} The HMAC in the form of a buffer.
  		 */
  		Hash.hmac = function (hashf, data, key) {
  		  // http://en.wikipedia.org/wiki/Hash-based_message_authentication_code
  		  // http://tools.ietf.org/html/rfc4868#section-2
  		  $.checkArgument(Buffer$1.isBuffer(data));
  		  $.checkArgument(Buffer$1.isBuffer(key));
  		  $.checkArgument(hashf.blocksize);

  		  var blocksize = hashf.blocksize / 8;

  		  if (key.length > blocksize) {
  		    key = hashf(key);
  		  } else if (key < blocksize) {
  		    var fill = Buffer$1.alloc(blocksize);
  		    fill.fill(0);
  		    key.copy(fill);
  		    key = fill;
  		  }

  		  var oKey = Buffer$1.alloc(blocksize);
  		  oKey.fill(0x5c);

  		  var iKey = Buffer$1.alloc(blocksize);
  		  iKey.fill(0x36);

  		  var oKeyPad = Buffer$1.alloc(blocksize);
  		  var iKeyPad = Buffer$1.alloc(blocksize);
  		  for (var i = 0; i < blocksize; i++) {
  		    oKeyPad[i] = oKey[i] ^ key[i];
  		    iKeyPad[i] = iKey[i] ^ key[i];
  		  }

  		  return hashf(Buffer$1.concat([oKeyPad, hashf(Buffer$1.concat([iKeyPad, data]))]))
  		};

  		/**
  		 * A SHA256 HMAC.
  		 *
  		 * @param {Buffer} data Data, which can be any size.
  		 * @param {Buffer} key Key, which can be any size.
  		 * @returns {Buffer} The HMAC in the form of a buffer.
  		 */
  		Hash.sha256hmac = function (data, key) {
  		  return Hash.hmac(Hash.sha256, data, key)
  		};

  		/**
  		 * A SHA512 HMAC.
  		 *
  		 * @param {Buffer} data Data, which can be any size.
  		 * @param {Buffer} key Key, which can be any size.
  		 * @returns {Buffer} The HMAC in the form of a buffer.
  		 */
  		Hash.sha512hmac = function (data, key) {
  		  return Hash.hmac(Hash.sha512, data, key)
  		};
  } (hash_node));
  	return hash_node.exports;
  }

  (function (module) {
  	if (browser$1.browser) module.exports = requireHash_browser();
  	else module.exports = requireHash_node();
  } (hash));

  var _$7 = __1;

  var JSUtil$1 = js;
  var networks = [];
  var networkMaps = {};

  /**
   * A network is merely a map containing values that correspond to version
   * numbers for each bitcoin network. Currently only supporting "livenet"
   * (a.k.a. "mainnet"), "testnet", "regtest" and "stn".
   * @constructor
   */
  function Network () {}

  Network.prototype.toString = function toString () {
    return this.name
  };

  /**
   * @function
   * @member Networks#get
   * Retrieves the network associated with a magic number or string.
   * @param {string|number|Network} arg
   * @param {string|Array} keys - if set, only check if the magic number associated with this name matches
   * @return Network
   */
  function get (arg, keys) {
    if (~networks.indexOf(arg)) {
      return arg
    }
    if (keys) {
      if (!_$7.isArray(keys)) {
        keys = [keys];
      }
      for (var i = 0; i < networks.length; i++) {
        var network = networks[i];
        var filteredNet = _$7.pick(network, keys);
        var netValues = _$7.values(filteredNet);
        if (~netValues.indexOf(arg)) {
          return network
        }
      }
      return undefined
    }
    return networkMaps[arg]
  }

  /***
   * Derives an array from the given cashAddrPrefix to be used in the computation
   * of the address' checksum.
   *
   * @param {string} cashAddrPrefix Network cashAddrPrefix. E.g.: 'bitcoincash'.
   */
  function cashAddrPrefixToArray (cashAddrPrefix) {
    var result = [];
    for (var i = 0; i < cashAddrPrefix.length; i++) {
      result.push(cashAddrPrefix.charCodeAt(i) & 31);
    }
    return result
  }

  /**
   * @function
   * @member Networks#add
   * Will add a custom Network
   * @param {Object} data
   * @param {string} data.name - The name of the network
   * @param {string} data.alias - The aliased name of the network
   * @param {Number} data.pubkeyhash - The publickey hash cashAddrPrefix
   * @param {Number} data.privatekey - The privatekey cashAddrPrefix
   * @param {Number} data.scripthash - The scripthash cashAddrPrefix
   * @param {Number} data.xpubkey - The extended public key magic
   * @param {Number} data.xprivkey - The extended private key magic
   * @param {Number} data.networkMagic - The network magic number
   * @param {Number} data.port - The network port
   * @param {Array}  data.dnsSeeds - An array of dns seeds
   * @return Network
   */
  function addNetwork (data) {
    var network = new Network();

    JSUtil$1.defineImmutable(network, {
      name: data.name,
      alias: data.alias,
      pubkeyhash: data.pubkeyhash,
      privatekey: data.privatekey,
      scripthash: data.scripthash,
      xpubkey: data.xpubkey,
      xprivkey: data.xprivkey
    });

    var indexBy = data.indexBy || Object.keys(data);

    if (data.cashAddrPrefix) {
      _$7.extend(network, {
        cashAddrPrefix: data.cashAddrPrefix,
        cashAddrPrefixArray: cashAddrPrefixToArray(data.cashAddrPrefix)
      });
    }

    if (data.networkMagic) {
      _$7.extend(network, {
        networkMagic: JSUtil$1.integerAsBuffer(data.networkMagic)
      });
    }

    if (data.port) {
      _$7.extend(network, {
        port: data.port
      });
    }

    if (data.dnsSeeds) {
      _$7.extend(network, {
        dnsSeeds: data.dnsSeeds
      });
    }
    networks.push(network);
    indexNetworkBy(network, indexBy);
    return network
  }

  function indexNetworkBy (network, keys) {
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var networkValue = network[key];
      if (!_$7.isUndefined(networkValue) && !_$7.isObject(networkValue)) {
        networkMaps[networkValue] = network;
      }
    }
  }

  function unindexNetworkBy (network, values) {
    for (var index = 0; index < values.length; index++) {
      var value = values[index];
      if (networkMaps[value] === network) {
        delete networkMaps[value];
      }
    }
  }

  /**
   * @function
   * @member Networks#remove
   * Will remove a custom network
   * @param {Network} network
   */
  function removeNetwork (network) {
    for (var i = 0; i < networks.length; i++) {
      if (networks[i] === network) {
        networks.splice(i, 1);
      }
    }
    unindexNetworkBy(network, Object.keys(networkMaps));
  }

  var networkMagic = {
    livenet: 0xe3e1f3e8,
    testnet: 0xf4e5f3f4,
    regtest: 0xdab5bffa,
    stn: 0xfbcec4f9
  };

  var dnsSeeds = [
    'seed.bitcoinsv.org',
    'seed.bitcoinunlimited.info'
  ];

  var TESTNET = {
    PORT: 18333,
    NETWORK_MAGIC: networkMagic.testnet,
    DNS_SEEDS: dnsSeeds,
    PREFIX: 'testnet',
    CASHADDRPREFIX: 'bchtest'
  };

  var REGTEST = {
    PORT: 18444,
    NETWORK_MAGIC: networkMagic.regtest,
    DNS_SEEDS: [],
    PREFIX: 'regtest',
    CASHADDRPREFIX: 'bchreg'
  };

  var STN = {
    PORT: 9333,
    NETWORK_MAGIC: networkMagic.stn,
    DNS_SEEDS: ['stn-seed.bitcoinsv.io'],
    PREFIX: 'stn',
    CASHADDRPREFIX: 'bsvstn'
  };

  var liveNetwork = {
    name: 'livenet',
    alias: 'mainnet',
    prefix: 'bitcoin',
    cashAddrPrefix: 'bitcoincash',
    pubkeyhash: 0x00,
    privatekey: 0x80,
    scripthash: 0x05,
    xpubkey: 0x0488b21e,
    xprivkey: 0x0488ade4,
    networkMagic: networkMagic.livenet,
    port: 8333,
    dnsSeeds: dnsSeeds
  };

  // network magic, port, cashAddrPrefix, and dnsSeeds are overloaded by enableRegtest
  var testNetwork = {
    name: 'testnet',
    prefix: TESTNET.PREFIX,
    cashAddrPrefix: TESTNET.CASHADDRPREFIX,
    pubkeyhash: 0x6f,
    privatekey: 0xef,
    scripthash: 0xc4,
    xpubkey: 0x043587cf,
    xprivkey: 0x04358394,
    networkMagic: TESTNET.NETWORK_MAGIC
  };

  var regtestNetwork = {
    name: 'regtest',
    prefix: REGTEST.PREFIX,
    cashAddrPrefix: REGTEST.CASHADDRPREFIX,
    pubkeyhash: 0x6f,
    privatekey: 0xef,
    scripthash: 0xc4,
    xpubkey: 0x043587cf,
    xprivkey: 0x04358394,
    networkMagic: REGTEST.NETWORK_MAGIC,
    port: REGTEST.PORT,
    dnsSeeds: [],
    indexBy: [
      'port',
      'name',
      'cashAddrPrefix',
      'networkMagic'
    ]
  };
  var stnNetwork = {
    name: 'stn',
    prefix: STN.PREFIX,
    cashAddrPrefix: STN.CASHADDRPREFIX,
    pubkeyhash: 0x6f,
    privatekey: 0xef,
    scripthash: 0xc4,
    xpubkey: 0x043587cf,
    xprivkey: 0x04358394,
    networkMagic: STN.NETWORK_MAGIC,
    indexBy: [
      'port',
      'name',
      'cashAddrPrefix',
      'networkMagic'
    ]
  };
  // Add configurable values for testnet/regtest

  addNetwork(testNetwork);
  addNetwork(stnNetwork);
  addNetwork(regtestNetwork);
  addNetwork(liveNetwork);

  var livenet = get('livenet');
  var regtest = get('regtest');
  var testnet = get('testnet');
  var stn = get('stn');

  Object.defineProperty(testnet, 'port', {
    enumerable: true,
    configurable: false,
    get: function () {
      if (this.regtestEnabled) {
        return REGTEST.PORT
      } else if (this.stnEnabled) {
        return STN.PORT
      } else {
        return TESTNET.PORT
      }
    }
  });

  Object.defineProperty(testnet, 'networkMagic', {
    enumerable: true,
    configurable: false,
    get: function () {
      if (this.regtestEnabled) {
        return JSUtil$1.integerAsBuffer(REGTEST.NETWORK_MAGIC)
      } else if (this.stnEnabled) {
        return JSUtil$1.integerAsBuffer(STN.NETWORK_MAGIC)
      } else {
        return JSUtil$1.integerAsBuffer(TESTNET.NETWORK_MAGIC)
      }
    }
  });

  Object.defineProperty(testnet, 'dnsSeeds', {
    enumerable: true,
    configurable: false,
    get: function () {
      if (this.regtestEnabled) {
        return REGTEST.DNS_SEEDS
      } else if (this.stnEnabled) {
        return STN.DNS_SEEDS
      } else {
        return TESTNET.DNS_SEEDS
      }
    }
  });

  Object.defineProperty(testnet, 'cashAddrPrefix', {
    enumerable: true,
    configurable: false,
    get: function () {
      if (this.regtestEnabled) {
        return REGTEST.CASHADDRPREFIX
      } else if (this.stnEnabled) {
        return STN.CASHADDRPREFIX
      } else {
        return TESTNET.CASHADDRPREFIX
      }
    }
  });

  Object.defineProperty(testnet, 'cashAddrPrefixArray', {
    enumerable: true,
    configurable: false,
    get: function () {
      if (this.regtestEnabled) {
        return cashAddrPrefixToArray(REGTEST.CASHADDRPREFIX)
      } else if (this.stnEnabled) {
        return STN.cashAddrPrefixToArray(STN.CASHADDRPREFIX)
      } else {
        return cashAddrPrefixToArray(TESTNET.CASHADDRPREFIX)
      }
    }
  });

  /**
   * @function
   * @member Networks#enableRegtest
   * Will enable regtest features for testnet
   */
  function enableRegtest () {
    testnet.regtestEnabled = true;
  }

  /**
   * @function
   * @member Networks#disableRegtest
   * Will disable regtest features for testnet
   */
  function disableRegtest () {
    testnet.regtestEnabled = false;
  }
  /**
   * @function
   * @member Networks#enableStn
   * Will enable stn features for testnet
   */
  function enableStn () {
    testnet.stnEnabled = true;
  }

  /**
   * @function
   * @member Networks#disableStn
   * Will disable stn features for testnet
   */
  function disableStn () {
    testnet.stnEnabled = false;
  }

  /**
   * @namespace Networks
   */
  var networks_1 = {
    add: addNetwork,
    remove: removeNetwork,
    defaultNetwork: livenet,
    livenet: livenet,
    mainnet: livenet,
    testnet: testnet,
    regtest: regtest,
    stn: stn,
    get: get,
    enableRegtest: enableRegtest,
    disableRegtest: disableRegtest,
    enableStn: enableStn,
    disableStn: disableStn
  };

  var safeBuffer = {exports: {}};

  /*! safe-buffer. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> */

  (function (module, exports) {
  	/* eslint-disable node/no-deprecated-api */
  	var buffer = require$$0$4;
  	var Buffer = buffer.Buffer;

  	// alternative to using Object.keys for old browsers
  	function copyProps (src, dst) {
  	  for (var key in src) {
  	    dst[key] = src[key];
  	  }
  	}
  	if (Buffer.from && Buffer.alloc && Buffer.allocUnsafe && Buffer.allocUnsafeSlow) {
  	  module.exports = buffer;
  	} else {
  	  // Copy properties from require('buffer')
  	  copyProps(buffer, exports);
  	  exports.Buffer = SafeBuffer;
  	}

  	function SafeBuffer (arg, encodingOrOffset, length) {
  	  return Buffer(arg, encodingOrOffset, length)
  	}

  	SafeBuffer.prototype = Object.create(Buffer.prototype);

  	// Copy static methods from Buffer
  	copyProps(Buffer, SafeBuffer);

  	SafeBuffer.from = function (arg, encodingOrOffset, length) {
  	  if (typeof arg === 'number') {
  	    throw new TypeError('Argument must not be a number')
  	  }
  	  return Buffer(arg, encodingOrOffset, length)
  	};

  	SafeBuffer.alloc = function (size, fill, encoding) {
  	  if (typeof size !== 'number') {
  	    throw new TypeError('Argument must be a number')
  	  }
  	  var buf = Buffer(size);
  	  if (fill !== undefined) {
  	    if (typeof encoding === 'string') {
  	      buf.fill(fill, encoding);
  	    } else {
  	      buf.fill(fill);
  	    }
  	  } else {
  	    buf.fill(0);
  	  }
  	  return buf
  	};

  	SafeBuffer.allocUnsafe = function (size) {
  	  if (typeof size !== 'number') {
  	    throw new TypeError('Argument must be a number')
  	  }
  	  return Buffer(size)
  	};

  	SafeBuffer.allocUnsafeSlow = function (size) {
  	  if (typeof size !== 'number') {
  	    throw new TypeError('Argument must be a number')
  	  }
  	  return buffer.SlowBuffer(size)
  	};
  } (safeBuffer, safeBuffer.exports));

  // base-x encoding / decoding
  // Copyright (c) 2018 base-x contributors
  // Copyright (c) 2014-2018 The Bitcoin Core developers (base58.cpp)
  // Distributed under the MIT software license, see the accompanying
  // file LICENSE or http://www.opensource.org/licenses/mit-license.php.
  // @ts-ignore
  var _Buffer = safeBuffer.exports.Buffer;
  function base (ALPHABET) {
    if (ALPHABET.length >= 255) { throw new TypeError('Alphabet too long') }
    var BASE_MAP = new Uint8Array(256);
    for (var j = 0; j < BASE_MAP.length; j++) {
      BASE_MAP[j] = 255;
    }
    for (var i = 0; i < ALPHABET.length; i++) {
      var x = ALPHABET.charAt(i);
      var xc = x.charCodeAt(0);
      if (BASE_MAP[xc] !== 255) { throw new TypeError(x + ' is ambiguous') }
      BASE_MAP[xc] = i;
    }
    var BASE = ALPHABET.length;
    var LEADER = ALPHABET.charAt(0);
    var FACTOR = Math.log(BASE) / Math.log(256); // log(BASE) / log(256), rounded up
    var iFACTOR = Math.log(256) / Math.log(BASE); // log(256) / log(BASE), rounded up
    function encode (source) {
      if (Array.isArray(source) || source instanceof Uint8Array) { source = _Buffer.from(source); }
      if (!_Buffer.isBuffer(source)) { throw new TypeError('Expected Buffer') }
      if (source.length === 0) { return '' }
          // Skip & count leading zeroes.
      var zeroes = 0;
      var length = 0;
      var pbegin = 0;
      var pend = source.length;
      while (pbegin !== pend && source[pbegin] === 0) {
        pbegin++;
        zeroes++;
      }
          // Allocate enough space in big-endian base58 representation.
      var size = ((pend - pbegin) * iFACTOR + 1) >>> 0;
      var b58 = new Uint8Array(size);
          // Process the bytes.
      while (pbegin !== pend) {
        var carry = source[pbegin];
              // Apply "b58 = b58 * 256 + ch".
        var i = 0;
        for (var it1 = size - 1; (carry !== 0 || i < length) && (it1 !== -1); it1--, i++) {
          carry += (256 * b58[it1]) >>> 0;
          b58[it1] = (carry % BASE) >>> 0;
          carry = (carry / BASE) >>> 0;
        }
        if (carry !== 0) { throw new Error('Non-zero carry') }
        length = i;
        pbegin++;
      }
          // Skip leading zeroes in base58 result.
      var it2 = size - length;
      while (it2 !== size && b58[it2] === 0) {
        it2++;
      }
          // Translate the result into a string.
      var str = LEADER.repeat(zeroes);
      for (; it2 < size; ++it2) { str += ALPHABET.charAt(b58[it2]); }
      return str
    }
    function decodeUnsafe (source) {
      if (typeof source !== 'string') { throw new TypeError('Expected String') }
      if (source.length === 0) { return _Buffer.alloc(0) }
      var psz = 0;
          // Skip and count leading '1's.
      var zeroes = 0;
      var length = 0;
      while (source[psz] === LEADER) {
        zeroes++;
        psz++;
      }
          // Allocate enough space in big-endian base256 representation.
      var size = (((source.length - psz) * FACTOR) + 1) >>> 0; // log(58) / log(256), rounded up.
      var b256 = new Uint8Array(size);
          // Process the characters.
      while (psz < source.length) {
              // Decode character
        var carry = BASE_MAP[source.charCodeAt(psz)];
              // Invalid character
        if (carry === 255) { return }
        var i = 0;
        for (var it3 = size - 1; (carry !== 0 || i < length) && (it3 !== -1); it3--, i++) {
          carry += (BASE * b256[it3]) >>> 0;
          b256[it3] = (carry % 256) >>> 0;
          carry = (carry / 256) >>> 0;
        }
        if (carry !== 0) { throw new Error('Non-zero carry') }
        length = i;
        psz++;
      }
          // Skip leading zeroes in b256.
      var it4 = size - length;
      while (it4 !== size && b256[it4] === 0) {
        it4++;
      }
      var vch = _Buffer.allocUnsafe(zeroes + (size - it4));
      vch.fill(0x00, 0, zeroes);
      var j = zeroes;
      while (it4 !== size) {
        vch[j++] = b256[it4++];
      }
      return vch
    }
    function decode (string) {
      var buffer = decodeUnsafe(string);
      if (buffer) { return buffer }
      throw new Error('Non-base' + BASE + ' character')
    }
    return {
      encode: encode,
      decodeUnsafe: decodeUnsafe,
      decode: decode
    }
  }
  var src = base;

  var basex = src;
  var ALPHABET$1 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

  var bs58$1 = basex(ALPHABET$1);

  var _$6 = __1;
  var bs58 = bs58$1;
  var buffer$1 = require$$0$4;

  /**
   * The alphabet for the Bitcoin-specific Base 58 encoding distinguishes between
   * lower case L and upper case i - neither of those characters are allowed to
   * prevent accidentaly miscopying of letters.
   */
  var ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'.split('');

  /**
   * A Base58 object can encode/decoded Base 58, which is used primarily for
   * string-formatted Bitcoin addresses and private keys. Addresses and private
   * keys actually use an additional checksum, and so they actually use the
   * Base58Check class.
   *
   * @param {object} obj Can be a string or buffer.
   */
  var Base58$1 = function Base58 (obj) {
    if (!(this instanceof Base58)) {
      return new Base58(obj)
    }
    if (Buffer$1.isBuffer(obj)) {
      var buf = obj;
      this.fromBuffer(buf);
    } else if (typeof obj === 'string') {
      var str = obj;
      this.fromString(str);
    }
  };

  Base58$1.validCharacters = function validCharacters (chars) {
    if (buffer$1.Buffer.isBuffer(chars)) {
      chars = chars.toString();
    }
    return _$6.every(_$6.map(chars, function (char) { return _$6.includes(ALPHABET, char) }))
  };

  Base58$1.prototype.set = function (obj) {
    this.buf = obj.buf || this.buf || undefined;
    return this
  };

  /**
   * Encode a buffer to Bsae 58.
   *
   * @param {Buffer} buf Any buffer to be encoded.
   * @returns {string} A Base 58 encoded string.
   */
  Base58$1.encode = function (buf) {
    if (!buffer$1.Buffer.isBuffer(buf)) {
      throw new Error('Input should be a buffer')
    }
    return bs58.encode(buf)
  };

  /**
   * Decode a Base 58 string to a buffer.
   *
   * @param {string} str A Base 58 encoded string.
   * @returns {Buffer} The decoded buffer.
   */
  Base58$1.decode = function (str) {
    if (typeof str !== 'string') {
      throw new Error('Input should be a string')
    }
    return Buffer$1.from(bs58.decode(str))
  };

  Base58$1.prototype.fromBuffer = function (buf) {
    this.buf = buf;
    return this
  };

  Base58$1.fromBuffer = function (buf) {
    return new Base58$1().fromBuffer(buf)
  };

  Base58$1.fromHex = function (hex) {
    return Base58$1.fromBuffer(Buffer$1.from(hex, 'hex'))
  };

  Base58$1.prototype.fromString = function (str) {
    var buf = Base58$1.decode(str);
    this.buf = buf;
    return this
  };

  Base58$1.fromString = function (str) {
    return new Base58$1().fromString(str)
  };

  Base58$1.prototype.toBuffer = function () {
    return this.buf
  };

  Base58$1.prototype.toHex = function () {
    return this.toBuffer().toString('hex')
  };

  Base58$1.prototype.toString = function () {
    return Base58$1.encode(this.buf)
  };

  var base58 = Base58$1;

  var _$5 = __1;
  var Base58 = base58;
  var buffer = require$$0$4;
  var sha256sha256 = hash.exports.sha256sha256;

  /**
   * A Base58check object can encode/decodd Base 58, which is used primarily for
   * string-formatted Bitcoin addresses and private keys. This is the same as
   * Base58, except that it includes a checksum to prevent accidental mistypings.
   *
   * @param {object} obj Can be a string or buffer.
   */
  var Base58Check = function Base58Check (obj) {
    if (!(this instanceof Base58Check)) { return new Base58Check(obj) }
    if (Buffer$1.isBuffer(obj)) {
      var buf = obj;
      this.fromBuffer(buf);
    } else if (typeof obj === 'string') {
      var str = obj;
      this.fromString(str);
    }
  };

  Base58Check.prototype.set = function (obj) {
    this.buf = obj.buf || this.buf || undefined;
    return this
  };

  Base58Check.validChecksum = function validChecksum (data, checksum) {
    if (_$5.isString(data)) {
      data = buffer.Buffer.from(Base58.decode(data));
    }
    if (_$5.isString(checksum)) {
      checksum = buffer.Buffer.from(Base58.decode(checksum));
    }
    if (!checksum) {
      checksum = data.slice(-4);
      data = data.slice(0, -4);
    }
    return Base58Check.checksum(data).toString('hex') === checksum.toString('hex')
  };

  Base58Check.decode = function (s) {
    if (typeof s !== 'string') { throw new Error('Input must be a string') }

    var buf = Buffer$1.from(Base58.decode(s));

    if (buf.length < 4) { throw new Error('Input string too short') }

    var data = buf.slice(0, -4);
    var csum = buf.slice(-4);

    var hash = sha256sha256(data);
    var hash4 = hash.slice(0, 4);

    if (csum.toString('hex') !== hash4.toString('hex')) { throw new Error('Checksum mismatch') }

    return data
  };

  Base58Check.checksum = function (buffer) {
    return sha256sha256(buffer).slice(0, 4)
  };

  Base58Check.encode = function (buf) {
    if (!Buffer$1.isBuffer(buf)) { throw new Error('Input must be a buffer') }
    var checkedBuf = Buffer$1.alloc(buf.length + 4);
    var hash = Base58Check.checksum(buf);
    buf.copy(checkedBuf);
    hash.copy(checkedBuf, buf.length);
    return Base58.encode(checkedBuf)
  };

  Base58Check.prototype.fromBuffer = function (buf) {
    this.buf = buf;
    return this
  };

  Base58Check.fromBuffer = function (buf) {
    return new Base58Check().fromBuffer(buf)
  };

  Base58Check.fromHex = function (hex) {
    return Base58Check.fromBuffer(Buffer$1.from(hex, 'hex'))
  };

  Base58Check.prototype.fromString = function (str) {
    var buf = Base58Check.decode(str);
    this.buf = buf;
    return this
  };

  Base58Check.fromString = function (str) {
    var buf = Base58Check.decode(str);
    return new Base58(buf)
  };

  Base58Check.prototype.toBuffer = function () {
    return this.buf
  };

  Base58Check.prototype.toHex = function () {
    return this.toBuffer().toString('hex')
  };

  Base58Check.prototype.toString = function () {
    return Base58Check.encode(this.buf)
  };

  var base58check = Base58Check;

  var script$1 = {exports: {}};

  var _$4 = __1;
  var $$4 = preconditions;
  var BN$4 = bn$1;

  var BufferReader$5 = function BufferReader (buf) {
    if (!(this instanceof BufferReader)) {
      return new BufferReader(buf)
    }
    if (_$4.isUndefined(buf)) {
      return
    }
    if (Buffer$1.isBuffer(buf)) {
      this.set({
        buf: buf
      });
    } else if (_$4.isString(buf)) {
      var b = Buffer$1.from(buf, 'hex');
      if (b.length * 2 !== buf.length) { throw new TypeError('Invalid hex string') }

      this.set({
        buf: b
      });
    } else if (_$4.isObject(buf)) {
      var obj = buf;
      this.set(obj);
    } else {
      throw new TypeError('Unrecognized argument for BufferReader')
    }
  };

  BufferReader$5.prototype.set = function (obj) {
    this.buf = obj.buf || this.buf || undefined;
    this.pos = obj.pos || this.pos || 0;
    return this
  };

  BufferReader$5.prototype.eof = function () {
    return this.pos >= this.buf.length
  };

  BufferReader$5.prototype.finished = BufferReader$5.prototype.eof;

  BufferReader$5.prototype.read = function (len) {
    $$4.checkArgument(!_$4.isUndefined(len), 'Must specify a length');
    var buf = this.buf.slice(this.pos, this.pos + len);
    this.pos = this.pos + len;
    return buf
  };

  BufferReader$5.prototype.readAll = function () {
    var buf = this.buf.slice(this.pos, this.buf.length);
    this.pos = this.buf.length;
    return buf
  };

  BufferReader$5.prototype.readUInt8 = function () {
    var val = this.buf.readUInt8(this.pos);
    this.pos = this.pos + 1;
    return val
  };

  BufferReader$5.prototype.readUInt16BE = function () {
    var val = this.buf.readUInt16BE(this.pos);
    this.pos = this.pos + 2;
    return val
  };

  BufferReader$5.prototype.readUInt16LE = function () {
    var val = this.buf.readUInt16LE(this.pos);
    this.pos = this.pos + 2;
    return val
  };

  BufferReader$5.prototype.readUInt32BE = function () {
    var val = this.buf.readUInt32BE(this.pos);
    this.pos = this.pos + 4;
    return val
  };

  BufferReader$5.prototype.readUInt32LE = function () {
    var val = this.buf.readUInt32LE(this.pos);
    this.pos = this.pos + 4;
    return val
  };

  BufferReader$5.prototype.readInt32LE = function () {
    var val = this.buf.readInt32LE(this.pos);
    this.pos = this.pos + 4;
    return val
  };

  BufferReader$5.prototype.readUInt64BEBN = function () {
    var buf = this.buf.slice(this.pos, this.pos + 8);
    var bn = BN$4.fromBuffer(buf);
    this.pos = this.pos + 8;
    return bn
  };

  BufferReader$5.prototype.readUInt64LEBN = function () {
    var second = this.buf.readUInt32LE(this.pos);
    var first = this.buf.readUInt32LE(this.pos + 4);
    var combined = (first * 0x100000000) + second;
    // Instantiating an instance of BN with a number is faster than with an
    // array or string. However, the maximum safe number for a double precision
    // floating point is 2 ^ 52 - 1 (0x1fffffffffffff), thus we can safely use
    // non-floating point numbers less than this amount (52 bits). And in the case
    // that the number is larger, we can instatiate an instance of BN by passing
    // an array from the buffer (slower) and specifying the endianness.
    var bn;
    if (combined <= 0x1fffffffffffff) {
      bn = new BN$4(combined);
    } else {
      var data = Array.prototype.slice.call(this.buf, this.pos, this.pos + 8);
      bn = new BN$4(data, 10, 'le');
    }
    this.pos = this.pos + 8;
    return bn
  };

  BufferReader$5.prototype.readVarintNum = function () {
    var first = this.readUInt8();
    switch (first) {
      case 0xFD:
        return this.readUInt16LE()
      case 0xFE:
        return this.readUInt32LE()
      case 0xFF:
        var bn = this.readUInt64LEBN();
        var n = bn.toNumber();
        if (n <= Math.pow(2, 53)) {
          return n
        } else {
          throw new Error('number too large to retain precision - use readVarintBN')
        }
        // break // unreachable
      default:
        return first
    }
  };

  /**
   * reads a length prepended buffer
   */
  BufferReader$5.prototype.readVarLengthBuffer = function () {
    var len = this.readVarintNum();
    var buf = this.read(len);
    $$4.checkState(buf.length === len, 'Invalid length while reading varlength buffer. ' +
      'Expected to read: ' + len + ' and read ' + buf.length);
    return buf
  };

  BufferReader$5.prototype.readVarintBuf = function () {
    var first = this.buf.readUInt8(this.pos);
    switch (first) {
      case 0xFD:
        return this.read(1 + 2)
      case 0xFE:
        return this.read(1 + 4)
      case 0xFF:
        return this.read(1 + 8)
      default:
        return this.read(1)
    }
  };

  BufferReader$5.prototype.readVarintBN = function () {
    var first = this.readUInt8();
    switch (first) {
      case 0xFD:
        return new BN$4(this.readUInt16LE())
      case 0xFE:
        return new BN$4(this.readUInt32LE())
      case 0xFF:
        return this.readUInt64LEBN()
      default:
        return new BN$4(first)
    }
  };

  BufferReader$5.prototype.reverse = function () {
    var buf = Buffer$1.alloc(this.buf.length);
    for (var i = 0; i < buf.length; i++) {
      buf[i] = this.buf[this.buf.length - 1 - i];
    }
    this.buf = buf;
    return this
  };

  BufferReader$5.prototype.readReverse = function (len) {
    if (_$4.isUndefined(len)) {
      len = this.buf.length;
    }
    var buf = this.buf.slice(this.pos, this.pos + len);
    this.pos = this.pos + len;
    return Buffer$1.from(buf).reverse()
  };

  var bufferreader = BufferReader$5;

  function compare(a, b) {
    if (a === b) {
      return 0;
    }

    var x = a.length;
    var y = b.length;

    for (var i = 0, len = Math.min(x, y); i < len; ++i) {
      if (a[i] !== b[i]) {
        x = a[i];
        y = b[i];
        break;
      }
    }

    if (x < y) {
      return -1;
    }
    if (y < x) {
      return 1;
    }
    return 0;
  }
  var hasOwn = Object.prototype.hasOwnProperty;

  var objectKeys = Object.keys || function (obj) {
    var keys = [];
    for (var key in obj) {
      if (hasOwn.call(obj, key)) keys.push(key);
    }
    return keys;
  };
  var pSlice = Array.prototype.slice;
  var _functionsHaveNames;
  function functionsHaveNames() {
    if (typeof _functionsHaveNames !== 'undefined') {
      return _functionsHaveNames;
    }
    return _functionsHaveNames = (function () {
      return function foo() {}.name === 'foo';
    }());
  }
  function pToString (obj) {
    return Object.prototype.toString.call(obj);
  }
  function isView(arrbuf) {
    if (isBuffer$1(arrbuf)) {
      return false;
    }
    if (typeof global$1.ArrayBuffer !== 'function') {
      return false;
    }
    if (typeof ArrayBuffer.isView === 'function') {
      return ArrayBuffer.isView(arrbuf);
    }
    if (!arrbuf) {
      return false;
    }
    if (arrbuf instanceof DataView) {
      return true;
    }
    if (arrbuf.buffer && arrbuf.buffer instanceof ArrayBuffer) {
      return true;
    }
    return false;
  }
  // 1. The assert module provides functions that throw
  // AssertionError's when particular conditions are not met. The
  // assert module must conform to the following interface.

  function assert$1(value, message) {
    if (!value) fail(value, true, message, '==', ok);
  }

  // 2. The AssertionError is defined in assert.
  // new assert.AssertionError({ message: message,
  //                             actual: actual,
  //                             expected: expected })

  var regex = /\s*function\s+([^\(\s]*)\s*/;
  // based on https://github.com/ljharb/function.prototype.name/blob/adeeeec8bfcc6068b187d7d9fb3d5bb1d3a30899/implementation.js
  function getName(func) {
    if (!isFunction(func)) {
      return;
    }
    if (functionsHaveNames()) {
      return func.name;
    }
    var str = func.toString();
    var match = str.match(regex);
    return match && match[1];
  }
  assert$1.AssertionError = AssertionError;
  function AssertionError(options) {
    this.name = 'AssertionError';
    this.actual = options.actual;
    this.expected = options.expected;
    this.operator = options.operator;
    if (options.message) {
      this.message = options.message;
      this.generatedMessage = false;
    } else {
      this.message = getMessage(this);
      this.generatedMessage = true;
    }
    var stackStartFunction = options.stackStartFunction || fail;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, stackStartFunction);
    } else {
      // non v8 browsers so we can have a stacktrace
      var err = new Error();
      if (err.stack) {
        var out = err.stack;

        // try to strip useless frames
        var fn_name = getName(stackStartFunction);
        var idx = out.indexOf('\n' + fn_name);
        if (idx >= 0) {
          // once we have located the function frame
          // we need to strip out everything before it (and its line)
          var next_line = out.indexOf('\n', idx + 1);
          out = out.substring(next_line + 1);
        }

        this.stack = out;
      }
    }
  }

  // assert.AssertionError instanceof Error
  inherits$6(AssertionError, Error);

  function truncate(s, n) {
    if (typeof s === 'string') {
      return s.length < n ? s : s.slice(0, n);
    } else {
      return s;
    }
  }
  function inspect(something) {
    if (functionsHaveNames() || !isFunction(something)) {
      return inspect$1(something);
    }
    var rawname = getName(something);
    var name = rawname ? ': ' + rawname : '';
    return '[Function' +  name + ']';
  }
  function getMessage(self) {
    return truncate(inspect(self.actual), 128) + ' ' +
           self.operator + ' ' +
           truncate(inspect(self.expected), 128);
  }

  // At present only the three keys mentioned above are used and
  // understood by the spec. Implementations or sub modules can pass
  // other keys to the AssertionError's constructor - they will be
  // ignored.

  // 3. All of the following functions must throw an AssertionError
  // when a corresponding condition is not met, with a message that
  // may be undefined if not provided.  All assertion methods provide
  // both the actual and expected values to the assertion error for
  // display purposes.

  function fail(actual, expected, message, operator, stackStartFunction) {
    throw new AssertionError({
      message: message,
      actual: actual,
      expected: expected,
      operator: operator,
      stackStartFunction: stackStartFunction
    });
  }

  // EXTENSION! allows for well behaved errors defined elsewhere.
  assert$1.fail = fail;

  // 4. Pure assertion tests whether a value is truthy, as determined
  // by !!guard.
  // assert.ok(guard, message_opt);
  // This statement is equivalent to assert.equal(true, !!guard,
  // message_opt);. To test strictly for the value true, use
  // assert.strictEqual(true, guard, message_opt);.

  function ok(value, message) {
    if (!value) fail(value, true, message, '==', ok);
  }
  assert$1.ok = ok;

  // 5. The equality assertion tests shallow, coercive equality with
  // ==.
  // assert.equal(actual, expected, message_opt);
  assert$1.equal = equal;
  function equal(actual, expected, message) {
    if (actual != expected) fail(actual, expected, message, '==', equal);
  }

  // 6. The non-equality assertion tests for whether two objects are not equal
  // with != assert.notEqual(actual, expected, message_opt);
  assert$1.notEqual = notEqual;
  function notEqual(actual, expected, message) {
    if (actual == expected) {
      fail(actual, expected, message, '!=', notEqual);
    }
  }

  // 7. The equivalence assertion tests a deep equality relation.
  // assert.deepEqual(actual, expected, message_opt);
  assert$1.deepEqual = deepEqual;
  function deepEqual(actual, expected, message) {
    if (!_deepEqual(actual, expected, false)) {
      fail(actual, expected, message, 'deepEqual', deepEqual);
    }
  }
  assert$1.deepStrictEqual = deepStrictEqual;
  function deepStrictEqual(actual, expected, message) {
    if (!_deepEqual(actual, expected, true)) {
      fail(actual, expected, message, 'deepStrictEqual', deepStrictEqual);
    }
  }

  function _deepEqual(actual, expected, strict, memos) {
    // 7.1. All identical values are equivalent, as determined by ===.
    if (actual === expected) {
      return true;
    } else if (isBuffer$1(actual) && isBuffer$1(expected)) {
      return compare(actual, expected) === 0;

    // 7.2. If the expected value is a Date object, the actual value is
    // equivalent if it is also a Date object that refers to the same time.
    } else if (isDate(actual) && isDate(expected)) {
      return actual.getTime() === expected.getTime();

    // 7.3 If the expected value is a RegExp object, the actual value is
    // equivalent if it is also a RegExp object with the same source and
    // properties (`global`, `multiline`, `lastIndex`, `ignoreCase`).
    } else if (isRegExp(actual) && isRegExp(expected)) {
      return actual.source === expected.source &&
             actual.global === expected.global &&
             actual.multiline === expected.multiline &&
             actual.lastIndex === expected.lastIndex &&
             actual.ignoreCase === expected.ignoreCase;

    // 7.4. Other pairs that do not both pass typeof value == 'object',
    // equivalence is determined by ==.
    } else if ((actual === null || typeof actual !== 'object') &&
               (expected === null || typeof expected !== 'object')) {
      return strict ? actual === expected : actual == expected;

    // If both values are instances of typed arrays, wrap their underlying
    // ArrayBuffers in a Buffer each to increase performance
    // This optimization requires the arrays to have the same type as checked by
    // Object.prototype.toString (aka pToString). Never perform binary
    // comparisons for Float*Arrays, though, since e.g. +0 === -0 but their
    // bit patterns are not identical.
    } else if (isView(actual) && isView(expected) &&
               pToString(actual) === pToString(expected) &&
               !(actual instanceof Float32Array ||
                 actual instanceof Float64Array)) {
      return compare(new Uint8Array(actual.buffer),
                     new Uint8Array(expected.buffer)) === 0;

    // 7.5 For all other Object pairs, including Array objects, equivalence is
    // determined by having the same number of owned properties (as verified
    // with Object.prototype.hasOwnProperty.call), the same set of keys
    // (although not necessarily the same order), equivalent values for every
    // corresponding key, and an identical 'prototype' property. Note: this
    // accounts for both named and indexed properties on Arrays.
    } else if (isBuffer$1(actual) !== isBuffer$1(expected)) {
      return false;
    } else {
      memos = memos || {actual: [], expected: []};

      var actualIndex = memos.actual.indexOf(actual);
      if (actualIndex !== -1) {
        if (actualIndex === memos.expected.indexOf(expected)) {
          return true;
        }
      }

      memos.actual.push(actual);
      memos.expected.push(expected);

      return objEquiv(actual, expected, strict, memos);
    }
  }

  function isArguments(object) {
    return Object.prototype.toString.call(object) == '[object Arguments]';
  }

  function objEquiv(a, b, strict, actualVisitedObjects) {
    if (a === null || a === undefined || b === null || b === undefined)
      return false;
    // if one is a primitive, the other must be same
    if (isPrimitive(a) || isPrimitive(b))
      return a === b;
    if (strict && Object.getPrototypeOf(a) !== Object.getPrototypeOf(b))
      return false;
    var aIsArgs = isArguments(a);
    var bIsArgs = isArguments(b);
    if ((aIsArgs && !bIsArgs) || (!aIsArgs && bIsArgs))
      return false;
    if (aIsArgs) {
      a = pSlice.call(a);
      b = pSlice.call(b);
      return _deepEqual(a, b, strict);
    }
    var ka = objectKeys(a);
    var kb = objectKeys(b);
    var key, i;
    // having the same number of owned properties (keys incorporates
    // hasOwnProperty)
    if (ka.length !== kb.length)
      return false;
    //the same set of keys (although not necessarily the same order),
    ka.sort();
    kb.sort();
    //~~~cheap key test
    for (i = ka.length - 1; i >= 0; i--) {
      if (ka[i] !== kb[i])
        return false;
    }
    //equivalent values for every corresponding key, and
    //~~~possibly expensive deep test
    for (i = ka.length - 1; i >= 0; i--) {
      key = ka[i];
      if (!_deepEqual(a[key], b[key], strict, actualVisitedObjects))
        return false;
    }
    return true;
  }

  // 8. The non-equivalence assertion tests for any deep inequality.
  // assert.notDeepEqual(actual, expected, message_opt);
  assert$1.notDeepEqual = notDeepEqual;
  function notDeepEqual(actual, expected, message) {
    if (_deepEqual(actual, expected, false)) {
      fail(actual, expected, message, 'notDeepEqual', notDeepEqual);
    }
  }

  assert$1.notDeepStrictEqual = notDeepStrictEqual;
  function notDeepStrictEqual(actual, expected, message) {
    if (_deepEqual(actual, expected, true)) {
      fail(actual, expected, message, 'notDeepStrictEqual', notDeepStrictEqual);
    }
  }


  // 9. The strict equality assertion tests strict equality, as determined by ===.
  // assert.strictEqual(actual, expected, message_opt);
  assert$1.strictEqual = strictEqual;
  function strictEqual(actual, expected, message) {
    if (actual !== expected) {
      fail(actual, expected, message, '===', strictEqual);
    }
  }

  // 10. The strict non-equality assertion tests for strict inequality, as
  // determined by !==.  assert.notStrictEqual(actual, expected, message_opt);
  assert$1.notStrictEqual = notStrictEqual;
  function notStrictEqual(actual, expected, message) {
    if (actual === expected) {
      fail(actual, expected, message, '!==', notStrictEqual);
    }
  }

  function expectedException(actual, expected) {
    if (!actual || !expected) {
      return false;
    }

    if (Object.prototype.toString.call(expected) == '[object RegExp]') {
      return expected.test(actual);
    }

    try {
      if (actual instanceof expected) {
        return true;
      }
    } catch (e) {
      // Ignore.  The instanceof check doesn't work for arrow functions.
    }

    if (Error.isPrototypeOf(expected)) {
      return false;
    }

    return expected.call({}, actual) === true;
  }

  function _tryBlock(block) {
    var error;
    try {
      block();
    } catch (e) {
      error = e;
    }
    return error;
  }

  function _throws(shouldThrow, block, expected, message) {
    var actual;

    if (typeof block !== 'function') {
      throw new TypeError('"block" argument must be a function');
    }

    if (typeof expected === 'string') {
      message = expected;
      expected = null;
    }

    actual = _tryBlock(block);

    message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
              (message ? ' ' + message : '.');

    if (shouldThrow && !actual) {
      fail(actual, expected, 'Missing expected exception' + message);
    }

    var userProvidedMessage = typeof message === 'string';
    var isUnwantedException = !shouldThrow && isError(actual);
    var isUnexpectedException = !shouldThrow && actual && !expected;

    if ((isUnwantedException &&
        userProvidedMessage &&
        expectedException(actual, expected)) ||
        isUnexpectedException) {
      fail(actual, expected, 'Got unwanted exception' + message);
    }

    if ((shouldThrow && actual && expected &&
        !expectedException(actual, expected)) || (!shouldThrow && actual)) {
      throw actual;
    }
  }

  // 11. Expected to throw an error:
  // assert.throws(block, Error_opt, message_opt);
  assert$1.throws = throws;
  function throws(block, /*optional*/error, /*optional*/message) {
    _throws(true, block, error, message);
  }

  // EXTENSION! This is annoying to write outside this module.
  assert$1.doesNotThrow = doesNotThrow;
  function doesNotThrow(block, /*optional*/error, /*optional*/message) {
    _throws(false, block, error, message);
  }

  assert$1.ifError = ifError;
  function ifError(err) {
    if (err) throw err;
  }

  var _polyfillNode_assert = /*#__PURE__*/Object.freeze({
    __proto__: null,
    'default': assert$1,
    AssertionError: AssertionError,
    fail: fail,
    ok: ok,
    assert: ok,
    equal: equal,
    notEqual: notEqual,
    deepEqual: deepEqual,
    deepStrictEqual: deepStrictEqual,
    notDeepEqual: notDeepEqual,
    notDeepStrictEqual: notDeepStrictEqual,
    strictEqual: strictEqual,
    notStrictEqual: notStrictEqual,
    throws: throws,
    doesNotThrow: doesNotThrow,
    ifError: ifError
  });

  var require$$0 = /*@__PURE__*/getAugmentedNamespace(_polyfillNode_assert);

  var assert = require$$0;

  var BufferWriter$5 = function BufferWriter (obj) {
    if (!(this instanceof BufferWriter)) { return new BufferWriter(obj) }
    this.bufLen = 0;
    if (obj) { this.set(obj); } else { this.bufs = []; }
  };

  BufferWriter$5.prototype.set = function (obj) {
    this.bufs = obj.bufs || this.bufs || [];
    this.bufLen = this.bufs.reduce(function (prev, buf) { return prev + buf.length }, 0);
    return this
  };

  BufferWriter$5.prototype.toBuffer = function () {
    return this.concat()
  };

  BufferWriter$5.prototype.concat = function () {
    return Buffer$1.concat(this.bufs, this.bufLen)
  };

  BufferWriter$5.prototype.write = function (buf) {
    assert(Buffer$1.isBuffer(buf));
    this.bufs.push(buf);
    this.bufLen += buf.length;
    return this
  };

  BufferWriter$5.prototype.writeReverse = function (buf) {
    assert(Buffer$1.isBuffer(buf));
    this.bufs.push(Buffer$1.from(buf).reverse());
    this.bufLen += buf.length;
    return this
  };

  BufferWriter$5.prototype.writeUInt8 = function (n) {
    var buf = Buffer$1.alloc(1);
    buf.writeUInt8(n, 0);
    this.write(buf);
    return this
  };

  BufferWriter$5.prototype.writeUInt16BE = function (n) {
    var buf = Buffer$1.alloc(2);
    buf.writeUInt16BE(n, 0);
    this.write(buf);
    return this
  };

  BufferWriter$5.prototype.writeUInt16LE = function (n) {
    var buf = Buffer$1.alloc(2);
    buf.writeUInt16LE(n, 0);
    this.write(buf);
    return this
  };

  BufferWriter$5.prototype.writeUInt32BE = function (n) {
    var buf = Buffer$1.alloc(4);
    buf.writeUInt32BE(n, 0);
    this.write(buf);
    return this
  };

  BufferWriter$5.prototype.writeInt32LE = function (n) {
    var buf = Buffer$1.alloc(4);
    buf.writeInt32LE(n, 0);
    this.write(buf);
    return this
  };

  BufferWriter$5.prototype.writeUInt32LE = function (n) {
    var buf = Buffer$1.alloc(4);
    buf.writeUInt32LE(n, 0);
    this.write(buf);
    return this
  };

  BufferWriter$5.prototype.writeUInt64BEBN = function (bn) {
    var buf = bn.toBuffer({ size: 8 });
    this.write(buf);
    return this
  };

  BufferWriter$5.prototype.writeUInt64LEBN = function (bn) {
    var buf = bn.toBuffer({ size: 8 });
    this.writeReverse(buf);
    return this
  };

  BufferWriter$5.prototype.writeVarintNum = function (n) {
    var buf = BufferWriter$5.varintBufNum(n);
    this.write(buf);
    return this
  };

  BufferWriter$5.prototype.writeVarintBN = function (bn) {
    var buf = BufferWriter$5.varintBufBN(bn);
    this.write(buf);
    return this
  };

  BufferWriter$5.varintBufNum = function (n) {
    var buf;
    if (n < 253) {
      buf = Buffer$1.alloc(1);
      buf.writeUInt8(n, 0);
    } else if (n < 0x10000) {
      buf = Buffer$1.alloc(1 + 2);
      buf.writeUInt8(253, 0);
      buf.writeUInt16LE(n, 1);
    } else if (n < 0x100000000) {
      buf = Buffer$1.alloc(1 + 4);
      buf.writeUInt8(254, 0);
      buf.writeUInt32LE(n, 1);
    } else {
      buf = Buffer$1.alloc(1 + 8);
      buf.writeUInt8(255, 0);
      buf.writeInt32LE(n & -1, 1);
      buf.writeUInt32LE(Math.floor(n / 0x100000000), 5);
    }
    return buf
  };

  BufferWriter$5.varintBufBN = function (bn) {
    var buf;
    var n = bn.toNumber();
    if (n < 253) {
      buf = Buffer$1.alloc(1);
      buf.writeUInt8(n, 0);
    } else if (n < 0x10000) {
      buf = Buffer$1.alloc(1 + 2);
      buf.writeUInt8(253, 0);
      buf.writeUInt16LE(n, 1);
    } else if (n < 0x100000000) {
      buf = Buffer$1.alloc(1 + 4);
      buf.writeUInt8(254, 0);
      buf.writeUInt32LE(n, 1);
    } else {
      var bw = new BufferWriter$5();
      bw.writeUInt8(255);
      bw.writeUInt64LEBN(bn);
      buf = bw.concat();
    }
    return buf
  };

  var bufferwriter = BufferWriter$5;

  var _$3 = __1;
  var $$3 = preconditions;
  var JSUtil = js;

  function Opcode (num) {
    if (!(this instanceof Opcode)) {
      return new Opcode(num)
    }

    var value;

    if (_$3.isNumber(num)) {
      value = num;
    } else if (_$3.isString(num)) {
      value = Opcode.map[num];
    } else {
      throw new TypeError('Unrecognized num type: "' + typeof (num) + '" for Opcode')
    }

    JSUtil.defineImmutable(this, {
      num: value
    });

    return this
  }

  Opcode.fromBuffer = function (buf) {
    $$3.checkArgument(Buffer$1.isBuffer(buf));
    return new Opcode(Number('0x' + buf.toString('hex')))
  };

  Opcode.fromNumber = function (num) {
    $$3.checkArgument(_$3.isNumber(num));
    return new Opcode(num)
  };

  Opcode.fromString = function (str) {
    $$3.checkArgument(_$3.isString(str));
    var value = Opcode.map[str];
    if (typeof value === 'undefined') {
      throw new TypeError('Invalid opcodestr')
    }
    return new Opcode(value)
  };

  Opcode.prototype.toHex = function () {
    return this.num.toString(16)
  };

  Opcode.prototype.toBuffer = function () {
    return Buffer$1.from(this.toHex(), 'hex')
  };

  Opcode.prototype.toNumber = function () {
    return this.num
  };

  Opcode.prototype.toString = function () {
    var str = Opcode.reverseMap[this.num];
    if (typeof str === 'undefined') {
      throw new Error('Opcode does not have a string representation')
    }
    return str
  };

  Opcode.smallInt = function (n) {
    $$3.checkArgument(_$3.isNumber(n), 'Invalid Argument: n should be number');
    $$3.checkArgument(n >= 0 && n <= 16, 'Invalid Argument: n must be between 0 and 16');
    if (n === 0) {
      return Opcode('OP_0')
    }
    return new Opcode(Opcode.map.OP_1 + n - 1)
  };

  Opcode.map = {
    // push value
    OP_FALSE: 0,
    OP_0: 0,
    OP_PUSHDATA1: 76,
    OP_PUSHDATA2: 77,
    OP_PUSHDATA4: 78,
    OP_1NEGATE: 79,
    OP_RESERVED: 80,
    OP_TRUE: 81,
    OP_1: 81,
    OP_2: 82,
    OP_3: 83,
    OP_4: 84,
    OP_5: 85,
    OP_6: 86,
    OP_7: 87,
    OP_8: 88,
    OP_9: 89,
    OP_10: 90,
    OP_11: 91,
    OP_12: 92,
    OP_13: 93,
    OP_14: 94,
    OP_15: 95,
    OP_16: 96,

    // control
    OP_NOP: 97,
    OP_VER: 98,
    OP_IF: 99,
    OP_NOTIF: 100,
    OP_VERIF: 101,
    OP_VERNOTIF: 102,
    OP_ELSE: 103,
    OP_ENDIF: 104,
    OP_VERIFY: 105,
    OP_RETURN: 106,

    // stack ops
    OP_TOALTSTACK: 107,
    OP_FROMALTSTACK: 108,
    OP_2DROP: 109,
    OP_2DUP: 110,
    OP_3DUP: 111,
    OP_2OVER: 112,
    OP_2ROT: 113,
    OP_2SWAP: 114,
    OP_IFDUP: 115,
    OP_DEPTH: 116,
    OP_DROP: 117,
    OP_DUP: 118,
    OP_NIP: 119,
    OP_OVER: 120,
    OP_PICK: 121,
    OP_ROLL: 122,
    OP_ROT: 123,
    OP_SWAP: 124,
    OP_TUCK: 125,

    // splice ops
    OP_CAT: 126,
    OP_SPLIT: 127,
    OP_NUM2BIN: 128,
    OP_BIN2NUM: 129,
    OP_SIZE: 130,

    // bit logic
    OP_INVERT: 131,
    OP_AND: 132,
    OP_OR: 133,
    OP_XOR: 134,
    OP_EQUAL: 135,
    OP_EQUALVERIFY: 136,
    OP_RESERVED1: 137,
    OP_RESERVED2: 138,

    // numeric
    OP_1ADD: 139,
    OP_1SUB: 140,
    OP_2MUL: 141,
    OP_2DIV: 142,
    OP_NEGATE: 143,
    OP_ABS: 144,
    OP_NOT: 145,
    OP_0NOTEQUAL: 146,

    OP_ADD: 147,
    OP_SUB: 148,
    OP_MUL: 149,
    OP_DIV: 150,
    OP_MOD: 151,
    OP_LSHIFT: 152,
    OP_RSHIFT: 153,

    OP_BOOLAND: 154,
    OP_BOOLOR: 155,
    OP_NUMEQUAL: 156,
    OP_NUMEQUALVERIFY: 157,
    OP_NUMNOTEQUAL: 158,
    OP_LESSTHAN: 159,
    OP_GREATERTHAN: 160,
    OP_LESSTHANOREQUAL: 161,
    OP_GREATERTHANOREQUAL: 162,
    OP_MIN: 163,
    OP_MAX: 164,

    OP_WITHIN: 165,

    // crypto
    OP_RIPEMD160: 166,
    OP_SHA1: 167,
    OP_SHA256: 168,
    OP_HASH160: 169,
    OP_HASH256: 170,
    OP_CODESEPARATOR: 171,
    OP_CHECKSIG: 172,
    OP_CHECKSIGVERIFY: 173,
    OP_CHECKMULTISIG: 174,
    OP_CHECKMULTISIGVERIFY: 175,

    OP_CHECKLOCKTIMEVERIFY: 177,
    OP_CHECKSEQUENCEVERIFY: 178,

    // expansion
    OP_NOP1: 176,
    OP_NOP2: 177,
    OP_NOP3: 178,
    OP_NOP4: 179,
    OP_NOP5: 180,
    OP_NOP6: 181,
    OP_NOP7: 182,
    OP_NOP8: 183,
    OP_NOP9: 184,
    OP_NOP10: 185,

    // template matching params
    OP_PUBKEYHASH: 253,
    OP_PUBKEY: 254,
    OP_INVALIDOPCODE: 255
  };

  Opcode.reverseMap = [];

  for (var k in Opcode.map) {
    Opcode.reverseMap[Opcode.map[k]] = k;
  }

  // Easier access to opcodes
  _$3.extend(Opcode, Opcode.map);

  /**
   * @returns true if opcode is one of OP_0, OP_1, ..., OP_16
   */
  Opcode.isSmallIntOp = function (opcode) {
    if (opcode instanceof Opcode) {
      opcode = opcode.toNumber();
    }
    return ((opcode === Opcode.map.OP_0) ||
      ((opcode >= Opcode.map.OP_1) && (opcode <= Opcode.map.OP_16)))
  };

  /**
   * Will return a string formatted for the console
   *
   * @returns {string} Script opcode
   */
  Opcode.prototype.inspect = function () {
    return '<Opcode: ' + this.toString() + ', hex: ' + this.toHex() + ', decimal: ' + this.num + '>'
  };

  var opcode = Opcode;

  var script;
  var hasRequiredScript$1;

  function requireScript$1 () {
  	if (hasRequiredScript$1) return script;
  	hasRequiredScript$1 = 1;

  	var Address = requireAddress();
  	var BufferReader = bufferreader;
  	var BufferWriter = bufferwriter;
  	var Hash = hash.exports;
  	var Opcode = opcode;
  	var PublicKey = requirePublickey();
  	var Signature = signature$1;
  	var Networks = networks_1;
  	var $ = preconditions;
  	var _ = __1;
  	var errors = errors$2.exports;
  	var buffer = require$$0$4;
  	var JSUtil = js;

  	/**
  	 * A bitcoin transaction script. Each transaction's inputs and outputs
  	 * has a script that is evaluated to validate it's spending.
  	 *
  	 * See https://en.bitcoin.it/wiki/Script
  	 *
  	 * @constructor
  	 * @param {Object|string|Buffer=} from optional data to populate script
  	 */
  	var Script = function Script (from) {
  	  if (!(this instanceof Script)) {
  	    return new Script(from)
  	  }
  	  this.chunks = [];

  	  if (Buffer$1.isBuffer(from)) {
  	    return Script.fromBuffer(from)
  	  } else if (from instanceof Address) {
  	    return Script.fromAddress(from)
  	  } else if (from instanceof Script) {
  	    return Script.fromBuffer(from.toBuffer())
  	  } else if (_.isString(from)) {
  	    return Script.fromString(from)
  	  } else if (_.isObject(from) && _.isArray(from.chunks)) {
  	    this.set(from);
  	  }
  	};

  	Script.prototype.set = function (obj) {
  	  $.checkArgument(_.isObject(obj));
  	  $.checkArgument(_.isArray(obj.chunks));
  	  this.chunks = obj.chunks;
  	  return this
  	};

  	Script.fromBuffer = function (buffer) {
  	  var script = new Script();
  	  script.chunks = [];

  	  var br = new BufferReader(buffer);
  	  while (!br.finished()) {
  	    try {
  	      var opcodenum = br.readUInt8();

  	      var len, buf;
  	      if (opcodenum > 0 && opcodenum < Opcode.OP_PUSHDATA1) {
  	        len = opcodenum;
  	        script.chunks.push({
  	          buf: br.read(len),
  	          len: len,
  	          opcodenum: opcodenum
  	        });
  	      } else if (opcodenum === Opcode.OP_PUSHDATA1) {
  	        len = br.readUInt8();
  	        buf = br.read(len);
  	        script.chunks.push({
  	          buf: buf,
  	          len: len,
  	          opcodenum: opcodenum
  	        });
  	      } else if (opcodenum === Opcode.OP_PUSHDATA2) {
  	        len = br.readUInt16LE();
  	        buf = br.read(len);
  	        script.chunks.push({
  	          buf: buf,
  	          len: len,
  	          opcodenum: opcodenum
  	        });
  	      } else if (opcodenum === Opcode.OP_PUSHDATA4) {
  	        len = br.readUInt32LE();
  	        buf = br.read(len);
  	        script.chunks.push({
  	          buf: buf,
  	          len: len,
  	          opcodenum: opcodenum
  	        });
  	      } else {
  	        script.chunks.push({
  	          opcodenum: opcodenum
  	        });
  	      }
  	    } catch (e) {
  	      if (e instanceof RangeError) {
  	        throw new errors.Script.InvalidBuffer(buffer.toString('hex'))
  	      }
  	      throw e
  	    }
  	  }

  	  return script
  	};

  	Script.prototype.toBuffer = function () {
  	  var bw = new BufferWriter();

  	  for (var i = 0; i < this.chunks.length; i++) {
  	    var chunk = this.chunks[i];
  	    var opcodenum = chunk.opcodenum;
  	    bw.writeUInt8(chunk.opcodenum);
  	    if (chunk.buf) {
  	      if (opcodenum < Opcode.OP_PUSHDATA1) {
  	        bw.write(chunk.buf);
  	      } else if (opcodenum === Opcode.OP_PUSHDATA1) {
  	        bw.writeUInt8(chunk.len);
  	        bw.write(chunk.buf);
  	      } else if (opcodenum === Opcode.OP_PUSHDATA2) {
  	        bw.writeUInt16LE(chunk.len);
  	        bw.write(chunk.buf);
  	      } else if (opcodenum === Opcode.OP_PUSHDATA4) {
  	        bw.writeUInt32LE(chunk.len);
  	        bw.write(chunk.buf);
  	      }
  	    }
  	  }

  	  return bw.concat()
  	};

  	Script.fromASM = function (str) {
  	  var script = new Script();
  	  script.chunks = [];

  	  var tokens = str.split(' ');
  	  var i = 0;
  	  while (i < tokens.length) {
  	    var token = tokens[i];
  	    var opcode = Opcode(token);
  	    var opcodenum = opcode.toNumber();

  	    // we start with two special cases, 0 and -1, which are handled specially in
  	    // toASM. see _chunkToString.
  	    if (token === '0') {
  	      opcodenum = 0;
  	      script.chunks.push({
  	        opcodenum: opcodenum
  	      });
  	      i = i + 1;
  	    } else if (token === '-1') {
  	      opcodenum = Opcode.OP_1NEGATE;
  	      script.chunks.push({
  	        opcodenum: opcodenum
  	      });
  	      i = i + 1;
  	    } else if (_.isUndefined(opcodenum)) {
  	      var buf = Buffer$1.from(tokens[i], 'hex');
  	      if (buf.toString('hex') !== tokens[i]) {
  	        throw new Error('invalid hex string in script')
  	      }
  	      var len = buf.length;
  	      if (len >= 0 && len < Opcode.OP_PUSHDATA1) {
  	        opcodenum = len;
  	      } else if (len < Math.pow(2, 8)) {
  	        opcodenum = Opcode.OP_PUSHDATA1;
  	      } else if (len < Math.pow(2, 16)) {
  	        opcodenum = Opcode.OP_PUSHDATA2;
  	      } else if (len < Math.pow(2, 32)) {
  	        opcodenum = Opcode.OP_PUSHDATA4;
  	      }
  	      script.chunks.push({
  	        buf: buf,
  	        len: buf.length,
  	        opcodenum: opcodenum
  	      });
  	      i = i + 1;
  	    } else {
  	      script.chunks.push({
  	        opcodenum: opcodenum
  	      });
  	      i = i + 1;
  	    }
  	  }
  	  return script
  	};

  	Script.fromHex = function (str) {
  	  return new Script(buffer.Buffer.from(str, 'hex'))
  	};

  	Script.fromString = function (str) {
  	  if (JSUtil.isHexa(str) || str.length === 0) {
  	    return new Script(buffer.Buffer.from(str, 'hex'))
  	  }
  	  var script = new Script();
  	  script.chunks = [];

  	  var tokens = str.split(' ');
  	  var i = 0;
  	  while (i < tokens.length) {
  	    var token = tokens[i];
  	    var opcode = Opcode(token);
  	    var opcodenum = opcode.toNumber();

  	    if (_.isUndefined(opcodenum)) {
  	      opcodenum = parseInt(token);
  	      if (opcodenum > 0 && opcodenum < Opcode.OP_PUSHDATA1) {
  	        script.chunks.push({
  	          buf: Buffer$1.from(tokens[i + 1].slice(2), 'hex'),
  	          len: opcodenum,
  	          opcodenum: opcodenum
  	        });
  	        i = i + 2;
  	      } else {
  	        throw new Error('Invalid script: ' + JSON.stringify(str))
  	      }
  	    } else if (opcodenum === Opcode.OP_PUSHDATA1 ||
  	      opcodenum === Opcode.OP_PUSHDATA2 ||
  	      opcodenum === Opcode.OP_PUSHDATA4) {
  	      if (tokens[i + 2].slice(0, 2) !== '0x') {
  	        throw new Error('Pushdata data must start with 0x')
  	      }
  	      script.chunks.push({
  	        buf: Buffer$1.from(tokens[i + 2].slice(2), 'hex'),
  	        len: parseInt(tokens[i + 1]),
  	        opcodenum: opcodenum
  	      });
  	      i = i + 3;
  	    } else {
  	      script.chunks.push({
  	        opcodenum: opcodenum
  	      });
  	      i = i + 1;
  	    }
  	  }
  	  return script
  	};

  	Script.prototype._chunkToString = function (chunk, type) {
  	  var opcodenum = chunk.opcodenum;
  	  var asm = (type === 'asm');
  	  var str = '';
  	  if (!chunk.buf) {
  	    // no data chunk
  	    if (typeof Opcode.reverseMap[opcodenum] !== 'undefined') {
  	      if (asm) {
  	        // A few cases where the opcode name differs from reverseMap
  	        // aside from 1 to 16 data pushes.
  	        if (opcodenum === 0) {
  	          // OP_0 -> 0
  	          str = str + ' 0';
  	        } else if (opcodenum === 79) {
  	          // OP_1NEGATE -> 1
  	          str = str + ' -1';
  	        } else {
  	          str = str + ' ' + Opcode(opcodenum).toString();
  	        }
  	      } else {
  	        str = str + ' ' + Opcode(opcodenum).toString();
  	      }
  	    } else {
  	      var numstr = opcodenum.toString(16);
  	      if (numstr.length % 2 !== 0) {
  	        numstr = '0' + numstr;
  	      }
  	      if (asm) {
  	        str = str + ' ' + numstr;
  	      } else {
  	        str = str + ' ' + '0x' + numstr;
  	      }
  	    }
  	  } else {
  	    // data chunk
  	    if (!asm && (opcodenum === Opcode.OP_PUSHDATA1 ||
  	      opcodenum === Opcode.OP_PUSHDATA2 ||
  	      opcodenum === Opcode.OP_PUSHDATA4)) {
  	      str = str + ' ' + Opcode(opcodenum).toString();
  	    }
  	    if (chunk.len > 0) {
  	      if (asm) {
  	        str = str + ' ' + chunk.buf.toString('hex');
  	      } else {
  	        str = str + ' ' + chunk.len + ' ' + '0x' + chunk.buf.toString('hex');
  	      }
  	    }
  	  }
  	  return str
  	};

  	Script.prototype.toASM = function () {
  	  var str = '';
  	  for (var i = 0; i < this.chunks.length; i++) {
  	    var chunk = this.chunks[i];
  	    str += this._chunkToString(chunk, 'asm');
  	  }

  	  return str.substr(1)
  	};

  	Script.prototype.toString = function () {
  	  var str = '';
  	  for (var i = 0; i < this.chunks.length; i++) {
  	    var chunk = this.chunks[i];
  	    str += this._chunkToString(chunk);
  	  }

  	  return str.substr(1)
  	};

  	Script.prototype.toHex = function () {
  	  return this.toBuffer().toString('hex')
  	};

  	Script.prototype.inspect = function () {
  	  return '<Script: ' + this.toString() + '>'
  	};

  	// script classification methods

  	/**
  	 * @returns {boolean} if this is a pay to pubkey hash output script
  	 */
  	Script.prototype.isPublicKeyHashOut = function () {
  	  return !!(this.chunks.length === 5 &&
  	    this.chunks[0].opcodenum === Opcode.OP_DUP &&
  	    this.chunks[1].opcodenum === Opcode.OP_HASH160 &&
  	    this.chunks[2].buf &&
  	    this.chunks[2].buf.length === 20 &&
  	    this.chunks[3].opcodenum === Opcode.OP_EQUALVERIFY &&
  	    this.chunks[4].opcodenum === Opcode.OP_CHECKSIG)
  	};

  	/**
  	 * @returns {boolean} if this is a pay to public key hash input script
  	 */
  	Script.prototype.isPublicKeyHashIn = function () {
  	  if (this.chunks.length === 2) {
  	    var signatureBuf = this.chunks[0].buf;
  	    var pubkeyBuf = this.chunks[1].buf;
  	    if (signatureBuf &&
  	      signatureBuf.length &&
  	      signatureBuf[0] === 0x30 &&
  	      pubkeyBuf &&
  	      pubkeyBuf.length
  	    ) {
  	      var version = pubkeyBuf[0];
  	      if ((version === 0x04 ||
  	        version === 0x06 ||
  	        version === 0x07) && pubkeyBuf.length === 65) {
  	        return true
  	      } else if ((version === 0x03 || version === 0x02) && pubkeyBuf.length === 33) {
  	        return true
  	      }
  	    }
  	  }
  	  return false
  	};

  	Script.prototype.getPublicKey = function () {
  	  $.checkState(this.isPublicKeyOut(), 'Can\'t retrieve PublicKey from a non-PK output');
  	  return this.chunks[0].buf
  	};

  	Script.prototype.getPublicKeyHash = function () {
  	  $.checkState(this.isPublicKeyHashOut(), 'Can\'t retrieve PublicKeyHash from a non-PKH output');
  	  return this.chunks[2].buf
  	};

  	/**
  	 * @returns {boolean} if this is a public key output script
  	 */
  	Script.prototype.isPublicKeyOut = function () {
  	  if (this.chunks.length === 2 &&
  	    this.chunks[0].buf &&
  	    this.chunks[0].buf.length &&
  	    this.chunks[1].opcodenum === Opcode.OP_CHECKSIG) {
  	    var pubkeyBuf = this.chunks[0].buf;
  	    var version = pubkeyBuf[0];
  	    var isVersion = false;
  	    if ((version === 0x04 ||
  	      version === 0x06 ||
  	      version === 0x07) && pubkeyBuf.length === 65) {
  	      isVersion = true;
  	    } else if ((version === 0x03 || version === 0x02) && pubkeyBuf.length === 33) {
  	      isVersion = true;
  	    }
  	    if (isVersion) {
  	      return PublicKey.isValid(pubkeyBuf)
  	    }
  	  }
  	  return false
  	};

  	/**
  	 * @returns {boolean} if this is a pay to public key input script
  	 */
  	Script.prototype.isPublicKeyIn = function () {
  	  if (this.chunks.length === 1) {
  	    var signatureBuf = this.chunks[0].buf;
  	    if (signatureBuf &&
  	      signatureBuf.length &&
  	      signatureBuf[0] === 0x30) {
  	      return true
  	    }
  	  }
  	  return false
  	};

  	/**
  	 * @returns {boolean} if this is a p2sh output script
  	 */
  	Script.prototype.isScriptHashOut = function () {
  	  var buf = this.toBuffer();
  	  return (buf.length === 23 &&
  	    buf[0] === Opcode.OP_HASH160 &&
  	    buf[1] === 0x14 &&
  	    buf[buf.length - 1] === Opcode.OP_EQUAL)
  	};

  	/**
  	 * @returns {boolean} if this is a p2sh input script
  	 * Note that these are frequently indistinguishable from pubkeyhashin
  	 */
  	Script.prototype.isScriptHashIn = function () {
  	  if (this.chunks.length <= 1) {
  	    return false
  	  }
  	  var redeemChunk = this.chunks[this.chunks.length - 1];
  	  var redeemBuf = redeemChunk.buf;
  	  if (!redeemBuf) {
  	    return false
  	  }

  	  var redeemScript;
  	  try {
  	    redeemScript = Script.fromBuffer(redeemBuf);
  	  } catch (e) {
  	    if (e instanceof errors.Script.InvalidBuffer) {
  	      return false
  	    }
  	    throw e
  	  }
  	  var type = redeemScript.classify();
  	  return type !== Script.types.UNKNOWN
  	};

  	/**
  	 * @returns {boolean} if this is a mutlsig output script
  	 */
  	Script.prototype.isMultisigOut = function () {
  	  return (this.chunks.length > 3 &&
  	    Opcode.isSmallIntOp(this.chunks[0].opcodenum) &&
  	    this.chunks.slice(1, this.chunks.length - 2).every(function (obj) {
  	      return obj.buf && Buffer$1.isBuffer(obj.buf)
  	    }) &&
  	    Opcode.isSmallIntOp(this.chunks[this.chunks.length - 2].opcodenum) &&
  	    this.chunks[this.chunks.length - 1].opcodenum === Opcode.OP_CHECKMULTISIG)
  	};

  	/**
  	 * @returns {boolean} if this is a multisig input script
  	 */
  	Script.prototype.isMultisigIn = function () {
  	  return this.chunks.length >= 2 &&
  	    this.chunks[0].opcodenum === 0 &&
  	    this.chunks.slice(1, this.chunks.length).every(function (obj) {
  	      return obj.buf &&
  	        Buffer$1.isBuffer(obj.buf) &&
  	        Signature.isTxDER(obj.buf)
  	    })
  	};

  	/**
  	 * @returns {boolean} true if this is a valid standard OP_RETURN output
  	 */
  	Script.prototype.isDataOut = function () {
  	  var step1 = this.chunks.length >= 1 &&
  	    this.chunks[0].opcodenum === Opcode.OP_RETURN;
  	  if (!step1) return false
  	  var chunks = this.chunks.slice(1);
  	  var script2 = new Script({ chunks: chunks });
  	  return script2.isPushOnly()
  	};

  	Script.prototype.isSafeDataOut = function () {
  	  if (this.chunks.length < 2) {
  	    return false
  	  }
  	  if (this.chunks[0].opcodenum !== Opcode.OP_FALSE) {
  	    return false
  	  }
  	  var chunks = this.chunks.slice(1);
  	  var script2 = new Script({ chunks });
  	  return script2.isDataOut()
  	};

  	/**
  	 * Retrieve the associated data for this script.
  	 * In the case of a pay to public key hash or P2SH, return the hash.
  	 * In the case of safe OP_RETURN data, return an array of buffers
  	 * In the case of a standard deprecated OP_RETURN, return the data
  	 * @returns {Buffer}
  	 */
  	Script.prototype.getData = function () {
  	  if (this.isSafeDataOut()) {
  	    var chunks = this.chunks.slice(2);
  	    var buffers = chunks.map(chunk => chunk.buf);
  	    return buffers
  	  }
  	  if (this.isDataOut() || this.isScriptHashOut()) {
  	    if (_.isUndefined(this.chunks[1])) {
  	      return Buffer$1.alloc(0)
  	    } else {
  	      return Buffer$1.from(this.chunks[1].buf)
  	    }
  	  }
  	  if (this.isPublicKeyHashOut()) {
  	    return Buffer$1.from(this.chunks[2].buf)
  	  }
  	  throw new Error('Unrecognized script type to get data from')
  	};

  	/**
  	 * @returns {boolean} if the script is only composed of data pushing
  	 * opcodes or small int opcodes (OP_0, OP_1, ..., OP_16)
  	 */
  	Script.prototype.isPushOnly = function () {
  	  return _.every(this.chunks, function (chunk) {
  	    return chunk.opcodenum <= Opcode.OP_16 ||
  	      chunk.opcodenum === Opcode.OP_PUSHDATA1 ||
  	      chunk.opcodenum === Opcode.OP_PUSHDATA2 ||
  	      chunk.opcodenum === Opcode.OP_PUSHDATA4
  	  })
  	};

  	Script.types = {};
  	Script.types.UNKNOWN = 'Unknown';
  	Script.types.PUBKEY_OUT = 'Pay to public key';
  	Script.types.PUBKEY_IN = 'Spend from public key';
  	Script.types.PUBKEYHASH_OUT = 'Pay to public key hash';
  	Script.types.PUBKEYHASH_IN = 'Spend from public key hash';
  	Script.types.SCRIPTHASH_OUT = 'Pay to script hash';
  	Script.types.SCRIPTHASH_IN = 'Spend from script hash';
  	Script.types.MULTISIG_OUT = 'Pay to multisig';
  	Script.types.MULTISIG_IN = 'Spend from multisig';
  	Script.types.DATA_OUT = 'Data push';
  	Script.types.SAFE_DATA_OUT = 'Safe data push';

  	Script.OP_RETURN_STANDARD_SIZE = 220;

  	/**
  	 * @returns {object} The Script type if it is a known form,
  	 * or Script.UNKNOWN if it isn't
  	 */
  	Script.prototype.classify = function () {
  	  if (this._isInput) {
  	    return this.classifyInput()
  	  } else if (this._isOutput) {
  	    return this.classifyOutput()
  	  } else {
  	    var outputType = this.classifyOutput();
  	    return outputType !== Script.types.UNKNOWN ? outputType : this.classifyInput()
  	  }
  	};

  	Script.outputIdentifiers = {};
  	Script.outputIdentifiers.PUBKEY_OUT = Script.prototype.isPublicKeyOut;
  	Script.outputIdentifiers.PUBKEYHASH_OUT = Script.prototype.isPublicKeyHashOut;
  	Script.outputIdentifiers.MULTISIG_OUT = Script.prototype.isMultisigOut;
  	Script.outputIdentifiers.SCRIPTHASH_OUT = Script.prototype.isScriptHashOut;
  	Script.outputIdentifiers.DATA_OUT = Script.prototype.isDataOut;
  	Script.outputIdentifiers.SAFE_DATA_OUT = Script.prototype.isSafeDataOut;

  	/**
  	 * @returns {object} The Script type if it is a known form,
  	 * or Script.UNKNOWN if it isn't
  	 */
  	Script.prototype.classifyOutput = function () {
  	  for (var type in Script.outputIdentifiers) {
  	    if (Script.outputIdentifiers[type].bind(this)()) {
  	      return Script.types[type]
  	    }
  	  }
  	  return Script.types.UNKNOWN
  	};

  	Script.inputIdentifiers = {};
  	Script.inputIdentifiers.PUBKEY_IN = Script.prototype.isPublicKeyIn;
  	Script.inputIdentifiers.PUBKEYHASH_IN = Script.prototype.isPublicKeyHashIn;
  	Script.inputIdentifiers.MULTISIG_IN = Script.prototype.isMultisigIn;
  	Script.inputIdentifiers.SCRIPTHASH_IN = Script.prototype.isScriptHashIn;

  	/**
  	 * @returns {object} The Script type if it is a known form,
  	 * or Script.UNKNOWN if it isn't
  	 */
  	Script.prototype.classifyInput = function () {
  	  for (var type in Script.inputIdentifiers) {
  	    if (Script.inputIdentifiers[type].bind(this)()) {
  	      return Script.types[type]
  	    }
  	  }
  	  return Script.types.UNKNOWN
  	};

  	/**
  	 * @returns {boolean} if script is one of the known types
  	 */
  	Script.prototype.isStandard = function () {
  	  // TODO: Add BIP62 compliance
  	  return this.classify() !== Script.types.UNKNOWN
  	};

  	// Script construction methods

  	/**
  	 * Adds a script element at the start of the script.
  	 * @param {*} obj a string, number, Opcode, Buffer, or object to add
  	 * @returns {Script} this script instance
  	 */
  	Script.prototype.prepend = function (obj) {
  	  this._addByType(obj, true);
  	  return this
  	};

  	/**
  	 * Compares a script with another script
  	 */
  	Script.prototype.equals = function (script) {
  	  $.checkState(script instanceof Script, 'Must provide another script');
  	  if (this.chunks.length !== script.chunks.length) {
  	    return false
  	  }
  	  var i;
  	  for (i = 0; i < this.chunks.length; i++) {
  	    if (Buffer$1.isBuffer(this.chunks[i].buf) && !Buffer$1.isBuffer(script.chunks[i].buf)) {
  	      return false
  	    }
  	    if (Buffer$1.isBuffer(this.chunks[i].buf) && !this.chunks[i].buf.equals(script.chunks[i].buf)) {
  	      return false
  	    } else if (this.chunks[i].opcodenum !== script.chunks[i].opcodenum) {
  	      return false
  	    }
  	  }
  	  return true
  	};

  	/**
  	 * Adds a script element to the end of the script.
  	 *
  	 * @param {*} obj a string, number, Opcode, Buffer, or object to add
  	 * @returns {Script} this script instance
  	 *
  	 */
  	Script.prototype.add = function (obj) {
  	  this._addByType(obj, false);
  	  return this
  	};

  	Script.prototype._addByType = function (obj, prepend) {
  	  if (typeof obj === 'string') {
  	    this._addOpcode(obj, prepend);
  	  } else if (typeof obj === 'number') {
  	    this._addOpcode(obj, prepend);
  	  } else if (obj instanceof Opcode) {
  	    this._addOpcode(obj, prepend);
  	  } else if (Buffer$1.isBuffer(obj)) {
  	    this._addBuffer(obj, prepend);
  	  } else if (obj instanceof Script) {
  	    this.chunks = this.chunks.concat(obj.chunks);
  	  } else if (typeof obj === 'object') {
  	    this._insertAtPosition(obj, prepend);
  	  } else {
  	    throw new Error('Invalid script chunk')
  	  }
  	};

  	Script.prototype._insertAtPosition = function (op, prepend) {
  	  if (prepend) {
  	    this.chunks.unshift(op);
  	  } else {
  	    this.chunks.push(op);
  	  }
  	};

  	Script.prototype._addOpcode = function (opcode, prepend) {
  	  var op;
  	  if (typeof opcode === 'number') {
  	    op = opcode;
  	  } else if (opcode instanceof Opcode) {
  	    op = opcode.toNumber();
  	  } else {
  	    op = Opcode(opcode).toNumber();
  	  }
  	  this._insertAtPosition({
  	    opcodenum: op
  	  }, prepend);
  	  return this
  	};

  	Script.prototype._addBuffer = function (buf, prepend) {
  	  var opcodenum;
  	  var len = buf.length;
  	  if (len >= 0 && len < Opcode.OP_PUSHDATA1) {
  	    opcodenum = len;
  	  } else if (len < Math.pow(2, 8)) {
  	    opcodenum = Opcode.OP_PUSHDATA1;
  	  } else if (len < Math.pow(2, 16)) {
  	    opcodenum = Opcode.OP_PUSHDATA2;
  	  } else if (len < Math.pow(2, 32)) {
  	    opcodenum = Opcode.OP_PUSHDATA4;
  	  } else {
  	    throw new Error('You can\'t push that much data')
  	  }
  	  this._insertAtPosition({
  	    buf: buf,
  	    len: len,
  	    opcodenum: opcodenum
  	  }, prepend);
  	  return this
  	};

  	Script.prototype.removeCodeseparators = function () {
  	  var chunks = [];
  	  for (var i = 0; i < this.chunks.length; i++) {
  	    if (this.chunks[i].opcodenum !== Opcode.OP_CODESEPARATOR) {
  	      chunks.push(this.chunks[i]);
  	    }
  	  }
  	  this.chunks = chunks;
  	  return this
  	};

  	/**
  	 * If the script does not contain any OP_CODESEPARATOR, Return all scripts
  	 * If the script contains any OP_CODESEPARATOR, the scriptCode is the script but removing everything up to and including the last executed OP_CODESEPARATOR before the signature checking opcode being executed
  	 * @param {n} The {n}th codeseparator in the script
  	 *
  	 * @returns {Script} Subset of script starting at the {n}th codeseparator
  	 */
  	Script.prototype.subScript = function (n) {
  	  var idx = 0;

  	  for (var i = 0; i < this.chunks.length; i++) {
  	    if (this.chunks[i].opcodenum === Opcode.OP_CODESEPARATOR) {
  	      if (idx === n) {
  	        return new Script().set({
  	          chunks: this.chunks.slice(i + 1)
  	        })
  	      } else {
  	        idx++;
  	      }
  	    }
  	  }

  	  return new Script().set({
  	    chunks: this.chunks.slice(0)
  	  })
  	};

  	// high level script builder methods

  	/**
  	 * @returns {Script} a new Multisig output script for given public keys,
  	 * requiring m of those public keys to spend
  	 * @param {PublicKey[]} publicKeys - list of all public keys controlling the output
  	 * @param {number} threshold - amount of required signatures to spend the output
  	 * @param {Object=} opts - Several options:
  	 *        - noSorting: defaults to false, if true, don't sort the given
  	 *                      public keys before creating the script
  	 */
  	Script.buildMultisigOut = function (publicKeys, threshold, opts) {
  	  $.checkArgument(threshold <= publicKeys.length,
  	    'Number of required signatures must be less than or equal to the number of public keys');
  	  opts = opts || {};
  	  var script = new Script();
  	  script.add(Opcode.smallInt(threshold));
  	  publicKeys = _.map(publicKeys, PublicKey);
  	  var sorted = publicKeys;
  	  if (!opts.noSorting) {
  	    sorted = publicKeys.map(k => k.toString('hex')).sort().map(k => new PublicKey(k));
  	  }
  	  for (var i = 0; i < sorted.length; i++) {
  	    var publicKey = sorted[i];
  	    script.add(publicKey.toBuffer());
  	  }
  	  script.add(Opcode.smallInt(publicKeys.length));
  	  script.add(Opcode.OP_CHECKMULTISIG);
  	  return script
  	};

  	/**
  	 * A new Multisig input script for the given public keys, requiring m of those public keys to spend
  	 *
  	 * @param {PublicKey[]} pubkeys list of all public keys controlling the output
  	 * @param {number} threshold amount of required signatures to spend the output
  	 * @param {Array} signatures and array of signature buffers to append to the script
  	 * @param {Object=} opts
  	 * @param {boolean=} opts.noSorting don't sort the given public keys before creating the script (false by default)
  	 * @param {Script=} opts.cachedMultisig don't recalculate the redeemScript
  	 *
  	 * @returns {Script}
  	 */
  	Script.buildMultisigIn = function (pubkeys, threshold, signatures, opts) {
  	  $.checkArgument(_.isArray(pubkeys));
  	  $.checkArgument(_.isNumber(threshold));
  	  $.checkArgument(_.isArray(signatures));
  	  var s = new Script();
  	  s.add(Opcode.OP_0);
  	  _.each(signatures, function (signature) {
  	    $.checkArgument(Buffer$1.isBuffer(signature), 'Signatures must be an array of Buffers');
  	    // TODO: allow signatures to be an array of Signature objects
  	    s.add(signature);
  	  });
  	  return s
  	};

  	/**
  	 * A new P2SH Multisig input script for the given public keys, requiring m of those public keys to spend
  	 *
  	 * @param {PublicKey[]} pubkeys list of all public keys controlling the output
  	 * @param {number} threshold amount of required signatures to spend the output
  	 * @param {Array} signatures and array of signature buffers to append to the script
  	 * @param {Object=} opts
  	 * @param {boolean=} opts.noSorting don't sort the given public keys before creating the script (false by default)
  	 * @param {Script=} opts.cachedMultisig don't recalculate the redeemScript
  	 *
  	 * @returns {Script}
  	 */
  	Script.buildP2SHMultisigIn = function (pubkeys, threshold, signatures, opts) {
  	  $.checkArgument(_.isArray(pubkeys));
  	  $.checkArgument(_.isNumber(threshold));
  	  $.checkArgument(_.isArray(signatures));
  	  opts = opts || {};
  	  var s = new Script();
  	  s.add(Opcode.OP_0);
  	  _.each(signatures, function (signature) {
  	    $.checkArgument(Buffer$1.isBuffer(signature), 'Signatures must be an array of Buffers');
  	    // TODO: allow signatures to be an array of Signature objects
  	    s.add(signature);
  	  });
  	  s.add((opts.cachedMultisig || Script.buildMultisigOut(pubkeys, threshold, opts)).toBuffer());
  	  return s
  	};

  	/**
  	 * @returns {Script} a new pay to public key hash output for the given
  	 * address or public key
  	 * @param {(Address|PublicKey)} to - destination address or public key
  	 */
  	Script.buildPublicKeyHashOut = function (to) {
  	  $.checkArgument(!_.isUndefined(to));
  	  $.checkArgument(to instanceof PublicKey || to instanceof Address || _.isString(to));
  	  if (to instanceof PublicKey) {
  	    to = to.toAddress();
  	  } else if (_.isString(to)) {
  	    to = new Address(to);
  	  }
  	  var s = new Script();
  	  s.add(Opcode.OP_DUP)
  	    .add(Opcode.OP_HASH160)
  	    .add(to.hashBuffer)
  	    .add(Opcode.OP_EQUALVERIFY)
  	    .add(Opcode.OP_CHECKSIG);
  	  s._network = to.network;
  	  return s
  	};

  	/**
  	 * @returns {Script} a new pay to public key output for the given
  	 *  public key
  	 */
  	Script.buildPublicKeyOut = function (pubkey) {
  	  $.checkArgument(pubkey instanceof PublicKey);
  	  var s = new Script();
  	  s.add(pubkey.toBuffer())
  	    .add(Opcode.OP_CHECKSIG);
  	  return s
  	};

  	/**
  	 * @returns {Script} a new OP_RETURN script with data
  	 * @param {(string|Buffer|Array)} data - the data to embed in the output - it is a string, buffer, or array of strings or buffers
  	 * @param {(string)} encoding - the type of encoding of the string(s)
  	 */
  	Script.buildDataOut = function (data, encoding) {
  	  $.checkArgument(_.isUndefined(data) || _.isString(data) || _.isArray(data) || Buffer$1.isBuffer(data));
  	  var datas = data;
  	  if (!_.isArray(datas)) {
  	    datas = [data];
  	  }
  	  var s = new Script();
  	  s.add(Opcode.OP_RETURN);
  	  for (let data of datas) {
  	    $.checkArgument(_.isUndefined(data) || _.isString(data) || Buffer$1.isBuffer(data));
  	    if (_.isString(data)) {
  	      data = Buffer$1.from(data, encoding);
  	    }
  	    if (!_.isUndefined(data)) {
  	      s.add(data);
  	    }
  	  }
  	  return s
  	};

  	/**
  	 * @returns {Script} a new OP_RETURN script with data
  	 * @param {(string|Buffer|Array)} data - the data to embed in the output - it is a string, buffer, or array of strings or buffers
  	 * @param {(string)} encoding - the type of encoding of the string(s)
  	 */
  	Script.buildSafeDataOut = function (data, encoding) {
  	  var s2 = Script.buildDataOut(data, encoding);
  	  var s1 = new Script();
  	  s1.add(Opcode.OP_FALSE);
  	  s1.add(s2);
  	  return s1
  	};

  	/**
  	 * @param {Script|Address} script - the redeemScript for the new p2sh output.
  	 *    It can also be a p2sh address
  	 * @returns {Script} new pay to script hash script for given script
  	 */
  	Script.buildScriptHashOut = function (script) {
  	  $.checkArgument(script instanceof Script ||
  	    (script instanceof Address && script.isPayToScriptHash()));
  	  var s = new Script();
  	  s.add(Opcode.OP_HASH160)
  	    .add(script instanceof Address ? script.hashBuffer : Hash.sha256ripemd160(script.toBuffer()))
  	    .add(Opcode.OP_EQUAL);

  	  s._network = script._network || script.network;
  	  return s
  	};

  	/**
  	 * Builds a scriptSig (a script for an input) that signs a public key output script.
  	 *
  	 * @param {Signature|Buffer} signature - a Signature object, or the signature in DER canonical encoding
  	 * @param {number=} sigtype - the type of the signature (defaults to SIGHASH_ALL)
  	 */
  	Script.buildPublicKeyIn = function (signature, sigtype) {
  	  $.checkArgument(signature instanceof Signature || Buffer$1.isBuffer(signature));
  	  $.checkArgument(_.isUndefined(sigtype) || _.isNumber(sigtype));
  	  if (signature instanceof Signature) {
  	    signature = signature.toBuffer();
  	  }
  	  var script = new Script();
  	  script.add(Buffer$1.concat([
  	    signature,
  	    Buffer$1.from([(sigtype || Signature.SIGHASH_ALL) & 0xff])
  	  ]));
  	  return script
  	};

  	/**
  	 * Builds a scriptSig (a script for an input) that signs a public key hash
  	 * output script.
  	 *
  	 * @param {Buffer|string|PublicKey} publicKey
  	 * @param {Signature|Buffer} signature - a Signature object, or the signature in DER canonical encoding
  	 * @param {number=} sigtype - the type of the signature (defaults to SIGHASH_ALL)
  	 */
  	Script.buildPublicKeyHashIn = function (publicKey, signature, sigtype) {
  	  $.checkArgument(signature instanceof Signature || Buffer$1.isBuffer(signature));
  	  $.checkArgument(_.isUndefined(sigtype) || _.isNumber(sigtype));
  	  if (signature instanceof Signature) {
  	    signature = signature.toBuffer();
  	  }
  	  var script = new Script()
  	    .add(Buffer$1.concat([
  	      signature,
  	      Buffer$1.from([(sigtype || Signature.SIGHASH_ALL) & 0xff])
  	    ]))
  	    .add(new PublicKey(publicKey).toBuffer());
  	  return script
  	};

  	/**
  	 * @returns {Script} an empty script
  	 */
  	Script.empty = function () {
  	  return new Script()
  	};

  	/**
  	 * @returns {Script} a new pay to script hash script that pays to this script
  	 */
  	Script.prototype.toScriptHashOut = function () {
  	  return Script.buildScriptHashOut(this)
  	};

  	/**
  	 * @return {Script} an output script built from the address
  	 */
  	Script.fromAddress = function (address) {
  	  address = Address(address);
  	  if (address.isPayToScriptHash()) {
  	    return Script.buildScriptHashOut(address)
  	  } else if (address.isPayToPublicKeyHash()) {
  	    return Script.buildPublicKeyHashOut(address)
  	  }
  	  throw new errors.Script.UnrecognizedAddress(address)
  	};

  	/**
  	 * Will return the associated address information object
  	 * @return {Address|boolean}
  	 */
  	Script.prototype.getAddressInfo = function (opts) {
  	  if (this._isInput) {
  	    return this._getInputAddressInfo()
  	  } else if (this._isOutput) {
  	    return this._getOutputAddressInfo()
  	  } else {
  	    var info = this._getOutputAddressInfo();
  	    if (!info) {
  	      return this._getInputAddressInfo()
  	    }
  	    return info
  	  }
  	};

  	/**
  	 * Will return the associated output scriptPubKey address information object
  	 * @return {Address|boolean}
  	 * @private
  	 */
  	Script.prototype._getOutputAddressInfo = function () {
  	  var info = {};
  	  if (this.isScriptHashOut()) {
  	    info.hashBuffer = this.getData();
  	    info.type = Address.PayToScriptHash;
  	  } else if (this.isPublicKeyHashOut()) {
  	    info.hashBuffer = this.getData();
  	    info.type = Address.PayToPublicKeyHash;
  	  } else {
  	    return false
  	  }
  	  return info
  	};

  	/**
  	 * Will return the associated input scriptSig address information object
  	 * @return {Address|boolean}
  	 * @private
  	 */
  	Script.prototype._getInputAddressInfo = function () {
  	  var info = {};
  	  if (this.isPublicKeyHashIn()) {
  	    // hash the publickey found in the scriptSig
  	    info.hashBuffer = Hash.sha256ripemd160(this.chunks[1].buf);
  	    info.type = Address.PayToPublicKeyHash;
  	  } else if (this.isScriptHashIn()) {
  	    // hash the redeemscript found at the end of the scriptSig
  	    info.hashBuffer = Hash.sha256ripemd160(this.chunks[this.chunks.length - 1].buf);
  	    info.type = Address.PayToScriptHash;
  	  } else {
  	    return false
  	  }
  	  return info
  	};

  	/**
  	 * @param {Network=} network
  	 * @return {Address|boolean} the associated address for this script if possible, or false
  	 */
  	Script.prototype.toAddress = function (network) {
  	  var info = this.getAddressInfo();
  	  if (!info) {
  	    return false
  	  }
  	  info.network = Networks.get(network) || this._network || Networks.defaultNetwork;
  	  return new Address(info)
  	};

  	/**
  	 * Analogous to bitcoind's FindAndDelete. Find and delete equivalent chunks,
  	 * typically used with push data chunks.  Note that this will find and delete
  	 * not just the same data, but the same data with the same push data op as
  	 * produced by default. i.e., if a pushdata in a tx does not use the minimal
  	 * pushdata op, then when you try to remove the data it is pushing, it will not
  	 * be removed, because they do not use the same pushdata op.
  	 */
  	Script.prototype.findAndDelete = function (script) {
  	  var buf = script.toBuffer();
  	  var hex = buf.toString('hex');
  	  for (var i = 0; i < this.chunks.length; i++) {
  	    var script2 = Script({
  	      chunks: [this.chunks[i]]
  	    });
  	    var buf2 = script2.toBuffer();
  	    var hex2 = buf2.toString('hex');
  	    if (hex === hex2) {
  	      this.chunks.splice(i, 1);
  	    }
  	  }
  	  return this
  	};

  	/**
  	 * Comes from bitcoind's script interpreter CheckMinimalPush function
  	 * @returns {boolean} if the chunk {i} is the smallest way to push that particular data.
  	 */
  	Script.prototype.checkMinimalPush = function (i) {
  	  var chunk = this.chunks[i];
  	  var buf = chunk.buf;
  	  var opcodenum = chunk.opcodenum;
  	  if (!buf) {
  	    return true
  	  }
  	  if (buf.length === 0) {
  	    // Could have used OP_0.
  	    return opcodenum === Opcode.OP_0
  	  } else if (buf.length === 1 && buf[0] >= 1 && buf[0] <= 16) {
  	    // Could have used OP_1 .. OP_16.
  	    return opcodenum === Opcode.OP_1 + (buf[0] - 1)
  	  } else if (buf.length === 1 && buf[0] === 0x81) {
  	    // Could have used OP_1NEGATE
  	    return opcodenum === Opcode.OP_1NEGATE
  	  } else if (buf.length <= 75) {
  	    // Could have used a direct push (opcode indicating number of bytes pushed + those bytes).
  	    return opcodenum === buf.length
  	  } else if (buf.length <= 255) {
  	    // Could have used OP_PUSHDATA.
  	    return opcodenum === Opcode.OP_PUSHDATA1
  	  } else if (buf.length <= 65535) {
  	    // Could have used OP_PUSHDATA2.
  	    return opcodenum === Opcode.OP_PUSHDATA2
  	  }
  	  return true
  	};

  	/**
  	 * Comes from bitcoind's script DecodeOP_N function
  	 * @param {number} opcode
  	 * @returns {number} numeric value in range of 0 to 16
  	 */
  	Script.prototype._decodeOP_N = function (opcode) {
  	  if (opcode === Opcode.OP_0) {
  	    return 0
  	  } else if (opcode >= Opcode.OP_1 && opcode <= Opcode.OP_16) {
  	    return opcode - (Opcode.OP_1 - 1)
  	  } else {
  	    throw new Error('Invalid opcode: ' + JSON.stringify(opcode))
  	  }
  	};

  	/**
  	 * Comes from bitcoind's script GetSigOpCount(boolean) function
  	 * @param {boolean} use current (true) or pre-version-0.6 (false) logic
  	 * @returns {number} number of signature operations required by this script
  	 */
  	Script.prototype.getSignatureOperationsCount = function (accurate) {
  	  accurate = (_.isUndefined(accurate) ? true : accurate);
  	  var self = this;
  	  var n = 0;
  	  var lastOpcode = Opcode.OP_INVALIDOPCODE;
  	  _.each(self.chunks, function getChunk (chunk) {
  	    var opcode = chunk.opcodenum;
  	    if (opcode === Opcode.OP_CHECKSIG || opcode === Opcode.OP_CHECKSIGVERIFY) {
  	      n++;
  	    } else if (opcode === Opcode.OP_CHECKMULTISIG || opcode === Opcode.OP_CHECKMULTISIGVERIFY) {
  	      if (accurate && lastOpcode >= Opcode.OP_1 && lastOpcode <= Opcode.OP_16) {
  	        n += self._decodeOP_N(lastOpcode);
  	      } else {
  	        n += 20;
  	      }
  	    }
  	    lastOpcode = opcode;
  	  });
  	  return n
  	};

  	script = Script;
  	return script;
  }

  var Stack = function Stack (rawstack, varStack) {
    this.stack = rawstack;
    this.varStack = varStack || [];
  };

  var stack = Stack;

  Stack.prototype.pushVar = function (varName) {
    this.varStack.push(varName || '$tmp');
  };

  Stack.prototype.popVar = function () {
    this.varStack.pop();
  };

  Stack.prototype.push = function (n, varName) {
    this.pushVar(varName);
    this.stack.push(n);
    this.checkConsistency();
  };

  Stack.prototype.pop = function () {
    this.popVar();
    let top = this.stack.pop();
    this.checkConsistency();
    return top
  };

  Stack.prototype.updateTopVars = function (vars) {
    if (vars.length > this.varStack.length) {
      throw new Error(`updateTopVars fail, stack: ${this.stack.length},  varStack: ${this.varStack.length}, vars:${vars.length}`)
    }
    vars = vars.reverse();
    this.varStack.splice(this.varStack.length - vars.length, vars.length, ...vars);
  };

  Stack.prototype.stacktop = function (i) {
    return this.stack[this.stack.length + i]
  };

  Stack.prototype.vartop = function (i) {
    return this.varStack[this.varStack.length + i]
  };

  Stack.prototype.slice = function (start, end) {
    return this.stack.slice(start, end)
  };

  Stack.prototype.splice = function (start, deleteCount, ...items) {
    this.varStack.splice(start, deleteCount, ...items);
    return this.stack.splice(start, deleteCount, ...items)
  };

  Stack.prototype.write = function (i, value) {
    this.stack[this.stack.length + i] = value;
  };

  Stack.prototype.copy = function () {
    return new Stack(this.stack.slice() || [], this.varStack.slice() || [])
  };

  function bytesToHexString (bytearray) {
    /* eslint-disable no-return-assign */
    return bytearray.reduce(function (o, c) { return o += ('0' + (c & 0xFF).toString(16)).slice(-2) }, '')
  }

  Stack.prototype.printVarStack = function () {
    let array = this.varStack.map((v, i) => ({
      name: v,
      value: bytesToHexString(this.rawstack[i].data)
    }));
    console.log(JSON.stringify(array, null, 4));
  };

  Stack.prototype.checkConsistency = function () {
    if (this.stack.length !== this.varStack.length) {
      this.printVarStack();
      throw new Error(`checkConsistency fail, stack: ${this.stack.length}, varStack:${this.varStack.length}`)
    }
  };

  Stack.prototype.checkConsistencyWithVars = function (varStack) {
    if (this.stack.length < varStack.length) {
      this.printVarStack();
      throw new Error(`checkConsistencyWithVars fail, stack: ${this.stack.length}, varStack:${varStack.length}`)
    }
  };

  Object.defineProperty(Stack.prototype, 'length', {
    get: function () {
      return this.stack.length
    }
  });

  Object.defineProperty(Stack.prototype, 'rawstack', {
    get: function () {
      return this.stack
    }
  });

  var transaction$1 = {exports: {}};

  var BufferWriter$4 = bufferwriter;
  var BufferReader$4 = bufferreader;
  var BN$3 = bn$1;

  var Varint = function Varint (buf) {
    if (!(this instanceof Varint)) { return new Varint(buf) }
    if (Buffer$1.isBuffer(buf)) {
      this.buf = buf;
    } else if (typeof buf === 'number') {
      var num = buf;
      this.fromNumber(num);
    } else if (buf instanceof BN$3) {
      var bn = buf;
      this.fromBN(bn);
    } else if (buf) {
      var obj = buf;
      this.set(obj);
    }
  };

  Varint.prototype.set = function (obj) {
    this.buf = obj.buf || this.buf;
    return this
  };

  Varint.prototype.fromString = function (str) {
    this.set({
      buf: Buffer$1.from(str, 'hex')
    });
    return this
  };

  Varint.prototype.toString = function () {
    return this.buf.toString('hex')
  };

  Varint.prototype.fromBuffer = function (buf) {
    this.buf = buf;
    return this
  };

  Varint.prototype.fromBufferReader = function (br) {
    this.buf = br.readVarintBuf();
    return this
  };

  Varint.prototype.fromBN = function (bn) {
    this.buf = BufferWriter$4().writeVarintBN(bn).concat();
    return this
  };

  Varint.prototype.fromNumber = function (num) {
    this.buf = BufferWriter$4().writeVarintNum(num).concat();
    return this
  };

  Varint.prototype.toBuffer = function () {
    return this.buf
  };

  Varint.prototype.toBN = function () {
    return BufferReader$4(this.buf).readVarintBN()
  };

  Varint.prototype.toNumber = function () {
    return BufferReader$4(this.buf).readVarintNum()
  };

  var varint = Varint;

  var output;
  var hasRequiredOutput;

  function requireOutput () {
  	if (hasRequiredOutput) return output;
  	hasRequiredOutput = 1;

  	var _ = __1;
  	var BN = bn$1;
  	var buffer = require$$0$4;
  	var JSUtil = js;
  	var BufferWriter = bufferwriter;
  	var Varint = varint;
  	var Script = requireScript();
  	var $ = preconditions;
  	var errors = errors$2.exports;

  	var MAX_SAFE_INTEGER = 0x1fffffffffffff;

  	function Output (args) {
  	  if (!(this instanceof Output)) {
  	    return new Output(args)
  	  }
  	  if (_.isObject(args)) {
  	    this.satoshis = args.satoshis;
  	    if (Buffer$1.isBuffer(args.script)) {
  	      this._scriptBuffer = args.script;
  	    } else {
  	      var script;
  	      if (_.isString(args.script) && JSUtil.isHexa(args.script)) {
  	        script = buffer.Buffer.from(args.script, 'hex');
  	      } else {
  	        script = args.script;
  	      }
  	      this.setScript(script);
  	    }
  	  } else {
  	    throw new TypeError('Unrecognized argument for Output')
  	  }
  	}

  	Object.defineProperty(Output.prototype, 'script', {
  	  configurable: false,
  	  enumerable: true,
  	  get: function () {
  	    if (this._script) {
  	      return this._script
  	    } else {
  	      this.setScriptFromBuffer(this._scriptBuffer);
  	      return this._script
  	    }
  	  }
  	});

  	Object.defineProperty(Output.prototype, 'satoshis', {
  	  configurable: false,
  	  enumerable: true,
  	  get: function () {
  	    return this._satoshis
  	  },
  	  set: function (num) {
  	    if (num instanceof BN) {
  	      this._satoshisBN = num;
  	      this._satoshis = num.toNumber();
  	    } else if (_.isString(num)) {
  	      this._satoshis = parseInt(num);
  	      this._satoshisBN = BN.fromNumber(this._satoshis);
  	    } else {
  	      $.checkArgument(
  	        JSUtil.isNaturalNumber(num),
  	        'Output satoshis is not a natural number'
  	      );
  	      this._satoshisBN = BN.fromNumber(num);
  	      this._satoshis = num;
  	    }
  	    $.checkState(
  	      JSUtil.isNaturalNumber(this._satoshis),
  	      'Output satoshis is not a natural number'
  	    );
  	  }
  	});

  	Output.prototype.invalidSatoshis = function () {
  	  if (this._satoshis > MAX_SAFE_INTEGER) {
  	    return 'transaction txout satoshis greater than max safe integer'
  	  }
  	  if (this._satoshis !== this._satoshisBN.toNumber()) {
  	    return 'transaction txout satoshis has corrupted value'
  	  }
  	  if (this._satoshis < 0) {
  	    return 'transaction txout negative'
  	  }
  	  return false
  	};

  	Object.defineProperty(Output.prototype, 'satoshisBN', {
  	  configurable: false,
  	  enumerable: true,
  	  get: function () {
  	    return this._satoshisBN
  	  },
  	  set: function (num) {
  	    this._satoshisBN = num;
  	    this._satoshis = num.toNumber();
  	    $.checkState(
  	      JSUtil.isNaturalNumber(this._satoshis),
  	      'Output satoshis is not a natural number'
  	    );
  	  }
  	});

  	Output.prototype.toObject = Output.prototype.toJSON = function toObject () {
  	  var obj = {
  	    satoshis: this.satoshis
  	  };
  	  obj.script = this._scriptBuffer.toString('hex');
  	  return obj
  	};

  	Output.fromObject = function (data) {
  	  return new Output(data)
  	};

  	Output.prototype.setScriptFromBuffer = function (buffer) {
  	  this._scriptBuffer = buffer;
  	  try {
  	    this._script = Script.fromBuffer(this._scriptBuffer);
  	    this._script._isOutput = true;
  	  } catch (e) {
  	    if (e instanceof errors.Script.InvalidBuffer) {
  	      this._script = null;
  	    } else {
  	      throw e
  	    }
  	  }
  	};

  	Output.prototype.setScript = function (script) {
  	  if (script instanceof Script) {
  	    this._scriptBuffer = script.toBuffer();
  	    this._script = script;
  	    this._script._isOutput = true;
  	  } else if (_.isString(script)) {
  	    this._script = Script.fromString(script);
  	    this._scriptBuffer = this._script.toBuffer();
  	    this._script._isOutput = true;
  	  } else if (Buffer$1.isBuffer(script)) {
  	    this.setScriptFromBuffer(script);
  	  } else {
  	    throw new TypeError('Invalid argument type: script')
  	  }
  	  return this
  	};

  	Output.prototype.inspect = function () {
  	  var scriptStr;
  	  if (this.script) {
  	    scriptStr = this.script.inspect();
  	  } else {
  	    scriptStr = this._scriptBuffer.toString('hex');
  	  }
  	  return '<Output (' + this.satoshis + ' sats) ' + scriptStr + '>'
  	};

  	Output.fromBufferReader = function (br) {
  	  var obj = {};
  	  obj.satoshis = br.readUInt64LEBN();
  	  var size = br.readVarintNum();
  	  if (size !== 0) {
  	    obj.script = br.read(size);
  	  } else {
  	    obj.script = buffer.Buffer.from([]);
  	  }
  	  return new Output(obj)
  	};

  	Output.prototype.toBufferWriter = function (writer) {
  	  if (!writer) {
  	    writer = new BufferWriter();
  	  }
  	  writer.writeUInt64LEBN(this._satoshisBN);
  	  var script = this._scriptBuffer;
  	  writer.writeVarintNum(script.length);
  	  writer.write(script);
  	  return writer
  	};

  	// 8    value
  	// ???  script size (VARINT)
  	// ???  script
  	Output.prototype.getSize = function () {
  	  var scriptSize = this.script.toBuffer().length;
  	  var varintSize = Varint(scriptSize).toBuffer().length;
  	  return 8 + varintSize + scriptSize
  	};

  	output = Output;
  	return output;
  }

  var input$1 = {exports: {}};

  var input;
  var hasRequiredInput$1;

  function requireInput$1 () {
  	if (hasRequiredInput$1) return input;
  	hasRequiredInput$1 = 1;

  	var _ = __1;
  	var $ = preconditions;
  	var errors = errors$2.exports;
  	var BufferWriter = bufferwriter;
  	var buffer = require$$0$4;
  	var JSUtil = js;
  	var Script = requireScript();
  	var Sighash = requireSighash();
  	var Output = requireOutput();

  	var MAXINT = 0xffffffff; // Math.pow(2, 32) - 1;
  	var DEFAULT_RBF_SEQNUMBER = MAXINT - 2;
  	var DEFAULT_SEQNUMBER = MAXINT;
  	var DEFAULT_LOCKTIME_SEQNUMBER = MAXINT - 1;

  	function Input (params) {
  	  if (!(this instanceof Input)) {
  	    return new Input(params)
  	  }
  	  if (params) {
  	    return this._fromObject(params)
  	  }
  	}

  	Input.MAXINT = MAXINT;
  	Input.DEFAULT_SEQNUMBER = DEFAULT_SEQNUMBER;
  	Input.DEFAULT_LOCKTIME_SEQNUMBER = DEFAULT_LOCKTIME_SEQNUMBER;
  	Input.DEFAULT_RBF_SEQNUMBER = DEFAULT_RBF_SEQNUMBER;
  	// txid + output index + sequence number
  	Input.BASE_SIZE = 32 + 4 + 4;

  	Object.defineProperty(Input.prototype, 'script', {
  	  configurable: false,
  	  enumerable: true,
  	  get: function () {
  	    if (this.isNull()) {
  	      return null
  	    }
  	    if (!this._script) {
  	      this._script = new Script(this._scriptBuffer);
  	      this._script._isInput = true;
  	    }
  	    return this._script
  	  }
  	});

  	Input.fromObject = function (obj) {
  	  $.checkArgument(_.isObject(obj));
  	  var input = new Input();
  	  return input._fromObject(obj)
  	};

  	Input.prototype._fromObject = function (params) {
  	  var prevTxId;
  	  if (_.isString(params.prevTxId) && JSUtil.isHexa(params.prevTxId)) {
  	    prevTxId = buffer.Buffer.from(params.prevTxId, 'hex');
  	  } else {
  	    prevTxId = params.prevTxId;
  	  }
  	  this.output = params.output
  	    ? (params.output instanceof Output ? params.output : new Output(params.output)) : undefined;
  	  this.prevTxId = prevTxId || params.txidbuf;
  	  this.outputIndex = _.isUndefined(params.outputIndex) ? params.txoutnum : params.outputIndex;
  	  this.sequenceNumber = _.isUndefined(params.sequenceNumber)
  	    ? (_.isUndefined(params.seqnum) ? DEFAULT_SEQNUMBER : params.seqnum) : params.sequenceNumber;
  	  if (_.isUndefined(params.script) && _.isUndefined(params.scriptBuffer)) {
  	    throw new errors.Transaction.Input.MissingScript()
  	  }
  	  this.setScript(params.scriptBuffer || params.script);
  	  return this
  	};

  	Input.prototype.toObject = Input.prototype.toJSON = function toObject () {
  	  var obj = {
  	    prevTxId: this.prevTxId.toString('hex'),
  	    outputIndex: this.outputIndex,
  	    sequenceNumber: this.sequenceNumber,
  	    script: this._scriptBuffer.toString('hex')
  	  };
  	  // add human readable form if input contains valid script
  	  if (this.script) {
  	    obj.scriptString = this.script.toString();
  	  }
  	  if (this.output) {
  	    obj.output = this.output.toObject();
  	  }
  	  return obj
  	};

  	Input.fromBufferReader = function (br) {
  	  var input = new Input();
  	  input.prevTxId = br.readReverse(32);
  	  input.outputIndex = br.readUInt32LE();
  	  input._scriptBuffer = br.readVarLengthBuffer();
  	  input.sequenceNumber = br.readUInt32LE();
  	  // TODO: return different classes according to which input it is
  	  // e.g: CoinbaseInput, PublicKeyHashInput, MultiSigScriptHashInput, etc.
  	  return input
  	};

  	Input.prototype.toBufferWriter = function (writer) {
  	  if (!writer) {
  	    writer = new BufferWriter();
  	  }
  	  writer.writeReverse(this.prevTxId);
  	  writer.writeUInt32LE(this.outputIndex);
  	  var script = this._scriptBuffer;
  	  writer.writeVarintNum(script.length);
  	  writer.write(script);
  	  writer.writeUInt32LE(this.sequenceNumber);
  	  return writer
  	};

  	Input.prototype.setScript = function (script) {
  	  this._script = null;
  	  if (script instanceof Script) {
  	    this._script = script;
  	    this._script._isInput = true;
  	    this._scriptBuffer = script.toBuffer();
  	  } else if (script === null) {
  	    this._script = Script.empty();
  	    this._script._isInput = true;
  	    this._scriptBuffer = this._script.toBuffer();
  	  } else if (JSUtil.isHexa(script)) {
  	    // hex string script
  	    this._scriptBuffer = buffer.Buffer.from(script, 'hex');
  	  } else if (_.isString(script)) {
  	    // human readable string script
  	    this._script = new Script(script);
  	    this._script._isInput = true;
  	    this._scriptBuffer = this._script.toBuffer();
  	  } else if (Buffer$1.isBuffer(script)) {
  	    // buffer script
  	    this._scriptBuffer = buffer.Buffer.from(script);
  	  } else {
  	    throw new TypeError('Invalid argument type: script')
  	  }
  	  return this
  	};

  	/**
  	 * Retrieve signatures for the provided PrivateKey.
  	 *
  	 * @param {Transaction} transaction - the transaction to be signed
  	 * @param {PrivateKey} privateKey - the private key to use when signing
  	 * @param {number} inputIndex - the index of this input in the provided transaction
  	 * @param {number} sigType - defaults to Signature.SIGHASH_ALL
  	 * @param {Buffer} addressHash - if provided, don't calculate the hash of the
  	 *     public key associated with the private key provided
  	 * @abstract
  	 */
  	Input.prototype.getSignatures = function () {
  	  // throw new errors.AbstractMethodInvoked(
  	  //   'Trying to sign unsupported output type (only P2PKH and P2SH multisig inputs are supported)' +
  	  //   ' for input: ' + JSON.stringify(this)
  	  // )
  	  return []
  	};

  	Input.prototype.isFullySigned = function () {
  	  throw new errors.AbstractMethodInvoked('Input#isFullySigned')
  	};

  	Input.prototype.isFinal = function () {
  	  return this.sequenceNumber === Input.MAXINT
  	};

  	Input.prototype.addSignature = function () {
  	  // throw new errors.AbstractMethodInvoked('Input#addSignature')
  	};

  	Input.prototype.clearSignatures = function () {
  	  // throw new errors.AbstractMethodInvoked('Input#clearSignatures')
  	};

  	Input.prototype.isValidSignature = function (transaction, signature) {
  	  // FIXME: Refactor signature so this is not necessary
  	  signature.signature.nhashtype = signature.sigtype;
  	  return Sighash.verify(
  	    transaction,
  	    signature.signature,
  	    signature.publicKey,
  	    signature.inputIndex,
  	    this.output.script,
  	    this.output.satoshisBN
  	  )
  	};

  	/**
  	 * @returns true if this is a coinbase input (represents no input)
  	 */
  	Input.prototype.isNull = function () {
  	  return this.prevTxId.toString('hex') === '0000000000000000000000000000000000000000000000000000000000000000' &&
  	    this.outputIndex === 0xffffffff
  	};

  	Input.prototype._estimateSize = function () {
  	  return this.toBufferWriter().toBuffer().length
  	};

  	input = Input;
  	return input;
  }

  var inherits = {exports: {}};

  var inherits_browser = {exports: {}};

  var hasRequiredInherits_browser;

  function requireInherits_browser () {
  	if (hasRequiredInherits_browser) return inherits_browser.exports;
  	hasRequiredInherits_browser = 1;
  	if (typeof Object.create === 'function') {
  	  // implementation from standard node.js 'util' module
  	  inherits_browser.exports = function inherits(ctor, superCtor) {
  	    ctor.super_ = superCtor;
  	    ctor.prototype = Object.create(superCtor.prototype, {
  	      constructor: {
  	        value: ctor,
  	        enumerable: false,
  	        writable: true,
  	        configurable: true
  	      }
  	    });
  	  };
  	} else {
  	  // old school shim for old browsers
  	  inherits_browser.exports = function inherits(ctor, superCtor) {
  	    ctor.super_ = superCtor;
  	    var TempCtor = function () {};
  	    TempCtor.prototype = superCtor.prototype;
  	    ctor.prototype = new TempCtor();
  	    ctor.prototype.constructor = ctor;
  	  };
  	}
  	return inherits_browser.exports;
  }

  (function (module) {
  	try {
  	  var util = require$$0$1;
  	  if (typeof util.inherits !== 'function') throw '';
  	  module.exports = util.inherits;
  	} catch (e) {
  	  module.exports = requireInherits_browser();
  	}
  } (inherits));

  var signature;
  var hasRequiredSignature;

  function requireSignature () {
  	if (hasRequiredSignature) return signature;
  	hasRequiredSignature = 1;

  	var _ = __1;
  	var $ = preconditions;
  	var inherits$1 = inherits.exports;
  	var JSUtil = js;

  	var PublicKey = requirePublickey();
  	var errors = errors$2.exports;
  	var Signature = signature$1;

  	/**
  	 * @desc
  	 * Wrapper around Signature with fields related to signing a transaction specifically
  	 *
  	 * @param {Object|string|TransactionSignature} arg
  	 * @constructor
  	 */
  	function TransactionSignature (arg) {
  	  if (!(this instanceof TransactionSignature)) {
  	    return new TransactionSignature(arg)
  	  }
  	  if (arg instanceof TransactionSignature) {
  	    return arg
  	  }
  	  if (_.isObject(arg)) {
  	    return this._fromObject(arg)
  	  }
  	  throw new errors.InvalidArgument('TransactionSignatures must be instantiated from an object')
  	}
  	inherits$1(TransactionSignature, Signature);

  	TransactionSignature.prototype._fromObject = function (arg) {
  	  this._checkObjectArgs(arg);
  	  this.publicKey = new PublicKey(arg.publicKey);
  	  this.prevTxId = Buffer$1.isBuffer(arg.prevTxId) ? arg.prevTxId : Buffer$1.from(arg.prevTxId, 'hex');
  	  this.outputIndex = arg.outputIndex;
  	  this.inputIndex = arg.inputIndex;
  	  this.signature = (arg.signature instanceof Signature) ? arg.signature
  	    : Buffer$1.isBuffer(arg.signature) ? Signature.fromBuffer(arg.signature)
  	      : Signature.fromString(arg.signature);
  	  this.sigtype = arg.sigtype;
  	  return this
  	};

  	TransactionSignature.prototype._checkObjectArgs = function (arg) {
  	  $.checkArgument(PublicKey(arg.publicKey), 'publicKey');
  	  $.checkArgument(!_.isUndefined(arg.inputIndex), 'inputIndex');
  	  $.checkArgument(!_.isUndefined(arg.outputIndex), 'outputIndex');
  	  $.checkState(_.isNumber(arg.inputIndex), 'inputIndex must be a number');
  	  $.checkState(_.isNumber(arg.outputIndex), 'outputIndex must be a number');
  	  $.checkArgument(arg.signature, 'signature');
  	  $.checkArgument(arg.prevTxId, 'prevTxId');
  	  $.checkState(arg.signature instanceof Signature ||
  	               Buffer$1.isBuffer(arg.signature) ||
  	               JSUtil.isHexa(arg.signature), 'signature must be a buffer or hexa value');
  	  $.checkState(Buffer$1.isBuffer(arg.prevTxId) ||
  	               JSUtil.isHexa(arg.prevTxId), 'prevTxId must be a buffer or hexa value');
  	  $.checkArgument(arg.sigtype, 'sigtype');
  	  $.checkState(_.isNumber(arg.sigtype), 'sigtype must be a number');
  	};

  	/**
  	 * Serializes a transaction to a plain JS object
  	 * @return {Object}
  	 */
  	TransactionSignature.prototype.toObject = TransactionSignature.prototype.toJSON = function toObject () {
  	  return {
  	    publicKey: this.publicKey.toString(),
  	    prevTxId: this.prevTxId.toString('hex'),
  	    outputIndex: this.outputIndex,
  	    inputIndex: this.inputIndex,
  	    signature: this.signature.toString(),
  	    sigtype: this.sigtype
  	  }
  	};

  	/**
  	 * Builds a TransactionSignature from an object
  	 * @param {Object} object
  	 * @return {TransactionSignature}
  	 */
  	TransactionSignature.fromObject = function (object) {
  	  $.checkArgument(object);
  	  return new TransactionSignature(object)
  	};

  	signature = TransactionSignature;
  	return signature;
  }

  var publickey$1;
  var hasRequiredPublickey$1;

  function requirePublickey$1 () {
  	if (hasRequiredPublickey$1) return publickey$1;
  	hasRequiredPublickey$1 = 1;

  	var inherits$1 = inherits.exports;

  	var $ = preconditions;

  	var Input = requireInput$1();
  	var Output = requireOutput();
  	var Sighash = requireSighash();
  	var Script = requireScript();
  	var Signature = signature$1;
  	var TransactionSignature = requireSignature();

  	/**
  	 * Represents a special kind of input of PayToPublicKey kind.
  	 * @constructor
  	 */
  	function PublicKeyInput () {
  	  Input.apply(this, arguments);
  	}
  	inherits$1(PublicKeyInput, Input);

  	/**
  	 * @param {Transaction} transaction - the transaction to be signed
  	 * @param {PrivateKey} privateKey - the private key with which to sign the transaction
  	 * @param {number} index - the index of the input in the transaction input vector
  	 * @param {number=} sigtype - the type of signature, defaults to Signature.SIGHASH_ALL
  	 * @return {Array} of objects that can be
  	 */
  	PublicKeyInput.prototype.getSignatures = function (transaction, privateKey, index, sigtype) {
  	  $.checkState(this.output instanceof Output);
  	  sigtype = sigtype || (Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID);
  	  var publicKey = privateKey.toPublicKey();
  	  if (publicKey.toString() === this.output.script.getPublicKey().toString('hex')) {
  	    return [new TransactionSignature({
  	      publicKey: publicKey,
  	      prevTxId: this.prevTxId,
  	      outputIndex: this.outputIndex,
  	      inputIndex: index,
  	      signature: Sighash.sign(transaction, privateKey, sigtype, index, this.output.script, this.output.satoshisBN),
  	      sigtype: sigtype
  	    })]
  	  }
  	  return []
  	};

  	/**
  	 * Add the provided signature
  	 *
  	 * @param {Object} signature
  	 * @param {PublicKey} signature.publicKey
  	 * @param {Signature} signature.signature
  	 * @param {number=} signature.sigtype
  	 * @return {PublicKeyInput} this, for chaining
  	 */
  	PublicKeyInput.prototype.addSignature = function (transaction, signature) {
  	  $.checkState(this.isValidSignature(transaction, signature), 'Signature is invalid');
  	  this.setScript(Script.buildPublicKeyIn(
  	    signature.signature.toDER(),
  	    signature.sigtype
  	  ));
  	  return this
  	};

  	/**
  	 * Clear the input's signature
  	 * @return {PublicKeyHashInput} this, for chaining
  	 */
  	PublicKeyInput.prototype.clearSignatures = function () {
  	  this.setScript(Script.empty());
  	  return this
  	};

  	/**
  	 * Query whether the input is signed
  	 * @return {boolean}
  	 */
  	PublicKeyInput.prototype.isFullySigned = function () {
  	  return this.script.isPublicKeyIn()
  	};

  	// 32   txid
  	// 4    output index
  	// ---
  	// 1    script size (VARINT)
  	// 1    signature size (OP_PUSHDATA)
  	// <=72 signature (DER + SIGHASH type)
  	// ---
  	// 4    sequence number
  	PublicKeyInput.SCRIPT_MAX_SIZE = 74;

  	PublicKeyInput.prototype._estimateSize = function () {
  	  return Input.BASE_SIZE + PublicKeyInput.SCRIPT_MAX_SIZE
  	};

  	publickey$1 = PublicKeyInput;
  	return publickey$1;
  }

  var publickeyhash;
  var hasRequiredPublickeyhash;

  function requirePublickeyhash () {
  	if (hasRequiredPublickeyhash) return publickeyhash;
  	hasRequiredPublickeyhash = 1;

  	var inherits$1 = inherits.exports;

  	var $ = preconditions;

  	var Hash = hash.exports;
  	var Input = requireInput$1();
  	var Output = requireOutput();
  	var Sighash = requireSighash();
  	var Script = requireScript();
  	var Signature = signature$1;
  	var TransactionSignature = requireSignature();

  	/**
  	 * Represents a special kind of input of PayToPublicKeyHash kind.
  	 * @constructor
  	 */
  	function PublicKeyHashInput () {
  	  Input.apply(this, arguments);
  	}
  	inherits$1(PublicKeyHashInput, Input);

  	/**
  	 * @param {Transaction} transaction - the transaction to be signed
  	 * @param {PrivateKey} privateKey - the private key with which to sign the transaction
  	 * @param {number} index - the index of the input in the transaction input vector
  	 * @param {number=} sigtype - the type of signature, defaults to Signature.SIGHASH_ALL
  	 * @param {Buffer=} hashData - the precalculated hash of the public key associated with the privateKey provided
  	 * @return {Array} of objects that can be
  	 */
  	PublicKeyHashInput.prototype.getSignatures = function (transaction, privateKey, index, sigtype, hashData) {
  	  $.checkState(this.output instanceof Output);
  	  hashData = hashData || Hash.sha256ripemd160(privateKey.publicKey.toBuffer());
  	  sigtype = sigtype || (Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID);

  	  if (hashData.equals(this.output.script.getPublicKeyHash())) {
  	    return [new TransactionSignature({
  	      publicKey: privateKey.publicKey,
  	      prevTxId: this.prevTxId,
  	      outputIndex: this.outputIndex,
  	      inputIndex: index,
  	      signature: Sighash.sign(transaction, privateKey, sigtype, index, this.output.script, this.output.satoshisBN),
  	      sigtype: sigtype
  	    })]
  	  }
  	  return []
  	};

  	/**
  	 * Add the provided signature
  	 *
  	 * @param {Object} signature
  	 * @param {PublicKey} signature.publicKey
  	 * @param {Signature} signature.signature
  	 * @param {number=} signature.sigtype
  	 * @return {PublicKeyHashInput} this, for chaining
  	 */
  	PublicKeyHashInput.prototype.addSignature = function (transaction, signature) {
  	  $.checkState(this.isValidSignature(transaction, signature), 'Signature is invalid');

  	  this.setScript(Script.buildPublicKeyHashIn(
  	    signature.publicKey,
  	    signature.signature.toDER(),
  	    signature.sigtype
  	  ));
  	  return this
  	};

  	/**
  	 * Clear the input's signature
  	 * @return {PublicKeyHashInput} this, for chaining
  	 */
  	PublicKeyHashInput.prototype.clearSignatures = function () {
  	  this.setScript(Script.empty());
  	  return this
  	};

  	/**
  	 * Query whether the input is signed
  	 * @return {boolean}
  	 */
  	PublicKeyHashInput.prototype.isFullySigned = function () {
  	  return this.script.isPublicKeyHashIn()
  	};

  	// 32   txid
  	// 4    output index
  	// --- script ---
  	// 1    script size (VARINT)
  	// 1    signature size (OP_PUSHDATA)
  	// <=72 signature (DER + SIGHASH type)
  	// 1    public key size (OP_PUSHDATA)
  	// 33   compressed public key
  	//
  	// 4    sequence number
  	PublicKeyHashInput.SCRIPT_MAX_SIZE = 108;

  	PublicKeyHashInput.prototype._estimateSize = function () {
  	  return Input.BASE_SIZE + PublicKeyHashInput.SCRIPT_MAX_SIZE
  	};

  	publickeyhash = PublicKeyHashInput;
  	return publickeyhash;
  }

  var multisig;
  var hasRequiredMultisig;

  function requireMultisig () {
  	if (hasRequiredMultisig) return multisig;
  	hasRequiredMultisig = 1;

  	var _ = __1;
  	var inherits$1 = inherits.exports;
  	var Input = requireInput$1();
  	var Output = requireOutput();
  	var $ = preconditions;

  	var Script = requireScript();
  	var Signature = signature$1;
  	var Sighash = requireSighash();
  	var TransactionSignature = requireSignature();
  	var PublicKey = requirePublickey();
  	var Varint = varint;

  	/**
  	 * @constructor
  	 */
  	function MultiSigInput (input, pubkeys, threshold, signatures) {
  	  Input.apply(this, arguments);
  	  var self = this;
  	  pubkeys = pubkeys || input.publicKeys;
  	  threshold = threshold || input.threshold;
  	  signatures = signatures || input.signatures;
  	  this.publicKeys = pubkeys.map(k => k.toString('hex')).sort().map(k => new PublicKey(k));
  	  $.checkState(Script.buildMultisigOut(this.publicKeys, threshold).equals(this.output.script),
  	    'Provided public keys don\'t match to the provided output script');
  	  this.publicKeyIndex = {};
  	  _.each(this.publicKeys, function (publicKey, index) {
  	    self.publicKeyIndex[publicKey.toString()] = index;
  	  });
  	  this.threshold = threshold;
  	  // Empty array of signatures
  	  this.signatures = signatures ? this._deserializeSignatures(signatures) : new Array(this.publicKeys.length);
  	}
  	inherits$1(MultiSigInput, Input);

  	MultiSigInput.prototype.toObject = function () {
  	  var obj = Input.prototype.toObject.apply(this, arguments);
  	  obj.threshold = this.threshold;
  	  obj.publicKeys = _.map(this.publicKeys, function (publicKey) { return publicKey.toString() });
  	  obj.signatures = this._serializeSignatures();
  	  return obj
  	};

  	MultiSigInput.prototype._deserializeSignatures = function (signatures) {
  	  return _.map(signatures, function (signature) {
  	    if (!signature) {
  	      return undefined
  	    }
  	    return new TransactionSignature(signature)
  	  })
  	};

  	MultiSigInput.prototype._serializeSignatures = function () {
  	  return _.map(this.signatures, function (signature) {
  	    if (!signature) {
  	      return undefined
  	    }
  	    return signature.toObject()
  	  })
  	};

  	MultiSigInput.prototype.getSignatures = function (transaction, privateKey, index, sigtype) {
  	  $.checkState(this.output instanceof Output);
  	  sigtype = sigtype || (Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID);

  	  var self = this;
  	  var results = [];
  	  _.each(this.publicKeys, function (publicKey) {
  	    if (publicKey.toString() === privateKey.publicKey.toString()) {
  	      results.push(new TransactionSignature({
  	        publicKey: privateKey.publicKey,
  	        prevTxId: self.prevTxId,
  	        outputIndex: self.outputIndex,
  	        inputIndex: index,
  	        signature: Sighash.sign(transaction, privateKey, sigtype, index, self.output.script, self.output.satoshisBN),
  	        sigtype: sigtype
  	      }));
  	    }
  	  });

  	  return results
  	};

  	MultiSigInput.prototype.addSignature = function (transaction, signature) {
  	  $.checkState(!this.isFullySigned(), 'All needed signatures have already been added');
  	  $.checkArgument(!_.isUndefined(this.publicKeyIndex[signature.publicKey.toString()]),
  	    'Signature has no matching public key');
  	  $.checkState(this.isValidSignature(transaction, signature));
  	  this.signatures[this.publicKeyIndex[signature.publicKey.toString()]] = signature;
  	  this._updateScript();
  	  return this
  	};

  	MultiSigInput.prototype._updateScript = function () {
  	  this.setScript(Script.buildMultisigIn(
  	    this.publicKeys,
  	    this.threshold,
  	    this._createSignatures()
  	  ));
  	  return this
  	};

  	MultiSigInput.prototype._createSignatures = function () {
  	  return _.map(
  	    _.filter(this.signatures, function (signature) { return !_.isUndefined(signature) }),
  	    function (signature) {
  	      return Buffer$1.concat([
  	        signature.signature.toDER(),
  	        Buffer$1.from([signature.sigtype & 0xff])
  	      ])
  	    }
  	  )
  	};

  	MultiSigInput.prototype.clearSignatures = function () {
  	  this.signatures = new Array(this.publicKeys.length);
  	  this._updateScript();
  	};

  	MultiSigInput.prototype.isFullySigned = function () {
  	  return this.countSignatures() === this.threshold
  	};

  	MultiSigInput.prototype.countMissingSignatures = function () {
  	  return this.threshold - this.countSignatures()
  	};

  	MultiSigInput.prototype.countSignatures = function () {
  	  return _.reduce(this.signatures, function (sum, signature) {
  	    return sum + (!!signature)
  	  }, 0)
  	};

  	MultiSigInput.prototype.publicKeysWithoutSignature = function () {
  	  var self = this;
  	  return _.filter(this.publicKeys, function (publicKey) {
  	    return !(self.signatures[self.publicKeyIndex[publicKey.toString()]])
  	  })
  	};

  	MultiSigInput.prototype.isValidSignature = function (transaction, signature) {
  	  // FIXME: Refactor signature so this is not necessary
  	  signature.signature.nhashtype = signature.sigtype;
  	  return Sighash.verify(
  	    transaction,
  	    signature.signature,
  	    signature.publicKey,
  	    signature.inputIndex,
  	    this.output.script,
  	    this.output.satoshisBN
  	  )
  	};

  	/**
  	 *
  	 * @param {Buffer[]} signatures
  	 * @param {PublicKey[]} publicKeys
  	 * @param {Transaction} transaction
  	 * @param {Integer} inputIndex
  	 * @param {Input} input
  	 * @returns {TransactionSignature[]}
  	 */
  	MultiSigInput.normalizeSignatures = function (transaction, input, inputIndex, signatures, publicKeys) {
  	  return publicKeys.map(function (pubKey) {
  	    var signatureMatch = null;
  	    signatures = signatures.filter(function (signatureBuffer) {
  	      if (signatureMatch) {
  	        return true
  	      }

  	      var signature = new TransactionSignature({
  	        signature: Signature.fromTxFormat(signatureBuffer),
  	        publicKey: pubKey,
  	        prevTxId: input.prevTxId,
  	        outputIndex: input.outputIndex,
  	        inputIndex: inputIndex,
  	        sigtype: Signature.SIGHASH_ALL
  	      });

  	      signature.signature.nhashtype = signature.sigtype;
  	      var isMatch = Sighash.verify(
  	        transaction,
  	        signature.signature,
  	        signature.publicKey,
  	        signature.inputIndex,
  	        input.output.script
  	      );

  	      if (isMatch) {
  	        signatureMatch = signature;
  	        return false
  	      }

  	      return true
  	    });

  	    return signatureMatch || null
  	  })
  	};

  	// 32   txid
  	// 4    output index
  	// --- script ---
  	// ??? script size (VARINT)
  	// 1    OP_0
  	// --- signature list ---
  	//      1       signature size (OP_PUSHDATA)
  	//      <=72    signature (DER + SIGHASH type)
  	//
  	// 4    sequence number
  	MultiSigInput.SIGNATURE_SIZE = 73;

  	MultiSigInput.prototype._estimateSize = function () {
  	  var scriptSize = 1 + this.threshold * MultiSigInput.SIGNATURE_SIZE;
  	  return Input.BASE_SIZE + Varint(scriptSize).toBuffer().length + scriptSize
  	};

  	multisig = MultiSigInput;
  	return multisig;
  }

  var multisigscripthash;
  var hasRequiredMultisigscripthash;

  function requireMultisigscripthash () {
  	if (hasRequiredMultisigscripthash) return multisigscripthash;
  	hasRequiredMultisigscripthash = 1;

  	var _ = __1;
  	var inherits$1 = inherits.exports;
  	var Input = requireInput$1();
  	var Output = requireOutput();
  	var $ = preconditions;

  	var Script = requireScript();
  	var Signature = signature$1;
  	var Sighash = requireSighash();
  	var TransactionSignature = requireSignature();
  	var PublicKey = requirePublickey();
  	var Varint = varint;

  	/**
  	 * @constructor
  	 */
  	function MultiSigScriptHashInput (input, pubkeys, threshold, signatures) {
  	  Input.apply(this, arguments);
  	  var self = this;
  	  pubkeys = pubkeys || input.publicKeys;
  	  threshold = threshold || input.threshold;
  	  signatures = signatures || input.signatures;
  	  this.publicKeys = pubkeys.map(k => k.toString('hex')).sort().map(k => new PublicKey(k));
  	  this.redeemScript = Script.buildMultisigOut(this.publicKeys, threshold);
  	  $.checkState(Script.buildScriptHashOut(this.redeemScript).equals(this.output.script),
  	    'Provided public keys don\'t hash to the provided output');
  	  this.publicKeyIndex = {};
  	  _.each(this.publicKeys, function (publicKey, index) {
  	    self.publicKeyIndex[publicKey.toString()] = index;
  	  });
  	  this.threshold = threshold;
  	  // Empty array of signatures
  	  this.signatures = signatures ? this._deserializeSignatures(signatures) : new Array(this.publicKeys.length);
  	}
  	inherits$1(MultiSigScriptHashInput, Input);

  	MultiSigScriptHashInput.prototype.toObject = function () {
  	  var obj = Input.prototype.toObject.apply(this, arguments);
  	  obj.threshold = this.threshold;
  	  obj.publicKeys = _.map(this.publicKeys, function (publicKey) { return publicKey.toString() });
  	  obj.signatures = this._serializeSignatures();
  	  return obj
  	};

  	MultiSigScriptHashInput.prototype._deserializeSignatures = function (signatures) {
  	  return _.map(signatures, function (signature) {
  	    if (!signature) {
  	      return undefined
  	    }
  	    return new TransactionSignature(signature)
  	  })
  	};

  	MultiSigScriptHashInput.prototype._serializeSignatures = function () {
  	  return _.map(this.signatures, function (signature) {
  	    if (!signature) {
  	      return undefined
  	    }
  	    return signature.toObject()
  	  })
  	};

  	MultiSigScriptHashInput.prototype.getSignatures = function (transaction, privateKey, index, sigtype) {
  	  $.checkState(this.output instanceof Output);
  	  sigtype = sigtype || (Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID);

  	  var self = this;
  	  var results = [];
  	  _.each(this.publicKeys, function (publicKey) {
  	    if (publicKey.toString() === privateKey.publicKey.toString()) {
  	      results.push(new TransactionSignature({
  	        publicKey: privateKey.publicKey,
  	        prevTxId: self.prevTxId,
  	        outputIndex: self.outputIndex,
  	        inputIndex: index,
  	        signature: Sighash.sign(transaction, privateKey, sigtype, index, self.redeemScript, self.output.satoshisBN),
  	        sigtype: sigtype
  	      }));
  	    }
  	  });
  	  return results
  	};

  	MultiSigScriptHashInput.prototype.addSignature = function (transaction, signature) {
  	  $.checkState(!this.isFullySigned(), 'All needed signatures have already been added');
  	  $.checkArgument(!_.isUndefined(this.publicKeyIndex[signature.publicKey.toString()]),
  	    'Signature has no matching public key');
  	  $.checkState(this.isValidSignature(transaction, signature));
  	  this.signatures[this.publicKeyIndex[signature.publicKey.toString()]] = signature;
  	  this._updateScript();
  	  return this
  	};

  	MultiSigScriptHashInput.prototype._updateScript = function () {
  	  this.setScript(Script.buildP2SHMultisigIn(
  	    this.publicKeys,
  	    this.threshold,
  	    this._createSignatures(),
  	    { cachedMultisig: this.redeemScript }
  	  ));
  	  return this
  	};

  	MultiSigScriptHashInput.prototype._createSignatures = function () {
  	  return _.map(
  	    _.filter(this.signatures, function (signature) { return !_.isUndefined(signature) }),
  	    function (signature) {
  	      return Buffer$1.concat([
  	        signature.signature.toDER(),
  	        Buffer$1.from([signature.sigtype & 0xff])
  	      ])
  	    }
  	  )
  	};

  	MultiSigScriptHashInput.prototype.clearSignatures = function () {
  	  this.signatures = new Array(this.publicKeys.length);
  	  this._updateScript();
  	};

  	MultiSigScriptHashInput.prototype.isFullySigned = function () {
  	  return this.countSignatures() === this.threshold
  	};

  	MultiSigScriptHashInput.prototype.countMissingSignatures = function () {
  	  return this.threshold - this.countSignatures()
  	};

  	MultiSigScriptHashInput.prototype.countSignatures = function () {
  	  return _.reduce(this.signatures, function (sum, signature) {
  	    return sum + (!!signature)
  	  }, 0)
  	};

  	MultiSigScriptHashInput.prototype.publicKeysWithoutSignature = function () {
  	  var self = this;
  	  return _.filter(this.publicKeys, function (publicKey) {
  	    return !(self.signatures[self.publicKeyIndex[publicKey.toString()]])
  	  })
  	};

  	MultiSigScriptHashInput.prototype.isValidSignature = function (transaction, signature) {
  	  // FIXME: Refactor signature so this is not necessary
  	  signature.signature.nhashtype = signature.sigtype;
  	  return Sighash.verify(
  	    transaction,
  	    signature.signature,
  	    signature.publicKey,
  	    signature.inputIndex,
  	    this.redeemScript,
  	    this.output.satoshisBN
  	  )
  	};

  	// 32   txid
  	// 4    output index
  	// --- script ---
  	// ???  script size (VARINT)
  	// 1    OP_0
  	// --- signature list ---
  	//      1       signature size (OP_PUSHDATA)
  	//      <=72    signature (DER + SIGHASH type)
  	//
  	// ???  redeem script size (OP_PUSHDATA)
  	// --- redeem script ---
  	//      1       OP_2
  	//      --- public key list ---
  	//      1       public key size (OP_PUSHDATA)
  	//      33      compressed public key
  	//
  	//      1       OP_3
  	//      1       OP_CHECKMULTISIG
  	//
  	// 4    sequence number
  	MultiSigScriptHashInput.SIGNATURE_SIZE = 73;
  	MultiSigScriptHashInput.PUBKEY_SIZE = 34;

  	MultiSigScriptHashInput.prototype._estimateSize = function () {
  	  var pubKeysSize = this.publicKeys.length * MultiSigScriptHashInput.PUBKEY_SIZE;
  	  var sigsSize = this.threshold * MultiSigScriptHashInput.SIGNATURE_SIZE;
  	  var redeemScriptSize = 3 + pubKeysSize;
  	  var redeemScriptPushdataSize = redeemScriptSize <= 75 ? 1 : redeemScriptSize <= 255 ? 2 : 3;
  	  var scriptLength = sigsSize + 1 + redeemScriptPushdataSize + redeemScriptSize;
  	  return Input.BASE_SIZE + Varint(scriptLength).toBuffer().length + scriptLength
  	};

  	multisigscripthash = MultiSigScriptHashInput;
  	return multisigscripthash;
  }

  var hasRequiredInput;

  function requireInput () {
  	if (hasRequiredInput) return input$1.exports;
  	hasRequiredInput = 1;
  	(function (module) {
  		module.exports = requireInput$1();

  		module.exports.PublicKey = requirePublickey$1();
  		module.exports.PublicKeyHash = requirePublickeyhash();
  		module.exports.MultiSig = requireMultisig();
  		module.exports.MultiSigScriptHash = requireMultisigscripthash();
  } (input$1));
  	return input$1.exports;
  }

  var sighash_1;
  var hasRequiredSighash;

  function requireSighash () {
  	if (hasRequiredSighash) return sighash_1;
  	hasRequiredSighash = 1;

  	var buffer = require$$0$4;

  	var Signature = signature$1;
  	var Script = requireScript();
  	var Output = requireOutput();
  	var BufferReader = bufferreader;
  	var BufferWriter = bufferwriter;
  	var BN = bn$1;
  	var Hash = hash.exports;
  	var ECDSA = requireEcdsa();
  	var $ = preconditions;
  	var Interpreter = requireInterpreter();
  	var _ = __1;

  	var SIGHASH_SINGLE_BUG = Buffer$1.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex');
  	var BITS_64_ON = 'ffffffffffffffff';

  	// By default, we sign with sighash_forkid
  	var DEFAULT_SIGN_FLAGS = Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID;

  	var sighashPreimageForForkId = function (transaction, sighashType, inputNumber, subscript, satoshisBN) {
  	  var input = transaction.inputs[inputNumber];
  	  $.checkArgument(
  	    satoshisBN instanceof BN,
  	    'For ForkId=0 signatures, satoshis or complete input must be provided'
  	  );

  	  function GetPrevoutHash (tx) {
  	    var writer = new BufferWriter();

  	    _.each(tx.inputs, function (input) {
  	      writer.writeReverse(input.prevTxId);
  	      writer.writeUInt32LE(input.outputIndex);
  	    });

  	    var buf = writer.toBuffer();
  	    var ret = Hash.sha256sha256(buf);
  	    return ret
  	  }

  	  function GetSequenceHash (tx) {
  	    var writer = new BufferWriter();

  	    _.each(tx.inputs, function (input) {
  	      writer.writeUInt32LE(input.sequenceNumber);
  	    });

  	    var buf = writer.toBuffer();
  	    var ret = Hash.sha256sha256(buf);
  	    return ret
  	  }

  	  function GetOutputsHash (tx, n) {
  	    var writer = new BufferWriter();

  	    if (_.isUndefined(n)) {
  	      _.each(tx.outputs, function (output) {
  	        output.toBufferWriter(writer);
  	      });
  	    } else {
  	      tx.outputs[n].toBufferWriter(writer);
  	    }

  	    var buf = writer.toBuffer();
  	    var ret = Hash.sha256sha256(buf);
  	    return ret
  	  }

  	  var hashPrevouts = Buffer$1.alloc(32);
  	  var hashSequence = Buffer$1.alloc(32);
  	  var hashOutputs = Buffer$1.alloc(32);

  	  if (!(sighashType & Signature.SIGHASH_ANYONECANPAY)) {
  	    hashPrevouts = GetPrevoutHash(transaction);
  	  }

  	  if (!(sighashType & Signature.SIGHASH_ANYONECANPAY) &&
  	    (sighashType & 31) !== Signature.SIGHASH_SINGLE &&
  	    (sighashType & 31) !== Signature.SIGHASH_NONE) {
  	    hashSequence = GetSequenceHash(transaction);
  	  }

  	  if ((sighashType & 31) !== Signature.SIGHASH_SINGLE && (sighashType & 31) !== Signature.SIGHASH_NONE) {
  	    hashOutputs = GetOutputsHash(transaction);
  	  } else if ((sighashType & 31) === Signature.SIGHASH_SINGLE && inputNumber < transaction.outputs.length) {
  	    hashOutputs = GetOutputsHash(transaction, inputNumber);
  	  }

  	  var writer = new BufferWriter();

  	  // Version
  	  writer.writeInt32LE(transaction.version);

  	  // Input prevouts/nSequence (none/all, depending on flags)
  	  writer.write(hashPrevouts);
  	  writer.write(hashSequence);

  	  //  outpoint (32-byte hash + 4-byte little endian)
  	  writer.writeReverse(input.prevTxId);
  	  writer.writeUInt32LE(input.outputIndex);

  	  // scriptCode of the input (serialized as scripts inside CTxOuts)
  	  writer.writeVarintNum(subscript.toBuffer().length);
  	  writer.write(subscript.toBuffer());

  	  // value of the output spent by this input (8-byte little endian)
  	  writer.writeUInt64LEBN(satoshisBN);

  	  // nSequence of the input (4-byte little endian)
  	  var sequenceNumber = input.sequenceNumber;
  	  writer.writeUInt32LE(sequenceNumber);

  	  // Outputs (none/one/all, depending on flags)
  	  writer.write(hashOutputs);

  	  // Locktime
  	  writer.writeUInt32LE(transaction.nLockTime);

  	  // sighashType
  	  writer.writeUInt32LE(sighashType >>> 0);

  	  var buf = writer.toBuffer();
  	  return buf
  	};

  	/**
  	 * Returns a buffer with the which is hashed with sighash that needs to be signed
  	 * for OP_CHECKSIG.
  	 *
  	 * @name Signing.sighash
  	 * @param {Transaction} transaction the transaction to sign
  	 * @param {number} sighashType the type of the hash
  	 * @param {number} inputNumber the input index for the signature
  	 * @param {Script} subscript the script that will be signed
  	 * @param {satoshisBN} input's amount (for  ForkId signatures)
  	 *
  	 */
  	var sighashPreimage = function sighashPreimage (transaction, sighashType, inputNumber, subscript, satoshisBN, flags) {
  	  var Transaction = requireTransaction$1();
  	  var Input = requireInput();

  	  if (_.isUndefined(flags)) {
  	    flags = DEFAULT_SIGN_FLAGS;
  	  }

  	  // Copy transaction
  	  var txcopy = Transaction.shallowCopy(transaction);

  	  // Copy script
  	  subscript = new Script(subscript);

  	  if (flags & Interpreter.SCRIPT_ENABLE_REPLAY_PROTECTION) {
  	    // Legacy chain's value for fork id must be of the form 0xffxxxx.
  	    // By xoring with 0xdead, we ensure that the value will be different
  	    // from the original one, even if it already starts with 0xff.
  	    var forkValue = sighashType >> 8;
  	    var newForkValue = 0xff0000 | (forkValue ^ 0xdead);
  	    sighashType = (newForkValue << 8) | (sighashType & 0xff);
  	  }

  	  if ((sighashType & Signature.SIGHASH_FORKID) && (flags & Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID)) {
  	    return sighashPreimageForForkId(txcopy, sighashType, inputNumber, subscript, satoshisBN)
  	  }

  	  // For no ForkId sighash, separators need to be removed.
  	  subscript.removeCodeseparators();

  	  var i;

  	  for (i = 0; i < txcopy.inputs.length; i++) {
  	    // Blank signatures for other inputs
  	    txcopy.inputs[i] = new Input(txcopy.inputs[i]).setScript(Script.empty());
  	  }

  	  txcopy.inputs[inputNumber] = new Input(txcopy.inputs[inputNumber]).setScript(subscript);

  	  if ((sighashType & 31) === Signature.SIGHASH_NONE ||
  	    (sighashType & 31) === Signature.SIGHASH_SINGLE) {
  	    // clear all sequenceNumbers
  	    for (i = 0; i < txcopy.inputs.length; i++) {
  	      if (i !== inputNumber) {
  	        txcopy.inputs[i].sequenceNumber = 0;
  	      }
  	    }
  	  }

  	  if ((sighashType & 31) === Signature.SIGHASH_NONE) {
  	    txcopy.outputs = [];
  	  } else if ((sighashType & 31) === Signature.SIGHASH_SINGLE) {
  	    // The SIGHASH_SINGLE bug.
  	    // https://bitcointalk.org/index.php?topic=260595.0
  	    if (inputNumber >= txcopy.outputs.length) {
  	      return SIGHASH_SINGLE_BUG
  	    }

  	    txcopy.outputs.length = inputNumber + 1;

  	    for (i = 0; i < inputNumber; i++) {
  	      txcopy.outputs[i] = new Output({
  	        satoshis: BN.fromBuffer(buffer.Buffer.from(BITS_64_ON, 'hex')),
  	        script: Script.empty()
  	      });
  	    }
  	  }

  	  if (sighashType & Signature.SIGHASH_ANYONECANPAY) {
  	    txcopy.inputs = [txcopy.inputs[inputNumber]];
  	  }

  	  var buf = new BufferWriter()
  	    .write(txcopy.toBuffer())
  	    .writeInt32LE(sighashType)
  	    .toBuffer();
  	  return buf
  	};

  	/**
  	 * Returns a buffer of length 32 bytes with the hash that needs to be signed
  	 * for OP_CHECKSIG.
  	 *
  	 * @name Signing.sighash
  	 * @param {Transaction} transaction the transaction to sign
  	 * @param {number} sighashType the type of the hash
  	 * @param {number} inputNumber the input index for the signature
  	 * @param {Script} subscript the script that will be signed
  	 * @param {satoshisBN} input's amount (for  ForkId signatures)
  	 *
  	 */
  	var sighash = function sighash (transaction, sighashType, inputNumber, subscript, satoshisBN, flags) {
  	  var preimage = sighashPreimage(transaction, sighashType, inputNumber, subscript, satoshisBN, flags);
  	  if (preimage.compare(SIGHASH_SINGLE_BUG) === 0) return preimage
  	  var ret = Hash.sha256sha256(preimage);
  	  ret = new BufferReader(ret).readReverse();
  	  return ret
  	};

  	/**
  	 * Create a signature
  	 *
  	 * @name Signing.sign
  	 * @param {Transaction} transaction
  	 * @param {PrivateKey} privateKey
  	 * @param {number} sighash
  	 * @param {number} inputIndex
  	 * @param {Script} subscript
  	 * @param {satoshisBN} input's amount
  	 * @return {Signature}
  	 */
  	function sign (transaction, privateKey, sighashType, inputIndex, subscript, satoshisBN, flags) {
  	  var hashbuf = sighash(transaction, sighashType, inputIndex, subscript, satoshisBN, flags);

  	  var sig = ECDSA.sign(hashbuf, privateKey, 'little').set({
  	    nhashtype: sighashType
  	  });
  	  return sig
  	}

  	/**
  	 * Verify a signature
  	 *
  	 * @name Signing.verify
  	 * @param {Transaction} transaction
  	 * @param {Signature} signature
  	 * @param {PublicKey} publicKey
  	 * @param {number} inputIndex
  	 * @param {Script} subscript
  	 * @param {satoshisBN} input's amount
  	 * @param {flags} verification flags
  	 * @return {boolean}
  	 */
  	function verify (transaction, signature, publicKey, inputIndex, subscript, satoshisBN, flags) {
  	  $.checkArgument(!_.isUndefined(transaction));
  	  $.checkArgument(!_.isUndefined(signature) && !_.isUndefined(signature.nhashtype));
  	  var hashbuf = sighash(transaction, signature.nhashtype, inputIndex, subscript, satoshisBN, flags);
  	  return ECDSA.verify(hashbuf, signature, publicKey, 'little')
  	}

  	/**
  	 * @namespace Signing
  	 */
  	sighash_1 = {
  	  sighashPreimage: sighashPreimage,
  	  sighash: sighash,
  	  sign: sign,
  	  verify: verify
  	};
  	return sighash_1;
  }

  var unspentoutput;
  var hasRequiredUnspentoutput;

  function requireUnspentoutput () {
  	if (hasRequiredUnspentoutput) return unspentoutput;
  	hasRequiredUnspentoutput = 1;

  	var _ = __1;
  	var $ = preconditions;
  	var JSUtil = js;

  	var Script = requireScript();
  	var Address = requireAddress();

  	/**
  	 * Represents an unspent output information: its script, associated amount and address,
  	 * transaction id and output index.
  	 *
  	 * @constructor
  	 * @param {object} data
  	 * @param {string} data.txid the previous transaction id
  	 * @param {string=} data.txId alias for `txid`
  	 * @param {number} data.vout the index in the transaction
  	 * @param {number=} data.outputIndex alias for `vout`
  	 * @param {string|Script} data.scriptPubKey the script that must be resolved to release the funds
  	 * @param {string|Script=} data.script alias for `scriptPubKey`
  	 * @param {number} data.amount amount of bitcoins associated
  	 * @param {number=} data.satoshis alias for `amount`, but expressed in satoshis (1 BSV = 1e8 satoshis)
  	 * @param {string|Address=} data.address the associated address to the script, if provided
  	 */
  	function UnspentOutput (data) {
  	  if (!(this instanceof UnspentOutput)) {
  	    return new UnspentOutput(data)
  	  }
  	  $.checkArgument(_.isObject(data), 'Must provide an object from where to extract data');
  	  var address = data.address ? new Address(data.address) : undefined;
  	  var txId = data.txid ? data.txid : data.txId;
  	  if (!txId || !JSUtil.isHexaString(txId) || txId.length > 64) {
  	    // TODO: Use the errors library
  	    throw new Error('Invalid TXID in object', data)
  	  }
  	  var outputIndex = _.isUndefined(data.vout) ? data.outputIndex : data.vout;
  	  if (!_.isNumber(outputIndex)) {
  	    throw new Error('Invalid outputIndex, received ' + outputIndex)
  	  }
  	  $.checkArgument(!_.isUndefined(data.scriptPubKey) || !_.isUndefined(data.script),
  	    'Must provide the scriptPubKey for that output!');
  	  var script = new Script(data.scriptPubKey || data.script);
  	  $.checkArgument(!_.isUndefined(data.amount) || !_.isUndefined(data.satoshis),
  	    'Must provide an amount for the output');
  	  var amount = !_.isUndefined(data.amount) ? Math.round(data.amount * 1e8) : data.satoshis;
  	  $.checkArgument(_.isNumber(amount), 'Amount must be a number');
  	  JSUtil.defineImmutable(this, {
  	    address: address,
  	    txId: txId,
  	    outputIndex: outputIndex,
  	    script: script,
  	    satoshis: amount
  	  });
  	}

  	/**
  	 * Provide an informative output when displaying this object in the console
  	 * @returns string
  	 */
  	UnspentOutput.prototype.inspect = function () {
  	  return '<UnspentOutput: ' + this.txId + ':' + this.outputIndex +
  	         ', satoshis: ' + this.satoshis + ', address: ' + this.address + '>'
  	};

  	/**
  	 * String representation: just "txid:index"
  	 * @returns string
  	 */
  	UnspentOutput.prototype.toString = function () {
  	  return this.txId + ':' + this.outputIndex
  	};

  	/**
  	 * Deserialize an UnspentOutput from an object
  	 * @param {object|string} data
  	 * @return UnspentOutput
  	 */
  	UnspentOutput.fromObject = function (data) {
  	  return new UnspentOutput(data)
  	};

  	/**
  	 * Returns a plain object (no prototype or methods) with the associated info for this output
  	 * @return {object}
  	 */
  	UnspentOutput.prototype.toObject = UnspentOutput.prototype.toJSON = function toObject () {
  	  return {
  	    address: this.address ? this.address.toString() : undefined,
  	    txid: this.txId,
  	    vout: this.outputIndex,
  	    scriptPubKey: this.script.toBuffer().toString('hex'),
  	    amount: Number.parseFloat((this.satoshis / 1e8).toFixed(8))
  	  }
  	};

  	unspentoutput = UnspentOutput;
  	return unspentoutput;
  }

  var transaction;
  var hasRequiredTransaction$1;

  function requireTransaction$1 () {
  	if (hasRequiredTransaction$1) return transaction;
  	hasRequiredTransaction$1 = 1;

  	var _ = __1;
  	var $ = preconditions;
  	var buffer = require$$0$4;

  	var errors = errors$2.exports;
  	var JSUtil = js;
  	var BufferReader = bufferreader;
  	var BufferWriter = bufferwriter;
  	var Varint = varint;
  	var Hash = hash.exports;
  	var Signature = signature$1;
  	var Sighash = requireSighash();

  	var Address = requireAddress();
  	var UnspentOutput = requireUnspentoutput();
  	var Input = requireInput();
  	var PublicKeyHashInput = Input.PublicKeyHash;
  	var PublicKeyInput = Input.PublicKey;
  	var MultiSigScriptHashInput = Input.MultiSigScriptHash;
  	var MultiSigInput = Input.MultiSig;
  	var Output = requireOutput();
  	var Script = requireScript();
  	var PrivateKey = requirePrivatekey();
  	var BN = bn$1;

  	/**
  	 * Represents a transaction, a set of inputs and outputs to change ownership of tokens
  	 *
  	 * @param {*} serialized
  	 * @constructor
  	 */
  	function Transaction (serialized) {
  	  if (!(this instanceof Transaction)) {
  	    return new Transaction(serialized)
  	  }
  	  this.inputs = [];
  	  this.outputs = [];
  	  this._inputAmount = undefined;
  	  this._outputAmount = undefined;
  	  this.unlockScriptCallbackMap = new Map();
  	  this.outputCallbackMap = new Map();
  	  this._privateKey = undefined;
  	  this._sigType = undefined;
  	  this.isSeal = false;
  	  if (serialized) {
  	    if (serialized instanceof Transaction) {
  	      return Transaction.shallowCopy(serialized)
  	    } else if (JSUtil.isHexa(serialized)) {
  	      this.fromString(serialized);
  	    } else if (Buffer$1.isBuffer(serialized)) {
  	      this.fromBuffer(serialized);
  	    } else if (_.isObject(serialized)) {
  	      this.fromObject(serialized);
  	    } else {
  	      throw new errors.InvalidArgument('Must provide an object or string to deserialize a transaction')
  	    }
  	  } else {
  	    this._newTransaction();
  	  }
  	}

  	var CURRENT_VERSION = 1;
  	var DEFAULT_NLOCKTIME = 0;
  	var MAX_BLOCK_SIZE = 1000000;

  	// Minimum amount for an output for it not to be considered a dust output
  	Transaction.DUST_AMOUNT = 1;

  	// Margin of error to allow fees in the vecinity of the expected value but doesn't allow a big difference
  	Transaction.FEE_SECURITY_MARGIN = 150;

  	// max amount of satoshis in circulation
  	Transaction.MAX_MONEY = 21000000 * 1e8;

  	// nlocktime limit to be considered block height rather than a timestamp
  	Transaction.NLOCKTIME_BLOCKHEIGHT_LIMIT = 5e8;

  	// Max value for an unsigned 32 bit value
  	Transaction.NLOCKTIME_MAX_VALUE = 4294967295;

  	// Value used for fee estimation (satoshis per kilobyte)
  	Transaction.FEE_PER_KB = browser$1.env.SATS;

  	// Safe upper bound for change address script size in bytes
  	Transaction.CHANGE_OUTPUT_MAX_SIZE = 20 + 4 + 34 + 4;

  	/* Constructors and Serialization */

  	/**
  	 * Create a 'shallow' copy of the transaction, by serializing and deserializing
  	 * it dropping any additional information that inputs and outputs may have hold
  	 *
  	 * @param {Transaction} transaction
  	 * @return {Transaction}
  	 */
  	Transaction.shallowCopy = function (transaction) {
  	  var copy = new Transaction(transaction.toBuffer());
  	  return copy
  	};

  	var hashProperty = {
  	  configurable: false,
  	  enumerable: true,
  	  get: function () {
  	    this._hash = new BufferReader(this._getHash()).readReverse().toString('hex');
  	    return this._hash
  	  }
  	};
  	Object.defineProperty(Transaction.prototype, 'hash', hashProperty);
  	Object.defineProperty(Transaction.prototype, 'id', hashProperty);

  	var ioProperty = {
  	  configurable: false,
  	  enumerable: true,
  	  get: function () {
  	    return this._getInputAmount()
  	  }
  	};
  	Object.defineProperty(Transaction.prototype, 'inputAmount', ioProperty);
  	ioProperty.get = function () {
  	  return this._getOutputAmount()
  	};
  	Object.defineProperty(Transaction.prototype, 'outputAmount', ioProperty);

  	/**
  	 * Retrieve the little endian hash of the transaction (used for serialization)
  	 * @return {Buffer}
  	 */
  	Transaction.prototype._getHash = function () {
  	  return Hash.sha256sha256(this.toBuffer())
  	};

  	/**
  	 * Retrieve a hexa string that can be used with bitcoind's CLI interface
  	 * (decoderawtransaction, sendrawtransaction)
  	 *
  	 * @param {Object|boolean=} unsafe if true, skip all tests. if it's an object,
  	 *   it's expected to contain a set of flags to skip certain tests:
  	 * * `disableAll`: disable all checks
  	 * * `disableLargeFees`: disable checking for fees that are too large
  	 * * `disableIsFullySigned`: disable checking if all inputs are fully signed
  	 * * `disableDustOutputs`: disable checking if there are no outputs that are dust amounts
  	 * * `disableMoreOutputThanInput`: disable checking if the transaction spends more bitcoins than the sum of the input amounts
  	 * @return {string}
  	 */
  	Transaction.prototype.serialize = function (unsafe) {
  	  if (unsafe === true || (unsafe && unsafe.disableAll)) {
  	    return this.uncheckedSerialize()
  	  } else {
  	    return this.checkedSerialize(unsafe)
  	  }
  	};

  	Transaction.prototype.uncheckedSerialize = Transaction.prototype.toString = function () {
  	  return this.toBuffer().toString('hex')
  	};

  	/**
  	 * Retrieve a hexa string that can be used with bitcoind's CLI interface
  	 * (decoderawtransaction, sendrawtransaction)
  	 *
  	 * @param {Object} opts allows to skip certain tests. {@see Transaction#serialize}
  	 * @return {string}
  	 */
  	Transaction.prototype.checkedSerialize = function (opts) {
  	  var serializationError = this.getSerializationError(opts);
  	  if (serializationError) {
  	    serializationError.message += ' - For more information please see: ' +
  	      'https://bsv.io/api/lib/transaction#serialization-checks';
  	    throw serializationError
  	  }
  	  return this.uncheckedSerialize()
  	};

  	Transaction.prototype.invalidSatoshis = function () {
  	  var invalid = false;
  	  for (var i = 0; i < this.outputs.length; i++) {
  	    if (this.outputs[i].invalidSatoshis()) {
  	      invalid = true;
  	    }
  	  }
  	  return invalid
  	};

  	/**
  	 * Retrieve a possible error that could appear when trying to serialize and
  	 * broadcast this transaction.
  	 *
  	 * @param {Object} opts allows to skip certain tests. {@see Transaction#serialize}
  	 * @return {bsv.Error}
  	 */
  	Transaction.prototype.getSerializationError = function (opts) {
  	  opts = opts || {};

  	  if (this.invalidSatoshis()) {
  	    return new errors.Transaction.InvalidSatoshis()
  	  }

  	  var unspent = this._getUnspentValue();
  	  var unspentError;
  	  if (unspent < 0) {
  	    if (!opts.disableMoreOutputThanInput) {
  	      unspentError = new errors.Transaction.InvalidOutputAmountSum();
  	    }
  	  } else {
  	    unspentError = this._hasFeeError(opts, unspent);
  	  }

  	  return unspentError ||
  	    this._hasDustOutputs(opts) ||
  	    this._isMissingSignatures(opts)
  	};

  	Transaction.prototype._hasFeeError = function (opts, unspent) {
  	  if (!_.isUndefined(this._fee) && this._fee !== unspent) {
  	    return new errors.Transaction.FeeError.Different(
  	      'Unspent value is ' + unspent + ' but specified fee is ' + this._fee
  	    )
  	  }

  	  if (!opts.disableLargeFees) {
  	    var maximumFee = Math.floor(Transaction.FEE_SECURITY_MARGIN * this._estimateFee());
  	    if (unspent > maximumFee) {
  	      if (this._missingChange()) {
  	        return new errors.Transaction.ChangeAddressMissing(
  	          'Fee is too large and no change address was provided'
  	        )
  	      }
  	      return new errors.Transaction.FeeError.TooLarge(
  	        'expected less than ' + maximumFee + ' but got ' + unspent
  	      )
  	    }
  	  }
  	};

  	Transaction.prototype._missingChange = function () {
  	  return !this._changeScript
  	};

  	Transaction.prototype._hasDustOutputs = function (opts) {
  	  if (opts.disableDustOutputs) {
  	    return
  	  }
  	  var index, output;
  	  for (index in this.outputs) {
  	    output = this.outputs[index];
  	    if (output.satoshis < Transaction.DUST_AMOUNT && !output.script.isDataOut() && !output.script.isSafeDataOut()) {
  	      return new errors.Transaction.DustOutputs()
  	    }
  	  }
  	};

  	Transaction.prototype._isMissingSignatures = function (opts) {
  	  if (opts.disableIsFullySigned) {
  	    return
  	  }
  	  if (!this.isFullySigned()) {
  	    return new errors.Transaction.MissingSignatures()
  	  }
  	};

  	Transaction.prototype.inspect = function () {
  	  return '<Transaction: ' + this.uncheckedSerialize() + '>'
  	};

  	Transaction.prototype.toBuffer = function () {
  	  var writer = new BufferWriter();
  	  return this.toBufferWriter(writer).toBuffer()
  	};

  	Transaction.prototype.toBufferWriter = function (writer) {
  	  writer.writeInt32LE(this.version);
  	  writer.writeVarintNum(this.inputs.length);
  	  _.each(this.inputs, function (input) {
  	    input.toBufferWriter(writer);
  	  });
  	  writer.writeVarintNum(this.outputs.length);
  	  _.each(this.outputs, function (output) {
  	    output.toBufferWriter(writer);
  	  });
  	  writer.writeUInt32LE(this.nLockTime);
  	  return writer
  	};

  	Transaction.prototype.fromBuffer = function (buffer) {
  	  var reader = new BufferReader(buffer);
  	  return this.fromBufferReader(reader)
  	};

  	Transaction.prototype.fromBufferReader = function (reader) {
  	  $.checkArgument(!reader.finished(), 'No transaction data received');
  	  var i, sizeTxIns, sizeTxOuts;

  	  this.version = reader.readInt32LE();
  	  sizeTxIns = reader.readVarintNum();
  	  for (i = 0; i < sizeTxIns; i++) {
  	    var input = Input.fromBufferReader(reader);
  	    this.inputs.push(input);
  	  }
  	  sizeTxOuts = reader.readVarintNum();
  	  for (i = 0; i < sizeTxOuts; i++) {
  	    this.outputs.push(Output.fromBufferReader(reader));
  	  }
  	  this.nLockTime = reader.readUInt32LE();
  	  return this
  	};

  	Transaction.prototype.toObject = Transaction.prototype.toJSON = function toObject () {
  	  var inputs = [];
  	  this.inputs.forEach(function (input) {
  	    inputs.push(input.toObject());
  	  });
  	  var outputs = [];
  	  this.outputs.forEach(function (output) {
  	    outputs.push(output.toObject());
  	  });
  	  var obj = {
  	    hash: this.hash,
  	    version: this.version,
  	    inputs: inputs,
  	    outputs: outputs,
  	    nLockTime: this.nLockTime
  	  };
  	  if (this._changeScript) {
  	    obj.changeScript = this._changeScript.toString();
  	  }
  	  if (!_.isUndefined(this._changeIndex)) {
  	    obj.changeIndex = this._changeIndex;
  	  }
  	  if (!_.isUndefined(this._fee)) {
  	    obj.fee = this._fee;
  	  }
  	  return obj
  	};

  	Transaction.prototype.fromObject = function fromObject (arg) {
  	  $.checkArgument(_.isObject(arg) || arg instanceof Transaction);
  	  var self = this;
  	  var transaction;
  	  if (arg instanceof Transaction) {
  	    transaction = transaction.toObject();
  	  } else {
  	    transaction = arg;
  	  }
  	  _.each(transaction.inputs, function (input) {
  	    if (!input.output || !input.output.script) {
  	      self.uncheckedAddInput(new Input(input));
  	      return
  	    }
  	    var script = new Script(input.output.script);
  	    var txin;
  	    if (script.isPublicKeyHashOut()) {
  	      txin = new Input.PublicKeyHash(input);
  	    } else if (script.isScriptHashOut() && input.publicKeys && input.threshold) {
  	      txin = new Input.MultiSigScriptHash(
  	        input, input.publicKeys, input.threshold, input.signatures
  	      );
  	    } else if (script.isPublicKeyOut()) {
  	      txin = new Input.PublicKey(input);
  	    } else {
  	      throw new errors.Transaction.Input.UnsupportedScript(input.output.script)
  	    }
  	    self.addInput(txin);
  	  });
  	  _.each(transaction.outputs, function (output) {
  	    self.addOutput(new Output(output));
  	  });
  	  if (transaction.changeIndex) {
  	    this._changeIndex = transaction.changeIndex;
  	  }
  	  if (transaction.changeScript) {
  	    this._changeScript = new Script(transaction.changeScript);
  	  }
  	  if (transaction.fee) {
  	    this._fee = transaction.fee;
  	  }
  	  this.nLockTime = transaction.nLockTime;
  	  this.version = transaction.version;
  	  this._checkConsistency(arg);
  	  return this
  	};

  	Transaction.prototype._checkConsistency = function (arg) {
  	  if (!_.isUndefined(this._changeIndex)) {
  	    $.checkState(this._changeScript, 'Change script is expected.');
  	    $.checkState(this.outputs[this._changeIndex], 'Change index points to undefined output.');
  	    $.checkState(this.outputs[this._changeIndex].script.toString() ===
  	      this._changeScript.toString(), 'Change output has an unexpected script.');
  	  }
  	  if (arg && arg.hash) {
  	    $.checkState(arg.hash === this.hash, 'Hash in object does not match transaction hash.');
  	  }
  	};

  	/**
  	 * Sets nLockTime so that transaction is not valid until the desired date(a
  	 * timestamp in seconds since UNIX epoch is also accepted)
  	 *
  	 * @param {Date | Number} time
  	 * @return {Transaction} this
  	 */
  	Transaction.prototype.lockUntilDate = function (time) {
  	  $.checkArgument(time);
  	  if (_.isNumber(time) && time < Transaction.NLOCKTIME_BLOCKHEIGHT_LIMIT) {
  	    throw new errors.Transaction.LockTimeTooEarly()
  	  }
  	  if (_.isDate(time)) {
  	    time = time.getTime() / 1000;
  	  }

  	  for (var i = 0; i < this.inputs.length; i++) {
  	    if (this.inputs[i].sequenceNumber === Input.DEFAULT_SEQNUMBER) {
  	      this.inputs[i].sequenceNumber = Input.DEFAULT_LOCKTIME_SEQNUMBER;
  	    }
  	  }

  	  this.nLockTime = time;
  	  return this
  	};

  	/**
  	 * Sets nLockTime so that transaction is not valid until the desired block
  	 * height.
  	 *
  	 * @param {Number} height
  	 * @return {Transaction} this
  	 */
  	Transaction.prototype.lockUntilBlockHeight = function (height) {
  	  $.checkArgument(_.isNumber(height));
  	  if (height >= Transaction.NLOCKTIME_BLOCKHEIGHT_LIMIT) {
  	    throw new errors.Transaction.BlockHeightTooHigh()
  	  }
  	  if (height < 0) {
  	    throw new errors.Transaction.NLockTimeOutOfRange()
  	  }

  	  for (var i = 0; i < this.inputs.length; i++) {
  	    if (this.inputs[i].sequenceNumber === Input.DEFAULT_SEQNUMBER) {
  	      this.inputs[i].sequenceNumber = Input.DEFAULT_LOCKTIME_SEQNUMBER;
  	    }
  	  }

  	  this.nLockTime = height;
  	  return this
  	};

  	/**
  	 *  Returns a semantic version of the transaction's nLockTime.
  	 *  @return {Number|Date}
  	 *  If nLockTime is 0, it returns null,
  	 *  if it is < 500000000, it returns a block height (number)
  	 *  else it returns a Date object.
  	 */
  	Transaction.prototype.getLockTime = function () {
  	  if (!this.nLockTime) {
  	    return null
  	  }
  	  if (this.nLockTime < Transaction.NLOCKTIME_BLOCKHEIGHT_LIMIT) {
  	    return this.nLockTime
  	  }
  	  return new Date(1000 * this.nLockTime)
  	};

  	Transaction.prototype.fromString = function (string) {
  	  this.fromBuffer(buffer.Buffer.from(string, 'hex'));
  	};

  	Transaction.prototype._newTransaction = function () {
  	  this.version = CURRENT_VERSION;
  	  this.nLockTime = DEFAULT_NLOCKTIME;
  	};

  	/* Transaction creation interface */

  	/**
  	 * @typedef {Object} Transaction~fromObject
  	 * @property {string} prevTxId
  	 * @property {number} outputIndex
  	 * @property {(Buffer|string|Script)} script
  	 * @property {number} satoshis
  	 */

  	/**
  	 * Add an input to this transaction. This is a high level interface
  	 * to add an input, for more control, use @{link Transaction#addInput}.
  	 *
  	 * Can receive, as output information, the output of bitcoind's `listunspent` command,
  	 * and a slightly fancier format recognized by bsv:
  	 *
  	 * ```
  	 * {
  	 *  address: 'mszYqVnqKoQx4jcTdJXxwKAissE3Jbrrc1',
  	 *  txId: 'a477af6b2667c29670467e4e0728b685ee07b240235771862318e29ddbe58458',
  	 *  outputIndex: 0,
  	 *  script: Script.empty(),
  	 *  satoshis: 1020000
  	 * }
  	 * ```
  	 * Where `address` can be either a string or a bsv Address object. The
  	 * same is true for `script`, which can be a string or a bsv Script.
  	 *
  	 * Beware that this resets all the signatures for inputs (in further versions,
  	 * SIGHASH_SINGLE or SIGHASH_NONE signatures will not be reset).
  	 *
  	 * @example
  	 * ```javascript
  	 * var transaction = new Transaction();
  	 *
  	 * // From a pay to public key hash output from bitcoind's listunspent
  	 * transaction.from({'txid': '0000...', vout: 0, amount: 0.1, scriptPubKey: 'OP_DUP ...'});
  	 *
  	 * // From a pay to public key hash output
  	 * transaction.from({'txId': '0000...', outputIndex: 0, satoshis: 1000, script: 'OP_DUP ...'});
  	 *
  	 * // From a multisig P2SH output
  	 * transaction.from({'txId': '0000...', inputIndex: 0, satoshis: 1000, script: '... OP_HASH'},
  	 *                  ['03000...', '02000...'], 2);
  	 * ```
  	 *
  	 * @param {(Array.<Transaction~fromObject>|Transaction~fromObject)} utxo
  	 * @param {Array=} pubkeys
  	 * @param {number=} threshold
  	 */
  	Transaction.prototype.from = function (utxo, pubkeys, threshold) {
  	  if (_.isArray(utxo)) {
  	    var self = this;
  	    _.each(utxo, function (utxo) {
  	      self.from(utxo, pubkeys, threshold);
  	    });
  	    return this
  	  }
  	  var exists = _.some(this.inputs, function (input) {
  	    // TODO: Maybe prevTxId should be a string? Or defined as read only property?
  	    return input.prevTxId.toString('hex') === utxo.txId && input.outputIndex === utxo.outputIndex
  	  });
  	  if (exists) {
  	    return this
  	  }
  	  if (pubkeys && threshold) {
  	    this._fromMultisigUtxo(utxo, pubkeys, threshold);
  	  } else {
  	    this._fromNonP2SH(utxo);
  	  }
  	  return this
  	};

  	Transaction.prototype._fromNonP2SH = function (utxo) {
  	  var Clazz;
  	  utxo = new UnspentOutput(utxo);
  	  if (utxo.script.isPublicKeyHashOut()) {
  	    Clazz = PublicKeyHashInput;
  	  } else if (utxo.script.isPublicKeyOut()) {
  	    Clazz = PublicKeyInput;
  	  } else {
  	    Clazz = Input;
  	  }
  	  this.addInput(new Clazz({
  	    output: new Output({
  	      script: utxo.script,
  	      satoshis: utxo.satoshis
  	    }),
  	    prevTxId: utxo.txId,
  	    outputIndex: utxo.outputIndex,
  	    script: Script.empty()
  	  }));
  	};

  	Transaction.prototype._fromMultisigUtxo = function (utxo, pubkeys, threshold) {
  	  $.checkArgument(threshold <= pubkeys.length,
  	    'Number of required signatures must be greater than the number of public keys');
  	  var Clazz;
  	  utxo = new UnspentOutput(utxo);
  	  if (utxo.script.isMultisigOut()) {
  	    Clazz = MultiSigInput;
  	  } else if (utxo.script.isScriptHashOut()) {
  	    Clazz = MultiSigScriptHashInput;
  	  } else {
  	    throw new Error('@TODO')
  	  }
  	  this.addInput(new Clazz({
  	    output: new Output({
  	      script: utxo.script,
  	      satoshis: utxo.satoshis
  	    }),
  	    prevTxId: utxo.txId,
  	    outputIndex: utxo.outputIndex,
  	    script: Script.empty()
  	  }, pubkeys, threshold));
  	};

  	/**
  	 * Add an input to this transaction. The input must be an instance of the `Input` class.
  	 * It should have information about the Output that it's spending, but if it's not already
  	 * set, two additional parameters, `outputScript` and `satoshis` can be provided.
  	 *
  	 * @param {Input} input
  	 * @param {String|Script} outputScript
  	 * @param {number} satoshis
  	 * @return Transaction this, for chaining
  	 */
  	Transaction.prototype.addInput = function (input, outputScript, satoshis) {
  	  $.checkArgumentType(input, Input, 'input');
  	  if (!input.output && (_.isUndefined(outputScript) || _.isUndefined(satoshis))) {
  	    throw new errors.Transaction.NeedMoreInfo('Need information about the UTXO script and satoshis')
  	  }
  	  if (!input.output && outputScript && !_.isUndefined(satoshis)) {
  	    outputScript = outputScript instanceof Script ? outputScript : new Script(outputScript);
  	    $.checkArgumentType(satoshis, 'number', 'satoshis');
  	    input.output = new Output({
  	      script: outputScript,
  	      satoshis: satoshis
  	    });
  	  }
  	  return this.uncheckedAddInput(input)
  	};

  	/**
  	 * Add an input to this transaction, without checking that the input has information about
  	 * the output that it's spending.
  	 *
  	 * @param {Input} input
  	 * @return Transaction this, for chaining
  	 */
  	Transaction.prototype.uncheckedAddInput = function (input) {
  	  $.checkArgumentType(input, Input, 'input');
  	  this.inputs.push(input);
  	  this._inputAmount = undefined;
  	  this._updateChangeOutput();
  	  return this
  	};

  	/**
  	 * Returns true if the transaction has enough info on all inputs to be correctly validated
  	 *
  	 * @return {boolean}
  	 */
  	Transaction.prototype.hasAllUtxoInfo = function () {
  	  return _.every(this.inputs.map(function (input) {
  	    return !!input.output
  	  }))
  	};

  	/**
  	 * Manually set the fee for this transaction. Beware that this resets all the signatures
  	 * for inputs (in further versions, SIGHASH_SINGLE or SIGHASH_NONE signatures will not
  	 * be reset).
  	 *
  	 * @param {number} amount satoshis to be sent
  	 * @return {Transaction} this, for chaining
  	 */
  	Transaction.prototype.fee = function (amount) {
  	  $.checkArgument(_.isNumber(amount), 'amount must be a number');
  	  this._fee = amount;
  	  this._updateChangeOutput();
  	  return this
  	};

  	/**
  	 * Manually set the fee per KB for this transaction. Beware that this resets all the signatures
  	 * for inputs (in further versions, SIGHASH_SINGLE or SIGHASH_NONE signatures will not
  	 * be reset).
  	 *
  	 * @param {number} amount satoshis per KB to be sent
  	 * @return {Transaction} this, for chaining
  	 */
  	Transaction.prototype.feePerKb = function (amount) {
  	  $.checkArgument(_.isNumber(amount), 'amount must be a number');
  	  this._feePerKb = amount;
  	  this._updateChangeOutput();
  	  return this
  	};

  	/* Output management */

  	/**
  	 * Set the change address for this transaction
  	 *
  	 * Beware that this resets all the signatures for inputs (in further versions,
  	 * SIGHASH_SINGLE or SIGHASH_NONE signatures will not be reset).
  	 *
  	 * @param {Address} address An address for change to be sent to.
  	 * @return {Transaction} this, for chaining
  	 */
  	Transaction.prototype.change = function (address) {
  	  $.checkArgument(address, 'address is required');
  	  this._changeScript = Script.fromAddress(address);
  	  this._updateChangeOutput();
  	  return this
  	};

  	/**
  	 * @return {Output} change output, if it exists
  	 */
  	Transaction.prototype.getChangeOutput = function () {
  	  if (!_.isUndefined(this._changeIndex)) {
  	    return this.outputs[this._changeIndex]
  	  }
  	  return null
  	};

  	/**
  	 * @typedef {Object} Transaction~toObject
  	 * @property {(string|Address)} address
  	 * @property {number} satoshis
  	 */

  	/**
  	 * Add an output to the transaction.
  	 *
  	 * Beware that this resets all the signatures for inputs (in further versions,
  	 * SIGHASH_SINGLE or SIGHASH_NONE signatures will not be reset).
  	 *
  	 * @param {(string|Address|Array.<Transaction~toObject>)} address
  	 * @param {number} amount in satoshis
  	 * @return {Transaction} this, for chaining
  	 */
  	Transaction.prototype.to = function (address, amount) {
  	  if (_.isArray(address)) {
  	    var self = this;
  	    _.each(address, function (to) {
  	      self.to(to.address, to.satoshis);
  	    });
  	    return this
  	  }

  	  $.checkArgument(
  	    JSUtil.isNaturalNumber(amount),
  	    'Amount is expected to be a positive integer'
  	  );
  	  this.addOutput(new Output({
  	    script: Script(new Address(address)),
  	    satoshis: amount
  	  }));
  	  return this
  	};

  	/**
  	 * Add an OP_RETURN output to the transaction.
  	 *
  	 * Beware that this resets all the signatures for inputs (in further versions,
  	 * SIGHASH_SINGLE or SIGHASH_NONE signatures will not be reset).
  	 *
  	 * @param {Buffer|string} value the data to be stored in the OP_RETURN output.
  	 *    In case of a string, the UTF-8 representation will be stored
  	 * @return {Transaction} this, for chaining
  	 */
  	Transaction.prototype.addData = function (value) {
  	  this.addOutput(new Output({
  	    script: Script.buildDataOut(value),
  	    satoshis: 0
  	  }));
  	  return this
  	};

  	/**
  	 * Add an OP_FALSE | OP_RETURN output to the transaction.
  	 *
  	 * Beware that this resets all the signatures for inputs (in further versions,
  	 * SIGHASH_SINGLE or SIGHASH_NONE signatures will not be reset).
  	 *
  	 * @param {Buffer|string} value the data to be stored in the OP_RETURN output.
  	 *    In case of a string, the UTF-8 representation will be stored
  	 * @return {Transaction} this, for chaining
  	 */
  	Transaction.prototype.addSafeData = function (value) {
  	  this.addOutput(new Output({
  	    script: Script.buildSafeDataOut(value),
  	    satoshis: 0
  	  }));
  	  return this
  	};

  	/**
  	 * Add an output to the transaction.
  	 *
  	 * @param {Output} output the output to add.
  	 * @return {Transaction} this, for chaining
  	 */
  	Transaction.prototype.addOutput = function (output) {
  	  $.checkArgumentType(output, Output, 'output');
  	  this._addOutput(output);
  	  this._updateChangeOutput();
  	  return this
  	};

  	/**
  	 * Remove all outputs from the transaction.
  	 *
  	 * @return {Transaction} this, for chaining
  	 */
  	Transaction.prototype.clearOutputs = function () {
  	  this.outputs = [];
  	  this._clearSignatures();
  	  this._outputAmount = undefined;
  	  this._changeIndex = undefined;
  	  this._updateChangeOutput();
  	  return this
  	};

  	Transaction.prototype._addOutput = function (output) {
  	  this.outputs.push(output);
  	  this._outputAmount = undefined;
  	};

  	/**
  	 * Calculates or gets the total output amount in satoshis
  	 *
  	 * @return {Number} the transaction total output amount
  	 */
  	Transaction.prototype._getOutputAmount = function () {
  	  if (_.isUndefined(this._outputAmount)) {
  	    var self = this;
  	    this._outputAmount = 0;
  	    _.each(this.outputs, function (output) {
  	      self._outputAmount += output.satoshis;
  	    });
  	  }
  	  return this._outputAmount
  	};

  	/**
  	 * Calculates or gets the total input amount in satoshis
  	 *
  	 * @return {Number} the transaction total input amount
  	 */
  	Transaction.prototype._getInputAmount = function () {
  	  if (_.isUndefined(this._inputAmount)) {
  	    var self = this;
  	    this._inputAmount = 0;
  	    _.each(this.inputs, function (input) {
  	      if (_.isUndefined(input.output)) {
  	        throw new errors.Transaction.Input.MissingPreviousOutput()
  	      }
  	      self._inputAmount += input.output.satoshis;
  	    });
  	  }
  	  return this._inputAmount
  	};

  	Transaction.prototype._updateChangeOutput = function () {
  	  if (this.isSeal) {
  	    throw new errors.Transaction.TransactionAlreadySealed()
  	  }

  	  if (!this._changeScript) {
  	    return
  	  }
  	  this._clearSignatures();
  	  if (!_.isUndefined(this._changeIndex)) {
  	    this._removeOutput(this._changeIndex);
  	  }
  	  this._changeIndex = this.outputs.length;
  	  this._addOutput(new Output({
  	    script: this._changeScript,
  	    satoshis: 0
  	  }));
  	  var available = this._getUnspentValue();
  	  var fee = this.getFee();
  	  var changeAmount = available - fee;
  	  this._removeOutput(this._changeIndex);
  	  this._changeIndex = undefined;
  	  if (changeAmount >= Transaction.DUST_AMOUNT) {
  	    this._changeIndex = this.outputs.length;
  	    this._addOutput(new Output({
  	      script: this._changeScript,
  	      satoshis: changeAmount
  	    }));
  	  }
  	};
  	/**
  	 * Calculates the fee of the transaction.
  	 *
  	 * If there's a fixed fee set, return that.
  	 *
  	 * If there is no change output set, the fee is the
  	 * total value of the outputs minus inputs. Note that
  	 * a serialized transaction only specifies the value
  	 * of its outputs. (The value of inputs are recorded
  	 * in the previous transaction outputs being spent.)
  	 * This method therefore raises a "MissingPreviousOutput"
  	 * error when called on a serialized transaction.
  	 *
  	 * If there's no fee set and no change address,
  	 * estimate the fee based on size.
  	 *
  	 * @return {Number} fee of this transaction in satoshis
  	 */
  	Transaction.prototype.getFee = function () {
  	  if (this.isCoinbase()) {
  	    return 0
  	  }
  	  if (!_.isUndefined(this._fee)) {
  	    return this._fee
  	  }
  	  // if no change output is set, fees should equal all the unspent amount
  	  if (!this._changeScript) {
  	    return this._getUnspentValue()
  	  }
  	  return this._estimateFee()
  	};

  	/**
  	 * Estimates fee from serialized transaction size in bytes.
  	 */
  	Transaction.prototype._estimateFee = function () {
  	  var estimatedSize = this._estimateSize();
  	  return Math.ceil(estimatedSize / 1000 * (this._feePerKb || Transaction.FEE_PER_KB))
  	};

  	Transaction.prototype._getUnspentValue = function () {
  	  return this._getInputAmount() - this._getOutputAmount()
  	};

  	Transaction.prototype._clearSignatures = function () {
  	  _.each(this.inputs, function (input) {
  	    input.clearSignatures();
  	  });
  	};

  	// 4    version
  	// ???  num inputs (VARINT)
  	// --- input list ---
  	//
  	// ???  num outputs (VARINT)
  	// --- output list ---
  	//      8       value
  	//      ???     script size (VARINT)
  	//      ???     script
  	//
  	// 4    locktime
  	Transaction.prototype._estimateSize = function () {
  	  var result = 4 + 4; // size of version + size of locktime
  	  result += Varint(this.inputs.length).toBuffer().length;
  	  result += Varint(this.outputs.length).toBuffer().length;
  	  _.each(this.inputs, function (input) {
  	    result += input._estimateSize();
  	  });
  	  _.each(this.outputs, function (output) {
  	    result += output.getSize();
  	  });
  	  return result
  	};

  	Transaction.prototype._removeOutput = function (index) {
  	  var output = this.outputs[index];
  	  this.outputs = _.without(this.outputs, output);
  	  this._outputAmount = undefined;
  	};

  	Transaction.prototype.removeOutput = function (index) {
  	  this._removeOutput(index);
  	  this._updateChangeOutput();
  	};

  	/**
  	 * Sort a transaction's inputs and outputs according to BIP69
  	 *
  	 * @see {https://github.com/bitcoin/bips/blob/master/bip-0069.mediawiki}
  	 * @return {Transaction} this
  	 */
  	Transaction.prototype.sort = function () {
  	  this.sortInputs(function (inputs) {
  	    var copy = Array.prototype.concat.apply([], inputs);
  	    copy.sort(function (first, second) {
  	      return first.prevTxId.compare(second.prevTxId) ||
  	        first.outputIndex - second.outputIndex
  	    });
  	    return copy
  	  });
  	  this.sortOutputs(function (outputs) {
  	    var copy = Array.prototype.concat.apply([], outputs);
  	    copy.sort(function (first, second) {
  	      return first.satoshis - second.satoshis ||
  	        first.script.toBuffer().compare(second.script.toBuffer())
  	    });
  	    return copy
  	  });
  	  return this
  	};

  	/**
  	 * Randomize this transaction's outputs ordering. The shuffling algorithm is a
  	 * version of the Fisher-Yates shuffle.
  	 *
  	 * @return {Transaction} this
  	 */
  	Transaction.prototype.shuffleOutputs = function () {
  	  return this.sortOutputs(_.shuffle)
  	};

  	/**
  	 * Sort this transaction's outputs, according to a given sorting function that
  	 * takes an array as argument and returns a new array, with the same elements
  	 * but with a different order. The argument function MUST NOT modify the order
  	 * of the original array
  	 *
  	 * @param {Function} sortingFunction
  	 * @return {Transaction} this
  	 */
  	Transaction.prototype.sortOutputs = function (sortingFunction) {
  	  var outs = sortingFunction(this.outputs);
  	  return this._newOutputOrder(outs)
  	};

  	/**
  	 * Sort this transaction's inputs, according to a given sorting function that
  	 * takes an array as argument and returns a new array, with the same elements
  	 * but with a different order.
  	 *
  	 * @param {Function} sortingFunction
  	 * @return {Transaction} this
  	 */
  	Transaction.prototype.sortInputs = function (sortingFunction) {
  	  this.inputs = sortingFunction(this.inputs);
  	  this._clearSignatures();
  	  return this
  	};

  	Transaction.prototype._newOutputOrder = function (newOutputs) {
  	  var isInvalidSorting = (this.outputs.length !== newOutputs.length ||
  	                          _.difference(this.outputs, newOutputs).length !== 0);
  	  if (isInvalidSorting) {
  	    throw new errors.Transaction.InvalidSorting()
  	  }

  	  if (!_.isUndefined(this._changeIndex)) {
  	    var changeOutput = this.outputs[this._changeIndex];
  	    this._changeIndex = newOutputs.indexOf(changeOutput);
  	  }

  	  this.outputs = newOutputs;
  	  return this
  	};

  	Transaction.prototype.removeInput = function (txId, outputIndex) {
  	  var index;
  	  if (!outputIndex && _.isNumber(txId)) {
  	    index = txId;
  	  } else {
  	    index = _.findIndex(this.inputs, function (input) {
  	      return input.prevTxId.toString('hex') === txId && input.outputIndex === outputIndex
  	    });
  	  }
  	  if (index < 0 || index >= this.inputs.length) {
  	    throw new errors.Transaction.InvalidIndex(index, this.inputs.length)
  	  }
  	  var input = this.inputs[index];
  	  this.inputs = _.without(this.inputs, input);
  	  this._inputAmount = undefined;
  	  this._updateChangeOutput();
  	};

  	/* Signature handling */

  	/**
  	 * Sign the transaction using one or more private keys.
  	 *
  	 * It tries to sign each input, verifying that the signature will be valid
  	 * (matches a public key).
  	 *
  	 * @param {Array|String|PrivateKey} privateKey
  	 * @param {number} sigtype
  	 * @return {Transaction} this, for chaining
  	 */
  	Transaction.prototype.sign = function (privateKey, sigtype) {
  	  $.checkState(this.hasAllUtxoInfo(), 'Not all utxo information is available to sign the transaction.');
  	  var self = this;
  	  if (_.isArray(privateKey)) {
  	    _.each(privateKey, function (privateKey) {
  	      self.sign(privateKey, sigtype);
  	    });
  	    return this
  	  }
  	  _.each(this.getSignatures(privateKey, sigtype), function (signature) {
  	    self.applySignature(signature);
  	  });

  	  this._privateKey = privateKey;
  	  this._sigType = sigtype;
  	  return this
  	};

  	Transaction.prototype.getSignatures = function (privKey, sigtype) {
  	  privKey = new PrivateKey(privKey);
  	  // By default, signs using ALL|FORKID
  	  sigtype = sigtype || (Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID);
  	  var transaction = this;
  	  var results = [];
  	  var hashData = Hash.sha256ripemd160(privKey.publicKey.toBuffer());
  	  _.each(this.inputs, function forEachInput (input, index) {
  	    _.each(input.getSignatures(transaction, privKey, index, sigtype, hashData), function (signature) {
  	      results.push(signature);
  	    });
  	  });
  	  return results
  	};

  	/**
  	 * Add a signature to the transaction
  	 *
  	 * @param {Object} signature
  	 * @param {number} signature.inputIndex
  	 * @param {number} signature.sigtype
  	 * @param {PublicKey} signature.publicKey
  	 * @param {Signature} signature.signature
  	 * @return {Transaction} this, for chaining
  	 */
  	Transaction.prototype.applySignature = function (signature) {
  	  this.inputs[signature.inputIndex].addSignature(this, signature);
  	  return this
  	};

  	Transaction.prototype.isFullySigned = function () {
  	  _.each(this.inputs, function (input) {
  	    if (input.isFullySigned === Input.prototype.isFullySigned) {
  	      throw new errors.Transaction.UnableToVerifySignature(
  	        'Unrecognized script kind, or not enough information to execute script.' +
  	        'This usually happens when creating a transaction from a serialized transaction'
  	      )
  	    }
  	  });
  	  return _.every(_.map(this.inputs, function (input) {
  	    return input.isFullySigned()
  	  }))
  	};

  	Transaction.prototype.isValidSignature = function (signature) {
  	  var self = this;
  	  if (this.inputs[signature.inputIndex].isValidSignature === Input.prototype.isValidSignature) {
  	    throw new errors.Transaction.UnableToVerifySignature(
  	      'Unrecognized script kind, or not enough information to execute script.' +
  	      'This usually happens when creating a transaction from a serialized transaction'
  	    )
  	  }
  	  return this.inputs[signature.inputIndex].isValidSignature(self, signature)
  	};

  	/**
  	 * @returns {bool} whether the signature is valid for this transaction input
  	 */
  	Transaction.prototype.verifySignature = function (sig, pubkey, nin, subscript, satoshisBN, flags) {
  	  return Sighash.verify(this, sig, pubkey, nin, subscript, satoshisBN, flags)
  	};

  	/**
  	 * Check that a transaction passes basic sanity tests. If not, return a string
  	 * describing the error. This function contains the same logic as
  	 * CheckTransaction in bitcoin core.
  	 */
  	Transaction.prototype.verify = function () {
  	  // Basic checks that don't depend on any context
  	  if (this.inputs.length === 0) {
  	    return 'transaction txins empty'
  	  }

  	  if (this.outputs.length === 0) {
  	    return 'transaction txouts empty'
  	  }

  	  // Check for negative or overflow output values
  	  var valueoutbn = new BN(0);
  	  for (var i = 0; i < this.outputs.length; i++) {
  	    var txout = this.outputs[i];

  	    if (txout.invalidSatoshis()) {
  	      return 'transaction txout ' + i + ' satoshis is invalid'
  	    }
  	    if (txout._satoshisBN.gt(new BN(Transaction.MAX_MONEY, 10))) {
  	      return 'transaction txout ' + i + ' greater than MAX_MONEY'
  	    }
  	    valueoutbn = valueoutbn.add(txout._satoshisBN);
  	    if (valueoutbn.gt(new BN(Transaction.MAX_MONEY))) {
  	      return 'transaction txout ' + i + ' total output greater than MAX_MONEY'
  	    }
  	  }

  	  // Size limits
  	  if (this.toBuffer().length > MAX_BLOCK_SIZE) {
  	    return 'transaction over the maximum block size'
  	  }

  	  // Check for duplicate inputs
  	  var txinmap = {};
  	  for (i = 0; i < this.inputs.length; i++) {
  	    var txin = this.inputs[i];

  	    var inputid = txin.prevTxId + ':' + txin.outputIndex;
  	    if (!_.isUndefined(txinmap[inputid])) {
  	      return 'transaction input ' + i + ' duplicate input'
  	    }
  	    txinmap[inputid] = true;
  	  }

  	  var isCoinbase = this.isCoinbase();
  	  if (isCoinbase) {
  	    var buf = this.inputs[0]._scriptBuffer;
  	    if (buf.length < 2 || buf.length > 100) {
  	      return 'coinbase transaction script size invalid'
  	    }
  	  } else {
  	    for (i = 0; i < this.inputs.length; i++) {
  	      if (this.inputs[i].isNull()) {
  	        return 'transaction input ' + i + ' has null input'
  	      }
  	    }
  	  }
  	  return true
  	};

  	/**
  	 * Analogous to bitcoind's IsCoinBase function in transaction.h
  	 */
  	Transaction.prototype.isCoinbase = function () {
  	  return (this.inputs.length === 1 && this.inputs[0].isNull())
  	};

  	/**
  	 *
  	 * @param {number} inputIndex
  	 * @param {Script|(tx, output) => Script} unlockScriptOrCallback  unlockScript or a callback returns unlockScript
  	 * @returns unlockScript of the special input
  	 */
  	Transaction.prototype.setInputScript = function (inputIndex, unlockScriptOrCallback) {
  	  if (unlockScriptOrCallback instanceof Function) {
  	    this.unlockScriptCallbackMap.set(inputIndex, unlockScriptOrCallback);
  	    this.inputs[inputIndex].setScript(unlockScriptOrCallback(this, this.inputs[inputIndex].output));
  	  } else {
  	    this.inputs[inputIndex].setScript(unlockScriptOrCallback);
  	  }

  	  this._updateChangeOutput();
  	  return this
  	};

  	Transaction.prototype.setInputSequence = function (inputIndex, sequence) {
  	  this.inputs[inputIndex].sequenceNumber = sequence;
  	  return this
  	};

  	/**
  	 *
  	 * @param {number} outputIndex
  	 * @param {Output|(tx) => Output} outputOrcb  output or a callback returns output
  	 * @returns output
  	 */
  	Transaction.prototype.setOutput = function (outputIndex, outputOrcb) {
  	  if (outputOrcb instanceof Function) {
  	    this.outputCallbackMap.set(outputIndex, outputOrcb);
  	    this.outputs[outputIndex] = outputOrcb(this);
  	  } else {
  	    this.outputs[outputIndex] = outputOrcb;
  	  }

  	  this._updateChangeOutput();
  	  return this
  	};

  	/**
  	 * Seal a transaction. After the transaction is sealed, except for the unlock script entered,
  	 * other attributes of the transaction cannot be modified
  	 */
  	Transaction.prototype.seal = function () {
  	  const self = this;

  	  this.outputCallbackMap.forEach(function (outputCallback, key) {
  	    self.outputs[key] = outputCallback(self);
  	  });

  	  this.unlockScriptCallbackMap.forEach(function (unlockScriptCallback, key) {
  	    self.inputs[key].setScript(unlockScriptCallback(self, self.inputs[key].output));
  	  });

  	  if (this._privateKey) {
  	    this.sign(this._privateKey, this._sigType);
  	  }

  	  this.isSeal = true;

  	  return this
  	};

  	Transaction.prototype.setLockTime = function (nLockTime) {
  	  this.nLockTime = nLockTime;
  	  return this
  	};

  	/**
  	 *
  	 * @returns satoshis of change output
  	 */
  	Transaction.prototype.getChangeAmount = function () {
  	  if (_.isUndefined(this._changeIndex)) {
  	    return 0
  	  }

  	  return this.outputs[this._changeIndex].satoshis
  	};

  	/**
  	 *
  	 * @returns estimate fee by transaction size
  	 */
  	Transaction.prototype.getEstimateFee = function () {
  	  return this._estimateFee()
  	};

  	/**
  	 *
  	 * @param {number} feePerKb the fee per KB for this transaction
  	 * @returns true or false
  	 */
  	Transaction.prototype.checkFeeRate = function (feePerKb) {
  	  const fee = this._getUnspentValue();

  	  var estimatedSize = this._estimateSize();
  	  var expectedRate = (feePerKb || this._feePerKb || Transaction.FEE_PER_KB) / 1000;
  	  var realFeeRate = fee / estimatedSize;
  	  return realFeeRate >= expectedRate
  	};

  	/**
  	 *
  	 * @returns the serialization of all input outpoints
  	 */
  	Transaction.prototype.prevouts = function () {
  	  var writer = new BufferWriter();

  	  _.each(this.inputs, function (input) {
  	    writer.writeReverse(input.prevTxId);
  	    writer.writeUInt32LE(input.outputIndex);
  	  });

  	  var buf = writer.toBuffer();
  	  return buf.toString('hex')
  	};

  	transaction = Transaction;
  	return transaction;
  }

  var hasRequiredTransaction;

  function requireTransaction () {
  	if (hasRequiredTransaction) return transaction$1.exports;
  	hasRequiredTransaction = 1;
  	(function (module) {
  		module.exports = requireTransaction$1();

  		module.exports.Input = requireInput();
  		module.exports.Output = requireOutput();
  		module.exports.UnspentOutput = requireUnspentoutput();
  		module.exports.Signature = requireSignature();
  		module.exports.Sighash = requireSighash();
  } (transaction$1));
  	return transaction$1.exports;
  }

  var interpreter;
  var hasRequiredInterpreter;

  function requireInterpreter () {
  	if (hasRequiredInterpreter) return interpreter;
  	hasRequiredInterpreter = 1;

  	var _ = __1;

  	var Script = requireScript$1();
  	var Opcode = opcode;
  	var BN = bn$1;
  	var Hash = hash.exports;
  	var Signature = signature$1;
  	var PublicKey = requirePublickey();
  	var Stack = stack;
  	/**
  	 * Bitcoin transactions contain scripts. Each input has a script called the
  	 * scriptSig, and each output has a script called the scriptPubkey. To validate
  	 * an input, the input's script is concatenated with the referenced output script,
  	 * and the result is executed. If at the end of execution the stack contains a
  	 * "true" value, then the transaction is valid.
  	 *
  	 * The primary way to use this class is via the verify function.
  	 * e.g., Interpreter().verify( ... );
  	 */
  	var Interpreter = function Interpreter (obj) {
  	  if (!(this instanceof Interpreter)) {
  	    return new Interpreter(obj)
  	  }
  	  if (obj) {
  	    this.initialize();
  	    this.set(obj);
  	  } else {
  	    this.initialize();
  	  }
  	};

  	/**
  	 * Verifies a Script by executing it and returns true if it is valid.
  	 * This function needs to be provided with the scriptSig and the scriptPubkey
  	 * separately.
  	 * @param {Script} scriptSig - the script's first part (corresponding to the tx input)
  	 * @param {Script} scriptPubkey - the script's last part (corresponding to the tx output)
  	 * @param {Transaction=} tx - the Transaction containing the scriptSig in one input (used
  	 *    to check signature validity for some opcodes like OP_CHECKSIG)
  	 * @param {number} nin - index of the transaction input containing the scriptSig verified.
  	 * @param {number} flags - evaluation flags. See Interpreter.SCRIPT_* constants
  	 * @param {number} satoshisBN - amount in satoshis of the input to be verified (when FORKID signhash is used)
  	 *
  	 * Translated from bitcoind's VerifyScript
  	 */
  	Interpreter.prototype.verify = function (scriptSig, scriptPubkey, tx, nin, flags, satoshisBN, sighashScript) {
  	  var Transaction = requireTransaction();

  	  if (_.isUndefined(tx)) {
  	    tx = new Transaction();
  	  }
  	  if (_.isUndefined(nin)) {
  	    nin = 0;
  	  }
  	  if (_.isUndefined(flags)) {
  	    flags = 0;
  	  }

  	  // If FORKID is enabled, we also ensure strict encoding.
  	  if (flags & Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID) {
  	    flags |= Interpreter.SCRIPT_VERIFY_STRICTENC;

  	    // If FORKID is enabled, we need the input amount.
  	    if (!satoshisBN) {
  	      throw new Error('internal error - need satoshisBN to verify FORKID transactions')
  	    }
  	  }

  	  this.set({
  	    script: scriptSig,
  	    tx: tx,
  	    nin: nin,
  	    flags: flags,
  	    satoshisBN: satoshisBN,
  	    sighashScript: sighashScript
  	  });
  	  var stackCopy;

  	  if ((flags & Interpreter.SCRIPT_VERIFY_SIGPUSHONLY) !== 0 && !scriptSig.isPushOnly()) {
  	    this.errstr = 'SCRIPT_ERR_SIG_PUSHONLY';
  	    return false
  	  }

  	  // evaluate scriptSig
  	  if (!this.evaluate('scriptSig')) {
  	    return false
  	  }

  	  if (flags & Interpreter.SCRIPT_VERIFY_P2SH) {
  	    stackCopy = this.stack.copy();
  	  }

  	  var stack = this.stack;
  	  this.initialize();
  	  this.set({
  	    script: scriptPubkey,
  	    stack: stack,
  	    tx: tx,
  	    nin: nin,
  	    flags: flags,
  	    satoshisBN: satoshisBN,
  	    sighashScript: sighashScript
  	  });

  	  // evaluate scriptPubkey
  	  if (!this.evaluate('scriptPubkey')) {
  	    return false
  	  }

  	  if (this.stack.length === 0) {
  	    this.errstr = 'SCRIPT_ERR_EVAL_FALSE_NO_RESULT';
  	    return false
  	  }

  	  var buf = this.stack.stacktop(-1);
  	  if (!Interpreter.castToBool(buf)) {
  	    this.errstr = 'SCRIPT_ERR_EVAL_FALSE_IN_STACK';
  	    return false
  	  }

  	  // Additional validation for spend-to-script-hash transactions:
  	  if ((flags & Interpreter.SCRIPT_VERIFY_P2SH) && scriptPubkey.isScriptHashOut()) {
  	    // scriptSig must be literals-only or validation fails
  	    if (!scriptSig.isPushOnly()) {
  	      this.errstr = 'SCRIPT_ERR_SIG_PUSHONLY';
  	      return false
  	    }

  	    // stackCopy cannot be empty here, because if it was the
  	    // P2SH  HASH <> EQUAL  scriptPubKey would be evaluated with
  	    // an empty stack and the EvalScript above would return false.
  	    if (stackCopy.length === 0) {
  	      throw new Error('internal error - stack copy empty')
  	    }

  	    var redeemScriptSerialized = stackCopy.stacktop(-1);
  	    var redeemScript = Script.fromBuffer(redeemScriptSerialized);
  	    stackCopy.pop();

  	    this.initialize();
  	    this.set({
  	      script: redeemScript,
  	      stack: stackCopy,
  	      tx: tx,
  	      nin: nin,
  	      flags: flags,
  	      satoshisBN: satoshisBN
  	    });

  	    // evaluate redeemScript
  	    if (!this.evaluate()) {
  	      return false
  	    }

  	    if (stackCopy.length === 0) {
  	      this.errstr = 'SCRIPT_ERR_EVAL_FALSE_NO_P2SH_STACK';
  	      return false
  	    }

  	    if (!Interpreter.castToBool(stackCopy.stacktop(-1))) {
  	      this.errstr = 'SCRIPT_ERR_EVAL_FALSE_IN_P2SH_STACK';
  	      return false
  	    }
  	  }

  	  // The CLEANSTACK check is only performed after potential P2SH evaluation,
  	  // as the non-P2SH evaluation of a P2SH script will obviously not result in
  	  // a clean stack (the P2SH inputs remain). The same holds for witness
  	  // evaluation.
  	  if ((flags & Interpreter.SCRIPT_VERIFY_CLEANSTACK) !== 0) {
  	    // Disallow CLEANSTACK without P2SH, as otherwise a switch
  	    // CLEANSTACK->P2SH+CLEANSTACK would be possible, which is not a
  	    // softfork (and P2SH should be one).
  	    // if ((flags & Interpreter.SCRIPT_VERIFY_P2SH) === 0) {
  	    //   throw new Error('internal error - CLEANSTACK without P2SH')
  	    // }

  	    if (this.stack.length !== 1) {
  	      this.errstr = 'SCRIPT_ERR_CLEANSTACK';
  	      return false
  	    }
  	  }

  	  return true
  	};

  	interpreter = Interpreter;

  	Interpreter.prototype.initialize = function (obj) {
  	  this.stack = new Stack([]);
  	  this.altstack = new Stack([]);
  	  this.pc = 0;
  	  this.pbegincodehash = 0;
  	  this.nOpCount = 0;
  	  this.vfExec = [];
  	  this.errstr = '';
  	  this.flags = 0;
  	  // if OP_RETURN is found in executed branches after genesis is activated,
  	  // we still have to check if the rest of the script is valid
  	  this.nonTopLevelReturnAfterGenesis = false;
  	};

  	Interpreter.prototype.set = function (obj) {
  	  this.script = obj.script || this.script;
  	  this.tx = obj.tx || this.tx;
  	  this.nin = typeof obj.nin !== 'undefined' ? obj.nin : this.nin;
  	  this.satoshisBN = obj.satoshisBN || this.satoshisBN;
  	  this.stack = obj.stack || this.stack;
  	  this.altstack = obj.altstack || this.altstack;
  	  this.pc = typeof obj.pc !== 'undefined' ? obj.pc : this.pc;
  	  this.pbegincodehash = typeof obj.pbegincodehash !== 'undefined' ? obj.pbegincodehash : this.pbegincodehash;
  	  this.nOpCount = typeof obj.nOpCount !== 'undefined' ? obj.nOpCount : this.nOpCount;
  	  this.vfExec = obj.vfExec || this.vfExec;
  	  this.errstr = obj.errstr || this.errstr;
  	  this.flags = typeof obj.flags !== 'undefined' ? obj.flags : this.flags;
  	  this.sighashScript = obj.sighashScript || this.sighashScript;
  	};

  	Interpreter.prototype.subscript = function () {
  	  if (this.sighashScript) {
  	    return new Script().set({
  	      chunks: this.sighashScript.chunks
  	    })
  	  } else {
  	    // Subset of script starting at the most recent codeseparator
  	    // CScript scriptCode(pbegincodehash, pend);
  	    return new Script().set({
  	      chunks: this.script.chunks.slice(this.pbegincodehash)
  	    })
  	  }
  	};

  	Interpreter.getTrue = () => Buffer$1.from([1]);
  	Interpreter.getFalse = () => Buffer$1.from([]);

  	Interpreter.MAX_SCRIPT_ELEMENT_SIZE = 520;
  	Interpreter.MAXIMUM_ELEMENT_SIZE = 4;

  	Interpreter.LOCKTIME_THRESHOLD = 500000000;
  	Interpreter.LOCKTIME_THRESHOLD_BN = new BN(Interpreter.LOCKTIME_THRESHOLD);

  	// flags taken from bitcoind
  	// bitcoind commit: b5d1b1092998bc95313856d535c632ea5a8f9104
  	Interpreter.SCRIPT_VERIFY_NONE = 0;

  	// Evaluate P2SH subscripts (softfork safe, BIP16).
  	Interpreter.SCRIPT_VERIFY_P2SH = (1 << 0);

  	// Passing a non-strict-DER signature or one with undefined hashtype to a checksig operation causes script failure.
  	// Passing a pubkey that is not (0x04 + 64 bytes) or (0x02 or 0x03 + 32 bytes) to checksig causes that pubkey to be
  	// skipped (not softfork safe: this flag can widen the validity of OP_CHECKSIG OP_NOT).
  	Interpreter.SCRIPT_VERIFY_STRICTENC = (1 << 1);

  	// Passing a non-strict-DER signature to a checksig operation causes script failure (softfork safe, BIP62 rule 1)
  	Interpreter.SCRIPT_VERIFY_DERSIG = (1 << 2);

  	// Passing a non-strict-DER signature or one with S > order/2 to a checksig operation causes script failure
  	// (softfork safe, BIP62 rule 5).
  	Interpreter.SCRIPT_VERIFY_LOW_S = (1 << 3);

  	// verify dummy stack item consumed by CHECKMULTISIG is of zero-length (softfork safe, BIP62 rule 7).
  	Interpreter.SCRIPT_VERIFY_NULLDUMMY = (1 << 4);

  	// Using a non-push operator in the scriptSig causes script failure (softfork safe, BIP62 rule 2).
  	Interpreter.SCRIPT_VERIFY_SIGPUSHONLY = (1 << 5);

  	// Require minimal encodings for all push operations (OP_0... OP_16, OP_1NEGATE where possible, direct
  	// pushes up to 75 bytes, OP_PUSHDATA up to 255 bytes, OP_PUSHDATA2 for anything larger). Evaluating
  	// any other push causes the script to fail (BIP62 rule 3).
  	// In addition, whenever a stack element is interpreted as a number, it must be of minimal length (BIP62 rule 4).
  	// (softfork safe)
  	Interpreter.SCRIPT_VERIFY_MINIMALDATA = (1 << 6);

  	// Discourage use of NOPs reserved for upgrades (NOP1-10)
  	//
  	// Provided so that nodes can avoid accepting or mining transactions
  	// containing executed NOP's whose meaning may change after a soft-fork,
  	// thus rendering the script invalid; with this flag set executing
  	// discouraged NOPs fails the script. This verification flag will never be
  	// a mandatory flag applied to scripts in a block. NOPs that are not
  	// executed, e.g.  within an unexecuted IF ENDIF block, are *not* rejected.
  	Interpreter.SCRIPT_VERIFY_DISCOURAGE_UPGRADABLE_NOPS = (1 << 7);

  	// Require that only a single stack element remains after evaluation. This
  	// changes the success criterion from "At least one stack element must
  	// remain, and when interpreted as a boolean, it must be true" to "Exactly
  	// one stack element must remain, and when interpreted as a boolean, it must
  	// be true".
  	// (softfork safe, BIP62 rule 6)
  	// Note: CLEANSTACK should never be used without P2SH or WITNESS.
  	Interpreter.SCRIPT_VERIFY_CLEANSTACK = (1 << 8);

  	// CLTV See BIP65 for details.
  	Interpreter.SCRIPT_VERIFY_CHECKLOCKTIMEVERIFY = (1 << 9);

  	// support CHECKSEQUENCEVERIFY opcode
  	//
  	// See BIP112 for details
  	Interpreter.SCRIPT_VERIFY_CHECKSEQUENCEVERIFY = (1 << 10);

  	// Segwit script only: Require the argument of OP_IF/NOTIF to be exactly
  	// 0x01 or empty vector
  	//
  	Interpreter.SCRIPT_VERIFY_MINIMALIF = (1 << 13);

  	// Signature(s) must be empty vector if an CHECK(MULTI)SIG operation failed
  	//
  	Interpreter.SCRIPT_VERIFY_NULLFAIL = (1 << 14);

  	// Public keys in scripts must be compressed
  	Interpreter.SCRIPT_VERIFY_COMPRESSED_PUBKEYTYPE = (1 << 15);

  	// Do we accept signature using SIGHASH_FORKID
  	//
  	Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID = (1 << 16);

  	// Do we accept activate replay protection using a different fork id.
  	//
  	Interpreter.SCRIPT_ENABLE_REPLAY_PROTECTION = (1 << 17);

  	// Enable new opcodes.
  	//
  	Interpreter.SCRIPT_ENABLE_MONOLITH_OPCODES = (1 << 18);

  	// Are the Magnetic upgrade opcodes enabled?
  	//
  	Interpreter.SCRIPT_ENABLE_MAGNETIC_OPCODES = (1 << 19);

  	/* Below flags apply in the context of BIP 68 */
  	/**
  	 * If this flag set, CTxIn::nSequence is NOT interpreted as a relative
  	 * lock-time.
  	 */
  	Interpreter.SEQUENCE_LOCKTIME_DISABLE_FLAG = (1 << 31);

  	/**
  	 * If CTxIn::nSequence encodes a relative lock-time and this flag is set,
  	 * the relative lock-time has units of 512 seconds, otherwise it specifies
  	 * blocks with a granularity of 1.
  	 */
  	Interpreter.SEQUENCE_LOCKTIME_TYPE_FLAG = (1 << 22);

  	/**
  	 * If CTxIn::nSequence encodes a relative lock-time, this mask is applied to
  	 * extract that lock-time from the sequence field.
  	 */
  	Interpreter.SEQUENCE_LOCKTIME_MASK = 0x0000ffff;

  	Interpreter.MAX_SCRIPT_SIZE = Number.MAX_SAFE_INTEGER;

  	Interpreter.MAX_OPCODE_COUNT = Number.MAX_SAFE_INTEGER;

  	Interpreter.castToBool = function (buf) {
  	  for (var i = 0; i < buf.length; i++) {
  	    if (buf[i] !== 0) {
  	      // can be negative zero
  	      if (i === buf.length - 1 && buf[i] === 0x80) {
  	        return false
  	      }
  	      return true
  	    }
  	  }
  	  return false
  	};

  	/**
  	 * Translated from bitcoind's CheckSignatureEncoding
  	 */
  	Interpreter.prototype.checkSignatureEncoding = function (buf) {
  	  var sig;

  	  // Empty signature. Not strictly DER encoded, but allowed to provide a
  	  // compact way to provide an invalid signature for use with CHECK(MULTI)SIG
  	  if (buf.length === 0) {
  	    return true
  	  }

  	  if ((this.flags & (Interpreter.SCRIPT_VERIFY_DERSIG | Interpreter.SCRIPT_VERIFY_LOW_S | Interpreter.SCRIPT_VERIFY_STRICTENC)) !== 0 && !Signature.isTxDER(buf)) {
  	    this.errstr = 'SCRIPT_ERR_SIG_DER_INVALID_FORMAT';
  	    return false
  	  } else if ((this.flags & Interpreter.SCRIPT_VERIFY_LOW_S) !== 0) {
  	    sig = Signature.fromTxFormat(buf);
  	    if (!sig.hasLowS()) {
  	      this.errstr = 'SCRIPT_ERR_SIG_DER_HIGH_S';
  	      return false
  	    }
  	  } else if ((this.flags & Interpreter.SCRIPT_VERIFY_STRICTENC) !== 0) {
  	    sig = Signature.fromTxFormat(buf);
  	    if (!sig.hasDefinedHashtype()) {
  	      this.errstr = 'SCRIPT_ERR_SIG_HASHTYPE';
  	      return false
  	    }

  	    if (!(this.flags & Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID) &&
  	      (sig.nhashtype & Signature.SIGHASH_FORKID)) {
  	      this.errstr = 'SCRIPT_ERR_ILLEGAL_FORKID';
  	      return false
  	    }

  	    if ((this.flags & Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID) &&
  	      !(sig.nhashtype & Signature.SIGHASH_FORKID)) {
  	      this.errstr = 'SCRIPT_ERR_MUST_USE_FORKID';
  	      return false
  	    }
  	  }

  	  return true
  	};

  	/**
  	 * Translated from bitcoind's CheckPubKeyEncoding
  	 */
  	Interpreter.prototype.checkPubkeyEncoding = function (buf) {
  	  if ((this.flags & Interpreter.SCRIPT_VERIFY_STRICTENC) !== 0 && !PublicKey.isValid(buf)) {
  	    this.errstr = 'SCRIPT_ERR_PUBKEYTYPE';
  	    return false
  	  }
  	  return true
  	};

  	/**
  	  *
  	  * Check the buffer is minimally encoded (see https://github.com/bitcoincashorg/spec/blob/master/may-2018-reenabled-opcodes.md#op_bin2num)
  	  *
  	  *
  	  */

  	Interpreter._isMinimallyEncoded = function (buf, nMaxNumSize) {
  	  nMaxNumSize = nMaxNumSize || Interpreter.MAXIMUM_ELEMENT_SIZE;
  	  if (buf.length > nMaxNumSize) {
  	    return false
  	  }

  	  if (buf.length > 0) {
  	    // Check that the number is encoded with the minimum possible number
  	    // of bytes.
  	    //
  	    // If the most-significant-byte - excluding the sign bit - is zero
  	    // then we're not minimal. Note how this test also rejects the
  	    // negative-zero encoding, 0x80.
  	    if ((buf[buf.length - 1] & 0x7f) === 0) {
  	      // One exception: if there's more than one byte and the most
  	      // significant bit of the second-most-significant-byte is set it
  	      // would conflict with the sign bit. An example of this case is
  	      // +-255, which encode to 0xff00 and 0xff80 respectively.
  	      // (big-endian).
  	      if (buf.length <= 1 || (buf[buf.length - 2] & 0x80) === 0) {
  	        return false
  	      }
  	    }
  	  }
  	  return true
  	};

  	/**
  	  *
  	  * minimally encode the buffer content
  	  *
  	  * @param {number} nMaxNumSize (max allowed size)
  	  */
  	Interpreter._minimallyEncode = function (buf) {
  	  if (buf.length === 0) {
  	    return buf
  	  }

  	  // If the last byte is not 0x00 or 0x80, we are minimally encoded.
  	  var last = buf[buf.length - 1];
  	  if (last & 0x7f) {
  	    return buf
  	  }

  	  // If the script is one byte long, then we have a zero, which encodes as an
  	  // empty array.
  	  if (buf.length === 1) {
  	    return Buffer$1.from('')
  	  }

  	  // If the next byte has it sign bit set, then we are minimaly encoded.
  	  if (buf[buf.length - 2] & 0x80) {
  	    return buf
  	  }

  	  // We are not minimally encoded, we need to figure out how much to trim.
  	  for (var i = buf.length - 1; i > 0; i--) {
  	    // We found a non zero byte, time to encode.
  	    if (buf[i - 1] !== 0) {
  	      if (buf[i - 1] & 0x80) {
  	        // We found a byte with it sign bit set so we need one more
  	        // byte.
  	        buf[i++] = last;
  	      } else {
  	        // the sign bit is clear, we can use it.
  	        buf[i - 1] |= last;
  	      }

  	      return buf.slice(0, i)
  	    }
  	  }

  	  // If we found the whole thing is zeros, then we have a zero.
  	  return Buffer$1.from('')
  	};

  	/**
  	 * Based on bitcoind's EvalScript function, with the inner loop moved to
  	 * Interpreter.prototype.step()
  	 * bitcoind commit: b5d1b1092998bc95313856d535c632ea5a8f9104
  	 */
  	Interpreter.prototype.evaluate = function (scriptType) {
  	  // TODO: script size should be configurable. no magic numbers
  	  if (this.script.toBuffer().length > Interpreter.MAX_SCRIPT_SIZE) {
  	    this.errstr = 'SCRIPT_ERR_SCRIPT_SIZE';
  	    return false
  	  }

  	  try {
  	    while (this.pc < this.script.chunks.length) {
  	      // fExec: if the opcode will be executed, i.e., not in a false branch
  	      let thisStep = { pc: this.pc, fExec: (this.vfExec.indexOf(false) === -1), opcode: Opcode.fromNumber(this.script.chunks[this.pc].opcodenum) };

  	      var fSuccess = this.step(scriptType);

  	      this._callbackStep(thisStep);

  	      if (!fSuccess) {
  	        return false
  	      }
  	    }

  	    // Size limits
  	    if (this.stack.length + this.altstack.length > 1000) {
  	      this.errstr = 'SCRIPT_ERR_STACK_SIZE';
  	      return false
  	    }
  	  } catch (e) {
  	    this.errstr = 'SCRIPT_ERR_UNKNOWN_ERROR: ' + e;
  	    return false
  	  }

  	  if (this.vfExec.length > 0) {
  	    this.errstr = 'SCRIPT_ERR_UNBALANCED_CONDITIONAL';
  	    return false
  	  }

  	  return true
  	};

  	Interpreter.prototype._callbackStep = function (thisStep) {
  	  if (typeof this.stepListener === 'function') {
  	    try {
  	      this.stepListener(thisStep);
  	    } catch (err) {
  	      console.log(`Error in Step callback:${err}`);
  	    }
  	  }
  	};

  	/**
  	 * call to update stackvar
  	 * @param {*} stack
  	 */
  	Interpreter.prototype._callbackStack = function (stack, pc, scriptType) {
  	  if (typeof this.stackListener === 'function') {
  	    try {
  	      this.stackListener(stack, pc, scriptType);
  	    } catch (err) {
  	      var chunk = this.script.chunks[pc];
  	      console.error(`Error: ${err} in _updateStack pc: ${pc}, opcode ${Opcode.fromNumber(chunk.opcodenum).toSafeString()}`);
  	    }
  	  }
  	};

  	/**
  	 * Checks a locktime parameter with the transaction's locktime.
  	 * There are two times of nLockTime: lock-by-blockheight and lock-by-blocktime,
  	 * distinguished by whether nLockTime < LOCKTIME_THRESHOLD = 500000000
  	 *
  	 * See the corresponding code on bitcoin core:
  	 * https://github.com/bitcoin/bitcoin/blob/ffd75adce01a78b3461b3ff05bcc2b530a9ce994/src/script/interpreter.cpp#L1129
  	 *
  	 * @param {BN} nLockTime the locktime read from the script
  	 * @return {boolean} true if the transaction's locktime is less than or equal to
  	 *                   the transaction's locktime
  	 */
  	Interpreter.prototype.checkLockTime = function (nLockTime) {
  	  // We want to compare apples to apples, so fail the script
  	  // unless the type of nLockTime being tested is the same as
  	  // the nLockTime in the transaction.
  	  if (!(
  	    (this.tx.nLockTime < Interpreter.LOCKTIME_THRESHOLD && nLockTime.lt(Interpreter.LOCKTIME_THRESHOLD_BN)) ||
  	    (this.tx.nLockTime >= Interpreter.LOCKTIME_THRESHOLD && nLockTime.gte(Interpreter.LOCKTIME_THRESHOLD_BN))
  	  )) {
  	    return false
  	  }

  	  // Now that we know we're comparing apples-to-apples, the
  	  // comparison is a simple numeric one.
  	  if (nLockTime.gt(new BN(this.tx.nLockTime))) {
  	    return false
  	  }

  	  // Finally the nLockTime feature can be disabled and thus
  	  // CHECKLOCKTIMEVERIFY bypassed if every txin has been
  	  // finalized by setting nSequence to maxint. The
  	  // transaction would be allowed into the blockchain, making
  	  // the opcode ineffective.
  	  //
  	  // Testing if this vin is not final is sufficient to
  	  // prevent this condition. Alternatively we could test all
  	  // inputs, but testing just this input minimizes the data
  	  // required to prove correct CHECKLOCKTIMEVERIFY execution.
  	  if (this.tx.inputs[this.nin].isFinal()) {
  	    return false
  	  }

  	  return true
  	};

  	/**
  	 * Checks a sequence parameter with the transaction's sequence.
  	 * @param {BN} nSequence the sequence read from the script
  	 * @return {boolean} true if the transaction's sequence is less than or equal to
  	 *                   the transaction's sequence
  	 */
  	Interpreter.prototype.checkSequence = function (nSequence) {
  	  // Relative lock times are supported by comparing the passed in operand to
  	  // the sequence number of the input.
  	  var txToSequence = this.tx.inputs[this.nin].sequenceNumber;

  	  // Fail if the transaction's version number is not set high enough to
  	  // trigger BIP 68 rules.
  	  if (this.tx.version < 2) {
  	    return false
  	  }

  	  // Sequence numbers with their most significant bit set are not consensus
  	  // constrained. Testing that the transaction's sequence number do not have
  	  // this bit set prevents using this property to get around a
  	  // CHECKSEQUENCEVERIFY check.
  	  if (txToSequence & Interpreter.SEQUENCE_LOCKTIME_DISABLE_FLAG) {
  	    return false
  	  }

  	  // Mask off any bits that do not have consensus-enforced meaning before
  	  // doing the integer comparisons
  	  var nLockTimeMask =
  	    Interpreter.SEQUENCE_LOCKTIME_TYPE_FLAG | Interpreter.SEQUENCE_LOCKTIME_MASK;
  	  var txToSequenceMasked = new BN(txToSequence & nLockTimeMask);
  	  var nSequenceMasked = nSequence.and(nLockTimeMask);

  	  // There are two kinds of nSequence: lock-by-blockheight and
  	  // lock-by-blocktime, distinguished by whether nSequenceMasked <
  	  // CTxIn::SEQUENCE_LOCKTIME_TYPE_FLAG.
  	  //
  	  // We want to compare apples to apples, so fail the script unless the type
  	  // of nSequenceMasked being tested is the same as the nSequenceMasked in the
  	  // transaction.
  	  var SEQUENCE_LOCKTIME_TYPE_FLAG_BN = new BN(Interpreter.SEQUENCE_LOCKTIME_TYPE_FLAG);

  	  if (!((txToSequenceMasked.lt(SEQUENCE_LOCKTIME_TYPE_FLAG_BN) &&
  	    nSequenceMasked.lt(SEQUENCE_LOCKTIME_TYPE_FLAG_BN)) ||
  	    (txToSequenceMasked.gte(SEQUENCE_LOCKTIME_TYPE_FLAG_BN) &&
  	      nSequenceMasked.gte(SEQUENCE_LOCKTIME_TYPE_FLAG_BN)))) {
  	    return false
  	  }

  	  // Now that we know we're comparing apples-to-apples, the comparison is a
  	  // simple numeric one.
  	  if (nSequenceMasked.gt(txToSequenceMasked)) {
  	    return false
  	  }
  	  return true
  	};

  	function padBufferToSize (buf, len) {
  	  let b = buf;
  	  while (b.length < len) {
  	    b = Buffer$1.concat([Buffer$1.from([0x00]), b]);
  	  }
  	  return b
  	}

  	/**
  	 * Based on the inner loop of bitcoind's EvalScript function
  	 * bitcoind commit: b5d1b1092998bc95313856d535c632ea5a8f9104
  	 */
  	Interpreter.prototype.step = function (scriptType) {
  	  var self = this;

  	  function stacktop (i) {
  	    return self.stack.stacktop(i)
  	  }

  	  function vartop (i) {
  	    return self.stack.vartop(i)
  	  }

  	  function isOpcodeDisabled (opcode) {
  	    switch (opcode) {
  	      case Opcode.OP_2MUL:
  	      case Opcode.OP_2DIV:

  	        // Disabled opcodes.
  	        return true

  	      case Opcode.OP_INVERT:
  	      case Opcode.OP_MUL:
  	      case Opcode.OP_LSHIFT:
  	      case Opcode.OP_RSHIFT:
  	        // Opcodes that have been reenabled.
  	        if ((self.flags & Interpreter.SCRIPT_ENABLE_MAGNETIC_OPCODES) === 0) {
  	          return true
  	        }
  	        break
  	      case Opcode.OP_DIV:
  	      case Opcode.OP_MOD:
  	      case Opcode.OP_SPLIT:
  	      case Opcode.OP_CAT:
  	      case Opcode.OP_AND:
  	      case Opcode.OP_OR:
  	      case Opcode.OP_XOR:
  	      case Opcode.OP_BIN2NUM:
  	      case Opcode.OP_NUM2BIN:
  	        // Opcodes that have been reenabled.
  	        if ((self.flags & Interpreter.SCRIPT_ENABLE_MONOLITH_OPCODES) === 0) {
  	          return true
  	        }
  	        break
  	    }

  	    return false
  	  }

  	  var fRequireMinimal = (this.flags & Interpreter.SCRIPT_VERIFY_MINIMALDATA) !== 0;

  	  // bool fExec = !count(vfExec.begin(), vfExec.end(), false);

  	  var buf, buf1, buf2, spliced, n, x1, x2, bn, bn1, bn2, bufSig, bufPubkey, subscript;
  	  var sig, pubkey;
  	  var fValue, fSuccess;
  	  var var1, var2, var3;

  	  // Read instruction
  	  var chunk = this.script.chunks[this.pc];
  	  this.pc++;
  	  var opcodenum = chunk.opcodenum;
  	  if (_.isUndefined(opcodenum)) {
  	    this.errstr = 'SCRIPT_ERR_UNDEFINED_OPCODE';
  	    return false
  	  }
  	  if (chunk.buf && chunk.buf.length > Interpreter.MAX_SCRIPT_ELEMENT_SIZE) {
  	    this.errstr = 'SCRIPT_ERR_PUSH_SIZE';
  	    return false
  	  }

  	  // Do not execute instructions if Genesis OP_RETURN was found in executed branches.
  	  var fExec = (this.vfExec.indexOf(false) === -1) && (!this.nonTopLevelReturnAfterGenesis || opcodenum === Opcode.OP_RETURN);

  	  // Note how Opcode.OP_RESERVED does not count towards the opcode limit.
  	  if (opcodenum > Opcode.OP_16 && ++(this.nOpCount) > Interpreter.MAX_OPCODE_COUNT) {
  	    this.errstr = 'SCRIPT_ERR_OP_COUNT';
  	    return false
  	  }

  	  if (isOpcodeDisabled(opcodenum)) {
  	    this.errstr = 'SCRIPT_ERR_DISABLED_OPCODE';
  	    return false
  	  }

  	  if (fExec && opcodenum >= 0 && opcodenum <= Opcode.OP_PUSHDATA4) {
  	    if (fRequireMinimal && !this.script.checkMinimalPush(this.pc - 1)) {
  	      this.errstr = 'SCRIPT_ERR_MINIMALDATA';
  	      return false
  	    }
  	    if (!chunk.buf) {
  	      this.stack.push(Interpreter.getFalse());
  	    } else if (chunk.len !== chunk.buf.length) {
  	      throw new Error(`Length of push value not equal to length of data (${chunk.len},${chunk.buf.length})`)
  	    } else {
  	      this.stack.push(chunk.buf);
  	    }
  	  } else if (fExec || (Opcode.OP_IF <= opcodenum && opcodenum <= Opcode.OP_ENDIF)) {
  	    switch (opcodenum) {
  	      // Push value
  	      case Opcode.OP_1NEGATE:
  	      case Opcode.OP_1:
  	      case Opcode.OP_2:
  	      case Opcode.OP_3:
  	      case Opcode.OP_4:
  	      case Opcode.OP_5:
  	      case Opcode.OP_6:
  	      case Opcode.OP_7:
  	      case Opcode.OP_8:
  	      case Opcode.OP_9:
  	      case Opcode.OP_10:
  	      case Opcode.OP_11:
  	      case Opcode.OP_12:
  	      case Opcode.OP_13:
  	      case Opcode.OP_14:
  	      case Opcode.OP_15:
  	      case Opcode.OP_16:
  	        // ( -- value)
  	        // ScriptNum bn((int)opcode - (int)(Opcode.OP_1 - 1));
  	        n = opcodenum - (Opcode.OP_1 - 1);
  	        buf = new BN(n).toScriptNumBuffer();
  	        this.stack.push(buf);
  	        // The result of these opcodes should always be the minimal way to push the data
  	        // they push, so no need for a CheckMinimalPush here.
  	        break

  	      //
  	      // Control
  	      //
  	      case Opcode.OP_NOP:
  	        break

  	      case Opcode.OP_NOP2:
  	      case Opcode.OP_CHECKLOCKTIMEVERIFY:

  	        if (!(this.flags & Interpreter.SCRIPT_VERIFY_CHECKLOCKTIMEVERIFY)) {
  	          // not enabled; treat as a NOP2
  	          if (this.flags & Interpreter.SCRIPT_VERIFY_DISCOURAGE_UPGRADABLE_NOPS) {
  	            this.errstr = 'SCRIPT_ERR_DISCOURAGE_UPGRADABLE_NOPS';
  	            return false
  	          }
  	          break
  	        }

  	        if (this.stack.length < 1) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }

  	        // Note that elsewhere numeric opcodes are limited to
  	        // operands in the range -2**31+1 to 2**31-1, however it is
  	        // legal for opcodes to produce results exceeding that
  	        // range. This limitation is implemented by CScriptNum's
  	        // default 4-byte limit.
  	        //
  	        // If we kept to that limit we'd have a year 2038 problem,
  	        // even though the nLockTime field in transactions
  	        // themselves is uint32 which only becomes meaningless
  	        // after the year 2106.
  	        //
  	        // Thus as a special case we tell CScriptNum to accept up
  	        // to 5-byte bignums, which are good until 2**39-1, well
  	        // beyond the 2**32-1 limit of the nLockTime field itself.
  	        var nLockTime = BN.fromScriptNumBuffer(this.stack.stacktop(-1), fRequireMinimal, 5);

  	        // In the rare event that the argument may be < 0 due to
  	        // some arithmetic being done first, you can always use
  	        // 0 MAX CHECKLOCKTIMEVERIFY.
  	        if (nLockTime.lt(new BN(0))) {
  	          this.errstr = 'SCRIPT_ERR_NEGATIVE_LOCKTIME';
  	          return false
  	        }

  	        // Actually compare the specified lock time with the transaction.
  	        if (!this.checkLockTime(nLockTime)) {
  	          this.errstr = 'SCRIPT_ERR_UNSATISFIED_LOCKTIME';
  	          return false
  	        }
  	        break

  	      case Opcode.OP_NOP3:
  	      case Opcode.OP_CHECKSEQUENCEVERIFY:

  	        if (!(this.flags & Interpreter.SCRIPT_VERIFY_CHECKSEQUENCEVERIFY)) {
  	          // not enabled; treat as a NOP3
  	          if (this.flags & Interpreter.SCRIPT_VERIFY_DISCOURAGE_UPGRADABLE_NOPS) {
  	            this.errstr = 'SCRIPT_ERR_DISCOURAGE_UPGRADABLE_NOPS';
  	            return false
  	          }
  	          break
  	        }

  	        if (this.stack.length < 1) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }

  	        // nSequence, like nLockTime, is a 32-bit unsigned
  	        // integer field. See the comment in CHECKLOCKTIMEVERIFY
  	        // regarding 5-byte numeric operands.

  	        var nSequence = BN.fromScriptNumBuffer(stacktop(-1), fRequireMinimal, 5);

  	        // In the rare event that the argument may be < 0 due to
  	        // some arithmetic being done first, you can always use
  	        // 0 MAX CHECKSEQUENCEVERIFY.
  	        if (nSequence.lt(new BN(0))) {
  	          this.errstr = 'SCRIPT_ERR_NEGATIVE_LOCKTIME';
  	          return false
  	        }

  	        // To provide for future soft-fork extensibility, if the
  	        // operand has the disabled lock-time flag set,
  	        // CHECKSEQUENCEVERIFY behaves as a NOP.
  	        if ((nSequence &
  	          Interpreter.SEQUENCE_LOCKTIME_DISABLE_FLAG) !== 0) {
  	          break
  	        }

  	        // Actually compare the specified lock time with the transaction.
  	        if (!this.checkSequence(nSequence)) {
  	          this.errstr = 'SCRIPT_ERR_UNSATISFIED_LOCKTIME';
  	          return false
  	        }
  	        break

  	      case Opcode.OP_NOP1:
  	      case Opcode.OP_NOP4:
  	      case Opcode.OP_NOP5:
  	      case Opcode.OP_NOP6:
  	      case Opcode.OP_NOP7:
  	      case Opcode.OP_NOP8:
  	      case Opcode.OP_NOP9:
  	      case Opcode.OP_NOP10:
  	        if (this.flags & Interpreter.SCRIPT_VERIFY_DISCOURAGE_UPGRADABLE_NOPS) {
  	          this.errstr = 'SCRIPT_ERR_DISCOURAGE_UPGRADABLE_NOPS';
  	          return false
  	        }
  	        break

  	      case Opcode.OP_IF:
  	      case Opcode.OP_NOTIF:
  	        // <expression> if [statements] [else [statements]] endif
  	        // bool fValue = false;
  	        fValue = false;
  	        if (fExec) {
  	          if (this.stack.length < 1) {
  	            this.errstr = 'SCRIPT_ERR_UNBALANCED_CONDITIONAL';
  	            return false
  	          }
  	          buf = stacktop(-1);

  	          if (this.flags & Interpreter.SCRIPT_VERIFY_MINIMALIF) {
  	            if (buf.length > 1) {
  	              this.errstr = 'SCRIPT_ERR_MINIMALIF';
  	              return false
  	            }
  	            if (buf.length === 1 && buf[0] !== 1) {
  	              this.errstr = 'SCRIPT_ERR_MINIMALIF';
  	              return false
  	            }
  	          }
  	          fValue = Interpreter.castToBool(buf);
  	          if (opcodenum === Opcode.OP_NOTIF) {
  	            fValue = !fValue;
  	          }
  	          this.stack.pop();
  	        }
  	        this.vfExec.push(fValue);
  	        break

  	      case Opcode.OP_ELSE:
  	        if (this.vfExec.length === 0) {
  	          this.errstr = 'SCRIPT_ERR_UNBALANCED_CONDITIONAL';
  	          return false
  	        }
  	        this.vfExec[this.vfExec.length - 1] = !this.vfExec[this.vfExec.length - 1];
  	        break

  	      case Opcode.OP_ENDIF:
  	        if (this.vfExec.length === 0) {
  	          this.errstr = 'SCRIPT_ERR_UNBALANCED_CONDITIONAL';
  	          return false
  	        }
  	        this.vfExec.pop();
  	        break

  	      case Opcode.OP_VERIFY:
  	        // (true -- ) or
  	        // (false -- false) and return
  	        if (this.stack.length < 1) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }
  	        buf = stacktop(-1);
  	        fValue = Interpreter.castToBool(buf);
  	        if (fValue) {
  	          this.stack.pop();
  	        } else {
  	          this.errstr = 'SCRIPT_ERR_VERIFY';
  	          return false
  	        }
  	        break

  	      case Opcode.OP_RETURN:

  	        if ((this.flags & Interpreter.SCRIPT_VERIFY_P2SH) === 0) { // utxo_after_genesis
  	          if (this.vfExec.length === 0) {
  	            // Terminate the execution as successful. The remaining of the script does not affect the validity (even in
  	            // presence of unbalanced IFs, invalid opcodes etc)
  	            this.pc = this.script.chunks.length;
  	            return true
  	          }
  	          // op_return encountered inside if statement after genesis --> check for invalid grammar
  	          this.nonTopLevelReturnAfterGenesis = true;
  	        } else {
  	          return false
  	        }

  	        break

  	      //
  	      // Stack ops
  	      //
  	      case Opcode.OP_TOALTSTACK:
  	        if (this.stack.length < 1) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }
  	        var1 = vartop(-1);
  	        this.altstack.push(this.stack.pop(), var1);
  	        break

  	      case Opcode.OP_FROMALTSTACK:
  	        if (this.altstack.length < 1) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_ALTSTACK_OPERATION';
  	          return false
  	        }
  	        const varAlt = this.altstack.vartop(-1);
  	        this.stack.push(this.altstack.pop(), varAlt);
  	        break

  	      case Opcode.OP_2DROP:
  	        // (x1 x2 -- )
  	        if (this.stack.length < 2) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }
  	        this.stack.pop();
  	        this.stack.pop();
  	        break

  	      case Opcode.OP_2DUP:
  	        // (x1 x2 -- x1 x2 x1 x2)
  	        if (this.stack.length < 2) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }
  	        buf1 = stacktop(-2);
  	        buf2 = stacktop(-1);
  	        var1 = vartop(-2);
  	        var2 = vartop(-1);
  	        this.stack.push(Buffer$1.from(buf1), `$${var1}`);
  	        this.stack.push(Buffer$1.from(buf2), `$${var2}`);
  	        break

  	      case Opcode.OP_3DUP:
  	        // (x1 x2 x3 -- x1 x2 x3 x1 x2 x3)
  	        if (this.stack.length < 3) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }
  	        buf1 = stacktop(-3);
  	        buf2 = stacktop(-2);
  	        var buf3 = stacktop(-1);
  	        var1 = vartop(-3);
  	        var2 = vartop(-2);
  	        var3 = vartop(-1);
  	        this.stack.push(Buffer$1.from(buf1), `$${var1}`);
  	        this.stack.push(Buffer$1.from(buf2), `$${var2}`);
  	        this.stack.push(Buffer$1.from(buf3), `$${var3}`);
  	        break

  	      case Opcode.OP_2OVER:
  	        // (x1 x2 x3 x4 -- x1 x2 x3 x4 x1 x2)
  	        if (this.stack.length < 4) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }
  	        buf1 = stacktop(-4);
  	        buf2 = stacktop(-3);
  	        var1 = vartop(-4);
  	        var2 = vartop(-3);
  	        this.stack.push(Buffer$1.from(buf1), `$${var1}`);
  	        this.stack.push(Buffer$1.from(buf2), `$${var2}`);
  	        break

  	      case Opcode.OP_2ROT:
  	        // (x1 x2 x3 x4 x5 x6 -- x3 x4 x5 x6 x1 x2)
  	        if (this.stack.length < 6) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }

  	        var1 = vartop(-6);
  	        var2 = vartop(-5);

  	        spliced = this.stack.splice(this.stack.length - 6, 2);
  	        this.stack.push(spliced[0], var1);
  	        this.stack.push(spliced[1], var2);
  	        break

  	      case Opcode.OP_2SWAP:
  	        // (x1 x2 x3 x4 -- x3 x4 x1 x2)
  	        if (this.stack.length < 4) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }
  	        var1 = vartop(-4);
  	        var2 = vartop(-3);
  	        spliced = this.stack.splice(this.stack.length - 4, 2);
  	        this.stack.push(spliced[0], var1);
  	        this.stack.push(spliced[1], var2);
  	        break

  	      case Opcode.OP_IFDUP:
  	        // (x - 0 | x x)
  	        if (this.stack.length < 1) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }
  	        buf = stacktop(-1);
  	        fValue = Interpreter.castToBool(buf);
  	        if (fValue) {
  	          var1 = vartop(-1);
  	          this.stack.push(Buffer$1.from(buf), `$${var1}`);
  	        }
  	        break

  	      case Opcode.OP_DEPTH:
  	        // -- stacksize
  	        buf = new BN(this.stack.length).toScriptNumBuffer();
  	        this.stack.push(buf, '$depth');
  	        break

  	      case Opcode.OP_DROP:
  	        // (x -- )
  	        if (this.stack.length < 1) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }
  	        this.stack.pop();
  	        break

  	      case Opcode.OP_DUP:
  	        // (x -- x x)
  	        if (this.stack.length < 1) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }
  	        var1 = vartop(-1);
  	        this.stack.push(Buffer$1.from(stacktop(-1)), `$${var1}`);
  	        break

  	      case Opcode.OP_NIP:
  	        // (x1 x2 -- x2)
  	        if (this.stack.length < 2) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }
  	        this.stack.splice(this.stack.length - 2, 1);
  	        break

  	      case Opcode.OP_OVER:
  	        // (x1 x2 -- x1 x2 x1)
  	        if (this.stack.length < 2) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }
  	        var2 = vartop(-2);
  	        this.stack.push(Buffer$1.from(stacktop(-2)), `$${var2}`);
  	        break

  	      case Opcode.OP_PICK:
  	      case Opcode.OP_ROLL:
  	        // (xn ... x2 x1 x0 n - xn ... x2 x1 x0 xn)
  	        // (xn ... x2 x1 x0 n - ... x2 x1 x0 xn)
  	        if (this.stack.length < 2) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }
  	        buf = stacktop(-1);
  	        bn = BN.fromScriptNumBuffer(buf, fRequireMinimal, 4);
  	        n = bn.toNumber();
  	        this.stack.pop();
  	        if (n < 0 || n >= this.stack.length) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }
  	        buf = stacktop(-n - 1);
  	        var1 = vartop(-n - 1);
  	        if (opcodenum === Opcode.OP_ROLL) {
  	          this.stack.splice(this.stack.length - n - 1, 1);
  	          this.stack.push(Buffer$1.from(buf), var1);
  	        } else {
  	          this.stack.push(Buffer$1.from(buf), `$${var1}`);
  	        }

  	        break

  	      case Opcode.OP_ROT:
  	        // (x1 x2 x3 -- x2 x3 x1)
  	        //  x2 x1 x3  after first swap
  	        //  x2 x3 x1  after second swap
  	        if (this.stack.length < 3) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }
  	        x1 = stacktop(-3);
  	        x2 = stacktop(-2);
  	        var x3 = stacktop(-1);
  	        var1 = vartop(-3);
  	        var2 = vartop(-2);
  	        var3 = vartop(-1);
  	        this.stack.write(-3, x2);
  	        this.stack.write(-2, x3);
  	        this.stack.write(-1, x1);
  	        this.stack.updateTopVars([var1, var3, var2]);
  	        break

  	      case Opcode.OP_SWAP:
  	        // (x1 x2 -- x2 x1)
  	        if (this.stack.length < 2) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }
  	        x1 = stacktop(-2);
  	        x2 = stacktop(-1);
  	        var1 = vartop(-2);
  	        var2 = vartop(-1);
  	        this.stack.write(-2, x2);
  	        this.stack.write(-1, x1);
  	        this.stack.updateTopVars([var1, var2]);
  	        break

  	      case Opcode.OP_TUCK:
  	        // (x1 x2 -- x2 x1 x2)
  	        if (this.stack.length < 2) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }

  	        var1 = vartop(-2);
  	        var2 = vartop(-1);

  	        this.stack.splice(this.stack.length - 2, 0, Buffer$1.from(stacktop(-1)));
  	        this.stack.updateTopVars([var2, var1, `$${var2}`]);
  	        break

  	      case Opcode.OP_SIZE:
  	        // (in -- in size)
  	        if (this.stack.length < 1) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }
  	        bn = new BN(stacktop(-1).length);
  	        this.stack.push(bn.toScriptNumBuffer(), `$size`);
  	        break

  	      //
  	      // Bitwise logic
  	      //
  	      case Opcode.OP_AND:
  	      case Opcode.OP_OR:
  	      case Opcode.OP_XOR:
  	        // (x1 x2 - out)
  	        if (this.stack.length < 2) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }
  	        buf1 = stacktop(-2);
  	        buf2 = stacktop(-1);

  	        // Inputs must be the same size
  	        if (buf1.length !== buf2.length) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_OPERAND_SIZE';
  	          return false
  	        }

  	        // To avoid allocating, we modify vch1 in place.
  	        switch (opcodenum) {
  	          case Opcode.OP_AND:
  	            for (let i = 0; i < buf1.length; i++) {
  	              buf1[i] &= buf2[i];
  	            }
  	            break
  	          case Opcode.OP_OR:
  	            for (let i = 0; i < buf1.length; i++) {
  	              buf1[i] |= buf2[i];
  	            }
  	            break
  	          case Opcode.OP_XOR:
  	            for (let i = 0; i < buf1.length; i++) {
  	              buf1[i] ^= buf2[i];
  	            }
  	            break
  	        }

  	        // And pop vch2.
  	        this.stack.pop();
  	        break

  	      case Opcode.OP_INVERT:
  	        // (x -- out)
  	        if (this.stack.length < 1) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	        }
  	        buf = stacktop(-1);
  	        for (let i = 0; i < buf.length; i++) {
  	          buf[i] = ~buf[i];
  	        }
  	        break

  	      case Opcode.OP_LSHIFT:
  	      case Opcode.OP_RSHIFT:
  	        // (x n -- out)
  	        if (this.stack.length < 2) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }
  	        buf1 = stacktop(-2);
  	        if (buf1.length === 0) {
  	          this.stack.pop();
  	        } else {
  	          bn1 = new BN(buf1);
  	          bn2 = BN.fromScriptNumBuffer(stacktop(-1), fRequireMinimal, 4);
  	          n = bn2.toNumber();
  	          if (n < 0) {
  	            this.errstr = 'SCRIPT_ERR_INVALID_NUMBER_RANGE';
  	            return false
  	          }
  	          this.stack.pop();
  	          this.stack.pop();
  	          let shifted;
  	          if (opcodenum === Opcode.OP_LSHIFT) {
  	            shifted = bn1.ushln(n);
  	          }
  	          if (opcodenum === Opcode.OP_RSHIFT) {
  	            shifted = bn1.ushrn(n);
  	          }
  	          // bitcoin client implementation of l/rshift is unconventional, therefore this implementation is a bit unconventional
  	          // bn library has shift functions however it expands the carried bits into a new byte
  	          // in contrast to the bitcoin client implementation which drops off the carried bits
  	          // in other words, if operand was 1 byte then we put 1 byte back on the stack instead of expanding to more shifted bytes
  	          let bufShifted = padBufferToSize(Buffer$1.from(shifted.toArray().slice(buf1.length * -1)), buf1.length);
  	          this.stack.push(bufShifted);
  	        }
  	        break

  	      case Opcode.OP_EQUAL:
  	      case Opcode.OP_EQUALVERIFY:
  	        // case Opcode.OP_NOTEQUAL: // use Opcode.OP_NUMNOTEQUAL
  	        // (x1 x2 - bool)
  	        if (this.stack.length < 2) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }
  	        buf1 = stacktop(-2);
  	        buf2 = stacktop(-1);
  	        var fEqual = buf1.toString('hex') === buf2.toString('hex');
  	        this.stack.pop();
  	        this.stack.pop();
  	        this.stack.push(fEqual ? Interpreter.getTrue() : Interpreter.getFalse());
  	        if (opcodenum === Opcode.OP_EQUALVERIFY) {
  	          if (fEqual) {
  	            this.stack.pop();
  	          } else {
  	            this.errstr = 'SCRIPT_ERR_EQUALVERIFY';
  	            return false
  	          }
  	        }
  	        break

  	      //
  	      // Numeric
  	      //
  	      case Opcode.OP_1ADD:
  	      case Opcode.OP_1SUB:
  	      case Opcode.OP_NEGATE:
  	      case Opcode.OP_ABS:
  	      case Opcode.OP_NOT:
  	      case Opcode.OP_0NOTEQUAL:
  	        // (in -- out)
  	        if (this.stack.length < 1) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }
  	        buf = stacktop(-1);
  	        bn = BN.fromScriptNumBuffer(buf, fRequireMinimal);
  	        switch (opcodenum) {
  	          case Opcode.OP_1ADD:
  	            bn = bn.add(BN.One);
  	            break
  	          case Opcode.OP_1SUB:
  	            bn = bn.sub(BN.One);
  	            break
  	          case Opcode.OP_NEGATE:
  	            bn = bn.neg();
  	            break
  	          case Opcode.OP_ABS:
  	            if (bn.cmp(BN.Zero) < 0) {
  	              bn = bn.neg();
  	            }
  	            break
  	          case Opcode.OP_NOT:
  	            bn = new BN((bn.cmp(BN.Zero) === 0) + 0);
  	            break
  	          case Opcode.OP_0NOTEQUAL:
  	            bn = new BN((bn.cmp(BN.Zero) !== 0) + 0);
  	            break
  	          // default:      assert(!'invalid opcode'); break; // TODO: does this ever occur?
  	        }
  	        this.stack.pop();
  	        this.stack.push(bn.toScriptNumBuffer());
  	        break

  	      case Opcode.OP_ADD:
  	      case Opcode.OP_SUB:
  	      case Opcode.OP_MUL:
  	      case Opcode.OP_MOD:
  	      case Opcode.OP_DIV:
  	      case Opcode.OP_BOOLAND:
  	      case Opcode.OP_BOOLOR:
  	      case Opcode.OP_NUMEQUAL:
  	      case Opcode.OP_NUMEQUALVERIFY:
  	      case Opcode.OP_NUMNOTEQUAL:
  	      case Opcode.OP_LESSTHAN:
  	      case Opcode.OP_GREATERTHAN:
  	      case Opcode.OP_LESSTHANOREQUAL:
  	      case Opcode.OP_GREATERTHANOREQUAL:
  	      case Opcode.OP_MIN:
  	      case Opcode.OP_MAX:
  	        // (x1 x2 -- out)
  	        if (this.stack.length < 2) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }
  	        bn1 = BN.fromScriptNumBuffer(stacktop(-2), fRequireMinimal);
  	        bn2 = BN.fromScriptNumBuffer(stacktop(-1), fRequireMinimal);
  	        bn = new BN(0);

  	        switch (opcodenum) {
  	          case Opcode.OP_ADD:
  	            bn = bn1.add(bn2);
  	            break

  	          case Opcode.OP_SUB:
  	            bn = bn1.sub(bn2);
  	            break

  	          case Opcode.OP_MUL:
  	            bn = bn1.mul(bn2);
  	            break

  	          case Opcode.OP_DIV:
  	            // denominator must not be 0
  	            if (bn2 === 0) {
  	              this.errstr = 'SCRIPT_ERR_DIV_BY_ZERO';
  	              return false
  	            }
  	            bn = bn1.div(bn2);
  	            break

  	          case Opcode.OP_MOD:
  	            // divisor must not be 0
  	            if (bn2 === 0) {
  	              this.errstr = 'SCRIPT_ERR_DIV_BY_ZERO';
  	              return false
  	            }
  	            bn = bn1.mod(bn2);
  	            break

  	          case Opcode.OP_BOOLAND:
  	            bn = new BN(((bn1.cmp(BN.Zero) !== 0) && (bn2.cmp(BN.Zero) !== 0)) + 0);
  	            break
  	          // case Opcode.OP_BOOLOR:        bn = (bn1 !== bnZero || bn2 !== bnZero); break;
  	          case Opcode.OP_BOOLOR:
  	            bn = new BN(((bn1.cmp(BN.Zero) !== 0) || (bn2.cmp(BN.Zero) !== 0)) + 0);
  	            break
  	          // case Opcode.OP_NUMEQUAL:      bn = (bn1 === bn2); break;
  	          case Opcode.OP_NUMEQUAL:
  	            bn = new BN((bn1.cmp(bn2) === 0) + 0);
  	            break
  	          // case Opcode.OP_NUMEQUALVERIFY:    bn = (bn1 === bn2); break;
  	          case Opcode.OP_NUMEQUALVERIFY:
  	            bn = new BN((bn1.cmp(bn2) === 0) + 0);
  	            break
  	          // case Opcode.OP_NUMNOTEQUAL:     bn = (bn1 !== bn2); break;
  	          case Opcode.OP_NUMNOTEQUAL:
  	            bn = new BN((bn1.cmp(bn2) !== 0) + 0);
  	            break
  	          // case Opcode.OP_LESSTHAN:      bn = (bn1 < bn2); break;
  	          case Opcode.OP_LESSTHAN:
  	            bn = new BN((bn1.cmp(bn2) < 0) + 0);
  	            break
  	          // case Opcode.OP_GREATERTHAN:     bn = (bn1 > bn2); break;
  	          case Opcode.OP_GREATERTHAN:
  	            bn = new BN((bn1.cmp(bn2) > 0) + 0);
  	            break
  	          // case Opcode.OP_LESSTHANOREQUAL:   bn = (bn1 <= bn2); break;
  	          case Opcode.OP_LESSTHANOREQUAL:
  	            bn = new BN((bn1.cmp(bn2) <= 0) + 0);
  	            break
  	          // case Opcode.OP_GREATERTHANOREQUAL:  bn = (bn1 >= bn2); break;
  	          case Opcode.OP_GREATERTHANOREQUAL:
  	            bn = new BN((bn1.cmp(bn2) >= 0) + 0);
  	            break
  	          case Opcode.OP_MIN:
  	            bn = (bn1.cmp(bn2) < 0 ? bn1 : bn2);
  	            break
  	          case Opcode.OP_MAX:
  	            bn = (bn1.cmp(bn2) > 0 ? bn1 : bn2);
  	            break
  	          // default:           assert(!'invalid opcode'); break; //TODO: does this ever occur?
  	        }
  	        this.stack.pop();
  	        this.stack.pop();
  	        this.stack.push(bn.toScriptNumBuffer());

  	        if (opcodenum === Opcode.OP_NUMEQUALVERIFY) {
  	          // if (CastToBool(stacktop(-1)))
  	          if (Interpreter.castToBool(stacktop(-1))) {
  	            this.stack.pop();
  	          } else {
  	            this.errstr = 'SCRIPT_ERR_NUMEQUALVERIFY';
  	            return false
  	          }
  	        }
  	        break

  	      case Opcode.OP_WITHIN:
  	        // (x min max -- out)
  	        if (this.stack.length < 3) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }
  	        bn1 = BN.fromScriptNumBuffer(stacktop(-3), fRequireMinimal);
  	        bn2 = BN.fromScriptNumBuffer(stacktop(-2), fRequireMinimal);
  	        var bn3 = BN.fromScriptNumBuffer(stacktop(-1), fRequireMinimal);
  	        // bool fValue = (bn2 <= bn1 && bn1 < bn3);
  	        fValue = (bn2.cmp(bn1) <= 0) && (bn1.cmp(bn3) < 0);
  	        this.stack.pop();
  	        this.stack.pop();
  	        this.stack.pop();
  	        this.stack.push(fValue ? Interpreter.getTrue() : Interpreter.getFalse());
  	        break

  	      //
  	      // Crypto
  	      //
  	      case Opcode.OP_RIPEMD160:
  	      case Opcode.OP_SHA1:
  	      case Opcode.OP_SHA256:
  	      case Opcode.OP_HASH160:
  	      case Opcode.OP_HASH256:
  	        // (in -- hash)
  	        if (this.stack.length < 1) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }
  	        buf = stacktop(-1);
  	        // valtype vchHash((opcode === Opcode.OP_RIPEMD160 ||
  	        //                 opcode === Opcode.OP_SHA1 || opcode === Opcode.OP_HASH160) ? 20 : 32);
  	        var bufHash;
  	        if (opcodenum === Opcode.OP_RIPEMD160) {
  	          bufHash = Hash.ripemd160(buf);
  	        } else if (opcodenum === Opcode.OP_SHA1) {
  	          bufHash = Hash.sha1(buf);
  	        } else if (opcodenum === Opcode.OP_SHA256) {
  	          bufHash = Hash.sha256(buf);
  	        } else if (opcodenum === Opcode.OP_HASH160) {
  	          bufHash = Hash.sha256ripemd160(buf);
  	        } else if (opcodenum === Opcode.OP_HASH256) {
  	          bufHash = Hash.sha256sha256(buf);
  	        }
  	        this.stack.pop();
  	        this.stack.push(bufHash);
  	        break

  	      case Opcode.OP_CODESEPARATOR:
  	        // Hash starts after the code separator
  	        this.pbegincodehash = this.pc;
  	        break

  	      case Opcode.OP_CHECKSIG:
  	      case Opcode.OP_CHECKSIGVERIFY:
  	        // (sig pubkey -- bool)
  	        if (this.stack.length < 2) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }

  	        bufSig = stacktop(-2);
  	        bufPubkey = stacktop(-1);

  	        if (!this.checkSignatureEncoding(bufSig) || !this.checkPubkeyEncoding(bufPubkey)) {
  	          return false
  	        }

  	        // Subset of script starting at the most recent codeseparator
  	        // CScript scriptCode(pbegincodehash, pend);
  	        subscript = this.subscript();

  	        // Drop the signature, since there's no way for a signature to sign itself
  	        var tmpScript = new Script().add(bufSig);
  	        subscript.findAndDelete(tmpScript);

  	        try {
  	          sig = Signature.fromTxFormat(bufSig);
  	          pubkey = PublicKey.fromBuffer(bufPubkey, false);

  	          fSuccess = this.tx.verifySignature(sig, pubkey, this.nin, subscript, this.satoshisBN, this.flags);
  	        } catch (e) {
  	          // invalid sig or pubkey
  	          fSuccess = false;
  	        }

  	        if (!fSuccess && (this.flags & Interpreter.SCRIPT_VERIFY_NULLFAIL) &&
  	          bufSig.length) {
  	          this.errstr = 'SCRIPT_ERR_NULLFAIL';
  	          return false
  	        }

  	        this.stack.pop();
  	        this.stack.pop();

  	        // stack.push_back(fSuccess ? vchTrue : vchFalse);
  	        this.stack.push(fSuccess ? Interpreter.getTrue() : Interpreter.getFalse());
  	        if (opcodenum === Opcode.OP_CHECKSIGVERIFY) {
  	          if (fSuccess) {
  	            this.stack.pop();
  	          } else {
  	            this.errstr = 'SCRIPT_ERR_CHECKSIGVERIFY';
  	            return false
  	          }
  	        }
  	        break

  	      case Opcode.OP_CHECKMULTISIG:
  	      case Opcode.OP_CHECKMULTISIGVERIFY:
  	        // ([sig ...] num_of_signatures [pubkey ...] num_of_pubkeys -- bool)

  	        var i = 1;
  	        if (this.stack.length < i) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }

  	        var nKeysCount = BN.fromScriptNumBuffer(stacktop(-i), fRequireMinimal).toNumber();
  	        // TODO: Keys and opcount are parameterized in client. No magic numbers!
  	        if (nKeysCount < 0 || nKeysCount > 20) {
  	          this.errstr = 'SCRIPT_ERR_PUBKEY_COUNT';
  	          return false
  	        }
  	        this.nOpCount += nKeysCount;
  	        if (this.nOpCount > Interpreter.MAX_OPCODE_COUNT) {
  	          this.errstr = 'SCRIPT_ERR_OP_COUNT';
  	          return false
  	        }
  	        // int ikey = ++i;
  	        var ikey = ++i;
  	        i += nKeysCount;

  	        // ikey2 is the position of last non-signature item in
  	        // the stack. Top stack item = 1. With
  	        // SCRIPT_VERIFY_NULLFAIL, this is used for cleanup if
  	        // operation fails.
  	        var ikey2 = nKeysCount + 2;

  	        if (this.stack.length < i) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }

  	        var nSigsCount = BN.fromScriptNumBuffer(stacktop(-i), fRequireMinimal).toNumber();
  	        if (nSigsCount < 0 || nSigsCount > nKeysCount) {
  	          this.errstr = 'SCRIPT_ERR_SIG_COUNT';
  	          return false
  	        }
  	        // int isig = ++i;
  	        var isig = ++i;
  	        i += nSigsCount;
  	        if (this.stack.length < i) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }

  	        // Subset of script starting at the most recent codeseparator
  	        subscript = this.subscript();

  	        // Drop the signatures, since there's no way for a signature to sign itself
  	        for (var k = 0; k < nSigsCount; k++) {
  	          bufSig = stacktop(-isig - k);
  	          subscript.findAndDelete(new Script().add(bufSig));
  	        }

  	        fSuccess = true;
  	        while (fSuccess && nSigsCount > 0) {
  	          // valtype& vchSig  = stacktop(-isig);
  	          bufSig = stacktop(-isig);
  	          // valtype& vchPubKey = stacktop(-ikey);
  	          bufPubkey = stacktop(-ikey);

  	          if (!this.checkSignatureEncoding(bufSig) || !this.checkPubkeyEncoding(bufPubkey)) {
  	            return false
  	          }

  	          var fOk;
  	          try {
  	            sig = Signature.fromTxFormat(bufSig);
  	            pubkey = PublicKey.fromBuffer(bufPubkey, false);
  	            fOk = this.tx.verifySignature(sig, pubkey, this.nin, subscript, this.satoshisBN, this.flags);
  	          } catch (e) {
  	            // invalid sig or pubkey
  	            fOk = false;
  	          }

  	          if (fOk) {
  	            isig++;
  	            nSigsCount--;
  	          }
  	          ikey++;
  	          nKeysCount--;

  	          // If there are more signatures left than keys left,
  	          // then too many signatures have failed
  	          if (nSigsCount > nKeysCount) {
  	            fSuccess = false;
  	          }
  	        }

  	        // Clean up stack of actual arguments
  	        while (i-- > 1) {
  	          if (!fSuccess && (this.flags & Interpreter.SCRIPT_VERIFY_NULLFAIL) &&
  	            !ikey2 && stacktop(-1).length) {
  	            this.errstr = 'SCRIPT_ERR_NULLFAIL';
  	            return false
  	          }

  	          if (ikey2 > 0) {
  	            ikey2--;
  	          }

  	          this.stack.pop();
  	        }

  	        // A bug causes CHECKMULTISIG to consume one extra argument
  	        // whose contents were not checked in any way.
  	        //
  	        // Unfortunately this is a potential source of mutability,
  	        // so optionally verify it is exactly equal to zero prior
  	        // to removing it from the stack.
  	        if (this.stack.length < 1) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }
  	        if ((this.flags & Interpreter.SCRIPT_VERIFY_NULLDUMMY) && stacktop(-1).length) {
  	          this.errstr = 'SCRIPT_ERR_SIG_NULLDUMMY';
  	          return false
  	        }
  	        this.stack.pop();

  	        this.stack.push(fSuccess ? Interpreter.getTrue() : Interpreter.getFalse());

  	        if (opcodenum === Opcode.OP_CHECKMULTISIGVERIFY) {
  	          if (fSuccess) {
  	            this.stack.pop();
  	          } else {
  	            this.errstr = 'SCRIPT_ERR_CHECKMULTISIGVERIFY';
  	            return false
  	          }
  	        }
  	        break

  	      //
  	      // Byte string operations
  	      //
  	      case Opcode.OP_CAT:
  	        if (this.stack.length < 2) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }

  	        buf1 = stacktop(-2);
  	        buf2 = stacktop(-1);
  	        if (buf1.length + buf2.length > Interpreter.MAX_SCRIPT_ELEMENT_SIZE) {
  	          this.errstr = 'SCRIPT_ERR_PUSH_SIZE';
  	          return false
  	        }
  	        this.stack.write(-2, Buffer$1.concat([buf1, buf2]));
  	        this.stack.pop();
  	        break

  	      case Opcode.OP_SPLIT:
  	        if (this.stack.length < 2) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }
  	        buf1 = stacktop(-2);

  	        // Make sure the split point is apropriate.
  	        var position = BN.fromScriptNumBuffer(stacktop(-1), fRequireMinimal).toNumber();
  	        if (position < 0 || position > buf1.length) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_SPLIT_RANGE';
  	          return false
  	        }

  	        // Prepare the results in their own buffer as `data`
  	        // will be invalidated.
  	        // Copy buffer data, to slice it before
  	        var n1 = Buffer$1.from(buf1);

  	        // Replace existing stack values by the new values.
  	        this.stack.write(-2, n1.slice(0, position));
  	        this.stack.write(-1, n1.slice(position));
  	        break

  	      //
  	      // Conversion operations
  	      //
  	      case Opcode.OP_NUM2BIN:
  	        // (in -- out)
  	        if (this.stack.length < 2) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }

  	        var size = BN.fromScriptNumBuffer(stacktop(-1), fRequireMinimal).toNumber();
  	        if (size > Interpreter.MAX_SCRIPT_ELEMENT_SIZE) {
  	          this.errstr = 'SCRIPT_ERR_PUSH_SIZE';
  	          return false
  	        }

  	        this.stack.pop();
  	        var rawnum = stacktop(-1);

  	        // Try to see if we can fit that number in the number of
  	        // byte requested.
  	        rawnum = Interpreter._minimallyEncode(rawnum);

  	        if (rawnum.length > size) {
  	          // We definitively cannot.
  	          this.errstr = 'SCRIPT_ERR_IMPOSSIBLE_ENCODING';
  	          return false
  	        }

  	        // We already have an element of the right size, we
  	        // don't need to do anything.
  	        if (rawnum.length === size) {
  	          this.stack.write(-1, rawnum);
  	          break
  	        }

  	        var signbit = 0x00;
  	        if (rawnum.length > 0) {
  	          signbit = rawnum[rawnum.length - 1] & 0x80;
  	          rawnum[rawnum.length - 1] &= 0x7f;
  	        }

  	        var num = Buffer$1.alloc(size);
  	        rawnum.copy(num, 0);

  	        var l = rawnum.length - 1;
  	        while (l++ < size - 2) {
  	          num[l] = 0x00;
  	        }

  	        num[l] = signbit;

  	        this.stack.write(-1, num);
  	        break

  	      case Opcode.OP_BIN2NUM:
  	        // (in -- out)
  	        if (this.stack.length < 1) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_STACK_OPERATION';
  	          return false
  	        }

  	        buf1 = stacktop(-1);
  	        buf2 = Interpreter._minimallyEncode(buf1);

  	        this.stack.write(-1, buf2);

  	        // The resulting number must be a valid number.
  	        if (!Interpreter._isMinimallyEncoded(buf2)) {
  	          this.errstr = 'SCRIPT_ERR_INVALID_NUMBER_RANGE';
  	          return false
  	        }
  	        break

  	      default:
  	        this.errstr = 'SCRIPT_ERR_BAD_OPCODE';
  	        return false
  	    }
  	  }

  	  // only when next opcode is evaluate opcode, we update stack
  	  if (this.vfExec.indexOf(false) === -1) {
  	    this._callbackStack(this.stack, this.pc, scriptType);
  	  }

  	  return true
  	};
  	return interpreter;
  }

  var hasRequiredScript;

  function requireScript () {
  	if (hasRequiredScript) return script$1.exports;
  	hasRequiredScript = 1;
  	(function (module) {
  		module.exports = requireScript$1();

  		module.exports.Interpreter = requireInterpreter();

  		module.exports.Stack = stack;
  } (script$1));
  	return script$1.exports;
  }

  var address;
  var hasRequiredAddress;

  function requireAddress () {
  	if (hasRequiredAddress) return address;
  	hasRequiredAddress = 1;

  	var _ = __1;
  	var $ = preconditions;
  	var errors = errors$2.exports;
  	var Base58Check = base58check;
  	var Networks = networks_1;
  	var Hash = hash.exports;
  	var JSUtil = js;
  	var PublicKey = requirePublickey();

  	/**
  	 * Instantiate an address from an address String or Buffer, a public key or script hash Buffer,
  	 * or an instance of {@link PublicKey} or {@link Script}.
  	 *
  	 * This is an immutable class, and if the first parameter provided to this constructor is an
  	 * `Address` instance, the same argument will be returned.
  	 *
  	 * An address has two key properties: `network` and `type`. The type is either
  	 * `Address.PayToPublicKeyHash` (value is the `'pubkeyhash'` string)
  	 * or `Address.PayToScriptHash` (the string `'scripthash'`). The network is an instance of {@link Network}.
  	 * You can quickly check whether an address is of a given kind by using the methods
  	 * `isPayToPublicKeyHash` and `isPayToScriptHash`
  	 *
  	 * @example
  	 * ```javascript
  	 * // validate that an input field is valid
  	 * var error = Address.getValidationError(input, 'testnet');
  	 * if (!error) {
  	 *   var address = Address(input, 'testnet');
  	 * } else {
  	 *   // invalid network or checksum (typo?)
  	 *   var message = error.messsage;
  	 * }
  	 *
  	 * // get an address from a public key
  	 * var address = Address(publicKey, 'testnet').toString();
  	 * ```
  	 *
  	 * @param {*} data - The encoded data in various formats
  	 * @param {Network|String|number=} network - The network: 'livenet' or 'testnet'
  	 * @param {string=} type - The type of address: 'script' or 'pubkey'
  	 * @returns {Address} A new valid and frozen instance of an Address
  	 * @constructor
  	 */
  	function Address (data, network, type) {
  	  if (!(this instanceof Address)) {
  	    return new Address(data, network, type)
  	  }

  	  if (_.isArray(data) && _.isNumber(network)) {
  	    return Address.createMultisig(data, network, type)
  	  }

  	  if (data instanceof Address) {
  	    // Immutable instance
  	    return data
  	  }

  	  $.checkArgument(data, 'First argument is required, please include address data.', 'guide/address.html');

  	  if (network && !Networks.get(network)) {
  	    throw new TypeError('Second argument must be "livenet", "testnet", or "regtest".')
  	  }

  	  if (type && (type !== Address.PayToPublicKeyHash && type !== Address.PayToScriptHash)) {
  	    throw new TypeError('Third argument must be "pubkeyhash" or "scripthash".')
  	  }

  	  var info = this._classifyArguments(data, network, type);

  	  // set defaults if not set
  	  info.network = info.network || Networks.get(network) || Networks.defaultNetwork;
  	  info.type = info.type || type || Address.PayToPublicKeyHash;

  	  JSUtil.defineImmutable(this, {
  	    hashBuffer: info.hashBuffer,
  	    network: info.network,
  	    type: info.type
  	  });

  	  return this
  	}

  	/**
  	 * Internal function used to split different kinds of arguments of the constructor
  	 * @param {*} data - The encoded data in various formats
  	 * @param {Network|String|number=} network - The network: 'livenet' or 'testnet'
  	 * @param {string=} type - The type of address: 'script' or 'pubkey'
  	 * @returns {Object} An "info" object with "type", "network", and "hashBuffer"
  	 */
  	Address.prototype._classifyArguments = function (data, network, type) {
  	  // transform and validate input data
  	  if ((data instanceof Buffer$1 || data instanceof Uint8Array) && data.length === 20) {
  	    return Address._transformHash(data)
  	  } else if ((data instanceof Buffer$1 || data instanceof Uint8Array) && data.length === 21) {
  	    return Address._transformBuffer(data, network, type)
  	  } else if (data instanceof PublicKey) {
  	    return Address._transformPublicKey(data)
  	  } else if (data instanceof Script) {
  	    return Address._transformScript(data, network)
  	  } else if (typeof (data) === 'string') {
  	    return Address._transformString(data, network, type)
  	  } else if (_.isObject(data)) {
  	    return Address._transformObject(data)
  	  } else {
  	    throw new TypeError('First argument is an unrecognized data format.')
  	  }
  	};

  	/** @static */
  	Address.PayToPublicKeyHash = 'pubkeyhash';
  	/** @static */
  	Address.PayToScriptHash = 'scripthash';

  	/**
  	 * @param {Buffer} hash - An instance of a hash Buffer
  	 * @returns {Object} An object with keys: hashBuffer
  	 * @private
  	 */
  	Address._transformHash = function (hash) {
  	  var info = {};
  	  if (!(hash instanceof Buffer$1) && !(hash instanceof Uint8Array)) {
  	    throw new TypeError('Address supplied is not a buffer.')
  	  }
  	  if (hash.length !== 20) {
  	    throw new TypeError('Address hashbuffers must be exactly 20 bytes.')
  	  }
  	  info.hashBuffer = hash;
  	  return info
  	};

  	/**
  	 * Deserializes an address serialized through `Address#toObject()`
  	 * @param {Object} data
  	 * @param {string} data.hash - the hash that this address encodes
  	 * @param {string} data.type - either 'pubkeyhash' or 'scripthash'
  	 * @param {Network=} data.network - the name of the network associated
  	 * @return {Address}
  	 */
  	Address._transformObject = function (data) {
  	  $.checkArgument(data.hash || data.hashBuffer, 'Must provide a `hash` or `hashBuffer` property');
  	  $.checkArgument(data.type, 'Must provide a `type` property');
  	  return {
  	    hashBuffer: data.hash ? Buffer$1.from(data.hash, 'hex') : data.hashBuffer,
  	    network: Networks.get(data.network) || Networks.defaultNetwork,
  	    type: data.type
  	  }
  	};

  	/**
  	 * Internal function to discover the network and type based on the first data byte
  	 *
  	 * @param {Buffer} buffer - An instance of a hex encoded address Buffer
  	 * @returns {Object} An object with keys: network and type
  	 * @private
  	 */
  	Address._classifyFromVersion = function (buffer) {
  	  var version = {};

  	  var pubkeyhashNetwork = Networks.get(buffer[0], 'pubkeyhash');
  	  var scripthashNetwork = Networks.get(buffer[0], 'scripthash');

  	  if (pubkeyhashNetwork) {
  	    version.network = pubkeyhashNetwork;
  	    version.type = Address.PayToPublicKeyHash;
  	  } else if (scripthashNetwork) {
  	    version.network = scripthashNetwork;
  	    version.type = Address.PayToScriptHash;
  	  }

  	  return version
  	};

  	/**
  	 * Internal function to transform a bitcoin address buffer
  	 *
  	 * @param {Buffer} buffer - An instance of a hex encoded address Buffer
  	 * @param {string=} network - The network: 'livenet' or 'testnet'
  	 * @param {string=} type - The type: 'pubkeyhash' or 'scripthash'
  	 * @returns {Object} An object with keys: hashBuffer, network and type
  	 * @private
  	 */
  	Address._transformBuffer = function (buffer, network, type) {
  	  var info = {};
  	  if (!(buffer instanceof Buffer$1) && !(buffer instanceof Uint8Array)) {
  	    throw new TypeError('Address supplied is not a buffer.')
  	  }
  	  if (buffer.length !== 1 + 20) {
  	    throw new TypeError('Address buffers must be exactly 21 bytes.')
  	  }

  	  var networkObj = Networks.get(network);
  	  var bufferVersion = Address._classifyFromVersion(buffer);

  	  if (network && !networkObj) {
  	    throw new TypeError('Unknown network')
  	  }

  	  if (!bufferVersion.network || (networkObj && networkObj !== bufferVersion.network)) {
  	    // console.log(bufferVersion)
  	    throw new TypeError('Address has mismatched network type.')
  	  }

  	  if (!bufferVersion.type || (type && type !== bufferVersion.type)) {
  	    throw new TypeError('Address has mismatched type.')
  	  }

  	  info.hashBuffer = buffer.slice(1);
  	  info.network = bufferVersion.network;
  	  info.type = bufferVersion.type;
  	  return info
  	};

  	/**
  	 * Internal function to transform a {@link PublicKey}
  	 *
  	 * @param {PublicKey} pubkey - An instance of PublicKey
  	 * @returns {Object} An object with keys: hashBuffer, type
  	 * @private
  	 */
  	Address._transformPublicKey = function (pubkey) {
  	  var info = {};
  	  if (!(pubkey instanceof PublicKey)) {
  	    throw new TypeError('Address must be an instance of PublicKey.')
  	  }
  	  info.hashBuffer = Hash.sha256ripemd160(pubkey.toBuffer());
  	  info.type = Address.PayToPublicKeyHash;
  	  return info
  	};

  	/**
  	 * Internal function to transform a {@link Script} into a `info` object.
  	 *
  	 * @param {Script} script - An instance of Script
  	 * @returns {Object} An object with keys: hashBuffer, type
  	 * @private
  	 */
  	Address._transformScript = function (script, network) {
  	  $.checkArgument(script instanceof Script, 'script must be a Script instance');
  	  var info = script.getAddressInfo(network);
  	  if (!info) {
  	    throw new errors.Script.CantDeriveAddress(script)
  	  }
  	  return info
  	};

  	/**
  	 * Creates a P2SH address from a set of public keys and a threshold.
  	 *
  	 * The addresses will be sorted lexicographically, as that is the trend in bitcoin.
  	 * To create an address from unsorted public keys, use the {@link Script#buildMultisigOut}
  	 * interface.
  	 *
  	 * @param {Array} publicKeys - a set of public keys to create an address
  	 * @param {number} threshold - the number of signatures needed to release the funds
  	 * @param {String|Network} network - either a Network instance, 'livenet', or 'testnet'
  	 * @return {Address}
  	 */
  	Address.createMultisig = function (publicKeys, threshold, network) {
  	  network = network || publicKeys[0].network || Networks.defaultNetwork;
  	  return Address.payingTo(Script.buildMultisigOut(publicKeys, threshold), network)
  	};

  	/**
  	 * Internal function to transform a bitcoin cash address string
  	 *
  	 * @param {string} data
  	 * @param {String|Network=} network - either a Network instance, 'livenet', or 'testnet'
  	 * @param {string=} type - The type: 'pubkeyhash' or 'scripthash'
  	 * @returns {Object} An object with keys: hashBuffer, network and type
  	 * @private
  	 */
  	Address._transformString = function (data, network, type) {
  	  if (typeof (data) !== 'string') {
  	    throw new TypeError('data parameter supplied is not a string.')
  	  }
  	  if (data.length < 27) {
  	    throw new Error('Invalid Address string provided')
  	  }
  	  data = data.trim();
  	  var networkObj = Networks.get(network);

  	  if (network && !networkObj) {
  	    throw new TypeError('Unknown network')
  	  }

  	  var addressBuffer = Base58Check.decode(data);
  	  return Address._transformBuffer(addressBuffer, network, type)
  	};

  	/**
  	 * Instantiate an address from a PublicKey instance
  	 *
  	 * @param {PublicKey} data
  	 * @param {String|Network} network - either a Network instance, 'livenet', or 'testnet'
  	 * @returns {Address} A new valid and frozen instance of an Address
  	 */
  	Address.fromPublicKey = function (data, network) {
  	  var info = Address._transformPublicKey(data);
  	  network = network || Networks.defaultNetwork;
  	  return new Address(info.hashBuffer, network, info.type)
  	};

  	/**
  	 * Instantiate an address from a PrivateKey instance
  	 *
  	 * @param {PrivateKey} privateKey
  	 * @param {String|Network} network - either a Network instance, 'livenet', or 'testnet'
  	 * @returns {Address} A new valid and frozen instance of an Address
  	 */
  	Address.fromPrivateKey = function (privateKey, network) {
  	  let publicKey = PublicKey.fromPrivateKey(privateKey);
  	  network = network || privateKey.network || Networks.defaultNetwork;
  	  return Address.fromPublicKey(publicKey, network)
  	};

  	/**
  	 * Instantiate an address from a ripemd160 public key hash
  	 *
  	 * @param {Buffer} hash - An instance of buffer of the hash
  	 * @param {String|Network} network - either a Network instance, 'livenet', or 'testnet'
  	 * @returns {Address} A new valid and frozen instance of an Address
  	 */
  	Address.fromPublicKeyHash = function (hash, network) {
  	  var info = Address._transformHash(hash);
  	  return new Address(info.hashBuffer, network, Address.PayToPublicKeyHash)
  	};

  	/**
  	 * Instantiate an address from a ripemd160 script hash
  	 *
  	 * @param {Buffer} hash - An instance of buffer of the hash
  	 * @param {String|Network} network - either a Network instance, 'livenet', or 'testnet'
  	 * @returns {Address} A new valid and frozen instance of an Address
  	 */
  	Address.fromScriptHash = function (hash, network) {
  	  $.checkArgument(hash, 'hash parameter is required');
  	  var info = Address._transformHash(hash);
  	  return new Address(info.hashBuffer, network, Address.PayToScriptHash)
  	};

  	/**
  	 * Builds a p2sh address paying to script. This will hash the script and
  	 * use that to create the address.
  	 * If you want to extract an address associated with a script instead,
  	 * see {{Address#fromScript}}
  	 *
  	 * @param {Script} script - An instance of Script
  	 * @param {String|Network} network - either a Network instance, 'livenet', or 'testnet'
  	 * @returns {Address} A new valid and frozen instance of an Address
  	 */
  	Address.payingTo = function (script, network) {
  	  $.checkArgument(script, 'script is required');
  	  $.checkArgument(script instanceof Script, 'script must be instance of Script');

  	  return Address.fromScriptHash(Hash.sha256ripemd160(script.toBuffer()), network)
  	};

  	/**
  	 * Extract address from a Script. The script must be of one
  	 * of the following types: p2pkh input, p2pkh output, p2sh input
  	 * or p2sh output.
  	 * This will analyze the script and extract address information from it.
  	 * If you want to transform any script to a p2sh Address paying
  	 * to that script's hash instead, use {{Address#payingTo}}
  	 *
  	 * @param {Script} script - An instance of Script
  	 * @param {String|Network} network - either a Network instance, 'livenet', or 'testnet'
  	 * @returns {Address} A new valid and frozen instance of an Address
  	 */
  	Address.fromScript = function (script, network) {
  	  $.checkArgument(script instanceof Script, 'script must be a Script instance');
  	  var info = Address._transformScript(script, network);
  	  return new Address(info.hashBuffer, network, info.type)
  	};

  	/**
  	 * Instantiate an address from a buffer of the address
  	 *
  	 * @param {Buffer} buffer - An instance of buffer of the address
  	 * @param {String|Network=} network - either a Network instance, 'livenet', or 'testnet'
  	 * @param {string=} type - The type of address: 'script' or 'pubkey'
  	 * @returns {Address} A new valid and frozen instance of an Address
  	 */
  	Address.fromBuffer = function (buffer, network, type) {
  	  var info = Address._transformBuffer(buffer, network, type);
  	  return new Address(info.hashBuffer, info.network, info.type)
  	};

  	Address.fromHex = function (hex, network, type) {
  	  return Address.fromBuffer(Buffer$1.from(hex, 'hex'), network, type)
  	};

  	/**
  	 * Instantiate an address from an address string
  	 *
  	 * @param {string} str - An string of the bitcoin address
  	 * @param {String|Network=} network - either a Network instance, 'livenet', or 'testnet'
  	 * @param {string=} type - The type of address: 'script' or 'pubkey'
  	 * @returns {Address} A new valid and frozen instance of an Address
  	 */
  	Address.fromString = function (str, network, type) {
  	  var info = Address._transformString(str, network, type);
  	  return new Address(info.hashBuffer, info.network, info.type)
  	};

  	/**
  	 * Instantiate an address from an Object
  	 *
  	 * @param {string} json - An JSON string or Object with keys: hash, network and type
  	 * @returns {Address} A new valid instance of an Address
  	 */
  	Address.fromObject = function fromObject (obj) {
  	  $.checkState(
  	    JSUtil.isHexa(obj.hash),
  	    'Unexpected hash property, "' + obj.hash + '", expected to be hex.'
  	  );
  	  var hashBuffer = Buffer$1.from(obj.hash, 'hex');
  	  return new Address(hashBuffer, obj.network, obj.type)
  	};

  	/**
  	 * Will return a validation error if exists
  	 *
  	 * @example
  	 * ```javascript
  	 * // a network mismatch error
  	 * var error = Address.getValidationError('15vkcKf7gB23wLAnZLmbVuMiiVDc1Nm4a2', 'testnet');
  	 * ```
  	 *
  	 * @param {string} data - The encoded data
  	 * @param {String|Network} network - either a Network instance, 'livenet', or 'testnet'
  	 * @param {string} type - The type of address: 'script' or 'pubkey'
  	 * @returns {null|Error} The corresponding error message
  	 */
  	Address.getValidationError = function (data, network, type) {
  	  var error;
  	  try {
  	    new Address(data, network, type); // eslint-disable-line
  	  } catch (e) {
  	    error = e;
  	  }
  	  return error
  	};

  	/**
  	 * Will return a boolean if an address is valid
  	 *
  	 * @example
  	 * ```javascript
  	 * assert(Address.isValid('15vkcKf7gB23wLAnZLmbVuMiiVDc1Nm4a2', 'livenet'));
  	 * ```
  	 *
  	 * @param {string} data - The encoded data
  	 * @param {String|Network} network - either a Network instance, 'livenet', or 'testnet'
  	 * @param {string} type - The type of address: 'script' or 'pubkey'
  	 * @returns {boolean} The corresponding error message
  	 */
  	Address.isValid = function (data, network, type) {
  	  return !Address.getValidationError(data, network, type)
  	};

  	/**
  	 * Returns true if an address is of pay to public key hash type
  	 * @return boolean
  	 */
  	Address.prototype.isPayToPublicKeyHash = function () {
  	  return this.type === Address.PayToPublicKeyHash
  	};

  	/**
  	 * Returns true if an address is of pay to script hash type
  	 * @return boolean
  	 */
  	Address.prototype.isPayToScriptHash = function () {
  	  return this.type === Address.PayToScriptHash
  	};

  	/**
  	 * Will return a buffer representation of the address
  	 *
  	 * @returns {Buffer} Bitcoin address buffer
  	 */
  	Address.prototype.toBuffer = function () {
  	  var version = Buffer$1.from([this.network[this.type]]);
  	  var buf = Buffer$1.concat([version, this.hashBuffer]);
  	  return buf
  	};

  	Address.prototype.toHex = function () {
  	  return this.toBuffer().toString('hex')
  	};

  	/**
  	 * @returns {Object} A plain object with the address information
  	 */
  	Address.prototype.toObject = Address.prototype.toJSON = function toObject () {
  	  return {
  	    hash: this.hashBuffer.toString('hex'),
  	    type: this.type,
  	    network: this.network.toString()
  	  }
  	};

  	/**
  	 * Will return a string formatted for the console
  	 *
  	 * @returns {string} Bitcoin address
  	 */
  	Address.prototype.inspect = function () {
  	  return '<Address: ' + this.toString() + ', type: ' + this.type + ', network: ' + this.network + '>'
  	};

  	/**
  	 * Will return a the base58 string representation of the address
  	 *
  	 * @returns {string} Bitcoin address
  	 */
  	Address.prototype.toString = function () {
  	  return Base58Check.encode(this.toBuffer())
  	};

  	address = Address;

  	var Script = requireScript();
  	return address;
  }

  function Random () {
  }

  /* secure random bytes that sometimes throws an error due to lack of entropy */
  Random.getRandomBuffer = function (size) {
    { return Random.getRandomBufferBrowser(size) }
  };

  Random.getRandomBufferNode = function (size) {
    var crypto = require$$0$2;
    return crypto.randomBytes(size)
  };

  Random.getRandomBufferBrowser = function (size) {
    if (!window.crypto && !window.msCrypto) {
      throw new Error('window.crypto not available')
    }
    var crypto;

    if (window.crypto && window.crypto.getRandomValues) {
      crypto = window.crypto;
    } else if (window.msCrypto && window.msCrypto.getRandomValues) { // internet explorer
      crypto = window.msCrypto;
    } else {
      throw new Error('window.crypto.getRandomValues not available')
    }

    var bbuf = new Uint8Array(size);
    crypto.getRandomValues(bbuf);
    var buf = Buffer$1.from(bbuf);

    return buf
  };

  var random = Random;

  var privatekey;
  var hasRequiredPrivatekey;

  function requirePrivatekey () {
  	if (hasRequiredPrivatekey) return privatekey;
  	hasRequiredPrivatekey = 1;

  	var _ = __1;
  	var Address = requireAddress();
  	var Base58Check = base58check;
  	var BN = bn$1;
  	var JSUtil = js;
  	var Networks = networks_1;
  	var Point = point;
  	var PublicKey = requirePublickey();
  	var Random = random;
  	var $ = preconditions;

  	/**
  	 * Instantiate a PrivateKey from a BN, Buffer or WIF string.
  	 *
  	 * @param {string} data - The encoded data in various formats
  	 * @param {Network|string=} network - a {@link Network} object, or a string with the network name
  	 * @returns {PrivateKey} A new valid instance of an PrivateKey
  	 * @constructor
  	 */
  	function PrivateKey (data, network) {
  	  if (!(this instanceof PrivateKey)) {
  	    return new PrivateKey(data, network)
  	  }
  	  if (data instanceof PrivateKey) {
  	    return data
  	  }

  	  var info = this._classifyArguments(data, network);

  	  // validation
  	  if (!info.bn || info.bn.cmp(new BN(0)) === 0) {
  	    throw new TypeError('Number can not be equal to zero, undefined, null or false')
  	  }
  	  if (!info.bn.lt(Point.getN())) {
  	    throw new TypeError('Number must be less than N')
  	  }
  	  if (typeof (info.network) === 'undefined') {
  	    throw new TypeError('Must specify the network ("livenet" or "testnet")')
  	  }

  	  JSUtil.defineImmutable(this, {
  	    bn: info.bn,
  	    compressed: info.compressed,
  	    network: info.network
  	  });

  	  Object.defineProperty(this, 'publicKey', {
  	    configurable: false,
  	    enumerable: true,
  	    get: this.toPublicKey.bind(this)
  	  });

  	  return this
  	}
  	/**
  	 * Internal helper to instantiate PrivateKey internal `info` object from
  	 * different kinds of arguments passed to the constructor.
  	 *
  	 * @param {*} data
  	 * @param {Network|string=} network - a {@link Network} object, or a string with the network name
  	 * @return {Object}
  	 */
  	PrivateKey.prototype._classifyArguments = function (data, network) {
  	  var info = {
  	    compressed: true,
  	    network: network ? Networks.get(network) : Networks.defaultNetwork
  	  };

  	  // detect type of data
  	  if (_.isUndefined(data) || _.isNull(data)) {
  	    info.bn = PrivateKey._getRandomBN();
  	  } else if (data instanceof BN) {
  	    info.bn = data;
  	  } else if (data instanceof Buffer$1 || data instanceof Uint8Array) {
  	    info = PrivateKey._transformBuffer(data, network);
  	  } else if (data.bn && data.network) {
  	    info = PrivateKey._transformObject(data);
  	  } else if (!network && Networks.get(data)) {
  	    info.bn = PrivateKey._getRandomBN();
  	    info.network = Networks.get(data);
  	  } else if (typeof (data) === 'string') {
  	    if (JSUtil.isHexa(data)) {
  	      info.bn = new BN(Buffer$1.from(data, 'hex'));
  	    } else {
  	      info = PrivateKey._transformWIF(data, network);
  	    }
  	  } else {
  	    throw new TypeError('First argument is an unrecognized data type.')
  	  }
  	  return info
  	};

  	/**
  	 * Internal function to get a random Big Number (BN)
  	 *
  	 * @returns {BN} A new randomly generated BN
  	 * @private
  	 */
  	PrivateKey._getRandomBN = function () {
  	  var condition;
  	  var bn;
  	  do {
  	    var privbuf = Random.getRandomBuffer(32);
  	    bn = BN.fromBuffer(privbuf);
  	    condition = bn.lt(Point.getN());
  	  } while (!condition)
  	  return bn
  	};

  	/**
  	 * Internal function to transform a WIF Buffer into a private key
  	 *
  	 * @param {Buffer} buf - An WIF string
  	 * @param {Network|string=} network - a {@link Network} object, or a string with the network name
  	 * @returns {Object} An object with keys: bn, network and compressed
  	 * @private
  	 */
  	PrivateKey._transformBuffer = function (buf, network) {
  	  var info = {};

  	  if (buf.length === 32) {
  	    return PrivateKey._transformBNBuffer(buf, network)
  	  }

  	  info.network = Networks.get(buf[0], 'privatekey');

  	  if (!info.network) {
  	    throw new Error('Invalid network')
  	  }

  	  if (network && info.network !== Networks.get(network)) {
  	    throw new TypeError('Private key network mismatch')
  	  }

  	  if (buf.length === 1 + 32 + 1 && buf[1 + 32 + 1 - 1] === 1) {
  	    info.compressed = true;
  	  } else if (buf.length === 1 + 32) {
  	    info.compressed = false;
  	  } else {
  	    throw new Error('Length of buffer must be 33 (uncompressed) or 34 (compressed)')
  	  }

  	  info.bn = BN.fromBuffer(buf.slice(1, 32 + 1));

  	  return info
  	};

  	/**
  	 * Internal function to transform a BN buffer into a private key
  	 *
  	 * @param {Buffer} buf
  	 * @param {Network|string=} network - a {@link Network} object, or a string with the network name
  	 * @returns {object} an Object with keys: bn, network, and compressed
  	 * @private
  	 */
  	PrivateKey._transformBNBuffer = function (buf, network) {
  	  var info = {};
  	  info.network = Networks.get(network) || Networks.defaultNetwork;
  	  info.bn = BN.fromBuffer(buf);
  	  info.compressed = false;
  	  return info
  	};

  	/**
  	 * Internal function to transform a WIF string into a private key
  	 *
  	 * @param {string} buf - An WIF string
  	 * @returns {Object} An object with keys: bn, network and compressed
  	 * @private
  	 */
  	PrivateKey._transformWIF = function (str, network) {
  	  return PrivateKey._transformBuffer(Base58Check.decode(str), network)
  	};

  	/**
  	 * Instantiate a PrivateKey from a Buffer with the DER or WIF representation
  	 *
  	 * @param {Buffer} buf
  	 * @param {Network} network
  	 * @return {PrivateKey}
  	 */
  	PrivateKey.fromBuffer = function (buf, network) {
  	  return new PrivateKey(buf, network)
  	};

  	PrivateKey.fromHex = function (hex, network) {
  	  return PrivateKey.fromBuffer(Buffer$1.from(hex, 'hex'), network)
  	};

  	/**
  	 * Internal function to transform a JSON string on plain object into a private key
  	 * return this.
  	 *
  	 * @param {string} json - A JSON string or plain object
  	 * @returns {Object} An object with keys: bn, network and compressed
  	 * @private
  	 */
  	PrivateKey._transformObject = function (json) {
  	  var bn = new BN(json.bn, 'hex');
  	  var network = Networks.get(json.network);
  	  return {
  	    bn: bn,
  	    network: network,
  	    compressed: json.compressed
  	  }
  	};

  	/**
  	 * Instantiate a PrivateKey from a WIF string
  	 *
  	 * @param {string} str - The WIF encoded private key string
  	 * @returns {PrivateKey} A new valid instance of PrivateKey
  	 */
  	PrivateKey.fromString = PrivateKey.fromWIF = function (str) {
  	  $.checkArgument(_.isString(str), 'First argument is expected to be a string.');
  	  return new PrivateKey(str)
  	};

  	/**
  	 * Instantiate a PrivateKey from a plain JavaScript object
  	 *
  	 * @param {Object} obj - The output from privateKey.toObject()
  	 */
  	PrivateKey.fromObject = PrivateKey.fromJSON = function (obj) {
  	  $.checkArgument(_.isObject(obj), 'First argument is expected to be an object.');
  	  return new PrivateKey(obj)
  	};

  	/**
  	 * Instantiate a PrivateKey from random bytes
  	 *
  	 * @param {string=} network - Either "livenet" or "testnet"
  	 * @returns {PrivateKey} A new valid instance of PrivateKey
  	 */
  	PrivateKey.fromRandom = function (network) {
  	  var bn = PrivateKey._getRandomBN();
  	  return new PrivateKey(bn, network)
  	};

  	/**
  	 * Check if there would be any errors when initializing a PrivateKey
  	 *
  	 * @param {string} data - The encoded data in various formats
  	 * @param {string=} network - Either "livenet" or "testnet"
  	 * @returns {null|Error} An error if exists
  	 */

  	PrivateKey.getValidationError = function (data, network) {
  	  var error;
  	  try {
  	    new PrivateKey(data, network); // eslint-disable-line
  	  } catch (e) {
  	    error = e;
  	  }
  	  return error
  	};

  	/**
  	 * Check if the parameters are valid
  	 *
  	 * @param {string} data - The encoded data in various formats
  	 * @param {string=} network - Either "livenet" or "testnet"
  	 * @returns {Boolean} If the private key is would be valid
  	 */
  	PrivateKey.isValid = function (data, network) {
  	  if (!data) {
  	    return false
  	  }
  	  return !PrivateKey.getValidationError(data, network)
  	};

  	/**
  	 * Will output the PrivateKey in WIF
  	 *
  	 * @returns {string}
  	 */
  	PrivateKey.prototype.toString = function () {
  	  return this.toWIF()
  	};

  	/**
  	 * Will output the PrivateKey to a WIF string
  	 *
  	 * @returns {string} A WIP representation of the private key
  	 */
  	PrivateKey.prototype.toWIF = function () {
  	  var network = this.network;
  	  var compressed = this.compressed;

  	  var buf;
  	  if (compressed) {
  	    buf = Buffer$1.concat([Buffer$1.from([network.privatekey]),
  	      this.bn.toBuffer({ size: 32 }),
  	      Buffer$1.from([0x01])]);
  	  } else {
  	    buf = Buffer$1.concat([Buffer$1.from([network.privatekey]),
  	      this.bn.toBuffer({ size: 32 })]);
  	  }

  	  return Base58Check.encode(buf)
  	};

  	/**
  	 * Will return the private key as a BN instance
  	 *
  	 * @returns {BN} A BN instance of the private key
  	 */
  	PrivateKey.prototype.toBigNumber = function () {
  	  return this.bn
  	};

  	/**
  	 * Will return the private key as a BN buffer
  	 *
  	 * @returns {Buffer} A buffer of the private key
  	 */
  	PrivateKey.prototype.toBuffer = function () {
  	  return this.bn.toBuffer({ size: 32 })
  	};

  	PrivateKey.prototype.toHex = function () {
  	  return this.toBuffer().toString('hex')
  	};

  	/**
  	 * Will return the corresponding public key
  	 *
  	 * @returns {PublicKey} A public key generated from the private key
  	 */
  	PrivateKey.prototype.toPublicKey = function () {
  	  if (!this._pubkey) {
  	    this._pubkey = PublicKey.fromPrivateKey(this);
  	  }
  	  return this._pubkey
  	};

  	/**
  	 * Will return an address for the private key
  	 * @param {Network=} network - optional parameter specifying
  	 * the desired network for the address
  	 *
  	 * @returns {Address} An address generated from the private key
  	 */
  	PrivateKey.prototype.toAddress = function (network) {
  	  var pubkey = this.toPublicKey();
  	  return Address.fromPublicKey(pubkey, network || this.network)
  	};

  	/**
  	 * @returns {Object} A plain object representation
  	 */
  	PrivateKey.prototype.toObject = PrivateKey.prototype.toJSON = function toObject () {
  	  return {
  	    bn: this.bn.toString('hex'),
  	    compressed: this.compressed,
  	    network: this.network.toString()
  	  }
  	};

  	/**
  	 * Will return a string formatted for the console
  	 *
  	 * @returns {string} Private key
  	 */
  	PrivateKey.prototype.inspect = function () {
  	  var uncompressed = !this.compressed ? ', uncompressed' : '';
  	  return '<PrivateKey: ' + this.toHex() + ', network: ' + this.network + uncompressed + '>'
  	};

  	privatekey = PrivateKey;
  	return privatekey;
  }

  var publickey;
  var hasRequiredPublickey;

  function requirePublickey () {
  	if (hasRequiredPublickey) return publickey;
  	hasRequiredPublickey = 1;

  	var BN = bn$1;
  	var Point = point;
  	var Hash = hash.exports;
  	var JSUtil = js;
  	var Network = networks_1;
  	var _ = __1;
  	var $ = preconditions;

  	/**
  	 * Instantiate a PublicKey from a {@link PrivateKey}, {@link Point}, `string`, or `Buffer`.
  	 *
  	 * There are two internal properties, `network` and `compressed`, that deal with importing
  	 * a PublicKey from a PrivateKey in WIF format. More details described on {@link PrivateKey}
  	 *
  	 * @example
  	 * ```javascript
  	 * // instantiate from a private key
  	 * var key = PublicKey(privateKey, true);
  	 *
  	 * // export to as a DER hex encoded string
  	 * var exported = key.toString();
  	 *
  	 * // import the public key
  	 * var imported = PublicKey.fromString(exported);
  	 * ```
  	 *
  	 * @param {string} data - The encoded data in various formats
  	 * @param {Object} extra - additional options
  	 * @param {Network=} extra.network - Which network should the address for this public key be for
  	 * @param {String=} extra.compressed - If the public key is compressed
  	 * @returns {PublicKey} A new valid instance of an PublicKey
  	 * @constructor
  	 */
  	function PublicKey (data, extra) {
  	  if (!(this instanceof PublicKey)) {
  	    return new PublicKey(data, extra)
  	  }

  	  $.checkArgument(data, 'First argument is required, please include public key data.');

  	  if (data instanceof PublicKey) {
  	    // Return copy, but as it's an immutable object, return same argument
  	    return data
  	  }
  	  extra = extra || {};

  	  var info = this._classifyArgs(data, extra);

  	  // validation
  	  info.point.validate();

  	  JSUtil.defineImmutable(this, {
  	    point: info.point,
  	    compressed: info.compressed,
  	    network: info.network || Network.defaultNetwork
  	  });

  	  return this
  	}
  	/**
  	 * Internal function to differentiate between arguments passed to the constructor
  	 * @param {*} data
  	 * @param {Object} extra
  	 */
  	PublicKey.prototype._classifyArgs = function (data, extra) {
  	  var info = {
  	    compressed: _.isUndefined(extra.compressed) || extra.compressed
  	  };

  	  // detect type of data
  	  if (data instanceof Point) {
  	    info.point = data;
  	  } else if (data.x && data.y) {
  	    info = PublicKey._transformObject(data);
  	  } else if (typeof (data) === 'string') {
  	    info = PublicKey._transformDER(Buffer$1.from(data, 'hex'));
  	  } else if (PublicKey._isBuffer(data)) {
  	    info = PublicKey._transformDER(data);
  	  } else if (PublicKey._isPrivateKey(data)) {
  	    info = PublicKey._transformPrivateKey(data);
  	  } else {
  	    throw new TypeError('First argument is an unrecognized data format.')
  	  }
  	  if (!info.network) {
  	    info.network = _.isUndefined(extra.network) ? undefined : Network.get(extra.network);
  	  }
  	  return info
  	};

  	/**
  	 * Internal function to detect if an object is a {@link PrivateKey}
  	 *
  	 * @param {*} param - object to test
  	 * @returns {boolean}
  	 * @private
  	 */
  	PublicKey._isPrivateKey = function (param) {
  	  var PrivateKey = requirePrivatekey();
  	  return param instanceof PrivateKey
  	};

  	/**
  	 * Internal function to detect if an object is a Buffer
  	 *
  	 * @param {*} param - object to test
  	 * @returns {boolean}
  	 * @private
  	 */
  	PublicKey._isBuffer = function (param) {
  	  return (param instanceof Buffer$1) || (param instanceof Uint8Array)
  	};

  	/**
  	 * Internal function to transform a private key into a public key point
  	 *
  	 * @param {PrivateKey} privkey - An instance of PrivateKey
  	 * @returns {Object} An object with keys: point and compressed
  	 * @private
  	 */
  	PublicKey._transformPrivateKey = function (privkey) {
  	  $.checkArgument(PublicKey._isPrivateKey(privkey), 'Must be an instance of PrivateKey');
  	  var info = {};
  	  info.point = Point.getG().mul(privkey.bn);
  	  info.compressed = privkey.compressed;
  	  info.network = privkey.network;
  	  return info
  	};

  	/**
  	 * Internal function to transform DER into a public key point
  	 *
  	 * @param {Buffer} buf - An DER buffer
  	 * @param {bool=} strict - if set to false, will loosen some conditions
  	 * @returns {Object} An object with keys: point and compressed
  	 * @private
  	 */
  	PublicKey._transformDER = function (buf, strict) {
  	  $.checkArgument(PublicKey._isBuffer(buf), 'Must be a buffer of DER encoded public key');
  	  var info = {};

  	  strict = _.isUndefined(strict) ? true : strict;

  	  var x;
  	  var y;
  	  var xbuf;
  	  var ybuf;

  	  if (buf[0] === 0x04 || (!strict && (buf[0] === 0x06 || buf[0] === 0x07))) {
  	    xbuf = buf.slice(1, 33);
  	    ybuf = buf.slice(33, 65);
  	    if (xbuf.length !== 32 || ybuf.length !== 32 || buf.length !== 65) {
  	      throw new TypeError('Length of x and y must be 32 bytes')
  	    }
  	    x = new BN(xbuf);
  	    y = new BN(ybuf);
  	    info.point = new Point(x, y);
  	    info.compressed = false;
  	  } else if (buf[0] === 0x03) {
  	    xbuf = buf.slice(1);
  	    x = new BN(xbuf);
  	    info = PublicKey._transformX(true, x);
  	    info.compressed = true;
  	  } else if (buf[0] === 0x02) {
  	    xbuf = buf.slice(1);
  	    x = new BN(xbuf);
  	    info = PublicKey._transformX(false, x);
  	    info.compressed = true;
  	  } else {
  	    throw new TypeError('Invalid DER format public key')
  	  }
  	  return info
  	};

  	/**
  	 * Internal function to transform X into a public key point
  	 *
  	 * @param {Boolean} odd - If the point is above or below the x axis
  	 * @param {Point} x - The x point
  	 * @returns {Object} An object with keys: point and compressed
  	 * @private
  	 */
  	PublicKey._transformX = function (odd, x) {
  	  $.checkArgument(typeof odd === 'boolean', 'Must specify whether y is odd or not (true or false)');
  	  var info = {};
  	  info.point = Point.fromX(odd, x);
  	  return info
  	};

  	/**
  	 * Internal function to transform a JSON into a public key point
  	 *
  	 * @param {String|Object} json - a JSON string or plain object
  	 * @returns {Object} An object with keys: point and compressed
  	 * @private
  	 */
  	PublicKey._transformObject = function (json) {
  	  var x = new BN(json.x, 'hex');
  	  var y = new BN(json.y, 'hex');
  	  var point = new Point(x, y);
  	  return new PublicKey(point, {
  	    compressed: json.compressed
  	  })
  	};

  	/**
  	 * Instantiate a PublicKey from a PrivateKey
  	 *
  	 * @param {PrivateKey} privkey - An instance of PrivateKey
  	 * @returns {PublicKey} A new valid instance of PublicKey
  	 */
  	PublicKey.fromPrivateKey = function (privkey) {
  	  $.checkArgument(PublicKey._isPrivateKey(privkey), 'Must be an instance of PrivateKey');
  	  var info = PublicKey._transformPrivateKey(privkey);
  	  return new PublicKey(info.point, {
  	    compressed: info.compressed,
  	    network: info.network
  	  })
  	};

  	/**
  	 * Instantiate a PublicKey from a Buffer
  	 * @param {Buffer} buf - A DER buffer
  	 * @param {bool=} strict - if set to false, will loosen some conditions
  	 * @returns {PublicKey} A new valid instance of PublicKey
  	 */
  	PublicKey.fromDER = PublicKey.fromBuffer = function (buf, strict) {
  	  $.checkArgument(PublicKey._isBuffer(buf), 'Must be a buffer of DER encoded public key');
  	  var info = PublicKey._transformDER(buf, strict);
  	  return new PublicKey(info.point, {
  	    compressed: info.compressed
  	  })
  	};

  	/**
  	 * Instantiate a PublicKey from a Point
  	 *
  	 * @param {Point} point - A Point instance
  	 * @param {boolean=} compressed - whether to store this public key as compressed format
  	 * @returns {PublicKey} A new valid instance of PublicKey
  	 */
  	PublicKey.fromPoint = function (point, compressed) {
  	  $.checkArgument(point instanceof Point, 'First argument must be an instance of Point.');
  	  return new PublicKey(point, {
  	    compressed: compressed
  	  })
  	};

  	/**
  	 * Instantiate a PublicKey from a DER hex encoded string
  	 *
  	 * @param {string} str - A DER hex string
  	 * @param {String=} encoding - The type of string encoding
  	 * @returns {PublicKey} A new valid instance of PublicKey
  	 */
  	PublicKey.fromHex = PublicKey.fromString = function (str, encoding) {
  	  var buf = Buffer$1.from(str, encoding || 'hex');
  	  var info = PublicKey._transformDER(buf);
  	  return new PublicKey(info.point, {
  	    compressed: info.compressed
  	  })
  	};

  	/**
  	 * Instantiate a PublicKey from an X Point
  	 *
  	 * @param {Boolean} odd - If the point is above or below the x axis
  	 * @param {Point} x - The x point
  	 * @returns {PublicKey} A new valid instance of PublicKey
  	 */
  	PublicKey.fromX = function (odd, x) {
  	  var info = PublicKey._transformX(odd, x);
  	  return new PublicKey(info.point, {
  	    compressed: info.compressed
  	  })
  	};

  	/**
  	 * Check if there would be any errors when initializing a PublicKey
  	 *
  	 * @param {string} data - The encoded data in various formats
  	 * @returns {null|Error} An error if exists
  	 */
  	PublicKey.getValidationError = function (data) {
  	  var error;
  	  try {
  	    new PublicKey(data); // eslint-disable-line
  	  } catch (e) {
  	    error = e;
  	  }
  	  return error
  	};

  	/**
  	 * Check if the parameters are valid
  	 *
  	 * @param {string} data - The encoded data in various formats
  	 * @returns {Boolean} If the public key would be valid
  	 */
  	PublicKey.isValid = function (data) {
  	  return !PublicKey.getValidationError(data)
  	};

  	/**
  	 * @returns {Object} A plain object of the PublicKey
  	 */
  	PublicKey.prototype.toObject = PublicKey.prototype.toJSON = function toObject () {
  	  return {
  	    x: this.point.getX().toString('hex', 2),
  	    y: this.point.getY().toString('hex', 2),
  	    compressed: this.compressed
  	  }
  	};

  	/**
  	 * Will output the PublicKey to a DER Buffer
  	 *
  	 * @returns {Buffer} A DER hex encoded buffer
  	 */
  	PublicKey.prototype.toBuffer = PublicKey.prototype.toDER = function () {
  	  var x = this.point.getX();
  	  var y = this.point.getY();

  	  var xbuf = x.toBuffer({
  	    size: 32
  	  });
  	  var ybuf = y.toBuffer({
  	    size: 32
  	  });

  	  var prefix;
  	  if (!this.compressed) {
  	    prefix = Buffer$1.from([0x04]);
  	    return Buffer$1.concat([prefix, xbuf, ybuf])
  	  } else {
  	    var odd = ybuf[ybuf.length - 1] % 2;
  	    if (odd) {
  	      prefix = Buffer$1.from([0x03]);
  	    } else {
  	      prefix = Buffer$1.from([0x02]);
  	    }
  	    return Buffer$1.concat([prefix, xbuf])
  	  }
  	};

  	/**
  	 * Will return a sha256 + ripemd160 hash of the serialized public key
  	 * @see https://github.com/bitcoin/bitcoin/blob/master/src/pubkey.h#L141
  	 * @returns {Buffer}
  	 */
  	PublicKey.prototype._getID = function _getID () {
  	  return Hash.sha256ripemd160(this.toBuffer())
  	};

  	/**
  	 * Will return an address for the public key
  	 *
  	 * @param {String|Network=} network - Which network should the address be for
  	 * @returns {Address} An address generated from the public key
  	 */
  	PublicKey.prototype.toAddress = function (network) {
  	  var Address = requireAddress();
  	  return Address.fromPublicKey(this, network || this.network)
  	};

  	/**
  	 * Will output the PublicKey to a DER encoded hex string
  	 *
  	 * @returns {string} A DER hex encoded string
  	 */
  	PublicKey.prototype.toString = PublicKey.prototype.toHex = function () {
  	  return this.toDER().toString('hex')
  	};

  	/**
  	 * Will return a string formatted for the console
  	 *
  	 * @returns {string} Public key
  	 */
  	PublicKey.prototype.inspect = function () {
  	  return '<PublicKey: ' + this.toHex() +
  	    (this.compressed ? '' : ', uncompressed') + '>'
  	};

  	publickey = PublicKey;
  	return publickey;
  }

  var ecdsa;
  var hasRequiredEcdsa;

  function requireEcdsa () {
  	if (hasRequiredEcdsa) return ecdsa;
  	hasRequiredEcdsa = 1;

  	var BN = bn$1;
  	var Point = point;
  	var Signature = signature$1;
  	var PublicKey = requirePublickey();
  	var Random = random;
  	var Hash = hash.exports;
  	var _ = __1;
  	var $ = preconditions;

  	var ECDSA = function ECDSA (obj) {
  	  if (!(this instanceof ECDSA)) {
  	    return new ECDSA(obj)
  	  }
  	  if (obj) {
  	    this.set(obj);
  	  }
  	};

  	ECDSA.prototype.set = function (obj) {
  	  this.hashbuf = obj.hashbuf || this.hashbuf;
  	  this.endian = obj.endian || this.endian; // the endianness of hashbuf
  	  this.privkey = obj.privkey || this.privkey;
  	  this.pubkey = obj.pubkey || (this.privkey ? this.privkey.publicKey : this.pubkey);
  	  this.sig = obj.sig || this.sig;
  	  this.k = obj.k || this.k;
  	  this.verified = obj.verified || this.verified;
  	  return this
  	};

  	ECDSA.prototype.privkey2pubkey = function () {
  	  this.pubkey = this.privkey.toPublicKey();
  	};

  	ECDSA.prototype.calci = function () {
  	  for (var i = 0; i < 4; i++) {
  	    this.sig.i = i;
  	    var Qprime;
  	    try {
  	      Qprime = this.toPublicKey();
  	    } catch (e) {
  	      console.error(e);
  	      continue
  	    }

  	    if (Qprime.point.eq(this.pubkey.point)) {
  	      this.sig.compressed = this.pubkey.compressed;
  	      return this
  	    }
  	  }

  	  this.sig.i = undefined;
  	  throw new Error('Unable to find valid recovery factor')
  	};

  	ECDSA.fromString = function (str) {
  	  var obj = JSON.parse(str);
  	  return new ECDSA(obj)
  	};

  	ECDSA.prototype.randomK = function () {
  	  var N = Point.getN();
  	  var k;
  	  do {
  	    k = BN.fromBuffer(Random.getRandomBuffer(32));
  	  } while (!(k.lt(N) && k.gt(BN.Zero)))
  	  this.k = k;
  	  return this
  	};

  	// https://tools.ietf.org/html/rfc6979#section-3.2
  	ECDSA.prototype.deterministicK = function (badrs) {
  	  // if r or s were invalid when this function was used in signing,
  	  // we do not want to actually compute r, s here for efficiency, so,
  	  // we can increment badrs. explained at end of RFC 6979 section 3.2
  	  if (_.isUndefined(badrs)) {
  	    badrs = 0;
  	  }
  	  var v = Buffer$1.alloc(32);
  	  v.fill(0x01);
  	  var k = Buffer$1.alloc(32);
  	  k.fill(0x00);
  	  var x = this.privkey.bn.toBuffer({
  	    size: 32
  	  });
  	  var hashbuf = this.endian === 'little' ? Buffer$1.from(this.hashbuf).reverse() : this.hashbuf;
  	  k = Hash.sha256hmac(Buffer$1.concat([v, Buffer$1.from([0x00]), x, hashbuf]), k);
  	  v = Hash.sha256hmac(v, k);
  	  k = Hash.sha256hmac(Buffer$1.concat([v, Buffer$1.from([0x01]), x, hashbuf]), k);
  	  v = Hash.sha256hmac(v, k);
  	  v = Hash.sha256hmac(v, k);
  	  var T = BN.fromBuffer(v);
  	  var N = Point.getN();

  	  // also explained in 3.2, we must ensure T is in the proper range (0, N)
  	  for (var i = 0; i < badrs || !(T.lt(N) && T.gt(BN.Zero)); i++) {
  	    k = Hash.sha256hmac(Buffer$1.concat([v, Buffer$1.from([0x00])]), k);
  	    v = Hash.sha256hmac(v, k);
  	    v = Hash.sha256hmac(v, k);
  	    T = BN.fromBuffer(v);
  	  }

  	  this.k = T;
  	  return this
  	};

  	// Information about public key recovery:
  	// https://bitcointalk.org/index.php?topic=6430.0
  	// http://stackoverflow.com/questions/19665491/how-do-i-get-an-ecdsa-public-key-from-just-a-bitcoin-signature-sec1-4-1-6-k
  	ECDSA.prototype.toPublicKey = function () {
  	  var i = this.sig.i;
  	  $.checkArgument(i === 0 || i === 1 || i === 2 || i === 3, new Error('i must be equal to 0, 1, 2, or 3'));

  	  var e = BN.fromBuffer(this.hashbuf);
  	  var r = this.sig.r;
  	  var s = this.sig.s;

  	  // A set LSB signifies that the y-coordinate is odd
  	  var isYOdd = i & 1;

  	  // The more significant bit specifies whether we should use the
  	  // first or second candidate key.
  	  var isSecondKey = i >> 1;

  	  var n = Point.getN();
  	  var G = Point.getG();

  	  // 1.1 Let x = r + jn
  	  var x = isSecondKey ? r.add(n) : r;
  	  var R = Point.fromX(isYOdd, x);

  	  // 1.4 Check that nR is at infinity
  	  var nR = R.mul(n);

  	  if (!nR.isInfinity()) {
  	    throw new Error('nR is not a valid curve point')
  	  }

  	  // Compute -e from e
  	  var eNeg = e.neg().umod(n);

  	  // 1.6.1 Compute Q = r^-1 (sR - eG)
  	  // Q = r^-1 (sR + -eG)
  	  var rInv = r.invm(n);

  	  // var Q = R.multiplyTwo(s, G, eNeg).mul(rInv);
  	  var Q = R.mul(s).add(G.mul(eNeg)).mul(rInv);

  	  var pubkey = PublicKey.fromPoint(Q, this.sig.compressed);

  	  return pubkey
  	};

  	ECDSA.prototype.sigError = function () {
  	  if (!Buffer$1.isBuffer(this.hashbuf) || this.hashbuf.length !== 32) {
  	    return 'hashbuf must be a 32 byte buffer'
  	  }

  	  var r = this.sig.r;
  	  var s = this.sig.s;
  	  if (!(r.gt(BN.Zero) && r.lt(Point.getN())) || !(s.gt(BN.Zero) && s.lt(Point.getN()))) {
  	    return 'r and s not in range'
  	  }

  	  var e = BN.fromBuffer(this.hashbuf, this.endian ? {
  	    endian: this.endian
  	  } : undefined);
  	  var n = Point.getN();
  	  var sinv = s.invm(n);
  	  var u1 = sinv.mul(e).umod(n);
  	  var u2 = sinv.mul(r).umod(n);

  	  var p = Point.getG().mulAdd(u1, this.pubkey.point, u2);
  	  if (p.isInfinity()) {
  	    return 'p is infinity'
  	  }

  	  if (p.getX().umod(n).cmp(r) !== 0) {
  	    return 'Invalid signature'
  	  } else {
  	    return false
  	  }
  	};

  	ECDSA.toLowS = function (s) {
  	  // enforce low s
  	  // see BIP 62, "low S values in signatures"
  	  if (s.gt(BN.fromBuffer(Buffer$1.from('7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0', 'hex')))) {
  	    s = Point.getN().sub(s);
  	  }
  	  return s
  	};

  	ECDSA.prototype._findSignature = function (d, e) {
  	  var N = Point.getN();
  	  var G = Point.getG();
  	  // try different values of k until r, s are valid
  	  var badrs = 0;
  	  var k, Q, r, s;
  	  do {
  	    if (!this.k || badrs > 0) {
  	      this.deterministicK(badrs);
  	    }
  	    badrs++;
  	    k = this.k;
  	    Q = G.mul(k);
  	    r = new BN(1).mul(Q.x.umod(N));
  	    s = k.invm(N).mul(e.add(d.mul(r))).umod(N);
  	  } while (r.cmp(BN.Zero) <= 0 || s.cmp(BN.Zero) <= 0)

  	  s = ECDSA.toLowS(s);
  	  return {
  	    s: s,
  	    r: r
  	  }
  	};

  	ECDSA.prototype.sign = function () {
  	  var hashbuf = this.hashbuf;
  	  var privkey = this.privkey;
  	  var d = privkey.bn;

  	  $.checkState(hashbuf && privkey && d, new Error('invalid parameters'));
  	  $.checkState(Buffer$1.isBuffer(hashbuf) && hashbuf.length === 32, new Error('hashbuf must be a 32 byte buffer'));

  	  var e = BN.fromBuffer(hashbuf, this.endian ? {
  	    endian: this.endian
  	  } : undefined);

  	  var obj = this._findSignature(d, e);
  	  obj.compressed = this.pubkey.compressed;

  	  this.sig = new Signature(obj);
  	  return this
  	};

  	ECDSA.prototype.signRandomK = function () {
  	  this.randomK();
  	  return this.sign()
  	};

  	ECDSA.prototype.toString = function () {
  	  var obj = {};
  	  if (this.hashbuf) {
  	    obj.hashbuf = this.hashbuf.toString('hex');
  	  }
  	  if (this.privkey) {
  	    obj.privkey = this.privkey.toString();
  	  }
  	  if (this.pubkey) {
  	    obj.pubkey = this.pubkey.toString();
  	  }
  	  if (this.sig) {
  	    obj.sig = this.sig.toString();
  	  }
  	  if (this.k) {
  	    obj.k = this.k.toString();
  	  }
  	  return JSON.stringify(obj)
  	};

  	ECDSA.prototype.verify = function () {
  	  if (!this.sigError()) {
  	    this.verified = true;
  	  } else {
  	    this.verified = false;
  	  }
  	  return this
  	};

  	ECDSA.sign = function (hashbuf, privkey, endian) {
  	  return ECDSA().set({
  	    hashbuf: hashbuf,
  	    endian: endian,
  	    privkey: privkey
  	  }).sign().sig
  	};

  	ECDSA.signWithCalcI = function (hashbuf, privkey, endian) {
  	  return ECDSA().set({
  	    hashbuf: hashbuf,
  	    endian: endian,
  	    privkey: privkey
  	  }).sign().calci().sig
  	};

  	ECDSA.signRandomK = function (hashbuf, privkey, endian) {
  	  return ECDSA().set({
  	    hashbuf: hashbuf,
  	    endian: endian,
  	    privkey: privkey
  	  }).signRandomK().sig
  	};

  	ECDSA.verify = function (hashbuf, sig, pubkey, endian) {
  	  return ECDSA().set({
  	    hashbuf: hashbuf,
  	    endian: endian,
  	    sig: sig,
  	    pubkey: pubkey
  	  }).verify().verified
  	};

  	ecdsa = ECDSA;
  	return ecdsa;
  }

  var block$1 = {exports: {}};

  var _$2 = __1;
  var BN$2 = bn$1;
  var BufferReader$3 = bufferreader;
  var BufferWriter$3 = bufferwriter;
  var Hash$2 = hash.exports;
  var $$2 = preconditions;

  var GENESIS_BITS = 0x1d00ffff;

  /**
   * Instantiate a BlockHeader from a Buffer, JSON object, or Object with
   * the properties of the BlockHeader
   *
   * @param {*} - A Buffer, JSON string, or Object
   * @returns {BlockHeader} - An instance of block header
   * @constructor
   */
  var BlockHeader$2 = function BlockHeader (arg) {
    if (!(this instanceof BlockHeader)) {
      return new BlockHeader(arg)
    }
    var info = BlockHeader._from(arg);
    this.version = info.version;
    this.prevHash = info.prevHash;
    this.merkleRoot = info.merkleRoot;
    this.time = info.time;
    this.timestamp = info.time;
    this.bits = info.bits;
    this.nonce = info.nonce;

    if (info.hash) {
      $$2.checkState(
        this.hash === info.hash,
        'Argument object hash property does not match block hash.'
      );
    }

    return this
  };

  /**
   * @param {*} - A Buffer, JSON string or Object
   * @returns {Object} - An object representing block header data
   * @throws {TypeError} - If the argument was not recognized
   * @private
   */
  BlockHeader$2._from = function _from (arg) {
    var info = {};
    if (Buffer$1.isBuffer(arg)) {
      info = BlockHeader$2._fromBufferReader(BufferReader$3(arg));
    } else if (_$2.isObject(arg)) {
      info = BlockHeader$2._fromObject(arg);
    } else {
      throw new TypeError('Unrecognized argument for BlockHeader')
    }
    return info
  };

  /**
   * @param {Object} - A JSON string
   * @returns {Object} - An object representing block header data
   * @private
   */
  BlockHeader$2._fromObject = function _fromObject (data) {
    $$2.checkArgument(data, 'data is required');
    var prevHash = data.prevHash;
    var merkleRoot = data.merkleRoot;
    if (_$2.isString(data.prevHash)) {
      prevHash = Buffer$1.from(data.prevHash, 'hex').reverse();
    }
    if (_$2.isString(data.merkleRoot)) {
      merkleRoot = Buffer$1.from(data.merkleRoot, 'hex').reverse();
    }
    var info = {
      hash: data.hash,
      version: data.version,
      prevHash: prevHash,
      merkleRoot: merkleRoot,
      time: data.time,
      timestamp: data.time,
      bits: data.bits,
      nonce: data.nonce
    };
    return info
  };

  /**
   * @param {Object} - A plain JavaScript object
   * @returns {BlockHeader} - An instance of block header
   */
  BlockHeader$2.fromObject = function fromObject (obj) {
    var info = BlockHeader$2._fromObject(obj);
    return new BlockHeader$2(info)
  };

  /**
   * @param {Binary} - Raw block binary data or buffer
   * @returns {BlockHeader} - An instance of block header
   */
  BlockHeader$2.fromRawBlock = function fromRawBlock (data) {
    if (!Buffer$1.isBuffer(data)) {
      data = Buffer$1.from(data, 'binary');
    }
    var br = BufferReader$3(data);
    br.pos = BlockHeader$2.Constants.START_OF_HEADER;
    var info = BlockHeader$2._fromBufferReader(br);
    return new BlockHeader$2(info)
  };

  /**
   * @param {Buffer} - A buffer of the block header
   * @returns {BlockHeader} - An instance of block header
   */
  BlockHeader$2.fromBuffer = function fromBuffer (buf) {
    var info = BlockHeader$2._fromBufferReader(BufferReader$3(buf));
    return new BlockHeader$2(info)
  };

  /**
   * @param {string} - A hex encoded buffer of the block header
   * @returns {BlockHeader} - An instance of block header
   */
  BlockHeader$2.fromString = function fromString (str) {
    var buf = Buffer$1.from(str, 'hex');
    return BlockHeader$2.fromBuffer(buf)
  };

  /**
   * @param {BufferReader} - A BufferReader of the block header
   * @returns {Object} - An object representing block header data
   * @private
   */
  BlockHeader$2._fromBufferReader = function _fromBufferReader (br) {
    var info = {};
    info.version = br.readInt32LE();
    info.prevHash = br.read(32);
    info.merkleRoot = br.read(32);
    info.time = br.readUInt32LE();
    info.bits = br.readUInt32LE();
    info.nonce = br.readUInt32LE();
    return info
  };

  /**
   * @param {BufferReader} - A BufferReader of the block header
   * @returns {BlockHeader} - An instance of block header
   */
  BlockHeader$2.fromBufferReader = function fromBufferReader (br) {
    var info = BlockHeader$2._fromBufferReader(br);
    return new BlockHeader$2(info)
  };

  /**
   * @returns {Object} - A plain object of the BlockHeader
   */
  BlockHeader$2.prototype.toObject = BlockHeader$2.prototype.toJSON = function toObject () {
    return {
      hash: this.hash,
      version: this.version,
      prevHash: Buffer$1.from(this.prevHash).reverse().toString('hex'),
      merkleRoot: Buffer$1.from(this.merkleRoot).reverse().toString('hex'),
      time: this.time,
      bits: this.bits,
      nonce: this.nonce
    }
  };

  /**
   * @returns {Buffer} - A Buffer of the BlockHeader
   */
  BlockHeader$2.prototype.toBuffer = function toBuffer () {
    return this.toBufferWriter().concat()
  };

  /**
   * @returns {string} - A hex encoded string of the BlockHeader
   */
  BlockHeader$2.prototype.toString = function toString () {
    return this.toBuffer().toString('hex')
  };

  /**
   * @param {BufferWriter} - An existing instance BufferWriter
   * @returns {BufferWriter} - An instance of BufferWriter representation of the BlockHeader
   */
  BlockHeader$2.prototype.toBufferWriter = function toBufferWriter (bw) {
    if (!bw) {
      bw = new BufferWriter$3();
    }
    bw.writeInt32LE(this.version);
    bw.write(this.prevHash);
    bw.write(this.merkleRoot);
    bw.writeUInt32LE(this.time);
    bw.writeUInt32LE(this.bits);
    bw.writeUInt32LE(this.nonce);
    return bw
  };

  /**
   * Returns the target difficulty for this block
   * @param {Number} bits
   * @returns {BN} An instance of BN with the decoded difficulty bits
   */
  BlockHeader$2.prototype.getTargetDifficulty = function getTargetDifficulty (bits) {
    bits = bits || this.bits;

    var target = new BN$2(bits & 0xffffff);
    var mov = 8 * ((bits >>> 24) - 3);
    while (mov-- > 0) {
      target = target.mul(new BN$2(2));
    }
    return target
  };

  /**
   * @link https://en.bitcoin.it/wiki/Difficulty
   * @return {Number}
   */
  BlockHeader$2.prototype.getDifficulty = function getDifficulty () {
    var difficulty1TargetBN = this.getTargetDifficulty(GENESIS_BITS).mul(new BN$2(Math.pow(10, 8)));
    var currentTargetBN = this.getTargetDifficulty();

    var difficultyString = difficulty1TargetBN.div(currentTargetBN).toString(10);
    var decimalPos = difficultyString.length - 8;
    difficultyString = difficultyString.slice(0, decimalPos) + '.' + difficultyString.slice(decimalPos);

    return parseFloat(difficultyString)
  };

  /**
   * @returns {Buffer} - The little endian hash buffer of the header
   */
  BlockHeader$2.prototype._getHash = function hash () {
    var buf = this.toBuffer();
    return Hash$2.sha256sha256(buf)
  };

  var idProperty$1 = {
    configurable: false,
    enumerable: true,
    /**
     * @returns {string} - The big endian hash buffer of the header
     */
    get: function () {
      if (!this._id) {
        this._id = BufferReader$3(this._getHash()).readReverse().toString('hex');
      }
      return this._id
    },
    set: _$2.noop
  };
  Object.defineProperty(BlockHeader$2.prototype, 'id', idProperty$1);
  Object.defineProperty(BlockHeader$2.prototype, 'hash', idProperty$1);

  /**
   * @returns {Boolean} - If timestamp is not too far in the future
   */
  BlockHeader$2.prototype.validTimestamp = function validTimestamp () {
    var currentTime = Math.round(new Date().getTime() / 1000);
    if (this.time > currentTime + BlockHeader$2.Constants.MAX_TIME_OFFSET) {
      return false
    }
    return true
  };

  /**
   * @returns {Boolean} - If the proof-of-work hash satisfies the target difficulty
   */
  BlockHeader$2.prototype.validProofOfWork = function validProofOfWork () {
    var pow = new BN$2(this.id, 'hex');
    var target = this.getTargetDifficulty();

    if (pow.cmp(target) > 0) {
      return false
    }
    return true
  };

  /**
   * @returns {string} - A string formatted for the console
   */
  BlockHeader$2.prototype.inspect = function inspect () {
    return '<BlockHeader ' + this.id + '>'
  };

  BlockHeader$2.Constants = {
    START_OF_HEADER: 8, // Start buffer position in raw block data
    MAX_TIME_OFFSET: 2 * 60 * 60, // The max a timestamp can be in the future
    LARGEST_HASH: new BN$2('10000000000000000000000000000000000000000000000000000000000000000', 'hex')
  };

  var blockheader = BlockHeader$2;

  var _$1 = __1;
  var BlockHeader$1 = blockheader;
  var BN$1 = bn$1;
  var BufferReader$2 = bufferreader;
  var BufferWriter$2 = bufferwriter;
  var Hash$1 = hash.exports;
  var Transaction$1 = requireTransaction();
  var $$1 = preconditions;

  /**
   * Instantiate a Block from a Buffer, JSON object, or Object with
   * the properties of the Block
   *
   * @param {*} - A Buffer, JSON string, or Object
   * @returns {Block}
   * @constructor
   */
  function Block (arg) {
    if (!(this instanceof Block)) {
      return new Block(arg)
    }
    _$1.extend(this, Block._from(arg));
    return this
  }

  Block.MAX_BLOCK_SIZE = 128000000;

  /**
   * @param {*} - A Buffer, JSON string or Object
   * @returns {Object} - An object representing block data
   * @throws {TypeError} - If the argument was not recognized
   * @private
   */
  Block._from = function _from (arg) {
    var info = {};
    if (Buffer$1.isBuffer(arg)) {
      info = Block._fromBufferReader(BufferReader$2(arg));
    } else if (_$1.isObject(arg)) {
      info = Block._fromObject(arg);
    } else {
      throw new TypeError('Unrecognized argument for Block')
    }
    return info
  };

  /**
   * @param {Object} - A plain JavaScript object
   * @returns {Object} - An object representing block data
   * @private
   */
  Block._fromObject = function _fromObject (data) {
    var transactions = [];
    data.transactions.forEach(function (tx) {
      if (tx instanceof Transaction$1) {
        transactions.push(tx);
      } else {
        transactions.push(Transaction$1().fromObject(tx));
      }
    });
    var info = {
      header: BlockHeader$1.fromObject(data.header),
      transactions: transactions
    };
    return info
  };

  /**
   * @param {Object} - A plain JavaScript object
   * @returns {Block} - An instance of block
   */
  Block.fromObject = function fromObject (obj) {
    var info = Block._fromObject(obj);
    return new Block(info)
  };

  /**
   * @param {BufferReader} - Block data
   * @returns {Object} - An object representing the block data
   * @private
   */
  Block._fromBufferReader = function _fromBufferReader (br) {
    var info = {};
    $$1.checkState(!br.finished(), 'No block data received');
    info.header = BlockHeader$1.fromBufferReader(br);
    var transactions = br.readVarintNum();
    info.transactions = [];
    for (var i = 0; i < transactions; i++) {
      info.transactions.push(Transaction$1().fromBufferReader(br));
    }
    return info
  };

  /**
   * @param {BufferReader} - A buffer reader of the block
   * @returns {Block} - An instance of block
   */
  Block.fromBufferReader = function fromBufferReader (br) {
    $$1.checkArgument(br, 'br is required');
    var info = Block._fromBufferReader(br);
    return new Block(info)
  };

  /**
   * @param {Buffer} - A buffer of the block
   * @returns {Block} - An instance of block
   */
  Block.fromBuffer = function fromBuffer (buf) {
    return Block.fromBufferReader(new BufferReader$2(buf))
  };

  /**
   * @param {string} - str - A hex encoded string of the block
   * @returns {Block} - A hex encoded string of the block
   */
  Block.fromString = function fromString (str) {
    var buf = Buffer$1.from(str, 'hex');
    return Block.fromBuffer(buf)
  };

  /**
   * @param {Binary} - Raw block binary data or buffer
   * @returns {Block} - An instance of block
   */
  Block.fromRawBlock = function fromRawBlock (data) {
    if (!Buffer$1.isBuffer(data)) {
      data = Buffer$1.from(data, 'binary');
    }
    var br = BufferReader$2(data);
    br.pos = Block.Values.START_OF_BLOCK;
    var info = Block._fromBufferReader(br);
    return new Block(info)
  };

  /**
   * @returns {Object} - A plain object with the block properties
   */
  Block.prototype.toObject = Block.prototype.toJSON = function toObject () {
    var transactions = [];
    this.transactions.forEach(function (tx) {
      transactions.push(tx.toObject());
    });
    return {
      header: this.header.toObject(),
      transactions: transactions
    }
  };

  /**
   * @returns {Buffer} - A buffer of the block
   */
  Block.prototype.toBuffer = function toBuffer () {
    return this.toBufferWriter().concat()
  };

  /**
   * @returns {string} - A hex encoded string of the block
   */
  Block.prototype.toString = function toString () {
    return this.toBuffer().toString('hex')
  };

  /**
   * @param {BufferWriter} - An existing instance of BufferWriter
   * @returns {BufferWriter} - An instance of BufferWriter representation of the Block
   */
  Block.prototype.toBufferWriter = function toBufferWriter (bw) {
    if (!bw) {
      bw = new BufferWriter$2();
    }
    bw.write(this.header.toBuffer());
    bw.writeVarintNum(this.transactions.length);
    for (var i = 0; i < this.transactions.length; i++) {
      this.transactions[i].toBufferWriter(bw);
    }
    return bw
  };

  /**
   * Will iterate through each transaction and return an array of hashes
   * @returns {Array} - An array with transaction hashes
   */
  Block.prototype.getTransactionHashes = function getTransactionHashes () {
    var hashes = [];
    if (this.transactions.length === 0) {
      return [Block.Values.NULL_HASH]
    }
    for (var t = 0; t < this.transactions.length; t++) {
      hashes.push(this.transactions[t]._getHash());
    }
    return hashes
  };

  /**
   * Will build a merkle tree of all the transactions, ultimately arriving at
   * a single point, the merkle root.
   * @link https://en.bitcoin.it/wiki/Protocol_specification#Merkle_Trees
   * @returns {Array} - An array with each level of the tree after the other.
   */
  Block.prototype.getMerkleTree = function getMerkleTree () {
    var tree = this.getTransactionHashes();

    var j = 0;
    for (var size = this.transactions.length; size > 1; size = Math.floor((size + 1) / 2)) {
      for (var i = 0; i < size; i += 2) {
        var i2 = Math.min(i + 1, size - 1);
        var buf = Buffer$1.concat([tree[j + i], tree[j + i2]]);
        tree.push(Hash$1.sha256sha256(buf));
      }
      j += size;
    }

    return tree
  };

  /**
   * Calculates the merkleRoot from the transactions.
   * @returns {Buffer} - A buffer of the merkle root hash
   */
  Block.prototype.getMerkleRoot = function getMerkleRoot () {
    var tree = this.getMerkleTree();
    return tree[tree.length - 1]
  };

  /**
   * Verifies that the transactions in the block match the header merkle root
   * @returns {Boolean} - If the merkle roots match
   */
  Block.prototype.validMerkleRoot = function validMerkleRoot () {
    var h = new BN$1(this.header.merkleRoot.toString('hex'), 'hex');
    var c = new BN$1(this.getMerkleRoot().toString('hex'), 'hex');

    if (h.cmp(c) !== 0) {
      return false
    }

    return true
  };

  /**
   * @returns {Buffer} - The little endian hash buffer of the header
   */
  Block.prototype._getHash = function () {
    return this.header._getHash()
  };

  var idProperty = {
    configurable: false,
    enumerable: true,
    /**
     * @returns {string} - The big endian hash buffer of the header
     */
    get: function () {
      if (!this._id) {
        this._id = this.header.id;
      }
      return this._id
    },
    set: _$1.noop
  };
  Object.defineProperty(Block.prototype, 'id', idProperty);
  Object.defineProperty(Block.prototype, 'hash', idProperty);

  /**
   * @returns {string} - A string formatted for the console
   */
  Block.prototype.inspect = function inspect () {
    return '<Block ' + this.id + '>'
  };

  Block.Values = {
    START_OF_BLOCK: 8, // Start of block in raw block data
    NULL_HASH: Buffer$1.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex')
  };

  var block = Block;

  var _ = __1;
  var BlockHeader = blockheader;
  var BufferReader$1 = bufferreader;
  var BufferWriter$1 = bufferwriter;
  var Hash = hash.exports;
  var Transaction = requireTransaction();
  var errors = errors$2.exports;
  var $ = preconditions;

  /**
   * Instantiate a MerkleBlock from a Buffer, JSON object, or Object with
   * the properties of the Block
   *
   * @param {*} - A Buffer, JSON string, or Object representing a MerkleBlock
   * @returns {MerkleBlock}
   * @constructor
   */
  function MerkleBlock (arg) {
    if (!(this instanceof MerkleBlock)) {
      return new MerkleBlock(arg)
    }

    var info = {};
    if (Buffer$1.isBuffer(arg)) {
      info = MerkleBlock._fromBufferReader(BufferReader$1(arg));
    } else if (_.isObject(arg)) {
      var header;
      if (arg.header instanceof BlockHeader) {
        header = arg.header;
      } else {
        header = BlockHeader.fromObject(arg.header);
      }
      info = {
        /**
         * @name MerkleBlock#header
         * @type {BlockHeader}
         */
        header: header,
        /**
         * @name MerkleBlock#numTransactions
         * @type {Number}
         */
        numTransactions: arg.numTransactions,
        /**
         * @name MerkleBlock#hashes
         * @type {String[]}
         */
        hashes: arg.hashes,
        /**
         * @name MerkleBlock#flags
         * @type {Number[]}
         */
        flags: arg.flags
      };
    } else {
      throw new TypeError('Unrecognized argument for MerkleBlock')
    }
    _.extend(this, info);
    this._flagBitsUsed = 0;
    this._hashesUsed = 0;

    return this
  }

  /**
   * @param {Buffer} - MerkleBlock data in a Buffer object
   * @returns {MerkleBlock} - A MerkleBlock object
   */
  MerkleBlock.fromBuffer = function fromBuffer (buf) {
    return MerkleBlock.fromBufferReader(BufferReader$1(buf))
  };

  /**
   * @param {BufferReader} - MerkleBlock data in a BufferReader object
   * @returns {MerkleBlock} - A MerkleBlock object
   */
  MerkleBlock.fromBufferReader = function fromBufferReader (br) {
    return new MerkleBlock(MerkleBlock._fromBufferReader(br))
  };

  /**
   * @returns {Buffer} - A buffer of the block
   */
  MerkleBlock.prototype.toBuffer = function toBuffer () {
    return this.toBufferWriter().concat()
  };

  /**
   * @param {BufferWriter} - An existing instance of BufferWriter
   * @returns {BufferWriter} - An instance of BufferWriter representation of the MerkleBlock
   */
  MerkleBlock.prototype.toBufferWriter = function toBufferWriter (bw) {
    if (!bw) {
      bw = new BufferWriter$1();
    }
    bw.write(this.header.toBuffer());
    bw.writeUInt32LE(this.numTransactions);
    bw.writeVarintNum(this.hashes.length);
    for (var i = 0; i < this.hashes.length; i++) {
      bw.write(Buffer$1.from(this.hashes[i], 'hex'));
    }
    bw.writeVarintNum(this.flags.length);
    for (i = 0; i < this.flags.length; i++) {
      bw.writeUInt8(this.flags[i]);
    }
    return bw
  };

  /**
   * @returns {Object} - A plain object with the MerkleBlock properties
   */
  MerkleBlock.prototype.toObject = MerkleBlock.prototype.toJSON = function toObject () {
    return {
      header: this.header.toObject(),
      numTransactions: this.numTransactions,
      hashes: this.hashes,
      flags: this.flags
    }
  };

  /**
   * Verify that the MerkleBlock is valid
   * @returns {Boolean} - True/False whether this MerkleBlock is Valid
   */
  MerkleBlock.prototype.validMerkleTree = function validMerkleTree () {
    $.checkState(_.isArray(this.flags), 'MerkleBlock flags is not an array');
    $.checkState(_.isArray(this.hashes), 'MerkleBlock hashes is not an array');

    // Can't have more hashes than numTransactions
    if (this.hashes.length > this.numTransactions) {
      return false
    }

    // Can't have more flag bits than num hashes
    if (this.flags.length * 8 < this.hashes.length) {
      return false
    }

    var height = this._calcTreeHeight();
    var opts = { hashesUsed: 0, flagBitsUsed: 0 };
    var root = this._traverseMerkleTree(height, 0, opts);
    if (opts.hashesUsed !== this.hashes.length) {
      return false
    }
    return root.equals(this.header.merkleRoot)
  };

  /**
   * WARNING: This method is deprecated. Use filteredTxsHash instead.
   *
   * Return a list of all the txs hash that match the filter
   * @returns {Array} - txs hash that match the filter
   */
  MerkleBlock.prototype.filterdTxsHash = function filterdTxsHash () {
    throw new Error('filterdTxsHash has been deprecated. use filteredTxsHash.')
  };

  /**
   * Return a list of all the txs hash that match the filter
   * @returns {Array} - txs hash that match the filter
   */
  MerkleBlock.prototype.filteredTxsHash = function filteredTxsHash () {
    $.checkState(_.isArray(this.flags), 'MerkleBlock flags is not an array');
    $.checkState(_.isArray(this.hashes), 'MerkleBlock hashes is not an array');

    // Can't have more hashes than numTransactions
    if (this.hashes.length > this.numTransactions) {
      throw new errors.MerkleBlock.InvalidMerkleTree()
    }

    // Can't have more flag bits than num hashes
    if (this.flags.length * 8 < this.hashes.length) {
      throw new errors.MerkleBlock.InvalidMerkleTree()
    }

    // If there is only one hash the filter do not match any txs in the block
    if (this.hashes.length === 1) {
      return []
    }
    var height = this._calcTreeHeight();
    var opts = { hashesUsed: 0, flagBitsUsed: 0 };
    var txs = this._traverseMerkleTree(height, 0, opts, true);
    if (opts.hashesUsed !== this.hashes.length) {
      throw new errors.MerkleBlock.InvalidMerkleTree()
    }
    return txs
  };

  /**
   * Traverse a the tree in this MerkleBlock, validating it along the way
   * Modeled after Bitcoin Core merkleblock.cpp TraverseAndExtract()
   * @param {Number} - depth - Current height
   * @param {Number} - pos - Current position in the tree
   * @param {Object} - opts - Object with values that need to be mutated throughout the traversal
   * @param {Boolean} - checkForTxs - if true return opts.txs else return the Merkle Hash
   * @param {Number} - opts.flagBitsUsed - Number of flag bits used, should start at 0
   * @param {Number} - opts.hashesUsed - Number of hashes used, should start at 0
   * @param {Array} - opts.txs - Will finish populated by transactions found during traversal that match the filter
   * @returns {Buffer|null} - Buffer containing the Merkle Hash for that height
   * @returns {Array} - transactions found during traversal that match the filter
   * @private
   */
  MerkleBlock.prototype._traverseMerkleTree = function traverseMerkleTree (depth, pos, opts, checkForTxs) {
    opts = opts || {};
    opts.txs = opts.txs || [];
    opts.flagBitsUsed = opts.flagBitsUsed || 0;
    opts.hashesUsed = opts.hashesUsed || 0;
    checkForTxs = checkForTxs || false;

    if (opts.flagBitsUsed > this.flags.length * 8) {
      return null
    }
    var isParentOfMatch = (this.flags[opts.flagBitsUsed >> 3] >>> (opts.flagBitsUsed++ & 7)) & 1;
    if (depth === 0 || !isParentOfMatch) {
      if (opts.hashesUsed >= this.hashes.length) {
        return null
      }
      var hash = this.hashes[opts.hashesUsed++];
      if (depth === 0 && isParentOfMatch) {
        opts.txs.push(hash);
      }
      return Buffer$1.from(hash, 'hex')
    } else {
      var left = this._traverseMerkleTree(depth - 1, pos * 2, opts);
      var right = left;
      if (pos * 2 + 1 < this._calcTreeWidth(depth - 1)) {
        right = this._traverseMerkleTree(depth - 1, pos * 2 + 1, opts);
      }
      if (checkForTxs) {
        return opts.txs
      } else {
        return Hash.sha256sha256(Buffer$1.concat([left, right]))
      }
    }
  };

  /** Calculates the width of a merkle tree at a given height.
   *  Modeled after Bitcoin Core merkleblock.h CalcTreeWidth()
   * @param {Number} - Height at which we want the tree width
   * @returns {Number} - Width of the tree at a given height
   * @private
   */
  MerkleBlock.prototype._calcTreeWidth = function calcTreeWidth (height) {
    return (this.numTransactions + (1 << height) - 1) >> height
  };

  /** Calculates the height of the merkle tree in this MerkleBlock
   * @param {Number} - Height at which we want the tree width
   * @returns {Number} - Height of the merkle tree in this MerkleBlock
   * @private
   */
  MerkleBlock.prototype._calcTreeHeight = function calcTreeHeight () {
    var height = 0;
    while (this._calcTreeWidth(height) > 1) {
      height++;
    }
    return height
  };

  /**
   * @param {Transaction|String} - Transaction or Transaction ID Hash
   * @returns {Boolean} - return true/false if this MerkleBlock has the TX or not
   * @private
   */
  MerkleBlock.prototype.hasTransaction = function hasTransaction (tx) {
    $.checkArgument(!_.isUndefined(tx), 'tx cannot be undefined');
    $.checkArgument(tx instanceof Transaction || typeof tx === 'string',
      'Invalid tx given, tx must be a "string" or "Transaction"');

    var hash = tx;
    if (tx instanceof Transaction) {
      // We need to reverse the id hash for the lookup
      hash = Buffer$1.from(tx.id, 'hex').reverse().toString('hex');
    }

    var txs = [];
    var height = this._calcTreeHeight();
    this._traverseMerkleTree(height, 0, { txs: txs });
    return txs.indexOf(hash) !== -1
  };

  /**
   * @param {Buffer} - MerkleBlock data
   * @returns {Object} - An Object representing merkleblock data
   * @private
   */
  MerkleBlock._fromBufferReader = function _fromBufferReader (br) {
    $.checkState(!br.finished(), 'No merkleblock data received');
    var info = {};
    info.header = BlockHeader.fromBufferReader(br);
    info.numTransactions = br.readUInt32LE();
    var numHashes = br.readVarintNum();
    info.hashes = [];
    for (var i = 0; i < numHashes; i++) {
      info.hashes.push(br.read(32).toString('hex'));
    }
    var numFlags = br.readVarintNum();
    info.flags = [];
    for (i = 0; i < numFlags; i++) {
      info.flags.push(br.readUInt8());
    }
    return info
  };

  /**
   * @param {Object} - A plain JavaScript object
   * @returns {Block} - An instance of block
   */
  MerkleBlock.fromObject = function fromObject (obj) {
    return new MerkleBlock(obj)
  };

  var merkleblock = MerkleBlock;

  (function (module) {
  	module.exports = block;

  	module.exports.BlockHeader = blockheader;
  	module.exports.MerkleBlock = merkleblock;
  } (block$1));

  var hdpublickey;
  var hasRequiredHdpublickey;

  function requireHdpublickey () {
  	if (hasRequiredHdpublickey) return hdpublickey;
  	hasRequiredHdpublickey = 1;

  	var _ = __1;
  	var $ = preconditions;

  	var BN = bn$1;
  	var Base58 = base58;
  	var Base58Check = base58check;
  	var Hash = hash.exports;
  	var HDPrivateKey = requireHdprivatekey();
  	var Network = networks_1;
  	var Point = point;
  	var PublicKey = requirePublickey();

  	var bsvErrors = errors$2.exports;
  	var errors = bsvErrors;
  	var hdErrors = bsvErrors.HDPublicKey;
  	var assert = require$$0;

  	var JSUtil = js;

  	/**
  	 * The representation of an hierarchically derived public key.
  	 *
  	 * See https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki
  	 *
  	 * @constructor
  	 * @param {Object|string|Buffer} arg
  	 */
  	function HDPublicKey (arg) {
  	  if (arg instanceof HDPublicKey) {
  	    return arg
  	  }
  	  if (!(this instanceof HDPublicKey)) {
  	    return new HDPublicKey(arg)
  	  }
  	  if (arg) {
  	    if (_.isString(arg) || Buffer$1.isBuffer(arg)) {
  	      var error = HDPublicKey.getSerializedError(arg);
  	      if (!error) {
  	        return this._buildFromSerialized(arg)
  	      } else if (Buffer$1.isBuffer(arg) && !HDPublicKey.getSerializedError(arg.toString())) {
  	        return this._buildFromSerialized(arg.toString())
  	      } else {
  	        if (error instanceof hdErrors.ArgumentIsPrivateExtended) {
  	          return new HDPrivateKey(arg).hdPublicKey
  	        }
  	        throw error
  	      }
  	    } else {
  	      if (_.isObject(arg)) {
  	        if (arg instanceof HDPrivateKey) {
  	          return this._buildFromPrivate(arg)
  	        } else {
  	          return this._buildFromObject(arg)
  	        }
  	      } else {
  	        throw new hdErrors.UnrecognizedArgument(arg)
  	      }
  	    }
  	  } else {
  	    throw new hdErrors.MustSupplyArgument()
  	  }
  	}

  	HDPublicKey.fromHDPrivateKey = function (hdPrivateKey) {
  	  return new HDPublicKey(hdPrivateKey)
  	};

  	/**
  	 * Verifies that a given path is valid.
  	 *
  	 * @param {string|number} arg
  	 * @return {boolean}
  	 */
  	HDPublicKey.isValidPath = function (arg) {
  	  if (_.isString(arg)) {
  	    var indexes = HDPrivateKey._getDerivationIndexes(arg);
  	    return indexes !== null && _.every(indexes, HDPublicKey.isValidPath)
  	  }

  	  if (_.isNumber(arg)) {
  	    return arg >= 0 && arg < HDPublicKey.Hardened
  	  }

  	  return false
  	};

  	/**
  	 * WARNING: This method is deprecated. Use deriveChild instead.
  	 *
  	 *
  	 * Get a derivated child based on a string or number.
  	 *
  	 * If the first argument is a string, it's parsed as the full path of
  	 * derivation. Valid values for this argument include "m" (which returns the
  	 * same public key), "m/0/1/40/2/1000".
  	 *
  	 * Note that hardened keys can't be derived from a public extended key.
  	 *
  	 * If the first argument is a number, the child with that index will be
  	 * derived. See the example usage for clarification.
  	 *
  	 * @example
  	 * ```javascript
  	 * var parent = new HDPublicKey('xpub...');
  	 * var child_0_1_2 = parent.derive(0).derive(1).derive(2);
  	 * var copy_of_child_0_1_2 = parent.derive("m/0/1/2");
  	 * assert(child_0_1_2.xprivkey === copy_of_child_0_1_2);
  	 * ```
  	 *
  	 * @param {string|number} arg
  	 */
  	HDPublicKey.prototype.derive = function () {
  	  throw new Error('derive has been deprecated. use deriveChild or, for the old way, deriveNonCompliantChild.')
  	};

  	/**
  	 * WARNING: This method will not be officially supported until v1.0.0.
  	 *
  	 *
  	 * Get a derivated child based on a string or number.
  	 *
  	 * If the first argument is a string, it's parsed as the full path of
  	 * derivation. Valid values for this argument include "m" (which returns the
  	 * same public key), "m/0/1/40/2/1000".
  	 *
  	 * Note that hardened keys can't be derived from a public extended key.
  	 *
  	 * If the first argument is a number, the child with that index will be
  	 * derived. See the example usage for clarification.
  	 *
  	 * @example
  	 * ```javascript
  	 * var parent = new HDPublicKey('xpub...');
  	 * var child_0_1_2 = parent.deriveChild(0).deriveChild(1).deriveChild(2);
  	 * var copy_of_child_0_1_2 = parent.deriveChild("m/0/1/2");
  	 * assert(child_0_1_2.xprivkey === copy_of_child_0_1_2);
  	 * ```
  	 *
  	 * @param {string|number} arg
  	 */
  	HDPublicKey.prototype.deriveChild = function (arg, hardened) {
  	  if (_.isNumber(arg)) {
  	    return this._deriveWithNumber(arg, hardened)
  	  } else if (_.isString(arg)) {
  	    return this._deriveFromString(arg)
  	  } else {
  	    throw new hdErrors.InvalidDerivationArgument(arg)
  	  }
  	};

  	HDPublicKey.prototype._deriveWithNumber = function (index, hardened) {
  	  if (index >= HDPublicKey.Hardened || hardened) {
  	    throw new hdErrors.InvalidIndexCantDeriveHardened()
  	  }
  	  if (index < 0) {
  	    throw new hdErrors.InvalidPath(index)
  	  }

  	  var indexBuffer = JSUtil.integerAsBuffer(index);
  	  var data = Buffer$1.concat([this.publicKey.toBuffer(), indexBuffer]);
  	  var hash = Hash.sha512hmac(data, this._buffers.chainCode);
  	  var leftPart = BN.fromBuffer(hash.slice(0, 32), { size: 32 });
  	  var chainCode = hash.slice(32, 64);

  	  var publicKey;
  	  try {
  	    publicKey = PublicKey.fromPoint(Point.getG().mul(leftPart).add(this.publicKey.point));
  	  } catch (e) {
  	    return this._deriveWithNumber(index + 1)
  	  }

  	  var derived = new HDPublicKey({
  	    network: this.network,
  	    depth: this.depth + 1,
  	    parentFingerPrint: this.fingerPrint,
  	    childIndex: index,
  	    chainCode: chainCode,
  	    publicKey: publicKey
  	  });

  	  return derived
  	};

  	HDPublicKey.prototype._deriveFromString = function (path) {
  	  if (_.includes(path, "'")) {
  	    throw new hdErrors.InvalidIndexCantDeriveHardened()
  	  } else if (!HDPublicKey.isValidPath(path)) {
  	    throw new hdErrors.InvalidPath(path)
  	  }

  	  var indexes = HDPrivateKey._getDerivationIndexes(path);
  	  var derived = indexes.reduce(function (prev, index) {
  	    return prev._deriveWithNumber(index)
  	  }, this);

  	  return derived
  	};

  	/**
  	 * Verifies that a given serialized public key in base58 with checksum format
  	 * is valid.
  	 *
  	 * @param {string|Buffer} data - the serialized public key
  	 * @param {string|Network=} network - optional, if present, checks that the
  	 *     network provided matches the network serialized.
  	 * @return {boolean}
  	 */
  	HDPublicKey.isValidSerialized = function (data, network) {
  	  return _.isNull(HDPublicKey.getSerializedError(data, network))
  	};

  	/**
  	 * Checks what's the error that causes the validation of a serialized public key
  	 * in base58 with checksum to fail.
  	 *
  	 * @param {string|Buffer} data - the serialized public key
  	 * @param {string|Network=} network - optional, if present, checks that the
  	 *     network provided matches the network serialized.
  	 * @return {errors|null}
  	 */
  	HDPublicKey.getSerializedError = function (data, network) {
  	  if (!(_.isString(data) || Buffer$1.isBuffer(data))) {
  	    return new hdErrors.UnrecognizedArgument('expected buffer or string')
  	  }
  	  if (!Base58.validCharacters(data)) {
  	    return new errors.InvalidB58Char('(unknown)', data)
  	  }
  	  try {
  	    data = Base58Check.decode(data);
  	  } catch (e) {
  	    return new errors.InvalidB58Checksum(data)
  	  }
  	  if (data.length !== HDPublicKey.DataSize) {
  	    return new hdErrors.InvalidLength(data)
  	  }
  	  if (!_.isUndefined(network)) {
  	    var error = HDPublicKey._validateNetwork(data, network);
  	    if (error) {
  	      return error
  	    }
  	  }
  	  var version = data.readUInt32BE(0);
  	  if (version === Network.livenet.xprivkey || version === Network.testnet.xprivkey) {
  	    return new hdErrors.ArgumentIsPrivateExtended()
  	  }
  	  return null
  	};

  	HDPublicKey._validateNetwork = function (data, networkArg) {
  	  var network = Network.get(networkArg);
  	  if (!network) {
  	    return new errors.InvalidNetworkArgument(networkArg)
  	  }
  	  var version = data.slice(HDPublicKey.VersionStart, HDPublicKey.VersionEnd);
  	  if (version.readUInt32BE(0) !== network.xpubkey) {
  	    return new errors.InvalidNetwork(version)
  	  }
  	  return null
  	};

  	HDPublicKey.prototype._buildFromPrivate = function (arg) {
  	  var args = _.clone(arg._buffers);
  	  var point = Point.getG().mul(BN.fromBuffer(args.privateKey));
  	  args.publicKey = Point.pointToCompressed(point);
  	  args.version = JSUtil.integerAsBuffer(Network.get(args.version.readUInt32BE(0)).xpubkey);
  	  args.privateKey = undefined;
  	  args.checksum = undefined;
  	  args.xprivkey = undefined;
  	  return this._buildFromBuffers(args)
  	};

  	HDPublicKey.prototype._buildFromObject = function (arg) {
  	  // TODO: Type validation
  	  var buffers = {
  	    version: arg.network ? JSUtil.integerAsBuffer(Network.get(arg.network).xpubkey) : arg.version,
  	    depth: _.isNumber(arg.depth) ? Buffer$1.from([arg.depth & 0xff]) : arg.depth,
  	    parentFingerPrint: _.isNumber(arg.parentFingerPrint) ? JSUtil.integerAsBuffer(arg.parentFingerPrint) : arg.parentFingerPrint,
  	    childIndex: _.isNumber(arg.childIndex) ? JSUtil.integerAsBuffer(arg.childIndex) : arg.childIndex,
  	    chainCode: _.isString(arg.chainCode) ? Buffer$1.from(arg.chainCode, 'hex') : arg.chainCode,
  	    publicKey: _.isString(arg.publicKey) ? Buffer$1.from(arg.publicKey, 'hex')
  	      : Buffer$1.isBuffer(arg.publicKey) ? arg.publicKey : arg.publicKey.toBuffer(),
  	    checksum: _.isNumber(arg.checksum) ? JSUtil.integerAsBuffer(arg.checksum) : arg.checksum
  	  };
  	  return this._buildFromBuffers(buffers)
  	};

  	HDPublicKey.prototype._buildFromSerialized = function (arg) {
  	  var decoded = Base58Check.decode(arg);
  	  var buffers = {
  	    version: decoded.slice(HDPublicKey.VersionStart, HDPublicKey.VersionEnd),
  	    depth: decoded.slice(HDPublicKey.DepthStart, HDPublicKey.DepthEnd),
  	    parentFingerPrint: decoded.slice(HDPublicKey.ParentFingerPrintStart,
  	      HDPublicKey.ParentFingerPrintEnd),
  	    childIndex: decoded.slice(HDPublicKey.ChildIndexStart, HDPublicKey.ChildIndexEnd),
  	    chainCode: decoded.slice(HDPublicKey.ChainCodeStart, HDPublicKey.ChainCodeEnd),
  	    publicKey: decoded.slice(HDPublicKey.PublicKeyStart, HDPublicKey.PublicKeyEnd),
  	    checksum: decoded.slice(HDPublicKey.ChecksumStart, HDPublicKey.ChecksumEnd),
  	    xpubkey: arg
  	  };
  	  return this._buildFromBuffers(buffers)
  	};

  	/**
  	 * Receives a object with buffers in all the properties and populates the
  	 * internal structure
  	 *
  	 * @param {Object} arg
  	 * @param {buffer.Buffer} arg.version
  	 * @param {buffer.Buffer} arg.depth
  	 * @param {buffer.Buffer} arg.parentFingerPrint
  	 * @param {buffer.Buffer} arg.childIndex
  	 * @param {buffer.Buffer} arg.chainCode
  	 * @param {buffer.Buffer} arg.publicKey
  	 * @param {buffer.Buffer} arg.checksum
  	 * @param {string=} arg.xpubkey - if set, don't recalculate the base58
  	 *      representation
  	 * @return {HDPublicKey} this
  	 */
  	HDPublicKey.prototype._buildFromBuffers = function (arg) {
  	  HDPublicKey._validateBufferArguments(arg);

  	  JSUtil.defineImmutable(this, {
  	    _buffers: arg
  	  });

  	  var sequence = [
  	    arg.version, arg.depth, arg.parentFingerPrint, arg.childIndex, arg.chainCode,
  	    arg.publicKey
  	  ];
  	  var concat = Buffer$1.concat(sequence);
  	  var checksum = Base58Check.checksum(concat);
  	  if (!arg.checksum || !arg.checksum.length) {
  	    arg.checksum = checksum;
  	  } else {
  	    if (arg.checksum.toString('hex') !== checksum.toString('hex')) {
  	      throw new errors.InvalidB58Checksum(concat, checksum)
  	    }
  	  }
  	  var network = Network.get(arg.version.readUInt32BE(0));

  	  var xpubkey;
  	  xpubkey = Base58Check.encode(Buffer$1.concat(sequence));
  	  arg.xpubkey = Buffer$1.from(xpubkey);

  	  var publicKey = new PublicKey(arg.publicKey, { network: network });
  	  var size = HDPublicKey.ParentFingerPrintSize;
  	  var fingerPrint = Hash.sha256ripemd160(publicKey.toBuffer()).slice(0, size);

  	  JSUtil.defineImmutable(this, {
  	    xpubkey: xpubkey,
  	    network: network,
  	    depth: arg.depth[0],
  	    publicKey: publicKey,
  	    fingerPrint: fingerPrint
  	  });

  	  return this
  	};

  	HDPublicKey._validateBufferArguments = function (arg) {
  	  var checkBuffer = function (name, size) {
  	    var buff = arg[name];
  	    assert(Buffer$1.isBuffer(buff), name + ' argument is not a buffer, it\'s ' + typeof buff);
  	    assert(
  	      buff.length === size,
  	      name + ' has not the expected size: found ' + buff.length + ', expected ' + size
  	    );
  	  };
  	  checkBuffer('version', HDPublicKey.VersionSize);
  	  checkBuffer('depth', HDPublicKey.DepthSize);
  	  checkBuffer('parentFingerPrint', HDPublicKey.ParentFingerPrintSize);
  	  checkBuffer('childIndex', HDPublicKey.ChildIndexSize);
  	  checkBuffer('chainCode', HDPublicKey.ChainCodeSize);
  	  checkBuffer('publicKey', HDPublicKey.PublicKeySize);
  	  if (arg.checksum && arg.checksum.length) {
  	    checkBuffer('checksum', HDPublicKey.CheckSumSize);
  	  }
  	};

  	HDPublicKey.fromString = function (arg) {
  	  $.checkArgument(_.isString(arg), 'No valid string was provided');
  	  return new HDPublicKey(arg)
  	};

  	HDPublicKey.fromObject = function (arg) {
  	  $.checkArgument(_.isObject(arg), 'No valid argument was provided');
  	  return new HDPublicKey(arg)
  	};

  	/**
  	 * Returns the base58 checked representation of the public key
  	 * @return {string} a string starting with "xpub..." in livenet
  	 */
  	HDPublicKey.prototype.toString = function () {
  	  return this.xpubkey
  	};

  	/**
  	 * Returns the console representation of this extended public key.
  	 * @return string
  	 */
  	HDPublicKey.prototype.inspect = function () {
  	  return '<HDPublicKey: ' + this.xpubkey + '>'
  	};

  	/**
  	 * Returns a plain JavaScript object with information to reconstruct a key.
  	 *
  	 * Fields are: <ul>
  	 *  <li> network: 'livenet' or 'testnet'
  	 *  <li> depth: a number from 0 to 255, the depth to the master extended key
  	 *  <li> fingerPrint: a number of 32 bits taken from the hash of the public key
  	 *  <li> fingerPrint: a number of 32 bits taken from the hash of this key's
  	 *  <li>     parent's public key
  	 *  <li> childIndex: index with which this key was derived
  	 *  <li> chainCode: string in hexa encoding used for derivation
  	 *  <li> publicKey: string, hexa encoded, in compressed key format
  	 *  <li> checksum: this._buffers.checksum.readUInt32BE(0),
  	 *  <li> xpubkey: the string with the base58 representation of this extended key
  	 *  <li> checksum: the base58 checksum of xpubkey
  	 * </ul>
  	 */
  	HDPublicKey.prototype.toObject = HDPublicKey.prototype.toJSON = function toObject () {
  	  return {
  	    network: Network.get(this._buffers.version.readUInt32BE(0)).name,
  	    depth: this._buffers.depth[0],
  	    fingerPrint: this.fingerPrint.readUInt32BE(0),
  	    parentFingerPrint: this._buffers.parentFingerPrint.readUInt32BE(0),
  	    childIndex: this._buffers.childIndex.readUInt32BE(0),
  	    chainCode: this._buffers.chainCode.toString('hex'),
  	    publicKey: this.publicKey.toString(),
  	    checksum: this._buffers.checksum.readUInt32BE(0),
  	    xpubkey: this.xpubkey
  	  }
  	};

  	/**
  	 * Create a HDPublicKey from a buffer argument
  	 *
  	 * @param {Buffer} arg
  	 * @return {HDPublicKey}
  	 */
  	HDPublicKey.fromBuffer = function (arg) {
  	  return new HDPublicKey(arg)
  	};

  	/**
  	 * Create a HDPublicKey from a hex string argument
  	 *
  	 * @param {Buffer} arg
  	 * @return {HDPublicKey}
  	 */
  	HDPublicKey.fromHex = function (hex) {
  	  return HDPublicKey.fromBuffer(Buffer$1.from(hex, 'hex'))
  	};

  	/**
  	 * Return a buffer representation of the xpubkey
  	 *
  	 * @return {Buffer}
  	 */
  	HDPublicKey.prototype.toBuffer = function () {
  	  return Buffer$1.from(this._buffers.xpubkey)
  	};

  	/**
  	 * Return a hex string representation of the xpubkey
  	 *
  	 * @return {Buffer}
  	 */
  	HDPublicKey.prototype.toHex = function () {
  	  return this.toBuffer().toString('hex')
  	};

  	HDPublicKey.Hardened = 0x80000000;
  	HDPublicKey.RootElementAlias = ['m', 'M'];

  	HDPublicKey.VersionSize = 4;
  	HDPublicKey.DepthSize = 1;
  	HDPublicKey.ParentFingerPrintSize = 4;
  	HDPublicKey.ChildIndexSize = 4;
  	HDPublicKey.ChainCodeSize = 32;
  	HDPublicKey.PublicKeySize = 33;
  	HDPublicKey.CheckSumSize = 4;

  	HDPublicKey.DataSize = 78;
  	HDPublicKey.SerializedByteSize = 82;

  	HDPublicKey.VersionStart = 0;
  	HDPublicKey.VersionEnd = HDPublicKey.VersionStart + HDPublicKey.VersionSize;
  	HDPublicKey.DepthStart = HDPublicKey.VersionEnd;
  	HDPublicKey.DepthEnd = HDPublicKey.DepthStart + HDPublicKey.DepthSize;
  	HDPublicKey.ParentFingerPrintStart = HDPublicKey.DepthEnd;
  	HDPublicKey.ParentFingerPrintEnd = HDPublicKey.ParentFingerPrintStart + HDPublicKey.ParentFingerPrintSize;
  	HDPublicKey.ChildIndexStart = HDPublicKey.ParentFingerPrintEnd;
  	HDPublicKey.ChildIndexEnd = HDPublicKey.ChildIndexStart + HDPublicKey.ChildIndexSize;
  	HDPublicKey.ChainCodeStart = HDPublicKey.ChildIndexEnd;
  	HDPublicKey.ChainCodeEnd = HDPublicKey.ChainCodeStart + HDPublicKey.ChainCodeSize;
  	HDPublicKey.PublicKeyStart = HDPublicKey.ChainCodeEnd;
  	HDPublicKey.PublicKeyEnd = HDPublicKey.PublicKeyStart + HDPublicKey.PublicKeySize;
  	HDPublicKey.ChecksumStart = HDPublicKey.PublicKeyEnd;
  	HDPublicKey.ChecksumEnd = HDPublicKey.ChecksumStart + HDPublicKey.CheckSumSize;

  	assert(HDPublicKey.PublicKeyEnd === HDPublicKey.DataSize);
  	assert(HDPublicKey.ChecksumEnd === HDPublicKey.SerializedByteSize);

  	hdpublickey = HDPublicKey;
  	return hdpublickey;
  }

  var hdprivatekey;
  var hasRequiredHdprivatekey;

  function requireHdprivatekey () {
  	if (hasRequiredHdprivatekey) return hdprivatekey;
  	hasRequiredHdprivatekey = 1;

  	var assert = require$$0;
  	var buffer = require$$0$4;
  	var _ = __1;
  	var $ = preconditions;

  	var BN = bn$1;
  	var Base58 = base58;
  	var Base58Check = base58check;
  	var Hash = hash.exports;
  	var Network = networks_1;
  	var Point = point;
  	var PrivateKey = requirePrivatekey();
  	var Random = random;

  	var errors = errors$2.exports;
  	var hdErrors = errors.HDPrivateKey;
  	var JSUtil = js;

  	var MINIMUM_ENTROPY_BITS = 128;
  	var BITS_TO_BYTES = 1 / 8;
  	var MAXIMUM_ENTROPY_BITS = 512;

  	/**
  	 * Represents an instance of an hierarchically derived private key.
  	 *
  	 * More info on https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki
  	 *
  	 * @constructor
  	 * @param {string|Buffer|Object} arg
  	 */
  	function HDPrivateKey (arg) {
  	  if (arg instanceof HDPrivateKey) {
  	    return arg
  	  }
  	  if (!(this instanceof HDPrivateKey)) {
  	    return new HDPrivateKey(arg)
  	  }
  	  if (!arg) {
  	    return this._generateRandomly()
  	  }

  	  if (Network.get(arg)) {
  	    return this._generateRandomly(arg)
  	  } else if (_.isString(arg) || Buffer$1.isBuffer(arg)) {
  	    if (HDPrivateKey.isValidSerialized(arg)) {
  	      this._buildFromSerialized(arg);
  	    } else if (JSUtil.isValidJSON(arg)) {
  	      this._buildFromJSON(arg);
  	    } else if (Buffer$1.isBuffer(arg) && HDPrivateKey.isValidSerialized(arg.toString())) {
  	      this._buildFromSerialized(arg.toString());
  	    } else {
  	      throw HDPrivateKey.getSerializedError(arg)
  	    }
  	  } else if (_.isObject(arg)) {
  	    this._buildFromObject(arg);
  	  } else {
  	    throw new hdErrors.UnrecognizedArgument(arg)
  	  }
  	}

  	HDPrivateKey.fromRandom = function () {
  	  return new HDPrivateKey()
  	};

  	/**
  	 * Verifies that a given path is valid.
  	 *
  	 * @param {string|number} arg
  	 * @param {boolean?} hardened
  	 * @return {boolean}
  	 */
  	HDPrivateKey.isValidPath = function (arg, hardened) {
  	  if (_.isString(arg)) {
  	    var indexes = HDPrivateKey._getDerivationIndexes(arg);
  	    return indexes !== null && _.every(indexes, HDPrivateKey.isValidPath)
  	  }

  	  if (_.isNumber(arg)) {
  	    if (arg < HDPrivateKey.Hardened && hardened === true) {
  	      arg += HDPrivateKey.Hardened;
  	    }
  	    return arg >= 0 && arg < HDPrivateKey.MaxIndex
  	  }

  	  return false
  	};

  	/**
  	 * Internal function that splits a string path into a derivation index array.
  	 * It will return null if the string path is malformed.
  	 * It does not validate if indexes are in bounds.
  	 *
  	 * @param {string} path
  	 * @return {Array}
  	 */
  	HDPrivateKey._getDerivationIndexes = function (path) {
  	  var steps = path.split('/');

  	  // Special cases:
  	  if (_.includes(HDPrivateKey.RootElementAlias, path)) {
  	    return []
  	  }

  	  if (!_.includes(HDPrivateKey.RootElementAlias, steps[0])) {
  	    return null
  	  }

  	  var indexes = steps.slice(1).map(function (step) {
  	    var isHardened = step.slice(-1) === '\'';
  	    if (isHardened) {
  	      step = step.slice(0, -1);
  	    }
  	    if (!step || step[0] === '-') {
  	      return NaN
  	    }
  	    var index = +step; // cast to number
  	    if (isHardened) {
  	      index += HDPrivateKey.Hardened;
  	    }

  	    return index
  	  });

  	  return _.some(indexes, isNaN) ? null : indexes
  	};

  	/**
  	 * WARNING: This method is deprecated. Use deriveChild or deriveNonCompliantChild instead. This is not BIP32 compliant
  	 *
  	 *
  	 * Get a derived child based on a string or number.
  	 *
  	 * If the first argument is a string, it's parsed as the full path of
  	 * derivation. Valid values for this argument include "m" (which returns the
  	 * same private key), "m/0/1/40/2'/1000", where the ' quote means a hardened
  	 * derivation.
  	 *
  	 * If the first argument is a number, the child with that index will be
  	 * derived. If the second argument is truthy, the hardened version will be
  	 * derived. See the example usage for clarification.
  	 *
  	 * @example
  	 * ```javascript
  	 * var parent = new HDPrivateKey('xprv...');
  	 * var child_0_1_2h = parent.derive(0).derive(1).derive(2, true);
  	 * var copy_of_child_0_1_2h = parent.derive("m/0/1/2'");
  	 * assert(child_0_1_2h.xprivkey === copy_of_child_0_1_2h);
  	 * ```
  	 *
  	 * @param {string|number} arg
  	 * @param {boolean?} hardened
  	 */
  	HDPrivateKey.prototype.derive = function () {
  	  throw new Error('derive has been deprecated. use deriveChild or, for the old way, deriveNonCompliantChild.')
  	};

  	/**
  	 * WARNING: This method will not be officially supported until v1.0.0.
  	 *
  	 *
  	 * Get a derived child based on a string or number.
  	 *
  	 * If the first argument is a string, it's parsed as the full path of
  	 * derivation. Valid values for this argument include "m" (which returns the
  	 * same private key), "m/0/1/40/2'/1000", where the ' quote means a hardened
  	 * derivation.
  	 *
  	 * If the first argument is a number, the child with that index will be
  	 * derived. If the second argument is truthy, the hardened version will be
  	 * derived. See the example usage for clarification.
  	 *
  	 * WARNING: The `nonCompliant` option should NOT be used, except for older implementation
  	 * that used a derivation strategy that used a non-zero padded private key.
  	 *
  	 * @example
  	 * ```javascript
  	 * var parent = new HDPrivateKey('xprv...');
  	 * var child_0_1_2h = parent.deriveChild(0).deriveChild(1).deriveChild(2, true);
  	 * var copy_of_child_0_1_2h = parent.deriveChild("m/0/1/2'");
  	 * assert(child_0_1_2h.xprivkey === copy_of_child_0_1_2h);
  	 * ```
  	 *
  	 * @param {string|number} arg
  	 * @param {boolean?} hardened
  	 */
  	HDPrivateKey.prototype.deriveChild = function (arg, hardened) {
  	  if (_.isNumber(arg)) {
  	    return this._deriveWithNumber(arg, hardened)
  	  } else if (_.isString(arg)) {
  	    return this._deriveFromString(arg)
  	  } else {
  	    throw new hdErrors.InvalidDerivationArgument(arg)
  	  }
  	};

  	/**
  	 * WARNING: This method will not be officially supported until v1.0.0
  	 *
  	 *
  	 * WARNING: If this is a new implementation you should NOT use this method, you should be using
  	 * `derive` instead.
  	 *
  	 * This method is explicitly for use and compatibility with an implementation that
  	 * was not compliant with BIP32 regarding the derivation algorithm. The private key
  	 * must be 32 bytes hashing, and this implementation will use the non-zero padded
  	 * serialization of a private key, such that it's still possible to derive the privateKey
  	 * to recover those funds.
  	 *
  	 * @param {string|number} arg
  	 * @param {boolean?} hardened
  	 */
  	HDPrivateKey.prototype.deriveNonCompliantChild = function (arg, hardened) {
  	  if (_.isNumber(arg)) {
  	    return this._deriveWithNumber(arg, hardened, true)
  	  } else if (_.isString(arg)) {
  	    return this._deriveFromString(arg, true)
  	  } else {
  	    throw new hdErrors.InvalidDerivationArgument(arg)
  	  }
  	};

  	HDPrivateKey.prototype._deriveWithNumber = function (index, hardened, nonCompliant) {
  	  if (!HDPrivateKey.isValidPath(index, hardened)) {
  	    throw new hdErrors.InvalidPath(index)
  	  }

  	  hardened = index >= HDPrivateKey.Hardened ? true : hardened;
  	  if (index < HDPrivateKey.Hardened && hardened === true) {
  	    index += HDPrivateKey.Hardened;
  	  }

  	  var indexBuffer = JSUtil.integerAsBuffer(index);
  	  var data;
  	  if (hardened && nonCompliant) {
  	    // The private key serialization in this case will not be exactly 32 bytes and can be
  	    // any value less, and the value is not zero-padded.
  	    var nonZeroPadded = this.privateKey.bn.toBuffer();
  	    data = Buffer$1.concat([buffer.Buffer.from([0]), nonZeroPadded, indexBuffer]);
  	  } else if (hardened) {
  	    // This will use a 32 byte zero padded serialization of the private key
  	    var privateKeyBuffer = this.privateKey.bn.toBuffer({ size: 32 });
  	    assert(privateKeyBuffer.length === 32, 'length of private key buffer is expected to be 32 bytes');
  	    data = Buffer$1.concat([buffer.Buffer.from([0]), privateKeyBuffer, indexBuffer]);
  	  } else {
  	    data = Buffer$1.concat([this.publicKey.toBuffer(), indexBuffer]);
  	  }
  	  var hash = Hash.sha512hmac(data, this._buffers.chainCode);
  	  var leftPart = BN.fromBuffer(hash.slice(0, 32), {
  	    size: 32
  	  });
  	  var chainCode = hash.slice(32, 64);

  	  var privateKey = leftPart.add(this.privateKey.toBigNumber()).umod(Point.getN()).toBuffer({
  	    size: 32
  	  });

  	  if (!PrivateKey.isValid(privateKey)) {
  	    // Index at this point is already hardened, we can pass null as the hardened arg
  	    return this._deriveWithNumber(index + 1, null, nonCompliant)
  	  }

  	  var derived = new HDPrivateKey({
  	    network: this.network,
  	    depth: this.depth + 1,
  	    parentFingerPrint: this.fingerPrint,
  	    childIndex: index,
  	    chainCode: chainCode,
  	    privateKey: privateKey
  	  });

  	  return derived
  	};

  	HDPrivateKey.prototype._deriveFromString = function (path, nonCompliant) {
  	  if (!HDPrivateKey.isValidPath(path)) {
  	    throw new hdErrors.InvalidPath(path)
  	  }

  	  var indexes = HDPrivateKey._getDerivationIndexes(path);
  	  var derived = indexes.reduce(function (prev, index) {
  	    return prev._deriveWithNumber(index, null, nonCompliant)
  	  }, this);

  	  return derived
  	};

  	/**
  	 * Verifies that a given serialized private key in base58 with checksum format
  	 * is valid.
  	 *
  	 * @param {string|Buffer} data - the serialized private key
  	 * @param {string|Network=} network - optional, if present, checks that the
  	 *     network provided matches the network serialized.
  	 * @return {boolean}
  	 */
  	HDPrivateKey.isValidSerialized = function (data, network) {
  	  return !HDPrivateKey.getSerializedError(data, network)
  	};

  	/**
  	 * Checks what's the error that causes the validation of a serialized private key
  	 * in base58 with checksum to fail.
  	 *
  	 * @param {string|Buffer} data - the serialized private key
  	 * @param {string|Network=} network - optional, if present, checks that the
  	 *     network provided matches the network serialized.
  	 * @return {errors.InvalidArgument|null}
  	 */
  	HDPrivateKey.getSerializedError = function (data, network) {
  	  if (!(_.isString(data) || Buffer$1.isBuffer(data))) {
  	    return new hdErrors.UnrecognizedArgument('Expected string or buffer')
  	  }
  	  if (!Base58.validCharacters(data)) {
  	    return new errors.InvalidB58Char('(unknown)', data)
  	  }
  	  try {
  	    data = Base58Check.decode(data);
  	  } catch (e) {
  	    return new errors.InvalidB58Checksum(data)
  	  }
  	  if (data.length !== HDPrivateKey.DataLength) {
  	    return new hdErrors.InvalidLength(data)
  	  }
  	  if (!_.isUndefined(network)) {
  	    var error = HDPrivateKey._validateNetwork(data, network);
  	    if (error) {
  	      return error
  	    }
  	  }
  	  return null
  	};

  	HDPrivateKey._validateNetwork = function (data, networkArg) {
  	  var network = Network.get(networkArg);
  	  if (!network) {
  	    return new errors.InvalidNetworkArgument(networkArg)
  	  }
  	  var version = data.slice(0, 4);
  	  if (version.readUInt32BE(0) !== network.xprivkey) {
  	    return new errors.InvalidNetwork(version)
  	  }
  	  return null
  	};

  	HDPrivateKey.fromString = function (arg) {
  	  $.checkArgument(_.isString(arg), 'No valid string was provided');
  	  return new HDPrivateKey(arg)
  	};

  	HDPrivateKey.fromObject = function (arg) {
  	  $.checkArgument(_.isObject(arg), 'No valid argument was provided');
  	  return new HDPrivateKey(arg)
  	};

  	HDPrivateKey.prototype._buildFromJSON = function (arg) {
  	  return this._buildFromObject(JSON.parse(arg))
  	};

  	HDPrivateKey.prototype._buildFromObject = function (arg) {
  	  // TODO: Type validation
  	  var buffers = {
  	    version: arg.network ? JSUtil.integerAsBuffer(Network.get(arg.network).xprivkey) : arg.version,
  	    depth: _.isNumber(arg.depth) ? Buffer$1.from([arg.depth & 0xff]) : arg.depth,
  	    parentFingerPrint: _.isNumber(arg.parentFingerPrint) ? JSUtil.integerAsBuffer(arg.parentFingerPrint) : arg.parentFingerPrint,
  	    childIndex: _.isNumber(arg.childIndex) ? JSUtil.integerAsBuffer(arg.childIndex) : arg.childIndex,
  	    chainCode: _.isString(arg.chainCode) ? Buffer$1.from(arg.chainCode, 'hex') : arg.chainCode,
  	    privateKey: (_.isString(arg.privateKey) && JSUtil.isHexa(arg.privateKey)) ? Buffer$1.from(arg.privateKey, 'hex') : arg.privateKey,
  	    checksum: arg.checksum ? (arg.checksum.length ? arg.checksum : JSUtil.integerAsBuffer(arg.checksum)) : undefined
  	  };
  	  return this._buildFromBuffers(buffers)
  	};

  	HDPrivateKey.prototype._buildFromSerialized = function (arg) {
  	  var decoded = Base58Check.decode(arg);
  	  var buffers = {
  	    version: decoded.slice(HDPrivateKey.VersionStart, HDPrivateKey.VersionEnd),
  	    depth: decoded.slice(HDPrivateKey.DepthStart, HDPrivateKey.DepthEnd),
  	    parentFingerPrint: decoded.slice(HDPrivateKey.ParentFingerPrintStart,
  	      HDPrivateKey.ParentFingerPrintEnd),
  	    childIndex: decoded.slice(HDPrivateKey.ChildIndexStart, HDPrivateKey.ChildIndexEnd),
  	    chainCode: decoded.slice(HDPrivateKey.ChainCodeStart, HDPrivateKey.ChainCodeEnd),
  	    privateKey: decoded.slice(HDPrivateKey.PrivateKeyStart, HDPrivateKey.PrivateKeyEnd),
  	    checksum: decoded.slice(HDPrivateKey.ChecksumStart, HDPrivateKey.ChecksumEnd),
  	    xprivkey: arg
  	  };
  	  return this._buildFromBuffers(buffers)
  	};

  	HDPrivateKey.prototype._generateRandomly = function (network) {
  	  return HDPrivateKey.fromSeed(Random.getRandomBuffer(64), network)
  	};

  	/**
  	 * Generate a private key from a seed, as described in BIP32
  	 *
  	 * @param {string|Buffer} hexa
  	 * @param {*} network
  	 * @return HDPrivateKey
  	 */
  	HDPrivateKey.fromSeed = function (hexa, network) {
  	  if (JSUtil.isHexaString(hexa)) {
  	    hexa = Buffer$1.from(hexa, 'hex');
  	  }
  	  if (!Buffer$1.isBuffer(hexa)) {
  	    throw new hdErrors.InvalidEntropyArgument(hexa)
  	  }
  	  if (hexa.length < MINIMUM_ENTROPY_BITS * BITS_TO_BYTES) {
  	    throw new hdErrors.InvalidEntropyArgument.NotEnoughEntropy(hexa)
  	  }
  	  if (hexa.length > MAXIMUM_ENTROPY_BITS * BITS_TO_BYTES) {
  	    throw new hdErrors.InvalidEntropyArgument.TooMuchEntropy(hexa)
  	  }
  	  var hash = Hash.sha512hmac(hexa, buffer.Buffer.from('Bitcoin seed'));

  	  return new HDPrivateKey({
  	    network: Network.get(network) || Network.defaultNetwork,
  	    depth: 0,
  	    parentFingerPrint: 0,
  	    childIndex: 0,
  	    privateKey: hash.slice(0, 32),
  	    chainCode: hash.slice(32, 64)
  	  })
  	};

  	HDPrivateKey.prototype._calcHDPublicKey = function () {
  	  if (!this._hdPublicKey) {
  	    var HDPublicKey = requireHdpublickey();
  	    this._hdPublicKey = new HDPublicKey(this);
  	  }
  	};

  	/**
  	 * Receives a object with buffers in all the properties and populates the
  	 * internal structure
  	 *
  	 * @param {Object} arg
  	 * @param {buffer.Buffer} arg.version
  	 * @param {buffer.Buffer} arg.depth
  	 * @param {buffer.Buffer} arg.parentFingerPrint
  	 * @param {buffer.Buffer} arg.childIndex
  	 * @param {buffer.Buffer} arg.chainCode
  	 * @param {buffer.Buffer} arg.privateKey
  	 * @param {buffer.Buffer} arg.checksum
  	 * @param {string=} arg.xprivkey - if set, don't recalculate the base58
  	 *      representation
  	 * @return {HDPrivateKey} this
  	 */
  	HDPrivateKey.prototype._buildFromBuffers = function (arg) {
  	  HDPrivateKey._validateBufferArguments(arg);

  	  JSUtil.defineImmutable(this, {
  	    _buffers: arg
  	  });

  	  var sequence = [
  	    arg.version, arg.depth, arg.parentFingerPrint, arg.childIndex, arg.chainCode,
  	    Buffer$1.alloc(1), arg.privateKey
  	  ];
  	  var concat = buffer.Buffer.concat(sequence);
  	  if (!arg.checksum || !arg.checksum.length) {
  	    arg.checksum = Base58Check.checksum(concat);
  	  } else {
  	    if (arg.checksum.toString() !== Base58Check.checksum(concat).toString()) {
  	      throw new errors.InvalidB58Checksum(concat)
  	    }
  	  }

  	  var network = Network.get(arg.version.readUInt32BE(0));
  	  var xprivkey;
  	  xprivkey = Base58Check.encode(buffer.Buffer.concat(sequence));
  	  arg.xprivkey = Buffer$1.from(xprivkey);

  	  var privateKey = new PrivateKey(BN.fromBuffer(arg.privateKey), network);
  	  var publicKey = privateKey.toPublicKey();
  	  var size = HDPrivateKey.ParentFingerPrintSize;
  	  var fingerPrint = Hash.sha256ripemd160(publicKey.toBuffer()).slice(0, size);

  	  JSUtil.defineImmutable(this, {
  	    xprivkey: xprivkey,
  	    network: network,
  	    depth: arg.depth[0],
  	    privateKey: privateKey,
  	    publicKey: publicKey,
  	    fingerPrint: fingerPrint
  	  });

  	  this._hdPublicKey = null;

  	  Object.defineProperty(this, 'hdPublicKey', {
  	    configurable: false,
  	    enumerable: true,
  	    get: function () {
  	      this._calcHDPublicKey();
  	      return this._hdPublicKey
  	    }
  	  });
  	  Object.defineProperty(this, 'xpubkey', {
  	    configurable: false,
  	    enumerable: true,
  	    get: function () {
  	      this._calcHDPublicKey();
  	      return this._hdPublicKey.xpubkey
  	    }
  	  });
  	  return this
  	};

  	HDPrivateKey._validateBufferArguments = function (arg) {
  	  var checkBuffer = function (name, size) {
  	    var buff = arg[name];
  	    assert(Buffer$1.isBuffer(buff), name + ' argument is not a buffer');
  	    assert(
  	      buff.length === size,
  	      name + ' has not the expected size: found ' + buff.length + ', expected ' + size
  	    );
  	  };
  	  checkBuffer('version', HDPrivateKey.VersionSize);
  	  checkBuffer('depth', HDPrivateKey.DepthSize);
  	  checkBuffer('parentFingerPrint', HDPrivateKey.ParentFingerPrintSize);
  	  checkBuffer('childIndex', HDPrivateKey.ChildIndexSize);
  	  checkBuffer('chainCode', HDPrivateKey.ChainCodeSize);
  	  checkBuffer('privateKey', HDPrivateKey.PrivateKeySize);
  	  if (arg.checksum && arg.checksum.length) {
  	    checkBuffer('checksum', HDPrivateKey.CheckSumSize);
  	  }
  	};

  	/**
  	 * Returns the string representation of this private key (a string starting
  	 * with "xprv..."
  	 *
  	 * @return string
  	 */
  	HDPrivateKey.prototype.toString = function () {
  	  return this.xprivkey
  	};

  	/**
  	 * Returns the console representation of this extended private key.
  	 * @return string
  	 */
  	HDPrivateKey.prototype.inspect = function () {
  	  return '<HDPrivateKey: ' + this.xprivkey + '>'
  	};

  	/**
  	 * Returns a plain object with a representation of this private key.
  	 *
  	 * Fields include:<ul>
  	 * <li> network: either 'livenet' or 'testnet'
  	 * <li> depth: a number ranging from 0 to 255
  	 * <li> fingerPrint: a number ranging from 0 to 2^32-1, taken from the hash of the
  	 * <li>     associated public key
  	 * <li> parentFingerPrint: a number ranging from 0 to 2^32-1, taken from the hash
  	 * <li>     of this parent's associated public key or zero.
  	 * <li> childIndex: the index from which this child was derived (or zero)
  	 * <li> chainCode: an hexa string representing a number used in the derivation
  	 * <li> privateKey: the private key associated, in hexa representation
  	 * <li> xprivkey: the representation of this extended private key in checksum
  	 * <li>     base58 format
  	 * <li> checksum: the base58 checksum of xprivkey
  	 * </ul>
  	 *  @return {Object}
  	 */
  	HDPrivateKey.prototype.toObject = HDPrivateKey.prototype.toJSON = function toObject () {
  	  return {
  	    network: Network.get(this._buffers.version.readUInt32BE(0), 'xprivkey').name,
  	    depth: this._buffers.depth[0],
  	    fingerPrint: this.fingerPrint.readUInt32BE(0),
  	    parentFingerPrint: this._buffers.parentFingerPrint.readUInt32BE(0),
  	    childIndex: this._buffers.childIndex.readUInt32BE(0),
  	    chainCode: this._buffers.chainCode.toString('hex'),
  	    privateKey: this.privateKey.toBuffer().toString('hex'),
  	    checksum: this._buffers.checksum.readUInt32BE(0),
  	    xprivkey: this.xprivkey
  	  }
  	};

  	/**
  	 * Build a HDPrivateKey from a buffer
  	 *
  	 * @param {Buffer} arg
  	 * @return {HDPrivateKey}
  	 */
  	HDPrivateKey.fromBuffer = function (buf) {
  	  return new HDPrivateKey(buf.toString())
  	};

  	/**
  	 * Build a HDPrivateKey from a hex string
  	 *
  	 * @param {string} hex
  	 * @return {HDPrivateKey}
  	 */
  	HDPrivateKey.fromHex = function (hex) {
  	  return HDPrivateKey.fromBuffer(Buffer$1.from(hex, 'hex'))
  	};

  	/**
  	 * Returns a buffer representation of the HDPrivateKey
  	 *
  	 * @return {string}
  	 */
  	HDPrivateKey.prototype.toBuffer = function () {
  	  return Buffer$1.from(this.toString())
  	};

  	/**
  	 * Returns a hex string representation of the HDPrivateKey
  	 *
  	 * @return {string}
  	 */
  	HDPrivateKey.prototype.toHex = function () {
  	  return this.toBuffer().toString('hex')
  	};

  	HDPrivateKey.DefaultDepth = 0;
  	HDPrivateKey.DefaultFingerprint = 0;
  	HDPrivateKey.DefaultChildIndex = 0;
  	HDPrivateKey.Hardened = 0x80000000;
  	HDPrivateKey.MaxIndex = 2 * HDPrivateKey.Hardened;

  	HDPrivateKey.RootElementAlias = ['m', 'M', 'm\'', 'M\''];

  	HDPrivateKey.VersionSize = 4;
  	HDPrivateKey.DepthSize = 1;
  	HDPrivateKey.ParentFingerPrintSize = 4;
  	HDPrivateKey.ChildIndexSize = 4;
  	HDPrivateKey.ChainCodeSize = 32;
  	HDPrivateKey.PrivateKeySize = 32;
  	HDPrivateKey.CheckSumSize = 4;

  	HDPrivateKey.DataLength = 78;
  	HDPrivateKey.SerializedByteSize = 82;

  	HDPrivateKey.VersionStart = 0;
  	HDPrivateKey.VersionEnd = HDPrivateKey.VersionStart + HDPrivateKey.VersionSize;
  	HDPrivateKey.DepthStart = HDPrivateKey.VersionEnd;
  	HDPrivateKey.DepthEnd = HDPrivateKey.DepthStart + HDPrivateKey.DepthSize;
  	HDPrivateKey.ParentFingerPrintStart = HDPrivateKey.DepthEnd;
  	HDPrivateKey.ParentFingerPrintEnd = HDPrivateKey.ParentFingerPrintStart + HDPrivateKey.ParentFingerPrintSize;
  	HDPrivateKey.ChildIndexStart = HDPrivateKey.ParentFingerPrintEnd;
  	HDPrivateKey.ChildIndexEnd = HDPrivateKey.ChildIndexStart + HDPrivateKey.ChildIndexSize;
  	HDPrivateKey.ChainCodeStart = HDPrivateKey.ChildIndexEnd;
  	HDPrivateKey.ChainCodeEnd = HDPrivateKey.ChainCodeStart + HDPrivateKey.ChainCodeSize;
  	HDPrivateKey.PrivateKeyStart = HDPrivateKey.ChainCodeEnd + 1;
  	HDPrivateKey.PrivateKeyEnd = HDPrivateKey.PrivateKeyStart + HDPrivateKey.PrivateKeySize;
  	HDPrivateKey.ChecksumStart = HDPrivateKey.PrivateKeyEnd;
  	HDPrivateKey.ChecksumEnd = HDPrivateKey.ChecksumStart + HDPrivateKey.CheckSumSize;

  	assert(HDPrivateKey.ChecksumEnd === HDPrivateKey.SerializedByteSize);

  	hdprivatekey = HDPrivateKey;
  	return hdprivatekey;
  }

  (function (module) {

  	var bsv = module.exports;

  	// module information
  	bsv.version = 'v' + require$$0$5.version;
  	bsv.versionGuard = function (version) {
  	  if (version !== undefined) {
  	    var message = `
      More than one instance of bsv found.
      Please make sure to require bsv and check that submodules do
      not also include their own bsv dependency.`;
  	    console.warn(message);
  	  }
  	};
  	bsv.versionGuard(commonjsGlobal._bsv);
  	commonjsGlobal._bsv = bsv.version;

  	// crypto
  	bsv.crypto = {};
  	bsv.crypto.BN = bn$1;
  	bsv.crypto.ECDSA = requireEcdsa();
  	bsv.crypto.Hash = hash.exports;
  	bsv.crypto.Random = random;
  	bsv.crypto.Point = point;
  	bsv.crypto.Signature = signature$1;

  	// encoding
  	bsv.encoding = {};
  	bsv.encoding.Base58 = base58;
  	bsv.encoding.Base58Check = base58check;
  	bsv.encoding.BufferReader = bufferreader;
  	bsv.encoding.BufferWriter = bufferwriter;
  	bsv.encoding.Varint = varint;

  	// utilities
  	bsv.util = {};
  	bsv.util.js = js;
  	bsv.util.preconditions = preconditions;

  	// errors thrown by the library
  	bsv.errors = errors$2.exports;

  	// main bitcoin library
  	bsv.Address = requireAddress();
  	bsv.Block = block$1.exports;
  	bsv.MerkleBlock = merkleblock;
  	bsv.BlockHeader = blockheader;
  	bsv.HDPrivateKey = requireHdprivatekey();
  	bsv.HDPublicKey = requireHdpublickey();
  	bsv.Networks = networks_1;
  	bsv.Opcode = opcode;
  	bsv.PrivateKey = requirePrivatekey();
  	bsv.PublicKey = requirePublickey();
  	bsv.Script = requireScript();
  	bsv.Transaction = requireTransaction();

  	// dependencies, subject to change
  	bsv.deps = {};
  	bsv.deps.bnjs = bn$2.exports;
  	bsv.deps.bs58 = bs58$1;
  	bsv.deps.Buffer = Buffer$1;
  	bsv.deps.elliptic = elliptic;
  	bsv.deps._ = __1;

  	// Internal usage, exposed for testing/advanced tweaking
  	bsv.Transaction.sighash = requireSighash();
  } (bsv$2));

  var bsv = bsv$2.exports;

  var bn = {exports: {}};

  (function (module) {
  	(function (module, exports) {

  	  // Utils
  	  function assert (val, msg) {
  	    if (!val) throw new Error(msg || 'Assertion failed');
  	  }

  	  // Could use `inherits` module, but don't want to move from single file
  	  // architecture yet.
  	  function inherits (ctor, superCtor) {
  	    ctor.super_ = superCtor;
  	    var TempCtor = function () {};
  	    TempCtor.prototype = superCtor.prototype;
  	    ctor.prototype = new TempCtor();
  	    ctor.prototype.constructor = ctor;
  	  }

  	  // BN

  	  function BN (number, base, endian) {
  	    if (BN.isBN(number)) {
  	      return number;
  	    }

  	    this.negative = 0;
  	    this.words = null;
  	    this.length = 0;

  	    // Reduction context
  	    this.red = null;

  	    if (number !== null) {
  	      if (base === 'le' || base === 'be') {
  	        endian = base;
  	        base = 10;
  	      }

  	      this._init(number || 0, base || 10, endian || 'be');
  	    }
  	  }
  	  if (typeof module === 'object') {
  	    module.exports = BN;
  	  } else {
  	    exports.BN = BN;
  	  }

  	  BN.BN = BN;
  	  BN.wordSize = 26;

  	  var Buffer;
  	  try {
  	    if (typeof window !== 'undefined' && typeof window.Buffer !== 'undefined') {
  	      Buffer = window.Buffer;
  	    } else {
  	      Buffer = require$$0$4.Buffer;
  	    }
  	  } catch (e) {
  	  }

  	  BN.isBN = function isBN (num) {
  	    if (num instanceof BN) {
  	      return true;
  	    }

  	    return num !== null && typeof num === 'object' &&
  	      num.constructor.wordSize === BN.wordSize && Array.isArray(num.words);
  	  };

  	  BN.max = function max (left, right) {
  	    if (left.cmp(right) > 0) return left;
  	    return right;
  	  };

  	  BN.min = function min (left, right) {
  	    if (left.cmp(right) < 0) return left;
  	    return right;
  	  };

  	  BN.prototype._init = function init (number, base, endian) {
  	    if (typeof number === 'number') {
  	      return this._initNumber(number, base, endian);
  	    }

  	    if (typeof number === 'object') {
  	      return this._initArray(number, base, endian);
  	    }

  	    if (base === 'hex') {
  	      base = 16;
  	    }
  	    assert(base === (base | 0) && base >= 2 && base <= 36);

  	    number = number.toString().replace(/\s+/g, '');
  	    var start = 0;
  	    if (number[0] === '-') {
  	      start++;
  	      this.negative = 1;
  	    }

  	    if (start < number.length) {
  	      if (base === 16) {
  	        this._parseHex(number, start, endian);
  	      } else {
  	        this._parseBase(number, base, start);
  	        if (endian === 'le') {
  	          this._initArray(this.toArray(), base, endian);
  	        }
  	      }
  	    }
  	  };

  	  BN.prototype._initNumber = function _initNumber (number, base, endian) {
  	    if (number < 0) {
  	      this.negative = 1;
  	      number = -number;
  	    }
  	    if (number < 0x4000000) {
  	      this.words = [number & 0x3ffffff];
  	      this.length = 1;
  	    } else if (number < 0x10000000000000) {
  	      this.words = [
  	        number & 0x3ffffff,
  	        (number / 0x4000000) & 0x3ffffff
  	      ];
  	      this.length = 2;
  	    } else {
  	      assert(number < 0x20000000000000); // 2 ^ 53 (unsafe)
  	      this.words = [
  	        number & 0x3ffffff,
  	        (number / 0x4000000) & 0x3ffffff,
  	        1
  	      ];
  	      this.length = 3;
  	    }

  	    if (endian !== 'le') return;

  	    // Reverse the bytes
  	    this._initArray(this.toArray(), base, endian);
  	  };

  	  BN.prototype._initArray = function _initArray (number, base, endian) {
  	    // Perhaps a Uint8Array
  	    assert(typeof number.length === 'number');
  	    if (number.length <= 0) {
  	      this.words = [0];
  	      this.length = 1;
  	      return this;
  	    }

  	    this.length = Math.ceil(number.length / 3);
  	    this.words = new Array(this.length);
  	    for (var i = 0; i < this.length; i++) {
  	      this.words[i] = 0;
  	    }

  	    var j, w;
  	    var off = 0;
  	    if (endian === 'be') {
  	      for (i = number.length - 1, j = 0; i >= 0; i -= 3) {
  	        w = number[i] | (number[i - 1] << 8) | (number[i - 2] << 16);
  	        this.words[j] |= (w << off) & 0x3ffffff;
  	        this.words[j + 1] = (w >>> (26 - off)) & 0x3ffffff;
  	        off += 24;
  	        if (off >= 26) {
  	          off -= 26;
  	          j++;
  	        }
  	      }
  	    } else if (endian === 'le') {
  	      for (i = 0, j = 0; i < number.length; i += 3) {
  	        w = number[i] | (number[i + 1] << 8) | (number[i + 2] << 16);
  	        this.words[j] |= (w << off) & 0x3ffffff;
  	        this.words[j + 1] = (w >>> (26 - off)) & 0x3ffffff;
  	        off += 24;
  	        if (off >= 26) {
  	          off -= 26;
  	          j++;
  	        }
  	      }
  	    }
  	    return this._strip();
  	  };

  	  function parseHex4Bits (string, index) {
  	    var c = string.charCodeAt(index);
  	    // '0' - '9'
  	    if (c >= 48 && c <= 57) {
  	      return c - 48;
  	    // 'A' - 'F'
  	    } else if (c >= 65 && c <= 70) {
  	      return c - 55;
  	    // 'a' - 'f'
  	    } else if (c >= 97 && c <= 102) {
  	      return c - 87;
  	    } else {
  	      assert(false, 'Invalid character in ' + string);
  	    }
  	  }

  	  function parseHexByte (string, lowerBound, index) {
  	    var r = parseHex4Bits(string, index);
  	    if (index - 1 >= lowerBound) {
  	      r |= parseHex4Bits(string, index - 1) << 4;
  	    }
  	    return r;
  	  }

  	  BN.prototype._parseHex = function _parseHex (number, start, endian) {
  	    // Create possibly bigger array to ensure that it fits the number
  	    this.length = Math.ceil((number.length - start) / 6);
  	    this.words = new Array(this.length);
  	    for (var i = 0; i < this.length; i++) {
  	      this.words[i] = 0;
  	    }

  	    // 24-bits chunks
  	    var off = 0;
  	    var j = 0;

  	    var w;
  	    if (endian === 'be') {
  	      for (i = number.length - 1; i >= start; i -= 2) {
  	        w = parseHexByte(number, start, i) << off;
  	        this.words[j] |= w & 0x3ffffff;
  	        if (off >= 18) {
  	          off -= 18;
  	          j += 1;
  	          this.words[j] |= w >>> 26;
  	        } else {
  	          off += 8;
  	        }
  	      }
  	    } else {
  	      var parseLength = number.length - start;
  	      for (i = parseLength % 2 === 0 ? start + 1 : start; i < number.length; i += 2) {
  	        w = parseHexByte(number, start, i) << off;
  	        this.words[j] |= w & 0x3ffffff;
  	        if (off >= 18) {
  	          off -= 18;
  	          j += 1;
  	          this.words[j] |= w >>> 26;
  	        } else {
  	          off += 8;
  	        }
  	      }
  	    }

  	    this._strip();
  	  };

  	  function parseBase (str, start, end, mul) {
  	    var r = 0;
  	    var b = 0;
  	    var len = Math.min(str.length, end);
  	    for (var i = start; i < len; i++) {
  	      var c = str.charCodeAt(i) - 48;

  	      r *= mul;

  	      // 'a'
  	      if (c >= 49) {
  	        b = c - 49 + 0xa;

  	      // 'A'
  	      } else if (c >= 17) {
  	        b = c - 17 + 0xa;

  	      // '0' - '9'
  	      } else {
  	        b = c;
  	      }
  	      assert(c >= 0 && b < mul, 'Invalid character');
  	      r += b;
  	    }
  	    return r;
  	  }

  	  BN.prototype._parseBase = function _parseBase (number, base, start) {
  	    // Initialize as zero
  	    this.words = [0];
  	    this.length = 1;

  	    // Find length of limb in base
  	    for (var limbLen = 0, limbPow = 1; limbPow <= 0x3ffffff; limbPow *= base) {
  	      limbLen++;
  	    }
  	    limbLen--;
  	    limbPow = (limbPow / base) | 0;

  	    var total = number.length - start;
  	    var mod = total % limbLen;
  	    var end = Math.min(total, total - mod) + start;

  	    var word = 0;
  	    for (var i = start; i < end; i += limbLen) {
  	      word = parseBase(number, i, i + limbLen, base);

  	      this.imuln(limbPow);
  	      if (this.words[0] + word < 0x4000000) {
  	        this.words[0] += word;
  	      } else {
  	        this._iaddn(word);
  	      }
  	    }

  	    if (mod !== 0) {
  	      var pow = 1;
  	      word = parseBase(number, i, number.length, base);

  	      for (i = 0; i < mod; i++) {
  	        pow *= base;
  	      }

  	      this.imuln(pow);
  	      if (this.words[0] + word < 0x4000000) {
  	        this.words[0] += word;
  	      } else {
  	        this._iaddn(word);
  	      }
  	    }

  	    this._strip();
  	  };

  	  BN.prototype.copy = function copy (dest) {
  	    dest.words = new Array(this.length);
  	    for (var i = 0; i < this.length; i++) {
  	      dest.words[i] = this.words[i];
  	    }
  	    dest.length = this.length;
  	    dest.negative = this.negative;
  	    dest.red = this.red;
  	  };

  	  function move (dest, src) {
  	    dest.words = src.words;
  	    dest.length = src.length;
  	    dest.negative = src.negative;
  	    dest.red = src.red;
  	  }

  	  BN.prototype._move = function _move (dest) {
  	    move(dest, this);
  	  };

  	  BN.prototype.clone = function clone () {
  	    var r = new BN(null);
  	    this.copy(r);
  	    return r;
  	  };

  	  BN.prototype._expand = function _expand (size) {
  	    while (this.length < size) {
  	      this.words[this.length++] = 0;
  	    }
  	    return this;
  	  };

  	  // Remove leading `0` from `this`
  	  BN.prototype._strip = function strip () {
  	    while (this.length > 1 && this.words[this.length - 1] === 0) {
  	      this.length--;
  	    }
  	    return this._normSign();
  	  };

  	  BN.prototype._normSign = function _normSign () {
  	    // -0 = 0
  	    if (this.length === 1 && this.words[0] === 0) {
  	      this.negative = 0;
  	    }
  	    return this;
  	  };

  	  // Check Symbol.for because not everywhere where Symbol defined
  	  // See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol#Browser_compatibility
  	  if (typeof Symbol !== 'undefined' && typeof Symbol.for === 'function') {
  	    try {
  	      BN.prototype[Symbol.for('nodejs.util.inspect.custom')] = inspect;
  	    } catch (e) {
  	      BN.prototype.inspect = inspect;
  	    }
  	  } else {
  	    BN.prototype.inspect = inspect;
  	  }

  	  function inspect () {
  	    return (this.red ? '<BN-R: ' : '<BN: ') + this.toString(16) + '>';
  	  }

  	  /*

  	  var zeros = [];
  	  var groupSizes = [];
  	  var groupBases = [];

  	  var s = '';
  	  var i = -1;
  	  while (++i < BN.wordSize) {
  	    zeros[i] = s;
  	    s += '0';
  	  }
  	  groupSizes[0] = 0;
  	  groupSizes[1] = 0;
  	  groupBases[0] = 0;
  	  groupBases[1] = 0;
  	  var base = 2 - 1;
  	  while (++base < 36 + 1) {
  	    var groupSize = 0;
  	    var groupBase = 1;
  	    while (groupBase < (1 << BN.wordSize) / base) {
  	      groupBase *= base;
  	      groupSize += 1;
  	    }
  	    groupSizes[base] = groupSize;
  	    groupBases[base] = groupBase;
  	  }

  	  */

  	  var zeros = [
  	    '',
  	    '0',
  	    '00',
  	    '000',
  	    '0000',
  	    '00000',
  	    '000000',
  	    '0000000',
  	    '00000000',
  	    '000000000',
  	    '0000000000',
  	    '00000000000',
  	    '000000000000',
  	    '0000000000000',
  	    '00000000000000',
  	    '000000000000000',
  	    '0000000000000000',
  	    '00000000000000000',
  	    '000000000000000000',
  	    '0000000000000000000',
  	    '00000000000000000000',
  	    '000000000000000000000',
  	    '0000000000000000000000',
  	    '00000000000000000000000',
  	    '000000000000000000000000',
  	    '0000000000000000000000000'
  	  ];

  	  var groupSizes = [
  	    0, 0,
  	    25, 16, 12, 11, 10, 9, 8,
  	    8, 7, 7, 7, 7, 6, 6,
  	    6, 6, 6, 6, 6, 5, 5,
  	    5, 5, 5, 5, 5, 5, 5,
  	    5, 5, 5, 5, 5, 5, 5
  	  ];

  	  var groupBases = [
  	    0, 0,
  	    33554432, 43046721, 16777216, 48828125, 60466176, 40353607, 16777216,
  	    43046721, 10000000, 19487171, 35831808, 62748517, 7529536, 11390625,
  	    16777216, 24137569, 34012224, 47045881, 64000000, 4084101, 5153632,
  	    6436343, 7962624, 9765625, 11881376, 14348907, 17210368, 20511149,
  	    24300000, 28629151, 33554432, 39135393, 45435424, 52521875, 60466176
  	  ];

  	  BN.prototype.toString = function toString (base, padding) {
  	    base = base || 10;
  	    padding = padding | 0 || 1;

  	    var out;
  	    if (base === 16 || base === 'hex') {
  	      out = '';
  	      var off = 0;
  	      var carry = 0;
  	      for (var i = 0; i < this.length; i++) {
  	        var w = this.words[i];
  	        var word = (((w << off) | carry) & 0xffffff).toString(16);
  	        carry = (w >>> (24 - off)) & 0xffffff;
  	        off += 2;
  	        if (off >= 26) {
  	          off -= 26;
  	          i--;
  	        }
  	        if (carry !== 0 || i !== this.length - 1) {
  	          out = zeros[6 - word.length] + word + out;
  	        } else {
  	          out = word + out;
  	        }
  	      }
  	      if (carry !== 0) {
  	        out = carry.toString(16) + out;
  	      }
  	      while (out.length % padding !== 0) {
  	        out = '0' + out;
  	      }
  	      if (this.negative !== 0) {
  	        out = '-' + out;
  	      }
  	      return out;
  	    }

  	    if (base === (base | 0) && base >= 2 && base <= 36) {
  	      // var groupSize = Math.floor(BN.wordSize * Math.LN2 / Math.log(base));
  	      var groupSize = groupSizes[base];
  	      // var groupBase = Math.pow(base, groupSize);
  	      var groupBase = groupBases[base];
  	      out = '';
  	      var c = this.clone();
  	      c.negative = 0;
  	      while (!c.isZero()) {
  	        var r = c.modrn(groupBase).toString(base);
  	        c = c.idivn(groupBase);

  	        if (!c.isZero()) {
  	          out = zeros[groupSize - r.length] + r + out;
  	        } else {
  	          out = r + out;
  	        }
  	      }
  	      if (this.isZero()) {
  	        out = '0' + out;
  	      }
  	      while (out.length % padding !== 0) {
  	        out = '0' + out;
  	      }
  	      if (this.negative !== 0) {
  	        out = '-' + out;
  	      }
  	      return out;
  	    }

  	    assert(false, 'Base should be between 2 and 36');
  	  };

  	  BN.prototype.toNumber = function toNumber () {
  	    var ret = this.words[0];
  	    if (this.length === 2) {
  	      ret += this.words[1] * 0x4000000;
  	    } else if (this.length === 3 && this.words[2] === 0x01) {
  	      // NOTE: at this stage it is known that the top bit is set
  	      ret += 0x10000000000000 + (this.words[1] * 0x4000000);
  	    } else if (this.length > 2) {
  	      assert(false, 'Number can only safely store up to 53 bits');
  	    }
  	    return (this.negative !== 0) ? -ret : ret;
  	  };

  	  BN.prototype.toJSON = function toJSON () {
  	    return this.toString(16, 2);
  	  };

  	  if (Buffer) {
  	    BN.prototype.toBuffer = function toBuffer (endian, length) {
  	      return this.toArrayLike(Buffer, endian, length);
  	    };
  	  }

  	  BN.prototype.toArray = function toArray (endian, length) {
  	    return this.toArrayLike(Array, endian, length);
  	  };

  	  var allocate = function allocate (ArrayType, size) {
  	    if (ArrayType.allocUnsafe) {
  	      return ArrayType.allocUnsafe(size);
  	    }
  	    return new ArrayType(size);
  	  };

  	  BN.prototype.toArrayLike = function toArrayLike (ArrayType, endian, length) {
  	    this._strip();

  	    var byteLength = this.byteLength();
  	    var reqLength = length || Math.max(1, byteLength);
  	    assert(byteLength <= reqLength, 'byte array longer than desired length');
  	    assert(reqLength > 0, 'Requested array length <= 0');

  	    var res = allocate(ArrayType, reqLength);
  	    var postfix = endian === 'le' ? 'LE' : 'BE';
  	    this['_toArrayLike' + postfix](res, byteLength);
  	    return res;
  	  };

  	  BN.prototype._toArrayLikeLE = function _toArrayLikeLE (res, byteLength) {
  	    var position = 0;
  	    var carry = 0;

  	    for (var i = 0, shift = 0; i < this.length; i++) {
  	      var word = (this.words[i] << shift) | carry;

  	      res[position++] = word & 0xff;
  	      if (position < res.length) {
  	        res[position++] = (word >> 8) & 0xff;
  	      }
  	      if (position < res.length) {
  	        res[position++] = (word >> 16) & 0xff;
  	      }

  	      if (shift === 6) {
  	        if (position < res.length) {
  	          res[position++] = (word >> 24) & 0xff;
  	        }
  	        carry = 0;
  	        shift = 0;
  	      } else {
  	        carry = word >>> 24;
  	        shift += 2;
  	      }
  	    }

  	    if (position < res.length) {
  	      res[position++] = carry;

  	      while (position < res.length) {
  	        res[position++] = 0;
  	      }
  	    }
  	  };

  	  BN.prototype._toArrayLikeBE = function _toArrayLikeBE (res, byteLength) {
  	    var position = res.length - 1;
  	    var carry = 0;

  	    for (var i = 0, shift = 0; i < this.length; i++) {
  	      var word = (this.words[i] << shift) | carry;

  	      res[position--] = word & 0xff;
  	      if (position >= 0) {
  	        res[position--] = (word >> 8) & 0xff;
  	      }
  	      if (position >= 0) {
  	        res[position--] = (word >> 16) & 0xff;
  	      }

  	      if (shift === 6) {
  	        if (position >= 0) {
  	          res[position--] = (word >> 24) & 0xff;
  	        }
  	        carry = 0;
  	        shift = 0;
  	      } else {
  	        carry = word >>> 24;
  	        shift += 2;
  	      }
  	    }

  	    if (position >= 0) {
  	      res[position--] = carry;

  	      while (position >= 0) {
  	        res[position--] = 0;
  	      }
  	    }
  	  };

  	  if (Math.clz32) {
  	    BN.prototype._countBits = function _countBits (w) {
  	      return 32 - Math.clz32(w);
  	    };
  	  } else {
  	    BN.prototype._countBits = function _countBits (w) {
  	      var t = w;
  	      var r = 0;
  	      if (t >= 0x1000) {
  	        r += 13;
  	        t >>>= 13;
  	      }
  	      if (t >= 0x40) {
  	        r += 7;
  	        t >>>= 7;
  	      }
  	      if (t >= 0x8) {
  	        r += 4;
  	        t >>>= 4;
  	      }
  	      if (t >= 0x02) {
  	        r += 2;
  	        t >>>= 2;
  	      }
  	      return r + t;
  	    };
  	  }

  	  BN.prototype._zeroBits = function _zeroBits (w) {
  	    // Short-cut
  	    if (w === 0) return 26;

  	    var t = w;
  	    var r = 0;
  	    if ((t & 0x1fff) === 0) {
  	      r += 13;
  	      t >>>= 13;
  	    }
  	    if ((t & 0x7f) === 0) {
  	      r += 7;
  	      t >>>= 7;
  	    }
  	    if ((t & 0xf) === 0) {
  	      r += 4;
  	      t >>>= 4;
  	    }
  	    if ((t & 0x3) === 0) {
  	      r += 2;
  	      t >>>= 2;
  	    }
  	    if ((t & 0x1) === 0) {
  	      r++;
  	    }
  	    return r;
  	  };

  	  // Return number of used bits in a BN
  	  BN.prototype.bitLength = function bitLength () {
  	    var w = this.words[this.length - 1];
  	    var hi = this._countBits(w);
  	    return (this.length - 1) * 26 + hi;
  	  };

  	  function toBitArray (num) {
  	    var w = new Array(num.bitLength());

  	    for (var bit = 0; bit < w.length; bit++) {
  	      var off = (bit / 26) | 0;
  	      var wbit = bit % 26;

  	      w[bit] = (num.words[off] >>> wbit) & 0x01;
  	    }

  	    return w;
  	  }

  	  // Number of trailing zero bits
  	  BN.prototype.zeroBits = function zeroBits () {
  	    if (this.isZero()) return 0;

  	    var r = 0;
  	    for (var i = 0; i < this.length; i++) {
  	      var b = this._zeroBits(this.words[i]);
  	      r += b;
  	      if (b !== 26) break;
  	    }
  	    return r;
  	  };

  	  BN.prototype.byteLength = function byteLength () {
  	    return Math.ceil(this.bitLength() / 8);
  	  };

  	  BN.prototype.toTwos = function toTwos (width) {
  	    if (this.negative !== 0) {
  	      return this.abs().inotn(width).iaddn(1);
  	    }
  	    return this.clone();
  	  };

  	  BN.prototype.fromTwos = function fromTwos (width) {
  	    if (this.testn(width - 1)) {
  	      return this.notn(width).iaddn(1).ineg();
  	    }
  	    return this.clone();
  	  };

  	  BN.prototype.isNeg = function isNeg () {
  	    return this.negative !== 0;
  	  };

  	  // Return negative clone of `this`
  	  BN.prototype.neg = function neg () {
  	    return this.clone().ineg();
  	  };

  	  BN.prototype.ineg = function ineg () {
  	    if (!this.isZero()) {
  	      this.negative ^= 1;
  	    }

  	    return this;
  	  };

  	  // Or `num` with `this` in-place
  	  BN.prototype.iuor = function iuor (num) {
  	    while (this.length < num.length) {
  	      this.words[this.length++] = 0;
  	    }

  	    for (var i = 0; i < num.length; i++) {
  	      this.words[i] = this.words[i] | num.words[i];
  	    }

  	    return this._strip();
  	  };

  	  BN.prototype.ior = function ior (num) {
  	    assert((this.negative | num.negative) === 0);
  	    return this.iuor(num);
  	  };

  	  // Or `num` with `this`
  	  BN.prototype.or = function or (num) {
  	    if (this.length > num.length) return this.clone().ior(num);
  	    return num.clone().ior(this);
  	  };

  	  BN.prototype.uor = function uor (num) {
  	    if (this.length > num.length) return this.clone().iuor(num);
  	    return num.clone().iuor(this);
  	  };

  	  // And `num` with `this` in-place
  	  BN.prototype.iuand = function iuand (num) {
  	    // b = min-length(num, this)
  	    var b;
  	    if (this.length > num.length) {
  	      b = num;
  	    } else {
  	      b = this;
  	    }

  	    for (var i = 0; i < b.length; i++) {
  	      this.words[i] = this.words[i] & num.words[i];
  	    }

  	    this.length = b.length;

  	    return this._strip();
  	  };

  	  BN.prototype.iand = function iand (num) {
  	    assert((this.negative | num.negative) === 0);
  	    return this.iuand(num);
  	  };

  	  // And `num` with `this`
  	  BN.prototype.and = function and (num) {
  	    if (this.length > num.length) return this.clone().iand(num);
  	    return num.clone().iand(this);
  	  };

  	  BN.prototype.uand = function uand (num) {
  	    if (this.length > num.length) return this.clone().iuand(num);
  	    return num.clone().iuand(this);
  	  };

  	  // Xor `num` with `this` in-place
  	  BN.prototype.iuxor = function iuxor (num) {
  	    // a.length > b.length
  	    var a;
  	    var b;
  	    if (this.length > num.length) {
  	      a = this;
  	      b = num;
  	    } else {
  	      a = num;
  	      b = this;
  	    }

  	    for (var i = 0; i < b.length; i++) {
  	      this.words[i] = a.words[i] ^ b.words[i];
  	    }

  	    if (this !== a) {
  	      for (; i < a.length; i++) {
  	        this.words[i] = a.words[i];
  	      }
  	    }

  	    this.length = a.length;

  	    return this._strip();
  	  };

  	  BN.prototype.ixor = function ixor (num) {
  	    assert((this.negative | num.negative) === 0);
  	    return this.iuxor(num);
  	  };

  	  // Xor `num` with `this`
  	  BN.prototype.xor = function xor (num) {
  	    if (this.length > num.length) return this.clone().ixor(num);
  	    return num.clone().ixor(this);
  	  };

  	  BN.prototype.uxor = function uxor (num) {
  	    if (this.length > num.length) return this.clone().iuxor(num);
  	    return num.clone().iuxor(this);
  	  };

  	  // Not ``this`` with ``width`` bitwidth
  	  BN.prototype.inotn = function inotn (width) {
  	    assert(typeof width === 'number' && width >= 0);

  	    var bytesNeeded = Math.ceil(width / 26) | 0;
  	    var bitsLeft = width % 26;

  	    // Extend the buffer with leading zeroes
  	    this._expand(bytesNeeded);

  	    if (bitsLeft > 0) {
  	      bytesNeeded--;
  	    }

  	    // Handle complete words
  	    for (var i = 0; i < bytesNeeded; i++) {
  	      this.words[i] = ~this.words[i] & 0x3ffffff;
  	    }

  	    // Handle the residue
  	    if (bitsLeft > 0) {
  	      this.words[i] = ~this.words[i] & (0x3ffffff >> (26 - bitsLeft));
  	    }

  	    // And remove leading zeroes
  	    return this._strip();
  	  };

  	  BN.prototype.notn = function notn (width) {
  	    return this.clone().inotn(width);
  	  };

  	  // Set `bit` of `this`
  	  BN.prototype.setn = function setn (bit, val) {
  	    assert(typeof bit === 'number' && bit >= 0);

  	    var off = (bit / 26) | 0;
  	    var wbit = bit % 26;

  	    this._expand(off + 1);

  	    if (val) {
  	      this.words[off] = this.words[off] | (1 << wbit);
  	    } else {
  	      this.words[off] = this.words[off] & ~(1 << wbit);
  	    }

  	    return this._strip();
  	  };

  	  // Add `num` to `this` in-place
  	  BN.prototype.iadd = function iadd (num) {
  	    var r;

  	    // negative + positive
  	    if (this.negative !== 0 && num.negative === 0) {
  	      this.negative = 0;
  	      r = this.isub(num);
  	      this.negative ^= 1;
  	      return this._normSign();

  	    // positive + negative
  	    } else if (this.negative === 0 && num.negative !== 0) {
  	      num.negative = 0;
  	      r = this.isub(num);
  	      num.negative = 1;
  	      return r._normSign();
  	    }

  	    // a.length > b.length
  	    var a, b;
  	    if (this.length > num.length) {
  	      a = this;
  	      b = num;
  	    } else {
  	      a = num;
  	      b = this;
  	    }

  	    var carry = 0;
  	    for (var i = 0; i < b.length; i++) {
  	      r = (a.words[i] | 0) + (b.words[i] | 0) + carry;
  	      this.words[i] = r & 0x3ffffff;
  	      carry = r >>> 26;
  	    }
  	    for (; carry !== 0 && i < a.length; i++) {
  	      r = (a.words[i] | 0) + carry;
  	      this.words[i] = r & 0x3ffffff;
  	      carry = r >>> 26;
  	    }

  	    this.length = a.length;
  	    if (carry !== 0) {
  	      this.words[this.length] = carry;
  	      this.length++;
  	    // Copy the rest of the words
  	    } else if (a !== this) {
  	      for (; i < a.length; i++) {
  	        this.words[i] = a.words[i];
  	      }
  	    }

  	    return this;
  	  };

  	  // Add `num` to `this`
  	  BN.prototype.add = function add (num) {
  	    var res;
  	    if (num.negative !== 0 && this.negative === 0) {
  	      num.negative = 0;
  	      res = this.sub(num);
  	      num.negative ^= 1;
  	      return res;
  	    } else if (num.negative === 0 && this.negative !== 0) {
  	      this.negative = 0;
  	      res = num.sub(this);
  	      this.negative = 1;
  	      return res;
  	    }

  	    if (this.length > num.length) return this.clone().iadd(num);

  	    return num.clone().iadd(this);
  	  };

  	  // Subtract `num` from `this` in-place
  	  BN.prototype.isub = function isub (num) {
  	    // this - (-num) = this + num
  	    if (num.negative !== 0) {
  	      num.negative = 0;
  	      var r = this.iadd(num);
  	      num.negative = 1;
  	      return r._normSign();

  	    // -this - num = -(this + num)
  	    } else if (this.negative !== 0) {
  	      this.negative = 0;
  	      this.iadd(num);
  	      this.negative = 1;
  	      return this._normSign();
  	    }

  	    // At this point both numbers are positive
  	    var cmp = this.cmp(num);

  	    // Optimization - zeroify
  	    if (cmp === 0) {
  	      this.negative = 0;
  	      this.length = 1;
  	      this.words[0] = 0;
  	      return this;
  	    }

  	    // a > b
  	    var a, b;
  	    if (cmp > 0) {
  	      a = this;
  	      b = num;
  	    } else {
  	      a = num;
  	      b = this;
  	    }

  	    var carry = 0;
  	    for (var i = 0; i < b.length; i++) {
  	      r = (a.words[i] | 0) - (b.words[i] | 0) + carry;
  	      carry = r >> 26;
  	      this.words[i] = r & 0x3ffffff;
  	    }
  	    for (; carry !== 0 && i < a.length; i++) {
  	      r = (a.words[i] | 0) + carry;
  	      carry = r >> 26;
  	      this.words[i] = r & 0x3ffffff;
  	    }

  	    // Copy rest of the words
  	    if (carry === 0 && i < a.length && a !== this) {
  	      for (; i < a.length; i++) {
  	        this.words[i] = a.words[i];
  	      }
  	    }

  	    this.length = Math.max(this.length, i);

  	    if (a !== this) {
  	      this.negative = 1;
  	    }

  	    return this._strip();
  	  };

  	  // Subtract `num` from `this`
  	  BN.prototype.sub = function sub (num) {
  	    return this.clone().isub(num);
  	  };

  	  function smallMulTo (self, num, out) {
  	    out.negative = num.negative ^ self.negative;
  	    var len = (self.length + num.length) | 0;
  	    out.length = len;
  	    len = (len - 1) | 0;

  	    // Peel one iteration (compiler can't do it, because of code complexity)
  	    var a = self.words[0] | 0;
  	    var b = num.words[0] | 0;
  	    var r = a * b;

  	    var lo = r & 0x3ffffff;
  	    var carry = (r / 0x4000000) | 0;
  	    out.words[0] = lo;

  	    for (var k = 1; k < len; k++) {
  	      // Sum all words with the same `i + j = k` and accumulate `ncarry`,
  	      // note that ncarry could be >= 0x3ffffff
  	      var ncarry = carry >>> 26;
  	      var rword = carry & 0x3ffffff;
  	      var maxJ = Math.min(k, num.length - 1);
  	      for (var j = Math.max(0, k - self.length + 1); j <= maxJ; j++) {
  	        var i = (k - j) | 0;
  	        a = self.words[i] | 0;
  	        b = num.words[j] | 0;
  	        r = a * b + rword;
  	        ncarry += (r / 0x4000000) | 0;
  	        rword = r & 0x3ffffff;
  	      }
  	      out.words[k] = rword | 0;
  	      carry = ncarry | 0;
  	    }
  	    if (carry !== 0) {
  	      out.words[k] = carry | 0;
  	    } else {
  	      out.length--;
  	    }

  	    return out._strip();
  	  }

  	  // TODO(indutny): it may be reasonable to omit it for users who don't need
  	  // to work with 256-bit numbers, otherwise it gives 20% improvement for 256-bit
  	  // multiplication (like elliptic secp256k1).
  	  var comb10MulTo = function comb10MulTo (self, num, out) {
  	    var a = self.words;
  	    var b = num.words;
  	    var o = out.words;
  	    var c = 0;
  	    var lo;
  	    var mid;
  	    var hi;
  	    var a0 = a[0] | 0;
  	    var al0 = a0 & 0x1fff;
  	    var ah0 = a0 >>> 13;
  	    var a1 = a[1] | 0;
  	    var al1 = a1 & 0x1fff;
  	    var ah1 = a1 >>> 13;
  	    var a2 = a[2] | 0;
  	    var al2 = a2 & 0x1fff;
  	    var ah2 = a2 >>> 13;
  	    var a3 = a[3] | 0;
  	    var al3 = a3 & 0x1fff;
  	    var ah3 = a3 >>> 13;
  	    var a4 = a[4] | 0;
  	    var al4 = a4 & 0x1fff;
  	    var ah4 = a4 >>> 13;
  	    var a5 = a[5] | 0;
  	    var al5 = a5 & 0x1fff;
  	    var ah5 = a5 >>> 13;
  	    var a6 = a[6] | 0;
  	    var al6 = a6 & 0x1fff;
  	    var ah6 = a6 >>> 13;
  	    var a7 = a[7] | 0;
  	    var al7 = a7 & 0x1fff;
  	    var ah7 = a7 >>> 13;
  	    var a8 = a[8] | 0;
  	    var al8 = a8 & 0x1fff;
  	    var ah8 = a8 >>> 13;
  	    var a9 = a[9] | 0;
  	    var al9 = a9 & 0x1fff;
  	    var ah9 = a9 >>> 13;
  	    var b0 = b[0] | 0;
  	    var bl0 = b0 & 0x1fff;
  	    var bh0 = b0 >>> 13;
  	    var b1 = b[1] | 0;
  	    var bl1 = b1 & 0x1fff;
  	    var bh1 = b1 >>> 13;
  	    var b2 = b[2] | 0;
  	    var bl2 = b2 & 0x1fff;
  	    var bh2 = b2 >>> 13;
  	    var b3 = b[3] | 0;
  	    var bl3 = b3 & 0x1fff;
  	    var bh3 = b3 >>> 13;
  	    var b4 = b[4] | 0;
  	    var bl4 = b4 & 0x1fff;
  	    var bh4 = b4 >>> 13;
  	    var b5 = b[5] | 0;
  	    var bl5 = b5 & 0x1fff;
  	    var bh5 = b5 >>> 13;
  	    var b6 = b[6] | 0;
  	    var bl6 = b6 & 0x1fff;
  	    var bh6 = b6 >>> 13;
  	    var b7 = b[7] | 0;
  	    var bl7 = b7 & 0x1fff;
  	    var bh7 = b7 >>> 13;
  	    var b8 = b[8] | 0;
  	    var bl8 = b8 & 0x1fff;
  	    var bh8 = b8 >>> 13;
  	    var b9 = b[9] | 0;
  	    var bl9 = b9 & 0x1fff;
  	    var bh9 = b9 >>> 13;

  	    out.negative = self.negative ^ num.negative;
  	    out.length = 19;
  	    /* k = 0 */
  	    lo = Math.imul(al0, bl0);
  	    mid = Math.imul(al0, bh0);
  	    mid = (mid + Math.imul(ah0, bl0)) | 0;
  	    hi = Math.imul(ah0, bh0);
  	    var w0 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w0 >>> 26)) | 0;
  	    w0 &= 0x3ffffff;
  	    /* k = 1 */
  	    lo = Math.imul(al1, bl0);
  	    mid = Math.imul(al1, bh0);
  	    mid = (mid + Math.imul(ah1, bl0)) | 0;
  	    hi = Math.imul(ah1, bh0);
  	    lo = (lo + Math.imul(al0, bl1)) | 0;
  	    mid = (mid + Math.imul(al0, bh1)) | 0;
  	    mid = (mid + Math.imul(ah0, bl1)) | 0;
  	    hi = (hi + Math.imul(ah0, bh1)) | 0;
  	    var w1 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w1 >>> 26)) | 0;
  	    w1 &= 0x3ffffff;
  	    /* k = 2 */
  	    lo = Math.imul(al2, bl0);
  	    mid = Math.imul(al2, bh0);
  	    mid = (mid + Math.imul(ah2, bl0)) | 0;
  	    hi = Math.imul(ah2, bh0);
  	    lo = (lo + Math.imul(al1, bl1)) | 0;
  	    mid = (mid + Math.imul(al1, bh1)) | 0;
  	    mid = (mid + Math.imul(ah1, bl1)) | 0;
  	    hi = (hi + Math.imul(ah1, bh1)) | 0;
  	    lo = (lo + Math.imul(al0, bl2)) | 0;
  	    mid = (mid + Math.imul(al0, bh2)) | 0;
  	    mid = (mid + Math.imul(ah0, bl2)) | 0;
  	    hi = (hi + Math.imul(ah0, bh2)) | 0;
  	    var w2 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w2 >>> 26)) | 0;
  	    w2 &= 0x3ffffff;
  	    /* k = 3 */
  	    lo = Math.imul(al3, bl0);
  	    mid = Math.imul(al3, bh0);
  	    mid = (mid + Math.imul(ah3, bl0)) | 0;
  	    hi = Math.imul(ah3, bh0);
  	    lo = (lo + Math.imul(al2, bl1)) | 0;
  	    mid = (mid + Math.imul(al2, bh1)) | 0;
  	    mid = (mid + Math.imul(ah2, bl1)) | 0;
  	    hi = (hi + Math.imul(ah2, bh1)) | 0;
  	    lo = (lo + Math.imul(al1, bl2)) | 0;
  	    mid = (mid + Math.imul(al1, bh2)) | 0;
  	    mid = (mid + Math.imul(ah1, bl2)) | 0;
  	    hi = (hi + Math.imul(ah1, bh2)) | 0;
  	    lo = (lo + Math.imul(al0, bl3)) | 0;
  	    mid = (mid + Math.imul(al0, bh3)) | 0;
  	    mid = (mid + Math.imul(ah0, bl3)) | 0;
  	    hi = (hi + Math.imul(ah0, bh3)) | 0;
  	    var w3 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w3 >>> 26)) | 0;
  	    w3 &= 0x3ffffff;
  	    /* k = 4 */
  	    lo = Math.imul(al4, bl0);
  	    mid = Math.imul(al4, bh0);
  	    mid = (mid + Math.imul(ah4, bl0)) | 0;
  	    hi = Math.imul(ah4, bh0);
  	    lo = (lo + Math.imul(al3, bl1)) | 0;
  	    mid = (mid + Math.imul(al3, bh1)) | 0;
  	    mid = (mid + Math.imul(ah3, bl1)) | 0;
  	    hi = (hi + Math.imul(ah3, bh1)) | 0;
  	    lo = (lo + Math.imul(al2, bl2)) | 0;
  	    mid = (mid + Math.imul(al2, bh2)) | 0;
  	    mid = (mid + Math.imul(ah2, bl2)) | 0;
  	    hi = (hi + Math.imul(ah2, bh2)) | 0;
  	    lo = (lo + Math.imul(al1, bl3)) | 0;
  	    mid = (mid + Math.imul(al1, bh3)) | 0;
  	    mid = (mid + Math.imul(ah1, bl3)) | 0;
  	    hi = (hi + Math.imul(ah1, bh3)) | 0;
  	    lo = (lo + Math.imul(al0, bl4)) | 0;
  	    mid = (mid + Math.imul(al0, bh4)) | 0;
  	    mid = (mid + Math.imul(ah0, bl4)) | 0;
  	    hi = (hi + Math.imul(ah0, bh4)) | 0;
  	    var w4 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w4 >>> 26)) | 0;
  	    w4 &= 0x3ffffff;
  	    /* k = 5 */
  	    lo = Math.imul(al5, bl0);
  	    mid = Math.imul(al5, bh0);
  	    mid = (mid + Math.imul(ah5, bl0)) | 0;
  	    hi = Math.imul(ah5, bh0);
  	    lo = (lo + Math.imul(al4, bl1)) | 0;
  	    mid = (mid + Math.imul(al4, bh1)) | 0;
  	    mid = (mid + Math.imul(ah4, bl1)) | 0;
  	    hi = (hi + Math.imul(ah4, bh1)) | 0;
  	    lo = (lo + Math.imul(al3, bl2)) | 0;
  	    mid = (mid + Math.imul(al3, bh2)) | 0;
  	    mid = (mid + Math.imul(ah3, bl2)) | 0;
  	    hi = (hi + Math.imul(ah3, bh2)) | 0;
  	    lo = (lo + Math.imul(al2, bl3)) | 0;
  	    mid = (mid + Math.imul(al2, bh3)) | 0;
  	    mid = (mid + Math.imul(ah2, bl3)) | 0;
  	    hi = (hi + Math.imul(ah2, bh3)) | 0;
  	    lo = (lo + Math.imul(al1, bl4)) | 0;
  	    mid = (mid + Math.imul(al1, bh4)) | 0;
  	    mid = (mid + Math.imul(ah1, bl4)) | 0;
  	    hi = (hi + Math.imul(ah1, bh4)) | 0;
  	    lo = (lo + Math.imul(al0, bl5)) | 0;
  	    mid = (mid + Math.imul(al0, bh5)) | 0;
  	    mid = (mid + Math.imul(ah0, bl5)) | 0;
  	    hi = (hi + Math.imul(ah0, bh5)) | 0;
  	    var w5 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w5 >>> 26)) | 0;
  	    w5 &= 0x3ffffff;
  	    /* k = 6 */
  	    lo = Math.imul(al6, bl0);
  	    mid = Math.imul(al6, bh0);
  	    mid = (mid + Math.imul(ah6, bl0)) | 0;
  	    hi = Math.imul(ah6, bh0);
  	    lo = (lo + Math.imul(al5, bl1)) | 0;
  	    mid = (mid + Math.imul(al5, bh1)) | 0;
  	    mid = (mid + Math.imul(ah5, bl1)) | 0;
  	    hi = (hi + Math.imul(ah5, bh1)) | 0;
  	    lo = (lo + Math.imul(al4, bl2)) | 0;
  	    mid = (mid + Math.imul(al4, bh2)) | 0;
  	    mid = (mid + Math.imul(ah4, bl2)) | 0;
  	    hi = (hi + Math.imul(ah4, bh2)) | 0;
  	    lo = (lo + Math.imul(al3, bl3)) | 0;
  	    mid = (mid + Math.imul(al3, bh3)) | 0;
  	    mid = (mid + Math.imul(ah3, bl3)) | 0;
  	    hi = (hi + Math.imul(ah3, bh3)) | 0;
  	    lo = (lo + Math.imul(al2, bl4)) | 0;
  	    mid = (mid + Math.imul(al2, bh4)) | 0;
  	    mid = (mid + Math.imul(ah2, bl4)) | 0;
  	    hi = (hi + Math.imul(ah2, bh4)) | 0;
  	    lo = (lo + Math.imul(al1, bl5)) | 0;
  	    mid = (mid + Math.imul(al1, bh5)) | 0;
  	    mid = (mid + Math.imul(ah1, bl5)) | 0;
  	    hi = (hi + Math.imul(ah1, bh5)) | 0;
  	    lo = (lo + Math.imul(al0, bl6)) | 0;
  	    mid = (mid + Math.imul(al0, bh6)) | 0;
  	    mid = (mid + Math.imul(ah0, bl6)) | 0;
  	    hi = (hi + Math.imul(ah0, bh6)) | 0;
  	    var w6 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w6 >>> 26)) | 0;
  	    w6 &= 0x3ffffff;
  	    /* k = 7 */
  	    lo = Math.imul(al7, bl0);
  	    mid = Math.imul(al7, bh0);
  	    mid = (mid + Math.imul(ah7, bl0)) | 0;
  	    hi = Math.imul(ah7, bh0);
  	    lo = (lo + Math.imul(al6, bl1)) | 0;
  	    mid = (mid + Math.imul(al6, bh1)) | 0;
  	    mid = (mid + Math.imul(ah6, bl1)) | 0;
  	    hi = (hi + Math.imul(ah6, bh1)) | 0;
  	    lo = (lo + Math.imul(al5, bl2)) | 0;
  	    mid = (mid + Math.imul(al5, bh2)) | 0;
  	    mid = (mid + Math.imul(ah5, bl2)) | 0;
  	    hi = (hi + Math.imul(ah5, bh2)) | 0;
  	    lo = (lo + Math.imul(al4, bl3)) | 0;
  	    mid = (mid + Math.imul(al4, bh3)) | 0;
  	    mid = (mid + Math.imul(ah4, bl3)) | 0;
  	    hi = (hi + Math.imul(ah4, bh3)) | 0;
  	    lo = (lo + Math.imul(al3, bl4)) | 0;
  	    mid = (mid + Math.imul(al3, bh4)) | 0;
  	    mid = (mid + Math.imul(ah3, bl4)) | 0;
  	    hi = (hi + Math.imul(ah3, bh4)) | 0;
  	    lo = (lo + Math.imul(al2, bl5)) | 0;
  	    mid = (mid + Math.imul(al2, bh5)) | 0;
  	    mid = (mid + Math.imul(ah2, bl5)) | 0;
  	    hi = (hi + Math.imul(ah2, bh5)) | 0;
  	    lo = (lo + Math.imul(al1, bl6)) | 0;
  	    mid = (mid + Math.imul(al1, bh6)) | 0;
  	    mid = (mid + Math.imul(ah1, bl6)) | 0;
  	    hi = (hi + Math.imul(ah1, bh6)) | 0;
  	    lo = (lo + Math.imul(al0, bl7)) | 0;
  	    mid = (mid + Math.imul(al0, bh7)) | 0;
  	    mid = (mid + Math.imul(ah0, bl7)) | 0;
  	    hi = (hi + Math.imul(ah0, bh7)) | 0;
  	    var w7 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w7 >>> 26)) | 0;
  	    w7 &= 0x3ffffff;
  	    /* k = 8 */
  	    lo = Math.imul(al8, bl0);
  	    mid = Math.imul(al8, bh0);
  	    mid = (mid + Math.imul(ah8, bl0)) | 0;
  	    hi = Math.imul(ah8, bh0);
  	    lo = (lo + Math.imul(al7, bl1)) | 0;
  	    mid = (mid + Math.imul(al7, bh1)) | 0;
  	    mid = (mid + Math.imul(ah7, bl1)) | 0;
  	    hi = (hi + Math.imul(ah7, bh1)) | 0;
  	    lo = (lo + Math.imul(al6, bl2)) | 0;
  	    mid = (mid + Math.imul(al6, bh2)) | 0;
  	    mid = (mid + Math.imul(ah6, bl2)) | 0;
  	    hi = (hi + Math.imul(ah6, bh2)) | 0;
  	    lo = (lo + Math.imul(al5, bl3)) | 0;
  	    mid = (mid + Math.imul(al5, bh3)) | 0;
  	    mid = (mid + Math.imul(ah5, bl3)) | 0;
  	    hi = (hi + Math.imul(ah5, bh3)) | 0;
  	    lo = (lo + Math.imul(al4, bl4)) | 0;
  	    mid = (mid + Math.imul(al4, bh4)) | 0;
  	    mid = (mid + Math.imul(ah4, bl4)) | 0;
  	    hi = (hi + Math.imul(ah4, bh4)) | 0;
  	    lo = (lo + Math.imul(al3, bl5)) | 0;
  	    mid = (mid + Math.imul(al3, bh5)) | 0;
  	    mid = (mid + Math.imul(ah3, bl5)) | 0;
  	    hi = (hi + Math.imul(ah3, bh5)) | 0;
  	    lo = (lo + Math.imul(al2, bl6)) | 0;
  	    mid = (mid + Math.imul(al2, bh6)) | 0;
  	    mid = (mid + Math.imul(ah2, bl6)) | 0;
  	    hi = (hi + Math.imul(ah2, bh6)) | 0;
  	    lo = (lo + Math.imul(al1, bl7)) | 0;
  	    mid = (mid + Math.imul(al1, bh7)) | 0;
  	    mid = (mid + Math.imul(ah1, bl7)) | 0;
  	    hi = (hi + Math.imul(ah1, bh7)) | 0;
  	    lo = (lo + Math.imul(al0, bl8)) | 0;
  	    mid = (mid + Math.imul(al0, bh8)) | 0;
  	    mid = (mid + Math.imul(ah0, bl8)) | 0;
  	    hi = (hi + Math.imul(ah0, bh8)) | 0;
  	    var w8 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w8 >>> 26)) | 0;
  	    w8 &= 0x3ffffff;
  	    /* k = 9 */
  	    lo = Math.imul(al9, bl0);
  	    mid = Math.imul(al9, bh0);
  	    mid = (mid + Math.imul(ah9, bl0)) | 0;
  	    hi = Math.imul(ah9, bh0);
  	    lo = (lo + Math.imul(al8, bl1)) | 0;
  	    mid = (mid + Math.imul(al8, bh1)) | 0;
  	    mid = (mid + Math.imul(ah8, bl1)) | 0;
  	    hi = (hi + Math.imul(ah8, bh1)) | 0;
  	    lo = (lo + Math.imul(al7, bl2)) | 0;
  	    mid = (mid + Math.imul(al7, bh2)) | 0;
  	    mid = (mid + Math.imul(ah7, bl2)) | 0;
  	    hi = (hi + Math.imul(ah7, bh2)) | 0;
  	    lo = (lo + Math.imul(al6, bl3)) | 0;
  	    mid = (mid + Math.imul(al6, bh3)) | 0;
  	    mid = (mid + Math.imul(ah6, bl3)) | 0;
  	    hi = (hi + Math.imul(ah6, bh3)) | 0;
  	    lo = (lo + Math.imul(al5, bl4)) | 0;
  	    mid = (mid + Math.imul(al5, bh4)) | 0;
  	    mid = (mid + Math.imul(ah5, bl4)) | 0;
  	    hi = (hi + Math.imul(ah5, bh4)) | 0;
  	    lo = (lo + Math.imul(al4, bl5)) | 0;
  	    mid = (mid + Math.imul(al4, bh5)) | 0;
  	    mid = (mid + Math.imul(ah4, bl5)) | 0;
  	    hi = (hi + Math.imul(ah4, bh5)) | 0;
  	    lo = (lo + Math.imul(al3, bl6)) | 0;
  	    mid = (mid + Math.imul(al3, bh6)) | 0;
  	    mid = (mid + Math.imul(ah3, bl6)) | 0;
  	    hi = (hi + Math.imul(ah3, bh6)) | 0;
  	    lo = (lo + Math.imul(al2, bl7)) | 0;
  	    mid = (mid + Math.imul(al2, bh7)) | 0;
  	    mid = (mid + Math.imul(ah2, bl7)) | 0;
  	    hi = (hi + Math.imul(ah2, bh7)) | 0;
  	    lo = (lo + Math.imul(al1, bl8)) | 0;
  	    mid = (mid + Math.imul(al1, bh8)) | 0;
  	    mid = (mid + Math.imul(ah1, bl8)) | 0;
  	    hi = (hi + Math.imul(ah1, bh8)) | 0;
  	    lo = (lo + Math.imul(al0, bl9)) | 0;
  	    mid = (mid + Math.imul(al0, bh9)) | 0;
  	    mid = (mid + Math.imul(ah0, bl9)) | 0;
  	    hi = (hi + Math.imul(ah0, bh9)) | 0;
  	    var w9 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w9 >>> 26)) | 0;
  	    w9 &= 0x3ffffff;
  	    /* k = 10 */
  	    lo = Math.imul(al9, bl1);
  	    mid = Math.imul(al9, bh1);
  	    mid = (mid + Math.imul(ah9, bl1)) | 0;
  	    hi = Math.imul(ah9, bh1);
  	    lo = (lo + Math.imul(al8, bl2)) | 0;
  	    mid = (mid + Math.imul(al8, bh2)) | 0;
  	    mid = (mid + Math.imul(ah8, bl2)) | 0;
  	    hi = (hi + Math.imul(ah8, bh2)) | 0;
  	    lo = (lo + Math.imul(al7, bl3)) | 0;
  	    mid = (mid + Math.imul(al7, bh3)) | 0;
  	    mid = (mid + Math.imul(ah7, bl3)) | 0;
  	    hi = (hi + Math.imul(ah7, bh3)) | 0;
  	    lo = (lo + Math.imul(al6, bl4)) | 0;
  	    mid = (mid + Math.imul(al6, bh4)) | 0;
  	    mid = (mid + Math.imul(ah6, bl4)) | 0;
  	    hi = (hi + Math.imul(ah6, bh4)) | 0;
  	    lo = (lo + Math.imul(al5, bl5)) | 0;
  	    mid = (mid + Math.imul(al5, bh5)) | 0;
  	    mid = (mid + Math.imul(ah5, bl5)) | 0;
  	    hi = (hi + Math.imul(ah5, bh5)) | 0;
  	    lo = (lo + Math.imul(al4, bl6)) | 0;
  	    mid = (mid + Math.imul(al4, bh6)) | 0;
  	    mid = (mid + Math.imul(ah4, bl6)) | 0;
  	    hi = (hi + Math.imul(ah4, bh6)) | 0;
  	    lo = (lo + Math.imul(al3, bl7)) | 0;
  	    mid = (mid + Math.imul(al3, bh7)) | 0;
  	    mid = (mid + Math.imul(ah3, bl7)) | 0;
  	    hi = (hi + Math.imul(ah3, bh7)) | 0;
  	    lo = (lo + Math.imul(al2, bl8)) | 0;
  	    mid = (mid + Math.imul(al2, bh8)) | 0;
  	    mid = (mid + Math.imul(ah2, bl8)) | 0;
  	    hi = (hi + Math.imul(ah2, bh8)) | 0;
  	    lo = (lo + Math.imul(al1, bl9)) | 0;
  	    mid = (mid + Math.imul(al1, bh9)) | 0;
  	    mid = (mid + Math.imul(ah1, bl9)) | 0;
  	    hi = (hi + Math.imul(ah1, bh9)) | 0;
  	    var w10 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w10 >>> 26)) | 0;
  	    w10 &= 0x3ffffff;
  	    /* k = 11 */
  	    lo = Math.imul(al9, bl2);
  	    mid = Math.imul(al9, bh2);
  	    mid = (mid + Math.imul(ah9, bl2)) | 0;
  	    hi = Math.imul(ah9, bh2);
  	    lo = (lo + Math.imul(al8, bl3)) | 0;
  	    mid = (mid + Math.imul(al8, bh3)) | 0;
  	    mid = (mid + Math.imul(ah8, bl3)) | 0;
  	    hi = (hi + Math.imul(ah8, bh3)) | 0;
  	    lo = (lo + Math.imul(al7, bl4)) | 0;
  	    mid = (mid + Math.imul(al7, bh4)) | 0;
  	    mid = (mid + Math.imul(ah7, bl4)) | 0;
  	    hi = (hi + Math.imul(ah7, bh4)) | 0;
  	    lo = (lo + Math.imul(al6, bl5)) | 0;
  	    mid = (mid + Math.imul(al6, bh5)) | 0;
  	    mid = (mid + Math.imul(ah6, bl5)) | 0;
  	    hi = (hi + Math.imul(ah6, bh5)) | 0;
  	    lo = (lo + Math.imul(al5, bl6)) | 0;
  	    mid = (mid + Math.imul(al5, bh6)) | 0;
  	    mid = (mid + Math.imul(ah5, bl6)) | 0;
  	    hi = (hi + Math.imul(ah5, bh6)) | 0;
  	    lo = (lo + Math.imul(al4, bl7)) | 0;
  	    mid = (mid + Math.imul(al4, bh7)) | 0;
  	    mid = (mid + Math.imul(ah4, bl7)) | 0;
  	    hi = (hi + Math.imul(ah4, bh7)) | 0;
  	    lo = (lo + Math.imul(al3, bl8)) | 0;
  	    mid = (mid + Math.imul(al3, bh8)) | 0;
  	    mid = (mid + Math.imul(ah3, bl8)) | 0;
  	    hi = (hi + Math.imul(ah3, bh8)) | 0;
  	    lo = (lo + Math.imul(al2, bl9)) | 0;
  	    mid = (mid + Math.imul(al2, bh9)) | 0;
  	    mid = (mid + Math.imul(ah2, bl9)) | 0;
  	    hi = (hi + Math.imul(ah2, bh9)) | 0;
  	    var w11 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w11 >>> 26)) | 0;
  	    w11 &= 0x3ffffff;
  	    /* k = 12 */
  	    lo = Math.imul(al9, bl3);
  	    mid = Math.imul(al9, bh3);
  	    mid = (mid + Math.imul(ah9, bl3)) | 0;
  	    hi = Math.imul(ah9, bh3);
  	    lo = (lo + Math.imul(al8, bl4)) | 0;
  	    mid = (mid + Math.imul(al8, bh4)) | 0;
  	    mid = (mid + Math.imul(ah8, bl4)) | 0;
  	    hi = (hi + Math.imul(ah8, bh4)) | 0;
  	    lo = (lo + Math.imul(al7, bl5)) | 0;
  	    mid = (mid + Math.imul(al7, bh5)) | 0;
  	    mid = (mid + Math.imul(ah7, bl5)) | 0;
  	    hi = (hi + Math.imul(ah7, bh5)) | 0;
  	    lo = (lo + Math.imul(al6, bl6)) | 0;
  	    mid = (mid + Math.imul(al6, bh6)) | 0;
  	    mid = (mid + Math.imul(ah6, bl6)) | 0;
  	    hi = (hi + Math.imul(ah6, bh6)) | 0;
  	    lo = (lo + Math.imul(al5, bl7)) | 0;
  	    mid = (mid + Math.imul(al5, bh7)) | 0;
  	    mid = (mid + Math.imul(ah5, bl7)) | 0;
  	    hi = (hi + Math.imul(ah5, bh7)) | 0;
  	    lo = (lo + Math.imul(al4, bl8)) | 0;
  	    mid = (mid + Math.imul(al4, bh8)) | 0;
  	    mid = (mid + Math.imul(ah4, bl8)) | 0;
  	    hi = (hi + Math.imul(ah4, bh8)) | 0;
  	    lo = (lo + Math.imul(al3, bl9)) | 0;
  	    mid = (mid + Math.imul(al3, bh9)) | 0;
  	    mid = (mid + Math.imul(ah3, bl9)) | 0;
  	    hi = (hi + Math.imul(ah3, bh9)) | 0;
  	    var w12 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w12 >>> 26)) | 0;
  	    w12 &= 0x3ffffff;
  	    /* k = 13 */
  	    lo = Math.imul(al9, bl4);
  	    mid = Math.imul(al9, bh4);
  	    mid = (mid + Math.imul(ah9, bl4)) | 0;
  	    hi = Math.imul(ah9, bh4);
  	    lo = (lo + Math.imul(al8, bl5)) | 0;
  	    mid = (mid + Math.imul(al8, bh5)) | 0;
  	    mid = (mid + Math.imul(ah8, bl5)) | 0;
  	    hi = (hi + Math.imul(ah8, bh5)) | 0;
  	    lo = (lo + Math.imul(al7, bl6)) | 0;
  	    mid = (mid + Math.imul(al7, bh6)) | 0;
  	    mid = (mid + Math.imul(ah7, bl6)) | 0;
  	    hi = (hi + Math.imul(ah7, bh6)) | 0;
  	    lo = (lo + Math.imul(al6, bl7)) | 0;
  	    mid = (mid + Math.imul(al6, bh7)) | 0;
  	    mid = (mid + Math.imul(ah6, bl7)) | 0;
  	    hi = (hi + Math.imul(ah6, bh7)) | 0;
  	    lo = (lo + Math.imul(al5, bl8)) | 0;
  	    mid = (mid + Math.imul(al5, bh8)) | 0;
  	    mid = (mid + Math.imul(ah5, bl8)) | 0;
  	    hi = (hi + Math.imul(ah5, bh8)) | 0;
  	    lo = (lo + Math.imul(al4, bl9)) | 0;
  	    mid = (mid + Math.imul(al4, bh9)) | 0;
  	    mid = (mid + Math.imul(ah4, bl9)) | 0;
  	    hi = (hi + Math.imul(ah4, bh9)) | 0;
  	    var w13 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w13 >>> 26)) | 0;
  	    w13 &= 0x3ffffff;
  	    /* k = 14 */
  	    lo = Math.imul(al9, bl5);
  	    mid = Math.imul(al9, bh5);
  	    mid = (mid + Math.imul(ah9, bl5)) | 0;
  	    hi = Math.imul(ah9, bh5);
  	    lo = (lo + Math.imul(al8, bl6)) | 0;
  	    mid = (mid + Math.imul(al8, bh6)) | 0;
  	    mid = (mid + Math.imul(ah8, bl6)) | 0;
  	    hi = (hi + Math.imul(ah8, bh6)) | 0;
  	    lo = (lo + Math.imul(al7, bl7)) | 0;
  	    mid = (mid + Math.imul(al7, bh7)) | 0;
  	    mid = (mid + Math.imul(ah7, bl7)) | 0;
  	    hi = (hi + Math.imul(ah7, bh7)) | 0;
  	    lo = (lo + Math.imul(al6, bl8)) | 0;
  	    mid = (mid + Math.imul(al6, bh8)) | 0;
  	    mid = (mid + Math.imul(ah6, bl8)) | 0;
  	    hi = (hi + Math.imul(ah6, bh8)) | 0;
  	    lo = (lo + Math.imul(al5, bl9)) | 0;
  	    mid = (mid + Math.imul(al5, bh9)) | 0;
  	    mid = (mid + Math.imul(ah5, bl9)) | 0;
  	    hi = (hi + Math.imul(ah5, bh9)) | 0;
  	    var w14 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w14 >>> 26)) | 0;
  	    w14 &= 0x3ffffff;
  	    /* k = 15 */
  	    lo = Math.imul(al9, bl6);
  	    mid = Math.imul(al9, bh6);
  	    mid = (mid + Math.imul(ah9, bl6)) | 0;
  	    hi = Math.imul(ah9, bh6);
  	    lo = (lo + Math.imul(al8, bl7)) | 0;
  	    mid = (mid + Math.imul(al8, bh7)) | 0;
  	    mid = (mid + Math.imul(ah8, bl7)) | 0;
  	    hi = (hi + Math.imul(ah8, bh7)) | 0;
  	    lo = (lo + Math.imul(al7, bl8)) | 0;
  	    mid = (mid + Math.imul(al7, bh8)) | 0;
  	    mid = (mid + Math.imul(ah7, bl8)) | 0;
  	    hi = (hi + Math.imul(ah7, bh8)) | 0;
  	    lo = (lo + Math.imul(al6, bl9)) | 0;
  	    mid = (mid + Math.imul(al6, bh9)) | 0;
  	    mid = (mid + Math.imul(ah6, bl9)) | 0;
  	    hi = (hi + Math.imul(ah6, bh9)) | 0;
  	    var w15 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w15 >>> 26)) | 0;
  	    w15 &= 0x3ffffff;
  	    /* k = 16 */
  	    lo = Math.imul(al9, bl7);
  	    mid = Math.imul(al9, bh7);
  	    mid = (mid + Math.imul(ah9, bl7)) | 0;
  	    hi = Math.imul(ah9, bh7);
  	    lo = (lo + Math.imul(al8, bl8)) | 0;
  	    mid = (mid + Math.imul(al8, bh8)) | 0;
  	    mid = (mid + Math.imul(ah8, bl8)) | 0;
  	    hi = (hi + Math.imul(ah8, bh8)) | 0;
  	    lo = (lo + Math.imul(al7, bl9)) | 0;
  	    mid = (mid + Math.imul(al7, bh9)) | 0;
  	    mid = (mid + Math.imul(ah7, bl9)) | 0;
  	    hi = (hi + Math.imul(ah7, bh9)) | 0;
  	    var w16 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w16 >>> 26)) | 0;
  	    w16 &= 0x3ffffff;
  	    /* k = 17 */
  	    lo = Math.imul(al9, bl8);
  	    mid = Math.imul(al9, bh8);
  	    mid = (mid + Math.imul(ah9, bl8)) | 0;
  	    hi = Math.imul(ah9, bh8);
  	    lo = (lo + Math.imul(al8, bl9)) | 0;
  	    mid = (mid + Math.imul(al8, bh9)) | 0;
  	    mid = (mid + Math.imul(ah8, bl9)) | 0;
  	    hi = (hi + Math.imul(ah8, bh9)) | 0;
  	    var w17 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w17 >>> 26)) | 0;
  	    w17 &= 0x3ffffff;
  	    /* k = 18 */
  	    lo = Math.imul(al9, bl9);
  	    mid = Math.imul(al9, bh9);
  	    mid = (mid + Math.imul(ah9, bl9)) | 0;
  	    hi = Math.imul(ah9, bh9);
  	    var w18 = (((c + lo) | 0) + ((mid & 0x1fff) << 13)) | 0;
  	    c = (((hi + (mid >>> 13)) | 0) + (w18 >>> 26)) | 0;
  	    w18 &= 0x3ffffff;
  	    o[0] = w0;
  	    o[1] = w1;
  	    o[2] = w2;
  	    o[3] = w3;
  	    o[4] = w4;
  	    o[5] = w5;
  	    o[6] = w6;
  	    o[7] = w7;
  	    o[8] = w8;
  	    o[9] = w9;
  	    o[10] = w10;
  	    o[11] = w11;
  	    o[12] = w12;
  	    o[13] = w13;
  	    o[14] = w14;
  	    o[15] = w15;
  	    o[16] = w16;
  	    o[17] = w17;
  	    o[18] = w18;
  	    if (c !== 0) {
  	      o[19] = c;
  	      out.length++;
  	    }
  	    return out;
  	  };

  	  // Polyfill comb
  	  if (!Math.imul) {
  	    comb10MulTo = smallMulTo;
  	  }

  	  function bigMulTo (self, num, out) {
  	    out.negative = num.negative ^ self.negative;
  	    out.length = self.length + num.length;

  	    var carry = 0;
  	    var hncarry = 0;
  	    for (var k = 0; k < out.length - 1; k++) {
  	      // Sum all words with the same `i + j = k` and accumulate `ncarry`,
  	      // note that ncarry could be >= 0x3ffffff
  	      var ncarry = hncarry;
  	      hncarry = 0;
  	      var rword = carry & 0x3ffffff;
  	      var maxJ = Math.min(k, num.length - 1);
  	      for (var j = Math.max(0, k - self.length + 1); j <= maxJ; j++) {
  	        var i = k - j;
  	        var a = self.words[i] | 0;
  	        var b = num.words[j] | 0;
  	        var r = a * b;

  	        var lo = r & 0x3ffffff;
  	        ncarry = (ncarry + ((r / 0x4000000) | 0)) | 0;
  	        lo = (lo + rword) | 0;
  	        rword = lo & 0x3ffffff;
  	        ncarry = (ncarry + (lo >>> 26)) | 0;

  	        hncarry += ncarry >>> 26;
  	        ncarry &= 0x3ffffff;
  	      }
  	      out.words[k] = rword;
  	      carry = ncarry;
  	      ncarry = hncarry;
  	    }
  	    if (carry !== 0) {
  	      out.words[k] = carry;
  	    } else {
  	      out.length--;
  	    }

  	    return out._strip();
  	  }

  	  function jumboMulTo (self, num, out) {
  	    // Temporary disable, see https://github.com/indutny/bn.js/issues/211
  	    // var fftm = new FFTM();
  	    // return fftm.mulp(self, num, out);
  	    return bigMulTo(self, num, out);
  	  }

  	  BN.prototype.mulTo = function mulTo (num, out) {
  	    var res;
  	    var len = this.length + num.length;
  	    if (this.length === 10 && num.length === 10) {
  	      res = comb10MulTo(this, num, out);
  	    } else if (len < 63) {
  	      res = smallMulTo(this, num, out);
  	    } else if (len < 1024) {
  	      res = bigMulTo(this, num, out);
  	    } else {
  	      res = jumboMulTo(this, num, out);
  	    }

  	    return res;
  	  };

  	  // Multiply `this` by `num`
  	  BN.prototype.mul = function mul (num) {
  	    var out = new BN(null);
  	    out.words = new Array(this.length + num.length);
  	    return this.mulTo(num, out);
  	  };

  	  // Multiply employing FFT
  	  BN.prototype.mulf = function mulf (num) {
  	    var out = new BN(null);
  	    out.words = new Array(this.length + num.length);
  	    return jumboMulTo(this, num, out);
  	  };

  	  // In-place Multiplication
  	  BN.prototype.imul = function imul (num) {
  	    return this.clone().mulTo(num, this);
  	  };

  	  BN.prototype.imuln = function imuln (num) {
  	    var isNegNum = num < 0;
  	    if (isNegNum) num = -num;

  	    assert(typeof num === 'number');
  	    assert(num < 0x4000000);

  	    // Carry
  	    var carry = 0;
  	    for (var i = 0; i < this.length; i++) {
  	      var w = (this.words[i] | 0) * num;
  	      var lo = (w & 0x3ffffff) + (carry & 0x3ffffff);
  	      carry >>= 26;
  	      carry += (w / 0x4000000) | 0;
  	      // NOTE: lo is 27bit maximum
  	      carry += lo >>> 26;
  	      this.words[i] = lo & 0x3ffffff;
  	    }

  	    if (carry !== 0) {
  	      this.words[i] = carry;
  	      this.length++;
  	    }

  	    return isNegNum ? this.ineg() : this;
  	  };

  	  BN.prototype.muln = function muln (num) {
  	    return this.clone().imuln(num);
  	  };

  	  // `this` * `this`
  	  BN.prototype.sqr = function sqr () {
  	    return this.mul(this);
  	  };

  	  // `this` * `this` in-place
  	  BN.prototype.isqr = function isqr () {
  	    return this.imul(this.clone());
  	  };

  	  // Math.pow(`this`, `num`)
  	  BN.prototype.pow = function pow (num) {
  	    var w = toBitArray(num);
  	    if (w.length === 0) return new BN(1);

  	    // Skip leading zeroes
  	    var res = this;
  	    for (var i = 0; i < w.length; i++, res = res.sqr()) {
  	      if (w[i] !== 0) break;
  	    }

  	    if (++i < w.length) {
  	      for (var q = res.sqr(); i < w.length; i++, q = q.sqr()) {
  	        if (w[i] === 0) continue;

  	        res = res.mul(q);
  	      }
  	    }

  	    return res;
  	  };

  	  // Shift-left in-place
  	  BN.prototype.iushln = function iushln (bits) {
  	    assert(typeof bits === 'number' && bits >= 0);
  	    var r = bits % 26;
  	    var s = (bits - r) / 26;
  	    var carryMask = (0x3ffffff >>> (26 - r)) << (26 - r);
  	    var i;

  	    if (r !== 0) {
  	      var carry = 0;

  	      for (i = 0; i < this.length; i++) {
  	        var newCarry = this.words[i] & carryMask;
  	        var c = ((this.words[i] | 0) - newCarry) << r;
  	        this.words[i] = c | carry;
  	        carry = newCarry >>> (26 - r);
  	      }

  	      if (carry) {
  	        this.words[i] = carry;
  	        this.length++;
  	      }
  	    }

  	    if (s !== 0) {
  	      for (i = this.length - 1; i >= 0; i--) {
  	        this.words[i + s] = this.words[i];
  	      }

  	      for (i = 0; i < s; i++) {
  	        this.words[i] = 0;
  	      }

  	      this.length += s;
  	    }

  	    return this._strip();
  	  };

  	  BN.prototype.ishln = function ishln (bits) {
  	    // TODO(indutny): implement me
  	    assert(this.negative === 0);
  	    return this.iushln(bits);
  	  };

  	  // Shift-right in-place
  	  // NOTE: `hint` is a lowest bit before trailing zeroes
  	  // NOTE: if `extended` is present - it will be filled with destroyed bits
  	  BN.prototype.iushrn = function iushrn (bits, hint, extended) {
  	    assert(typeof bits === 'number' && bits >= 0);
  	    var h;
  	    if (hint) {
  	      h = (hint - (hint % 26)) / 26;
  	    } else {
  	      h = 0;
  	    }

  	    var r = bits % 26;
  	    var s = Math.min((bits - r) / 26, this.length);
  	    var mask = 0x3ffffff ^ ((0x3ffffff >>> r) << r);
  	    var maskedWords = extended;

  	    h -= s;
  	    h = Math.max(0, h);

  	    // Extended mode, copy masked part
  	    if (maskedWords) {
  	      for (var i = 0; i < s; i++) {
  	        maskedWords.words[i] = this.words[i];
  	      }
  	      maskedWords.length = s;
  	    }

  	    if (s === 0) ; else if (this.length > s) {
  	      this.length -= s;
  	      for (i = 0; i < this.length; i++) {
  	        this.words[i] = this.words[i + s];
  	      }
  	    } else {
  	      this.words[0] = 0;
  	      this.length = 1;
  	    }

  	    var carry = 0;
  	    for (i = this.length - 1; i >= 0 && (carry !== 0 || i >= h); i--) {
  	      var word = this.words[i] | 0;
  	      this.words[i] = (carry << (26 - r)) | (word >>> r);
  	      carry = word & mask;
  	    }

  	    // Push carried bits as a mask
  	    if (maskedWords && carry !== 0) {
  	      maskedWords.words[maskedWords.length++] = carry;
  	    }

  	    if (this.length === 0) {
  	      this.words[0] = 0;
  	      this.length = 1;
  	    }

  	    return this._strip();
  	  };

  	  BN.prototype.ishrn = function ishrn (bits, hint, extended) {
  	    // TODO(indutny): implement me
  	    assert(this.negative === 0);
  	    return this.iushrn(bits, hint, extended);
  	  };

  	  // Shift-left
  	  BN.prototype.shln = function shln (bits) {
  	    return this.clone().ishln(bits);
  	  };

  	  BN.prototype.ushln = function ushln (bits) {
  	    return this.clone().iushln(bits);
  	  };

  	  // Shift-right
  	  BN.prototype.shrn = function shrn (bits) {
  	    return this.clone().ishrn(bits);
  	  };

  	  BN.prototype.ushrn = function ushrn (bits) {
  	    return this.clone().iushrn(bits);
  	  };

  	  // Test if n bit is set
  	  BN.prototype.testn = function testn (bit) {
  	    assert(typeof bit === 'number' && bit >= 0);
  	    var r = bit % 26;
  	    var s = (bit - r) / 26;
  	    var q = 1 << r;

  	    // Fast case: bit is much higher than all existing words
  	    if (this.length <= s) return false;

  	    // Check bit and return
  	    var w = this.words[s];

  	    return !!(w & q);
  	  };

  	  // Return only lowers bits of number (in-place)
  	  BN.prototype.imaskn = function imaskn (bits) {
  	    assert(typeof bits === 'number' && bits >= 0);
  	    var r = bits % 26;
  	    var s = (bits - r) / 26;

  	    assert(this.negative === 0, 'imaskn works only with positive numbers');

  	    if (this.length <= s) {
  	      return this;
  	    }

  	    if (r !== 0) {
  	      s++;
  	    }
  	    this.length = Math.min(s, this.length);

  	    if (r !== 0) {
  	      var mask = 0x3ffffff ^ ((0x3ffffff >>> r) << r);
  	      this.words[this.length - 1] &= mask;
  	    }

  	    return this._strip();
  	  };

  	  // Return only lowers bits of number
  	  BN.prototype.maskn = function maskn (bits) {
  	    return this.clone().imaskn(bits);
  	  };

  	  // Add plain number `num` to `this`
  	  BN.prototype.iaddn = function iaddn (num) {
  	    assert(typeof num === 'number');
  	    assert(num < 0x4000000);
  	    if (num < 0) return this.isubn(-num);

  	    // Possible sign change
  	    if (this.negative !== 0) {
  	      if (this.length === 1 && (this.words[0] | 0) <= num) {
  	        this.words[0] = num - (this.words[0] | 0);
  	        this.negative = 0;
  	        return this;
  	      }

  	      this.negative = 0;
  	      this.isubn(num);
  	      this.negative = 1;
  	      return this;
  	    }

  	    // Add without checks
  	    return this._iaddn(num);
  	  };

  	  BN.prototype._iaddn = function _iaddn (num) {
  	    this.words[0] += num;

  	    // Carry
  	    for (var i = 0; i < this.length && this.words[i] >= 0x4000000; i++) {
  	      this.words[i] -= 0x4000000;
  	      if (i === this.length - 1) {
  	        this.words[i + 1] = 1;
  	      } else {
  	        this.words[i + 1]++;
  	      }
  	    }
  	    this.length = Math.max(this.length, i + 1);

  	    return this;
  	  };

  	  // Subtract plain number `num` from `this`
  	  BN.prototype.isubn = function isubn (num) {
  	    assert(typeof num === 'number');
  	    assert(num < 0x4000000);
  	    if (num < 0) return this.iaddn(-num);

  	    if (this.negative !== 0) {
  	      this.negative = 0;
  	      this.iaddn(num);
  	      this.negative = 1;
  	      return this;
  	    }

  	    this.words[0] -= num;

  	    if (this.length === 1 && this.words[0] < 0) {
  	      this.words[0] = -this.words[0];
  	      this.negative = 1;
  	    } else {
  	      // Carry
  	      for (var i = 0; i < this.length && this.words[i] < 0; i++) {
  	        this.words[i] += 0x4000000;
  	        this.words[i + 1] -= 1;
  	      }
  	    }

  	    return this._strip();
  	  };

  	  BN.prototype.addn = function addn (num) {
  	    return this.clone().iaddn(num);
  	  };

  	  BN.prototype.subn = function subn (num) {
  	    return this.clone().isubn(num);
  	  };

  	  BN.prototype.iabs = function iabs () {
  	    this.negative = 0;

  	    return this;
  	  };

  	  BN.prototype.abs = function abs () {
  	    return this.clone().iabs();
  	  };

  	  BN.prototype._ishlnsubmul = function _ishlnsubmul (num, mul, shift) {
  	    var len = num.length + shift;
  	    var i;

  	    this._expand(len);

  	    var w;
  	    var carry = 0;
  	    for (i = 0; i < num.length; i++) {
  	      w = (this.words[i + shift] | 0) + carry;
  	      var right = (num.words[i] | 0) * mul;
  	      w -= right & 0x3ffffff;
  	      carry = (w >> 26) - ((right / 0x4000000) | 0);
  	      this.words[i + shift] = w & 0x3ffffff;
  	    }
  	    for (; i < this.length - shift; i++) {
  	      w = (this.words[i + shift] | 0) + carry;
  	      carry = w >> 26;
  	      this.words[i + shift] = w & 0x3ffffff;
  	    }

  	    if (carry === 0) return this._strip();

  	    // Subtraction overflow
  	    assert(carry === -1);
  	    carry = 0;
  	    for (i = 0; i < this.length; i++) {
  	      w = -(this.words[i] | 0) + carry;
  	      carry = w >> 26;
  	      this.words[i] = w & 0x3ffffff;
  	    }
  	    this.negative = 1;

  	    return this._strip();
  	  };

  	  BN.prototype._wordDiv = function _wordDiv (num, mode) {
  	    var shift = this.length - num.length;

  	    var a = this.clone();
  	    var b = num;

  	    // Normalize
  	    var bhi = b.words[b.length - 1] | 0;
  	    var bhiBits = this._countBits(bhi);
  	    shift = 26 - bhiBits;
  	    if (shift !== 0) {
  	      b = b.ushln(shift);
  	      a.iushln(shift);
  	      bhi = b.words[b.length - 1] | 0;
  	    }

  	    // Initialize quotient
  	    var m = a.length - b.length;
  	    var q;

  	    if (mode !== 'mod') {
  	      q = new BN(null);
  	      q.length = m + 1;
  	      q.words = new Array(q.length);
  	      for (var i = 0; i < q.length; i++) {
  	        q.words[i] = 0;
  	      }
  	    }

  	    var diff = a.clone()._ishlnsubmul(b, 1, m);
  	    if (diff.negative === 0) {
  	      a = diff;
  	      if (q) {
  	        q.words[m] = 1;
  	      }
  	    }

  	    for (var j = m - 1; j >= 0; j--) {
  	      var qj = (a.words[b.length + j] | 0) * 0x4000000 +
  	        (a.words[b.length + j - 1] | 0);

  	      // NOTE: (qj / bhi) is (0x3ffffff * 0x4000000 + 0x3ffffff) / 0x2000000 max
  	      // (0x7ffffff)
  	      qj = Math.min((qj / bhi) | 0, 0x3ffffff);

  	      a._ishlnsubmul(b, qj, j);
  	      while (a.negative !== 0) {
  	        qj--;
  	        a.negative = 0;
  	        a._ishlnsubmul(b, 1, j);
  	        if (!a.isZero()) {
  	          a.negative ^= 1;
  	        }
  	      }
  	      if (q) {
  	        q.words[j] = qj;
  	      }
  	    }
  	    if (q) {
  	      q._strip();
  	    }
  	    a._strip();

  	    // Denormalize
  	    if (mode !== 'div' && shift !== 0) {
  	      a.iushrn(shift);
  	    }

  	    return {
  	      div: q || null,
  	      mod: a
  	    };
  	  };

  	  // NOTE: 1) `mode` can be set to `mod` to request mod only,
  	  //       to `div` to request div only, or be absent to
  	  //       request both div & mod
  	  //       2) `positive` is true if unsigned mod is requested
  	  BN.prototype.divmod = function divmod (num, mode, positive) {
  	    assert(!num.isZero());

  	    if (this.isZero()) {
  	      return {
  	        div: new BN(0),
  	        mod: new BN(0)
  	      };
  	    }

  	    var div, mod, res;
  	    if (this.negative !== 0 && num.negative === 0) {
  	      res = this.neg().divmod(num, mode);

  	      if (mode !== 'mod') {
  	        div = res.div.neg();
  	      }

  	      if (mode !== 'div') {
  	        mod = res.mod.neg();
  	        if (positive && mod.negative !== 0) {
  	          mod.iadd(num);
  	        }
  	      }

  	      return {
  	        div: div,
  	        mod: mod
  	      };
  	    }

  	    if (this.negative === 0 && num.negative !== 0) {
  	      res = this.divmod(num.neg(), mode);

  	      if (mode !== 'mod') {
  	        div = res.div.neg();
  	      }

  	      return {
  	        div: div,
  	        mod: res.mod
  	      };
  	    }

  	    if ((this.negative & num.negative) !== 0) {
  	      res = this.neg().divmod(num.neg(), mode);

  	      if (mode !== 'div') {
  	        mod = res.mod.neg();
  	        if (positive && mod.negative !== 0) {
  	          mod.isub(num);
  	        }
  	      }

  	      return {
  	        div: res.div,
  	        mod: mod
  	      };
  	    }

  	    // Both numbers are positive at this point

  	    // Strip both numbers to approximate shift value
  	    if (num.length > this.length || this.cmp(num) < 0) {
  	      return {
  	        div: new BN(0),
  	        mod: this
  	      };
  	    }

  	    // Very short reduction
  	    if (num.length === 1) {
  	      if (mode === 'div') {
  	        return {
  	          div: this.divn(num.words[0]),
  	          mod: null
  	        };
  	      }

  	      if (mode === 'mod') {
  	        return {
  	          div: null,
  	          mod: new BN(this.modrn(num.words[0]))
  	        };
  	      }

  	      return {
  	        div: this.divn(num.words[0]),
  	        mod: new BN(this.modrn(num.words[0]))
  	      };
  	    }

  	    return this._wordDiv(num, mode);
  	  };

  	  // Find `this` / `num`
  	  BN.prototype.div = function div (num) {
  	    return this.divmod(num, 'div', false).div;
  	  };

  	  // Find `this` % `num`
  	  BN.prototype.mod = function mod (num) {
  	    return this.divmod(num, 'mod', false).mod;
  	  };

  	  BN.prototype.umod = function umod (num) {
  	    return this.divmod(num, 'mod', true).mod;
  	  };

  	  // Find Round(`this` / `num`)
  	  BN.prototype.divRound = function divRound (num) {
  	    var dm = this.divmod(num);

  	    // Fast case - exact division
  	    if (dm.mod.isZero()) return dm.div;

  	    var mod = dm.div.negative !== 0 ? dm.mod.isub(num) : dm.mod;

  	    var half = num.ushrn(1);
  	    var r2 = num.andln(1);
  	    var cmp = mod.cmp(half);

  	    // Round down
  	    if (cmp < 0 || (r2 === 1 && cmp === 0)) return dm.div;

  	    // Round up
  	    return dm.div.negative !== 0 ? dm.div.isubn(1) : dm.div.iaddn(1);
  	  };

  	  BN.prototype.modrn = function modrn (num) {
  	    var isNegNum = num < 0;
  	    if (isNegNum) num = -num;

  	    assert(num <= 0x3ffffff);
  	    var p = (1 << 26) % num;

  	    var acc = 0;
  	    for (var i = this.length - 1; i >= 0; i--) {
  	      acc = (p * acc + (this.words[i] | 0)) % num;
  	    }

  	    return isNegNum ? -acc : acc;
  	  };

  	  // WARNING: DEPRECATED
  	  BN.prototype.modn = function modn (num) {
  	    return this.modrn(num);
  	  };

  	  // In-place division by number
  	  BN.prototype.idivn = function idivn (num) {
  	    var isNegNum = num < 0;
  	    if (isNegNum) num = -num;

  	    assert(num <= 0x3ffffff);

  	    var carry = 0;
  	    for (var i = this.length - 1; i >= 0; i--) {
  	      var w = (this.words[i] | 0) + carry * 0x4000000;
  	      this.words[i] = (w / num) | 0;
  	      carry = w % num;
  	    }

  	    this._strip();
  	    return isNegNum ? this.ineg() : this;
  	  };

  	  BN.prototype.divn = function divn (num) {
  	    return this.clone().idivn(num);
  	  };

  	  BN.prototype.egcd = function egcd (p) {
  	    assert(p.negative === 0);
  	    assert(!p.isZero());

  	    var x = this;
  	    var y = p.clone();

  	    if (x.negative !== 0) {
  	      x = x.umod(p);
  	    } else {
  	      x = x.clone();
  	    }

  	    // A * x + B * y = x
  	    var A = new BN(1);
  	    var B = new BN(0);

  	    // C * x + D * y = y
  	    var C = new BN(0);
  	    var D = new BN(1);

  	    var g = 0;

  	    while (x.isEven() && y.isEven()) {
  	      x.iushrn(1);
  	      y.iushrn(1);
  	      ++g;
  	    }

  	    var yp = y.clone();
  	    var xp = x.clone();

  	    while (!x.isZero()) {
  	      for (var i = 0, im = 1; (x.words[0] & im) === 0 && i < 26; ++i, im <<= 1);
  	      if (i > 0) {
  	        x.iushrn(i);
  	        while (i-- > 0) {
  	          if (A.isOdd() || B.isOdd()) {
  	            A.iadd(yp);
  	            B.isub(xp);
  	          }

  	          A.iushrn(1);
  	          B.iushrn(1);
  	        }
  	      }

  	      for (var j = 0, jm = 1; (y.words[0] & jm) === 0 && j < 26; ++j, jm <<= 1);
  	      if (j > 0) {
  	        y.iushrn(j);
  	        while (j-- > 0) {
  	          if (C.isOdd() || D.isOdd()) {
  	            C.iadd(yp);
  	            D.isub(xp);
  	          }

  	          C.iushrn(1);
  	          D.iushrn(1);
  	        }
  	      }

  	      if (x.cmp(y) >= 0) {
  	        x.isub(y);
  	        A.isub(C);
  	        B.isub(D);
  	      } else {
  	        y.isub(x);
  	        C.isub(A);
  	        D.isub(B);
  	      }
  	    }

  	    return {
  	      a: C,
  	      b: D,
  	      gcd: y.iushln(g)
  	    };
  	  };

  	  // This is reduced incarnation of the binary EEA
  	  // above, designated to invert members of the
  	  // _prime_ fields F(p) at a maximal speed
  	  BN.prototype._invmp = function _invmp (p) {
  	    assert(p.negative === 0);
  	    assert(!p.isZero());

  	    var a = this;
  	    var b = p.clone();

  	    if (a.negative !== 0) {
  	      a = a.umod(p);
  	    } else {
  	      a = a.clone();
  	    }

  	    var x1 = new BN(1);
  	    var x2 = new BN(0);

  	    var delta = b.clone();

  	    while (a.cmpn(1) > 0 && b.cmpn(1) > 0) {
  	      for (var i = 0, im = 1; (a.words[0] & im) === 0 && i < 26; ++i, im <<= 1);
  	      if (i > 0) {
  	        a.iushrn(i);
  	        while (i-- > 0) {
  	          if (x1.isOdd()) {
  	            x1.iadd(delta);
  	          }

  	          x1.iushrn(1);
  	        }
  	      }

  	      for (var j = 0, jm = 1; (b.words[0] & jm) === 0 && j < 26; ++j, jm <<= 1);
  	      if (j > 0) {
  	        b.iushrn(j);
  	        while (j-- > 0) {
  	          if (x2.isOdd()) {
  	            x2.iadd(delta);
  	          }

  	          x2.iushrn(1);
  	        }
  	      }

  	      if (a.cmp(b) >= 0) {
  	        a.isub(b);
  	        x1.isub(x2);
  	      } else {
  	        b.isub(a);
  	        x2.isub(x1);
  	      }
  	    }

  	    var res;
  	    if (a.cmpn(1) === 0) {
  	      res = x1;
  	    } else {
  	      res = x2;
  	    }

  	    if (res.cmpn(0) < 0) {
  	      res.iadd(p);
  	    }

  	    return res;
  	  };

  	  BN.prototype.gcd = function gcd (num) {
  	    if (this.isZero()) return num.abs();
  	    if (num.isZero()) return this.abs();

  	    var a = this.clone();
  	    var b = num.clone();
  	    a.negative = 0;
  	    b.negative = 0;

  	    // Remove common factor of two
  	    for (var shift = 0; a.isEven() && b.isEven(); shift++) {
  	      a.iushrn(1);
  	      b.iushrn(1);
  	    }

  	    do {
  	      while (a.isEven()) {
  	        a.iushrn(1);
  	      }
  	      while (b.isEven()) {
  	        b.iushrn(1);
  	      }

  	      var r = a.cmp(b);
  	      if (r < 0) {
  	        // Swap `a` and `b` to make `a` always bigger than `b`
  	        var t = a;
  	        a = b;
  	        b = t;
  	      } else if (r === 0 || b.cmpn(1) === 0) {
  	        break;
  	      }

  	      a.isub(b);
  	    } while (true);

  	    return b.iushln(shift);
  	  };

  	  // Invert number in the field F(num)
  	  BN.prototype.invm = function invm (num) {
  	    return this.egcd(num).a.umod(num);
  	  };

  	  BN.prototype.isEven = function isEven () {
  	    return (this.words[0] & 1) === 0;
  	  };

  	  BN.prototype.isOdd = function isOdd () {
  	    return (this.words[0] & 1) === 1;
  	  };

  	  // And first word and num
  	  BN.prototype.andln = function andln (num) {
  	    return this.words[0] & num;
  	  };

  	  // Increment at the bit position in-line
  	  BN.prototype.bincn = function bincn (bit) {
  	    assert(typeof bit === 'number');
  	    var r = bit % 26;
  	    var s = (bit - r) / 26;
  	    var q = 1 << r;

  	    // Fast case: bit is much higher than all existing words
  	    if (this.length <= s) {
  	      this._expand(s + 1);
  	      this.words[s] |= q;
  	      return this;
  	    }

  	    // Add bit and propagate, if needed
  	    var carry = q;
  	    for (var i = s; carry !== 0 && i < this.length; i++) {
  	      var w = this.words[i] | 0;
  	      w += carry;
  	      carry = w >>> 26;
  	      w &= 0x3ffffff;
  	      this.words[i] = w;
  	    }
  	    if (carry !== 0) {
  	      this.words[i] = carry;
  	      this.length++;
  	    }
  	    return this;
  	  };

  	  BN.prototype.isZero = function isZero () {
  	    return this.length === 1 && this.words[0] === 0;
  	  };

  	  BN.prototype.cmpn = function cmpn (num) {
  	    var negative = num < 0;

  	    if (this.negative !== 0 && !negative) return -1;
  	    if (this.negative === 0 && negative) return 1;

  	    this._strip();

  	    var res;
  	    if (this.length > 1) {
  	      res = 1;
  	    } else {
  	      if (negative) {
  	        num = -num;
  	      }

  	      assert(num <= 0x3ffffff, 'Number is too big');

  	      var w = this.words[0] | 0;
  	      res = w === num ? 0 : w < num ? -1 : 1;
  	    }
  	    if (this.negative !== 0) return -res | 0;
  	    return res;
  	  };

  	  // Compare two numbers and return:
  	  // 1 - if `this` > `num`
  	  // 0 - if `this` == `num`
  	  // -1 - if `this` < `num`
  	  BN.prototype.cmp = function cmp (num) {
  	    if (this.negative !== 0 && num.negative === 0) return -1;
  	    if (this.negative === 0 && num.negative !== 0) return 1;

  	    var res = this.ucmp(num);
  	    if (this.negative !== 0) return -res | 0;
  	    return res;
  	  };

  	  // Unsigned comparison
  	  BN.prototype.ucmp = function ucmp (num) {
  	    // At this point both numbers have the same sign
  	    if (this.length > num.length) return 1;
  	    if (this.length < num.length) return -1;

  	    var res = 0;
  	    for (var i = this.length - 1; i >= 0; i--) {
  	      var a = this.words[i] | 0;
  	      var b = num.words[i] | 0;

  	      if (a === b) continue;
  	      if (a < b) {
  	        res = -1;
  	      } else if (a > b) {
  	        res = 1;
  	      }
  	      break;
  	    }
  	    return res;
  	  };

  	  BN.prototype.gtn = function gtn (num) {
  	    return this.cmpn(num) === 1;
  	  };

  	  BN.prototype.gt = function gt (num) {
  	    return this.cmp(num) === 1;
  	  };

  	  BN.prototype.gten = function gten (num) {
  	    return this.cmpn(num) >= 0;
  	  };

  	  BN.prototype.gte = function gte (num) {
  	    return this.cmp(num) >= 0;
  	  };

  	  BN.prototype.ltn = function ltn (num) {
  	    return this.cmpn(num) === -1;
  	  };

  	  BN.prototype.lt = function lt (num) {
  	    return this.cmp(num) === -1;
  	  };

  	  BN.prototype.lten = function lten (num) {
  	    return this.cmpn(num) <= 0;
  	  };

  	  BN.prototype.lte = function lte (num) {
  	    return this.cmp(num) <= 0;
  	  };

  	  BN.prototype.eqn = function eqn (num) {
  	    return this.cmpn(num) === 0;
  	  };

  	  BN.prototype.eq = function eq (num) {
  	    return this.cmp(num) === 0;
  	  };

  	  //
  	  // A reduce context, could be using montgomery or something better, depending
  	  // on the `m` itself.
  	  //
  	  BN.red = function red (num) {
  	    return new Red(num);
  	  };

  	  BN.prototype.toRed = function toRed (ctx) {
  	    assert(!this.red, 'Already a number in reduction context');
  	    assert(this.negative === 0, 'red works only with positives');
  	    return ctx.convertTo(this)._forceRed(ctx);
  	  };

  	  BN.prototype.fromRed = function fromRed () {
  	    assert(this.red, 'fromRed works only with numbers in reduction context');
  	    return this.red.convertFrom(this);
  	  };

  	  BN.prototype._forceRed = function _forceRed (ctx) {
  	    this.red = ctx;
  	    return this;
  	  };

  	  BN.prototype.forceRed = function forceRed (ctx) {
  	    assert(!this.red, 'Already a number in reduction context');
  	    return this._forceRed(ctx);
  	  };

  	  BN.prototype.redAdd = function redAdd (num) {
  	    assert(this.red, 'redAdd works only with red numbers');
  	    return this.red.add(this, num);
  	  };

  	  BN.prototype.redIAdd = function redIAdd (num) {
  	    assert(this.red, 'redIAdd works only with red numbers');
  	    return this.red.iadd(this, num);
  	  };

  	  BN.prototype.redSub = function redSub (num) {
  	    assert(this.red, 'redSub works only with red numbers');
  	    return this.red.sub(this, num);
  	  };

  	  BN.prototype.redISub = function redISub (num) {
  	    assert(this.red, 'redISub works only with red numbers');
  	    return this.red.isub(this, num);
  	  };

  	  BN.prototype.redShl = function redShl (num) {
  	    assert(this.red, 'redShl works only with red numbers');
  	    return this.red.shl(this, num);
  	  };

  	  BN.prototype.redMul = function redMul (num) {
  	    assert(this.red, 'redMul works only with red numbers');
  	    this.red._verify2(this, num);
  	    return this.red.mul(this, num);
  	  };

  	  BN.prototype.redIMul = function redIMul (num) {
  	    assert(this.red, 'redMul works only with red numbers');
  	    this.red._verify2(this, num);
  	    return this.red.imul(this, num);
  	  };

  	  BN.prototype.redSqr = function redSqr () {
  	    assert(this.red, 'redSqr works only with red numbers');
  	    this.red._verify1(this);
  	    return this.red.sqr(this);
  	  };

  	  BN.prototype.redISqr = function redISqr () {
  	    assert(this.red, 'redISqr works only with red numbers');
  	    this.red._verify1(this);
  	    return this.red.isqr(this);
  	  };

  	  // Square root over p
  	  BN.prototype.redSqrt = function redSqrt () {
  	    assert(this.red, 'redSqrt works only with red numbers');
  	    this.red._verify1(this);
  	    return this.red.sqrt(this);
  	  };

  	  BN.prototype.redInvm = function redInvm () {
  	    assert(this.red, 'redInvm works only with red numbers');
  	    this.red._verify1(this);
  	    return this.red.invm(this);
  	  };

  	  // Return negative clone of `this` % `red modulo`
  	  BN.prototype.redNeg = function redNeg () {
  	    assert(this.red, 'redNeg works only with red numbers');
  	    this.red._verify1(this);
  	    return this.red.neg(this);
  	  };

  	  BN.prototype.redPow = function redPow (num) {
  	    assert(this.red && !num.red, 'redPow(normalNum)');
  	    this.red._verify1(this);
  	    return this.red.pow(this, num);
  	  };

  	  // Prime numbers with efficient reduction
  	  var primes = {
  	    k256: null,
  	    p224: null,
  	    p192: null,
  	    p25519: null
  	  };

  	  // Pseudo-Mersenne prime
  	  function MPrime (name, p) {
  	    // P = 2 ^ N - K
  	    this.name = name;
  	    this.p = new BN(p, 16);
  	    this.n = this.p.bitLength();
  	    this.k = new BN(1).iushln(this.n).isub(this.p);

  	    this.tmp = this._tmp();
  	  }

  	  MPrime.prototype._tmp = function _tmp () {
  	    var tmp = new BN(null);
  	    tmp.words = new Array(Math.ceil(this.n / 13));
  	    return tmp;
  	  };

  	  MPrime.prototype.ireduce = function ireduce (num) {
  	    // Assumes that `num` is less than `P^2`
  	    // num = HI * (2 ^ N - K) + HI * K + LO = HI * K + LO (mod P)
  	    var r = num;
  	    var rlen;

  	    do {
  	      this.split(r, this.tmp);
  	      r = this.imulK(r);
  	      r = r.iadd(this.tmp);
  	      rlen = r.bitLength();
  	    } while (rlen > this.n);

  	    var cmp = rlen < this.n ? -1 : r.ucmp(this.p);
  	    if (cmp === 0) {
  	      r.words[0] = 0;
  	      r.length = 1;
  	    } else if (cmp > 0) {
  	      r.isub(this.p);
  	    } else {
  	      if (r.strip !== undefined) {
  	        // r is a BN v4 instance
  	        r.strip();
  	      } else {
  	        // r is a BN v5 instance
  	        r._strip();
  	      }
  	    }

  	    return r;
  	  };

  	  MPrime.prototype.split = function split (input, out) {
  	    input.iushrn(this.n, 0, out);
  	  };

  	  MPrime.prototype.imulK = function imulK (num) {
  	    return num.imul(this.k);
  	  };

  	  function K256 () {
  	    MPrime.call(
  	      this,
  	      'k256',
  	      'ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff fffffffe fffffc2f');
  	  }
  	  inherits(K256, MPrime);

  	  K256.prototype.split = function split (input, output) {
  	    // 256 = 9 * 26 + 22
  	    var mask = 0x3fffff;

  	    var outLen = Math.min(input.length, 9);
  	    for (var i = 0; i < outLen; i++) {
  	      output.words[i] = input.words[i];
  	    }
  	    output.length = outLen;

  	    if (input.length <= 9) {
  	      input.words[0] = 0;
  	      input.length = 1;
  	      return;
  	    }

  	    // Shift by 9 limbs
  	    var prev = input.words[9];
  	    output.words[output.length++] = prev & mask;

  	    for (i = 10; i < input.length; i++) {
  	      var next = input.words[i] | 0;
  	      input.words[i - 10] = ((next & mask) << 4) | (prev >>> 22);
  	      prev = next;
  	    }
  	    prev >>>= 22;
  	    input.words[i - 10] = prev;
  	    if (prev === 0 && input.length > 10) {
  	      input.length -= 10;
  	    } else {
  	      input.length -= 9;
  	    }
  	  };

  	  K256.prototype.imulK = function imulK (num) {
  	    // K = 0x1000003d1 = [ 0x40, 0x3d1 ]
  	    num.words[num.length] = 0;
  	    num.words[num.length + 1] = 0;
  	    num.length += 2;

  	    // bounded at: 0x40 * 0x3ffffff + 0x3d0 = 0x100000390
  	    var lo = 0;
  	    for (var i = 0; i < num.length; i++) {
  	      var w = num.words[i] | 0;
  	      lo += w * 0x3d1;
  	      num.words[i] = lo & 0x3ffffff;
  	      lo = w * 0x40 + ((lo / 0x4000000) | 0);
  	    }

  	    // Fast length reduction
  	    if (num.words[num.length - 1] === 0) {
  	      num.length--;
  	      if (num.words[num.length - 1] === 0) {
  	        num.length--;
  	      }
  	    }
  	    return num;
  	  };

  	  function P224 () {
  	    MPrime.call(
  	      this,
  	      'p224',
  	      'ffffffff ffffffff ffffffff ffffffff 00000000 00000000 00000001');
  	  }
  	  inherits(P224, MPrime);

  	  function P192 () {
  	    MPrime.call(
  	      this,
  	      'p192',
  	      'ffffffff ffffffff ffffffff fffffffe ffffffff ffffffff');
  	  }
  	  inherits(P192, MPrime);

  	  function P25519 () {
  	    // 2 ^ 255 - 19
  	    MPrime.call(
  	      this,
  	      '25519',
  	      '7fffffffffffffff ffffffffffffffff ffffffffffffffff ffffffffffffffed');
  	  }
  	  inherits(P25519, MPrime);

  	  P25519.prototype.imulK = function imulK (num) {
  	    // K = 0x13
  	    var carry = 0;
  	    for (var i = 0; i < num.length; i++) {
  	      var hi = (num.words[i] | 0) * 0x13 + carry;
  	      var lo = hi & 0x3ffffff;
  	      hi >>>= 26;

  	      num.words[i] = lo;
  	      carry = hi;
  	    }
  	    if (carry !== 0) {
  	      num.words[num.length++] = carry;
  	    }
  	    return num;
  	  };

  	  // Exported mostly for testing purposes, use plain name instead
  	  BN._prime = function prime (name) {
  	    // Cached version of prime
  	    if (primes[name]) return primes[name];

  	    var prime;
  	    if (name === 'k256') {
  	      prime = new K256();
  	    } else if (name === 'p224') {
  	      prime = new P224();
  	    } else if (name === 'p192') {
  	      prime = new P192();
  	    } else if (name === 'p25519') {
  	      prime = new P25519();
  	    } else {
  	      throw new Error('Unknown prime ' + name);
  	    }
  	    primes[name] = prime;

  	    return prime;
  	  };

  	  //
  	  // Base reduction engine
  	  //
  	  function Red (m) {
  	    if (typeof m === 'string') {
  	      var prime = BN._prime(m);
  	      this.m = prime.p;
  	      this.prime = prime;
  	    } else {
  	      assert(m.gtn(1), 'modulus must be greater than 1');
  	      this.m = m;
  	      this.prime = null;
  	    }
  	  }

  	  Red.prototype._verify1 = function _verify1 (a) {
  	    assert(a.negative === 0, 'red works only with positives');
  	    assert(a.red, 'red works only with red numbers');
  	  };

  	  Red.prototype._verify2 = function _verify2 (a, b) {
  	    assert((a.negative | b.negative) === 0, 'red works only with positives');
  	    assert(a.red && a.red === b.red,
  	      'red works only with red numbers');
  	  };

  	  Red.prototype.imod = function imod (a) {
  	    if (this.prime) return this.prime.ireduce(a)._forceRed(this);

  	    move(a, a.umod(this.m)._forceRed(this));
  	    return a;
  	  };

  	  Red.prototype.neg = function neg (a) {
  	    if (a.isZero()) {
  	      return a.clone();
  	    }

  	    return this.m.sub(a)._forceRed(this);
  	  };

  	  Red.prototype.add = function add (a, b) {
  	    this._verify2(a, b);

  	    var res = a.add(b);
  	    if (res.cmp(this.m) >= 0) {
  	      res.isub(this.m);
  	    }
  	    return res._forceRed(this);
  	  };

  	  Red.prototype.iadd = function iadd (a, b) {
  	    this._verify2(a, b);

  	    var res = a.iadd(b);
  	    if (res.cmp(this.m) >= 0) {
  	      res.isub(this.m);
  	    }
  	    return res;
  	  };

  	  Red.prototype.sub = function sub (a, b) {
  	    this._verify2(a, b);

  	    var res = a.sub(b);
  	    if (res.cmpn(0) < 0) {
  	      res.iadd(this.m);
  	    }
  	    return res._forceRed(this);
  	  };

  	  Red.prototype.isub = function isub (a, b) {
  	    this._verify2(a, b);

  	    var res = a.isub(b);
  	    if (res.cmpn(0) < 0) {
  	      res.iadd(this.m);
  	    }
  	    return res;
  	  };

  	  Red.prototype.shl = function shl (a, num) {
  	    this._verify1(a);
  	    return this.imod(a.ushln(num));
  	  };

  	  Red.prototype.imul = function imul (a, b) {
  	    this._verify2(a, b);
  	    return this.imod(a.imul(b));
  	  };

  	  Red.prototype.mul = function mul (a, b) {
  	    this._verify2(a, b);
  	    return this.imod(a.mul(b));
  	  };

  	  Red.prototype.isqr = function isqr (a) {
  	    return this.imul(a, a.clone());
  	  };

  	  Red.prototype.sqr = function sqr (a) {
  	    return this.mul(a, a);
  	  };

  	  Red.prototype.sqrt = function sqrt (a) {
  	    if (a.isZero()) return a.clone();

  	    var mod3 = this.m.andln(3);
  	    assert(mod3 % 2 === 1);

  	    // Fast case
  	    if (mod3 === 3) {
  	      var pow = this.m.add(new BN(1)).iushrn(2);
  	      return this.pow(a, pow);
  	    }

  	    // Tonelli-Shanks algorithm (Totally unoptimized and slow)
  	    //
  	    // Find Q and S, that Q * 2 ^ S = (P - 1)
  	    var q = this.m.subn(1);
  	    var s = 0;
  	    while (!q.isZero() && q.andln(1) === 0) {
  	      s++;
  	      q.iushrn(1);
  	    }
  	    assert(!q.isZero());

  	    var one = new BN(1).toRed(this);
  	    var nOne = one.redNeg();

  	    // Find quadratic non-residue
  	    // NOTE: Max is such because of generalized Riemann hypothesis.
  	    var lpow = this.m.subn(1).iushrn(1);
  	    var z = this.m.bitLength();
  	    z = new BN(2 * z * z).toRed(this);

  	    while (this.pow(z, lpow).cmp(nOne) !== 0) {
  	      z.redIAdd(nOne);
  	    }

  	    var c = this.pow(z, q);
  	    var r = this.pow(a, q.addn(1).iushrn(1));
  	    var t = this.pow(a, q);
  	    var m = s;
  	    while (t.cmp(one) !== 0) {
  	      var tmp = t;
  	      for (var i = 0; tmp.cmp(one) !== 0; i++) {
  	        tmp = tmp.redSqr();
  	      }
  	      assert(i < m);
  	      var b = this.pow(c, new BN(1).iushln(m - i - 1));

  	      r = r.redMul(b);
  	      c = b.redSqr();
  	      t = t.redMul(c);
  	      m = i;
  	    }

  	    return r;
  	  };

  	  Red.prototype.invm = function invm (a) {
  	    var inv = a._invmp(this.m);
  	    if (inv.negative !== 0) {
  	      inv.negative = 0;
  	      return this.imod(inv).redNeg();
  	    } else {
  	      return this.imod(inv);
  	    }
  	  };

  	  Red.prototype.pow = function pow (a, num) {
  	    if (num.isZero()) return new BN(1).toRed(this);
  	    if (num.cmpn(1) === 0) return a.clone();

  	    var windowSize = 4;
  	    var wnd = new Array(1 << windowSize);
  	    wnd[0] = new BN(1).toRed(this);
  	    wnd[1] = a;
  	    for (var i = 2; i < wnd.length; i++) {
  	      wnd[i] = this.mul(wnd[i - 1], a);
  	    }

  	    var res = wnd[0];
  	    var current = 0;
  	    var currentLen = 0;
  	    var start = num.bitLength() % 26;
  	    if (start === 0) {
  	      start = 26;
  	    }

  	    for (i = num.length - 1; i >= 0; i--) {
  	      var word = num.words[i];
  	      for (var j = start - 1; j >= 0; j--) {
  	        var bit = (word >> j) & 1;
  	        if (res !== wnd[0]) {
  	          res = this.sqr(res);
  	        }

  	        if (bit === 0 && current === 0) {
  	          currentLen = 0;
  	          continue;
  	        }

  	        current <<= 1;
  	        current |= bit;
  	        currentLen++;
  	        if (currentLen !== windowSize && (i !== 0 || j !== 0)) continue;

  	        res = this.mul(res, wnd[current]);
  	        currentLen = 0;
  	        current = 0;
  	      }
  	      start = 26;
  	    }

  	    return res;
  	  };

  	  Red.prototype.convertTo = function convertTo (num) {
  	    var r = num.umod(this.m);

  	    return r === num ? r.clone() : r;
  	  };

  	  Red.prototype.convertFrom = function convertFrom (num) {
  	    var res = num.clone();
  	    res.red = null;
  	    return res;
  	  };

  	  //
  	  // Montgomery method engine
  	  //

  	  BN.mont = function mont (num) {
  	    return new Mont(num);
  	  };

  	  function Mont (m) {
  	    Red.call(this, m);

  	    this.shift = this.m.bitLength();
  	    if (this.shift % 26 !== 0) {
  	      this.shift += 26 - (this.shift % 26);
  	    }

  	    this.r = new BN(1).iushln(this.shift);
  	    this.r2 = this.imod(this.r.sqr());
  	    this.rinv = this.r._invmp(this.m);

  	    this.minv = this.rinv.mul(this.r).isubn(1).div(this.m);
  	    this.minv = this.minv.umod(this.r);
  	    this.minv = this.r.sub(this.minv);
  	  }
  	  inherits(Mont, Red);

  	  Mont.prototype.convertTo = function convertTo (num) {
  	    return this.imod(num.ushln(this.shift));
  	  };

  	  Mont.prototype.convertFrom = function convertFrom (num) {
  	    var r = this.imod(num.mul(this.rinv));
  	    r.red = null;
  	    return r;
  	  };

  	  Mont.prototype.imul = function imul (a, b) {
  	    if (a.isZero() || b.isZero()) {
  	      a.words[0] = 0;
  	      a.length = 1;
  	      return a;
  	    }

  	    var t = a.imul(b);
  	    var c = t.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
  	    var u = t.isub(c).iushrn(this.shift);
  	    var res = u;

  	    if (u.cmp(this.m) >= 0) {
  	      res = u.isub(this.m);
  	    } else if (u.cmpn(0) < 0) {
  	      res = u.iadd(this.m);
  	    }

  	    return res._forceRed(this);
  	  };

  	  Mont.prototype.mul = function mul (a, b) {
  	    if (a.isZero() || b.isZero()) return new BN(0)._forceRed(this);

  	    var t = a.mul(b);
  	    var c = t.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
  	    var u = t.isub(c).iushrn(this.shift);
  	    var res = u;
  	    if (u.cmp(this.m) >= 0) {
  	      res = u.isub(this.m);
  	    } else if (u.cmpn(0) < 0) {
  	      res = u.iadd(this.m);
  	    }

  	    return res._forceRed(this);
  	  };

  	  Mont.prototype.invm = function invm (a) {
  	    // (AR)^-1 * R^2 = (A^-1 * R^-1) * R^2 = A^-1 * R
  	    var res = this.imod(a._invmp(this.m).mul(this.r2));
  	    return res._forceRed(this);
  	  };
  	})(module, commonjsGlobal);
  } (bn));

  var BN = bn.exports;

  const BufferReader = function (buf) {
      if (!(this instanceof BufferReader)) {
          return new BufferReader(buf);
      }
      if (typeof buf === 'undefined') {
          return this;
      }
      if (Buffer.isBuffer(buf)) {
          this.set({
              buf: buf
          });
      }
      else if (typeof buf === "string") {
          const b = Buffer.from(buf, 'hex');
          const length = buf.length;
          if (b.length * 2 !== length) {
              throw new TypeError('Invalid hex string');
          }
          this.set({
              buf: b
          });
      }
      else if (typeof buf === "object") {
          this.set(buf);
      }
      else {
          throw new TypeError('Unrecognized argument for BufferReader');
      }
      return this;
  };
  BufferReader.prototype.set = function (obj) {
      this.buf = obj.buf || this.buf || undefined;
      this.pos = obj.pos || this.pos || 0;
      return this;
  };
  BufferReader.prototype.eof = function () {
      return this.pos >= this.buf.length;
  };
  BufferReader.prototype.finished = BufferReader.prototype.eof;
  BufferReader.prototype.read = function (len) {
      if (typeof len === 'undefined') {
          throw new Error('Must specify a length');
      }
      const buf = this.buf.slice(this.pos, this.pos + len);
      this.pos = this.pos + len;
      return buf;
  };
  BufferReader.prototype.readAll = function () {
      const buf = this.buf.slice(this.pos, this.buf.length);
      this.pos = this.buf.length;
      return buf;
  };
  BufferReader.prototype.readUInt8 = function () {
      const val = this.buf.readUInt8(this.pos);
      this.pos = this.pos + 1;
      return val;
  };
  BufferReader.prototype.readUInt16BE = function () {
      const val = this.buf.readUInt16BE(this.pos);
      this.pos = this.pos + 2;
      return val;
  };
  BufferReader.prototype.readUInt16LE = function () {
      const val = this.buf.readUInt16LE(this.pos);
      this.pos = this.pos + 2;
      return val;
  };
  BufferReader.prototype.readUInt32BE = function () {
      const val = this.buf.readUInt32BE(this.pos);
      this.pos = this.pos + 4;
      return val;
  };
  BufferReader.prototype.readUInt32LE = function () {
      const val = this.buf.readUInt32LE(this.pos);
      this.pos = this.pos + 4;
      return val;
  };
  BufferReader.prototype.readInt32LE = function () {
      const val = this.buf.readInt32LE(this.pos);
      this.pos = this.pos + 4;
      return val;
  };
  BufferReader.prototype.readUInt64BEBN = function () {
      const buf = this.buf.slice(this.pos, this.pos + 8);
      const bn = fromBuffer(buf);
      this.pos = this.pos + 8;
      return bn;
  };
  BufferReader.prototype.readUInt64LEBN = function () {
      const second = this.buf.readUInt32LE(this.pos);
      const first = this.buf.readUInt32LE(this.pos + 4);
      const combined = (first * 0x100000000) + second;
      // Instantiating an instance of BN with a number is faster than with an
      // array or string. However, the maximum safe number for a double precision
      // floating point is 2 ^ 52 - 1 (0x1fffffffffffff), thus we can safely use
      // non-floating point numbers less than this amount (52 bits). And in the case
      // that the number is larger, we can instantiate an instance of BN by passing
      // an array from the buffer (slower) and specifying the endianness.
      let bn;
      if (combined <= 0x1fffffffffffff) {
          bn = new BN(combined);
      }
      else {
          const data = Array.prototype.slice.call(this.buf, this.pos, this.pos + 8);
          bn = new BN(data, 10, 'le');
      }
      this.pos = this.pos + 8;
      return bn;
  };
  BufferReader.prototype.readVarintNum = function () {
      const first = this.readUInt8();
      switch (first) {
          case 0xFD:
              return this.readUInt16LE();
          case 0xFE:
              return this.readUInt32LE();
          case 0xFF:
              const bn = this.readUInt64LEBN();
              const n = bn.toNumber();
              if (n <= Math.pow(2, 53)) {
                  return n;
              }
              else {
                  throw new Error('number too large to retain precision - use readVarintBN');
              }
          // break // unreachable
          default:
              return first;
      }
  };
  /**
   * reads a length prepended buffer
   */
  BufferReader.prototype.readVarLengthBuffer = function () {
      const len = this.readVarintNum();
      const buf = this.read(len);
      if (buf.length !== len) {
          throw new Error('Invalid length while reading var length buffer. ' +
              'Expected to read: ' + len + ' and read ' + buf.length);
      }
      return buf;
  };
  BufferReader.prototype.readVarintBuf = function () {
      const first = this.buf.readUInt8(this.pos);
      switch (first) {
          case 0xFD:
              return this.read(1 + 2);
          case 0xFE:
              return this.read(1 + 4);
          case 0xFF:
              return this.read(1 + 8);
          default:
              return this.read(1);
      }
  };
  BufferReader.prototype.readVarintBN = function () {
      const first = this.readUInt8();
      switch (first) {
          case 0xFD:
              return new BN(this.readUInt16LE());
          case 0xFE:
              return new BN(this.readUInt32LE());
          case 0xFF:
              return this.readUInt64LEBN();
          default:
              return new BN(first);
      }
  };
  BufferReader.prototype.reverse = function () {
      const buf = Buffer.alloc(this.buf.length);
      for (let i = 0; i < buf.length; i++) {
          buf[i] = this.buf[this.buf.length - 1 - i];
      }
      this.buf = buf;
      return this;
  };
  BufferReader.prototype.readReverse = function (len) {
      if (typeof len === 'undefined') {
          len = this.buf.length;
      }
      const buf = this.buf.slice(this.pos, this.pos + len);
      this.pos = this.pos + len;
      return Buffer.from(buf).reverse();
  };
  const reverseBuffer = function (buf) {
      const buf2 = Buffer.alloc(buf.length);
      for (let i = 0; i < buf.length; i++) {
          buf2[i] = buf[buf.length - 1 - i];
      }
      return buf2;
  };
  const fromBuffer = function (buf, opts) {
      if (typeof opts !== 'undefined' && opts.endian === 'little') {
          buf = reverseBuffer(buf);
      }
      const hex = buf.toString('hex');
      return new BN(hex, 16);
  };

  const assertBuffer = function (buf) {
      if (!Buffer.isBuffer(buf)) {
          throw new Error('not a buffer');
      }
  };
  const BufferWriter = function (obj) {
      if (!(this instanceof BufferWriter)) {
          return new BufferWriter(obj);
      }
      this.bufLen = 0;
      if (obj) {
          this.set(obj);
      }
      else {
          this.buffers = [];
      }
      return this;
  };
  BufferWriter.prototype.set = function (obj) {
      this.buffers = obj.buffers || this.buffers || [];
      this.bufLen = this.buffers.reduce(function (prev, buf) {
          return prev + buf.length;
      }, 0);
      return this;
  };
  BufferWriter.prototype.toBuffer = function () {
      return this.concat();
  };
  BufferWriter.prototype.concat = function () {
      return Buffer.concat(this.buffers, this.bufLen);
  };
  BufferWriter.prototype.write = function (buf) {
      assertBuffer(buf);
      this.buffers.push(buf);
      this.bufLen += buf.length;
      return this;
  };
  BufferWriter.prototype.writeReverse = function (buf) {
      assertBuffer(buf);
      this.buffers.push(Buffer.from(buf).reverse());
      this.bufLen += buf.length;
      return this;
  };
  BufferWriter.prototype.writeUInt8 = function (n) {
      const buf = Buffer.alloc(1);
      buf.writeUInt8(n, 0);
      this.write(buf);
      return this;
  };
  BufferWriter.prototype.writeUInt16BE = function (n) {
      const buf = Buffer.alloc(2);
      buf.writeUInt16BE(n, 0);
      this.write(buf);
      return this;
  };
  BufferWriter.prototype.writeUInt16LE = function (n) {
      const buf = Buffer.alloc(2);
      buf.writeUInt16LE(n, 0);
      this.write(buf);
      return this;
  };
  BufferWriter.prototype.writeUInt32BE = function (n) {
      const buf = Buffer.alloc(4);
      buf.writeUInt32BE(n, 0);
      this.write(buf);
      return this;
  };
  BufferWriter.prototype.writeInt32LE = function (n) {
      const buf = Buffer.alloc(4);
      buf.writeInt32LE(n, 0);
      this.write(buf);
      return this;
  };
  BufferWriter.prototype.writeUInt32LE = function (n) {
      const buf = Buffer.alloc(4);
      buf.writeUInt32LE(n, 0);
      this.write(buf);
      return this;
  };
  BufferWriter.prototype.writeUInt64BEBN = function (bn) {
      const buf = bn.toBuffer('be', 8);
      this.write(buf);
      return this;
  };
  BufferWriter.prototype.writeUInt64LEBN = function (bn) {
      const buf = bn.toBuffer('be', 8);
      this.writeReverse(buf);
      return this;
  };
  BufferWriter.prototype.writeVarintNum = function (n) {
      const buf = BufferWriter.varintBufNum(n);
      this.write(buf);
      return this;
  };
  BufferWriter.prototype.writeVarintBN = function (bn) {
      const buf = BufferWriter.varintBufBN(bn);
      this.write(buf);
      return this;
  };
  BufferWriter.varintBufNum = function (n) {
      let buf;
      if (n < 253) {
          buf = Buffer.alloc(1);
          buf.writeUInt8(n, 0);
      }
      else if (n < 0x10000) {
          buf = Buffer.alloc(1 + 2);
          buf.writeUInt8(253, 0);
          buf.writeUInt16LE(n, 1);
      }
      else if (n < 0x100000000) {
          buf = Buffer.alloc(1 + 4);
          buf.writeUInt8(254, 0);
          buf.writeUInt32LE(n, 1);
      }
      else {
          buf = Buffer.alloc(1 + 8);
          buf.writeUInt8(255, 0);
          buf.writeInt32LE(n & -1, 1);
          buf.writeUInt32LE(Math.floor(n / 0x100000000), 5);
      }
      return buf;
  };
  BufferWriter.varintBufBN = function (bn) {
      let buf;
      const n = bn.toNumber();
      if (n < 253) {
          buf = Buffer.alloc(1);
          buf.writeUInt8(n, 0);
      }
      else if (n < 0x10000) {
          buf = Buffer.alloc(1 + 2);
          buf.writeUInt8(253, 0);
          buf.writeUInt16LE(n, 1);
      }
      else if (n < 0x100000000) {
          buf = Buffer.alloc(1 + 4);
          buf.writeUInt8(254, 0);
          buf.writeUInt32LE(n, 1);
      }
      else {
          // @ts-ignore
          const bw = new BufferWriter();
          bw.writeUInt8(255);
          bw.writeUInt64LEBN(bn);
          buf = bw.concat();
      }
      return buf;
  };

  const initReaderWriter = function (tx) {
      let returnBuffer = true;
      if (typeof tx === "string") {
          tx = Buffer.from(tx, 'hex');
          returnBuffer = false;
      }
      if (!Buffer.isBuffer(tx)) {
          throw new Error('buffer must be a buffer');
      }
      if (tx.length < 10) {
          throw new Error('too small to be a valid transaction');
      }
      const reader = new BufferReader(tx);
      const writer = new BufferWriter();
      // version
      writer.writeInt32LE(reader.readInt32LE());
      return { returnBuffer, reader, writer };
  };
  const writeOutputs = function (reader, writer) {
      const sizeTxOuts = reader.readVarintNum();
      writer.writeVarintNum(sizeTxOuts);
      for (let i = 0; i < sizeTxOuts; i++) {
          // satoshis
          writer.writeUInt64LEBN(reader.readUInt64LEBN());
          const size = reader.readVarintNum();
          let script = Buffer.from([]); // default
          if (size !== 0) {
              script = reader.read(size);
          }
          writer.writeVarintNum(size);
          writer.write(script);
      }
      // nLock time
      writer.writeUInt32LE(reader.readUInt32LE());
  };

  const StandardToExtended = function (tx, previousOuts) {
      let { returnBuffer, reader, writer } = initReaderWriter(tx);
      const sizeTxIns = reader.readVarintNum();
      if (sizeTxIns !== previousOuts.length) {
          throw new Error('previousOuts must be the same length as the number of inputs');
      }
      // write the Extended Format header
      writer.write(Buffer.from('0000000000EF', 'hex'));
      writer.writeVarintNum(sizeTxIns);
      for (let i = 0; i < sizeTxIns; i++) {
          // tx ID
          writer.write(reader.read(32));
          // output index
          writer.writeUInt32LE(reader.readUInt32LE());
          // input script
          const scriptBuffer = reader.readVarLengthBuffer();
          writer.writeVarintNum(scriptBuffer.length);
          writer.write(scriptBuffer);
          // sequence number
          writer.writeUInt32LE(reader.readUInt32LE());
          //
          // Write the actual extended information
          //
          writer.writeUInt64LEBN(new BN(previousOuts[i].satoshis));
          let lockingScript = previousOuts[i].lockingScript;
          if (!Buffer.isBuffer(lockingScript)) {
              lockingScript = Buffer.from(lockingScript, 'hex');
          }
          writer.writeVarintNum(lockingScript.length);
          writer.write(lockingScript);
      }
      writeOutputs(reader, writer);
      return returnBuffer ? writer.toBuffer() : writer.toBuffer().toString('hex');
  };

  bsv.Transaction.prototype.toExtended = function (format = "buffer") {
      if (this.inputs.length === 0) {
          throw new Error("transaction must have inputs to use toExtended");
      }
      const previousOuts = [];
      this.inputs.map((input) => {
          if (!input.output || !input.output.script || !input.output.satoshis) {
              throw new Error("input must have the previous output script and satoshis set to use toExtended");
          }
          previousOuts.push({
              satoshis: input.output.satoshis,
              lockingScript: input.output.script.toBuffer(),
          });
      });
      const extended = StandardToExtended(this.toBuffer(), previousOuts);
      if (format === "hex") {
          return extended.toString('hex');
      }
      return extended;
  };
  const BSVToExtended = (tx, format = "buffer") => {
      return tx.toExtended(format);
  };

  exports.BSVToExtended = BSVToExtended;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
//# sourceMappingURL=typescript-npm-package.umd.js.map
