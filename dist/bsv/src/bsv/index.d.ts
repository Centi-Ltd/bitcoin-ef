/// <reference types="node" />
/// <reference types="node" />
import bsv from '@vaionex/bsv';
declare module "@vaionex/bsv" {
    interface Transaction {
        toExtended(format: string): string | Buffer;
    }
}
export declare const BSVToExtended: (tx: bsv.Transaction, format?: string) => string | Buffer;
