// This file is NOT part of the web server.
// It must be run locally by the person SHARING their screen.
// It connects the browser to the desktop for remote control.

console.log("Starting Desktop Agent for Remote Control...");

const WebSocket = require('ws');
const robot = require('robotjs');

const wss = new WebSocket.Server({ port: 3001 });

// Get screen size
const { width, height } = robot.getScreenSize();
console.log(`Screen size: ${width}x${height}`);


wss.on('connection', ws => {
    console.log('Browser connected to desktop agent.');

    ws.on('message', message => {
        try {
            const event = JSON.parse(message);
            const x = event.x * width;
            const y = event.y * height;

            switch (event.type) {
                case 'mousemove':
                    robot.moveMouse(x, y);
                    break;
                case 'mousedown':
                    robot.moveMouse(x, y);
                    const mouseButton = event.button === 2 ? 'right' : (event.button === 1 ? 'middle' : 'left');
                    robot.mouseToggle('down', mouseButton);
                    break;
                case 'mouseup':
                    robot.moveMouse(x, y);
                     const mouseUpButton = event.button === 2 ? 'right' : (event.button === 1 ? 'middle' : 'left');
                    robot.mouseToggle('up', mouseUpButton);
                    break;
                case 'wheel':
                    robot.scrollMouse(event.deltaX, event.deltaY);
                    break;
                case 'keydown':
                    try {
                        // robotjs handles modifiers separately, so we just pass the key
                        robot.keyToggle(event.key.toLowerCase(), 'down');
                    } catch (e) {
                        console.warn(`Could not process keydown for: ${event.key}`, e);
                    }
                    break;
                case 'keyup':
                     try {
                        robot.keyToggle(event.key.toLowerCase(), 'up');
                    } catch (e) {
                         console.warn(`Could not process keyup for: ${event.key}`, e);
                    }
                    break;
            }
        } catch (e) {
            console.error("Failed to process control event:", e);
        }
    });

    ws.on('close', () => {
        console.log('Browser disconnected from desktop agent.');
    });

    ws.on('error', (error) => {
        console.error('Agent WebSocket error:', error);
    });
});

console.log('Desktop agent listening on ws://localhost:3001');
console.log('The user who is SHARING their screen must run this script.');
