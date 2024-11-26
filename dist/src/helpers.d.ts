/// <reference types="node" />
/// <reference types="node" />
import BufferReader from "./bufferreader";
import BufferWriter from "./bufferwriter";
export declare const initReaderWriter: (tx: Buffer | String) => {
    returnBuffer: boolean;
    reader: BufferReader;
    writer: BufferWriter;
};
export declare const writeOutputs: (reader: BufferReader, writer: BufferWriter) => void;
