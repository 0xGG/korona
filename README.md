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

Check the `index.html` for example usages.

```typescript
import { Korona, randomId } from "@0xgg/korona";

// Initialize the Korona P2P network
const peer = new Korona({
  peerId = randomId(), // The peerId, default to `randomId()`
  roomId = "public-rrom", // The roomId, default to `undefined`. If specified, then the peer will try to join the PubSub room. The peer might become the PubSub room host if there is no host yet.
  peerJSOptions: {
    // Follows https://peerjs.com/docs/#peer-options
  },
  maxPeers: 5, // Max number of peer connections that your peer can have
});

// Get ready to be used
peer.on("open", async (peerId) => {
  // When another peer just connected to you and tries to sync data with you,
  // you send some data back.
  peer.on("sync", async (send, peerId) => {
    return send({
      // ... data that you want to send
    });
  });

  // When a new peer joined the P2P network
  peer.on("peerJoined", async (peerId) => {
    console.log(`${peerId} joined`);
  });

  // When a peer left the P2P network
  peer.on("peerLeft", async (peerId) => {
    console.log(`${peerId} left`);
  });

  // When your peer gets disconnnected from the server but keep the connections alive in the P2P network. Will not be able to accept new peer connections.
  peer.on("disconnected", async () => {
    // Do something
  });

  // Emitted when the peer is destroyed and can no longer accept or create any new connections. At this time, the peer's connections will all be closed.
  peer.on("close", async () => {
    // Do something
  });

  // When there is peer error: https://peerjs.com/docs/#peeron-error
  peer.on("error", async (error) => {
    // Do something
  });

  // When you receive data from other peers
  peer.on("data", async (data: any) => {
    // Do something
  });

  // When the PubSub host changed,
  peer.on("pubSubHostChanged", async () => {
    // Do something
  });

  // Join the P2P network that other peer lives in
  await peer.requestConnection("target-peer-id");

  // Broadcast the data to all other peers in the P2P network
  await peer.broadcast({
    // Data goes here
  });

  // Send data to specific peer by id
  await peer.send("target-peer-id", {
    // Data goes here
  });
});
```

## References

- https://github.com/conclave-team/conclave
- https://hal.archives-ouvertes.fr/hal-00921633/document

## License

MIT
