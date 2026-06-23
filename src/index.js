
import {
  initWebRTC,
  handleOffer,
  handleAnswer,
  handleCandidate,
  startMedia,
  startCall,
  updateCallButtonStates,
  closePeerConnection,
  broadcastFile,
  setFileTransferCallbacks,
  getActivePeerCount
} from './webrtc.js';

// Global error handler for debugging
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

// Scaledrone Channel ID
const SCALEDONE_CHANNEL_ID = 'ZXmRILOrqI9SyoJq';

// Dynamic Room Logic
if (!location.hash) {
  location.hash = Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0');
}
const roomHash = location.hash.substring(1);
const roomName = 'observable-' + roomHash;

const drone = new ScaleDrone(SCALEDONE_CHANNEL_ID, {
  data: {
    name: getRandomName(),
    color: getRandomColor(),
  },
});

let members = [];
window.members = members;

setFileTransferCallbacks({
  onStart: (memberId, fileName) => {
    console.log(`Starting file transfer: ${fileName}`);
  },
  onProgress: (memberId, progress) => {},
  onReceived: (memberId, fileName, fileType, url) => {
    const member = members.find(m => m.id === memberId);
    if (!member) return;
    addFileMessageToListDOM(fileName, fileType, url, member);
  },
  onSent: (fileName, fileType, url) => {
    const myMember = { id: drone.clientId, clientData: { name: 'You', color: '#4CAF50' } };
    addFileMessageToListDOM(fileName, fileType, url, myMember, true);
  }
});

// Connect to Scaledrone unconditionally so chat + signaling always work,
// even if the user denies camera/microphone permission.
drone.on('open', error => {
  if (error) {
    return console.error('Problem sa Scaledrone-om:', error);
  }
  console.log('Successfully connected to Scaledrone');

  const room = drone.subscribe(roomName);

  // Initialize WebRTC with drone and room
  // (signaling is handled entirely via drone.publish inside webrtc.js)
  initWebRTC(drone, room, roomName);

  // Start camera after Scaledrone is ready so both are available together.
  // Media failure is non-fatal — chat and signaling still work.
  const mediaPromise = startMedia()
    .then(stream => {
      // Expose locally so the member_join guard can check it
      window.localStream = stream;
    })
    .catch(err => console.warn('Media not available:', err));

  room.on('open', error => {
    if (error) {
      return console.error(error);
    }
    console.log('Successfully joined room');
  });

  room.on('members', m => {
    members = m;
    window.members = members;
    updateMembersDOM();
  });

  room.on('member_join', member => {
    members.push(member);
    window.members = members;
    updateMembersDOM();

    // Queue auto-call until media initialization (success or failure) completes
    mediaPromise.finally(() => {
      startCall([member], true);
    });
  });

  room.on('member_leave', ({ id }) => {
    const index = members.findIndex(member => member.id === id);
    members.splice(index, 1);
    window.members = members;
    updateMembersDOM();

    // Clean up the remote video and peer connection for the departed member
    closePeerConnection(id);

    // If no one is left in call, reset call UI
    if (members.length <= 1) {
      updateCallButtonStates(false);
    }
  });

  room.on('data', (data, member) => {
    if (member) {
      // Handle WebRTC signaling messages
      if (typeof data === 'object' && data.type) {
        console.log('WebRTC message:', data.type, 'from', member.clientData.name);
        
        const processWebRTCMessage = () => {
          switch (data.type) {
            case 'webrtc-offer':
              if (data.to === drone.clientId) {
                handleOffer(member.id, data.offer, member.clientData);
                // Mark as in-call from the answerer side
                updateCallButtonStates(true);
              }
              break;
            case 'webrtc-answer':
              if (data.to === drone.clientId) {
                handleAnswer(member.id, data.answer);
              }
              break;
            case 'webrtc-candidate':
              if (data.to === drone.clientId) {
                handleCandidate(member.id, data.candidate);
              }
              break;
            case 'webrtc-end':
              if (data.to === drone.clientId) {
                closePeerConnection(member.id);
                if (getActivePeerCount() === 0) {
                  updateCallButtonStates(false);
                }
              }
              break;
          }
        };

        if (data.type.startsWith('webrtc-')) {
          mediaPromise.then(processWebRTCMessage);
        } else {
          // Regular text message
          addMessageToListDOM(data, member);
        }
      } else {
        // Regular text message
        addMessageToListDOM(data, member);
      }
    }
  });
});

drone.on('close', event => {
  console.log('Connection was closed', event);
});

drone.on('error', error => {
  console.error(error);
});

