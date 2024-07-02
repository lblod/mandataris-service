import { Term } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */
export class ProcessingQueue {
  toExecute: (args: any) => Promise<unknown> | null;
  queue: Array<Term>;
  executing: boolean;
  queuePollInterval: number;

  constructor() {
    this.queue = [];
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
          await this.toExecute([subject]);
        }
        console.log(`|> Remaining number of tasks ${this.queue.length}`);
      } catch (error) {
        console.error(`|> Error while processing delta in queue ${error}`);
      } finally {
        this.executing = false;
        console.log('|> Run action');
        this.run();
      }
    } else {
      setTimeout(() => {
        this.run();
      }, this.queuePollInterval);
    }
  }

  addToQueue(subjects: Array<Term>) {
    if (!this.toExecute) {
      throw Error('|> No method is set to execute the queue items on.');
    }
    console.log(
      `|> [${new Date().toJSON()}] Added ${subjects.length} to queue.`,
    );
    const subjectsInQueue = this.queue.map((subject: Term) => subject.value);
    const nonDuplicates = subjects.filter(
      (term: Term) => !subjectsInQueue.includes(term.value),
    );
    console.log(
      `|> Found ${
        subjects.length - nonDuplicates.length
      } subjects that where already in the queue.`,
    );
    this.queue.push(...nonDuplicates);
  }

  setMethodToExecute(method: (args: any) => Promise<unknown>) {
    this.toExecute = method;
  }
}
