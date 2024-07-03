import { Term } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */
export class ProcessingQueue {
  toExecute: (args: any) => Promise<unknown> | null;
  queue: Array<Term>;
  manualQueue: Array<Term>;
  executing: boolean;
  queuePollInterval: number;

  constructor() {
    this.queue = [];
    this.manualQueue = [];
    this.run();
    this.executing = false;
    this.queuePollInterval = 60000;
  }

  async run() {
    if (this.queue.length >= 1 && !this.executing) {
      try {
        this.executing = true;
        const subject = this.queue?.shift();
        if (subject) {
          console.log(`|> Execute action on mandataris: ${subject.value}`);
          await this.toExecute(subject);
        }
        console.log(
          `|> Remaining number of tasks ${this.queue.length} \n`,
          this.queue.map((q) => `|> \t${q.value}`).join('\n'),
        );
      } catch (error) {
        console.error(`|> Error while processing delta in queue ${error}`);
      } finally {
        this.executing = false;
        console.log('|> Done with action for queue item');
        this.run();
      }
    } else {
      setTimeout(() => {
        console.log(
          `|> Trigger run, ${this.queue.length} remaining queue items and ${this.manualQueue.length} manual queued items`,
        );
        this.run();
      }, this.queuePollInterval);
    }
  }

  addToQueue(subjects: Array<Term>) {
    if (!this.toExecute) {
      throw Error('|> No method is set to execute the queue items on.');
    }

    const subjectsInQueue = this.queue.map((subject: Term) => subject.value);
    const nonDuplicates = subjects.filter(
      (term: Term) => !subjectsInQueue.includes(term.value),
    );

    console.log(
      `|> [${new Date().toISOString()}] Added ${
        nonDuplicates.length
      } to queue.`,
    );

    this.queue.push(...nonDuplicates);
  }

  addToManualQueue(subject: Term) {
    const subjectsInQueue = this.manualQueue.map(
      (subject: Term) => subject.value,
    );

    if (!subjectsInQueue.includes(subject.value)) {
      this.manualQueue.push(subject);
      console.log(`|> Added to manual queue: ${JSON.stringify(subject)}`);
    }
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
