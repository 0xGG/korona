# Korona

**Korona = Kill Corona (virus)**, to memorate those who fight against the corona virus bravely in 2020.  
仅已此库纪念 2020 年那些勇敢与新冠状病毒抗争的人们。

Minimal library to quickly construct decentralized p2p network

## Installation

```bash
$ npm install @0xgg/korona
```

## Demo

Simple Korona P2P Chat application:

https://0xgg.github.io/korona/

## Usages

TODO

Check the `index.html` for example usages.

## Workflow

Start:

- if for pubsub
  - `this.tryToBecomeTheRoomHost`
- else initialize peer

  - peer `this.onOpen`
    - `this.onPeerConnection`: other peer connects to you
      - connection onOpen
        - `this.onConnection`
          - `this.addToInConns(connection)`
          - `this.addToNetwork(connection.peer)`
        - `this.onData`
          - if get fromPeerId
            - `this.addToNetwork(fromPeerId)`
          - switch message type
            - `RequestType.ConnectionRequest`: someone requests to connect to you
              - `this.evaluateConnectionRequest(peerId)`
            - `RequestType.AddToNetwork`: add some peer to network
              - `this.addToNetwork(peerId)`
            - `RequestType.RemoveFromNetwork`: remove some peer from network
              - `this.removeFromNetwork(peerId)`
            - `RequestType.SyncResponse`
              - `this.handleSyncResponse(dataObj)`
            - `RequestType.SyncCompleted`
              - `this.handleSyncCompleted(dataObj)`
            - else:
              - `this.handleRemoteOperation(dataObj, connection)`
        - `this.onConnClose`
          - `this._closeConnection(connection)`
        - `this.onConnError`
          - trigger callback only now
        - `this.onConnIcestateChanged`
          - state = "closed" | "failed" | "disconnected"
            `this._closeConnection(connection)`
    - `this.onError`
      - if `Error: Could not connect to peer`
        - `this.removeFromConnection(errorPeerId)`
        - `this.findNewTarget()`
    - `this.onDisconnected`: trigger user defined callback
    - `this.addToNetwork(peerId)`

- addToNetwork(peerId):

  - if `peerId` not in `this.network`:
    - this.network.push(peerId)
    - trigger onPeerJoined(peerId) callback
    - send to other peers `RequestType.AddToNetwork`

- removeFromNetwork:

  - if `peerId` in `this.network`

    - remove `peerId` from `this.network`
    - trigger onPeerLeft(peerId) callback
    - send to other peers `RequestType.RemoveFromNetwork`

    - if for pubsub and `peerId` is roomId
      - `this.tryToBecomeTheRoomHost()`

- requestConnection(targetPeerId, peerId):

  - `peerId` connects to `targetPeerId` as `conn`
  - save `conn` to `this.addToOutConns`
  - send `RequestType.ConnectionRequest` to `peerId`

- closeConnection:

- removeFromConnections(peerId):

  - remove from `this.inConns`
  - remove from `this.outConns`
  - `this.removeFromNetwork(peerId)`

- evaluateConnectionRequest(peerId): `peerId` tries to connect to you

  - if `this.hasReachMax()`
    - `this.forwardConnRequest(peerId)`
  - else
    - `this.acceptConnRequest(peerId)`

- hasReachMax():

  - Check if the your peer has connected to enough number of peers

- forwardConnRequest(peerId):

  - Randomly pick one `conn` from `this.outConns`
  - send `RequestType.ConnectionRequest` to `conn`
  - `this.addToNetwork(peerId)`

- acceptConnRequest(peerId):

  - connect your peer to `peerId` as `connBack`
  - `this.addToOutConns(connBack)`
  - `this.addToNetwork(peerId`
  - send `Request.SyncResponse` to `connBack`

- addToInConns(connection): Add connection to `this.inConns`
- addToOutConns(connection): Add connection to `this.outConns`

- findNewTarget: Connect to other peers in the network

  - find peers in `this.network` that is not in `this.outConns` as `possibleTargets`
  - randomly pick one in target and `this.requestConection` to it.

- handleSyncResponse(fromPeerId, network):

  - get `network` and call `this.addToNetwork(peerId)` for each `peerId` in `network`
  - get `fromPeerId` and get connection from you to `fromPeerId` as `connection`
  - send `RequestType.SyncCompleted` to `connection`

- handleSyncCompleted:

- handleRemoteOperation:

## References

- https://github.com/conclave-team/conclave
- https://hal.archives-ouvertes.fr/hal-00921633/document

## License

MIT
