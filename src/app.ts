import express from "express";
import {Server} from "http";
import * as sio from "socket.io";
import redis from "redis";

import {OpenID} from "./openid";
import {TokenManager} from "./TokenManager";

// Create Express server
const app = express();
const http = new Server(app);
const io = new sio.Server(http);
const redisClient = redis.createClient(process.env.REDIS_URL ? process.env.REDIS_URL : undefined);
const oid = new OpenID();
const tokenManager = new TokenManager(redisClient);

let MESSAGING_ENABLED = true;

redisClient.on("error", (error) => {
    if (error.code == "ECONNREFUSED"){
        console.warn("WARNING: Could not connect to redis instance. Make sure it has been started.");
        console.log("No redis instance. Disabling messaging functionality");
        redisClient.quit(() => {});
        MESSAGING_ENABLED = false;
        return;
    }
    console.log(error);
})

app.get("/", (req, res) => {
    res.send("Hello");
});

app.get("/env", (req, res) => {
    res.status(200).json({
        envs: [{
            name: "Sandpit",
            url: "https://auth.sandpit.signin.nhs.uk",
            client_id: "du-nhs-login"
        }] 
    })
});

app.get("/chat/:id", (req, res) => {
    // Get all messages in a given chat
});

app.get("/chats", (req, res) => {
    // Get list of user's chats
});

io.on("connection", (socket: sio.Socket) => {
    // New user connected
    socket.on("message:text", (data) => {
        const {chatid, text} = data;
        // New text message
    })
})

app.get("/code", (req, res) => {
    if (!req.query.code){
        res.redirect("com.dunhslogin://oauth?code=undefined")
        return;
    }
    res.redirect("com.dunhslogin://oauth?code="+req.query.code);
});

app.get("/fido/regRequest", async (req, res) => {
    const appToken = req.headers.authorization.replace("Bearer ", "");
    if (!appToken){
        res.status(400).json({
            error: "access_denied"
        });
        return;
    }
    const nhsNumber = await tokenManager.verifyToken(appToken);
    if (!nhsNumber || nhsNumber == ""){
        res.status(403).json({
            error: "invalid_token"
        });
        return;
    }
    console.log("fido regrequest " + nhsNumber);
    const nhsAccessToken = await tokenManager.getNhsAccessToken(nhsNumber);

    const response = await oid.fidoUafRegister(nhsAccessToken);
    if (response.error){
        res.status(500).json(response);
    }
    else{
        res.status(200).json(response);
    }
})

app.post("/token", async (req, res) => {
    //@ts-ignore
    const {idToken, nhsAccessToken, idTokenPayload} = await oid.requestAccessToken(req.query.code);
    let messagingDisabledReason = "";
    let accessToken = "";
    if (!idTokenPayload.nhs_number){
        messagingDisabledReason = "Profile scope not selected."
    }
    else {
        tokenManager.storeNhsAccessToken(nhsAccessToken, idTokenPayload.nhs_number);
        accessToken = tokenManager.generateToken(idTokenPayload.nhs_number);
    }
    res.json({
        id_token: idToken,
        messaging_enabled: MESSAGING_ENABLED,
        messaging_disabled_reason: messagingDisabledReason,
        access_token: accessToken,
        nhs_access_token: nhsAccessToken
    });
})

if (process.env.JEST_WORKER_ID === undefined) {
    const PORT = process.env.PORT || 3000;
    http.listen(PORT, () => {
        console.log("App listening on port " + PORT);
    });
}

export default app;
