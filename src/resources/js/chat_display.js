/**
 * Manages displaying of chat messages.
 *
 * The chat messages between peers appears somewhat random positions on the game screen.
 * The positions are random but one message should appears on the same (random) position for both peers.
 * It is achieved by setting the same RNG (random number generator) for each player's chat box.
 */
import { channel } from './data_channel.js';

let player1ChatRng = null;
let player2ChatRng = null;

const canvasContainer = document.getElementById('game-canvas-container');
let player1ChatBox = document.getElementById('player1-chat-box');
let player2ChatBox = document.getElementById('player2-chat-box');

export function setChatRngs(rngForPlayer1Chat, rngForPlayer2Chat) {
  player1ChatRng = rngForPlayer1Chat;
  player2ChatRng = rngForPlayer2Chat;
}

export function displayMyChatMessage(message) {
  if (channel.amIPlayer2 === null) {
    if (channel.amICreatedRoom) {
      displayChatMessageAt(message, 1);
    } else {
      displayChatMessageAt(message, 2);
    }
  } else if (channel.amIPlayer2 === false) {
    displayChatMessageAt(message, 1);
  } else if (channel.amIPlayer2 === true) {
    displayChatMessageAt(message, 2);
  }
}

export function displayPeerChatMessage(message) {
  if (channel.amIPlayer2 === null) {
    if (channel.amICreatedRoom) {
      displayChatMessageAt(message, 2);
    } else {
      displayChatMessageAt(message, 1);
    }
  } else if (channel.amIPlayer2 === false) {
    displayChatMessageAt(message, 2);
  } else if (channel.amIPlayer2 === true) {
    displayChatMessageAt(message, 1);
  }
}

function displayChatMessageAt(message, whichPlayerSide) {
  if (whichPlayerSide === 1) {
    const newChatBox = player1ChatBox.cloneNode();
    newChatBox.textContent = message;
    // @ts-ignore
    newChatBox.style.top = `${20 + 30 * player1ChatRng()}%`;
    // @ts-ignore
    newChatBox.style.right = `${55 + 25 * player1ChatRng()}%`;
    canvasContainer.replaceChild(newChatBox, player1ChatBox);
    // @ts-ignore
    player1ChatBox = newChatBox;
  } else if (whichPlayerSide === 2) {
    const newChatBox = player2ChatBox.cloneNode();
    newChatBox.textContent = message;
    // @ts-ignore
    newChatBox.style.top = `${20 + 30 * player2ChatRng()}%`;
    // @ts-ignore
    newChatBox.style.left = `${55 + 25 * player2ChatRng()}%`;
    canvasContainer.replaceChild(newChatBox, player2ChatBox);
    // @ts-ignore
    player2ChatBox = newChatBox;
  }
}
