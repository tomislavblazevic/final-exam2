
import {
  initWebRTC,
  handleOffer,
  handleAnswer,
  handleCandidate,
  startMedia,
  startCall,
  updateCallButtonStates
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
const roomName = 'observable-privatna-soba';

const drone = new ScaleDrone(SCALEDONE_CHANNEL_ID, {
  data: {
    name: getRandomName(),
    color: getRandomColor(),
  },
});

let members = [];
window.members = members;

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

    // Only auto-call the newcomer if we already have a local stream.
    // If localStream is null, startCall() would show an alert and bail — avoid that.
    if (window.localStream) {
      startCall([member]);
    }
  });

  room.on('member_leave', ({ id }) => {
    const index = members.findIndex(member => member.id === id);
    members.splice(index, 1);
    window.members = members;
    updateMembersDOM();

    // Clean up the remote video for the departed member
    const videoWrapper = document.getElementById(`remote-video-${id}`);
    if (videoWrapper) videoWrapper.remove();

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
  textEl.textContent = text;
  
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
