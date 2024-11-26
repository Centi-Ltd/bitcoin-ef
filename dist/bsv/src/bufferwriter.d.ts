/// <reference types="node" />
/// <reference types="node" />
import BN from 'bn.js';
interface BufferWriter {
    new (obj?: any): BufferWriter;
    (obj?: any): BufferWriter;
    varintBufNum(n: number): Buffer;
    varintBufBN(bn: BN): Buffer;
    set: (obj: any) => BufferWriter;
    toBuffer: () => Buffer;
    concat: () => Buffer;
    write: (buf: Buffer) => BufferWriter;
    writeReverse: (buf: Buffer) => BufferWriter;
    writeUInt8: (n: number) => BufferWriter;
    writeUInt16BE: (n: number) => BufferWriter;
    writeUInt16LE: (n: number) => BufferWriter;
    writeUInt32BE: (n: number) => BufferWriter;
    writeUInt32LE: (n: number) => BufferWriter;
    writeInt32LE: (n: number) => BufferWriter;
    writeUInt64BEBN: (bn: BN) => BufferWriter;
    writeUInt64LEBN: (bn: BN) => BufferWriter;
    writeVarintNum: (n: number) => BufferWriter;
    writeVarintBN: (bn: BN) => BufferWriter;
    bufLen: number;
    buffers: Buffer[];
}
declare const BufferWriter: BufferWriter;
export default BufferWriter;
