# Ravatar API Demo

A complete, working React + Vite + TypeScript demo application that integrates with the Ravatar API for real-time avatar interactions via WebSocket.

## 🚀 Features

- **JWT Authentication**: Secure authentication flow with automatic token management
- **Connection Management**: Load avatar, languages, and session data from Ravatar API
- **Real-time WebSocket Communication**: Chat with avatars via WebSocket text messages
- **User ID Persistence**: Stable UUID generation and localStorage persistence
- **Error Handling**: Automatic retry logic for 503/504 errors, proper handling of 402/403 status codes
- **Debug Logging**: Configurable debug logs for troubleshooting
- **Clean UI**: Minimal, functional interface without heavy UI libraries
- **Type-Safe**: Strict TypeScript types for all API and WebSocket messages

## 📋 Prerequisites

- **Node.js**: Version 20.x or later
- **Yarn**: Version 1.22.x or later

## 🛠️ Installation

1. **Clone the repository**:

```bash
git clone https://github.com/RAVATAR-AI/rvtr-api-demo.git
cd rvtr-api-demo
```

2. **Install dependencies** (using Yarn only):

```bash
yarn install
```

3. **Configure environment variables**:

```bash
.env
```

Edit `.env` and configure your Ravatar API settings:

```env
VITE_RAVATAR_API_URL=https://chat.rvtr.ai
VITE_RAVATAR_WS_URL=wss://chat.rvtr.ai/ws/chat
VITE_DEBUG_LOGS=true
```

## 🎯 Usage

### Development Mode

Start the development server:

```bash
yarn dev
```

The application will be available at `http://localhost:5173`

### Production Build

Build for production:

```bash
yarn build
```

Preview the production build:

```bash
yarn preview
```

### Linting

Run ESLint:

```bash
yarn lint
```

## 📖 Step-by-Step Guide

Follow these steps to use the Ravatar API Demo:

### Step 1: Configure API

1. Open the application in your browser
2. Go to the **Settings** tab (⚙️)
3. Enter your User ID and Project ID

### Step 2: Get JWT Token

1. Click the **"Get JWT"** button
2. Wait for the JWT token to be retrieved
3. Status will show ✅ success when complete

### Step 3: Load Connection Data

1. Click the **"Load Connection"** button
2. This retrieves:
   - Available avatars (`avatars_info`)
   - Supported languages (`languages`)
   - Session ID (if required by API)
3. Status will show ✅ success when complete

### Step 4: Use loaded connection data (Avatar & Language)

1. Choose an avatar from the dropdown menu
2. Choose a language from the dropdown menu
3. Both selections are automatically saved

### Step 5: Connect WebSocket

1. Switch to the **Chat** tab (💬)
2. Click the **"Connect WS"** button
3. Wait for WebSocket connection to establish
4. Status will show 🟢 connected when ready

### Step 6: Start Chatting

1. Type your message in the input field
2. Press **Enter** or click **"Send"**
3. View assistant responses in the message list
4. If a response includes a `fileUrl`, you'll see an "Open/Play" link

### Step 7: Live Mode (3D Avatar + Voice Interaction)

Live Mode allows you to interact with a real-time **3D avatar** using **voice** via Pixel Streaming.

#### How it works

1. Make sure:
   - JWT token is received
   - Connection data is loaded
   - WebSocket is connected (🟢)

2. Click the **"Start Live"** button in the Chat panel.

3. The application calls:

   ```http
   POST /startLiveSession
   ```

   Response example:

   ```json
   {
     "LicenseId": "string",
     "streamingUrl": "https://..."
   }
   ```

4. The returned `streamingUrl` is rendered inside an `iframe`.

   - This opens a Pixel Streaming session with a **3D avatar**
   - The avatar responds to **real-time voice input**
   - ⚠️ The `iframe` URL must include the JWT token obtained in **Step 2**

   Example:

   ```ts
   const sep = streamingUrl.includes("?") ? "&" : "?";
   const iframeUrl = `${streamingUrl}${sep}token=${encodeURIComponent(jwtToken)}`;
   ```

   This token is required for authentication inside the Pixel Streaming session.

5. You can now interact with the avatar using:
   - 🎙️ Voice Activity Detection (VAD)
   - 🎧 Push-to-talk
   - ⏺️ Record → Stop → Send

6. To stop Live Mode, click **"Stop Live"**
   - The application calls:
     ```http
     POST /endLiveSession
     ```
     using the returned `LicenseId`

#### Notes

