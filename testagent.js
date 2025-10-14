// ============================
// Desktop Control Agent
// ============================
// Run this file on the computer that is being controlled.
// It connects via WebSocket and performs mouse/keyboard actions.
// ============================

console.log("🖥️ Starting Desktop Agent for Remote Control...");

const WebSocket = require("ws");
const robot = require("robotjs");

// Create WebSocket server on port 3001
const wss = new WebSocket.Server({ port: 3001 });

// Get screen size once
const screenSize = robot.getScreenSize();
const width = screenSize.width;
const height = screenSize.height;

console.log(`✅ Screen size detected: ${width}x${height}`);
console.log("✅ Agent running on ws://localhost:3001");

// When a new connection is established
wss.on("connection", (ws) => {
    console.log("🌐 Browser connected to desktop agent.");

    ws.on("message", (data) => {
        try {
            const event = JSON.parse(data);

            if (!event.type) return;

            const x = Math.round(event.x * width);
            const y = Math.round(event.y * height);

            switch (event.type) {
                case "mousemove":
                    robot.moveMouse(x, y);
                    break;

                case "mousedown":
                    const downButton =
                        event.button === 2 ? "right" :
                        event.button === 1 ? "middle" : "left";
                    robot.moveMouse(x, y);
                    robot.mouseToggle("down", downButton);
                    break;

                case "mouseup":
                    const upButton =
                        event.button === 2 ? "right" :
                        event.button === 1 ? "middle" : "left";
                    robot.moveMouse(x, y);
                    robot.mouseToggle("up", upButton);
                    break;

                case "wheel":
                    robot.scrollMouse(event.deltaX || 0, event.deltaY || 0);
                    break;

                case "keydown":
                    try {
                        if (event.key && event.key.length === 1)
                            robot.keyToggle(event.key.toLowerCase(), "down");
                    } catch (err) {
                        console.warn("⚠️ Keydown error:", err.message);
                    }
                    break;

                case "keyup":
                    try {
                        if (event.key && event.key.length === 1)
                            robot.keyToggle(event.key.toLowerCase(), "up");
                    } catch (err) {
                        console.warn("⚠️ Keyup error:", err.message);
                    }
                    break;

                default:
                    console.log("⚠️ Unknown event type:", event.type);
            }
        } catch (err) {
            console.error("❌ Failed to process message:", err.message);
        }
    });

    ws.on("close", () => {
        console.log("🔌 Browser disconnected.");
    });

    ws.on("error", (err) => {
        console.error("❌ WebSocket error:", err.message);
    });
});
