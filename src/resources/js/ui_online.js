import {
  createRoom,
  joinRoom,
  sendMessageToPeer,
  closeAndCleaning
} from './data_channel.js';

const createBtn = document.getElementById('create-btn');
const joinBtn = document.getElementById('join-btn');
const joinRoomID = document.getElementById('join-room-id');
const sendBtn = document.getElementById('send-btn');
const chatInputWithButton = document.getElementById('chat-input-with-button');
const chatOpenBtn = document.getElementById('chat-open-btn');
const messageBox = document.getElementById('message-box');

export function setUpUI() {
  createBtn.addEventListener('click', () => {
    // @ts-ignore
    createBtn.disabled = true;
    // @ts-ignore
    joinBtn.disabled = true;
    // @ts-ignore
    joinRoomID.disabled = true;
    createRoom();
  });

  joinBtn.addEventListener('click', () => {
    // @ts-ignore
    createBtn.disabled = true;
    // @ts-ignore
    joinBtn.disabled = true;
    // @ts-ignore
    joinRoomID.disabled = true;
    joinRoom();
  });
  chatOpenBtn.addEventListener('click', chatOpenBtnClicked);
  sendBtn.addEventListener('click', sendBtnClicked);
  window.addEventListener('keydown', event => {
    if (event.shiftKey && event.key === 'Enter') {
      chatOpenBtn.click();
      event.preventDefault();
    } else if (event.key === 'Enter' && messageBox === document.activeElement) {
      sendBtn.click();
      event.preventDefault();
    }
  });
  window.addEventListener('unload', closeAndCleaning);

  disableMessageBtns();
}

export function enableMessageBtns() {
  // @ts-ignore
  messageBox.disabled = false;
  // @ts-ignore
  chatOpenBtn.disabled = false;
  // @ts-ignore
  sendBtn.disabled = false;
}

function disableMessageBtns() {
  // @ts-ignore
  messageBox.disabled = true;
  // @ts-ignore
  chatOpenBtn.disabled = true;
  // @ts-ignore
  sendBtn.disabled = true;
}

function chatOpenBtnClicked() {
  if (!chatOpenBtn.classList.contains('hidden')) {
    chatOpenBtn.classList.add('hidden');
  }
  chatInputWithButton.classList.remove('hidden');
  messageBox.focus({ preventScroll: true });
}

function sendBtnClicked() {
  // @ts-ignore
  disableMessageBtns();
  chatOpenBtn.classList.remove('hidden');
  if (!chatInputWithButton.classList.contains('hidden')) {
    chatInputWithButton.classList.add('hidden');
  }
  // @ts-ignore
  const message = messageBox.value;
  if (message === '') {
    // @ts-ignore
    enableMessageBtns();
    return;
  }
  // @ts-ignore
  messageBox.value = '';
  sendMessageToPeer(message);
}