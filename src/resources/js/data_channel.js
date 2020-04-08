/*
 * references
 * https://github.com/webrtc/FirebaseRTC
 * https://webrtc.org/getting-started/firebase-rtc-codelab
 * https://webrtc.org/getting-started/data-channels
 *
 */

'use strict;';

import * as firebase from 'firebase/app';
import 'firebase/firestore';
import { firebaseConfig } from './firebase_config.js';
import { generatePushID } from './generate_pushid.js';
import seedrandom from 'seedrandom';
import { setCustomRng } from './offline_version_js/rand.js';
import { mod, isInModRange } from './mod.js';
import { PikaUserInputWithSync } from './pika_keyboard_online.js';
import {
  printCurrentRoomID,
  getJoinRoomID,
  noticeDisconnected,
  enableMessageBtns,
  showGameCanvas,
  hideWatingPeerAssetsLoadingBox,
  hidePingBox,
  printAvgPing,
  printStartsIn,
} from './ui_online.js';
import {
  setChatRngs,
  displayMyChatMessage,
  displayPeerChatMessage,
} from './chat_display.js';

firebase.initializeApp(firebaseConfig);

export const channel = {
  isOpen: false,
  gameStartAllowed: false,
  amICreatedRoom: false,
  amIPlayer2: null, // set from pikavolley_online.js

  /** @type {PikaUserInputWithSync[]} */
  peerInputQueue: [],
  _peerInputQueueSyncCounter: 0,
  get peerInputQueueSyncCounter() {
    return this._peerInputQueueSyncCounter;
  },
  set peerInputQueueSyncCounter(counter) {
    this._peerInputQueueSyncCounter = mod(counter, 256);
  },

  callbackAfterDataChannelOpened: null,
  callbackAfterPeerInputQueueReceived: null,
};

const pingTestManager = {
  pingSentTimeArray: new Array(5),
  receivedPingResponseNumber: 0,
  pingMesurementArray: [],
};

const chatManager = {
  pendingChatMessage: '',
  resendIntervalID: null,
  _syncCounter: 0,
  _peerSyncCounter: 9,
  get syncCounter() {
    return this._syncCounter;
  },
  set syncCounter(n) {
    this._syncCounter = n % 10;
  },
  get peerSyncCounter() {
    return this._peerSyncCounter;
  },
  set peerSyncCounter(n) {
    this._peerSyncCounter = n % 10;
  },
};

const configuration = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
    {
      urls: ['stun:stun.stunprotocol.org'],
    },
  ],
};

let peerConnection = null;
let dataChannel = null;
let roomId = null;
let isFirstInputQueueFromPeer = true;

export async function createRoom() {
  channel.amICreatedRoom = true;
  roomId = generatePushID();

  const db = firebase.firestore();
  const roomRef = db.collection('rooms').doc(roomId);

  console.log('Create PeerConnection with configuration: ', configuration);
  peerConnection = new RTCPeerConnection(configuration);
  registerPeerConnectionListeners(peerConnection);

  collectIceCandidates(
    roomRef,
    peerConnection,
    'offerorCandidates',
    'answererCandidates'
  );

  console.log('Create DataChannel', dataChannel);
  dataChannel = peerConnection.createDataChannel('pikavolley_p2p_channel');

  dataChannel.addEventListener('open', dataChannelOpened);
  dataChannel.addEventListener('message', recieveFromPeer);
  dataChannel.addEventListener('close', dataChannelClosed);

  roomRef.onSnapshot(async (snapshot) => {
    console.log('Got updated room:', snapshot.data());
    const data = snapshot.data();
    if (!peerConnection.currentRemoteDescription && data.answer) {
      printLog('Answer received');
      console.log('Set remote description: ', data.answer);
      const answer = data.answer;
      await peerConnection.setRemoteDescription(answer);
    }
  });

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  console.log('Created offer and set local description:', offer);
  const roomWithOffer = {
    offer: {
      type: offer.type,
      sdp: offer.sdp,
    },
  };
  roomRef.set(roomWithOffer);
  console.log(`New room created with SDP offer. Room ID: ${roomRef.id}`);
  printLog('Offer sent');

  printCurrentRoomID(roomId);
}

