// @ts-ignore
import Peer, { PeerJSOption, DataConnection, util } from "peerjs";
import VersionVector from "./versionVector";
import Version from "./version";

export function randomID() {
  return Math.random().toString(36).substr(2, 9);
}

export interface KoronaOptions {
  peerId?: string;
  /**
   * For pubsub, the channel name.
   */
  roomId?: string;
  peerJSOptions: PeerJSOption;
  maxPeers?: number;
  onOpen?: (id: string) => Promise<void>;
  // onConnection?: (connection: Peer.DataConnection) => void;
  onData?: (data: any, connection: DataConnection) => Promise<void>;
  onDisconnected?: () => Promise<void>;
  onPeerJoined?: (peerId: string) => Promise<void>;
  onPeerLeft?: (peerId: string) => Promise<void>;
  onPubSubHostChanged?: () => Promise<void>;
  createDataForInitialSync?: () => Promise<object>;
}

export enum RequestType {
  ConnectionRequest = "cr",
  RemoveFromNetwork = "rfn",
  AddToNetwork = "adn",
  SyncResponse = "sr",
  SyncCompleted = "sc",
}

export class Korona {
  public peer?: Peer;
  private connections: DataConnection[] = [];
  private outConns = new Set<string>();
  private inConns = new Set<string>();
  /**
   * key is the peerId
   * value is the set of peerIds that have forwarded the connection to this peer
   */
  private forwardedConnectionPeers: { [key: string]: Set<string> } = {};
  private requestingConnectionToPeers = new Set<string>();
  private maxPeers: number;
  private versionVector?: VersionVector;
  private _onOpen?: (peerId: string) => Promise<void>;
  private _onDisconnected?: () => Promise<void>;
  private _onData?: (data: any, connection: DataConnection) => Promise<void>;
  private _onPeerJoined?: (peerId: string) => Promise<void>;
  private _onPeerLeft?: (peerId: string) => Promise<void>;
  private _onPubSubHostChanged?: () => Promise<void>;
  private _createDataForInitialSync?: () => Promise<object>;
  private _options?: KoronaOptions;

  /**
   * List of peer IDs
   */
  public network: Set<string>;
  private networkTimestamps: { [key: string]: number } = {};

  constructor(options: KoronaOptions) {
    this._options = options;
    this.connections = [];
    this.outConns = new Set<string>();
    this.inConns = new Set<string>();
    this.network = new Set<string>();
    this.networkTimestamps = {};
    this.forwardedConnectionPeers = {};
    this.requestingConnectionToPeers = new Set<string>();
    this.maxPeers = options.maxPeers || 5;
    if (this.maxPeers < 2) {
      this.maxPeers = 2;
    }

    // Bind callbacks
    this._onOpen = options.onOpen;
    this._onDisconnected = options.onDisconnected;
    this._onData = options.onData;
    this._onPeerJoined = options.onPeerJoined;
    this._onPeerLeft = options.onPeerLeft;
    this._onPubSubHostChanged = options.onPubSubHostChanged;
    this._createDataForInitialSync = options.createDataForInitialSync;
    if (!this._createDataForInitialSync) {
      this._createDataForInitialSync = async () => {
        return {};
      };
    }

    const peerId = options.peerId || randomID();

    if (options.roomId) {
      // pubsub
      this.tryToBecomeTheRoomHost();
    } else {
      this.peer = new Peer(peerId, options.peerJSOptions);
      this.onOpen();
    }
  }

  private getOutConnections(): DataConnection[] {
    return this.connections.filter((connection) => {
      return this.outConns.has(connection.peer);
    });
  }

