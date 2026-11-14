import { captureStorageScope } from "../private-storage.ts";

export function createChatQueue() {
  let serial: Promise<unknown> = Promise.resolve();
  let generation = 0;
  return {
    cancel() { generation++; },
    enqueue(work: (assertCurrent: () => void) => Promise<void>) {
      const version = generation, owner = captureStorageScope();
      const assertCurrent = () => {
        owner();
        if (generation !== version) throw new Error("이전 대화 처리가 중단되었습니다.");
      };
      const next = serial.catch(() => undefined).then(async () => { assertCurrent(); await work(assertCurrent); });
      serial = next;
      return next;
    },
  };
}
