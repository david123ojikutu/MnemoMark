# Firebase Setup Instructions

To enable authentication and tag syncing, you need to set up a Firebase project and configure it in both applications.

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or select an existing project
3. Follow the setup wizard
4. Enable **Authentication**:
   - Go to Authentication > Sign-in method
   - Enable "Email/Password" provider
   - Save

5. Set up **Firestore Database**:
   - Go to Firestore Database
   - Click "Create database"
   - Start in **test mode** (or production mode with appropriate security rules)
   - Choose a location for your database
   - **Important**: Update the security rules (see Step 6 below)

## Step 2: Get Firebase Configuration

1. In Firebase Console, go to Project Settings (gear icon)
2. Scroll down to "Your apps" section
3. Click the web icon (`</>`) to add a web app
4. Register the app (you can name it "MnemoMark")
5. Copy the Firebase configuration object

## Step 4: Configure Extension

1. Open `Highlighting Extension/firebase-config.js`
2. Replace the placeholder values with your Firebase config:
   ```javascript
   const firebaseConfig = {
     apiKey: "YOUR_ACTUAL_API_KEY",
     authDomain: "your-project-id.firebaseapp.com",
     projectId: "your-project-id",
     storageBucket: "your-project-id.appspot.com",
     messagingSenderId: "YOUR_SENDER_ID",
     appId: "YOUR_APP_ID"
   };
   ```

## Step 4: Configure Desktop App

1. Open `Highlighting Desktop App/firebase-config.js`
2. Replace with the same Firebase config values

## Step 5: Set Firestore Security Rules

In Firebase Console, go to Firestore Database > Rules and use:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only access their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      match /data/{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

**Important:** For production, review and customize these rules based on your security needs.

## Step 6: Test

1. **Extension**: Load the extension in Chrome and try signing up
2. **Desktop App**: Run the desktop app and try signing in with the same credentials
3. Create some tags in one app
4. If "Share tags" was enabled, tags should sync to the other app

## Troubleshooting

- **Authentication not working**: Check that Email/Password provider is enabled in Firebase Console
- **Tags not syncing**: Verify Firestore rules allow read/write for authenticated users
- **CORS errors**: Make sure your Firebase project allows requests from your extension/app domains
- **Config errors**: Double-check that all config values are correctly copied (no extra quotes, spaces, etc.)
- **Extension CSP errors**: If you see CSP errors, make sure you're not trying to load external scripts dynamically

## Important Note for Chrome Extensions (Manifest V3)

**Firebase cannot load via CDN in Manifest V3 extensions** - Chrome blocks external scripts in extension pages for security reasons.

### Current Status
The extension is currently configured to load Firebase from CDN, but **this will not work** due to Manifest V3 restrictions. Firebase authentication features will not function until Firebase is bundled locally.

### Solution: Bundle Firebase Locally

To make Firebase work in your extension, you need to:

1. **Download Firebase SDK files** and place them in your extension folder:
   - Download from: https://www.gstatic.com/firebasejs/10.7.1/
   - Save these files in your extension directory:
     - `firebase-app-compat.js`
     - `firebase-auth-compat.js`
     - `firebase-firestore-compat.js`

2. **Update HTML files** to use local files instead of CDN:
   - In `popup.html` and `homepage.html`, change:
     ```html
     <script src="firebase-app-compat.js"></script>
     <script src="firebase-auth-compat.js"></script>
     <script src="firebase-firestore-compat.js"></script>
     ```
   - Remove the `https://www.gstatic.com/firebasejs/10.7.1/` prefix

3. **Alternative**: Use a bundler like Webpack or Rollup to bundle Firebase into your extension code.

## Notes

- Tags are synced in real-time when sharing is enabled
- Highlights are NOT synced (only tags)
- Each user has their own isolated data in Firestore
- Local tags continue to work even without an account