  private async tryToBecomeTheRoomHost() {
    // console.log("* tryToBecomeTheRoomHost");
    if (!this._options?.roomId) {
      return;
    }

    const oldPeer = this.peer;
    this._onOpen = async (pid) => {
      // console.log("* room host created", pid);
      if (oldPeer) {
        // console.log("* closing old peer: ", oldPeer.id, [...this.network]);
        this.network.delete(oldPeer.id);
        oldPeer.destroy();
      }
      if (this._options?.onOpen) {
        await this._options.onOpen(pid);
      }
      if (this._onPubSubHostChanged) {
        this._onPubSubHostChanged();
      }
    };
    this.peer = new Peer(this._options.roomId, this._options.peerJSOptions);
    this.onOpen();
    this.peer.on("error", async (err: any) => {
      // Room host already exists
      if (err.type === "unavailable-id") {
        // console.log("* room host already exists");
        if (!oldPeer) {
          // Initialize peer
          const peerId = this._options?.peerId || randomID();
          this._onOpen = async (pid) => {
            if (this._options?.roomId) {
              await this.requestConnection(this._options?.roomId, pid);
            }
            if (this._options?.onOpen) {
              await this._options.onOpen(pid);
            }
          };
          this.peer = new Peer(peerId, this._options?.peerJSOptions);
          this.onOpen();
        } else {
          // Reconnect to room
          this.peer = oldPeer;
          // this.network = []; // clean up the network
          this.network.delete(this._options?.roomId || "");

          if (this._options?.roomId) {
            const connection = this.connections.find(
              (connection) => connection.peer === this._options?.roomId
            );
            if (connection && connection.open) {
              connection.close();
              this.connections = this.connections.filter(
                (connection) => connection.peer !== this._options?.roomId
              );
            }

            this.inConns.delete(this._options?.roomId);
            this.outConns.delete(this._options?.roomId);
            await this.connectToPeer(this._options?.roomId);
          }
        }

        if (this._onPubSubHostChanged) {
          this._onPubSubHostChanged();
        }
      }
    });
  }

  /**
   * Broadcast data to all peers.
   * @param operation
   * @param from
   * @returns
   */
  public send(operation: object, from?: DataConnection) {
    let operationJSON: any;
    let fromPeerId: string;
    if (!this.peer?.id || !this.versionVector) {
      return;
    }

    if ("_v" in operation) {
      fromPeerId = (operation as any)["_v"]["p"];
      // Already has Version information
      operationJSON = JSON.stringify(operation);
    } else {
      fromPeerId = this.peer.id;
      this.versionVector.increment();
      operationJSON = JSON.stringify(
        Object.assign(operation, {
          _v: {
            // Version
            p: fromPeerId,
            c: this.versionVector.localVersion.counter,
          },
        })
      );
    }

    this.getOutConnections().forEach((conn) => {
      if (
        fromPeerId !== conn.peer &&
        (!from || (from.peer !== conn.peer && from.label !== conn.label))
      ) {
        conn.send(operationJSON);
      }
    });
  }

  /**
   * Send data to a peer.
   */
  public async sendToPeer(peerId: string, operation: object) {
    let operationJSON: any;
    let fromPeerId: string;
    if (peerId === this.peer?.id) {
      throw new Error("Cannot send to self");
    }
    if (!this.peer?.id || !this.versionVector) {
      return;
    }
    fromPeerId = this.peer.id;
    this.versionVector.increment();
    operationJSON = JSON.stringify(
      Object.assign(operation, {
        _v: {
          // Version
          p: fromPeerId,
          c: this.versionVector.localVersion.counter,
          s: true,
        },
      })
    );

    const connection = await this.connectToPeer(peerId);
    if (connection) {
      connection.send(operationJSON);
    }
  }

  private onOpen() {
    this.peer?.on("open", async (id: string) => {
      if (!this.versionVector) {
        this.versionVector = new VersionVector(id);
      } else {
        const version = this.versionVector.getVersionFromVectors(id);
        if (version) {
          this.versionVector.setLocalVersion(version);
        } else {
          this.versionVector.setLocalVersion(new Version(id));
        }
      }

      // Code below gives bug
      this.connections.forEach((connection) => {
        // console.log("onOpen close connection", connection.peer);
        connection.close();
      });

      this.connections = [];
      this.outConns = new Set<string>();
      this.inConns = new Set<string>();
      this.forwardedConnectionPeers = {};
      this.requestingConnectionToPeers = new Set<string>();
      /*
      if (this.network.length) {
        this.network.forEach((peerId) => {
          if (peerId !== id) {
            this.requestConnection(peerId);
          }
        });
      }*/
      // this.network = [];

      this.onPeerConnection();
      this.onError();
      this.onDisconnected();
      await this.addToNetwork(id);

      if (this._onOpen) {
        await this._onOpen(id);
      }
    });
  }