export async function joinRoom() {
  // @ts-ignore
  roomId = getJoinRoomID();
  if (roomId.length !== 20) {
    printLog(
      'The room ID is not in correct form. Please check the entered room ID.'
    );
    return false;
  }
  console.log('Join room: ', roomId);
  printCurrentRoomID(roomId);

  // eslint-disable-next-line no-undef
  const db = firebase.firestore();
  const roomRef = db.collection('rooms').doc(`${roomId}`);
  const roomSnapshot = await roomRef.get();
  console.log('Got room:', roomSnapshot.exists);
  if (!roomSnapshot.exists) {
    printLog(
      'There is no room mathing the ID. Please check the entered room ID.'
    );
    return false;
  }

  console.log('Create PeerConnection with configuration: ', configuration);
  peerConnection = new RTCPeerConnection(configuration);
  registerPeerConnectionListeners(peerConnection);

  // Code for collecting ICE candidates below
  collectIceCandidates(
    roomRef,
    peerConnection,
    'answererCandidates',
    'offerorCandidates'
  );

  // Code for creating SDP answer below
  const offer = roomSnapshot.data().offer;
  await peerConnection.setRemoteDescription(offer);
  console.log('Set remote description: ', offer);
  printLog('Offer received');
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  console.log('set local description:', answer);

  const roomWithAnswer = {
    answer: {
      type: answer.type,
      sdp: answer.sdp,
    },
  };
  await roomRef.update(roomWithAnswer);
  printLog('Answer sent');
  console.log('joined room!');

  return true;
}

export async function closeAndCleaning() {
  if (dataChannel) {
    dataChannel.close();
  }
  if (peerConnection) {
    peerConnection.close();
  }
  // Delete room on hangup
  if (roomId) {
    // eslint-disable-next-line no-undef
    const db = firebase.firestore();
    const roomRef = db.collection('rooms').doc(roomId);
    await roomRef.delete();
    console.log('did room delete!');
  }
  console.log('Did close and Cleaning!');
}

/**
 * Send my input queue to the peer
 * @param {PikaUserInputWithSync[]} inputQueue
 */
export function sendInputQueueToPeer(inputQueue) {
  const buffer = new ArrayBuffer(4 * inputQueue.length);
  const dataView = new DataView(buffer);
  for (let i = 0; i < inputQueue.length; i++) {
    const input = inputQueue[i];
    dataView.setUint8(4 * i + 0, input.syncCounter);
    dataView.setUint8(4 * i + 1, input.xDirection);
    dataView.setUint8(4 * i + 2, input.yDirection);
    dataView.setUint8(4 * i + 3, input.powerHit);
  }
  dataChannel.send(buffer);
}

/**
 * Receive peer's input queue from the peer
 * @param {ArrayBuffer} data
 */
function receiveInputQueueFromPeer(data) {
  if (isFirstInputQueueFromPeer) {
    isFirstInputQueueFromPeer = false;
    hideWatingPeerAssetsLoadingBox();
  }

  const dataView = new DataView(data);

  for (let i = 0; i < data.byteLength / 4; i++) {
    const syncCounter = dataView.getUint8(i * 4 + 0);
    // isInModeRange in the below if statement is
    // to prevent overflow of the queue by a corrupted peer code
    if (
      syncCounter === channel.peerInputQueueSyncCounter &&
      (channel.peerInputQueue.length === 0 ||
        isInModRange(
          syncCounter,
          channel.peerInputQueue[0].syncCounter,
          channel.peerInputQueue[0].syncCounter + 10,
          256
        ))
    ) {
      const xDirection = dataView.getInt8(i * 4 + 1);
      const yDirection = dataView.getInt8(i * 4 + 2);
      const powerHit = dataView.getInt8(i * 4 + 3);
      const peerInputWithSync = new PikaUserInputWithSync(
        syncCounter,
        xDirection,
        yDirection,
        powerHit
      );
      channel.peerInputQueue.push(peerInputWithSync);
      channel.peerInputQueueSyncCounter++;
    }
  }
}

