/// <reference types="node" />
/// <reference types="node" />
export interface PreviousOutput {
    lockingScript: Buffer | String;
    satoshis: number;
}
export interface PreviousOutputs extends Array<PreviousOutput> {
}