- If the stream opens correctly in a new browser tab but shows a black screen inside the iframe, the Pixel Streaming page is likely blocking embeds via `X-Frame-Options` or CSP `frame-ancestors`.
- If your application is served over HTTPS, the `streamingUrl` must also use HTTPS. Mixed content is blocked by modern browsers.

## 🔧 Technical Details

### WebSocket Message Structure

**Outgoing Text Message**:

```typescript
{
  isLive: false,
  chat_type: "text",
  requestType: "text",
  avatar_id: string,
  user_id: string,
  language: string,
  request: string,
  source: string,
  session?: string
}
```

**Incoming Message**:

```typescript
{
  type: "connection" | "system" | "incoming" | "event",
  content?: string,
  message?: string,
  answer?: string,
  fileUrl?: string,
  file_base64_data?: string,
  timestamp?: string
}
```

### Live Mode (Pixel Streaming)

When Live Mode is enabled, the app can start a Pixel Streaming session via REST and then render the returned `streamingUrl` in an `iframe`.

**Endpoints**:

- `POST /startLiveSession` → returns `{ LicenseId, streamingUrl }`
- `POST /endLiveSession` → ends the session by `LicenseId`

**Common issue (black iframe)**:

- If `streamingUrl` works in a new tab but shows black in an `iframe`, the Pixel Streaming page is likely blocking embeds via `X-Frame-Options` or CSP `frame-ancestors`.
- If your app is served over HTTPS, an `http://` `streamingUrl` can be blocked by the browser (mixed content). Use HTTPS.

### Error Handling

The application handles the following HTTP status codes:

- **403 Forbidden**: Authentication failed, JWT expired or invalid
- **402 Payment Required**: Account balance or payment issue
- **503/504 Service Unavailable**: Automatic retry with exponential backoff (1s, 2s, 4s delays)

### Debug Logging

Enable debug logs by setting `VITE_DEBUG_LOGS=true` in your `.env` file. This will output:

- HTTP requests and responses
- WebSocket connection events
- Message sending and receiving
- Error details

## 🐛 Troubleshooting

### "Failed to get JWT token"

- **Cause**: Invalid API URL or network issue
- **Solution**:
  - Verify your API URL in Settings
  - Check your internet connection
  - Enable debug logs (`VITE_DEBUG_LOGS=true`) to see detailed error messages

### "Failed to load connection"

- **Cause**: JWT token expired or invalid
- **Solution**:
  - Click "Get JWT" again to refresh the token
  - Ensure you got JWT successfully before loading connection

### WebSocket connection fails

- **Cause**: Invalid JWT token or WebSocket URL
- **Solution**:
  - Verify `VITE_RAVATAR_WS_URL` in your `.env` file
  - Ensure JWT token is valid (refresh if needed)
  - Check browser console for WebSocket errors

### "Payment required" error (402)

- **Cause**: Account has insufficient balance or payment issue
- **Solution**: Check your Ravatar account balance and payment status

### Messages not sending

- **Cause**: WebSocket not connected or missing required fields
- **Solution**:
  - Ensure WebSocket status shows 🟢 connected
  - Verify avatar and language are selected in Settings
  - Check browser console for errors

### Pixel Streaming iframe shows a black screen

- Click the **Open** link (new tab). If it works there but not in the iframe, check DevTools Console for `X-Frame-Options` / `frame-ancestors` errors (server-side change required).
- If the app is HTTPS, ensure the `streamingUrl` is also HTTPS (mixed content is blocked).

### Enable Debug Mode

To see detailed logging:

1. Edit `.env` file: `VITE_DEBUG_LOGS=true`
2. Restart development server: `yarn dev`
3. Open browser console (F12)
4. All API and WebSocket events will be logged

## 🔒 Security Notes

- Never commit your `.env` file to version control
- JWT tokens are stored in memory (React state) only
- User IDs are generated and persisted in localStorage
- All API communication uses HTTPS/WSS protocols

## 📦 Technology Stack

- **React 19**: UI library
- **Vite 7**: Build tool and dev server
- **TypeScript 5.9**: Type safety and developer experience
- **Yarn**: Package manager (no npm usage)
- **Native WebSocket API**: Real-time communication
- **Fetch API**: HTTP requests

## 📝 License

MIT

## 🤝 Contributing

Contributions are welcome! Please ensure:

- Use Yarn (not npm) for package management
- Follow existing TypeScript patterns
- Maintain strict type safety
- Add appropriate error handling
- Update documentation for new features
