type JaipurAiModule = {
  HEAP32: Int32Array;
  _malloc(bytes: number): number;
  _free(pointer: number): void;
  _jaipur_choose(
    input: number,
    length: number,
    output: number,
    iterationsPerTree: number,
  ): number;
  _jaipur_choose_neural(
    input: number,
    length: number,
    output: number,
    iterationsPerTree: number,
  ): number;
  _jaipur_choose_timed(
    input: number,
    length: number,
    output: number,
    milliseconds: number,
  ): number;
  _jaipur_choose_neural_timed(
    input: number,
    length: number,
    output: number,
    milliseconds: number,
  ): number;
  _jaipur_choose_original(
    input: number,
    length: number,
    output: number,
  ): number;
};

declare const createJaipurAi: () => Promise<JaipurAiModule>;
export default createJaipurAi;
