export class ProcessingQueue {
  queue: Array<() => Promise<void>>;
  executing: boolean;
  queuePollInterval: number;

  constructor() {
    this.queue = [];
    this.run();
    this.executing = false; //This is useful for tracking state.
    this.queuePollInterval = 60000;
  }

  async run() {
    if (this.queue.length >= 1 && !this.executing) {
      try {
        this.executing = true;
        const action = this.queue?.shift();
        if (action) {
          await action();
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

  addToQueue(cb: () => Promise<void>) {
    console.log(`|> Item queued at ${new Date().toJSON()}`);
    this.queue.push(cb);
  }
}
