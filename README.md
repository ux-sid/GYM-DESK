# GymDesk CRM & Fee Ledger

GymDesk is a complete, production-quality, responsive gym membership CRM and fee-management application designed for Indian gym owners. It handles member onboarding (including camera capture and photo uploads), plan configurations, timezone-safe membership calculations, FIFO fee ledger allocations, GST taxation, WhatsApp templates, and comprehensive reports with SheetJS Excel export/import support. 

GymDesk operates as a Progressive Web App (PWA) supporting offline drafts and real-time syncing using Google Auth and Firestore.

---

## 1. Project Architecture

The application is structured into modular feature sets:
* **Frontend:** React + Vite + TypeScript + Tailwind CSS (Virtus Dark Theme).
* **Backend:** Cloud Firestore (structured rules and composite indexing) and Firebase Storage (private, role-based member pictures).
* **Offline Services:** Firestore Local Cache persistent manager, queueing offline profile modifications, and restricting financial commits to online-validated transactions.
* **Testing Suite:** Vitest for mathematical unit tests, Playwright for end-to-end integration flows.

---

## 2. Prerequisites & Setup

* **Node.js Version:** `v22` or `v24` (LTS versions)
* **Package Manager:** `npm` (v10+)
* **Firebase CLI:** For deploying security rules and running emulators (`npm install -g firebase-tools`)

### Installation

1. Clone the repository and navigate to the directory:
   ```bash
   cd "GymDesk"
   ```
2. Install the mutual dependency packages:
   ```bash
   npm install --legacy-peer-deps
   ```
3. Set up the local environment file:
   ```bash
   cp .env.example .env
   ```

---

## 3. Environment Variables

Configure your local `.env` with the following variables:
```env
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id

# Set to true to connect to local emulators
VITE_USE_FIREBASE_EMULATOR=true
VITE_APP_CHECK_DEBUG_TOKEN=local_debug_token_for_development
```

---

## 4. Firebase Project Setup

### 1. Project Initialization
1. Create a project in the [Firebase Console](https://console.firebase.google.com/).
2. Enable **Google Sign-In** inside the **Authentication** section.
3. Initialize **Cloud Firestore** and choose `Asia/Kolkata` / `Default` settings.
4. Initialize **Firebase Storage** in private mode.
5. Create a Web App within your Firebase project to get the client configuration keys.

### 2. Deploy Security Rules & Indexes
Deploy rules and indexes using the Firebase CLI:
```bash
# Log in to your Google Account
firebase login

# Set active project
firebase use default

# Deploy all security rules and indexes
firebase deploy --only firestore:rules,firestore:indexes,storage
```

---

## 5. Development & Running Services

### Running the Firebase Emulator Suite
Run local emulators for Firestore, Storage, and Authentication:
```bash
firebase emulators:start
```
The emulator UI will be available at `http://localhost:4000`.

### Running the Frontend
Start the local Vite dev server:
```bash
npm run dev
```
Open `http://localhost:5173` to access the application.

---

## 6. Running Tests

### Unit Tests
Run Vitest to verify rounding math, FIFO allocations, and snapshot date arithmetic:
```bash
npm run test
```

### End-to-End Tests
Install Playwright dependencies and run integration tests:
```bash
npx playwright install
npx playwright test
```

---

## 7. Production Build & PWA Deployment

Generate optimized production bundles (HTML, CSS, JS and PWA service-worker cache sheets):
```bash
npm run build
```
The compiled output is saved under the `dist/` folder and is ready to be hosted on Firebase Hosting:
```bash
firebase deploy --only hosting
```

---

## 8. Crucial Operations & Warnings

### Trusted Device Offline Warning
* GymDesk supports Firestore offline caching. 
* Enable caching under **Settings > Offline & Device** only if using a **trusted personal device**.
* **Do not** toggle trusted status on public computers or shared front-desk registers to prevent cached data leaks.

### Aadhaar ID Policy
* GymDesk strictly prohibits storing full Aadhaar numbers or government-issued biometric credentials.
* The Excel bulk importer filters out full Aadhaar columns and issues a privacy warning. Users are allowed to import only the last 4 digits after explicit consent.

### Approximate Billing
* The application runs on free-tier products. Billing charges will only occur if Firestore read/write operations exceed 50,000 document reads/day or Storage uploads exceed 5GB.