function getRandomName() {
  const adjs = ["autumn", "hidden", "bitter", "misty", "silent", "empty", "dry", "dark", "summer", "icy", "delicate", "quiet", "white", "cool", "spring", "winter", "patient", "twilight", "dawn", "crimson", "wispy", "weathered", "blue", "billowing", "broken", "cold", "damp", "falling", "frosty", "green", "long", "late", "lingering", "bold", "little", "morning", "muddy", "old", "red", "rough", "still", "small", "sparkling", "throbbing", "shy", "wandering", "withered", "wild", "black", "young", "holy", "solitary", "fragrant", "aged", "snowy", "proud", "floral", "restless", "divine", "polished", "ancient", "purple", "lively", "nameless"];
  const nouns = ["waterfall", "river", "breeze", "moon", "rain", "wind", "sea", "morning", "snow", "lake", "sunset", "pine", "shadow", "leaf", "dawn", "glitter", "forest", "hill", "cloud", "meadow", "sun", "glade", "bird", "brook", "butterfly", "bush", "dew", "dust", "field", "fire", "flower", "firefly", "feather", "grass", "haze", "mountain", "night", "pond", "darkness", "snowflake", "silence", "sound", "sky", "shape", "surf", "thunder", "violet", "water", "wildflower", "wave", "water", "resonance", "sun", "wood", "dream", "cherry", "tree", "fog", "frost", "voice", "paper", "frog", "smoke", "star"];
  return (
    adjs[Math.floor(Math.random() * adjs.length)] +
    "_" +
    nouns[Math.floor(Math.random() * nouns.length)]
  );
}

function getRandomColor() {
  return '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0');
}

const DOM = {
  membersCount: document.querySelector('.members-count'),
  membersList: document.querySelector('.members-list'),
  messages: document.querySelector('.messages'),
  input: document.querySelector('.message-form__input'),
  form: document.querySelector('.message-form'),
};

// Add safety check for form
if (DOM.form) {
  DOM.form.addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage();
  });
} else {
  console.warn('Message form not found in DOM');
}

// Share Room Link logic
const shareBtn = document.getElementById('share-room-button');
if (shareBtn) {
  shareBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      const originalText = shareBtn.textContent;
      shareBtn.textContent = '✅ Copied!';
      setTimeout(() => shareBtn.textContent = originalText, 2000);
    }).catch(err => console.error('Failed to copy', err));
  });
}

// Emoji picker logic
const emojiBtn = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');

if (emojiBtn && emojiPicker && DOM.input) {
  emojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    emojiPicker.classList.toggle('hidden');
  });

  emojiPicker.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target.tagName === 'SPAN') {
      DOM.input.value += e.target.textContent;
      DOM.input.focus();
    }
  });

  document.addEventListener('click', () => {
    emojiPicker.classList.add('hidden');
  });
}

// File transfer logic
const fileBtn = document.getElementById('file-btn');
const mediaFileBtn = document.getElementById('media-file-btn');
const fileInput = document.getElementById('file-input');

if (fileInput) {
  if (fileBtn) fileBtn.addEventListener('click', () => fileInput.click());
  if (mediaFileBtn) mediaFileBtn.addEventListener('click', () => fileInput.click());
  
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      broadcastFile(file);
      fileInput.value = '';
    }
  });
}

function sendMessage() {
  if (!DOM.input || !DOM.form) {
    console.warn('Form elements not available');
    return;
  }
  
  const value = DOM.input.value.trim();
  if (value === '') {
    return;
  }
  DOM.input.value = '';
  
  if (typeof drone === 'undefined' || !drone.publish) {
    console.warn('Drone not connected yet');
    return;
  }
  
  drone.publish({
    room: roomName,
    message: value,
  });
}

export function updateMembersDOM() {
  if (!DOM.membersCount || !DOM.membersList) {
    console.warn('Members DOM elements not found');
    return;
  }
  
  DOM.membersCount.innerText = `${members.length}`;
  DOM.membersList.innerHTML = '';
  members.forEach(member => {
    try {
      DOM.membersList.appendChild(createMemberElement(member));
    } catch (e) {
      console.error('Error creating member element:', e);
    }
  });
}

function createMemberElement(member) {
  const { name, color } = member.clientData;
  const el = document.createElement('div');
  el.appendChild(document.createTextNode(name));
  el.className = 'member';
  el.style.color = color;
  el.style.borderColor = color;
  return el;
}