  private connectToPeer(peerId: string): Promise<DataConnection> {
    return new Promise((resolve, reject) => {
      // console.log("* connectToPeer", peerId);
      if (this.peer?.id === peerId) {
        reject(new Error("Cannot connect to self"));
      }
      let connection = this.connections.find((conn) => conn.peer === peerId);
      // console.log("** connection", !!connection);
      if (!connection) {
        connection = this.peer?.connect(peerId);
        // console.log("*** create connection: ", !!connection);
        if (connection) {
          const helper = async () => {
            // console.log("**** helper: ", !!connection);
            if (connection) {
              this.addToOutConns(connection);
              await this.addToNetwork(connection.peer);
              this.registerConnectionEvents(connection);
              return resolve(connection);
            }
          };
          if (connection.open) {
            helper();
          } else {
            connection.on("open", helper);
          }
        } else {
          return reject(`connectToPeer failed`);
        }
      } else {
        (async () => {
          this.addToOutConns(connection);
          await this.addToNetwork(peerId);
          return resolve(connection);
        })();
      }
    });
  }

  private onPeerConnection() {
    this.peer?.on("connection", (connection: DataConnection) => {
      connection.on("open", async () => {
        // console.log("* peer connection opened", connection.peer, this.peer?.id);
        this.addToInConns(connection);
        await this.addToNetwork(connection.peer);
        this.registerConnectionEvents(connection);
      });
    });
  }

  private registerConnectionEvents(connection: DataConnection) {
    this.onData(connection);
    this.onConnClose(connection);
    this.onConnError(connection);
    this.onConnIcestateChanged(connection);
  }

  private onError() {
    this.peer?.on("error", async (err: any) => {
      // console.log("* peer error", err);
      const pid = String(err).replace("Error: Could not connect to peer ", "");
      await this.removeFromConnections(pid);
      if (!this.peer?.disconnected && !this.hasReachMax()) {
        await this.findNewTarget();
      }
    });
  }

  private onDisconnected() {
    this.peer?.on("disconnected", () => {
      // Disconnected
      if (this._onDisconnected) {
        this._onDisconnected();
      }
    });
  }

  private onData(connection: DataConnection) {
    connection.on("data", async (data: any) => {
      let dataObj: any = {};

      try {
        dataObj = JSON.parse(data);
      } catch (error) {
        dataObj = {};
      }

      // console.log("* data", connection.peer, dataObj);

      const fromPeerId = dataObj["_v"]?.p;
      if (fromPeerId) {
        await this.addToNetwork(fromPeerId);
      }

      switch (dataObj.type) {
        case RequestType.ConnectionRequest:
          await this.evaluateConnectionRequest(dataObj.peerId);
          break;
        case RequestType.AddToNetwork:
          await this.addToNetwork(dataObj.peerId);
          break;
        case RequestType.RemoveFromNetwork:
          if (dataObj.peerId !== fromPeerId) {
            await this.removeFromNetwork(dataObj.peerId);
          } else {
            // Needs to add this, otherwise will cause infinite loop
            throw new Error("Cannot remove self from network");
          }
          break;
        case RequestType.SyncResponse:
          await this.handleSyncResponse(dataObj);
          break;
        case RequestType.SyncCompleted:
          await this.handleSyncCompleted(dataObj);
          break;
        default:
          await this.handleRemoteOperation(dataObj, connection);
      }
    });
  }
  private async _closeConnection(connection: DataConnection) {
    // console.log("* closing connection", connection.peer);
    await this.removeFromConnections(connection.peer);
    if (!this.hasReachMax()) {
      await this.findNewTarget();
    }
  }

  private onConnClose(connection: DataConnection) {
    connection.on("close", async () => {
      // console.log("* connection closed", connection.peer);
      await this._closeConnection(connection);
    });
  }

  private onConnError(connection: DataConnection) {
    connection.on("error", (error: any) => {
      console.error(`* connection error: `, connection, error);
    });
  }

  private onConnIcestateChanged(connection: DataConnection) {
    connection.on("iceStateChanged", async (state) => {
      // console.log("* iceStateChanged", state, connection.peer);
      if (
        state === "closed" ||
        state === "failed" ||
        state === "disconnected"
      ) {
        await this._closeConnection(connection);
      }
    });
  }

