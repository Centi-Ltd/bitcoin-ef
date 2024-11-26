/// <reference types="node" />
/// <reference types="node" />
import BN from 'bn.js';
interface BufferReader {
    new (buf: Buffer | String | Object): BufferReader;
    (buf: Buffer | String | Object): BufferReader;
    set: (obj: any) => BufferReader;
    eof: () => boolean;
    finished: () => boolean;
    read: (len: number) => Buffer;
    readAll: () => Buffer;
    readUInt8: () => number;
    readUInt16BE: () => number;
    readUInt16LE: () => number;
    readUInt32BE: () => number;
    readUInt32LE: () => number;
    readInt32LE: () => number;
    readUInt64BEBN: () => BN;
    readUInt64LEBN: () => BN;
    readVarintNum: () => number;
    readVarLengthBuffer: () => Buffer;
    readVarintBuf: () => Buffer;
    readVarintBN: () => BN;
    reverse: () => Buffer;
    readReverse: (len?: number) => Buffer;
    pos: number;
}
declare const BufferReader: BufferReader;
export default BufferReader;
