import { Term } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */
export class ProcessingQueue {
  toExecute: (args: any) => Promise<unknown> | null;
  queue: Array<Term>;
  manualQueue: Array<Term>;
  isExecuting: boolean;

  constructor() {
    this.queue = [];
    this.manualQueue = [];
    this.run();
    this.isExecuting = false;
  }

  async run() {
    if (this.queue.length >= 1 && !this.isExecuting) {
      try {
        this.isExecuting = true;
        const subject = this.queue?.shift();
        if (subject) {
          console.log(`|> TASK start for ${subject.value}`);
          await this.toExecute(subject);
        }
        console.log(
          `|> Remaining number of tasks in queue:${this.queue.length} in manual queue:${this.manualQueue.length} \n`,
        );
      } catch (error) {
        console.error(`|> Error while processing delta in queue ${error}`);
      } finally {
        this.isExecuting = false;
        console.log('|> TASK done \n|>\n');
        this.run();
      }
    }
  }

  addToQueue(subjects: Array<Term>) {
    if (!this.toExecute) {
      throw Error('|> No method is set to execute the queue items on.');
    }
    const uniqueSubjects = removeDuplicatesInTermArray(subjects);
    const subjectsInQueue = this.queue.map((subject: Term) => subject.value);
    const nonDuplicates = uniqueSubjects.filter(
      (term: Term) => !subjectsInQueue.includes(term.value),
    );

    console.log(
      `|> [${new Date().toISOString()}] Added ${
        nonDuplicates.length
      } to queue.`,
    );

    this.queue.push(...nonDuplicates);
    console.log(`|> Currently ${this.queue.length} items in queue.`);

    if (this.queue.length >= 1 && !this.isExecuting) {
      console.log('|> Queue was not empty triggering run()');
      this.run();
    }
  }

  addToManualQueue(subject: Term) {
    this.manualQueue.push(subject);
    console.log(`|> Added to manual queue: ${JSON.stringify(subject)}`);
  }

  moveManualQueueToQueue() {
    console.log(
      `|> Moving ${this.manualQueue.length} items from manual queue to the acutal executing queue.`,
    );
    this.addToQueue(this.manualQueue);
    this.manualQueue = [];
  }

  setMethodToExecute(method: (args: any) => Promise<unknown>) {
    this.toExecute = method;
  }
}

const removeDuplicatesInTermArray = (terms: Term[]): Term[] => {
  const uniqueItems = terms.filter(
    (item, index, self) =>
      index ===
      self.findIndex((t) => t.type === item.type && t.value === item.value),
  );
  return uniqueItems;
};