  private async evaluateConnectionRequest(peerId: string) {
    // console.log("* evaluateConnectionRequest: ", peerId);
    if (this.hasReachMax()) {
      await this.forwardConnRequest(peerId);
    } else {
      await this.acceptConnRequest(peerId);
    }
  }

  private async forwardConnRequest(peerId: string) {
    // console.log("* forwardConnRequest: ", peerId);
    const connected = this.getOutConnections().filter(
      (conn) =>
        conn.peer !== peerId &&
        (!this.forwardedConnectionPeers[peerId] ||
          !this.forwardedConnectionPeers[peerId].has(conn.peer))
    );
    if (connected.length > 0) {
      const randomIdx = Math.floor(Math.random() * connected.length);
      /* console.log(
        "** can forward: ",
        connected[randomIdx].peer,
        connected.length
      );*/
      connected[randomIdx].send(
        JSON.stringify({
          type: RequestType.ConnectionRequest,
          peerId: peerId,
        })
      );
      await this.addToNetwork(peerId);
      if (this.forwardedConnectionPeers[peerId]) {
        this.forwardedConnectionPeers[peerId].add(connected[randomIdx].peer);
      } else {
        this.forwardedConnectionPeers[peerId] = new Set([
          connected[randomIdx].peer,
        ]);
      }
    } else {
      // console.log("** can't forward");
      await this.acceptConnRequest(peerId);
    }
  }

  private async acceptConnRequest(peerId: string) {
    // console.log("* acceptConnRequest: ", peerId);
    if (peerId !== this.peer?.id) {
      const connection = await this.connectToPeer(peerId);
      if (connection) {
        const initialData: any = JSON.stringify({
          type: RequestType.SyncResponse,
          peerId: this.peer?.id,
          network: Array.from(this.network),
        });
        connection.send(initialData);
      }
    }
  }

  private async addToNetwork(peerId: string, timestamp: number = Date.now()) {
    if (!this.network.has(peerId)) {
      // console.log("* addToNetwork: ", peerId, Array.from(this.network));

      this.network.add(peerId);

      if (this._onPeerJoined) {
        this._onPeerJoined(peerId);
      }

      this.send({
        type: RequestType.AddToNetwork,
        peerId: peerId,
        timestamp,
      });
      this.networkTimestamps[peerId] = timestamp;

      // If haven't reach max, connect to that peer
      if (!this.hasReachMax() && peerId !== this.peer?.id) {
        await this.findNewTarget();
      }
    }
  }

  private async removeFromConnections(peerId: string) {
    // console.log("* removeFromConections: ", peerId);
    this.connections = this.connections.filter((conn) => conn.peer !== peerId);
    this.inConns.delete(peerId);
    this.outConns.delete(peerId);
    delete this.forwardedConnectionPeers[peerId];
    await this.removeFromNetwork(peerId);
  }

  private async removeFromNetwork(
    peerId: string,
    timestamp: number = Date.now()
  ) {
    if (
      this.network.has(peerId) &&
      timestamp > (this.networkTimestamps[peerId] || 0)
    ) {
      // console.log("* removeFromNetwork: ", peerId, Array.from(this.network));

      this.network.delete(peerId);
      if (this._onPeerLeft) {
        this._onPeerLeft(peerId);
      }

      this.send({
        type: RequestType.RemoveFromNetwork,
        peerId: peerId,
        timestamp,
      });
    }

    if (
      this._options?.roomId &&
      this.peer?.id !== this._options?.roomId &&
      peerId === this._options?.roomId
    ) {
      await this.tryToBecomeTheRoomHost();
    }
  }

  private hasReachMax(): boolean {
    return this.connections.length > this.maxPeers;
    /*
    const halfTheNetwork = Math.ceil(this.network.size / 2);
    const tooManyInConns =
      this.inConns.size > Math.max(halfTheNetwork, this.maxPeers);
    const tooManyOutConns =
      this.outConns.size > Math.max(halfTheNetwork, this.maxPeers);

    return tooManyInConns || tooManyOutConns;
    */
  }

  private async findNewTarget() {
    const unconnected = Array.from(this.network).filter(
      (peerId) => !this.outConns.has(peerId)
    );
    const possibleTargets = unconnected.filter(
      (peerId) => peerId !== this.peer?.id
    );
    // console.log("* findNewTarget, possibleTargets: ", possibleTargets);
    if (possibleTargets.length === 0) {
      // NOTE: no targets found
    } else {
      const randomIdx = Math.floor(Math.random() * possibleTargets.length);
      const newTarget = possibleTargets[randomIdx];
      if (this.peer?.id) {
        await this.connectToPeer(newTarget);
      }
    }
  }

