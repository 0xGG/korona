export default class Version {
  public peerId: string;
  public counter: number;
  public exceptions: number[];

  constructor(peerId: string, counter = 0) {
    this.peerId = peerId;
    this.counter = counter;
    this.exceptions = [];
  }

  public update(version: Version) {
    const incomingCounter = version.counter;
    if (incomingCounter <= this.counter) {
      const index = this.exceptions.indexOf(incomingCounter);
      if (index >= 0) {
        this.exceptions.splice(index, 1);
      }
    } else if (incomingCounter === this.counter + 1) {
      this.counter = this.counter + 1;
    } else {
      for (let i = this.counter + 1; i < incomingCounter; i++) {
        this.exceptions.push(i);
      }
      this.counter = incomingCounter;
    }
  }
}
