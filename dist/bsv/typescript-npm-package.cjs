'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var bsv = require('@vaionex/bsv');
var BN = require('bn.js');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var bsv__default = /*#__PURE__*/_interopDefaultLegacy(bsv);
var BN__default = /*#__PURE__*/_interopDefaultLegacy(BN);

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
        bn = new BN__default["default"](combined);
    }
    else {
        const data = Array.prototype.slice.call(this.buf, this.pos, this.pos + 8);
        bn = new BN__default["default"](data, 10, 'le');
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
            return new BN__default["default"](this.readUInt16LE());
        case 0xFE:
            return new BN__default["default"](this.readUInt32LE());
        case 0xFF:
            return this.readUInt64LEBN();
        default:
            return new BN__default["default"](first);
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
    return new BN__default["default"](hex, 16);
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
        writer.writeUInt64LEBN(new BN__default["default"](previousOuts[i].satoshis));
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

bsv__default["default"].Transaction.prototype.toExtended = function (format = "buffer") {
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
//# sourceMappingURL=typescript-npm-package.cjs.map
