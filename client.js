document.addEventListener('DOMContentLoaded', () => {
    const screenVideo = document.getElementById('screen-video');
    const placeholder = document.getElementById('placeholder');
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const usersList = document.getElementById('users-list');
    const roomIdInput = document.getElementById('room-id-input');
    const yourNameInput = document.getElementById('your-name-input');
    const joinBtn = document.getElementById('join-btn');
    const shareScreenBtn = document.getElementById('share-screen-btn');
    const stopShareBtn = document.getElementById('stop-share-btn');
    const requestControlBtn = document.getElementById('request-control-btn');
    const revokeControlBtn = document.getElementById('revoke-control-btn');
    const controlRequestModal = document.getElementById('control-request-modal');
    const requestMessage = document.getElementById('request-message');
    const acceptControlBtn = document.getElementById('accept-control-btn');
    const denyControlBtn = document.getElementById('deny-control-btn');
    const controlOverlay = document.getElementById('control-overlay');
    const roomStatus = document.getElementById('room-status');
    const connectionStatus = document.getElementById('connection-status');
    const shareRequestModal = document.getElementById('share-request-modal');
    const shareRequestMessage = document.getElementById('share-request-message');
    const acceptShareBtn = document.getElementById('accept-share-btn');
    const denyShareBtn = document.getElementById('deny-share-btn');

    let localStream;
    let peerConnections = {};
    let ws;
    let localId;
    let currentRoom;
    let localName;
    let streamerId = null;
    let controllerId = null;
    let pendingControlRequestFrom = null;
    let pendingShareRequestFrom = null;
    let agentWs = null; // WebSocket for the local desktop agent

    const wsUrl = `ws://${window.location.host}`;
    const agentWsUrl = 'ws://localhost:3001';

    // ------------------- Join Room -------------------
    joinBtn.addEventListener('click', () => {
        const roomId = roomIdInput.value.trim();
        const name = yourNameInput.value.trim();
        if (roomId && name) {
            currentRoom = roomId;
            localName = name;
            joinRoom(roomId, name);
            roomIdInput.disabled = true;
            yourNameInput.disabled = true;
            joinBtn.disabled = true;
            joinBtn.textContent = 'Joined';
            shareScreenBtn.disabled = false;
            roomStatus.textContent = `Room: ${roomId}`;
            roomStatus.classList.remove('bg-purple-600');
            roomStatus.classList.add('bg-green-600');
        } else {
            alert('Please enter a Room ID and your name.');
        }
    });

    // ------------------- WebRTC & Signaling -------------------
    function joinRoom(roomId, name) {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('Connected to signaling server');
            connectionStatus.textContent = 'Connected';
            connectionStatus.classList.add('text-green-400');
            ws.send(JSON.stringify({ type: 'join', roomId, name }));
        };

        ws.onmessage = async (message) => {
            const data = JSON.parse(message.data);
            console.log('Received message:', data);

            switch (data.type) {
                case 'welcome':
                    localId = data.id;
                    for (const user of data.users) {
                        createPeerConnection(user.id, true);
                    }
                    break;
                case 'user-joined':
                    createPeerConnection(data.newUser.id, false);
                    break;
                case 'user-left':
                    if (peerConnections[data.id]) {
                        peerConnections[data.id].close();
                        delete peerConnections[data.id];
                    }
                    if (data.id === streamerId) {
                        resetVideo();
                        streamerId = null;
                    }
                    if(data.id === controllerId){
                        handleRevokeControl();
                    }
                    break;
                case 'user-list-update':
                    updateUsersList(data.users);
                    break;
                case 'offer':
                    await handleOffer(data.from, data.offer);
                    break;
                case 'answer':
                    await handleAnswer(data.from, data.answer);
                    break;
                case 'candidate':
                    await handleCandidate(data.from, data.candidate);
                    break;
                case 'stream-started':
                    placeholder.classList.add('hidden');
                    screenVideo.srcObject = new MediaStream();
                    streamerId = data.from;
                    screenVideo.dataset.streamerId = data.from;
                    fullscreenBtn.classList.remove('hidden');
                    if(localId !== streamerId) requestControlBtn.classList.remove('hidden');
                    break;
                case 'stream-ended':
                    resetVideo();
                    streamerId = null;
                    handleRevokeControl();
                    break;
                case 'request-control':
                    handleControlRequest(data.from, data.name);
                    break;
                case 'grant-control':
                    handleGrantControl(data.from);
                    break;
                case 'deny-control':
                    alert(`${data.name} denied your request for control.`);
                    break;
                case 'revoke-control':
                    handleRevokeControl();
                    alert('Screen control has been revoked.');
                    break;
                case 'control-event':
                    if (localId === streamerId && agentWs && agentWs.readyState === WebSocket.OPEN) {
                        agentWs.send(JSON.stringify(data.event));
                    }
                    break;
                case 'request-screen-share':
                    handleShareRequest(data.from, data.name);
                    break;
                case 'deny-screen-share':
                    alert(`${data.name} denied your request to share screen.`);
                    break;
            }
        };

        ws.onclose = () => {
            console.log('Disconnected from signaling server');
            connectionStatus.textContent = 'Not connected';
            connectionStatus.classList.remove('text-green-400');
            shareScreenBtn.disabled = true;
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    function createPeerConnection(targetId, isOfferor) {
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        peerConnections[targetId] = pc;

        if (localStream) {
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        }

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                ws.send(JSON.stringify({ type: 'candidate', to: targetId, candidate: event.candidate }));
            }
        };

        pc.ontrack = (event) => {
            placeholder.classList.add('hidden');
            screenVideo.srcObject = event.streams[0];
            streamerId = targetId;
            screenVideo.dataset.streamerId = targetId;
            fullscreenBtn.classList.remove('hidden');
            if(localId !== streamerId) requestControlBtn.classList.remove('hidden');
        };

        if (isOfferor) {
            pc.createOffer()
                .then(offer => pc.setLocalDescription(offer))
                .then(() => ws.send(JSON.stringify({ type: 'offer', to: targetId, offer: pc.localDescription })))
                .catch(console.error);
        }
    }

    async function handleOffer(fromId, offer) {
        if (!peerConnections[fromId]) createPeerConnection(fromId, false);
        const pc = peerConnections[fromId];
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: 'answer', to: fromId, answer: pc.localDescription }));
    }

    async function handleAnswer(fromId, answer) {
        const pc = peerConnections[fromId];
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }

    async function handleCandidate(fromId, candidate) {
        try {
            const pc = peerConnections[fromId];
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) { console.error('Error adding ice candidate', e); }
    }

    // ------------------- Users List -------------------
    function updateUsersList(users) {
        usersList.innerHTML = '';
        if (users.length <= 1) {
            usersList.innerHTML = '<p class="text-gray-400">No other users connected</p>';
            return;
        }
        users.forEach(user => {
            const userContainer = document.createElement('div');
            userContainer.className = 'flex justify-between items-center py-2 text-sm';
            const nameSpan = document.createElement('span');
            nameSpan.textContent = `${user.name} ${user.id === localId ? '(You)' : ''}`;
            if(user.id === streamerId) nameSpan.textContent += ' (Sharing)';
            if(user.id === controllerId) nameSpan.textContent += ' (Controlling)';
            userContainer.appendChild(nameSpan);

            if (user.id !== localId && !streamerId) {
                const requestBtn = document.createElement('button');
                requestBtn.textContent = 'Request Share';
                requestBtn.className = 'text-xs bg-blue-500 hover:bg-blue-600 px-2 py-1 rounded';
                requestBtn.onclick = () => {
                    ws.send(JSON.stringify({ type: 'request-screen-share', to: user.id, name: localName }));
                    alert(`Request to share screen sent to ${user.name}.`);
                };
                userContainer.appendChild(requestBtn);
            }
            usersList.appendChild(userContainer);
        });
    }

    // ------------------- Screen Sharing -------------------
    shareScreenBtn.addEventListener('click', async () => {
        try {
            localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            localStream.getTracks().forEach(track => {
                for (const peerId in peerConnections) peerConnections[peerId].addTrack(track, localStream);
            });
            for (const peerId in peerConnections) {
                const pc = peerConnections[peerId];
                pc.createOffer().then(offer => pc.setLocalDescription(offer))
                  .then(() => ws.send(JSON.stringify({ type: 'offer', to: peerId, offer: pc.localDescription })));
            }
            placeholder.classList.add('hidden');
            screenVideo.srcObject = localStream;
            streamerId = localId;
            screenVideo.dataset.streamerId = localId;
            fullscreenBtn.classList.remove('hidden');
            shareScreenBtn.classList.add('hidden');
            stopShareBtn.classList.remove('hidden');
            revokeControlBtn.classList.remove('hidden');
            ws.send(JSON.stringify({type: 'stream-started'}));
            localStream.getVideoTracks()[0].onended = stopSharing;
        } catch (error) { console.error('Error sharing screen:', error); }
    });

    stopShareBtn.addEventListener('click', stopSharing);

    function stopSharing() {
        if(localStream) localStream.getTracks().forEach(track => track.stop());
        localStream = null;
        for (const peerId in peerConnections) {
            const pc = peerConnections[peerId];
            const senders = pc.getSenders();
            senders.forEach(sender => { if(sender.track) pc.removeTrack(sender); });
            pc.createOffer().then(offer => pc.setLocalDescription(offer))
              .then(() => ws.send(JSON.stringify({ type: 'offer', to: peerId, offer: pc.localDescription })));
        }
        resetVideo();
        shareScreenBtn.classList.remove('hidden');
        stopShareBtn.classList.add('hidden');
        revokeControlBtn.classList.add('hidden');
        ws.send(JSON.stringify({type: 'stream-ended'}));
        streamerId = null;
        handleRevokeControl();
    }

    function resetVideo() {
        screenVideo.srcObject = null;
        placeholder.classList.remove('hidden');
        fullscreenBtn.classList.add('hidden');
        requestControlBtn.classList.add('hidden');
        delete screenVideo.dataset.streamerId;
    }

    fullscreenBtn.addEventListener('click', () => {
        if (screenVideo.requestFullscreen) screenVideo.requestFullscreen();
        else if (screenVideo.webkitRequestFullscreen) screenVideo.webkitRequestFullscreen();
        else if (screenVideo.msRequestFullscreen) screenVideo.msRequestFullscreen();
    });

    // ------------------- Remote Control -------------------
    requestControlBtn.addEventListener('click', () => {
        if(streamerId) {
            ws.send(JSON.stringify({ type: 'request-control', to: streamerId, name: localName }));
            alert('Control request sent.');
        }
    });

    revokeControlBtn.addEventListener('click', () => {
        if(controllerId){
            ws.send(JSON.stringify({ type: 'revoke-control', to: controllerId }));
            handleRevokeControl();
        }
    });

    function handleControlRequest(fromId, name) {
        if (localId === streamerId) {
            pendingControlRequestFrom = fromId;
            requestMessage.textContent = `${name} would like to control your screen.`;
            controlRequestModal.classList.remove('hidden');
        }
    }

    acceptControlBtn.addEventListener('click', () => {
        if(pendingControlRequestFrom) {
            ws.send(JSON.stringify({ type: 'grant-control', to: pendingControlRequestFrom, from: localId, name: localName }));
            controllerId = pendingControlRequestFrom;
            connectToAgent();
        }
        controlRequestModal.classList.add('hidden');
        pendingControlRequestFrom = null;
    });

    denyControlBtn.addEventListener('click', () => {
        if(pendingControlRequestFrom) ws.send(JSON.stringify({ type: 'deny-control', to: pendingControlRequestFrom, name: localName }));
        controlRequestModal.classList.add('hidden');
        pendingControlRequestFrom = null;
    });

    function handleGrantControl(sharerId) {
        controllerId = localId;
        streamerId = sharerId;
        requestControlBtn.classList.add('hidden');
        addControlListeners();
    }

    function handleRevokeControl(){
        if(localId === controllerId) removeControlListeners();
        if(localId === streamerId && agentWs) { agentWs.close(); agentWs = null; }
        controllerId = null;
        if(localId !== streamerId && streamerId !== null) requestControlBtn.classList.remove('hidden');
    }

    function connectToAgent() {
        if(localId !== streamerId || agentWs) return;
        agentWs = new WebSocket(agentWsUrl);

        agentWs.onopen = () => alert('Desktop agent connected. Remote control is active.');
        agentWs.onclose = () => { agentWs = null; if(controllerId){ alert('Desktop agent disconnected.'); ws.send(JSON.stringify({ type: 'revoke-control', to: controllerId })); handleRevokeControl(); } };
        agentWs.onerror = () => { alert('Could not connect to the desktop agent.'); ws.send(JSON.stringify({ type: 'revoke-control', to: controllerId })); handleRevokeControl(); };
    }

    const sendControlEvent = (event) => {
        if(localId !== controllerId || !streamerId) return;
        const rect = screenVideo.getBoundingClientRect();
        const x = (event.clientX - rect.left)/rect.width;
        const y = (event.clientY - rect.top)/rect.height;
        ws.send(JSON.stringify({ type:'control-event', to: streamerId, event:{ type:event.type, x, y, button:event.button, key:event.key, keyCode:event.keyCode, deltaX:event.deltaX, deltaY:event.deltaY } }));
    };

    const preventDefaults = (e) => e.preventDefault();

    function addControlListeners() {
        controlOverlay.classList.remove('hidden');
        controlOverlay.addEventListener('mousemove', sendControlEvent);
        controlOverlay.addEventListener('mousedown', sendControlEvent);
        controlOverlay.addEventListener('mouseup', sendControlEvent);
        controlOverlay.addEventListener('wheel', sendControlEvent);
        window.addEventListener('keydown', sendControlEvent);
        window.addEventListener('keyup', sendControlEvent);
        controlOverlay.addEventListener('contextmenu', preventDefaults);
    }

    function removeControlListeners() {
        controlOverlay.classList.add('hidden');
        controlOverlay.removeEventListener('mousemove', sendControlEvent);
        controlOverlay.removeEventListener('mousedown', sendControlEvent);
        controlOverlay.removeEventListener('mouseup', sendControlEvent);
        controlOverlay.removeEventListener('wheel', sendControlEvent);
        window.removeEventListener('keydown', sendControlEvent);
        window.removeEventListener('keyup', sendControlEvent);
        controlOverlay.removeEventListener('contextmenu', preventDefaults);
    }

    // ------------------- Screen Share Requests -------------------
    function handleShareRequest(fromId, name) {
        pendingShareRequestFrom = fromId;
        shareRequestMessage.textContent = `${name} is requesting you to share your screen.`;
        shareRequestModal.classList.remove('hidden');
    }

    acceptShareBtn.addEventListener('click', () => {
        if(pendingShareRequestFrom) shareScreenBtn.click();
        shareRequestModal.classList.add('hidden');
        pendingShareRequestFrom = null;
    });

    denyShareBtn.addEventListener('click', () => {
        if(pendingShareRequestFrom) ws.send(JSON.stringify({ type: 'deny-screen-share', to: pendingShareRequestFrom, name: localName }));
        shareRequestModal.classList.add('hidden');
        pendingShareRequestFrom = null;
    });
});
