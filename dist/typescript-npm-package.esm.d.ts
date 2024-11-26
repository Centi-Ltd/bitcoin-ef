/// <reference types="node" />
declare const ExtendedToStandard: (tx: Buffer | String) => Buffer | String;

interface PreviousOutput {
    lockingScript: Buffer | String;
    satoshis: number;
}
interface PreviousOutputs extends Array<PreviousOutput> {
}

declare const StandardToExtended: (tx: Buffer | String, previousOuts: PreviousOutputs) => Buffer | String;

export { ExtendedToStandard, PreviousOutput, PreviousOutputs, StandardToExtended };