  public async requestConnection(targetPeerId: string, peerId?: string) {
    if (!peerId) {
      peerId = this.peer?.id;
    }
    if (!peerId) {
      throw new Error(`requestConnection: peerId is required`);
    }
    if (peerId === targetPeerId) {
      throw new Error(`requestConnection: peerId cannot be the same`);
    }
    if (this.connections.find((conn) => conn.peer === targetPeerId)) {
      // NOTE: already connected
      return;
    }

    if (this.requestingConnectionToPeers.has(targetPeerId)) {
      // console.log("* requestConnection: already requesting: ", targetPeerId);
      return;
    } else {
      this.requestingConnectionToPeers.add(targetPeerId);
      // console.log("* requestConnection: ", targetPeerId, peerId, timestamp);
      const connection = await this.connectToPeer(targetPeerId);
      // console.log("* requestConnection response: ", !!connection);
      const dataToSend = JSON.stringify({
        type: RequestType.ConnectionRequest,
        peerId: peerId,
      });
      this.requestingConnectionToPeers.delete(targetPeerId);
      connection.send(dataToSend);
    }
  }

  private addToInConns(connection: DataConnection) {
    if (!!connection && !this._isAlreadyConnectedIn(connection)) {
      this.inConns.add(connection.peer);
      this._addToConnection(connection);
    }
  }

  private addToOutConns(connection: DataConnection) {
    if (!!connection && !this._isAlreadyConnectedOut(connection)) {
      this.outConns.add(connection.peer);
      this._addToConnection(connection);
    }
  }

  private _addToConnection(connection: DataConnection) {
    if (
      !!connection &&
      !this.connections.find(
        (conn) =>
          conn.label === connection.label && conn.peer === connection.peer
      )
    ) {
      this.connections.push(connection);
    }
  }

  private _isAlreadyConnectedOut(connection: DataConnection) {
    return this.outConns.has(connection.peer);
  }

  private _isAlreadyConnectedIn(connection: DataConnection) {
    return this.inConns.has(connection.peer);
  }

  private async handleRemoteOperation(
    operation: any,
    connection: DataConnection
  ) {
    const v = operation._v;
    if (
      v &&
      "p" in v &&
      "c" in v &&
      v.p !== this.peer?.id && // Can't send message back to the sender
      this.versionVector &&
      !this.versionVector.hasBeenApplied(new Version(v.p, v.c))
    ) {
      this.versionVector.update(new Version(v.p, v.c));
      if (!("s" in v)) {
        this.send(operation, connection);
      }
      if (this._onData) {
        await this._onData(operation, connection);
      }
    }
  }

  private async handleSyncResponse(operation: any) {
    const fromPeerId = operation.peerId;
    if (fromPeerId !== this.peer?.id) {
      const network: string[] = operation.network || [];
      await Promise.all(
        Array.from(network).map((peerId) => this.addToNetwork(peerId))
      );

      // Sync complete
      // console.log("* handleSyncResponse: ", fromPeerId, network);
      const connection = await this.connectToPeer(fromPeerId);
      const completedMessage = JSON.stringify({
        type: RequestType.SyncCompleted,
        peerId: this.peer?.id,
      });
      connection.send(completedMessage);
    }
  }

  private async handleSyncCompleted(operation: any) {
    const fromPeerId = operation.peerId;
    if (fromPeerId !== this.peer?.id) {
      this.versionVector?.increment();
      // console.log("* handleSyncCompleted: ", fromPeerId);
      let connection = await this.connectToPeer(fromPeerId);
      const dataToSend = JSON.stringify(
        Object.assign(
          this._createDataForInitialSync
            ? this._createDataForInitialSync()
            : {},
          {
            _v: {
              p: this.peer?.id,
              c: this.versionVector?.localVersion.counter,
            },
          }
        )
      );
      connection.send(dataToSend);
    }
  }

  public isPubSubHost(): boolean {
    return (
      this._options?.roomId !== undefined &&
      this.peer?.id === this._options?.roomId
    );
  }
}
