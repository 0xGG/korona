import Version from "./version";

export default class VersionVector {
  public versions: Version[];
  public localVersion: Version;
  constructor(peerID: string) {
    this.localVersion = new Version(peerID);
    this.versions = [this.localVersion];
  }

  public increment() {
    this.localVersion.counter++;
  }

  // Update vector with new version received from another site
  public update(incomingVersion: Version) {
    let existingVersion = this.getVersionFromVectors(incomingVersion);

    if (!existingVersion) {
      const newVersion = new Version(incomingVersion.peerID);
      newVersion.update(incomingVersion);
      this.versions.push(newVersion);
    } else {
      existingVersion.update(incomingVersion);
    }
  }

  // Check if the incoming remote operation has already been applied to our crdt
  public hasBeenApplied(incomingVersion: Version) {
    let localIncomingVersion = this.getVersionFromVectors(incomingVersion);
    if (!localIncomingVersion) {
      return false;
    }

    const isIncomingLower =
      incomingVersion.counter <= localIncomingVersion.counter;
    const isInExceptions =
      localIncomingVersion.exceptions.indexOf(incomingVersion.counter) >= 0;
    return isIncomingLower && !isInExceptions;
  }

  private getVersionFromVectors(version: Version) {
    let localVersion = null;
    for (let i = 0; i < this.versions.length; i++) {
      if (this.versions[i].peerID === version.peerID) {
        localVersion = this.versions[i];
        break;
      }
    }
    return localVersion;
  }

  public getLocalVersion(): Version {
    const localVersion = new Version(this.localVersion.peerID);
    localVersion.counter = this.localVersion.counter;
    return localVersion;
  }
}