/**
 * Send chat message to the peer
 * @param {string} chatMessage
 */
export function sendChatMessageToPeer(chatMessage) {
  chatManager.pendingChatMessage = chatMessage;
  // append syncCounter at the end of chat message;
  const chatMessageToPeer = chatMessage + String(chatManager.syncCounter);
  dataChannel.send(chatMessageToPeer);
  chatManager.resendIntervalID = setInterval(
    () => dataChannel.send(chatMessageToPeer),
    1000
  );
  return;
}

/**
 * Receive chat message ACK(acknowledgment) array buffer from peer.
 * @param {ArrayBuffer} data array buffer with length 1
 */
function receiveChatMessageAckFromPeer(data) {
  const dataView = new DataView(data);
  const syncCounter = dataView.getInt8(0);
  if (syncCounter === chatManager.syncCounter) {
    chatManager.syncCounter++;
    clearInterval(chatManager.resendIntervalID);
    displayMyChatMessage(chatManager.pendingChatMessage);
    enableMessageBtns();
  }
}

/**
 * Receive chat meesage from the peer
 * @param {string} chatMessage
 */
function receiveChatMessageFromPeer(chatMessage) {
  // Read syncCounter at the end of chat message
  const peerSyncCounter = Number(chatMessage.slice(-1));
  if (peerSyncCounter === chatManager.peerSyncCounter) {
    // if peer resend prevMessage since peer did not recieve
    // the message ACK(acknowledgment) array buffer with length 1
    console.log('arraybuffer with length 1 for chat message ACK resent');
  } else if (peerSyncCounter === (chatManager.peerSyncCounter + 1) % 10) {
    // if peer send new message
    chatManager.peerSyncCounter++;
    displayPeerChatMessage(chatMessage.slice(0, -1));
  } else {
    console.log('invalid chat message received.');
    return;
  }

  // Send the message ACK array buffer with length 1.
  const buffer = new ArrayBuffer(1);
  const dataView = new DataView(buffer);
  dataView.setInt8(0, peerSyncCounter);
  dataChannel.send(buffer);
}

function startGameAfterPingTest() {
  printLog('start ping test');
  const buffer = new ArrayBuffer(2);
  const view = new DataView(buffer);
  view.setInt16(0, -1, true);
  let n = 0;
  const intervalID = setInterval(() => {
    if (n === 5) {
      window.clearInterval(intervalID);
      const sum = pingTestManager.pingMesurementArray.reduce(
        (acc, val) => acc + val,
        0
      );
      const avg = sum / pingTestManager.pingMesurementArray.length;
      console.log(
        `average ping: ${avg} ms, ping list: ${pingTestManager.pingMesurementArray}`
      );
      printLog(`Average ping: ${avg} ms`);
      printLog(`The game will start in 5 seconds.`);
      showGameCanvas();

      printAvgPing(avg);

      let t = 5;
      printStartsIn(t);
      const intervalID2 = setInterval(() => {
        t--;
        printStartsIn(t);
        if (t === 0) {
          window.clearInterval(intervalID2);
          hidePingBox();
          channel.gameStartAllowed = true;
          return;
        }
      }, 1000);
      return;
    }
    pingTestManager.pingSentTimeArray[n] = Date.now();
    dataChannel.send(buffer);
    printLog('.');
    n++;
  }, 1000);
}

function respondToPingTest(data) {
  const dataView = new DataView(data);
  // TODO: clean ping test to arraybuffer with length 1?
  if (dataView.getInt16(0, true) === -1) {
    const buffer = new ArrayBuffer(2);
    const view = new DataView(buffer);
    view.setInt16(0, -2, true);
    console.log('respond to ping');
    dataChannel.send(buffer);
  } else if (dataView.getInt16(0, true) === -2) {
    pingTestManager.pingMesurementArray.push(
      Date.now() -
        pingTestManager.pingSentTimeArray[
          pingTestManager.receivedPingResponseNumber
        ]
    );
    pingTestManager.receivedPingResponseNumber++;
  }
}