function createMessageElement(text, member) {
  const container = document.createElement('div');
  
  const nameEl = document.createElement('div');
  const { name, color } = member.clientData;
  nameEl.textContent = name;
  nameEl.style.color = color;
  nameEl.style.fontSize = '0.8rem';
  nameEl.style.fontWeight = 'bold';
  nameEl.style.marginBottom = '2px';
  
  const textEl = document.createElement('div');
  
  // Check if text is an image/GIF URL
  const isImageRegex = /\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i;
  const isUrlRegex = /^https?:\/\//i;
  
  const trimmedText = text.trim();
  if (isUrlRegex.test(trimmedText) && isImageRegex.test(trimmedText)) {
    const imgEl = document.createElement('img');
    imgEl.src = trimmedText;
    imgEl.style.maxWidth = '100%';
    imgEl.style.maxHeight = '200px';
    imgEl.style.borderRadius = '6px';
    imgEl.style.marginTop = '4px';
    textEl.appendChild(imgEl);
  } else {
    textEl.textContent = text;
  }
  
  container.appendChild(nameEl);
  container.appendChild(textEl);
  
  if (drone.clientId === member.id) {
    container.className = 'message right';
  } else {
    container.className = 'message left';
  }
  
  return container;
}

function addMessageToListDOM(text, member) {
  if (!DOM.messages) {
    console.warn('Messages DOM element not found');
    return;
  }
  
  try {
    const el = DOM.messages;
    const wasAtBottom = el.scrollTop >= el.scrollHeight - el.clientHeight - 20;
    el.appendChild(createMessageElement(text, member));
    if (wasAtBottom) {
      setTimeout(() => {
        el.scrollTop = el.scrollHeight;
      }, 0);
    }
  } catch (e) {
    console.error('Error adding message to DOM:', e);
  }
}

function createFileMessageElement(fileName, fileType, url, member, isLocal = false) {
  const container = document.createElement('div');
  
  const nameEl = document.createElement('div');
  const { name, color } = member.clientData || { name: 'You', color: '#4CAF50' };
  nameEl.textContent = name;
  nameEl.style.color = color;
  nameEl.style.fontSize = '0.8rem';
  nameEl.style.fontWeight = 'bold';
  nameEl.style.marginBottom = '2px';
  
  const contentEl = document.createElement('div');
  contentEl.style.marginTop = '5px';
  
  if (fileType.startsWith('image/')) {
    const imgEl = document.createElement('img');
    imgEl.src = url;
    imgEl.alt = fileName;
    imgEl.style.maxWidth = '100%';
    imgEl.style.maxHeight = '200px';
    imgEl.style.borderRadius = '6px';
    imgEl.style.display = 'block';
    
    const linkEl = document.createElement('a');
    linkEl.href = url;
    linkEl.download = fileName;
    linkEl.textContent = isLocal ? `✅ Sent ${fileName}` : `⬇️ Download ${fileName}`;
    linkEl.style.color = isLocal ? '#4CAF50' : '#2196F3';
    linkEl.style.textDecoration = isLocal ? 'none' : 'underline';
    linkEl.style.fontSize = '0.8rem';
    linkEl.style.display = 'block';
    linkEl.style.marginTop = '4px';
    
    contentEl.appendChild(imgEl);
    contentEl.appendChild(linkEl);
  } else {
    const box = document.createElement('div');
    box.style.background = 'var(--input-bg)';
    box.style.padding = '10px';
    box.style.borderRadius = '6px';
    box.style.display = 'inline-block';
    
    const iconLabel = document.createElement('div');
    iconLabel.textContent = `📄 ${fileName}`;
    iconLabel.style.fontWeight = 'bold';
    iconLabel.style.marginBottom = '5px';
    
    const linkEl = document.createElement('a');
    linkEl.href = url;
    linkEl.download = fileName;
    linkEl.textContent = isLocal ? '✅ Sent' : '⬇️ Download';
    linkEl.style.color = isLocal ? '#4CAF50' : '#2196F3';
    linkEl.style.textDecoration = isLocal ? 'none' : 'underline';
    linkEl.style.fontSize = '0.8rem';
    
    box.appendChild(iconLabel);
    box.appendChild(linkEl);
    contentEl.appendChild(box);
  }
  
  container.appendChild(nameEl);
  container.appendChild(contentEl);
  
  if (isLocal || (typeof drone !== 'undefined' && drone.clientId === member.id)) {
    container.className = 'message right';
  } else {
    container.className = 'message left';
  }
  
  return container;
}

function addFileMessageToListDOM(fileName, fileType, url, member, isLocal = false) {
  if (!DOM.messages) return;
  try {
    const el = DOM.messages;
    const wasAtBottom = el.scrollTop >= el.scrollHeight - el.clientHeight - 20;
    el.appendChild(createFileMessageElement(fileName, fileType, url, member, isLocal));
    if (wasAtBottom) {
      setTimeout(() => el.scrollTop = el.scrollHeight, 0);
    }
  } catch (e) {
    console.error('Error adding file message:', e);
  }
}