function recieveFromPeer(event) {
  const data = event.data;
  if (data instanceof ArrayBuffer) {
    if (data.byteLength % 4 === 0 && data.byteLength / 4 <= 11) {
      receiveInputQueueFromPeer(data);
      if (channel.callbackAfterPeerInputQueueReceived !== null) {
        const callback = channel.callbackAfterPeerInputQueueReceived;
        channel.callbackAfterPeerInputQueueReceived = null;
        callback();
      }
    } else if (data.byteLength === 1) {
      receiveChatMessageAckFromPeer(data);
    } else if (data.byteLength === 2) {
      respondToPingTest(data);
    }
  } else if (typeof data === 'string') {
    receiveChatMessageFromPeer(data);
  }
}

/**
 * Data channel open event listener
 */
function dataChannelOpened() {
  console.log('data channel opened!');
  printLog('data channel opened!');
  channel.isOpen = true;
  dataChannel.binaryType = 'arraybuffer';

  const customRng = seedrandom.alea(roomId.slice(10));
  setCustomRng(customRng);

  const rngForPlayer1Chat = seedrandom.alea(roomId.slice(10, 15));
  const rngForPlayer2Chat = seedrandom.alea(roomId.slice(15));
  setChatRngs(rngForPlayer1Chat, rngForPlayer2Chat);

  enableMessageBtns();
  startGameAfterPingTest();
}

/**
 * Data channel close event listener
 */
function dataChannelClosed() {
  console.log('data channel closed');
  channel.isOpen = false;
  noticeDisconnected();
}

function printLog(log) {
  const connectionLog = document.getElementById('connection-log');
  connectionLog.textContent += `${log}\n`;
  connectionLog.scrollIntoView();
}

function registerPeerConnectionListeners(peerConnection) {
  peerConnection.addEventListener('icegatheringstatechange', () => {
    console.log(
      `ICE gathering state changed: ${peerConnection.iceGatheringState}`
    );
    printLog(
      `ICE gathering state changed: ${peerConnection.iceGatheringState}`
    );
  });

  peerConnection.addEventListener('connectionstatechange', () => {
    console.log(`Connection state change: ${peerConnection.connectionState}`);
    printLog(`Connection state change: ${peerConnection.connectionState}`);
    if (
      peerConnection.connectionState === 'disconnected' ||
      peerConnection.connectionState === 'closed'
    ) {
      channel.isOpen = false;
      noticeDisconnected();
    }
  });

  peerConnection.addEventListener('signalingstatechange', () => {
    console.log(`Signaling state change: ${peerConnection.signalingState}`);
    printLog(`Signaling state change: ${peerConnection.signalingState}`);
  });

  peerConnection.addEventListener('iceconnectionstatechange ', () => {
    console.log(
      `ICE connection state change: ${peerConnection.iceConnectionState}`
    );
    printLog(
      `ICE connection state change: ${peerConnection.iceConnectionState}`
    );
  });

  peerConnection.addEventListener('datachannel', (event) => {
    dataChannel = event.channel;

    console.log('data channel received!');
    printLog('data channel received!');
    dataChannel.addEventListener('open', dataChannelOpened);
    dataChannel.addEventListener('message', recieveFromPeer);
    dataChannel.addEventListener('close', dataChannelClosed);
  });
}

function collectIceCandidates(roomRef, peerConnection, localName, remoteName) {
  const candidatesCollection = roomRef.collection(localName);

  peerConnection.addEventListener('icecandidate', (event) => {
    if (!event.candidate) {
      console.log('Got final candidate!');
      return;
    }
    const json = event.candidate.toJSON();
    candidatesCollection.add(json);
    console.log('Got candidate: ', event.candidate);
  });

  roomRef.collection(remoteName).onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        const data = change.doc.data();
        await peerConnection.addIceCandidate(data);
        console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
      }
    });
  });
}
